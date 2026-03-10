import React from 'react';
import { View, StyleSheet, TouchableOpacity } from 'react-native';
import { Text, Divider } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useI18n, type Locale } from '../../../src/i18n';
import { Colors, Spacing, Typography, BorderRadius } from '../../../src/constants/theme';

const LANGUAGES: { locale: Locale; label: string; nativeLabel: string }[] = [
  { locale: 'ja', label: '日本語', nativeLabel: 'Japanese' },
  { locale: 'en', label: 'English', nativeLabel: '英語' },
];

export default function SettingsScreen() {
  const { t, locale, setLocale } = useI18n();

  return (
    <View style={styles.container}>
      <View style={styles.section}>
        <Text style={styles.sectionLabel}>{t.settings.language}</Text>
        <Text style={styles.sectionSub}>{t.settings.selectLanguage}</Text>

        <View style={styles.card}>
          {LANGUAGES.map((lang, index) => {
            const isSelected = locale === lang.locale;
            return (
              <React.Fragment key={lang.locale}>
                {index > 0 && <Divider />}
                <TouchableOpacity
                  style={styles.row}
                  onPress={() => setLocale(lang.locale)}
                  activeOpacity={0.7}
                >
                  <View style={styles.rowLeft}>
                    <Text style={[styles.langLabel, isSelected && styles.langLabelSelected]}>
                      {lang.label}
                    </Text>
                    <Text style={styles.langSub}>{lang.nativeLabel}</Text>
                  </View>
                  {isSelected && (
                    <MaterialCommunityIcons
                      name="check-circle"
                      size={22}
                      color={Colors.primary}
                    />
                  )}
                </TouchableOpacity>
              </React.Fragment>
            );
          })}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
    padding: Spacing.md,
  },
  section: {
    marginTop: Spacing.md,
  },
  sectionLabel: {
    fontSize: Typography.caption,
    fontWeight: '600',
    color: Colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 4,
    paddingHorizontal: 4,
  },
  sectionSub: {
    fontSize: Typography.bodySmall,
    color: Colors.textSecondary,
    marginBottom: Spacing.sm,
    paddingHorizontal: 4,
  },
  card: {
    backgroundColor: Colors.card,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: 'hidden',
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 2,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.lg,
  },
  rowLeft: {
    gap: 2,
  },
  langLabel: {
    fontSize: Typography.body,
    fontWeight: '500',
    color: Colors.text,
  },
  langLabelSelected: {
    color: Colors.primary,
    fontWeight: '700',
  },
  langSub: {
    fontSize: Typography.caption,
    color: Colors.textSecondary,
  },
});
