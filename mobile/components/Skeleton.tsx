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
 * pill label → title line → meta row (day badge + duration pill).
 */
export function WorkoutCardSkeleton() {
  return (
    <View style={wcs.container}>
      <Skeleton width={140} height={14} borderRadius={12} style={wcs.pill} />
      <Skeleton width="70%" height={18} style={wcs.title} />
      <View style={wcs.metaRow}>
        <Skeleton width={80} height={14} borderRadius={6} />
        <Skeleton width={52} height={24} borderRadius={12} />
      </View>
    </View>
  );
}

const wcs = StyleSheet.create({
  container: {
    width: '100%',
    minHeight: 116,
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  pill: { marginBottom: 12 },
  title: { marginBottom: 16 },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
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
