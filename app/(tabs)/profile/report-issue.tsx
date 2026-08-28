import React, { useState } from 'react';
import { View, StyleSheet, Alert, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { Text, TextInput, Button, SegmentedButtons } from 'react-native-paper';
import Constants from 'expo-constants';
import { router } from 'expo-router';
import { useAuth } from '../../../src/contexts/AuthContext';
import {
  submitSupportReport,
  type SupportReportCategory,
} from '../../../src/services/supportReportService';
import { Colors, Spacing, Typography, BorderRadius } from '../../../src/constants/theme';

export default function ReportIssueScreen() {
  const { currentUser } = useAuth();
  const [category, setCategory] = useState<SupportReportCategory>('bug');
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const appVersion = Constants.expoConfig?.version ?? 'unknown';

  const handleSubmit = async () => {
    if (!currentUser) return;
    const trimmed = message.trim();
    if (trimmed.length < 10) {
      Alert.alert('入力エラー', '内容は10文字以上で入力してください。');
      return;
    }
    setSubmitting(true);
    try {
      await submitSupportReport({
        userId: currentUser.uid,
        displayName: currentUser.displayName,
        email: currentUser.email,
        category,
        message: trimmed,
        appVersion,
        platform: Platform.OS,
      });
      Alert.alert('送信しました', 'ご報告ありがとうございます。内容を確認いたします。', [
        { text: 'OK', onPress: () => router.back() },
      ]);
    } catch (e) {
      Alert.alert('送信に失敗しました', (e as Error).message ?? '時間をおいて再度お試しください。');
    } finally {
      setSubmitting(false);
    }
  };

  if (!currentUser) return null;

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.description}>
          不具合やご要望をお知らせください。アプリのバージョン等は自動で送信されます。
        </Text>

        <Text style={styles.label}>カテゴリ</Text>
        <SegmentedButtons
          value={category}
          onValueChange={(v) => setCategory(v as SupportReportCategory)}
          buttons={[
            { value: 'bug', label: 'バグ' },
            { value: 'feature', label: '機能要望' },
            { value: 'other', label: 'その他' },
          ]}
          style={styles.segment}
        />

        <TextInput
          label="内容"
          value={message}
          onChangeText={setMessage}
          mode="outlined"
          multiline
          numberOfLines={8}
          placeholder="発生した問題やご要望を具体的に記入してください"
          style={styles.input}
        />

        <Button
          mode="contained"
          onPress={handleSubmit}
          loading={submitting}
          disabled={submitting}
          style={styles.submitButton}
          buttonColor={Colors.primary}
        >
          送信する
        </Button>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  content: {
    padding: Spacing.md,
    gap: Spacing.sm,
  },
  description: {
    fontSize: Typography.body,
    color: Colors.textSecondary,
    lineHeight: 22,
    marginBottom: Spacing.sm,
  },
  label: {
    fontSize: Typography.body,
    fontWeight: '600',
    color: Colors.text,
    marginTop: Spacing.sm,
  },
  segment: {
    marginBottom: Spacing.md,
  },
  input: {
    backgroundColor: Colors.white,
    minHeight: 160,
  },
  submitButton: {
    marginTop: Spacing.lg,
    borderRadius: BorderRadius.lg,
    paddingVertical: 4,
  },
});
