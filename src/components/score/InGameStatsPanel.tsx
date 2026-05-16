import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Modal,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { Colors, Spacing, Typography, BorderRadius } from '../../constants/theme';
import ZoneHeatmap from '../analysis/ZoneHeatmap';
import { usePlayerHistory } from '../../hooks/usePlayerHistory';
import type { BatteryProfile, BatterProfile } from '../../utils/analysisEngine';

interface Props {
  mode: 'pitcher' | 'batter';
  pitcherId?: string | null;
  catcherId?: string | null;
  batterId?: string | null;
  playerName: string;
  visible: boolean;
  onClose: () => void;
}

export default function InGameStatsPanel({
  mode,
  pitcherId = null,
  catcherId = null,
  batterId = null,
  playerName,
  visible,
  onClose,
}: Props) {
  const { pitcherProfile, batterProfile, notes, loading } = usePlayerHistory(
    mode === 'pitcher' ? pitcherId : null,
    mode === 'pitcher' ? catcherId : null,
    mode === 'batter'  ? batterId  : null,
  );

  const renderPitcher = (p: BatteryProfile) => (
    <>
      <View style={s.statRow}>
        <Stat label="総投球" value={`${p.totalPitches}球`} />
        <Stat label="ストライク率" value={`${Math.round(p.strikeRate * 100)}%`} />
        <Stat label="平均球速" value={p.avgVelocity ? `${p.avgVelocity}km/h` : '-'} />
        <Stat label="最速" value={p.maxVelocity ? `${p.maxVelocity}km/h` : '-'} />
      </View>

      <Text style={s.sectionLabel}>2ストライク時コース</Text>
      <View style={s.heatmapWrap}>
        <ZoneHeatmap heatData={p.zone2Strike} colorTheme="blue" compact />
      </View>

      {p.pitchType2Strike.length > 0 && (
        <>
          <Text style={s.sectionLabel}>2ストライク球種</Text>
          {p.pitchType2Strike.slice(0, 4).map((pt) => (
            <View key={pt.type} style={s.barRow}>
              <Text style={s.barLabel}>{pt.type}</Text>
              <View style={s.barTrack}>
                <View style={[s.barFill, { width: `${Math.round(pt.pct * 100)}%` as any }]} />
              </View>
              <Text style={s.barVal}>{Math.round(pt.pct * 100)}%</Text>
            </View>
          ))}
        </>
      )}

      {p.countTendencies.length > 0 && (
        <>
          <Text style={s.sectionLabel}>カウント別配球</Text>
          {p.countTendencies.slice(0, 4).map((ct) => {
            const top = ct.pitchTypes[0];
            const topZone = ct.topZones[0];
            return (
              <Text key={`${ct.balls}-${ct.strikes}`} style={s.countRow}>
                {ct.balls}B-{ct.strikes}S → {top?.type ?? '-'}
                {topZone ? ` / ゾーン${topZone.zone}` : ''}
              </Text>
            );
          })}
        </>
      )}
    </>
  );

  const renderBatter = (b: BatterProfile) => {
    const weakHeatData = Object.fromEntries(
      b.zoneStats.map((z) => [z.zone, Math.round(z.swingMissRate * 100)]),
    );
    return (
      <>
        <View style={s.statRow}>
          <Stat label="打率" value={b.avg.toFixed(3).replace(/^0/, '')} />
          <Stat label="三振率" value={`${Math.round(b.strikeoutRate * 100)}%`} />
          <Stat label="四球率" value={`${Math.round(b.walkRate * 100)}%`} />
          <Stat label="平均飛距離" value={b.avgHitDistance ? `${b.avgHitDistance}m` : '-'} />
        </View>

        <Text style={s.sectionLabel}>苦手コース（空振り率）</Text>
        <View style={s.heatmapWrap}>
          <ZoneHeatmap heatData={weakHeatData} colorTheme="red" compact />
        </View>

        {b.weakZones.length > 0 && (
          <>
            <Text style={s.sectionLabel}>苦手コース TOP3</Text>
            {b.weakZones.map((z) => (
              <Text key={z.zone} style={s.countRow}>
                ゾーン{z.zone}　空振り率 {Math.round(z.swingMissRate * 100)}%
              </Text>
            ))}
          </>
        )}

        {b.pitchTypeStats.length > 0 && (
          <>
            <Text style={s.sectionLabel}>球種別成績</Text>
            {b.pitchTypeStats.slice(0, 4).map((pt) => (
              <View key={pt.type} style={s.barRow}>
                <Text style={s.barLabel}>{pt.type}</Text>
                <Text style={s.barVal}>空振 {Math.round(pt.swingMissRate * 100)}%</Text>
              </View>
            ))}
          </>
        )}
      </>
    );
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={s.overlay}>
        <View style={s.panel}>
          <View style={s.header}>
            <Text style={s.title}>{playerName} の過去成績</Text>
            <TouchableOpacity onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Text style={s.closeBtn}>✕</Text>
            </TouchableOpacity>
          </View>

          <ScrollView contentContainerStyle={s.body}>
            {loading ? (
              <ActivityIndicator color={Colors.primary} style={{ marginTop: 40 }} />
            ) : (
              <>
                {mode === 'pitcher' && (
                  pitcherProfile
                    ? renderPitcher(pitcherProfile)
                    : <Text style={s.empty}>過去データなし</Text>
                )}
                {mode === 'batter' && (
                  batterProfile
                    ? renderBatter(batterProfile)
                    : <Text style={s.empty}>過去データなし</Text>
                )}
                {notes.length > 0 && (
                  <>
                    <Text style={s.sectionLabel}>メモ</Text>
                    {notes.map((n, i) => (
                      <Text key={i} style={s.noteText}>• {n}</Text>
                    ))}
                  </>
                )}
              </>
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={s.statCell}>
      <Text style={s.statLabel}>{label}</Text>
      <Text style={s.statValue}>{value}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  panel: {
    backgroundColor: Colors.card,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    maxHeight: '80%',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  title: {
    fontSize: Typography.body,
    fontWeight: '700',
    color: Colors.text,
  },
  closeBtn: {
    fontSize: 18,
    color: Colors.textSecondary,
    paddingHorizontal: 4,
  },
  body: {
    padding: Spacing.md,
    gap: Spacing.sm,
    paddingBottom: 40,
  },
  sectionLabel: {
    fontSize: Typography.caption,
    color: Colors.textSecondary,
    marginTop: Spacing.sm,
    marginBottom: 4,
  },
  heatmapWrap: {
    alignItems: 'center',
  },
  statRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: 4,
  },
  statCell: {
    alignItems: 'center',
    minWidth: 70,
  },
  statLabel: {
    fontSize: 10,
    color: Colors.textSecondary,
  },
  statValue: {
    fontSize: Typography.body,
    fontWeight: '700',
    color: Colors.primary,
  },
  barRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 2,
  },
  barLabel: {
    fontSize: 11,
    color: Colors.text,
    width: 72,
  },
  barTrack: {
    flex: 1,
    height: 6,
    backgroundColor: Colors.border,
    borderRadius: 3,
    overflow: 'hidden',
  },
  barFill: {
    height: 6,
    backgroundColor: Colors.primary,
    borderRadius: 3,
  },
  barVal: {
    fontSize: 11,
    color: Colors.textSecondary,
    width: 36,
    textAlign: 'right',
  },
  countRow: {
    fontSize: 12,
    color: Colors.text,
    paddingVertical: 2,
  },
  noteText: {
    fontSize: 12,
    color: Colors.text,
    paddingVertical: 2,
  },
  empty: {
    fontSize: 13,
    color: Colors.textSecondary,
    textAlign: 'center',
    marginTop: 24,
    marginBottom: 24,
  },
});
