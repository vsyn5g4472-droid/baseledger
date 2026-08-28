import React, { useCallback, useState, useEffect } from 'react';
import { View, StyleSheet, FlatList, ActivityIndicator, TouchableOpacity, Alert } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text, Avatar, Button, Card, Chip, Divider } from 'react-native-paper';
import { useLocalSearchParams, router, Stack } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useFollow } from '../../../src/hooks/useFollow';
import { useUser } from '../../../src/hooks/useUser';
import { useUserPosts } from '../../../src/hooks/usePosts';
import { useI18n } from '../../../src/i18n';
import { useAuth } from '../../../src/contexts/AuthContext';
import PostCard from '../../../src/components/PostCard';
import PlanBadge from '../../../src/components/PlanBadge';
import { Colors, Spacing, Typography, BorderRadius } from '../../../src/constants/theme';
import { getAvatarColorHex } from '../../../src/constants/avatarColors';
import { getOrCreateConversation } from '../../../src/services/messageService';
import { isLiked, likePost, unlikePost } from '../../../src/services/postService';
import type { Post } from '../../../src/models/types';

const ROLE_COLORS: Record<string, string> = {
  player: Colors.primary,
  scout: Colors.secondary,
  coach: Colors.accent,
};

export default function UserProfileScreen() {
  const insets = useSafeAreaInsets();
  const { userId } = useLocalSearchParams<{ userId: string }>();
  const { t } = useI18n();
  const { currentUser } = useAuth();
  const { user, loading: userLoading } = useUser(userId ?? '');
  const { posts, loading: postsLoading } = useUserPosts(userId ?? '');
  const { isFollowing, isMutual, toggleFollow, loading: followLoading } = useFollow(userId ?? '');
  const [messagingLoading, setMessagingLoading] = useState(false);
  const [likedPostIds, setLikedPostIds] = useState<Set<string>>(new Set());
  const isOwnProfile = currentUser?.uid === userId;

  useEffect(() => {
    if (!currentUser || posts.length === 0) return;
    Promise.all(
      posts.map(p => isLiked(p.id, currentUser.uid).then(liked => ({ id: p.id, liked })))
    ).then(results => {
      const ids = new Set(results.filter(r => r.liked).map(r => r.id));
      setLikedPostIds(ids);
    }).catch(() => {});
  }, [posts, currentUser]);

  const handleMessage = useCallback(async () => {
    if (!currentUser || !userId) return;
    setMessagingLoading(true);
    try {
      const convo = await getOrCreateConversation(currentUser.uid, userId);
      router.push(`/messages/${convo.id}` as any);
    } catch (e: any) {
      console.error('handleMessage error:', e);
      Alert.alert('エラー', 'メッセージの開始に失敗しました。時間をおいて再度お試しください。');
    } finally {
      setMessagingLoading(false);
    }
  }, [currentUser, userId]);

  const formatTimeAgo = useCallback((date: any) => {
    const now = Date.now();
    const ts = date?.toMillis?.() ?? Date.now();
    const diffMin = Math.floor((now - ts) / 60000);
    if (diffMin < 1) return 'now';
    if (diffMin < 60) return `${diffMin}m`;
    const diffHr = Math.floor(diffMin / 60);
    if (diffHr < 24) return `${diffHr}h`;
    return `${Math.floor(diffHr / 24)}d`;
  }, []);

  const ProfileHeader = useCallback(() => {
    if (userLoading || !user) {
      return (
        <View style={styles.loadingBox}>
          <ActivityIndicator color={Colors.primary} />
        </View>
      );
    }

    return (
      <>
        {/* Hero section */}
        <View style={[styles.heroSection, { paddingTop: Spacing.xl + insets.top }]}>
          {user.photoURL ? (
            <Avatar.Image size={88} source={{ uri: user.photoURL }} style={styles.avatar} />
          ) : (
            <Avatar.Text
              size={88}
              label={user.displayName.charAt(0)}
              style={[styles.avatar, { backgroundColor: getAvatarColorHex(user.avatarColor) }]}
              labelStyle={styles.avatarLabel}
            />
          )}

          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 40 }}>
            <Text
              style={[styles.displayName, { includeFontPadding: false, textAlign: 'center', flex: 1 }]}
              numberOfLines={1}
            >
              {user.displayName}
            </Text>
            <PlanBadge plan={user.plan ?? 'free'} size="md" variant="text" />
          </View>

          <View style={styles.badgeRow}>
            <Chip
              compact
              style={[styles.roleBadge, { backgroundColor: ROLE_COLORS[user.role] ?? Colors.primary }]}
              textStyle={styles.roleBadgeText}
            >
              {user.role.charAt(0).toUpperCase() + user.role.slice(1)}
            </Chip>
            {user.position && (
              <Chip
                compact
                style={styles.positionBadge}
                textStyle={styles.positionBadgeText}
              >
                {user.position}
              </Chip>
            )}
          </View>

          {user.team && (
            <View style={styles.teamRow}>
              <MaterialCommunityIcons name="baseball" size={14} color={Colors.textSecondary} />
              <Text style={styles.teamText}>{user.team}</Text>
            </View>
          )}

          {!!user.bio && <Text style={styles.bio}>{user.bio}</Text>}

          {/* Stats counts */}
          <View style={styles.countsRow}>
            <View style={styles.countItem}>
              <Text style={styles.countNumber}>{user.postsCount}</Text>
              <Text style={styles.countLabel}>{t.profile.posts}</Text>
            </View>
            <View style={styles.countDivider} />
            <TouchableOpacity
              style={styles.countItem}
              onPress={() => router.push(`/user/${userId}/followers` as any)}
            >
              <Text style={styles.countNumber}>{user.followersCount}</Text>
              <Text style={styles.countLabel}>{t.profile.followers}</Text>
            </TouchableOpacity>
            <View style={styles.countDivider} />
            <TouchableOpacity
              style={styles.countItem}
              onPress={() => router.push(`/user/${userId}/following` as any)}
            >
              <Text style={styles.countNumber}>{user.followingCount}</Text>
              <Text style={styles.countLabel}>{t.profile.following}</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Action buttons */}
        {!isOwnProfile && (
          <View style={styles.actionRow}>
            <Button
              mode={isFollowing ? 'outlined' : 'contained'}
              onPress={toggleFollow}
              loading={followLoading}
              icon={isFollowing ? 'account-check' : 'account-plus'}
              style={styles.followButton}
              buttonColor={isFollowing ? undefined : Colors.primary}
              textColor={isFollowing ? Colors.primary : Colors.white}
            >
              {isFollowing ? t.profile.followingBtn : t.profile.follow}
            </Button>
            <Button
              mode="outlined"
              onPress={handleMessage}
              loading={messagingLoading}
              disabled={messagingLoading}
              icon="message-outline"
              style={styles.messageButton}
              textColor={Colors.primary}
            >
              {t.profile.message}
            </Button>
          </View>
        )}

        {/* Performance stats card */}
        <Card style={styles.statsCard}>
          <View style={styles.statsCardHeader}>
            <MaterialCommunityIcons name="chart-bar" size={16} color={Colors.primary} />
            <Text style={styles.statsCardTitle}>Stats</Text>
          </View>
          <View style={styles.statsGrid}>
            <StatBox value={user.stats.batting.avg.toFixed(3)} label="AVG" />
            <StatBox value={user.stats.pitching.era.toFixed(2)} label="ERA" />
            <StatBox value={`${(user.stats.fielding.fieldingPct * 100).toFixed(1)}%`} label="FLD%" />
            <StatBox value={String(user.stats.pitching.totalStrikeouts)} label="K" />
            <StatBox value={String(user.stats.batting.totalHomeRuns)} label="HR" />
            <StatBox value={String(user.stats.batting.gamesPlayed)} label="G" />
          </View>
        </Card>

        {/* Posts section header */}
        <View style={styles.postsSectionHeader}>
          <MaterialCommunityIcons name="timeline-text" size={16} color={Colors.primary} />
          <Text style={styles.postsSectionTitle}>{t.profile.recentPosts}</Text>
        </View>
        <Divider style={styles.sectionDivider} />
      </>
    );
  }, [user, userLoading, isFollowing, isMutual, toggleFollow, followLoading, t, isOwnProfile, handleMessage, messagingLoading, userId]);

  const renderPost = useCallback(({ item }: { item: Post }) => (
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
      initialLiked={likedPostIds.has(item.id)}
      onLike={(newLiked) => {
        if (!currentUser) return;
        if (newLiked) {
          likePost(item.id, currentUser.uid);
          setLikedPostIds(prev => new Set(prev).add(item.id));
        } else {
          unlikePost(item.id, currentUser.uid);
          setLikedPostIds(prev => { const s = new Set(prev); s.delete(item.id); return s; });
        }
      }}
      onPress={() => router.push(`/(tabs)/feed/${item.id}` as any)}
    />
  ), [formatTimeAgo, likedPostIds, currentUser]);

  const ListEmpty = useCallback(() => {
    if (postsLoading) {
      return (
        <View style={styles.postsLoading}>
          <ActivityIndicator color={Colors.primary} />
        </View>
      );
    }
    return (
      <View style={styles.emptyPosts}>
        <MaterialCommunityIcons name="baseball" size={40} color={Colors.border} />
        <Text style={styles.emptyPostsText}>{t.profile.noPosts}</Text>
      </View>
    );
  }, [postsLoading, t]);

  return (
    <>
      {/* Dynamic title = user's display name */}
      <Stack.Screen options={{ title: user?.displayName ?? '' }} />
      <FlatList
        style={styles.container}
        data={posts}
        keyExtractor={(item) => item.id}
        ListHeaderComponent={<ProfileHeader />}
        renderItem={renderPost}
        ListEmptyComponent={<ListEmpty />}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
      />
    </>
  );
}

