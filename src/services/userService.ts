import {
  doc,
  getDoc,
  updateDoc,
  collection,
  query,
  where,
  orderBy,
  getDocs,
  serverTimestamp,
  limit,
} from 'firebase/firestore';
import { db, COLLECTIONS } from './firebase';
import {
  User,
  UpdateUserInput,
  ScoutSearchFilters,
  Score,
  BattingStats,
  PitchingStats,
  FieldingStats,
  UserStats,
  AppError,
} from '../models/types';

/**
 * Get a user document from Firestore.
 * @param userId - User ID
 */
export async function getUser(userId: string): Promise<User> {
  try {
    const snap = await getDoc(doc(db, COLLECTIONS.USERS, userId));
    if (!snap.exists()) {
      throw new AppError('NOT_FOUND', 'User not found');
    }
    return snap.data() as User;
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError('NETWORK', `Failed to fetch user: ${(error as Error).message}`);
  }
}

/**
 * Update a user's profile.
 * @param userId - User ID
 * @param data - Fields to update
 */
export async function updateUser(userId: string, data: UpdateUserInput): Promise<void> {
  try {
    const userRef = doc(db, COLLECTIONS.USERS, userId);
    const update: Record<string, unknown> = { ...data, updatedAt: serverTimestamp() };
    if (data.displayName !== undefined) {
      update.displayNameLower = data.displayName.toLowerCase();
    }
    await updateDoc(userRef, update);
  } catch (error) {
    throw new AppError('NETWORK', `Failed to update user: ${(error as Error).message}`);
  }
}

/**
 * Search users by displayName prefix.
 * Uses Firestore >= / <= range query for prefix matching.
 * @param searchQuery - Text to search for
 */
export async function searchUsers(searchQuery: string): Promise<User[]> {
  try {
    const usersRef = collection(db, COLLECTIONS.USERS);
    const lower = searchQuery.toLowerCase();
    const end = lower + '\uf8ff';
    const q = query(
      usersRef,
      where('displayNameLower', '>=', lower),
      where('displayNameLower', '<=', end),
      orderBy('displayNameLower'),
    );
    const snap = await getDocs(q);
    return snap.docs.map((d) => d.data() as User);
  } catch (error) {
    throw new AppError('NETWORK', `Search failed: ${(error as Error).message}`);
  }
}

/**
 * Filter players by scout search criteria.
 * Builds a Firestore query from the provided filters.
 * Note: Firestore limits compound inequality queries. We filter by role first,
 * then apply client-side filtering for stats and age ranges.
 * @param filters - Scout search filters
 */
export async function getPlayersByFilters(filters: ScoutSearchFilters): Promise<User[]> {
  try {
    const usersRef = collection(db, COLLECTIONS.USERS);
    const constraints: Parameters<typeof query>[1][] = [];

    // Always filter by role (default: player)
    constraints.push(where('role', '==', filters.role ?? 'player'));

    if (filters.position) {
      constraints.push(where('position', '==', filters.position));
    }

    if (filters.throwHand) {
      constraints.push(where('throwHand', '==', filters.throwHand));
    }

    if (filters.batHand) {
      constraints.push(where('batHand', '==', filters.batHand));
    }

    if (filters.team) {
      constraints.push(where('team', '==', filters.team));
    }

    const q = query(usersRef, ...constraints);
    const snap = await getDocs(q);
    let results = snap.docs.map((d) => d.data() as User);

    // Client-side filtering for range queries (Firestore doesn't support
    // inequality on multiple fields in a single query)
    if (filters.minAge !== undefined) {
      results = results.filter((u) => u.age !== null && u.age >= filters.minAge!);
    }
    if (filters.maxAge !== undefined) {
      results = results.filter((u) => u.age !== null && u.age <= filters.maxAge!);
    }
    if (filters.minBattingAvg !== undefined) {
      results = results.filter((u) => u.stats.batting.avg >= filters.minBattingAvg!);
    }
    if (filters.minEra !== undefined) {
      // Lower ERA is better, so "minEra" acts as a max threshold
      results = results.filter((u) => u.stats.pitching.era > 0 && u.stats.pitching.era <= filters.minEra!);
    }

    return results;
  } catch (error) {
    throw new AppError('NETWORK', `Player search failed: ${(error as Error).message}`);
  }
}

