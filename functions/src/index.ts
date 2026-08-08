import { onCall, HttpsError } from "firebase-functions/v2/https";
import { onDocumentCreated } from "firebase-functions/v2/firestore";
import { defineSecret } from "firebase-functions/params";
import * as admin from "firebase-admin";
import { FieldValue } from "firebase-admin/firestore";
import { Expo } from "expo-server-sdk";
import {
  SYSTEM_PROMPT,
  REPORT_TYPES,
  isValidReportType,
  validateData,
  buildPromptForReportType,
  type ReportType,
  PREDICTION_SYSTEM_PROMPT,
  isValidPredictionType,
  validatePredictionData,
  buildPromptForPredictionType,
  type PredictionType,
} from "./prompts";

// =============================================================================
// 0. Firebase Admin 初期化
// =============================================================================

if (admin.apps.length === 0) {
  admin.initializeApp();
}
const db = admin.firestore();

// =============================================================================
// 1. 定数 & Secret
// =============================================================================

const anthropicApiKey = defineSecret("ANTHROPIC_API_KEY");

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const MODEL = "claude-haiku-4-5-20251001";

/** 1 リクエストあたりのデータ上限（20 KB） */
const MAX_DATA_SIZE_BYTES = 20 * 1024;

/** AI レポートを利用できるプラン（無料は月次上限でクライアント側も制限） */
const ALLOWED_PLANS = new Set(["free", "light", "standard", "pro"]);

/** AI 予測を利用できるプラン（PRO のみ） */
const PREDICTION_ALLOWED_PLANS = new Set(["pro"]);
const PREDICTION_DAILY_LIMIT = 30;

/**
 * Phase 1 暫定: ユーザーあたりの 1 日の上限呼び出し回数
 * 将来、`PlanLimits` 構造に移行して plan 別に変える
 */
const DAILY_CALL_LIMIT = 20;

// =============================================================================
// 2. 型定義
// =============================================================================

interface AIReportCore {
  overall: string;
  improvements: Array<{ aspect: string; detail: string }>;
  nextAdvice: string;
  highlights: string;
  generatedAt: number;
}

interface AIPredictionCore {
  pitchType?: string;
  zone?: string;
  hitDirection?: string;
  distance?: string;
  confidence: string;
  reasoning: string;
  generatedAt: number;
}

interface AIReportResponse extends AIReportCore {
  usage: {
    used: number;
    limit: number;
    remaining: number;
  };
}

// =============================================================================
// 3. ヘルパー
// =============================================================================

/** Asia/Tokyo タイムゾーンでの YYYY-MM-DD を返す（日次リセットのキーに使用） */
function todayJST(): string {
  // "sv-SE" ロケールは ISO-8601 (YYYY-MM-DD) 形式の日付を返す
  return new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Tokyo" });
}

function usageDocId(uid: string, day: string): string {
  return `${uid}_${day}`;
}

function byteLen(v: unknown): number {
  return Buffer.byteLength(JSON.stringify(v ?? ""), "utf8");
}

/**
 * 指定 uid のプランを Firestore から取得する。
 * 欠損やドキュメント不在の場合は 'free' を返す。
 */
async function fetchUserPlan(uid: string): Promise<string> {
  const snap = await db.collection("users").doc(uid).get();
  if (!snap.exists) return "free";
  const data = snap.data() ?? {};
  const plan = typeof data.plan === "string" ? data.plan : "free";
  return plan;
}

// =============================================================================
// 4. Anthropic 呼び出し（Emulator 用モック切替付き）
// =============================================================================

