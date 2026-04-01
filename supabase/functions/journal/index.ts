import { z } from "https://esm.sh/zod@3";
import { createServiceClient } from "../_shared/supabase.ts";
import {
  corsHeaders,
  generateRequestId,
  errorResponse,
  successResponse,
} from "../_shared/response.ts";
import { getUser } from "../_shared/auth.ts";
import { requireEntitlement } from "../_shared/entitlement.ts";
import { checkRateLimit } from "../_shared/ratelimit.ts";
import { parseProgramAnchor, resolveLocalTodayYmd } from "../_shared/client_day.ts";
import { ensureProgramStartIfHome } from "../_shared/program_start.ts";

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 50;

const PaginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(MAX_PAGE_SIZE)
    .default(DEFAULT_PAGE_SIZE),
});

const UuidSchema = z.string().uuid();

const CreateSchema = z
  .object({
    body: z.string().min(1),
    lesson_id: z.string().uuid().optional(),
    competition_date: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional(),
    entry_type: z.enum(["session", "miss_reflection"]).default("session"),
  })
  .strict();

const UpdateSchema = z
  .object({
    body: z.string().min(1),
  })
  .strict();

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const requestId = generateRequestId();

  if (!["GET", "POST", "PATCH", "DELETE"].includes(req.method)) {
    return errorResponse(405, "VALIDATION_ERROR", "Method not allowed", requestId);
  }

  const supabase = createServiceClient();
  const auth = await getUser(req, supabase, requestId);
  if (!auth.ok) return auth.response;

  const rl = await checkRateLimit(
    auth.userId, requestId,
    req.method === "GET" ? "authenticated-read" : "authenticated-write",
  );
  if (!rl.ok) return rl.response;

  const entitlement = await requireEntitlement(supabase, auth.userId, requestId);
  if (!entitlement.ok) return entitlement.response;

  const url = new URL(req.url);
  const pathMatch = url.pathname.match(/\/journal(?:\/(.+))?$/);
  const subPath = (pathMatch?.[1] ?? "").replace(/\/$/, "");

  if (req.method === "GET" && subPath === "") {
    return handleList(url, supabase, auth.userId, requestId);
  }
  if (req.method === "POST" && subPath === "") {
    return handleCreate(req, supabase, auth.userId, requestId);
  }
  if (req.method === "PATCH" && subPath !== "") {
    return handleUpdate(req, supabase, subPath, auth.userId, requestId);
  }
  if (req.method === "DELETE" && subPath !== "") {
    return handleDelete(supabase, subPath, auth.userId, requestId);
  }

  return errorResponse(405, "VALIDATION_ERROR", "Method not allowed for this path", requestId);
});

// J2 — list own journal entries (paginated, chronological desc)
async function handleList(
  url: URL,
  supabase: ReturnType<typeof createServiceClient>,
  userId: string,
  requestId: string,
): Promise<Response> {
  const params = PaginationSchema.safeParse({
    page: url.searchParams.get("page") ?? undefined,
    limit: url.searchParams.get("limit") ?? undefined,
  });

  if (!params.success) {
    return errorResponse(
      400,
      "VALIDATION_ERROR",
      params.error.issues[0]?.message ?? "Invalid query parameters",
      requestId,
    );
  }

  const { page, limit } = params.data;
  const from = (page - 1) * limit;
  const to = from + limit - 1;

  const { data: entries, error, count } = await supabase
    .from("journal_entries")
    .select("id, lesson_id, competition_date, body, entry_type, created_at, updated_at", {
      count: "exact",
    })
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .range(from, to);

  if (error) {
    return errorResponse(500, "INTERNAL_ERROR", "Failed to fetch journal entries", requestId);
  }

  return successResponse({ items: entries ?? [], page, limit, total: count ?? 0 }, requestId);
}

