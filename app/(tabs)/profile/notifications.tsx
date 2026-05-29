import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  FlatList,
  StyleSheet,
  ActivityIndicator,
  Alert,
  TouchableOpacity,
} from 'react-native';
import { Text, Button } from 'react-native-paper';
import { Stack, router } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useAuth } from '../../../src/contexts/AuthContext';
import { useNotifications } from '../../../src/hooks/useNotifications';
import { joinTeamById, getTeam } from '../../../src/services/teamService';
import { getUser } from '../../../src/services/userService';
import type { Notification } from '../../../src/models/types';
import { Colors, Spacing, Typography, BorderRadius } from '../../../src/constants/theme';

type Meta = { teamName?: string; inviterName?: string; fromUserName?: string };

export default function NotificationsScreen() {
  const { currentUser } = useAuth();
  const { notifications, loading, markAsRead, markAllAsRead } = useNotifications();
  const [meta, setMeta] = useState<Record<string, Meta>>({});
  const [processing, setProcessing] = useState<string | null>(null);

  useEffect(() => {
    if (notifications.length === 0) return;
    let cancelled = false;
    Promise.all(
      notifications.map(async (n) => {
        if (n.type === 'teamInvite') {
          const [team, inviter] = await Promise.all([
            n.data.teamId ? getTeam(n.data.teamId).catch(() => null) : null,
            n.fromUserId ? getUser(n.fromUserId).catch(() => null) : null,
          ]);
          return {
            id: n.id,
            teamName: team?.name,
            inviterName: inviter?.displayName ?? (inviter?.username ?? undefined),
          };
        }
        // follow/like/comment/dm: fromUserName を取得
        const fromUser = n.fromUserId ? await getUser(n.fromUserId).catch(() => null) : null;
        return {
          id: n.id,
          fromUserName: fromUser?.displayName ?? (fromUser?.username ?? undefined),
        };
      }),
    ).then((results) => {
      if (cancelled) return;
      const map: Record<string, Meta> = {};
      results.forEach(({ id, ...metaData }) => {
        map[id] = metaData;
      });
      setMeta(map);
    });
    return () => { cancelled = true; };
  }, [notifications]);

  const handleApprove = useCallback(async (n: Notification) => {
    if (!currentUser || !n.data.teamId) return;
    setProcessing(n.id);
    try {
      await joinTeamById(currentUser.uid, n.data.teamId);
      await markAsRead(n.id);
    } catch (e: any) {
      Alert.alert('エラー', e?.message ?? '参加に失敗しました');
    } finally {
      setProcessing(null);
    }
  }, [currentUser, markAsRead]);

  const handleDecline = useCallback(async (n: Notification) => {
    setProcessing(n.id);
    try {
      await markAsRead(n.id);
    } finally {
      setProcessing(null);
    }
  }, [markAsRead]);

  const handlePress = useCallback(async (n: Notification) => {
    await markAsRead(n.id).catch(() => {});
    if (n.type === 'follow' && n.fromUserId) {
      router.push(`/user/${n.fromUserId}` as any);
    } else if ((n.type === 'like' || n.type === 'comment') && n.data.postId) {
      router.push(`/(tabs)/feed/${n.data.postId}` as any);
    } else if (n.type === 'dm' && n.data.conversationId) {
      router.push(`/messages/${n.data.conversationId}` as any);
    }
  }, [markAsRead]);

  const renderItem = ({ item }: { item: Notification }) => {
    const isRead = item.read;
    const isProcessing = processing === item.id;

    if (item.type === 'teamInvite') {
      const m = meta[item.id] ?? {};
      return (
        <View style={[styles.item, isRead && styles.itemRead]}>
          <View style={styles.iconWrap}>
            <MaterialCommunityIcons
              name="account-group"
              size={24}
              color={isRead ? Colors.textDisabled : Colors.primary}
            />
          </View>
          <View style={styles.content}>
            <Text style={[styles.title, isRead && styles.titleRead]}>
              チームへの招待
            </Text>
            <Text style={styles.sub} numberOfLines={2}>
              {m.inviterName ?? '誰か'}から「{m.teamName ?? '…'}」に招待されました
            </Text>
            {!isRead && (
              <View style={styles.actions}>
                <Button
                  mode="contained"
                  compact
                  buttonColor={Colors.primary}
                  onPress={() => handleApprove(item)}
                  loading={isProcessing}
                  disabled={isProcessing}
                  style={styles.approveBtn}
                >
                  承認
                </Button>
                <Button
                  mode="outlined"
                  compact
                  onPress={() => handleDecline(item)}
                  disabled={isProcessing}
                  style={styles.declineBtn}
                >
                  拒否
                </Button>
              </View>
            )}
          </View>
        </View>
      );
    }

    const iconMap: Record<string, string> = {
      follow: 'account-plus',
      like: 'heart',
      comment: 'comment-text',
      dm: 'message-text',
      aiReport: 'robot',
    };
    const m = meta[item.id] ?? {};
    const fromName = m.fromUserName ?? '誰か';
    const bodyMap: Partial<Record<string, string>> = {
      follow: `${fromName}さんがあなたをフォローしました`,
      like: `${fromName}さんがあなたの投稿にいいねしました`,
      comment: `${fromName}さんがあなたの投稿にコメントしました`,
      dm: `${fromName}さんからメッセージが届きました`,
    };
    const body = bodyMap[item.type];
    const isTappable = ['follow', 'like', 'comment', 'dm'].includes(item.type);
    return (
      <TouchableOpacity
        style={[styles.item, isRead && styles.itemRead]}
        onPress={isTappable ? () => handlePress(item) : undefined}
        activeOpacity={isTappable ? 0.7 : 1}
      >
        <View style={styles.iconWrap}>
          <MaterialCommunityIcons
            name={(iconMap[item.type] ?? 'bell') as any}
            size={24}
            color={isRead ? Colors.textDisabled : Colors.primary}
          />
        </View>
        <View style={styles.content}>
          <Text style={[styles.title, isRead && styles.titleRead]}>
            {body ?? item.type}
          </Text>
        </View>
      </TouchableOpacity>
    );
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={Colors.action} size="large" />
      </View>
    );
  }

  return (
    <>
      <Stack.Screen
        options={{
          headerRight: notifications.some((n) => !n.read)
            ? () => (
                <Button compact textColor={Colors.primary} onPress={markAllAsRead}>
                  全て既読
                </Button>
              )
            : undefined,
        }}
      />
      <FlatList
        data={notifications}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        contentContainerStyle={
          notifications.length === 0 ? styles.emptyContainer : styles.listContent
        }
        ListEmptyComponent={
          <View style={styles.emptyContent}>
            <MaterialCommunityIcons name="bell-outline" size={48} color={Colors.border} />
            <Text style={styles.emptyText}>通知はありません</Text>
          </View>
        }
      />
    </>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.background },
  listContent: { padding: Spacing.md, gap: Spacing.sm },
  emptyContainer: { flex: 1 },
  emptyContent: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 80,
    gap: Spacing.sm,
  },
  emptyText: { fontSize: Typography.bodySmall, color: Colors.textSecondary },
  item: {
    flexDirection: 'row',
    backgroundColor: Colors.card,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    gap: Spacing.sm,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 1,
    shadowOffset: { width: 0, height: 1 },
  },
  itemRead: { backgroundColor: Colors.surfaceGray, opacity: 0.7 },
  iconWrap: { paddingTop: 2 },
  content: { flex: 1, gap: 4 },
  title: { fontSize: Typography.bodySmall, fontWeight: '600', color: Colors.text },
  titleRead: { color: Colors.textDisabled },
  sub: { fontSize: Typography.caption, color: Colors.textSecondary, lineHeight: 18 },
  actions: { flexDirection: 'row', gap: Spacing.sm, marginTop: Spacing.xs },
  approveBtn: { flex: 1 },
  declineBtn: { flex: 1 },
});
