import { Platform } from 'react-native';
import { doc, updateDoc } from 'firebase/firestore';
import { db, COLLECTIONS } from './firebase';

/**
 * デバイスのプッシュ通知トークンを取得して Firestore の users/{uid}.pushToken に保存する。
 * シミュレーターではトークン取得不可のためスキップする。
 * ネイティブモジュール未組み込みのビルドでは静かにスキップする。
 */
export async function registerForPushNotifications(userId: string): Promise<void> {
  let Device: typeof import('expo-device');
  let Notifications: typeof import('expo-notifications');
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    Device = require('expo-device');
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    Notifications = require('expo-notifications');
  } catch {
    if (__DEV__) console.warn('[Push] expo-device / expo-notifications not available');
    return;
  }

  // シミュレーターはトークン取得不可のためスキップ
  if (!Device.isDevice) return;

  // iOS: 権限リクエスト
  if (Platform.OS === 'ios') {
    const existing = await Notifications.getPermissionsAsync();
    let finalStatus = (existing as { status: string }).status;
    if (finalStatus !== 'granted') {
      const requested = await Notifications.requestPermissionsAsync();
      finalStatus = (requested as { status: string }).status;
    }
    if (finalStatus !== 'granted') return;
  }

  // Expo プッシュトークンを取得
  const tokenData = await Notifications.getExpoPushTokenAsync();
  const pushToken = tokenData.data;

  // Firestore に保存
  await updateDoc(doc(db, COLLECTIONS.USERS, userId), { pushToken });
}
