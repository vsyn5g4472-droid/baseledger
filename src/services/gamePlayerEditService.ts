/**
 * 終了試合の選手名変更と、紐づく名簿（TeamPlayer）の同期。
 */
import { db as localDb } from '../db';
import type { GameState, Player, Team as GameTeam } from '../types/game';
import { gameService } from './gameService';
import { getTeamPlayers, updateTeamPlayer } from './teamPlayerService';
import { getUserTeams } from './teamService';
import { auth } from './firebase';

function rosterPlayers(team: GameTeam): Player[] {
  const list: Player[] = [...team.roster.starters, ...team.roster.bench];
  if (team.roster.pitcher) list.push(team.roster.pitcher);
  return list;
}

function allGamePlayers(game: GameState): Player[] {
  return [...rosterPlayers(game.awayTeam), ...rosterPlayers(game.homeTeam)];
}

function applyNameToPlayer(player: Player, newName: string): void {
  player.name = newName;
  player.isPlaceholder = false;
}

/** roster / 塁上スナップショット / 各種ログの埋め込み名を同期 */
function syncNameSnapshots(game: GameState, playerId: string, newName: string): void {
  for (const team of [game.awayTeam, game.homeTeam]) {
    for (const p of rosterPlayers(team)) {
      if (p.id === playerId) applyNameToPlayer(p, newName);
    }
  }

  for (const base of ['first', 'second', 'third'] as const) {
    const runner = game.runners?.[base];
    if (runner?.id === playerId) {
      game.runners[base] = { ...runner, name: newName, isPlaceholder: false };
    }
  }

  for (const log of game.atBatLogs ?? []) {
    for (const key of ['runnersBeforePlay', 'runnersAfterPlay'] as const) {
      const runners = log[key];
      if (!runners) continue;
      for (const base of ['first', 'second', 'third'] as const) {
        const r = runners[base];
        if (r?.id === playerId) {
          runners[base] = { ...r, name: newName, isPlaceholder: false };
        }
      }
    }
    for (const adv of log.runnerAdvancements ?? []) {
      if (adv.runnerId === playerId) adv.playerName = newName;
    }
  }

  for (const log of game.stolenBaseLogs ?? []) {
    if (log.runnerId === playerId) log.runnerName = newName;
  }

  for (const log of game.substitutionLogs ?? []) {
    if (log.playerOutId === playerId) log.playerOutName = newName;
    if (log.playerInId === playerId) log.playerInName = newName;
  }

  for (const evt of game.signMissEvents ?? []) {
    if (evt.playerId === playerId) evt.playerName = newName;
  }
}

async function syncLinkedTeamPlayerName(
  realPlayerId: string,
  newName: string,
  userId: string,
): Promise<void> {
  const teams = await getUserTeams(userId);
  for (const team of teams) {
    const players = await getTeamPlayers(team.id);
    if (players.some((p) => p.id === realPlayerId)) {
      await updateTeamPlayer(team.id, realPlayerId, { name: newName });
      return;
    }
  }
}

/**
 * 試合内の選手名を変更し、ローカル保存する。
 * realPlayerId があれば所属名簿の TeamPlayer も更新する。
 */
export async function renameGamePlayer(
  gameId: string,
  playerId: string,
  newNameRaw: string,
): Promise<GameState> {
  const newName = newNameRaw.trim();
  if (!newName) {
    throw new Error('選手名を入力してください。');
  }

  const game = await localDb.games.get(gameId);
  if (!game) {
    throw new Error('試合データが見つかりません。');
  }

  const target = allGamePlayers(game).find((p) => p.id === playerId);
  if (!target) {
    throw new Error('選手が見つかりません。');
  }

  const realPlayerId = target.realPlayerId;
  syncNameSnapshots(game, playerId, newName);
  game.updatedAt = Date.now();
  await localDb.games.put(game);

  const uid = auth.currentUser?.uid;
  if (uid) {
    try {
      const owned = await gameService.getGame(gameId);
      if (owned?.ownerId === uid) {
        await gameService.saveGame(game, uid);
      }
    } catch {
      // クラウド同期失敗でもローカル変更は保持
    }

    if (realPlayerId) {
      try {
        await syncLinkedTeamPlayerName(realPlayerId, newName, uid);
      } catch {
        // 名簿同期失敗は試合側の変更をロールバックしない
      }
    }
  }

  return game;
}

export function listEditablePlayers(game: GameState): {
  side: 'away' | 'home';
  teamName: string;
  player: Player;
}[] {
  const rows: { side: 'away' | 'home'; teamName: string; player: Player }[] = [];
  const seen = new Set<string>();
  for (const side of ['away', 'home'] as const) {
    const team = side === 'away' ? game.awayTeam : game.homeTeam;
    for (const player of rosterPlayers(team)) {
      if (seen.has(player.id)) continue;
      seen.add(player.id);
      rows.push({ side, teamName: team.name, player });
    }
  }
  return rows;
}

/** ローカル試合から、記録されたチーム名一覧（新しい順） */
export async function listRecordedTeamNames(): Promise<string[]> {
  const games = await localDb.games.getAll();
  const seen = new Set<string>();
  const names: string[] = [];
  for (const g of games) {
    for (const name of [g.awayTeam?.name, g.homeTeam?.name]) {
      const n = name?.trim();
      if (!n || seen.has(n)) continue;
      seen.add(n);
      names.push(n);
    }
  }
  return names;
}

export interface HistoryPlayerCandidate {
  key: string;
  name: string;
  number: number | null;
  position: string;
  bats: 'L' | 'R' | 'S';
  throws: 'L' | 'R';
}

/** 指定チーム名で出場した選手を、試合横断でユニーク化して返す */
export async function listPlayersForRecordedTeamName(
  teamName: string,
): Promise<HistoryPlayerCandidate[]> {
  const games = await localDb.games.getAll();
  const byKey = new Map<string, HistoryPlayerCandidate>();

  for (const g of games) {
    const sides: GameTeam[] = [];
    if (g.awayTeam?.name === teamName) sides.push(g.awayTeam);
    if (g.homeTeam?.name === teamName) sides.push(g.homeTeam);

    for (const team of sides) {
      for (const p of rosterPlayers(team)) {
        if (!p.name?.trim() || p.isPlaceholder) continue;
        const key = `${p.name.trim()}|${p.number ?? ''}`;
        if (byKey.has(key)) continue;
        byKey.set(key, {
          key,
          name: p.name.trim(),
          number: p.number,
          position: p.position ?? '',
          bats: p.bats ?? 'R',
          throws: p.throws ?? 'R',
        });
      }
    }
  }

  return [...byKey.values()].sort((a, b) => a.name.localeCompare(b.name, 'ja'));
}
