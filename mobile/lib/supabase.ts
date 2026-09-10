import 'react-native-get-random-values';
import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { installWebCryptoSubtleDigestShim } from '@/lib/install-webcrypto-shim';

installWebCryptoSubtleDigestShim();

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';

const UNCONFIGURED_MSG = 'Supabase is not configured';

/**
 * `createClient('', '')` throws synchronously (`supabaseUrl is required.`).
 * Preview EAS env can ship without Supabase; that must not abort JS init
 * (`_layout` → AuthProvider → this module) before the first React frame.
 */
function createUnconfiguredClient(): SupabaseClient {
  const subscription = { unsubscribe() {} };
  const authError = { message: UNCONFIGURED_MSG };
  return {
    auth: {
      getSession: async () => ({ data: { session: null }, error: null }),
      getUser: async () => ({ data: { user: null }, error: null }),
      onAuthStateChange: () => ({ data: { subscription }, error: null }),
      signOut: async () => ({ error: null }),
      signInWithPassword: async () => ({
        data: { user: null, session: null },
        error: authError,
      }),
      signInWithOAuth: async () => ({
        data: { provider: null, url: null },
        error: authError,
      }),
      signInWithIdToken: async () => ({
        data: { user: null, session: null },
        error: authError,
      }),
      signUp: async () => ({
        data: { user: null, session: null },
        error: authError,
      }),
      exchangeCodeForSession: async () => ({
        data: { user: null, session: null },
        error: authError,
      }),
    },
    from() {
      throw new Error(UNCONFIGURED_MSG);
    },
    rpc() {
      throw new Error(UNCONFIGURED_MSG);
    },
  } as unknown as SupabaseClient;
}

function createRelentlessSupabaseClient(): SupabaseClient {
  if (!SUPABASE_URL.trim() || !SUPABASE_ANON_KEY) {
    return createUnconfiguredClient();
  }
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
      storage: AsyncStorage,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
      flowType: 'pkce',
    },
  });
}

export const supabase = createRelentlessSupabaseClient();
