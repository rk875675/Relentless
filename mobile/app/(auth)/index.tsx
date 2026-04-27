import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';
import { AuthSocialSignInButtons } from '@/components/auth/AuthSocialSignInButtons';
import { useSocialSignIn } from '@/lib/use-social-sign-in';
import { colors, spacing } from '@/lib/theme';

export default function AuthHubScreen() {
  const router = useRouter();
  const { googleLoading, appleLoading, handleGoogle, handleApple } = useSocialSignIn();

  return (
    <View style={styles.container}>
      <View style={styles.inner}>
        <Text style={styles.logo}>RELENTLESS</Text>
        <Text style={styles.tagline}>Mental performance training for athletes</Text>

        <AuthSocialSignInButtons
          variant="hub"
          onGoogle={handleGoogle}
          onApple={handleApple}
          googleLoading={googleLoading}
          appleLoading={appleLoading}
        />

        <TouchableOpacity
          style={styles.emailBtn}
          onPress={() => router.push('/(auth)/login' as any)}
          activeOpacity={0.85}
        >
          <Text style={styles.emailText}>Continue with Email</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.backLink}
          onPress={() => {
            if (router.canGoBack()) {
              router.back();
            } else {
              router.replace('/(onboarding)/welcome' as any);
            }
          }}
        >
          <Text style={styles.backText}>Back</Text>
        </TouchableOpacity>
      </View>
    </View>
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
    marginBottom: 40,
  },
  emailBtn: {
    backgroundColor: colors.surface,
    borderRadius: 10,
    paddingVertical: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  emailText: { color: colors.textPrimary, fontSize: 16, fontWeight: '600' },
  backLink: { marginTop: 24, alignItems: 'center' },
  backText: { color: colors.textSecondary, fontSize: 14 },
});
