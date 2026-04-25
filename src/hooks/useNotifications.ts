import { useState, useCallback, useEffect, useMemo } from 'react';
import { Notification } from '../models/types';
import { useAuth } from '../contexts/AuthContext';
import {
  onNotificationsUpdate,
  markAsRead as serviceMarkAsRead,
  markAllAsRead as serviceMarkAllAsRead,
  getNotifications,
} from '../services/notificationService';

export function useNotifications(): {
  notifications: Notification[];
  unreadCount: number;
  loading: boolean;
  markAsRead: (notificationId: string) => Promise<void>;
  markAllAsRead: () => Promise<void>;
  refresh: () => Promise<void>;
} {
  const { currentUser } = useAuth();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!currentUser) {
      setNotifications([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    const unsubscribe = onNotificationsUpdate(currentUser.uid, (updated) => {
      setNotifications(updated);
      setLoading(false);
    });

    return unsubscribe;
  }, [currentUser]);

  const unreadCount = useMemo(
    () => notifications.filter((n) => !n.read).length,
    [notifications],
  );

  const markAsRead = useCallback(
    async (notificationId: string) => {
      setNotifications((prev) =>
        prev.map((n) => (n.id === notificationId ? { ...n, read: true } : n)),
      );
      try {
        await serviceMarkAsRead(notificationId);
      } catch (error) {
        if (__DEV__) console.error('Failed to mark notification as read:', error);
      }
    },
    [],
  );

  const markAllAsRead = useCallback(async () => {
    if (!currentUser) return;
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    try {
      await serviceMarkAllAsRead(currentUser.uid);
    } catch (error) {
      if (__DEV__) console.error('Failed to mark all as read:', error);
    }
  }, [currentUser]);

  const refresh = useCallback(async () => {
    if (!currentUser) return;
    setLoading(true);
    try {
      const result = await getNotifications(currentUser.uid);
      setNotifications(result.items);
    } catch (error) {
      if (__DEV__) console.error('Failed to refresh notifications:', error);
    } finally {
      setLoading(false);
    }
  }, [currentUser]);

  return { notifications, unreadCount, loading, markAsRead, markAllAsRead, refresh };
}
