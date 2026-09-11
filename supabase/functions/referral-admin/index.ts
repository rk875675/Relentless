import { z } from "https://esm.sh/zod@3";
import { createServiceClient } from "../_shared/supabase.ts";
import {
  corsHeaders,
  generateRequestId,
  errorResponse,
  successResponse,
} from "../_shared/response.ts";
import { checkRateLimit } from "../_shared/ratelimit.ts";

// ---------------------------------------------------------------------------
// Referral admin API (PRD 10.5, Phase 4a) — operator-only code pool loader.
//
// There is NO user-facing surface here and no client calls this function. Its
// only caller is scripts/05_import_referral_codes.py, run locally by the
// operator against a CSV downloaded from App Store Connect.
//
//   POST /referral-admin/login        — verifies the admin password.
//   POST /referral-admin/codes/import — imports one batch of offer codes.
//   POST /referral-admin/codes/stock  — aggregated pool counts (no code values).
//
// Auth: the same x-admin-password / PROMO_ADMIN_PASSWORD scheme as
// promo-admin, compared in constant time via SHA-256 digests. No new secret.
//
// Every code in referral_offer_codes is a live App Store discount, so this
// function never returns a code value in any response — imports report counts
// and stock reports aggregates. Writes go through the import RPC, which is
// bulk + ON CONFLICT DO NOTHING, making a re-run of the same CSV a no-op.
// ---------------------------------------------------------------------------

// The operator script sends the password as a header, so preflights must allow
// it. Scoped to this function only.
const adminCorsHeaders = {
  ...corsHeaders,
  "Access-Control-Allow-Headers":
    `${corsHeaders["Access-Control-Allow-Headers"]}, x-admin-password`,
};

// Reward release (Phase 4c) matches Apple's offerIdentifier against this
// prefix, so a batch imported under any other reference name would redeem
// fine at Apple but never pay out. Non-blocking: reported as a warning rather
// than rejected, so a future rename cannot lock the importer up.
const EXPECTED_OFFER_PREFIX = "TEAMMATE20_";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: adminCorsHeaders });
  }

  const requestId = generateRequestId();
  const url = new URL(req.url);
  const pathMatch = url.pathname.match(/\/referral-admin(?:\/(.+))?$/);
  const subPath = (pathMatch?.[1] ?? "").replace(/\/$/, "");

  if (req.method !== "POST") {
    return errorResponse(405, "VALIDATION_ERROR", "Method not allowed", requestId);
  }

  const adminPassword = Deno.env.get("PROMO_ADMIN_PASSWORD") ?? "";
  if (!adminPassword) {
    console.error("[referral-admin] PROMO_ADMIN_PASSWORD is not set — refusing all requests", {
      requestId,
    });
    return errorResponse(
      503,
      "NOT_CONFIGURED",
      "Admin is not configured. Set the PROMO_ADMIN_PASSWORD function secret.",
      requestId,
    );
  }

  const ip = clientIp(req);
  const provided = req.headers.get("x-admin-password") ?? "";
  const passwordOk = await passwordsMatch(provided, adminPassword);

  if (!passwordOk) {
    const rl = await checkRateLimit(`referral-admin-bad:${ip}`, requestId, "billing");
    if (!rl.ok) return rl.response;
    return errorResponse(401, "UNAUTHORIZED", "Wrong password", requestId);
  }

  const rl = await checkRateLimit(`referral-admin:${ip}`, requestId, "authenticated-write");
  if (!rl.ok) return rl.response;

  switch (subPath) {
    case "login":
      return successResponse({ ok: true }, requestId);
    case "codes/import":
      return handleImportCodes(req, requestId);
    case "codes/stock":
      return handleStock(requestId);
    default:
      return errorResponse(404, "NOT_FOUND", "Unknown referral-admin path", requestId);
  }
});

// ---------------------------------------------------------------------------
// Auth helpers (same scheme as promo-admin)
// ---------------------------------------------------------------------------


function clientIp(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for") ?? "";
  const first = fwd.split(",")[0]?.trim();
  return first && first.length > 0 ? first : "unknown";
}

// Compare SHA-256 digests byte-by-byte: fixed-length inputs + full-loop XOR
// give a constant-time comparison regardless of where the strings differ.
async function passwordsMatch(a: string, b: string): Promise<boolean> {
  const enc = new TextEncoder();
  const [ha, hb] = await Promise.all([
    crypto.subtle.digest("SHA-256", enc.encode(a)),
    crypto.subtle.digest("SHA-256", enc.encode(b)),
  ]);
  const va = new Uint8Array(ha);
  const vb = new Uint8Array(hb);
  let diff = 0;
  for (let i = 0; i < va.length; i++) diff |= va[i] ^ vb[i];
  return diff === 0;
}

