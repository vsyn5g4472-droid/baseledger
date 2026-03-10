import React, { useEffect, useState, useCallback } from 'react';
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

// ── Helpers ───────────────────────────────────────────────────────────────────
function initials(name: string): string {
  // 日本語名は最後の1文字、英語名は頭文字2文字
  const parts = name.split(' ');
  if (parts.length >= 2 && /[a-zA-Z]/.test(name)) {
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }
  // 漢字名: 名字の最初の1文字
  return name.slice(0, 1);
}

function trendIcon(trend: FeaturedPlayer['trend']): {
  name: React.ComponentProps<typeof MaterialCommunityIcons>['name'];
  color: string;
} {
  if (trend === 'up')   return { name: 'trending-up',   color: Colors.primary };
  if (trend === 'down') return { name: 'trending-down',  color: '#E53935' };
  return                       { name: 'trending-neutral', color: Colors.textSecondary };
}

// ── Sub-component: Player Card ────────────────────────────────────────────────
interface CardProps {
  player: FeaturedPlayer;
  onPress: (player: FeaturedPlayer) => void;
}

function PlayerCard({ player, onPress }: CardProps) {
  const teamColor = TEAM_COLORS[player.teamCode] ?? Colors.primary;
  const { name: trendName, color: trendColor } = trendIcon(player.trend);

  return (
    <TouchableOpacity
      style={styles.card}
      onPress={() => onPress(player)}
      activeOpacity={0.82}
    >
      {/* Avatar */}
      <View style={[styles.avatar, { backgroundColor: teamColor }]}>
        <Text style={styles.avatarText}>{initials(player.name)}</Text>
        <View style={styles.numberBadge}>
          <Text style={styles.numberText}>#{player.number}</Text>
        </View>
      </View>

      {/* Info */}
      <View style={styles.cardBody}>
        <Text style={styles.playerName} numberOfLines={1}>{player.name}</Text>
        <Text style={styles.teamName} numberOfLines={1}>{player.team}</Text>
        <View style={styles.posRow}>
          <Text style={styles.posText}>{player.position}</Text>
        </View>
      </View>

      {/* Score + Trend */}
      <View style={styles.scoreBlock}>
        <Text style={[styles.scoreValue, { color: Colors.primary }]}>
          {player.attentionScore}
        </Text>
        <Text style={styles.scoreLabel}>注目度</Text>
        <MaterialCommunityIcons name={trendName} size={16} color={trendColor} />
      </View>

      {/* Stat highlight */}
      <View style={[styles.statChip, { backgroundColor: Colors.primaryLight }]}>
        <Text style={styles.statLabel}>{player.statLabel}</Text>
        <Text style={[styles.statValue, { color: Colors.primary }]}>{player.statValue}</Text>
      </View>
    </TouchableOpacity>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────
interface Props {
  onPlayerPress?: (player: FeaturedPlayer) => void;
  onViewMore?: () => void;
}

export default function FeaturedPlayers({ onPlayerPress, onViewMore }: Props) {
  const [players, setPlayers]   = useState<FeaturedPlayer[]>([]);
  const [loading, setLoading]   = useState(true);

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

  const handlePress = useCallback(
    (player: FeaturedPlayer) => {
      onPlayerPress?.(player);
    },
    [onPlayerPress],
  );

  return (
    <View style={styles.container}>
      {/* Section header */}
      <View style={styles.sectionHeader}>
        <MaterialCommunityIcons name="fire" size={18} color={Colors.accent} />
        <Text style={styles.sectionTitle}>注目選手ランキング</Text>
        {onViewMore ? (
          <TouchableOpacity onPress={onViewMore} style={styles.viewMoreBtn}>
            <Text style={styles.viewMoreText}>もっと見る</Text>
            <MaterialCommunityIcons name="chevron-right" size={14} color={Colors.primary} />
          </TouchableOpacity>
        ) : (
          <Text style={styles.sectionSub}>今週のトレンド</Text>
        )}
      </View>

      {loading ? (
        <View style={styles.loadingRow}>
          <ActivityIndicator color={Colors.primary} size="small" />
        </View>
      ) : (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
        >
          {players.map((p, idx) => (
            <View key={p.id} style={styles.cardWrapper}>
              {/* Rank badge */}
              <View style={[styles.rankBadge, idx < 3 && styles.rankBadgeTop]}>
                <Text style={[styles.rankText, idx < 3 && styles.rankTextTop]}>
                  {idx + 1}
                </Text>
              </View>
              <PlayerCard player={p} onPress={handlePress} />
            </View>
          ))}
        </ScrollView>
      )}
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const CARD_W = 160;

const styles = StyleSheet.create({
  container: {
    marginBottom: Spacing.md,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    gap: 6,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: Colors.text,
    flex: 1,
  },
  sectionSub: {
    fontSize: 11,
    color: Colors.textSecondary,
  },
  viewMoreBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  viewMoreText: {
    fontSize: 12,
    color: Colors.primary,
    fontWeight: '600',
  },
  loadingRow: {
    height: 60,
    justifyContent: 'center',
    alignItems: 'center',
  },
  scrollContent: {
    paddingHorizontal: Spacing.md,
    gap: Spacing.sm,
    paddingBottom: Spacing.xs,
  },
  cardWrapper: {
    width: CARD_W,
    position: 'relative',
  },
  rankBadge: {
    position: 'absolute',
    top: -6,
    left: 6,
    zIndex: 10,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rankBadgeTop: {
    backgroundColor: Colors.accent,
  },
  rankText: {
    fontSize: 10,
    fontWeight: '700',
    color: Colors.textSecondary,
  },
  rankTextTop: {
    color: 'white',
  },
  card: {
    width: CARD_W,
    backgroundColor: Colors.card,
    borderRadius: BorderRadius.lg,
    padding: Spacing.sm,
    // CardShadow preset
    shadowColor: '#000',
    shadowOpacity: 0.09,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
    gap: 6,
  },
  avatar: {
    width: '100%',
    height: 80,
    borderRadius: BorderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  avatarText: {
    fontSize: 28,
    fontWeight: '800',
    color: 'rgba(255,255,255,0.9)',
  },
  numberBadge: {
    position: 'absolute',
    bottom: 4,
    right: 6,
    backgroundColor: 'rgba(0,0,0,0.35)',
    borderRadius: 8,
    paddingHorizontal: 5,
    paddingVertical: 1,
  },
  numberText: {
    fontSize: 10,
    fontWeight: '600',
    color: 'white',
  },
  cardBody: {
    gap: 2,
  },
  playerName: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.text,
  },
  teamName: {
    fontSize: 10,
    color: Colors.textSecondary,
  },
  posRow: {
    flexDirection: 'row',
  },
  posText: {
    fontSize: 10,
    color: Colors.textSecondary,
    backgroundColor: Colors.surfaceGray,
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 4,
  },
  scoreBlock: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  scoreValue: {
    fontSize: 18,
    fontWeight: '800',
  },
  scoreLabel: {
    fontSize: 10,
    color: Colors.textSecondary,
    flex: 1,
  },
  statChip: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: BorderRadius.sm,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  statLabel: {
    fontSize: 10,
    color: Colors.textSecondary,
  },
  statValue: {
    fontSize: 12,
    fontWeight: '700',
  },
});
