import { produce } from 'immer';
import type {
  GameState,
  PitcherReassignmentAffectedCounts,
  PitcherReassignmentLog,
  Player,
  Team,
} from '../types/game';
import { findPitcherById, isUnassignedPitcherId } from './unassignedPitcherService';

export type TeamSide = 'away' | 'home';

export interface PitcherReassignmentInput {
  logId: string;
  side: TeamSide;
  fromPitcherId: string;
  toPitcherId: string;
  reason: PitcherReassignmentLog['reason'];
  createdAt?: number;
}

export interface PitcherAttributionCandidate {
  side: TeamSide;
  pitcherId: string;
  pitcherName: string;
  isCurrent: boolean;
  isUnassigned: boolean;
  referenceCount: number;
}

export interface PitcherReassignmentResult {
  game: GameState;
  log: PitcherReassignmentLog;
  alreadyApplied: boolean;
}

export type PitcherReassignmentLogSetRelation =
  | { kind: 'in_sync' }
  | { kind: 'cloud_ahead'; missingLocally: string[] }
  | { kind: 'local_ahead'; missingRemotely: string[] }
  | { kind: 'diverged'; missingLocally: string[]; missingRemotely: string[] };

export function comparePitcherReassignmentLogIdSets(
  localLogIds: Iterable<string>,
  cloudLogIds: Iterable<string>,
): PitcherReassignmentLogSetRelation {
  const localIds = new Set(localLogIds);
  const cloudIds = new Set(cloudLogIds);
  const missingLocally = [...cloudIds].filter((id) => !localIds.has(id));
  const missingRemotely = [...localIds].filter((id) => !cloudIds.has(id));
  if (missingLocally.length === 0 && missingRemotely.length === 0) return { kind: 'in_sync' };
  if (missingLocally.length > 0 && missingRemotely.length === 0) {
    return { kind: 'cloud_ahead', missingLocally };
  }
  if (missingLocally.length === 0) return { kind: 'local_ahead', missingRemotely };
  return { kind: 'diverged', missingLocally, missingRemotely };
}

function teamForSide(game: GameState, side: TeamSide): Team {
  return side === 'away' ? game.awayTeam : game.homeTeam;
}

function sideForPitchingHalf(half: GameState['inning']['half']): TeamSide {
  return half === 'top' ? 'home' : 'away';
}

function rosterPlayers(team: Team): Player[] {
  const players = [...team.roster.starters, ...team.roster.bench];
  if (team.roster.pitcher) players.push(team.roster.pitcher);
  return players;
}

function findRosterPlayer(game: GameState, side: TeamSide, playerId: string): Player | undefined {
  return rosterPlayers(teamForSide(game, side)).find((player) => player.id === playerId);
}

function resolvePitcherName(game: GameState, side: TeamSide, playerId: string): string {
  const rosterName = findPitcherById(teamForSide(game, side), playerId)?.name?.trim();
  if (rosterName) return rosterName;

  const signName = [...(game.signMissEvents ?? [])]
    .filter(
      (event) =>
        event.side === side &&
        event.context === 'pitching' &&
        event.playerId === playerId &&
        event.playerName.trim().length > 0,
    )
    .sort((a, b) => b.timestamp - a.timestamp)[0]?.playerName.trim();
  return signName ?? '';
}

function emptyCounts(): PitcherReassignmentAffectedCounts {
  return {
    currentPitcher: 0,
    pitchLogs: 0,
    atBatLogs: 0,
    atBatPitches: 0,
    currentAtBat: 0,
    currentAtBatPitches: 0,
    pickoffEvents: 0,
    signMissEvents: 0,
  };
}

function totalAffected(counts: PitcherReassignmentAffectedCounts): number {
  return Object.values(counts).reduce((sum, count) => sum + count, 0);
}

