import React, { useState } from 'react';
import { StyleSheet, ScrollView, Alert } from 'react-native';
import { Text, TextInput, Button, SegmentedButtons } from 'react-native-paper';
import { router } from 'expo-router';
import { useAuth } from '../../../src/contexts/AuthContext';
import { Colors, Spacing, Typography, BorderRadius } from '../../../src/constants/theme';
import type { UserRole } from '../../../src/models/types';

export default function EditProfileScreen() {
  const { currentUser } = useAuth();
  const [displayName, setDisplayName] = useState(currentUser?.displayName ?? '');
  const [bio, setBio] = useState(currentUser?.bio ?? '');
  const [position, setPosition] = useState(currentUser?.position ?? '');
  const [team, setTeam] = useState(currentUser?.team ?? '');
  const [role, setRole] = useState<UserRole>(currentUser?.role ?? 'player');

  const handleSave = () => {
    Alert.alert('Saved', 'Profile updated successfully', [
      { text: 'OK', onPress: () => router.back() },
    ]);
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>プロフィール編集</Text>

      <TextInput label="表示名" value={displayName} onChangeText={setDisplayName} mode="outlined" style={styles.input} />
      <TextInput label="自己紹介" value={bio} onChangeText={setBio} mode="outlined" style={styles.input} multiline numberOfLines={3} />
      <TextInput label="ポジション" value={position} onChangeText={setPosition} mode="outlined" style={styles.input} placeholder="例: 投手、遊撃手" />
      <TextInput label="チーム" value={team} onChangeText={setTeam} mode="outlined" style={styles.input} placeholder="例: 東京ジャイアンツ" />

      <Text style={styles.label}>役割</Text>
      <SegmentedButtons
        value={role}
        onValueChange={(v) => setRole(v as UserRole)}
        buttons={[
          { value: 'player', label: '選手' },
          { value: 'scout', label: 'スカウト' },
          { value: 'coach', label: 'コーチ' },
        ]}
        style={styles.roleSelector}
      />

      <Button mode="contained" onPress={handleSave} style={styles.saveButton} buttonColor={Colors.primary}>
        変更を保存
      </Button>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  content: { padding: Spacing.lg },
  title: { fontSize: Typography.h2, fontWeight: '700', color: Colors.text, marginBottom: Spacing.lg },
  input: { marginBottom: Spacing.md, backgroundColor: Colors.card },
  label: { fontSize: Typography.body, fontWeight: '600', color: Colors.text, marginBottom: Spacing.sm },
  roleSelector: { marginBottom: Spacing.lg },
  saveButton: { borderRadius: BorderRadius.lg, paddingVertical: 4 },
});
