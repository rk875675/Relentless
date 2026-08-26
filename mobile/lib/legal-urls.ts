/**
 * Public legal URLs for in-app links (App Store, privacy, terms).
 * Both are fixed canonical URLs so older builds / env overrides cannot drift.
 */

/** Hosted privacy policy — always present in-app. */
export const LEGAL_PRIVACY_POLICY_URL = new URL(
  'https://relentlessmentaltoughness.com/privacy-policy/',
).toString();

/** Hosted terms of use — always present in-app. */
export const LEGAL_TERMS_OF_USE_URL = new URL(
  'https://relentlessmentaltoughness.com/terms-of-use/',
).toString();
