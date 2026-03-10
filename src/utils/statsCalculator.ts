// =============================================================================
// Baseball Statistics Calculator
// Pure utility functions — no Firebase dependencies
// =============================================================================

import type { BattingScore, PitchingScore, FieldingScore, BattingStats, PitchingStats, FieldingStats } from '../models/types';

// ── Batting Stats ────────────────────────────────────────────────────────────

export function calculateBattingAverage(hits: number, atBats: number): number {
  if (atBats === 0) return 0;
  return hits / atBats;
}

export function calculateOnBasePercentage(
  hits: number,
  walks: number,
  hbp: number,
  atBats: number,
  sacFlies: number,
): number {
  const denominator = atBats + walks + hbp + sacFlies;
  if (denominator === 0) return 0;
  return (hits + walks + hbp) / denominator;
}

export function calculateSluggingPercentage(
  singles: number,
  doubles: number,
  triples: number,
  homeRuns: number,
  atBats: number,
): number {
  if (atBats === 0) return 0;
  const totalBases = singles + doubles * 2 + triples * 3 + homeRuns * 4;
  return totalBases / atBats;
}

export function calculateOPS(obp: number, slg: number): number {
  return obp + slg;
}

// ── Pitching Stats ───────────────────────────────────────────────────────────

export function calculateERA(earnedRuns: number, inningsPitched: number): number {
  if (inningsPitched === 0) return 0;
  return (earnedRuns / inningsPitched) * 9;
}

export function calculateWHIP(walks: number, hits: number, inningsPitched: number): number {
  if (inningsPitched === 0) return 0;
  return (walks + hits) / inningsPitched;
}

export function calculateK9(strikeouts: number, inningsPitched: number): number {
  if (inningsPitched === 0) return 0;
  return (strikeouts / inningsPitched) * 9;
}

// ── Fielding Stats ───────────────────────────────────────────────────────────

export function calculateFieldingPercentage(
  putouts: number,
  assists: number,
  errors: number,
): number {
  const totalChances = putouts + assists + errors;
  if (totalChances === 0) return 0;
  return (putouts + assists) / totalChances;
}

export function calculateRangeFactor(
  putouts: number,
  assists: number,
  gamesPlayed: number,
): number {
  if (gamesPlayed === 0) return 0;
  return (putouts + assists) / gamesPlayed;
}

// ── Aggregate from Multiple Games ────────────────────────────────────────────

export function aggregateBattingStats(scores: BattingScore[]): BattingStats {
  if (scores.length === 0) {
    return {
      avg: 0,
      gamesPlayed: 0,
      totalAtBats: 0,
      totalHits: 0,
      totalHomeRuns: 0,
      totalRbis: 0,
    };
  }

  const totalAtBats = scores.reduce((sum, s) => sum + s.atBats, 0);
  const totalHits = scores.reduce((sum, s) => sum + s.hits, 0);
  const totalHomeRuns = scores.reduce((sum, s) => sum + s.homeRuns, 0);
  const totalRbis = scores.reduce((sum, s) => sum + s.rbis, 0);

  return {
    avg: calculateBattingAverage(totalHits, totalAtBats),
    gamesPlayed: scores.length,
    totalAtBats,
    totalHits,
    totalHomeRuns,
    totalRbis,
  };
}

export function aggregatePitchingStats(scores: PitchingScore[]): PitchingStats {
  if (scores.length === 0) {
    return {
      era: 0,
      gamesPlayed: 0,
      totalInningsPitched: 0,
      totalStrikeouts: 0,
      totalEarnedRuns: 0,
    };
  }

  const totalInningsPitched = scores.reduce((sum, s) => sum + s.inningsPitched, 0);
  const totalStrikeouts = scores.reduce((sum, s) => sum + s.strikeouts, 0);
  const totalEarnedRuns = scores.reduce((sum, s) => sum + s.earnedRuns, 0);

  return {
    era: calculateERA(totalEarnedRuns, totalInningsPitched),
    gamesPlayed: scores.length,
    totalInningsPitched,
    totalStrikeouts,
    totalEarnedRuns,
  };
}

export function aggregateFieldingStats(scores: FieldingScore[]): FieldingStats {
  if (scores.length === 0) {
    return {
      fieldingPct: 0,
      totalPutouts: 0,
      totalAssists: 0,
      totalErrors: 0,
    };
  }

  const totalPutouts = scores.reduce((sum, s) => sum + s.putouts, 0);
  const totalAssists = scores.reduce((sum, s) => sum + s.assists, 0);
  const totalErrors = scores.reduce((sum, s) => sum + s.errors, 0);

  return {
    fieldingPct: calculateFieldingPercentage(totalPutouts, totalAssists, totalErrors),
    totalPutouts,
    totalAssists,
    totalErrors,
  };
}

// ── Display Formatting ───────────────────────────────────────────────────────

export function formatBattingAvg(avg: number): string {
  return avg.toFixed(3).replace(/^0/, '');
}

export function formatERA(era: number): string {
  return era.toFixed(2);
}

export function formatFieldingPct(pct: number): string {
  return pct.toFixed(3).replace(/^0/, '');
}
