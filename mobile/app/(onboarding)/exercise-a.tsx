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
const GUIDE_AUDIO_URL: string | null = null;

const SCENE_LINES = [
  'Think of a moment when you felt doubt or pressure.',
  'A big game. A hard practice. A moment that mattered.',
  'Notice where that resistance shows up in your body.',
  "Don't fight it. Just notice.",
];
const SCENE_LINE_MS = 2500;

const GUIDE_STEPS = [
  {
    label: 'ACCEPT',
    text: "Notice what you feel.\nDon't push it away.\nName it.",
    durationMs: 8000,
  },
  {
    label: 'ALLOW',
    text: "Own your response.\nLet the resistance pass —\nor redirect it.",
    durationMs: 8000,
  },
  {
    label: 'REFOCUS',
    text: 'Three deep breaths.\nReturn to the present.',
    durationMs: 10000,
  },
];

const NUM_BARS = 5;
const BAR_HEIGHTS = [10, 20, 28, 16, 22];

type Step = 'intro' | 'scene' | 'guide' | 'done';

export default function ExerciseAScreen() {
  const router = useRouter();
  const navigation = useNavigation();
  const [step, setStep] = useState<Step>('intro');
  const [guideIdx, setGuideIdx] = useState(0);
  const [sceneLineIdx, setSceneLineIdx] = useState(0);
  const sceneTextFade = useRef(new Animated.Value(0)).current;
  const guideFade = useRef(new Animated.Value(0)).current;
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
      else if (s === 'guide') setStep('scene');
      else if (s === 'done') setStep('guide');
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
    () => true,
    () => {
      if (stepRef.current === 'intro') {
        router.back();
      } else {
        runExerciseBack();
      }
    },
  );

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

  const barsActive = step === 'scene' || step === 'guide';

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

  const guidePlayer = useAudioPlayer(step === 'guide' ? GUIDE_AUDIO_URL : null, {
    updateInterval: 200, downloadFirst: false,
  });
  const guideStatus = useAudioPlayerStatus(guidePlayer);

  useEffect(() => {
    if (step !== 'scene' && step !== 'guide') return;
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
    if (step !== 'guide' || !GUIDE_AUDIO_URL) return;
    if (guideStatus.isLoaded && !guideStatus.playing) {
      void guidePlayer.seekTo(0).then(() => guidePlayer.play());
    }
  }, [step, guideStatus.isLoaded]);

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
        setTimeout(() => setStep('guide'), 1500);
        return;
      }
      Animated.timing(sceneTextFade, { toValue: 0, duration: 250, useNativeDriver: true }).start(() => show());
    }, SCENE_LINE_MS);
    return () => clearInterval(iv);
  }, [step]);

  // --- Guided steps ---
  useEffect(() => {
    if (step !== 'guide') return;
    setGuideIdx(0);
    guideFade.setValue(0);

    let idx = 0;

    const showGuide = () => {
      guideFade.setValue(0);
      setGuideIdx(idx);
      Animated.timing(guideFade, { toValue: 1, duration: 500, useNativeDriver: true }).start();
    };

    showGuide();

    let timeout: ReturnType<typeof setTimeout>;
    const scheduleNext = () => {
      timeout = setTimeout(() => {
        idx++;
        if (idx >= GUIDE_STEPS.length) {
          setTimeout(() => setStep('done'), 800);
          return;
        }
        Animated.timing(guideFade, { toValue: 0, duration: 300, useNativeDriver: true }).start(() => {
          showGuide();
          scheduleNext();
        });
      }, GUIDE_STEPS[idx].durationMs);
    };
    scheduleNext();

    return () => clearTimeout(timeout);
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
      <Text style={styles.title}>Greeting Resistance</Text>
      <Text style={styles.body}>
        Pressure, doubt, and hesitation are normal. This exercise teaches you to
        acknowledge what you{"'"}re feeling, take ownership of your response, and
        redirect your energy.
      </Text>
      <View style={styles.exerciseCard}>
        <Text style={styles.exerciseTitle}>Acceptance Reset</Text>
        <Text style={styles.exerciseMeta}>~45 seconds</Text>
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

  const renderGuide = () => {
    const g = GUIDE_STEPS[guideIdx];
    return (
      <View style={styles.guideSection}>
        {audioBars}
        <Animated.View style={[styles.guideContent, { opacity: guideFade }]}>
          <Text style={styles.guideLabel}>{g.label}</Text>
          <Text style={styles.guideText}>{g.text}</Text>
        </Animated.View>
        <Text style={styles.stepIndicator}>
          Step {guideIdx + 1} of {GUIDE_STEPS.length}
        </Text>
      </View>
    );
  };

  const renderDone = () => (
    <View style={styles.topSection}>
      <Text style={styles.badge}>EXERCISE COMPLETE</Text>
      <Text style={styles.title}>You faced resistance without running from it.</Text>
      <Text style={styles.body}>
        That{"'"}s the skill. Not eliminating discomfort, but choosing how you
        respond to it. Acceptance is the foundation of performing under
        pressure.
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
      case 'guide': return renderGuide();
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

  guideSection: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  guideContent: { alignItems: 'center', paddingHorizontal: spacing.sm, minHeight: 120, justifyContent: 'center' },
  guideLabel: {
    fontSize: 12, fontWeight: '700', color: colors.accentLight,
    letterSpacing: 2, marginBottom: spacing.lg,
  },
  guideText: {
    fontSize: 20, fontWeight: '600', color: colors.textPrimary,
    textAlign: 'center', lineHeight: 30,
  },
  stepIndicator: { fontSize: 13, color: colors.textMuted, marginTop: spacing.xl, letterSpacing: 0.5 },

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
