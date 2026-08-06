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
// Promo admin API (Phase 3) — backend for the cofounder's admin page.
//
// The UI lives in admin/promo-admin.html (repo root), a self-contained file
// opened locally in a browser. Supabase's gateway rewrites text/html responses
// to text/plain on the default *.supabase.co domain (documented restriction),
// so the page cannot be served from this function.
//
//   POST /promo-admin/login        — verifies the admin password.
//   POST /promo-admin/overview     — creators + codes with redemption counts.
//   POST /promo-admin/creators     — create a creator (slug derived from name).
//   POST /promo-admin/codes        — mint a code (months_free or lifetime).
//   POST /promo-admin/codes/toggle — activate/deactivate a code.
//
// Auth: every POST requires the x-admin-password header, compared in constant
// time (via SHA-256 digests) against the PROMO_ADMIN_PASSWORD function secret.
// Wrong-password attempts are rate limited per IP on the strict "billing"
// bucket; authenticated calls use the roomier "authenticated-write" bucket.
// All DB writes go through the service-role client (RLS has no client policies
// on these tables).
// ---------------------------------------------------------------------------

const POSTHOG_DASHBOARD_URL = "https://us.posthog.com/project/400227/dashboard/1954815";

// The admin page is opened from file://, so preflights must allow the
// password header. Scoped to this function only — shared corsHeaders stay
// untouched for every other function.
const adminCorsHeaders = {
  ...corsHeaders,
  "Access-Control-Allow-Headers":
    `${corsHeaders["Access-Control-Allow-Headers"]}, x-admin-password`,
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: adminCorsHeaders });
  }

  const requestId = generateRequestId();
  const url = new URL(req.url);
  const pathMatch = url.pathname.match(/\/promo-admin(?:\/(.+))?$/);
  const subPath = (pathMatch?.[1] ?? "").replace(/\/$/, "");

  if (req.method === "GET") {
    if (subPath === "") {
      return new Response(
        "Relentless promo admin API. Open the promo-admin.html file (ask Rahul for it) to use the admin.",
        { status: 200, headers: { "Content-Type": "text/plain; charset=utf-8" } },
      );
    }
    return errorResponse(404, "NOT_FOUND", "Unknown promo-admin path", requestId);
  }

  if (req.method !== "POST") {
    return errorResponse(405, "VALIDATION_ERROR", "Method not allowed", requestId);
  }

  const adminPassword = Deno.env.get("PROMO_ADMIN_PASSWORD") ?? "";
  if (!adminPassword) {
    console.error("[promo-admin] PROMO_ADMIN_PASSWORD is not set — refusing all requests", {
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
    // Strict per-IP budget for bad attempts so the password can't be brute
    // forced, without ever revealing whether a near-miss was close.
    const rl = await checkRateLimit(`promo-admin-bad:${ip}`, requestId, "billing");
    if (!rl.ok) return rl.response;
    return errorResponse(401, "UNAUTHORIZED", "Wrong password", requestId);
  }

  const rl = await checkRateLimit(`promo-admin:${ip}`, requestId, "authenticated-write");
  if (!rl.ok) return rl.response;

  switch (subPath) {
    case "login":
      return successResponse({ ok: true }, requestId);
    case "overview":
      return handleOverview(requestId);
    case "creators":
      return handleCreateCreator(req, requestId);
    case "codes":
      return handleCreateCode(req, requestId);
    case "codes/toggle":
      return handleToggleCode(req, requestId);
    default:
      return errorResponse(404, "NOT_FOUND", "Unknown promo-admin path", requestId);
  }
});

// ---------------------------------------------------------------------------
// Auth helpers
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

// ---------------------------------------------------------------------------
// Body parsing
// ---------------------------------------------------------------------------

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
// POST /promo-admin/overview
// ---------------------------------------------------------------------------

async function handleOverview(requestId: string): Promise<Response> {
  const supabase = createServiceClient();

  const [creatorsRes, codesRes] = await Promise.all([
    supabase
      .from("creators")
      .select("id, name, slug, active, created_at")
      .order("created_at", { ascending: false }),
    supabase
      .from("promo_codes")
      .select(
        "id, code, type, months, is_personal, max_redemptions, active, expires_at, created_at, creators!inner(name, slug), promo_code_redemptions(count)",
      )
      .order("created_at", { ascending: false }),
  ]);

  if (creatorsRes.error || codesRes.error) {
    console.error("[promo-admin/overview] query failed", {
      requestId,
      creatorsError: creatorsRes.error?.message,
      codesError: codesRes.error?.message,
    });
    return errorResponse(500, "INTERNAL_ERROR", "Could not load data", requestId);
  }

  const codes = (codesRes.data ?? []).map((row) => {
    const creator = row.creators as unknown as { name: string; slug: string };
    const counts = row.promo_code_redemptions as unknown as { count: number }[];
    return {
      id: row.id,
      code: row.code,
      type: row.type,
      months: row.months,
      is_personal: row.is_personal,
      max_redemptions: row.max_redemptions,
      active: row.active,
      expires_at: row.expires_at,
      created_at: row.created_at,
      creator_name: creator?.name ?? null,
      creator_slug: creator?.slug ?? null,
      redemption_count: counts?.[0]?.count ?? 0,
    };
  });

  return successResponse({
    dashboard_url: POSTHOG_DASHBOARD_URL,
    creators: creatorsRes.data ?? [],
    codes,
  }, requestId);
}

