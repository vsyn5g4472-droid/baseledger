/**
 * プッシュ通知登録（no-op）
 * expo-device / expo-notifications がネイティブ未組み込みのビルドでは呼び出しを行わない。
 */
export async function registerForPushNotifications(_userId: string): Promise<void> {
  return;
}
