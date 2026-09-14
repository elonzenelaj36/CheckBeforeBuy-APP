/**
 * History service — the products a user has checked, backed by the
 * backend's /api/history (which is a view over product_checks: every real
 * AI analysis is, by definition, a checked product — there is no separate
 * "just captured, not analyzed" history entry, since that wouldn't be a
 * real check yet).
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

import { apiDelete, apiGet } from './api';

const HISTORY_CACHE_KEY = '@check_before_buy_history_cache_v2';

// ── Types ────────────────────────────────────────────────────────────────────

export type CheckedProduct = {
  id: string;
  name: string;
  imageUri: string | null;
  checkedAt: string;
  hasAnalysis: boolean;
  hasVisualization: boolean;
};

// ── Cache helpers ────────────────────────────────────────────────────────────

async function readCache(): Promise<CheckedProduct[]> {
  try {
    const data = await AsyncStorage.getItem(HISTORY_CACHE_KEY);
    return data ? (JSON.parse(data) as CheckedProduct[]) : [];
  } catch {
    return [];
  }
}

async function writeCache(items: CheckedProduct[]): Promise<void> {
  try {
    await AsyncStorage.setItem(HISTORY_CACHE_KEY, JSON.stringify(items));
  } catch (error) {
    console.error('[history] Failed to update cache:', error);
  }
}

// ── Read ─────────────────────────────────────────────────────────────────────

export async function getHistory(): Promise<CheckedProduct[]> {
  try {
    const { history } = await apiGet<{ history: CheckedProduct[] }>('/history');
    await writeCache(history);
    return history;
  } catch (error) {
    console.error('[history] Failed to load from backend, using cache:', error);
    return readCache();
  }
}

// ── Delete ───────────────────────────────────────────────────────────────────

/**
 * Permanently deletes every product check (and therefore every history
 * entry) for the current user.
 */
export async function clearHistory(): Promise<void> {
  await apiDelete('/product-checks');
  await AsyncStorage.removeItem(HISTORY_CACHE_KEY);
}

// ── Legacy no-ops ────────────────────────────────────────────────────────────
// Older screens used to write history entries locally before a product was
// actually analyzed. History entries are now created server-side as part of
// POST /api/product-checks, so these are intentionally unused.

export type AddToHistoryInput = {
  name: string;
  imageUri: string;
  hasAnalysis?: boolean;
  hasVisualization?: boolean;
};
