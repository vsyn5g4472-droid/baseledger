/**
 * AI レポート生成サービス
 *
 * 試合統計データを Claude (Anthropic Messages API) に渡し、
 * 構造化された日本語レポートを生成します。
 *
 * 必要な環境変数:
 *   EXPO_PUBLIC_ANTHROPIC_API_KEY — Anthropic API キー
 *
 * キーが未設定の場合は isMock フラグを true にするとモックレポートを返します。
 */

import type { GameState } from '../types/game';
import type { AggregatedPitchingStats, AggregatedBattingStats } from '../utils/multiGameStats';
import type { BatteryProfile, BatterProfile } from '../utils/analysisEngine';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface AIReportSection {
  title: string;
  content: string;
}

export interface AIReport {
  /** 総合評価 */
  overall: string;
  /** 改善点リスト */
  improvements: Array<{ aspect: string; detail: string }>;
  /** 次回へのアドバイス */
  nextAdvice: string;
  /** ハイライト (特筆事項) */
  highlights: string;
  /** 生成日時 */
  generatedAt: number;
  /** モックかどうか */
  isMock?: boolean;
}

export type ReportRole = 'pitcher' | 'batter' | 'team';

export interface ReportInput {
  game: GameState;
  role: ReportRole;
  /** 対象選手ID (pitcher / batter 指定時) */
  playerId?: string;
  pitcher?: AggregatedPitchingStats | null;
  batters?: AggregatedBattingStats[];
}

// ── Prompt builders ───────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `
あなたはプロ野球のデータアナリストです。
試合の投球・打撃データを分析し、選手やチームが改善できるよう具体的なフィードバックを日本語で提供します。
データに基づいた客観的な評価と、実践的なアドバイスを心がけてください。
`.trim();

function buildPitcherPrompt(stats: AggregatedPitchingStats, score: { away: number; home: number }, teamNames: { away: string; home: string }): string {
  const topPitch = stats.pitchMix[0];
  const zoneEntries = Object.entries(stats.zoneDistribution)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5)
    .map(([z, c]) => `${z}: ${c}球`)
    .join(', ');

  const statsJson = {
    試合スコア: `${teamNames.away} ${score.away} - ${score.home} ${teamNames.home}`,
    投手名: stats.playerName,
    総投球数: stats.totalPitches,
    ストライク率: `${Math.round(stats.strikeRate * 100)}%`,
    奪三振率: `${Math.round(stats.strikeoutRate * 100)}%`,
    平均球速: stats.avgVelocity != null ? `${stats.avgVelocity} km/h` : '未計測',
    最高球速: stats.maxVelocity != null ? `${stats.maxVelocity} km/h` : '未計測',
    主要球種: topPitch ? `${topPitch.pitchType} (${Math.round(topPitch.pct * 100)}%)` : '不明',
    球種構成: stats.pitchMix.map((m) => `${m.pitchType}: ${Math.round(m.pct * 100)}%`).join(', '),
    多投ゾーン上位5: zoneEntries,
  };

  return `
以下の投手成績データを分析し、**必ずJSONのみ**で回答してください（マークダウン不可）。

データ:
${JSON.stringify(statsJson, null, 2)}

返答形式（JSONのみ、説明文なし）:
{
  "overall": "今回の投球パフォーマンス総合評価（2〜3文）",
  "improvements": [
    { "aspect": "課題項目名（例: 外角低めの制球）", "detail": "具体的な改善アドバイス（1〜2文）" },
    { "aspect": "課題項目名2", "detail": "具体的な改善アドバイス2" }
  ],
  "nextAdvice": "次回の登板に向けた1つのアドバイス（1〜2文）",
  "highlights": "特筆すべき好プレーや数値（1文）"
}
`.trim();
}

function buildBatterPrompt(
  stats: AggregatedBattingStats,
  score: { away: number; home: number },
  teamNames: { away: string; home: string },
): string {
  const statsJson = {
    試合スコア: `${teamNames.away} ${score.away} - ${score.home} ${teamNames.home}`,
    打者名: stats.playerName,
    打数: stats.atBats,
    安打数: stats.hits,
    打点: stats.rbi,
    打率: stats.avg.toFixed(3).replace(/^0/, ''),
    OPS: stats.ops.toFixed(3).replace(/^0/, ''),
    本塁打: stats.homeRuns,
    三振: stats.strikeouts,
    空振り率: `${Math.round(stats.swingMissRate * 100)}%`,
    平均飛距離: stats.avgHitDistance != null ? `${stats.avgHitDistance}m` : '未計測',
  };

  return `
以下の打者成績データを分析し、**必ずJSONのみ**で回答してください（マークダウン不可）。

