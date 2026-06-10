import type { GameState, SignMissEvent, SignMissContext } from '../types/game';

export interface SignMissAggregateRow {
  playerId: string;
  playerName: string;
  count: number;
  /** 試合あたりのサインミス数（出場試合数で割ったもの） */
  perGame: number;
  /** 直近の文脈別内訳 */
  byContext: Record<SignMissContext, number>;
}

export interface SignMissAggregate {
  totalEvents: number;
  totalGames: number;
  byPlayer: SignMissAggregateRow[];
}

function emptyByContext(): Record<SignMissContext, number> {
  return { batting: 0, baserunning: 0, fielding: 0, pitching: 0 };
}

/**
 * 複数試合をまたいだサインミスの集計。
 * - filterPlayerId 指定時は、その選手のみで集計
 * - perGame は「サインミスが発生したかどうかに関わらず、当該選手が出場した試合数」で除算する
 */
export function aggregateSignMisses(
  games: GameState[],
  filterPlayerId?: string,
): SignMissAggregate {
  const byPlayer = new Map<string, SignMissAggregateRow>();
  // 選手ごとの出場試合数（ロースターに名前があった試合を1試合とカウント）
  const playedGames = new Map<string, Set<string>>();

  for (const g of games) {
    const allOnRoster = [
      ...g.awayTeam.roster.starters,
      ...g.awayTeam.roster.bench,
      ...(g.awayTeam.roster.pitcher ? [g.awayTeam.roster.pitcher] : []),
      ...g.homeTeam.roster.starters,
      ...g.homeTeam.roster.bench,
      ...(g.homeTeam.roster.pitcher ? [g.homeTeam.roster.pitcher] : []),
    ];
    for (const p of allOnRoster) {
      if (filterPlayerId && p.id !== filterPlayerId) continue;
      const set = playedGames.get(p.id) ?? new Set<string>();
      set.add(g.id);
      playedGames.set(p.id, set);
    }

    for (const evt of g.signMissEvents ?? []) {
      if (filterPlayerId && evt.playerId !== filterPlayerId) continue;
      const row = byPlayer.get(evt.playerId) ?? {
        playerId: evt.playerId,
        playerName: evt.playerName,
        count: 0,
        perGame: 0,
        byContext: emptyByContext(),
      };
      row.count += 1;
      row.byContext[evt.context] = (row.byContext[evt.context] ?? 0) + 1;
      byPlayer.set(evt.playerId, row);
    }
  }

  // perGame を計算
  for (const row of byPlayer.values()) {
    const games = playedGames.get(row.playerId)?.size ?? 0;
    row.perGame = games > 0 ? row.count / games : 0;
  }

  const totalEvents = Array.from(byPlayer.values()).reduce((s, r) => s + r.count, 0);
  return {
    totalEvents,
    totalGames: games.length,
    byPlayer: Array.from(byPlayer.values()).sort((a, b) => b.count - a.count),
  };
}

/** 単一試合内でのサインミス件数 */
export function countSignMissesInGame(game: GameState, filterPlayerId?: string): number {
  const list: SignMissEvent[] = game.signMissEvents ?? [];
  if (!filterPlayerId) return list.length;
  return list.filter((e) => e.playerId === filterPlayerId).length;
}
