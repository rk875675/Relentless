import type { ReactNode } from 'react';
import { useEffect } from 'react';
import { PostHogProvider, usePostHog } from 'posthog-react-native';
import { POSTHOG_API_KEY, POSTHOG_HOST, analytics } from '@/lib/analytics';

function PostHogClientBinder({ children }: { children: ReactNode }) {
  const posthog = usePostHog();

  useEffect(() => {
    analytics.setClient(posthog);
    return () => analytics.setClient(null);
  }, [posthog]);

  return <>{children}</>;
}

/** Loaded only when PostHog env vars are set — keeps `posthog-react-native` off the critical path when disabled. */
export function PostHogSubtree({ children }: { children: ReactNode }) {
  return (
    <PostHogProvider
      apiKey={POSTHOG_API_KEY}
      options={{
        host: POSTHOG_HOST,
        captureAppLifecycleEvents: false,
        enableSessionReplay: false,
      }}
      autocapture={false}
      debug={__DEV__}
    >
      <PostHogClientBinder>{children}</PostHogClientBinder>
    </PostHogProvider>
  );
}
