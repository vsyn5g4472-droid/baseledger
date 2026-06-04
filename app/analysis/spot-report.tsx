/**
 * スポット打席分析レポート画面
 *
 * 表示内容:
 *  1. ヘッダー（打者名・対戦チーム・打席数）
 *  2. 打席結果サマリ（打数・安打・三振・四球・打率）
 *  3. 球種別被投球数（横棒グラフ）
 *  4. コース別投球分布（3×3グリッド）
 *  5. 打席一覧（タップで詳細展開）
 */

import React, { useEffect, useState, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  FlatList,
  ActivityIndicator,
  TouchableOpacity,
} from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { getUserSpotAtBats } from '../../src/services/spotAtBatService';
import type { SpotAtBat } from '../../src/models/types';
import type { StrikeZone, AtBatResult } from '../../src/types/game';
import { useAuth } from '../../src/contexts/AuthContext';
import { Colors, Spacing, Typography, BorderRadius, CardShadow } from '../../src/constants/theme';

// ── Helpers ───────────────────────────────────────────────────────────────────

const RESULT_JP: Record<AtBatResult, string> = {
  strikeout:        '三振(空振)',
  strikeout_looking:'三振(見逃)',
  walk:             '四球',
  hit_by_pitch:     '死球',
  single:           '単打',
  double:           '二塁打',
  triple:           '三塁打',
  home_run:         '本塁打',
  groundout:        'ゴロアウト',
  flyout:           'フライアウト',
  lineout:          'ライナーアウト',
  pop_out:          'ポップフライ',
  sacrifice_bunt:   '犠打',
  sacrifice_fly:    '犠飛',
  fielders_choice:  '野選',
  error:            'エラー',
  double_play:      'ダブルプレイ',
  triple_play:      'トリプルプレイ',
};

const HIT_RESULTS: AtBatResult[] = ['single', 'double', 'triple', 'home_run'];
const STRIKEOUT_RESULTS: AtBatResult[] = ['strikeout', 'strikeout_looking'];
const WALK_RESULTS: AtBatResult[] = ['walk', 'hit_by_pitch'];

/** ストライクゾーン: 9マス + ボールゾーン */
const ZONE_GRID: (StrikeZone | null)[][] = [
  ['1', '2', '3'],
  ['4', '5', '6'],
  ['7', '8', '9'],
];

// ── Sub-components ────────────────────────────────────────────────────────────

function SectionHeader({ icon, label }: { icon: string; label: string }) {
  return (
    <View style={secStyles.row}>
      <View style={secStyles.icon}>
        <MaterialCommunityIcons name={icon as any} size={16} color={Colors.white} />
      </View>
      <Text style={secStyles.label}>{label}</Text>
    </View>
  );
}

function StatBox({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <View style={boxStyles.box}>
      <Text style={boxStyles.label}>{label}</Text>
      <Text style={boxStyles.value}>{value}</Text>
      {sub && <Text style={boxStyles.sub}>{sub}</Text>}
    </View>
  );
}

/** 横棒グラフ1行 */
function HBarRow({ label, count, maxCount }: { label: string; count: number; maxCount: number }) {
  const pct = maxCount > 0 ? count / maxCount : 0;
  return (
    <View style={barStyles.row}>
      <Text style={barStyles.label} numberOfLines={1}>{label}</Text>
      <View style={barStyles.track}>
        <View style={[barStyles.fill, { width: `${Math.round(pct * 100)}%` }]} />
      </View>
      <Text style={barStyles.count}>{count}</Text>
    </View>
  );
}

/** コース別3×3グリッド */
function ZoneGrid({ zoneCounts }: { zoneCounts: Record<string, number> }) {
  const maxCount = Math.max(...Object.values(zoneCounts), 1);
  return (
    <View style={gridStyles.container}>
      {ZONE_GRID.map((row, ri) => (
        <View key={ri} style={gridStyles.row}>
          {row.map((zone) => {
            const count = zone ? (zoneCounts[zone] ?? 0) : 0;
            const intensity = zone ? count / maxCount : 0;
            const bg = `rgba(26, 107, 181, ${0.1 + intensity * 0.75})`;
            return (
              <View key={zone ?? `null-${ri}`} style={[gridStyles.cell, { backgroundColor: bg }]}>
                <Text style={gridStyles.cellCount}>{zone ? count : ''}</Text>
                <Text style={gridStyles.cellZone}>{zone ?? ''}</Text>
              </View>
            );
          })}
        </View>
      ))}
    </View>
  );
}

