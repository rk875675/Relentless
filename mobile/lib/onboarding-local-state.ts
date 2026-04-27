import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = '@relentless/onboarding_progress';

type OnboardingLocalState = {
  reachedPaywall: true;
  sport?: string;
  competitionDate?: string;
};

export async function saveOnboardingProgress(
  data: { sport?: string; competitionDate?: string },
): Promise<void> {
  const state: OnboardingLocalState = { reachedPaywall: true, ...data };
  await AsyncStorage.setItem(KEY, JSON.stringify(state)).catch(() => {});
}

export async function loadOnboardingProgress(): Promise<OnboardingLocalState | null> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed?.reachedPaywall === true) return parsed as OnboardingLocalState;
    return null;
  } catch {
    return null;
  }
}

export async function clearOnboardingProgress(): Promise<void> {
  await AsyncStorage.removeItem(KEY).catch(() => {});
}
