import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  View,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Dimensions,
  FlatList,
  Linking,
  Modal,
  SafeAreaView,
} from 'react-native';
import { Text } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Stack } from 'expo-router';
import {
  getProspectsByCategory,
  CATEGORY_LABELS,
  PROSPECT_TEAM_COLORS,
  type PlayerCategory,
  type ProspectPlayer,
  type ProspectStats,
} from '../../src/services/prospectsService';
import {
  searchKyureki,
  getRemainingCalls,
  KYUREKI_QUERIES,
  type KyurekiSearchItem,
} from '../../src/services/googleSearchService';
import { Colors, Spacing, BorderRadius, Typography } from '../../src/constants/theme';

const CATEGORIES: PlayerCategory[] = ['pro', 'college', 'industrial', 'high_school'];
const { width: SCREEN_W } = Dimensions.get('window');

// ── Helpers ───────────────────────────────────────────────────────────────────
function initials(name: string): string {
  const parts = name.split(' ');
  if (parts.length >= 2 && /[a-zA-Z]/.test(name)) {
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }
  return name.slice(0, 1);
}

function trendIcon(trend: ProspectPlayer['trend']): {
  name: React.ComponentProps<typeof MaterialCommunityIcons>['name'];
  color: string;
} {
  if (trend === 'up')   return { name: 'trending-up',      color: Colors.primary };
  if (trend === 'down') return { name: 'trending-down',    color: '#E53935' };
  return                       { name: 'trending-neutral', color: Colors.textSecondary };
}

function primaryStat(stats: ProspectStats): { label: string; value: string } | null {
  if (stats.battingAvg)  return { label: '打率',  value: stats.battingAvg };
  if (stats.era)         return { label: '防御率', value: stats.era };
  if (stats.maxVelocity) return { label: '最速',  value: `${stats.maxVelocity}km/h` };
  if (stats.homeRuns)    return { label: '本塁打', value: `${stats.homeRuns}本` };
  if (stats.strikeouts)  return { label: '奪三振', value: `${stats.strikeouts}` };
  if (stats.wins)        return { label: '勝利',  value: `${stats.wins}勝` };
  if (stats.stolenBases) return { label: '盗塁',  value: `${stats.stolenBases}` };
  if (stats.ops)         return { label: 'OPS',   value: stats.ops };
  return null;
}

// ── Prospect Card ─────────────────────────────────────────────────────────────
function ProspectCard({ player }: { player: ProspectPlayer }) {
  const teamColor = PROSPECT_TEAM_COLORS[player.teamCode] ?? Colors.primary;
  const { name: trendName, color: trendColor } = trendIcon(player.trend);
  const stat = primaryStat(player.stats);
  const isTop3 = player.rank <= 3;

  return (
    <View style={[styles.card, isTop3 && styles.cardTop3]}>
      {/* Rank badge */}
      <View style={[styles.rankBadge, isTop3 && styles.rankBadgeTop3]}>
        <Text style={[styles.rankText, isTop3 && styles.rankTextTop3]}>{player.rank}</Text>
      </View>

      {/* Avatar */}
      <View style={[styles.avatar, { backgroundColor: teamColor }]}>
        <Text style={styles.avatarText}>{initials(player.name)}</Text>
      </View>

      {/* Info */}
      <View style={styles.cardBody}>
        <Text style={styles.playerName} numberOfLines={1}>{player.name}</Text>
        <Text style={styles.playerNameEn} numberOfLines={1}>{player.nameEn}</Text>
        <Text style={styles.teamText} numberOfLines={1}>{player.team}</Text>
        <View style={styles.metaRow}>
          <View style={styles.posBadge}>
            <Text style={styles.posText}>{player.position}</Text>
          </View>
          {stat && (
            <View style={styles.statChip}>
              <Text style={styles.statLabel}>{stat.label}</Text>
              <Text style={styles.statValue}>{stat.value}</Text>
            </View>
          )}
        </View>
      </View>

      {/* Score + trend */}
      <View style={styles.scoreCol}>
        <Text style={styles.scoreValue}>{player.attentionScore}</Text>
        <Text style={styles.scoreLabel}>注目度</Text>
        <MaterialCommunityIcons name={trendName} size={16} color={trendColor} />
      </View>
    </View>
  );
}

// ── Category Page ─────────────────────────────────────────────────────────────
function CategoryPage({ category }: { category: PlayerCategory }) {
  const [players, setPlayers] = useState<ProspectPlayer[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getProspectsByCategory(category).then((data) => {
      if (!cancelled) {
        setPlayers(data);
        setLoading(false);
      }
    });
    return () => { cancelled = true; };
  }, [category]);

  if (loading) {
    return (
      <View style={[styles.pageContainer, styles.centered]}>
        <ActivityIndicator color={Colors.primary} size="large" />
      </View>
    );
  }

  return (
    <FlatList
      style={styles.pageContainer}
      data={players}
      keyExtractor={(item) => item.id}
      renderItem={({ item }) => <ProspectCard player={item} />}
      contentContainerStyle={styles.pageContent}
      showsVerticalScrollIndicator={false}
    />
  );
}

