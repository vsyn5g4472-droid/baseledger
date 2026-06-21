import React, { useState, useEffect, useMemo } from 'react';
import { FlatList, StyleSheet, View, TouchableOpacity } from 'react-native';
import { FAB, Text, Button } from 'react-native-paper';
import { router } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import PostCard from '../../../src/components/PostCard';
import LoadingScreen from '../../../src/components/LoadingScreen';
import EmptyState from '../../../src/components/EmptyState';
import FeaturedPlayers from '../../../src/components/feed/FeaturedPlayers';
import type { FeaturedPlayer } from '../../../src/services/rankingService';
import AdBanner from '../../../src/components/ads/AdBanner';
import { useFeedPosts, usePublicPosts, usePostActions } from '../../../src/hooks/usePosts';
import { useAuth } from '../../../src/contexts/AuthContext';
import { useRequireAuth } from '../../../src/hooks/useRequireAuth';
import { Colors, Spacing, Typography, BorderRadius } from '../../../src/constants/theme';
import { getBlockedUserIds } from '../../../src/services/blockReportService';

export default function FeedScreen() {
  const [feedTab, setFeedTab] = useState<'recommend' | 'following'>('recommend');
  const publicFeed = usePublicPosts();
  const followingFeed = useFeedPosts();
  const activeFeed = feedTab === 'recommend' ? publicFeed : followingFeed;
  const { posts, loading, refreshing, error, refresh, loadMore, hasMore } = activeFeed;
  const { currentUser, userPlan } = useAuth();
  const requireAuth = useRequireAuth();
  const { likePost, unlikePost } = usePostActions();
  const [blockedUserIds, setBlockedUserIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!currentUser) return;
    getBlockedUserIds(currentUser.uid)
      .then((ids) => setBlockedUserIds(new Set(ids)))
      .catch(() => {});
  }, [currentUser]);

  const filteredPosts = useMemo(
    () => posts.filter((p) => !blockedUserIds.has(p.authorId)),
    [posts, blockedUserIds],
  );

  if (loading && posts.length === 0) {
    return <LoadingScreen />;
  }

  if (error && posts.length === 0) {
    return (
      <View style={styles.errorContainer}>
        <MaterialCommunityIcons name="wifi-off" size={48} color={Colors.textDisabled} />
        <Text style={styles.errorText}>{error}</Text>
        <Button mode="contained" onPress={refresh} buttonColor={Colors.primary} style={styles.retryButton}>
          再試行
        </Button>
      </View>
    );
  }

  const formatTimeAgo = (date: any) => {
    const now = Date.now();
    const ts = date?.toMillis?.() ?? Date.now();
    const diffMin = Math.floor((now - ts) / 60000);
    if (diffMin < 1) return 'たった今';
    if (diffMin < 60) return `${diffMin}分前`;
    const diffHr = Math.floor(diffMin / 60);
    if (diffHr < 24) return `${diffHr}時間前`;
    return `${Math.floor(diffHr / 24)}日前`;
  };

  return (
    <View style={styles.container}>
      <FlatList
        data={filteredPosts}
        keyExtractor={(item) => item.id}
        ListHeaderComponent={
          <>
            <FeaturedPlayers
              onPlayerPress={(_player: FeaturedPlayer) => {
                // 将来: router.push(`/player/${_player.id}`)
              }}
              onViewMore={() => router.push('/ranking/details' as any)}
            />

            {/* フィード切り替えタブ — 透明背景・テキストのみ */}
            <View style={styles.feedTabRow}>
              {(['recommend', 'following'] as const).map((tab) => {
                const active = feedTab === tab;
                return (
                  <TouchableOpacity
                    key={tab}
                    style={styles.feedTab}
                    onPress={() => setFeedTab(tab)}
                    activeOpacity={0.6}
                  >
                    <Text style={[styles.feedTabText, active && styles.feedTabTextActive]}>
                      {tab === 'recommend' ? 'おすすめ' : 'フォロー中'}
                    </Text>
                    {active && <View style={styles.feedTabUnderline} />}
                  </TouchableOpacity>
                );
              })}
            </View>

          </>
        }
        ItemSeparatorComponent={({ leadingItem }) => {
          const idx = filteredPosts.indexOf(leadingItem);
          if ((idx + 1) % 3 === 0) return <AdBanner plan={userPlan} />;
          return null;
        }}
        renderItem={({ item }) => (
          <PostCard
            authorName={item.authorName}
            authorPhotoURL={item.authorPhotoURL}
            authorPlan={item.authorPlan}
            content={item.content}
            type={item.type}
            mediaURLs={item.mediaURLs}
            externalVideoUrl={item.externalVideoUrl}
            likesCount={item.likesCount}
            initialLiked={item.isLiked}
            commentsCount={item.commentsCount}
            timeAgo={formatTimeAgo(item.createdAt)}
            onPress={() => router.push(`/(tabs)/feed/${item.id}`)}
            onAuthorPress={() => router.push(`/user/${item.authorId}` as any)}
            requiresAuth={!currentUser}
            onLike={(isNowLiked) =>
              requireAuth(() => {
                if (isNowLiked) likePost(item.id);
                else unlikePost(item.id);
              })
            }
            onComment={() => requireAuth(() => router.push(`/(tabs)/feed/${item.id}`))}
            postId={item.id}
            authorId={item.authorId}
            currentUserId={currentUser?.uid}
            onBlock={() => setBlockedUserIds((prev) => new Set([...prev, item.authorId]))}
          />
        )}
        contentContainerStyle={filteredPosts.length === 0 ? styles.emptyContainer : styles.listContent}
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
  container:      { flex: 1, backgroundColor: Colors.background },
  errorContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing.md, paddingHorizontal: Spacing.xl },
  errorText:      { fontSize: Typography.body, color: Colors.textSecondary, textAlign: 'center' },
  retryButton:    { marginTop: Spacing.sm },
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

  // フィード切り替えタブ
  feedTabRow: {
    flexDirection: 'row',
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.sm,
    paddingBottom: 2,
    gap: Spacing.lg,
  },
  feedTab: {
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    alignItems: 'center',
  },
  feedTabText: {
    fontSize: Typography.body,
    fontWeight: '500',
    color: Colors.textSecondary,
  },
  feedTabTextActive: {
    fontWeight: '800',
    color: Colors.text,
  },
  feedTabUnderline: {
    position: 'absolute',
    bottom: 0,
    left: Spacing.md,
    right: Spacing.md,
    height: 2.5,
    borderRadius: 2,
    backgroundColor: Colors.primary,
  },
});
