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
import { parseProgramAnchor, resolveLocalTodayYmd } from "../_shared/client_day.ts";
import { ensureProgramStartIfHome } from "../_shared/program_start.ts";
import {
  type MacScores,
  applyDecay,
  decayGapDays,
} from "../_shared/scoring.ts";

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

  const localYmd = resolveLocalTodayYmd(req);
  const anchor = parseProgramAnchor(req);
  await ensureProgramStartIfHome(supabase, auth.userId, localYmd, anchor);

  // Current progress + total completions in parallel (read-only — no writes).
  // Decay is computed for display but NOT persisted here; the complete_lesson
  // RPC applies decay atomically before scoring, so the persisted row stays
  // correct without a write-on-read race.
  const [{ data: progressRow }, { count: totalCompletions }] = await Promise.all([
    supabase
      .from("user_progress")
      .select("mindfulness_score, acceptance_score, commitment_score, last_decay_applied_local_date, updated_at")
      .eq("user_id", auth.userId)
      .maybeSingle(),
    supabase
      .from("user_lesson_completions")
      .select("id", { count: "exact", head: true })
      .eq("user_id", auth.userId),
  ]);

  let scores: MacScores = {
    mindfulness_score: progressRow?.mindfulness_score ?? 0,
    acceptance_score: progressRow?.acceptance_score ?? 0,
    commitment_score: progressRow?.commitment_score ?? 0,
  };

  const lastDecay = (progressRow?.last_decay_applied_local_date as string | null) ?? null;

  // Compute pending decay for display only (not persisted — complete_lesson handles that)
  const gap = decayGapDays(lastDecay, localYmd);
  let deltas = null;
  if (gap > 0) {
    const result = applyDecay(scores, gap);
    scores = result.scores;
    deltas = Object.keys(result.deltas).length > 0 ? result.deltas : null;
  }

  return successResponse(
    {
      ...scores,
      updated_at: progressRow?.updated_at ?? null,
      total_completions: totalCompletions ?? 0,
      deltas,
    },
    requestId,
  );
});
