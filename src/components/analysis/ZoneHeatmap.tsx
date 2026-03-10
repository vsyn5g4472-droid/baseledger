/**
 * ZoneHeatmap — 汎用ゾーンヒートマップ
 *
 * PitchHeatmap と同じキャンバス定数を使いますが、
 * PitchLog の配列ではなく Record<string, number> を受け取るため
 * 事前集計済みデータ（2ストライク時・カウント別など）を
 * 直接渡すことができます。
 *
 * colorTheme:
 *  'blue' — 投球頻度（スカイブルー）
 *  'red'  — 弱点/危険度（レッド）
 *  'green'— 得意/安打（グリーン）
 */

import React, { useMemo } from 'react';
import { View, StyleSheet } from 'react-native';
import Svg, { Rect, Line, Text as SvgText } from 'react-native-svg';
import { Colors } from '../../constants/theme';

// ── Canvas constants (main.tsx と同じ値) ──────────────────────────────────────
const SZ_W      = 112;
const SZ_H      = Math.round(SZ_W * 7 / 4); // 196
const BALL_PAD_H = 52;
const BALL_PAD_V = 44;
const CANVAS_W  = SZ_W + 2 * BALL_PAD_H;    // 216
const CANVAS_H  = SZ_H + 2 * BALL_PAD_V;    // 284
const SZ_LEFT   = BALL_PAD_H;
const SZ_TOP    = BALL_PAD_V;
const SZ_RIGHT  = BALL_PAD_H + SZ_W;
const SZ_BOT    = BALL_PAD_V + SZ_H;
const CELL_W    = SZ_W / 3;
const CELL_H    = SZ_H / 3;

const ALL_ZONES = ['1','2','3','4','5','6','7','8','9','BH','BL','BI','BO'];

// ── Helpers ───────────────────────────────────────────────────────────────────

function getZoneBounds(zone: string): { x: number; y: number; w: number; h: number } | null {
  const n = parseInt(zone, 10);
  if (!isNaN(n) && n >= 1 && n <= 9) {
    const col = (n - 1) % 3;
    const row = Math.floor((n - 1) / 3);
    return { x: SZ_LEFT + col * CELL_W, y: SZ_TOP + row * CELL_H, w: CELL_W, h: CELL_H };
  }
  switch (zone) {
    case 'BH': return { x: SZ_LEFT, y: 0,      w: SZ_W,      h: BALL_PAD_V };
    case 'BL': return { x: SZ_LEFT, y: SZ_BOT, w: SZ_W,      h: BALL_PAD_V };
    case 'BI': return { x: 0,       y: SZ_TOP,  w: BALL_PAD_H, h: SZ_H };
    case 'BO': return { x: SZ_RIGHT,y: SZ_TOP,  w: BALL_PAD_H, h: SZ_H };
    default:   return null;
  }
}

function heatColor(t: number, theme: ColorTheme): string {
  if (t <= 0) return 'transparent';
  const clamped = Math.min(t, 1);
  const opacity =
    clamped < 0.15 ? 0.12 :
    clamped < 0.30 ? 0.28 :
    clamped < 0.50 ? 0.48 :
    clamped < 0.70 ? 0.66 :
    clamped < 0.85 ? 0.83 : 0.95;

  switch (theme) {
    case 'red':   return `rgba(196,30,58,${opacity})`;
    case 'green': return `rgba(52,199,89,${opacity})`;
    default:      return `rgba(56,161,243,${opacity})`;  // blue
  }
}

type ColorTheme = 'blue' | 'red' | 'green';

// ── Props ─────────────────────────────────────────────────────────────────────

