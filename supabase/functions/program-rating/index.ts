import { z } from "https://esm.sh/zod@3";
import { createServiceClient } from "../_shared/supabase.ts";
import {
  corsHeaders,
  generateRequestId,
  errorResponse,
  successResponse,
} from "../_shared/response.ts";
import { getUser } from "../_shared/auth.ts";
import { checkRateLimit } from "../_shared/ratelimit.ts";

// Star rating submitted from the pack-complete screen.
// rating   : 1–5 integer
// program_id : uuid of the program just completed (preferred for dedup upsert)
// program_name : human-readable title (fallback label when id is unavailable)
// app_build  : client build string for filtering old submissions
const RatingSchema = z
  .object({
    rating: z.number().int().min(1).max(5),
    program_id: z.string().uuid().optional(),
    program_name: z.string().trim().max(200).optional(),
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

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return errorResponse(400, "VALIDATION_ERROR", "Invalid JSON body", requestId);
  }

  const parsed = RatingSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse(
      400,
      "VALIDATION_ERROR",
      parsed.error.issues[0]?.message ?? "Invalid rating payload",
      requestId,
    );
  }

  const { rating, program_id, program_name, app_build } = parsed.data;

  const row = {
    user_id: auth.userId,
    rating,
    program_id: program_id ?? null,
    program_name: program_name ?? null,
    app_build: app_build ?? null,
  };

  let dbError: string | null = null;

  if (program_id) {
    // One row per user per program. Select-then-write because the unique
    // index is partial (program_id IS NOT NULL) and PostgREST ON CONFLICT
    // cannot target it reliably.
    const { data: existing, error: lookupErr } = await supabase
      .from("program_ratings")
      .select("id")
      .eq("user_id", auth.userId)
      .eq("program_id", program_id)
      .maybeSingle();
    if (lookupErr) {
      dbError = lookupErr.message;
    } else if (existing?.id) {
      const { error } = await supabase
        .from("program_ratings")
        .update({
          rating,
          program_name: program_name ?? null,
          app_build: app_build ?? null,
        })
        .eq("id", existing.id);
      if (error) dbError = error.message;
    } else {
      const { error } = await supabase.from("program_ratings").insert(row);
      if (error) dbError = error.message;
    }
  } else {
    const { error } = await supabase.from("program_ratings").insert(row);
    if (error) dbError = error.message;
  }

  if (dbError) {
    return errorResponse(500, "INTERNAL_ERROR", "Failed to save rating", requestId);
  }

  return successResponse({ saved: true }, requestId);
});
