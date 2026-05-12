import { z } from "https://esm.sh/zod@3";
import { createServiceClient } from "../_shared/supabase.ts";
import {
  corsHeaders,
  generateRequestId,
  errorResponse,
  successResponse,
} from "../_shared/response.ts";

const PRODUCT_IDS = {
  monthly: "com.relentless.monthly",
  annual: "com.relentless.annual",
} as const;

const REMINDER_WINDOWS = {
  [PRODUCT_IDS.monthly]: {
    reminderType: "monthly_trial_day_2",
    minHoursBeforeExpiration: 0,
    maxHoursBeforeExpiration: 36,
  },
  [PRODUCT_IDS.annual]: {
    reminderType: "annual_trial_day_5",
    minHoursBeforeExpiration: 24,
    maxHoursBeforeExpiration: 72,
  },
} as const;

const RunBodySchema = z.object({
  dryRun: z.boolean().optional().default(false),
  limit: z.number().int().min(1).max(500).optional().default(100),
}).strict();

type ProductId = keyof typeof REMINDER_WINDOWS;

type EntitlementCandidate = {
  user_id: string;
  product_id: string | null;
  expires_at: string | null;
};

type EmailSendResult =
  | { ok: true; messageId: string | null }
  | { ok: false; message: string };

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const requestId = generateRequestId();

  if (req.method !== "POST") {
    return errorResponse(405, "VALIDATION_ERROR", "Method not allowed", requestId);
  }

  const cronSecret = Deno.env.get("TRIAL_REMINDER_CRON_SECRET") ?? "";
  const providedSecret = req.headers.get("x-cron-secret") ?? "";
  if (!cronSecret || providedSecret !== cronSecret) {
    return errorResponse(401, "UNAUTHENTICATED", "Invalid cron secret", requestId);
  }

  let body: unknown = {};
  try {
    const text = await req.text();
    body = text ? JSON.parse(text) : {};
  } catch {
    return errorResponse(400, "VALIDATION_ERROR", "Invalid JSON body", requestId);
  }

  const parsed = RunBodySchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse(
      400,
      "VALIDATION_ERROR",
      parsed.error.issues[0]?.message ?? "Invalid request body",
      requestId,
    );
  }

  const { dryRun, limit } = parsed.data;
  const resendApiKey = Deno.env.get("RESEND_API_KEY") ?? "";
  const from = Deno.env.get("TRIAL_REMINDER_FROM") ?? "";
  const replyTo = Deno.env.get("TRIAL_REMINDER_REPLY_TO") ?? undefined;

  if (!dryRun && (!resendApiKey || !from)) {
    console.error("[trial-reminders] Resend secrets not configured", { requestId });
    return errorResponse(500, "INTERNAL_ERROR", "Trial reminder email is not configured", requestId);
  }

  const supabase = createServiceClient();
  const now = new Date();
  const maxExpiresAt = addHours(now, 72);

  const { data, error } = await supabase
    .from("entitlements")
    .select("user_id, product_id, expires_at")
    .eq("status", "trial")
    .in("product_id", [PRODUCT_IDS.monthly, PRODUCT_IDS.annual])
    .gt("expires_at", now.toISOString())
    .lte("expires_at", maxExpiresAt.toISOString())
    .order("expires_at", { ascending: true })
    .limit(limit);

  if (error) {
    console.error("[trial-reminders] Failed to load candidates", { requestId, error });
    return errorResponse(500, "INTERNAL_ERROR", "Failed to load trial reminders", requestId);
  }

  const candidates = ((data ?? []) as EntitlementCandidate[])
    .map((candidate) => toReminderCandidate(candidate, now))
    .filter((candidate): candidate is ReminderCandidate => candidate !== null);

  const result = {
    dry_run: dryRun,
    checked: data?.length ?? 0,
    eligible: candidates.length,
    sent: 0,
    skipped_duplicate: 0,
    skipped_no_email: 0,
    failed: 0,
  };

  for (const candidate of candidates) {
    if (dryRun) continue;

    const claim = await claimReminder(supabase, candidate, requestId);
    if (claim.duplicate) {
      result.skipped_duplicate += 1;
      continue;
    }
    if (!claim.id) {
      result.failed += 1;
      continue;
    }

    const email = await getUserEmail(supabase, candidate.userId, requestId);
    if (!email) {
      result.skipped_no_email += 1;
      await markReminderSkipped(supabase, claim.id, "email_unavailable", requestId);
      continue;
    }

    const emailResult = await sendReminderEmail({
      apiKey: resendApiKey,
      from,
      replyTo,
      to: email,
      productId: candidate.productId,
      expiresAt: candidate.expiresAt,
    });

    if (!emailResult.ok) {
      result.failed += 1;
      await markReminderFailed(supabase, claim.id, emailResult.message, requestId);
      continue;
    }

    await markReminderSent(supabase, claim.id, emailResult.messageId, requestId);
    result.sent += 1;
  }

  return successResponse(result, requestId);
});

