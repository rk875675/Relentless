import { View } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';

type Props = {
  size: number;
  strokeWidth: number;
  colors: string[];
};

/** Polar coords with 0° at top, clockwise (matches breath UI). */
function arcPath(cx: number, cy: number, r: number, startDeg: number, endDeg: number): string {
  const rad = (deg: number) => ((deg - 90) * Math.PI) / 180;
  const x1 = cx + r * Math.cos(rad(startDeg));
  const y1 = cy + r * Math.sin(rad(startDeg));
  const x2 = cx + r * Math.cos(rad(endDeg));
  const y2 = cy + r * Math.sin(rad(endDeg));
  const sweep = endDeg - startDeg;
  const largeArc = Math.abs(sweep) > 180 ? 1 : 0;
  return `M ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2}`;
}

/**
 * Circular stroke in equal angular segments, one color per MAC pillar segment.
 * For a single color, draws a full ring (stroke only).
 */
export default function MacAlternatingRing({ size, strokeWidth, colors }: Props) {
  if (colors.length === 0) return null;
  const cx = size / 2;
  const cy = size / 2;
  const r = Math.max(1, size / 2 - strokeWidth / 2 - 1);

  if (colors.length === 1) {
    const c = colors[0]!;
    return (
      <View style={{ width: size, height: size }} pointerEvents="none">
        <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
          <Circle cx={cx} cy={cy} r={r} stroke={c} strokeWidth={strokeWidth} fill="none" />
        </Svg>
      </View>
    );
  }

  const n = colors.length;
  const sweep = 360 / n;

  return (
    <View style={{ width: size, height: size }} pointerEvents="none">
      <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        {colors.map((c, i) => {
          const start = i * sweep;
          const end = (i + 1) * sweep;
          const d = arcPath(cx, cy, r, start, end);
          return (
            <Path
              key={i}
              d={d}
              stroke={c}
              strokeWidth={strokeWidth}
              fill="none"
              strokeLinecap="butt"
            />
          );
        })}
      </Svg>
    </View>
  );
}
