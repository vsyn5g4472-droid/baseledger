/**
 * Analysis Engine
 *
 * 選手・バッテリー分析のコアロジック。
 * AsyncStorage の全試合ログを高速フィルタリングし、
 * バッテリーおよび打者のプロファイルを算出します。
 */

import type { GameState, PitchResult, AtBatResult } from '../types/game';

// ── Constants ─────────────────────────────────────────────────────────────────

const STRIKE_RESULTS: PitchResult[] = [
  'strike_called', 'strike_swinging', 'foul', 'foul_tip', 'in_play',
];
const SWING_RESULTS: PitchResult[] = [
  'strike_swinging', 'foul', 'foul_tip', 'in_play',
];
const HIT_RESULTS: AtBatResult[] = ['single', 'double', 'triple', 'home_run'];
const NON_AB_RESULTS: AtBatResult[] = [
  'walk', 'hit_by_pitch', 'sacrifice_bunt', 'sacrifice_fly',
];

/** 球速帯の定義 */
const VELOCITY_BANDS: Array<{ label: string; min: number; max: number }> = [
  { label: '~109',  min: 0,   max: 110 },
  { label: '110s',  min: 110, max: 120 },
  { label: '120s',  min: 120, max: 130 },
  { label: '130s',  min: 130, max: 140 },
  { label: '140s',  min: 140, max: 150 },
  { label: '150+',  min: 150, max: 999 },
];

const ALL_ZONES = ['1','2','3','4','5','6','7','8','9','BH','BL','BI','BO'] as const;

// ── Public Types ──────────────────────────────────────────────────────────────

/** バッテリーペア (投手 × 捕手) */
export interface BatteryPair {
  pitcherId:   string;
  pitcherName: string;
  catcherId:   string;
  catcherName: string;
  gameCount:   number;
}

export interface BatterInfo {
  batterId:   string;
  batterName: string;
  gameCount:  number;
}

// ── Battery Profile ───────────────────────────────────────────────────────────

export interface PitchTypeStat {
  type:        string;
  count:       number;
  pct:         number;
  avgVelocity: number | null;
}

export interface CountTendency {
  balls:      number;
  strikes:    number;
  total:      number;
  pitchTypes: PitchTypeStat[];
  topZones:   Array<{ zone: string; count: number; pct: number }>;
}

export interface FinishingPitch {
  pitchType:   string;
  zone:        string;
  count:       number;
  pct:         number;
  avgVelocity: number | null;
}

export interface BatteryProfile {
  pitcherId:    string;
  pitcherName:  string;
  catcherId:    string;
  catcherName:  string;
  totalGames:   number;
  totalPitches: number;
  strikeRate:   number;
  avgVelocity:  number | null;
  maxVelocity:  number | null;
  /** 2ストライク時のゾーン投球分布 */
  zone2Strike:       Record<string, number>;
  /** 2ストライク時の球種割合 */
  pitchType2Strike:  PitchTypeStat[];
  /** 決め球 (三振を奪った最終球) */
  finishingPitches:  FinishingPitch[];
  /** カウント別傾向 (主要6カウント) */
  countTendencies:   CountTendency[];
  /** ルールベースの自然言語サマリ */
  summary:           string;
}

// ── Batter Profile ────────────────────────────────────────────────────────────

export interface SprayPoint {
  id:                string;
  pitchType:         string;
  zone:              string;
  result:            AtBatResult | null;
  fieldX:            number;
  fieldY:            number;
  estimatedDistance: number;
  velocity:          number | undefined;
  isHit:             boolean;
}

export interface VelocityBandStat {
  label:        string;
  min:          number;
  max:          number;
  pitchesFaced: number;
  swings:       number;
  swingMisses:  number;
  contacts:     number;
  hits:         number;
}

export interface ZoneSwingStat {
  zone:          string;
  pitchesFaced:  number;
  swings:        number;
  swingMisses:   number;
  contacts:      number;
  hits:          number;
  /** 空振り率 = swingMisses / swings */
  swingMissRate: number;
  /** 被打率 = hits / pitchesFaced */
  hitRate:       number;
}

export interface PitchTypeVsBatter {
  type:          string;
  count:         number;
  swingMissRate: number;
  hitRate:       number;
  avgVelocity:   number | null;
}