function hasPitcherReference(game: GameState, side: TeamSide, pitcherId: string): boolean {
  if (game.currentPitcherId[side] === pitcherId) return true;
  if (
    game.pitchLogs.some(
      (pitch) => sideForPitchingHalf(pitch.inning.half) === side && pitch.pitcherId === pitcherId,
    )
  ) return true;
  if (
    game.atBatLogs.some(
      (atBat) =>
        sideForPitchingHalf(atBat.inning.half) === side &&
        (atBat.pitcherId === pitcherId || atBat.pitches.some((pitch) => pitch.pitcherId === pitcherId)),
    )
  ) return true;
  if (
    game.currentAtBat &&
    sideForPitchingHalf(game.currentAtBat.inning.half) === side &&
    (game.currentAtBat.pitcherId === pitcherId ||
      game.currentAtBat.pitches.some((pitch) => pitch.pitcherId === pitcherId))
  ) return true;
  if (
    game.pickoffEvents.some(
      (event) => sideForPitchingHalf(event.inning.half) === side && event.pitcherId === pitcherId,
    )
  ) return true;
  return (game.signMissEvents ?? []).some(
    (event) =>
      event.side === side && event.context === 'pitching' && event.playerId === pitcherId,
  );
}

/**
 * 投手帰属を持つIDをチーム別に抽出する。打順交代用のSubstitutionLogは対象外。
 */
export function listPitcherAttributionCandidates(game: GameState): PitcherAttributionCandidate[] {
  const keys = new Set<string>();
  const add = (side: TeamSide, pitcherId: string | undefined) => {
    if (pitcherId) keys.add(`${side}\u0000${pitcherId}`);
  };

  add('away', game.currentPitcherId.away);
  add('home', game.currentPitcherId.home);
  for (const pitch of game.pitchLogs) add(sideForPitchingHalf(pitch.inning.half), pitch.pitcherId);
  for (const atBat of game.atBatLogs) {
    const side = sideForPitchingHalf(atBat.inning.half);
    add(side, atBat.pitcherId);
    for (const pitch of atBat.pitches) add(side, pitch.pitcherId);
  }
  if (game.currentAtBat) {
    const side = sideForPitchingHalf(game.currentAtBat.inning.half);
    add(side, game.currentAtBat.pitcherId);
    for (const pitch of game.currentAtBat.pitches) add(side, pitch.pitcherId);
  }
  for (const event of game.pickoffEvents) {
    add(sideForPitchingHalf(event.inning.half), event.pitcherId);
  }
  for (const event of game.signMissEvents ?? []) {
    if (event.context === 'pitching') add(event.side, event.playerId);
  }

  return [...keys].map((key) => {
    const [side, pitcherId] = key.split('\u0000') as [TeamSide, string];
    const counts = countPitcherReferences(game, side, pitcherId);
    return {
      side,
      pitcherId,
      pitcherName: resolvePitcherName(game, side, pitcherId),
      isCurrent: game.currentPitcherId[side] === pitcherId,
      isUnassigned: isUnassignedPitcherId(game, side, pitcherId),
      referenceCount: totalAffected(counts),
    };
  });
}

/** 移管先候補。現投手の修正時だけDH/非DHのロースター制約を適用する。 */
export function listPitcherReassignmentDestinations(
  game: GameState,
  source: Pick<PitcherAttributionCandidate, 'side' | 'pitcherId' | 'isCurrent'>,
): Player[] {
  const team = teamForSide(game, source.side);
  const isUnassignedSource = isUnassignedPitcherId(game, source.side, source.pitcherId);
  const candidates = source.isCurrent
    ? game.isDH?.[source.side]
      ? isUnassignedSource && team.roster.pitcher
        ? [team.roster.pitcher, ...team.roster.bench]
        : team.roster.bench
      : team.roster.starters
    : rosterPlayers(team);
  const seen = new Set<string>();
  return candidates.filter((player) => {
    if (
      player.id === source.pitcherId
      || player.isUnassignedPitcher
      || !player.name.trim()
      || seen.has(player.id)
    ) return false;
    seen.add(player.id);
    return true;
  });
}

