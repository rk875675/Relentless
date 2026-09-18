import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

/**
 * True when a different Relentless user already owns this Apple
 * original_transaction_id. Restore/reconcile must not glue two accounts onto
 * one subscription (same-device StoreKit can offer the wrong receipt).
 */
export async function otidClaimedByOtherUser(
  supabase: SupabaseClient,
  otid: string,
  userId: string,
): Promise<boolean> {
  const { data, error } = await supabase
    .from("entitlements")
    .select("user_id")
    .eq("original_transaction_id", otid)
    .neq("user_id", userId)
    .limit(1)
    .maybeSingle();
  if (error) {
    console.warn("[otid_guard] lookup failed", { error: error.message });
    return false;
  }
  return typeof data?.user_id === "string";
}
