/**
 * 打者分析レポート画面
 *
 * 表示内容:
 *  1. 成績サマリ (打率・三振率・四球率)
 *  2. 打球散布図 (SprayChart)
 *  3. コース別成績ヒートマップ (苦手/得意コース強調)
 *  4. 球速帯別成績バーチャート
 *  5. 球種別成績テーブル
 *  6. 作戦傾向チップス
 */

import React, { useEffect, useState, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  TouchableOpacity,
  Modal,
  TextInput,
  Alert,
} from 'react-native';
import { Stack, useLocalSearchParams, router } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import Svg, { Rect, Text as SvgText } from 'react-native-svg';
import { db } from '../../src/db';
import type { AtBatLog } from '../../src/types/game';
import {
  buildBatterProfile,
  type BatterProfile,
  type VelocityBandStat,
  type ZoneSwingStat,
} from '../../src/utils/analysisEngine';
import ZoneHeatmap from '../../src/components/analysis/ZoneHeatmap';
import SprayChart from '../../src/components/analytics/SprayChart';
import { generateBatterAIReport, reportToSections, type AIReport } from '../../src/services/aiReportService';
import PlanUpgradeCard from '../../src/components/PlanUpgradeCard';
import AIReportErrorCard from '../../src/components/AIReportErrorCard';
import { useUserPlan, usePlanGate } from '../../src/hooks/usePlanGate';
import { checkAIReportUsage } from '../../src/services/planService';
import { usePostActions } from '../../src/hooks/usePosts';
import type { PostVisibility } from '../../src/models/types';
import { Colors, Spacing, Typography, BorderRadius, CardShadow } from '../../src/constants/theme';
import { generateBatterReportHtml, buildBatterSummaryText } from '../../src/utils/batterReportGenerator';
import ShareToChatModal from '../../src/components/ShareToChatModal';

// ── Helpers ───────────────────────────────────────────────────────────────────

function pct(v: number) { return `${Math.round(v * 100)}%`; }
function fmt3(v: number) { return v.toFixed(3).replace(/^0/, '') || '.000'; }
function fmtV(v: number | null) { return v != null ? `${v}km/h` : '-'; }

/** SprayPoint → AtBatLog の最小形式に変換して SprayChart に渡す */
function sprayToAtBatLogs(profile: BatterProfile): AtBatLog[] {
  return profile.sprayPoints.map((sp) => ({
    id:              sp.id,
    inning:          { number: 1, half: 'top' as const },
    batterId:        profile.batterId,
    pitcherId:       '',
    pitches:         [],
    result:          sp.result,
    battedBall: {
      type:              'fly',
      fieldX:            sp.fieldX,
      fieldY:            sp.fieldY,
      estimatedDistance: sp.estimatedDistance,
    },
    rbiCount:          0,
    runnersBeforePlay: { first: null, second: null, third: null },
    runnersAfterPlay:  { first: null, second: null, third: null },
    timestamp:         0,
  }));
}

// ── Velocity Band Chart ───────────────────────────────────────────────────────

const BAR_H = 24;
const BAR_GAP = 6;

function VelocityBandChart({ bands }: { bands: VelocityBandStat[] }) {
  if (bands.length === 0) {
    return <Text style={{ color: Colors.textSecondary, fontSize: Typography.caption }}>球速データなし</Text>;
  }

  const maxFaced = Math.max(...bands.map((b) => b.pitchesFaced), 1);
  const SVG_W = 260;
  const SVG_H = bands.length * (BAR_H + BAR_GAP) + BAR_GAP;
  const LABEL_W = 44;
  const BAR_AREA = SVG_W - LABEL_W - 8;

  return (
    <Svg width={SVG_W} height={SVG_H}>
      {bands.map((b, i) => {
        const y       = BAR_GAP + i * (BAR_H + BAR_GAP);
        const barMaxW = BAR_AREA;
        const totalW  = (b.pitchesFaced / maxFaced) * barMaxW;
        const hitW    = b.pitchesFaced > 0 ? (b.hits / b.pitchesFaced) * totalW : 0;
        const missW   = b.pitchesFaced > 0 ? (b.swingMisses / b.pitchesFaced) * totalW : 0;
        const swingMissRate = b.swings > 0 ? b.swingMisses / b.swings : 0;

        return (
          <React.Fragment key={b.label}>
            {/* ラベル */}
            <SvgText x={0} y={y + BAR_H / 2 + 5} fontSize={10} fill={Colors.textSecondary}>{b.label}</SvgText>

            {/* 背景バー */}
            <Rect x={LABEL_W} y={y} width={barMaxW} height={BAR_H}
              rx={4} fill={Colors.surfaceGray} />

            {/* 打率部分 (green) */}
            {hitW > 0 && (
              <Rect x={LABEL_W} y={y} width={hitW} height={BAR_H}
                rx={4} fill="rgba(52,199,89,0.75)" />
            )}

            {/* 空振り部分 (red overlay) */}
            {missW > 0 && (
              <Rect x={LABEL_W + totalW - missW} y={y} width={missW} height={BAR_H}
                rx={4} fill="rgba(196,30,58,0.65)" />
            )}

            {/* 球数テキスト */}
            <SvgText x={LABEL_W + barMaxW + 4} y={y + BAR_H / 2 + 5}
              fontSize={9} fill={Colors.textSecondary}>{b.pitchesFaced}球</SvgText>
          </React.Fragment>
        );
      })}
    </Svg>
  );
}

