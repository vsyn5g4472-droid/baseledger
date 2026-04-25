import React from 'react';
import { View, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { Text, Modal, Portal } from 'react-native-paper';
import { Colors, Spacing, BorderRadius, Typography } from '../../constants/theme';
import type { BuntType } from '../../types/game';
import { useI18n } from '../../i18n';

const TYPES: BuntType[] = ['sacrifice', 'squeeze', 'safety', 'push', 'drag'];

export default function BuntTypeModal({
  visible,
  onSelect,
  onDismiss,
}: {
  visible: boolean;
  onSelect: (t: BuntType) => void;
  onDismiss: () => void;
}) {
  const { t } = useI18n();

  return (
    <Portal>
      <Modal
        visible={visible}
        onDismiss={onDismiss}
        contentContainerStyle={styles.container}
      >
        <Text style={styles.title}>{(t as any).buntType?.title ?? 'バントの種類'}</Text>
        <ScrollView style={styles.list}>
          {TYPES.map((bt) => (
            <TouchableOpacity
              key={bt}
              style={styles.row}
              onPress={() => onSelect(bt)}
              activeOpacity={0.7}
            >
              <Text style={styles.label}>
                {(t as any).buntType?.[bt] ?? bt}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
        <TouchableOpacity style={styles.cancel} onPress={onDismiss}>
          <Text style={styles.cancelText}>{(t as any).common?.cancel ?? '閉じる'}</Text>
        </TouchableOpacity>
      </Modal>
    </Portal>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: Colors.card,
    marginHorizontal: Spacing.lg,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    maxHeight: '70%',
  },
  title: {
    fontSize: Typography.h3,
    fontWeight: '700',
    color: Colors.text,
    marginBottom: Spacing.sm,
  },
  list: { maxHeight: 320 },
  row: {
    paddingVertical: Spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.border,
  },
  label: { fontSize: Typography.body, color: Colors.text },
  cancel: { marginTop: Spacing.md, alignItems: 'center', padding: Spacing.sm },
  cancelText: { color: Colors.textSecondary, fontSize: Typography.caption },
});
