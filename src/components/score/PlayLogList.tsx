import React from 'react';
import { View, StyleSheet, TouchableOpacity, FlatList } from 'react-native';
import { Text } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Colors, Spacing, Typography, BorderRadius } from '../../constants/theme';
import { useI18n } from '../../i18n';
import type { AtBatLog } from '../../types/game';

interface PlayLogListProps {
  logs: AtBatLog[];
  onEdit: (logId: string) => void;
}

export default function PlayLogList({ logs, onEdit }: PlayLogListProps) {
  const { t } = useI18n();

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

    return (
      <View style={styles.card}>
        <View style={styles.cardLeft}>
          <Text style={styles.inningBadge}>{inningStr}</Text>
        </View>
        <View style={styles.cardCenter}>
          <Text style={styles.resultText} numberOfLines={1}>
            {resultLabel}
          </Text>
          <Text style={styles.detailText} numberOfLines={1}>
            {pitchCount}{t.playLog.pitches}
            {fieldingStr ? ` / ${fieldingStr}` : ''}
            {item.rbiCount > 0 ? ` / ${item.rbiCount}${t.playLog.rbi}` : ''}
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
    );
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{t.playLog.title}</Text>
      <FlatList
        data={logs}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        scrollEnabled={false}
      />
    </View>
  );
}

const ACCENT = Colors.accent;   // '#FFD700'

const styles = StyleSheet.create({
  container: {
    marginTop: Spacing.md,
    paddingHorizontal: Spacing.sm,
  },
  title: {
    fontSize: Typography.bodySmall,
    fontWeight: '800',
    color: Colors.primary,   // ネイビー (ライト背景で視認性◎)
    marginBottom: Spacing.xs,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.card,          // ホワイト
    borderRadius: BorderRadius.sm,
    borderLeftWidth: 3,
    borderLeftColor: Colors.accent,        // ゴールドアクセント
    borderWidth: 1,
    borderColor: Colors.border,
    paddingVertical: 8,
    paddingHorizontal: 10,
    marginBottom: 6,
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 3,
    elevation: 1,
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
  resultText: {
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
    backgroundColor: Colors.accentSoft,    // ゴールド極薄
    borderWidth: 1,
    borderColor: Colors.accent,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 8,
  },
});
