// UX-PERF: skeleton loader — shared pulse component + screen-specific skeletons.
// To revert: delete this file, replace *Skeleton imports with ActivityIndicator.
import { useEffect, useRef } from 'react';
import { Animated, StyleSheet, View, type ViewStyle } from 'react-native';
import { colors, spacing } from '@/lib/theme';

type SkeletonProps = {
  width?: number | `${number}%`;
  height?: number;
  borderRadius?: number;
  style?: ViewStyle;
};

export function Skeleton({ width = '100%', height = 16, borderRadius = 8, style }: SkeletonProps) {
  const opacity = useRef(new Animated.Value(0.35)).current;

  useEffect(() => {
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 0.7, duration: 900, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.35, duration: 900, useNativeDriver: true }),
      ]),
    );
    pulse.start();
    return () => pulse.stop();
  }, [opacity]);

  return (
    <Animated.View
      style={[
        {
          width: width as any,
          height,
          borderRadius,
          backgroundColor: colors.surfaceLight,
          opacity,
        },
        style,
      ]}
    />
  );
}

/**
 * Matches the workout card inner layout on Home:
 * header → hero photo → title + program line → action buttons.
 */
export function WorkoutCardSkeleton() {
  return (
    <View style={wcs.container}>
      {/* Full-bleed hero (header is overlaid on the photo in the real card) —
          negative margins match the card's top + horizontal padding */}
      <View style={wcs.heroBleed}>
        <Skeleton width="100%" height={285} borderRadius={0} />
      </View>
      <View style={wcs.metaSection}>
        <Skeleton width="65%" height={22} borderRadius={8} />
        <Skeleton width="50%" height={14} borderRadius={6} />
      </View>
      <View style={wcs.actionRow}>
        <Skeleton width="48%" height={48} borderRadius={14} />
        <Skeleton width="48%" height={48} borderRadius={14} />
      </View>
    </View>
  );
}

const wcs = StyleSheet.create({
  container: {
    width: '100%',
  },
  heroBleed: {
    marginHorizontal: -spacing.xl,
    marginTop: -24,
  },
  metaSection: {
    alignItems: 'center',
    paddingVertical: 14,
    gap: 8,
  },
  actionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
});

/** Program cards for the Programs screen — mirrors the two CTA buttons per card. */
export function ProgramListSkeleton() {
  return (
    <View style={pls.container}>
      {[0, 1].map((i) => (
        <View key={i} style={pls.cardOuter}>
          <View style={pls.cardInner}>
            <View style={pls.heroBleed}>
              <Skeleton width="100%" height={285} borderRadius={0} />
            </View>
            <View style={pls.metaSection}>
              <Skeleton width="65%" height={22} borderRadius={8} />
            </View>
            {/* Primary CTA ("Make this my pack" / "Resume") */}
            <Skeleton width="100%" height={48} borderRadius={14} style={pls.btn} />
            {/* Secondary CTA ("Try Day 1") */}
            <Skeleton width="100%" height={40} borderRadius={12} />
          </View>
        </View>
      ))}
    </View>
  );
}

