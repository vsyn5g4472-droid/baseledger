/**
 * サブスクリプションプラン定義 & 機能ゲートサービス
 *
 * 4段階のプラン (FREE / LIGHT / STANDARD / PRO) と、
 * 各プランで利用可能な機能 (Feature) を一元管理する。
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { doc, getDoc } from 'firebase/firestore';
import { db, COLLECTIONS } from './firebase';

// =============================================================================
// 1. プラン定義
// =============================================================================

export enum UserPlan {
  FREE     = 'free',
  LIGHT    = 'light',
  STANDARD = 'standard',
  PRO      = 'pro',
}

export interface PlanMeta {
  label: string;
  priceLabel: string;
  price: number;
  rank: number;
}

export const USER_PLAN_META: Record<UserPlan, PlanMeta> = {
  [UserPlan.FREE]:     { label: '無料プラン',    priceLabel: '¥0/月',   price: 0,   rank: 0 },
  [UserPlan.LIGHT]:    { label: 'ライト',        priceLabel: '¥190/月', price: 190, rank: 1 },
  [UserPlan.STANDARD]: { label: 'スタンダード',  priceLabel: '¥480/月', price: 480, rank: 2 },
  [UserPlan.PRO]:      { label: 'プロ',          priceLabel: '¥980/月', price: 980, rank: 3 },
};

// =============================================================================
// 2. 機能 (Feature) 定義
// =============================================================================

export type Feature =
  | 'ai_report'
  | 'spray_chart'
  | 'zone_heatmap'
  | 'leaderboard'
  | 'sabermetrics'
  | 'stats_export'
  | 'team_create'
  | 'multi_team'
  | 'cloud_backup'
  | 'kyureki_search'
  | 'scout_ai'
  | 'group_chat_send'
  | 'ad_free'
  | 'ai_prediction'
  | 'share_report'
  | 'opponent_data';

interface FeatureMeta {
  label: string;
  minPlan: UserPlan;
}

const FEATURE_REGISTRY: Record<Feature, FeatureMeta> = {
  ai_report:        { label: 'AI 分析レポート',        minPlan: UserPlan.FREE },
  spray_chart:      { label: 'スプレーチャート',       minPlan: UserPlan.LIGHT },
  zone_heatmap:     { label: 'ゾーンヒートマップ',     minPlan: UserPlan.LIGHT },
  leaderboard:      { label: 'リーダーボード',         minPlan: UserPlan.FREE },
  sabermetrics:     { label: '高度セイバーメトリクス',  minPlan: UserPlan.STANDARD },
  stats_export:     { label: '成績エクスポート',       minPlan: UserPlan.STANDARD },
  team_create:      { label: 'チーム作成',             minPlan: UserPlan.STANDARD },
  cloud_backup:     { label: 'クラウドバックアップ',   minPlan: UserPlan.STANDARD },
  multi_team:       { label: '複数チーム管理',         minPlan: UserPlan.PRO },
  kyureki_search:   { label: '球歴検索',               minPlan: UserPlan.PRO },
  scout_ai:         { label: 'AI スカウトレポート',    minPlan: UserPlan.PRO },
  group_chat_send:  { label: 'グループチャット送信',   minPlan: UserPlan.LIGHT },
  ad_free:          { label: '広告非表示',             minPlan: UserPlan.LIGHT },
  ai_prediction:    { label: 'AI 試合予測',             minPlan: UserPlan.PRO },
  share_report:     { label: 'PDF共有',                minPlan: UserPlan.LIGHT },
  opponent_data:    { label: '試合中 相手データ参照',   minPlan: UserPlan.PRO },
};

// =============================================================================
// 3. 機能ゲート判定
// =============================================================================

export interface FeatureGateResult {
  allowed: boolean;
  feature: Feature;
  featureLabel: string;
  requiredPlan: UserPlan;
  requiredPlanLabel: string;
}

export function checkFeatureAccess(plan: UserPlan, feature: Feature): FeatureGateResult {
  const meta = FEATURE_REGISTRY[feature];
  const planRank = USER_PLAN_META[plan].rank;
  const requiredRank = USER_PLAN_META[meta.minPlan].rank;

  return {
    allowed: planRank >= requiredRank,
    feature,
    featureLabel: meta.label,
    requiredPlan: meta.minPlan,
    requiredPlanLabel: USER_PLAN_META[meta.minPlan].label,
  };
}

export function getFeatureLabel(feature: Feature): string {
  return FEATURE_REGISTRY[feature].label;
}

// =============================================================================
// 4. 利用回数制限
// =============================================================================

interface UsageLimits {
  aiReportsPerMonth: number;
  gamesPerMonth: number;
}

const PLAN_USAGE_LIMITS: Record<UserPlan, UsageLimits> = {
  [UserPlan.FREE]:     { aiReportsPerMonth: 5,  gamesPerMonth: 10 },
  [UserPlan.LIGHT]:    { aiReportsPerMonth: 10, gamesPerMonth: 20 },
  [UserPlan.STANDARD]: { aiReportsPerMonth: 20, gamesPerMonth: 30 },
  [UserPlan.PRO]:      { aiReportsPerMonth: Infinity, gamesPerMonth: Infinity },
};

export function getUsageLimits(plan: UserPlan): UsageLimits {
  return PLAN_USAGE_LIMITS[plan];
}

export async function getUsageLimitsWithBonus(userId: string, plan: UserPlan): Promise<UsageLimits & { pdfSharesPerMonth: number }> {
  const base = getUsageLimits(plan);
  try {
    const snap = await getDoc(doc(db, COLLECTIONS.USERS, userId));
    const data = snap.data() ?? {};
    return {
      aiReportsPerMonth: base.aiReportsPerMonth === Infinity
        ? Infinity
        : base.aiReportsPerMonth + (data.bonusAiReports ?? 0),
      gamesPerMonth: base.gamesPerMonth === Infinity
        ? Infinity
        : base.gamesPerMonth + (data.bonusGames ?? 0),
      pdfSharesPerMonth: data.bonusPdfShares ?? 0,
    };
  } catch {
    return { ...base, pdfSharesPerMonth: 0 };
  }
}

const USAGE_PREFIX = '@ballpark/usage/';

function currentMonthKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

interface MonthlyUsage {
  month: string;
  aiReportCount: number;
  gameCount: number;
}

async function getMonthlyUsage(): Promise<MonthlyUsage> {
  const key = USAGE_PREFIX + currentMonthKey();
  try {
    const raw = await AsyncStorage.getItem(key);
    if (raw) {
      const parsed: MonthlyUsage = JSON.parse(raw);
      if (parsed.month === currentMonthKey()) return parsed;
    }
  } catch { /* ignore */ }
  return { month: currentMonthKey(), aiReportCount: 0, gameCount: 0 };
}

