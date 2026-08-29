import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
  View,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Pressable,
  ScrollView,
  Alert,
  TextInput as NativeTextInput,
} from 'react-native';
import { Text, Avatar, Divider, Badge, FAB, Button, TextInput, Portal, Modal, ActivityIndicator } from 'react-native-paper';
import { router, Stack } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getTeamPlayers, addTeamPlayer, updateTeamPlayer } from '../../../src/services/teamPlayerService';
import ImportPlayersFromHistoryModal from '../../../src/components/ImportPlayersFromHistoryModal';
import { updateTeam, deleteTeam, leaveTeam } from '../../../src/services/teamService';
import { useConversations } from '../../../src/hooks/useMessages';
import { useAuth } from '../../../src/contexts/AuthContext';
import { useTeams } from '../../../src/hooks/useTeam';
import EmptyState from '../../../src/components/EmptyState';
import { Colors, Spacing, Typography, BorderRadius } from '../../../src/constants/theme';
import { usePlanGate } from '../../../src/hooks/usePlanGate';
import { showTeamCreatePlanAlert } from '../../../src/utils/planLimitAlerts';
import { useI18n } from '../../../src/i18n';
import { Group, Conversation, Team, CreateTeamInput } from '../../../src/models/types';

type TabType = 'roster' | 'teams' | 'dms';

