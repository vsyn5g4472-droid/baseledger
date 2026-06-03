/**
 * バッテリー分析レポート画面
 *
 * 表示内容:
 *  1. サマリ統計 (投球数・ストライク率・球速)
 *  2. 2ストライク時ゾーンヒートマップ + 球種割合
 *  3. カウント別傾向グリッド
 *  4. 決め球ランキング
 *  5. AI 自然言語サマリ
 */

import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Modal,
  TextInput,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { db } from '../../src/db';
import { buildBatteryProfile, type BatteryProfile, type CountTendency } from '../../src/utils/analysisEngine';
import ZoneHeatmap from '../../src/components/analysis/ZoneHeatmap';
import { generateBatteryAIReport, reportToSections, type AIReport } from '../../src/services/aiReportService';
import AIReportErrorCard from '../../src/components/AIReportErrorCard';
import { useUserPlan } from '../../src/hooks/usePlanGate';
import { usePostActions } from '../../src/hooks/usePosts';
import type { PostVisibility } from '../../src/models/types';
import { Colors, Spacing, Typography, BorderRadius, CardShadow } from '../../src/constants/theme';
import { generateBatteryReportHtml, buildBatterySummaryText } from '../../src/utils/batteryReportGenerator';
import ShareToChatModal from '../../src/components/ShareToChatModal';

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

/** 概要ステータス行 */
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

