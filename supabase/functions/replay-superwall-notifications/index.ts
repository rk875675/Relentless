import {
  corsHeaders,
  generateRequestId,
  errorResponse,
  successResponse,
} from "../_shared/response.ts";

// ---------------------------------------------------------------------------
// replay-superwall-notifications — analytics only.
//
// Pulls original App Store Server Notifications v2 payloads from Apple's
// Get Notification History API and POSTs them unchanged to Superwall's
// Option 2 event-forwarding URL. Does not write entitlements, PostHog, or
// App Store Connect notification URLs.
//
// Auth: x-cron-secret OR Bearer service_role / sb_secret (same as
// backfill-posthog-entitlements). dryRun defaults to true; apply requires
// { "dryRun": false, "confirm": "REPLAY_PRODUCTION" }.
//
// Default window: 2026-05-16T00:00:00.000Z → 2026-09-09T00:00:00.000Z
// (covers the Superwall gap; live forwarding started ~2026-09-09).
// ---------------------------------------------------------------------------

const BUNDLE_ID = "com.relentlessmentaltoughness.relentless";
const APPLE_HISTORY_URL =
  "https://api.storekit.itunes.apple.com/inApps/v1/notifications/history";
const DEFAULT_START_MS = Date.parse("2026-05-16T00:00:00.000Z");
const DEFAULT_END_MS = Date.parse("2026-09-09T00:00:00.000Z");
const MAX_PAGES = 200;
const REPLAY_CONCURRENCY = 16;
const DEFAULT_APPLY_LIMIT = 280;

type NotificationPayload = {
  notificationType?: string;
  notificationUUID?: string;
  signedDate?: number;
  data?: { environment?: string; bundleId?: string };
};

type HistoryItem = {
  signedPayload?: string;
};

type HistoryResponse = {
  notificationHistory?: HistoryItem[];
  paginationToken?: string;
  hasMore?: boolean;
};

function decodeJwtPayload<T>(jwt: string): T | null {
  const p = jwt.split(".")[1];
  if (!p) return null;
  try {
    const normalized = p.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized.padEnd(
      normalized.length + ((4 - (normalized.length % 4)) % 4),
      "=",
    );
    return JSON.parse(atob(padded)) as T;
  } catch {
    return null;
  }
}

function authorized(req: Request): boolean {
  const cronSecret = Deno.env.get("TRIAL_REMINDER_CRON_SECRET") ?? "";
  const provided = req.headers.get("x-cron-secret") ?? "";
  if (cronSecret && provided === cronSecret) return true;

  const auth = req.headers.get("Authorization") ?? "";
  const bearer = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!bearer) return false;

  const serviceKeys = [
    Deno.env.get("SB_SECRET_KEY") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  ].filter(Boolean);
  if (serviceKeys.includes(bearer)) return true;

  return decodeJwtPayload<{ role?: string }>(bearer)?.role === "service_role";
}

function parseWindow(body: Record<string, unknown>): { startMs: number; endMs: number } | string {
  const startMs = typeof body.startIso === "string"
    ? Date.parse(body.startIso)
    : DEFAULT_START_MS;
  const endMs = typeof body.endIso === "string" ? Date.parse(body.endIso) : DEFAULT_END_MS;
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) {
    return "startIso / endIso must be valid ISO timestamps";
  }
  if (startMs >= endMs) return "startIso must be before endIso";
  const oldest = Date.now() - 180 * 24 * 60 * 60 * 1000;
  if (startMs < oldest) return "startIso is older than Apple's 180-day history window";
  return { startMs, endMs };
}

