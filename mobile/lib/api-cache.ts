import { apiFetch } from './api';
import { HOME_PROGRAM_ANCHOR_HEADERS } from './device-calendar';

const _cache = new Map<string, { data: unknown; ts: number }>();
const TTL = 120_000; // 2 minutes — covers typical tab-switching; pull-to-refresh busts cache

export function getCached<T>(key: string): T | null {
  const entry = _cache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.ts > TTL) {
    _cache.delete(key);
    return null;
  }
  return entry.data as T;
}

export function setCached(key: string, data: unknown): void {
  _cache.set(key, { data, ts: Date.now() });
}

export function bustCache(...keys: string[]): void {
  if (keys.length === 0) {
    _cache.clear();
  } else {
    for (const k of keys) _cache.delete(k);
  }
}

let _prefetchInFlight = false;

/**
 * Fire-and-forget: kick off home screen API calls so results land in cache
 * before HomeScreen mounts. Safe to call multiple times; skips if already
 * running or if data is already cached.
 */
export function prefetchHomeData(): void {
  if (_prefetchInFlight) return;
  if (getCached('/lessons/next') && getCached('/progress') && getCached('/streak')) return;
  _prefetchInFlight = true;
  const headers = { ...HOME_PROGRAM_ANCHOR_HEADERS };
  Promise.all([
    apiFetch('/lessons/next', { headers }),
    apiFetch('/progress', { headers }),
    apiFetch('/streak', { headers }),
  ])
    .then(([lessonRes, progressRes, streakRes]) => {
      if (!lessonRes.error) setCached('/lessons/next', { data: lessonRes.data, rawBody: lessonRes.rawBody });
      if (!progressRes.error && progressRes.data) setCached('/progress', progressRes.data);
      if (!streakRes.error && streakRes.data) setCached('/streak', streakRes.data);
    })
    .catch(() => {})
    .finally(() => {
      _prefetchInFlight = false;
    });
}
