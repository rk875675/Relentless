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
import { setAudioModeAsync } from 'expo-audio';
import { useVideoPlayer, VideoView } from 'expo-video';
import { Asset } from 'expo-asset';
import { saveOnboardingAnswers } from '@/lib/onboarding-local-state';
import {
  trackOnboardingGrantVideoStarted,
  trackOnboardingGrantJournalSubmitted,
  trackOnboardingGrantVideoCompleted,
} from '@/lib/onboarding-analytics';
import { ONBOARDING_PROGRESS } from '@/lib/onboarding-progress';
import {
  GRANT_CHIASSON_CREDENTIALS,
  GRANT_CHIASSON_NAME,
  GRANT_CHIASSON_TAGLINE,
} from '@/lib/grant-attribution';
import { colors, spacing } from '@/lib/theme';

// Grant's onboarding intro is delivered as two video segments split by the journal:
//   intro (s1): "This is Grant…" + "I've helped hundreds of athletes…"
//   outro (s2): "Excellent, I'll see you again on day 1."
const INTRO_VIDEO = require('../../assets/videos/Grant_Intro_s1.mp4');
const OUTRO_VIDEO = require('../../assets/videos/Grant_Intro_s2.mp4');

/** Journal prompt shown between the intro and outro video segments. */
const JOURNAL_PROMPT = 'What is your current goal in your sport?';

type Phase = 'ready' | 'playing' | 'journal';
/** Which video segment the playing phase is showing. */
type Segment = 'intro' | 'outro';

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