function formatTime(timestamp: any): string {
  if (!timestamp) return '';
  const date: Date = timestamp?.toDate?.() ?? new Date(timestamp);
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  if (diff < 60_000) return 'たった今';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}分前`;
  if (diff < 86_400_000) return date.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });
  return date.toLocaleDateString('ja-JP', { month: 'numeric', day: 'numeric' });
}

function RosterTab({
  teams,
  createTeam,
  teamCreateAllowed,
  onTeamCreateBlocked,
}: {
  teams: Team[];
  createTeam: (input: CreateTeamInput) => Promise<string>;
  teamCreateAllowed: boolean;
  onTeamCreateBlocked: () => void;
}) {
  const [starredIds, setStarredIds] = useState<Set<string>>(new Set());
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [playersMap, setPlayersMap] = useState<
    Record<string, { id: string; name: string; number: number | null; position: string }[]>
  >({});
  const [loadingIds, setLoadingIds] = useState<Set<string>>(new Set());
  const loadedIdsRef = useRef<Set<string>>(new Set());

  const [showAddTeam, setShowAddTeam] = useState(false);
  const [newTeamName, setNewTeamName] = useState('');
  const [addingTeam, setAddingTeam] = useState(false);

  const [addPlayerTeamId, setAddPlayerTeamId] = useState<string | null>(null);
  const [newPlayerName, setNewPlayerName] = useState('');
  const [newPlayerNumber, setNewPlayerNumber] = useState('');
  const [addingPlayer, setAddingPlayer] = useState(false);
  const [importTeamId, setImportTeamId] = useState<string | null>(null);
  const [showCreateFromHistory, setShowCreateFromHistory] = useState(false);

  const [editPlayer, setEditPlayer] = useState<{
    teamId: string; id: string; name: string; number: string; position: string;
  } | null>(null);
  const [savingPlayer, setSavingPlayer] = useState(false);

  const [editTeamId, setEditTeamId] = useState<string | null>(null);
  const [editTeamName, setEditTeamName] = useState('');
  const [savingTeam, setSavingTeam] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem('roster_starred').then((v) => {
      if (v) setStarredIds(new Set(JSON.parse(v)));
    });
    AsyncStorage.getItem('roster_expanded').then((v) => {
      if (v) setExpandedIds(new Set(JSON.parse(v)));
    });
  }, []);

  const loadPlayers = useCallback(async (teamId: string) => {
    if (loadedIdsRef.current.has(teamId)) return;
    loadedIdsRef.current.add(teamId);
    setLoadingIds((s) => new Set([...s, teamId]));
    try {
      const ps = await getTeamPlayers(teamId);
      setPlayersMap((m) => ({
        ...m,
        [teamId]: ps.map((p) => ({ id: p.id, name: p.name, number: p.number, position: p.position })),
      }));
    } catch (_e) {
      loadedIdsRef.current.delete(teamId);
    } finally {
      setLoadingIds((s) => { const n = new Set(s); n.delete(teamId); return n; });
    }
  }, []);

  const handleToggleExpand = useCallback((teamId: string) => {
    setExpandedIds((s) => {
      const n = new Set(s);
      if (n.has(teamId)) { n.delete(teamId); } else { n.add(teamId); }
      AsyncStorage.setItem('roster_expanded', JSON.stringify([...n]));
      return n;
    });
    loadPlayers(teamId);
  }, [loadPlayers]);

  const handleToggleStar = useCallback((teamId: string) => {
    setStarredIds((s) => {
      const n = new Set(s);
      if (n.has(teamId)) { n.delete(teamId); } else { n.add(teamId); }
      AsyncStorage.setItem('roster_starred', JSON.stringify([...n]));
      return n;
    });
  }, []);

  const handleAddTeam = useCallback(async () => {
    if (!newTeamName.trim()) return;
    setAddingTeam(true);
    try {
      await createTeam({ name: newTeamName.trim(), description: '', photoURI: null, isPrivate: false });
      setNewTeamName('');
      setShowAddTeam(false);
    } finally {
      setAddingTeam(false);
    }
  }, [newTeamName, createTeam]);

  const handleOpenAddTeam = useCallback(() => {
    if (!teamCreateAllowed) {
      onTeamCreateBlocked();
      return;
    }
    setShowAddTeam(true);
  }, [onTeamCreateBlocked, teamCreateAllowed]);

  const handleAddPlayer = useCallback(async () => {
    const teamId = addPlayerTeamId;
    if (!teamId || !newPlayerName.trim()) return;
    setAddingPlayer(true);
    try {
      const p = await addTeamPlayer(teamId, {
        name: newPlayerName.trim(),
        number: newPlayerNumber.trim() ? parseInt(newPlayerNumber, 10) : null,
        position: '',
        bats: 'R',
        throws: 'R',
      });
      setPlayersMap((m) => ({
        ...m,
        [teamId]: [...(m[teamId] ?? []), { id: p.id, name: p.name, number: p.number, position: p.position }],
      }));
      setNewPlayerName('');
      setNewPlayerNumber('');
      setAddPlayerTeamId(null);
    } finally {
      setAddingPlayer(false);
    }
  }, [addPlayerTeamId, newPlayerName, newPlayerNumber]);

  const handleSavePlayer = useCallback(async () => {
    if (!editPlayer) return;
    setSavingPlayer(true);
    try {
      await updateTeamPlayer(editPlayer.teamId, editPlayer.id, {
        name: editPlayer.name.trim(),
        number: editPlayer.number.trim() ? parseInt(editPlayer.number, 10) : null,
        position: editPlayer.position.trim(),
      });
      setPlayersMap((m) => ({
        ...m,
        [editPlayer.teamId]: (m[editPlayer.teamId] ?? []).map((p) =>
          p.id === editPlayer.id
            ? { ...p, name: editPlayer.name.trim(), number: editPlayer.number.trim() ? parseInt(editPlayer.number, 10) : null, position: editPlayer.position.trim() }
            : p
        ),
      }));
      setEditPlayer(null);
    } finally {
      setSavingPlayer(false);
    }
  }, [editPlayer]);

  const handleSaveTeam = useCallback(async () => {
    if (!editTeamId || !editTeamName.trim()) return;
    setSavingTeam(true);
    try {
      await updateTeam(editTeamId, { name: editTeamName.trim() });
      setEditTeamId(null);
      setEditTeamName('');
    } finally {
      setSavingTeam(false);
    }
  }, [editTeamId, editTeamName]);

  const starredTeams = teams.filter((t) => starredIds.has(t.id));
  const otherTeams = teams.filter((t) => !starredIds.has(t.id));

  const renderTeamBlock = (team: Team, alwaysExpanded: boolean) => {
    const isExpanded = alwaysExpanded || expandedIds.has(team.id);
    const isLoading = loadingIds.has(team.id);
    const players = playersMap[team.id] ?? [];
    const isAddingHere = addPlayerTeamId === team.id;

    return (
      <View key={team.id} style={rosterStyles.teamBlock}>
        <TouchableOpacity
          style={rosterStyles.teamRow}
          onPress={!alwaysExpanded ? () => handleToggleExpand(team.id) : undefined}
          activeOpacity={alwaysExpanded ? 1 : 0.7}
        >
          <TouchableOpacity style={rosterStyles.starBtn} onPress={() => handleToggleStar(team.id)}>
            <MaterialCommunityIcons
              name={starredIds.has(team.id) ? 'star' : 'star-outline'}
              size={18}
              color={starredIds.has(team.id) ? Colors.accent : Colors.textSecondary}
            />
          </TouchableOpacity>
          <Text style={rosterStyles.teamName} numberOfLines={1}>{team.name}</Text>
          <TouchableOpacity style={rosterStyles.editBtn} onPress={() => router.push({ pathname: '/(tabs)/chat/team-edit', params: { teamId: team.id, teamName: team.name } } as any)}>
            <MaterialCommunityIcons name="pencil" size={15} color={Colors.textSecondary} />
          </TouchableOpacity>
        </TouchableOpacity>

        {isExpanded && (
          <View style={rosterStyles.playerList}>
            {isLoading ? (
              <ActivityIndicator size="small" color={Colors.primary} style={{ marginVertical: 8 }} />
            ) : players.length === 0 ? (
              <Text style={rosterStyles.noPlayers}>選手が登録されていません</Text>
            ) : (
              players.map((p) => (
                <View key={p.id} style={rosterStyles.playerRow}>
                  <Text style={rosterStyles.playerNumber}>{p.number != null ? `#${p.number}` : '—'}</Text>
                  <Text style={rosterStyles.playerName} numberOfLines={1}>{p.name}</Text>
                  <Text style={rosterStyles.playerPos}>{p.position || '—'}</Text>
                </View>
              ))
            )}
            {isAddingHere ? (
              <View style={rosterStyles.addPlayerForm}>
                <TextInput
                  label="選手名"
                  value={newPlayerName}
                  onChangeText={setNewPlayerName}
                  mode="outlined"
                  style={rosterStyles.addPlayerInput}
                  dense
                />
                <TextInput
                  label="#"
                  value={newPlayerNumber}
                  onChangeText={setNewPlayerNumber}
                  mode="outlined"
                  style={rosterStyles.addPlayerNumInput}
                  keyboardType="numeric"
                  dense
                />
                <Button
                  mode="contained"
                  onPress={handleAddPlayer}
                  disabled={!newPlayerName.trim() || addingPlayer}
                  loading={addingPlayer}
                  buttonColor={Colors.primary}
                  compact
                >
                  追加
                </Button>
                <Button
                  onPress={() => { setAddPlayerTeamId(null); setNewPlayerName(''); setNewPlayerNumber(''); }}
                  compact
                >
                  キャンセル
                </Button>
              </View>
            ) : (
              <View style={rosterStyles.addPlayerActions}>
                <TouchableOpacity
                  style={rosterStyles.addPlayerBtn}
                  onPress={() => { setAddPlayerTeamId(team.id); loadPlayers(team.id); }}
                >
                  <MaterialCommunityIcons name="account-plus" size={15} color={Colors.primary} />
                  <Text style={rosterStyles.addPlayerBtnText}>＋ 選手追加</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={rosterStyles.addPlayerBtn}
                  onPress={() => {
                    loadPlayers(team.id);
                    setImportTeamId(team.id);
                  }}
                >
                  <MaterialCommunityIcons name="history" size={15} color={Colors.primary} />
                  <Text style={rosterStyles.addPlayerBtnText}>過去の試合から</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        )}
      </View>
    );
  };

  return (
    <View style={{ flex: 1 }}>
      <TouchableOpacity style={rosterStyles.addTeamBtn} onPress={handleOpenAddTeam}>
        <MaterialCommunityIcons name="plus-circle-outline" size={16} color={Colors.primary} />
        <Text style={rosterStyles.addTeamBtnText}>＋ チーム追加</Text>
      </TouchableOpacity>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 32 }}>
        {starredTeams.length > 0 && (
          <>
            <View style={rosterStyles.sectionHeader}>
              <MaterialCommunityIcons name="star" size={13} color={Colors.accent} />
              <Text style={rosterStyles.sectionLabel}>マイチーム</Text>
            </View>
            {starredTeams.map((t) => renderTeamBlock(t, false))}
          </>
        )}
        {otherTeams.length > 0 && (
          <>
            {starredTeams.length > 0 && (
              <View style={rosterStyles.sectionHeader}>
                <Text style={rosterStyles.sectionLabel}>その他のチーム</Text>
              </View>
            )}
            {otherTeams.map((t) => renderTeamBlock(t, false))}
          </>
        )}
        {teams.length === 0 && (
          <EmptyState
            icon="clipboard-list-outline"
            title="チームがありません"
            subtitle="＋ チーム追加からチームを作成しましょう"
          />
        )}
      </ScrollView>

      <Portal>
        <Modal
          visible={showAddTeam}
          onDismiss={() => setShowAddTeam(false)}
          contentContainerStyle={styles.modal}
        >
          <Text style={styles.modalTitle}>チームを追加</Text>
          <Text style={styles.nativeTeamNameLabel}>チーム名</Text>
          <NativeTextInput
            key={showAddTeam ? 'team-name-open' : 'team-name-closed'}
            defaultValue={newTeamName}
            onChangeText={setNewTeamName}
            style={styles.nativeTeamNameInput}
            placeholder="チーム名を入力"
            placeholderTextColor={Colors.textSecondary}
            returnKeyType="done"
          />
          <Button
            mode="contained"
            onPress={handleAddTeam}
            disabled={!newTeamName.trim() || addingTeam}
            loading={addingTeam}
            buttonColor={Colors.primary}
          >
            作成する
          </Button>
          <Button
            mode="outlined"
            icon="history"
            onPress={() => {
              setShowAddTeam(false);
              setShowCreateFromHistory(true);
            }}
            style={styles.historyTeamBtn}
          >
            過去の試合から名簿を作成
          </Button>
        </Modal>

        {importTeamId && (
          <ImportPlayersFromHistoryModal
            visible={!!importTeamId}
            teamId={importTeamId}
            teamName={teams.find((t) => t.id === importTeamId)?.name ?? ''}
            onClose={() => setImportTeamId(null)}
            onImported={(added, destination) => {
              const tid = destination.teamId;
              if (added.length === 0) return;
              setPlayersMap((m) => ({
                ...m,
                [tid]: [...(m[tid] ?? []), ...added],
              }));
            }}
          />
        )}

        {showCreateFromHistory && (
          <ImportPlayersFromHistoryModal
            visible={showCreateFromHistory}
            createTeam={createTeam}
            onClose={() => setShowCreateFromHistory(false)}
            onImported={(added, destination) => {
              loadedIdsRef.current.add(destination.teamId);
              setPlayersMap((m) => ({
                ...m,
                [destination.teamId]: added,
              }));
              setExpandedIds((current) => {
                const next = new Set(current);
                next.add(destination.teamId);
                AsyncStorage.setItem('roster_expanded', JSON.stringify([...next]));
                return next;
              });
            }}
          />
        )}

        <Modal
          visible={editPlayer !== null}
          onDismiss={() => setEditPlayer(null)}
          contentContainerStyle={styles.modal}
        >
          <Text style={styles.modalTitle}>選手を編集</Text>
          <TextInput
            label="選手名"
            value={editPlayer?.name ?? ''}
            onChangeText={(v) => setEditPlayer((s) => s ? { ...s, name: v } : s)}
            mode="outlined"
            style={styles.modalInput}
          />
          <TextInput
            label="背番号"
            value={editPlayer?.number ?? ''}
            onChangeText={(v) => setEditPlayer((s) => s ? { ...s, number: v } : s)}
            mode="outlined"
            style={styles.modalInput}
            keyboardType="numeric"
          />
          <TextInput
            label="ポジション"
            value={editPlayer?.position ?? ''}
            onChangeText={(v) => setEditPlayer((s) => s ? { ...s, position: v } : s)}
            mode="outlined"
            style={styles.modalInput}
          />
          <Button
            mode="contained"
            onPress={handleSavePlayer}
            disabled={!editPlayer?.name.trim() || savingPlayer}
            loading={savingPlayer}
            buttonColor={Colors.primary}
          >
            保存
          </Button>
        </Modal>

        <Modal
          visible={editTeamId !== null}
          onDismiss={() => setEditTeamId(null)}
          contentContainerStyle={styles.modal}
        >
          <Text style={styles.modalTitle}>チーム名を編集</Text>
          <TextInput
            label="チーム名"
            value={editTeamName}
            onChangeText={setEditTeamName}
            mode="outlined"
            style={styles.modalInput}
          />
          <Button
            mode="contained"
            onPress={handleSaveTeam}
            disabled={!editTeamName.trim() || savingTeam}
            loading={savingTeam}
            buttonColor={Colors.primary}
          >
            保存
          </Button>
        </Modal>
      </Portal>
    </View>
  );
}

