import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { capturePostHogBatch, capturePostHogEvent, isSandboxEnvironment } from "./posthog.ts";

// ---------------------------------------------------------------------------
// The sandbox gate is the only thing standing between our own TestFlight/Xcode
// test purchases and the production revenue funnels, so prove it by counting
// the HTTP calls the module actually makes.
// ---------------------------------------------------------------------------

Deno.env.set("POSTHOG_API_KEY", "phc_test_key");
Deno.env.set("POSTHOG_HOST", "https://posthog.test");

type Sent = { url: string; body: Record<string, unknown> };

const realFetch = globalThis.fetch;

async function recordSends(fn: () => Promise<unknown>): Promise<Sent[]> {
  const sent: Sent[] = [];
  globalThis.fetch = ((url: string | URL | Request, init?: RequestInit) => {
    sent.push({
      url: String(url),
      body: JSON.parse(String(init?.body ?? "{}")),
    });
    return Promise.resolve(new Response("ok", { status: 200 }));
  }) as typeof fetch;
  try {
    await fn();
  } finally {
    globalThis.fetch = realFetch;
  }
  return sent;
}

Deno.test("isSandboxEnvironment covers every Apple non-production environment", () => {
  for (const value of ["Sandbox", "sandbox", "Xcode", "LocalTesting"]) {
    assertEquals(isSandboxEnvironment(value), true, value);
  }
  for (const value of ["Production", "production", "", null, undefined]) {
    assertEquals(isSandboxEnvironment(value), false, String(value));
  }
});

Deno.test("capture drops an is_sandbox=true event", async () => {
  const sent = await recordSends(() =>
    capturePostHogEvent("user-1", "trial_started", { is_sandbox: true, is_trial: true })
  );
  assertEquals(sent.length, 0);
});

Deno.test("capture drops an event tagged only by Apple's environment", async () => {
  const sent = await recordSends(() =>
    capturePostHogEvent("user-1", "trial_cancelled", { environment: "Sandbox" })
  );
  assertEquals(sent.length, 0);
});

Deno.test("capture logs a non-ok response and does not throw", async () => {
  globalThis.fetch = (() => Promise.resolve(new Response("no", { status: 401 }))) as typeof fetch;
  try {
    await capturePostHogEvent("user-1", "referral_share_code_ready", {
      environment: "Production",
      is_sandbox: false,
    });
  } finally {
    globalThis.fetch = realFetch;
  }
});

Deno.test("capture still sends production events", async () => {
  const sent = await recordSends(() =>
    capturePostHogEvent("user-1", "trial_started", {
      is_sandbox: false,
      environment: "Production",
    })
  );
  assertEquals(sent.length, 1);
  assertEquals(sent[0].body.event, "trial_started");
  assertEquals(sent[0].body.distinct_id, "user-1");
});

Deno.test("capture sends events that carry no environment at all", async () => {
  // pack_completed / promo_code_redeemed have no Apple concept and must survive.
  const sent = await recordSends(() =>
    capturePostHogEvent("user-1", "pack_completed", { pack_id: "abc" })
  );
  assertEquals(sent.length, 1);
});

Deno.test("batch drops only the sandbox rows and keeps the rest", async () => {
  const sent = await recordSends(() =>
    capturePostHogBatch([
      { distinctId: "a", event: "$set", properties: { is_sandbox: true } },
      { distinctId: "b", event: "$set", properties: { is_sandbox: false } },
      { distinctId: "c", event: "$set", properties: { environment: "Sandbox" } },
      { distinctId: "d", event: "$set", properties: {} },
    ])
  );
  assertEquals(sent.length, 1);
  const batch = sent[0].body.batch as Array<{ distinct_id: string }>;
  assertEquals(batch.map((row) => row.distinct_id), ["b", "d"]);
});

Deno.test("batch of only sandbox rows reports success without calling PostHog", async () => {
  let ok = false;
  const sent = await recordSends(async () => {
    ok = await capturePostHogBatch([
      { distinctId: "a", event: "$set", properties: { is_sandbox: true } },
    ]);
  });
  assertEquals(sent.length, 0);
  // Must not look like a failure, or the backfill would retry forever.
  assertEquals(ok, true);
});
