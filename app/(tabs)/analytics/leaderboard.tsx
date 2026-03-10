/**
 * チーム内ランキング画面
 *
 * ローカルに保存された全試合データを集計し、
 * 打率・本塁打・OPS・球速王・奪三振率のトップ3を
 * 表彰台スタイルで表示します。
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
} from 'react-native';
import { Stack } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { db } from '../../../src/db';
import { buildLeaderboard, type LeaderboardData, type LeaderboardEntry, type LeaderboardCategory } from '../../../src/utils/multiGameStats';
import { Colors, Spacing, Typography, BorderRadius, CardShadow } from '../../../src/constants/theme';

// ── 表彰台カラー ──────────────────────────────────────────────────────────────
const RANK_COLORS = {
  1: { bg: '#D4AF37', text: '#5A3A00', label: '🥇' },  // ゴールド
  2: { bg: '#C0C0C0', text: '#3A3A3A', label: '🥈' },  // シルバー
  3: { bg: '#CD7F32', text: '#4A2400', label: '🥉' },  // ブロンズ
} as const;

const PODIUM_HEIGHTS = { 1: 96, 2: 72, 3: 52 } as const;

// ── Podium コンポーネント ─────────────────────────────────────────────────────

function PodiumBlock({ entry }: { entry: LeaderboardEntry }) {
  const rank = Math.min(entry.rank, 3) as 1 | 2 | 3;
  const color = RANK_COLORS[rank];
  const height = PODIUM_HEIGHTS[rank];

  return (
    <View style={podStyles.wrap}>
      {/* 選手名・スコア */}
      <View style={podStyles.infoBox}>
        <Text style={podStyles.rankLabel}>{color.label}</Text>
        <Text style={podStyles.playerName} numberOfLines={1}>{entry.playerName}</Text>
        <Text style={podStyles.value}>{entry.displayValue}</Text>
      </View>
      {/* 台座 */}
      <View style={[podStyles.base, { height, backgroundColor: color.bg }]}>
        <Text style={[podStyles.baseRank, { color: color.text }]}>{rank}</Text>
      </View>
    </View>
  );
}

function Podium({ category }: { category: LeaderboardCategory }) {
  if (category.entries.length === 0) {
    return (
      <View style={podStyles.empty}>
        <Text style={podStyles.emptyText}>データが不足しています</Text>
      </View>
    );
  }

  // 1位を中央に配置: 2位→左, 1位→中央, 3位→右
  const first  = category.entries.find((e) => e.rank === 1);
  const second = category.entries.find((e) => e.rank === 2);
  const third  = category.entries.find((e) => e.rank === 3);

  return (
    <View style={podStyles.container}>
      {second && <PodiumBlock entry={second} />}
      {first  && <PodiumBlock entry={first} />}
      {third  && <PodiumBlock entry={third} />}
    </View>
  );
}

// ── カテゴリカード ────────────────────────────────────────────────────────────

function CategoryCard({ category }: { category: LeaderboardCategory }) {
  return (
    <View style={cardStyles.card}>
      {/* ヘッダ */}
      <View style={cardStyles.header}>
        <View style={cardStyles.iconWrap}>
          <MaterialCommunityIcons
            name={category.icon as any}
            size={20}
            color={Colors.white}
          />
        </View>
        <Text style={cardStyles.title}>{category.label}</Text>
      </View>

      {/* 表彰台 */}
      <Podium category={category} />

      {/* ランキング一覧テーブル */}
      {category.entries.map((entry, idx) => {
        const rank = Math.min(entry.rank, 3) as 1 | 2 | 3;
        const rankColor = RANK_COLORS[rank];
        return (
          <View key={entry.playerId + idx} style={[cardStyles.row, idx === 0 && cardStyles.rowFirst]}>
            <View style={[cardStyles.rankBadge, { backgroundColor: rankColor.bg }]}>
              <Text style={[cardStyles.rankNum, { color: rankColor.text }]}>{entry.rank}</Text>
            </View>
            <Text style={cardStyles.rowName} numberOfLines={1}>{entry.playerName}</Text>
            <Text style={cardStyles.rowValue}>{entry.displayValue}</Text>
          </View>
        );
      })}
    </View>
  );
}

