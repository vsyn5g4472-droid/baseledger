import React, { useEffect, useState, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  TouchableOpacity,
  Alert,
  Modal,
  TextInput,
} from 'react-native';
import { Stack, useLocalSearchParams, router } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { db } from '../../../src/db';
import type { GameState } from '../../../src/types/game';
import {
  computeGameAnalytics,
  type GameAnalytics,
  type PlayerBattingStats,
  type PlayerPitchingStats,
} from '../../../src/utils/gameStatsCalculator';
import { Colors, Spacing, Typography, BorderRadius } from '../../../src/constants/theme';
import PitchHeatmap from '../../../src/components/analytics/PitchHeatmap';
import SprayChart from '../../../src/components/analytics/SprayChart';
import { formatBattingAvg } from '../../../src/utils/statsCalculator';
import { useI18n } from '../../../src/i18n';
import { usePlanGate, useUserPlan } from '../../../src/hooks/usePlanGate';
import { generateGameReportHtml } from '../../../src/utils/gameReportGenerator';
import { generateAIReport, type AIReport } from '../../../src/services/aiReportService';
import { usePostActions } from '../../../src/hooks/usePosts';
import type { PostVisibility } from '../../../src/models/types';

type TabKey = 'batting' | 'pitching' | 'heatmap' | 'spray';

// ── Batting Table ──────────────────────────────────────────────────────────────

function BattingTable({
  players,
  teamName,
}: {
  players: PlayerBattingStats[];
  teamName: string;
}) {
  if (players.length === 0) {
    return (
      <View style={styles.emptySection}>
        <Text style={styles.emptySectionText}>打席データなし ({teamName})</Text>
      </View>
    );
  }

  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>{teamName}</Text>

      {/* Header */}
      <View style={[styles.tableRow, styles.tableHeader]}>
        {['選手', '打数', '安打', '打点', '打率', 'OPS'].map((h) => (
          <Text
            key={h}
            style={[
              styles.cell,
              h === '選手' ? styles.nameCell : styles.statCell,
              styles.headerCell,
            ]}
          >
            {h}
          </Text>
        ))}
      </View>

      {/* Rows */}
      {players.map((p, i) => (
        <View
          key={p.playerId}
          style={[styles.tableRow, i % 2 === 1 && styles.rowAlt]}
        >
          <Text style={[styles.cell, styles.nameCell]} numberOfLines={1}>
            {p.playerName}
          </Text>
          <Text style={[styles.cell, styles.statCell]}>{p.atBats}</Text>
          <Text style={[styles.cell, styles.statCell]}>{p.hits}</Text>
          <Text style={[styles.cell, styles.statCell]}>{p.rbi}</Text>
          <Text style={[styles.cell, styles.statCell, styles.highlight]}>
            {p.atBats > 0 ? formatBattingAvg(p.avg) : '-'}
          </Text>
          <Text style={[styles.cell, styles.statCell, styles.highlight]}>
            {p.atBats > 0 ? p.ops.toFixed(3).replace(/^0/, '') : '-'}
          </Text>
        </View>
      ))}
    </View>
  );
}

// ── Pitching Section ───────────────────────────────────────────────────────────

function PitchingSection({
  stats,
  teamName,
}: {
  stats: PlayerPitchingStats | null;
  teamName: string;
}) {
  if (!stats || stats.totalPitches === 0) {
    return (
      <View style={styles.emptySection}>
        <Text style={styles.emptySectionText}>投球データなし ({teamName})</Text>
      </View>
    );
  }

  const strikePct = Math.round(stats.strikeRate * 100);

  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>{teamName} 投手: {stats.playerName}</Text>
      <Text style={styles.subLabel}>総投球数: {stats.totalPitches}球</Text>

      {/* Strike rate bar */}
      <View style={styles.rateRow}>
        <Text style={styles.rateLabel}>ストライク率</Text>
        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: `${strikePct}%` as any }]} />
        </View>
        <Text style={styles.ratePct}>{strikePct}%</Text>
      </View>

      {/* Pitch mix */}
      <Text style={styles.subSectionTitle}>球種割合</Text>
      {stats.pitchMix.map((m) => (
        <View key={m.pitchType} style={styles.mixRow}>
          <Text style={styles.mixName} numberOfLines={1}>{m.pitchType}</Text>
          <View style={styles.mixTrack}>
            <View
              style={[
                styles.mixBar,
                { width: `${Math.round(m.pct * 100)}%` as any },
              ]}
            />
          </View>
          <Text style={styles.mixPct}>{Math.round(m.pct * 100)}%</Text>
          {m.avgVelocity != null && (
            <Text style={styles.mixVel}>{m.avgVelocity}km/h</Text>
          )}
        </View>
      ))}
    </View>
  );
}

