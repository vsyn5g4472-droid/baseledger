import React, { useState } from 'react';
import { View, StyleSheet, KeyboardAvoidingView, Platform, ScrollView, TouchableOpacity, Linking } from 'react-native';
import { Text, TextInput, Button, SegmentedButtons } from 'react-native-paper';
import { router } from 'expo-router';
import * as AppleAuthentication from 'expo-apple-authentication';
import * as ExpoCrypto from 'expo-crypto';
import { useAuth } from '../../src/contexts/AuthContext';
import { useI18n } from '../../src/i18n';
import { Colors, Spacing, Typography, BorderRadius } from '../../src/constants/theme';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import type { UserRole } from '../../src/models/types';

function generateNonce(length = 32): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

async function sha256(str: string): Promise<string> {
  return ExpoCrypto.digestStringAsync(
    ExpoCrypto.CryptoDigestAlgorithm.SHA256,
    str,
    { encoding: ExpoCrypto.CryptoEncoding.HEX },
  );
}

export default function RegisterScreen() {
  const { signUp, signInWithApple, loading } = useAuth();
  const { t } = useI18n();
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [role, setRole] = useState<UserRole>('player');
  const [error, setError] = useState('');
  const [agreedToTerms, setAgreedToTerms] = useState(false);

  const handleRegister = async () => {
    if (!agreedToTerms) {
      setError('利用規約とプライバシーポリシーに同意してください');
      return;
    }
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

  const handleAppleSignIn = async () => {
    try {
      setError('');
      const rawNonce = generateNonce();
      const hashedNonce = await sha256(rawNonce);
      const credential = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
        nonce: hashedNonce,
      });
      if (credential.identityToken) {
        await signInWithApple(credential.identityToken, rawNonce);
        router.replace('/');
      }
    } catch (e: any) {
      if (e.code !== 'ERR_REQUEST_CANCELED') {
        setError(e.message || 'Apple ログインに失敗しました');
      }
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

        {/* Apple で登録 — iOS のみ */}
        {Platform.OS === 'ios' && (
          <>
            <AppleAuthentication.AppleAuthenticationButton
              buttonType={AppleAuthentication.AppleAuthenticationButtonType.SIGN_UP}
              buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
              cornerRadius={BorderRadius.lg}
              style={styles.appleBtn}
              onPress={handleAppleSignIn}
            />
            <View style={styles.dividerRow}>
              <View style={styles.dividerLine} />
              <Text style={styles.dividerText}>または</Text>
              <View style={styles.dividerLine} />
            </View>
          </>
        )}

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

        <TouchableOpacity
          style={styles.termsRow}
          onPress={() => setAgreedToTerms((v) => !v)}
          activeOpacity={0.7}
        >
          <MaterialCommunityIcons
            name={agreedToTerms ? 'checkbox-marked' : 'checkbox-blank-outline'}
            size={22}
            color={agreedToTerms ? Colors.primary : Colors.textSecondary}
          />
          <Text style={styles.termsText}>
            {'利用規約（'}
            <Text
              style={styles.termsLink}
              onPress={() => Linking.openURL('https://vsyn5g4472-droid.github.io/baseledger/terms-of-use.md')}
            >
              {'https://vsyn5g4472-droid.github.io/baseledger/terms-of-use.md'}
            </Text>
            {'）およびプライバシーポリシー（'}
            <Text
              style={styles.termsLink}
              onPress={() => Linking.openURL('https://vsyn5g4472-droid.github.io/baseledger/privacy-policy.md')}
            >
              {'https://vsyn5g4472-droid.github.io/baseledger/privacy-policy.md'}
            </Text>
            {'）に同意します'}
          </Text>
        </TouchableOpacity>

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
  appleBtn: {
    height: 50,
    width: '100%',
    marginBottom: Spacing.md,
  },
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Spacing.md,
    gap: Spacing.sm,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: Colors.border,
  },
  dividerText: {
    fontSize: Typography.caption,
    color: Colors.textSecondary,
  },
  termsRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.xs,
    marginBottom: Spacing.md,
    marginTop: Spacing.sm,
  },
  termsText: {
    flex: 1,
    fontSize: Typography.caption,
    color: Colors.textSecondary,
    lineHeight: 18,
  },
  termsLink: {
    color: Colors.primary,
    textDecorationLine: 'underline',
  },
});
