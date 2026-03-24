import { errorResponse } from "./response.ts";

export type RateLimitClass =
  | "authenticated-read"
  | "authenticated-write"
  | "billing";

export type RateLimitResult =
  | { ok: true }
  | { ok: false; response: Response };

const WINDOW_SECONDS = 60;

const DEFAULT_LIMITS: Record<RateLimitClass, number> = {
  "authenticated-read": 120,
  "authenticated-write": 30,
  "billing": 10,
};

const ENV_KEYS: Record<RateLimitClass, string> = {
  "authenticated-read": "RATELIMIT_READ_RPM",
  "authenticated-write": "RATELIMIT_WRITE_RPM",
  "billing": "RATELIMIT_BILLING_RPM",
};

function getLimit(limitClass: RateLimitClass): number {
  const envVal = Deno.env.get(ENV_KEYS[limitClass]);
  if (envVal) {
    const n = parseInt(envVal, 10);
    if (!isNaN(n) && n > 0) return n;
  }
  return DEFAULT_LIMITS[limitClass];
}

export async function checkRateLimit(
  userId: string,
  requestId: string,
  limitClass: RateLimitClass,
): Promise<RateLimitResult> {
  const url = Deno.env.get("UPSTASH_REDIS_REST_URL");
  const token = Deno.env.get("UPSTASH_REDIS_REST_TOKEN");

  if (!url || !token) {
    return { ok: true };
  }

  const limit = getLimit(limitClass);
  const window = Math.floor(Date.now() / 1000 / WINDOW_SECONDS);
  const key = `relentless:rl:${limitClass}:${userId}:${window}`;

  try {
    const res = await fetch(`${url}/pipeline`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify([
        ["INCR", key],
        ["EXPIRE", key, WINDOW_SECONDS],
      ]),
    });

    if (!res.ok) {
      return { ok: true };
    }

    const results = await res.json() as { result: number }[];
    const count = results[0]?.result ?? 0;

    if (count > limit) {
      const resetSeconds = ((window + 1) * WINDOW_SECONDS) - Math.floor(Date.now() / 1000);
      return {
        ok: false,
        response: errorResponse(
          429,
          "RATE_LIMITED",
          "Too many requests. Try again later.",
          requestId,
          { "Retry-After": String(Math.max(1, resetSeconds)) },
        ),
      };
    }
  } catch {
    return { ok: true };
  }

  return { ok: true };
}
