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
 */

import { File, Paths } from 'expo-file-system';
import { Asset, requestPermissionsAsync } from 'expo-media-library';

export type SaveToGalleryResult = {
  success: boolean;
  message: string;
};

const PERMISSION_DENIED_MESSAGE =
  'Gallery permission is required to save this photo. Please enable photo access for this app in Settings.';
const SAVE_FAILED_MESSAGE = "We couldn't save this photo to your Gallery.";
const SAVE_SUCCESS_MESSAGE = 'Photo saved to your Gallery';

async function toLocalUri(imageUri: string): Promise<string> {
  if (!/^https?:\/\//i.test(imageUri)) {
    return imageUri;
  }

  const filename = imageUri.split('/').pop()?.split('?')[0] || `visualization-${Date.now()}.jpg`;
  const destination = new File(Paths.cache, filename);
  const downloaded = await File.downloadFileAsync(imageUri, destination);
  return downloaded.uri;
}

/**
 * Saves the given image URI to the device's Gallery. Handles permission
 * requests/denials and downloading a remote image to a local file first.
 * Never reports success unless the asset was actually created.
 */
export async function saveImageToGallery(
  imageUri: string | null | undefined
): Promise<SaveToGalleryResult> {
  if (!imageUri) {
    return { success: false, message: SAVE_FAILED_MESSAGE };
  }

  try {
    const permission = await requestPermissionsAsync(true);
    if (!permission.granted) {
      return { success: false, message: PERMISSION_DENIED_MESSAGE };
    }

    const localUri = await toLocalUri(imageUri);
    await Asset.create(localUri);

    return { success: true, message: SAVE_SUCCESS_MESSAGE };
  } catch (error) {
    console.error('[gallery] Failed to save image:', error);
    return { success: false, message: SAVE_FAILED_MESSAGE };
  }
}
