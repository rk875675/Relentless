import { useCallback, useEffect, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  Animated,
  Image,
  Keyboard,
  Modal,
  Platform,
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  ScrollView,
  TextInput,
  RefreshControl,
  Linking,
  useWindowDimensions,
  type ImageSourcePropType,
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
import { MoreProgramsSkeleton, WorkoutCardSkeleton } from '@/components/Skeleton';
import { getPendingGainDeltas, type MacDeltas } from '@/lib/pending-deltas';
import { colors, spacing, TAB_BAR_CLEARANCE } from '@/lib/theme';
import { getCached, setCached, bustCache } from '@/lib/api-cache';
import { scheduleScrollFooterAboveKeyboard } from '@/lib/schedule-scroll-for-keyboard';
import {
  trackPartnerReferralCtaClicked,
  trackWodViewed,
  trackWodStarted,
  trackStreakViewed,
  trackProgressRingViewed,
  trackReflectionSaved,
  trackPushRemindersEnabled,
  trackPushPermissionDenied,
} from '@/lib/core-analytics';
import { registerForPushNotifications } from '@/lib/push-notifications';

// Single source of truth for the Workout-of-the-Day card. Used by the real WOD
// and the dev multi-coach preview, so any change to the WOD UI applies to all
// WODs. coachPhoto is optional — when absent a neutral placeholder avatar shows.
// onSchedule is optional — when absent the Schedule CTA is hidden.
type WodCardProps = {
  title: string;
  /** e.g. "30-Day Sprint (Day 5/30)" */
  programLine?: string | null;
  coachPhoto?: ImageSourcePropType | null;
  onPress: () => void;
  onSchedule?: () => void;
};

function WodCard({ title, programLine, coachPhoto, onPress, onSchedule }: WodCardProps) {
  // Explicit pixel sizing so the hero can never collapse or misalign:
  // card width = window - home content padding (20 × 2) - card border (1 × 2).
  // The wrap is shifted left by the card's inner padding (32) so the photo
  // runs flush to the card's edges; the square image inside is top-aligned,
  // cropping the bottom rather than the face.
  const { width: windowWidth } = useWindowDimensions();
  const heroWidth = windowWidth - 42;
  // Taller hero (≈1.2:1) — extends under the overlaid header and shows more
  // of the photo ("zoomed out").
  const heroHeight = Math.round(heroWidth / 1.2);

  return (
    <TouchableOpacity style={styles.wodTapArea} activeOpacity={0.9} onPress={onPress}>
      {/* HERO — coach photo, full-bleed to the card's top + side edges,
          with the header overlaid on top of the image */}
      <View style={[styles.wodHeroWrap, { width: heroWidth, height: heroHeight }]}>
        {coachPhoto ? (
          <Image
            source={coachPhoto}
            style={{ width: heroWidth, height: heroWidth }}
            resizeMode="cover"
          />
        ) : (
          <View style={styles.wodHeroPlaceholder}>
            <Ionicons name="person" size={64} color={colors.textSecondary} />
          </View>
        )}
        <Text style={styles.wodHeader}>Workout of The Day</Text>
      </View>

      {/* Lesson title + program line */}
      <View style={styles.wodMetaSection}>
        <Text style={styles.wodLessonTitle}>{title}</Text>
        {programLine ? <Text style={styles.wodProgramLine}>{programLine}</Text> : null}
      </View>

      <View style={styles.wodActionRow}>
        {onSchedule ? (
          <TouchableOpacity style={styles.wodScheduleBtn} activeOpacity={0.85} onPress={onSchedule}>
            <Text style={styles.wodScheduleBtnText}>Schedule</Text>
          </TouchableOpacity>
        ) : null}
        <View style={styles.wodBeginBtn}>
          <Text style={styles.wodBeginBtnText}>Start</Text>
        </View>
      </View>
    </TouchableOpacity>
  );
}

/** Coach display data attached (additively) to lesson responses by the server. */
type CoachSummary = {
  coach_key?: string | null;
  name: string;
  credentials?: string | null;
  bio?: string | null;
  /** Signed URL when the coach photo lives in storage. */
  avatar_url?: string | null;
  offer_label?: string | null;
  external_url?: string | null;
};

type Lesson = {
  id: string;
  title: string;
  duration_seconds: number;
  lesson_type: string;
  categories: string[];
  /** Active program day (1–30) when returned from `/lessons/next` */
  program_day?: number;
  program_version?: string;
  program_title?: string | null;
  program_total_days?: number | null;
  coach?: CoachSummary | null;
};

/** Row in the Home "More programs you might like" rail (GET /programs). */
type RecommendedProgram = {
  id: string;
  title: string;
  coach_name: string;
  coach_sport?: string | null;
  coach_avatar_url?: string | null;
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

function pushPromptShownKey(userId: string): string {
  return `relentless:push_prompt_shown:${userId}`;
}

function programFeedbackSentKey(userId: string): string {
  return `relentless:program_feedback_sent:${userId}`;
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

const GRANT_PHOTO = require('../../assets/images/grant_chiasson_hero.png');

/** Signed avatar from the API when present; bundled Grant photo as the fallback for the original program. */
function coachPhotoSource(coach?: CoachSummary | null): ImageSourcePropType | null {
  if (coach?.avatar_url) return { uri: coach.avatar_url };
  if (!coach || coach.coach_key === 'grant-chiasson') return GRANT_PHOTO;
  return null;
}

/** "30-Day Sprint (Day 5/30)" — falls back to the original program's values when the API hasn't sent them. */
function programLineFor(lesson: Lesson): string | null {
  if (typeof lesson.program_day !== 'number') return null;
  const title = lesson.program_title ?? '30-Day Sprint';
  const total = lesson.program_total_days ?? 30;
  return `${title} (Day ${lesson.program_day}/${total})`;
}

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
  const [showPushPrompt, setShowPushPrompt] = useState(false);
  const [pushPromptBusy, setPushPromptBusy] = useState(false);
  const [programComplete, setProgramComplete] = useState(false);
  const [feedbackText, setFeedbackText] = useState('');
  const [feedbackSaving, setFeedbackSaving] = useState(false);
  const [feedbackSaved, setFeedbackSaved] = useState(false);
  const [feedbackError, setFeedbackError] = useState('');
  /** null = not yet loaded this session (skeleton); [] = loaded, nothing to show. */
  const [recPrograms, setRecPrograms] = useState<RecommendedProgram[] | null>(null);
  const freebieScale = useRef(new Animated.Value(0)).current;
  const freebieOpacity = useRef(new Animated.Value(0)).current;
  const deltaDateRef = useRef<string | null>(null);
  const scrollRef = useRef<ScrollView>(null);
  const homeScrollYRef = useRef(0);
  const preWorkoutJournalFooterRef = useRef<View>(null);
  const missReflectionFooterRef = useRef<View>(null);
  const sprintFeedbackFooterRef = useRef<View>(null);
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
        setProgramComplete(cachedLesson.rawBody?.program_complete === true);
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
    if (!lessonRes.error) setProgramComplete(lessonRes.rawBody?.program_complete === true);
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

  // "More programs you might like" rail — hidden when the API returns nothing
  // (which is always the case for non-dev users today). Cache-then-network so
  // the skeleton only ever shows on the first load of a session.
  useFocusEffect(
    useCallback(() => {
      let active = true;
      const cached = getCached<{ items: RecommendedProgram[] }>('/programs');
      if (cached) setRecPrograms(cached.items ?? []);
      void apiFetch<{ items: RecommendedProgram[] }>('/programs').then((res) => {
        if (!active) return;
        if (res.data) {
          setRecPrograms(res.data.items ?? []);
          setCached('/programs', res.data);
        } else {
          // Error: keep cached items if we had them, otherwise hide the rail.
          setRecPrograms((prev) => prev ?? []);
        }
      });
      return () => {
        active = false;
      };
    }, []),
  );

  useEffect(() => {
    setJournalText('');
    lastSavedJournalRef.current = '';
    setJournalSaveError('');
    setJournalSavedHint(false);
  }, [lesson?.id]);

  // Restore "feedback already sent" state so the completion screen shows the
  // thank-you confirmation instead of the form on subsequent visits.
  useEffect(() => {
    if (!currentUserId) return;
    let active = true;
    void AsyncStorage.getItem(programFeedbackSentKey(currentUserId)).then((v) => {
      if (active && v === 'true') setFeedbackSaved(true);
    });
    return () => {
      active = false;
    };
  }, [currentUserId]);

  const handleSubmitFeedback = useCallback(async () => {
    const message = feedbackText.trim();
    if (!message || feedbackSaving) return;
    setFeedbackError('');
    setFeedbackSaving(true);
    const { error: fbErr } = await apiFetch('/program-feedback', {
      method: 'POST',
      body: { message },
    });
    setFeedbackSaving(false);
    if (fbErr) {
      setFeedbackError(fbErr);
      return;
    }
    setFeedbackText('');
    setFeedbackSaved(true);
    if (currentUserId) {
      void AsyncStorage.setItem(programFeedbackSentKey(currentUserId), 'true');
    }
  }, [feedbackText, feedbackSaving, currentUserId]);

  // Show the push notification pre-permission prompt once, after the first
  // successful home load. Uses `loading` (state) not `initialLoadDone` (ref)
  // so the effect reliably re-runs when data is ready. Delayed 1.5s so the
  // WOD card has rendered before the modal appears.
  useEffect(() => {
    if (!currentUserId || loading) return;
    let cancelled = false;
    void (async () => {
      const key = pushPromptShownKey(currentUserId);
      const shown = await AsyncStorage.getItem(key);
      if (shown || cancelled) return;
      const { data: profile } = await supabase
        .from('profiles')
        .select('push_reminders_enabled')
        .eq('id', currentUserId)
        .maybeSingle();
      if (cancelled) return;
      if (profile?.push_reminders_enabled) {
        await AsyncStorage.setItem(key, 'true');
        return;
      }
      setTimeout(() => {
        if (!cancelled) setShowPushPrompt(true);
      }, 1500);
    })();
    return () => { cancelled = true; };
  }, [currentUserId, loading]);

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

  const dismissPushPrompt = useCallback(async () => {
    if (!currentUserId) return;
    await AsyncStorage.setItem(pushPromptShownKey(currentUserId), 'true');
    setShowPushPrompt(false);
  }, [currentUserId]);

  const acceptPushPrompt = useCallback(async () => {
    if (!currentUserId || pushPromptBusy) return;
    setPushPromptBusy(true);
    await AsyncStorage.setItem(pushPromptShownKey(currentUserId), 'true');
    const result = await registerForPushNotifications();
    setPushPromptBusy(false);
    setShowPushPrompt(false);
    if (result.ok) {
      trackPushRemindersEnabled({ source: 'home_prompt' });
    } else if (result.reason === 'permission_denied') {
      trackPushPermissionDenied({ source: 'home_prompt' });
      // System prompt was denied — silently respect; user can enable in Profile > Settings.
    }
  }, [currentUserId, pushPromptBusy]);

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
      ) : programComplete ? (
        <View style={styles.sprintCard}>
          <View style={styles.sprintIconWrap}>
            <Ionicons name="trophy" size={32} color={colors.accentLight} />
          </View>
          <Text style={styles.sprintTitle}>You finished the{'\n'}Relentless 30-Day Sprint</Text>
          <Text style={styles.sprintBody}>
            Thirty days of showing up — that consistency is exactly what builds mental
            toughness. Be proud of it.{'\n\n'}New programs are coming very soon. In the
            meantime, keep training with the lessons in the Relentless Library.
          </Text>
          <TouchableOpacity
            style={styles.sprintLibraryBtn}
            activeOpacity={0.85}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              router.push('/library' as any);
            }}
          >
            <Ionicons name="library-outline" size={17} color={colors.white} />
            <Text style={styles.sprintLibraryBtnText}>Go to the Library</Text>
          </TouchableOpacity>

          <View style={styles.sprintFeedbackBlock}>
            {feedbackSaved ? (
              <View style={styles.sprintThanksRow}>
                <Ionicons name="checkmark-circle" size={18} color={colors.success} />
                <Text style={styles.sprintThanksText}>Thanks — we got your feedback.</Text>
              </View>
            ) : (
              <>
                <Text style={styles.sprintFeedbackLabel}>WE'D LOVE YOUR FEEDBACK</Text>
                <Text style={styles.sprintFeedbackPrompt}>
                  What did you think of the 30-day sprint? Anything we should add or change?
                </Text>
                <TextInput
                  style={styles.sprintFeedbackInput}
                  placeholder="Type your feedback..."
                  placeholderTextColor={colors.textMuted}
                  value={feedbackText}
                  onChangeText={(t) => {
                    setFeedbackText(t);
                    if (feedbackError) setFeedbackError('');
                  }}
                  multiline
                  scrollEnabled={false}
                  editable={!feedbackSaving}
                  maxLength={2000}
                  onFocus={() =>
                    scheduleScrollFooterAboveKeyboard(
                      scrollRef,
                      sprintFeedbackFooterRef,
                      homeScrollYRef,
                    )
                  }
                  onContentSizeChange={() =>
                    scheduleScrollFooterAboveKeyboard(
                      scrollRef,
                      sprintFeedbackFooterRef,
                      homeScrollYRef,
                    )
                  }
                />
                {feedbackError ? (
                  <Text style={styles.missJournalError}>{feedbackError}</Text>
                ) : null}
                <View ref={sprintFeedbackFooterRef} collapsable={false}>
                  <TouchableOpacity
                    style={[
                      styles.sprintSendBtn,
                      (!feedbackText.trim() || feedbackSaving) && { opacity: 0.5 },
                    ]}
                    disabled={!feedbackText.trim() || feedbackSaving}
                    onPress={() => void handleSubmitFeedback()}
                  >
                    <Text style={styles.sprintSendBtnText}>
                      {feedbackSaving ? 'Sending...' : 'Send feedback'}
                    </Text>
                  </TouchableOpacity>
                </View>
              </>
            )}
          </View>
        </View>
      ) : (
        <View style={styles.workoutCardOuter}>
          <View style={styles.workoutCardInner}>
            {loading ? (
              <WorkoutCardSkeleton />
            ) : lesson ? (
              <WodCard
                title={lesson.title}
                programLine={programLineFor(lesson)}
                coachPhoto={coachPhotoSource(lesson.coach)}
                onPress={() => void handleStartWorkout()}
                onSchedule={handleScheduleSession}
              />
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

      {!error && !programComplete && lesson && lastWod && lastWod.id !== lesson.id && (
        <TouchableOpacity
          style={styles.repeatStandalone}
          onPress={() => void handleStartWorkout(lastWod.id)}
        >
          <Ionicons name="refresh" size={14} color={colors.accent} style={{ marginRight: 6 }} />
          <Text style={styles.repeatBtnText}>Repeat Today's Workout</Text>
        </TouchableOpacity>
      )}

      {/* Today's Focus — lightweight pre-session note */}
      {!programComplete && (
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
      )}

      {/* More programs you might like — visual rail, rows are not tappable */}
      {recPrograms === null && <MoreProgramsSkeleton />}
      {recPrograms !== null && recPrograms.length > 0 && (
        <View style={styles.moreProgramsCard}>
          <Text style={styles.moreProgramsHeader}>More programs you might like:</Text>
          {recPrograms.map((p) => (
            <View key={p.id} style={styles.programRow}>
              <View style={styles.programRowAvatar}>
                {p.coach_avatar_url ? (
                  <Image
                    source={{ uri: p.coach_avatar_url }}
                    style={styles.programRowAvatarImg}
                    resizeMode="cover"
                  />
                ) : (
                  <View style={styles.programRowAvatarPlaceholder}>
                    <Ionicons name="person" size={22} color={colors.textSecondary} />
                  </View>
                )}
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.programRowCoach}>
                  {p.coach_name}
                  {p.coach_sport ? ` (${p.coach_sport})` : ''}
                </Text>
                <Text style={styles.programRowTitle}>{p.title}</Text>
              </View>
            </View>
          ))}
          <TouchableOpacity
            style={styles.exploreLibraryBtn}
            activeOpacity={0.85}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              router.push('/programs' as any);
            }}
          >
            <Text style={styles.exploreLibraryBtnText}>Explore the full library</Text>
          </TouchableOpacity>
        </View>
      )}


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

    <Modal visible={showPushPrompt} transparent animationType="fade">
      <View style={styles.pushPromptOverlay}>
        <View style={styles.pushPromptCard}>
          <View style={styles.pushPromptIconWrap}>
            <Ionicons name="notifications-outline" size={36} color={colors.accent} />
          </View>
          <Text style={styles.pushPromptTitle}>Daily workout reminders</Text>
          <Text style={styles.pushPromptBody}>
            Get a reminder each evening so you never miss a day. We only send one per day, only when you haven{"'"}t trained yet.
          </Text>
          <TouchableOpacity
            style={[styles.pushPromptPrimaryBtn, pushPromptBusy && { opacity: 0.6 }]}
            onPress={() => { void acceptPushPrompt(); }}
            disabled={pushPromptBusy}
          >
            <Text style={styles.pushPromptPrimaryText}>
              {pushPromptBusy ? 'Setting up…' : 'Turn on reminders'}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.pushPromptSecondaryBtn}
            onPress={() => { void dismissPushPrompt(); }}
            disabled={pushPromptBusy}
          >
            <Text style={styles.pushPromptSecondaryText}>Not now</Text>
          </TouchableOpacity>
        </View>
      </View>
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
  sprintCard: {
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(167, 139, 250, 0.4)',
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.xl,
    marginBottom: spacing.md,
    alignItems: 'center',
  },
  sprintIconWrap: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: 'rgba(167, 139, 250, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(167, 139, 250, 0.4)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  sprintTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: colors.white,
    textAlign: 'center',
    lineHeight: 28,
    marginBottom: spacing.sm,
  },
  sprintBody: {
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 21,
    marginBottom: spacing.lg,
  },
  sprintLibraryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: colors.accent,
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 24,
    alignSelf: 'stretch',
  },
  sprintLibraryBtnText: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.white,
  },
  sprintFeedbackBlock: {
    alignSelf: 'stretch',
    marginTop: spacing.lg,
    paddingTop: spacing.lg,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  sprintFeedbackLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
    color: colors.accentLight,
    marginBottom: 6,
  },
  sprintFeedbackPrompt: {
    fontSize: 13,
    color: colors.textSecondary,
    lineHeight: 19,
    marginBottom: spacing.sm,
  },
  sprintFeedbackInput: {
    minHeight: 72,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
    padding: 12,
    fontSize: 14,
    color: colors.white,
    textAlignVertical: 'top',
    marginBottom: spacing.sm,
  },
  sprintSendBtn: {
    backgroundColor: colors.accent,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
  },
  sprintSendBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.white,
  },
  sprintThanksRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  sprintThanksText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.success,
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
  },
  // Overlaid on top of the hero photo.
  wodHeader: {
    position: 'absolute',
    top: 18,
    left: 0,
    right: 0,
    fontSize: 17,
    fontWeight: '800',
    color: colors.white,
    textAlign: 'center',
    letterSpacing: 0.3,
    textShadowColor: 'rgba(0, 0, 0, 0.65)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 8,
  },
  // Hero dimensions are set inline in WodCard (explicit pixels from the window
  // width); this style only positions it flush to the card's top + side edges.
  wodHeroWrap: {
    marginLeft: -spacing.xl,
    marginTop: -24,
    overflow: 'hidden',
  },
  wodHeroPlaceholder: {
    width: '100%' as any,
    height: '100%' as any,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
  },
  wodMetaSection: {
    paddingVertical: 14,
  },
  wodLessonTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.textPrimary,
    textAlign: 'center',
    lineHeight: 26,
  },
  wodProgramLine: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: 4,
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
    width: '100%',
    minHeight: 180,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    paddingVertical: spacing.lg,
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
    flex: 1,
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
  moreProgramsCard: {
    backgroundColor: colors.surface,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    marginTop: spacing.md,
    marginBottom: spacing.md,
  },
  moreProgramsHeader: {
    fontSize: 15,
    fontWeight: '800',
    color: colors.textPrimary,
    textAlign: 'center',
    marginBottom: spacing.md,
  },
  programRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: 'rgba(139, 92, 246, 0.14)',
    borderRadius: 16,
    padding: 10,
    marginBottom: 10,
  },
  programRowAvatar: {
    width: 48,
    height: 48,
    borderRadius: 999,
    overflow: 'hidden',
  },
  programRowAvatarImg: {
    width: '100%' as any,
    height: '100%' as any,
  },
  programRowAvatarPlaceholder: {
    flex: 1,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
  },
  programRowCoach: {
    fontSize: 14,
    fontWeight: '800',
    color: colors.textPrimary,
  },
  programRowTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textPrimary,
    opacity: 0.85,
    marginTop: 2,
  },
  exploreLibraryBtn: {
    alignItems: 'center' as const,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.accent,
    backgroundColor: colors.accentSubtle,
    paddingVertical: 13,
    marginTop: 4,
  },
  exploreLibraryBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.accentLight,
    letterSpacing: 0.2,
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

  // Push notification pre-permission prompt
  pushPromptOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.65)',
    justifyContent: 'flex-end',
    paddingHorizontal: 16,
    paddingBottom: 40,
  },
  pushPromptCard: {
    backgroundColor: colors.surface,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 28,
    alignItems: 'center',
  },
  pushPromptIconWrap: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: colors.accentSubtle,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  pushPromptTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: colors.textPrimary,
    textAlign: 'center',
    marginBottom: 10,
    letterSpacing: 0.2,
  },
  pushPromptBody: {
    fontSize: 15,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 28,
  },
  pushPromptPrimaryBtn: {
    backgroundColor: colors.accent,
    borderRadius: 14,
    paddingVertical: 16,
    paddingHorizontal: 32,
    alignItems: 'center',
    width: '100%',
    marginBottom: 12,
  },
  pushPromptPrimaryText: {
    color: colors.white,
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  pushPromptSecondaryBtn: {
    paddingVertical: 12,
    alignItems: 'center',
    width: '100%',
  },
  pushPromptSecondaryText: {
    color: colors.textMuted,
    fontSize: 15,
    fontWeight: '500',
  },
});
