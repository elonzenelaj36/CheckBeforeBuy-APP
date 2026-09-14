/**
 * API Service — HTTP client for the Check Before Buy backend.
 *
 * The backend URL is configured via environment variables.
 * Never put AI API keys or secrets in this file or anywhere in the app.
 *
 * Architecture:
 *   React Native app → this service → Backend REST API → Database / AI Providers
 *
 * For local development, the backend defaults to localhost.
 * For production, set EXPO_PUBLIC_API_URL in your environment.
 */

import Constants from 'expo-constants';
import { File } from 'expo-file-system';

// ── Configuration ────────────────────────────────────────────────────────────

const API_URL =
  (Constants.expoConfig?.extra?.apiUrl as string | undefined) ??
  'http://192.168.3.33:5000/api';

// ── Types ────────────────────────────────────────────────────────────────────

export type ApiError = {
  status: number;
  message: string;
};

// ── Request helpers ──────────────────────────────────────────────────────────

let authToken: string | null = null;

export function setAuthToken(token: string | null): void {
  authToken = token;
}

function getHeaders(
  extra?: Record<string, string>
): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...extra,
  };

  if (authToken) {
    headers['Authorization'] = `Bearer ${authToken}`;
  }

  return headers;
}

/**
 * Reads an error message out of a failed response body when possible
 * (the backend returns `{ error: "..." }`), falling back to a generic
 * message so a broken/unreachable backend never crashes the UI.
 */
async function readErrorMessage(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { error?: string };
    if (body?.error) return body.error;
  } catch {
    // response wasn't JSON — fall through to the generic message
  }
  return `Request failed (${response.status}).`;
}

export async function apiGet<T = unknown>(
  endpoint: string
): Promise<T> {
  const response = await fetch(`${API_URL}${endpoint}`, {
    headers: getHeaders(),
  });

  if (!response.ok) {
    throw {
      status: response.status,
      message: await readErrorMessage(response),
    } satisfies ApiError;
  }

  return response.json() as Promise<T>;
}

export async function apiPost<T = unknown>(
  endpoint: string,
  data: unknown
): Promise<T> {
  const response = await fetch(`${API_URL}${endpoint}`, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    throw {
      status: response.status,
      message: await readErrorMessage(response),
    } satisfies ApiError;
  }

  return response.json() as Promise<T>;
}

export async function apiPut<T = unknown>(
  endpoint: string,
  data: unknown
): Promise<T> {
  const response = await fetch(`${API_URL}${endpoint}`, {
    method: 'PUT',
    headers: getHeaders(),
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    throw {
      status: response.status,
      message: await readErrorMessage(response),
    } satisfies ApiError;
  }

  return response.json() as Promise<T>;
}

export async function apiPatch<T = unknown>(
  endpoint: string,
  data: unknown
): Promise<T> {
  const response = await fetch(`${API_URL}${endpoint}`, {
    method: 'PATCH',
    headers: getHeaders(),
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    throw {
      status: response.status,
      message: await readErrorMessage(response),
    } satisfies ApiError;
  }

  return response.json() as Promise<T>;
}

export async function apiDelete(
  endpoint: string
): Promise<void> {
  const response = await fetch(`${API_URL}${endpoint}`, {
    method: 'DELETE',
    headers: getHeaders(),
  });

  if (!response.ok) {
    throw {
      status: response.status,
      message: await readErrorMessage(response),
    } satisfies ApiError;
  }
}

/**
 * Upload an image to the backend.
 *
 * The backend receives the image, stores it in object/file storage,
 * and returns a URL. The URL is then saved to the database.
 *
 * NEVER store images directly in the database as blobs.
 */
export async function apiUploadImage<T = unknown>(
  endpoint: string,
  imageUri: string,
  fieldName = 'image',
  extraFields?: Record<string, string>
): Promise<T> {
  return apiUploadMultipart<T>(endpoint, { [fieldName]: imageUri }, extraFields);
}








/**
 * Like apiUploadImage, but supports multiple named image fields in one
 * request (e.g. both a room photo and a product photo).
 */
export async function apiUploadMultipart<T = unknown>(
  endpoint: string,
  imagesByField: Record<string, string | undefined | null>,
  extraFields?: Record<string, string>
): Promise<T> {
  const formData = new FormData();

  for (const [fieldName, imageUri] of Object.entries(imagesByField)) {
    if (!imageUri) continue;

    const file = new File(imageUri);

    formData.append(fieldName, file);
  }

  if (extraFields) {
    for (const [key, value] of Object.entries(extraFields)) {
      formData.append(key, value);
    }
  }

  const headers: Record<string, string> = {};

  if (authToken) {
    headers['Authorization'] = `Bearer ${authToken}`;
  }

  const response = await fetch(`${API_URL}${endpoint}`, {
    method: 'POST',
    headers,
    body: formData,
  });

  if (!response.ok) {
    throw {
      status: response.status,
      message: await readErrorMessage(response),
    } satisfies ApiError;
  }

  return response.json() as Promise<T>;
}