import React, { useState } from 'react';
import { View, StyleSheet, ScrollView, Alert } from 'react-native';
import { Text, TextInput, Button, Switch } from 'react-native-paper';
import { router } from 'expo-router';
import { useTeams } from '../../../src/hooks/useTeam';
import { Colors, Spacing, Typography, BorderRadius } from '../../../src/constants/theme';

export default function CreateTeamScreen() {
  const { createTeam } = useTeams();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [isPrivate, setIsPrivate] = useState(true);
  const [loading, setLoading] = useState(false);

  const handleCreate = async () => {
    if (!name.trim()) {
      Alert.alert('エラー', 'チーム名を入力してください');
      return;
    }
    setLoading(true);
    try {
      await createTeam({ name, description, photoURI: null, isPrivate });
      Alert.alert('成功', 'チームを作成しました', [
        { text: 'OK', onPress: () => router.replace('/(tabs)/chat' as any) },
      ]);
    } catch (e) {
      Alert.alert('エラー', 'チームの作成に失敗しました');
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>チーム作成</Text>

      <TextInput
        label="チーム名"
        value={name}
        onChangeText={setName}
        mode="outlined"
        style={styles.input}
        placeholder="例: 東京ブルースターズ"
      />

      <TextInput
        label="説明"
        value={description}
        onChangeText={setDescription}
        mode="outlined"
        style={styles.input}
        multiline
        numberOfLines={3}
        placeholder="チームの説明を入力..."
      />

      <View style={styles.switchRow}>
        <View>
          <Text style={styles.switchLabel}>プライベートチーム</Text>
          <Text style={styles.switchDescription}>招待されたメンバーのみ参加可能</Text>
        </View>
        <Switch value={isPrivate} onValueChange={setIsPrivate} color={Colors.primary} />
      </View>

      <Button
        mode="contained"
        onPress={handleCreate}
        loading={loading}
        disabled={loading}
        style={styles.createButton}
        buttonColor={Colors.primary}
        labelStyle={{ fontSize: Typography.body, fontWeight: '600' }}
      >
        チームを作成
      </Button>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  content: { padding: Spacing.lg },
  title: { fontSize: Typography.h2, fontWeight: '700', color: Colors.text, marginBottom: Spacing.lg },
  input: { marginBottom: Spacing.md, backgroundColor: Colors.card },
  switchRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: Colors.card,
    padding: Spacing.md,
    borderRadius: BorderRadius.lg,
    marginBottom: Spacing.lg,
  },
  switchLabel: { fontSize: Typography.body, fontWeight: '600', color: Colors.text },
  switchDescription: { fontSize: Typography.caption, color: Colors.textSecondary, marginTop: 2 },
  createButton: { borderRadius: BorderRadius.lg, paddingVertical: 4 },
});
