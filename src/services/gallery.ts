/**
 * Gallery service — saves an image URI (local or remote) to the device's
 * actual Photos/Gallery app via expo-media-library.
 *
 * Shared by:
 *   - the generated-visualization result screen (save right after generating)
 *   - the visualization detail screen (save later, from Saved → Visualizations)
 *
 * Remote (http/https) URIs — e.g. a backend-hosted generated image — are
 * downloaded to a local cache file first, since expo-media-library can only
 * import local filesystem URIs into the gallery.
 *
 * There is no cross-platform way to ask the OS "has this exact image already
 * been saved to the Gallery?" (especially with the write-only permission we
 * request, which doesn't grant read access to query the library). So instead
 * we remember, app-side, which image URIs this app has already saved —
 * keyed by the image's own URI, which is stable for a given generated
 * visualization — and treat a repeat save as a friendly no-op rather than
 * writing a second copy or surfacing a native error.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { File, Paths } from 'expo-file-system';
import { Asset, requestPermissionsAsync } from 'expo-media-library';

const SAVED_IMAGES_CACHE_KEY = '@check_before_buy_gallery_saved_v1';

export type GallerySaveStatus = 'saved' | 'already-saved' | 'permission-denied' | 'failed';

export type SaveToGalleryResult = {
  status: GallerySaveStatus;
  message: string;
};

const MESSAGES: Record<GallerySaveStatus, string> = {
  saved: 'Photo saved to Gallery',
  'already-saved': 'Photo already saved to Gallery',
  'permission-denied': 'Gallery permission is required to save this photo.',
  failed: "Couldn't save photo to Gallery. Please try again.",
};

async function readSavedUris(): Promise<Set<string>> {
  try {
    const data = await AsyncStorage.getItem(SAVED_IMAGES_CACHE_KEY);
    return new Set(data ? (JSON.parse(data) as string[]) : []);
  } catch {
    return new Set();
  }
}

async function markAsSaved(imageUri: string): Promise<void> {
  try {
    const saved = await readSavedUris();
    saved.add(imageUri);
    await AsyncStorage.setItem(SAVED_IMAGES_CACHE_KEY, JSON.stringify(Array.from(saved)));
  } catch (error) {
    console.error('[gallery] Failed to record saved image:', error);
  }
}

async function toLocalUri(imageUri: string): Promise<string> {
  if (!/^https?:\/\//i.test(imageUri)) {
    return imageUri;
  }

  const filename = imageUri.split('/').pop()?.split('?')[0] || `visualization-${Date.now()}.jpg`;
  const destination = new File(Paths.cache, filename);

  // Reuse an already-downloaded copy instead of re-downloading (and instead
  // of erroring because the destination file already exists).
  if (destination.exists) {
    return destination.uri;
  }

  const downloaded = await File.downloadFileAsync(imageUri, destination);
  return downloaded.uri;
}

/**
 * Saves the given image URI to the device's Gallery. Handles permission
 * requests/denials, downloading a remote image to a local file first, and
 * recognizing a repeat save of the same image as an "already saved" no-op
 * instead of an error. Never reports "saved" unless the asset was actually
 * created.
 */
export async function saveImageToGallery(
  imageUri: string | null | undefined
): Promise<SaveToGalleryResult> {
  if (!imageUri) {
    return { status: 'failed', message: MESSAGES.failed };
  }

  try {
    const alreadySaved = (await readSavedUris()).has(imageUri);
    if (alreadySaved) {
      return { status: 'already-saved', message: MESSAGES['already-saved'] };
    }

    const permission = await requestPermissionsAsync(true);
    if (!permission.granted) {
      return { status: 'permission-denied', message: MESSAGES['permission-denied'] };
    }

    const localUri = await toLocalUri(imageUri);
    await Asset.create(localUri);
    await markAsSaved(imageUri);

    return { status: 'saved', message: MESSAGES.saved };
  } catch (error) {
    console.error('[gallery] Failed to save image:', error);
    return { status: 'failed', message: MESSAGES.failed };
  }
}
