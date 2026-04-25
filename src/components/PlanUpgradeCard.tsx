import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  ScrollView,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Colors, Spacing, Typography, BorderRadius } from '../constants/theme';
import { UserPlan, USER_PLAN_META } from '../services/planService';

const PLANS = [
  {
    id: UserPlan.LIGHT,
    name: 'ライト',
    price: '¥190',
    period: '/月',
    features: ['AI 分析 (3回/月)', 'スプレーチャート', 'ヒートマップ', 'リーダーボード'],
    highlight: false,
    icon: 'star-outline' as const,
  },
  {
    id: UserPlan.STANDARD,
    name: 'スタンダード',
    price: '¥480',
    period: '/月',
    features: ['AI 分析 (15回/月)', 'セイバーメトリクス', 'チーム作成', '成績エクスポート', 'クラウドバックアップ'],
    highlight: true,
    icon: 'star-half-full' as const,
  },
  {
    id: UserPlan.PRO,
    name: 'プロ',
    price: '¥980',
    period: '/月',
    features: ['AI 分析 無制限', '球歴検索', 'スカウト AI', '複数チーム管理', '全機能フル開放'],
    highlight: false,
    icon: 'star' as const,
  },
] as const;

interface PlanUpgradeCardProps {
  featureLabel?: string;
  currentPlan?: UserPlan;
}

