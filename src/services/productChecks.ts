/**
 * Product Checks service — real AI product analysis, backed by the
 * backend's /api/product-checks (which itself calls Anthropic's Claude
 * vision API — see backend/src/services/aiService.js).
 *
 * Replaces the old services/ai.ts mock. Every check is stored server-side
 * and also becomes a History entry automatically.
 */

import { apiGet, apiPatch, apiPost, apiUploadImage } from './api';

// ── Types ────────────────────────────────────────────────────────────────────

export type PriceAssessment = 'fair' | 'good_deal' | 'overpriced' | 'unknown';
export type Recommendation = 'buy' | 'consider' | 'skip' | 'unknown';

export type ComparisonDecision = 'BUY' | 'COMPARE' | 'SKIP' | 'UNKNOWN';

export type ProductAlternative = {
  title: string | null;
  /** Price reported by the search result (NOT the user's price). Null when none was reliably provided. */
  price: number | null;
  originalPrice: number | null;
  priceMin: number | null;
  priceMax: number | null;
  currency: string | null;
  priceConfidence: 'high' | 'medium' | 'none';
  variantDependent: boolean;
  priceComparisonAvailable: boolean;
  url: string;
  source: string | null;
  /** Where the result comes from (absent on older responses = online store). */
  sourceType?: 'online_store' | 'local_store' | 'social_profile';
  sourcePlatform?: 'web' | 'google_maps' | 'instagram' | 'facebook' | 'tiktok';
  locality: 'city' | 'kosovo' | 'regional' | 'unknown' | 'international';
  localityLabel: string | null;
  matchType: 'strong' | 'similar' | 'general';
  priceDifference: number | null;
  priceDifferencePercent: number | null;
  category: 'same' | 'better_value' | 'better_price' | 'other';
  reason: string;
};

/** A nearby physical store/showroom (Google Maps via the backend). `url` opens the place on Google Maps. */
export type LocalStoreResult = ProductAlternative & {
  sourceType: 'local_store';
  website: string | null;
  address: string | null;
  rating: number | null;
  reviews: number | null;
  placeType: string | null;
};

/** A public social-media business profile. `url` is the profile, or the public post when no profile could be read. */
export type SocialProfileResult = ProductAlternative & {
  sourceType: 'social_profile';
  linkKind: 'profile' | 'post';
  postUrl: string;
  handle: string | null;
  snippet: string | null;
};

type SearchStatus = 'ok' | 'unavailable' | 'not_configured' | 'skipped';

export type ProductComparison = {
  decision: ComparisonDecision;
  title: string;
  summary: string;
  reasoning: string[];
  /** Your price vs the cheapest reliably comparable similar product (same currency), when one is cheaper. */
  highlight: {
    userPrice: number;
    similarPrice: number;
    difference: number;
    differencePercent: number;
    currency: string;
  } | null;
  priceComparisonAvailable: boolean;
  userPrice: number | null;
  currency: string;
  exactMatch: ProductAlternative | null;
  alternatives: ProductAlternative[];
  /** Nearby stores and social profiles (absent on older responses). */
  localStores?: LocalStoreResult[];
  socialProfiles?: SocialProfileResult[];
  search: {
    provider: string;
    status: SearchStatus;
    resultsFound: number;
    pricedResults: number;
    localStatus?: SearchStatus;
    socialStatus?: SearchStatus;
  };
};

/** How the product relates to what was detected in the room the user chose. */
export type RoomFit = {
  relation: 'duplicate' | 'replacement' | 'complement' | 'fills_gap' | 'unclear';
  summary: string;
  relatedItems: string[];
};

export type RoomContextResult = {
  room: { id: string; name: string; roomType: string; kind: 'photo' | '180' | '360' };
  items: {
    name: string;
    category: string;
    count: number;
    confidence: number | null;
    views: number;
    /** detected = high confidence; possible = lower/unknown confidence; listed = added by the user. */
    certainty: 'detected' | 'possible' | 'listed';
  }[];
  /** null if the AI didn't return a usable room assessment. */
  fit: RoomFit | null;
};

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
  /** Only present on the response of the analyze request itself. */
  comparison?: ProductComparison;
  characteristics?: string[];
  /** Only when a room was chosen for the analysis. */
  roomContext?: RoomContextResult | null;
};

/**
 * Uploads a product photo and runs a real AI analysis against it.
 *
 * @param imageUri local (file://) URI of the captured/picked photo
 * @param userPrice optional price the user says the product costs, used to
 *   judge price fairness
 * @param roomId optional room the product is for: its detected items are
 *   taken into account by the analysis
 */
export async function analyzeProduct(
  imageUri: string,
  userPrice?: number,
  productName?: string,
  roomId?: string
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
      ...(roomId ? { roomId } : {}),
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

// ── Find where to buy (external product matches) ───────────────────────────

export type ProductMatch = {
  store: string;
  pageTitle: string | null;
  url: string | null;
};

export type ProductMatchResult = {
  isMock: boolean;
  provider: string | null;
  matches: ProductMatch[];
};

/**
 * Searches the web (via the backend's Vision-based web detection) for real
 * product pages matching this check's photo. Never scrapes or stores
 * anything — an on-demand lookup that just returns links to the original
 * pages so the user can open them.
 */
export async function findProductMatches(
  checkId: string
): Promise<ProductMatchResult> {
  return apiPost<ProductMatchResult>(`/product-checks/${checkId}/matches`, {});
}