// @ts-nocheck
/**
 * Stats Calculator — Unit Tests
 *
 * Tests for baseball stat calculations:
 * - Batting average (AVG)
 * - Earned run average (ERA)
 * - WHIP (Walks + Hits per Inning Pitched)
 * - Fielding percentage (FPCT)
 * - OPS (On-base Plus Slugging)
 * - Multi-game aggregation
 * - Edge cases (zero denominators, perfect stats)
 */

import { describe, it, expect } from 'vitest';
import type { BattingScore, PitchingScore, FieldingScore } from '../models/types';

// ================================================================
// Stats Calculator Functions (to be implemented in src/utils/statsCalculator.ts)
// These are the function signatures the tests expect.
// ================================================================

/**
 * Calculate batting average: hits / atBats.
 * Returns 0 when atBats is 0.
 */
function calculateBattingAvg(totalHits: number, totalAtBats: number): number {
  if (totalAtBats === 0) return 0;
  return Math.round((totalHits / totalAtBats) * 1000) / 1000;
}

/**
 * Calculate ERA: (earnedRuns / inningsPitched) * 9.
 * Innings are in baseball notation: 6.1 = 6⅓, 6.2 = 6⅔.
 * Returns 0 when inningsPitched is 0.
 */
function parseInnings(inningsPitched: number): number {
  const full = Math.floor(inningsPitched);
  const fraction = Math.round((inningsPitched - full) * 10);
  return full + fraction / 3;
}

function calculateERA(totalEarnedRuns: number, totalInningsPitched: number): number {
  const innings = parseInnings(totalInningsPitched);
  if (innings === 0) return 0;
  return Math.round(((totalEarnedRuns / innings) * 9) * 100) / 100;
}

/**
 * Calculate WHIP: (walks + hits) / inningsPitched.
 * Returns 0 when inningsPitched is 0.
 */
function calculateWHIP(totalWalks: number, totalHits: number, totalInningsPitched: number): number {
  const innings = parseInnings(totalInningsPitched);
  if (innings === 0) return 0;
  return Math.round(((totalWalks + totalHits) / innings) * 100) / 100;
}

/**
 * Calculate fielding percentage: (putouts + assists) / (putouts + assists + errors).
 * Returns 0 when total chances is 0.
 */
function calculateFieldingPct(totalPutouts: number, totalAssists: number, totalErrors: number): number {
  const totalChances = totalPutouts + totalAssists + totalErrors;
  if (totalChances === 0) return 0;
  return Math.round(((totalPutouts + totalAssists) / totalChances) * 1000) / 1000;
}

/**
 * Calculate OBP: (hits + walks + hbp) / (atBats + walks + hbp + sacFlies).
 * Returns 0 when denominator is 0.
 */
function calculateOBP(hits: number, walks: number, hbp: number, atBats: number, sacFlies: number): number {
  const denom = atBats + walks + hbp + sacFlies;
  if (denom === 0) return 0;
  return Math.round(((hits + walks + hbp) / denom) * 1000) / 1000;
}

/**
 * Calculate SLG: totalBases / atBats.
 * totalBases = singles + 2*doubles + 3*triples + 4*homeRuns.
 */
function calculateSLG(
  hits: number,
  doubles: number,
  triples: number,
  homeRuns: number,
  atBats: number,
): number {
  if (atBats === 0) return 0;
  const singles = hits - doubles - triples - homeRuns;
  const totalBases = singles + 2 * doubles + 3 * triples + 4 * homeRuns;
  return Math.round((totalBases / atBats) * 1000) / 1000;
}

/**
 * Calculate OPS: OBP + SLG.
 */
function calculateOPS(obp: number, slg: number): number {
  return Math.round((obp + slg) * 1000) / 1000;
}

/**
 * Aggregate batting stats from multiple games.
 */