// ── Kyureki Search Modal ───────────────────────────────────────────────────────
function KyurekiSearchModal({
  visible,
  onClose,
  remainingCalls,
  onCallsUpdated,
}: {
  visible: boolean;
  onClose: () => void;
  remainingCalls: number;
  onCallsUpdated: (n: number) => void;
}) {
  const [activeQuery, setActiveQuery] = useState<keyof typeof KYUREKI_QUERIES>('draftRanking');
  const [results, setResults]         = useState<KyurekiSearchItem[]>([]);
  const [loading, setLoading]         = useState(false);
  const [error, setError]             = useState<string | null>(null);
  const [fromCache, setFromCache]     = useState(false);
  const [cachedAt, setCachedAt]       = useState<number | undefined>(undefined);

  const handleSearch = useCallback(async (key: keyof typeof KYUREKI_QUERIES) => {
    setActiveQuery(key);
    setError(null);
    setLoading(true);
    try {
      const res = await searchKyureki(KYUREKI_QUERIES[key]);
      if (res) {
        setResults(res.items);
        setFromCache(res.fromCache);
        setCachedAt(res.cachedAt);
        const updated = await getRemainingCalls();
        onCallsUpdated(updated);
      }
    } catch (err: any) {
      setError(err?.message ?? '検索に失敗しました');
    } finally {
      setLoading(false);
    }
  }, [onCallsUpdated]);

  // 初回表示時にデフォルトクエリで検索
  useEffect(() => {
    if (visible) {
      handleSearch('draftRanking');
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const QUERY_LABELS: Record<keyof typeof KYUREKI_QUERIES, string> = {
    draftRanking:    'ランキング',
    draftPitcher:    '投手',
    draftBatter:     '野手',
    highSchoolProsp: '高校生',
    collegeProsp:    '大学生',
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={sStyles.safeArea}>
        {/* Header */}
        <View style={sStyles.header}>
          <TouchableOpacity onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <MaterialCommunityIcons name="chevron-down" size={26} color={Colors.text} />
          </TouchableOpacity>
          <Text style={sStyles.headerTitle}>球歴.com 最新情報</Text>
          {/* 残り更新回数バッジ */}
          <View style={[
            sStyles.limitBadge,
            remainingCalls <= 10 && sStyles.limitBadgeWarn,
          ]}>
            <MaterialCommunityIcons
              name="refresh"
              size={12}
              color={remainingCalls <= 10 ? Colors.secondary : Colors.primary}
            />
            <Text style={[
              sStyles.limitText,
              remainingCalls <= 10 && sStyles.limitTextWarn,
            ]}>
              残り {remainingCalls} 回
            </Text>
          </View>
        </View>

        {/* Query selector */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={sStyles.queryBar}
          contentContainerStyle={sStyles.queryBarContent}
        >
          {(Object.keys(KYUREKI_QUERIES) as Array<keyof typeof KYUREKI_QUERIES>).map((key) => (
            <TouchableOpacity
              key={key}
              style={[sStyles.queryChip, key === activeQuery && sStyles.queryChipActive]}
              onPress={() => handleSearch(key)}
              activeOpacity={0.7}
            >
              <Text style={[sStyles.queryChipText, key === activeQuery && sStyles.queryChipTextActive]}>
                {QUERY_LABELS[key]}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* Cache notice */}
        {fromCache && cachedAt && (
          <View style={sStyles.cacheNotice}>
            <MaterialCommunityIcons name="clock-outline" size={12} color={Colors.textSecondary} />
            <Text style={sStyles.cacheNoticeText}>
              キャッシュ: {new Date(cachedAt).toLocaleString('ja-JP', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
            </Text>
          </View>
        )}

        {/* Results */}
        {loading ? (
          <View style={sStyles.centered}>
            <ActivityIndicator color={Colors.primary} size="large" />
            <Text style={sStyles.loadingText}>球歴.com を検索中…</Text>
          </View>
        ) : error ? (
          <View style={sStyles.centered}>
            <MaterialCommunityIcons name="alert-circle-outline" size={40} color={Colors.secondary} />
            <Text style={sStyles.errorText}>{error}</Text>
          </View>
        ) : (
          <FlatList
            data={results}
            keyExtractor={(_, i) => String(i)}
            contentContainerStyle={sStyles.resultList}
            renderItem={({ item }) => (
              <TouchableOpacity
                style={sStyles.resultCard}
                onPress={() => Linking.openURL(item.link)}
                activeOpacity={0.7}
              >
                <Text style={sStyles.resultTitle} numberOfLines={2}>{item.title}</Text>
                <Text style={sStyles.resultSnippet} numberOfLines={3}>{item.snippet}</Text>
                <View style={sStyles.resultLink}>
                  <MaterialCommunityIcons name="open-in-new" size={11} color={Colors.primary} />
                  <Text style={sStyles.resultLinkText} numberOfLines={1}>{item.displayLink}</Text>
                </View>
              </TouchableOpacity>
            )}
            ListEmptyComponent={
              <View style={sStyles.centered}>
                <Text style={sStyles.emptyText}>検索結果がありません</Text>
              </View>
            }
          />
        )}
      </SafeAreaView>
    </Modal>
  );
}

// ── Main Screen ───────────────────────────────────────────────────────────────
export default function RankingDetailsScreen() {
  const [activeTab, setActiveTab]         = useState(0);
  const [searchVisible, setSearchVisible] = useState(false);
  const [remainingCalls, setRemainingCalls] = useState<number>(90);
  const scrollRef = useRef<ScrollView>(null);

  // 起動時に残り回数を読み込む
  useEffect(() => {
    getRemainingCalls().then(setRemainingCalls).catch(() => {});
  }, []);

  const handleTabPress = useCallback((idx: number) => {
    setActiveTab(idx);
    scrollRef.current?.scrollTo({ x: idx * SCREEN_W, animated: true });
  }, []);

  const handleScroll = useCallback((e: any) => {
    const page = Math.round(e.nativeEvent.contentOffset.x / SCREEN_W);
    if (page !== activeTab) setActiveTab(page);
  }, [activeTab]);

  return (
    <>
      <Stack.Screen
        options={{
          headerShown: true,
          title: '注目選手ランキング',
          headerStyle: { backgroundColor: Colors.white },
          headerTintColor: Colors.primary,
          headerTitleStyle: { fontWeight: '700', color: Colors.text },
          headerShadowVisible: false,
          headerRight: () => (
            <TouchableOpacity
              onPress={() => setSearchVisible(true)}
              style={styles.headerBtn}
              activeOpacity={0.7}
            >
              <MaterialCommunityIcons name="web" size={18} color={Colors.primary} />
              <Text style={styles.headerBtnText}>球歴.com</Text>
            </TouchableOpacity>
          ),
        }}
      />

      <View style={styles.container}>
        {/* 残り更新回数 — 画面右上隅 */}
        <View style={styles.remainingBar}>
          <MaterialCommunityIcons name="refresh" size={12} color={Colors.textSecondary} />
          <Text style={styles.remainingText}>本日の残り更新回数：{remainingCalls} 回</Text>
        </View>

        {/* Tab bar */}
        <View style={styles.tabBar}>
          {CATEGORIES.map((cat, idx) => {
            const active = idx === activeTab;
            return (
              <TouchableOpacity
                key={cat}
                style={[styles.tab, active && styles.tabActive]}
                onPress={() => handleTabPress(idx)}
                activeOpacity={0.7}
              >
                <Text style={[styles.tabText, active && styles.tabTextActive]}>
                  {CATEGORY_LABELS[cat]}
                </Text>
                {active && <View style={styles.tabIndicator} />}
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Paging scroll */}
        <ScrollView
          ref={scrollRef}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onMomentumScrollEnd={handleScroll}
          style={styles.pager}
          scrollEventThrottle={200}
        >
          {CATEGORIES.map((cat) => (
            <View key={cat} style={{ width: SCREEN_W }}>
              <CategoryPage category={cat} />
            </View>
          ))}
        </ScrollView>

        {/* 球歴.com 検索ボタン (FAB風) */}
        <TouchableOpacity
          style={styles.fab}
          onPress={() => setSearchVisible(true)}
          activeOpacity={0.85}
        >
          <MaterialCommunityIcons name="tab-search" size={22} color="#fff" />
          <Text style={styles.fabText}>球歴.com</Text>
        </TouchableOpacity>
      </View>

      <KyurekiSearchModal
        visible={searchVisible}
        onClose={() => setSearchVisible(false)}
        remainingCalls={remainingCalls}
        onCallsUpdated={setRemainingCalls}
      />
    </>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  tabBar: {
    flexDirection: 'row',
    backgroundColor: Colors.white,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: Spacing.sm,
    position: 'relative',
  },
  tabActive: {},
  tabText: {
    fontSize: 13,
    fontWeight: '500',
    color: Colors.textSecondary,
  },
  tabTextActive: {
    color: Colors.primary,
    fontWeight: '700',
  },
  tabIndicator: {
    position: 'absolute',
    bottom: 0,
    left: '15%',
    right: '15%',
    height: 2,
    backgroundColor: Colors.primary,
    borderRadius: 1,
  },
  pager: {
    flex: 1,
  },
  pageContainer: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  pageContent: {
    padding: Spacing.md,
    gap: Spacing.sm,
  },
  centered: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  // Card
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.white,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    gap: Spacing.sm,
    shadowColor: '#000',
    shadowOpacity: 0.07,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  cardTop3: {
    borderLeftWidth: 3,
    borderLeftColor: Colors.accent,
  },
  rankBadge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: Colors.surfaceGray,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rankBadgeTop3: {
    backgroundColor: Colors.accent,
  },
  rankText: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.textSecondary,
  },
  rankTextTop3: {
    color: 'white',
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontSize: 18,
    fontWeight: '800',
    color: 'rgba(255,255,255,0.9)',
  },
  cardBody: {
    flex: 1,
    gap: 2,
  },
  playerName: {
    fontSize: 15,
    fontWeight: '700',
    color: Colors.text,
  },
  playerNameEn: {
    fontSize: 11,
    color: Colors.textSecondary,
  },
  teamText: {
    fontSize: 12,
    color: Colors.textSecondary,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    marginTop: 2,
  },
  posBadge: {
    backgroundColor: Colors.surfaceGray,
    borderRadius: 4,
    paddingHorizontal: 5,
    paddingVertical: 1,
  },
  posText: {
    fontSize: 10,
    color: Colors.textSecondary,
    fontWeight: '500',
  },
  statChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.primaryLight,
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 1,
    gap: 4,
  },
  statLabel: {
    fontSize: 10,
    color: Colors.textSecondary,
  },
  statValue: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.primary,
  },
  scoreCol: {
    alignItems: 'center',
    minWidth: 44,
  },
  scoreValue: {
    fontSize: 20,
    fontWeight: '800',
    color: Colors.primary,
  },
  scoreLabel: {
    fontSize: 9,
    color: Colors.textSecondary,
  },
  // Header button
  headerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginRight: Spacing.sm,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    backgroundColor: Colors.primaryLight,
  },
  headerBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.primary,
  },
  // Remaining calls bar
  remainingBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: Spacing.md,
    paddingVertical: 6,
    backgroundColor: Colors.surfaceGray,
  },
  remainingText: {
    fontSize: 11,
    color: Colors.textSecondary,
  },
  // FAB
  fab: {
    position: 'absolute',
    right: Spacing.md,
    bottom: Spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: Colors.primary,
    borderRadius: 24,
    paddingHorizontal: 16,
    paddingVertical: 10,
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
    elevation: 4,
  },
  fabText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#fff',
  },
});

// ── Modal Styles ──────────────────────────────────────────────────────────────
const sStyles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    gap: Spacing.sm,
  },
  headerTitle: {
    flex: 1,
    fontSize: 16,
    fontWeight: '700',
    color: Colors.text,
  },
  limitBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: Colors.primaryLight,
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  limitBadgeWarn: {
    backgroundColor: '#FDECEA',
  },
  limitText: {
    fontSize: 11,
    fontWeight: '600',
    color: Colors.primary,
  },
  limitTextWarn: {
    color: Colors.secondary,
  },
  queryBar: {
    maxHeight: 44,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  queryBarContent: {
    paddingHorizontal: Spacing.md,
    paddingVertical: 6,
    gap: Spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
  },
  queryChip: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 14,
    backgroundColor: Colors.surfaceGray,
  },
  queryChipActive: {
    backgroundColor: Colors.primary,
  },
  queryChipText: {
    fontSize: 12,
    fontWeight: '500',
    color: Colors.textSecondary,
  },
  queryChipTextActive: {
    color: '#fff',
    fontWeight: '700',
  },
  cacheNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: Spacing.md,
    paddingVertical: 4,
    backgroundColor: Colors.accentSoft,
  },
  cacheNoticeText: {
    fontSize: 10,
    color: Colors.textSecondary,
  },
  resultList: {
    padding: Spacing.md,
    gap: Spacing.sm,
  },
  resultCard: {
    backgroundColor: Colors.white,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
    shadowColor: '#000',
    shadowOpacity: 0.07,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
    gap: 4,
  },
  resultTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.text,
    lineHeight: 20,
  },
  resultSnippet: {
    fontSize: 12,
    color: Colors.textSecondary,
    lineHeight: 18,
  },
  resultLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    marginTop: 2,
  },
  resultLinkText: {
    fontSize: 10,
    color: Colors.primary,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.lg,
    gap: Spacing.sm,
  },
  loadingText: {
    fontSize: 13,
    color: Colors.textSecondary,
  },
  errorText: {
    fontSize: 13,
    color: Colors.secondary,
    textAlign: 'center',
  },
  emptyText: {
    fontSize: 14,
    color: Colors.textSecondary,
  },
});
