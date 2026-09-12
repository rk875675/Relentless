import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * State for the post-lesson referral popup (PRD 10.5.8).
 *
 * Two separate concerns live here:
 *
 * 1. A "a lesson was just finished" signal. Returning from a lesson is a bare
 *    `router.back()` with no params, so Home has no way to tell a post-lesson
 *    return from a plain tab switch. This mirrors `pending-deltas.ts`: the
 *    signal is deliberately in-memory, so it cannot survive an app restart and
 *    the popup only fires on a genuine same-session return.
 *
 * 2. The "at most twice per calendar month" cap, which does need to persist.
 */

const MAX_SHOWINGS_PER_MONTH = 2;

let _lessonJustCompleted = false;

/** Called from the lesson screen once a completion has been recorded. */
export function markLessonCompletedForReferral(): void {
  _lessonJustCompleted = true;
}

/**
 * Destructive read: the signal represents one specific return to Home, so it
 * is spent whether or not the popup ends up showing. If the popup yields to a
 * higher-priority prompt, the next completed lesson produces a fresh signal.
 */
export function takeLessonCompletedForReferral(): boolean {
  const value = _lessonJustCompleted;
  _lessonJustCompleted = false;
  return value;
}

/** Test/sign-out helper — keeps a stale signal from leaking across accounts. */
export function clearLessonCompletedForReferral(): void {
  _lessonJustCompleted = false;
}

function popupKey(userId: string): string {
  return `relentless:referral_popup_shown:${userId}`;
}

/** Local calendar month, since the cap is described to the user in their terms. */
function currentMonthKey(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

type ShownRecord = { ym: string; count: number };

/**
 * A storage failure deliberately PROPAGATES so the caller decides how to fail.
 * Only an absent or malformed value counts as "no record".
 */
async function loadRecord(userId: string): Promise<ShownRecord | null> {
  const raw = await AsyncStorage.getItem(popupKey(userId));
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (
      typeof parsed !== 'object' ||
      parsed === null ||
      typeof (parsed as ShownRecord).ym !== 'string' ||
      typeof (parsed as ShownRecord).count !== 'number'
    ) {
      return null;
    }
    return parsed as ShownRecord;
  } catch {
    return null;
  }
}

/**
 * Whether a showing is still available this calendar month.
 *
 * Fails CLOSED if the counter cannot be read: "at most twice per calendar
 * month" is a product rule, and a broken store must not turn the popup into
 * something that fires after every lesson. A malformed record is instead
 * treated as no showings yet — it self-heals on the next write, so it costs at
 * most one extra showing rather than uncapping it.
 */
export async function canShowReferralPopup(userId: string): Promise<boolean> {
  try {
    const record = await loadRecord(userId);
    if (!record || record.ym !== currentMonthKey()) return true;
    return record.count < MAX_SHOWINGS_PER_MONTH;
  } catch {
    return false;
  }
}

/**
 * Spends one of the month's showings. Called only once the popup is actually
 * presented — dismissing and tapping through both count the same, and yielding
 * to another prompt costs nothing.
 */
export async function recordReferralPopupShown(userId: string): Promise<void> {
  try {
    const ym = currentMonthKey();
    const record = await loadRecord(userId);
    const count = record && record.ym === ym ? record.count + 1 : 1;
    await AsyncStorage.setItem(popupKey(userId), JSON.stringify({ ym, count }));
  } catch {
    // A failed write would re-offer the popup next lesson. Acceptable: the
    // server-side eligibility check and the give-slot cap still bound it.
  }
}
