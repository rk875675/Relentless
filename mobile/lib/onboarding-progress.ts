/** Linear progress across post-welcome onboarding (welcome has no bar). */
export const ONBOARDING_TOTAL_STEPS = 19;

export const ONBOARDING_PROGRESS = {
  relentlessIntro: 1,
  /** First intake block (question indices 0–4) → steps 2–6. Includes quote + gap interstitials. */
  intakeStart: 2,
  unlockedPotential: 7,
  macTeaser: 8,
  /** Second intake block (indices 5–6, after unlocked-potential + mac-teaser) → steps 9–10. */
  postMacTeaserIntakeStart: 9,
  macQuestion: 11,
  weCanTrain: 12,
  grantIntro: 13,
  onboardingTrophy: 14,
  /** Tutorial wizard: 3 steps → 15–17. */
  tutorialStart: 15,
  sportSelection: 18,
  competitionDate: 19,
} as const;

/**
 * Map intake question index to linear progress.
 * The intake wizard splits: indices 0–4, then unlocked-potential + mac-teaser,
 * then indices 5–6. Without this, the bar jumps backward (10 → 7) on resume.
 */
export function getIntakeProgressStep(questionIndex: number): number {
  if (questionIndex <= 4) {
    return ONBOARDING_PROGRESS.intakeStart + questionIndex;
  }
  return ONBOARDING_PROGRESS.postMacTeaserIntakeStart + (questionIndex - 5);
}
