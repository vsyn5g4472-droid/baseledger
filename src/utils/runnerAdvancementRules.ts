import type { BaseTarget, RunnerAdvancement } from '../types/game';

const BASE_ORDER: Record<string, number> = { first: 1, second: 2, third: 3, home: 4 };
const BASE_FROM_NUM: Record<number, BaseTarget> = { 1: 'first', 2: 'second', 3: 'third', 4: 'home' };

export function baseToNum(base: string | BaseTarget): number {
  if (base === 'batter') return 0;
  if (base === 'out') return -1;
  return BASE_ORDER[base] ?? 0;
}

/** 打者走者が到達できる最大塁（他走者の到達塁でブロック） */
export function getBatterMaxBaseNum(
  advancements: RunnerAdvancement[],
  batterRunnerId?: string,
): number {
  let max = 4;
  for (const a of advancements) {
    if (batterRunnerId && a.runnerId === batterRunnerId) continue;
    if (a.fromBase === 'batter') continue;
    if (a.outcome === 'out_tag' || a.outcome === 'out_force' || a.targetBase === 'out') continue;
    const b = BASE_ORDER[a.targetBase as string];
    if (b && b < max) max = b;
  }
  return max;
}

/** 打者が既存ランナーより先の塁を飛び越えようとしているか */
export function isBatterPassingBlocked(
  adv: RunnerAdvancement,
  base: BaseTarget,
  advancements: RunnerAdvancement[],
): boolean {
  if (adv.fromBase !== 'batter' || base === 'out') return false;
  const targetNum = baseToNum(base);
  if (targetNum <= 0) return false;
  return targetNum > getBatterMaxBaseNum(advancements, adv.runnerId);
}

/** デフォルト進塁の打者 targetBase を他走者に合わせて上限クリップ */
export function capBatterTargetBase(advancements: RunnerAdvancement[]): RunnerAdvancement[] {
  const idx = advancements.findIndex((a) => a.fromBase === 'batter');
  if (idx < 0) return advancements;

  const batter = advancements[idx];
  if (
    batter.outcome === 'out_tag'
    || batter.outcome === 'out_force'
    || batter.targetBase === 'out'
  ) {
    return advancements;
  }

  const maxNum = getBatterMaxBaseNum(advancements, batter.runnerId);
  const currentNum = baseToNum(batter.targetBase);
  if (currentNum <= maxNum) return advancements;

  const cappedBase = maxNum >= 4 ? 'home' : BASE_FROM_NUM[maxNum];
  const minNum = batter.minBase === 'out' ? 0 : baseToNum(batter.minBase);
  const cappedMinNum = Math.min(Math.max(minNum, 1), maxNum);
  const cappedMinBase = cappedMinNum >= 4 ? 'home' : BASE_FROM_NUM[cappedMinNum];
  const next = [...advancements];
  next[idx] = {
    ...batter,
    targetBase: cappedBase,
    minBase: cappedMinBase,
  };
  return next;
}
