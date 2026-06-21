import {
  collection,
  doc,
  addDoc,
  setDoc,
  deleteDoc,
  getDocs,
  getDoc,
  Timestamp,
} from 'firebase/firestore';
import { db } from './firebase';

/**
 * 投稿・コメント・ユーザーを通報する。
 * reports/{reportId} に保存。
 */
export async function reportContent(
  reporterId: string,
  targetId: string,
  targetType: 'post' | 'comment' | 'user',
  targetContent: string,
): Promise<void> {
  await addDoc(collection(db, 'reports'), {
    reporterId,
    targetId,
    targetType,
    targetContent,
    reason: '',
    createdAt: Timestamp.now(),
  });
}

/**
 * ユーザーをブロックする。
 * blockedUsers/{blockerId}/blocking/{blockedUserId} に保存。
 */
export async function blockUser(blockerId: string, blockedUserId: string): Promise<void> {
  await setDoc(doc(db, 'blockedUsers', blockerId, 'blocking', blockedUserId), {
    blockedAt: Timestamp.now(),
  });
}

/**
 * ブロックを解除する。
 */
export async function unblockUser(blockerId: string, blockedUserId: string): Promise<void> {
  await deleteDoc(doc(db, 'blockedUsers', blockerId, 'blocking', blockedUserId));
}

/**
 * ブロック中のユーザーIDリストを取得する。
 */
export async function getBlockedUserIds(userId: string): Promise<string[]> {
  const snap = await getDocs(collection(db, 'blockedUsers', userId, 'blocking'));
  return snap.docs.map((d) => d.id);
}

/**
 * 特定ユーザーをブロックしているか確認する。
 */
export async function isBlocked(blockerId: string, blockedUserId: string): Promise<boolean> {
  const snap = await getDoc(doc(db, 'blockedUsers', blockerId, 'blocking', blockedUserId));
  return snap.exists();
}
