# Baseball Social App - Technical Architecture

## Overview

A social networking app for baseball players, coaches, and scouts. Users share highlights, track stats, form teams, and receive AI-powered performance analysis.

---

## Tech Stack

| Layer | Technology | Version |
|-------|-----------|---------|
| Framework | React Native | 0.81.5 |
| Platform | Expo SDK | 54 |
| Routing | Expo Router | File-based |
| Language | TypeScript | 5.9 |
| UI Library | React Native Paper | 5.x |
| Database | Firebase Firestore | NoSQL |
| Auth | Firebase Auth | Email + Google + Apple |
| Storage | Firebase Storage | Media uploads |
| Functions | Firebase Cloud Functions | Server-side logic |
| AI | Grok API (xAI) | Performance analysis |
| State | React Context + Hooks | Local state management |

---

## Project Structure

```
baseball-app/
├── app/                          # Expo Router file-based routes
│   ├── _layout.tsx               # Root layout (auth gate + providers)
│   ├── index.tsx                 # Entry redirect
│   ├── (auth)/                   # Auth flow (unauthenticated)
│   │   ├── _layout.tsx
│   │   ├── login.tsx
│   │   └── register.tsx
│   ├── (tabs)/                   # Main tab navigator (authenticated)
│   │   ├── _layout.tsx
│   │   ├── feed/
│   │   │   ├── index.tsx         # SNS feed
│   │   │   └── [postId].tsx      # Post detail
│   │   ├── search/
│   │   │   └── index.tsx         # Scout search & matching
│   │   ├── score/
│   │   │   ├── index.tsx         # Score entry
│   │   │   └── history.tsx       # Score history
│   │   ├── teams/
│   │   │   ├── index.tsx         # Team list
│   │   │   ├── [teamId]/
│   │   │   │   ├── index.tsx     # Team feed
│   │   │   │   ├── chat.tsx      # Team chat
│   │   │   │   └── scores.tsx    # Team scores
│   │   │   └── create.tsx        # Create team
│   │   └── profile/
│   │       ├── index.tsx         # Own profile
│   │       └── edit.tsx          # Edit profile
│   ├── user/
│   │   └── [userId].tsx          # Other user's profile
│   └── messages/
│       ├── index.tsx             # Conversations list
│       └── [conversationId].tsx  # Chat screen
├── src/
│   ├── models/
│   │   └── types.ts              # TypeScript type definitions
│   ├── services/
│   │   ├── firebase.ts           # Firebase init & config
│   │   ├── authService.ts
│   │   ├── userService.ts
│   │   ├── postService.ts
│   │   ├── followService.ts
│   │   ├── teamService.ts
│   │   ├── scoreService.ts
│   │   ├── messageService.ts
│   │   ├── notificationService.ts
│   │   ├── aiService.ts
│   │   └── storageService.ts
│   ├── contexts/
│   │   ├── AuthContext.tsx        # Auth state provider
│   │   └── NotificationContext.tsx
│   ├── hooks/
│   │   ├── useAuth.ts
│   │   ├── usePosts.ts
│   │   ├── useTeam.ts
│   │   └── useNotifications.ts
│   └── components/
│       ├── PostCard.tsx
│       ├── ScoreForm.tsx
│       ├── PlayerCard.tsx
│       ├── StatsChart.tsx
│       ├── VideoPlayer.tsx
│       └── ChatBubble.tsx
├── assets/
├── functions/                    # Firebase Cloud Functions
│   ├── src/
│   │   ├── index.ts
│   │   ├── onFollow.ts           # Follow notification trigger
│   │   ├── onPostCreate.ts       # Feed fanout / notifications
│   │   ├── onScoreCreate.ts      # AI analysis trigger
│   │   └── aiAnalysis.ts         # Grok API integration
│   ├── package.json
│   └── tsconfig.json
├── app.json
├── package.json
└── tsconfig.json
```

---

## Firestore Database Schema

### `users/{userId}`

Top-level user profiles. Indexed for search by role, position, age, and team.