/** 球種割合バーチャート (横棒) */
function PitchTypeBar({
  type, count, pct: p, avgVelocity, total,
}: { type: string; count: number; pct: number; avgVelocity: number | null; total: number }) {
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

/** カウント傾向カード */
function CountCard({ tendency }: { tendency: CountTendency }) {
  const key = `${tendency.balls}-${tendency.strikes}`;
  const topPitch = tendency.pitchTypes[0];
  const topZone  = tendency.topZones[0];
  return (
    <View style={countStyles.card}>
      <Text style={countStyles.countLabel}>
        {COUNT_LABEL[key] ?? key}
      </Text>
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

/** 決め球ランキング行 */
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

export default function BatteryReportScreen() {
  const { pitcherId, catcherId, pitcherName, catcherName } =
    useLocalSearchParams<{
      pitcherId:   string;
      catcherId:   string;
      pitcherName: string;
      catcherName: string;
    }>();

  const userPlan = useUserPlan();
  const { createPost } = usePostActions();

  const [profile, setProfile] = useState<BatteryProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [aiReport, setAiReport] = useState<AIReport | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const gamesRef = useRef<import('../../src/types/game').GameState[]>([]);

  // フィード共有モーダル
  const [showShareModal, setShowShareModal]   = useState(false);
  const [shareContent, setShareContent]       = useState('');
  const [sharePosting, setSharePosting]       = useState(false);
  const [shareVisibility, setShareVisibility] = useState<PostVisibility>('public');

  // PDF / チャット共有
  const [pdfSharing, setPdfSharing]       = useState(false);
  const [showChatModal, setShowChatModal] = useState(false);
  const [chatSummary, setChatSummary]     = useState('');

  const loadAIReport = useCallback(async (p: BatteryProfile) => {
    setAiLoading(true);
    try {
      const report = await generateBatteryAIReport(p, gamesRef.current, userPlan);
      setAiReport(report);
    } finally {
      setAiLoading(false);
    }
  }, [userPlan, pitcherId, catcherId]);

  const handleOpenShare = useCallback(() => {
    if (!profile) return;
    const header = `⚾ 捕手分析: ${pitcherName ?? '投手'} × ${catcherName ?? '捕手'}`;
    const statsLine = `投球数: ${profile.totalPitches}球 / ストライク率: ${Math.round(profile.strikeRate * 100)}%`;
    let text = `${header}\n${statsLine}`;
    if (aiReport && !aiReport.isMock && aiReport.overall) {
      text += `\n\n【AI 総合評価】\n${aiReport.overall}`;
      if (aiReport.nextAdvice) {
        text += `\n\n【次戦へのアドバイス】\n${aiReport.nextAdvice}`;
      }
    }
    setShareContent(text);
    setShowShareModal(true);
  }, [profile, pitcherName, catcherName, aiReport]);

  const handlePostToFeed = useCallback(async () => {
    if (!shareContent.trim()) return;
    setSharePosting(true);
    try {
      await createPost({
        type:             'stats',
        content:          shareContent.trim(),
        mediaURIs:        [],
        externalVideoUrl: null,
        statsData:        {
          pitcherName: pitcherName ?? '',
          catcherName: catcherName ?? '',
          totalPitches: profile?.totalPitches ?? 0,
          strikeRate:   profile ? Math.round(profile.strikeRate * 100) : 0,
        },
        visibility: shareVisibility,
        teamId:     null,
      });
      setShowShareModal(false);
      Alert.alert('投稿しました', '捕手分析をフィードに共有しました。');
    } catch {
      Alert.alert('エラー', '投稿に失敗しました。もう一度お試しください。');
    } finally {
      setSharePosting(false);
    }
  }, [shareContent, shareVisibility, pitcherName, catcherName, profile, createPost]);

  const handleSharePDF = useCallback(async () => {
    if (!profile) return;
    setPdfSharing(true);
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const Print = require('expo-print');
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const Sharing = require('expo-sharing');
      const html = generateBatteryReportHtml(profile);
      const { uri } = await Print.printToFileAsync({ html, base64: false });
      const canShare = await Sharing.isAvailableAsync();
      if (canShare) {
        await Sharing.shareAsync(uri, {
          mimeType: 'application/pdf',
          dialogTitle: '捕手分析レポートを共有',
          UTI: 'com.adobe.pdf',
        });
      } else {
        Alert.alert('共有できません', 'このデバイスでは共有機能が利用できません。');
      }
    } catch (e: unknown) {
      Alert.alert('エラー', (e as { message?: string })?.message ?? 'PDF生成に失敗しました');
    } finally {
      setPdfSharing(false);
    }
  }, [profile]);

  const handleOpenChatShare = useCallback(() => {
    if (!profile) return;
    setChatSummary(buildBatterySummaryText(profile));
    setShowChatModal(true);
  }, [profile]);

  useEffect(() => {
    setAiReport(null);
    (async () => {
      const games = await db.games.getAll();
      gamesRef.current = games;
      const p = buildBatteryProfile(games, pitcherId, catcherId);
      setProfile(p);
      setLoading(false);
      if (p && p.totalPitches > 0) {
        await loadAIReport(p);
      }
    })();
  }, [pitcherId, catcherId, loadAIReport]);

  const title = pitcherName && catcherName
    ? `${pitcherName} × ${catcherName}`
    : '捕手分析';

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
      <Stack.Screen
        options={{
          title,
          headerRight: () => (
            <View style={{ flexDirection: 'row', gap: 4, marginRight: 4 }}>
              {/* チャット共有 */}
              <TouchableOpacity
                onPress={handleOpenChatShare}
                style={{ padding: 4 }}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <MaterialCommunityIcons name="chat-plus-outline" size={22} color={Colors.primary} />
              </TouchableOpacity>
              {/* PDF 共有 */}
              <TouchableOpacity
                onPress={handleSharePDF}
                disabled={pdfSharing}
                style={{ padding: 4 }}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                {pdfSharing
                  ? <ActivityIndicator size="small" color={Colors.primary} />
                  : <MaterialCommunityIcons name="file-pdf-box" size={22} color={Colors.primary} />
                }
              </TouchableOpacity>
              {/* フィード共有 */}
              <TouchableOpacity
                onPress={handleOpenShare}
                style={{ padding: 4 }}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <MaterialCommunityIcons name="share-variant" size={22} color={Colors.primary} />
              </TouchableOpacity>
            </View>
          ),
        }}
      />

      {/* チャット/DM 共有モーダル */}
      <ShareToChatModal
        visible={showChatModal}
        onClose={() => setShowChatModal(false)}
        summary={chatSummary}
      />

      {/* フィード共有モーダル */}
      <Modal
        visible={showShareModal}
        transparent
        animationType="slide"
        onRequestClose={() => { if (!sharePosting) setShowShareModal(false); }}
      >
        <TouchableOpacity
          style={shareStyles.backdrop}
          activeOpacity={1}
          onPress={() => { if (!sharePosting) setShowShareModal(false); }}
        >
          <TouchableOpacity activeOpacity={1} style={shareStyles.sheet}>
            <View style={shareStyles.handle} />
            <Text style={shareStyles.title}>フィードに共有</Text>

            <TextInput
              style={shareStyles.textArea}
              multiline
              value={shareContent}
              onChangeText={setShareContent}
              placeholder="投稿内容を編集できます..."
              placeholderTextColor={Colors.textSecondary}
              maxLength={1000}
              textAlignVertical="top"
            />
            <Text style={shareStyles.charCount}>{shareContent.length}/1000</Text>

            {/* 公開範囲 */}
            <View style={shareStyles.visRow}>
              {(['public', 'followers'] as PostVisibility[]).map((v) => (
                <TouchableOpacity
                  key={v}
                  style={[shareStyles.visBtn, shareVisibility === v && shareStyles.visBtnActive]}
                  onPress={() => setShareVisibility(v)}
                >
                  <MaterialCommunityIcons
                    name={v === 'public' ? 'earth' : 'account-multiple'}
                    size={14}
                    color={shareVisibility === v ? Colors.white : Colors.textSecondary}
                  />
                  <Text style={[shareStyles.visBtnText, shareVisibility === v && shareStyles.visBtnTextActive]}>
                    {v === 'public' ? '全体公開' : 'フォロワー'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <TouchableOpacity
              style={[shareStyles.postBtn, (sharePosting || !shareContent.trim()) && shareStyles.postBtnDisabled]}
              onPress={handlePostToFeed}
              disabled={sharePosting || !shareContent.trim()}
            >
              {sharePosting
                ? <ActivityIndicator color={Colors.white} size="small" />
                : <Text style={shareStyles.postBtnText}>フィードに投稿する</Text>
              }
            </TouchableOpacity>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      <ScrollView style={styles.container} contentContainerStyle={styles.content}>

        {/* ── ① サマリ ── */}
        <View style={styles.card}>
          <SectionHeader icon="chart-line" label="基本統計" />
          <StatRow label="投球数"      value={`${profile.totalPitches}球`}   sub={`${profile.totalGames}試合`} />
          <StatRow label="ストライク率" value={pct(profile.strikeRate)} />
          <StatRow label="平均球速"     value={fmtV(profile.avgVelocity)} sub={`MAX ${fmtV(profile.maxVelocity)}`} />
          <StatRow label="三振決め球"
            value={profile.finishingPitches[0]?.pitchType ?? '-'}
            sub={profile.finishingPitches[0] ? pct(profile.finishingPitches[0].pct) : undefined}
          />
        </View>

        {/* ── ② 2ストライク時ヒートマップ ── */}
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
                  count={pt.count}
                  pct={pt.pct}
                  avgVelocity={pt.avgVelocity}
                  total={profile.totalPitches}
                />
              ))}
            </View>
          </View>
        </View>

        {/* ── ③ カウント別傾向 ── */}
        {profile.countTendencies.length > 0 && (
          <View style={styles.card}>
            <SectionHeader icon="grid" label="カウント別配球傾向" />
            <Text style={styles.hint}>最多球種と最多投球ゾーンを表示</Text>
            <View style={countStyles.grid}>
              {profile.countTendencies.map((ct) => (
                <CountCard key={`${ct.balls}-${ct.strikes}`} tendency={ct} />
              ))}
            </View>
          </View>
        )}

        {/* ── ④ 決め球ランキング ── */}
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

        {/* ── ⑤ AI / ルールベースサマリ ── */}
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
    </>
  );
}

// ── Section header ────────────────────────────────────────────────────────────

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
    fontSize: Typography.tiny,
    fontWeight: '700',
    color: Colors.primary,
    marginBottom: 2,
  },
  aiSectionBody: {
    fontSize: Typography.bodySmall,
    color: Colors.text,
    lineHeight: 20,
  },
});

