import {
  doc,
  getDoc,
  addDoc,
  deleteDoc,
  updateDoc,
  collection,
  query,
  where,
  orderBy,
  limit as fbLimit,
  startAfter,
  getDocs,
  increment,
  runTransaction,
  Timestamp,
  QueryDocumentSnapshot,
  DocumentData,
  QueryConstraint,
} from 'firebase/firestore';
import { db, COLLECTIONS } from './firebase';
import {
  Post,
  Comment,
  Like,
  CreatePostInput,
  PaginatedResult,
  AppError,
} from '../models/types';
import { uploadImage, uploadVideo } from './storageService';
import { getFollowingIds } from './followService';
import { getUser } from './userService';
import { createNotification } from './notificationService';

/**
 * Create a new post with optional media uploads.
 * Increments the author's postsCount.
 * @param authorId - Post author's user ID
 * @param input - Post creation input
 */
export async function createPost(authorId: string, input: CreatePostInput): Promise<Post> {
  try {
    const author = await getUser(authorId);

    // Upload media files
    const mediaURLs: string[] = [];
    for (let i = 0; i < input.mediaURIs.length; i++) {
      const uri = input.mediaURIs[i];
      const isVideo = uri.endsWith('.mp4') || uri.endsWith('.mov') || input.type === 'video';
      const postMediaId = `${Date.now()}_${i}`;
      const path = `posts/${postMediaId}/${isVideo ? 'media.mp4' : 'media.jpg'}`;
      const url = isVideo
        ? await uploadVideo(uri, path)
        : await uploadImage(uri, path);
      mediaURLs.push(url);
    }

    const postData = {
      authorId,
      authorName: author.displayName,
      authorPhotoURL: author.photoURL,
      type: input.type,
      content: input.content,
      mediaURLs,
      externalVideoUrl: input.externalVideoUrl ?? null,
      statsData: input.statsData,
      likesCount: 0,
      commentsCount: 0,
      visibility: input.visibility,
      teamId: input.teamId,
      createdAt: Timestamp.now(),
    };

    const postRef = await addDoc(collection(db, COLLECTIONS.POSTS), postData);

    // Increment author's postsCount
    await updateDoc(doc(db, COLLECTIONS.USERS, authorId), {
      postsCount: increment(1),
    });

    return { id: postRef.id, ...postData } as Post;
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError('NETWORK', `Failed to create post: ${(error as Error).message}`);
  }
}

/**
 * Get feed posts for a user (their own posts + posts from followed users).
 * Uses read-time fan-out: fetches following IDs then queries posts.
 * Firestore `in` operator is limited to 30 items per query.
 * @param userId - Current user's ID
 * @param lastDoc - Cursor for pagination
 * @param pageLimit - Number of results per page
 */
export async function getFeedPosts(
  userId: string,
  lastDoc?: unknown,
  pageLimit: number = 20,
): Promise<PaginatedResult<Post>> {
  try {
    const followingIds = await getFollowingIds(userId);
    // Include own posts in feed
    const authorIds = [userId, ...followingIds];

    // Firestore `in` supports max 30 values; chunk if needed
    const allPosts: { doc: QueryDocumentSnapshot<DocumentData>; data: Post }[] = [];

    for (let i = 0; i < authorIds.length; i += 30) {
      const chunk = authorIds.slice(i, i + 30);
      const postsRef = collection(db, COLLECTIONS.POSTS);
      const constraints: any[] = [
        where('authorId', 'in', chunk),
        orderBy('createdAt', 'desc'),
        fbLimit(pageLimit + 1),
      ];

      if (lastDoc) {
        constraints.splice(2, 0, startAfter(lastDoc as QueryDocumentSnapshot<DocumentData>));
      }

      const q = query(postsRef, ...(constraints as any[]));
      const snap = await getDocs(q);
      snap.docs.forEach((d) => {
        allPosts.push({ doc: d, data: { id: d.id, ...d.data() } as Post });
      });
    }

    // Sort merged results by createdAt descending
    allPosts.sort((a, b) => b.data.createdAt.toMillis() - a.data.createdAt.toMillis());

    const sliced = allPosts.slice(0, pageLimit + 1);
    const hasMore = sliced.length > pageLimit;
    const items = sliced.slice(0, pageLimit).map((p) => p.data);
    const lastDocument = sliced.length > 0 ? sliced[Math.min(sliced.length - 1, pageLimit - 1)].doc : null;

    return { items, lastDoc: lastDocument, hasMore };
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError('NETWORK', `Failed to get feed: ${(error as Error).message}`);
  }
}

/**
 * Get public posts for the discover feed.
 * @param lastDoc - Cursor for pagination
 * @param pageLimit - Number of results per page
 */