function StatBox({ value, label }: { value: string; label: string }) {
  return (
    <View style={styles.statBox}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  listContent: {
    paddingBottom: Spacing.xxl,
  },
  loadingBox: {
    paddingVertical: Spacing.xxl,
    alignItems: 'center',
  },

  // Hero
  heroSection: {
    backgroundColor: Colors.card,
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.xl,
    paddingBottom: Spacing.lg,
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  avatar: {
    backgroundColor: Colors.primary,
    marginBottom: Spacing.sm,
  },
  avatarLabel: {
    color: Colors.white,
    fontSize: Typography.h2,
    fontWeight: '700',
  },
  displayName: {
    fontSize: Typography.h2,
    fontWeight: '700',
    color: Colors.text,
    marginBottom: Spacing.sm,
  },
  badgeRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  roleBadge: {},
  roleBadgeText: {
    color: Colors.white,
    fontSize: Typography.caption,
    fontWeight: '700',
  },
  positionBadge: {
    backgroundColor: Colors.primaryLight,
  },
  positionBadgeText: {
    color: Colors.primary,
    fontSize: Typography.caption,
    fontWeight: '700',
  },
  teamRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 4,
  },
  teamText: {
    fontSize: Typography.bodySmall,
    color: Colors.textSecondary,
  },
  bio: {
    fontSize: Typography.bodySmall,
    color: Colors.text,
    textAlign: 'center',
    lineHeight: 20,
    marginTop: Spacing.sm,
    paddingHorizontal: Spacing.lg,
    marginBottom: Spacing.sm,
  },

  // Counts
  countsRow: {
    flexDirection: 'row',
    marginTop: Spacing.md,
    alignItems: 'center',
  },
  countItem: {
    alignItems: 'center',
    paddingHorizontal: Spacing.xl,
  },
  countNumber: {
    fontSize: Typography.h3,
    fontWeight: '700',
    color: Colors.primary,
  },
  countLabel: {
    fontSize: Typography.caption,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  countDivider: {
    width: 1,
    height: 28,
    backgroundColor: Colors.border,
  },

  // Action buttons
  actionRow: {
    flexDirection: 'row',
    padding: Spacing.md,
    gap: Spacing.sm,
    backgroundColor: Colors.card,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  followButton: {
    flex: 1,
  },
  messageButton: {
    flex: 1,
  },

  // Stats card
  statsCard: {
    marginHorizontal: Spacing.md,
    marginTop: Spacing.md,
    borderRadius: BorderRadius.lg,
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: Colors.border,
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
    overflow: 'hidden',
  },
  statsCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  statsCardTitle: {
    fontSize: Typography.bodySmall,
    fontWeight: '700',
    color: Colors.primary,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingVertical: Spacing.sm,
  },
  statBox: {
    width: '33%',
    alignItems: 'center',
    paddingVertical: Spacing.sm,
  },
  statValue: {
    fontSize: Typography.h4,
    fontWeight: '700',
    color: Colors.primary,
  },
  statLabel: {
    fontSize: Typography.tiny,
    color: Colors.textSecondary,
    marginTop: 2,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },

  // Posts section
  postsSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    marginTop: Spacing.lg,
    marginHorizontal: Spacing.md,
    marginBottom: Spacing.sm,
  },
  postsSectionTitle: {
    fontSize: Typography.bodySmall,
    fontWeight: '700',
    color: Colors.primary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  sectionDivider: {
    marginHorizontal: Spacing.md,
    marginBottom: Spacing.sm,
  },

  // Empty / loading states
  postsLoading: {
    paddingVertical: Spacing.xl,
    alignItems: 'center',
  },
  emptyPosts: {
    alignItems: 'center',
    paddingVertical: Spacing.xxl,
    gap: Spacing.sm,
  },
  emptyPostsText: {
    fontSize: Typography.body,
    color: Colors.textSecondary,
  },
});
