import { useState, useCallback, useRef, useEffect } from 'react';
import { Post, CreatePostInput } from '../models/types';
import { useAuth } from '../contexts/AuthContext';
import {
  getFeedPosts,
  getPublicPosts,
  getUserPosts,
  createPost as serviceCreatePost,
  deletePost as serviceDeletePost,
  likePost as serviceLikePost,
  unlikePost as serviceUnlikePost,
  getLikedPostIds,
} from '../services/postService';
import { getFollowingIds } from '../services/followService';

const PAGE_SIZE = 20;

export function useFeedPosts(): {
  posts: Post[];
  loading: boolean;
  refreshing: boolean;
  error: string | null;
  loadMore: () => Promise<void>;
  refresh: () => Promise<void>;
  hasMore: boolean;
} {
  const { currentUser } = useAuth();
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const lastDocRef = useRef<unknown>(null);

  const fetchPosts = useCallback(
    async (isRefresh: boolean) => {
      try {
        const cursor = isRefresh ? undefined : (lastDocRef.current ?? undefined);
        let result;
        if (currentUser) {
          const followingIds = await getFollowingIds(currentUser.uid);
          // フォロー0件の場合はパブリック投稿を表示
          result = followingIds.length > 0
            ? await getFeedPosts(currentUser.uid, cursor, PAGE_SIZE)
            : await getPublicPosts(cursor, PAGE_SIZE);
        } else {
          result = await getPublicPosts(cursor, PAGE_SIZE);
        }

        // ログイン済みの場合、各投稿のいいね済み状態を一括取得して付与
        let items = result.items;
        if (currentUser) {
          const likedIds = await getLikedPostIds(currentUser.uid, items.map((p) => p.id));
          items = items.map((p) => ({ ...p, isLiked: likedIds.has(p.id) }));
        }

        if (isRefresh) {
          setPosts(items);
        } else {
          setPosts((prev) => [...prev, ...items]);
        }
        lastDocRef.current = result.lastDoc;
        setHasMore(result.hasMore);
        setError(null);
      } catch (err) {
        if (__DEV__) console.error('Failed to fetch feed posts:', err);
        setError('フィードの読み込みに失敗しました');
      }
    },
    [currentUser],
  );

  // 初回ロードおよびログイン状態変化時に再取得
  // useEffectにより loading=true が確立した後に fetchPosts が実行されるため
  // onEndReached との競合が発生しない
  useEffect(() => {
    setLoading(true);
    lastDocRef.current = null;
    fetchPosts(true).finally(() => setLoading(false));
  }, [fetchPosts]);

  const loadMore = useCallback(async () => {
    if (loading || !hasMore) return;
    setLoading(true);
    await fetchPosts(false);
    setLoading(false);
  }, [loading, hasMore, fetchPosts]);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    lastDocRef.current = null;
    await fetchPosts(true);
    setRefreshing(false);
  }, [fetchPosts]);

  return { posts, loading, refreshing, error, loadMore, refresh, hasMore };
}

export function usePublicPosts(): {
  posts: Post[];
  loading: boolean;
  refreshing: boolean;
  error: string | null;
  loadMore: () => Promise<void>;
  refresh: () => Promise<void>;
  hasMore: boolean;
} {
  const { currentUser } = useAuth();
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const lastDocRef = useRef<unknown>(null);

  const fetchPosts = useCallback(
    async (isRefresh: boolean) => {
      try {
        const cursor = isRefresh ? undefined : (lastDocRef.current ?? undefined);
        const result = await getPublicPosts(cursor, PAGE_SIZE);

        let items = result.items;
        if (currentUser) {
          const likedIds = await getLikedPostIds(currentUser.uid, items.map((p) => p.id));
          items = items.map((p) => ({ ...p, isLiked: likedIds.has(p.id) }));
        }

        if (isRefresh) {
          setPosts(items);
        } else {
          setPosts((prev) => [...prev, ...items]);
        }
        lastDocRef.current = result.lastDoc;
        setHasMore(result.hasMore);
        setError(null);
      } catch (err) {
        if (__DEV__) console.error('Failed to fetch public posts:', err);
        setError('フィードの読み込みに失敗しました');
      }
    },
    [currentUser],
  );

  useEffect(() => {
    setLoading(true);
    lastDocRef.current = null;
    fetchPosts(true).finally(() => setLoading(false));
  }, [fetchPosts]);

  const loadMore = useCallback(async () => {
    if (loading || !hasMore) return;
    setLoading(true);
    await fetchPosts(false);
    setLoading(false);
  }, [loading, hasMore, fetchPosts]);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    lastDocRef.current = null;
    await fetchPosts(true);
    setRefreshing(false);
  }, [fetchPosts]);

  return { posts, loading, refreshing, error, loadMore, refresh, hasMore };
}

export function useUserPosts(userId: string): {
  posts: Post[];
  loading: boolean;
  loadMore: () => Promise<void>;
  hasMore: boolean;
} {
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const lastDocRef = useRef<unknown>(null);
  const initialLoadDone = useRef(false);

  const fetchPosts = useCallback(
    async (isRefresh: boolean) => {
      try {
        const cursor = isRefresh ? undefined : (lastDocRef.current ?? undefined);
        const result = await getUserPosts(userId, cursor, PAGE_SIZE);

        if (isRefresh) {
          setPosts(result.items);
        } else {
          setPosts((prev) => [...prev, ...result.items]);
        }
        lastDocRef.current = result.lastDoc;
        setHasMore(result.hasMore);
      } catch (error) {
        if (__DEV__) console.error('Failed to fetch user posts:', error);
      }
    },
    [userId],
  );

  const loadMore = useCallback(async () => {
    if (loading || !hasMore) return;
    setLoading(true);
    await fetchPosts(false);
    setLoading(false);
  }, [loading, hasMore, fetchPosts]);

  if (!initialLoadDone.current) {
    initialLoadDone.current = true;
    fetchPosts(true);
  }

  return { posts, loading, loadMore, hasMore };
}

export function usePostActions(): {
  likePost: (postId: string) => Promise<void>;
  unlikePost: (postId: string) => Promise<void>;
  createPost: (input: CreatePostInput) => Promise<void>;
  deletePost: (postId: string) => Promise<void>;
} {
  const { currentUser } = useAuth();

  const likePost = useCallback(
    async (postId: string) => {
      if (!currentUser) return;
      try {
        await serviceLikePost(postId, currentUser.uid);
      } catch (error) {
        if (__DEV__) console.error('Failed to like post:', error);
        throw error;
      }
    },
    [currentUser],
  );

  const unlikePost = useCallback(
    async (postId: string) => {
      if (!currentUser) return;
      try {
        await serviceUnlikePost(postId, currentUser.uid);
      } catch (error) {
        if (__DEV__) console.error('Failed to unlike post:', error);
        throw error;
      }
    },
    [currentUser],
  );

  const createPost = useCallback(
    async (input: CreatePostInput) => {
      if (!currentUser) throw new Error('Not authenticated');
      try {
        await serviceCreatePost(currentUser.uid, input);
      } catch (error) {
        if (__DEV__) console.error('Failed to create post:', error);
        throw error;
      }
    },
    [currentUser],
  );

  const deletePost = useCallback(
    async (postId: string) => {
      if (!currentUser) throw new Error('Not authenticated');
      try {
        await serviceDeletePost(postId, currentUser.uid);
      } catch (error) {
        if (__DEV__) console.error('Failed to delete post:', error);
        throw error;
      }
    },
    [currentUser],
  );

  return { likePost, unlikePost, createPost, deletePost };
}
