/** Linear progress across post-welcome onboarding (welcome has no bar). */
export const ONBOARDING_TOTAL_STEPS = 21;

export const ONBOARDING_PROGRESS = {
  relentlessIntro: 1,
  /** Intake wizard: 7 steps → progress `2 + questionIndex` (2–8).
   *  Includes 2 interstitials (quote after Q1, gap after mental-results Q). */
  intakeStart: 2,
  unlockedPotential: 9,
  macTeaser: 10,
  macFramework: 11,
  macQuestion: 12,
  macDetail: 13,
  weCanTrain: 13,
  grantIntro: 14,
  onboardingTrophy: 15,
  /** Tutorial occupies steps 16–18. After tutorial (step 18), sport-selection at 19. */
  sportSelection: 19,
  competitionDate: 20,
} as const;
