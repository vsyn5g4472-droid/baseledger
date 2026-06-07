import {
  EmailAuthProvider,
  signInWithCredential,
  signInWithCustomToken,
  signInWithEmailAndPassword,
} from 'firebase/auth';
import { httpsCallable } from 'firebase/functions';
import { auth, functions } from '../firebase';
import { createAuthErrorFromRest } from '../../utils/firebaseErrors';

/**
 * メール+パスワードログイン。
 * REST API で認証後、Cloud Function 経由で custom token に交換して SDK セッションを確立する。
 */
export async function signInWithEmailPassword(email: string, password: string): Promise<void> {
  const apiKey = process.env.EXPO_PUBLIC_FIREBASE_API_KEY;
  if (!apiKey) {
    throw new Error('Firebase API キーが設定されていません。');
  }

  const normalizedEmail = email.trim();

  const response = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: normalizedEmail,
        password,
        returnSecureToken: true,
      }),
    },
  );
  const data = await response.json();
  if (data.error) {
    throw createAuthErrorFromRest(data.error);
  }

  try {
    const exchange = httpsCallable<{ idToken: string }, { customToken: string }>(
      functions,
      'createCustomTokenFromIdToken',
    );
    const { data: tokenData } = await exchange({ idToken: data.idToken });
    await signInWithCustomToken(auth, tokenData.customToken);
  } catch {
    // Cloud Function 未デプロイ時のフォールバック
    try {
      await signInWithCredential(auth, EmailAuthProvider.credential(normalizedEmail, password));
    } catch {
      await signInWithEmailAndPassword(auth, normalizedEmail, password);
    }
  }
}
