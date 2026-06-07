/**
 * チャット/DM 共有モーダル
 *
 * 分析サマリーをチームグループチャットまたは DM に送信する。
 * - チームタブ: useTeams() で取得したチーム一覧 → sendGroupMessage
 * - DMタブ: useConversations() で取得した会話一覧 → sendDirectMessage
 */
import React, { useState, useCallback } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  StyleSheet,
  Alert,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useAuth } from '../contexts/AuthContext';
import { useTeams } from '../hooks/useTeam';
import { useConversations } from '../hooks/useMessages';
import {
  getOrCreateTeamGroup,
  sendGroupMessage,
} from '../services/groupService';
import { sendDirectMessage } from '../services/messageService';
import { Colors, Spacing, Typography, BorderRadius } from '../constants/theme';

type TabKey = 'team' | 'dm';

interface Props {
  visible: boolean;
  onClose: () => void;
  summary: string;
  gameId?: string;
}

export default function ShareToChatModal({ visible, onClose, summary, gameId }: Props) {
  const { currentUser } = useAuth();
  const { teams } = useTeams();
  const { conversations } = useConversations();

  const [tab, setTab] = useState<TabKey>('team');
  const [sending, setSending] = useState<string | null>(null); // id of item being sent

  const handleSendToTeam = useCallback((teamId: string, teamName: string) => {
    if (!currentUser) return;
    Alert.alert(
      '送信の確認',
      `${teamName} に送信しますか？`,
      [
        { text: 'キャンセル', style: 'cancel' },
        {
          text: '送信する',
          onPress: async () => {
            setSending(teamId);
            try {
              const group = await getOrCreateTeamGroup(
                teamId,
                currentUser.displayName ?? 'ユーザー',
                [],
              );
              await sendGroupMessage(
                group.id,
                currentUser.uid,
                currentUser.displayName ?? 'ユーザー',
                summary,
                gameId ? 'game_analytics' : 'text',
                gameId ? { gameId } : undefined,
              );
              Alert.alert('送信しました', `${teamName} のチャットに共有しました。`);
              onClose();
            } catch (e: unknown) {
              Alert.alert('エラー', (e as Error)?.message ?? '送信に失敗しました。');
            } finally {
              setSending(null);
            }
          },
        },
      ],
    );
  }, [currentUser, summary, gameId, onClose]);

  const handleSendToDM = useCallback((conversationId: string, otherName: string, recipientId: string) => {
    if (!currentUser) return;
    Alert.alert(
      '共有の確認',
      `${otherName} にDMで分析を共有しますか？`,
      [
        { text: 'キャンセル', style: 'cancel' },
        {
          text: '送信',
          onPress: async () => {
            setSending(conversationId);
            try {
              await sendDirectMessage(conversationId, currentUser.uid, recipientId, summary);
              Alert.alert('送信しました', `${otherName} にDMで共有しました。`);
              onClose();
            } catch (e: unknown) {
              Alert.alert('エラー', (e as Error)?.message ?? '送信に失敗しました。');
            } finally {
              setSending(null);
            }
          },
        },
      ],
    );
  }, [currentUser, summary, onClose]);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <TouchableOpacity style={s.backdrop} activeOpacity={1} onPress={onClose}>
        <TouchableOpacity activeOpacity={1} style={s.sheet}>
          <View style={s.handle} />
          <Text style={s.title}>チャットに共有</Text>

          {/* タブ切替 */}
          <View style={s.tabBar}>
            {(['team', 'dm'] as TabKey[]).map((t) => (
              <TouchableOpacity
                key={t}
                style={[s.tabBtn, tab === t && s.tabBtnActive]}
                onPress={() => setTab(t)}
              >
                <MaterialCommunityIcons
                  name={t === 'team' ? 'account-group' : 'chat'}
                  size={14}
                  color={tab === t ? Colors.white : Colors.textSecondary}
                />
                <Text style={[s.tabBtnText, tab === t && s.tabBtnTextActive]}>
                  {t === 'team' ? 'チーム' : 'DM'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* プレビューテキスト */}
          <View style={s.preview}>
            <Text style={s.previewText} numberOfLines={4}>{summary}</Text>
          </View>

          {/* リスト */}
          {tab === 'team' ? (
            teams.length === 0 ? (
              <View style={s.empty}>
                <Text style={s.emptyText}>所属チームがありません</Text>
              </View>
            ) : (
              <FlatList
                data={teams}
                keyExtractor={(item) => item.id}
                style={s.list}
                renderItem={({ item }) => (
                  <TouchableOpacity
                    style={s.listItem}
                    onPress={() => handleSendToTeam(item.id, item.name)}
                    disabled={sending !== null}
                  >
                    <MaterialCommunityIcons name="account-group" size={20} color={Colors.primary} />
                    <Text style={s.listItemText} numberOfLines={1}>{item.name}</Text>
                    {sending === item.id ? (
                      <ActivityIndicator size="small" color={Colors.primary} />
                    ) : (
                      <MaterialCommunityIcons name="send" size={18} color={Colors.primary} />
                    )}
                  </TouchableOpacity>
                )}
              />
            )
          ) : (
            conversations.length === 0 ? (
              <View style={s.empty}>
                <Text style={s.emptyText}>DM の相手がいません</Text>
              </View>
            ) : (
              <FlatList
                data={conversations}
                keyExtractor={(item) => item.id}
                style={s.list}
                renderItem={({ item }) => (
                  <TouchableOpacity
                    style={s.listItem}
                    onPress={() => handleSendToDM(item.id, item.otherUser?.displayName ?? 'ユーザー', item.otherUser?.uid ?? '')}
                    disabled={sending !== null}
                  >
                    <MaterialCommunityIcons name="chat" size={20} color={Colors.primary} />
                    <Text style={s.listItemText} numberOfLines={1}>
                      {item.otherUser?.displayName ?? 'ユーザー'}
                    </Text>
                    {sending === item.id ? (
                      <ActivityIndicator size="small" color={Colors.primary} />
                    ) : (
                      <MaterialCommunityIcons name="send" size={18} color={Colors.primary} />
                    )}
                  </TouchableOpacity>
                )}
              />
            )
          )}

          <TouchableOpacity style={s.cancelBtn} onPress={onClose}>
            <Text style={s.cancelText}>キャンセル</Text>
          </TouchableOpacity>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}

const s = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: Colors.white,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: Spacing.md,
    paddingBottom: Spacing.xl,
    maxHeight: '70%',
  },
  handle: {
    width: 40,
    height: 4,
    backgroundColor: Colors.border,
    borderRadius: 2,
    alignSelf: 'center',
    marginTop: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  title: {
    fontSize: Typography.h4,
    fontWeight: '700' as const,
    textAlign: 'center',
    marginBottom: Spacing.sm,
    color: Colors.text,
  },
  tabBar: {
    flexDirection: 'row',
    gap: Spacing.xs,
    marginBottom: Spacing.sm,
  },
  tabBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: 8,
    borderRadius: BorderRadius.sm,
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  tabBtnActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  tabBtnText: {
    fontSize: 13,
    color: Colors.textSecondary,
    fontWeight: '600',
  },
  tabBtnTextActive: {
    color: Colors.white,
  },
  preview: {
    backgroundColor: Colors.card,
    borderRadius: BorderRadius.sm,
    padding: Spacing.sm,
    marginBottom: Spacing.sm,
    borderLeftWidth: 3,
    borderLeftColor: Colors.primary,
  },
  previewText: {
    fontSize: 12,
    color: Colors.textSecondary,
    lineHeight: 18,
  },
  list: {
    maxHeight: 220,
  },
  listItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.border,
  },
  listItemText: {
    flex: 1,
    fontSize: 14,
    color: Colors.text,
    fontWeight: '500',
  },
  empty: {
    paddingVertical: Spacing.lg,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 13,
    color: Colors.textSecondary,
  },
  cancelBtn: {
    marginTop: Spacing.md,
    paddingVertical: 12,
    alignItems: 'center',
    borderRadius: BorderRadius.sm,
    backgroundColor: Colors.card,
  },
  cancelText: {
    fontSize: 14,
    color: Colors.textSecondary,
    fontWeight: '600',
  },
});
