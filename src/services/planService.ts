/**
 * サブスクリプションプラン定義 & 機能ゲートサービス
 *
 * 4段階のプラン (FREE / LIGHT / STANDARD / PRO) と、
 * 各プランで利用可能な機能 (Feature) を一元管理する。
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

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
  | 'ad_free';

interface FeatureMeta {
  label: string;
  minPlan: UserPlan;
}

const FEATURE_REGISTRY: Record<Feature, FeatureMeta> = {
  ai_report:        { label: 'AI 分析レポート',        minPlan: UserPlan.LIGHT },
  spray_chart:      { label: 'スプレーチャート',       minPlan: UserPlan.LIGHT },
  zone_heatmap:     { label: 'ゾーンヒートマップ',     minPlan: UserPlan.LIGHT },
  leaderboard:      { label: 'リーダーボード',         minPlan: UserPlan.LIGHT },
  sabermetrics:     { label: '高度セイバーメトリクス',  minPlan: UserPlan.STANDARD },
  stats_export:     { label: '成績エクスポート',       minPlan: UserPlan.STANDARD },
  team_create:      { label: 'チーム作成',             minPlan: UserPlan.STANDARD },
  cloud_backup:     { label: 'クラウドバックアップ',   minPlan: UserPlan.STANDARD },
  multi_team:       { label: '複数チーム管理',         minPlan: UserPlan.PRO },
  kyureki_search:   { label: '球歴検索',               minPlan: UserPlan.PRO },
  scout_ai:         { label: 'AI スカウトレポート',    minPlan: UserPlan.PRO },
  group_chat_send:  { label: 'グループチャット送信',   minPlan: UserPlan.LIGHT },
  ad_free:          { label: '広告非表示',             minPlan: UserPlan.LIGHT },
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
  [UserPlan.FREE]:     { aiReportsPerMonth: 0,  gamesPerMonth: 3 },
  [UserPlan.LIGHT]:    { aiReportsPerMonth: 3,  gamesPerMonth: 10 },
  [UserPlan.STANDARD]: { aiReportsPerMonth: 15, gamesPerMonth: Infinity },
  [UserPlan.PRO]:      { aiReportsPerMonth: Infinity, gamesPerMonth: Infinity },
};

export function getUsageLimits(plan: UserPlan): UsageLimits {
  return PLAN_USAGE_LIMITS[plan];
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

export async function checkAIReportUsage(plan: UserPlan): Promise<UsageCheckResult> {
  const limits = PLAN_USAGE_LIMITS[plan];
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

export async function checkGameUsage(plan: UserPlan): Promise<UsageCheckResult> {
  const limits = PLAN_USAGE_LIMITS[plan];
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
  { feature: 'ai_report',       label: 'AI 分析レポート',        free: '-',      light: '3回/月',  standard: '15回/月', pro: '無制限' },
  { feature: 'spray_chart',     label: 'スプレーチャート',       free: '-',      light: '○',       standard: '○',       pro: '○' },
  { feature: 'zone_heatmap',    label: 'ゾーンヒートマップ',     free: '-',      light: '○',       standard: '○',       pro: '○' },
  { feature: 'leaderboard',     label: 'リーダーボード',         free: '-',      light: '○',       standard: '○',       pro: '○' },
  { feature: 'sabermetrics',    label: 'セイバーメトリクス',     free: '-',      light: '-',       standard: '○',       pro: '○' },
  { feature: 'stats_export',    label: '成績エクスポート',       free: '-',      light: '-',       standard: '○',       pro: '○' },
  { feature: 'team_create',     label: 'チーム作成',             free: '-',      light: '-',       standard: '1チーム', pro: '無制限' },
  { feature: 'cloud_backup',    label: 'クラウドバックアップ',   free: '-',      light: '-',       standard: '○',       pro: '○' },
  { feature: 'kyureki_search',  label: '球歴検索',               free: '-',      light: '-',       standard: '-',       pro: '○' },
  { feature: 'scout_ai',       label: 'AI スカウトレポート',    free: '-',      light: '-',       standard: '-',       pro: '○' },
  { feature: 'ad_free',        label: '広告非表示',             free: '-',      light: '○',       standard: '○',       pro: '○' },
];