export interface BatterProfile {
  batterId:          string;
  batterName:        string;
  totalGames:        number;
  totalAtBats:       number;
  totalPitchesFaced: number;
  /** 打率 */
  avg:               number;
  /** 三振率 */
  strikeoutRate:     number;
  /** 四球率 */
  walkRate:          number;
  /** 打球散布データ (SprayChart へ渡す) */
  sprayPoints:       SprayPoint[];
  /** 平均打球飛距離 */
  avgHitDistance:    number | null;
  /** ゾーン別空振り・打球成績 */
  zoneStats:         ZoneSwingStat[];
  /** 苦手コース (空振り率上位3) */
  weakZones:         ZoneSwingStat[];
  /** 得意コース (被打率上位3) */
  strongZones:       ZoneSwingStat[];
  /** 球速帯別成績 */
  velocityBands:     VelocityBandStat[];
  /** 球種別成績 */
  pitchTypeStats:    PitchTypeVsBatter[];
  /** 初球打ち率 */
  firstPitchSwingRate: number;
  /** バント率 (sacrifice_bunt / 打席) */
  buntRate:          number;
}

// ── Private helpers ───────────────────────────────────────────────────────────

/** 防御チームの捕手を推定する */
function deriveDefenseCatcher(
  game: GameState,
  half: 'top' | 'bottom',
): { id: string; name: string } | null {
  // top = away 攻撃, home 守備  / bottom = home 攻撃, away 守備
  const defTeam = half === 'top' ? game.homeTeam : game.awayTeam;
  const catcher = defTeam.roster.starters.find((p) => p.position === 'C');
  return catcher ? { id: catcher.id, name: catcher.name } : null;
}

/** 試合内の全選手 Map<id, name> */
function allPlayersMap(game: GameState): Map<string, string> {
  const m = new Map<string, string>();
  for (const team of [game.awayTeam, game.homeTeam]) {
    for (const p of [...team.roster.starters, ...team.roster.bench]) {
      m.set(p.id, p.name);
    }
  }
  return m;
}

/** ゾーンデータを頻度順に並べて上位 N 件を返す */
function topZones(
  zoneMap: Map<string, number>,
  total: number,
  n = 4,
): Array<{ zone: string; count: number; pct: number }> {
  return Array.from(zoneMap.entries())
    .sort(([, a], [, b]) => b - a)
    .slice(0, n)
    .map(([zone, count]) => ({ zone, count, pct: total > 0 ? count / total : 0 }));
}

/** 球種集計 Map<type, {count, velocities}> → PitchTypeStat[] */
function toPitchTypeStats(
  typeMap: Map<string, { count: number; vels: number[] }>,
  total: number,
): PitchTypeStat[] {
  return Array.from(typeMap.entries())
    .map(([type, { count, vels }]) => ({
      type,
      count,
      pct: total > 0 ? count / total : 0,
      avgVelocity:
        vels.length > 0
          ? Math.round(vels.reduce((a, b) => a + b, 0) / vels.length)
          : null,
    }))
    .sort((a, b) => b.count - a.count);
}

/** ルールベースのバッテリーサマリ文を生成 */
function buildBatterySummary(profile: Omit<BatteryProfile, 'summary'>): string {
  const parts: string[] = [];

  // 基本情報
  parts.push(
    `${profile.pitcherName} × ${profile.catcherName} のバッテリーは${profile.totalGames}試合・計${profile.totalPitches}球のデータから分析しました。`,
  );

  // ストライク率
  const strikeRatePct = Math.round(profile.strikeRate * 100);
  parts.push(
    `ストライク率は${strikeRatePct}%${strikeRatePct >= 65 ? 'と高く、積極的にゾーンを攻める傾向があります。' : 'とやや低め、ボールが先行しやすいです。'}`,
  );

  // 2ストライク時の傾向
  const topPitch2S = profile.pitchType2Strike[0];
  const topZone2S = Object.entries(profile.zone2Strike).sort(([, a], [, b]) => b - a)[0];
  if (topPitch2S && topZone2S) {
    const zoneLabel: Record<string, string> = {
      '1': '内角高め', '2': '高め中', '3': '外角高め',
      '4': '内角中', '5': '真ん中', '6': '外角中',
      '7': '内角低め', '8': '低め中', '9': '外角低め',
      'BH': '高めボール', 'BL': '低めボール', 'BI': '内角ボール', 'BO': '外角ボール',
    };
    parts.push(
      `追い込んだ局面では「${topPitch2S.type}（${Math.round(topPitch2S.pct * 100)}%）」を` +
      `「${zoneLabel[topZone2S[0]] ?? topZone2S[0]}」に集める傾向が顕著です。`,
    );
  }

  // 決め球
  const top = profile.finishingPitches[0];
  if (top) {
    parts.push(
      `三振の決め球は「${top.pitchType}」が最多（${Math.round(top.pct * 100)}%）で、` +
      `ゾーン${top.zone}へのコントロールが威力を発揮しています。`,
    );
  }

  // 球速
  if (profile.maxVelocity) {
    parts.push(`最高球速${profile.maxVelocity}km/h、平均${profile.avgVelocity ?? '?'}km/h。`);
  }

  return parts.join(' ');
}

