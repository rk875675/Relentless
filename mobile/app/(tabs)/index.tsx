import { useCallback, useRef, useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
  TextInput,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { useRouter } from 'expo-router';
import { useAuth } from '@/lib/auth-context';
import { apiFetch } from '@/lib/api';
import { ProgressRing } from '@/components/ProgressRing';
import { colors, spacing, TAB_BAR_CLEARANCE } from '@/lib/theme';

type Lesson = {
  id: string;
  title: string;
  duration_seconds: number;
  lesson_type: string;
  categories: string[];
};

type Progress = {
  mindfulness_score: number;
  acceptance_score: number;
  commitment_score: number;
};

type Streak = {
  current_streak: number;
  longest_streak: number;
  last_activity_date: string | null;
};

function getDaysUntil(dateStr: string | null): number | null {
  if (!dateStr) return null;
  const target = new Date(dateStr + 'T00:00:00');
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const diff = Math.ceil((target.getTime() - today.getTime()) / 86400000);
  return diff >= 0 ? diff : null;
}

export default function HomeScreen() {
  const { competitionDate } = useAuth();
  const router = useRouter();
  const [lesson, setLesson] = useState<Lesson | null>(null);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [streak, setStreak] = useState<Streak | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [journalText, setJournalText] = useState('');
  const scrollRef = useRef<ScrollView>(null);
  const journalCardY = useRef(0);

  const journalPrompt = "What's one thing you want to focus on during today's workout?";

  const fetchData = async () => {
    setError('');
    const [lessonRes, progressRes, streakRes] = await Promise.all([
      apiFetch<Lesson>('/lessons/next'),
      apiFetch<Progress>('/progress'),
      apiFetch<Streak>('/streak'),
    ]);
    if (lessonRes.error && progressRes.error) {
      setError(lessonRes.error ?? 'Failed to load');
    }
    setLesson(lessonRes.data);
    setProgress(progressRes.data);
    setStreak(streakRes.data);
    setLoading(false);
  };

  useFocusEffect(
    useCallback(() => {
      fetchData();
    }, []),
  );

  const handleStartWorkout = () => {
    if (!lesson) return;
    router.push(`/lesson/${lesson.id}` as any);
  };

  const mins = lesson ? Math.ceil(lesson.duration_seconds / 60) : 0;

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
          <View style={styles.streakPill}>
            <Text style={styles.streakNum}>{streak?.current_streak ?? 0}</Text>
            <Ionicons name="flame" size={16} color="#f59e0b" />
          </View>
        </View>
      </View>

      {/* MAC Progress Rings */}
      <View style={styles.ringsRow}>
        <ProgressRing
          percentage={progress?.mindfulness_score ?? 0}
          label="Mindfulness"
        />
        <ProgressRing
          percentage={progress?.acceptance_score ?? 0}
          label="Acceptance"
        />
        <ProgressRing
          percentage={progress?.commitment_score ?? 0}
          label="Commitment"
        />
      </View>

      {error ? (
        <View style={styles.inlineError}>
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity style={styles.retryBtn} onPress={fetchData}>
            <Text style={styles.retryText}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <TouchableOpacity
          style={styles.workoutCard}
          activeOpacity={0.8}
          onPress={handleStartWorkout}
          disabled={loading || !lesson}
        >
          <Text style={styles.workoutLabel}>WORKOUT OF THE DAY</Text>
          {loading ? (
            <ActivityIndicator color={colors.accent} style={{ marginTop: spacing.lg }} />
          ) : lesson ? (
            <>
              <Text style={styles.workoutTitle}>{lesson.title}</Text>
              <Text style={styles.workoutDesc}>
                focuses on the 'why' and teaching{'\n'}through the 'what'
              </Text>
              <View style={styles.workoutMetaPill}>
                <Text style={styles.workoutMeta}>{mins}-min lesson</Text>
              </View>
            </>
          ) : (
            <>
              <Text style={styles.workoutTitle}>All caught up!</Text>
              <Text style={styles.workoutDesc}>Check back tomorrow</Text>
            </>
          )}
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
          onChangeText={setJournalText}
          multiline
          onFocus={() => {
            scrollRef.current?.scrollTo({
              y: journalCardY.current - 24,
              animated: true,
            });
          }}
        />
      </View>
    </ScrollView>
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
});
