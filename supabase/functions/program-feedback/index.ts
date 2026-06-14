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

// Feedback submitted from the "Relentless 30-Day Sprint complete" screen.
// Strict schema: only the fields below are accepted.
const FeedbackSchema = z
  .object({
    message: z.string().trim().min(1, "Feedback cannot be empty").max(2000),
    app_build: z.string().trim().max(32).optional(),
  })
  .strict();

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const requestId = generateRequestId();

  if (req.method !== "POST") {
    return errorResponse(405, "VALIDATION_ERROR", "Method not allowed", requestId);
  }

  const supabase = createServiceClient();

  const auth = await getUser(req, supabase, requestId);
  if (!auth.ok) return auth.response;

  const rl = await checkRateLimit(auth.userId, requestId, "authenticated-write");
  if (!rl.ok) return rl.response;

  const entitlement = await requireEntitlement(supabase, auth.userId, requestId);
  if (!entitlement.ok) return entitlement.response;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return errorResponse(400, "VALIDATION_ERROR", "Invalid JSON body", requestId);
  }

  const parsed = FeedbackSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse(
      400,
      "VALIDATION_ERROR",
      parsed.error.issues[0]?.message ?? "Invalid feedback payload",
      requestId,
    );
  }

  const { error } = await supabase.from("program_completion_feedback").insert({
    user_id: auth.userId,
    message: parsed.data.message,
    app_build: parsed.data.app_build ?? null,
  });

  if (error) {
    return errorResponse(500, "INTERNAL_ERROR", "Failed to save feedback", requestId);
  }

  return successResponse({ saved: true }, requestId);
});