// ── Public APIs ───────────────────────────────────────────────────────────────

/**
 * 全試合からバッテリーペア一覧を抽出する
 */
export function extractBatteryPairs(games: GameState[]): BatteryPair[] {
  const pairMap = new Map<
    string,
    { pitcher: { id: string; name: string }; catcher: { id: string; name: string }; games: Set<string> }
  >();

  for (const game of games) {
    const players = allPlayersMap(game);

    for (const half of ['top', 'bottom'] as const) {
      const halfPitches = game.pitchLogs.filter((p) => p.inning.half === half);
      if (halfPitches.length === 0) continue;

      const catcher = deriveDefenseCatcher(game, half);
      if (!catcher) continue;

      const pitcherIds = [...new Set(halfPitches.map((p) => p.pitcherId))];

      for (const pitcherId of pitcherIds) {
        const pitcherName = players.get(pitcherId);
        if (!pitcherName) continue;

        const key = `${pitcherId}::${catcher.id}`;
        if (!pairMap.has(key)) {
          pairMap.set(key, {
            pitcher: { id: pitcherId, name: pitcherName },
            catcher,
            games: new Set(),
          });
        }
        pairMap.get(key)!.games.add(game.id);
      }
    }
  }

  return Array.from(pairMap.values())
    .map(({ pitcher, catcher, games }) => ({
      pitcherId:   pitcher.id,
      pitcherName: pitcher.name,
      catcherId:   catcher.id,
      catcherName: catcher.name,
      gameCount:   games.size,
    }))
    .sort((a, b) => b.gameCount - a.gameCount);
}

/**
 * 全試合から打者一覧を抽出する（1打席以上の選手のみ）
 */
export function extractBatters(games: GameState[]): BatterInfo[] {
  const batterMap = new Map<string, { name: string; games: Set<string> }>();

  for (const game of games) {
    for (const log of game.atBatLogs) {
      const players = allPlayersMap(game);
      const name = players.get(log.batterId);
      if (!name) continue;

      if (!batterMap.has(log.batterId)) {
        batterMap.set(log.batterId, { name, games: new Set() });
      }
      batterMap.get(log.batterId)!.games.add(game.id);
    }
  }

  return Array.from(batterMap.entries())
    .map(([id, { name, games }]) => ({
      batterId:   id,
      batterName: name,
      gameCount:  games.size,
    }))
    .sort((a, b) => b.gameCount - a.gameCount);
}

/**
 * バッテリープロファイルを構築する
 */
