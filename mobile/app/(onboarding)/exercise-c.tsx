import { useState, useRef, useEffect, useCallback } from 'react';
import {
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  Animated,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Keyboard,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { setAudioModeAsync, useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { ProgressBar } from '@/components/onboarding/ProgressBar';
import { apiFetch } from '@/lib/api';
import { colors, spacing } from '@/lib/theme';

const TOTAL_STEPS = 12;

const SCENE_AUDIO_URL: string | null = null;

const SCENE_LINES = [
  'The past does not equal the future.',
  "Who you've been doesn't define who you'll become.",
  'Clarity is power.',
  'See your future self — then become them.',
];
const SCENE_LINE_MS = 2800;

const HORIZONS = ['6 months', '1 year', '2 years', '3 years'] as const;

const GUIDING_QUESTIONS = [
  'What does your future self look like?',
  'How do they carry themselves?',
  'What kind of shape are they in?',
  'What is their work ethic like?',
  'How do they talk? What are they saying?',
  'What emotions do they experience consistently?',
];

const NUM_BARS = 5;
const BAR_HEIGHTS = [10, 20, 28, 16, 22];

type Step = 'intro' | 'scene' | 'horizon' | 'journal' | 'done';

export default function ExerciseCScreen() {
  const router = useRouter();
  const [step, setStep] = useState<Step>('intro');
  const [horizon, setHorizon] = useState<string | null>(null);
  const [text, setText] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const fade = useRef(new Animated.Value(0)).current;
  const scrollRef = useRef<ScrollView>(null);
  const inputRef = useRef<TextInput>(null);

  const [sceneLineIdx, setSceneLineIdx] = useState(0);
  const sceneTextFade = useRef(new Animated.Value(0)).current;

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

  const barsActive = step === 'scene';

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

  useEffect(() => {
    if (step !== 'scene') return;
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
        setTimeout(() => setStep('horizon'), 1500);
        return;
      }
      Animated.timing(sceneTextFade, { toValue: 0, duration: 250, useNativeDriver: true }).start(() => show());
    }, SCENE_LINE_MS);
    return () => clearInterval(iv);
  }, [step]);

  // --- Fade for non-scene steps ---
  useEffect(() => {
    if (step === 'scene') return;
    fade.setValue(0);
    Animated.timing(fade, { toValue: 1, duration: 400, useNativeDriver: true }).start();
  }, [step]);

  // --- Auto-focus input when journal step loads ---
  useEffect(() => {
    if (step === 'journal') {
      setTimeout(() => inputRef.current?.focus(), 400);
    }
  }, [step]);

  const saveJournal = async () => {
    Keyboard.dismiss();
    const trimmed = text.trim();
    if (!trimmed) {
      setStep('done');
      return;
    }
    setSaving(true);
    setSaveError('');
    const body = `[Future Self — ${horizon}]\n\n${trimmed}`;
    const { error } = await apiFetch('/journal', {
      method: 'POST',
      body: { body, entry_type: 'onboarding_future_self' },
    });
    setSaving(false);
    if (error) {
      setSaveError(error);
      return;
    }
    setStep('done');
  };

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
      <Text style={styles.title}>Your Future Self</Text>
      <Text style={styles.body}>
        What happened before doesn{"'"}t define what happens next. This exercise
        is about getting clear on who you want to become — because clarity
        changes how you act today.
      </Text>
      <View style={styles.exerciseCard}>
        <Text style={styles.exerciseTitle}>Clarity Journal</Text>
        <Text style={styles.exerciseMeta}>~2 minutes</Text>
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

  const renderHorizon = () => (
    <Animated.View style={[styles.topSection, { opacity: fade }]}>
      <Text style={styles.title}>How far into the future do you want to look?</Text>
      <View style={styles.horizonOptions}>
        {HORIZONS.map((h) => (
          <TouchableOpacity
            key={h}
            style={[styles.horizonBtn, horizon === h && styles.horizonBtnActive]}
            onPress={() => setHorizon(h)}
          >
            <Text style={[styles.horizonText, horizon === h && styles.horizonTextActive]}>
              {h}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
    </Animated.View>
  );

  const renderJournal = () => (
    <KeyboardAvoidingView
      style={styles.journalWrap}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={100}
    >
      <ScrollView
        ref={scrollRef}
        contentContainerStyle={styles.journalScroll}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Animated.View style={{ opacity: fade }}>
          <Text style={styles.journalTitle}>
            Describe your future self — {horizon} from now.
          </Text>
          <View style={styles.hintsCard}>
            {GUIDING_QUESTIONS.map((q) => (
              <Text key={q} style={styles.hint}>{q}</Text>
            ))}
          </View>
          <TextInput
            ref={inputRef}
            style={styles.input}
            value={text}
            onChangeText={(t) => { setText(t); setSaveError(''); }}
            onFocus={() => {
              setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 300);
            }}
            onContentSizeChange={() => {
              scrollRef.current?.scrollToEnd({ animated: true });
            }}
            placeholder="Write freely — there are no wrong answers..."
            placeholderTextColor={colors.textMuted}
            multiline
            textAlignVertical="top"
            returnKeyType="default"
            blurOnSubmit={false}
            scrollEnabled
          />
          {text.trim().length > 0 && (
            <TouchableOpacity
              style={styles.doneWritingBtn}
              onPress={() => Keyboard.dismiss()}
            >
              <Text style={styles.doneWritingText}>Done writing</Text>
            </TouchableOpacity>
          )}
          {saveError ? <Text style={styles.error}>{saveError}</Text> : null}
        </Animated.View>
      </ScrollView>
    </KeyboardAvoidingView>
  );

  const renderDone = () => (
    <View style={styles.topSection}>
      <Text style={styles.badge}>
        {text.trim() ? 'ENTRY SAVED' : 'EXERCISE COMPLETE'}
      </Text>
      <Text style={styles.title}>You just made your future self more real.</Text>
      <Text style={styles.body}>
        When you can see who you want to become in detail, it gets easier to
        act like that person now. Come back to this journal entry whenever you
        need a reminder.
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
      case 'horizon': return renderHorizon();
      case 'journal': return renderJournal();
      case 'done': return renderDone();
    }
  };

  const canAdvance = () => {
    if (step === 'intro') return true;
    if (step === 'scene') return false;
    if (step === 'horizon') return horizon !== null;
    if (step === 'journal') return !saving;
    if (step === 'done') return true;
    return false;
  };

  const advance = () => {
    if (step === 'intro') setStep('scene');
    else if (step === 'horizon') setStep('journal');
    else if (step === 'journal') void saveJournal();
    else if (step === 'done') router.push('/(onboarding)/what-you-get');
  };

  const ctaLabel = () => {
    if (step === 'intro') return 'Start exercise';
    if (step === 'journal') {
      if (saving) return '';
      return text.trim() ? 'Save & Continue' : 'Skip';
    }
    if (step === 'done') return 'Continue';
    return 'Next';
  };

  const showBtn = step !== 'scene';

  return (
    <SafeAreaView style={styles.container}>
      <ProgressBar step={10} total={TOTAL_STEPS} />
      <View style={styles.inner}>
        {content()}
        {showBtn && (
          <View style={styles.bottomSection}>
            <TouchableOpacity
              style={[styles.button, !canAdvance() && styles.buttonDisabled]}
              onPress={advance}
              disabled={!canAdvance()}
            >
              {saving ? (
                <ActivityIndicator color={colors.white} />
              ) : (
                <Text style={styles.buttonText}>{ctaLabel()}</Text>
              )}
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
  badge: { fontSize: 12, fontWeight: '700', color: colors.accentLight, letterSpacing: 2, marginBottom: spacing.md },
  title: { fontSize: 28, fontWeight: '800', color: colors.white, marginBottom: spacing.md, lineHeight: 36 },
  body: { fontSize: 16, color: colors.textSecondary, lineHeight: 24, marginBottom: spacing.lg },
  exerciseCard: {
    backgroundColor: colors.surface, borderRadius: 16, padding: spacing.lg,
    borderWidth: 1, borderColor: colors.border, alignItems: 'center',
  },
  exerciseTitle: { fontSize: 18, fontWeight: '700', color: colors.white, marginBottom: 4 },
  exerciseMeta: { fontSize: 13, color: colors.textMuted },

  sceneSection: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  barsFixed: { height: 50 },
  sceneTextWrap: { height: 80, justifyContent: 'center' },
  audioCue: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, height: 34, marginBottom: spacing.lg },
  audioCueBar: { width: 3, borderRadius: 1.5 },
  sceneLine: { fontSize: 22, fontWeight: '600', color: colors.textPrimary, textAlign: 'center', lineHeight: 32, paddingHorizontal: spacing.md },

  horizonOptions: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, justifyContent: 'center' },
  horizonBtn: {
    borderWidth: 1, borderColor: colors.border, borderRadius: 12,
    paddingVertical: 14, paddingHorizontal: 20,
  },
  horizonBtnActive: { borderColor: colors.accent, backgroundColor: colors.accentSubtle },
  horizonText: { fontSize: 15, fontWeight: '600', color: colors.textSecondary },
  horizonTextActive: { color: colors.accentLight },

  journalWrap: { flex: 1 },
  journalScroll: { flexGrow: 1, paddingTop: spacing.md, paddingBottom: spacing.md },
  journalTitle: { fontSize: 18, fontWeight: '700', color: colors.white, marginBottom: spacing.sm, lineHeight: 26 },
  hintsCard: {
    backgroundColor: colors.surface, borderRadius: 12, padding: spacing.md,
    borderWidth: 1, borderColor: colors.border, marginBottom: spacing.md, gap: 4,
  },
  hint: { fontSize: 12, color: colors.textMuted, lineHeight: 17 },
  input: {
    backgroundColor: colors.surface, borderRadius: 12, borderWidth: 1,
    borderColor: colors.border, padding: spacing.md, color: colors.white,
    fontSize: 16, lineHeight: 24, minHeight: 140,
  },
  doneWritingBtn: {
    alignSelf: 'flex-end', marginTop: spacing.sm,
    paddingVertical: 8, paddingHorizontal: 16,
    borderRadius: 8, backgroundColor: colors.surface,
    borderWidth: 1, borderColor: colors.accent,
  },
  doneWritingText: { fontSize: 13, fontWeight: '600', color: colors.accentLight },
  error: { fontSize: 13, color: colors.error, marginTop: spacing.sm },

  doneCard: {
    backgroundColor: colors.surface, borderRadius: 16, borderWidth: 1,
    borderColor: colors.border, padding: spacing.lg, marginTop: spacing.xl,
  },
  doneCardTitle: { fontSize: 15, fontWeight: '700', color: colors.white, marginBottom: spacing.sm },
  doneCardBody: { fontSize: 14, color: colors.textSecondary, lineHeight: 21 },

  bottomSection: { paddingBottom: spacing.xl },
  button: {
    backgroundColor: colors.accent, borderRadius: 12, paddingVertical: 16,
    alignItems: 'center', minHeight: 52, justifyContent: 'center',
  },
  buttonDisabled: { opacity: 0.4 },
  buttonText: { color: colors.white, fontSize: 16, fontWeight: '700' },
});
