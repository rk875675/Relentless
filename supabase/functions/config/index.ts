import { createServiceClient } from "../_shared/supabase.ts";
import {
  corsHeaders,
  generateRequestId,
  errorResponse,
  successResponse,
} from "../_shared/response.ts";
import { getUser } from "../_shared/auth.ts";

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

  // Returns only key + enabled per flag. metadata is omitted until a doc
  // decision specifies which metadata fields, if any, are safe for client consumption.
  const { data: flags, error } = await supabase
    .from("feature_flags")
    .select("key, enabled");

  if (error) {
    return errorResponse(500, "INTERNAL_ERROR", "Failed to fetch configuration", requestId);
  }

  const resolved: Record<string, { enabled: boolean }> = {};
  for (const flag of flags ?? []) {
    resolved[flag.key] = { enabled: flag.enabled };
  }

  return successResponse({ flags: resolved }, requestId);
});
