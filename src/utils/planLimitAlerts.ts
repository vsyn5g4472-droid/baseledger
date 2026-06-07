import { Alert } from 'react-native';
import { router } from 'expo-router';
import { UserPlan, USER_PLAN_META } from '../services/planService';

const PLAN_SCREEN = '/(tabs)/profile/plan';

function navigateToPlan(): void {
  router.push(PLAN_SCREEN as never);
}

const PLAN_ALERT_BUTTONS = [
  { text: 'プランを見る', onPress: navigateToPlan },
  { text: '閉じる', style: 'cancel' as const },
];

/** 試合記録数の月間上限に達したとき */
export function showGameUsageLimitAlert(plan: UserPlan, limit: number): void {
  const planLabel = USER_PLAN_META[plan].label;
  Alert.alert(
    '今月の試合記録数に達しました',
    `${planLabel}では月${limit}試合まで記録できます。プランをアップグレードすると記録数が増えます。`,
    PLAN_ALERT_BUTTONS,
  );
}

/** AI分析の月間上限に達したとき */
export function showAIUsageLimitAlert(plan: UserPlan, limit: number): void {
  const planLabel = USER_PLAN_META[plan].label;
  Alert.alert(
    'AI分析の上限に達しました',
    `${planLabel}では月${limit}回のAI分析が利用できます。プランをアップグレードすると回数が増えます。`,
    PLAN_ALERT_BUTTONS,
  );
}

/** PDF共有が未対応プランのとき */
export function showPdfSharePlanAlert(): void {
  Alert.alert(
    'PDF共有はLIGHT以上のプランで利用できます',
    undefined,
    PLAN_ALERT_BUTTONS,
  );
}

/** チーム作成が未対応プランのとき */
export function showTeamCreatePlanAlert(): void {
  Alert.alert(
    'チーム作成はスタンダード以上のプランで利用できます',
    undefined,
    PLAN_ALERT_BUTTONS,
  );
}

/** 試合中の相手データ参照が未対応プランのとき */
export function showOpponentDataPlanAlert(): void {
  Alert.alert(
    '試合中の相手データ参照はPROプランで利用できます',
    undefined,
    PLAN_ALERT_BUTTONS,
  );
}
