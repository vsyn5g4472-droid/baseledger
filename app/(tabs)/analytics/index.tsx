import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Alert,
} from 'react-native';
import { router, Stack } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { db } from '../../../src/db';
import { gameService } from '../../../src/services/gameService';
import { useGameStore } from '../../../src/stores/gameStore';
import type { GameState } from '../../../src/types/game';
import { Colors, Spacing, Typography, BorderRadius } from '../../../src/constants/theme';
import { useI18n } from '../../../src/i18n';

function formatDate(ts: number): string {
  const d = new Date(ts);
  return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`;
}

// ── 試合カード ────────────────────────────────────────────────────────────────
// 視線の流れ:
//   ① スコア (何対何?) — 最大要素・画面中央
//   ② チーム名 (どこ対どこ?) — スコアの左右
//   ③ 状態バッジ + 日付 (いつ・どんな状態?) — 上部の補足情報
//   ④ 球数・打席数 (どのくらいのボリューム?) — 下部のメタ情報
// カード全体がタップ領域 → 「分析を見る」テキストリンクは不要なので削除
function GameCard({ game, onDelete, onResume }: { game: GameState; onDelete: (id: string) => void; onResume: (id: string) => void }) {
  const { t } = useI18n();
  const isCompleted = game.phase === 'finished';

  // 勝ち負けの判定
  const awayScore = game.scoreboard.awayTotal;
  const homeScore = game.scoreboard.homeTotal;
  const awayWins = awayScore > homeScore;
  const homeWins = homeScore > awayScore;

  return (
    <TouchableOpacity
      style={styles.card}
      onPress={() => router.push(`/(tabs)/analytics/${game.id}` as any)}
      activeOpacity={0.8}
    >
      {/* ③ 状態バッジ + 日付 — 主役の前に文脈を与える補足行 */}
      <View style={styles.cardMeta}>
        {isCompleted && (
          <View style={[styles.statusBadge, { backgroundColor: Colors.statusDoneBg ?? '#E3F2FD' }]}>
            <Text style={[styles.statusText, { color: Colors.statusDone ?? Colors.primary }]}>
              {t.analytics.completed}
            </Text>
          </View>
        )}
        {isCompleted && (
          <TouchableOpacity
            onPress={(e) => { e.stopPropagation(); onResume(game.id); }}
            style={styles.resumeButton}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <MaterialCommunityIcons name="play-circle-outline" size={18} color={Colors.primary} />
            <Text style={styles.resumeText}>再開</Text>
          </TouchableOpacity>
        )}
        <Text style={styles.dateText}>{formatDate(game.createdAt)}</Text>
        <TouchableOpacity
          onPress={() => onDelete(game.id)}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <MaterialCommunityIcons name="trash-can-outline" size={18} color={Colors.textSecondary} />
        </TouchableOpacity>
      </View>

      {/* ① スコア + ② チーム名 — 画面中央の主役 */}
      <View style={styles.scoreRow}>
        {/* 表チーム */}
        <View style={styles.teamBlock}>
          <Text
            style={[styles.teamName, awayWins && styles.teamNameWinner]}
            numberOfLines={1}
            ellipsizeMode="tail"
          >
            {game.awayTeam.name}
          </Text>
          <Text style={styles.teamSide}>{t.common.top}</Text>
        </View>

        {/* スコア */}
        <View style={styles.scoreBlock}>
          <Text style={[styles.scoreNum, awayWins && styles.scoreNumWinner]}>
            {awayScore}
          </Text>
          <Text style={styles.scoreSep}>–</Text>
          <Text style={[styles.scoreNum, homeWins && styles.scoreNumWinner]}>
            {homeScore}
          </Text>
        </View>

        {/* 裏チーム */}
        <View style={[styles.teamBlock, styles.teamBlockRight]}>
          <Text
            style={[styles.teamName, styles.teamNameRight, homeWins && styles.teamNameWinner]}
            numberOfLines={1}
            ellipsizeMode="tail"
          >
            {game.homeTeam.name}
          </Text>
          <Text style={[styles.teamSide, styles.teamSideRight]}>{t.common.bottom}</Text>
        </View>
      </View>

      {/* ④ メタ情報 — 最後に読むボリューム感 */}
      <View style={styles.cardFooter}>
        <Text style={styles.footerText}>
          {(game.pitchLogs ?? []).length > 0 || (game.atBatLogs ?? []).length > 0
            ? `${(game.pitchLogs ?? []).length}球 · ${(game.atBatLogs ?? []).length}打席`
            : 'データ未記録'}
        </Text>
        <MaterialCommunityIcons name="chevron-right" size={16} color={Colors.textDisabled} />
      </View>
    </TouchableOpacity>
  );
}

// ── メイン画面 ────────────────────────────────────────────────────────────────
export default function AnalyticsIndexScreen() {
  const { t } = useI18n();
  const loadGame = useGameStore((s) => s.loadGame);
  const setPhase = useGameStore((s) => s.setPhase);
  const persist = useGameStore((s) => s.persist);
  const [games, setGames] = useState<GameState[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState<'normal' | 'scout'>('normal');

  const loadGames = useCallback(async () => {
    const all = await db.games.getAll();
    setGames(all);
  }, []);

  useEffect(() => {
    loadGames().finally(() => setLoading(false));
  }, [loadGames]);

  const displayGames = games.filter((g) =>
    activeTab === 'scout' ? g.isScout === true : !g.isScout,
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadGames();
    setRefreshing(false);
  }, [loadGames]);

  const handleResume = useCallback((gameId: string) => {
    Alert.alert(
      '試合を再開',
      'この試合の記録を再開しますか？',
      [
        { text: 'キャンセル', style: 'cancel' },
        {
          text: '再開',
          onPress: async () => {
            try {
              await loadGame(gameId);
              setPhase('live');
              await persist();
              router.push('/(tabs)/score/main');
            } catch {
              Alert.alert('エラー', '試合の再開に失敗しました');
            }
          },
        },
      ],
    );
  }, [loadGame, setPhase, persist]);

  const handleDelete = useCallback((gameId: string) => {
    Alert.alert(
      '試合を削除',
      'この試合データを削除しますか？',
      [
        { text: 'キャンセル', style: 'cancel' },
        {
          text: '削除',
          style: 'destructive',
          onPress: async () => {
            try {
              await gameService.deleteGame(gameId);
              setGames((prev) => prev.filter((g) => g.id !== gameId));
            } catch {
              Alert.alert('エラー', '削除に失敗しました');
            }
          },
        },
      ],
    );
  }, []);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={Colors.action} />
      </View>
    );
  }

  return (
    <>
      <Stack.Screen options={{ title: t.analytics.title }} />

      {/* ツールリンク — 主コンテンツ(試合リスト)の邪魔をしない最小限の導線
          バナー2枚 → テキストリンク2項目に変更
          理由: 主役は試合データ。ランキング・選手分析は補助ツール */}
      <View style={styles.toolBar}>
        <TouchableOpacity
          style={styles.toolLink}
          onPress={() => router.push('/(tabs)/analytics/leaderboard' as any)}
          activeOpacity={0.7}
        >
          <MaterialCommunityIcons name="trophy-outline" size={14} color={Colors.action} />
          <Text style={styles.toolLinkText}>チーム内ランキング</Text>
        </TouchableOpacity>

        <View style={styles.toolDivider} />

        <TouchableOpacity
          style={styles.toolLink}
          onPress={() => router.push('/analysis' as any)}
          activeOpacity={0.7}
        >
          <MaterialCommunityIcons name="chart-scatter-plot" size={14} color={Colors.action} />
          <Text style={styles.toolLinkText}>選手・捕手分析</Text>
        </TouchableOpacity>
      </View>

      {/* タブ: 通常 / 偵察データ */}
      <View style={styles.tabRow}>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'normal' && styles.tabActive]}
          onPress={() => setActiveTab('normal')}
        >
          <Text style={[styles.tabText, activeTab === 'normal' && styles.tabTextActive]}>通常</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'scout' && styles.tabActive]}
          onPress={() => setActiveTab('scout')}
        >
          <Text style={[styles.tabText, activeTab === 'scout' && styles.tabTextActive]}>偵察データ</Text>
        </TouchableOpacity>
      </View>

      <FlatList
        data={displayGames}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => <GameCard game={item} onDelete={handleDelete} onResume={handleResume} />}
        contentContainerStyle={
          games.length === 0 ? styles.emptyContainer : styles.listContent
        }
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={Colors.action}
          />
        }
        ListEmptyComponent={
          <View style={styles.emptyContent}>
            <MaterialCommunityIcons name="baseball-bat" size={48} color={Colors.border} />
            <Text style={styles.emptyTitle}>{t.analytics.noGames}</Text>
            <Text style={styles.emptySub}>{t.analytics.noGamesSub}</Text>
          </View>
        }
      />
    </>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.background,
  },

  // ツールバー: 2つの補助リンクをコンパクトな1行にまとめる
  toolBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    backgroundColor: Colors.card,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  toolLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    flex: 1,
    justifyContent: 'center',
  },
  toolLinkText: {
    fontSize: Typography.caption,
    color: Colors.action,
    fontWeight: '600',
  },
  toolDivider: {
    width: 1,
    height: 14,
    backgroundColor: Colors.border,
  },

  tabRow: {
    flexDirection: 'row',
    backgroundColor: Colors.card,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  tab: {
    flex: 1,
    paddingVertical: Spacing.md,
    alignItems: 'center',
    borderBottomWidth: 3,
    borderBottomColor: 'transparent',
  },
  tabActive: {
    borderBottomColor: Colors.primary,
  },
  tabText: {
    fontSize: Typography.body,
    color: Colors.textSecondary,
    fontWeight: '600',
  },
  tabTextActive: {
    color: Colors.primary,
    fontWeight: '700',
  },

  // リスト
  listContent: {
    padding: Spacing.md,
    gap: Spacing.sm,
  },
  emptyContainer: { flex: 1 },
  emptyContent: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.xl,
    marginTop: 80,
    gap: Spacing.sm,
  },
  emptyTitle: {
    fontSize: Typography.h4,
    fontWeight: '600',
    color: Colors.text,
    textAlign: 'center',
  },
  emptySub: {
    fontSize: Typography.bodySmall,
    color: Colors.textSecondary,
    textAlign: 'center',
  },

  // ── 試合カード ──────────────────────────────────────────────────────────────
  card: {
    backgroundColor: Colors.card,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 1,
    shadowOffset: { width: 0, height: 1 },
  },

  // ③ メタ行 (上部)
  cardMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.sm,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 3,
    borderRadius: BorderRadius.sm,
  },
  liveDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: Colors.statusLive,
  },
  statusText: {
    fontSize: Typography.tiny,
    fontWeight: '700',
  },
  dateText: {
    fontSize: Typography.caption,
    color: Colors.textSecondary,
  },

  // ① スコア + ② チーム名
  scoreRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Spacing.sm,
    gap: Spacing.xs,
  },
  teamBlock: {
    flex: 1,
    minWidth: 0,
  },
  teamBlockRight: {
    alignItems: 'flex-end',
  },
  teamName: {
    fontSize: Typography.bodySmall,
    fontWeight: '600',
    color: Colors.textSecondary,
  },
  teamNameRight: {
    textAlign: 'right',
  },
  // 勝者チーム名を強調
  teamNameWinner: {
    color: Colors.text,
    fontWeight: '800',
  },
  teamSide: {
    fontSize: Typography.tiny,
    color: Colors.textDisabled,
    marginTop: 2,
  },
  teamSideRight: {
    textAlign: 'right',
  },
  scoreBlock: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    gap: Spacing.sm,
  },
  // スコア数字: 最大フォントで主役を張る
  scoreNum: {
    fontSize: Typography.h1,
    fontWeight: '800',
    color: Colors.textSecondary,
    minWidth: 36,
    textAlign: 'center',
  },
  // 勝者スコアをさらに強調
  scoreNumWinner: {
    color: Colors.text,
  },
  scoreSep: {
    fontSize: Typography.h4,
    color: Colors.border,
    fontWeight: '300',
  },

  // ④ フッター (下部メタ情報)
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: Spacing.sm,
    borderTopWidth: 0.5,
    borderTopColor: Colors.border,
  },
  footerText: {
    fontSize: Typography.caption,
    color: Colors.textDisabled,
  },
  resumeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginLeft: 8,
  },
  resumeText: {
    fontSize: 12,
    color: Colors.primary,
    fontWeight: '600',
  },
});