export async function getPublicPosts(
  lastDoc?: unknown,
  pageLimit: number = 20,
): Promise<PaginatedResult<Post>> {
  try {
    const postsRef = collection(db, COLLECTIONS.POSTS);
    const constraints: any[] = [
      where('visibility', '==', 'public'),
      orderBy('createdAt', 'desc'),
      fbLimit(pageLimit + 1),
    ];

    if (lastDoc) {
      constraints.splice(2, 0, startAfter(lastDoc as QueryDocumentSnapshot<DocumentData>));
    }

    const q = query(postsRef, ...(constraints as any[]));
    const snap = await getDocs(q);
    const docs = snap.docs;
    const hasMore = docs.length > pageLimit;
    const items = docs.slice(0, pageLimit).map((d) => ({ id: d.id, ...d.data() })) as Post[];

    return {
      items,
      lastDoc: docs.length > 0 ? docs[Math.min(docs.length - 1, pageLimit - 1)] : null,
      hasMore,
    };
  } catch (error) {
    throw new AppError('NETWORK', `Failed to get public posts: ${(error as Error).message}`);
  }
}

/**
 * Get posts by a specific user.
 * @param userId - User whose posts to fetch
 * @param lastDoc - Cursor for pagination
 * @param pageLimit - Number of results per page
 */
export async function getUserPosts(
  userId: string,
  lastDoc?: unknown,
  pageLimit: number = 20,
): Promise<PaginatedResult<Post>> {
  try {
    const postsRef = collection(db, COLLECTIONS.POSTS);
    const constraints: any[] = [
      where('authorId', '==', userId),
      orderBy('createdAt', 'desc'),
      fbLimit(pageLimit + 1),
    ];

    if (lastDoc) {
      constraints.splice(2, 0, startAfter(lastDoc as QueryDocumentSnapshot<DocumentData>));
    }

    const q = query(postsRef, ...(constraints as any[]));
    const snap = await getDocs(q);
    const docs = snap.docs;
    const hasMore = docs.length > pageLimit;
    const items = docs.slice(0, pageLimit).map((d) => ({ id: d.id, ...d.data() })) as Post[];

    return {
      items,
      lastDoc: docs.length > 0 ? docs[Math.min(docs.length - 1, pageLimit - 1)] : null,
      hasMore,
    };
  } catch (error) {
    throw new AppError('NETWORK', `Failed to get user posts: ${(error as Error).message}`);
  }
}

/**
 * Get posts for a specific team.
 * @param teamId - Team ID
 * @param lastDoc - Cursor for pagination
 * @param pageLimit - Number of results per page
 */
export async function getTeamPosts(
  teamId: string,
  lastDoc?: unknown,
  pageLimit: number = 20,
): Promise<PaginatedResult<Post>> {
  try {
    const postsRef = collection(db, COLLECTIONS.POSTS);
    const constraints: any[] = [
      where('teamId', '==', teamId),
      orderBy('createdAt', 'desc'),
      fbLimit(pageLimit + 1),
    ];

    if (lastDoc) {
      constraints.splice(2, 0, startAfter(lastDoc as QueryDocumentSnapshot<DocumentData>));
    }

    const q = query(postsRef, ...(constraints as any[]));
    const snap = await getDocs(q);
    const docs = snap.docs;
    const hasMore = docs.length > pageLimit;
    const items = docs.slice(0, pageLimit).map((d) => ({ id: d.id, ...d.data() })) as Post[];

    return {
      items,
      lastDoc: docs.length > 0 ? docs[Math.min(docs.length - 1, pageLimit - 1)] : null,
      hasMore,
    };
  } catch (error) {
    throw new AppError('NETWORK', `Failed to get team posts: ${(error as Error).message}`);
  }
}

/**
 * Get a single post by ID.
 * @param postId - Post document ID
 */
export async function getPost(postId: string): Promise<Post> {
  try {
    const snap = await getDoc(doc(db, COLLECTIONS.POSTS, postId));
    if (!snap.exists()) {
      throw new AppError('NOT_FOUND', 'Post not found');
    }
    return { id: snap.id, ...snap.data() } as Post;
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError('NETWORK', `Failed to get post: ${(error as Error).message}`);
  }
}

/**
 * Like a post. Uses a transaction to atomically create the like doc and increment the counter.
 * @param postId - Post to like
 * @param userId - User who is liking
 */
export async function likePost(postId: string, userId: string): Promise<void> {
  try {
    const likeId = `${postId}_${userId}`;
    const likeRef = doc(db, COLLECTIONS.LIKES, likeId);
    const postRef = doc(db, COLLECTIONS.POSTS, postId);

    await runTransaction(db, async (transaction) => {
      const likeSnap = await transaction.get(likeRef);
      if (likeSnap.exists()) return; // Already liked

      const likeData: Like = {
        postId,
        userId,
        createdAt: Timestamp.now(),
      };

      transaction.set(likeRef, likeData);
      transaction.update(postRef, { likesCount: increment(1) });
    });

    // Send notification to post author (fire and forget)
    const post = await getPost(postId);
    if (post.authorId !== userId) {
      createNotification(post.authorId, 'like', userId, { postId }).catch(() => {});
    }
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError('NETWORK', `Failed to like post: ${(error as Error).message}`);
  }
}

