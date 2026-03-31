import { Platform } from 'react-native';

/** Superwall public API key (iOS). Set EXPO_PUBLIC_SUPERWALL_IOS_API_KEY in `.env`. */
export const SUPERWALL_IOS_API_KEY =
  process.env.EXPO_PUBLIC_SUPERWALL_IOS_API_KEY ?? '';

/**
 * Placement id configured in the Superwall dashboard for the onboarding paywall.
 * Default: `onboarding_paywall` — create this placement and attach your remote paywall.
 */
export const SUPERWALL_ONBOARDING_PLACEMENT =
  process.env.EXPO_PUBLIC_SUPERWALL_ONBOARDING_PLACEMENT ?? 'onboarding_paywall';

/**
 * App Store product ids (configure the same ids in Superwall / App Store Connect).
 * Reference only — not passed to the SDK unless you add placement params later.
 */
export const STOREKIT_PRODUCT_IDS = {
  monthly: 'com.relentless.monthly',
  annual: 'com.relentless.annual',
} as const;

const isNativeMobile = Platform.OS === 'ios' || Platform.OS === 'android';

function isSuperwallModuleAvailable(): boolean {
  try {
    require('expo-superwall');
    return true;
  } catch {
    return false;
  }
}

export const SUPERWALL_ENABLED =
  isNativeMobile && SUPERWALL_IOS_API_KEY.length > 0 && isSuperwallModuleAvailable();
