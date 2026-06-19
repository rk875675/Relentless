import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import * as x509 from "https://esm.sh/@peculiar/x509@1.12.3";
import { verifyAppleJws } from "./apple_jws.ts";

// ---------------------------------------------------------------------------
// Test helpers: build a real (self-generated) Apple-like chain so we can prove
// the FULL positive path (valid chain + valid ES256 signature) and the
// negative paths, without Apple's private key.
// ---------------------------------------------------------------------------

x509.cryptoProvider.set(crypto);

function b64url(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function b64urlStr(s: string): string {
  return b64url(new TextEncoder().encode(s));
}

const NOT_BEFORE = new Date(Date.now() - 60 * 60 * 1000);
const NOT_AFTER = new Date(Date.now() + 24 * 60 * 60 * 1000);

async function buildChain() {
  const rootKeys = await crypto.subtle.generateKey(
    { name: "ECDSA", namedCurve: "P-384" },
    true,
    ["sign", "verify"],
  ) as CryptoKeyPair;
  const root = await x509.X509CertificateGenerator.createSelfSigned({
    serialNumber: "01",
    name: "CN=Test Apple Root CA - G3",
    notBefore: NOT_BEFORE,
    notAfter: NOT_AFTER,
    keys: rootKeys,
    signingAlgorithm: { name: "ECDSA", hash: "SHA-384" },
  }, crypto);

  const intKeys = await crypto.subtle.generateKey(
    { name: "ECDSA", namedCurve: "P-384" },
    true,
    ["sign", "verify"],
  ) as CryptoKeyPair;
  const intermediate = await x509.X509CertificateGenerator.create({
    serialNumber: "02",
    subject: "CN=Test Apple WWDR",
    issuer: root.subject,
    notBefore: NOT_BEFORE,
    notAfter: NOT_AFTER,
    publicKey: intKeys.publicKey,
    signingKey: rootKeys.privateKey,
    signingAlgorithm: { name: "ECDSA", hash: "SHA-384" },
  }, crypto);

  const leafKeys = await crypto.subtle.generateKey(
    { name: "ECDSA", namedCurve: "P-256" },
    true,
    ["sign", "verify"],
  ) as CryptoKeyPair;
  const leaf = await x509.X509CertificateGenerator.create({
    serialNumber: "03",
    subject: "CN=Test Apple Leaf",
    issuer: intermediate.subject,
    notBefore: NOT_BEFORE,
    notAfter: NOT_AFTER,
    publicKey: leafKeys.publicKey,
    signingKey: intKeys.privateKey,
    signingAlgorithm: { name: "ECDSA", hash: "SHA-384" },
  }, crypto);

  return { root, intermediate, leaf, leafKeys };
}

async function signJws(
  payload: Record<string, unknown>,
  leaf: x509.X509Certificate,
  intermediate: x509.X509Certificate,
  root: x509.X509Certificate,
  leafPrivateKey: CryptoKey,
): Promise<string> {
  const x5c = [
    leaf.toString("base64"),
    intermediate.toString("base64"),
    root.toString("base64"),
  ];
  const headerB64 = b64urlStr(JSON.stringify({ alg: "ES256", x5c }));
  const payloadB64 = b64urlStr(JSON.stringify(payload));
  const signingInput = `${headerB64}.${payloadB64}`;
  const sig = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    leafPrivateKey,
    new TextEncoder().encode(signingInput),
  );
  return `${signingInput}.${b64url(new Uint8Array(sig))}`;
}

Deno.test("valid chain + valid signature verifies and returns claims", async () => {
  const { root, intermediate, leaf, leafKeys } = await buildChain();
  const payload = { bundleId: "com.relentlessmentaltoughness.relentless", productId: "relentless_monthly", expiresDate: Date.now() + 1_000_000 };
  const jws = await signJws(payload, leaf, intermediate, root, leafKeys.privateKey);

  const res = await verifyAppleJws<typeof payload>(jws, root);
  assertEquals(res.ok, true);
  if (res.ok) assertEquals(res.payload.bundleId, payload.bundleId);
});

Deno.test("valid chain but NOT anchored to Apple root is rejected (default anchor)", async () => {
  const { root, intermediate, leaf, leafKeys } = await buildChain();
  const jws = await signJws({ bundleId: "x" }, leaf, intermediate, root, leafKeys.privateKey);
  const res = await verifyAppleJws(jws); // default = real Apple root
  assertEquals(res.ok, false);
});

Deno.test("tampered payload (signature mismatch) is rejected", async () => {
  const { root, intermediate, leaf, leafKeys } = await buildChain();
  const jws = await signJws({ bundleId: "a", expiresDate: 1 }, leaf, intermediate, root, leafKeys.privateKey);
  const parts = jws.split(".");
  const forgedPayload = b64urlStr(JSON.stringify({ bundleId: "com.relentlessmentaltoughness.relentless", expiresDate: Date.now() + 9_000_000 }));
  const tampered = `${parts[0]}.${forgedPayload}.${parts[2]}`;
  const res = await verifyAppleJws(tampered, root);
  assertEquals(res.ok, false);
});

Deno.test("attacker-forged JWS (fake x5c, no real chain) is rejected", async () => {
  const header = b64urlStr(JSON.stringify({ alg: "ES256", x5c: ["ZmFrZQ=="] }));
  const payload = b64urlStr(JSON.stringify({ bundleId: "com.relentlessmentaltoughness.relentless", expiresDate: Date.now() + 9_000_000, offerDiscountType: "FREE_TRIAL" }));
  const forged = `${header}.${payload}.ZmFrZXNpZw`;
  const res = await verifyAppleJws(forged);
  assertEquals(res.ok, false);
});

Deno.test("wrong alg is rejected", async () => {
  const { root, intermediate, leaf } = await buildChain();
  const x5c = [leaf.toString("base64"), intermediate.toString("base64"), root.toString("base64")];
  const header = b64urlStr(JSON.stringify({ alg: "none", x5c }));
  const payload = b64urlStr(JSON.stringify({ bundleId: "x" }));
  const res = await verifyAppleJws(`${header}.${payload}.`, root);
  assertEquals(res.ok, false);
});

Deno.test("too-short x5c is rejected", async () => {
  const { leaf } = await buildChain();
  const header = b64urlStr(JSON.stringify({ alg: "ES256", x5c: [leaf.toString("base64")] }));
  const payload = b64urlStr(JSON.stringify({ bundleId: "x" }));
  const res = await verifyAppleJws(`${header}.${payload}.AAAA`);
  assertEquals(res.ok, false);
});

Deno.test("malformed input is rejected", async () => {
  assertEquals((await verifyAppleJws("")).ok, false);
  assertEquals((await verifyAppleJws("a.b")).ok, false);
  assertEquals((await verifyAppleJws("not-base64.@@@.zzz")).ok, false);
});
