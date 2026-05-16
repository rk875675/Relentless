import { useRef, useEffect, useState } from 'react';
import { Animated, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { markInAppAuthHubEntry } from '@/lib/auth-hub-entry';
import { useAuth } from '@/lib/auth-context';
import { clearOnboardingProgress, loadOnboardingScreen } from '@/lib/onboarding-local-state';
import { trackOnboardingStarted } from '@/lib/onboarding-analytics';
import { colors, spacing } from '@/lib/theme';

const VALID_ONBOARDING_SCREENS = new Set([
  'relentless-intro', 'onboarding-intake', 'unlocked-potential',
  'mac-framework', 'mac-question', 'mac-detail', 'mac-setup',
  'we-can-train', 'tutorial', 'tutorial-home', 'tutorial-home-detail',
  'tutorial-library', 'tutorial-library-detail', 'tutorial-profile',
  'sport-selection', 'competition-date', 'paywall', 'signup',
  'what-you-get', 'exercise-a', 'exercise-m', 'exercise-c',
  'study-a', 'study-b', 'social-proof', 'effort-response',
  'why-relentless', 'how-it-works',
]);

export default function WelcomeScreen() {
  const router = useRouter();
  const { session, onboardingComplete } = useAuth();
  const [savedScreen, setSavedScreen] = useState<string | null>(null);
  const [showUI, setShowUI] = useState(false);
  const fadeTitle = useRef(new Animated.Value(0)).current;
  const fadeTagline = useRef(new Animated.Value(0)).current;
  const fadeCta = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // When signed in, let RouteGuard handle all navigation. Don't auto-push
    // a saved screen — setSession() fires before fetchUserState() finishes,
    // so this effect re-runs with session=true + onboardingComplete=false,
    // which would push a stale onboarding screen on top of the login view.
    if (session) {
      setShowUI(true);
      return;
    }
    loadOnboardingScreen().then((s) => {
      if (s && VALID_ONBOARDING_SCREENS.has(s)) {
        setSavedScreen(s);
        router.push(`/(onboarding)/${s}` as any);
        setTimeout(() => setShowUI(true), 500);
      } else {
        if (s) clearOnboardingProgress();
        setShowUI(true);
      }
    });
  }, [router, session]);

  useEffect(() => {
    if (!showUI) return;
    const seq = Animated.stagger(250, [
      Animated.timing(fadeTitle, { toValue: 1, duration: 500, useNativeDriver: true }),
      Animated.timing(fadeTagline, { toValue: 1, duration: 400, useNativeDriver: true }),
      Animated.timing(fadeCta, { toValue: 1, duration: 400, useNativeDriver: true }),
    ]);
    seq.start();
    return () => {
      seq.stop();
      fadeTitle.stopAnimation();
      fadeTagline.stopAnimation();
      fadeCta.stopAnimation();
    };
  }, [showUI, fadeCta, fadeTagline, fadeTitle]);

  if (!showUI) {
    return <View style={{ flex: 1, backgroundColor: colors.background }} />;
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.inner}>
        <View style={styles.center}>
          <View style={styles.glow} />
          <Animated.Text style={[styles.brand, { opacity: fadeTitle }]}>
            RELENTLESS
          </Animated.Text>
          <Animated.Text style={[styles.tagline, { opacity: fadeTagline }]}>
            Build a mind so tough it scares people.
          </Animated.Text>
        </View>

        <Animated.View style={[styles.bottom, { opacity: fadeCta }]}>
          <TouchableOpacity
            style={styles.button}
            onPress={() => {
              if (!savedScreen) {
                trackOnboardingStarted({ step_key: 'welcome', step_index: 0 });
              }
              const target = savedScreen || 'relentless-intro';
              router.push(`/(onboarding)/${target}` as any);
            }}
          >
            <Text style={styles.buttonText}>{savedScreen ? 'Continue' : 'Get Started'}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.signInLink}
            onPress={() => {
              markInAppAuthHubEntry();
              router.push({ pathname: '/(auth)' as any, params: { from: 'signin' } });
            }}
          >
            <Text style={styles.signInText}>Already have an account? Sign In</Text>
          </TouchableOpacity>
        </Animated.View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  inner: { flex: 1, justifyContent: 'space-between', paddingHorizontal: spacing.xl },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  glow: {
    position: 'absolute',
    width: 200,
    height: 200,
    borderRadius: 100,
    backgroundColor: 'rgba(139, 92, 246, 0.06)',
  },
  brand: {
    fontSize: 38,
    fontWeight: '900',
    color: colors.white,
    letterSpacing: 6,
    textAlign: 'center',
  },
  tagline: {
    fontSize: 16,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: spacing.md,
    lineHeight: 24,
    letterSpacing: 0.3,
  },
  bottom: { paddingBottom: spacing.xl },
  button: {
    backgroundColor: colors.accent,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
  },
  buttonText: { color: colors.white, fontSize: 16, fontWeight: '700' },
  signInLink: { marginTop: 20, alignItems: 'center' },
  signInText: { color: colors.textSecondary, fontSize: 14 },
});
