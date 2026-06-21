import React, { useState, useEffect, useCallback } from 'react';
import { View, ScrollView, TouchableOpacity, Alert, StyleSheet, TextInput as RNTextInput, SafeAreaView } from 'react-native';
import { Text, ActivityIndicator } from 'react-native-paper';
import { useLocalSearchParams, router } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Colors, Spacing, Typography, BorderRadius } from '../../../src/constants/theme';
import { POSITIONS } from '../../../src/types/game';
import type { Position } from '../../../src/types/game';
import { getTeamPlayers, addTeamPlayer, updateTeamPlayer, deleteTeamPlayer } from '../../../src/services/teamPlayerService';
import { updateTeam } from '../../../src/services/teamService';
import type { TeamPlayer } from '../../../src/models/types';

type BatType = 'L' | 'R' | 'S';
type ThrowType = 'L' | 'R';

type PlayerForm = { name: string; number: string; position: Position; bats: BatType; throws: ThrowType };

const SELECTABLE_POSITIONS = POSITIONS.filter((p) => p !== '') as Exclude<Position, ''>[];

const defaultForm = (): PlayerForm => ({
  name: '',
  number: '',
  position: '' as Position,
  bats: 'R',
  throws: 'R',
});

export default function TeamEditScreen() {
  const { teamId, teamName: initialTeamName } = useLocalSearchParams<{ teamId: string; teamName: string }>();

  const [teamName, setTeamName] = useState(initialTeamName ?? '');
  const [savingTeamName, setSavingTeamName] = useState(false);
  const [players, setPlayers] = useState<TeamPlayer[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingPlayerId, setEditingPlayerId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<PlayerForm>(defaultForm());
  const [addingPlayer, setAddingPlayer] = useState(false);
  const [newForm, setNewForm] = useState<PlayerForm>(defaultForm());
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!teamId) return;
    setLoading(true);
    getTeamPlayers(teamId)
      .then(setPlayers)
      .finally(() => setLoading(false));
  }, [teamId]);

  const handleSaveTeamName = useCallback(async () => {
    if (!teamId || !teamName.trim()) return;
    setSavingTeamName(true);
    try {
      await updateTeam(teamId, { name: teamName.trim() });
      setSavingTeamName(false);
      Alert.alert('保存しました', 'チーム名を更新しました', [
        { text: 'OK', onPress: () => router.back() },
      ]);
    } catch (_e) {
      setSavingTeamName(false);
    }
  }, [teamId, teamName]);

  const handleStartEdit = useCallback((player: TeamPlayer) => {
    setEditingPlayerId(player.id);
    setEditForm({
      name: player.name,
      number: player.number != null ? String(player.number) : '',
      position: (player.position as Position) || ('' as Position),
      bats: player.bats,
      throws: player.throws,
    });
  }, []);

  const handleSaveEdit = useCallback(async () => {
    if (!teamId || !editingPlayerId || !editForm.name.trim()) return;
    setSaving(true);
    try {
      await updateTeamPlayer(teamId, editingPlayerId, {
        name: editForm.name.trim(),
        number: editForm.number.trim() ? parseInt(editForm.number, 10) : null,
        position: editForm.position,
        bats: editForm.bats,
        throws: editForm.throws,
      });
      setPlayers((ps) =>
        ps.map((p) =>
          p.id === editingPlayerId
            ? {
                ...p,
                name: editForm.name.trim(),
                number: editForm.number.trim() ? parseInt(editForm.number, 10) : null,
                position: editForm.position,
                bats: editForm.bats,
                throws: editForm.throws,
              }
            : p
        )
      );
      setEditingPlayerId(null);
    } finally {
      setSaving(false);
    }
  }, [teamId, editingPlayerId, editForm]);

  const handleAddPlayer = useCallback(async () => {
    if (!teamId || !newForm.name.trim()) return;
    setSaving(true);
    try {
      const p = await addTeamPlayer(teamId, {
        name: newForm.name.trim(),
        number: newForm.number.trim() ? parseInt(newForm.number, 10) : null,
        position: newForm.position,
        bats: newForm.bats,
        throws: newForm.throws,
      });
      setPlayers((ps) => [...ps, p]);
      setNewForm(defaultForm());
      setAddingPlayer(false);
    } finally {
      setSaving(false);
    }
  }, [teamId, newForm]);

  const handleDelete = useCallback(
    (player: TeamPlayer) => {
      Alert.alert('選手を削除', `「${player.name}」を削除しますか？`, [
        { text: 'キャンセル', style: 'cancel' },
        {
          text: '削除',
          style: 'destructive',
          onPress: async () => {
            await deleteTeamPlayer(teamId, player.id);
            setPlayers((ps) => ps.filter((p) => p.id !== player.id));
          },
        },
      ]);
    },
    [teamId]
  );

  const renderForm = (
    form: PlayerForm,
    setForm: React.Dispatch<React.SetStateAction<PlayerForm>>,
    onSave: () => void,
    onCancel: () => void,
  ) => (
    <View style={styles.editForm}>
      <RNTextInput
        style={styles.formInput}
        placeholder="選手名"
        value={form.name}
        onChangeText={(v) => setForm((s) => ({ ...s, name: v }))}
        placeholderTextColor={Colors.textSecondary}
      />
      <RNTextInput
        style={[styles.formInput, styles.formInputShort]}
        placeholder="背番号"
        value={form.number}
        onChangeText={(v) => setForm((s) => ({ ...s, number: v }))}
        keyboardType="numeric"
        placeholderTextColor={Colors.textSecondary}
      />

      <Text style={styles.formLabel}>ポジション</Text>
      <View style={styles.posGrid}>
        {SELECTABLE_POSITIONS.map((pos) => (
          <TouchableOpacity
            key={pos}
            style={[styles.posBtn, form.position === pos && styles.posBtnActive]}
            onPress={() => setForm((s) => ({ ...s, position: pos }))}
          >
            <Text style={[styles.posBtnText, form.position === pos && styles.posBtnTextActive]}>{pos}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <Text style={styles.formLabel}>打席</Text>
      <View style={styles.toggleRow}>
        {(['R', 'L', 'S'] as BatType[]).map((b) => (
          <TouchableOpacity
            key={b}
            style={[styles.toggleBtn, form.bats === b && styles.toggleBtnActive]}
            onPress={() => setForm((s) => ({ ...s, bats: b }))}
          >
            <Text style={[styles.toggleBtnText, form.bats === b && styles.toggleBtnTextActive]}>
              {b === 'R' ? '右' : b === 'L' ? '左' : '両'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {form.position === 'P' && (
        <>
          <Text style={styles.formLabel}>投球</Text>
          <View style={styles.toggleRow}>
            {(['R', 'L'] as ThrowType[]).map((t) => (
              <TouchableOpacity
                key={t}
                style={[styles.toggleBtn, form.throws === t && styles.toggleBtnActive]}
                onPress={() => setForm((s) => ({ ...s, throws: t }))}
              >
                <Text style={[styles.toggleBtnText, form.throws === t && styles.toggleBtnTextActive]}>
                  {t === 'R' ? '右' : '左'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </>
      )}

      <View style={styles.formBtns}>
        <TouchableOpacity
          style={[styles.saveBtn, (!form.name.trim() || saving) && styles.saveBtnDisabled]}
          onPress={onSave}
          disabled={!form.name.trim() || saving}
        >
          {saving ? (
            <ActivityIndicator size="small" color={Colors.white} />
          ) : (
            <Text style={styles.saveBtnText}>保存</Text>
          )}
        </TouchableOpacity>
        <TouchableOpacity style={styles.cancelBtn} onPress={onCancel}>
          <Text style={styles.cancelBtnText}>キャンセル</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      {/* ヘッダー */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.iconBtn} onPress={() => router.back()}>
          <MaterialCommunityIcons name="arrow-left" size={24} color={Colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>チーム編集</Text>
        <View style={{ width: 32 }} />
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 32 }}>
        {/* チーム名セクション */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>チーム名</Text>
          <View style={styles.row}>
            <RNTextInput
              style={[styles.input, { flex: 1 }]}
              value={teamName}
              onChangeText={setTeamName}
              placeholder="チーム名"
              placeholderTextColor={Colors.textSecondary}
            />
            <TouchableOpacity
              style={[styles.saveBtn, (!teamName.trim() || savingTeamName) && styles.saveBtnDisabled]}
              onPress={handleSaveTeamName}
              disabled={!teamName.trim() || savingTeamName}
            >
              {savingTeamName ? (
                <ActivityIndicator size="small" color={Colors.white} />
              ) : (
                <Text style={styles.saveBtnText}>保存</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>

        {/* 選手一覧セクション */}
        <View style={[styles.section, { paddingBottom: 0 }]}>
          <View style={styles.sectionLabelRow}>
            <Text style={styles.sectionLabel}>選手（{players.length}人）</Text>
            <TouchableOpacity
              style={styles.addPlayerBtn}
              onPress={() => { setAddingPlayer(true); setEditingPlayerId(null); }}
            >
              <MaterialCommunityIcons name="account-plus" size={16} color={Colors.primary} />
              <Text style={styles.addPlayerBtnText}>＋ 追加</Text>
            </TouchableOpacity>
          </View>
        </View>

        {loading ? (
          <ActivityIndicator size="small" color={Colors.primary} style={{ margin: Spacing.md }} />
        ) : (
          <>
            {players.map((player) => (
              <View key={player.id} style={styles.playerCard}>
                <View style={styles.playerRow}>
                  <Text style={styles.playerNum}>{player.number != null ? `#${player.number}` : '—'}</Text>
                  <Text style={styles.playerName} numberOfLines={1}>{player.name}</Text>
                  <Text style={styles.playerPos}>{player.position || '—'}</Text>
                  <Text style={styles.playerBats}>{player.bats}</Text>
                  {player.position === 'P' && <Text style={styles.playerThrows}>{player.throws}</Text>}
                  <TouchableOpacity style={styles.iconBtn} onPress={() => handleStartEdit(player)}>
                    <MaterialCommunityIcons name="pencil" size={18} color={Colors.primary} />
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.iconBtn} onPress={() => handleDelete(player)}>
                    <MaterialCommunityIcons name="trash-can-outline" size={18} color={Colors.error} />
                  </TouchableOpacity>
                </View>
                {editingPlayerId === player.id &&
                  renderForm(editForm, setEditForm, handleSaveEdit, () => setEditingPlayerId(null))}
              </View>
            ))}

            {addingPlayer && (
              <View style={styles.addPlayerCard}>
                <Text style={styles.sectionLabel}>新規選手</Text>
                {renderForm(newForm, setNewForm, handleAddPlayer, () => {
                  setAddingPlayer(false);
                  setNewForm(defaultForm());
                })}
              </View>
            )}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    backgroundColor: Colors.card,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    fontSize: Typography.h3,
    fontWeight: '700',
    color: Colors.text,
  },
  iconBtn: { padding: 4 },
  section: {
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.sm,
  },
  sectionLabel: {
    fontSize: Typography.caption,
    fontWeight: '600',
    color: Colors.textSecondary,
    marginBottom: Spacing.xs,
  },
  sectionLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.xs,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  input: {
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: BorderRadius.sm,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 8,
    fontSize: Typography.body,
    color: Colors.text,
    backgroundColor: Colors.card,
  },
  saveBtn: {
    paddingHorizontal: Spacing.md,
    paddingVertical: 10,
    backgroundColor: Colors.primary,
    borderRadius: BorderRadius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 60,
  },
  saveBtnDisabled: { opacity: 0.4 },
  saveBtnText: {
    color: Colors.white,
    fontWeight: '600',
    fontSize: Typography.bodySmall,
  },
  cancelBtn: {
    paddingHorizontal: Spacing.md,
    paddingVertical: 10,
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 60,
  },
  cancelBtnText: {
    color: Colors.textSecondary,
    fontWeight: '600',
    fontSize: Typography.bodySmall,
  },
  playerCard: {
    backgroundColor: Colors.card,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  playerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  playerNum: {
    fontSize: Typography.caption,
    color: Colors.textSecondary,
    width: 36,
  },
  playerName: {
    flex: 1,
    fontSize: Typography.body,
    color: Colors.text,
  },
  playerPos: {
    fontSize: Typography.caption,
    color: Colors.textSecondary,
    width: 36,
  },
  playerBats: {
    fontSize: Typography.caption,
    color: Colors.textSecondary,
    width: 20,
    textAlign: 'center',
  },
  playerThrows: {
    fontSize: Typography.caption,
    color: Colors.textSecondary,
    width: 20,
    textAlign: 'center',
  },
  addPlayerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  addPlayerBtnText: {
    fontSize: Typography.bodySmall,
    color: Colors.primary,
    fontWeight: '600',
  },
  addPlayerCard: {
    backgroundColor: Colors.surfaceGray,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  editForm: {
    marginTop: Spacing.sm,
    gap: Spacing.xs,
  },
  formInput: {
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: BorderRadius.sm,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 8,
    fontSize: Typography.body,
    color: Colors.text,
    backgroundColor: Colors.card,
  },
  formInputShort: { width: 100 },
  formLabel: {
    fontSize: Typography.caption,
    color: Colors.textSecondary,
    fontWeight: '600',
    marginTop: 4,
  },
  posGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  posBtn: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.card,
  },
  posBtnActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  posBtnText: {
    fontSize: Typography.caption,
    color: Colors.text,
  },
  posBtnTextActive: { color: Colors.white },
  toggleRow: {
    flexDirection: 'row',
    gap: Spacing.xs,
  },
  toggleBtn: {
    paddingHorizontal: Spacing.md,
    paddingVertical: 6,
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.card,
  },
  toggleBtnActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  toggleBtnText: {
    fontSize: Typography.bodySmall,
    color: Colors.text,
  },
  toggleBtnTextActive: { color: Colors.white },
  formBtns: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginTop: 4,
  },
});
