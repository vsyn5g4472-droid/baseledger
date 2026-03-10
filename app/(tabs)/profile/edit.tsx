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
      <Text style={styles.title}>Edit Profile</Text>

      <TextInput label="Display Name" value={displayName} onChangeText={setDisplayName} mode="outlined" style={styles.input} />
      <TextInput label="Bio" value={bio} onChangeText={setBio} mode="outlined" style={styles.input} multiline numberOfLines={3} />
      <TextInput label="Position" value={position} onChangeText={setPosition} mode="outlined" style={styles.input} placeholder="e.g. Pitcher, Shortstop" />
      <TextInput label="Team" value={team} onChangeText={setTeam} mode="outlined" style={styles.input} placeholder="e.g. Tokyo Giants" />

      <Text style={styles.label}>Role</Text>
      <SegmentedButtons
        value={role}
        onValueChange={(v) => setRole(v as UserRole)}
        buttons={[
          { value: 'player', label: 'Player' },
          { value: 'scout', label: 'Scout' },
          { value: 'coach', label: 'Coach' },
        ]}
        style={styles.roleSelector}
      />

      <Button mode="contained" onPress={handleSave} style={styles.saveButton} buttonColor={Colors.primary}>
        Save Changes
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
