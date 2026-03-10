import React, { useState } from 'react';
import {
  View,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Pressable,
} from 'react-native';
import { Text, Avatar, Divider, Badge } from 'react-native-paper';
import { router } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useGroups } from '../../../src/hooks/useGroupChat';
import { useConversations } from '../../../src/hooks/useMessages';
import EmptyState from '../../../src/components/EmptyState';
import { Colors, Spacing, Typography, BorderRadius } from '../../../src/constants/theme';
import { useI18n } from '../../../src/i18n';
import { Group, Conversation } from '../../../src/models/types';

type TabType = 'groups' | 'dms';

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

function GroupItem({ item }: { item: Group }) {
  return (
    <TouchableOpacity
      style={styles.item}
      onPress={() =>
        router.push({
          pathname: '/(tabs)/chat/[chatId]',
          params: { chatId: item.id, type: 'group', title: item.name },
        } as any)
      }
      activeOpacity={0.7}
    >
      <View style={styles.avatarWrapper}>
        <Avatar.Text
          size={50}
          label={item.name.charAt(0)}
          style={styles.groupAvatar}
          labelStyle={styles.avatarLabel}
        />
        <View style={styles.groupBadge}>
          <MaterialCommunityIcons name="account-group" size={10} color={Colors.white} />
        </View>
      </View>
      <View style={styles.info}>
        <View style={styles.nameRow}>
          <Text style={styles.name} numberOfLines={1}>{item.name}</Text>
          <Text style={styles.time}>{formatTime(item.lastMessageAt)}</Text>
        </View>
        <Text style={styles.lastMsg} numberOfLines={1}>
          {item.lastMessage || 'メッセージはまだありません'}
        </Text>
        <Text style={styles.memberCount}>
          <MaterialCommunityIcons name="account-multiple" size={11} color={Colors.textSecondary} />
          {' '}{item.memberIds.length}人
        </Text>
      </View>
    </TouchableOpacity>
  );
}

function DMItem({ item }: { item: any }) {
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
      <Avatar.Text
        size={50}
        label={(item.otherUser?.displayName ?? 'U').charAt(0)}
        style={styles.dmAvatar}
        labelStyle={styles.avatarLabel}
      />
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

export default function ChatIndexScreen() {
  const { t } = useI18n();
  const [activeTab, setActiveTab] = useState<TabType>('groups');
  const { groups, loading: groupsLoading } = useGroups();
  const { conversations, loading: dmsLoading } = useConversations();

  const isGroups = activeTab === 'groups';

  return (
    <View style={styles.container}>
      {/* Tab Segmented Control */}
      <View style={styles.segmentWrapper}>
        <View style={styles.segment}>
          <Pressable
            style={[styles.segBtn, isGroups && styles.segBtnActive]}
            onPress={() => setActiveTab('groups')}
          >
            <MaterialCommunityIcons
              name="account-group"
              size={16}
              color={isGroups ? Colors.white : Colors.textSecondary}
            />
            <Text style={[styles.segText, isGroups && styles.segTextActive]}>
              {t.chat.groups}
            </Text>
            {groups.length > 0 && (
              <Badge style={styles.countBadge}>{groups.length}</Badge>
            )}
          </Pressable>
          <Pressable
            style={[styles.segBtn, !isGroups && styles.segBtnActive]}
            onPress={() => setActiveTab('dms')}
          >
            <MaterialCommunityIcons
              name="message-text"
              size={16}
              color={!isGroups ? Colors.white : Colors.textSecondary}
            />
            <Text style={[styles.segText, !isGroups && styles.segTextActive]}>
              {t.chat.dms}
            </Text>
            {conversations.length > 0 && (
              <Badge style={styles.countBadge}>{conversations.length}</Badge>
            )}
          </Pressable>
        </View>
      </View>

      {/* List */}
      {isGroups ? (
        <FlatList
          data={groups}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => <GroupItem item={item} />}
          ItemSeparatorComponent={() => <Divider style={styles.divider} />}
          contentContainerStyle={groups.length === 0 ? styles.emptyContainer : styles.listContent}
          ListEmptyComponent={
            !groupsLoading ? (
              <EmptyState
                icon="account-group-outline"
                title={t.chat.noGroups}
                subtitle={t.chat.noGroupsSub}
              />
            ) : null
          }
        />
      ) : (
        <FlatList
          data={conversations}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => <DMItem item={item} />}
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
  groupAvatar: { backgroundColor: Colors.primary },
  dmAvatar: { backgroundColor: Colors.secondary },
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
});
