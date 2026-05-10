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

  const [streakRes, profileRes] = await Promise.all([
    supabase
      .from("user_streaks")
      .select("current_streak, longest_streak, last_activity_date, updated_at")
      .eq("user_id", auth.userId)
      .single(),
    supabase
      .from("profiles")
      .select("freebie_used")
      .eq("id", auth.userId)
      .single(),
  ]);

  const freebie_used = profileRes.data?.freebie_used ?? false;

  if (streakRes.error || !streakRes.data) {
    return successResponse(
      {
        current_streak: 0,
        longest_streak: 0,
        last_activity_date: null,
        updated_at: null,
        freebie_used,
      },
      requestId,
    );
  }

  const streak = streakRes.data;
  const lastDate = streak.last_activity_date;

  if (lastDate && localYmd) {
    const last = new Date(lastDate + "T00:00:00");
    const today = new Date(localYmd + "T00:00:00");
    const diffDays = Math.floor((today.getTime() - last.getTime()) / 86_400_000);
    const maxGap = freebie_used ? 1 : 2;
    if (diffDays > maxGap) {
      return successResponse({
        ...streak,
        current_streak: 0,
        freebie_used,
      }, requestId);
    }
  }

  return successResponse({ ...streak, freebie_used }, requestId);
});
