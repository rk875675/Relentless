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
import { computeLibraryUnlocked } from "../_shared/library.ts";
import { parseProgramAnchor, resolveLocalTodayYmd } from "../_shared/client_day.ts";
import { ensureProgramStartIfHome } from "../_shared/program_start.ts";
import {
  type MacScores,
  applyDecay,
  decayGapDays,
  yesterdayYmd,
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

  // Library lock status with reason
  const lock = await computeLibraryUnlocked(supabase, auth.userId, localYmd);

  // Current progress (lazy-create default row)
  const { data: progressRow } = await supabase
    .from("user_progress")
    .select("mindfulness_score, acceptance_score, commitment_score, last_decay_applied_local_date, updated_at")
    .eq("user_id", auth.userId)
    .maybeSingle();

  let scores: MacScores = {
    mindfulness_score: progressRow?.mindfulness_score ?? 0,
    acceptance_score: progressRow?.acceptance_score ?? 0,
    commitment_score: progressRow?.commitment_score ?? 0,
  };

  const lastDecay = (progressRow?.last_decay_applied_local_date as string | null) ?? null;

  // Apply pending decay (covers completed days through yesterday)
  const gap = decayGapDays(lastDecay, localYmd);
  let deltas = null;
  if (gap > 0) {
    const result = applyDecay(scores, gap);
    scores = result.scores;
    deltas = Object.keys(result.deltas).length > 0 ? result.deltas : null;

    const yest = yesterdayYmd(localYmd);
    await supabase.from("user_progress").upsert(
      {
        user_id: auth.userId,
        mindfulness_score: scores.mindfulness_score,
        acceptance_score: scores.acceptance_score,
        commitment_score: scores.commitment_score,
        last_decay_applied_local_date: yest,
      },
      { onConflict: "user_id" },
    );
  }

  const { count: totalCompletions } = await supabase
    .from("user_lesson_completions")
    .select("id", { count: "exact", head: true })
    .eq("user_id", auth.userId);

  return successResponse(
    {
      ...scores,
      updated_at: progressRow?.updated_at ?? null,
      library_unlocked: lock.unlocked,
      library_lock_reason: lock.unlocked ? null : lock.reason,
      library_lock_remaining: lock.remaining,
      total_completions: totalCompletions ?? 0,
      deltas,
    },
    requestId,
  );
});
