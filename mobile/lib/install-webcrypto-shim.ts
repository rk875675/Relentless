import { Platform } from 'react-native';
import * as ExpoCrypto from 'expo-crypto';

/**
 * @supabase/auth-js PKCE checks `globalThis.crypto.subtle` for S256. RN has `getRandomValues`
 * (via polyfill) but often no `subtle`, so it falls back to "plain" and logs a warning.
 * `expo-crypto.digest` is native-backed and does not need NitroModules.
 */
export function installWebCryptoSubtleDigestShim() {
  if (Platform.OS === 'web') return;
  if (typeof globalThis.crypto === 'undefined') {
    (globalThis as { crypto?: Crypto }).crypto = {} as Crypto;
  }
  const c = globalThis.crypto as Crypto & { subtle?: SubtleCrypto };
  if (c.subtle != null && typeof c.subtle.digest === 'function') return;

  const subtleDigest = {
    async digest(algorithm: AlgorithmIdentifier, data: ArrayBuffer): Promise<ArrayBuffer> {
      const name = typeof algorithm === 'string' ? algorithm : (algorithm as { name: string }).name;
      if (name !== 'SHA-256') {
        throw new Error(`Unsupported digest: ${name}`);
      }
      return ExpoCrypto.digest(ExpoCrypto.CryptoDigestAlgorithm.SHA256, new Uint8Array(data));
    },
  } as SubtleCrypto;

  Object.defineProperty(c, 'subtle', { value: subtleDigest, configurable: true, writable: true });
}