const statStyles = StyleSheet.create({
  row: {
    flexDirection:  'row',
    justifyContent: 'space-between',
    alignItems:     'center',
    paddingVertical: 6,
    borderBottomWidth: 0.5,
    borderBottomColor: Colors.border,
  },
  label: { fontSize: Typography.caption, color: Colors.textSecondary, fontWeight: '600' },
  value: { fontSize: Typography.bodySmall, fontWeight: '800', color: Colors.primary, textAlign: 'right' },
  sub:   { fontSize: Typography.tiny, color: Colors.textSecondary, textAlign: 'right' },
});

const pitchBarStyles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  type: { fontSize: Typography.tiny, fontWeight: '700', color: Colors.text, width: 56 },
  barWrap: {
    flex: 1, height: 8, backgroundColor: Colors.border,
    borderRadius: 4, overflow: 'hidden',
  },
  bar: { height: '100%', backgroundColor: Colors.primary, borderRadius: 4 },
  pctText: { fontSize: Typography.tiny, color: Colors.primary, fontWeight: '700', width: 32, textAlign: 'right' },
  velText: { fontSize: Typography.tiny, color: Colors.textSecondary, width: 52, textAlign: 'right' },
});

const countStyles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.xs },
  card: {
    width: '30%',
    backgroundColor: Colors.surfaceGray,
    borderRadius:    BorderRadius.md,
    padding:         Spacing.xs,
    alignItems:      'center',
    gap:             2,
    minWidth: 88,
  },
  countLabel:  { fontSize: Typography.tiny, fontWeight: '800', color: Colors.text },
  countBadge:  { fontSize: 9, color: Colors.textSecondary },
  pitchType:   { fontSize: Typography.caption, fontWeight: '700', color: Colors.primary, textAlign: 'center' },
  pitchPct:    { fontSize: Typography.tiny, color: Colors.textSecondary },
  zoneBadge:   {
    backgroundColor: Colors.primaryLight,
    paddingHorizontal: 4, paddingVertical: 1,
    borderRadius: BorderRadius.sm,
  },
  zoneText:    { fontSize: 9, color: Colors.primary, fontWeight: '700' },
});

