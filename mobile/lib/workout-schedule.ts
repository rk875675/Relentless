/**
 * Local (on-device) workout-time reminders.
 *
 * This is fully SEPARATE from the server-driven push reminder system
 * (`push-notifications.ts` / `/push-tokens` / `push-reminders` cron):
 *   - it schedules a repeating DAILY local notification via expo-notifications
 *   - it NEVER registers a push token and NEVER touches
 *     `profiles.push_reminders_enabled` or any backend state
 *   - the chosen time is stored locally in AsyncStorage only
 *
 * Because iOS local notifications do not display while the app is foregrounded
 * (the expo-notifications plugin is configured with iosDisplayInForeground:false),
 * the reminder only surfaces when the user is NOT in the app at that time.
 *
 * Enabled for all users in every build (the Home Schedule button opens the
 * time wheel and calls into here). These functions have no environment guard.
 *
 * Double-fire reconciliation: the server's evening reminder (`push-reminders`
 * Edge Function) only fires at 19:00–19:59 user local time, and only if the
 * user hasn't completed today's WOD by then. Callers of `setWorkoutSchedule`
 * should skip registering the server-side push token/flag (see
 * `registerForPushNotifications` in `./push-notifications`) when the chosen
 * hour equals the server's fixed evening-nudge hour, so the two systems never
 * fire within the same hour for the same user. See `SERVER_EVENING_NUDGE_HOUR`
 * usage in `app/(tabs)/index.tsx`.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { requestNotificationPermission } from './push-notifications';

const STORAGE_KEY = '@relentless/workout_schedule';
/** Tag on our notification payload so we only ever cancel our own reminder. */
const NOTIFICATION_KIND = 'workout_schedule';

export type WorkoutSchedule = {
  /** Local hour, 0–23. */
  hour: number;
  /** Local minute, 0–59. */
  minute: number;
  /** expo-notifications identifier for the scheduled local notification. */
  notificationId?: string;
};

export type SetScheduleResult =
  | { ok: true; schedule: WorkoutSchedule }
  | { ok: false; reason: 'permission_denied' | 'error'; message?: string };

export async function loadWorkoutSchedule(): Promise<WorkoutSchedule | null> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (
      parsed &&
      typeof parsed.hour === 'number' &&
      typeof parsed.minute === 'number' &&
      parsed.hour >= 0 &&
      parsed.hour <= 23 &&
      parsed.minute >= 0 &&
      parsed.minute <= 59
    ) {
      return parsed as WorkoutSchedule;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Requests notification permission (OS-level only — no token registration),
 * cancels any existing workout reminder, schedules a new repeating daily
 * local notification at the given local time, and persists the choice.
 */
export async function setWorkoutSchedule(hour: number, minute: number): Promise<SetScheduleResult> {
  const granted = await requestNotificationPermission();
  if (!granted) return { ok: false, reason: 'permission_denied' };

  try {
    const Notifications = await import('expo-notifications');

    // Cancel only OUR previously-scheduled reminder before scheduling a new one.
    await cancelExistingReminder(Notifications);

    const notificationId = await Notifications.scheduleNotificationAsync({
      content: {
        title: 'Time for your workout',
        body: 'Open Relentless and complete your workout.',
        sound: true,
        data: { kind: NOTIFICATION_KIND },
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DAILY,
        hour,
        minute,
      },
    });

    const schedule: WorkoutSchedule = { hour, minute, notificationId };
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(schedule));
    return { ok: true, schedule };
  } catch (err) {
    return {
      ok: false,
      reason: 'error',
      message: err instanceof Error ? err.message : 'Could not schedule reminder',
    };
  }
}

/** Cancels the scheduled reminder (if any) and clears the stored choice. */
export async function clearWorkoutSchedule(): Promise<void> {
  try {
    const Notifications = await import('expo-notifications');
    await cancelExistingReminder(Notifications);
  } catch {
    /* ignore — still clear local state below */
  }
  await AsyncStorage.removeItem(STORAGE_KEY).catch(() => {});
}

async function cancelExistingReminder(
  Notifications: typeof import('expo-notifications'),
): Promise<void> {
  // Prefer the stored id; also scan for our tagged notification so we never
  // cancel unrelated scheduled notifications and never leave a duplicate.
  const existing = await loadWorkoutSchedule();
  if (existing?.notificationId) {
    await Notifications.cancelScheduledNotificationAsync(existing.notificationId).catch(() => {});
  }
  try {
    const all = await Notifications.getAllScheduledNotificationsAsync();
    await Promise.all(
      all
        .filter((n) => (n.content?.data as { kind?: string } | undefined)?.kind === NOTIFICATION_KIND)
        .map((n) => Notifications.cancelScheduledNotificationAsync(n.identifier).catch(() => {})),
    );
  } catch {
    /* ignore */
  }
}
