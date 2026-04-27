import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { markInAppAuthHubEntry } from '@/lib/auth-hub-entry';
import { useAuth } from '@/lib/auth-context';
import { restorePurchasesViaStoreKit } from '@/lib/iap-restore';
import { clearOnboardingProgress } from '@/lib/onboarding-local-state';
import { colors, spacing } from '@/lib/theme';

export default function OnboardingSignupScreen() {
  const router = useRouter();
  const { competitionDate, sport: sportParam, postPaywall } = useLocalSearchParams<{
    competitionDate?: string | string[];
    sport?: string | string[];
    postPaywall?: string;
  }>();
  const sportArg = Array.isArray(sportParam) ? sportParam[0] : sportParam;
  const isPostPaywall = postPaywall === 'true';
  const {
    session,
    signUp,
    updateCompetitionDate,
    updateSport,
    completeOnboarding,
    refreshUserState,
  } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [needsConfirmation, setNeedsConfirmation] = useState(false);

  // After signup in the post-paywall flow, sync the StoreKit purchase to the
  // backend, persist profile data, and complete onboarding. Fires once the
  // session is available (set synchronously by signUp or by onAuthStateChange).
  const syncStarted = useRef(false);
  const justSignedUp = useRef(false);
  useEffect(() => {
    if (!isPostPaywall || !justSignedUp.current || !session || syncStarted.current) return;
    syncStarted.current = true;
    setSyncing(true);
    (async () => {
      try {
        // Re-read the StoreKit purchase on device and POST to /purchases/restore
        // now that we have auth. Failures are non-fatal — the user can restore later.
        await restorePurchasesViaStoreKit().catch(() => {});
        await refreshUserState().catch(() => {});

        const comp = Array.isArray(competitionDate) ? competitionDate[0] : competitionDate;
        if (comp) await updateCompetitionDate(comp).catch(() => {});
        const sportTrim = sportArg?.trim();
        if (sportTrim) await updateSport(sportTrim).catch(() => {});

        await completeOnboarding({ requireUser: true });
        await clearOnboardingProgress();
        router.replace('/(tabs)');
      } catch {
        setSyncing(false);
        syncStarted.current = false;
        setError('Could not finish setup. Please try again.');
      }
    })();
  }, [
    isPostPaywall, session, competitionDate, sportArg,
    refreshUserState, updateCompetitionDate, updateSport, completeOnboarding, router,
  ]);

  const handleSignup = async () => {
    if (!email || !password) {
      setError('Enter your email and password.');
      return;
    }
    if (password.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }
    if (password !== confirm) {
      setError('Passwords do not match.');
      return;
    }
    setError('');
    setLoading(true);
    const err = await signUp(email.trim(), password);

    if (err) {
      setLoading(false);
      setError(err);
      return;
    }

    if (isPostPaywall) {
      // signUp now sets session synchronously when auto-confirm is on.
      // The useEffect above handles the sync flow once session is available.
      justSignedUp.current = true;
      setSyncing(true);
      // If session was set synchronously by signUp, the effect will fire on
      // next render. If not (e.g. email confirmation), loading stays visible.
      setLoading(false);
      return;
    }

    // Legacy / non-post-paywall fallback — should not happen in normal flow.
    setLoading(false);
    if (competitionDate) {
      const comp = Array.isArray(competitionDate) ? competitionDate[0] : competitionDate;
      if (comp) await updateCompetitionDate(comp).catch(() => {});
    }
    const sportTrim = sportArg?.trim();
    if (sportTrim) {
      await updateSport(sportTrim).catch(() => {});
    }
    setTimeout(() => {
      router.push('/(onboarding)/paywall');
    }, 300);
  };

  if (needsConfirmation) {
    return (
      <View style={styles.container}>
        <View style={styles.inner}>
          <Text style={styles.logo}>RELENTLESS</Text>
          <Text style={styles.successText}>
            Check your email to confirm your account, then sign in.
          </Text>
          <TouchableOpacity
            style={styles.button}
            onPress={() =>
              router.replace({ pathname: '/(auth)' as any, params: { from: 'confirm' } })
            }
          >
            <Text style={styles.buttonText}>Go to Sign In</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  if (syncing) {
    return (
      <View style={styles.container}>
        <View style={styles.inner}>
          <Text style={styles.logo}>RELENTLESS</Text>
          <Text style={styles.tagline}>Setting up your account...</Text>
          <ActivityIndicator color={colors.accent} size="large" style={{ marginTop: 24 }} />
          {error ? <Text style={[styles.error, { marginTop: 24 }]}>{error}</Text> : null}
        </View>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
        <View style={styles.inner}>
          <Text style={styles.logo}>RELENTLESS</Text>
          <Text style={styles.tagline}>Create your account to continue</Text>

          <TextInput
            style={styles.input}
            placeholder="Email"
            placeholderTextColor={colors.textMuted}
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
            textContentType="none"
            autoComplete="off"
          />

          <TextInput
            style={styles.input}
            placeholder="Password"
            placeholderTextColor={colors.textMuted}
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            textContentType="oneTimeCode"
            autoComplete="off"
          />

          <TextInput
            style={styles.input}
            placeholder="Confirm password"
            placeholderTextColor={colors.textMuted}
            value={confirm}
            onChangeText={setConfirm}
            secureTextEntry
            textContentType="oneTimeCode"
            autoComplete="off"
          />

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <TouchableOpacity style={styles.button} onPress={handleSignup} disabled={loading}>
            {loading ? (
              <ActivityIndicator color={colors.background} />
            ) : (
              <Text style={styles.buttonText}>Create Account</Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.linkButton}
            onPress={() => {
              markInAppAuthHubEntry();
              router.push({ pathname: '/(auth)' as any, params: { from: 'app' } });
            }}
          >
            <Text style={styles.linkText}>Already have an account? Sign In</Text>
          </TouchableOpacity>
        </View>
      </TouchableWithoutFeedback>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  inner: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
  },
  logo: {
    fontSize: 32,
    fontWeight: '900',
    color: colors.white,
    textAlign: 'center',
    letterSpacing: 4,
    marginBottom: 8,
  },
  tagline: {
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: 48,
  },
  successText: {
    fontSize: 16,
    color: colors.textSecondary,
    textAlign: 'center',
    marginVertical: 32,
    lineHeight: 24,
  },
  input: {
    backgroundColor: colors.surface,
    color: colors.white,
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: colors.border,
  },
  error: {
    color: colors.error,
    fontSize: 13,
    textAlign: 'center',
    marginBottom: 12,
  },
  button: {
    backgroundColor: colors.white,
    borderRadius: 10,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 8,
  },
  buttonText: {
    color: colors.background,
    fontSize: 16,
    fontWeight: '700',
  },
  linkButton: {
    marginTop: 20,
    alignItems: 'center',
  },
  linkText: {
    color: colors.textSecondary,
    fontSize: 14,
  },
});
