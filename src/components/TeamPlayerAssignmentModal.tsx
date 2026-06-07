/**
 * チームの選手↔アカウント紐付けを編集するモーダル
 */
import React, { useCallback, useEffect, useState } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  StyleSheet,
  Alert,
  TextInput,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { getTeamMembers } from '../services/teamService';
import {
  getTeamPlayerAssignments,
  saveTeamPlayerAssignment,
  deleteTeamPlayerAssignment,
} from '../services/teamPlayerAssignmentService';
import type { TeamPlayerAssignment } from '../models/types';
import type { User } from '../models/types';
import { Colors, Spacing, Typography, BorderRadius } from '../constants/theme';

interface Props {
  visible: boolean;
  onClose: () => void;
  teamId: string;
  teamName?: string;
}

export default function TeamPlayerAssignmentModal({
  visible,
  onClose,
  teamId,
  teamName,
}: Props) {
  const [assignments, setAssignments] = useState<TeamPlayerAssignment[]>([]);
  const [members, setMembers] = useState<(User & { userId: string })[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [newPlayerName, setNewPlayerName] = useState('');
  const [pickerFor, setPickerFor] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!teamId) return;
    setLoading(true);
    try {
      const [a, m] = await Promise.all([
        getTeamPlayerAssignments(teamId),
        getTeamMembers(teamId),
      ]);
      setAssignments(a);
      setMembers(m.map((row) => ({ ...row.user, userId: row.userId })));
    } catch (e: unknown) {
      Alert.alert('エラー', (e as Error)?.message ?? '読み込みに失敗しました。');
    } finally {
      setLoading(false);
    }
  }, [teamId]);

  useEffect(() => {
    if (visible) load();
  }, [visible, load]);

  const handleAssign = async (playerName: string, userId: string, displayName: string) => {
    setSaving(true);
    try {
      await saveTeamPlayerAssignment(teamId, {
        playerId: playerName,
        playerName,
        userId,
        displayName,
      });
      setPickerFor(null);
      await load();
    } catch (e: unknown) {
      Alert.alert('エラー', (e as Error)?.message ?? '保存に失敗しました。');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = (playerName: string) => {
    Alert.alert('削除の確認', `「${playerName}」の紐付けを削除しますか？`, [
      { text: 'キャンセル', style: 'cancel' },
      {
        text: '削除',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteTeamPlayerAssignment(teamId, playerName);
            await load();
          } catch (e: unknown) {
            Alert.alert('エラー', (e as Error)?.message ?? '削除に失敗しました。');
          }
        },
      },
    ]);
  };

  const handleAdd = () => {
    const name = newPlayerName.trim();
    if (!name) return;
    setPickerFor(name);
    setNewPlayerName('');
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <TouchableOpacity style={s.backdrop} activeOpacity={1} onPress={onClose}>
        <TouchableOpacity activeOpacity={1} style={s.sheet} onPress={(e) => e.stopPropagation()}>
          <View style={s.handle} />
          <Text style={s.title}>選手紐付けを編集</Text>
          {teamName ? <Text style={s.subtitle}>{teamName}</Text> : null}

          {loading ? (
            <ActivityIndicator color={Colors.primary} style={{ marginVertical: Spacing.lg }} />
          ) : (
            <>
              <FlatList
                data={assignments}
                keyExtractor={(item) => item.playerName}
                style={s.list}
                ListEmptyComponent={
                  <Text style={s.empty}>紐付けがありません</Text>
                }
                renderItem={({ item }) => (
                  <View style={s.row}>
                    <View style={s.rowInfo}>
                      <Text style={s.playerName}>{item.playerName}</Text>
                      <Text style={s.memberName}>{item.displayName}</Text>
                    </View>
                    <TouchableOpacity onPress={() => setPickerFor(item.playerName)} style={s.iconBtn}>
                      <MaterialCommunityIcons name="account-switch" size={20} color={Colors.primary} />
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => handleDelete(item.playerName)} style={s.iconBtn}>
                      <MaterialCommunityIcons name="delete-outline" size={20} color={Colors.secondary} />
                    </TouchableOpacity>
                  </View>
                )}
              />

              <View style={s.addRow}>
                <TextInput
                  style={s.input}
                  placeholder="選手名を入力"
                  value={newPlayerName}
                  onChangeText={setNewPlayerName}
                  placeholderTextColor={Colors.textSecondary}
                />
                <TouchableOpacity style={s.addBtn} onPress={handleAdd} disabled={!newPlayerName.trim()}>
                  <Text style={s.addBtnText}>追加</Text>
                </TouchableOpacity>
              </View>
            </>
          )}

          <TouchableOpacity style={s.closeBtn} onPress={onClose}>
            <Text style={s.closeText}>閉じる</Text>
          </TouchableOpacity>
        </TouchableOpacity>
      </TouchableOpacity>

      {/* メンバー選択 */}
      <Modal visible={pickerFor !== null} transparent animationType="fade">
        <TouchableOpacity style={s.pickerBackdrop} activeOpacity={1} onPress={() => setPickerFor(null)}>
          <View style={s.pickerSheet}>
            <Text style={s.pickerTitle}>
              {pickerFor} に割り当てるメンバー
            </Text>
            {members.map((m) => (
              <TouchableOpacity
                key={m.userId}
                style={s.pickerItem}
                disabled={saving}
                onPress={() => handleAssign(pickerFor!, m.userId, m.displayName)}
              >
                <Text style={s.pickerItemText}>{m.displayName}</Text>
              </TouchableOpacity>
            ))}
            <TouchableOpacity style={s.pickerCancel} onPress={() => setPickerFor(null)}>
              <Text style={s.pickerCancelText}>キャンセル</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>
    </Modal>
  );
}

