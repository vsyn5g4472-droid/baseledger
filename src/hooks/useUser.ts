import { useState, useEffect } from 'react';
import { Timestamp } from 'firebase/firestore';
import { User } from '../models/types';
import { getUser } from '../services/userService';
import { useAuth } from '../contexts/AuthContext';

// All mock users covering every authorId used in the feed mock data
const ALL_MOCK_USERS: Record<string, User> = {
  'mock-user-001': {
    uid: 'mock-user-001',
    email: 'tanaka@example.com',
    displayName: '田中 翔太',
    photoURL: null,
    username: 'tanaka_shota',
    role: 'player',
    position: 'ピッチャー',
    team: '東京ブルースターズ',
    age: 22,
    throwHand: 'right',
    batHand: 'right',
    bio: '最速152km/hを記録した右腕。プロを目指して毎日練習中。',
    stats: {
      batting: { avg: 0.140, gamesPlayed: 28, totalAtBats: 50, totalHits: 7, totalHomeRuns: 0, totalRbis: 3 },
      pitching: { era: 2.45, gamesPlayed: 20, totalInningsPitched: 110, totalStrikeouts: 88, totalEarnedRuns: 30 },
      fielding: { fieldingPct: 0.970, totalPutouts: 10, totalAssists: 18, totalErrors: 1 },
    },
    followersCount: 215,
    followingCount: 64,
    postsCount: 12,
    isPublic: true,
    createdAt: Timestamp.now(),
    updatedAt: Timestamp.now(),
  },
  'mock-user-002': {
    uid: 'mock-user-002',
    email: 'sato@example.com',
    displayName: '佐藤 健太',
    photoURL: null,
    username: 'sato_kenta',
    role: 'player',
    position: 'ショート',
    team: '東京ブルースターズ',
    age: 24,
    throwHand: 'right',
    batHand: 'right',
    bio: '守備範囲の広さが自慢です。打率.320を目指して日々精進。',
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
  'mock-user-003': {
    uid: 'mock-user-003',
    email: 'suzuki@example.com',
    displayName: '鈴木 大輔',
    photoURL: null,
    username: 'suzuki_coach',
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
  'mock-user-004': {
    uid: 'mock-user-004',
    email: 'yamamoto@example.com',
    displayName: '山本 誠',
    photoURL: null,
    username: 'yamamoto_makoto',
    role: 'player',
    position: 'センター',
    team: '大阪レッドウィングス',
    age: 20,
    throwHand: 'right',
    batHand: 'left',
    bio: '俊足と強肩が武器の外野手。',
    stats: {
      batting: { avg: 0.290, gamesPlayed: 40, totalAtBats: 155, totalHits: 45, totalHomeRuns: 5, totalRbis: 22 },
      pitching: { era: 0, gamesPlayed: 0, totalInningsPitched: 0, totalStrikeouts: 0, totalEarnedRuns: 0 },
      fielding: { fieldingPct: 0.990, totalPutouts: 110, totalAssists: 5, totalErrors: 1 },
    },
    followersCount: 180,
    followingCount: 90,
    postsCount: 18,
    isPublic: true,
    createdAt: Timestamp.now(),
    updatedAt: Timestamp.now(),
  },
  'mock-user-005': {
    uid: 'mock-user-005',
    email: 'nakamura@example.com',
    displayName: '中村 拓也',
    photoURL: null,
    username: 'nakamura_takuya',
    role: 'player',
    position: 'ピッチャー',
    team: '大阪レッドウィングス',
    age: 25,
    throwHand: 'left',
    batHand: 'left',
    bio: '左腕のエース。変化球が得意。',
    stats: {
      batting: { avg: 0.150, gamesPlayed: 20, totalAtBats: 40, totalHits: 6, totalHomeRuns: 0, totalRbis: 2 },
      pitching: { era: 2.10, gamesPlayed: 25, totalInningsPitched: 145, totalStrikeouts: 132, totalEarnedRuns: 34 },
      fielding: { fieldingPct: 0.960, totalPutouts: 8, totalAssists: 16, totalErrors: 1 },
    },
    followersCount: 340,
    followingCount: 75,
    postsCount: 28,
    isPublic: true,
    createdAt: Timestamp.now(),
    updatedAt: Timestamp.now(),
  },
};

export function useUser(userId: string): { user: User | null; loading: boolean } {
  const { currentUser } = useAuth();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userId) {
      setLoading(false);
      return;
    }

    // If viewing the current user's own profile
    if (currentUser && currentUser.uid === userId) {
      setUser(currentUser as unknown as User);
      setLoading(false);
      return;
    }

    // Check mock data first
    if (ALL_MOCK_USERS[userId]) {
      setUser(ALL_MOCK_USERS[userId]);
      setLoading(false);
      return;
    }

    // Fallback: fetch from Firestore
    setLoading(true);
    getUser(userId)
      .then((u) => setUser(u))
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
  }, [userId, currentUser]);

  return { user, loading };
}
