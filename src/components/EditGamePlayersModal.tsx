/**
 * 終了試合の選手名を編集するモーダル。
 * realPlayerId がある場合は名簿（TeamPlayer）も同期される。
 */
import React, { useCallback, useEffect, useState } from 'react';
import {
  Modal,
  View,
  Text,
  FlatList,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
} from 'react-native';
import type { GameState } from '../types/game';
import {
  listEditablePlayers,
  renameGamePlayer,
} from '../services/gamePlayerEditService';
import { Colors, Spacing, Typography, BorderRadius } from '../constants/theme';

interface Props {
  visible: boolean;
  game: GameState;
  onClose: () => void;
  onSaved: (game: GameState) => void;
}

export default function EditGamePlayersModal({
  visible,
  game,
  onClose,
  onSaved,
}: Props) {
  const [rows, setRows] = useState(() => listEditablePlayers(game));
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [savingId, setSavingId] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) return;
    const list = listEditablePlayers(game);
    setRows(list);
    const initial: Record<string, string> = {};
    for (const r of list) initial[r.player.id] = r.player.name;
    setDrafts(initial);
  }, [visible, game]);

  const handleSave = useCallback(
    async (playerId: string) => {
      const name = (drafts[playerId] ?? '').trim();
      if (!name) {
        Alert.alert('エラー', '選手名を入力してください。');
        return;
      }
      const current = rows.find((r) => r.player.id === playerId)?.player.name;
      if (current === name) return;

      setSavingId(playerId);
      try {
        const updated = await renameGamePlayer(game.id, playerId, name);
        onSaved(updated);
        setRows(listEditablePlayers(updated));
        Alert.alert(
          '保存しました',
          rows.find((r) => r.player.id === playerId)?.player.realPlayerId
            ? '試合データと名簿の名前を更新しました。'
            : '試合データの名前を更新しました。',
        );
      } catch (e: unknown) {
        Alert.alert('エラー', (e as Error)?.message ?? '名前の変更に失敗しました。');
      } finally {
        setSavingId(null);
      }
    },
    [drafts, game.id, onSaved, rows],
  );

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={onClose}>
        <TouchableOpacity activeOpacity={1} style={styles.sheet} onPress={(e) => e.stopPropagation()}>
          <View style={styles.handle} />
          <Text style={styles.title}>選手名を編集</Text>
          <Text style={styles.hint}>
            名簿から選んだ選手は、名簿側の名前も同時に更新されます。
          </Text>
          <FlatList
            data={rows}
            keyExtractor={(item) => item.player.id}
            style={styles.list}
            keyboardShouldPersistTaps="handled"
            renderItem={({ item }) => {
              const dirty = (drafts[item.player.id] ?? '').trim() !== item.player.name;
              return (
                <View style={styles.row}>
                  <Text style={styles.side}>{item.side === 'away' ? '表' : '裏'} {item.teamName}</Text>
                  <View style={styles.editRow}>
                    <TextInput
                      style={styles.input}
                      value={drafts[item.player.id] ?? ''}
                      onChangeText={(v) =>
                        setDrafts((prev) => ({ ...prev, [item.player.id]: v }))
                      }
                      placeholder="選手名"
                      placeholderTextColor={Colors.textSecondary}
                    />
                    <TouchableOpacity
                      style={[styles.saveBtn, (!dirty || savingId === item.player.id) && styles.saveBtnDisabled]}
                      onPress={() => handleSave(item.player.id)}
                      disabled={!dirty || savingId === item.player.id}
                    >
                      {savingId === item.player.id ? (
                        <ActivityIndicator size="small" color="#fff" />
                      ) : (
                        <Text style={styles.saveBtnText}>保存</Text>
                      )}
                    </TouchableOpacity>
                  </View>
                  {item.player.realPlayerId ? (
                    <Text style={styles.linked}>名簿に紐づきあり</Text>
                  ) : null}
                </View>
              );
            }}
          />
          <TouchableOpacity style={styles.closeBtn} onPress={onClose}>
            <Text style={styles.closeBtnText}>閉じる</Text>
          </TouchableOpacity>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: Colors.card,
    borderTopLeftRadius: BorderRadius.xl ?? 16,
    borderTopRightRadius: BorderRadius.xl ?? 16,
    paddingHorizontal: Spacing.md,
    paddingBottom: Spacing.xl,
    maxHeight: '80%',
  },
  handle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.border,
    marginTop: Spacing.sm,
    marginBottom: Spacing.md,
  },
  title: {
    fontSize: Typography.h3 ?? Typography.body,
    fontWeight: '700',
    color: Colors.text,
    marginBottom: Spacing.xs,
  },
  hint: {
    fontSize: Typography.caption,
    color: Colors.textSecondary,
    marginBottom: Spacing.md,
  },
  list: { flexGrow: 0 },
  row: {
    marginBottom: Spacing.md,
    paddingBottom: Spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.border,
  },
  side: {
    fontSize: Typography.tiny,
    color: Colors.textSecondary,
    marginBottom: 4,
  },
  editRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  input: {
    flex: 1,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 8,
    fontSize: Typography.body,
    color: Colors.text,
    backgroundColor: Colors.background,
  },
  saveBtn: {
    backgroundColor: Colors.primary,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: 10,
    minWidth: 64,
    alignItems: 'center',
  },
  saveBtnDisabled: { opacity: 0.5 },
  saveBtnText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: Typography.bodySmall,
  },
  linked: {
    marginTop: 4,
    fontSize: Typography.tiny,
    color: Colors.primary,
  },
  closeBtn: {
    marginTop: Spacing.md,
    alignItems: 'center',
    paddingVertical: Spacing.sm,
  },
  closeBtnText: {
    fontSize: Typography.body,
    color: Colors.primary,
    fontWeight: '600',
  },
});
