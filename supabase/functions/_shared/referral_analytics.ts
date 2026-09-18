// Server-authoritative teammate-share analytics (PRD 10.5).
//
// Money tiles must NEVER use these events' amounts. Revenue is only
// subscription_state_synced with attribution_source=referral, a real
// Apple transaction_id, is_trial=false, and Production environment.
// These events exist so funnels, failure rates, and reward state can
// be counted once even when Apple, restore, and reconcile all retry.
//
// Never attach an issued Apple offer-code string. Share tokens are public.

import { capturePostHogEvent } from "./posthog.ts";

export const REFERRAL_EVENT = {
  SHARE_CODE_READY: "referral_share_code_ready",
  SHARE_REQUEST_FAILED: "referral_share_request_failed",
  CLAIM_SUCCEEDED: "referral_claim_succeeded",
  CLAIM_FAILED: "referral_claim_failed",
  RECONCILE_SUCCEEDED: "referral_reconcile_succeeded",
  RECONCILE_FAILED: "referral_reconcile_failed",
  REWARD_RELEASED: "referral_reward_released",
  REWARD_RELEASE_SKIPPED: "referral_reward_release_skipped",
  SHARER_OFFER_SIGNED: "referral_sharer_offer_signed",
  SHARER_OFFER_SIGN_FAILED: "referral_sharer_offer_sign_failed",
  SHARER_REWARD_APPLIED: "referral_sharer_reward_applied",
} as const;

const EXPECTED_SKIP = new Set(["trial_not_paid", "no_invite", "no_reward"]);

export function isSandboxEnvironment(environment: string | null | undefined): boolean {
  if (!environment) return false;
  const value = environment.toLowerCase();
  return value === "sandbox" || value === "xcode" || value === "localtesting";
}

export function referralBaseProps(
  extra: Record<string, unknown> = {},
  environment?: string | null,
): Record<string, unknown> {
  return {
    attribution_source: "referral",
    environment: environment ?? null,
    is_sandbox: isSandboxEnvironment(environment),
    ...extra,
  };
}

export async function captureReferralEvent(
  distinctId: string,
  event: string,
  properties: Record<string, unknown>,
  insertId?: string,
): Promise<void> {
  const environment = typeof properties.environment === "string" ? properties.environment : null;
  await capturePostHogEvent(
    distinctId,
    event,
    referralBaseProps(properties, environment),
    insertId ? { insertId } : undefined,
  );
}

export type RewardReleaseRpc = {
  result?: string;
  invite_id?: string;
  received_created?: boolean;
  gave_created?: boolean;
  gave_skipped_reason?: string | null;
  invitee_product_id?: string | null;
  sharer_product_id?: string | null;
  sharer_offer_identifier?: string | null;
};

export async function emitReferralRewardRelease(args: {
  distinctId: string;
  rpc: RewardReleaseRpc | null | undefined;
  rpcError?: string | null;
  source: "apple_notification" | "purchases_restore" | "referral_reconcile";
  originalTransactionId: string;
  offerIdentifier: string;
  productId?: string | null;
  environment?: string | null;
}): Promise<void> {
  const result = args.rpcError
    ? "rpc_error"
    : typeof args.rpc?.result === "string"
      ? args.rpc.result
      : "unknown";
  const inviteId = typeof args.rpc?.invite_id === "string" ? args.rpc.invite_id : null;
  const common = referralBaseProps({
    source: args.source,
    result,
    invite_id: inviteId,
    original_transaction_id: args.originalTransactionId,
    offer_identifier: args.offerIdentifier,
    product_id: args.productId ?? args.rpc?.invitee_product_id ?? null,
    received_created: args.rpc?.received_created === true,
    gave_created: args.rpc?.gave_created === true,
    gave_skipped_reason: args.rpc?.gave_skipped_reason ?? null,
    sharer_product_id: args.rpc?.sharer_product_id ?? null,
  }, args.environment);

  if (result === "released") {
    await capturePostHogEvent(
      args.distinctId,
      REFERRAL_EVENT.REWARD_RELEASED,
      common,
      { insertId: `referral_reward_released:${inviteId ?? args.originalTransactionId}` },
    );
    return;
  }

  // Restore/reconcile poll every user with an offerType=3 log row. no_invite
  // is the normal non-referral case and must not land in failure tiles.
  if (result === "no_invite") return;

  await capturePostHogEvent(
    args.distinctId,
    REFERRAL_EVENT.REWARD_RELEASE_SKIPPED,
    {
      attribution_source: "referral",
      environment: args.environment ?? null,
      is_sandbox: isSandboxEnvironment(args.environment),
      source: args.source,
      result,
      invite_id: inviteId,
      offer_identifier: args.offerIdentifier,
      product_id: args.productId ?? args.rpc?.invitee_product_id ?? null,
      skip_kind: EXPECTED_SKIP.has(result) ? "expected" : "failed",
    },
    { insertId: `referral_reward_skip:${args.originalTransactionId}:${result}` },
  );
}

export type SharerConfirmRpc = {
  result?: string;
  reward_id?: string;
  period_end?: string | null;
};

export async function emitSharerRewardApplied(args: {
  distinctId: string;
  rpc: SharerConfirmRpc | null | undefined;
  rpcError?: string | null;
  source: "apple_notification" | "offer_signature";
  originalTransactionId: string;
  offerIdentifier: string;
  environment?: string | null;
}): Promise<void> {
  if (args.rpcError) {
    await capturePostHogEvent(
      args.distinctId,
      REFERRAL_EVENT.SHARER_OFFER_SIGN_FAILED,
      referralBaseProps({
        source: args.source,
        reason: "confirm_rpc_error",
        original_transaction_id: args.originalTransactionId,
        offer_identifier: args.offerIdentifier,
      }, args.environment),
    );
    return;
  }

  const result = typeof args.rpc?.result === "string" ? args.rpc.result : "unknown";
  if (result === "no_reward") return;

  const rewardId = typeof args.rpc?.reward_id === "string" ? args.rpc.reward_id : null;
  if (result === "applied" || result === "already_applied") {
    await capturePostHogEvent(
      args.distinctId,
      REFERRAL_EVENT.SHARER_REWARD_APPLIED,
      referralBaseProps({
        source: args.source,
        result,
        reward_id: rewardId,
        original_transaction_id: args.originalTransactionId,
        offer_identifier: args.offerIdentifier,
        period_end: args.rpc?.period_end ?? null,
      }, args.environment),
      { insertId: `referral_sharer_applied:${rewardId ?? args.originalTransactionId}` },
    );
  }
}
