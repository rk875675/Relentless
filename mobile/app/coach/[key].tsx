import { useCallback, useRef, useState } from 'react';
import {
  Image,
  Linking,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useVideoPlayer, VideoView } from 'expo-video';
import { apiFetch } from '@/lib/api';
import { getCached, setCached } from '@/lib/api-cache';
import { coachAvatarSource } from '@/lib/coach-photo';
import { trackPartnerReferralCtaClicked } from '@/lib/core-analytics';
import { colors, spacing } from '@/lib/theme';
import { LessonPackListSkeleton, Skeleton } from '@/components/Skeleton';

type CoachProfile = {
  coach_key?: string | null;
  name: string;
  credentials?: string | null;
  bio?: string | null;
  long_bio?: string | null;
  avatar_url?: string | null;
  offer_label?: string | null;
  external_url?: string | null;
  intro_video_url?: string | null;
};

type LessonPack = {
  id: string;
  title: string;
  coach_name: string;
  coach_sport?: string | null;
  coach_avatar_url?: string | null;
  cover_image?: string | null;
  day1_lesson_id?: string | null;
  started?: boolean;
  current_day?: number | null;
  is_active?: boolean;
  total_days?: number | null;
  completed?: boolean;
};

const PACKS_CACHE_KEY = '/programs?include_active=1';

function packProgressFraction(pack: LessonPack): number {
  if (pack.completed) return 1;
  const total = pack.total_days ?? 0;
  if (!total) return 0;
  const current = typeof pack.current_day === 'number' ? pack.current_day : 1;
  return Math.min(1, Math.max(0, (current - 1) / total));
}

function packProgressLabel(pack: LessonPack): string {
  if (pack.completed) return 'Completed';
  const total = pack.total_days ?? 0;
  if (!pack.started) return total ? `${total} lessons` : 'Not started';
  if (typeof pack.current_day === 'number' && total) {
    return `Day ${pack.current_day} of ${total}`;
  }
  return 'In progress';
}

function isActivelyRedoing(pack: LessonPack): boolean {
  return (
    pack.is_active === true &&
    pack.completed === true &&
    typeof pack.current_day === 'number' &&
    typeof pack.total_days === 'number' &&
    pack.total_days > 0 &&
    pack.current_day < pack.total_days
  );
}

function packImageSource(pack: LessonPack): { uri: string } | ReturnType<typeof coachAvatarSource> {
  if (pack.cover_image && /^https?:\/\//i.test(pack.cover_image)) {
    return { uri: pack.cover_image };
  }
  return coachAvatarSource(pack.coach_avatar_url, pack.coach_name);
}

// ---------------------------------------------------------------------------
// Collapsable intro-video player (mirrors lesson/[id].tsx CoachIntroVideoPlayer)
// ---------------------------------------------------------------------------
function IntroVideoPlayer({ videoUrl }: { videoUrl: string }) {
  const [expanded, setExpanded] = useState(false);
  const loadedRef = useRef(false);

  const player = useVideoPlayer(null, (p) => {
    p.loop = false;
  });

  const toggle = () => {
    const next = !expanded;
    if (next) {
      if (!loadedRef.current) {
        loadedRef.current = true;
        player.replace(videoUrl);
      }
      player.play();
    } else {
      player.pause();
    }
    setExpanded(next);
  };

  return (
    <View style={styles.videoSection}>
      <TouchableOpacity style={styles.videoRow} activeOpacity={0.7} onPress={toggle}>
        <View style={styles.videoRowLeft}>
          <Ionicons name="play-circle-outline" size={18} color={colors.accentLight} />
          <Text style={styles.videoLabel}>Intro video</Text>
        </View>
        <Ionicons
          name={expanded ? 'chevron-up' : 'chevron-down'}
          size={18}
          color={colors.textSecondary}
        />
      </TouchableOpacity>
      {expanded ? (
        <VideoView
          player={player}
          style={styles.videoPlayer}
          contentFit="contain"
          nativeControls
        />
      ) : null}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Pack card — same visual style as Library tab
// ---------------------------------------------------------------------------
function PackCard({
  pack,
  onPress,
}: {
  pack: LessonPack;
  onPress: () => void;
}) {
  const image = packImageSource(pack);
  const fraction = packProgressFraction(pack);

  return (
    <TouchableOpacity
      style={[styles.packCard, pack.is_active && styles.packCardActive]}
      activeOpacity={0.85}
      onPress={onPress}
    >
      <View style={styles.packImageWrap}>
        {image ? (
          <Image source={image as any} style={styles.packImage} resizeMode="cover" />
        ) : (
          <View style={styles.packImagePlaceholder}>
            <Ionicons name="fitness" size={22} color={colors.textMuted} />
          </View>
        )}
      </View>

      <View style={styles.packBody}>
        <View style={styles.packTopRow}>
          <Text style={styles.packTitle} numberOfLines={1}>{pack.title}</Text>
          {pack.completed && !isActivelyRedoing(pack) ? (
            <View style={styles.completedBadge}>
              <Ionicons name="checkmark-circle" size={11} color={colors.accentLight} />
              <Text style={styles.completedBadgeText}>DONE</Text>
            </View>
          ) : pack.is_active ? (
            <View style={styles.activeBadge}>
              <Text style={styles.activeBadgeText}>ACTIVE</Text>
            </View>
          ) : null}
        </View>
        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: `${fraction * 100}%` as any }]} />
        </View>
        <Text style={styles.progressLabel}>{packProgressLabel(pack)}</Text>
      </View>

      <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
    </TouchableOpacity>
  );
}

