import React, { useState, useEffect } from 'react';
import { View, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { Text, Portal, Modal } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Colors, Spacing, Typography, BorderRadius } from '../../constants/theme';
import { useI18n } from '../../i18n';
import type { AtBatLog, AtBatResult } from '../../types/game';

interface PlayLogEditModalProps {
  visible: boolean;
  log: AtBatLog | null;
  onSave: (logId: string, newResult: AtBatResult, newRbi: number) => void;
  onClose: () => void;
}

const ALL_RESULTS: { result: AtBatResult; color: string }[] = [
  { result: 'single',            color: '#1B3A5C' },   // ネイビー: ヒット系
  { result: 'double',            color: '#1B3A5C' },
  { result: 'triple',            color: '#1B3A5C' },
  { result: 'home_run',          color: '#B8960C' },   // ダークゴールド: 本塁打
  { result: 'groundout',         color: '#C41E3A' },   // レッド: アウト系
  { result: 'flyout',            color: '#C41E3A' },
  { result: 'lineout',           color: '#C41E3A' },
  { result: 'pop_out',           color: '#C41E3A' },
  { result: 'strikeout',         color: '#9B1528' },   // ダークレッド: 三振
  { result: 'strikeout_looking', color: '#9B1528' },
  { result: 'walk',              color: '#28A745' },   // グリーン: 四球
  { result: 'hit_by_pitch',      color: '#5A1A5C' },   // パープル: 死球
  { result: 'sacrifice_bunt',    color: '#B87A00' },   // アンバー: 犠打系
  { result: 'sacrifice_fly',     color: '#B87A00' },
  { result: 'fielders_choice',   color: '#5A7396' },   // ミッドネイビー: 野選
  { result: 'double_play',       color: '#9B1528' },   // ダークレッド: 併殺
  { result: 'triple_play',       color: '#9B1528' },
  { result: 'error',             color: '#795548' },   // ブラウン: エラー
];

export default function PlayLogEditModal({ visible, log, onSave, onClose }: PlayLogEditModalProps) {
  const { t } = useI18n();
  const [selectedResult, setSelectedResult] = useState<AtBatResult | null>(null);
  const [rbi, setRbi] = useState(0);

  useEffect(() => {
    if (log) {
      setSelectedResult(log.result);
      setRbi(log.rbiCount);
    }
  }, [log]);

  if (!log) return null;

  const handleSave = () => {
    if (!selectedResult) return;
    onSave(log.id, selectedResult, rbi);
    onClose();
  };

  return (
    <Portal>
      <Modal
        visible={visible}
        onDismiss={onClose}
        contentContainerStyle={styles.modal}
      >
        <ScrollView>
          <Text style={styles.title}>{t.playLog.edit}</Text>

          {/* 結果選択 */}
          <Text style={styles.sectionLabel}>{t.playLog.result}</Text>
          <View style={styles.resultGrid}>
            {ALL_RESULTS.map(({ result, color }) => {
              const isActive = selectedResult === result;
              return (
                <TouchableOpacity
                  key={result}
                  style={[
                    styles.resultBtn,
                    { backgroundColor: isActive ? color : Colors.background },
                    isActive && styles.resultBtnActive,
                  ]}
                  onPress={() => setSelectedResult(result)}
                >
                  <Text style={[styles.resultBtnText, isActive && styles.resultBtnTextActive]}>
                    {(t.atBatResults as Record<string, string>)[result] ?? result}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* RBI */}
          <Text style={styles.sectionLabel}>{t.playLog.rbi}</Text>
          <View style={styles.rbiRow}>
            <TouchableOpacity
              style={styles.rbiBtn}
              onPress={() => setRbi(Math.max(0, rbi - 1))}
            >
              <MaterialCommunityIcons name="minus" size={20} color={Colors.white} />
            </TouchableOpacity>
            <Text style={styles.rbiValue}>{rbi}</Text>
            <TouchableOpacity
              style={styles.rbiBtn}
              onPress={() => setRbi(rbi + 1)}
            >
              <MaterialCommunityIcons name="plus" size={20} color={Colors.white} />
            </TouchableOpacity>
          </View>

          {/* ボタン */}
          <View style={styles.btnRow}>
            <TouchableOpacity style={styles.cancelBtn} onPress={onClose}>
              <Text style={styles.cancelBtnText}>{t.playLog.close}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.saveBtn} onPress={handleSave}>
              <Text style={styles.saveBtnText}>{t.playLog.save}</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </Modal>
    </Portal>
  );
}

const ACCENT = Colors.accent;   // '#FFD700'

const styles = StyleSheet.create({
  modal: {
    backgroundColor: Colors.card,          // ホワイト背景
    margin: 20,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    maxHeight: '85%',
    borderWidth: 1.5,
    borderColor: Colors.border,
  },
  title: {
    fontSize: Typography.h3,
    fontWeight: '800',
    color: Colors.primary,                 // ネイビー
    textAlign: 'center',
    marginBottom: Spacing.md,
  },
  sectionLabel: {
    fontSize: Typography.bodySmall,
    fontWeight: '700',
    color: Colors.primary,                 // ネイビー
    marginBottom: Spacing.xs,
    marginTop: Spacing.sm,
  },
  resultGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  resultBtn: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.background,
    minWidth: 70,
    alignItems: 'center',
  },
  resultBtnActive: {
    borderColor: Colors.accent,
    borderWidth: 2,
  },
  resultBtnText: {
    fontSize: Typography.caption,
    fontWeight: '600',
    color: Colors.textSecondary,
  },
  resultBtnTextActive: {
    color: Colors.white,
    fontWeight: '800',
  },
  rbiRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 20,
    marginVertical: Spacing.sm,
  },
  rbiBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.primary,      // ネイビー
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.primary,
  },
  rbiValue: {
    fontSize: 24,
    fontWeight: '800',
    color: Colors.primary,
    minWidth: 40,
    textAlign: 'center',
  },
  btnRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 12,
    marginTop: Spacing.md,
  },
  cancelBtn: {
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: BorderRadius.md,
    borderWidth: 1.5,
    borderColor: Colors.border,
  },
  cancelBtnText: {
    fontSize: Typography.body,
    fontWeight: '700',
    color: Colors.textSecondary,
  },
  saveBtn: {
    paddingVertical: 12,
    paddingHorizontal: 32,
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.primary,      // ネイビー背景
  },
  saveBtnText: {
    fontSize: Typography.body,
    fontWeight: '800',
    color: Colors.white,                   // 白文字 on ネイビー
  },
});
