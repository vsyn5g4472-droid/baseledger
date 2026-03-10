import { useState, useCallback, useEffect, useRef } from 'react';
import { Timestamp } from 'firebase/firestore';
import { Group, GroupMessage, GroupMessageType } from '../models/types';

// ─── Mock data ────────────────────────────────────────────────────────────────

const CURRENT_USER_ID = 'mock-user-001';
const CURRENT_USER_NAME = '田中 翔太';

const MOCK_GROUPS: Group[] = [
  {
    id: 'group-001',
    teamId: 'team-001',
    name: '東京ブルースターズ',
    description: '東京ブルースターズのチームグループ',
    photoURL: null,
    memberIds: ['mock-user-001', 'mock-user-002', 'mock-user-003'],
    lastMessage: '明日の練習は9時からです。',
    lastMessageAt: Timestamp.now(),
    lastMessageSenderId: 'mock-user-003',
    createdAt: Timestamp.now(),
  },
  {
    id: 'group-002',
    teamId: 'team-002',
    name: '大阪レッドウィングス',
    description: '大阪レッドウィングスのグループ',
    photoURL: null,
    memberIds: ['mock-user-001', 'mock-user-004', 'mock-user-005'],
    lastMessage: '今週末の試合、頑張りましょう！',
    lastMessageAt: Timestamp.now(),
    lastMessageSenderId: 'mock-user-004',
    createdAt: Timestamp.now(),
  },
];

const MOCK_GROUP_MESSAGES: Record<string, GroupMessage[]> = {
  'group-001': [
    {
      id: 'gmsg-001',
      senderId: 'mock-user-003',
      senderName: '鈴木 大輔',
      content: '明日の練習は9時からです。グラウンドBを使います。',
      type: 'text',
      scheduleDate: null,
      mediaURLs: [],
      createdAt: Timestamp.now(),
      readBy: ['mock-user-003', 'mock-user-001'],
    },
    {
      id: 'gmsg-002',
      senderId: 'mock-user-001',
      senderName: '田中 翔太',
      content: '了解です！新しいピッチングフォームを試してみます。',
      type: 'text',
      scheduleDate: null,
      mediaURLs: [],
      createdAt: Timestamp.now(),
      readBy: ['mock-user-001'],
    },
    {
      id: 'gmsg-003',
      senderId: 'mock-user-003',
      senderName: '鈴木 大輔',
      content: '春季大会 準決勝\n場所: 神宮球場\n集合: 8:30',
      type: 'schedule',
      scheduleDate: '2026-03-20',
      mediaURLs: [],
      createdAt: Timestamp.now(),
      readBy: ['mock-user-003'],
    },
    {
      id: 'gmsg-004',
      senderId: 'system',
      senderName: 'システム',
      content: '⚾ 田中 翔太 が 西高校 戦のスコアを記録しました（2026-03-05）',
      type: 'system',
      scheduleDate: null,
      mediaURLs: [],
      createdAt: Timestamp.now(),
      readBy: [],
    },
    {
      id: 'gmsg-005',
      senderId: 'mock-user-002',
      senderName: '佐藤 健太',
      content: 'バッティングケージも使えますか？',
      type: 'text',
      scheduleDate: null,
      mediaURLs: [],
      createdAt: Timestamp.now(),
      readBy: ['mock-user-002'],
    },
  ],
  'group-002': [
    {
      id: 'gmsg-101',
      senderId: 'mock-user-004',
      senderName: '山田 浩二',
      content: '今週末の試合、頑張りましょう！',
      type: 'text',
      scheduleDate: null,
      mediaURLs: [],
      createdAt: Timestamp.now(),
      readBy: ['mock-user-004'],
    },
    {
      id: 'gmsg-102',
      senderId: 'mock-user-004',
      senderName: '山田 浩二',
      content: '練習試合 vs 北高校',
      type: 'schedule',
      scheduleDate: '2026-03-22',
      mediaURLs: [],
      createdAt: Timestamp.now(),
      readBy: ['mock-user-004'],
    },
  ],
};

// ─── Hooks ────────────────────────────────────────────────────────────────────

/**
 * Returns groups the current user belongs to, with real-time simulation.
 * In production: replace with onUserGroupsUpdate() from groupService.
 */
export function useGroups(): {
  groups: Group[];
  loading: boolean;
  refresh: () => Promise<void>;
} {
  const [groups, setGroups] = useState<Group[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => {
      setGroups(MOCK_GROUPS);
      setLoading(false);
    }, 300);
    return () => clearTimeout(timer);
  }, []);

  const refresh = useCallback(async () => {
    setLoading(true);
    await new Promise((r) => setTimeout(r, 300));
    setGroups([...MOCK_GROUPS]);
    setLoading(false);
  }, []);

  return { groups, loading, refresh };
}

/**
 * Returns messages for a group, with real-time updates and send capability.
 * In production: replace with onGroupMessagesUpdate() and sendGroupMessage() from groupService.
 */
export function useGroupMessages(groupId: string): {
  messages: GroupMessage[];
  loading: boolean;
  currentUserId: string;
  sendMessage: (content: string) => Promise<void>;
  sendSchedule: (date: string, content: string) => Promise<void>;
} {
  const [messages, setMessages] = useState<GroupMessage[]>([]);
  const [loading, setLoading] = useState(true);
  // Use a ref to track the local mock state for this session
  const localMessages = useRef<GroupMessage[]>(MOCK_GROUP_MESSAGES[groupId] ?? []);

  useEffect(() => {
    localMessages.current = MOCK_GROUP_MESSAGES[groupId] ?? [];
    const timer = setTimeout(() => {
      setMessages([...localMessages.current]);
      setLoading(false);
    }, 300);
    return () => clearTimeout(timer);
  }, [groupId]);

  const sendMessage = useCallback(
    async (content: string) => {
      const newMsg: GroupMessage = {
        id: 'gmsg-' + Date.now(),
        senderId: CURRENT_USER_ID,
        senderName: CURRENT_USER_NAME,
        content,
        type: 'text',
        scheduleDate: null,
        mediaURLs: [],
        createdAt: Timestamp.now(),
        readBy: [CURRENT_USER_ID],
      };
      localMessages.current = [...localMessages.current, newMsg];
      setMessages([...localMessages.current]);
      // TODO: replace with sendGroupMessage(groupId, ...) from groupService
      await new Promise((r) => setTimeout(r, 50));
    },
    [groupId],
  );

  const sendSchedule = useCallback(
    async (date: string, content: string) => {
      const newMsg: GroupMessage = {
        id: 'gmsg-' + Date.now(),
        senderId: CURRENT_USER_ID,
        senderName: CURRENT_USER_NAME,
        content,
        type: 'schedule',
        scheduleDate: date,
        mediaURLs: [],
        createdAt: Timestamp.now(),
        readBy: [CURRENT_USER_ID],
      };
      localMessages.current = [...localMessages.current, newMsg];
      setMessages([...localMessages.current]);
      // TODO: replace with sendGroupMessage(groupId, ..., 'schedule', {scheduleDate: date})
      await new Promise((r) => setTimeout(r, 50));
    },
    [groupId],
  );

  return { messages, loading, currentUserId: CURRENT_USER_ID, sendMessage, sendSchedule };
}

/**
 * Returns a single group by ID.
 */
export function useGroup(groupId: string): { group: Group | null; loading: boolean } {
  const [group, setGroup] = useState<Group | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => {
      setGroup(MOCK_GROUPS.find((g) => g.id === groupId) ?? null);
      setLoading(false);
    }, 200);
    return () => clearTimeout(timer);
  }, [groupId]);

  return { group, loading };
}