// ── Legend ─────────────────────────────────────────────────────────────────────

function Legend({ items }: { items: { color: string; label: string }[] }) {
  return (
    <View style={styles.legend}>
      {items.map(({ color, label }) => (
        <View key={label} style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: color }]} />
          <Text style={styles.legendLabel}>{label}</Text>
        </View>
      ))}
    </View>
  );
}

// ── Main Screen ────────────────────────────────────────────────────────────────

export default function GameAnalyticsScreen() {
  const { gameId } = useLocalSearchParams<{ gameId: string }>();
  const { t } = useI18n();
  const [game, setGame] = useState<GameState | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabKey>('batting');
  const [heatmapTeam, setHeatmapTeam] = useState<'away' | 'home'>('home');
  const [sprayTeam, setSprayTeam] = useState<'away' | 'home'>('away');
  const [sharing, setSharing] = useState(false);
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const [showFeedModal, setShowFeedModal] = useState(false);
  const [feedContent, setFeedContent] = useState('');
  const [feedVisibility, setFeedVisibility] = useState<PostVisibility>('public');
  const [feedPosting, setFeedPosting] = useState(false);
  const [feedGenerating, setFeedGenerating] = useState(false);

  const shareGate = usePlanGate('share_report');
  const aiReportGate = usePlanGate('ai_report');
  const userPlan = useUserPlan();
  const { createPost } = usePostActions();

  useEffect(() => {
    if (!gameId) return;
    db.games
      .get(gameId)
      .then((g) => { if (g) setGame(g); })
      .finally(() => setLoading(false));
  }, [gameId]);

  const analytics: GameAnalytics | null = useMemo(() => {
    if (!game) return null;
    try {
      return computeGameAnalytics(game);
    } catch (e) {
      console.error('computeGameAnalytics error:', e);
      return null;
    }
  }, [game]);

  const handleShare = useCallback(async () => {
    if (!shareGate.allowed) {
      setShowUpgradeModal(true);
      return;
    }
    if (!game || !analytics) return;

    setSharing(true);
    try {
      // AI チームレポートを生成（失敗してもPDF生成は続行）
      let aiReport: AIReport | null = null;
      try {
        aiReport = await generateAIReport({
          game,
          role: 'team',
          batters: [],
          userPlan,
        });
        if (aiReport.isMock) aiReport = null;
      } catch {
        // AI失敗は無視してPDF生成を続行
      }

      const html = generateGameReportHtml(game, analytics, aiReport);
      const { uri } = await Print.printToFileAsync({ html, base64: false });

      const canShare = await Sharing.isAvailableAsync();
      if (canShare) {
        await Sharing.shareAsync(uri, {
          mimeType: 'application/pdf',
          dialogTitle: '試合レポートを共有',
          UTI: 'com.adobe.pdf',
        });
      } else {
        Alert.alert('共有できません', 'このデバイスでは共有機能が利用できません。');
      }
    } catch (e) {
      Alert.alert('エラー', 'レポートの生成に失敗しました。もう一度お試しください。');
    } finally {
      setSharing(false);
    }
  }, [shareGate.allowed, game, analytics, userPlan]);

  const handleOpenFeedShare = useCallback(async () => {
    if (!game || !analytics) return;
    setShowFeedModal(true);

    // AI サマリーを事前生成
    setFeedGenerating(true);
    const scoreText = `⚾ ${game.awayTeam.name} ${analytics.finalScore.away} - ${analytics.finalScore.home} ${game.homeTeam.name}`;
    let draft = scoreText + '\n\n';

    if (aiReportGate.allowed) {
      try {
        const report = await generateAIReport({ game, role: 'team', batters: [], userPlan });
        if (!report.isMock && report.overall) {
          draft += `【AI総合評価】\n${report.overall}`;
          if (report.nextAdvice) {
            draft += `\n\n【次戦へのアドバイス】\n${report.nextAdvice}`;
          }
        }
      } catch (e) {
        console.error('generateAIReport error:', e);
      } finally {
        setFeedGenerating(false);
      }
    } else {
      setFeedGenerating(false);
    }

    setFeedContent(draft);
  }, [game, analytics, aiReportGate.allowed, userPlan]);

  const handlePostToFeed = useCallback(async () => {
    if (!game || !analytics || !feedContent.trim()) return;
    setFeedPosting(true);
    try {
      await createPost({
        type: 'stats',
        content: feedContent.trim(),
        mediaURIs: [],
        externalVideoUrl: null,
        statsData: {
          gameId: game.id,
          awayTeam: game.awayTeam.name,
          homeTeam: game.homeTeam.name,
          awayScore: analytics.finalScore.away,
          homeScore: analytics.finalScore.home,
        },
        visibility: feedVisibility,
        teamId: null,
      });
      setShowFeedModal(false);
      Alert.alert('投稿しました', 'AI分析サマリーをフィードに共有しました。');
    } catch {
      Alert.alert('エラー', '投稿に失敗しました。もう一度お試しください。');
    } finally {
      setFeedPosting(false);
    }
  }, [game, analytics, feedContent, feedVisibility, createPost]);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={Colors.primary} />
      </View>
    );
  }

  if (!game || !analytics) {
    return (
      <View style={styles.center}>
        <Text style={{ color: Colors.textSecondary }}>データが見つかりません</Text>
      </View>
    );
  }

  const tabs: { key: TabKey; label: string }[] = [
    { key: 'batting',  label: t.analytics.batting },
    { key: 'pitching', label: t.analytics.pitching },
    { key: 'heatmap',  label: t.analytics.heatmap },
    { key: 'spray',    label: t.analytics.spray },
  ];

  // Pitch logs split by defending team (null-safe for legacy data)
  const homePitchLogs = (game.pitchLogs ?? []).filter((p) => p.inning.half === 'top');
  const awayPitchLogs = (game.pitchLogs ?? []).filter((p) => p.inning.half === 'bottom');
  const safeAtBatLogs = game.atBatLogs ?? [];

  return (
    <>
      <Stack.Screen
        options={{
          title: '試合分析',
          headerBackTitle: '一覧',
          headerRight: () => (
            <View style={styles.headerButtons}>
              {/* フィード共有ボタン */}
              <TouchableOpacity
                onPress={handleOpenFeedShare}
                style={styles.headerShareBtn}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <MaterialCommunityIcons
                  name="robot-outline"
                  size={22}
                  color={Colors.primary}
                />
              </TouchableOpacity>
              {/* PDF共有ボタン */}
              <TouchableOpacity
                onPress={handleShare}
                disabled={sharing}
                style={styles.headerShareBtn}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                {sharing ? (
                  <ActivityIndicator size="small" color={Colors.primary} />
                ) : (
                  <MaterialCommunityIcons
                    name="share-variant"
                    size={22}
                    color={shareGate.allowed ? Colors.primary : Colors.textSecondary}
                  />
                )}
              </TouchableOpacity>
            </View>
          ),
        }}
      />

      {/* PRO アップグレードモーダル */}
      <Modal
        visible={showUpgradeModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowUpgradeModal(false)}
      >
        <TouchableOpacity
          style={styles.upgradeBackdrop}
          activeOpacity={1}
          onPress={() => setShowUpgradeModal(false)}
        >
          <View style={styles.upgradeCard}>
            <Text style={styles.upgradeLock}>🔒</Text>
            <Text style={styles.upgradeTitle}>PROプラン限定機能</Text>
            <Text style={styles.upgradeDesc}>
              試合結果・詳細・AI分析を{'\n'}PDFで共有できます。{'\n'}PROプランにアップグレードして{'\n'}ご利用ください。
            </Text>
            <TouchableOpacity
              style={styles.upgradeBtn}
              onPress={() => {
                setShowUpgradeModal(false);
                router.push('/(tabs)/profile/plan');
              }}
            >
              <Text style={styles.upgradeBtnText}>プランをアップグレード</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setShowUpgradeModal(false)}>
              <Text style={styles.upgradeCancel}>キャンセル</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* フィード共有モーダル */}
      <Modal
        visible={showFeedModal}
        transparent
        animationType="slide"
        onRequestClose={() => { if (!feedPosting) setShowFeedModal(false); }}
      >
        <TouchableOpacity
          style={styles.feedModalBackdrop}
          activeOpacity={1}
          onPress={() => { if (!feedPosting) setShowFeedModal(false); }}
        >
          <TouchableOpacity activeOpacity={1} style={styles.feedModalSheet}>
            {/* ハンドル */}
            <View style={styles.feedModalHandle} />

            <Text style={styles.feedModalTitle}>フィードに共有</Text>

            {feedGenerating ? (
              <View style={styles.feedGenerating}>
                <ActivityIndicator color={Colors.primary} />
                <Text style={styles.feedGeneratingText}>AI分析を生成中...</Text>
              </View>
            ) : (
              <View
                style={styles.feedTextArea}
                // TextInput への onPress 伝播防止
              >
                <TextInput
                  style={styles.feedTextInput}
                  multiline
                  value={feedContent}
                  onChangeText={setFeedContent}
                  placeholder="投稿内容を編集できます..."
                  placeholderTextColor={Colors.textDisabled}
                  maxLength={1000}
                  textAlignVertical="top"
                />
                <Text style={styles.feedCharCount}>{feedContent.length}/1000</Text>
              </View>
            )}

            {/* 公開範囲 */}
            <View style={styles.feedVisRow}>
              {(['public', 'followers'] as PostVisibility[]).map((v) => (
                <TouchableOpacity
                  key={v}
                  style={[styles.feedVisBtn, feedVisibility === v && styles.feedVisBtnActive]}
                  onPress={() => setFeedVisibility(v)}
                >
                  <MaterialCommunityIcons
                    name={v === 'public' ? 'earth' : 'account-multiple'}
                    size={14}
                    color={feedVisibility === v ? Colors.white : Colors.textSecondary}
                  />
                  <Text style={[styles.feedVisBtnText, feedVisibility === v && styles.feedVisBtnTextActive]}>
                    {v === 'public' ? '全体公開' : 'フォロワー'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <TouchableOpacity
              style={[styles.feedPostBtn, (feedPosting || feedGenerating || !feedContent.trim()) && styles.feedPostBtnDisabled]}
              onPress={handlePostToFeed}
              disabled={feedPosting || feedGenerating || !feedContent.trim()}
            >
              {feedPosting ? (
                <ActivityIndicator color={Colors.white} size="small" />
              ) : (
                <Text style={styles.feedPostBtnText}>投稿する</Text>
              )}
            </TouchableOpacity>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      <View style={styles.container}>

        {/* ── Score Header ─────────────────────────────── */}
        <View style={styles.scoreHeader}>
          <View style={styles.scoreTeam}>
            <Text style={styles.scoreTeamLabel}>{t.analytics.away}</Text>
            <Text style={styles.scoreTeamName} numberOfLines={1}>
              {game.awayTeam.name}
            </Text>
            <Text style={styles.scoreTotal}>{analytics.finalScore.away}</Text>
          </View>
          <Text style={styles.scoreSep}>:</Text>
          <View style={[styles.scoreTeam, { alignItems: 'flex-end' }]}>
            <Text style={styles.scoreTeamLabel}>{t.analytics.home}</Text>
            <Text style={styles.scoreTeamName} numberOfLines={1}>
              {game.homeTeam.name}
            </Text>
            <Text style={styles.scoreTotal}>{analytics.finalScore.home}</Text>
          </View>
        </View>

        {/* ── Tab Bar ──────────────────────────────────── */}
        <View style={styles.tabBar}>
          {tabs.map((tab) => (
            <TouchableOpacity
              key={tab.key}
              style={[styles.tabBtn, activeTab === tab.key && styles.tabBtnActive]}
              onPress={() => setActiveTab(tab.key)}
            >
              <Text
                style={[
                  styles.tabLabel,
                  activeTab === tab.key && styles.tabLabelActive,
                ]}
              >
                {tab.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* ── Content ──────────────────────────────────── */}
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
        >

          {/* ─ Batting ─ */}
          {activeTab === 'batting' && (
            <>
              <BattingTable
                players={analytics.batting.away}
                teamName={`${t.analytics.away} ${game.awayTeam.name}`}
              />
              <View style={{ height: Spacing.md }} />
              <BattingTable
                players={analytics.batting.home}
                teamName={`${t.analytics.home} ${game.homeTeam.name}`}
              />
            </>
          )}

          {/* ─ Pitching ─ */}
          {activeTab === 'pitching' && (
            <>
              <PitchingSection
                stats={analytics.pitching.homePitcher}
                teamName={`${t.analytics.home} ${game.homeTeam.name}`}
              />
              <View style={{ height: Spacing.md }} />
              <PitchingSection
                stats={analytics.pitching.awayPitcher}
                teamName={`${t.analytics.away} ${game.awayTeam.name}`}
              />
            </>
          )}

          {/* ─ Heatmap ─ */}
          {activeTab === 'heatmap' && (
            <>
              {/* Team toggle */}
              <View style={styles.teamToggle}>
                <TouchableOpacity
                  style={[
                    styles.toggleBtn,
                    heatmapTeam === 'home' && styles.toggleBtnActive,
                  ]}
                  onPress={() => setHeatmapTeam('home')}
                >
                  <Text
                    style={[
                      styles.toggleText,
                      heatmapTeam === 'home' && styles.toggleTextActive,
                    ]}
                  >
                    {t.analytics.home} {game.homeTeam.name}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.toggleBtn,
                    heatmapTeam === 'away' && styles.toggleBtnActive,
                  ]}
                  onPress={() => setHeatmapTeam('away')}
                >
                  <Text
                    style={[
                      styles.toggleText,
                      heatmapTeam === 'away' && styles.toggleTextActive,
                    ]}
                  >
                    {t.analytics.away} {game.awayTeam.name}
                  </Text>
                </TouchableOpacity>
              </View>

              <View style={styles.chartCard}>
                <PitchHeatmap
                  pitchLogs={heatmapTeam === 'home' ? homePitchLogs : awayPitchLogs}
                />
              </View>

              <Legend
                items={[
                  { color: '#38A1F3', label: '見逃しS' },
                  { color: '#1A6BBF', label: '空振りS' },
                  { color: '#8E8E93', label: 'ボール' },
                  { color: '#D4AF37', label: 'ファウル' },
                  { color: '#34C759', label: 'インプレー' },
                  { color: '#C41E3A', label: '死球' },
                ]}
              />

              {/* Pitch total */}
              <Text style={styles.heatmapNote}>
                {heatmapTeam === 'home' ? game.homeTeam.name : game.awayTeam.name}:
                {' '}{heatmapTeam === 'home' ? homePitchLogs.length : awayPitchLogs.length}球
              </Text>
            </>
          )}

          {/* ─ Spray Chart ─ */}
          {activeTab === 'spray' && (
            <>
              {/* Team toggle */}
              <View style={styles.teamToggle}>
                <TouchableOpacity
                  style={[styles.toggleBtn, sprayTeam === 'away' && styles.toggleBtnActive]}
                  onPress={() => setSprayTeam('away')}
                >
                  <Text style={[styles.toggleText, sprayTeam === 'away' && styles.toggleTextActive]}>
                    {t.analytics.away} {game.awayTeam.name}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.toggleBtn, sprayTeam === 'home' && styles.toggleBtnActive]}
                  onPress={() => setSprayTeam('home')}
                >
                  <Text style={[styles.toggleText, sprayTeam === 'home' && styles.toggleTextActive]}>
                    {t.analytics.home} {game.homeTeam.name}
                  </Text>
                </TouchableOpacity>
              </View>
              <View style={styles.chartCard}>
                <SprayChart
                  atBatLogs={safeAtBatLogs.filter((log) =>
                    sprayTeam === 'away'
                      ? log.inning.half === 'top'
                      : log.inning.half === 'bottom'
                  )}
                />
              </View>
              <Legend
                items={[
                  { color: Colors.primary,       label: '安打' },
                  { color: Colors.accent,        label: 'エラー' },
                  { color: Colors.textSecondary, label: 'アウト' },
                ]}
              />
              <Text style={styles.heatmapNote}>
                記録された打球数: {safeAtBatLogs.filter((l) => l.battedBall).length}
              </Text>
            </>
          )}

          {/* 共有ボタン行 — 画面内に目立つ形で配置 */}
          <View style={styles.shareRow}>
            <TouchableOpacity
              style={[styles.shareInlineBtn, styles.shareInlineFeed]}
              onPress={handleOpenFeedShare}
              activeOpacity={0.8}
            >
              <View style={styles.shareInlineBtnInner}>
                <MaterialCommunityIcons name="robot-outline" size={18} color={Colors.primary} />
                <Text style={styles.shareInlineFeedText}>AI分析をフィードに共有</Text>
              </View>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.shareInlineBtn, styles.shareInlinePdf]}
              onPress={handleShare}
              disabled={sharing}
              activeOpacity={0.8}
            >
              {sharing ? (
                <ActivityIndicator size="small" color={Colors.white} />
              ) : (
                <View style={styles.shareInlineBtnInner}>
                  <MaterialCommunityIcons name="file-pdf-box" size={18} color={Colors.white} />
                  <Text style={styles.shareInlinePdfText}>
                    {shareGate.allowed ? 'PDF共有' : 'PDF共有（PRO）'}
                  </Text>
                </View>
              )}
            </TouchableOpacity>
          </View>

        </ScrollView>
      </View>
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
  container: { flex: 1, backgroundColor: Colors.background },

  // Header buttons
  headerButtons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginRight: Spacing.xs,
  },
  headerShareBtn: {
    padding: 4,
  },

  // 画面内共有ボタン行
  shareRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    backgroundColor: Colors.white,
  },
  shareInlineBtn: {
    flex: 1,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  shareInlineBtnInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  shareInlineFeed: {
    backgroundColor: Colors.primaryLight,
    borderWidth: 1,
    borderColor: Colors.primary + '50',
  },
  shareInlineFeedText: {
    fontSize: Typography.caption,
    fontWeight: '700',
    color: Colors.primary,
  },
  shareInlinePdf: {
    backgroundColor: Colors.primary,
  },
  shareInlinePdfText: {
    fontSize: Typography.caption,
    fontWeight: '700',
    color: Colors.white,
  },

  // Upgrade modal
  upgradeBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.xl,
  },
  upgradeCard: {
    backgroundColor: Colors.white,
    borderRadius: BorderRadius.xl,
    padding: Spacing.xl,
    alignItems: 'center',
    width: '100%',
    maxWidth: 320,
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 16,
    elevation: 8,
    shadowOffset: { width: 0, height: 4 },
  },
  upgradeLock: { fontSize: 40, marginBottom: Spacing.sm },
  upgradeTitle: {
    fontSize: Typography.h3,
    fontWeight: '800',
    color: Colors.text,
    marginBottom: Spacing.sm,
    textAlign: 'center',
  },
  upgradeDesc: {
    fontSize: Typography.bodySmall,
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: Spacing.lg,
  },
  upgradeBtn: {
    backgroundColor: Colors.primary,
    borderRadius: BorderRadius.full,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.xl,
    marginBottom: Spacing.sm,
    width: '100%',
    alignItems: 'center',
  },
  upgradeBtnText: {
    color: Colors.white,
    fontWeight: '700',
    fontSize: Typography.body,
  },
  upgradeCancel: {
    fontSize: Typography.bodySmall,
    color: Colors.textSecondary,
    paddingVertical: Spacing.xs,
  },

  // Feed share modal
  feedModalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  feedModalSheet: {
    backgroundColor: Colors.white,
    borderTopLeftRadius: BorderRadius.xl,
    borderTopRightRadius: BorderRadius.xl,
    padding: Spacing.lg,
    paddingBottom: 40,
  },
  feedModalHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.border,
    alignSelf: 'center',
    marginBottom: Spacing.md,
  },
  feedModalTitle: {
    fontSize: Typography.h3,
    fontWeight: '800',
    color: Colors.text,
    marginBottom: Spacing.md,
  },
  feedGenerating: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    padding: Spacing.lg,
    justifyContent: 'center',
  },
  feedGeneratingText: {
    fontSize: Typography.bodySmall,
    color: Colors.textSecondary,
  },
  feedTextArea: {
    backgroundColor: Colors.surfaceGray,
    borderRadius: BorderRadius.md,
    padding: Spacing.sm,
    marginBottom: Spacing.md,
    minHeight: 140,
  },
  feedTextInput: {
    fontSize: Typography.bodySmall,
    color: Colors.text,
    lineHeight: 22,
    minHeight: 120,
  },
  feedCharCount: {
    fontSize: Typography.caption,
    color: Colors.textDisabled,
    textAlign: 'right',
    marginTop: 4,
  },
  feedVisRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginBottom: Spacing.md,
  },
  feedVisBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.md,
    borderWidth: 1.5,
    borderColor: Colors.border,
    backgroundColor: Colors.white,
  },
  feedVisBtnActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  feedVisBtnText: {
    fontSize: Typography.caption,
    color: Colors.textSecondary,
    fontWeight: '600',
  },
  feedVisBtnTextActive: {
    color: Colors.white,
  },
  feedPostBtn: {
    backgroundColor: Colors.primary,
    borderRadius: BorderRadius.full,
    paddingVertical: Spacing.sm,
    alignItems: 'center',
  },
  feedPostBtnDisabled: {
    opacity: 0.4,
  },
  feedPostBtnText: {
    color: Colors.white,
    fontWeight: '700',
    fontSize: Typography.body,
  },

  // Score header
  scoreHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.white,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderBottomWidth: 0.5,
    borderBottomColor: Colors.border,
  },
  scoreTeam: { flex: 1 },
  scoreTeamLabel: { fontSize: Typography.tiny, color: Colors.textSecondary },
  scoreTeamName: { fontSize: Typography.bodySmall, fontWeight: '600', color: Colors.text },
  scoreTotal: {
    fontSize: Typography.h1,
    fontWeight: '800',
    color: Colors.primary,
    marginTop: 2,
  },
  scoreSep: {
    fontSize: Typography.h2,
    color: Colors.textSecondary,
    paddingHorizontal: Spacing.md,
  },

  // Tabs
  tabBar: {
    flexDirection: 'row',
    backgroundColor: Colors.white,
    borderBottomWidth: 0.5,
    borderBottomColor: Colors.border,
  },
  tabBtn: {
    flex: 1,
    paddingVertical: Spacing.sm,
    alignItems: 'center',
  },
  tabBtnActive: {
    borderBottomWidth: 2.5,
    borderBottomColor: Colors.primary,
  },
  tabLabel: { fontSize: Typography.bodySmall, color: Colors.textSecondary },
  tabLabelActive: { color: Colors.primary, fontWeight: '700' },

  // Scroll
  scrollView: { flex: 1 },
  scrollContent: { padding: Spacing.md, paddingBottom: Spacing.xxl },

  // Card
  card: {
    backgroundColor: Colors.white,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    shadowColor: '#000',
    shadowOpacity: 0.09,
    shadowRadius: 6,
    elevation: 2,
    shadowOffset: { width: 0, height: 2 },
  },
  cardTitle: {
    fontSize: Typography.bodySmall,
    fontWeight: '700',
    color: Colors.text,
    marginBottom: Spacing.sm,
  },

  // Table
  tableRow: {
    flexDirection: 'row',
    paddingVertical: 5,
    borderBottomWidth: 0.5,
    borderBottomColor: Colors.surfaceGray,
  },
  rowAlt: { backgroundColor: Colors.surfaceGray },
  tableHeader: {
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    marginBottom: 2,
  },
  cell: { fontSize: Typography.caption, color: Colors.text, paddingHorizontal: 2 },
  nameCell: { flex: 2.5, fontWeight: '500' },
  statCell: { flex: 1, textAlign: 'center' },
  headerCell: { fontWeight: '700', color: Colors.textSecondary, fontSize: 10 },
  highlight: { color: Colors.primary, fontWeight: '700' },

  emptySection: { padding: Spacing.md, alignItems: 'center' },
  emptySectionText: { color: Colors.textSecondary, fontSize: Typography.bodySmall },

  // Pitching
  subLabel: {
    fontSize: Typography.caption,
    color: Colors.textSecondary,
    marginBottom: Spacing.sm,
  },
  rateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Spacing.sm,
  },
  rateLabel: { fontSize: Typography.caption, color: Colors.text, width: 80 },
  progressTrack: {
    flex: 1,
    height: 8,
    backgroundColor: Colors.surfaceGray,
    borderRadius: 4,
    overflow: 'hidden',
    marginHorizontal: Spacing.xs,
  },
  progressFill: {
    height: 8,
    backgroundColor: Colors.primary,
    borderRadius: 4,
  },
  ratePct: {
    fontSize: Typography.caption,
    color: Colors.primary,
    fontWeight: '700',
    width: 36,
    textAlign: 'right',
  },
  subSectionTitle: {
    fontSize: Typography.caption,
    fontWeight: '700',
    color: Colors.textSecondary,
    marginTop: Spacing.sm,
    marginBottom: Spacing.xs,
  },
  mixRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 5,
  },
  mixName: { width: 72, fontSize: Typography.caption, color: Colors.text },
  mixTrack: {
    flex: 1,
    height: 6,
    backgroundColor: Colors.surfaceGray,
    borderRadius: 3,
    overflow: 'hidden',
  },
  mixBar: { height: 6, backgroundColor: Colors.primary, borderRadius: 3 },
  mixPct: {
    fontSize: Typography.caption,
    color: Colors.textSecondary,
    width: 32,
    textAlign: 'right',
  },
  mixVel: {
    fontSize: Typography.tiny,
    color: Colors.textSecondary,
    width: 54,
    textAlign: 'right',
  },

  // Team toggle
  teamToggle: {
    flexDirection: 'row',
    backgroundColor: Colors.surfaceGray,
    borderRadius: BorderRadius.md,
    padding: 3,
    marginBottom: Spacing.md,
  },
  toggleBtn: {
    flex: 1,
    paddingVertical: Spacing.xs,
    alignItems: 'center',
    borderRadius: BorderRadius.sm,
  },
  toggleBtnActive: {
    backgroundColor: Colors.white,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
    shadowOffset: { width: 0, height: 1 },
  },
  toggleText: { fontSize: Typography.caption, color: Colors.textSecondary },
  toggleTextActive: { color: Colors.primary, fontWeight: '700' },

  // Charts
  chartCard: {
    backgroundColor: Colors.white,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.09,
    shadowRadius: 6,
    elevation: 2,
    shadowOffset: { width: 0, height: 2 },
    marginBottom: Spacing.md,
  },
  heatmapNote: {
    fontSize: Typography.caption,
    color: Colors.textSecondary,
    textAlign: 'center',
    marginTop: Spacing.sm,
  },

  // Legend
  legend: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: Spacing.xs,
    marginBottom: Spacing.sm,
    rowGap: Spacing.xs,
    columnGap: Spacing.md,
  },
  legendItem: { flexDirection: 'row', alignItems: 'center' },
  legendDot: { width: 8, height: 8, borderRadius: 4, marginRight: 4 },
  legendLabel: { fontSize: Typography.tiny, color: Colors.textSecondary },
});
