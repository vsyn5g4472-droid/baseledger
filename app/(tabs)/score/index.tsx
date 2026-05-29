import React, { useState, useCallback } from 'react';
import { View, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Text, Button } from 'react-native-paper';
import { router } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Colors, Spacing, Typography, BorderRadius } from '../../../src/constants/theme';
import { useI18n } from '../../../src/i18n';
import { useGameStore } from '../../../src/stores/gameStore';
import { DRAFT_GAME_KEY } from '../../../src/db';

export default function ScoreIndexScreen() {
  const { t } = useI18n();
  const loadGame = useGameStore((s) => s.loadGame);
  const game     = useGameStore((s) => s.game);

  // ── 下書き存在チェック（画面フォーカス時に毎回再確認） ──────────────
  const [hasDraft, setHasDraft] = useState(false);
  useFocusEffect(
    useCallback(() => {
      AsyncStorage.getItem(DRAFT_GAME_KEY).then((json) => {
        setHasDraft(!!json);
      });
    }, []),
  );

  const handleResumeDraft = async () => {
    const json = await AsyncStorage.getItem(DRAFT_GAME_KEY);
    if (!json) return;
    try {
      const { gameId } = JSON.parse(json);
      if (!game || game.id !== gameId) {
        await loadGame(gameId);
      }
      await AsyncStorage.removeItem(DRAFT_GAME_KEY);
      setHasDraft(false);
      router.push('/(tabs)/score/main');
    } catch {}
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* ヘッダー */}
      <View style={styles.header}>
        <MaterialCommunityIcons name="baseball" size={40} color={Colors.primary} />
        <Text style={styles.title}>{t.app.title}</Text>
        <Text style={styles.subtitle}>{t.app.subtitle}</Text>
      </View>

      {/* ===== クイックスタート ===== */}
      <TouchableOpacity
        style={styles.quickStartCard}
        onPress={() => router.push('/(tabs)/score/start' as any)}
        activeOpacity={0.88}
      >
        <View style={styles.cardLeft}>
          <View style={styles.cardIconWrap}>
            <MaterialCommunityIcons name="lightning-bolt" size={26} color={Colors.white} />
          </View>
          <View style={styles.cardTextWrap}>
            <Text style={styles.cardTitle}>クイックスタート</Text>
            <Text style={styles.cardSub}>選手登録は後からでOK</Text>
          </View>
        </View>
        <MaterialCommunityIcons name="chevron-right" size={22} color={Colors.white} />
      </TouchableOpacity>

      {/* ===== 通常モード ===== */}
      <TouchableOpacity
        style={styles.normalCard}
        onPress={() => router.push('/(tabs)/score/normal' as any)}
        activeOpacity={0.88}
      >
        <View style={styles.cardLeft}>
          <View style={styles.cardIconWrap}>
            <MaterialCommunityIcons name="clipboard-text-outline" size={26} color={Colors.white} />
          </View>
          <View style={styles.cardTextWrap}>
            <Text style={styles.cardTitle}>通常モード</Text>
            <Text style={styles.cardSub}>チーム登録・球場情報など詳細設定</Text>
          </View>
        </View>
        <MaterialCommunityIcons name="chevron-right" size={22} color={Colors.white} />
      </TouchableOpacity>

      {/* ===== スポット打席 ===== */}
      <TouchableOpacity
        style={styles.spotCard}
        onPress={() => router.push('/(tabs)/score/spot' as any)}
        activeOpacity={0.88}
      >
        <View style={styles.cardLeft}>
          <View style={styles.cardIconWrap}>
            <MaterialCommunityIcons name="baseball-bat" size={26} color={Colors.white} />
          </View>
          <View style={styles.cardTextWrap}>
            <Text style={styles.cardTitle}>スポット打席</Text>
            <Text style={styles.cardSub}>1打席分を素早く記録。練習・試合問わず使えます。</Text>
          </View>
        </View>
        <MaterialCommunityIcons name="chevron-right" size={22} color={Colors.white} />
      </TouchableOpacity>

      {/* 下書き再開ボタン */}
      {hasDraft && (
        <>
          <TouchableOpacity
            style={styles.draftResumeBtn}
            onPress={handleResumeDraft}
            activeOpacity={0.8}
          >
            <MaterialCommunityIcons name="pencil-outline" size={18} color={Colors.primary} />
            <Text style={styles.draftResumeBtnText}>下書きの試合を再開する</Text>
          </TouchableOpacity>
          <Text style={styles.draftResumeNote}>※ 下書きは1試合まで保存できます</Text>
        </>
      )}

      {/* 履歴リンク */}
      <Button
        mode="text"
        onPress={() => router.push('/(tabs)/score/history' as any)}
        style={styles.historyLink}
        icon="history"
      >
        {t.common.history}
      </Button>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  content:   { padding: Spacing.md, paddingBottom: 120 },

  header:   { alignItems: 'center', paddingVertical: Spacing.lg },
  title:    { fontSize: Typography.h1, fontWeight: '900', color: Colors.primary, marginTop: Spacing.sm },
  subtitle: { fontSize: Typography.bodySmall, color: Colors.textSecondary, marginTop: 2 },

  // 共通カードパーツ
  cardLeft: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  cardIconWrap: {
    width: 44,
    height: 44,
    borderRadius: BorderRadius.full,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardTextWrap: { gap: 2 },
  cardTitle:    { fontSize: Typography.h4, fontWeight: '800', color: Colors.white },
  cardSub:      { fontSize: Typography.caption, color: 'rgba(255,255,255,0.85)' },

  // カードボタン
  quickStartCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: Colors.primary,
    borderRadius: BorderRadius.xl,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 6,
  },
  normalCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: Colors.action,
    borderRadius: BorderRadius.xl,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
    shadowColor: Colors.action,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 6,
  },
  spotCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#E65100',
    borderRadius: BorderRadius.xl,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
    shadowColor: '#E65100',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 6,
  },

  // 下書き
  draftResumeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.xs,
    borderWidth: 1.5,
    borderColor: Colors.primary,
    borderRadius: BorderRadius.xl,
    paddingVertical: Spacing.sm + 2,
    marginTop: Spacing.sm,
  },
  draftResumeBtnText: { fontSize: Typography.bodySmall, fontWeight: '700', color: Colors.primary },
  draftResumeNote: {
    fontSize: Typography.tiny,
    color: Colors.textSecondary,
    textAlign: 'center',
    marginTop: Spacing.xs,
    marginBottom: Spacing.sm,
  },

  historyLink: { marginTop: Spacing.md },
});
