import React, { useState, useCallback } from 'react';
import {
  View,
  StyleSheet,
  FlatList,
  ScrollView,
  Share,
  Modal,
  Pressable,
  Alert,
  TouchableOpacity,
} from 'react-native';
import { Text, Avatar, Button, Chip, TextInput, ActivityIndicator } from 'react-native-paper';
import { useLocalSearchParams, router } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTeamDetail } from '../../../../src/hooks/useTeam';
import { useAuth } from '../../../../src/contexts/AuthContext';
import { inviteToTeam, leaveTeam, removeMember } from '../../../../src/services/teamService';
import { searchUsers } from '../../../../src/services/userService';
import EmptyState from '../../../../src/components/EmptyState';
import { Colors, Spacing, Typography, BorderRadius } from '../../../../src/constants/theme';
import { TeamMember, User } from '../../../../src/models/types';

const ROLE_LABELS: Record<string, string> = {
  owner: 'オーナー',
  admin: '管理者',
  member: 'メンバー',
};

type InviteTab = 'code' | 'search';

export default function TeamDetailScreen() {
  const { teamId } = useLocalSearchParams<{ teamId: string }>();
  const { team, members, loading, isOwner, refresh } = useTeamDetail(teamId ?? '');
  const { currentUser } = useAuth();

  const [inviteVisible, setInviteVisible] = useState(false);
  const [selectedMember, setSelectedMember] = useState<(TeamMember & { user: User }) | null>(null);
  const [leaving, setLeaving] = useState(false);
  const [kicking, setKicking] = useState(false);
  const [inviteTab, setInviteTab] = useState<InviteTab>('code');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<User[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [invitedIds, setInvitedIds] = useState<Set<string>>(new Set());
  const [inviting, setInviting] = useState<string | null>(null);
  const [shared, setShared] = useState(false);

  const handleOpenInvite = useCallback(() => {
    setInviteVisible(true);
    setInviteTab('code');
    setSearchQuery('');
    setSearchResults([]);
    setInvitedIds(new Set());
    setShared(false);
  }, []);

  const handleSearch = useCallback(async (q: string) => {
    setSearchQuery(q);
    if (!q.trim()) {
      setSearchResults([]);
      return;
    }
    setSearchLoading(true);
    try {
      const results = await searchUsers(q.trim());
      setSearchResults(results);
    } catch (err) {
      if (__DEV__) console.error('[handleSearch] searchUsers failed:', err);
      setSearchResults([]);
    } finally {
      setSearchLoading(false);
    }
  }, []);

  const handleInvite = useCallback(
    async (target: User) => {
      if (!currentUser || !teamId || inviting) return;
      setInviting(target.uid);
      try {
        await inviteToTeam(teamId, target.uid, currentUser.uid);
        setInvitedIds((prev) => new Set(prev).add(target.uid));
      } catch {
        /* no-op */
      } finally {
        setInviting(null);
      }
    },
    [currentUser, teamId, inviting],
  );

  const handleLeave = useCallback(() => {
    if (!currentUser || !teamId || isOwner) return;
    Alert.alert(
      'チームを退会しますか？',
      '退会するとチームのチャットや共有データにアクセスできなくなります',
      [
        { text: 'キャンセル', style: 'cancel' },
        {
          text: '退会する',
          style: 'destructive',
          onPress: async () => {
            setLeaving(true);
            try {
              await leaveTeam(teamId, currentUser.uid);
              router.replace('/(tabs)/teams' as any);
            } catch (err) {
              if (__DEV__) console.error('[handleLeave] failed:', err);
              Alert.alert('エラー', '退会に失敗しました');
            } finally {
              setLeaving(false);
            }
          },
        },
      ],
    );
  }, [currentUser, teamId, isOwner]);

  const handleKick = useCallback(
    (member: TeamMember & { user: User }) => {
      if (!currentUser || !teamId || !isOwner) return;
      const memberName = member.user?.displayName ?? 'ユーザー';
      Alert.alert(
        `${memberName}を退会させますか？`,
        undefined,
        [
          { text: 'キャンセル', style: 'cancel' },
          {
            text: '退会させる',
            style: 'destructive',
            onPress: async () => {
              setKicking(true);
              try {
                await removeMember(teamId, member.userId, currentUser.uid);
                setSelectedMember(null);
                await refresh();
              } catch (err) {
                if (__DEV__) console.error('[handleKick] failed:', err);
                Alert.alert('エラー', '強制退会に失敗しました');
              } finally {
                setKicking(false);
              }
            },
          },
        ],
      );
    },
    [currentUser, teamId, isOwner, refresh],
  );

  const canKickMember = useCallback(
    (member: TeamMember & { user: User }) =>
      isOwner &&
      member.userId !== currentUser?.uid &&
      member.role !== 'owner',
    [isOwner, currentUser?.uid],
  );

  const handleShare = useCallback(async () => {
    if (!team?.inviteCode) return;
    try {
      await Share.share({
        message: `🎯 BaseLedgerチームへの招待が届いています！\n\n「${team.name}」があなたを待っています。\n\n今すぐ参加する👇\nballpark://join?code=${team.inviteCode}\n\n招待コード: ${team.inviteCode}`,
      });
      setShared(true);
      setTimeout(() => setShared(false), 2000);
    } catch {
      /* cancelled */
    }
  }, [team]);

  if (!team) {
    return <EmptyState icon="account-group" title="チームが見つかりません" />;
  }

  const memberIdSet = new Set(team.memberIds);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
      <View style={styles.header}>
        <Avatar.Text size={64} label={team.name.charAt(0)} style={styles.avatar} />
        <Text style={styles.teamName}>{team.name}</Text>
        <Text style={styles.description}>{team.description}</Text>
        <View style={styles.metaRow}>
          <Chip compact icon="account-group">{members.length}人のメンバー</Chip>
          {team.isPrivate && <Chip compact icon="lock">非公開</Chip>}
          {isOwner && (
            <Chip compact icon="crown" style={styles.ownerChip} textStyle={{ color: Colors.white }}>
              オーナー
            </Chip>
          )}
        </View>
        <View style={styles.actionRow}>
          <Button
            mode="outlined"
            onPress={() => router.push(`/(tabs)/teams/${teamId}/chat` as any)}
            icon="chat"
            compact
          >
            チャット
          </Button>
          <Button
            mode="outlined"
            onPress={() => router.push(`/(tabs)/teams/${teamId}/scores` as any)}
            icon="chart-bar"
            compact
          >
            スコア
          </Button>
          {isOwner && (
            <Button mode="outlined" onPress={handleOpenInvite} icon="account-plus" compact>
              招待
            </Button>
          )}
        </View>
      </View>

      <Text style={styles.sectionTitle}>メンバー</Text>
      <FlatList
        data={members}
        keyExtractor={(item) => item.userId}
        horizontal
        showsHorizontalScrollIndicator={false}
        nestedScrollEnabled
        renderItem={({ item }) => {
          const kickable = canKickMember(item);
          const content = (
            <>
              <Avatar.Text
                size={44}
                label={(item.user?.displayName ?? 'U').charAt(0)}
                style={styles.memberAvatar}
              />
              <Text style={styles.memberName} numberOfLines={1}>
                {item.user?.displayName ?? 'ユーザー'}
              </Text>
              <Text style={styles.memberRole}>{ROLE_LABELS[item.role] ?? item.role}</Text>
            </>
          );
          if (!kickable) {
            return <View style={styles.memberItem}>{content}</View>;
          }
          return (
            <TouchableOpacity
              style={styles.memberItem}
              onPress={() => setSelectedMember(item)}
              activeOpacity={0.7}
            >
              {content}
            </TouchableOpacity>
          );
        }}
        contentContainerStyle={styles.membersList}
      />

      {!isOwner && (
        <View style={styles.leaveSection}>
          <Button
            mode="outlined"
            textColor={Colors.error}
            icon="exit-to-app"
            onPress={handleLeave}
            loading={leaving}
            disabled={leaving}
            style={styles.leaveBtn}
          >
            チームを退会する
          </Button>
        </View>
      )}

      {/* ── メンバー操作モーダル（オーナー用） ─────────────────────── */}
      <Modal
        visible={selectedMember !== null}
        transparent
        animationType="slide"
        onRequestClose={() => setSelectedMember(null)}
      >
        <Pressable style={styles.overlay} onPress={() => setSelectedMember(null)}>
          <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
            <View style={styles.handle} />
            {selectedMember && (
              <>
                <View style={styles.memberSheetHeader}>
                  <Avatar.Text
                    size={52}
                    label={(selectedMember.user?.displayName ?? 'U').charAt(0)}
                    style={styles.memberAvatar}
                  />
                  <Text style={styles.memberSheetName}>
                    {selectedMember.user?.displayName ?? 'ユーザー'}
                  </Text>
                  <Text style={styles.memberSheetRole}>
                    {ROLE_LABELS[selectedMember.role] ?? selectedMember.role}
                  </Text>
                </View>
                <Button
                  mode="outlined"
                  textColor={Colors.error}
                  icon="account-remove"
                  onPress={() => handleKick(selectedMember)}
                  loading={kicking}
                  disabled={kicking}
                  style={styles.kickBtn}
                >
                  強制退会
                </Button>
              </>
            )}
          </Pressable>
        </Pressable>
      </Modal>

      {/* ── 招待モーダル ──────────────────────────────────────────── */}
      <Modal
        visible={inviteVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setInviteVisible(false)}
      >
        <Pressable style={styles.overlay} onPress={() => setInviteVisible(false)}>
          <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
            <View style={styles.handle} />
            <Text style={styles.sheetTitle}>メンバーを招待</Text>

            {/* タブ切り替え */}
            <View style={styles.tabRow}>
              {(['code', 'search'] as InviteTab[]).map((tab) => (
                <Pressable
                  key={tab}
                  style={[styles.tab, inviteTab === tab && styles.tabActive]}
                  onPress={() => setInviteTab(tab)}
                >
                  <Text style={[styles.tabText, inviteTab === tab && styles.tabTextActive]}>
                    {tab === 'code' ? '招待コード' : 'ユーザー検索'}
                  </Text>
                </Pressable>
              ))}
            </View>

            {inviteTab === 'code' ? (
              /* ── タブ1: 招待コード ── */
              <View style={styles.codePanel}>
                <Text style={styles.codeHint}>
                  このコードを伝えてチームに招待しましょう
                </Text>
                <View style={styles.codeCard}>
                  <Text style={styles.codeText} selectable>{team.inviteCode}</Text>
                </View>
                <Button
                  mode="contained"
                  icon={shared ? 'check' : 'share-variant'}
                  onPress={handleShare}
                  buttonColor={shared ? Colors.secondary : Colors.primary}
                  style={styles.shareBtn}
                >
                  {shared ? 'シェアしました' : '招待コードをシェア'}
                </Button>
              </View>
            ) : (
              /* ── タブ2: ユーザー検索 ── */
              <View style={styles.searchPanel}>
                <TextInput
                  mode="outlined"
                  placeholder="名前で検索..."
                  value={searchQuery}
                  onChangeText={handleSearch}
                  left={<TextInput.Icon icon="magnify" />}
                  style={styles.searchInput}
                  outlineColor={Colors.border}
                  activeOutlineColor={Colors.primary}
                  dense
                />
                {searchLoading ? (
                  <ActivityIndicator style={styles.spinner} color={Colors.primary} />
                ) : (
                  <FlatList
                    data={searchResults}
                    keyExtractor={(u) => u.uid}
                    style={styles.resultList}
                    renderItem={({ item }) => {
                      const isMember = memberIdSet.has(item.uid);
                      const isInvited = invitedIds.has(item.uid);
                      if (item.uid === currentUser?.uid) return null;
                      return (
                        <View style={styles.resultRow}>
                          <Avatar.Text
                            size={40}
                            label={(item.displayName ?? 'U').charAt(0)}
                            style={styles.resultAvatar}
                          />
                          <View style={styles.resultInfo}>
                            <Text style={styles.resultName}>{item.displayName}</Text>
                            {item.username ? (
                              <Text style={styles.resultUsername}>@{item.username}</Text>
                            ) : null}
                          </View>
                          {isMember ? (
                            <Chip compact style={styles.chipMember}>参加済み</Chip>
                          ) : isInvited ? (
                            <Chip compact icon="check" style={styles.chipInvited}>
                              送信済み
                            </Chip>
                          ) : (
                            <Button
                              mode="contained"
                              compact
                              onPress={() => handleInvite(item)}
                              loading={inviting === item.uid}
                              disabled={!!inviting}
                              buttonColor={Colors.primary}
                              style={styles.inviteBtn}
                            >
                              招待
                            </Button>
                          )}
                        </View>
                      );
                    }}
                    ListEmptyComponent={
                      searchQuery.trim() && !searchLoading ? (
                        <Text style={styles.noResult}>ユーザーが見つかりません</Text>
                      ) : null
                    }
                  />
                )}
              </View>
            )}
          </Pressable>
        </Pressable>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  contentContainer: { flexGrow: 1 },
  header: {
    backgroundColor: Colors.card,
    padding: Spacing.lg,
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  avatar: { backgroundColor: Colors.primary },
  teamName: { fontSize: Typography.h2, fontWeight: '700', color: Colors.text, marginTop: Spacing.sm },
  description: { fontSize: Typography.body, color: Colors.textSecondary, textAlign: 'center', marginTop: 4 },
  metaRow: { flexDirection: 'row', gap: Spacing.sm, marginTop: Spacing.md, flexWrap: 'wrap', justifyContent: 'center' },
  ownerChip: { backgroundColor: Colors.accent },
  actionRow: { flexDirection: 'row', gap: Spacing.sm, marginTop: Spacing.md },
  sectionTitle: { fontSize: Typography.h4, fontWeight: '600', color: Colors.text, margin: Spacing.md },
  membersList: { paddingHorizontal: Spacing.md, gap: Spacing.md },
  memberItem: { alignItems: 'center', width: 70 },
  memberAvatar: { backgroundColor: Colors.primary },
  memberName: { fontSize: Typography.tiny, color: Colors.text, marginTop: 4, textAlign: 'center' },
  memberRole: { fontSize: Typography.tiny, color: Colors.textSecondary },
  leaveSection: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.lg,
    marginTop: Spacing.sm,
  },
  leaveBtn: {
    borderColor: Colors.error,
  },
  memberSheetHeader: {
    alignItems: 'center',
    marginBottom: Spacing.lg,
  },
  memberSheetName: {
    fontSize: Typography.h4,
    fontWeight: '700',
    color: Colors.text,
    marginTop: Spacing.sm,
  },
  memberSheetRole: {
    fontSize: Typography.bodySmall,
    color: Colors.textSecondary,
    marginTop: 4,
  },
  kickBtn: {
    borderColor: Colors.error,
  },

  // Modal
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: Colors.card,
    borderTopLeftRadius: BorderRadius.xl,
    borderTopRightRadius: BorderRadius.xl,
    padding: Spacing.lg,
    paddingBottom: 40,
    maxHeight: '82%',
  },
  handle: {
    width: 40,
    height: 4,
    backgroundColor: Colors.border,
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: Spacing.md,
  },
  sheetTitle: { fontSize: Typography.h4, fontWeight: '700', color: Colors.text, marginBottom: Spacing.md },

  // Tabs
  tabRow: {
    flexDirection: 'row',
    backgroundColor: Colors.primaryLight,
    borderRadius: BorderRadius.full,
    padding: 3,
    marginBottom: Spacing.lg,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.full,
  },
  tabActive: { backgroundColor: Colors.primary },
  tabText: { fontSize: Typography.bodySmall, fontWeight: '600', color: Colors.textSecondary },
  tabTextActive: { color: Colors.white },

  // Code tab
  codePanel: { alignItems: 'center', paddingVertical: Spacing.md },
  codeHint: {
    fontSize: Typography.bodySmall,
    color: Colors.textSecondary,
    marginBottom: Spacing.lg,
    textAlign: 'center',
  },
  codeCard: {
    backgroundColor: Colors.primaryLight,
    borderRadius: BorderRadius.lg,
    paddingVertical: Spacing.lg,
    paddingHorizontal: 40,
    marginBottom: Spacing.lg,
  },
  codeText: { fontSize: 28, fontWeight: '700', color: Colors.primary, letterSpacing: 4 },
  shareBtn: { width: '100%' },

  // Search tab
  searchPanel: { flex: 1 },
  searchInput: { backgroundColor: Colors.card, marginBottom: Spacing.sm },
  spinner: { marginTop: Spacing.xl },
  resultList: { maxHeight: 300 },
  resultRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.border,
  },
  resultAvatar: { backgroundColor: Colors.primary },
  resultInfo: { flex: 1, marginLeft: Spacing.sm },
  resultName: { fontSize: Typography.body, fontWeight: '600', color: Colors.text },
  resultUsername: { fontSize: Typography.tiny, color: Colors.textSecondary, marginTop: 1 },
  chipMember: { backgroundColor: Colors.border },
  chipInvited: { backgroundColor: Colors.secondary },
  inviteBtn: { minWidth: 56 },
  noResult: {
    textAlign: 'center',
    color: Colors.textSecondary,
    marginTop: Spacing.lg,
    fontSize: Typography.bodySmall,
  },
});
