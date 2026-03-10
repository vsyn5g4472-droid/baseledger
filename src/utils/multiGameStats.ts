/**
 * Multi-game statistics aggregation
 *
 * Aggregates batting and pitching metrics across multiple GameState objects.
 * Used for leaderboard computation and AI report generation.
 *
 * NOTE: Player identity is matched by playerId. If the same physical player
 * is set up with different UUIDs across games, they appear as separate entries.
 * Use consistent roster templates to ensure cross-game aggregation.
 */

import type { GameState, AtBatResult, PitchResult } from '../types/game';

// ── Constants ─────────────────────────────────────────────────────────────────

const NON_AB_RESULTS: AtBatResult[] = [
  'walk', 'hit_by_pitch', 'sacrifice_bunt', 'sacrifice_fly',
];
const HIT_RESULTS: AtBatResult[] = ['single', 'double', 'triple', 'home_run'];
const STRIKE_PITCH_RESULTS: PitchResult[] = [
  'strike_called', 'strike_swinging', 'foul', 'foul_tip', 'in_play',
];

// ── Public Types ──────────────────────────────────────────────────────────────

export interface AggregatedBattingStats {
  playerId: string;
  playerName: string;
  gamesPlayed: number;
  atBats: number;
  hits: number;
  singles: number;
  doubles: number;
  triples: number;
  homeRuns: number;
  rbi: number;
  walks: number;
  hbp: number;
  strikeouts: number;
  /** 打率 */
  avg: number;
  /** 出塁率 */
  obp: number;
  /** 長打率 */
  slg: number;
  /** OPS (obp + slg) */
  ops: number;
  /** 空振り率 (swinging strikes / total swings) */
  swingMissRate: number;
  /** 平均打球飛距離 (m) — velocity 計測があった打席のみ */
  avgHitDistance: number | null;
}

export interface AggregatedPitchingStats {
  playerId: string;
  playerName: string;
  gamesPlayed: number;
  totalPitches: number;
  /** ストライク率 */
  strikeRate: number;
  /** 奪三振率 (三振 / 対戦打者数) */
  strikeoutRate: number;
  /** 平均球速 (km/h) — 球速計測があった投球のみ */
  avgVelocity: number | null;
  /** 最高球速 (km/h) */
  maxVelocity: number | null;
  /** 球種別割合サマリ */
  pitchMix: Array<{ pitchType: string; pct: number; avgVel: number | null }>;
  /** ゾーン分布 (zone → 投球数) */
  zoneDistribution: Record<string, number>;
}

export interface LeaderboardEntry {
  rank: number;
  playerId: string;
  playerName: string;
  /** 比較・ソートに使う生数値 */
  value: number;
  /** 画面表示用フォーマット済み文字列 */
  displayValue: string;
}

export interface LeaderboardCategory {
  /** カテゴリID */
  id: string;
  /** 表示ラベル */
  label: string;
  /** MaterialCommunityIcons 名 */
  icon: string;
  entries: LeaderboardEntry[];
}