/** 打席1件の行（タップで展開） */
function AtBatRow({ spot }: { spot: SpotAtBat }) {
  const [expanded, setExpanded] = useState(false);
  const dateStr = spot.gameDate?.toDate?.()?.toLocaleDateString('ja-JP', {
    month: 'numeric', day: 'numeric',
  }) ?? '';
  const resultJp = RESULT_JP[spot.result] ?? spot.result;

  return (
    <View style={rowStyles.card}>
      <TouchableOpacity
        style={rowStyles.header}
        onPress={() => setExpanded((v) => !v)}
        activeOpacity={0.8}
      >
        <View style={rowStyles.headerLeft}>
          <Text style={rowStyles.date}>{dateStr}</Text>
          <Text style={rowStyles.result}>{resultJp}</Text>
        </View>
        <View style={rowStyles.headerRight}>
          <Text style={rowStyles.pitchCount}>{spot.pitches.length}球</Text>
          <MaterialCommunityIcons
            name={expanded ? 'chevron-up' : 'chevron-down'}
            size={18}
            color={Colors.textSecondary}
          />
        </View>
      </TouchableOpacity>

      {expanded && (
        <View style={rowStyles.detail}>
          {spot.pitches.map((p) => (
            <View key={p.pitchNumber} style={rowStyles.pitchRow}>
              <Text style={rowStyles.pitchNum}>{p.pitchNumber}</Text>
              <Text style={rowStyles.pitchType}>{p.pitchType}</Text>
              <Text style={rowStyles.pitchZone}>Z{p.zone}</Text>
              <Text style={rowStyles.pitchResult}>{p.result}</Text>
              {p.velocity != null && (
                <Text style={rowStyles.pitchVelo}>{p.velocity}km/h</Text>
              )}
            </View>
          ))}
          {spot.memo ? (
            <Text style={rowStyles.memo}>メモ: {spot.memo}</Text>
          ) : null}
        </View>
      )}
    </View>
  );
}

// ── Main Screen ───────────────────────────────────────────────────────────────

