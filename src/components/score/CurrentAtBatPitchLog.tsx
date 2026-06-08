import React from 'react';
import { View, StyleSheet, ScrollView, Text } from 'react-native';
import type { AtBatResult, BattedBall, FieldingRecord, PitchLog, Player } from '../../types/game';
import { useI18n } from '../../i18n';
import { Colors, Spacing, Typography, BorderRadius } from '../../constants/theme';
import { colorForTone, formatPitchDisplay } from '../../utils/pitchDisplay';

const CIRCLED_NUMBERS = [
  '①', '②', '③', '④', '⑤', '⑥', '⑦', '⑧', '⑨', '⑩',
  '⑪', '⑫', '⑬', '⑭', '⑮', '⑯', '⑰', '⑱', '⑲', '⑳',
];

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
  pendingResult?: AtBatResult | null;
  battedBall?: BattedBall;
  fielding?: FieldingRecord;
}

export default function CurrentAtBatPitchLog({
  batter,
  pitcher,
  pitches,
  pendingResult,
  battedBall,
  fielding,
}: CurrentAtBatPitchLogProps) {
  const { t } = useI18n();

  const pitchTypeLabels = t.pitchTypes as Record<string, string>;
  const pitchResultLabels = t.pitchResults as Record<string, string>;

  const lastInPlayId = [...pitches].reverse().find((p) => p.result === 'in_play')?.id;
  const displayPitches = [...pitches].reverse();

  return (
    <View style={styles.container}>
      <Text style={styles.sectionTitle}>投球ログ</Text>
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
          style={styles.pitchScroll}
          contentContainerStyle={styles.pitchScrollContent}
          showsVerticalScrollIndicator={false}
          nestedScrollEnabled
        >
          {displayPitches.map((pitch, index) => {
            const pitchNumber = pitches.length - index;
            const num = CIRCLED_NUMBERS[pitchNumber - 1] ?? `${pitchNumber}`;
            const typeLabel = pitchTypeLabels[pitch.pitchType] ?? pitch.pitchType;
            const display = formatPitchDisplay(pitch, typeLabel, pitchResultLabels, {
              atBatResult: pendingResult,
              battedBall,
              fielding,
              isLastInPlay: pitch.id === lastInPlayId,
            });
            const resultColor = colorForTone(display.tone);

            return (
              <View key={pitch.id} style={styles.pitchRow}>
                <View style={styles.pitchNumBadge}>
                  <Text style={styles.pitchNumText}>{num}</Text>
                </View>
                <Text style={styles.pitchLine} numberOfLines={1}>
                  <Text style={styles.pitchPrefix}>
                    {display.prefix}
                    {display.prefix ? ' ' : ''}
                  </Text>
                  <Text style={[styles.pitchResult, { color: resultColor }]}>
                    {display.result}
                  </Text>
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
    backgroundColor: Colors.card,
    borderRadius: BorderRadius.md,
    padding: Spacing.sm,
    marginHorizontal: Spacing.sm,
    marginTop: Spacing.sm,
    marginBottom: Spacing.sm,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  sectionTitle: {
    fontSize: Typography.caption,
    fontWeight: '800',
    color: Colors.primary,
    letterSpacing: 0.5,
    marginBottom: Spacing.xs,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: Spacing.sm,
    marginBottom: Spacing.xs,
    paddingBottom: Spacing.xs,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  playerBlock: {
    flex: 1,
  },
  playerBlockRight: {
    alignItems: 'flex-end',
  },
  roleLabel: {
    fontSize: Typography.tiny,
    color: Colors.textSecondary,
    fontWeight: '600',
    marginBottom: 2,
  },
  playerName: {
    fontSize: Typography.bodySmall,
    color: Colors.text,
    fontWeight: '700',
  },
  emptyText: {
    fontSize: Typography.caption,
    color: Colors.textSecondary,
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
    borderColor: Colors.border,
    backgroundColor: Colors.surfaceGray,
    justifyContent: 'center',
    alignItems: 'center',
  },
  pitchNumText: {
    fontSize: 13,
    color: Colors.text,
    fontWeight: '700',
  },
  pitchLine: {
    flex: 1,
    fontSize: Typography.bodySmall,
    fontWeight: '600',
  },
  pitchPrefix: {
    color: Colors.text,
    fontWeight: '600',
  },
  pitchResult: {
    fontWeight: '700',
  },
});
