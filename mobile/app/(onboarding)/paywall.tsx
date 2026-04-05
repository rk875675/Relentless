import { ActivityIndicator, View } from 'react-native';
import { PaywallFallback } from '@/components/onboarding/PaywallFallback';
import { PaywallSuperwall } from '@/components/onboarding/PaywallSuperwall';
import { SUPERWALL_ENABLED } from '@/lib/superwall-config';

export default function PaywallScreen() {
  if (!SUPERWALL_ENABLED) return <PaywallFallback />;
  return <PaywallSuperwall />;
}
