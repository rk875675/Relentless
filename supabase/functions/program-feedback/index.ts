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

// Feedback submitted from a program-complete screen (30-Day Sprint or any
// coach lesson pack). Strict schema: only the fields below are accepted.
// `program` is an optional label (program title) stored in program_version;
// omitted -> column default 'v1' (legacy sprint behavior).
const FeedbackSchema = z
  .object({
    message: z.string().trim().min(1, "Feedback cannot be empty").max(2000),
    app_build: z.string().trim().max(32).optional(),
    program: z.string().trim().min(1).max(200).optional(),
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

  const row: Record<string, unknown> = {
    user_id: auth.userId,
    message: parsed.data.message,
    app_build: parsed.data.app_build ?? null,
  };
  // Only set when provided so the column default ('v1') keeps applying to
  // legacy clients that don't send it.
  if (parsed.data.program) row.program_version = parsed.data.program;

  const { error } = await supabase.from("program_completion_feedback").insert(row);

  if (error) {
    return errorResponse(500, "INTERNAL_ERROR", "Failed to save feedback", requestId);
  }

  return successResponse({ saved: true }, requestId);
});
