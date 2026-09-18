import { analytics } from '@/lib/analytics';

type ReferralProps = Record<string, unknown>;

function captureReferral(event: string, properties?: ReferralProps): void {
  // attribution_source last so a caller can never accidentally override it.
  analytics.capture(event, {
    ...properties,
    attribution_source: 'referral',
  });
}

/** Invite tab opened. Client funnel only — not a money event. */
export function trackReferralInviteTabViewed(properties?: ReferralProps): void {
  captureReferral('referral_invite_tab_viewed', properties);
}

export function trackReferralProfileCtaTapped(properties?: ReferralProps): void {
  captureReferral('referral_profile_cta_tapped', properties);
}

export function trackReferralShareTapped(properties?: ReferralProps): void {
  captureReferral('referral_share_tapped', properties);
}

export function trackReferralPopupShown(properties?: ReferralProps): void {
  captureReferral('referral_popup_shown', properties);
}

export function trackReferralPopupInviteTapped(properties?: ReferralProps): void {
  captureReferral('referral_popup_invite_tapped', properties);
}

export function trackReferralCodeRecognized(properties?: ReferralProps): void {
  captureReferral('referral_code_recognized', properties);
}

export function trackReferralCadenceSelected(
  properties: ReferralProps & { cadence: 'monthly' | 'annual'; has_account: boolean },
): void {
  captureReferral('referral_cadence_selected', properties);
}

export function trackReferralOfferSheetPresented(properties?: ReferralProps): void {
  captureReferral('referral_offer_sheet_presented', properties);
}

export function trackReferralOfferSheetResult(
  properties: ReferralProps & { confirmed: boolean },
): void {
  captureReferral('referral_offer_sheet_result', properties);
}
