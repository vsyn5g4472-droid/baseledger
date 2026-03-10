import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  View,
  StyleSheet,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  TouchableOpacity,
  Modal,
  Pressable,
  Animated,
} from 'react-native';
import { TextInput, IconButton, Text, Divider } from 'react-native-paper';
import { useLocalSearchParams, Stack } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useGroupMessages } from '../../../src/hooks/useGroupChat';
import { useChat as useDMChat } from '../../../src/hooks/useMessages';
import { GroupMessage, Message } from '../../../src/models/types';
import {
  Colors,
  Spacing,
  Typography,
  BorderRadius,
} from '../../../src/constants/theme';
import { useI18n } from '../../../src/i18n';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatTime(timestamp: any): string {
  if (!timestamp) return '';
  const date: Date = timestamp?.toDate?.() ?? new Date(timestamp);
  return date.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });
}

function formatDateLabel(timestamp: any): string {
  if (!timestamp) return '';
  const date: Date = timestamp?.toDate?.() ?? new Date(timestamp);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const msgDay = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const diff = today.getTime() - msgDay.getTime();
  if (diff === 0) return '今日';
  if (diff === 86_400_000) return '昨日';
  return date.toLocaleDateString('ja-JP', { month: 'numeric', day: 'numeric' });
}

// ─── Bubble Components ────────────────────────────────────────────────────────

function SystemBubble({ content }: { content: string }) {
  return (
    <View style={styles.systemRow}>
      <View style={styles.systemBubble}>
        <Text style={styles.systemText}>{content}</Text>
      </View>
    </View>
  );
}

function ScheduleCard({
  content,
  scheduleDate,
  senderName,
  timestamp,
}: {
  content: string;
  scheduleDate: string | null;
  senderName: string;
  timestamp: string;
}) {
  return (
    <View style={styles.scheduleCardWrapper}>
      <Text style={styles.scheduleSender}>{senderName}</Text>
      <View style={styles.scheduleCard}>
        <View style={styles.scheduleHeader}>
          <MaterialCommunityIcons name="calendar" size={18} color={Colors.primary} />
          <Text style={styles.scheduleTitle}>スケジュール</Text>
        </View>
        {scheduleDate && (
          <View style={styles.scheduleDateRow}>
            <MaterialCommunityIcons name="clock-outline" size={14} color={Colors.accent} />
            <Text style={styles.scheduleDate}>{scheduleDate}</Text>
          </View>
        )}
        <Text style={styles.scheduleContent}>{content}</Text>
        <Text style={styles.scheduleTime}>{timestamp}</Text>
      </View>
    </View>
  );
}

function GroupBubble({
  msg,
  isMine,
}: {
  msg: GroupMessage;
  isMine: boolean;
}) {
  if (msg.type === 'system') {
    return <SystemBubble content={msg.content} />;
  }
  if (msg.type === 'schedule') {
    return (
      <ScheduleCard
        content={msg.content}
        scheduleDate={msg.scheduleDate}
        senderName={isMine ? 'あなた' : msg.senderName}
        timestamp={formatTime(msg.createdAt)}
      />
    );
  }

  return (
    <View style={[styles.bubbleRow, isMine ? styles.bubbleRowRight : styles.bubbleRowLeft]}>
      {!isMine && (
        <View style={styles.senderAvatar}>
          <Text style={styles.senderAvatarText}>{msg.senderName.charAt(0)}</Text>
        </View>
      )}
      <View style={styles.bubbleGroup}>
        {!isMine && <Text style={styles.senderName}>{msg.senderName}</Text>}
        <View style={[styles.bubble, isMine ? styles.bubbleSent : styles.bubbleReceived]}>
          <Text style={[styles.bubbleText, isMine ? styles.textSent : styles.textReceived]}>
            {msg.content}
          </Text>
        </View>
        <Text style={[styles.bubbleTime, isMine ? styles.timeRight : styles.timeLeft]}>
          {formatTime(msg.createdAt)}
        </Text>
      </View>
    </View>
  );
}

function DMBubble({ msg, isMine }: { msg: Message; isMine: boolean }) {
  return (
    <View style={[styles.bubbleRow, isMine ? styles.bubbleRowRight : styles.bubbleRowLeft]}>
      <View style={styles.bubbleGroup}>
        <View style={[styles.bubble, isMine ? styles.bubbleSent : styles.bubbleReceived]}>
          <Text style={[styles.bubbleText, isMine ? styles.textSent : styles.textReceived]}>
            {msg.content}
          </Text>
        </View>
        <Text style={[styles.bubbleTime, isMine ? styles.timeRight : styles.timeLeft]}>
          {formatTime(msg.createdAt)}
        </Text>
      </View>
    </View>
  );
}

