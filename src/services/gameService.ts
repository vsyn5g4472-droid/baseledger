import {
  collection,
  doc,
  setDoc,
  getDoc,
  getDocs,
  getDocsFromServer,
  deleteDoc,
  updateDoc,
  arrayUnion,
  query,
  where,
  orderBy,
  documentId,
  limit,
  runTransaction,
} from 'firebase/firestore';
import { db as firestoreDb, auth } from './firebase';
import { db as localDb } from '../db';
import type { GameState } from '../types/game';
import type { GamePlayerAssignment, GameSharingFields } from '../models/types';
import { AppError } from '../models/types';
import { sanitizeForFirestore } from '../utils/firestoreUtils';
import { comparePitcherReassignmentLogIdSets } from './pitcherReassignmentService';
import { hasUnresolvedPitcherStints } from './unassignedPitcherService';

const GAMES = 'games';

export interface SavedGame extends GameState, GameSharingFields {
  ownerId: string;
  savedAt: number;
}

export type OwnedGameLookup =
  | { kind: 'owned'; game: SavedGame }
  | { kind: 'confirmed_no_owned_doc' }
  | { kind: 'undeterminable'; error: unknown };

export type CloudCommitResult =
  | { kind: 'committed' }
  | { kind: 'already_applied'; cloudGame: SavedGame }
  | { kind: 'conflict_remote_changed'; remoteUpdatedAt: number }
  | { kind: 'conflict_doc_missing' }
  | { kind: 'conflict_not_owner' };

export type CloudLogVerification =
  | { kind: 'log_found'; cloudGame: SavedGame }
  | { kind: 'log_absent' }
  | { kind: 'undeterminable'; error: unknown };

export type LogSetComparison =
  | { kind: 'in_sync' }
  | { kind: 'cloud_ahead'; missingLocally: string[]; cloudGame: SavedGame }
  | { kind: 'local_ahead'; missingRemotely: string[] }
  | { kind: 'diverged'; missingLocally: string[]; missingRemotely: string[] }
  | { kind: 'undeterminable'; error: unknown };

/** Firestore ドキュメントから GameState 本体のみを取り出す */
export function stripGameMetadata(saved: SavedGame): GameState {
  const {
    ownerId: _ownerId,
    savedAt: _savedAt,
    sharedWith: _sharedWith,
    sharedTo: _sharedTo,
    isShared: _isShared,
    canReshare: _canReshare,
    playerAssignments: _playerAssignments,
    ...game
  } = saved;
  return game as GameState;
}

function userCanAccessGame(data: SavedGame, userId: string): boolean {
  if (data.ownerId === userId) return true;
  if (data.sharedWith?.includes(userId)) return true;
  if (data.isShared === true && data.sharedTo?.includes(userId)) return true;
  return false;
}

function mergePlayerAssignments(
  existing: GamePlayerAssignment[],
  incoming: GamePlayerAssignment[],
): GamePlayerAssignment[] {
  const merged = [...existing];
  for (const assignment of incoming) {
    const idx = merged.findIndex((a) => a.playerId === assignment.playerId);
    if (idx >= 0) merged[idx] = assignment;
    else merged.push(assignment);
  }
  return merged;
}

function gameForCloud(game: GameState): Omit<GameState, 'undoStack' | 'preAdvancementSnapshot'> {
  const {
    undoStack: _undoStack,
    preAdvancementSnapshot: _preAdvancementSnapshot,
    ...persistable
  } = game;
  return persistable;
}

function sharingMetadata(game: SavedGame): GameSharingFields & { ownerId: string } {
  return {
    ownerId: game.ownerId,
    ...(game.sharedWith ? { sharedWith: game.sharedWith } : {}),
    ...(game.sharedTo ? { sharedTo: game.sharedTo } : {}),
    ...(game.isShared != null ? { isShared: game.isShared } : {}),
    ...(game.canReshare != null ? { canReshare: game.canReshare } : {}),
    ...(game.playerAssignments ? { playerAssignments: game.playerAssignments } : {}),
  };
}

/** 直接getが権限拒否になる未所有ドキュメントと、存在しないドキュメントを安全に区別する。 */
export async function fetchOwnedGameFromServer(
  gameId: string,
  userId: string,
): Promise<OwnedGameLookup> {
  try {
    const ownedQuery = query(
      collection(firestoreDb, GAMES),
      where('ownerId', '==', userId),
      where(documentId(), '==', gameId),
      limit(1),
    );
    const snap = await getDocsFromServer(ownedQuery);
    if (snap.empty) return { kind: 'confirmed_no_owned_doc' };
    return { kind: 'owned', game: snap.docs[0].data() as SavedGame };
  } catch (error) {
    return { kind: 'undeterminable', error };
  }
}

/**
 * 既存の共有メタデータを維持したまま、投手移管済みGameStateを楽観ロック付きで保存する。
 */
export async function commitPitcherReassignmentToCloud(
  next: GameState,
  logId: string,
  expectedUpdatedAt: number,
  userId: string,
): Promise<CloudCommitResult> {
  const ref = doc(firestoreDb, GAMES, next.id);
  return runTransaction(firestoreDb, async (tx): Promise<CloudCommitResult> => {
    const snap = await tx.get(ref);
    if (!snap.exists()) return { kind: 'conflict_doc_missing' };
    const cloud = snap.data() as SavedGame;
    if (cloud.ownerId !== userId) return { kind: 'conflict_not_owner' };
    if ((cloud.pitcherReassignmentLogs ?? []).some((log) => log.id === logId)) {
      return { kind: 'already_applied', cloudGame: cloud };
    }
    if (cloud.updatedAt !== expectedUpdatedAt) {
      return { kind: 'conflict_remote_changed', remoteUpdatedAt: cloud.updatedAt };
    }

    const data = sanitizeForFirestore({
      ...gameForCloud(next),
      ...sharingMetadata(cloud),
      savedAt: Date.now(),
    });
    tx.set(ref, data);
    return { kind: 'committed' };
  });
}