type ReminderCandidate = {
  userId: string;
  productId: ProductId;
  expiresAt: string;
  reminderType: string;
  hoursUntilExpiration: number;
};

function toReminderCandidate(
  candidate: EntitlementCandidate,
  now: Date,
): ReminderCandidate | null {
  if (!candidate.product_id || !candidate.expires_at) return null;
  if (!isReminderProduct(candidate.product_id)) return null;

  const expiresAt = new Date(candidate.expires_at);
  const hoursUntilExpiration = (expiresAt.getTime() - now.getTime()) / 3_600_000;
  const window = REMINDER_WINDOWS[candidate.product_id];

  if (
    hoursUntilExpiration < window.minHoursBeforeExpiration ||
    hoursUntilExpiration > window.maxHoursBeforeExpiration
  ) {
    return null;
  }

  return {
    userId: candidate.user_id,
    productId: candidate.product_id,
    expiresAt: candidate.expires_at,
    reminderType: window.reminderType,
    hoursUntilExpiration,
  };
}

function isReminderProduct(productId: string): productId is ProductId {
  return productId === PRODUCT_IDS.monthly || productId === PRODUCT_IDS.annual;
}

async function claimReminder(
  supabase: ReturnType<typeof createServiceClient>,
  candidate: ReminderCandidate,
  requestId: string,
): Promise<{ id: string | null; duplicate: boolean }> {
  const { data, error } = await supabase
    .from("trial_reminder_emails")
    .insert({
      user_id: candidate.userId,
      product_id: candidate.productId,
      expires_at: candidate.expiresAt,
      reminder_type: candidate.reminderType,
      metadata: {
        request_id: requestId,
        status: "claimed",
        hours_until_expiration: Math.round(candidate.hoursUntilExpiration * 10) / 10,
      },
    })
    .select("id")
    .single();

  if (!error) return { id: data.id as string, duplicate: false };
  if (error.code === "23505") return { id: null, duplicate: true };

  console.error("[trial-reminders] Failed to claim reminder", {
    requestId,
    userId: candidate.userId,
    productId: candidate.productId,
    message: error.message,
  });
  return { id: null, duplicate: false };
}

async function getUserEmail(
  supabase: ReturnType<typeof createServiceClient>,
  userId: string,
  requestId: string,
): Promise<string | null> {
  const { data, error } = await supabase.auth.admin.getUserById(userId);
  if (error) {
    console.error("[trial-reminders] Failed to fetch user email", {
      requestId,
      userId,
      message: error.message,
    });
    return null;
  }

  return data.user?.email ?? null;
}

async function sendReminderEmail(args: {
  apiKey: string;
  from: string;
  replyTo?: string;
  to: string;
  productId: ProductId;
  expiresAt: string;
}): Promise<EmailSendResult> {
  const email = buildReminderEmail(args.productId, args.expiresAt);
  const unsubMailto = `mailto:${args.from.replace(/.*<|>.*/g, "")}?subject=unsubscribe`;
  const payload: Record<string, unknown> = {
    from: args.from,
    to: [args.to],
    subject: email.subject,
    text: email.text,
    html: email.html,
    headers: {
      "List-Unsubscribe": `<${unsubMailto}>`,
      "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
      "X-Entity-Ref-ID": crypto.randomUUID(),
    },
  };

  if (args.replyTo) payload.reply_to = args.replyTo;

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${args.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const responseBody = await response.json().catch(() => ({})) as {
      id?: string;
      message?: string;
    };

    if (!response.ok) {
      return {
        ok: false,
        message: responseBody.message ?? `Resend returned ${response.status}`,
      };
    }

    return { ok: true, messageId: responseBody.id ?? null };
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : "Failed to send email",
    };
  }
}

