/**
 * AI レポート生成サービス (v3 - Phase 1 セキュリティ強化版)
 *
 * Claude (Anthropic Messages API) を使った試合・選手の日本語レポート生成を
 * Firebase Cloud Functions 経由で呼び出します。
 *
 * 変更点 (v2 → v3):
 *   - プロンプト構築はサーバー側に集約。クライアントは reportType + data のみ送信。
 *   - systemPrompt の上書きは不可。
 *   - 利用回数トラッキングはサーバーの Firestore (aiUsageDaily) に集約。
 *     クライアントの AsyncStorage カウンタは廃止。
 *   - エラーはサーバーから reason 付きで返し、aiReportErrors.ts で UI 文言に変換。
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { httpsCallable, type FunctionsError } from 'firebase/functions';
import type { GameState } from '../types/game';
import type { AggregatedPitchingStats, AggregatedBattingStats } from '../utils/multiGameStats';
import type { BatteryProfile, BatterProfile } from '../utils/analysisEngine';
import { functions } from './firebase';
import { UserPlan, USER_PLAN_META, checkFeatureAccess } from './planService';
import {
  mapAIReportError,
  type AIReportErrorReason,
  type AIReportActionHint,
} from '../utils/aiReportErrors';

export { UserPlan, USER_PLAN_META };

// =============================================================================
// 1. プラン判定（クライアント側の UX ガード）
//    ※ 真のガードはサーバー側。ここはすぐ UI を出すための先行判定。
// =============================================================================

export type PlanCheckResult =
  | { allowed: true }
  | { allowed: false; message: string; requiredPlan: UserPlan[] };

export function checkPlanAccess(plan: UserPlan): PlanCheckResult {
  const result = checkFeatureAccess(plan, 'ai_report');
  if (result.allowed) return { allowed: true };
  return {
    allowed: false,
    message: `AI 分析は${result.requiredPlanLabel}（${USER_PLAN_META[result.requiredPlan].priceLabel}）以上のプラン限定機能です。`,
    requiredPlan: [UserPlan.LIGHT, UserPlan.STANDARD, UserPlan.PRO],
  };
}

// =============================================================================
// 2. キャッシュ
// =============================================================================

const CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const CACHE_PREFIX = '@ballpark/ai-report/';

interface CachedReport {
  report: AIReport;
  cachedAt: number;
  plan: UserPlan;
}

function sanitizeKey(raw: string): string {
  return raw.replace(/[^a-zA-Z0-9\-_:]/g, '_').slice(0, 128);
}

async function readCache(cacheKey: string): Promise<AIReport | null> {
  try {
    const json = await AsyncStorage.getItem(CACHE_PREFIX + sanitizeKey(cacheKey));
    if (!json) return null;
    const cached: CachedReport = JSON.parse(json);
    const age = Date.now() - cached.cachedAt;
    if (age > CACHE_TTL_MS) {
      AsyncStorage.removeItem(CACHE_PREFIX + sanitizeKey(cacheKey)).catch(() => {});
      return null;
    }
    return cached.report;
  } catch {
    return null;
  }
}

async function writeCache(cacheKey: string, report: AIReport, plan: UserPlan): Promise<void> {
  try {
    const cached: CachedReport = { report, cachedAt: Date.now(), plan };
    await AsyncStorage.setItem(
      CACHE_PREFIX + sanitizeKey(cacheKey),
      JSON.stringify(cached),
    );
  } catch (err) {
    if (__DEV__) console.warn('[aiReportService] cache write failed:', err);
  }
}

export async function clearAllReportCache(): Promise<void> {
  try {
    const keys = await AsyncStorage.getAllKeys();
    const reportKeys = keys.filter((k) => k.startsWith(CACHE_PREFIX));
    if (reportKeys.length > 0) await AsyncStorage.multiRemove(reportKeys);
  } catch (err) {
    if (__DEV__) console.warn('[aiReportService] cache clear failed:', err);
  }
}

// =============================================================================
// 3. 型
// =============================================================================

export interface AIReportSection {
  title: string;
  content: string;
}

export interface AIReportUsage {
  used: number;
  limit: number;
  remaining: number;
}

export interface AIReport {
  overall: string;
  improvements: Array<{ aspect: string; detail: string }>;
  nextAdvice: string;
  highlights: string;
  generatedAt: number;
  /** サーバーから返る当日利用回数情報 */
  usage?: AIReportUsage;
  /** キャッシュから返ったかどうか */
  fromCache?: boolean;
  /** モック（何らかの理由で実レポートではない）か */
  isMock?: boolean;
  /** モックの場合のエラー理由（UI 分岐用） */
  errorReason?: AIReportErrorReason;
  /** UI が取るべきアクションヒント */
  actionHint?: AIReportActionHint;
  /** UI 用タイトル */
  errorTitle?: string;
}

export type ReportRole = 'pitcher' | 'batter' | 'team';

export interface ReportInput {
  game: GameState;
  role: ReportRole;
  playerId?: string;
  pitcher?: AggregatedPitchingStats | null;
  batters?: AggregatedBattingStats[];
  userPlan: UserPlan;
}

