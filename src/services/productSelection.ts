/**
 * Which product in a photo becomes the 3D object — the decision BEFORE the
 * existing pipeline (background removal → 3D), which is not changed.
 *
 * - detectProductRoute(): asks the backend whether the photo clearly shows one
 *   product ('auto' → continue exactly as before) or the user must select it.
 * - Manual path: openProductSelection() hands the photo to the Select Product
 *   screen; on CONFIRM, createSelectionImage() turns the freehand outline into
 *   a local image of just that product, and the caller passes it into the same
 *   existing pipeline as an automatic photo.
 * Nothing here removes backgrounds or generates anything.
 */

import { File, Paths } from 'expo-file-system';

import { apiUploadMultipart, apiUploadMultipartBytes } from './api';

/** The ORIGINAL photo: a local file:// URI, or an analyzed product's saved photo. */
export type PhotoSource = {
  imageUri: string;
  productCheckId?: string | null;
};

export type SelectionReason = 'multiple' | 'uncertain' | 'none' | 'unavailable';

export type ProductRoute =
  | { route: 'auto' }
  | { route: 'select'; reason: SelectionReason; products: string[] };

/** A point normalized to the displayed image (0..1). */
export type NormalizedPoint = { x: number; y: number };

function photoFields(source: PhotoSource): { images: Record<string, string | null>; fields: Record<string, string> } {
  const isLocal = source.imageUri.startsWith('file://');
  if (!isLocal && !source.productCheckId) {
    throw new Error("This photo can't be checked. Please take or choose it again.");
  }
  return {
    images: { image: isLocal ? source.imageUri : null },
    fields: isLocal ? {} : { productCheckId: String(source.productCheckId) },
  };
}

const routeCache = new Map<string, ProductRoute>();

/**
 * Decides automatic vs manual selection. Never throws: if the check itself
 * fails, the user selects (we'd rather ask than convert the wrong object).
 */
export async function detectProductRoute(source: PhotoSource): Promise<ProductRoute> {
  const key = source.productCheckId ? `check:${source.productCheckId}` : source.imageUri;
  const cached = routeCache.get(key);
  if (cached) return cached;
  try {
    const { images, fields } = photoFields(source);
    const result = await apiUploadMultipart<{ route: 'auto' | 'select'; reason: string; products: string[] }>(
      '/product-selection/detect',
      images,
      fields
    );
    const route: ProductRoute =
      result.route === 'auto'
        ? { route: 'auto' }
        : { route: 'select', reason: result.reason as SelectionReason, products: result.products ?? [] };
    routeCache.set(key, route);
    return route;
  } catch (error: any) {
    if (__DEV__) console.warn('[productSelection] detection failed:', error?.message ?? error);
    return { route: 'select', reason: 'unavailable', products: [] };
  }
}

/**
 * Cuts the outlined product out of the ORIGINAL photo (on the backend) and
 * saves it as a new local PNG. The original photo is not modified.
 */
export async function createSelectionImage(source: PhotoSource, polygon: NormalizedPoint[]): Promise<string> {
  const { images, fields } = photoFields(source);
  const bytes = await apiUploadMultipartBytes('/product-selection/crop', images, {
    ...fields,
    polygon: JSON.stringify(polygon.map((p) => ({ x: +p.x.toFixed(4), y: +p.y.toFixed(4) }))),
  });
  const file = new File(Paths.cache, `selected-product-${Date.now()}.png`);
  file.create();
  file.write(new Uint8Array(bytes));
  return file.uri;
}

// ── Hand-off to the Select Product screen ────────────────────────────────────

export type PendingSelection = {
  source: PhotoSource;
  reason: SelectionReason;
  products: string[];
  /** Receives the selected product image (local file) — the caller continues the existing flow with it. */
  onConfirm: (selectedImageUri: string) => void;
};

let pending: PendingSelection | null = null;

export function openProductSelection(selection: PendingSelection) {
  pending = selection;
}

export function getPendingSelection(): PendingSelection | null {
  return pending;
}

export function clearPendingSelection() {
  pending = null;
}
