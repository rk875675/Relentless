import { useRef, useEffect } from 'react';
import { Animated, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import { MAC_ORDER, MAC_COLORS, type MacCategory } from '@/lib/mac-categories';
import { colors, spacing } from '@/lib/theme';

const INITIAL_SCORE = 20;

const MAC_DELTAS: { cat: MacCategory; amount: number }[] = MAC_ORDER.map((cat) => ({
  cat,
  amount: INITIAL_SCORE,
}));

export default function OnboardingTrophyScreen() {
  const router = useRouter();

  // Mirrors the exact animation sequence from lesson/[id].tsx `done` phase.
  const doneAnim1 = useRef(new Animated.Value(0)).current;
  const doneAnim2 = useRef(new Animated.Value(0)).current;
  const doneAnim3 = useRef(new Animated.Value(0)).current;
  const doneAnim4 = useRef(new Animated.Value(0)).current;
  const doneScale = useRef(new Animated.Value(0.7)).current;
  const glowPulse = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

    Animated.sequence([
      Animated.parallel([
        Animated.timing(doneAnim1, { toValue: 1, duration: 500, useNativeDriver: true }),
        Animated.spring(doneScale, { toValue: 1, friction: 6, tension: 80, useNativeDriver: true }),
      ]),
      Animated.timing(doneAnim2, { toValue: 1, duration: 380, useNativeDriver: true }),
      Animated.timing(doneAnim3, { toValue: 1, duration: 380, useNativeDriver: true }),
      Animated.timing(doneAnim4, { toValue: 1, duration: 300, useNativeDriver: true }),
    ]).start();

    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(glowPulse, { toValue: 1.12, duration: 1400, useNativeDriver: true }),
        Animated.timing(glowPulse, { toValue: 1, duration: 1400, useNativeDriver: true }),
      ]),
    );
    const t = setTimeout(() => pulse.start(), 600);
    return () => {
      clearTimeout(t);
      pulse.stop();
    };
  }, []);

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.centered}>

        {/* Trophy — exact match with lesson/[id].tsx done phase */}
        <Animated.View style={{ opacity: doneAnim1, transform: [{ scale: doneScale }] }}>
          <Animated.View style={[styles.trophyGlow, { transform: [{ scale: glowPulse }] }]}>
            <Ionicons name="trophy" size={72} color={colors.accentLight} />
          </Animated.View>
        </Animated.View>

        {/* Title */}
        <Animated.View style={{ opacity: doneAnim2, alignItems: 'center' as const }}>
          <Text style={styles.doneTitle}>Workout Complete</Text>
          <Text style={styles.doneSub}>{"Grant's Intro"}</Text>
        </Animated.View>

        {/* MAC delta badges — M A on top row, C centered below */}
        <Animated.View style={[styles.doneDeltaCol, { opacity: doneAnim3 }]}>
          <View style={styles.doneDeltaTopRow}>
            {MAC_DELTAS.slice(0, 2).map(({ cat, amount }) => (
              <View key={cat} style={styles.doneDeltaBadge}>
                <View
                  style={[
                    styles.doneDeltaDot,
                    {
                      backgroundColor: (MAC_ORDER as readonly string[]).includes(cat)
                        ? MAC_COLORS[cat as MacCategory]
                        : colors.accentLight,
                    },
                  ]}
                />
                <Text style={styles.doneDeltaCat}>
                  {cat.charAt(0).toUpperCase() + cat.slice(1)}
                </Text>
                <Text style={[styles.doneDeltaValue, { color: colors.success }]}>
                  +{(Math.round(amount * 10) / 10).toFixed(1)}
                </Text>
              </View>
            ))}
          </View>
          <View style={styles.doneDeltaBottomRow}>
            {MAC_DELTAS.slice(2).map(({ cat, amount }) => (
              <View key={cat} style={styles.doneDeltaBadge}>
                <View
                  style={[
                    styles.doneDeltaDot,
                    {
                      backgroundColor: (MAC_ORDER as readonly string[]).includes(cat)
                        ? MAC_COLORS[cat as MacCategory]
                        : colors.accentLight,
                    },
                  ]}
                />
                <Text style={styles.doneDeltaCat}>
                  {cat.charAt(0).toUpperCase() + cat.slice(1)}
                </Text>
                <Text style={[styles.doneDeltaValue, { color: colors.success }]}>
                  +{(Math.round(amount * 10) / 10).toFixed(1)}
                </Text>
              </View>
            ))}
          </View>
        </Animated.View>

        {/* Continue */}
        <Animated.View style={{ opacity: doneAnim4, marginTop: spacing.sm }}>
          <TouchableOpacity
            style={styles.primaryBtn}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              router.push('/(onboarding)/tutorial' as any);
            }}
          >
            <Text style={styles.primaryBtnText}>Continue</Text>
          </TouchableOpacity>
        </Animated.View>

      </View>
    </SafeAreaView>
  );
}

// Exact copies of the styles from lesson/[id].tsx done phase.
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
  },
  trophyGlow: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: 'rgba(139, 92, 246, 0.08)',
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    borderWidth: 1,
    borderColor: 'rgba(167, 139, 250, 0.15)',
  },
  doneTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: colors.textPrimary,
    marginTop: spacing.lg,
  },
  doneSub: {
    fontSize: 14,
    color: colors.textSecondary,
    marginTop: spacing.sm,
    marginBottom: spacing.lg,
  },
  doneDeltaRow: {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    justifyContent: 'center' as const,
    gap: 10,
    marginBottom: spacing.lg,
  },
  doneDeltaCol: {
    alignItems: 'center' as const,
    gap: 10,
    marginBottom: spacing.lg,
  },
  doneDeltaTopRow: {
    flexDirection: 'row' as const,
    gap: 10,
  },
  doneDeltaBottomRow: {
    flexDirection: 'row' as const,
    justifyContent: 'center' as const,
  },
  doneDeltaBadge: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 6,
    backgroundColor: colors.surface,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: colors.border,
  },
  doneDeltaDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  doneDeltaCat: {
    fontSize: 13,
    fontWeight: '500' as const,
    color: colors.textSecondary,
  },
  doneDeltaValue: {
    fontSize: 14,
    fontWeight: '700' as const,
  },
  primaryBtn: {
    backgroundColor: colors.accent,
    borderRadius: 14,
    paddingVertical: 16,
    paddingHorizontal: 48,
    alignItems: 'center',
    minWidth: 200,
    marginTop: spacing.sm,
  },
  primaryBtnText: {
    color: colors.white,
    fontSize: 16,
    fontWeight: '700',
  },
});
