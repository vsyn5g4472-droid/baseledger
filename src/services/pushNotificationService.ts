import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { Platform } from 'react-native';
import { doc, updateDoc } from 'firebase/firestore';
import { db, COLLECTIONS } from './firebase';

/**
 * デバイスのプッシュ通知トークンを取得して Firestore の users/{uid}.pushToken に保存する。
 * シミュレーターではトークン取得不可のためスキップする。
 */
export async function registerForPushNotifications(userId: string): Promise<void> {
  // シミュレーターはトークン取得不可のためスキップ
  if (!Device.isDevice) return;

  // iOS: 権限リクエスト
  if (Platform.OS === 'ios') {
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;
    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }
    if (finalStatus !== 'granted') return;
  }

  // Expo プッシュトークンを取得
  const tokenData = await Notifications.getExpoPushTokenAsync();
  const pushToken = tokenData.data;

  // Firestore に保存
  await updateDoc(doc(db, COLLECTIONS.USERS, userId), { pushToken });
}
