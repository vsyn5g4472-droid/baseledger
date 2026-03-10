# BallPark — Comprehensive Test Plan

> **Version**: 1.0.0-mvp
> **Last Updated**: 2026-02-09
> **Author**: QA Agent

---

## Table of Contents

1. [Testing Strategy Overview](#1-testing-strategy-overview)
2. [Unit Tests](#2-unit-tests)
3. [Integration Tests](#3-integration-tests)
4. [End-to-End Test Scenarios](#4-end-to-end-test-scenarios)
5. [Edge Cases & Error Handling](#5-edge-cases--error-handling)
6. [Performance Testing](#6-performance-testing)
7. [Test Environment Setup](#7-test-environment-setup)

---

## 1. Testing Strategy Overview

| Layer | Tool | Coverage Target |
|-------|------|-----------------|
| Unit | Vitest | 90%+ for utils, services, calculators |
| Integration | Vitest + Firebase Emulator | All service-to-Firestore flows |
| E2E | Detox (or Maestro) | Critical user journeys |
| Security | Firebase Emulator rules testing | All Firestore/Storage rules |

### Test File Convention

```
src/__tests__/              # Unit & integration tests
  statsCalculator.test.ts
  followService.test.ts
  postVisibility.test.ts
  teamMembership.test.ts
  scoreAggregation.test.ts
  inputValidation.test.ts
e2e/                        # E2E tests
  onboarding.e2e.ts
  scoutFlow.e2e.ts
  coachFlow.e2e.ts
firebase/__tests__/         # Security rules tests
  firestore.rules.test.ts
  storage.rules.test.ts
```

---

## 2. Unit Tests

### 2.1 Stats Calculator (`statsCalculator.test.ts`)

#### Batting Average

| ID | Test Case | Input | Expected |
|----|-----------|-------|----------|
| BAT-01 | Standard batting average | 3 hits / 10 at-bats | 0.300 |
| BAT-02 | Perfect batting average | 4 hits / 4 at-bats | 1.000 |
| BAT-03 | Zero at-bats (no games) | 0 hits / 0 at-bats | 0.000 (not NaN) |
| BAT-04 | Hitless game | 0 hits / 5 at-bats | 0.000 |
| BAT-05 | Multi-game aggregation | Game 1: 2/4, Game 2: 1/3 | 3/7 = 0.429 |
| BAT-06 | Rounding to 3 decimal places | 1 hit / 3 at-bats | 0.333 (not 0.33333…) |

#### ERA (Earned Run Average)

| ID | Test Case | Input | Expected |
|----|-----------|-------|----------|
| ERA-01 | Standard ERA | 3 ER / 9 IP | 3.00 |
| ERA-02 | Perfect ERA | 0 ER / 7 IP | 0.00 |
| ERA-03 | Zero innings pitched | 0 ER / 0 IP | 0.00 (not Infinity) |
| ERA-04 | Fractional innings (6.1 = 6⅓) | 2 ER / 6.1 IP → 6.333 IP | 2.84 |
| ERA-05 | Fractional innings (6.2 = 6⅔) | 4 ER / 6.2 IP → 6.667 IP | 5.40 |
| ERA-06 | Multi-game aggregation | Game 1: 2 ER/6 IP, Game 2: 1 ER/3 IP | 3 ER/9 IP = 3.00 |
| ERA-07 | High ERA edge case | 10 ER / 1 IP | 90.00 |

#### WHIP (Walks + Hits per Inning Pitched)

| ID | Test Case | Input | Expected |
|----|-----------|-------|----------|
| WHIP-01 | Standard WHIP | (4 H + 2 BB) / 6 IP | 1.00 |
| WHIP-02 | Perfect WHIP | (0 H + 0 BB) / 7 IP | 0.00 |
| WHIP-03 | Zero innings pitched | 0 H, 0 BB / 0 IP | 0.00 (not Infinity) |
| WHIP-04 | Multi-game aggregation | G1: 3H+1BB/5IP, G2: 2H+1BB/4IP | 7/9 = 0.78 |

#### Fielding Percentage

| ID | Test Case | Input | Expected |
|----|-----------|-------|----------|
| FLD-01 | Standard fielding % | (10 PO + 5 A) / (10 PO + 5 A + 1 E) | 0.938 |
| FLD-02 | Perfect fielding | (8 PO + 3 A) / (8 PO + 3 A + 0 E) | 1.000 |
| FLD-03 | Zero total chances | 0 PO, 0 A, 0 E | 0.000 (not NaN) |
| FLD-04 | All errors | 0 PO, 0 A, 3 E | 0.000 |

#### OPS (On-base Plus Slugging)

| ID | Test Case | Input | Expected |
|----|-----------|-------|----------|
| OPS-01 | Standard OPS | OBP 0.350 + SLG 0.500 | 0.850 |
| OPS-02 | Zero plate appearances | No PA data | 0.000 |
| OPS-03 | Perfect OPS | OBP 1.000 + SLG 4.000 | 5.000 |
| OPS-04 | Walks affect OBP | 1H, 2BB, 3AB, 0HBP, 0SF | OBP = (1+2)/(3+2+0+0) = 0.600 |

#### Aggregation from Multiple Games

| ID | Test Case | Description |
|----|-----------|-------------|
| AGG-01 | Batting stats sum correctly | Sum totalAtBats, totalHits, totalHR, totalRBI across n games |
| AGG-02 | Pitching stats sum correctly | Sum totalIP, totalER, totalK across n games |
| AGG-03 | Fielding stats sum correctly | Sum totalPO, totalA, totalE across n games |
| AGG-04 | Recalculated averages after aggregation | avg, era, fieldingPct recomputed from sums |
| AGG-05 | Single game produces correct aggregates | 1 game = same as raw game stats |
| AGG-06 | Empty score array | No games → all zeros, no division errors |

### 2.2 Follow Logic (`followService.test.ts`)

| ID | Test Case | Expected |
|----|-----------|----------|
| FOL-01 | Follow a user | Follow doc created, follower count +1, following count +1 |
| FOL-02 | Unfollow a user | Follow doc deleted, follower count -1, following count -1 |
| FOL-03 | Mutual follow detection | A follows B and B follows A → isMutualFollow returns true |
| FOL-04 | One-way follow is not mutual | A follows B, B does not follow A → isMutualFollow returns false |
| FOL-05 | Duplicate follow prevention | Following same user twice → error or no-op, count stays at 1 |
| FOL-06 | Cannot follow self | followerId === followingId → error thrown |
| FOL-07 | Unfollow non-existent follow | Unfollow user not followed → error or no-op |
| FOL-08 | Follow count never negative | Unfollow from 0 → count stays 0 |
| FOL-09 | Get followers list returns correct users | Follow A→B, A→C → B's followers includes A, C's followers includes A |
| FOL-10 | Get following list returns correct users | Follow A→B, A→C → A's following includes B and C |

### 2.3 Post Visibility (`postVisibility.test.ts`)

| ID | Test Case | Expected |
|----|-----------|----------|
| VIS-01 | Public post visible to unauthenticated | visibility='public' → readable by anyone |
| VIS-02 | Public post visible to non-follower | visibility='public' → readable |
| VIS-03 | Followers-only post visible to follower | User follows author → readable |
| VIS-04 | Followers-only post NOT visible to non-follower | User does not follow → denied |
| VIS-05 | Followers-only post visible to author | Author can always read own posts |
| VIS-06 | Team post visible to team member | User in team → readable |
| VIS-07 | Team post NOT visible to non-member | User not in team → denied |
| VIS-08 | Team post visible to team admin | Admin is a member → readable |
| VIS-09 | Team post requires valid teamId | visibility='team' with null teamId → validation error |

### 2.4 Team Membership (`teamMembership.test.ts`)

| ID | Test Case | Expected |
|----|-----------|----------|
| TM-01 | Create team sets creator as owner | Creator's role = 'owner', added to memberIds |
| TM-02 | Join team via invite code | User added to memberIds, member doc created with role='member' |
| TM-03 | Invalid invite code rejected | Wrong code → error thrown |
| TM-04 | Leave team removes user | User removed from memberIds, member doc deleted |
| TM-05 | Owner cannot leave team | Owner tries to leave → error (must transfer or delete) |
| TM-06 | Admin can remove member | Admin calls remove → member removed |
| TM-07 | Member cannot remove other member | Non-admin remove attempt → error |
| TM-08 | Admin can promote to admin | Update member role → 'admin' |
| TM-09 | Duplicate join prevention | Same invite code used twice by same user → error or no-op |
| TM-10 | Team deletion cascades | Delete team → members subcollection cleaned up |

### 2.5 Score Aggregation (`scoreAggregation.test.ts`)

| ID | Test Case | Expected |
|----|-----------|----------|
| SC-01 | Single batting game → correct user stats | User.stats.batting reflects the single game |
| SC-02 | Multiple batting games → averaged correctly | totalHits/totalAtBats = avg |
| SC-03 | Single pitching game → correct ERA | 9 * earnedRuns / inningsPitched |
| SC-04 | Games with only batting data | pitching/fielding stats unchanged |
| SC-05 | Games with only pitching data | batting/fielding stats unchanged |
| SC-06 | Mixed batting + pitching games | Both batting and pitching stats updated |
| SC-07 | gamesPlayed increments correctly | Batting games counted separately from pitching games |

### 2.6 Input Validation (`inputValidation.test.ts`)

| ID | Test Case | Expected |
|----|-----------|----------|
| VAL-01 | Email format validation | "bad-email" → invalid, "user@test.com" → valid |
| VAL-02 | Password minimum 8 chars | "short" → invalid, "longpassword" → valid |
| VAL-03 | Display name 1-50 chars | "" → invalid, "A" → valid, 51+ chars → invalid |
| VAL-04 | Bio max 500 chars | 500 chars → valid, 501 → invalid |
| VAL-05 | Post content 1-2000 chars | "" → invalid, 2001 → invalid |
| VAL-06 | Comment content 1-500 chars | "" → invalid, 501 → invalid |
| VAL-07 | Team name 1-50 chars | "" → invalid, valid name → valid |
| VAL-08 | Negative stat values rejected | atBats: -1 → invalid |
| VAL-09 | Non-integer stat values handled | atBats: 2.5 → rounded or rejected |
| VAL-10 | Innings pitched fractional validation | 6.0, 6.1, 6.2 → valid; 6.3, 6.5 → invalid (only .0, .1, .2 are valid baseball fractions) |
| VAL-11 | Age range validation | age < 5 → invalid, age > 100 → invalid |
| VAL-12 | XSS in text fields | `<script>alert('xss')</script>` → sanitized/escaped |

---

## 3. Integration Tests

### 3.1 Auth Flow

| ID | Test Case | Steps | Expected |
|----|-----------|-------|----------|
| AUTH-INT-01 | Full registration | signUp → create user doc → verify profile exists | User doc in Firestore with correct fields |
| AUTH-INT-02 | Login returns user data | signIn → getUser → verify fields | User object matches Firestore doc |
| AUTH-INT-03 | Auth state persistence | signIn → kill app → reopen → check auth | User still authenticated via AsyncStorage |
| AUTH-INT-04 | Sign out clears state | signOut → check auth state | auth.currentUser is null |
| AUTH-INT-05 | Duplicate email registration | signUp with existing email | Firebase auth error returned |
| AUTH-INT-06 | Wrong password login | signIn with wrong password | Auth error, user not logged in |

### 3.2 Post Creation Flow

| ID | Test Case | Steps | Expected |
|----|-----------|-------|----------|
| POST-INT-01 | Create text post | createPost → query feed → find post | Post appears in public feed |
| POST-INT-02 | Post with media upload | createPost with image URI → verify Storage URL | mediaURLs populated, image accessible |
| POST-INT-03 | Like increments count | likePost → fetch post | likesCount = 1, like doc exists |
| POST-INT-04 | Unlike decrements count | likePost → unlikePost → fetch | likesCount = 0, like doc deleted |
| POST-INT-05 | Comment increments count | commentOnPost → fetch post | commentsCount = 1, comment doc exists |
| POST-INT-06 | Feed pagination | Create 25 posts → fetch page 1 (20) → fetch page 2 (5) | Correct items per page, cursor works |

### 3.3 Follow Flow

| ID | Test Case | Steps | Expected |
|----|-----------|-------|----------|
| FOL-INT-01 | Follow updates feed | A follows B → B creates post → A fetches feed | B's post appears in A's feed |
| FOL-INT-02 | Unfollow removes from feed | A unfollows B → A fetches feed | B's follower-only posts disappear from A's feed |
| FOL-INT-03 | Mutual follow enables DM | A follows B, B follows A → check mutual | isMutualFollow returns true |
| FOL-INT-04 | Follow notification created | A follows B → check B's notifications | Notification of type 'follow' exists for B |
| FOL-INT-05 | Follower/following counts sync | A follows B → check both user docs | A.followingCount +1, B.followersCount +1 |

### 3.4 Team Flow

| ID | Test Case | Steps | Expected |
|----|-----------|-------|----------|
| TEAM-INT-01 | Create and join | A creates team → B joins via code | Both in memberIds, member docs exist |
| TEAM-INT-02 | Team post isolation | B posts to team → C (non-member) queries | C cannot see team post |
| TEAM-INT-03 | Team invite notification | A invites B → check B's notifications | 'teamInvite' notification for B |
| TEAM-INT-04 | Member leaves team | B leaves → check memberIds | B removed, team still exists |
| TEAM-INT-05 | Admin promotes member | Owner promotes B to admin → check member doc | B's role = 'admin' |

### 3.5 Score Flow

| ID | Test Case | Steps | Expected |
|----|-----------|-------|----------|
| SCORE-INT-01 | Record score updates stats | addScore → calculateStats → check user doc | User.stats updated with aggregated values |
| SCORE-INT-02 | Multiple scores aggregate | Add 3 games → calculateStats | Averages computed across all 3 games |
| SCORE-INT-03 | Score triggers AI analysis | addScore → wait for Cloud Function → check score doc | aiAnalysis field populated |
| SCORE-INT-04 | Team score visibility | Add score with teamId → query team scores | Score appears in team score list |
| SCORE-INT-05 | Score with video upload | addScore with videoURI → check Storage | videoURL populated and accessible |

### 3.6 Search/Filter Flow

| ID | Test Case | Steps | Expected |
|----|-----------|-------|----------|
| SEARCH-INT-01 | Search by display name prefix | Create users "Tanaka", "Tanabe" → search "Tan" | Both returned |
| SEARCH-INT-02 | Filter by position | Create pitcher + shortstop → filter position=pitcher | Only pitcher returned |
| SEARCH-INT-03 | Filter by age range | Create age 18, 22, 30 → filter 20-25 | Only age 22 returned |
| SEARCH-INT-04 | Combined filters | position=pitcher + minAge=20 | Intersection of both filters |
| SEARCH-INT-05 | Empty search results | Search "ZZZZZ" | Empty array, no crash |

---

## 4. End-to-End Test Scenarios

### 4.1 New Player Onboarding

```
Scenario: Player signs up and sets up complete profile
  Given the app is freshly installed
  When I tap "Sign Up"
  And I enter email "player@test.com" and password "TestPass123!"
  And I select role "Player"
  And I enter display name "Test Player"
  And I select position "Shortstop"
  And I enter age 22
  And I upload a profile photo
  And I tap "Complete Setup"
  Then I should see the Feed screen
  And my profile should show "Test Player"
  And my stats should all be zero
```

### 4.2 Scout Discovers and Contacts Player

```
Scenario: Scout finds a player via search and sends DM
  Given Scout is logged in
  And Player "Star Player" exists with position=pitcher, ERA=2.50
  When Scout navigates to Search tab
  And Scout filters by position "Pitcher"
  Then "Star Player" appears in results
  When Scout taps "Star Player"
  Then Scout sees full profile with stats
  When Scout follows "Star Player"
  And "Star Player" follows Scout back (mutual)
  Then Scout can open DM with "Star Player"
  When Scout sends "Interested in your pitching stats"
  Then "Star Player" receives the message
```

### 4.3 Team Coach Manages Team and Reviews Scores

```
Scenario: Coach creates team, members join and record scores
  Given Coach is logged in
  When Coach creates team "Eagles" with description
  Then team is created with invite code
  When Player1 joins via invite code
  And Player2 joins via invite code
  Then team has 3 members (Coach + 2 players)
  When Player1 records batting stats (4 AB, 2 H, 1 HR, 3 RBI)
  And Player2 records pitching stats (7 IP, 2 ER, 9 K)
  Then Coach can view all team scores
  And Player1's batting average updates to .500
  And Player2's ERA updates to 2.57
```

### 4.4 AI Analysis Workflow

```
Scenario: Player records multiple games and gets AI feedback
  Given Player is logged in and has recorded 5 games
  When Player adds a new score
  Then AI analysis is triggered via Cloud Function
  And within 30 seconds the score doc has aiAnalysis populated
  When Player views the score detail
  Then Player sees AI-generated performance summary
  And the summary references recent trends
```

### 4.5 Full Social Interaction Flow

```
Scenario: Post, like, comment, and notification cycle
  Given UserA and UserB are logged in, UserB follows UserA
  When UserA creates a public post "Great game today!"
  Then UserB sees the post in their feed
  When UserB likes the post
  Then UserA receives a 'like' notification
  And the post shows likesCount = 1
  When UserB comments "Nice work!"
  Then UserA receives a 'comment' notification
  And the post shows commentsCount = 1
```

---

## 5. Edge Cases & Error Handling

### 5.1 Empty States

| ID | Scenario | Expected Behavior |
|----|----------|-------------------|
| EDGE-01 | No posts in feed (new user, no follows) | Show "Follow players to see their posts" empty state |
| EDGE-02 | No followers / following | Show count as 0, empty list with prompt to discover |
| EDGE-03 | No teams joined | Show "Create or join a team" prompt |
| EDGE-04 | No scores recorded | Show "Record your first game" prompt |
| EDGE-05 | No notifications | Show "You're all caught up" message |
| EDGE-06 | No search results | Show "No players found" with suggestion to adjust filters |
| EDGE-07 | No messages / conversations | Show "Start a conversation" prompt |

### 5.2 Network Errors & Offline Behavior

| ID | Scenario | Expected Behavior |
|----|----------|-------------------|
| NET-01 | Create post while offline | Post queued in Firestore offline cache, syncs when online |
| NET-02 | Load feed while offline | Cached posts displayed with "Offline" indicator |
| NET-03 | Like post while offline | Like queued, count updates optimistically |
| NET-04 | Follow user while offline | Follow queued, count updates optimistically |
| NET-05 | Network timeout on media upload | Show retry button, don't create post without media |
| NET-06 | Firebase Auth token expired | Silent refresh; if refresh fails, redirect to login |
| NET-07 | Cloud Function timeout (AI analysis) | Show "Analysis pending" state, poll or listen for update |

### 5.3 Concurrency & Race Conditions

| ID | Scenario | Expected Behavior |
|----|----------|-------------------|
| RACE-01 | Simultaneous follow/unfollow | Final state is consistent (follow or not follow, not both) |
| RACE-02 | Two users like same post simultaneously | likesCount = 2 (both recorded via FieldValue.increment) |
| RACE-03 | Rapid like/unlike toggle | Final like count matches final state (liked or not) |
| RACE-04 | Two users join same team via invite code | Both added, no duplicate member entries |
| RACE-05 | Post created during feed scroll | New post eventually appears without duplication |

### 5.4 Deleted/Invalid References

| ID | Scenario | Expected Behavior |
|----|----------|-------------------|
| DEL-01 | Post to deleted team | Error: "Team not found" or prevent post creation |
| DEL-02 | View post by deleted user | Show post with "Deleted User" placeholder |
| DEL-03 | Navigate to deleted post | Show "Post not found" error screen |
| DEL-04 | Message to user who unfollowed (no mutual) | Error: "You can only message mutual followers" |
| DEL-05 | Notification references deleted post | Notification still visible, tapping shows "Post not found" |
| DEL-06 | Team invite code for deleted team | Error: "Team no longer exists" |

### 5.5 Rate Limiting & Spam Prevention

| ID | Scenario | Expected Behavior |
|----|----------|-------------------|
| RATE-01 | Rapid-fire likes (100 likes/sec) | Client debounces; server rate-limits via Cloud Functions |
| RATE-02 | Rapid follow/unfollow toggle | Client debounces toggle; minimum 1s between operations |
| RATE-03 | Excessive post creation | Limit to 10 posts per hour per user |
| RATE-04 | Comment spam | Limit to 30 comments per hour per user |
| RATE-05 | Notification flooding | Batch notifications; max 1 notification per actor per action per hour |
| RATE-06 | Message spam | Limit to 60 messages per hour per conversation |

### 5.6 Media Upload Edge Cases

| ID | Scenario | Expected Behavior |
|----|----------|-------------------|
| MEDIA-01 | Upload exceeds 10MB limit | Error shown before upload, file rejected |
| MEDIA-02 | Invalid file type (e.g., .exe) | Only jpg, png, gif, mp4, mov accepted |
| MEDIA-03 | Upload interrupted (network drop) | Resumable upload or retry from scratch |
| MEDIA-04 | Corrupt image file | Error: "Could not process image" |
| MEDIA-05 | Very large video (500MB) | Show "File too large" error (max 100MB for video) |
| MEDIA-06 | Zero-byte file | Rejected with validation error |

### 5.7 User Blocking (Future Consideration)

| ID | Scenario | Expected Behavior |
|----|----------|-------------------|
| BLOCK-01 | Blocked user cannot follow | Follow attempt returns error |
| BLOCK-02 | Blocked user's posts hidden from feed | Posts filtered client-side |
| BLOCK-03 | Blocked user cannot DM | Message send blocked |
| BLOCK-04 | Blocked user cannot see profile | Profile returns not found |
| BLOCK-05 | Unblock restores normal access | All restrictions lifted |

---

## 6. Performance Testing

### 6.1 Load Targets

| Metric | Target |
|--------|--------|
| Feed load (cold) | < 2 seconds |
| Feed load (cached) | < 500ms |
| Post creation | < 3 seconds (including media upload < 5MB) |
| Search results | < 1.5 seconds |
| Feed scroll (60fps) | No dropped frames on mid-range device |
| Offline feed load | < 200ms from cache |

### 6.2 Stress Scenarios

| ID | Scenario | Expected |
|----|----------|----------|
| PERF-01 | User follows 500 users, feed query | Feed loads within 3 seconds |
| PERF-02 | Post with 1000 likes | Post detail loads within 2 seconds |
| PERF-03 | Team with 100 members | Team member list loads within 2 seconds |
| PERF-04 | User with 200 scores | Stats aggregation completes within 1 second |
| PERF-05 | Conversation with 5000 messages | Pagination works, initial load < 2 seconds |

---

## 7. Test Environment Setup

### 7.1 Firebase Emulator Suite

```bash
# Install
npm install -g firebase-tools

# Start emulators
firebase emulators:start --project demo-ballpark

# Emulators needed:
# - Auth (port 9099)
# - Firestore (port 8080)
# - Storage (port 9199)
# - Functions (port 5001)
```

### 7.2 Test Data Factories

```typescript
// Minimal factory examples for tests
const createTestUser = (overrides?: Partial<User>): User => ({
  uid: `user_${Date.now()}`,
  email: `test${Date.now()}@test.com`,
  displayName: 'Test User',
  photoURL: null,
  role: 'player',
  position: 'pitcher',
  team: null,
  age: 22,
  throwHand: 'right',
  batHand: 'right',
  bio: '',
  stats: {
    batting: { avg: 0, gamesPlayed: 0, totalAtBats: 0, totalHits: 0, totalHomeRuns: 0, totalRbis: 0 },
    pitching: { era: 0, gamesPlayed: 0, totalInningsPitched: 0, totalStrikeouts: 0, totalEarnedRuns: 0 },
    fielding: { fieldingPct: 0, totalPutouts: 0, totalAssists: 0, totalErrors: 0 },
  },
  followersCount: 0,
  followingCount: 0,
  postsCount: 0,
  isPublic: true,
  createdAt: Timestamp.now(),
  updatedAt: Timestamp.now(),
  ...overrides,
});

const createTestScore = (playerId: string, overrides?: Partial<Score>): Score => ({
  id: `score_${Date.now()}`,
  playerId,
  gameDate: Timestamp.now(),
  opponent: 'Test Opponent',
  batting: { atBats: 4, hits: 1, doubles: 0, triples: 0, homeRuns: 0, rbis: 1, walks: 1, strikeouts: 1, stolenBases: 0 },
  pitching: null,
  fielding: null,
  videoURL: null,
  aiAnalysis: null,
  teamId: null,
  createdAt: Timestamp.now(),
  ...overrides,
});
```

### 7.3 Running Tests

```bash
# Unit tests
npx vitest run

# Unit tests in watch mode
npx vitest

# Integration tests (requires emulators running)
FIRESTORE_EMULATOR_HOST=localhost:8080 npx vitest run --config vitest.integration.config.ts

# E2E tests (requires app running)
npx detox test --configuration ios.sim.debug

# Security rules tests
cd firebase && npm test
```

---

*Last Updated: 2026-02-09*
*Author: QA Agent*
