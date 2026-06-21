import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, StyleSheet, TouchableOpacity, Linking, ScrollView, ActivityIndicator, Alert } from 'react-native';
import { Text, Divider, Switch, Button } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import { useRouter } from 'expo-router';
import { useI18n, type Locale } from '../../../src/i18n';
import { Colors, Spacing, Typography, BorderRadius } from '../../../src/constants/theme';
import { useAuth } from '../../../src/contexts/AuthContext';
import type { RecordingItemId, RecordingPreferences } from '../../../src/models/types';
import {
  mergeRecordingPreferences,
  RECORDING_ITEM_DETAIL_ONLY,
  RECORDING_ITEM_IDS,
} from '../../../src/constants/recordingPreferences';
import { saveRecordingPreferences, resetRecordingPreferencesToDefault } from '../../../src/services/recordingPreferencesService';

const LANGUAGES: { locale: Locale; label: string; nativeLabel: string }[] = [
  { locale: 'ja', label: '日本語', nativeLabel: 'Japanese' },
  { locale: 'en', label: 'English', nativeLabel: '英語' },
];

const PRIVACY_URL = 'https://example.com/privacy';
const TERMS_URL = 'https://example.com/terms';

const ITEM_LABEL: Record<RecordingItemId, string> = {
  foul_tip: 'ファウルチップ',
  sacrifice_fly: '犠飛',
  fielders_choice: '野選',
  double_play: '併殺打',
  triple_play: '三重殺',
  error_at_bat: '失策による出塁',
  pickoff: '牽制',
  pickoff_balk: '牽制（ボーク）',
  pickoff_error: '牽制（失策進塁）',
  bunt_stance: 'バントの構え',
  bunt_detail: 'バント分類',
  sign_play: 'サイン',
  sign_miss: 'サインミス',
  pitch_zone_detail: '球威ゾーン（高/低/内外の詳細）',
  pitch_entry: '配球',
  batted_ball_location: '打球の落下位置（フィールド図）',
  batted_ball_distance: '推定飛距離',
  runner_advancement_detail: '進塁の詳細',
  substitution: '選手交代',
};

