/**
 * RevenueCat サービス
 *
 * SDK の初期化、プラン取得、ログイン/ログアウトを管理する。
 */

// @ts-ignore
import Purchases, { LOG_LEVEL, type PurchasesOfferings } from 'react-native-purchases';
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
  baseledger_light_monthly:    UserPlan.LIGHT,
};

// パッケージ識別子 → プラン（Offerings から購入する場合に使用）
export const PACKAGE_TO_PLAN: Record<string, UserPlan> = {
  pro_monthly:      UserPlan.PRO,
  standard_monthly: UserPlan.STANDARD,
  light_monthly:    UserPlan.LIGHT,
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

// =============================================================================
// Offerings 取得
// =============================================================================

export async function fetchOfferings(): Promise<PurchasesOfferings | null> {
  try {
    return await Purchases.getOfferings();
  } catch (err) {
    if (__DEV__) console.warn('[RevenueCat] getOfferings failed:', err);
    return null;
  }
}

// =============================================================================
// プラン購入
// =============================================================================

export async function purchasePlan(packageIdentifier: string): Promise<UserPlan> {
  const offerings = await fetchOfferings();
  const pkg = offerings?.current?.availablePackages.find(
    (p: any) => p.identifier === packageIdentifier,
  );
  if (!pkg) throw new Error(`パッケージが見つかりません: ${packageIdentifier}`);
  const { customerInfo } = await Purchases.purchasePackage(pkg);
  return customerInfoToUserPlan([...customerInfo.activeSubscriptions]);
}

// =============================================================================
// サブスクリプション復元
// =============================================================================

export async function restorePurchases(): Promise<UserPlan> {
  try {
    const info = await Purchases.restorePurchases();
    return customerInfoToUserPlan([...info.activeSubscriptions]);
  } catch (err) {
    if (__DEV__) console.warn('[RevenueCat] restorePurchases failed:', err);
    return UserPlan.FREE;
  }
}

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
