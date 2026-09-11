// ---------------------------------------------------------------------------
// Apple promotional offer signatures.
//
// The sharer's half of the referral reward is a signed promotional offer on
// the subscription they already own. Apple validates the signature against
// the exact parameters the app then sends with the purchase, so every field
// here has to match what the client passes, byte for byte.
//
// Payload format, per Apple's "Generating a signature for promotional offers"
// and their own app-store-server-library:
//
//   appBundleId ⁣ keyIdentifier ⁣ productIdentifier ⁣ offerIdentifier
//     ⁣ appAccountToken ⁣ nonce ⁣ timestamp
//
// joined by U+2063 INVISIBLE SEPARATOR, UTF-8, signed ECDSA P-256 / SHA-256.
//
// The signature must be DER (X9.62), which is what Apple's library produces
// via Node's createSign. WebCrypto returns the raw r||s pair instead, so it is
// converted below — a raw signature is silently rejected by StoreKit as
// invalidOfferSignature.
//
// The key never leaves the server (PRD 10.5.2). Signatures are valid for 24
// hours, are single use, and a fresh one must be minted after any failed
// attempt, so nothing here is cached.
// ---------------------------------------------------------------------------

const SEPARATOR = "\u2063";

export type PromotionalOfferSignature = {
  productId: string;
  offerIdentifier: string;
  keyIdentifier: string;
  /** Lowercase UUID, single use. */
  nonce: string;
  /** Milliseconds since epoch. Apple keeps the offer active for 24 hours. */
  timestamp: number;
  /** Base64 DER ECDSA signature. */
  signature: string;
  /**
   * The value folded into the signature. The app MUST pass exactly this as
   * its app account token, which today means not setting one at all.
   */
  appAccountToken: string;
};

export type SignResult =
  | { ok: true; signature: PromotionalOfferSignature }
  | { ok: false; reason: "not_configured" | "sign_failed" };

// --- DER encoding ----------------------------------------------------------

function stripLeadingZeros(bytes: Uint8Array): Uint8Array {
  let i = 0;
  while (i < bytes.length - 1 && bytes[i] === 0) i++;
  return bytes.subarray(i);
}

function derInteger(value: Uint8Array): Uint8Array {
  const trimmed = stripLeadingZeros(value);
  // ASN.1 INTEGER is signed, so a leading high bit needs a zero byte in front
  // or the value would be read as negative.
  const needsPad = trimmed.length === 0 || (trimmed[0] & 0x80) !== 0;
  const content = needsPad ? new Uint8Array([0, ...trimmed]) : trimmed;
  return new Uint8Array([0x02, content.length, ...content]);
}

/** Raw r||s (as WebCrypto returns) to a DER SEQUENCE of two INTEGERs. */
function rawToDer(raw: Uint8Array): Uint8Array {
  const half = raw.length / 2;
  const body = new Uint8Array([
    ...derInteger(raw.subarray(0, half)),
    ...derInteger(raw.subarray(half)),
  ]);
  // A P-256 sequence is at most 70 bytes, so the short-form length always
  // applies; long form would need a different header.
  if (body.length > 127) throw new Error("unexpected signature length");
  return new Uint8Array([0x30, body.length, ...body]);
}

function pemToDer(pem: string): ArrayBuffer {
  // Armor stripped generically and without the literal header text, so the
  // pre-commit secret scanner keeps flagging that delimiter on sight.
  const b64 = pem.replace(/-----[^-]+-----/g, "").replace(/\s/g, "");
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

function toBase64(bytes: Uint8Array): string {
  let out = "";
  for (const b of bytes) out += String.fromCharCode(b);
  return btoa(out);
}

// --- Signing ---------------------------------------------------------------

/**
 * Mints one single-use promotional offer signature.
 *
 * @param bundleId        The app bundle identifier.
 * @param productId       The subscription the offer applies to. Must be the
 *                        product that will actually renew.
 * @param offerIdentifier The App Store Connect promotional offer reference name.
 * @param appAccountToken Must equal what the app sends at purchase; "" when
 *                        the app sets no token.
 */
export async function signPromotionalOffer(
  bundleId: string,
  productId: string,
  offerIdentifier: string,
  appAccountToken = "",
): Promise<SignResult> {
  const privateKey = Deno.env.get("APPLE_IAP_PRIVATE_KEY") ?? "";
  const keyIdentifier = Deno.env.get("APPLE_IAP_KEY_ID") ?? "";
  if (!privateKey || !keyIdentifier) return { ok: false, reason: "not_configured" };

  const nonce = crypto.randomUUID().toLowerCase();
  const timestamp = Date.now();

  const payload = [
    bundleId,
    keyIdentifier,
    productId,
    offerIdentifier,
    appAccountToken.toLowerCase(),
    nonce,
    timestamp,
  ].join(SEPARATOR);

  try {
    const key = await crypto.subtle.importKey(
      "pkcs8",
      pemToDer(privateKey),
      { name: "ECDSA", namedCurve: "P-256" },
      false,
      ["sign"],
    );
    const raw = await crypto.subtle.sign(
      { name: "ECDSA", hash: "SHA-256" },
      key,
      new TextEncoder().encode(payload),
    );

    return {
      ok: true,
      signature: {
        productId,
        offerIdentifier,
        keyIdentifier,
        nonce,
        timestamp,
        signature: toBase64(rawToDer(new Uint8Array(raw))),
        appAccountToken,
      },
    };
  } catch (err) {
    // Never log the payload or any key material.
    console.error("[apple_promotional_offer] signing failed", {
      productId,
      offerIdentifier,
      error: err instanceof Error ? err.message : "unknown",
    });
    return { ok: false, reason: "sign_failed" };
  }
}