export default function PlanUpgradeCard({
  featureLabel = 'AI 分析機能',
  currentPlan = UserPlan.FREE,
}: PlanUpgradeCardProps) {
  const handleUpgrade = (planId: string) => {
    const plan = PLANS.find((p) => p.id === planId);
    Alert.alert(
      `${plan?.name ?? ''}プランへアップグレード`,
      'App Store からサブスクリプションを開始できます。（近日公開予定）',
      [{ text: 'OK', style: 'default' }],
    );
  };

  const currentRank = USER_PLAN_META[currentPlan].rank;

  return (
    <View style={styles.outer}>
      <View style={styles.glowTopRight} pointerEvents="none" />
      <View style={styles.glowBottomLeft} pointerEvents="none" />

      <View style={styles.header}>
        <View style={styles.iconWrap}>
          <MaterialCommunityIcons name="creation" size={18} color="#4F8EF7" />
        </View>
        <Text style={styles.featureLabel}>{featureLabel}</Text>
        <View style={styles.premiumBadge}>
          <Text style={styles.premiumBadgeText}>PREMIUM</Text>
        </View>
      </View>

      <Text style={styles.description}>
        プランをアップグレードして、AI 分析レポートや高度な統計機能をアンロックしましょう。
      </Text>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.plansRow}>
        {PLANS.map((plan) => {
          const isCurrentPlan = plan.id === currentPlan;
          const isUpgrade = USER_PLAN_META[plan.id].rank > currentRank;
          return (
            <View
              key={plan.id}
              style={[
                styles.planCard,
                plan.highlight && styles.planCardHighlight,
                isCurrentPlan && styles.planCardCurrent,
              ]}
            >
              {plan.highlight && (
                <View style={styles.popularBadge}>
                  <Text style={styles.popularBadgeText}>人気</Text>
                </View>
              )}
              <View style={styles.planIconRow}>
                <MaterialCommunityIcons
                  name={plan.icon}
                  size={16}
                  color={plan.highlight ? '#4F8EF7' : Colors.textSecondary}
                />
                <Text style={[styles.planName, plan.highlight && styles.planNameHighlight]}>
                  {plan.name}
                </Text>
              </View>
              <View style={styles.priceRow}>
                <Text style={[styles.planPrice, plan.highlight && styles.planPriceHighlight]}>
                  {plan.price}
                </Text>
                <Text style={styles.planPeriod}>{plan.period}</Text>
              </View>
              <View style={styles.featureList}>
                {plan.features.map((f) => (
                  <View key={f} style={styles.featureItem}>
                    <MaterialCommunityIcons
                      name="check-circle"
                      size={12}
                      color={plan.highlight ? '#4F8EF7' : Colors.statusDone}
                    />
                    <Text style={styles.featureText}>{f}</Text>
                  </View>
                ))}
              </View>
              {isCurrentPlan ? (
                <View style={styles.currentPlanBadge}>
                  <Text style={styles.currentPlanText}>現在のプラン</Text>
                </View>
              ) : isUpgrade ? (
                <TouchableOpacity
                  style={[styles.planBtn, plan.highlight && styles.planBtnHighlight]}
                  onPress={() => handleUpgrade(plan.id)}
                  activeOpacity={0.85}
                >
                  <Text style={[styles.planBtnText, plan.highlight && styles.planBtnTextHighlight]}>
                    選択
                  </Text>
                </TouchableOpacity>
              ) : null}
            </View>
          );
        })}
      </ScrollView>

      <Text style={styles.hint}>いつでもキャンセル可能 · App Store 決済</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  outer: {
    backgroundColor: '#FFFFFF',
    borderRadius: BorderRadius.xl ?? 16,
    padding: Spacing.md,
    overflow: 'hidden',
    shadowColor: '#4F8EF7',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 16,
    elevation: 6,
  },

  glowTopRight: {
    position: 'absolute',
    top: -30,
    right: -30,
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: 'rgba(79,142,247,0.10)',
  },
  glowBottomLeft: {
    position: 'absolute',
    bottom: -20,
    left: -20,
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(79,142,247,0.07)',
  },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: Spacing.xs,
  },
  iconWrap: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: 'rgba(79,142,247,0.12)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  featureLabel: {
    fontSize: Typography.body,
    fontWeight: '700',
    color: Colors.text,
    flex: 1,
  },
  premiumBadge: {
    backgroundColor: 'rgba(79,142,247,0.12)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: BorderRadius.full ?? 999,
  },
  premiumBadgeText: {
    fontSize: Typography.tiny,
    fontWeight: '800',
    color: '#4F8EF7',
    letterSpacing: 0.8,
  },

  description: {
    fontSize: Typography.caption,
    color: Colors.textSecondary,
    lineHeight: 18,
    marginBottom: Spacing.md,
  },

  plansRow: {
    gap: 10,
    paddingBottom: Spacing.sm,
  },
  planCard: {
    width: 160,
    backgroundColor: Colors.surfaceGray,
    borderRadius: BorderRadius.md,
    padding: Spacing.sm,
    borderWidth: 1.5,
    borderColor: Colors.border,
    position: 'relative',
    overflow: 'hidden',
  },
  planCardHighlight: {
    backgroundColor: '#EEF4FF',
    borderColor: '#4F8EF7',
  },
  planCardCurrent: {
    borderColor: Colors.statusDone,
    borderWidth: 2,
  },

  popularBadge: {
    position: 'absolute',
    top: 0,
    right: 0,
    backgroundColor: '#4F8EF7',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderBottomLeftRadius: BorderRadius.sm ?? 6,
  },
  popularBadgeText: {
    fontSize: 9,
    fontWeight: '800',
    color: '#fff',
  },

  planIconRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 4,
  },
  planName: {
    fontSize: Typography.tiny,
    fontWeight: '700',
    color: Colors.textSecondary,
    textTransform: 'uppercase' as const,
    letterSpacing: 0.5,
  },
  planNameHighlight: {
    color: '#4F8EF7',
  },

  priceRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 1,
    marginBottom: 8,
  },
  planPrice: {
    fontSize: Typography.h4,
    fontWeight: '900',
    color: Colors.text,
  },
  planPriceHighlight: {
    color: '#4F8EF7',
  },
  planPeriod: {
    fontSize: Typography.tiny,
    color: Colors.textSecondary,
    fontWeight: '500',
  },

  featureList: {
    gap: 4,
    marginBottom: 8,
  },
  featureItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  featureText: {
    fontSize: 10,
    color: Colors.textSecondary,
    fontWeight: '500',
    flexShrink: 1,
  },

  planBtn: {
    backgroundColor: Colors.surfaceGray,
    borderRadius: BorderRadius.sm ?? 6,
    paddingVertical: 6,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  planBtnHighlight: {
    backgroundColor: '#4F8EF7',
    borderColor: '#4F8EF7',
  },
  planBtnText: {
    fontSize: Typography.caption,
    fontWeight: '700',
    color: Colors.text,
  },
  planBtnTextHighlight: {
    color: '#fff',
  },

  currentPlanBadge: {
    backgroundColor: 'rgba(52,199,89,0.1)',
    borderRadius: BorderRadius.sm ?? 6,
    paddingVertical: 6,
    alignItems: 'center',
  },
  currentPlanText: {
    fontSize: Typography.caption,
    fontWeight: '700',
    color: Colors.statusDone,
  },

  hint: {
    textAlign: 'center',
    fontSize: Typography.tiny,
    color: Colors.textDisabled,
    marginTop: 2,
  },
});
