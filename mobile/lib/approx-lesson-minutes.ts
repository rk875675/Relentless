/**
 * Whole minutes for "~N min" labels. Single source of truth so list vs player never disagree.
 */
export function approxLessonMinutes(durationSeconds: number): number {
  return Math.ceil(durationSeconds / 60);
}
