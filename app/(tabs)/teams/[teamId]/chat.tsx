import React, { useState } from 'react';
import {
  View,
  StyleSheet,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  TouchableOpacity,
} from 'react-native';
import { TextInput, IconButton, Text } from 'react-native-paper';
import { useLocalSearchParams, router } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import ChatBubble from '../../../../src/components/ChatBubble';
import { useTeamChat } from '../../../../src/hooks/useTeam';
import { useAuth } from '../../../../src/contexts/AuthContext';
import { GroupMessage } from '../../../../src/models/types';
import { Colors, Spacing, Typography, BorderRadius } from '../../../../src/constants/theme';

function GameAnalyticsCard({
  msg,
  isSent,
}: {
  msg: GroupMessage;
  isSent: boolean;
}) {
  const gameId = msg.gameId!;
  const timestamp = msg.createdAt?.toDate?.()?.toLocaleTimeString?.('ja-JP', {
    hour: '2-digit',
    minute: '2-digit',
  }) ?? '';
  const summaryLines = msg.content
    .split('\n')
    .filter((line) => line.trim() && line !== '---' && !line.startsWith('BaseLedger'));
  const scoreLine = summaryLines[0] ?? msg.content;

  return (
    <View style={[styles.analyticsWrapper, isSent ? styles.analyticsWrapperSent : styles.analyticsWrapperReceived]}>
      {!isSent && <Text style={styles.senderName}>{msg.senderName}</Text>}
      <TouchableOpacity
        style={styles.analyticsCard}
        onPress={() => router.push(`/(tabs)/analytics/${gameId}` as any)}
        activeOpacity={0.8}
      >
        <View style={styles.analyticsHeader}>
          <MaterialCommunityIcons name="baseball" size={18} color={Colors.primary} />
          <Text style={styles.analyticsTitle}>試合分析</Text>
        </View>
        <Text style={styles.analyticsScore} numberOfLines={3}>
          {scoreLine}
        </Text>
        {summaryLines.length > 1 && (
          <Text style={styles.analyticsSub} numberOfLines={2}>
            {summaryLines.slice(1).join('\n')}
          </Text>
        )}
        <Text style={styles.analyticsLink}>詳細を見る →</Text>
        <Text style={styles.analyticsTime}>{timestamp}</Text>
      </TouchableOpacity>
    </View>
  );
}

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
        renderItem={({ item }) => {
          if (item.type === 'game_analytics' && item.gameId) {
            return (
              <GameAnalyticsCard
                msg={item}
                isSent={item.senderId === currentUser?.uid}
              />
            );
          }
          return (
            <ChatBubble
              message={item.content}
              isSent={item.senderId === currentUser?.uid}
              senderName={item.senderName}
              timestamp={item.createdAt?.toDate?.()?.toLocaleTimeString?.() ?? ''}
            />
          );
        }}
        contentContainerStyle={styles.messagesList}
        inverted={false}
      />
      <View style={styles.inputRow}>
        <TextInput
          placeholder="メッセージを入力..."
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
  analyticsWrapper: {
    marginVertical: Spacing.xs,
    maxWidth: '85%',
  },
  analyticsWrapperSent: {
    alignSelf: 'flex-end',
  },
  analyticsWrapperReceived: {
    alignSelf: 'flex-start',
  },
  senderName: {
    fontSize: Typography.caption,
    color: Colors.primary,
    fontWeight: '600',
    marginBottom: 3,
    marginLeft: 4,
  },
  analyticsCard: {
    backgroundColor: Colors.card,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.border,
    borderLeftWidth: 4,
    borderLeftColor: Colors.primary,
  },
  analyticsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Spacing.xs,
    gap: 6,
  },
  analyticsTitle: {
    fontSize: Typography.bodySmall,
    fontWeight: '700',
    color: Colors.primary,
  },
  analyticsScore: {
    fontSize: Typography.body,
    fontWeight: '600',
    color: Colors.text,
    lineHeight: 22,
  },
  analyticsSub: {
    fontSize: Typography.bodySmall,
    color: Colors.textSecondary,
    marginTop: 4,
    lineHeight: 20,
  },
  analyticsLink: {
    fontSize: Typography.bodySmall,
    fontWeight: '600',
    color: Colors.primary,
    marginTop: Spacing.sm,
  },
  analyticsTime: {
    fontSize: Typography.tiny,
    color: Colors.textSecondary,
    marginTop: 6,
    alignSelf: 'flex-end',
  },
});
