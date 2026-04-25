/**
 * AI レポート API のエラーをユーザー向けメッセージと UI アクションヒントにマップする。
 *
 * サーバー (functions/src/index.ts) は `HttpsError(..., { reason })` の形で
 * 機械可読な理由コードを返す。クライアントはその reason を使って分岐する。
 */

import type { FunctionsError } from 'firebase/functions';

// =============================================================================
// 1. 理由コード（サーバーと 1:1 対応）
// =============================================================================

export type AIReportErrorReason =
  | 'unauthenticated'
  | 'plan_required'
  | 'daily_limit_exceeded'
  | 'invalid_report_type'
  | 'invalid_data'
  | 'payload_too_large'
  | 'ai_service_unavailable'
  | 'parse_error'
  | 'internal_error'
  | 'network_error'
  | 'unknown_error';

/** UI が次にとるべきアクションを表すヒント */
export type AIReportActionHint =
  | 'upgrade'
  | 'wait'
  | 'retry'
  | 'login'
  | 'none';

export interface AIReportErrorInfo {
  reason: AIReportErrorReason;
  title: string;
  message: string;
  subtext?: string;
  actionHint: AIReportActionHint;
}

// =============================================================================
// 2. ネットワークエラー判定
// =============================================================================

/**
 * 端末のネットワーク起因のエラーか判定する。
 * Firebase SDK の code と、React Native fetch の text メッセージの両方を見る。
 */
export function isNetworkError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const anyErr = err as { code?: string; message?: string };

  if (anyErr.code === 'functions/unavailable') return true;

  const msg = (anyErr.message ?? '').toLowerCase();
  if (!msg) return false;
  return (
    msg.includes('network request failed') ||
    msg.includes('failed to fetch') ||
    msg.includes('network error') ||
    msg.includes('econnrefused') ||
    msg.includes('timeout')
  );
}

// =============================================================================
// 3. マッピング
// =============================================================================

/**
 * サーバーから投げられた FunctionsError (またはネットワークエラー) を、
 * UI 表示用の AIReportErrorInfo に変換する。
 */
export function mapAIReportError(err: unknown): AIReportErrorInfo {
  if (isNetworkError(err)) {
    return {
      reason: 'network_error',
      title: '通信エラー',
      message: 'インターネット接続を確認してください。',
      subtext: '接続が不安定な可能性があります。再度お試しください。',
      actionHint: 'retry',
    };
  }

  // Firebase の FunctionsError は details に { reason } を持つ
  const fe = err as FunctionsError & {
    details?: { reason?: AIReportErrorReason };
    message?: string;
  };
  const reason: AIReportErrorReason =
    fe?.details?.reason ?? 'unknown_error';

  switch (reason) {
    case 'unauthenticated':
      return {
        reason,
        title: 'ログインが必要です',
        message: 'ログインしてからもう一度お試しください。',
        actionHint: 'login',
      };

    case 'plan_required':
      return {
        reason,
        title: 'プランのアップグレードが必要です',
        message: 'AI 分析レポートはライトプラン以上でご利用いただけます。',
        subtext: 'お得なプランを下記からご確認ください。',
        actionHint: 'upgrade',
      };

    case 'daily_limit_exceeded':
      return {
        reason,
        title: '本日の利用上限に達しました',
        message: '1 日の AI レポート利用回数の上限に達しました。',
        subtext: '日本時間 0:00 にリセットされます。',
        actionHint: 'wait',
      };

    case 'invalid_report_type':
    case 'invalid_data':
    case 'payload_too_large':
      return {
        reason,
        title: '入力エラー',
        message:
          reason === 'payload_too_large'
            ? 'データが大きすぎるため処理できませんでした。'
            : '入力データに問題があります。',
        subtext: 'アプリを最新バージョンに更新しても解決しない場合はサポートまでご連絡ください。',
        actionHint: 'none',
      };

    case 'ai_service_unavailable':
      return {
        reason,
        title: 'AI サービス一時停止中',
        message: 'AI サービスが一時的に利用できません。',
        subtext: '少し時間をおいて再度お試しください。',
        actionHint: 'retry',
      };

    case 'parse_error':
      return {
        reason,
        title: 'レポートの生成に失敗しました',
        message: 'AI 応答の解析に失敗しました。',
        subtext: 'もう一度お試しください。',
        actionHint: 'retry',
      };

    case 'internal_error':
    default:
      return {
        reason: reason ?? 'unknown_error',
        title: 'エラーが発生しました',
        message: '予期しないエラーが発生しました。',
        subtext: 'しばらくしてから再度お試しください。',
        actionHint: 'retry',
      };
  }
}
