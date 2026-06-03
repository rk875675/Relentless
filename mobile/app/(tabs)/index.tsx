import { useCallback, useEffect, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  Animated,
  Dimensions,
  Image,
  Keyboard,
  Modal,
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  ScrollView,
  TextInput,
  RefreshControl,
  Linking,
} from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useFocusEffect } from '@react-navigation/native';
import { useRouter } from 'expo-router';
import { useAuth } from '@/lib/auth-context';
import { apiFetch } from '@/lib/api';
import { supabase } from '@/lib/supabase';
import { getDeviceLocalCalendarYmd, HOME_PROGRAM_ANCHOR_HEADERS } from '@/lib/device-calendar';
import { ProgressRing, type ScoreDelta } from '@/components/ProgressRing';
import { WorkoutCardSkeleton } from '@/components/Skeleton';
import { getPendingGainDeltas, type MacDeltas } from '@/lib/pending-deltas';
import { colors, spacing, TAB_BAR_CLEARANCE } from '@/lib/theme';
import { getCached, setCached, bustCache } from '@/lib/api-cache';
import { approxLessonMinutes } from '@/lib/approx-lesson-minutes';
import { scheduleScrollFooterAboveKeyboard } from '@/lib/schedule-scroll-for-keyboard';
import {
  trackPartnerReferralCtaClicked,
  trackWodViewed,
  trackWodStarted,
  trackStreakViewed,
  trackProgressRingViewed,
  trackReflectionSaved,
} from '@/lib/core-analytics';

const { height: screenHeight } = Dimensions.get('window');

// ---------------------------------------------------------------------------
// DEV-ONLY multi-coach WOD preview.
//
// Every lesson pack loaded by scripts/03_loader.py gets one entry here, so its
// program renders as its own Workout-of-the-Day card, day-synced to the dev
// program-day tool (Profile > Dev Tools). It opens the exact same lesson player
// as the real WOD.
//
// Wrapped in __DEV__ at the render site, so it is physically stripped from
// production / TestFlight / App Store builds — it can NEVER appear for any user
// on prod, including is_dev accounts. It only shows lessons that exist in the
// database this build points at (EXPO_PUBLIC_SUPABASE_URL); the lesson detail
// endpoint serves these production_ready=false lessons to is_dev accounts.
//
// To add a coach after a loader run: append an entry below using the lesson ids
// the loader prints (also saved in loader_review_<coach>_<program>.json), keyed
// by `sequence`. (A future dynamic version will read the `programs` table.)
// ---------------------------------------------------------------------------
type DevWodProgram = {
  coachName: string;
  coachSubtitle: string;
  programTitle: string;
  /** sequence (== program day) -> deterministic lesson id from the loader */
  lessonsBySequence: Record<number, string>;
};

const DEV_WOD_PROGRAMS: DevWodProgram[] = [
  {
    coachName: 'New Coachex',
    coachSubtitle: 'M.S.',
    programTitle: 'Example Golf one',
    lessonsBySequence: {
      1: 'c667a937-c498-5a6a-b271-bc9165b0ce00',
    },
  },
];

type DevWodLesson = { id: string; title: string; duration_seconds: number };

function DevWodSection() {
  const router = useRouter();
  const [day, setDay] = useState<number | null>(null);
  const [lessons, setLessons] = useState<Record<string, DevWodLesson | null>>({});

  // Track the dev program day (the same value Profile > Dev Tools changes).
  useFocusEffect(
    useCallback(() => {
      let active = true;
      supabase.rpc('dev_get_program_day').then((res: { data: unknown }) => {
        if (active && typeof res.data === 'number') setDay(res.data);
      });
      return () => {
        active = false;
      };
    }, []),
  );

  // Resolve each program's lesson for the current day (sequence == day).
  useEffect(() => {
    if (day == null) return;
    let active = true;
    (async () => {
      const next: Record<string, DevWodLesson | null> = {};
      await Promise.all(
        DEV_WOD_PROGRAMS.map(async (p) => {
          const id = p.lessonsBySequence[day];
          if (!id) {
            next[p.programTitle] = null;
            return;
          }
          const res = await apiFetch<DevWodLesson>(`/lessons/${id}`);
          next[p.programTitle] = res.data ?? null;
        }),
      );
      if (active) setLessons(next);
    })();
    return () => {
      active = false;
    };
  }, [day]);

  if (DEV_WOD_PROGRAMS.length === 0) return null;

  return (
    <View style={styles.devWodWrap}>
      <Text style={styles.devWodSectionLabel}>DEV · COACH WOD PREVIEW (day {day ?? '—'})</Text>
      {DEV_WOD_PROGRAMS.map((p) => {
        const id = day != null ? p.lessonsBySequence[day] : undefined;
        const meta = lessons[p.programTitle];
        return (
          <View key={p.programTitle} style={styles.devWodCard}>
            <Text style={styles.devWodProgramTitle}>{p.programTitle}</Text>
            {id && meta ? (
              <TouchableOpacity
                activeOpacity={0.9}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  router.push(`/lesson/${id}` as any);
                }}
              >
                <Text style={styles.devWodLessonTitle}>{meta.title}</Text>
                <Text style={styles.devWodMeta}>
                  {p.coachName} · {p.coachSubtitle} ·{' '}
                  {Math.max(1, Math.round((meta.duration_seconds || 0) / 60))} min
                </Text>
                <View style={styles.devWodBeginRow}>
                  <Text style={styles.devWodBeginText}>Begin session</Text>
                  <Ionicons name="chevron-forward" size={15} color={colors.accentLight} />
                </View>
              </TouchableOpacity>
            ) : (
              <Text style={styles.devWodEmpty}>No lesson for day {day ?? '—'}</Text>
            )}
          </View>
        );
      })}
    </View>
  );
}

