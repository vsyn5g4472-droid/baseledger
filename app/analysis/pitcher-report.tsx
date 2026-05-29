/**
 * 投手分析レポート画面（全捕手合算）
 *
 * 表示内容:
 *  1. 基本統計 (投球数・ストライク率・球速)
 *  2. 球種割合（全体）
 *  3. ゾーン別投球分布ヒートマップ
 *  4. 2ストライク時配球
 *  5. カウント別傾向グリッド
 *  6. 決め球ランキング
 *  7. 捕手別に分析（バッテリー分析へのドリルダウン）
 *  8. AI 自然言語サマリ
 */

import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  TouchableOpacity,
  Modal,
  FlatList,
  SafeAreaView,
} from 'react-native';
import { Stack, useLocalSearchParams, router } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { db } from '../../src/db';
import { buildPitcherProfile, type PitcherProfile, type CountTendency } from '../../src/utils/analysisEngine';
import ZoneHeatmap from '../../src/components/analysis/ZoneHeatmap';
import { generateBatteryAIReport, reportToSections, type AIReport } from '../../src/services/aiReportService';
import AIReportErrorCard from '../../src/components/AIReportErrorCard';
import { useUserPlan } from '../../src/hooks/usePlanGate';
import { Colors, Spacing, Typography, BorderRadius, CardShadow } from '../../src/constants/theme';

// ── Helpers ───────────────────────────────────────────────────────────────────

const COUNT_LABEL: Record<string, string> = {
  '0-0': '初球', '2-0': '2B-0S', '3-1': '3B-1S',
  '0-2': '0B-2S', '1-2': '1B-2S', '2-2': '2B-2S', '3-2': 'フルカウント',
};

const ZONE_JP: Record<string, string> = {
  '1': '内高', '2': '高中', '3': '外高',
  '4': '内中', '5': '真中', '6': '外中',
  '7': '内低', '8': '低中', '9': '外低',
  'BH': '高ボ', 'BL': '低ボ', 'BI': '内ボ', 'BO': '外ボ',
};

function pct(v: number) { return `${Math.round(v * 100)}%`; }
function fmtV(v: number | null) { return v != null ? `${v}km/h` : '-'; }

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

function StatRow({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <View style={statStyles.row}>
      <Text style={statStyles.label}>{label}</Text>
      <View>
        <Text style={statStyles.value}>{value}</Text>
        {sub && <Text style={statStyles.sub}>{sub}</Text>}
      </View>
    </View>
  );
}

function PitchTypeBar({
  type, pct: p, avgVelocity,
}: { type: string; pct: number; avgVelocity: number | null }) {
  const barW = Math.max(p * 100, 2);
  return (
    <View style={pitchBarStyles.row}>
      <Text style={pitchBarStyles.type} numberOfLines={1}>{type}</Text>
      <View style={pitchBarStyles.barWrap}>
        <View style={[pitchBarStyles.bar, { width: `${barW}%` as any }]} />
      </View>
      <Text style={pitchBarStyles.pctText}>{pct(p)}</Text>
      <Text style={pitchBarStyles.velText}>{fmtV(avgVelocity)}</Text>
    </View>
  );
}

function CountCard({ tendency }: { tendency: CountTendency }) {
  const key = `${tendency.balls}-${tendency.strikes}`;
  const topPitch = tendency.pitchTypes[0];
  const topZone  = tendency.topZones[0];
  return (
    <View style={countStyles.card}>
      <Text style={countStyles.countLabel}>{COUNT_LABEL[key] ?? key}</Text>
      <Text style={countStyles.countBadge}>{tendency.total}球</Text>
      {topPitch ? (
        <>
          <Text style={countStyles.pitchType} numberOfLines={1}>{topPitch.type}</Text>
          <Text style={countStyles.pitchPct}>{pct(topPitch.pct)}</Text>
        </>
      ) : (
        <Text style={countStyles.pitchType}>-</Text>
      )}
      {topZone && (
        <View style={countStyles.zoneBadge}>
          <Text style={countStyles.zoneText}>{ZONE_JP[topZone.zone] ?? topZone.zone}</Text>
        </View>
      )}
    </View>
  );
}

