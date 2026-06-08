import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  ActivityIndicator,
  TouchableOpacity,
  RefreshControl,
  Alert,
} from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useAuth } from '../../src/contexts/AuthContext';
import { deleteSpotAtBat, getUserSpotAtBats } from '../../src/services/spotAtBatService';
import type { SpotAtBat } from '../../src/models/types';
import type { AtBatResult } from '../../src/types/game';
import { Colors, Spacing, Typography, BorderRadius, CardShadow } from '../../src/constants/theme';
import { useUserPlan } from '../../src/hooks/usePlanGate';
import { checkAIReportUsage } from '../../src/services/planService';
import { showAIUsageLimitAlert } from '../../src/utils/planLimitAlerts';
import { generateSpotAIReport, reportToSections, type AIReport } from '../../src/services/aiReportService';
import AIReportErrorCard from '../../src/components/AIReportErrorCard';

const RESULT_JP: Record<AtBatResult, string> = {
  strikeout: '三振(空振)',
  strikeout_looking: '三振(見逃)',
  walk: '四球',
  hit_by_pitch: '死球',
  single: '単打',
  double: '二塁打',
  triple: '三塁打',
  home_run: '本塁打',
  groundout: 'ゴロアウト',
  flyout: 'フライアウト',
  lineout: 'ライナーアウト',
  pop_out: 'ポップフライ',
  sacrifice_bunt: '犠打',
  sacrifice_fly: '犠飛',
  fielders_choice: '野選',
  error: 'エラー',
  double_play: 'ダブルプレイ',
  triple_play: 'トリプルプレイ',
};

function formatSpotDate(spot: SpotAtBat): string {
  const d = spot.gameDate?.toDate?.();
  if (!d) return '日付不明';
  return d.toLocaleDateString('ja-JP', { year: 'numeric', month: 'numeric', day: 'numeric' });
}

function AtBatListItem({
  spot,
  showDelete,
  onLongPress,
  onDeletePress,
}: {
  spot: SpotAtBat;
  showDelete: boolean;
  onLongPress: () => void;
  onDeletePress: () => void;
}) {
  const resultJp = RESULT_JP[spot.result] ?? spot.result;
  return (
    <TouchableOpacity
      style={itemStyles.card}
      onLongPress={onLongPress}
      delayLongPress={400}
      activeOpacity={0.85}
    >
      <View style={itemStyles.main}>
        <Text style={itemStyles.result}>{resultJp}</Text>
        <Text style={itemStyles.meta}>{spot.pitches.length}球</Text>
      </View>
      <Text style={itemStyles.date}>{formatSpotDate(spot)}</Text>
      {spot.opponent ? <Text style={itemStyles.opponent}>vs {spot.opponent}</Text> : null}
      {showDelete && (
        <TouchableOpacity
          style={itemStyles.deleteBtn}
          onPress={onDeletePress}
          activeOpacity={0.7}
        >
          <MaterialCommunityIcons name="delete-outline" size={18} color={Colors.error} />
          <Text style={itemStyles.deleteBtnText}>削除</Text>
        </TouchableOpacity>
      )}
    </TouchableOpacity>
  );
}