export default function SpotReportScreen() {
  const { playerName, opponent } = useLocalSearchParams<{ playerName: string; opponent: string }>();
  const { currentUser } = useAuth();

  const [spots, setSpots] = useState<SpotAtBat[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!currentUser?.uid) { setLoading(false); return; }
    getUserSpotAtBats(currentUser.uid)
      .then((all) => {
        const filtered = all
          .filter((s) => s.playerName === playerName)
          .filter((s) => opponent === '未設定' ? !s.opponent : s.opponent === opponent);
        setSpots(filtered);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [currentUser?.uid, playerName, opponent]);

  // ── 打席結果サマリ ──
  const summary = useMemo(() => {
    let atBats = 0, hits = 0, strikeouts = 0, walks = 0;
    const resultCounts: Partial<Record<AtBatResult, number>> = {};

    for (const s of spots) {
      const r = s.result;
      // 四球・死球は打数に含まない
      if (!WALK_RESULTS.includes(r)) atBats++;
      if (HIT_RESULTS.includes(r)) hits++;
      if (STRIKEOUT_RESULTS.includes(r)) strikeouts++;
      if (WALK_RESULTS.includes(r)) walks++;
      resultCounts[r] = (resultCounts[r] ?? 0) + 1;
    }
    const avg = atBats > 0 ? hits / atBats : 0;
    const avgStr = atBats > 0 ? avg.toFixed(3).replace(/^0/, '') : '.---';
    return { atBats, hits, strikeouts, walks, avg: avgStr, resultCounts };
  }, [spots]);

  // ── 球種別集計 ──
  const pitchTypeCounts = useMemo(() => {
    const map: Record<string, number> = {};
    for (const s of spots) {
      for (const p of s.pitches) {
        map[p.pitchType] = (map[p.pitchType] ?? 0) + 1;
      }
    }
    return Object.entries(map).sort((a, b) => b[1] - a[1]);
  }, [spots]);

  const maxPitchCount = useMemo(
    () => Math.max(...pitchTypeCounts.map(([, c]) => c), 1),
    [pitchTypeCounts],
  );

  // ── コース別集計 ──
  const zoneCounts = useMemo(() => {
    const map: Record<string, number> = {};
    for (const s of spots) {
      for (const p of s.pitches) {
        map[p.zone] = (map[p.zone] ?? 0) + 1;
      }
    }
    return map;
  }, [spots]);

  const title = `${playerName ?? '?'} のスポット分析`;

  if (loading) {
    return (
      <View style={styles.center}>
        <Stack.Screen options={{ title }} />
        <ActivityIndicator size="large" color={Colors.primary} />
      </View>
    );
  }

  if (spots.length === 0) {
    return (
      <View style={styles.center}>
        <Stack.Screen options={{ title }} />
        <MaterialCommunityIcons name="database-off-outline" size={48} color={Colors.border} />
        <Text style={styles.emptyText}>データがありません</Text>
      </View>
    );
  }

  return (
    <>
      <Stack.Screen options={{ title }} />

      <ScrollView style={styles.container} contentContainerStyle={styles.content}>

        {/* ── ① ヘッダー ── */}
        <View style={[styles.card, styles.heroBanner]}>
          <MaterialCommunityIcons name="baseball-bat" size={28} color={Colors.white} />
          <View style={{ flex: 1 }}>
            <Text style={styles.heroTitle}>{playerName} のスポット打席分析</Text>
            <Text style={styles.heroSub}>対戦: {opponent}　打席数: {spots.length}件</Text>
          </View>
        </View>

        {/* ── ② 打席結果サマリ ── */}
        <View style={styles.card}>
          <SectionHeader icon="chart-line" label="打席結果サマリ" />
          <View style={styles.summaryRow}>
            <StatBox label="打率" value={summary.avg} />
            <StatBox label="打数" value={`${summary.atBats}`} />
            <StatBox label="安打" value={`${summary.hits}`} />
          </View>
          <View style={styles.summaryRow}>
            <StatBox label="三振" value={`${summary.strikeouts}`} />
            <StatBox label="四死球" value={`${summary.walks}`} />
            <StatBox label="打席" value={`${spots.length}`} />
          </View>

          {/* result別内訳 */}
          {Object.entries(summary.resultCounts).length > 0 && (
            <View style={styles.resultBreakdown}>
              {Object.entries(summary.resultCounts).map(([r, cnt]) => (
                <View key={r} style={styles.resultChip}>
                  <Text style={styles.resultChipText}>
                    {RESULT_JP[r as AtBatResult] ?? r}: {cnt}
                  </Text>
                </View>
              ))}
            </View>
          )}
        </View>

        {/* ── ③ 球種別被投球数 ── */}
        {pitchTypeCounts.length > 0 && (
          <View style={styles.card}>
            <SectionHeader icon="chart-bar" label="球種別被投球数" />
            {pitchTypeCounts.map(([type, count]) => (
              <HBarRow key={type} label={type} count={count} maxCount={maxPitchCount} />
            ))}
          </View>
        )}

        {/* ── ④ コース別投球分布 ── */}
        {Object.keys(zoneCounts).length > 0 && (
          <View style={styles.card}>
            <SectionHeader icon="grid" label="コース別投球分布" />
            <Text style={styles.zoneNote}>※ストライクゾーン（打者視点）</Text>
            <ZoneGrid zoneCounts={zoneCounts} />
            <View style={styles.ballZoneRow}>
              {(['BH', 'BL', 'BI', 'BO'] as StrikeZone[]).map((z) => (
                <View key={z} style={styles.ballZoneItem}>
                  <Text style={styles.ballZoneLabel}>{z}</Text>
                  <Text style={styles.ballZoneCount}>{zoneCounts[z] ?? 0}</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* ── ⑤ 打席一覧 ── */}
        <View style={styles.card}>
          <SectionHeader icon="format-list-bulleted" label="打席一覧" />
          {spots.map((s) => (
            <AtBatRow key={s.id} spot={s} />
          ))}
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>
    </>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  content:   { padding: Spacing.md, gap: Spacing.md },
  center:    { flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing.sm },
  emptyText: { fontSize: Typography.bodySmall, color: Colors.textSecondary },

  card: {
    backgroundColor: Colors.white,
    borderRadius:    BorderRadius.xl,
    padding:         Spacing.md,
    gap:             Spacing.sm,
    ...CardShadow,
  },

  heroBanner: {
    flexDirection:   'row',
    alignItems:      'center',
    gap:             Spacing.md,
    backgroundColor: Colors.primary,
  },
  heroTitle: { fontSize: Typography.bodySmall, fontWeight: '900', color: Colors.white },
  heroSub:   { fontSize: Typography.caption, color: 'rgba(255,255,255,0.8)', marginTop: 2 },

  summaryRow: { flexDirection: 'row', gap: Spacing.sm },

  resultBreakdown: {
    flexDirection: 'row',
    flexWrap:      'wrap',
    gap:           Spacing.xs,
    marginTop:     Spacing.xs,
  },
  resultChip: {
    backgroundColor: Colors.surfaceGray,
    borderRadius:    BorderRadius.full,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  resultChipText: { fontSize: Typography.tiny, color: Colors.text, fontWeight: '600' },

  zoneNote: { fontSize: Typography.tiny, color: Colors.textSecondary, marginBottom: 4 },

  ballZoneRow: {
    flexDirection:  'row',
    justifyContent: 'center',
    gap:            Spacing.md,
    marginTop:      Spacing.xs,
  },
  ballZoneItem:  { alignItems: 'center' },
  ballZoneLabel: { fontSize: Typography.tiny, color: Colors.textSecondary, fontWeight: '700' },
  ballZoneCount: { fontSize: Typography.body, fontWeight: '800', color: Colors.text },
});

const secStyles = StyleSheet.create({
  row:   { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs },
  icon:  {
    width: 26, height: 26, borderRadius: 13,
    backgroundColor: Colors.primary,
    alignItems: 'center', justifyContent: 'center',
  },
  label: { fontSize: Typography.bodySmall, fontWeight: '800', color: Colors.text },
});

const boxStyles = StyleSheet.create({
  box: {
    flex: 1, alignItems: 'center',
    backgroundColor: Colors.surfaceGray,
    borderRadius: BorderRadius.lg,
    paddingVertical: Spacing.sm,
    paddingHorizontal: 4,
  },
  label: { fontSize: Typography.tiny, color: Colors.textSecondary, fontWeight: '600' },
  value: { fontSize: Typography.h4, fontWeight: '900', color: Colors.primary, marginTop: 2 },
  sub:   { fontSize: Typography.tiny, color: Colors.textSecondary },
});

const barStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           Spacing.xs,
    marginBottom:  4,
  },
  label: {
    width: 60,
    fontSize:   Typography.caption,
    fontWeight: '600',
    color:      Colors.text,
  },
  track: {
    flex: 1,
    height: 14,
    backgroundColor: Colors.surfaceGray,
    borderRadius:    7,
    overflow:        'hidden',
  },
  fill: {
    height: '100%',
    backgroundColor: Colors.primary,
    borderRadius:    7,
  },
  count: {
    width: 28,
    fontSize:   Typography.caption,
    fontWeight: '700',
    color:      Colors.text,
    textAlign:  'right',
  },
});

const gridStyles = StyleSheet.create({
  container: { alignSelf: 'center', gap: 2 },
  row:       { flexDirection: 'row', gap: 2 },
  cell: {
    width: 64, height: 48,
    alignItems: 'center', justifyContent: 'center',
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  cellCount: { fontSize: Typography.body, fontWeight: '900', color: Colors.text },
  cellZone:  { fontSize: Typography.tiny, color: Colors.textSecondary },
});

const rowStyles = StyleSheet.create({
  card: {
    backgroundColor: Colors.surfaceGray,
    borderRadius:    BorderRadius.lg,
    marginBottom:    Spacing.xs,
    overflow:        'hidden',
    borderWidth:     1,
    borderColor:     Colors.border,
  },
  header: {
    flexDirection:  'row',
    alignItems:     'center',
    justifyContent: 'space-between',
    padding:        Spacing.sm,
  },
  headerLeft:  { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs },
  date:        { fontSize: Typography.caption, color: Colors.textSecondary, fontWeight: '600' },
  result:      { fontSize: Typography.bodySmall, fontWeight: '700', color: Colors.text },
  pitchCount:  { fontSize: Typography.caption, color: Colors.textSecondary },

  detail: {
    padding:    Spacing.sm,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    gap: 4,
  },
  pitchRow: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           Spacing.sm,
  },
  pitchNum:    { width: 20, fontSize: Typography.caption, fontWeight: '700', color: Colors.textSecondary },
  pitchType:   { flex: 1, fontSize: Typography.caption, fontWeight: '600', color: Colors.text },
  pitchZone:   { width: 32, fontSize: Typography.caption, color: Colors.textSecondary },
  pitchResult: { flex: 1, fontSize: Typography.caption, color: Colors.text },
  pitchVelo:   { fontSize: Typography.caption, color: Colors.primary, fontWeight: '600' },
  memo:        { fontSize: Typography.caption, color: Colors.textSecondary, marginTop: 4 },
});
