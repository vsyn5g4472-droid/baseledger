import React, { useState, useCallback } from 'react';
import { View, StyleSheet, TouchableOpacity } from 'react-native';
import { Text } from 'react-native-paper';
import Svg, { Circle, Path, Line, Text as SvgText } from 'react-native-svg';
import { Colors, Spacing, Typography, BorderRadius } from '../../constants/theme';
import { useI18n } from '../../i18n';
import type { FielderNumber, FieldingRecord } from '../../types/game';

// ============================================================
// 定数: 守備位置の座標 (SVG座標系)
// ============================================================

const FIELD_SIZE = 280;
const CX = FIELD_SIZE / 2;
const CY = FIELD_SIZE - 30; // ホームプレート位置

// 各守備位置の座標 (フィールド図上)
const FIELDER_POSITIONS: { num: FielderNumber; x: number; y: number }[] = [
  { num: 1, x: CX, y: CY - 70 },           // P (投手)
  { num: 2, x: CX, y: CY - 15 },           // C (捕手)
  { num: 3, x: CX + 65, y: CY - 85 },      // 1B
  { num: 4, x: CX + 30, y: CY - 115 },     // 2B
  { num: 5, x: CX - 65, y: CY - 85 },      // 3B
  { num: 6, x: CX - 30, y: CY - 115 },     // SS
  { num: 7, x: CX - 90, y: CY - 180 },     // LF
  { num: 8, x: CX, y: CY - 200 },          // CF
  { num: 9, x: CX + 90, y: CY - 180 },     // RF
];

const NEON_YELLOW = Colors.accent;      // '#FFD700' ゴールド
const NEON_GLOW = Colors.accentSoft;    // ゴールド極薄グロー

// ============================================================
// Props
// ============================================================

interface FielderSelectorProps {
  onConfirm: (fielding: FieldingRecord) => void;
  onCancel: () => void;
}

// ============================================================
// コンポーネント
// ============================================================

