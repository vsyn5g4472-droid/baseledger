import { useState, useCallback, useEffect, useMemo } from 'react';
import { Timestamp } from 'firebase/firestore';
import { Notification } from '../models/types';

const MOCK_NOTIFICATIONS: Notification[] = [
  {
    id: 'notif-001',
    userId: 'mock-user-001',
    type: 'follow',
    fromUserId: 'mock-user-004',
    data: {},
    read: false,
    createdAt: Timestamp.now(),
  },
  {
    id: 'notif-002',
    userId: 'mock-user-001',
    type: 'like',
    fromUserId: 'mock-user-002',
    data: { postId: 'post-001' },
    read: false,
    createdAt: Timestamp.now(),
  },
  {
    id: 'notif-003',
    userId: 'mock-user-001',
    type: 'comment',
    fromUserId: 'mock-user-005',
    data: { postId: 'post-001', message: '素晴らしい投球ですね！' },
    read: false,
    createdAt: Timestamp.now(),
  },
  {
    id: 'notif-004',
    userId: 'mock-user-001',
    type: 'teamInvite',
    fromUserId: 'mock-user-004',
    data: { teamId: 'team-002', message: '大阪レッドウィングスに参加しませんか？' },
    read: true,
    createdAt: Timestamp.now(),
  },
  {
    id: 'notif-005',
    userId: 'mock-user-001',
    type: 'aiReport',
    fromUserId: null,
    data: { message: 'あなたの今月のパフォーマンスレポートが準備できました。', scoreId: 'score-001' },
    read: true,
    createdAt: Timestamp.now(),
  },
  {
    id: 'notif-006',
    userId: 'mock-user-001',
    type: 'dm',
    fromUserId: 'mock-scout-001',
    data: { conversationId: 'conv-001', message: '練習を見学させていただけますか？' },
    read: false,
    createdAt: Timestamp.now(),
  },
];

export function useNotifications(): {
  notifications: Notification[];
  unreadCount: number;
  loading: boolean;
  markAsRead: (notificationId: string) => Promise<void>;
  markAllAsRead: () => Promise<void>;
  refresh: () => Promise<void>;
} {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // TODO: Replace with Firestore real-time listener
    const timer = setTimeout(() => {
      setNotifications(MOCK_NOTIFICATIONS);
      setLoading(false);
    }, 300);
    return () => clearTimeout(timer);
  }, []);

  const unreadCount = useMemo(
    () => notifications.filter((n) => !n.read).length,
    [notifications],
  );

  const markAsRead = useCallback(async (notificationId: string) => {
    // Optimistic update
    setNotifications((prev) =>
      prev.map((n) => (n.id === notificationId ? { ...n, read: true } : n)),
    );
    // TODO: Replace with Firestore update
    await new Promise((resolve) => setTimeout(resolve, 100));
  }, []);

  const markAllAsRead = useCallback(async () => {
    // Optimistic update
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    // TODO: Replace with Firestore batch update
    await new Promise((resolve) => setTimeout(resolve, 200));
  }, []);

  const refresh = useCallback(async () => {
    setLoading(true);
    // TODO: Replace with Firestore query
    await new Promise((resolve) => setTimeout(resolve, 300));
    setNotifications([...MOCK_NOTIFICATIONS]);
    setLoading(false);
  }, []);

  return { notifications, unreadCount, loading, markAsRead, markAllAsRead, refresh };
}
