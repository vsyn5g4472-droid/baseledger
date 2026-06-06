import { initializeApp, getApps, getApp, FirebaseApp } from 'firebase/app';
import { getAuth, Auth, initializeAuth, inMemoryPersistence } from 'firebase/auth';
import { initializeFirestore, getFirestore, memoryLocalCache, Firestore } from 'firebase/firestore';
import { getStorage, FirebaseStorage } from 'firebase/storage';
import { getFunctions, Functions } from 'firebase/functions';
import { Platform } from 'react-native';

/**
 * Firebase configuration loaded from environment variables.
 * .env ファイルに以下の値を設定してください:
 *   EXPO_PUBLIC_FIREBASE_API_KEY=...
 *   EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN=...
 *   EXPO_PUBLIC_FIREBASE_PROJECT_ID=...
 *   EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET=...
 *   EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=...
 *   EXPO_PUBLIC_FIREBASE_APP_ID=...
 */
const firebaseConfig = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID,
};

// Firebase app はシングルトン
const app: FirebaseApp = getApps().length === 0
  ? initializeApp(firebaseConfig)
  : getApp();

// Auth のシングルトン管理。
// initializeAuth は初回のみ呼ぶ必要があり、2回目以降は getAuth() で取得する。
// try/catch で両方を安全に処理する。
// TODO(切り分け): Step 2 — ログイン後クラッシュ調査のため inMemoryPersistence に一時変更（診断用）
let auth: Auth;
try {
  auth = Platform.OS === 'web'
    ? getAuth(app)
    : initializeAuth(app, { persistence: inMemoryPersistence });
} catch {
  // 既に初期化済みの場合（hot reload 等）は getAuth() で既存インスタンスを取得
  auth = getAuth(app);
}

// Initialize Firestore with memory cache (persistentLocalCache は RN 非対応)
let db: Firestore;
try {
  db = initializeFirestore(app, { localCache: memoryLocalCache() });
} catch {
  db = getFirestore(app);
}

// Initialize Storage
const storage: FirebaseStorage = getStorage(app);

// Initialize Cloud Functions
const functions: Functions = getFunctions(app);

// Collection name constants for type-safe references
export const COLLECTIONS = {
  USERS: 'users',
  FOLLOWS: 'follows',
  POSTS: 'posts',
  COMMENTS: 'comments',
  LIKES: 'likes',
  TEAMS: 'teams',
  TEAM_MEMBERS: 'members',
  TEAM_PLAYERS: 'players',
  SCORES: 'scores',
  GAMES: 'games',
  MESSAGES: 'messages',
  NOTIFICATIONS: 'notifications',
  GROUPS: 'groups',
  GROUP_MESSAGES: 'messages',
  AI_REPORTS: 'aiReports',
  SPOT_AT_BATS: 'spotAtBats',
} as const;

export { app, auth, db, storage, functions };
