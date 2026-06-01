import React, { useState, useEffect, useCallback } from 'react';
import { View, StyleSheet, FlatList, KeyboardAvoidingView, Platform, TouchableOpacity, Alert } from 'react-native';
import { Text, TextInput, Avatar, IconButton, Divider, ActivityIndicator, Modal, Portal } from 'react-native-paper';
import { useLocalSearchParams, router, Stack } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Colors, Spacing, Typography, BorderRadius } from '../../../src/constants/theme';
import { useAuth } from '../../../src/contexts/AuthContext';
import { getPost, getComments, addComment, getLikes, deletePost, deleteComment } from '../../../src/services/postService';
import type { Post, Comment, User } from '../../../src/models/types';

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
  const [likesModalVisible, setLikesModalVisible] = useState(false);
  const [likedUsers, setLikedUsers] = useState<User[]>([]);
  const [likesLoading, setLikesLoading] = useState(false);

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

  const isOwnPost = post !== null && post.authorId === currentUser?.uid;

  const handleDelete = useCallback(() => {
    if (!post || !currentUser) return;
    Alert.alert(
      '投稿を削除',
      'この投稿を削除しますか？この操作は取り消せません。',
      [
        { text: 'キャンセル', style: 'cancel' },
        {
          text: '削除',
          style: 'destructive',
          onPress: async () => {
            try {
              await deletePost(post.id, currentUser.uid);
              router.back();
            } catch (e: any) {
              Alert.alert('エラー', e?.message ?? '削除に失敗しました');
            }
          },
        },
      ],
    );
  }, [post, currentUser]);

  const handleDeleteComment = useCallback((commentId: string) => {
    if (!postId || !currentUser) return;
    Alert.alert(
      'コメントを削除',
      'このコメントを削除しますか？',
      [
        { text: 'キャンセル', style: 'cancel' },
        {
          text: '削除',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteComment(postId as string, commentId, currentUser.uid);
              setComments((prev) => prev.filter((c) => c.id !== commentId));
              setPost((prev) => prev ? { ...prev, commentsCount: Math.max(0, prev.commentsCount - 1) } : prev);
            } catch (e: any) {
              Alert.alert('エラー', e?.message ?? '削除に失敗しました');
            }
          },
        },
      ],
    );
  }, [postId, currentUser]);

  const handleLikesPress = useCallback(async () => {
    if (!postId || !post?.likesCount) return;
    setLikesModalVisible(true);
    setLikesLoading(true);
    try {
      const users = await getLikes(postId);
      setLikedUsers(users);
    } catch {
      setLikedUsers([]);
    } finally {
      setLikesLoading(false);
    }
  }, [postId, post?.likesCount]);

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
      setPost((prev) => prev ? { ...prev, commentsCount: prev.commentsCount + 1 } : prev);
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
      <Stack.Screen
        options={{
          headerRight: isOwnPost ? () => (
            <TouchableOpacity onPress={handleDelete} style={{ paddingRight: 16 }}>
              <MaterialCommunityIcons name="trash-can-outline" size={22} color={Colors.error} />
            </TouchableOpacity>
          ) : undefined,
        }}
      />
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
                <TouchableOpacity onPress={handleLikesPress} disabled={!post.likesCount}>
                  <Text style={[styles.stat, post.likesCount > 0 && styles.statTappable]}>
                    {post.likesCount}件のいいね
                  </Text>
                </TouchableOpacity>
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
            {item.authorId === currentUser?.uid && (
              <TouchableOpacity
                onPress={() => handleDeleteComment(item.id)}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <MaterialCommunityIcons name="trash-can-outline" size={16} color={Colors.textSecondary} />
              </TouchableOpacity>
            )}
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

      <Portal>
        <Modal
          visible={likesModalVisible}
          onDismiss={() => setLikesModalVisible(false)}
          contentContainerStyle={styles.likesModal}
        >
          <Text style={styles.likesModalTitle}>{post?.likesCount}件のいいね</Text>
          {likesLoading ? (
            <ActivityIndicator color={Colors.primary} style={styles.likesLoader} />
          ) : (
            <FlatList
              data={likedUsers}
              keyExtractor={(item) => item.uid}
              style={styles.likeUserList}
              renderItem={({ item }) => (
                <View style={styles.likeUserRow}>
                  {item.photoURL ? (
                    <Avatar.Image size={36} source={{ uri: item.photoURL }} />
                  ) : (
                    <Avatar.Text
                      size={36}
                      label={(item.displayName ?? 'U').charAt(0).toUpperCase()}
                      style={styles.likeUserAvatar}
                    />
                  )}
                  <Text style={styles.likeUserName}>{item.displayName ?? 'ユーザー'}</Text>
                </View>
              )}
              ListEmptyComponent={
                <Text style={styles.likesEmpty}>まだいいねはありません</Text>
              }
            />
          )}
        </Modal>
      </Portal>
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
  statTappable: { fontWeight: '600' },
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
  likesModal: {
    backgroundColor: Colors.card,
    margin: Spacing.lg,
    padding: Spacing.lg,
    borderRadius: BorderRadius.lg,
    maxHeight: '70%',
  },
  likesModalTitle: { fontSize: Typography.h4, fontWeight: '600', color: Colors.text, marginBottom: Spacing.md },
  likesLoader: { marginVertical: Spacing.xl },
  likeUserList: { maxHeight: 400 },
  likeUserRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing.sm,
    gap: Spacing.sm,
  },
  likeUserAvatar: { backgroundColor: Colors.primary },
  likeUserName: { fontSize: Typography.body, color: Colors.text },
  likesEmpty: { textAlign: 'center', color: Colors.textSecondary, marginVertical: Spacing.xl },
});
