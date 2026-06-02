import React, { useState, useEffect, useCallback, useRef } from 'react';
import { View, StyleSheet, FlatList, KeyboardAvoidingView, Platform, TouchableOpacity, Alert, Animated, Modal } from 'react-native';
import { Text, TextInput, Avatar, IconButton, Divider, ActivityIndicator } from 'react-native-paper';
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
  const [likesSheetVisible, setLikesSheetVisible] = useState(false);
  const [likedUsers, setLikedUsers] = useState<User[]>([]);
  const [likesLoading, setLikesLoading] = useState(false);
  const slideAnim = useRef(new Animated.Value(0)).current;

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

  const openLikesSheet = useCallback(async () => {
    if (!postId || !post?.likesCount) return;
    slideAnim.setValue(0);
    setLikesSheetVisible(true);
    Animated.spring(slideAnim, {
      toValue: 1,
      useNativeDriver: true,
      damping: 22,
      stiffness: 180,
    }).start();
    setLikesLoading(true);
    try {
      const users = await getLikes(postId);
      setLikedUsers(users);
    } catch {
      setLikedUsers([]);
    } finally {
      setLikesLoading(false);
    }
  }, [postId, post?.likesCount, slideAnim]);

  const closeLikesSheet = useCallback(() => {
    Animated.timing(slideAnim, {
      toValue: 0,
      duration: 220,
      useNativeDriver: true,
    }).start(() => {
      setLikesSheetVisible(false);
      setLikedUsers([]);
    });
  }, [slideAnim]);

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
                <TouchableOpacity onPress={openLikesSheet} disabled={!post.likesCount}>
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

      <Modal
        visible={likesSheetVisible}
        transparent
        animationType="none"
        onRequestClose={closeLikesSheet}
      >
        <TouchableOpacity
          style={styles.sheetBackdrop}
          activeOpacity={1}
          onPress={closeLikesSheet}
        />
        <Animated.View
          style={[
            styles.bottomSheet,
            {
              transform: [{
                translateY: slideAnim.interpolate({
                  inputRange: [0, 1],
                  outputRange: [500, 0],
                }),
              }],
            },
          ]}
        >
          {/* ドラッグハンドル */}
          <View style={styles.sheetHandle} />

          {/* タイトル行 */}
          <View style={styles.sheetHeader}>
            <Text style={styles.sheetTitle}>
              ❤️  {post?.likesCount}件のいいね
            </Text>
            <TouchableOpacity onPress={closeLikesSheet} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <MaterialCommunityIcons name="close" size={20} color={Colors.textSecondary} />
            </TouchableOpacity>
          </View>

          <Divider />

          {likesLoading ? (
            <View style={styles.sheetLoader}>
              <ActivityIndicator color={Colors.primary} />
            </View>
          ) : (
            <FlatList
              data={likedUsers}
              keyExtractor={(item) => item.uid}
              style={styles.sheetList}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={styles.likeUserRow}
                  onPress={() => {
                    closeLikesSheet();
                    router.push(`/user/${item.uid}` as any);
                  }}
                  activeOpacity={0.7}
                >
                  {item.photoURL ? (
                    <Avatar.Image size={40} source={{ uri: item.photoURL }} />
                  ) : (
                    <Avatar.Text
                      size={40}
                      label={(item.displayName ?? 'U').charAt(0).toUpperCase()}
                      style={styles.likeUserAvatar}
                    />
                  )}
                  <Text style={styles.likeUserName}>{item.displayName ?? 'ユーザー'}</Text>
                  <MaterialCommunityIcons name="chevron-right" size={18} color={Colors.textDisabled} />
                </TouchableOpacity>
              )}
              ListEmptyComponent={
                <Text style={styles.sheetEmpty}>まだいいねはありません</Text>
              }
              contentContainerStyle={styles.sheetListContent}
            />
          )}
        </Animated.View>
      </Modal>
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
  sheetBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  bottomSheet: {
    backgroundColor: Colors.card,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingBottom: 32,
    maxHeight: '70%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -3 },
    shadowOpacity: 0.12,
    shadowRadius: 10,
    elevation: 16,
  },
  sheetHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.border,
    alignSelf: 'center',
    marginTop: 10,
    marginBottom: 6,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  sheetTitle: {
    fontSize: Typography.h4,
    fontWeight: '700',
    color: Colors.text,
  },
  sheetLoader: {
    paddingVertical: Spacing.xxl,
    alignItems: 'center',
  },
  sheetList: { maxHeight: 400 },
  sheetListContent: { paddingBottom: Spacing.lg },
  likeUserRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    gap: Spacing.sm,
  },
  likeUserAvatar: { backgroundColor: Colors.primary },
  likeUserName: { flex: 1, fontSize: Typography.body, color: Colors.text, fontWeight: '500' },
  sheetEmpty: { textAlign: 'center', color: Colors.textSecondary, marginVertical: Spacing.xl },
});
