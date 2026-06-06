import { z } from "https://esm.sh/zod@3";
import { createServiceClient } from "../_shared/supabase.ts";
import {
  corsHeaders,
  generateRequestId,
  errorResponse,
  successResponse,
} from "../_shared/response.ts";

// ── Body schema ──────────────────────────────────────────────────────────────

const RunBodySchema = z.object({
  dryRun: z.boolean().optional().default(false),
  limit: z.number().int().min(1).max(500).optional().default(100),
  /** When true, is_dev accounts are included (useful for manual QA sends). */
  includeDevUsers: z.boolean().optional().default(false),
}).strict();

// ── Types ────────────────────────────────────────────────────────────────────

type RawCandidate = {
  user_id: string;
  expo_push_token: string;
  timezone: string;
  push_reminders_enabled: boolean;
  onboarding_completed: boolean;
  is_dev: boolean;
  last_wod_completion_local_date: string | null;
  entitlement_status: string;
  entitlement_expires_at: string | null;
  last_activity_date: string | null;
};

type ReminderType = "evening_nudge" | "multi_day_miss";

type ResolvedCandidate = {
  userId: string;
  expoPushToken: string;
  reminderType: ReminderType;
  localDate: string;
  days: number; // 0 for evening_nudge, >=2 for multi_day_miss
};

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Returns the user's local calendar date (YYYY-MM-DD) and local hour (0-23)
 * using the stored IANA timezone. Falls back to UTC on invalid timezone.
 */
function getUserLocalDateTime(timezone: string): { localDate: string; localHour: number } {
  const now = new Date();
  try {
    const localDateStr = new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(now);

    const localHourStr = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      hour: "numeric",
      hour12: false,
    }).format(now);

    const localHour = parseInt(localHourStr, 10);
    return { localDate: localDateStr, localHour: isNaN(localHour) ? now.getUTCHours() : localHour };
  } catch {
    const y = now.getUTCFullYear();
    const m = String(now.getUTCMonth() + 1).padStart(2, "0");
    const d = String(now.getUTCDate()).padStart(2, "0");
    return { localDate: `${y}-${m}-${d}`, localHour: now.getUTCHours() };
  }
}

/**
 * Calendar-day difference between two YYYY-MM-DD strings.
 * Positive means lastDate is in the past relative to localDate.
 */
function calendarDaysBetween(lastDate: string, localDate: string): number {
  const a = new Date(lastDate + "T00:00:00");
  const b = new Date(localDate + "T00:00:00");
  return Math.round((b.getTime() - a.getTime()) / 86_400_000);
}

/**
 * Mirrors requireEntitlement() in _shared/entitlement.ts.
 * Returns true only for trial/active that haven't expired.
 */
function isEntitlementValid(status: string, expiresAt: string | null): boolean {
  if (status !== "trial" && status !== "active") return false;
  if (expiresAt && new Date(expiresAt) < new Date()) return false;
  return true;
}

/**
 * Resolves which reminder type (if any) a candidate should receive right now.
 * Priority: multi_day_miss > evening_nudge.
 * Returns null if neither applies.
 */
function resolveReminderType(
  candidate: RawCandidate,
  localDate: string,
  localHour: number,
): { type: ReminderType; days: number } | null {
  // Must be in the 19:00–19:59 evening window
  if (localHour !== 19) return null;

  // multi_day_miss: last_activity_date is non-null and ≥2 calendar days ago
  if (candidate.last_activity_date) {
    const days = calendarDaysBetween(candidate.last_activity_date, localDate);
    if (days >= 2) {
      return { type: "multi_day_miss", days };
    }
  }

  // evening_nudge: today's WOD not yet completed
  if (candidate.last_wod_completion_local_date !== localDate) {
    return { type: "evening_nudge", days: 0 };
  }

  return null;
}

// ── Expo Push API ─────────────────────────────────────────────────────────────

type ExpoPushResult =
  | { ok: true }
  | { ok: false; deviceNotRegistered: boolean; message: string };

async function sendExpoPush(
  accessToken: string,
  to: string,
  title: string,
  body: string,
  requestId: string,
): Promise<ExpoPushResult> {
  try {
    const res = await fetch("https://exp.host/--/api/v2/push/send", {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ to, title, body, sound: "default" }),
    });

    const json = (await res.json().catch(() => ({}))) as {
      data?: { status?: string; details?: { error?: string }; message?: string };
    };

    if (!res.ok) {
      return {
        ok: false,
        deviceNotRegistered: false,
        message: `Expo API returned ${res.status}`,
      };
    }

    const data = json.data;
    if (data?.status === "error") {
      const isUnregistered = data.details?.error === "DeviceNotRegistered";
      return {
        ok: false,
        deviceNotRegistered: isUnregistered,
        message: data.details?.error ?? data.message ?? "Expo push error",
      };
    }

    return { ok: true };
  } catch (err) {
    console.error("[push-reminders] Expo push network error", {
      requestId,
      message: err instanceof Error ? err.message : String(err),
    });
    return {
      ok: false,
      deviceNotRegistered: false,
      message: err instanceof Error ? err.message : "Network error",
    };
  }
}

