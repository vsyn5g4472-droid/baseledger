import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  ActivityIndicator,
  TouchableOpacity,
  RefreshControl,
} from 'react-native';
import { Stack, router } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useAuth } from '../../src/contexts/AuthContext';
import { getUserSpotAtBats } from '../../src/services/spotAtBatService';
import type { SpotAtBat } from '../../src/models/types';
import { Colors, Spacing, Typography, BorderRadius } from '../../src/constants/theme';

interface BatterGroup {
  playerName: string;
  count: number;
}

function groupByBatter(records: SpotAtBat[]): BatterGroup[] {
  const map = new Map<string, number>();
  for (const r of records) {
    const name = r.playerName?.trim() || '名前未設定';
    map.set(name, (map.get(name) ?? 0) + 1);
  }
  return [...map.entries()]
    .map(([playerName, count]) => ({ playerName, count }))
    .sort((a, b) => b.count - a.count || a.playerName.localeCompare(b.playerName, 'ja'));
}

export default function SpotHistoryScreen() {
  const { currentUser } = useAuth();
  const [records, setRecords] = React.useState<SpotAtBat[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [refreshing, setRefreshing] = React.useState(false);

  const load = React.useCallback(async () => {
    if (!currentUser) {
      setLoading(false);
      return;
    }
    try {
      const data = await getUserSpotAtBats(currentUser.uid);
      setRecords(data);
    } catch (e) {
      console.error('SpotHistory load error:', e);
    } finally {
      setLoading(false);
    }
  }, [currentUser]);

  React.useEffect(() => {
    load();
  }, [load]);

  const batters = React.useMemo(() => groupByBatter(records), [records]);

  if (loading) {
    return (
      <View style={styles.center}>
        <Stack.Screen options={{ title: 'スポット打席分析' }} />
        <ActivityIndicator size="large" color={Colors.primary} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ title: 'スポット打席分析' }} />
      <FlatList
        data={batters}
        keyExtractor={(item) => item.playerName}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={async () => {
              setRefreshing(true);
              await load();
              setRefreshing(false);
            }}
          />
        }
        contentContainerStyle={batters.length === 0 ? styles.emptyContainer : styles.listContent}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={styles.card}
            activeOpacity={0.8}
            onPress={() =>
              router.push({
                pathname: '/analysis/spot-batter',
                params: { playerName: item.playerName },
              } as never)
            }
          >
            <View style={styles.cardMain}>
              <MaterialCommunityIcons name="account" size={22} color={Colors.primary} />
              <View style={styles.cardText}>
                <Text style={styles.playerName}>{item.playerName}</Text>
                <Text style={styles.countText}>{item.count}打席</Text>
              </View>
            </View>
            <MaterialCommunityIcons name="chevron-right" size={22} color={Colors.textSecondary} />
          </TouchableOpacity>
        )}
        ListEmptyComponent={
          <View style={styles.center}>
            <MaterialCommunityIcons name="database-off-outline" size={48} color={Colors.border} />
            <Text style={styles.emptyText}>スポット打席記録がありません</Text>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40, gap: Spacing.sm },
  emptyContainer: { flexGrow: 1 },
  listContent: { padding: Spacing.sm, paddingBottom: Spacing.lg },
  emptyText: { fontSize: Typography.body, color: Colors.textSecondary, textAlign: 'center' },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: Colors.card,
    marginBottom: Spacing.sm,
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  cardMain: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    flex: 1,
  },
  cardText: { flex: 1 },
  playerName: { fontSize: Typography.body, fontWeight: '700', color: Colors.text },
  countText: { fontSize: Typography.bodySmall, color: Colors.textSecondary, marginTop: 2 },
});