// =============================================================================
// 4. サーバー呼び出し共通
// =============================================================================

type ServerReportType =
  | 'pitcher' | 'batter' | 'team' | 'battery-profile' | 'batter-profile';

interface ServerResponse {
  overall: string;
  improvements: Array<{ aspect: string; detail: string }>;
  nextAdvice: string;
  highlights: string;
  generatedAt: number;
  usage: AIReportUsage;
}

async function callAIReportFunction(
  reportType: ServerReportType,
  data: unknown,
): Promise<AIReport> {
  const callable = httpsCallable<
    { reportType: ServerReportType; data: unknown },
    ServerResponse
  >(functions, 'generateAIReport');
  const result = await callable({ reportType, data });
  return {
    ...result.data,
    isMock: false,
  };
}

/**
 * エラーを取得して、UI 表示用のモックレポートを生成する。
 */
function toErrorReport(err: unknown): AIReport {
  const info = mapAIReportError(err as FunctionsError);
  if (__DEV__) {
    console.warn('[aiReportService] API error:', info.reason, err);
  }
  return {
    overall: info.message,
    improvements: [],
    nextAdvice: info.subtext ?? '',
    highlights: '',
    generatedAt: Date.now(),
    isMock: true,
    errorReason: info.reason,
    actionHint: info.actionHint,
    errorTitle: info.title,
  };
}

/**
 * 先行プランガード（UX 用）。ログインしてないケースや FREE プランでは
 * サーバーを叩く前に plan_required の擬似レポートを返す。
 */
function earlyPlanGate(plan: UserPlan): AIReport | null {
  const check = checkPlanAccess(plan);
  if (check.allowed) return null;
  return {
    overall: 'AI 分析レポートはライトプラン以上でご利用いただけます。',
    improvements: [],
    nextAdvice: 'お得なプランを下記からご確認ください。',
    highlights: '',
    generatedAt: Date.now(),
    isMock: true,
    errorReason: 'plan_required',
    actionHint: 'upgrade',
    errorTitle: 'プランのアップグレードが必要です',
  };
}

// =============================================================================
// 5. データシェイプ（クライアント型 → サーバー型）
// =============================================================================

function shapePitcher(
  stats: AggregatedPitchingStats,
  score: { away: number; home: number },
  teamNames: { away: string; home: string },
) {
  return {
    playerName: stats.playerName,
    totalPitches: stats.totalPitches,
    strikeRate: stats.strikeRate,
    strikeoutRate: stats.strikeoutRate,
    avgVelocity: stats.avgVelocity ?? null,
    maxVelocity: stats.maxVelocity ?? null,
    pitchMix: stats.pitchMix.map((m) => ({ pitchType: m.pitchType, pct: m.pct })),
    zoneDistribution: stats.zoneDistribution,
    teamNames,
    score,
  };
}

function shapeBatter(
  stats: AggregatedBattingStats,
  score: { away: number; home: number },
  teamNames: { away: string; home: string },
) {
  return {
    playerName: stats.playerName,
    atBats: stats.atBats,
    hits: stats.hits,
    rbi: stats.rbi,
    avg: stats.avg,
    ops: stats.ops,
    homeRuns: stats.homeRuns,
    strikeouts: stats.strikeouts,
    swingMissRate: stats.swingMissRate,
    avgHitDistance: stats.avgHitDistance ?? null,
    teamNames,
    score,
  };
}

function shapeTeam(
  batters: AggregatedBattingStats[],
  pitcher: AggregatedPitchingStats | null,
  score: { away: number; home: number },
  teamNames: { away: string; home: string },
) {
  const topBatters = [...batters]
    .sort((a, b) => b.ops - a.ops)
    .slice(0, 4)
    .map((b) => ({
      playerName: b.playerName,
      avg: b.avg,
      ops: b.ops,
      rbi: b.rbi,
      homeRuns: b.homeRuns,
    }));

  const pitcherSummary = pitcher
    ? {
        playerName: pitcher.playerName,
        strikeRate: pitcher.strikeRate,
        strikeoutRate: pitcher.strikeoutRate,
        maxVelocity: pitcher.maxVelocity ?? null,
      }
    : null;

  return { topBatters, pitcherSummary, teamNames, score };
}

function shapeBatteryProfile(profile: BatteryProfile) {
  const top2S = profile.pitchType2Strike[0];
  const top2SZoneEntry = Object.entries(profile.zone2Strike)
    .sort(([, a], [, b]) => b - a)[0];

  return {
    pitcherName: profile.pitcherName,
    catcherName: profile.catcherName,
    totalGames: profile.totalGames,
    totalPitches: profile.totalPitches,
    strikeRate: profile.strikeRate,
    avgVelocity: profile.avgVelocity ?? null,
    maxVelocity: profile.maxVelocity ?? null,
    top2SPitch: top2S ? { type: top2S.type, pct: top2S.pct } : null,
    top2SZone: top2SZoneEntry ? { zone: top2SZoneEntry[0], count: top2SZoneEntry[1] } : null,
    finishingPitches: profile.finishingPitches.slice(0, 3).map((f) => ({
      pitchType: f.pitchType,
      zone: f.zone,
      pct: f.pct,
    })),
    countTendencies: profile.countTendencies
      .filter((c) => c.total > 0)
      .slice(0, 5)
      .map((c) => ({
        count: `${c.balls}B-${c.strikes}S`,
        topPitchType: c.pitchTypes[0]?.type ?? '-',
        topPitchPct: c.pitchTypes[0]?.pct ?? 0,
        topZone: c.topZones[0]?.zone ?? '-',
      })),
  };
}

