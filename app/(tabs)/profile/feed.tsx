import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { Stack } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { getUserPosts } from '../../../src/services/postService';
import { useAuth } from '../../../src/contexts/AuthContext';
import PitchHeatmap from '../../../src/components/analytics/PitchHeatmap';
import SprayChart from '../../../src/components/analytics/SprayChart';
import type { Post } from '../../../src/models/types';
import type {
  GameRecordStatsData,
  AT_BAT_RESULT_LABELS as _labels,
} from '../../../src/services/personalPostService';
import { AT_BAT_RESULT_LABELS } from '../../../src/services/personalPostService';
import type { PitchLog, AtBatLog, AtBatResult } from '../../../src/types/game';
import { Colors, Spacing, Typography, BorderRadius, CardShadow } from '../../../src/constants/theme';

// ── Result colours ─────────────────────────────────────────────────────────────

const RESULT_COLORS: Record<string, string> = {
  single:            Colors.success,
  double:            Colors.success,
  triple:            Colors.success,
  home_run:          Colors.accent,
  walk:              Colors.primary,
  hit_by_pitch:      Colors.primary,
  strikeout:         Colors.secondary,
  strikeout_looking: Colors.secondary,
  double_play:       Colors.secondary,
  triple_play:       Colors.secondary,
};

// ── Scaled chart wrapper ───────────────────────────────────────────────────────
// Scales a fixed-size SVG component to fit within a given container width.

const HM_SCALE = 0.60;   // PitchHeatmap: 216 → 130
const HM_W     = Math.round(216 * HM_SCALE);
const HM_H     = Math.round(284 * HM_SCALE);
const HM_TX    = -((216 * (1 - HM_SCALE)) / 2);
const HM_TY    = -((284 * (1 - HM_SCALE)) / 2);

const SC_SCALE = 0.52;   // SprayChart: 280 → 146
const SC_W     = Math.round(280 * SC_SCALE);
const SC_H     = Math.round(280 * SC_SCALE);
const SC_TX    = -((280 * (1 - SC_SCALE)) / 2);
const SC_TY    = -((280 * (1 - SC_SCALE)) / 2);

// ── GameRecordCard ─────────────────────────────────────────────────────────────

