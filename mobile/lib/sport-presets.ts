/** Preset sports — keep in sync with profile picker and onboarding sport screen. */
export const PRESET_SPORTS = [
  'Track & Field',
  'Baseball',
  'Football',
  'Cross Country',
  'Soccer',
  'Wrestling',
  'Golf',
  'Other',
] as const;

export const OTHER_SENTINEL = 'Other';

/** Max length of the stored `profiles.sport` string (multiple sports joined). */
export const MAX_SPORT_LEN = 160;

/** Max length of the free-text "Other" sport input. */
export const MAX_OTHER_SPORT_LEN = 80;

const SPORT_SEPARATOR = ', ';

export function isPresetSport(s: string): boolean {
  return (PRESET_SPORTS as readonly string[]).includes(s);
}

/** Splits a stored sport string into picker state (selected options + "Other" text). */
export function parseSports(stored: string | null | undefined): { selected: string[]; other: string } {
  const parts = (stored ?? '')
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean);
  const selected = parts.filter((p) => isPresetSport(p) && p !== OTHER_SENTINEL);
  const customParts = parts.filter((p) => !isPresetSport(p));
  if (customParts.length > 0) selected.push(OTHER_SENTINEL);
  return { selected, other: customParts.join(SPORT_SEPARATOR).slice(0, MAX_OTHER_SPORT_LEN) };
}

/** Joins picker state into the stored sport string, in preset order with "Other" text last. */
export function joinSports(selected: string[], other: string): string {
  const parts = PRESET_SPORTS.filter((s) => s !== OTHER_SENTINEL && selected.includes(s)) as string[];
  const otherTrim = other.trim();
  if (selected.includes(OTHER_SENTINEL) && otherTrim) parts.push(otherTrim);
  return parts.join(SPORT_SEPARATOR);
}

/** True when the picker state is savable (at least one sport; "Other" needs 2+ chars). */
export function canSaveSports(selected: string[], other: string): boolean {
  if (selected.length === 0) return false;
  if (selected.includes(OTHER_SENTINEL) && other.trim().length < 2) return false;
  const joined = joinSports(selected, other);
  return joined.length > 0 && joined.length <= MAX_SPORT_LEN;
}
