import React, { useMemo, useState } from 'react';
import {
  View,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from 'react-native';
import { Text, TextInput } from 'react-native-paper';
import { router } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Colors, Spacing, Typography, BorderRadius, CardShadow } from '../../../src/constants/theme';
import { useGameStore } from '../../../src/stores/gameStore';
import type { Player } from '../../../src/types/game';

interface PlayerRow {
  player: Player;
  side: 'away' | 'home';
  order: number;
  name: string;
  number: string;
}

export default function PlayerMappingScreen() {
  const game = useGameStore((s) => s.game);
  const updatePlayerMapping = useGameStore((s) => s.updatePlayerMapping);

  const initialRows = useMemo<PlayerRow[]>(() => {
    if (!game) return [];
    const rows: PlayerRow[] = [];
    game.awayTeam.roster.starters.forEach((p, i) => {
      rows.push({ player: p, side: 'away', order: i + 1, name: p.name, number: String(p.number ?? '') });
    });
    game.homeTeam.roster.starters.forEach((p, i) => {
      rows.push({ player: p, side: 'home', order: i + 1, name: p.name, number: String(p.number ?? '') });
    });
    return rows;
  }, [game]);

  const [rows, setRows] = useState<PlayerRow[]>(initialRows);

  if (!game) {
    return (
      <View style={styles.centered}>
        <Text style={styles.emptyText}>試合データが見つかりません</Text>
      </View>
    );
  }

  const updateRow = (playerId: string, field: 'name' | 'number', value: string) => {
    setRows((prev) =>
      prev.map((r) => (r.player.id === playerId ? { ...r, [field]: value } : r))
    );
  };

  const handleSave = async () => {
    const mappings = rows
      .filter((r) => r.name.trim())
      .map((r) => ({ playerId: r.player.id, newName: r.name, newNumber: r.number }));
    await updatePlayerMapping(mappings);
    Alert.alert('保存完了', '選手情報を更新しました', [{ text: 'OK', onPress: () => router.back() }]);
  };

  const awayRows = rows.filter((r) => r.side === 'away');
  const homeRows = rows.filter((r) => r.side === 'home');

  const renderSection = (title: string, sideRows: PlayerRow[], color: string) => (
    <View style={styles.section}>
      <View style={[styles.sectionHeader, { backgroundColor: color }]}>
        <Text style={styles.sectionTitle}>{title}</Text>
      </View>
      {sideRows.map((row) => (
        <View key={row.player.id} style={styles.playerRow}>
          <View style={styles.orderBadge}>
            <Text style={styles.orderText}>{row.order}</Text>
          </View>
          <View style={styles.positionBadge}>
            <Text style={styles.positionText}>{row.player.position}</Text>
          </View>
          {row.player.isPlaceholder && (
            <View style={styles.unmappedDot} />
          )}
          <TextInput
            style={styles.nameInput}
            value={row.name}
            onChangeText={(v) => updateRow(row.player.id, 'name', v)}
            placeholder="選手名"
            placeholderTextColor={Colors.textSecondary}
            mode="outlined"
            outlineColor={Colors.border}
            activeOutlineColor={Colors.primary}
            dense
            label="氏名"
          />
          <TextInput
            style={styles.numberInput}
            value={row.number}
            onChangeText={(v) => updateRow(row.player.id, 'number', v)}
            placeholder="背番号"
            placeholderTextColor={Colors.textSecondary}
            keyboardType="number-pad"
            mode="outlined"
            outlineColor={Colors.border}
            activeOutlineColor={Colors.primary}
            dense
            label="#"
          />
        </View>
      ))}
    </View>
  );

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={styles.container}>
        {/* Notice banner */}
        <View style={styles.noticeBanner}>
          <MaterialCommunityIcons name="information-outline" size={16} color={Colors.primary} />
          <Text style={styles.noticeText}>
            仮の選手名を実名に変更できます。背番号は任意です。
          </Text>
        </View>

        <FlatList
          data={[1]}
          keyExtractor={() => 'main'}
          renderItem={() => (
            <View style={styles.listContent}>
              {renderSection(game.awayTeam.name + '（先攻）', awayRows, Colors.primary)}
              {renderSection(game.homeTeam.name + '（後攻）', homeRows, Colors.secondary)}
            </View>
          )}
          keyboardShouldPersistTaps="handled"
        />

        {/* Save Button */}
        <View style={styles.footer}>
          <TouchableOpacity style={styles.saveBtn} onPress={handleSave} activeOpacity={0.85}>
            <MaterialCommunityIcons name="content-save-outline" size={20} color={Colors.white} />
            <Text style={styles.saveBtnText}>選手情報を保存</Text>
          </TouchableOpacity>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: { flex: 1, backgroundColor: Colors.background },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  emptyText: { color: Colors.textSecondary, fontSize: Typography.body },

  noticeBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    backgroundColor: Colors.primaryLight,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  noticeText: {
    flex: 1,
    fontSize: Typography.caption,
    color: Colors.primary,
    lineHeight: 18,
  },

  listContent: { padding: Spacing.md, paddingBottom: Spacing.xxl },

  section: {
    backgroundColor: Colors.white,
    borderRadius: BorderRadius.lg,
    marginBottom: Spacing.lg,
    overflow: 'hidden',
    ...CardShadow,
  },
  sectionHeader: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  sectionTitle: {
    fontSize: Typography.bodySmall,
    fontWeight: '700',
    color: Colors.white,
  },

  playerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  orderBadge: {
    width: 24,
    height: 24,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.surfaceGray,
    alignItems: 'center',
    justifyContent: 'center',
  },
  orderText: {
    fontSize: Typography.tiny,
    fontWeight: '700',
    color: Colors.textSecondary,
  },
  positionBadge: {
    minWidth: 32,
    alignItems: 'center',
  },
  positionText: {
    fontSize: Typography.tiny,
    fontWeight: '600',
    color: Colors.textSecondary,
  },
  unmappedDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: Colors.secondary,
  },
  nameInput: {
    flex: 1,
    backgroundColor: Colors.white,
    fontSize: Typography.bodySmall,
    height: 44,
  },
  numberInput: {
    width: 64,
    backgroundColor: Colors.white,
    fontSize: Typography.bodySmall,
    height: 44,
  },

  footer: {
    padding: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    backgroundColor: Colors.white,
  },
  saveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    backgroundColor: Colors.primary,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.xl,
  },
  saveBtnText: {
    fontSize: Typography.body,
    fontWeight: '700',
    color: Colors.white,
  },
});
