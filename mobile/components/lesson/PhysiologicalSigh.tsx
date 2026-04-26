import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { colors, spacing } from '@/lib/theme';
import MacAlternatingRing from '@/components/lesson/MacAlternatingRing';

type PhaseCues = {
  first_inhale: string;
  sneak_inhale: string;
  exhale: string;
};

type Props = {
  firstInhaleSeconds: number;
  sneakInhaleSeconds: number;
  exhaleSeconds: number;
  phaseCues: PhaseCues;
  doneLabel: string;
  catColor: string;
  accentColors?: string[];
  suspendForBackground?: boolean;
  onComplete: (collectedText: string) => void;
};

type Phase = 'first_inhale' | 'sneak_inhale' | 'exhale';

const PHASE_LABEL: Record<Phase, string> = {
  first_inhale: 'First Inhale',
  sneak_inhale: 'Sneak Inhale',
  exhale: 'Exhale',
};

function firePhaseHaptic(phase: Phase): void {
  const style = phase === 'exhale'
    ? Haptics.ImpactFeedbackStyle.Light
    : Haptics.ImpactFeedbackStyle.Medium;
  void Haptics.impactAsync(style);
}

export default function PhysiologicalSigh({
  firstInhaleSeconds,
  sneakInhaleSeconds,
  exhaleSeconds,
  phaseCues,
  doneLabel,
  catColor,
  accentColors,
  suspendForBackground = false,
  onComplete,
}: Props) {
  const [phase, setPhase] = useState<Phase>('first_inhale');
  const scale = useRef(new Animated.Value(0)).current;
  const cueFade = useRef(new Animated.Value(1)).current;
  const stoppedRef = useRef(false);
  const pendingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const resumePhaseRef = useRef<Phase>('first_inhale');

  const phaseDurations = useMemo(
    () => ({
      first_inhale: Math.max(0.1, firstInhaleSeconds) * 1000,
      sneak_inhale: Math.max(0.1, sneakInhaleSeconds) * 1000,
      exhale: Math.max(0.1, exhaleSeconds) * 1000,
    }),
    [firstInhaleSeconds, sneakInhaleSeconds, exhaleSeconds],
  );

  useEffect(() => {
    resumePhaseRef.current = phase;
  }, [phase]);

  useEffect(() => {
    return () => {
      stoppedRef.current = true;
      if (pendingTimeoutRef.current) clearTimeout(pendingTimeoutRef.current);
      scale.stopAnimation();
      cueFade.stopAnimation();
    };
  }, [cueFade, scale]);

  useEffect(() => {
    if (suspendForBackground) {
      if (pendingTimeoutRef.current) {
        clearTimeout(pendingTimeoutRef.current);
        pendingTimeoutRef.current = null;
      }
      scale.stopAnimation();
      cueFade.stopAnimation();
    }
  }, [cueFade, scale, suspendForBackground]);

  useEffect(() => {
    if (suspendForBackground) return;
    stoppedRef.current = false;

    const runPhase = (nextPhase: Phase) => {
      if (stoppedRef.current || suspendForBackground) return;
      setPhase(nextPhase);
      firePhaseHaptic(nextPhase);
      cueFade.setValue(0);
      Animated.timing(cueFade, { toValue: 1, duration: 180, useNativeDriver: true }).start();

      const toValue = nextPhase === 'exhale' ? 0 : nextPhase === 'first_inhale' ? 0.82 : 1;
      Animated.timing(scale, {
        toValue,
        duration: phaseDurations[nextPhase],
        useNativeDriver: true,
      }).start();

      pendingTimeoutRef.current = setTimeout(() => {
        const following: Phase =
          nextPhase === 'first_inhale'
            ? 'sneak_inhale'
            : nextPhase === 'sneak_inhale'
              ? 'exhale'
              : 'first_inhale';
        runPhase(following);
      }, phaseDurations[nextPhase]);
    };

    runPhase(resumePhaseRef.current);
    return () => {
      if (pendingTimeoutRef.current) {
        clearTimeout(pendingTimeoutRef.current);
        pendingTimeoutRef.current = null;
      }
    };
  }, [cueFade, phaseDurations, scale, suspendForBackground]);

  const animatedCircleStyle = {
    transform: [
      {
        scale: scale.interpolate({
          inputRange: [0, 1],
          outputRange: [0.72, 1],
        }),
      },
    ],
    borderColor: catColor,
  };

  return (
    <View style={styles.container}>
      <View style={styles.circleWrap}>
        {accentColors && accentColors.length > 1 ? (
          <MacAlternatingRing size={224} strokeWidth={4} colors={accentColors} />
        ) : null}
        <Animated.View
          style={[
            styles.circle,
            animatedCircleStyle,
            accentColors && accentColors.length > 1 ? styles.circleMulti : null,
          ]}
        />
      </View>

      <Animated.View style={[styles.card, { borderColor: catColor, opacity: cueFade }]}>
        <Text style={[styles.phaseLabel, { color: catColor }]}>{PHASE_LABEL[phase]}</Text>
        <Text style={styles.cueText}>{phaseCues[phase]}</Text>
      </Animated.View>

      <TouchableOpacity
        style={styles.btn}
        activeOpacity={0.85}
        onPress={() => onComplete('')}
      >
        <Text style={styles.btnText}>{doneLabel}</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.lg,
  },
  circleWrap: {
    width: 224,
    height: 224,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xl,
  },
  circle: {
    position: 'absolute',
    width: 204,
    height: 204,
    borderRadius: 102,
    borderWidth: 3,
    backgroundColor: colors.surface,
    shadowColor: colors.accent,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.22,
    shadowRadius: 24,
    elevation: 8,
  },
  circleMulti: {
    borderWidth: 1,
  },
  card: {
    width: '100%',
    backgroundColor: colors.surface,
    borderRadius: 20,
    borderWidth: 1,
    borderTopWidth: 2,
    paddingVertical: 26,
    paddingHorizontal: spacing.xl,
    marginBottom: spacing.xl,
  },
  phaseLabel: {
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    textAlign: 'center',
    marginBottom: spacing.sm,
  },
  cueText: {
    color: colors.textPrimary,
    fontSize: 20,
    fontWeight: '600',
    lineHeight: 30,
    textAlign: 'center',
  },
  btn: {
    backgroundColor: colors.accent,
    borderRadius: 14,
    paddingVertical: 16,
    paddingHorizontal: 48,
    alignItems: 'center',
    minWidth: 200,
  },
  btnText: { color: colors.white, fontSize: 16, fontWeight: '700' },
});
