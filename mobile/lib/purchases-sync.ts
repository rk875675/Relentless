import { apiFetch } from '@/lib/api';

const ACTIVE_ENTITLEMENT_STATUSES = ['trial', 'active'] as const;

/**
 * B2: POST /purchases/restore — verifies subscription with Apple and updates `entitlements`.
 *
 * Returns ok:true only when the server both succeeded AND wrote an active
 * entitlement status ('trial' or 'active'). A 200 response with status
 * 'expired' is treated as a failure so callers retry rather than silently
 * routing the user into the app with a broken entitlement.
 *
 * @param signedTransactionInfo - Optional Apple-signed JWS from StoreKit. When
 *   provided the server can decode the transaction directly without calling
 *   Apple's App Store Server API, which is unreliable in the sandbox environment.
 */
export async function syncSubscriptionWithBackend(
  originalTransactionId: string,
  signedTransactionInfo?: string,
): Promise<{ ok: boolean; error: string | null }> {
  const { data, error } = await apiFetch<{ entitlement_status: string; product_id: string | null }>(
    '/purchases/restore',
    {
      method: 'POST',
      body: {
        originalTransactionId,
        ...(signedTransactionInfo ? { signedTransactionInfo } : {}),
      },
      headers: {
        'Idempotency-Key': `restore-${originalTransactionId}-${Date.now()}`,
      },
    },
  );
  if (error) return { ok: false, error };
  if (!data?.entitlement_status || !(ACTIVE_ENTITLEMENT_STATUSES as readonly string[]).includes(data.entitlement_status)) {
    return {
      ok: false,
      error: `Subscription not yet active (status: ${data?.entitlement_status ?? 'unknown'})`,
    };
  }
  return { ok: true, error: null };
}
