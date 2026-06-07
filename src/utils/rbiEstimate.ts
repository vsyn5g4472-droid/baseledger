import type { AtBatResult, Runners } from '../types/game';

/** 打席結果と打席前ランナーから想定打点を算出する（編集モーダル用） */
export function estimateDefaultRbi(
  result: AtBatResult,
  runnersBefore: Runners,
): number {
  const onThird = runnersBefore.third !== null;
  const onSecond = runnersBefore.second !== null;
  const onFirst = runnersBefore.first !== null;
  const runnerCount = (onFirst ? 1 : 0) + (onSecond ? 1 : 0) + (onThird ? 1 : 0);

  if (result === 'home_run') {
    return 1 + runnerCount;
  }
  if (result === 'sacrifice_fly' && onThird) {
    return 1;
  }
  return 0;
}

/** 得点が発生しうる結果で打点が未設定のときに補正が必要か */
export function shouldAutoFillRbi(result: AtBatResult, currentRbi: number): boolean {
  if (currentRbi > 0) return false;
  return result === 'home_run' || result === 'sacrifice_fly';
}