function DMItem({ item, currentUserId }: { item: any; currentUserId?: string }) {
  return (
    <TouchableOpacity
      style={styles.item}
      onPress={() =>
        router.push({
          pathname: '/(tabs)/chat/[chatId]',
          params: { chatId: item.id, type: 'dm', title: item.otherUser?.displayName ?? 'DM' },
        } as any)
      }
      activeOpacity={0.7}
    >
      <View style={styles.avatarWrapper}>
        <Avatar.Text
          size={50}
          label={(item.otherUser?.displayName ?? 'U').charAt(0)}
          style={styles.dmAvatar}
          labelStyle={styles.avatarLabel}
        />
        {currentUserId && item.lastMessageReadBy && !item.lastMessageReadBy.includes(currentUserId) && (
          <View style={styles.unreadDot} />
        )}
      </View>
      <View style={styles.info}>
        <View style={styles.nameRow}>
          <Text style={styles.name} numberOfLines={1}>
            {item.otherUser?.displayName ?? 'User'}
          </Text>
          <Text style={styles.time}>{formatTime(item.lastMessageAt)}</Text>
        </View>
        <Text style={styles.lastMsg} numberOfLines={1}>
          {item.lastMessage || 'メッセージを送ってみよう'}
        </Text>
      </View>
    </TouchableOpacity>
  );
}

