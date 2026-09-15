/**
 * Find for My Home service — backed by the backend's
 * /api/find-for-my-home, which reasons over the user's actual rooms and
 * AI-detected My Items to recommend real (or, until a real product source
 * is connected, clearly-marked mock) products that would genuinely
 * complement their home — never just "here is furniture".
 */

import { apiPost } from './api';

// ── Types ────────────────────────────────────────────────────────────────────

export type RecommendedProduct = {
  id: string;
  name: string;
  category: string;
  price: number | null;
  currency: string;
  store: string;
  color: string | null;
  material: string | null;
  dimensions: string | null;
  imageUrl: string | null;
  productUrl: string | null;
  availability: string | null;
  reason: string;
};

export type FindForMyHomeLocation = {
  city: string | null;
  region?: string | null;
  country?: string | null;
  source: 'manual' | 'ip' | 'unknown';
};

export type FindForMyHomeResult = {
  summary: string;
  isMock: boolean;
  location: FindForMyHomeLocation;
  recommendations: RecommendedProduct[];
};

export type FindForMyHomeInput = {
  category?: string;
  budget?: number;
  /** Manual city override — takes priority over IP-based location. */
  city?: string;
};

export async function findForMyHome(
  input: FindForMyHomeInput
): Promise<FindForMyHomeResult> {
  return apiPost<FindForMyHomeResult>('/find-for-my-home', input);
}
