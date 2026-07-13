import { apiFetch } from './api';
import { bustCache } from './api-cache';

export type SelectProgramMode = 'continue' | 'restart';

/**
 * Make a lesson pack the user's active program (drives the daily WOD).
 * - 'continue' resumes the stored day; 'restart' goes back to day 1.
 * On success, busts the Home caches so the next fetch shows the new pack.
 * Returns an error message string on failure, or null on success.
 */
export async function selectProgram(
  programId: string,
  mode: SelectProgramMode,
): Promise<string | null> {
  const res = await apiFetch('/programs/select', {
    method: 'POST',
    body: { program_id: programId, mode },
  });
  if (res.error) return res.error;
  bustCache('/lessons/next', '/progress', '/streak', '/programs', '/programs?include_active=1');
  return null;
}
