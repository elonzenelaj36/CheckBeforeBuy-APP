/**
 * Saved Products service — backend-backed (MySQL, via /api/saved-products),
 * with an AsyncStorage read cache for offline/instant-load UX.
 *
 * Products the user has explicitly saved for later reference. Distinct
 * from User Items (things they own) and History (things they've checked).
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

import { apiDelete, apiGet, apiUploadImage } from './api';

const SAVED_PRODUCTS_CACHE_KEY = '@check_before_buy_saved_products_cache_v3';

// ── Types ────────────────────────────────────────────────────────────────────

export type SavedProduct = {
  id: string;
  name: string;
  imageUri: string | null;
  category?: string | null;
  savedAt: string;
  /**
   * The product_checks row this save is linked to, if any. Used to reopen
   * this saved product in "update the existing check" mode instead of
   * "create a new product" mode — see product-captured.tsx.
   */
  productCheckId: string | null;
};

// ── Cache helpers ────────────────────────────────────────────────────────────

async function readCache(): Promise<SavedProduct[]> {
  try {
    const data = await AsyncStorage.getItem(SAVED_PRODUCTS_CACHE_KEY);
    return data ? (JSON.parse(data) as SavedProduct[]) : [];
  } catch {
    return [];
  }
}

async function writeCache(products: SavedProduct[]): Promise<void> {
  try {
    await AsyncStorage.setItem(SAVED_PRODUCTS_CACHE_KEY, JSON.stringify(products));
  } catch (error) {
    console.error('[savedProducts] Failed to update cache:', error);
  }
}

// ── Read ─────────────────────────────────────────────────────────────────────

export const getSavedProducts = async (): Promise<SavedProduct[]> => {
  try {
    const { savedProducts } = await apiGet<{ savedProducts: SavedProduct[] }>(
      '/saved-products'
    );
    await writeCache(savedProducts);
    return savedProducts;
  } catch (error) {
    console.error('[savedProducts] Error loading from backend, using cache:', error);
    return readCache();
  }
};

export const isProductSaved = async (productId: string): Promise<boolean> => {
  const products = await getSavedProducts();
  return products.some((p) => p.id === productId);
};

// ── Create ───────────────────────────────────────────────────────────────────

export type SaveProductInput = {
  /** URI of an already-uploaded (http/https) or local (file://) image. */
  imageUri: string;
  name: string;
  category?: string;
  /**
   * If this product was already checked (came from History, or was just
   * analyzed), pass its product_checks id so the save reuses that check's
   * product instead of creating an unrelated duplicate.
   */
  productCheckId?: string;
};

export const saveProduct = async (
  input: SaveProductInput
): Promise<SavedProduct> => {
  const isRemoteImage = /^https?:\/\//i.test(input.imageUri);

  const saved = await apiUploadImage<SavedProduct>(
    '/saved-products',
    isRemoteImage ? '' : input.imageUri,
    'image',
    {
      name: input.name.trim(),
      ...(input.category ? { category: input.category } : {}),
      ...(input.productCheckId ? { productCheckId: input.productCheckId } : {}),
    }
  );

  const existing = await readCache();
  await writeCache([saved, ...existing.filter((p) => p.id !== saved.id)]);

  return saved;
};

// ── Delete ───────────────────────────────────────────────────────────────────

export const deleteSavedProduct = async (productId: string): Promise<void> => {
  try {
    await apiDelete(`/saved-products/${productId}`);
  } catch (error) {
    console.error('[savedProducts] Error deleting:', error);
    return;
  }

  const existing = await readCache();
  await writeCache(existing.filter((product) => product.id !== productId));
};
