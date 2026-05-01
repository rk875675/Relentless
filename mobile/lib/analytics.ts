import type { PostHog } from 'posthog-react-native';

const rawKey = process.env.EXPO_PUBLIC_POSTHOG_API_KEY ?? '';
const rawHost = process.env.EXPO_PUBLIC_POSTHOG_HOST ?? '';

/** Public PostHog project API key (trimmed). Empty when unset. */
export const POSTHOG_API_KEY = rawKey.trim();

/** PostHog ingest host (trimmed). Empty when unset. */
export const POSTHOG_HOST = rawHost.trim();

/** True when both key and host are configured; otherwise analytics is fully disabled. */
export const ANALYTICS_ENABLED = POSTHOG_API_KEY.length > 0 && POSTHOG_HOST.length > 0;

type QueuedAnalyticsCall = () => void;

const MAX_QUEUED_CALLS = 20;

let client: PostHog | null = null;
let queuedCalls: QueuedAnalyticsCall[] = [];

function safeRun(fn: () => void): void {
  try {
    fn();
  } catch {
    // Analytics must never crash the app or block navigation.
  }
}

function enqueueOrRun(fn: QueuedAnalyticsCall): void {
  if (!ANALYTICS_ENABLED) return;
  if (client) {
    safeRun(fn);
    return;
  }
  queuedCalls = [...queuedCalls.slice(-(MAX_QUEUED_CALLS - 1)), fn];
}

function flushQueuedCalls(): void {
  const calls = queuedCalls;
  queuedCalls = [];
  calls.forEach((fn) => safeRun(fn));
}

/**
 * Central analytics facade. Import this module only — do not call PostHog APIs elsewhere.
 * When PostHog is disabled, all methods no-op. Calls made before the client mounts are queued briefly.
 */
export const analytics = {
  setClient(next: PostHog | null): void {
    client = next;
    if (client) flushQueuedCalls();
  },

  capture(event: string, properties?: Record<string, unknown>): void {
    enqueueOrRun(() => {
      if (!client) return;
      client!.capture(event, properties as Parameters<PostHog['capture']>[1]);
    });
  },

  screen(name: string, properties?: Record<string, unknown>): void {
    enqueueOrRun(() => {
      if (!client) return;
      void client
        .screen(name, properties as Parameters<PostHog['screen']>[1])
        .catch(() => {});
    });
  },

  flush(): void {
    if (!client) return;
    void client.flush().catch(() => {});
  },

  identify(distinctId?: string, properties?: Record<string, unknown>): void {
    enqueueOrRun(() => {
      if (!client) return;
      client!.identify(distinctId, properties as Parameters<PostHog['identify']>[1]);
    });
  },

  reset(propertiesToKeep?: Parameters<PostHog['reset']>[0]): void {
    if (!client) return;
    safeRun(() => {
      client!.reset(propertiesToKeep);
    });
  },

  setPersonProperties(
    userPropertiesToSet?: Record<string, unknown>,
    userPropertiesToSetOnce?: Record<string, unknown>,
    reloadFeatureFlags?: boolean,
  ): void {
    enqueueOrRun(() => {
      if (!client) return;
      client!.setPersonProperties(
        userPropertiesToSet as Parameters<PostHog['setPersonProperties']>[0],
        userPropertiesToSetOnce as Parameters<PostHog['setPersonProperties']>[1],
        reloadFeatureFlags,
      );
    });
  },
};
