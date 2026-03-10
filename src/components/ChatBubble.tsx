import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Text } from 'react-native-paper';
import { Colors, Spacing, BorderRadius, Typography } from '../constants/theme';

interface ChatBubbleProps {
  message?: string;
  content?: string;
  timestamp: string;
  isSent: boolean;
  senderName?: string;
}

export default function ChatBubble({ message, content, timestamp, isSent, senderName }: ChatBubbleProps) {
  const text = message ?? content ?? '';
  return (
    <View style={[styles.container, isSent ? styles.sentContainer : styles.receivedContainer]}>
      {!isSent && senderName && <Text style={styles.senderName}>{senderName}</Text>}
      <View style={[styles.bubble, isSent ? styles.sentBubble : styles.receivedBubble]}>
        <Text style={[styles.content, isSent ? styles.sentContent : styles.receivedContent]}>
          {text}
        </Text>
        <Text style={[styles.timestamp, isSent ? styles.sentTimestamp : styles.receivedTimestamp]}>
          {timestamp}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginVertical: Spacing.xs,
    marginHorizontal: Spacing.md,
    maxWidth: '80%',
  },
  sentContainer: {
    alignSelf: 'flex-end',
  },
  receivedContainer: {
    alignSelf: 'flex-start',
  },
  senderName: {
    fontSize: Typography.caption,
    color: Colors.primary,
    fontWeight: '600',
    marginBottom: 2,
    marginLeft: Spacing.sm,
  },
  bubble: {
    padding: Spacing.sm,
    paddingHorizontal: Spacing.md,
    borderRadius: BorderRadius.lg,
  },
  sentBubble: {
    backgroundColor: Colors.primary,
    borderBottomRightRadius: BorderRadius.sm,
  },
  receivedBubble: {
    backgroundColor: Colors.surfaceGray,
    borderBottomLeftRadius: BorderRadius.sm,
  },
  content: {
    fontSize: Typography.body,
    lineHeight: 22,
  },
  sentContent: {
    color: Colors.white,
  },
  receivedContent: {
    color: Colors.text,
  },
  timestamp: {
    fontSize: Typography.tiny,
    marginTop: Spacing.xs,
    alignSelf: 'flex-end',
  },
  sentTimestamp: {
    color: 'rgba(255,255,255,0.7)',
  },
  receivedTimestamp: {
    color: Colors.textSecondary,
  },
});