const pls = StyleSheet.create({
  container: { gap: spacing.md },
  cardOuter: {
    backgroundColor: colors.surface,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  cardInner: {
    paddingHorizontal: spacing.xl,
    paddingTop: 24,
    paddingBottom: 24,
  },
  heroBleed: {
    marginHorizontal: -spacing.xl,
    marginTop: -24,
  },
  metaSection: {
    alignItems: 'center',
    paddingVertical: 14,
  },
  btn: { marginBottom: 10 },
});

/** Lesson-pack cards on the Library tab — leading image + title/progress lines. */
export function LessonPackListSkeleton() {
  return (
    <View style={lps.container}>
      {[0, 1].map((i) => (
        <View key={i} style={lps.card}>
          {/* Rounded-rect avatar (borderRadius 14 matches packImageWrap in library.tsx) */}
          <Skeleton width={56} height={56} borderRadius={14} />
          <View style={lps.body}>
            <Skeleton width="40%" height={11} borderRadius={6} style={lps.coachLine} />
            <Skeleton width="70%" height={16} borderRadius={6} style={lps.titleLine} />
            {/* Progress bar */}
            <Skeleton width="100%" height={6} borderRadius={3} style={lps.progressBar} />
            {/* Progress label ("Day 5 of 30") */}
            <Skeleton width="35%" height={11} borderRadius={6} style={lps.progressLabel} />
          </View>
        </View>
      ))}
    </View>
  );
}

const lps = StyleSheet.create({
  container: { gap: spacing.sm },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
  },
  body: { flex: 1 },
  coachLine: { marginBottom: 6 },
  titleLine: { marginBottom: 10 },
  progressBar: { marginBottom: 6 },
  progressLabel: {},
});

/** Compact "More programs" rail skeleton for Home (header + two rows). */
export function MoreProgramsSkeleton() {
  return (
    <View style={mps.card}>
      <Skeleton width={210} height={15} borderRadius={8} style={mps.header} />
      {[0, 1].map((i) => (
        <View key={i} style={mps.row}>
          <Skeleton width={48} height={48} borderRadius={999} />
          <View style={mps.rowText}>
            <Skeleton width={130} height={14} borderRadius={6} style={mps.rowLine} />
            <Skeleton width={170} height={12} borderRadius={6} />
          </View>
        </View>
      ))}
      <Skeleton width="100%" height={46} borderRadius={14} style={mps.btn} />
    </View>
  );
}

const mps = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    marginTop: spacing.md,
    marginBottom: spacing.md,
  },
  header: {
    alignSelf: 'center',
    marginBottom: spacing.md,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: 'rgba(139, 92, 246, 0.07)',
    borderRadius: 16,
    padding: 10,
    marginBottom: 10,
  },
  rowText: { flex: 1 },
  rowLine: { marginBottom: 6 },
  btn: { marginTop: 4 },
});

/**
 * 3 card-shaped rectangles for journal / session-log list screens.
 * Order matches real card: title → date → body preview.
 */
export function JournalListSkeleton() {
  return (
    <View style={jls.container}>
      {[0, 1, 2].map((i) => (
        <View key={i} style={jls.card}>
          {/* Title line (lesson title / "Check-In") */}
          <Skeleton width="70%" height={15} borderRadius={6} style={jls.title} />
          {/* Date + time */}
          <Skeleton width="45%" height={11} borderRadius={6} style={jls.date} />
          {/* Body preview */}
          <Skeleton width="90%" height={13} borderRadius={6} style={jls.line} />
          <Skeleton width="65%" height={13} borderRadius={6} />
        </View>
      ))}
    </View>
  );
}

const jls = StyleSheet.create({
  container: { marginTop: 20, gap: 12, paddingHorizontal: 4 },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
  },
  title: { marginBottom: 10 },
  date: { marginBottom: 12 },
  line: { marginBottom: 8 },
});

/**
 * Content skeleton for a single journal entry / WOD day detail.
 * Order matches real screen: title → date → body lines.
 */
export function JournalDetailSkeleton() {
  return (
    <View style={jds.container}>
      {/* Lesson title */}
      <Skeleton width="75%" height={18} borderRadius={6} style={jds.title} />
      {/* Date + time */}
      <Skeleton width="45%" height={12} borderRadius={6} style={jds.date} />
      {/* Body paragraphs */}
      <Skeleton width="100%" height={14} borderRadius={6} style={jds.line} />
      <Skeleton width="90%" height={14} borderRadius={6} style={jds.line} />
      <Skeleton width="75%" height={14} borderRadius={6} style={jds.line} />
      <Skeleton width="55%" height={14} borderRadius={6} />
    </View>
  );
}

