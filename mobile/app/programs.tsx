import { useCallback, useState } from 'react';
import {
  FlatList,
  Image,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { apiFetch } from '@/lib/api';
import { getCached, setCached } from '@/lib/api-cache';
import { ProgramListSkeleton } from '@/components/Skeleton';
import { colors, spacing } from '@/lib/theme';

/** Row from GET /programs — same shape as the Home rail. */
type RecommendedProgram = {
  id: string;
  title: string;
  coach_name: string;
  coach_sport?: string | null;
  coach_avatar_url?: string | null;
  /** First workout of the program; null when the program has no lessons yet. */
  day1_lesson_id?: string | null;
};

type ProgramsResponse = { items: RecommendedProgram[] };

/**
 * Full-screen list of coach WOD programs ("Explore the full library" on Home).
 * Visual-only for now — tapping a program will open it once program switching
 * ships. The /programs endpoint hides preview programs from real users, so in
 * prod this screen simply shows the empty state until packs go live.
 */
export default function ProgramsScreen() {
  const router = useRouter();
  const [programs, setPrograms] = useState<RecommendedProgram[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  // UX-PERF: cache-then-network, same pattern as the lesson catalog.
  const fetchPrograms = useCallback(async (isPull = false) => {
    setError('');
    if (isPull) {
      setRefreshing(true);
    } else {
      const cached = getCached<ProgramsResponse>('/programs');
      if (cached) {
        setPrograms(cached.items);
        setLoading(false);
      }
    }
    const { data, error: err } = await apiFetch<ProgramsResponse>('/programs');
    if (err) {
      setError(err);
    } else if (data) {
      setPrograms(data.items ?? []);
      setCached('/programs', data);
    }
    setLoading(false);
    setRefreshing(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      void fetchPrograms();
    }, [fetchPrograms]),
  );

  return (
    <>
      <Stack.Screen
        options={{
          title: 'Programs',
          // Explicit back control: the native header back button is
          // unresponsive on this screen (swipe-back works), so render our own.
          headerLeft: () => (
            <TouchableOpacity
              style={styles.headerBackBtn}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              onPress={() => {
                if (router.canGoBack()) {
                  router.back();
                } else {
                  router.replace('/(tabs)' as any);
                }
              }}
            >
              <Ionicons name="chevron-back" size={24} color={colors.accentLight} />
              <Text style={styles.headerBackText}>Home</Text>
            </TouchableOpacity>
          ),
        }}
      />
      <FlatList
        style={styles.list}
        contentContainerStyle={[
          styles.listContent,
          !loading && (error || programs.length === 0) && styles.listCentered,
        ]}
        data={programs}
        keyExtractor={(p) => p.id}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => void fetchPrograms(true)}
            tintColor={colors.accent}
          />
        }
        ListEmptyComponent={
          loading ? (
            <ProgramListSkeleton />
          ) : error ? (
            <View style={styles.errorWrap}>
              <Text style={styles.errorText}>{error}</Text>
              <TouchableOpacity style={styles.retryBtn} onPress={() => void fetchPrograms()}>
                <Text style={styles.retryText}>Retry</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <Text style={styles.emptyText}>More programs are coming soon.</Text>
          )
        }
        renderItem={({ item }) => (
          <TouchableOpacity
            style={styles.card}
            activeOpacity={item.day1_lesson_id ? 0.85 : 1}
            disabled={!item.day1_lesson_id}
            onPress={() => {
              if (!item.day1_lesson_id) return;
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
              router.push(`/lesson/${item.day1_lesson_id}` as any);
            }}
          >
            <View style={styles.cardAvatar}>
              {item.coach_avatar_url ? (
                <Image
                  source={{ uri: item.coach_avatar_url }}
                  style={styles.cardAvatarImg}
                  resizeMode="cover"
                />
              ) : (
                <View style={styles.cardAvatarPlaceholder}>
                  <Ionicons name="person" size={30} color={colors.textSecondary} />
                </View>
              )}
            </View>
            <Text style={styles.cardCoach}>
              {item.coach_name}
              {item.coach_sport ? ` (${item.coach_sport})` : ''}
            </Text>
            <Text style={styles.cardTitle}>{item.title}</Text>
            {item.day1_lesson_id ? (
              <View style={styles.cardStartRow}>
                <Text style={styles.cardStartText}>Start Day 1</Text>
                <Ionicons name="chevron-forward" size={14} color={colors.accentLight} />
              </View>
            ) : null}
          </TouchableOpacity>
        )}
      />
    </>
  );
}

const styles = StyleSheet.create({
  list: {
    flex: 1,
    backgroundColor: colors.background,
  },
  listContent: {
    padding: 20,
    paddingBottom: 40,
  },
  listCentered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(167, 139, 250, 0.4)',
    padding: spacing.lg,
    marginBottom: spacing.md,
    alignItems: 'center',
  },
  cardAvatar: {
    width: 84,
    height: 84,
    borderRadius: 999,
    borderWidth: 2,
    borderColor: 'rgba(167, 139, 250, 0.4)',
    overflow: 'hidden',
    marginBottom: spacing.md,
  },
  cardAvatarImg: {
    width: '100%' as any,
    height: '100%' as any,
  },
  cardAvatarPlaceholder: {
    flex: 1,
    alignSelf: 'stretch',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
  },
  cardCoach: {
    fontSize: 16,
    fontWeight: '800',
    color: colors.textPrimary,
    textAlign: 'center',
  },
  cardTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: 4,
  },
  cardStartRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    marginTop: spacing.md,
  },
  cardStartText: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.accentLight,
    letterSpacing: 0.2,
  },
  errorWrap: {
    alignItems: 'center',
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
  emptyText: {
    color: colors.textMuted,
    fontSize: 14,
    textAlign: 'center',
  },
  headerBackBtn: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerBackText: {
    fontSize: 17,
    color: colors.accentLight,
    marginLeft: 2,
  },
});
