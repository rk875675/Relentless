// Server-authoritative lesson-pack analytics. Never throw into a lesson or switch path.

import { capturePostHogEvent } from "./posthog.ts";

export function emitPackCompleted(
  userId: string,
  properties: {
    program_id: string | null;
    program_key?: string | null;
    program_title?: string | null;
    coach_key?: string | null;
    coach_name?: string | null;
    total_days?: number | null;
  },
): void {
  const programId = properties.program_id;
  if (!programId) return;
  void capturePostHogEvent(userId, "pack_completed", properties, {
    insertId: `pack-completed-${userId}-${programId}`,
  }).catch(() => {});
}

export function emitPackActivated(
  userId: string,
  properties: {
    program_id: string;
    program_key?: string | null;
    program_title?: string | null;
    coach_key?: string | null;
    coach_name?: string | null;
    source: "program_select" | "onboarding";
  },
): void {
  void capturePostHogEvent(userId, "pack_activated", properties, {
    insertId: `pack-activated-${userId}-${properties.program_id}`,
  }).catch(() => {});
}
