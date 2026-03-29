import { useCallback, useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { apiFetch } from '@/lib/api';
import { ProgressRing } from '@/components/ProgressRing';
import { colors, spacing, TAB_BAR_CLEARANCE } from '@/lib/theme';

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

const MAC_CATEGORIES = [
  { id: 'mindfulness', label: 'Mindfulness' },
  { id: 'acceptance', label: 'Acceptance' },
  { id: 'commitment', label: 'Commitment' },
] as const;

export default function LibraryScreen() {
  const router = useRouter();
  const [progress, setProgress] = useState<Progress | null>(null);
  const [streak, setStreak] = useState<Streak | null>(null);
  const [error, setError] = useState('');

  const fetchData = async () => {
    setError('');
    const [progressRes, streakRes] = await Promise.all([
      apiFetch<Progress>('/progress'),
      apiFetch<Streak>('/streak'),
    ]);
    if (progressRes.error) {
      setError(progressRes.error);
    }
    if (progressRes.data) setProgress(progressRes.data);
    if (streakRes.data) setStreak(streakRes.data);
  };

  useFocusEffect(
    useCallback(() => {
      fetchData();
    }, []),
  );

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.brand}>RELENTLESS</Text>
        <Text style={styles.streak}>{streak?.current_streak ?? 0}🔥</Text>
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
      ) : null}

      {/* MAC Category Buttons */}
      {MAC_CATEGORIES.map((cat) => (
        <TouchableOpacity
          key={cat.id}
          style={styles.categoryBtn}
          activeOpacity={0.8}
          onPress={() => router.push(`/category/${cat.id}`)}
        >
          <Text style={styles.categoryLabel}>{cat.label}</Text>
        </TouchableOpacity>
      ))}

      {/* Coach CTA — PRD: subtle outbound path to coach for 1:1 help */}
      <TouchableOpacity style={styles.ctaCard} activeOpacity={0.8}>
        <Text style={styles.ctaTitle}>
          CTA - 1 on 1 lessons with Grant
        </Text>
        <Text style={styles.ctaSub}>
          (his specific offer for those looking for individuality)
        </Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    paddingHorizontal: spacing.lg,
    paddingTop: 60,
    paddingBottom: TAB_BAR_CLEARANCE,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  brand: {
    fontSize: 28,
    fontWeight: '900',
    color: colors.white,
    letterSpacing: 2,
  },
  streak: {
    fontSize: 22,
    color: colors.white,
    fontWeight: '700',
  },
  ringsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: spacing.xl,
    paddingHorizontal: spacing.md,
  },
  categoryBtn: {
    backgroundColor: colors.surface,
    borderRadius: 14,
    paddingVertical: 28,
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  categoryLabel: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.white,
  },
  ctaCard: {
    backgroundColor: colors.surfaceLight,
    borderRadius: 14,
    padding: spacing.lg,
    alignItems: 'center',
    marginTop: spacing.sm,
  },
  ctaTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.white,
    textAlign: 'center',
  },
  ctaSub: {
    fontSize: 12,
    color: colors.textMuted,
    marginTop: spacing.xs,
    textAlign: 'center',
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
    borderColor: colors.surfaceLight,
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 24,
  },
  retryText: {
    color: colors.white,
    fontSize: 14,
  },
});
