import { apiFetch } from '@/lib/api';

/**
 * B2: POST /purchases/restore — verifies subscription with Apple and updates `entitlements`.
 */
export async function syncSubscriptionWithBackend(
  originalTransactionId: string,
): Promise<{ ok: boolean; error: string | null }> {
  const { error } = await apiFetch('/purchases/restore', {
    method: 'POST',
    body: { originalTransactionId },
    headers: {
      'Idempotency-Key': `restore-${originalTransactionId}-${Date.now()}`,
    },
  });
  return { ok: !error, error };
}
