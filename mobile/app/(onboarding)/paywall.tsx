import { lazy, Suspense } from 'react';
import { PaywallFallback } from '@/components/onboarding/PaywallFallback';
import { SUPERWALL_ENABLED } from '@/lib/superwall-config';

const PaywallSuperwall = lazy(() =>
  import('@/components/onboarding/PaywallSuperwall').then((m) => ({ default: m.PaywallSuperwall })),
);

export default function PaywallScreen() {
  if (SUPERWALL_ENABLED) {
    return (
      <Suspense fallback={null}>
        <PaywallSuperwall />
      </Suspense>
    );
  }
  return <PaywallFallback />;
}
