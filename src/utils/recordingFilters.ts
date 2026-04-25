import type { AtBatResult, PitchResult } from '../types/game';
import type { RecordingPreferences } from '../models/types';
import { isRecItem } from '../hooks/useRecordingPreferences';

export type FieldViewFilter = (result: AtBatResult, list: 'hit' | 'out' | 'foul') => boolean;

/**
 * FieldView 用: 打席結果ボタンの表示制御
 */
export function makeFieldViewFilter(prefs: RecordingPreferences): FieldViewFilter {
  return (result: AtBatResult, list: 'hit' | 'out' | 'foul') => {
    if (list === 'hit') return true;
    if (list === 'foul') {
      if (result === 'error' && !isRecItem(prefs, 'error_at_bat')) return false;
      return true;
    }
    if (!isRecItem(prefs, 'sacrifice_fly') && result === 'sacrifice_fly') return false;
    if (!isRecItem(prefs, 'fielders_choice') && result === 'fielders_choice') return false;
    if (!isRecItem(prefs, 'double_play') && result === 'double_play') return false;
    if (!isRecItem(prefs, 'error_at_bat') && result === 'error') return false;
    return true;
  };
}

const PITCH_ORDER: { result: PitchResult }[] = [
  { result: 'ball' },
  { result: 'strike_called' },
  { result: 'strike_swinging' },
  { result: 'foul' },
  { result: 'foul_tip' },
  { result: 'in_play' },
  { result: 'hit_by_pitch' },
];

export function filterPitchResultOptions(
  prefs: RecordingPreferences,
): { result: PitchResult; color: string; label?: string }[] {
  const colors: Record<PitchResult, string> = {
    ball: '#2E7D9F',
    strike_called: '#C41E3A',
    strike_swinging: '#9B1528',
    foul: '#B87A00',
    foul_tip: '#8B5E00',
    in_play: '#38A1F3',
    hit_by_pitch: '#5A1A5C',
  };
  const labels: Partial<Record<PitchResult, string>> = {
    ball: 'ボール',
    strike_called: '見逃し',
    strike_swinging: '空振り',
    foul: 'ファウル',
    foul_tip: 'チップ',
    in_play: 'インプレー',
    hit_by_pitch: '死球',
  };
  return PITCH_ORDER.filter((row) => {
    if (row.result === 'foul_tip' && !isRecItem(prefs, 'foul_tip')) return false;
    return true;
  }).map((row) => ({
    result: row.result,
    color: colors[row.result],
    label: labels[row.result],
  }));
}
