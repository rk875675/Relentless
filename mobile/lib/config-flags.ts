import { apiFetch } from './api';

type FlagMap = Record<string, { enabled: boolean }>;

let _cache: FlagMap | null = null;
let _fetchedAt = 0;
const TTL_MS = 5 * 60 * 1000;

export async function getFeatureFlags(): Promise<FlagMap> {
  const now = Date.now();
  if (_cache && now - _fetchedAt < TTL_MS) return _cache;
  const { data } = await apiFetch<{ flags: FlagMap }>('/config');
  if (data?.flags) {
    _cache = data.flags;
    _fetchedAt = now;
  }
  return _cache ?? {};
}

export async function isFeatureFlagEnabled(key: string): Promise<boolean> {
  try {
    const flags = await getFeatureFlags();
    return flags[key]?.enabled === true;
  } catch {
    return false;
  }
}
