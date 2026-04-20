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
  // Lesson JSON (especially content_blocks / timed_text) must never be served
  // from an HTTP cache after DB updates — same URL would otherwise stay stale on iOS.
  let pathForUrl = path;
  if (method === 'GET' && path.startsWith('/lessons')) {
    const join = path.includes('?') ? '&' : '?';
    pathForUrl = `${path}${join}_=${Date.now()}`;
  }
  const url = `${BASE_URL}/functions/v1${pathForUrl}`;

  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
    'X-Local-Date': getDeviceLocalCalendarYmd(),
    ...options?.headers,
  };

  try {
    const res = await fetch(url, {
      method,
      headers,
      body: options?.body ? JSON.stringify(options.body) : undefined,
      cache: method === 'GET' && path.startsWith('/lessons') ? 'no-store' : 'default',
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
