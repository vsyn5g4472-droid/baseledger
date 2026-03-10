import React, { useEffect, useState } from 'react';
import { View, StyleSheet, Platform, Pressable } from 'react-native';
import { Modal, Portal, Text, Button, Divider } from 'react-native-paper';
import { router } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useAuthModal } from '../contexts/AuthModalContext';
import { useDeferredActionStore } from '../stores/deferredActionStore';
import { useAuth } from '../contexts/AuthContext';
import { useGoogleAuth } from '../hooks/useGoogleAuth';
import { useAppleAuth } from '../hooks/useAppleAuth';
import { isBiometricAvailable, hasBiometricCredentials } from '../services/auth/passkeyAuth';
import { Colors, Spacing, Typography, BorderRadius } from '../constants/theme';

export default function AuthModal() {
  const { visible, hideModal } = useAuthModal();
  const executePendingAction = useDeferredActionStore((s) => s.executePendingAction);
  const { currentUser, signInWithPasskey } = useAuth();
  const { signInWithGoogle, loading: googleLoading, error: googleError } = useGoogleAuth();
  const { signInWithApple, loading: appleLoading, error: appleError, isAvailable: appleAvailable } = useAppleAuth();
  const [passkeyAvailable, setPasskeyAvailable] = useState(false);

  // Detect biometric availability
  useEffect(() => {
    Promise.all([isBiometricAvailable(), hasBiometricCredentials()]).then(
      ([available, hasCredentials]) => setPasskeyAvailable(available && hasCredentials),
    );
  }, [visible]);

  // When user signs in while modal is open, execute deferred action and close
  useEffect(() => {
    if (currentUser && visible) {
      hideModal();
      executePendingAction();
    }
  }, [currentUser, visible, hideModal, executePendingAction]);

  const handleGooglePress = async () => {
    await signInWithGoogle();
  };

  const handleApplePress = async () => {
    await signInWithApple();
  };

  const handlePasskeyPress = async () => {
    await signInWithPasskey();
  };

  const handleEmailPress = () => {
    hideModal();
    router.push('/(auth)/login' as any);
  };

  const error = googleError ?? appleError;
  const loading = googleLoading || appleLoading;

  return (
    <Portal>
      <Modal
        visible={visible}
        onDismiss={hideModal}
        contentContainerStyle={styles.container}
      >
        {/* Handle bar */}
        <View style={styles.handle} />

        {/* Header */}
        <View style={styles.header}>
          <View style={styles.iconRing}>
            <MaterialCommunityIcons name="baseball" size={28} color={Colors.primary} />
          </View>
          <Text style={styles.title}>サインインが必要です</Text>
          <Text style={styles.subtitle}>続けるには BallPark アカウントにサインインしてください</Text>
        </View>

        {/* Auth buttons */}
        <View style={styles.buttons}>
          {/* Google */}
          <Pressable
            style={[styles.socialBtn, loading && styles.disabledBtn]}
            onPress={handleGooglePress}
            disabled={loading}
          >
            <MaterialCommunityIcons name="google" size={20} color="#EA4335" />
            <Text style={styles.socialBtnText}>Google でサインイン</Text>
          </Pressable>

          {/* Apple (iOS only) */}
          {appleAvailable && Platform.OS === 'ios' && (
            <Pressable
              style={[styles.socialBtn, styles.appleBtn, loading && styles.disabledBtn]}
              onPress={handleApplePress}
              disabled={loading}
            >
              <MaterialCommunityIcons name="apple" size={20} color={Colors.white} />
              <Text style={[styles.socialBtnText, styles.appleBtnText]}>Apple でサインイン</Text>
            </Pressable>
          )}

          {/* Passkey / Biometrics */}
          {passkeyAvailable && (
            <Pressable
              style={[styles.socialBtn, loading && styles.disabledBtn]}
              onPress={handlePasskeyPress}
              disabled={loading}
            >
              <MaterialCommunityIcons name="fingerprint" size={20} color={Colors.primary} />
              <Text style={styles.socialBtnText}>生体認証でサインイン</Text>
            </Pressable>
          )}

          <Divider style={styles.divider} />

          {/* Email */}
          <Button
            mode="outlined"
            onPress={handleEmailPress}
            style={styles.emailBtn}
            textColor={Colors.primary}
            icon="email-outline"
          >
            メール / パスワードでサインイン
          </Button>

          {/* Register link */}
          <Button
            mode="text"
            onPress={() => {
              hideModal();
              router.push('/(auth)/register' as any);
            }}
            textColor={Colors.textSecondary}
          >
            アカウントをお持ちでない方はこちら
          </Button>
        </View>

        {/* Error */}
        {error ? <Text style={styles.error}>{error}</Text> : null}
      </Modal>
    </Portal>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: Colors.card,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingBottom: Spacing.xl + 16,
    paddingHorizontal: Spacing.lg,
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
  },
  handle: {
    width: 40,
    height: 4,
    backgroundColor: Colors.border,
    borderRadius: 2,
    alignSelf: 'center',
    marginVertical: Spacing.sm,
  },
  header: {
    alignItems: 'center',
    paddingVertical: Spacing.md,
  },
  iconRing: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: Colors.primaryLight,
    borderWidth: 2,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.sm,
  },
  title: {
    fontSize: Typography.h4,
    fontWeight: '700',
    color: Colors.text,
    marginBottom: Spacing.xs,
  },
  subtitle: {
    fontSize: Typography.bodySmall,
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
  },
  buttons: {
    gap: Spacing.sm,
    marginTop: Spacing.sm,
  },
  socialBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingVertical: 14,
    paddingHorizontal: Spacing.md,
    borderRadius: BorderRadius.lg,
    borderWidth: 1.5,
    borderColor: Colors.border,
    backgroundColor: Colors.card,
  },
  socialBtnText: {
    fontSize: Typography.body,
    fontWeight: '600',
    color: Colors.text,
  },
  appleBtn: {
    backgroundColor: Colors.black,
    borderColor: Colors.black,
  },
  appleBtnText: {
    color: Colors.white,
  },
  disabledBtn: {
    opacity: 0.5,
  },
  divider: {
    marginVertical: Spacing.xs,
  },
  emailBtn: {
    borderColor: Colors.border,
    borderRadius: BorderRadius.lg,
  },
  error: {
    fontSize: Typography.caption,
    color: Colors.error,
    textAlign: 'center',
    marginTop: Spacing.sm,
  },
});
