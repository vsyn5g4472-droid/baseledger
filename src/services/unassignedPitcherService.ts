import type { GameState, Player, PlayerInput, Team } from '../types/game';

export type TeamSide = 'away' | 'home';

export interface UnresolvedPitcherStint {
  side: TeamSide;
  pitcher: Player;
}

export function teamForSide(game: GameState, side: TeamSide): Team {
  return side === 'away' ? game.awayTeam : game.homeTeam;
}

export function findPitcherById(team: Team, pitcherId: string): Player | undefined {
  return team.roster.starters.find((player) => player.id === pitcherId)
    ?? (team.roster.pitcher?.id === pitcherId ? team.roster.pitcher : undefined)
    ?? team.roster.bench.find((player) => player.id === pitcherId)
    ?? (team.roster.unassignedPitchers ?? []).find((player) => player.id === pitcherId);
}

export function isUnassignedPitcherId(
  game: GameState,
  side: TeamSide,
  pitcherId: string,
): boolean {
  return (teamForSide(game, side).roster.unassignedPitchers ?? []).some(
    (player) => player.id === pitcherId && player.isUnassignedPitcher === true,
  );
}

function sideForPitchingHalf(half: GameState['inning']['half']): TeamSide {
  return half === 'top' ? 'home' : 'away';
}

/** 打順交代ログを含めず、投手成績の帰属を持つフィールドだけを検査する。 */
export function hasPitcherAttributionReference(
  game: GameState,
  side: TeamSide,
  pitcherId: string,
): boolean {
  if (game.currentPitcherId[side] === pitcherId) return true;
  if (game.pitchLogs.some(
    (pitch) => sideForPitchingHalf(pitch.inning.half) === side && pitch.pitcherId === pitcherId,
  )) return true;
  if (game.atBatLogs.some((atBat) => {
    if (sideForPitchingHalf(atBat.inning.half) !== side) return false;
    return atBat.pitcherId === pitcherId || atBat.pitches.some((pitch) => pitch.pitcherId === pitcherId);
  })) return true;
  if (game.currentAtBat && sideForPitchingHalf(game.currentAtBat.inning.half) === side) {
    if (
      game.currentAtBat.pitcherId === pitcherId
      || game.currentAtBat.pitches.some((pitch) => pitch.pitcherId === pitcherId)
    ) return true;
  }
  if (game.pickoffEvents.some(
    (event) => sideForPitchingHalf(event.inning.half) === side && event.pitcherId === pitcherId,
  )) return true;
  return (game.signMissEvents ?? []).some(
    (event) =>
      event.side === side
      && event.context === 'pitching'
      && event.playerId === pitcherId,
  );
}

export function listUnresolvedPitcherStints(game: GameState): UnresolvedPitcherStint[] {
  const unresolved: UnresolvedPitcherStint[] = [];
  for (const side of ['away', 'home'] as const) {
    const team = teamForSide(game, side);
    for (const pitcher of team.roster.unassignedPitchers ?? []) {
      if (
        pitcher.isUnassignedPitcher === true
        && hasPitcherAttributionReference(game, side, pitcher.id)
      ) {
        unresolved.push({ side, pitcher });
      }
    }
  }
  return unresolved;
}

export function hasUnresolvedPitcherStints(game: GameState): boolean {
  return listUnresolvedPitcherStints(game).length > 0;
}

export function nextUnassignedPitcherNumber(game: GameState, side: TeamSide): number {
  const team = teamForSide(game, side);
  const names = [
    ...(team.roster.unassignedPitchers ?? []).map((player) => player.name),
    ...(game.pitcherReassignmentLogs ?? [])
      .filter((log) => log.side === side && log.reason === 'unassigned_pitcher_resolved')
      .map((log) => log.fromPitcherName),
  ];
  const used = names
    .map((name) => /^投手未登録(\d+)$/.exec(name)?.[1])
    .filter((value): value is string => value != null)
    .map(Number);
  return (used.length > 0 ? Math.max(...used) : 0) + 1;
}

export function makeUnassignedPitcherInput(sequence: number): PlayerInput {
  return {
    name: `投手未登録${sequence}`,
    number: '',
    position: '',
    bats: 'R',
    throws: 'R',
    isPlaceholder: true,
    isUnassignedPitcher: true,
  };
}
