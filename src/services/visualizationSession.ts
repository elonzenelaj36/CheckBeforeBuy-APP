/**
 * Visualization session — the TEMPORARY "one room + N products" scene the
 * user is building on the Visualization screen.
 *
 * - Lives in memory only (a module-level store). Nothing here touches the
 *   database, saved rooms/products or history, so abandoned sessions cost
 *   nothing and "start over" can never delete real data.
 * - Screens read it with useVisualizationSession(), so it survives
 *   visualization → check-product (camera) → visualization without
 *   putting images in route params.
 * - `room.imageUri` and every `product.imageUri` are the ORIGINAL images and
 *   are never replaced by the generated one, so regeneration always starts
 *   from originals.
 * - Generation goes through backend POST /generated-images/session, which is a
 *   mock unless VISUALIZATION_MOCK=false is set in backend/.env.
 */

import React from 'react';

import { File } from 'expo-file-system';

import { apiUploadMultipart } from './api';

const SESSION_TTL_MS = 2 * 60 * 60 * 1000;
export const MAX_SESSION_PRODUCTS = 8;

// ── Types ────────────────────────────────────────────────────────────────────

export type SessionRoom = {
  id: string;
  name: string;
  roomType: string;
  imageUri: string | null;
};

export type SessionProduct = {
  /** Unique within the session (the same product may be added twice). */
  id: string;
  imageUri: string;
  name: string;
  category?: string | null;
  brand?: string | null;
  model?: string | null;
  characteristics?: string[];
  /** Existing product check, when the product was analyzed. */
  productCheckId?: string | null;
};

export type SessionGeneration = {
  /** true = placeholder from the mock layer, NOT an AI image. */
  mock: boolean;
  /** Placeholder shown until real generation exists (the original room photo). */
  imageUri: string | null;
  productsUsed: number;
  generatedAt: string;
};

export type VisualizationSession = {
  id: string;
  room: SessionRoom;
  /** Stable order — this is the order used in the generation prompt. */
  products: SessionProduct[];
  generation: SessionGeneration | null;
  createdAt: string;
};

export type NewSessionProduct = Omit<SessionProduct, 'id'>;

// ── Store ────────────────────────────────────────────────────────────────────

let current: VisualizationSession | null = null;
const listeners = new Set<() => void>();
let idCounter = 0;

function nextId(prefix: string): string {
  idCounter += 1;
  return `${prefix}-${Date.now().toString(36)}-${idCounter}`;
}

