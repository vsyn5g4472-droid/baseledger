import { auth } from './firebase';
import { db as localDb } from '../db';
import { gameService } from './gameService';
import { createPost } from './postService';
import { AppError } from '../models/types';
import type { CreatePostInput } from '../models/types';
import type { GameState } from '../types/game';

// ── Types ──────────────────────────────────────────────────────────────────────

export interface GameRecordStatsData {
  sourceType: 'game_record';
  gameId: string;
  awayTeamName: string;
  homeTeamName: string;
  atBatLogId: string;
  inningNumber: number;
  inningHalf: 'top' | 'bottom';
  result: string | null;
  pitchCount: number;
  rbi: number;
  pitchLogs: Array<{
    id: string;
    pitchType: string;
    zone: string;
    pitchX?: number;
    pitchY?: number;
    result: string;
    velocity?: number;
  }>;
  battedBall?: {
    type: string;
    fieldX: number;
    fieldY: number;
    estimatedDistance: number;
  };
}

// ── Helpers ────────────────────────────────────────────────────────────────────

export const AT_BAT_RESULT_LABELS: Record<string, string> = {
  strikeout: '三振',
  strikeout_looking: '見逃し三振',
  walk: '四球',
  hit_by_pitch: '死球',
  single: '単打',
  double: '二塁打',
  triple: '三塁打',
  home_run: '本塁打',
  groundout: 'ゴロアウト',
  flyout: 'フライアウト',
  lineout: 'ライナーアウト',
  pop_out: 'ポップフライ',
  sacrifice_bunt: '犠打',
  sacrifice_fly: '犠飛',
  fielders_choice: '野選',
  error: 'エラー出塁',
  double_play: '併殺打',
  triple_play: '三重殺',
};

// ── Ownership check ────────────────────────────────────────────────────────────

/**
 * Determines if `userId` can share a given at-bat record from a game.
 *
 * Rules:
 *  1. If the batter player has `realPlayerId === userId` → explicit owner.
 *  2. If NO player in the game has a realPlayerId set (quick-start game) → allow
 *     sharing all records (the recorder is the player).
 */
export function canShareAtBat(
  atBatId: string,
  game: GameState,
  userId: string,
): boolean {
  const atBat = game.atBatLogs.find((l) => l.id === atBatId);
  if (!atBat) return false;

  const allPlayers = [
    ...game.awayTeam.roster.starters,
    ...game.awayTeam.roster.bench,
    ...game.homeTeam.roster.starters,
    ...game.homeTeam.roster.bench,
  ];
  const batter = allPlayers.find((p) => p.id === atBat.batterId);

  // Explicit realPlayerId link
  if (batter?.realPlayerId === userId) return true;

  // Quick-start games (no realPlayerId on any player) — allow all
  const hasAnyRealPlayerIds = allPlayers.some((p) => p.realPlayerId);
  if (!hasAnyRealPlayerIds) return true;

  return false;
}

// ── Main function ─────────────────────────────────────────────────────────────

/**
 * Creates a personal feed post from a specific at-bat record.
 *
 * Security:
 *  - Re-verifies Firebase Auth to prevent spoofing (本人確認).
 *  - Verifies ownership of the at-bat record before creating the post.
 *  - Stores `gameId` reference in statsData (no full game copy).
 */
export async function createPersonalPost(
  authorId: string,
  gameId: string,
  atBatLogId: string,
): Promise<void> {
  // ── 1. Re-verify authentication (本人確認) ─────────────────────────────────
  const firebaseUser = auth.currentUser;
  if (!firebaseUser || firebaseUser.uid !== authorId) {
    throw new AppError('UNAUTHORIZED', '認証情報が確認できません。再ログインしてください。');
  }

  // ── 2. Load game (local AsyncStorage first, then Firestore) ───────────────
  let game: GameState | undefined | null = await localDb.games.get(gameId);
  const isLocalGame = !!game;
  if (!game) {
    const saved = await gameService.getGame(gameId);
    game = saved ?? undefined;
  }
  if (!game) {
    throw new AppError('NOT_FOUND', 'ゲームデータが見つかりません。');
  }

  // ── 3. Find the at-bat log ─────────────────────────────────────────────────
  const atBat = game.atBatLogs.find((l) => l.id === atBatLogId);
  if (!atBat) {
    throw new AppError('NOT_FOUND', '打席データが見つかりません。');
  }

  // ── 4. Ownership verification ──────────────────────────────────────────────
  const allPlayers = [
    ...game.awayTeam.roster.starters,
    ...game.awayTeam.roster.bench,
    ...game.homeTeam.roster.starters,
    ...game.homeTeam.roster.bench,
  ];
  const batter = allPlayers.find((p) => p.id === atBat.batterId);
  const isOwnerByRealId = batter?.realPlayerId === authorId;
  const hasAnyRealPlayerIds = allPlayers.some((p) => p.realPlayerId);
  const firestoreOwnerId = (game as any).ownerId as string | undefined;
  const isFirestoreOwner = !!firestoreOwnerId && firestoreOwnerId === authorId;

  // Allow if: explicit realPlayerId match OR quick-start local game OR Firestore owner
  const isOwner =
    isOwnerByRealId ||
    (isLocalGame && !hasAnyRealPlayerIds) ||
    isFirestoreOwner;

  if (!isOwner) {
    throw new AppError('FORBIDDEN', 'この記録はあなたのものではありません。');
  }

  // ── 5. Build post content ──────────────────────────────────────────────────
  const halfLabel = atBat.inning.half === 'top' ? '表' : '裏';
  const inningLabel = `${atBat.inning.number}回${halfLabel}`;
  const resultLabel = atBat.result
    ? (AT_BAT_RESULT_LABELS[atBat.result] ?? atBat.result)
    : '進行中';
  const teamLabel = `${game.awayTeam.name} vs ${game.homeTeam.name}`;
  const rbiNote = atBat.rbiCount > 0 ? ` 打点${atBat.rbiCount}` : '';
  const content = `【${teamLabel}】${inningLabel} — ${resultLabel}${rbiNote}`;

  // ── 6. Build statsData snapshot (preserves gameId reference) ──────────────
  const statsData: GameRecordStatsData = {
    sourceType: 'game_record',
    gameId,
    awayTeamName: game.awayTeam.name,
    homeTeamName: game.homeTeam.name,
    atBatLogId,
    inningNumber: atBat.inning.number,
    inningHalf: atBat.inning.half,
    result: atBat.result,
    pitchCount: atBat.pitches.length,
    rbi: atBat.rbiCount,
    pitchLogs: atBat.pitches.map((p) => ({
      id: p.id,
      pitchType: p.pitchType,
      zone: p.zone,
      pitchX: p.pitchX,
      pitchY: p.pitchY,
      result: p.result,
      velocity: p.velocity,
    })),
    battedBall: atBat.battedBall,
  };

  // ── 7. Create the post ─────────────────────────────────────────────────────
  const input: CreatePostInput = {
    type: 'stats',
    content,
    mediaURIs: [],
    externalVideoUrl: null,
    statsData: statsData as unknown as Record<string, unknown>,
    visibility: 'public',
    teamId: null,
  };

  await createPost(authorId, input);
}
