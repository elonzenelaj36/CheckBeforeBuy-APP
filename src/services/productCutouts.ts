/**
 * Product cutouts — transparent PNGs of product photos, used as the movable
 * layers on the Visualization screen. The backend removes the background
 * (POST /api/product-cutouts); which provider it uses is a backend detail.
 *
 * Results are remembered per original photo for the lifetime of the app, and
 * the backend also caches by photo content, so the same photo is processed once.
 */

import { apiUploadMultipart } from './api';

export type ProductCutout = {
  /** Identifies this product photo on the backend (used to request its 3D model). */
  id: string;
  /** Transparent PNG, trimmed to the product. */
  imageUri: string;
  width: number;
  height: number;
};

export type CutoutSource = {
  /** ORIGINAL photo: a local file:// URI, or a backend URL for analyzed products. */
  imageUri: string;
  productCheckId?: string | null;
};

const cache = new Map<string, ProductCutout>();

const cacheKey = (source: CutoutSource) =>
  source.imageUri.startsWith('file://') || !source.productCheckId ? source.imageUri : `check:${source.productCheckId}`;

export async function removeProductBackground(source: CutoutSource): Promise<ProductCutout> {
  const key = cacheKey(source);
  const cached = cache.get(key);
  if (cached) return cached;

  const isLocal = source.imageUri.startsWith('file://');
  if (!isLocal && !source.productCheckId) {
    throw new Error("This product photo can't be prepared. Please take or choose the photo again.");
  }

  const response = await apiUploadMultipart<{ cutoutId: string; cutoutImageUri: string; width: number; height: number }>(
    '/product-cutouts',
    { image: isLocal ? source.imageUri : null },
    isLocal ? undefined : { productCheckId: String(source.productCheckId) }
  );

  const cutout = { id: response.cutoutId, imageUri: response.cutoutImageUri, width: response.width, height: response.height };
  cache.set(key, cutout);
  return cutout;
}
