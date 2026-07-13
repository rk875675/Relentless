import { useCallback, useState } from 'react';
import {
  Alert,
  FlatList,
  Image,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
  type ImageSourcePropType,
} from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { apiFetch } from '@/lib/api';
import { getCached, setCached } from '@/lib/api-cache';
import { GRANT_PHOTO, coachAvatarSource } from '@/lib/coach-photo';
import { GRANT_CHIASSON_NAME } from '@/lib/grant-attribution';
import { trackPackCtaClicked } from '@/lib/core-analytics';
import { selectProgram } from '@/lib/switch-program';
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
  /** Whether the user has previously started this pack (offer Resume vs Start). */
  started?: boolean;
  /** Stored day to resume from on Continue. */
  current_day?: number | null;
};

type ProgramsResponse = { items: RecommendedProgram[] };

function programHeroSource(
  coachName?: string | null,
  coachAvatarUrl?: string | null,
): ImageSourcePropType | null {
  if (coachName === GRANT_CHIASSON_NAME) return GRANT_PHOTO;
  return coachAvatarSource(coachAvatarUrl, coachName);
}

function coachLine(item: RecommendedProgram): string {
  return `${item.coach_name}${item.coach_sport ? ` (${item.coach_sport})` : ''}`;
}

/**
 * Full-screen list of coach WOD programs ("Explore the full library" on Home).
 * Each pack can be made the active program (drives the daily WOD), or you can
 * try its Day 1 without switching. The /programs endpoint hides preview programs
 * from real users, so in prod this shows the empty state until packs go live.
 */
