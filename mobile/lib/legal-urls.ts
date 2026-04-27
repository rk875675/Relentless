/**
 * Public legal URLs for in-app links (App Store, privacy, terms).
 * Terms: set EXPO_PUBLIC_TERMS_OF_USE_URL in the build env.
 * Privacy: fixed canonical URL so older builds / env secrets cannot point at legacy hosts.
 * Invalid or non-https term values are treated as missing so we never call Linking with an empty URL.
 */

function readHttpsUrl(envKey: string): string | null {
  const raw = process.env[envKey]?.trim();
  if (!raw || !/^https:\/\//i.test(raw)) return null;
  try {
    return new URL(raw).toString();
  } catch {
    return null;
  }
}

/** Hosted privacy policy — always used for in-app “Privacy Policy” (not overridable by env). */
export const LEGAL_PRIVACY_POLICY_URL = new URL(
  'https://relentlessmentaltoughness.com/privacy-policy/',
).toString();

export const LEGAL_TERMS_OF_USE_URL = readHttpsUrl('EXPO_PUBLIC_TERMS_OF_USE_URL');
