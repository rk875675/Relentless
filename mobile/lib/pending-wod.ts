/**
 * In-memory store for the last WOD lesson.
 * Set when navigating into the lesson from Home; read when /lessons/next
 * returns null so the user can repeat today's workout.
 */

export type WodLesson = {
  id: string;
  title: string;
  duration_seconds: number;
  categories: string[];
  program_day?: number;
};

let _lastWod: WodLesson | null = null;

export function setLastWodLesson(lesson: WodLesson) {
  _lastWod = lesson;
}

export function getLastWodLesson(): WodLesson | null {
  return _lastWod;
}
