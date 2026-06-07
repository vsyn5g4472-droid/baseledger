import { fetchSignInMethodsForEmail } from 'firebase/auth';
import { auth } from '../firebase';
import { createAuthErrorFromRest } from '../../utils/firebaseErrors';

export type LoginFailureHint = 'apple_only' | 'password_reset_available' | 'unknown';

/** ログイン失敗時に、メールアドレスの登録方法を判別する */
export async function analyzeLoginFailure(email: string): Promise<LoginFailureHint> {
  try {
    const methods = await fetchSignInMethodsForEmail(auth, email.trim());
    if (methods.includes('apple.com') && !methods.includes('password')) {
      return 'apple_only';
    }
    if (methods.includes('password')) {
      return 'password_reset_available';
    }
  } catch {
    // 判別できない場合は再設定メール送信を案内
  }
  return 'unknown';
}

/** パスワード再設定メールを送信する（Firebase Auth REST API） */
export async function sendPasswordResetEmailToUser(email: string): Promise<void> {
  const apiKey = process.env.EXPO_PUBLIC_FIREBASE_API_KEY;
  if (!apiKey) {
    throw new Error('Firebase API キーが設定されていません。');
  }

  const response = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:sendOobCode?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        requestType: 'PASSWORD_RESET',
        email: email.trim(),
      }),
    },
  );
  const data = await response.json();
  if (data.error) {
    throw createAuthErrorFromRest(data.error);
  }
}
