import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
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
import { apiFetch } from '@/lib/api';
import { colors, spacing } from '@/lib/theme';

type LessonDetail = {
  id: string;
  title: string;
  duration_seconds: number;
  lesson_type: string;
  voiceover_url: string | null;
  on_screen_text: string | null;
  reflection_prompt: string | null;
  categories: string[];
};

type Phase = 'loading' | 'ready' | 'playing' | 'reflection' | 'completing' | 'done' | 'error' | 'terminated';

const MAC_COLORS: Record<string, string> = {
  mindfulness: '#60a5fa',
  acceptance: '#34d399',
  commitment: '#f59e0b',
};

export default function LessonPlayerScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();

  const [lesson, setLesson] = useState<LessonDetail | null>(null);
  const [phase, setPhase] = useState<Phase>('loading');
  const [errorMsg, setErrorMsg] = useState('');
  const [elapsed, setElapsed] = useState(0);
  const [journalText, setJournalText] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const sessionActive = useRef(false);

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

  // Lock-in mode (PRD 8.5): background kills session
  useEffect(() => {
    const handleAppState = (next: AppStateStatus) => {
      if (next !== 'active' && sessionActive.current) {
        sessionActive.current = false;
        stopTimer();
        setPhase('terminated');
      }
    };
    const sub = AppState.addEventListener('change', handleAppState);
    return () => sub.remove();
  }, []);

  useEffect(() => {
    return () => stopTimer();
  }, []);

  const stopTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const finishPlayback = useCallback(() => {
    sessionActive.current = false;
    stopTimer();
    if (lesson?.reflection_prompt) {
      setPhase('reflection');
    } else {
      completeLesson();
    }
  }, [lesson, stopTimer]);

  const startLesson = () => {
    if (!lesson) return;
    sessionActive.current = true;
    setElapsed(0);
    setPhase('playing');

    // TODO: when voiceover_url content exists, integrate expo-audio useAudioPlayer here.
    // For now all seed content is timer-based (voiceover_url is null).
    const start = Date.now();
    timerRef.current = setInterval(() => {
      const secs = Math.floor((Date.now() - start) / 1000);
      setElapsed(secs);
      if (secs >= lesson.duration_seconds) {
        finishPlayback();
      }
    }, 250);
  };

  const completeLesson = async () => {
    if (!lesson) return;
    setPhase('completing');

    if (journalText.trim().length > 0) {
      await apiFetch('/journal', {
        method: 'POST',
        body: { body: journalText.trim(), lesson_id: lesson.id },
      });
    }

    const { error } = await apiFetch(`/lessons/${lesson.id}/complete`, {
      method: 'POST',
      headers: { 'Idempotency-Key': `${lesson.id}-${Date.now()}` },
    });

    if (error) {
      setErrorMsg(error);
      setPhase('error');
    } else {
      setPhase('done');
    }
  };

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const total = lesson?.duration_seconds ?? 0;
  const progress = total > 0 ? Math.min(elapsed / total, 1) : 0;
  const primaryCat = lesson?.categories?.[0] ?? '';
  const catColor = MAC_COLORS[primaryCat] ?? colors.accentLight;

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
            <TouchableOpacity style={styles.primaryBtn} onPress={() => { setPhase('ready'); setElapsed(0); }}>
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
            <Text style={styles.readyDuration}>{formatTime(lesson.duration_seconds)}</Text>
            {lesson.on_screen_text && (
              <Text style={styles.readyDesc}>{lesson.on_screen_text}</Text>
            )}
            <TouchableOpacity style={styles.primaryBtn} onPress={startLesson}>
              <Text style={styles.primaryBtnText}>Begin</Text>
            </TouchableOpacity>
          </View>
        )}

        {phase === 'playing' && lesson && (
          <View style={styles.centered}>
            <View style={styles.timerContainer}>
              <Text style={styles.timerText}>{formatTime(elapsed)}</Text>
              <Text style={styles.timerTotal}>/ {formatTime(total)}</Text>
            </View>
            <View style={styles.progressBarTrack}>
              <View style={[styles.progressBarFill, { width: `${progress * 100}%`, backgroundColor: catColor }]} />
            </View>
            {lesson.on_screen_text && (
              <Text style={styles.onScreenText}>{lesson.on_screen_text}</Text>
            )}
          </View>
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
              <Ionicons name="checkmark-circle" size={48} color={colors.success} style={{ alignSelf: 'center', marginBottom: spacing.md }} />
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