interface Props {
  /** zone → 値 (正規化前の生カウント) */
  heatData:   Record<string, number>;
  colorTheme?: ColorTheme;
  /** ゾーンに表示するラベル (省略時は数値) */
  labelData?: Record<string, string>;
  /** ゾーン内ラベルを表示するか */
  showLabels?: boolean;
  /** コンパクトサイズ (0.75× スケール) */
  compact?: boolean;
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function ZoneHeatmap({
  heatData,
  colorTheme = 'blue',
  labelData,
  showLabels = true,
  compact = false,
}: Props) {
  const maxVal = useMemo(
    () => Math.max(...Object.values(heatData), 1),
    [heatData],
  );

  const scale = compact ? 0.75 : 1;
  const W     = CANVAS_W * scale;
  const H     = CANVAS_H * scale;

  return (
    <View style={styles.container}>
      <Svg
        width={W}
        height={H}
        viewBox={`0 0 ${CANVAS_W} ${CANVAS_H}`}
      >
        {/* 背景 */}
        <Rect x={0} y={0} width={CANVAS_W} height={CANVAS_H} fill={Colors.surfaceGray} />

        {/* ヒートフィル */}
        {ALL_ZONES.map((zone) => {
          const val    = heatData[zone] ?? 0;
          const t      = val / maxVal;
          const color  = heatColor(t, colorTheme);
          if (color === 'transparent') return null;
          const bounds = getZoneBounds(zone);
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

        {/* ストライクゾーン枠 */}
        <Rect
          x={SZ_LEFT} y={SZ_TOP}
          width={SZ_W} height={SZ_H}
          fill="none"
          stroke={Colors.primary}
          strokeWidth={2}
        />

        {/* グリッド線 */}
        <Line x1={SZ_LEFT + CELL_W}   y1={SZ_TOP} x2={SZ_LEFT + CELL_W}   y2={SZ_BOT}
          stroke={Colors.primary} strokeWidth={0.5} strokeOpacity={0.4} />
        <Line x1={SZ_LEFT + CELL_W*2} y1={SZ_TOP} x2={SZ_LEFT + CELL_W*2} y2={SZ_BOT}
          stroke={Colors.primary} strokeWidth={0.5} strokeOpacity={0.4} />
        <Line x1={SZ_LEFT} y1={SZ_TOP + CELL_H}   x2={SZ_RIGHT} y2={SZ_TOP + CELL_H}
          stroke={Colors.primary} strokeWidth={0.5} strokeOpacity={0.4} />
        <Line x1={SZ_LEFT} y1={SZ_TOP + CELL_H*2} x2={SZ_RIGHT} y2={SZ_TOP + CELL_H*2}
          stroke={Colors.primary} strokeWidth={0.5} strokeOpacity={0.4} />

        {/* ラベル (ストライクゾーン 1〜9) */}
        {showLabels && ['1','2','3','4','5','6','7','8','9'].map((zone) => {
          const val   = heatData[zone] ?? 0;
          if (val === 0 && !labelData?.[zone]) return null;
          const n     = parseInt(zone, 10);
          const col   = (n - 1) % 3;
          const row   = Math.floor((n - 1) / 3);
          const cx    = SZ_LEFT + col * CELL_W + CELL_W / 2;
          const cy    = SZ_TOP  + row * CELL_H + CELL_H / 2 + 5;
          const t     = val / maxVal;
          const light = t > 0.55;
          const label = labelData?.[zone] ?? (val > 0 ? String(val) : '');
          return (
            <SvgText
              key={zone}
              x={cx} y={cy}
              textAnchor="middle"
              fontSize={13}
              fontWeight="700"
              fill={light ? 'white' : Colors.text}
            >
              {label}
            </SvgText>
          );
        })}

        {/* ボールゾーンラベル */}
        {showLabels && ['BH','BL','BI','BO'].map((zone) => {
          const val    = heatData[zone] ?? 0;
          const label  = labelData?.[zone] ?? (val > 0 ? String(val) : '');
          if (!label) return null;
          const bounds = getZoneBounds(zone);
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
              {label}
            </SvgText>
          );
        })}

        {/* 方向ラベル */}
        <SvgText x={SZ_LEFT + SZ_W/2} y={SZ_TOP - 8}
          textAnchor="middle" fontSize={9} fill={Colors.textSecondary}>高め</SvgText>
        <SvgText x={SZ_LEFT + SZ_W/2} y={SZ_BOT + 16}
          textAnchor="middle" fontSize={9} fill={Colors.textSecondary}>低め</SvgText>
        <SvgText
          x={SZ_LEFT - 16} y={SZ_TOP + SZ_H/2 + 4}
          textAnchor="middle" fontSize={9} fill={Colors.textSecondary}
          rotation="-90" originX={SZ_LEFT - 16} originY={SZ_TOP + SZ_H/2 + 4}
        >内</SvgText>
        <SvgText
          x={SZ_RIGHT + 16} y={SZ_TOP + SZ_H/2 + 4}
          textAnchor="middle" fontSize={9} fill={Colors.textSecondary}
          rotation="90" originX={SZ_RIGHT + 16} originY={SZ_TOP + SZ_H/2 + 4}
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