export function buildBatteryProfile(
  games: GameState[],
  pitcherId: string,
  catcherId: string,
): BatteryProfile {
  // 当該バッテリーが登板した試合のみフィルタ
  const relevantGames = games.filter((game) => {
    return game.pitchLogs.some((p) => p.pitcherId === pitcherId);
  });

  const allPitches = relevantGames.flatMap((g) =>
    g.pitchLogs.filter((p) => p.pitcherId === pitcherId),
  );
  const allAtBats = relevantGames.flatMap((g) =>
    g.atBatLogs.filter((l) => l.pitcherId === pitcherId),
  );

  const pitcherName =
    relevantGames.flatMap((g) => allPlayersMap(g)).reduce(
      (name, _) => name,
      relevantGames[0] ? allPlayersMap(relevantGames[0]).get(pitcherId) ?? pitcherId : pitcherId,
    );

  // 捕手名の解決
  let catcherName = catcherId;
  for (const g of relevantGames) {
    const n = allPlayersMap(g).get(catcherId);
    if (n) { catcherName = n; break; }
  }

  // ── 基本統計 ──────────────────────────────────────────────────────────────
  const velocities = allPitches.filter((p) => p.velocity != null).map((p) => p.velocity!);
  const strikeCount = allPitches.filter((p) => STRIKE_RESULTS.includes(p.result)).length;

  // ── 2ストライク時の分析 ───────────────────────────────────────────────────
  const pitches2S = allPitches.filter(
    (p) => p.countBefore.strikes === 2,
  );
  const zone2Strike: Record<string, number> = {};
  const typeMap2S = new Map<string, { count: number; vels: number[] }>();

  for (const p of pitches2S) {
    zone2Strike[p.zone] = (zone2Strike[p.zone] ?? 0) + 1;
    if (!typeMap2S.has(p.pitchType)) typeMap2S.set(p.pitchType, { count: 0, vels: [] });
    const e = typeMap2S.get(p.pitchType)!;
    e.count++;
    if (p.velocity != null) e.vels.push(p.velocity);
  }

  // ── 決め球 (三振の最終球) ─────────────────────────────────────────────────
  const strikeoutLogs = allAtBats.filter(
    (l) => l.result === 'strikeout' || l.result === 'strikeout_looking',
  );
  const finishingMap = new Map<string, { count: number; vels: number[] }>();

  for (const log of strikeoutLogs) {
    const lastPitch = log.pitches[log.pitches.length - 1];
    if (!lastPitch) continue;
    const key = `${lastPitch.pitchType}::${lastPitch.zone}`;
    if (!finishingMap.has(key)) finishingMap.set(key, { count: 0, vels: [] });
    const e = finishingMap.get(key)!;
    e.count++;
    if (lastPitch.velocity != null) e.vels.push(lastPitch.velocity);
  }

  const totalFinishing = strikeoutLogs.length;
  const finishingPitches: FinishingPitch[] = Array.from(finishingMap.entries())
    .map(([key, { count, vels }]) => {
      const [pitchType, zone] = key.split('::');
      return {
        pitchType,
        zone,
        count,
        pct: totalFinishing > 0 ? count / totalFinishing : 0,
        avgVelocity:
          vels.length > 0
            ? Math.round(vels.reduce((a, b) => a + b, 0) / vels.length)
            : null,
      };
    })
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  // ── カウント別傾向 ────────────────────────────────────────────────────────
  // 重要カウント: 0-0, 2-0, 3-1, 0-2, 1-2, 2-2, 3-2
  const KEY_COUNTS = [
    { balls: 0, strikes: 0 },
    { balls: 2, strikes: 0 },
    { balls: 3, strikes: 1 },
    { balls: 0, strikes: 2 },
    { balls: 1, strikes: 2 },
    { balls: 2, strikes: 2 },
    { balls: 3, strikes: 2 },
  ];

  const countTendencies: CountTendency[] = KEY_COUNTS.map(({ balls, strikes }) => {
    const countPitches = allPitches.filter(
      (p) => p.countBefore.balls === balls && p.countBefore.strikes === strikes,
    );
    const total = countPitches.length;
    const typeMap = new Map<string, { count: number; vels: number[] }>();
    const zoneMap = new Map<string, number>();

    for (const p of countPitches) {
      if (!typeMap.has(p.pitchType)) typeMap.set(p.pitchType, { count: 0, vels: [] });
      const e = typeMap.get(p.pitchType)!;
      e.count++;
      if (p.velocity != null) e.vels.push(p.velocity);
      zoneMap.set(p.zone, (zoneMap.get(p.zone) ?? 0) + 1);
    }

    return {
      balls,
      strikes,
      total,
      pitchTypes: toPitchTypeStats(typeMap, total).slice(0, 3),
      topZones:   topZones(zoneMap, total, 3),
    };
  }).filter((c) => c.total > 0);

  // ── 各名前の解決 ──────────────────────────────────────────────────────────
  let resolvedPitcherName = pitcherId;
  for (const g of relevantGames) {
    const n = allPlayersMap(g).get(pitcherId);
    if (n) { resolvedPitcherName = n; break; }
  }

  const base: Omit<BatteryProfile, 'summary'> = {
    pitcherId,
    pitcherName: resolvedPitcherName,
    catcherId,
    catcherName,
    totalGames:   relevantGames.length,
    totalPitches: allPitches.length,
    strikeRate:   allPitches.length > 0 ? strikeCount / allPitches.length : 0,
    avgVelocity:
      velocities.length > 0
        ? Math.round(velocities.reduce((a, b) => a + b, 0) / velocities.length)
        : null,
    maxVelocity: velocities.length > 0 ? Math.max(...velocities) : null,
    zone2Strike,
    pitchType2Strike: toPitchTypeStats(typeMap2S, pitches2S.length),
    finishingPitches,
    countTendencies,
  };

  return { ...base, summary: buildBatterySummary(base) };
}