```typescript
{
  uid: string;                    // Firebase Auth UID
  email: string;
  displayName: string;
  photoURL: string | null;
  role: 'player' | 'scout' | 'coach';
  position: string | null;        // e.g. 'pitcher', 'shortstop'
  team: string | null;            // Free-text team name
  age: number | null;
  throwHand: 'left' | 'right' | 'both' | null;
  batHand: 'left' | 'right' | 'switch' | null;
  bio: string;
  stats: {
    batting: {
      avg: number;               // Calculated batting average
      gamesPlayed: number;
      totalAtBats: number;
      totalHits: number;
      totalHomeRuns: number;
      totalRbis: number;
    };
    pitching: {
      era: number;               // Calculated ERA
      gamesPlayed: number;
      totalInningsPitched: number;
      totalStrikeouts: number;
      totalEarnedRuns: number;
    };
    fielding: {
      fieldingPct: number;       // Calculated fielding %
      totalPutouts: number;
      totalAssists: number;
      totalErrors: number;
    };
  };
  followersCount: number;
  followingCount: number;
  postsCount: number;
  isPublic: boolean;              // Public profiles visible to all
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
```

**Indexes:**
- `role` + `position` (scout search)
- `role` + `age` (scout search)
- `displayName` (text search / prefix)

### `follows/{followerId_followingId}`

Composite key ensures uniqueness. One document per follow relationship.

```typescript
{
  followerId: string;
  followingId: string;
  createdAt: Timestamp;
}
```

