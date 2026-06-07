import React, { useEffect, useRef } from 'react';
import { View, StyleSheet, ScrollView, Text } from 'react-native';
import type { PitchLog, PitchResult, Player } from '../../types/game';
import { useI18n } from '../../i18n';
import { Colors, Spacing, Typography, BorderRadius } from '../../constants/theme';

const CIRCLED_NUMBERS = [
  '①', '②', '③', '④', '⑤', '⑥', '⑦', '⑧', '⑨', '⑩',
  '⑪', '⑫', '⑬', '⑭', '⑮', '⑯', '⑰', '⑱', '⑲', '⑳',
];

const PITCH_RESULT_COLORS: Record<PitchResult, string> = {
  ball:            '#B0BEC5',
  strike_called:   '#FFD700',
  strike_swinging: '#FF9800',
  foul:            '#4DD0E1',
  foul_tip:        '#4DD0E1',
  in_play:         '#66BB6A',
  hit_by_pitch:    '#B0BEC5',
};

function formatBats(bats: Player['bats']): string {
  if (bats === 'L') return '左打';
  if (bats === 'S') return '両打';
  return '右打';
}

function formatThrows(throwsHand: Player['throws']): string {
  return throwsHand === 'L' ? '左投' : '右投';
}

function formatPlayerLine(player: Player, handLabel: string): string {
  const num = player.number != null ? `#${player.number} ` : '';
  return `${num}${player.name}　${handLabel}`;
}

interface CurrentAtBatPitchLogProps {
  batter: Player;
  pitcher: Player;
  pitches: PitchLog[];
}

export default function CurrentAtBatPitchLog({
  batter,
  pitcher,
  pitches,
}: CurrentAtBatPitchLogProps) {
  const { t } = useI18n();
  const scrollRef = useRef<ScrollView>(null);

  useEffect(() => {
    if (pitches.length === 0) return;
    const timer = setTimeout(() => {
      scrollRef.current?.scrollToEnd({ animated: true });
    }, 50);
    return () => clearTimeout(timer);
  }, [pitches.length]);

  const pitchTypeLabels = t.pitchTypes as Record<string, string>;
  const pitchResultLabels = t.pitchResults as Record<string, string>;

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <View style={styles.playerBlock}>
          <Text style={styles.roleLabel}>打者</Text>
          <Text style={styles.playerName} numberOfLines={1}>
            {formatPlayerLine(batter, formatBats(batter.bats))}
          </Text>
        </View>
        <View style={[styles.playerBlock, styles.playerBlockRight]}>
          <Text style={styles.roleLabel}>投手</Text>
          <Text style={styles.playerName} numberOfLines={1}>
            {formatPlayerLine(pitcher, formatThrows(pitcher.throws))}
          </Text>
        </View>
      </View>

      {pitches.length === 0 ? (
        <Text style={styles.emptyText}>投球記録なし</Text>
      ) : (
        <ScrollView
          ref={scrollRef}
          style={styles.pitchScroll}
          contentContainerStyle={styles.pitchScrollContent}
          showsVerticalScrollIndicator={false}
          nestedScrollEnabled
        >
          {pitches.map((pitch, index) => {
            const num = CIRCLED_NUMBERS[index] ?? `${index + 1}`;
            const typeLabel = pitchTypeLabels[pitch.pitchType] ?? pitch.pitchType;
            const resultLabel = (pitchResultLabels[pitch.result] ?? pitch.result).replace(/\n/g, ' ');
            const veloPart = pitch.velocity != null ? `${pitch.velocity}km/h ` : '';
            const color = PITCH_RESULT_COLORS[pitch.result] ?? Colors.white;

            return (
              <View key={pitch.id} style={styles.pitchRow}>
                <View style={styles.pitchNumBadge}>
                  <Text style={styles.pitchNumText}>{num}</Text>
                </View>
                <Text style={[styles.pitchLine, { color }]}>
                  {veloPart}{typeLabel} {resultLabel}
                </Text>
              </View>
            );
          })}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#121212',
    borderRadius: BorderRadius.md,
    padding: Spacing.sm,
    marginHorizontal: Spacing.sm,
    marginBottom: Spacing.sm,
    borderWidth: 1,
    borderColor: '#2A2A2A',
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: Spacing.sm,
    marginBottom: Spacing.xs,
    paddingBottom: Spacing.xs,
    borderBottomWidth: 1,
    borderBottomColor: '#2A2A2A',
  },
  playerBlock: {
    flex: 1,
  },
  playerBlockRight: {
    alignItems: 'flex-end',
  },
  roleLabel: {
    fontSize: Typography.tiny,
    color: '#9E9E9E',
    fontWeight: '600',
    marginBottom: 2,
  },
  playerName: {
    fontSize: Typography.bodySmall,
    color: Colors.white,
    fontWeight: '700',
  },
  emptyText: {
    fontSize: Typography.caption,
    color: '#757575',
    textAlign: 'center',
    paddingVertical: Spacing.sm,
  },
  pitchScroll: {
    maxHeight: 120,
  },
  pitchScrollContent: {
    paddingVertical: 2,
  },
  pitchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 6,
  },
  pitchNumBadge: {
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 1.5,
    borderColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  pitchNumText: {
    fontSize: 13,
    color: Colors.white,
    fontWeight: '700',
  },
  pitchLine: {
    flex: 1,
    fontSize: Typography.bodySmall,
    fontWeight: '600',
  },
});
