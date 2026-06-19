import * as x509 from "https://esm.sh/@peculiar/x509@1.12.3";

// ---------------------------------------------------------------------------
// Apple JWS (x5c / ES256) signature verification.
//
// Apple signs App Store Server API transactions and App Store Server
// Notifications v2 as JWS objects whose protected header carries an `x5c`
// certificate chain ([leaf, intermediate, root]) issued by Apple's PKI.
//
// To trust a JWS we must:
//   1. Verify the ES256 signature over `header.payload` with the leaf cert key.
//   2. Verify the certificate chain links (leaf <- intermediate <- root).
//   3. Anchor the chain to the *pinned* Apple Root CA - G3 (below) so an
//      attacker cannot supply their own self-signed chain.
//   4. Reject expired / not-yet-valid certificates.
//
// Only when ALL of the above pass do we return the decoded claims. Any failure
// returns { ok: false } so callers never act on an unauthenticated payload.
//
// The pinned root below is Apple's PUBLIC root certificate (not a secret):
//   https://www.apple.com/certificateauthority/AppleRootCA-G3.cer
//   SHA-256: 63343ABFB89A6A03EBB57E9B3F5FA7BE7C4F5C756F3017B3A8C488C3653E9179
// ---------------------------------------------------------------------------

const APPLE_ROOT_CA_G3_DER_B64 =
  "MIICQzCCAcmgAwIBAgIILcX8iNLFS5UwCgYIKoZIzj0EAwMwZzEbMBkGA1UEAwwSQXBwbGUgUm9vdCBDQSAtIEczMSYwJAYDVQQLDB1BcHBsZSBDZXJ0aWZpY2F0aW9uIEF1dGhvcml0eTETMBEGA1UECgwKQXBwbGUgSW5jLjELMAkGA1UEBhMCVVMwHhcNMTQwNDMwMTgxOTA2WhcNMzkwNDMwMTgxOTA2WjBnMRswGQYDVQQDDBJBcHBsZSBSb290IENBIC0gRzMxJjAkBgNVBAsMHUFwcGxlIENlcnRpZmljYXRpb24gQXV0aG9yaXR5MRMwEQYDVQQKDApBcHBsZSBJbmMuMQswCQYDVQQGEwJVUzB2MBAGByqGSM49AgEGBSuBBAAiA2IABJjpLz1AcqTtkyJygRMc3RCV8cWjTnHcFBbZDuWmBSp3ZHtfTjjTuxxEtX/1H7YyYl3J6YRbTzBPEVoA/VhYDKX1DyxNB0cTddqXl5dvMVztK517IDvYuVTZXpmkOlEKMaNCMEAwHQYDVR0OBBYEFLuw3qFYM4iapIqZ3r6966/ayySrMA8GA1UdEwEB/wQFMAMBAf8wDgYDVR0PAQH/BAQDAgEGMAoGCCqGSM49BAMDA2gAMGUCMQCD6cHEFl4aXTQY2e3v9GwOAEZLuN+yRhHFD/3meoyhpmvOwgPUnPWTxnS4at+qIxUCMG1mihDK1A3UT82NQz60imOlM27jbdoXt2QfyFMm+YhidDkLF1vLUagM6BgD56KyKA==";

export type AppleJwsResult<T> =
  | { ok: true; payload: T }
  | { ok: false; reason: "invalid" };

type JwsHeader = { alg?: string; x5c?: unknown };

