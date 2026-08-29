/**
 * Analysis Engine
 *
 * 選手・バッテリー分析のコアロジック。
 * AsyncStorage の全試合ログを高速フィルタリングし、
 * バッテリーおよび打者のプロファイルを算出します。
 */

import type { GameState, PitchResult, AtBatResult } from '../types/game';
import { buildRealPlayerMap, resolvePlayerId } from './multiGameStats';
import type { PlayerMergeMap } from '../services/playerMergeService';

// ── Constants ─────────────────────────────────────────────────────────────────

const STRIKE_RESULTS: PitchResult[] = [
  'strike_called', 'strike_swinging', 'foul', 'foul_tip', 'in_play',
];
const SWING_RESULTS: PitchResult[] = [
  'strike_swinging', 'foul', 'foul_tip', 'in_play',
];
const HIT_RESULTS: AtBatResult[] = ['single', 'double', 'triple', 'home_run'];
const NON_AB_RESULTS: AtBatResult[] = [
  'walk', 'hit_by_pitch',
  'sacrifice_bunt', // TODO: バント打者が出塁した場合も sacrifice_bunt のままのため打数除外が不正確になりうる
  'sacrifice_fly',
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

export interface PitcherInfo {
  pitcherId:   string;
  pitcherName: string;
  gameCount:   number;
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
  /** 2ストライク時のゾーン投球分布（対右打者） */
  zone2StrikeR:      Record<string, number>;
  /** 2ストライク時のゾーン投球分布（対左打者） */
  zone2StrikeL:      Record<string, number>;
  /** 全球ゾーン投球分布（対右打者） */
  zoneAllR:          Record<string, number>;
  /** 全球ゾーン投球分布（対左打者） */
  zoneAllL:          Record<string, number>;
  /** 2ストライク時の球種割合 */
  pitchType2Strike:  PitchTypeStat[];
  /** 決め球 (三振を奪った最終球) */
  finishingPitches:  FinishingPitch[];
  /** カウント別傾向 (主要6カウント) */
  countTendencies:   CountTendency[];
  /** ルールベースの自然言語サマリ */
  summary:           string;
  /** 打席メモ（AI分析用。「第N打席メモ: …」形式） */
  atBatMemos:        string[];
}

export interface PitcherProfile {
  pitcherId:    string;
  pitcherName:  string;
  totalGames:   number;
  totalPitches: number;
  strikeRate:   number;
  avgVelocity:  number | null;
  maxVelocity:  number | null;
  /** 全体ゾーン分布 */
  zoneDistribution:  Record<string, number>;
  /** 全球種割合 */
  pitchTypeAll:      PitchTypeStat[];
  /** 2ストライク時のゾーン分布 */
  zone2Strike:       Record<string, number>;
  zone2StrikeR:      Record<string, number>;
  zone2StrikeL:      Record<string, number>;
  pitchType2Strike:  PitchTypeStat[];
  finishingPitches:  FinishingPitch[];
  countTendencies:   CountTendency[];
  /** 一緒に組んだ捕手一覧（pitchCount 降順） */
  catchers: Array<{ catcherId: string; catcherName: string; pitchCount: number }>;
  summary:  string;
  /** 打席メモ（AI分析用。「第N打席メモ: …」形式） */
  atBatMemos: string[];
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
  /** 打席メモ（AI分析用。「第N打席メモ: …」形式） */
  atBatMemos:        string[];
}

/** 打席ログからメモを時系列で収集する（空メモは除外） */
export function collectAtBatMemos(atBats: { note?: string; timestamp: number }[]): string[] {
  return atBats
    .filter((l) => l.note?.trim())
    .sort((a, b) => a.timestamp - b.timestamp)
    .map((log, i) => `第${i + 1}打席メモ: ${log.note!.trim()}`);
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

/**
 * 試合内の全選手 Map<id, name>
 * 試合スコープの Player.id と realPlayerId の両方をキーに登録するため、
 * どちらの ID で引いても名前を解決できる。
 */
function allPlayersMap(game: GameState, mergeMap?: PlayerMergeMap): Map<string, string> {
  const m = new Map<string, string>();
  for (const team of [game.awayTeam, game.homeTeam]) {
    const players = [
      ...team.roster.starters,
      ...team.roster.bench,
      ...(team.roster.pitcher ? [team.roster.pitcher] : []),
    ];
    for (const p of players) {
      m.set(p.id, p.name);
      if (p.realPlayerId) m.set(p.realPlayerId, p.name);
      m.set(resolvePlayerId(p, mergeMap), p.name);
    }
  }

  // 過去投手の記録だけを移管した場合、現在のロースターは意図的に変更しない。
  // 移管履歴の名前スナップショットも参照し、投球ログ側の新しい ID を分析で解決する。
  const realPlayerMap = buildRealPlayerMap(game, mergeMap);
  for (const log of game.pitcherReassignmentLogs ?? []) {
    const name = log.toPitcherName.trim();
    if (!name) continue;
    if (!m.has(log.toPitcherId)) m.set(log.toPitcherId, name);
    const resolvedId = realPlayerMap.get(log.toPitcherId)
      ?? mergeMap?.get(log.toPitcherId)
      ?? log.toPitcherId;
    if (!m.has(resolvedId)) m.set(resolvedId, name);
  }
  return m;
}

/** 試合内の全選手 Map<id, bats>（allPlayersMap と同じく両 ID をキーにする） */
function allPlayersBatsMap(game: GameState, mergeMap?: PlayerMergeMap): Map<string, 'L' | 'R' | 'S'> {
  const m = new Map<string, 'L' | 'R' | 'S'>();
  for (const team of [game.awayTeam, game.homeTeam]) {
    const players = [
      ...team.roster.starters,
      ...team.roster.bench,
      ...(team.roster.pitcher ? [team.roster.pitcher] : []),
    ];
    for (const p of players) {
      m.set(p.id, p.bats);
      if (p.realPlayerId) m.set(p.realPlayerId, p.bats);
      m.set(resolvePlayerId(p, mergeMap), p.bats);
    }
  }
  return m;
}

/**
 * 選手 ID の名寄せリゾルバ。
 *
 * ログ上の ID（試合スコープの Player.id）を multiGameStats と同じ方式で
 * resolvedId (realPlayerId ?? Player.id) に変換して照合する。
 * 引数 rawTargetId は Player.id / realPlayerId のどちらでも受け付ける。
 */
function makeResolver(games: GameState[], rawTargetId: string, mergeMap?: PlayerMergeMap) {
  const maps = new Map<GameState, Map<string, string>>();
  for (const g of games) maps.set(g, buildRealPlayerMap(g, mergeMap));

  let targetId = rawTargetId;
  for (const m of maps.values()) {
    const resolved = m.get(rawTargetId);
    if (resolved) { targetId = resolved; break; }
  }

  // maps のキーは試合スコープの Player.id のみ。rawTargetId が realPlayerId で
  // 直接渡された場合は上のループでヒットせず素通りするため、名寄せメモを直接引いて
  // canonicalId まで畳む。canonical は member になれない不変条件（toMergeMap 参照）に
  // より 1 段で完結し、既に畳み込み済みの targetId に再適用しても結果は変わらない。
  targetId = mergeMap?.get(targetId) ?? targetId;

  return {
    targetId,
    resolve: (game: GameState, id: string) => maps.get(game)?.get(id) ?? id,
    matches: (game: GameState, id: string) =>
      (maps.get(game)?.get(id) ?? id) === targetId,
  };
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
export function extractBatteryPairs(
  games: GameState[],
  mergeMap?: PlayerMergeMap,
): BatteryPair[] {
  const pairMap = new Map<
    string,
    { pitcher: { id: string; name: string }; catcher: { id: string; name: string }; games: Set<string> }
  >();

  for (const game of games) {
    const players = allPlayersMap(game, mergeMap);
    const realPlayerMap = buildRealPlayerMap(game, mergeMap);

    for (const half of ['top', 'bottom'] as const) {
      const halfPitches = game.pitchLogs.filter((p) => p.inning.half === half);
      if (halfPitches.length === 0) continue;

      const rawCatcher = deriveDefenseCatcher(game, half);
      if (!rawCatcher) continue;
      // 投手・捕手とも realPlayerId で名寄せし、同一ペアを試合をまたいで1件に束ねる
      const catcher = {
        id:   realPlayerMap.get(rawCatcher.id) ?? rawCatcher.id,
        name: rawCatcher.name,
      };

      const pitcherIds = [
        ...new Set(halfPitches.map((p) => realPlayerMap.get(p.pitcherId) ?? p.pitcherId)),
      ];

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
export function extractBatters(games: GameState[], mergeMap?: PlayerMergeMap): BatterInfo[] {
  const batterMap = new Map<string, { name: string; games: Set<string> }>();

  for (const game of games) {
    const players = allPlayersMap(game, mergeMap);
    const realPlayerMap = buildRealPlayerMap(game, mergeMap);
    for (const log of game.atBatLogs) {
      const name = players.get(log.batterId);
      if (!name) continue;

      const resolvedId = realPlayerMap.get(log.batterId) ?? log.batterId;
      if (!batterMap.has(resolvedId)) {
        batterMap.set(resolvedId, { name, games: new Set() });
      }
      batterMap.get(resolvedId)!.games.add(game.id);
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
 * 全試合から投手一覧を抽出する（1球以上の選手のみ）
 */
export function extractPitchers(games: GameState[], mergeMap?: PlayerMergeMap): PitcherInfo[] {
  const pitcherMap = new Map<string, { name: string; games: Set<string> }>();

  for (const game of games) {
    const players = allPlayersMap(game, mergeMap);
    const realPlayerMap = buildRealPlayerMap(game, mergeMap);
    for (const p of game.pitchLogs) {
      const name = players.get(p.pitcherId);
      if (!name) continue;
      const resolvedId = realPlayerMap.get(p.pitcherId) ?? p.pitcherId;
      if (!pitcherMap.has(resolvedId)) {
        pitcherMap.set(resolvedId, { name, games: new Set() });
      }
      pitcherMap.get(resolvedId)!.games.add(game.id);
    }
  }

  return Array.from(pitcherMap.entries())
    .map(([id, { name, games }]) => ({
      pitcherId:   id,
      pitcherName: name,
      gameCount:   games.size,
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
  mergeMap?: PlayerMergeMap,
): BatteryProfile {
  // realPlayerId で名寄せしたうえで、当該投手が登板した試合のみフィルタ
  const pitcherRef = makeResolver(games, pitcherId, mergeMap);
  const catcherRef = makeResolver(games, catcherId, mergeMap);

  const relevantGames = games.filter((game) =>
    game.pitchLogs.some((p) => pitcherRef.matches(game, p.pitcherId)),
  );

  const allPitches = relevantGames.flatMap((g) =>
    g.pitchLogs.filter((p) => pitcherRef.matches(g, p.pitcherId)),
  );
  const allAtBats = relevantGames.flatMap((g) =>
    g.atBatLogs.filter((l) => pitcherRef.matches(g, l.pitcherId)),
  );

  // 捕手名の解決
  let catcherName = catcherRef.targetId;
  for (const g of relevantGames) {
    const n = allPlayersMap(g, mergeMap).get(catcherRef.targetId);
    if (n) { catcherName = n; break; }
  }

  // ── 基本統計 ──────────────────────────────────────────────────────────────
  const velocities = allPitches.filter((p) => p.velocity != null).map((p) => p.velocity!);
  const strikeCount = allPitches.filter((p) => STRIKE_RESULTS.includes(p.result)).length;

  // ── 2ストライク時の分析 ───────────────────────────────────────────────────
  const batsMap = new Map<string, 'L' | 'R' | 'S'>();
  for (const g of relevantGames) {
    allPlayersBatsMap(g, mergeMap).forEach((bats, id) => batsMap.set(id, bats));
  }

  const pitches2S = allPitches.filter(
    (p) => p.countBefore.strikes === 2,
  );
  const zone2Strike: Record<string, number> = {};
  const zone2StrikeR: Record<string, number> = {};
  const zone2StrikeL: Record<string, number> = {};
  const typeMap2S = new Map<string, { count: number; vels: number[] }>();

  for (const p of pitches2S) {
    zone2Strike[p.zone] = (zone2Strike[p.zone] ?? 0) + 1;
    const bats = batsMap.get(p.batterId);
    if (bats === 'R' || bats === 'S') {
      zone2StrikeR[p.zone] = (zone2StrikeR[p.zone] ?? 0) + 1;
    }
    if (bats === 'L' || bats === 'S') {
      zone2StrikeL[p.zone] = (zone2StrikeL[p.zone] ?? 0) + 1;
    }
    if (!typeMap2S.has(p.pitchType)) typeMap2S.set(p.pitchType, { count: 0, vels: [] });
    const e = typeMap2S.get(p.pitchType)!;
    e.count++;
    if (p.velocity != null) e.vels.push(p.velocity);
  }

  // ── 全球ゾーン分布（対右打者 / 対左打者）────────────────────────────────
  const zoneAllR: Record<string, number> = {};
  const zoneAllL: Record<string, number> = {};
  for (const p of allPitches) {
    const bats = batsMap.get(p.batterId);
    if (bats === 'R' || bats === 'S') {
      zoneAllR[p.zone] = (zoneAllR[p.zone] ?? 0) + 1;
    }
    if (bats === 'L' || bats === 'S') {
      zoneAllL[p.zone] = (zoneAllL[p.zone] ?? 0) + 1;
    }
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
  let resolvedPitcherName = pitcherRef.targetId;
  for (const g of relevantGames) {
    const n = allPlayersMap(g, mergeMap).get(pitcherRef.targetId);
    if (n) { resolvedPitcherName = n; break; }
  }

  const base: Omit<BatteryProfile, 'summary'> = {
    pitcherId: pitcherRef.targetId,
    pitcherName: resolvedPitcherName,
    catcherId: catcherRef.targetId,
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
    zone2StrikeR,
    zone2StrikeL,
    zoneAllR,
    zoneAllL,
    pitchType2Strike: toPitchTypeStats(typeMap2S, pitches2S.length),
    finishingPitches,
    countTendencies,
    atBatMemos: collectAtBatMemos(allAtBats),
  };

  return { ...base, summary: buildBatterySummary(base) };
}

/**
 * 打者プロファイルを構築する
 */
export function buildBatterProfile(
  games: GameState[],
  batterId: string,
  mergeMap?: PlayerMergeMap,
): BatterProfile {
  // realPlayerId で名寄せしたうえで、当該打者が登場した試合のみフィルタ
  const batterRef = makeResolver(games, batterId, mergeMap);

  const relevantGames = games.filter((g) =>
    g.atBatLogs.some((l) => batterRef.matches(g, l.batterId)),
  );

  const allAtBats = relevantGames.flatMap((g) =>
    g.atBatLogs.filter((l) => batterRef.matches(g, l.batterId)),
  );
  const completedAtBats = allAtBats.filter((l) => l.result !== null);
  const allPitches = allAtBats.flatMap((l) => l.pitches);

  // 打者名解決
  let batterName = batterRef.targetId;
  for (const g of relevantGames) {
    const n = allPlayersMap(g, mergeMap).get(batterRef.targetId);
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
    batterId:          batterRef.targetId,
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
    atBatMemos:          collectAtBatMemos(allAtBats),
  };
}

/**
 * 投手プロファイルを構築する（全捕手合算）
 */
export function buildPitcherProfile(
  games: GameState[],
  pitcherId: string,
  mergeMap?: PlayerMergeMap,
): PitcherProfile {
  // realPlayerId で名寄せしたうえで、当該投手が登板した試合のみフィルタ
  const pitcherRef = makeResolver(games, pitcherId, mergeMap);

  const relevantGames = games.filter((game) =>
    game.pitchLogs.some((p) => pitcherRef.matches(game, p.pitcherId)),
  );

  const allPitches = relevantGames.flatMap((g) =>
    g.pitchLogs.filter((p) => pitcherRef.matches(g, p.pitcherId)),
  );
  const allAtBats = relevantGames.flatMap((g) =>
    g.atBatLogs.filter((l) => pitcherRef.matches(g, l.pitcherId)),
  );

  // 投手名解決
  let resolvedPitcherName = pitcherRef.targetId;
  for (const g of relevantGames) {
    const n = allPlayersMap(g, mergeMap).get(pitcherRef.targetId);
    if (n) { resolvedPitcherName = n; break; }
  }

  // ── 基本統計 ──────────────────────────────────────────────────
  const velocities  = allPitches.filter((p) => p.velocity != null).map((p) => p.velocity!);
  const strikeCount = allPitches.filter((p) => STRIKE_RESULTS.includes(p.result)).length;

  // ── 全体ゾーン分布 ─────────────────────────────────────────────
  const zoneDistribution: Record<string, number> = {};
  for (const p of allPitches) {
    zoneDistribution[p.zone] = (zoneDistribution[p.zone] ?? 0) + 1;
  }

  // ── 全球種割合 ─────────────────────────────────────────────────
  const typeMapAll = new Map<string, { count: number; vels: number[] }>();
  for (const p of allPitches) {
    if (!typeMapAll.has(p.pitchType)) typeMapAll.set(p.pitchType, { count: 0, vels: [] });
    const e = typeMapAll.get(p.pitchType)!;
    e.count++;
    if (p.velocity != null) e.vels.push(p.velocity);
  }

  // ── 2ストライク時の分析 ───────────────────────────────────────
  const batsMap = new Map<string, 'L' | 'R' | 'S'>();
  for (const g of relevantGames) {
    allPlayersBatsMap(g, mergeMap).forEach((bats, id) => batsMap.set(id, bats));
  }
  const pitches2S = allPitches.filter((p) => p.countBefore.strikes === 2);
  const zone2Strike: Record<string, number>  = {};
  const zone2StrikeR: Record<string, number> = {};
  const zone2StrikeL: Record<string, number> = {};
  const typeMap2S = new Map<string, { count: number; vels: number[] }>();
  for (const p of pitches2S) {
    zone2Strike[p.zone]  = (zone2Strike[p.zone]  ?? 0) + 1;
    const bats = batsMap.get(p.batterId);
    if (bats === 'R' || bats === 'S') zone2StrikeR[p.zone] = (zone2StrikeR[p.zone] ?? 0) + 1;
    if (bats === 'L' || bats === 'S') zone2StrikeL[p.zone] = (zone2StrikeL[p.zone] ?? 0) + 1;
    if (!typeMap2S.has(p.pitchType)) typeMap2S.set(p.pitchType, { count: 0, vels: [] });
    const e = typeMap2S.get(p.pitchType)!;
    e.count++;
    if (p.velocity != null) e.vels.push(p.velocity);
  }

  // ── 決め球（三振の最終球） ─────────────────────────────────────
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
        pitchType, zone, count,
        pct: totalFinishing > 0 ? count / totalFinishing : 0,
        avgVelocity: vels.length > 0 ? Math.round(vels.reduce((a, b) => a + b, 0) / vels.length) : null,
      };
    })
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  // ── カウント別傾向 ────────────────────────────────────────────
  const KEY_COUNTS = [
    { balls: 0, strikes: 0 }, { balls: 2, strikes: 0 }, { balls: 3, strikes: 1 },
    { balls: 0, strikes: 2 }, { balls: 1, strikes: 2 }, { balls: 2, strikes: 2 }, { balls: 3, strikes: 2 },
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
      balls, strikes, total,
      pitchTypes: toPitchTypeStats(typeMap, total).slice(0, 3),
      topZones:   topZones(zoneMap, total, 3),
    };
  }).filter((c) => c.total > 0);

  // ── 捕手一覧（PitchLog.catcherId 優先、なければ roster から推定） ─
  const catcherAccum = new Map<string, { name: string; count: number }>();
  for (const g of relevantGames) {
    const players = allPlayersMap(g, mergeMap);
    for (const p of g.pitchLogs.filter((pl) => pitcherRef.matches(g, pl.pitcherId))) {
      const rawCatcherId = p.catcherId ?? deriveDefenseCatcher(g, p.inning.half)?.id;
      if (!rawCatcherId) continue;
      // 捕手も realPlayerId で名寄せして試合をまたいで合算する
      const cId = pitcherRef.resolve(g, rawCatcherId);
      const cName = players.get(cId) ?? cId;
      const existing = catcherAccum.get(cId) ?? { name: cName, count: 0 };
      existing.count++;
      catcherAccum.set(cId, existing);
    }
  }
  const catchers = Array.from(catcherAccum.entries())
    .map(([catcherId, { name, count }]) => ({ catcherId, catcherName: name, pitchCount: count }))
    .sort((a, b) => b.pitchCount - a.pitchCount);

  const summary =
    `${resolvedPitcherName}の投手分析: ${relevantGames.length}試合・計${allPitches.length}球。` +
    `ストライク率${Math.round(allPitches.length > 0 ? strikeCount / allPitches.length * 100 : 0)}%。`;

  return {
    pitcherId: pitcherRef.targetId,
    pitcherName: resolvedPitcherName,
    totalGames:   relevantGames.length,
    totalPitches: allPitches.length,
    strikeRate:   allPitches.length > 0 ? strikeCount / allPitches.length : 0,
    avgVelocity:  velocities.length > 0 ? Math.round(velocities.reduce((a, b) => a + b, 0) / velocities.length) : null,
    maxVelocity:  velocities.length > 0 ? Math.max(...velocities) : null,
    zoneDistribution,
    pitchTypeAll: toPitchTypeStats(typeMapAll, allPitches.length),
    zone2Strike, zone2StrikeR, zone2StrikeL,
    pitchType2Strike: toPitchTypeStats(typeMap2S, pitches2S.length),
    finishingPitches,
    countTendencies,
    catchers,
    summary,
    atBatMemos: collectAtBatMemos(allAtBats),
  };
}
