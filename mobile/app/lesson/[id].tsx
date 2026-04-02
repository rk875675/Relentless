import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  AppState,
  AppStateStatus,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { setAudioModeAsync, useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { apiFetch } from '@/lib/api';
import { setPendingGainDeltas } from '@/lib/pending-deltas';
import { colors, spacing } from '@/lib/theme';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type TimedTextCue = { start_s: number; text: string };
type ExerciseStep = { text: string; duration_seconds: number };

type VoiceoverBlock = {
  type: 'voiceover';
  audio_files: string[];
  total_audio_seconds: number;
  timed_text: TimedTextCue[];
};
type TimedExerciseBlock = {
  type: 'timed_exercise';
  duration_seconds: number;
  ambient_audio: string;
  steps: ExerciseStep[];
};
type JournalPromptBlock = {
  type: 'journal_prompt';
  prompt: string;
};

type ContentBlock = VoiceoverBlock | TimedExerciseBlock | JournalPromptBlock;

type LessonDetail = {
  id: string;
  title: string;
  duration_seconds: number;
  lesson_type: string;
  categories: string[];
  content_blocks?: { blocks: ContentBlock[] } | null;
  voiceover_url?: string | null;
  on_screen_text?: string | null;
  reflection_prompt?: string | null;
};

type Phase =
  | 'loading'
  | 'ready'
  | 'playing'
  | 'block_journal'
  | 'reflection'
  | 'completing'
  | 'done'
  | 'error'
  | 'terminated';

const MAC_COLORS: Record<string, string> = {
  mindfulness: colors.ringMindfulness,
  acceptance: colors.ringAcceptance,
  commitment: colors.ringCommitment,
} as const;

// ---------------------------------------------------------------------------
// Helper: compute total playback seconds from block data
// ---------------------------------------------------------------------------
function computeBlockDuration(blocks: ContentBlock[]): number {
  return blocks.reduce((acc, b) => {
    if (b.type === 'voiceover') return acc + b.total_audio_seconds;
    if (b.type === 'timed_exercise') return acc + b.duration_seconds;
    return acc;
  }, 0);
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function LessonPlayerScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();

  const [lesson, setLesson] = useState<LessonDetail | null>(null);
  const [phase, setPhase] = useState<Phase>('loading');
  const [errorMsg, setErrorMsg] = useState('');
  const [journalText, setJournalText] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Legacy flat-mode state
  const [elapsed, setElapsed] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Block-based state
  const [blockIndex, setBlockIndex] = useState(0);
  const [audioFileIndex, setAudioFileIndex] = useState(0);
  const [currentAudioUrl, setCurrentAudioUrl] = useState<string | null>(null);
  const [onScreenText, setOnScreenText] = useState('');
  const [exerciseElapsed, setExerciseElapsed] = useState(0);
  const textFade = useRef(new Animated.Value(1)).current;

  // Text cue tracking — guards against conflicting animations and backward regression
  const lastCueRef = useRef('');
  const highestCueIndexRef = useRef(-1);

  // Audio cue bar animations — 5 bars with random scaleY for organic movement
  const NUM_AUDIO_BARS = 5;
  const barScales = useRef(
    Array.from({ length: NUM_AUDIO_BARS }, () => new Animated.Value(0.4)),
  ).current;

  const sessionActive = useRef(false);
  const voiceoverStartPending = useRef(false);
  const audioFileIndexRef = useRef(0);
  const blockIndexRef = useRef(0);
  const cumulativeOffsetRef = useRef(0);
  const exerciseTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const journalTextRef = useRef('');
  const lessonRef = useRef<LessonDetail | null>(null);

  useEffect(() => { journalTextRef.current = journalText; }, [journalText]);
  useEffect(() => { lessonRef.current = lesson; }, [lesson]);

  const hasBlocks = Boolean(lesson?.content_blocks?.blocks?.length);
  const blocks = lesson?.content_blocks?.blocks ?? [];

  const legacySource = !hasBlocks ? (lesson?.voiceover_url ?? null) : null;
  const activeSource = hasBlocks ? currentAudioUrl : legacySource;

  const player = useAudioPlayer(activeSource, {
    updateInterval: 250,
    downloadFirst: false,
  });
  const audioStatus = useAudioPlayerStatus(player);

  // -----------------------------------------------------------------------
  // Load lesson
  // -----------------------------------------------------------------------
  useEffect(() => {
    if (!id) return;
    (async () => {
      const { data, error } = await apiFetch<LessonDetail>(`/lessons/${id}`);
      if (error || !data) {
        setErrorMsg(error ?? 'Failed to load lesson');
        setPhase('error');
        return;
      }
      setLesson(data);
      setPhase('ready');
    })();
  }, [id]);

  // -----------------------------------------------------------------------
  // Lock-in mode: background kills session
  // -----------------------------------------------------------------------
  useEffect(() => {
    const handleAppState = (next: AppStateStatus) => {
      if (next !== 'active' && sessionActive.current) {
        sessionActive.current = false;
        voiceoverStartPending.current = false;
        try { player.pause(); } catch { /* noop */ }
        stopAllTimers();
        setPhase('terminated');
      }
    };
    const sub = AppState.addEventListener('change', handleAppState);
    return () => sub.remove();
  }, [player]);

  useEffect(() => {
    return () => stopAllTimers();
  }, []);

  // -----------------------------------------------------------------------
  // Timer helpers
  // -----------------------------------------------------------------------
  const stopAllTimers = useCallback(() => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    if (exerciseTimerRef.current) { clearInterval(exerciseTimerRef.current); exerciseTimerRef.current = null; }
  }, []);

  // -----------------------------------------------------------------------
  // Audio cue bars — each bar independently oscillates scaleY to random
  // targets at random speeds, producing an organic, non-uniform visualiser.
  // -----------------------------------------------------------------------
  const animateBar = useCallback((anim: Animated.Value) => {
    const target = 0.2 + Math.random() * 0.8;
    const duration = 160 + Math.random() * 440;
    Animated.timing(anim, {
      toValue: target,
      duration,
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished) animateBar(anim);
    });
  }, []);

  useEffect(() => {
    if (phase !== 'playing') return;
    barScales.forEach((s) => animateBar(s));
    return () => { barScales.forEach((s) => s.stopAnimation()); };
  }, [phase, animateBar, barScales]);

  const pulseBars = useCallback(() => {
    barScales.forEach((s) => {
      s.stopAnimation();
      Animated.timing(s, {
        toValue: 1,
        duration: 80,
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (finished) animateBar(s);
      });
    });
  }, [barScales, animateBar]);

  // -----------------------------------------------------------------------
  // Complete lesson (reads from refs to avoid stale closures)
  // -----------------------------------------------------------------------
  const completeLesson = useCallback(async () => {
    const currentLesson = lessonRef.current;
    if (!currentLesson) return;
    setPhase('completing');

    const text = journalTextRef.current.trim();
    if (text.length > 0) {
      await apiFetch('/journal', {
        method: 'POST',
        body: { body: text, lesson_id: currentLesson.id },
      });
    }

    const { data: completeData, error } = await apiFetch<{
      progress?: { deltas?: Record<string, { amount: number; reason: string }> };
    }>(`/lessons/${currentLesson.id}/complete`, {
      method: 'POST',
      headers: { 'Idempotency-Key': `${currentLesson.id}-${Date.now()}` },
    });

    if (error) {
      setErrorMsg(error);
      setPhase('error');
    } else {
      if (completeData?.progress?.deltas) {
        setPendingGainDeltas(completeData.progress.deltas as any);
      }
      setPhase('done');
    }
  }, []);

  // -----------------------------------------------------------------------
  // Block-based: advance to next block
  // -----------------------------------------------------------------------
  const advanceBlock = useCallback(() => {
    const nextIdx = blockIndexRef.current + 1;
    const currentBlocks = lessonRef.current?.content_blocks?.blocks ?? [];
    if (nextIdx >= currentBlocks.length) {
      sessionActive.current = false;
      stopAllTimers();
      completeLesson();
      return;
    }
    blockIndexRef.current = nextIdx;
    setBlockIndex(nextIdx);
    startBlock(nextIdx);
  }, [completeLesson, stopAllTimers]);

  // -----------------------------------------------------------------------
  // Block-based: start a specific block
  // -----------------------------------------------------------------------
  const startBlock = useCallback((idx: number) => {
    const currentBlocks = lessonRef.current?.content_blocks?.blocks ?? [];
    const block = currentBlocks[idx];
    if (!block) return;

    if (block.type === 'voiceover') {
      audioFileIndexRef.current = 0;
      cumulativeOffsetRef.current = 0;
      setAudioFileIndex(0);
      setCurrentAudioUrl(block.audio_files[0] ?? null);
      voiceoverStartPending.current = true;
      // Reset text and cue tracking — timed-text effect handles fade-in on first cue
      lastCueRef.current = '';
      highestCueIndexRef.current = -1;
      textFade.setValue(0);
      setOnScreenText('');
    } else if (block.type === 'timed_exercise') {
      setExerciseElapsed(0);
      // Reset text — interval handles fade-in on first step
      lastCueRef.current = '';
      textFade.setValue(0);
      setOnScreenText('');
      setCurrentAudioUrl(block.ambient_audio ?? null);
      voiceoverStartPending.current = true;
      const start = Date.now();
      exerciseTimerRef.current = setInterval(() => {
        const secs = Math.floor((Date.now() - start) / 1000);
        setExerciseElapsed(secs);

        let cumulative = 0;
        for (let i = 0; i < block.steps.length; i++) {
          const prevCumulative = cumulative;
          cumulative += block.steps[i].duration_seconds;
          if (secs >= prevCumulative && secs < cumulative) {
            const target = block.steps[i].text;
            if (target !== lastCueRef.current) {
              lastCueRef.current = target;
              pulseBars();
              Animated.timing(textFade, { toValue: 0, duration: 150, useNativeDriver: true }).start(() => {
                setOnScreenText(target);
                Animated.timing(textFade, { toValue: 1, duration: 250, useNativeDriver: true }).start();
              });
            }
            break;
          }
        }

        if (secs >= block.duration_seconds) {
          if (exerciseTimerRef.current) { clearInterval(exerciseTimerRef.current); exerciseTimerRef.current = null; }
          try { player.pause(); } catch { /* noop */ }
          setCurrentAudioUrl(null);
          advanceBlock();
        }
      }, 250);
    } else if (block.type === 'journal_prompt') {
      setCurrentAudioUrl(null);
      setOnScreenText(block.prompt);
      setPhase('block_journal');
    }
  }, [player, advanceBlock, textFade, pulseBars]);

  // -----------------------------------------------------------------------
  // Audio: auto-play when loaded
  // -----------------------------------------------------------------------
  useEffect(() => {
    if (phase !== 'playing' || !voiceoverStartPending.current) return;
    if (!audioStatus.isLoaded) return;
    voiceoverStartPending.current = false;
    void player.seekTo(0).then(() => { player.play(); });
  }, [phase, audioStatus.isLoaded, player]);

  // -----------------------------------------------------------------------
  // Audio finished: advance to next file or next block
  // -----------------------------------------------------------------------
  useEffect(() => {
    if (phase !== 'playing' || !audioStatus.didJustFinish) return;

    if (hasBlocks) {
      const currentBlocks = lessonRef.current?.content_blocks?.blocks ?? [];
      const block = currentBlocks[blockIndexRef.current];
      if (!block || block.type !== 'voiceover') return;

      const nextFileIdx = audioFileIndexRef.current + 1;
      if (nextFileIdx < block.audio_files.length) {
        cumulativeOffsetRef.current += audioStatus.duration;
        audioFileIndexRef.current = nextFileIdx;
        setAudioFileIndex(nextFileIdx);
        setCurrentAudioUrl(block.audio_files[nextFileIdx]);
        voiceoverStartPending.current = true;
      } else {
        advanceBlock();
      }
    } else {
      finishLegacyPlayback();
    }
  }, [phase, audioStatus.didJustFinish, hasBlocks, advanceBlock]);

  // -----------------------------------------------------------------------
  // Block voiceover: update timed text based on playback position.
  // Guards:
  //  1. !audioStatus.isLoaded — skip during file-switch loading gap (prevents
  //     currentTime reset from causing backward cue regression).
  //  2. highestCueIndexRef — only allow forward cue progression; never regress
  //     to an earlier cue even if absoluteTime briefly dips during file switch.
  //  3. pulseBars() on each new cue — makes bars react to speech transitions.
  // -----------------------------------------------------------------------
  useEffect(() => {
    if (phase !== 'playing' || !hasBlocks || !audioStatus.isLoaded) return;
    const currentBlocks = lessonRef.current?.content_blocks?.blocks ?? [];
    const block = currentBlocks[blockIndexRef.current];
    if (!block || block.type !== 'voiceover') return;

    const absoluteTime = cumulativeOffsetRef.current + audioStatus.currentTime;
    const cues = block.timed_text;

    let activeCueIdx = 0;
    for (let i = cues.length - 1; i >= 0; i--) {
      if (absoluteTime >= cues[i].start_s) {
        activeCueIdx = i;
        break;
      }
    }

    // Never go backward — protects against currentTime reset at file boundaries
    if (activeCueIdx < highestCueIndexRef.current) return;
    highestCueIndexRef.current = activeCueIdx;

    const activeCue = cues[activeCueIdx]?.text ?? '';
    if (activeCue !== lastCueRef.current) {
      lastCueRef.current = activeCue;
      pulseBars();
      Animated.timing(textFade, { toValue: 0, duration: 150, useNativeDriver: true }).start(() => {
        setOnScreenText(activeCue);
        Animated.timing(textFade, { toValue: 1, duration: 250, useNativeDriver: true }).start();
      });
    }
  }, [phase, hasBlocks, audioStatus.currentTime, audioStatus.isLoaded, textFade, pulseBars]);

  // -----------------------------------------------------------------------
  // Start lesson
  // -----------------------------------------------------------------------
  const startLesson = () => {
    if (!lesson) return;
    sessionActive.current = true;
    setElapsed(0);
    setPhase('playing');

    if (hasBlocks) {
      blockIndexRef.current = 0;
      setBlockIndex(0);
      void setAudioModeAsync({
        playsInSilentMode: true,
        interruptionMode: 'doNotMix',
        allowsRecording: false,
        shouldPlayInBackground: false,
      });
      startBlock(0);
      return;
    }

    // Legacy flat mode
    if (lesson.voiceover_url) {
      voiceoverStartPending.current = true;
      void setAudioModeAsync({
        playsInSilentMode: true,
        interruptionMode: 'doNotMix',
        allowsRecording: false,
        shouldPlayInBackground: false,
      });
      return;
    }

    const start = Date.now();
    timerRef.current = setInterval(() => {
      const secs = Math.floor((Date.now() - start) / 1000);
      setElapsed(secs);
      if (secs >= lesson.duration_seconds) finishLegacyPlayback();
    }, 250);
  };

  // -----------------------------------------------------------------------
  // Legacy finish
  // -----------------------------------------------------------------------
  const finishLegacyPlayback = useCallback(() => {
    sessionActive.current = false;
    voiceoverStartPending.current = false;
    stopAllTimers();
    try { player.pause(); } catch { /* noop */ }
    if (lessonRef.current?.reflection_prompt) {
      setPhase('reflection');
    } else {
      completeLesson();
    }
  }, [player, stopAllTimers, completeLesson]);

  // -----------------------------------------------------------------------
  // Handle block journal submit
  // -----------------------------------------------------------------------
  const handleBlockJournalContinue = useCallback(() => {
    sessionActive.current = false;
    stopAllTimers();
    completeLesson();
  }, [completeLesson, stopAllTimers]);

  // -----------------------------------------------------------------------
  // Restart after termination
  // -----------------------------------------------------------------------
  const handleRestart = () => {
    voiceoverStartPending.current = false;
    try { player.pause(); void player.seekTo(0); } catch { /* noop */ }
    setPhase('ready');
    setElapsed(0);
    setBlockIndex(0);
    setAudioFileIndex(0);
    setCurrentAudioUrl(null);
    setOnScreenText('');
    setExerciseElapsed(0);
    setJournalText('');
    lastCueRef.current = '';
    highestCueIndexRef.current = -1;
    blockIndexRef.current = 0;
    audioFileIndexRef.current = 0;
    cumulativeOffsetRef.current = 0;
  };

  // -----------------------------------------------------------------------
  // Helpers
  // -----------------------------------------------------------------------
  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs) % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const currentBlock = hasBlocks ? blocks[blockIndex] : null;
  const isVoiceoverBlock = currentBlock?.type === 'voiceover';
  const isExerciseBlock = currentBlock?.type === 'timed_exercise';

  const hasLegacyVoiceover = !hasBlocks && Boolean(lesson?.voiceover_url);
  const legacyAudioElapsed = Math.floor(audioStatus.currentTime);
  const legacyTotal =
    hasLegacyVoiceover && audioStatus.duration > 0
      ? audioStatus.duration
      : (lesson?.duration_seconds ?? 0);
  const legacyDisplayElapsed =
    hasLegacyVoiceover && phase === 'playing' ? legacyAudioElapsed : elapsed;
  const legacyProgress = legacyTotal > 0 ? Math.min(legacyDisplayElapsed / legacyTotal, 1) : 0;

  const primaryCat = lesson?.categories?.[0] ?? '';
  const catColor = MAC_COLORS[primaryCat] ?? colors.accentLight;

  // Block-mode progress (for progress bar only)
  let blockProgress = 0;
  if (hasBlocks && phase === 'playing') {
    if (isVoiceoverBlock) {
      const t = cumulativeOffsetRef.current + audioStatus.currentTime;
      const total = (currentBlock as VoiceoverBlock).total_audio_seconds;
      blockProgress = total > 0 ? Math.min(t / total, 1) : 0;
    } else if (isExerciseBlock) {
      const total = (currentBlock as TimedExerciseBlock).duration_seconds;
      blockProgress = total > 0 ? Math.min(exerciseElapsed / total, 1) : 0;
    }
  }

  // Ready screen duration — computed from blocks when available, rounded to ~X min
  const readyDurationLabel = hasBlocks && blocks.length > 0
    ? `~${Math.round(computeBlockDuration(blocks) / 60)} min`
    : formatTime(lesson?.duration_seconds ?? 0);

  const barBaseHeights = [10, 20, 28, 16, 22];
  const audioBars = phase === 'playing' ? (
    <View style={styles.audioCue}>
      {barScales.map((scaleAnim, i) => (
        <Animated.View
          key={i}
          style={[
            styles.audioCueBar,
            {
              height: barBaseHeights[i],
              backgroundColor: catColor,
              transform: [{ scaleY: scaleAnim }],
            },
          ]}
        />
      ))}
    </View>
  ) : null;

  // -----------------------------------------------------------------------
  // Render
  // -----------------------------------------------------------------------
  return (
    <>
      <Stack.Screen options={{ headerShown: false, gestureEnabled: phase !== 'playing' }} />
      <SafeAreaView style={styles.container}>
        <View style={styles.topBar}>
          {phase !== 'playing' ? (
            <TouchableOpacity onPress={() => router.back()} hitSlop={12}>
              <Ionicons name="close" size={28} color={colors.textSecondary} />
            </TouchableOpacity>
          ) : (
            <View style={{ width: 28 }} />
          )}
          {primaryCat ? (
            <View style={[styles.catBadge, { borderColor: catColor }]}>
              <Text style={[styles.catBadgeText, { color: catColor }]}>
                {primaryCat.toUpperCase()}
              </Text>
            </View>
          ) : <View />}
          <View style={{ width: 28 }} />
        </View>

        {phase === 'loading' && (
          <View style={styles.centered}>
            <ActivityIndicator color={colors.accent} size="large" />
          </View>
        )}

        {phase === 'error' && (
          <View style={styles.centered}>
            <Ionicons name="alert-circle-outline" size={48} color={colors.error} />
            <Text style={styles.errorText}>{errorMsg}</Text>
            <TouchableOpacity style={styles.secondaryBtn} onPress={() => router.back()}>
              <Text style={styles.secondaryBtnText}>Go back</Text>
            </TouchableOpacity>
          </View>
        )}

        {phase === 'terminated' && (
          <View style={styles.centered}>
            <Ionicons name="pause-circle-outline" size={48} color={colors.textMuted} />
            <Text style={styles.terminatedTitle}>Session ended</Text>
            <Text style={styles.terminatedSub}>
              Leaving the app during a session gives 0 credit. Stay locked in next time.
            </Text>
            <TouchableOpacity style={styles.primaryBtn} onPress={handleRestart}>
              <Text style={styles.primaryBtnText}>Restart</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.secondaryBtn} onPress={() => router.back()}>
              <Text style={styles.secondaryBtnText}>Leave</Text>
            </TouchableOpacity>
          </View>
        )}

        {phase === 'ready' && lesson && (
          <View style={styles.centered}>
            <Text style={styles.readyTitle}>{lesson.title}</Text>
            <Text style={styles.readyDuration}>{readyDurationLabel}</Text>
            {!hasBlocks && lesson.on_screen_text && (
              <Text style={styles.readyDesc}>{lesson.on_screen_text}</Text>
            )}
            <TouchableOpacity style={styles.primaryBtn} onPress={startLesson}>
              <Text style={styles.primaryBtnText}>Begin</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Block-mode: voiceover — text-centric, no timer */}
        {phase === 'playing' && lesson && hasBlocks && isVoiceoverBlock && (
          <View style={styles.centered}>
            {!audioStatus.isLoaded && (
              <Text style={styles.bufferingHint}>Loading audio…</Text>
            )}
            <Animated.Text style={[styles.blockText, { opacity: textFade }]}>
              {onScreenText}
            </Animated.Text>
            {audioBars}
            <View style={styles.progressBarTrack}>
              <View
                style={[styles.progressBarFill, { width: `${blockProgress * 100}%`, backgroundColor: catColor }]}
              />
            </View>
          </View>
        )}

        {/* Block-mode: timed exercise — text card + audio cue bars */}
        {phase === 'playing' && lesson && hasBlocks && isExerciseBlock && (
          <View style={styles.centered}>
            <View style={styles.exerciseCard}>
              <Animated.Text style={[styles.exerciseText, { opacity: textFade }]}>
                {onScreenText}
              </Animated.Text>
            </View>
            {audioBars}
            <View style={styles.progressBarTrack}>
              <View
                style={[styles.progressBarFill, { width: `${blockProgress * 100}%`, backgroundColor: catColor }]}
              />
            </View>
          </View>
        )}

        {/* Legacy flat-mode playing */}
        {phase === 'playing' && lesson && !hasBlocks && (
          <View style={styles.centered}>
            <View style={styles.timerContainer}>
              <Text style={styles.timerText}>{formatTime(legacyDisplayElapsed)}</Text>
              <Text style={styles.timerTotal}>/ {formatTime(legacyTotal)}</Text>
            </View>
            {hasLegacyVoiceover && !audioStatus.isLoaded && (
              <Text style={styles.bufferingHint}>Loading audio…</Text>
            )}
            <View style={styles.progressBarTrack}>
              <View
                style={[styles.progressBarFill, { width: `${legacyProgress * 100}%`, backgroundColor: catColor }]}
              />
            </View>
            {lesson.on_screen_text && (
              <Text style={styles.onScreenText}>{lesson.on_screen_text}</Text>
            )}
          </View>
        )}

        {phase === 'block_journal' && lesson && (
          <KeyboardAvoidingView
            style={{ flex: 1 }}
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            keyboardVerticalOffset={60}
          >
            <ScrollView
              contentContainerStyle={styles.reflectionContent}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="interactive"
            >
              <Ionicons
                name="create-outline"
                size={48}
                color={colors.accentLight}
                style={{ alignSelf: 'center', marginBottom: spacing.md }}
              />
              <Text style={styles.reflectionTitle}>Journal</Text>
              <Text style={styles.reflectionPrompt}>{onScreenText}</Text>
              <TextInput
                style={styles.journalInput}
                placeholder="Write your reflection..."
                placeholderTextColor={colors.textMuted}
                value={journalText}
                onChangeText={setJournalText}
                multiline
                autoFocus
              />
              <TouchableOpacity
                style={styles.primaryBtn}
                onPress={handleBlockJournalContinue}
                disabled={submitting}
              >
                <Text style={styles.primaryBtnText}>
                  {journalText.trim().length > 0 ? 'Save & Finish' : 'Skip & Finish'}
                </Text>
              </TouchableOpacity>
            </ScrollView>
          </KeyboardAvoidingView>
        )}

        {phase === 'reflection' && lesson && (
          <KeyboardAvoidingView
            style={{ flex: 1 }}
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            keyboardVerticalOffset={60}
          >
            <ScrollView
              contentContainerStyle={styles.reflectionContent}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="interactive"
            >
              <Ionicons
                name="checkmark-circle"
                size={48}
                color={colors.success}
                style={{ alignSelf: 'center', marginBottom: spacing.md }}
              />
              <Text style={styles.reflectionTitle}>Nice work</Text>
              {lesson.reflection_prompt && (
                <>
                  <Text style={styles.reflectionPrompt}>{lesson.reflection_prompt}</Text>
                  <TextInput
                    style={styles.journalInput}
                    placeholder="Write your reflection..."
                    placeholderTextColor={colors.textMuted}
                    value={journalText}
                    onChangeText={setJournalText}
                    multiline
                    autoFocus
                  />
                </>
              )}
              <TouchableOpacity style={styles.primaryBtn} onPress={completeLesson} disabled={submitting}>
                {submitting ? (
                  <ActivityIndicator color={colors.white} />
                ) : (
                  <Text style={styles.primaryBtnText}>
                    {journalText.trim().length > 0 ? 'Save & Finish' : 'Finish'}
                  </Text>
                )}
              </TouchableOpacity>
            </ScrollView>
          </KeyboardAvoidingView>
        )}

        {phase === 'completing' && (
          <View style={styles.centered}>
            <ActivityIndicator color={colors.accent} size="large" />
            <Text style={styles.completingText}>Saving progress...</Text>
          </View>
        )}

        {phase === 'done' && lesson && (
          <View style={styles.centered}>
            <Ionicons name="trophy-outline" size={56} color={colors.accentLight} />
            <Text style={styles.doneTitle}>Workout Complete</Text>
            <Text style={styles.doneSub}>{lesson.title}</Text>
            <TouchableOpacity style={styles.primaryBtn} onPress={() => router.back()}>
              <Text style={styles.primaryBtnText}>Done</Text>
            </TouchableOpacity>
          </View>
        )}
      </SafeAreaView>
    </>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  catBadge: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 4,
  },
  catBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.5,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
  },
  readyTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: colors.textPrimary,
    textAlign: 'center',
    marginBottom: spacing.md,
  },
  readyDuration: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.textMuted,
    marginBottom: spacing.lg,
  },
  readyDesc: {
    fontSize: 15,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: spacing.xl,
    paddingHorizontal: spacing.md,
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
  exerciseCard: {
    backgroundColor: colors.surface,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: 40,
    paddingHorizontal: spacing.xl,
    marginBottom: spacing.xl,
    width: '100%',
  },
  exerciseText: {
    fontSize: 20,
    fontWeight: '600',
    color: colors.textPrimary,
    textAlign: 'center',
    lineHeight: 30,
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
  timerContainer: {
    alignItems: 'center',
    marginBottom: spacing.xl,
  },
  timerText: {
    fontSize: 56,
    fontWeight: '200',
    color: colors.textPrimary,
    fontVariant: ['tabular-nums'],
  },
  timerTotal: {
    fontSize: 16,
    color: colors.textMuted,
    marginTop: 4,
  },
  bufferingHint: {
    fontSize: 13,
    color: colors.textMuted,
    marginBottom: spacing.md,
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
  onScreenText: {
    fontSize: 17,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 26,
    paddingHorizontal: spacing.md,
  },
  reflectionContent: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.xl,
  },
  reflectionTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: colors.textPrimary,
    textAlign: 'center',
    marginBottom: spacing.lg,
  },
  reflectionPrompt: {
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
    marginBottom: spacing.xl,
  },
  terminatedTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: colors.textPrimary,
    marginTop: spacing.lg,
  },
  terminatedSub: {
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 21,
    marginTop: spacing.sm,
    marginBottom: spacing.xl,
  },
  completingText: {
    color: colors.textMuted,
    fontSize: 14,
    marginTop: spacing.md,
  },
  errorText: {
    color: colors.error,
    fontSize: 14,
    textAlign: 'center',
    marginTop: spacing.md,
    marginBottom: spacing.lg,
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
  secondaryBtn: {
    marginTop: spacing.md,
    paddingVertical: 12,
    paddingHorizontal: 32,
  },
  secondaryBtnText: {
    color: colors.textMuted,
    fontSize: 14,
    fontWeight: '500',
  },
});
