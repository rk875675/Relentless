import { useEffect, useState } from 'react';
import {
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { apiFetch } from '@/lib/api';
import { JournalListSkeleton } from '@/components/Skeleton';
import { colors, spacing, TAB_BAR_CLEARANCE } from '@/lib/theme';

const MAC_COLORS: Record<string, string> = {
  mindfulness: colors.ringMindfulness,
  acceptance: colors.ringAcceptance,
  commitment: colors.ringCommitment,
};

const PREVIEW_MAX = 220;

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

function bodyPreview(body: string): string {
  const t = body.replace(/\s+/g, ' ').trim();
  if (t.length <= PREVIEW_MAX) return t;
  return `${t.slice(0, PREVIEW_MAX - 1)}…`;
}

export default function JournalListScreen() {
  const router = useRouter();
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
        {/* UX-PERF: skeleton loader replaces ActivityIndicator */}
        {loading ? (
          <JournalListSkeleton />
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
              const cats = item.categories ?? [];
              return (
                <Pressable
                  onPress={() => router.push(`/journal/${item.id}`)}
                  style={({ pressed }) => [styles.card, isMiss && styles.cardMiss, pressed && styles.cardPressed]}
                >
                  <View style={styles.cardHeader}>
                    <Text style={styles.cardTitle}>
                      {isMiss
                        ? 'Missed Day Reflection'
                        : isFutureSelf
                          ? 'Future Self'
                          : (item.lesson_title ?? 'Check-In')}
                    </Text>
                    <View style={styles.headerBadges}>
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
                      {!isMiss &&
                        !isFutureSelf &&
                        cats.map((cat) => {
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
                  </View>
                  {isMiss && (
                    <Text style={styles.missSubtext}>
                      You missed a day — here{"'"}s what you wrote about it.
                    </Text>
                  )}
                  <Text style={styles.cardDate}>
                    {formatDate(item.created_at)} · {formatTime(item.created_at)}
                  </Text>
                  <Text style={styles.previewText}>{bodyPreview(item.body)}</Text>
                  <Text style={styles.tapHint}>Tap for full entry</Text>
                </Pressable>
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
  cardMiss: {
    borderColor: '#ef4444',
    borderWidth: 1.5,
  },
  cardPressed: {
    opacity: 0.88,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 4,
    gap: 8,
  },
  cardTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textPrimary,
    flex: 1,
    minWidth: 0,
  },
  headerBadges: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'flex-end',
    alignItems: 'center',
    maxWidth: '52%',
    gap: 6,
  },
  cardDate: {
    fontSize: 12,
    color: colors.textMuted,
    fontWeight: '500',
    marginBottom: 10,
  },
  previewText: {
    fontSize: 14,
    color: colors.textPrimary,
    lineHeight: 20,
  },
  tapHint: {
    fontSize: 12,
    color: colors.textMuted,
    marginTop: 8,
    fontWeight: '500',
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
    lineHeight: 12,
    includeFontPadding: false,
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