// ── Main handler ─────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const requestId = generateRequestId();

  if (req.method !== "POST") {
    return errorResponse(405, "VALIDATION_ERROR", "Method not allowed", requestId);
  }

  // Gate: feature flag must be explicitly enabled
  const remindersEnabled = Deno.env.get("PUSH_REMINDERS_ENABLED");
  if (remindersEnabled !== "true") {
    console.log("[push-reminders] PUSH_REMINDERS_ENABLED is not 'true' — no-op", { requestId });
    return successResponse({ enabled: false, sent: 0 }, requestId);
  }

  // Auth: x-cron-secret
  const cronSecret = Deno.env.get("PUSH_REMINDER_CRON_SECRET") ?? "";
  const providedSecret = req.headers.get("x-cron-secret") ?? "";
  if (!cronSecret || providedSecret !== cronSecret) {
    return errorResponse(401, "UNAUTHENTICATED", "Invalid cron secret", requestId);
  }

  // Expo access token (required unless dryRun)
  const expoAccessToken = Deno.env.get("EXPO_ACCESS_TOKEN") ?? "";

  let body: unknown = {};
  try {
    const text = await req.text();
    body = text ? JSON.parse(text) : {};
  } catch {
    return errorResponse(400, "VALIDATION_ERROR", "Invalid JSON body", requestId);
  }

  const parsed = RunBodySchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse(
      400,
      "VALIDATION_ERROR",
      parsed.error.issues[0]?.message ?? "Invalid request body",
      requestId,
    );
  }

  const { dryRun, limit, includeDevUsers } = parsed.data;

  if (!dryRun && !expoAccessToken) {
    console.error("[push-reminders] EXPO_ACCESS_TOKEN not configured", { requestId });
    return errorResponse(500, "INTERNAL_ERROR", "Expo access token not configured", requestId);
  }

  const supabase = createServiceClient();

  // ── Query candidates ───────────────────────────────────────────────────────
  // Three flat queries instead of one complex multi-table join, since there
  // is no direct FK from push_tokens to entitlements.

  // 1. Active/trial entitlements (rough filter — expiry checked client-side)
  const { data: entRows, error: entError } = await supabase
    .from("entitlements")
    .select("user_id, status, expires_at")
    .in("status", ["trial", "active"])
    .limit(limit * 3);

  if (entError) {
    console.error("[push-reminders] Failed to query entitlements", {
      requestId,
      message: entError.message,
    });
    return errorResponse(500, "INTERNAL_ERROR", "Failed to load candidates", requestId);
  }

  const validEntMap = new Map<string, { status: string; expires_at: string | null }>();
  for (const e of (entRows ?? [])) {
    if (isEntitlementValid(e.status, e.expires_at)) {
      validEntMap.set(e.user_id, { status: e.status, expires_at: e.expires_at });
    }
  }

  if (validEntMap.size === 0) {
    return successResponse({ dry_run: dryRun, checked: 0, eligible: 0, sent: 0 }, requestId);
  }

  const eligibleUserIds = [...validEntMap.keys()];

  // 2. Profiles: onboarded + reminders enabled
  const { data: profileRows, error: profileError } = await supabase
    .from("profiles")
    .select("id, push_reminders_enabled, onboarding_completed, is_dev, last_wod_completion_local_date")
    .in("id", eligibleUserIds)
    .eq("push_reminders_enabled", true)
    .eq("onboarding_completed", true);

  if (profileError) {
    console.error("[push-reminders] Failed to query profiles", {
      requestId,
      message: profileError.message,
    });
    return errorResponse(500, "INTERNAL_ERROR", "Failed to load candidates", requestId);
  }

  const profileMap = new Map<string, {
    is_dev: boolean;
    last_wod_completion_local_date: string | null;
  }>();
  for (const p of (profileRows ?? [])) {
    profileMap.set(p.id, {
      is_dev: p.is_dev,
      last_wod_completion_local_date: p.last_wod_completion_local_date,
    });
  }

  if (profileMap.size === 0) {
    return successResponse({ dry_run: dryRun, checked: 0, eligible: 0, sent: 0 }, requestId);
  }

  const onboardedUserIds = [...profileMap.keys()];

  // 3. Push tokens (active only)
  const { data: tokenRows, error: tokenError } = await supabase
    .from("push_tokens")
    .select("user_id, expo_push_token, timezone")
    .in("user_id", onboardedUserIds)
    .is("disabled_at", null);

  if (tokenError) {
    console.error("[push-reminders] Failed to query push_tokens", {
      requestId,
      message: tokenError.message,
    });
    return errorResponse(500, "INTERNAL_ERROR", "Failed to load candidates", requestId);
  }

  // 4. User streaks
  const { data: streakRows } = await supabase
    .from("user_streaks")
    .select("user_id, last_activity_date")
    .in("user_id", onboardedUserIds);

  const streakMap = new Map<string, string | null>();
  for (const s of (streakRows ?? [])) {
    streakMap.set(s.user_id, s.last_activity_date);
  }

  // Build flat candidate list (one row per token)
  const candidates: RawCandidate[] = (tokenRows ?? []).map((t) => {
    const profile = profileMap.get(t.user_id)!;
    const ent = validEntMap.get(t.user_id)!;
    return {
      user_id: t.user_id,
      expo_push_token: t.expo_push_token,
      timezone: t.timezone,
      push_reminders_enabled: true,
      onboarding_completed: true,
      is_dev: profile.is_dev,
      last_wod_completion_local_date: profile.last_wod_completion_local_date,
      entitlement_status: ent.status,
      entitlement_expires_at: ent.expires_at,
      last_activity_date: streakMap.get(t.user_id) ?? null,
    };
  });

  const result = {
    dry_run: dryRun,
    checked: candidates.length,
    eligible: 0,
    sent: 0,
    skipped_duplicate: 0,
    skipped_out_of_window: 0,
    skipped_wod_complete: 0,
    skipped_entitlement_expired: 0,
    skipped_dev: 0,
    failed: 0,
    dry_run_would_send: [] as Array<{
      user_id: string;
      reminder_type: string;
      local_date: string;
      days: number;
    }>,
  };

  for (const candidate of candidates) {
    // Skip is_dev accounts unless explicitly requested
    if (candidate.is_dev && !includeDevUsers) {
      result.skipped_dev += 1;
      continue;
    }

    // Entitlement expiry check (mirrors requireEntitlement)
    if (!isEntitlementValid(candidate.entitlement_status, candidate.entitlement_expires_at)) {
      result.skipped_entitlement_expired += 1;
      continue;
    }

    // Compute user local time
    const { localDate, localHour } = getUserLocalDateTime(candidate.timezone);

    // Resolve which reminder type applies (if any)
    const resolved = resolveReminderType(candidate, localDate, localHour);
    if (!resolved) {
      if (localHour !== 19) {
        result.skipped_out_of_window += 1;
      } else {
        result.skipped_wod_complete += 1;
      }
      continue;
    }

    result.eligible += 1;

    // Build notification copy
    const title = "Relentless";
    const body =
      resolved.type === "multi_day_miss"
        ? `It's been ${resolved.days} days since your last workout. Pick up where you left off.`
        : "Your daily workout is waiting.";

    if (dryRun) {
      result.dry_run_would_send.push({
        user_id: candidate.user_id,
        reminder_type: resolved.type,
        local_date: localDate,
        days: resolved.days,
      });
      continue;
    }

    // Claim the send slot (dedupe: unique on user_id, local_date, reminder_type)
    const { data: claimData, error: claimError } = await supabase
      .from("push_notification_sends")
      .insert({
        user_id: candidate.user_id,
        local_date: localDate,
        reminder_type: resolved.type,
        expo_push_token: candidate.expo_push_token,
        dry_run: false,
        metadata: { request_id: requestId, days: resolved.days },
      })
      .select("id")
      .single();

    if (claimError) {
      if (claimError.code === "23505") {
        result.skipped_duplicate += 1;
        continue;
      }
      console.error("[push-reminders] Failed to claim send slot", {
        requestId,
        userId: candidate.user_id,
        message: claimError.message,
      });
      result.failed += 1;
      continue;
    }

    // Send the notification
    const pushResult = await sendExpoPush(
      expoAccessToken,
      candidate.expo_push_token,
      title,
      body,
      requestId,
    );

    if (pushResult.ok) {
      await supabase
        .from("push_notification_sends")
        .update({ sent_at: new Date().toISOString() })
        .eq("id", claimData.id);
      result.sent += 1;
      continue;
    }

    // Handle DeviceNotRegistered: disable the token so it is excluded from future runs
    if (pushResult.deviceNotRegistered) {
      await supabase
        .from("push_tokens")
        .update({ disabled_at: new Date().toISOString() })
        .eq("expo_push_token", candidate.expo_push_token);
    }

    console.error("[push-reminders] Push send failed", {
      requestId,
      userId: candidate.user_id,
      reminderType: resolved.type,
      deviceNotRegistered: pushResult.deviceNotRegistered,
      message: pushResult.message,
    });

    await supabase
      .from("push_notification_sends")
      .update({
        metadata: {
          request_id: requestId,
          days: resolved.days,
          error: pushResult.message,
          device_not_registered: pushResult.deviceNotRegistered,
        },
      })
      .eq("id", claimData.id);

    result.failed += 1;
  }

  return successResponse(result, requestId);
});
