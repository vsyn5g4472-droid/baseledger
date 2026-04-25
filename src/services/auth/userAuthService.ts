import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  serverTimestamp,
  Timestamp,
  collection,
  query,
  where,
  getDocs,
  limit,
} from 'firebase/firestore';
import { User as FirebaseUser } from 'firebase/auth';
import { db, COLLECTIONS } from '../firebase';
import { User, UserRole, UserStats, AppError } from '../../models/types';
import { UserPlan } from '../planService';

const DEFAULT_STATS: UserStats = {
  batting: {
    avg: 0,
    gamesPlayed: 0,
    totalAtBats: 0,
    totalHits: 0,
    totalHomeRuns: 0,
    totalRbis: 0,
  },
  pitching: {
    era: 0,
    gamesPlayed: 0,
    totalInningsPitched: 0,
    totalStrikeouts: 0,
    totalEarnedRuns: 0,
  },
  fielding: {
    fieldingPct: 0,
    totalPutouts: 0,
    totalAssists: 0,
    totalErrors: 0,
  },
};

/**
 * Fetch a user document from Firestore. Returns null if not found.
 */
export async function getFirestoreUser(uid: string): Promise<User | null> {
  try {
    const snap = await getDoc(doc(db, COLLECTIONS.USERS, uid));
    if (!snap.exists()) return null;
    const data = snap.data() as User;
    if (!data.plan) data.plan = UserPlan.FREE;
    return data;
  } catch (error) {
    throw new AppError('NETWORK', `Failed to fetch user: ${(error as Error).message}`);
  }
}

/**
 * Create a new Firestore user document from a Firebase Auth user.
 * @param firebaseUser - Firebase Auth user object
 * @param extras - Optional overrides (role, etc.)
 */
export async function createFirestoreUser(
  firebaseUser: FirebaseUser,
  extras?: { role?: UserRole; displayName?: string },
): Promise<User> {
  const userDoc: User = {
    uid: firebaseUser.uid,
    email: firebaseUser.email ?? '',
    displayName: extras?.displayName ?? firebaseUser.displayName ?? firebaseUser.email?.split('@')[0] ?? 'User',
    photoURL: firebaseUser.photoURL,
    username: null,
    role: extras?.role ?? 'player',
    position: null,
    team: null,
    age: null,
    throwHand: null,
    batHand: null,
    bio: '',
    stats: DEFAULT_STATS,
    plan: UserPlan.FREE,
    followersCount: 0,
    followingCount: 0,
    postsCount: 0,
    isPublic: true,
    createdAt: Timestamp.now(),
    updatedAt: Timestamp.now(),
  };

  await setDoc(doc(db, COLLECTIONS.USERS, firebaseUser.uid), userDoc);
  return userDoc;
}

/**
 * Get the Firestore user doc if it exists, otherwise create it.
 * Returns `{ user, isNew }` so callers can detect first-time sign-in.
 */
export async function getOrCreateFirestoreUser(
  firebaseUser: FirebaseUser,
  extras?: { role?: UserRole; displayName?: string },
): Promise<{ user: User; isNew: boolean }> {
  const existing = await getFirestoreUser(firebaseUser.uid);
  if (existing) return { user: existing, isNew: false };
  const user = await createFirestoreUser(firebaseUser, extras);
  return { user, isNew: true };
}

/**
 * Check whether a username is not yet taken in the users collection.
 * Returns true if the username is available, false if it is already in use.
 */
export async function checkUsernameAvailable(username: string): Promise<boolean> {
  const q = query(
    collection(db, COLLECTIONS.USERS),
    where('username', '==', username),
    limit(1),
  );
  const snap = await getDocs(q);
  return snap.empty;
}

/**
 * ユーザーIDからメールアドレスを引き当てる。
 * 存在しない場合は null を返す。
 */
export async function getEmailByUsername(username: string): Promise<string | null> {
  const q = query(
    collection(db, COLLECTIONS.USERS),
    where('username', '==', username),
    limit(1),
  );
  const snap = await getDocs(q);
  if (snap.empty) return null;
  const userData = snap.docs[0].data() as User;
  return userData.email ?? null;
}

/**
 * Save the @username for a user. Throws if username is taken.
 */
export async function updateUsername(uid: string, username: string): Promise<void> {
  try {
    await updateDoc(doc(db, COLLECTIONS.USERS, uid), {
      username,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    throw new AppError('NETWORK', `Failed to update username: ${(error as Error).message}`);
  }
}
