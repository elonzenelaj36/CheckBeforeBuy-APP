/**
 * Room service — backend-backed (MySQL, via /api/rooms), with an
 * AsyncStorage cache so the "My Home" screens still show the last known
 * rooms if the network/backend is briefly unavailable.
 *
 * The backend is the source of truth. AsyncStorage here is a read cache
 * only — writes always go to the backend first.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  apiDelete,
  apiGet,
  apiPatch,
  apiPost,
  apiPut,
  apiUploadMultipart,
} from './api';

const ROOMS_CACHE_KEY = '@check_before_buy_rooms_cache_v3';

// ── Types ────────────────────────────────────────────────────────────────────

export type RoomType =
  | 'Living Room'
  | 'Bedroom'
  | 'Kitchen'
  | 'Bathroom'
  | 'Dining Room'
  | 'Office'
  | 'Gaming Room'
  | 'Other';

export const ROOM_TYPES: RoomType[] = [
  'Living Room',
  'Bedroom',
  'Kitchen',
  'Bathroom',
  'Dining Room',
  'Office',
  'Gaming Room',
  'Other',
];

export type RoomPhoto = {
  id: string;
  imageUri: string;
  isPrimary: boolean;
};

export type Room = {
  id: string;
  name: string;
  roomType: RoomType;
  imageUris: string[];
  photos: RoomPhoto[];
  primaryImageUri: string | null;
  createdAt: string;
  updatedAt: string;
};

// Legacy type — kept for backwards compatibility during migration
export type SavedRoom = {
  id: string;
  roomType: string;
  imageUri: string;
  createdAt: string;
};

// ── Cache helpers ────────────────────────────────────────────────────────────

async function readCache(): Promise<Room[]> {
  try {
    const data = await AsyncStorage.getItem(ROOMS_CACHE_KEY);
    return data ? (JSON.parse(data) as Room[]) : [];
  } catch {
    return [];
  }
}

async function writeCache(rooms: Room[]): Promise<void> {
  try {
    await AsyncStorage.setItem(ROOMS_CACHE_KEY, JSON.stringify(rooms));
  } catch (error) {
    console.error('[rooms] Failed to update cache:', error);
  }
}

function findPhotoId(room: Room, imageUri: string): string | null {
  return room.photos.find((p) => p.imageUri === imageUri)?.id ?? null;
}

// ── Read ─────────────────────────────────────────────────────────────────────

export async function getRooms(): Promise<Room[]> {
  try {
    const { rooms } = await apiGet<{ rooms: Room[] }>('/rooms');
    await writeCache(rooms);
    return rooms;
  } catch (error) {
    console.error('[rooms] Failed to load rooms from backend, using cache:', error);
    return readCache();
  }
}

export async function getRoomById(roomId: string): Promise<Room | null> {
  try {
    const { room } = await apiGet<{ room: Room }>(`/rooms/${roomId}`);
    return room;
  } catch (error) {
    console.error('[rooms] Failed to get room by id:', error);
    const cached = await readCache();
    return cached.find((r) => r.id === roomId) ?? null;
  }
}

// ── Create ───────────────────────────────────────────────────────────────────

export type CreateRoomInput = {
  name: string;
  roomType: RoomType;
  imageUri?: string;
};

export async function createRoom(input: CreateRoomInput): Promise<Room> {
  const { room } = await apiUploadMultipart<{ room: Room }>(
    '/rooms',
    { image: input.imageUri },
    { name: input.name.trim(), roomType: input.roomType }
  );

  const cached = await readCache();
  await writeCache([room, ...cached]);

  return room;
}

// ── Update ───────────────────────────────────────────────────────────────────

export type UpdateRoomInput = {
  name?: string;
  roomType?: RoomType;
};

export async function updateRoom(
  roomId: string,
  input: UpdateRoomInput
): Promise<Room | null> {
  const { room } = await apiPut<{ room: Room }>(`/rooms/${roomId}`, input);

  const cached = await readCache();
  await writeCache(cached.map((r) => (r.id === roomId ? room : r)));

  return room;
}

// ── Delete ───────────────────────────────────────────────────────────────────

export async function deleteRoom(roomId: string): Promise<void> {
  try {
    await apiDelete(`/rooms/${roomId}`);
  } catch (error) {
    console.error('[rooms] Failed to delete room:', error);
    return;
  }

  const cached = await readCache();
  await writeCache(cached.filter((r) => r.id !== roomId));
}

// ── Room Photos ──────────────────────────────────────────────────────────────

export async function addRoomPhoto(
  roomId: string,
  imageUri: string
): Promise<Room | null> {
  const { room } = await apiUploadMultipart<{ room: Room }>(
    `/rooms/${roomId}/photos`,
    { image: imageUri },
    {}
  );

  const cached = await readCache();
  await writeCache(cached.map((r) => (r.id === roomId ? room : r)));

  return room;
}

export async function removeRoomPhoto(
  roomId: string,
  imageUri: string
): Promise<Room | null> {
  const room = await getRoomById(roomId);
  const photoId = room ? findPhotoId(room, imageUri) : null;

  if (!photoId) {
    console.error('[rooms] Could not find photo id for', imageUri);
    return room;
  }

  await apiDelete(`/rooms/${roomId}/photos/${photoId}`);
  const { room: updated } = await apiGet<{ room: Room }>(`/rooms/${roomId}`);

  const cached = await readCache();
  await writeCache(cached.map((r) => (r.id === roomId ? updated : r)));

  return updated;
}

// ── AI Room Analysis ─────────────────────────────────────────────────────────

export type DetectedRoomItem = {
  id: string;
  name: string;
  category: string;
  description: string | null;
  imageUri: string | null;
  roomId: string | null;
  source: 'manual' | 'ai';
  createdAt: string;
};

export type AnalyzeRoomResult = {
  items: DetectedRoomItem[];
  totalDetected: number;
  isMock: boolean;
  provider?: string | null;
  message?: string;
};

/**
 * Runs AI analysis over the room's current photos and saves any
 * newly-detected objects to My Items. Safe to call repeatedly — already
 * known items are not re-added (see backend roomController.js#analyzeRoom).
 */
export async function analyzeRoom(roomId: string): Promise<AnalyzeRoomResult> {
  return apiPost<AnalyzeRoomResult>(`/rooms/${roomId}/analyze`, {});
}

export async function setRoomPrimaryPhoto(
  roomId: string,
  imageUri: string
): Promise<Room | null> {
  const room = await getRoomById(roomId);
  const photoId = room ? findPhotoId(room, imageUri) : null;

  if (!photoId) {
    console.error('[rooms] Could not find photo id for', imageUri);
    return room;
  }

  const { room: updated } = await apiPatch<{ room: Room }>(
    `/rooms/${roomId}/photos/${photoId}`,
    { isPrimary: true }
  );

  const cached = await readCache();
  await writeCache(cached.map((r) => (r.id === roomId ? updated : r)));

  return updated;
}
