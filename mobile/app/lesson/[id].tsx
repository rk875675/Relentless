import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  AppState,
  AppStateStatus,
  KeyboardAvoidingView,
  PanResponder,
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
import * as Haptics from 'expo-haptics';
import { apiFetch } from '@/lib/api';
import { bustCache } from '@/lib/api-cache';
import { setPendingGainDeltas } from '@/lib/pending-deltas';
import { colors, spacing } from '@/lib/theme';
import FormattedJournalBody from '@/components/FormattedJournalBody';
import PromptCards from '@/components/lesson/PromptCards';
import BubbleSortExercise from '@/components/lesson/BubbleSort';
import TwoColumnSortExercise from '@/components/lesson/TwoColumnSort';
import ListBuilderExercise from '@/components/lesson/ListBuilder';
import CountdownTimerExercise from '@/components/lesson/CountdownTimer';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type TimedTextCue = { start_s: number; text: string };
type HapticIntensity = 'light' | 'medium' | 'heavy';
type HapticCue = { at_offset_seconds: number; intensity: HapticIntensity };
type HapticPattern = { cycle_seconds: number; cues: HapticCue[] };
type ExerciseStep = { text: string; duration_seconds: number; haptic?: HapticIntensity };

type VoiceoverBlock = {
  type: 'voiceover';
  audio_files: string[];
  total_audio_seconds: number;
  timed_text: TimedTextCue[];
};
type TimedExerciseBlock = {
  type: 'timed_exercise';
  duration_seconds: number;
  ambient_audio?: string | null;
  interactive_model?: string;
  haptic_pattern?: HapticPattern;
  visual_cues?: string[];
  steps: ExerciseStep[];
};
type JournalPromptBlock = {
  type: 'journal_prompt';
  prompt: string;
};
type FlashCard = { front: string; back: string };
type FlashCardsBlock = {
  type: 'flash_cards';
  ambient_audio?: string | null;
  cards: FlashCard[];
};
type TapThroughTextBlock = {
  type: 'tap_through_text';
  ambient_audio?: string | null;
  paragraphs: string[];
};

type PromptCardItem = { intro_hold_seconds: number; prompt: string; min_entry_seconds: number };
type PromptCardsSummary = { display: 'last' | 'all'; header: string; hold_seconds: number; save_to_profile?: boolean };
type PromptCardsBlock = {
  type: 'prompt_cards';
  ambient_audio?: string | null;
  cards: PromptCardItem[];
  summary: PromptCardsSummary;
};

type BubbleSortBlock = {
  type: 'bubble_sort';
  ambient_audio?: string | null;
  entry_instruction: string;
  entry_done_label: string;
  discard_instruction: string;
  can_restore: boolean;
  action_prompt: string;
};

type TwoColumnSortBlock = {
  type: 'two_column_sort';
  ambient_audio?: string | null;
  columns: { id: string; label: string }[];
  min_per_column: number;
  min_entry_seconds: number;
  intro_hold_seconds: number;
  close_column_id: string;
  action_prompt: string;
};

type ListBuilderBlock = {
  type: 'list_builder';
  ambient_audio?: string | null;
  prompts: string[];
  min_entries: number;
  min_entry_seconds: number;
  summary_header: string;
  summary_hold_seconds: number;
  save_to_profile?: boolean;
};

type CountdownTimerBlock = {
  type: 'countdown_timer';
  ambient_audio?: string | null;
  duration_seconds: number;
  task_list: string[];
  completion_message: string;
  completion_hold_seconds: number;
};

type ContentBlock =
  | VoiceoverBlock
  | TimedExerciseBlock
  | JournalPromptBlock
  | FlashCardsBlock
  | TapThroughTextBlock
  | PromptCardsBlock
  | BubbleSortBlock
  | TwoColumnSortBlock
  | ListBuilderBlock
  | CountdownTimerBlock;

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
  | 'streak'
  | 'error'
  | 'terminated';

const MAC_COLORS: Record<string, string> = {
  mindfulness: colors.ringMindfulness,
  acceptance: colors.ringAcceptance,
  commitment: colors.ringCommitment,
} as const;

