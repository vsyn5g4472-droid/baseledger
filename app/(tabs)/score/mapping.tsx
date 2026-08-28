import React, { useMemo, useState, useEffect, useCallback } from 'react';
import {
  View,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  Alert,
  Switch,
} from 'react-native';
import { Text, TextInput, Menu } from 'react-native-paper';
import { router, useNavigation } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Colors, Spacing, Typography, BorderRadius, CardShadow } from '../../../src/constants/theme';
import { useGameStore } from '../../../src/stores/gameStore';
import { POSITIONS, type Player, type Position } from '../../../src/types/game';
import { useI18n } from '../../../src/i18n';
import { PositionDiamondPicker } from '../../../src/components/score/PositionDiamondPicker';
import { getDuplicatePositionPlayerIds } from '../../../src/utils/positionAvailability';
import PitcherReassignmentModal from '../../../src/components/PitcherReassignmentModal';
import { db } from '../../../src/db';

interface PlayerRow {
  player: Player;
  side: 'away' | 'home';
  order: number;
  name: string;
  number: string;
  position: Position;
  isPitcher: boolean;
  throws: 'L' | 'R';
  bats: 'L' | 'R' | 'S';
}

function selectablePositions(teamHasDH: boolean): Position[] {
  return POSITIONS.filter((pos) => pos !== 'DH' || teamHasDH);
}

function findDuplicatePosition(
  entries: { playerId: string; position: Position; isPitcher?: boolean }[],
): Position | null {
  const counts = new Map<Position, number>();
  for (const entry of entries) {
    if (entry.position === 'DH') continue;
    const pos = entry.isPitcher ? 'P' : entry.position;
    counts.set(pos, (counts.get(pos) ?? 0) + 1);
  }
  for (const [pos, count] of counts) {
    if (count > 1) return pos;
  }
  return null;
}

function ThrowsMenuButton({ throws, onUpdate }: { throws: 'L' | 'R'; onUpdate: (v: string) => void }) {
  const [visible, setVisible] = useState(false);
  return (
    <Menu
      visible={visible}
      onDismiss={() => setVisible(false)}
      anchor={
        <TouchableOpacity
          style={styles.throwsButton}
          onPress={() => setVisible(true)}
        >
          <Text style={styles.throwsButtonText}>{throws}</Text>
        </TouchableOpacity>
      }
    >
      {(['R', 'L'] as const).map((th) => (
        <Menu.Item key={th} onPress={() => { onUpdate(th); setVisible(false); }} title={th} />
      ))}
    </Menu>
  );
}

function BatsMenuButton({ bats, onUpdate }: { bats: 'L' | 'R' | 'S'; onUpdate: (v: string) => void }) {
  const [visible, setVisible] = useState(false);
  return (
    <Menu
      visible={visible}
      onDismiss={() => setVisible(false)}
      anchor={
        <TouchableOpacity
          style={styles.batsButton}
          onPress={() => setVisible(true)}
        >
          <Text style={styles.batsButtonText}>{bats}</Text>
        </TouchableOpacity>
      }
    >
      {(['R', 'L', 'S'] as const).map((b) => (
        <Menu.Item key={b} onPress={() => { onUpdate(b); setVisible(false); }} title={b} />
      ))}
    </Menu>
  );
}

function buildPlayerRows(game: NonNullable<ReturnType<typeof useGameStore.getState>['game']>): PlayerRow[] {
  const rows: PlayerRow[] = [];
  const addDHPitcherRow = (side: 'away' | 'home') => {
    const team = side === 'away' ? game.awayTeam : game.homeTeam;
    if (!game.isDH?.[side]) return;
    const player: Player = team.roster.pitcher ?? {
      id: `pitcher-temp-${side}`,
      name: '',
      number: null,
      position: 'P',
      bats: 'R',
      throws: 'R',
      isPlaceholder: true,
    };
    rows.push({
      player,
      side,
      order: 0,
      name: player.name,
      number: String(player.number ?? ''),
      position: 'P',
      isPitcher: true,
      throws: player.throws ?? 'R',
      bats: player.bats ?? 'R',
    });
  };
  game.awayTeam.roster.starters.forEach((p, i) => {
    rows.push({ player: p, side: 'away', order: i + 1, name: p.name, number: String(p.number ?? ''), position: p.position, isPitcher: false, throws: p.throws ?? 'R', bats: p.bats ?? 'R' });
  });
  addDHPitcherRow('away');
  game.homeTeam.roster.starters.forEach((p, i) => {
    rows.push({ player: p, side: 'home', order: i + 1, name: p.name, number: String(p.number ?? ''), position: p.position, isPitcher: false, throws: p.throws ?? 'R', bats: p.bats ?? 'R' });
  });
  addDHPitcherRow('home');
  return rows;
}

