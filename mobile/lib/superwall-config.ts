import { Platform } from 'react-native';

/** Set to `1` or `true` to disable Superwall entirely (debug crashes / Expo Go). */
const SUPERWALL_DISABLE =
  process.env.EXPO_PUBLIC_SUPERWALL_DISABLE === '1' ||
  process.env.EXPO_PUBLIC_SUPERWALL_DISABLE === 'true';

/** Superwall public API key (iOS). Set EXPO_PUBLIC_SUPERWALL_IOS_API_KEY in `.env`. */
export const SUPERWALL_IOS_API_KEY =
  process.env.EXPO_PUBLIC_SUPERWALL_IOS_API_KEY ?? '';

/**
 * Placement id configured in the Superwall dashboard for the onboarding paywall.
 * Default: `onboarding_paywall` — create this placement and attach your remote paywall.
 *
 * App Store Guideline 3.1.2(c): the Superwall paywall shown for this placement should also
 * visibly include subscription title, each option’s period and localized price, a short value
 * description, and the same Terms + Privacy URLs as the in-app shell (`SubscriptionLegalDisclosure`).
 */
export const SUPERWALL_ONBOARDING_PLACEMENT =
  process.env.EXPO_PUBLIC_SUPERWALL_ONBOARDING_PLACEMENT ?? 'onboarding_paywall';

/**
 * App Store product ids (configure the same ids in Superwall / App Store Connect).
 * Reference only — not passed to the SDK unless you add placement params later.
 *
 * .b variants are split-test prices in the same subscription group as the originals.
 * Superwall experiments control which variant a user sees; the backend is product-ID-agnostic.
 */
export const STOREKIT_PRODUCT_IDS = {
  monthly: 'com.relentless.monthly',
  annual: 'com.relentless.annual',
  monthlyB: 'com.relentless.monthly.b',
  annualB: 'com.relentless.annual.b',
} as const;

const isNativeMobile = Platform.OS === 'ios' || Platform.OS === 'android';

function isSuperwallNativeAvailable(): boolean {
  try {
    const { requireNativeModule } = require('expo-modules-core');
    requireNativeModule('SuperwallExpo');
    return true;
  } catch {
    return false;
  }
}

export const SUPERWALL_ENABLED =
  !SUPERWALL_DISABLE &&
  isNativeMobile &&
  SUPERWALL_IOS_API_KEY.length > 0 &&
  isSuperwallNativeAvailable();
