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
  getFirestoreUser,
  getEmailByUsername,
  // TODO(切り分け): Step B — onAuthStateChanged 空化のため一時未使用
  // syncFirestoreUser,
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
import { logoutRevenueCatUser } from '../services/revenueCatService';
// TODO(切り分け): ログイン後クラッシュ調査のため一時無効化 — Step 1
// import { syncGamesFromFirestore } from '../services/gameService';

interface AuthContextType {
  currentUser: User | null;
  userPlan: UserPlan;
  loading: boolean;
  isNewUser: boolean;
  clearNewUser: () => void;
  /** Firestore ユーザーを再取得（設定保存後など） */
  refreshUser: (updates?: Partial<User>) => Promise<void>;
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
  // signUp 時に displayName/role を onAuthStateChanged / sync へ橋渡しするための ref
  const pendingExtras = useRef<{ displayName: string; role: UserRole } | null>(null);

  const clearNewUser = useCallback(() => setIsNewUser(false), []);

  const refreshUser = useCallback(async (updates?: Partial<User>) => {
    const u = auth.currentUser;
    if (!u) return;
    try {
      const user = await getFirestoreUser(u.uid);
      if (user) setCurrentUser(user);
    } catch {
      // Firestore 再取得失敗時、渡された updates でオプティミスティックに反映
      if (updates) setCurrentUser((prev) => prev ? { ...prev, ...updates } : prev);
    }
  }, []);

  // ── Firebase Auth 状態監視 ──────────────────────────────────────────────────
  // onAuthStateChanged はアプリ起動時・ログイン・ログアウト時に発火する
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      // TODO(切り分け): Step B - コールバックを空にしてクラッシュ確認
      console.log('[切り分けB] onAuthStateChanged fired:', !!firebaseUser);
      setLoading(false);
    });

    return unsubscribe;
  }, []);

  // ── ゲームデータ同期 ─────────────────────────────────────────────────────────
  // TODO(切り分け): Step 1 — syncGamesFromFirestore を一時無効化（ログイン後クラッシュ調査）
  // ログイン後、AsyncStorage が空の場合のみ Firestore からリストア
  // useEffect(() => {
  //   if (currentUser?.uid) {
  //     syncGamesFromFirestore(currentUser.uid).catch((e) =>
  //       console.warn('syncGamesFromFirestore error:', e),
  //     );
  //   }
  // }, [currentUser?.uid]);

  // ── メールアドレス + パスワード ログイン ────────────────────────────────────
  // Firebase Auth のみ実行。Firestore sync は onAuthStateChanged に一本化して二重呼び出しを防ぐ
  const signIn = useCallback(async (email: string, password: string) => {
    setLoading(true);
    const _tTotal = Date.now();
    try {
      const _tAuth = Date.now();
      await signInWithEmailAndPassword(auth, email, password);
      if (__DEV__) console.log(`[perf][auth] signIn.firebaseAuth: ${Date.now() - _tAuth}ms`);
      if (__DEV__) console.log(`[perf][auth] signIn.TOTAL: ${Date.now() - _tTotal}ms`);
      // currentUser 更新と setLoading(false) は onAuthStateChanged が担当
    } catch (error) {
      if (__DEV__) console.log(`[perf][auth] signIn.TOTAL: ${Date.now() - _tTotal}ms`);
      setLoading(false); // 認証失敗時は onAuthStateChanged が発火しないため手動で解除
      throw new Error(getFirebaseErrorMessage(error));
    }
  }, []);

  // ── ユーザーID + パスワード ログイン ─────────────────────────────────────────
  // Firestore で username を検索してメールアドレスに変換してからサインイン
  const signInWithUsername = useCallback(async (username: string, password: string) => {
    setLoading(true);
    try {
      const email = await getEmailByUsername(username);
      if (!email) throw new Error('このユーザーIDは存在しません。');
      await signInWithEmailAndPassword(auth, email, password);
      // currentUser 更新と setLoading(false) は onAuthStateChanged が担当
    } catch (error) {
      setLoading(false);
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
      // isNew / currentUser は onAuthStateChanged 内の syncFirestoreUser に任せる
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
    await logoutRevenueCatUser();
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
      // currentUser 更新と setLoading(false) は onAuthStateChanged が担当
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
