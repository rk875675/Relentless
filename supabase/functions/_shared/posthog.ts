// Server-side PostHog capture. Analytics must never throw into a billing path.

export type CaptureOptions = {
  /** Dedupes retries for ~24h. Use a stable business key, never a request id. */
  insertId?: string;
  timestamp?: string;
};

export function isSandboxEnvironment(environment: string | null | undefined): boolean {
  if (!environment) return false;
  const value = environment.toLowerCase();
  return value === "sandbox" || value === "xcode" || value === "localtesting";
}

/**
 * Sandbox StoreKit traffic is our own TestFlight/Xcode test accounts, and there
 * is only one PostHog project, so an unfiltered sandbox event lands in the same
 * trial/paid funnels as a real purchase. Every billing and referral event
 * carries is_sandbox (or Apple's environment), so one gate here covers them all
 * instead of an is_sandbox filter each insight has to remember.
 */
function isSandboxEvent(properties: Record<string, unknown>): boolean {
  if (properties.is_sandbox === true) return true;
  const environment = properties.environment;
  return typeof environment === "string" && isSandboxEnvironment(environment);
}

export async function capturePostHogEvent(
  distinctId: string,
  event: string,
  properties: Record<string, unknown>,
  options?: CaptureOptions,
): Promise<void> {
  const apiKey = Deno.env.get("POSTHOG_API_KEY") ?? "";
  const host = (Deno.env.get("POSTHOG_HOST") ?? "https://us.i.posthog.com").replace(/\/$/, "");
  if (!apiKey) {
    console.warn("[posthog] capture skipped, API key unset", { event });
    return;
  }
  if (isSandboxEvent(properties)) {
    // Logged so a sandbox test run is still verifiable in the function logs.
    console.log("[posthog] Dropped sandbox event", event, distinctId);
    return;
  }
  try {
    const props: Record<string, unknown> = {
      ...properties,
      $lib: "supabase-edge-function",
    };
    if (options?.insertId) props.$insert_id = options.insertId;
    const body: Record<string, unknown> = {
      api_key: apiKey,
      event,
      distinct_id: distinctId,
      properties: props,
    };
    if (options?.timestamp) body.timestamp = options.timestamp;
    const res = await fetch(`${host}/capture/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      // Status only. The body can echo the request, which carries the API key.
      console.error("[posthog] capture failed", { event, status: res.status });
    }
  } catch (err) {
    // Analytics must never crash entitlement or purchase handling.
    console.error("[posthog] capture failed", {
      event,
      reason: err instanceof Error ? err.name : "unknown",
    });
  }
}

export function entitlementPersonSet(
  status: string | null | undefined,
): Record<string, unknown> {
  const entitlement_status = status ?? "none";
  return {
    entitlement_status,
    premium: entitlement_status === "trial" || entitlement_status === "active",
  };
}

export async function capturePostHogBatch(
  events: Array<{
    distinctId: string;
    event: string;
    properties: Record<string, unknown>;
    insertId?: string;
    timestamp?: string;
  }>,
): Promise<boolean> {
  const apiKey = Deno.env.get("POSTHOG_API_KEY") ?? "";
  const host = (Deno.env.get("POSTHOG_HOST") ?? "https://us.i.posthog.com").replace(/\/$/, "");
  if (!apiKey || events.length === 0) return events.length === 0;
  const sendable = events.filter((item) => !isSandboxEvent(item.properties));
  if (sendable.length === 0) return true;
  try {
    const res = await fetch(`${host}/batch/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_key: apiKey,
        batch: sendable.map((item) => {
          const properties: Record<string, unknown> = {
            ...item.properties,
            $lib: "supabase-edge-function",
          };
          if (item.insertId) properties.$insert_id = item.insertId;
          const row: Record<string, unknown> = {
            event: item.event,
            distinct_id: item.distinctId,
            properties,
          };
          if (item.timestamp) row.timestamp = item.timestamp;
          return row;
        }),
      }),
    });
    return res.ok;
  } catch {
    return false;
  }
}
