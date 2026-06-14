import { createServiceClient } from "../_shared/supabase.ts";
import {
  corsHeaders,
  generateRequestId,
  errorResponse,
  successResponse,
} from "../_shared/response.ts";
import { getUser } from "../_shared/auth.ts";
import { requireEntitlement } from "../_shared/entitlement.ts";
import { checkRateLimit } from "../_shared/ratelimit.ts";

// Every user is on the original 30-Day Sprint today, so it is excluded from
// the recommendation rail. Replace with the user's active program once
// program switching ships.
const CURRENT_PROGRAM_ID = "b0000000-0000-0000-0000-000000000001";

// Coach photos are uploaded by the loader into the lesson-audio bucket
// (no dedicated image bucket yet — see scripts/03_loader.py IMAGE_BUCKET).
const IMAGE_BUCKET = "lesson-audio";
const SIGNED_URL_TTL = 3600; // 1 hour

// GET /programs — published programs (excluding the user's current one) for
// the Home "More programs you might like" rail. Non-dev users only ever see
// production_ready programs; is_dev accounts also see preview ones.
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const requestId = generateRequestId();

  if (req.method !== "GET") {
    return errorResponse(405, "VALIDATION_ERROR", "Method not allowed", requestId);
  }

  const supabase = createServiceClient();
  const auth = await getUser(req, supabase, requestId);
  if (!auth.ok) return auth.response;

  const rl = await checkRateLimit(auth.userId, requestId, "authenticated-read");
  if (!rl.ok) return rl.response;

  const entitlement = await requireEntitlement(supabase, auth.userId, requestId);
  if (!entitlement.ok) return entitlement.response;

  const { data: profile } = await supabase
    .from("profiles")
    .select("is_dev")
    .eq("id", auth.userId)
    .maybeSingle();
  const isDev = profile?.is_dev === true;

  let query = supabase
    .from("programs")
    .select("id, title, sport, coach_id")
    .eq("published", true)
    .neq("id", CURRENT_PROGRAM_ID);
  if (!isDev) query = query.eq("production_ready", true);

  const { data: programs, error } = await query.order("created_at", {
    ascending: true,
  });
  if (error) {
    return errorResponse(500, "INTERNAL_ERROR", "Failed to fetch programs", requestId);
  }

  // Day-1 lesson per program, so the client can open a program's first
  // workout directly. Preview lessons stay gated by the lesson detail
  // endpoint itself (404 for non-dev users), and programs without lessons
  // (e.g. demo rows) simply get null.
  const programIds = (programs ?? []).map((p: { id: string }) => p.id);
  const { data: day1Lessons } = programIds.length > 0
    ? await supabase
        .from("lessons")
        .select("id, program_id")
        .in("program_id", programIds)
        .eq("sequence", 1)
        .eq("published", true)
    : { data: [] };
  const day1ByProgram = new Map(
    (day1Lessons ?? []).map((l: { id: string; program_id: string }) => [
      l.program_id,
      l.id,
    ]),
  );

  const coachIds = [
    ...new Set((programs ?? []).map((p: { coach_id: string }) => p.coach_id)),
  ];
  const { data: coaches } = coachIds.length > 0
    ? await supabase
        .from("coaches")
        .select("id, name, sport, avatar_url")
        .in("id", coachIds)
    : { data: [] };
  const coachById = new Map(
    (coaches ?? []).map((c: { id: string }) => [c.id, c]),
  );

  const items = await Promise.all(
    (programs ?? []).map(async (p: Record<string, unknown>) => {
      const coach = coachById.get(p.coach_id as string) as
        | { name?: string; sport?: string | null; avatar_url?: string | null }
        | undefined;

      let avatarUrl = coach?.avatar_url ?? null;
      if (avatarUrl && !/^https?:\/\//i.test(avatarUrl)) {
        const { data: signed } = await supabase.storage
          .from(IMAGE_BUCKET)
          .createSignedUrl(avatarUrl, SIGNED_URL_TTL);
        avatarUrl = signed?.signedUrl ?? null;
      }

      return {
        id: p.id,
        title: p.title,
        coach_name: coach?.name ?? "",
        coach_sport: coach?.sport ?? (p.sport as string | null) ?? null,
        coach_avatar_url: avatarUrl,
        day1_lesson_id: day1ByProgram.get(p.id as string) ?? null,
      };
    }),
  );

  return successResponse({ items }, requestId);
});
