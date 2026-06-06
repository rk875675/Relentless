import { z } from "https://esm.sh/zod@3";
import { createServiceClient } from "../_shared/supabase.ts";
import {
  corsHeaders,
  generateRequestId,
  errorResponse,
  successResponse,
} from "../_shared/response.ts";
import { getUser } from "../_shared/auth.ts";

const BodySchema = z.object({
  expo_push_token: z.string().min(1).max(256),
  timezone: z.string().min(1).max(64),
  platform: z.enum(["ios", "android"]).optional().default("ios"),
}).strict();

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

  let body: unknown = {};
  try {
    const text = await req.text();
    body = text ? JSON.parse(text) : {};
  } catch {
    return errorResponse(400, "VALIDATION_ERROR", "Invalid JSON body", requestId);
  }

  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse(
      400,
      "VALIDATION_ERROR",
      parsed.error.issues[0]?.message ?? "Invalid request body",
      requestId,
    );
  }

  const { expo_push_token, timezone, platform } = parsed.data;
  const now = new Date().toISOString();

  // Upsert the token row, resetting disabled_at so a re-registered token is
  // immediately eligible for sends again.
  const { error: upsertError } = await supabase
    .from("push_tokens")
    .upsert(
      {
        user_id: auth.userId,
        expo_push_token,
        timezone,
        platform,
        updated_at: now,
        last_seen_at: now,
        disabled_at: null,
      },
      { onConflict: "expo_push_token" },
    );

  if (upsertError) {
    console.error("[push-tokens] Failed to upsert token", {
      requestId,
      userId: auth.userId,
      message: upsertError.message,
    });
    return errorResponse(500, "INTERNAL_ERROR", "Failed to register push token", requestId);
  }

  // Enable reminders on the profile now that we have a valid token.
  const { error: profileError } = await supabase
    .from("profiles")
    .update({ push_reminders_enabled: true })
    .eq("id", auth.userId);

  if (profileError) {
    // Non-fatal: token is stored; the profile flag will be corrected on next
    // registration or when the user manually toggles the setting.
    console.error("[push-tokens] Failed to set push_reminders_enabled", {
      requestId,
      userId: auth.userId,
      message: profileError.message,
    });
  }

  return successResponse({ registered: true }, requestId);
});
