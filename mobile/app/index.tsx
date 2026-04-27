import { Redirect } from 'expo-router';

/** Hard entry: cold start / refresh should never default to `(auth)`. RouteGuard moves signed-in users onward. */
export default function RootIndex() {
  return <Redirect href="/(onboarding)/welcome" />;
}