async function callAnthropic(userPrompt: string, apiKey: string): Promise<AIReportCore> {
  // Emulator 環境 + MOCK_ANTHROPIC=true の場合は実 API を叩かず固定レスポンスを返す
  if (
    process.env.FUNCTIONS_EMULATOR === "true" &&
    process.env.MOCK_ANTHROPIC === "true"
  ) {
    return {
      overall: "[MOCK] テスト用のレポート総評です。",
      improvements: [
        { aspect: "テスト改善1", detail: "[MOCK] 改善アドバイスです。" },
      ],
      nextAdvice: "[MOCK] 次回へのアドバイスです。",
      highlights: "[MOCK] ハイライトです。",
      generatedAt: Date.now(),
    };
  }

  if (!apiKey) {
    throw new HttpsError("internal", "予期しないエラーが発生しました。再度お試しください", {
      reason: "internal_error",
    });
  }

  const response = await fetch(ANTHROPIC_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: userPrompt }],
    }),
  });

  if (!response.ok) {
    const errBody = await response.text().catch(() => "");
    console.error("[generateAIReport] Anthropic API error", response.status, errBody);
    throw new HttpsError("internal", "AI サービスが一時的に利用できません。時間をおいて再度お試しください", {
      reason: "ai_service_unavailable",
    });
  }

  const data = await response.json();
  const rawText: string = data?.content?.[0]?.text ?? "";
  const jsonMatch = rawText.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new HttpsError("internal", "AI レスポンスの解析に失敗しました。再度お試しください", {
      reason: "parse_error",
    });
  }

  const parsed = JSON.parse(jsonMatch[0]);
  return {
    overall: parsed.overall ?? "",
    improvements: Array.isArray(parsed.improvements) ? parsed.improvements : [],
    nextAdvice: parsed.nextAdvice ?? "",
    highlights: parsed.highlights ?? "",
    generatedAt: Date.now(),
  };
}

async function callAnthropicForPrediction(
  userPrompt: string,
  apiKey: string,
): Promise<AIPredictionCore> {
  if (
    process.env.FUNCTIONS_EMULATOR === "true" &&
    process.env.MOCK_ANTHROPIC === "true"
  ) {
    return {
      pitchType: "[MOCK] ストレート",
      zone: "[MOCK] ゾーン8",
      confidence: "medium",
      reasoning: "[MOCK] テスト用の予測です。",
      generatedAt: Date.now(),
    };
  }

  if (!apiKey) {
    throw new HttpsError("internal", "予期しないエラーが発生しました。再度お試しください", {
      reason: "internal_error",
    });
  }

  const response = await fetch(ANTHROPIC_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 512,
      system: PREDICTION_SYSTEM_PROMPT,
      messages: [{ role: "user", content: userPrompt }],
    }),
  });

  if (!response.ok) {
    const errBody = await response.text().catch(() => "");
    console.error("[generateAIPrediction] Anthropic API error", response.status, errBody);
    throw new HttpsError("internal", "AI サービスが一時的に利用できません。時間をおいて再度お試しください", {
      reason: "ai_service_unavailable",
    });
  }

  const data = await response.json();
  const rawText: string = data?.content?.[0]?.text ?? "";
  const jsonMatch = rawText.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new HttpsError("internal", "AI レスポンスの解析に失敗しました。再度お試しください", {
      reason: "parse_error",
    });
  }

  const parsed = JSON.parse(jsonMatch[0]);
  return {
    pitchType:    parsed.pitchType,
    zone:         parsed.zone,
    hitDirection: parsed.hitDirection,
    distance:     parsed.distance,
    confidence:   parsed.confidence ?? "medium",
    reasoning:    parsed.reasoning ?? "",
    generatedAt:  Date.now(),
  };
}

// =============================================================================
// 5. Cloud Function 本体
// =============================================================================

