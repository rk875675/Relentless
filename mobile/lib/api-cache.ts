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
