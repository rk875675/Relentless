import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = '@relentless/onboarding_progress';
const SCREEN_KEY = '@relentless/onboarding_screen';
const ANSWERS_KEY = '@relentless/onboarding_answers';

export type OnboardingAnswers = {
  intakeAnswers?: (string | null)[];
  intakeStep?: number;
  macTag?: string;
  sport?: string;
  competitionDate?: string;
};

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
  await AsyncStorage.multiRemove([KEY, SCREEN_KEY, ANSWERS_KEY]).catch(() => {});
}

export async function saveOnboardingAnswers(patch: Partial<OnboardingAnswers>): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem(ANSWERS_KEY);
    const current: OnboardingAnswers = raw ? JSON.parse(raw) : {};
    await AsyncStorage.setItem(ANSWERS_KEY, JSON.stringify({ ...current, ...patch }));
  } catch {
    await AsyncStorage.setItem(ANSWERS_KEY, JSON.stringify(patch)).catch(() => {});
  }
}

export async function loadOnboardingAnswers(): Promise<OnboardingAnswers> {
  try {
    const raw = await AsyncStorage.getItem(ANSWERS_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

export async function saveOnboardingScreen(screenName: string): Promise<void> {
  await AsyncStorage.setItem(SCREEN_KEY, screenName).catch(() => {});
}

export async function loadOnboardingScreen(): Promise<string | null> {
  try {
    const raw = await AsyncStorage.getItem(SCREEN_KEY);
    if (!raw) return null;
    try { const arr = JSON.parse(raw); if (Array.isArray(arr)) return arr[arr.length - 1] ?? null; } catch { /* not JSON, raw string */ }
    return raw;
  } catch {
    return null;
  }
}
