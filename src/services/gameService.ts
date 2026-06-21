import {
  collection,
  doc,
  setDoc,
  getDoc,
  getDocs,
  deleteDoc,
  updateDoc,
  arrayUnion,
  query,
  where,
  orderBy,
} from 'firebase/firestore';
import { db as firestoreDb, auth } from './firebase';
import { db as localDb } from '../db';
import type { GameState } from '../types/game';
import type { GamePlayerAssignment, GameSharingFields } from '../models/types';
import { AppError } from '../models/types';
import { sanitizeForFirestore } from '../utils/firestoreUtils';

const GAMES = 'games';

export interface SavedGame extends GameState, GameSharingFields {
  ownerId: string;
  savedAt: number;
}

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
