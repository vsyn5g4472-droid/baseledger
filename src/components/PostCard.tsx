import React, { useState } from 'react';
import { View, StyleSheet, TouchableOpacity, Image, Linking } from 'react-native';
import { Text, Avatar } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Colors, Spacing, BorderRadius, Typography, CardShadow } from '../constants/theme';

interface PostCardProps {
  authorName: string;
  authorPhotoURL: string | null;
  content: string;
  type: 'highlight' | 'stats' | 'text' | 'video';
  mediaURLs?: string[];
  externalVideoUrl?: string | null;
  likesCount: number;
  commentsCount: number;
  timeAgo: string;
  onPress?: () => void;
  onAuthorPress?: () => void;
  onLike?: () => void;
  onComment?: () => void;
  /** When true, like tap calls onLike() without toggling local state (for guests) */
  requiresAuth?: boolean;
}

const typeConfig: Record<string, { icon: string; color: string; label: string }> = {
  highlight: { icon: 'star',        color: Colors.accent,   label: '注目' },
  stats:     { icon: 'chart-bar',   color: Colors.primary,  label: 'Stats' },
  text:      { icon: 'text',        color: Colors.textSecondary, label: 'テキスト' },
  video:     { icon: 'video',       color: Colors.secondary, label: '動画' },
};

export default function PostCard({
  authorName,
  authorPhotoURL,
  content,
  type,
  mediaURLs = [],
  externalVideoUrl,
  likesCount,
  commentsCount,
  timeAgo,
  onPress,
  onAuthorPress,
  onLike,
  onComment,
  requiresAuth = false,
}: PostCardProps) {
  const [liked, setLiked] = useState(false);
  const [likes, setLikes] = useState(likesCount);

  const handleLike = () => {
    if (requiresAuth) {
      onLike?.();
      return;
    }
    setLiked(!liked);
    setLikes(liked ? likes - 1 : likes + 1);
    onLike?.();
  };

  const cfg = typeConfig[type] ?? typeConfig.text;

  return (
    <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.97}>
      {/* Header ─ author row */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.authorRow}
          onPress={onAuthorPress}
          disabled={!onAuthorPress}
          activeOpacity={0.7}
        >
          {authorPhotoURL ? (
            <Avatar.Image size={40} source={{ uri: authorPhotoURL }} />
          ) : (
            <Avatar.Text
              size={40}
              label={authorName.charAt(0).toUpperCase()}
              style={styles.avatar}
              labelStyle={styles.avatarLabel}
            />
          )}
          <View style={styles.authorInfo}>
            <Text style={styles.authorName}>{authorName}</Text>
            <Text style={styles.timeAgo}>{timeAgo}</Text>
          </View>
        </TouchableOpacity>

        {/* Type badge */}
        <View style={[styles.typeBadge, { backgroundColor: cfg.color + '18' }]}>
          <MaterialCommunityIcons name={cfg.icon as any} size={13} color={cfg.color} />
          <Text style={[styles.typeBadgeText, { color: cfg.color }]}>{cfg.label}</Text>
        </View>
      </View>

      {/* Content */}
      <Text style={styles.content}>{content}</Text>

      {/* Media */}
      {mediaURLs.length > 0 && (
        <Image source={{ uri: mediaURLs[0] }} style={styles.mediaImage} resizeMode="cover" />
      )}

      {/* External video link */}
      {externalVideoUrl && (
        <TouchableOpacity
          style={styles.videoLinkBtn}
          onPress={() => Linking.openURL(externalVideoUrl)}
        >
          <MaterialCommunityIcons name="play-circle" size={18} color={Colors.primary} />
          <Text style={styles.videoLinkText}>動画を見る</Text>
        </TouchableOpacity>
      )}

      {/* Divider */}
      <View style={styles.divider} />

      {/* Actions */}
      <View style={styles.actions}>
        <TouchableOpacity style={styles.actionBtn} onPress={handleLike} activeOpacity={0.6}>
          <MaterialCommunityIcons
            name={liked ? 'heart' : 'heart-outline'}
            size={22}
            color={liked ? Colors.secondary : Colors.textSecondary}
          />
          {likes > 0 && (
            <Text style={[styles.actionCount, liked && { color: Colors.secondary }]}>
              {likes}
            </Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity style={styles.actionBtn} onPress={onComment} activeOpacity={0.6}>
          <MaterialCommunityIcons name="comment-outline" size={22} color={Colors.textSecondary} />
          {commentsCount > 0 && (
            <Text style={styles.actionCount}>{commentsCount}</Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity style={styles.actionBtn} activeOpacity={0.6}>
          <MaterialCommunityIcons name="share-outline" size={22} color={Colors.textSecondary} />
        </TouchableOpacity>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.card,
    marginHorizontal: Spacing.md,
    marginBottom: Spacing.md,
    borderRadius: BorderRadius.xl,
    // Instagram-style soft shadow (no border)
    ...CardShadow,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: Spacing.md,
    paddingBottom: Spacing.sm,
  },
  authorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  avatar: {
    backgroundColor: Colors.primary,
  },
  avatarLabel: {
    color: Colors.white,
    fontWeight: '700',
  },
  authorInfo: {
    marginLeft: Spacing.sm,
    flex: 1,
  },
  authorName: {
    fontSize: Typography.body,
    fontWeight: '700',
    color: Colors.text,
  },
  timeAgo: {
    fontSize: Typography.caption,
    color: Colors.textSecondary,
    marginTop: 1,
  },
  typeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: BorderRadius.full,
  },
  typeBadgeText: {
    fontSize: Typography.tiny,
    fontWeight: '700',
    textTransform: 'capitalize',
  },
  content: {
    fontSize: Typography.body,
    color: Colors.text,
    lineHeight: 23,
    paddingHorizontal: Spacing.md,
    paddingBottom: Spacing.sm,
  },
  mediaImage: {
    width: '100%',
    height: 220,
    marginBottom: Spacing.sm,
  },
  videoLinkBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    marginHorizontal: Spacing.md,
    marginBottom: Spacing.sm,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    backgroundColor: Colors.primaryLight,
    borderRadius: BorderRadius.full,
    alignSelf: 'flex-start',
  },
  videoLinkText: {
    color: Colors.primary,
    fontSize: Typography.bodySmall,
    fontWeight: '600',
  },
  divider: {
    height: 0.5,
    backgroundColor: Colors.border,
    marginHorizontal: Spacing.md,
  },
  actions: {
    flexDirection: 'row',
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    gap: Spacing.lg,
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  actionCount: {
    fontSize: Typography.bodySmall,
    color: Colors.textSecondary,
    fontWeight: '500',
  },
});
