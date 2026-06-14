import { createClient } from '@supabase/supabase-js';

/**
 * Isolated Supabase client for the password-recovery flow.
 *
 * A recovery link (verifyOtp / setSession) creates a real, full session. If we
 * ran it on the shared app client, that session would persist to AsyncStorage
 * and the root RouteGuard would treat the user as logged in — bouncing them
 * into the app the moment they left the recovery screen. This client keeps the
 * recovery session in memory only (persistSession: false), so it never leaks
 * into the app's auth state and disappears when the screen unmounts.
 */
function createMemoryStorage() {
  const store = new Map<string, string>();
  return {
    getItem: (key: string) => Promise.resolve(store.get(key) ?? null),
    setItem: (key: string, value: string) => {
      store.set(key, value);
      return Promise.resolve();
    },
    removeItem: (key: string) => {
      store.delete(key);
      return Promise.resolve();
    },
  };
}

export function createRecoveryClient() {
  const url = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
  const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';
  return createClient(url, anonKey, {
    auth: {
      storage: createMemoryStorage(),
      storageKey: 'relentless-recovery',
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}
