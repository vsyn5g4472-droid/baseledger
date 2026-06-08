import { POSITIONS } from '../types/game';
import type { Position } from '../types/game';

/** DH 以外の守備位置の重複を検出（playerId の Set を返す） */
export function getDuplicatePositionPlayerIds(
  entries: { playerId: string; position: Position; isPitcher?: boolean }[],
): Set<string> {
  const dupes = new Set<string>();
  const byPos = new Map<Position, string[]>();

  for (const entry of entries) {
    if (entry.position === 'DH') continue;
    const pos = entry.isPitcher ? 'P' : entry.position;
    const ids = byPos.get(pos) ?? [];
    ids.push(entry.playerId);
    byPos.set(pos, ids);
  }

  byPos.forEach((ids) => {
    if (ids.length > 1) ids.forEach((id) => dupes.add(id));
  });

  return dupes;
}

/** 同一チーム内で選択可能な守備位置（DH は重複可・DH制時のみ選択可） */
export function getAvailablePositions(
  entries: { playerId: string; position: Position; isPitcher?: boolean }[],
  currentPlayerId: string,
  teamHasDH: boolean,
): Position[] {
  const taken = new Set<Position>();

  for (const entry of entries) {
    if (entry.playerId === currentPlayerId) continue;
    if (entry.position === 'DH') continue;
    taken.add(entry.isPitcher ? 'P' : entry.position);
  }

  const current = entries.find((e) => e.playerId === currentPlayerId);
  const currentPos = current?.isPitcher ? 'P' : current?.position;

  return POSITIONS.filter((pos) => {
    if (pos === 'DH') return teamHasDH;
    if (pos === currentPos) return true;
    return !taken.has(pos);
  });
}
