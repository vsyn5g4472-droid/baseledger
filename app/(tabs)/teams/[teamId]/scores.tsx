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
import { router, useLocalSearchParams } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { db } from '../../../../src/db';
import type { GameState } from '../../../../src/types/game';
import { Colors, Spacing, Typography, BorderRadius, CardShadow } from '../../../../src/constants/theme';

function formatDate(ts: number): string {
  const d = new Date(ts);
  return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`;
}

function GameCard({ game, teamId }: { game: GameState; teamId: string }) {
  const isCompleted = game.phase === 'finished';

  return (
    <TouchableOpacity
      style={styles.card}
      onPress={() =>
        router.push(`/(tabs)/teams/${teamId}/game?gameId=${game.id}` as any)
      }
      activeOpacity={0.8}
    >
      {/* Top row */}
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
            {isCompleted ? '試合終了' : '進行中'}
          </Text>
        </View>
        <Text style={styles.dateText}>{formatDate(game.createdAt)}</Text>
      </View>

      {/* Score row */}
      <View style={styles.scoreRow}>
        <View style={styles.teamBlock}>
          <Text style={styles.teamLabel}>先攻</Text>
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
          <Text style={styles.teamLabel}>後攻</Text>
          <Text style={styles.teamName} numberOfLines={1}>
            {game.homeTeam.name}
          </Text>
        </View>
      </View>

      {/* Footer */}
      <View style={styles.cardFooter}>
        <Text style={styles.footerText}>
          {game.atBatLogs.length}打席 · {game.pitchLogs.length}球
        </Text>
        <View style={styles.viewBtn}>
          <Text style={styles.viewBtnText}>打席ログ・シェア</Text>
          <MaterialCommunityIcons name="chevron-right" size={14} color={Colors.primary} />
        </View>
      </View>
    </TouchableOpacity>
  );
}

export default function TeamScoresScreen() {
  const { teamId } = useLocalSearchParams<{ teamId: string }>();
  const [games, setGames] = useState<GameState[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadGames = useCallback(async () => {
    const all = await db.games.getAll();
    // Show all games (finished and in-progress) so users can share from recent games too
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
    <FlatList
      data={games}
      keyExtractor={(item) => item.id}
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
      renderItem={({ item }) => (
        <GameCard game={item} teamId={teamId ?? ''} />
      )}
      ListEmptyComponent={
        <View style={styles.emptyContent}>
          <MaterialCommunityIcons name="baseball" size={60} color={Colors.border} />
          <Text style={styles.emptyTitle}>試合記録がありません</Text>
          <Text style={styles.emptySub}>
            試合を記録すると成績が表示されます
          </Text>
        </View>
      }
    />
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.background,
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
    ...CardShadow,
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