type Lesson = {
  id: string;
  title: string;
  duration_seconds: number;
  lesson_type: string;
  categories: string[];
  /** Active program day (1–30) when returned from `/lessons/next` */
  program_day?: number;
  program_version?: string;
};

type Progress = {
  mindfulness_score: number;
  acceptance_score: number;
  commitment_score: number;
  updated_at?: string | null;
  library_unlocked?: boolean;
  library_lock_reason?: string | null;
  library_lock_remaining?: number;
  deltas?: MacDeltas | null;
};

type Streak = {
  current_streak: number;
  longest_streak: number;
  last_activity_date: string | null;
  updated_at?: string | null;
  freebie_used?: boolean;
};

function getDaysUntil(dateStr: string | null): number | null {
  if (!dateStr) return null;
  const target = new Date(dateStr + 'T00:00:00');
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const diff = Math.ceil((target.getTime() - today.getTime()) / 86400000);
  return diff >= 0 ? diff : null;
}

const emptyProgress: Progress = {
  mindfulness_score: 0,
  acceptance_score: 0,
  commitment_score: 0,
};

const emptyStreak: Streak = {
  current_streak: 0,
  longest_streak: 0,
  last_activity_date: null,
  freebie_used: false,
};

function streakFreebieModalAckKey(userId: string): string {
  return `relentless:streak_freebie_ack_ymd:${userId}`;
}

const MISS_REFLECTION_JOURNAL_PATH = '/journal?entry_type=miss_reflection&limit=1';

type MissReflectionJournalListResponse = {
  items: { created_at: string; entry_type: string }[];
};

