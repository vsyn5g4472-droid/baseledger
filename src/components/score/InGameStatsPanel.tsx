import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { SegmentedButtons } from 'react-native-paper';
import { Colors, Spacing, Typography, BorderRadius } from '../../constants/theme';
import ZoneHeatmap from '../analysis/ZoneHeatmap';
import { usePlayerHistory } from '../../hooks/usePlayerHistory';
import { usePlanGate } from '../../hooks/usePlanGate';
import { generateAIPrediction, type AIPrediction } from '../../services/aiReportService';
import type { BatteryProfile, BatterProfile } from '../../utils/analysisEngine';

interface Props {
  mode: 'pitcher' | 'batter';
  pitcherId?: string | null;
  catcherId?: string | null;
  batterId?: string | null;
  playerName: string;
  visible: boolean;
  onClose: () => void;
  atBatId?: string;
  count?: { balls: number; strikes: number };
  outs?: number;
  runners?: { first: boolean; second: boolean; third: boolean };
}

export default function InGameStatsPanel({
  mode,
  pitcherId = null,
  catcherId = null,
  batterId = null,
  playerName,
  visible,
  onClose,
  atBatId,
  count,
  outs,
  runners,
}: Props) {
  const { pitcherProfile, batterProfile, notes, loading } = usePlayerHistory(
    mode === 'pitcher' ? pitcherId : null,
    mode === 'pitcher' ? catcherId : null,
    mode === 'batter'  ? batterId  : null,
  );

  const gate = usePlanGate('ai_prediction');
  const [tab, setTab] = useState<'stats' | 'ai'>('stats');
  const [batterHand, setBatterHand] = useState<'R' | 'L'>('R');
  const [prediction, setPrediction] = useState<AIPrediction | null>(null);
  const [predLoading, setPredLoading] = useState(false);
  const countRef = useRef(count);
  const outsRef = useRef(outs);
  const runnersRef = useRef(runners);

  // 打席が変わったら予測キャッシュをリセット
  useEffect(() => {
    setPrediction(null);
    setPredLoading(false);
  }, [atBatId]);

  // AI タブを開いたとき（未取得かつプロファイルあり）に取得
  useEffect(() => {
    countRef.current = count;
    outsRef.current = outs;
    runnersRef.current = runners;
  });

  useEffect(() => {
    if (tab !== 'ai' || !visible || !gate.allowed || predLoading || prediction !== null) return;
    const profile = mode === 'pitcher' ? pitcherProfile : batterProfile;
    if (!profile || loading) return;

    let cancelled = false;
    setPredLoading(true);
    generateAIPrediction(
      mode,
      profile,
      mode === 'pitcher'
        ? { count: countRef.current, outs: outsRef.current, runners: runnersRef.current }
        : undefined,
    ).then((result) => {
      if (!cancelled) {
        setPrediction(result);
        setPredLoading(false);
      }
    });
    return () => { cancelled = true; };
  }, [tab, visible, gate.allowed, prediction, predLoading, mode, pitcherProfile, batterProfile, loading]);

  const renderPitcher = (p: BatteryProfile) => (
    <>
      <View style={s.statRow}>
        <Stat label="総投球" value={`${p.totalPitches}球`} />
        <Stat label="ストライク率" value={`${Math.round(p.strikeRate * 100)}%`} />
        <Stat label="平均球速" value={p.avgVelocity ? `${p.avgVelocity}km/h` : '-'} />
        <Stat label="最速" value={p.maxVelocity ? `${p.maxVelocity}km/h` : '-'} />
      </View>

      <Text style={s.sectionLabel}>2ストライク時コース</Text>
      <SegmentedButtons
        value={batterHand}
        onValueChange={(v) => setBatterHand(v as 'R' | 'L')}
        buttons={[
          { value: 'R', label: '対右打ち' },
          { value: 'L', label: '対左打ち' },
        ]}
        style={s.handToggle}
      />
      <View style={s.heatmapWrap}>
        <ZoneHeatmap
          heatData={batterHand === 'R' ? p.zone2StrikeR : p.zone2StrikeL}
          colorTheme="blue"
          compact
        />
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

  const renderAIPrediction = () => {
    if (!gate.allowed) {
      return (
        <View style={s.proGate}>
          <Text style={s.proGateTitle}>PRO プラン限定</Text>
          <Text style={s.proGateText}>
            AI 試合予測は PRO プランでご利用いただけます。
          </Text>
        </View>
      );
    }

    const profile = mode === 'pitcher' ? pitcherProfile : batterProfile;
    if (!profile && !loading) {
      return <Text style={s.empty}>過去データがないため予測できません</Text>;
    }

    if (predLoading || loading) {
      return <ActivityIndicator color={Colors.primary} style={{ marginTop: 40 }} />;
    }

    if (!prediction) return null;

    if (prediction.errorReason) {
      return <Text style={s.empty}>予測の取得に失敗しました。再度お試しください。</Text>;
    }

    return (
      <View style={s.predBody}>
        {mode === 'pitcher' ? (
          <>
            <PredRow label="推奨球種" value={prediction.pitchType ?? '-'} />
            <PredRow label="推奨コース" value={prediction.zone ?? '-'} />
          </>
        ) : (
          <>
            <PredRow label="打球方向" value={prediction.hitDirection ?? '-'} />
            <PredRow label="飛距離" value={
              prediction.distance === 'short' ? '短距離' :
              prediction.distance === 'long'  ? '長距離' : '中距離'
            } />
          </>
        )}
        <ConfidenceBadge value={prediction.confidence} />
        <Text style={s.reasoning}>{prediction.reasoning}</Text>
      </View>
    );
  };

  if (!visible) return null;

  return (
    <View style={s.container}>
      <View style={s.header}>
        <Text style={s.title}>{playerName} の過去成績</Text>
        <TouchableOpacity onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Text style={s.closeBtn}>✕</Text>
        </TouchableOpacity>
      </View>

      <SegmentedButtons
        value={tab}
        onValueChange={(v) => setTab(v as 'stats' | 'ai')}
        buttons={[
          { value: 'stats', label: '成績' },
          { value: 'ai',    label: 'AI 予測' },
        ]}
        style={s.tabBar}
      />

      <ScrollView contentContainerStyle={s.body}>
        {tab === 'stats' ? (
          loading ? (
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
          )
        ) : (
          renderAIPrediction()
        )}
      </ScrollView>
    </View>
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

function PredRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={s.predRow}>
      <Text style={s.predLabel}>{label}</Text>
      <Text style={s.predValue}>{value}</Text>
    </View>
  );
}

function ConfidenceBadge({ value }: { value: string }) {
  const label = value === 'high' ? '確信度: 高' : value === 'low' ? '確信度: 低' : '確信度: 中';
  const color = value === 'high' ? Colors.primary : value === 'low' ? Colors.textSecondary : Colors.secondary;
  return (
    <View style={[s.badge, { borderColor: color }]}>
      <Text style={[s.badgeText, { color }]}>{label}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.card,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingTop: 52,
    paddingBottom: Spacing.md,
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
  tabBar: {
    marginHorizontal: Spacing.md,
    marginTop: Spacing.sm,
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
  handToggle: {
    marginBottom: Spacing.xs,
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
  predBody: {
    gap: Spacing.sm,
  },
  predRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: Spacing.xs,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  predLabel: {
    fontSize: Typography.caption,
    color: Colors.textSecondary,
  },
  predValue: {
    fontSize: Typography.body,
    fontWeight: '700',
    color: Colors.text,
  },
  badge: {
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderRadius: BorderRadius.full,
    paddingHorizontal: 10,
    paddingVertical: 3,
    marginTop: Spacing.xs,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '600',
  },
  reasoning: {
    fontSize: Typography.caption,
    color: Colors.textSecondary,
    lineHeight: 18,
    marginTop: Spacing.xs,
  },
  proGate: {
    alignItems: 'center',
    paddingVertical: 32,
    gap: Spacing.sm,
  },
  proGateTitle: {
    fontSize: Typography.body,
    fontWeight: '700',
    color: Colors.text,
  },
  proGateText: {
    fontSize: Typography.caption,
    color: Colors.textSecondary,
    textAlign: 'center',
    paddingHorizontal: Spacing.lg,
  },
});
