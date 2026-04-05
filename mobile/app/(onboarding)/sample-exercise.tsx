import { useState, useEffect, useRef, useCallback } from 'react';
import {
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  Animated,
  Easing,
  Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { setAudioModeAsync, useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { ProgressBar } from '@/components/onboarding/ProgressBar';
import { colors, spacing } from '@/lib/theme';

const TOTAL_STEPS = 6;
const RATINGS = [1, 2, 3, 4, 5];
const { width: SCREEN_W } = Dimensions.get('window');

// ---------------------------------------------------------------------------
// PLACEHOLDER: Replace with Coach Grant's MP3 URLs.
// Upload to Supabase storage 'lesson-audio/onboarding/', paste URLs below.
// When non-null, audio plays and bars animate; when null, timer-based.
// ---------------------------------------------------------------------------
const SCENE_AUDIO_URL: string | null = null;
const FOCUS_AUDIO_URL: string | null = null;

const SCENE_LINES = [
  'Think of a real moment where you need to perform.',
  'A race. A rep. A tryout.',
  'Put yourself there.',
  'Feel the environment around you.',
];
const SCENE_LINE_MS = 2500;

const SCATTER_WORDS = [
  { word: 'Doubt', x: 0.12, y: 0.10 },
  { word: 'Crowd', x: 0.62, y: 0.20 },
  { word: 'Legs', x: 0.18, y: 0.50 },
  { word: 'Time', x: 0.68, y: 0.42 },
  { word: 'Rival', x: 0.40, y: 0.72 },
];

const CUES = ['Stay loose', 'One step at a time', 'Trust the work', 'Breathe and go'];
const NUM_BARS = 5;
const BAR_HEIGHTS = [10, 20, 28, 16, 22];

type Step = 'intro' | 'rate-before' | 'scene' | 'focus' | 'cue' | 'rate-after' | 'done';
type FocusPhase = 'scatter' | 'tunnel' | 'release';

export default function SampleExerciseScreen() {
  const router = useRouter();
  const [step, setStep] = useState<Step>('intro');
  const [ratingBefore, setRatingBefore] = useState<number | null>(null);
  const [ratingAfter, setRatingAfter] = useState<number | null>(null);
  const [selectedCue, setSelectedCue] = useState<string | null>(null);
  const [focusPhase, setFocusPhase] = useState<FocusPhase>('scatter');
  const [sceneLineIdx, setSceneLineIdx] = useState(0);
  const sceneTextFade = useRef(new Animated.Value(0)).current;

  // --- Audio bars ---
  const barScales = useRef(
    Array.from({ length: NUM_BARS }, () => new Animated.Value(0.4)),
  ).current;

  const animateBar = useCallback((anim: Animated.Value) => {
    const target = 0.2 + Math.random() * 0.8;
    const duration = 160 + Math.random() * 440;
    Animated.timing(anim, { toValue: target, duration, useNativeDriver: true }).start(
      ({ finished }) => { if (finished) animateBar(anim); },
    );
  }, []);

  const barsActive = step === 'scene' || (step === 'focus' && focusPhase !== 'release');

  useEffect(() => {
    if (!barsActive) {
      barScales.forEach((s) => { s.stopAnimation(); s.setValue(0.4); });
      return;
    }
    barScales.forEach((s) => animateBar(s));
    return () => { barScales.forEach((s) => s.stopAnimation()); };
  }, [barsActive, animateBar, barScales]);

  // --- Audio players (one per narrated section) ---
  const scenePlayer = useAudioPlayer(step === 'scene' ? SCENE_AUDIO_URL : null, {
    updateInterval: 200,
    downloadFirst: false,
  });
  const sceneStatus = useAudioPlayerStatus(scenePlayer);

  const focusPlayer = useAudioPlayer(step === 'focus' ? FOCUS_AUDIO_URL : null, {
    updateInterval: 200,
    downloadFirst: false,
  });
  const focusStatus = useAudioPlayerStatus(focusPlayer);

  useEffect(() => {
    if (step !== 'scene' && step !== 'focus') return;
    void setAudioModeAsync({
      playsInSilentMode: true,
      interruptionMode: 'doNotMix',
      allowsRecording: false,
      shouldPlayInBackground: false,
    });
  }, [step]);

  useEffect(() => {
    if (step !== 'scene' || !SCENE_AUDIO_URL) return;
    if (sceneStatus.isLoaded && !sceneStatus.playing) {
      void scenePlayer.seekTo(0).then(() => scenePlayer.play());
    }
  }, [step, sceneStatus.isLoaded]);

  useEffect(() => {
    if (step !== 'focus' || !FOCUS_AUDIO_URL) return;
    if (focusStatus.isLoaded && !focusStatus.playing) {
      void focusPlayer.seekTo(0).then(() => focusPlayer.play());
    }
  }, [step, focusStatus.isLoaded]);

  // --- Scene timed text ---
  useEffect(() => {
    if (step !== 'scene') return;
    setSceneLineIdx(0);
    sceneTextFade.setValue(0);

    let lineIdx = 0;
    const showLine = () => {
      sceneTextFade.setValue(0);
      setSceneLineIdx(lineIdx);
      Animated.timing(sceneTextFade, { toValue: 1, duration: 400, useNativeDriver: true }).start();
    };

    showLine();
    const interval = setInterval(() => {
      lineIdx++;
      if (lineIdx >= SCENE_LINES.length) {
        clearInterval(interval);
        setTimeout(() => setStep('focus'), 1500);
        return;
      }
      Animated.timing(sceneTextFade, { toValue: 0, duration: 250, useNativeDriver: true }).start(() => {
        showLine();
      });
    }, SCENE_LINE_MS);

    return () => clearInterval(interval);
  }, [step]);

  // --- Focus animation refs ---
  const wordOpacities = useRef(SCATTER_WORDS.map(() => new Animated.Value(0))).current;
  const wordDrifts = useRef(SCATTER_WORDS.map(() => new Animated.Value(0))).current;
  const circleScale = useRef(new Animated.Value(2.5)).current;
  const circleOpacity = useRef(new Animated.Value(0)).current;
  const releaseOpacity = useRef(new Animated.Value(0)).current;
  const pulseScale = useRef(new Animated.Value(1)).current;
  const labelOpacity = useRef(new Animated.Value(0)).current;

  const runFocusSequence = useCallback(() => {
    setFocusPhase('scatter');

    Animated.stagger(300, wordOpacities.map((o) =>
      Animated.timing(o, { toValue: 1, duration: 500, useNativeDriver: true }),
    )).start();

    wordDrifts.forEach((d) => {
      const drift = () => {
        Animated.sequence([
          Animated.timing(d, { toValue: Math.random() * 8 - 4, duration: 2000 + Math.random() * 1000, useNativeDriver: true, easing: Easing.inOut(Easing.ease) }),
          Animated.timing(d, { toValue: Math.random() * 8 - 4, duration: 2000 + Math.random() * 1000, useNativeDriver: true, easing: Easing.inOut(Easing.ease) }),
        ]).start(({ finished }) => { if (finished) drift(); });
      };
      drift();
    });

    const tunnelTimer = setTimeout(() => {
      setFocusPhase('tunnel');
      Animated.parallel([
        ...wordOpacities.map((o) =>
          Animated.timing(o, { toValue: 0.08, duration: 1200, useNativeDriver: true }),
        ),
        Animated.timing(circleOpacity, { toValue: 1, duration: 600, useNativeDriver: true }),
        Animated.timing(circleScale, { toValue: 1, duration: 2500, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(labelOpacity, { toValue: 1, duration: 800, delay: 600, useNativeDriver: true }),
      ]).start();
      const pulseLoop = () => {
        Animated.sequence([
          Animated.timing(pulseScale, { toValue: 1.08, duration: 1500, useNativeDriver: true, easing: Easing.inOut(Easing.ease) }),
          Animated.timing(pulseScale, { toValue: 1, duration: 1500, useNativeDriver: true, easing: Easing.inOut(Easing.ease) }),
        ]).start(({ finished }) => { if (finished) pulseLoop(); });
      };
      setTimeout(pulseLoop, 2500);
    }, 6000);

    const releaseTimer = setTimeout(() => {
      setFocusPhase('release');
      Animated.parallel([
        Animated.timing(circleOpacity, { toValue: 0, duration: 800, useNativeDriver: true }),
        Animated.timing(labelOpacity, { toValue: 0, duration: 400, useNativeDriver: true }),
        Animated.timing(releaseOpacity, { toValue: 1, duration: 600, delay: 400, useNativeDriver: true }),
      ]).start();
    }, 16000);

    const advanceTimer = setTimeout(() => setStep('cue'), 20000);

    return () => {
      clearTimeout(tunnelTimer);
      clearTimeout(releaseTimer);
      clearTimeout(advanceTimer);
      wordOpacities.forEach((o) => o.stopAnimation());
      wordDrifts.forEach((d) => d.stopAnimation());
      circleScale.stopAnimation();
      circleOpacity.stopAnimation();
      pulseScale.stopAnimation();
      releaseOpacity.stopAnimation();
      labelOpacity.stopAnimation();
    };
  }, []);

  useEffect(() => {
    if (step !== 'focus') return;
    circleScale.setValue(2.5);
    circleOpacity.setValue(0);
    releaseOpacity.setValue(0);
    labelOpacity.setValue(0);
    pulseScale.setValue(1);
    wordOpacities.forEach((o) => o.setValue(0));
    wordDrifts.forEach((d) => d.setValue(0));
    return runFocusSequence();
  }, [step]);

  const FOCUS_SIZE = SCREEN_W - spacing.xl * 2;

  const audioBars = (
    <View style={styles.audioCue}>
      {barScales.map((scaleAnim, i) => (
        <Animated.View
          key={i}
          style={[
            styles.audioCueBar,
            {
              height: BAR_HEIGHTS[i],
              backgroundColor: colors.accentLight,
              transform: [{ scaleY: scaleAnim }],
            },
          ]}
        />
      ))}
    </View>
  );

  // -----------------------------------------------------------------------
  // Render helpers
  // -----------------------------------------------------------------------

  const renderIntro = () => (
    <View style={styles.topSection}>
      <Text style={styles.badge}>SAMPLE EXERCISE</Text>
      <Text style={styles.title}>The Tunnel</Text>
      <Text style={styles.body}>
        Under pressure your mind scatters. This exercise teaches you to narrow your focus — not by fighting the noise, but by choosing where your attention goes.
      </Text>
      <View style={styles.exerciseCard}>
        <Text style={styles.exerciseTitle}>Pressure-to-Focus Reset</Text>
        <Text style={styles.exerciseMeta}>~45 seconds</Text>
      </View>
    </View>
  );

  const renderRateBefore = () => (
    <View style={styles.topSection}>
      <Text style={styles.title}>How scattered does your mind feel right now?</Text>
      <Text style={styles.body}>1 = totally clear, 5 = all over the place</Text>
      <View style={styles.ratingRow}>
        {RATINGS.map((r) => (
          <TouchableOpacity
            key={r}
            style={[styles.ratingBtn, ratingBefore === r && styles.ratingBtnActive]}
            onPress={() => setRatingBefore(r)}
          >
            <Text style={[styles.ratingText, ratingBefore === r && styles.ratingTextActive]}>{r}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );

  const renderScene = () => (
    <View style={styles.sceneSection}>
      {audioBars}
      <Animated.Text style={[styles.sceneLine, { opacity: sceneTextFade }]}>
        {SCENE_LINES[sceneLineIdx]}
      </Animated.Text>
    </View>
  );

  const renderFocus = () => (
    <View style={styles.focusSection}>
      {barsActive && audioBars}
      <Text style={styles.focusLabel}>
        {focusPhase === 'scatter'
          ? 'This is your mind under pressure.'
          : focusPhase === 'tunnel'
          ? 'Now narrow.'
          : ''}
      </Text>
      <View style={[styles.focusContainer, { width: FOCUS_SIZE, height: FOCUS_SIZE }]}>
        {SCATTER_WORDS.map((w, i) => (
          <Animated.Text
            key={w.word}
            style={[
              styles.scatterWord,
              {
                left: w.x * (FOCUS_SIZE - 60),
                top: w.y * (FOCUS_SIZE - 30),
                opacity: wordOpacities[i],
                transform: [{ translateY: wordDrifts[i] }],
              },
            ]}
          >
            {w.word}
          </Animated.Text>
        ))}
        <Animated.View
          style={[
            styles.tunnelCircleOuter,
            { opacity: circleOpacity, transform: [{ scale: Animated.multiply(circleScale, pulseScale) }] },
          ]}
        />
        <Animated.View
          style={[
            styles.tunnelCircleInner,
            { opacity: circleOpacity, transform: [{ scale: Animated.multiply(circleScale, pulseScale) }] },
          ]}
        />
        <Animated.View style={[styles.tunnelCenter, { opacity: labelOpacity }]}>
          <Text style={styles.tunnelCenterText}>Focus{'\n'}here</Text>
        </Animated.View>
        <Animated.Text style={[styles.releaseText, { opacity: releaseOpacity }]}>
          {"That's the skill.\nNot silence. Not calm.\nJust choosing where\nyour attention goes."}
        </Animated.Text>
      </View>
    </View>
  );

  const renderCue = () => (
    <View style={styles.topSection}>
      <Text style={styles.title}>Pick one performance cue</Text>
      <Text style={styles.body}>
        {"You just narrowed your focus under pressure. Now choose one thought to carry forward."}
      </Text>
      <View style={styles.cueList}>
        {CUES.map((c) => (
          <TouchableOpacity
            key={c}
            style={[styles.cueBtn, selectedCue === c && styles.cueBtnActive]}
            onPress={() => setSelectedCue(c)}
          >
            <Text style={[styles.cueText, selectedCue === c && styles.cueTextActive]}>{c}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );

  const renderRateAfter = () => (
    <View style={styles.topSection}>
      <Text style={styles.title}>How scattered does your mind feel now?</Text>
      <Text style={styles.body}>1 = totally clear, 5 = all over the place</Text>
      <View style={styles.ratingRow}>
        {RATINGS.map((r) => (
          <TouchableOpacity
            key={r}
            style={[styles.ratingBtn, ratingAfter === r && styles.ratingBtnActive]}
            onPress={() => setRatingAfter(r)}
          >
            <Text style={[styles.ratingText, ratingAfter === r && styles.ratingTextActive]}>{r}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );

  const renderDone = () => {
    const improved = ratingBefore && ratingAfter && ratingAfter < ratingBefore;
    const same = ratingBefore && ratingAfter && ratingAfter === ratingBefore;
    return (
      <View style={styles.topSection}>
        <Text style={styles.badge}>EXERCISE COMPLETE</Text>
        <Text style={styles.title}>
          {improved
            ? 'You just narrowed your tunnel.'
            : same
            ? 'You held your focus.'
            : 'You practiced the skill.'}
        </Text>
        <Text style={styles.body}>
          {improved
            ? `You went from a ${ratingBefore} to a ${ratingAfter}. That shift is real — and it's trainable.`
            : same
            ? 'Maintaining focus under noise is the whole game. You just did it.'
            : 'Awareness comes first. The narrowing gets sharper with every rep.'}
        </Text>
        <View style={styles.doneCard}>
          <Text style={styles.doneCardTitle}>This is mental performance training</Text>
          <Text style={styles.doneCardBody}>
            Short, focused exercises that build the three skills elite athletes actually use: Mindfulness, Acceptance, and Commitment.
          </Text>
        </View>
      </View>
    );
  };

  const getContent = () => {
    switch (step) {
      case 'intro': return renderIntro();
      case 'rate-before': return renderRateBefore();
      case 'scene': return renderScene();
      case 'focus': return renderFocus();
      case 'cue': return renderCue();
      case 'rate-after': return renderRateAfter();
      case 'done': return renderDone();
    }
  };

  const canAdvance = () => {
    switch (step) {
      case 'intro': return true;
      case 'rate-before': return ratingBefore !== null;
      case 'scene': return false;
      case 'focus': return false;
      case 'cue': return selectedCue !== null;
      case 'rate-after': return ratingAfter !== null;
      case 'done': return true;
    }
  };

  const showButton = step !== 'focus' && step !== 'scene';

  const advance = () => {
    const order: Step[] = ['intro', 'rate-before', 'scene', 'focus', 'cue', 'rate-after', 'done'];
    const idx = order.indexOf(step);
    if (step === 'done') {
      router.push('/(onboarding)/what-you-get');
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
      <ProgressBar step={4} total={TOTAL_STEPS} />
      <View style={styles.inner}>
        {getContent()}

        {showButton && (
          <View style={styles.bottomSection}>
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

  audioCue: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    height: 34,
    marginBottom: spacing.lg,
  },
  audioCueBar: { width: 3, borderRadius: 1.5 },

  sceneSection: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  sceneLine: {
    fontSize: 22,
    fontWeight: '600',
    color: colors.textPrimary,
    textAlign: 'center',
    lineHeight: 32,
    paddingHorizontal: spacing.md,
  },

  ratingRow: { flexDirection: 'row', justifyContent: 'center', gap: 12 },
  ratingBtn: {
    width: 52,
    height: 52,
    borderRadius: 26,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ratingBtnActive: { borderColor: colors.accent, backgroundColor: colors.accentSubtle },
  ratingText: { fontSize: 20, fontWeight: '700', color: colors.textMuted },
  ratingTextActive: { color: colors.accentLight },

  focusSection: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  focusLabel: {
    fontSize: 15,
    color: colors.textSecondary,
    marginBottom: spacing.md,
    textAlign: 'center',
    lineHeight: 22,
  },
  focusContainer: { position: 'relative', alignItems: 'center', justifyContent: 'center' },
  scatterWord: {
    position: 'absolute',
    fontSize: 18,
    fontWeight: '600',
    color: colors.textMuted,
    letterSpacing: 1,
  },
  tunnelCircleOuter: {
    position: 'absolute',
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: 'rgba(139, 92, 246, 0.12)',
  },
  tunnelCircleInner: {
    position: 'absolute',
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(139, 92, 246, 0.25)',
  },
  tunnelCenter: {
    position: 'absolute',
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tunnelCenterText: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.white,
    textAlign: 'center',
    lineHeight: 14,
  },
  releaseText: {
    position: 'absolute',
    fontSize: 17,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 28,
  },

  doneCard: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    marginTop: spacing.xl,
  },
  doneCardTitle: { fontSize: 15, fontWeight: '700', color: colors.white, marginBottom: spacing.sm },
  doneCardBody: { fontSize: 14, color: colors.textSecondary, lineHeight: 21 },

  cueList: { gap: 10 },
  cueBtn: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingHorizontal: 20,
    paddingVertical: 14,
    alignItems: 'center',
  },
  cueBtnActive: { borderColor: colors.accent, backgroundColor: colors.accentSubtle },
  cueText: { fontSize: 15, fontWeight: '600', color: colors.textSecondary },
  cueTextActive: { color: colors.accentLight },

  bottomSection: { paddingBottom: spacing.xl },
  button: {
    backgroundColor: colors.accent,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
  },
  buttonDisabled: { opacity: 0.4 },
  buttonText: { color: colors.white, fontSize: 16, fontWeight: '700' },
});
