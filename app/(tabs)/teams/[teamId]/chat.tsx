import React, { useState } from 'react';
import { View, StyleSheet, FlatList, KeyboardAvoidingView, Platform } from 'react-native';
import { TextInput, IconButton, Text } from 'react-native-paper';
import { useLocalSearchParams } from 'expo-router';
import ChatBubble from '../../../../src/components/ChatBubble';
import { useTeamChat } from '../../../../src/hooks/useTeam';
import { useAuth } from '../../../../src/contexts/AuthContext';
import { Colors, Spacing } from '../../../../src/constants/theme';

export default function TeamChatScreen() {
  const { teamId } = useLocalSearchParams<{ teamId: string }>();
  const { messages, sendMessage } = useTeamChat(teamId ?? '');
  const { currentUser } = useAuth();
  const [text, setText] = useState('');

  const handleSend = async () => {
    if (text.trim()) {
      await sendMessage(text.trim());
      setText('');
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={90}
    >
      <FlatList
        data={messages}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <ChatBubble
            message={item.content}
            isSent={item.senderId === currentUser?.uid}
            senderName={item.senderName}
            timestamp={item.createdAt?.toDate?.()?.toLocaleTimeString?.() ?? ''}
          />
        )}
        contentContainerStyle={styles.messagesList}
        inverted={false}
      />
      <View style={styles.inputRow}>
        <TextInput
          placeholder="Type a message..."
          value={text}
          onChangeText={setText}
          mode="outlined"
          style={styles.input}
          dense
        />
        <IconButton
          icon="send"
          iconColor={Colors.primary}
          onPress={handleSend}
          disabled={!text.trim()}
        />
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  messagesList: { padding: Spacing.md },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.sm,
    backgroundColor: Colors.card,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  input: { flex: 1, backgroundColor: Colors.card },
});
