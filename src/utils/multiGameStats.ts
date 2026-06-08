/**
 * Multi-game statistics aggregation
 *
 * Aggregates batting and pitching metrics across multiple GameState objects.
 * Used for leaderboard computation and AI report generation.
 *
 * Player identity: If a player has a `realPlayerId` (linked to team roster master),
 * that ID is used as the aggregation key, enabling consistent cross-game stats.
 * Players without a `realPlayerId` fall back to their game-scoped Player.id.
 */

import type { GameState, AtBatResult, AtBatLog, PitchResult, Player } from '../types/game';
import { buildBattingLine, calcWOBA } from '../services/analyticsEngine';

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
  /** 最大打球飛距離 (m) */
  maxHitDistance: number | null;
  /** 盗塁数 */
  stolenBases: number;
}

export interface AggregatedPitchingStats {
  playerId: string;
  playerName: string;
  gamesPlayed: number;
  totalPitches: number;
  /** 対戦打者数 */
  battersFaced: number;
  /** 奪三振数 */
  totalStrikeouts: number;
  /** ストライク率 */
  strikeRate: number;
  /** 奪三振率 (三振 / 対戦打者数) */
  strikeoutRate: number;
  /** 平均球速 (km/h) — 球速計測があった投球のみ */
  avgVelocity: number | null;
  /** 最高球速 (km/h) */
  maxVelocity: number | null;
  /** 与四球数 */
  walksAllowed: number;
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

/** 記録試合に登場したチーム名一覧（重複なし・五十音順） */
export function collectTeamNamesFromGames(games: GameState[]): string[] {
  const names = new Set<string>();
  for (const g of games) {
    const away = g.awayTeam.name?.trim();
    const home = g.homeTeam.name?.trim();
    if (away) names.add(away);
    if (home) names.add(home);
  }
  return [...names].sort((a, b) => a.localeCompare(b, 'ja'));
}

function getTeamRoster(game: GameState, teamName: string): Player[] | null {
  const team =
    game.awayTeam.name === teamName ? game.awayTeam
    : game.homeTeam.name === teamName ? game.homeTeam
    : null;
  if (!team) return null;
  return [
    ...team.roster.starters,
    ...team.roster.bench,
    ...(team.roster.pitcher ? [team.roster.pitcher] : []),
  ];
}

function playerBelongsToTeamInGame(
  game: GameState,
  teamName: string,
  gamePlayerId: string,
): boolean {
  const roster = getTeamRoster(game, teamName);
  if (!roster) return false;
  return roster.some((p) => p.id === gamePlayerId);
}

/** 指定チームのロースター選手 (resolvedId → { name, resolvedId }) を収集 */
function collectPlayersForTeam(
  games: GameState[],
  teamName: string,
): Map<string, { name: string; resolvedId: string }> {
  const m = new Map<string, { name: string; resolvedId: string }>();
  for (const g of games) {
    const roster = getTeamRoster(g, teamName);
    if (!roster) continue;
    for (const p of roster) {
      const key = p.realPlayerId ?? p.id;
      if (!m.has(key)) m.set(key, { name: p.name, resolvedId: key });
    }
  }
  return m;
}

/** 指定チームの投手 (resolvedId → name) を収集 */
function collectPitchersForTeam(games: GameState[], teamName: string): Map<string, string> {
  const m = new Map<string, string>();
  for (const g of games) {
    const roster = getTeamRoster(g, teamName);
    if (!roster) continue;
    const rosterIds = new Set(roster.map((p) => p.id));
    for (const p of g.pitchLogs) {
      if (!rosterIds.has(p.pitcherId)) continue;
      const player = roster.find((pl) => pl.id === p.pitcherId);
      if (player) {
        const key = player.realPlayerId ?? player.id;
        if (!m.has(key)) m.set(key, player.name);
      }
    }
  }
  return m;
}

/** 全試合から全プレイヤー (resolvedId → { name, resolvedId }) を収集 */
function collectAllPlayers(games: GameState[]): Map<string, { name: string; resolvedId: string }> {
  const m = new Map<string, { name: string; resolvedId: string }>();
  for (const g of games) {
    for (const team of [g.awayTeam, g.homeTeam]) {
      for (const p of [...team.roster.starters, ...team.roster.bench]) {
        const key = p.realPlayerId ?? p.id;
        if (!m.has(key)) m.set(key, { name: p.name, resolvedId: key });
      }
    }
  }
  return m;
}

/** 全試合から全投手 (resolvedId → name) を収集 — pitchLogs を基にする */
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
      const player = allPlayers.find((pl) => pl.id === p.pitcherId);
      if (player) {
        const key = player.realPlayerId ?? player.id;
        if (!m.has(key)) m.set(key, player.name);
      }
    }
  }
  return m;
}

/**
 * 1試合内の Player.id → resolvedId (realPlayerId or Player.id) マップを生成する
 * atBatLog.batterId / pitchLog.pitcherId を集計キーに変換するために使う
 */
