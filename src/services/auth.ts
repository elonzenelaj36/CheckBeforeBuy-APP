/**
 * Auth service — registration, login, and token persistence.
 *
 * The JWT issued by the backend is cached locally so the user doesn't have
 * to log in again every time the app opens. AsyncStorage is used for this
 * (rather than expo-secure-store) to avoid adding a new native dependency
 * to the existing prototype; for a production deployment, storing the
 * token in expo-secure-store would be the safer choice.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

import { apiPost, setAuthToken } from './api';

const TOKEN_KEY = '@check_before_buy_auth_token_v1';
const USER_KEY = '@check_before_buy_auth_user_v1';

export type AuthUser = {
  id: string;
  name: string;
  email: string;
  createdAt?: string;
};

type AuthResponse = {
  user: AuthUser;
  token: string;
};

let currentUser: AuthUser | null = null;

export function getCurrentUser(): AuthUser | null {
  return currentUser;
}

/**
 * Loads a previously-saved token (if any) into the API client so requests
 * made right after app start are already authenticated. Call once, from
 * the root layout, before rendering navigation.
 */
export async function restoreSession(): Promise<AuthUser | null> {
  try {
    const [token, userJson] = await Promise.all([
      AsyncStorage.getItem(TOKEN_KEY),
      AsyncStorage.getItem(USER_KEY),
    ]);

    if (!token || !userJson) {
      return null;
    }

    setAuthToken(token);
    currentUser = JSON.parse(userJson) as AuthUser;
    return currentUser;
  } catch (error) {
    console.error('[auth] Failed to restore session:', error);
    return null;
  }
}

async function persistSession(response: AuthResponse): Promise<AuthUser> {
  setAuthToken(response.token);
  currentUser = response.user;

  await AsyncStorage.setItem(TOKEN_KEY, response.token);
  await AsyncStorage.setItem(USER_KEY, JSON.stringify(response.user));

  return response.user;
}

export async function register(
  name: string,
  email: string,
  password: string
): Promise<AuthUser> {
  const response = await apiPost<AuthResponse>('/auth/register', {
    name,
    email,
    password,
  });

  return persistSession(response);
}

export async function login(
  email: string,
  password: string
): Promise<AuthUser> {
  const response = await apiPost<AuthResponse>('/auth/login', {
    email,
    password,
  });

  return persistSession(response);
}

export async function logout(): Promise<void> {
  setAuthToken(null);
  currentUser = null;

  await AsyncStorage.multiRemove([TOKEN_KEY, USER_KEY]);
}

export function isAuthenticated(): boolean {
  return currentUser !== null;
}