**Indexes:**
- `followerId` + `createdAt` DESC (get user's following list)
- `followingId` + `createdAt` DESC (get user's followers list)

**Mutual follow detection:** Query both `A_B` and `B_A` document existence.

### `posts/{postId}`

Denormalized author data for fast feed rendering without joins.

```typescript
{
  authorId: string;
  authorName: string;
  authorPhotoURL: string | null;
  type: 'highlight' | 'stats' | 'text' | 'video';
  content: string;                // Text body
  mediaURLs: string[];            // Firebase Storage URLs
  statsData: object | null;       // Embedded stats for 'stats' type posts
  likesCount: number;
  commentsCount: number;
  visibility: 'public' | 'followers' | 'team';
  teamId: string | null;          // Set when visibility is 'team'
  createdAt: Timestamp;
}
```

**Indexes:**
- `authorId` + `createdAt` DESC (user profile feed)
- `visibility` + `createdAt` DESC (public feed)
- `teamId` + `createdAt` DESC (team feed)

### `posts/{postId}/comments/{commentId}`

Subcollection for post comments.

```typescript
{
  authorId: string;
  authorName: string;
  authorPhotoURL: string | null;
  content: string;
  createdAt: Timestamp;
}
```

### `likes/{postId_userId}`

Separate collection for atomic like tracking.

```typescript
{
  postId: string;
  userId: string;
  createdAt: Timestamp;
}
```

### `teams/{teamId}`

Private team groups.

```typescript
{
  name: string;
  description: string;
  photoURL: string | null;
  ownerId: string;
  memberIds: string[];            // Denormalized for quick membership checks
  inviteCode: string;             // 8-char unique code for joining
  isPrivate: boolean;
  createdAt: Timestamp;
}
```

### `teams/{teamId}/members/{userId}`

Subcollection with role detail per member.

```typescript
{
  role: 'owner' | 'admin' | 'member';
  joinedAt: Timestamp;
}
```

### `scores/{scoreId}`

Individual game score records.

```typescript
{
  playerId: string;
  gameDate: Timestamp;
  opponent: string;
  batting: {
    atBats: number;
    hits: number;
    doubles: number;
    triples: number;
    homeRuns: number;
    rbis: number;
    walks: number;
    strikeouts: number;
    stolenBases: number;
  } | null;
  pitching: {
    inningsPitched: number;       // e.g. 6.2 = 6 and 2/3
    hits: number;
    runs: number;
    earnedRuns: number;
    walks: number;
    strikeouts: number;
    homeRunsAllowed: number;
  } | null;
  fielding: {
    putouts: number;
    assists: number;
    errors: number;
  } | null;
  videoURL: string | null;        // Firebase Storage URL
  aiAnalysis: string | null;      // Grok analysis result
  teamId: string | null;
  createdAt: Timestamp;
}
```

**Indexes:**
- `playerId` + `gameDate` DESC (player history)
- `teamId` + `gameDate` DESC (team history)

### `messages/{conversationId}`

Conversation metadata. Participant array for querying user's conversations.

```typescript
{
  participants: string[];          // Exactly 2 user IDs (sorted)
  lastMessage: string;
  lastMessageAt: Timestamp;
}
```

**Indexes:**
- `participants` (array-contains) + `lastMessageAt` DESC

### `messages/{conversationId}/messages/{messageId}`

Individual messages in a conversation.

```typescript
{
  senderId: string;
  content: string;
  createdAt: Timestamp;
  readBy: string[];
}
```

### `notifications/{notificationId}`

Push notification records.

```typescript
{
  userId: string;                  // Recipient
  type: 'follow' | 'like' | 'comment' | 'teamInvite' | 'dm' | 'aiReport';
  fromUserId: string | null;      // null for system notifications
  data: {                          // Type-specific payload
    postId?: string;
    teamId?: string;
    conversationId?: string;
    scoreId?: string;
    message?: string;
  };
  read: boolean;
  createdAt: Timestamp;
}
```

**Indexes:**
- `userId` + `read` + `createdAt` DESC (unread notifications)
- `userId` + `createdAt` DESC (all notifications)

---

## Firestore Security Rules (Summary)

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    // Users: read public profiles, write own profile
    match /users/{userId} {
      allow read: if resource.data.isPublic == true
                  || request.auth.uid == userId
                  || isFollowing(request.auth.uid, userId);
      allow write: if request.auth.uid == userId;
    }

    // Follows: authenticated create/delete own
    match /follows/{followId} {
      allow read: if request.auth != null;
      allow create: if request.auth.uid == request.resource.data.followerId;
      allow delete: if request.auth.uid == resource.data.followerId;
    }

    // Posts: visibility-based reads
    match /posts/{postId} {
      allow read: if resource.data.visibility == 'public'
                  || request.auth.uid == resource.data.authorId
                  || (resource.data.visibility == 'followers'
                      && isFollowing(request.auth.uid, resource.data.authorId))
                  || (resource.data.visibility == 'team'
                      && isTeamMember(request.auth.uid, resource.data.teamId));
      allow create: if request.auth.uid == request.resource.data.authorId;
      allow update: if request.auth.uid == resource.data.authorId;
      allow delete: if request.auth.uid == resource.data.authorId;
    }

    // Teams: members read, owner/admin manage
    match /teams/{teamId} {
      allow read: if request.auth.uid in resource.data.memberIds;
      allow create: if request.auth != null;
      allow update: if isTeamAdmin(request.auth.uid, teamId);
    }

    // Messages: participants only
    match /messages/{conversationId} {
      allow read: if request.auth.uid in resource.data.participants;
      allow create: if request.auth.uid in request.resource.data.participants;
    }

    // Notifications: own only
    match /notifications/{notifId} {
      allow read, update: if request.auth.uid == resource.data.userId;
    }
  }
}
```

---

## API Service Layer

### authService

| Method | Signature | Description |
|--------|-----------|-------------|
| `signUp` | `(email, password, displayName, role) → User` | Create account with Firebase Auth + user doc |
| `signIn` | `(email, password) → User` | Email/password sign-in |
| `signInWithGoogle` | `() → User` | Google OAuth sign-in |
| `signOut` | `() → void` | Sign out current user |
| `getCurrentUser` | `() → User \| null` | Get current auth user |
| `onAuthStateChanged` | `(callback) → Unsubscribe` | Auth state listener |

### userService

| Method | Signature | Description |
|--------|-----------|-------------|
| `getUser` | `(userId) → User` | Fetch user profile |
| `updateUser` | `(userId, data) → void` | Update profile fields |
| `searchUsers` | `(query) → User[]` | Search by display name prefix |
| `getPlayersByFilters` | `(filters) → User[]` | Scout search: role, position, age, stats |

### postService

| Method | Signature | Description |
|--------|-----------|-------------|
| `createPost` | `(post) → Post` | Create post, upload media |
| `getFeedPosts` | `(userId, cursor?) → Post[]` | Paginated feed (public + followed users) |
| `getUserPosts` | `(userId, cursor?) → Post[]` | User's own posts |
| `getTeamPosts` | `(teamId, cursor?) → Post[]` | Team-only posts |
| `likePost` | `(postId, userId) → void` | Toggle like (increment/decrement) |
| `unlikePost` | `(postId, userId) → void` | Remove like |
| `hasLiked` | `(postId, userId) → boolean` | Check like status |
| `commentOnPost` | `(postId, comment) → Comment` | Add comment to post |
| `getComments` | `(postId, cursor?) → Comment[]` | Paginated comments |

### followService

| Method | Signature | Description |
|--------|-----------|-------------|
| `follow` | `(followerId, followingId) → void` | Create follow + update counts |
| `unfollow` | `(followerId, followingId) → void` | Remove follow + update counts |
| `getFollowers` | `(userId, cursor?) → User[]` | Paginated followers list |
| `getFollowing` | `(userId, cursor?) → User[]` | Paginated following list |
| `isFollowing` | `(followerId, followingId) → boolean` | Check follow status |
| `isMutualFollow` | `(userA, userB) → boolean` | Check mutual follow (enables DM) |

### teamService

| Method | Signature | Description |
|--------|-----------|-------------|
| `createTeam` | `(team) → Team` | Create team, set creator as owner |
| `joinTeam` | `(inviteCode, userId) → void` | Join via invite code |
| `leaveTeam` | `(teamId, userId) → void` | Leave team |
| `getTeam` | `(teamId) → Team` | Fetch team details |
| `getTeamMembers` | `(teamId) → TeamMember[]` | List members with roles |
| `getTeamFeed` | `(teamId, cursor?) → Post[]` | Team-scoped posts |
| `inviteToTeam` | `(teamId, userId) → void` | Send team invite notification |
| `updateMemberRole` | `(teamId, userId, role) → void` | Promote/demote member |
| `getUserTeams` | `(userId) → Team[]` | Teams the user belongs to |

### scoreService

| Method | Signature | Description |
|--------|-----------|-------------|
| `addScore` | `(score) → Score` | Record game stats, trigger AI analysis |
| `getPlayerScores` | `(playerId, cursor?) → Score[]` | Player's score history |
| `getTeamScores` | `(teamId, cursor?) → Score[]` | All scores for a team |
| `calculateStats` | `(playerId) → AggregateStats` | Compute career batting avg, ERA, etc. |
| `getScoreWithAnalysis` | `(scoreId) → Score` | Fetch score + AI analysis |

### messageService

| Method | Signature | Description |
|--------|-----------|-------------|
| `sendMessage` | `(conversationId, message) → Message` | Send message (mutual follow required) |
| `getOrCreateConversation` | `(userA, userB) → Conversation` | Find or create conversation |
| `getConversations` | `(userId) → Conversation[]` | User's conversations list |
| `getMessages` | `(conversationId, cursor?) → Message[]` | Paginated messages |
| `markAsRead` | `(conversationId, userId) → void` | Mark messages as read |
| `subscribeToMessages` | `(conversationId, callback) → Unsubscribe` | Real-time message listener |

### notificationService

| Method | Signature | Description |
|--------|-----------|-------------|
| `getNotifications` | `(userId, cursor?) → Notification[]` | Paginated notifications |
| `getUnreadCount` | `(userId) → number` | Unread notification count |
| `markAsRead` | `(notificationId) → void` | Mark single notification read |
| `markAllAsRead` | `(userId) → void` | Mark all notifications read |
| `sendNotification` | `(notification) → void` | Create notification (used by Cloud Functions) |
| `subscribeToNotifications` | `(userId, callback) → Unsubscribe` | Real-time notification listener |

### aiService

| Method | Signature | Description |
|--------|-----------|-------------|
| `analyzePerformance` | `(playerId, scores[]) → AnalysisResult` | Individual batting/pitching analysis via Grok |
| `getImprovementSuggestions` | `(playerId) → Suggestion[]` | AI improvement recommendations |
| `analyzeVideo` | `(videoURL) → VideoAnalysis` | Video analysis (form, mechanics) via Grok |
| `scoutRecommendations` | `(filters) → RecommendedPlayer[]` | AI-powered player recommendations |
| `getTeamAnalysis` | `(teamId) → TeamAnalysis` | Aggregate team performance insights |

### storageService

| Method | Signature | Description |
|--------|-----------|-------------|
| `uploadMedia` | `(uri, path) → string` | Upload file, return download URL |
| `uploadProfilePhoto` | `(userId, uri) → string` | Upload + update user photoURL |
| `uploadPostMedia` | `(postId, uris[]) → string[]` | Upload post images/videos |
| `uploadScoreVideo` | `(scoreId, uri) → string` | Upload game video |
| `getMediaURL` | `(path) → string` | Get download URL for storage path |
| `deleteMedia` | `(path) → void` | Delete file from storage |

---

## Cloud Functions

### Triggers

| Function | Trigger | Description |
|----------|---------|-------------|
| `onFollow` | `follows/{docId}` onCreate | Send follow notification; check mutual follow |
| `onPostCreate` | `posts/{postId}` onCreate | Send notifications to followers |
| `onScoreCreate` | `scores/{scoreId}` onCreate | Trigger Grok AI analysis, update user aggregate stats |
| `onLike` | `likes/{docId}` onCreate | Send like notification to post author |
| `onComment` | `posts/{postId}/comments/{commentId}` onCreate | Send comment notification |

### HTTP Endpoints (callable)

| Function | Description |
|----------|-------------|
| `analyzePerformance` | Proxy to Grok API (keeps API key server-side) |
| `scoutSearch` | Complex filtered search with AI ranking |
| `generateInviteCode` | Generate unique team invite code |

---

## Feed Strategy

The feed uses a **read-time fan-out** approach (suitable for MVP scale):

1. Query `follows` where `followerId == currentUser` to get following list
2. Query `posts` where `authorId in followingList` (Firestore `in` operator, max 30 per query)
3. Merge with `posts` where `visibility == 'public'`
4. Sort by `createdAt` DESC, paginate with cursor

For scale beyond MVP, migrate to write-time fan-out with a `feeds/{userId}/posts` subcollection populated by Cloud Functions.

---

## Authentication Flow

```
App Launch
  → Check Firebase Auth state
  → If authenticated:
      → Load user profile from Firestore
      → Navigate to (tabs) layout
      → Subscribe to notifications
  → If not authenticated:
      → Navigate to (auth) layout
      → Login / Register
      → On success → create/load user doc → (tabs)
