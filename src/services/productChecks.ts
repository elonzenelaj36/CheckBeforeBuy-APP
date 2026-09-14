/**
 * Product Checks service — real AI product analysis, backed by the
 * backend's /api/product-checks (which itself calls Anthropic's Claude
 * vision API — see backend/src/services/aiService.js).
 *
 * Replaces the old services/ai.ts mock. Every check is stored server-side
 * and also becomes a History entry automatically.
 */

import { apiGet, apiPatch, apiUploadImage } from './api';

// ── Types ────────────────────────────────────────────────────────────────────

export type PriceAssessment = 'fair' | 'good_deal' | 'overpriced' | 'unknown';
export type Recommendation = 'buy' | 'consider' | 'skip' | 'unknown';

export type ProductCheckResult = {
  id: string;
  product: {
    id: string | null;
    name: string | null;
    category: string | null;
    brand: string | null;
  };
  analysis: {
    description: string | null;
    estimatedPrice: number | null;
    estimatedPriceMin: number | null;
    estimatedPriceMax: number | null;
    currency: string;
    userPrice: number | null;
    priceAssessment: PriceAssessment;
    recommendation: Recommendation;
    confidence: number | null;
    /** true if the backend has no AI_API_KEY configured (demo/mock mode). */
    isMock: boolean;
  };
  imageUrl: string | null;
  hasVisualization: boolean;
  createdAt: string;
};

/**
 * Uploads a product photo and runs a real AI analysis against it.
 *
 * @param imageUri local (file://) URI of the captured/picked photo
 * @param userPrice optional price the user says the product costs, used to
 *   judge price fairness
 */
export async function analyzeProduct(
  imageUri: string,
  userPrice?: number,
  productName?: string
): Promise<ProductCheckResult> {
  return apiUploadImage<ProductCheckResult>(
    '/product-checks',
    imageUri,
    'image',
    {
      ...(userPrice !== undefined
        ? { userPrice: String(userPrice) }
        : {}),
      ...(productName?.trim()
        ? { productName: productName.trim() }
        : {}),
    }
  );
}

export async function getProductChecks(): Promise<ProductCheckResult[]> {
  const { productChecks } = await apiGet<{ productChecks: ProductCheckResult[] }>(
    '/product-checks'
  );
  return productChecks;
}

export async function getProductCheck(id: string): Promise<ProductCheckResult> {
  return apiGet<ProductCheckResult>(`/product-checks/${id}`);
}




export async function updateProductCheckName(
  id: string,
  name: string
): Promise<ProductCheckResult> {
  return apiPatch<ProductCheckResult>(`/product-checks/${id}`, {
    name: name.trim(),
  });
}