function FinishRow({
  rank, pitchType, zone, count, p, avgVelocity,
}: { rank: number; pitchType: string; zone: string; count: number; p: number; avgVelocity: number | null }) {
  const colors = ['#D4AF37', '#C0C0C0', '#CD7F32', Colors.border, Colors.border];
  return (
    <View style={finishStyles.row}>
      <View style={[finishStyles.rankBadge, { backgroundColor: colors[rank - 1] ?? Colors.border }]}>
        <Text style={finishStyles.rankText}>{rank}</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={finishStyles.pitchType}>{pitchType}</Text>
        <Text style={finishStyles.detail}>
          ゾーン {ZONE_JP[zone] ?? zone}　{fmtV(avgVelocity)}
        </Text>
      </View>
      <Text style={finishStyles.pct}>{pct(p)}</Text>
      <Text style={finishStyles.count}>{count}球</Text>
    </View>
  );
}

// ── Main Screen ───────────────────────────────────────────────────────────────

export default function PitcherReportScreen() {
  const { pitcherId, pitcherName } =
    useLocalSearchParams<{ pitcherId: string; pitcherName: string }>();

  const userPlan = useUserPlan();

  const [profile, setProfile]     = useState<PitcherProfile | null>(null);
  const [loading, setLoading]     = useState(true);
  const [aiReport, setAiReport]   = useState<AIReport | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [catcherModalVisible, setCatcherModalVisible] = useState(false);
  const gamesRef = useRef<import('../../src/types/game').GameState[]>([]);

  const loadAIReport = useCallback(async (p: PitcherProfile) => {
    if (p.catchers.length === 0) return;
    setAiLoading(true);
    try {
      // AI レポートはバッテリープロファイル形式で呼ぶため、最多捕手で代表生成
      const topCatcher = p.catchers[0];
      const fakeBatteryProfile = {
        pitcherId:        p.pitcherId,
        pitcherName:      p.pitcherName,
        catcherId:        topCatcher.catcherId,
        catcherName:      topCatcher.catcherName,
        totalGames:       p.totalGames,
        totalPitches:     p.totalPitches,
        strikeRate:       p.strikeRate,
        avgVelocity:      p.avgVelocity,
        maxVelocity:      p.maxVelocity,
        zone2Strike:      p.zone2Strike,
        zone2StrikeR:     p.zone2StrikeR,
        zone2StrikeL:     p.zone2StrikeL,
        pitchType2Strike: p.pitchType2Strike,
        finishingPitches: p.finishingPitches,
        countTendencies:  p.countTendencies,
        summary:          p.summary,
      };
      const report = await generateBatteryAIReport(fakeBatteryProfile, gamesRef.current, userPlan);
      setAiReport(report);
    } finally {
      setAiLoading(false);
    }
  }, [userPlan, pitcherId]);

  useEffect(() => {
    setAiReport(null);
    (async () => {
      const games = await db.games.getAll();
      gamesRef.current = games;
      const p = buildPitcherProfile(games, pitcherId);
      setProfile(p);
      setLoading(false);
      if (p && p.totalPitches > 0) {
        await loadAIReport(p);
      }
    })();
  }, [pitcherId, loadAIReport]);

  const title = pitcherName ? `${pitcherName} 投手分析` : '投手分析';

  if (loading) {
    return (
      <View style={styles.center}>
        <Stack.Screen options={{ title }} />
        <ActivityIndicator size="large" color={Colors.primary} />
      </View>
    );
  }

  if (!profile || profile.totalPitches === 0) {
    return (
      <View style={styles.center}>
        <Stack.Screen options={{ title }} />
        <MaterialCommunityIcons name="database-off-outline" size={48} color={Colors.border} />
        <Text style={styles.emptyText}>投球データがありません</Text>
      </View>
    );
  }

  return (
    <>
      <Stack.Screen options={{ title }} />
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>

        {/* ── ① 基本統計 ── */}
        <View style={styles.card}>
          <SectionHeader icon="chart-line" label="基本統計" />
          <StatRow label="投球数"      value={`${profile.totalPitches}球`}   sub={`${profile.totalGames}試合`} />
          <StatRow label="ストライク率" value={pct(profile.strikeRate)} />
          <StatRow label="平均球速"     value={fmtV(profile.avgVelocity)}     sub={`MAX ${fmtV(profile.maxVelocity)}`} />
          <StatRow label="主要球種"
            value={profile.pitchTypeAll[0]?.type ?? '-'}
            sub={profile.pitchTypeAll[0] ? pct(profile.pitchTypeAll[0].pct) : undefined}
          />
        </View>

        {/* ── ② 球種割合（全体） ── */}
        {profile.pitchTypeAll.length > 0 && (
          <View style={styles.card}>
            <SectionHeader icon="chart-donut" label="球種割合（全体）" />
            {profile.pitchTypeAll.slice(0, 6).map((pt) => (
              <PitchTypeBar
                key={pt.type}
                type={pt.type}
                pct={pt.pct}
                avgVelocity={pt.avgVelocity}
              />
            ))}
          </View>
        )}

        {/* ── ③ ゾーン別投球分布 ── */}
        <View style={styles.card}>
          <SectionHeader icon="grid" label="ゾーン別投球分布" />
          <ZoneHeatmap
            heatData={profile.zoneDistribution}
            colorTheme="blue"
            showLabels
          />
        </View>

        {/* ── ④ 2ストライク時配球 ── */}
        <View style={styles.card}>
          <SectionHeader icon="fire" label="2ストライク時の配球" />
          <View style={styles.heatmapRow}>
            <ZoneHeatmap
              heatData={profile.zone2Strike}
              colorTheme="blue"
              showLabels
            />
            <View style={styles.pitchTypeCol}>
              <Text style={styles.subHeading}>球種割合</Text>
              {profile.pitchType2Strike.slice(0, 5).map((pt) => (
                <PitchTypeBar
                  key={pt.type}
                  type={pt.type}
                  pct={pt.pct}
                  avgVelocity={pt.avgVelocity}
                />
              ))}
            </View>
          </View>
        </View>

        {/* ── ⑤ カウント別傾向 ── */}
        {profile.countTendencies.length > 0 && (
          <View style={styles.card}>
            <SectionHeader icon="table" label="カウント別配球傾向" />
            <Text style={styles.hint}>最多球種と最多投球ゾーンを表示</Text>
            <View style={countStyles.grid}>
              {profile.countTendencies.map((ct) => (
                <CountCard key={`${ct.balls}-${ct.strikes}`} tendency={ct} />
              ))}
            </View>
          </View>
        )}

        {/* ── ⑥ 決め球ランキング ── */}
        {profile.finishingPitches.length > 0 && (
          <View style={styles.card}>
            <SectionHeader icon="trophy" label="決め球ランキング (三振の最終球)" />
            {profile.finishingPitches.map((fp, i) => (
              <FinishRow
                key={fp.pitchType + fp.zone}
                rank={i + 1}
                pitchType={fp.pitchType}
                zone={fp.zone}
                count={fp.count}
                p={fp.pct}
                avgVelocity={fp.avgVelocity}
              />
            ))}
          </View>
        )}

        {/* ── ⑦ 捕手別に分析 ── */}
        {profile.catchers.length > 0 && (
          <View style={styles.card}>
            <SectionHeader icon="account-group" label="捕手別に分析" />
            <Text style={styles.hint}>
              捕手を選んでバッテリー分析に移動します
            </Text>
            <TouchableOpacity
              style={styles.catcherBtn}
              onPress={() => setCatcherModalVisible(true)}
              activeOpacity={0.8}
            >
              <MaterialCommunityIcons name="account-search" size={18} color={Colors.primary} />
              <Text style={styles.catcherBtnText}>
                捕手を選んでバッテリー分析へ（{profile.catchers.length}人）
              </Text>
              <MaterialCommunityIcons name="chevron-right" size={18} color={Colors.primary} />
            </TouchableOpacity>
          </View>
        )}

        {/* ── ⑧ AI / ルールベースサマリ ── */}
        {aiLoading ? (
          <View style={[styles.card, styles.summaryCard]}>
            <View style={styles.summaryHeader}>
              <MaterialCommunityIcons name="robot-outline" size={20} color={Colors.primary} />
              <Text style={styles.summaryTitle}>AI 分析サマリ</Text>
            </View>
            <ActivityIndicator size="small" color={Colors.primary} style={{ marginVertical: 8 }} />
          </View>
        ) : aiReport && !aiReport.isMock ? (
          <View style={[styles.card, styles.summaryCard]}>
            <View style={styles.summaryHeader}>
              <MaterialCommunityIcons name="robot-outline" size={20} color={Colors.primary} />
              <Text style={styles.summaryTitle}>AI 分析サマリ</Text>
              {aiReport.usage ? (
                <Text style={styles.summaryUsage}>
                  本日 残り {aiReport.usage.remaining}/{aiReport.usage.limit} 回
                </Text>
              ) : null}
            </View>
            <Text style={styles.summaryText}>{aiReport.overall}</Text>
            {reportToSections(aiReport)
              .filter((s) => s.title !== '総合評価')
              .map((s) => (
                <View key={s.title} style={styles.aiSection}>
                  <Text style={styles.aiSectionTitle}>{s.title}</Text>
                  <Text style={styles.aiSectionBody}>{s.content}</Text>
                </View>
              ))}
          </View>
        ) : aiReport ? (
          <AIReportErrorCard
            report={aiReport}
            currentPlan={userPlan}
            featureLabel="AI 分析サマリ"
            onRetry={profile ? () => loadAIReport(profile) : undefined}
          />
        ) : null}

        <View style={{ height: 40 }} />
      </ScrollView>

      {/* ── 捕手選択モーダル ── */}
      <Modal
        visible={catcherModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setCatcherModalVisible(false)}
      >
        <TouchableOpacity
          style={modalStyles.backdrop}
          activeOpacity={1}
          onPress={() => setCatcherModalVisible(false)}
        />
        <SafeAreaView style={modalStyles.sheet}>
          <View style={modalStyles.handle} />
          <Text style={modalStyles.sheetTitle}>捕手を選択</Text>
          <FlatList
            data={profile?.catchers ?? []}
            keyExtractor={(item) => item.catcherId}
            renderItem={({ item }) => (
              <TouchableOpacity
                style={modalStyles.row}
                activeOpacity={0.7}
                onPress={() => {
                  setCatcherModalVisible(false);
                  router.push({
                    pathname: '/analysis/battery-report' as any,
                    params: {
                      pitcherId:   pitcherId,
                      catcherId:   item.catcherId,
                      pitcherName: pitcherName,
                      catcherName: item.catcherName,
                    },
                  });
                }}
              >
                <View style={{ flex: 1 }}>
                  <Text style={modalStyles.rowLabel}>{item.catcherName}</Text>
                  <Text style={modalStyles.rowSub}>{item.pitchCount}球</Text>
                </View>
                <MaterialCommunityIcons name="chevron-right" size={18} color={Colors.textSecondary} />
              </TouchableOpacity>
            )}
            ItemSeparatorComponent={() => <View style={modalStyles.sep} />}
            contentContainerStyle={{ paddingBottom: 32 }}
          />
        </SafeAreaView>
      </Modal>
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
  heatmapRow: {
    flexDirection: 'row',
    alignItems:    'flex-start',
    gap:           Spacing.sm,
    flexWrap:      'wrap',
  },
  pitchTypeCol: { flex: 1, minWidth: 120, gap: 6 },
  subHeading:  { fontSize: Typography.caption, fontWeight: '700', color: Colors.textSecondary },
  hint:        { fontSize: Typography.tiny, color: Colors.textSecondary },

  catcherBtn: {
    flexDirection:  'row',
    alignItems:     'center',
    gap:            Spacing.sm,
    backgroundColor: Colors.primaryLight,
    borderRadius:   BorderRadius.lg,
    padding:        Spacing.md,
    borderWidth:    1,
    borderColor:    Colors.primary + '40',
  },
  catcherBtnText: {
    flex:       1,
    fontSize:   Typography.bodySmall,
    fontWeight: '700',
    color:      Colors.primary,
  },

  summaryCard:   { backgroundColor: Colors.primaryLight },
  summaryHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs },
  summaryTitle:  { fontSize: Typography.bodySmall, fontWeight: '800', color: Colors.primary, flex: 1 },
  summaryUsage:  { fontSize: Typography.tiny, fontWeight: '600', color: Colors.textSecondary },
  summaryText:   { fontSize: Typography.bodySmall, color: Colors.text, lineHeight: 22 },
  aiSection: {
    marginTop: Spacing.xs,
    paddingTop: Spacing.xs,
    borderTopWidth: 0.5,
    borderTopColor: Colors.primary + '40',
  },
  aiSectionTitle: {
    fontSize:    Typography.tiny,
    fontWeight:  '700',
    color:       Colors.primary,
    marginBottom: 2,
  },
  aiSectionBody: {
    fontSize:   Typography.bodySmall,
    color:      Colors.text,
    lineHeight: 20,
  },
});

