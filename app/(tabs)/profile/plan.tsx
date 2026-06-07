import React, { useState, useCallback } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { Text } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Colors, Spacing, Typography, BorderRadius } from '../../../src/constants/theme';
import { useAuth } from '../../../src/contexts/AuthContext';
import { UserPlan, USER_PLAN_META } from '../../../src/services/planService';
import {
  purchasePlan,
  restorePurchases,
  syncPlanToFirestore,
} from '../../../src/services/revenueCatService';
import { auth } from '../../../src/services/firebase';
import { updateAuthorNameInPosts } from '../../../src/services/postService';
import PlanWelcomeModal from '../../../src/components/PlanWelcomeModal';
import PlanBadge from '../../../src/components/PlanBadge';

// ─── プランカード定義 ─────────────────────────────────────────────────────────

interface PlanCard {
  plan: UserPlan;
  packageId: string;
  recommended: boolean;
  features: string[];
  limit: string;
}

const PLAN_CARDS: PlanCard[] = [
  {
    plan: UserPlan.LIGHT,
    packageId: 'light_monthly',
    recommended: false,
    limit: '5試合/月・AIレポート10回/月',
    features: [
      'AI 分析レポート（10回/月）',
      'スプレーチャート',
      'ゾーンヒートマップ',
      'リーダーボード',
      'グループチャット送信',
      'PDF共有',
      '広告非表示',
    ],
  },
  {
    plan: UserPlan.STANDARD,
    packageId: 'standard_monthly',
    recommended: true,
    limit: '10試合/月・AIレポート20回/月',
    features: [
      'ライトプランの全機能',
      'セイバーメトリクス（高度統計）',
      '成績エクスポート',
      'PDF共有',
      'チーム作成',
      'クラウドバックアップ',
      'AIレポート 20回/月',
    ],
  },
  {
    plan: UserPlan.PRO,
    packageId: 'pro_monthly',
    recommended: false,
    limit: '全機能無制限',
    features: [
      'スタンダードの全機能',
      '複数チーム管理（無制限）',
      '球歴検索',
      'AI スカウトレポート',
      'AI 試合予測',
      'AIレポート 無制限',
      '試合中 相手データ参照',
    ],
  },
];

// ─── メインコンポーネント ─────────────────────────────────────────────────────

