import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import * as aesjs from 'aes-js';
import { getRandomValues } from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';
import { AppState, Platform } from 'react-native';

import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from '@/lib/config';

/**
 * The app's single Supabase client. Supabase Auth owns identities, passwords, sessions, email
 * confirmation and password recovery; the Top Flow API verifies the access token on every request.
 */

export const SUPABASE_NOT_CONFIGURED_MESSAGE =
  'Sign-in is not configured: set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY in apps/mobile/.env, then restart Expo with `npx expo start --clear`.';

/** `true` when both Supabase variables are set. Browsing and quote requests work without them. */
export const isSupabaseConfigured = /^https?:\/\//i.test(SUPABASE_URL) && SUPABASE_PUBLISHABLE_KEY !== '';

/** Thrown when the client is used while the Supabase variables are missing. */
export class SupabaseConfigError extends Error {
  constructor() {
    super(SUPABASE_NOT_CONFIGURED_MESSAGE);
    this.name = 'SupabaseConfigError';
  }
}

/** Storage key for the session. SecureStore keys may only contain letters, digits, `.`, `-` and `_`. */
const AUTH_STORAGE_KEY = 'topflow.auth.session';

/** Same limit as API calls, so a stalled network cannot keep the session restore pending for minutes. */
const REQUEST_TIMEOUT_MS = 20_000;

// ─── Session storage ─────────────────────────────────────────────────────────

/**
 * Encrypted session storage for iOS and Android: the "LargeSecureStore" pattern from the Supabase
 * docs. A session (tokens and user, a few kilobytes) is too large for SecureStore, whose platforms
 * may reject values over about 2 KB. So every write:
 *
 * 1. generates a fresh random 256-bit AES key (expo-crypto),
 * 2. encrypts the value with AES-CTR (aes-js) and saves the ciphertext in AsyncStorage,
 * 3. saves the key in the iOS Keychain / Android Keystore (SecureStore), readable only on this
 *    device while it is unlocked.
 *
 * Neither store alone reveals the session. A backup restored to another device has no key, so the
 * customer simply signs in again. Values are cached in memory while the app runs, so API calls do not
 * read the keychain each time, and a session that cannot be persisted still works until the app closes.
 */
class LargeSecureStore {
  private readonly cache = new Map<string, string | null>();

  async getItem(key: string): Promise<string | null> {
    if (!this.cache.has(key)) {
      const stored = await this.read(key);
      // A write or removal made while reading wins over the value read.
      if (!this.cache.has(key)) this.cache.set(key, stored);
    }
    return this.cache.get(key) ?? null;
  }

  async setItem(key: string, value: string): Promise<void> {
    this.cache.set(key, value);
    try {
      const encryptionKey = getRandomValues(new Uint8Array(32));
      const cipher = new aesjs.ModeOfOperation.ctr(encryptionKey, new aesjs.Counter(1));
      const encrypted = cipher.encrypt(aesjs.utils.utf8.toBytes(value));
      await SecureStore.setItemAsync(key, aesjs.utils.hex.fromBytes(encryptionKey), {
        keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
      });
      await AsyncStorage.setItem(key, aesjs.utils.hex.fromBytes(encrypted));
    } catch (error) {
      // The session keeps working for this launch; the customer signs in again next time.
      if (__DEV__) console.warn('The session could not be saved securely on this device.', error);
    }
  }

  async removeItem(key: string): Promise<void> {
    this.cache.set(key, null);
    await Promise.allSettled([AsyncStorage.removeItem(key), SecureStore.deleteItemAsync(key)]);
  }

  private async read(key: string): Promise<string | null> {
    try {
      const encrypted = await AsyncStorage.getItem(key);
      if (!encrypted) return null;
      const keyHex = await SecureStore.getItemAsync(key);
      if (!keyHex) {
        // Ciphertext without its key (for example restored from a backup) can never be read.
        await AsyncStorage.removeItem(key);
        return null;
      }
      const cipher = new aesjs.ModeOfOperation.ctr(aesjs.utils.hex.toBytes(keyHex), new aesjs.Counter(1));
      return aesjs.utils.utf8.fromBytes(cipher.decrypt(aesjs.utils.hex.toBytes(encrypted)));
    } catch {
      // Unreadable keychain or corrupt data: start signed out.
      return null;
    }
  }
}

/** Web has no keychain (SecureStore does not support it): the session is kept in memory and ends with the tab. */
class MemoryStorage {
  private readonly values = new Map<string, string>();

  async getItem(key: string): Promise<string | null> {
    return this.values.get(key) ?? null;
  }

  async setItem(key: string, value: string): Promise<void> {
    this.values.set(key, value);
  }

  async removeItem(key: string): Promise<void> {
    this.values.delete(key);
  }
}

const authStorage = Platform.OS === 'web' ? new MemoryStorage() : new LargeSecureStore();

// ─── Client ──────────────────────────────────────────────────────────────────

let client: SupabaseClient | null = null;

/**
 * The Supabase client, created on first use. Throws `SupabaseConfigError` with setup instructions
 * when `EXPO_PUBLIC_SUPABASE_URL` or `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` is missing.
 */
export function getSupabase(): SupabaseClient {
  if (client) return client;
  if (!isSupabaseConfigured) throw new SupabaseConfigError();

  client = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    auth: {
      storage: authStorage,
      storageKey: AUTH_STORAGE_KEY,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
    },
    global: { fetch: fetchWithTimeout },
  });
  // Browsers pause and resume the refresh timer on tab visibility by themselves.
  if (Platform.OS !== 'web') keepSessionFresh(client);
  return client;
}

/**
 * Supabase refreshes the access token shortly before it expires, but on iOS and Android only while
 * its refresh timer runs. As in the Supabase React Native guide, run the timer while the app is in
 * the foreground. It is registered once, when the client is created.
 */
function keepSessionFresh(supabase: SupabaseClient): void {
  if (AppState.currentState === 'active') void supabase.auth.startAutoRefresh();
  AppState.addEventListener('change', (state) => {
    if (state === 'active') void supabase.auth.startAutoRefresh();
    else void supabase.auth.stopAutoRefresh();
  });
}

const fetchWithTimeout: typeof fetch = (input, init) => {
  const controller = new AbortController();
  const abort = () => controller.abort();
  const timer = setTimeout(abort, REQUEST_TIMEOUT_MS);
  const callerSignal = init?.signal;
  if (callerSignal?.aborted) abort();
  else callerSignal?.addEventListener('abort', abort);
  return fetch(input, { ...init, signal: controller.signal }).finally(() => {
    clearTimeout(timer);
    callerSignal?.removeEventListener('abort', abort);
  });
};

/**
 * Ends the session on this device (its refresh token is revoked too when Supabase can be reached).
 *
 * Supabase keeps a session it cannot sign out of because an expired access token cannot be refreshed
 * offline. That session is deleted from storage here; signing out again then needs no network and
 * still notifies `onAuthStateChange` listeners with `SIGNED_OUT`.
 */
export async function signOutLocally(): Promise<void> {
  const supabase = getSupabase();
  const { error } = await supabase.auth.signOut({ scope: 'local' });
  if (!error || (await authStorage.getItem(AUTH_STORAGE_KEY)) === null) return;
  await authStorage.removeItem(AUTH_STORAGE_KEY);
  await supabase.auth.signOut({ scope: 'local' });
}