const jds = StyleSheet.create({
  container: { marginTop: 20, paddingHorizontal: 20 },
  title: { marginBottom: 12 },
  date: { marginBottom: 20 },
  line: { marginBottom: 10 },
});

/**
 * Lesson "ready" screen skeleton — mirrors the readyCard layout:
 * title + optional program line + begin button.
 * Used while phase === 'loading' in the lesson player.
 */
export function LessonReadySkeleton() {
  return (
    <View style={lrss.root}>
      <View style={lrss.card}>
        <Skeleton width="70%" height={22} borderRadius={8} style={lrss.title} />
        <Skeleton width="45%" height={14} borderRadius={6} style={lrss.sub} />
        <Skeleton width="85%" height={14} borderRadius={6} style={lrss.line} />
        <Skeleton width="60%" height={14} borderRadius={6} style={lrss.line} />
        <Skeleton width="100%" height={52} borderRadius={14} style={lrss.btn} />
      </View>
    </View>
  );
}

const lrss = StyleSheet.create({
  root: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xl,
  },
  card: {
    width: '100%',
    maxWidth: 400,
    alignSelf: 'center',
    backgroundColor: colors.surface,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    alignItems: 'center',
  },
  title: { marginBottom: spacing.sm },
  sub: { marginBottom: spacing.md },
  line: { marginBottom: 8 },
  btn: { marginTop: spacing.md },
});

/**
 * Invite / referral page skeleton — mirrors:
 * hero card → section label → how-it-works card → section label → teammates card.
 */
export function ReferralSkeleton() {
  return (
    <View style={rss.container}>
      {/* Hero card */}
      <View style={rss.heroCard}>
        <Skeleton width={40} height={40} borderRadius={20} style={rss.heroIcon} />
        <Skeleton width="55%" height={20} borderRadius={8} style={rss.heroTitle} />
        <Skeleton width="80%" height={14} borderRadius={6} style={rss.heroLine} />
        <Skeleton width="65%" height={14} borderRadius={6} />
      </View>

      {/* How it works */}
      <Skeleton width="30%" height={11} borderRadius={6} style={rss.label} />
      <View style={rss.card}>
        <Skeleton width="90%" height={14} borderRadius={6} style={rss.cardLine} />
        <Skeleton width="75%" height={14} borderRadius={6} />
      </View>

      {/* Teammates */}
      <Skeleton width="28%" height={11} borderRadius={6} style={rss.label} />
      <View style={rss.card}>
        <Skeleton width="60%" height={14} borderRadius={6} />
      </View>

      {/* Share button */}
      <Skeleton width="100%" height={52} borderRadius={12} style={rss.btn} />
    </View>
  );
}

const rss = StyleSheet.create({
  container: { paddingHorizontal: 20, paddingTop: spacing.lg },
  heroCard: {
    backgroundColor: colors.surface,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 24,
    marginBottom: 28,
    alignItems: 'center',
  },
  heroIcon: { marginBottom: 12 },
  heroTitle: { marginBottom: 10 },
  heroLine: { marginBottom: 8 },
  label: { marginBottom: 12, marginLeft: 4 },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
    marginBottom: 16,
  },
  cardLine: { marginBottom: 8 },
  btn: { marginTop: 8 },
});

/** 3 lesson card skeletons for category / lesson-list screens. */
export function LessonListSkeleton() {
  return (
    <View style={lls.container}>
      {[0, 1, 2].map((i) => (
        <View key={i} style={lls.card}>
          <View style={lls.row}>
            <View style={lls.left}>
              <Skeleton width="80%" height={16} style={lls.title} />
              <Skeleton width="30%" height={12} borderRadius={6} />
            </View>
            <Skeleton width={52} height={24} borderRadius={8} />
          </View>
        </View>
      ))}
    </View>
  );
}

const lls = StyleSheet.create({
  container: { gap: 12 },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  left: {
    flex: 1,
    minHeight: 38,
  },
  title: { marginBottom: 8 },
});