// ── Zone weakness/strength badge ──────────────────────────────────────────────

function ZoneBadge({ stat, mode }: { stat: ZoneSwingStat; mode: 'weak' | 'strong' }) {
  const ZONE_JP: Record<string, string> = {
    '1': '内角高め', '2': '高め中', '3': '外角高め',
    '4': '内角中',  '5': '真ん中', '6': '外角中',
    '7': '内角低め', '8': '低め中', '9': '外角低め',
    'BH': '高めボール', 'BL': '低めボール', 'BI': '内角ボール', 'BO': '外角ボール',
  };
  const isWeak  = mode === 'weak';
  const label   = ZONE_JP[stat.zone] ?? stat.zone;
  const metric  = isWeak ? pct(stat.swingMissRate) : pct(stat.hitRate);
  const metricLabel = isWeak ? '空振率' : '打率';
  const bg      = isWeak ? 'rgba(196,30,58,0.1)' : 'rgba(52,199,89,0.1)';
  const color   = isWeak ? Colors.secondary : Colors.success;

  return (
    <View style={[badgeStyles.badge, { backgroundColor: bg }]}>
      <Text style={[badgeStyles.zone, { color }]}>{label}</Text>
      <Text style={badgeStyles.metric}>{metricLabel}</Text>
      <Text style={[badgeStyles.value, { color }]}>{metric}</Text>
    </View>
  );
}

// ── Pitch type table row ──────────────────────────────────────────────────────

function PitchTypeRow({
  type, count, swingMissRate, hitRate, avgVelocity,
}: {
  type: string; count: number;
  swingMissRate: number; hitRate: number; avgVelocity: number | null;
}) {
  return (
    <View style={tableStyles.row}>
      <Text style={tableStyles.type} numberOfLines={1}>{type}</Text>
      <Text style={tableStyles.cell}>{count}</Text>
      <Text style={[tableStyles.cell, swingMissRate > 0.35 && tableStyles.danger]}>
        {pct(swingMissRate)}
      </Text>
      <Text style={[tableStyles.cell, hitRate > 0.30 && tableStyles.good]}>
        {pct(hitRate)}
      </Text>
      <Text style={tableStyles.cell}>{fmtV(avgVelocity)}</Text>
    </View>
  );
}

// ── Strategy chip ─────────────────────────────────────────────────────────────

function StrategyChip({ icon, label, value, subtext }: {
  icon: string; label: string; value: string; subtext?: string;
}) {
  return (
    <View style={stratStyles.chip}>
      <MaterialCommunityIcons name={icon as any} size={20} color={Colors.primary} />
      <Text style={stratStyles.label}>{label}</Text>
      <Text style={stratStyles.value}>{value}</Text>
      {subtext && <Text style={stratStyles.sub}>{subtext}</Text>}
    </View>
  );
}

// ── Main Screen ───────────────────────────────────────────────────────────────