// ── カテゴリタブ ──────────────────────────────────────────────────────────────

function CategoryTabs({
  categories,
  selectedId,
  onSelect,
}: {
  categories: LeaderboardCategory[];
  selectedId: string;
  onSelect: (id: string) => void;
}) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={tabStyles.container}
    >
      {categories.map((cat) => {
        const isActive = cat.id === selectedId;
        return (
          <TouchableOpacity
            key={cat.id}
            style={[tabStyles.tab, isActive && tabStyles.tabActive]}
            onPress={() => onSelect(cat.id)}
            activeOpacity={0.75}
          >
            <MaterialCommunityIcons
              name={cat.icon as any}
              size={14}
              color={isActive ? Colors.white : Colors.textSecondary}
            />
            <Text style={[tabStyles.label, isActive && tabStyles.labelActive]}>
              {cat.label.replace(' TOP3', '')}
            </Text>
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );
}

// ── メイン画面 ────────────────────────────────────────────────────────────────

export default function LeaderboardScreen() {
  const [leaderboard, setLeaderboard] = useState<LeaderboardData | null>(null);
  const [loading, setLoading]         = useState(true);
  const [refreshing, setRefreshing]   = useState(false);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>('');

  const loadData = useCallback(async () => {
    const games = await db.games.getAll();
    const data  = buildLeaderboard(games);
    setLeaderboard(data);
    if (data.categories.length > 0 && !selectedCategoryId) {
      setSelectedCategoryId(data.categories[0].id);
    }
  }, [selectedCategoryId]);

  useEffect(() => {
    loadData().finally(() => setLoading(false));
  }, [loadData]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  }, [loadData]);

  const selectedCategory = leaderboard?.categories.find(
    (c) => c.id === selectedCategoryId,
  ) ?? leaderboard?.categories[0];

  // ── ローディング ──
  if (loading) {
    return (
      <View style={styles.center}>
        <Stack.Screen options={{ title: 'チーム内ランキング' }} />
        <ActivityIndicator size="large" color={Colors.primary} />
      </View>
    );
  }

  // ── データなし ──
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
        {/* ── ヘッダバナー ── */}
        <View style={styles.banner}>
          <MaterialCommunityIcons name="trophy" size={22} color={Colors.accent} />
          <Text style={styles.bannerTitle}>BASELEDGER RANKING</Text>
          <Text style={styles.bannerSub}>{leaderboard.gameCount}試合分を集計</Text>
        </View>

        {/* ── カテゴリタブ ── */}
        <CategoryTabs
          categories={leaderboard.categories}
          selectedId={selectedCategoryId || leaderboard.categories[0].id}
          onSelect={setSelectedCategoryId}
        />

        {/* ── カードリスト ── */}
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={styles.scrollContent}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={Colors.primary}
            />
          }
        >
          {/* 選択カテゴリを大きく表示 */}
          {selectedCategory && (
            <CategoryCard key={selectedCategory.id} category={selectedCategory} />
          )}

          {/* 残りカテゴリをコンパクト表示 */}
          {leaderboard.categories
            .filter((c) => c.id !== selectedCategoryId)
            .map((cat) => (
              <TouchableOpacity
                key={cat.id}
                style={miniStyles.card}
                onPress={() => setSelectedCategoryId(cat.id)}
                activeOpacity={0.85}
              >
                <View style={miniStyles.left}>
                  <View style={miniStyles.iconWrap}>
                    <MaterialCommunityIcons
                      name={cat.icon as any}
                      size={16}
                      color={Colors.white}
                    />
                  </View>
                  <Text style={miniStyles.title}>{cat.label}</Text>
                </View>
                <View style={miniStyles.entries}>
                  {cat.entries.slice(0, 3).map((e) => {
                    const rank = Math.min(e.rank, 3) as 1 | 2 | 3;
                    const rc   = RANK_COLORS[rank];
                    return (
                      <View key={e.playerId} style={miniStyles.entry}>
                        <View style={[miniStyles.dot, { backgroundColor: rc.bg }]} />
                        <Text style={miniStyles.name} numberOfLines={1}>{e.playerName}</Text>
                        <Text style={miniStyles.val}>{e.displayValue}</Text>
                      </View>
                    );
                  })}
                </View>
                <MaterialCommunityIcons name="chevron-right" size={18} color={Colors.textSecondary} />
              </TouchableOpacity>
            ))}

          {/* フッター余白 */}
          <View style={{ height: 40 }} />
        </ScrollView>
      </View>
    </>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

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
    padding: Spacing.md,
    gap: Spacing.md,
  },
});

