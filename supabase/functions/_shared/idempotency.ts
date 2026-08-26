import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "./cors.ts";
import { errorResponse } from "./response.ts";

// Human Input Needed: idempotency key TTL not specified in docs. 24h placeholder.
const IDEMPOTENCY_TTL_MS = 24 * 60 * 60 * 1000;

// In-progress keys older than this are considered orphaned (crashed request).
const STALE_IN_PROGRESS_MS = 5 * 60 * 1000;

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

// ---------------------------------------------------------------------------
// Claim-first idempotency (closes the TOCTOU race in checkIdempotencyKey).
//
// Reserve the key atomically by inserting a placeholder row (response_status
// null). If the row already exists, inspect it: return the cached response if
// the previous attempt completed, or a 409 if it's still in flight or owned
// by a different user. After the work is done, call storeIdempotencyResult to
// fill in the actual status/body via UPDATE.
// ---------------------------------------------------------------------------
export type IdempotencyClaim =
  | { claimed: true }
  | { claimed: false; response: Response };

export async function claimIdempotencyKey(
  supabase: SupabaseClient,
  key: string,
  userId: string,
  requestId: string,
): Promise<IdempotencyClaim> {
  // Expire orphaned in-progress keys (from crashed/timed-out requests) so
  // subsequent retries with the same key aren't permanently blocked.
  const staleCutoff = new Date(Date.now() - STALE_IN_PROGRESS_MS).toISOString();
  await supabase
    .from("idempotency_keys")
    .delete()
    .eq("key", key)
    .is("response_status", null)
    .lt("created_at", staleCutoff);

  // Also garbage-collect fully expired keys (past expires_at) to prevent
  // table bloat. Scoped to this key only to keep the query fast.
  await supabase
    .from("idempotency_keys")
    .delete()
    .eq("key", key)
    .lt("expires_at", new Date().toISOString());

  const expiresAt = new Date(Date.now() + IDEMPOTENCY_TTL_MS).toISOString();

  // ON CONFLICT DO NOTHING: only the first concurrent caller wins the insert.
  // ignoreDuplicates makes the SELECT return an empty array on conflict.
  const { data: claimRows, error: insertErr } = await supabase
    .from("idempotency_keys")
    .upsert(
      {
        key,
        user_id: userId,
        response_status: null,
        response_body: null,
        expires_at: expiresAt,
      },
      { onConflict: "key", ignoreDuplicates: true },
    )
    .select("key");

  if (insertErr) {
    return {
      claimed: false,
      response: errorResponse(
        500,
        "INTERNAL_ERROR",
        "Idempotency claim failed",
        requestId,
      ),
    };
  }

  if (claimRows && claimRows.length > 0) {
    return { claimed: true };
  }

  const { data: existing } = await supabase
    .from("idempotency_keys")
    .select("user_id, response_status, response_body")
    .eq("key", key)
    .maybeSingle();

  if (!existing) {
    return {
      claimed: false,
      response: errorResponse(
        500,
        "INTERNAL_ERROR",
        "Idempotency lookup failed",
        requestId,
      ),
    };
  }

  if (existing.user_id !== userId) {
    return {
      claimed: false,
      response: errorResponse(
        409,
        "IDEMPOTENCY_CONFLICT",
        "Idempotency key already used with different params",
        requestId,
      ),
    };
  }

  if (existing.response_status === null) {
    return {
      claimed: false,
      response: errorResponse(
        409,
        "IDEMPOTENCY_IN_PROGRESS",
        "Request with this idempotency key is still in progress; retry shortly",
        requestId,
      ),
    };
  }

  return {
    claimed: false,
    response: new Response(JSON.stringify(existing.response_body), {
      status: existing.response_status,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    }),
  };
}

export async function storeIdempotencyResult(
  supabase: SupabaseClient,
  key: string,
  userId: string,
  responseStatus: number,
  responseBody: unknown,
): Promise<void> {
  await supabase
    .from("idempotency_keys")
    .update({
      response_status: responseStatus,
      response_body: responseBody,
    })
    .eq("key", key)
    .eq("user_id", userId);
}
