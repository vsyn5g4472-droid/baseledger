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
import type { SpotAtBat } from '../models/types';

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
