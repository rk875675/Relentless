import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import { apiFetch } from '@/lib/api';
import { JournalDetailSkeleton } from '@/components/Skeleton';
import { colors, spacing, TAB_BAR_CLEARANCE } from '@/lib/theme';
import FormattedJournalBody from '@/components/FormattedJournalBody';

const MAC_COLORS: Record<string, string> = {
  mindfulness: colors.ringMindfulness,
  acceptance: colors.ringAcceptance,
  commitment: colors.ringCommitment,
};

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

export default function JournalDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [entry, setEntry] = useState<JournalEntry | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!id || typeof id !== 'string') {
      setLoading(false);
      setError('Invalid entry');
      return;
    }
    (async () => {
      const res = await apiFetch<JournalEntry>(`/journal/${id}`);
      if (res.error) {
        setError(res.error);
        setEntry(null);
      } else {
        setEntry(res.data ?? null);
      }
      setLoading(false);
    })();
  }, [id]);

  const isMiss = entry?.entry_type === 'miss_reflection';
  const isFutureSelf = entry?.entry_type === 'onboarding_future_self';

  return (
    <>
      <Stack.Screen
        options={{
          headerShown: true,
          headerBackTitle: 'Journal',
          headerStyle: { backgroundColor: '#1A1A1B' },
          headerTintColor: colors.accentLight,
          headerTitleStyle: {
            fontSize: 17,
            fontWeight: '600',
            color: colors.textPrimary,
          },
          title: 'Entry',
        }}
      />

      <View style={styles.screen}>
        {/* UX-PERF: skeleton loader replaces ActivityIndicator */}
        {loading ? (
          <JournalDetailSkeleton />
        ) : error ? (
          <Text style={styles.errorText}>{error}</Text>
        ) : !entry ? (
          <Text style={styles.errorText}>Entry not found.</Text>
        ) : (
          <ScrollView
            contentContainerStyle={styles.scroll}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <Text style={styles.title}>
              {isMiss
                ? 'Missed Day Reflection'
                : isFutureSelf
                  ? 'Future Self'
                  : (entry.lesson_title ?? 'Check-In')}
            </Text>
            {isMiss && (
              <View style={styles.missBadge}>
                <Text style={styles.missBadgeText}>MISSED DAY</Text>
              </View>
            )}
            {isFutureSelf && (
              <View style={styles.typeBadge}>
                <Text style={styles.typeBadgeText}>ONBOARDING</Text>
              </View>
            )}
            {!isMiss && !isFutureSelf && (entry.categories?.length ?? 0) > 0 && (
              <View style={styles.catRow}>
                {entry.categories.map((cat) => {
                  const c = MAC_COLORS[cat];
                  if (!c) return null;
                  return (
                    <View
                      key={cat}
                      style={[styles.catBadge, { backgroundColor: c + '20', borderColor: c }]}
                    >
                      <Text style={[styles.catBadgeText, { color: c }]}>{cat.toUpperCase()}</Text>
                    </View>
                  );
                })}
              </View>
            )}
            <Text style={styles.date}>
              {formatDate(entry.created_at)} · {formatTime(entry.created_at)}
            </Text>
            <FormattedJournalBody body={entry.body} />
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
  catRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 10,
  },
  catBadge: {
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  catBadgeText: {
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 1,
  },
  missBadge: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(239,68,68,0.25)',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    marginBottom: 8,
  },
  missBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#f87171',
    letterSpacing: 1,
  },
  typeBadge: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(139,92,246,0.15)',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    marginBottom: 8,
  },
  typeBadgeText: {
    fontSize: 9,
    fontWeight: '700',
    color: colors.accentLight,
    letterSpacing: 0.8,
  },
  errorText: {
    color: colors.error,
    fontSize: 14,
    textAlign: 'center',
    marginTop: 60,
    paddingHorizontal: 20,
  },
});
