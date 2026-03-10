import { useState, useCallback, useEffect } from 'react';
import { Timestamp } from 'firebase/firestore';
import { Team, TeamMember, User, Message, CreateTeamInput } from '../models/types';

const MOCK_TEAMS: Team[] = [
  {
    id: 'team-001',
    name: '東京ブルースターズ',
    description: '東京を拠点に活動する社会人野球チーム。週3回の練習と月2回の試合を行っています。',
    photoURL: null,    ownerId: 'mock-user-003',
    memberIds: ['mock-user-001', 'mock-user-002', 'mock-user-003'],
    inviteCode: 'BLUE2024',
    isPrivate: false,
    createdAt: Timestamp.now(),
  },
  {
    id: 'team-002',
    name: '大阪レッドウィングス',
    description: '大阪の草野球チーム。初心者歓迎、楽しく真剣に野球をしています。',
    photoURL: null,    ownerId: 'mock-user-004',
    memberIds: ['mock-user-004', 'mock-user-005'],
    inviteCode: 'REDW2024',
    isPrivate: false,
    createdAt: Timestamp.now(),
  },
];

const MOCK_MEMBERS: Record<string, (TeamMember & { user: User })[]> = {
  'team-001': [
    {
      userId: 'mock-user-003',
      role: 'owner',
      joinedAt: Timestamp.now(),
      user: {
        uid: 'mock-user-003',
        email: 'suzuki@example.com',
        displayName: '鈴木 大輔',
        photoURL: null,
        username: null,
        role: 'coach',
        position: null,
        team: '東京ブルースターズ',
        age: 38,
        throwHand: 'right',
        batHand: 'right',
        bio: 'プロ10年の経験を活かして指導しています。',
        stats: {
          batting: { avg: 0, gamesPlayed: 0, totalAtBats: 0, totalHits: 0, totalHomeRuns: 0, totalRbis: 0 },
          pitching: { era: 0, gamesPlayed: 0, totalInningsPitched: 0, totalStrikeouts: 0, totalEarnedRuns: 0 },
          fielding: { fieldingPct: 0, totalPutouts: 0, totalAssists: 0, totalErrors: 0 },
        },
        followersCount: 512,
        followingCount: 45,
        postsCount: 30,
        isPublic: true,
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
      },
    },
    {
      userId: 'mock-user-001',
      role: 'member',
      joinedAt: Timestamp.now(),
      user: {
        uid: 'mock-user-001',
        email: 'tanaka@example.com',
        displayName: '田中 翔太',
        photoURL: null,
        username: null,
        role: 'player',
        position: 'ピッチャー',
        team: '東京ブルースターズ',
        age: 22,
        throwHand: 'right',
        batHand: 'left',
        bio: '大学野球出身。150km/hの直球とスライダーが武器。',
        stats: {
          batting: { avg: 0.275, gamesPlayed: 45, totalAtBats: 160, totalHits: 44, totalHomeRuns: 3, totalRbis: 18 },
          pitching: { era: 2.85, gamesPlayed: 20, totalInningsPitched: 120, totalStrikeouts: 98, totalEarnedRuns: 38 },
          fielding: { fieldingPct: 0.975, totalPutouts: 12, totalAssists: 28, totalErrors: 1 },
        },
        followersCount: 128,
        followingCount: 64,
        postsCount: 23,
        isPublic: true,
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
      },
    },
    {
      userId: 'mock-user-002',
      role: 'admin',
      joinedAt: Timestamp.now(),
      user: {
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
    },
  ],
};

const MOCK_TEAM_MESSAGES: Message[] = [
  {
    id: 'tmsg-001',
    senderId: 'mock-user-003',
    content: '明日の練習は9時からです。グラウンドBを使います。',
    createdAt: Timestamp.now(),
    readBy: ['mock-user-003', 'mock-user-001'],
  },
  {
    id: 'tmsg-002',
    senderId: 'mock-user-001',
    content: '了解です！新しいピッチングフォームを試したいので、早めに行きます。',
    createdAt: Timestamp.now(),
    readBy: ['mock-user-001'],
  },
  {
    id: 'tmsg-003',
    senderId: 'mock-user-002',
    content: 'バッティングケージも使えますか？',
    createdAt: Timestamp.now(),
    readBy: ['mock-user-002'],
  },
];

const CURRENT_USER_ID = 'mock-user-001';

export function useTeams(): {
  teams: Team[];
  loading: boolean;
  refresh: () => Promise<void>;
  createTeam: (input: CreateTeamInput) => Promise<string>;
  joinByCode: (code: string) => Promise<void>;
} {
  const [teams, setTeams] = useState<Team[]>(MOCK_TEAMS);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    // TODO: Replace with Firestore query
    await new Promise((resolve) => setTimeout(resolve, 300));
    setTeams([...MOCK_TEAMS]);
    setLoading(false);
  }, []);

  const createTeam = useCallback(async (input: CreateTeamInput): Promise<string> => {
    // TODO: Replace with Firestore write
    await new Promise((resolve) => setTimeout(resolve, 300));
    const newTeamId = 'team-' + Date.now();
    const newTeam: Team = {
      id: newTeamId,
      name: input.name,
      description: input.description,
      photoURL: null,      ownerId: CURRENT_USER_ID,
      memberIds: [CURRENT_USER_ID],
      inviteCode: Math.random().toString(36).substring(2, 8).toUpperCase(),
      isPrivate: input.isPrivate,
      createdAt: Timestamp.now(),
    };
    setTeams((prev) => [...prev, newTeam]);
    return newTeamId;
  }, []);

  const joinByCode = useCallback(async (code: string) => {
    // TODO: Replace with Firestore query + update
    await new Promise((resolve) => setTimeout(resolve, 300));
    const team = MOCK_TEAMS.find((t) => t.inviteCode === code);
    if (!team) {
      throw new Error('無効な招待コードです');
    }
    console.log('Joined team:', team.name);
  }, []);

  return { teams, loading, refresh, createTeam, joinByCode };
}

