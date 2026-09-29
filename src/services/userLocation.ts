/**
 * Approximate location for local results: the CITY name only.
 *
 * The phone works out its position at the lowest accuracy (about 3 km),
 * turns it into a city with the platform's own geocoder (Android/iOS, free, on
 * the device) and keeps just `{ city, country }`. Coordinates never leave the
 * phone and are not stored. The city is cached for a few hours so the
 * permission and GPS aren't needed for every analysis.
 *
 * Any problem (permission denied, no fix, web) → null, and the backend falls
 * back to its IP lookup / Kosovo-wide search exactly as before.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import { Platform } from 'react-native';

export type ApproximateCity = { city: string; country: string | null };

const CACHE_KEY = '@check_before_buy_city_v1';
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const FIX_TIMEOUT_MS = 8000;

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | null> {
  return Promise.race([promise, new Promise<null>((resolve) => setTimeout(() => resolve(null), ms))]);
}

async function readCache(): Promise<ApproximateCity | null> {
  try {
    const raw = await AsyncStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const saved = JSON.parse(raw) as ApproximateCity & { at: number };
    return Date.now() - saved.at < CACHE_TTL_MS && saved.city ? { city: saved.city, country: saved.country } : null;
  } catch {
    return null;
  }
}

export async function getApproximateCity(): Promise<ApproximateCity | null> {
  // Reverse geocoding isn't available on web.
  if (Platform.OS === 'web') return null;

  const cached = await readCache();
  if (cached) return cached;

  try {
    let permission = await Location.getForegroundPermissionsAsync();
    if (!permission.granted && permission.canAskAgain) {
      permission = await Location.requestForegroundPermissionsAsync();
    }
    if (!permission.granted) return null;

    const position =
      (await Location.getLastKnownPositionAsync({ maxAge: 60 * 60 * 1000 })) ??
      (await withTimeout(Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Lowest }), FIX_TIMEOUT_MS));
    if (!position) return null;

    const [address] = await Location.reverseGeocodeAsync({
      latitude: position.coords.latitude,
      longitude: position.coords.longitude,
    });
    const city = address?.city || address?.subregion || address?.district || null;
    if (!city) return null;

    const result: ApproximateCity = { city, country: address?.country || null };
    await AsyncStorage.setItem(CACHE_KEY, JSON.stringify({ ...result, at: Date.now() })).catch(() => {});
    return result;
  } catch {
    return null;
  }
}