export default function SpotBatterScreen() {
  const { playerName } = useLocalSearchParams<{ playerName: string }>();
  const { currentUser } = useAuth();
  const userPlan = useUserPlan();

  const [spots, setSpots] = useState<SpotAtBat[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [aiReport, setAiReport] = useState<AIReport | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);

  const decodedName = decodeURIComponent(playerName ?? '');

  const load = useCallback(async () => {
    if (!currentUser) {
      setLoading(false);
      return;
    }
    try {
      const all = await getUserSpotAtBats(currentUser.uid);
      const filtered = all
        .filter((s) => (s.playerName?.trim() || '名前未設定') === decodedName)
        .sort((a, b) => {
          const ta = a.gameDate?.toMillis?.() ?? 0;
          const tb = b.gameDate?.toMillis?.() ?? 0;
          return tb - ta;
        });
      setSpots(filtered);
    } catch (e) {
      console.error('SpotBatter load error:', e);
    } finally {
      setLoading(false);
    }
  }, [currentUser, decodedName]);

  useEffect(() => {
    setLoading(true);
    setAiReport(null);
    load();
  }, [load]);

  const title = useMemo(() => decodedName || '打者', [decodedName]);

  const confirmDelete = useCallback((spotId: string) => {
    Alert.alert(
      '打席を削除しますか？',
      'この打席データは削除され、元に戻せません',
      [
        {
          text: 'キャンセル',
          style: 'cancel',
          onPress: () => setDeleteTargetId(null),
        },
        {
          text: '削除する',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteSpotAtBat(spotId);
              setSpots((prev) => prev.filter((s) => s.id !== spotId));
              setAiReport(null);
              setDeleteTargetId(null);
            } catch (e) {
              console.error('SpotBatter delete error:', e);
              Alert.alert('エラー', '打席の削除に失敗しました');
            }
          },
        },
      ],
    );
  }, []);

  const handleStartAI = useCallback(async () => {
    if (spots.length === 0) return;

    const usage = await checkAIReportUsage(userPlan);
    if (!usage.allowed) {
      showAIUsageLimitAlert(userPlan, usage.limit);
      return;
    }

    setAiLoading(true);
    try {
      const report = await generateSpotAIReport(spots, decodedName, userPlan);
      if (report.isMock && report.errorReason === 'monthly_limit_exceeded') {
        showAIUsageLimitAlert(userPlan, usage.limit);
        return;
      }
      setAiReport(report);
    } finally {
      setAiLoading(false);
    }
  }, [spots, decodedName, userPlan]);

  if (loading) {
    return (
      <View style={styles.center}>
        <Stack.Screen options={{ title }} />
        <ActivityIndicator size="large" color={Colors.primary} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ title }} />

      <FlatList
        data={spots}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
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
        ListHeaderComponent={
          <View style={styles.header}>
            <Text style={styles.headerTitle}>{decodedName}</Text>
            <Text style={styles.headerSub}>{spots.length}打席の記録</Text>
          </View>
        }
        renderItem={({ item }) => (
          <AtBatListItem
            spot={item}
            showDelete={deleteTargetId === item.id}
            onLongPress={() => setDeleteTargetId(item.id)}
            onDeletePress={() => confirmDelete(item.id)}
          />
        )}
        ListEmptyComponent={
          <View style={styles.emptyBox}>
            <MaterialCommunityIcons name="database-off-outline" size={40} color={Colors.border} />
            <Text style={styles.emptyText}>打席記録がありません</Text>
          </View>
        }
        ListFooterComponent={
          aiLoading ? (
            <View style={[styles.card, styles.aiCard]}>
              <View style={styles.aiHeader}>
                <MaterialCommunityIcons name="robot-outline" size={20} color={Colors.primary} />
                <Text style={styles.aiTitle}>AI 分析</Text>
              </View>
              <ActivityIndicator size="small" color={Colors.primary} style={{ marginVertical: 8 }} />
            </View>
          ) : aiReport && !aiReport.isMock ? (
            <View style={[styles.card, styles.aiCard]}>
              <View style={styles.aiHeader}>
                <MaterialCommunityIcons name="robot-outline" size={20} color={Colors.primary} />
                <Text style={styles.aiTitle}>AI 分析</Text>
              </View>
              <Text style={styles.aiOverall}>{aiReport.overall}</Text>
              {reportToSections(aiReport)
                .filter((s) => s.title !== '総合評価')
                .map((s) => (
                  <View key={s.title} style={styles.aiSection}>
                    <Text style={styles.aiSectionTitle}>{s.title}</Text>
                    <Text style={styles.aiSectionBody}>{s.content}</Text>
                  </View>
                ))}
            </View>
          ) : aiReport ? (
            <AIReportErrorCard
              report={aiReport}
              currentPlan={userPlan}
              featureLabel="AI 分析"
              onRetry={spots.length > 0 ? handleStartAI : undefined}
            />
          ) : null
        }
      />

      <View style={styles.footer}>
        <TouchableOpacity
          style={[styles.aiButton, (aiLoading || spots.length === 0) && styles.aiButtonDisabled]}
          onPress={handleStartAI}
          disabled={aiLoading || spots.length === 0}
          activeOpacity={0.85}
        >
          {aiLoading ? (
            <ActivityIndicator size="small" color={Colors.white} />
          ) : (
            <>
              <MaterialCommunityIcons name="robot-outline" size={20} color={Colors.white} />
              <Text style={styles.aiButtonText}>AI分析を開始</Text>
            </>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  listContent: { padding: Spacing.md, paddingBottom: 100 },
  header: { marginBottom: Spacing.md },
  headerTitle: { fontSize: Typography.h4, fontWeight: '800', color: Colors.text },
  headerSub: { fontSize: Typography.bodySmall, color: Colors.textSecondary, marginTop: 4 },
  emptyBox: { alignItems: 'center', paddingVertical: 40, gap: Spacing.sm },
  emptyText: { fontSize: Typography.bodySmall, color: Colors.textSecondary },
  footer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    padding: Spacing.md,
    paddingBottom: Spacing.lg,
    backgroundColor: Colors.background,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  aiButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    backgroundColor: Colors.primary,
    borderRadius: BorderRadius.lg,
    paddingVertical: 14,
  },
  aiButtonDisabled: { opacity: 0.5 },
  aiButtonText: { fontSize: Typography.body, fontWeight: '800', color: Colors.white },
  card: {
    backgroundColor: Colors.card,
    borderRadius: BorderRadius.xl,
    padding: Spacing.md,
    gap: Spacing.sm,
    marginTop: Spacing.md,
    ...CardShadow,
  },
  aiCard: { borderWidth: 1, borderColor: Colors.border },
  aiHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs },
  aiTitle: { fontSize: Typography.bodySmall, fontWeight: '800', color: Colors.text },
  aiOverall: { fontSize: Typography.bodySmall, color: Colors.text, lineHeight: 22 },
  aiSection: { marginTop: Spacing.xs },
  aiSectionTitle: { fontSize: Typography.caption, fontWeight: '800', color: Colors.primary, marginBottom: 4 },
  aiSectionBody: { fontSize: Typography.bodySmall, color: Colors.textSecondary, lineHeight: 20 },
});

const itemStyles = StyleSheet.create({
  card: {
    backgroundColor: Colors.card,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  main: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  result: { fontSize: Typography.body, fontWeight: '700', color: Colors.text, flex: 1 },
  meta: { fontSize: Typography.bodySmall, color: Colors.textSecondary, fontWeight: '600' },
  date: { fontSize: Typography.caption, color: Colors.textSecondary, marginTop: 6 },
  opponent: { fontSize: Typography.caption, color: Colors.textSecondary, marginTop: 2 },
  deleteBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: Spacing.sm,
    paddingTop: Spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.border,
    alignSelf: 'flex-start',
  },
  deleteBtnText: {
    fontSize: Typography.bodySmall,
    fontWeight: '700',
    color: Colors.error,
  },
});
