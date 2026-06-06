import React from 'react';
import { View, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Text, Avatar, Button } from 'react-native-paper';
import { useLocalSearchParams, router, Stack } from 'expo-router';
import { useFollowing, useFollow } from '../../../src/hooks/useFollow';
import { Colors, Spacing, Typography } from '../../../src/constants/theme';
import type { User } from '../../../src/models/types';

function FollowingItem({ user }: { user: User }) {
  const { isFollowing, toggleFollow, loading } = useFollow(user.uid);
  return (
    <View style={styles.item}>
      <TouchableOpacity style={styles.userInfo} onPress={() => router.push(`/user/${user.uid}` as any)}>
        {user.photoURL ? (
          <Avatar.Image size={48} source={{ uri: user.photoURL }} />
        ) : (
          <Avatar.Text
            size={48}
            label={user.displayName.charAt(0)}
            style={{ backgroundColor: Colors.primary }}
            labelStyle={{ color: Colors.white }}
          />
        )}
        <Text style={styles.name} numberOfLines={1}>{user.displayName}</Text>
      </TouchableOpacity>
      <Button
        mode={isFollowing ? 'outlined' : 'contained'}
        onPress={toggleFollow}
        loading={loading}
        compact
        buttonColor={isFollowing ? undefined : Colors.primary}
        textColor={isFollowing ? Colors.primary : Colors.white}
      >
        {isFollowing ? 'フォロー中' : 'フォロー'}
      </Button>
    </View>
  );
}

export default function FollowingScreen() {
  const { userId } = useLocalSearchParams<{ userId: string }>();
  const { following, loading, loadMore, hasMore } = useFollowing(userId ?? '');

  return (
    <>
      <Stack.Screen
        options={{
          title: 'フォロー中',
          headerShown: true,
          headerStyle: { backgroundColor: Colors.white },
          headerTintColor: Colors.primary,
          headerTitleStyle: { fontWeight: '700', color: Colors.text },
          headerShadowVisible: false,
        }}
      />
      <View style={styles.container}>
        {loading && following.length === 0 ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator color={Colors.primary} />
          </View>
        ) : (
          <FlatList
            data={following}
            keyExtractor={(item) => item.uid}
            renderItem={({ item }) => <FollowingItem user={item} />}
            contentContainerStyle={following.length === 0 ? styles.emptyContainer : styles.listContent}
            onEndReached={hasMore ? loadMore : undefined}
            onEndReachedThreshold={0.5}
            ListEmptyComponent={
              <View style={styles.emptyContainer}>
                <Text style={styles.emptyText}>フォロー中のユーザーがいません</Text>
              </View>
            }
          />
        )}
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  listContent: { paddingVertical: Spacing.sm },
  emptyContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingTop: 80 },
  emptyText: { fontSize: Typography.body, color: Colors.textSecondary },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    backgroundColor: Colors.card,
  },
  userInfo: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginRight: Spacing.sm,
  },
  name: {
    flex: 1,
    fontSize: Typography.body,
    fontWeight: '600',
    color: Colors.text,
  },
});
