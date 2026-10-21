import Constants from 'expo-constants';
import { Platform } from 'react-native';

const API_PORT = 3000;

export type Restaurant = {
  id?: string;
  name: string;
  rating: number | null;
  review_count?: number | null;
  price_level: string | null;
  cuisine: string;
  distance_miles: number | null;
  open_now: boolean | null;
  hours_note: string;
  photo_url: string | null;
  menu_url: string | null;
  maps_url: string | null;
};

export type ChatMessage =
  | { role: 'user' | 'assistant'; text: string }
  | { role: 'results'; restaurants: Restaurant[] };

export type User = { id: number; email: string };

// The chat server (server/index.js) runs on the same machine as the Expo dev
// server, so reuse the dev server's host. On web that's the page's hostname;
// on a phone it's your computer's LAN IP from the Expo manifest.
export function getApiUrl() {
  if (process.env.EXPO_PUBLIC_WHERE_TO_API_URL) return process.env.EXPO_PUBLIC_WHERE_TO_API_URL;
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    return `http://${window.location.hostname}:${API_PORT}`;
  }
  const host = Constants.expoConfig?.hostUri?.split(':')[0] ?? 'localhost';
  return `http://${host}:${API_PORT}`;
}

/**
 * Calls the API, attaching the login token when there is one. Never throws
 * for HTTP errors; check `ok`. Network failures still throw.
 */
export async function apiFetch<T = any>(
  path: string,
  { token, method = 'GET', body }: { token?: string | null; method?: string; body?: unknown } = {}
): Promise<{ ok: boolean; status: number; data: T }> {
  const res = await fetch(`${getApiUrl()}${path}`, {
    method,
    headers: {
      ...(body !== undefined && { 'Content-Type': 'application/json' }),
      ...(token && { Authorization: `Bearer ${token}` }),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data: any = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {}
  return { ok: res.ok, status: res.status, data };
}
