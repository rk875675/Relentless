import { useRef, useEffect } from 'react';
import { Animated, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { ProgressBar } from '@/components/onboarding/ProgressBar';
import { getMacPillarForTag } from '@/lib/mac-pillar-onboarding';
import { ONBOARDING_PROGRESS, ONBOARDING_TOTAL_STEPS } from '@/lib/onboarding-progress';
import { colors, spacing } from '@/lib/theme';
import { useOnboardingPopWithFade } from '@/lib/use-onboarding-pop-with-fade';

export default function WeCanTrainScreen() {
  const router = useRouter();
  const { tag } = useLocalSearchParams<{ tag?: string }>();
  const content = getMacPillarForTag(tag);

  const fade = useRef(new Animated.Value(0)).current;
  const cardScale = useRef(new Animated.Value(0.94)).current;
  const cardFade = useRef(new Animated.Value(0)).current;
  const { shellTranslateX, panHandlers, onPop } = useOnboardingPopWithFade();

  useEffect(() => {
    Animated.timing(fade, { toValue: 1, duration: 380, useNativeDriver: true }).start();
    // Card springs in slightly after the headline
    const delay = setTimeout(() => {
      Animated.parallel([
        Animated.timing(cardFade, { toValue: 1, duration: 340, useNativeDriver: true }),
        Animated.spring(cardScale, { toValue: 1, friction: 7, tension: 80, useNativeDriver: true }),
      ]).start();
    }, 160);
    return () => clearTimeout(delay);
  }, []);

  return (
    <SafeAreaView style={styles.container}>
      <ProgressBar
        step={ONBOARDING_PROGRESS.macDetail}
        total={ONBOARDING_TOTAL_STEPS}
        onBack={onPop}
      />
      <View style={styles.flex} {...panHandlers}>
        <Animated.View style={[styles.inner, { opacity: fade, transform: [{ translateX: shellTranslateX }] }]}>

          <View style={styles.topSpacer} />

          <View style={styles.contentGroup}>
            {/* Headline cluster */}
            <View style={styles.headlineCluster}>
              <Text style={styles.headline}>We can train this.</Text>
              <Text style={styles.subheadline}>
                Short daily sessions built on the MAC framework — used by elite sport psychologists.
              </Text>
            </View>

          {/* Pillar card */}
          <Animated.View
            style={[
              styles.pillarCard,
              { borderColor: content.color + '35', transform: [{ scale: cardScale }], opacity: cardFade },
            ]}
          >
            {/* Colored top accent bar */}
            <View style={[styles.topBar, { backgroundColor: content.color }]} />

            <View style={styles.cardBody}>
              {/* Badge + name row */}
              <View style={styles.badgeRow}>
                <View style={[styles.glowWrap, { shadowColor: content.color }]}>
                  <View style={[styles.badge, { borderColor: content.color, backgroundColor: content.color + '18' }]}>
                    <Text style={[styles.badgeLetter, { color: content.color }]}>{content.letter}</Text>
                  </View>
                </View>
                <View style={styles.nameBlock}>
                  <Text style={styles.focusLabel}>Your focus area</Text>
                  <Text style={[styles.pillarName, { color: content.color }]}>{content.name}</Text>
                </View>
              </View>

              {/* Divider */}
              <View style={[styles.divider, { backgroundColor: content.color + '25' }]} />

              {/* Tagline + body (first sentence only) */}
              <Text style={[styles.tagline, { color: content.color }]}>{content.tagline}</Text>
              <Text style={styles.body}>{content.body.split('. ')[0]}.</Text>
            </View>
          </Animated.View>
          </View>{/* end contentGroup */}

          {/* CTA */}
          <View style={styles.bottom}>
            <TouchableOpacity
              style={styles.button}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                router.push('/(onboarding)/tutorial' as any);
              }}
            >
              <Text style={styles.buttonText}>See How It Works</Text>
            </TouchableOpacity>
          </View>

        </Animated.View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },
  inner: {
    flex: 1,
    flexDirection: 'column',
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.lg,
    paddingBottom: spacing.xl,
  },

  topSpacer: { flex: 2 },
  contentGroup: { flex: 7 },

  headlineCluster: {
    alignItems: 'center',
    marginBottom: spacing.xl,
  },
  headline: {
    fontSize: 30,
    fontWeight: '800',
    color: colors.white,
    lineHeight: 40,
    textAlign: 'center',
    marginBottom: spacing.sm,
  },
  subheadline: {
    fontSize: 15,
    color: colors.textSecondary,
    lineHeight: 22,
    textAlign: 'center',
  },

  // Pillar card
  pillarCard: {
    backgroundColor: colors.surface,
    borderRadius: 20,
    borderWidth: 1,
    overflow: 'hidden',
    marginBottom: spacing.xl,
  },
  topBar: {
    height: 4,
    width: '100%',
  },
  cardBody: {
    padding: spacing.xl,
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
    marginBottom: spacing.lg,
  },
  glowWrap: {
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 6,
  },
  badge: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeLetter: {
    fontSize: 17,
    fontWeight: '900',
  },
  nameBlock: {
    flex: 1,
  },
  focusLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.textMuted,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  pillarName: {
    fontSize: 24,
    fontWeight: '800',
    lineHeight: 30,
  },
  divider: {
    height: 1,
    width: '100%',
    marginBottom: spacing.lg,
  },
  tagline: {
    fontSize: 17,
    fontWeight: '700',
    lineHeight: 25,
    marginBottom: spacing.md,
  },
  body: {
    fontSize: 15,
    color: colors.textSecondary,
    lineHeight: 23,
  },

  bottom: { paddingTop: spacing.xl },
  button: {
    backgroundColor: colors.accent,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
  },
  buttonText: { color: colors.white, fontSize: 16, fontWeight: '700' },
});
