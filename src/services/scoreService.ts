import {
  doc,
  getDoc,
  addDoc,
  deleteDoc,
  collection,
  query,
  where,
  orderBy,
  limit as fbLimit,
  startAfter,
  getDocs,
  Timestamp,
  QueryDocumentSnapshot,
  DocumentData,
} from 'firebase/firestore';
import { db, COLLECTIONS } from './firebase';
import {
  Score,
  BattingScore,
  PitchingScore,
  FieldingScore,
  CreateScoreInput,
  PaginatedResult,
  AppError,
} from '../models/types';
import { uploadVideo } from './storageService';
import { updateUserStats } from './userService';
import { notifyTeamGroupsOfScore } from './groupService';

/**
 * Add a new game score record. Uploads video if provided, then triggers
 * user stats recalculation.
 * @param playerId - Player who the score belongs to
 * @param input - Score creation input
 */
export async function addScore(playerId: string, input: CreateScoreInput): Promise<Score> {
  try {
    let videoURL: string | null = null;
    if (input.videoURI) {
      const path = `scores/${Date.now()}/video.mp4`;
      videoURL = await uploadVideo(input.videoURI, path);
    }

    const scoreData = {
      playerId,
      gameDate: Timestamp.fromDate(input.gameDate),
      opponent: input.opponent,
      batting: input.batting,
      pitching: input.pitching,
      fielding: input.fielding,
      videoURL,
      aiAnalysis: null,
      teamId: input.teamId,
      createdAt: Timestamp.now(),
    };

    const scoreRef = await addDoc(collection(db, COLLECTIONS.SCORES), scoreData);

    // Trigger stats recalculation (fire and forget)
    updateUserStats(playerId).catch(() => {});

    // Notify team group chat of new score (fire and forget)
    if (input.teamId) {
      const dateStr = input.gameDate.toLocaleDateString('ja-JP', { month: 'numeric', day: 'numeric' });
      notifyTeamGroupsOfScore(input.teamId, playerId, input.opponent, dateStr).catch(() => {});
    }

    return { id: scoreRef.id, ...scoreData } as Score;
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError('NETWORK', `Failed to add score: ${(error as Error).message}`);
  }
}

/**
 * Get a player's score history with pagination.
 * @param playerId - Player ID
 * @param lastDoc - Cursor for pagination
 * @param pageLimit - Number of results per page
 */
export async function getPlayerScores(
  playerId: string,
  lastDoc?: unknown,
  pageLimit: number = 20,
): Promise<PaginatedResult<Score>> {
  try {
    const scoresRef = collection(db, COLLECTIONS.SCORES);
    const constraints: any[] = [
      where('playerId', '==', playerId),
      orderBy('gameDate', 'desc'),
      fbLimit(pageLimit + 1),
    ];

    if (lastDoc) {
      constraints.splice(2, 0, startAfter(lastDoc as QueryDocumentSnapshot<DocumentData>));
    }

    const q = query(scoresRef, ...(constraints as any[]));
    const snap = await getDocs(q);
    const docs = snap.docs;
    const hasMore = docs.length > pageLimit;
    const items = docs.slice(0, pageLimit).map((d) => ({
      id: d.id,
      ...d.data(),
    })) as Score[];

    return {
      items,
      lastDoc: docs.length > 0 ? docs[Math.min(docs.length - 1, pageLimit - 1)] : null,
      hasMore,
    };
  } catch (error) {
    throw new AppError('NETWORK', `Failed to get player scores: ${(error as Error).message}`);
  }
}

/**
 * Get all scores for members of a team with pagination.
 * @param teamId - Team ID
 * @param lastDoc - Cursor for pagination
 * @param pageLimit - Number of results per page
 */
export async function getTeamScores(
  teamId: string,
  lastDoc?: unknown,
  pageLimit: number = 20,
): Promise<PaginatedResult<Score>> {
  try {
    const scoresRef = collection(db, COLLECTIONS.SCORES);
    const constraints: any[] = [
      where('teamId', '==', teamId),
      orderBy('gameDate', 'desc'),
      fbLimit(pageLimit + 1),
    ];

    if (lastDoc) {
      constraints.splice(2, 0, startAfter(lastDoc as QueryDocumentSnapshot<DocumentData>));
    }

    const q = query(scoresRef, ...(constraints as any[]));
    const snap = await getDocs(q);
    const docs = snap.docs;
    const hasMore = docs.length > pageLimit;
    const items = docs.slice(0, pageLimit).map((d) => ({
      id: d.id,
      ...d.data(),
    })) as Score[];

    return {
      items,
      lastDoc: docs.length > 0 ? docs[Math.min(docs.length - 1, pageLimit - 1)] : null,
      hasMore,
    };
  } catch (error) {
    throw new AppError('NETWORK', `Failed to get team scores: ${(error as Error).message}`);
  }
}

/**
 * Get a single score by ID.
 * @param scoreId - Score document ID
 */
export async function getScore(scoreId: string): Promise<Score> {
  try {
    const snap = await getDoc(doc(db, COLLECTIONS.SCORES, scoreId));
    if (!snap.exists()) {
      throw new AppError('NOT_FOUND', 'Score not found');
    }
    return { id: snap.id, ...snap.data() } as Score;
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError('NETWORK', `Failed to get score: ${(error as Error).message}`);
  }
}

/**
 * Delete a score record. Only the player can delete their own scores.
 * Triggers stats recalculation after deletion.
 * @param scoreId - Score to delete
 * @param playerId - Must match the score's playerId
 */
