import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db, COLLECTIONS } from './firebase';

/**
 * 自分専用の選手名寄せメモ。
 *
 * 「自分の試合の選手」と「共有インポート試合の選手」は Player.id / realPlayerId が
 * 別物になるため、通算分析では別人として集計される。このメモで同一人物として束ねる。
 *
 * canonicalId は束ねた先の代表 ID（= resolvedId のいずれか）。
 * memberIds は canonicalId に畳み込む resolvedId 群。
 */
export interface PlayerMergeEntry {
  canonicalId: string;
  canonicalName: string;
  memberIds: string[];
  updatedAt: number;
}

/** memberId → canonicalId の実行時ルックアップ表 */
export type PlayerMergeMap = ReadonlyMap<string, string>;

export const EMPTY_MERGE_MAP: PlayerMergeMap = new Map<string, string>();

/**
 * エントリ配列を実行時ルックアップ表に変換する。
 *
 * 不変条件: canonicalId は他エントリの memberIds に現れてはならない。
 * これを許すと畳み込みが多段になり、適用順で結果が変わる（非冪等になる）ため、
 * 該当する member は取り込まずに捨てる。これにより
 * `mergeMap.get(mergeMap.get(x)) === undefined` が常に成り立ち、1段の get で完結する。
 */
export function toMergeMap(entries: PlayerMergeEntry[]): PlayerMergeMap {
  const canonicals = new Set(entries.map((e) => e.canonicalId));
  const m = new Map<string, string>();
  for (const e of entries) {
    for (const id of e.memberIds) {
      if (id === e.canonicalId) continue;
      // 他エントリ（または自身）の canonical を member にはできない
      if (canonicals.has(id)) continue;
      // 先勝ち: 同じ id が複数エントリに現れても最初の canonical を採用する
      if (m.has(id)) continue;
      m.set(id, e.canonicalId);
    }
  }
  return m;
}

/** エントリが保持する全 ID（canonical + members） */
function entryIds(e: PlayerMergeEntry): string[] {
  return [e.canonicalId, ...e.memberIds];
}

/**
 * 新しい統合を既存エントリ群に取り込む（連結成分の吸収）。
 *
 * 新グループと1つでも ID を共有する既存エントリは丸ごと吸収し、1エントリに畳む。
 * 吸収で増えた ID がさらに別エントリと接触することがあるため、増えなくなるまで繰り返す。
 *
 * これにより「canonicalId は他エントリの memberIds に現れない」という
 * toMergeMap の不変条件が構成的に保たれる:
 * 残留エントリは新グループの ID を一切含まず、新エントリの ID は全て新グループ内にあるため。
 */
export function upsertMergeEntry(
  entries: PlayerMergeEntry[],
  input: { canonicalId: string; canonicalName: string; memberIds: string[] },
): PlayerMergeEntry[] {
  const group = new Set<string>([input.canonicalId, ...input.memberIds]);

  let remaining = entries;
  for (;;) {
    const touched = remaining.filter((e) => entryIds(e).some((id) => group.has(id)));
    if (touched.length === 0) break;
    for (const e of touched) for (const id of entryIds(e)) group.add(id);
    remaining = remaining.filter((e) => !touched.includes(e));
  }

  group.delete(input.canonicalId);
  return [
    ...remaining,
    {
      canonicalId:   input.canonicalId,
      canonicalName: input.canonicalName,
      memberIds:     [...group],
      updatedAt:     Date.now(),
    },
  ];
}

/** 統合を解除する（エントリ丸ごと削除） */
export function removeMergeEntry(
  entries: PlayerMergeEntry[],
  canonicalId: string,
): PlayerMergeEntry[] {
  return entries.filter((e) => e.canonicalId !== canonicalId);
}

const mergeDocRef = (userId: string) => doc(db, COLLECTIONS.PLAYER_MERGES, userId);

export async function getPlayerMergeEntries(userId: string): Promise<PlayerMergeEntry[]> {
  const snap = await getDoc(mergeDocRef(userId));
  if (!snap.exists()) return [];
  const entries = snap.data()?.entries;
  return Array.isArray(entries) ? (entries as PlayerMergeEntry[]) : [];
}

/**
 * 名寄せメモを読み込んでルックアップ表にする。
 * 分析画面のプリロード用。失敗しても分析自体は続行させたいので空表にフォールバックする。
 */
export async function loadPlayerMergeMap(userId: string | null | undefined): Promise<PlayerMergeMap> {
  if (!userId) return EMPTY_MERGE_MAP;
  try {
    return toMergeMap(await getPlayerMergeEntries(userId));
  } catch {
    return EMPTY_MERGE_MAP;
  }
}

export async function savePlayerMergeEntries(
  userId: string,
  entries: PlayerMergeEntry[],
): Promise<void> {
  await setDoc(mergeDocRef(userId), { userId, entries });
}
