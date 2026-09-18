import AsyncStorage from '@react-native-async-storage/async-storage';
import { loadOnboardingAnswers } from '@/lib/onboarding-local-state';
import { postGrantJournalWithRetry } from '@/lib/pending-grant-journal';
import { trackSignupCompleted } from '@/lib/lifecycle-analytics';
import { trackOnboardingCompleted } from '@/lib/onboarding-analytics';
import { trackPackActivated } from '@/lib/core-analytics';
import { ONBOARDING_PROGRESS } from '@/lib/onboarding-progress';
import {
  GRANT_CHIASSON_COACH_KEY,
  GRANT_CHIASSON_NAME,
  GRANT_SPRINT_PROGRAM_ID,
  GRANT_SPRINT_PROGRAM_KEY,
  GRANT_SPRINT_PROGRAM_TITLE,
} from '@/lib/grant-attribution';

let extrasRanForUser: string | null = null;

const RAN_KEY_PREFIX = 'onboarding_extras_ran_';

/**
 * Journal + analytics that signup's Superwall path used to run only inside
 * finishPostPaywallSetup. Referral invitees complete onboarding from the
 * paywall overlay and skipped both. Safe to call more than once per user.
 *
 * Dedup is persisted per user: the in-memory guard resets on every JS reload,
 * which previously risked phantom `signup_completed` / `onboarding_completed`
 * events if this ever ran again for an already-completed user.
 */
export function runOnboardingCompletionExtras(userId: string): void {
  if (!userId || extrasRanForUser === userId) return;
  extrasRanForUser = userId;

  const ranKey = `${RAN_KEY_PREFIX}${userId}`;
  AsyncStorage.getItem(ranKey)
    .catch(() => null)
    .then((alreadyRan) => {
      if (alreadyRan) return;
      AsyncStorage.setItem(ranKey, '1').catch(() => {});

      loadOnboardingAnswers()
        .then((answers) => {
          const journalAnswer = answers.grantJournalAnswer?.trim();
          if (journalAnswer) void postGrantJournalWithRetry(journalAnswer);
        })
        .catch(() => {});

      trackSignupCompleted({ post_paywall: true });
      trackOnboardingCompleted({
        step_key: 'signup',
        step_index: ONBOARDING_PROGRESS.sportSelection + 2,
        source_route: '/signup',
        post_paywall: true,
      });
      // Default daily pack is Grant's sprint — users never tap "activate" for it.
      trackPackActivated({
        program_id: GRANT_SPRINT_PROGRAM_ID,
        program_key: GRANT_SPRINT_PROGRAM_KEY,
        program_title: GRANT_SPRINT_PROGRAM_TITLE,
        coach_key: GRANT_CHIASSON_COACH_KEY,
        coach_name: GRANT_CHIASSON_NAME,
        source: 'onboarding',
      });
    });
}