function GameRecordCard({ post }: { post: Post }) {
  const data = post.statsData as unknown as GameRecordStatsData;

  // Reconstruct minimal PitchLog[] for PitchHeatmap (only uses id/zone/pitchX/pitchY/result)
  const pitchLogs = (data.pitchLogs ?? []).map((p) => ({
    id: p.id,
    zone: p.zone as any,
    pitchX: p.pitchX,
    pitchY: p.pitchY,
    result: p.result as any,
    pitchType: p.pitchType,
    inning: { number: data.inningNumber, half: data.inningHalf },
    pitchNumber: 0,
    totalPitchNumber: 0,
    pitcherId: '',
    batterId: '',
    countBefore: { balls: 0, strikes: 0, outs: 0 },
    countAfter:  { balls: 0, strikes: 0, outs: 0 },
    timestamp: 0,
  })) as PitchLog[];

  // Reconstruct minimal AtBatLog[] for SprayChart (uses id/battedBall/result)
  const atBatLogs: AtBatLog[] = data.battedBall
    ? [
        {
          id: post.id,
          inning: { number: data.inningNumber, half: data.inningHalf },
          batterId: '',
          pitcherId: '',
          pitches: [],
          result: data.result as AtBatResult,
          battedBall: {
            type:              data.battedBall.type as any,
            fieldX:            data.battedBall.fieldX,
            fieldY:            data.battedBall.fieldY,
            estimatedDistance: data.battedBall.estimatedDistance,
          },
          rbiCount: data.rbi,
          runnersBeforePlay: { first: null, second: null, third: null },
          runnersAfterPlay:  { first: null, second: null, third: null },
          timestamp: 0,
        },
      ]
    : [];

  const halfLabel   = data.inningHalf === 'top' ? '表' : '裏';
  const resultLabel = data.result
    ? (AT_BAT_RESULT_LABELS[data.result] ?? data.result)
    : '記録なし';
  const resultColor = data.result
    ? (RESULT_COLORS[data.result] ?? Colors.textSecondary)
    : Colors.textSecondary;

  // Max velocity in this at-bat
  const velocities = (data.pitchLogs ?? [])
    .filter((p) => p.velocity != null)
    .map((p) => p.velocity!);
  const maxVelocity = velocities.length > 0 ? Math.max(...velocities) : null;

  return (
    <View style={styles.card}>
      {/* Context label — "〇〇チームの試合での一打" */}
      <View style={styles.contextRow}>
        <MaterialCommunityIcons name="baseball" size={13} color={Colors.primary} />
        <Text style={styles.contextLabel} numberOfLines={1}>
          {data.awayTeamName} vs {data.homeTeamName} の試合での一打
        </Text>
      </View>

      {/* Inning + result */}
      <View style={styles.resultRow}>
        <Text style={styles.inningText}>
          {data.inningNumber}回{halfLabel}
        </Text>
        <View style={[styles.resultBadge, { backgroundColor: resultColor + '22' }]}>
          <Text style={[styles.resultText, { color: resultColor }]}>
            {resultLabel}
          </Text>
        </View>
        {data.rbi > 0 && (
          <View style={styles.rbiBadge}>
            <Text style={styles.rbiText}>打点 {data.rbi}</Text>
          </View>
        )}
      </View>

      {/* Stats strip */}
      <View style={styles.statsRow}>
        <View style={styles.statItem}>
          <Text style={styles.statValue}>{data.pitchCount}</Text>
          <Text style={styles.statLabel}>球</Text>
        </View>
        {maxVelocity != null && (
          <View style={styles.statItem}>
            <Text style={styles.statValue}>{maxVelocity}</Text>
            <Text style={styles.statLabel}>km/h 最速</Text>
          </View>
        )}
        {data.battedBall && (
          <View style={styles.statItem}>
            <Text style={styles.statValue}>
              {Math.round(data.battedBall.estimatedDistance)}
            </Text>
            <Text style={styles.statLabel}>m 飛距離</Text>
          </View>
        )}
      </View>

      {/* Charts — scaled to fit the card */}
      {pitchLogs.length > 0 && (
        <View style={styles.chartsRow}>
          {/* Pitch heatmap */}
          <View>
            <Text style={styles.chartTitle}>配球</Text>
            <View style={{ width: HM_W, height: HM_H, overflow: 'hidden' }}>
              <View
                style={{
                  transform: [
                    { translateX: HM_TX },
                    { translateY: HM_TY },
                    { scale: HM_SCALE },
                  ],
                }}
              >
                <PitchHeatmap pitchLogs={pitchLogs} />
              </View>
            </View>
          </View>

          {/* Spray chart (only if batted ball exists) */}
          {data.battedBall && (
            <View>
              <Text style={styles.chartTitle}>打球</Text>
              <View style={{ width: SC_W, height: SC_H, overflow: 'hidden' }}>
                <View
                  style={{
                    transform: [
                      { translateX: SC_TX },
                      { translateY: SC_TY },
                      { scale: SC_SCALE },
                    ],
                  }}
                >
                  <SprayChart atBatLogs={atBatLogs} />
                </View>
              </View>
            </View>
          )}
        </View>
      )}
    </View>
  );
}

// ── Screen ─────────────────────────────────────────────────────────────────────

