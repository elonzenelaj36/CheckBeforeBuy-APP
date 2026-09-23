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

import { apiDelete, apiGet, apiPatch, apiPut, apiUploadMultipart } from './api';

const GENERATED_IMAGES_CACHE_KEY = '@check_before_buy_generated_images_cache_v2';

// ── Types ────────────────────────────────────────────────────────────────────

export type GeneratedImageStatus = 'pending' | 'completed' | 'failed';

export type GeneratedImage = {
  id: string;
  roomId: string;
  roomName: string | null;
  roomType: string | null;
  /** Links back to the product_checks row this came from, when there is one — lets "Generate Again" reuse that check's photo instead of needing a fresh local file. */
  productCheckId: string | null;
  productImageUri: string | null;
  roomImageUri: string | null;
  productName: string | null;
  /** null while status is "pending" or "failed". */
  generatedImageUri: string | null;
  status: GeneratedImageStatus;
  /** Product layout saved from the Visualization screen (room, products, positions); null if never saved. */
  layout?: unknown | null;
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

export async function getGeneratedImagesForRoom(
  roomId: string
): Promise<GeneratedImage[]> {
  try {
    const { generatedImages } = await apiGet<{ generatedImages: GeneratedImage[] }>(
      `/generated-images/room/${roomId}`
    );

    // Merge into the cache (replacing this room's prior entries) so the
    // offline fallback below stays useful room-by-room — visualizations are
    // always viewed per-room now (inside My Home → a room), not as one
    // global list.
    const existing = await readCache();
    const otherRooms = existing.filter((img) => img.roomId !== roomId);
    await writeCache([...generatedImages, ...otherRooms]);

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

// ── Update ───────────────────────────────────────────────────────────────────

/**
 * Renames a visualization. This is not an independent label: on the backend
 * it updates the canonical name (the linked product_checks row and its
 * shared product, when there is one) so Saved Products / History / any
 * other visualization of that same check all pick up the new name too —
 * see backend/src/controllers/generatedImageController.js#updateGeneratedImage.
 */
export async function updateGeneratedImage(
  imageId: string,
  productName: string
): Promise<GeneratedImage> {
  const updated = await apiPatch<GeneratedImage>(`/generated-images/${imageId}`, {
    productName: productName.trim(),
  });

  const existing = await readCache();
  await writeCache(existing.map((img) => (img.id === imageId ? updated : img)));

  return updated;
}

/** Attaches the visualization's product layout to its generated image. Never triggers generation. */
export async function saveGeneratedImageLayout(imageId: string, layout: object): Promise<GeneratedImage> {
  const updated = await apiPut<GeneratedImage>(`/generated-images/${imageId}/layout`, { layout });

  const existing = await readCache();
  await writeCache(existing.map((img) => (img.id === imageId ? updated : img)));

  return updated;
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
