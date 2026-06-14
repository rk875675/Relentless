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

/** 2 centered program cards for the Programs screen. */
export function ProgramListSkeleton() {
  return (
    <View style={pls.container}>
      {[0, 1].map((i) => (
        <View key={i} style={pls.card}>
          <Skeleton width={84} height={84} borderRadius={999} style={pls.avatar} />
          <Skeleton width={150} height={16} borderRadius={8} style={pls.coach} />
          <Skeleton width={190} height={14} borderRadius={6} />
        </View>
      ))}
    </View>
  );
}

const pls = StyleSheet.create({
  container: { gap: spacing.md },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    alignItems: 'center',
  },
  avatar: { marginBottom: spacing.md },
  coach: { marginBottom: 8 },
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

/** 3 card-shaped rectangles for journal / session-log list screens. */
export function JournalListSkeleton() {
  return (
    <View style={jls.container}>
      {[0, 1, 2].map((i) => (
        <View key={i} style={jls.card}>
          <Skeleton width="45%" height={12} borderRadius={6} style={jls.date} />
          <Skeleton width="85%" height={14} style={jls.line1} />
          <Skeleton width="60%" height={14} />
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
  date: { marginBottom: 12 },
  line1: { marginBottom: 8 },
});

/** Content skeleton for a single journal entry / WOD day detail. */
export function JournalDetailSkeleton() {
  return (
    <View style={jds.container}>
      <Skeleton width="40%" height={12} borderRadius={6} style={jds.date} />
      <Skeleton width="90%" height={16} style={jds.line} />
      <Skeleton width="100%" height={16} style={jds.line} />
      <Skeleton width="75%" height={16} style={jds.line} />
      <Skeleton width="60%" height={16} />
    </View>
  );
}

const jds = StyleSheet.create({
  container: { marginTop: 20, paddingHorizontal: 4 },
  date: { marginBottom: 16 },
  line: { marginBottom: 10 },
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