// ---------------------------------------------------------------------------
// Main screen
// ---------------------------------------------------------------------------
export default function CoachProfileScreen() {
  const { key: coachKey, coach: coachParam } = useLocalSearchParams<{
    key: string;
    coach: string;
  }>();
  const router = useRouter();

  const [coach] = useState<CoachProfile | null>(() => {
    if (!coachParam) return null;
    try {
      return JSON.parse(coachParam) as CoachProfile;
    } catch {
      return null;
    }
  });

  const [packs, setPacks] = useState<LessonPack[]>([]);
  const [packsLoading, setPacksLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [longBioExpanded, setLongBioExpanded] = useState(false);

  const fetchPacks = useCallback(
    async (isPull = false) => {
      if (!coach) {
        setPacksLoading(false);
        return;
      }
      if (isPull) {
        setRefreshing(true);
      } else {
        const cached = getCached<{ items: LessonPack[] }>(PACKS_CACHE_KEY);
        if (cached?.items) {
          const mine = cached.items.filter((p) => p.coach_name === coach.name);
          setPacks(mine);
          setPacksLoading(false);
        }
      }
      const { data } = await apiFetch<{ items: LessonPack[] }>(PACKS_CACHE_KEY);
      if (data?.items) {
        setCached(PACKS_CACHE_KEY, data);
        const mine = data.items.filter((p) => p.coach_name === coach.name);
        setPacks(mine);
      }
      setPacksLoading(false);
      setRefreshing(false);
    },
    [coach],
  );

  useFocusEffect(
    useCallback(() => {
      void fetchPacks();
    }, [fetchPacks]),
  );

  const handleBookCall = () => {
    if (!coach?.external_url) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    trackPartnerReferralCtaClicked({
      referral_partner_key: coach.coach_key ?? 'unknown',
      cta_placement: 'coach_profile',
      outbound_url: coach.external_url,
      coach_key: coach.coach_key ?? null,
      coach_name: coach.name ?? null,
    });
    void Linking.openURL(coach.external_url);
  };

  const handlePackPress = (pack: LessonPack) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push(`/pack/${pack.id}` as any);
  };

  const avatarSource = coach ? coachAvatarSource(coach.avatar_url, coach.name) : null;
  const hasLongBio =
    typeof coach?.long_bio === 'string' && coach.long_bio.trim().length > 0;

  return (
    <>
      <Stack.Screen
        options={{
          title: coach?.name ?? 'Coach Profile',
        }}
      />
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => void fetchPacks(true)}
            tintColor={colors.accent}
          />
        }
      >
        {/* ── Hero ── */}
        <View style={styles.heroSection}>
          {coach ? (
            <>
              <View style={styles.avatarContainer}>
                {avatarSource ? (
                  <Image
                    source={avatarSource as any}
                    style={styles.avatar}
                    resizeMode="cover"
                  />
                ) : (
                  <View style={styles.avatarPlaceholder}>
                    <Ionicons name="person" size={52} color={colors.textSecondary} />
                  </View>
                )}
              </View>
              <Text style={styles.coachName}>{coach.name}</Text>
              {coach.credentials ? (
                <Text style={styles.credentials}>{coach.credentials}</Text>
              ) : null}
            </>
          ) : (
            <View style={styles.heroSkeletonWrap}>
              <Skeleton width={110} height={110} borderRadius={55} style={styles.heroSkeletonAvatar} />
              <Skeleton width={160} height={26} borderRadius={8} style={styles.heroSkeletonName} />
              <Skeleton width={200} height={14} borderRadius={6} />
            </View>
          )}
        </View>

        {/* ── Book a call ── */}
        {coach?.external_url ? (
          <TouchableOpacity
            style={styles.bookCallBtn}
            activeOpacity={0.85}
            onPress={handleBookCall}
          >
            <Ionicons name="calendar-outline" size={16} color={colors.accentLight} />
            <Text style={styles.bookCallBtnText}>
              {coach.offer_label ?? 'Book a Call'}
            </Text>
          </TouchableOpacity>
        ) : null}

        {/* ── Bio / intro video / full bio — or skeleton when coach not yet resolved ── */}
        {!coach ? (
          <>
            <View style={styles.section}>
              <Skeleton width={60} height={11} borderRadius={6} style={styles.skeletonLabel} />
              <Skeleton width="100%" height={14} borderRadius={6} style={styles.skeletonLine} />
              <Skeleton width="85%" height={14} borderRadius={6} style={styles.skeletonLine} />
              <Skeleton width="70%" height={14} borderRadius={6} />
            </View>
            <View style={styles.section}>
              <Skeleton width="100%" height={14} borderRadius={6} style={styles.skeletonLine} />
              <Skeleton width="90%" height={14} borderRadius={6} style={styles.skeletonLine} />
              <Skeleton width="60%" height={14} borderRadius={6} />
            </View>
          </>
        ) : (
          <>
            {/* ── Bio ── */}
            {coach.bio ? (
              <View style={styles.section}>
                <Text style={styles.sectionHeader}>About</Text>
                <Text style={styles.bioText}>{coach.bio}</Text>
              </View>
            ) : null}

            {/* ── Intro video ── */}
            {coach.intro_video_url ? (
              <View style={styles.section}>
                <IntroVideoPlayer videoUrl={coach.intro_video_url} />
              </View>
            ) : null}

            {/* ── Long bio (expandable) ── */}
            {hasLongBio ? (
              <View style={styles.section}>
                <TouchableOpacity
                  style={styles.longBioToggle}
                  activeOpacity={0.7}
                  onPress={() => setLongBioExpanded((prev) => !prev)}
                >
                  <Text style={styles.sectionHeader}>Full Bio</Text>
                  <Ionicons
                    name={longBioExpanded ? 'chevron-up' : 'chevron-down'}
                    size={18}
                    color={colors.textSecondary}
                  />
                </TouchableOpacity>
                {longBioExpanded ? (
                  <Text style={[styles.bioText, styles.longBioText]}>{coach.long_bio}</Text>
                ) : null}
              </View>
            ) : null}
          </>
        )}

        {/* ── Lesson packs ── */}
        <View style={styles.packsSection}>
          <Text style={styles.packsSectionHeader}>Lesson Packs</Text>
          {packsLoading ? (
            <LessonPackListSkeleton />
          ) : packs.length === 0 ? (
            <View style={styles.emptyPacks}>
              <Ionicons name="library-outline" size={32} color={colors.textMuted} />
              <Text style={styles.emptyPacksText}>No lesson packs available</Text>
            </View>
          ) : (
            packs.map((pack) => (
              <PackCard
                key={pack.id}
                pack={pack}
                onPress={() => handlePackPress(pack)}
              />
            ))
          )}
        </View>
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  scroll: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scrollContent: {
    paddingBottom: 48,
  },

  // ── Hero
  heroSection: {
    alignItems: 'center',
    paddingTop: spacing.lg,
    paddingBottom: spacing.lg,
    paddingHorizontal: 24,
  },
  avatarContainer: {
    width: 110,
    height: 110,
    borderRadius: 55,
    borderWidth: 3,
    borderColor: 'rgba(167, 139, 250, 0.45)',
    overflow: 'hidden',
    marginBottom: spacing.md,
  },
  avatar: {
    width: '100%' as any,
    height: '100%' as any,
  },
  avatarPlaceholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceLight,
  },
  coachName: {
    fontSize: 26,
    fontWeight: '800',
    color: colors.textPrimary,
    textAlign: 'center',
    letterSpacing: 0.2,
    marginBottom: 6,
  },
  credentials: {
    fontSize: 13,
    fontWeight: '500',
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 19,
    paddingHorizontal: 16,
  },

  // ── Book a call
  bookCallBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginHorizontal: 24,
    marginBottom: spacing.lg,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: colors.accent,
    backgroundColor: colors.accentSubtle,
    paddingVertical: 14,
  },
  bookCallBtnText: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.accentLight,
    letterSpacing: 0.2,
  },

  // ── Hero skeleton
  heroSkeletonWrap: {
    alignItems: 'center',
    gap: 12,
  },
  heroSkeletonAvatar: {
    marginBottom: 4,
  },
  heroSkeletonName: {
    marginBottom: 2,
  },
  skeletonLabel: {
    marginBottom: spacing.sm,
  },
  skeletonLine: {
    marginBottom: 8,
  },

  // ── Sections
  section: {
    marginHorizontal: 24,
    marginBottom: spacing.lg,
    backgroundColor: colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
  },
  sectionHeader: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.1,
    color: colors.textMuted,
    marginBottom: spacing.sm,
    textTransform: 'uppercase',
  },
  bioText: {
    fontSize: 15,
    color: colors.textSecondary,
    lineHeight: 23,
  },
  longBioText: {
    marginTop: spacing.sm,
  },
  longBioToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },

  // ── Intro video
  videoSection: {
    // no extra margin — lives inside a section card
  },
  videoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  videoRowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  videoLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  videoPlayer: {
    width: '100%' as any,
    height: 200,
    borderRadius: 10,
    marginTop: spacing.md,
    backgroundColor: '#000',
  },

  // ── Packs section
  packsSection: {
    marginHorizontal: 24,
    marginBottom: spacing.lg,
  },
  packsSectionHeader: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.1,
    color: colors.textMuted,
    marginBottom: 12,
    textTransform: 'uppercase',
  },
  packCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    marginBottom: 10,
    gap: 12,
  },
  packCardActive: {
    borderColor: 'rgba(167, 139, 250, 0.4)',
  },
  packImageWrap: {
    width: 54,
    height: 54,
    borderRadius: 12,
    overflow: 'hidden',
    flexShrink: 0,
  },
  packImage: {
    width: '100%' as any,
    height: '100%' as any,
  },
  packImagePlaceholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceLight,
  },
  packBody: {
    flex: 1,
    gap: 5,
  },
  packTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  packTitle: {
    flex: 1,
    fontSize: 15,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  progressTrack: {
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.surfaceLight,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%' as any,
    borderRadius: 2,
    backgroundColor: colors.accent,
  },
  progressLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.textMuted,
  },
  activeBadge: {
    backgroundColor: colors.accentSubtle,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  activeBadgeText: {
    fontSize: 9,
    fontWeight: '800',
    color: colors.accentLight,
    letterSpacing: 0.6,
  },
  completedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: colors.accentSubtle,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  completedBadgeText: {
    fontSize: 9,
    fontWeight: '800',
    color: colors.accentLight,
    letterSpacing: 0.6,
  },
  emptyPacks: {
    alignItems: 'center',
    paddingVertical: spacing.xl,
    gap: 10,
  },
  emptyPacksText: {
    fontSize: 14,
    color: colors.textMuted,
    textAlign: 'center',
  },
});
