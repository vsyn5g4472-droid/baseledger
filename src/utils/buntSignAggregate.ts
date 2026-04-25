import type { AtBatLog, AtBatResult, BuntType, GameState, SignPlayTag, StolenBaseLog } from '../types/game';

const HIT: AtBatResult[] = ['single', 'double', 'triple', 'home_run'];

const BUNT_TYPES: BuntType[] = ['sacrifice', 'squeeze', 'safety', 'push', 'drag'];
const SIGN_TAGS: SignPlayTag[] = [
  'hit_and_run',
  'run_and_hit',
  'squeeze',
  'double_steal',
  'delayed_steal',
  'bunt_and_run',
];

function emptyBuntType(): Record<BuntType, { attempts: number; successes: number }> {
  return {
    sacrifice: { attempts: 0, successes: 0 },
    squeeze: { attempts: 0, successes: 0 },
    safety: { attempts: 0, successes: 0 },
    push: { attempts: 0, successes: 0 },
    drag: { attempts: 0, successes: 0 },
  };
}

function emptySign(): Record<SignPlayTag, { attempts: number; successes: number }> {
  return {
    hit_and_run: { attempts: 0, successes: 0 },
    run_and_hit: { attempts: 0, successes: 0 },
    squeeze: { attempts: 0, successes: 0 },
    double_steal: { attempts: 0, successes: 0 },
    delayed_steal: { attempts: 0, successes: 0 },
    bunt_and_run: { attempts: 0, successes: 0 },
  };
}

/** 案A: 犠打成功 + バント分類付き安打等の進塁成功 */
function isBuntSuccess(ab: AtBatLog, r: AtBatResult): boolean {
  if (r === 'sacrifice_bunt') return true;
  if (ab.buntType && HIT.includes(r)) return true;
  if (ab.buntType === 'squeeze' && ab.rbiCount >= 1) return true;
  return false;
}

function isBuntAttempt(ab: AtBatLog, r: AtBatResult): boolean {
  if (r === 'sacrifice_bunt') return true;
  if (ab.buntType) return true;
  return ab.pitches.some((p) => p.buntAttempt);
}

function atBatSignSucceeds(ab: AtBatLog, tag: SignPlayTag, r: AtBatResult): boolean {
  switch (tag) {
    case 'hit_and_run':
    case 'run_and_hit':
      return HIT.includes(r);
    case 'squeeze':
      return r === 'sacrifice_bunt' || ab.rbiCount >= 1;
    case 'bunt_and_run':
      return HIT.includes(r) || r === 'sacrifice_bunt';
    case 'double_steal':
    case 'delayed_steal':
      return false;
    default:
      return false;
  }
}

/** v1: ダブルスチール等は盗塁ログで「タグ付きかつセーフ＝1成功」 */
function stolenLogSuccess(log: StolenBaseLog): boolean {
  if (log.result !== 'safe' || !log.signPlay) return false;
  return true;
}

export interface BuntSignAggregate {
  bunt: { attempts: number; successes: number; rate: number };
  sign: { attempts: number; successes: number; rate: number };
  byBuntType: Record<BuntType, { attempts: number; successes: number }>;
  bySign: Record<SignPlayTag, { attempts: number; successes: number }>;
}

/**
 * 複数試合からバント成功率・サイン成功率を集計
 * @param filterBatterId 指定時は当該打者の打席のみ
 */
export function aggregateBuntSignStats(
  games: GameState[],
  filterBatterId?: string,
): BuntSignAggregate {
  const byBunt = emptyBuntType();
  const byS = emptySign();
  let bAtt = 0;
  let bSuc = 0;
  let sAtt = 0;
  let sSuc = 0;

  for (const g of games) {
    for (const ab of g.atBatLogs) {
      if (!ab.result) continue;
      if (filterBatterId && ab.batterId !== filterBatterId) continue;
      const r = ab.result;

      if (isBuntAttempt(ab, r)) {
        bAtt += 1;
        if (isBuntSuccess(ab, r)) bSuc += 1;
        if (ab.buntType) {
          const t = ab.buntType;
          if (BUNT_TYPES.includes(t)) {
            byBunt[t].attempts += 1;
            if (isBuntSuccess(ab, r)) byBunt[t].successes += 1;
          }
        } else if (r === 'sacrifice_bunt') {
          byBunt.sacrifice.attempts += 1;
          byBunt.sacrifice.successes += 1;
        }
      }

      if (ab.signPlay) {
        const tag = ab.signPlay;
        // ダブルスチール/ディレードは盗塁ログ側のみ集計
        if (tag === 'double_steal' || tag === 'delayed_steal') {
          // skip
        } else if (SIGN_TAGS.includes(tag)) {
          byS[tag].attempts += 1;
          sAtt += 1;
          if (atBatSignSucceeds(ab, tag, r)) {
            byS[tag].successes += 1;
            sSuc += 1;
          }
        }
      }
    }

    for (const sb of g.stolenBaseLogs ?? []) {
      if (filterBatterId) {
        if (sb.runnerId !== filterBatterId) continue;
      }
      if (sb.signPlay) {
        const tag = sb.signPlay;
        if (SIGN_TAGS.includes(tag)) {
          byS[tag].attempts += 1;
          sAtt += 1;
          if (stolenLogSuccess(sb)) {
            byS[tag].successes += 1;
            sSuc += 1;
          }
        }
      }
    }
  }

  return {
    bunt: {
      attempts: bAtt,
      successes: bSuc,
      rate: bAtt > 0 ? bSuc / bAtt : 0,
    },
    sign: {
      attempts: sAtt,
      successes: sSuc,
      rate: sAtt > 0 ? sSuc / sAtt : 0,
    },
    byBuntType: byBunt,
    bySign: byS,
  };
}

export { BUNT_TYPES, SIGN_TAGS };