export function countPitcherReferences(
  game: GameState,
  side: TeamSide,
  pitcherId: string,
): PitcherReassignmentAffectedCounts {
  const counts = emptyCounts();
  if (game.currentPitcherId[side] === pitcherId) counts.currentPitcher += 1;
  for (const pitch of game.pitchLogs) {
    if (sideForPitchingHalf(pitch.inning.half) === side && pitch.pitcherId === pitcherId) {
      counts.pitchLogs += 1;
    }
  }
  for (const atBat of game.atBatLogs) {
    if (sideForPitchingHalf(atBat.inning.half) !== side) continue;
    if (atBat.pitcherId === pitcherId) counts.atBatLogs += 1;
    counts.atBatPitches += atBat.pitches.filter((pitch) => pitch.pitcherId === pitcherId).length;
  }
  if (game.currentAtBat && sideForPitchingHalf(game.currentAtBat.inning.half) === side) {
    if (game.currentAtBat.pitcherId === pitcherId) counts.currentAtBat += 1;
    counts.currentAtBatPitches += game.currentAtBat.pitches.filter(
      (pitch) => pitch.pitcherId === pitcherId,
    ).length;
  }
  for (const event of game.pickoffEvents) {
    if (sideForPitchingHalf(event.inning.half) === side && event.pitcherId === pitcherId) {
      counts.pickoffEvents += 1;
    }
  }
  for (const event of game.signMissEvents ?? []) {
    if (event.side === side && event.context === 'pitching' && event.playerId === pitcherId) {
      counts.signMissEvents += 1;
    }
  }
  return counts;
}

/**
 * 投手帰属だけを一括移管する純粋関数。
 * SubstitutionLogは打順連鎖なので意図的に一切変更しない。
 */