function base64UrlToBytes(input: string): Uint8Array {
  const normalized = input.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(
    normalized.length + ((4 - (normalized.length % 4)) % 4),
    "=",
  );
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function base64UrlToString(input: string): string {
  return new TextDecoder().decode(base64UrlToBytes(input));
}

function bytesEqual(a: ArrayBuffer, b: ArrayBuffer): boolean {
  if (a.byteLength !== b.byteLength) return false;
  const ua = new Uint8Array(a);
  const ub = new Uint8Array(b);
  for (let i = 0; i < ua.length; i++) {
    if (ua[i] !== ub[i]) return false;
  }
  return true;
}

// Parse the pinned root once at module load. If this throws the function will
// fail to start (a deploy-time error we catch via the self-test), rather than
// silently mis-classifying live traffic.
const APPLE_ROOT = new x509.X509Certificate(APPLE_ROOT_CA_G3_DER_B64);

/**
 * Validate the x5c chain links and anchor it to the pinned Apple root.
 *
 * `certs` is the x5c list as presented in the JWS header, leaf first.
 * Returns true only when every adjacent link verifies, all certs are within
 * their validity window, and the chain terminates at the pinned Apple root.
 */
async function validateChain(
  certs: x509.X509Certificate[],
  pinnedRoot: x509.X509Certificate,
  now: Date,
): Promise<boolean> {
  for (const cert of certs) {
    if (now < cert.notBefore || now > cert.notAfter) return false;
  }

  for (let i = 0; i < certs.length - 1; i++) {
    const child = certs[i];
    const issuer = certs[i + 1];
    if (child.issuer !== issuer.subject) return false;
    const linkOk = await child.verify(
      { publicKey: issuer.publicKey, signatureOnly: true },
      crypto,
    );
    if (!linkOk) return false;
  }

  const top = certs[certs.length - 1];

  // Case 1: Apple included its root in x5c — pin by exact bytes so an attacker
  // cannot substitute a look-alike self-signed root.
  if (bytesEqual(top.rawData, pinnedRoot.rawData)) return true;

  // Case 2: Root omitted from x5c — the top presented cert must itself be
  // issued by, and verify against, the pinned root.
  if (top.issuer !== pinnedRoot.subject) return false;
  return await top.verify(
    { publicKey: pinnedRoot.publicKey, signatureOnly: true },
    crypto,
  );
}

/**
 * Verify an Apple-signed JWS and return its decoded claims.
 *
 * Returns { ok: true, payload } ONLY when the ES256 signature is valid and the
 * x5c chain anchors to the pinned Apple Root CA - G3. Every other outcome
 * (malformed input, wrong alg, broken/forged chain, bad signature, internal
 * parse error on attacker-controlled data) returns { ok: false }.
 *
 * `pinnedRootForTest` exists ONLY so unit tests can anchor to a generated root.
 * Production callers must never pass it — it defaults to the real Apple root.
 */
export async function verifyAppleJws<T>(
  jws: string,
  pinnedRootForTest?: x509.X509Certificate,
): Promise<AppleJwsResult<T>> {
  const pinnedRoot = pinnedRootForTest ?? APPLE_ROOT;
  try {
    const parts = jws.split(".");
    if (parts.length !== 3) return { ok: false, reason: "invalid" };
    const [headerB64, payloadB64, signatureB64] = parts;

    let header: JwsHeader;
    try {
      header = JSON.parse(base64UrlToString(headerB64)) as JwsHeader;
    } catch {
      return { ok: false, reason: "invalid" };
    }

    if (header.alg !== "ES256") return { ok: false, reason: "invalid" };
    if (!Array.isArray(header.x5c) || header.x5c.length < 2) {
      return { ok: false, reason: "invalid" };
    }
    if (!header.x5c.every((c) => typeof c === "string" && c.length > 0)) {
      return { ok: false, reason: "invalid" };
    }

    let certs: x509.X509Certificate[];
    try {
      certs = (header.x5c as string[]).map((c) => new x509.X509Certificate(c));
    } catch {
      return { ok: false, reason: "invalid" };
    }

    const now = new Date();
    const chainOk = await validateChain(certs, pinnedRoot, now);
    if (!chainOk) return { ok: false, reason: "invalid" };

    // Verify the ES256 signature over `header.payload` with the leaf key.
    const leafKey = await certs[0].publicKey.export(
      { name: "ECDSA", namedCurve: "P-256" } as EcKeyImportParams,
      ["verify"],
      crypto,
    );
    const signingInput = new TextEncoder().encode(`${headerB64}.${payloadB64}`);
    const signature = base64UrlToBytes(signatureB64);
    const sigOk = await crypto.subtle.verify(
      { name: "ECDSA", hash: "SHA-256" },
      leafKey,
      signature as BufferSource,
      signingInput as BufferSource,
    );
    if (!sigOk) return { ok: false, reason: "invalid" };

    let payload: T;
    try {
      payload = JSON.parse(base64UrlToString(payloadB64)) as T;
    } catch {
      return { ok: false, reason: "invalid" };
    }

    return { ok: true, payload };
  } catch {
    // Any unexpected failure while processing attacker-controlled data is
    // treated as a verification failure — never trust the payload.
    return { ok: false, reason: "invalid" };
  }
}
