import { useState, useRef, useEffect, useCallback } from 'react';
import {
  Animated,
  Image,
  Keyboard,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, useNavigation } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import { saveOnboardingAnswers } from '@/lib/onboarding-local-state';
import { colors, spacing } from '@/lib/theme';

// TODO: wire Whisper audio URLs here when voiceover recordings are ready
// const AUDIO_URLS = ['grant_intro_seg_01.mp3', 'grant_intro_seg_02.mp3', 'grant_intro_seg_03.mp3'];

/** Verbatim voiceover script from Grant's onboarding intro. */
const VOICE_CUES = [
  "This is Grant, I'm a coach here in Relentless.",
  "I've helped hundreds of athletes improve their performance through sports psychology, and I'm giving you the exact strategies that work through short, guided lessons.",
  "Excellent, I'll see you again on day 1.",
] as const;

/** Journal prompt shown between cue 1 and cue 2. */
const JOURNAL_PROMPT = 'What is your current goal in your sport?';

/** After this cue index completes, show the journal before continuing. */
const JOURNAL_AFTER_CUE = 1;

/** Total voiceover cues. Progress denominator. */
const TOTAL_CUES = VOICE_CUES.length;

type Phase = 'ready' | 'playing' | 'journal';

// ─── Audio bar animation ──────────────────────────────────────────────────────

const BAR_BASE_HEIGHTS = [10, 20, 28, 16, 22] as const;

function useAudioBars(active: boolean) {
  const scales = useRef(BAR_BASE_HEIGHTS.map(() => new Animated.Value(1))).current;
  const loopRefs = useRef<Animated.CompositeAnimation[]>([]);

  useEffect(() => {
    loopRefs.current.forEach((l) => l.stop());
    loopRefs.current = [];
    if (!active) {
      scales.forEach((s) => s.setValue(1));
      return;
    }
    scales.forEach((scale, i) => {
      const loop = Animated.loop(
        Animated.sequence([
          Animated.delay(i * 80),
          Animated.timing(scale, { toValue: 1.9, duration: 380, useNativeDriver: true }),
          Animated.timing(scale, { toValue: 0.6, duration: 380, useNativeDriver: true }),
          Animated.timing(scale, { toValue: 1, duration: 240, useNativeDriver: true }),
        ]),
      );
      loopRefs.current.push(loop);
      loop.start();
    });
    return () => { loopRefs.current.forEach((l) => l.stop()); };
  }, [active]);

  return scales;
}

// ─── Volume toast ─────────────────────────────────────────────────────────────

function useVolumeToast() {
  const [visible, setVisible] = useState(false);
  const opacity = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(0.85)).current;
  const translateY = useRef(new Animated.Value(-12)).current;

  const show = useCallback(() => {
    setVisible(true);
    opacity.setValue(0);
    scale.setValue(0.85);
    translateY.setValue(-12);
    Animated.sequence([
      Animated.parallel([
        Animated.spring(scale, { toValue: 1.04, friction: 5, tension: 140, useNativeDriver: true }),
        Animated.spring(translateY, { toValue: 0, friction: 6, tension: 120, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 1, duration: 220, useNativeDriver: true }),
      ]),
      Animated.timing(scale, { toValue: 1, duration: 180, useNativeDriver: true }),
      Animated.delay(3200),
      Animated.parallel([
        Animated.timing(opacity, { toValue: 0, duration: 300, useNativeDriver: true }),
        Animated.timing(translateY, { toValue: -10, duration: 300, useNativeDriver: true }),
      ]),
    ]).start(() => setVisible(false));
  }, [opacity, scale, translateY]);

  return { visible, opacity, scale, translateY, show };
}

// ─── Grant photo ─────────────────────────────────────────────────────────────
function GrantPhoto() {
  return (
    <View style={styles.grantPhoto}>
      <Image
        source={require('../../assets/images/grant_chiasson.png')}
        style={styles.grantPhotoImage}
        resizeMode="cover"
      />
    </View>
  );
}

// ─── Main screen ─────────────────────────────────────────────────────────────

