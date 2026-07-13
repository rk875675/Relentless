import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';
import { parseAuthParamsFromUrl } from '@/lib/auth-redirects';

/**
 * Dedupe for auth deep links (password recovery / email confirmation).
 *
 * `Linking.getInitialURL()` returns the URL that launched the app, and on a
 * reload (Expo dev) or relaunch it can keep returning the SAME stale link.
 * expo-router also re-opens the matching route from that launch URL. Without
 * dedupe the app re-navigates to the recovery screen on every reload — even
 * after the user has signed in normally — and re-processes an already-used
 * token (which signs them out / shows "link expired").
 *
 * We persist the credential of each link we've already RESOLVED (verified or
 * definitively failed). A stale relaunch of the same link is then ignored,
 * while a genuinely new link (different token_hash/code) is still processed.
 *
 * SECURITY: only a SHA-256 of the credential is persisted — for implicit-flow
 * links the credential can be a full session access_token, which must never
 * sit in AsyncStorage in plaintext. The hash is enough for equality dedupe.
 */
const KEY = 'relentless-handled-auth-cred';

/** The one-time credential that uniquely identifies a specific auth link. */
export function credentialOf(url: string): string | null {
  const p = parseAuthParamsFromUrl(url);
  return p.token_hash || p.code || p.access_token || null;
}

async function hashCredential(cred: string): Promise<string> {
  return Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, cred);
}

export async function isCredentialHandled(cred: string | null | undefined): Promise<boolean> {
  if (!cred) return false;
  try {
    return (await AsyncStorage.getItem(KEY)) === (await hashCredential(cred));
  } catch {
    return false;
  }
}

export async function markCredentialHandled(cred: string | null | undefined): Promise<void> {
  if (!cred) return;
  try {
    await AsyncStorage.setItem(KEY, await hashCredential(cred));
  } catch {
    // Best-effort; dedupe is a safeguard, not a correctness requirement.
  }
}

export function isAuthLinkAlreadyHandled(url: string): Promise<boolean> {
  return isCredentialHandled(credentialOf(url));
}

export function markAuthLinkHandled(url: string): Promise<void> {
  return markCredentialHandled(credentialOf(url));
}
