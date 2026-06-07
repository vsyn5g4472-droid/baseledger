/**
 * Firebase Auth エラーコードを日本語メッセージに変換する。
 *
 * Firebase のエラーは error.code に "auth/..." 形式で格納される。
 * ユーザーに表示するメッセージは技術的な用語を避け、操作を促す文言にする。
 */

const ERROR_MESSAGES: Record<string, string> = {
  // ── ログイン系 ──────────────────────────────────────────────────────────────
  'auth/invalid-email':
    'メールアドレスの形式が正しくありません。',
  'auth/user-not-found':
    'このメールアドレスは登録されていません。',
  'auth/wrong-password':
    'パスワードが間違っています。',
  'auth/invalid-credential':
    'メールアドレスまたはパスワードが正しくありません。',
  'auth/user-disabled':
    'このアカウントは無効化されています。管理者にお問い合わせください。',
  'auth/too-many-requests':
    'ログイン試行が多すぎます。しばらく時間をおいてから再試行してください。',

  // ── 新規登録系 ──────────────────────────────────────────────────────────────
  'auth/email-already-in-use':
    'このメールアドレスはすでに登録されています。',
  'auth/weak-password':
    'パスワードは6文字以上で設定してください。',
  'auth/operation-not-allowed':
    'このログイン方法は現在使用できません。',

  // ── ネットワーク・設定系 ────────────────────────────────────────────────────
  'auth/network-request-failed':
    'ネットワークエラーが発生しました。接続を確認して再試行してください。',
  'auth/internal-error':
    'サーバーエラーが発生しました。しばらくしてから再試行してください。',
  'auth/app-not-authorized':
    'アプリの設定エラーです。Firebase の設定を確認してください。',
  'auth/api-key-not-valid':
    'Firebase の API キーが設定されていません。.env を確認してください。',
  'auth/configuration-not-found':
    'Firebase が正しく設定されていません。.env ファイルを確認してください。',

  // ── ソーシャルログイン系 ────────────────────────────────────────────────────
  'auth/account-exists-with-different-credential':
    'このメールアドレスは別のログイン方法で登録されています。',
  'auth/popup-closed-by-user':
    'ログインがキャンセルされました。',
  'auth/cancelled-popup-request':
    'ログイン操作がキャンセルされました。',

  // ── パスワードリセット系 ────────────────────────────────────────────────────
  'auth/expired-action-code':
    'リンクの有効期限が切れています。再度お試しください。',
  'auth/invalid-action-code':
    '無効なリンクです。再度お試しください。',
};

/**
 * Firebase エラーオブジェクト（または任意の Error）を日本語メッセージに変換する。
 *
 * @param error - catch で受け取った任意のエラー
 * @returns ユーザーに表示する日本語メッセージ
 */
/** Firebase Auth REST API のエラーコードを Firebase Auth エラーに変換する */
const REST_TO_AUTH_CODE: Record<string, string> = {
  EMAIL_NOT_FOUND: 'auth/user-not-found',
  INVALID_PASSWORD: 'auth/wrong-password',
  INVALID_LOGIN_CREDENTIALS: 'auth/invalid-credential',
  USER_DISABLED: 'auth/user-disabled',
  TOO_MANY_ATTEMPTS_TRY_LATER: 'auth/too-many-requests',
};

export function createAuthErrorFromRest(restError: { message: string }): Error & { code: string } {
  const code = REST_TO_AUTH_CODE[restError.message] ?? 'auth/invalid-credential';
  const message = ERROR_MESSAGES[code] ?? restError.message;
  const err = new Error(message) as Error & { code: string };
  err.code = code;
  return err;
}

export function getFirebaseErrorMessage(error: unknown): string {
  if (error && typeof error === 'object' && 'code' in error) {
    const code = (error as { code: string }).code;
    if (ERROR_MESSAGES[code]) {
      return ERROR_MESSAGES[code];
    }
    // 未定義のコードはコードをそのまま表示（開発時のデバッグ用）
    return `エラーが発生しました（${code}）`;
  }

  if (error instanceof Error) {
    return error.message || '予期しないエラーが発生しました。';
  }

  return '予期しないエラーが発生しました。';
}
