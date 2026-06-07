import React, { useState } from 'react';
import {
  View,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { Text, TextInput, Button } from 'react-native-paper';
import { router } from 'expo-router';
import { Colors, Spacing, Typography, BorderRadius } from '../../src/constants/theme';
import { sendPasswordResetEmailToUser } from '../../src/services/auth/passwordResetService';

export default function ForgotPasswordScreen() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [sending, setSending] = useState(false);

  const handleSend = async () => {
    if (!email.trim()) {
      setError('メールアドレスを入力してください');
      return;
    }
    setSending(true);
    setError('');
    setSuccess('');
    try {
      await sendPasswordResetEmailToUser(email);
      setSuccess(
        `${email.trim()} 宛にパスワード再設定メールを送信しました。メール内のリンクから新しいパスワードを設定し、再度ログインしてください。`,
      );
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'メールの送信に失敗しました。';
      setError(msg);
    } finally {
      setSending(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <Text style={styles.title}>パスワード再設定</Text>
        <Text style={styles.description}>
          登録済みのメールアドレスを入力してください。パスワード再設定用のリンクをお送りします。
        </Text>

        <TextInput
          label="メールアドレス"
          value={email}
          onChangeText={setEmail}
          mode="outlined"
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
          style={styles.input}
          left={<TextInput.Icon icon="email-outline" />}
        />

        {error ? <Text style={styles.error}>{error}</Text> : null}
        {success ? <Text style={styles.success}>{success}</Text> : null}

        <Button
          mode="contained"
          onPress={handleSend}
          loading={sending}
          disabled={sending}
          style={styles.button}
          buttonColor={Colors.action}
        >
          再設定メールを送信
        </Button>

        <Button mode="text" onPress={() => router.back()} textColor={Colors.action}>
          ログイン画面に戻る
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
  scroll: {
    padding: Spacing.lg,
    paddingTop: Spacing.xl,
  },
  title: {
    fontSize: Typography.h2,
    fontWeight: '700',
    color: Colors.text,
    marginBottom: Spacing.sm,
  },
  description: {
    fontSize: Typography.bodySmall,
    color: Colors.textSecondary,
    lineHeight: 20,
    marginBottom: Spacing.lg,
  },
  input: {
    marginBottom: Spacing.sm,
    backgroundColor: Colors.card,
  },
  error: {
    color: Colors.error,
    fontSize: 13,
    marginBottom: Spacing.sm,
  },
  success: {
    color: Colors.primary,
    fontSize: 13,
    lineHeight: 20,
    marginBottom: Spacing.sm,
  },
  button: {
    borderRadius: BorderRadius.lg,
    marginTop: Spacing.sm,
    marginBottom: Spacing.md,
  },
});
