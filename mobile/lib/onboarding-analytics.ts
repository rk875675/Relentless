import * as Application from 'expo-application';
import { analytics } from '@/lib/analytics';
import { ONBOARDING_PROGRESS } from '@/lib/onboarding-progress';

type OnboardingEventProps = {
  step_key: string;
  step_index?: number;
  button_key?: string;
  exit_type?: string;
  next_route?: string | null;
  selected_option_key?: string;
  source_route?: string;
  previous_route?: string | null;
  time_on_step_ms?: number;
  [key: string]: unknown;
};

type OnboardingStep = {
  step_key: string;
  step_index: number;
};

/** Current shipped onboarding. Stamped on every onboarding event so V1 history stays filterable. */
export const ONBOARDING_FLOW = 'v2';

/** Route + wizard keys used by the current onboarding. Legacy keys stay on events but are excluded here. */
export const CURRENT_ONBOARDING_STEP_KEYS = [
  'welcome',
  'onboarding_intake',
  'intake_q0',
  'intake_q1',
  'intake_q2',
  'unlocked_potential',
  'mac_teaser',
  'mac_question',
  'we_can_train',
  'lesson_structure',
  'grant_intro',
  'onboarding_trophy',
  'tutorial',
  'tutorial_rings',
  'tutorial_wod',
  'tutorial_library',
  'sport_selection',
  'paywall',
  'signup',
] as const;

const APP_PROPS = {
  onboarding_flow: ONBOARDING_FLOW,
  ...(Application.nativeApplicationVersion ? { app_version: Application.nativeApplicationVersion } : {}),
  ...(Application.nativeBuildVersion ? { app_build: Application.nativeBuildVersion } : {}),
};

const ONBOARDING_ROUTE_STEPS: Record<string, OnboardingStep> = {
  // ── Active flow ────────────────────────────────────────────────────────────
  '/welcome': { step_key: 'welcome', step_index: 0 },
  '/onboarding-intake': { step_key: 'onboarding_intake', step_index: ONBOARDING_PROGRESS.intakeStart },
  '/unlocked-potential': { step_key: 'unlocked_potential', step_index: ONBOARDING_PROGRESS.unlockedPotential },
  '/mac-teaser': { step_key: 'mac_teaser', step_index: ONBOARDING_PROGRESS.macTeaser },
  '/mac-question': { step_key: 'mac_question', step_index: ONBOARDING_PROGRESS.macQuestion },
  '/we-can-train': { step_key: 'we_can_train', step_index: ONBOARDING_PROGRESS.weCanTrain },
  '/lesson-structure': { step_key: 'lesson_structure', step_index: ONBOARDING_PROGRESS.lessonStructure },
  '/grant-intro': { step_key: 'grant_intro', step_index: ONBOARDING_PROGRESS.grantIntro },
  '/onboarding-trophy': { step_key: 'onboarding_trophy', step_index: ONBOARDING_PROGRESS.onboardingTrophy },
  '/tutorial': { step_key: 'tutorial', step_index: ONBOARDING_PROGRESS.tutorialStart },
  '/sport-selection': { step_key: 'sport_selection', step_index: ONBOARDING_PROGRESS.sportSelection },
  '/paywall': { step_key: 'paywall', step_index: ONBOARDING_PROGRESS.sportSelection + 1 },
  '/signup': { step_key: 'signup', step_index: ONBOARDING_PROGRESS.sportSelection + 2 },

  // ── Legacy routes (kept for backward-compat analytics; not in active flow) ─
  '/relentless-intro': { step_key: 'relentless_intro', step_index: 1 },
  '/competition-date': { step_key: 'competition_date', step_index: 14 },
  '/mac-framework': { step_key: 'mac_framework', step_index: 11 },
  '/mac-detail': { step_key: 'mac_detail', step_index: 13 },
  '/effort-response': { step_key: 'effort_response', step_index: 3 },
  '/why-relentless': { step_key: 'why_relentless', step_index: 4 },
  '/how-it-works': { step_key: 'how_it_works', step_index: 5 },
  '/study-a': { step_key: 'study_a', step_index: 6 },
  '/study-b': { step_key: 'study_b', step_index: 7 },
  '/social-proof': { step_key: 'social_proof', step_index: 8 },
  '/mac-setup': { step_key: 'mac_setup', step_index: 13 },
  '/exercise-m': { step_key: 'exercise_m', step_index: 10 },
  '/exercise-a': { step_key: 'exercise_a', step_index: 10 },
  '/exercise-c': { step_key: 'exercise_c', step_index: 10 },
  '/what-you-get': { step_key: 'what_you_get', step_index: 11 },
  '/tutorial-home': { step_key: 'tutorial_home', step_index: 15 },
  '/tutorial-home-detail': { step_key: 'tutorial_home_detail', step_index: 16 },
  '/tutorial-library': { step_key: 'tutorial_library', step_index: 18 },
  '/tutorial-library-detail': { step_key: 'tutorial_library_detail', step_index: 19 },
  '/tutorial-profile': { step_key: 'tutorial_profile', step_index: 20 },
};

