import React, { useState } from 'react';
import { View, StyleSheet, FlatList, KeyboardAvoidingView, Platform } from 'react-native';
import { Text, TextInput, Avatar, IconButton, Divider } from 'react-native-paper';
import { useLocalSearchParams } from 'expo-router';
import { Colors, Spacing, Typography, BorderRadius } from '../../../src/constants/theme';

const mockComments = [
  { id: '1', authorName: '鈴木 一郎', content: 'Nice hit! Keep it up!', timeAgo: '2h ago' },
  { id: '2', authorName: '佐藤 大輔', content: 'Great form on that swing', timeAgo: '1h ago' },
  { id: '3', authorName: 'Coach Yamada', content: 'Impressive improvement this season', timeAgo: '30m ago' },
];

export default function PostDetailScreen() {
  const { postId } = useLocalSearchParams<{ postId: string }>();
  const [comment, setComment] = useState('');

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={90}
    >
      <FlatList
        data={mockComments}
        keyExtractor={(item) => item.id}
        ListHeaderComponent={
          <View style={styles.postSection}>
            <View style={styles.authorRow}>
              <Avatar.Text size={44} label="T" style={styles.avatar} />
              <View>
                <Text style={styles.authorName}>田中 翔太</Text>
                <Text style={styles.timeAgo}>3h ago</Text>
              </View>
            </View>
            <Text style={styles.postContent}>
              Today's game was incredible! 3-for-4 with 2 RBIs and a stolen base. Our team won 5-3. The hard work in practice is paying off!
            </Text>
            <View style={styles.statsRow}>
              <Text style={styles.stat}>24 likes</Text>
              <Text style={styles.stat}>{mockComments.length} comments</Text>
            </View>
            <Divider style={styles.divider} />
            <Text style={styles.sectionTitle}>Comments</Text>
          </View>
        }
        renderItem={({ item }) => (
          <View style={styles.commentItem}>
            <Avatar.Text size={32} label={item.authorName.charAt(0)} style={styles.commentAvatar} />
            <View style={styles.commentContent}>
              <Text style={styles.commentAuthor}>{item.authorName}</Text>
              <Text style={styles.commentText}>{item.content}</Text>
              <Text style={styles.commentTime}>{item.timeAgo}</Text>
            </View>
          </View>
        )}
        contentContainerStyle={styles.listContent}
      />
      <View style={styles.inputRow}>
        <TextInput
          placeholder="Add a comment..."
          value={comment}
          onChangeText={setComment}
          mode="outlined"
          style={styles.commentInput}
          dense
        />
        <IconButton
          icon="send"
          iconColor={Colors.primary}
          onPress={() => setComment('')}
          disabled={!comment.trim()}
        />
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  listContent: { paddingBottom: Spacing.md },
  postSection: { padding: Spacing.md, backgroundColor: Colors.card },
  authorRow: { flexDirection: 'row', alignItems: 'center', marginBottom: Spacing.md },
  avatar: { backgroundColor: Colors.primary, marginRight: Spacing.sm },
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
