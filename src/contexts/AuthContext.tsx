import React, { createContext, useContext, useState, useCallback, useMemo, useEffect, useRef } from 'react';
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
  getEmailByUsername,
} from '../services/auth/userAuthService';
import {
  signInWithGoogleCredential,
  signInWithAppleToken,
} from '../services/auth/socialAuth';
import {
  authenticateWithBiometrics,
  clearBiometricCredentials,
} from '../services/auth/passkeyAuth';
import { getFirebaseErrorMessage } from '../utils/firebaseErrors';
import type { User, UserRole } from '../models/types';
import { UserPlan } from '../services/planService';

interface AuthContextType {
  currentUser: User | null;
  userPlan: UserPlan;
  loading: boolean;
  isNewUser: boolean;
  clearNewUser: () => void;
  /** Firestore ユーザーを再取得（設定保存後など） */
  refreshUser: () => Promise<void>;
  signIn: (email: string, password: string) => Promise<void>;
  signInWithUsername: (username: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, displayName: string, role: UserRole) => Promise<void>;
  signOut: () => Promise<void>;
  signInWithPasskey: () => Promise<void>;
  signInWithGoogle: (idToken: string | null, accessToken: string | null) => Promise<void>;
  signInWithApple: (identityToken: string, rawNonce: string) => Promise<void>;
  signInAsGuest: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// ─── Provider ─────────────────────────────────────────────────────────────────

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [isNewUser, setIsNewUser] = useState(false);
  // signUp 時に displayName/role を onAuthStateChanged ハンドラへ橋渡しするための ref
  const pendingExtras = useRef<{ displayName: string; role: UserRole } | null>(null);

  const clearNewUser = useCallback(() => setIsNewUser(false), []);

  const refreshUser = useCallback(async () => {
    const u = auth.currentUser;
    if (!u) return;
    try {
      const user = await getFirestoreUser(u.uid);
      if (user) setCurrentUser(user);
    } catch {
      // keep previous currentUser
    }
  }, []);

  // ── Firebase Auth 状態監視 ──────────────────────────────────────────────────
  // onAuthStateChanged はアプリ起動時・ログイン・ログアウト時に発火する
  useEffect(() => {
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
        // Firestore 取得失敗時（オフライン等）は null のままローディングを解除する
        try {
          const fallback = await getFirestoreUser(firebaseUser.uid);
          setCurrentUser(fallback);
        } catch {
          setCurrentUser(null);
        }
      } finally {
        setLoading(false);
      }
    });

    return unsubscribe;
  }, []);

  // ── メールアドレス + パスワード ログイン ────────────────────────────────────
  const signIn = useCallback(async (email: string, password: string) => {
    setLoading(true);
    try {
      await signInWithEmailAndPassword(auth, email, password);
      // currentUser の更新は onAuthStateChanged が担う
    } catch (error) {
      setLoading(false);
      throw new Error(getFirebaseErrorMessage(error));
    }
  }, []);

  // ── ユーザーID + パスワード ログイン ─────────────────────────────────────────
  // Firestore で username を検索してメールアドレスに変換してからサインイン
  const signInWithUsername = useCallback(async (username: string, password: string) => {
    setLoading(true);
    try {
      const email = await getEmailByUsername(username);
      if (!email) {
        throw new Error('このユーザーIDは存在しません。');
      }
      await signInWithEmailAndPassword(auth, email, password);
    } catch (error) {
      setLoading(false);
      // すでに日本語メッセージならそのまま、Firebase エラーなら変換
      const msg = error instanceof Error && error.message.includes('ユーザーID')
        ? error.message
        : getFirebaseErrorMessage(error);
      throw new Error(msg);
    }
  }, []);

  // ── 新規登録 ────────────────────────────────────────────────────────────────
  const signUp = useCallback(async (
    email: string,
    password: string,
    displayName: string,
    role: UserRole,
  ) => {
    setLoading(true);
    try {
      // extras を先にセットしておき onAuthStateChanged で Firestore ドキュメントを作成
      pendingExtras.current = { displayName, role };
      const credential = await createUserWithEmailAndPassword(auth, email, password);
      await updateProfile(credential.user, { displayName });
      setIsNewUser(true);
      // currentUser の更新は onAuthStateChanged が担う
    } catch (error) {
      pendingExtras.current = null;
      setLoading(false);
      throw new Error(getFirebaseErrorMessage(error));
    }
  }, []);

  // ── ログアウト ───────────────────────────────────────────────────────────────
  const signOut = useCallback(async () => {
    await clearBiometricCredentials().catch(() => {});
    await fbSignOut(auth);
    setCurrentUser(null);
    setIsNewUser(false);
  }, []);

  // ── Google ログイン ──────────────────────────────────────────────────────────
  const signInWithGoogle = useCallback(async (idToken: string | null, accessToken: string | null) => {
    setLoading(true);
    try {
      const { user, isNew } = await signInWithGoogleCredential(idToken, accessToken);
      setCurrentUser(user);
      if (isNew) setIsNewUser(true);
    } catch (error) {
      throw new Error(getFirebaseErrorMessage(error));
    } finally {
      setLoading(false);
    }
  }, []);

  // ── Apple ログイン ───────────────────────────────────────────────────────────
  const signInWithApple = useCallback(async (identityToken: string, rawNonce: string) => {
    setLoading(true);
    try {
      const { user, isNew } = await signInWithAppleToken(identityToken, rawNonce);
      setCurrentUser(user);
      if (isNew) setIsNewUser(true);
    } catch (error) {
      throw new Error(getFirebaseErrorMessage(error));
    } finally {
      setLoading(false);
    }
  }, []);

  // ── パスキー（生体認証）ログイン ─────────────────────────────────────────────
  // SecureStore に保存された email/password を生体認証で取り出してサインイン
  const signInWithPasskey = useCallback(async () => {
    const creds = await authenticateWithBiometrics();
    if (!creds) return;

    setLoading(true);
    try {
      await signInWithEmailAndPassword(auth, creds.email, creds.password);
    } catch (error) {
      setLoading(false);
      throw new Error(getFirebaseErrorMessage(error));
    }
  }, []);

  // ── ゲスト（テストプレイ用スキップ）────────────────────────────────────────
  // currentUser を null のままにし、認証が必要な機能はブロックされる状態でフィードへ進む
  const signInAsGuest = useCallback(() => {
    setLoading(false);
  }, []);

  const userPlan = currentUser?.plan ?? UserPlan.FREE;

  const value = useMemo(
    () => ({
      currentUser,
      userPlan,
      loading,
      isNewUser,
      clearNewUser,
      refreshUser,
      signIn,
      signInWithUsername,
      signUp,
      signOut,
      signInWithPasskey,
      signInWithGoogle,
      signInWithApple,
      signInAsGuest,
    }),
    [currentUser, userPlan, loading, isNewUser, clearNewUser, refreshUser, signIn, signInWithUsername, signUp, signOut, signInWithPasskey, signInWithGoogle, signInWithApple, signInAsGuest],
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
