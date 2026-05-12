/** Linear progress across post-welcome onboarding (welcome has no bar). */
export const ONBOARDING_TOTAL_STEPS = 23;

export const ONBOARDING_PROGRESS = {
  relentlessIntro: 1,
  /** Intake wizard: 9 steps → progress `2 + questionIndex` (2–10).
   *  Includes 2 interstitials (quote after Q3, gap after mental-results Q). */
  intakeStart: 2,
  unlockedPotential: 11,
  macFramework: 12,
  macQuestion: 13,
  macDetail: 14,
  weCanTrain: 15,
  /** After tutorial (steps 16–21 in tutorial.tsx). */
  sportSelection: 22,
  competitionDate: 23,
} as const;
