import React, { useMemo, useState } from 'react';
import { View, StyleSheet, TouchableOpacity, FlatList } from 'react-native';
import { Text } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Colors, Spacing, Typography, BorderRadius } from '../../constants/theme';
import { useI18n } from '../../i18n';
import type { AtBatLog, SubstitutionLog, Team } from '../../types/game';

interface PlayLogListProps {
  logs: AtBatLog[];
  awayTeam: Team;
  homeTeam: Team;
  substitutionLogs?: SubstitutionLog[];
  onEdit: (logId: string) => void;
}

function offenseSide(log: AtBatLog): 'away' | 'home' {
  return log.inning.half === 'top' ? 'away' : 'home';
}

/** 交代ログを逆適用して試合開始時の打順を復元 */
function initialLineupIds(team: Team, subs: SubstitutionLog[]): string[] {
  const lineup = team.roster.starters.map((p) => p.id);
  for (const sub of [...subs].reverse()) {
    const idx = lineup.findIndex((id) => id === sub.playerInId);
    if (idx !== -1) lineup[idx] = sub.playerOutId;
  }
  return lineup;
}

function subsBeforeLog(log: AtBatLog, subs: SubstitutionLog[]): SubstitutionLog[] {
  return subs.filter((sub) => {
    if (sub.side !== offenseSide(log)) return false;
    if (sub.inning.number < log.inning.number) return true;
    if (sub.inning.number > log.inning.number) return false;
    if (sub.inning.half !== log.inning.half) {
      return sub.inning.half === 'top' && log.inning.half === 'bottom';
    }
    return sub.timestamp < log.timestamp;
  });
}

function lineupAtLog(
  log: AtBatLog,
  team: Team,
  subs: SubstitutionLog[],
): string[] {
  const lineup = initialLineupIds(team, subs.filter((s) => s.side === offenseSide(log)));
  for (const sub of subsBeforeLog(log, subs)) {
    const idx = lineup.findIndex((id) => id === sub.playerOutId);
    if (idx !== -1) lineup[idx] = sub.playerInId;
  }
  return lineup;
}

function findPlayerName(team: Team, playerId: string): string {
  const all = [...team.roster.starters, ...team.roster.bench];
  if (team.roster.pitcher) all.push(team.roster.pitcher);
  return all.find((p) => p.id === playerId)?.name ?? '不明';
}

function buildBatterLabels(
  logs: AtBatLog[],
  awayTeam: Team,
  homeTeam: Team,
  substitutionLogs: SubstitutionLog[],
): Map<string, { order: number | null; name: string }> {
  const map = new Map<string, { order: number | null; name: string }>();
  for (const log of logs) {
    const side = offenseSide(log);
    const team = side === 'away' ? awayTeam : homeTeam;
    const lineup = lineupAtLog(log, team, substitutionLogs);
    const slot = lineup.findIndex((id) => id === log.batterId);
    map.set(log.id, {
      order: slot >= 0 ? slot + 1 : null,
      name: findPlayerName(team, log.batterId),
    });
  }
  return map;
}

