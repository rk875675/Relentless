import { createServiceClient } from "../_shared/supabase.ts";
import {
  corsHeaders,
  generateRequestId,
  errorResponse,
  successResponse,
} from "../_shared/response.ts";
import { getUser } from "../_shared/auth.ts";
import { checkRateLimit } from "../_shared/ratelimit.ts";

// DELETE /account — fully deletes the calling user's auth row.
// auth.users → public.profiles is ON DELETE CASCADE, and every user-owned
// table (entitlements, entitlement_events, idempotency_keys,
// user_lesson_completions, user_progress, user_streaks, journal_entries) has
// ON DELETE CASCADE on profiles, so a single auth deletion removes all
// user-scoped rows. audit_log.actor_id has no FK and is preserved.
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const requestId = generateRequestId();

  if (req.method !== "DELETE") {
    return errorResponse(405, "VALIDATION_ERROR", "Method not allowed", requestId);
  }

  const supabase = createServiceClient();
  const auth = await getUser(req, supabase, requestId);
  if (!auth.ok) return auth.response;

  const rl = await checkRateLimit(auth.userId, requestId, "authenticated-write");
  if (!rl.ok) return rl.response;

  // Pre-deletion audit row (actor_id has no FK and is preserved across the cascade).
  await supabase.from("audit_log").insert({
    actor_id: auth.userId,
    action: "account_delete_requested",
    entity_type: "user",
    entity_id: auth.userId,
    request_id: requestId,
  });

  const { error } = await supabase.auth.admin.deleteUser(auth.userId);
  if (error) {
    console.error("[account/delete] admin.deleteUser failed", {
      requestId,
      userId: auth.userId,
      message: error.message,
    });
    return errorResponse(500, "INTERNAL_ERROR", "Failed to delete account", requestId);
  }

  await supabase.from("audit_log").insert({
    actor_id: auth.userId,
    action: "account_deleted",
    entity_type: "user",
    entity_id: auth.userId,
    request_id: requestId,
  });

  return successResponse({ deleted: true }, requestId);
});