function TeamItem({
  item,
  editing,
  currentUserId,
  onRemove,
}: {
  item: Team;
  editing: boolean;
  currentUserId: string | undefined;
  onRemove: (team: Team, isOwner: boolean) => void;
}) {
  const isOwner = !!currentUserId && item.ownerId === currentUserId;

  return (
    <TouchableOpacity
      style={styles.item}
      onPress={() => {
        if (editing) return;
        router.push(`/(tabs)/teams/${item.id}/chat` as any);
      }}
      activeOpacity={editing ? 1 : 0.7}
      disabled={editing}
    >
      {item.photoURL ? (
        <Avatar.Image size={50} source={{ uri: item.photoURL }} style={styles.teamAvatarImage} />
      ) : (
        <Avatar.Text
          size={50}
          label={item.name.charAt(0)}
          style={styles.teamAvatar}
          labelStyle={styles.avatarLabel}
        />
      )}
      <View style={styles.info}>
        <View style={styles.nameRow}>
          <Text style={styles.name} numberOfLines={1}>{item.name}</Text>
          <View style={styles.memberMeta}>
            <MaterialCommunityIcons name="account-group" size={13} color={Colors.textSecondary} />
            <Text style={styles.time}>{item.memberIds.length}人</Text>
          </View>
        </View>
        <Text style={styles.lastMsg} numberOfLines={1}>
          {item.description || 'チームの説明はありません'}
        </Text>
        {item.isPrivate && (
          <View style={styles.privateBadgeRow}>
            <MaterialCommunityIcons name="lock" size={11} color={Colors.textSecondary} />
            <Text style={styles.memberCount}> 非公開</Text>
          </View>
        )}
      </View>
      {editing ? (
        <TouchableOpacity
          onPress={() => onRemove(item, isOwner)}
          style={styles.teamDeleteBtn}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <MaterialCommunityIcons name="trash-can-outline" size={22} color={Colors.error} />
        </TouchableOpacity>
      ) : (
        <MaterialCommunityIcons name="chevron-right" size={20} color={Colors.textSecondary} />
      )}
    </TouchableOpacity>
  );
}