function propsWithApp(props: OnboardingEventProps): OnboardingEventProps {
  return { ...APP_PROPS, ...props };
}

function captureOnboardingEvent(event: string, props: OnboardingEventProps): void {
  analytics.capture(event, propsWithApp(props));
  if (__DEV__) analytics.flush();
}

export function getOnboardingStepForRoute(route: string): OnboardingStep | null {
  return ONBOARDING_ROUTE_STEPS[route] ?? null;
}

export function trackOnboardingStarted(props: OnboardingEventProps): void {
  captureOnboardingEvent('onboarding_started', props);
}

export function trackOnboardingScreenViewed(props: OnboardingEventProps): void {
  captureOnboardingEvent('onboarding_screen_viewed', props);
}

export function trackOnboardingScreenExited(props: OnboardingEventProps): void {
  captureOnboardingEvent('onboarding_screen_exited', props);
}

export function trackOnboardingButtonClicked(props: OnboardingEventProps): void {
  captureOnboardingEvent('onboarding_button_clicked', props);
}

export function trackOnboardingOptionSelected(props: OnboardingEventProps): void {
  captureOnboardingEvent('onboarding_option_selected', props);
}

export function trackOnboardingCompetitionDateAdded(props: OnboardingEventProps): void {
  captureOnboardingEvent('onboarding_competition_date_added', props);
}

export function trackOnboardingPaywallViewed(props: OnboardingEventProps): void {
  captureOnboardingEvent('onboarding_paywall_viewed', props);
}

export function trackOnboardingPaywallDismissed(props: OnboardingEventProps): void {
  captureOnboardingEvent('onboarding_paywall_dismissed', props);
}

export function trackOnboardingCompleted(props: OnboardingEventProps): void {
  captureOnboardingEvent('onboarding_completed', props);
}

// ── Grant intro sub-events (new screen; distinct phases warrant own event names) ─

export function trackOnboardingGrantVideoStarted(props: OnboardingEventProps): void {
  captureOnboardingEvent('onboarding_grant_video_started', props);
}

export function trackOnboardingGrantJournalSubmitted(props: OnboardingEventProps): void {
  captureOnboardingEvent('onboarding_grant_journal_submitted', props);
}

export function trackOnboardingGrantVideoCompleted(props: OnboardingEventProps): void {
  captureOnboardingEvent('onboarding_grant_video_completed', props);
}

type WizardStepClock = OnboardingStep & { enteredAt: number };

/**
 * Extra viewed/exited events for wizard pages that stay on one route.
 * Uses the same event names as route-level tracking so dashboards stay one breakdown.
 */
export function trackOnboardingWizardStepChanged(args: {
  previous: WizardStepClock | null;
  next: OnboardingStep | null;
  next_route?: string | null;
}): WizardStepClock | null {
  if (args.previous) {
    trackOnboardingScreenExited({
      step_key: args.previous.step_key,
      step_index: args.previous.step_index,
      exit_type: args.next ? 'wizard_step_change' : 'route_change',
      next_route: args.next_route ?? args.next?.step_key ?? null,
      time_on_step_ms: Date.now() - args.previous.enteredAt,
    });
  }
  if (!args.next) return null;
  trackOnboardingScreenViewed({
    step_key: args.next.step_key,
    step_index: args.next.step_index,
    source_route: args.next.step_key,
  });
  return { ...args.next, enteredAt: Date.now() };
}