const statStyles = StyleSheet.create({
  row: {
    flexDirection:    'row',
    justifyContent:   'space-between',
    alignItems:       'center',
    paddingVertical:  6,
    borderBottomWidth: 0.5,
    borderBottomColor: Colors.border,
  },
  label: { fontSize: Typography.caption, color: Colors.textSecondary, fontWeight: '600' },
  value: { fontSize: Typography.bodySmall, fontWeight: '800', color: Colors.primary, textAlign: 'right' },
  sub:   { fontSize: Typography.tiny, color: Colors.textSecondary, textAlign: 'right' },
});

const pitchBarStyles = StyleSheet.create({
  row:     { flexDirection: 'row', alignItems: 'center', gap: 4 },
  type:    { fontSize: Typography.tiny, fontWeight: '700', color: Colors.text, width: 56 },
  barWrap: { flex: 1, height: 8, backgroundColor: Colors.border, borderRadius: 4, overflow: 'hidden' },
  bar:     { height: '100%', backgroundColor: Colors.primary, borderRadius: 4 },
  pctText: { fontSize: Typography.tiny, color: Colors.primary, fontWeight: '700', width: 32, textAlign: 'right' },
  velText: { fontSize: Typography.tiny, color: Colors.textSecondary, width: 52, textAlign: 'right' },
});

