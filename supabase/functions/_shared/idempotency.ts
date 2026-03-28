import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "./cors.ts";
import { errorResponse } from "./response.ts";

// Human Input Needed: idempotency key TTL not specified in docs. 24h placeholder.
const IDEMPOTENCY_TTL_MS = 24 * 60 * 60 * 1000;

export type IdempotencyCheck =
  | { replay: false }
  | { replay: true; response: Response };

export async function checkIdempotencyKey(
  supabase: SupabaseClient,
  key: string,
  userId: string,
  requestId: string,
): Promise<IdempotencyCheck> {
  const { data: existing } = await supabase
    .from("idempotency_keys")
    .select("user_id, response_status, response_body")
    .eq("key", key)
    .single();

  if (!existing) {
    return { replay: false };
  }

  if (existing.user_id !== userId) {
    return {
      replay: true,
      response: errorResponse(
        409,
        "IDEMPOTENCY_CONFLICT",
        "Idempotency key already used with different params",
        requestId,
      ),
    };
  }

  return {
    replay: true,
    response: new Response(JSON.stringify(existing.response_body), {
      status: existing.response_status,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    }),
  };
}

export async function storeIdempotencyKey(
  supabase: SupabaseClient,
  key: string,
  userId: string,
  responseStatus: number,
  responseBody: unknown,
): Promise<void> {
  await supabase.from("idempotency_keys").insert({
    key,
    user_id: userId,
    response_status: responseStatus,
    response_body: responseBody,
    expires_at: new Date(Date.now() + IDEMPOTENCY_TTL_MS).toISOString(),
  });
}
