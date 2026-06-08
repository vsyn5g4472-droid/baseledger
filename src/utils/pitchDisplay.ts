import type {
  AtBatResult,
  BattedBall,
  FielderNumber,
  FieldingRecord,
  PitchLog,
  PitchResult,
} from '../types/game';
import { Colors } from '../constants/theme';

export type PitchDisplayTone = 'hit' | 'out' | 'neutral';

export interface PitchDisplayParts {
  prefix: string;
  result: string;
  tone: PitchDisplayTone;
}

const HIT_RESULTS: AtBatResult[] = ['single', 'double', 'triple', 'home_run'];

const OUT_RESULTS: AtBatResult[] = [
  'groundout',
  'flyout',
  'lineout',
  'pop_out',
  'strikeout',
  'strikeout_looking',
  'sacrifice_bunt',
  'sacrifice_fly',
  'fielders_choice',
  'double_play',
  'triple_play',
];

const FIELDER_SHORT: Record<FielderNumber, string> = {
  1: '投',
  2: '捕',
  3: '一',
  4: '二',
  5: '三',
  6: '遊',
  7: '左',
  8: '中',
  9: '右',
};

function fieldDirection(fieldX: number): '左' | '中' | '右' {
  if (fieldX < 0.35) return '左';
  if (fieldX > 0.65) return '右';
  return '中';
}

function firstFielderShort(fielding?: FieldingRecord): string | null {
  const n = fielding?.fielders[0];
  return n != null ? FIELDER_SHORT[n] : null;
}

function formatAtBatAbbrev(
  result: AtBatResult,
  battedBall?: BattedBall,
  fielding?: FieldingRecord,
): string {
  const dir = battedBall ? fieldDirection(battedBall.fieldX) : '中';
  const fielder = firstFielderShort(fielding);

  switch (result) {
    case 'home_run':
      return '本';
    case 'single':
      return `${dir}安`;
    case 'double':
      return `${dir}二`;
    case 'triple':
      return `${dir}三`;
    case 'groundout':
      return fielder ? `${fielder}ゴ` : 'ゴロ';
    case 'flyout':
      return `${dir}飛`;
    case 'lineout':
      return `${dir}直`;
    case 'pop_out':
      return `${dir}波`;
    case 'strikeout':
    case 'strikeout_looking':
      return 'K';
    case 'walk':
      return '四球';
    case 'hit_by_pitch':
      return '死球';
    case 'sacrifice_bunt':
      return '犠打';
    case 'sacrifice_fly':
      return '犠飛';
    case 'fielders_choice':
      return '野選';
    case 'double_play':
      return '併殺';
    case 'triple_play':
      return '三重殺';
    case 'error':
      return '失';
    default:
      return result;
  }
}

function toneForAtBatResult(result: AtBatResult): PitchDisplayTone {
  if (HIT_RESULTS.includes(result)) return 'hit';
  if (OUT_RESULTS.includes(result)) return 'out';
  return 'neutral';
}

function toneForPitchResult(result: PitchResult, pitch: PitchLog): PitchDisplayTone {
  if (
    (result === 'strike_called' || result === 'strike_swinging') &&
    pitch.countAfter.strikes >= 3
  ) {
    return 'out';
  }
  return 'neutral';
}

function defaultPitchResultLabel(
  result: PitchResult,
  pitch: PitchLog,
  labels: Record<string, string>,
): string {
  if (
    (result === 'strike_called' || result === 'strike_swinging') &&
    pitch.countAfter.strikes >= 3
  ) {
    return 'K';
  }
  if (result === 'ball' && pitch.countAfter.balls >= 4) {
    return '四球';
  }
  return (labels[result] ?? result).replace(/\n/g, '');
}

export function colorForTone(tone: PitchDisplayTone): string {
  if (tone === 'hit') return Colors.primary;
  if (tone === 'out') return Colors.error;
  return Colors.text;
}

export function formatPitchDisplay(
  pitch: PitchLog,
  pitchTypeLabel: string,
  pitchResultLabels: Record<string, string>,
  options?: {
    atBatResult?: AtBatResult | null;
    battedBall?: BattedBall;
    fielding?: FieldingRecord;
    isLastInPlay?: boolean;
  },
): PitchDisplayParts {
  const veloPart = pitch.velocity != null ? `${pitch.velocity}km/h ` : '';
  const prefix = `${veloPart}${pitchTypeLabel}`;

  if (pitch.result === 'in_play' && options?.isLastInPlay && options.atBatResult) {
    const result = formatAtBatAbbrev(
      options.atBatResult,
      options.battedBall,
      options.fielding,
    );
    return {
      prefix,
      result,
      tone: toneForAtBatResult(options.atBatResult),
    };
  }

  if (pitch.result === 'in_play') {
    return { prefix, result: 'プレー', tone: 'neutral' };
  }

  const result = defaultPitchResultLabel(pitch.result, pitch, pitchResultLabels);
  return {
    prefix,
    result,
    tone: toneForPitchResult(pitch.result, pitch),
  };
}
