import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { useLocalSearchParams, Stack } from 'expo-router';
import { Snackbar } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { db } from '../../../../src/db';
import type { GameState, AtBatLog } from '../../../../src/types/game';
import { useAuth } from '../../../../src/contexts/AuthContext';
import {
  createPersonalPost,
  canShareAtBat,
  AT_BAT_RESULT_LABELS,
} from '../../../../src/services/personalPostService';
import { Colors, Spacing, Typography, BorderRadius, CardShadow } from '../../../../src/constants/theme';

// ── Result colour map ──────────────────────────────────────────────────────────

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

// ── AtBat card ─────────────────────────────────────────────────────────────────

interface AtBatCardProps {
  atBat: AtBatLog;
  game: GameState;
  canShare: boolean;
  isSharing: boolean;
  onShare: () => void;
}

function AtBatCard({ atBat, game, canShare, isSharing, onShare }: AtBatCardProps) {
  const allPlayers = [
    ...game.awayTeam.roster.starters,
    ...game.awayTeam.roster.bench,
    ...game.homeTeam.roster.starters,
    ...game.homeTeam.roster.bench,
  ];
  const batter  = allPlayers.find((p) => p.id === atBat.batterId);
  const pitcher = allPlayers.find((p) => p.id === atBat.pitcherId);

  const halfLabel   = atBat.inning.half === 'top' ? '表' : '裏';
  const resultLabel = atBat.result
    ? (AT_BAT_RESULT_LABELS[atBat.result] ?? atBat.result)
    : '-';
  const resultColor = atBat.result
    ? (RESULT_COLORS[atBat.result] ?? Colors.textSecondary)
    : Colors.textSecondary;

  return (
    <View style={styles.card}>
      {/* Inning + result */}
      <View style={styles.cardHeader}>
        <Text style={styles.inningLabel}>
          {atBat.inning.number}回{halfLabel}
        </Text>
        {atBat.result && (
          <View style={[styles.resultBadge, { backgroundColor: resultColor + '22' }]}>
            <Text style={[styles.resultText, { color: resultColor }]}>
              {resultLabel}
            </Text>
          </View>
        )}
        {atBat.rbiCount > 0 && (
          <View style={styles.rbiBadge}>
            <Text style={styles.rbiText}>打点 {atBat.rbiCount}</Text>
          </View>
        )}
      </View>

      {/* Players */}
      <View style={styles.playersRow}>
        <View style={styles.playerItem}>
          <MaterialCommunityIcons name="baseball-bat" size={13} color={Colors.primary} />
          <Text style={styles.playerName}>{batter?.name ?? '不明'}</Text>
        </View>
        <Text style={styles.vsText}>vs</Text>
        <View style={styles.playerItem}>
          <MaterialCommunityIcons name="baseball" size={13} color={Colors.textSecondary} />
          <Text style={styles.playerNameSecondary}>{pitcher?.name ?? '不明'}</Text>
        </View>
        <Text style={styles.pitchCountText}>{atBat.pitches.length}球</Text>
      </View>

      {/* Share button — only visible for owned records */}
      {canShare && (
        <TouchableOpacity
          style={[styles.shareBtn, isSharing && styles.shareBtnDisabled]}
          onPress={onShare}
          disabled={isSharing}
          activeOpacity={0.7}
        >
          {isSharing ? (
            <ActivityIndicator size="small" color={Colors.primary} />
          ) : (
            <MaterialCommunityIcons name="share-variant" size={15} color={Colors.primary} />
          )}
          <Text style={styles.shareBtnText}>個人フィードにシェア</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

// ── Screen ─────────────────────────────────────────────────────────────────────

export default function GameAtBatScreen() {
  const { gameId } = useLocalSearchParams<{ gameId: string }>();
  const { currentUser } = useAuth();

  const [game, setGame]         = useState<GameState | null>(null);
  const [loading, setLoading]   = useState(true);
  const [sharingId, setSharingId] = useState<string | null>(null);
  const [snackbar, setSnackbar] = useState({
    visible: false,
    message: '',
    error: false,
  });

  useEffect(() => {
    if (!gameId) return;
    db.games
      .get(gameId)
      .then((g) => { if (g) setGame(g); })
      .finally(() => setLoading(false));
  }, [gameId]);

  const handleShare = useCallback(
    async (atBatLogId: string) => {
      if (!currentUser || !gameId) return;
      setSharingId(atBatLogId);
      try {
        await createPersonalPost(currentUser.uid, gameId, atBatLogId);
        setSnackbar({ visible: true, message: 'フィードに投稿しました', error: false });
      } catch (e: any) {
        setSnackbar({
          visible: true,
          message: e?.message ?? 'シェアに失敗しました',
          error: true,
        });
      } finally {
        setSharingId(null);
      }
    },
    [currentUser, gameId],
  );

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={Colors.primary} />
      </View>
    );
  }

  if (!game) {
    return (
      <View style={styles.center}>
        <Text style={styles.noData}>データが見つかりません</Text>
      </View>
    );
  }

  // Only show at-bats that have a final result
  const completedAtBats = game.atBatLogs.filter((l) => l.result !== null);

  return (
    <>
      <Stack.Screen options={{ title: '打席ログ · シェア', headerBackTitle: 'スコア' }} />

      <FlatList
        data={completedAtBats}
        keyExtractor={(item) => item.id}
        contentContainerStyle={
          completedAtBats.length === 0 ? styles.emptyContainer : styles.listContent
        }
        ListHeaderComponent={
          <View style={styles.gameHeader}>
            {/* Game title */}
            <Text style={styles.gameTitle} numberOfLines={1}>
              {game.awayTeam.name} vs {game.homeTeam.name}
            </Text>
            {/* Score */}
            <View style={styles.scoreRow}>
              <Text style={styles.scoreNum}>{game.scoreboard.awayTotal}</Text>
              <Text style={styles.scoreSep}>:</Text>
              <Text style={styles.scoreNum}>{game.scoreboard.homeTotal}</Text>
            </View>
            {/* Info */}
            <Text style={styles.gameInfo}>
              {completedAtBats.length}打席 · {game.pitchLogs.length}球
            </Text>
            {/* Share hint */}
            {currentUser && (
              <View style={styles.hintRow}>
                <MaterialCommunityIcons
                  name="information-outline"
                  size={13}
                  color={Colors.textSecondary}
                />
                <Text style={styles.hintText}>
                  自分の打席にシェアボタンが表示されます
                </Text>
              </View>
            )}
          </View>
        }
        renderItem={({ item }) => (
          <AtBatCard
            atBat={item}
            game={game}
            canShare={!!currentUser && canShareAtBat(item.id, game, currentUser.uid)}
            isSharing={sharingId === item.id}
            onShare={() => handleShare(item.id)}
          />
        )}
        ListEmptyComponent={
          <View style={styles.emptyContent}>
            <MaterialCommunityIcons name="clipboard-text-outline" size={48} color={Colors.border} />
            <Text style={styles.emptyTitle}>打席記録がありません</Text>
          </View>
        }
      />

      <Snackbar
        visible={snackbar.visible}
        onDismiss={() => setSnackbar((s) => ({ ...s, visible: false }))}
        duration={3000}
        style={{
          backgroundColor: snackbar.error ? Colors.secondary : Colors.primary,
        }}
      >
        {snackbar.message}
      </Snackbar>
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
  noData: { color: Colors.textSecondary, fontSize: Typography.body },

  listContent: { padding: Spacing.md, gap: Spacing.sm, paddingBottom: Spacing.xxl },
  emptyContainer: { flex: 1 },
  emptyContent: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 60,
    gap: Spacing.sm,
  },
  emptyTitle: {
    fontSize: Typography.body,
    color: Colors.textSecondary,
    textAlign: 'center',
  },

  // Game header
  gameHeader: {
    backgroundColor: Colors.white,
    padding: Spacing.lg,
    alignItems: 'center',
    borderBottomWidth: 0.5,
    borderBottomColor: Colors.border,
    marginBottom: Spacing.sm,
  },
  gameTitle: {
    fontSize: Typography.h4,
    fontWeight: '700',
    color: Colors.text,
    textAlign: 'center',
  },
  scoreRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: Spacing.xs,
  },
  scoreNum: {
    fontSize: Typography.h1,
    fontWeight: '800',
    color: Colors.primary,
    minWidth: 40,
    textAlign: 'center',
  },
  scoreSep: {
    fontSize: Typography.h3,
    color: Colors.textSecondary,
    paddingHorizontal: Spacing.sm,
  },
  gameInfo: {
    fontSize: Typography.caption,
    color: Colors.textSecondary,
    marginTop: Spacing.xs,
  },
  hintRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: Spacing.sm,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    backgroundColor: Colors.primaryLight,
    borderRadius: BorderRadius.sm,
  },
  hintText: {
    fontSize: Typography.tiny,
    color: Colors.textSecondary,
  },

  // AtBat card
  card: {
    backgroundColor: Colors.white,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    ...CardShadow,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  inningLabel: {
    fontSize: Typography.bodySmall,
    fontWeight: '700',
    color: Colors.text,
    minWidth: 48,
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

  playersRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  playerItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  playerName: {
    fontSize: Typography.bodySmall,
    fontWeight: '600',
    color: Colors.text,
  },
  playerNameSecondary: {
    fontSize: Typography.bodySmall,
    color: Colors.textSecondary,
  },
  vsText: {
    fontSize: Typography.tiny,
    color: Colors.textSecondary,
  },
  pitchCountText: {
    fontSize: Typography.caption,
    color: Colors.textSecondary,
    marginLeft: 'auto',
  },

  // Share button
  shareBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.xs,
    marginTop: Spacing.md,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    backgroundColor: Colors.primaryLight,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: Colors.primary + '40',
  },
  shareBtnDisabled: {
    opacity: 0.5,
  },
  shareBtnText: {
    fontSize: Typography.bodySmall,
    fontWeight: '600',
    color: Colors.primary,
  },
});