export default function BatterReportScreen() {
  const { batterId, batterName } =
    useLocalSearchParams<{ batterId: string; batterName: string }>();

  const userPlan = useUserPlan();
  const aiGate = usePlanGate('ai_report');
  const sprayGate = usePlanGate('spray_chart');
  const heatmapGate = usePlanGate('zone_heatmap');
  const { createPost } = usePostActions();

  const [profile, setProfile]   = useState<BatterProfile | null>(null);
  const [loading, setLoading]   = useState(true);
  const [aiReport, setAiReport] = useState<AIReport | null>(null);
  const [aiLoading, setAiLoading] = useState(false);

  // フィード共有モーダル
  const [showShareModal, setShowShareModal]   = useState(false);
  const [shareContent, setShareContent]       = useState('');
  const [sharePosting, setSharePosting]       = useState(false);
  const [shareVisibility, setShareVisibility] = useState<PostVisibility>('public');

  // PDF / チャット共有
  const [pdfSharing, setPdfSharing]         = useState(false);
  const [showChatModal, setShowChatModal]   = useState(false);
  const [chatSummary, setChatSummary]       = useState('');

  const loadAIReport = useCallback(async (p: BatterProfile) => {
    setAiLoading(true);
    try {
      const report = await generateBatterAIReport(p, userPlan);
      if (report.isMock && report.errorReason === 'monthly_limit_exceeded') {
        const usage = await checkAIReportUsage(userPlan);
        Alert.alert(
          'AI分析の上限に達しました',
          `今月のAI分析回数（${usage.limit}回）を使い切りました。プランをアップグレードすると回数が増えます。`,
          [{ text: 'OK' }],
        );
        return;
      }
      setAiReport(report);
    } finally {
      setAiLoading(false);
    }
  }, [userPlan, batterId]);

  const handleOpenShare = useCallback(() => {
    if (!profile) return;
    const avg = profile.avg.toFixed(3).replace(/^0/, '') || '.000';
    const estimatedHits = Math.round(profile.avg * profile.totalAtBats);
    const header = `⚾ 打者分析: ${batterName ?? '不明'}`;
    const statsLine = `打率 ${avg} / ${profile.totalAtBats}打数 ${estimatedHits}安打`;
    let text = `${header}\n${statsLine}`;
    if (aiReport && !aiReport.isMock && aiReport.overall) {
      text += `\n\n【AI 総合評価】\n${aiReport.overall}`;
      if (aiReport.nextAdvice) {
        text += `\n\n【次戦へのアドバイス】\n${aiReport.nextAdvice}`;
      }
    }
    setShareContent(text);
    setShowShareModal(true);
  }, [profile, batterName, aiReport]);

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
          batterName: batterName ?? '',
          atBats:     profile?.totalAtBats ?? 0,
          hits:       Math.round((profile?.avg ?? 0) * (profile?.totalAtBats ?? 0)),
          homeRuns:   0,
        },
        visibility: shareVisibility,
        teamId:     null,
      });
      setShowShareModal(false);
      Alert.alert('投稿しました', '打者分析をフィードに共有しました。');
    } catch {
      Alert.alert('エラー', '投稿に失敗しました。もう一度お試しください。');
    } finally {
      setSharePosting(false);
    }
  }, [shareContent, shareVisibility, batterName, profile, createPost]);

  const handleSharePDF = useCallback(async () => {
    if (!profile) return;
    setPdfSharing(true);
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const Print = require('expo-print');
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const Sharing = require('expo-sharing');
      const html = generateBatterReportHtml(profile, batterName ?? undefined);
      const { uri } = await Print.printToFileAsync({ html, base64: false });
      const canShare = await Sharing.isAvailableAsync();
      if (canShare) {
        await Sharing.shareAsync(uri, {
          mimeType: 'application/pdf',
          dialogTitle: '打者分析レポートを共有',
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
  }, [profile, batterName]);

  const handleOpenChatShare = useCallback(() => {
    if (!profile) return;
    setChatSummary(buildBatterSummaryText(profile, batterName ?? undefined));
    setShowChatModal(true);
  }, [profile, batterName]);

  useEffect(() => {
    setAiReport(null);
    (async () => {
      const games = await db.games.getAll();
      const p = buildBatterProfile(games, batterId);
      setProfile(p);
      setLoading(false);
      if (p && p.totalAtBats > 0) {
        await loadAIReport(p);
      }
    })();
  }, [batterId, loadAIReport]);

  // SprayChart 用の AtBatLog 配列に変換
  const atBatLogsForSpray = useMemo(
    () => (profile ? sprayToAtBatLogs(profile) : []),
    [profile],
  );

  // コース別ヒートマップ — 空振り率を色強度に使う
  const weakHeatData = useMemo(() => {
    if (!profile) return {};
    return Object.fromEntries(
      profile.zoneStats.map((z) => [z.zone, Math.round(z.swingMissRate * 100)])
    );
  }, [profile]);

  // 得意コースヒートマップ — 打率を色強度に使う
  const strongHeatData = useMemo(() => {
    if (!profile) return {};
    return Object.fromEntries(
      profile.zoneStats.map((z) => [z.zone, Math.round(z.hitRate * 100)])
    );
  }, [profile]);

  const labelDataWeak = useMemo(() => {
    if (!profile) return {};
    return Object.fromEntries(
      profile.zoneStats
        .filter((z) => z.swings > 0)
        .map((z) => [z.zone, pct(z.swingMissRate)])
    );
  }, [profile]);

  const labelDataStrong = useMemo(() => {
    if (!profile) return {};
    return Object.fromEntries(
      profile.zoneStats
        .filter((z) => z.pitchesFaced > 0)
        .map((z) => [z.zone, pct(z.hitRate)])
    );
  }, [profile]);

  if (loading) {
    return (
      <View style={styles.center}>
        <Stack.Screen options={{ title: batterName ?? '打者分析' }} />
        <ActivityIndicator size="large" color={Colors.primary} />
      </View>
    );
  }

  if (!profile || profile.totalAtBats === 0) {
    return (
      <View style={styles.center}>
        <Stack.Screen options={{ title: batterName ?? '打者分析' }} />
        <MaterialCommunityIcons name="database-off-outline" size={48} color={Colors.border} />
        <Text style={styles.emptyText}>打席データがありません</Text>
      </View>
    );
  }

  return (
    <>
      <Stack.Screen
        options={{
          title: batterName ?? profile.batterName,
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

        {/* ── ① 成績サマリ ── */}
        <View style={styles.card}>
          <SectionHeader icon="chart-line" label="打撃成績サマリ" />
          <View style={styles.summaryRow}>
            <StatBox label="打率" value={fmt3(profile.avg)} />
            <StatBox label="三振率" value={pct(profile.strikeoutRate)} />
            <StatBox label="四球率" value={pct(profile.walkRate)} />
          </View>
          <View style={styles.summaryRow}>
            <StatBox label="打席数" value={`${profile.totalAtBats}`} sub="打数" />
            <StatBox label="投球数" value={`${profile.totalPitchesFaced}`} sub="対戦" />
            <StatBox
              label="平均飛距離"
              value={profile.avgHitDistance ? `${profile.avgHitDistance}m` : '-'}
            />
          </View>
        </View>

        {/* ── ② 打球散布図 ── */}
        {sprayGate.allowed ? (
          <View style={styles.card}>
            <SectionHeader icon="baseball" label="打球散布図" />
            <SprayChart atBatLogs={atBatLogsForSpray} />
            <View style={styles.legendRow}>
              <LegendDot color={Colors.primary} label="安打" />
              <LegendDot color={Colors.accent}  label="エラー" />
              <LegendDot color={Colors.textSecondary} label="アウト" />
            </View>
          </View>
        ) : (
          <PlanUpgradeCard featureLabel="スプレーチャート" currentPlan={userPlan} />
        )}

        {/* ── ③ コース別成績 ── */}
        {heatmapGate.allowed ? (
          <View style={styles.card}>
            <SectionHeader icon="target" label="コース別成績" />
            <View style={styles.heatmapPair}>
              <View style={styles.heatmapBlock}>
                <Text style={styles.heatmapLabel}>空振り率</Text>
                <ZoneHeatmap
                  heatData={weakHeatData}
                  labelData={labelDataWeak}
                  colorTheme="red"
                  compact
                />
              </View>
              <View style={styles.heatmapBlock}>
                <Text style={styles.heatmapLabel}>打率</Text>
                <ZoneHeatmap
                  heatData={strongHeatData}
                  labelData={labelDataStrong}
                  colorTheme="green"
                  compact
                />
              </View>
            </View>

            {profile.weakZones.length > 0 && (
              <View>
                <Text style={styles.subHeading}>苦手コース (空振り率上位)</Text>
                <View style={styles.badgeRow}>
                  {profile.weakZones.map((z) => (
                    <ZoneBadge key={z.zone} stat={z} mode="weak" />
                  ))}
                </View>
              </View>
            )}
            {profile.strongZones.length > 0 && (
              <View>
                <Text style={styles.subHeading}>得意コース (打率上位)</Text>
                <View style={styles.badgeRow}>
                  {profile.strongZones.map((z) => (
                    <ZoneBadge key={z.zone} stat={z} mode="strong" />
                  ))}
                </View>
              </View>
            )}
          </View>
        ) : (
          <PlanUpgradeCard featureLabel="ゾーンヒートマップ" currentPlan={userPlan} />
        )}

        {/* ── ④ 球速帯別成績 ── */}
        {profile.velocityBands.length > 0 && (
          <View style={styles.card}>
            <SectionHeader icon="speedometer" label="球速帯別成績" />
            <View style={styles.bandLegend}>
              <LegendRect color="rgba(52,199,89,0.75)"  label="打率" />
              <LegendRect color="rgba(196,30,58,0.65)"  label="空振り率" />
            </View>
            <VelocityBandChart bands={profile.velocityBands} />
          </View>
        )}

        {/* ── ⑤ 球種別成績テーブル ── */}
        {profile.pitchTypeStats.length > 0 && (
          <View style={styles.card}>
            <SectionHeader icon="chart-bar" label="球種別成績" />
            <View style={tableStyles.header}>
              <Text style={[tableStyles.type, tableStyles.headerCell]}>球種</Text>
              <Text style={[tableStyles.cell, tableStyles.headerCell]}>球数</Text>
              <Text style={[tableStyles.cell, tableStyles.headerCell]}>空振率</Text>
              <Text style={[tableStyles.cell, tableStyles.headerCell]}>打率</Text>
              <Text style={[tableStyles.cell, tableStyles.headerCell]}>avg球速</Text>
            </View>
            {profile.pitchTypeStats.map((s) => (
              <PitchTypeRow key={s.type} {...s} />
            ))}
          </View>
        )}

        {/* ── ⑥ 作戦傾向 ── */}
        <View style={styles.card}>
          <SectionHeader icon="strategy" label="作戦傾向" />
          <View style={stratStyles.grid}>
            <StrategyChip
              icon="baseball-bat"
              label="初球打ち率"
              value={pct(profile.firstPitchSwingRate)}
              subtext={profile.firstPitchSwingRate > 0.4 ? '積極型' : '慎重型'}
            />
            <StrategyChip
              icon="hand-okay"
              label="バント率"
              value={pct(profile.buntRate)}
              subtext={profile.buntRate > 0.1 ? '犠打多め' : undefined}
            />
            <StrategyChip
              icon="close-circle"
              label="三振率"
              value={pct(profile.strikeoutRate)}
              subtext={profile.strikeoutRate > 0.25 ? '高め' : '低め'}
            />
          </View>
        </View>

        {/* ── ⑦ AI 分析サマリ ── */}
        {aiLoading ? (
          <View style={[styles.card, styles.aiCard]}>
            <View style={styles.aiHeader}>
              <MaterialCommunityIcons name="robot-outline" size={20} color={Colors.primary} />
              <Text style={styles.aiTitle}>AI 分析サマリ</Text>
            </View>
            <ActivityIndicator size="small" color={Colors.primary} style={{ marginVertical: 8 }} />
          </View>
        ) : aiReport && !aiReport.isMock ? (
          <View style={[styles.card, styles.aiCard]}>
            <View style={styles.aiHeader}>
              <MaterialCommunityIcons name="robot-outline" size={20} color={Colors.primary} />
              <Text style={styles.aiTitle}>AI 分析サマリ</Text>
              {aiReport.usage ? (
                <Text style={styles.aiUsage}>
                  本日 残り {aiReport.usage.remaining}/{aiReport.usage.limit} 回
                </Text>
              ) : null}
            </View>
            <Text style={styles.aiOverall}>{aiReport.overall}</Text>
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

        {/* スポット打撃分析ボタン */}
        <TouchableOpacity
          style={styles.spotBattingBtn}
          onPress={() => router.push('/(tabs)/score/spot-history' as any)}
          activeOpacity={0.8}
        >
          <MaterialCommunityIcons name="baseball-bat" size={20} color={Colors.primary} />
          <Text style={styles.spotBattingBtnText}>自分の結果を分析　スポット打撃を分析</Text>
          <MaterialCommunityIcons name="chevron-right" size={20} color={Colors.primary} />
        </TouchableOpacity>

        <View style={{ height: 40 }} />
      </ScrollView>
    </>
  );
}

// ── Helper components ─────────────────────────────────────────────────────────

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

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <View style={styles.legendItem}>
      <View style={[styles.legendDot, { backgroundColor: color }]} />
      <Text style={styles.legendLabel}>{label}</Text>
    </View>
  );
}

function LegendRect({ color, label }: { color: string; label: string }) {
  return (
    <View style={styles.legendItem}>
      <View style={[styles.legendRect, { backgroundColor: color }]} />
      <Text style={styles.legendLabel}>{label}</Text>
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

  summaryRow: { flexDirection: 'row', gap: Spacing.sm },

  heatmapPair:  { flexDirection: 'row', gap: Spacing.sm, justifyContent: 'center', flexWrap: 'wrap' },
  heatmapBlock: { alignItems: 'center', gap: 4 },
  heatmapLabel: { fontSize: Typography.caption, fontWeight: '700', color: Colors.textSecondary },

  subHeading: { fontSize: Typography.caption, fontWeight: '700', color: Colors.textSecondary, marginTop: 4 },
  badgeRow:   { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.xs, marginTop: 4 },

  bandLegend: { flexDirection: 'row', gap: Spacing.md },
  legendRow:  { flexDirection: 'row', justifyContent: 'center', gap: Spacing.md, marginTop: 4 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  legendDot:  { width: 8, height: 8, borderRadius: 4 },
  legendRect: { width: 14, height: 8, borderRadius: 2 },
  legendLabel:{ fontSize: Typography.tiny, color: Colors.textSecondary },

  aiCard:    { backgroundColor: Colors.primaryLight },
  aiHeader:  { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs },
  aiTitle:   { fontSize: Typography.bodySmall, fontWeight: '800', color: Colors.primary, flex: 1 },
  aiUsage:   { fontSize: Typography.tiny, fontWeight: '600', color: Colors.textSecondary },
  aiOverall: { fontSize: Typography.bodySmall, color: Colors.text, lineHeight: 22 },
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

  spotBattingBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    backgroundColor: Colors.primaryLight,
    borderRadius: BorderRadius.xl,
    padding: Spacing.md,
    marginTop: Spacing.sm,
    borderWidth: 1,
    borderColor: Colors.primary + '40',
  },
  spotBattingBtnText: {
    flex: 1,
    fontSize: Typography.bodySmall,
    fontWeight: '700',
    color: Colors.primary,
  },
});

const secStyles = StyleSheet.create({
  row:   { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs },
  icon:  { width: 26, height: 26, borderRadius: 13, backgroundColor: Colors.primary, alignItems: 'center', justifyContent: 'center' },
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

const badgeStyles = StyleSheet.create({
  badge: {
    alignItems: 'center', padding: Spacing.xs,
    borderRadius: BorderRadius.lg, minWidth: 80,
  },
  zone:   { fontSize: Typography.caption, fontWeight: '700' },
  metric: { fontSize: 9, color: Colors.textSecondary },
  value:  { fontSize: Typography.body, fontWeight: '900' },
});

const tableStyles = StyleSheet.create({
  header:     { flexDirection: 'row', paddingVertical: 4, borderBottomWidth: 1, borderBottomColor: Colors.border },
  row:        { flexDirection: 'row', alignItems: 'center', paddingVertical: 6, borderBottomWidth: 0.5, borderBottomColor: Colors.border },
  headerCell: { color: Colors.textSecondary, fontWeight: '700', fontSize: Typography.tiny },
  type:       { flex: 1.5, fontSize: Typography.caption, fontWeight: '700', color: Colors.text },
  cell:       { flex: 1, fontSize: Typography.caption, color: Colors.text, textAlign: 'right' },
  danger:     { color: Colors.secondary, fontWeight: '800' },
  good:       { color: Colors.success,   fontWeight: '800' },
});

const stratStyles = StyleSheet.create({
  grid:  { flexDirection: 'row', gap: Spacing.sm, flexWrap: 'wrap' },
  chip:  {
    flex: 1, minWidth: 90, alignItems: 'center',
    backgroundColor: Colors.primaryLight,
    borderRadius: BorderRadius.lg, padding: Spacing.sm, gap: 2,
  },
  label: { fontSize: Typography.tiny, color: Colors.textSecondary, fontWeight: '600' },
  value: { fontSize: Typography.h4, fontWeight: '900', color: Colors.primary },
  sub:   { fontSize: Typography.tiny, color: Colors.textSecondary },
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
