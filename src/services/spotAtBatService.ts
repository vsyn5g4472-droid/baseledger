import {
  collection,
  addDoc,
  getDocs,
  deleteDoc,
  doc,
  query,
  where,
  orderBy,
  Timestamp,
} from 'firebase/firestore';
import { db, COLLECTIONS } from './firebase';
import { db as localDb } from '../db';
import type { SpotAtBat, SpotAtBatImportMode } from '../models/types';
import { AppError } from '../models/types';
import { gameService } from './gameService';
import { stripGameMetadata } from './gameService';
import { atBatLogToSpotAtBatInput } from '../utils/gameAtBatImporter';
import type { GameState } from '../types/game';

const spotRef = () => collection(db, COLLECTIONS.SPOT_AT_BATS);

export async function createSpotAtBat(
  userId: string,
  data: Omit<SpotAtBat, 'id' | 'userId' | 'createdAt' | 'updatedAt'>,
): Promise<SpotAtBat> {
  const now = Timestamp.now();
  const docData = { ...data, userId, createdAt: now, updatedAt: now };
  const docRef = await addDoc(spotRef(), docData);
  return { id: docRef.id, ...docData } as SpotAtBat;
}

export async function getUserSpotAtBats(userId: string): Promise<SpotAtBat[]> {
  const q = query(
    spotRef(),
    where('userId', '==', userId),
    orderBy('createdAt', 'desc'),
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as SpotAtBat));
}

export async function deleteSpotAtBat(id: string): Promise<void> {
  await deleteDoc(doc(db, COLLECTIONS.SPOT_AT_BATS, id));
}

async function loadGameForImport(gameId: string): Promise<GameState | null> {
  const local = await localDb.games.get(gameId);
  if (local) return local;
  const shared = await gameService.getSharedGame(gameId);
  if (shared) return stripGameMetadata(shared);
  const owned = await gameService.getGame(gameId);
  if (owned) return stripGameMetadata(owned);
  return null;
}

/** 同一打席のインポート済みか確認 */
export async function isAtBatAlreadyImported(
  userId: string,
  sourceGameId: string,
  sourceAtBatId: string,
): Promise<boolean> {
  const q = query(
    spotRef(),
    where('userId', '==', userId),
    where('sourceGameId', '==', sourceGameId),
  );
  const snap = await getDocs(q);
  return snap.docs.some((d) => d.data().sourceAtBatId === sourceAtBatId);
}

/**
 * 試合の打席データを SpotAtBat にインポートする（重複はスキップ）。
 */
export async function importFromGame(
  gameId: string,
  atBatIds: string[],
  userId: string,
  importMode: SpotAtBatImportMode = 'merged',
): Promise<{ imported: SpotAtBat[]; skipped: string[] }> {
  const game = await loadGameForImport(gameId);
  if (!game) {
    throw new AppError('NOT_FOUND', '試合データが見つかりません。');
  }

  const imported: SpotAtBat[] = [];
  const skipped: string[] = [];

  for (const atBatId of atBatIds) {
    const already = await isAtBatAlreadyImported(userId, gameId, atBatId);
    if (already) {
      skipped.push(atBatId);
      continue;
    }

    const atBat = game.atBatLogs.find((l) => l.id === atBatId);
    if (!atBat || !atBat.result) {
      skipped.push(atBatId);
      continue;
    }

    const input = atBatLogToSpotAtBatInput(atBat, game, importMode);
    const created = await createSpotAtBat(userId, input);
    imported.push(created);
  }

  return { imported, skipped };
}
