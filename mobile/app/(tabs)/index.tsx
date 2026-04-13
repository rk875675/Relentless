import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Animated,
  Modal,
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  RefreshControl,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useFocusEffect } from '@react-navigation/native';
import { useRouter } from 'expo-router';
import { useAuth } from '@/lib/auth-context';
import { apiFetch } from '@/lib/api';
import { getDeviceLocalCalendarYmd, HOME_PROGRAM_ANCHOR_HEADERS } from '@/lib/device-calendar';
import { ProgressRing, type ScoreDelta } from '@/components/ProgressRing';
import { getPendingGainDeltas, type MacDeltas } from '@/lib/pending-deltas';
import { colors, spacing, TAB_BAR_CLEARANCE } from '@/lib/theme';
import { getCached, setCached, bustCache } from '@/lib/api-cache';

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
};

function safePct(n: number | undefined): number {
  if (n == null || Number.isNaN(n)) return 0;
  return Math.min(100, Math.max(0, n));
}

/** For gains, return the base (pre-gain) so purple stops before the green overlay. */
function ringBasePct(score: number | undefined, delta: ScoreDelta | undefined | null): number {
  const s = score ?? 0;
  if (delta && delta.amount > 0) return safePct(s - delta.amount);
  return safePct(s);
}

export default function HomeScreen() {
  const { competitionDate } = useAuth();
  const router = useRouter();
  const [lesson, setLesson] = useState<Lesson | null>(null);
  const [lastWod, setLastWod] = useState<Lesson | null>(null);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [streak, setStreak] = useState<Streak | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [progressLoadError, setProgressLoadError] = useState(false);
  const [streakLoadError, setStreakLoadError] = useState(false);
  const [journalText, setJournalText] = useState('');
  const [journalSaving, setJournalSaving] = useState(false);
  const [journalSaveError, setJournalSaveError] = useState('');
  const [journalSavedHint, setJournalSavedHint] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [activeDeltas, setActiveDeltas] = useState<MacDeltas | null>(null);
  const [showMissReflection, setShowMissReflection] = useState(false);
  const [missJournalText, setMissJournalText] = useState('');
  const [missJournalSaving, setMissJournalSaving] = useState(false);
  const [missJournalDismissed, setMissJournalDismissed] = useState(false);
  const [showFreebieModal, setShowFreebieModal] = useState(false);
  const freebieDismissedRef = useRef(false);
  const freebieScale = useRef(new Animated.Value(0)).current;
  const freebieOpacity = useRef(new Animated.Value(0)).current;
  const deltaDateRef = useRef<string | null>(null);
  const scrollRef = useRef<ScrollView>(null);
  const journalCardY = useRef(0);
  const lastSavedJournalRef = useRef('');
  const initialLoadDone = useRef(false);

  const journalPrompt = "What's one thing you want to focus on during today's workout?";

  const fetchData = useCallback(async (isPullRefresh = false) => {
    setError('');
    setProgressLoadError(false);
    setStreakLoadError(false);
    if (isPullRefresh) {
      setRefreshing(true);
      bustCache('/lessons/next', '/progress', '/streak');
    } else {
      // Serve from cache when available — skip loading state so tab switches feel instant
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
        return;
      }
      if (!initialLoadDone.current) setLoading(true);
    }
    const homeHeaders = { ...HOME_PROGRAM_ANCHOR_HEADERS };
    const [lessonRes, progressRes, streakRes] = await Promise.all([
      apiFetch<Lesson>('/lessons/next', { headers: homeHeaders }),
      apiFetch<Progress>('/progress', { headers: homeHeaders }),
      apiFetch<Streak>('/streak', { headers: homeHeaders }),
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

    if (streakData.last_activity_date) {
      const lastDate = new Date(streakData.last_activity_date + 'T00:00:00');
      const now = new Date();
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const daysSince = Math.floor((today.getTime() - lastDate.getTime()) / 86400000);

      if (daysSince === 2 && !streakData.freebie_used && !freebieDismissedRef.current) {
        setShowFreebieModal(true);
      } else if (!missJournalDismissed && (daysSince >= 3 || (daysSince === 2 && streakData.freebie_used))) {
        setShowMissReflection(true);
      }
    }

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
  }, []);

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
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    Animated.sequence([
      Animated.timing(freebieOpacity, { toValue: 1, duration: 200, useNativeDriver: true }),
      Animated.spring(freebieScale, { toValue: 1, friction: 5, tension: 100, useNativeDriver: true }),
    ]).start();
  }, [showFreebieModal]);

  const dismissFreebie = () => {
    freebieDismissedRef.current = true;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
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
        body: trimmed,
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
  }, [journalText, lesson?.id]);

  const handleStartWorkout = async (overrideId?: string) => {
    const targetId = overrideId ?? lesson?.id;
    if (!targetId) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    await flushPreWorkoutJournal();
    bustCache('/lessons/next', '/progress', '/streak');
    router.push(`/lesson/${targetId}` as any);
  };

  const mins = lesson ? Math.round(lesson.duration_seconds / 60) : 0;
  const streakIsReset = showMissReflection && !missJournalDismissed && streak?.current_streak === 0;

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={90}
    >
    <ScrollView
      ref={scrollRef}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="interactive"
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
                <Ionicons name="flag-outline" size={13} color={days != null ? colors.accentLight : colors.textMuted} />
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
              onChangeText={setMissJournalText}
              multiline
              editable={!missJournalSaving}
            />
            <View style={styles.missBtnRow}>
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
                  setMissJournalSaving(true);
                  await apiFetch('/journal', {
                    method: 'POST',
                    headers: { ...HOME_PROGRAM_ANCHOR_HEADERS },
                    body: {
                      body: missJournalText.trim(),
                      entry_type: 'miss_reflection',
                    },
                  });
                  setMissJournalSaving(false);
                  setShowMissReflection(false);
                  setMissJournalDismissed(true);
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
        <TouchableOpacity
          style={styles.workoutCard}
          activeOpacity={0.8}
          onPress={lesson ? () => void handleStartWorkout() : lastWod ? () => void handleStartWorkout(lastWod.id) : undefined}
          disabled={loading || (!lesson && !lastWod)}
        >
          <Text style={styles.workoutLabel}>WORKOUT OF THE DAY</Text>
          {loading ? (
            <ActivityIndicator color={colors.accent} style={{ marginTop: spacing.lg }} />
          ) : lesson ? (
            <>
              {typeof lesson.program_day === 'number' && (
                <Text style={styles.workoutDayBadge}>
                  Day {lesson.program_day} of 30
                </Text>
              )}
              <Text style={styles.workoutTitle}>{lesson.title}</Text>
              <Text style={styles.workoutDesc}>
                focuses on the 'why' and teaching{'\n'}through the 'what'
              </Text>
              <View style={styles.workoutMetaPill}>
                <Text style={styles.workoutMeta}>~{mins} min</Text>
              </View>
            </>
          ) : (
            <>
              <Ionicons name="checkmark-circle" size={36} color={colors.success} style={{ marginBottom: 12 }} />
              <Text style={styles.workoutTitle}>All caught up!</Text>
              <Text style={styles.workoutDesc}>Come back tomorrow for the next workout</Text>
              {lastWod && (
                <View style={styles.repeatBtn}>
                  <Ionicons name="refresh" size={14} color={colors.accent} style={{ marginRight: 6 }} />
                  <Text style={styles.repeatBtnText}>Repeat Today's Workout</Text>
                </View>
              )}
            </>
          )}
        </TouchableOpacity>
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

      {/* Journal Prompt */}
      <View
        style={styles.journalCard}
        onLayout={(e) => { journalCardY.current = e.nativeEvent.layout.y; }}
      >
        <Text style={styles.journalLabel}>PRE-WORKOUT CHECK-IN</Text>
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
          autoCorrect
          spellCheck
          editable={!journalSaving}
          onFocus={() => {
            setTimeout(() => {
              scrollRef.current?.scrollToEnd({ animated: true });
            }, 300);
          }}
        />
        <View style={styles.journalFooter}>
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

    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    flexGrow: 1,
    paddingHorizontal: 20,
    paddingTop: 64,
    paddingBottom: TAB_BAR_CLEARANCE,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 28,
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
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: colors.border,
  },
  countdownText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textMuted,
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
    marginBottom: 28,
  },
  workoutCard: {
    backgroundColor: colors.surface,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: 44,
    paddingHorizontal: spacing.lg,
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  workoutLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.textMuted,
    letterSpacing: 2,
    marginBottom: 14,
  },
  workoutDayBadge: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.accentLight,
    marginBottom: 8,
  },
  workoutTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: colors.textPrimary,
    textAlign: 'center',
    lineHeight: 24,
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
    paddingHorizontal: 14,
    paddingVertical: 6,
    marginTop: 16,
  },
  workoutMeta: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.accent,
    letterSpacing: 0.3,
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
    paddingVertical: 12,
    marginBottom: spacing.md,
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
    marginBottom: 12,
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
    borderColor: colors.border,
    padding: spacing.lg,
  },
  journalLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.textMuted,
    letterSpacing: 2,
    marginBottom: 12,
  },
  journalInput: {
    backgroundColor: colors.surfaceLight,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
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
