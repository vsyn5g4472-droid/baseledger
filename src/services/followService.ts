import {
  doc,
  getDoc,
  setDoc,
  deleteDoc,
  collection,
  query,
  where,
  orderBy,
  limit as fbLimit,
  startAfter,
  getDocs,
  writeBatch,
  increment,
  Timestamp,
  QueryDocumentSnapshot,
  DocumentData,
} from 'firebase/firestore';
import { db, COLLECTIONS } from './firebase';
import { Follow, User, PaginatedResult, AppError } from '../models/types';
import { createNotification } from './notificationService';

/**
 * Generate the composite document ID for a follow relationship.
 */
function followDocId(followerId: string, followingId: string): string {
  return `${followerId}_${followingId}`;
}

/**
 * Follow a user. Creates the follow document, increments follower/following counts,
 * and creates a follow notification.
 * @param followerId - The user who is following
 * @param followingId - The user being followed
 */
export async function follow(followerId: string, followingId: string): Promise<void> {
  if (followerId === followingId) {
    throw new AppError('VALIDATION', 'Cannot follow yourself');
  }

  try {
    const docId = followDocId(followerId, followingId);
    const followRef = doc(db, COLLECTIONS.FOLLOWS, docId);

    // Check if already following
    const existing = await getDoc(followRef);
    if (existing.exists()) return;

    const batch = writeBatch(db);

    // Create follow document
    const followData: Follow = {
      followerId,
      followingId,
      createdAt: Timestamp.now(),
    };
    batch.set(followRef, followData);

    // Increment follower's followingCount
    batch.update(doc(db, COLLECTIONS.USERS, followerId), {
      followingCount: increment(1),
    });

    // Increment following's followersCount
    batch.update(doc(db, COLLECTIONS.USERS, followingId), {
      followersCount: increment(1),
    });

    await batch.commit();

    // Create notification (fire and forget)
    createNotification(followingId, 'follow', followerId, {}).catch(() => {});
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError('NETWORK', `Failed to follow user: ${(error as Error).message}`);
  }
}

/**
 * Unfollow a user. Deletes the follow document and decrements counts.
 * @param followerId - The user who is unfollowing
 * @param followingId - The user being unfollowed
 */
export async function unfollow(followerId: string, followingId: string): Promise<void> {
  try {
    const docId = followDocId(followerId, followingId);
    const followRef = doc(db, COLLECTIONS.FOLLOWS, docId);

    const existing = await getDoc(followRef);
    if (!existing.exists()) return;

    const batch = writeBatch(db);

    batch.delete(followRef);

    batch.update(doc(db, COLLECTIONS.USERS, followerId), {
      followingCount: increment(-1),
    });

    batch.update(doc(db, COLLECTIONS.USERS, followingId), {
      followersCount: increment(-1),
    });

    await batch.commit();
  } catch (error) {
    throw new AppError('NETWORK', `Failed to unfollow user: ${(error as Error).message}`);
  }
}

/**
 * Check if a user is following another user.
 */
export async function isFollowing(followerId: string, followingId: string): Promise<boolean> {
  try {
    const docId = followDocId(followerId, followingId);
    const snap = await getDoc(doc(db, COLLECTIONS.FOLLOWS, docId));
    return snap.exists();
  } catch (error) {
    throw new AppError('NETWORK', `Failed to check follow status: ${(error as Error).message}`);
  }
}

/**
 * Check if two users mutually follow each other.
 */
export async function isMutualFollow(userId1: string, userId2: string): Promise<boolean> {
  try {
    const [aFollowsB, bFollowsA] = await Promise.all([
      isFollowing(userId1, userId2),
      isFollowing(userId2, userId1),
    ]);
    return aFollowsB && bFollowsA;
  } catch (error) {
    throw new AppError('NETWORK', `Failed to check mutual follow: ${(error as Error).message}`);
  }
}

/**
 * Get a user's followers with pagination.
 * @param userId - User whose followers to list
 * @param lastDoc - Last document from previous page for cursor pagination
 * @param pageLimit - Number of results per page
 */
export async function getFollowers(
  userId: string,
  lastDoc?: unknown,
  pageLimit: number = 20,
): Promise<PaginatedResult<Follow>> {
  try {
    const followsRef = collection(db, COLLECTIONS.FOLLOWS);
    const constraints: any[] = [
      where('followingId', '==', userId),
      orderBy('createdAt', 'desc'),
      fbLimit(pageLimit + 1),
    ];

    if (lastDoc) {
      constraints.splice(2, 0, startAfter(lastDoc as QueryDocumentSnapshot<DocumentData>));
    }

    const q = query(followsRef, ...(constraints as any[]));
    const snap = await getDocs(q);
    const docs = snap.docs;
    const hasMore = docs.length > pageLimit;
    const items = docs.slice(0, pageLimit).map((d) => d.data() as Follow);

    return {
      items,
      lastDoc: docs.length > 0 ? docs[Math.min(docs.length - 1, pageLimit - 1)] : null,
      hasMore,
    };
  } catch (error) {
    throw new AppError('NETWORK', `Failed to get followers: ${(error as Error).message}`);
  }
}

/**
 * Get users that a user is following, with pagination.
 * @param userId - User whose following list to get
 * @param lastDoc - Last document from previous page for cursor pagination
 * @param pageLimit - Number of results per page
 */
export async function getFollowing(
  userId: string,
  lastDoc?: unknown,
  pageLimit: number = 20,
): Promise<PaginatedResult<Follow>> {
  try {
    const followsRef = collection(db, COLLECTIONS.FOLLOWS);
    const constraints: any[] = [
      where('followerId', '==', userId),
      orderBy('createdAt', 'desc'),
      fbLimit(pageLimit + 1),
    ];

    if (lastDoc) {
      constraints.splice(2, 0, startAfter(lastDoc as QueryDocumentSnapshot<DocumentData>));
    }

    const q = query(followsRef, ...(constraints as any[]));
    const snap = await getDocs(q);
    const docs = snap.docs;
    const hasMore = docs.length > pageLimit;
    const items = docs.slice(0, pageLimit).map((d) => d.data() as Follow);

    return {
      items,
      lastDoc: docs.length > 0 ? docs[Math.min(docs.length - 1, pageLimit - 1)] : null,
      hasMore,
    };
  } catch (error) {
    throw new AppError('NETWORK', `Failed to get following: ${(error as Error).message}`);
  }
}

/**
 * Get all user IDs that a user follows. Used for building the feed query.
 * @param userId - User whose following IDs to get
 */
export async function getFollowingIds(userId: string): Promise<string[]> {
  try {
    const followsRef = collection(db, COLLECTIONS.FOLLOWS);
    const q = query(followsRef, where('followerId', '==', userId));
    const snap = await getDocs(q);
    return snap.docs.map((d) => (d.data() as Follow).followingId);
  } catch (error) {
    throw new AppError('NETWORK', `Failed to get following IDs: ${(error as Error).message}`);
  }
}
