import { useCallback, useEffect, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  Alert,
  Animated,
  Image,
  Keyboard,
  Modal,
  Platform,
  Pressable,
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
import { getPendingGainDeltas, clearPendingGainDeltas, type MacDeltas } from '@/lib/pending-deltas';
import { markDeltaSeen, isDeltaSeen } from '@/lib/seen-deltas';
import { colors, spacing, TAB_BAR_CLEARANCE } from '@/lib/theme';
import { getCached, setCached, bustCache } from '@/lib/api-cache';
import { coachAvatarSource } from '@/lib/coach-photo';
import { scheduleScrollFooterAboveKeyboard } from '@/lib/schedule-scroll-for-keyboard';
import { maybeRequestAppStoreReview, reviewPromptMayBeOnScreen } from '@/lib/app-store-review-prompt';
import ReferralPopup from '@/components/ReferralPopup';
import { isReferralEnabled, fetchReferralState, type ReferralCadence } from '@/lib/referral';
import {
  canShowReferralPopup,
  recordReferralPopupShown,
  takeLessonCompletedForReferral,
} from '@/lib/referral-popup-state';
import {
  trackWodViewed,
  trackWodStarted,
  trackStreakViewed,
  trackProgressRingViewed,
  trackReflectionSaved,
  trackPushRemindersEnabled,
  trackPushRemindersDisabled,
  trackPushPermissionDenied,
  trackStreakBroken,
  trackJournalPromptCompleted,
  getTimeOfDayHour,
} from '@/lib/core-analytics';
import {
  disablePushReminders,
  registerForPushNotifications,
  requestNotificationPermission,
} from '@/lib/push-notifications';
import DateTimePicker from '@react-native-community/datetimepicker';
import { DEMO_ALL_BLOCKS_LESSON_ID, SHOW_DEMO_ALL_BLOCKS_LESSON } from '@/lib/dev-vault';
import {
  loadWorkoutSchedule,
  setWorkoutSchedule,
  clearWorkoutSchedule,
  type WorkoutSchedule,
} from '@/lib/workout-schedule';

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
  program_id?: string | null;
  program_title?: string | null;
  program_key?: string | null;
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
  /** Whether the user has previously started this pack (offer Continue vs Start). */
  started?: boolean;
  /** Stored day to resume from on Continue. */
  current_day?: number | null;
};

