import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Tracks which decay-delta snapshots the user has already seen the animation for.
 * Keyed by userId + a fingerprint of the delta amounts so that a genuinely new
 * decay on a different day is shown fresh.
 */

function deltaKey(userId: string, deltas: Record<string, { amount: number }>): string {
  const sig = Object.entries(deltas)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}:${v.amount}`)
    .join('|');
  return `relentless:delta_seen:${userId}:${sig}`;
}

export async function markDeltaSeen(
  userId: string,
  deltas: Record<string, { amount: number }>,
): Promise<void> {
  const key = deltaKey(userId, deltas);
  await AsyncStorage.setItem(key, '1');
}

export async function isDeltaSeen(
  userId: string,
  deltas: Record<string, { amount: number }>,
): Promise<boolean> {
  const key = deltaKey(userId, deltas);
  const val = await AsyncStorage.getItem(key);
  return val === '1';
}
