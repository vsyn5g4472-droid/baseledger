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
import { Colors, Spacing, Typography, BorderRadius } from '../../constants/theme';
import { useI18n } from '../../i18n';
import type { AtBatLog } from '../../types/game';

interface PlayLogEditModalProps {
  visible: boolean;
  log: AtBatLog | null;
  onSave: (logId: string, note: string) => void;
  onClose: () => void;
}

const NOTE_MAX = 200;

export default function PlayLogEditModal({ visible, log, onSave, onClose }: PlayLogEditModalProps) {
  const { t } = useI18n();
  const [note, setNote] = useState('');

  useEffect(() => {
    if (log) {
      setNote(log.note ?? '');
    }
  }, [log]);

  if (!log) return null;

  const handleSave = () => {
    onSave(log.id, note.trim());
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
            <Text style={styles.title}>メモを追加</Text>

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
    paddingBottom: 28,
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
