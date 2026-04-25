import React, { useMemo, useState } from 'react';
import {
  View,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  Alert,
  Modal,
} from 'react-native';
import { Text, TextInput } from 'react-native-paper';
import { router } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Colors, Spacing, Typography, BorderRadius, CardShadow } from '../../../src/constants/theme';
import { useGameStore } from '../../../src/stores/gameStore';
import { POSITIONS } from '../../../src/types/game';
import type { Player, Position } from '../../../src/types/game';

const POSITION_LABELS: Record<string, string> = {
  P: '投', C: '捕', '1B': '一', '2B': '二', '3B': '三',
  SS: '遊', LF: '左', CF: '中', RF: '右', DH: 'DH',
};

interface PlayerRow {
  player: Player;
  side: 'away' | 'home';
  order: number;
  name: string;
  number: string;
  position: Position;
}

// ── ポジション選択モーダル ─────────────────────────────────────────────────────
interface PositionPickerProps {
  visible: boolean;
  current: Position;
  onSelect: (pos: Position) => void;
  onClose: () => void;
}

function PositionPicker({ visible, current, onSelect, onClose }: PositionPickerProps) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <TouchableOpacity style={pickerStyles.overlay} onPress={onClose} activeOpacity={1}>
        <View style={pickerStyles.sheet}>
          <Text style={pickerStyles.title}>ポジションを選択</Text>
          <View style={pickerStyles.grid}>
            {POSITIONS.map((pos) => (
              <TouchableOpacity
                key={pos}
                style={[pickerStyles.cell, current === pos && pickerStyles.cellActive]}
                onPress={() => { onSelect(pos); onClose(); }}
                activeOpacity={0.7}
              >
                <Text style={[pickerStyles.posCode, current === pos && pickerStyles.posCodeActive]}>
                  {pos}
                </Text>
                <Text style={[pickerStyles.posLabel, current === pos && pickerStyles.posLabelActive]}>
                  {POSITION_LABELS[pos]}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </TouchableOpacity>
    </Modal>
  );
}

const pickerStyles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.lg,
  },
  sheet: {
    backgroundColor: Colors.white,
    borderRadius: BorderRadius.xl,
    padding: Spacing.lg,
    width: '100%',
  },
  title: {
    fontSize: Typography.bodySmall,
    fontWeight: '700',
    color: Colors.textSecondary,
    textAlign: 'center',
    marginBottom: Spacing.md,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
    justifyContent: 'center',
  },
  cell: {
    width: 56,
    height: 56,
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.surfaceGray,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: Colors.border,
  },
  cellActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  posCode: {
    fontSize: 13,
    fontWeight: '800',
    color: Colors.text,
  },
  posCodeActive: {
    color: Colors.white,
  },
  posLabel: {
    fontSize: 9,
    color: Colors.textSecondary,
    marginTop: 1,
  },
  posLabelActive: {
    color: 'rgba(255,255,255,0.8)',
  },
});

// ── メインコンポーネント ──────────────────────────────────────────────────────
export default function PlayerMappingScreen() {
  const game = useGameStore((s) => s.game);
  const updatePlayerMapping = useGameStore((s) => s.updatePlayerMapping);

  const initialRows = useMemo<PlayerRow[]>(() => {
    if (!game) return [];
    const rows: PlayerRow[] = [];
    game.awayTeam.roster.starters.forEach((p, i) => {
      rows.push({ player: p, side: 'away', order: i + 1, name: p.name, number: String(p.number ?? ''), position: p.position });
    });
    game.homeTeam.roster.starters.forEach((p, i) => {
      rows.push({ player: p, side: 'home', order: i + 1, name: p.name, number: String(p.number ?? ''), position: p.position });
    });
    return rows;
  }, [game]);

  const [rows, setRows] = useState<PlayerRow[]>(initialRows);
  const [pickerTarget, setPickerTarget] = useState<string | null>(null); // playerId

  if (!game) {
    return (
      <View style={styles.centered}>
        <Text style={styles.emptyText}>試合データが見つかりません</Text>
      </View>
    );
  }

  const updateRow = (playerId: string, field: 'name' | 'number' | 'position', value: string) => {
    setRows((prev) =>
      prev.map((r) => (r.player.id === playerId ? { ...r, [field]: value } : r))
    );
  };

  const handleSave = async () => {
    const mappings = rows
      .filter((r) => r.name.trim())
      .map((r) => ({
        playerId: r.player.id,
        newName: r.name,
        newNumber: r.number,
        newPosition: r.position,
      }));
    await updatePlayerMapping(mappings);
    Alert.alert('保存完了', '選手情報を更新しました', [{ text: 'OK', onPress: () => router.back() }]);
  };

  const pickerRow = pickerTarget ? rows.find((r) => r.player.id === pickerTarget) : null;

  const awayRows = rows.filter((r) => r.side === 'away');
  const homeRows = rows.filter((r) => r.side === 'home');

  const renderSection = (title: string, sideRows: PlayerRow[], color: string) => (
    <View style={styles.section}>
      <View style={[styles.sectionHeader, { backgroundColor: color }]}>
        <Text style={styles.sectionTitle}>{title}</Text>
      </View>
      {sideRows.map((row) => (
        <View key={row.player.id} style={styles.playerRow}>
          {/* 打順バッジ */}
          <View style={styles.orderBadge}>
            <Text style={styles.orderText}>{row.order}</Text>
          </View>

          {/* ポジション選択ボタン — タップでモーダルを開く */}
          <TouchableOpacity
            style={[
              styles.positionBtn,
              row.player.isPlaceholder && styles.positionBtnUnmapped,
            ]}
            onPress={() => setPickerTarget(row.player.id)}
            activeOpacity={0.7}
          >
            <Text style={[
              styles.positionBtnText,
              row.player.isPlaceholder && styles.positionBtnTextUnmapped,
            ]}>
              {row.position}
            </Text>
          </TouchableOpacity>

          {/* 氏名 */}
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

          {/* 背番号 */}
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
        {/* お知らせバナー */}
        <View style={styles.noticeBanner}>
          <MaterialCommunityIcons name="information-outline" size={16} color={Colors.primary} />
          <Text style={styles.noticeText}>
            ポジション（青ボタン）・氏名・背番号を変更できます。
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

        {/* 保存ボタン */}
        <View style={styles.footer}>
          <TouchableOpacity style={styles.saveBtn} onPress={handleSave} activeOpacity={0.85}>
            <MaterialCommunityIcons name="content-save-outline" size={20} color={Colors.white} />
            <Text style={styles.saveBtnText}>選手情報を保存</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* ポジション選択モーダル */}
      {pickerRow && (
        <PositionPicker
          visible={pickerTarget !== null}
          current={pickerRow.position}
          onSelect={(pos) => updateRow(pickerRow.player.id, 'position', pos)}
          onClose={() => setPickerTarget(null)}
        />
      )}
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
    width: 22,
    height: 22,
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

  // ポジションボタン
  positionBtn: {
    minWidth: 38,
    height: 36,
    borderRadius: BorderRadius.sm,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  positionBtnUnmapped: {
    backgroundColor: Colors.secondary,
  },
  positionBtnText: {
    fontSize: 11,
    fontWeight: '800',
    color: Colors.white,
  },
  positionBtnTextUnmapped: {
    color: Colors.white,
  },

  nameInput: {
    flex: 1,
    backgroundColor: Colors.white,
    fontSize: Typography.bodySmall,
    height: 44,
  },
  numberInput: {
    width: 60,
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
