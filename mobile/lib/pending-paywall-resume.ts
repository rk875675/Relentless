import { loadOnboardingProgress } from '@/lib/onboarding-local-state';

export type PaywallResume = {
  pathname: '/(onboarding)/paywall';
  params: { sport?: string; competitionDate?: string };
};

/**
 * Signed-in onboarding should return to the paywall when this device already
 * reached it. A stashed offer code is redeemed by the paywall itself.
 * Params come from that saved visit so the screen does not overwrite it with blanks.
 */
export async function pendingPaywallResume(): Promise<PaywallResume | null> {
  const saved = await loadOnboardingProgress();
  if (!saved?.reachedPaywall) return null;
  const params: PaywallResume['params'] = {};
  if (saved.sport) params.sport = saved.sport;
  if (saved.competitionDate) params.competitionDate = saved.competitionDate;
  return { pathname: '/(onboarding)/paywall', params };
}
