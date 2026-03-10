import React, { useState, useEffect } from 'react';
import { View, StyleSheet, KeyboardAvoidingView, Platform, TouchableOpacity, ScrollView } from 'react-native';
import { Text, TextInput, Button, ActivityIndicator } from 'react-native-paper';
import { router } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useAuth } from '../../src/contexts/AuthContext';
import { useI18n } from '../../src/i18n';
import { Colors, Spacing, Typography, BorderRadius } from '../../src/constants/theme';
import { updateUsername, checkUsernameAvailable } from '../../src/services/auth/userAuthService';
import { generateCandidates } from '../../src/utils/usernameGenerator';

type SuggestionStatus = 'checking' | 'available' | 'taken';
type Suggestion = { id: string; status: SuggestionStatus };

export default function OnboardingScreen() {
  const { clearNewUser, currentUser } = useAuth();
  const { t } = useI18n();
  const [username, setUsername] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);

  const isValid = /^[a-zA-Z0-9_]{3,20}$/.test(username);

  // Generate suggestions from the user's display name and check availability
  useEffect(() => {
    if (!currentUser?.displayName) return;

    const candidates = generateCandidates(
      currentUser.displayName,
      currentUser.email ?? undefined,
    );
    if (candidates.length === 0) return;

    setSuggestions(candidates.map((id) => ({ id, status: 'checking' })));

    candidates.forEach(async (id) => {
      try {
        const available = await checkUsernameAvailable(id);
        setSuggestions((prev) =>
          prev.map((s) => (s.id === id ? { ...s, status: available ? 'available' : 'taken' } : s)),
        );
      } catch {
        setSuggestions((prev) =>
          prev.map((s) => (s.id === id ? { ...s, status: 'taken' } : s)),
        );
      }
    });
  }, []);

  const handleConfirm = async () => {
    if (!isValid) {
      setError('3〜20文字の英数字・アンダースコアで入力してください');
      return;
    }
    setSaving(true);
    try {
      if (currentUser) {
        await updateUsername(currentUser.uid, username);
      }
      clearNewUser();
      router.replace('/(tabs)/feed');
    } catch {
      setError('ユーザーIDの保存に失敗しました。もう一度お試しください。');
    } finally {
      setSaving(false);
    }
  };

  const handleSkip = () => {
    clearNewUser();
    router.replace('/(tabs)/feed');
  };

  const visibleSuggestions = suggestions.filter((s) => s.status !== 'taken');

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Icon */}
        <View style={styles.iconRing}>
          <MaterialCommunityIcons name="at" size={44} color={Colors.primary} />
        </View>

        <Text style={styles.title}>{t.auth.onboarding.title}</Text>
        <Text style={styles.subtitle}>{t.auth.onboarding.subtitle}</Text>

        {/* Username input */}
        <View style={styles.inputSection}>
          <Text style={styles.inputLabel}>{t.auth.onboarding.usernameLabel}</Text>
          <TextInput
            mode="outlined"
            placeholder={t.auth.onboarding.usernamePlaceholder}
            value={username}
            onChangeText={(v) => {
              setUsername(v);
              setError('');
            }}
            autoCapitalize="none"
            autoCorrect={false}
            style={styles.input}
            left={<TextInput.Icon icon="at" />}
            right={
              username.length > 0 ? (
                <TextInput.Icon
                  icon={isValid ? 'check-circle' : 'close-circle'}
                  color={isValid ? Colors.accent : Colors.error}
                />
              ) : undefined
            }
          />
          <Text style={styles.hint}>{t.auth.onboarding.hint}</Text>
          {error ? <Text style={styles.error}>{error}</Text> : null}
        </View>

        {/* Suggestions */}
        {visibleSuggestions.length > 0 && (
          <View style={styles.suggestionsSection}>
            <View style={styles.suggestionsHeader}>
              <MaterialCommunityIcons name="lightbulb-on" size={14} color={Colors.accent} />
              <Text style={styles.suggestionsLabel}>おすすめのID：</Text>
            </View>
            <View style={styles.suggestionsRow}>
              {visibleSuggestions.map((s) => (
                <TouchableOpacity
                  key={s.id}
                  style={[
                    styles.suggestionPill,
                    s.status === 'available' && styles.suggestionPillAvailable,
                    s.status === 'checking' && styles.suggestionPillChecking,
                  ]}
                  onPress={() => {
                    if (s.status === 'available') {
                      setUsername(s.id);
                      setError('');
                    }
                  }}
                  disabled={s.status !== 'available'}
                  activeOpacity={0.7}
                >
                  {s.status === 'checking' ? (
                    <ActivityIndicator size={12} color={Colors.textSecondary} />
                  ) : (
                    <Text style={styles.suggestionPillText}>@{s.id}</Text>
                  )}
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}

        <Button
          mode="contained"
          onPress={handleConfirm}
          disabled={!isValid || saving}
          style={styles.confirmBtn}
          buttonColor={Colors.primary}
          labelStyle={styles.confirmBtnLabel}
          icon={saving ? undefined : 'check'}
        >
          {saving ? <ActivityIndicator size={16} color={Colors.white} /> : t.auth.onboarding.confirm}
        </Button>

        <Button
          mode="text"
          onPress={handleSkip}
          textColor={Colors.textSecondary}
          style={styles.skipBtn}
        >
          {t.auth.onboarding.skip}
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
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.xl,
    paddingVertical: Spacing.xxl,
  },
  iconRing: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: Colors.primaryLight,
    borderWidth: 2,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.lg,
  },
  title: {
    fontSize: Typography.h2,
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
  inputSection: {
    width: '100%',
    marginBottom: Spacing.md,
  },
  inputLabel: {
    fontSize: Typography.bodySmall,
    fontWeight: '600',
    color: Colors.text,
    marginBottom: Spacing.xs,
  },
  input: {
    backgroundColor: Colors.card,
    width: '100%',
  },
  hint: {
    fontSize: Typography.caption,
    color: Colors.textSecondary,
    marginTop: Spacing.xs,
  },
  error: {
    fontSize: Typography.caption,
    color: Colors.error,
    marginTop: Spacing.xs,
  },

  // ── Suggestions ──────────────────────────────────────────────────────────────
  suggestionsSection: {
    width: '100%',
    backgroundColor: Colors.accentSoft,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: Colors.accent,
    padding: Spacing.sm,
    marginBottom: Spacing.lg,
  },
  suggestionsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: Spacing.xs,
  },
  suggestionsLabel: {
    fontSize: Typography.caption,
    fontWeight: '700',
    color: Colors.text,
  },
  suggestionsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.xs,
  },
  suggestionPill: {
    minWidth: 36,
    minHeight: 30,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 6,
    borderRadius: BorderRadius.full,
    borderWidth: 1.5,
    borderColor: Colors.border,
    backgroundColor: Colors.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  suggestionPillChecking: {
    opacity: 0.5,
  },
  suggestionPillAvailable: {
    borderColor: Colors.primary,
    backgroundColor: Colors.primaryLight,
  },
  suggestionPillText: {
    fontSize: Typography.caption,
    fontWeight: '700',
    color: Colors.primary,
  },

  // ── Buttons ──────────────────────────────────────────────────────────────────
  confirmBtn: {
    borderRadius: BorderRadius.lg,
    paddingVertical: 4,
    width: '100%',
    marginBottom: Spacing.sm,
  },
  confirmBtnLabel: {
    fontSize: Typography.body,
    fontWeight: '600',
  },
  skipBtn: {
    marginTop: Spacing.xs,
  },
});