const countStyles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.xs },
  card: {
    width:           '30%',
    backgroundColor: Colors.surfaceGray,
    borderRadius:    BorderRadius.md,
    padding:         Spacing.xs,
    alignItems:      'center',
    gap:             2,
    minWidth:        88,
  },
  countLabel: { fontSize: Typography.tiny, fontWeight: '800', color: Colors.text },
  countBadge: { fontSize: 9, color: Colors.textSecondary },
  pitchType:  { fontSize: Typography.caption, fontWeight: '700', color: Colors.primary, textAlign: 'center' },
  pitchPct:   { fontSize: Typography.tiny, color: Colors.textSecondary },
  zoneBadge:  { backgroundColor: Colors.primaryLight, paddingHorizontal: 4, paddingVertical: 1, borderRadius: BorderRadius.sm },
  zoneText:   { fontSize: 9, color: Colors.primary, fontWeight: '700' },
});

const finishStyles = StyleSheet.create({
  row: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
    paddingVertical: 8, borderBottomWidth: 0.5, borderBottomColor: Colors.border,
  },
  rankBadge: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  rankText:  { fontSize: Typography.caption, fontWeight: '900', color: Colors.white },
  pitchType: { fontSize: Typography.bodySmall, fontWeight: '700', color: Colors.text },
  detail:    { fontSize: Typography.tiny, color: Colors.textSecondary, marginTop: 1 },
  pct:       { fontSize: Typography.body, fontWeight: '900', color: Colors.primary, minWidth: 44, textAlign: 'right' },
  count:     { fontSize: Typography.caption, color: Colors.textSecondary, minWidth: 30, textAlign: 'right' },
});

