import { useEffect, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { apiFetch } from '@/lib/api';
import { JournalDetailSkeleton } from '@/components/Skeleton';
import { colors, spacing, TAB_BAR_CLEARANCE } from '@/lib/theme';
import FormattedJournalBody from '@/components/FormattedJournalBody';

type JournalEntry = {
  id: string;
  lesson_id: string | null;
  lesson_title: string | null;
  categories: string[];
  competition_date: string | null;
  body: string;
  entry_type: string;
  created_at: string;
};

type ApiPayload = {
  entry: JournalEntry | null;
  program_day: number;
};

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  });
}

export default function WodDayJournalScreen() {
  const router = useRouter();
  const { day } = useLocalSearchParams<{ day: string }>();
  const [payload, setPayload] = useState<ApiPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const programDay = typeof day === 'string' ? Number.parseInt(day, 10) : NaN;

  useEffect(() => {
    if (!Number.isFinite(programDay) || programDay < 1 || programDay > 30) {
      setLoading(false);
      setError('Invalid day');
      return;
    }
    (async () => {
      const res = await apiFetch<ApiPayload>(
        `/journal/by-program-day?program_day=${programDay}`,
      );
      if (res.error) {
        setError(res.error);
        setPayload(null);
      } else {
        setPayload(res.data ?? null);
      }
      setLoading(false);
    })();
  }, [programDay]);

  const entry = payload?.entry ?? null;

  return (
    <>
      <Stack.Screen
        options={{
          headerShown: true,
          headerBackTitle: 'Lesson',
          headerStyle: { backgroundColor: '#000' },
          headerTintColor: colors.accentLight,
          headerTitleStyle: {
            fontSize: 17,
            fontWeight: '600',
            color: colors.textPrimary,
          },
          title: Number.isFinite(programDay) ? `Day ${programDay}` : 'Journal',
        }}
      />

      <View style={styles.screen}>
        {/* UX-PERF: skeleton loader replaces ActivityIndicator */}
        {loading ? (
          <JournalDetailSkeleton />
        ) : error ? (
          <Text style={styles.centerMuted}>{error}</Text>
        ) : !entry ? (
          <ScrollView
            contentContainerStyle={styles.emptyScroll}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <Text style={styles.emptyTitle}>No journal entry for Day {programDay}</Text>
            <Text style={styles.emptyBody}>
              When you complete that day&apos;s workout journal, it will show up here. You can keep
              going in the lesson — or come back after you&apos;ve written it.
            </Text>
            <Pressable style={styles.primaryBtn} onPress={() => router.back()}>
              <Text style={styles.primaryBtnText}>Back to lesson</Text>
            </Pressable>
            <View style={{ height: TAB_BAR_CLEARANCE }} />
          </ScrollView>
        ) : (
          <ScrollView
            contentContainerStyle={styles.scroll}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <Text style={styles.title}>{entry.lesson_title ?? `Day ${programDay} check-in`}</Text>
            <Text style={styles.date}>
              {formatDate(entry.created_at)} · {formatTime(entry.created_at)}
            </Text>
            <FormattedJournalBody body={entry.body} />
            <Text style={styles.hint}>Use the back arrow to return to your lesson and keep writing.</Text>
            <View style={{ height: TAB_BAR_CLEARANCE }} />
          </ScrollView>
        )}
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scroll: {
    padding: 20,
    paddingBottom: spacing.xl,
  },
  emptyScroll: {
    flexGrow: 1,
    padding: 24,
    paddingTop: 48,
    justifyContent: 'center',
  },
  centerMuted: {
    color: colors.textMuted,
    fontSize: 14,
    textAlign: 'center',
    marginTop: 60,
    paddingHorizontal: 20,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: 8,
  },
  date: {
    fontSize: 13,
    color: colors.textMuted,
    fontWeight: '500',
    marginBottom: 16,
  },
  hint: {
    marginTop: 20,
    fontSize: 13,
    color: colors.textMuted,
    lineHeight: 20,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: 12,
    textAlign: 'center',
  },
  emptyBody: {
    fontSize: 15,
    color: colors.textSecondary,
    lineHeight: 22,
    textAlign: 'center',
    marginBottom: 28,
  },
  primaryBtn: {
    alignSelf: 'center',
    backgroundColor: colors.accent,
    borderRadius: 14,
    paddingVertical: 16,
    paddingHorizontal: 32,
  },
  primaryBtnText: {
    color: colors.white,
    fontSize: 16,
    fontWeight: '700',
  },
});
