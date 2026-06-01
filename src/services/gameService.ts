import {
  collection,
  doc,
  setDoc,
  getDoc,
  getDocs,
  deleteDoc,
  query,
  where,
  orderBy,
} from 'firebase/firestore';
import { db as firestoreDb } from './firebase';
import { db as localDb } from '../db';
import type { GameState } from '../types/game';
import { sanitizeForFirestore } from '../utils/firestoreUtils';

const GAMES = 'games';

export interface SavedGame extends GameState {
  ownerId: string;
  savedAt: number;
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
        await localDb.games.put(game);
      }
    }
  } catch (e) {
    console.warn('syncGamesFromFirestore error:', e);
  }
}

export const gameService = {
  async saveGame(game: GameState, userId: string): Promise<void> {
    const ref = doc(firestoreDb, GAMES, game.id);
    const data = sanitizeForFirestore({ ...game, ownerId: userId, savedAt: Date.now() });
    await setDoc(ref, data);
  },

  async getGame(gameId: string): Promise<SavedGame | null> {
    const snap = await getDoc(doc(firestoreDb, GAMES, gameId));
    return snap.exists() ? (snap.data() as SavedGame) : null;
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
