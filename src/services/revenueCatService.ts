/**
 * RevenueCat サービス
 *
 * SDK の初期化、プラン取得、ログイン/ログアウトを管理する。
 * react-native-purchases は動的 require で読み込み、未組み込みビルドでも起動クラッシュを防ぐ。
 */

import { doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db, COLLECTIONS } from './firebase';
import { UserPlan } from './planService';
import type { PurchasesOfferings } from 'react-native-purchases';

const IOS_API_KEY: string = process.env.EXPO_PUBLIC_REVENUECAT_IOS_API_KEY ?? '';

function hasValidRevenueCatApiKey(): boolean {
  return IOS_API_KEY.startsWith('appl_');
}

type PurchasesModule = {
  configure: (opts: { apiKey: string }) => void;
  setLogLevel: (level: number) => void;
  getCustomerInfo: () => Promise<{ activeSubscriptions: string[] }>;
  logIn: (uid: string) => Promise<{ customerInfo: { activeSubscriptions: string[] } }>;
  logOut: () => Promise<void>;
  getOfferings: () => Promise<PurchasesOfferings>;
  purchasePackage: (pkg: unknown) => Promise<{ customerInfo: { activeSubscriptions: string[] } }>;
  restorePurchases: () => Promise<{ activeSubscriptions: string[] }>;
};

let configured = false;

function getPurchases(): PurchasesModule | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const mod = require('react-native-purchases');
    return mod.default ?? mod;
  } catch {
    if (__DEV__) console.warn('[RevenueCat] react-native-purchases not available');
    return null;
  }
}

/** 課金画面など必要なときだけ初期化する（起動時の void TurboModule 呼び出しを避ける） */
function ensureConfigured(): boolean {
  if (configured) return true;
  if (!hasValidRevenueCatApiKey()) {
    if (__DEV__) console.warn('[RevenueCat] API key not set');
    return false;
  }
  const Purchases = getPurchases();
  if (!Purchases) return false;
  try {
    Purchases.configure({ apiKey: IOS_API_KEY });
    configured = true;
    return true;
  } catch (err) {
    if (__DEV__) console.warn('[RevenueCat] configure failed:', err);
    return false;
  }
}

/** @deprecated 起動時呼び出しはクラッシュの原因になるため使用しない */
export function configureRevenueCat(): void {
  ensureConfigured();
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
  if (!ensureConfigured()) return UserPlan.FREE;
  const Purchases = getPurchases();
  if (!Purchases) return UserPlan.FREE;
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
  if (!ensureConfigured()) return UserPlan.FREE;
  const Purchases = getPurchases();
  if (!Purchases) return UserPlan.FREE;
  try {
    const { customerInfo } = await Purchases.logIn(uid);
    return customerInfoToUserPlan([...customerInfo.activeSubscriptions]);
  } catch (err) {
    if (__DEV__) console.warn('[RevenueCat] logIn failed:', err);
    return UserPlan.FREE;
  }
}

export async function logoutRevenueCatUser(): Promise<void> {
  if (!ensureConfigured()) return;
  const Purchases = getPurchases();
  if (!Purchases) return;
  try {
    await Purchases.logOut();
  } catch (err) {
    if (__DEV__) console.warn('[RevenueCat] logOut failed:', err);
  }
}

// =============================================================================
// Offerings 取得
// =============================================================================

export async function fetchOfferings(): Promise<PurchasesOfferings | null> {
  if (!ensureConfigured()) return null;
  const Purchases = getPurchases();
  if (!Purchases) return null;
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
  if (!ensureConfigured()) throw new Error('課金機能が利用できません');
  const Purchases = getPurchases();
  if (!Purchases) throw new Error('課金機能が利用できません');
  const offerings = await fetchOfferings();
  if (!offerings?.current) {
    throw new Error('RevenueCatのCurrent Offeringが見つかりません');
  }
  if (offerings.current.availablePackages.length === 0) {
    throw new Error('RevenueCatのパッケージ一覧が空です');
  }
  const pkg = offerings.current.availablePackages.find(
    (p: { identifier: string }) => p.identifier === packageIdentifier,
  );
  if (!pkg) throw new Error(`パッケージが見つかりません: ${packageIdentifier}`);
  const { customerInfo } = await Purchases.purchasePackage(pkg);
  return customerInfoToUserPlan([...customerInfo.activeSubscriptions]);
}

// =============================================================================
// サブスクリプション復元
// =============================================================================

export async function restorePurchases(): Promise<UserPlan> {
  if (!ensureConfigured()) return UserPlan.FREE;
  const Purchases = getPurchases();
  if (!Purchases) return UserPlan.FREE;
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