function shapeBatterProfile(profile: BatterProfile) {
  return {
    batterName: profile.batterName,
    totalGames: profile.totalGames,
    totalAtBats: profile.totalAtBats,
    totalPitchesFaced: profile.totalPitchesFaced,
    avg: profile.avg,
    strikeoutRate: profile.strikeoutRate,
    walkRate: profile.walkRate,
    firstPitchSwingRate: profile.firstPitchSwingRate,
    weakZones: profile.weakZones.slice(0, 3).map((z) => ({
      zone: z.zone,
      swingMissRate: z.swingMissRate,
      pitchesFaced: z.pitchesFaced,
    })),
    strongZones: profile.strongZones.slice(0, 3).map((z) => ({
      zone: z.zone,
      hitRate: z.hitRate,
      pitchesFaced: z.pitchesFaced,
    })),
    pitchTypeStats: profile.pitchTypeStats.slice(0, 5).map((p) => ({
      type: p.type,
      count: p.count,
      swingMissRate: p.swingMissRate,
      hitRate: p.hitRate,
    })),
    avgHitDistance: profile.avgHitDistance ?? null,
  };
}

// =============================================================================
// 6. Public API
// =============================================================================

/**
 * 試合データから AI レポートを生成する（role=pitcher/batter/team）。
 */
export async function generateAIReport(input: ReportInput): Promise<AIReport> {
  const { game, role, pitcher, batters = [], userPlan } = input;

  // 先行プランガード
  const early = earlyPlanGate(userPlan);
  if (early) return early;

  const cacheKey = `${game.id}:${role}:${input.playerId ?? 'team'}`;
  const cached = await readCache(cacheKey);
  if (cached) return { ...cached, fromCache: true };

  const score = { away: game.scoreboard.awayTotal, home: game.scoreboard.homeTotal };
  const teamNames = { away: game.awayTeam.name, home: game.homeTeam.name };

  try {
    let report: AIReport;
    if (role === 'pitcher' && pitcher) {
      report = await callAIReportFunction('pitcher', shapePitcher(pitcher, score, teamNames));
    } else if (role === 'batter' && input.playerId) {
      const targetBatter = batters.find((b) => b.playerId === input.playerId);
      if (!targetBatter) {
        return toErrorReport(new Error('対象打者が見つかりません'));
      }
      report = await callAIReportFunction('batter', shapeBatter(targetBatter, score, teamNames));
    } else {
      report = await callAIReportFunction(
        'team',
        shapeTeam(batters, pitcher ?? null, score, teamNames),
      );
    }
    await writeCache(cacheKey, report, userPlan);
    return report;
  } catch (err) {
    return toErrorReport(err);
  }
}

/**
 * BatteryProfile から AI 分析レポートを生成する。
 */
export async function generateBatteryAIReport(
  profile: BatteryProfile,
  userPlan: UserPlan,
): Promise<AIReport> {
  const early = earlyPlanGate(userPlan);
  if (early) return early;

  const cacheKey = `battery:${profile.pitcherName}:${profile.catcherName}:${profile.totalGames}:${profile.totalPitches}`;
  const cached = await readCache(cacheKey);
  if (cached) return { ...cached, fromCache: true };

  try {
    const report = await callAIReportFunction('battery-profile', shapeBatteryProfile(profile));
    await writeCache(cacheKey, report, userPlan);
    return report;
  } catch (err) {
    return toErrorReport(err);
  }
}

/**
 * BatterProfile から AI 分析レポートを生成する。
 */
export async function generateBatterAIReport(
  profile: BatterProfile,
  userPlan: UserPlan,
): Promise<AIReport> {
  const early = earlyPlanGate(userPlan);
  if (early) return early;

  const cacheKey = `batter:${profile.batterName}:${profile.totalGames}:${profile.totalAtBats}`;
  const cached = await readCache(cacheKey);
  if (cached) return { ...cached, fromCache: true };

  try {
    const report = await callAIReportFunction('batter-profile', shapeBatterProfile(profile));
    await writeCache(cacheKey, report, userPlan);
    return report;
  } catch (err) {
    return toErrorReport(err);
  }
}

// =============================================================================
// 7. UI ユーティリティ
// =============================================================================

export function reportToSections(report: AIReport): AIReportSection[] {
  return [
    { title: '総合評価', content: report.overall },
    ...report.improvements.map((imp) => ({
      title: `改善点: ${imp.aspect}`,
      content: imp.detail,
    })),
    { title: '次回へのアドバイス', content: report.nextAdvice },
    { title: 'ハイライト', content: report.highlights },
  ];
}
