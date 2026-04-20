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
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { setAudioModeAsync, useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import * as Haptics from 'expo-haptics';
import { useKeepAwake } from 'expo-keep-awake';
import { apiFetch } from '@/lib/api';
import { bustCache } from '@/lib/api-cache';
import { setPendingGainDeltas } from '@/lib/pending-deltas';
import { colors, spacing } from '@/lib/theme';
import { approxLessonMinutes } from '@/lib/approx-lesson-minutes';
import FormattedJournalBody from '@/components/FormattedJournalBody';
import PromptCards from '@/components/lesson/PromptCards';
import BubbleSortExercise from '@/components/lesson/BubbleSort';
import TwoColumnSortExercise from '@/components/lesson/TwoColumnSort';
import ListBuilderExercise from '@/components/lesson/ListBuilder';
import CountdownTimerExercise from '@/components/lesson/CountdownTimer';
import MultiSelectExercise from '@/components/lesson/MultiSelect';
import ExamplesWithEntryExercise from '@/components/lesson/ExamplesWithEntry';
import AnchorEntryExercise from '@/components/lesson/AnchorEntry';
import MacAlternatingRing from '@/components/lesson/MacAlternatingRing';
import {
  MAC_A11Y_NAME,
  MAC_COLORS,
  MAC_LETTER,
  MAC_ORDER,
  macAccentColors,
  pickMacColor,
  sortMacCategories,
  type MacCategory,
} from '@/lib/mac-categories';

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
type BoxBreathingPhaseLabels = {
  inhale: string;
  hold_in: string;
  exhale: string;
  hold_out: string;
};
type BoxBreathingMidOverlay = {
  after_rep: number;
  text: string;
  duration_seconds: number;
};
type TimedExerciseBlock = {
  type: 'timed_exercise';
  duration_seconds: number;
  ambient_audio?: string | null;
  interactive_model?: string;
  haptic_pattern?: HapticPattern;
  visual_cues?: string[];
  rep_count?: number;
  phase_labels?: BoxBreathingPhaseLabels;
  mid_overlay?: BoxBreathingMidOverlay;
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

type MultiSelectBlock = {
  type: 'multi_select';
  ambient_audio?: string | null;
  prompt: string;
  options: string[];
  confirm_label?: string;
  min_select?: number;
};

type ExamplesWithEntryBlock = {
  type: 'examples_with_entry';
  ambient_audio?: string | null;
  examples_header?: string;
  examples: string[];
  input_prompt: string;
  submit_label?: string;
};

type AnchorEntryBlock = {
  type: 'anchor_entry';
  ambient_audio?: string | null;
  entry_prompt: string;
  save_label?: string;
  hold_prompt: string;
  continue_label?: string;
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
  | CountdownTimerBlock
  | MultiSelectBlock
  | ExamplesWithEntryBlock
  | AnchorEntryBlock;

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

/** Shown on the ready screen for program (standard) WODs only; same copy as former home card subtitle. */
const STANDARD_WOD_READY_TAGLINE = "focuses on the 'why' and teaching through the 'what'";

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

/** Match exercise timer end: box breathing rounds up to full 16s cycles. */
function exerciseEffectiveDurationSeconds(block: TimedExerciseBlock): number {
  if (block.interactive_model === 'box_breathing') {
    return Math.ceil(block.duration_seconds / 16) * 16;
  }
  return block.duration_seconds;
}

/**
 * Text-step exercises (no interactive_model) are user-paced — tap to advance,
 * swipe back to revisit. Only visual interactive models (breathing/body_scan)
 * still drive their own clock. Mirrors the tap_through_text UX.
 */
function isTextStepExercise(block: TimedExerciseBlock): boolean {
  return !block.interactive_model;
}

/** Per-step seconds estimate for user-paced text exercises (progress weight + duration migration). */
const TEXT_STEP_ESTIMATE_SECONDS = 5;
/** Per-card seconds estimate for prompt_cards (progress weight + duration migration). */
const PROMPT_CARD_ESTIMATE_SECONDS = 25;

/**
 * Single source of truth for timed_exercise circle breath visuals.
 * - `timing` ms: [inhale, holdIn, exhale, holdOut] — must match `haptic_pattern.cycle_seconds`
 *   (cycle_seconds = sum of phases in seconds) for repeating breath lessons.
 * - `wallDrive: true` → rAF + wall clock for bubble + Inhale/Exhale (no Animated.loop drift).
 *   Add new fast repeating breath models here with `wallDrive: true`.
 * - `wallDrive: false` → native Animated.loop (box breathing only today).
 */
type CircleBreathTimingMs = readonly [number, number, number, number];

type CircleBreathModelConfig = {
  timing: CircleBreathTimingMs;
  wallDrive: boolean;
};

const CIRCLE_BREATH_MODEL_CONFIG: Record<string, CircleBreathModelConfig> = {
  box_breathing: { timing: [4000, 4000, 4000, 4000], wallDrive: false },
  coffee_breath: { timing: [1000, 0, 1000, 0], wallDrive: true },
  milk_breath: { timing: [4000, 0, 4000, 0], wallDrive: true },
  whiskey_breath: { timing: [4000, 0, 8000, 0], wallDrive: true },
};

const WALL_DRIVE_BREATH_MODEL_SET = new Set(
  Object.entries(CIRCLE_BREATH_MODEL_CONFIG)
    .filter(([, v]) => v.wallDrive)
    .map(([k]) => k),
);

function getCircleBreathModelConfig(model: string | undefined): CircleBreathModelConfig | undefined {
  if (!model) return undefined;
  return CIRCLE_BREATH_MODEL_CONFIG[model];
}

/** Inhale = inhale + hold-in at full; Exhale = exhale + hold-out (matches bubble scalar regions). */
function circleBreathPhaseLabel(model: string | undefined, elapsedMs: number): string {
  const cfg = getCircleBreathModelConfig(model);
  if (!cfg || !cfg.wallDrive) return '';
  const [inhaleMs, holdInMs, exhaleMs, holdOutMs] = cfg.timing;
  const cycle = inhaleMs + holdInMs + exhaleMs + holdOutMs;
  if (cycle <= 0) return '';
  let t = elapsedMs % cycle;
  if (t < 0) t += cycle;
  if (t < inhaleMs + holdInMs) return 'Inhale';
  return 'Exhale';
}

/**
 * Breath circle scalar 0..1 matching Animated.sequence timing: inhale 0→1, exhale 1→0, holds at extremes.
 * Used with wall-clock ms so the bubble cannot drift from Inhale/Exhale labels (unlike Animated.loop).
 */
function breathAnimScalarFromWallMs(
  wallMs: number,
  inhaleMs: number,
  holdInMs: number,
  exhaleMs: number,
  holdOutMs: number,
): number {
  const cycle = inhaleMs + holdInMs + exhaleMs + holdOutMs;
  if (cycle <= 0) return 0;
  let t = wallMs % cycle;
  if (t < 0) t += cycle;
  if (t < inhaleMs) return inhaleMs <= 0 ? 0 : t / inhaleMs;
  t -= inhaleMs;
  if (t < holdInMs) return 1;
  t -= holdInMs;
  if (t < exhaleMs) return exhaleMs <= 0 ? 0 : 1 - t / exhaleMs;
  return 0;
}

/** Estimated seconds each block contributes to the overall lesson length.
 *  Timed/interactive blocks use their actual duration; user-paced blocks use
 *  a per-step estimate so the bar moves at a reasonable pace per tap. */
function blockWeightSeconds(block: ContentBlock): number {
  switch (block.type) {
    case 'voiceover': return Math.max(1, block.total_audio_seconds);
    case 'timed_exercise':
      return isTextStepExercise(block)
        ? Math.max(1, block.steps.length * TEXT_STEP_ESTIMATE_SECONDS)
        : Math.max(1, exerciseEffectiveDurationSeconds(block));
    case 'countdown_timer': return Math.max(1, block.duration_seconds);
    case 'tap_through_text': return Math.max(1, block.paragraphs.length * 4);
    case 'flash_cards': return Math.max(1, block.cards.length * 4);
    case 'prompt_cards': return Math.max(1, block.cards.length * PROMPT_CARD_ESTIMATE_SECONDS);
    case 'list_builder': return Math.max(1, block.min_entries * 10);
    case 'journal_prompt': return 0;
    case 'bubble_sort': return 30;
    case 'two_column_sort': return 30;
    case 'multi_select': return 25;
    case 'examples_with_entry': return 45;
    case 'anchor_entry': return 45;
    default: return 10;
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function LessonPlayerScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  useKeepAwake('lesson-player');

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
  /** Wall-clock start for block-mode progress bar (elapsed / lesson.duration_seconds). */
  const lessonProgressStartMsRef = useRef<number | null>(null);
  const [lessonWallTick, setLessonWallTick] = useState(0);
  const [audioFileIndex, setAudioFileIndex] = useState(0);
  const [currentAudioUrl, setCurrentAudioUrl] = useState<string | null>(null);
  const [onScreenText, setOnScreenText] = useState('');
  const [exerciseElapsed, setExerciseElapsed] = useState(0);
  /** Wall ms into the current timed_exercise; drives breath phase labels in sync with the circle. */
  const [exerciseWallMs, setExerciseWallMs] = useState(0);
  const [exerciseStepIndex, setExerciseStepIndex] = useState(0);
  /** Mirror of exerciseStepIndex for callbacks that must read current value without re-binding. */
  const exerciseStepIndexRef = useRef(0);
  /** Slide animation for tap-through text-step exercises (mirrors tapThroughSlideX). */
  const exerciseStepSlideX = useRef(new Animated.Value(0)).current;
  /** Latest advance/back handler for the text-step exercise pan responder. */
  const advanceExerciseStepCallbackRef = useRef<(dir: 'forward' | 'back') => void>(() => {});
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

  // Prompt-cards index (driven by PromptCards via onIndexChange) — used for progress bar.
  const [promptCardsIndex, setPromptCardsIndex] = useState(0);
  // Ref so the PanResponder (created once) always calls the latest callback
  const advanceTapThroughCallbackRef = useRef<(dir: 'forward' | 'back') => void>(() => {});

  // Breath circle animation — timing/wall-drive flags: CIRCLE_BREATH_MODEL_CONFIG.
  // 0 = fully exhaled / contracted, 1 = fully inhaled / expanded.
  const breathCircleAnim = useRef(new Animated.Value(0)).current;
  const breathAnimRef = useRef<Animated.CompositeAnimation | null>(null);
  /** rAF loop drives coffee/milk/whiskey circle from wall clock (Animated.loop drifts vs Date.now). */
  const circleBreathRafRef = useRef<number | null>(null);
  const wallDrivenBreathTimingRef = useRef<[number, number, number, number] | null>(null);
  const exerciseWallClockStartRef = useRef(0);
  /** Throttle setExerciseWallMs from rAF so labels track the wall-driven bubble without 60Hz React updates. */
  const lastBreathWallMsUiRef = useRef(-1);

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
  /** Block journal or end-of-lesson reflection prompt text; included in saved journal body. */
  const journalPromptRef = useRef('');
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

  useEffect(() => {
    if (!hasBlocks) return;
    if (phase !== 'playing' && phase !== 'block_journal') return;
    const id = setInterval(() => setLessonWallTick((n) => n + 1), 250);
    return () => clearInterval(id);
  }, [hasBlocks, phase]);

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
  // Load lesson — refetch every time this screen gains focus (same lesson id
  // still gets new content_blocks when timings change in the DB). Skip while
  // an in-flight session is active so we do not swap JSON mid-playback.
  // -----------------------------------------------------------------------
  useFocusEffect(
    useCallback(() => {
      if (!id || typeof id !== 'string') return;
      if (sessionActive.current) return;
      let cancelled = false;
      (async () => {
        const { data, error } = await apiFetch<LessonDetail>(`/lessons/${id}`);
        if (cancelled) return;
        if (error || !data) {
          setErrorMsg(error ?? 'Failed to load lesson');
          setPhase('error');
          return;
        }
        journalPromptRef.current = '';
        journalPartsRef.current = [];
        setJournalText('');
        setJournalExerciseContext('');
        setLesson(data);
        setPhase('ready');
      })();
      return () => {
        cancelled = true;
      };
    }, [id]),
  );

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
    wallDrivenBreathTimingRef.current = null;
    if (circleBreathRafRef.current != null) {
      cancelAnimationFrame(circleBreathRafRef.current);
      circleBreathRafRef.current = null;
    }
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
    progressAnim.setValue(1);

    const exerciseParts = journalPartsRef.current.filter(Boolean);
    const answer = journalTextRef.current.trim();
    const prompt =
      journalPromptRef.current.trim() ||
      (currentLesson.reflection_prompt?.trim() ?? '');
    const journalTail: string[] = [];
    if (prompt && answer) journalTail.push(`${prompt}\n\n${answer}`);
    else if (answer) journalTail.push(answer);
    else if (prompt && exerciseParts.length === 0) journalTail.push(prompt);
    const parts = [...exerciseParts, ...journalTail].filter(Boolean);
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
      progressAnim.setValue(0);
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
      // Start fallback timeout: if audio hasn't loaded in time, drive voiceover via timer.
      // If load completes after this, the isLoaded effect recovers (starts real playback).
      audioFallbackTimeoutRef.current = setTimeout(() => {
        if (!voiceoverStartPending.current) return;
        voiceoverStartPending.current = false;
        audioFallbackActive.current = true;
        audioFallbackStartRef.current = Date.now();
        audioFallbackTimerRef.current = setInterval(() => {
          const el = (Date.now() - audioFallbackStartRef.current) / 1000;
          setAudioFallbackElapsed(el);
        }, 100);
      }, 2500);
    } else if (block.type === 'timed_exercise') {
      wallDrivenBreathTimingRef.current = null;
      if (circleBreathRafRef.current != null) {
        cancelAnimationFrame(circleBreathRafRef.current);
        circleBreathRafRef.current = null;
      }
      if (breathAnimRef.current) {
        breathAnimRef.current.stop();
        breathAnimRef.current = null;
      }
      setExerciseElapsed(0);
      setExerciseWallMs(0);
      lastBreathWallMsUiRef.current = -1;
      setExerciseStepIndex(0);
      exerciseStepIndexRef.current = 0;
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

      // ── User-paced text-step exercise: no timer, tap to advance ──────────
      if (isTextStepExercise(block)) {
        exerciseStepSlideX.setValue(0);
        const firstStep = block.steps[0];
        if (firstStep) {
          lastCueRef.current = firstStep.text;
          setOnScreenText(firstStep.text);
          if (firstStep.haptic) fireHaptic(firstStep.haptic);
          Animated.timing(textFade, { toValue: 1, duration: 350, useNativeDriver: true }).start();
        }
        return;
      }

      // For box_breathing, extend to the next complete 16s cycle boundary so
      // the session always ends after the hold-post-exhale phase (not mid-breath).
      const effectiveDuration = exerciseEffectiveDurationSeconds(block);

      // Same instant for labels, haptics, and (for coffee/milk/whiskey) the breath circle — all wall-clock.
      const exerciseWallClockStart = Date.now();
      exerciseWallClockStartRef.current = exerciseWallClockStart;

      const model = block.interactive_model;
      const circleCfg = getCircleBreathModelConfig(model);
      const timing = circleCfg?.timing;
      const exerciseUsesWallDriveBreath = Boolean(circleCfg?.wallDrive);
      if (timing) {
        breathCircleAnim.setValue(0);
        const [inhaleMs, holdInMs, exhaleMs, holdOutMs] = timing;
        if (exerciseUsesWallDriveBreath) {
          wallDrivenBreathTimingRef.current = [inhaleMs, holdInMs, exhaleMs, holdOutMs];
          const pump = () => {
            const spec = wallDrivenBreathTimingRef.current;
            if (!spec) return;
            const [i0, hi0, e0, ho0] = spec;
            const w = Date.now() - exerciseWallClockStartRef.current;
            breathCircleAnim.setValue(breathAnimScalarFromWallMs(w, i0, hi0, e0, ho0));
            if (w - lastBreathWallMsUiRef.current >= 32) {
              lastBreathWallMsUiRef.current = w;
              setExerciseWallMs(w);
            }
            if (!wallDrivenBreathTimingRef.current) return;
            circleBreathRafRef.current = requestAnimationFrame(pump);
          };
          circleBreathRafRef.current = requestAnimationFrame(pump);
        } else {
          const parts: Animated.CompositeAnimation[] = [
            Animated.timing(breathCircleAnim, { toValue: 1, duration: inhaleMs, useNativeDriver: true }),
          ];
          if (holdInMs > 0) parts.push(Animated.delay(holdInMs));
          parts.push(Animated.timing(breathCircleAnim, { toValue: 0, duration: exhaleMs, useNativeDriver: true }));
          if (holdOutMs > 0) parts.push(Animated.delay(holdOutMs));
          breathAnimRef.current = Animated.loop(Animated.sequence(parts));
          breathAnimRef.current.start();
        }
      }

      exerciseTimerRef.current = setInterval(() => {
        const now = Date.now();
        const wallMs = now - exerciseWallClockStart;
        const secs = Math.floor(wallMs / 1000);
        setExerciseElapsed(secs);
        if (!exerciseUsesWallDriveBreath) {
          setExerciseWallMs(wallMs);
        }

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
                exerciseStepIndexRef.current = i;
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
          wallDrivenBreathTimingRef.current = null;
          if (circleBreathRafRef.current != null) {
            cancelAnimationFrame(circleBreathRafRef.current);
            circleBreathRafRef.current = null;
          }
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
      journalPromptRef.current = block.prompt;
      setCurrentAudioUrl(null);
      setOnScreenText(block.prompt);
      setPhase('block_journal');
    } else if (
      block.type === 'prompt_cards' ||
      block.type === 'bubble_sort' ||
      block.type === 'two_column_sort' ||
      block.type === 'list_builder' ||
      block.type === 'countdown_timer' ||
      block.type === 'multi_select' ||
      block.type === 'examples_with_entry' ||
      block.type === 'anchor_entry'
    ) {
      setCurrentAudioUrl(null);
      if (block.type === 'prompt_cards') setPromptCardsIndex(0);
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
  // Audio: auto-play when loaded (and recover if slow load started fallback)
  // -----------------------------------------------------------------------
  useEffect(() => {
    if (phase !== 'playing' || !hasBlocks) return;
    if (!audioStatus.isLoaded) return;

    const currentBlocks = lessonRef.current?.content_blocks?.blocks ?? [];
    const block = currentBlocks[blockIndexRef.current];
    if (!block || block.type !== 'voiceover') return;

    const pending = voiceoverStartPending.current;
    const fallback = audioFallbackActive.current;
    if (!pending && !fallback) return;

    if (audioFallbackTimeoutRef.current) {
      clearTimeout(audioFallbackTimeoutRef.current);
      audioFallbackTimeoutRef.current = null;
    }

    let seekPos = 0;
    if (fallback) {
      if (audioFallbackTimerRef.current) {
        clearInterval(audioFallbackTimerRef.current);
        audioFallbackTimerRef.current = null;
      }
      audioFallbackActive.current = false;
      const dur = audioStatus.duration;
      const eps = 0.05;
      const fbEl = audioFallbackElapsed;
      if (audioFileIndexRef.current === 0 && dur > 0) {
        seekPos = Math.min(Math.max(0, fbEl), Math.max(0, dur - eps));
      }
      setAudioFallbackElapsed(0);
    }

    voiceoverStartPending.current = false;

    void player.seekTo(seekPos).then(() => { player.play(); });
  }, [phase, hasBlocks, audioStatus.isLoaded, audioStatus.duration, audioFallbackElapsed, player]);

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
      lessonProgressStartMsRef.current = Date.now();
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
    wallDrivenBreathTimingRef.current = null;
    if (circleBreathRafRef.current != null) {
      cancelAnimationFrame(circleBreathRafRef.current);
      circleBreathRafRef.current = null;
    }
    if (audioFallbackTimerRef.current) { clearInterval(audioFallbackTimerRef.current); audioFallbackTimerRef.current = null; }
    if (audioFallbackTimeoutRef.current) { clearTimeout(audioFallbackTimeoutRef.current); audioFallbackTimeoutRef.current = null; }
    setAudioFallbackElapsed(0);
    textFade.stopAnimation();
    textFade.setValue(0);
    cardScale.stopAnimation();
    cardScale.setValue(1);
    try { player.pause(); void player.seekTo(0); } catch { /* noop */ }
    try { ambientPlayer.pause(); void ambientPlayer.seekTo(0); } catch { /* noop */ }
    setPhase('ready');
    progressAnim.setValue(0);
    lessonProgressStartMsRef.current = null;
    setElapsed(0);
    setBlockIndex(0);
    setAudioFileIndex(0);
    setCurrentAudioUrl(null);
    setOnScreenText('');
    setExerciseElapsed(0);
    setExerciseWallMs(0);
    setExerciseStepIndex(0);
    exerciseStepIndexRef.current = 0;
    exerciseStepSlideX.setValue(0);
    setPromptCardsIndex(0);
    setFlashCardIndex(0);
    setFlashCardFlipped(false);
    flipAnim.setValue(0);
    tapThroughIndexRef.current = 0;
    setTapThroughIndex(0);
    tapThroughSlideX.setValue(0);
    setJournalText('');
    setJournalExerciseContext('');
    journalPromptRef.current = '';
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
    currentBlock?.type === 'countdown_timer' ||
    currentBlock?.type === 'multi_select' ||
    currentBlock?.type === 'examples_with_entry' ||
    currentBlock?.type === 'anchor_entry';

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

  // ── Text-step timed_exercise: tap-through with back ──────────────────────
  const advanceExerciseStep = useCallback((direction: 'forward' | 'back' = 'forward') => {
    const currentBlocks = lessonRef.current?.content_blocks?.blocks ?? [];
    const block = currentBlocks[blockIndexRef.current];
    if (!block || block.type !== 'timed_exercise' || !isTextStepExercise(block)) return;

    if (direction === 'forward') {
      const nextIdx = exerciseStepIndexRef.current + 1;
      if (nextIdx >= block.steps.length) {
        try { ambientPlayer.pause(); } catch { /* noop */ }
        advanceBlock();
        return;
      }
      const nextStep = block.steps[nextIdx];
      Animated.parallel([
        Animated.timing(textFade, { toValue: 0, duration: 150, useNativeDriver: true }),
        Animated.timing(exerciseStepSlideX, { toValue: -SLIDE_DIST, duration: 200, useNativeDriver: true }),
      ]).start(() => {
        exerciseStepSlideX.setValue(SLIDE_DIST);
        exerciseStepIndexRef.current = nextIdx;
        setExerciseStepIndex(nextIdx);
        lastCueRef.current = nextStep.text;
        setOnScreenText(nextStep.text);
        if (nextStep.haptic) fireHaptic(nextStep.haptic);
        Animated.parallel([
          Animated.timing(textFade, { toValue: 1, duration: 250, useNativeDriver: true }),
          Animated.timing(exerciseStepSlideX, { toValue: 0, duration: 280, useNativeDriver: true }),
        ]).start();
      });
    } else {
      const prevIdx = exerciseStepIndexRef.current - 1;
      if (prevIdx < 0) return;
      const prevStep = block.steps[prevIdx];
      Animated.parallel([
        Animated.timing(textFade, { toValue: 0, duration: 150, useNativeDriver: true }),
        Animated.timing(exerciseStepSlideX, { toValue: SLIDE_DIST, duration: 200, useNativeDriver: true }),
      ]).start(() => {
        exerciseStepSlideX.setValue(-SLIDE_DIST);
        exerciseStepIndexRef.current = prevIdx;
        setExerciseStepIndex(prevIdx);
        lastCueRef.current = prevStep.text;
        setOnScreenText(prevStep.text);
        Animated.parallel([
          Animated.timing(textFade, { toValue: 1, duration: 250, useNativeDriver: true }),
          Animated.timing(exerciseStepSlideX, { toValue: 0, duration: 280, useNativeDriver: true }),
        ]).start();
      });
    }
  }, [advanceBlock, ambientPlayer, exerciseStepSlideX, textFade]);

  advanceExerciseStepCallbackRef.current = advanceExerciseStep;

  const exerciseStepPanResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, { dx, dy }) =>
        Math.abs(dx) > Math.abs(dy) * 1.5 && Math.abs(dx) > 8,
      onPanResponderRelease: (_, { dx, dy }) => {
        if (Math.abs(dx) < 15 && Math.abs(dy) < 15) {
          advanceExerciseStepCallbackRef.current('forward');
        } else if (dx < -40) {
          advanceExerciseStepCallbackRef.current('forward');
        } else if (dx > 40) {
          advanceExerciseStepCallbackRef.current('back');
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

  const sortedMacCats = useMemo(() => sortMacCategories(lesson?.categories), [lesson?.categories]);
  const macAccentColorsRaw = useMemo(
    () => macAccentColors(sortedMacCats),
    [sortedMacCats],
  );
  const isMultiMac = sortedMacCats.length > 1;
  const catColor = macAccentColorsRaw[0] ?? colors.accentLight;
  /** Solid bar + exercise chrome: first tag by default; each block advances through MAC colors when multi-tag. */
  const progressBarColor = useMemo(() => {
    if (!isMultiMac || macAccentColorsRaw.length <= 1) return catColor;
    return macAccentColorsRaw[blockIndex % macAccentColorsRaw.length] ?? catColor;
  }, [isMultiMac, macAccentColorsRaw, catColor, blockIndex]);

  // Block-mode: weight every block by its real duration so the bar runs at
  // a steady visual pace and reaches 100% exactly when the lesson ends.
  // Tap-based blocks contribute proportionally per tap.
  const lessonTotalWeight = useMemo(
    () => (hasBlocks ? blocks.reduce((acc, b) => acc + blockWeightSeconds(b), 0) : 0),
    [hasBlocks, blocks],
  );

  const overallLessonProgress = useMemo(() => {
    if (!hasBlocks || lessonTotalWeight <= 0) return 0;
    if (phase !== 'playing' && phase !== 'block_journal') return 0;

    let elapsedWeight = 0;
    for (let i = 0; i < blockIndex; i++) elapsedWeight += blockWeightSeconds(blocks[i]);

    const currentBlock = blocks[blockIndex];
    if (currentBlock) {
      const w = blockWeightSeconds(currentBlock);
      let withinSec = 0;
      if (currentBlock.type === 'voiceover') {
        withinSec = audioFallbackActive.current
          ? audioFallbackElapsed
          : cumulativeOffsetRef.current + audioStatus.currentTime;
      } else if (currentBlock.type === 'timed_exercise') {
        withinSec = isTextStepExercise(currentBlock)
          ? (exerciseStepIndex / Math.max(1, currentBlock.steps.length)) * w
          : exerciseElapsed;
      } else if (currentBlock.type === 'tap_through_text') {
        withinSec = (tapThroughIndex / Math.max(1, currentBlock.paragraphs.length)) * w;
      } else if (currentBlock.type === 'flash_cards') {
        withinSec = (flashCardIndex / Math.max(1, currentBlock.cards.length)) * w;
      } else if (currentBlock.type === 'prompt_cards') {
        withinSec = (promptCardsIndex / Math.max(1, currentBlock.cards.length)) * w;
      }
      elapsedWeight += Math.min(w, withinSec);
    }

    return Math.min(1, elapsedWeight / lessonTotalWeight);
  }, [
    hasBlocks, blocks, lessonTotalWeight, phase, blockIndex,
    audioFileIndex, audioStatus.currentTime, audioStatus.isLoaded, audioFallbackElapsed,
    exerciseElapsed, exerciseStepIndex, tapThroughIndex, flashCardIndex, promptCardsIndex,
  ]);

  useEffect(() => {
    if (hasBlocks) {
      if (phase !== 'playing' && phase !== 'block_journal') return;
      Animated.timing(progressAnim, {
        toValue: overallLessonProgress,
        duration: 90,
        useNativeDriver: false,
      }).start();
    } else {
      if (phase !== 'playing') return;
      Animated.timing(progressAnim, {
        toValue: legacyProgress,
        duration: 90,
        useNativeDriver: false,
      }).start();
    }
  }, [phase, hasBlocks, overallLessonProgress, legacyProgress]);

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
              backgroundColor: pickMacColor(isMultiMac ? macAccentColorsRaw : undefined, catColor, i),
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
          <View style={styles.topBarCenter}>
            {sortedMacCats.length === 1 ? (
              <View
                style={[
                  styles.catBadge,
                  { borderColor: catColor, backgroundColor: catColor + '12' },
                ]}
              >
                <Text style={[styles.catBadgeText, { color: catColor }]}>
                  {sortedMacCats[0].toUpperCase()}
                </Text>
              </View>
            ) : sortedMacCats.length > 1 ? (
              sortedMacCats.map((cat) => (
                <View
                  key={cat}
                  accessibilityRole="text"
                  accessibilityLabel={MAC_A11Y_NAME[cat]}
                  style={[
                    styles.catBadgeMulti,
                    { borderColor: MAC_COLORS[cat], backgroundColor: MAC_COLORS[cat] + '12' },
                  ]}
                >
                  <Text style={[styles.catBadgeTextMulti, { color: MAC_COLORS[cat] }]}>
                    {MAC_LETTER[cat]}
                  </Text>
                </View>
              ))
            ) : (
              <View />
            )}
          </View>
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
          <View style={styles.readyRoot}>
            <View style={styles.readyCard}>
              <Text style={styles.readyTitle}>{lesson.title}</Text>
              <View style={styles.readyMetaRow}>
                <View style={styles.readyDurationPill}>
                  <Text style={styles.readyDurationPillText}>
                    ~{approxLessonMinutes(lesson.duration_seconds)} min
                  </Text>
                </View>
              </View>
              {lesson.lesson_type === 'standard' && (
                <Text style={styles.readyTagline}>{STANDARD_WOD_READY_TAGLINE}</Text>
              )}
              {!hasBlocks && lesson.on_screen_text ? (
                <View style={styles.readyDescWrap}>
                  <Text style={styles.readyDesc}>{lesson.on_screen_text}</Text>
                </View>
              ) : null}
              <TouchableOpacity
                style={[styles.primaryBtn, styles.readyBeginBtn]}
                onPress={startLesson}
                activeOpacity={0.85}
              >
                <Text style={styles.primaryBtnText}>Begin</Text>
              </TouchableOpacity>
            </View>
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
                style={[
                  styles.progressBarFill,
                  { width: progressBarWidth, backgroundColor: progressBarColor },
                ]}
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
                    backgroundColor: progressBarColor,
                    opacity: circleOpacity,
                    transform: [{ scale: circleScale }],
                    shadowColor: progressBarColor,
                    shadowOffset: { width: 0, height: 0 },
                    shadowOpacity: 0.5,
                    shadowRadius: 30,
                    elevation: 12,
                  },
                ]}
              />
              {isMultiMac && (
                <View style={styles.breathRimOverlay} pointerEvents="none">
                  <MacAlternatingRing size={200} strokeWidth={5} colors={macAccentColorsRaw} />
                </View>
              )}
            </View>
          );

          // ── Box breathing ───────────────────────────────────────────────
          if (exBlock.interactive_model === 'box_breathing') {
            const BOX_PHASES = ['Inhale', 'Hold', 'Exhale', 'Hold'] as const;
            const PHASE_KEYS = ['inhale', 'hold_in', 'exhale', 'hold_out'] as const;
            const phaseIndex = Math.floor((exerciseElapsed % 16) / 4);
            const phaseLabel = exBlock.phase_labels
              ? exBlock.phase_labels[PHASE_KEYS[phaseIndex] ?? 'inhale']
              : (BOX_PHASES[phaseIndex] ?? 'Inhale');
            const countdown = 4 - (exerciseElapsed % 4);
            // 1-based rep counter, capped at rep_count so it doesn't overshoot
            // when the timer rounds up to the next 16s boundary.
            const currentRep = exBlock.rep_count
              ? Math.min(exBlock.rep_count, Math.floor(exerciseElapsed / 16) + 1)
              : null;
            // Overlay shows for `duration_seconds` starting at the moment
            // rep `after_rep` completes (i.e. the start of the next rep).
            const overlay = exBlock.mid_overlay;
            const overlayActive = overlay
              ? exerciseElapsed >= overlay.after_rep * 16 &&
                exerciseElapsed < overlay.after_rep * 16 + overlay.duration_seconds
              : false;
            return (
              <View style={styles.centered}>
                {currentRep != null && exBlock.rep_count ? (
                  <View style={styles.boxRepCounter} pointerEvents="none">
                    <Text style={[styles.boxRepCounterText, { color: progressBarColor }]}>
                      {`Rep ${currentRep} of ${exBlock.rep_count}`}
                    </Text>
                  </View>
                ) : null}
                <View style={styles.breathCircleWrapper}>
                  <Animated.View
                    style={[
                      styles.breathCircle,
                      {
                        backgroundColor: progressBarColor,
                        opacity: circleOpacity,
                        transform: [{ scale: circleScale }],
                        shadowColor: progressBarColor,
                        shadowOffset: { width: 0, height: 0 },
                        shadowOpacity: 0.5,
                        shadowRadius: 30,
                        elevation: 12,
                      },
                    ]}
                  />
                  {isMultiMac && (
                    <View style={styles.breathRimOverlay} pointerEvents="none">
                      <MacAlternatingRing size={200} strokeWidth={5} colors={macAccentColorsRaw} />
                    </View>
                  )}
                  <Text style={[styles.breathCountdown, { position: 'absolute' }]}>{countdown}</Text>
                </View>
                <Animated.View
                  style={[
                    styles.exerciseCard,
                    {
                      borderColor: progressBarColor,
                      borderTopWidth: 2,
                      transform: [{ scale: cardScale }],
                      shadowColor: progressBarColor,
                      shadowOffset: { width: 0, height: 0 },
                      shadowOpacity: 0.25,
                      shadowRadius: 20,
                      elevation: 8,
                    },
                  ]}
                >
                  {overlayActive && overlay ? (
                    // Fixed-height area for mid-overlay so the card never resizes.
                    <View style={styles.boxCueArea}>
                      <Text style={[styles.exerciseOverlayText, { color: progressBarColor }]}>
                        {overlay.text}
                      </Text>
                    </View>
                  ) : (
                    <>
                      {/* Fixed-height phase label row — single short word, never wraps. */}
                      <View style={styles.boxPhaseLabelRow}>
                        <Text style={[styles.exercisePhaseLabel, { color: progressBarColor }]}>{phaseLabel}</Text>
                      </View>
                      {/* Fixed-height cue area — prevents card resize when phrase changes. */}
                      <View style={styles.boxCueArea}>
                        <Animated.Text style={[styles.exerciseText, { opacity: boxCueFade }]} numberOfLines={2}>
                          {exBlock.visual_cues?.[boxCueIndex] ?? ''}
                        </Animated.Text>
                      </View>
                    </>
                  )}
                </Animated.View>
                <View style={styles.progressBarTrack}>
                  <Animated.View
                    style={[
                      styles.progressBarFill,
                      { width: progressBarWidth, backgroundColor: progressBarColor },
                    ]}
                  />
                </View>
              </View>
            );
          }

          // ── Wall-driven circle breath models (see CIRCLE_BREATH_MODEL_CONFIG) ──
          if (WALL_DRIVE_BREATH_MODEL_SET.has(exBlock.interactive_model ?? '')) {
            const circlePhaseLabel = circleBreathPhaseLabel(
              exBlock.interactive_model,
              exerciseWallMs,
            );
            return (
              <View style={styles.centered}>
                {circleNode}
                <Animated.View
                  style={[
                    styles.exerciseCard,
                    {
                      borderColor: progressBarColor,
                      borderTopWidth: 2,
                      transform: [{ scale: cardScale }],
                      shadowColor: progressBarColor,
                      shadowOffset: { width: 0, height: 0 },
                      shadowOpacity: 0.25,
                      shadowRadius: 20,
                      elevation: 8,
                    },
                  ]}
                >
                  {circlePhaseLabel ? (
                    <Text style={[styles.exercisePhaseLabel, { color: progressBarColor }]}>{circlePhaseLabel}</Text>
                  ) : null}
                  <Animated.Text style={[styles.exerciseText, { opacity: textFade }]}>
                    {onScreenText}
                  </Animated.Text>
                </Animated.View>
                <View style={styles.progressBarTrack}>
                  <Animated.View
                    style={[
                      styles.progressBarFill,
                      { width: progressBarWidth, backgroundColor: progressBarColor },
                    ]}
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
                    {exBlock.steps.map((_, i) => {
                      const zoneColor = pickMacColor(
                        isMultiMac ? macAccentColorsRaw : undefined,
                        catColor,
                        i,
                      );
                      return (
                        <View
                          key={i}
                          style={[
                            styles.bodyScanDot,
                            {
                              backgroundColor:
                                i === activeZone
                                  ? zoneColor
                                  : i < activeZone
                                    ? zoneColor + '55'
                                    : colors.ringTrack,
                              transform: [{ scale: i === activeZone ? 1.3 : 1 }],
                            },
                          ]}
                        />
                      );
                    })}
                  </View>
                  <Animated.View
                    style={[
                      styles.exerciseCard,
                      {
                        flex: 1,
                        borderColor: progressBarColor,
                        borderTopWidth: 2,
                        transform: [{ scale: cardScale }],
                        shadowColor: progressBarColor,
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
                    style={[
                      styles.progressBarFill,
                      { width: progressBarWidth, backgroundColor: progressBarColor },
                    ]}
                  />
                </View>
              </View>
            );
          }

          // ── Standard step card (fallback) — user-paced tap-through ──────
          const isLastStep = exerciseStepIndex >= exBlock.steps.length - 1;
          const canGoBack = exerciseStepIndex > 0;
          const useTapThrough = isTextStepExercise(exBlock);
          const stepDots = (
            <View style={styles.exerciseStepDots}>
              {exBlock.steps.map((_, i) => {
                const stripe = pickMacColor(
                  isMultiMac ? macAccentColorsRaw : undefined,
                  catColor,
                  i,
                );
                return (
                  <View
                    key={i}
                    style={[
                      styles.stepDot,
                      i === exerciseStepIndex
                        ? { backgroundColor: stripe, width: 18 }
                        : useTapThrough && i < exerciseStepIndex
                          ? { backgroundColor: stripe + '60' }
                          : { backgroundColor: colors.ringTrack },
                    ]}
                  />
                );
              })}
            </View>
          );
          const cardNode = (
            <Animated.View
              style={[
                styles.exerciseCard,
                {
                  borderColor: progressBarColor,
                  borderTopWidth: 2,
                  transform: useTapThrough
                    ? [{ scale: cardScale }, { translateX: exerciseStepSlideX }]
                    : [{ scale: cardScale }],
                  shadowColor: progressBarColor,
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
          );
          const progressNode = (
            <View style={styles.progressBarTrack}>
              <Animated.View
                style={[
                  styles.progressBarFill,
                  { width: progressBarWidth, backgroundColor: progressBarColor },
                ]}
              />
            </View>
          );
          if (useTapThrough) {
            return (
              <View style={styles.centered} {...exerciseStepPanResponder.panHandlers}>
                {stepDots}
                {cardNode}
                <Text style={[styles.tapThroughHint, { color: progressBarColor + 'aa', marginBottom: spacing.md }]}>
                  {isLastStep ? 'Tap to continue' : 'Tap to continue'}
                </Text>
                {progressNode}
                <View style={styles.exerciseNavRow}>
                  <TouchableOpacity
                    style={[styles.exerciseNavBtn, !canGoBack && styles.exerciseNavBtnDisabled]}
                    onPress={() => advanceExerciseStepCallbackRef.current('back')}
                    disabled={!canGoBack}
                    hitSlop={12}
                  >
                    <Ionicons name="chevron-back" size={22} color={canGoBack ? colors.textPrimary : colors.textMuted} />
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.primaryBtn, styles.exerciseNextBtn]}
                    onPress={() => advanceExerciseStepCallbackRef.current('forward')}
                  >
                    <Text style={styles.primaryBtnText}>{isLastStep ? 'Finish' : 'Next'}</Text>
                  </TouchableOpacity>
                </View>
              </View>
            );
          }
          return (
            <View style={styles.centered}>
              {stepDots}
              {cardNode}
              {progressNode}
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
                {fcBlock.cards.map((_, i) => {
                  const stripe = pickMacColor(
                    isMultiMac ? macAccentColorsRaw : undefined,
                    catColor,
                    i,
                  );
                  return (
                    <View
                      key={i}
                      style={[
                        styles.stepDot,
                        i === flashCardIndex
                          ? { backgroundColor: stripe, width: 18 }
                          : i < flashCardIndex
                            ? { backgroundColor: stripe }
                            : { backgroundColor: colors.ringTrack },
                      ]}
                    />
                  );
                })}
              </View>

              <Text style={styles.flashTapHint}>
                {flashCardFlipped ? '' : 'Tap to flip'}
              </Text>

              <TouchableOpacity activeOpacity={0.9} onPress={flipCard} style={styles.flashCardWrapper}>
                <Animated.View
                  style={[
                    styles.flashCard,
                    {
                      borderColor: progressBarColor,
                      borderTopWidth: 2,
                      shadowColor: progressBarColor,
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
                      borderColor: progressBarColor,
                      borderTopWidth: 2,
                      shadowColor: progressBarColor,
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

              <View style={styles.progressBarTrack}>
                <Animated.View
                  style={[
                    styles.progressBarFill,
                    { width: progressBarWidth, backgroundColor: progressBarColor },
                  ]}
                />
              </View>

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
                {ttBlock.paragraphs.map((_, i) => {
                  const stripe = pickMacColor(
                    isMultiMac ? macAccentColorsRaw : undefined,
                    catColor,
                    i,
                  );
                  return (
                    <View
                      key={i}
                      style={[
                        styles.stepDot,
                        i === tapThroughIndex
                          ? { backgroundColor: stripe, width: 18 }
                          : i < tapThroughIndex
                            ? { backgroundColor: stripe + '60' }
                            : { backgroundColor: colors.ringTrack },
                      ]}
                    />
                  );
                })}
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
                <Text style={[styles.tapThroughHint, { color: progressBarColor + 'aa' }]}>
                  {isLast ? 'Begin Exercise' : 'Tap to continue'}
                </Text>
              </View>

              <View style={styles.tapThroughProgressWrap}>
                <View style={styles.progressBarTrack}>
                  <Animated.View
                    style={[
                      styles.progressBarFill,
                      { width: progressBarWidth, backgroundColor: progressBarColor },
                    ]}
                  />
                </View>
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

            // If transitioning to a journal_prompt, surface all accumulated exercise
            // answers as context (matches what completeLesson saves from journalPartsRef).
            const nextBlock = allBlocks[nextIdx];
            if (nextBlock?.type === 'journal_prompt') {
              const accumulated = journalPartsRef.current.join('\n\n---\n\n');
              setJournalExerciseContext(accumulated.trim() ? accumulated : '');
            }

            // Mirror advanceBlock: update state index then delegate all
            // block-type-specific setup (including journal_prompt → block_journal)
            // to startBlock, which already handles every block type correctly.
            // Defer startBlock by one frame so React can flush setBlockIndex
            // before audio player hooks update (prevents the voiceover stall
            // when transitioning from a component block).
            setBlockIndex(nextIdx);
            requestAnimationFrame(() => startBlock(nextIdx));
          };
          if (block.type === 'prompt_cards') {
            return (
              <PromptCards
                key={blockIndex}
                cards={block.cards}
                catColor={catColor}
                accentColors={isMultiMac ? macAccentColorsRaw : undefined}
                onIndexChange={setPromptCardsIndex}
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
                accentColors={isMultiMac ? macAccentColorsRaw : undefined}
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
                accentColors={isMultiMac ? macAccentColorsRaw : undefined}
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
                accentColors={isMultiMac ? macAccentColorsRaw : undefined}
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
                accentColors={isMultiMac ? macAccentColorsRaw : undefined}
                onComplete={handleComplete}
              />
            );
          }
          if (block.type === 'multi_select') {
            return (
              <MultiSelectExercise
                key={blockIndex}
                prompt={block.prompt}
                options={block.options}
                confirmLabel={block.confirm_label ?? 'Confirm'}
                minSelect={block.min_select ?? 0}
                catColor={catColor}
                accentColors={isMultiMac ? macAccentColorsRaw : undefined}
                onComplete={handleComplete}
              />
            );
          }
          if (block.type === 'examples_with_entry') {
            return (
              <ExamplesWithEntryExercise
                key={blockIndex}
                examplesHeader={block.examples_header ?? ''}
                examples={block.examples}
                inputPrompt={block.input_prompt}
                submitLabel={block.submit_label ?? 'Save'}
                catColor={catColor}
                accentColors={isMultiMac ? macAccentColorsRaw : undefined}
                onComplete={handleComplete}
              />
            );
          }
          if (block.type === 'anchor_entry') {
            return (
              <AnchorEntryExercise
                key={blockIndex}
                entryPrompt={block.entry_prompt}
                saveLabel={block.save_label ?? 'Save'}
                holdPrompt={block.hold_prompt}
                continueLabel={block.continue_label ?? 'Continue'}
                catColor={catColor}
                accentColors={isMultiMac ? macAccentColorsRaw : undefined}
                onComplete={handleComplete}
              />
            );
          }
          return null;
        })()}

        {/* Progress bar for component-based blocks (they have no internal bar) */}
        {phase === 'playing' && lesson && hasBlocks && isComponentBlock && (
          <View style={styles.componentProgressWrap}>
            <View style={styles.progressBarTrack}>
              <Animated.View
                style={[
                  styles.progressBarFill,
                  { width: progressBarWidth, backgroundColor: progressBarColor },
                ]}
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
              <Animated.View
                style={[
                  styles.progressBarFill,
                  { width: progressBarWidth, backgroundColor: progressBarColor },
                ]}
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
                    <View
                      style={[
                        styles.doneDeltaDot,
                        {
                          backgroundColor: (MAC_ORDER as readonly string[]).includes(cat)
                            ? MAC_COLORS[cat as MacCategory]
                            : colors.accentLight,
                        },
                      ]}
                    />
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
  topBarCenter: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
    paddingHorizontal: 4,
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
  catBadgeMulti: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 4,
    minWidth: 32,
    alignItems: 'center',
  },
  catBadgeTextMulti: {
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
  },
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
  },
  readyTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: colors.textPrimary,
    textAlign: 'center',
    lineHeight: 28,
    marginBottom: spacing.md,
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
  readyTagline: {
    fontSize: 14,
    fontWeight: '400',
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 21,
    marginTop: spacing.sm,
    marginBottom: 0,
    paddingHorizontal: spacing.xs,
  },
  readyDescWrap: {
    marginTop: spacing.lg,
    paddingTop: spacing.lg,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  readyDesc: {
    fontSize: 15,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
    paddingHorizontal: spacing.xs,
  },
  readyBeginBtn: {
    width: '100%',
    marginTop: spacing.xl,
    alignSelf: 'stretch',
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
    textTransform: 'uppercase',
    lineHeight: 16,
  },
  // Fixed-height row for the INHALE / HOLD / EXHALE / HOLD label so the
  // card height never changes between phases.
  boxPhaseLabelRow: {
    height: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  // Fixed-height container for the motivational cue text. 2 × lineHeight(30) =
  // 60 px. Text changes cross-fade within this fixed space, no layout shift.
  boxCueArea: {
    height: 60,
    justifyContent: 'center',
    alignItems: 'center',
    width: '100%',
  },
  exerciseOverlayText: {
    fontSize: 18,
    fontWeight: '700',
    textAlign: 'center',
    lineHeight: 26,
  },
  boxRepCounter: {
    position: 'absolute',
    top: spacing.md,
    right: spacing.lg,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    zIndex: 10,
  },
  boxRepCounterText: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase',
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
  componentProgressWrap: {
    alignItems: 'center',
    paddingBottom: spacing.xl,
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
  exerciseNavRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    gap: spacing.md,
    marginTop: spacing.xs,
  },
  exerciseNavBtn: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  exerciseNavBtnDisabled: {
    opacity: 0.35,
  },
  exerciseNextBtn: {
    marginTop: 0,
    minWidth: 160,
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
  tapThroughProgressWrap: {
    position: 'absolute',
    bottom: spacing.xl + 28,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  tapThroughHint: {
    fontSize: 13,
    fontWeight: '500',
    letterSpacing: 0.5,
  },
  breathCircleWrapper: {
    width: 200,
    height: 200,
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xl,
  },
  breathRimOverlay: {
    position: 'absolute',
    left: 0,
    top: 0,
    width: 200,
    height: 200,
    alignItems: 'center',
    justifyContent: 'center',
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
