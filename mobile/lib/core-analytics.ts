import { analytics } from '@/lib/analytics';

type CoreProps = Record<string, unknown>;

function captureCoreEvent(event: string, properties?: CoreProps): void {
  analytics.capture(event, properties);
  if (__DEV__) analytics.flush();
}

/** Home / workout funnel */
export function trackWodViewed(properties?: CoreProps): void {
  captureCoreEvent('wod_viewed', properties);
}

export function trackWodStarted(properties?: CoreProps): void {
  captureCoreEvent('wod_started', properties);
}

/** Lesson player */
export function trackLessonViewed(properties?: CoreProps): void {
  captureCoreEvent('lesson_viewed', properties);
}

export function trackLessonStarted(properties?: CoreProps): void {
  captureCoreEvent('lesson_started', properties);
}

export function trackLessonCompleted(properties?: CoreProps): void {
  captureCoreEvent('lesson_completed', properties);
}

/** Library */
export function trackLibraryLockedViewed(properties?: CoreProps): void {
  captureCoreEvent('library_locked_viewed', properties);
}

export function trackLibraryUnlocked(properties?: CoreProps): void {
  captureCoreEvent('library_unlocked', properties);
}

/** Shell affordances */
export function trackStreakViewed(properties?: CoreProps): void {
  captureCoreEvent('streak_viewed', properties);
}

export function trackProgressRingViewed(properties?: CoreProps): void {
  captureCoreEvent('progress_ring_viewed', properties);
}

/** Outbound referral partner (e.g. sports psych) — no PII beyond flags already safe for analytics */
export function trackPartnerReferralCtaClicked(properties: CoreProps): void {
  captureCoreEvent('partner_referral_cta_clicked', properties);
}

/** Reflections — never include journal body text */
export function trackReflectionPromptViewed(properties?: CoreProps): void {
  captureCoreEvent('reflection_prompt_viewed', properties);
}

export function trackReflectionSaved(properties?: CoreProps): void {
  captureCoreEvent('reflection_saved', properties);
}