export async function verifyPitcherReassignmentOnCloud(
  gameId: string,
  logId: string,
  userId: string,
): Promise<CloudLogVerification> {
  const lookup = await fetchOwnedGameFromServer(gameId, userId);
  if (lookup.kind === 'undeterminable') return lookup;
  if (lookup.kind === 'confirmed_no_owned_doc') return { kind: 'log_absent' };
  return (lookup.game.pitcherReassignmentLogs ?? []).some((log) => log.id === logId)
    ? { kind: 'log_found', cloudGame: lookup.game }
    : { kind: 'log_absent' };
}

export async function comparePitcherReassignmentLogs(
  gameId: string,
  userId: string,
): Promise<LogSetComparison> {
  try {
    const local = await localDb.games.get(gameId);
    if (!local) return { kind: 'undeterminable', error: new Error('端末の試合が見つかりません。') };
    const lookup = await fetchOwnedGameFromServer(gameId, userId);
    if (lookup.kind === 'undeterminable') return lookup;

    const localIds = (local.pitcherReassignmentLogs ?? []).map((log) => log.id);
    const cloudIds =
      lookup.kind === 'owned'
        ? (lookup.game.pitcherReassignmentLogs ?? []).map((log) => log.id)
        : [];
    const relation = comparePitcherReassignmentLogIdSets(localIds, cloudIds);
    if (relation.kind === 'cloud_ahead') {
      if (lookup.kind === 'owned') return { ...relation, cloudGame: lookup.game };
      return { kind: 'undeterminable', error: new Error('クラウド試合の実体を取得できません。') };
    }
    return relation;
  } catch (error) {
    return { kind: 'undeterminable', error };
  }
}

export async function syncGamesFromFirestore(userId: string): Promise<void> {
  try {
    // Firestoreからゲームを取得
    const firestoreGames = await gameService.getUserGames(userId);
    if (firestoreGames.length === 0) return;

    // ローカルの既存IDを取得
    const existingIds = new Set((await localDb.games.getAll()).map((g) => g.id));

    // Firestoreにあってローカルにないものだけ保存
    for (const game of firestoreGames) {
      if (!existingIds.has(game.id)) {
        await localDb.games.put(stripGameMetadata(game));
      }
    }
  } catch (e) {
    console.warn('syncGamesFromFirestore error:', e);
  }
}

export const gameService = {
  async saveGame(game: GameState, userId: string): Promise<void> {
    const ref = doc(firestoreDb, GAMES, game.id);
    const { undoStack: _undo, ...gameWithoutUndoStack } = game;
    const data = sanitizeForFirestore({ ...gameWithoutUndoStack, ownerId: userId, savedAt: Date.now() });
    await setDoc(ref, data);
  },

  async getGame(gameId: string): Promise<SavedGame | null> {
    const snap = await getDoc(doc(firestoreDb, GAMES, gameId));
    return snap.exists() ? (snap.data() as SavedGame) : null;
  },

  /**
   * 共有された試合を取得する。sharedWith / sharedTo によるアクセス権を確認する。
   */
  async getSharedGame(gameId: string, userId?: string): Promise<SavedGame | null> {
    const uid = userId ?? auth.currentUser?.uid;
    if (!uid) return null;

    const snap = await getDoc(doc(firestoreDb, GAMES, gameId));
    if (!snap.exists()) return null;

    const data = snap.data() as SavedGame;
    if (!userCanAccessGame(data, uid)) return null;
    return data;
  },

  /**
   * 試合を指定ユーザーに共有する（オーナーのみ）。
   */
  async shareGame(
    gameId: string,
    targetUserIds: string[],
    playerAssignments: GamePlayerAssignment[],
    canReshare: boolean,
  ): Promise<void> {
    const uid = auth.currentUser?.uid;
    if (!uid) {
      throw new AppError('UNAUTHORIZED', 'ログインが必要です。');
    }
    if (targetUserIds.length === 0) {
      throw new AppError('VALIDATION', '共有先ユーザーを指定してください。');
    }

    const ref = doc(firestoreDb, GAMES, gameId);
    const snap = await getDoc(ref);
    if (!snap.exists()) {
      throw new AppError('NOT_FOUND', '試合データが見つかりません。');
    }

    const data = snap.data() as SavedGame;
    if (data.ownerId !== uid) {
      throw new AppError('FORBIDDEN', 'この試合を共有する権限がありません。');
    }
    if (hasUnresolvedPitcherStints(data)) {
      throw new AppError(
        'VALIDATION',
        '未割当の投手記録があります。実投手へ割り当ててから共有してください。',
      );
    }

    const mergedAssignments = mergePlayerAssignments(
      data.playerAssignments ?? [],
      playerAssignments,
    );

    await updateDoc(ref, {
      sharedWith: arrayUnion(...targetUserIds),
      sharedTo: arrayUnion(...targetUserIds),
      isShared: true,
      canReshare,
      playerAssignments: sanitizeForFirestore(mergedAssignments),
    });
  },

  async getUserGames(userId: string): Promise<SavedGame[]> {
    const q = query(
      collection(firestoreDb, GAMES),
      where('ownerId', '==', userId),
      orderBy('createdAt', 'desc'),
    );
    const snap = await getDocs(q);
    return snap.docs.map((d) => d.data() as SavedGame);
  },

  async deleteGame(gameId: string): Promise<void> {
    await deleteDoc(doc(firestoreDb, GAMES, gameId));
    await localDb.games.remove(gameId);
  },
};
