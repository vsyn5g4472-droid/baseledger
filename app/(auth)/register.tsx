import React, { useState } from 'react';
import { View, StyleSheet, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { Text, TextInput, Button, SegmentedButtons } from 'react-native-paper';
import { router } from 'expo-router';
import { useAuth } from '../../src/contexts/AuthContext';
import { useI18n } from '../../src/i18n';
import { Colors, Spacing, Typography, BorderRadius } from '../../src/constants/theme';
import type { UserRole } from '../../src/models/types';

export default function RegisterScreen() {
  const { signUp, loading } = useAuth();
  const { t } = useI18n();
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [role, setRole] = useState<UserRole>('player');
  const [error, setError] = useState('');

  const handleRegister = async () => {
    if (!displayName || !email || !password) {
      setError(t.auth.errorFill);
      return;
    }
    if (password !== confirmPassword) {
      setError(t.auth.errorPasswordMatch);
      return;
    }
    if (password.length < 6) {
      setError(t.auth.errorPasswordLength);
      return;
    }
    try {
      setError('');
      await signUp(email, password, displayName, role);
      // isNewUser is now true → index.tsx will redirect to onboarding
      router.replace('/');
    } catch (e: any) {
      setError(e.message || 'Registration failed');
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <Text style={styles.title}>{t.auth.createAccount}</Text>
        <Text style={styles.subtitle}>{t.auth.joinCommunity}</Text>

        <Text style={styles.label}>{t.auth.iAm}</Text>
        <SegmentedButtons
          value={role}
          onValueChange={(v) => setRole(v as UserRole)}
          buttons={[
            { value: 'player', label: t.auth.rolePlayer, icon: 'baseball-bat' },
            { value: 'scout', label: t.auth.roleScout, icon: 'magnify' },
            { value: 'coach', label: t.auth.roleCoach, icon: 'whistle' },
          ]}
          style={styles.roleSelector}
        />

        <TextInput
          label={t.auth.displayNameLabel}
          value={displayName}
          onChangeText={setDisplayName}
          mode="outlined"
          style={styles.input}
          left={<TextInput.Icon icon="account" />}
        />

        <TextInput
          label={t.auth.emailLabel}
          value={email}
          onChangeText={setEmail}
          mode="outlined"
          keyboardType="email-address"
          autoCapitalize="none"
          style={styles.input}
          left={<TextInput.Icon icon="email" />}
        />

        <TextInput
          label={t.auth.passwordLabel}
          value={password}
          onChangeText={setPassword}
          mode="outlined"
          secureTextEntry
          style={styles.input}
          left={<TextInput.Icon icon="lock" />}
        />

        <TextInput
          label={t.auth.confirmPasswordLabel}
          value={confirmPassword}
          onChangeText={setConfirmPassword}
          mode="outlined"
          secureTextEntry
          style={styles.input}
          left={<TextInput.Icon icon="lock-check" />}
        />

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <Button
          mode="contained"
          onPress={handleRegister}
          loading={loading}
          disabled={loading}
          style={styles.registerButton}
          labelStyle={styles.registerButtonLabel}
          buttonColor={Colors.primary}
        >
          {t.auth.signUpBtn}
        </Button>

        <View style={styles.loginRow}>
          <Text style={styles.loginText}>{t.auth.haveAccount} </Text>
          <Button mode="text" onPress={() => router.back()} compact labelStyle={styles.loginLink}>
            {t.auth.loginLink}
          </Button>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  scroll: { padding: Spacing.lg, paddingTop: Spacing.xl },
  title: { fontSize: Typography.h1, fontWeight: '800', color: Colors.text },
  subtitle: { fontSize: Typography.body, color: Colors.textSecondary, marginBottom: Spacing.lg },
  label: { fontSize: Typography.body, fontWeight: '600', color: Colors.text, marginBottom: Spacing.sm },
  roleSelector: { marginBottom: Spacing.lg },
  input: { marginBottom: Spacing.md, backgroundColor: Colors.card },
  error: { color: Colors.error, fontSize: Typography.caption, marginBottom: Spacing.md, textAlign: 'center' },
  registerButton: { borderRadius: BorderRadius.lg, paddingVertical: 4, marginBottom: Spacing.md, marginTop: Spacing.sm },
  registerButtonLabel: { fontSize: Typography.body, fontWeight: '600' },
  loginRow: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', marginTop: Spacing.md },
  loginText: { fontSize: Typography.body, color: Colors.textSecondary },
  loginLink: { color: Colors.primary, fontWeight: '600' },
});
