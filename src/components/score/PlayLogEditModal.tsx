import React, { useState, useEffect } from 'react';
import {
  View,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  TextInput,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Text, Portal, Modal } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Colors, Spacing, Typography, BorderRadius } from '../../constants/theme';
import { useI18n } from '../../i18n';
import type { AtBatLog, AtBatResult } from '../../types/game';
import { estimateDefaultRbi, shouldAutoFillRbi } from '../../utils/rbiEstimate';

interface PlayLogEditModalProps {
  visible: boolean;
  log: AtBatLog | null;
  onSave: (logId: string, newResult: AtBatResult, newRbi: number, note: string) => void;
  onClose: () => void;
}

const ALL_RESULTS: { result: AtBatResult; color: string }[] = [
  { result: 'single',            color: '#1B3A5C' },
  { result: 'double',            color: '#1B3A5C' },
  { result: 'triple',            color: '#1B3A5C' },
  { result: 'home_run',          color: '#B8960C' },
  { result: 'groundout',         color: '#C41E3A' },
  { result: 'flyout',            color: '#C41E3A' },
  { result: 'lineout',           color: '#C41E3A' },
  { result: 'strikeout',         color: '#9B1528' },
  { result: 'strikeout_looking', color: '#9B1528' },
  { result: 'walk',              color: '#28A745' },
  { result: 'hit_by_pitch',      color: '#5A1A5C' },
  { result: 'sacrifice_bunt',    color: '#B87A00' },
  { result: 'fielders_choice',   color: '#5A7396' },
  { result: 'triple_play',       color: '#9B1528' },
  { result: 'error',             color: '#795548' },
];

const NOTE_MAX = 200;

export default function PlayLogEditModal({ visible, log, onSave, onClose }: PlayLogEditModalProps) {
  const { t } = useI18n();
  const [selectedResult, setSelectedResult] = useState<AtBatResult | null>(null);
  const [rbi, setRbi] = useState(0);
  const [note, setNote] = useState('');

  useEffect(() => {
    if (log && log.result) {
      setSelectedResult(log.result);
      const initialRbi = shouldAutoFillRbi(log.result, log.rbiCount)
        ? estimateDefaultRbi(log.result, log.runnersBeforePlay)
        : log.rbiCount;
      setRbi(initialRbi);
      setNote(log.note ?? '');
    }
  }, [log]);

  const handleResultSelect = (result: AtBatResult) => {
    setSelectedResult(result);
    if (!log) return;
    const estimated = estimateDefaultRbi(result, log.runnersBeforePlay);
    if (shouldAutoFillRbi(result, rbi) || (estimated > 0 && rbi === 0)) {
      setRbi(estimated);
    }
  };

  if (!log) return null;

  const handleSave = () => {
    if (!selectedResult) return;
    let finalRbi = rbi;
    if (shouldAutoFillRbi(selectedResult, finalRbi)) {
      finalRbi = estimateDefaultRbi(selectedResult, log.runnersBeforePlay);
    }
    onSave(log.id, selectedResult, finalRbi, note.trim());
    onClose();
  };

  const remaining = NOTE_MAX - note.length;

  return (
    <Portal>
      <Modal
        visible={visible}
        onDismiss={onClose}
        contentContainerStyle={styles.modal}
      >
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView keyboardShouldPersistTaps="handled">
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
                    onPress={() => handleResultSelect(result)}
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

            {/* メモ欄 */}
            <Text style={styles.sectionLabel}>メモ</Text>
            <View style={styles.noteContainer}>
              <TextInput
                style={styles.noteInput}
                value={note}
                onChangeText={(v) => setNote(v.slice(0, NOTE_MAX))}
                placeholder="打者の特徴・配球・気づきなど自由に記録..."
                placeholderTextColor={Colors.textSecondary}
                multiline
                numberOfLines={3}
                textAlignVertical="top"
                maxLength={NOTE_MAX}
              />
              <Text style={[styles.noteCounter, remaining < 20 && styles.noteCounterWarn]}>
                {remaining}
              </Text>
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
        </KeyboardAvoidingView>
      </Modal>
    </Portal>
  );
}

const styles = StyleSheet.create({
  modal: {
    backgroundColor: Colors.card,
    margin: 20,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    maxHeight: '90%',
    borderWidth: 1.5,
    borderColor: Colors.border,
  },
  title: {
    fontSize: Typography.h3,
    fontWeight: '800',
    color: Colors.primary,
    textAlign: 'center',
    marginBottom: Spacing.md,
  },
  sectionLabel: {
    fontSize: Typography.bodySmall,
    fontWeight: '700',
    color: Colors.primary,
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
    backgroundColor: Colors.primary,
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
  // メモ欄
  noteContainer: {
    position: 'relative',
    marginBottom: Spacing.xs,
  },
  noteInput: {
    backgroundColor: Colors.surfaceGray,
    borderRadius: BorderRadius.md,
    borderWidth: 1.5,
    borderColor: Colors.border,
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.sm,
    paddingBottom: 28, // カウンター分の余白
    fontSize: Typography.body,
    color: Colors.text,
    lineHeight: 22,
    minHeight: 88,
  },
  noteCounter: {
    position: 'absolute',
    bottom: 6,
    right: 10,
    fontSize: 10,
    color: Colors.textDisabled,
    fontWeight: '500',
  },
  noteCounterWarn: {
    color: Colors.statusLive,
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
    backgroundColor: Colors.primary,
  },
  saveBtnText: {
    fontSize: Typography.body,
    fontWeight: '800',
    color: Colors.white,
  },
});
