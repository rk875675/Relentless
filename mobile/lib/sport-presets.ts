/** Preset sports — keep in sync with profile picker and onboarding sport screen. */
export const PRESET_SPORTS = [
  'Track & Field',
  'Football',
  'Basketball',
  'Soccer',
  'Wrestling',
  'Swimming',
  'Volleyball',
  'Other',
] as const;

export const OTHER_SENTINEL = 'Other';

export const MAX_SPORT_LEN = 80;

export function isPresetSport(s: string): boolean {
  return (PRESET_SPORTS as readonly string[]).includes(s);
}
