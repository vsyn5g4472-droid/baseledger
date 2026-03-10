import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut as fbSignOut,
  sendPasswordResetEmail,
  onAuthStateChanged as fbOnAuthStateChanged,
  GoogleAuthProvider,
  signInWithCredential,
  updateProfile,
  User as FirebaseUser,
} from 'firebase/auth';
import {
  doc,
  getDoc,
  setDoc,
  serverTimestamp,
  Timestamp,
} from 'firebase/firestore';
import { auth, db, COLLECTIONS } from './firebase';
import {
  User,
  UserRole,
  UserStats,
  AppError,
} from '../models/types';

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
 * Create a new user account with email/password and initialize Firestore profile.
 * @param email - User email
 * @param password - User password
 * @param displayName - Display name
 * @param role - User role (player, scout, coach)
 */
export async function signUp(
  email: string,
  password: string,
  displayName: string,
  role: UserRole,
): Promise<User> {
  try {
    const credential = await createUserWithEmailAndPassword(auth, email, password);
    await updateProfile(credential.user, { displayName });

    const userDoc: User = {
      uid: credential.user.uid,
      email,
      displayName,
      photoURL: null,
      username: null,
      role,
      position: null,
      team: null,
      age: null,
      throwHand: null,
      batHand: null,
      bio: '',
      stats: DEFAULT_STATS,
      followersCount: 0,
      followingCount: 0,
      postsCount: 0,
      isPublic: true,
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    };

    await setDoc(doc(db, COLLECTIONS.USERS, credential.user.uid), userDoc);
    return userDoc;
  } catch (error: unknown) {
    const err = error as { code?: string; message?: string };
    if (err.code === 'auth/email-already-in-use') {
      throw new AppError('VALIDATION', 'Email is already in use');
    }
    if (err.code === 'auth/weak-password') {
      throw new AppError('VALIDATION', 'Password is too weak');
    }
    throw new AppError('UNKNOWN', err.message ?? 'Failed to create account');
  }
}

/**
 * Sign in with email and password.
 */
export async function signIn(email: string, password: string): Promise<User> {
  try {
    const credential = await signInWithEmailAndPassword(auth, email, password);
    const profile = await getUserProfile(credential.user.uid);
    if (!profile) {
      throw new AppError('NOT_FOUND', 'User profile not found');
    }
    return profile;
  } catch (error) {
    if (error instanceof AppError) throw error;
    const err = error as { code?: string };
    if (err.code === 'auth/user-not-found' || err.code === 'auth/wrong-password' || err.code === 'auth/invalid-credential') {
      throw new AppError('UNAUTHORIZED', 'Invalid email or password');
    }
    throw new AppError('UNKNOWN', `Sign in failed: ${(error as Error).message}`);
  }
}

/**
 * Sign in with Google OAuth. Stub implementation — requires native Google Sign-In
 * configuration (google-services.json / GoogleService-Info.plist) and the
 * @react-native-google-signin/google-signin package.
 */
export async function signInWithGoogle(): Promise<User> {
  // NOTE: To enable Google Sign-In:
  // 1. Install @react-native-google-signin/google-signin
  // 2. Configure google-services.json (Android) and GoogleService-Info.plist (iOS)
  // 3. Enable Google provider in Firebase Console
  // 4. Replace this stub with:
  //    const { idToken } = await GoogleSignin.signIn();
  //    const credential = GoogleAuthProvider.credential(idToken);
  //    const result = await signInWithCredential(auth, credential);
  //    ... then get or create user profile
  throw new AppError('UNKNOWN', 'Google Sign-In requires native configuration. See authService.ts for setup instructions.');
}

/**
 * Sign out the current user.
 */
export async function signOut(): Promise<void> {
  try {
    await fbSignOut(auth);
  } catch (error) {
    throw new AppError('UNKNOWN', `Sign out failed: ${(error as Error).message}`);
  }
}

/**
 * Send a password reset email.
 */
export async function resetPassword(email: string): Promise<void> {
  try {
    await sendPasswordResetEmail(auth, email);
  } catch (error) {
    const err = error as { code?: string };
    if (err.code === 'auth/user-not-found') {
      throw new AppError('NOT_FOUND', 'No account found with this email');
    }
    throw new AppError('UNKNOWN', `Password reset failed: ${(error as Error).message}`);
  }
}

/**
 * Get the currently signed-in Firebase Auth user.
 */
export function getCurrentUser(): FirebaseUser | null {
  return auth.currentUser;
}

/**
 * Listen to auth state changes.
 * @returns Unsubscribe function
 */
export function onAuthStateChanged(
  callback: (user: FirebaseUser | null) => void,
): () => void {
  return fbOnAuthStateChanged(auth, callback);
}

/**
 * Get a user profile from Firestore.
 * @param uid - User ID
 */
export async function getUserProfile(uid: string): Promise<User | null> {
  try {
    const snap = await getDoc(doc(db, COLLECTIONS.USERS, uid));
    if (!snap.exists()) return null;
    return snap.data() as User;
  } catch (error) {
    throw new AppError('NETWORK', `Failed to fetch user profile: ${(error as Error).message}`);
  }
}

/**
 * Create an initial user profile in Firestore (for use with OAuth flows).
 */
export async function createUserProfile(
  uid: string,
  data: { email: string; displayName: string; photoURL: string | null; role: UserRole },
): Promise<User> {
  const userDoc: User = {
    uid,
    email: data.email,
    displayName: data.displayName,
    photoURL: data.photoURL,
    username: null,
    role: data.role,
    position: null,
    team: null,
    age: null,
    throwHand: null,
    batHand: null,
    bio: '',
    stats: DEFAULT_STATS,
    followersCount: 0,
    followingCount: 0,
    postsCount: 0,
    isPublic: true,
    createdAt: Timestamp.now(),
    updatedAt: Timestamp.now(),
  };

  await setDoc(doc(db, COLLECTIONS.USERS, uid), userDoc);
  return userDoc;
}