export const generateAIReport = onCall(
  { secrets: [anthropicApiKey], maxInstances: 3 },
  async (request): Promise<AIReportResponse> => {
    // ── 5-1. 認証チェック ─────────────────────────────────────
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "ログインしてからもう一度お試しください", {
        reason: "unauthenticated",
      });
    }
    const uid = request.auth.uid;

    // ── 5-2. 入力検証 ─────────────────────────────────────────
    const payload = request.data as { reportType?: unknown; data?: unknown };
    const { reportType, data } = payload ?? {};

    if (!isValidReportType(reportType)) {
      throw new HttpsError(
        "invalid-argument",
        `reportType が不正です。許可される値: ${REPORT_TYPES.join(", ")}`,
        { reason: "invalid_report_type" },
      );
    }

    const validationErr = validateData(reportType as ReportType, data);
    if (validationErr) {
      throw new HttpsError("invalid-argument", `入力データが不正です: ${validationErr}`, {
        reason: "invalid_data",
      });
    }

    if (byteLen(data) > MAX_DATA_SIZE_BYTES) {
      throw new HttpsError(
        "invalid-argument",
        `データサイズが上限（${MAX_DATA_SIZE_BYTES} bytes）を超えています`,
        { reason: "payload_too_large" },
      );
    }

    // ── 5-3. プラン検証（Firestore から取得） ────────────────
    const plan = await fetchUserPlan(uid);
    if (!ALLOWED_PLANS.has(plan)) {
      throw new HttpsError(
        "permission-denied",
        "AI レポートをご利用いただけません",
        { reason: "plan_required", currentPlan: plan },
      );
    }

    // ── 5-4. JST 日次レート制限（原子的増加） ─────────────────
    const day = todayJST();
    const usageRef = db.collection("aiUsageDaily").doc(usageDocId(uid, day));

    const usage = await db.runTransaction(async (tx) => {
      const snap = await tx.get(usageRef);
      const current = snap.exists ? (snap.data()?.count ?? 0) : 0;
      if (current >= DAILY_CALL_LIMIT) {
        throw new HttpsError(
          "resource-exhausted",
          `1 日の利用回数（${DAILY_CALL_LIMIT} 回）に達しました。日本時間 0:00 にリセットされます`,
          { reason: "daily_limit_exceeded", used: current, limit: DAILY_CALL_LIMIT },
        );
      }
      const next = current + 1;
      tx.set(
        usageRef,
        {
          uid,
          day,
          count: next,
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true },
      );
      return { used: next, limit: DAILY_CALL_LIMIT };
    });

    // ── 5-5. プロンプト構築 & Anthropic 呼び出し ─────────────
    const userPrompt = buildPromptForReportType(reportType as ReportType, data);

    let report: AIReportCore;
    try {
      report = await callAnthropic(userPrompt, anthropicApiKey.value());
    } catch (err) {
      // Anthropic 呼び出しに失敗した場合、利用回数をロールバック
      try {
        await usageRef.set(
          { count: Math.max(0, usage.used - 1) },
          { merge: true },
        );
      } catch (rollbackErr) {
        console.warn("[generateAIReport] usage rollback failed", rollbackErr);
      }
      throw err;
    }

    return {
      ...report,
      usage: {
        used: usage.used,
        limit: usage.limit,
        remaining: Math.max(0, usage.limit - usage.used),
      },
    };
  },
);

