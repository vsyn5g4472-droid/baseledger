import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Text, Button } from 'react-native-paper';
import { router } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useI18n } from '../i18n';
import { Colors, Spacing, Typography, BorderRadius } from '../constants/theme';

interface AuthPromptCardProps {
  title: string;
  subtitle: string;
  icon?: string;
  showGuestHint?: boolean;
}

/**
 * Full-screen auth gate shown when a tab/screen requires login.
 * Displays a centered card with a lock icon and login CTA.
 */
export default function AuthPromptCard({
  title,
  subtitle,
  icon = 'lock-outline',
  showGuestHint = true,
}: AuthPromptCardProps) {
  const { t } = useI18n();

  return (
    <View style={styles.container}>
      <View style={styles.iconRing}>
        <MaterialCommunityIcons name={icon as any} size={44} color={Colors.primary} />
      </View>

      <Text style={styles.title}>{title}</Text>
      <Text style={styles.subtitle}>{subtitle}</Text>

      <Button
        mode="contained"
        onPress={() => router.push('/(auth)/login' as any)}
        style={styles.loginBtn}
        buttonColor={Colors.primary}
        labelStyle={styles.loginBtnLabel}
        icon="account-arrow-right"
      >
        {t.authGate.loginBtn}
      </Button>

      {showGuestHint && (
        <Text style={styles.guestHint}>{t.authGate.guestInfo}</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.xl,
    paddingBottom: 60,
  },
  iconRing: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: Colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.lg,
  },
  title: {
    fontSize: Typography.h3,
    fontWeight: '700',
    color: Colors.text,
    textAlign: 'center',
    marginBottom: Spacing.sm,
  },
  subtitle: {
    fontSize: Typography.body,
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: Spacing.xl,
  },
  loginBtn: {
    borderRadius: BorderRadius.lg,
    paddingVertical: 4,
    width: '100%',
    marginBottom: Spacing.md,
  },
  loginBtnLabel: {
    fontSize: Typography.body,
    fontWeight: '600',
  },
  guestHint: {
    fontSize: Typography.caption,
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: 18,
  },
});
