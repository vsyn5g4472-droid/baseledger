import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import type { GameState } from '../types/game';
import {
  listPitcherAttributionCandidates,
  listPitcherReassignmentDestinations,
  type PitcherAttributionCandidate,
  type PitcherReassignmentInput,
} from '../services/pitcherReassignmentService';
import {
  applyCloudPitcherReassignmentToLocal,
  reassignFinishedGamePitcher,
  type FinishedPitcherReassignmentResult,
  type LocalPutResult,
} from '../services/pitcherReassignmentPersistence';
import {
  comparePitcherReassignmentLogs,
  type LogSetComparison,
} from '../services/gameService';
import { BorderRadius, Colors, Spacing, Typography } from '../constants/theme';

interface Props {
  visible: boolean;
  game: GameState;
  mode: 'live' | 'finished';
  userId?: string;
  onClose: () => void;
  onSaved: (game: GameState) => void;
  onReassignLive?: (input: PitcherReassignmentInput) => Promise<LocalPutResult>;
  onReload?: () => Promise<GameState | null | undefined>;
}

type ContainedState =
  | { kind: 'cloud_ok_local_failed'; logId: string }
  | { kind: 'unknown_local_state'; logId: string }
  | null;

function playerLabel(name: string, number: number | null): string {
  const readable = name.trim() || '(名前未設定)';
  return number == null ? readable : `#${number} ${readable}`;
}

function sourceLabel(source: PitcherAttributionCandidate): string {
  return source.pitcherName || '(不明な投手)';
}

function resultMessage(result: FinishedPitcherReassignmentResult): string {
  switch (result.kind) {
    case 'conflict_remote_changed':
      return '別の端末で試合が更新されています。クラウドの試合を再読込してからやり直してください。';
    case 'conflict_log_state':
      return '端末とクラウドの投手移管履歴が一致していません。同期状態を確認してからやり直してください。';
    case 'conflict_doc_missing':
      return 'クラウドの試合が見つかりませんでした。';
    case 'conflict_not_owner':
      return 'この試合の投手記録を変更する権限がありません。';
    case 'cloud_state_undeterminable':
      return 'クラウドの状態を確認できませんでした。通信状態を確認してください。';
    case 'cloud_commit_failed':
      return 'クラウドへ移管内容を保存できませんでした。端末の試合は変更していません。';
    case 'local_save_failed':
      return '端末へ移管内容を保存できませんでした。';
    default:
      return '投手記録の移管に失敗しました。';
  }
}