データ:
${JSON.stringify(statsJson, null, 2)}

返答形式（JSONのみ、説明文なし）:
{
  "overall": "今回の打撃パフォーマンス総合評価（2〜3文）",
  "improvements": [
    { "aspect": "課題項目名（例: 外角スライダーへの対応）", "detail": "具体的な改善アドバイス（1〜2文）" },
    { "aspect": "課題項目名2", "detail": "具体的な改善アドバイス2" }
  ],
  "nextAdvice": "次回の打席に向けた1つのアドバイス（1〜2文）",
  "highlights": "特筆すべき好プレーや数値（1文）"
}
`.trim();
}

function buildTeamPrompt(
  batters: AggregatedBattingStats[],
  pitcher: AggregatedPitchingStats | null,
  score: { away: number; home: number },
  teamNames: { away: string; home: string },
): string {
  const topBatters = [...batters]
    .sort((a, b) => b.ops - a.ops)
    .slice(0, 4)
    .map((b) => ({
      選手: b.playerName,
      打率: b.avg.toFixed(3).replace(/^0/, ''),
      OPS: b.ops.toFixed(3).replace(/^0/, ''),
      打点: b.rbi,
      本塁打: b.homeRuns,
    }));

  const pitcherSummary = pitcher
    ? {
        選手: pitcher.playerName,
        ストライク率: `${Math.round(pitcher.strikeRate * 100)}%`,
        奪三振率: `${Math.round(pitcher.strikeoutRate * 100)}%`,
        最高球速: pitcher.maxVelocity != null ? `${pitcher.maxVelocity} km/h` : '未計測',
      }
    : null;

  const statsJson = {
    試合スコア: `${teamNames.away} ${score.away} - ${score.home} ${teamNames.home}`,
    打線上位4名: topBatters,
    先発投手: pitcherSummary,
  };

  return `
以下のチーム成績データを分析し、**必ずJSONのみ**で回答してください（マークダウン不可）。

データ:
${JSON.stringify(statsJson, null, 2)}

返答形式（JSONのみ、説明文なし）:
{
  "overall": "チーム全体のパフォーマンス総合評価（2〜3文）",
  "improvements": [
    { "aspect": "チームの課題項目（例: 得点圏打率の向上）", "detail": "具体的な改善アドバイス（1〜2文）" },
    { "aspect": "課題項目名2", "detail": "具体的な改善アドバイス2" }
  ],
  "nextAdvice": "次の試合に向けたチームアドバイス（1〜2文）",
  "highlights": "特筆すべき好プレーや数値（1文）"
}
`.trim();
}

// ── Mock data ─────────────────────────────────────────────────────────────────

function mockReport(role: ReportRole): AIReport {
  const base: AIReport = {
    overall:
      role === 'pitcher'
        ? '今回の登板はストライク率が高く、安定した制球を見せました。変化球の精度も良好で、打者を翻弄するシーンが多く見られました。'
        : role === 'batter'
        ? '今回の打席では積極的なスイングが光りました。長打力を発揮し、チームの得点に大きく貢献しています。'
        : '攻守ともにバランスの取れた試合内容でした。特に投打の噛み合いが好調で、得点につながる場面を多く作り出しました。',
    improvements: [
      {
        aspect: role === 'pitcher' ? '外角低めの制球' : '外角低めの変化球対応',
        detail:
          role === 'pitcher'
            ? '外角低め（ゾーン7・9）への投球比率が低めです。右打者に対してはこのコースへの出し入れを意識すると三振が増える可能性があります。'
            : '外角低めのスライダーに対して空振りが多い傾向があります。ストライクゾーンに来るボールを冷静に見極める練習を重ねましょう。',
      },
      {
        aspect: role === 'pitcher' ? '変化球の割合' : '追い込まれてからの対応',
        detail:
          role === 'pitcher'
            ? '球速に頼る場面が目立ちます。変化球（特にスライダー・チェンジアップ）の割合を増やすことで、打者の読みを外しやすくなります。'
            : '2ストライク後の打率が低下する傾向があります。ファウルで粘る意識と、コンタクト重視のスイングを取り入れてみましょう。',
      },
    ],
    nextAdvice:
      role === 'pitcher'
        ? '次回は左打者への内角攻めを増やし、インコースとアウトコースの出し入れで打者のタイミングを外す投球を意識してみてください。'
        : '次の打席では初球から積極的にストライクを打ちに行く姿勢を持ちつつ、甘いボールを確実に仕留めることを意識しましょう。',
    highlights:
      role === 'pitcher'
        ? '最高球速が自己ベストに迫る数値を記録。球威のある直球で見逃し三振を複数取ったことは大きな収穫です。'
        : '本塁打を含む長打でチームをけん引。得点圏での集中力の高さが際立ちました。',
    generatedAt: Date.now(),
    isMock: true,
  };
  return base;
}

// ── API call ──────────────────────────────────────────────────────────────────

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
const MODEL = 'claude-haiku-4-5-20251001';

async function callAnthropicAPI(userPrompt: string): Promise<AIReport> {
  const apiKey = process.env.EXPO_PUBLIC_ANTHROPIC_API_KEY;

  if (!apiKey) {
    console.warn('[aiReportService] EXPO_PUBLIC_ANTHROPIC_API_KEY not set. Returning mock report.');
    return mockReport('team');
  }

  const response = await fetch(ANTHROPIC_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userPrompt }],
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Anthropic API error ${response.status}: ${err}`);
  }

  const data = await response.json();
  const rawText: string = data?.content?.[0]?.text ?? '';

  // JSON を抽出（モデルが余分な説明を付けた場合も考慮）
  const jsonMatch = rawText.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('Failed to parse AI response as JSON');

  const parsed = JSON.parse(jsonMatch[0]);

  return {
    overall:      parsed.overall      ?? '',
    improvements: parsed.improvements ?? [],
    nextAdvice:   parsed.nextAdvice   ?? '',
    highlights:   parsed.highlights   ?? '',
    generatedAt:  Date.now(),
  };
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * 試合データから AI 解析レポートを生成する
 *
 * @param input ReportInput
 * @returns AIReport
 */
