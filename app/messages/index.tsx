import React from 'react';
import { View, StyleSheet, FlatList, TouchableOpacity } from 'react-native';
import { Text, Avatar, Divider } from 'react-native-paper';
import { router } from 'expo-router';
import { useConversations } from '../../src/hooks/useMessages';
import EmptyState from '../../src/components/EmptyState';
import { Colors, Spacing, Typography } from '../../src/constants/theme';

export default function MessagesScreen() {
  const { conversations, loading } = useConversations();

  return (
    <View style={styles.container}>
      <FlatList
        data={conversations}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={styles.conversationItem}
            onPress={() => router.push(`/messages/${item.id}` as any)}
          >
            <Avatar.Text
              size={48}
              label={(item.otherUser?.displayName ?? 'U').charAt(0)}
              style={styles.avatar}
            />
            <View style={styles.info}>
              <Text style={styles.name}>{item.otherUser?.displayName ?? 'User'}</Text>
              <Text style={styles.lastMessage} numberOfLines={1}>
                {item.lastMessage}
              </Text>
            </View>
            <Text style={styles.time}>
              {item.lastMessageAt?.toDate?.()?.toLocaleDateString?.() ?? ''}
            </Text>
          </TouchableOpacity>
        )}
        ItemSeparatorComponent={() => <Divider />}
        contentContainerStyle={conversations.length === 0 ? styles.emptyContainer : undefined}
        ListEmptyComponent={
          <EmptyState
            icon="message-text-outline"
            title="No messages"
            subtitle="Start a conversation by following someone"
          />
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  emptyContainer: { flex: 1 },
  conversationItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.md,
    backgroundColor: Colors.card,
  },
  avatar: { backgroundColor: Colors.primary },
  info: { flex: 1, marginLeft: Spacing.md },
  name: { fontSize: Typography.body, fontWeight: '600', color: Colors.text },
  lastMessage: { fontSize: Typography.bodySmall, color: Colors.textSecondary, marginTop: 2 },
  time: { fontSize: Typography.tiny, color: Colors.textSecondary },
});
