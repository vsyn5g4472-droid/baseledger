import React, { useEffect, useState } from 'react';
import {
  View,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { Text } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import {
  getRankedPlayers,
  type FeaturedPlayer,
  TEAM_COLORS,
} from '../../services/rankingService';
import { Colors, Spacing, BorderRadius, Typography } from '../../constants/theme';

// ランク番号に応じたスタイルを返す
function rankStyle(idx: number): { numColor: string; numSize: number } {
  if (idx === 0) return { numColor: Colors.caution, numSize: 22 };
  if (idx === 1) return { numColor: Colors.textSecondary, numSize: 20 };
  if (idx === 2) return { numColor: '#9E7B4A', numSize: 18 };
  return { numColor: Colors.textDisabled, numSize: 16 };
}

function initials(name: string): string {
  const parts = name.split(' ');
  if (parts.length >= 2 && /[a-zA-Z]/.test(name)) {
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }
  return name.slice(0, 1);
}

// ── 選手カード ─────────────────────────────────────────────────────────────────
// 視線の流れ: 順位(何位?) → 選手名(誰?) → キースタット(何が凄い?)
// 削除した情報: 注目度スコア・トレンドアイコン・ポジション・チーム名
// 理由: この画面での意思決定に不要、詳細ページで確認できる
interface CardProps {
  player: FeaturedPlayer;
  rank: number;
  onPress: (player: FeaturedPlayer) => void;
}

function PlayerCard({ player, rank, onPress }: CardProps) {
  const teamColor = TEAM_COLORS[player.teamCode] ?? Colors.primary;
  const { numColor, numSize } = rankStyle(rank - 1);
  const isTop3 = rank <= 3;

  return (
    <TouchableOpacity
      style={[styles.card, isTop3 && styles.cardTop3]}
      onPress={() => onPress(player)}
      activeOpacity={0.8}
    >
      {/* 1. 順位 — 最初に目が行く最大要素 */}
      <Text style={[styles.rankNum, { color: numColor, fontSize: numSize }]}>
        {rank}
      </Text>

      {/* 2. 選手アイコン — チーム色で識別できる */}
      <View style={[styles.avatar, { backgroundColor: teamColor }]}>
        <Text style={styles.avatarText}>{initials(player.name)}</Text>
      </View>

      {/* 3. 選手名 */}
      <Text style={styles.playerName} numberOfLines={1} ellipsizeMode="tail">
        {player.name}
      </Text>

      {/* 4. キースタット — 最後に「なぜこの順位か」を補足する */}
      {player.statLabel ? (
        <View style={styles.statRow}>
          <Text style={styles.statLabel} numberOfLines={1}>{player.statLabel}</Text>
          <Text style={styles.statValue} numberOfLines={1}>{player.statValue ?? '–'}</Text>
        </View>
      ) : null}
    </TouchableOpacity>
  );
}

// ── メインコンポーネント ──────────────────────────────────────────────────────
interface Props {
  onPlayerPress?: (player: FeaturedPlayer) => void;
  onViewMore?: () => void;
}

export default function FeaturedPlayers({ onPlayerPress, onViewMore }: Props) {
  const [players, setPlayers] = useState<FeaturedPlayer[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    getRankedPlayers({ limit: 8 }).then((data) => {
      if (!cancelled) {
        setPlayers(data);
        setLoading(false);
      }
    });
    return () => { cancelled = true; };
  }, []);

  return (
    <View style={styles.container}>
      {/* セクションヘッダー */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>注目選手</Text>
        {onViewMore ? (
          <TouchableOpacity onPress={onViewMore} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Text style={styles.viewMoreText}>全員を見る</Text>
          </TouchableOpacity>
        ) : null}
      </View>

      {loading ? (
        <View style={styles.loadingRow}>
          <ActivityIndicator color={Colors.action} size="small" />
        </View>
      ) : players.length === 0 ? (
        <View style={styles.loadingRow}>
          <Text style={styles.emptyText}>データがありません</Text>
        </View>
      ) : (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
        >
          {players.map((p, idx) => (
            <PlayerCard
              key={p.id}
              player={p}
              rank={idx + 1}
              onPress={onPlayerPress ?? (() => {})}
            />
          ))}
        </ScrollView>
      )}
    </View>
  );
}

// ── スタイル ─────────────────────────────────────────────────────────────────
const CARD_W = 112;

const styles = StyleSheet.create({
  container: {
    marginBottom: Spacing.sm,
    backgroundColor: Colors.card,
    paddingBottom: Spacing.md,
    // フィードの投稿と区別するため下線で区切る
    borderBottomWidth: 6,
    borderBottomColor: Colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.sm,
  },
  headerTitle: {
    fontSize: Typography.bodySmall,
    fontWeight: '700',
    color: Colors.textSecondary,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  viewMoreText: {
    fontSize: Typography.caption,
    color: Colors.action,
    fontWeight: '600',
  },
  loadingRow: {
    height: 100,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyText: {
    fontSize: Typography.caption,
    color: Colors.textDisabled,
  },
  scrollContent: {
    paddingHorizontal: Spacing.md,
    gap: Spacing.xs,
  },
  // ── カード ────────────────────────────────────────────────────────────────
  card: {
    width: CARD_W,
    backgroundColor: Colors.surfaceGray,
    borderRadius: BorderRadius.lg,
    padding: Spacing.sm,
    alignItems: 'flex-start',
    gap: 6,
  },
  cardTop3: {
    // 1〜3位のみ白カード+影で視覚的に浮かせる
    backgroundColor: Colors.card,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  // 1. 順位番号 — 最大フォントで最初に視認させる
  rankNum: {
    fontWeight: '800',
    lineHeight: 24,
  },
  // 2. アバター — 小さく、チーム識別のみ
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontSize: 15,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.95)',
  },
  // 3. 選手名
  playerName: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.text,
    width: '100%',
  },
  // 4. キースタット
  statRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    marginTop: 2,
  },
  statLabel: {
    fontSize: 10,
    color: Colors.textSecondary,
    flexShrink: 1,
    marginRight: 4,
  },
  statValue: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.action,
    flexShrink: 0,
  },
});