// ─── Schedule Modal ───────────────────────────────────────────────────────────

function ScheduleModal({
  visible,
  onClose,
  onSubmit,
}: {
  visible: boolean;
  onClose: () => void;
  onSubmit: (date: string, content: string) => void;
}) {
  const { t } = useI18n();
  const [date, setDate] = useState('');
  const [content, setContent] = useState('');

  const handleSubmit = () => {
    if (date.trim() && content.trim()) {
      onSubmit(date.trim(), content.trim());
      setDate('');
      setContent('');
      onClose();
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.modalOverlay} onPress={onClose}>
        <Pressable style={styles.scheduleModal} onPress={(e) => e.stopPropagation()}>
          <View style={styles.modalHandle} />
          <Text style={styles.modalTitle}>{t.chat.scheduleTitle}</Text>

          <Text style={styles.inputLabel}>{t.chat.scheduleDate}</Text>
          <TextInput
            mode="outlined"
            value={date}
            onChangeText={setDate}
            placeholder={t.chat.scheduleDatePlaceholder}
            style={styles.modalInput}
            outlineColor={Colors.border}
            activeOutlineColor={Colors.primary}
          />

          <Text style={styles.inputLabel}>{t.chat.scheduleContent}</Text>
          <TextInput
            mode="outlined"
            value={content}
            onChangeText={setContent}
            placeholder={t.chat.scheduleContentPlaceholder}
            multiline
            numberOfLines={3}
            style={[styles.modalInput, { height: 80 }]}
            outlineColor={Colors.border}
            activeOutlineColor={Colors.primary}
          />

          <View style={styles.modalButtons}>
            <TouchableOpacity style={styles.cancelBtn} onPress={onClose}>
              <Text style={styles.cancelText}>{t.chat.scheduleCancel}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.postBtn, (!date.trim() || !content.trim()) && styles.postBtnDisabled]}
              onPress={handleSubmit}
              disabled={!date.trim() || !content.trim()}
            >
              <Text style={styles.postText}>{t.chat.schedulePost}</Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// ─── Attachment Picker ────────────────────────────────────────────────────────

