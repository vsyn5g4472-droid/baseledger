import React from 'react';
import { View, Text, StyleSheet, FlatList, ActivityIndicator, TouchableOpacity, RefreshControl } from 'react-native';
import { useAuth } from '../../src/contexts/AuthContext';
import { getUserSpotAtBats } from '../../src/services/spotAtBatService';
import type { SpotAtBat } from '../../src/models/types';
import { Colors, Spacing, Typography } from '../../src/constants/theme';

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

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={Colors.primary} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <FlatList
        data={records}
        keyExtractor={(item) => item.id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} />}
        renderItem={({ item }) => (
          <View style={styles.card}>
            <Text style={styles.playerName}>{item.playerName}</Text>
            <Text style={styles.detail}>vs {item.pitcherName || '投手未入力'}</Text>
            {item.opponent ? <Text style={styles.detail}>{item.opponent}</Text> : null}
            <Text style={styles.detail}>{item.pitches.length}球 / {item.result}</Text>
          </View>
        )}
        ListEmptyComponent={
          <View style={styles.center}>
            <Text style={styles.emptyText}>スポット打席記録がありません</Text>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40 },
  emptyText: { fontSize: Typography.body, color: Colors.textSecondary, textAlign: 'center' },
  card: {
    backgroundColor: Colors.card,
    margin: Spacing.sm,
    padding: Spacing.md,
    borderRadius: 8,
  },
  playerName: { fontSize: Typography.body, fontWeight: '700', color: Colors.text },
  detail: { fontSize: Typography.bodySmall, color: Colors.textSecondary, marginTop: 2 },
});