// ---------------------------------------------------------------------------
// POST /promo-admin/creators
// ---------------------------------------------------------------------------

const CreateCreatorSchema = z.object({
  name: z.string().trim().min(1).max(80),
}).strict();

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

async function handleCreateCreator(req: Request, requestId: string): Promise<Response> {
  const parsed = await parseBody(req, CreateCreatorSchema, requestId);
  if (!parsed.ok) return parsed.response;

  const slug = slugify(parsed.data.name);
  if (slug.length === 0) {
    return errorResponse(
      400,
      "VALIDATION_ERROR",
      "Name must contain at least one letter or number",
      requestId,
    );
  }

  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("creators")
    .insert({ name: parsed.data.name, slug })
    .select("id, name, slug, active, created_at")
    .single();

  if (error) {
    if (error.code === "23505") {
      return errorResponse(
        409,
        "DUPLICATE",
        `A creator with the slug "${slug}" already exists`,
        requestId,
      );
    }
    console.error("[promo-admin/creators] insert failed", { requestId, error: error.message });
    return errorResponse(500, "INTERNAL_ERROR", "Could not create creator", requestId);
  }

  return successResponse({ creator: data }, requestId);
}

// ---------------------------------------------------------------------------
// POST /promo-admin/codes
// ---------------------------------------------------------------------------

const CreateCodeSchema = z.object({
  code: z.string().trim().min(1).max(64),
  type: z.enum(["months_free", "lifetime"]),
  months: z.number().int().positive().optional(),
  creator_id: z.string().uuid(),
  is_personal: z.boolean().optional(),
  max_redemptions: z.number().int().positive().optional(),
  expires_at: z.string().datetime({ offset: true }).optional(),
}).strict().superRefine((val, ctx) => {
  if (val.type === "months_free" && val.months === undefined) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["months"],
      message: "months is required for months_free codes",
    });
  }
  if (val.type === "lifetime" && val.months !== undefined) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["months"],
      message: "months must be omitted for lifetime codes",
    });
  }
});

async function handleCreateCode(req: Request, requestId: string): Promise<Response> {
  const parsed = await parseBody(req, CreateCodeSchema, requestId);
  if (!parsed.ok) return parsed.response;

  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("promo_codes")
    .insert({
      code: parsed.data.code,
      type: parsed.data.type,
      months: parsed.data.type === "months_free" ? parsed.data.months : null,
      creator_id: parsed.data.creator_id,
      is_personal: parsed.data.is_personal ?? false,
      max_redemptions: parsed.data.max_redemptions ?? null,
      expires_at: parsed.data.expires_at ?? null,
    })
    .select("id, code, type, months, is_personal, max_redemptions, active, expires_at, created_at")
    .single();

  if (error) {
    if (error.code === "23505") {
      return errorResponse(
        409,
        "DUPLICATE",
        "That code already exists (codes are case-insensitive)",
        requestId,
      );
    }
    if (error.code === "23503") {
      return errorResponse(400, "VALIDATION_ERROR", "Unknown creator", requestId);
    }
    console.error("[promo-admin/codes] insert failed", { requestId, error: error.message });
    return errorResponse(500, "INTERNAL_ERROR", "Could not create code", requestId);
  }

  return successResponse({ code: data }, requestId);
}

// ---------------------------------------------------------------------------
// POST /promo-admin/codes/toggle
// ---------------------------------------------------------------------------

const ToggleCodeSchema = z.object({
  id: z.string().uuid(),
  active: z.boolean(),
}).strict();

async function handleToggleCode(req: Request, requestId: string): Promise<Response> {
  const parsed = await parseBody(req, ToggleCodeSchema, requestId);
  if (!parsed.ok) return parsed.response;

  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("promo_codes")
    .update({ active: parsed.data.active })
    .eq("id", parsed.data.id)
    .select("id, active")
    .maybeSingle();

  if (error) {
    console.error("[promo-admin/codes/toggle] update failed", { requestId, error: error.message });
    return errorResponse(500, "INTERNAL_ERROR", "Could not update code", requestId);
  }
  if (!data) {
    return errorResponse(404, "NOT_FOUND", "Code not found", requestId);
  }

  return successResponse({ code: data }, requestId);
}