export default function PlanScreen() {
  const { currentUser, userPlan, refreshUser } = useAuth();
  const [purchasing, setPurchasing] = useState<string | null>(null);
  const [restoring, setRestoring] = useState(false);
  const [welcomePlan, setWelcomePlan] = useState<UserPlan | null>(null);

  const handlePurchase = useCallback(async (card: PlanCard) => {
    if (!currentUser) {
      Alert.alert('ログインが必要です', 'プランを購入するにはログインしてください。');
      return;
    }
    if (userPlan === card.plan) {
      Alert.alert('現在のプランです', 'すでにこのプランをご利用中です。');
      return;
    }
    setPurchasing(card.packageId);
    try {
      const newPlan = await purchasePlan(card.packageId);
      const uid = auth.currentUser!.uid;
      await syncPlanToFirestore(uid, newPlan);
      if (currentUser) {
        await updateAuthorNameInPosts(
          uid,
          currentUser.displayName,
          currentUser.photoURL,
          newPlan,
        );
      }
      await refreshUser();
      setWelcomePlan(newPlan);
    } catch (err: any) {
      if (err?.userCancelled) return;
      Alert.alert('購入に失敗しました', err?.message ?? 'しばらくしてから再度お試しください。');
    } finally {
      setPurchasing(null);
    }
  }, [currentUser, userPlan, refreshUser]);

  const handleRestore = useCallback(async () => {
    if (!currentUser) return;
    setRestoring(true);
    try {
      const restored = await restorePurchases();
      const uid = auth.currentUser!.uid;
      await syncPlanToFirestore(uid, restored);
      await updateAuthorNameInPosts(
        uid,
        currentUser.displayName,
        currentUser.photoURL,
        restored,
      );
      await refreshUser();
      Alert.alert(
        '購入情報を復元しました',
        restored === UserPlan.FREE
          ? '有効なサブスクリプションが見つかりませんでした。'
          : `${USER_PLAN_META[restored].label} が有効になりました。`,
      );
    } catch {
      Alert.alert('復元に失敗しました', 'しばらくしてから再度お試しください。');
    } finally {
      setRestoring(false);
    }
  }, [currentUser, refreshUser]);

  return (
    <>
    <PlanWelcomeModal
      visible={welcomePlan !== null}
      plan={welcomePlan ?? UserPlan.FREE}
      onClose={() => {
        setWelcomePlan(null);
        router.back();
      }}
    />
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      {/* ヘッダー */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>プランを選択</Text>
        <Text style={styles.headerSub}>
          現在: <Text style={styles.currentPlanLabel}>{USER_PLAN_META[userPlan].label}</Text>
        </Text>
      </View>

      {/* プランカード */}
      {PLAN_CARDS.map((card) => {
        const isCurrentPlan = userPlan === card.plan;
        const isBuying = purchasing === card.packageId;

        return (
          <View
            key={card.plan}
            style={[
              styles.card,
              card.recommended && styles.cardRecommended,
              isCurrentPlan && styles.cardCurrent,
            ]}
          >
            {card.recommended && (
              <View style={styles.recommendedBadge}>
                <Text style={styles.recommendedText}>⭐ おすすめ</Text>
              </View>
            )}
            {isCurrentPlan && (
              <View style={[styles.recommendedBadge, styles.currentBadge]}>
                <Text style={styles.recommendedText}>✓ 利用中</Text>
              </View>
            )}

            {/* プラン名・価格 */}
            <View style={styles.cardHeader}>
              <PlanBadge plan={card.plan} variant="badge" size="lg" />
              <View style={styles.planTitleBlock}>
                <Text style={[styles.planName, card.recommended && styles.planNameRecommended]}>
                  {USER_PLAN_META[card.plan].label}
                </Text>
                <Text style={[styles.planPrice, card.recommended && styles.planPriceRecommended]}>
                  {USER_PLAN_META[card.plan].priceLabel}
                </Text>
              </View>
            </View>

            <Text style={styles.planLimit}>{card.limit}</Text>

            {/* 機能リスト */}
            <View style={styles.featureList}>
              {card.features.map((f) => (
                <View key={f} style={styles.featureRow}>
                  <MaterialCommunityIcons name="check-circle" size={16} color={card.recommended ? Colors.primary : Colors.textSecondary} />
                  <Text style={styles.featureText}>{f}</Text>
                </View>
              ))}
            </View>

            {/* 購入ボタン */}
            <TouchableOpacity
              style={[
                styles.purchaseBtn,
                card.recommended && styles.purchaseBtnRecommended,
                isCurrentPlan && styles.purchaseBtnCurrent,
              ]}
              onPress={() => handlePurchase(card)}
              disabled={isCurrentPlan || isBuying || purchasing !== null}
              activeOpacity={0.8}
            >
              {isBuying ? (
                <ActivityIndicator color={card.recommended ? Colors.white : Colors.primary} size="small" />
              ) : (
                <Text style={[
                  styles.purchaseBtnText,
                  card.recommended && styles.purchaseBtnTextRecommended,
                  isCurrentPlan && styles.purchaseBtnTextCurrent,
                ]}>
                  {isCurrentPlan ? '現在のプラン' : `${USER_PLAN_META[card.plan].label}に変更`}
                </Text>
              )}
            </TouchableOpacity>
          </View>
        );
      })}

      {/* 注意事項 */}
      <View style={styles.notes}>
        <Text style={styles.noteText}>• スポット打席は全プラン無制限でご利用いただけます</Text>
        <Text style={styles.noteText}>• サブスクリプションは毎月自動更新されます</Text>
        <Text style={styles.noteText}>• 更新の24時間前までにキャンセルしないと自動更新されます</Text>
        <Text style={styles.noteText}>• App Store アカウントに課金されます</Text>
        <Text style={styles.noteText}>• 無料トライアル期間中はキャンセルしても課金されません</Text>
      </View>

      {/* 購入復元 */}
      <TouchableOpacity
        style={styles.restoreBtn}
        onPress={handleRestore}
        disabled={restoring}
        activeOpacity={0.7}
      >
        {restoring ? (
          <ActivityIndicator color={Colors.primary} size="small" />
        ) : (
          <Text style={styles.restoreBtnText}>購入情報を復元する</Text>
        )}
      </TouchableOpacity>
    </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  content: { padding: Spacing.md, paddingBottom: 60 },

  header: { alignItems: 'center', marginBottom: Spacing.lg },
  headerTitle: { fontSize: Typography.h2, fontWeight: '800', color: Colors.text, marginBottom: 4 },
  headerSub: { fontSize: Typography.body, color: Colors.textSecondary },
  currentPlanLabel: { fontWeight: '700', color: Colors.primary },

  // カード
  card: {
    backgroundColor: Colors.card,
    borderRadius: BorderRadius.xl,
    padding: Spacing.md,
    marginBottom: Spacing.md,
    borderWidth: 1.5,
    borderColor: Colors.border,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
  },
  cardRecommended: {
    borderColor: Colors.primary,
    borderWidth: 2.5,
    shadowOpacity: 0.14,
    shadowRadius: 14,
    elevation: 8,
  },
  cardCurrent: {
    borderColor: Colors.statusDone,
    borderWidth: 2,
  },
  recommendedBadge: {
    position: 'absolute',
    top: -12,
    alignSelf: 'center',
    backgroundColor: Colors.primary,
    paddingHorizontal: 14,
    paddingVertical: 3,
    borderRadius: BorderRadius.full,
  },
  currentBadge: {
    backgroundColor: Colors.statusDone,
  },
  recommendedText: { fontSize: 12, fontWeight: '700', color: Colors.white },

  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginTop: 8, marginBottom: 4 },
  planTitleBlock: { flex: 1 },
  planName: { fontSize: Typography.h3, fontWeight: '800', color: Colors.text },
  planNameRecommended: { color: Colors.primary },
  planPrice: { fontSize: Typography.body, fontWeight: '700', color: Colors.textSecondary, marginTop: 1 },
  planPriceRecommended: { color: Colors.primary },

  planLimit: {
    fontSize: Typography.caption,
    color: Colors.textSecondary,
    marginBottom: Spacing.sm,
  },

  featureList: { marginBottom: Spacing.md, gap: 6 },
  featureRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  featureText: { fontSize: Typography.bodySmall, color: Colors.text, flex: 1 },

  purchaseBtn: {
    paddingVertical: 12,
    borderRadius: BorderRadius.lg,
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: Colors.primary,
  },
  purchaseBtnRecommended: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  purchaseBtnCurrent: {
    borderColor: Colors.statusDone,
    backgroundColor: Colors.statusDoneBg,
  },
  purchaseBtnText: { fontSize: Typography.body, fontWeight: '700', color: Colors.primary },
  purchaseBtnTextRecommended: { color: Colors.white },
  purchaseBtnTextCurrent: { color: Colors.statusDone },

  notes: {
    marginTop: Spacing.sm,
    gap: 4,
    paddingHorizontal: Spacing.xs,
  },
  noteText: { fontSize: Typography.tiny, color: Colors.textSecondary, lineHeight: 18 },

  restoreBtn: { alignItems: 'center', paddingVertical: Spacing.lg },
  restoreBtnText: { fontSize: Typography.bodySmall, color: Colors.primary, fontWeight: '600' },
});
