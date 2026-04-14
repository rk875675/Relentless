import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Stack } from 'expo-router';
import { apiFetch } from '@/lib/api';
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

type JournalListResponse = {
  items: JournalEntry[];
  page: number;
  limit: number;
  total: number;
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

export default function JournalListScreen() {
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    (async () => {
      const res = await apiFetch<JournalListResponse>('/journal?limit=50');
      if (res.error) {
        setError(res.error);
      } else {
        setEntries(res.data?.items ?? []);
      }
      setLoading(false);
    })();
  }, []);

  return (
    <>
      <Stack.Screen
        options={{
          headerShown: true,
          headerBackTitle: 'Profile',
          headerStyle: { backgroundColor: '#000' },
          headerTintColor: colors.accentLight,
          headerTitleStyle: {
            fontSize: 17,
            fontWeight: '600',
            color: colors.textPrimary,
          },
          title: 'Journal',
        }}
      />

      <View style={styles.screen}>
        {loading ? (
          <ActivityIndicator color={colors.accent} size="large" style={{ marginTop: 60 }} />
        ) : error ? (
          <Text style={styles.errorText}>{error}</Text>
        ) : entries.length === 0 ? (
          <View style={styles.empty}>
            <Text style={styles.emptyText}>No journal entries yet.</Text>
            <Text style={styles.emptySubtext}>
              Complete a workout or write a reflection to see entries here.
            </Text>
          </View>
        ) : (
          <FlatList
            data={entries}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.list}
            showsVerticalScrollIndicator={false}
            renderItem={({ item }) => {
              const isMiss = item.entry_type === 'miss_reflection';
              const isFutureSelf = item.entry_type === 'onboarding_future_self';
              const primaryCat = item.categories?.[0];
              const catColor = MAC_COLORS[primaryCat ?? ''];
              const cardBorder = isMiss
                ? styles.cardMiss
                : catColor
                  ? { borderColor: catColor, borderWidth: 1.5 }
                  : undefined;
              return (
                <View style={[styles.card, cardBorder]}>
                  <View style={styles.cardHeader}>
                    <Text style={styles.cardTitle}>
                      {isMiss
                        ? 'Missed Day Reflection'
                        : isFutureSelf
                        ? 'Future Self'
                        : (item.lesson_title ?? 'Check-In')}
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
                    {!isMiss && !isFutureSelf && catColor && (
                      <View style={[styles.catBadge, { backgroundColor: catColor + '20', borderColor: catColor }]}>
                        <Text style={[styles.catBadgeText, { color: catColor }]}>
                          {primaryCat!.toUpperCase()}
                        </Text>
                      </View>
                    )}
                  </View>
                  {isMiss && (
                    <Text style={styles.missSubtext}>
                      You missed a day — here{"'"}s what you wrote about it.
                    </Text>
                  )}
                  <Text style={styles.cardDate}>
                    {formatDate(item.created_at)} · {formatTime(item.created_at)}
                  </Text>
                  <FormattedJournalBody body={item.body} />
                </View>
              );
            }}
          />
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
  list: {
    padding: 20,
    paddingBottom: TAB_BAR_CLEARANCE,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    marginBottom: 12,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  cardTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textPrimary,
    flex: 1,
    marginRight: 8,
  },
  cardDate: {
    fontSize: 12,
    color: colors.textMuted,
    fontWeight: '500',
    marginBottom: 10,
  },
  cardMiss: {
    borderColor: '#ef4444',
    borderWidth: 1.5,
  },
  missBadge: {
    backgroundColor: 'rgba(239,68,68,0.25)',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  missBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#f87171',
    letterSpacing: 1,
  },
  missSubtext: {
    fontSize: 12,
    color: '#f87171',
    marginBottom: 6,
    fontWeight: '500',
  },
  typeBadge: {
    backgroundColor: 'rgba(139,92,246,0.15)',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  typeBadgeText: {
    fontSize: 9,
    fontWeight: '700',
    color: colors.accentLight,
    letterSpacing: 0.8,
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
  cardBody: {
    fontSize: 14,
    color: colors.textPrimary,
    lineHeight: 20,
  },
  empty: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
  },
  emptyText: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.textSecondary,
    marginBottom: 8,
  },
  emptySubtext: {
    fontSize: 13,
    color: colors.textMuted,
    textAlign: 'center',
    lineHeight: 19,
  },
  errorText: {
    color: colors.error,
    fontSize: 14,
    textAlign: 'center',
    marginTop: 60,
    paddingHorizontal: 20,
  },
});
