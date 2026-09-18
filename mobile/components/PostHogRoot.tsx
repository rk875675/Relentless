import type { ComponentType, ReactNode } from 'react';
import { ANALYTICS_ENABLED } from '@/lib/analytics';

/**
 * Mounts PostHog when env vars are set; otherwise passes children through unchanged.
 * Session replay and autocapture stay off for Phase 1; app lifecycle events
 * (install/open/background) are captured — see PostHogSubtree options.
 */
export function PostHogRoot({ children }: { children: ReactNode }) {
  if (!ANALYTICS_ENABLED) {
    return <>{children}</>;
  }

  try {
    const PostHogSubtree = require('./PostHogSubtree').PostHogSubtree as ComponentType<{
      children: ReactNode;
    }>;
    return <PostHogSubtree>{children}</PostHogSubtree>;
  } catch (error) {
    if (__DEV__) {
      console.warn('[Analytics] PostHog disabled after provider load failed', error);
    }
    return <>{children}</>;
  }
}
