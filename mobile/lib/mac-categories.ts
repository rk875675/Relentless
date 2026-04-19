import { colors } from '@/lib/theme';

export const MAC_ORDER = ['mindfulness', 'acceptance', 'commitment'] as const;
export type MacCategory = (typeof MAC_ORDER)[number];

export const MAC_COLORS: Record<MacCategory, string> = {
  mindfulness: colors.ringMindfulness,
  acceptance: colors.ringAcceptance,
  commitment: colors.ringCommitment,
};

export const MAC_LETTER: Record<MacCategory, string> = {
  mindfulness: 'M',
  acceptance: 'A',
  commitment: 'C',
};

export const MAC_A11Y_NAME: Record<MacCategory, string> = {
  mindfulness: 'Mindfulness',
  acceptance: 'Acceptance',
  commitment: 'Commitment',
};

export function sortMacCategories(categories: string[] | undefined): MacCategory[] {
  if (!categories?.length) return [];
  const out: MacCategory[] = [];
  for (const key of MAC_ORDER) {
    if (categories.includes(key)) out.push(key);
  }
  return out;
}

export function macAccentColors(sorted: MacCategory[]): string[] {
  return sorted.map((k) => MAC_COLORS[k]);
}

/** Cycle through accent colors for dots, bars, etc. */
export function pickMacColor(accentColors: string[] | undefined, fallback: string, index: number): string {
  const arr = accentColors && accentColors.length > 0 ? accentColors : [fallback];
  return arr[Math.abs(index) % arr.length] ?? fallback;
}