export interface LeaderboardData {
  categories: LeaderboardCategory[];
  /** 集計した試合数 */
  gameCount: number;
  computedAt: number;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function calcOBP(
  hits: number, walks: number, hbp: number, ab: number, sacFlies: number,
): number {
  const denom = ab + walks + hbp + sacFlies;
  return denom > 0 ? (hits + walks + hbp) / denom : 0;
}

function calcSLG(
  singles: number, doubles: number, triples: number, hr: number, ab: number,
): number {
  if (ab === 0) return 0;
  return (singles + doubles * 2 + triples * 3 + hr * 4) / ab;
}

/** 全試合から全プレイヤー (id → name) を収集 */
function collectAllPlayers(games: GameState[]): Map<string, string> {
  const m = new Map<string, string>();
  for (const g of games) {
    for (const team of [g.awayTeam, g.homeTeam]) {
      for (const p of [...team.roster.starters, ...team.roster.bench]) {
        if (!m.has(p.id)) m.set(p.id, p.name);
      }
    }
  }
  return m;
}

/** 全試合から全投手 (id → name) を収集 — pitchLogs を基にする */
function collectAllPitchers(games: GameState[]): Map<string, string> {
  const m = new Map<string, string>();
  for (const g of games) {
    const allPlayers = [
      ...g.awayTeam.roster.starters,
      ...g.awayTeam.roster.bench,
      ...g.homeTeam.roster.starters,
      ...g.homeTeam.roster.bench,
    ];
    for (const p of g.pitchLogs) {
      if (!m.has(p.pitcherId)) {
        const player = allPlayers.find((pl) => pl.id === p.pitcherId);
        if (player) m.set(p.pitcherId, player.name);
      }
    }
  }
  return m;
}

// ── Single-player aggregations ────────────────────────────────────────────────

/**
 * 複数試合にわたる打撃成績を集計する
 */
export function aggregatePlayerBatting(
  playerId: string,
  playerName: string,
  games: GameState[],
): AggregatedBattingStats {
  let gamesPlayed = 0;
  let atBats = 0, hits = 0, singles = 0, doubles = 0, triples = 0, homeRuns = 0;
  let rbi = 0, walks = 0, hbp = 0, sacFlies = 0, strikeouts = 0;
  let swingMisses = 0, totalSwings = 0;
  const hitDistances: number[] = [];

  for (const game of games) {
    const myLogs = game.atBatLogs.filter(
      (l) => l.batterId === playerId && l.result !== null,
    );
    if (myLogs.length === 0) continue;
    gamesPlayed++;

    for (const log of myLogs) {
      const r = log.result!;
      if (!NON_AB_RESULTS.includes(r)) atBats++;
      if (HIT_RESULTS.includes(r)) hits++;
      if (r === 'single')    singles++;
      if (r === 'double')    doubles++;
      if (r === 'triple')    triples++;
      if (r === 'home_run')  homeRuns++;
      rbi += log.rbiCount;
      if (r === 'walk')          walks++;
      if (r === 'hit_by_pitch')  hbp++;
      if (r === 'sacrifice_fly') sacFlies++;
      if (r === 'strikeout' || r === 'strikeout_looking') strikeouts++;

      // 打球飛距離
      if (log.battedBall?.estimatedDistance) {
        hitDistances.push(log.battedBall.estimatedDistance);
      }

      // 空振り率集計
      for (const pitch of log.pitches) {
        if (pitch.result === 'strike_swinging') {
          swingMisses++;
          totalSwings++;
        } else if (
          pitch.result === 'in_play' ||
          pitch.result === 'foul' ||
          pitch.result === 'foul_tip'
        ) {
          totalSwings++;
        }
      }
    }
  }

  const obp = calcOBP(hits, walks, hbp, atBats, sacFlies);
  const slg = calcSLG(singles, doubles, triples, homeRuns, atBats);

  return {
    playerId,
    playerName,
    gamesPlayed,
    atBats, hits, singles, doubles, triples, homeRuns,
    rbi, walks, hbp, strikeouts,
    avg:          atBats > 0 ? hits / atBats : 0,
    obp,
    slg,
    ops:          obp + slg,
    swingMissRate: totalSwings > 0 ? swingMisses / totalSwings : 0,
    avgHitDistance:
      hitDistances.length > 0
        ? Math.round(hitDistances.reduce((a, b) => a + b, 0) / hitDistances.length)
        : null,
  };
}

/**
 * 複数試合にわたる投球成績を集計する
 */
export function aggregatePlayerPitching(
  playerId: string,
  playerName: string,
  games: GameState[],
): AggregatedPitchingStats {
  let gamesPlayed = 0;
  let totalPitches = 0;
  let strikeCount = 0;
  let battersFaced = 0;
  let strikeouts = 0;
  const velocities: number[] = [];
  const typeMap = new Map<string, { count: number; vels: number[] }>();
  const zoneCount: Record<string, number> = {};

  for (const game of games) {
    const myPitches = game.pitchLogs.filter((p) => p.pitcherId === playerId);
    if (myPitches.length === 0) continue;
    gamesPlayed++;
    totalPitches += myPitches.length;

    for (const p of myPitches) {
      if (STRIKE_PITCH_RESULTS.includes(p.result)) strikeCount++;
      if (p.velocity != null) velocities.push(p.velocity);

      // ゾーン分布
      zoneCount[p.zone] = (zoneCount[p.zone] ?? 0) + 1;

      // 球種別
      if (!typeMap.has(p.pitchType)) typeMap.set(p.pitchType, { count: 0, vels: [] });
      const entry = typeMap.get(p.pitchType)!;
      entry.count++;
      if (p.velocity != null) entry.vels.push(p.velocity);
    }

    // 対戦打者・三振集計
    const myAtBats = game.atBatLogs.filter(
      (l) => l.pitcherId === playerId && l.result !== null,
    );
    battersFaced += myAtBats.length;
    strikeouts += myAtBats.filter(
      (l) => l.result === 'strikeout' || l.result === 'strikeout_looking',
    ).length;
  }

  const pitchMix = Array.from(typeMap.entries())
    .map(([pitchType, { count, vels }]) => ({
      pitchType,
      pct: totalPitches > 0 ? count / totalPitches : 0,
      avgVel: vels.length > 0
        ? Math.round(vels.reduce((a, b) => a + b, 0) / vels.length)
        : null,
    }))
    .sort((a, b) => b.pct - a.pct);

  return {
    playerId,
    playerName,
    gamesPlayed,
    totalPitches,
    strikeRate:    totalPitches  > 0 ? strikeCount  / totalPitches  : 0,
    strikeoutRate: battersFaced  > 0 ? strikeouts   / battersFaced  : 0,
    avgVelocity:
      velocities.length > 0
        ? Math.round(velocities.reduce((a, b) => a + b, 0) / velocities.length)
        : null,
    maxVelocity: velocities.length > 0 ? Math.max(...velocities) : null,
    pitchMix,
    zoneDistribution: zoneCount,
  };
}

// ── Leaderboard builder ───────────────────────────────────────────────────────

/** 最小出場条件 */
const MIN_AT_BATS  = 3;
const MIN_PITCHES  = 10;
const TOP_N        = 3;

function makeCategory(
  id: string,
  label: string,
  icon: string,
  candidates: Array<{ playerId: string; playerName: string; value: number }>,
  fmt: (v: number) => string,
): LeaderboardCategory {
  return {
    id,
    label,
    icon,
    entries: candidates
      .sort((a, b) => b.value - a.value)
      .slice(0, TOP_N)
      .map((e, i) => ({
        rank: i + 1,
        playerId: e.playerId,
        playerName: e.playerName,
        value: e.value,
        displayValue: fmt(e.value),
      })),
  };
}

/**
 * 全試合からチーム内ランキングを生成する
 */
export function buildLeaderboard(games: GameState[]): LeaderboardData {
  if (games.length === 0) {
    return { categories: [], gameCount: 0, computedAt: Date.now() };
  }

  // 打者・投手の全プレイヤーを収集
  const allPlayers  = collectAllPlayers(games);
  const allPitchers = collectAllPitchers(games);

  // 全打撃成績を集計 (最小打席数以上のみ)
  const battingAll = Array.from(allPlayers.entries())
    .map(([id, name]) => aggregatePlayerBatting(id, name, games))
    .filter((s) => s.atBats >= MIN_AT_BATS);

  // 全投球成績を集計 (最小投球数以上のみ)
  const pitchingAll = Array.from(allPitchers.entries())
    .map(([id, name]) => aggregatePlayerPitching(id, name, games))
    .filter((s) => s.totalPitches >= MIN_PITCHES);

  const categories: LeaderboardCategory[] = [
    makeCategory(
      'avg',
      '打率 TOP3',
      'baseball-bat',
      battingAll.map((s) => ({ ...s, value: s.avg })),
      (v) => v.toFixed(3).replace(/^0/, '') || '.000',
    ),
    makeCategory(
      'hr',
      '本塁打 TOP3',
      'home-circle',
      battingAll.map((s) => ({ ...s, value: s.homeRuns })),
      (v) => `${v}本`,
    ),
    makeCategory(
      'ops',
      'OPS TOP3',
      'trending-up',
      battingAll.map((s) => ({ ...s, value: s.ops })),
      (v) => v.toFixed(3).replace(/^0/, '') || '.000',
    ),
    makeCategory(
      'maxVelocity',
      '球速王 TOP3',
      'speedometer',
      pitchingAll
        .filter((s) => s.maxVelocity !== null)
        .map((s) => ({ ...s, value: s.maxVelocity! })),
      (v) => `${v} km/h`,
    ),
    makeCategory(
      'kRate',
      '奪三振率 TOP3',
      'lightning-bolt',
      pitchingAll.map((s) => ({ ...s, value: s.strikeoutRate })),
      (v) => `${Math.round(v * 100)}%`,
    ),
  ].filter((c) => c.entries.length > 0);

  return {
    categories,
    gameCount: games.length,
    computedAt: Date.now(),
  };
}

// ── Stats summary for AI report ───────────────────────────────────────────────

/**
 * AI レポート用の入力サマリを生成する (1試合ぶんの集計)
 */
export function buildAIReportInput(game: GameState): {
  pitcher: AggregatedPitchingStats | null;
  batters: AggregatedBattingStats[];
  gameScore: { away: number; home: number };
  teamNames: { away: string; home: string };
} {
  const allPlayers = collectAllPlayers([game]);
  const allPitchers = collectAllPitchers([game]);

  const pitcher =
    allPitchers.size > 0
      ? aggregatePlayerPitching(
          [...allPitchers.keys()][0],
          [...allPitchers.values()][0],
          [game],
        )
      : null;

  const batters = Array.from(allPlayers.entries())
    .map(([id, name]) => aggregatePlayerBatting(id, name, [game]))
    .filter((s) => s.atBats > 0 || s.walks > 0);

  return {
    pitcher,
    batters,
    gameScore: {
      away: game.scoreboard.awayTotal,
      home: game.scoreboard.homeTotal,
    },
    teamNames: {
      away: game.awayTeam.name,
      home: game.homeTeam.name,
    },
  };
}
