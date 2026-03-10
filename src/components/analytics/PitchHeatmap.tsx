import React, { useMemo } from 'react';
import { View, StyleSheet } from 'react-native';
import Svg, {
  Rect,
  Circle,
  Line,
  Text as SvgText,
} from 'react-native-svg';
import type { PitchLog, PitchResult } from '../../types/game';
import { Colors } from '../../constants/theme';

// ── Canvas constants (same as main.tsx pitch canvas) ──────────────────────────
const SZ_W = 112;
const SZ_H = Math.round(SZ_W * 7 / 4); // 196
const BALL_PAD_H = 52;
const BALL_PAD_V = 44;
const CANVAS_W = SZ_W + 2 * BALL_PAD_H; // 216
const CANVAS_H = SZ_H + 2 * BALL_PAD_V; // 284
const SZ_LEFT = BALL_PAD_H;
const SZ_TOP = BALL_PAD_V;
const SZ_RIGHT = BALL_PAD_H + SZ_W;
const SZ_BOT = BALL_PAD_V + SZ_H;
const CELL_W = SZ_W / 3;
const CELL_H = SZ_H / 3;

// ── Helpers ────────────────────────────────────────────────────────────────────

function getZoneBounds(zone: string): { x: number; y: number; w: number; h: number } | null {
  const n = parseInt(zone, 10);
  if (isNaN(n) || n < 1 || n > 9) return null;
  const col = (n - 1) % 3;
  const row = Math.floor((n - 1) / 3);
  return { x: SZ_LEFT + col * CELL_W, y: SZ_TOP + row * CELL_H, w: CELL_W, h: CELL_H };
}

function getBallZoneBounds(zone: string): { x: number; y: number; w: number; h: number } | null {
  switch (zone) {
    case 'BH': return { x: SZ_LEFT, y: 0, w: SZ_W, h: BALL_PAD_V };
    case 'BL': return { x: SZ_LEFT, y: SZ_BOT, w: SZ_W, h: BALL_PAD_V };
    case 'BI': return { x: 0, y: SZ_TOP, w: BALL_PAD_H, h: SZ_H };
    case 'BO': return { x: SZ_RIGHT, y: SZ_TOP, w: BALL_PAD_H, h: SZ_H };
    default: return null;
  }
}

function heatColor(count: number, max: number): string {
  if (count === 0 || max === 0) return 'transparent';
  const t = count / max;
  if (t < 0.15) return 'rgba(56,161,243,0.10)';
  if (t < 0.30) return 'rgba(56,161,243,0.25)';
  if (t < 0.50) return 'rgba(56,161,243,0.45)';
  if (t < 0.70) return 'rgba(56,161,243,0.65)';
  if (t < 0.85) return 'rgba(56,161,243,0.82)';
  return 'rgba(56,161,243,0.95)';
}

function pitchDotColor(result: PitchResult): string {
  switch (result) {
    case 'strike_called':   return '#38A1F3';
    case 'strike_swinging': return '#1A6BBF';
    case 'ball':            return '#8E8E93';
    case 'foul':
    case 'foul_tip':        return '#D4AF37';
    case 'in_play':         return '#34C759';
    case 'hit_by_pitch':    return '#C41E3A';
    default:                return '#8E8E93';
  }
}

const ALL_ZONES = ['1','2','3','4','5','6','7','8','9','BH','BL','BI','BO'];

// ── Component ──────────────────────────────────────────────────────────────────

interface Props {
  pitchLogs: PitchLog[];
}

