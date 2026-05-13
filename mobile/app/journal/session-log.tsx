import { useEffect, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { apiFetch } from '@/lib/api';
import { JournalListSkeleton } from '@/components/Skeleton';
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

type ApiPayload = { items: JournalEntry[] };

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

export default function SessionLogScreen() {
  const router = useRouter();
  const [items, setItems] = useState<JournalEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    (async () => {
      const res = await apiFetch<ApiPayload>('/journal/session-log');
      if (res.error) {
        setError(res.error);
        setItems([]);
      } else {
        setItems(res.data?.items ?? []);
      }
      setLoading(false);
    })();
  }, []);

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
          title: 'Evidence log',
        }}
      />

      <View style={styles.screen}>
        {/* UX-PERF: skeleton loader replaces ActivityIndicator */}
        {loading ? (
          <JournalListSkeleton />
        ) : error ? (
          <Text style={styles.centerError}>{error}</Text>
        ) : items.length === 0 ? (
          <ScrollView
            contentContainerStyle={styles.emptyScroll}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <Text style={styles.emptyTitle}>No journal entries yet</Text>
            <Text style={styles.emptyBody}>
              Entries from your workouts and check-ins will appear here in order. Finish a lesson
              journal to build your log.
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
            <Text style={styles.lead}>
              Oldest first — read through what you&apos;ve already written.
            </Text>
            {items.map((entry, i) => (
              <View
                key={entry.id}
                style={[styles.card, i > 0 ? styles.cardSpacing : undefined]}
              >
                <Text style={styles.cardTitle}>
                  {entry.lesson_title ?? 'Journal entry'}
                </Text>
                <Text style={styles.cardDate}>
                  {formatDate(entry.created_at)} · {formatTime(entry.created_at)}
                </Text>
                <FormattedJournalBody body={entry.body} />
              </View>
            ))}
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
  centerError: {
    color: colors.error,
    fontSize: 14,
    textAlign: 'center',
    marginTop: 60,
    paddingHorizontal: 20,
  },
  lead: {
    fontSize: 14,
    color: colors.textMuted,
    lineHeight: 20,
    marginBottom: 16,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
  },
  cardSpacing: {
    marginTop: 16,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: 6,
  },
  cardDate: {
    fontSize: 12,
    color: colors.textMuted,
    marginBottom: 12,
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
