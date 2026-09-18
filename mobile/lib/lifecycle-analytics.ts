import { analytics } from '@/lib/analytics';

type LifecycleProps = Record<string, unknown>;

/** Auth events: `method` identifies the provider (email / apple / google). */
type AuthProps = LifecycleProps & {
  method?: string;
  reason?: string;
  post_paywall?: boolean;
};

/** Paywall events: identifiers come from `extractPaywallPresentationProps`. */
type PaywallProps = LifecycleProps & {
  source?: string;
  placement?: string | null;
  paywall_id?: string | null;
  paywall_identifier?: string | null;
  variant?: string | null;
};

/** Purchase events: product fields come from `extractPurchaseProductProps`. */
type PurchaseProps = LifecycleProps & {
  source?: string;
  product_id?: string | null;
  price?: number | null;
  currency?: string | null;
  period?: 'monthly' | 'annual' | null;
  is_trial?: boolean | null;
  trial_days?: number | null;
  original_transaction_id?: string | null;
  attribution_code?: string | null;
  attribution_creator?: string | null;
  attribution_source?: 'promo' | 'referral' | null;
  reason?: string;
};

function captureLifecycleEvent(event: string, properties?: LifecycleProps): void {
  analytics.capture(event, properties);
  if (__DEV__) analytics.flush();
}

export function trackSignupStarted(properties?: AuthProps): void {
  captureLifecycleEvent('signup_started', properties);
}

export function trackSignupCompleted(properties?: AuthProps): void {
  captureLifecycleEvent('signup_completed', properties);
}

export function trackSigninStarted(properties?: AuthProps): void {
  captureLifecycleEvent('signin_started', properties);
}

export function trackSigninCompleted(properties?: AuthProps): void {
  captureLifecycleEvent('signin_completed', properties);
}

export function trackSigninFailed(properties?: AuthProps): void {
  captureLifecycleEvent('signin_failed', properties);
}

export function trackPaywallPresented(properties?: PaywallProps): void {
  captureLifecycleEvent('paywall_presented', properties);
}

export function trackPurchaseStarted(properties?: PurchaseProps): void {
  captureLifecycleEvent('purchase_started', properties);
}

export function trackPurchaseCompleted(properties?: PurchaseProps): void {
  captureLifecycleEvent('purchase_completed', properties);
}

export function trackPurchaseFailed(properties?: PurchaseProps): void {
  captureLifecycleEvent('purchase_failed', properties);
}

export function trackPurchaseRestored(properties?: PurchaseProps): void {
  captureLifecycleEvent('purchase_restored', properties);
}
