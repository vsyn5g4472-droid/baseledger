import React from 'react';
import { View, StyleSheet, FlatList } from 'react-native';
import { Card, Text, Chip } from 'react-native-paper';
import { Colors, Spacing, Typography, BorderRadius } from '../../../src/constants/theme';
import { useScores } from '../../../src/hooks/useScores';
import EmptyState from '../../../src/components/EmptyState';
import { useI18n } from '../../../src/i18n';

/** 日本語ロケール用の日付フォーマット（2026年2月17日） */
function formatDate(locale: string, raw: unknown): string {
  try {
    const d = typeof (raw as any)?.toDate === 'function' ? (raw as any).toDate() : null;
    if (!d) return '';
    if (locale === 'ja') {
      return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;
    }
    return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
  } catch {
    return '';
  }
}

export default function ScoreHistoryScreen() {
  const { scores, loading } = useScores();
  const { t, locale } = useI18n();

  return (
    <View style={styles.container}>
      <FlatList
        data={scores}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => {
          const date = formatDate(locale, item.gameDate) || t.history.recent;

          return (
            <Card style={styles.card}>
              <View style={styles.header}>
                <Text style={styles.date}>{date}</Text>
                <Text style={styles.opponent}>{t.common.vs} {item.opponent}</Text>
              </View>
              <View style={styles.statsContainer}>
                {item.batting && (
                  <View style={styles.statSection}>
                    <Chip compact style={styles.badge} textStyle={styles.badgeText}>{t.history.batting}</Chip>
                    <View style={styles.statRow}>
                      <StatItem label={t.history.stats.ab} value={item.batting.atBats} />
                      <StatItem label={t.history.stats.h} value={item.batting.hits} />
                      <StatItem label={t.history.stats.hr} value={item.batting.homeRuns} />
                      <StatItem label={t.history.stats.rbi} value={item.batting.rbis} />
                      <StatItem label={t.history.stats.sb} value={item.batting.stolenBases} />
                    </View>
                  </View>
                )}
                {item.pitching && (
                  <View style={styles.statSection}>
                    <Chip compact style={styles.badge} textStyle={styles.badgeText}>{t.history.pitching}</Chip>
                    <View style={styles.statRow}>
                      <StatItem label={t.history.stats.ip} value={item.pitching.inningsPitched} />
                      <StatItem label={t.history.stats.k} value={item.pitching.strikeouts} />
                      <StatItem label={t.history.stats.er} value={item.pitching.earnedRuns} />
                      <StatItem label={t.history.stats.bb} value={item.pitching.walks} />
                    </View>
                  </View>
                )}
                {item.fielding && (
                  <View style={styles.statSection}>
                    <Chip compact style={styles.badge} textStyle={styles.badgeText}>{t.history.fielding}</Chip>
                    <View style={styles.statRow}>
                      <StatItem label={t.history.stats.po} value={item.fielding.putouts} />
                      <StatItem label={t.history.stats.a} value={item.fielding.assists} />
                      <StatItem label={t.history.stats.e} value={item.fielding.errors} />
                    </View>
                  </View>
                )}
              </View>
              {item.aiAnalysis && (
                <View style={styles.aiSection}>
                  <Text style={styles.aiLabel}>{t.history.aiAnalysis}</Text>
                  <Text style={styles.aiText}>{item.aiAnalysis}</Text>
                </View>
              )}
            </Card>
          );
        }}
        contentContainerStyle={scores.length === 0 ? styles.emptyContainer : styles.listContent}
        ListEmptyComponent={
          <EmptyState
            icon="clipboard-text-outline"
            title={t.history.noScores}
            subtitle={t.history.noScoresSub}
          />
        }
      />
    </View>
  );
}

function StatItem({ label, value }: { label: string; value: number }) {
  return (
    <View style={styles.statItem}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  listContent: { padding: Spacing.md, paddingBottom: Spacing.xxl },
  emptyContainer: { flex: 1 },
  card: {
    marginBottom: Spacing.md,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: Colors.border,
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.sm,
    paddingBottom: Spacing.xs,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  date: { fontSize: Typography.bodySmall, fontWeight: '700', color: Colors.primary },
  opponent: { fontSize: Typography.bodySmall, fontWeight: '600', color: Colors.textSecondary },
  statsContainer: { gap: Spacing.sm },
  statSection: { marginBottom: Spacing.xs },
  badge: {
    alignSelf: 'flex-start',
    backgroundColor: Colors.primary,
    marginBottom: Spacing.xs,
    borderRadius: BorderRadius.full,
  },
  badgeText: { fontSize: Typography.tiny, color: Colors.white, fontWeight: '700' },
  statRow: { flexDirection: 'row', gap: Spacing.md },
  statItem: { alignItems: 'center', minWidth: 36 },
  statValue: { fontSize: Typography.body, fontWeight: '800', color: Colors.primary },
  statLabel: { fontSize: Typography.tiny, color: Colors.primary, fontWeight: '600', marginTop: 1 },
  aiSection: {
    marginTop: Spacing.sm,
    padding: Spacing.sm,
    backgroundColor: Colors.accentSoft,
    borderRadius: BorderRadius.md,
    borderLeftWidth: 3,
    borderLeftColor: Colors.accent,
  },
  aiLabel: { fontSize: Typography.caption, fontWeight: '700', color: Colors.primary, marginBottom: 4 },
  aiText: { fontSize: Typography.caption, color: Colors.text, lineHeight: 18 },
});
