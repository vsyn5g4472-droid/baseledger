import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Colors, Spacing, Typography, BorderRadius } from '../../src/constants/theme';
import { useAuth } from '../../src/contexts/AuthContext';
import { getUserSpotAtBats } from '../../src/services/spotAtBatService';
import type { SpotAtBat } from '../../src/models/types';

const RESULT_LABELS: Partial<Record<string, string>> = {
  single: '単打', double: '二塁打', triple: '三塁打', home_run: '本塁打',
  strikeout: '三振', strikeout_looking: '見三振', walk: '四球',
  hit_by_pitch: '死球', groundout: 'ゴロ', flyout: 'フライ',
  lineout: 'ライナー', sacrifice_bunt: '犠打', sacrifice_fly: '犠飛',
  error: 'エラー', double_play: '併殺',
};

const HIT_RESULTS = new Set(['single', 'double', 'triple', 'home_run']);

const RESULT_COLORS: Partial<Record<string, string>> = {
  single: '#43A047', double: '#2E7D32', triple: '#1B5E20', home_run: '#FFB300',
  strikeout: '#E53935', strikeout_looking: '#C62828',
};

function formatDate(ts: { toDate: () => Date }): string {
  const d = ts.toDate();
  return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`;
}

function SpotCard({ item }: { item: SpotAtBat }) {
  const isHit = HIT_RESULTS.has(item.result);
  const resultColor = RESULT_COLORS[item.result] ?? Colors.textSecondary;
  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <Text style={styles.dateText}>{formatDate(item.gameDate)}</Text>
        {item.opponent && <Text style={styles.opponentText}>vs {item.opponent}</Text>}
      </View>
      <View style={styles.cardBody}>
        <Text style={styles.playerName}>{item.playerName}</Text>
        <Text style={styles.vsText}>vs</Text>
        <Text style={styles.pitcherName}>{item.pitcherName || '—'}</Text>
      </View>
      <View style={styles.cardFooter}>
        <Text style={styles.pitchCount}>{item.pitches.length}球</Text>
        <View style={[styles.resultBadge, { backgroundColor: isHit ? resultColor + '22' : Colors.surfaceGray }]}>
          <Text style={[styles.resultText, { color: resultColor }]}>
            {RESULT_LABELS[item.result] ?? item.result}
          </Text>
        </View>
      </View>
    </View>
  );
}

export default function SpotHistoryScreen() {
  const { currentUser } = useAuth();
  const [records, setRecords]       = useState<SpotAtBat[]>([]);
  const [loading, setLoading]       = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!currentUser) {
      setLoading(false);
      return;
    }
    const data = await getUserSpotAtBats(currentUser.uid);
    setRecords(data);
  }, [currentUser]);

  useEffect(() => {
    load().finally(() => setLoading(false));
  }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={Colors.primary} />
      </View>
    );
  }

  return (
    <>
      <FlatList
        data={records}
        keyExtractor={(item) => item.id}
        contentContainerStyle={records.length === 0 ? styles.emptyContainer : styles.list}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />
        }
        renderItem={({ item }) => <SpotCard item={item} />}
        ListEmptyComponent={
          <View style={styles.emptyContent}>
            <MaterialCommunityIcons name="baseball-bat" size={48} color={Colors.border} />
            <Text style={styles.emptyTitle}>スポット打席記録がありません</Text>
            <Text style={styles.emptySub}>記録画面からスポット打席を追加できます</Text>
          </View>
        }
      />
    </>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.background },
  list:   { padding: Spacing.md, gap: Spacing.sm },
  emptyContainer: { flex: 1 },
  emptyContent: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    paddingTop: 100, gap: Spacing.sm,
  },
  emptyTitle: { fontSize: Typography.h4, fontWeight: '600', color: Colors.text },
  emptySub:   { fontSize: Typography.bodySmall, color: Colors.textSecondary },

  card: {
    backgroundColor: Colors.card,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 1,
    shadowOffset: { width: 0, height: 1 },
  },
  cardHeader:   { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  dateText:     { fontSize: Typography.caption, color: Colors.textSecondary },
  opponentText: { fontSize: Typography.caption, color: Colors.textSecondary },
  cardBody:     { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginBottom: 6 },
  playerName:   { fontSize: Typography.body, fontWeight: '700', color: Colors.text },
  vsText:       { fontSize: Typography.caption, color: Colors.textDisabled },
  pitcherName:  { fontSize: Typography.bodySmall, color: Colors.textSecondary },
  cardFooter: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingTop: 6, borderTopWidth: 0.5, borderTopColor: Colors.border,
  },
  pitchCount:  { fontSize: Typography.caption, color: Colors.textDisabled },
  resultBadge: { paddingHorizontal: Spacing.sm, paddingVertical: 3, borderRadius: BorderRadius.sm },
  resultText:  { fontSize: Typography.caption, fontWeight: '700' },
});
