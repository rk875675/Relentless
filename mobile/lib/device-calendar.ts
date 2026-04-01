/**
 * Device-local calendar date (YYYY-MM-DD) for program / catch-up logic.
 */
export function getDeviceLocalCalendarYmd(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Send on Home-tab requests so the server sets `program_start_date` on first visit. */
export const HOME_PROGRAM_ANCHOR_HEADERS = {
  'X-Program-Anchor': 'home',
} as const;
