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

/**
 * Lesson pack (coach program) selection — covers every entry point where a
 * user can view or act on a pack (Library, Programs list, Pack detail).
 * `program_id` is the only stable identifier the /programs endpoints return
 * (no coach_key/program_key slug there, unlike /lessons) — use it + the
 * human-readable coach_name/program_title for breakdowns.
 */
export function trackPackOpened(
  properties: CoreProps & {
    program_id?: string | null;
    program_title?: string | null;
    coach_name?: string | null;
    source_screen: 'library';
  },
): void {
  captureCoreEvent('pack_opened', properties);
}

export function trackPackCtaClicked(
  properties: CoreProps & {
    program_id?: string | null;
    program_title?: string | null;
    coach_name?: string | null;
    /** activate = first-time switch; try_day1 = preview without switching. */
    action: 'activate' | 'continue' | 'restart' | 'try_day1' | 'start_today_workout';
    source_screen: 'programs' | 'pack_detail';
  },
): void {
  captureCoreEvent('pack_cta_clicked', properties);
}

/** Shell affordances */
export function trackStreakViewed(properties?: CoreProps): void {
  captureCoreEvent('streak_viewed', properties);
}

export function trackProgressRingViewed(properties?: CoreProps): void {
  captureCoreEvent('progress_ring_viewed', properties);
}

/** Outbound referral partner (e.g. sports psych) — no PII beyond flags already safe for analytics */
export function trackPartnerReferralCtaClicked(
  properties: CoreProps & {
    program_id?: string | null;
    program_key?: string | null;
    program_title?: string | null;
    coach_key?: string | null;
    /** Human-readable coach display name for PostHog breakdowns/tiles. */
    coach_name?: string | null;
  },
): void {
  captureCoreEvent('partner_referral_cta_clicked', properties);
}

/** Reflections — never include journal body text */
export function trackReflectionPromptViewed(properties?: CoreProps): void {
  captureCoreEvent('reflection_prompt_viewed', properties);
}

export function trackReflectionSaved(properties?: CoreProps): void {
  captureCoreEvent('reflection_saved', properties);
}

/** Push notifications (server-driven workout reminders) */
export function trackPushRemindersEnabled(
  properties: CoreProps & { source: 'profile_toggle' | 'home_prompt' },
): void {
  captureCoreEvent('push_reminders_enabled', properties);
}

export function trackPushRemindersDisabled(
  properties: CoreProps & {
    source: 'profile_toggle' | 'home_prompt' | 'home_schedule_cleared';
  },
): void {
  captureCoreEvent('push_reminders_disabled', properties);
}

export function trackPushPermissionDenied(
  properties: CoreProps & { source: 'profile_toggle' | 'home_prompt' },
): void {
  captureCoreEvent('push_permission_denied', properties);
}

/** App Store review prompt */
export function trackAppStoreReviewPromptEligible(properties?: CoreProps): void {
  captureCoreEvent('app_store_review_prompt_eligible', properties);
}

export function trackAppStoreReviewPromptRequested(properties?: CoreProps): void {
  captureCoreEvent('app_store_review_prompt_requested', properties);
}

export function trackAppStoreReviewPromptSkipped(
  properties: CoreProps & { reason: string },
): void {
  captureCoreEvent('app_store_review_prompt_skipped', properties);
}

export function trackAppStoreReviewManualTapped(properties?: CoreProps): void {
  captureCoreEvent('app_store_review_manual_tapped', properties);
}