export async function generateAIReport(input: ReportInput): Promise<AIReport> {
  const { game, role, pitcher, batters = [] } = input;
  const score = {
    away: game.scoreboard.awayTotal,
    home: game.scoreboard.homeTotal,
  };
  const teamNames = {
    away: game.awayTeam.name,
    home: game.homeTeam.name,
  };

  // API キーがなければ即モックを返す
  if (!process.env.EXPO_PUBLIC_ANTHROPIC_API_KEY) {
    return mockReport(role);
  }

  let prompt: string;

  if (role === 'pitcher' && pitcher) {
    prompt = buildPitcherPrompt(pitcher, score, teamNames);
  } else if (role === 'batter' && input.playerId) {
    const targetBatter = batters.find((b) => b.playerId === input.playerId);
    if (!targetBatter) return mockReport(role);
    prompt = buildBatterPrompt(targetBatter, score, teamNames);
  } else {
    prompt = buildTeamPrompt(batters, pitcher ?? null, score, teamNames);
  }

  try {
    return await callAnthropicAPI(prompt);
  } catch (err) {
    console.error('[aiReportService] API call failed:', err);
    // フォールバックとしてモックを返す
    return { ...mockReport(role), isMock: true };
  }
}

// ── Profile-based prompt builders ────────────────────────────────────────────

function buildBatteryProfilePrompt(profile: BatteryProfile): string {
  const top2S = profile.pitchType2Strike[0];
  const topZone2S = Object.entries(profile.zone2Strike)
    .sort(([, a], [, b]) => b - a)[0];
  const topFinish = profile.finishingPitches.slice(0, 3).map((f) => ({
    球種: f.pitchType,
    ゾーン: f.zone,
    割合: `${Math.round(f.pct * 100)}%`,
  }));

  const countSummary = profile.countTendencies
    .filter((c) => c.total > 0)
    .slice(0, 5)
    .map((c) => ({
      カウント: `${c.balls}B-${c.strikes}S`,
      最多球種: c.pitchTypes[0]?.type ?? '-',
      球種割合: c.pitchTypes[0] ? `${Math.round(c.pitchTypes[0].pct * 100)}%` : '-',
      最多ゾーン: c.topZones[0]?.zone ?? '-',
    }));

  const statsJson = {
    バッテリー: `${profile.pitcherName} × ${profile.catcherName}`,
    試合数: profile.totalGames,
    総投球数: profile.totalPitches,
    ストライク率: `${Math.round(profile.strikeRate * 100)}%`,
    平均球速: profile.avgVelocity != null ? `${profile.avgVelocity}km/h` : '未計測',
    最高球速: profile.maxVelocity != null ? `${profile.maxVelocity}km/h` : '未計測',
    '2ストライク時最多球種': top2S ? `${top2S.type} (${Math.round(top2S.pct * 100)}%)` : '-',
    '2ストライク時最多ゾーン': topZone2S ? `ゾーン${topZone2S[0]} (${topZone2S[1]}球)` : '-',
    決め球ランキング: topFinish,
    カウント別傾向: countSummary,
  };

  return `
以下のバッテリー配球データを分析し、**必ずJSONのみ**で回答してください（マークダウン不可）。

データ:
${JSON.stringify(statsJson, null, 2)}

返答形式（JSONのみ、説明文なし）:
{
  "overall": "このバッテリーの配球パターンの特徴・総合評価（2〜3文）",
  "improvements": [
    { "aspect": "配球上の課題（例: カウント球の単調さ）", "detail": "具体的な改善アドバイス（1〜2文）" },
    { "aspect": "課題項目2", "detail": "具体的な改善アドバイス2" }
  ],
  "nextAdvice": "次回の登板に向けた配球アドバイス（1〜2文）",
  "highlights": "特筆すべき配球の強みや特徴（1文）"
}
`.trim();
}

