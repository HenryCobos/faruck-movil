import 'react-native-url-polyfill/auto';
import { createClient } from '@supabase/supabase-js';
import * as SecureStore from 'expo-secure-store';

// ─── SecureStore chunked adapter ──────────────────────────────────────────────
// SecureStore has a hard 2048-byte limit per key.
// Supabase JWT sessions are typically 2-4 KB, so we split them into chunks
// and reassemble them transparently on read.
const CHUNK_SIZE = 1900; // safe margin below the 2048 limit

const ExpoSecureStoreAdapter = {
  getItem: async (key: string): Promise<string | null> => {
    try {
      const countStr = await SecureStore.getItemAsync(`${key}_n`);
      if (countStr != null) {
        // Reassemble from chunks
        const n = parseInt(countStr, 10);
        const parts: string[] = [];
        for (let i = 0; i < n; i++) {
          const part = await SecureStore.getItemAsync(`${key}_${i}`);
          if (part == null) return null; // incomplete / corrupted
          parts.push(part);
        }
        return parts.join('');
      }
      // Fallback: value was stored as a single key (small session)
      return SecureStore.getItemAsync(key);
    } catch {
      return null;
    }
  },

  setItem: async (key: string, value: string): Promise<void> => {
    try {
      // Remove any previously chunked value for this key
      const oldCountStr = await SecureStore.getItemAsync(`${key}_n`);
      if (oldCountStr != null) {
        const n = parseInt(oldCountStr, 10);
        for (let i = 0; i < n; i++) {
          await SecureStore.deleteItemAsync(`${key}_${i}`);
        }
        await SecureStore.deleteItemAsync(`${key}_n`);
      }

      if (value.length <= CHUNK_SIZE) {
        await SecureStore.setItemAsync(key, value);
      } else {
        // Store in chunks; delete single-key version first
        await SecureStore.deleteItemAsync(key);
        const n = Math.ceil(value.length / CHUNK_SIZE);
        await SecureStore.setItemAsync(`${key}_n`, String(n));
        for (let i = 0; i < n; i++) {
          await SecureStore.setItemAsync(
            `${key}_${i}`,
            value.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE),
          );
        }
      }
    } catch {
      // Storage errors are non-fatal; session will not persist across restarts
    }
  },

  removeItem: async (key: string): Promise<void> => {
    try {
      const countStr = await SecureStore.getItemAsync(`${key}_n`);
      if (countStr != null) {
        const n = parseInt(countStr, 10);
        for (let i = 0; i < n; i++) {
          await SecureStore.deleteItemAsync(`${key}_${i}`);
        }
        await SecureStore.deleteItemAsync(`${key}_n`);
      }
      await SecureStore.deleteItemAsync(key);
    } catch {
      // Ignore
    }
  },
};

// ─── Supabase client ──────────────────────────────────────────────────────────
const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: ExpoSecureStoreAdapter,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

// ─── Request timeout helper ───────────────────────────────────────────────────
/**
 * Races `promise` against a timeout.  If the network hangs, rejects after `ms`
 * with a user-friendly message instead of leaving the screen in a loading state
 * forever.
 *
 * Important: we attach a no-op `.catch` to the original promise so that when
 * the timeout fires first and `promise` eventually rejects, it does NOT become
 * an unhandled promise rejection (which would appear as a red ERROR in the
 * console).
 */
export function withTimeout<T>(promise: PromiseLike<T>, ms = 12000): Promise<T> {
  // Supabase query builders are PromiseLike (only have .then), NOT full Promises.
  // Promise.resolve() converts any PromiseLike into a real Promise that has
  // .catch() and .finally(), which we need below.
  const p = Promise.resolve(promise);

  // Suppress unhandled rejection on the original promise when timeout fires first
  p.catch(() => {});

  let timerId: ReturnType<typeof setTimeout>;

  const timeoutPromise = new Promise<never>((_, reject) => {
    timerId = setTimeout(
      () => reject(new Error('La solicitud tardó demasiado. Revisa tu conexión a internet.')),
      ms,
    );
  });

  return Promise.race([p, timeoutPromise]).finally(
    () => clearTimeout(timerId),
  ) as Promise<T>;
}
