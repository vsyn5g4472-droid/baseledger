import React from 'react';
import { View, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { Text, Button } from 'react-native-paper';
import { router } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Colors, Spacing, Typography, BorderRadius } from '../../../src/constants/theme';
import { useI18n } from '../../../src/i18n';
export default function ScoreIndexScreen() {
  const { t } = useI18n();

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

      {/* ===== 偵察モード ===== */}
      <TouchableOpacity
        style={styles.scoutCard}
        onPress={() => router.push('/(tabs)/score/normal?mode=scout' as any)}
        activeOpacity={0.88}
      >
        <View style={styles.cardLeft}>
          <View style={styles.cardIconWrap}>
            <MaterialCommunityIcons name="binoculars" size={26} color={Colors.white} />
          </View>
          <View style={styles.cardTextWrap}>
            <Text style={styles.cardTitle}>偵察モード</Text>
            <Text style={styles.cardSub}>相手チームを偵察・記録します。データは偵察記録として保存されます。</Text>
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
  scoutCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#2E7D32',
    borderRadius: BorderRadius.xl,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
    shadowColor: '#2E7D32',
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

  historyLink: { marginTop: Spacing.md },
});