function buildBatterProfilePrompt(profile: BatterProfile): string {
  const weakTop = profile.weakZones.slice(0, 3).map((z) => ({
    ゾーン: z.zone,
    空振り率: `${Math.round(z.swingMissRate * 100)}%`,
    投球数: z.pitchesFaced,
  }));
  const strongTop = profile.strongZones.slice(0, 3).map((z) => ({
    ゾーン: z.zone,
    被打率: `${Math.round(z.hitRate * 100)}%`,
    投球数: z.pitchesFaced,
  }));
  const pitchTypes = profile.pitchTypeStats.slice(0, 5).map((p) => ({
    球種: p.type,
    投球数: p.count,
    空振り率: `${Math.round(p.swingMissRate * 100)}%`,
    被打率: `${Math.round(p.hitRate * 100)}%`,
  }));

  const statsJson = {
    打者名: profile.batterName,
    試合数: profile.totalGames,
    打数: profile.totalAtBats,
    被投球数: profile.totalPitchesFaced,
    打率: profile.avg.toFixed(3).replace(/^0/, ''),
    三振率: `${Math.round(profile.strikeoutRate * 100)}%`,
    四球率: `${Math.round(profile.walkRate * 100)}%`,
    初球打ち率: `${Math.round(profile.firstPitchSwingRate * 100)}%`,
    苦手ゾーンTOP3: weakTop,
    得意ゾーンTOP3: strongTop,
    球種別成績: pitchTypes,
    平均打球飛距離: profile.avgHitDistance != null ? `${profile.avgHitDistance}m` : '未計測',
  };

  return `
以下の打者傾向データを分析し、**必ずJSONのみ**で回答してください（マークダウン不可）。

データ:
${JSON.stringify(statsJson, null, 2)}

返答形式（JSONのみ、説明文なし）:
{
  "overall": "この打者の傾向・特徴の総合評価（2〜3文）",
  "improvements": [
    { "aspect": "打撃上の課題（例: 外角スライダーへの対応）", "detail": "具体的な改善アドバイス（1〜2文）" },
    { "aspect": "課題項目2", "detail": "具体的な改善アドバイス2" }
  ],
  "nextAdvice": "次の打席に向けたアドバイス（1〜2文）",
  "highlights": "特筆すべき打撃の強みや特徴（1文）"
}
`.trim();
}

/**
 * BatteryProfile から AI 分析レポートを生成する
 */
export async function generateBatteryAIReport(profile: BatteryProfile): Promise<AIReport> {
  if (!process.env.EXPO_PUBLIC_ANTHROPIC_API_KEY) {
    return mockReport('pitcher');
  }
  try {
    return await callAnthropicAPI(buildBatteryProfilePrompt(profile));
  } catch (err) {
    console.error('[aiReportService] Battery report API call failed:', err);
    return { ...mockReport('pitcher'), isMock: true };
  }
}

/**
 * BatterProfile から AI 分析レポートを生成する
 */
export async function generateBatterAIReport(profile: BatterProfile): Promise<AIReport> {
  if (!process.env.EXPO_PUBLIC_ANTHROPIC_API_KEY) {
    return mockReport('batter');
  }
  try {
    return await callAnthropicAPI(buildBatterProfilePrompt(profile));
  } catch (err) {
    console.error('[aiReportService] Batter report API call failed:', err);
    return { ...mockReport('batter'), isMock: true };
  }
}

/**
 * AI レポートのセクション配列に変換（UI表示用）
 */
export function reportToSections(report: AIReport): AIReportSection[] {
  return [
    { title: '総合評価', content: report.overall },
    ...report.improvements.map((imp) => ({
      title: `改善点: ${imp.aspect}`,
      content: imp.detail,
    })),
    { title: '次回へのアドバイス', content: report.nextAdvice },
    { title: 'ハイライト', content: report.highlights },
  ];
}
