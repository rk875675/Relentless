import { loadPendingPromoCode } from '@/lib/promo-code-state';
import { loadPendingReferralClaim } from '@/lib/referral-claim-state';

export type PurchaseProductProps = {
  product_id: string | null;
  price: number | null;
  currency: string | null;
  period: 'monthly' | 'annual' | null;
  is_trial: boolean | null;
  trial_days: number | null;
};

export type PaywallPresentationProps = {
  paywall_id: string | null;
  paywall_identifier: string | null;
  placement: string | null;
  variant: string | null;
};

export type AttributionProps = {
  attribution_code: string | null;
  attribution_creator: string | null;
  attribution_source: 'promo' | 'referral' | null;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : null;
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function asNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function readNested(root: Record<string, unknown>, path: string[]): unknown {
  let current: unknown = root;
  for (const key of path) {
    const rec = asRecord(current);
    if (!rec) return undefined;
    current = rec[key];
  }
  return current;
}

function firstString(root: Record<string, unknown>, paths: string[][]): string | null {
  for (const path of paths) {
    const value = asString(readNested(root, path));
    if (value) return value;
  }
  return null;
}

function firstNumber(root: Record<string, unknown>, paths: string[][]): number | null {
  for (const path of paths) {
    const value = asNumber(readNested(root, path));
    if (value != null) return value;
  }
  return null;
}

function periodFromProductId(productId: string | null): 'monthly' | 'annual' | null {
  if (!productId) return null;
  const lower = productId.toLowerCase();
  if (lower.includes('annual') || lower.includes('year')) return 'annual';
  if (lower.includes('month')) return 'monthly';
  return null;
}

function periodFromUnit(unit: string | null, value: number | null): 'monthly' | 'annual' | null {
  if (!unit) return null;
  const lower = unit.toLowerCase();
  if (lower === 'year' || lower === 'annual') return 'annual';
  if (lower === 'month' || lower === 'monthly') return 'monthly';
  if (lower === 'week' && value === 52) return 'annual';
  return null;
}

function trialDaysFromPeriod(unit: string | null, value: number | null): number | null {
  if (!unit || value == null || value <= 0) return null;
  switch (unit.toLowerCase()) {
    case 'day':
      return value;
    case 'week':
      return value * 7;
    case 'month':
      return value * 30;
    case 'year':
      return value * 365;
    default:
      return null;
  }
}

export function extractPurchaseProductProps(merged: Record<string, unknown>): PurchaseProductProps {
  const product = asRecord(merged.product) ?? asRecord(merged.storeProduct) ?? {};
  const productId =
    firstString(merged, [
      ['productId'],
      ['productIdentifier'],
      ['product', 'productIdentifier'],
      ['product', 'productId'],
      ['storeProduct', 'productIdentifier'],
      ['transaction', 'productIdentifier'],
    ]) ?? asString(product.productIdentifier) ?? asString(product.productId);

  const price =
    firstNumber(merged, [
      ['price'],
      ['product', 'price'],
      ['storeProduct', 'price'],
      ['product', 'priceValue'],
    ]) ?? asNumber(product.price);

  const currency =
    firstString(merged, [
      ['currencyCode'],
      ['currency'],
      ['product', 'currencyCode'],
      ['product', 'currency'],
      ['storeProduct', 'currencyCode'],
    ]) ?? asString(product.currencyCode) ?? asString(product.currency);

  const periodUnit =
    firstString(merged, [
      ['product', 'subscriptionPeriod', 'unit'],
      ['storeProduct', 'subscriptionPeriod', 'unit'],
      ['subscriptionPeriod', 'unit'],
    ]) ?? asString(asRecord(product.subscriptionPeriod)?.unit);
  const periodValue =
    firstNumber(merged, [
      ['product', 'subscriptionPeriod', 'value'],
      ['storeProduct', 'subscriptionPeriod', 'value'],
      ['subscriptionPeriod', 'value'],
    ]) ?? asNumber(asRecord(product.subscriptionPeriod)?.value);

  const intro = asRecord(product.introductoryDiscount) ?? asRecord(merged.introductoryDiscount);
  const introPeriod = asRecord(intro?.subscriptionPeriod);
  const paymentMode = asString(intro?.paymentMode) ?? asString(product.introductoryOfferPaymentMode);
  const isTrial =
    product.hasFreeTrial === true ||
    merged.hasFreeTrial === true ||
    paymentMode?.toLowerCase() === 'freetrial' ||
    paymentMode?.toLowerCase() === 'free_trial' ||
    asString(merged.offerDiscountType)?.toUpperCase() === 'FREE_TRIAL';

  return {
    product_id: productId,
    price,
    currency,
    period: periodFromUnit(periodUnit, periodValue) ?? periodFromProductId(productId),
    // Boolean when we actually saw product data (so `false` means "confirmed
    // not a trial"); null only when the event carried no product info at all.
    is_trial: productId != null ? isTrial : null,
    trial_days: trialDaysFromPeriod(asString(introPeriod?.unit), asNumber(introPeriod?.value)),
  };
}

export function extractPaywallPresentationProps(
  merged: Record<string, unknown>,
): PaywallPresentationProps {
  const paywallInfo = asRecord(merged.paywallInfo) ?? asRecord(merged.paywall) ?? {};
  const experiment = asRecord(merged.experiment) ?? asRecord(paywallInfo.experiment);
  const variant = asRecord(experiment?.variant) ?? asRecord(merged.variant);

  return {
    paywall_id:
      firstString(merged, [['paywallId'], ['paywall_id'], ['paywallInfo', 'id'], ['paywall', 'id']]) ??
      asString(paywallInfo.id),
    paywall_identifier:
      firstString(merged, [
        ['paywallIdentifier'],
        ['identifier'],
        ['paywallInfo', 'identifier'],
        ['paywall', 'identifier'],
      ]) ?? asString(paywallInfo.identifier) ?? asString(paywallInfo.name),
    placement:
      firstString(merged, [
        ['placement'],
        ['placementName'],
        ['presentedByPlacementWithName'],
        ['presentedByEventWithName'],
        ['eventName'],
        ['name'],
      ]),
    variant:
      asString(variant?.id) ??
      asString(experiment?.variantId) ??
      firstString(merged, [['variantId'], ['variant', 'id'], ['experiment', 'variantId']]),
  };
}

export async function loadLocalAttribution(): Promise<AttributionProps> {
  try {
    const [promo, referral] = await Promise.all([
      loadPendingPromoCode(),
      loadPendingReferralClaim(),
    ]);
    if (referral?.code) {
      return {
        attribution_code: referral.code,
        attribution_creator: null,
        attribution_source: 'referral',
      };
    }
    if (promo?.code) {
      return {
        attribution_code: promo.code,
        attribution_creator: promo.creatorSlug,
        attribution_source: 'promo',
      };
    }
  } catch {
    // Analytics must never block checkout.
  }
  return {
    attribution_code: null,
    attribution_creator: null,
    attribution_source: null,
  };
}
