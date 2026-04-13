import { useRef, useEffect } from 'react';
import { Animated, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { colors, spacing } from '@/lib/theme';

export default function WelcomeScreen() {
  const router = useRouter();
  const fadeTitle = useRef(new Animated.Value(0)).current;
  const fadeTagline = useRef(new Animated.Value(0)).current;
  const fadeCta = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.stagger(250, [
      Animated.timing(fadeTitle, { toValue: 1, duration: 500, useNativeDriver: true }),
      Animated.timing(fadeTagline, { toValue: 1, duration: 400, useNativeDriver: true }),
      Animated.timing(fadeCta, { toValue: 1, duration: 400, useNativeDriver: true }),
    ]).start();
  }, []);

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.inner}>
        <View style={styles.center}>
          <View style={styles.glow} />
          <Animated.Text style={[styles.brand, { opacity: fadeTitle }]}>
            RELENTLESS
          </Animated.Text>
          <Animated.Text style={[styles.tagline, { opacity: fadeTagline }]}>
            Train your mind like you train your body
          </Animated.Text>
        </View>

        <Animated.View style={[styles.bottom, { opacity: fadeCta }]}>
          <TouchableOpacity
            style={styles.button}
            onPress={() => router.push('/(onboarding)/question-effort')}
          >
            <Text style={styles.buttonText}>Get Started</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.signInLink}
            onPress={() => router.replace('/(auth)/login' as any)}
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
