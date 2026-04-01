/**
 * MAC scoring engine — "sharpness" model.
 * Pure functions; no DB calls. Callers handle reads/writes.
 *
 * Tunables are grouped in S so they are easy to tweak in one place.
 */

import { calendarDaysInclusiveYmd } from "./library.ts";

// ---------------------------------------------------------------------------
// Tunables
// ---------------------------------------------------------------------------
export const S = {
  /** Points for the first completion of a lesson in a category. */
  BASE_FIRST_GAIN: 8.0,
  /** Exponent for replay diminishing returns: gain = BASE / count^EXP. */
  REPLAY_EXPONENT: 1.8,
  /** Floor so replays are never worth exactly 0. */
  MIN_REPLAY_GAIN: 0.5,
  /** Points lost per calendar day of inactivity (applies to all 3 rings). */
  DAILY_TIME_DECAY: 1.0,
  /** Extra points lost per missed-WOD day (applies to all 3 rings). */
  MISSED_WOD_PENALTY: 2.0,
  MAX_SCORE: 100.0,
  MIN_SCORE: 0.0,
} as const;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
export interface MacScores {
  mindfulness_score: number;
  acceptance_score: number;
  commitment_score: number;
}

export interface ScoreDelta {
  amount: number;
  reason: string;
}

export interface MacDeltas {
  mindfulness?: ScoreDelta;
  acceptance?: ScoreDelta;
  commitment?: ScoreDelta;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function clamp(v: number): number {
  return Math.max(S.MIN_SCORE, Math.min(S.MAX_SCORE, v));
}

function fmt(n: number): string {
  return n.toFixed(1);
}

export function yesterdayYmd(todayYmd: string): string {
  const [y, m, d] = todayYmd.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() - 1);
  const yy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(dt.getUTCDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

// ---------------------------------------------------------------------------
// Gain
// ---------------------------------------------------------------------------
/** Points earned for this completion (count includes the current one). */
export function computeGain(completionCount: number): number {
  if (completionCount <= 1) return S.BASE_FIRST_GAIN;
  return Math.max(
    S.MIN_REPLAY_GAIN,
    S.BASE_FIRST_GAIN / Math.pow(completionCount, S.REPLAY_EXPONENT),
  );
}

/** Apply gain to scores for the lesson's categories. */
export function applyGain(
  scores: MacScores,
  gain: number,
  categories: string[],
  lessonTitle: string,
  completionCount: number,
): { scores: MacScores; deltas: MacDeltas } {
  const out = { ...scores };
  const deltas: MacDeltas = {};
  const reason =
    completionCount > 1
      ? `Replay #${completionCount} of "${lessonTitle}" (+${fmt(gain)})`
      : `Completed "${lessonTitle}" (+${fmt(gain)})`;

  for (const cat of categories) {
    const key = `${cat}_score` as keyof MacScores;
    if (key in out) {
      out[key] = clamp(out[key] + gain);
      (deltas as Record<string, ScoreDelta>)[cat] = { amount: gain, reason };
    }
  }
  return { scores: out, deltas };
}

// ---------------------------------------------------------------------------
// Decay
// ---------------------------------------------------------------------------
/**
 * How many full days of decay to apply.
 * Decay covers completed calendar days only (through yesterday).
 */
export function decayGapDays(
  lastDecayYmd: string | null,
  todayYmd: string,
): number {
  if (!lastDecayYmd) return 0;
  const yest = yesterdayYmd(todayYmd);
  if (yest <= lastDecayYmd) return 0;
  return calendarDaysInclusiveYmd(lastDecayYmd, yest) - 1;
}

/**
 * Missed-WOD days within the gap, approximated from last_wod_completion_local_date.
 */
export function missedWodDaysInGap(
  lastWodYmd: string | null,
  lastDecayYmd: string | null,
  todayYmd: string,
): number {
  const gap = decayGapDays(lastDecayYmd, todayYmd);
  if (gap <= 0) return 0;
  const yest = yesterdayYmd(todayYmd);
  const ref = lastWodYmd ?? lastDecayYmd ?? yest;
  if (yest <= ref) return 0;
  const since = calendarDaysInclusiveYmd(ref, yest) - 1;
  return Math.min(gap, since);
}

/** Apply decay to all 3 rings and return deltas. */
export function applyDecay(
  scores: MacScores,
  gapDays: number,
  missedDays: number,
): { scores: MacScores; deltas: MacDeltas } {
  if (gapDays <= 0) return { scores, deltas: {} };
  const timePart = gapDays * S.DAILY_TIME_DECAY;
  const wodPart = missedDays * S.MISSED_WOD_PENALTY;
  const total = timePart + wodPart;
  if (total <= 0) return { scores, deltas: {} };

  const parts: string[] = [];
  if (timePart > 0)
    parts.push(`${gapDays}d inactive (−${fmt(timePart)})`);
  if (wodPart > 0)
    parts.push(
      `${missedDays} missed WOD${missedDays > 1 ? "s" : ""} (−${fmt(wodPart)})`,
    );
  const reason = parts.join(" + ");
  const delta: ScoreDelta = { amount: -total, reason };

  return {
    scores: {
      mindfulness_score: clamp(scores.mindfulness_score - total),
      acceptance_score: clamp(scores.acceptance_score - total),
      commitment_score: clamp(scores.commitment_score - total),
    },
    deltas: {
      mindfulness: { ...delta },
      acceptance: { ...delta },
      commitment: { ...delta },
    },
  };
}
