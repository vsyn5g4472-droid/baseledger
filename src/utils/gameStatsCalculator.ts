import type { GameState, AtBatLog, PitchLog, PitchResult, AtBatResult } from '../types/game';
import {
  calculateBattingAverage,
  calculateOnBasePercentage,
  calculateSluggingPercentage,
  calculateOPS,
} from './statsCalculator';

// ── Constants ──────────────────────────────────────────────────────────────────

const NON_AT_BAT_RESULTS: AtBatResult[] = [
  'walk',
  'hit_by_pitch',
  'sacrifice_bunt', // TODO: バント打者が出塁した場合も sacrifice_bunt のままのため打数除外が不正確になりうる
  'sacrifice_fly',
];
const HIT_RESULTS: AtBatResult[] = ['single', 'double', 'triple', 'home_run'];
const STRIKE_PITCH_RESULTS: PitchResult[] = [
  'strike_called',
  'strike_swinging',
  'foul',
  'foul_tip',
  'in_play',
];
const ALL_ZONES = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'BH', 'BL', 'BI', 'BO'] as const;

// ── Public Types ───────────────────────────────────────────────────────────────

export interface PlayerBattingStats {
  playerId: string;
  playerName: string;
  atBats: number;
  hits: number;
  singles: number;
  doubles: number;
  triples: number;
  homeRuns: number;
  rbi: number;
  walks: number;
  hbp: number;
  sacFlies: number;
  strikeouts: number;
  avg: number;
  obp: number;
  slg: number;
  ops: number;
  /** 拡張用カスタム指標 */
  customMetrics: Record<string, number>;
}

export interface PitchMixEntry {
  pitchType: string;
  count: number;
  pct: number;
  avgVelocity: number | null;
}

export interface ZoneStats {
  zone: string;
  totalPitches: number;
  strikes: number;
  inPlay: number;
  hits: number;
}

export interface PlayerPitchingStats {
  playerId: string;
  playerName: string;
  totalPitches: number;
  strikeRate: number;
  ballRate: number;
  pitchMix: PitchMixEntry[];
  zoneStats: ZoneStats[];
  /** 拡張用カスタム指標 */
  customMetrics: Record<string, number>;
}

export interface GameAnalytics {
  gameId: string;
  awayTeamName: string;
  homeTeamName: string;
  finalScore: { away: number; home: number };
  createdAt: number;
  totalInnings: number;
  batting: {
    away: PlayerBattingStats[];
    home: PlayerBattingStats[];
  };
  pitching: {
    /** 後攻(home)投手一覧 = top innings の投球（先発→中継ぎ順） */
    homePitchers: PlayerPitchingStats[];
    /** 先攻(away)投手一覧 = bottom innings の投球（先発→中継ぎ順） */
    awayPitchers: PlayerPitchingStats[];
  };
}

// ── Private helpers ────────────────────────────────────────────────────────────

function calcBatterStats(
  playerId: string,
  playerName: string,
  logs: AtBatLog[],
): PlayerBattingStats {
  const myLogs = logs.filter((l) => l.batterId === playerId && l.result !== null);
  let atBats = 0, hits = 0, singles = 0, doubles = 0, triples = 0, homeRuns = 0;
  let rbi = 0, walks = 0, hbp = 0, sacFlies = 0, strikeouts = 0;

  for (const log of myLogs) {
    const r = log.result!;
    if (!NON_AT_BAT_RESULTS.includes(r)) atBats++;
    if (HIT_RESULTS.includes(r)) hits++;
    if (r === 'single') singles++;
    if (r === 'double') doubles++;
    if (r === 'triple') triples++;
    if (r === 'home_run') homeRuns++;
    rbi += log.rbiCount ?? 0;
    if (r === 'walk') walks++;
    if (r === 'hit_by_pitch') hbp++;
    if (r === 'sacrifice_fly') sacFlies++;
    if (r === 'strikeout' || r === 'strikeout_looking') strikeouts++;
  }

  const obp = calculateOnBasePercentage(hits, walks, hbp, atBats, sacFlies);
  const slg = calculateSluggingPercentage(singles, doubles, triples, homeRuns, atBats);

  return {
    playerId,
    playerName,
    atBats, hits, singles, doubles, triples, homeRuns,
    rbi, walks, hbp, sacFlies, strikeouts,
    avg: calculateBattingAverage(hits, atBats),
    obp,
    slg,
    ops: calculateOPS(obp, slg),
    customMetrics: {},
  };
}

