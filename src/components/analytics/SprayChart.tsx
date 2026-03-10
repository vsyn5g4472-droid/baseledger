import React, { useMemo } from 'react';
import { View, StyleSheet } from 'react-native';
import Svg, { Path, Circle, Line, Text as SvgText } from 'react-native-svg';
import type { AtBatLog, AtBatResult } from '../../types/game';
import { Colors } from '../../constants/theme';

// ── SVG Canvas ────────────────────────────────────────────────────────────────
const SVG_W = 280;
const SVG_H = 280;
const HP_X  = SVG_W / 2;  // 140 — home plate X
const HP_Y  = SVG_H - 20; // 260 — home plate Y

// ── Field Scale ───────────────────────────────────────────────────────────────
// MAX_R px = outfield fence (~330 ft display radius)
const MAX_R      = 175;
const PX_PER_FT  = MAX_R / 330;

// ── Diamond geometry (exact baseball dimensions) ──────────────────────────────
const SIN45      = Math.sin(Math.PI / 4); // 0.7071
const BASE_PX    = 90 * PX_PER_FT;                  // ≈47.7 px  (90 ft base path)
const SECOND_PX  = 90 * Math.SQRT2 * PX_PER_FT;     // ≈67.5 px  (diagonal to 2B)
const MOUND_PX   = 60.5 * PX_PER_FT;                // ≈32.1 px  (60.5 ft to mound)

// Key positions (computed once at module load)
const FIRST  = { x: HP_X + BASE_PX * SIN45, y: HP_Y - BASE_PX * SIN45 };
const SECOND = { x: HP_X,                   y: HP_Y - SECOND_PX };
const THIRD  = { x: HP_X - BASE_PX * SIN45, y: HP_Y - BASE_PX * SIN45 };
const MOUND  = { x: HP_X,                   y: HP_Y - MOUND_PX };

// Foul-line endpoints at MAX_R from home (±45° from straight-up)
const LEFT_FOUL  = { x: HP_X - MAX_R * SIN45, y: HP_Y - MAX_R * SIN45 };
const RIGHT_FOUL = { x: HP_X + MAX_R * SIN45, y: HP_Y - MAX_R * SIN45 };

// ── SVG Paths ─────────────────────────────────────────────────────────────────
// Outfield sector: home → left foul end → 90° arc → right foul end → home
const outfieldPath = [
  `M ${HP_X} ${HP_Y}`,
  `L ${LEFT_FOUL.x.toFixed(1)} ${LEFT_FOUL.y.toFixed(1)}`,
  // A rx ry x-rot large-arc sweep x y  (sweep=1 → CW → arc curves away from home)
  `A ${MAX_R} ${MAX_R} 0 0 1 ${RIGHT_FOUL.x.toFixed(1)} ${RIGHT_FOUL.y.toFixed(1)}`,
  'Z',
].join(' ');

// Infield diamond: home → 1B → 2B → 3B → home
const diamondPath = [
  `M ${HP_X} ${HP_Y}`,
  `L ${FIRST.x.toFixed(1)} ${FIRST.y.toFixed(1)}`,
  `L ${SECOND.x.toFixed(1)} ${SECOND.y.toFixed(1)}`,
  `L ${THIRD.x.toFixed(1)} ${THIRD.y.toFixed(1)}`,
  'Z',
].join(' ');

// ── Coordinate transform ──────────────────────────────────────────────────────
// fieldX : 0 = left foul line · 0.5 = center · 1 = right foul line
// fieldY : 0 = deep outfield  · 1 = home plate
function fieldToSvg(fieldX: number, fieldY: number): { x: number; y: number } {
  const dist  = (1 - fieldY) * MAX_R;
  const angle = (fieldX - 0.5) * (Math.PI / 2); // −π/4 to +π/4
  return {
    x: HP_X + dist * Math.sin(angle),
    y: HP_Y - dist * Math.cos(angle),
  };
}

// ── Hit result color ──────────────────────────────────────────────────────────
function resultColor(result: AtBatResult | null): string {
  if (!result) return Colors.textSecondary;
  if (['single', 'double', 'triple', 'home_run'].includes(result)) return Colors.primary;
  if (result === 'error') return Colors.accent;
  return Colors.textSecondary;
}

// ── Component ─────────────────────────────────────────────────────────────────
interface Props {
  atBatLogs: AtBatLog[];
}

export default function SprayChart({ atBatLogs }: Props) {
  const battedBalls = useMemo(
    () => atBatLogs.filter((l) => l.battedBall != null),
    [atBatLogs],
  );

  return (
    <View style={styles.container}>
      <Svg width={SVG_W} height={SVG_H} viewBox={`0 0 ${SVG_W} ${SVG_H}`}>

        {/* ── Outfield sector (90° fan) ── */}
        <Path
          d={outfieldPath}
          fill={Colors.primaryLight}
          stroke={Colors.primary}
          strokeWidth={1.5}
        />

        {/* ── Infield diamond (grass overlay) ── */}
        <Path
          d={diamondPath}
          fill="#E8F5E9"
          stroke={Colors.primary}
          strokeWidth={1}
        />

        {/* ── Foul lines ── */}
        <Line
          x1={HP_X} y1={HP_Y}
          x2={LEFT_FOUL.x}  y2={LEFT_FOUL.y}
          stroke={Colors.primary} strokeWidth={1.5}
        />
        <Line
          x1={HP_X} y1={HP_Y}
          x2={RIGHT_FOUL.x} y2={RIGHT_FOUL.y}
          stroke={Colors.primary} strokeWidth={1.5}
        />

        {/* ── Pitcher mound ── */}
        <Circle
          cx={MOUND.x} cy={MOUND.y} r={5}
          fill="#F5E6C8" stroke={Colors.primary} strokeWidth={1}
        />

        {/* ── Home plate ── */}
        <Circle cx={HP_X} cy={HP_Y} r={5} fill={Colors.primary} />

        {/* ── Bases ── */}
        <Circle cx={FIRST.x}  cy={FIRST.y}  r={4} fill="white" stroke={Colors.primary} strokeWidth={1.5} />
        <Circle cx={SECOND.x} cy={SECOND.y} r={4} fill="white" stroke={Colors.primary} strokeWidth={1.5} />
        <Circle cx={THIRD.x}  cy={THIRD.y}  r={4} fill="white" stroke={Colors.primary} strokeWidth={1.5} />

        {/* ── Base labels ── */}
        <SvgText x={FIRST.x + 8}  y={FIRST.y + 4}  fontSize={8} fill={Colors.textSecondary}>1B</SvgText>
        <SvgText x={SECOND.x - 4} y={SECOND.y - 7} fontSize={8} fill={Colors.textSecondary}>2B</SvgText>
        <SvgText x={THIRD.x - 16} y={THIRD.y + 4}  fontSize={8} fill={Colors.textSecondary}>3B</SvgText>

        {/* ── Batted ball dots ── */}
        {battedBalls.map((log) => {
          const bb  = log.battedBall!;
          const pos = fieldToSvg(bb.fieldX, bb.fieldY);
          return (
            <Circle
              key={log.id}
              cx={pos.x}
              cy={pos.y}
              r={5.5}
              fill={resultColor(log.result)}
              fillOpacity={0.85}
              stroke="white"
              strokeWidth={1}
            />
          );
        })}

        {/* ── No data label ── */}
        {battedBalls.length === 0 && (
          <SvgText
            x={HP_X} y={SVG_H / 2}
            textAnchor="middle"
            fontSize={12}
            fill={Colors.textSecondary}
          >
            打球データなし
          </SvgText>
        )}
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { alignItems: 'center' },
});
