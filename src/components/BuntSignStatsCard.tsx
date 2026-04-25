import React, { useMemo, useState, useEffect } from 'react';
import { View, StyleSheet, ActivityIndicator } from 'react-native';
import { Text, Divider } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { db } from '../db';
import type { GameState } from '../types/game';
import { aggregateBuntSignStats } from '../utils/buntSignAggregate';
import { Colors, Spacing, BorderRadius, Typography } from '../constants/theme';
import { UserPlan } from '../services/planService';

export default function BuntSignStatsCard({
  userPlan,
  filterBatterId,
}: {
  userPlan: UserPlan;
  filterBatterId?: string;
}) {
  const [games, setGames] = useState<GameState[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let ok = true;
    (async () => {
      try {
        const all = await db.games.getAll();
        const fin = all.filter((g) => g.phase === 'finished');
        if (ok) setGames(fin);
      } catch {
        if (ok) setGames([]);
      } finally {
        if (ok) setLoading(false);
      }
    })();
    return () => { ok = false; };
  }, []);

  const stats = useMemo(
    () => aggregateBuntSignStats(games, filterBatterId),
    [games, filterBatterId],
  );

  const showDetail = userPlan === UserPlan.LIGHT
    || userPlan === UserPlan.STANDARD
    || userPlan === UserPlan.PRO;

  if (loading) {
    return (
      <View style={styles.card}>
        <ActivityIndicator color={Colors.primary} />
      </View>
    );
  }

  if (stats.bunt.attempts === 0 && stats.sign.attempts === 0) {
    return null;
  }

  return (
    <View style={styles.card}>
      <View style={styles.titleRow}>
        <MaterialCommunityIcons name="chart-line" size={20} color={Colors.primary} />
        <Text style={styles.title}>バント & サイン</Text>
      </View>
      <View style={styles.row}>
        <View style={styles.cell}>
          <Text style={styles.k}>バント成功率</Text>
          <Text style={styles.v}>
            {stats.bunt.successes}/{stats.bunt.attempts}{' '}
            ({(stats.bunt.rate * 100).toFixed(1)}%)
          </Text>
        </View>
        <View style={styles.cell}>
          <Text style={styles.k}>サイン成功率</Text>
          <Text style={styles.v}>
            {stats.sign.successes}/{stats.sign.attempts}{' '}
            ({stats.sign.attempts > 0 ? (stats.sign.rate * 100).toFixed(1) : '0.0'}%)
          </Text>
        </View>
      </View>
      {showDetail && (
        <>
          <Divider style={styles.div} />
          <Text style={styles.sub}>内訳（回別・カウント別は次版）</Text>
          {Object.entries(stats.byBuntType)
            .filter(([, v]) => v.attempts > 0)
            .map(([k, { attempts, successes }]) => (
              <Text key={k} style={styles.detailLine}>
                {k}: {successes}/{attempts}
              </Text>
            ))}
          {Object.entries(stats.bySign)
            .filter(([, v]) => v.attempts > 0)
            .map(([k, { attempts, successes }]) => (
              <Text key={k} style={styles.detailLine}>
                {k}: {successes}/{attempts}
              </Text>
            ))}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.card,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    marginTop: Spacing.md,
  },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: Spacing.sm },
  title: { fontSize: Typography.body, fontWeight: '700', color: Colors.text },
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: 8 },
  cell: { flex: 1 },
  k: { fontSize: Typography.caption, color: Colors.textSecondary },
  v: { fontSize: Typography.body, fontWeight: '600', color: Colors.text, marginTop: 4 },
  sub: { fontSize: 11, color: Colors.textSecondary, marginTop: 4, marginBottom: 4 },
  detailLine: { fontSize: 11, color: Colors.textSecondary, fontFamily: 'monospace' },
  div: { marginVertical: Spacing.sm },
});