export default function PlayLogList({
  logs,
  awayTeam,
  homeTeam,
  substitutionLogs = [],
  onEdit,
}: PlayLogListProps) {
  const { t } = useI18n();
  const [expanded, setExpanded] = useState(false);

  const batterLabels = useMemo(
    () => buildBatterLabels(logs, awayTeam, homeTeam, substitutionLogs),
    [logs, awayTeam, homeTeam, substitutionLogs],
  );

  if (logs.length === 0) return null;

  const renderItem = ({ item }: { item: AtBatLog }) => {
    const halfLabel = item.inning.half === 'top' ? t.common.top : t.common.bottom;
    const inningStr = `${item.inning.number}${halfLabel}`;
    const resultLabel = item.result
      ? (t.atBatResults as Record<string, string>)[item.result] ?? item.result
      : '—';
    const pitchCount = item.pitches.length;
    const fieldingStr = item.fielding
      ? item.fielding.fielders.join('-')
      : '';
    const batter = batterLabels.get(item.id);
    const batterLine = batter?.order
      ? `${batter.order}番 ${batter.name}`
      : batter?.name ?? '不明';

    const detailParts = [`${resultLabel} / ${pitchCount}${t.playLog.pitches}`];
    if (fieldingStr) detailParts.push(fieldingStr);
    if (item.rbiCount > 0) detailParts.push(`${item.rbiCount}${t.playLog.rbi}`);

    return (
      <View style={styles.card}>
        <View style={styles.cardMain}>
          <View style={styles.cardLeft}>
            <Text style={styles.inningBadge}>{inningStr}</Text>
          </View>
          <View style={styles.cardCenter}>
            <Text style={styles.batterText} numberOfLines={1}>
              {batterLine}
            </Text>
            <Text style={styles.detailText} numberOfLines={1}>
              {detailParts.join(' / ')}
            </Text>
          </View>
          <TouchableOpacity
            style={styles.editBtn}
            onPress={() => onEdit(item.id)}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <MaterialCommunityIcons name="pencil" size={16} color="#FFD700" />
          </TouchableOpacity>
        </View>
        {!!item.note && (
          <View style={styles.noteRow}>
            <MaterialCommunityIcons name="note-text-outline" size={12} color={Colors.textSecondary} style={styles.noteIcon} />
            <Text style={styles.noteText} numberOfLines={2}>{item.note}</Text>
          </View>
        )}
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <TouchableOpacity
        style={styles.headerRow}
        onPress={() => setExpanded((v) => !v)}
        activeOpacity={0.7}
      >
        <Text style={styles.title}>{t.playLog.title}</Text>
        <View style={styles.headerRight}>
          <Text style={styles.countBadge}>{logs.length}件</Text>
          <MaterialCommunityIcons
            name={expanded ? 'chevron-up' : 'chevron-down'}
            size={20}
            color={Colors.primary}
          />
        </View>
      </TouchableOpacity>
      {expanded && (
        <FlatList
          data={[...logs].reverse()}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          scrollEnabled={false}
        />
      )}
    </View>
  );
}

const ACCENT = Colors.accent;   // '#FFD700'

const styles = StyleSheet.create({
  container: {
    marginTop: Spacing.md,
    paddingHorizontal: Spacing.sm,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.xs,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  countBadge: {
    fontSize: Typography.tiny,
    fontWeight: '700',
    color: Colors.textSecondary,
  },
  title: {
    fontSize: Typography.bodySmall,
    fontWeight: '800',
    color: Colors.primary,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  card: {
    backgroundColor: Colors.card,
    borderRadius: BorderRadius.sm,
    borderLeftWidth: 3,
    borderLeftColor: Colors.accent,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingTop: 8,
    paddingBottom: 8,
    paddingHorizontal: 10,
    marginBottom: 6,
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 3,
    elevation: 1,
  },
  cardMain: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  cardLeft: {
    marginRight: 10,
  },
  inningBadge: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.white,
    backgroundColor: Colors.primary,       // ネイビーバッジ
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    overflow: 'hidden',
    textAlign: 'center',
    minWidth: 36,
  },
  cardCenter: {
    flex: 1,
  },
  batterText: {
    fontSize: Typography.bodySmall,
    fontWeight: '700',
    color: Colors.text,
  },
  detailText: {
    fontSize: 11,
    color: Colors.textSecondary,
    marginTop: 1,
  },
  editBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: Colors.accentSoft,
    borderWidth: 1,
    borderColor: Colors.accent,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 8,
  },
  noteRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginTop: 5,
    paddingTop: 5,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  noteIcon: {
    marginTop: 1,
    marginRight: 4,
  },
  noteText: {
    flex: 1,
    fontSize: 11,
    color: Colors.textSecondary,
    lineHeight: 16,
    fontStyle: 'italic',
  },
});
