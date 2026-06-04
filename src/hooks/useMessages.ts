import { useState, useCallback, useEffect, useRef } from 'react';
import { Timestamp } from 'firebase/firestore';
import { useAuth } from '../contexts/AuthContext';
import { Conversation, Message, User } from '../models/types';
import {
  onConversationsUpdate,
  onMessagesUpdate,
  sendDirectMessage,
} from '../services/messageService';
import { getFirestoreUser } from '../services/auth/userAuthService';
import { UserPlan } from '../services/planService';

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Minimal placeholder when a user profile cannot be fetched. */
function makePlaceholderUser(uid: string): User {
  const now = Timestamp.now();
  return {
    uid,
    plan: UserPlan.FREE,
    email: '',
    displayName: uid,
    photoURL: null,
    username: null,
    role: 'player',
    position: null,
    team: null,
    age: null,
    throwHand: null,
    batHand: null,
    bio: '',
    stats: {
      batting: { avg: 0, gamesPlayed: 0, totalAtBats: 0, totalHits: 0, totalHomeRuns: 0, totalRbis: 0 },
      pitching: { era: 0, gamesPlayed: 0, totalInningsPitched: 0, totalStrikeouts: 0, totalEarnedRuns: 0 },
      fielding: { fieldingPct: 0, totalPutouts: 0, totalAssists: 0, totalErrors: 0 },
    },
    followersCount: 0,
    followingCount: 0,
    postsCount: 0,
    isPublic: true,
    createdAt: now,
    updatedAt: now,
  };
}

// ─── Hooks ────────────────────────────────────────────────────────────────────

/**
 * Real-time list of DM conversations the current user participates in,
 * enriched with the other user's profile.
 */
export function useConversations(): {
  conversations: (Conversation & { otherUser: User })[];
  loading: boolean;
  refresh: () => Promise<void>;
} {
  const { currentUser } = useAuth();
  const [conversations, setConversations] = useState<(Conversation & { otherUser: User })[]>([]);
  const [loading, setLoading] = useState(true);
  // Cache user profiles to avoid redundant Firestore reads
  const profileCache = useRef<Record<string, User>>({});

  const enrichAndSet = useCallback(
    async (rawConvos: Conversation[]) => {
      if (rawConvos.length === 0) {
        setConversations([]);
        setLoading(false);
        return;
      }
      const enriched = await Promise.all(
        rawConvos.map(async (convo) => {
          const otherId = convo.participants.find((id) => id !== currentUser?.uid) ?? '';
          if (!profileCache.current[otherId]) {
            const profile = await getFirestoreUser(otherId).catch(() => null);
            profileCache.current[otherId] = profile ?? makePlaceholderUser(otherId);
          }
          return { ...convo, otherUser: profileCache.current[otherId] };
        }),
      );
      setConversations(enriched);
      setLoading(false);
    },
    [currentUser?.uid],
  );

  useEffect(() => {
    if (!currentUser?.uid) {
      setConversations([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const unsubscribe = onConversationsUpdate(
      currentUser.uid,
      (rawConvos) => { enrichAndSet(rawConvos); },
      () => setLoading(false),
    );
    return unsubscribe;
  }, [currentUser?.uid, enrichAndSet]);

  // Real-time listener handles updates; refresh is a no-op placeholder.
  const refresh = useCallback(async () => {}, []);

  return { conversations, loading, refresh };
}

/**
 * Real-time messages for a DM conversation, plus send helper.
 * The conversationId format is "{uid1}_{uid2}" (alphabetically sorted).
 */
export function useChat(conversationId: string, recipientId: string): {
  messages: Message[];
  loading: boolean;
  sendMessage: (content: string) => Promise<void>;
  canMessage: boolean;
} {
  const { currentUser } = useAuth();
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!conversationId || conversationId === '__none__') {
      setMessages([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const unsubscribe = onMessagesUpdate(
      conversationId,
      (updatedMessages) => {
        setMessages(updatedMessages);
        setLoading(false);
      },
      () => setLoading(false),
    );
    return unsubscribe;
  }, [conversationId]);

  const sendMessage = useCallback(async (content: string) => {
    if (!currentUser?.uid || !conversationId || conversationId === '__none__') return;
    await sendDirectMessage(conversationId, currentUser.uid, recipientId, content);
  }, [conversationId, currentUser?.uid, recipientId]);

  return { messages, loading, sendMessage, canMessage: true };
}
