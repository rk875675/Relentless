import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

/**
 * Sets `profiles.program_start_date` once, when the user hits Home (header anchor).
 */
export async function ensureProgramStartIfHome(
  supabase: SupabaseClient,
  userId: string,
  localDateYmd: string,
  anchor: string | null,
): Promise<void> {
  if (anchor !== "home") return;
  const { error } = await supabase.rpc("ensure_program_start", {
    p_user_id: userId,
    p_local_date: localDateYmd,
  });
  if (error) {
    console.error("ensure_program_start failed", error.message);
  }
}