function aggregateBattingStats(games: BattingScore[]) {
  const totals = games.reduce(
    (acc, g) => ({
      atBats: acc.atBats + g.atBats,
      hits: acc.hits + g.hits,
      doubles: acc.doubles + g.doubles,
      triples: acc.triples + g.triples,
      homeRuns: acc.homeRuns + g.homeRuns,
      rbis: acc.rbis + g.rbis,
      walks: acc.walks + g.walks,
      strikeouts: acc.strikeouts + g.strikeouts,
      stolenBases: acc.stolenBases + g.stolenBases,
    }),
    { atBats: 0, hits: 0, doubles: 0, triples: 0, homeRuns: 0, rbis: 0, walks: 0, strikeouts: 0, stolenBases: 0 },
  );
  return {
    ...totals,
    gamesPlayed: games.length,
    avg: calculateBattingAvg(totals.hits, totals.atBats),
  };
}

/**
 * Aggregate pitching stats from multiple games.
 */
function aggregatePitchingStats(games: PitchingScore[]) {
  const totals = games.reduce(
    (acc, g) => ({
      inningsPitched: acc.inningsPitched + parseInnings(g.inningsPitched),
      earnedRuns: acc.earnedRuns + g.earnedRuns,
      hits: acc.hits + g.hits,
      walks: acc.walks + g.walks,
      strikeouts: acc.strikeouts + g.strikeouts,
      runs: acc.runs + g.runs,
      homeRunsAllowed: acc.homeRunsAllowed + g.homeRunsAllowed,
    }),
    { inningsPitched: 0, earnedRuns: 0, hits: 0, walks: 0, strikeouts: 0, runs: 0, homeRunsAllowed: 0 },
  );
  return {
    ...totals,
    gamesPlayed: games.length,
    era: totals.inningsPitched === 0 ? 0 : Math.round(((totals.earnedRuns / totals.inningsPitched) * 9) * 100) / 100,
    whip: totals.inningsPitched === 0 ? 0 : Math.round(((totals.walks + totals.hits) / totals.inningsPitched) * 100) / 100,
  };
}

/**
 * Aggregate fielding stats from multiple games.
 */
function aggregateFieldingStats(games: FieldingScore[]) {
  const totals = games.reduce(
    (acc, g) => ({
      putouts: acc.putouts + g.putouts,
      assists: acc.assists + g.assists,
      errors: acc.errors + g.errors,
    }),
    { putouts: 0, assists: 0, errors: 0 },
  );
  return {
    ...totals,
    gamesPlayed: games.length,
    fieldingPct: calculateFieldingPct(totals.putouts, totals.assists, totals.errors),
  };
}

// ================================================================
// Tests
// ================================================================

