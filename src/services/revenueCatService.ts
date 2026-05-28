/**
 * RevenueCat サービス
 *
 * SDK の初期化、プラン取得、ログイン/ログアウトを管理する。
 */

import Purchases, { LOG_LEVEL } from 'react-native-purchases';
import Constants from 'expo-constants';
import { doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db, COLLECTIONS } from './firebase';
import { UserPlan } from './planService';

const IOS_API_KEY: string =
  (Constants.expoConfig?.extra?.revenueCatIosApiKey as string | undefined) ?? '';

// =============================================================================
// 初期化
// =============================================================================

export function configureRevenueCat(): void {
  if (!IOS_API_KEY) {
    if (__DEV__) console.warn('[RevenueCat] API key not set');
    return;
  }
  if (__DEV__) Purchases.setLogLevel(LOG_LEVEL.DEBUG);
  Purchases.configure({ apiKey: IOS_API_KEY });
}

// =============================================================================
// プラン変換
// =============================================================================

const PRODUCT_TO_PLAN: Record<string, UserPlan> = {
  baseledger_pro_monthly:      UserPlan.PRO,
  baseledger_standard_monthly: UserPlan.STANDARD,
};

export function customerInfoToUserPlan(
  activeSubscriptions: string[],
): UserPlan {
  for (const productId of activeSubscriptions) {
    const plan = PRODUCT_TO_PLAN[productId];
    if (plan) return plan;
  }
  return UserPlan.FREE;
}

// =============================================================================
// プラン取得
// =============================================================================

export async function fetchRevenueCatPlan(): Promise<UserPlan> {
  try {
    const info = await Purchases.getCustomerInfo();
    return customerInfoToUserPlan([...info.activeSubscriptions]);
  } catch (err) {
    if (__DEV__) console.warn('[RevenueCat] getCustomerInfo failed:', err);
    return UserPlan.FREE;
  }
}

// =============================================================================
// ログイン / ログアウト
// =============================================================================

export async function loginRevenueCatUser(uid: string): Promise<UserPlan> {
  try {
    const { customerInfo } = await Purchases.logIn(uid);
    return customerInfoToUserPlan([...customerInfo.activeSubscriptions]);
  } catch (err) {
    if (__DEV__) console.warn('[RevenueCat] logIn failed:', err);
    return UserPlan.FREE;
  }
}

export async function logoutRevenueCatUser(): Promise<void> {
  try {
    await Purchases.logOut();
  } catch (err) {
    if (__DEV__) console.warn('[RevenueCat] logOut failed:', err);
  }
}

// =============================================================================
// Firestore へのプラン同期
// =============================================================================

export async function syncPlanToFirestore(
  uid: string,
  plan: UserPlan,
): Promise<void> {
  try {
    await updateDoc(doc(db, COLLECTIONS.USERS, uid), {
      plan,
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    if (__DEV__) console.warn('[RevenueCat] syncPlanToFirestore failed:', err);
  }
}
