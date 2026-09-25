/**
 * 3D models of products (backend /api/product-models). The backend owns the
 * whole generation (provider, polling, storage) and guarantees a product
 * photo is only ever generated once — asking again returns the same model.
 */

import { apiGet, apiPost } from './api';

/**
 * Real backend state while generating: waiting for our server's job queue,
 * waiting for a GPU on the provider, generating the shape, building the GLB,
 * downloading it.
 */
export type ProductModelStage = 'starting' | 'queued' | 'running' | 'finishing' | 'downloading';

export type ProductModel = {
  id: string;
  status: 'processing' | 'ready' | 'failed';
  /** Real provider stage while processing. */
  stage: ProductModelStage | null;
  /** Provider-reported progress 0–100, when the provider reports one (TRELLIS.2 doesn't). */
  progress: number | null;
  /** GLB, once ready. */
  modelUrl: string | null;
  message: string | null;
  /** Why it failed, when known — 'quota' = the free daily 3D limit is used up. */
  reason?: string | null;
};

/** Thrown when the server has no 3D provider configured — products stay 2D. */
export class ModelsUnavailableError extends Error {}

/**
 * Returns the model for a product cutout, starting generation only if it was
 * never generated. `retry` re-runs a FAILED model and is only for an explicit
 * user request.
 */
export async function requestProductModel(cutoutId: string, options: { retry?: boolean } = {}): Promise<ProductModel> {
  try {
    return await apiPost<ProductModel>('/product-models', { cutoutId, retry: options.retry === true });
  } catch (error: any) {
    if (error?.status === 503) throw new ModelsUnavailableError(error.message);
    throw error;
  }
}

export function getProductModel(id: string): Promise<ProductModel> {
  return apiGet<ProductModel>(`/product-models/${id}`);
}
