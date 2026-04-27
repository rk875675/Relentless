import { useState } from 'react';
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
import { useRouter } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { getPasswordRecoveryRedirectUrl } from '@/lib/auth-redirects';
import { colors, spacing } from '@/lib/theme';

export default function ForgotPasswordScreen() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSend = async () => {
    const trimmed = email.trim();
    if (!trimmed) return;
    setLoading(true);
    try {
      const redirectTo = getPasswordRecoveryRedirectUrl();
      const { error: resetErr } = await supabase.auth.resetPasswordForEmail(trimmed, {
        redirectTo,
      });
      if (resetErr) return;
      setSuccess(true);
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
        <View style={styles.inner}>
          <Text style={styles.logo}>RELENTLESS</Text>
          <Text style={styles.title}>Reset password</Text>
          <Text style={styles.sub}>
            {success
              ? 'If an account exists for that email, you will receive a link to choose a new password.'
              : 'Enter your email and we will send you a reset link.'}
          </Text>

          {success ? null : (
            <TextInput
              style={styles.input}
              placeholder="Email"
              placeholderTextColor={colors.textMuted}
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              keyboardType="email-address"
              textContentType="emailAddress"
              autoComplete="email"
              editable={!loading}
            />
          )}

          {success ? (
            <TouchableOpacity style={styles.button} onPress={() => router.replace('/(auth)/login' as any)}>
              <Text style={styles.buttonText}>Back to sign in</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity style={styles.button} onPress={handleSend} disabled={loading}>
              {loading ? (
                <ActivityIndicator color={colors.background} />
              ) : (
                <Text style={styles.buttonText}>Send reset link</Text>
              )}
            </TouchableOpacity>
          )}

          <TouchableOpacity
            style={styles.back}
            onPress={() => (router.canGoBack() ? router.back() : router.replace('/(auth)/login' as any))}
          >
            <Text style={styles.backText}>Back</Text>
          </TouchableOpacity>
        </View>
      </TouchableWithoutFeedback>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  inner: { flex: 1, justifyContent: 'center', paddingHorizontal: spacing.xl },
  logo: {
    fontSize: 32,
    fontWeight: '900',
    color: colors.white,
    textAlign: 'center',
    letterSpacing: 4,
    marginBottom: 8,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.textPrimary,
    textAlign: 'center',
    marginBottom: 12,
  },
  sub: {
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: 28,
    lineHeight: 20,
  },
  input: {
    backgroundColor: colors.surface,
    color: colors.white,
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  button: {
    backgroundColor: colors.white,
    borderRadius: 10,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 8,
  },
  buttonText: { color: colors.background, fontSize: 16, fontWeight: '700' },
  back: { marginTop: 24, alignItems: 'center' },
  backText: { color: colors.textSecondary, fontSize: 14 },
});
