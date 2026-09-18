/** Linear progress across post-welcome onboarding (welcome has no bar). */
export const ONBOARDING_TOTAL_STEPS = 14;

export const ONBOARDING_PROGRESS = {
  /** Intake questions (3 choice Qs) → steps 1–3. */
  intakeStart: 1,
  unlockedPotential: 4,
  macTeaser: 5,
  macQuestion: 6,
  weCanTrain: 7,
  lessonStructure: 8,
  grantIntro: 9,
  onboardingTrophy: 10,
  /** Tutorial wizard: 3 steps → 11–13. */
  tutorialStart: 11,
  sportSelection: 14,
} as const;

/**
 * Map intake question index to linear progress.
 * All 3 questions are contiguous — no mid-intake break.
 */
export function getIntakeProgressStep(questionIndex: number): number {
  return ONBOARDING_PROGRESS.intakeStart + questionIndex;
}