const s = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: Colors.white,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: Spacing.md,
    paddingBottom: Spacing.xl,
    maxHeight: '80%',
  },
  handle: {
    width: 40,
    height: 4,
    backgroundColor: Colors.border,
    borderRadius: 2,
    alignSelf: 'center',
    marginTop: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  title: {
    fontSize: Typography.h4,
    fontWeight: '700',
    textAlign: 'center',
    color: Colors.text,
  },
  subtitle: {
    fontSize: Typography.bodySmall,
    textAlign: 'center',
    color: Colors.textSecondary,
    marginBottom: Spacing.sm,
  },
  list: { maxHeight: 280, marginVertical: Spacing.sm },
  empty: {
    textAlign: 'center',
    color: Colors.textSecondary,
    paddingVertical: Spacing.lg,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.border,
  },
  rowInfo: { flex: 1 },
  playerName: { fontSize: 14, fontWeight: '600', color: Colors.text },
  memberName: { fontSize: 12, color: Colors.textSecondary, marginTop: 2 },
  iconBtn: { padding: 8 },
  addRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginTop: Spacing.sm,
  },
  input: {
    flex: 1,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: BorderRadius.sm,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 8,
    fontSize: 14,
    color: Colors.text,
  },
  addBtn: {
    backgroundColor: Colors.primary,
    borderRadius: BorderRadius.sm,
    paddingHorizontal: Spacing.md,
    justifyContent: 'center',
  },
  addBtnText: { color: Colors.white, fontWeight: '600' },
  closeBtn: {
    marginTop: Spacing.md,
    paddingVertical: 12,
    alignItems: 'center',
    backgroundColor: Colors.card,
    borderRadius: BorderRadius.sm,
  },
  closeText: { color: Colors.textSecondary, fontWeight: '600' },
  pickerBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    padding: Spacing.lg,
  },
  pickerSheet: {
    backgroundColor: Colors.white,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    maxHeight: '60%',
  },
  pickerTitle: {
    fontSize: Typography.body,
    fontWeight: '700',
    marginBottom: Spacing.sm,
    color: Colors.text,
  },
  pickerItem: {
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.border,
  },
  pickerItemText: { fontSize: 15, color: Colors.text },
  pickerCancel: { paddingVertical: 14, alignItems: 'center', marginTop: Spacing.sm },
  pickerCancelText: { color: Colors.textSecondary, fontWeight: '600' },
});
