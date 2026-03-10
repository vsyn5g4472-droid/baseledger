import { useState, useCallback, useEffect } from 'react';
import { Timestamp } from 'firebase/firestore';
import { User, UserRole, UserStats } from '../models/types';

const defaultStats: UserStats = {
  batting: { avg: 0, gamesPlayed: 0, totalAtBats: 0, totalHits: 0, totalHomeRuns: 0, totalRbis: 0 },
  pitching: { era: 0, gamesPlayed: 0, totalInningsPitched: 0, totalStrikeouts: 0, totalEarnedRuns: 0 },
  fielding: { fieldingPct: 0, totalPutouts: 0, totalAssists: 0, totalErrors: 0 },
};

const mockUser: User = {
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
};

export function useAuth(): {
  user: User | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, displayName: string, role: UserRole) => Promise<void>;
  signOut: () => Promise<void>;
} {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  // Simulate auth state listener
  useEffect(() => {
    const timer = setTimeout(() => {
      setUser(mockUser);
      setLoading(false);
    }, 500);
    return () => clearTimeout(timer);
  }, []);

  const signIn = useCallback(async (_email: string, _password: string) => {
    setLoading(true);
    // TODO: Replace with Firebase auth
    await new Promise((resolve) => setTimeout(resolve, 300));
    setUser(mockUser);
    setLoading(false);
  }, []);

  const signUp = useCallback(async (_email: string, _password: string, displayName: string, role: UserRole) => {
    setLoading(true);
    // TODO: Replace with Firebase auth + Firestore user doc
    await new Promise((resolve) => setTimeout(resolve, 300));
    setUser({
      ...mockUser,
      uid: 'new-user-' + Date.now(),
      email: _email,
      displayName,
      role,
      stats: defaultStats,
      followersCount: 0,
      followingCount: 0,
      postsCount: 0,
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    });
    setLoading(false);
  }, []);

  const signOut = useCallback(async () => {
    setLoading(true);
    // TODO: Replace with Firebase auth signOut
    await new Promise((resolve) => setTimeout(resolve, 200));
    setUser(null);
    setLoading(false);
  }, []);

  return { user, loading, signIn, signUp, signOut };
}
