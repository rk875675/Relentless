import { useState } from 'react';
import { Linking, StyleSheet, Text, TextInput, TouchableOpacity, View, ActivityIndicator, KeyboardAvoidingView, Platform, Keyboard, TouchableWithoutFeedback } from 'react-native';
import { Link } from 'expo-router';
import { useAuth } from '@/lib/auth-context';
import { InlineErrorCard } from '@/components/InlineErrorCard';
import { LEGAL_PRIVACY_POLICY_URL, LEGAL_TERMS_OF_USE_URL } from '@/lib/legal-urls';

/** Client-side check mirroring prod's lower_upper_letters_digits requirement.
 *  Prevents the raw Supabase character-list error from ever reaching the UI.
 *  Exported so password-recovery.tsx can apply the same rule. */
export function passwordMeetsComplexity(pw: string): boolean {
  return /[a-z]/.test(pw) && /[A-Z]/.test(pw) && /[0-9]/.test(pw);
}

/** Sanitise any Supabase error that slips through (e.g. if the requirement changes). */
export function friendlySignUpError(raw: string): string {
  // Catch-all on the literal character-class dump too, so a future wording
  // change in Supabase's message can never leak the raw list to the UI again.
  if (
    /contain at least one character of each/i.test(raw) ||
    /password.*weak/i.test(raw) ||
    /abcdefghijklmnopqrstuvwxyz/i.test(raw)
  ) {
    return 'Password must include uppercase, lowercase, and a number.';
  }
  if (/already registered/i.test(raw) || /already been registered/i.test(raw) || /user already exists/i.test(raw)) {
    return 'An account with this email already exists. Try signing in instead.';
  }
  return raw;
}

export default function SignupScreen() {
  const { signUp } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSignup = async () => {
    setError(null);
    if (!email || !password) {
      setError('Please enter your email and password.');
      return;
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    if (!passwordMeetsComplexity(password)) {
      setError('Password must include uppercase, lowercase, and a number.');
      return;
    }
    if (password !== confirm) {
      setError('Passwords do not match.');
      return;
    }
    setLoading(true);
    const err = await signUp(email.trim(), password);
    setLoading(false);
    if (err) {
      setError(friendlySignUpError(err));
    } else {
      setSuccess(true);
    }
  };

  if (success) {
    return (
      <View style={styles.container}>
        <View style={styles.inner}>
          <Text style={styles.logo}>RELENTLESS</Text>
          <Text style={styles.successText}>Check your email to confirm your account, then sign in.</Text>
          <Link href="/(auth)" asChild>
            <TouchableOpacity style={styles.button}>
              <Text style={styles.buttonText}>Back to Sign In</Text>
            </TouchableOpacity>
          </Link>
        </View>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
        <View style={styles.inner}>
          <Text style={styles.logo}>RELENTLESS</Text>
          <Text style={styles.tagline}>Create your account</Text>

          <TextInput
            style={styles.input}
            placeholder="Email"
            placeholderTextColor="#666"
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
            placeholderTextColor="#666"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            textContentType="oneTimeCode"
            autoComplete="off"
          />

          <TextInput
            style={styles.input}
            placeholder="Confirm password"
            placeholderTextColor="#666"
            value={confirm}
            onChangeText={setConfirm}
            secureTextEntry
            textContentType="oneTimeCode"
            autoComplete="off"
          />

          {error ? <InlineErrorCard message={error} /> : null}

          <TouchableOpacity style={styles.button} onPress={handleSignup} disabled={loading}>
            {loading ? (
              <ActivityIndicator color="#000" />
            ) : (
              <Text style={styles.buttonText}>Create Account</Text>
            )}
          </TouchableOpacity>

          <Link href="/(auth)" asChild>
            <TouchableOpacity style={styles.linkButton}>
              <Text style={styles.linkText}>Already have an account? Sign In</Text>
            </TouchableOpacity>
          </Link>

          <Text style={styles.legalText}>
            By creating an account you agree to our{' '}
            <Text style={styles.legalLink} onPress={() => Linking.openURL(LEGAL_TERMS_OF_USE_URL)}>Terms</Text>
            {' '}and{' '}
            <Text style={styles.legalLink} onPress={() => Linking.openURL(LEGAL_PRIVACY_POLICY_URL)}>Privacy Policy</Text>.
          </Text>
        </View>
      </TouchableWithoutFeedback>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1A1A1B',
  },
  inner: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  logo: {
    fontSize: 32,
    fontWeight: '900',
    color: '#F2F2F7',
    textAlign: 'center',
    letterSpacing: 4,
    marginBottom: 8,
  },
  tagline: {
    fontSize: 14,
    color: '#888',
    textAlign: 'center',
    marginBottom: 48,
  },
  successText: {
    fontSize: 16,
    color: '#aaa',
    textAlign: 'center',
    marginVertical: 32,
    lineHeight: 24,
  },
  input: {
    backgroundColor: '#2D2D2E',
    color: '#F2F2F7',
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#424243',
  },
  button: {
    backgroundColor: '#fff',
    borderRadius: 10,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 8,
  },
  buttonText: {
    color: '#000',
    fontSize: 16,
    fontWeight: '700',
  },
  linkButton: {
    marginTop: 20,
    alignItems: 'center',
  },
  linkText: {
    color: '#888',
    fontSize: 14,
  },
  legalText: {
    color: '#666',
    fontSize: 11,
    textAlign: 'center',
    marginTop: 24,
    lineHeight: 16,
  },
  legalLink: {
    color: '#888',
    textDecorationLine: 'underline' as const,
  },
});
