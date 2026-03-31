import { useState, useEffect, useRef } from 'react';
import {
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  Animated,
  Easing,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { colors, spacing } from '@/lib/theme';

const RATINGS = [1, 2, 3, 4, 5];
const FEELINGS = ['Nerves', 'Doubt', 'Pressure', 'Overthinking'];
const CUES = ['Stay loose', 'One step at a time', 'Trust the work', 'Breathe and go'];
const BREATH_COUNT = 5;

type Step = 'intro' | 'rate-before' | 'breathe' | 'feelings' | 'cue' | 'rate-after' | 'done';

export default function SampleExerciseScreen() {
  const router = useRouter();
  const [step, setStep] = useState<Step>('intro');
  const [ratingBefore, setRatingBefore] = useState<number | null>(null);
  const [ratingAfter, setRatingAfter] = useState<number | null>(null);
  const [selectedFeelings, setSelectedFeelings] = useState<string[]>([]);
  const [selectedCue, setSelectedCue] = useState<string | null>(null);
  const [breathIndex, setBreathIndex] = useState(0);

  const scale = useRef(new Animated.Value(1)).current;
  const opacity = useRef(new Animated.Value(0.4)).current;
  const [breathPhase, setBreathPhase] = useState<'in' | 'out'>('in');

  useEffect(() => {
    if (step !== 'breathe') return;

    let cancelled = false;
    let currentBreath = 0;

    const runBreath = () => {
      if (cancelled || currentBreath >= BREATH_COUNT) {
        if (!cancelled) setStep('feelings');
        return;
      }
      setBreathIndex(currentBreath + 1);
      setBreathPhase('in');

      Animated.sequence([
        Animated.parallel([
          Animated.timing(scale, {
            toValue: 1.6,
            duration: 3200,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(opacity, {
            toValue: 1,
            duration: 3200,
            useNativeDriver: true,
          }),
        ]),
        Animated.parallel([
          Animated.timing(scale, {
            toValue: 1,
            duration: 3800,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(opacity, {
            toValue: 0.4,
            duration: 3800,
            useNativeDriver: true,
          }),
        ]),
      ]).start(() => {
        if (!cancelled) setBreathPhase('out');
        currentBreath++;
        runBreath();
      });
    };

    runBreath();
    return () => { cancelled = true; };
  }, [step, scale, opacity]);

  const toggleFeeling = (f: string) => {
    setSelectedFeelings((prev) =>
      prev.includes(f) ? prev.filter((x) => x !== f) : [...prev, f],
    );
  };

  const renderIntro = () => (
    <View style={styles.topSection}>
      <Text style={styles.badge}>SAMPLE EXERCISE</Text>
      <Text style={styles.title}>Try one short exercise</Text>
      <Text style={styles.body}>
        This is the kind of mental workout you will get inside Relentless.
        Short, practical, and built for athletes.
      </Text>
      <View style={styles.exerciseCard}>
        <Text style={styles.exerciseTitle}>Reset Under Pressure</Text>
        <Text style={styles.exerciseMeta}>~60 seconds</Text>
      </View>
    </View>
  );

  const renderRateBefore = () => (
    <View style={styles.topSection}>
      <Text style={styles.title}>How locked up do you feel right now?</Text>
      <Text style={styles.body}>1 = totally relaxed, 5 = very tense</Text>
      <View style={styles.ratingRow}>
        {RATINGS.map((r) => (
          <TouchableOpacity
            key={r}
            style={[styles.ratingBtn, ratingBefore === r && styles.ratingBtnActive]}
            onPress={() => setRatingBefore(r)}
          >
            <Text style={[styles.ratingText, ratingBefore === r && styles.ratingTextActive]}>
              {r}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );

  const renderBreathe = () => (
    <View style={styles.breatheSection}>
      <Text style={styles.breathCount}>{breathIndex} / {BREATH_COUNT}</Text>
      <View style={styles.breatheCircleWrap}>
        {/* Outermost glow ring */}
        <Animated.View
          style={[
            styles.ringOuter,
            { transform: [{ scale }], opacity: opacity.interpolate({
              inputRange: [0.4, 1],
              outputRange: [0.08, 0.2],
            }) },
          ]}
        />
        {/* Middle ring */}
        <Animated.View
          style={[
            styles.ringMid,
            { transform: [{ scale }], opacity: opacity.interpolate({
              inputRange: [0.4, 1],
              outputRange: [0.15, 0.4],
            }) },
          ]}
        />
        {/* Core orb */}
        <Animated.View
          style={[
            styles.ringCore,
            { transform: [{ scale }], opacity },
          ]}
        />
        {/* Center label */}
        <View style={styles.breatheCenter}>
          <Text style={styles.breathePhaseText}>
            {breathPhase === 'in' ? 'Breathe in' : 'Breathe out'}
          </Text>
        </View>
      </View>
      <Text style={styles.breatheHint}>Slow, deep breaths</Text>
    </View>
  );

  const renderFeelings = () => (
    <View style={styles.topSection}>
      <Text style={styles.title}>{"What's here right now?"}</Text>
      <Text style={styles.body}>
        {"Don't fight it. Just notice what's present."}
      </Text>
      <View style={styles.chipRow}>
        {FEELINGS.map((f) => (
          <TouchableOpacity
            key={f}
            style={[styles.chip, selectedFeelings.includes(f) && styles.chipActive]}
            onPress={() => toggleFeeling(f)}
          >
            <Text style={[styles.chipText, selectedFeelings.includes(f) && styles.chipTextActive]}>
              {f}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );

  const renderCue = () => (
    <View style={styles.topSection}>
      <Text style={styles.title}>Pick one performance cue</Text>
      <Text style={styles.body}>
        {"Let the feeling be there. Now choose one simple thought to carry forward."}
      </Text>
      <View style={styles.cueList}>
        {CUES.map((c) => (
          <TouchableOpacity
            key={c}
            style={[styles.cueBtn, selectedCue === c && styles.cueBtnActive]}
            onPress={() => setSelectedCue(c)}
          >
            <Text style={[styles.cueText, selectedCue === c && styles.cueTextActive]}>
              {c}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );

  const renderRateAfter = () => (
    <View style={styles.topSection}>
      <Text style={styles.title}>How do you feel now?</Text>
      <Text style={styles.body}>1 = totally relaxed, 5 = very tense</Text>
      <View style={styles.ratingRow}>
        {RATINGS.map((r) => (
          <TouchableOpacity
            key={r}
            style={[styles.ratingBtn, ratingAfter === r && styles.ratingBtnActive]}
            onPress={() => setRatingAfter(r)}
          >
            <Text style={[styles.ratingText, ratingAfter === r && styles.ratingTextActive]}>
              {r}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );

  const renderDone = () => {
    const improved = ratingBefore && ratingAfter && ratingAfter < ratingBefore;
    return (
      <View style={styles.topSection}>
        <Text style={styles.badge}>EXERCISE COMPLETE</Text>
        <Text style={styles.title}>
          {improved ? 'Nice. You just shifted your state.' : 'That was a reset.'}
        </Text>
        <Text style={styles.body}>
          {improved
            ? `You went from a ${ratingBefore} to a ${ratingAfter}. Imagine what 30 days of this can do.`
            : 'Every rep builds your mental game. Imagine what 30 days of this can do.'}
        </Text>
      </View>
    );
  };

  const getContent = () => {
    switch (step) {
      case 'intro': return renderIntro();
      case 'rate-before': return renderRateBefore();
      case 'breathe': return renderBreathe();
      case 'feelings': return renderFeelings();
      case 'cue': return renderCue();
      case 'rate-after': return renderRateAfter();
      case 'done': return renderDone();
    }
  };

  const canAdvance = () => {
    switch (step) {
      case 'intro': return true;
      case 'rate-before': return ratingBefore !== null;
      case 'breathe': return false;
      case 'feelings': return selectedFeelings.length > 0;
      case 'cue': return selectedCue !== null;
      case 'rate-after': return ratingAfter !== null;
      case 'done': return true;
    }
  };

  const advance = () => {
    const order: Step[] = ['intro', 'rate-before', 'breathe', 'feelings', 'cue', 'rate-after', 'done'];
    const idx = order.indexOf(step);
    if (step === 'done') {
      router.push('/(onboarding)/competition-date');
    } else if (idx < order.length - 1) {
      setStep(order[idx + 1]);
    }
  };

  const ctaLabel = () => {
    if (step === 'intro') return 'Start exercise';
    if (step === 'done') return 'Continue';
    return 'Next';
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.inner}>
        {getContent()}

        {step !== 'breathe' && (
          <View style={styles.bottomSection}>
            <View style={styles.dots}>
              <View style={styles.dot} />
              <View style={styles.dot} />
              <View style={styles.dot} />
              <View style={[styles.dot, styles.dotActive]} />
              <View style={styles.dot} />
              <View style={styles.dot} />
            </View>
            <TouchableOpacity
              style={[styles.button, !canAdvance() && styles.buttonDisabled]}
              onPress={advance}
              disabled={!canAdvance()}
            >
              <Text style={styles.buttonText}>{ctaLabel()}</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  inner: { flex: 1, justifyContent: 'space-between', paddingHorizontal: spacing.xl },
  topSection: { flex: 1, justifyContent: 'center' },
  badge: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.accentLight,
    letterSpacing: 2,
    marginBottom: spacing.md,
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
    color: colors.white,
    marginBottom: spacing.md,
    lineHeight: 36,
  },
  body: {
    fontSize: 16,
    color: colors.textSecondary,
    lineHeight: 24,
    marginBottom: spacing.lg,
  },
  exerciseCard: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
  },
  exerciseTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.white,
    marginBottom: 4,
  },
  exerciseMeta: { fontSize: 13, color: colors.textMuted },

  ratingRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 12,
  },
  ratingBtn: {
    width: 52,
    height: 52,
    borderRadius: 26,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ratingBtnActive: {
    borderColor: colors.accent,
    backgroundColor: colors.accentSubtle,
  },
  ratingText: { fontSize: 20, fontWeight: '700', color: colors.textMuted },
  ratingTextActive: { color: colors.accentLight },

  breatheSection: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  breathCount: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textMuted,
    marginBottom: 40,
  },
  breatheCircleWrap: {
    width: 260,
    height: 260,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ringOuter: {
    position: 'absolute',
    width: 240,
    height: 240,
    borderRadius: 120,
    backgroundColor: colors.accent,
  },
  ringMid: {
    position: 'absolute',
    width: 180,
    height: 180,
    borderRadius: 90,
    backgroundColor: colors.accent,
  },
  ringCore: {
    position: 'absolute',
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: colors.accent,
  },
  breatheCenter: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1,
  },
  breathePhaseText: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.accentLight,
    textAlign: 'center',
  },
  breatheHint: {
    fontSize: 16,
    color: colors.textSecondary,
    marginTop: 40,
  },

  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  chip: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  chipActive: {
    borderColor: colors.accent,
    backgroundColor: colors.accentSubtle,
  },
  chipText: { fontSize: 14, color: colors.textSecondary },
  chipTextActive: { color: colors.accentLight },

  cueList: { gap: 10 },
  cueBtn: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingHorizontal: 20,
    paddingVertical: 14,
    alignItems: 'center',
  },
  cueBtnActive: {
    borderColor: colors.accent,
    backgroundColor: colors.accentSubtle,
  },
  cueText: { fontSize: 15, fontWeight: '600', color: colors.textSecondary },
  cueTextActive: { color: colors.accentLight },

  bottomSection: { paddingBottom: spacing.xl },
  dots: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
    marginBottom: spacing.lg,
  },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.border },
  dotActive: { backgroundColor: colors.accentLight, width: 24 },
  button: {
    backgroundColor: colors.accent,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
  },
  buttonDisabled: { opacity: 0.4 },
  buttonText: { color: colors.white, fontSize: 16, fontWeight: '700' },
});
