/**
 * チーム／グループチャット用の試合分析カード。
 * 詳細閲覧と端末へのローカル保存（ダウンロード）を提供する。
 */
import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { router } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { gameService } from '../services/gameService';
import { Colors, Spacing, Typography, BorderRadius } from '../constants/theme';

interface Props {
  content: string;
  gameId: string;
  senderName?: string;
  timestamp: string;
  /** 送信側吹き出し配置（チームチャット用） */
  isSent?: boolean;
  /** false のとき自分の送信でも送信者名を出す（グループチャット用） */
  hideSenderWhenSent?: boolean;
}

export default function GameAnalyticsCard({
  content,
  gameId,
  senderName,
  timestamp,
  isSent = false,
  hideSenderWhenSent = true,
}: Props) {
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const summaryLines = content
    .split('\n')
    .filter((line) => line.trim() && line !== '---' && !line.startsWith('BaseLedger'));
  const scoreLine = summaryLines[0] ?? content;
  const showSender = !!senderName && !(hideSenderWhenSent && isSent);

  const handleSaveToDevice = useCallback(async () => {
    if (saving || saved) return;
    setSaving(true);
    try {
      const result = await gameService.importSharedGameToLocal(gameId);
      if (result === 'imported') {
        setSaved(true);
        Alert.alert('保存しました', '分析一覧に追加しました。いつでも閲覧できます。');
      } else if (result === 'already_local') {
        setSaved(true);
        Alert.alert('保存済み', 'この試合はすでに端末に保存されています。');
      } else if (result === 'forbidden') {
        Alert.alert('エラー', 'この試合を保存する権限がありません。');
      } else {
        Alert.alert('エラー', '試合データが見つかりません。');
      }
    } catch (e: unknown) {
      Alert.alert('エラー', (e as Error)?.message ?? '端末への保存に失敗しました。');
    } finally {
      setSaving(false);
    }
  }, [gameId, saving, saved]);

  return (
    <View
      style={[
        styles.wrapper,
        isSent ? styles.wrapperSent : styles.wrapperReceived,
      ]}
    >
      {showSender && <Text style={styles.senderName}>{senderName}</Text>}
      <View style={styles.card}>
        <TouchableOpacity
          onPress={() => router.push(`/(tabs)/analytics/${gameId}` as any)}
          activeOpacity={0.8}
        >
          <View style={styles.header}>
            <MaterialCommunityIcons name="baseball" size={18} color={Colors.primary} />
            <Text style={styles.title}>試合分析</Text>
          </View>
          <Text style={styles.score} numberOfLines={3}>
            {scoreLine}
          </Text>
          {summaryLines.length > 1 && (
            <Text style={styles.sub} numberOfLines={2}>
              {summaryLines.slice(1).join('\n')}
            </Text>
          )}
          <Text style={styles.link}>詳細を見る →</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.saveBtn, (saving || saved) && styles.saveBtnDisabled]}
          onPress={handleSaveToDevice}
          disabled={saving || saved}
          activeOpacity={0.8}
        >
          {saving ? (
            <ActivityIndicator size="small" color={Colors.primary} />
          ) : (
            <>
              <MaterialCommunityIcons
                name={saved ? 'check-circle-outline' : 'download-outline'}
                size={16}
                color={Colors.primary}
              />
              <Text style={styles.saveBtnText}>
                {saved ? '保存済み' : '端末に保存'}
              </Text>
            </>
          )}
        </TouchableOpacity>

        <Text style={styles.time}>{timestamp}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    marginVertical: Spacing.xs,
    maxWidth: '85%',
  },
  wrapperSent: {
    alignSelf: 'flex-end',
  },
  wrapperReceived: {
    alignSelf: 'flex-start',
  },
  senderName: {
    fontSize: Typography.caption,
    color: Colors.primary,
    fontWeight: '600',
    marginBottom: 3,
    marginLeft: 4,
  },
  card: {
    backgroundColor: Colors.card,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.border,
    borderLeftWidth: 4,
    borderLeftColor: Colors.primary,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Spacing.xs,
    gap: 6,
  },
  title: {
    fontSize: Typography.bodySmall,
    fontWeight: '700',
    color: Colors.primary,
  },
  score: {
    fontSize: Typography.body,
    fontWeight: '600',
    color: Colors.text,
    lineHeight: 22,
  },
  sub: {
    fontSize: Typography.bodySmall,
    color: Colors.textSecondary,
    marginTop: 4,
    lineHeight: 20,
  },
  link: {
    fontSize: Typography.bodySmall,
    fontWeight: '600',
    color: Colors.primary,
    marginTop: Spacing.sm,
  },
  saveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: Spacing.sm,
    paddingVertical: Spacing.xs + 2,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.primary,
    backgroundColor: Colors.primaryLight,
  },
  saveBtnDisabled: {
    opacity: 0.7,
  },
  saveBtnText: {
    fontSize: Typography.bodySmall,
    fontWeight: '700',
    color: Colors.primary,
  },
  time: {
    fontSize: Typography.tiny,
    color: Colors.textSecondary,
    marginTop: 6,
    alignSelf: 'flex-end',
  },
});
