import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { router, Stack } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { db } from '../../../src/db';
import type { GameState } from '../../../src/types/game';
import { Colors, Spacing, Typography, BorderRadius } from '../../../src/constants/theme';
import { useI18n } from '../../../src/i18n';

function formatDate(ts: number): string {
  const d = new Date(ts);
  return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`;
}

function GameCard({ game }: { game: GameState }) {
  const { t } = useI18n();
  const isCompleted = game.phase === 'finished';

  return (
    <TouchableOpacity
      style={styles.card}
      onPress={() => router.push(`/(tabs)/analytics/${game.id}` as any)}
      activeOpacity={0.8}
    >
      {/* Status + Date row */}
      <View style={styles.cardTop}>
        <View
          style={[
            styles.statusBadge,
            { backgroundColor: isCompleted ? Colors.primaryLight : Colors.accentSoft },
          ]}
        >
          <Text
            style={[
              styles.statusText,
              { color: isCompleted ? Colors.primary : Colors.accent },
            ]}
          >
            {isCompleted ? t.analytics.completed : t.analytics.inProgress}
          </Text>
        </View>
        <Text style={styles.dateText}>{formatDate(game.createdAt)}</Text>
      </View>

      {/* Score row */}
      <View style={styles.scoreRow}>
        <View style={styles.teamBlock}>
          <Text style={styles.teamLabel}>{t.common.top}</Text>
          <Text style={styles.teamName} numberOfLines={1}>
            {game.awayTeam.name}
          </Text>
        </View>
        <View style={styles.scoreBlock}>
          <Text style={styles.scoreNum}>{game.scoreboard.awayTotal}</Text>
          <Text style={styles.scoreSep}>:</Text>
          <Text style={styles.scoreNum}>{game.scoreboard.homeTotal}</Text>
        </View>
        <View style={[styles.teamBlock, { alignItems: 'flex-end' }]}>
          <Text style={styles.teamLabel}>{t.common.bottom}</Text>
          <Text style={styles.teamName} numberOfLines={1}>
            {game.homeTeam.name}
          </Text>
        </View>
      </View>

      {/* Footer */}
      <View style={styles.cardFooter}>
        <Text style={styles.footerText}>
          {game.pitchLogs.length}球 · {game.atBatLogs.length}打席
        </Text>
        <View style={styles.viewBtn}>
          <Text style={styles.viewBtnText}>{t.analytics.viewAnalysis}</Text>
          <MaterialCommunityIcons name="chevron-right" size={14} color={Colors.primary} />
        </View>
      </View>
    </TouchableOpacity>
  );
}

export default function AnalyticsIndexScreen() {
  const { t } = useI18n();
  const [games, setGames] = useState<GameState[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadGames = useCallback(async () => {
    const all = await db.games.getAll();
    setGames(all);
  }, []);

  useEffect(() => {
    loadGames().finally(() => setLoading(false));
  }, [loadGames]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadGames();
    setRefreshing(false);
  }, [loadGames]);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={Colors.primary} />
      </View>
    );
  }

  return (
    <>
      <Stack.Screen options={{ title: t.analytics.title }} />

      {/* ランキングバナー */}
      <TouchableOpacity
        style={styles.rankingBanner}
        onPress={() => router.push('/(tabs)/analytics/leaderboard' as any)}
        activeOpacity={0.85}
      >
        <MaterialCommunityIcons name="trophy" size={20} color={Colors.accent} />
        <View style={{ flex: 1 }}>
          <Text style={styles.rankingTitle}>チーム内ランキング</Text>
          <Text style={styles.rankingSubtitle}>打率・球速王など5カテゴリのTOP3</Text>
        </View>
        <MaterialCommunityIcons name="chevron-right" size={20} color={Colors.accent} />
      </TouchableOpacity>

      {/* 選手・バッテリー分析バナー */}
      <TouchableOpacity
        style={styles.analysisBanner}
        onPress={() => router.push('/analysis' as any)}
        activeOpacity={0.85}
      >
        <MaterialCommunityIcons name="chart-scatter-plot" size={20} color={Colors.primary} />
        <View style={{ flex: 1 }}>
          <Text style={styles.analysisTitle}>選手・バッテリー分析</Text>
          <Text style={styles.analysisSubtitle}>打者の癖・配球パターンを深掘り</Text>
        </View>
        <MaterialCommunityIcons name="chevron-right" size={20} color={Colors.primary} />
      </TouchableOpacity>

      <FlatList
        data={games}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => <GameCard game={item} />}
        contentContainerStyle={
          games.length === 0 ? styles.emptyContainer : styles.listContent
        }
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={Colors.primary}
          />
        }
        ListEmptyComponent={
          <View style={styles.emptyContent}>
            <MaterialCommunityIcons name="chart-bar" size={60} color={Colors.border} />
            <Text style={styles.emptyTitle}>{t.analytics.noGames}</Text>
            <Text style={styles.emptySub}>{t.analytics.noGamesSub}</Text>
          </View>
        }
      />
    </>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.background },
  rankingBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    margin: Spacing.md,
    marginBottom: 0,
    padding: Spacing.md,
    backgroundColor: Colors.accentSoft,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: Colors.accent,
  },
  rankingTitle: {
    fontSize: Typography.bodySmall,
    fontWeight: '800',
    color: Colors.text,
  },
  rankingSubtitle: {
    fontSize: Typography.tiny,
    color: Colors.textSecondary,
    marginTop: 1,
  },
  analysisBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginHorizontal: Spacing.md,
    marginTop: Spacing.sm,
    padding: Spacing.md,
    backgroundColor: Colors.primaryLight,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: Colors.primary,
  },
  analysisTitle: {
    fontSize: Typography.bodySmall,
    fontWeight: '800',
    color: Colors.text,
  },
  analysisSubtitle: {
    fontSize: Typography.tiny,
    color: Colors.textSecondary,
    marginTop: 1,
  },
  listContent: { padding: Spacing.md, gap: Spacing.md },
  emptyContainer: { flex: 1 },
  emptyContent: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.xl,
    marginTop: 100,
  },
  emptyTitle: {
    fontSize: Typography.h4,
    fontWeight: '600',
    color: Colors.text,
    marginTop: Spacing.md,
    textAlign: 'center',
  },
  emptySub: {
    fontSize: Typography.bodySmall,
    color: Colors.textSecondary,
    textAlign: 'center',
    marginTop: Spacing.sm,
  },
  card: {
    backgroundColor: Colors.white,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    shadowColor: '#000',
    shadowOpacity: 0.09,
    shadowRadius: 6,
    elevation: 2,
    shadowOffset: { width: 0, height: 2 },
  },
  cardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.xs,
  },
  statusBadge: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: BorderRadius.sm,
  },
  statusText: { fontSize: Typography.tiny, fontWeight: '700' },
  dateText: { fontSize: Typography.caption, color: Colors.textSecondary },
  scoreRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Spacing.sm,
  },
  teamBlock: { flex: 1 },
  teamLabel: { fontSize: Typography.tiny, color: Colors.textSecondary },
  teamName: { fontSize: Typography.body, fontWeight: '700', color: Colors.text },
  scoreBlock: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
  },
  scoreNum: {
    fontSize: Typography.h2,
    fontWeight: '800',
    color: Colors.primary,
    minWidth: 32,
    textAlign: 'center',
  },
  scoreSep: {
    fontSize: Typography.h4,
    color: Colors.textSecondary,
    marginHorizontal: Spacing.xs,
  },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: Spacing.xs,
    paddingTop: Spacing.sm,
    borderTopWidth: 0.5,
    borderTopColor: Colors.border,
  },
  footerText: { fontSize: Typography.caption, color: Colors.textSecondary },
  viewBtn: { flexDirection: 'row', alignItems: 'center' },
  viewBtnText: { fontSize: Typography.caption, color: Colors.primary, fontWeight: '600' },
});
