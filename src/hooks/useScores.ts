import { useState, useCallback, useEffect } from 'react';
import { Timestamp } from 'firebase/firestore';
import { Score, UserStats, CreateScoreInput, BattingScore, PitchingScore, FieldingScore } from '../models/types';
import { db } from '../db/index';
import type { GameState, AtBatResult } from '../types/game';

// ============================================================
// GameState → Score 変換
// ============================================================

const HIT_RESULTS: AtBatResult[] = ['single', 'double', 'triple', 'home_run'];
const OUT_RESULTS: AtBatResult[] = [
  'groundout', 'flyout', 'lineout', 'pop_out',
  'sacrifice_bunt', 'sacrifice_fly', 'fielders_choice',
  'double_play', 'triple_play', 'strikeout', 'strikeout_looking',
];

function gameToScore(game: GameState): Score {
  // 先攻チーム名を対戦相手として使用 (便宜的)
  const opponent = game.awayTeam.name;

  // 全打席ログから打撃統計を集計
  const completedABs = game.atBatLogs.filter((ab) => ab.result !== null);

  let atBats = 0;
  let hits = 0;
  let doubles = 0;
  let triples = 0;
  let homeRuns = 0;
  let rbis = 0;
  let walks = 0;
  let strikeouts = 0;
  let stolenBases = 0;

  for (const ab of completedABs) {
    const r = ab.result!;
    // 四球・死球・犠打/犠飛は打数に含めない
    if (r === 'walk' || r === 'hit_by_pitch' || r === 'sacrifice_bunt' || r === 'sacrifice_fly') {
      if (r === 'walk') walks++;
    } else {
      atBats++;
    }
    if (HIT_RESULTS.includes(r)) hits++;
    if (r === 'double') doubles++;
    if (r === 'triple') triples++;
    if (r === 'home_run') homeRuns++;
    if (r === 'strikeout' || r === 'strikeout_looking') strikeouts++;
    rbis += ab.rbiCount;
  }

  const batting: BattingScore = {
    atBats, hits, doubles, triples, homeRuns, rbis, walks, strikeouts, stolenBases,
  };

  // 投球統計 (イニング数は scoreboard から概算)
  const totalInnings = game.scoreboard.innings.length;
  const totalPitches = game.pitchLogs.length;
  let earnedRuns = 0;
  let pitchingStrikeouts = 0;
  let pitchingWalks = 0;
  let pitchingHits = 0;

  for (const ab of completedABs) {
    const r = ab.result!;
    if (r === 'strikeout' || r === 'strikeout_looking') pitchingStrikeouts++;
    if (r === 'walk') pitchingWalks++;
    if (HIT_RESULTS.includes(r)) pitchingHits++;
  }
  earnedRuns = game.scoreboard.awayTotal + game.scoreboard.homeTotal;

  const pitching: PitchingScore | null = totalPitches > 0 ? {
    inningsPitched: totalInnings,
    hits: pitchingHits,
    runs: earnedRuns,
    earnedRuns,
    walks: pitchingWalks,
    strikeouts: pitchingStrikeouts,
    homeRunsAllowed: homeRuns,
  } : null;

  // 守備統計 (簡易: エラー数のみ gameState から取得可能)
  const fielding: FieldingScore = {
    putouts: 0,
    assists: 0,
    errors: 0,
  };

  return {
    id: game.id,
    playerId: 'local',
    gameDate: Timestamp.fromMillis(game.createdAt),
    opponent,
    batting,
    pitching,
    fielding,
    videoURL: null,
    aiAnalysis: null,
    teamId: null,
    createdAt: Timestamp.fromMillis(game.createdAt),
  };
}

// ============================================================
// Hook
// ============================================================

export function useScores(playerId?: string): {
  scores: Score[];
  loading: boolean;
  loadMore: () => Promise<void>;
  hasMore: boolean;
  addScore: (input: CreateScoreInput) => Promise<void>;
} {
  const [scores, setScores] = useState<Score[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasMore, setHasMore] = useState(false);

  const loadScores = useCallback(async () => {
    setLoading(true);
    try {
      const games = await db.games.getAll();
      // 完了した試合のみ表示 (phase === 'finished')
      const finished = games.filter((g) => g.phase === 'finished');
      const converted = finished.map(gameToScore);
      setScores(converted);
    } catch (err) {
      if (__DEV__) console.error('Failed to load scores from AsyncStorage:', err);
      setScores([]);
    } finally {
      setLoading(false);
      setHasMore(false);
    }
  }, []);

  useEffect(() => {
    loadScores();
  }, [loadScores]);

  const loadMore = useCallback(async () => {
    // 全件ローカル読み込みのため追加読み込みなし
  }, []);

  const addScore = useCallback(async (_input: CreateScoreInput) => {
    // ゲームデータはgameStore.persist()で保存済み。リロードで反映
    await loadScores();
  }, [loadScores]);

  return { scores, loading, loadMore, hasMore, addScore };
}

export function usePlayerStats(playerId: string): {
  stats: UserStats | null;
  loading: boolean;
  refresh: () => Promise<void>;
} {
  const [stats, setStats] = useState<UserStats | null>(null);
  const [loading, setLoading] = useState(true);

  const computeStats = useCallback(async () => {
    setLoading(true);
    try {
      const games = await db.games.getAll();
      const finished = games.filter((g) => g.phase === 'finished');
      const scores = finished.map(gameToScore);

      let totalAB = 0, totalH = 0, totalHR = 0, totalRBI = 0;
      let totalIP = 0, totalK = 0, totalER = 0;
      let totalPO = 0, totalA = 0, totalE = 0;
      let battingGames = 0, pitchingGames = 0;

      for (const s of scores) {
        if (s.batting) {
          battingGames++;
          totalAB += s.batting.atBats;
          totalH += s.batting.hits;
          totalHR += s.batting.homeRuns;
          totalRBI += s.batting.rbis;
        }
        if (s.pitching) {
          pitchingGames++;
          totalIP += s.pitching.inningsPitched;
          totalK += s.pitching.strikeouts;
          totalER += s.pitching.earnedRuns;
        }
        if (s.fielding) {
          totalPO += s.fielding.putouts;
          totalA += s.fielding.assists;
          totalE += s.fielding.errors;
        }
      }

      const totalChances = totalPO + totalA + totalE;

      setStats({
        batting: {
          avg: totalAB > 0 ? Math.round((totalH / totalAB) * 1000) / 1000 : 0,
          gamesPlayed: battingGames,
          totalAtBats: totalAB,
          totalHits: totalH,
          totalHomeRuns: totalHR,
          totalRbis: totalRBI,
        },
        pitching: {
          era: totalIP > 0 ? Math.round((totalER / totalIP) * 9 * 100) / 100 : 0,
          gamesPlayed: pitchingGames,
          totalInningsPitched: totalIP,
          totalStrikeouts: totalK,
          totalEarnedRuns: totalER,
        },
        fielding: {
          fieldingPct: totalChances > 0
            ? Math.round(((totalPO + totalA) / totalChances) * 1000) / 1000
            : 0,
          totalPutouts: totalPO,
          totalAssists: totalA,
          totalErrors: totalE,
        },
      });
    } catch (err) {
      if (__DEV__) console.error('Failed to compute stats:', err);
      setStats(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    computeStats();
  }, [computeStats]);

  const refresh = useCallback(async () => {
    await computeStats();
  }, [computeStats]);

  return { stats, loading, refresh };
}
