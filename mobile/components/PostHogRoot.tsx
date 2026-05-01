import type { ComponentType, ReactNode } from 'react';
import { ANALYTICS_ENABLED } from '@/lib/analytics';

/**
 * Mounts PostHog when env vars are set; otherwise passes children through unchanged.
 * Session replay, autocapture, and app lifecycle capture stay off for Phase 1.
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
