import React, { createContext, useContext, useState, useCallback, useMemo, useEffect, useRef } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { db } from '../db';
import {
  createUserWithEmailAndPassword,
  signOut as fbSignOut,
  deleteUser as fbDeleteUser,
  onAuthStateChanged,
  updateProfile,
} from 'firebase/auth';
import { auth } from '../services/firebase';
import {
  getFirestoreUser,
  getEmailByUsername,
  syncFirestoreUser,
  deleteFirestoreUserData,
} from '../services/auth/userAuthService';
import {
  signInWithGoogleCredential,
  signInWithAppleToken,
} from '../services/auth/socialAuth';
import { signInWithEmailPassword } from '../services/auth/emailPasswordAuth';
import {
  authenticateWithBiometrics,
  clearBiometricCredentials,
} from '../services/auth/passkeyAuth';
import { getFirebaseErrorMessage } from '../utils/firebaseErrors';
import { registerForPushNotifications } from '../services/pushNotificationService';
import type { User, UserRole } from '../models/types';
import { UserPlan } from '../services/planService';
import {
  loginRevenueCatUser,
  logoutRevenueCatUser,
  syncPlanToFirestore,
} from '../services/revenueCatService';
import { syncGamesFromFirestore } from '../services/gameService';
import { updateAuthorNameInPosts } from '../services/postService';

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
  deleteAccount: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// ─── 初回マイグレーション: phase:'live' → 'paused' ─────────────────────────────

const MIGRATION_PAUSED_V1_KEY = 'migration_paused_v1_done';

async function runPausedMigration(): Promise<void> {
  const done = await AsyncStorage.getItem(MIGRATION_PAUSED_V1_KEY);
  if (done) return;
  const ids = await db.games.getAllIds();
  for (const id of ids) {
    const game = await db.games.get(id);
    if (game && (game.phase as string) === 'live') {
      await db.games.put({ ...game, phase: 'paused' });
    }
  }
  await AsyncStorage.setItem(MIGRATION_PAUSED_V1_KEY, '1');
}

const MIGRATION_PAUSED_V2_KEY = 'migration_paused_v2_done';

async function runFinishedToPausedMigration(): Promise<void> {
  const done = await AsyncStorage.getItem(MIGRATION_PAUSED_V2_KEY);
  if (done) return;
  const ids = await db.games.getAllIds();
  for (const id of ids) {
    const game = await db.games.get(id);
    if (game && (game.phase as string) === 'finished') {
      await db.games.put({ ...game, phase: 'paused' });
    }
  }
  await AsyncStorage.setItem(MIGRATION_PAUSED_V2_KEY, '1');
}

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
      if (!firebaseUser) {
        setCurrentUser(null);
        setLoading(false);
        return;
      }

      const extras = pendingExtras.current
        ? { displayName: pendingExtras.current.displayName, role: pendingExtras.current.role }
        : null;
      pendingExtras.current = null;
      const _t0 = Date.now();
      const { user, isNew } = await syncFirestoreUser(firebaseUser, extras);
      if (__DEV__) console.log(`[perf][auth] onAuthStateChanged.sync: ${Date.now() - _t0}ms`);

      // 起動をブロックしないよう Firestore のプランで先に表示する
      setCurrentUser(user);
      if (isNew) setIsNewUser(true);
      setLoading(false);

      // プッシュ通知トークンを登録（エラーは無視）
      registerForPushNotifications(firebaseUser.uid).catch(() => {});

      // RevenueCat はログイン後に非同期で初期化・プラン同期（起動をブロックしない）
      loginRevenueCatUser(firebaseUser.uid)
        .then(async (rcPlan) => {
          if (rcPlan === UserPlan.FREE) return;
          setCurrentUser((prev) => (prev ? { ...prev, plan: rcPlan } : prev));
          await syncPlanToFirestore(firebaseUser.uid, rcPlan);
          await updateAuthorNameInPosts(
            firebaseUser.uid,
            user.displayName,
            user.photoURL,
            rcPlan,
          );
        })
        .catch(() => {});
    });

    return unsubscribe;
  }, []);

  // ── 初回マイグレーション（全ユーザー・ゲスト問わず起動時に実行）─────────────
  useEffect(() => {
    runPausedMigration()
      .then(() => runFinishedToPausedMigration())
      .catch((e) => console.warn('migration error:', e));
  }, []);

  // ── ゲームデータ同期 ─────────────────────────────────────────────────────────
  // ログイン後、AsyncStorage が空の場合のみ Firestore からリストア
  useEffect(() => {
    if (currentUser?.uid) {
      syncGamesFromFirestore(currentUser.uid).catch((e) =>
        console.warn('syncGamesFromFirestore error:', e),
      );
    }
  }, [currentUser?.uid]);

  // ── メールアドレス + パスワード ログイン ────────────────────────────────────
  // Firebase Auth のみ実行。Firestore sync は onAuthStateChanged に一本化して二重呼び出しを防ぐ
  const signIn = useCallback(async (email: string, password: string) => {
    setLoading(true);
    const _tTotal = Date.now();
    try {
      const _tAuth = Date.now();
      await signInWithEmailPassword(email, password);
      if (__DEV__) console.log(`[perf][auth] signIn.firebaseAuth: ${Date.now() - _tAuth}ms`);
      if (__DEV__) console.log(`[perf][auth] signIn.TOTAL: ${Date.now() - _tTotal}ms`);
      // currentUser 更新と setLoading(false) は onAuthStateChanged が担当
    } catch (error) {
      if (__DEV__) console.log(`[perf][auth] signIn.TOTAL: ${Date.now() - _tTotal}ms`);
      setLoading(false); // 認証失敗時は onAuthStateChanged が発火しないため手動で解除
      if (error && typeof error === 'object' && 'code' in error) {
        throw error;
      }
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
      await signInWithEmailPassword(email, password);
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

  // ── アカウント削除 ────────────────────────────────────────────────────────────
  // Apple ガイドライン 5.1.1(v) 準拠：Firestore データ削除 → Firebase Auth アカウント削除
  const deleteAccount = useCallback(async () => {
    const firebaseUser = auth.currentUser;
    if (!firebaseUser) throw new Error('ログインしていません');

    // 先に Firestore ユーザードキュメントを削除（Auth セッションが有効なうちに）
    await deleteFirestoreUserData(firebaseUser.uid);

    // Firebase Auth アカウントを削除（セキュリティ操作：最近の認証が必要な場合あり）
    await fbDeleteUser(firebaseUser);

    // ローカル状態をクリア
    await clearBiometricCredentials().catch(() => {});
    await logoutRevenueCatUser().catch(() => {});
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
      await signInWithEmailPassword(creds.email, creds.password);
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
      deleteAccount,
    }),
    [currentUser, userPlan, loading, isNewUser, clearNewUser, refreshUser, signIn, signInWithUsername, signUp, signOut, signInWithPasskey, signInWithGoogle, signInWithApple, signInAsGuest, deleteAccount],
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
