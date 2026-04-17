import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

/** Matches `program_schedule.program_version` (see migrations). */
export const DEFAULT_PROGRAM_VERSION = "v1";

function parseYmdUtc(ymd: string): number {
  const [y, m, d] = ymd.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
}

/**
 * Inclusive calendar span between two YYYY-MM-DD strings (pure date math).
 * If `end` is before `start` (clock skew), returns 1.
 */
export function calendarDaysInclusiveYmd(
  startYmd: string,
  endYmd: string,
): number {
  const s = parseYmdUtc(startYmd);
  const e = parseYmdUtc(endYmd);
  if (e < s) return 1;
  return Math.floor((e - s) / 86_400_000) + 1;
}

// ---------------------------------------------------------------------------
// Library lock result
// ---------------------------------------------------------------------------
export type LibraryLockResult =
  | { unlocked: true; remaining: 0 }
  | { unlocked: false; reason: "TODAY_WOD"; remaining: 1 }
  | { unlocked: false; reason: "BEHIND"; remaining: number };

/**
 * PRD-aligned library gate.
 *
 * `remaining` = how many more WODs the user must complete to unlock.
 *   remaining = max(0, expectedThrough - (currentDay - 1))
 *   (each caught-up day = one completed program day)
 *
 * Special case: after completing day 30, library stays permanently unlocked.
 */
export async function computeLibraryUnlocked(
  supabase: SupabaseClient,
  userId: string,
  localTodayYmd: string,
  programVersion: string = DEFAULT_PROGRAM_VERSION,
): Promise<LibraryLockResult> {
  const { data: profile, error: err } = await supabase
    .from("profiles")
    .select("program_start_date, current_program_day, is_dev")
    .eq("id", userId)
    .single();

  if (profile?.is_dev === true) {
    return { unlocked: true, remaining: 0 };
  }

  if (err || !profile?.program_start_date) {
    return { unlocked: false, reason: "TODAY_WOD", remaining: 1 };
  }

  const start = profile.program_start_date as string;
  const currentDay = profile.current_program_day as number;
  const elapsedDays = calendarDaysInclusiveYmd(start, localTodayYmd);
  const expectedThrough = Math.min(elapsedDays, 30);

  // Day-30 permanent unlock: if at day 30 and completed the day-30 lesson.
  if (currentDay === 30 && expectedThrough >= 30) {
    const { data: row30 } = await supabase
      .from("program_schedule")
      .select("lesson_id")
      .eq("program_version", programVersion)
      .eq("day_number", 30)
      .maybeSingle();

    if (row30?.lesson_id) {
      const { data: comp } = await supabase
        .from("user_lesson_completions")
        .select("id")
        .eq("user_id", userId)
        .eq("lesson_id", row30.lesson_id)
        .limit(1)
        .maybeSingle();
      if (comp) return { unlocked: true, remaining: 0 };
    }
  }

  // remaining = WODs left to be caught up through today.
  // currentDay is the *next* day to complete, so completed = currentDay - 1.
  const remaining = Math.max(0, expectedThrough - (currentDay - 1));

  if (remaining === 0) return { unlocked: true, remaining: 0 };
  if (remaining === 1) {
    return { unlocked: false, reason: "TODAY_WOD", remaining: 1 };
  }
  return { unlocked: false, reason: "BEHIND", remaining };
}