// ---------------------------------------------------------------------------
// Helper: fire a haptic at the specified intensity
// ---------------------------------------------------------------------------
function fireHaptic(intensity: HapticIntensity): void {
  switch (intensity) {
    case 'heavy': Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy); break;
    case 'medium': Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); break;
    case 'light': Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); break;
  }
}

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
  const [journalExerciseContext, setJournalExerciseContext] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [doneDeltas, setDoneDeltas] = useState<Record<string, { amount: number; reason: string }> | null>(null);
  const [streakCount, setStreakCount] = useState(0);
  const preStreakDateRef = useRef<string | null>(null);
  // Accumulates written content from component-block exercises for the journal.
  const journalPartsRef = useRef<string[]>([]);

  const doneAnim1 = useRef(new Animated.Value(0)).current;
  const doneAnim2 = useRef(new Animated.Value(0)).current;
  const doneAnim3 = useRef(new Animated.Value(0)).current;
  const doneAnim4 = useRef(new Animated.Value(0)).current;
  const doneScale = useRef(new Animated.Value(0.3)).current;

  const streakAnim1 = useRef(new Animated.Value(0)).current;
  const streakAnim2 = useRef(new Animated.Value(0)).current;
  const streakScale = useRef(new Animated.Value(0.3)).current;
  const glowPulse = useRef(new Animated.Value(1)).current;

  // Legacy flat-mode state
  const [elapsed, setElapsed] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Block-based state
  const [blockIndex, setBlockIndex] = useState(0);
  const [audioFileIndex, setAudioFileIndex] = useState(0);
  const [currentAudioUrl, setCurrentAudioUrl] = useState<string | null>(null);
  const [onScreenText, setOnScreenText] = useState('');
  const [exerciseElapsed, setExerciseElapsed] = useState(0);
  const [exerciseStepIndex, setExerciseStepIndex] = useState(0);
  const textFade = useRef(new Animated.Value(1)).current;
  const cardScale = useRef(new Animated.Value(1)).current;
  const progressAnim = useRef(new Animated.Value(0)).current;

  // Flash card state
  const [flashCardIndex, setFlashCardIndex] = useState(0);
  const [flashCardFlipped, setFlashCardFlipped] = useState(false);
  const flipAnim = useRef(new Animated.Value(0)).current;

  // Tap-through text state
  const [tapThroughIndex, setTapThroughIndex] = useState(0);
  const tapThroughIndexRef = useRef(0);
  const tapThroughSlideX = useRef(new Animated.Value(0)).current;
  // Ref so the PanResponder (created once) always calls the latest callback
  const advanceTapThroughCallbackRef = useRef<(dir: 'forward' | 'back') => void>(() => {});

  // Breath circle animation shared across all circle-based exercise models
  // (box_breathing, coffee_breath, milk_breath, whiskey_breath).
  // 0 = fully exhaled / contracted, 1 = fully inhaled / expanded.
  const breathCircleAnim = useRef(new Animated.Value(0)).current;
  const breathAnimRef = useRef<Animated.CompositeAnimation | null>(null);

  // Haptic tracking — prevents double-firing within the same elapsed second
  const lastHapticSecRef = useRef(-1);
  // Box breathing phase tracking — fires haptic on phase transitions
  const lastBoxPhaseRef = useRef(-1);

  // Box breathing visual cues — motivational phrases that cycle every 10 s
  const [boxCueIndex, setBoxCueIndex] = useState(0);
  const boxCueFade = useRef(new Animated.Value(0)).current;
  const lastBoxCueSecRef = useRef(-1);

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

  // Audio fallback: when audio files are missing, drive voiceover via timer
  const audioFallbackActive = useRef(false);
  const audioFallbackTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const audioFallbackTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const audioFallbackStartRef = useRef(0);
  const [audioFallbackElapsed, setAudioFallbackElapsed] = useState(0);

  useEffect(() => { journalTextRef.current = journalText; }, [journalText]);
  useEffect(() => { lessonRef.current = lesson; }, [lesson]);

  const hasBlocks = Boolean(lesson?.content_blocks?.blocks?.length);
  const blocks = lesson?.content_blocks?.blocks ?? [];

  const legacySource = !hasBlocks ? (lesson?.voiceover_url ?? null) : null;
  const activeSource = hasBlocks ? currentAudioUrl : legacySource;

  const player = useAudioPlayer(activeSource, {
    updateInterval: 100,
    downloadFirst: false,
  });
  const audioStatus = useAudioPlayerStatus(player);

  // Dedicated ambient player — preloads the ambient URL as soon as lesson data
  // arrives so the music is already buffered when the timed exercise starts.
  const ambientSource = useMemo(() => {
    if (!lesson?.content_blocks?.blocks) return null;
    for (const b of lesson.content_blocks.blocks) {
      if (
        b.type !== 'voiceover' && b.type !== 'journal_prompt' &&
        'ambient_audio' in b && b.ambient_audio
      ) {
        return b.ambient_audio;
      }
    }
    return null;
  }, [lesson]);

  const ambientPlayer = useAudioPlayer(ambientSource, {
    updateInterval: 1000,
    downloadFirst: false,
  });

  // Snapshot pre-completion streak date so we can skip the celebration
  // for second+ lessons on the same day.
  useEffect(() => {
    apiFetch<{ last_activity_date: string | null }>('/streak').then(({ data }) => {
      preStreakDateRef.current = data?.last_activity_date ?? null;
    });
  }, []);

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
        try { ambientPlayer.pause(); } catch { /* noop */ }
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
    if (breathAnimRef.current) { breathAnimRef.current.stop(); breathAnimRef.current = null; }
    if (audioFallbackTimerRef.current) { clearInterval(audioFallbackTimerRef.current); audioFallbackTimerRef.current = null; }
    if (audioFallbackTimeoutRef.current) { clearTimeout(audioFallbackTimeoutRef.current); audioFallbackTimeoutRef.current = null; }
    audioFallbackActive.current = false;
    progressAnim.stopAnimation();
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
  const completingRef = useRef(false);

  const completeLesson = useCallback(async () => {
    const currentLesson = lessonRef.current;
    if (!currentLesson || completingRef.current) return;
    completingRef.current = true;
    setSubmitting(true);
    setPhase('completing');

    const parts = [
      ...journalPartsRef.current,
      journalTextRef.current.trim(),
    ].filter(Boolean);
    if (parts.length > 0) {
      await apiFetch('/journal', {
        method: 'POST',
        body: { body: parts.join('\n\n---\n\n'), lesson_id: currentLesson.id },
      });
    }

    const { data: completeData, error } = await apiFetch<{
      progress?: { deltas?: Record<string, { amount: number; reason: string }> };
    }>(`/lessons/${currentLesson.id}/complete`, {
      method: 'POST',
      headers: { 'Idempotency-Key': `${currentLesson.id}-${Date.now()}` },
    });

    if (error) {
      completingRef.current = false;
      setSubmitting(false);
      setErrorMsg(error);
      setPhase('error');
    } else {
      if (completeData?.progress?.deltas) {
        setPendingGainDeltas(completeData.progress.deltas as any);
        setDoneDeltas(completeData.progress.deltas);
      }
      bustCache('/lessons/next', '/progress', '/streak');
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
      // Reset audio fallback state
      audioFallbackActive.current = false;
      if (audioFallbackTimerRef.current) { clearInterval(audioFallbackTimerRef.current); audioFallbackTimerRef.current = null; }
      if (audioFallbackTimeoutRef.current) { clearTimeout(audioFallbackTimeoutRef.current); audioFallbackTimeoutRef.current = null; }
      setAudioFallbackElapsed(0);
      // Start fallback timeout: if audio hasn't loaded in 1.5s, drive voiceover via timer
      audioFallbackTimeoutRef.current = setTimeout(() => {
        if (!voiceoverStartPending.current) return;
        voiceoverStartPending.current = false;
        audioFallbackActive.current = true;
        audioFallbackStartRef.current = Date.now();
        audioFallbackTimerRef.current = setInterval(() => {
          const el = (Date.now() - audioFallbackStartRef.current) / 1000;
          setAudioFallbackElapsed(el);
        }, 100);
      }, 1500);
    } else if (block.type === 'timed_exercise') {
      setExerciseElapsed(0);
      setExerciseStepIndex(0);
      lastCueRef.current = '';
      textFade.setValue(0);
      cardScale.setValue(1);
      setOnScreenText('');
      // Reset haptic + visual cue tracking
      lastHapticSecRef.current = -1;
      lastBoxPhaseRef.current = -1;
      lastBoxCueSecRef.current = -1;
      setBoxCueIndex(0);
      boxCueFade.setValue(0);
      // If ambient is already playing (continuous from tap_through_text), leave it.
      // Otherwise seek to 0 and start (e.g. when exercise is the first block).
      try {
        if (!ambientPlayer.playing) {
          ambientPlayer.seekTo(0).then(() => ambientPlayer.play()).catch(() => {});
        }
      } catch { /* noop */ }

      // For box_breathing, extend to the next complete 16s cycle boundary so
      // the session always ends after the hold-post-exhale phase (not mid-breath).
      const effectiveDuration =
        block.interactive_model === 'box_breathing'
          ? Math.ceil(block.duration_seconds / 16) * 16
          : block.duration_seconds;

      progressAnim.setValue(0);
      Animated.timing(progressAnim, {
        toValue: 1,
        duration: effectiveDuration * 1000,
        useNativeDriver: false,
      }).start();

      // Drive the breath circle for all circle-based models.
      // Each entry is [inhaleMs, holdInMs, exhaleMs, holdOutMs].
      const CIRCLE_TIMING: Record<string, [number, number, number, number]> = {
        box_breathing:  [4000, 4000, 4000, 4000],
        coffee_breath:  [1000,    0, 1000,    0],
        milk_breath:    [4000,    0, 4000,    0],
        whiskey_breath: [4000,    0, 8000,    0],
      };
      const timing = block.interactive_model ? CIRCLE_TIMING[block.interactive_model] : undefined;
      if (timing) {
        breathCircleAnim.setValue(0);
        const [inhaleMs, holdInMs, exhaleMs, holdOutMs] = timing;
        const parts: Animated.CompositeAnimation[] = [
          Animated.timing(breathCircleAnim, { toValue: 1, duration: inhaleMs, useNativeDriver: true }),
        ];
        if (holdInMs > 0) parts.push(Animated.delay(holdInMs));
        parts.push(Animated.timing(breathCircleAnim, { toValue: 0, duration: exhaleMs, useNativeDriver: true }));
        if (holdOutMs > 0) parts.push(Animated.delay(holdOutMs));
        breathAnimRef.current = Animated.loop(Animated.sequence(parts));
        breathAnimRef.current.start();
      }

      const start = Date.now();
      exerciseTimerRef.current = setInterval(() => {
        const secs = Math.floor((Date.now() - start) / 1000);
        setExerciseElapsed(secs);

        // --- Haptics: box_breathing phase transitions (step-level) ---
        if (block.interactive_model === 'box_breathing') {
          const phaseIdx = Math.floor((secs % 16) / 4);
          if (phaseIdx !== lastBoxPhaseRef.current) {
            lastBoxPhaseRef.current = phaseIdx;
            const step = block.steps[phaseIdx];
            if (step?.haptic) fireHaptic(step.haptic);
          }
        }

        // --- Haptics: repeating pattern (coffee / milk / whiskey breath) ---
        if (block.haptic_pattern && secs !== lastHapticSecRef.current) {
          const { cycle_seconds, cues } = block.haptic_pattern;
          const cyclePos = secs % cycle_seconds;
          for (const cue of cues) {
            if (Math.floor(cue.at_offset_seconds) === cyclePos) {
              lastHapticSecRef.current = secs;
              fireHaptic(cue.intensity);
              break;
            }
          }
        }

        // --- Step advancement (non-box-breathing) + step-level haptics ---
        if (block.interactive_model !== 'box_breathing') {
          let cumulative = 0;
          for (let i = 0; i < block.steps.length; i++) {
            const prevCumulative = cumulative;
            cumulative += block.steps[i].duration_seconds;
            if (secs >= prevCumulative && secs < cumulative) {
              const target = block.steps[i].text;
              if (target !== lastCueRef.current) {
                lastCueRef.current = target;
                setExerciseStepIndex(i);
                // Step-level haptic (body_scan uses this; coffee/milk/whiskey use haptic_pattern)
                if (block.steps[i].haptic) fireHaptic(block.steps[i].haptic!);
                pulseBars();
                Animated.parallel([
                  Animated.timing(textFade, { toValue: 0, duration: 120, useNativeDriver: true }),
                  Animated.timing(cardScale, { toValue: 0.96, duration: 120, useNativeDriver: true }),
                ]).start(() => {
                  setOnScreenText(target);
                  Animated.parallel([
                    Animated.timing(textFade, { toValue: 1, duration: 280, useNativeDriver: true }),
                    Animated.spring(cardScale, { toValue: 1, friction: 6, tension: 100, useNativeDriver: true }),
                  ]).start();
                });
              }
              break;
            }
          }
        }

        // --- Box breathing visual cues — cycle every 10 s ---
        if (block.interactive_model === 'box_breathing' && block.visual_cues?.length) {
          const cueIdx = Math.min(Math.floor(secs / 10), block.visual_cues.length - 1);
          if (cueIdx !== lastBoxCueSecRef.current) {
            lastBoxCueSecRef.current = cueIdx;
            setBoxCueIndex(cueIdx);
            boxCueFade.setValue(0);
            Animated.timing(boxCueFade, { toValue: 1, duration: 600, useNativeDriver: true }).start();
          }
        }

        // Box breathing: only stop at the end of a complete 16s cycle so the
        // session always concludes after the hold-post-exhale (never mid-breath).
        const done = block.interactive_model === 'box_breathing'
          ? secs >= effectiveDuration
          : secs >= block.duration_seconds;

        if (done) {
          if (exerciseTimerRef.current) { clearInterval(exerciseTimerRef.current); exerciseTimerRef.current = null; }
          if (breathAnimRef.current) { breathAnimRef.current.stop(); breathAnimRef.current = null; }
          try { ambientPlayer.pause(); } catch { /* noop */ }
          advanceBlock();
        }
      }, 250);
    } else if (block.type === 'flash_cards') {
      setFlashCardIndex(0);
      setFlashCardFlipped(false);
      flipAnim.setValue(0);
      setCurrentAudioUrl(null);
      try { ambientPlayer.seekTo(0).then(() => ambientPlayer.play()).catch(() => {}); } catch { /* noop */ }
    } else if (block.type === 'tap_through_text') {
      tapThroughIndexRef.current = 0;
      setTapThroughIndex(0);
      tapThroughSlideX.setValue(0);
      setCurrentAudioUrl(null);
      textFade.setValue(0);
      Animated.timing(textFade, { toValue: 1, duration: 350, useNativeDriver: true }).start();
      if (block.ambient_audio) {
        try { ambientPlayer.seekTo(0).then(() => ambientPlayer.play()).catch(() => {}); } catch { /* noop */ }
      }
    } else if (block.type === 'journal_prompt') {
      setCurrentAudioUrl(null);
      setOnScreenText(block.prompt);
      setPhase('block_journal');
    } else if (
      block.type === 'prompt_cards' ||
      block.type === 'bubble_sort' ||
      block.type === 'two_column_sort' ||
      block.type === 'list_builder' ||
      block.type === 'countdown_timer'
    ) {
      setCurrentAudioUrl(null);
      try {
        if (!ambientPlayer.playing) {
          ambientPlayer.seekTo(0).then(() => ambientPlayer.play()).catch(() => {});
        }
      } catch { /* noop */ }
    } else {
      advanceBlock();
    }
  }, [player, ambientPlayer, advanceBlock, textFade, pulseBars]);

  // -----------------------------------------------------------------------
  // Audio: auto-play when loaded
  // -----------------------------------------------------------------------
  useEffect(() => {
    if (phase !== 'playing' || !voiceoverStartPending.current) return;
    if (!audioStatus.isLoaded) return;
    voiceoverStartPending.current = false;
    // Audio loaded successfully — cancel fallback timeout
    if (audioFallbackTimeoutRef.current) { clearTimeout(audioFallbackTimeoutRef.current); audioFallbackTimeoutRef.current = null; }
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
  //  4. audioFallbackActive — when audio files are missing, elapsed time from
  //     fallback timer drives text cues instead of audio playback position.
  // -----------------------------------------------------------------------
  useEffect(() => {
    if (phase !== 'playing' || !hasBlocks) return;
    const isFallback = audioFallbackActive.current;
    if (!isFallback && !audioStatus.isLoaded) return;
    const currentBlocks = lessonRef.current?.content_blocks?.blocks ?? [];
    const block = currentBlocks[blockIndexRef.current];
    if (!block || block.type !== 'voiceover') return;

    const absoluteTime = isFallback
      ? audioFallbackElapsed
      : cumulativeOffsetRef.current + audioStatus.currentTime;
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
  }, [phase, hasBlocks, audioStatus.currentTime, audioStatus.isLoaded, audioFallbackElapsed, textFade, pulseBars]);

  // -----------------------------------------------------------------------
  // Audio fallback: advance block when timer reaches total_audio_seconds
  // -----------------------------------------------------------------------
  useEffect(() => {
    if (phase !== 'playing' || !audioFallbackActive.current) return;
    const currentBlocks = lessonRef.current?.content_blocks?.blocks ?? [];
    const block = currentBlocks[blockIndexRef.current];
    if (!block || block.type !== 'voiceover') return;
    if (audioFallbackElapsed >= block.total_audio_seconds) {
      if (audioFallbackTimerRef.current) { clearInterval(audioFallbackTimerRef.current); audioFallbackTimerRef.current = null; }
      audioFallbackActive.current = false;
      advanceBlock();
    }
  }, [phase, audioFallbackElapsed, advanceBlock]);

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
    audioFallbackActive.current = false;
    if (audioFallbackTimerRef.current) { clearInterval(audioFallbackTimerRef.current); audioFallbackTimerRef.current = null; }
    if (audioFallbackTimeoutRef.current) { clearTimeout(audioFallbackTimeoutRef.current); audioFallbackTimeoutRef.current = null; }
    setAudioFallbackElapsed(0);
    try { player.pause(); void player.seekTo(0); } catch { /* noop */ }
    try { ambientPlayer.pause(); void ambientPlayer.seekTo(0); } catch { /* noop */ }
    setPhase('ready');
    setElapsed(0);
    setBlockIndex(0);
    setAudioFileIndex(0);
    setCurrentAudioUrl(null);
    setOnScreenText('');
    setExerciseElapsed(0);
    setExerciseStepIndex(0);
    setFlashCardIndex(0);
    setFlashCardFlipped(false);
    flipAnim.setValue(0);
    tapThroughIndexRef.current = 0;
    setTapThroughIndex(0);
    tapThroughSlideX.setValue(0);
    setJournalText('');
    setJournalExerciseContext('');
    journalPartsRef.current = [];
    lastCueRef.current = '';
    highestCueIndexRef.current = -1;
    blockIndexRef.current = 0;
    audioFileIndexRef.current = 0;
    cumulativeOffsetRef.current = 0;
    completingRef.current = false;
    setSubmitting(false);
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
  const isFlashCardsBlock = currentBlock?.type === 'flash_cards';
  const isTapThroughBlock = currentBlock?.type === 'tap_through_text';
  const isComponentBlock =
    currentBlock?.type === 'prompt_cards' ||
    currentBlock?.type === 'bubble_sort' ||
    currentBlock?.type === 'two_column_sort' ||
    currentBlock?.type === 'list_builder' ||
    currentBlock?.type === 'countdown_timer';

  const SLIDE_DIST = 320;

  const advanceTapThrough = useCallback((direction: 'forward' | 'back' = 'forward') => {
    const currentBlocks = lessonRef.current?.content_blocks?.blocks ?? [];
    const block = currentBlocks[blockIndexRef.current];
    if (!block || block.type !== 'tap_through_text') return;

    if (direction === 'forward') {
      const nextIdx = tapThroughIndexRef.current + 1;
      if (nextIdx >= block.paragraphs.length) {
        advanceBlock();
        return;
      }
      Animated.parallel([
        Animated.timing(textFade, { toValue: 0, duration: 150, useNativeDriver: true }),
        Animated.timing(tapThroughSlideX, { toValue: -SLIDE_DIST, duration: 200, useNativeDriver: true }),
      ]).start(() => {
        tapThroughSlideX.setValue(SLIDE_DIST);
        tapThroughIndexRef.current = nextIdx;
        setTapThroughIndex(nextIdx);
        Animated.parallel([
          Animated.timing(textFade, { toValue: 1, duration: 250, useNativeDriver: true }),
          Animated.timing(tapThroughSlideX, { toValue: 0, duration: 280, useNativeDriver: true }),
        ]).start();
      });
    } else {
      const prevIdx = tapThroughIndexRef.current - 1;
      if (prevIdx < 0) return;
      Animated.parallel([
        Animated.timing(textFade, { toValue: 0, duration: 150, useNativeDriver: true }),
        Animated.timing(tapThroughSlideX, { toValue: SLIDE_DIST, duration: 200, useNativeDriver: true }),
      ]).start(() => {
        tapThroughSlideX.setValue(-SLIDE_DIST);
        tapThroughIndexRef.current = prevIdx;
        setTapThroughIndex(prevIdx);
        Animated.parallel([
          Animated.timing(textFade, { toValue: 1, duration: 250, useNativeDriver: true }),
          Animated.timing(tapThroughSlideX, { toValue: 0, duration: 280, useNativeDriver: true }),
        ]).start();
      });
    }
  }, [advanceBlock, textFade, tapThroughSlideX]);

  // Keep the PanResponder callback ref current so the once-created responder
  // always calls the latest version of advanceTapThrough.
  advanceTapThroughCallbackRef.current = advanceTapThrough;

  const tapThroughPanResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, { dx, dy }) =>
        Math.abs(dx) > Math.abs(dy) * 1.5 && Math.abs(dx) > 8,
      onPanResponderRelease: (_, { dx, dy }) => {
        if (Math.abs(dx) < 15 && Math.abs(dy) < 15) {
          // Tap → forward
          advanceTapThroughCallbackRef.current('forward');
        } else if (dx < -40) {
          // Swipe left → forward
          advanceTapThroughCallbackRef.current('forward');
        } else if (dx > 40) {
          // Swipe right → back
          advanceTapThroughCallbackRef.current('back');
        }
      },
    }),
  ).current;

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

  // Block-mode progress (for voiceover progress bar — exercise uses continuous anim)
  let blockProgress = 0;
  if (hasBlocks && phase === 'playing' && isVoiceoverBlock) {
    const t = audioFallbackActive.current
      ? audioFallbackElapsed
      : cumulativeOffsetRef.current + audioStatus.currentTime;
    const total = (currentBlock as VoiceoverBlock).total_audio_seconds;
    blockProgress = total > 0 ? Math.min(t / total, 1) : 0;
  }

  useEffect(() => {
    // Use ref to detect current block type — state may lag behind ref after
    // advanceBlock updates blockIndexRef before React re-renders, which would
    // let a stale voiceover progress (~1.0) overwrite the exercise animation.
    const refBlock = blocks[blockIndexRef.current];
    if (refBlock?.type === 'timed_exercise') return;
    const target = hasBlocks ? blockProgress : legacyProgress;
    Animated.timing(progressAnim, {
      toValue: target,
      duration: 90,
      useNativeDriver: false,
    }).start();
  }, [blockProgress, legacyProgress, hasBlocks, isExerciseBlock]);

  useEffect(() => {
    if (phase !== 'done') return;

    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

    doneAnim1.setValue(0);
    doneAnim2.setValue(0);
    doneAnim3.setValue(0);
    doneAnim4.setValue(0);
    doneScale.setValue(0.3);
    glowPulse.setValue(1);

    Animated.stagger(120, [
      Animated.parallel([
        Animated.timing(doneAnim1, { toValue: 1, duration: 150, useNativeDriver: true }),
        Animated.spring(doneScale, { toValue: 1, friction: 5, tension: 80, useNativeDriver: true }),
      ]),
      Animated.timing(doneAnim2, { toValue: 1, duration: 300, useNativeDriver: true }),
      Animated.timing(doneAnim3, { toValue: 1, duration: 300, useNativeDriver: true }),
      Animated.timing(doneAnim4, { toValue: 1, duration: 300, useNativeDriver: true }),
    ]).start();

    // Pulsing glow on the trophy
    Animated.loop(
      Animated.sequence([
        Animated.timing(glowPulse, { toValue: 1.15, duration: 1200, useNativeDriver: true }),
        Animated.timing(glowPulse, { toValue: 1, duration: 1200, useNativeDriver: true }),
      ]),
    ).start();
  }, [phase, doneAnim1, doneAnim2, doneAnim3, doneAnim4, doneScale, glowPulse]);

  useEffect(() => {
    if (phase !== 'streak') return;

    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

    streakAnim1.setValue(0);
    streakAnim2.setValue(0);
    streakScale.setValue(0);

    Animated.sequence([
      Animated.delay(100),
      Animated.parallel([
        Animated.timing(streakAnim1, { toValue: 1, duration: 250, useNativeDriver: true }),
        Animated.spring(streakScale, { toValue: 1, friction: 4, tension: 120, useNativeDriver: true }),
      ]),
      Animated.delay(200),
      Animated.timing(streakAnim2, { toValue: 1, duration: 400, useNativeDriver: true }),
    ]).start();
  }, [phase, streakAnim1, streakAnim2, streakScale]);

  const progressBarWidth = progressAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0%', '100%'],
    extrapolate: 'clamp',
  });

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
  // Flash card helpers
  // -----------------------------------------------------------------------
  const flipCard = () => {
    Animated.spring(flipAnim, {
      toValue: flashCardFlipped ? 0 : 1,
      friction: 8,
      tension: 100,
      useNativeDriver: true,
    }).start();
    setFlashCardFlipped(!flashCardFlipped);
  };

  const nextFlashCard = () => {
    if (!isFlashCardsBlock) return;
    const fcBlock = currentBlock as FlashCardsBlock;
    const nextIdx = flashCardIndex + 1;
    if (nextIdx >= fcBlock.cards.length) {
      try { ambientPlayer.pause(); } catch { /* noop */ }
      advanceBlock();
      return;
    }
    setFlashCardFlipped(false);
    flipAnim.setValue(0);
    setFlashCardIndex(nextIdx);
  };

  const flipFrontInterpolate = flipAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '180deg'],
  });
  const flipBackInterpolate = flipAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['180deg', '360deg'],
  });

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
            <View style={[styles.catBadge, { borderColor: catColor, backgroundColor: catColor + '12' }]}>
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
            <Text style={styles.readyDuration}>
              ~{Math.ceil(lesson.duration_seconds / 60)} min
            </Text>
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
            <Animated.Text style={[styles.blockText, { opacity: textFade }]}>
              {onScreenText}
            </Animated.Text>
            {audioBars}
            <View style={styles.progressBarTrack}>
              <Animated.View
                style={[styles.progressBarFill, { width: progressBarWidth, backgroundColor: catColor }]}
              />
            </View>
          </View>
        )}

        {/* Block-mode: timed exercise */}
        {phase === 'playing' && lesson && hasBlocks && isExerciseBlock && (() => {
          const exBlock = currentBlock as TimedExerciseBlock;

          // Shared interpolation for the breath circle (used by multiple models)
          const circleScale = breathCircleAnim.interpolate({
            inputRange: [0, 1],
            outputRange: [0.55, 1],
            extrapolate: 'clamp',
          });
          const circleOpacity = breathCircleAnim.interpolate({
            inputRange: [0, 1],
            outputRange: [0.35, 0.85],
            extrapolate: 'clamp',
          });
          const circleNode = (
            <View style={styles.breathCircleWrapper}>
              <Animated.View
                style={[
                  styles.breathCircle,
                  {
                    backgroundColor: catColor,
                    opacity: circleOpacity,
                    transform: [{ scale: circleScale }],
                    shadowColor: catColor,
                    shadowOffset: { width: 0, height: 0 },
                    shadowOpacity: 0.5,
                    shadowRadius: 30,
                    elevation: 12,
                  },
                ]}
              />
            </View>
          );

          // ── Box breathing ───────────────────────────────────────────────
          if (exBlock.interactive_model === 'box_breathing') {
            const BOX_PHASES = ['Inhale', 'Hold', 'Exhale', 'Hold'] as const;
            const phaseIndex = Math.floor((exerciseElapsed % 16) / 4);
            const phaseLabel = BOX_PHASES[phaseIndex] ?? 'Inhale';
            const countdown = 4 - (exerciseElapsed % 4);
            return (
              <View style={styles.centered}>
                <View style={styles.breathCircleWrapper}>
                  <Animated.View
                    style={[
                      styles.breathCircle,
                      {
                        backgroundColor: catColor,
                        opacity: circleOpacity,
                        transform: [{ scale: circleScale }],
                        shadowColor: catColor,
                        shadowOffset: { width: 0, height: 0 },
                        shadowOpacity: 0.5,
                        shadowRadius: 30,
                        elevation: 12,
                      },
                    ]}
                  />
                  <Text style={[styles.breathCountdown, { position: 'absolute' }]}>{countdown}</Text>
                </View>
                <Animated.View
                  style={[
                    styles.exerciseCard,
                    {
                      borderColor: catColor,
                      borderTopWidth: 2,
                      transform: [{ scale: cardScale }],
                      shadowColor: catColor,
                      shadowOffset: { width: 0, height: 0 },
                      shadowOpacity: 0.25,
                      shadowRadius: 20,
                      elevation: 8,
                    },
                  ]}
                >
                  <Text style={[styles.exercisePhaseLabel, { color: catColor }]}>{phaseLabel}</Text>
                  <Animated.Text style={[styles.exerciseText, { opacity: boxCueFade }]}>
                    {exBlock.visual_cues?.[boxCueIndex] ?? ''}
                  </Animated.Text>
                </Animated.View>
                <View style={styles.progressBarTrack}>
                  <Animated.View
                    style={[styles.progressBarFill, { width: progressBarWidth, backgroundColor: catColor }]}
                  />
                </View>
              </View>
            );
          }

          // ── Circle-based breath models (coffee / milk / whiskey) ────────
          const CIRCLE_MODELS = ['coffee_breath', 'milk_breath', 'whiskey_breath'];
          if (CIRCLE_MODELS.includes(exBlock.interactive_model ?? '')) {
            const circlePhaseLabel = (() => {
              const m = exBlock.interactive_model;
              if (m === 'coffee_breath')  return exerciseElapsed % 2  < 1 ? 'Inhale' : 'Exhale';
              if (m === 'milk_breath')    return exerciseElapsed % 8  < 4 ? 'Inhale' : 'Exhale';
              if (m === 'whiskey_breath') return exerciseElapsed % 12 < 4 ? 'Inhale' : 'Exhale';
              return '';
            })();
            return (
              <View style={styles.centered}>
                {circleNode}
                <Animated.View
                  style={[
                    styles.exerciseCard,
                    {
                      borderColor: catColor,
                      borderTopWidth: 2,
                      transform: [{ scale: cardScale }],
                      shadowColor: catColor,
                      shadowOffset: { width: 0, height: 0 },
                      shadowOpacity: 0.25,
                      shadowRadius: 20,
                      elevation: 8,
                    },
                  ]}
                >
                  {circlePhaseLabel ? (
                    <Text style={[styles.exercisePhaseLabel, { color: catColor }]}>{circlePhaseLabel}</Text>
                  ) : null}
                  <Animated.Text style={[styles.exerciseText, { opacity: textFade }]}>
                    {onScreenText}
                  </Animated.Text>
                </Animated.View>
                <View style={styles.progressBarTrack}>
                  <Animated.View
                    style={[styles.progressBarFill, { width: progressBarWidth, backgroundColor: catColor }]}
                  />
                </View>
              </View>
            );
          }

          // ── Body scan — descending zone indicator ───────────────────────
          if (exBlock.interactive_model === 'body_scan') {
            const totalZones = exBlock.steps.length;
            const activeZone = Math.min(Math.floor(exerciseElapsed / 10), totalZones - 1);
            return (
              <View style={styles.centered}>
                <View style={styles.bodyScanRow}>
                  <View style={styles.bodyScanDots}>
                    {exBlock.steps.map((_, i) => (
                      <View
                        key={i}
                        style={[
                          styles.bodyScanDot,
                          {
                            backgroundColor:
                              i === activeZone
                                ? catColor
                                : i < activeZone
                                  ? catColor + '55'
                                  : colors.ringTrack,
                            transform: [{ scale: i === activeZone ? 1.3 : 1 }],
                          },
                        ]}
                      />
                    ))}
                  </View>
                  <Animated.View
                    style={[
                      styles.exerciseCard,
                      {
                        flex: 1,
                        borderColor: catColor,
                        borderTopWidth: 2,
                        transform: [{ scale: cardScale }],
                        shadowColor: catColor,
                        shadowOffset: { width: 0, height: 0 },
                        shadowOpacity: 0.25,
                        shadowRadius: 20,
                        elevation: 8,
                      },
                    ]}
                  >
                    <Animated.Text style={[styles.exerciseText, { opacity: textFade }]}>
                      {onScreenText}
                    </Animated.Text>
                  </Animated.View>
                </View>
                <View style={styles.progressBarTrack}>
                  <Animated.View
                    style={[styles.progressBarFill, { width: progressBarWidth, backgroundColor: catColor }]}
                  />
                </View>
              </View>
            );
          }

          // ── Standard step card (fallback) ───────────────────────────────
          return (
            <View style={styles.centered}>
              <View style={styles.exerciseStepDots}>
                {exBlock.steps.map((_, i) => (
                  <View
                    key={i}
                    style={[
                      styles.stepDot,
                      i === exerciseStepIndex
                        ? { backgroundColor: catColor, width: 18 }
                        : { backgroundColor: colors.ringTrack },
                    ]}
                  />
                ))}
              </View>
              <Animated.View
                style={[
                  styles.exerciseCard,
                  {
                    borderColor: catColor,
                    borderTopWidth: 2,
                    transform: [{ scale: cardScale }],
                    shadowColor: catColor,
                    shadowOffset: { width: 0, height: 0 },
                    shadowOpacity: 0.25,
                    shadowRadius: 20,
                    elevation: 8,
                  },
                ]}
              >
                <Animated.Text style={[styles.exerciseText, { opacity: textFade }]}>
                  {onScreenText}
                </Animated.Text>
              </Animated.View>
              {audioBars}
              <View style={styles.progressBarTrack}>
                <Animated.View
                  style={[styles.progressBarFill, { width: progressBarWidth, backgroundColor: catColor }]}
                />
              </View>
            </View>
          );
        })()}

        {/* Block-mode: flash cards — interactive flip cards */}
        {phase === 'playing' && lesson && hasBlocks && isFlashCardsBlock && (() => {
          const fcBlock = currentBlock as FlashCardsBlock;
          const card = fcBlock.cards[flashCardIndex];
          if (!card) return null;
          return (
            <View style={styles.centered}>
              <View style={styles.exerciseStepDots}>
                {fcBlock.cards.map((_, i) => (
                  <View
                    key={i}
                    style={[
                      styles.stepDot,
                      i === flashCardIndex
                        ? { backgroundColor: catColor, width: 18 }
                        : i < flashCardIndex
                          ? { backgroundColor: catColor }
                          : { backgroundColor: colors.ringTrack },
                    ]}
                  />
                ))}
              </View>

              <Text style={styles.flashTapHint}>
                {flashCardFlipped ? '' : 'Tap to flip'}
              </Text>

              <TouchableOpacity activeOpacity={0.9} onPress={flipCard} style={styles.flashCardWrapper}>
                <Animated.View
                  style={[
                    styles.flashCard,
                    {
                      borderColor: catColor,
                      borderTopWidth: 2,
                      shadowColor: catColor,
                      shadowOffset: { width: 0, height: 0 },
                      shadowOpacity: 0.25,
                      shadowRadius: 20,
                      elevation: 8,
                      transform: [{ perspective: 1000 }, { rotateY: flipFrontInterpolate }],
                      backfaceVisibility: 'hidden',
                    },
                  ]}
                >
                  <Text style={styles.flashCardFrontText}>{card.front}</Text>
                </Animated.View>

                <Animated.View
                  style={[
                    styles.flashCard,
                    styles.flashCardBack,
                    {
                      borderColor: catColor,
                      borderTopWidth: 2,
                      shadowColor: catColor,
                      shadowOffset: { width: 0, height: 0 },
                      shadowOpacity: 0.25,
                      shadowRadius: 20,
                      elevation: 8,
                      transform: [{ perspective: 1000 }, { rotateY: flipBackInterpolate }],
                      backfaceVisibility: 'hidden',
                    },
                  ]}
                >
                  <Text style={styles.flashCardBackText}>{card.back}</Text>
                </Animated.View>
              </TouchableOpacity>

              {audioBars}

              <TouchableOpacity style={styles.primaryBtn} onPress={nextFlashCard}>
                <Text style={styles.primaryBtnText}>
                  {flashCardIndex >= fcBlock.cards.length - 1 ? 'Finish' : 'Next'}
                </Text>
              </TouchableOpacity>
            </View>
          );
        })()}

        {/* Block-mode: tap-through text — Duolingo-style tap/swipe to advance */}
        {phase === 'playing' && lesson && hasBlocks && isTapThroughBlock && (() => {
          const ttBlock = currentBlock as TapThroughTextBlock;
          const paragraph = ttBlock.paragraphs[tapThroughIndex] ?? '';
          const isLast = tapThroughIndex >= ttBlock.paragraphs.length - 1;
          return (
            <View
              style={styles.tapThroughContainer}
              {...tapThroughPanResponder.panHandlers}
            >
              {/* Dots: sit at a fixed position determined by paddingTop on the container.
                  They are NOT inside a centering wrapper so text height never moves them. */}
              <View style={styles.tapThroughDots}>
                {ttBlock.paragraphs.map((_, i) => (
                  <View
                    key={i}
                    style={[
                      styles.stepDot,
                      i === tapThroughIndex
                        ? { backgroundColor: catColor, width: 18 }
                        : i < tapThroughIndex
                          ? { backgroundColor: catColor + '60' }
                          : { backgroundColor: colors.ringTrack },
                    ]}
                  />
                ))}
              </View>

              {/* Text flows directly below the fixed-position dots */}
              <Animated.Text
                style={[
                  styles.tapThroughText,
                  { opacity: textFade, transform: [{ translateX: tapThroughSlideX }] },
                ]}
              >
                {paragraph}
              </Animated.Text>

              {/* Hint absolutely pinned so it never reflows layout */}
              <View style={styles.tapThroughHintRow}>
                <Text style={[styles.tapThroughHint, { color: catColor + 'aa' }]}>
                  {isLast ? 'Begin Exercise' : 'Tap to continue'}
                </Text>
              </View>
            </View>
          );
        })()}

        {/* Component-based interactive blocks */}
        {phase === 'playing' && lesson && hasBlocks && isComponentBlock && (() => {
          const block = currentBlock!;
          // Inline the advance logic here rather than delegating through
          // advanceBlock → startBlock, which captures a stale startBlock
          // reference when advanceBlock is memoised without it as a dep.
          const handleComplete = (collectedText: string) => {
            if (collectedText.trim()) {
              journalPartsRef.current.push(collectedText.trim());
            }
            try { ambientPlayer.pause(); } catch { /* noop */ }

            const nextIdx = blockIndexRef.current + 1;
            const allBlocks = lessonRef.current?.content_blocks?.blocks ?? [];
            blockIndexRef.current = nextIdx;

            if (nextIdx >= allBlocks.length) {
              sessionActive.current = false;
              stopAllTimers();
              completeLesson();
              return;
            }

            // If transitioning to a journal_prompt, surface the exercise answers
            // as context so the user can reference them while writing.
            const nextBlock = allBlocks[nextIdx];
            if (nextBlock?.type === 'journal_prompt' && collectedText.trim()) {
              setJournalExerciseContext(collectedText.trim());
            }

            // Mirror advanceBlock: update state index then delegate all
            // block-type-specific setup (including journal_prompt → block_journal)
            // to startBlock, which already handles every block type correctly.
            setBlockIndex(nextIdx);
            startBlock(nextIdx);
          };
          if (block.type === 'prompt_cards') {
            return (
              <PromptCards
                key={blockIndex}
                cards={block.cards}
                catColor={catColor}
                onComplete={handleComplete}
              />
            );
          }
          if (block.type === 'bubble_sort') {
            return (
              <BubbleSortExercise
                key={blockIndex}
                entryInstruction={block.entry_instruction}
                entryDoneLabel={block.entry_done_label}
                discardInstruction={block.discard_instruction}
                canRestore={block.can_restore}
                actionPrompt={block.action_prompt}
                catColor={catColor}
                onComplete={handleComplete}
              />
            );
          }
          if (block.type === 'two_column_sort') {
            return (
              <TwoColumnSortExercise
                key={blockIndex}
                columns={block.columns}
                minPerColumn={block.min_per_column}
                closeColumnId={block.close_column_id}
                actionPrompt={block.action_prompt}
                catColor={catColor}
                onComplete={handleComplete}
              />
            );
          }
          if (block.type === 'list_builder') {
            return (
              <ListBuilderExercise
                key={blockIndex}
                prompts={block.prompts}
                minEntries={block.min_entries}
                minEntrySeconds={block.min_entry_seconds}
                summaryHeader={block.summary_header}
                summaryHoldSeconds={block.summary_hold_seconds}
                catColor={catColor}
                onComplete={handleComplete}
              />
            );
          }
          if (block.type === 'countdown_timer') {
            return (
              <CountdownTimerExercise
                key={blockIndex}
                durationSeconds={block.duration_seconds}
                taskList={block.task_list}
                completionMessage={block.completion_message}
                completionHoldSeconds={block.completion_hold_seconds}
                catColor={catColor}
                onComplete={handleComplete}
              />
            );
          }
          return null;
        })()}

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
              <Animated.View
                style={[styles.progressBarFill, { width: progressBarWidth, backgroundColor: catColor }]}
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
              {journalExerciseContext ? (
                <View style={styles.journalContextCard}>
                  <FormattedJournalBody body={journalExerciseContext} />
                </View>
              ) : null}
              <Text style={styles.reflectionPrompt}>{onScreenText}</Text>
              <TextInput
                style={styles.journalInput}
                placeholder="Write your reflection..."
                placeholderTextColor={colors.textMuted}
                value={journalText}
                onChangeText={setJournalText}
                multiline
                autoCorrect
                spellCheck
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
                    autoCorrect
                    spellCheck
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
            <Animated.View style={{ opacity: doneAnim1, transform: [{ scale: doneScale }] }}>
              <Animated.View style={[styles.trophyGlow, { transform: [{ scale: glowPulse }] }]}>
                <Ionicons name="trophy" size={72} color={colors.accentLight} />
              </Animated.View>
            </Animated.View>

            <Animated.View style={{ opacity: doneAnim2, alignItems: 'center' as const }}>
              <Text style={styles.doneTitle}>Workout Complete</Text>
              <Text style={styles.doneSub}>{lesson.title}</Text>
            </Animated.View>

            {doneDeltas && Object.keys(doneDeltas).length > 0 && (
              <Animated.View style={[styles.doneDeltaRow, { opacity: doneAnim3 }]}>
                {Object.entries(doneDeltas).map(([cat, d]) => (
                  <View key={cat} style={styles.doneDeltaBadge}>
                    <View style={[styles.doneDeltaDot, { backgroundColor: MAC_COLORS[cat] ?? colors.accentLight }]} />
                    <Text style={styles.doneDeltaCat}>{cat.charAt(0).toUpperCase() + cat.slice(1)}</Text>
                    <Text style={[styles.doneDeltaValue, { color: d.amount >= 0 ? colors.success : colors.error }]}>
                      {d.amount >= 0 ? '+' : ''}{(Math.round(d.amount * 10) / 10).toFixed(1)}
                    </Text>
                  </View>
                ))}
              </Animated.View>
            )}

            <Animated.View style={{ opacity: doneAnim4, marginTop: spacing.sm }}>
              <TouchableOpacity
                style={styles.primaryBtn}
                onPress={async () => {
                  const utcToday = new Date().toISOString().slice(0, 10);
                  if (preStreakDateRef.current === utcToday) {
                    router.back();
                    return;
                  }
                  const { data } = await apiFetch<{ current_streak: number }>('/streak');
                  setStreakCount(data?.current_streak ?? 1);
                  setPhase('streak');
                }}
              >
                <Text style={styles.primaryBtnText}>Continue</Text>
              </TouchableOpacity>
            </Animated.View>
          </View>
        )}

        {phase === 'streak' && (
          <View style={styles.centered}>
            <Animated.View style={{ opacity: streakAnim1, transform: [{ scale: streakScale }], alignItems: 'center' as const }}>
              <View style={styles.streakGlow}>
                <Ionicons name="flame" size={80} color="#f59e0b" />
              </View>
              <Text style={styles.streakCount}>{streakCount}</Text>
              <Text style={styles.streakLabel}>
                {streakCount === 1 ? 'Day Streak' : 'Day Streak'}
              </Text>
            </Animated.View>
            <Animated.View style={{ opacity: streakAnim2, alignItems: 'center' as const, marginTop: spacing.lg }}>
              <Text style={styles.streakSub}>
                {streakCount <= 1
                  ? "Great start. Come back tomorrow to keep it going."
                  : `You've shown up ${streakCount} days in a row. Keep building.`}
              </Text>
              <TouchableOpacity style={[styles.primaryBtn, { marginTop: spacing.xl }]} onPress={() => router.back()}>
                <Text style={styles.primaryBtnText}>Done</Text>
              </TouchableOpacity>
            </Animated.View>
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
    marginBottom: spacing.xs,
  },
  readyDuration: {
    fontSize: 13,
    fontWeight: '500',
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
  exerciseStepDots: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginBottom: spacing.lg,
  },
  stepDot: {
    height: 4,
    width: 8,
    borderRadius: 2,
  },
  exerciseCard: {
    backgroundColor: colors.surface,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: 36,
    paddingHorizontal: spacing.xl,
    marginBottom: spacing.md,
    width: '100%',
    // Lock to 2-line coaching text + phase label so the card never jumps.
    // 2 × lineHeight(30) + marginTop(4) + phaseLabel(14) + 2 × paddingVertical(36) = 156.
    minHeight: 156,
    justifyContent: 'center',
    alignItems: 'center',
  },
  exerciseText: {
    fontSize: 20,
    fontWeight: '600',
    color: colors.textPrimary,
    textAlign: 'center',
    lineHeight: 30,
  },
  // Phase indicator (Inhale / Exhale / Hold) at the top of the exercise card,
  // tinted with catColor inline. Prominent enough to read at a glance.
  exercisePhaseLabel: {
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 2,
    color: colors.textMuted,
    textAlign: 'center',
    marginBottom: spacing.sm,
    textTransform: 'uppercase',
    lineHeight: 16,
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
  journalContextCard: {
    backgroundColor: colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    marginBottom: spacing.md,
    width: '100%',
  },
  journalContextText: {
    fontSize: 15,
    color: colors.textSecondary,
    lineHeight: 22,
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
    marginBottom: spacing.lg,
  },
  trophyGlow: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: 'rgba(139, 92, 246, 0.08)',
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    borderWidth: 1,
    borderColor: 'rgba(167, 139, 250, 0.15)',
  },
  doneDeltaRow: {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    justifyContent: 'center' as const,
    gap: 10,
    marginBottom: spacing.lg,
  },
  doneDeltaBadge: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 6,
    backgroundColor: colors.surface,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: colors.border,
  },
  doneDeltaDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  doneDeltaCat: {
    fontSize: 13,
    fontWeight: '500' as const,
    color: colors.textSecondary,
  },
  doneDeltaValue: {
    fontSize: 14,
    fontWeight: '700' as const,
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
  flashCardWrapper: {
    width: '100%',
    height: 200,
    marginBottom: spacing.lg,
  },
  flashCard: {
    position: 'absolute',
    width: '100%',
    height: '100%',
    backgroundColor: colors.surface,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
  },
  flashCardBack: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  flashCardFrontText: {
    fontSize: 28,
    fontWeight: '800',
    color: colors.textPrimary,
    textAlign: 'center',
  },
  flashCardBackText: {
    fontSize: 20,
    fontWeight: '600',
    color: colors.textPrimary,
    textAlign: 'center',
    lineHeight: 30,
  },
  flashTapHint: {
    fontSize: 13,
    color: colors.textMuted,
    marginBottom: spacing.sm,
    height: 18,
  },
  streakGlow: {
    width: 130,
    height: 130,
    borderRadius: 65,
    backgroundColor: 'rgba(245, 158, 11, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(245, 158, 11, 0.15)',
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  streakCount: {
    fontSize: 64,
    fontWeight: '900',
    color: colors.textPrimary,
    marginTop: spacing.lg,
  },
  streakLabel: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.textSecondary,
    marginTop: spacing.xs,
  },
  streakSub: {
    fontSize: 15,
    color: colors.textMuted,
    textAlign: 'center',
    lineHeight: 22,
    paddingHorizontal: spacing.lg,
  },
  tapThroughContainer: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
    paddingBottom: 60,
    // paddingTop positions the dots at a fixed vertical location.
    // They are always at this distance from the top of the content area
    // regardless of how tall the paragraph text is.
    paddingTop: '66%',
  },
  tapThroughDots: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    height: 20,
    marginBottom: spacing.lg,
  },
  tapThroughText: {
    fontSize: 22,
    fontWeight: '500',
    color: colors.textPrimary,
    textAlign: 'center',
    lineHeight: 34,
    width: '100%',
  },
  tapThroughHintRow: {
    position: 'absolute',
    bottom: spacing.xl,
    alignSelf: 'center',
    height: 20,
    justifyContent: 'center',
  },
  tapThroughHint: {
    fontSize: 13,
    fontWeight: '500',
    letterSpacing: 0.5,
  },
  breathCircleWrapper: {
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xl,
  },
  breathCircle: {
    width: 200,
    height: 200,
    borderRadius: 100,
    alignItems: 'center',
    justifyContent: 'center',
  },
  breathCountdown: {
    fontSize: 48,
    fontWeight: '200',
    color: colors.textPrimary,
    fontVariant: ['tabular-nums'],
  },
  // Body scan: row layout with zone dots on the left and text card on the right
  bodyScanRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    width: '100%',
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.xl,
  },
  bodyScanDots: {
    gap: 7,
    alignItems: 'center',
  },
  bodyScanDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
});