const finishStyles = StyleSheet.create({
  row: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
    paddingVertical: 8, borderBottomWidth: 0.5, borderBottomColor: Colors.border,
  },
  rankBadge: {
    width: 28, height: 28, borderRadius: 14,
    alignItems: 'center', justifyContent: 'center',
  },
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

const shareStyles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: Colors.white,
    borderTopLeftRadius: BorderRadius.xl,
    borderTopRightRadius: BorderRadius.xl,
    padding: Spacing.lg,
    paddingBottom: 40,
  },
  handle: {
    width: 40, height: 4, borderRadius: 2,
    backgroundColor: Colors.border,
    alignSelf: 'center',
    marginBottom: Spacing.md,
  },
  title: {
    fontSize: Typography.h3,
    fontWeight: '800',
    color: Colors.text,
    marginBottom: Spacing.md,
  },
  textArea: {
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: BorderRadius.lg,
    padding: Spacing.sm,
    minHeight: 120,
    fontSize: Typography.bodySmall,
    color: Colors.text,
    lineHeight: 20,
    backgroundColor: Colors.background,
  },
  charCount: {
    fontSize: Typography.tiny,
    color: Colors.textSecondary,
    textAlign: 'right',
    marginTop: 4,
    marginBottom: Spacing.sm,
  },
  visRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginBottom: Spacing.md,
  },
  visBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 6,
    paddingHorizontal: Spacing.sm,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  visBtnActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  visBtnText: {
    fontSize: Typography.tiny,
    fontWeight: '600',
    color: Colors.textSecondary,
  },
  visBtnTextActive: { color: Colors.white },
  postBtn: {
    backgroundColor: Colors.primary,
    borderRadius: BorderRadius.full,
    paddingVertical: Spacing.sm,
    alignItems: 'center',
  },
  postBtnDisabled: { backgroundColor: Colors.border },
  postBtnText: {
    color: Colors.white,
    fontWeight: '700',
    fontSize: Typography.body,
  },
});