export default function ChatIndexScreen() {
  const { t } = useI18n();
  const { currentUser } = useAuth();
  const [activeTab, setActiveTab] = useState<TabType>('roster');
  const [editingTeams, setEditingTeams] = useState(false);
  const { conversations, loading: dmsLoading } = useConversations();
  const { teams, joinByCode, createTeam } = useTeams();
  const teamCreateGate = usePlanGate('team_create');
  const [joinModal, setJoinModal] = useState(false);
  const [inviteCode, setInviteCode] = useState('');

  const isRoster = activeTab === 'roster';
  const isTeams = activeTab === 'teams';
  const isDMs = activeTab === 'dms';

  const handleJoin = async () => {
    if (inviteCode.trim()) {
      await joinByCode(inviteCode.trim().toUpperCase());
      setJoinModal(false);
      setInviteCode('');
    }
  };

  const enterTeamEditMode = useCallback(() => {
    setActiveTab('teams');
    setEditingTeams(true);
  }, []);

  const handleHeaderMenu = useCallback(() => {
    Alert.alert('メニュー', undefined, [
      { text: 'チームを編集', onPress: enterTeamEditMode },
      { text: 'キャンセル', style: 'cancel' },
    ]);
  }, [enterTeamEditMode]);

  const handleRemoveTeam = useCallback(
    (team: Team, isOwner: boolean) => {
      if (!currentUser) return;
      if (isOwner) {
        Alert.alert(
          'チームを削除しますか？',
          `「${team.name}」とグループチャットが削除されます。この操作は取り消せません。`,
          [
            { text: 'キャンセル', style: 'cancel' },
            {
              text: '削除する',
              style: 'destructive',
              onPress: async () => {
                try {
                  await deleteTeam(team.id, currentUser.uid);
                } catch (err) {
                  if (__DEV__) console.error('[handleRemoveTeam] delete failed:', err);
                  Alert.alert('エラー', 'チームの削除に失敗しました');
                }
              },
            },
          ],
        );
      } else {
        Alert.alert(
          'チームを退会しますか？',
          `「${team.name}」を退会すると、チャットや共有データにアクセスできなくなります。`,
          [
            { text: 'キャンセル', style: 'cancel' },
            {
              text: '退会する',
              style: 'destructive',
              onPress: async () => {
                try {
                  await leaveTeam(team.id, currentUser.uid);
                } catch (err) {
                  if (__DEV__) console.error('[handleRemoveTeam] leave failed:', err);
                  Alert.alert('エラー', '退会に失敗しました');
                }
              },
            },
          ],
        );
      }
    },
    [currentUser],
  );

  return (
    <View style={styles.container}>
      <Stack.Screen
        options={{
          title: 'チャット',
          headerRight: () =>
            editingTeams ? (
              <TouchableOpacity
                onPress={() => setEditingTeams(false)}
                style={styles.headerBtn}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Text style={styles.headerDoneText}>完了</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                onPress={handleHeaderMenu}
                style={styles.headerBtn}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <MaterialCommunityIcons name="dots-vertical" size={22} color={Colors.primary} />
              </TouchableOpacity>
            ),
        }}
      />

      {/* Segmented Control */}
      <View style={styles.segmentWrapper}>
        <View style={styles.segment}>
          <Pressable
            style={[styles.segBtn, isRoster && styles.segBtnActive]}
            onPress={() => {
              setEditingTeams(false);
              setActiveTab('roster');
            }}
          >
            <MaterialCommunityIcons
              name="clipboard-list"
              size={16}
              color={isRoster ? Colors.white : Colors.textSecondary}
            />
            <Text style={[styles.segText, isRoster && styles.segTextActive]}>
              選手名簿
            </Text>
          </Pressable>
          <Pressable
            style={[styles.segBtn, isTeams && styles.segBtnActive]}
            onPress={() => setActiveTab('teams')}
          >
            <MaterialCommunityIcons
              name="shield-account"
              size={16}
              color={isTeams ? Colors.white : Colors.textSecondary}
            />
            <Text style={[styles.segText, isTeams && styles.segTextActive]}>
              {t.nav.teams}
            </Text>
            {teams.length > 0 && (
              <Badge style={styles.countBadge}>{teams.length}</Badge>
            )}
          </Pressable>
          <Pressable
            style={[styles.segBtn, isDMs && styles.segBtnActive]}
            onPress={() => {
              setEditingTeams(false);
              setActiveTab('dms');
            }}
          >
            <MaterialCommunityIcons
              name="message-text"
              size={16}
              color={isDMs ? Colors.white : Colors.textSecondary}
            />
            <Text style={[styles.segText, isDMs && styles.segTextActive]}>
              {t.chat.dms}
            </Text>
            {conversations.length > 0 && (
              <Badge style={styles.countBadge}>{conversations.length}</Badge>
            )}
          </Pressable>
        </View>
      </View>

      {/* List */}
      {isRoster ? (
        <RosterTab
          teams={teams}
          createTeam={createTeam}
          teamCreateAllowed={teamCreateGate.allowed}
          onTeamCreateBlocked={showTeamCreatePlanAlert}
        />
      ) : isTeams ? (
        <>
          <FlatList
            data={teams}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => (
              <TeamItem
                item={item}
                editing={editingTeams}
                currentUserId={currentUser?.uid}
                onRemove={handleRemoveTeam}
              />
            )}
            ItemSeparatorComponent={() => <Divider style={styles.divider} />}
            contentContainerStyle={teams.length === 0 ? styles.emptyContainer : styles.listContent}
            ListHeaderComponent={
              <Button
                mode="outlined"
                onPress={() => setJoinModal(true)}
                icon="key"
                style={styles.joinButton}
              >
                招待コードで参加
              </Button>
            }
            ListEmptyComponent={
              <EmptyState
                icon="account-group"
                title="チームがありません"
                subtitle="チームを作成するか招待コードで参加しましょう"
              />
            }
          />
          {!editingTeams && (
            <FAB
              icon="plus"
              style={styles.fab}
              color={Colors.white}
              onPress={() => {
                if (!teamCreateGate.allowed) {
                  showTeamCreatePlanAlert();
                  return;
                }
                router.push('/(tabs)/teams/create' as any);
              }}
            />
          )}
          <Portal>
            <Modal
              visible={joinModal}
              onDismiss={() => setJoinModal(false)}
              contentContainerStyle={styles.modal}
            >
              <Text style={styles.modalTitle}>招待コードで参加</Text>
              <TextInput
                label="招待コード"
                value={inviteCode}
                onChangeText={setInviteCode}
                mode="outlined"
                style={styles.modalInput}
                autoCapitalize="characters"
              />
              <Button mode="contained" onPress={handleJoin} buttonColor={Colors.primary}>
                参加する
              </Button>
            </Modal>
          </Portal>
        </>
      ) : (
        <FlatList
          data={conversations}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => <DMItem item={item} currentUserId={currentUser?.uid} />}
          ItemSeparatorComponent={() => <Divider style={styles.divider} />}
          contentContainerStyle={conversations.length === 0 ? styles.emptyContainer : styles.listContent}
          ListEmptyComponent={
            !dmsLoading ? (
              <EmptyState
                icon="message-outline"
                title={t.chat.noDMs}
                subtitle={t.chat.noDMsSub}
              />
            ) : null
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  headerBtn: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
  },
  headerDoneText: {
    fontSize: Typography.body,
    fontWeight: '600',
    color: Colors.primary,
  },
  teamDeleteBtn: {
    padding: Spacing.xs,
  },
  segmentWrapper: {
    backgroundColor: Colors.card,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  segment: {
    flexDirection: 'row',
    backgroundColor: Colors.primaryLight,
    borderRadius: BorderRadius.full,
    padding: 3,
  },
  segBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.full,
    gap: 4,
  },
  segBtnActive: {
    backgroundColor: Colors.primary,
  },
  segText: {
    fontSize: Typography.bodySmall,
    fontWeight: '600',
    color: Colors.textSecondary,
  },
  segTextActive: {
    color: Colors.white,
  },
  countBadge: {
    backgroundColor: Colors.accent,
    color: Colors.text,
    fontSize: 9,
    alignSelf: 'center',
  },
  listContent: { paddingBottom: Spacing.lg },
  emptyContainer: { flex: 1 },
  divider: { marginLeft: 82 },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
    backgroundColor: Colors.card,
  },
  avatarWrapper: { position: 'relative' },
  unreadDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: Colors.error,
    position: 'absolute',
    top: 0,
    right: 0,
  },
  groupAvatar: { backgroundColor: Colors.primary },
  dmAvatar: { backgroundColor: Colors.secondary },
  teamAvatar: { backgroundColor: Colors.secondary },
  teamAvatarImage: { backgroundColor: Colors.surfaceGray },
  avatarLabel: { color: Colors.white, fontWeight: '700' },
  groupBadge: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: Colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: Colors.card,
  },
  info: { flex: 1, marginLeft: Spacing.md },
  nameRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  memberMeta: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  privateBadgeRow: { flexDirection: 'row', alignItems: 'center', marginTop: 2 },
  name: {
    flex: 1,
    fontSize: Typography.body,
    fontWeight: '600',
    color: Colors.text,
    marginRight: Spacing.sm,
  },
  time: { fontSize: Typography.tiny, color: Colors.textSecondary },
  lastMsg: {
    fontSize: Typography.bodySmall,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  memberCount: {
    fontSize: Typography.tiny,
    color: Colors.textSecondary,
    marginTop: 3,
  },
  joinButton: { margin: Spacing.md, marginBottom: 0 },
  fab: {
    position: 'absolute',
    right: Spacing.md,
    bottom: Spacing.md,
    backgroundColor: Colors.secondary,
  },
  modal: {
    backgroundColor: Colors.card,
    margin: Spacing.lg,
    padding: Spacing.lg,
    borderRadius: BorderRadius.lg,
  },
  modalTitle: {
    fontSize: Typography.h3,
    fontWeight: '600',
    marginBottom: Spacing.md,
    color: Colors.text,
  },
  modalInput: { marginBottom: Spacing.md, backgroundColor: Colors.card },
  nativeTeamNameLabel: {
    color: Colors.textSecondary,
    fontSize: Typography.caption,
    marginBottom: 4,
  },
  nativeTeamNameInput: {
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: Colors.primary,
    borderRadius: BorderRadius.sm,
    color: Colors.text,
    fontSize: Typography.body,
    paddingHorizontal: Spacing.md,
    paddingVertical: 12,
    marginBottom: Spacing.md,
  },
  historyTeamBtn: { marginTop: Spacing.sm },
});

