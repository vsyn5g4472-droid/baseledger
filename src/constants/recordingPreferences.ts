import type { RecordingItemId, RecordingPreferences } from '../models/types';

/**
 * デフォルト: 「よく使う項目」中心。新規 bunt/signature は false。
 * detailMode false のときは上級向け行を隠す。
 */
const DEFAULT_ITEM_VALUES: Record<RecordingItemId, boolean> = {
  foul_tip: true,
  sacrifice_fly: true,
  fielders_choice: true,
  double_play: true,
  triple_play: false,
  error_at_bat: true,
  pickoff: true,
  pickoff_balk: false,
  pickoff_error: false,
  bunt_stance: false,
  bunt_detail: false,
  sign_play: false,
  sign_miss: false,
  pitch_zone_detail: true,
  batted_ball_location: true,
  batted_ball_distance: true,
  runner_advancement_detail: true,
  substitution: true,
};

export const DEFAULT_RECORDING_PREFERENCES: RecordingPreferences = {
  detailMode: false,
  items: { ...DEFAULT_ITEM_VALUES } as Partial<Record<RecordingItemId, boolean>>,
};

export const RECORDING_ITEM_IDS: RecordingItemId[] = [
  'foul_tip',
  'sacrifice_fly',
  'fielders_choice',
  'double_play',
  'triple_play',
  'error_at_bat',
  'pickoff',
  'pickoff_balk',
  'pickoff_error',
  'bunt_stance',
  'bunt_detail',
  'sign_play',
  'sign_miss',
  'pitch_zone_detail',
  'batted_ball_location',
  'batted_ball_distance',
  'runner_advancement_detail',
  'substitution',
];

/** 詳細モードON時のみ設定画面に出す */
export const RECORDING_ITEM_DETAIL_ONLY: Set<RecordingItemId> = new Set([
  'triple_play',
  'pickoff_balk',
  'pickoff_error',
  'bunt_stance',
  'bunt_detail',
  'sign_play',
]);

/**
 * 保存値とデフォルトをマージ。recordingPreferences 未設定でも安全。
 */
export function mergeRecordingPreferences(
  saved: RecordingPreferences | null | undefined,
): RecordingPreferences {
  const base = { ...DEFAULT_RECORDING_PREFERENCES };
  if (!saved) {
    return base;
  }
  return {
    detailMode: saved.detailMode ?? base.detailMode,
    items: { ...DEFAULT_ITEM_VALUES, ...saved.items },
  };
}

export function isRecordingItemOn(
  prefs: RecordingPreferences,
  id: RecordingItemId,
): boolean {
  const merged = mergeRecordingPreferences(prefs);
  return merged.items[id] ?? DEFAULT_ITEM_VALUES[id];
}
