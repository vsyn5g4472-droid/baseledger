import React, { useState, useEffect } from 'react';
import { View, StyleSheet, TouchableOpacity, TextInput, Keyboard } from 'react-native';
import { Text } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Colors, Spacing, BorderRadius, Typography } from '../../constants/theme';

const NOTE_MAX = 200;

export default function PlayConfirmSnack({
  visible,
  batterLabel,
  resultLabel,
  onSaveNote,
  onDismiss,
}: {
  visible: boolean;
  batterLabel: string;
  resultLabel: string;
  onSaveNote: (note: string) => void;
  onDismiss: () => void;
}) {
  const [note, setNote] = useState('');
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    if (visible) {
      setNote('');
      setExpanded(false);
    }
  }, [visible, batterLabel, resultLabel]);

  if (!visible) return null;

  return (
    <View style={styles.bar} pointerEvents="box-none">
      <View style={styles.textCol}>
        <Text style={styles.line} numberOfLines={1}>
          ✓ {batterLabel} {resultLabel}
        </Text>
        {expanded && (
          <TextInput
            value={note}
            onChangeText={(t) => setNote(t.slice(0, NOTE_MAX))}
            placeholder="メモ（最大200字）"
            style={styles.input}
            multiline
          />
        )}
      </View>
      <View style={styles.actions}>
        {!expanded ? (
          <TouchableOpacity
            onPress={() => setExpanded(true)}
            style={styles.btn}
            hitSlop={8}
          >
            <MaterialCommunityIcons name="note-edit-outline" size={20} color={Colors.primary} />
            <Text style={styles.btnText}>メモ</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            onPress={() => { onSaveNote(note); Keyboard.dismiss(); }}
            style={styles.btn}
          >
            <Text style={styles.saveText}>保存</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity
          onPress={() => { onDismiss(); Keyboard.dismiss(); }}
          style={styles.btn}
        >
          <MaterialCommunityIcons name="close" size={20} color={Colors.textSecondary} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    position: 'absolute',
    left: 8,
    right: 8,
    bottom: 8,
    flexDirection: 'row',
    alignItems: 'flex-end',
    backgroundColor: Colors.card,
    borderRadius: BorderRadius.md,
    padding: Spacing.sm,
    borderWidth: 1,
    borderColor: Colors.border,
    zIndex: 20,
  },
  textCol: { flex: 1, marginRight: 8 },
  line: { fontSize: Typography.caption, color: Colors.text, fontWeight: '600' },
  input: {
    marginTop: 4,
    fontSize: Typography.caption,
    color: Colors.text,
    maxHeight: 72,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  btn: { flexDirection: 'row', alignItems: 'center', padding: 4, gap: 2 },
  btnText: { color: Colors.primary, fontSize: 12, fontWeight: '600' },
  saveText: { color: Colors.primary, fontWeight: '700' },
});
