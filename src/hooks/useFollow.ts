import { useState, useCallback, useEffect, useRef } from 'react';
import { Timestamp } from 'firebase/firestore';
import { User } from '../models/types';

// Mock user data for follower/following lists
const MOCK_USERS: User[] = [
  {
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
  {
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
  {
    uid: 'mock-user-004',
    email: 'yamamoto@example.com',
    displayName: '山本 誠',
    photoURL: null,
    username: null,
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
  {
    uid: 'mock-user-005',
    email: 'nakamura@example.com',
    displayName: '中村 拓也',
    photoURL: null,
    username: null,
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
  {
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
];

// Track follow state in module scope for optimistic updates
const followingSet = new Set<string>(['mock-user-002', 'mock-user-003']);
const mutualSet = new Set<string>(['mock-user-002']);

export function useFollow(targetUserId: string): {
  isFollowing: boolean;
  isMutual: boolean;
  loading: boolean;
  toggleFollow: () => Promise<void>;
} {
  const [isFollowing, setIsFollowing] = useState(followingSet.has(targetUserId));
  const [isMutual, setIsMutual] = useState(mutualSet.has(targetUserId));
  const [loading, setLoading] = useState(false);

  const toggleFollow = useCallback(async () => {
    setLoading(true);
    // Optimistic update
    const wasFollowing = isFollowing;
    setIsFollowing(!wasFollowing);

    if (wasFollowing) {
      followingSet.delete(targetUserId);
      setIsMutual(false);
    } else {
      followingSet.add(targetUserId);
      if (mutualSet.has(targetUserId)) {
        setIsMutual(true);
      }
    }

    // TODO: Replace with Firestore write
    await new Promise((resolve) => setTimeout(resolve, 200));
    setLoading(false);
  }, [isFollowing, targetUserId]);

  return { isFollowing, isMutual, loading, toggleFollow };
}

export function useFollowers(userId: string): {
  followers: User[];
  loading: boolean;
  loadMore: () => Promise<void>;
  hasMore: boolean;
} {
  const [followers, setFollowers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasMore, setHasMore] = useState(false);

  useEffect(() => {
    // TODO: Replace with Firestore query
    const timer = setTimeout(() => {
      setFollowers(MOCK_USERS.slice(0, 3));
      setLoading(false);
      setHasMore(true);
    }, 300);
    return () => clearTimeout(timer);
  }, [userId]);

  const loadMore = useCallback(async () => {
    if (loading || !hasMore) return;
    setLoading(true);
    await new Promise((resolve) => setTimeout(resolve, 300));
    setFollowers((prev) => [...prev, ...MOCK_USERS.slice(3)]);
    setHasMore(false);
    setLoading(false);
  }, [loading, hasMore]);

  return { followers, loading, loadMore, hasMore };
}

export function useFollowing(userId: string): {
  following: User[];
  loading: boolean;
  loadMore: () => Promise<void>;
  hasMore: boolean;
} {
  const [following, setFollowing] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasMore, setHasMore] = useState(false);

  useEffect(() => {
    // TODO: Replace with Firestore query
    const timer = setTimeout(() => {
      setFollowing(MOCK_USERS.slice(0, 2));
      setLoading(false);
      setHasMore(true);
    }, 300);
    return () => clearTimeout(timer);
  }, [userId]);

  const loadMore = useCallback(async () => {
    if (loading || !hasMore) return;
    setLoading(true);
    await new Promise((resolve) => setTimeout(resolve, 300));
    setFollowing((prev) => [...prev, ...MOCK_USERS.slice(2, 4)]);
    setHasMore(false);
    setLoading(false);
  }, [loading, hasMore]);

  return { following, loading, loadMore, hasMore };
}
