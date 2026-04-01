import type { ScoreDelta } from '@/components/ProgressRing';

export type MacDeltas = {
  mindfulness?: ScoreDelta;
  acceptance?: ScoreDelta;
  commitment?: ScoreDelta;
};

let _pending: MacDeltas | null = null;

const MAC_KEYS: (keyof MacDeltas)[] = ['mindfulness', 'acceptance', 'commitment'];

/**
 * Merge new deltas into the pending set.
 * If the same category already has a pending delta, amounts are summed
 * so back-to-back M→M (or any repeated category) stacks correctly,
 * and M→A preserves the M delta alongside the new A delta.
 */
export function setPendingGainDeltas(d: MacDeltas) {
  if (!_pending) {
    _pending = { ...d };
    return;
  }
  for (const key of MAC_KEYS) {
    const incoming = d[key];
    if (!incoming) continue;
    const existing = _pending[key];
    if (existing) {
      _pending[key] = {
        amount: existing.amount + incoming.amount,
        reason: incoming.reason,
      };
    } else {
      _pending[key] = { ...incoming };
    }
  }
}

/** Non-destructive read — both Home and Library can read the same deltas. */
export function getPendingGainDeltas(): MacDeltas | null {
  return _pending;
}

export function clearPendingGainDeltas() {
  _pending = null;
}