async function buildAppleJwt(
  privateKeyPem: string,
  keyId: string,
  issuerId: string,
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const encode = (obj: unknown) =>
    btoa(JSON.stringify(obj)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  const headerB64 = encode({ alg: "ES256", kid: keyId, typ: "JWT" });
  const payloadB64 = encode({
    iss: issuerId,
    iat: now,
    exp: now + 3600,
    aud: "appstoreconnect-v1",
    bid: BUNDLE_ID,
  });
  const signingInput = `${headerB64}.${payloadB64}`;
  const b64 = privateKeyPem
    .replace(/-----BEGIN PRIVATE KEY-----/, "")
    .replace(/-----END PRIVATE KEY-----/, "")
    .replace(/\s/g, "");
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  const cryptoKey = await crypto.subtle.importKey(
    "pkcs8",
    bytes.buffer,
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"],
  );
  const signatureBuffer = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    cryptoKey,
    new TextEncoder().encode(signingInput),
  );
  const signatureB64 = btoa(String.fromCharCode(...new Uint8Array(signatureBuffer)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
  return `${signingInput}.${signatureB64}`;
}

function classify(signedPayload: string): {
  keep: boolean;
  reason: string;
  notificationType: string;
  signedDate: number | null;
} {
  const decoded = decodeJwtPayload<NotificationPayload>(signedPayload);
  if (!decoded) return { keep: false, reason: "undecodable", notificationType: "(unknown)", signedDate: null };
  const notificationType = decoded.notificationType ?? "(unknown)";
  const signedDate = typeof decoded.signedDate === "number" ? decoded.signedDate : null;
  if (notificationType === "TEST") {
    return { keep: false, reason: "test", notificationType, signedDate };
  }
  const environment = decoded.data?.environment ?? "";
  if (environment && environment !== "Production") {
    return { keep: false, reason: "not_production", notificationType, signedDate };
  }
  if (decoded.data?.bundleId && decoded.data.bundleId !== BUNDLE_ID) {
    return { keep: false, reason: "bundle_mismatch", notificationType, signedDate };
  }
  return { keep: true, reason: "ok", notificationType, signedDate };
}

function bump(hist: Record<string, number>, key: string): void {
  hist[key] = (hist[key] ?? 0) + 1;
}

async function mapPool<T>(
  items: T[],
  concurrency: number,
  worker: (item: T) => Promise<void>,
): Promise<void> {
  let next = 0;
  async function run(): Promise<void> {
    while (next < items.length) {
      const index = next;
      next += 1;
      await worker(items[index]);
    }
  }
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, () => run());
  await Promise.all(workers);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const requestId = generateRequestId();
  if (req.method !== "POST") {
    return errorResponse(405, "VALIDATION_ERROR", "Method not allowed", requestId);
  }
  if (!authorized(req)) {
    return errorResponse(401, "UNAUTHENTICATED", "Invalid cron secret", requestId);
  }

  let body: Record<string, unknown> = {};
  try {
    const text = await req.text();
    body = text ? JSON.parse(text) as Record<string, unknown> : {};
  } catch {
    return errorResponse(400, "VALIDATION_ERROR", "Invalid JSON body", requestId);
  }

  const dryRun = body.dryRun !== false;
  if (!dryRun && body.confirm !== "REPLAY_PRODUCTION") {
    return errorResponse(
      400,
      "VALIDATION_ERROR",
      'Apply requires { "dryRun": false, "confirm": "REPLAY_PRODUCTION" }',
      requestId,
    );
  }
  const offset = typeof body.offset === "number" && body.offset >= 0
    ? Math.floor(body.offset)
    : 0;
  const limit = typeof body.limit === "number" && body.limit > 0
    ? Math.floor(body.limit)
    : dryRun
    ? Number.POSITIVE_INFINITY
    : DEFAULT_APPLY_LIMIT;

  const windowOrError = parseWindow(body);
  if (typeof windowOrError === "string") {
    return errorResponse(400, "VALIDATION_ERROR", windowOrError, requestId);
  }
  const { startMs, endMs } = windowOrError;

  const privateKey = Deno.env.get("APPLE_IAP_PRIVATE_KEY") ?? "";
  const keyId = Deno.env.get("APPLE_IAP_KEY_ID") ?? "";
  const issuerId = Deno.env.get("APPLE_IAP_ISSUER_ID") ?? "";
  const superwallUrl = Deno.env.get("SUPERWALL_APPLE_WEBHOOK_URL") ?? "";

  if (!privateKey || !keyId || !issuerId) {
    return errorResponse(500, "INTERNAL_ERROR", "Apple IAP secrets not configured", requestId);
  }
  if (!dryRun && !superwallUrl) {
    return errorResponse(500, "INTERNAL_ERROR", "SUPERWALL_APPLE_WEBHOOK_URL is not set", requestId);
  }

  let appleToken: string;
  try {
    appleToken = await buildAppleJwt(privateKey, keyId, issuerId);
  } catch (err) {
    console.error("[replay-superwall] Failed to build Apple JWT", err);
    return errorResponse(500, "INTERNAL_ERROR", "Failed to build Apple JWT", requestId);
  }

  const result = {
    dry_run: dryRun,
    start_iso: new Date(startMs).toISOString(),
    end_iso: new Date(endMs).toISOString(),
    apple_pages: 0,
    apple_items: 0,
    eligible: 0,
    skipped: {} as Record<string, number>,
    by_type: {} as Record<string, number>,
    earliest_signed_at: null as string | null,
    latest_signed_at: null as string | null,
    superwall_ok: 0,
    superwall_failed: 0,
    superwall_http: {} as Record<string, number>,
    apple_http_error: null as number | null,
    truncated: false,
    offset,
    limit: Number.isFinite(limit) ? limit : null,
    replayed_this_chunk: 0,
    remaining: 0,
  };
  const toReplay: string[] = [];

  let paginationToken: string | undefined;
  let earliest: number | null = null;
  let latest: number | null = null;

  for (let page = 0; page < MAX_PAGES; page++) {
    const url = paginationToken
      ? `${APPLE_HISTORY_URL}?paginationToken=${encodeURIComponent(paginationToken)}`
      : APPLE_HISTORY_URL;
    let res: Response;
    try {
      res = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${appleToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ startDate: startMs, endDate: endMs }),
      });
    } catch (err) {
      console.error("[replay-superwall] Apple history fetch failed", err);
      return errorResponse(502, "APPLE_UNAVAILABLE", "Could not reach the App Store", requestId);
    }

    if (!res.ok) {
      result.apple_http_error = res.status;
      await res.body?.cancel();
      console.error("[replay-superwall] Apple history HTTP", res.status);
      return successResponse(result, requestId);
    }

    const payload = await res.json() as HistoryResponse;
    const items = payload.notificationHistory ?? [];
    result.apple_pages += 1;
    result.apple_items += items.length;

    for (const item of items) {
      const signedPayload = item.signedPayload;
      if (typeof signedPayload !== "string") {
        bump(result.skipped, "missing_payload");
        continue;
      }
      const classified = classify(signedPayload);
      if (classified.signedDate != null) {
        if (earliest == null || classified.signedDate < earliest) earliest = classified.signedDate;
        if (latest == null || classified.signedDate > latest) latest = classified.signedDate;
      }
      if (!classified.keep) {
        bump(result.skipped, classified.reason);
        continue;
      }
      bump(result.by_type, classified.notificationType);
      result.eligible += 1;
      if (dryRun) continue;
      const replayIndex = result.eligible - 1;
      if (replayIndex >= offset && toReplay.length < limit) {
        toReplay.push(signedPayload);
      }
    }

    if (!payload.hasMore || !payload.paginationToken) break;
    paginationToken = payload.paginationToken;
    if (page === MAX_PAGES - 1) result.truncated = true;
  }

  if (!dryRun && toReplay.length > 0) {
    await mapPool(toReplay, REPLAY_CONCURRENCY, async (signedPayload) => {
      try {
        const sw = await fetch(superwallUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ signedPayload }),
        });
        bump(result.superwall_http, String(sw.status));
        if (sw.ok) result.superwall_ok += 1;
        else result.superwall_failed += 1;
        await sw.body?.cancel();
      } catch {
        console.error("[replay-superwall] Superwall POST failed");
        result.superwall_failed += 1;
        bump(result.superwall_http, "network");
      }
    });
  }

  result.replayed_this_chunk = toReplay.length;
  result.remaining = Math.max(0, result.eligible - offset - toReplay.length);

  if (earliest != null) result.earliest_signed_at = new Date(earliest).toISOString();
  if (latest != null) result.latest_signed_at = new Date(latest).toISOString();

  console.log("[replay-superwall] complete", { requestId, ...result });
  return successResponse(result, requestId);
});
