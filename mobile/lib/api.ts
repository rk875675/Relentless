import { supabase } from './supabase';

const BASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';

export async function apiFetch<T = unknown>(
  path: string,
  options?: { method?: string; body?: unknown; headers?: Record<string, string> },
): Promise<{ data: T | null; error: string | null }> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) {
    return { data: null, error: 'Not authenticated' };
  }

  const url = `${BASE_URL}/functions/v1${path}`;
  const method = options?.method ?? 'GET';

  const headers: Record<string, string> = {
    Authorization: `Bearer ${session.access_token}`,
    'Content-Type': 'application/json',
    ...options?.headers,
  };

  try {
    const res = await fetch(url, {
      method,
      headers,
      body: options?.body ? JSON.stringify(options.body) : undefined,
    });

    const json = await res.json();

    if (!res.ok) {
      return { data: null, error: json?.error?.message ?? `Request failed (${res.status})` };
    }

    return { data: json.data ?? json, error: null };
  } catch (err) {
    return { data: null, error: 'Network error' };
  }
}
