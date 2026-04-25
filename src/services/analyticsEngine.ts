// =============================================================================
// Baseball Analytics Engine
//
// Pure TypeScript — no AI, no external dependencies.
// Provides Sabermetrics calculations, coordinate transforms, and spray tendency
// analysis. Designed as the data layer for LLM-generated text reports.
// =============================================================================

import type {
  AtBatLog,
  BattedBall,
  BallparkInfo,
  Player,
  PitchLog,
} from '../types/game';

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 2024 MLB run-value weights for wOBA.
 * Source: FanGraphs guts page (league-average season weights).
 */
const WOBA_WEIGHTS = {
  walk:     0.696,
  hbp:      0.726,
  single:   0.883,
  double:   1.244,
  triple:   1.566,
  homeRun:  2.004,
} as const;

/** League-average wOBA for context (~.320 across 2019-2024). */
const LEAGUE_AVG_WOBA = 0.320;

// Pull-field angle threshold (radians from centerfield axis).
// Foul lines are at ±π/4; "pull" starts at ~π/8 from center.
const PULL_THRESHOLD = Math.PI / 8;   // ~22.5°
const OPPO_THRESHOLD = Math.PI / 8;   // symmetric

// ─────────────────────────────────────────────────────────────────────────────
// Result types
// ─────────────────────────────────────────────────────────────────────────────

export interface BattingLine {
  /** 打席数 */
  plateAppearances: number;
  /** 打数 */
  atBats: number;
  /** 安打 */
  hits: number;
  /** 単打 */
  singles: number;
  /** 二塁打 */
  doubles: number;
  /** 三塁打 */
  triples: number;
  /** 本塁打 */
  homeRuns: number;
  /** 四球 */
  walks: number;
  /** 死球 */
  hitByPitch: number;
  /** 三振 */
  strikeouts: number;
  /** 犠打 */
  sacrificeBunts: number;
  /** 犠飛 */
  sacrificeFlies: number;
  /** 打点 */
  rbi: number;
}

export interface SabermetricsStats {
  /** 打率 */
  battingAverage: number;
  /** 出塁率 */
  onBasePct: number;
  /** 長打率 */
  sluggingPct: number;
  /** OPS (出塁率 + 長打率) */
  ops: number;
  /** wOBA: 加重出塁率 (0〜1) */
  woba: number;
  /** ISO: 長打力指数 (SLG − BA) */
  iso: number;
  /** BABIP: インプレイ打球の打率 */
  babip: number;
  /** 三振率 (三振 / 打席) */
  strikeoutRate: number;
  /** 四球率 (四球 / 打席) */
  walkRate: number;
  /** BB/K 比率 */
  bbToK: number;
}

export type SprayZone = 'pull' | 'center' | 'oppo';

export interface SprayDistribution {
  /** 引っ張り方向のヒット数 */
  pullCount: number;
  /** センター方向のヒット数 */
  centerCount: number;
  /** 流し方向のヒット数 */
  oppoCount: number;
  /** 引っ張り率 (0〜1) */
  pullRate: number;
  /** センター率 (0〜1) */
  centerRate: number;
  /** 流し率 (0〜1) */
  oppoRate: number;
}

export type SprayTendency =
  | 'pull_hitter'     // プルヒッター: 引っ張り偏重 (pull > 50%)
  | 'spray_hitter'    // スプレーヒッター: 全方向均等
  | 'oppo_hitter'     // 流し打ち: 逆方向偏重 (oppo > 40%)
  | 'center_hitter'   // センター中心 (center > 45%)
  | 'insufficient';   // データ不足 (打球 < 5)

export interface BattedBallProfile {
  /** ゴロ率 (0〜1) */
  groundBallRate: number;
  /** フライ率 (0〜1) */
  flyBallRate: number;
  /** ライナー率 (0〜1) */
  linedriveRate: number;
  /** ポップフライ率 (0〜1) */
  popupRate: number;
  /** 平均飛距離 (m) — estimatedDistance > 0 のみ */
  avgDistance: number;
  /** 最長飛距離 (m) */
  maxDistance: number;
  /** GB/FB 比率 */
  gbFbRatio: number;
}

export interface ZoneContactStats {
  /** ゾーン名 */
  zone: string;
  /** このゾーンへの投球数 */
  pitches: number;
  /** このゾーンでの空振り数 */
  swings: number;
  /** このゾーンでのコンタクト数 */
  contacts: number;
  /** コンタクト率 (0〜1) */
  contactRate: number;
}

