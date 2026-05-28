import React, { useState, useEffect, useCallback } from 'react';
import { View, StyleSheet, FlatList, KeyboardAvoidingView, Platform } from 'react-native';
import { Text, TextInput, Avatar, IconButton, Divider, ActivityIndicator } from 'react-native-paper';
import { useLocalSearchParams } from 'expo-router';
import { Colors, Spacing, Typography } from '../../../src/constants/theme';
import { useAuth } from '../../../src/contexts/AuthContext';
import { getPost, getComments, addComment } from '../../../src/services/postService';
import type { Post, Comment } from '../../../src/models/types';

function formatTimeAgo(date: any): string {
  const now = Date.now();
  const ts = date?.toMillis?.() ?? Date.now();
  const diffMin = Math.floor((now - ts) / 60000);
  if (diffMin < 1) return 'たった今';
  if (diffMin < 60) return `${diffMin}分前`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}時間前`;
  return `${Math.floor(diffHr / 24)}日前`;
}

export default function PostDetailScreen() {
  const { postId } = useLocalSearchParams<{ postId: string }>();
  const { currentUser } = useAuth();
  const [post, setPost] = useState<Post | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [comment, setComment] = useState('');
  const [loadingPost, setLoadingPost] = useState(true);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (!postId) return;
    setLoadingPost(true);
    Promise.all([getPost(postId), getComments(postId)])
      .then(([p, result]) => {
        setPost(p);
        setComments(result.items);
      })
      .catch(() => {})
      .finally(() => setLoadingPost(false));
  }, [postId]);

  const handleSend = useCallback(async () => {
    if (!currentUser || !postId || !comment.trim()) return;
    setSending(true);
    try {
      const newComment = await addComment(postId, {
        authorId: currentUser.uid,
        authorName: currentUser.displayName,
        authorPhotoURL: currentUser.photoURL,
        content: comment.trim(),
      });
      setComments((prev) => [newComment, ...prev]);
      setComment('');
    } catch {
      // 送信失敗は無視
    } finally {
      setSending(false);
    }
  }, [currentUser, postId, comment]);

  if (loadingPost) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={Colors.primary} />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={90}
    >
      <FlatList
        data={comments}
        keyExtractor={(item) => item.id}
        ListHeaderComponent={
          post ? (
            <View style={styles.postSection}>
              <View style={styles.authorRow}>
                {post.authorPhotoURL ? (
                  <Avatar.Image size={44} source={{ uri: post.authorPhotoURL }} />
                ) : (
                  <Avatar.Text size={44} label={post.authorName.charAt(0).toUpperCase()} style={styles.avatar} />
                )}
                <View style={styles.authorInfo}>
                  <Text style={styles.authorName}>{post.authorName}</Text>
                  <Text style={styles.timeAgo}>{formatTimeAgo(post.createdAt)}</Text>
                </View>
              </View>
              <Text style={styles.postContent}>{post.content}</Text>
              <View style={styles.statsRow}>
                <Text style={styles.stat}>{post.likesCount}件のいいね</Text>
                <Text style={styles.stat}>{post.commentsCount}件のコメント</Text>
              </View>
              <Divider style={styles.divider} />
              <Text style={styles.sectionTitle}>コメント</Text>
            </View>
          ) : null
        }
        renderItem={({ item }) => (
          <View style={styles.commentItem}>
            {item.authorPhotoURL ? (
              <Avatar.Image size={32} source={{ uri: item.authorPhotoURL }} />
            ) : (
              <Avatar.Text size={32} label={item.authorName.charAt(0).toUpperCase()} style={styles.commentAvatar} />
            )}
            <View style={styles.commentContent}>
              <Text style={styles.commentAuthor}>{item.authorName}</Text>
              <Text style={styles.commentText}>{item.content}</Text>
              <Text style={styles.commentTime}>{formatTimeAgo(item.createdAt)}</Text>
            </View>
          </View>
        )}
        contentContainerStyle={styles.listContent}
      />
      <View style={styles.inputRow}>
        <TextInput
          placeholder="コメントを追加..."
          value={comment}
          onChangeText={setComment}
          mode="outlined"
          style={styles.commentInput}
          dense
        />
        <IconButton
          icon="send"
          iconColor={Colors.primary}
          onPress={handleSend}
          disabled={!comment.trim() || sending}
        />
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  listContent: { paddingBottom: Spacing.md },
  postSection: { padding: Spacing.md, backgroundColor: Colors.card },
  authorRow: { flexDirection: 'row', alignItems: 'center', marginBottom: Spacing.md },
  avatar: { backgroundColor: Colors.primary, marginRight: Spacing.sm },
  authorInfo: { marginLeft: Spacing.sm },
  authorName: { fontSize: Typography.body, fontWeight: '600', color: Colors.text },
  timeAgo: { fontSize: Typography.caption, color: Colors.textSecondary },
  postContent: { fontSize: Typography.body, color: Colors.text, lineHeight: 24, marginBottom: Spacing.md },
  statsRow: { flexDirection: 'row', gap: Spacing.md, marginBottom: Spacing.sm },
  stat: { fontSize: Typography.caption, color: Colors.textSecondary },
  divider: { marginVertical: Spacing.md },
  sectionTitle: { fontSize: Typography.h4, fontWeight: '600', color: Colors.text, marginBottom: Spacing.sm },
  commentItem: { flexDirection: 'row', padding: Spacing.md, paddingVertical: Spacing.sm },
  commentAvatar: { backgroundColor: Colors.primary, marginRight: Spacing.sm },
  commentContent: { flex: 1 },
  commentAuthor: { fontSize: Typography.bodySmall, fontWeight: '600', color: Colors.text },
  commentText: { fontSize: Typography.bodySmall, color: Colors.text, marginTop: 2 },
  commentTime: { fontSize: Typography.tiny, color: Colors.textSecondary, marginTop: 4 },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.sm,
    backgroundColor: Colors.card,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  commentInput: { flex: 1, backgroundColor: Colors.card },
});