export const generateAIPrediction = onCall(
  { secrets: [anthropicApiKey], maxInstances: 3 },
  async (request): Promise<AIPredictionCore> => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "ログインしてからもう一度お試しください", {
        reason: "unauthenticated",
      });
    }
    const uid = request.auth.uid;

    const payload = request.data as { predictionType?: unknown; data?: unknown };
    const { predictionType, data } = payload ?? {};

    if (!isValidPredictionType(predictionType)) {
      throw new HttpsError("invalid-argument", "predictionType が不正です", {
        reason: "invalid_prediction_type",
      });
    }
    const validationErr = validatePredictionData(predictionType as PredictionType, data);
    if (validationErr) {
      throw new HttpsError("invalid-argument", `入力データが不正です: ${validationErr}`, {
        reason: "invalid_data",
      });
    }
    if (byteLen(data) > MAX_DATA_SIZE_BYTES) {
      throw new HttpsError("invalid-argument", "データサイズが上限を超えています", {
        reason: "payload_too_large",
      });
    }

    const plan = await fetchUserPlan(uid);
    if (!PREDICTION_ALLOWED_PLANS.has(plan)) {
      throw new HttpsError("permission-denied", "AI 試合予測は PRO プランでご利用いただけます", {
        reason: "plan_required", currentPlan: plan,
      });
    }

    const day = todayJST();
    const usageRef = db.collection("aiPredictionDaily").doc(usageDocId(uid, day));
    await db.runTransaction(async (tx) => {
      const snap = await tx.get(usageRef);
      const current = snap.exists ? (snap.data()?.count ?? 0) : 0;
      if (current >= PREDICTION_DAILY_LIMIT) {
        throw new HttpsError(
          "resource-exhausted",
          `1 日の予測回数（${PREDICTION_DAILY_LIMIT} 回）に達しました。日本時間 0:00 にリセットされます`,
          { reason: "daily_limit_exceeded" },
        );
      }
      tx.set(
        usageRef,
        { uid, day, count: current + 1, updatedAt: FieldValue.serverTimestamp() },
        { merge: true },
      );
    });

    const userPrompt = buildPromptForPredictionType(predictionType as PredictionType, data);
    return await callAnthropicForPrediction(userPrompt, anthropicApiKey.value());
  },
);

// =============================================================================
// 6. メンバー表画像からスタメン抽出
// =============================================================================

interface LineupPlayer {
  order: number;
  number: string;
  name: string;
  position: string;
}

export const extractLineupFromImage = onCall(
  { secrets: [anthropicApiKey], maxInstances: 3 },
  async (request): Promise<{ players: LineupPlayer[] }> => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "ログインしてからもう一度お試しください", {
        reason: "unauthenticated",
      });
    }

    const { imageBase64, mimeType } = request.data as {
      imageBase64?: unknown;
      mimeType?: unknown;
    };

    if (typeof imageBase64 !== "string" || !imageBase64) {
      throw new HttpsError("invalid-argument", "imageBase64 が不正です");
    }
    if (typeof mimeType !== "string" || !mimeType) {
      throw new HttpsError("invalid-argument", "mimeType が不正です");
    }

    const apiKey = anthropicApiKey.value();
    if (!apiKey) {
      throw new HttpsError("internal", "予期しないエラーが発生しました。再度お試しください");
    }

    // Emulator モック
    if (
      process.env.FUNCTIONS_EMULATOR === "true" &&
      process.env.MOCK_ANTHROPIC === "true"
    ) {
      return {
        players: [
          { order: 1, number: "1", name: "[MOCK] 選手A", position: "CF" },
          { order: 2, number: "5", name: "[MOCK] 選手B", position: "SS" },
        ],
      };
    }

    const prompt = `このメンバー表・スタメン表から選手情報を読み取り、以下のJSON形式のみで返してください。説明文は不要です。

【読み取り指示】
- 縦書き・横書きどちらのレイアウトにも対応すること
- 電光掲示板・手書き・印刷物など、どの形式の画像にも対応すること
- 名前が縦方向に並んでいる場合は、上から順に打順として読み取ること
- 背番号・打順・ポジション・名前が混在していても、各項目を正しく分類すること

{
  "players": [
    { "order": 1, "number": "背番号", "name": "選手名", "position": "ポジション略称" }
  ]
}

守備位置番号とポジション略称の対応:
1=P, 2=C, 3=1B, 4=2B, 5=3B, 6=SS, 7=LF, 8=CF, 9=RF, DH=DH, 10=DH

打順が不明な場合は記載順に1から割り当てて。
守備位置が番号で書かれている場合は上記の対応表でポジション略称に変換して。
守備位置が不明な場合は空文字にして。`;

    const response = await fetch(ANTHROPIC_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 1024,
        messages: [{
          role: "user",
          content: [
            {
              type: "image",
              source: {
                type: "base64",
                media_type: mimeType,
                data: imageBase64,
              },
            },
            { type: "text", text: prompt },
          ],
        }],
      }),
    });

    if (!response.ok) {
      const errBody = await response.text().catch(() => "");
      console.error("[extractLineupFromImage] Anthropic API error", response.status, errBody);
      throw new HttpsError("internal", "AI サービスが一時的に利用できません。時間をおいて再度お試しください");
    }

    const data = await response.json();
    const text: string = data?.content?.[0]?.text ?? "{}";
    try {
      const parsed = JSON.parse(text);
      return { players: Array.isArray(parsed.players) ? parsed.players : [] };
    } catch {
      const match = text.match(/\{[\s\S]*\}/);
      if (match) {
        try {
          const parsed = JSON.parse(match[0]);
          return { players: Array.isArray(parsed.players) ? parsed.players : [] };
        } catch { /* fall through */ }
      }
      return { players: [] };
    }
  },
);

