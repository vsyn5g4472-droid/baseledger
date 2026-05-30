/**
 * チーム内ランキング画面
 *
 * ローカルに保存された全試合データを集計し、
 * カテゴリ別カラーカードでランキングを表示します。
 */

import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Alert,
} from 'react-native';
import { Stack } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { db } from '../../../src/db';
import { buildLeaderboard, type LeaderboardData, type LeaderboardCategory } from '../../../src/utils/multiGameStats';
import { Colors, Spacing, Typography, BorderRadius, CardShadow } from '../../../src/constants/theme';
import { usePlanGate, useUserPlan } from '../../../src/hooks/usePlanGate';
import PlanUpgradeCard from '../../../src/components/PlanUpgradeCard';

// ── 指標説明ツールチップ ──────────────────────────────────────────────────────
const STAT_TOOLTIPS: Record<string, string> = {
  ops:          'OPS: 出塁率 + 長打率の合計。1.000 以上が超一流の目安',
  kPct:         'K%（打者）: 打数に占める三振率。低いほど確実性が高い（TOP3 は三振率の低い選手順）',
  bbPct:        'BB%: 打席に占める四球率。選球眼・忍耐力を示す指標',
  woba:         'wOBA: 四球・単打・二塁打・本塁打などに重みをつけた出塁指標。0.400 以上が一流打者の目安',
  avgHitDist:   '平均打球距離: フライ・ライナー打球の推定飛距離の平均。パワーの指標',
  maxHitDist:   '飛距離最大: 記録された打球の中で最も長かった推定飛距離',
  sb:           '盗塁数: 成功した盗塁の累計数',
  obp:          '出塁率: (安打+四球+死球) ÷ (打数+四球+死球+犠飛)。塁に出る能力の指標',
  bbhbp:        '四死球数: 四球と死球の合計。選球眼と投手への圧力を示す',
  kRate:        'K%（投手）: 対戦打者に占める奪三振率。高いほど支配的',
  strikeRate:   'ストライク率: 全投球に占めるストライク割合。65% 以上が制球力の目安',
  walksAllowed: '与四球: 対戦打者に与えた四球数。少ないほど制球力が高い（TOP3 は与四球の少ない順）',
};

// ── カテゴリテーマカラー ───────────────────────────────────────────────────────
const categoryColorMap: Record<string, { bg: string; accent: string }> = {
  avg:          { bg: '#FFF3E0', accent: '#FF6B35' },
  hr:           { bg: '#FCE4EC', accent: '#E91E63' },
  ops:          { bg: '#F3E5F5', accent: '#9C27B0' },
  rbi:          { bg: '#E8F5E9', accent: '#4CAF50' },
  kPct:         { bg: '#E3F2FD', accent: '#2196F3' },
  bbPct:        { bg: '#E0F7FA', accent: '#00BCD4' },
  woba:         { bg: '#FFF8E1', accent: '#FFC107' },
  avgHitDist:   { bg: '#F1F8E9', accent: '#8BC34A' },
  maxHitDist:   { bg: '#E8EAF6', accent: '#3F51B5' },
  sb:           { bg: '#FFF3E0', accent: '#FF9800' },
  obp:          { bg: '#E8F5E9', accent: '#009688' },
  bbhbp:        { bg: '#F9FBE7', accent: '#CDDC39' },
  maxVelocity:  { bg: '#FCE4EC', accent: '#F44336' },
  avgVelocity:  { bg: '#FBE9E7', accent: '#FF5722' },
  kRate:        { bg: '#EDE7F6', accent: '#673AB7' },
  totalK:       { bg: '#E8EAF6', accent: '#5C6BC0' },
  strikeRate:   { bg: '#E3F2FD', accent: '#1976D2' },
  walksAllowed: { bg: '#EFEBE9', accent: '#795548' },
};

const DEFAULT_THEME = { bg: '#F5F5F5', accent: Colors.primary };

const MEDAL = ['🥇', '🥈', '🥉'];

// ── StatLabel ─────────────────────────────────────────────────────────────────
function StatLabel({ id, label, color }: { id: string; label: string; color: string }) {
  const tip = STAT_TOOLTIPS[id];
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
      <Text style={[statLabelStyles.text, { color }]}>{label.replace(' TOP3', '')}</Text>
      {tip && (
        <TouchableOpacity
          onPress={() => Alert.alert(label.replace(' TOP3', ''), tip)}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          activeOpacity={0.7}
        >
          <View style={[statLabelStyles.badge, { backgroundColor: color + '55' }]}>
            <Text style={[statLabelStyles.badgeText, { color }]}>?</Text>
          </View>
        </TouchableOpacity>
      )}
    </View>
  );
}

