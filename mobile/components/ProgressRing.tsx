import { useState } from 'react';
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { colors } from '@/lib/theme';

export type ScoreDelta = { amount: number; reason: string };

type Props = {
  percentage: number;
  label: string;
  delta?: ScoreDelta | null;
  size?: number;
  strokeWidth?: number;
  ringColor?: string;
};

export function ProgressRing({
  percentage,
  label,
  delta,
  size = 72,
  strokeWidth = 5,
  ringColor = colors.accent,
}: Props) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const pct = Math.min(Math.max(percentage, 0), 100);

  const hasDelta = delta != null && delta.amount !== 0;
  const deltaAbs = hasDelta ? Math.abs(delta!.amount) : 0;
  const isGain = hasDelta && delta!.amount > 0;

  const deltaStart = pct;
  const deltaEnd = Math.min(100, pct + deltaAbs);
  const deltaPct = deltaEnd - deltaStart;

  const deltaDash = circumference * (deltaPct / 100);
  const deltaOffset = circumference * (1 - deltaStart / 100);

  const dashOffset = circumference * (1 - pct / 100);

  const [tooltipVisible, setTooltipVisible] = useState(false);

  // Edge states
  const isAtCap = isGain && deltaEnd >= 100;
  const isAtFloor = !isGain && hasDelta && pct <= 0;

  const deltaColor = isGain ? colors.success : colors.error;

  // Floor: red-tinted track so the empty ring reads as "hit the bottom"
  const trackStroke = isAtFloor ? 'rgba(239,68,68,0.28)' : colors.ringTrack;

  // Floor: suppress the misleading red arc that floats on an empty ring
  const showDeltaArc = hasDelta && deltaPct > 0 && !isAtFloor;

  // Center % text color: ring color when maxed (glowing), dim red when floored
  const pctColor = isAtCap ? ringColor : isAtFloor ? 'rgba(239,68,68,0.65)' : colors.textPrimary;

  // Delta label with edge-state suffix
  const deltaSign = hasDelta && delta!.amount >= 0 ? '+' : '';
  const deltaMag = hasDelta ? (Math.round(delta!.amount * 10) / 10).toFixed(1) : '0';
  const deltaSuffix = isAtCap ? ' max' : isAtFloor ? ' min' : '';
  const deltaLabel = `${deltaSign}${deltaMag}${deltaSuffix}`;

  return (
    <>
      <TouchableOpacity
        style={styles.wrapper}
        activeOpacity={0.7}
        onPress={hasDelta ? () => setTooltipVisible(true) : undefined}
        disabled={!hasDelta}
      >
        <View style={{ width: size, height: size }}>
          <Svg width={size} height={size}>
            {/* Track — red-tinted when floored */}
            <Circle
              cx={size / 2}
              cy={size / 2}
              r={radius}
              stroke={trackStroke}
              strokeWidth={strokeWidth}
              fill="none"
            />
            {/* Main fill */}
            <Circle
              cx={size / 2}
              cy={size / 2}
              r={radius}
              stroke={ringColor}
              strokeWidth={strokeWidth}
              fill="none"
              strokeDasharray={`${circumference}`}
              strokeDashoffset={dashOffset}
              strokeLinecap="round"
              transform={`rotate(-90 ${size / 2} ${size / 2})`}
            />
            {/* Cap glow: thin white halo on top of a fully filled ring */}
            {isAtCap && (
              <Circle
                cx={size / 2}
                cy={size / 2}
                r={radius}
                stroke="rgba(255,255,255,0.2)"
                strokeWidth={strokeWidth + 4}
                fill="none"
                strokeDasharray={`${circumference}`}
                strokeDashoffset={0}
                transform={`rotate(-90 ${size / 2} ${size / 2})`}
              />
            )}
          </Svg>
          {/* Delta overlay — suppressed for floor to avoid arc on an empty ring */}
          {showDeltaArc && (
            <View style={StyleSheet.absoluteFill} pointerEvents="none">
              <Svg width={size} height={size}>
                <Circle
                  cx={size / 2}
                  cy={size / 2}
                  r={radius}
                  stroke={deltaColor}
                  strokeWidth={strokeWidth}
                  fill="none"
                  strokeDasharray={`${deltaDash} ${circumference - deltaDash}`}
                  strokeDashoffset={deltaOffset}
                  strokeLinecap="round"
                  transform={`rotate(-90 ${size / 2} ${size / 2})`}
                />
              </Svg>
            </View>
          )}
          <View style={[StyleSheet.absoluteFill, styles.centerLabel]}>
            <Text style={[styles.pctText, { color: pctColor }]}>
              {Math.round(isGain ? deltaEnd : pct)}%
            </Text>
            {hasDelta && (
              <Text
                style={[styles.deltaText, { color: isAtFloor ? 'rgba(239,68,68,0.55)' : deltaColor }]}
                numberOfLines={1}
              >
                {deltaLabel}
              </Text>
            )}
          </View>
        </View>
        <Text style={styles.catLabel}>{label}</Text>
      </TouchableOpacity>

      {hasDelta && (
        <Modal
          visible={tooltipVisible}
          transparent
          animationType="fade"
          onRequestClose={() => setTooltipVisible(false)}
        >
          <Pressable
            style={styles.modalOverlay}
            onPress={() => setTooltipVisible(false)}
          >
            <View style={styles.tooltip}>
              <Text style={styles.tooltipTitle}>{label}</Text>
              <Text style={[styles.tooltipDelta, { color: isAtFloor ? 'rgba(239,68,68,0.7)' : deltaColor }]}>
                {deltaLabel}%
              </Text>
              <Text style={styles.tooltipReason}>{delta!.reason}</Text>
              {(isAtCap || isAtFloor) && (
                <Text style={[styles.tooltipEdgeNote, { color: isAtCap ? ringColor : 'rgba(239,68,68,0.7)' }]}>
                  {isAtCap ? 'Score is at maximum (100)' : 'Score is at minimum (0)'}
                </Text>
              )}
              <TouchableOpacity
                style={[styles.tooltipClose, isAtCap && { backgroundColor: ringColor }]}
                onPress={() => setTooltipVisible(false)}
              >
                <Text style={styles.tooltipCloseText}>OK</Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Modal>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  wrapper: { alignItems: 'center' },
  centerLabel: { alignItems: 'center', justifyContent: 'center' },
  pctText: {
    color: colors.textPrimary,
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: 0.3,
  },
  deltaText: {
    fontSize: 9,
    fontWeight: '700',
    marginTop: 1,
  },
  catLabel: {
    color: colors.textSecondary,
    fontSize: 11,
    fontWeight: '500',
    marginTop: 8,
    letterSpacing: 0.2,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  tooltip: {
    backgroundColor: colors.surface,
    borderRadius: 14,
    padding: 24,
    width: 280,
    alignItems: 'center',
  },
  tooltipTitle: {
    color: colors.textPrimary,
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 8,
  },
  tooltipDelta: {
    fontSize: 28,
    fontWeight: '800',
    marginBottom: 12,
  },
  tooltipReason: {
    color: colors.textSecondary,
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 12,
  },
  tooltipEdgeNote: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.3,
    textAlign: 'center',
    marginBottom: 14,
    opacity: 0.85,
  },
  tooltipClose: {
    paddingHorizontal: 28,
    paddingVertical: 10,
    backgroundColor: colors.accent,
    borderRadius: 8,
  },
  tooltipCloseText: {
    color: colors.white,
    fontWeight: '700',
    fontSize: 14,
  },
});
