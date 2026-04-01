import { supabase } from './supabase';
import { getDeviceLocalCalendarYmd } from './device-calendar';

const BASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';

export async function apiFetch<T = unknown>(
  path: string,
  options?: { method?: string; body?: unknown; headers?: Record<string, string> },
): Promise<{ data: T | null; error: string | null; errorCode?: string | null; rawBody?: Record<string, unknown> }> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) {
    return { data: null, error: 'Not authenticated', errorCode: null };
  }

  const url = `${BASE_URL}/functions/v1${path}`;
  const method = options?.method ?? 'GET';

  const headers: Record<string, string> = {
    Authorization: `Bearer ${session.access_token}`,
    'Content-Type': 'application/json',
    'X-Local-Date': getDeviceLocalCalendarYmd(),
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
      const code =
        typeof json?.error?.code === 'string' ? json.error.code : null;
      return {
        data: null,
        error: json?.error?.message ?? `Request failed (${res.status})`,
        errorCode: code,
      };
    }

    return { data: json.data !== undefined ? json.data : json, error: null, errorCode: null, rawBody: json };
  } catch (err) {
    return { data: null, error: 'Network error', errorCode: null };
  }
}