export default function SettingsScreen() {
  const { t, locale, setLocale } = useI18n();
  const { currentUser, refreshUser, deleteAccount } = useAuth();
  const router = useRouter();
  const appVersion = Constants.expoConfig?.version ?? '1.0.0';
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const merged = useMemo(
    () => mergeRecordingPreferences(currentUser?.recordingPreferences),
    [currentUser?.recordingPreferences],
  );

  const [local, setLocal] = useState<RecordingPreferences | null>(null);
  const prefs = local ?? merged;

  useEffect(() => {
    setLocal(null);
  }, [currentUser?.uid]);

  const flush = useCallback(
    async (next: RecordingPreferences) => {
      if (!currentUser) {
        setLocal(next);
        return;
      }
      setSaving(true);
      try {
        await saveRecordingPreferences(currentUser.uid, next);
        await refreshUser();
        setLocal(null);
      } catch (e) {
        Alert.alert('保存に失敗しました', (e as Error).message);
      } finally {
        setSaving(false);
      }
    },
    [currentUser, refreshUser],
  );

  const setDetail = (d: boolean) => {
    const next: RecordingPreferences = { ...prefs, detailMode: d, items: { ...prefs.items } };
    flush(next);
  };

  const setRealtimeMemo = (on: boolean) => {
    const next: RecordingPreferences = { ...prefs, realtimeMemo: on, items: { ...prefs.items } };
    flush(next);
  };

  const setItem = (id: RecordingItemId, on: boolean) => {
    const next: RecordingPreferences = { ...prefs, items: { ...prefs.items, [id]: on } };
    flush(next);
  };

  const handleReset = () => {
    if (!currentUser) {
      setLocal(mergeRecordingPreferences(null));
      return;
    }
    Alert.alert('デフォルトに戻す', '記録の表示設定を初期値に戻します。', [
      { text: 'キャンセル', style: 'cancel' },
      {
        text: '戻す',
        onPress: async () => {
          setSaving(true);
          try {
            await resetRecordingPreferencesToDefault(currentUser.uid);
            await refreshUser();
            setLocal(null);
          } catch (e) {
            Alert.alert('失敗', (e as Error).message);
          } finally {
            setSaving(false);
          }
        },
      },
    ]);
  };

  const handleDeleteAccount = useCallback(() => {
    Alert.alert(
      'アカウントを削除しますか？',
      'この操作は取り消せません。すべての試合データ・記録が完全に削除されます。',
      [
        { text: 'キャンセル', style: 'cancel' },
        {
          text: '削除する',
          style: 'destructive',
          onPress: async () => {
            setDeleting(true);
            try {
              await deleteAccount();
              router.replace('/(auth)/login');
            } catch (e: unknown) {
              setDeleting(false);
              const err = e as { code?: string; message?: string };
              if (err.code === 'auth/requires-recent-login') {
                Alert.alert(
                  '再認証が必要です',
                  'セキュリティのため、一度サインアウトして再度サインインしてからアカウントを削除してください。',
                );
              } else {
                Alert.alert('削除に失敗しました', err.message ?? '不明なエラーが発生しました。');
              }
            }
          },
        },
      ],
    );
  }, [deleteAccount, router]);

  const visibleItems = useMemo(
    () =>
      RECORDING_ITEM_IDS.filter((id) => prefs.detailMode || !RECORDING_ITEM_DETAIL_ONLY.has(id)),
    [prefs.detailMode, prefs.items],
  );

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.scrollContent}>
      {saving && (
        <View style={styles.savingBar}>
          <ActivityIndicator size="small" color={Colors.primary} />
        </View>
      )}

      {/* 記録カスタマイズ */}
      <View style={styles.section}>
        <Text style={styles.sectionLabel}>スコア記録の表示</Text>
        <Text style={styles.sectionSub}>
          球速のON/OFFは各試合のセットアップで切り替えます。
        </Text>

        {!currentUser && (
          <Text style={styles.hint}>
            ログインすると端末横断で設定を保存します（未ログインはこの端末のセッションのみ）。
          </Text>
        )}

        <View style={styles.card}>
          <View style={styles.row}>
            <Text style={styles.switchLabel}>詳細モード</Text>
            <Switch value={prefs.detailMode} onValueChange={setDetail} />
          </View>
          {prefs.detailMode && (
            <>
              <Divider />
              <View style={styles.row}>
                <View style={styles.switchLabelCol}>
                  <Text style={styles.switchLabelSmall}>リアルタイムメモ</Text>
                  <Text style={styles.switchHint}>試合中に打席メモを入力できます</Text>
                </View>
                <Switch
                  value={prefs.realtimeMemo === true}
                  onValueChange={setRealtimeMemo}
                />
              </View>
            </>
          )}
          {visibleItems.map((id) => (
            <View key={id}>
              <Divider />
              <View style={styles.row}>
                <Text style={styles.switchLabelSmall}>{ITEM_LABEL[id]}</Text>
                <Switch
                  value={prefs.items[id] === true}
                  onValueChange={(v) => setItem(id, v)}
                />
              </View>
            </View>
          ))}
          <Divider />
          <View style={styles.resetRow}>
            <Button mode="outlined" onPress={handleReset} textColor={Colors.primary}>
              デフォルトに戻す
            </Button>
          </View>
        </View>
      </View>

      {/* 言語設定 */}
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
                  style={styles.langRow}
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

      {/* 法的情報 */}
      <View style={styles.section}>
        <Text style={styles.sectionLabel}>法的情報</Text>

        <View style={styles.card}>
          <TouchableOpacity
            style={styles.legalRow}
            onPress={() => Linking.openURL(PRIVACY_URL)}
            activeOpacity={0.7}
          >
            <View style={styles.legalRowLeft}>
              <MaterialCommunityIcons name="shield-check-outline" size={20} color={Colors.textSecondary} />
              <Text style={styles.legalLabel}>プライバシーポリシー</Text>
            </View>
            <MaterialCommunityIcons name="chevron-right" size={20} color={Colors.textSecondary} />
          </TouchableOpacity>

          <Divider />

          <TouchableOpacity
            style={styles.legalRow}
            onPress={() => Linking.openURL(TERMS_URL)}
            activeOpacity={0.7}
          >
            <View style={styles.legalRowLeft}>
              <MaterialCommunityIcons name="file-document-outline" size={20} color={Colors.textSecondary} />
              <Text style={styles.legalLabel}>利用規約</Text>
            </View>
            <MaterialCommunityIcons name="chevron-right" size={20} color={Colors.textSecondary} />
          </TouchableOpacity>
        </View>
      </View>

      {/* アカウント管理 */}
      {currentUser && (
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>アカウント</Text>
          <View style={styles.card}>
            <TouchableOpacity
              style={styles.legalRow}
              onPress={() => router.push('/profile/block-list' as any)}
              activeOpacity={0.7}
            >
              <View style={styles.legalRowLeft}>
                <MaterialCommunityIcons name="account-cancel-outline" size={20} color={Colors.textSecondary} />
                <Text style={styles.legalLabel}>ブロックリスト</Text>
              </View>
              <MaterialCommunityIcons name="chevron-right" size={20} color={Colors.textSecondary} />
            </TouchableOpacity>

            <Divider />

            <TouchableOpacity
              style={styles.deleteRow}
              onPress={handleDeleteAccount}
              activeOpacity={0.7}
              disabled={deleting}
            >
              {deleting ? (
                <ActivityIndicator size="small" color={Colors.error} />
              ) : (
                <MaterialCommunityIcons name="delete-outline" size={20} color={Colors.error} />
              )}
              <Text style={styles.deleteLabel}>
                {deleting ? '削除中...' : 'アカウントを削除する'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* アプリ情報 */}
      <View style={styles.section}>
        <View style={styles.versionRow}>
          <Text style={styles.versionLabel}>BallPark</Text>
          <Text style={styles.versionValue}>v{appVersion}</Text>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  scrollContent: { padding: Spacing.md, paddingBottom: Spacing.xl * 2 },
  savingBar: { padding: 4, alignItems: 'center' },
  section: { marginTop: Spacing.md },
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
  hint: { fontSize: 12, color: '#B8860B', marginBottom: 8, paddingHorizontal: 4 },
  card: {
    backgroundColor: Colors.card,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
  },
  switchLabel: { fontSize: Typography.body, fontWeight: '600', color: Colors.text, flex: 1 },
  switchLabelCol: { flex: 1, paddingRight: 8 },
  switchHint: { fontSize: Typography.caption, color: Colors.textSecondary, marginTop: 2 },
  switchLabelSmall: { fontSize: Typography.bodySmall, color: Colors.text, flex: 1, paddingRight: 8 },
  resetRow: { padding: Spacing.md, alignItems: 'center' },
  langRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.lg,
  },
  rowLeft: { gap: 2 },
  langLabel: { fontSize: Typography.body, fontWeight: '500', color: Colors.text },
  langLabelSelected: { color: Colors.primary, fontWeight: '700' },
  langSub: { fontSize: Typography.caption, color: Colors.textSecondary },
  legalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.lg,
  },
  legalRowLeft: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  legalLabel: { fontSize: Typography.body, fontWeight: '500', color: Colors.text },
  versionRow: { alignItems: 'center', paddingVertical: Spacing.lg, gap: 4 },
  versionLabel: { fontSize: Typography.bodySmall, fontWeight: '600', color: Colors.textSecondary },
  versionValue: { fontSize: Typography.caption, color: Colors.textSecondary },
  deleteRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.lg,
  },
  deleteLabel: { fontSize: Typography.body, fontWeight: '500', color: Colors.error },
});
