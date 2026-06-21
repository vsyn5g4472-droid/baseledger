import {
  collection, doc, addDoc, getDocs,
  query, where, orderBy, Timestamp
} from 'firebase/firestore';
import { db, COLLECTIONS } from './firebase';

export interface Ballpark {
  id: string;
  name: string;
  fenceLeft: string;
  fenceCenter: string;
  fenceRight: string;
  ownerId: string;
  createdAt: Timestamp;
}

export async function getUserBallparks(userId: string): Promise<Ballpark[]> {
  const q = query(
    collection(db, COLLECTIONS.BALLPARKS),
    where('ownerId', '==', userId),
    orderBy('createdAt', 'desc'),
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() })) as Ballpark[];
}

export async function addBallpark(
  userId: string,
  data: Omit<Ballpark, 'id' | 'createdAt' | 'ownerId'>,
): Promise<Ballpark> {
  const ref = await addDoc(collection(db, COLLECTIONS.BALLPARKS), {
    ...data,
    ownerId: userId,
    createdAt: Timestamp.now(),
  });
  return { id: ref.id, ...data, ownerId: userId, createdAt: Timestamp.now() };
}