export default function FielderSelector({ onConfirm, onCancel }: FielderSelectorProps) {
  const { t } = useI18n();
  const [selected, setSelected] = useState<FielderNumber[]>([]);

  const toggleFielder = useCallback((num: FielderNumber) => {
    setSelected((prev) => {
      const idx = prev.indexOf(num);
      if (idx >= 0) {
        // 既に選択済み → 除去
        return prev.filter((n) => n !== num);
      }
      // 追加
      return [...prev, num];
    });
  }, []);

  const handleConfirm = useCallback(() => {
    if (selected.length === 0) return;
    onConfirm({ fielders: selected });
  }, [selected, onConfirm]);

  const handleClear = useCallback(() => {
    setSelected([]);
  }, []);

  // 扇形のフィールドパス
  const arcR = FIELD_SIZE - 50;
  const angleL = (-135 * Math.PI) / 180;
  const angleR = (-45 * Math.PI) / 180;
  const x1 = CX + arcR * Math.cos(angleL);
  const y1 = CY + arcR * Math.sin(angleL);
  const x2 = CX + arcR * Math.cos(angleR);
  const y2 = CY + arcR * Math.sin(angleR);
  const arcPath = `M ${CX} ${CY} L ${x1} ${y1} A ${arcR} ${arcR} 0 0 1 ${x2} ${y2} Z`;

  // ダイヤモンド
  const dR = 55;
  const bases = {
    home: { x: CX, y: CY },
    first: { x: CX + dR * Math.cos((-45 * Math.PI) / 180), y: CY + dR * Math.sin((-45 * Math.PI) / 180) },
    second: { x: CX + dR * Math.cos((-90 * Math.PI) / 180), y: CY + dR * Math.sin((-90 * Math.PI) / 180) },
    third: { x: CX + dR * Math.cos((-135 * Math.PI) / 180), y: CY + dR * Math.sin((-135 * Math.PI) / 180) },
  };

  return (
    <View style={styles.wrapper}>
      {/* タイトル */}
      <Text style={styles.title}>{t.fielding.title}</Text>

      {/* 選択中の守備番号表示 */}
      <View style={styles.selectedRow}>
        {selected.length > 0 ? (
          <Text style={styles.selectedText}>
            {selected.join(' - ')}
          </Text>
        ) : (
          <Text style={styles.hintText}>{t.fielding.tapFielder}</Text>
        )}
      </View>

      {/* フィールドSVG */}
      <View style={styles.fieldWrap}>
        <Svg width={FIELD_SIZE} height={FIELD_SIZE} viewBox={`0 0 ${FIELD_SIZE} ${FIELD_SIZE}`}>
          {/* 芝生 (グリーン薄め) */}
          <Path d={arcPath} fill="#43A047" opacity={0.12} />
          <Path d={arcPath} fill="none" stroke={Colors.primary} strokeWidth={1.5} opacity={0.4} />

          {/* ダイヤモンド */}
          <Line x1={bases.home.x} y1={bases.home.y} x2={bases.first.x} y2={bases.first.y} stroke={Colors.border} strokeWidth={1.5} />
          <Line x1={bases.first.x} y1={bases.first.y} x2={bases.second.x} y2={bases.second.y} stroke={Colors.border} strokeWidth={1.5} />
          <Line x1={bases.second.x} y1={bases.second.y} x2={bases.third.x} y2={bases.third.y} stroke={Colors.border} strokeWidth={1.5} />
          <Line x1={bases.third.x} y1={bases.third.y} x2={bases.home.x} y2={bases.home.y} stroke={Colors.border} strokeWidth={1.5} />

          {/* 守備位置 */}
          {FIELDER_POSITIONS.map(({ num, x, y }) => {
            const isSelected = selected.includes(num);
            const order = selected.indexOf(num);
            return (
              <React.Fragment key={num}>
                {/* グロー効果 (ゴールド薄) */}
                {isSelected && (
                  <Circle cx={x} cy={y} r={22} fill={NEON_YELLOW} opacity={0.2} />
                )}
                {/* メイン円 */}
                <Circle
                  cx={x}
                  cy={y}
                  r={18}
                  fill={isSelected ? Colors.primary : Colors.card}
                  stroke={isSelected ? NEON_YELLOW : Colors.border}
                  strokeWidth={isSelected ? 2.5 : 1.5}
                />
                {/* 番号 */}
                <SvgText
                  x={x}
                  y={y + 5}
                  textAnchor="middle"
                  fontSize={14}
                  fontWeight="bold"
                  fill={isSelected ? NEON_YELLOW : Colors.primary}
                >
                  {num}
                </SvgText>
                {/* 選択順序バッジ */}
                {isSelected && order >= 0 && (
                  <>
                    <Circle cx={x + 14} cy={y - 14} r={8} fill={NEON_YELLOW} />
                    <SvgText
                      x={x + 14}
                      y={y - 10}
                      textAnchor="middle"
                      fontSize={9}
                      fontWeight="bold"
                      fill={Colors.primary}
                    >
                      {order + 1}
                    </SvgText>
                  </>
                )}
              </React.Fragment>
            );
          })}
        </Svg>

        {/* タップ領域オーバーレイ */}
        {FIELDER_POSITIONS.map(({ num, x, y }) => (
          <TouchableOpacity
            key={num}
            style={[styles.fielderTap, { left: x - 22, top: y - 22 }]}
            onPress={() => toggleFielder(num)}
            activeOpacity={0.5}
          />
        ))}
      </View>

      {/* ボタン */}
      <View style={styles.buttonRow}>
        <TouchableOpacity style={styles.cancelBtn} onPress={onCancel}>
          <Text style={styles.cancelText}>{t.live.cancel}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.clearBtn} onPress={handleClear}>
          <Text style={styles.clearText}>{t.fielding.clear}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.confirmBtn, selected.length === 0 && styles.confirmBtnDisabled]}
          onPress={handleConfirm}
          disabled={selected.length === 0}
        >
          <Text style={styles.confirmText}>{t.fielding.confirm}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ============================================================
// スタイル
// ============================================================

const styles = StyleSheet.create({
  wrapper: {
    flex: 1,
    backgroundColor: Colors.background,   // ライトグレー
    paddingTop: Spacing.md,
  },
  title: {
    fontSize: Typography.h4,
    fontWeight: '800',
    color: Colors.primary,                 // ネイビー
    textAlign: 'center',
  },
  selectedRow: {
    alignItems: 'center',
    paddingVertical: Spacing.sm,
    minHeight: 40,
  },
  selectedText: {
    fontSize: 28,
    fontWeight: '900',
    color: Colors.primary,                 // ネイビー (ライト背景)
    letterSpacing: 4,
  },
  hintText: {
    fontSize: Typography.bodySmall,
    color: Colors.textSecondary,
  },
  fieldWrap: {
    alignSelf: 'center',
    width: FIELD_SIZE,
    height: FIELD_SIZE,
  },
  fielderTap: {
    position: 'absolute',
    width: 44,
    height: 44,
    borderRadius: 22,
  },
  buttonRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
  },
  cancelBtn: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: BorderRadius.lg,
    borderWidth: 1.5,
    borderColor: Colors.border,
  },
  cancelText: {
    color: Colors.textSecondary,
    fontSize: Typography.bodySmall,
    fontWeight: '600',
  },
  clearBtn: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: BorderRadius.lg,
    borderWidth: 1.5,
    borderColor: Colors.border,
  },
  clearText: {
    color: Colors.textSecondary,
    fontSize: Typography.bodySmall,
    fontWeight: '600',
  },
  confirmBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: BorderRadius.lg,
    backgroundColor: Colors.primary,      // ネイビー背景
    alignItems: 'center',
  },
  confirmBtnDisabled: {
    opacity: 0.3,
  },
  confirmText: {
    color: Colors.white,                   // 白文字 on ネイビー
    fontSize: Typography.body,
    fontWeight: '800',
  },
});
