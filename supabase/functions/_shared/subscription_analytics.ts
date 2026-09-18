import type { createServiceClient } from "./supabase.ts";

type ServiceClient = ReturnType<typeof createServiceClient>;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type AppleTransactionInfo = {
  originalTransactionId?: string;
  transactionId?: string;
  bundleId?: string;
  productId?: string;
  price?: number;
  currency?: string;
  transactionReason?: string;
  purchaseDate?: number;
  expiresDate?: number;
  revocationDate?: number;
  revocationReason?: number;
  offerType?: number;
  offerIdentifier?: string;
  offerDiscountType?: string;
  offerPeriod?: string;
  storefront?: string;
  appAccountToken?: string;
  isTrialPeriod?: boolean;
  is_trial_period?: boolean;
};

export type SubscriptionAttribution = {
  attribution_code: string | null;
  attribution_creator: string | null;
  attribution_source: "promo" | "referral" | null;
};

export function isUuid(value: string | null | undefined): value is string {
  return typeof value === "string" && UUID_RE.test(value);
}

export function appleMsToIso(ms: number | null | undefined): string | null {
  if (typeof ms !== "number" || !Number.isFinite(ms) || ms <= 0) return null;
  const date = new Date(ms);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export function priceDecimalFromMilliunits(price: number | null | undefined): number | null {
  if (typeof price !== "number" || !Number.isFinite(price)) return null;
  return price / 1000;
}

export function periodFromProductId(productId: string | null | undefined): "monthly" | "annual" | null {
  if (!productId) return null;
  const lower = productId.toLowerCase();
  if (lower.includes("annual") || lower.includes("year")) return "annual";
  if (lower.includes("month")) return "monthly";
  return null;
}

export function isFreeTrialTx(txInfo: AppleTransactionInfo | null | undefined): boolean {
  if (!txInfo) return false;
  return (
    txInfo.isTrialPeriod === true ||
    txInfo.is_trial_period === true ||
    txInfo.offerDiscountType?.toUpperCase() === "FREE_TRIAL"
  );
}

/**
 * Maps Apple's JWSTransactionDecodedPayload onto PostHog event properties.
 * Missing Apple fields stay null so dashboards can filter "is set" safely.
 */
export function transactionAnalyticsProperties(
  txInfo: AppleTransactionInfo | null | undefined,
): Record<string, unknown> {
  const price = typeof txInfo?.price === "number" ? txInfo.price : null;
  const productId = txInfo?.productId ?? null;
  return {
    product_id: productId,
    period: periodFromProductId(productId),
    price,
    price_decimal: priceDecimalFromMilliunits(price),
    currency: txInfo?.currency ?? null,
    transaction_reason: txInfo?.transactionReason ?? null,
    transaction_id: txInfo?.transactionId ?? null,
    original_transaction_id: txInfo?.originalTransactionId ?? null,
    purchase_date: appleMsToIso(txInfo?.purchaseDate),
    expires_date: appleMsToIso(txInfo?.expiresDate),
    offer_type: typeof txInfo?.offerType === "number" ? txInfo.offerType : null,
    offer_identifier: txInfo?.offerIdentifier ?? null,
    offer_discount_type: txInfo?.offerDiscountType ?? null,
    storefront: txInfo?.storefront ?? null,
    revocation_reason: typeof txInfo?.revocationReason === "number"
      ? txInfo.revocationReason
      : null,
    is_trial: isFreeTrialTx(txInfo),
    app_account_token: txInfo?.appAccountToken ?? null,
  };
}

export async function resolveUserByAppAccountToken(
  supabase: ServiceClient,
  token: string | null | undefined,
): Promise<string | null> {
  if (!isUuid(token)) return null;
  try {
    const { data } = await supabase
      .from("profiles")
      .select("id")
      .eq("id", token)
      .maybeSingle();
    return typeof data?.id === "string" ? data.id : null;
  } catch {
    return null;
  }
}

export async function countRenewalNumber(
  supabase: ServiceClient,
  originalTransactionId: string,
  currentTransactionId: string | null,
): Promise<number | null> {
  try {
    const { data, error } = await supabase
      .from("apple_notification_log")
      .select("transaction_id")
      .eq("original_transaction_id", originalTransactionId)
      .not("transaction_id", "is", null);
    if (error) return currentTransactionId ? 1 : null;
    const ids = new Set<string>();
    for (const row of data ?? []) {
      if (typeof row.transaction_id === "string" && row.transaction_id.length > 0) {
        ids.add(row.transaction_id);
      }
    }
    if (currentTransactionId) ids.add(currentTransactionId);
    return ids.size > 0 ? ids.size : null;
  } catch {
    return currentTransactionId ? 1 : null;
  }
}

/**
 * Attribution as of this write, not today's person properties.
 * Prefer a referral invite bound to this OTID, then any claimed invite,
 * then the latest creator promo redemption.
 */
export async function lookupSubscriptionAttribution(
  supabase: ServiceClient,
  userId: string,
  originalTransactionId?: string | null,
): Promise<SubscriptionAttribution> {
  const empty: SubscriptionAttribution = {
    attribution_code: null,
    attribution_creator: null,
    attribution_source: null,
  };
  try {
    let inviteQuery = supabase
      .from("referral_invites")
      .select("sharer_user_id, claimed_original_transaction_id")
      .eq("claimed_by_user_id", userId)
      .in("status", ["claimed", "converted"])
      .order("claimed_at", { ascending: false })
      .limit(5);

    const { data: invites } = await inviteQuery;
    const inviteRows = invites ?? [];
    const matched = originalTransactionId
      ? inviteRows.find((row) => row.claimed_original_transaction_id === originalTransactionId)
      : undefined;
    const invite = matched ?? inviteRows[0] ?? null;

    if (invite?.sharer_user_id) {
      const { data: token } = await supabase
        .from("referral_share_tokens")
        .select("code")
        .eq("user_id", invite.sharer_user_id)
        .maybeSingle();
      return {
        attribution_code: typeof token?.code === "string" ? token.code : null,
        attribution_creator: invite.sharer_user_id,
        attribution_source: "referral",
      };
    }

    const { data: redemption } = await supabase
      .from("promo_code_redemptions")
      .select("promo_codes(code, creators(slug))")
      .eq("user_id", userId)
      .order("redeemed_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const promo = redemption?.promo_codes as
      | { code?: string; creators?: { slug?: string } | { slug?: string }[] | null }
      | { code?: string; creators?: { slug?: string } | { slug?: string }[] | null }[]
      | null;
    const promoRow = Array.isArray(promo) ? promo[0] : promo;
    const creator = promoRow?.creators;
    const creatorRow = Array.isArray(creator) ? creator[0] : creator;
    if (promoRow?.code) {
      return {
        attribution_code: promoRow.code,
        attribution_creator: creatorRow?.slug ?? null,
        attribution_source: "promo",
      };
    }
    return empty;
  } catch {
    return empty;
  }
}