export default function PitchHeatmap({ pitchLogs }: Props) {
  const zoneCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const p of pitchLogs) {
      m.set(p.zone, (m.get(p.zone) ?? 0) + 1);
    }
    return m;
  }, [pitchLogs]);

  const maxCount = useMemo(
    () => Math.max(...Array.from(zoneCounts.values()), 1),
    [zoneCounts],
  );

  const coordPitches = useMemo(
    () => pitchLogs.filter((p) => p.pitchX != null && p.pitchY != null),
    [pitchLogs],
  );

  return (
    <View style={styles.container}>
      <Svg width={CANVAS_W} height={CANVAS_H} viewBox={`0 0 ${CANVAS_W} ${CANVAS_H}`}>
        {/* Background */}
        <Rect x={0} y={0} width={CANVAS_W} height={CANVAS_H} fill={Colors.surfaceGray} />

        {/* Heat fills per zone */}
        {ALL_ZONES.map((zone) => {
          const count = zoneCounts.get(zone) ?? 0;
          const color = heatColor(count, maxCount);
          if (color === 'transparent') return null;
          const bounds = parseInt(zone, 10) >= 1 && parseInt(zone, 10) <= 9
            ? getZoneBounds(zone)
            : getBallZoneBounds(zone);
          if (!bounds) return null;
          return (
            <Rect
              key={zone}
              x={bounds.x} y={bounds.y}
              width={bounds.w} height={bounds.h}
              fill={color}
            />
          );
        })}

        {/* Strike zone border */}
        <Rect
          x={SZ_LEFT} y={SZ_TOP}
          width={SZ_W} height={SZ_H}
          fill="none"
          stroke={Colors.primary}
          strokeWidth={2}
        />

        {/* Zone grid */}
        <Line x1={SZ_LEFT + CELL_W} y1={SZ_TOP} x2={SZ_LEFT + CELL_W} y2={SZ_BOT}
          stroke={Colors.primary} strokeWidth={0.5} strokeOpacity={0.5} />
        <Line x1={SZ_LEFT + CELL_W * 2} y1={SZ_TOP} x2={SZ_LEFT + CELL_W * 2} y2={SZ_BOT}
          stroke={Colors.primary} strokeWidth={0.5} strokeOpacity={0.5} />
        <Line x1={SZ_LEFT} y1={SZ_TOP + CELL_H} x2={SZ_RIGHT} y2={SZ_TOP + CELL_H}
          stroke={Colors.primary} strokeWidth={0.5} strokeOpacity={0.5} />
        <Line x1={SZ_LEFT} y1={SZ_TOP + CELL_H * 2} x2={SZ_RIGHT} y2={SZ_TOP + CELL_H * 2}
          stroke={Colors.primary} strokeWidth={0.5} strokeOpacity={0.5} />

        {/* Zone count labels */}
        {['1','2','3','4','5','6','7','8','9'].map((zone) => {
          const count = zoneCounts.get(zone) ?? 0;
          if (count === 0) return null;
          const n = parseInt(zone, 10);
          const col = (n - 1) % 3;
          const row = Math.floor((n - 1) / 3);
          const cx = SZ_LEFT + col * CELL_W + CELL_W / 2;
          const cy = SZ_TOP + row * CELL_H + CELL_H / 2 + 5;
          const isLight = (count / maxCount) > 0.55;
          return (
            <SvgText
              key={zone}
              x={cx} y={cy}
              textAnchor="middle"
              fontSize={13}
              fontWeight="700"
              fill={isLight ? 'white' : Colors.text}
            >
              {count}
            </SvgText>
          );
        })}

        {/* Ball zone counts */}
        {['BH','BL','BI','BO'].map((zone) => {
          const count = zoneCounts.get(zone) ?? 0;
          if (count === 0) return null;
          const bounds = getBallZoneBounds(zone);
          if (!bounds) return null;
          return (
            <SvgText
              key={zone}
              x={bounds.x + bounds.w / 2}
              y={bounds.y + bounds.h / 2 + 4}
              textAnchor="middle"
              fontSize={11}
              fill={Colors.textSecondary}
            >
              {count}
            </SvgText>
          );
        })}

        {/* Individual pitch dots (precise coords) */}
        {coordPitches.map((p) => (
          <Circle
            key={p.id}
            cx={p.pitchX! * CANVAS_W}
            cy={p.pitchY! * CANVAS_H}
            r={4.5}
            fill={pitchDotColor(p.result)}
            fillOpacity={0.85}
            stroke="white"
            strokeWidth={0.8}
          />
        ))}

        {/* Direction labels */}
        <SvgText x={SZ_LEFT + SZ_W / 2} y={SZ_TOP - 8}
          textAnchor="middle" fontSize={9} fill={Colors.textSecondary}>高め</SvgText>
        <SvgText x={SZ_LEFT + SZ_W / 2} y={SZ_BOT + 16}
          textAnchor="middle" fontSize={9} fill={Colors.textSecondary}>低め</SvgText>
        <SvgText
          x={SZ_LEFT - 16} y={SZ_TOP + SZ_H / 2 + 4}
          textAnchor="middle" fontSize={9} fill={Colors.textSecondary}
          rotation="-90"
          originX={SZ_LEFT - 16}
          originY={SZ_TOP + SZ_H / 2 + 4}
        >内</SvgText>
        <SvgText
          x={SZ_RIGHT + 16} y={SZ_TOP + SZ_H / 2 + 4}
          textAnchor="middle" fontSize={9} fill={Colors.textSecondary}
          rotation="90"
          originX={SZ_RIGHT + 16}
          originY={SZ_TOP + SZ_H / 2 + 4}
        >外</SvgText>
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    borderRadius: 8,
    overflow: 'hidden',
  },
});
