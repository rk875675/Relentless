import { z } from "https://esm.sh/zod@3";
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

const UuidSchema = z.string().uuid();

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const requestId = generateRequestId();

  if (req.method !== "GET") {
    return errorResponse(
      405,
      "VALIDATION_ERROR",
      "Method not allowed",
      requestId,
    );
  }

  const supabase = createServiceClient();
  const auth = await getUser(req, supabase, requestId);
  if (!auth.ok) return auth.response;

  const rl = await checkRateLimit(auth.userId, requestId, "authenticated-read");
  if (!rl.ok) return rl.response;

  const entitlement = await requireEntitlement(
    supabase,
    auth.userId,
    requestId,
  );
  if (!entitlement.ok) return entitlement.response;

  const url = new URL(req.url);
  const pathMatch = url.pathname.match(/\/coaches(?:\/(.+))?$/);
  const coachId = (pathMatch?.[1] ?? "").replace(/\/$/, "");

  if (!coachId) {
    return errorResponse(
      400,
      "VALIDATION_ERROR",
      "Coach ID is required in path",
      requestId,
    );
  }

  const parsed = UuidSchema.safeParse(coachId);
  if (!parsed.success) {
    return errorResponse(
      400,
      "VALIDATION_ERROR",
      "Invalid coach ID format",
      requestId,
    );
  }

  const { data: coach, error } = await supabase
    .from("coaches")
    .select("id, name, sport, bio, external_url, avatar_url")
    .eq("id", parsed.data)
    .single();

  if (error || !coach) {
    return errorResponse(404, "NOT_FOUND", "Coach not found", requestId);
  }

  return successResponse(coach, requestId);
});