export function useTeamDetail(teamId: string): {
  team: Team | null;
  members: (TeamMember & { user: User })[];
  loading: boolean;
  isOwner: boolean;
  isAdmin: boolean;
} {
  const [team, setTeam] = useState<Team | null>(null);
  const [members, setMembers] = useState<(TeamMember & { user: User })[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // TODO: Replace with Firestore query
    const timer = setTimeout(() => {
      const foundTeam = MOCK_TEAMS.find((t) => t.id === teamId) ?? null;
      setTeam(foundTeam);
      setMembers(MOCK_MEMBERS[teamId] ?? []);
      setLoading(false);
    }, 300);
    return () => clearTimeout(timer);
  }, [teamId]);

  const isOwner = team?.ownerId === CURRENT_USER_ID;
  const isAdmin = isOwner || members.some(
    (m) => m.userId === CURRENT_USER_ID && (m.role === 'admin' || m.role === 'owner'),
  );

  return { team, members, loading, isOwner, isAdmin };
}

export function useTeamChat(teamId: string): {
  messages: Message[];
  loading: boolean;
  sendMessage: (content: string) => Promise<void>;
} {
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // TODO: Replace with Firestore real-time listener
    const timer = setTimeout(() => {
      setMessages(MOCK_TEAM_MESSAGES);
      setLoading(false);
    }, 300);
    return () => clearTimeout(timer);
  }, [teamId]);

  const sendMessage = useCallback(async (content: string) => {
    const newMessage: Message = {
      id: 'tmsg-' + Date.now(),
      senderId: CURRENT_USER_ID,
      content,
      createdAt: Timestamp.now(),
      readBy: [CURRENT_USER_ID],
    };
    // Optimistic update
    setMessages((prev) => [...prev, newMessage]);
    // TODO: Replace with Firestore write
    await new Promise((resolve) => setTimeout(resolve, 100));
  }, []);

  return { messages, loading, sendMessage };
}
