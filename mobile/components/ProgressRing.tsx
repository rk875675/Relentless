import { View, Text, StyleSheet } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { colors } from '@/lib/theme';

type Props = {
  percentage: number;
  label: string;
  size?: number;
  strokeWidth?: number;
};

export function ProgressRing({
  percentage,
  label,
  size = 64,
  strokeWidth = 5,
}: Props) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const pct = Math.min(Math.max(percentage, 0), 100);
  const dashOffset = circumference * (1 - pct / 100);

  return (
    <View style={styles.wrapper}>
      <View style={{ width: size, height: size }}>
        <Svg width={size} height={size}>
          <Circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke={colors.ringTrack}
            strokeWidth={strokeWidth}
            fill="none"
          />
          <Circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke={colors.accentLight}
            strokeWidth={strokeWidth}
            fill="none"
            strokeDasharray={`${circumference}`}
            strokeDashoffset={dashOffset}
            strokeLinecap="round"
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
          />
        </Svg>
        <View style={[StyleSheet.absoluteFill, styles.centerLabel]}>
          <Text style={styles.pctText}>{Math.round(pct)}%</Text>
        </View>
      </View>
      <Text style={styles.catLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { alignItems: 'center' },
  centerLabel: { alignItems: 'center', justifyContent: 'center' },
  pctText: { color: colors.white, fontSize: 12, fontWeight: '700' },
  catLabel: { color: colors.textSecondary, fontSize: 11, marginTop: 6 },
});