function commit(next: VisualizationSession | null) {
  current = next;
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getSession(): VisualizationSession | null {
  if (current && Date.now() - new Date(current.createdAt).getTime() > SESSION_TTL_MS) {
    commit(null); // expired
  }
  return current;
}

/** Re-renders when the session changes. null = no (or an expired) session. */
export function useVisualizationSession(): VisualizationSession | null {
  return React.useSyncExternalStore(subscribe, getSession, getSession);
}

// ── Actions ──────────────────────────────────────────────────────────────────

export function startSession(room: SessionRoom, firstProduct?: NewSessionProduct): VisualizationSession {
  const session: VisualizationSession = {
    id: nextId('session'),
    room,
    products: firstProduct ? [{ ...firstProduct, id: nextId('product') }] : [],
    generation: null,
    createdAt: new Date().toISOString(),
  };
  commit(session);
  return session;
}

export type AddProductResult =
  | { ok: true; product: SessionProduct }
  | { ok: false; reason: 'no-session' | 'invalid-image' | 'limit-reached'; message: string };

/** Original file is checked for existence, but the product is only stored, never re-encoded. */
export function addProduct(input: NewSessionProduct): AddProductResult {
  const session = getSession();
  if (!session) {
    return {
      ok: false,
      reason: 'no-session',
      message: 'This visualization session has expired. Please start again from your room.',
    };
  }
  if (!input.imageUri || !isUsableImage(input.imageUri)) {
    return { ok: false, reason: 'invalid-image', message: "We couldn't read that photo. Please try another one." };
  }
  if (session.products.length >= MAX_SESSION_PRODUCTS) {
    return {
      ok: false,
      reason: 'limit-reached',
      message: `You can place up to ${MAX_SESSION_PRODUCTS} products in one room.`,
    };
  }

  const product: SessionProduct = {
    ...input,
    id: nextId('product'),
    name: input.name.trim() || `Product ${session.products.length + 1}`,
  };
  commit({ ...session, products: [...session.products, product] });
  return { ok: true, product };
}

/** Removes from THIS session only — saved products/history are untouched. */
export function removeProduct(productId: string) {
  const session = getSession();
  if (!session) return;
  commit({ ...session, products: session.products.filter((p) => p.id !== productId) });
}

/** Clears the temporary session only. Saved rooms/products/history are untouched. */
export function clearSession() {
  commit(null);
}

function isUsableImage(uri: string): boolean {
  if (uri.startsWith('file://')) {
    try {
      return new File(uri).exists;
    } catch {
      return false;
    }
  }
  return /^https?:\/\//.test(uri);
}

// ── Generation ────────────────────────────────────────────────────────

/** What the future image-generation provider will receive: ORIGINAL images, array of products. */
export type GenerationPayload = {
  roomImage: string | null;
  roomType: string;
  products: { image: string; name: string; category?: string | null; brand?: string | null; model?: string | null; characteristics?: string[] }[];
};

export function buildGenerationPayload(session: VisualizationSession): GenerationPayload {
  return {
    roomImage: session.room.imageUri,
    roomType: session.room.roomType,
    products: session.products.map((p) => ({
      image: p.imageUri,
      name: p.name,
      category: p.category,
      brand: p.brand,
      model: p.model,
      characteristics: p.characteristics,
    })),
  };
}

export type RegenerateResult = { ok: true } | { ok: false; message: string };

/**
 * Validates the session, logs the payload the real provider will later get,
 * uploads the original photos to the backend (mock or real, decided there) and stores the result.
 */
export async function regenerateSession(): Promise<RegenerateResult> {
  const session = getSession();
  if (!session) return { ok: false, message: 'This visualization session has expired. Please start again.' };
  if (!session.room.id) return { ok: false, message: 'No room is selected for this visualization.' };
  if (session.products.length === 0) return { ok: false, message: 'Add at least one product first.' };

  const payload = buildGenerationPayload(session);
  if (__DEV__) {
    console.log(
      `[visualization] requesting generation with ${payload.products.length} product(s) + room (backend decides mock vs real):`,
      JSON.stringify(payload, null, 2)
    );
  }

  try {
    // Only ORIGINAL local photos are uploaded (file://). Products that were
    // already analyzed have a saved photo on the backend, referenced by
    // productCheckId. The room's saved primary photo is used server-side.
    const images: Record<string, string> = {};
    session.products.forEach((p, i) => {
      if (p.imageUri.startsWith('file://') && !p.productCheckId) images[`productImage${i}`] = p.imageUri;
    });

    const response = await apiUploadMultipart<{
      success: boolean;
      mock: boolean;
      status?: 'pending' | 'completed' | 'failed';
      generatedImage: string | null;
      productsUsed: number;
      message?: string | null;
    }>('/generated-images/session', images, {
      roomId: session.room.id,
      products: JSON.stringify(
        payload.products.map(({ image: _image, ...meta }, i) => ({
          ...meta,
          ...(session.products[i].productCheckId ? { productCheckId: session.products[i].productCheckId } : {}),
        }))
      ),
    });

    // The user may have started over / edited while we waited.
    const latest = getSession();
    if (!latest || latest.id !== session.id) return { ok: false, message: 'The session changed. Please try again.' };

    if (!response.mock && !(response.status === 'completed' && response.generatedImage)) {
      return {
        ok: false,
        message:
          response.message ||
          (response.status === 'pending'
            ? 'Image generation is not configured on the server yet.'
            : "We couldn't generate this visualization. Please try again."),
      };
    }

    commit({
      ...latest,
      generation: {
        mock: response.mock,
        // Mock: original room photo as placeholder. Real: the generated image.
        imageUri: response.mock ? session.room.imageUri : response.generatedImage,
        productsUsed: response.productsUsed,
        generatedAt: new Date().toISOString(),
      },
    });
    return { ok: true };
  } catch (error: any) {
    return { ok: false, message: error?.message ?? 'Visualization is unavailable right now.' };
  }
}
