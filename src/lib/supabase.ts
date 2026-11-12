import { createClient, type SupportedStorage } from '@supabase/supabase-js';
import Constants from 'expo-constants';
import * as SecureStore from 'expo-secure-store';
import { AppState, Platform } from 'react-native';

import type { Database } from './database.types';

const envUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const key = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
if (!envUrl || !key) {
  throw new Error('Set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY in .env.local (see .env.example).');
}

// In development against a local backend (plain http), talk to the same
// computer the app was loaded from, so it works over Wi-Fi, Tailscale or
// localhost without editing .env.local. Hosted (https) URLs are never changed.
function devUrl(raw: string): string {
  if (!__DEV__ || !raw.startsWith('http://')) return raw;
  const host = isWebHost() ? window.location.hostname : Constants.expoConfig?.hostUri?.split(':')[0];
  if (!host) return raw;
  const u = new URL(raw);
  return `http://${host}:${u.port || '54321'}`;
}
const isWebHost = () => Platform.OS === 'web' && typeof window !== 'undefined';
const url = devUrl(envUrl);

// Sessions hold a refresh token, so on phones they live in the Keychain /
// Keystore rather than plain app storage. Values are split into chunks because
// some iOS versions reject SecureStore values over ~2 KB.
const CHUNK = 1800;
const safe = (k: string) => k.replace(/[^A-Za-z0-9._-]/g, '_');

const secureStorage: SupportedStorage = {
  async getItem(name) {
    const k = safe(name);
    const count = Number(await SecureStore.getItemAsync(`${k}.n`));
    if (!count) return null;
    const parts = await Promise.all(Array.from({ length: count }, (_, i) => SecureStore.getItemAsync(`${k}.${i}`)));
    return parts.every((p) => p !== null) ? parts.join('') : null;
  },
  async setItem(name, value) {
    const k = safe(name);
    const previous = Number(await SecureStore.getItemAsync(`${k}.n`)) || 0;
    const chunks = value.match(new RegExp(`[\\s\\S]{1,${CHUNK}}`, 'g')) ?? [''];
    await Promise.all(chunks.map((c, i) => SecureStore.setItemAsync(`${k}.${i}`, c)));
    await SecureStore.setItemAsync(`${k}.n`, String(chunks.length));
    for (let i = chunks.length; i < previous; i++) await SecureStore.deleteItemAsync(`${k}.${i}`);
  },
  async removeItem(name) {
    const k = safe(name);
    const count = Number(await SecureStore.getItemAsync(`${k}.n`)) || 0;
    await Promise.all(Array.from({ length: count }, (_, i) => SecureStore.deleteItemAsync(`${k}.${i}`)));
    await SecureStore.deleteItemAsync(`${k}.n`);
  },
};

const isWeb = Platform.OS === 'web';

export const supabase = createClient<Database>(url, key, {
  auth: {
    // Web uses the browser's localStorage (the default).
    storage: isWeb ? undefined : secureStorage,
    autoRefreshToken: true,
    persistSession: true,
    // PKCE: the OAuth redirect carries a one-time code, never the tokens.
    flowType: 'pkce',
    // On web the Google redirect lands back on the page with ?code=.
    detectSessionInUrl: isWeb,
  },
});

// Only refresh tokens while the app is in the foreground.
if (!isWeb) {
  AppState.addEventListener('change', (state) => {
    if (state === 'active') supabase.auth.startAutoRefresh();
    else supabase.auth.stopAutoRefresh();
  });
}

export const IMAGE_BUCKET = 'event-images';
export const PROFILE_BUCKET = 'profile-images';
export const SUPABASE_URL = url;
export const SUPABASE_KEY = key;
