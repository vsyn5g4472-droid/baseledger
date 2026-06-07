import { Timestamp } from 'firebase/firestore';
import type { AtBatLog, GameState, Player, PitchLog } from '../types/game';
import type { SpotAtBat, SpotAtBatImportMode, SpotAtBatPitch } from '../models/types';

function allRosterPlayers(game: GameState): Player[] {
  const collect = (team: GameState['awayTeam']) => [
    ...team.roster.starters,
    ...team.roster.bench,
    ...(team.roster.pitcher ? [team.roster.pitcher] : []),
  ];
  return [...collect(game.awayTeam), ...collect(game.homeTeam)];
}

function resolvePlayerName(game: GameState, playerId: string): string {
  const player = allRosterPlayers(game).find((p) => p.id === playerId);
  return player?.name ?? playerId;
}

function pitchLogToSpotPitch(pitch: PitchLog, index: number): SpotAtBatPitch {
  return {
    pitchNumber: pitch.pitchNumber ?? index + 1,
    pitchType: String(pitch.pitchType),
    zone: pitch.zone,
    pitchX: pitch.pitchX,
    pitchY: pitch.pitchY,
    result: pitch.result,
    velocity: pitch.velocity,
    countBefore: pitch.countBefore,
    countAfter: pitch.countAfter,
  };
}

function runnersToFlags(runners: AtBatLog['runnersBeforePlay']) {
  return {
    first: runners.first !== null,
    second: runners.second !== null,
    third: runners.third !== null,
  };
}

function opponentName(game: GameState, batterId: string): string {
  const inAway = game.awayTeam.roster.starters.some((p) => p.id === batterId)
    || game.awayTeam.roster.bench.some((p) => p.id === batterId)
    || game.awayTeam.roster.pitcher?.id === batterId;
  return inAway ? game.homeTeam.name : game.awayTeam.name;
}

/**
 * 試合の打席ログを SpotAtBat 作成用データに変換する。
 */
export function atBatLogToSpotAtBatInput(
  atBat: AtBatLog,
  game: GameState,
  importMode: SpotAtBatImportMode = 'merged',
): Omit<SpotAtBat, 'id' | 'userId' | 'createdAt' | 'updatedAt'> {
  if (!atBat.result) {
    throw new Error('完了していない打席はインポートできません。');
  }

  const batterName = resolvePlayerName(game, atBat.batterId);
  const pitcherName = resolvePlayerName(game, atBat.pitcherId);
  const firstPitch = atBat.pitches[0];
  const inningLabel = `${atBat.inning.number}回${atBat.inning.half === 'top' ? '表' : '裏'}`;

  return {
    playerName: batterName,
    pitcherName,
    opponent: opponentName(game, atBat.batterId),
    gameDate: Timestamp.fromMillis(game.createdAt),
    outs: firstPitch?.countBefore.outs,
    runnersOnBase: runnersToFlags(atBat.runnersBeforePlay),
    pitches: atBat.pitches.map(pitchLogToSpotPitch),
    result: atBat.result,
    battedBall: atBat.battedBall
      ? {
          fieldX: atBat.battedBall.fieldX,
          fieldY: atBat.battedBall.fieldY,
          estimatedDistance: atBat.battedBall.estimatedDistance,
          type: atBat.battedBall.type,
        }
      : undefined,
    memo: atBat.note ?? `試合インポート (${inningLabel})`,
    sourceGameId: game.id,
    sourceAtBatId: atBat.id,
    importMode,
  };
}