/**
 * 打者プロファイルを構築する
 */
export function buildBatterProfile(
  games: GameState[],
  batterId: string,
): BatterProfile {
  // 当該打者が登場した試合のみフィルタ
  const relevantGames = games.filter((g) =>
    g.atBatLogs.some((l) => l.batterId === batterId),
  );

  const allAtBats = relevantGames.flatMap((g) =>
    g.atBatLogs.filter((l) => l.batterId === batterId),
  );
  const completedAtBats = allAtBats.filter((l) => l.result !== null);
  const allPitches = allAtBats.flatMap((l) => l.pitches);

  // 打者名解決
  let batterName = batterId;
  for (const g of relevantGames) {
    const n = allPlayersMap(g).get(batterId);
    if (n) { batterName = n; break; }
  }

  // ── 基本打撃成績 ──────────────────────────────────────────────────────────
  let atBats = 0, hits = 0, strikeouts = 0, walks = 0;
  const hitDistances: number[] = [];

  for (const log of completedAtBats) {
    const r = log.result!;
    if (!NON_AB_RESULTS.includes(r)) atBats++;
    if (HIT_RESULTS.includes(r)) hits++;
    if (r === 'strikeout' || r === 'strikeout_looking') strikeouts++;
    if (r === 'walk') walks++;
    if (log.battedBall?.estimatedDistance) hitDistances.push(log.battedBall.estimatedDistance);
  }

  // ── 打球散布データ ────────────────────────────────────────────────────────
  const sprayPoints: SprayPoint[] = [];
  for (const log of completedAtBats) {
    if (!log.battedBall) continue;
    const lastPitch = log.pitches[log.pitches.length - 1];
    sprayPoints.push({
      id:                log.id,
      pitchType:         lastPitch?.pitchType ?? 'unknown',
      zone:              lastPitch?.zone      ?? 'unknown',
      result:            log.result,
      fieldX:            log.battedBall.fieldX,
      fieldY:            log.battedBall.fieldY,
      estimatedDistance: log.battedBall.estimatedDistance,
      velocity:          lastPitch?.velocity,
      isHit:             HIT_RESULTS.includes(log.result as AtBatResult),
    });
  }

  // ── コース別成績 ─────────────────────────────────────────────────────────
  const zoneAccum = new Map<string, {
    pitchesFaced: number; swings: number; swingMisses: number; contacts: number; hits: number;
  }>();

  for (const z of ALL_ZONES) {
    zoneAccum.set(z, { pitchesFaced: 0, swings: 0, swingMisses: 0, contacts: 0, hits: 0 });
  }

  for (const log of allAtBats) {
    const isHitLog = log.result && HIT_RESULTS.includes(log.result);
    const lastPitch = log.pitches[log.pitches.length - 1];

    for (const pitch of log.pitches) {
      const acc = zoneAccum.get(pitch.zone);
      if (!acc) continue;
      acc.pitchesFaced++;

      const isSwing = SWING_RESULTS.includes(pitch.result);
      if (isSwing) {
        acc.swings++;
        if (pitch.result === 'strike_swinging') acc.swingMisses++;
        else acc.contacts++;
      }
      // ヒットはその打席の最終球のゾーンで記録
      if (pitch.id === lastPitch?.id && isHitLog) acc.hits++;
    }
  }

  const zoneStats: ZoneSwingStat[] = Array.from(zoneAccum.entries())
    .filter(([, v]) => v.pitchesFaced > 0)
    .map(([zone, v]) => ({
      zone,
      ...v,
      swingMissRate: v.swings > 0 ? v.swingMisses / v.swings : 0,
      hitRate:       v.pitchesFaced > 0 ? v.hits / v.pitchesFaced : 0,
    }));

  const weakZones = [...zoneStats]
    .filter((z) => z.swings >= 3)
    .sort((a, b) => b.swingMissRate - a.swingMissRate)
    .slice(0, 3);

  const strongZones = [...zoneStats]
    .filter((z) => z.pitchesFaced >= 3)
    .sort((a, b) => b.hitRate - a.hitRate)
    .slice(0, 3);

  // ── 球速帯別成績 ─────────────────────────────────────────────────────────
  const velocityBands: VelocityBandStat[] = VELOCITY_BANDS.map((band) => {
    const bandPitches = allPitches.filter(
      (p) => p.velocity != null && p.velocity >= band.min && p.velocity < band.max,
    );
    let swings = 0, swingMisses = 0, contacts = 0;
    for (const p of bandPitches) {
      if (SWING_RESULTS.includes(p.result)) {
        swings++;
        if (p.result === 'strike_swinging') swingMisses++;
        else contacts++;
      }
    }
    // ヒット数: この球速帯の投球がインプレイになった打席で安打になった数
    const hitsInBand = bandPitches.filter((p) => {
      if (p.result !== 'in_play') return false;
      const log = allAtBats.find((l) => l.pitches.some((pi) => pi.id === p.id));
      return log?.result && HIT_RESULTS.includes(log.result);
    }).length;

    return {
      ...band,
      pitchesFaced: bandPitches.length,
      swings,
      swingMisses,
      contacts,
      hits: hitsInBand,
    };
  }).filter((b) => b.pitchesFaced > 0);

  // ── 球種別成績 ───────────────────────────────────────────────────────────
  const pitchTypeAccum = new Map<string, {
    count: number; swings: number; misses: number; hits: number; vels: number[];
  }>();

  for (const pitch of allPitches) {
    if (!pitchTypeAccum.has(pitch.pitchType)) {
      pitchTypeAccum.set(pitch.pitchType, { count: 0, swings: 0, misses: 0, hits: 0, vels: [] });
    }
    const e = pitchTypeAccum.get(pitch.pitchType)!;
    e.count++;
    if (pitch.velocity != null) e.vels.push(pitch.velocity);
    if (SWING_RESULTS.includes(pitch.result)) {
      e.swings++;
      if (pitch.result === 'strike_swinging') e.misses++;
    }
    if (pitch.result === 'in_play') {
      const log = allAtBats.find((l) => l.pitches.some((pi) => pi.id === pitch.id));
      if (log?.result && HIT_RESULTS.includes(log.result)) e.hits++;
    }
  }

  const pitchTypeStats: PitchTypeVsBatter[] = Array.from(pitchTypeAccum.entries())
    .map(([type, { count, swings, misses, hits, vels }]) => ({
      type,
      count,
      swingMissRate: swings > 0 ? misses / swings : 0,
      hitRate:       count > 0  ? hits  / count   : 0,
      avgVelocity:
        vels.length > 0
          ? Math.round(vels.reduce((a, b) => a + b, 0) / vels.length)
          : null,
    }))
    .sort((a, b) => b.count - a.count);

  // ── 作戦傾向 ─────────────────────────────────────────────────────────────
  const buntCount = completedAtBats.filter((l) => l.result === 'sacrifice_bunt').length;
  const firstPitchSwings = allAtBats.filter((l) => {
    const fp = l.pitches[0];
    return fp && SWING_RESULTS.includes(fp.result);
  }).length;

  return {
    batterId,
    batterName,
    totalGames:        relevantGames.length,
    totalAtBats:       atBats,
    totalPitchesFaced: allPitches.length,
    avg:               atBats > 0 ? hits / atBats : 0,
    strikeoutRate:     atBats > 0 ? strikeouts / atBats : 0,
    walkRate:
      (atBats + walks) > 0 ? walks / (atBats + walks) : 0,
    sprayPoints,
    avgHitDistance:
      hitDistances.length > 0
        ? Math.round(hitDistances.reduce((a, b) => a + b, 0) / hitDistances.length)
        : null,
    zoneStats,
    weakZones,
    strongZones,
    velocityBands,
    pitchTypeStats,
    firstPitchSwingRate: allAtBats.length > 0 ? firstPitchSwings / allAtBats.length : 0,
    buntRate:            completedAtBats.length > 0 ? buntCount / completedAtBats.length : 0,
  };
}
