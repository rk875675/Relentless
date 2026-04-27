import { useLocalSearchParams } from 'expo-router';
import { PaywallFallback } from '@/components/onboarding/PaywallFallback';
import { PaywallSuperwall } from '@/components/onboarding/PaywallSuperwall';
import { SUPERWALL_ENABLED } from '@/lib/superwall-config';

export default function PaywallScreen() {
  const { competitionDate, sport } = useLocalSearchParams<{
    competitionDate?: string;
    sport?: string;
  }>();

  if (!SUPERWALL_ENABLED) {
    return <PaywallFallback sport={sport} competitionDate={competitionDate} />;
  }
  return <PaywallSuperwall sport={sport} competitionDate={competitionDate} />;
}