// ── CategoryCard ──────────────────────────────────────────────────────────────
function CategoryCard({
  category,
  expanded,
  onToggleExpand,
}: {
  category: LeaderboardCategory;
  expanded: boolean;
  onToggleExpand: () => void;
}) {
  const theme = categoryColorMap[category.id] ?? DEFAULT_THEME;
  const entries = category.entries;
  const top3 = entries.slice(0, 3);
  const extra = entries.slice(3, 5);
  const hasExtra = extra.length > 0;

  return (
    <View style={[cardStyles.card, { backgroundColor: Colors.white }]}>
      {/* ヘッダー */}
      <View style={[cardStyles.header, { backgroundColor: theme.accent }]}>
        <MaterialCommunityIcons name={category.icon as any} size={20} color="#fff" />
        <StatLabel id={category.id} label={category.label} color="#fff" />
      </View>

      {entries.length === 0 && (
        <View style={cardStyles.emptyWrap}>
          <Text style={cardStyles.emptyText}>データが不足しています</Text>
        </View>
      )}

      {/* 1位 */}
      {top3[0] && (
        <View style={[cardStyles.row, cardStyles.row1st, { backgroundColor: theme.bg }]}>
          <Text style={cardStyles.medal}>{MEDAL[0]}</Text>
          <Text style={cardStyles.name1st} numberOfLines={1}>{top3[0].playerName}</Text>
          <Text style={[cardStyles.value1st, { color: theme.accent }]}>{top3[0].displayValue}</Text>
        </View>
      )}

      {/* 2位 */}
      {top3[1] && (
        <View style={[cardStyles.row, cardStyles.row2nd]}>
          <Text style={cardStyles.medal}>{MEDAL[1]}</Text>
          <Text style={cardStyles.name} numberOfLines={1}>{top3[1].playerName}</Text>
          <Text style={[cardStyles.value, { color: theme.accent }]}>{top3[1].displayValue}</Text>
        </View>
      )}

      {/* 3位 */}
      {top3[2] && (
        <View style={[cardStyles.row, cardStyles.row3rd]}>
          <Text style={cardStyles.medal}>{MEDAL[2]}</Text>
          <Text style={cardStyles.name} numberOfLines={1}>{top3[2].playerName}</Text>
          <Text style={[cardStyles.value, { color: theme.accent }]}>{top3[2].displayValue}</Text>
        </View>
      )}

      {/* 4・5位（アコーディオン） */}
      {expanded && extra.map((e, i) => (
        <View key={e.playerId} style={[cardStyles.row, cardStyles.rowExtra, { backgroundColor: theme.bg + '80' }]}>
          <Text style={cardStyles.rankNum}>{e.rank}</Text>
          <Text style={cardStyles.name} numberOfLines={1}>{e.playerName}</Text>
          <Text style={[cardStyles.value, { color: theme.accent }]}>{e.displayValue}</Text>
        </View>
      ))}

      {/* もっと見るボタン */}
      {hasExtra && (
        <TouchableOpacity style={cardStyles.expandBtn} onPress={onToggleExpand} activeOpacity={0.7}>
          <Text style={[cardStyles.expandText, { color: theme.accent }]}>
            {expanded ? '閉じる▲' : 'もっと見る▼'}
          </Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

// ── メイン画面 ────────────────────────────────────────────────────────────────
export default function LeaderboardScreen() {
  const leaderboardGate = usePlanGate('leaderboard');
  const userPlan = useUserPlan();
  const [leaderboard, setLeaderboard] = useState<LeaderboardData | null>(null);
  const [loading, setLoading]         = useState(true);
  const [refreshing, setRefreshing]   = useState(false);
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());

  const loadData = useCallback(async () => {
    const games = await db.games.getAll();
    const data  = buildLeaderboard(games);
    setLeaderboard(data);
  }, []);

  useEffect(() => {
    loadData().finally(() => setLoading(false));
  }, [loadData]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  }, [loadData]);

  const toggleExpand = useCallback((id: string) => {
    setExpandedCategories((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }, []);

  if (!leaderboardGate.allowed) {
    return (
      <View style={styles.center}>
        <Stack.Screen options={{ title: 'チーム内ランキング' }} />
        <PlanUpgradeCard featureLabel="リーダーボード" currentPlan={userPlan} />
      </View>
    );
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <Stack.Screen options={{ title: 'チーム内ランキング' }} />
        <ActivityIndicator size="large" color={Colors.primary} />
      </View>
    );
  }

  if (!leaderboard || leaderboard.categories.length === 0) {
    return (
      <View style={styles.center}>
        <Stack.Screen options={{ title: 'チーム内ランキング' }} />
        <MaterialCommunityIcons name="trophy-outline" size={64} color={Colors.border} />
        <Text style={styles.emptyTitle}>データがありません</Text>
        <Text style={styles.emptySub}>
          試合を記録すると{'\n'}ランキングが表示されます
        </Text>
      </View>
    );
  }

  return (
    <>
      <Stack.Screen options={{ title: 'チーム内ランキング' }} />
      <View style={styles.container}>

        {/* バナー */}
        <View style={styles.banner}>
          <MaterialCommunityIcons name="trophy" size={22} color={Colors.accent} />
          <Text style={styles.bannerTitle}>BALLPARK RANKING</Text>
          <Text style={styles.bannerSub}>{leaderboard.gameCount}試合分を集計</Text>
        </View>

        <ScrollView
          contentContainerStyle={styles.scrollContent}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />
          }
        >
          {leaderboard.categories.map((cat) => (
            <CategoryCard
              key={cat.id}
              category={cat}
              expanded={expandedCategories.has(cat.id)}
              onToggleExpand={() => toggleExpand(cat.id)}
            />
          ))}
          <View style={{ height: 40 }} />
        </ScrollView>
      </View>
    </>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const statLabelStyles = StyleSheet.create({
  text: {
    fontSize: Typography.h4,
    fontWeight: '800',
  },
  badge: {
    width: 16,
    height: 16,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 4,
    marginTop: 1,
  },
  badgeText: {
    fontSize: 10,
    fontWeight: '800',
    lineHeight: 12,
  },
});

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.background,
    gap: Spacing.sm,
  },
  emptyTitle: {
    fontSize: Typography.h4,
    fontWeight: '700',
    color: Colors.text,
    marginTop: Spacing.sm,
  },
  emptySub: {
    fontSize: Typography.bodySmall,
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
  },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    backgroundColor: Colors.primary,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  bannerTitle: {
    flex: 1,
    fontSize: Typography.bodySmall,
    fontWeight: '900',
    color: Colors.white,
    letterSpacing: 1.5,
  },
  bannerSub: {
    fontSize: Typography.tiny,
    color: 'rgba(255,255,255,0.7)',
  },
  scrollContent: {
    padding: 16,
    gap: 16,
  },
});

const cardStyles = StyleSheet.create({
  card: {
    borderRadius: BorderRadius.xl,
    overflow: 'hidden',
    ...CardShadow,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.md,
    paddingVertical: 10,
  },
  emptyWrap: {
    alignItems: 'center',
    paddingVertical: Spacing.lg,
  },
  emptyText: {
    color: Colors.textSecondary,
    fontSize: Typography.caption,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingVertical: 10,
    gap: Spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.border,
  },
  row1st: {
    paddingVertical: 14,
  },
  row2nd: {
    backgroundColor: Colors.white,
  },
  row3rd: {
    backgroundColor: Colors.white,
  },
  rowExtra: {},
  medal: {
    fontSize: 20,
    width: 28,
    textAlign: 'center',
  },
  rankNum: {
    width: 28,
    fontSize: Typography.body,
    fontWeight: '800',
    color: Colors.textSecondary,
    textAlign: 'center',
  },
  name1st: {
    flex: 1,
    fontSize: Typography.body,
    fontWeight: '800',
    color: Colors.text,
  },
  name: {
    flex: 1,
    fontSize: Typography.bodySmall,
    fontWeight: '600',
    color: Colors.text,
  },
  value1st: {
    fontSize: Typography.h3,
    fontWeight: '900',
    minWidth: 72,
    textAlign: 'right',
  },
  value: {
    fontSize: Typography.body,
    fontWeight: '800',
    minWidth: 72,
    textAlign: 'right',
  },
  expandBtn: {
    alignItems: 'center',
    paddingVertical: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.border,
  },
  expandText: {
    fontSize: Typography.caption,
    fontWeight: '700',
  },
});
