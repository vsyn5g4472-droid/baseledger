import React, { useCallback, useEffect, useState } from 'react';
import { View, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import { Text, Avatar, Divider } from 'react-native-paper';
import { Colors, Spacing, Typography, BorderRadius } from '../../../src/constants/theme';
import { useAuth } from '../../../src/contexts/AuthContext';
import { getBlockedUserIds, unblockUser } from '../../../src/services/blockReportService';
import { getUser } from '../../../src/services/userService';

interface BlockedUser {
  id: string;
  displayName: string;
  photoURL: string | null;
}

export default function BlockListScreen() {
  const { currentUser } = useAuth();
  const [blocked, setBlocked] = useState<BlockedUser[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!currentUser) { setLoading(false); return; }
    (async () => {
      try {
        const ids = await getBlockedUserIds(currentUser.uid);
        const users = await Promise.all(
          ids.map(async (id) => {
            try {
              const u = await getUser(id);
              return { id, displayName: u.displayName, photoURL: u.photoURL };
            } catch {
              return { id, displayName: id, photoURL: null };
            }
          }),
        );
        setBlocked(users);
      } catch {
        Alert.alert('エラー', 'ブロックリストの取得に失敗しました。');
      } finally {
        setLoading(false);
      }
    })();
  }, [currentUser]);

  const handleUnblock = useCallback(
    (item: BlockedUser) => {
      Alert.alert(
        'ブロックを解除しますか？',
        `${item.displayName}のブロックを解除します。`,
        [
          { text: 'キャンセル', style: 'cancel' },
          {
            text: '解除する',
            onPress: async () => {
              if (!currentUser) return;
              try {
                await unblockUser(currentUser.uid, item.id);
                setBlocked((prev) => prev.filter((u) => u.id !== item.id));
              } catch {
                Alert.alert('エラー', 'ブロック解除に失敗しました。');
              }
            },
          },
        ],
      );
    },
    [currentUser],
  );

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={Colors.primary} />
      </View>
    );
  }

  return (
    <FlatList
      data={blocked}
      keyExtractor={(item) => item.id}
      style={styles.container}
      contentContainerStyle={blocked.length === 0 ? styles.emptyContainer : styles.listContent}
      ItemSeparatorComponent={() => <Divider />}
      ListEmptyComponent={
        <View style={styles.empty}>
          <Text style={styles.emptyText}>ブロックしているユーザーはいません</Text>
        </View>
      }
      renderItem={({ item }) => (
        <View style={styles.row}>
          {item.photoURL ? (
            <Avatar.Image size={40} source={{ uri: item.photoURL }} />
          ) : (
            <Avatar.Text
              size={40}
              label={item.displayName ? item.displayName.charAt(0).toUpperCase() : '?'}
              style={styles.avatar}
              labelStyle={styles.avatarLabel}
            />
          )}
          <Text style={styles.name} numberOfLines={1}>{item.displayName}</Text>
          <TouchableOpacity style={styles.unblockBtn} onPress={() => handleUnblock(item)} activeOpacity={0.7}>
            <Text style={styles.unblockText}>ブロック解除</Text>
          </TouchableOpacity>
        </View>
      )}
    />
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  listContent: { paddingVertical: Spacing.sm },
  emptyContainer: { flex: 1 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 80 },
  emptyText: { fontSize: Typography.body, color: Colors.textSecondary },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    backgroundColor: Colors.card,
    gap: Spacing.sm,
  },
  avatar: { backgroundColor: Colors.primary, flexShrink: 0 },
  avatarLabel: { color: Colors.white, fontWeight: '700', fontSize: 14 },
  name: {
    flex: 1,
    fontSize: Typography.body,
    fontWeight: '500',
    color: Colors.text,
  },
  unblockBtn: {
    paddingVertical: 6,
    paddingHorizontal: Spacing.md,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  unblockText: {
    fontSize: Typography.caption,
    fontWeight: '600',
    color: Colors.textSecondary,
  },
});