export default function GrantIntroScreen() {
  const router = useRouter();
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();

  const [phase, setPhase] = useState<Phase>('ready');
  const [cueIndex, setCueIndex] = useState(0);
  const [journalText, setJournalText] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const textFade = useRef(new Animated.Value(0)).current;
  const progressAnim = useRef(new Animated.Value(0)).current;
  const journalScrollRef = useRef<ScrollView>(null);
  const journalFooterRef = useRef<View>(null);
  /** Set to true just before pushing to trophy; used to reset state on back-nav. */
  const didCompleteRef = useRef(false);

  const barScales = useAudioBars(phase === 'playing');
  const volumeToast = useVolumeToast();

  // ── Block swipe + hardware back during playing AND journal ───────────────
  useEffect(() => {
    // Gesture (swipe-back) disabled in any non-ready phase.
    navigation.setOptions({ gestureEnabled: phase === 'ready' });
  }, [navigation, phase]);

  useEffect(() => {
    return navigation.addListener('beforeRemove', (e) => {
      if (phase === 'playing' || phase === 'journal') e.preventDefault();
    });
  }, [navigation, phase]);

  // ── Reset to ready when re-focused after navigating forward to trophy ─────
  useFocusEffect(
    useCallback(() => {
      if (didCompleteRef.current) {
        didCompleteRef.current = false;
        setPhase('ready');
        setCueIndex(0);
        setJournalText('');
        progressAnim.setValue(0);
        textFade.setValue(0);
      }
    }, [progressAnim, textFade]),
  );

  const animateCueIn = useCallback(() => {
    textFade.setValue(0);
    Animated.timing(textFade, { toValue: 1, duration: 300, useNativeDriver: true }).start();
  }, [textFade]);

  const animateProgress = useCallback((target: number) => {
    Animated.timing(progressAnim, {
      toValue: target,
      duration: 500,
      useNativeDriver: false,
    }).start();
  }, [progressAnim]);

  const handleBegin = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    // Progress bar starts at 0 — advances only as cues are completed.
    setPhase('playing');
    setCueIndex(0);
    animateCueIn();
    volumeToast.show();
  }, [animateCueIn, volumeToast]);

  const handleCueContinue = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    if (cueIndex === JOURNAL_AFTER_CUE) {
      // Cue 1 done → advance progress to 2/3, then show journal.
      animateProgress((JOURNAL_AFTER_CUE + 1) / TOTAL_CUES);
      Animated.timing(textFade, { toValue: 0, duration: 180, useNativeDriver: true }).start(() => {
        setPhase('journal');
      });
      return;
    }

    const nextCue = cueIndex + 1;
    if (nextCue < TOTAL_CUES) {
      // Advance progress to reflect completed cue.
      animateProgress(nextCue / TOTAL_CUES);
      Animated.timing(textFade, { toValue: 0, duration: 180, useNativeDriver: true }).start(() => {
        setCueIndex(nextCue);
        animateCueIn();
      });
    }
  }, [cueIndex, textFade, animateProgress, animateCueIn]);

  const handleJournalBack = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    animateProgress(1 / TOTAL_CUES);
    setPhase('playing');
    setCueIndex(JOURNAL_AFTER_CUE);
    animateCueIn();
  }, [animateCueIn, animateProgress]);

  const handleJournalDone = useCallback(async () => {
    if (submitting) return;
    setSubmitting(true);
    Keyboard.dismiss();
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    await saveOnboardingAnswers({ grantJournalAnswer: journalText.trim() || undefined });

    // Transition to outro cue — progress stays at 2/3.
    const outroCue = JOURNAL_AFTER_CUE + 1;
    setPhase('playing');
    setCueIndex(outroCue);
    animateCueIn();
    setSubmitting(false);
  }, [submitting, journalText, animateCueIn]);

  const handleOutroContinue = useCallback(async () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    await saveOnboardingAnswers({ grantComplete: true });
    didCompleteRef.current = true;
    router.push('/(onboarding)/onboarding-trophy' as any);
  }, [router]);

  // NOTE: no useEffect for animateCueIn — every transition calls it explicitly
  // to avoid double-firing (state update + effect both triggering the animation).

  const isOutroCue = cueIndex === TOTAL_CUES - 1;

  return (
    <SafeAreaView style={styles.container}>

      {/* ── Top bar ──────────────────────────────────────────────────────────── */}
      <View style={styles.topBar}>
        <View style={styles.topBarSide}>
          {(phase === 'ready' || phase === 'journal') && (
            <TouchableOpacity
              onPress={phase === 'ready' ? () => router.back() : handleJournalBack}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            >
              <Ionicons
                name={phase === 'ready' ? 'close' : 'chevron-back'}
                size={24}
                color={colors.textMuted}
              />
            </TouchableOpacity>
          )}
        </View>
        <View style={styles.topBarCenter}>
          <View style={styles.grantBadge}>
            <Ionicons name="person" size={11} color={colors.accentLight} />
            <Text style={styles.grantBadgeText}>GRANT</Text>
          </View>
        </View>
        <View style={styles.topBarSide} />
      </View>

      {/* ── Volume toast (appears on Begin, disappears after ~2.5s) ──────────── */}
      {volumeToast.visible && (
        <Animated.View
          style={[
            styles.volumeToast,
            {
              opacity: volumeToast.opacity,
              transform: [
                { translateY: volumeToast.translateY },
                { scale: volumeToast.scale },
              ],
            },
          ]}
          pointerEvents="none"
        >
          <Ionicons name="volume-high" size={20} color={colors.white} />
          <Text style={styles.volumeToastText}>Turn up your volume</Text>
        </Animated.View>
      )}

      {/* ── Ready phase ───────────────────────────────────────────────────────── */}
      {phase === 'ready' && (
        <View style={styles.readyRoot}>
          <View style={styles.readyCard}>
            <GrantPhoto />

            <Text style={styles.readyTitle}>Grant</Text>
            <Text style={styles.readyCredentials}>
              M.S., CMPC · Mental Performance Coach
            </Text>
            <Text style={styles.readyBio}>
              Former D1 QB. Founder of GCMP. Trains competitive athletes using the MAC framework.
            </Text>

            <View style={styles.readyMetaRow}>
              <View style={styles.readyDurationPill}>
                <Text style={styles.readyDurationPillText}>~1 min</Text>
              </View>
            </View>

            <TouchableOpacity style={[styles.primaryBtn, styles.readyBeginBtn]} onPress={handleBegin}>
              <Text style={styles.primaryBtnText}>Begin</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* ── Playing phase (voiceover cues) ────────────────────────────────────── */}
      {phase === 'playing' && (
        <View style={styles.centered}>
          <Animated.Text style={[styles.blockText, { opacity: textFade }]}>
            {VOICE_CUES[cueIndex]}
          </Animated.Text>

          {/* Audio bars */}
          <View style={styles.audioCue}>
            {barScales.map((scaleAnim, i) => (
              <Animated.View
                key={i}
                style={[
                  styles.audioCueBar,
                  {
                    height: BAR_BASE_HEIGHTS[i],
                    backgroundColor: colors.accentLight,
                    transform: [{ scaleY: scaleAnim }],
                  },
                ]}
              />
            ))}
          </View>

          {/* Lesson progress bar */}
          <Animated.View style={styles.progressBarTrack}>
            <Animated.View
              style={[
                styles.progressBarFill,
                {
                  width: progressAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: ['0%', '100%'],
                  }),
                  backgroundColor: colors.accentLight,
                },
              ]}
            />
          </Animated.View>

          <TouchableOpacity
            style={styles.primaryBtn}
            onPress={isOutroCue ? handleOutroContinue : handleCueContinue}
          >
            <Text style={styles.primaryBtnText}>
              {isOutroCue ? 'Continue' : 'Next'}
            </Text>
          </TouchableOpacity>
        </View>
      )}

      {/* ── Journal phase ─────────────────────────────────────────────────────── */}
      {phase === 'journal' && (
        <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
          <View style={styles.journalRoot}>
            <ScrollView
              ref={journalScrollRef}
              automaticallyAdjustKeyboardInsets
              contentContainerStyle={[
                styles.journalContent,
                { paddingBottom: spacing.lg + insets.bottom + 12 },
              ]}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="interactive"
              showsVerticalScrollIndicator={false}
            >
              <Ionicons
                name="create-outline"
                size={48}
                color={colors.accentLight}
                style={{ alignSelf: 'center', marginBottom: spacing.md }}
              />
              <Text style={styles.journalTitle}>Journal</Text>
              <Text style={styles.journalPromptText}>{JOURNAL_PROMPT}</Text>

              <TextInput
                style={styles.journalInput}
                placeholder="Write your reflection..."
                placeholderTextColor={colors.textMuted}
                value={journalText}
                onChangeText={setJournalText}
                multiline
                scrollEnabled={false}
                autoCorrect
                spellCheck
              />

              <View ref={journalFooterRef} collapsable={false}>
                <TouchableOpacity
                  style={styles.primaryBtn}
                  onPress={handleJournalDone}
                  disabled={submitting}
                >
                  <Text style={styles.primaryBtnText}>
                    {journalText.trim().length > 0 ? 'Save & Continue' : 'Skip'}
                  </Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
          </View>
        </TouchableWithoutFeedback>
      )}

    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },

  // ── Top bar ───────────────────────────────────────────────────────────────
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  topBarSide: { width: 40, alignItems: 'flex-start' },
  topBarCenter: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
  },
  grantBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderWidth: 1,
    borderColor: colors.accentLight + '55',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 4,
    backgroundColor: colors.accentLight + '12',
  },
  grantBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.5,
    color: colors.accentLight,
  },

  // Volume toast
  volumeToast: {
    position: 'absolute',
    top: 80,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: 'rgba(20, 20, 20, 0.96)',
    borderRadius: 24,
    paddingHorizontal: 22,
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: 'rgba(167, 139, 250, 0.3)',
    shadowColor: colors.accent,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 10,
    zIndex: 99,
  },
  volumeToastText: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.textPrimary,
    letterSpacing: 0.2,
  },

  // ── Ready ─────────────────────────────────────────────────────────────────
  readyRoot: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xl,
  },
  readyCard: {
    width: '100%',
    maxWidth: 400,
    alignSelf: 'center',
    backgroundColor: colors.surface,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    alignItems: 'center',
  },

  // Photo — container clips; scale + translateY zoom past the black border of the LinkedIn screenshot
  grantPhoto: {
    width: 110,
    height: 110,
    borderRadius: 55,
    overflow: 'hidden',
    marginBottom: spacing.md,
    borderWidth: 2,
    borderColor: colors.border,
  },
  grantPhotoImage: {
    width: 110,
    height: 110,
    transform: [{ scale: 1.75 }, { translateY: -8 }],
  },

  readyTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: colors.textPrimary,
    textAlign: 'center',
    lineHeight: 28,
    marginBottom: 4,
  },
  readyCredentials: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.accentLight,
    textAlign: 'center',
    letterSpacing: 0.4,
    marginBottom: spacing.sm,
  },
  readyBio: {
    fontSize: 13,
    fontWeight: '400',
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: spacing.md,
    paddingHorizontal: spacing.xs,
  },
  readyMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  readyDurationPill: {
    backgroundColor: colors.accentSubtle,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 6,
  },
  readyDurationPillText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.accent,
    letterSpacing: 0.2,
  },
  readyBeginBtn: {
    width: '100%',
    marginTop: spacing.md,
    alignSelf: 'stretch',
  },

  // ── Playing ───────────────────────────────────────────────────────────────
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
  },
  blockText: {
    fontSize: 22,
    fontWeight: '600',
    color: colors.textPrimary,
    textAlign: 'center',
    lineHeight: 32,
    paddingHorizontal: spacing.md,
    marginBottom: spacing.xl,
  },
  audioCue: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    height: 34,
    marginBottom: spacing.lg,
  },
  audioCueBar: {
    width: 3,
    borderRadius: 1.5,
  },
  progressBarTrack: {
    width: '80%',
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.ringTrack,
    marginBottom: spacing.xl,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    borderRadius: 2,
  },

  // ── Journal ───────────────────────────────────────────────────────────────
  journalRoot: { flex: 1 },
  journalContent: {
    flexGrow: 1,
    justifyContent: 'flex-start',
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.md,
  },
  journalTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: colors.textPrimary,
    textAlign: 'center',
    marginBottom: spacing.lg,
  },
  journalPromptText: {
    fontSize: 16,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 24,
    marginBottom: spacing.lg,
  },
  journalInput: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    color: colors.textPrimary,
    fontSize: 15,
    minHeight: 120,
    textAlignVertical: 'top',
    marginBottom: spacing.lg,
  },

  // ── Shared ────────────────────────────────────────────────────────────────
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