export default function PitcherReassignmentModal({
  visible,
  game,
  mode,
  userId,
  onClose,
  onSaved,
  onReassignLive,
  onReload,
}: Props) {
  const candidates = useMemo(() => listPitcherAttributionCandidates(game), [game]);
  const [sourceKey, setSourceKey] = useState('');
  const [destinationId, setDestinationId] = useState('');
  const [saving, setSaving] = useState(false);
  const [contained, setContained] = useState<ContainedState>(null);
  const [syncState, setSyncState] = useState<LogSetComparison | null>(null);
  const [checkingSync, setCheckingSync] = useState(false);

  const source = useMemo(
    () => candidates.find((item) => `${item.side}:${item.pitcherId}` === sourceKey) ?? null,
    [candidates, sourceKey],
  );
  const destinations = useMemo(
    () => (source ? listPitcherReassignmentDestinations(game, source) : []),
    [game, source],
  );

  const refreshSync = useCallback(async () => {
    if (mode !== 'finished' || !userId) return;
    setCheckingSync(true);
    try {
      setSyncState(await comparePitcherReassignmentLogs(game.id, userId));
    } finally {
      setCheckingSync(false);
    }
  }, [game.id, mode, userId]);

  useEffect(() => {
    if (!visible) return;
    setSourceKey('');
    setDestinationId('');
    setContained(null);
    setSyncState(null);
    void refreshSync();
  }, [visible, refreshSync]);

  const closeIfAllowed = useCallback(() => {
    if (!saving && !contained) onClose();
  }, [contained, onClose, saving]);

  const handleResult = useCallback(
    async (result: FinishedPitcherReassignmentResult) => {
      if (result.kind === 'success' || result.kind === 'already_applied') {
        onSaved(result.game);
        setSourceKey('');
        setDestinationId('');
        Alert.alert('移管しました', '投手記録を選択した選手へ移しました。');
        await refreshSync();
        return;
      }
      if (result.kind === 'cloud_ok_local_failed') {
        setContained({ kind: 'cloud_ok_local_failed', logId: result.logId });
        setSyncState({
          kind: 'cloud_ahead',
          missingLocally: [result.logId],
          cloudGame: result.cloudGame,
        });
        return;
      }
      if (result.kind === 'unknown_local_state') {
        setContained({ kind: 'unknown_local_state', logId: result.logId });
        return;
      }
      Alert.alert('移管できませんでした', resultMessage(result));
      await refreshSync();
    },
    [onSaved, refreshSync],
  );

  const executeReassignment = useCallback(async () => {
    if (!source || !destinationId || saving) return;
    const input: PitcherReassignmentInput = {
      logId: `pitcher-reassignment-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      side: source.side,
      fromPitcherId: source.pitcherId,
      toPitcherId: destinationId,
      reason: source.isUnassigned ? 'unassigned_pitcher_resolved' : 'manual_correction',
    };
    setSaving(true);
    try {
      if (mode === 'live') {
        if (!onReassignLive) throw new Error('試合中の移管処理が接続されていません。');
        const result = await onReassignLive(input);
        if (result.kind === 'applied') {
          onSaved(result.game);
          Alert.alert('移管しました', '投手記録を選択した選手へ移しました。Undo履歴は消去されました。');
          setSourceKey('');
          setDestinationId('');
        } else if (result.kind === 'unknown_local_state') {
          setContained({ kind: 'unknown_local_state', logId: input.logId });
        } else {
          Alert.alert('保存できませんでした', '端末の試合は移管前のままです。');
        }
      } else {
        await handleResult(await reassignFinishedGamePitcher(game.id, input, userId));
      }
    } catch (error) {
      Alert.alert('移管できませんでした', (error as Error)?.message ?? '投手記録の移管に失敗しました。');
    } finally {
      setSaving(false);
    }
  }, [destinationId, game.id, handleResult, mode, onReassignLive, onSaved, saving, source, userId]);

  const confirmReassignment = useCallback(() => {
    if (!source || !destinationId) return;
    const destination = destinations.find((player) => player.id === destinationId);
    if (!destination) return;
    Alert.alert(
      '投手記録を移管しますか？',
      `${sourceLabel(source)} の投手記録を ${destination.name || '(名前未設定)'} へ移します。打順と選手交代履歴は変更しません。Undo履歴は消去されます。`,
      [
        { text: 'キャンセル', style: 'cancel' },
        { text: '移管する', style: 'destructive', onPress: () => void executeReassignment() },
      ],
    );
  }, [destinationId, destinations, executeReassignment, source]);

  const applyCloud = useCallback(() => {
    if (syncState?.kind !== 'cloud_ahead') return;
    Alert.alert(
      'クラウドの試合で置き換えますか？',
      '投手移管履歴だけでなく、端末の試合全体をクラウドに保存されている内容で置き換えます。',
      [
        { text: 'キャンセル', style: 'cancel' },
        {
          text: '置き換える',
          style: 'destructive',
          onPress: async () => {
            setSaving(true);
            try {
              const expectedLogId = syncState.missingLocally[0];
              const result = await applyCloudPitcherReassignmentToLocal(syncState.cloudGame, expectedLogId);
              if (result.kind === 'applied') {
                onSaved(result.game);
                setContained(null);
                await refreshSync();
              } else if (result.kind === 'unknown_local_state') {
                setContained({ kind: 'unknown_local_state', logId: expectedLogId });
              } else {
                Alert.alert('保存できませんでした', '端末への反映に失敗しました。');
              }
            } finally {
              setSaving(false);
            }
          },
        },
      ],
    );
  }, [onSaved, refreshSync, syncState]);

  const reloadLocal = useCallback(async () => {
    if (!onReload) return;
    setSaving(true);
    try {
      const reloaded = await onReload();
      if (!reloaded) throw new Error('端末の試合が見つかりません。');
      onSaved(reloaded);
      setContained(null);
    } catch (error) {
      Alert.alert('再読込できませんでした', (error as Error)?.message ?? '端末の試合を読み込めませんでした。');
    } finally {
      setSaving(false);
    }
  }, [onReload, onSaved]);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={closeIfAllowed}>
      <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={closeIfAllowed}>
        <TouchableOpacity style={styles.sheet} activeOpacity={1} onPress={(event) => event.stopPropagation()}>
          <View style={styles.handle} />
          <Text style={styles.title}>投手記録を正しい選手へ移す</Text>
          <Text style={styles.hint}>移管元と移管先を選択してください。打順は変更されません。</Text>

          {contained?.kind === 'cloud_ok_local_failed' && (
            <View style={styles.warningBox}>
              <Text style={styles.warningText}>クラウドへは反映されましたが、端末は移管前のままです。</Text>
              <TouchableOpacity style={styles.recoveryBtn} onPress={applyCloud} disabled={saving}>
                <Text style={styles.recoveryBtnText}>クラウドの内容を端末へ反映</Text>
              </TouchableOpacity>
            </View>
          )}
          {contained?.kind === 'unknown_local_state' && (
            <View style={styles.warningBox}>
              <Text style={styles.warningText}>端末への保存結果を確認できません。確認が終わるまで画面を閉じられません。</Text>
              {onReload && (
                <TouchableOpacity style={styles.recoveryBtn} onPress={reloadLocal} disabled={saving}>
                  <Text style={styles.recoveryBtnText}>端末の試合を再読込</Text>
                </TouchableOpacity>
              )}
              {mode === 'finished' && !onReload && (
                <TouchableOpacity style={styles.recoveryBtn} onPress={refreshSync} disabled={saving || checkingSync}>
                  <Text style={styles.recoveryBtnText}>同期状態を再確認</Text>
                </TouchableOpacity>
              )}
            </View>
          )}

          {mode === 'finished' && userId && (
            <View style={styles.syncBox}>
              <Text style={styles.syncTitle}>投手移管履歴の同期状態</Text>
              {checkingSync ? <ActivityIndicator size="small" color={Colors.primary} /> : (
                <>
                  <Text style={styles.syncText}>
                    {syncState?.kind === 'in_sync' && '投手移管履歴は同期済みです。'}
                    {syncState?.kind === 'cloud_ahead' && `クラウド側に未反映の履歴が${syncState.missingLocally.length}件あります。`}
                    {syncState?.kind === 'local_ahead' && `端末にのみ存在する履歴が${syncState.missingRemotely.length}件あります。`}
                    {syncState?.kind === 'diverged' && '端末とクラウドの双方に固有の移管履歴があります。自動修復は行いません。'}
                    {syncState?.kind === 'undeterminable' && '投手移管履歴を確認できませんでした。'}
                  </Text>
                  {syncState?.kind === 'cloud_ahead' && !contained && (
                    <TouchableOpacity style={styles.syncAction} onPress={applyCloud}>
                      <Text style={styles.syncActionText}>クラウドの内容を端末へ反映</Text>
                    </TouchableOpacity>
                  )}
                  {syncState?.kind === 'undeterminable' && (
                    <TouchableOpacity style={styles.syncAction} onPress={refreshSync}>
                      <Text style={styles.syncActionText}>再確認</Text>
                    </TouchableOpacity>
                  )}
                </>
              )}
            </View>
          )}

          {!contained && (
            <ScrollView style={styles.list} keyboardShouldPersistTaps="handled">
              <Text style={styles.sectionTitle}>1. 移管元の投手記録</Text>
              {candidates.map((item) => {
                const key = `${item.side}:${item.pitcherId}`;
                const selected = sourceKey === key;
                return (
                  <TouchableOpacity
                    key={key}
                    style={[styles.option, selected && styles.optionSelected]}
                    onPress={() => { setSourceKey(key); setDestinationId(''); }}
                  >
                    <Text style={[styles.optionText, selected && styles.optionTextSelected]}>
                      {item.side === 'away' ? game.awayTeam.name : game.homeTeam.name}・{sourceLabel(item)}
                    </Text>
                    <Text style={styles.optionSub}>{item.isCurrent ? '現在の投手・' : ''}参照 {item.referenceCount}件</Text>
                  </TouchableOpacity>
                );
              })}

              {source && (
                <>
                  <Text style={styles.sectionTitle}>2. 正しい投手</Text>
                  {destinations.length === 0 ? (
                    <Text style={styles.empty}>選択できる移管先がありません。</Text>
                  ) : destinations.map((player) => {
                    const selected = destinationId === player.id;
                    return (
                      <TouchableOpacity
                        key={player.id}
                        style={[styles.option, selected && styles.optionSelected]}
                        onPress={() => setDestinationId(player.id)}
                      >
                        <Text style={[styles.optionText, selected && styles.optionTextSelected]}>
                          {playerLabel(player.name, player.number)}
                        </Text>
                        <Text style={styles.optionSub}>{player.position || '守備位置未設定'}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </>
              )}
            </ScrollView>
          )}

          {!contained && (
            <TouchableOpacity
              style={[styles.executeBtn, (!source || !destinationId || saving) && styles.disabled]}
              disabled={!source || !destinationId || saving}
              onPress={confirmReassignment}
            >
              {saving ? <ActivityIndicator color={Colors.white} /> : <Text style={styles.executeText}>投手記録を移管</Text>}
            </TouchableOpacity>
          )}
          <TouchableOpacity style={[styles.closeBtn, (saving || !!contained) && styles.disabled]} disabled={saving || !!contained} onPress={closeIfAllowed}>
            <Text style={styles.closeText}>閉じる</Text>
          </TouchableOpacity>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  sheet: { maxHeight: '90%', backgroundColor: Colors.card, borderTopLeftRadius: BorderRadius.xl, borderTopRightRadius: BorderRadius.xl, padding: Spacing.md, paddingBottom: Spacing.xl },
  handle: { width: 40, height: 4, borderRadius: 2, backgroundColor: Colors.border, alignSelf: 'center', marginBottom: Spacing.md },
  title: { fontSize: Typography.h3, fontWeight: '700', color: Colors.text },
  hint: { fontSize: Typography.caption, color: Colors.textSecondary, marginTop: 4, marginBottom: Spacing.md },
  list: { flexGrow: 0, maxHeight: 420 },
  sectionTitle: { fontSize: Typography.bodySmall, fontWeight: '700', color: Colors.text, marginTop: Spacing.sm, marginBottom: Spacing.xs },
  option: { padding: Spacing.sm, borderWidth: 1, borderColor: Colors.border, borderRadius: BorderRadius.md, marginBottom: Spacing.xs, backgroundColor: Colors.background },
  optionSelected: { borderColor: Colors.primary, backgroundColor: Colors.primaryLight },
  optionText: { fontSize: Typography.bodySmall, fontWeight: '600', color: Colors.text },
  optionTextSelected: { color: Colors.primary },
  optionSub: { fontSize: Typography.tiny, color: Colors.textSecondary, marginTop: 2 },
  empty: { color: Colors.textSecondary, fontSize: Typography.caption, paddingVertical: Spacing.sm },
  executeBtn: { backgroundColor: Colors.error, borderRadius: BorderRadius.md, paddingVertical: Spacing.sm, alignItems: 'center', marginTop: Spacing.md },
  executeText: { color: Colors.white, fontWeight: '700', fontSize: Typography.body },
  closeBtn: { alignItems: 'center', paddingVertical: Spacing.sm, marginTop: Spacing.xs },
  closeText: { color: Colors.primary, fontWeight: '600', fontSize: Typography.bodySmall },
  disabled: { opacity: 0.45 },
  warningBox: { borderWidth: 1, borderColor: Colors.error, borderRadius: BorderRadius.md, backgroundColor: '#FFF3F3', padding: Spacing.sm, marginBottom: Spacing.md },
  warningText: { color: Colors.error, fontSize: Typography.bodySmall, lineHeight: 20 },
  recoveryBtn: { backgroundColor: Colors.error, borderRadius: BorderRadius.sm, paddingVertical: Spacing.sm, alignItems: 'center', marginTop: Spacing.sm },
  recoveryBtnText: { color: Colors.white, fontWeight: '700', fontSize: Typography.caption },
  syncBox: { borderWidth: 1, borderColor: Colors.border, borderRadius: BorderRadius.md, padding: Spacing.sm, marginBottom: Spacing.md },
  syncTitle: { fontSize: Typography.caption, fontWeight: '700', color: Colors.text, marginBottom: 4 },
  syncText: { fontSize: Typography.tiny, color: Colors.textSecondary, lineHeight: 16 },
  syncAction: { alignSelf: 'flex-start', marginTop: Spacing.xs },
  syncActionText: { color: Colors.primary, fontWeight: '700', fontSize: Typography.caption },
});
