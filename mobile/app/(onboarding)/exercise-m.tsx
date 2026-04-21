import { useState, useEffect, useRef, useCallback } from 'react';
import {
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  Animated,
  Dimensions,
  Easing,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useNavigation } from 'expo-router';
import { setAudioModeAsync, useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { ProgressBar } from '@/components/onboarding/ProgressBar';
import { colors, spacing } from '@/lib/theme';
import { useWizardSwipeBackRight } from '@/lib/use-wizard-swipe-back';

const TOTAL_STEPS = 12;

const SCENE_AUDIO_URL: string | null = null;
const BREATHING_AUDIO_URL: string | null = null;

const SCENE_LINES = [
  'Place your feet flat on the ground.',
  'Let your shoulders drop.',
  'Breathe deep — through your belly, ribs, and chest.',
  'Follow the rhythm.',
];
const SCENE_LINE_MS = 2500;

const NUM_BARS = 5;
const BAR_HEIGHTS = [10, 20, 28, 16, 22];
const PHASE_MS = 4000;
const NUM_ROUNDS = 3;
const PHASES = ['Breathe in', 'Hold', 'Breathe out', 'Hold'] as const;

type Step = 'intro' | 'scene' | 'breathing' | 'done';

export default function ExerciseMScreen() {
  const router = useRouter();
  const navigation = useNavigation();
  const [step, setStep] = useState<Step>('intro');
  const [phaseIdx, setPhaseIdx] = useState(0);
  const [round, setRound] = useState(1);
  const [countdown, setCountdown] = useState(4);

  const [sceneLineIdx, setSceneLineIdx] = useState(0);
  const sceneTextFade = useRef(new Animated.Value(0)).current;
  const stepRef = useRef<Step>(step);
  stepRef.current = step;
  const shellTranslateX = useRef(new Animated.Value(0)).current;
  const backingRef = useRef(false);

  const runExerciseBack = useCallback(() => {
    const s = stepRef.current;
    if (s === 'intro') {
      router.back();
      return;
    }
    if (backingRef.current) return;
    backingRef.current = true;
    shellTranslateX.setValue(0);
    Animated.timing(shellTranslateX, {
      toValue: Dimensions.get('window').width,
      duration: 300,
      useNativeDriver: true,
      easing: Easing.out(Easing.cubic),
    }).start(({ finished }) => {
      if (!finished) {
        backingRef.current = false;
        return;
      }
      if (s === 'scene') setStep('intro');
      else if (s === 'breathing') setStep('scene');
      else if (s === 'done') setStep('breathing');
      shellTranslateX.setValue(0);
      backingRef.current = false;
    });
  }, [shellTranslateX, router]);

  useEffect(() => {
    return navigation.addListener('beforeRemove', (e) => {
      const s = stepRef.current;
      if (s === 'intro') return;
      e.preventDefault();
      runExerciseBack();
    });
  }, [navigation, runExerciseBack]);

  const swipeBackPan = useWizardSwipeBackRight(
    () => stepRef.current !== 'intro',
    runExerciseBack,
  );

  const circleScale = useRef(new Animated.Value(0.5)).current;
  const circleGlow = useRef(new Animated.Value(0.3)).current;

  // --- Audio bars ---
  const barScales = useRef(
    Array.from({ length: NUM_BARS }, () => new Animated.Value(0.4)),
  ).current;

  const animateBar = useCallback((anim: Animated.Value) => {
    const target = 0.2 + Math.random() * 0.8;
    const dur = 160 + Math.random() * 440;
    Animated.timing(anim, { toValue: target, duration: dur, useNativeDriver: true }).start(
      ({ finished }) => { if (finished) animateBar(anim); },
    );
  }, []);

  const barsActive = step === 'scene' || step === 'breathing';

  useEffect(() => {
    if (!barsActive) {
      barScales.forEach((s) => { s.stopAnimation(); s.setValue(0.4); });
      return;
    }
    barScales.forEach((s) => animateBar(s));
    return () => { barScales.forEach((s) => s.stopAnimation()); };
  }, [barsActive, animateBar, barScales]);

  // --- Audio ---
  const scenePlayer = useAudioPlayer(step === 'scene' ? SCENE_AUDIO_URL : null, {
    updateInterval: 200, downloadFirst: false,
  });
  const sceneStatus = useAudioPlayerStatus(scenePlayer);

  const breathPlayer = useAudioPlayer(step === 'breathing' ? BREATHING_AUDIO_URL : null, {
    updateInterval: 200, downloadFirst: false,
  });
  const breathStatus = useAudioPlayerStatus(breathPlayer);

  useEffect(() => {
    if (step !== 'scene' && step !== 'breathing') return;
    void setAudioModeAsync({
      playsInSilentMode: true, interruptionMode: 'doNotMix',
      allowsRecording: false, shouldPlayInBackground: false,
    });
  }, [step]);

  useEffect(() => {
    if (step !== 'scene' || !SCENE_AUDIO_URL) return;
    if (sceneStatus.isLoaded && !sceneStatus.playing) {
      void scenePlayer.seekTo(0).then(() => scenePlayer.play());
    }
  }, [step, sceneStatus.isLoaded]);

  useEffect(() => {
    if (step !== 'breathing' || !BREATHING_AUDIO_URL) return;
    if (breathStatus.isLoaded && !breathStatus.playing) {
      void breathPlayer.seekTo(0).then(() => breathPlayer.play());
    }
  }, [step, breathStatus.isLoaded]);

  // --- Scene timed text ---
  useEffect(() => {
    if (step !== 'scene') return;
    setSceneLineIdx(0);
    sceneTextFade.setValue(0);
    let idx = 0;
    const show = () => {
      sceneTextFade.setValue(0);
      setSceneLineIdx(idx);
      Animated.timing(sceneTextFade, { toValue: 1, duration: 400, useNativeDriver: true }).start();
    };
    show();
    const iv = setInterval(() => {
      idx++;
      if (idx >= SCENE_LINES.length) {
        clearInterval(iv);
        setTimeout(() => setStep('breathing'), 1500);
        return;
      }
      Animated.timing(sceneTextFade, { toValue: 0, duration: 250, useNativeDriver: true }).start(() => show());
    }, SCENE_LINE_MS);
    return () => clearInterval(iv);
  }, [step]);

  // --- Breathing cycle ---
  useEffect(() => {
    if (step !== 'breathing') return;
    setPhaseIdx(0);
    setRound(1);
    setCountdown(4);
    circleScale.setValue(0.5);
    circleGlow.setValue(0.3);

    let phase = 0;
    let rd = 1;
    let cd = 4;

    const runPhaseAnim = (p: number) => {
      if (p === 0) {
        Animated.timing(circleScale, { toValue: 1, duration: PHASE_MS, easing: Easing.inOut(Easing.ease), useNativeDriver: true }).start();
        Animated.timing(circleGlow, { toValue: 0.8, duration: PHASE_MS, useNativeDriver: true }).start();
      } else if (p === 2) {
        Animated.timing(circleScale, { toValue: 0.5, duration: PHASE_MS, easing: Easing.inOut(Easing.ease), useNativeDriver: true }).start();
        Animated.timing(circleGlow, { toValue: 0.3, duration: PHASE_MS, useNativeDriver: true }).start();
      }
    };

    runPhaseAnim(0);

    const iv = setInterval(() => {
      cd--;
      if (cd <= 0) {
        cd = 4;
        phase++;
        if (phase >= 4) {
          phase = 0;
          rd++;
          if (rd > NUM_ROUNDS) {
            clearInterval(iv);
            setTimeout(() => setStep('done'), 800);
            return;
          }
          setRound(rd);
        }
        setPhaseIdx(phase);
        runPhaseAnim(phase);
      }
      setCountdown(cd);
    }, 1000);

    return () => {
      clearInterval(iv);
      circleScale.stopAnimation();
      circleGlow.stopAnimation();
    };
  }, [step]);

  const audioBars = (
    <View style={styles.audioCue}>
      {barScales.map((s, i) => (
        <Animated.View
          key={i}
          style={[styles.audioCueBar, { height: BAR_HEIGHTS[i], backgroundColor: colors.accentLight, transform: [{ scaleY: s }] }]}
        />
      ))}
    </View>
  );

  const renderIntro = () => (
    <View style={styles.topSection}>
      <Text style={styles.badge}>SAMPLE EXERCISE</Text>
      <Text style={styles.title}>Box Breathing</Text>
      <Text style={styles.body}>
        A simple but powerful technique to regain control of your focus. Four
        counts in, four counts hold, four counts out, four counts hold. Think
        of tracing a box with your breath.
      </Text>
      <View style={styles.exerciseCard}>
        <Text style={styles.exerciseTitle}>Controlled Breathing Reset</Text>
        <Text style={styles.exerciseMeta}>~60 seconds</Text>
      </View>
    </View>
  );

  const renderScene = () => (
    <View style={styles.sceneSection}>
      <View style={styles.barsFixed}>{audioBars}</View>
      <View style={styles.sceneTextWrap}>
        <Animated.Text style={[styles.sceneLine, { opacity: sceneTextFade }]}>
          {SCENE_LINES[sceneLineIdx]}
        </Animated.Text>
      </View>
    </View>
  );

  const CIRCLE = 180;

  const renderBreathing = () => (
    <View style={styles.breathSection}>
      <View style={styles.barsFixed}>{audioBars}</View>
      <View style={styles.phaseLabelWrap}>
        <Text style={styles.phaseLabel}>{PHASES[phaseIdx]}</Text>
      </View>
      <View style={styles.circleWrap}>
        <Animated.View
          style={[
            styles.circleOuter,
            { width: CIRCLE, height: CIRCLE, borderRadius: CIRCLE / 2, opacity: circleGlow, transform: [{ scale: circleScale }] },
          ]}
        />
        <Animated.View
          style={[
            styles.circleInner,
            { width: CIRCLE * 0.65, height: CIRCLE * 0.65, borderRadius: CIRCLE * 0.325, transform: [{ scale: circleScale }] },
          ]}
        />
        <Text style={styles.countdown}>{countdown}</Text>
      </View>
      <Text style={styles.roundLabel}>Round {round} of {NUM_ROUNDS}</Text>
    </View>
  );

  const renderDone = () => (
    <View style={styles.topSection}>
      <Text style={styles.badge}>EXERCISE COMPLETE</Text>
      <Text style={styles.title}>Three rounds. That{"'"}s all it takes.</Text>
      <Text style={styles.body}>
        Most athletes can regain focus in just one to three rounds of box
        breathing. The more you practice, the faster it works — especially
        under pressure.
      </Text>
      <View style={styles.doneCard}>
        <Text style={styles.doneCardTitle}>This is mental performance training</Text>
        <Text style={styles.doneCardBody}>
          Short, focused exercises that build the three skills elite athletes
          actually use: Mindfulness, Acceptance, and Commitment.
        </Text>
      </View>
    </View>
  );

  const content = () => {
    switch (step) {
      case 'intro': return renderIntro();
      case 'scene': return renderScene();
      case 'breathing': return renderBreathing();
      case 'done': return renderDone();
    }
  };

  const showBtn = step === 'intro' || step === 'done';

  const advance = () => {
    if (step === 'intro') setStep('scene');
    else if (step === 'done') router.push('/(onboarding)/what-you-get');
  };

  const handleBack = () => runExerciseBack();

  return (
    <SafeAreaView style={styles.container}>
      <ProgressBar step={10} total={TOTAL_STEPS} onBack={handleBack} />
      <View style={styles.swipeArea} {...swipeBackPan}>
        <Animated.View style={[styles.inner, { transform: [{ translateX: shellTranslateX }] }]}>
          {content()}
          {showBtn && (
            <View style={styles.bottomSection}>
              <TouchableOpacity style={styles.button} onPress={advance}>
                <Text style={styles.buttonText}>
                  {step === 'intro' ? 'Start exercise' : 'Continue'}
                </Text>
              </TouchableOpacity>
            </View>
          )}
        </Animated.View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  swipeArea: { flex: 1 },
  inner: { flex: 1, justifyContent: 'space-between', paddingHorizontal: spacing.xl },
  topSection: { flex: 1, justifyContent: 'center' },
  badge: { fontSize: 12, fontWeight: '700', color: colors.accentLight, letterSpacing: 2, marginBottom: spacing.md },
  title: { fontSize: 28, fontWeight: '800', color: colors.white, marginBottom: spacing.md, lineHeight: 36 },
  body: { fontSize: 16, color: colors.textSecondary, lineHeight: 24, marginBottom: spacing.lg },
  exerciseCard: {
    backgroundColor: colors.surface, borderRadius: 16, padding: spacing.lg,
    borderWidth: 1, borderColor: colors.border, alignItems: 'center',
  },
  exerciseTitle: { fontSize: 18, fontWeight: '700', color: colors.white, marginBottom: 4 },
  exerciseMeta: { fontSize: 13, color: colors.textMuted },

  audioCue: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, height: 34, marginBottom: spacing.lg },
  audioCueBar: { width: 3, borderRadius: 1.5 },

  sceneSection: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  barsFixed: { height: 50 },
  sceneTextWrap: { height: 80, justifyContent: 'center' },
  sceneLine: { fontSize: 22, fontWeight: '600', color: colors.textPrimary, textAlign: 'center', lineHeight: 32, paddingHorizontal: spacing.md },

  breathSection: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  phaseLabelWrap: { height: 40, justifyContent: 'center' },
  phaseLabel: { fontSize: 18, fontWeight: '700', color: colors.textPrimary, textAlign: 'center' },
  circleWrap: { alignItems: 'center', justifyContent: 'center', width: 200, height: 200 },
  circleOuter: { position: 'absolute', backgroundColor: 'rgba(139, 92, 246, 0.12)' },
  circleInner: { position: 'absolute', backgroundColor: 'rgba(139, 92, 246, 0.25)' },
  countdown: { fontSize: 42, fontWeight: '800', color: colors.white },
  roundLabel: { fontSize: 13, color: colors.textMuted, marginTop: spacing.lg, letterSpacing: 0.5 },

  doneCard: {
    backgroundColor: colors.surface, borderRadius: 16, borderWidth: 1,
    borderColor: colors.border, padding: spacing.lg, marginTop: spacing.xl,
  },
  doneCardTitle: { fontSize: 15, fontWeight: '700', color: colors.white, marginBottom: spacing.sm },
  doneCardBody: { fontSize: 14, color: colors.textSecondary, lineHeight: 21 },

  bottomSection: { paddingBottom: spacing.xl },
  button: { backgroundColor: colors.accent, borderRadius: 12, paddingVertical: 16, alignItems: 'center' },
  buttonText: { color: colors.white, fontSize: 16, fontWeight: '700' },
});
