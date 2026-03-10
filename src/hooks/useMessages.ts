import { useState, useCallback, useEffect } from 'react';
import { Timestamp } from 'firebase/firestore';
import { Conversation, Message, User } from '../models/types';

const CURRENT_USER_ID = 'mock-user-001';

const MOCK_OTHER_USERS: Record<string, User> = {
  'mock-scout-001': {
    uid: 'mock-scout-001',
    email: 'watanabe@example.com',
    displayName: '渡辺 一郎',
    photoURL: null,
    username: null,
    role: 'scout',
    position: null,
    team: null,
    age: 45,
    throwHand: null,
    batHand: null,
    bio: '20年以上のスカウト経験。才能を見抜く目に自信あり。',
    stats: {
      batting: { avg: 0, gamesPlayed: 0, totalAtBats: 0, totalHits: 0, totalHomeRuns: 0, totalRbis: 0 },
      pitching: { era: 0, gamesPlayed: 0, totalInningsPitched: 0, totalStrikeouts: 0, totalEarnedRuns: 0 },
      fielding: { fieldingPct: 0, totalPutouts: 0, totalAssists: 0, totalErrors: 0 },
    },
    followersCount: 890,
    followingCount: 320,
    postsCount: 56,
    isPublic: true,
    createdAt: Timestamp.now(),
    updatedAt: Timestamp.now(),
  },
  'mock-user-002': {
    uid: 'mock-user-002',
    email: 'sato@example.com',
    displayName: '佐藤 健太',
    photoURL: null,
    username: null,
    role: 'player',
    position: 'ショート',
    team: '東京ブルースターズ',
    age: 24,
    throwHand: 'right',
    batHand: 'right',
    bio: '守備範囲の広さが自慢です。',
    stats: {
      batting: { avg: 0.325, gamesPlayed: 50, totalAtBats: 200, totalHits: 65, totalHomeRuns: 8, totalRbis: 35 },
      pitching: { era: 0, gamesPlayed: 0, totalInningsPitched: 0, totalStrikeouts: 0, totalEarnedRuns: 0 },
      fielding: { fieldingPct: 0.982, totalPutouts: 95, totalAssists: 180, totalErrors: 5 },
    },
    followersCount: 256,
    followingCount: 120,
    postsCount: 45,
    isPublic: true,
    createdAt: Timestamp.now(),
    updatedAt: Timestamp.now(),
  },
};

const MOCK_CONVERSATIONS: (Conversation & { otherUser: User })[] = [
  {
    id: 'conv-001',
    participants: [CURRENT_USER_ID, 'mock-scout-001'],
    lastMessage: '練習を見学させていただけますか？',
    lastMessageAt: Timestamp.now(),
    otherUser: MOCK_OTHER_USERS['mock-scout-001'],
  },
  {
    id: 'conv-002',
    participants: [CURRENT_USER_ID, 'mock-user-002'],
    lastMessage: '明日の練習試合、スタメンで頑張ろう！',
    lastMessageAt: Timestamp.now(),
    otherUser: MOCK_OTHER_USERS['mock-user-002'],
  },
];

const MOCK_CHAT_MESSAGES: Record<string, Message[]> = {
  'conv-001': [
    {
      id: 'msg-001',
      senderId: 'mock-scout-001',
      content: 'はじめまして、渡辺と申します。先日の試合を拝見しました。',
      createdAt: Timestamp.now(),
      readBy: [CURRENT_USER_ID, 'mock-scout-001'],
    },
    {
      id: 'msg-002',
      senderId: CURRENT_USER_ID,
      content: 'ありがとうございます！嬉しいです。',
      createdAt: Timestamp.now(),
      readBy: [CURRENT_USER_ID],
    },
    {
      id: 'msg-003',
      senderId: 'mock-scout-001',
      content: '練習を見学させていただけますか？',
      createdAt: Timestamp.now(),
      readBy: ['mock-scout-001'],
    },
  ],
  'conv-002': [
    {
      id: 'msg-004',
      senderId: 'mock-user-002',
      content: '来週の練習試合の打順、相談したいんだけど。',
      createdAt: Timestamp.now(),
      readBy: [CURRENT_USER_ID, 'mock-user-002'],
    },
    {
      id: 'msg-005',
      senderId: CURRENT_USER_ID,
      content: 'いいよ！何番がいい？',
      createdAt: Timestamp.now(),
      readBy: [CURRENT_USER_ID],
    },
    {
      id: 'msg-006',
      senderId: 'mock-user-002',
      content: '明日の練習試合、スタメンで頑張ろう！',
      createdAt: Timestamp.now(),
      readBy: ['mock-user-002'],
    },
  ],
};

export function useConversations(): {
  conversations: (Conversation & { otherUser: User })[];
  loading: boolean;
  refresh: () => Promise<void>;
} {
  const [conversations, setConversations] = useState<(Conversation & { otherUser: User })[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // TODO: Replace with Firestore real-time listener
    const timer = setTimeout(() => {
      setConversations(MOCK_CONVERSATIONS);
      setLoading(false);
    }, 300);
    return () => clearTimeout(timer);
  }, []);

  const refresh = useCallback(async () => {
    setLoading(true);
    // TODO: Replace with Firestore query
    await new Promise((resolve) => setTimeout(resolve, 300));
    setConversations([...MOCK_CONVERSATIONS]);
    setLoading(false);
  }, []);

  return { conversations, loading, refresh };
}

export function useChat(conversationId: string): {
  messages: Message[];
  loading: boolean;
  sendMessage: (content: string) => Promise<void>;
  canMessage: boolean;
} {
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // TODO: Replace with Firestore real-time listener
    const timer = setTimeout(() => {
      setMessages(MOCK_CHAT_MESSAGES[conversationId] ?? []);
      setLoading(false);
    }, 300);
    return () => clearTimeout(timer);
  }, [conversationId]);

  const sendMessage = useCallback(async (content: string) => {
    const newMessage: Message = {
      id: 'msg-' + Date.now(),
      senderId: CURRENT_USER_ID,
      content,
      createdAt: Timestamp.now(),
      readBy: [CURRENT_USER_ID],
    };
    // Optimistic update
    setMessages((prev) => [...prev, newMessage]);
    // TODO: Replace with Firestore write
    await new Promise((resolve) => setTimeout(resolve, 100));
  }, [conversationId]);

  // In real app, check if users follow each other for DM permission
  const canMessage = true;

  return { messages, loading, sendMessage, canMessage };
}
