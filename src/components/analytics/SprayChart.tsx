import React, { useMemo } from 'react';
import { View, StyleSheet } from 'react-native';
import Svg, { Path, Circle, Line, Text as SvgText } from 'react-native-svg';
import type { AtBatLog } from '../../types/game';
import { Colors } from '../../constants/theme';
import {
  SVG_W,
  SVG_H,
  HP_X,
  HP_Y,
  FIRST,
  SECOND,
  THIRD,
  MOUND,
  LEFT_FOUL,
  RIGHT_FOUL,
  outfieldPath,
  diamondPath,
  fieldToSvg,
  resultColor,
} from '../../utils/sprayGeometry';

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