function isoToLocalYmd(iso: string): string {
  const d = new Date(iso);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** True if the latest miss_reflection was submitted on a calendar day after `last_activity_date`. */
function hasMissReflectionForCurrentGap(
  lastActivityYmd: string | null | undefined,
  latestMissCreatedAt: string | undefined,
): boolean {
  if (!lastActivityYmd || !latestMissCreatedAt) return false;
  return isoToLocalYmd(latestMissCreatedAt) > lastActivityYmd;
}

function safePct(n: number | undefined): number {
  if (n == null || Number.isNaN(n)) return 0;
  return Math.min(100, Math.max(0, n));
}

/** Outbound Grant Chiasson sessions page (referral partner). */
const GRANT_CHIASSON_REFERRAL_URL = 'https://grantchiasson.com/home';
/** Inline name + compact creds shown on the WOD coach row. */
const GRANT_CHIASSON_NAME = 'Grant Chiasson';
const GRANT_CHIASSON_WOD_SUBTITLE = 'M.S., MPM';

/** For gains, return the base (pre-gain) so purple stops before the green overlay. */
function ringBasePct(score: number | undefined, delta: ScoreDelta | undefined | null): number {
  const s = score ?? 0;
  if (delta && delta.amount > 0) return safePct(s - delta.amount);
  return safePct(s);
}

export default function HomeScreen() {
  const {
    competitionDate,
    session,
    onboardingComplete,
    hasPremiumAccess,
  } = useAuth();
  const currentUserId = session?.user?.id ?? null;
  const router = useRouter();
  const [lesson, setLesson] = useState<Lesson | null>(null);
  const [lastWod, setLastWod] = useState<Lesson | null>(null);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [streak, setStreak] = useState<Streak | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [progressLoadError, setProgressLoadError] = useState(false);
  const [streakLoadError, setStreakLoadError] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [journalText, setJournalText] = useState('');
  const [journalSaving, setJournalSaving] = useState(false);
  const [journalSaveError, setJournalSaveError] = useState('');
  const [journalSavedHint, setJournalSavedHint] = useState(false);
  const [activeDeltas, setActiveDeltas] = useState<MacDeltas | null>(null);
  const [showMissReflection, setShowMissReflection] = useState(false);
  const [missJournalText, setMissJournalText] = useState('');
  const [missJournalSaving, setMissJournalSaving] = useState(false);
  const [missJournalSaveError, setMissJournalSaveError] = useState('');
  const [missJournalDismissed, setMissJournalDismissed] = useState(false);
  const [showFreebieModal, setShowFreebieModal] = useState(false);
  const [keyboardBottomPad, setKeyboardBottomPad] = useState(0);
  const freebieScale = useRef(new Animated.Value(0)).current;
  const freebieOpacity = useRef(new Animated.Value(0)).current;
  const deltaDateRef = useRef<string | null>(null);
  const scrollRef = useRef<ScrollView>(null);
  const homeScrollYRef = useRef(0);
  const preWorkoutJournalFooterRef = useRef<View>(null);
  const missReflectionFooterRef = useRef<View>(null);
  const journalCardRef = useRef<View>(null);
  const journalFocusedRef = useRef(false);
  const lastSavedJournalRef = useRef('');
  const initialLoadDone = useRef(false);

  const journalPrompt = "What's on your mind going into today's session?";

  const fetchData = useCallback(async (isPullRefresh = false) => {
    setError('');
    setProgressLoadError(false);
    setStreakLoadError(false);
    const homeHeaders = { ...HOME_PROGRAM_ANCHOR_HEADERS };

    const applyMissReflectionFromStreakAndJournal = (
      streakData: Streak,
      missJournalRes: {
        data: MissReflectionJournalListResponse | null;
        error: string | null;
      },
      freebieAckYmd: string | null,
    ) => {
      setShowMissReflection(false);
      const items = missJournalRes.error ? undefined : missJournalRes.data?.items;
      const latestCreated = items?.[0]?.created_at;
      const hasMissJournalForGap = hasMissReflectionForCurrentGap(
        streakData.last_activity_date,
        latestCreated,
      );

      if (streakData.last_activity_date) {
        const lastDate = new Date(streakData.last_activity_date + 'T00:00:00');
        const now = new Date();
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const daysSince = Math.floor((today.getTime() - lastDate.getTime()) / 86400000);

        const shouldShowFreebie =
          daysSince === 2 &&
          !streakData.freebie_used &&
          streakData.last_activity_date !== freebieAckYmd;

        if (shouldShowFreebie) {
          setShowFreebieModal(true);
        } else {
          setShowFreebieModal(false);
        }
        if (
          !shouldShowFreebie &&
          !missJournalDismissed &&
          !hasMissJournalForGap &&
          (daysSince >= 3 || (daysSince === 2 && streakData.freebie_used))
        ) {
          setShowMissReflection(true);
        }
      } else {
        setShowFreebieModal(false);
      }
    };

    if (isPullRefresh) {
      setRefreshing(true);
      bustCache('/lessons/next', '/progress', '/streak');
    } else {
      const cachedLesson = getCached<{ data: Lesson | null; rawBody?: Record<string, unknown> }>('/lessons/next');
      const cachedProgress = getCached<Progress>('/progress');
      const cachedStreak = getCached<Streak>('/streak');
      if (cachedLesson && cachedProgress && cachedStreak) {
        setLesson(cachedLesson.data);
        const rpt = cachedLesson.rawBody?.repeat_lesson;
        setLastWod(rpt ? (rpt as Lesson) : null);
        setProgress(cachedProgress);
        setStreak(cachedStreak);
        setLoading(false);
        initialLoadDone.current = true;

        const [missJournalRes, freebieAckYmd] = await Promise.all([
          apiFetch<MissReflectionJournalListResponse>(
            MISS_REFLECTION_JOURNAL_PATH,
            { headers: homeHeaders },
          ),
          currentUserId != null
            ? AsyncStorage.getItem(streakFreebieModalAckKey(currentUserId))
            : Promise.resolve(null),
        ]);
        applyMissReflectionFromStreakAndJournal(cachedStreak, missJournalRes, freebieAckYmd);
        setRefreshing(false);
        return;
      }
      if (!initialLoadDone.current) setLoading(true);
    }

    const [lessonRes, progressRes, streakRes, missJournalRes, freebieAckYmd] = await Promise.all([
      apiFetch<Lesson>('/lessons/next', { headers: homeHeaders }),
      apiFetch<Progress>('/progress', { headers: homeHeaders }),
      apiFetch<Streak>('/streak', { headers: homeHeaders }),
      apiFetch<MissReflectionJournalListResponse>(MISS_REFLECTION_JOURNAL_PATH, { headers: homeHeaders }),
      currentUserId != null
        ? AsyncStorage.getItem(streakFreebieModalAckKey(currentUserId))
        : Promise.resolve(null),
    ]);

    if (lessonRes.error) {
      setError(lessonRes.error);
    }
    if (progressRes.error) {
      setProgressLoadError(true);
    }
    if (streakRes.error) {
      setStreakLoadError(true);
    }

    const nextLesson = lessonRes.data ?? null;
    setLesson(nextLesson);
    const rpt = lessonRes.rawBody?.repeat_lesson;
    setLastWod(rpt ? (rpt as Lesson) : null);
    const prog = progressRes.error ? emptyProgress : (progressRes.data ?? emptyProgress);
    setProgress(prog);
    const streakData = streakRes.error ? emptyStreak : (streakRes.data ?? emptyStreak);
    setStreak(streakData);

    if (nextLesson) trackWodViewed({ lesson_id: nextLesson.id });
    if (!streakRes.error) trackStreakViewed({ current_streak: streakData.current_streak });
    if (!progressRes.error) trackProgressRingViewed();

    applyMissReflectionFromStreakAndJournal(streakData, missJournalRes, freebieAckYmd);

    const today = getDeviceLocalCalendarYmd();
    const gainDeltas = getPendingGainDeltas();
    if (gainDeltas) {
      setActiveDeltas(gainDeltas);
      deltaDateRef.current = today;
    } else if (prog.deltas && Object.keys(prog.deltas).length > 0) {
      setActiveDeltas(prog.deltas);
      deltaDateRef.current = today;
    } else if (deltaDateRef.current && deltaDateRef.current !== today) {
      setActiveDeltas(null);
      deltaDateRef.current = null;
    }

    if (!lessonRes.error && !progressRes.error && !streakRes.error) {
      setCached('/lessons/next', { data: nextLesson, rawBody: lessonRes.rawBody });
      setCached('/progress', prog);
      setCached('/streak', streakData);
    }

    initialLoadDone.current = true;
    setLoading(false);
    setRefreshing(false);
  }, [currentUserId, missJournalDismissed]);

  useFocusEffect(
    useCallback(() => {
      void fetchData(false);
    }, [fetchData]),
  );

  useEffect(() => {
    setJournalText('');
    lastSavedJournalRef.current = '';
    setJournalSaveError('');
    setJournalSavedHint(false);
  }, [lesson?.id]);

  useEffect(() => {
    if (!showFreebieModal) return;
    freebieScale.setValue(0);
    freebieOpacity.setValue(0);
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
    Animated.sequence([
      Animated.timing(freebieOpacity, { toValue: 1, duration: 200, useNativeDriver: true }),
      Animated.spring(freebieScale, { toValue: 1, friction: 5, tension: 100, useNativeDriver: true }),
    ]).start();
  }, [showFreebieModal]);

  // Inflate bottom padding when keyboard opens (gives the ScrollView room to scroll)
  // then center the pre-workout check-in card once the keyboard is fully up.
  useEffect(() => {
    const willShow = Keyboard.addListener('keyboardWillShow', (e) => {
      setKeyboardBottomPad(e.endCoordinates.height);
    });
    const willHide = Keyboard.addListener('keyboardWillHide', () => {
      setKeyboardBottomPad(0);
    });
    const didShow = Keyboard.addListener('keyboardDidShow', (e) => {
      if (!journalFocusedRef.current) return;
      const keyboardTop = e.endCoordinates.screenY;
      journalCardRef.current?.measureInWindow((_x, cardScreenY, _w, cardH) => {
        const targetCardScreenY = Math.max(30, (keyboardTop - cardH) / 2);
        const nextY = homeScrollYRef.current + cardScreenY - targetCardScreenY;
        scrollRef.current?.scrollTo({ y: Math.max(0, nextY), animated: true });
      });
    });
    return () => { willShow.remove(); willHide.remove(); didShow.remove(); };
  }, []);

  const dismissFreebie = () => {
    const ymd = streak?.last_activity_date;
    if (ymd && currentUserId) {
      void AsyncStorage.setItem(streakFreebieModalAckKey(currentUserId), ymd);
    }
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    Animated.timing(freebieOpacity, { toValue: 0, duration: 200, useNativeDriver: true }).start(() => {
      setShowFreebieModal(false);
    });
  };

  const flushPreWorkoutJournal = useCallback(async () => {
    const trimmed = journalText.trim();
    if (!trimmed || trimmed === lastSavedJournalRef.current) {
      return true;
    }
    setJournalSaving(true);
    setJournalSaveError('');
    const { error: saveErr } = await apiFetch('/journal', {
      method: 'POST',
      headers: { ...HOME_PROGRAM_ANCHOR_HEADERS },
      body: {
        body: `${journalPrompt}\n\n${trimmed}`,
        ...(lesson?.id ? { lesson_id: lesson.id } : {}),
      },
    });
    setJournalSaving(false);
    if (saveErr) {
      setJournalSaveError(saveErr);
      return false;
    }
    lastSavedJournalRef.current = trimmed;
    setJournalSavedHint(true);
    setTimeout(() => setJournalSavedHint(false), 2500);
    return true;
  }, [journalText, lesson?.id, journalPrompt]);

  const handleStartWorkout = async (overrideId?: string) => {
    const targetId = overrideId ?? lesson?.id;
    if (!targetId) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    trackWodStarted({ lesson_id: targetId, is_repeat: Boolean(overrideId) });
    await flushPreWorkoutJournal();
    bustCache('/lessons/next', '/progress', '/streak');
    router.push(`/lesson/${targetId}` as any);
  };

  const handleScheduleSession = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    trackPartnerReferralCtaClicked({
      referral_partner_key: 'grant_chiasson',
      cta_placement: 'home_wod_card',
      outbound_url: GRANT_CHIASSON_REFERRAL_URL,
      authenticated: Boolean(session),
      onboarding_completed: onboardingComplete,
      premium: hasPremiumAccess,
    });
    void Linking.openURL(GRANT_CHIASSON_REFERRAL_URL);
  };

  const mins = lesson ? approxLessonMinutes(lesson.duration_seconds) : 0;
  const streakIsReset = showMissReflection && !missJournalDismissed && streak?.current_streak === 0;

  return (
    <View style={styles.screen}>
    <ScrollView
      ref={scrollRef}
      contentContainerStyle={[styles.content, keyboardBottomPad > 0 && { paddingBottom: TAB_BAR_CLEARANCE + keyboardBottomPad }]}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="interactive"
      onScroll={(e) => {
        homeScrollYRef.current = e.nativeEvent.contentOffset.y;
      }}
      scrollEventThrottle={16}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => void fetchData(true)}
          tintColor={colors.accent}
        />
      }
    >
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.brand}>RELENTLESS</Text>
        <View style={styles.headerRight}>
          {(() => {
            const days = getDaysUntil(competitionDate);
            return (
              <View style={styles.countdownPill}>
                <MaterialCommunityIcons
                  name="bullseye-arrow"
                  size={17}
                  color={days != null ? colors.accentLight : colors.textMuted}
                />
                <Text style={[styles.countdownText, days != null && { color: colors.accentLight }]}>
                  {days != null ? `${days}d` : '—'}
                </Text>
              </View>
            );
          })()}
          <View style={[
            styles.streakPill,
            streakLoadError && styles.streakPillMuted,
            streakIsReset && styles.streakPillBroken,
          ]}>
            <Text style={[styles.streakNum, streakIsReset && { color: colors.error }]}>
              {streakLoadError ? '—' : streak?.current_streak ?? 0}
            </Text>
            <Ionicons
              name="flame"
              size={16}
              color={streakIsReset ? colors.error : streakLoadError ? colors.textMuted : '#f59e0b'}
            />
          </View>
        </View>
      </View>

      {/* MAC Progress Rings */}
      <View style={styles.ringsRow}>
        <ProgressRing
          percentage={ringBasePct(progress?.mindfulness_score, activeDeltas?.mindfulness)}
          label="Mindfulness"
          delta={activeDeltas?.mindfulness}
          ringColor={colors.ringMindfulness}
        />
        <ProgressRing
          percentage={ringBasePct(progress?.acceptance_score, activeDeltas?.acceptance)}
          label="Acceptance"
          delta={activeDeltas?.acceptance}
          ringColor={colors.ringAcceptance}
        />
        <ProgressRing
          percentage={ringBasePct(progress?.commitment_score, activeDeltas?.commitment)}
          label="Commitment"
          delta={activeDeltas?.commitment}
          ringColor={colors.ringCommitment}
        />
      </View>
      {progressLoadError && (
        <Text style={styles.dataWarning}>Progress unavailable. Pull to refresh or retry.</Text>
      )}

      {/* Miss-reflection cards (PRD §7) — shown when freebie used & still inactive */}
      {showMissReflection && !missJournalDismissed && (
        <>
          {/* MISSED header card */}
          <View style={styles.missedCard}>
            <View style={styles.missedAccentBar} />
            <View style={styles.missedCardInner}>
              <View style={styles.missedHeaderRow}>
                <Text style={styles.missedLabel}>MISSED</Text>
                {streakIsReset && (
                  <Text style={styles.missedDay}>Streak reset</Text>
                )}
              </View>
              <View style={styles.missedDecayRow}>
                <Ionicons name="trending-down" size={13} color={colors.error} />
                <Text style={styles.missedDecayText}>
                  {streakIsReset ? '−2 pts per ring · streak reset' : '−2 pts per ring'}
                </Text>
              </View>
            </View>
          </View>

          {/* Reflection card */}
          <View style={styles.reflectionCard}>
            <View style={styles.reflectionHeader}>
              <Ionicons name="journal-outline" size={13} color={colors.error} />
              <Text style={styles.reflectionLabel}>REFLECTION</Text>
            </View>
            <TextInput
              style={styles.reflectionInput}
              placeholder="Why did you miss today?"
              placeholderTextColor="rgba(239,68,68,0.45)"
              value={missJournalText}
              onChangeText={(t) => {
                setMissJournalText(t);
                if (missJournalSaveError) setMissJournalSaveError('');
              }}
              multiline
              scrollEnabled={false}
              editable={!missJournalSaving}
              onFocus={() =>
                scheduleScrollFooterAboveKeyboard(
                  scrollRef,
                  missReflectionFooterRef,
                  homeScrollYRef,
                )
              }
              onContentSizeChange={() =>
                scheduleScrollFooterAboveKeyboard(
                  scrollRef,
                  missReflectionFooterRef,
                  homeScrollYRef,
                )
              }
            />
            {missJournalSaveError ? (
              <Text style={styles.missJournalError}>{missJournalSaveError}</Text>
            ) : null}
            <View ref={missReflectionFooterRef} collapsable={false} style={styles.missBtnRow}>
              <TouchableOpacity
                style={styles.missSkipBtn}
                onPress={() => {
                  setShowMissReflection(false);
                  setMissJournalDismissed(true);
                }}
              >
                <Text style={styles.missSkipText}>Skip</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.missSubmitBtn, !missJournalText.trim() && { opacity: 0.5 }]}
                disabled={!missJournalText.trim() || missJournalSaving}
                onPress={async () => {
                  setMissJournalSaveError('');
                  setMissJournalSaving(true);
                  const { error: missErr } = await apiFetch('/journal', {
                    method: 'POST',
                    headers: { ...HOME_PROGRAM_ANCHOR_HEADERS },
                    body: {
                      body: `Why did you miss today?\n\n${missJournalText.trim()}`,
                      entry_type: 'miss_reflection',
                    },
                  });
                  setMissJournalSaving(false);
                  if (missErr) {
                    setMissJournalSaveError(missErr);
                    return;
                  }
                  bustCache('/journal?limit=50', MISS_REFLECTION_JOURNAL_PATH);
                  trackReflectionSaved({ type: 'miss_reflection' });
                  setMissJournalText('');
                  setMissJournalDismissed(true);
                  setShowMissReflection(false);
                  void fetchData(false);
                }}
              >
                <Text style={styles.missSubmitText}>
                  {missJournalSaving ? 'Saving...' : 'Submit'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </>
      )}

      {error ? (
        <View style={styles.inlineError}>
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity style={styles.retryBtn} onPress={() => void fetchData(false)}>
            <Text style={styles.retryText}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <View style={styles.workoutCardOuter}>
          <View style={styles.workoutCardInner}>
            {loading ? (
              <WorkoutCardSkeleton />
            ) : lesson ? (
              <TouchableOpacity
                style={styles.wodTapArea}
                activeOpacity={0.9}
                onPress={() => void handleStartWorkout()}
              >
                {/* TOP — label + day number */}
                <View style={styles.wodTopSection}>
                  <View style={styles.workoutLabelPill}>
                    <Text style={styles.workoutLabelText}>WORKOUT OF THE DAY</Text>
                  </View>
                  {typeof lesson.program_day === 'number' && (
                    <Text style={styles.workoutDayBadge}>Day {lesson.program_day} · 30-day program</Text>
                  )}
                </View>

                {/* MIDDLE — title fills remaining space */}
                <View style={styles.wodTitleSection}>
                  <Text style={styles.workoutTitle}>{lesson.title}</Text>
                </View>

                {/* BOTTOM — coach row + actions */}
                <View style={styles.wodBottomSection}>
                  <View style={styles.wodDivider} />
                  <View style={styles.workoutAuthorRow}>
                    <View style={styles.workoutAuthorPhotoRing}>
                      <Image
                        source={require('../../assets/images/grant_chiasson.png')}
                        style={styles.workoutAuthorPhotoImg}
                        resizeMode="cover"
                      />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.workoutAuthorName}>{GRANT_CHIASSON_NAME}</Text>
                      <Text style={styles.workoutAuthorCred}>{GRANT_CHIASSON_WOD_SUBTITLE}</Text>
                    </View>
                    <View style={styles.workoutMetaPill}>
                      <Text style={styles.workoutMeta}>{mins} min</Text>
                    </View>
                  </View>
                  <View style={styles.wodActionRow}>
                    <View style={styles.wodBeginBtn}>
                      <Text style={styles.wodBeginBtnText}>Begin session</Text>
                      <Ionicons name="chevron-forward" size={16} color={colors.white} />
                    </View>
                    <TouchableOpacity
                      style={styles.wodScheduleBtn}
                      activeOpacity={0.85}
                      onPress={handleScheduleSession}
                    >
                      <Ionicons name="calendar-outline" size={17} color={colors.accentLight} />
                      <Text style={styles.wodScheduleBtnText}>Schedule</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                style={styles.wodTapArea}
                activeOpacity={lastWod ? 0.9 : 1}
                onPress={lastWod ? () => void handleStartWorkout(lastWod.id) : undefined}
              >
                <View style={styles.workoutDoneBody}>
                  <Ionicons name="checkmark-circle" size={40} color={colors.success} style={{ marginBottom: 14 }} />
                  <Text style={styles.workoutTitleDone}>All caught up!</Text>
                  <Text style={styles.workoutDesc}>Come back tomorrow for the next workout</Text>
                </View>
                <View style={styles.wodActionRow}>
                  {lastWod && (
                    <View style={styles.wodBeginBtn}>
                      <Ionicons name="refresh" size={15} color={colors.white} style={{ marginRight: 6 }} />
                      <Text style={styles.wodBeginBtnText}>Repeat workout</Text>
                    </View>
                  )}
                  <TouchableOpacity
                    style={styles.wodScheduleBtn}
                    activeOpacity={0.85}
                    onPress={handleScheduleSession}
                  >
                    <Ionicons name="calendar-outline" size={17} color={colors.accentLight} />
                    <Text style={styles.wodScheduleBtnText}>Schedule</Text>
                  </TouchableOpacity>
                </View>
              </TouchableOpacity>
            )}
          </View>
        </View>
      )}

      {!error && lesson && lastWod && lastWod.id !== lesson.id && (
        <TouchableOpacity
          style={styles.repeatStandalone}
          onPress={() => void handleStartWorkout(lastWod.id)}
        >
          <Ionicons name="refresh" size={14} color={colors.accent} style={{ marginRight: 6 }} />
          <Text style={styles.repeatBtnText}>Repeat Today's Workout</Text>
        </TouchableOpacity>
      )}

      {/* Today's Focus — lightweight pre-session note */}
      <View
        ref={journalCardRef}
        style={styles.journalCard}
      >
        <Text style={styles.journalLabel}>TODAY'S FOCUS</Text>
        <TextInput
          style={styles.journalInput}
          placeholder={journalPrompt}
          placeholderTextColor={colors.textMuted}
          value={journalText}
          onChangeText={(t) => {
            setJournalText(t);
            setJournalSaveError('');
            setJournalSavedHint(false);
          }}
          multiline
          scrollEnabled={false}
          autoCorrect
          spellCheck
          editable={!journalSaving}
          onFocus={() => { journalFocusedRef.current = true; }}
          onBlur={() => { journalFocusedRef.current = false; }}
          onContentSizeChange={() =>
            scheduleScrollFooterAboveKeyboard(
              scrollRef,
              preWorkoutJournalFooterRef,
              homeScrollYRef,
            )
          }
        />
        <View ref={preWorkoutJournalFooterRef} collapsable={false} style={styles.journalFooter}>
          {journalSaving ? (
            <Text style={styles.journalHint}>Saving…</Text>
          ) : journalSaveError ? (
            <Text style={styles.journalError}>{journalSaveError}</Text>
          ) : journalSavedHint ? (
            <Text style={styles.journalHint}>Saved</Text>
          ) : (
            <View />
          )}
          {journalText.trim().length > 0 && journalText.trim() !== lastSavedJournalRef.current && !journalSaving && (
            <TouchableOpacity
              style={styles.journalSaveBtn}
              onPress={() => void flushPreWorkoutJournal()}
            >
              <Text style={styles.journalSaveBtnText}>Save</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {__DEV__ && <DevWodSection />}

    </ScrollView>

    <Modal visible={showFreebieModal} transparent animationType="none">
      <Animated.View style={[styles.freebieOverlay, { opacity: freebieOpacity }]}>
        <Animated.View style={[styles.freebieCard, { transform: [{ scale: freebieScale }] }]}>
          <View style={styles.freebieIconWrap}>
            <Ionicons name="shield-checkmark" size={48} color="#f59e0b" />
          </View>
          <Text style={styles.freebieTitle}>Streak saved!</Text>
          <Text style={styles.freebieSub}>
            You missed yesterday, but your{' '}
            <Text style={{ color: '#f59e0b', fontWeight: '700' }}>
              {streak?.current_streak ?? 0} day streak
            </Text>
            {' '}is still alive.
          </Text>
          <Text style={styles.freebieNote}>
            This is your one free pass — don{"'"}t let it happen again.
          </Text>
          <TouchableOpacity style={styles.freebieBtn} onPress={dismissFreebie}>
            <Text style={styles.freebieBtnText}>Let{"'"}s Go</Text>
          </TouchableOpacity>
        </Animated.View>
      </Animated.View>
    </Modal>

    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    paddingHorizontal: 20,
    paddingTop: 64,
    paddingBottom: TAB_BAR_CLEARANCE,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 32,
  },
  brand: {
    fontSize: 24,
    fontWeight: '800',
    color: colors.textPrimary,
    letterSpacing: 3,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  countdownPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: colors.surface,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: colors.border,
  },
  countdownText: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.textMuted,
    letterSpacing: 0.5,
  },
  streakPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.surface,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: colors.border,
  },
  streakPillMuted: {
    opacity: 0.85,
  },
  dataWarning: {
    fontSize: 12,
    color: colors.textMuted,
    textAlign: 'center',
    marginTop: -18,
    marginBottom: 20,
    paddingHorizontal: 8,
  },
  streakNum: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  ringsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: 36,
  },
  workoutCardOuter: {
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(167, 139, 250, 0.4)',
    backgroundColor: colors.surface,
    overflow: 'hidden',
    marginBottom: spacing.md,
  },
  workoutCardInner: {
    flexDirection: 'column',
    paddingHorizontal: spacing.xl,
    paddingTop: 24,
    paddingBottom: 24,
    minHeight: screenHeight * 0.46,
  },
  wodTopSection: {
    width: '100%',
    marginBottom: 4,
  },
  wodTitleSection: {
    flex: 1,
    justifyContent: 'center' as const,
    width: '100%',
    paddingVertical: 12,
  },
  wodBottomSection: {
    width: '100%',
  },
  wodDivider: {
    height: 1,
    backgroundColor: 'rgba(167, 139, 250, 0.15)',
    marginBottom: 18,
  },
  workoutLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    marginBottom: 10,
  },
  workoutLessonBody: {
    width: '100%',
    alignItems: 'flex-start' as const,
  },
  workoutDoneBody: {
    flex: 1,
    width: '100%',
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  workoutLabelPill: {
    alignSelf: 'flex-start' as const,
    backgroundColor: colors.accentSubtle,
    borderWidth: 1,
    borderColor: 'rgba(167, 139, 250, 0.28)',
    borderRadius: 999,
    paddingVertical: 6,
    paddingHorizontal: 14,
    marginBottom: 10,
  },
  workoutLabelText: {
    fontSize: 10,
    fontWeight: '800',
    color: colors.accentLight,
    letterSpacing: 1.2,
  },
  workoutDayBadge: {
    fontSize: 12,
    fontWeight: '500',
    color: colors.textMuted,
    letterSpacing: 0.2,
    paddingLeft: 14,
  },
  workoutTitle: {
    fontSize: 28,
    fontWeight: '800',
    color: colors.textPrimary,
    textAlign: 'left',
    lineHeight: 36,
  },
  workoutAuthorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 16,
  },
  workoutAuthorPhotoRing: {
    width: 58,
    height: 58,
    borderRadius: 999,
    borderWidth: 2,
    borderColor: 'rgba(167, 139, 250, 0.4)',
    overflow: 'hidden',
  },
  workoutAuthorPhotoImg: {
    width: '100%' as any,
    height: '100%' as any,
    transform: [{ scale: 1.6 }, { translateY: -5 }],
  },
  workoutAuthorName: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  workoutAuthorCred: {
    fontSize: 12,
    fontWeight: '500',
    color: colors.accentLight,
    marginTop: 2,
  },
  workoutTitleDone: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.textPrimary,
    textAlign: 'center',
    lineHeight: 26,
  },
  workoutMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 10,
  },
  workoutDesc: {
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
    marginTop: 10,
  },
  workoutMetaPill: {
    backgroundColor: colors.accentSubtle,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(167, 139, 250, 0.3)',
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  workoutMeta: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.accentLight,
    letterSpacing: 0.3,
  },
  wodStartRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 4,
  },
  wodStartText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.accentLight,
    letterSpacing: 0.2,
  },
  wodTapArea: {
    flex: 1,
    width: '100%',
  },
  wodActionRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: 10,
  },
  wodBeginBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: colors.accent,
    borderRadius: 14,
    paddingVertical: 15,
    paddingHorizontal: 18,
  },
  wodBeginBtnText: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.white,
    letterSpacing: 0.2,
  },
  wodScheduleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.accent,
    backgroundColor: colors.accentSubtle,
    paddingVertical: 15,
    paddingHorizontal: 18,
  },
  wodScheduleBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.accentLight,
    letterSpacing: 0.2,
  },
  repeatBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 20,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.accent,
    backgroundColor: colors.accentSubtle,
  },
  repeatBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.accent,
    letterSpacing: 0.2,
  },
  repeatStandalone: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    marginBottom: spacing.sm,
  },
  streakPillBroken: {
    borderColor: 'rgba(239,68,68,0.4)',
    backgroundColor: 'rgba(239,68,68,0.08)',
  },
  // MISSED header card
  missedCard: {
    flexDirection: 'row',
    backgroundColor: 'rgba(239,68,68,0.06)',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(239,68,68,0.35)',
    marginBottom: spacing.sm,
    overflow: 'hidden',
  },
  missedAccentBar: {
    width: 4,
    backgroundColor: colors.error,
  },
  missedCardInner: {
    flex: 1,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  missedHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 8,
  },
  missedLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: colors.error,
    letterSpacing: 1.5,
  },
  missedDay: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.textMuted,
  },
  missedDecayRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  missedDecayText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.error,
  },
  // Reflection card
  reflectionCard: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(239,68,68,0.3)',
    padding: spacing.lg,
    marginBottom: spacing.md,
  },
  reflectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 12,
  },
  reflectionLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: colors.error,
    letterSpacing: 1.2,
  },
  reflectionInput: {
    backgroundColor: colors.surfaceLight,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(239,68,68,0.2)',
    padding: spacing.md,
    color: colors.textPrimary,
    fontSize: 14,
    minHeight: 56,
    textAlignVertical: 'top',
    marginBottom: 8,
  },
  missJournalError: {
    fontSize: 13,
    color: colors.error,
    marginBottom: 8,
    fontWeight: '500',
  },
  missBtnRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
  },
  missSkipBtn: {
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  missSkipText: {
    fontSize: 13,
    fontWeight: '500',
    color: colors.textMuted,
  },
  missSubmitBtn: {
    backgroundColor: colors.accent,
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 20,
  },
  missSubmitText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.white,
  },
  journalCard: {
    backgroundColor: colors.surface,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(167, 139, 250, 0.22)',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    marginTop: spacing.md,
  },
  devWodWrap: {
    marginTop: spacing.lg,
  },
  devWodSectionLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
    color: colors.textMuted,
    marginBottom: 8,
  },
  devWodCard: {
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.border,
    borderRadius: 14,
    padding: 16,
    marginBottom: 12,
    backgroundColor: colors.surface,
  },
  devWodProgramTitle: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.5,
    color: colors.accentLight,
    marginBottom: 6,
  },
  devWodLessonTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: 4,
  },
  devWodMeta: {
    fontSize: 13,
    color: colors.textSecondary,
    marginBottom: 10,
  },
  devWodBeginRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  devWodBeginText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.accentLight,
    marginRight: 4,
  },
  devWodEmpty: {
    fontSize: 13,
    color: colors.textMuted,
  },
  journalLabel: {
    fontSize: 9,
    fontWeight: '700',
    color: 'rgba(167, 139, 250, 0.72)',
    letterSpacing: 1.4,
    marginBottom: 8,
  },
  journalInput: {
    backgroundColor: colors.surfaceLight,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(167, 139, 250, 0.12)',
    padding: spacing.md,
    color: colors.textPrimary,
    fontSize: 14,
    minHeight: 64,
    textAlignVertical: 'top',
  },
  journalFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 10,
  },
  journalSaveBtn: {
    backgroundColor: colors.accent,
    borderRadius: 8,
    paddingVertical: 7,
    paddingHorizontal: 18,
  },
  journalSaveBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.white,
  },
  journalHint: {
    fontSize: 12,
    color: colors.success,
  },
  journalError: {
    fontSize: 12,
    color: colors.error,
  },
  ctaCard: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.accent,
    padding: spacing.lg,
    alignItems: 'center',
    marginTop: spacing.lg,
  },
  ctaTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: colors.textPrimary,
    textAlign: 'center',
    lineHeight: 22,
  },
  ctaByline: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.accent,
    textAlign: 'center',
    marginTop: 10,
  },
  ctaSub: {
    fontSize: 13,
    color: colors.textMuted,
    marginTop: 6,
    textAlign: 'center',
    lineHeight: 19,
    maxWidth: 280,
  },
  inlineError: {
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  errorText: {
    color: colors.error,
    fontSize: 14,
    textAlign: 'center',
    marginBottom: spacing.md,
  },
  retryBtn: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 24,
  },
  retryText: {
    color: colors.textPrimary,
    fontSize: 14,
    fontWeight: '500',
  },
  freebieOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.85)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
  },
  freebieCard: {
    backgroundColor: colors.surface,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.xl,
    alignItems: 'center',
    width: '100%',
  },
  freebieIconWrap: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: 'rgba(245, 158, 11, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(245, 158, 11, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.lg,
  },
  freebieTitle: {
    fontSize: 26,
    fontWeight: '800',
    color: colors.white,
    marginBottom: spacing.sm,
  },
  freebieSub: {
    fontSize: 16,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 24,
    marginBottom: spacing.md,
  },
  freebieNote: {
    fontSize: 14,
    color: colors.textMuted,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: spacing.xl,
    fontStyle: 'italic',
  },
  freebieBtn: {
    backgroundColor: colors.accent,
    borderRadius: 14,
    paddingVertical: 16,
    paddingHorizontal: 48,
    alignItems: 'center',
  },
  freebieBtnText: {
    color: colors.white,
    fontSize: 16,
    fontWeight: '700',
  },
});
