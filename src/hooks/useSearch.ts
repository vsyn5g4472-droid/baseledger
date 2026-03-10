import { useState, useCallback } from 'react';
import { Timestamp } from 'firebase/firestore';
import { User, ScoutSearchFilters } from '../models/types';

const MOCK_PLAYER_DATABASE: User[] = [
  {
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
    uid: 'mock-user-006',
    email: 'ito@example.com',
    displayName: '伊藤 隼人',
    photoURL: null,
    username: null,
    role: 'player',
    position: 'キャッチャー',
    team: '東京ブルースターズ',
    age: 23,
    throwHand: 'right',
    batHand: 'right',
    bio: '配球と守備力に自信あり。チームの要です。',
    stats: {
      batting: { avg: 0.260, gamesPlayed: 48, totalAtBats: 185, totalHits: 48, totalHomeRuns: 6, totalRbis: 30 },
      pitching: { era: 0, gamesPlayed: 0, totalInningsPitched: 0, totalStrikeouts: 0, totalEarnedRuns: 0 },
      fielding: { fieldingPct: 0.995, totalPutouts: 320, totalAssists: 25, totalErrors: 2 },
    },
    followersCount: 145,
    followingCount: 88,
    postsCount: 15,
    isPublic: true,
    createdAt: Timestamp.now(),
    updatedAt: Timestamp.now(),
  },
  {
    uid: 'mock-user-007',
    email: 'kobayashi@example.com',
    displayName: '小林 太郎',
    photoURL: null,
    username: null,
    role: 'player',
    position: 'ファースト',
    team: '名古屋ドラゴンフライズ',
    age: 27,
    throwHand: 'left',
    batHand: 'left',
    bio: '長打力が武器。チームの4番打者。',
    stats: {
      batting: { avg: 0.298, gamesPlayed: 52, totalAtBats: 210, totalHits: 63, totalHomeRuns: 15, totalRbis: 52 },
      pitching: { era: 0, gamesPlayed: 0, totalInningsPitched: 0, totalStrikeouts: 0, totalEarnedRuns: 0 },
      fielding: { fieldingPct: 0.992, totalPutouts: 420, totalAssists: 30, totalErrors: 4 },
    },
    followersCount: 420,
    followingCount: 95,
    postsCount: 38,
    isPublic: true,
    createdAt: Timestamp.now(),
    updatedAt: Timestamp.now(),
  },
];

// Mock AI recommendations
const MOCK_AI_RECOMMENDATIONS: User[] = [
  MOCK_PLAYER_DATABASE[1], // 佐藤 健太 - high batting avg
  MOCK_PLAYER_DATABASE[3], // 中村 拓也 - excellent ERA
  MOCK_PLAYER_DATABASE[5], // 小林 太郎 - power hitter
];

const DEFAULT_FILTERS: ScoutSearchFilters = {};

export function usePlayerSearch(): {
  results: User[];
  loading: boolean;
  search: (query: string) => Promise<void>;
  filterByPosition: (position: string) => void;
  filters: ScoutSearchFilters;
  setFilters: (filters: ScoutSearchFilters) => void;
  applyFilters: () => Promise<void>;
  aiRecommendations: User[];
  loadingRecommendations: boolean;
} {
  const [results, setResults] = useState<User[]>([]);
  const [loading, setLoading] = useState(false);
  const [filters, setFilters] = useState<ScoutSearchFilters>(DEFAULT_FILTERS);
  const [aiRecommendations, setAiRecommendations] = useState<User[]>([]);
  const [loadingRecommendations, setLoadingRecommendations] = useState(true);

  // Load AI recommendations on mount (simulated)
  useState(() => {
    setTimeout(() => {
      setAiRecommendations(MOCK_AI_RECOMMENDATIONS);
      setLoadingRecommendations(false);
    }, 500);
  });

  const search = useCallback(async (query: string) => {
    setLoading(true);
    // TODO: Replace with Firestore query or Algolia search
    await new Promise((resolve) => setTimeout(resolve, 300));
    const lowerQuery = query.toLowerCase();
    const filtered = MOCK_PLAYER_DATABASE.filter(
      (u) =>
        u.displayName.toLowerCase().includes(lowerQuery) ||
        (u.position?.toLowerCase().includes(lowerQuery) ?? false) ||
        (u.team?.toLowerCase().includes(lowerQuery) ?? false),
    );
    setResults(filtered);
    setLoading(false);
  }, []);

  const filterByPosition = useCallback((position: string) => {
    setFilters((prev) => ({ ...prev, position }));
  }, []);

  const applyFilters = useCallback(async () => {
    setLoading(true);
    // TODO: Replace with Firestore compound query
    await new Promise((resolve) => setTimeout(resolve, 300));
    let filtered = [...MOCK_PLAYER_DATABASE];

    if (filters.position) {
      filtered = filtered.filter((u) => u.position === filters.position);
    }
    if (filters.role) {
      filtered = filtered.filter((u) => u.role === filters.role);
    }
    if (filters.minAge !== undefined) {
      filtered = filtered.filter((u) => (u.age ?? 0) >= filters.minAge!);
    }
    if (filters.maxAge !== undefined) {
      filtered = filtered.filter((u) => (u.age ?? 100) <= filters.maxAge!);
    }
    if (filters.throwHand) {
      filtered = filtered.filter((u) => u.throwHand === filters.throwHand);
    }
    if (filters.batHand) {
      filtered = filtered.filter((u) => u.batHand === filters.batHand);
    }
    if (filters.minBattingAvg !== undefined) {
      filtered = filtered.filter((u) => u.stats.batting.avg >= filters.minBattingAvg!);
    }
    if (filters.minEra !== undefined) {
      filtered = filtered.filter(
        (u) => u.stats.pitching.era > 0 && u.stats.pitching.era <= filters.minEra!,
      );
    }
    if (filters.team) {
      filtered = filtered.filter((u) => u.team === filters.team);
    }

    setResults(filtered);
    setLoading(false);
  }, [filters]);

  return {
    results,
    loading,
    search,
    filterByPosition,
    filters,
    setFilters,
    applyFilters,
    aiRecommendations,
    loadingRecommendations,
  };
}
