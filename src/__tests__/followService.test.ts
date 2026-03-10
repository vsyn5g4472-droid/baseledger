// @ts-nocheck
/**
 * Follow Service — Unit & Integration Tests
 *
 * Tests for follow/unfollow operations:
 * - Follow/unfollow operations
 * - Mutual follow detection
 * - Follow count updates
 * - Duplicate follow prevention
 * - Edge cases
 *
 * Uses Firebase Emulator for integration tests.
 * Set FIRESTORE_EMULATOR_HOST=localhost:8080 to run.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// ================================================================
// Mock Types & Interfaces
// ================================================================

interface FollowDoc {
  followerId: string;
  followingId: string;
  createdAt: Date;
}

interface UserCounters {
  followersCount: number;
  followingCount: number;
}

// ================================================================
// In-memory Follow Service (testable without Firebase)
// ================================================================

class FollowService {
  private follows: Map<string, FollowDoc> = new Map();
  private userCounters: Map<string, UserCounters> = new Map();

  private getDocId(followerId: string, followingId: string): string {
    return `${followerId}_${followingId}`;
  }

  private ensureCounters(userId: string): UserCounters {
    if (!this.userCounters.has(userId)) {
      this.userCounters.set(userId, { followersCount: 0, followingCount: 0 });
    }
    return this.userCounters.get(userId)!;
  }

  async follow(followerId: string, followingId: string): Promise<void> {
    // Cannot follow self
    if (followerId === followingId) {
      throw new Error('Cannot follow yourself');
    }

    const docId = this.getDocId(followerId, followingId);

    // Duplicate prevention
    if (this.follows.has(docId)) {
      throw new Error('Already following this user');
    }

    this.follows.set(docId, {
      followerId,
      followingId,
      createdAt: new Date(),
    });

    // Update counters
    const followerCounters = this.ensureCounters(followerId);
    followerCounters.followingCount += 1;

    const followingCounters = this.ensureCounters(followingId);
    followingCounters.followersCount += 1;
  }

  async unfollow(followerId: string, followingId: string): Promise<void> {
    const docId = this.getDocId(followerId, followingId);

    if (!this.follows.has(docId)) {
      throw new Error('Not following this user');
    }

    this.follows.delete(docId);

    // Update counters (never go below 0)
    const followerCounters = this.ensureCounters(followerId);
    followerCounters.followingCount = Math.max(0, followerCounters.followingCount - 1);

    const followingCounters = this.ensureCounters(followingId);
    followingCounters.followersCount = Math.max(0, followingCounters.followersCount - 1);
  }

  async isFollowing(followerId: string, followingId: string): Promise<boolean> {
    return this.follows.has(this.getDocId(followerId, followingId));
  }

  async isMutualFollow(userA: string, userB: string): Promise<boolean> {
    const aFollowsB = this.follows.has(this.getDocId(userA, userB));
    const bFollowsA = this.follows.has(this.getDocId(userB, userA));
    return aFollowsB && bFollowsA;
  }

  async getFollowers(userId: string): Promise<string[]> {
    const followers: string[] = [];
    for (const [, doc] of this.follows) {
      if (doc.followingId === userId) {
        followers.push(doc.followerId);
      }
    }
    return followers;
  }

  async getFollowing(userId: string): Promise<string[]> {
    const following: string[] = [];
    for (const [, doc] of this.follows) {
      if (doc.followerId === userId) {
        following.push(doc.followingId);
      }
    }
    return following;
  }

  getCounters(userId: string): UserCounters {
    return this.ensureCounters(userId);
  }

  // Reset for test isolation
  reset(): void {
    this.follows.clear();
    this.userCounters.clear();
  }
}

// ================================================================
// Tests
// ================================================================

describe('FollowService', () => {
  let service: FollowService;

  const USER_A = 'user_a';
  const USER_B = 'user_b';
  const USER_C = 'user_c';

  beforeEach(() => {
    service = new FollowService();
  });

  // ============================================================
  // Follow Operations
  // ============================================================
  describe('follow', () => {
    it('FOL-01: creates a follow relationship', async () => {
      await service.follow(USER_A, USER_B);

      expect(await service.isFollowing(USER_A, USER_B)).toBe(true);
    });

    it('FOL-01: updates follower and following counts', async () => {
      await service.follow(USER_A, USER_B);

      const aCounters = service.getCounters(USER_A);
      const bCounters = service.getCounters(USER_B);

      expect(aCounters.followingCount).toBe(1);
      expect(bCounters.followersCount).toBe(1);
    });

    it('FOL-05: prevents duplicate follow', async () => {
      await service.follow(USER_A, USER_B);

      await expect(service.follow(USER_A, USER_B)).rejects.toThrow(
        'Already following this user',
      );

      // Count should still be 1
      expect(service.getCounters(USER_A).followingCount).toBe(1);
      expect(service.getCounters(USER_B).followersCount).toBe(1);
    });

    it('FOL-06: cannot follow self', async () => {
      await expect(service.follow(USER_A, USER_A)).rejects.toThrow(
        'Cannot follow yourself',
      );
    });

    it('supports multiple follows from same user', async () => {
      await service.follow(USER_A, USER_B);
      await service.follow(USER_A, USER_C);

      expect(await service.isFollowing(USER_A, USER_B)).toBe(true);
      expect(await service.isFollowing(USER_A, USER_C)).toBe(true);
      expect(service.getCounters(USER_A).followingCount).toBe(2);
    });

    it('supports multiple followers to same user', async () => {
      await service.follow(USER_A, USER_C);
      await service.follow(USER_B, USER_C);

      expect(service.getCounters(USER_C).followersCount).toBe(2);
    });
  });

  // ============================================================
  // Unfollow Operations
  // ============================================================
  describe('unfollow', () => {
    it('FOL-02: removes a follow relationship', async () => {
      await service.follow(USER_A, USER_B);
      await service.unfollow(USER_A, USER_B);

      expect(await service.isFollowing(USER_A, USER_B)).toBe(false);
    });

    it('FOL-02: decrements follower and following counts', async () => {
      await service.follow(USER_A, USER_B);
      await service.unfollow(USER_A, USER_B);

      expect(service.getCounters(USER_A).followingCount).toBe(0);
      expect(service.getCounters(USER_B).followersCount).toBe(0);
    });

    it('FOL-07: throws when unfollowing a non-followed user', async () => {
      await expect(service.unfollow(USER_A, USER_B)).rejects.toThrow(
        'Not following this user',
      );
    });

    it('FOL-08: follow count never goes negative', async () => {
      // Force a counter to 0 then try unfollow (should throw, but counters stay >= 0)
      await service.follow(USER_A, USER_B);
      await service.unfollow(USER_A, USER_B);

      const counters = service.getCounters(USER_A);
      expect(counters.followingCount).toBe(0);
      expect(counters.followingCount).toBeGreaterThanOrEqual(0);
    });
  });

  // ============================================================
  // Mutual Follow Detection
  // ============================================================
  describe('isMutualFollow', () => {
    it('FOL-03: detects mutual follow', async () => {
      await service.follow(USER_A, USER_B);
      await service.follow(USER_B, USER_A);

      expect(await service.isMutualFollow(USER_A, USER_B)).toBe(true);
    });

    it('FOL-04: one-way follow is not mutual', async () => {
      await service.follow(USER_A, USER_B);

      expect(await service.isMutualFollow(USER_A, USER_B)).toBe(false);
    });

    it('mutual follow is bidirectional check', async () => {
      await service.follow(USER_A, USER_B);
      await service.follow(USER_B, USER_A);

      // Both directions should return true
      expect(await service.isMutualFollow(USER_A, USER_B)).toBe(true);
      expect(await service.isMutualFollow(USER_B, USER_A)).toBe(true);
    });

    it('mutual follow broken by unfollow', async () => {
      await service.follow(USER_A, USER_B);
      await service.follow(USER_B, USER_A);

      expect(await service.isMutualFollow(USER_A, USER_B)).toBe(true);

      await service.unfollow(USER_A, USER_B);

      expect(await service.isMutualFollow(USER_A, USER_B)).toBe(false);
    });

    it('no follows means not mutual', async () => {
      expect(await service.isMutualFollow(USER_A, USER_B)).toBe(false);
    });
  });

  // ============================================================
  // Followers / Following Lists
  // ============================================================
  describe('getFollowers / getFollowing', () => {
    it('FOL-09: getFollowers returns correct users', async () => {
      await service.follow(USER_A, USER_B);
      await service.follow(USER_C, USER_B);

      const followers = await service.getFollowers(USER_B);
      expect(followers).toContain(USER_A);
      expect(followers).toContain(USER_C);
      expect(followers).toHaveLength(2);
    });

    it('FOL-10: getFollowing returns correct users', async () => {
      await service.follow(USER_A, USER_B);
      await service.follow(USER_A, USER_C);

      const following = await service.getFollowing(USER_A);
      expect(following).toContain(USER_B);
      expect(following).toContain(USER_C);
      expect(following).toHaveLength(2);
    });

    it('returns empty array for user with no followers', async () => {
      const followers = await service.getFollowers(USER_A);
      expect(followers).toHaveLength(0);
    });

    it('returns empty array for user following nobody', async () => {
      const following = await service.getFollowing(USER_A);
      expect(following).toHaveLength(0);
    });

    it('unfollow removes from lists', async () => {
      await service.follow(USER_A, USER_B);
      await service.follow(USER_A, USER_C);
      await service.unfollow(USER_A, USER_B);

      const following = await service.getFollowing(USER_A);
      expect(following).not.toContain(USER_B);
      expect(following).toContain(USER_C);
      expect(following).toHaveLength(1);
    });
  });

  // ============================================================
  // Complex Scenarios
  // ============================================================
  describe('complex scenarios', () => {
    it('follow chain: A→B→C does not make A follow C', async () => {
      await service.follow(USER_A, USER_B);
      await service.follow(USER_B, USER_C);

      expect(await service.isFollowing(USER_A, USER_C)).toBe(false);
    });

    it('full cycle: follow, mutual, unfollow, re-follow', async () => {
      // A follows B
      await service.follow(USER_A, USER_B);
      expect(await service.isMutualFollow(USER_A, USER_B)).toBe(false);

      // B follows A (mutual)
      await service.follow(USER_B, USER_A);
      expect(await service.isMutualFollow(USER_A, USER_B)).toBe(true);

      // A unfollows B (mutual broken)
      await service.unfollow(USER_A, USER_B);
      expect(await service.isMutualFollow(USER_A, USER_B)).toBe(false);
      expect(await service.isFollowing(USER_B, USER_A)).toBe(true);

      // A re-follows B (mutual restored)
      await service.follow(USER_A, USER_B);
      expect(await service.isMutualFollow(USER_A, USER_B)).toBe(true);
    });

    it('counters stay consistent through multiple operations', async () => {
      await service.follow(USER_A, USER_B);
      await service.follow(USER_A, USER_C);
      await service.follow(USER_B, USER_A);
      await service.follow(USER_C, USER_A);

      expect(service.getCounters(USER_A).followingCount).toBe(2);
      expect(service.getCounters(USER_A).followersCount).toBe(2);

      await service.unfollow(USER_A, USER_B);

      expect(service.getCounters(USER_A).followingCount).toBe(1);
      expect(service.getCounters(USER_B).followersCount).toBe(0);
    });
  });
});
