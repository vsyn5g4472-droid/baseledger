/**
 * Google Custom Search Service — 球歴.com 専用
 *
 * 安全設計:
 *  - 検索クエリに必ず `site:kyureki.com` を付与
 *  - 1日 90回のハードリミット（無料枠 100回を超えない）
 *  - 24時間キャッシュで API 消費を最小化
 *  - 通信失敗時はカウントを増やさない
 *
 * 必要な環境変数:
 *  EXPO_PUBLIC_GOOGLE_SEARCH_API_KEY — Google Cloud の API キー
 *  EXPO_PUBLIC_GOOGLE_SEARCH_CX     — カスタム検索エンジン ID
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { Alert } from 'react-native';

// ── Constants ─────────────────────────────────────────────────────────────────

const DAILY_LIMIT = 90;
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 時間

const KYUREKI_SITE_FILTER = 'site:kyureki.com';
const SEARCH_API_BASE = 'https://www.googleapis.com/customsearch/v1';

const KEYS = {
  DAILY_COUNT: '@kyureki_search/daily_count',
  LAST_DATE:   '@kyureki_search/last_date',
  CACHE:       '@kyureki_search/cache/',
} as const;

// ── Types ─────────────────────────────────────────────────────────────────────

export interface KyurekiSearchItem {
  title:       string;
  snippet:     string;
  link:        string;
  displayLink: string;
}

export interface KyurekiSearchResponse {
  query:     string;
  items:     KyurekiSearchItem[];
  fromCache: boolean;
  cachedAt?: number;
}

interface CachedEntry {
  items:     KyurekiSearchItem[];
  cachedAt:  number;
}

// ── Storage helpers ───────────────────────────────────────────────────────────

function todayString(): string {
  return new Date().toISOString().slice(0, 10); // "YYYY-MM-DD"
}

/**
 * 今日の呼び出し回数を返す（日付が変わっていればリセット）。
 */
async function readDailyCount(): Promise<number> {
  const [storedDate, storedCount] = await AsyncStorage.multiGet([
    KEYS.LAST_DATE,
    KEYS.DAILY_COUNT,
  ]);
  const date  = storedDate[1]  ?? '';
  const count = parseInt(storedCount[1] ?? '0', 10);
  const today = todayString();

  if (date !== today) {
    // 日付が変わった → カウントをリセット
    await AsyncStorage.multiSet([
      [KEYS.LAST_DATE,   today],
      [KEYS.DAILY_COUNT, '0'],
    ]);
    return 0;
  }
  return isNaN(count) ? 0 : count;
}

async function incrementDailyCount(current: number): Promise<void> {
  await AsyncStorage.multiSet([
    [KEYS.LAST_DATE,   todayString()],
    [KEYS.DAILY_COUNT, String(current + 1)],
  ]);
}

// ── Cache helpers ─────────────────────────────────────────────────────────────

function cacheKey(query: string): string {
  // クエリを短縮してキーを作成（AsyncStorage のキー長制限を回避）
  const normalized = query.trim().toLowerCase().replace(/\s+/g, '_');
  return KEYS.CACHE + normalized.slice(0, 80);
}

async function readCache(query: string): Promise<CachedEntry | null> {
  try {
    const raw = await AsyncStorage.getItem(cacheKey(query));
    if (!raw) return null;
    const entry: CachedEntry = JSON.parse(raw);
    if (Date.now() - entry.cachedAt > CACHE_TTL_MS) {
      // 期限切れ
      await AsyncStorage.removeItem(cacheKey(query));
      return null;
    }
    return entry;
  } catch {
    return null;
  }
}

async function writeCache(query: string, items: KyurekiSearchItem[]): Promise<void> {
  const entry: CachedEntry = { items, cachedAt: Date.now() };
  await AsyncStorage.setItem(cacheKey(query), JSON.stringify(entry));
}

// ── API call ──────────────────────────────────────────────────────────────────

async function callGoogleSearchAPI(query: string): Promise<KyurekiSearchItem[]> {
  const apiKey = process.env.EXPO_PUBLIC_GOOGLE_SEARCH_API_KEY;
  const cx     = process.env.EXPO_PUBLIC_GOOGLE_SEARCH_CX;

  if (!apiKey || !cx) {
    throw new Error('EXPO_PUBLIC_GOOGLE_SEARCH_API_KEY または EXPO_PUBLIC_GOOGLE_SEARCH_CX が未設定です');
  }

  // 必ず site:kyureki.com を付与して他サイトを遮断
  const restrictedQuery = `${KYUREKI_SITE_FILTER} ${query}`;

  const url = new URL(SEARCH_API_BASE);
  url.searchParams.set('key', apiKey);
  url.searchParams.set('cx',  cx);
  url.searchParams.set('q',   restrictedQuery);
  url.searchParams.set('num', '10');
  url.searchParams.set('lr',  'lang_ja');

  const response = await fetch(url.toString());

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Google Search API error ${response.status}: ${errText}`);
  }

  const data = await response.json();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const raw: any[] = data?.items ?? [];
  return raw.map((item) => ({
    title:       item.title       ?? '',
    snippet:     item.snippet     ?? '',
    link:        item.link        ?? '',
    displayLink: item.displayLink ?? '',
  }));
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * 今日の残り呼び出し可能回数を返す。
 */
export async function getRemainingCalls(): Promise<number> {
  const used = await readDailyCount();
  return Math.max(0, DAILY_LIMIT - used);
}

/**
 * 球歴.com を対象に Google Custom Search を実行する。
 *
 * - キャッシュ有効期間（24h）内ならキャッシュを返す
 * - 1日 90回のリミットに達した場合はアラートを表示して null を返す
 * - 通信失敗時はカウントを増やさない
 *
 * @param query 検索キーワード（site:kyureki.com は自動付与）
 * @returns KyurekiSearchResponse | null
 */
export async function searchKyureki(query: string): Promise<KyurekiSearchResponse | null> {
  // 1. キャッシュ確認
  const cached = await readCache(query);
  if (cached) {
    return {
      query,
      items:     cached.items,
      fromCache: true,
      cachedAt:  cached.cachedAt,
    };
  }

  // 2. レートリミット確認
  const currentCount = await readDailyCount();
  if (currentCount >= DAILY_LIMIT) {
    Alert.alert(
      '本日の更新枠がいっぱいです',
      `1日の最大検索回数（${DAILY_LIMIT}回）に達しました。明日またお試しください。`,
      [{ text: 'OK' }],
    );
    return null;
  }

  // 3. API 呼び出し（失敗してもカウントしない）
  let items: KyurekiSearchItem[];
  try {
    items = await callGoogleSearchAPI(query);
  } catch (err) {
    if (__DEV__) console.error('[googleSearchService] API call failed:', err);
    throw err; // 呼び出し元でハンドリング
  }

  // 4. 成功したらカウントを増やしてキャッシュ保存
  await incrementDailyCount(currentCount);
  await writeCache(query, items);

  return {
    query,
    items,
    fromCache: false,
  };
}

/**
 * よく使う検索クエリのプリセット。
 */
export const KYUREKI_QUERIES = {
  draftRanking:     '2026 ドラフト候補 ランキング',
  draftPitcher:     '2026 ドラフト候補 投手',
  draftBatter:      '2026 ドラフト候補 野手',
  highSchoolProsp:  '2026 ドラフト候補 高校生',
  collegeProsp:     '2026 ドラフト候補 大学生',
} as const;

export type KyurekiQueryKey = keyof typeof KYUREKI_QUERIES;