```

---

## Storage Structure

```
firebase-storage/
├── users/{userId}/
│   └── profile.jpg
├── posts/{postId}/
│   ├── media_0.jpg
│   ├── media_1.mp4
│   └── ...
└── scores/{scoreId}/
    └── video.mp4
```

---

## Key Architectural Decisions

1. **Denormalized author data on posts/comments:** Avoids extra reads for feed rendering. Updated via Cloud Function when user profile changes.

2. **Composite follow document IDs (`followerId_followingId`):** Enables O(1) follow status checks and prevents duplicate follows without transactions.

3. **Likes as separate collection:** Prevents race conditions on like counts. Counter updated atomically via `FieldValue.increment()`.

4. **Sorted participant arrays in conversations:** Ensures consistent conversation IDs regardless of who initiates (e.g., `[userA, userB]` always sorted alphabetically).

5. **AI analysis via Cloud Functions only:** Grok API key stays server-side. Analysis triggered automatically on score creation.

6. **Aggregate stats on user document:** Pre-computed for fast profile/search rendering. Recalculated by Cloud Function on score create/update/delete.

7. **Invite code for teams:** Simple 8-character code for team joining. No complex invitation system needed for MVP.

---

## Pagination Strategy

All list endpoints use **cursor-based pagination** with Firestore's `startAfter()`:

```typescript
// First page
const first = query(postsRef, orderBy('createdAt', 'desc'), limit(20));

// Next page
const next = query(postsRef, orderBy('createdAt', 'desc'), startAfter(lastDoc), limit(20));
```

Standard page size: **20 items** for feeds, **50 items** for messages.

---

## Error Handling

Services throw typed errors that map to user-facing messages:

```typescript
class AppError extends Error {
  constructor(
    public code: 'NOT_FOUND' | 'UNAUTHORIZED' | 'FORBIDDEN' | 'VALIDATION' | 'NETWORK' | 'UNKNOWN',
    message: string
  ) {
    super(message);
  }
}
```

---

## Environment Configuration

Required environment variables (stored in `.env`, excluded from git):

```
EXPO_PUBLIC_FIREBASE_API_KEY=
EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN=
EXPO_PUBLIC_FIREBASE_PROJECT_ID=
EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET=
EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=
EXPO_PUBLIC_FIREBASE_APP_ID=
GROK_API_KEY=                    # Cloud Functions only, never in client
```
