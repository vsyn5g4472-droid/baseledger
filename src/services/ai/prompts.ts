// =============================================================================
// AI Prompt Templates for Grok API
// =============================================================================

export const SYSTEM_PROMPTS = {
  BASEBALL_ANALYST: `You are an elite baseball analytics expert with deep knowledge of sabermetrics, traditional scouting metrics, and modern player evaluation. You analyze player and team performance using both statistical evidence and qualitative assessment.

You understand advanced metrics like OPS+, wRC+, FIP, WAR, and can explain trends in plain language. When analyzing performance, consider:
- Sample size and statistical significance
- Park factors and league context
- Platoon splits and situational performance
- Historical comparisons to similar player profiles
- Developmental trajectories for younger players

Always provide actionable, specific insights rather than generic observations. Reference concrete numbers from the data provided.`,

  SCOUT_ADVISOR: `You are a veteran baseball scout with 20+ years of experience evaluating talent across amateur and professional levels. You use the traditional 20-80 scouting scale and combine eye-test evaluation with modern analytics.

When evaluating players, consider:
- The five tools: hit, power, speed, arm, defense
- Makeup and intangibles (work ethic, coachability, competitiveness)
- Projection and ceiling vs. floor
- Position-specific requirements and physical profiles
- How tools translate across competition levels

Provide clear, honest assessments that balance optimism with realism. Explain WHY a player fits criteria, not just that they do.`,

  BATTING_COACH: `You are a professional batting coach specializing in swing mechanics, approach at the plate, and offensive development. You have expertise in:

- Swing mechanics: load, stride, hip rotation, bat path, extension, follow-through
- Plate discipline: pitch recognition, zone awareness, two-strike approach
- Situational hitting: advancing runners, sacrifice situations, hit-and-run
- Mental approach: handling slumps, adjusting to pitcher tendencies
- Physical conditioning specific to hitting: bat speed development, core strength

When suggesting drills, be specific about setup, execution, reps, and what the drill addresses. Prioritize the highest-impact adjustments first.`,

  PITCHING_COACH: `You are a professional pitching coach specializing in mechanics, pitch development, and game strategy. You have expertise in:

- Pitching mechanics: wind-up/stretch, arm slot, release point, deceleration
- Pitch arsenal development: fastball command, breaking ball shape, changeup feel
- Game management: pitch sequencing, working counts, pitching to contact
- Velocity development and injury prevention
- Mental game: composure, adjusting mid-game, bouncing back from bad outings

When suggesting improvements, focus on mechanical efficiency and repeatable delivery. Emphasize health and longevity alongside performance gains.`,
} as const;

export function buildPerformanceAnalysisPrompt(
  playerName: string,
  position: string,
  statsJson: string,
): string {
  return `Analyze the recent performance of ${playerName} (${position}).

Here is their game-by-game data:
${statsJson}

Provide your analysis as JSON with this exact structure:
{
  "summary": "2-3 sentence overall assessment",
  "strengths": ["strength1", "strength2", ...],
  "weaknesses": ["weakness1", "weakness2", ...],
  "trends": [
    {
      "metric": "metric name",
      "direction": "improving" | "declining" | "stable",
      "description": "explanation of the trend"
    }
  ]
}

Be specific and reference actual numbers from the data. Identify at least 2 strengths, 2 weaknesses, and 2-3 trends.`;
}

export function buildImprovementPrompt(
  playerName: string,
  position: string,
  statsJson: string,
): string {
  return `Based on the following stats for ${playerName} (${position}), suggest specific improvement areas with actionable drills.

Player stats and recent performance:
${statsJson}

Provide your response as a JSON array with this exact structure:
[
  {
    "area": "batting" | "pitching" | "fielding" | "general",
    "title": "short title for the improvement area",
    "description": "detailed explanation of what needs improvement and why",
    "priority": "high" | "medium" | "low",
    "drills": ["drill 1 with specific instructions", "drill 2", ...]
  }
]

Provide 3-5 suggestions ordered by priority. Each suggestion should have 2-3 specific drills. Focus on the most impactful improvements given the player's position.`;
}

export function buildTeamAnalysisPrompt(
  teamName: string,
  membersJson: string,
): string {
  return `Analyze the overall performance of team "${teamName}".

Team roster and individual stats:
${membersJson}

Provide your analysis as JSON with this exact structure:
{
  "summary": "2-3 sentence overall team assessment",
  "strengths": ["team strength 1", "team strength 2", ...],
  "weaknesses": ["team weakness 1", "team weakness 2", ...],
  "playerHighlights": [
    {
      "playerName": "name",
      "highlight": "what stands out about this player's contribution"
    }
  ]
}

Consider team composition, balance between offense and defense, depth at positions, and how individual performances combine into team-level strengths and weaknesses. Highlight 3-5 standout players.`;
}

export function buildScoutSearchPrompt(
  criteria: string,
  candidatesJson: string,
): string {
  return `A scout is looking for players matching these criteria: "${criteria}"

Here are the available candidates with their stats:
${candidatesJson}

Evaluate each candidate against the search criteria and return a JSON array of the best matches:
[
  {
    "name": "player name",
    "matchScore": 0-100,
    "matchReasons": ["reason 1 why they fit", "reason 2", ...]
  }
]

Order by matchScore descending. Only include players with matchScore >= 40. Explain specifically how each player's stats and profile align with the search criteria. Consider both current production and potential.`;
}

export function buildVideoAnalysisPrompt(
  description: string,
  position: string,
): string {
  return `A ${position} player has shared the following description of their play for analysis:

"${description}"

Based on this description, provide a mechanical and tactical analysis as JSON:
{
  "mechanics": "overall assessment of mechanics based on what was described",
  "observations": ["observation 1", "observation 2", ...],
  "suggestions": ["specific suggestion 1", "specific suggestion 2", ...]
}

Provide 3-5 observations about what was described and 2-4 actionable suggestions for improvement. Focus on the most impactful mechanical and tactical adjustments for the player's position.`;
}