// =============================================================================
// 7. プッシュ通知トリガー
// =============================================================================

const expoClient = new Expo();

export const onNotificationCreated = onDocumentCreated(
  "notifications/{notifId}",
  async (event) => {
    const data = event.data?.data();
    if (!data) return;

    const { userId, type, fromUserId } = data as {
      userId: string;
      type: string;
      fromUserId: string | null;
    };

    // 受信者の pushToken を取得
    const userSnap = await db.collection("users").doc(userId).get();
    const pushToken = userSnap.data()?.pushToken as string | undefined;
    if (!pushToken || !Expo.isExpoPushToken(pushToken)) return;

    // 送信者名を取得
    let fromUserName = "誰か";
    if (fromUserId) {
      const fromSnap = await db.collection("users").doc(fromUserId).get();
      fromUserName =
        (fromSnap.data()?.displayName as string | undefined) ??
        (fromSnap.data()?.username as string | undefined) ??
        "誰か";
    }

    // type 別タイトル・本文
    const messageMap: Record<string, { title: string; body: string }> = {
      follow:     { title: "フォローされました",     body: `${fromUserName}さんがあなたをフォローしました` },
      like:       { title: "いいねされました",       body: `${fromUserName}さんが投稿にいいねしました` },
      comment:    { title: "コメントが届きました",   body: `${fromUserName}さんがコメントしました` },
      dm:         { title: "メッセージが届きました", body: `${fromUserName}さんからメッセージです` },
      teamInvite: { title: "チームへの招待",         body: "チームに招待されました" },
    };
    const msg = messageMap[type];
    if (!msg) return;

    await expoClient.sendPushNotificationsAsync([{
      to: pushToken,
      title: msg.title,
      body: msg.body,
      sound: "default",
    }]);
  },
);

// =============================================================================
// 8. 招待コードの利用（特典付与はサーバー側でのみ実行）
// =============================================================================

/** 招待ボーナスの上限（クライアント表示と一致させること） */
const INVITE_AI_REPORT_BONUS_MAX = 5;   // 1〜5人目: AI分析+1
const INVITE_GAME_PDF_BONUS_MAX = 3;    // 1〜3人目: 試合記録+1・PDF共有+1
const INVITE_STANDARD_PLAN_COUNT = 10;  // 10人達成: STANDARD 1ヶ月

interface RedeemInviteCodeResult {
  applied: boolean;
  reason?: "device_already_used" | "own_code" | "already_used";
}

