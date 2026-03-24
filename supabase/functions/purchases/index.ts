import { z } from "https://esm.sh/zod@3";
import { createServiceClient } from "../_shared/supabase.ts";
import {
  corsHeaders,
  generateRequestId,
  errorResponse,
} from "../_shared/response.ts";
import { getUser } from "../_shared/auth.ts";
import { checkRateLimit } from "../_shared/ratelimit.ts";
import {
  checkIdempotencyKey,
  storeIdempotencyKey,
} from "../_shared/idempotency.ts";

const RestoreSchema = z
  .object({
    originalTransactionId: z.string().min(1),
  })
  .strict();

// Apple subscription statuses that grant access
const ENTITLED_STATUSES = [1, 3, 4]; // Active, BillingRetryPeriod, GracePeriod

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const requestId = generateRequestId();

  if (req.method !== "POST") {
    return errorResponse(405, "VALIDATION_ERROR", "Method not allowed", requestId);
  }

  const url = new URL(req.url);
  if (!url.pathname.match(/\/purchases\/restore\/?$/)) {
    return errorResponse(405, "VALIDATION_ERROR", "Method not allowed for this path", requestId);
  }

  const supabase = createServiceClient();
  const auth = await getUser(req, supabase, requestId);
  if (!auth.ok) return auth.response;

  const rl = await checkRateLimit(auth.userId, requestId, "billing");
  if (!rl.ok) return rl.response;

  const idempotencyKey = req.headers.get("Idempotency-Key");
  if (!idempotencyKey) {
    return errorResponse(400, "VALIDATION_ERROR", "Idempotency-Key header is required", requestId);
  }

  const check = await checkIdempotencyKey(supabase, idempotencyKey, auth.userId, requestId);
  if (check.replay) return check.response;

  let rawBody: unknown;
  try {
    rawBody = await req.json();
  } catch {
    return errorResponse(400, "VALIDATION_ERROR", "Invalid JSON body", requestId);
  }

  const parsed = RestoreSchema.safeParse(rawBody);
  if (!parsed.success) {
    return errorResponse(
      400,
      "VALIDATION_ERROR",
      parsed.error.issues[0]?.message ?? "Invalid request body",
      requestId,
    );
  }

  const { originalTransactionId } = parsed.data;

  let appleJwt: string;
  try {
    appleJwt = await generateAppleJwt();
  } catch {
    return errorResponse(500, "INTERNAL_ERROR", "Apple API configuration error", requestId);
  }

  const appleEnv = Deno.env.get("APPLE_ENVIRONMENT") ?? "Production";
  const appleBase =
    appleEnv === "Sandbox"
      ? "https://api.storekit-sandbox.itunes.apple.com"
      : "https://api.storekit.itunes.apple.com";

  let appleRes: Response;
  try {
    appleRes = await fetch(
      `${appleBase}/inApps/v1/subscriptions/${originalTransactionId}`,
      { headers: { Authorization: `Bearer ${appleJwt}` } },
    );
  } catch {
    return errorResponse(502, "INTERNAL_ERROR", "Failed to reach App Store API", requestId);
  }

  if (appleRes.status === 404) {
    return errorResponse(404, "NOT_FOUND", "Transaction not found in App Store", requestId);
  }
  if (!appleRes.ok) {
    return errorResponse(502, "INTERNAL_ERROR", "App Store API error", requestId);
  }

  const appleBody = await appleRes.json();

  let entitled = false;
  let productId: string | null = null;
  let expiresAt: string | null = null;

  for (const group of appleBody.data ?? []) {
    for (const tx of group.lastTransactions ?? []) {
      if (ENTITLED_STATUSES.includes(tx.status) && tx.signedTransactionInfo) {
        entitled = true;
        const txInfo = decodeJwsPayload(tx.signedTransactionInfo);
        productId = (txInfo.productId as string) ?? null;
        if (txInfo.expiresDate) {
          expiresAt = new Date(txInfo.expiresDate as number).toISOString();
        }
        break;
      }
    }
    if (entitled) break;
  }

  const newStatus = entitled ? "active" : "expired";

  const updateData: Record<string, unknown> = { status: newStatus };
  if (entitled && productId) updateData.product_id = productId;
  if (entitled && expiresAt) updateData.expires_at = expiresAt;

  await supabase
    .from("entitlements")
    .update(updateData)
    .eq("user_id", auth.userId);

  await supabase.from("entitlement_events").insert({
    user_id: auth.userId,
    event_type: "restored",
    product_id: productId,
    metadata: { originalTransactionId, resolved_status: newStatus },
  });

  const responseBody = {
    data: {
      status: newStatus,
      product_id: productId,
      expires_at: expiresAt,
    },
    request_id: requestId,
  };

  await storeIdempotencyKey(supabase, idempotencyKey, auth.userId, 200, responseBody);

  return new Response(JSON.stringify(responseBody), {
    status: 200,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });
});

function decodeJwsPayload(jws: string): Record<string, unknown> {
  const parts = jws.split(".");
  if (parts.length !== 3) return {};
  let b64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
  b64 += "=".repeat((4 - (b64.length % 4)) % 4);
  try {
    return JSON.parse(atob(b64));
  } catch {
    return {};
  }
}

async function generateAppleJwt(): Promise<string> {
  const keyId = Deno.env.get("APPLE_KEY_ID");
  const issuerId = Deno.env.get("APPLE_ISSUER_ID");
  const bundleId = Deno.env.get("APPLE_BUNDLE_ID");
  const privateKeyPem = Deno.env.get("APPLE_PRIVATE_KEY");

  if (!keyId || !issuerId || !bundleId || !privateKeyPem) {
    throw new Error("Missing Apple API env vars");
  }

  const pemBody = privateKeyPem
    .replace(/-----BEGIN PRIVATE KEY-----/, "")
    .replace(/-----END PRIVATE KEY-----/, "")
    .replace(/\\n/g, "")
    .replace(/\s/g, "");

  const keyBytes = Uint8Array.from(atob(pemBody), (c) => c.charCodeAt(0));

  const key = await crypto.subtle.importKey(
    "pkcs8",
    keyBytes,
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"],
  );

  const b64url = (obj: unknown): string => {
    const raw = btoa(JSON.stringify(obj));
    return raw.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
  };

  const now = Math.floor(Date.now() / 1000);
  const headerB64 = b64url({ alg: "ES256", kid: keyId, typ: "JWT" });
  const payloadB64 = b64url({
    iss: issuerId,
    iat: now,
    exp: now + 3600,
    aud: "appstoreconnect-v1",
    bid: bundleId,
  });

  const input = new TextEncoder().encode(`${headerB64}.${payloadB64}`);
  const sig = new Uint8Array(
    await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, input),
  );

  const sigB64 = btoa(String.fromCharCode(...sig))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");

  return `${headerB64}.${payloadB64}.${sigB64}`;
}
