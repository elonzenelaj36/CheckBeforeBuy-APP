/**
 * Generated Images service — room visualizations, backed by the backend's
 * /api/generated-images.
 *
 * Generation itself may come back with status "pending" if no image AI
 * provider is configured on the backend yet (see backend/README.md). This
 * service surfaces that status as-is rather than pretending a real image
 * was generated — screens are expected to handle all three states
 * (pending / completed / failed).
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

import { apiDelete, apiGet, apiUploadMultipart } from './api';

const GENERATED_IMAGES_CACHE_KEY = '@check_before_buy_generated_images_cache_v2';

// ── Types ────────────────────────────────────────────────────────────────────

export type GeneratedImageStatus = 'pending' | 'completed' | 'failed';

export type GeneratedImage = {
  id: string;
  roomId: string;
  roomName: string | null;
  productImageUri: string | null;
  roomImageUri: string | null;
  productName: string | null;
  /** null while status is "pending" or "failed". */
  generatedImageUri: string | null;
  status: GeneratedImageStatus;
  createdAt: string;
};

type CreateGeneratedImageResponse = GeneratedImage & { message?: string | null };

// ── Cache helpers ────────────────────────────────────────────────────────────

async function readCache(): Promise<GeneratedImage[]> {
  try {
    const data = await AsyncStorage.getItem(GENERATED_IMAGES_CACHE_KEY);
    return data ? (JSON.parse(data) as GeneratedImage[]) : [];
  } catch {
    return [];
  }
}

async function writeCache(images: GeneratedImage[]): Promise<void> {
  try {
    await AsyncStorage.setItem(GENERATED_IMAGES_CACHE_KEY, JSON.stringify(images));
  } catch (error) {
    console.error('[generatedImages] Failed to update cache:', error);
  }
}

// ── Read ─────────────────────────────────────────────────────────────────────

export async function getGeneratedImages(): Promise<GeneratedImage[]> {
  try {
    const { generatedImages } = await apiGet<{ generatedImages: GeneratedImage[] }>(
      '/generated-images'
    );
    await writeCache(generatedImages);
    return generatedImages;
  } catch (error) {
    console.error('[generatedImages] Failed to load from backend, using cache:', error);
    return readCache();
  }
}

export async function getGeneratedImagesForRoom(
  roomId: string
): Promise<GeneratedImage[]> {
  try {
    const { generatedImages } = await apiGet<{ generatedImages: GeneratedImage[] }>(
      `/generated-images/room/${roomId}`
    );
    return generatedImages;
  } catch (error) {
    console.error('[generatedImages] Failed to load room images from backend:', error);
    const all = await readCache();
    return all.filter((img) => img.roomId === roomId);
  }
}

// ── Create ───────────────────────────────────────────────────────────────────

export type RequestVisualizationInput = {
  roomId: string;
  productName: string;
  /** Local (file://) product photo URI — omit if productCheckId already has one on the backend. */
  productImageUri?: string | null;
  /** Local (file://) room photo URI — omit to use the room's saved primary photo. */
  roomImageUri?: string | null;
  /** Links this visualization back to an existing AI product check. */
  productCheckId?: string | null;
};

export async function requestRoomVisualization(
  input: RequestVisualizationInput
): Promise<CreateGeneratedImageResponse> {
  const result = await apiUploadMultipart<CreateGeneratedImageResponse>(
    '/generated-images',
    {
      productImage: input.productImageUri,
      roomImage: input.roomImageUri,
    },
    {
      roomId: input.roomId,
      productName: input.productName,
      ...(input.productCheckId ? { productCheckId: input.productCheckId } : {}),
    }
  );

  const existing = await readCache();
  await writeCache([result, ...existing]);

  return result;
}

// ── Delete ───────────────────────────────────────────────────────────────────

export async function deleteGeneratedImage(imageId: string): Promise<void> {
  try {
    await apiDelete(`/generated-images/${imageId}`);
  } catch (error) {
    console.error('[generatedImages] Failed to delete:', error);
    return;
  }

  const existing = await readCache();
  await writeCache(existing.filter((img) => img.id !== imageId));
}

/**
 * Best-effort cleanup of a room's generated images. In practice the backend
 * already cascades this automatically when the room itself is deleted
 * (foreign key ON DELETE CASCADE), so this is mainly useful if a room's
 * images need clearing without deleting the room.
 */
export async function deleteGeneratedImagesForRoom(roomId: string): Promise<void> {
  try {
    const images = await getGeneratedImagesForRoom(roomId);
    await Promise.all(images.map((img) => deleteGeneratedImage(img.id)));
  } catch (error) {
    console.error('[generatedImages] Failed to delete for room:', error);
  }
}