async function saveMonthlyUsage(usage: MonthlyUsage): Promise<void> {
  const key = USAGE_PREFIX + currentMonthKey();
  await AsyncStorage.setItem(key, JSON.stringify(usage));
}

export interface UsageCheckResult {
  allowed: boolean;
  current: number;
  limit: number;
  limitLabel: string;
}

export async function checkAIReportUsage(plan: UserPlan, userId?: string): Promise<UsageCheckResult> {
  const limits = userId
    ? await getUsageLimitsWithBonus(userId, plan)
    : PLAN_USAGE_LIMITS[plan];
  if (limits.aiReportsPerMonth === Infinity) {
    return { allowed: true, current: 0, limit: Infinity, limitLabel: '無制限' };
  }
  const usage = await getMonthlyUsage();
  return {
    allowed: usage.aiReportCount < limits.aiReportsPerMonth,
    current: usage.aiReportCount,
    limit: limits.aiReportsPerMonth,
    limitLabel: `${limits.aiReportsPerMonth}回/月`,
  };
}

export async function incrementAIReportUsage(): Promise<void> {
  const usage = await getMonthlyUsage();
  usage.aiReportCount += 1;
  await saveMonthlyUsage(usage);
}

export async function checkGameUsage(plan: UserPlan, userId?: string): Promise<UsageCheckResult> {
  const limits = userId
    ? await getUsageLimitsWithBonus(userId, plan)
    : PLAN_USAGE_LIMITS[plan];
  if (limits.gamesPerMonth === Infinity) {
    return { allowed: true, current: 0, limit: Infinity, limitLabel: '無制限' };
  }
  const usage = await getMonthlyUsage();
  return {
    allowed: usage.gameCount < limits.gamesPerMonth,
    current: usage.gameCount,
    limit: limits.gamesPerMonth,
    limitLabel: `${limits.gamesPerMonth}試合/月`,
  };
}

export async function incrementGameUsage(): Promise<void> {
  const usage = await getMonthlyUsage();
  usage.gameCount += 1;
  await saveMonthlyUsage(usage);
}

// =============================================================================
// 5. プラン比較データ（UI 用）
// =============================================================================

export interface PlanFeatureRow {
  feature: Feature;
  label: string;
  free: string;
  light: string;
  standard: string;
  pro: string;
}

export const PLAN_COMPARISON: PlanFeatureRow[] = [
  { feature: 'ai_report',       label: '試合記録数',             free: '10試合/月', light: '20試合/月', standard: '30試合/月', pro: '無制限' },
  { feature: 'ai_report',       label: 'AI 分析レポート',        free: '5回/月',  light: '10回/月', standard: '20回/月', pro: '無制限' },
  { feature: 'share_report',    label: 'PDF共有',                free: '-',      light: '○',       standard: '○',       pro: '○' },
  { feature: 'team_create',     label: 'チーム作成',             free: '-',      light: '-',       standard: '○',       pro: '○' },
  { feature: 'opponent_data',   label: '試合中 相手データ参照',  free: '-',      light: '-',       standard: '-',       pro: '○' },
  { feature: 'spray_chart',     label: 'スプレーチャート',       free: '-',      light: '○',       standard: '○',       pro: '○' },
  { feature: 'zone_heatmap',    label: 'ゾーンヒートマップ',     free: '-',      light: '○',       standard: '○',       pro: '○' },
  { feature: 'leaderboard',     label: 'リーダーボード',         free: '○',      light: '○',       standard: '○',       pro: '○' },
  { feature: 'sabermetrics',    label: 'セイバーメトリクス',     free: '-',      light: '-',       standard: '○',       pro: '○' },
  { feature: 'stats_export',    label: '成績エクスポート',       free: '-',      light: '-',       standard: '○',       pro: '○' },
  { feature: 'cloud_backup',    label: 'クラウドバックアップ',   free: '-',      light: '-',       standard: '○',       pro: '○' },
  { feature: 'kyureki_search',  label: '球歴検索',               free: '-',      light: '-',       standard: '-',       pro: '○' },
  { feature: 'scout_ai',       label: 'AI スカウトレポート',    free: '-',      light: '-',       standard: '-',       pro: '○' },
  { feature: 'ad_free',        label: '広告非表示',             free: '-',      light: '○',       standard: '○',       pro: '○' },
];
