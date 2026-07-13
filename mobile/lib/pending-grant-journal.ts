import AsyncStorage from '@react-native-async-storage/async-storage';
import { apiFetch } from './api';

/**
 * Onboarding's Grant journal answer is POSTed to `/journal` fire-and-forget
 * during signup (never blocking the signup → app navigation). This key is
 * intentionally separate from `@relentless/onboarding_answers` so that
 * `clearOnboardingProgress()` (which wipes onboarding state wholesale right
 * after signup) does not also lose the answer before the POST has succeeded.
 */
const PENDING_KEY = '@relentless/pending_grant_journal';

async function savePendingGrantJournal(body: string): Promise<void> {
  await AsyncStorage.setItem(PENDING_KEY, body).catch(() => {});
}

async function clearPendingGrantJournal(): Promise<void> {
  await AsyncStorage.removeItem(PENDING_KEY).catch(() => {});
}

async function loadPendingGrantJournal(): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(PENDING_KEY);
  } catch {
    return null;
  }
}

/** ~2s then ~5s backoff between the 2 retries (3 attempts total). */
const RETRY_DELAYS_MS = [2000, 5000];

/**
 * POST the Grant onboarding journal answer, retrying up to 2 more times with
 * short backoff. Non-blocking — call this without awaiting. The answer is
 * kept in `PENDING_KEY` until a POST succeeds; if every attempt fails it is
 * left there for a possible later flush. `entry_type: 'onboarding_future_self'`
 * skips the `/journal` edge function's entitlement check, so failures here are
 * always network/server errors, never a missing-entitlement rejection.
 */
export async function postGrantJournalWithRetry(body: string): Promise<void> {
  await savePendingGrantJournal(body);
  for (let attempt = 0; ; attempt++) {
    const { error } = await apiFetch('/journal', {
      method: 'POST',
      body: { body, entry_type: 'onboarding_future_self' },
    });
    if (!error) {
      await clearPendingGrantJournal();
      return;
    }
    if (attempt >= RETRY_DELAYS_MS.length) {
      console.warn('[pending-grant-journal] all POST attempts failed, leaving pending for later flush:', error);
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, RETRY_DELAYS_MS[attempt]));
  }
}

/**
 * Flush a Grant journal answer left over from a previous attempt that
 * exhausted all retries (e.g. the app was killed mid-retry). Safe to call
 * unconditionally — it's a no-op when nothing is pending.
 */
export async function flushPendingGrantJournal(): Promise<void> {
  const pending = await loadPendingGrantJournal();
  const trimmed = pending?.trim();
  if (trimmed) {
    await postGrantJournalWithRetry(trimmed);
  }
}
