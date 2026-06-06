/**
 * Server-driven iOS push notification helpers.
 *
 * Responsibilities:
 * - Request iOS permission (only call after onboarding + first value moment).
 * - Obtain the Expo push token and device IANA timezone.
 * - POST token + timezone to /functions/v1/push-tokens.
 * - Disable reminders by setting push_reminders_enabled = false directly.
 *
 * No local notifications are scheduled here. All reminder logic lives on the
 * server (push-reminders Edge Function + pg_cron).
 */

import { Platform } from 'react-native';
import { apiFetch } from './api';
import { supabase } from './supabase';

// ── Permission ────────────────────────────────────────────────────────────────

/**
 * Requests iOS notification permission.
 * Returns true if permission is granted, false otherwise.
 * On Android always returns true (no runtime prompt needed in SDK 33+).
 */
export async function requestNotificationPermission(): Promise<boolean> {
  if (Platform.OS !== 'ios') return true;
  const Notifications = await import('expo-notifications');

  const { status: existing } = await Notifications.getPermissionsAsync();
  if (existing === 'granted') return true;
  if (existing === 'denied') return false;

  const { status } = await Notifications.requestPermissionsAsync({
    ios: {
      allowAlert: true,
      allowBadge: false,
      allowSound: true,
    },
  });

  return status === 'granted';
}

// ── Token registration ────────────────────────────────────────────────────────

/**
 * Gets the device IANA timezone string.
 * Falls back to 'America/New_York' if the API is unavailable.
 */
function getDeviceTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/New_York';
  } catch {
    return 'America/New_York';
  }
}

type RegisterResult =
  | { ok: true }
  | { ok: false; reason: 'permission_denied' | 'no_token' | 'api_error'; message?: string };

/**
 * Requests permission (if needed), obtains the Expo push token, and POSTs it
 * to the push-tokens Edge Function, which also flips
 * profiles.push_reminders_enabled = true on success.
 *
 * Call this after the user enables the toggle or completes onboarding.
 */
export async function registerForPushNotifications(): Promise<RegisterResult> {
  const granted = await requestNotificationPermission();
  if (!granted) {
    return { ok: false, reason: 'permission_denied' };
  }

  const Notifications = await import('expo-notifications');
  let tokenData: { data: string } | undefined;
  try {
    tokenData = await Notifications.getExpoPushTokenAsync();
  } catch (err) {
    return {
      ok: false,
      reason: 'no_token',
      message: err instanceof Error ? err.message : 'Could not get push token',
    };
  }

  const expoPushToken = tokenData.data;
  if (!expoPushToken) {
    return { ok: false, reason: 'no_token', message: 'Empty push token' };
  }

  const timezone = getDeviceTimezone();

  const { error } = await apiFetch('/push-tokens', {
    method: 'POST',
    body: { expo_push_token: expoPushToken, timezone, platform: 'ios' },
  });

  if (error) {
    return { ok: false, reason: 'api_error', message: error };
  }

  return { ok: true };
}

// ── Disable ───────────────────────────────────────────────────────────────────

/**
 * Disables server-driven push reminders for the current user by setting
 * profiles.push_reminders_enabled = false.
 *
 * Does NOT revoke iOS notification permission (user controls that in Settings).
 * Returns an error string or null on success.
 */
export async function disablePushReminders(userId: string): Promise<string | null> {
  const { error } = await supabase
    .from('profiles')
    .update({ push_reminders_enabled: false })
    .eq('id', userId);

  return error ? error.message : null;
}
