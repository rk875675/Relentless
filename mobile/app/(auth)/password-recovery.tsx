import { useCallback, useEffect, useState } from 'react';
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
import * as Linking from 'expo-linking';
import { useRouter } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { parseAuthParamsFromUrl } from '@/lib/auth-redirects';
import { colors, spacing } from '@/lib/theme';

export default function PasswordRecoveryScreen() {
  const router = useRouter();
  const [booting, setBooting] = useState(true);
  const [sessionReady, setSessionReady] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [saving, setSaving] = useState(false);

  const completeFromUrl = useCallback(async (url: string | null) => {
    if (!url || !url.includes('access_token')) {
      setLoadError(
        'Open the reset link from the email on this device, or use Forgot password to send a new one.',
      );
      setBooting(false);
      return;
    }
    const params = parseAuthParamsFromUrl(url);
    const { access_token, refresh_token, type } = params;
    if (type && type !== 'recovery') {
      setLoadError('This link is invalid or expired. Request a new one from sign in.');
      setBooting(false);
      return;
    }
    if (!access_token || !refresh_token) {
      setLoadError('This link is invalid or expired. Request a new one from sign in.');
      setBooting(false);
      return;
    }
    const { error: sessionErr } = await supabase.auth.setSession({ access_token, refresh_token });
    if (sessionErr) {
      setLoadError(sessionErr.message);
      setBooting(false);
      return;
    }
    setSessionReady(true);
    setBooting(false);
  }, []);

  useEffect(() => {
    void (async () => {
      const initial = await Linking.getInitialURL();
      await completeFromUrl(initial);
    })();
  }, [completeFromUrl]);

  useEffect(() => {
    const sub = Linking.addEventListener('url', (e) => {
      if (!e.url?.includes('access_token')) return;
      void (async () => {
        if (!sessionReady) {
          await completeFromUrl(e.url);
        }
      })();
    });
    return () => sub.remove();
  }, [completeFromUrl, sessionReady]);

  const savePassword = async () => {
    if (!password || !confirm) return;
    if (password.length < 6) return;
    if (password !== confirm) return;
    setSaving(true);
    try {
      const { error: upErr } = await supabase.auth.updateUser({ password });
      if (upErr) return;
      await supabase.auth.signOut();
      router.replace('/(auth)/login' as any);
    } finally {
      setSaving(false);
    }
  };

  if (booting) {
    return (
      <View style={styles.center}>
        <Text style={styles.logo}>RELENTLESS</Text>
        <ActivityIndicator color={colors.accent} size="large" style={{ marginTop: 20 }} />
      </View>
    );
  }

  if (loadError) {
    return (
      <View style={styles.centerPadded}>
        <Text style={styles.logo}>RELENTLESS</Text>
        <Text style={styles.errTitle}>Couldn't open link</Text>
        <Text style={styles.sub}>{loadError}</Text>
        <TouchableOpacity style={styles.button} onPress={() => router.replace('/(auth)/forgot-password' as any)}>
          <Text style={styles.buttonText}>Request new link</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => router.replace('/(auth)/login' as any)} style={styles.textBtn}>
          <Text style={styles.muted}>Back to sign in</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (!sessionReady) {
    return null;
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
        <View style={styles.inner}>
          <Text style={styles.logo}>RELENTLESS</Text>
          <Text style={styles.title}>Choose a new password</Text>
          <Text style={styles.subLabel}>At least 6 characters.</Text>

          <TextInput
            style={styles.input}
            placeholder="New password"
            placeholderTextColor={colors.textMuted}
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            textContentType="newPassword"
            autoComplete="password-new"
          />
          <TextInput
            style={styles.input}
            placeholder="Confirm new password"
            placeholderTextColor={colors.textMuted}
            value={confirm}
            onChangeText={setConfirm}
            secureTextEntry
            textContentType="newPassword"
            autoComplete="password-new"
          />
          <TouchableOpacity style={styles.button} onPress={savePassword} disabled={saving}>
            {saving ? (
              <ActivityIndicator color={colors.background} />
            ) : (
              <Text style={styles.buttonText}>Update password</Text>
            )}
          </TouchableOpacity>
        </View>
      </TouchableWithoutFeedback>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center' },
  centerPadded: { flex: 1, backgroundColor: colors.background, paddingHorizontal: spacing.xl, justifyContent: 'center' },
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
    marginBottom: 6,
  },
  sub: {
    color: colors.textSecondary,
    fontSize: 14,
    textAlign: 'center',
    marginTop: 12,
    lineHeight: 20,
  },
  subLabel: { color: colors.textSecondary, fontSize: 14, textAlign: 'center', marginBottom: 20 },
  errTitle: { fontSize: 18, fontWeight: '600', color: colors.textPrimary, textAlign: 'center', marginTop: 8 },
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
  textBtn: { marginTop: 20, alignItems: 'center' },
  muted: { color: colors.textSecondary, fontSize: 14 },
});
