import React, { useState, useEffect } from 'react';
import {
  View,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  Modal,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Text, TextInput, ActivityIndicator, Divider, Menu } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { getTeamPlayers, addTeamPlayer } from '../../services/teamPlayerService';
import type { TeamPlayer } from '../../models/types';
import { Colors, Spacing, Typography, BorderRadius } from '../../constants/theme';

const POSITIONS_LIST = ['P', 'C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF', 'DH'] as const;

interface Props {
  teamId: string;
  visible: boolean;
  onSelect: (player: TeamPlayer) => void;
  onDismiss: () => void;
}

export default function RosterPickerModal({ teamId, visible, onSelect, onDismiss }: Props) {
  const [players, setPlayers] = useState<TeamPlayer[]>([]);
  const [loading, setLoading] = useState(false);
  const [adding, setAdding] = useState(false);
  const [saving, setSaving] = useState(false);

  const [newName, setNewName] = useState('');
  const [newNumber, setNewNumber] = useState('');
  const [newPosition, setNewPosition] = useState('P');
  const [newBats, setNewBats] = useState<'L' | 'R' | 'S'>('R');
  const [posMenuVisible, setPosMenuVisible] = useState(false);
  const [batsMenuVisible, setBatsMenuVisible] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setLoading(true);
    getTeamPlayers(teamId)
      .then(setPlayers)
      .finally(() => setLoading(false));
  }, [visible, teamId]);

  const handleAdd = async () => {
    if (!newName.trim()) return;
    setSaving(true);
    try {
      const player = await addTeamPlayer(teamId, {
        name: newName.trim(),
        number: newNumber.trim() ? parseInt(newNumber, 10) : null,
        position: newPosition,
        bats: newBats,
        throws: 'R',
      });
      setPlayers((prev) => [...prev, player]);
      setNewName('');
      setNewNumber('');
      setNewPosition('P');
      setNewBats('R');
      setAdding(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onDismiss}>
      <View style={styles.overlay}>
        <KeyboardAvoidingView
          style={styles.sheet}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          {/* ヘッダー */}
          <View style={styles.header}>
            <Text style={styles.title}>名簿から選択</Text>
            <TouchableOpacity onPress={onDismiss}>
              <MaterialCommunityIcons name="close" size={24} color={Colors.text} />
            </TouchableOpacity>
          </View>

          <Divider />

          {/* 選手リスト */}
          {loading ? (
            <ActivityIndicator size="small" color={Colors.primary} style={styles.indicator} />
          ) : (
            <FlatList
              data={players}
              keyExtractor={(item) => item.id}
              style={styles.list}
              renderItem={({ item }) => (
                <TouchableOpacity style={styles.playerRow} onPress={() => onSelect(item)}>
                  <View style={styles.playerBadge}>
                    <Text style={styles.playerNumber}>{item.number ?? '—'}</Text>
                  </View>
                  <View style={styles.playerInfo}>
                    <Text style={styles.playerName}>{item.name}</Text>
                    <Text style={styles.playerMeta}>{item.position} · {item.bats}打</Text>
                  </View>
                  <MaterialCommunityIcons name="chevron-right" size={20} color={Colors.textSecondary} />
                </TouchableOpacity>
              )}
              ListEmptyComponent={
                <Text style={styles.empty}>登録選手がいません</Text>
              }
            />
          )}

          <Divider />

          {/* 新規選手追加フォーム / ボタン */}
          {adding ? (
            <View style={styles.addForm}>
              <Text style={styles.addFormTitle}>新規選手を追加</Text>
              <View style={styles.addRow}>
                <TextInput
                  mode="outlined"
                  label="氏名"
                  value={newName}
                  onChangeText={setNewName}
                  style={styles.nameInput}
                  dense
                />
                <TextInput
                  mode="outlined"
                  label="#"
                  value={newNumber}
                  onChangeText={setNewNumber}
                  keyboardType="numeric"
                  style={styles.numberInput}
                  dense
                />
              </View>
              <View style={styles.addRow}>
                <Menu
                  visible={posMenuVisible}
                  onDismiss={() => setPosMenuVisible(false)}
                  anchor={
                    <TouchableOpacity
                      style={styles.menuButton}
                      onPress={() => setPosMenuVisible(true)}
                    >
                      <Text style={styles.menuButtonLabel}>ポジション</Text>
                      <Text style={styles.menuButtonValue}>{newPosition}</Text>
                    </TouchableOpacity>
                  }
                >
                  {POSITIONS_LIST.map((pos) => (
                    <Menu.Item
                      key={pos}
                      title={pos}
                      onPress={() => { setNewPosition(pos); setPosMenuVisible(false); }}
                    />
                  ))}
                </Menu>
                <Menu
                  visible={batsMenuVisible}
                  onDismiss={() => setBatsMenuVisible(false)}
                  anchor={
                    <TouchableOpacity
                      style={styles.menuButton}
                      onPress={() => setBatsMenuVisible(true)}
                    >
                      <Text style={styles.menuButtonLabel}>打席</Text>
                      <Text style={styles.menuButtonValue}>{newBats}</Text>
                    </TouchableOpacity>
                  }
                >
                  {(['R', 'L', 'S'] as const).map((b) => (
                    <Menu.Item
                      key={b}
                      title={b}
                      onPress={() => { setNewBats(b); setBatsMenuVisible(false); }}
                    />
                  ))}
                </Menu>
              </View>
              <View style={styles.addButtons}>
                <TouchableOpacity style={styles.cancelBtn} onPress={() => setAdding(false)}>
                  <Text style={styles.cancelBtnText}>キャンセル</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.saveBtn, (!newName.trim() || saving) && styles.saveBtnDisabled]}
                  onPress={handleAdd}
                  disabled={!newName.trim() || saving}
                >
                  {saving
                    ? <ActivityIndicator size="small" color={Colors.white} />
                    : <Text style={styles.saveBtnText}>追加</Text>}
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            <TouchableOpacity style={styles.addButton} onPress={() => setAdding(true)}>
              <MaterialCommunityIcons name="account-plus" size={18} color={Colors.primary} />
              <Text style={styles.addButtonText}>新規選手を追加</Text>
            </TouchableOpacity>
          )}
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: Colors.white,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '80%',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: Spacing.md,
  },
  title: {
    fontSize: Typography.h4,
    fontWeight: '700',
    color: Colors.text,
  },
  indicator: { marginVertical: Spacing.lg },
  list: { maxHeight: 320 },
  playerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    gap: Spacing.sm,
  },
  playerBadge: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.surfaceGray,
    alignItems: 'center',
    justifyContent: 'center',
  },
  playerNumber: {
    fontSize: Typography.caption,
    fontWeight: '700',
    color: Colors.textSecondary,
  },
  playerInfo: { flex: 1 },
  playerName: {
    fontSize: Typography.body,
    fontWeight: '600',
    color: Colors.text,
  },
  playerMeta: {
    fontSize: Typography.caption,
    color: Colors.textSecondary,
    marginTop: 1,
  },
  empty: {
    fontSize: Typography.body,
    color: Colors.textSecondary,
    textAlign: 'center',
    paddingVertical: Spacing.xl,
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.xs,
    padding: Spacing.md,
  },
  addButtonText: {
    fontSize: Typography.body,
    fontWeight: '600',
    color: Colors.primary,
  },
  addForm: {
    padding: Spacing.md,
    gap: Spacing.sm,
  },
  addFormTitle: {
    fontSize: Typography.bodySmall,
    fontWeight: '700',
    color: Colors.text,
    marginBottom: Spacing.xs,
  },
  addRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
    alignItems: 'center',
  },
  nameInput: { flex: 1, backgroundColor: Colors.white },
  numberInput: { width: 64, backgroundColor: Colors.white },
  menuButton: {
    flex: 1,
    height: 44,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: BorderRadius.sm,
    paddingHorizontal: Spacing.sm,
    justifyContent: 'center',
  },
  menuButtonLabel: {
    fontSize: Typography.tiny,
    color: Colors.textSecondary,
  },
  menuButtonValue: {
    fontSize: Typography.bodySmall,
    fontWeight: '700',
    color: Colors.text,
  },
  addButtons: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginTop: Spacing.xs,
  },
  cancelBtn: {
    flex: 1,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
  },
  cancelBtnText: {
    fontSize: Typography.body,
    color: Colors.textSecondary,
  },
  saveBtn: {
    flex: 1,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.lg,
    backgroundColor: Colors.primary,
    alignItems: 'center',
  },
  saveBtnDisabled: { opacity: 0.4 },
  saveBtnText: {
    fontSize: Typography.body,
    fontWeight: '700',
    color: Colors.white,
  },
});