export const redeemInviteCode = onCall(
  { maxInstances: 3 },
  async (request): Promise<RedeemInviteCodeResult> => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "ログインしてからもう一度お試しください", {
        reason: "unauthenticated",
      });
    }
    const uid = request.auth.uid;

    const { inviteCode, deviceId } = request.data as {
      inviteCode?: unknown;
      deviceId?: unknown;
    };
    if (typeof inviteCode !== "string" || inviteCode.length === 0 || inviteCode.length > 64) {
      throw new HttpsError("invalid-argument", "招待コードが不正です", {
        reason: "invalid_invite_code",
      });
    }
    if (typeof deviceId !== "string" || deviceId.length === 0 || deviceId.length > 128) {
      throw new HttpsError("invalid-argument", "デバイスIDが不正です", {
        reason: "invalid_device_id",
      });
    }

    const codeRef = db.collection("inviteCodes").doc(inviteCode);
    const deviceRef = db.collection("deviceRegistry").doc(deviceId);
    const newUserRef = db.collection("users").doc(uid);

    return await db.runTransaction(async (tx): Promise<RedeemInviteCodeResult> => {
      const codeSnap = await tx.get(codeRef);
      if (!codeSnap.exists) {
        throw new HttpsError("not-found", "招待コードが見つかりません", {
          reason: "invite_code_not_found",
        });
      }
      const codeData = codeSnap.data() ?? {};
      const ownerId = codeData.ownerId as string | undefined;
      if (!ownerId) {
        throw new HttpsError("failed-precondition", "招待コードが不正です", {
          reason: "invalid_invite_code",
        });
      }

      // 同一デバイスからの複数アカウント作成による特典の多重取得を防ぐ
      const deviceSnap = await tx.get(deviceRef);
      if (deviceSnap.exists) return { applied: false, reason: "device_already_used" };

      if (ownerId === uid) return { applied: false, reason: "own_code" };

      const usedBy: string[] = Array.isArray(codeData.usedBy) ? codeData.usedBy : [];
      if (usedBy.includes(uid)) return { applied: false, reason: "already_used" };

      const ownerRef = db.collection("users").doc(ownerId);
      const ownerSnap = await tx.get(ownerRef);
      if (!ownerSnap.exists) {
        throw new HttpsError("failed-precondition", "招待コードの所有者が見つかりません", {
          reason: "owner_not_found",
        });
      }
      const currentCount = (ownerSnap.data()?.inviteCount as number | undefined) ?? 0;
      const newCount = currentCount + 1;

      // ── 書き込み ──────────────────────────────────────────
      tx.update(codeRef, { usedBy: FieldValue.arrayUnion(uid) });
      tx.set(deviceRef, { userId: uid, createdAt: FieldValue.serverTimestamp() });

      // 招待された側のボーナス
      tx.update(newUserRef, {
        bonusAiReports: FieldValue.increment(1),
        bonusGames: FieldValue.increment(1),
        bonusPdfShares: FieldValue.increment(1),
      });

      // 招待した側のボーナス
      const ownerUpdate: Record<string, unknown> = {
        inviteCount: FieldValue.increment(1),
      };
      if (newCount <= INVITE_AI_REPORT_BONUS_MAX) {
        ownerUpdate.bonusAiReports = FieldValue.increment(1);
      }
      if (newCount <= INVITE_GAME_PDF_BONUS_MAX) {
        ownerUpdate.bonusGames = FieldValue.increment(1);
        ownerUpdate.bonusPdfShares = FieldValue.increment(1);
      }
      if (newCount === INVITE_STANDARD_PLAN_COUNT) {
        const expires = new Date();
        expires.setDate(expires.getDate() + 30);
        ownerUpdate.plan = "standard";
        ownerUpdate.standardExpiresAt = admin.firestore.Timestamp.fromDate(expires);
      }
      tx.update(ownerRef, ownerUpdate);

      return { applied: true };
    });
  },
);

// =============================================================================
// Auth: REST API で取得した idToken を custom token に交換
// =============================================================================

export const createCustomTokenFromIdToken = onCall(async (request) => {
  const idToken = request.data?.idToken;
  if (!idToken || typeof idToken !== "string") {
    throw new HttpsError("invalid-argument", "idToken is required");
  }

  try {
    const decoded = await admin.auth().verifyIdToken(idToken);
    const customToken = await admin.auth().createCustomToken(decoded.uid);
    return { customToken };
  } catch {
    throw new HttpsError("unauthenticated", "Invalid idToken");
  }
});
