import { useState, useCallback, useEffect } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db, COLLECTIONS } from '../services/firebase';
import { useAuth } from '../contexts/AuthContext';
import { Group, GroupMessage } from '../models/types';
import {
  onUserGroupsUpdate,
  onGroupMessagesUpdate,
  sendGroupMessage,
  getGroupsForUser,
} from '../services/groupService';

/**
 * Real-time list of groups the current user belongs to.
 */
export function useGroups(): {
  groups: Group[];
  loading: boolean;
  refresh: () => Promise<void>;
} {
  const { currentUser } = useAuth();
  const [groups, setGroups] = useState<Group[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!currentUser?.uid) {
      setGroups([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const unsubscribe = onUserGroupsUpdate(
      currentUser.uid,
      (updatedGroups) => {
        setGroups(updatedGroups);
        setLoading(false);
      },
      () => setLoading(false),
    );
    return unsubscribe;
  }, [currentUser?.uid]);

  const refresh = useCallback(async () => {
    if (!currentUser?.uid) return;
    setLoading(true);
    try {
      const fresh = await getGroupsForUser(currentUser.uid);
      setGroups(fresh);
    } finally {
      setLoading(false);
    }
  }, [currentUser?.uid]);

  return { groups, loading, refresh };
}

/**
 * Real-time messages for a group, plus send helpers.
 */
export function useGroupMessages(groupId: string): {
  messages: GroupMessage[];
  loading: boolean;
  currentUserId: string;
  sendMessage: (content: string) => Promise<void>;
  sendSchedule: (date: string, content: string) => Promise<void>;
} {
  const { currentUser } = useAuth();
  const [messages, setMessages] = useState<GroupMessage[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!groupId || groupId === '__none__') {
      setMessages([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const unsubscribe = onGroupMessagesUpdate(
      groupId,
      (updatedMessages) => {
        setMessages(updatedMessages);
        setLoading(false);
      },
      () => setLoading(false),
    );
    return unsubscribe;
  }, [groupId]);

  const sendMessage = useCallback(async (content: string) => {
    if (!currentUser?.uid || !groupId || groupId === '__none__') return;
    await sendGroupMessage(
      groupId,
      currentUser.uid,
      currentUser.displayName ?? 'ユーザー',
      content,
      'text',
    );
  }, [groupId, currentUser]);

  const sendSchedule = useCallback(async (date: string, content: string) => {
    if (!currentUser?.uid || !groupId || groupId === '__none__') return;
    await sendGroupMessage(
      groupId,
      currentUser.uid,
      currentUser.displayName ?? 'ユーザー',
      content,
      'schedule',
      { scheduleDate: date },
    );
  }, [groupId, currentUser]);

  return {
    messages,
    loading,
    currentUserId: currentUser?.uid ?? '',
    sendMessage,
    sendSchedule,
  };
}

/**
 * Real-time single group document by ID.
 */
export function useGroup(groupId: string): { group: Group | null; loading: boolean } {
  const [group, setGroup] = useState<Group | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!groupId || groupId === '__none__') {
      setGroup(null);
      setLoading(false);
      return;
    }
    const groupRef = doc(db, COLLECTIONS.GROUPS, groupId);
    const unsubscribe = onSnapshot(
      groupRef,
      (snap) => {
        setGroup(snap.exists() ? ({ id: snap.id, ...snap.data() } as Group) : null);
        setLoading(false);
      },
      () => setLoading(false),
    );
    return unsubscribe;
  }, [groupId]);

  return { group, loading };
}