// ── メインコンポーネント ──────────────────────────────────────────────────────
export default function PlayerMappingScreen() {
  const game = useGameStore((s) => s.game);
  const updatePlayerMapping = useGameStore((s) => s.updatePlayerMapping);
  const setGameDH = useGameStore((s) => s.setGameDH);
  const reassignActivePitcherRecords = useGameStore((s) => s.reassignActivePitcherRecords);
  const loadGame = useGameStore((s) => s.loadGame);
  const { t } = useI18n();
  const [showPitcherReassignment, setShowPitcherReassignment] = useState(false);

  const [awayDH, setAwayDH] = useState(() => game?.isDH?.away ?? false);
  const [homeDH, setHomeDH] = useState(() => game?.isDH?.home ?? false);

  const initialRows = useMemo<PlayerRow[]>(() => {
    return game ? buildPlayerRows(game) : [];
  }, [game]);

  const [rows, setRows] = useState<PlayerRow[]>(initialRows);

  const awayRows = rows.filter((r) => r.side === 'away');
  const homeRows = rows.filter((r) => r.side === 'home');

  const navigation = useNavigation();

  const executeSave = useCallback(async () => {
    setGameDH('away', awayDH);
    setGameDH('home', homeDH);
    const mappings = rows
      .filter((r) =>
        r.name.trim() ||
        r.position !== r.player.position ||
        r.number !== String(r.player.number ?? '') ||
        r.throws !== (r.player.throws ?? 'R') ||
        r.bats !== (r.player.bats ?? 'R'),
      )
      .map((r) => ({
        playerId: r.player.id,
        newName: r.name,
        newNumber: r.number,
        newPosition: r.isPitcher ? undefined : r.position,
        newThrows: r.throws,
        newBats: r.bats,
        isPitcher: r.isPitcher,
        side: r.side,
      }));
    await updatePlayerMapping(mappings);
  }, [rows, awayDH, homeDH, setGameDH, updatePlayerMapping]);

  const hasChanges = useMemo(() => {
    return rows.some(
      (r) =>
        r.name.trim() !== (r.player.name ?? '') ||
        r.position !== r.player.position ||
        r.number !== String(r.player.number ?? '') ||
        r.throws !== (r.player.throws ?? 'R') ||
        r.bats !== (r.player.bats ?? 'R'),
    );
  }, [rows]);

  useEffect(() => {
    if (!showPitcherReassignment && !hasChanges) setRows(initialRows);
  }, [hasChanges, initialRows, showPitcherReassignment]);

  const handleBack = useCallback(() => {
    if (!hasChanges) {
      router.back();
      return;
    }
    Alert.alert(
      '変更を保存しますか？',
      '選手情報に変更があります。保存して戻りますか？',
      [
        { text: 'キャンセル', style: 'cancel' },
        { text: '保存せず戻る', style: 'destructive', onPress: () => router.back() },
        {
          text: '保存して戻る',
          onPress: async () => {
            const currentAwayRows = rows.filter((r) => r.side === 'away');
            const currentHomeRows = rows.filter((r) => r.side === 'home');
            const awayEntries = currentAwayRows.map((r) => ({ playerId: r.player.id, position: r.position, isPitcher: r.isPitcher }));
            const homeEntries = currentHomeRows.map((r) => ({ playerId: r.player.id, position: r.position, isPitcher: r.isPitcher }));
            const duplicatePosition = findDuplicatePosition(awayEntries) ?? findDuplicatePosition(homeEntries);
            if (duplicatePosition) {
              const posName = t.positions[duplicatePosition] ?? duplicatePosition;
              Alert.alert('ポジションが重複しています', `${posName}が複数の選手に割り当てられています。修正してください。`, [{ text: 'OK' }]);
              return;
            }
            await executeSave();
            router.back();
          },
        },
      ],
    );
  }, [hasChanges, executeSave, rows, t.positions]);

  useEffect(() => {
    navigation.setOptions({
      headerLeft: () => (
        <TouchableOpacity onPress={handleBack} style={{ paddingHorizontal: 8 }}>
          <MaterialCommunityIcons name="chevron-left" size={28} color={Colors.primary} />
        </TouchableOpacity>
      ),
    });
  }, [navigation, handleBack]);

  if (!game) {
    return (
      <View style={styles.centered}>
        <Text style={styles.emptyText}>試合データが見つかりません</Text>
      </View>
    );
  }

  const handleDHToggle = (side: 'away' | 'home') => {
    const currentDH = side === 'away' ? awayDH : homeDH;
    const newDH = !currentDH;
    if (side === 'away') setAwayDH(newDH); else setHomeDH(newDH);
    if (newDH) {
      setRows((prev) => {
        if (prev.some((r) => r.side === side && r.isPitcher)) return prev;
        const existing = side === 'away' ? game?.awayTeam.roster.pitcher : game?.homeTeam.roster.pitcher;
        const tempPlayer: Player = existing ?? {
          id: `pitcher-temp-${side}`, name: '', number: null,
          position: 'P', bats: 'R', throws: 'R', isPlaceholder: true,
        };
        return [...prev, {
          player: tempPlayer, side, order: 0,
          name: tempPlayer.name, number: String(tempPlayer.number ?? ''),
          position: 'P' as Position, isPitcher: true,
          throws: tempPlayer.throws ?? 'R',
          bats: tempPlayer.bats ?? 'R',
        }];
      });
    } else {
      setRows((prev) => prev.filter((r) => !(r.side === side && r.isPitcher)));
    }
  };

  const updateRow = (playerId: string, field: 'name' | 'number' | 'position' | 'throws' | 'bats', value: string) => {
    setRows((prev) =>
      prev.map((r) => (r.player.id === playerId ? { ...r, [field]: value } : r))
    );
  };

  const handleSave = async () => {
    const awayEntries = awayRows.map((r) => ({
      playerId: r.player.id,
      position: r.position,
      isPitcher: r.isPitcher,
    }));
    const homeEntries = homeRows.map((r) => ({
      playerId: r.player.id,
      position: r.position,
      isPitcher: r.isPitcher,
    }));
    const duplicatePosition =
      findDuplicatePosition(awayEntries) ?? findDuplicatePosition(homeEntries);
    if (duplicatePosition) {
      const posName = t.positions[duplicatePosition] ?? duplicatePosition;
      Alert.alert(
        'ポジションが重複しています',
        `${posName}が複数の選手に割り当てられています。修正してください。`,
        [{ text: 'OK' }],
      );
      return;
    }
    await executeSave();
    Alert.alert('保存完了', '選手情報を更新しました', [{ text: 'OK', onPress: () => router.back() }]);
  };

  const toPositionEntries = (sideRows: PlayerRow[]) =>
    sideRows.map((r) => ({ playerId: r.player.id, position: r.position, isPitcher: r.isPitcher }));

  const renderSection = (title: string, sideRows: PlayerRow[], color: string, side: 'away' | 'home') => {
    const teamHasDH = side === 'away' ? awayDH : homeDH;
    const entries = toPositionEntries(sideRows);
    const duplicateIds = getDuplicatePositionPlayerIds(entries);

    return (
    <View style={styles.section}>
      <View style={[styles.sectionHeader, { backgroundColor: color }]}>
        <Text style={styles.sectionTitle}>{title}</Text>
        <View style={styles.dhToggleRow}>
          <Text style={styles.dhToggleLabel}>DH</Text>
          <Switch
            value={side === 'away' ? awayDH : homeDH}
            onValueChange={() => handleDHToggle(side)}
            trackColor={{ false: 'rgba(255,255,255,0.3)', true: 'rgba(255,255,255,0.8)' }}
            thumbColor={Colors.white}
            ios_backgroundColor="rgba(255,255,255,0.3)"
          />
        </View>
      </View>
      {sideRows.map((row) => (
        <View key={row.player.id} style={[styles.playerRow, row.isPitcher && styles.pitcherRow]}>
          {/* 打順バッジ / 投手アイコン */}
          <View style={[styles.orderBadge, row.isPitcher && styles.pitcherBadge]}>
            {row.isPitcher
              ? <MaterialCommunityIcons name="baseball" size={13} color={Colors.white} />
              : <Text style={styles.orderText}>{row.order}</Text>}
          </View>

          {/* ポジション選択ボタン — 投手は固定表示、それ以外はダイヤモンドピッカー */}
          {row.isPitcher ? (
            <View style={[styles.positionBtn, styles.positionBtnFixed]}>
              <Text style={styles.positionBtnText}>P</Text>
            </View>
          ) : (
            <PositionDiamondPicker
              value={row.position}
              availablePositions={selectablePositions(teamHasDH)}
              onChange={(pos) => updateRow(row.player.id, 'position', pos)}
              isDuplicate={duplicateIds.has(row.player.id)}
              label={row.position || '未設定'}
              positionLabels={t.positions}
            />
          )}

          {/* 氏名 */}
          <TextInput
            style={styles.nameInput}
            value={row.name}
            onChangeText={(v) => updateRow(row.player.id, 'name', v)}
            placeholder="選手名"
            placeholderTextColor={Colors.textSecondary}
            selectTextOnFocus
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
            selectTextOnFocus
            keyboardType="number-pad"
            mode="outlined"
            outlineColor={Colors.border}
            activeOutlineColor={Colors.primary}
            dense
            label="#"
          />

          {/* 投/打 セレクター */}
          <View style={styles.handednessGroup}>
            {/* 投げ方: ピッチャーのみ表示 */}
            {(row.isPitcher || row.position === 'P') && (
              <View style={styles.handednessItem}>
                <Text style={styles.handednessLabel}>投</Text>
                <ThrowsMenuButton
                  throws={row.throws}
                  onUpdate={(v) => updateRow(row.player.id, 'throws', v)}
                />
              </View>
            )}
            <View style={styles.handednessItem}>
              <Text style={styles.handednessLabel}>打</Text>
              <BatsMenuButton
                bats={row.bats}
                onUpdate={(v) => updateRow(row.player.id, 'bats', v)}
              />
            </View>
          </View>
        </View>
      ))}
    </View>
    );
  };

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

        <TouchableOpacity
          style={styles.reassignBtn}
          onPress={() => {
            if (hasChanges) {
              Alert.alert('先に選手情報を保存してください', '未保存の選手情報があるため、保存後に投手記録を移してください。');
              return;
            }
            setShowPitcherReassignment(true);
          }}
          activeOpacity={0.8}
        >
          <MaterialCommunityIcons name="baseball" size={18} color={Colors.error} />
          <Text style={styles.reassignBtnText}>投手記録を正しい選手へ移す</Text>
        </TouchableOpacity>

        <FlatList
          data={[1]}
          keyExtractor={() => 'main'}
          renderItem={() => (
            <View style={styles.listContent}>
              {renderSection(game.awayTeam.name + '（先攻）', awayRows, Colors.primary, 'away')}
              {renderSection(game.homeTeam.name + '（後攻）', homeRows, Colors.secondary, 'home')}
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

      {game && (
        <PitcherReassignmentModal
          visible={showPitcherReassignment}
          game={game}
          mode="live"
          onClose={() => setShowPitcherReassignment(false)}
          onSaved={() => {}}
          onReassignLive={reassignActivePitcherRecords}
          onReload={async () => {
            const local = await db.games.get(game.id);
            if (!local) return null;
            await loadGame(game.id);
            return useGameStore.getState().game;
          }}
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
  reassignBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.xs,
    marginHorizontal: Spacing.md,
    marginTop: Spacing.sm,
    paddingVertical: Spacing.sm,
    borderWidth: 1,
    borderColor: Colors.error,
    borderRadius: BorderRadius.md,
    backgroundColor: '#FFF3F3',
  },
  reassignBtnText: {
    color: Colors.error,
    fontSize: Typography.bodySmall,
    fontWeight: '700',
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
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  sectionTitle: {
    fontSize: Typography.bodySmall,
    fontWeight: '700',
    color: Colors.white,
  },
  dhToggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  dhToggleLabel: {
    fontSize: Typography.caption,
    fontWeight: '700',
    color: Colors.white,
    opacity: 0.9,
  },
  pitcherRow: {
    backgroundColor: '#FFF8F8',
  },
  pitcherBadge: {
    backgroundColor: Colors.secondary,
  },
  positionBtn: {
    width: 44,
    height: 36,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    backgroundColor: Colors.surfaceGray,
    borderRadius: BorderRadius.sm,
  },
  positionBtnFixed: {
    opacity: 0.7,
  },
  positionBtnText: {
    fontSize: Typography.bodySmall,
    fontWeight: '700' as const,
    color: Colors.textSecondary,
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
  handednessGroup: {
    flexDirection: 'row',
    gap: 4,
  },
  handednessItem: {
    alignItems: 'center',
    gap: 2,
  },
  handednessLabel: {
    fontSize: 9,
    fontWeight: '600',
    color: Colors.textSecondary,
  },
  throwsButton: {
    width: 32,
    height: 32,
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
    borderColor: Colors.secondary + '80',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: Colors.background,
  },
  throwsButtonText: {
    fontSize: Typography.caption,
    fontWeight: '600',
    color: Colors.secondary,
  },
  batsButton: {
    width: 32,
    height: 32,
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
    borderColor: Colors.primary + '80',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: Colors.background,
  },
  batsButtonText: {
    fontSize: Typography.caption,
    fontWeight: '600',
    color: Colors.primary,
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