const rosterStyles = StyleSheet.create({
  addTeamBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    backgroundColor: Colors.card,
  },
  addTeamBtnText: {
    fontSize: Typography.bodySmall,
    fontWeight: '600',
    color: Colors.primary,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: Spacing.md,
    paddingVertical: 6,
    backgroundColor: Colors.surfaceGray,
  },
  sectionLabel: {
    fontSize: Typography.caption,
    fontWeight: '600',
    color: Colors.textSecondary,
  },
  teamBlock: {
    backgroundColor: Colors.card,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  teamRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingVertical: 12,
    gap: Spacing.sm,
  },
  starBtn: { padding: 4 },
  teamName: {
    flex: 1,
    fontSize: Typography.body,
    fontWeight: '600',
    color: Colors.text,
  },
  expandBtn: { padding: 4 },
  playerList: {
    paddingLeft: Spacing.xl,
    paddingRight: Spacing.md,
    paddingBottom: Spacing.sm,
    backgroundColor: Colors.surfaceGray,
  },
  playerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    gap: Spacing.sm,
  },
  playerNumber: {
    fontSize: Typography.caption,
    color: Colors.textSecondary,
    width: 32,
  },
  playerName: {
    flex: 1,
    fontSize: Typography.bodySmall,
    color: Colors.text,
  },
  playerPos: {
    fontSize: Typography.caption,
    color: Colors.textSecondary,
    width: 40,
    textAlign: 'right',
  },
  noPlayers: {
    fontSize: Typography.caption,
    color: Colors.textSecondary,
    paddingVertical: 8,
  },
  addPlayerActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.md,
    paddingVertical: 4,
  },
  addPlayerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 6,
  },
  addPlayerBtnText: {
    fontSize: Typography.caption,
    color: Colors.primary,
    fontWeight: '600',
  },
  addPlayerForm: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    paddingVertical: 6,
    flexWrap: 'wrap',
  },
  addPlayerInput: {
    flex: 1,
    backgroundColor: Colors.card,
    minWidth: 100,
  },
  addPlayerNumInput: {
    width: 60,
    backgroundColor: Colors.card,
  },
  editBtn: { padding: 4 },
});