// J1 — create journal entry
async function handleCreate(
  req: Request,
  supabase: ReturnType<typeof createServiceClient>,
  userId: string,
  requestId: string,
): Promise<Response> {
  const localYmd = resolveLocalTodayYmd(req);
  await ensureProgramStartIfHome(
    supabase,
    userId,
    localYmd,
    parseProgramAnchor(req),
  );

  let rawBody: unknown;
  try {
    rawBody = await req.json();
  } catch {
    return errorResponse(400, "VALIDATION_ERROR", "Invalid JSON body", requestId);
  }

  const parsed = CreateSchema.safeParse(rawBody);
  if (!parsed.success) {
    return errorResponse(
      400,
      "VALIDATION_ERROR",
      parsed.error.issues[0]?.message ?? "Invalid request body",
      requestId,
    );
  }

  const { body, lesson_id, competition_date, entry_type } = parsed.data;

  if (lesson_id) {
    const { data: lesson } = await supabase
      .from("lessons")
      .select("id")
      .eq("id", lesson_id)
      .eq("published", true)
      .single();
    if (!lesson) {
      return errorResponse(404, "NOT_FOUND", "Lesson not found", requestId);
    }
  }

  const { data: entry, error } = await supabase
    .from("journal_entries")
    .insert({
      user_id: userId,
      body,
      lesson_id: lesson_id ?? null,
      competition_date: competition_date ?? null,
      entry_type,
    })
    .select("id, lesson_id, competition_date, body, entry_type, created_at, updated_at")
    .single();

  if (error) {
    return errorResponse(500, "INTERNAL_ERROR", "Failed to create journal entry", requestId);
  }

  return new Response(
    JSON.stringify({ data: entry, request_id: requestId }),
    { status: 201, headers: { "Content-Type": "application/json", ...corsHeaders } },
  );
}

// J3 — update own journal entry body
async function handleUpdate(
  req: Request,
  supabase: ReturnType<typeof createServiceClient>,
  id: string,
  userId: string,
  requestId: string,
): Promise<Response> {
  const idParsed = UuidSchema.safeParse(id);
  if (!idParsed.success) {
    return errorResponse(400, "VALIDATION_ERROR", "Invalid journal entry ID format", requestId);
  }

  let rawBody: unknown;
  try {
    rawBody = await req.json();
  } catch {
    return errorResponse(400, "VALIDATION_ERROR", "Invalid JSON body", requestId);
  }

  const parsed = UpdateSchema.safeParse(rawBody);
  if (!parsed.success) {
    return errorResponse(
      400,
      "VALIDATION_ERROR",
      parsed.error.issues[0]?.message ?? "Invalid request body",
      requestId,
    );
  }

  const { data: existing } = await supabase
    .from("journal_entries")
    .select("id, user_id")
    .eq("id", idParsed.data)
    .single();

  if (!existing) {
    return errorResponse(404, "NOT_FOUND", "Journal entry not found", requestId);
  }
  if (existing.user_id !== userId) {
    return errorResponse(403, "FORBIDDEN", "Not the owner of this journal entry", requestId);
  }

  const { data: updated, error } = await supabase
    .from("journal_entries")
    .update({ body: parsed.data.body })
    .eq("id", idParsed.data)
    .select("id, lesson_id, competition_date, body, entry_type, created_at, updated_at")
    .single();

  if (error) {
    return errorResponse(500, "INTERNAL_ERROR", "Failed to update journal entry", requestId);
  }

  return successResponse(updated, requestId);
}

// J4 — delete own journal entry
async function handleDelete(
  supabase: ReturnType<typeof createServiceClient>,
  id: string,
  userId: string,
  requestId: string,
): Promise<Response> {
  const idParsed = UuidSchema.safeParse(id);
  if (!idParsed.success) {
    return errorResponse(400, "VALIDATION_ERROR", "Invalid journal entry ID format", requestId);
  }

  const { data: existing } = await supabase
    .from("journal_entries")
    .select("id, user_id")
    .eq("id", idParsed.data)
    .single();

  if (!existing) {
    return errorResponse(404, "NOT_FOUND", "Journal entry not found", requestId);
  }
  if (existing.user_id !== userId) {
    return errorResponse(403, "FORBIDDEN", "Not the owner of this journal entry", requestId);
  }

  const { error } = await supabase
    .from("journal_entries")
    .delete()
    .eq("id", idParsed.data);

  if (error) {
    return errorResponse(500, "INTERNAL_ERROR", "Failed to delete journal entry", requestId);
  }

  return successResponse(null, requestId);
}
