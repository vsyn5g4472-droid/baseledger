import { useState, useCallback, useEffect } from 'react';
import {
  onSnapshot,
  collection,
  query,
  where,
  orderBy,
} from 'firebase/firestore';
import { db, COLLECTIONS } from '../services/firebase';
import { Team, TeamMember, User, CreateTeamInput, GroupMessage } from '../models/types';
import { useAuth } from '../contexts/AuthContext';
import {
  createTeam as serviceCreateTeam,
  joinTeamByCode,
  getTeam,
  getTeamMembers,
} from '../services/teamService';
import {
  getOrCreateTeamGroup,
  sendGroupMessage,
} from '../services/groupService';

export function useTeams(): {
  teams: Team[];
  loading: boolean;
  refresh: () => Promise<void>;
  createTeam: (input: CreateTeamInput) => Promise<string>;
  joinByCode: (code: string) => Promise<void>;
} {
  const { currentUser } = useAuth();
  const [teams, setTeams] = useState<Team[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!currentUser) {
      setTeams([]);
      setLoading(false);
      return;
    }
    const q = query(
      collection(db, COLLECTIONS.TEAMS),
      where('memberIds', 'array-contains', currentUser.uid),
    );
    const unsubscribe = onSnapshot(
      q,
      (snap) => {
        setTeams(snap.docs.map((d) => ({ id: d.id, ...d.data() })) as Team[]);
        setLoading(false);
      },
      (error) => {
        if (__DEV__) console.error('[useTeams] snapshot error:', error);
        setLoading(false);
      },
    );
    return unsubscribe;
  }, [currentUser]);

  const refresh = useCallback(async () => {
    // onSnapshot がリアルタイムで同期するため手動再取得は不要
  }, []);

  const createTeam = useCallback(
    async (input: CreateTeamInput): Promise<string> => {
      if (!currentUser) throw new Error('Not authenticated');
      try {
        const team = await serviceCreateTeam(currentUser.uid, input);
        return team.id;
      } catch (error) {
        if (__DEV__) console.error('Failed to create team:', error);
        throw error;
      }
    },
    [currentUser],
  );

  const joinByCode = useCallback(
    async (code: string) => {
      if (!currentUser) throw new Error('Not authenticated');
      try {
        await joinTeamByCode(currentUser.uid, code);
      } catch (error) {
        if (__DEV__) console.error('Failed to join team:', error);
        throw error;
      }
    },
    [currentUser],
  );

  return { teams, loading, refresh, createTeam, joinByCode };
}

export function useTeamDetail(teamId: string): {
  team: Team | null;
  members: (TeamMember & { user: User })[];
  loading: boolean;
  isOwner: boolean;
  isAdmin: boolean;
} {
  const { currentUser } = useAuth();
  const [team, setTeam] = useState<Team | null>(null);
  const [members, setMembers] = useState<(TeamMember & { user: User })[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const [teamData, membersData] = await Promise.all([
          getTeam(teamId),
          getTeamMembers(teamId),
        ]);
        if (!cancelled) {
          setTeam(teamData);
          setMembers(membersData);
        }
      } catch (error) {
        if (__DEV__) console.error('Failed to fetch team detail:', error);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [teamId]);

  const isOwner = team?.ownerId === currentUser?.uid;
  const isAdmin =
    isOwner ||
    members.some(
      (m) =>
        m.userId === currentUser?.uid &&
        (m.role === 'admin' || m.role === 'owner'),
    );

  return { team, members, loading, isOwner, isAdmin };
}

export function useTeamChat(teamId: string): {
  messages: GroupMessage[];
  loading: boolean;
  sendMessage: (content: string) => Promise<void>;
} {
  const { currentUser } = useAuth();
  const [messages, setMessages] = useState<GroupMessage[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!currentUser) {
      setLoading(false);
      return;
    }

    let unsubscribe: (() => void) | null = null;

    (async () => {
      try {
        const groupsRef = collection(db, COLLECTIONS.GROUPS);
        const q = query(groupsRef, where('teamId', '==', teamId));
        const { getDocs } = await import('firebase/firestore');
        const snap = await getDocs(q);

        if (snap.empty) {
          setLoading(false);
          return;
        }

        const groupId = snap.docs[0].id;
        const messagesRef = collection(
          db,
          COLLECTIONS.GROUPS,
          groupId,
          COLLECTIONS.GROUP_MESSAGES,
        );
        const messagesQuery = query(
          messagesRef,
          orderBy('createdAt', 'asc'),
        );

        unsubscribe = onSnapshot(messagesQuery, (msgSnap) => {
          const msgs = msgSnap.docs.map((d) => ({
            id: d.id,
            ...d.data(),
          })) as GroupMessage[];
          setMessages(msgs);
          setLoading(false);
        });
      } catch (error) {
        if (__DEV__) console.error('Failed to set up team chat listener:', error);
        setLoading(false);
      }
    })();

    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, [teamId, currentUser]);

  const sendMessage = useCallback(
    async (content: string) => {
      if (!currentUser) throw new Error('Not authenticated');
      try {
        const group = await getOrCreateTeamGroup(
          teamId,
          currentUser.displayName ?? '',
          [currentUser.uid],
        );
        await sendGroupMessage(
          group.id,
          currentUser.uid,
          currentUser.displayName,
          content,
        );
      } catch (error) {
        if (__DEV__) console.error('Failed to send team message:', error);
        throw error;
      }
    },
    [currentUser, teamId],
  );

  return { messages, loading, sendMessage };
}