// ── Podium styles ─────────────────────────────────────────────────────────────
const podStyles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'center',
    gap: Spacing.sm,
    marginVertical: Spacing.md,
  },
  wrap: {
    alignItems: 'center',
    flex: 1,
    maxWidth: 96,
  },
  infoBox: {
    alignItems: 'center',
    marginBottom: Spacing.xs,
  },
  rankLabel: {
    fontSize: 20,
    marginBottom: 2,
  },
  playerName: {
    fontSize: Typography.caption,
    fontWeight: '700',
    color: Colors.text,
    textAlign: 'center',
  },
  value: {
    fontSize: Typography.bodySmall,
    fontWeight: '900',
    color: Colors.primary,
    marginTop: 2,
  },
  base: {
    width: '100%',
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 40,
  },
  baseRank: {
    fontSize: Typography.h3,
    fontWeight: '900',
  },
  empty: {
    alignItems: 'center',
    paddingVertical: Spacing.lg,
  },
  emptyText: {
    color: Colors.textSecondary,
    fontSize: Typography.caption,
  },
});

// ── Category card styles ──────────────────────────────────────────────────────
const cardStyles = StyleSheet.create({
  card: {
    backgroundColor: Colors.white,
    borderRadius: BorderRadius.xl,
    padding: Spacing.md,
    ...CardShadow,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginBottom: Spacing.xs,
  },
  iconWrap: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: Typography.h4,
    fontWeight: '800',
    color: Colors.text,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingVertical: 6,
    borderTopWidth: 0.5,
    borderTopColor: Colors.border,
  },
  rowFirst: {
    marginTop: Spacing.xs,
  },
  rankBadge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rankNum: {
    fontSize: Typography.caption,
    fontWeight: '900',
  },
  rowName: {
    flex: 1,
    fontSize: Typography.bodySmall,
    fontWeight: '600',
    color: Colors.text,
  },
  rowValue: {
    fontSize: Typography.body,
    fontWeight: '900',
    color: Colors.primary,
    minWidth: 72,
    textAlign: 'right',
  },
});

// ── Tab styles ────────────────────────────────────────────────────────────────
const tabStyles = StyleSheet.create({
  container: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    gap: Spacing.xs,
    backgroundColor: Colors.background,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  tab: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 6,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.surfaceGray,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  tabActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  label: {
    fontSize: Typography.caption,
    fontWeight: '700',
    color: Colors.textSecondary,
  },
  labelActive: {
    color: Colors.white,
  },
});

// ── Mini card styles ──────────────────────────────────────────────────────────
const miniStyles = StyleSheet.create({
  card: {
    backgroundColor: Colors.white,
    borderRadius: BorderRadius.lg,
    padding: Spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    ...CardShadow,
  },
  left: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    width: 100,
  },
  iconWrap: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: Typography.tiny,
    fontWeight: '700',
    color: Colors.text,
    flexShrink: 1,
  },
  entries: {
    flex: 1,
    gap: 2,
  },
  entry: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  name: {
    flex: 1,
    fontSize: Typography.tiny,
    color: Colors.text,
    fontWeight: '600',
  },
  val: {
    fontSize: Typography.tiny,
    fontWeight: '800',
    color: Colors.primary,
    minWidth: 48,
    textAlign: 'right',
  },
});