export default function PersonalFeedScreen() {
  const { currentUser } = useAuth();
  const [posts, setPosts]         = useState<Post[]>([]);
  const [loading, setLoading]     = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [hasMore, setHasMore]     = useState(true);
  const lastDocRef = useRef<unknown>(null);

  const loadPosts = useCallback(
    async (reset = false) => {
      if (!currentUser) return;
      try {
        const cursor = reset ? undefined : lastDocRef.current;
        const result = await getUserPosts(currentUser.uid, cursor);
        const records = result.items.filter(
          (p) =>
            p.statsData &&
            (p.statsData as any).sourceType === 'game_record',
        );
        setPosts((prev) => (reset ? records : [...prev, ...records]));
        lastDocRef.current = result.lastDoc;
        setHasMore(result.hasMore);
      } catch {
        // silent — user may not have Firestore access yet
      }
    },
    [currentUser],
  );

  useEffect(() => {
    loadPosts(true).finally(() => setLoading(false));
  }, [loadPosts]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadPosts(true);
    setRefreshing(false);
  }, [loadPosts]);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={Colors.primary} />
      </View>
    );
  }

  return (
    <>
      <Stack.Screen options={{ title: 'マイ成績フィード' }} />

      <FlatList
        data={posts}
        keyExtractor={(item) => item.id}
        contentContainerStyle={
          posts.length === 0 ? styles.emptyContainer : styles.listContent
        }
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={Colors.primary}
          />
        }
        renderItem={({ item }) => <GameRecordCard post={item} />}
        onEndReached={
          hasMore
            ? () => loadPosts(false)
            : undefined
        }
        onEndReachedThreshold={0.3}
        ListEmptyComponent={
          <View style={styles.emptyContent}>
            <MaterialCommunityIcons
              name="chart-timeline-variant"
              size={60}
              color={Colors.border}
            />
            <Text style={styles.emptyTitle}>まだ成績がありません</Text>
            <Text style={styles.emptySub}>
              チームのスコア画面で打席結果を「個人フィードにシェア」すると、ここに表示されます。
            </Text>
          </View>
        }
      />
    </>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.background,
  },
  listContent: { padding: Spacing.md, gap: Spacing.md, paddingBottom: Spacing.xxl },
  emptyContainer: { flex: 1 },
  emptyContent: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.xl,
    marginTop: 80,
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
    lineHeight: 20,
  },

  // Card
  card: {
    backgroundColor: Colors.white,
    borderRadius: BorderRadius.xl,
    padding: Spacing.md,
    ...CardShadow,
  },

  // Context label
  contextRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginBottom: Spacing.sm,
  },
  contextLabel: {
    fontSize: Typography.caption,
    color: Colors.primary,
    fontWeight: '600',
    flex: 1,
  },

  // Result row
  resultRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  inningText: {
    fontSize: Typography.bodySmall,
    fontWeight: '700',
    color: Colors.text,
  },
  resultBadge: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 3,
    borderRadius: BorderRadius.full,
  },
  resultText: {
    fontSize: Typography.caption,
    fontWeight: '700',
  },
  rbiBadge: {
    backgroundColor: Colors.accentSoft,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 3,
    borderRadius: BorderRadius.full,
  },
  rbiText: {
    fontSize: Typography.caption,
    fontWeight: '700',
    color: Colors.accent,
  },

  // Stats strip
  statsRow: {
    flexDirection: 'row',
    gap: Spacing.lg,
    paddingVertical: Spacing.sm,
    borderTopWidth: 0.5,
    borderTopColor: Colors.border,
    marginBottom: Spacing.sm,
  },
  statItem: { alignItems: 'center' },
  statValue: {
    fontSize: Typography.h4,
    fontWeight: '700',
    color: Colors.primary,
  },
  statLabel: {
    fontSize: Typography.tiny,
    color: Colors.textSecondary,
    marginTop: 1,
  },

  // Charts
  chartsRow: {
    flexDirection: 'row',
    gap: Spacing.md,
    justifyContent: 'center',
    paddingTop: Spacing.xs,
  },
  chartTitle: {
    fontSize: Typography.caption,
    fontWeight: '700',
    color: Colors.textSecondary,
    textAlign: 'center',
    marginBottom: 4,
  },
});
