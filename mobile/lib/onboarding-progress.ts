/** Linear progress across post-welcome onboarding (welcome has no bar). */
export const ONBOARDING_TOTAL_STEPS = 21;

export const ONBOARDING_PROGRESS = {
  relentlessIntro: 1,
  /** Intake wizard: 8 steps → progress `2 + questionIndex` (2–9). */
  intakeStart: 2,
  unlockedPotential: 10,
  macFramework: 11,
  macQuestion: 12,
  macDetail: 13,
  weCanTrain: 14,
  competitionDate: 21,
} as const;
