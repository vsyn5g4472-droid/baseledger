import {
  collection,
  doc,
  setDoc,
  getDoc,
  getDocs,
  query,
  where,
  orderBy,
} from 'firebase/firestore';
import { db as firestoreDb } from './firebase';
import type { GameState } from '../types/game';
import { sanitizeForFirestore } from '../utils/firestoreUtils';

const GAMES = 'games';

export interface SavedGame extends GameState {
  ownerId: string;
  savedAt: number;
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
};
