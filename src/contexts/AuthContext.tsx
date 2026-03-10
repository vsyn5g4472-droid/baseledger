import React, { createContext, useContext, useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { Timestamp } from 'firebase/firestore';
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut as fbSignOut,
  onAuthStateChanged,
  updateProfile,
} from 'firebase/auth';
import { auth } from '../services/firebase';
import {
  getOrCreateFirestoreUser,
  getFirestoreUser,
} from '../services/auth/userAuthService';
import {
  signInWithGoogleCredential,
  signInWithAppleToken,
} from '../services/auth/socialAuth';
import {
  authenticateWithBiometrics,
  saveBiometricCredentials,
  clearBiometricCredentials,
} from '../services/auth/passkeyAuth';
import type { User, UserRole } from '../models/types';

const USE_MOCK = process.env.EXPO_PUBLIC_USE_MOCK_AUTH === 'true';

interface AuthContextType {
  currentUser: User | null;
  loading: boolean;
  isNewUser: boolean;
  clearNewUser: () => void;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, displayName: string, role: UserRole) => Promise<void>;
  signOut: () => Promise<void>;
  signInWithPasskey: () => Promise<void>;
  signInWithGoogle: (idToken: string | null, accessToken: string | null) => Promise<void>;
  signInWithApple: (identityToken: string, rawNonce: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// ─── Mock helpers ─────────────────────────────────────────────────────────────

const createMockUser = (email: string, displayName: string, role: UserRole): User => ({
  uid: 'mock-user-' + Date.now(),
  email,
  displayName,
  photoURL: null,
  username: null,
  role,
  position: role === 'player' ? 'Shortstop' : null,
  team: 'Tokyo Giants',
  age: 22,
  throwHand: 'right',
  batHand: 'right',
  bio: 'Passionate about baseball!',
  stats: {
    batting: { avg: 0.285, gamesPlayed: 45, totalAtBats: 180, totalHits: 51, totalHomeRuns: 8, totalRbis: 32 },
    pitching: { era: 3.42, gamesPlayed: 12, totalInningsPitched: 68, totalStrikeouts: 55, totalEarnedRuns: 26 },
    fielding: { fieldingPct: 0.975, totalPutouts: 120, totalAssists: 85, totalErrors: 5 },
  },
  followersCount: 128,
  followingCount: 64,
  postsCount: 23,
  isPublic: true,
  createdAt: Timestamp.now(),
  updatedAt: Timestamp.now(),
});

// ─── Provider ─────────────────────────────────────────────────────────────────

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(!USE_MOCK); // real auth starts loading
  const [isNewUser, setIsNewUser] = useState(false);
  // Carries displayName/role from signUp into the onAuthStateChanged handler
  const pendingExtras = useRef<{ displayName: string; role: UserRole } | null>(null);

  const clearNewUser = useCallback(() => setIsNewUser(false), []);

  // ── Real Firebase Auth ──────────────────────────────────────────────────────
  useEffect(() => {
    if (USE_MOCK) return;

    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (!firebaseUser) {
        setCurrentUser(null);
        setLoading(false);
        return;
      }

      try {
        const extras = pendingExtras.current ?? undefined;
        pendingExtras.current = null;
        const { user, isNew } = await getOrCreateFirestoreUser(firebaseUser, extras);
        setCurrentUser(user);
        if (isNew) setIsNewUser(true);
      } catch {
        // Profile fetch failed — still mark as authenticated with basic info
        const fallback = await getFirestoreUser(firebaseUser.uid);
        setCurrentUser(fallback);
      } finally {
        setLoading(false);
      }
    });

    return unsubscribe;
  }, []);

  // ── Sign-in ─────────────────────────────────────────────────────────────────
  const signIn = useCallback(async (email: string, password: string) => {
    if (USE_MOCK) {
      setLoading(true);
      await new Promise((r) => setTimeout(r, 800));
      setIsNewUser(false);
      setCurrentUser(createMockUser(email, email.split('@')[0], 'player'));
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      await signInWithEmailAndPassword(auth, email, password);
      // onAuthStateChanged will update currentUser
    } finally {
      setLoading(false);
    }
  }, []);

  // ── Sign-up ─────────────────────────────────────────────────────────────────
  const signUp = useCallback(async (
    email: string,
    password: string,
    displayName: string,
    role: UserRole,
  ) => {
    if (USE_MOCK) {
      setLoading(true);
      await new Promise((r) => setTimeout(r, 800));
      setIsNewUser(true);
      setCurrentUser(createMockUser(email, displayName, role));
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      // Store extras so onAuthStateChanged creates the Firestore doc with correct data
      pendingExtras.current = { displayName, role };
      const credential = await createUserWithEmailAndPassword(auth, email, password);
      await updateProfile(credential.user, { displayName });
      // getOrCreateFirestoreUser called in onAuthStateChanged with pendingExtras
      setIsNewUser(true);
      // onAuthStateChanged will set currentUser
    } finally {
      setLoading(false);
    }
  }, []);

  // ── Sign-out ─────────────────────────────────────────────────────────────────
  const signOut = useCallback(async () => {
    if (USE_MOCK) {
      setLoading(true);
      await new Promise((r) => setTimeout(r, 300));
      setCurrentUser(null);
      setIsNewUser(false);
      setLoading(false);
      return;
    }

    await clearBiometricCredentials().catch(() => {});
    await fbSignOut(auth);
    setCurrentUser(null);
    setIsNewUser(false);
  }, []);

  // ── Google Sign-in ──────────────────────────────────────────────────────────
  const signInWithGoogle = useCallback(async (idToken: string | null, accessToken: string | null) => {
    if (USE_MOCK) {
      setLoading(true);
      await new Promise((r) => setTimeout(r, 800));
      setCurrentUser(createMockUser('google@example.com', 'Google User', 'player'));
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const { user, isNew } = await signInWithGoogleCredential(idToken, accessToken);
      setCurrentUser(user);
      if (isNew) setIsNewUser(true);
    } finally {
      setLoading(false);
    }
  }, []);

  // ── Apple Sign-in ────────────────────────────────────────────────────────────
  const signInWithApple = useCallback(async (identityToken: string, rawNonce: string) => {
    if (USE_MOCK) {
      setLoading(true);
      await new Promise((r) => setTimeout(r, 800));
      setCurrentUser(createMockUser('apple@privaterelay.appleid.com', 'Apple User', 'player'));
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const { user, isNew } = await signInWithAppleToken(identityToken, rawNonce);
      setCurrentUser(user);
      if (isNew) setIsNewUser(true);
    } finally {
      setLoading(false);
    }
  }, []);

  // ── Passkey / Biometric sign-in ─────────────────────────────────────────────
  const signInWithPasskey = useCallback(async () => {
    if (USE_MOCK) return;

    const creds = await authenticateWithBiometrics();
    if (!creds) return;

    setLoading(true);
    try {
      await signInWithEmailAndPassword(auth, creds.email, creds.password);
    } finally {
      setLoading(false);
    }
  }, []);

  const value = useMemo(
    () => ({ currentUser, loading, isNewUser, clearNewUser, signIn, signUp, signOut, signInWithPasskey, signInWithGoogle, signInWithApple }),
    [currentUser, loading, isNewUser, clearNewUser, signIn, signUp, signOut, signInWithPasskey, signInWithGoogle, signInWithApple],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
