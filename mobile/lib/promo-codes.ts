import { apiFetch } from '@/lib/api';
import { supabase } from '@/lib/supabase';

const BASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';

export type PromoCodeType = 'months_free' | 'lifetime';

export type ValidatedPromoCode = {
  code: string;
  type: PromoCodeType;
  months: number | null;
  creator: { name: string | null; slug: string | null };
};

export type ValidatePromoCodeResult =
  | { ok: true; data: ValidatedPromoCode }
  | { ok: false; reason: 'invalid' | 'error' };

/**
 * POST /promo-codes/validate — works pre-auth (the function is deployed with
 * verify_jwt disabled and rate-limits by IP). A session token is attached when
 * available but is not required. Any non-live code (nonexistent, inactive,
 * expired, exhausted) comes back as { valid: false } — the server never
 * distinguishes, so neither do we.
 */
export async function validatePromoCode(code: string): Promise<ValidatePromoCodeResult> {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (session?.access_token) {
      headers.Authorization = `Bearer ${session.access_token}`;
    }

    const res = await fetch(`${BASE_URL}/functions/v1/promo-codes/validate`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ code: code.trim() }),
    });

    const json = await res.json();
    if (!res.ok) return { ok: false, reason: 'error' };

    const data = json?.data;
    if (data?.valid !== true) return { ok: false, reason: 'invalid' };

    return {
      ok: true,
      data: {
        code: String(data.code),
        type: data.type as PromoCodeType,
        months: typeof data.months === 'number' ? data.months : null,
        creator: {
          name: data.creator?.name ?? null,
          slug: data.creator?.slug ?? null,
        },
      },
    };
  } catch {
    return { ok: false, reason: 'error' };
  }
}

export type RedeemPromoCodeResult =
  | { ok: true; alreadyRedeemed: boolean; expiresAt: string | null }
  | { ok: false; errorCode: string | null; error: string | null };

/**
 * POST /promo-codes/redeem — authenticated. Atomic and idempotent server-side:
 * redeeming the same code twice for the same user replays as success with the
 * original expiry.
 */
export async function redeemPromoCode(code: string): Promise<RedeemPromoCodeResult> {
  const { data, error, errorCode } = await apiFetch<{
    redeemed: boolean;
    already_redeemed: boolean;
    expires_at: string | null;
  }>('/promo-codes/redeem', {
    method: 'POST',
    body: { code: code.trim() },
  });

  if (error || !data?.redeemed) {
    return { ok: false, errorCode: errorCode ?? null, error: error ?? null };
  }
  return {
    ok: true,
    alreadyRedeemed: data.already_redeemed === true,
    expiresAt: data.expires_at ?? null,
  };
}
