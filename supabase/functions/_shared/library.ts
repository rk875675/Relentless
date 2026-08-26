function parseYmdUtc(ymd: string): number {
  const [y, m, d] = ymd.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
}

/**
 * Inclusive calendar span between two YYYY-MM-DD strings (pure date math).
 * If `end` is before `start` (clock skew), returns 1.
 */
export function calendarDaysInclusiveYmd(
  startYmd: string,
  endYmd: string,
): number {
  const s = parseYmdUtc(startYmd);
  const e = parseYmdUtc(endYmd);
  if (e < s) return 1;
  return Math.floor((e - s) / 86_400_000) + 1;
}
