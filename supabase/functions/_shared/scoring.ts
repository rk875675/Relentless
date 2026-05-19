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
  /** Stepped gains per tag per day: 1st completion = 8, 2nd = 3.5, etc. (PRD §7). */
  GAIN_STEPS: [8.0, 3.5, 2.0, 1.0, 0.5] as readonly number[],
  /** Points lost per calendar day of inactivity (PRD §7: -2.0). */
  DAILY_TIME_DECAY: 2.0,
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
// Gain — per-tag daily stepped model
// ---------------------------------------------------------------------------
/** Gain for the Nth tag completion today (1-indexed). */
export function computeGain(tagDailyCount: number): number {
  const steps = S.GAIN_STEPS;
  const idx = Math.min(Math.max(tagDailyCount - 1, 0), steps.length - 1);
  return steps[idx];
}

/**
 * Apply per-tag gains to scores.
 * Each category uses its own daily count to look up the stepped gain.
 */
export function applyGain(
  scores: MacScores,
  categories: string[],
  tagDailyCounts: Record<string, number>,
  lessonTitle: string,
): { scores: MacScores; deltas: MacDeltas } {
  const out = { ...scores };
  const deltas: MacDeltas = {};

  for (const cat of categories) {
    const key = `${cat}_score` as keyof MacScores;
    if (key in out) {
      const dailyCount = tagDailyCounts[cat] ?? 1;
      const gain = computeGain(dailyCount);
      out[key] = clamp(out[key] + gain);
      const reason = dailyCount > 1
        ? `${cat} session #${dailyCount} today (+${fmt(gain)})`
        : `Completed "${lessonTitle}" (+${fmt(gain)})`;
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

/** Apply decay to all 3 rings and return deltas. */
export function applyDecay(
  scores: MacScores,
  gapDays: number,
): { scores: MacScores; deltas: MacDeltas } {
  if (gapDays <= 0) return { scores, deltas: {} };
  const total = gapDays * S.DAILY_TIME_DECAY;
  if (total <= 0) return { scores, deltas: {} };

  const reason = `${gapDays}d inactive (−${fmt(total)})`;
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
