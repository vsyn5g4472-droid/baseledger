// =============================================================================
// Grok API Integration — Baseball AI Analysis
// =============================================================================

import type {
  Score,
  UserStats,
  User,
  PerformanceAnalysis,
  ImprovementSuggestion,
  VideoAnalysis,
  TeamAnalysis,
  RecommendedPlayer,
} from '../models/types';
import {
  SYSTEM_PROMPTS,
  buildPerformanceAnalysisPrompt,
  buildImprovementPrompt,
  buildTeamAnalysisPrompt,
  buildScoutSearchPrompt,
  buildVideoAnalysisPrompt,
} from './ai/prompts';

const GROK_API_URL = 'https://api.x.ai/v1/chat/completions';
const GROK_API_KEY = process.env.EXPO_PUBLIC_GROK_API_KEY;

// ── Grok API Helper ──────────────────────────────────────────────────────────

async function callGrokAPI(systemPrompt: string, userPrompt: string): Promise<string> {
  if (!GROK_API_KEY) {
    throw new Error('EXPO_PUBLIC_GROK_API_KEY is not configured');
  }

  const response = await fetch(GROK_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${GROK_API_KEY}`,
    },
    body: JSON.stringify({
      model: 'grok-3',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.7,
      max_tokens: 2048,
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text().catch(() => 'unknown error');
    throw new Error(`Grok API error (${response.status}): ${errorBody}`);
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error('Empty response from Grok API');
  }
  return content;
}

/**
 * Extract JSON from a response that may contain markdown code fences.
 */
function parseJsonResponse<T>(raw: string): T {
  const jsonMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  const jsonStr = jsonMatch ? jsonMatch[1].trim() : raw.trim();
  return JSON.parse(jsonStr) as T;
}

// ── Public API ───────────────────────────────────────────────────────────────

export async function analyzePlayerPerformance(
  playerName: string,
  position: string,
  scores: Score[],
): Promise<PerformanceAnalysis> {
  const statsJson = JSON.stringify(
    scores.map((s) => ({
      date: s.gameDate,
      opponent: s.opponent,
      batting: s.batting,
      pitching: s.pitching,
      fielding: s.fielding,
    })),
    null,
    2,
  );

  const userPrompt = buildPerformanceAnalysisPrompt(playerName, position, statsJson);
  const raw = await callGrokAPI(SYSTEM_PROMPTS.BASEBALL_ANALYST, userPrompt);
  return parseJsonResponse<PerformanceAnalysis>(raw);
}

export async function getImprovementSuggestions(
  playerName: string,
  position: string,
  stats: UserStats,
  recentScores: Score[],
): Promise<ImprovementSuggestion[]> {
  const statsJson = JSON.stringify(
    {
      careerStats: stats,
      recentGames: recentScores.map((s) => ({
        date: s.gameDate,
        opponent: s.opponent,
        batting: s.batting,
        pitching: s.pitching,
        fielding: s.fielding,
      })),
    },
    null,
    2,
  );

  const systemPrompt = position.toLowerCase().includes('pitcher')
    ? SYSTEM_PROMPTS.PITCHING_COACH
    : SYSTEM_PROMPTS.BATTING_COACH;

  const userPrompt = buildImprovementPrompt(playerName, position, statsJson);
  const raw = await callGrokAPI(systemPrompt, userPrompt);
  return parseJsonResponse<ImprovementSuggestion[]>(raw);
}

export async function analyzeTeamPerformance(
  teamName: string,
  members: { name: string; position: string; stats: UserStats }[],
): Promise<TeamAnalysis> {
  const membersJson = JSON.stringify(
    members.map((m) => ({
      name: m.name,
      position: m.position,
      batting: m.stats.batting,
      pitching: m.stats.pitching,
      fielding: m.stats.fielding,
    })),
    null,
    2,
  );

  const userPrompt = buildTeamAnalysisPrompt(teamName, membersJson);
  const raw = await callGrokAPI(SYSTEM_PROMPTS.BASEBALL_ANALYST, userPrompt);
  const parsed = parseJsonResponse<Omit<TeamAnalysis, 'teamId'>>(raw);

  // Map playerHighlights from API response format to app format
  const playerHighlights = (
    parsed.playerHighlights as { playerName?: string; playerId?: string; highlight: string }[]
  ).map((ph) => ({
    playerId: ph.playerId ?? '',
    playerName: ph.playerName ?? '',
    highlight: ph.highlight,
  }));

  return {
    teamId: '',
    summary: parsed.summary,
    strengths: parsed.strengths,
    weaknesses: parsed.weaknesses,
    playerHighlights,
  };
}

export async function getScoutRecommendations(
  searchCriteria: string,
  candidates: { name: string; position: string; stats: UserStats; user: User }[],
): Promise<RecommendedPlayer[]> {
  const candidatesJson = JSON.stringify(
    candidates.map((c) => ({
      name: c.name,
      position: c.position,
      age: c.user.age,
      throwHand: c.user.throwHand,
      batHand: c.user.batHand,
      batting: c.stats.batting,
      pitching: c.stats.pitching,
      fielding: c.stats.fielding,
    })),
    null,
    2,
  );

  const userPrompt = buildScoutSearchPrompt(searchCriteria, candidatesJson);
  const raw = await callGrokAPI(SYSTEM_PROMPTS.SCOUT_ADVISOR, userPrompt);
  const parsed = parseJsonResponse<
    { name: string; matchScore: number; matchReasons: string[] }[]
  >(raw);

  // Map AI results back to full candidate objects
  const candidateMap = new Map(candidates.map((c) => [c.name, c]));
  return parsed
    .filter((r) => candidateMap.has(r.name))
    .map((r) => ({
      user: candidateMap.get(r.name)!.user,
      matchScore: r.matchScore,
      matchReasons: r.matchReasons,
    }));
}

export async function analyzeVideoDescription(
  description: string,
  playerPosition: string,
): Promise<VideoAnalysis> {
  const systemPrompt = playerPosition.toLowerCase().includes('pitcher')
    ? SYSTEM_PROMPTS.PITCHING_COACH
    : SYSTEM_PROMPTS.BATTING_COACH;

  const userPrompt = buildVideoAnalysisPrompt(description, playerPosition);
  const raw = await callGrokAPI(systemPrompt, userPrompt);
  return parseJsonResponse<VideoAnalysis>(raw);
}
