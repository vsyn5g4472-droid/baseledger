import React, { useState } from 'react';
import { View, StyleSheet, TouchableOpacity, Image, Linking } from 'react-native';
import { Text, Avatar } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Colors, Spacing, BorderRadius, Typography, CardShadow } from '../constants/theme';
import PlanBadge from './PlanBadge';

interface PostCardProps {
  authorName: string;
  authorPhotoURL: string | null;
  authorPlan?: string;
  content: string;
  type: 'highlight' | 'stats' | 'text' | 'video' | 'analysis';
  mediaURLs?: string[];
  externalVideoUrl?: string | null;
  likesCount: number;
  initialLiked?: boolean;
  commentsCount: number;
  timeAgo: string;
  onPress?: () => void;
  onAuthorPress?: () => void;
  onLike?: (isNowLiked: boolean) => void;
  onComment?: () => void;
  requiresAuth?: boolean;
}

// 投稿タイプ → カード左端のアクセントカラー
// 同じ色を複数タイプで使わない。視覚的なラベルではなくアクセントとして使用
const typeAccentColor: Record<string, string> = {
  highlight: Colors.caution,    // ゴールド: 注目・ハイライト
  stats:     Colors.action,     // アクションブルー: データ・数字
  video:     Colors.statusLive, // 赤: 動画（注意を引く）
  text:      Colors.border,     // グレー: 通常テキスト（装飾なし）
  analysis:  '#7C3AED',         // パープル: AI分析
};

export default function PostCard({
  authorName,
  authorPhotoURL,
  authorPlan,
  content,
  type,
  mediaURLs = [],
  externalVideoUrl,
  likesCount,
  initialLiked,
  commentsCount,
  timeAgo,
  onPress,
  onAuthorPress,
  onLike,
  onComment,
  requiresAuth = false,
}: PostCardProps) {
  const [liked, setLiked] = useState(initialLiked ?? false);
  const [likes, setLikes] = useState(likesCount);

  const handleLike = () => {
    if (requiresAuth) { onLike?.(liked); return; }
    const newLiked = !liked;
    setLiked(newLiked);
    setLikes(newLiked ? likes + 1 : likes - 1);
    onLike?.(newLiked);
  };

  const accentColor = typeAccentColor[type] ?? Colors.border;

  return (
    <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.97}>
      {/* 投稿タイプを左端ボーダーで示す — バッジより省スペースかつ邪魔にならない */}
      <View style={[styles.typeAccent, { backgroundColor: accentColor }]} />

      <View style={styles.inner}>
        {/* AI分析バッジ */}
        {type === 'analysis' && (
          <View style={styles.analysisBadge}>
            <Text style={styles.analysisBadgeText}>🤖 AI 試合分析</Text>
          </View>
        )}

        {/* 1. コンテンツ — 最初に目が行く主役 */}
        <Text style={styles.content} numberOfLines={5}>
          {content || '(本文なし)'}
        </Text>

        {/* メディア */}
        {mediaURLs.length > 0 && (
          <Image
            source={{ uri: mediaURLs[0] }}
            style={styles.mediaImage}
            resizeMode="cover"
          />
        )}

        {/* 外部動画リンク */}
        {externalVideoUrl ? (
          <TouchableOpacity
            style={styles.videoLinkBtn}
            onPress={() => Linking.openURL(externalVideoUrl)}
          >
            <MaterialCommunityIcons name="play-circle-outline" size={16} color={Colors.action} />
            <Text style={styles.videoLinkText}>動画を見る</Text>
          </TouchableOpacity>
        ) : null}

        {/* 区切り */}
        <View style={styles.divider} />

        {/* 2. 著者行 — コンテンツを読んだ後に「誰が書いたか」を確認する */}
        <View style={styles.footer}>
          <TouchableOpacity
            style={styles.authorRow}
            onPress={onAuthorPress}
            disabled={!onAuthorPress}
            activeOpacity={0.7}
          >
            {authorPhotoURL ? (
              <Avatar.Image size={28} source={{ uri: authorPhotoURL }} />
            ) : (
              <Avatar.Text
                size={28}
                label={authorName ? authorName.charAt(0).toUpperCase() : '?'}
                style={styles.avatar}
                labelStyle={styles.avatarLabel}
              />
            )}
            <Text style={styles.authorName} numberOfLines={1}>{authorName || '不明なユーザー'}</Text>
            <PlanBadge plan={authorPlan} variant="badge" size="sm" />
            <Text style={styles.timeAgo}>{timeAgo}</Text>
          </TouchableOpacity>

          {/* 3. アクション — 最後に「どう反応するか」 */}
          <View style={styles.actions}>
            <TouchableOpacity style={styles.actionBtn} onPress={handleLike} activeOpacity={0.6}>
              <MaterialCommunityIcons
                name={liked ? 'heart' : 'heart-outline'}
                size={18}
                color={liked ? Colors.secondary : Colors.textSecondary}
              />
              {likes > 0 ? (
                <Text style={[styles.actionCount, liked && { color: Colors.secondary }]}>
                  {likes}
                </Text>
              ) : null}
            </TouchableOpacity>

            <TouchableOpacity style={styles.actionBtn} onPress={onComment} activeOpacity={0.6}>
              <MaterialCommunityIcons name="comment-outline" size={18} color={Colors.textSecondary} />
              {commentsCount > 0 ? (
                <Text style={styles.actionCount}>{commentsCount}</Text>
              ) : null}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.card,
    marginHorizontal: Spacing.md,
    marginBottom: Spacing.sm,
    borderRadius: BorderRadius.lg,
    flexDirection: 'row',
    overflow: 'hidden',
    ...CardShadow,
  },
  // 左端アクセントボーダー: 投稿タイプをバッジなしで示す
  typeAccent: {
    width: 3,
    borderRadius: 0,
    flexShrink: 0,
  },
  inner: {
    flex: 1,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.sm,
    paddingHorizontal: Spacing.md,
  },
  // AI分析バッジ
  analysisBadge: {
    alignSelf: 'flex-start',
    backgroundColor: '#EDE9FE',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    marginBottom: Spacing.xs,
  },
  analysisBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#7C3AED',
  },
  // 1. コンテンツ — 最大フォントで最初に視認
  content: {
    fontSize: Typography.body,
    color: Colors.text,
    lineHeight: 24,
    marginBottom: Spacing.sm,
  },
  mediaImage: {
    width: '100%',
    height: 200,
    borderRadius: BorderRadius.md,
    marginBottom: Spacing.sm,
  },
  videoLinkBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    marginBottom: Spacing.sm,
    alignSelf: 'flex-start',
  },
  videoLinkText: {
    color: Colors.action,
    fontSize: Typography.caption,
    fontWeight: '600',
  },
  divider: {
    height: 0.5,
    backgroundColor: Colors.border,
    marginBottom: Spacing.sm,
  },
  // 2. フッター: 著者 + アクション
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  authorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    flex: 1,
    minWidth: 0,
  },
  avatar: {
    backgroundColor: Colors.primary,
    flexShrink: 0,
  },
  avatarLabel: {
    color: Colors.white,
    fontWeight: '700',
    fontSize: 11,
  },
  authorName: {
    fontSize: Typography.caption,
    fontWeight: '600',
    color: Colors.textSecondary,
    flexShrink: 1,
  },
  timeAgo: {
    fontSize: Typography.caption,
    color: Colors.textDisabled,
    flexShrink: 0,
  },
  // 3. アクション
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    flexShrink: 0,
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  actionCount: {
    fontSize: Typography.caption,
    color: Colors.textSecondary,
    fontWeight: '500',
  },
});
