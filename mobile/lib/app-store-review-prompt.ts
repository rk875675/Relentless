import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import { requireOptionalNativeModule } from 'expo-modules-core';
import { isFeatureFlagEnabled } from './config-flags';

// Binaries built before expo-store-review was added do not contain the native
// module. requireOptionalNativeModule returns null instead of throwing, so we
// can safely detect its absence WITHOUT triggering a red-box error in dev.
// Only when the native module is present do we load the expo-store-review JS
// wrapper (whose top-level requireNativeModule would otherwise throw).
function getStoreReview(): typeof import('expo-store-review') | null {
  if (!requireOptionalNativeModule('ExpoStoreReview')) {
    return null;
  }
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require('expo-store-review');
}
import {
  trackAppStoreReviewPromptEligible,
  trackAppStoreReviewPromptRequested,
  trackAppStoreReviewPromptSkipped,
} from './core-analytics';

const KEYS = {
  LIFETIME_LESSONS_COMPLETED: 'app_review_lifetime_lessons',
  FIRST_LESSON_COMPLETED_AT: 'app_review_first_lesson_at',
  LAST_REVIEW_REQUEST_AT: 'app_review_last_request_at',
} as const;

const MIN_LESSONS = 1;
const MIN_DAYS_SINCE_LAST_REQUEST = 90;

function daysSince(isoString: string | null): number {
  if (!isoString) return Infinity;
  const diff = Date.now() - new Date(isoString).getTime();
  return diff / (1000 * 60 * 60 * 24);
}

export async function incrementLessonsCompleted(): Promise<void> {
  const raw = await AsyncStorage.getItem(KEYS.LIFETIME_LESSONS_COMPLETED);
  const current = raw ? parseInt(raw, 10) : 0;
  const next = (isNaN(current) ? 0 : current) + 1;
  await AsyncStorage.setItem(KEYS.LIFETIME_LESSONS_COMPLETED, String(next));

  const firstAt = await AsyncStorage.getItem(KEYS.FIRST_LESSON_COMPLETED_AT);
  if (!firstAt) {
    await AsyncStorage.setItem(KEYS.FIRST_LESSON_COMPLETED_AT, new Date().toISOString());
  }
}

export async function maybeRequestAppStoreReview(): Promise<void> {
  // Gate A: build-time flag baked into the binary — cannot be changed after install
  const buildEnabled =
    Constants.expoConfig?.extra?.enableAppStoreReviewPrompt === true;

  // In DEV allow only when build gate is explicitly true (QA override)
  if (__DEV__ && !buildEnabled) {
    trackAppStoreReviewPromptSkipped({ reason: 'dev' });
    return;
  }

  if (!buildEnabled) {
    trackAppStoreReviewPromptSkipped({ reason: 'build_gate_off' });
    return;
  }

  // iOS only
  if (Platform.OS !== 'ios') {
    trackAppStoreReviewPromptSkipped({ reason: 'not_ios' });
    return;
  }

  // Gate B: remote kill switch
  const flagEnabled = await isFeatureFlagEnabled('app_store_review_prompt');
  if (!flagEnabled) {
    trackAppStoreReviewPromptSkipped({ reason: 'flag_off' });
    return;
  }

  // Gate C: client eligibility
  const [rawCount, lastRequestAt] = await Promise.all([
    AsyncStorage.getItem(KEYS.LIFETIME_LESSONS_COMPLETED),
    AsyncStorage.getItem(KEYS.LAST_REVIEW_REQUEST_AT),
  ]);

  const count = rawCount ? parseInt(rawCount, 10) : 0;
  if (isNaN(count) || count < MIN_LESSONS) {
    trackAppStoreReviewPromptSkipped({ reason: 'threshold' });
    return;
  }

  if (lastRequestAt && daysSince(lastRequestAt) < MIN_DAYS_SINCE_LAST_REQUEST) {
    trackAppStoreReviewPromptSkipped({ reason: 'cooldown' });
    return;
  }

  trackAppStoreReviewPromptEligible();

  const StoreReview = getStoreReview();
  if (!StoreReview) {
    trackAppStoreReviewPromptSkipped({ reason: 'unavailable' });
    return;
  }

  const available = await StoreReview.isAvailableAsync();
  if (!available) {
    trackAppStoreReviewPromptSkipped({ reason: 'unavailable' });
    return;
  }

  trackAppStoreReviewPromptRequested();
  await AsyncStorage.setItem(KEYS.LAST_REVIEW_REQUEST_AT, new Date().toISOString());
  // Fire-and-forget: Apple controls whether the dialog actually appears
  StoreReview.requestReview();
}