function buildRealPlayerMap(game: GameState): Map<string, string> {
  const m = new Map<string, string>();
  for (const team of [game.awayTeam, game.homeTeam]) {
    for (const p of [...team.roster.starters, ...team.roster.bench]) {
      m.set(p.id, p.realPlayerId ?? p.id);
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
  teamName?: string,
): AggregatedBattingStats {
  let gamesPlayed = 0;
  let atBats = 0, hits = 0, singles = 0, doubles = 0, triples = 0, homeRuns = 0;
  let rbi = 0, walks = 0, hbp = 0, sacFlies = 0, strikeouts = 0;
  let swingMisses = 0, totalSwings = 0;
  let stolenBases = 0;
  const hitDistances: number[] = [];

  for (const game of games) {
    const realPlayerMap = buildRealPlayerMap(game);
    const myLogs = game.atBatLogs.filter((l) => {
      if (realPlayerMap.get(l.batterId) !== playerId || l.result === null) return false;
      if (teamName && !playerBelongsToTeamInGame(game, teamName, l.batterId)) return false;
      return true;
    });
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

    // 盗塁数集計
    for (const sb of (game.stolenBaseLogs ?? [])) {
      if (realPlayerMap.get(sb.runnerId) !== playerId || sb.result !== 'safe') continue;
      if (teamName && !playerBelongsToTeamInGame(game, teamName, sb.runnerId)) continue;
      stolenBases++;
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
    maxHitDistance:
      hitDistances.length > 0
        ? Math.max(...hitDistances)
        : null,
    stolenBases,
  };
}

/**
 * 複数試合にわたる投球成績を集計する
 */
export function aggregatePlayerPitching(
  playerId: string,
  playerName: string,
  games: GameState[],
  teamName?: string,
): AggregatedPitchingStats {
  let gamesPlayed = 0;
  let totalPitches = 0;
  let strikeCount = 0;
  let battersFaced = 0;
  let strikeouts = 0;
  let walksAllowed = 0;
  const velocities: number[] = [];
  const typeMap = new Map<string, { count: number; vels: number[] }>();
  const zoneCount: Record<string, number> = {};

  for (const game of games) {
    const realPlayerMap = buildRealPlayerMap(game);
    const myPitches = game.pitchLogs.filter((p) => {
      if (realPlayerMap.get(p.pitcherId) !== playerId) return false;
      if (teamName && !playerBelongsToTeamInGame(game, teamName, p.pitcherId)) return false;
      return true;
    });
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
    const myAtBats = game.atBatLogs.filter((l) => {
      if (realPlayerMap.get(l.pitcherId) !== playerId || l.result === null) return false;
      if (teamName && !playerBelongsToTeamInGame(game, teamName, l.pitcherId)) return false;
      return true;
    });
    battersFaced += myAtBats.length;
    strikeouts += myAtBats.filter(
      (l) => l.result === 'strikeout' || l.result === 'strikeout_looking',
    ).length;
    walksAllowed += myAtBats.filter((l) => l.result === 'walk').length;
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
    battersFaced,
    totalStrikeouts: strikeouts,
    strikeRate:    totalPitches  > 0 ? strikeCount  / totalPitches  : 0,
    strikeoutRate: battersFaced  > 0 ? strikeouts   / battersFaced  : 0,
    avgVelocity:
      velocities.length > 0
        ? Math.round(velocities.reduce((a, b) => a + b, 0) / velocities.length)
        : null,
    maxVelocity: velocities.length > 0 ? Math.max(...velocities) : null,
    walksAllowed,
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
 * @param teamFilter チーム名。指定時はそのチーム所属選手のデータのみ集計
 */
export function buildLeaderboard(games: GameState[], teamFilter?: string | null): LeaderboardData {
  if (games.length === 0) {
    return { categories: [], gameCount: 0, computedAt: Date.now() };
  }

  const scopedGames = teamFilter
    ? games.filter((g) => g.awayTeam.name === teamFilter || g.homeTeam.name === teamFilter)
    : games;

  if (scopedGames.length === 0) {
    return { categories: [], gameCount: 0, computedAt: Date.now() };
  }

  const teamName = teamFilter ?? undefined;

  // 打者・投手の全プレイヤーを収集
  const allPlayers = teamName
    ? collectPlayersForTeam(scopedGames, teamName)
    : collectAllPlayers(scopedGames);
  const allPitchers = teamName
    ? collectPitchersForTeam(scopedGames, teamName)
    : collectAllPitchers(scopedGames);

  // 全打撃成績を集計 (最小打席数以上のみ)
  const battingAll = Array.from(allPlayers.entries())
    .map(([id, { name }]) => aggregatePlayerBatting(id, name, scopedGames, teamName))
    .filter((s) => s.atBats >= MIN_AT_BATS);

  // 全投球成績を集計 (最小投球数以上のみ)
  const pitchingAll = Array.from(allPitchers.entries())
    .map(([id, name]) => aggregatePlayerPitching(id, name, scopedGames, teamName))
    .filter((s) => s.totalPitches >= MIN_PITCHES);

  // wOBA 計算用: 打者ごとの AtBatLog を収集
  const playerAtBatLogs = new Map<string, AtBatLog[]>();
  for (const game of scopedGames) {
    const realPlayerMap = buildRealPlayerMap(game);
    for (const log of game.atBatLogs) {
      if (!log.result) continue;
      if (teamName && !playerBelongsToTeamInGame(game, teamName, log.batterId)) continue;
      const resolvedId = realPlayerMap.get(log.batterId) ?? log.batterId;
      const existing = playerAtBatLogs.get(resolvedId) ?? [];
      existing.push(log);
      playerAtBatLogs.set(resolvedId, existing);
    }
  }

  const categories: LeaderboardCategory[] = [
    // ── 打者カテゴリー ──
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
      'rbi',
      '打点 TOP3',
      'human-handsup',
      battingAll.map((s) => ({ ...s, value: s.rbi })),
      (v) => `${v}点`,
    ),
    makeCategory(
      'kPct',
      '三振率 K% TOP3',
      'close-circle-outline',
      battingAll
        .filter((s) => s.atBats > 0)
        // 低い方が良い指標 → 符号反転して makeCategory の降順ソートに乗せる
        .map((s) => ({ ...s, value: -(s.strikeouts / s.atBats) })),
      (v) => `${Math.round(-v * 100)}%`,
    ),
    makeCategory(
      'bbPct',
      '四球率 BB% TOP3',
      'eye-check-outline',
      battingAll
        .filter((s) => (s.atBats + s.walks + s.hbp) > 0)
        .map((s) => ({
          ...s,
          value: s.walks / (s.atBats + s.walks + s.hbp),
        })),
      (v) => `${Math.round(v * 100)}%`,
    ),
    makeCategory(
      'woba',
      'wOBA TOP3',
      'chart-areaspline',
      battingAll.map((s) => {
        const logs = playerAtBatLogs.get(s.playerId) ?? [];
        const line = buildBattingLine(logs);
        return { ...s, value: calcWOBA(line) };
      }),
      (v) => v.toFixed(3).replace(/^0/, '') || '.000',
    ),
    makeCategory(
      'avgHitDist',
      '平均打球距離 TOP3',
      'arrow-expand-horizontal',
      battingAll
        .filter((s) => s.avgHitDistance !== null && s.avgHitDistance > 0)
        .map((s) => ({ ...s, value: s.avgHitDistance! })),
      (v) => `${Math.round(v)}m`,
    ),
    makeCategory(
      'maxHitDist',
      '飛距離最大 TOP3',
      'arrow-expand-right',
      battingAll
        .filter((s) => s.maxHitDistance !== null && s.maxHitDistance > 0)
        .map((s) => ({ ...s, value: s.maxHitDistance! })),
      (v) => `${Math.round(v)}m`,
    ),
    makeCategory(
      'sb',
      '盗塁数 TOP3',
      'run-fast',
      battingAll
        .filter((s) => s.stolenBases > 0)
        .map((s) => ({ ...s, value: s.stolenBases })),
      (v) => `${v}SB`,
    ),
    makeCategory(
      'obp',
      '出塁率 TOP3',
      'account-check-outline',
      battingAll
        .filter((s) => (s.atBats + s.walks + s.hbp) > 0)
        .map((s) => ({ ...s, value: s.obp })),
      (v) => v.toFixed(3).replace(/^0/, '') || '.000',
    ),
    makeCategory(
      'bbhbp',
      '四死球数 TOP3',
      'walk',
      battingAll
        .filter((s) => (s.walks + s.hbp) > 0)
        .map((s) => ({ ...s, value: s.walks + s.hbp })),
      (v) => `${v}`,
    ),
    // ── 投手カテゴリー ──
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
      'avgVelocity',
      '平均球速 TOP3',
      'speedometer-medium',
      pitchingAll
        .filter((s) => s.avgVelocity !== null)
        .map((s) => ({ ...s, value: s.avgVelocity! })),
      (v) => `${v} km/h`,
    ),
    makeCategory(
      'kRate',
      '奪三振率 TOP3',
      'lightning-bolt',
      pitchingAll.map((s) => ({ ...s, value: s.strikeoutRate })),
      (v) => `${Math.round(v * 100)}%`,
    ),
    makeCategory(
      'totalK',
      '奪三振数 TOP3',
      'lightning-bolt-circle',
      pitchingAll.map((s) => ({ ...s, value: s.totalStrikeouts })),
      (v) => `${v}K`,
    ),
    makeCategory(
      'strikeRate',
      'ストライク率 TOP3',
      'bullseye-arrow',
      pitchingAll.map((s) => ({ ...s, value: s.strikeRate })),
      (v) => `${Math.round(v * 100)}%`,
    ),
    makeCategory(
      'walksAllowed',
      '与四球 TOP3',
      'arrow-bottom-right-bold-outline',
      pitchingAll
        .filter((s) => s.battersFaced > 0)
        // 低い方が良い → 符号反転
        .map((s) => ({ ...s, value: -s.walksAllowed })),
      (v) => `${-v}BB`,
    ),
  ].filter((c) => c.entries.length > 0);

  return {
    categories,
    gameCount: scopedGames.length,
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
    .map(([id, { name }]) => aggregatePlayerBatting(id, name, [game]))
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
