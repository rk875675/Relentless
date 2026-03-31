import { useCallback, useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
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
        <View style={styles.streakPill}>
          <Text style={styles.streakNum}>{streak?.current_streak ?? 0}</Text>
          <Ionicons name="flame" size={16} color="#f59e0b" />
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
      ) : null}

      {/* MAC Category Buttons */}
      {MAC_CATEGORIES.map((cat) => (
        <TouchableOpacity
          key={cat.id}
          style={styles.categoryBtn}
          activeOpacity={0.7}
          onPress={() => router.push(`/category/${cat.id}`)}
        >
          <View style={styles.categoryAccent} />
          <Text style={styles.categoryLabel}>{cat.label}</Text>
        </TouchableOpacity>
      ))}

      {/* Coach CTA — PRD: subtle outbound path to coach for 1:1 help */}
      <TouchableOpacity style={styles.ctaCard} activeOpacity={0.8}>
        <Text style={styles.ctaLabel}>1 ON 1</Text>
        <Text style={styles.ctaTitle}>
          Sessions with Grant
        </Text>
        <Text style={styles.ctaSub}>
          Personalized coaching for your specific goals
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
  categoryBtn: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: 26,
    paddingHorizontal: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  categoryAccent: {
    width: 4,
    height: 24,
    borderRadius: 2,
    backgroundColor: colors.accent,
    marginRight: 16,
  },
  categoryLabel: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.textPrimary,
    letterSpacing: 0.3,
  },
  ctaCard: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.accent,
    padding: spacing.lg,
    alignItems: 'center',
    marginTop: spacing.sm,
  },
  ctaLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.accent,
    letterSpacing: 2,
    marginBottom: 6,
  },
  ctaTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.textPrimary,
    textAlign: 'center',
  },
  ctaSub: {
    fontSize: 13,
    color: colors.textSecondary,
    marginTop: 6,
    textAlign: 'center',
    lineHeight: 18,
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