// ─── Video skeleton (shown while the segment file is being prepared) ──────────
function VideoSkeleton() {
  const pulse = useRef(new Animated.Value(0.35)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 0.7, duration: 750, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0.35, duration: 750, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);

  return (
    <View style={styles.skeletonRoot} pointerEvents="none">
      <Animated.View style={[styles.skeletonAvatar, { opacity: pulse }]} />
      <Animated.View style={[styles.skeletonLine, styles.skeletonLineWide, { opacity: pulse }]} />
      <Animated.View style={[styles.skeletonLine, styles.skeletonLineNarrow, { opacity: pulse }]} />
    </View>
  );
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
  const [segment, setSegment] = useState<Segment>('intro');
  const [journalText, setJournalText] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const progressAnim = useRef(new Animated.Value(0)).current;
  const journalScrollRef = useRef<ScrollView>(null);
  const journalFooterRef = useRef<View>(null);
  /** Set to true just before pushing to trophy; used to reset state on back-nav. */
  const didCompleteRef = useRef(false);

  const volumeToast = useVolumeToast();

  // Pre-download both segments to local files. In dev builds, require()'d
  // assets are streamed from the Metro server, which can stall mid-playback;
  // playing from a local file:// URI avoids that.
  const [introUri, setIntroUri] = useState<string | null>(null);
  const [outroUri, setOutroUri] = useState<string | null>(null);
  const assetsReady = introUri !== null && outroUri !== null;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [a1, a2] = await Promise.all([
          Asset.fromModule(INTRO_VIDEO).downloadAsync(),
          Asset.fromModule(OUTRO_VIDEO).downloadAsync(),
        ]);
        if (cancelled) return;
        setIntroUri(a1.localUri ?? a1.uri);
        setOutroUri(a2.localUri ?? a2.uri);
      } catch {
        // Fall back to streaming from the asset/bundler URI.
        if (cancelled) return;
        setIntroUri(Asset.fromModule(INTRO_VIDEO).uri);
        setOutroUri(Asset.fromModule(OUTRO_VIDEO).uri);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // One preloaded player per segment. Keeping a dedicated, fully-buffered
  // player for each clip (instead of one player + replace()) avoids the iOS
  // black-frame glitches that replace()/source-swaps cause mid-playback, and
  // makes the segment transition instant.
  const introPlayer = useVideoPlayer(introUri, (p) => {
    p.loop = false;
    p.timeUpdateEventInterval = 0.2;
  });
  const outroPlayer = useVideoPlayer(outroUri, (p) => {
    p.loop = false;
    p.timeUpdateEventInterval = 0.2;
  });
  const activePlayer = segment === 'outro' ? outroPlayer : introPlayer;

  // Configure the audio session once, up front — reconfiguring it mid-playback
  // can interrupt the AVPlayer and blank the video on iOS.
  useEffect(() => {
    void setAudioModeAsync({
      playsInSilentMode: true,
      interruptionMode: 'doNotMix',
      allowsRecording: false,
      shouldPlayInBackground: false,
    });
  }, []);

  // Refs let the once-registered native listeners always read the latest
  // phase/segment and call the latest advance handlers.
  const phaseRef = useRef(phase);
  phaseRef.current = phase;
  const segmentRef = useRef(segment);
  segmentRef.current = segment;
  const onIntroEndRef = useRef<() => void>(() => {});
  const onOutroEndRef = useRef<() => void>(() => {});

  // Play the active segment from the start whenever we enter the playing phase.
  useEffect(() => {
    if (phase !== 'playing') {
      introPlayer.pause();
      outroPlayer.pause();
      return;
    }
    if (!assetsReady) return; // wait for the local file(s) before playing
    progressAnim.setValue(0); // each segment's bar fills from 0 over its own length
    activePlayer.currentTime = 0;
    activePlayer.play();
  }, [phase, segment, assetsReady, activePlayer, introPlayer, outroPlayer, progressAnim]);

  // Register listeners on both players: autoplay once ready, drive the progress
  // bar from real playback time, and auto-advance when a segment finishes.
  useEffect(() => {
    const subs: { remove: () => void }[] = [];
    const register = (pl: typeof introPlayer, seg: Segment) => {
      subs.push(pl.addListener('statusChange', () => {
        if (pl.status === 'readyToPlay' && phaseRef.current === 'playing' && segmentRef.current === seg) {
          pl.play();
        }
      }));
      subs.push(pl.addListener('playToEnd', () => {
        if (phaseRef.current !== 'playing' || segmentRef.current !== seg) return;
        progressAnim.setValue(1);
        if (seg === 'outro') onOutroEndRef.current();
        else onIntroEndRef.current();
      }));
      subs.push(pl.addListener('timeUpdate', ({ currentTime }) => {
        if (segmentRef.current !== seg) return;
        const dur = pl.duration;
        if (dur > 0) progressAnim.setValue(Math.min(1, currentTime / dur));
      }));
    };
    register(introPlayer, 'intro');
    register(outroPlayer, 'outro');
    return () => subs.forEach((s) => s.remove());
  }, [introPlayer, outroPlayer, progressAnim]);

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
        setSegment('intro');
        setJournalText('');
        progressAnim.setValue(0);
      }
    }, [progressAnim]),
  );

  const handleBegin = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    trackOnboardingGrantVideoStarted({
      step_key: 'grant_intro',
      step_index: ONBOARDING_PROGRESS.grantIntro,
    });
    setSegment('intro');
    setPhase('playing');
    volumeToast.show();
  }, [volumeToast]);

  const handleIntroContinue = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setPhase('journal');
  }, []);

  const handleJournalBack = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSegment('intro');
    setPhase('playing');
  }, []);

  const handleJournalDone = useCallback(async () => {
    if (submitting) return;
    setSubmitting(true);
    Keyboard.dismiss();
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    const trimmed = journalText.trim();
    trackOnboardingGrantJournalSubmitted({
      step_key: 'grant_intro',
      step_index: ONBOARDING_PROGRESS.grantIntro,
      skipped: !trimmed,
    });
    await saveOnboardingAnswers({ grantJournalAnswer: trimmed || undefined });

    // Transition to the outro video segment — progress stays at the halfway point.
    setSegment('outro');
    setPhase('playing');
    setSubmitting(false);
  }, [submitting, journalText]);

  const handleOutroContinue = useCallback(async () => {
    // Reachable from both the auto-advance playToEnd listener and a manual
    // Continue tap; guard so the completion event + navigation fire only once.
    if (didCompleteRef.current) return;
    didCompleteRef.current = true;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    trackOnboardingGrantVideoCompleted({
      step_key: 'grant_intro',
      step_index: ONBOARDING_PROGRESS.grantIntro,
    });
    await saveOnboardingAnswers({ grantComplete: true });
    router.push('/(onboarding)/onboarding-trophy' as any);
  }, [router]);

  // Keep the playToEnd listener pointed at the current advance handlers.
  useEffect(() => { onIntroEndRef.current = handleIntroContinue; }, [handleIntroContinue]);
  useEffect(() => { onOutroEndRef.current = handleOutroContinue; }, [handleOutroContinue]);

  const isOutroSegment = segment === 'outro';

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

            <Text style={styles.readyTitle}>{GRANT_CHIASSON_NAME}</Text>
            <Text style={styles.readyCredentials}>
              {GRANT_CHIASSON_CREDENTIALS}
            </Text>
            <Text style={styles.readyBio}>
              {GRANT_CHIASSON_TAGLINE}. Founder of GCMP. Trains competitive athletes using the MAC framework.
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

      {/* ── Playing phase (Grant intro video) ─────────────────────────────────── */}
      {phase === 'playing' && (
        <View style={styles.playingRoot}>
          <View style={styles.video}>
            <VideoView
              player={activePlayer}
              style={StyleSheet.absoluteFill}
              contentFit="contain"
              nativeControls={false}
            />
            {!assetsReady && <VideoSkeleton />}
          </View>

          <View style={styles.playingFooter}>
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
              onPress={isOutroSegment ? handleOutroContinue : handleIntroContinue}
            >
              <Text style={styles.primaryBtnText}>
                {isOutroSegment ? 'Continue' : 'Next'}
              </Text>
            </TouchableOpacity>
          </View>
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
  playingRoot: {
    flex: 1,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.lg,
  },
  video: {
    flex: 1,
    width: '100%',
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: '#000',
    marginBottom: spacing.lg,
  },
  skeletonRoot: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
  },
  skeletonAvatar: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: colors.border,
    marginBottom: spacing.lg,
  },
  skeletonLine: {
    height: 14,
    borderRadius: 7,
    backgroundColor: colors.border,
    marginBottom: spacing.sm,
  },
  skeletonLineWide: { width: '62%' },
  skeletonLineNarrow: { width: '40%' },
  playingFooter: {
    alignItems: 'center',
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
  journalRoot: { flex: 1, backgroundColor: colors.background },
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