describe('Stats Calculator', () => {
  // ============================================================
  // Batting Average
  // ============================================================
  describe('calculateBattingAvg', () => {
    it('BAT-01: calculates standard batting average', () => {
      expect(calculateBattingAvg(3, 10)).toBe(0.3);
    });

    it('BAT-02: perfect batting average (all hits)', () => {
      expect(calculateBattingAvg(4, 4)).toBe(1.0);
    });

    it('BAT-03: zero at-bats returns 0 (not NaN)', () => {
      expect(calculateBattingAvg(0, 0)).toBe(0);
      expect(Number.isNaN(calculateBattingAvg(0, 0))).toBe(false);
    });

    it('BAT-04: hitless game', () => {
      expect(calculateBattingAvg(0, 5)).toBe(0);
    });

    it('BAT-05: multi-game aggregation (manual)', () => {
      // Game 1: 2/4, Game 2: 1/3 → 3/7 = 0.429
      const totalHits = 2 + 1;
      const totalAB = 4 + 3;
      expect(calculateBattingAvg(totalHits, totalAB)).toBe(0.429);
    });

    it('BAT-06: rounds to 3 decimal places', () => {
      // 1/3 = 0.33333... → 0.333
      expect(calculateBattingAvg(1, 3)).toBe(0.333);
    });
  });

  // ============================================================
  // ERA (Earned Run Average)
  // ============================================================
  describe('calculateERA', () => {
    it('ERA-01: standard ERA', () => {
      // 3 ER / 9 IP = 3.00
      expect(calculateERA(3, 9.0)).toBe(3.0);
    });

    it('ERA-02: perfect ERA (0 earned runs)', () => {
      expect(calculateERA(0, 7.0)).toBe(0);
    });

    it('ERA-03: zero innings pitched returns 0 (not Infinity)', () => {
      expect(calculateERA(0, 0)).toBe(0);
      expect(Number.isFinite(calculateERA(0, 0))).toBe(true);
    });

    it('ERA-04: fractional innings 6.1 = 6⅓', () => {
      // 2 ER / 6.333 IP * 9 = 2.842... → 2.84
      const era = calculateERA(2, 6.1);
      expect(era).toBe(2.84);
    });

    it('ERA-05: fractional innings 6.2 = 6⅔', () => {
      // 4 ER / 6.667 IP * 9 = 5.4 → 5.40
      const era = calculateERA(4, 6.2);
      expect(era).toBe(5.4);
    });

    it('ERA-06: multi-game aggregation', () => {
      // Game 1: 2 ER / 6 IP, Game 2: 1 ER / 3 IP → 3 ER / 9 IP = 3.00
      const totalER = 2 + 1;
      const totalIP = 6.0 + 3.0; // 9.0
      expect(calculateERA(totalER, totalIP)).toBe(3.0);
    });

    it('ERA-07: high ERA edge case', () => {
      // 10 ER / 1 IP = 90.00
      expect(calculateERA(10, 1.0)).toBe(90.0);
    });
  });

  // ============================================================
  // parseInnings
  // ============================================================
  describe('parseInnings', () => {
    it('converts whole innings correctly', () => {
      expect(parseInnings(7.0)).toBe(7);
    });

    it('converts .1 (one-third) correctly', () => {
      expect(parseInnings(6.1)).toBeCloseTo(6.333, 2);
    });

    it('converts .2 (two-thirds) correctly', () => {
      expect(parseInnings(6.2)).toBeCloseTo(6.667, 2);
    });

    it('converts 0 innings correctly', () => {
      expect(parseInnings(0)).toBe(0);
    });
  });

  // ============================================================
  // WHIP (Walks + Hits per Inning Pitched)
  // ============================================================
  describe('calculateWHIP', () => {
    it('WHIP-01: standard WHIP', () => {
      // (2 BB + 4 H) / 6 IP = 1.00
      expect(calculateWHIP(2, 4, 6.0)).toBe(1.0);
    });

    it('WHIP-02: perfect WHIP', () => {
      expect(calculateWHIP(0, 0, 7.0)).toBe(0);
    });

    it('WHIP-03: zero innings pitched returns 0 (not Infinity)', () => {
      expect(calculateWHIP(0, 0, 0)).toBe(0);
      expect(Number.isFinite(calculateWHIP(0, 0, 0))).toBe(true);
    });

    it('WHIP-04: multi-game aggregation', () => {
      // G1: 3H + 1BB / 5IP, G2: 2H + 1BB / 4IP → 7 / 9 = 0.78
      const totalWalks = 1 + 1;
      const totalHits = 3 + 2;
      const totalIP = 5.0 + 4.0;
      expect(calculateWHIP(totalWalks, totalHits, totalIP)).toBe(0.78);
    });
  });

  // ============================================================
  // Fielding Percentage
  // ============================================================
  describe('calculateFieldingPct', () => {
    it('FLD-01: standard fielding percentage', () => {
      // (10 + 5) / (10 + 5 + 1) = 15/16 = 0.938
      expect(calculateFieldingPct(10, 5, 1)).toBe(0.938);
    });

    it('FLD-02: perfect fielding', () => {
      expect(calculateFieldingPct(8, 3, 0)).toBe(1.0);
    });

    it('FLD-03: zero total chances returns 0 (not NaN)', () => {
      expect(calculateFieldingPct(0, 0, 0)).toBe(0);
      expect(Number.isNaN(calculateFieldingPct(0, 0, 0))).toBe(false);
    });

    it('FLD-04: all errors', () => {
      expect(calculateFieldingPct(0, 0, 3)).toBe(0);
    });
  });

  // ============================================================
  // OPS (On-base Plus Slugging)
  // ============================================================
  describe('OPS Calculation', () => {
    it('OPS-01: standard OPS', () => {
      expect(calculateOPS(0.350, 0.500)).toBe(0.85);
    });

    it('OPS-02: zero plate appearances', () => {
      const obp = calculateOBP(0, 0, 0, 0, 0);
      const slg = calculateSLG(0, 0, 0, 0, 0);
      expect(calculateOPS(obp, slg)).toBe(0);
    });

    it('OPS-03: perfect OPS', () => {
      // OBP 1.000 + SLG 4.000 = 5.000
      expect(calculateOPS(1.0, 4.0)).toBe(5.0);
    });

    it('OPS-04: walks affect OBP', () => {
      // 1 H, 2 BB, 3 AB, 0 HBP, 0 SF → OBP = (1+2+0) / (3+2+0+0) = 0.600
      const obp = calculateOBP(1, 2, 0, 3, 0);
      expect(obp).toBe(0.6);
    });
  });

  describe('calculateOBP', () => {
    it('calculates standard OBP', () => {
      // 50 H, 20 BB, 5 HBP, 200 AB, 3 SF → (50+20+5)/(200+20+5+3) = 75/228 = 0.329
      expect(calculateOBP(50, 20, 5, 200, 3)).toBe(0.329);
    });

    it('returns 0 for zero denominator', () => {
      expect(calculateOBP(0, 0, 0, 0, 0)).toBe(0);
    });
  });

  describe('calculateSLG', () => {
    it('calculates standard SLG', () => {
      // 50 H total, 10 2B, 2 3B, 8 HR, 200 AB
      // singles = 50 - 10 - 2 - 8 = 30
      // TB = 30 + 20 + 6 + 32 = 88
      // SLG = 88/200 = 0.440
      expect(calculateSLG(50, 10, 2, 8, 200)).toBe(0.44);
    });

    it('returns 0 for zero at-bats', () => {
      expect(calculateSLG(0, 0, 0, 0, 0)).toBe(0);
    });

    it('all home runs SLG = 4.000', () => {
      // 3 H, 0 2B, 0 3B, 3 HR, 3 AB → TB = 0 + 0 + 0 + 12 = 12, SLG = 12/3 = 4.0
      expect(calculateSLG(3, 0, 0, 3, 3)).toBe(4.0);
    });
  });

  // ============================================================
  // Multi-game Aggregation
  // ============================================================
  describe('aggregateBattingStats', () => {
    it('AGG-01: sums batting stats from multiple games', () => {
      const games: BattingScore[] = [
        { atBats: 4, hits: 2, doubles: 1, triples: 0, homeRuns: 0, rbis: 1, walks: 1, strikeouts: 1, stolenBases: 0 },
        { atBats: 3, hits: 1, doubles: 0, triples: 0, homeRuns: 1, rbis: 2, walks: 0, strikeouts: 1, stolenBases: 1 },
      ];

      const result = aggregateBattingStats(games);

      expect(result.atBats).toBe(7);
      expect(result.hits).toBe(3);
      expect(result.doubles).toBe(1);
      expect(result.triples).toBe(0);
      expect(result.homeRuns).toBe(1);
      expect(result.rbis).toBe(3);
      expect(result.walks).toBe(1);
      expect(result.strikeouts).toBe(2);
      expect(result.stolenBases).toBe(1);
      expect(result.gamesPlayed).toBe(2);
      expect(result.avg).toBe(0.429); // 3/7
    });

    it('AGG-05: single game produces correct aggregates', () => {
      const games: BattingScore[] = [
        { atBats: 4, hits: 2, doubles: 1, triples: 0, homeRuns: 0, rbis: 1, walks: 0, strikeouts: 1, stolenBases: 0 },
      ];

      const result = aggregateBattingStats(games);

      expect(result.gamesPlayed).toBe(1);
      expect(result.atBats).toBe(4);
      expect(result.hits).toBe(2);
      expect(result.avg).toBe(0.5);
    });

    it('AGG-06: empty game array returns all zeros', () => {
      const result = aggregateBattingStats([]);

      expect(result.gamesPlayed).toBe(0);
      expect(result.atBats).toBe(0);
      expect(result.hits).toBe(0);
      expect(result.avg).toBe(0);
      expect(Number.isNaN(result.avg)).toBe(false);
    });
  });

  describe('aggregatePitchingStats', () => {
    it('AGG-02: sums pitching stats and calculates ERA/WHIP', () => {
      const games: PitchingScore[] = [
        { inningsPitched: 6.0, hits: 4, runs: 3, earnedRuns: 2, walks: 2, strikeouts: 7, homeRunsAllowed: 1 },
        { inningsPitched: 3.0, hits: 2, runs: 1, earnedRuns: 1, walks: 1, strikeouts: 4, homeRunsAllowed: 0 },
      ];

      const result = aggregatePitchingStats(games);

      expect(result.gamesPlayed).toBe(2);
      expect(result.earnedRuns).toBe(3);
      expect(result.inningsPitched).toBe(9); // 6 + 3 = 9 true innings
      expect(result.strikeouts).toBe(11);
      expect(result.era).toBe(3.0); // 3 ER / 9 IP * 9 = 3.00
      expect(result.whip).toBe(1.0); // (3 BB + 6 H) / 9 IP = 1.00
    });

    it('handles fractional innings across games', () => {
      const games: PitchingScore[] = [
        { inningsPitched: 5.2, hits: 3, runs: 2, earnedRuns: 2, walks: 1, strikeouts: 5, homeRunsAllowed: 0 },
        { inningsPitched: 3.1, hits: 2, runs: 1, earnedRuns: 1, walks: 1, strikeouts: 3, homeRunsAllowed: 0 },
      ];

      const result = aggregatePitchingStats(games);

      // 5.2 = 5⅔ = 5.667, 3.1 = 3⅓ = 3.333 → total = 9.0 innings
      expect(result.inningsPitched).toBeCloseTo(9, 1);
      expect(result.gamesPlayed).toBe(2);
      expect(result.era).toBe(3.0); // 3 ER / 9 IP * 9
    });

    it('empty games returns zeros', () => {
      const result = aggregatePitchingStats([]);

      expect(result.gamesPlayed).toBe(0);
      expect(result.era).toBe(0);
      expect(result.whip).toBe(0);
    });
  });

  describe('aggregateFieldingStats', () => {
    it('AGG-03: sums fielding stats and calculates FPCT', () => {
      const games: FieldingScore[] = [
        { putouts: 5, assists: 3, errors: 1 },
        { putouts: 4, assists: 2, errors: 0 },
      ];

      const result = aggregateFieldingStats(games);

      expect(result.gamesPlayed).toBe(2);
      expect(result.putouts).toBe(9);
      expect(result.assists).toBe(5);
      expect(result.errors).toBe(1);
      expect(result.fieldingPct).toBe(0.933); // 14/15
    });

    it('empty games returns zeros', () => {
      const result = aggregateFieldingStats([]);

      expect(result.gamesPlayed).toBe(0);
      expect(result.putouts).toBe(0);
      expect(result.fieldingPct).toBe(0);
    });

    it('perfect fielding across games', () => {
      const games: FieldingScore[] = [
        { putouts: 3, assists: 2, errors: 0 },
        { putouts: 4, assists: 1, errors: 0 },
      ];

      const result = aggregateFieldingStats(games);

      expect(result.fieldingPct).toBe(1.0);
    });
  });
});