export interface PitchTypeVulnerability {
  /** 球種名 */
  pitchType: string;
  /** 対戦球数 */
  pitches: number;
  /** 空振り数 */
  whiffs: number;
  /** 空振り率 (0〜1) */
  whiffRate: number;
  /** このゾーンでの打席結果ヒット率 */
  hitRate: number;
}

export interface FieldPoint {
  /** 実距離 (m, ホームプレートから) */
  distanceMeters: number;
  /** 方向角 (ラジアン, 0=中堅, 負=左翼, 正=右翼) */
  angleRadians: number;
  /** 方向角 (度) */
  angleDegrees: number;
  /** スプレーゾーン */
  zone: SprayZone;
  /** X 座標 (m, ホーム基準: 右翼方向が正) */
  fieldXMeters: number;
  /** Y 座標 (m, ホーム基準: 外野方向が正) */
  fieldYMeters: number;
}

/** LLM 連携用の統合レポートオブジェクト */
export interface BatterAnalyticsReport {
  playerId: string;
  playerName: string;
  battingHand: 'L' | 'R' | 'S';
  totalGames: number;
  battingLine: BattingLine;
  sabermetrics: SabermetricsStats;
  sprayDistribution: SprayDistribution;
  sprayTendency: SprayTendency;
  battedBallProfile: BattedBallProfile;
  pitchTypeVulnerability: PitchTypeVulnerability[];
  /** wOBA に基づいた相対評価 (+/−) */
  wobaGrade: 'excellent' | 'above_avg' | 'avg' | 'below_avg' | 'poor';
  /** テキストレポート生成用サマリーフィールド (LLM に渡す) */
  narrativeSummary: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. Sabermetrics 計算機
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 特定の打者のログだけ抽出する。
 * `batterId` を省略すると全ログを返す（チーム集計などに使用）。
 */
export function filterByBatter(
  logs: AtBatLog[],
  batterId?: string,
): AtBatLog[] {
  if (!batterId) return logs;
  return logs.filter((l) => l.batterId === batterId);
}

/**
 * AtBatLog 配列から打撃スタッツのカウンターを集計する。
 */
export function buildBattingLine(logs: AtBatLog[]): BattingLine {
  let pa = 0, ab = 0, h = 0;
  let s = 0, d = 0, t = 0, hr = 0;
  let bb = 0, hbp = 0, k = 0;
  let sac = 0, sf = 0, rbi = 0;

  for (const log of logs) {
    if (!log.result) continue; // 進行中の打席は除外
    pa++;
    rbi += log.rbiCount;

    switch (log.result) {
      case 'single':             h++; s++; ab++; break;
      case 'double':             h++; d++; ab++; break;
      case 'triple':             h++; t++; ab++; break;
      case 'home_run':           h++; hr++; ab++; break;
      case 'walk':               bb++; break;
      case 'hit_by_pitch':       hbp++; break;
      case 'strikeout':
      case 'strikeout_looking':  k++; ab++; break;
      case 'sacrifice_bunt':     sac++; break;
      case 'sacrifice_fly':      sf++; break;
      default:                   ab++; break;
    }
  }

  return { plateAppearances: pa, atBats: ab, hits: h,
           singles: s, doubles: d, triples: t, homeRuns: hr,
           walks: bb, hitByPitch: hbp, strikeouts: k,
           sacrificeBunts: sac, sacrificeFlies: sf, rbi };
}

/**
 * wOBA (Weighted On-Base Average) を計算する。
 *
 * wOBA = (BB×0.696 + HBP×0.726 + 1B×0.883 + 2B×1.244 + 3B×1.566 + HR×2.004)
 *        ÷ (AB + BB + SF + HBP)
 */
export function calcWOBA(line: BattingLine): number {
  const numerator =
    line.walks     * WOBA_WEIGHTS.walk    +
    line.hitByPitch * WOBA_WEIGHTS.hbp    +
    line.singles   * WOBA_WEIGHTS.single  +
    line.doubles   * WOBA_WEIGHTS.double  +
    line.triples   * WOBA_WEIGHTS.triple  +
    line.homeRuns  * WOBA_WEIGHTS.homeRun;

  const denominator =
    line.atBats + line.walks + line.sacrificeFlies + line.hitByPitch;

  return denominator === 0 ? 0 : round3(numerator / denominator);
}

/**
 * 出塁率 (OBP) を計算する。
 * OBP = (H + BB + HBP) ÷ (AB + BB + HBP + SF)
 */
export function calcOBP(line: BattingLine): number {
  const num = line.hits + line.walks + line.hitByPitch;
  const den = line.atBats + line.walks + line.hitByPitch + line.sacrificeFlies;
  return den === 0 ? 0 : round3(num / den);
}

/**
 * 長打率 (SLG) を計算する。
 * SLG = 総塁打 ÷ 打数
 */
export function calcSLG(line: BattingLine): number {
  const totalBases =
    line.singles +
    line.doubles  * 2 +
    line.triples  * 3 +
    line.homeRuns * 4;
  return line.atBats === 0 ? 0 : round3(totalBases / line.atBats);
}

/**
 * OPS (出塁率 + 長打率) を計算する。
 */
export function calcOPS(line: BattingLine): number {
  return round3(calcOBP(line) + calcSLG(line));
}

/**
 * BABIP (Batting Average on Balls In Play) を計算する。
 * BABIP = (H − HR) ÷ (AB − K − HR + SF)
 */
export function calcBABIP(line: BattingLine): number {
  const num = line.hits - line.homeRuns;
  const den = line.atBats - line.strikeouts - line.homeRuns + line.sacrificeFlies;
  return den <= 0 ? 0 : round3(Math.max(0, num) / den);
}

/**
 * Sabermetrics 統計をまとめて計算する。
 */
export function computeSabermetrics(line: BattingLine): SabermetricsStats {
  const ba  = line.atBats === 0 ? 0 : round3(line.hits / line.atBats);
  const obp = calcOBP(line);
  const slg = calcSLG(line);
  const ops = round3(obp + slg);
  const woba = calcWOBA(line);
  const iso = round3(Math.max(0, slg - ba));
  const babip = calcBABIP(line);
  const pa = line.plateAppearances;
  const kRate = pa === 0 ? 0 : round3(line.strikeouts / pa);
  const bbRate = pa === 0 ? 0 : round3(line.walks / pa);
  const bbToK  = line.strikeouts === 0
    ? (line.walks > 0 ? 99 : 0)
    : round3(line.walks / line.strikeouts);

  return { battingAverage: ba, onBasePct: obp, sluggingPct: slg,
           ops, woba, iso, babip,
           strikeoutRate: kRate, walkRate: bbRate, bbToK };
}

/**
 * wOBA に基づく5段階グレードを返す。
 */
export function gradeWOBA(
  woba: number,
): BatterAnalyticsReport['wobaGrade'] {
  if (woba >= LEAGUE_AVG_WOBA + 0.060) return 'excellent';
  if (woba >= LEAGUE_AVG_WOBA + 0.020) return 'above_avg';
  if (woba >= LEAGUE_AVG_WOBA - 0.020) return 'avg';
  if (woba >= LEAGUE_AVG_WOBA - 0.060) return 'below_avg';
  return 'poor';
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. 座標変換ロジック
// ─────────────────────────────────────────────────────────────────────────────

/**
 * fieldX / fieldY（0〜1 正規化極座標）を球場の実際の距離・角度に変換する。
 *
 * 座標系:
 *   fieldX: 0 = 左翼ファウルライン / 0.5 = 中堅 / 1 = 右翼ファウルライン
 *   fieldY: 0 = 外野フェンス / 1 = ホームプレート
 *
 * @param fieldX  正規化 X 座標 (0〜1)
 * @param fieldY  正規化 Y 座標 (0〜1)
 * @param ballpark 球場情報 (フェンス距離)
 * @returns       実距離・角度・直交座標
 */
export function fieldCoordsToMeters(
  fieldX: number,
  fieldY: number,
  ballpark: BallparkInfo,
): FieldPoint {
  // 方向角 (ラジアン): 0 = 中堅, 負 = 左翼, 正 = 右翼
  const angleRad = (fieldX - 0.5) * (Math.PI / 2);
  const angleDeg = angleRad * (180 / Math.PI);

  // この方向のフェンス距離を補間 (center〜left or center〜right)
  const fenceDist = interpolateFenceDistance(angleDeg, ballpark);

  // ホームプレートからの実距離 (m)
  const radialFraction = 1 - Math.min(Math.max(fieldY, 0), 1); // 0=home,1=fence
  const distanceMeters = radialFraction * fenceDist;

  // 直交座標 (ホームプレートを原点: 外野方向 Y+, 右翼方向 X+)
  const fieldYMeters = distanceMeters * Math.cos(angleRad);
  const fieldXMeters = distanceMeters * Math.sin(angleRad);

  const zone = classifyZoneByAngle(angleRad);

  return {
    distanceMeters: round1(distanceMeters),
    angleRadians: angleRad,
    angleDegrees: round1(angleDeg),
    zone,
    fieldXMeters: round1(fieldXMeters),
    fieldYMeters: round1(fieldYMeters),
  };
}

/**
 * 方向角（度）からフェンス距離をリニア補間する。
 *   0° = 中堅, -45° = 左翼ファウル, +45° = 右翼ファウル
 */
function interpolateFenceDistance(angleDeg: number, ballpark: BallparkInfo): number {
  const { left, center, right } = ballpark.fenceDistance;
  // フェンス距離が未設定の場合はデフォルト値を使用
  const l = left   || 100;
  const c = center || 120;
  const r = right  || 100;

  if (angleDeg <= 0) {
    // 中堅〜左翼: t=0 → center, t=1 → left foul
    const t = Math.min(Math.abs(angleDeg) / 45, 1);
    return c + t * (l - c);
  } else {
    // 中堅〜右翼: t=0 → center, t=1 → right foul
    const t = Math.min(angleDeg / 45, 1);
    return c + t * (r - c);
  }
}

/**
 * 打球の一覧を実距離・角度の配列に変換する。
 * estimatedDistance が 0 のときは fieldX/fieldY + 球場情報から計算。
 */
export function convertBattedBallsToField(
  logs: AtBatLog[],
  ballpark: BallparkInfo,
): FieldPoint[] {
  return logs
    .filter((l) => l.battedBall != null)
    .map((l) => {
      const bb = l.battedBall!;
      const fp = fieldCoordsToMeters(bb.fieldX, bb.fieldY, ballpark);
      // 記録された estimatedDistance があれば距離のみ上書き
      if (bb.estimatedDistance > 0) {
        fp.distanceMeters = round1(bb.estimatedDistance);
        // 直交座標も更新
        fp.fieldYMeters = round1(fp.distanceMeters * Math.cos(fp.angleRadians));
        fp.fieldXMeters = round1(fp.distanceMeters * Math.sin(fp.angleRadians));
      }
      return fp;
    });
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. 傾向分析 (Spray tendency / Batted ball profile)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 打者の打席利き手に基づいて「引っ張り」ゾーンを判定する。
 *
 * - 右打者: 左方向 (角度 < 0) がプル、右方向がオポジット
 * - 左打者: 右方向 (角度 > 0) がプル、左方向がオポジット
 * - 両打者: 中立（角度の絶対値のみで判定）
 */
function classifyZone(angleRad: number, bats: 'L' | 'R' | 'S'): SprayZone {
  const absAngle = Math.abs(angleRad);
  if (absAngle <= PULL_THRESHOLD) return 'center';

  const isPullSide =
    bats === 'R' ? angleRad < 0 :  // 右打者: 左翼がプル
    bats === 'L' ? angleRad > 0 :  // 左打者: 右翼がプル
    true;                           // 両打者: 常に外側をプル扱い

  return isPullSide ? 'pull' : 'oppo';
}

/** 方向角だけでゾーンを分類する（打者の利き手に依存しない）。 */
function classifyZoneByAngle(angleRad: number): SprayZone {
  if (Math.abs(angleRad) <= PULL_THRESHOLD) return 'center';
  return angleRad < 0 ? 'pull' : 'oppo'; // 左=pull 側として便宜上定義
}

/**
 * スプレー分布を集計する。
 *
 * @param logs  打席ログ配列 (battedBall を持つものだけ使用)
 * @param bats  打者の利き手
 */
export function analyzeSprayDistribution(
  logs: AtBatLog[],
  bats: 'L' | 'R' | 'S',
): SprayDistribution {
  let pull = 0, center = 0, oppo = 0;

  for (const log of logs) {
    const bb = log.battedBall;
    if (!bb) continue;

    const angleRad = (bb.fieldX - 0.5) * (Math.PI / 2);
    const zone = classifyZone(angleRad, bats);

    if (zone === 'pull')   pull++;
    else if (zone === 'center') center++;
    else                   oppo++;
  }

  const total = pull + center + oppo;
  if (total === 0) {
    return { pullCount: 0, centerCount: 0, oppoCount: 0,
             pullRate: 0, centerRate: 0, oppoRate: 0 };
  }

  return {
    pullCount:   pull,
    centerCount: center,
    oppoCount:   oppo,
    pullRate:    round3(pull   / total),
    centerRate:  round3(center / total),
    oppoRate:    round3(oppo   / total),
  };
}

/**
 * スプレー分布からバッターのタイプを判定する。
 */
export function classifySprayTendency(
  dist: SprayDistribution,
): SprayTendency {
  const total = dist.pullCount + dist.centerCount + dist.oppoCount;
  if (total < 5) return 'insufficient'; // データ不足

  if (dist.pullRate   > 0.50) return 'pull_hitter';
  if (dist.oppoRate   > 0.40) return 'oppo_hitter';
  if (dist.centerRate > 0.45) return 'center_hitter';
  return 'spray_hitter';
}

/**
 * 打球の種類（ゴロ/フライ/ライナー/ポップ）の分布を分析する。
 */
export function analyzeBattedBallProfile(logs: AtBatLog[]): BattedBallProfile {
  const balls = logs.filter((l) => l.battedBall != null).map((l) => l.battedBall!);
  const total = balls.length;

  if (total === 0) {
    return { groundBallRate: 0, flyBallRate: 0, linedriveRate: 0,
             popupRate: 0, avgDistance: 0, maxDistance: 0, gbFbRatio: 0 };
  }

  let gb = 0, fb = 0, ld = 0, pu = 0;
  let distSum = 0, distCount = 0, maxDist = 0;

  for (const bb of balls) {
    switch (bb.type) {
      case 'grounder': gb++; break;
      case 'fly':      fb++; break;
      case 'liner':    ld++; break;
      case 'popup':    pu++; break;
    }
    if (bb.estimatedDistance > 0) {
      distSum  += bb.estimatedDistance;
      maxDist   = Math.max(maxDist, bb.estimatedDistance);
      distCount++;
    }
  }

  const gbFbRatio = fb === 0 ? (gb > 0 ? 99 : 0) : round2(gb / fb);

  return {
    groundBallRate: round3(gb / total),
    flyBallRate:    round3(fb / total),
    linedriveRate:  round3(ld / total),
    popupRate:      round3(pu / total),
    avgDistance:    distCount > 0 ? round1(distSum / distCount) : 0,
    maxDistance:    round1(maxDist),
    gbFbRatio,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. 投球ゾーン / 球種別の傾向分析
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 球種ごとの空振り率・被安打率を集計する。
 * 投手分析・打者の弱点発見に活用できる。
 */
export function analyzePitchTypeVulnerability(
  logs: AtBatLog[],
): PitchTypeVulnerability[] {
  // 全投球ログを展開
  const allPitches = logs.flatMap((l) => l.pitches);

  // 球種ごとに集計
  const map = new Map<string, { pitches: number; whiffs: number; inPlayHit: number; inPlay: number }>();

  for (const pitch of allPitches) {
    const key = pitch.pitchType;
    const entry = map.get(key) ?? { pitches: 0, whiffs: 0, inPlayHit: 0, inPlay: 0 };
    entry.pitches++;

    if (pitch.result === 'strike_swinging') entry.whiffs++;
    if (pitch.result === 'in_play') {
      entry.inPlay++;
      // この投球を含む打席ログのヒット判定
      const parentLog = logs.find((l) => l.pitches.some((p) => p.id === pitch.id));
      if (parentLog?.result &&
          ['single', 'double', 'triple', 'home_run'].includes(parentLog.result)) {
        entry.inPlayHit++;
      }
    }

    map.set(key, entry);
  }

  return Array.from(map.entries())
    .map(([pitchType, s]) => ({
      pitchType,
      pitches:    s.pitches,
      whiffs:     s.whiffs,
      whiffRate:  s.pitches > 0 ? round3(s.whiffs / s.pitches) : 0,
      hitRate:    s.inPlay  > 0 ? round3(s.inPlayHit / s.inPlay) : 0,
    }))
    .sort((a, b) => b.pitches - a.pitches);
}

/**
 * カウント別（有利/不利/同数）の打撃成績を返す。
 * LLM 向けの「追い込まれた時の弱さ」などを定量化するために使用。
 */
export interface CountSituation {
  label: string;           // 例: '2S-0B (打者不利)'
  plateAppearances: number;
  battingAverage: number;
  woba: number;
}

export function analyzeCountSituations(logs: AtBatLog[]): CountSituation[] {
  const groups: Record<string, AtBatLog[]> = {
    'ahead_count':   [],  // 0S / 1S 以下 & 1B以上 or 2B/3B
    'behind_count':  [],  // 2S
    'even_count':    [],  // その他
    'full_count':    [],  // 3B-2S
  };

  for (const log of logs) {
    if (!log.result) continue;
    const lastPitch = log.pitches[log.pitches.length - 1];
    if (!lastPitch) continue;
    const { balls, strikes } = lastPitch.countBefore;

    if (balls === 3 && strikes === 2)     groups['full_count'].push(log);
    else if (strikes === 2)               groups['behind_count'].push(log);
    else if (balls > strikes)             groups['ahead_count'].push(log);
    else                                  groups['even_count'].push(log);
  }

  const labels: Record<string, string> = {
    ahead_count:  '有利カウント (ボール先行)',
    behind_count: '不利カウント (2ストライク)',
    even_count:   '同数カウント',
    full_count:   'フルカウント',
  };

  return Object.entries(groups).map(([key, g]) => {
    const line = buildBattingLine(g);
    return {
      label:             labels[key],
      plateAppearances:  line.plateAppearances,
      battingAverage:    line.atBats > 0 ? round3(line.hits / line.atBats) : 0,
      woba:              calcWOBA(line),
    };
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. 統合レポート生成 (LLM 土台)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 単一打者の統合分析レポートを生成する。
 *
 * @param logs      全打席ログ（複数試合可）
 * @param player    打者の Player オブジェクト
 * @param ballpark  球場情報（座標変換に使用）
 * @param totalGames 試合数
 */
export function computeBatterReport(
  logs: AtBatLog[],
  player: Player,
  ballpark: BallparkInfo,
  totalGames: number,
): BatterAnalyticsReport {
  const batterLogs = filterByBatter(logs, player.id);
  const line       = buildBattingLine(batterLogs);
  const saber      = computeSabermetrics(line);
  const sprayDist  = analyzeSprayDistribution(batterLogs, player.bats);
  const tendency   = classifySprayTendency(sprayDist);
  const bbProfile  = analyzeBattedBallProfile(batterLogs);
  const pitchVuln  = analyzePitchTypeVulnerability(batterLogs);
  const grade      = gradeWOBA(saber.woba);

  const narrative  = buildNarrativeSummary(
    player.name, line, saber, sprayDist, tendency, bbProfile, grade,
  );

  return {
    playerId:              player.id,
    playerName:            player.name,
    battingHand:           player.bats,
    totalGames,
    battingLine:           line,
    sabermetrics:          saber,
    sprayDistribution:     sprayDist,
    sprayTendency:         tendency,
    battedBallProfile:     bbProfile,
    pitchTypeVulnerability: pitchVuln,
    wobaGrade:             grade,
    narrativeSummary:      narrative,
  };
}

/**
 * LLM に渡す日本語のナラティブサマリーを生成する。
 * AI なしで作成するシンプルなテンプレートベースの文章。
 */
function buildNarrativeSummary(
  name: string,
  line: BattingLine,
  saber: SabermetricsStats,
  spray: SprayDistribution,
  tendency: SprayTendency,
  bbProfile: BattedBallProfile,
  grade: BatterAnalyticsReport['wobaGrade'],
): string {
  const pct = (n: number) => `${(n * 100).toFixed(1)}%`;
  const tendencyLabels: Record<SprayTendency, string> = {
    pull_hitter:    'プルヒッター（引っ張り型）',
    spray_hitter:   'スプレーヒッター（全方向型）',
    oppo_hitter:    '流し打ち型',
    center_hitter:  'センター返し型',
    insufficient:   '（データ不足）',
  };
  const gradeLabels: Record<BatterAnalyticsReport['wobaGrade'], string> = {
    excellent:  '優秀（リーグ平均比+6%以上）',
    above_avg:  '平均以上',
    avg:        '平均的',
    below_avg:  '平均以下',
    poor:       '要改善',
  };

  const parts: string[] = [
    `【${name} の打撃分析サマリー】`,
    `打率 ${saber.battingAverage.toFixed(3)} / 出塁率 ${saber.onBasePct.toFixed(3)} / 長打率 ${saber.sluggingPct.toFixed(3)} / OPS ${saber.ops.toFixed(3)}。`,
    `wOBA は ${saber.woba.toFixed(3)} でグレードは「${gradeLabels[grade]}」。`,
    `${line.plateAppearances} 打席で 三振率 ${pct(saber.strikeoutRate)} / 四球率 ${pct(saber.walkRate)} / BABIP ${saber.babip.toFixed(3)}。`,
  ];

  if (tendency !== 'insufficient') {
    parts.push(
      `打球方向の傾向は${tendencyLabels[tendency]}。` +
      `引っ張り ${pct(spray.pullRate)} / センター ${pct(spray.centerRate)} / 逆方向 ${pct(spray.oppoRate)}。`,
    );
  }

  if (bbProfile.groundBallRate + bbProfile.flyBallRate > 0) {
    parts.push(
      `打球種別: ゴロ ${pct(bbProfile.groundBallRate)} / フライ ${pct(bbProfile.flyBallRate)} / ` +
      `ライナー ${pct(bbProfile.linedriveRate)} / ポップ ${pct(bbProfile.popupRate)}。` +
      (bbProfile.avgDistance > 0 ? `平均飛距離 ${bbProfile.avgDistance}m。` : ''),
    );
  }

  return parts.join('\n');
}

// ─────────────────────────────────────────────────────────────────────────────
// 6. チーム・イニング集計ユーティリティ
// ─────────────────────────────────────────────────────────────────────────────

/**
 * イニング別の攻撃成績（得点機会・得点）を集計する。
 */
export interface InningSummary {
  inning: number;
  half: 'top' | 'bottom';
  plateAppearances: number;
  hits: number;
  rbi: number;
  walks: number;
  strikeouts: number;
}

export function summarizeByInning(logs: AtBatLog[]): InningSummary[] {
  const map = new Map<string, InningSummary>();

  for (const log of logs) {
    if (!log.result) continue;
    const key = `${log.inning.number}-${log.inning.half}`;
    const entry = map.get(key) ?? {
      inning: log.inning.number,
      half:   log.inning.half,
      plateAppearances: 0, hits: 0, rbi: 0, walks: 0, strikeouts: 0,
    };
    entry.plateAppearances++;
    if (['single', 'double', 'triple', 'home_run'].includes(log.result)) entry.hits++;
    if (log.result === 'walk') entry.walks++;
    if (log.result === 'strikeout' || log.result === 'strikeout_looking') entry.strikeouts++;
    entry.rbi += log.rbiCount;
    map.set(key, entry);
  }

  return Array.from(map.values()).sort((a, b) =>
    a.inning !== b.inning ? a.inning - b.inning :
    a.half === 'top' ? -1 : 1,
  );
}

/**
 * チーム全体の打撃成績を選手ごとに一覧化する。
 */
export interface TeamBattingRow {
  playerId: string;
  playerName: string;
  line: BattingLine;
  sabermetrics: SabermetricsStats;
}

export function computeTeamBattingStats(
  logs: AtBatLog[],
  players: Player[],
): TeamBattingRow[] {
  return players
    .map((p) => {
      const filtered = filterByBatter(logs, p.id);
      if (filtered.length === 0) return null;
      const line  = buildBattingLine(filtered);
      const saber = computeSabermetrics(line);
      return { playerId: p.id, playerName: p.name, line, sabermetrics: saber };
    })
    .filter((r): r is TeamBattingRow => r !== null)
    .sort((a, b) => b.sabermetrics.ops - a.sabermetrics.ops);
}

// ─────────────────────────────────────────────────────────────────────────────
// Internal helpers
// ─────────────────────────────────────────────────────────────────────────────

function round1(n: number): number { return Math.round(n * 10)  / 10; }
function round2(n: number): number { return Math.round(n * 100) / 100; }
function round3(n: number): number { return Math.round(n * 1000) / 1000; }
