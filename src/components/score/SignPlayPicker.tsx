import React from 'react';
import { View, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { Text } from 'react-native-paper';
import type { SignPlayTag } from '../../types/game';
import { Colors, Spacing, BorderRadius, Typography } from '../../constants/theme';

const ALL: { tag: SignPlayTag | 'none' }[] = [
  { tag: 'none' },
  { tag: 'hit_and_run' },
  { tag: 'run_and_hit' },
  { tag: 'squeeze' },
  { tag: 'double_steal' },
  { tag: 'delayed_steal' },
  { tag: 'bunt_and_run' },
];

export default function SignPlayPicker({
  value,
  onChange,
  labels,
}: {
  value: SignPlayTag | 'none' | null | undefined;
  onChange: (v: SignPlayTag | 'none') => void;
  labels: Record<SignPlayTag | 'none', string>;
}) {
  const v = value ?? 'none';
  return (
    <View style={styles.wrap}>
      <Text style={styles.caption}>サイン</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
        {ALL.map(({ tag }) => {
          const active = v === tag;
          return (
            <TouchableOpacity
              key={String(tag)}
              style={[styles.chip, active && styles.chipActive]}
              onPress={() => onChange(tag)}
            >
              <Text style={[styles.chipText, active && styles.chipTextActive]}>
                {labels[tag]}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginVertical: 4, paddingHorizontal: 4 },
  caption: { fontSize: 10, color: Colors.textSecondary, marginBottom: 4 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingBottom: 2 },
  chip: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.background,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  chipActive: { backgroundColor: 'rgba(255,193,7,0.2)', borderColor: '#FFC107' },
  chipText: { fontSize: 11, color: Colors.textSecondary, fontWeight: '600' },
  chipTextActive: { color: Colors.text },
});
