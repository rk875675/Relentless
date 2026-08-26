import { supabase } from './supabase';
import { getDeviceLocalCalendarYmd } from './device-calendar';

const BASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';

let _cachedToken: string | null = null;

export function setApiToken(token: string | null) {
  _cachedToken = token;
}

export async function apiFetch<T = unknown>(
  path: string,
  options?: { method?: string; body?: unknown; headers?: Record<string, string> },
): Promise<{ data: T | null; error: string | null; errorCode?: string | null; rawBody?: Record<string, unknown> }> {
  let token = _cachedToken;

  if (!token) {
    const { data: { session } } = await supabase.auth.getSession();
    token = session?.access_token ?? null;
  }

  if (!token) {
    return { data: null, error: 'Not authenticated', errorCode: null };
  }

  const method = options?.method ?? 'GET';
  const url = `${BASE_URL}/functions/v1${path}`;

  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
    'X-Local-Date': getDeviceLocalCalendarYmd(),
    ...options?.headers,
  };

  let res: Response;
  try {
    res = await fetch(url, {
      method,
      headers,
      body: options?.body ? JSON.stringify(options.body) : undefined,
      cache: 'default',
    });
  } catch {
    return { data: null, error: 'Could not connect. Check your internet and try again.', errorCode: 'NETWORK_ERROR' };
  }

  let json: Record<string, unknown>;
  try {
    json = await res.json();
  } catch {
    return { data: null, error: 'Something went wrong. Please try again.', errorCode: 'SERVER_ERROR' };
  }

  if (!res.ok) {
    const code =
      typeof json?.error === 'object' && json.error !== null && 'code' in json.error
        ? String((json.error as { code?: unknown }).code)
        : null;
    const message =
      typeof json?.error === 'object' && json.error !== null && 'message' in json.error
        ? String((json.error as { message?: unknown }).message)
        : `Request failed (${res.status})`;
    return { data: null, error: message, errorCode: code };
  }

  return { data: json.data !== undefined ? (json.data as T) : (json as unknown as T), error: null, errorCode: null, rawBody: json };
}
