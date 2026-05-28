import React from 'react';
import { FlatList, StyleSheet, View, TouchableOpacity } from 'react-native';
import { FAB, Text } from 'react-native-paper';
import { router } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import PostCard from '../../../src/components/PostCard';
import LoadingScreen from '../../../src/components/LoadingScreen';
import EmptyState from '../../../src/components/EmptyState';
import FeaturedPlayers from '../../../src/components/feed/FeaturedPlayers';
import type { FeaturedPlayer } from '../../../src/services/rankingService';
import AdBanner from '../../../src/components/ads/AdBanner';
import { useFeedPosts } from '../../../src/hooks/usePosts';
import { useAuth } from '../../../src/contexts/AuthContext';
import { useRequireAuth } from '../../../src/hooks/useRequireAuth';
import { Colors, Spacing, Typography, BorderRadius } from '../../../src/constants/theme';

export default function FeedScreen() {
  const { posts, loading, refreshing, refresh, loadMore, hasMore } = useFeedPosts();
  const { currentUser } = useAuth();
  const requireAuth = useRequireAuth();

  if (loading && posts.length === 0) {
    return <LoadingScreen message="Loading feed..." />;
  }

  const formatTimeAgo = (date: any) => {
    const now = Date.now();
    const ts = date?.toMillis?.() ?? Date.now();
    const diffMin = Math.floor((now - ts) / 60000);
    if (diffMin < 1) return 'just now';
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffHr = Math.floor(diffMin / 60);
    if (diffHr < 24) return `${diffHr}h ago`;
    return `${Math.floor(diffHr / 24)}d ago`;
  };

  return (
    <View style={styles.container}>
      <FlatList
        data={posts}
        keyExtractor={(item) => item.id}
        ListHeaderComponent={
          <>
            <FeaturedPlayers
              onPlayerPress={(_player: FeaturedPlayer) => {
                // 将来: router.push(`/player/${_player.id}`)
              }}
              onViewMore={() => router.push('/ranking/details' as any)}
            />
            <AdBanner />
          </>
        }
        renderItem={({ item }) => (
          <PostCard
            authorName={item.authorName}
            authorPhotoURL={item.authorPhotoURL}
            content={item.content}
            type={item.type}
            mediaURLs={item.mediaURLs}
            externalVideoUrl={item.externalVideoUrl}
            likesCount={item.likesCount}
            commentsCount={item.commentsCount}
            timeAgo={formatTimeAgo(item.createdAt)}
            onPress={() => router.push(`/(tabs)/feed/${item.id}`)}
            onAuthorPress={() => router.push(`/user/${item.authorId}` as any)}
            // Auth-aware like: guests are redirected to login without local state toggle
            requiresAuth={!currentUser}
            onLike={() => requireAuth()}
            onComment={() => requireAuth(() => router.push(`/(tabs)/feed/${item.id}`))}
          />
        )}
        contentContainerStyle={posts.length === 0 ? styles.emptyContainer : styles.listContent}
        ListEmptyComponent={
          <EmptyState
            icon="baseball"
            title="投稿がありません"
            subtitle="選手をフォローして更新情報を確認しましょう"
          />
        }
        ListFooterComponent={
          !currentUser ? (
            <TouchableOpacity
              style={styles.guestBanner}
              onPress={() => router.push('/(auth)/login')}
            >
              <MaterialCommunityIcons name="baseball" size={20} color={Colors.primary} />
              <Text style={styles.guestBannerText}>ログインして選手を応援しよう</Text>
              <MaterialCommunityIcons name="chevron-right" size={20} color={Colors.primary} />
            </TouchableOpacity>
          ) : null
        }
        refreshing={refreshing}
        onRefresh={refresh}
        onEndReached={hasMore ? loadMore : undefined}
        onEndReachedThreshold={0.5}
      />
      <FAB
        icon="plus"
        style={styles.fab}
        color={Colors.white}
        onPress={() => requireAuth(() => router.push('/(tabs)/feed/create' as any))}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  listContent: { paddingTop: Spacing.md, paddingBottom: 80 },
  emptyContainer: { flex: 1 },
  fab: {
    position: 'absolute',
    right: Spacing.md,
    bottom: Spacing.md,
    backgroundColor: Colors.secondary,
  },
  guestBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    marginHorizontal: Spacing.md,
    marginVertical: Spacing.lg,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.lg,
    backgroundColor: Colors.primaryLight,
    borderRadius: BorderRadius.xl,
  },
  guestBannerText: {
    flex: 1,
    fontSize: Typography.bodySmall,
    fontWeight: '600',
    color: Colors.primary,
    textAlign: 'center',
  },
});
