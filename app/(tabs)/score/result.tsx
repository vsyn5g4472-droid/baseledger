import React, { useMemo, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  SafeAreaView,
  StatusBar,
  Share,
} from 'react-native';
import { router, useFocusEffect, useNavigation } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useGameStore } from '../../../src/stores/gameStore';

const C = {
  bg: '#0D1B2A',
  header: '#1A2744',
  card: '#1A2744',
  border: '#2A3F6B',
  text: '#FFFFFF',
  textSub: '#8896AB',
  win: '#C41E3A',
  lose: '#4A5568',
  gold: '#D4AF37',
  action: '#1A6BB5',
};

const DAY_LABELS = ['日', '月', '火', '水', '木', '金', '土'];

function formatDate(ts: number): string {
  const d = new Date(ts);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const dow = DAY_LABELS[d.getDay()];
  return `${y}.${m}.${day} (${dow})`;
}

const HIT_RESULTS = ['single', 'double', 'triple', 'home_run'] as const;

export default function ResultScreen() {
  const game = useGameStore((s) => s.game);
  const clearActiveGame = useGameStore((s) => s.clearActiveGame);

  const navigation = useNavigation();

  useFocusEffect(
    useCallback(() => {
      const parent = navigation.getParent();
      parent?.setOptions({ tabBarStyle: { display: 'none' } });
      return () => {
        parent?.setOptions({ tabBarStyle: undefined });
      };
    }, [navigation])
  );

  // hooks はすべて早期returnより前に呼ぶ
  const { mvpPlayer, mvpStats } = useMemo(() => {
    if (!game) return { mvpPlayer: null, mvpStats: null };
    const statsMap: Record<string, { id: string; hits: number; rbi: number }> = {};
    for (const log of game.atBatLogs) {
      if (!log.result) continue;
      const id = log.batterId;
      if (!statsMap[id]) statsMap[id] = { id, hits: 0, rbi: 0 };
      if (HIT_RESULTS.includes(log.result as any)) statsMap[id].hits += 1;
      statsMap[id].rbi += log.rbiCount ?? 0;
    }
    const mvpEntry = Object.values(statsMap).sort(
      (a, b) => b.hits * 2 + b.rbi - (a.hits * 2 + a.rbi),
    )[0];
    const allPlayers = [
      ...(game.awayTeam.roster.starters ?? []),
      ...(game.homeTeam.roster.starters ?? []),
    ];
    const mvpPlayer = mvpEntry ? (allPlayers.find((p) => p.id === mvpEntry.id) ?? null) : null;
    return { mvpPlayer, mvpStats: mvpEntry ?? null };
  }, [game]);

  useEffect(() => {
    if (!game) {
      router.replace('/(tabs)/score/' as any);
    }
  }, [game]);

  if (!game) return null;

  const { awayTotal, homeTotal, awayHits, homeHits, awayErrors, homeErrors, innings } = game.scoreboard;
  const isAwayWin = awayTotal > homeTotal;
  const isTie = awayTotal === homeTotal;

  const handleShare = async () => {
    try {
      const winner = isAwayWin ? game.awayTeam.name : isTie ? null : game.homeTeam.name;
      const winLine = winner ? `🏆 ${winner} Win` : '引き分け';
      const ballparkLine = game.ballpark.name ? `\n${game.ballpark.name}` : '';
      await Share.share({
        message: `⚾ ${game.awayTeam.name} ${awayTotal} - ${homeTotal} ${game.homeTeam.name}\n${formatDate(game.createdAt)}${ballparkLine}\n${winLine}`,
      });
    } catch (e) {
      console.error(e);
    }
  };

  const handleGoAnalytics = () => {
    clearActiveGame();
    router.replace('/(tabs)/analytics' as any);
  };

  const handleGoHome = () => {
    clearActiveGame();
    router.replace('/(tabs)/feed' as any);
  };

  const tournamentName = game.metadata.tournamentName || '';
  const ballparkName = game.ballpark.name || '';

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="light-content" backgroundColor={C.header} />

      {/* ヘッダー */}
      <View style={styles.header}>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>試合終了</Text>
        </View>
        <TouchableOpacity style={styles.headerRight} onPress={handleShare}>
          <MaterialCommunityIcons name="share-variant" size={22} color={C.text} />
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>

        {/* メタ情報 */}
        <View style={styles.metaRow}>
          <Text style={styles.metaText}>{formatDate(game.createdAt)}</Text>
          {tournamentName ? <Text style={styles.metaText}>{tournamentName}</Text> : null}
          {ballparkName ? <Text style={styles.metaText}>{ballparkName}</Text> : null}
        </View>

        {/* スコアヒーロー */}
        <View style={styles.scoreHero}>
          <View style={styles.scoreTeamCol}>
            <Text style={styles.scoreTeamName}>{game.awayTeam.name}</Text>
            {isAwayWin && (
              <View style={styles.winBadge}>
                <Text style={styles.winBadgeText}>WIN</Text>
              </View>
            )}
          </View>
          <View style={styles.scoreNumbers}>
            <Text style={[styles.scoreBig, isAwayWin ? styles.scoreWin : styles.scoreGray]}>
              {awayTotal}
            </Text>
            <Text style={styles.scoreDash}>—</Text>
            <Text style={[styles.scoreBig, !isAwayWin && !isTie ? styles.scoreWin : styles.scoreGray]}>
              {homeTotal}
            </Text>
          </View>
          <View style={styles.scoreTeamCol}>
            <Text style={styles.scoreTeamName}>{game.homeTeam.name}</Text>
            {!isAwayWin && !isTie && (
              <View style={styles.winBadge}>
                <Text style={styles.winBadgeText}>WIN</Text>
              </View>
            )}
          </View>
        </View>

        {/* スコアボード */}
        <View style={styles.scoreboardWrapper}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View>
              {/* ヘッダー行 */}
              <View style={styles.sbRow}>
                <View style={[styles.sbCell, styles.sbTeamCell, styles.sbHeaderCell]}>
                  <Text style={styles.sbHeaderText}>TEAM</Text>
                </View>
                {innings.map((inn) => (
                  <View key={inn.inning} style={[styles.sbCell, styles.sbInningCell, styles.sbHeaderCell]}>
                    <Text style={styles.sbHeaderText}>{inn.inning}</Text>
                  </View>
                ))}
                {(['R', 'H', 'E'] as const).map((label) => (
                  <View key={label} style={[styles.sbCell, styles.sbStatCell, styles.sbHeaderCell]}>
                    <Text style={styles.sbHeaderText}>{label}</Text>
                  </View>
                ))}
              </View>
              {/* 先攻行 */}
              <View style={styles.sbRow}>
                <View style={[styles.sbCell, styles.sbTeamCell]}>
                  <Text style={styles.sbTeamText} numberOfLines={1}>{game.awayTeam.name}</Text>
                </View>
                {innings.map((inn) => (
                  <View key={inn.inning} style={[styles.sbCell, styles.sbInningCell]}>
                    <Text style={styles.sbScoreText}>{inn.away}</Text>
                  </View>
                ))}
                <View style={[styles.sbCell, styles.sbStatCell]}>
                  <Text style={[styles.sbScoreText, isAwayWin && styles.sbWinScore]}>{awayTotal}</Text>
                </View>
                <View style={[styles.sbCell, styles.sbStatCell]}>
                  <Text style={styles.sbScoreText}>{awayHits}</Text>
                </View>
                <View style={[styles.sbCell, styles.sbStatCell]}>
                  <Text style={styles.sbScoreText}>{awayErrors}</Text>
                </View>
              </View>
              {/* 後攻行 */}
              <View style={[styles.sbRow, styles.sbLastRow]}>
                <View style={[styles.sbCell, styles.sbTeamCell]}>
                  <Text style={styles.sbTeamText} numberOfLines={1}>{game.homeTeam.name}</Text>
                </View>
                {innings.map((inn) => (
                  <View key={inn.inning} style={[styles.sbCell, styles.sbInningCell]}>
                    <Text style={styles.sbScoreText}>{inn.home}</Text>
                  </View>
                ))}
                <View style={[styles.sbCell, styles.sbStatCell]}>
                  <Text style={[styles.sbScoreText, !isAwayWin && !isTie && styles.sbWinScore]}>{homeTotal}</Text>
                </View>
                <View style={[styles.sbCell, styles.sbStatCell]}>
                  <Text style={styles.sbScoreText}>{homeHits}</Text>
                </View>
                <View style={[styles.sbCell, styles.sbStatCell]}>
                  <Text style={styles.sbScoreText}>{homeErrors}</Text>
                </View>
              </View>
            </View>
          </ScrollView>
        </View>

        {/* MVPカード */}
        {mvpPlayer && mvpStats && (
          <View style={styles.mvpCard}>
            <Text style={styles.mvpIcon}>🏆</Text>
            <View style={styles.mvpCenter}>
              <Text style={styles.mvpLabel}>本日のMVP</Text>
              <Text style={styles.mvpName}>{mvpPlayer.name}</Text>
            </View>
            <View style={styles.mvpRight}>
              <Text style={styles.mvpStat}>安打: {mvpStats.hits}</Text>
              <Text style={styles.mvpStat}>打点: {mvpStats.rbi}</Text>
            </View>
          </View>
        )}

        {/* アクションボタン */}
        <View style={styles.actions}>
          <TouchableOpacity style={styles.actionPrimary} onPress={handleGoAnalytics} activeOpacity={0.8}>
            <MaterialCommunityIcons name="chart-bar" size={20} color={C.text} />
            <Text style={styles.actionPrimaryText}>分析を見る</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.actionSecondary} onPress={handleShare} activeOpacity={0.8}>
            <MaterialCommunityIcons name="share-variant" size={20} color={C.text} />
            <Text style={styles.actionSecondaryText}>結果を共有する</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.actionTertiary} onPress={handleGoHome} activeOpacity={0.8}>
            <MaterialCommunityIcons name="home" size={20} color={C.textSub} />
            <Text style={styles.actionTertiaryText}>ホームへ戻る</Text>
          </TouchableOpacity>
        </View>

      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: C.bg },
  header: {
    backgroundColor: C.header,
    height: 52,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
  },
  headerCenter: { flex: 1, alignItems: 'center' },
  headerTitle: { color: C.text, fontSize: 17, fontWeight: '700' },
  headerRight: { position: 'absolute', right: 16, padding: 8 },
  scroll: { flex: 1 },
  scrollContent: { paddingBottom: 40 },
  metaRow: { alignItems: 'center', paddingVertical: 16, gap: 2 },
  metaText: { color: C.textSub, fontSize: 13, textAlign: 'center' },
  scoreHero: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
    paddingBottom: 24,
    gap: 12,
  },
  scoreTeamCol: { flex: 1, alignItems: 'center', gap: 6 },
  scoreTeamName: { color: C.text, fontSize: 14, fontWeight: '600', textAlign: 'center' },
  winBadge: { backgroundColor: C.win, paddingHorizontal: 10, paddingVertical: 2, borderRadius: 4 },
  winBadgeText: { color: C.text, fontSize: 11, fontWeight: '700' },
  scoreNumbers: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  scoreBig: { fontSize: 72, fontWeight: '700', lineHeight: 80, fontVariant: ['tabular-nums'] },
  scoreWin: { color: C.win },
  scoreGray: { color: C.lose },
  scoreDash: { color: C.textSub, fontSize: 28, fontWeight: '300' },
  scoreboardWrapper: {
    marginHorizontal: 16,
    marginBottom: 16,
    borderRadius: 10,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: C.border,
  },
  sbRow: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: C.border },
  sbLastRow: { borderBottomWidth: 0 },
  sbCell: { justifyContent: 'center', alignItems: 'center', paddingVertical: 8 },
  sbTeamCell: { width: 80, paddingHorizontal: 6, alignItems: 'flex-start' },
  sbInningCell: { width: 32 },
  sbStatCell: { width: 36 },
  sbHeaderCell: { backgroundColor: C.header },
  sbHeaderText: { color: C.textSub, fontSize: 11, fontWeight: '700', fontVariant: ['tabular-nums'] },
  sbTeamText: { color: C.text, fontSize: 12, fontWeight: '600' },
  sbScoreText: { color: C.text, fontSize: 13, fontVariant: ['tabular-nums'] },
  sbWinScore: { color: C.win, fontWeight: '700' },
  mvpCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: C.card,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 12,
    marginHorizontal: 16,
    marginBottom: 16,
    padding: 16,
    gap: 12,
  },
  mvpIcon: { fontSize: 28 },
  mvpCenter: { flex: 1, gap: 2 },
  mvpLabel: { color: C.textSub, fontSize: 11 },
  mvpName: { color: C.text, fontSize: 20, fontWeight: '700' },
  mvpRight: { alignItems: 'flex-end', gap: 2 },
  mvpStat: { color: C.textSub, fontSize: 13 },
  actions: { paddingHorizontal: 16, gap: 12 },
  actionPrimary: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: C.action,
    paddingVertical: 14,
    borderRadius: 10,
  },
  actionPrimaryText: { color: C.text, fontSize: 16, fontWeight: '700' },
  actionSecondary: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: C.border,
    paddingVertical: 14,
    borderRadius: 10,
  },
  actionSecondaryText: { color: C.text, fontSize: 16, fontWeight: '600' },
  actionTertiary: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 10,
  },
  actionTertiaryText: { color: C.textSub, fontSize: 16 },
});
