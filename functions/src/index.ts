import { onCall, HttpsError } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";
import * as admin from "firebase-admin";
import { FieldValue } from "firebase-admin/firestore";
import {
  SYSTEM_PROMPT,
  REPORT_TYPES,
  isValidReportType,
  validateData,
  buildPromptForReportType,
  type ReportType,
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

/** AI レポートを利用できるプラン */
const ALLOWED_PLANS = new Set(["light", "standard", "pro"]);

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
        "AI レポートはライトプラン以上でご利用いただけます",
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