export function reassignPitcherRecords(
  game: GameState,
  input: PitcherReassignmentInput,
): PitcherReassignmentResult {
  const existing = (game.pitcherReassignmentLogs ?? []).find((log) => log.id === input.logId);
  if (existing) return { game, log: existing, alreadyApplied: true };

  if (!input.logId.trim()) throw new Error('移管操作IDがありません。');
  if (!input.fromPitcherId || !input.toPitcherId) throw new Error('移管元と移管先を選択してください。');
  if (input.fromPitcherId === input.toPitcherId) throw new Error('移管元と移管先が同じです。');

  const toPlayer = findRosterPlayer(game, input.side, input.toPitcherId);
  if (!toPlayer) throw new Error('移管先の選手が対象チームの名簿にいません。');
  if (!hasPitcherReference(game, input.side, input.fromPitcherId)) {
    throw new Error('移管元の投手記録が見つかりません。');
  }

  const isCurrent = game.currentPitcherId[input.side] === input.fromPitcherId;
  const isUnassignedSource = isUnassignedPitcherId(game, input.side, input.fromPitcherId);
  const team = teamForSide(game, input.side);
  if (isCurrent && game.isDH?.[input.side]) {
    const isRegisteredDHPitcher =
      isUnassignedSource && team.roster.pitcher?.id === input.toPitcherId;
    if (
      !isRegisteredDHPitcher
      && !team.roster.bench.some((player) => player.id === input.toPitcherId)
    ) {
      throw new Error('DH制の現投手は控え選手から選択してください。');
    }
  } else if (isCurrent && !team.roster.starters.some((player) => player.id === input.toPitcherId)) {
    throw new Error('非DHの現投手はスタメンから選択してください。');
  }

  const affectedCounts = countPitcherReferences(game, input.side, input.fromPitcherId);
  const fromPitcherName = resolvePitcherName(game, input.side, input.fromPitcherId);
  const createdAt = input.createdAt ?? Date.now();
  const log: PitcherReassignmentLog = {
    id: input.logId,
    side: input.side,
    fromPitcherId: input.fromPitcherId,
    fromPitcherName,
    toPitcherId: input.toPitcherId,
    toPitcherName: toPlayer.name.trim(),
    reason: input.reason,
    affectedCounts,
    createdAt,
  };

  const next = produce(game, (draft) => {
    if (draft.currentPitcherId[input.side] === input.fromPitcherId) {
      draft.currentPitcherId[input.side] = input.toPitcherId;
    }
    for (const pitch of draft.pitchLogs) {
      if (sideForPitchingHalf(pitch.inning.half) === input.side && pitch.pitcherId === input.fromPitcherId) {
        pitch.pitcherId = input.toPitcherId;
      }
    }
    for (const atBat of draft.atBatLogs) {
      if (sideForPitchingHalf(atBat.inning.half) !== input.side) continue;
      if (atBat.pitcherId === input.fromPitcherId) atBat.pitcherId = input.toPitcherId;
      for (const pitch of atBat.pitches) {
        if (pitch.pitcherId === input.fromPitcherId) pitch.pitcherId = input.toPitcherId;
      }
    }
    if (draft.currentAtBat && sideForPitchingHalf(draft.currentAtBat.inning.half) === input.side) {
      if (draft.currentAtBat.pitcherId === input.fromPitcherId) {
        draft.currentAtBat.pitcherId = input.toPitcherId;
      }
      for (const pitch of draft.currentAtBat.pitches) {
        if (pitch.pitcherId === input.fromPitcherId) pitch.pitcherId = input.toPitcherId;
      }
    }
    for (const event of draft.pickoffEvents) {
      if (sideForPitchingHalf(event.inning.half) === input.side && event.pitcherId === input.fromPitcherId) {
        event.pitcherId = input.toPitcherId;
      }
    }
    for (const event of draft.signMissEvents ?? []) {
      if (
        event.side === input.side &&
        event.context === 'pitching' &&
        event.playerId === input.fromPitcherId
      ) {
        event.playerId = input.toPitcherId;
        event.playerName = toPlayer.name.trim();
      }
    }

    if (isCurrent) {
      const draftTeam = input.side === 'away' ? draft.awayTeam : draft.homeTeam;
      if (game.isDH?.[input.side]) {
        const registeredPitcher =
          draftTeam.roster.pitcher?.id === input.toPitcherId
            ? draftTeam.roster.pitcher
            : undefined;
        const target = registeredPitcher
          ?? draftTeam.roster.bench.find((player) => player.id === input.toPitcherId);
        if (!target) throw new Error('DH制の移管先が控えから見つかりません。');
        if (!registeredPitcher) {
          draftTeam.roster.bench = draftTeam.roster.bench.filter(
            (player) => player.id !== input.toPitcherId,
          );
        }
        target.position = 'P';
        draftTeam.roster.pitcher = target;
      } else {
        const source = draftTeam.roster.starters.find((player) => player.id === input.fromPitcherId);
        const target = draftTeam.roster.starters.find((player) => player.id === input.toPitcherId);
        if (!target) throw new Error('非DHの移管先がスタメンから見つかりません。');
        if (source?.position === 'P') source.position = '';
        target.position = 'P';
        const pitchers = draftTeam.roster.starters.filter((player) => player.position === 'P');
        if (pitchers.length !== 1 || pitchers[0].id !== input.toPitcherId) {
          throw new Error('スタメンの投手位置を一意にできません。');
        }
      }
    }

    const draftTeam = input.side === 'away' ? draft.awayTeam : draft.homeTeam;
    if (draftTeam.roster.unassignedPitchers) {
      const remaining = draftTeam.roster.unassignedPitchers.filter(
        (player) => player.id !== input.fromPitcherId,
      );
      if (remaining.length > 0) {
        draftTeam.roster.unassignedPitchers = remaining;
      } else {
        // Firestoreへundefinedキーを渡さず、解決済みならフィールド自体を除去する。
        delete draftTeam.roster.unassignedPitchers;
      }
    }

    const hasPlaceholderStarter = [draft.awayTeam, draft.homeTeam].some((candidateTeam) =>
      candidateTeam.roster.starters.some((player) => player.isPlaceholder),
    );
    const hasOtherUnresolvedPitcher = (['away', 'home'] as const).some((candidateSide) => {
      const candidateTeam = candidateSide === 'away' ? draft.awayTeam : draft.homeTeam;
      return (candidateTeam.roster.unassignedPitchers ?? []).some((player) =>
        hasPitcherReference(draft as unknown as GameState, candidateSide, player.id),
      );
    });
    draft.hasUnmappedPlayers = hasPlaceholderStarter || hasOtherUnresolvedPitcher;

    draft.pitcherReassignmentLogs = [...(draft.pitcherReassignmentLogs ?? []), log];
    draft.preAdvancementSnapshot = undefined;
    draft.undoStack = [];
    draft.updatedAt = Math.max(createdAt, game.updatedAt + 1);
  });

  if (hasPitcherReference(next, input.side, input.fromPitcherId)) {
    throw new Error('移管後も旧投手IDが投手記録に残っています。');
  }
  return { game: next, log, alreadyApplied: false };
}
