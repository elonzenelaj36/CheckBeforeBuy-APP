/**
 * User Items service — items the user already owns, backed by the
 * backend's /api/items. Used by the AI product-check flow to flag
 * potentially redundant purchases.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

import { apiDelete, apiGet, apiUploadMultipart, apiPut } from './api';

const USER_ITEMS_CACHE_KEY = '@check_before_buy_user_items_cache_v2';

// ── Types ────────────────────────────────────────────────────────────────────

export type UserItem = {
  id: string;
  name: string;
  imageUri: string | null;
  roomId: string | null;
  category: string;
  createdAt: string;
};

// ── Cache helpers ────────────────────────────────────────────────────────────

async function readCache(): Promise<UserItem[]> {
  try {
    const data = await AsyncStorage.getItem(USER_ITEMS_CACHE_KEY);
    return data ? (JSON.parse(data) as UserItem[]) : [];
  } catch {
    return [];
  }
}

async function writeCache(items: UserItem[]): Promise<void> {
  try {
    await AsyncStorage.setItem(USER_ITEMS_CACHE_KEY, JSON.stringify(items));
  } catch (error) {
    console.error('[userItems] Failed to update cache:', error);
  }
}

// ── Read ─────────────────────────────────────────────────────────────────────

export async function getUserItems(): Promise<UserItem[]> {
  try {
    const { items } = await apiGet<{ items: UserItem[] }>('/items');
    await writeCache(items);
    return items;
  } catch (error) {
    console.error('[userItems] Failed to load from backend, using cache:', error);
    return readCache();
  }
}

export async function getUserItemsForRoom(roomId: string): Promise<UserItem[]> {
  try {
    const { items } = await apiGet<{ items: UserItem[] }>(
      `/items?roomId=${encodeURIComponent(roomId)}`
    );
    return items;
  } catch (error) {
    console.error('[userItems] Failed to load room items from backend:', error);
    const all = await readCache();
    return all.filter((item) => item.roomId === roomId);
  }
}

// ── Create ───────────────────────────────────────────────────────────────────

export type CreateUserItemInput = {
  name: string;
  imageUri?: string | null;
  roomId?: string | null;
  category?: string;
};

export async function createUserItem(input: CreateUserItemInput): Promise<UserItem> {
  const item = await apiUploadMultipart<UserItem>(
    '/items',
    { image: input.imageUri },
    {
      name: input.name.trim(),
      category: input.category ?? 'Other',
      ...(input.roomId ? { roomId: input.roomId } : {}),
    }
  );

  const existing = await readCache();
  await writeCache([item, ...existing]);

  return item;
}

// ── Update ───────────────────────────────────────────────────────────────────

export type UpdateUserItemInput = {
  name?: string;
  category?: string;
  roomId?: string | null;
};

export async function updateUserItem(
  itemId: string,
  input: UpdateUserItemInput
): Promise<UserItem> {
  const item = await apiPut<UserItem>(`/items/${itemId}`, input);

  const existing = await readCache();
  await writeCache(existing.map((i) => (i.id === itemId ? item : i)));

  return item;
}

// ── Delete ───────────────────────────────────────────────────────────────────

export async function deleteUserItem(itemId: string): Promise<void> {
  try {
    await apiDelete(`/items/${itemId}`);
  } catch (error) {
    console.error('[userItems] Failed to delete:', error);
    return;
  }

  const existing = await readCache();
  await writeCache(existing.filter((item) => item.id !== itemId));
}
