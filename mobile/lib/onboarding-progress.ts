/** Linear progress across post-welcome onboarding (welcome has no bar). */
export const ONBOARDING_TOTAL_STEPS = 24;

export const ONBOARDING_PROGRESS = {
  relentlessIntro: 1,
  /** Intake wizard: 10 steps → progress `2 + questionIndex` (2–11).
   *  Includes 2 interstitials (voices after Q4, gap after Q5). */
  intakeStart: 2,
  unlockedPotential: 12,
  macFramework: 13,
  macQuestion: 14,
  macDetail: 15,
  weCanTrain: 16,
  /** After tutorial (steps 17–22 in tutorial.tsx). */
  sportSelection: 23,
  competitionDate: 24,
} as const;