function calcPitcherStats(
  playerId: string,
  playerName: string,
  pitchLogs: PitchLog[],
  atBatLogs: AtBatLog[],
): PlayerPitchingStats {
  const myPitches = pitchLogs.filter((p) => p.pitcherId === playerId);
  const totalPitches = myPitches.length;

  const strikeCount = myPitches.filter((p) => STRIKE_PITCH_RESULTS.includes(p.result)).length;
  const strikeRate = totalPitches > 0 ? strikeCount / totalPitches : 0;

  // Pitch mix
  const typeMap = new Map<string, { count: number; velocities: number[] }>();
  for (const p of myPitches) {
    if (!typeMap.has(p.pitchType)) typeMap.set(p.pitchType, { count: 0, velocities: [] });
    const e = typeMap.get(p.pitchType)!;
    e.count++;
    if (p.velocity != null) e.velocities.push(p.velocity);
  }

  const pitchMix: PitchMixEntry[] = Array.from(typeMap.entries())
    .map(([pitchType, { count, velocities }]) => ({
      pitchType,
      count,
      pct: totalPitches > 0 ? count / totalPitches : 0,
      avgVelocity:
        velocities.length > 0
          ? Math.round(velocities.reduce((a, b) => a + b, 0) / velocities.length)
          : null,
    }))
    .sort((a, b) => b.count - a.count);

  // Zone stats
  const zoneMap = new Map<string, ZoneStats>(
    ALL_ZONES.map((z) => [z, { zone: z, totalPitches: 0, strikes: 0, inPlay: 0, hits: 0 }]),
  );

  for (const p of myPitches) {
    const zs = zoneMap.get(p.zone);
    if (!zs) continue;
    zs.totalPitches++;
    if (STRIKE_PITCH_RESULTS.includes(p.result)) zs.strikes++;
    if (p.result === 'in_play') {
      zs.inPlay++;
      const ab = atBatLogs.find((a) => (a.pitches ?? []).some((pi) => pi.id === p.id));
      if (ab?.result && HIT_RESULTS.includes(ab.result)) zs.hits++;
    }
  }

  return {
    playerId,
    playerName,
    totalPitches,
    strikeRate,
    ballRate: 1 - strikeRate,
    pitchMix,
    zoneStats: Array.from(zoneMap.values()),
    customMetrics: {},
  };
}

// ── Main Aggregation ───────────────────────────────────────────────────────────

export function computeGameAnalytics(game: GameState): GameAnalytics {
  const awayPlayers = game.awayTeam?.roster?.starters ?? [];
  const homePlayers = game.homeTeam?.roster?.starters ?? [];

  // 古いゲームデータへの防御的チェック
  const safeAtBatLogs = game.atBatLogs ?? [];
  const safePitchLogs  = game.pitchLogs  ?? [];

  // 表回 = away bats, 裏回 = home bats
  const awayBatLogs = safeAtBatLogs.filter((l) => l.inning.half === 'top');
  const homeBatLogs = safeAtBatLogs.filter((l) => l.inning.half === 'bottom');

  const awayBatting = awayPlayers
    .map((p) => calcBatterStats(p.id, p.name, awayBatLogs))
    .filter((s) => s.atBats > 0 || s.walks > 0 || s.hbp > 0);

  const homeBatting = homePlayers
    .map((p) => calcBatterStats(p.id, p.name, homeBatLogs))
    .filter((s) => s.atBats > 0 || s.walks > 0 || s.hbp > 0);

  // 表回投手 = home team (home defends in top)
  // 裏回投手 = away team (away defends in bottom)
  const topPitches    = safePitchLogs.filter((p) => p.inning.half === 'top');
  const bottomPitches = safePitchLogs.filter((p) => p.inning.half === 'bottom');

  // 登板した全投手IDを出現順で抽出（重複除去）
  const homePitcherIds = [...new Set(topPitches.map((p) => p.pitcherId).filter(Boolean))] as string[];
  const awayPitcherIds = [...new Set(bottomPitches.map((p) => p.pitcherId).filter(Boolean))] as string[];

  const homeAllPlayers = [
    ...(game.homeTeam?.roster?.starters ?? []),
    ...(game.homeTeam?.roster?.bench    ?? []),
    ...(game.homeTeam?.roster?.pitcher  ? [game.homeTeam.roster.pitcher] : []),
  ];
  const awayAllPlayers = [
    ...(game.awayTeam?.roster?.starters ?? []),
    ...(game.awayTeam?.roster?.bench    ?? []),
    ...(game.awayTeam?.roster?.pitcher  ? [game.awayTeam.roster.pitcher] : []),
  ];

  const homePitchers = homePitcherIds
    .map((id) => homeAllPlayers.find((p) => p.id === id))
    .filter((p): p is NonNullable<typeof p> => p != null)
    .map((p) => calcPitcherStats(p.id, p.name, safePitchLogs, safeAtBatLogs));

  const awayPitchers = awayPitcherIds
    .map((id) => awayAllPlayers.find((p) => p.id === id))
    .filter((p): p is NonNullable<typeof p> => p != null)
    .map((p) => calcPitcherStats(p.id, p.name, safePitchLogs, safeAtBatLogs));

  const inningNums = (game.scoreboard?.innings ?? []).map((i) => i.inning);
  const totalInnings = Math.max(...inningNums, game.inning?.number ?? 1, 1);

  return {
    gameId: game.id,
    awayTeamName: game.awayTeam.name,
    homeTeamName: game.homeTeam.name,
    finalScore: {
      away: game.scoreboard?.awayTotal ?? 0,
      home: game.scoreboard?.homeTotal ?? 0,
    },
    createdAt: game.createdAt,
    totalInnings,
    batting: { away: awayBatting, home: homeBatting },
    pitching: { homePitchers, awayPitchers },
  };
}