const secStyles = StyleSheet.create({
  row:   { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs },
  icon:  { width: 26, height: 26, borderRadius: 13, backgroundColor: Colors.primary, alignItems: 'center', justifyContent: 'center' },
  label: { fontSize: Typography.bodySmall, fontWeight: '800', color: Colors.text },
});

const modalStyles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: Colors.overlay },
  sheet: {
    backgroundColor:     Colors.white,
    borderTopLeftRadius:  24,
    borderTopRightRadius: 24,
    padding:   Spacing.md,
    maxHeight: '60%',
  },
  handle: {
    alignSelf:       'center',
    width:           40,
    height:          4,
    backgroundColor: Colors.border,
    borderRadius:    2,
    marginBottom:    Spacing.md,
  },
  sheetTitle: {
    fontSize:     Typography.h4,
    fontWeight:   '800',
    color:        Colors.text,
    marginBottom: Spacing.sm,
  },
  row: {
    flexDirection:  'row',
    alignItems:     'center',
    gap:            Spacing.sm,
    paddingVertical: Spacing.sm,
  },
  rowLabel: { fontSize: Typography.body, fontWeight: '600', color: Colors.text },
  rowSub:   { fontSize: Typography.caption, color: Colors.textSecondary, marginTop: 2 },
  sep:      { height: 0.5, backgroundColor: Colors.border },
});
