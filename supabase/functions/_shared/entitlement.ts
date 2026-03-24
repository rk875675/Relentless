import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { errorResponse } from "./response.ts";

// Per endpoint_inventory.md: trial and active are access-valid
const ACCESS_VALID_STATUSES = ["trial", "active"];

export type EntitlementResult =
  | { ok: true }
  | { ok: false; response: Response };

export async function requireEntitlement(
  supabase: SupabaseClient,
  userId: string,
  requestId: string,
): Promise<EntitlementResult> {
  const { data, error } = await supabase
    .from("entitlements")
    .select("status")
    .eq("user_id", userId)
    .single();

  if (error || !data || !ACCESS_VALID_STATUSES.includes(data.status)) {
    return {
      ok: false,
      response: errorResponse(
        403,
        "ENTITLEMENT_REQUIRED",
        "Active subscription required",
        requestId,
      ),
    };
  }

  return { ok: true };
}
