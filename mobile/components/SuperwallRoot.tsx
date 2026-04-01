import type { ReactNode } from 'react';
import { lazy, Suspense } from 'react';
import { SUPERWALL_ENABLED } from '@/lib/superwall-config';

const SuperwallInner = lazy(() => import('./SuperwallInner'));

/**
 * Superwall is loaded in a separate chunk with static `expo-superwall` imports
 * (avoids Metro package-exports warnings and unstable require()+hooks patterns).
 * When disabled, the lazy module is never loaded (Expo Go / no key / kill switch).
 */
export function SuperwallRoot({ children }: { children: ReactNode }) {
  if (!SUPERWALL_ENABLED) {
    return <>{children}</>;
  }
  return (
    <Suspense fallback={null}>
      <SuperwallInner>{children}</SuperwallInner>
    </Suspense>
  );
}