type Progress = {
  mindfulness_score: number;
  acceptance_score: number;
  commitment_score: number;
  updated_at?: string | null;
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

function lastKnownStreakKey(userId: string): string {
  return `relentless:last_known_streak:${userId}`;
}

function pushPromptShownKey(userId: string): string {
  return `relentless:push_prompt_shown:${userId}`;
}

const MISS_REFLECTION_JOURNAL_PATH = '/journal?entry_type=miss_reflection&limit=1';

// Let the return to Home settle before the referral popup evaluates: the MAC
// ring delta animation plays on arrival, and the push prompt has its own 1.5s
// timer that must be allowed to claim priority first.
const REFERRAL_POPUP_DELAY_MS = 2500;
// How recently a review request counts as "the dialog may be on screen".
const REFERRAL_POPUP_REVIEW_WINDOW_MS = 60_000;

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

/**
 * The server's push-reminders Edge Function only ever sends its evening_nudge
 * reminder during this local hour (see `resolveReminderType` in
 * supabase/functions/push-reminders/index.ts). Kept in sync manually since the
 * two systems live in different deploy targets.
 */
const SERVER_EVENING_NUDGE_HOUR = 19;

/** Formats a 24h local time as e.g. "7:05 AM" for confirmation copy. */
function formatScheduleTime(hour: number, minute: number): string {
  const h12 = hour % 12 === 0 ? 12 : hour % 12;
  const ampm = hour < 12 ? 'AM' : 'PM';
  return `${h12}:${minute.toString().padStart(2, '0')} ${ampm}`;
}

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
    isDevAccount,
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
  const activeDeltasRef = useRef<MacDeltas | null>(null);
  activeDeltasRef.current = activeDeltas;

  const handleDeltaConsumed = useCallback(() => {
    const snap = activeDeltasRef.current;
    setActiveDeltas(null);
    clearPendingGainDeltas();
    if (currentUserId && snap) {
      void markDeltaSeen(currentUserId, snap as Record<string, { amount: number }>);
    }
  }, [currentUserId]);

  const [showMissReflection, setShowMissReflection] = useState(false);
  const [missJournalText, setMissJournalText] = useState('');
  const [missJournalSaving, setMissJournalSaving] = useState(false);
  const [missJournalSaveError, setMissJournalSaveError] = useState('');
  const [missJournalDismissed, setMissJournalDismissed] = useState(false);
  const [showFreebieModal, setShowFreebieModal] = useState(false);
  const [keyboardBottomPad, setKeyboardBottomPad] = useState(0);
  const [showPushPrompt, setShowPushPrompt] = useState(false);
  const [pushPromptBusy, setPushPromptBusy] = useState(false);
  // In-app workout scheduling (Schedule button -> local reminder time wheel).
  // Independent of the server push reminders above.
  const [schedulePickerVisible, setSchedulePickerVisible] = useState(false);
  const [workoutSchedule, setWorkoutScheduleState] = useState<WorkoutSchedule | null>(null);
  const [pendingScheduleTime, setPendingScheduleTime] = useState<Date>(() => {
    const d = new Date();
    d.setHours(7, 0, 0, 0);
    return d;
  });
  /** null = not yet loaded this session (skeleton); [] = loaded, nothing to show. */
  const [recPrograms, setRecPrograms] = useState<RecommendedProgram[] | null>(null);
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
  /** In-session mirror of the persisted streak, so a warm check skips storage. */
  const prevStreakCountRef = useRef<number | null>(null);
  const streakTransitionBusyRef = useRef(false);
  /** Quiet retries for the post-purchase entitlement race (see fetchData). */
  const entitlementRetryRef = useRef(0);

  const journalPrompt = "What's on your mind going into today's session?";

  /**
   * Fire `streak_broken` on the 0-transition. The comparison value has to
   * outlive the process: a break only becomes visible on the first load after
   * the user misses a day, which is almost always the first fetch of a cold
   * launch, so an in-memory value alone is still empty at that moment and the
   * transition is never seen.
   */
  const checkStreakTransition = useCallback(
    async (currentStreak: number) => {
      if (currentUserId == null || streakTransitionBusyRef.current) return;
      streakTransitionBusyRef.current = true;
      try {
        const key = lastKnownStreakKey(currentUserId);
        let previous = prevStreakCountRef.current;
        if (previous === null) {
          const stored = await AsyncStorage.getItem(key);
          const parsed = stored === null ? Number.NaN : Number.parseInt(stored, 10);
          previous = Number.isFinite(parsed) ? parsed : null;
        }
        // A missing value means we have nothing to compare against yet (fresh
        // install, or first run after this check shipped) — record, don't report.
        if (previous !== null && previous > 0 && currentStreak === 0) {
          trackStreakBroken({ previous_streak_count: previous });
        }
        prevStreakCountRef.current = currentStreak;
        if (previous !== currentStreak) {
          await AsyncStorage.setItem(key, String(currentStreak));
        }
      } catch {
        // Storage failure must never surface on Home; the next focus retries.
      } finally {
        streakTransitionBusyRef.current = false;
      }
    },
    [currentUserId],
  );

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
        // prefetchHomeData warms this cache before Home mounts, so on a cold
        // launch this branch — not the fetch below — is where a break first shows.
        void checkStreakTransition(cachedStreak.current_streak);
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

    // Transient ENTITLEMENT_REQUIRED must never flash the red "Active
    // subscription required" banner. Two known races produce it:
    // 1. Post-purchase: a brand-new account lands on Home before the purchase
    //    sync has written its entitlement row (Apple sandbox is slow).
    // 2. Renewal sync: a paying user's renewal hasn't reached the DB yet; the
    //    stale-grace hold in auth-context keeps them here while a silent Apple
    //    re-verification runs (up to ~20s including the restore round-trip).
    // Retry quietly behind the skeleton/stale content long enough to outlast
    // both. If access is genuinely gone, RouteGuard replaces this screen with
    // the paywall before the retries exhaust — the banner is a last resort for
    // pathological states only.
    const entitlementBlocked =
      lessonRes.errorCode === 'ENTITLEMENT_REQUIRED' ||
      progressRes.errorCode === 'ENTITLEMENT_REQUIRED' ||
      streakRes.errorCode === 'ENTITLEMENT_REQUIRED';
    if (entitlementBlocked && entitlementRetryRef.current < 8) {
      entitlementRetryRef.current += 1;
      setRefreshing(false);
      setTimeout(() => {
        void fetchData(false);
      }, Math.min(1500 * entitlementRetryRef.current, 4000));
      return;
    }
    if (!entitlementBlocked) entitlementRetryRef.current = 0;

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

    if (nextLesson) {
      trackWodViewed({
        lesson_id: nextLesson.id,
        program_id: nextLesson.program_id ?? null,
        program_key: nextLesson.program_key ?? null,
        coach_key: nextLesson.coach?.coach_key ?? null,
      });
    }
    if (!streakRes.error) trackStreakViewed({ current_streak: streakData.current_streak });
    if (!progressRes.error) trackProgressRingViewed();

    if (!streakRes.error) void checkStreakTransition(streakData.current_streak);

    applyMissReflectionFromStreakAndJournal(streakData, missJournalRes, freebieAckYmd);

    const today = getDeviceLocalCalendarYmd();
    const gainDeltas = getPendingGainDeltas();
    if (gainDeltas) {
      setActiveDeltas(gainDeltas);
      deltaDateRef.current = today;
    } else if (prog.deltas && Object.keys(prog.deltas).length > 0) {
      const alreadySeen = currentUserId
        ? await isDeltaSeen(currentUserId, prog.deltas as Record<string, { amount: number }>)
        : false;
      if (!alreadySeen) {
        setActiveDeltas(prog.deltas);
        deltaDateRef.current = today;
      }
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
  }, [currentUserId, missJournalDismissed, checkStreakTransition]);

  useFocusEffect(
    useCallback(() => {
      void fetchData(false);
    }, [fetchData]),
  );

  // App Store review prompt: check eligibility on every return to Home, but
  // never on the very first focus (Apple's guidelines say not to prompt at
  // app launch). All real gating (min lessons, 90-day cooldown, flags) lives
  // in maybeRequestAppStoreReview.
  const skipFirstReviewCheckRef = useRef(true);
  useFocusEffect(
    useCallback(() => {
      if (skipFirstReviewCheckRef.current) {
        skipFirstReviewCheckRef.current = false;
        return;
      }
      void maybeRequestAppStoreReview();
    }, []),
  );

  // Post-lesson referral popup (PRD 10.5.8). Deliberately the LOWEST-priority
  // prompt on this screen: it yields to the streak freebie, the push prompt,
  // the miss-reflection cards, the schedule sheet, and the native review
  // dialog. Yielding costs nothing — the monthly allowance is only spent when
  // the popup actually appears, so it simply retries after a later lesson.
  //
  // The review dialog is the one that genuinely competes: the lesson screen
  // requests it immediately before router.back(), so it can be on screen as
  // Home mounts. A review attempt is unrecoverable for 90 days, while this
  // popup gets another chance next lesson, so it always loses that contest.
  const referralPopupShownRef = useRef(false);
  const [showReferralPopup, setShowReferralPopup] = useState(false);
  const [referralCadence, setReferralCadence] = useState<ReferralCadence | null>(null);

  // Read through a ref, not the closure: the checks below run after a delay,
  // and any of these can flip in the meantime (the freebie is set during
  // fetchData, the push prompt on its own 1.5s timer).
  const otherPromptVisibleRef = useRef(false);
  useEffect(() => {
    otherPromptVisibleRef.current =
      showFreebieModal || showPushPrompt || showMissReflection || schedulePickerVisible;
  }, [showFreebieModal, showPushPrompt, showMissReflection, schedulePickerVisible]);

  useFocusEffect(
    useCallback(() => {
      // Guards before the read: this effect re-runs when currentUserId
      // arrives, and consuming the signal while it is still null would spend
      // it on a pass that can never show the popup.
      if (referralPopupShownRef.current || !currentUserId) return;
      // Spends the signal for this return whether or not we end up showing.
      if (!takeLessonCompletedForReferral()) return;

      let cancelled = false;
      const timer = setTimeout(() => {
        void (async () => {
          // Cheap local gates first, so the eligibility request only happens
          // when the popup could actually be shown.
          if (cancelled) return;
          if (!(await isReferralEnabled())) return;
          if (cancelled) return;
          if (!(await canShowReferralPopup(currentUserId))) return;
          if (cancelled) return;
          if (await reviewPromptMayBeOnScreen(REFERRAL_POPUP_REVIEW_WINDOW_MS)) return;
          if (cancelled) return;

          const state = await fetchReferralState();
          if (cancelled || !state?.enabled || !state.eligible) return;

          // Final gate, re-checked because the eligibility request above takes
          // time: the popup must never present alongside another prompt, and
          // both of these can change while it is in flight.
          if (otherPromptVisibleRef.current) return;
          if (await reviewPromptMayBeOnScreen(REFERRAL_POPUP_REVIEW_WINDOW_MS)) return;
          if (cancelled || otherPromptVisibleRef.current) return;

          // Shown first, then recorded: a slot must never be spent on a popup
          // the user did not actually see.
          referralPopupShownRef.current = true;
          setReferralCadence(state.cadence);
          setShowReferralPopup(true);
          void recordReferralPopupShown(currentUserId);
        })();
      }, REFERRAL_POPUP_DELAY_MS);

      return () => {
        cancelled = true;
        clearTimeout(timer);
      };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [currentUserId]),
  );

  const refreshPrograms = useCallback(async () => {
    const res = await apiFetch<{ items: RecommendedProgram[] }>('/programs');
    if (res.data) {
      setRecPrograms(res.data.items ?? []);
      setCached('/programs', res.data);
    } else {
      // Error: keep cached items if we had them, otherwise hide the rail.
      setRecPrograms((prev) => prev ?? []);
    }
  }, []);

  // "More programs you might like" rail — hidden when the API returns nothing
  // (which is always the case for non-dev users today). Cache-then-network so
  // the skeleton only ever shows on the first load of a session.
  useFocusEffect(
    useCallback(() => {
      const cached = getCached<{ items: RecommendedProgram[] }>('/programs');
      if (cached) setRecPrograms(cached.items ?? []);
      void refreshPrograms();
    }, [refreshPrograms]),
  );

  // Tapping a featured program row goes straight to the full library (same
  // destination as the "Explore the full library" button below) instead of
  // popping a restart/continue/cancel prompt right on Home.
  const goToLibrary = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push('/programs' as any);
  }, [router]);

  useEffect(() => {
    setJournalText('');
    lastSavedJournalRef.current = '';
    setJournalSaveError('');
    setJournalSavedHint(false);
  }, [lesson?.id]);

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
    const attributionLesson = overrideId ? lastWod : lesson;
    trackWodStarted({
      lesson_id: targetId,
      is_repeat: Boolean(overrideId),
      program_id: attributionLesson?.program_id ?? null,
      program_key: attributionLesson?.program_key ?? null,
      coach_key: attributionLesson?.coach?.coach_key ?? null,
      program_day: (attributionLesson as any)?.program_day ?? null,
      time_of_day_hour: getTimeOfDayHour(),
    });
    await flushPreWorkoutJournal();
    bustCache('/lessons/next', '/progress', '/streak');
    router.push(`/lesson/${targetId}` as any);
  };

  useEffect(() => {
    void loadWorkoutSchedule().then((s) => {
      if (!s) return;
      setWorkoutScheduleState(s);
      const d = new Date();
      d.setHours(s.hour, s.minute, 0, 0);
      setPendingScheduleTime(d);
    });
  }, []);

  const handleScheduleSession = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    // Ask for notification permission in direct response to this tap, before
    // opening the picker — Apple-compliant (user-initiated) and the feature
    // degrades gracefully (picker never opens) if denied.
    const granted = await requestNotificationPermission();
    if (!granted) {
      Alert.alert(
        'Notifications are off',
        'Workout reminders need notifications turned on. Enable them in Settings to schedule a reminder.',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Open Settings', onPress: () => void Linking.openSettings() },
        ],
      );
      return;
    }
    if (workoutSchedule) {
      const d = new Date();
      d.setHours(workoutSchedule.hour, workoutSchedule.minute, 0, 0);
      setPendingScheduleTime(d);
    }
    setSchedulePickerVisible(true);
  };

  const handleSaveSchedule = async () => {
    const hour = pendingScheduleTime.getHours();
    const minute = pendingScheduleTime.getMinutes();
    setSchedulePickerVisible(false);
    const res = await setWorkoutSchedule(hour, minute);
    if (res.ok) {
      setWorkoutScheduleState(res.schedule);
      // Notification permission was already granted (gated before the picker
      // opened) — also register the push token so the account's server-side
      // reminder setup (push_reminders_enabled) stays consistent with this
      // local schedule, EXCEPT when the chosen time falls inside the server's
      // fixed evening-nudge hour (19:00–19:59, see push-reminders Edge
      // Function) — registering there would guarantee a same-hour duplicate
      // (the local reminder + the server's evening_nudge push). Skipping the
      // registration in that case leaves any existing server reminder state
      // untouched (multi_day_miss reminders keep working) while avoiding the
      // new duplicate. Fire-and-forget: local reminder is already saved above.
      if (hour !== SERVER_EVENING_NUDGE_HOUR) {
        void registerForPushNotifications();
      }
      Alert.alert(
        'Reminder set',
        `We'll remind you to do your workout at ${formatScheduleTime(hour, minute)} every day.`,
      );
    } else if (res.reason === 'permission_denied') {
      Alert.alert(
        'Notifications are off',
        'Turn on notifications for Relentless in Settings to get workout reminders.',
      );
    } else {
      Alert.alert('Could not set reminder', res.message ?? 'Please try again.');
    }
  };

  const handleClearSchedule = async () => {
    setSchedulePickerVisible(false);
    await clearWorkoutSchedule();
    setWorkoutScheduleState(null);
    // Turning the daily reminder off opts the user out of notifications
    // entirely, including the server's evening nudge — so this also clears
    // push_reminders_enabled. Keeps the Profile toggle cache in sync so it
    // doesn't render stale "on" before its next DB read.
    if (!currentUserId) return;
    const err = await disablePushReminders(currentUserId);
    if (!err) {
      await AsyncStorage.setItem(`relentless:push_reminders_enabled:${currentUserId}`, 'false');
      trackPushRemindersDisabled({ source: 'home_schedule_cleared' });
    }
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
          onDeltaConsumed={handleDeltaConsumed}
        />
        <ProgressRing
          percentage={ringBasePct(progress?.acceptance_score, activeDeltas?.acceptance)}
          label="Acceptance"
          delta={activeDeltas?.acceptance}
          ringColor={colors.ringAcceptance}
          onDeltaConsumed={handleDeltaConsumed}
        />
        <ProgressRing
          percentage={ringBasePct(progress?.commitment_score, activeDeltas?.commitment)}
          label="Commitment"
          delta={activeDeltas?.commitment}
          ringColor={colors.ringCommitment}
          onDeltaConsumed={handleDeltaConsumed}
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
                  trackJournalPromptCompleted({
                    lesson_id: undefined,
                    prompt_type: 'miss_reflection',
                    answered: true,
                    entry_length: missJournalText.trim().length,
                  });
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

      {/* Featured programs — tap a row (or "Explore the full library") to browse programs */}
      {recPrograms === null && <MoreProgramsSkeleton />}
      {recPrograms !== null && recPrograms.length > 0 && (
        <View style={styles.moreProgramsCard}>
          <Text style={styles.moreProgramsHeader}>Featured programs:</Text>
          {recPrograms.map((p) => (
            <TouchableOpacity
              key={p.id}
              style={styles.programRow}
              activeOpacity={0.85}
              onPress={goToLibrary}
            >
              <View style={styles.programRowAvatar}>
                {coachAvatarSource(p.coach_avatar_url, p.coach_name) ? (
                  <Image
                    source={coachAvatarSource(p.coach_avatar_url, p.coach_name)!}
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
              <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
            </TouchableOpacity>
          ))}
          <TouchableOpacity
            style={styles.exploreLibraryBtn}
            activeOpacity={0.85}
            onPress={goToLibrary}
          >
            <Text style={styles.exploreLibraryBtnText}>Explore the full library</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Vaulted dev demo — set SHOW_DEMO_ALL_BLOCKS_LESSON in dev-vault.ts to re-enable. */}
      {SHOW_DEMO_ALL_BLOCKS_LESSON && (isDevAccount || __DEV__) && (
        <TouchableOpacity
          style={styles.demoAllBlocksBtn}
          activeOpacity={0.85}
          onPress={() => router.push(`/lesson/${DEMO_ALL_BLOCKS_LESSON_ID}` as any)}
        >
          <Text style={styles.demoAllBlocksBtnText}>Demo: All Block Types</Text>
        </TouchableOpacity>
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

    <ReferralPopup
      visible={showReferralPopup}
      cadence={referralCadence}
      onInvite={() => {
        setShowReferralPopup(false);
        router.push('/referral' as any);
      }}
      onDismiss={() => setShowReferralPopup(false)}
    />

    {schedulePickerVisible && (
      <Modal visible transparent animationType="fade" onRequestClose={() => setSchedulePickerVisible(false)}>
        <View style={styles.scheduleOverlay} pointerEvents="box-none">
          <Pressable
            style={styles.scheduleBackdrop}
            accessibilityRole="button"
            accessibilityLabel="Close schedule picker"
            onPress={() => setSchedulePickerVisible(false)}
          />
          <View style={styles.scheduleSheet}>
            <Text style={styles.scheduleTitle}>Schedule your workout</Text>
            <Text style={styles.scheduleBody}>
              Pick a time and we{"'"}ll remind you each day if you haven{"'"}t opened the app.
            </Text>
            <View style={styles.schedulePickerWrap}>
              <DateTimePicker
                value={pendingScheduleTime}
                mode="time"
                display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                textColor={colors.textPrimary}
                onChange={(_event: any, selected?: Date) => {
                  if (selected) setPendingScheduleTime(selected);
                }}
              />
            </View>
            <TouchableOpacity
              style={styles.pushPromptPrimaryBtn}
              onPress={() => { void handleSaveSchedule(); }}
            >
              <Text style={styles.pushPromptPrimaryText}>Set reminder</Text>
            </TouchableOpacity>
            {workoutSchedule ? (
              <TouchableOpacity style={styles.pushPromptSecondaryBtn} onPress={() => { void handleClearSchedule(); }}>
                <Text style={styles.pushPromptSecondaryText}>Remove reminder</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity style={styles.pushPromptSecondaryBtn} onPress={() => setSchedulePickerVisible(false)}>
                <Text style={styles.pushPromptSecondaryText}>Cancel</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </Modal>
    )}

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
  demoAllBlocksBtn: {
    marginTop: 32,
    marginHorizontal: 20,
    marginBottom: 16,
    paddingVertical: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.textMuted,
    alignItems: 'center' as const,
  },
  demoAllBlocksBtnText: {
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
  scheduleOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.65)',
    justifyContent: 'flex-end',
  },
  scheduleBackdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  scheduleSheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 24,
    paddingTop: 24,
    paddingBottom: 36,
  },
  scheduleTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: colors.textPrimary,
    textAlign: 'center',
    marginBottom: 8,
    letterSpacing: 0.2,
  },
  scheduleBody: {
    fontSize: 15,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 8,
  },
  schedulePickerWrap: {
    alignItems: 'center',
    marginBottom: 12,
  },
});
