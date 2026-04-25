import { useCallback, useMemo } from 'react';
import type { User } from '../models/types';
import type { RecordingItemId, RecordingPreferences } from '../models/types';
import { mergeRecordingPreferences } from '../constants/recordingPreferences';

/**
 * currentUser からデフォルトマージ済みの recordingPreferences を返す（未設定ユーザー対応）
 */
export function useRecordingPreferences(currentUser: User | null | undefined): {
  prefs: RecordingPreferences;
  isItemOn: (id: RecordingItemId) => boolean;
} {
  const prefs = useMemo(
    () => mergeRecordingPreferences(currentUser?.recordingPreferences),
    [currentUser?.recordingPreferences],
  );

  const isItemOn = useCallback(
    (id: RecordingItemId) => mergeRecordingPreferences(currentUser?.recordingPreferences).items[id] === true,
    [currentUser?.recordingPreferences],
  );

  return { prefs, isItemOn };
}

/** merge 済み prefs で 1 項目が ON か */
export function isRecItem(prefs: RecordingPreferences, id: RecordingItemId): boolean {
  return mergeRecordingPreferences(prefs).items[id] === true;
}
