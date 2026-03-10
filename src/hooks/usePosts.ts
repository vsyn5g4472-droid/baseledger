import { useState, useCallback, useRef } from 'react';
import { Timestamp } from 'firebase/firestore';
import { Post, CreatePostInput } from '../models/types';
import { useAuth } from '../contexts/AuthContext';
import { createPost as firebaseCreatePost } from '../services/postService';
import { uploadImage } from '../services/storageService';

const MOCK_POSTS: Post[] = [
  {
    id: 'post-001',
    authorId: 'mock-user-001',
    authorName: '田中 翔太',
    authorPhotoURL: null,
    type: 'highlight',
    content: '今日の試合で自己最速152km/hを記録しました！チームの勝利に貢献できて嬉しいです。',
    mediaURLs: [],
    externalVideoUrl: null,
    statsData: null,
    likesCount: 42,
    commentsCount: 8,
    visibility: 'public',
    teamId: 'team-001',
    createdAt: Timestamp.now(),
  },
  {
    id: 'post-002',
    authorId: 'mock-user-002',
    authorName: '佐藤 健太',
    authorPhotoURL: null,
    type: 'stats',
    content: '今シーズンの打率が.320を超えました。コーチのアドバイスのおかげです。',
    mediaURLs: [],
    externalVideoUrl: null,
    statsData: { avg: 0.325, hits: 52, atBats: 160 },
    likesCount: 38,
    commentsCount: 5,
    visibility: 'public',
    teamId: null,
    createdAt: Timestamp.now(),
  },
  {
    id: 'post-003',
    authorId: 'mock-user-003',
    authorName: '鈴木 大輔',
    authorPhotoURL: null,
    type: 'text',
    content: '明日の練習メニューを共有します。朝9時からバッティング練習、午後はフィールディングに集中します。',
    mediaURLs: [],
    externalVideoUrl: null,
    statsData: null,
    likesCount: 15,
    commentsCount: 3,
    visibility: 'team',
    teamId: 'team-001',
    createdAt: Timestamp.now(),
  },
  {
    id: 'post-004',
    authorId: 'mock-user-004',
    authorName: '山本 誠',
    authorPhotoURL: null,
    type: 'highlight',
    content: 'ダイビングキャッチで試合を救いました！フィールディング練習の成果が出ています。',
    mediaURLs: [],
    externalVideoUrl: null,
    statsData: null,
    likesCount: 67,
    commentsCount: 12,
    visibility: 'public',
    teamId: 'team-002',
    createdAt: Timestamp.now(),
  },
  {
    id: 'post-005',
    authorId: 'mock-user-005',
    authorName: '中村 拓也',
    authorPhotoURL: null,
    type: 'stats',
    content: '7回を投げて10奪三振、無失点で完封勝利！',
    mediaURLs: [],
    externalVideoUrl: null,
    statsData: { inningsPitched: 7, strikeouts: 10, earnedRuns: 0 },
    likesCount: 89,
    commentsCount: 15,
    visibility: 'public',
    teamId: null,
    createdAt: Timestamp.now(),
  },
];

const PAGE_SIZE = 5;

export function useFeedPosts(): {
  posts: Post[];
  loading: boolean;
  refreshing: boolean;
  loadMore: () => Promise<void>;
  refresh: () => Promise<void>;
  hasMore: boolean;
} {
  const [posts, setPosts] = useState<Post[]>(MOCK_POSTS);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const pageRef = useRef(1);

  const loadMore = useCallback(async () => {
    if (loading || !hasMore) return;
    setLoading(true);
    // TODO: Replace with Firestore paginated query
    await new Promise((resolve) => setTimeout(resolve, 300));
    pageRef.current += 1;
    if (pageRef.current > 3) {
      setHasMore(false);
    } else {
      const morePosts: Post[] = MOCK_POSTS.map((p) => ({
        ...p,
        id: `${p.id}-page${pageRef.current}`,
      }));
      setPosts((prev) => [...prev, ...morePosts]);
    }
    setLoading(false);
  }, [loading, hasMore]);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    // TODO: Replace with Firestore query
    await new Promise((resolve) => setTimeout(resolve, 300));
    pageRef.current = 1;
    setPosts([...MOCK_POSTS]);
    setHasMore(true);
    setRefreshing(false);
  }, []);

  return { posts, loading, refreshing, loadMore, refresh, hasMore };
}

export function useUserPosts(userId: string): {
  posts: Post[];
  loading: boolean;
  loadMore: () => Promise<void>;
  hasMore: boolean;
} {
  const [posts, setPosts] = useState<Post[]>(
    MOCK_POSTS.filter((p) => p.authorId === userId),
  );
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(false);

  const loadMore = useCallback(async () => {
    if (loading || !hasMore) return;
    setLoading(true);
    // TODO: Replace with Firestore paginated query filtered by userId
    await new Promise((resolve) => setTimeout(resolve, 300));
    setHasMore(false);
    setLoading(false);
  }, [loading, hasMore]);

  return { posts, loading, loadMore, hasMore };
}

// Track which posts the current user has liked (mock)
const likedPostIds = new Set<string>();

export function usePostActions(): {
  likePost: (postId: string) => Promise<void>;
  unlikePost: (postId: string) => Promise<void>;
  createPost: (input: CreatePostInput) => Promise<void>;
  deletePost: (postId: string) => Promise<void>;
} {
  const { currentUser } = useAuth();

  const likePost = useCallback(async (postId: string) => {
    likedPostIds.add(postId);
    await new Promise((resolve) => setTimeout(resolve, 100));
  }, []);

  const unlikePost = useCallback(async (postId: string) => {
    likedPostIds.delete(postId);
    await new Promise((resolve) => setTimeout(resolve, 100));
  }, []);

  const createPost = useCallback(
    async (input: CreatePostInput) => {
      if (!currentUser) throw new Error('Not authenticated');

      // Upload images to Firebase Storage
      const mediaURLs: string[] = [];
      for (let i = 0; i < input.mediaURIs.length; i++) {
        const uri = input.mediaURIs[i];
        const path = `posts/${currentUser.uid}_${Date.now()}_${i}.jpg`;
        const url = await uploadImage(uri, path);
        mediaURLs.push(url);
      }

      // Write directly to Firestore using the auth context user
      const { addDoc, collection, doc, updateDoc, increment, Timestamp: FbTimestamp } =
        await import('firebase/firestore');
      const { db, COLLECTIONS } = await import('../services/firebase');

      const postData = {
        authorId: currentUser.uid,
        authorName: currentUser.displayName,
        authorPhotoURL: currentUser.photoURL,
        type: input.type,
        content: input.content,
        mediaURLs,
        externalVideoUrl: input.externalVideoUrl ?? null,
        statsData: input.statsData,
        likesCount: 0,
        commentsCount: 0,
        visibility: input.visibility,
        teamId: input.teamId,
        createdAt: FbTimestamp.now(),
      };

      await addDoc(collection(db, COLLECTIONS.POSTS), postData);
    },
    [currentUser],
  );

  const deletePost = useCallback(async (postId: string) => {
    await new Promise((resolve) => setTimeout(resolve, 200));
    console.log('Deleted post:', postId);
  }, []);

  return { likePost, unlikePost, createPost, deletePost };
}
