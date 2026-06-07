/**
 * 試合をチームチャットに共有する前の選手割り当てモーダル
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  StyleSheet,
  Alert,
  Switch,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useAuth } from '../contexts/AuthContext';
import { useTeams } from '../hooks/useTeam';
import { getTeamMembers } from '../services/teamService';
import {
  getTeamPlayerAssignments,
  saveTeamPlayerAssignments,
  findAssignmentByPlayerName,
} from '../services/teamPlayerAssignmentService';
import { gameService } from '../services/gameService';
import { getOrCreateTeamGroup, sendGroupMessage } from '../services/groupService';
import type { GamePlayerAssignment } from '../models/types';
import type { GameState, Player } from '../types/game';
import type { User } from '../models/types';
import { Colors, Spacing, Typography, BorderRadius } from '../constants/theme';

interface RosterRow {
  playerId: string;
  playerName: string;
  teamName: string;
}

interface Props {
  visible: boolean;
  onClose: () => void;
  game: GameState;
  summary: string;
}

function collectRoster(game: GameState): RosterRow[] {
  const rows: RosterRow[] = [];
  const seen = new Set<string>();
  const add = (players: Player[], teamName: string) => {
    for (const p of players) {
      if (seen.has(p.id)) continue;
      const hasAtBat = game.atBatLogs.some((l) => l.batterId === p.id && l.result);
      if (!hasAtBat) continue;
      seen.add(p.id);
      rows.push({ playerId: p.id, playerName: p.name, teamName });
    }
  };
  add([...game.awayTeam.roster.starters, ...game.awayTeam.roster.bench], game.awayTeam.name);
  if (game.awayTeam.roster.pitcher) {
    add([game.awayTeam.roster.pitcher], game.awayTeam.name);
  }
  add([...game.homeTeam.roster.starters, ...game.homeTeam.roster.bench], game.homeTeam.name);
  if (game.homeTeam.roster.pitcher) {
    add([game.homeTeam.roster.pitcher], game.homeTeam.name);
  }
  return rows;
}

export default function GameShareModal({ visible, onClose, game, summary }: Props) {
  const { currentUser } = useAuth();
  const { teams } = useTeams();

  const [step, setStep] = useState<'team' | 'assign'>('team');
  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null);
  const [selectedTeamName, setSelectedTeamName] = useState('');
  const [members, setMembers] = useState<User[]>([]);
  const [assignments, setAssignments] = useState<Record<string, { userId: string; displayName: string }>>({});
  const [blockReshare, setBlockReshare] = useState(true);
  const [loading, setLoading] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [pickerPlayerId, setPickerPlayerId] = useState<string | null>(null);

  const roster = useMemo(() => collectRoster(game), [game]);

  const reset = useCallback(() => {
    setStep('team');
    setSelectedTeamId(null);
    setSelectedTeamName('');
    setAssignments({});
    setBlockReshare(true);
    setPickerPlayerId(null);
  }, []);

  useEffect(() => {
    if (!visible) reset();
  }, [visible, reset]);

  const handleSelectTeam = async (teamId: string, teamName: string) => {
    setLoading(true);
    setSelectedTeamId(teamId);
    setSelectedTeamName(teamName);
    try {
      const [teamAssignments, teamMembers] = await Promise.all([
        getTeamPlayerAssignments(teamId),
        getTeamMembers(teamId),
      ]);
      setMembers(teamMembers.map((m) => m.user));

      const initial: Record<string, { userId: string; displayName: string }> = {};
      for (const row of roster) {
        const existing = findAssignmentByPlayerName(teamAssignments, row.playerName);
        if (existing) {
          initial[row.playerId] = {
            userId: existing.userId,
            displayName: existing.displayName,
          };
        }
      }
      setAssignments(initial);
      setStep('assign');
    } catch (e: unknown) {
      Alert.alert('エラー', (e as Error)?.message ?? 'チーム情報の取得に失敗しました。');
      setSelectedTeamId(null);
    } finally {
      setLoading(false);
    }
  };

  const handleAssign = (playerId: string, userId: string, displayName: string) => {
    setAssignments((prev) => ({ ...prev, [playerId]: { userId, displayName } }));
    setPickerPlayerId(null);
  };

  const handleShare = async () => {
    if (!currentUser || !selectedTeamId) return;

    const team = teams.find((t) => t.id === selectedTeamId);
    if (!team) return;

    const playerAssignments: GamePlayerAssignment[] = Object.entries(assignments).map(
      ([playerId, a]) => {
        const row = roster.find((r) => r.playerId === playerId);
        return {
          playerId,
          userId: a.userId,
          displayName: a.displayName,
          playerName: row?.playerName,
        };
      },
    );

    setSharing(true);
    try {
      const targetUserIds = team.memberIds.filter((id) => id !== currentUser.uid);
      const shareTargets = targetUserIds.length > 0 ? targetUserIds : team.memberIds;

      await gameService.saveGame(game, currentUser.uid);
      await gameService.shareGame(
        game.id,
        shareTargets,
        playerAssignments,
        !blockReshare,
      );

      await saveTeamPlayerAssignments(
        selectedTeamId,
        playerAssignments.map((a) => ({
          playerId: a.playerId,
          playerName: a.playerName ?? roster.find((r) => r.playerId === a.playerId)?.playerName ?? a.playerId,
          userId: a.userId,
          displayName: a.displayName,
        })),
      );

      const group = await getOrCreateTeamGroup(
        selectedTeamId,
        selectedTeamName,
        team.memberIds,
      );
      await sendGroupMessage(
        group.id,
        currentUser.uid,
        currentUser.displayName ?? 'ユーザー',
        summary,
        'game_analytics',
        { gameId: game.id },
      );

      Alert.alert('送信しました', `${selectedTeamName} のチャットに共有しました。`);
      onClose();
    } catch (e: unknown) {
      Alert.alert('エラー', (e as Error)?.message ?? '共有に失敗しました。');
    } finally {
      setSharing(false);
    }
  };

  const pickerRow = pickerPlayerId ? roster.find((r) => r.playerId === pickerPlayerId) : null;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <TouchableOpacity style={s.backdrop} activeOpacity={1} onPress={onClose}>
        <TouchableOpacity activeOpacity={1} style={s.sheet} onPress={(e) => e.stopPropagation()}>
          <View style={s.handle} />
          <Text style={s.title}>チームに共有</Text>

          {step === 'team' ? (
            teams.length === 0 ? (
              <Text style={s.empty}>所属チームがありません</Text>
            ) : (
              <FlatList
                data={teams}
                keyExtractor={(t) => t.id}
                style={s.list}
                renderItem={({ item }) => (
                  <TouchableOpacity
                    style={s.teamItem}
                    onPress={() => handleSelectTeam(item.id, item.name)}
                    disabled={loading}
                  >
                    <MaterialCommunityIcons name="account-group" size={20} color={Colors.primary} />
                    <Text style={s.teamItemText}>{item.name}</Text>
                    {loading && selectedTeamId === item.id ? (
                      <ActivityIndicator size="small" color={Colors.primary} />
                    ) : (
                      <MaterialCommunityIcons name="chevron-right" size={20} color={Colors.textSecondary} />
                    )}
                  </TouchableOpacity>
                )}
              />
            )
          ) : (
            <>
              <TouchableOpacity style={s.backLink} onPress={() => setStep('team')}>
                <MaterialCommunityIcons name="chevron-left" size={18} color={Colors.primary} />
                <Text style={s.backLinkText}>{selectedTeamName}</Text>
              </TouchableOpacity>

              <Text style={s.sectionLabel}>選手とアカウントの紐付け</Text>
              <Text style={s.hint}>未設定の選手のみタップして割り当ててください</Text>

              <FlatList
                data={roster}
                keyExtractor={(r) => r.playerId}
                style={s.list}
                renderItem={({ item }) => {
                  const assigned = assignments[item.playerId];
                  return (
                    <TouchableOpacity
                      style={s.rosterRow}
                      onPress={() => setPickerPlayerId(item.playerId)}
                    >
                      <View style={s.rosterInfo}>
                        <Text style={s.rosterName}>{item.playerName}</Text>
                        <Text style={s.rosterTeam}>{item.teamName}</Text>
                      </View>
                      <Text style={[s.assignLabel, assigned && s.assignLabelDone]}>
                        {assigned ? assigned.displayName : '未設定'}
                      </Text>
                      <MaterialCommunityIcons name="chevron-right" size={18} color={Colors.textSecondary} />
                    </TouchableOpacity>
                  );
                }}
              />

              <View style={s.toggleRow}>
                <Text style={s.toggleLabel}>横流しを禁止する</Text>
                <Switch
                  value={blockReshare}
                  onValueChange={setBlockReshare}
                  trackColor={{ true: Colors.primary, false: Colors.border }}
                />
              </View>

              <TouchableOpacity
                style={[s.shareBtn, sharing && s.shareBtnDisabled]}
                onPress={handleShare}
                disabled={sharing}
              >
                {sharing ? (
                  <ActivityIndicator color={Colors.white} />
                ) : (
                  <Text style={s.shareBtnText}>共有する</Text>
                )}
              </TouchableOpacity>
            </>
          )}

          <TouchableOpacity style={s.cancelBtn} onPress={onClose}>
            <Text style={s.cancelText}>キャンセル</Text>
          </TouchableOpacity>
        </TouchableOpacity>
      </TouchableOpacity>

      <Modal visible={pickerPlayerId !== null} transparent animationType="fade">
        <TouchableOpacity style={s.pickerBackdrop} activeOpacity={1} onPress={() => setPickerPlayerId(null)}>
          <View style={s.pickerSheet}>
            <Text style={s.pickerTitle}>
              {pickerRow?.playerName} に割り当てるメンバー
            </Text>
            {members.map((m) => (
              <TouchableOpacity
                key={m.uid}
                style={s.pickerItem}
                onPress={() => handleAssign(pickerPlayerId!, m.uid, m.displayName)}
              >
                <Text style={s.pickerItemText}>{m.displayName}</Text>
              </TouchableOpacity>
            ))}
            <TouchableOpacity style={s.pickerCancel} onPress={() => setPickerPlayerId(null)}>
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
    maxHeight: '85%',
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
    marginBottom: Spacing.sm,
    color: Colors.text,
  },
  empty: { textAlign: 'center', color: Colors.textSecondary, padding: Spacing.lg },
  list: { maxHeight: 300 },
  teamItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.border,
  },
  teamItemText: { flex: 1, fontSize: 15, fontWeight: '500', color: Colors.text },
  backLink: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Spacing.sm,
  },
  backLinkText: { fontSize: 14, color: Colors.primary, fontWeight: '600' },
  sectionLabel: { fontSize: 14, fontWeight: '700', color: Colors.text },
  hint: { fontSize: 12, color: Colors.textSecondary, marginBottom: Spacing.sm },
  rosterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.border,
  },
  rosterInfo: { flex: 1 },
  rosterName: { fontSize: 14, fontWeight: '600', color: Colors.text },
  rosterTeam: { fontSize: 11, color: Colors.textSecondary },
  assignLabel: { fontSize: 12, color: Colors.secondary, marginRight: 4 },
  assignLabelDone: { color: Colors.primary, fontWeight: '600' },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  toggleLabel: { fontSize: 14, color: Colors.text, fontWeight: '500' },
  shareBtn: {
    backgroundColor: Colors.primary,
    borderRadius: BorderRadius.sm,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: Spacing.sm,
  },
  shareBtnDisabled: { opacity: 0.6 },
  shareBtnText: { color: Colors.white, fontWeight: '700', fontSize: 15 },
  cancelBtn: {
    marginTop: Spacing.sm,
    paddingVertical: 12,
    alignItems: 'center',
  },
  cancelText: { color: Colors.textSecondary, fontWeight: '600' },
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
  pickerTitle: { fontSize: 15, fontWeight: '700', marginBottom: Spacing.sm, color: Colors.text },
  pickerItem: {
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.border,
  },
  pickerItemText: { fontSize: 15, color: Colors.text },
  pickerCancel: { paddingVertical: 14, alignItems: 'center' },
  pickerCancelText: { color: Colors.textSecondary, fontWeight: '600' },
});