export default function ProgramsScreen() {
  const router = useRouter();
  const { width: windowWidth } = useWindowDimensions();
  const [programs, setPrograms] = useState<RecommendedProgram[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [switching, setSwitching] = useState(false);

  // Same hero sizing as the Home WOD card (WodCard in index.tsx).
  const heroWidth = windowWidth - 42;
  const heroHeight = Math.round(heroWidth / 1.2);

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

  // Switch the active pack, then return Home so the new daily workout is visible.
  const handleSwitch = useCallback(
    (p: RecommendedProgram) => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

      const apply = async (
        mode: 'continue' | 'restart',
        action: 'activate' | 'continue' | 'restart',
      ) => {
        if (switching) return;
        trackPackCtaClicked({
          program_id: p.id,
          program_title: p.title,
          coach_name: p.coach_name,
          action,
          source_screen: 'programs',
        });
        setSwitching(true);
        const err = await selectProgram(p.id, mode);
        setSwitching(false);
        if (err) {
          Alert.alert('Could not switch program', err);
          return;
        }
        if (router.canGoBack()) {
          router.back();
        } else {
          router.replace('/(tabs)' as any);
        }
      };

      if (p.started) {
        Alert.alert(
          p.title,
          `You've started this pack${typeof p.current_day === 'number' ? ` (day ${p.current_day})` : ''}. Continue where you left off, or restart from day 1?`,
          [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Restart', style: 'destructive', onPress: () => void apply('restart', 'restart') },
            { text: 'Continue', onPress: () => void apply('continue', 'continue') },
          ],
        );
      } else {
        Alert.alert(
          p.title,
          'Make this your daily workout pack? It will replace your current program as your daily workout.',
          [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Make active', onPress: () => void apply('restart', 'activate') },
          ],
        );
      }
    },
    [router, switching],
  );

  return (
    <>
      <Stack.Screen options={{ title: 'Programs' }} />
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
        ListHeaderComponent={
          !loading && !error && programs.length > 0 ? (
            <Text style={styles.introText}>
              Tap a program to make it your daily workout, or try its first day without switching.
            </Text>
          ) : null
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
        renderItem={({ item }) => {
          const hero = programHeroSource(item.coach_name, item.coach_avatar_url);
          return (
            <View style={styles.cardOuter}>
              <View style={styles.cardInner}>
                <View style={[styles.heroWrap, { width: heroWidth, height: heroHeight }]}>
                  {hero ? (
                    <Image
                      source={hero}
                      style={{ width: heroWidth, height: heroWidth }}
                      resizeMode="cover"
                    />
                  ) : (
                    <View style={styles.heroPlaceholder}>
                      <Ionicons name="person" size={64} color={colors.textSecondary} />
                    </View>
                  )}
                  <Text style={styles.heroHeader}>{coachLine(item)}</Text>
                </View>

                <View style={styles.metaSection}>
                  <Text style={styles.programTitle}>{item.title}</Text>
                </View>

                {item.started && typeof item.current_day === 'number' ? (
                  <View style={styles.progressPill}>
                    <Ionicons name="time-outline" size={12} color={colors.accentLight} />
                    <Text style={styles.progressPillText}>In progress · Day {item.current_day}</Text>
                  </View>
                ) : null}

                <TouchableOpacity
                  style={[styles.switchBtn, switching && styles.switchBtnDisabled]}
                  activeOpacity={0.85}
                  disabled={switching}
                  onPress={() => handleSwitch(item)}
                >
                  <Ionicons
                    name={item.started ? 'play-forward' : 'swap-horizontal'}
                    size={16}
                    color={colors.white}
                  />
                  <Text style={styles.switchBtnText}>
                    {item.started ? 'Resume this pack' : 'Make this my pack'}
                  </Text>
                </TouchableOpacity>

                {item.day1_lesson_id ? (
                  <TouchableOpacity
                    style={styles.tryBtn}
                    activeOpacity={0.7}
                    onPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      trackPackCtaClicked({
                        program_id: item.id,
                        program_title: item.title,
                        coach_name: item.coach_name,
                        action: 'try_day1',
                        source_screen: 'programs',
                      });
                      router.push(`/lesson/${item.day1_lesson_id}` as any);
                    }}
                  >
                    <Text style={styles.tryBtnText}>Try Day 1 without switching</Text>
                    <Ionicons name="chevron-forward" size={13} color={colors.accentLight} />
                  </TouchableOpacity>
                ) : null}
              </View>
            </View>
          );
        }}
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
  introText: {
    fontSize: 13,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: spacing.md,
    paddingHorizontal: spacing.sm,
  },
  cardOuter: {
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(167, 139, 250, 0.4)',
    backgroundColor: colors.surface,
    overflow: 'hidden',
    marginBottom: spacing.md,
  },
  cardInner: {
    flexDirection: 'column',
    paddingHorizontal: spacing.xl,
    paddingTop: 24,
    paddingBottom: 24,
  },
  heroWrap: {
    marginLeft: -spacing.xl,
    marginTop: -24,
    overflow: 'hidden',
  },
  heroPlaceholder: {
    width: '100%' as any,
    height: '100%' as any,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
  },
  heroHeader: {
    position: 'absolute',
    top: 18,
    left: 0,
    right: 0,
    fontSize: 17,
    fontWeight: '800',
    color: colors.white,
    textAlign: 'center',
    letterSpacing: 0.3,
    textShadowColor: 'rgba(0, 0, 0, 0.65)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 8,
  },
  metaSection: {
    paddingVertical: 14,
  },
  programTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.textPrimary,
    textAlign: 'center',
    lineHeight: 26,
  },
  progressPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    alignSelf: 'center',
    backgroundColor: colors.accentSubtle,
    borderWidth: 1,
    borderColor: 'rgba(167, 139, 250, 0.4)',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 4,
    marginBottom: spacing.sm,
  },
  progressPillText: {
    color: colors.accentLight,
    fontSize: 12,
    fontWeight: '700',
  },
  switchBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    alignSelf: 'stretch',
    backgroundColor: colors.accent,
    borderRadius: 14,
    paddingVertical: 15,
    paddingHorizontal: 18,
  },
  switchBtnDisabled: {
    opacity: 0.6,
  },
  switchBtnText: {
    color: colors.white,
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  tryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    paddingVertical: 10,
    marginTop: spacing.xs,
  },
  tryBtnText: {
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
});