function buildReminderEmail(productId: ProductId, expiresAt: string) {
  const planLabel = productId === PRODUCT_IDS.annual ? "annual" : "monthly";
  const renewalText = productId === PRODUCT_IDS.annual
    ? "your annual plan starts"
    : "your monthly plan starts";
  const formattedDate = new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
  }).format(new Date(expiresAt));

  const subject = "Quick heads up: your Relentless trial is ending soon";
  const text = [
    "Hey,",
    "",
    `Just a quick heads up that your free trial is almost up. If Relentless has been helping your training, you do not need to do anything. ${renewalText} around ${formattedDate}.`,
    "",
    `If now is not the right time, you can manage or cancel the ${planLabel} subscription from your Apple account before it renews.`,
    "",
    "Either way, thanks for giving Relentless a real shot.",
    "",
    "- Relentless",
  ].join("\n");

  const html = `<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#f7f4ef;color:#191714;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
    <div style="max-width:560px;margin:0 auto;padding:32px 20px;">
      <div style="background:#fffaf2;border-radius:18px;padding:28px;border:1px solid #eee2d1;">
        <p style="margin:0 0 18px;font-size:16px;line-height:1.5;">Hey,</p>
        <p style="margin:0 0 18px;font-size:16px;line-height:1.5;">
          Just a quick heads up that your free trial is almost up. If Relentless has been helping your training, you do not need to do anything. ${escapeHtml(renewalText)} around ${escapeHtml(formattedDate)}.
        </p>
        <p style="margin:0 0 18px;font-size:16px;line-height:1.5;">
          If now is not the right time, you can manage or cancel the ${escapeHtml(planLabel)} subscription from your Apple account before it renews.
        </p>
        <p style="margin:0 0 18px;font-size:16px;line-height:1.5;">Either way, thanks for giving Relentless a real shot.</p>
        <p style="margin:0;font-size:16px;line-height:1.5;">- Relentless</p>
      </div>
    </div>
  </body>
</html>`;

  return { subject, text, html };
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function addHours(date: Date, hours: number): Date {
  return new Date(date.getTime() + hours * 3_600_000);
}

async function markReminderSent(
  supabase: ReturnType<typeof createServiceClient>,
  id: string,
  messageId: string | null,
  requestId: string,
) {
  const { error } = await supabase
    .from("trial_reminder_emails")
    .update({
      sent_at: new Date().toISOString(),
      provider_message_id: messageId,
      metadata: {
        request_id: requestId,
        status: "sent",
      },
    })
    .eq("id", id);

  if (error) {
    console.error("[trial-reminders] Failed to mark reminder sent", {
      requestId,
      id,
      message: error.message,
    });
  }
}

async function markReminderSkipped(
  supabase: ReturnType<typeof createServiceClient>,
  id: string,
  reason: string,
  requestId: string,
) {
  const { error } = await supabase
    .from("trial_reminder_emails")
    .update({
      metadata: {
        request_id: requestId,
        status: "skipped",
        reason,
      },
    })
    .eq("id", id);

  if (error) {
    console.error("[trial-reminders] Failed to mark reminder skipped", {
      requestId,
      id,
      message: error.message,
    });
  }
}

async function markReminderFailed(
  supabase: ReturnType<typeof createServiceClient>,
  id: string,
  message: string,
  requestId: string,
) {
  const { error } = await supabase
    .from("trial_reminder_emails")
    .update({
      metadata: {
        request_id: requestId,
        status: "failed",
        message,
      },
    })
    .eq("id", id);

  if (error) {
    console.error("[trial-reminders] Failed to mark reminder failed", {
      requestId,
      id,
      message: error.message,
    });
  }
}
