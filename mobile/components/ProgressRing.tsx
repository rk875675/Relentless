import { useEffect, useRef, useState } from 'react';
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

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

function lerpHex(from: string, to: string, t: number): string {
  if (!from.startsWith('#') || !to.startsWith('#')) return to;
  const [r1, g1, b1] = hexToRgb(from);
  const [r2, g2, b2] = hexToRgb(to);
  const r = Math.round(r1 + (r2 - r1) * t);
  const g = Math.round(g1 + (g2 - g1) * t);
  const b = Math.round(b1 + (b2 - b1) * t);
  return `rgb(${r},${g},${b})`;
}

type Props = {
  percentage: number;
  label: string;
  delta?: ScoreDelta | null;
  size?: number;
  strokeWidth?: number;
  ringColor?: string;
  /** Called once when the merge animation finishes — parent should clear the delta. */
  onDeltaConsumed?: () => void;
};

export function ProgressRing({
  percentage,
  label,
  delta,
  size = 72,
  strokeWidth = 5,
  ringColor = colors.accent,
  onDeltaConsumed,
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

  // Arc entrance animation: grows from 0 → 1 when delta first appears
  const [arcProgress, setArcProgress] = useState(0);
  // Gain merge: 0 = success green, 1 = ringColor (starts 3s after entrance finishes)
  const [mergeProgress, setMergeProgress] = useState(0);
  const animFrameRef = useRef<ReturnType<typeof requestAnimationFrame> | null>(null);
  const mergeFrameRef = useRef<ReturnType<typeof requestAnimationFrame> | null>(null);
  const mergeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onDeltaConsumedRef = useRef(onDeltaConsumed);
  onDeltaConsumedRef.current = onDeltaConsumed;

  useEffect(() => {
    if (animFrameRef.current != null) { cancelAnimationFrame(animFrameRef.current); animFrameRef.current = null; }
    if (mergeFrameRef.current != null) { cancelAnimationFrame(mergeFrameRef.current); mergeFrameRef.current = null; }
    if (mergeTimerRef.current != null) { clearTimeout(mergeTimerRef.current); mergeTimerRef.current = null; }

    if (delta == null || delta.amount === 0) {
      setArcProgress(0);
      setMergeProgress(0);
      return;
    }

    setArcProgress(0);
    setMergeProgress(0);

    const startTime = Date.now();
    const DURATION = 900;
    const tick = () => {
      const t = Math.min((Date.now() - startTime) / DURATION, 1);
      setArcProgress(1 - Math.pow(1 - t, 3)); // ease-out cubic
      if (t < 1) {
        animFrameRef.current = requestAnimationFrame(tick);
      } else {
        // Entrance done — wait 3s then blend arc color into the ring's own color
        mergeTimerRef.current = setTimeout(() => {
          mergeTimerRef.current = null;
          const mergeStart = Date.now();
          const MERGE_DURATION = 700;
          const mergeTick = () => {
            const mt = Math.min((Date.now() - mergeStart) / MERGE_DURATION, 1);
            setMergeProgress(1 - Math.pow(1 - mt, 2)); // ease-out quad
            if (mt < 1) {
              mergeFrameRef.current = requestAnimationFrame(mergeTick);
            } else {
              mergeFrameRef.current = null;
              onDeltaConsumedRef.current?.();
            }
          };
          mergeFrameRef.current = requestAnimationFrame(mergeTick);
        }, 3000);
      }
    };
    animFrameRef.current = requestAnimationFrame(tick);

    return () => {
      if (animFrameRef.current != null) { cancelAnimationFrame(animFrameRef.current); animFrameRef.current = null; }
      if (mergeFrameRef.current != null) { cancelAnimationFrame(mergeFrameRef.current); mergeFrameRef.current = null; }
      if (mergeTimerRef.current != null) { clearTimeout(mergeTimerRef.current); mergeTimerRef.current = null; }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [delta?.amount]);

  // Edge states
  const isAtCap = isGain && deltaEnd >= 100;
  const isAtFloor = !isGain && hasDelta && pct <= 0;

  const deltaColor = isGain ? colors.success : colors.error;
  // Arc starts as gain/loss color then blends into the ring's own color after merge delay
  const arcStroke = lerpHex(deltaColor, ringColor, mergeProgress);

  // Floor: red-tinted track so the empty ring reads as "hit the bottom"
  const trackStroke = isAtFloor ? 'rgba(239,68,68,0.28)' : colors.ringTrack;

  // Floor: suppress the misleading red arc that floats on an empty ring
  const showDeltaArc = hasDelta && deltaPct > 0 && !isAtFloor;

  // Center % text color: ring color when maxed (glowing), dim red when floored
  const pctColor = isAtCap ? ringColor : isAtFloor ? 'rgba(239,68,68,0.65)' : colors.textPrimary;

  // Delta label with edge-state suffix
  const deltaSign = hasDelta && delta!.amount >= 0 ? '+' : '';
  const deltaMag = hasDelta ? Math.round(delta!.amount) : 0;
  const deltaSuffix = isAtCap ? ' max' : isAtFloor ? ' min' : '';
  const deltaLabel = `${deltaSign}${deltaMag}%${deltaSuffix}`;

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
                  stroke={arcStroke}
                  strokeWidth={strokeWidth}
                  fill="none"
                  strokeDasharray={[deltaDash * arcProgress, circumference - deltaDash * arcProgress]}
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
                style={[styles.deltaText, { color: isAtFloor ? 'rgba(239,68,68,0.55)' : deltaColor, opacity: 1 - mergeProgress }]}
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
                {deltaLabel}
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
