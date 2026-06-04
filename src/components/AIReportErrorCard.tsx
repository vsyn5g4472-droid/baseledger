/**
 * AI レポート取得失敗時にエラー内容とアクションを表示するカード。
 *
 * - plan_required の場合は PlanUpgradeCard をそのまま再利用する
 * - それ以外は理由別に色・アイコン・文言を出し分ける
 */

import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Colors, Spacing, Typography, BorderRadius, CardShadow } from '../constants/theme';
import PlanUpgradeCard from './PlanUpgradeCard';
import { UserPlan } from '../services/planService';
import type { AIReport } from '../services/aiReportService';
import type { AIReportErrorReason, AIReportActionHint } from '../utils/aiReportErrors';

// =============================================================================
// 1. 視覚スタイル（reason → 色 / アイコン）
// =============================================================================

interface Visual {
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  tint: string;
  bgTint: string;
}

function visualFor(reason: AIReportErrorReason): Visual {
  switch (reason) {
    case 'monthly_limit_exceeded':
    case 'daily_limit_exceeded':
      return { icon: 'timer-sand', tint: Colors.caution, bgTint: Colors.cautionBg };
    case 'network_error':
      return { icon: 'wifi-off', tint: Colors.textSecondary, bgTint: Colors.surfaceGray };
    case 'ai_service_unavailable':
    case 'parse_error':
      return { icon: 'cloud-off-outline', tint: Colors.statusLive, bgTint: Colors.statusLiveBg };
    case 'unauthenticated':
      return { icon: 'lock-outline', tint: Colors.primary, bgTint: Colors.primaryLight };
    case 'invalid_report_type':
    case 'invalid_data':
    case 'payload_too_large':
      return { icon: 'alert-circle-outline', tint: Colors.statusLive, bgTint: Colors.statusLiveBg };
    default:
      return { icon: 'alert-outline', tint: Colors.textSecondary, bgTint: Colors.surfaceGray };
  }
}

function actionLabel(hint: AIReportActionHint): string | null {
  switch (hint) {
    case 'retry':    return 'もう一度試す';
    case 'wait':     return null;
    case 'upgrade':  return null;
    case 'login':    return null;
    case 'none':
    default:         return null;
  }
}

// =============================================================================
// 2. Props
// =============================================================================

interface Props {
  report: AIReport;
  currentPlan?: UserPlan;
  featureLabel?: string;
  onRetry?: () => void;
}

// =============================================================================
// 3. Component
// =============================================================================

export default function AIReportErrorCard({
  report,
  currentPlan = UserPlan.FREE,
  featureLabel = 'AI 分析サマリ',
  onRetry,
}: Props) {
  // plan_required は既存の PlanUpgradeCard をそのまま使う
  if (report.errorReason === 'plan_required') {
    return <PlanUpgradeCard featureLabel={featureLabel} currentPlan={currentPlan} />;
  }

  const reason = (report.errorReason ?? 'unknown_error') as AIReportErrorReason;
  const v = visualFor(reason);
  const retryLabel =
    report.actionHint ? actionLabel(report.actionHint) : null;

  return (
    <View style={[styles.card, { backgroundColor: v.bgTint }]}>
      <View style={styles.headerRow}>
        <MaterialCommunityIcons name={v.icon} size={22} color={v.tint} />
        <Text style={[styles.title, { color: v.tint }]}>
          {report.errorTitle ?? 'エラーが発生しました'}
        </Text>
      </View>

      {report.overall ? (
        <Text style={styles.message}>{report.overall}</Text>
      ) : null}
      {report.nextAdvice ? (
        <Text style={styles.subtext}>{report.nextAdvice}</Text>
      ) : null}

      {retryLabel && onRetry ? (
        <TouchableOpacity style={styles.retryBtn} onPress={onRetry} activeOpacity={0.85}>
          <MaterialCommunityIcons name="refresh" size={14} color={Colors.white} />
          <Text style={styles.retryText}>{retryLabel}</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

// =============================================================================
// 4. Styles
// =============================================================================

const styles = StyleSheet.create({
  card: {
    borderRadius: BorderRadius.xl,
    padding: Spacing.md,
    gap: Spacing.xs,
    ...CardShadow,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  title: {
    fontSize: Typography.bodySmall,
    fontWeight: '800',
  },
  message: {
    fontSize: Typography.bodySmall,
    color: Colors.text,
    lineHeight: 20,
  },
  subtext: {
    fontSize: Typography.caption,
    color: Colors.textSecondary,
    lineHeight: 18,
  },
  retryBtn: {
    alignSelf: 'flex-start',
    marginTop: Spacing.xs,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: Colors.primary,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 6,
    borderRadius: BorderRadius.md,
  },
  retryText: {
    color: Colors.white,
    fontSize: Typography.caption,
    fontWeight: '700',
  },
});
