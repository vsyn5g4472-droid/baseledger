import { useState, useCallback, useEffect, useRef } from 'react';
import { User } from '../models/types';
import { useAuth } from '../contexts/AuthContext';
import {
  follow,
  unfollow,
  isFollowing as checkIsFollowing,
  isMutualFollow,
  getFollowers,
  getFollowing,
} from '../services/followService';
import { getUser } from '../services/userService';

export function useFollow(targetUserId: string): {
  isFollowing: boolean;
  isMutual: boolean;
  loading: boolean;
  toggleFollow: () => Promise<void>;
} {
  const { currentUser } = useAuth();
  const [isFollowing, setIsFollowing] = useState(false);
  const [isMutual, setIsMutual] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!currentUser) {
      setIsFollowing(false);
      setIsMutual(false);
      setLoading(false);
      return;
    }

    let cancelled = false;

    (async () => {
      try {
        const [followingResult, mutualResult] = await Promise.all([
          checkIsFollowing(currentUser.uid, targetUserId),
          isMutualFollow(currentUser.uid, targetUserId),
        ]);
        if (!cancelled) {
          setIsFollowing(followingResult);
          setIsMutual(mutualResult);
        }
      } catch (error) {
        if (__DEV__) console.error('Failed to check follow status:', error);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [currentUser, targetUserId]);

  const toggleFollow = useCallback(async () => {
    if (!currentUser) return;
    setLoading(true);
    const wasFollowing = isFollowing;
    setIsFollowing(!wasFollowing);

    try {
      if (wasFollowing) {
        await unfollow(currentUser.uid, targetUserId);
        setIsMutual(false);
      } else {
        await follow(currentUser.uid, targetUserId);
        const mutual = await isMutualFollow(currentUser.uid, targetUserId);
        setIsMutual(mutual);
      }
    } catch (error) {
      setIsFollowing(wasFollowing);
      if (__DEV__) console.error('Failed to toggle follow:', error);
    } finally {
      setLoading(false);
    }
  }, [currentUser, isFollowing, targetUserId]);

  return { isFollowing, isMutual, loading, toggleFollow };
}

export function useFollowers(userId: string): {
  followers: User[];
  loading: boolean;
  loadMore: () => Promise<void>;
  hasMore: boolean;
} {
  const [followers, setFollowers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasMore, setHasMore] = useState(false);
  const lastDocRef = useRef<unknown>(null);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const result = await getFollowers(userId);
        if (cancelled) return;

        const users = await Promise.all(
          result.items.map(async (f) => {
            try {
              return await getUser(f.followerId);
            } catch {
              return null;
            }
          }),
        );

        if (!cancelled) {
          setFollowers(users.filter((u): u is User => u !== null));
          lastDocRef.current = result.lastDoc;
          setHasMore(result.hasMore);
        }
      } catch (error) {
        if (__DEV__) console.error('Failed to fetch followers:', error);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [userId]);

  const loadMore = useCallback(async () => {
    if (loading || !hasMore) return;
    setLoading(true);
    try {
      const result = await getFollowers(userId, lastDocRef.current);
      const users = await Promise.all(
        result.items.map(async (f) => {
          try {
            return await getUser(f.followerId);
          } catch {
            return null;
          }
        }),
      );
      setFollowers((prev) => [
        ...prev,
        ...users.filter((u): u is User => u !== null),
      ]);
      lastDocRef.current = result.lastDoc;
      setHasMore(result.hasMore);
    } catch (error) {
      if (__DEV__) console.error('Failed to load more followers:', error);
    } finally {
      setLoading(false);
    }
  }, [loading, hasMore, userId]);

  return { followers, loading, loadMore, hasMore };
}

export function useFollowing(userId: string): {
  following: User[];
  loading: boolean;
  loadMore: () => Promise<void>;
  hasMore: boolean;
} {
  const [following, setFollowing] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasMore, setHasMore] = useState(false);
  const lastDocRef = useRef<unknown>(null);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const result = await getFollowing(userId);
        if (cancelled) return;

        const users = await Promise.all(
          result.items.map(async (f) => {
            try {
              return await getUser(f.followingId);
            } catch {
              return null;
            }
          }),
        );

        if (!cancelled) {
          setFollowing(users.filter((u): u is User => u !== null));
          lastDocRef.current = result.lastDoc;
          setHasMore(result.hasMore);
        }
      } catch (error) {
        if (__DEV__) console.error('Failed to fetch following:', error);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [userId]);

  const loadMore = useCallback(async () => {
    if (loading || !hasMore) return;
    setLoading(true);
    try {
      const result = await getFollowing(userId, lastDocRef.current);
      const users = await Promise.all(
        result.items.map(async (f) => {
          try {
            return await getUser(f.followingId);
          } catch {
            return null;
          }
        }),
      );
      setFollowing((prev) => [
        ...prev,
        ...users.filter((u): u is User => u !== null),
      ]);
      lastDocRef.current = result.lastDoc;
      setHasMore(result.hasMore);
    } catch (error) {
      if (__DEV__) console.error('Failed to load more following:', error);
    } finally {
      setLoading(false);
    }
  }, [loading, hasMore, userId]);

  return { following, loading, loadMore, hasMore };
}
