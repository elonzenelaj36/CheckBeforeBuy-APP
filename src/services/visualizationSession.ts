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
 * - Generation goes through backend POST /generated-images/session,
 *   which calls the existing Cloudflare image-generation service.
 * - Every product also has an editable `transform` (its layer on the room
 *   photo). Moving/resizing/rotating/selecting only changes this local state —
 *   it never calls the generation API. Only regenerateSession() does.
 * - Each product's layer shows a transparent `cutout` of its photo. It is
 *   prepared once, in the background, when the product joins the session
 *   (see productCutouts.ts). Generation still uses the ORIGINAL photo.
 */

import React from 'react';

import { File } from 'expo-file-system';

import { apiUploadMultipart } from './api';
import { removeProductBackground } from './productCutouts';

const SESSION_TTL_MS = 2 * 60 * 60 * 1000;
export const MAX_SESSION_PRODUCTS = 8;

// ── Types ────────────────────────────────────────────────────────────────────

export type SessionRoom = {
  id: string;
  name: string;
  roomType: string;
  imageUri: string | null;
};

/**
 * A product's layer on the room photo, in coordinates normalized to the ROOM
 * IMAGE (0..1), so it renders the same at any screen size.
 */
export type ProductTransform = {
  /** Center of the layer. */
  x: number;
  y: number;
  /** Layer width as a fraction of the room image width; height follows `aspect`. */
  width: number;
  /** Radians. */
  rotation: number;
  /** Product photo width / height (1 until the photo has loaded). */
  aspect: number;
  zIndex: number;
  /** True once the user has moved/resized/rotated it — only then is the position sent to the AI as a hint. */
  placed: boolean;
};

export const MIN_LAYER_WIDTH = 0.08;
export const MAX_LAYER_WIDTH = 0.9;

export type SessionCutout =
  | { status: 'pending' }
  | { status: 'ready'; imageUri: string }
  | { status: 'failed'; message: string };

export type SessionProduct = {
  /** Unique within the session (the same product may be added twice). */
  id: string;
  transform: ProductTransform;
  /** Transparent version of the photo shown as the layer. */
  cutout: SessionCutout;
  /** ORIGINAL photo — sent to generation, never replaced by the cutout. */
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
  /** generated_images row id — Save attaches the layout to it. */
  id: string;
  /** The latest generated image. Never used as an input — regeneration always starts from the originals. */
  imageUri: string;
  productsUsed: number;
  generatedAt: string;
};

export type VisualizationSession = {
  id: string;
  room: SessionRoom;
  /** Stable order — this is the order used in the generation prompt. */
  products: SessionProduct[];
  generation: SessionGeneration | null;
  selectedProductId: string | null;
  createdAt: string;
};

export type NewSessionProduct = Omit<SessionProduct, 'id' | 'transform' | 'cutout'>;

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

/** New layers are staggered across the lower middle of the room so they don't stack exactly. */
function defaultTransform(index: number, zIndex: number): ProductTransform {
  const column = index % 3;
  const row = Math.floor(index / 3) % 2;
  return {
    x: 0.3 + column * 0.2,
    y: 0.58 + row * 0.16,
    width: 0.3,
    rotation: 0,
    aspect: 1,
    zIndex,
    placed: false,
  };
}

function topZIndex(products: SessionProduct[]): number {
  return products.reduce((max, p) => Math.max(max, p.transform.zIndex), 0);
}

export function startSession(room: SessionRoom, firstProduct?: NewSessionProduct): VisualizationSession {
  const first: SessionProduct | null = firstProduct
    ? { ...firstProduct, id: nextId('product'), transform: defaultTransform(0, 1), cutout: { status: 'pending' } }
    : null;
  const session: VisualizationSession = {
    id: nextId('session'),
    room,
    products: first ? [first] : [],
    generation: null,
    selectedProductId: first?.id ?? null,
    createdAt: new Date().toISOString(),
  };
  commit(session);
  if (first) void prepareCutout(first.id);
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
    transform: defaultTransform(session.products.length, topZIndex(session.products) + 1),
    cutout: { status: 'pending' },
  };
  // The new product is selected so the user can position it right away.
  commit({ ...session, products: [...session.products, product], selectedProductId: product.id });
  void prepareCutout(product.id);
  return { ok: true, product };
}

/** Removes from THIS session only — saved products/history are untouched. */
export function removeProduct(productId: string) {
  const session = getSession();
  if (!session) return;
  commit({
    ...session,
    products: session.products.filter((p) => p.id !== productId),
    selectedProductId: session.selectedProductId === productId ? null : session.selectedProductId,
  });
}

/** Selects a layer and brings it to the front. null deselects. Local only. */
export function selectProduct(productId: string | null) {
  const session = getSession();
  if (!session || session.selectedProductId === productId) return;
  const top = topZIndex(session.products);
  commit({
    ...session,
    selectedProductId: productId,
    products: session.products.map((p) =>
      p.id === productId && p.transform.zIndex < top ? { ...p, transform: { ...p.transform, zIndex: top + 1 } } : p
    ),
  });
}

