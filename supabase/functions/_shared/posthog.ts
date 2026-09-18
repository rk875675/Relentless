// Server-side PostHog capture. Analytics must never throw into a billing path.

export type CaptureOptions = {
  /** Dedupes retries for ~24h. Use a stable business key, never a request id. */
  insertId?: string;
  timestamp?: string;
};

export async function capturePostHogEvent(
  distinctId: string,
  event: string,
  properties: Record<string, unknown>,
  options?: CaptureOptions,
): Promise<void> {
  const apiKey = Deno.env.get("POSTHOG_API_KEY") ?? "";
  const host = (Deno.env.get("POSTHOG_HOST") ?? "https://us.i.posthog.com").replace(/\/$/, "");
  if (!apiKey) return;
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
    await fetch(`${host}/capture/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    // Analytics must never crash entitlement or purchase handling.
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
  try {
    const res = await fetch(`${host}/batch/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_key: apiKey,
        batch: events.map((item) => {
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