export async function deleteScore(scoreId: string, playerId: string): Promise<void> {
  try {
    const score = await getScore(scoreId);
    if (score.playerId !== playerId) {
      throw new AppError('FORBIDDEN', 'Only the player can delete this score');
    }

    await deleteDoc(doc(db, COLLECTIONS.SCORES, scoreId));

    // Recalculate stats after deletion
    updateUserStats(playerId).catch(() => {});
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError('NETWORK', `Failed to delete score: ${(error as Error).message}`);
  }
}

/**
 * Calculate batting average from an array of scores.
 * @param scores - Array of Score objects
 * @returns Batting average (0-1 scale, 3 decimal places)
 */
export function calculateBattingAvg(scores: Score[]): number {
  let totalAtBats = 0;
  let totalHits = 0;

  for (const score of scores) {
    if (score.batting) {
      totalAtBats += score.batting.atBats;
      totalHits += score.batting.hits;
    }
  }

  return totalAtBats > 0
    ? Math.round((totalHits / totalAtBats) * 1000) / 1000
    : 0;
}

/**
 * Calculate ERA (Earned Run Average) from an array of scores.
 * Formula: (earnedRuns / inningsPitched) * 9
 * @param scores - Array of Score objects
 * @returns ERA (2 decimal places)
 */
export function calculateERA(scores: Score[]): number {
  let totalInningsPitched = 0;
  let totalEarnedRuns = 0;

  for (const score of scores) {
    if (score.pitching) {
      totalInningsPitched += score.pitching.inningsPitched;
      totalEarnedRuns += score.pitching.earnedRuns;
    }
  }

  return totalInningsPitched > 0
    ? Math.round((totalEarnedRuns / totalInningsPitched) * 9 * 100) / 100
    : 0;
}

/**
 * Calculate fielding percentage from an array of scores.
 * Formula: (putouts + assists) / (putouts + assists + errors)
 * @param scores - Array of Score objects
 * @returns Fielding percentage (0-1 scale, 3 decimal places)
 */
export function calculateFieldingPct(scores: Score[]): number {
  let totalPutouts = 0;
  let totalAssists = 0;
  let totalErrors = 0;

  for (const score of scores) {
    if (score.fielding) {
      totalPutouts += score.fielding.putouts;
      totalAssists += score.fielding.assists;
      totalErrors += score.fielding.errors;
    }
  }

  const totalChances = totalPutouts + totalAssists + totalErrors;
  return totalChances > 0
    ? Math.round(((totalPutouts + totalAssists) / totalChances) * 1000) / 1000
    : 0;
}

/**
 * Get aggregated stats for a player's current season (current calendar year).
 * @param playerId - Player ID
 */
export async function getPlayerSeasonStats(playerId: string): Promise<{
  batting: { avg: number; gamesPlayed: number; atBats: number; hits: number; homeRuns: number; rbis: number };
  pitching: { era: number; gamesPlayed: number; inningsPitched: number; strikeouts: number; earnedRuns: number };
  fielding: { fieldingPct: number; putouts: number; assists: number; errors: number };
}> {
  try {
    const currentYear = new Date().getFullYear();
    const seasonStart = Timestamp.fromDate(new Date(currentYear, 0, 1));

    const scoresRef = collection(db, COLLECTIONS.SCORES);
    const q = query(
      scoresRef,
      where('playerId', '==', playerId),
      where('gameDate', '>=', seasonStart),
      orderBy('gameDate', 'desc'),
    );
    const snap = await getDocs(q);
    const scores = snap.docs.map((d) => ({ id: d.id, ...d.data() })) as Score[];

    let battingGames = 0;
    let totalAtBats = 0;
    let totalHits = 0;
    let totalHomeRuns = 0;
    let totalRbis = 0;

    let pitchingGames = 0;
    let totalInningsPitched = 0;
    let totalStrikeouts = 0;
    let totalEarnedRuns = 0;

    let totalPutouts = 0;
    let totalAssists = 0;
    let totalErrors = 0;

    for (const score of scores) {
      if (score.batting) {
        battingGames++;
        totalAtBats += score.batting.atBats;
        totalHits += score.batting.hits;
        totalHomeRuns += score.batting.homeRuns;
        totalRbis += score.batting.rbis;
      }
      if (score.pitching) {
        pitchingGames++;
        totalInningsPitched += score.pitching.inningsPitched;
        totalStrikeouts += score.pitching.strikeouts;
        totalEarnedRuns += score.pitching.earnedRuns;
      }
      if (score.fielding) {
        totalPutouts += score.fielding.putouts;
        totalAssists += score.fielding.assists;
        totalErrors += score.fielding.errors;
      }
    }

    const totalChances = totalPutouts + totalAssists + totalErrors;

    return {
      batting: {
        avg: calculateBattingAvg(scores),
        gamesPlayed: battingGames,
        atBats: totalAtBats,
        hits: totalHits,
        homeRuns: totalHomeRuns,
        rbis: totalRbis,
      },
      pitching: {
        era: calculateERA(scores),
        gamesPlayed: pitchingGames,
        inningsPitched: totalInningsPitched,
        strikeouts: totalStrikeouts,
        earnedRuns: totalEarnedRuns,
      },
      fielding: {
        fieldingPct: totalChances > 0
          ? Math.round(((totalPutouts + totalAssists) / totalChances) * 1000) / 1000
          : 0,
        putouts: totalPutouts,
        assists: totalAssists,
        errors: totalErrors,
      },
    };
  } catch (error) {
    throw new AppError('NETWORK', `Failed to get season stats: ${(error as Error).message}`);
  }
}