async function parseBody<T>(
  req: Request,
  schema: z.ZodType<T>,
  requestId: string,
): Promise<{ ok: true; data: T } | { ok: false; response: Response }> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return {
      ok: false,
      response: errorResponse(400, "VALIDATION_ERROR", "Invalid JSON body", requestId),
    };
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const where = issue?.path?.length ? `${issue.path.join(".")}: ` : "";
    return {
      ok: false,
      response: errorResponse(
        400,
        "VALIDATION_ERROR",
        `${where}${issue?.message ?? "Invalid request body"}`,
        requestId,
      ),
    };
  }
  return { ok: true, data: parsed.data };
}

// ---------------------------------------------------------------------------
// POST /referral-admin/codes/import
//
// environment, product_id and offer_reference_name are all required from the
// operator. None of them is inferred from the CSV or its filename: the
// production and sandbox files are byte-indistinguishable, and a sandbox code
// handed to a real customer fails at redemption and burns their invite
// (PRD 10.5.7 — sharing must fail closed rather than issue a bad code).
// ---------------------------------------------------------------------------

// Deliberately not pinned to 18 characters. Every current batch is 18, but
// Apple's code length is a per-offer configuration, and a hard length would
// fail closed on a legitimate future batch.
const OfferCodeSchema = z.string().trim().regex(
  /^[A-Za-z0-9]{6,24}$/,
  "each code must be 6-24 alphanumeric characters",
);

const ImportCodesSchema = z.object({
  environment: z.enum(["production", "sandbox"]),
  product_id: z.string().trim().min(1).max(128),
  offer_reference_name: z.string().trim().min(1).max(64),
  apple_expires_at: z.string().datetime({ offset: true }),
  imported_batch: z.string().trim().min(1).max(128),
  codes: z.array(OfferCodeSchema).min(1).max(1000),
  dry_run: z.boolean().optional(),
}).strict();

async function handleImportCodes(req: Request, requestId: string): Promise<Response> {
  const parsed = await parseBody(req, ImportCodesSchema, requestId);
  if (!parsed.ok) return parsed.response;

  const {
    environment,
    product_id,
    offer_reference_name,
    apple_expires_at,
    imported_batch,
    codes,
    dry_run,
  } = parsed.data;

  const expiresAt = new Date(apple_expires_at);
  if (expiresAt.getTime() <= Date.now()) {
    return errorResponse(
      400,
      "VALIDATION_ERROR",
      "apple_expires_at is in the past — that batch can no longer be redeemed",
      requestId,
    );
  }

  const supabase = createServiceClient();
  const { data, error } = await supabase.rpc("import_referral_offer_codes", {
    p_environment: environment,
    p_product_id: product_id,
    p_offer_reference_name: offer_reference_name,
    p_apple_expires_at: expiresAt.toISOString(),
    p_imported_batch: imported_batch,
    p_codes: codes,
    p_dry_run: dry_run ?? false,
  });

  if (error) {
    // Never echo the payload: it is a list of live discounts.
    console.error("[referral-admin/codes/import] rpc failed", {
      requestId,
      environment,
      product_id,
      offer_reference_name,
      imported_batch,
      code_count: codes.length,
      error: error.message,
    });
    return errorResponse(500, "INTERNAL_ERROR", "Could not import codes", requestId);
  }

  const result = (data ?? {}) as Record<string, unknown>;
  const warnings: string[] = [];

  if (!offer_reference_name.startsWith(EXPECTED_OFFER_PREFIX)) {
    warnings.push(
      `offer_reference_name "${offer_reference_name}" does not start with ${EXPECTED_OFFER_PREFIX}; reward release will not match this batch`,
    );
  }
  if (typeof result.mismatched_existing === "number" && result.mismatched_existing > 0) {
    warnings.push(
      `${result.mismatched_existing} of these codes already exist under a different environment/product/offer — check you are importing the right CSV`,
    );
  }

  console.log("[referral-admin/codes/import] batch processed", {
    requestId,
    environment,
    product_id,
    offer_reference_name,
    imported_batch,
    ...result,
  });

  return successResponse({ ...result, warnings }, requestId);
}

// ---------------------------------------------------------------------------
// POST /referral-admin/codes/stock
// ---------------------------------------------------------------------------

async function handleStock(requestId: string): Promise<Response> {
  const supabase = createServiceClient();
  const { data, error } = await supabase.rpc("referral_offer_code_stock");

  if (error) {
    console.error("[referral-admin/codes/stock] rpc failed", { requestId, error: error.message });
    return errorResponse(500, "INTERNAL_ERROR", "Could not load pool stock", requestId);
  }

  return successResponse({ stock: data ?? [] }, requestId);
}