/**
 * Unlike a post. Uses a transaction to atomically remove the like and decrement the counter.
 * @param postId - Post to unlike
 * @param userId - User who is unliking
 */
export async function unlikePost(postId: string, userId: string): Promise<void> {
  try {
    const likeId = `${postId}_${userId}`;
    const likeRef = doc(db, COLLECTIONS.LIKES, likeId);
    const postRef = doc(db, COLLECTIONS.POSTS, postId);

    await runTransaction(db, async (transaction) => {
      const likeSnap = await transaction.get(likeRef);
      if (!likeSnap.exists()) return; // Not liked

      transaction.delete(likeRef);
      transaction.update(postRef, { likesCount: increment(-1) });
    });
  } catch (error) {
    throw new AppError('NETWORK', `Failed to unlike post: ${(error as Error).message}`);
  }
}

/**
 * Check if a user has liked a post.
 * @param postId - Post ID
 * @param userId - User ID
 */
export async function isLiked(postId: string, userId: string): Promise<boolean> {
  try {
    const likeId = `${postId}_${userId}`;
    const snap = await getDoc(doc(db, COLLECTIONS.LIKES, likeId));
    return snap.exists();
  } catch (error) {
    throw new AppError('NETWORK', `Failed to check like status: ${(error as Error).message}`);
  }
}

/**
 * Add a comment to a post. Increments the post's commentsCount.
 * @param postId - Post to comment on
 * @param comment - Comment data (authorId, authorName, authorPhotoURL, content)
 */
export async function addComment(
  postId: string,
  comment: { authorId: string; authorName: string; authorPhotoURL: string | null; content: string },
): Promise<Comment> {
  try {
    const commentData = {
      authorId: comment.authorId,
      authorName: comment.authorName,
      authorPhotoURL: comment.authorPhotoURL,
      content: comment.content,
      createdAt: Timestamp.now(),
    };

    const commentsRef = collection(db, COLLECTIONS.POSTS, postId, COLLECTIONS.COMMENTS);
    const commentRef = await addDoc(commentsRef, commentData);

    // Increment comment count
    await updateDoc(doc(db, COLLECTIONS.POSTS, postId), {
      commentsCount: increment(1),
    });

    // Send notification to post author (fire and forget)
    const post = await getPost(postId);
    if (post.authorId !== comment.authorId) {
      createNotification(post.authorId, 'comment', comment.authorId, { postId }).catch(() => {});
    }

    return { id: commentRef.id, ...commentData } as Comment;
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError('NETWORK', `Failed to add comment: ${(error as Error).message}`);
  }
}

/**
 * Get comments for a post with pagination.
 * @param postId - Post ID
 * @param lastDoc - Cursor for pagination
 * @param pageLimit - Number of results per page
 */
export async function getComments(
  postId: string,
  lastDoc?: unknown,
  pageLimit: number = 20,
): Promise<PaginatedResult<Comment>> {
  try {
    const commentsRef = collection(db, COLLECTIONS.POSTS, postId, COLLECTIONS.COMMENTS);
    const constraints: any[] = [
      orderBy('createdAt', 'desc'),
      fbLimit(pageLimit + 1),
    ];

    if (lastDoc) {
      constraints.splice(1, 0, startAfter(lastDoc as QueryDocumentSnapshot<DocumentData>));
    }

    const q = query(commentsRef, ...(constraints as any[]));
    const snap = await getDocs(q);
    const docs = snap.docs;
    const hasMore = docs.length > pageLimit;
    const items = docs.slice(0, pageLimit).map((d) => ({
      id: d.id,
      ...d.data(),
    })) as Comment[];

    return {
      items,
      lastDoc: docs.length > 0 ? docs[Math.min(docs.length - 1, pageLimit - 1)] : null,
      hasMore,
    };
  } catch (error) {
    throw new AppError('NETWORK', `Failed to get comments: ${(error as Error).message}`);
  }
}

/**
 * Delete a post. Only the author can delete their own post.
 * Decrements the author's postsCount.
 * @param postId - Post to delete
 * @param authorId - Must match the post's authorId
 */
export async function deletePost(postId: string, authorId: string): Promise<void> {
  try {
    const post = await getPost(postId);
    if (post.authorId !== authorId) {
      throw new AppError('FORBIDDEN', 'Only the author can delete this post');
    }

    await deleteDoc(doc(db, COLLECTIONS.POSTS, postId));

    // Decrement author's postsCount
    await updateDoc(doc(db, COLLECTIONS.USERS, authorId), {
      postsCount: increment(-1),
    });
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError('NETWORK', `Failed to delete post: ${(error as Error).message}`);
  }
}