/**
 * Stores a layer's transform. Called once at the END of a gesture (never per
 * frame) and when a product photo reports its aspect ratio. Local only.
 */
export function updateProductTransform(productId: string, patch: Partial<ProductTransform>) {
  const session = getSession();
  if (!session) return;
  commit({
    ...session,
    products: session.products.map((p) =>
      p.id === productId ? { ...p, transform: { ...p.transform, ...patch } } : p
    ),
  });
}

function patchProduct(sessionId: string, productId: string, patch: (p: SessionProduct) => SessionProduct) {
  const session = getSession();
  if (!session || session.id !== sessionId) return; // started over meanwhile
  commit({ ...session, products: session.products.map((p) => (p.id === productId ? patch(p) : p)) });
}

/**
 * Removes the background of a product's ORIGINAL photo so its layer is a
 * clean cutout. Runs once per product (the result is cached per photo); a
 * failure only marks the product — the session and other products are kept,
 * and the user can retry with retryCutout().
 */
async function prepareCutout(productId: string) {
  const session = getSession();
  const product = session?.products.find((p) => p.id === productId);
  if (!session || !product || product.cutout.status === 'ready') return;

  patchProduct(session.id, productId, (p) => ({ ...p, cutout: { status: 'pending' } }));
  try {
    const cutout = await removeProductBackground({ imageUri: product.imageUri, productCheckId: product.productCheckId });
    patchProduct(session.id, productId, (p) => ({
      ...p,
      cutout: { status: 'ready', imageUri: cutout.imageUri },
      transform: { ...p.transform, aspect: cutout.width / cutout.height },
    }));
  } catch (error: any) {
    if (__DEV__) console.warn('[visualization] background removal failed:', error?.message ?? error);
    patchProduct(session.id, productId, (p) => ({
      ...p,
      cutout: {
        status: 'failed',
        message: error?.message || "We couldn't remove the product background. Please try again.",
      },
    }));
  }
}

/** User-requested retry after a failed background removal. */
export function retryCutout(productId: string) {
  void prepareCutout(productId);
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

/** What the generation service receives: ORIGINAL images, array of products. */
export type GenerationPayload = {
  roomImage: string | null;
  roomType: string;
  products: {
    image: string;
    name: string;
    category?: string | null;
    brand?: string | null;
    model?: string | null;
    characteristics?: string[];
    /** Only for layers the user arranged: where it should go (normalized to the room image). */
    placement?: { x: number; y: number; width: number };
  }[];
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
      ...(p.transform.placed
        ? { placement: { x: round3(p.transform.x), y: round3(p.transform.y), width: round3(p.transform.width) } }
        : {}),
    })),
  };
}

const round3 = (n: number) => Math.round(n * 1000) / 1000;

/** What Save stores with the generated image: enough to understand/rebuild the composition. */
export function buildLayout(session: VisualizationSession) {
  return {
    version: 1,
    sessionId: session.id,
    room: { id: session.room.id, name: session.room.name, roomType: session.room.roomType },
    products: session.products.map((p) => ({
      name: p.name,
      category: p.category ?? null,
      brand: p.brand ?? null,
      productCheckId: p.productCheckId ?? null,
      cutoutImageUri: p.cutout.status === 'ready' ? p.cutout.imageUri : null,
      transform: {
        x: round3(p.transform.x),
        y: round3(p.transform.y),
        width: round3(p.transform.width),
        rotation: round3(p.transform.rotation),
        aspect: round3(p.transform.aspect),
        zIndex: p.transform.zIndex,
      },
    })),
    generatedAt: session.generation?.generatedAt ?? null,
    savedAt: new Date().toISOString(),
  };
}

export type RegenerateResult = { ok: true } | { ok: false; message: string };

/**
 * Validates the session, logs the payload,
 * uploads the original photos to the backend, which calls the Cloudflare service, and stores the result.
 */
export async function regenerateSession(): Promise<RegenerateResult> {
  const session = getSession();
  if (!session) return { ok: false, message: 'This visualization session has expired. Please start again.' };
  if (!session.room.id) return { ok: false, message: 'No room is selected for this visualization.' };
  if (session.products.length === 0) return { ok: false, message: 'Add at least one product first.' };

  const payload = buildGenerationPayload(session);
  if (__DEV__) {
    console.log(`[visualization] generating: room + ${payload.products.length} product(s)`, JSON.stringify(payload, null, 2));
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
      status?: 'pending' | 'completed' | 'failed';
      id: string;
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

    if (response.status !== 'completed' || !response.generatedImage) {
      return {
        ok: false,
        message:
          response.message ||
          (response.status === 'pending'
            ? 'Image generation is not configured on the server yet.'
            : "Couldn't generate the visualization. Please try again."),
      };
    }

    commit({
      ...latest,
      generation: {
        id: response.id,
        imageUri: response.generatedImage,
        productsUsed: response.productsUsed,
        generatedAt: new Date().toISOString(),
      },
    });
    return { ok: true };
  } catch (error: any) {
    return { ok: false, message: error?.message ?? "Couldn't generate the visualization. Please try again." };
  }
}
