import React, { useState } from 'react';
import {
  View,
  Text,
  Modal,
  Pressable,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';
import { Colors, Typography, BorderRadius } from '../../constants/theme';
import type { Position } from '../../types/game';

// ─── 定数 ───────────────────────────────────────────────────────────────────

const CANVAS_W = 270;
const CANVAS_H = 264;
const BTN = 44;

const POS_COORDS: Partial<Record<Position, { x: number; y: number }>> = {
  CF:  { x: 135, y: 18  },
  LF:  { x: 28,  y: 62  },
  RF:  { x: 242, y: 62  },
  SS:  { x: 75,  y: 110 },
  '2B':{ x: 195, y: 110 },
  '3B':{ x: 45,  y: 168 },
  P:   { x: 135, y: 155 },
  '1B':{ x: 225, y: 168 },
  C:   { x: 135, y: 228 },
};

const FIELD_POSITIONS: Position[] = ['P', 'C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF'];

// ─── Props ──────────────────────────────────────────────────────────────────

interface Props {
  value: Position;
  availablePositions: readonly Position[];
  onChange: (pos: Position) => void;
  isDuplicate?: boolean;
  label: string;
  positionLabels: Record<Position, string>;
}

// ─── Component ──────────────────────────────────────────────────────────────

export function PositionDiamondPicker({
  value,
  availablePositions,
  onChange,
  isDuplicate,
  label,
  positionLabels,
}: Props) {
  const [visible, setVisible] = useState(false);
  const availableSet = new Set(availablePositions);
  const hasDH = availableSet.has('DH');

  const handleSelect = (pos: Position) => {
    onChange(pos);
    setVisible(false);
  };

  return (
    <>
      <TouchableOpacity
        style={[s.trigger, isDuplicate && s.triggerError]}
        onPress={() => setVisible(true)}
        activeOpacity={0.7}
      >
        <Text style={[s.triggerText, isDuplicate && s.triggerTextError]} numberOfLines={1}>
          {label}
        </Text>
      </TouchableOpacity>

      <Modal
        visible={visible}
        transparent
        animationType="slide"
        onRequestClose={() => setVisible(false)}
        statusBarTranslucent
      >
        <Pressable style={s.overlay} onPress={() => setVisible(false)}>
          <Pressable style={s.sheet} onPress={(e) => e.stopPropagation()}>
            <View style={s.handle} />
            <Text style={s.title}>守備位置を選択</Text>

            <View style={s.fieldOuter}>
              {/* 外野芝 */}
              <View style={s.outfield} />
              {/* 内野ダイヤモンド（土） */}
              <View style={s.infieldDiamond} />
              {/* ピッチャーズマウンド */}
              <View style={s.mound} />
              {/* ホームベース */}
              <View style={s.homePlate} />

              {FIELD_POSITIONS.map((pos) => {
                const coord = POS_COORDS[pos];
                if (!coord) return null;
                const isSelected = value === pos;
                const isAvail = availableSet.has(pos);
                return (
                  <TouchableOpacity
                    key={pos}
                    style={[
                      s.posBtn,
                      { left: coord.x - BTN / 2, top: coord.y - BTN / 2 },
                      isSelected && s.posBtnSelected,
                      !isAvail && s.posBtnTaken,
                    ]}
                    onPress={() => isAvail && handleSelect(pos)}
                    activeOpacity={isAvail ? 0.7 : 1}
                  >
                    <Text
                      style={[
                        s.posBtnAbbr,
                        isSelected && s.posBtnTextSel,
                        !isAvail && s.posBtnTextTaken,
                      ]}
                    >
                      {pos}
                    </Text>
                    <Text
                      style={[
                        s.posBtnName,
                        isSelected && s.posBtnTextSel,
                        !isAvail && s.posBtnTextTaken,
                      ]}
                    >
                      {positionLabels[pos]}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {hasDH && (
              <TouchableOpacity
                style={[s.dhBtn, value === 'DH' && s.posBtnSelected]}
                onPress={() => handleSelect('DH')}
                activeOpacity={0.7}
              >
                <Text style={[s.dhText, value === 'DH' && s.posBtnTextSel]}>
                  DH（{positionLabels['DH']}）
                </Text>
              </TouchableOpacity>
            )}
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

// ─── スタイル ─────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  trigger: {
    width: 64,
    height: 36,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.card,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 4,
  },
  triggerError: {
    borderColor: Colors.error,
    backgroundColor: '#FEF2F2',
  },
  triggerText: {
    fontSize: Typography.caption,
    color: Colors.text,
    fontWeight: '600',
  },
  triggerTextError: {
    color: Colors.error,
  },

  overlay: {
    flex: 1,
    backgroundColor: Colors.overlay,
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: Colors.card,
    borderTopLeftRadius: BorderRadius.xl,
    borderTopRightRadius: BorderRadius.xl,
    paddingBottom: 32,
    alignItems: 'center',
    paddingTop: 12,
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.border,
    marginBottom: 16,
  },
  title: {
    fontSize: Typography.body,
    fontWeight: '700',
    color: Colors.text,
    marginBottom: 20,
  },

  fieldOuter: {
    width: CANVAS_W,
    height: CANVAS_H,
    position: 'relative',
    overflow: 'hidden',
    borderRadius: BorderRadius.md,
    marginBottom: 16,
  },
  outfield: {
    position: 'absolute',
    width: CANVAS_W,
    height: CANVAS_H,
    backgroundColor: '#3A9440',
  },
  infieldDiamond: {
    position: 'absolute',
    width: 136,
    height: 136,
    transform: [{ rotate: '45deg' }],
    backgroundColor: '#C8A96A',
    borderWidth: 2,
    borderColor: '#B0923A',
    left: 135 - 68,
    top: 168 - 68,
  },
  mound: {
    position: 'absolute',
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: '#D4B07A',
    borderWidth: 1,
    borderColor: '#B09050',
    left: 135 - 9,
    top: 155 - 9,
  },
  homePlate: {
    position: 'absolute',
    width: 14,
    height: 14,
    transform: [{ rotate: '45deg' }],
    backgroundColor: Colors.white,
    borderWidth: 1,
    borderColor: Colors.border,
    left: 135 - 7,
    top: 228 - 7,
  },

  posBtn: {
    position: 'absolute',
    width: BTN,
    height: BTN,
    borderRadius: BTN / 2,
    backgroundColor: 'rgba(255,255,255,0.88)',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  posBtnSelected: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  posBtnTaken: {
    backgroundColor: 'rgba(200,200,200,0.5)',
    borderColor: 'rgba(150,150,150,0.3)',
  },
  posBtnAbbr: {
    fontSize: Typography.tiny,
    fontWeight: '700',
    color: Colors.primary,
    lineHeight: 12,
  },
  posBtnName: {
    fontSize: 8,
    color: Colors.textSecondary,
    lineHeight: 10,
  },
  posBtnTextSel: {
    color: Colors.white,
  },
  posBtnTextTaken: {
    color: Colors.textDisabled,
  },

  dhBtn: {
    paddingHorizontal: 24,
    paddingVertical: 10,
    borderRadius: BorderRadius.full,
    borderWidth: 2,
    borderColor: Colors.border,
    backgroundColor: Colors.card,
  },
  dhText: {
    fontSize: Typography.bodySmall,
    fontWeight: '600',
    color: Colors.textSecondary,
  },
});
