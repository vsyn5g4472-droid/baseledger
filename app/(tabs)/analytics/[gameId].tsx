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
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Stack, useLocalSearchParams, router } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { db } from '../../../src/db';
import { gameService, stripGameMetadata } from '../../../src/services/gameService';
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
import { usePlanGate } from '../../../src/hooks/usePlanGate';
import { generateGameReportHtml } from '../../../src/utils/gameReportGenerator';
import { usePostActions } from '../../../src/hooks/usePosts';
import type { PostVisibility } from '../../../src/models/types';
import GameShareModal from '../../../src/components/GameShareModal';
import EditGamePlayersModal from '../../../src/components/EditGamePlayersModal';
import PitcherReassignmentModal from '../../../src/components/PitcherReassignmentModal';
import { showPdfSharePlanAlert } from '../../../src/utils/planLimitAlerts';
import { useAuth } from '../../../src/contexts/AuthContext';
import { importFromGame } from '../../../src/services/spotAtBatService';
import type { GamePlayerAssignment, SpotAtBatImportMode } from '../../../src/models/types';
import type { AtBatLog, AtBatResult } from '../../../src/types/game';

type TabKey = 'batting' | 'pitching' | 'heatmap' | 'spray';

const AT_BAT_RESULT_JP: Record<AtBatResult, string> = {
  strikeout: '三振',
  strikeout_looking: '見逃し三振',
  walk: '四球',
  hit_by_pitch: '死球',
  single: '単打',
  double: '二塁打',
  triple: '三塁打',
  home_run: '本塁打',
  groundout: 'ゴロアウト',
  flyout: 'フライアウト',
  lineout: 'ライナーアウト',
  pop_out: 'ポップフライ',
  sacrifice_bunt: '犠打',
  sacrifice_fly: '犠飛',
  fielders_choice: '野選',
  error: 'エラー',
  double_play: '併殺',
  triple_play: '三重殺',
};

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
  const { t } = useI18n();
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
          <Text style={styles.mixName} numberOfLines={1}>
            {(t.pitchTypes as Record<string, string>)[m.pitchType] ?? m.pitchType}
          </Text>
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
  const { currentUser } = useAuth();
  const [game, setGame] = useState<GameState | null>(null);
  const [loading, setLoading] = useState(true);
  const [gameCanReshare, setGameCanReshare] = useState(true);
  const [loadedFromShare, setLoadedFromShare] = useState(false);
  const [savingToDevice, setSavingToDevice] = useState(false);
  const [savedToDevice, setSavedToDevice] = useState(false);
  const [activeTab, setActiveTab] = useState<TabKey>('batting');
  const [heatmapTeam, setHeatmapTeam] = useState<'away' | 'home'>('home');
  const [heatmapPitcherId, setHeatmapPitcherId] = useState<string | null>(null);
  const [sprayTeam, setSprayTeam] = useState<'away' | 'home'>('away');
  const [sharing, setSharing] = useState(false);
  // ── 試合サマリー共有 ──────────────────────────────────────────────────────────
  const [showSummaryModal, setShowSummaryModal] = useState(false);
  const [summaryStep, setSummaryStep] = useState<'select' | 'preview'>('select');
  const [summaryChecks, setSummaryChecks] = useState({
    hits: true, homeRuns: true, homePitcher: true, awayPitcher: true, opponentName: false,
  });
  const [summaryText, setSummaryText] = useState('');
  const [summaryVisibility, setSummaryVisibility] = useState<PostVisibility>('public');
  const [summaryPosting, setSummaryPosting] = useState(false);
  // ── 選手成績共有 ──────────────────────────────────────────────────────────────
  const [showPlayerModal, setShowPlayerModal] = useState(false);
  const [playerModalStep, setPlayerModalStep] = useState<'select' | 'fields' | 'preview'>('select');
  const [playerListTab, setPlayerListTab] = useState<'batter' | 'pitcher'>('batter');
  const [selectedPlayerInfo, setSelectedPlayerInfo] = useState<{
    type: 'batter' | 'pitcher';
    data: PlayerBattingStats | PlayerPitchingStats;
    side: 'home' | 'away';
  } | null>(null);
  const [playerChecks, setPlayerChecks] = useState<Record<string, boolean>>({});
  const [playerPreviewText, setPlayerPreviewText] = useState('');
  const [playerVisibility, setPlayerVisibility] = useState<PostVisibility>('public');
  const [playerPosting, setPlayerPosting] = useState(false);

  // チーム共有（選手割り当て付き）
  const [showGameShareModal, setShowGameShareModal] = useState(false);
  const [chatSummary, setChatSummary]               = useState('');
  const [gamePlayerAssignments, setGamePlayerAssignments] = useState<GamePlayerAssignment[]>([]);
  const [importingAtBatId, setImportingAtBatId]     = useState<string | null>(null);
  const [showEditPlayersModal, setShowEditPlayersModal] = useState(false);
  const [showPitcherReassignmentModal, setShowPitcherReassignmentModal] = useState(false);

  const shareGate = usePlanGate('share_report');
  const { createPost } = usePostActions();

  const renderHeaderLeft = useCallback(() => {
    if (!router.canGoBack()) return null;
    return (
      <TouchableOpacity
        onPress={() => router.back()}
        style={styles.headerBackBtn}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
        <MaterialCommunityIcons name="arrow-left" size={22} color={Colors.primary} />
        <Text style={styles.headerBackText}>戻る</Text>
      </TouchableOpacity>
    );
  }, []);

  const baseScreenOptions = useMemo(
    () => ({
      title: '試合分析' as const,
      headerBackTitle: '一覧',
      ...(router.canGoBack() ? { headerLeft: renderHeaderLeft } : {}),
    }),
    [renderHeaderLeft],
  );

  useEffect(() => {
    if (!gameId) return;
    let cancelled = false;

    (async () => {
      try {
        const local = await db.games.get(gameId);
        if (cancelled) return;
        if (local) {
          setGame(local);
          setGameCanReshare(true);
          setGamePlayerAssignments([]);
          setLoadedFromShare(false);
          setSavedToDevice(true);
          return;
        }

        const shared = await gameService.getSharedGame(gameId);
        if (cancelled) return;
        if (shared) {
          setGame(stripGameMetadata(shared));
          setGameCanReshare(shared.canReshare !== false);
          setGamePlayerAssignments(shared.playerAssignments ?? []);
          setLoadedFromShare(true);
          setSavedToDevice(false);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [gameId]);

  const handleSaveToDevice = useCallback(async () => {
    if (!gameId || savingToDevice || savedToDevice) return;
    setSavingToDevice(true);
    try {
      const result = await gameService.importSharedGameToLocal(gameId);
      if (result === 'imported' || result === 'already_local') {
        setSavedToDevice(true);
        Alert.alert(
          result === 'already_local' ? '保存済み' : '保存しました',
          result === 'already_local'
            ? 'この試合はすでに端末に保存されています。'
            : '分析一覧に追加しました。いつでも閲覧できます。',
        );
      } else if (result === 'forbidden') {
        Alert.alert('エラー', 'この試合を保存する権限がありません。');
      } else {
        Alert.alert('エラー', '試合データが見つかりません。');
      }
    } catch (e: unknown) {
      Alert.alert('エラー', (e as Error)?.message ?? '端末への保存に失敗しました。');
    } finally {
      setSavingToDevice(false);
    }
  }, [gameId, savingToDevice, savedToDevice]);

  const analytics: GameAnalytics | null = useMemo(() => {
    if (!game) return null;
    try {
      return computeGameAnalytics(game);
    } catch (e) {
      console.error('computeGameAnalytics error:', e);
      return null;
    }
  }, [game]);

  const myAssignedPlayerIds = useMemo(() => {
    if (!currentUser) return new Set<string>();
    return new Set(
      gamePlayerAssignments
        .filter((a) => a.userId === currentUser.uid)
        .map((a) => a.playerId),
    );
  }, [gamePlayerAssignments, currentUser]);

  const myImportableAtBats = useMemo((): AtBatLog[] => {
    if (!game || myAssignedPlayerIds.size === 0) return [];
    return game.atBatLogs.filter(
      (l) => l.result !== null && myAssignedPlayerIds.has(l.batterId),
    );
  }, [game, myAssignedPlayerIds]);

  const runImport = useCallback(
    async (atBatId: string, mode: SpotAtBatImportMode) => {
      if (!currentUser || !gameId) return;
      setImportingAtBatId(atBatId);
      try {
        const { imported, skipped } = await importFromGame(
          gameId,
          [atBatId],
          currentUser.uid,
          mode,
        );
        if (imported.length > 0) {
          Alert.alert('インポート完了', '打席データをスポット打席に追加しました。');
        } else if (skipped.length > 0) {
          Alert.alert('スキップ', 'この打席は既にインポート済みです。');
        }
      } catch (e: unknown) {
        Alert.alert('エラー', (e as Error)?.message ?? 'インポートに失敗しました。');
      } finally {
        setImportingAtBatId(null);
      }
    },
    [currentUser, gameId],
  );

  const handleImportAtBat = useCallback(
    (atBatId: string) => {
      if (!currentUser || !gameId) return;
      Alert.alert(
        '打席をインポート',
        'スポット打席データに追加します。統合方法を選んでください。',
        [
          { text: 'キャンセル', style: 'cancel' },
          {
            text: '別管理',
            onPress: () => runImport(atBatId, 'separate'),
          },
          {
            text: '統合する',
            onPress: () => runImport(atBatId, 'merged'),
          },
        ],
      );
    },
    [currentUser, gameId, runImport],
  );

  // 選手モーダル Step2 で投手の奪三振等を表示するために事前計算
  const pitcherComputedStats = useMemo(() => {
    if (!selectedPlayerInfo || selectedPlayerInfo.type !== 'pitcher') return null;
    const pitcher = selectedPlayerInfo.data as PlayerPitchingStats;
    const logs = (game?.atBatLogs ?? []).filter(
      (l) => l.pitcherId === pitcher.playerId && l.result !== null,
    );
    const ks = logs.filter(
      (l) => l.result === 'strikeout' || l.result === 'strikeout_looking',
    ).length;
    const allowedHits = logs.filter(
      (l) => l.result != null && ['single', 'double', 'triple', 'home_run'].includes(l.result),
    ).length;
    let maxConsec = 0, cur = 0;
    for (const log of logs) {
      if (log.result === 'strikeout' || log.result === 'strikeout_looking') {
        cur++;
        if (cur > maxConsec) maxConsec = cur;
      } else { cur = 0; }
    }
    return { ks, allowedHits, maxConsec };
  }, [selectedPlayerInfo, game]);

  const handleShare = useCallback(async () => {
    if (!shareGate.allowed) {
      showPdfSharePlanAlert();
      return;
    }
    if (!game || !analytics) return;

    setSharing(true);
    try {
      // expo-print / expo-sharing を遅延ロード（ネイティブモジュール未登録時のクラッシュを防ぐ）
      // @ts-ignore
      let Print: typeof import('expo-print');
      // @ts-ignore
      let Sharing: typeof import('expo-sharing');
      try {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        Print = require('expo-print');
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        Sharing = require('expo-sharing');
      } catch {
        Alert.alert(
          '共有機能が利用できません',
          'PDF共有にはアプリの最新バージョンが必要です。App Storeからアップデートしてください。',
        );
        // finally ブロックで setSharing(false) が実行されるため、ここでは不要
        return;
      }

      // PDF はデータのみ（AI分析はフィード投稿用）
      const html = generateGameReportHtml(game, analytics);
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
    } catch (e: unknown) {
      const msg = (e as { message?: string })?.message;
      console.error('PDF share error:', msg ?? e);
      Alert.alert('エラー', `レポートの生成に失敗しました: ${msg ?? 'もう一度お試しください。'}`);
    } finally {
      setSharing(false);
    }
  }, [shareGate.allowed, game, analytics]);

  // ── チャット/DM 共有ハンドラ ────────────────────────────────────────────────────

  const handleOpenChatShare = useCallback(() => {
    if (!game || !analytics) return;
    const awayHits = analytics.batting.away.reduce((s: number, p: PlayerBattingStats) => s + (p.hits ?? 0), 0);
    const homeHits = analytics.batting.home.reduce((s: number, p: PlayerBattingStats) => s + (p.hits ?? 0), 0);
    const text = [
      `⚾ ${game.awayTeam.name} ${analytics.finalScore.away} - ${analytics.finalScore.home} ${game.homeTeam.name}`,
      `安打: ${game.awayTeam.name} ${awayHits}本 / ${game.homeTeam.name} ${homeHits}本`,
      '---',
      'BaseLedgerで詳細を確認',
    ].join('\n');
    setChatSummary(text);
    setShowGameShareModal(true);
  }, [game, analytics]);

  // ── 試合サマリー共有ハンドラ ────────────────────────────────────────────────────

  const buildSummaryText = useCallback(
    (checks: typeof summaryChecks): string => {
      if (!game || !analytics) return '';
      const atBatLogs = game.atBatLogs ?? [];
      const lines: string[] = [];
      lines.push(
        `⚾ ${game.awayTeam.name} ${analytics.finalScore.away} - ${analytics.finalScore.home} ${game.homeTeam.name}`,
      );
      if (checks.opponentName) {
        lines.push(`対戦: ${game.awayTeam.name} vs ${game.homeTeam.name}`);
      }
      if (checks.hits) {
        const awayHits = analytics.batting.away.reduce((s, p) => s + p.hits, 0);
        const homeHits = analytics.batting.home.reduce((s, p) => s + p.hits, 0);
        lines.push(`安打: ${game.awayTeam.name} ${awayHits}本 / ${game.homeTeam.name} ${homeHits}本`);
      }
      if (checks.homeRuns) {
        const hrLogs = atBatLogs.filter((l) => l.result === 'home_run');
        if (hrLogs.length > 0) {
          const parts = hrLogs.map((l) => {
            const inAway = analytics.batting.away.some((b) => b.playerId === l.batterId);
            const allBatters = [...analytics.batting.away, ...analytics.batting.home];
            const p = allBatters.find((b) => b.playerId === l.batterId);
            const name = p?.playerName ?? '不明';
            const teamName = inAway ? game.awayTeam.name : game.homeTeam.name;
            const dist = l.battedBall?.estimatedDistance
              ? ` (推定${l.battedBall.estimatedDistance}m)` : '';
            return `${name}/${teamName}${dist}`;
          });
          lines.push(`本塁打: ${parts.join('、')}`);
        }
      }
      if (checks.homePitcher && analytics.pitching.homePitchers.length > 0) {
        analytics.pitching.homePitchers.forEach((p) => {
          lines.push(
            `${game.homeTeam.name}: ${p.playerName} (${p.totalPitches}球 ストライク率${Math.round(p.strikeRate * 100)}%)`,
          );
        });
      }
      if (checks.awayPitcher && analytics.pitching.awayPitchers.length > 0) {
        analytics.pitching.awayPitchers.forEach((p) => {
          lines.push(
            `${game.awayTeam.name}: ${p.playerName} (${p.totalPitches}球 ストライク率${Math.round(p.strikeRate * 100)}%)`,
          );
        });
      }
      return lines.join('\n');
    },
    [game, analytics],
  );

  const handleOpenSummaryModal = useCallback(() => {
    if (!game || !analytics) return;
    setSummaryStep('select');
    setSummaryChecks({ hits: true, homeRuns: true, homePitcher: true, awayPitcher: true, opponentName: false });
    setSummaryText('');
    setShowSummaryModal(true);
  }, [game, analytics]);

  const handleSummaryPreview = useCallback(() => {
    setSummaryText(buildSummaryText(summaryChecks));
    setSummaryStep('preview');
  }, [buildSummaryText, summaryChecks]);

  const handlePostSummary = useCallback(async () => {
    if (!game || !analytics || !summaryText.trim()) return;
    setSummaryPosting(true);
    try {
      await createPost({
        type: 'stats',
        content: summaryText.trim(),
        mediaURIs: [],
        externalVideoUrl: null,
        statsData: {
          gameId: game.id,
          awayTeam: game.awayTeam.name,
          homeTeam: game.homeTeam.name,
          awayScore: analytics.finalScore.away,
          homeScore: analytics.finalScore.home,
        },
        visibility: summaryVisibility,
        teamId: null,
      });
      setShowSummaryModal(false);
      Alert.alert('投稿しました', '試合サマリーをフィードに共有しました。');
    } catch {
      Alert.alert('エラー', '投稿に失敗しました。もう一度お試しください。');
    } finally {
      setSummaryPosting(false);
    }
  }, [game, analytics, summaryText, summaryVisibility, createPost]);

  // ── 選手成績共有ハンドラ ──────────────────────────────────────────────────────

  const buildPlayerText = useCallback(
    (
      info: { type: 'batter' | 'pitcher'; data: PlayerBattingStats | PlayerPitchingStats; side: 'home' | 'away' },
      checks: Record<string, boolean>,
    ): string => {
      if (!game || !analytics) return '';
      const atBatLogs = game.atBatLogs ?? [];
      const teamName = info.side === 'away' ? game.awayTeam.name : game.homeTeam.name;
      const lines: string[] = [];

      if (info.type === 'batter') {
        const batter = info.data as PlayerBattingStats;
        lines.push(`⚾ ${batter.playerName}（${teamName}）の成績`);
        if (checks.atBatsHits) {
          lines.push(`${batter.atBats}打数${batter.hits}安打`);
        }
        if (checks.rbi && batter.rbi > 0) {
          lines.push(`打点: ${batter.rbi}`);
        }
        if (checks.homeRun && batter.homeRuns > 0) {
          const hrLog = atBatLogs.find(
            (l) => l.batterId === batter.playerId && l.result === 'home_run',
          );
          const dist = hrLog?.battedBall?.estimatedDistance
            ? ` (推定${hrLog.battedBall.estimatedDistance}m)` : '';
          lines.push(`本塁打: ${batter.homeRuns}本${dist}`);
        }
        if (checks.ops && batter.atBats > 0) {
          lines.push(`OPS: ${batter.ops.toFixed(3).replace(/^0/, '')}`);
        }
      } else {
        const pitcher = info.data as PlayerPitchingStats;
        const pitcherLogs = atBatLogs.filter(
          (l) => l.pitcherId === pitcher.playerId && l.result !== null,
        );
        const ks = pitcherLogs.filter(
          (l) => l.result === 'strikeout' || l.result === 'strikeout_looking',
        ).length;
        const allowedHits = pitcherLogs.filter(
          (l) => l.result != null && ['single', 'double', 'triple', 'home_run'].includes(l.result),
        ).length;
        let maxConsec = 0, cur = 0;
        for (const log of pitcherLogs) {
          if (log.result === 'strikeout' || log.result === 'strikeout_looking') {
            cur++; if (cur > maxConsec) maxConsec = cur;
          } else { cur = 0; }
        }

        lines.push(`⚾ ${pitcher.playerName}（${teamName}）の成績`);
        if (checks.pitchesKs) {
          lines.push(`${pitcher.totalPitches}球 ${ks}奪三振`);
        }
        if (checks.allowedHits) {
          lines.push(`被安打: ${allowedHits}本`);
        }
        if (checks.consecKs && maxConsec >= 3) {
          lines.push(`最長連続三振: ${maxConsec}連続`);
        }
        if (checks.strikeRate) {
          lines.push(`ストライク率: ${Math.round(pitcher.strikeRate * 100)}%`);
        }
      }
      return lines.join('\n');
    },
    [game, analytics],
  );

  const handleOpenPlayerModal = useCallback(() => {
    if (!game || !analytics) return;
    setPlayerModalStep('select');
    setPlayerListTab('batter');
    setSelectedPlayerInfo(null);
    setPlayerChecks({});
    setPlayerPreviewText('');
    setShowPlayerModal(true);
  }, [game, analytics]);

  const handleSelectBatter = useCallback(
    (batter: PlayerBattingStats, side: 'home' | 'away') => {
      setSelectedPlayerInfo({ type: 'batter', data: batter, side });
      setPlayerChecks({ atBatsHits: true, rbi: true, homeRun: batter.homeRuns > 0, ops: true });
      setPlayerModalStep('fields');
    },
    [],
  );

  const handleSelectPitcher = useCallback(
    (pitcher: PlayerPitchingStats, side: 'home' | 'away') => {
      setSelectedPlayerInfo({ type: 'pitcher', data: pitcher, side });
      setPlayerChecks({ pitchesKs: true, allowedHits: true, consecKs: true, strikeRate: true });
      setPlayerModalStep('fields');
    },
    [],
  );

  const handlePlayerFieldsNext = useCallback(() => {
    if (!selectedPlayerInfo) return;
    setPlayerPreviewText(buildPlayerText(selectedPlayerInfo, playerChecks));
    setPlayerModalStep('preview');
  }, [selectedPlayerInfo, playerChecks, buildPlayerText]);

  const handlePostPlayer = useCallback(async () => {
    if (!game || !analytics || !playerPreviewText.trim()) return;
    setPlayerPosting(true);
    try {
      await createPost({
        type: 'stats',
        content: playerPreviewText.trim(),
        mediaURIs: [],
        externalVideoUrl: null,
        statsData: {
          gameId: game.id,
          awayTeam: game.awayTeam.name,
          homeTeam: game.homeTeam.name,
          awayScore: analytics.finalScore.away,
          homeScore: analytics.finalScore.home,
        },
        visibility: playerVisibility,
        teamId: null,
      });
      setShowPlayerModal(false);
      Alert.alert('投稿しました', '選手成績をフィードに共有しました。');
    } catch {
      Alert.alert('エラー', '投稿に失敗しました。もう一度お試しください。');
    } finally {
      setPlayerPosting(false);
    }
  }, [game, analytics, playerPreviewText, playerVisibility, createPost]);

  // heatmapPitchLogs を early return より前に配置（フック順序を保証）
  const heatmapPitchLogs = useMemo(() => {
    if (!game) return [];
    const allPitchLogs = game.pitchLogs ?? [];
    const base = heatmapTeam === 'home'
      ? allPitchLogs.filter((p) => p.inning.half === 'top')
      : allPitchLogs.filter((p) => p.inning.half === 'bottom');
    return heatmapPitcherId ? base.filter((p) => p.pitcherId === heatmapPitcherId) : base;
  }, [game, heatmapTeam, heatmapPitcherId]);

  if (loading) {
    return (
      <>
        <Stack.Screen options={baseScreenOptions} />
        <View style={styles.center}>
          <ActivityIndicator size="large" color={Colors.primary} />
        </View>
      </>
    );
  }

  if (!game || !analytics) {
    return (
      <>
        <Stack.Screen options={baseScreenOptions} />
        <View style={styles.center}>
          <Text style={{ color: Colors.textSecondary }}>データが見つかりません</Text>
        </View>
      </>
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

  const allowShare = gameCanReshare;

  return (
    <>
      <Stack.Screen
        options={{
          ...baseScreenOptions,
          headerRight: () =>
            allowShare ? (
              <View style={styles.headerButtons}>
                {/* チャット/DM 共有ボタン */}
                <TouchableOpacity
                  onPress={handleOpenChatShare}
                  style={styles.headerShareBtn}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <MaterialCommunityIcons name="chat-plus-outline" size={22} color={Colors.primary} />
                </TouchableOpacity>
                {/* 試合サマリー共有ボタン */}
                <TouchableOpacity
                  onPress={handleOpenSummaryModal}
                  style={styles.headerShareBtn}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <MaterialCommunityIcons
                    name="text-box-plus-outline"
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
            ) : null,
        }}
      />

      {/* チーム共有モーダル（選手割り当て） */}
      {game && (
        <GameShareModal
          visible={showGameShareModal}
          onClose={() => setShowGameShareModal(false)}
          game={game}
          summary={chatSummary}
        />
      )}

      {game && (
        <EditGamePlayersModal
          visible={showEditPlayersModal}
          game={game}
          onClose={() => setShowEditPlayersModal(false)}
          onSaved={(updated) => setGame(updated)}
        />
      )}

      {game && (
        <PitcherReassignmentModal
          visible={showPitcherReassignmentModal}
          game={game}
          mode="finished"
          userId={currentUser?.uid}
          onClose={() => setShowPitcherReassignmentModal(false)}
          onSaved={(updated) => setGame(updated)}
          onReload={async () => {
            const reloaded = await db.games.get(game.id);
            if (reloaded) setGame(reloaded);
            return reloaded;
          }}
        />
      )}

      {/* ── 試合サマリー投稿モーダル ─────────────────────────────────────────── */}
      <Modal
        visible={showSummaryModal}
        transparent
        animationType="slide"
        onRequestClose={() => { if (!summaryPosting) setShowSummaryModal(false); }}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          keyboardVerticalOffset={0}
          style={{ flex: 1 }}
        >
        <TouchableOpacity
          style={styles.feedModalBackdrop}
          activeOpacity={1}
          onPress={() => { if (!summaryPosting) setShowSummaryModal(false); }}
        >
          <TouchableOpacity activeOpacity={1} style={styles.feedModalSheet}>
            <View style={styles.feedModalHandle} />

            {summaryStep === 'select' ? (
              <>
                <Text style={styles.feedModalTitle}>試合結果を投稿</Text>

                {/* 必須スコア行 */}
                <View style={styles.summaryScoreRow}>
                  <Text style={styles.summaryScoreText} numberOfLines={1}>
                    ⚾ {game.awayTeam.name} {analytics.finalScore.away} - {analytics.finalScore.home} {game.homeTeam.name}
                  </Text>
                  <View style={styles.summaryRequiredBadge}>
                    <Text style={styles.summaryRequiredText}>必須</Text>
                  </View>
                </View>

                {/* チェックボックス一覧 */}
                {(
                  [
                    { key: 'hits',        label: '総ヒット数',                      disabled: false },
                    { key: 'homeRuns',    label: '本塁打者名',                      disabled: false },
                    { key: 'homePitcher', label: `${game.homeTeam.name} 投手`,       disabled: analytics.pitching.homePitchers.length === 0 },
                    { key: 'awayPitcher', label: `${game.awayTeam.name} 投手`,       disabled: analytics.pitching.awayPitchers.length === 0 },
                    { key: 'opponentName',label: '相手チーム名（対戦メモ）',        disabled: false },
                  ] as { key: keyof typeof summaryChecks; label: string; disabled: boolean }[]
                ).map(({ key, label, disabled }) => (
                  <TouchableOpacity
                    key={key}
                    style={[styles.checkRow, disabled && styles.checkRowDisabled]}
                    onPress={() => {
                      if (!disabled) setSummaryChecks(prev => ({ ...prev, [key]: !prev[key] }));
                    }}
                    disabled={disabled}
                    activeOpacity={0.7}
                  >
                    <MaterialCommunityIcons
                      name={summaryChecks[key] && !disabled ? 'checkbox-marked' : 'checkbox-blank-outline'}
                      size={22}
                      color={disabled ? Colors.border : summaryChecks[key] ? Colors.primary : Colors.textSecondary}
                    />
                    <Text style={[styles.checkLabel, disabled && styles.checkLabelDisabled]}>
                      {label}
                    </Text>
                    {disabled && (
                      <Text style={styles.checkNoData}>データなし</Text>
                    )}
                  </TouchableOpacity>
                ))}

                <TouchableOpacity style={styles.feedPostBtn} onPress={handleSummaryPreview}>
                  <Text style={styles.feedPostBtnText}>プレビューを見る →</Text>
                </TouchableOpacity>
              </>
            ) : (
              <>
                {/* Step2: プレビュー＋投稿 */}
                <View style={styles.modalStepHeader}>
                  <TouchableOpacity onPress={() => setSummaryStep('select')} style={styles.modalBackBtn}>
                    <MaterialCommunityIcons name="arrow-left" size={20} color={Colors.primary} />
                  </TouchableOpacity>
                  <Text style={styles.feedModalTitle}>プレビュー・投稿</Text>
                </View>

                <View style={styles.feedTextArea}>
                  <TextInput
                    style={styles.feedTextInput}
                    multiline
                    value={summaryText}
                    onChangeText={setSummaryText}
                    placeholder="投稿内容を編集できます..."
                    placeholderTextColor={Colors.textDisabled}
                    maxLength={1000}
                    textAlignVertical="top"
                  />
                  <Text style={styles.feedCharCount}>{summaryText.length}/1000</Text>
                </View>

                <View style={styles.feedVisRow}>
                  {(['public', 'followers'] as PostVisibility[]).map((v) => (
                    <TouchableOpacity
                      key={v}
                      style={[styles.feedVisBtn, summaryVisibility === v && styles.feedVisBtnActive]}
                      onPress={() => setSummaryVisibility(v)}
                    >
                      <MaterialCommunityIcons
                        name={v === 'public' ? 'earth' : 'account-multiple'}
                        size={14}
                        color={summaryVisibility === v ? Colors.white : Colors.textSecondary}
                      />
                      <Text style={[styles.feedVisBtnText, summaryVisibility === v && styles.feedVisBtnTextActive]}>
                        {v === 'public' ? '全体公開' : 'フォロワー'}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>

                <TouchableOpacity
                  style={[styles.feedPostBtn, (summaryPosting || !summaryText.trim()) && styles.feedPostBtnDisabled]}
                  onPress={handlePostSummary}
                  disabled={summaryPosting || !summaryText.trim()}
                >
                  {summaryPosting ? (
                    <ActivityIndicator color={Colors.white} size="small" />
                  ) : (
                    <Text style={styles.feedPostBtnText}>投稿する</Text>
                  )}
                </TouchableOpacity>
              </>
            )}
          </TouchableOpacity>
        </TouchableOpacity>
        </KeyboardAvoidingView>
      </Modal>

      {/* ── 選手成績投稿モーダル ──────────────────────────────────────────────── */}
      <Modal
        visible={showPlayerModal}
        transparent
        animationType="slide"
        onRequestClose={() => { if (!playerPosting) setShowPlayerModal(false); }}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          keyboardVerticalOffset={0}
          style={{ flex: 1 }}
        >
        <TouchableOpacity
          style={styles.feedModalBackdrop}
          activeOpacity={1}
          onPress={() => { if (!playerPosting) setShowPlayerModal(false); }}
        >
          <TouchableOpacity activeOpacity={1} style={[styles.feedModalSheet, styles.playerModalSheet]}>
            <View style={styles.feedModalHandle} />

            {/* ── Step 1: 選手選択 ── */}
            {playerModalStep === 'select' && (
              <>
                <Text style={styles.feedModalTitle}>選手を選択</Text>

                {/* 打者 / 投手 セグメントタブ */}
                <View style={styles.playerTabBar}>
                  {(['batter', 'pitcher'] as const).map((tab) => (
                    <TouchableOpacity
                      key={tab}
                      style={[styles.playerTabBtn, playerListTab === tab && styles.playerTabBtnActive]}
                      onPress={() => setPlayerListTab(tab)}
                      activeOpacity={0.8}
                    >
                      <MaterialCommunityIcons
                        name={tab === 'batter' ? 'baseball-bat' : 'baseball'}
                        size={14}
                        color={playerListTab === tab ? Colors.white : Colors.textSecondary}
                      />
                      <Text style={[styles.playerTabText, playerListTab === tab && styles.playerTabTextActive]}>
                        {tab === 'batter' ? '打者' : '投手'}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>

                <ScrollView style={styles.playerList} showsVerticalScrollIndicator={false}>
                  {playerListTab === 'batter' ? (
                    <>
                      {/* 先攻チーム 打者 */}
                      {analytics.batting.away.filter((p) => p.atBats > 0).length > 0 && (
                        <Text style={styles.playerListSection}>{game.awayTeam.name}（先攻）</Text>
                      )}
                      {analytics.batting.away.filter((p) => p.atBats > 0).map((batter) => (
                        <TouchableOpacity
                          key={batter.playerId}
                          style={styles.playerListItem}
                          onPress={() => handleSelectBatter(batter, 'away')}
                          activeOpacity={0.7}
                        >
                          <View style={{ flex: 1 }}>
                            <View style={styles.playerListNameRow}>
                              <Text style={styles.playerListName}>{batter.playerName}</Text>
                              <Text style={styles.playerListTeamBadge}>{game.awayTeam.name}</Text>
                            </View>
                            <Text style={styles.playerListSub}>
                              {batter.atBats}打数{batter.hits}安打
                              {batter.rbi > 0 ? ` / 打点${batter.rbi}` : ''}
                              {batter.homeRuns > 0 ? ` / HR ${batter.homeRuns}本` : ''}
                            </Text>
                          </View>
                          <MaterialCommunityIcons name="chevron-right" size={18} color={Colors.textSecondary} />
                        </TouchableOpacity>
                      ))}

                      {/* 後攻チーム 打者 */}
                      {analytics.batting.home.filter((p) => p.atBats > 0).length > 0 && (
                        <Text style={styles.playerListSection}>{game.homeTeam.name}（後攻）</Text>
                      )}
                      {analytics.batting.home.filter((p) => p.atBats > 0).map((batter) => (
                        <TouchableOpacity
                          key={batter.playerId}
                          style={styles.playerListItem}
                          onPress={() => handleSelectBatter(batter, 'home')}
                          activeOpacity={0.7}
                        >
                          <View style={{ flex: 1 }}>
                            <View style={styles.playerListNameRow}>
                              <Text style={styles.playerListName}>{batter.playerName}</Text>
                              <Text style={styles.playerListTeamBadge}>{game.homeTeam.name}</Text>
                            </View>
                            <Text style={styles.playerListSub}>
                              {batter.atBats}打数{batter.hits}安打
                              {batter.rbi > 0 ? ` / 打点${batter.rbi}` : ''}
                              {batter.homeRuns > 0 ? ` / HR ${batter.homeRuns}本` : ''}
                            </Text>
                          </View>
                          <MaterialCommunityIcons name="chevron-right" size={18} color={Colors.textSecondary} />
                        </TouchableOpacity>
                      ))}

                      {analytics.batting.away.filter((p) => p.atBats > 0).length === 0 &&
                        analytics.batting.home.filter((p) => p.atBats > 0).length === 0 && (
                        <Text style={styles.playerListEmpty}>打席データがありません</Text>
                      )}
                    </>
                  ) : (
                    <>
                      {/* 投手タブ */}
                      {analytics.pitching.awayPitchers.map((pitcher) => (
                        <TouchableOpacity
                          key={pitcher.playerId}
                          style={styles.playerListItem}
                          onPress={() => handleSelectPitcher(pitcher, 'away')}
                          activeOpacity={0.7}
                        >
                          <View style={{ flex: 1 }}>
                            <View style={styles.playerListNameRow}>
                              <Text style={styles.playerListName}>{pitcher.playerName}</Text>
                              <Text style={styles.playerListTeamBadge}>{game.awayTeam.name}（先攻）</Text>
                            </View>
                            <Text style={styles.playerListSub}>
                              {pitcher.totalPitches}球 / ストライク率{Math.round(pitcher.strikeRate * 100)}%
                            </Text>
                          </View>
                          <MaterialCommunityIcons name="chevron-right" size={18} color={Colors.textSecondary} />
                        </TouchableOpacity>
                      ))}
                      {analytics.pitching.homePitchers.map((pitcher) => (
                        <TouchableOpacity
                          key={pitcher.playerId}
                          style={styles.playerListItem}
                          onPress={() => handleSelectPitcher(pitcher, 'home')}
                          activeOpacity={0.7}
                        >
                          <View style={{ flex: 1 }}>
                            <View style={styles.playerListNameRow}>
                              <Text style={styles.playerListName}>{pitcher.playerName}</Text>
                              <Text style={styles.playerListTeamBadge}>{game.homeTeam.name}（後攻）</Text>
                            </View>
                            <Text style={styles.playerListSub}>
                              {pitcher.totalPitches}球 / ストライク率{Math.round(pitcher.strikeRate * 100)}%
                            </Text>
                          </View>
                          <MaterialCommunityIcons name="chevron-right" size={18} color={Colors.textSecondary} />
                        </TouchableOpacity>
                      ))}
                      {analytics.pitching.awayPitchers.length === 0 && analytics.pitching.homePitchers.length === 0 && (
                        <Text style={styles.playerListEmpty}>投球データがありません</Text>
                      )}
                    </>
                  )}
                </ScrollView>
              </>
            )}

            {/* ── Step 2: 投稿内容選択 ── */}
            {playerModalStep === 'fields' && selectedPlayerInfo && (
              <>
                <View style={styles.modalStepHeader}>
                  <TouchableOpacity
                    onPress={() => setPlayerModalStep('select')}
                    style={styles.modalBackBtn}
                  >
                    <MaterialCommunityIcons name="arrow-left" size={20} color={Colors.primary} />
                  </TouchableOpacity>
                  <Text style={styles.feedModalTitle}>
                    {(selectedPlayerInfo.data as PlayerBattingStats | PlayerPitchingStats).playerName}
                  </Text>
                </View>

                {selectedPlayerInfo.type === 'batter' ? (
                  /* 打者チェックボックス */
                  (() => {
                    const b = selectedPlayerInfo.data as PlayerBattingStats;
                    return (
                      <>
                        {[
                          { key: 'atBatsHits', label: `打数・安打数 (${b.atBats}打数${b.hits}安打)`, show: true },
                          { key: 'rbi',        label: `打点 (${b.rbi})`,                             show: true },
                          { key: 'homeRun',    label: `本塁打 (${b.homeRuns}本)`,                   show: b.homeRuns > 0 },
                          { key: 'ops',        label: `OPS (${b.atBats > 0 ? b.ops.toFixed(3).replace(/^0/, '') : '-'})`, show: true },
                        ].filter((o) => o.show).map(({ key, label }) => (
                          <TouchableOpacity
                            key={key}
                            style={styles.checkRow}
                            onPress={() => setPlayerChecks(prev => ({ ...prev, [key]: !prev[key] }))}
                            activeOpacity={0.7}
                          >
                            <MaterialCommunityIcons
                              name={playerChecks[key] ? 'checkbox-marked' : 'checkbox-blank-outline'}
                              size={22}
                              color={playerChecks[key] ? Colors.primary : Colors.textSecondary}
                            />
                            <Text style={styles.checkLabel}>{label}</Text>
                          </TouchableOpacity>
                        ))}
                      </>
                    );
                  })()
                ) : (
                  /* 投手チェックボックス */
                  (() => {
                    const p = selectedPlayerInfo.data as PlayerPitchingStats;
                    const cs = pitcherComputedStats;
                    return (
                      <>
                        {[
                          { key: 'pitchesKs',  label: `投球数・奪三振 (${p.totalPitches}球 ${cs?.ks ?? 0}奪三振)` },
                          { key: 'allowedHits',label: `被安打数 (${cs?.allowedHits ?? 0}本)` },
                          { key: 'consecKs',   label: `最長連続三振 (${cs?.maxConsec ?? 0}連続)${(cs?.maxConsec ?? 0) < 3 ? ' ※3以上の場合のみ記載' : ''}` },
                          { key: 'strikeRate', label: `ストライク率 (${Math.round(p.strikeRate * 100)}%)` },
                        ].map(({ key, label }) => (
                          <TouchableOpacity
                            key={key}
                            style={styles.checkRow}
                            onPress={() => setPlayerChecks(prev => ({ ...prev, [key]: !prev[key] }))}
                            activeOpacity={0.7}
                          >
                            <MaterialCommunityIcons
                              name={playerChecks[key] ? 'checkbox-marked' : 'checkbox-blank-outline'}
                              size={22}
                              color={playerChecks[key] ? Colors.primary : Colors.textSecondary}
                            />
                            <Text style={styles.checkLabel}>{label}</Text>
                          </TouchableOpacity>
                        ))}
                      </>
                    );
                  })()
                )}

                <TouchableOpacity
                  style={[styles.feedPostBtn, { marginTop: Spacing.md }]}
                  onPress={handlePlayerFieldsNext}
                >
                  <Text style={styles.feedPostBtnText}>プレビューを見る →</Text>
                </TouchableOpacity>
              </>
            )}

            {/* ── Step 3: プレビュー＋投稿 ── */}
            {playerModalStep === 'preview' && (
              <>
                <View style={styles.modalStepHeader}>
                  <TouchableOpacity
                    onPress={() => setPlayerModalStep('fields')}
                    style={styles.modalBackBtn}
                  >
                    <MaterialCommunityIcons name="arrow-left" size={20} color={Colors.primary} />
                  </TouchableOpacity>
                  <Text style={styles.feedModalTitle}>プレビュー・投稿</Text>
                </View>

                <View style={styles.feedTextArea}>
                  <TextInput
                    style={styles.feedTextInput}
                    multiline
                    value={playerPreviewText}
                    onChangeText={setPlayerPreviewText}
                    placeholder="投稿内容を編集できます..."
                    placeholderTextColor={Colors.textDisabled}
                    maxLength={1000}
                    textAlignVertical="top"
                  />
                  <Text style={styles.feedCharCount}>{playerPreviewText.length}/1000</Text>
                </View>

                <View style={styles.feedVisRow}>
                  {(['public', 'followers'] as PostVisibility[]).map((v) => (
                    <TouchableOpacity
                      key={v}
                      style={[styles.feedVisBtn, playerVisibility === v && styles.feedVisBtnActive]}
                      onPress={() => setPlayerVisibility(v)}
                    >
                      <MaterialCommunityIcons
                        name={v === 'public' ? 'earth' : 'account-multiple'}
                        size={14}
                        color={playerVisibility === v ? Colors.white : Colors.textSecondary}
                      />
                      <Text style={[styles.feedVisBtnText, playerVisibility === v && styles.feedVisBtnTextActive]}>
                        {v === 'public' ? '全体公開' : 'フォロワー'}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>

                <TouchableOpacity
                  style={[styles.feedPostBtn, (playerPosting || !playerPreviewText.trim()) && styles.feedPostBtnDisabled]}
                  onPress={handlePostPlayer}
                  disabled={playerPosting || !playerPreviewText.trim()}
                >
                  {playerPosting ? (
                    <ActivityIndicator color={Colors.white} size="small" />
                  ) : (
                    <Text style={styles.feedPostBtnText}>投稿する</Text>
                  )}
                </TouchableOpacity>
              </>
            )}
          </TouchableOpacity>
        </TouchableOpacity>
        </KeyboardAvoidingView>
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

        {loadedFromShare && (
          <TouchableOpacity
            style={[styles.saveToDeviceBtn, (savingToDevice || savedToDevice) && styles.saveToDeviceBtnDisabled]}
            onPress={handleSaveToDevice}
            disabled={savingToDevice || savedToDevice}
            activeOpacity={0.8}
          >
            {savingToDevice ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <>
                <MaterialCommunityIcons
                  name={savedToDevice ? 'check-circle-outline' : 'download-outline'}
                  size={18}
                  color="#fff"
                />
                <Text style={styles.saveToDeviceBtnText}>
                  {savedToDevice ? '保存済み' : '端末に保存'}
                </Text>
              </>
            )}
          </TouchableOpacity>
        )}

        {(!loadedFromShare || savedToDevice) && (
          <>
            <TouchableOpacity
              style={styles.editPlayersBtn}
              onPress={() => setShowEditPlayersModal(true)}
              activeOpacity={0.8}
            >
              <MaterialCommunityIcons name="account-edit-outline" size={18} color={Colors.primary} />
              <Text style={styles.editPlayersBtnText}>選手名を編集</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.reassignPitcherBtn}
              onPress={() => setShowPitcherReassignmentModal(true)}
              activeOpacity={0.8}
            >
              <MaterialCommunityIcons name="baseball" size={18} color={Colors.error} />
              <Text style={styles.reassignPitcherBtnText}>投手記録を正しい選手へ移す</Text>
            </TouchableOpacity>
          </>
        )}

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
              {analytics.pitching.homePitchers.length > 0
                ? analytics.pitching.homePitchers.map((pitcher) => (
                    <React.Fragment key={pitcher.playerId}>
                      <PitchingSection
                        stats={pitcher}
                        teamName={`${t.analytics.home} ${game.homeTeam.name}`}
                      />
                      <View style={{ height: Spacing.sm }} />
                    </React.Fragment>
                  ))
                : <PitchingSection stats={null} teamName={`${t.analytics.home} ${game.homeTeam.name}`} />
              }
              <View style={{ height: Spacing.md }} />
              {analytics.pitching.awayPitchers.length > 0
                ? analytics.pitching.awayPitchers.map((pitcher) => (
                    <React.Fragment key={pitcher.playerId}>
                      <PitchingSection
                        stats={pitcher}
                        teamName={`${t.analytics.away} ${game.awayTeam.name}`}
                      />
                      <View style={{ height: Spacing.sm }} />
                    </React.Fragment>
                  ))
                : <PitchingSection stats={null} teamName={`${t.analytics.away} ${game.awayTeam.name}`} />
              }
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
                  onPress={() => { setHeatmapTeam('home'); setHeatmapPitcherId(null); }}
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
                  onPress={() => { setHeatmapTeam('away'); setHeatmapPitcherId(null); }}
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

              {/* Pitcher selector (2人以上の場合のみ表示) */}
              {(() => {
                const pitchers = heatmapTeam === 'home'
                  ? analytics.pitching.homePitchers
                  : analytics.pitching.awayPitchers;
                if (pitchers.length < 2) return null;
                return (
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    style={{ marginBottom: Spacing.sm }}
                    contentContainerStyle={{ gap: Spacing.xs }}
                  >
                    <TouchableOpacity
                      style={[styles.toggleBtn, !heatmapPitcherId && styles.toggleBtnActive]}
                      onPress={() => setHeatmapPitcherId(null)}
                    >
                      <Text style={[styles.toggleText, !heatmapPitcherId && styles.toggleTextActive]}>
                        全投手
                      </Text>
                    </TouchableOpacity>
                    {pitchers.map((p) => (
                      <TouchableOpacity
                        key={p.playerId}
                        style={[styles.toggleBtn, heatmapPitcherId === p.playerId && styles.toggleBtnActive]}
                        onPress={() => setHeatmapPitcherId(p.playerId)}
                      >
                        <Text style={[styles.toggleText, heatmapPitcherId === p.playerId && styles.toggleTextActive]}>
                          {p.playerName}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                );
              })()}

              <View style={styles.chartCard}>
                <PitchHeatmap pitchLogs={heatmapPitchLogs} />
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
                {heatmapPitcherId
                  ? (heatmapTeam === 'home' ? analytics.pitching.homePitchers : analytics.pitching.awayPitchers)
                      .find((p) => p.playerId === heatmapPitcherId)?.playerName ?? ''
                  : (heatmapTeam === 'home' ? game.homeTeam.name : game.awayTeam.name)
                }:{' '}{heatmapPitchLogs.length}球
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

          {/* 自分の打席インポート */}
          {myImportableAtBats.length > 0 && (
            <View style={styles.importCard}>
              <Text style={styles.importCardTitle}>自分の打席をインポート</Text>
              <Text style={styles.importCardHint}>
                スポット打席データに追加して分析できます
              </Text>
              {myImportableAtBats.map((atBat) => {
                const half = atBat.inning.half === 'top' ? '表' : '裏';
                const label = `${atBat.inning.number}回${half} — ${AT_BAT_RESULT_JP[atBat.result!] ?? atBat.result}`;
                return (
                  <View key={atBat.id} style={styles.importRow}>
                    <View style={styles.importRowInfo}>
                      <Text style={styles.importRowLabel}>{label}</Text>
                      <Text style={styles.importRowSub}>{atBat.pitches.length}球</Text>
                    </View>
                    <TouchableOpacity
                      style={styles.importBtn}
                      onPress={() => handleImportAtBat(atBat.id)}
                      disabled={importingAtBatId === atBat.id}
                    >
                      {importingAtBatId === atBat.id ? (
                        <ActivityIndicator size="small" color={Colors.white} />
                      ) : (
                        <Text style={styles.importBtnText}>インポート</Text>
                      )}
                    </TouchableOpacity>
                  </View>
                );
              })}
            </View>
          )}

          {/* 共有ボタン行 */}
          {allowShare && (
            <View style={styles.shareCol}>
              {/* Row1: 試合サマリー＋選手成績 */}
              <View style={styles.shareRow}>
                <TouchableOpacity
                  style={[styles.shareInlineBtn, styles.shareInlineFeed]}
                  onPress={handleOpenSummaryModal}
                  activeOpacity={0.8}
                >
                  <View style={styles.shareInlineBtnInner}>
                    <MaterialCommunityIcons name="text-box-plus-outline" size={16} color={Colors.primary} />
                    <Text style={styles.shareInlineFeedText}>試合結果を投稿</Text>
                  </View>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.shareInlineBtn, styles.shareInlinePlayer]}
                  onPress={handleOpenPlayerModal}
                  activeOpacity={0.8}
                >
                  <View style={styles.shareInlineBtnInner}>
                    <MaterialCommunityIcons name="account-star-outline" size={16} color={Colors.accent} />
                    <Text style={styles.shareInlinePlayerText}>選手成績を投稿</Text>
                  </View>
                </TouchableOpacity>
              </View>

              {/* Row2: PDF共有（幅広） */}
              <TouchableOpacity
                style={[styles.shareInlineFull, styles.shareInlinePdf]}
                onPress={handleShare}
                disabled={sharing}
                activeOpacity={0.8}
              >
                {sharing ? (
                  <ActivityIndicator size="small" color={Colors.white} />
                ) : (
                  <View style={styles.shareInlineBtnInner}>
                    <MaterialCommunityIcons name="file-pdf-box" size={16} color={Colors.white} />
                    <Text style={styles.shareInlinePdfText}>
                      {shareGate.allowed ? 'PDF共有' : 'PDF共有（ライト以上）'}
                    </Text>
                  </View>
                )}
              </TouchableOpacity>
            </View>
          )}

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
  headerBackBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: Spacing.xs,
    gap: 2,
  },
  headerBackText: {
    fontSize: Typography.body,
    fontWeight: '600',
    color: Colors.primary,
  },
  headerButtons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginRight: Spacing.xs,
  },
  headerShareBtn: {
    padding: 4,
  },

  // 画面内共有ボタン列（2段）
  importCard: {
    marginHorizontal: Spacing.md,
    marginTop: Spacing.md,
    padding: Spacing.md,
    backgroundColor: Colors.card,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    borderLeftWidth: 4,
    borderLeftColor: Colors.accent,
  },
  importCardTitle: {
    fontSize: Typography.body,
    fontWeight: '700',
    color: Colors.text,
    marginBottom: 4,
  },
  importCardHint: {
    fontSize: Typography.caption,
    color: Colors.textSecondary,
    marginBottom: Spacing.sm,
  },
  importRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.border,
  },
  importRowInfo: { flex: 1 },
  importRowLabel: { fontSize: Typography.bodySmall, fontWeight: '600', color: Colors.text },
  importRowSub: { fontSize: Typography.tiny, color: Colors.textSecondary, marginTop: 2 },
  importBtn: {
    backgroundColor: Colors.primary,
    paddingHorizontal: Spacing.md,
    paddingVertical: 8,
    borderRadius: BorderRadius.sm,
    minWidth: 88,
    alignItems: 'center',
  },
  importBtnText: { color: Colors.white, fontWeight: '600', fontSize: Typography.caption },

  shareCol: {
    gap: Spacing.sm,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    backgroundColor: Colors.white,
  },
  shareRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  shareInlineBtn: {
    flex: 1,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  shareInlineFull: {
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  shareInlineBtnInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
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
  shareInlinePlayer: {
    backgroundColor: '#FFF5EC',
    borderWidth: 1,
    borderColor: Colors.accent + '60',
  },
  shareInlinePlayerText: {
    fontSize: Typography.caption,
    fontWeight: '700',
    color: Colors.accent,
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

  // サマリーモーダル: 必須スコア行
  summaryScoreRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.primaryLight,
    borderRadius: BorderRadius.md,
    padding: Spacing.sm,
    marginBottom: Spacing.md,
    gap: Spacing.xs,
  },
  summaryScoreText: {
    flex: 1,
    fontSize: Typography.caption,
    fontWeight: '700',
    color: Colors.primary,
  },
  summaryRequiredBadge: {
    backgroundColor: Colors.primary,
    borderRadius: BorderRadius.sm,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  summaryRequiredText: {
    fontSize: Typography.tiny,
    color: Colors.white,
    fontWeight: '700',
  },

  // チェックボックス行（共通）
  checkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingVertical: Spacing.sm,
    borderBottomWidth: 0.5,
    borderBottomColor: Colors.surfaceGray,
  },
  checkLabel: {
    flex: 1,
    fontSize: Typography.bodySmall,
    color: Colors.text,
  },
  checkNoData: {
    fontSize: Typography.tiny,
    color: Colors.textDisabled,
  },
  checkRowDisabled: { opacity: 0.4 },
  checkLabelDisabled: { color: Colors.textDisabled },

  // モーダル共通: ステップヘッダー（戻るボタン付き）
  modalStepHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginBottom: Spacing.md,
  },
  modalBackBtn: {
    padding: 4,
  },

  // 選手モーダル
  playerModalSheet: {
    maxHeight: '82%',
  },
  playerList: {
    flexGrow: 0,
  },
  // 打者/投手 セグメントタブ
  playerTabBar: {
    flexDirection: 'row',
    backgroundColor: Colors.surfaceGray,
    borderRadius: BorderRadius.md,
    padding: 3,
    marginBottom: Spacing.sm,
    gap: 3,
  },
  playerTabBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.sm,
  },
  playerTabBtnActive: {
    backgroundColor: Colors.primary,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 2,
    shadowOffset: { width: 0, height: 1 },
  },
  playerTabText: {
    fontSize: Typography.caption,
    fontWeight: '600',
    color: Colors.textSecondary,
  },
  playerTabTextActive: {
    color: Colors.white,
  },
  playerListNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    marginBottom: 2,
  },
  playerListTeamBadge: {
    fontSize: Typography.tiny,
    color: Colors.primary,
    backgroundColor: Colors.primaryLight,
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: BorderRadius.sm,
    fontWeight: '600',
    overflow: 'hidden',
  },
  playerListEmpty: {
    fontSize: Typography.bodySmall,
    color: Colors.textSecondary,
    textAlign: 'center',
    paddingVertical: Spacing.lg,
  },

  playerListSection: {
    fontSize: Typography.caption,
    fontWeight: '700',
    color: Colors.textSecondary,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.xs,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  playerListItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing.sm,
    borderBottomWidth: 0.5,
    borderBottomColor: Colors.surfaceGray,
  },
  playerListName: {
    fontSize: Typography.bodySmall,
    fontWeight: '600',
    color: Colors.text,
    marginBottom: 2,
  },
  playerListSub: {
    fontSize: Typography.caption,
    color: Colors.textSecondary,
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
  saveToDeviceBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginHorizontal: Spacing.md,
    marginTop: Spacing.sm,
    marginBottom: Spacing.xs,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.primary,
  },
  saveToDeviceBtnDisabled: {
    opacity: 0.7,
  },
  saveToDeviceBtnText: {
    fontSize: Typography.bodySmall,
    fontWeight: '700',
    color: '#fff',
  },
  editPlayersBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginHorizontal: Spacing.md,
    marginTop: Spacing.sm,
    marginBottom: Spacing.xs,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.primary,
    backgroundColor: Colors.primaryLight,
  },
  editPlayersBtnText: {
    fontSize: Typography.bodySmall,
    fontWeight: '700',
    color: Colors.primary,
  },
  reassignPitcherBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginHorizontal: Spacing.md,
    marginTop: Spacing.xs,
    marginBottom: Spacing.xs,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.error,
    backgroundColor: '#FFF3F3',
  },
  reassignPitcherBtnText: {
    fontSize: Typography.bodySmall,
    fontWeight: '700',
    color: Colors.error,
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