function AttachMenu({
  visible,
  onSchedule,
  onClose,
}: {
  visible: boolean;
  onSchedule: () => void;
  onClose: () => void;
}) {
  const { t } = useI18n();
  if (!visible) return null;
  return (
    <View style={styles.attachMenu}>
      <TouchableOpacity
        style={styles.attachItem}
        onPress={() => { onClose(); onSchedule(); }}
      >
        <View style={styles.attachIcon}>
          <MaterialCommunityIcons name="calendar-plus" size={22} color={Colors.primary} />
        </View>
        <Text style={styles.attachLabel}>{t.chat.schedule}</Text>
      </TouchableOpacity>
      <TouchableOpacity style={styles.attachItem} onPress={onClose}>
        <View style={[styles.attachIcon, { backgroundColor: Colors.primaryLight }]}>
          <MaterialCommunityIcons name="image" size={22} color={Colors.textSecondary} />
        </View>
        <Text style={[styles.attachLabel, { color: Colors.textSecondary }]}>
          {t.chat.attachment}
        </Text>
      </TouchableOpacity>
    </View>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

const DM_MOCK_USER_ID = 'mock-user-001';

export default function ChatDetailScreen() {
  const { chatId, type, title } = useLocalSearchParams<{
    chatId: string;
    type: 'group' | 'dm';
    title: string;
  }>();
  const { t } = useI18n();
  const [text, setText] = useState('');
  const [showAttach, setShowAttach] = useState(false);
  const [showSchedule, setShowSchedule] = useState(false);
  const flatListRef = useRef<FlatList>(null);

  const isGroup = type === 'group';

  // Group chat data
  const {
    messages: groupMessages,
    loading: groupLoading,
    currentUserId,
    sendMessage: sendGroupMsg,
    sendSchedule,
  } = useGroupMessages(isGroup ? (chatId ?? '') : '__none__');

  // DM chat data
  const {
    messages: dmMessages,
    loading: dmLoading,
    sendMessage: sendDMMsg,
  } = useDMChat(!isGroup ? (chatId ?? '') : '__none__');

  const messages = isGroup ? groupMessages : dmMessages;
  const loading = isGroup ? groupLoading : dmLoading;

  // Scroll to bottom when messages change
  useEffect(() => {
    if (messages.length > 0) {
      setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
    }
  }, [messages.length]);

  const handleSend = useCallback(async () => {
    const trimmed = text.trim();
    if (!trimmed) return;
    setText('');
    setShowAttach(false);
    if (isGroup) {
      await sendGroupMsg(trimmed);
    } else {
      await sendDMMsg(trimmed);
    }
  }, [text, isGroup, sendGroupMsg, sendDMMsg]);

  const handleScheduleSubmit = useCallback(
    async (date: string, content: string) => {
      await sendSchedule(date, content);
    },
    [sendSchedule],
  );

  return (
    <>
      <Stack.Screen options={{ title: title ?? (isGroup ? 'グループ' : 'DM') }} />
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
      >
        {/* Messages list */}
        <FlatList
          ref={flatListRef}
          data={messages}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) =>
            isGroup ? (
              <GroupBubble
                msg={item as GroupMessage}
                isMine={(item as GroupMessage).senderId === currentUserId}
              />
            ) : (
              <DMBubble
                msg={item as Message}
                isMine={(item as Message).senderId === DM_MOCK_USER_ID}
              />
            )
          }
          contentContainerStyle={styles.messageList}
          ListEmptyComponent={
            !loading ? (
              <View style={styles.emptyChat}>
                <MaterialCommunityIcons
                  name="chat-outline"
                  size={48}
                  color={Colors.border}
                />
                <Text style={styles.emptyChatText}>メッセージを送ってみましょう</Text>
              </View>
            ) : null
          }
        />

        {/* Attachment menu */}
        {isGroup && (
          <AttachMenu
            visible={showAttach}
            onSchedule={() => setShowSchedule(true)}
            onClose={() => setShowAttach(false)}
          />
        )}

        {/* Input bar */}
        <View style={styles.inputBar}>
          {isGroup && (
            <TouchableOpacity
              style={[styles.attachBtn, showAttach && styles.attachBtnActive]}
              onPress={() => setShowAttach((v) => !v)}
            >
              <MaterialCommunityIcons
                name={showAttach ? 'close' : 'plus'}
                size={22}
                color={showAttach ? Colors.white : Colors.primary}
              />
            </TouchableOpacity>
          )}
          <TextInput
            value={text}
            onChangeText={setText}
            placeholder={t.chat.typeMessage}
            mode="outlined"
            style={styles.textInput}
            dense
            outlineColor={Colors.border}
            activeOutlineColor={Colors.primary}
            onFocus={() => setShowAttach(false)}
            multiline
          />
          <TouchableOpacity
            style={[styles.sendBtn, !text.trim() && styles.sendBtnDisabled]}
            onPress={handleSend}
            disabled={!text.trim()}
          >
            <MaterialCommunityIcons
              name="send"
              size={20}
              color={text.trim() ? Colors.white : Colors.textSecondary}
            />
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>

      {/* Schedule modal */}
      <ScheduleModal
        visible={showSchedule}
        onClose={() => setShowSchedule(false)}
        onSubmit={handleScheduleSubmit}
      />
    </>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },

  // Messages
  messageList: { padding: Spacing.sm, paddingBottom: Spacing.md },
  emptyChat: { alignItems: 'center', paddingTop: 60, gap: 8 },
  emptyChatText: { color: Colors.textSecondary, fontSize: Typography.bodySmall },

  // System message
  systemRow: { alignItems: 'center', marginVertical: Spacing.sm },
  systemBubble: {
    backgroundColor: Colors.primaryLight,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.full,
  },
  systemText: {
    fontSize: Typography.caption,
    color: Colors.textSecondary,
    textAlign: 'center',
  },

  // Schedule card
  scheduleCardWrapper: { marginVertical: Spacing.xs, paddingHorizontal: Spacing.md },
  scheduleSender: {
    fontSize: Typography.caption,
    color: Colors.primary,
    fontWeight: '600',
    marginBottom: 3,
    marginLeft: 4,
  },
  scheduleCard: {
    backgroundColor: Colors.card,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.border,
    borderLeftWidth: 4,
    borderLeftColor: Colors.accent,
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
  },
  scheduleHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Spacing.xs,
    gap: 6,
  },
  scheduleTitle: {
    fontSize: Typography.bodySmall,
    fontWeight: '700',
    color: Colors.primary,
  },
  scheduleDateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 4,
  },
  scheduleDate: {
    fontSize: Typography.bodySmall,
    fontWeight: '600',
    color: Colors.text,
  },
  scheduleContent: {
    fontSize: Typography.body,
    color: Colors.text,
    lineHeight: 22,
  },
  scheduleTime: {
    fontSize: Typography.tiny,
    color: Colors.textSecondary,
    marginTop: 6,
    alignSelf: 'flex-end',
  },

  // Chat bubbles
  bubbleRow: { flexDirection: 'row', marginVertical: 3, paddingHorizontal: Spacing.sm },
  bubbleRowLeft: { justifyContent: 'flex-start' },
  bubbleRowRight: { justifyContent: 'flex-end' },
  senderAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: Spacing.xs,
    alignSelf: 'flex-end',
  },
  senderAvatarText: {
    fontSize: Typography.caption,
    color: Colors.white,
    fontWeight: '700',
  },
  bubbleGroup: { maxWidth: '75%' },
  senderName: {
    fontSize: Typography.caption,
    color: Colors.primary,
    fontWeight: '600',
    marginLeft: 8,
    marginBottom: 2,
  },
  bubble: {
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    borderRadius: BorderRadius.lg,
  },
  bubbleSent: {
    backgroundColor: Colors.primary,
    borderBottomRightRadius: BorderRadius.sm,
  },
  bubbleReceived: {
    backgroundColor: Colors.surfaceGray,
    borderBottomLeftRadius: BorderRadius.sm,
  },
  bubbleText: { fontSize: Typography.body, lineHeight: 22 },
  textSent: { color: Colors.white },
  textReceived: { color: Colors.text },
  bubbleTime: { fontSize: Typography.tiny, marginTop: 2, color: Colors.textSecondary },
  timeLeft: { alignSelf: 'flex-start', marginLeft: 8 },
  timeRight: { alignSelf: 'flex-end', marginRight: 4 },

  // Input bar
  inputBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.sm,
    backgroundColor: Colors.card,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    gap: 6,
  },
  attachBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: Colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 2,
  },
  attachBtnActive: { backgroundColor: Colors.primary },
  textInput: {
    flex: 1,
    backgroundColor: Colors.card,
    maxHeight: 100,
    fontSize: Typography.body,
  },
  sendBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 2,
  },
  sendBtnDisabled: { backgroundColor: Colors.border },

  // Attach menu
  attachMenu: {
    flexDirection: 'row',
    backgroundColor: Colors.card,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    gap: Spacing.lg,
  },
  attachItem: { alignItems: 'center', gap: 4 },
  attachIcon: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: Colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  attachLabel: {
    fontSize: Typography.caption,
    color: Colors.primary,
    fontWeight: '500',
  },

  // Schedule modal
  modalOverlay: {
    flex: 1,
    backgroundColor: Colors.overlay,
    justifyContent: 'flex-end',
  },
  scheduleModal: {
    backgroundColor: Colors.card,
    borderTopLeftRadius: BorderRadius.xl,
    borderTopRightRadius: BorderRadius.xl,
    padding: Spacing.lg,
    paddingBottom: Spacing.xxl,
  },
  modalHandle: {
    width: 40,
    height: 4,
    backgroundColor: Colors.border,
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: Spacing.md,
  },
  modalTitle: {
    fontSize: Typography.h4,
    fontWeight: '700',
    color: Colors.text,
    marginBottom: Spacing.lg,
  },
  inputLabel: {
    fontSize: Typography.bodySmall,
    fontWeight: '600',
    color: Colors.primary,
    marginBottom: 4,
  },
  modalInput: {
    backgroundColor: Colors.card,
    marginBottom: Spacing.md,
  },
  modalButtons: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginTop: Spacing.sm,
  },
  cancelBtn: {
    flex: 1,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
  },
  cancelText: { color: Colors.textSecondary, fontWeight: '600' },
  postBtn: {
    flex: 1,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.primary,
    alignItems: 'center',
  },
  postBtnDisabled: { backgroundColor: Colors.border },
  postText: { color: Colors.white, fontWeight: '700' },
});
