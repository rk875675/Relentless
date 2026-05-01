import { analytics } from '@/lib/analytics';

type LifecycleProps = Record<string, unknown>;

function captureLifecycleEvent(event: string, properties?: LifecycleProps): void {
  analytics.capture(event, properties);
  if (__DEV__) analytics.flush();
}

export function trackSignupStarted(properties?: LifecycleProps): void {
  captureLifecycleEvent('signup_started', properties);
}

export function trackSignupCompleted(properties?: LifecycleProps): void {
  captureLifecycleEvent('signup_completed', properties);
}

export function trackSigninStarted(properties?: LifecycleProps): void {
  captureLifecycleEvent('signin_started', properties);
}

export function trackSigninCompleted(properties?: LifecycleProps): void {
  captureLifecycleEvent('signin_completed', properties);
}

export function trackSigninFailed(properties?: LifecycleProps): void {
  captureLifecycleEvent('signin_failed', properties);
}

export function trackPaywallPresented(properties?: LifecycleProps): void {
  captureLifecycleEvent('paywall_presented', properties);
}

export function trackPaywallProductSelected(properties?: LifecycleProps): void {
  captureLifecycleEvent('paywall_product_selected', properties);
}

export function trackPurchaseStarted(properties?: LifecycleProps): void {
  captureLifecycleEvent('purchase_started', properties);
}

export function trackPurchaseCompleted(properties?: LifecycleProps): void {
  captureLifecycleEvent('purchase_completed', properties);
}

export function trackPurchaseFailed(properties?: LifecycleProps): void {
  captureLifecycleEvent('purchase_failed', properties);
}

export function trackPurchaseRestored(properties?: LifecycleProps): void {
  captureLifecycleEvent('purchase_restored', properties);
}