/**
 * Recalculate and update aggregate stats for a user from their scores collection.
 * @param userId - User ID whose stats to recalculate
 */
export async function updateUserStats(userId: string): Promise<void> {
  try {
    const scoresRef = collection(db, COLLECTIONS.SCORES);
    const q = query(scoresRef, where('playerId', '==', userId));
    const snap = await getDocs(q);
    const scores = snap.docs.map((d) => d.data() as Score);

    const batting: BattingStats = {
      avg: 0,
      gamesPlayed: 0,
      totalAtBats: 0,
      totalHits: 0,
      totalHomeRuns: 0,
      totalRbis: 0,
    };

    const pitching: PitchingStats = {
      era: 0,
      gamesPlayed: 0,
      totalInningsPitched: 0,
      totalStrikeouts: 0,
      totalEarnedRuns: 0,
    };

    const fielding: FieldingStats = {
      fieldingPct: 0,
      totalPutouts: 0,
      totalAssists: 0,
      totalErrors: 0,
    };

    for (const score of scores) {
      if (score.batting) {
        batting.gamesPlayed++;
        batting.totalAtBats += score.batting.atBats;
        batting.totalHits += score.batting.hits;
        batting.totalHomeRuns += score.batting.homeRuns;
        batting.totalRbis += score.batting.rbis;
      }
      if (score.pitching) {
        pitching.gamesPlayed++;
        pitching.totalInningsPitched += score.pitching.inningsPitched;
        pitching.totalStrikeouts += score.pitching.strikeouts;
        pitching.totalEarnedRuns += score.pitching.earnedRuns;
      }
      if (score.fielding) {
        fielding.totalPutouts += score.fielding.putouts;
        fielding.totalAssists += score.fielding.assists;
        fielding.totalErrors += score.fielding.errors;
      }
    }

    // Calculate batting average
    batting.avg = batting.totalAtBats > 0
      ? Math.round((batting.totalHits / batting.totalAtBats) * 1000) / 1000
      : 0;

    // Calculate ERA: (earnedRuns / inningsPitched) * 9
    pitching.era = pitching.totalInningsPitched > 0
      ? Math.round((pitching.totalEarnedRuns / pitching.totalInningsPitched) * 9 * 100) / 100
      : 0;

    // Calculate fielding percentage: (putouts + assists) / (putouts + assists + errors)
    const totalChances = fielding.totalPutouts + fielding.totalAssists + fielding.totalErrors;
    fielding.fieldingPct = totalChances > 0
      ? Math.round(((fielding.totalPutouts + fielding.totalAssists) / totalChances) * 1000) / 1000
      : 0;

    const stats: UserStats = { batting, pitching, fielding };

    await updateDoc(doc(db, COLLECTIONS.USERS, userId), {
      stats,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    throw new AppError('NETWORK', `Failed to update user stats: ${(error as Error).message}`);
  }
}

/**
 * 最近登録したユーザーを取得する（おすすめ表示用）。
 * @param limitCount - 取得件数（デフォルト20）
 */
export async function getRecentUsers(limitCount: number = 20): Promise<User[]> {
  try {
    const q = query(
      collection(db, COLLECTIONS.USERS),
      orderBy('createdAt', 'desc'),
      limit(limitCount),
    );
    const snapshot = await getDocs(q);
    return snapshot.docs.map((d) => ({ uid: d.id, ...d.data() } as User));
  } catch (error) {
    throw new AppError('NETWORK', `Failed to fetch recent users: ${(error as Error).message}`);
  }
}
