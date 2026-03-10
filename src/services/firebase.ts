import { initializeApp, getApps, getApp, FirebaseApp } from 'firebase/app';
// @ts-ignore - getReactNativePersistence is available in React Native builds
import { getAuth, Auth, initializeAuth } from 'firebase/auth';
// @ts-ignore
import { getReactNativePersistence } from 'firebase/auth';
import { getFirestore, Firestore } from 'firebase/firestore';
import { getStorage, FirebaseStorage } from 'firebase/storage';
import { getFunctions, Functions } from 'firebase/functions';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

/**
 * Firebase configuration loaded from environment variables.
 *
 * Set these in your .env file (prefixed with EXPO_PUBLIC_ for client access):
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

// Initialize Firebase app (singleton)
let app: FirebaseApp;
if (getApps().length === 0) {
  app = initializeApp(firebaseConfig);
} else {
  app = getApp();
}

// Initialize Auth with React Native persistence
let auth: Auth;
if (Platform.OS === 'web') {
  auth = getAuth(app);
} else {
  auth = initializeAuth(app, {
    persistence: getReactNativePersistence(AsyncStorage),
  });
}

// Initialize Firestore
const db: Firestore = getFirestore(app);

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
  SCORES: 'scores',
  GAMES: 'games',
  MESSAGES: 'messages',
  NOTIFICATIONS: 'notifications',
  GROUPS: 'groups',
  GROUP_MESSAGES: 'messages',
} as const;

export { app, auth, db, storage, functions };
