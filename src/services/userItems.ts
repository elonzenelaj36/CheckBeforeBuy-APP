/**
 * User Items service — items the user already owns, backed by the
 * backend's /api/items. Populated automatically by AI room analysis (see
 * services/rooms.ts#analyzeRoom) rather than manual entry. Used by the AI
 * product-check flow to flag potentially redundant purchases, and by Find
 * for My Home to understand what the user already has.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

import { apiDelete, apiGet, apiPut } from './api';

const USER_ITEMS_CACHE_KEY = '@check_before_buy_user_items_cache_v2';

// ── Types ────────────────────────────────────────────────────────────────────

export type UserItem = {
  id: string;
  name: string;
  description: string | null;
  imageUri: string | null;
  roomId: string | null;
  category: string;
  source: 'manual' | 'ai';
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

export async function getUserItemsForRoom(roomId: string): Promise<UserItem[]> {
  try {
    const { items } = await apiGet<{ items: UserItem[] }>(
      `/items?roomId=${encodeURIComponent(roomId)}`
    );

    // Merge into the cache (replacing this room's prior entries) so the
    // offline fallback below stays useful room-by-room even though nothing
    // fetches the user's full item list anymore — items are always viewed
    // per-room now.
    const existing = await readCache();
    const otherRooms = existing.filter((item) => item.roomId !== roomId);
    await writeCache([...items, ...otherRooms]);

    return items;
  } catch (error) {
    console.error('[userItems] Failed to load room items from backend:', error);
    const all = await readCache();
    return all.filter((item) => item.roomId === roomId);
  }
}

// ── Update ───────────────────────────────────────────────────────────────────
// Items are detected automatically (see services/rooms.ts#analyzeRoom) — My
// Items intentionally has no manual-create flow. Editing a detected item's
// name/category is still useful and doesn't conflict with that, so it stays.

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
