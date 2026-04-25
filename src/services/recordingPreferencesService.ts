import { doc, getDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db, COLLECTIONS } from './firebase';
import type { RecordingPreferences } from '../models/types';
import { AppError } from '../models/types';
import { DEFAULT_RECORDING_PREFERENCES, mergeRecordingPreferences } from '../constants/recordingPreferences';

/**
 * ユーザーの recordingPreferences を取得（未設定はデフォルトで返す）
 */
export async function fetchRecordingPreferences(uid: string): Promise<RecordingPreferences> {
  try {
    const snap = await getDoc(doc(db, COLLECTIONS.USERS, uid));
    if (!snap.exists()) {
      return mergeRecordingPreferences(null);
    }
    const data = snap.data() as { recordingPreferences?: RecordingPreferences };
    return mergeRecordingPreferences(data.recordingPreferences);
  } catch (e) {
    throw new AppError('NETWORK', `Failed to load recording preferences: ${(e as Error).message}`);
  }
}

/**
 * 記録カスタマイズを永続化（部分更新可）
 */
export async function saveRecordingPreferences(
  uid: string,
  next: RecordingPreferences,
): Promise<void> {
  try {
    await updateDoc(doc(db, COLLECTIONS.USERS, uid), {
      recordingPreferences: next,
      updatedAt: serverTimestamp(),
    });
  } catch (e) {
    throw new AppError('NETWORK', `Failed to save recording preferences: ${(e as Error).message}`);
  }
}

/**
 * デフォルトに戻す
 */
export async function resetRecordingPreferencesToDefault(uid: string): Promise<RecordingPreferences> {
  const reset = mergeRecordingPreferences(null);
  await saveRecordingPreferences(uid, reset);
  return reset;
}
