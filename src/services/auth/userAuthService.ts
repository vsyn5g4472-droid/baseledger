import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
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

type SignUpExtras = { displayName: string; role: UserRole };

const FIRESTORE_TIMEOUT_MS = 15_000; // 屋外モバイル回線（野球場）を考慮して15秒

function withTimeout<T>(promise: Promise<T>, ms = FIRESTORE_TIMEOUT_MS): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`Firestore timeout after ${ms}ms`)), ms),
    ),
  ]);
}

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
function applyInvitePlanExpiry(user: User, raw: Record<string, unknown>): User {
  if (user.plan !== UserPlan.STANDARD) return user;
  const exp = raw.standardExpiresAt as Timestamp | undefined;
  if (!exp?.toMillis) return user;
  if (Date.now() > exp.toMillis()) {
    return { ...user, plan: UserPlan.FREE };
  }
  return user;
}

export async function getFirestoreUser(uid: string): Promise<User | null> {
  try {
    const _t = Date.now();
    const snap = await withTimeout(getDoc(doc(db, COLLECTIONS.USERS, uid)));
    if (__DEV__) console.log(`[perf][user] getDoc(users): ${Date.now() - _t}ms`);
    if (!snap.exists()) return null;
    const raw = snap.data();
    const data = raw as User;
    if (!data.plan) data.plan = UserPlan.FREE;
    return applyInvitePlanExpiry(data, raw);
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
  const displayName = extras?.displayName ?? firebaseUser.displayName ?? firebaseUser.email?.split('@')[0] ?? 'User';
  const userDoc: User = {
    uid: firebaseUser.uid,
    email: firebaseUser.email ?? '',
    displayName,
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

  const _t = Date.now();
  await withTimeout(setDoc(doc(db, COLLECTIONS.USERS, firebaseUser.uid), {
    ...userDoc,
    displayNameLower: displayName.toLowerCase(),
  }));
  if (__DEV__) console.log(`[perf][user] setDoc(users): ${Date.now() - _t}ms`);
  return userDoc;
}

/**
 * Firestore 未作成 / 一時的エラー時でも UI を維持するため、Auth から最小の User を合成する。
 * バックエンド修復のあと `refreshUser` や getOrCreate で正規のドキュメントに置き換わる。
 */
export function buildMinimalUserFromFirebase(
  firebaseUser: FirebaseUser,
  extras?: SignUpExtras | null,
): User {
  return {
    uid: firebaseUser.uid,
    email: firebaseUser.email ?? '',
    displayName:
      extras?.displayName
      ?? firebaseUser.displayName
      ?? firebaseUser.email?.split('@')[0]
      ?? 'User',
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
}

/**
 * getOrCreate が失敗しても、Firebase セッションは有効のまま User を返す（currentUser null を防ぐ）。
 */
export async function syncFirestoreUser(
  firebaseUser: FirebaseUser,
  extras?: SignUpExtras | null,
): Promise<{ user: User; isNew: boolean }> {
  const _t = Date.now();
  try {
    const result = await getOrCreateFirestoreUser(
      firebaseUser,
      extras
        ? { displayName: extras.displayName, role: extras.role }
        : undefined,
    );
    if (__DEV__) console.log(`[perf][user] getOrCreateFirestoreUser: ${Date.now() - _t}ms (new=${result.isNew})`);
    return result;
  } catch {
    if (__DEV__) console.log(`[perf][user] getOrCreateFirestoreUser FAILED: ${Date.now() - _t}ms`);
    try {
      const fromDb = await getFirestoreUser(firebaseUser.uid);
      if (fromDb) {
        if (!fromDb.plan) fromDb.plan = UserPlan.FREE;
        return { user: fromDb, isNew: false };
      }
    } catch {
      /* 読取も失敗 → 下へ */
    }
    return {
      user: buildMinimalUserFromFirebase(firebaseUser, extras ?? null),
      isNew: extras != null, // サインアップ時(extras あり)のみ true。ログイン失敗時は false でループを防ぐ
    };
  }
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
  const _t = Date.now();
  const q = query(
    collection(db, COLLECTIONS.USERS),
    where('username', '==', username),
    limit(1),
  );
  const snap = await withTimeout(getDocs(q));
  if (__DEV__) console.log(`[perf][user] checkUsernameAvailable(${username}): ${Date.now() - _t}ms`);
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
  const snap = await withTimeout(getDocs(q));
  if (snap.empty) return null;
  const userData = snap.docs[0].data() as User;
  return userData.email ?? null;
}

/**
 * Delete the Firestore user document for the given uid.
 * Called before deleting the Firebase Auth account.
 */
export async function deleteFirestoreUserData(uid: string): Promise<void> {
  try {
    await withTimeout(deleteDoc(doc(db, COLLECTIONS.USERS, uid)));
  } catch (error) {
    throw new AppError('NETWORK', `Failed to delete user data: ${(error as Error).message}`);
  }
}

/**
 * Save the @username for a user. Throws if username is taken.
 */
export async function updateUsername(uid: string, username: string): Promise<void> {
  try {
    const _t = Date.now();
    await withTimeout(updateDoc(doc(db, COLLECTIONS.USERS, uid), {
      username,
      updatedAt: serverTimestamp(),
    }));
    if (__DEV__) console.log(`[perf][user] updateUsername: ${Date.now() - _t}ms`);
  } catch (error) {
    throw new AppError('NETWORK', `Failed to update username: ${(error as Error).message}`);
  }
}
