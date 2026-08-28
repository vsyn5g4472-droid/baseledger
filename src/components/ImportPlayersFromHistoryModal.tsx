/**
 * 記録済みチーム名から選手を名簿へ一括追加するモーダル。
 */
import React, { useCallback, useEffect, useState } from 'react';
import {
  Modal,
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { addTeamPlayer, getTeamPlayers } from '../services/teamPlayerService';
import {
  listPlayersForRecordedTeamName,
  listRecordedTeamNames,
  type HistoryPlayerCandidate,
} from '../services/gamePlayerEditService';
import { Colors, Spacing, Typography, BorderRadius } from '../constants/theme';

interface Props {
  visible: boolean;
  teamId: string;
  teamName: string;
  onClose: () => void;
  onImported: (added: { id: string; name: string; number: number | null; position: string }[]) => void;
}

type Step = 'teams' | 'players';

export default function ImportPlayersFromHistoryModal({
  visible,
  teamId,
  teamName,
  onClose,
  onImported,
}: Props) {
  const [step, setStep] = useState<Step>('teams');
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [teamNames, setTeamNames] = useState<string[]>([]);
  const [selectedTeamName, setSelectedTeamName] = useState<string | null>(null);
  const [candidates, setCandidates] = useState<HistoryPlayerCandidate[]>([]);
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());

  const reset = useCallback(() => {
    setStep('teams');
    setSelectedTeamName(null);
    setCandidates([]);
    setSelectedKeys(new Set());
  }, []);

  useEffect(() => {
    if (!visible) {
      reset();
      return;
    }
    setLoading(true);
    listRecordedTeamNames()
      .then(setTeamNames)
      .catch(() => setTeamNames([]))
      .finally(() => setLoading(false));
  }, [visible, reset]);

  const handleSelectTeamName = useCallback(async (name: string) => {
    setSelectedTeamName(name);
    setLoading(true);
    try {
      const list = await listPlayersForRecordedTeamName(name);
      setCandidates(list);
      setSelectedKeys(new Set(list.map((c) => c.key)));
      setStep('players');
    } catch {
      Alert.alert('エラー', '選手一覧の取得に失敗しました。');
    } finally {
      setLoading(false);
    }
  }, []);

  const toggleKey = useCallback((key: string) => {
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const handleImport = useCallback(async () => {
    if (!selectedTeamName || selectedKeys.size === 0) return;
    setImporting(true);
    try {
      const existing = await getTeamPlayers(teamId);
      const existingNames = new Set(existing.map((p) => p.name));
      const toAdd = candidates.filter(
        (c) => selectedKeys.has(c.key) && !existingNames.has(c.name),
      );
      const skipped = candidates.filter(
        (c) => selectedKeys.has(c.key) && existingNames.has(c.name),
      ).length;

      const added: { id: string; name: string; number: number | null; position: string }[] = [];
      for (const c of toAdd) {
        const p = await addTeamPlayer(teamId, {
          name: c.name,
          number: c.number,
          position: c.position,
          bats: c.bats,
          throws: c.throws,
        });
        added.push({ id: p.id, name: p.name, number: p.number, position: p.position });
      }

      onImported(added);
      Alert.alert(
        '追加しました',
        [
          added.length > 0 ? `${added.length}人を「${teamName}」に追加しました。` : null,
          skipped > 0 ? `同名のためスキップ: ${skipped}人` : null,
          added.length === 0 && skipped === 0 ? '追加できる選手がありませんでした。' : null,
        ].filter(Boolean).join('\n'),
      );
      onClose();
    } catch (e: unknown) {
      Alert.alert('エラー', (e as Error)?.message ?? '追加に失敗しました。');
    } finally {
      setImporting(false);
    }
  }, [candidates, onClose, onImported, selectedKeys, selectedTeamName, teamId, teamName]);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={onClose}>
        <TouchableOpacity activeOpacity={1} style={styles.sheet} onPress={(e) => e.stopPropagation()}>
          <View style={styles.handle} />
          <Text style={styles.title}>過去の試合から追加</Text>
          <Text style={styles.hint}>追加先: {teamName}</Text>

          {loading ? (
            <ActivityIndicator color={Colors.primary} style={{ marginVertical: Spacing.lg }} />
          ) : step === 'teams' ? (
            <>
              <Text style={styles.section}>記録したことのあるチーム</Text>
              {teamNames.length === 0 ? (
                <Text style={styles.empty}>試合記録がありません</Text>
              ) : (
                <FlatList
                  data={teamNames}
                  keyExtractor={(n) => n}
                  style={styles.list}
                  renderItem={({ item }) => (
                    <TouchableOpacity
                      style={styles.teamRow}
                      onPress={() => handleSelectTeamName(item)}
                    >
                      <MaterialCommunityIcons name="account-group" size={18} color={Colors.primary} />
                      <Text style={styles.teamRowText}>{item}</Text>
                      <MaterialCommunityIcons name="chevron-right" size={18} color={Colors.textSecondary} />
                    </TouchableOpacity>
                  )}
                />
              )}
            </>
          ) : (
            <>
              <TouchableOpacity style={styles.backRow} onPress={() => setStep('teams')}>
                <MaterialCommunityIcons name="arrow-left" size={18} color={Colors.primary} />
                <Text style={styles.backText}>{selectedTeamName}</Text>
              </TouchableOpacity>
              <Text style={styles.section}>追加する選手（{selectedKeys.size}人選択）</Text>
              {candidates.length === 0 ? (
                <Text style={styles.empty}>選手がいません</Text>
              ) : (
                <FlatList
                  data={candidates}
                  keyExtractor={(c) => c.key}
                  style={styles.list}
                  renderItem={({ item }) => {
                    const checked = selectedKeys.has(item.key);
                    return (
                      <TouchableOpacity
                        style={styles.playerRow}
                        onPress={() => toggleKey(item.key)}
                      >
                        <MaterialCommunityIcons
                          name={checked ? 'checkbox-marked' : 'checkbox-blank-outline'}
                          size={22}
                          color={checked ? Colors.primary : Colors.textSecondary}
                        />
                        <Text style={styles.playerNum}>
                          {item.number != null ? `#${item.number}` : '—'}
                        </Text>
                        <Text style={styles.playerName}>{item.name}</Text>
                        <Text style={styles.playerPos}>{item.position || '—'}</Text>
                      </TouchableOpacity>
                    );
                  }}
                />
              )}
              <TouchableOpacity
                style={[styles.importBtn, (importing || selectedKeys.size === 0) && styles.importBtnDisabled]}
                onPress={handleImport}
                disabled={importing || selectedKeys.size === 0}
              >
                {importing ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.importBtnText}>選択した選手を追加</Text>
                )}
              </TouchableOpacity>
            </>
          )}

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
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingHorizontal: Spacing.md,
    paddingBottom: Spacing.xl,
    maxHeight: '85%',
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
    fontSize: Typography.body,
    fontWeight: '700',
    color: Colors.text,
  },
  hint: {
    fontSize: Typography.caption,
    color: Colors.textSecondary,
    marginBottom: Spacing.md,
  },
  section: {
    fontSize: Typography.bodySmall,
    fontWeight: '700',
    color: Colors.text,
    marginBottom: Spacing.sm,
  },
  list: { flexGrow: 0, maxHeight: 360 },
  empty: {
    fontSize: Typography.bodySmall,
    color: Colors.textSecondary,
    textAlign: 'center',
    paddingVertical: Spacing.lg,
  },
  teamRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingVertical: Spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.border,
  },
  teamRowText: {
    flex: 1,
    fontSize: Typography.body,
    color: Colors.text,
    fontWeight: '600',
  },
  backRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: Spacing.sm,
  },
  backText: {
    fontSize: Typography.bodySmall,
    color: Colors.primary,
    fontWeight: '600',
  },
  playerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.border,
  },
  playerNum: {
    width: 36,
    fontSize: Typography.caption,
    color: Colors.textSecondary,
  },
  playerName: {
    flex: 1,
    fontSize: Typography.body,
    color: Colors.text,
    fontWeight: '600',
  },
  playerPos: {
    fontSize: Typography.caption,
    color: Colors.textSecondary,
    minWidth: 28,
    textAlign: 'right',
  },
  importBtn: {
    marginTop: Spacing.md,
    backgroundColor: Colors.primary,
    borderRadius: BorderRadius.md,
    paddingVertical: 12,
    alignItems: 'center',
  },
  importBtnDisabled: { opacity: 0.5 },
  importBtnText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: Typography.body,
  },
  closeBtn: {
    marginTop: Spacing.sm,
    alignItems: 'center',
    paddingVertical: Spacing.sm,
  },
  closeBtnText: {
    fontSize: Typography.body,
    color: Colors.primary,
    fontWeight: '600',
  },
});
