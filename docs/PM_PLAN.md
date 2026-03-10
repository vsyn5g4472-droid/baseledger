# Baseball Social App — MVP Product Plan

> **App Name**: BallPark (working title)
> **Platform**: iOS / Android (React Native + Expo)
> **Backend**: Firebase (Auth, Firestore, Storage, Cloud Functions)
> **AI**: Grok API for baseball analytics & feedback
> **Version**: 1.0.0-mvp

---

## Table of Contents

1. [User Roles](#1-user-roles)
2. [User Stories](#2-user-stories)
3. [MVP Scope](#3-mvp-scope)
4. [Priority Matrix](#4-priority-matrix)
5. [Screen List & Text Wireframes](#5-screen-list--text-wireframes)
6. [Navigation Map](#6-navigation-map)
7. [Data Models Overview](#7-data-models-overview)
8. [Project Directory Structure](#8-project-directory-structure)
9. [Tech Stack Summary](#9-tech-stack-summary)
10. [Non-Functional Requirements](#10-non-functional-requirements)

---

## 1. User Roles

| Role | Description |
|------|-------------|
| **Player** | Pro, amateur, or student baseball player who posts highlights, records stats, and seeks scout attention |
| **Scout/Coach** | Scouts or coaches who discover talent, review stats, and reach out to players |
| **Team Admin** | A player or coach who creates/manages a private team group |

All roles share a single account type with role selection during onboarding. A user can be both a Player and a Scout/Coach.

---

## 2. User Stories

### 2.1 Authentication & Onboarding

| ID | Story | Priority |
|----|-------|----------|
| AUTH-01 | As a new user, I want to sign up with email/password so that I can create an account | P0 |
| AUTH-02 | As a new user, I want to sign up with Google/Apple so that registration is frictionless | P1 |
| AUTH-03 | As a new user, I want to select my role (Player / Scout-Coach) during onboarding so the app personalizes my experience | P0 |
| AUTH-04 | As a user, I want to create a profile (name, photo, position, team, stats summary) so others can learn about me | P0 |
| AUTH-05 | As a user, I want to log in and stay logged in until I explicitly sign out | P0 |
| AUTH-06 | As a user, I want to reset my password via email if I forget it | P1 |

### 2.2 SNS Feed

| ID | Story | Priority |
|----|-------|----------|
| FEED-01 | As a player, I want to create a post with text, images, or video so I can share highlights | P0 |
| FEED-02 | As a user, I want to scroll a chronological feed of posts from people I follow | P0 |
| FEED-03 | As a user, I want to like and comment on posts to engage with the community | P0 |
| FEED-04 | As a player, I want to tag my post with stats (e.g. pitch speed, batting avg) so scouts can see my numbers | P1 |
| FEED-05 | As a user, I want to set post visibility to public or followers-only | P0 |
| FEED-06 | As a user, I want to see a "Discover" tab with trending/public posts from all users | P1 |
| FEED-07 | As a user, I want to share a post link externally (deep link) | P2 |

### 2.3 Follow System

| ID | Story | Priority |
|----|-------|----------|
| FOLLOW-01 | As a user, I want to follow another user to see their posts in my feed | P0 |
| FOLLOW-02 | As a user, I want to see my followers and following lists | P0 |
| FOLLOW-03 | As a user, I want to receive a notification when someone follows me | P0 |
| FOLLOW-04 | As a user, I want to unfollow someone | P0 |
| FOLLOW-05 | As a user, I want to DM another user when we mutually follow each other | P1 |
| FOLLOW-06 | As a user, I want to see a badge/count of unread notifications | P1 |

### 2.4 Private Team Groups

| ID | Story | Priority |
|----|-------|----------|
| TEAM-01 | As a team admin, I want to create a private team group with a name and logo | P0 |
| TEAM-02 | As a team admin, I want to invite members via invite code or direct invite | P0 |
| TEAM-03 | As a team member, I want to post in the team feed (visible only to team members) | P0 |
| TEAM-04 | As a team member, I want to see shared game scores within the team | P1 |
| TEAM-05 | As a team member, I want to chat in a team group chat | P1 |
| TEAM-06 | As a team admin, I want to remove members from the team | P1 |
| TEAM-07 | As a team admin, I want to assign roles (admin, member) to team members | P2 |

### 2.5 Digital Score Recording

| ID | Story | Priority |
|----|-------|----------|
| SCORE-01 | As a player/coach, I want to record game stats (hits, runs, RBIs, ERA, etc.) per game | P0 |
| SCORE-02 | As a player, I want to view my stat history across games in a dashboard | P0 |
| SCORE-03 | As a player, I want to upload a video of my play and attach it to a game record | P1 |
| SCORE-04 | As a coach, I want to record stats for each player on my team per game | P1 |
| SCORE-05 | As a user, I want to see stats visualized in charts (trends over time) | P2 |
| SCORE-06 | As a player, I want AI analysis on my uploaded video (pitch form, batting stance) | P2 |

### 2.6 AI Feedback (Grok API)

| ID | Story | Priority |
|----|-------|----------|
| AI-01 | As a player, I want AI-generated feedback on my stats trends (strengths/weaknesses) | P1 |
| AI-02 | As a coach, I want AI-generated team performance summaries after inputting game data | P1 |
| AI-03 | As a player, I want AI-suggested improvement drills based on my stat profile | P2 |
| AI-04 | As a coach, I want AI comparison of my team's performance vs. league averages | P2 |

### 2.7 Scout Search & Matching

| ID | Story | Priority |
|----|-------|----------|
| SCOUT-01 | As a scout, I want to search for players by position, age, region, and stats | P0 |
| SCOUT-02 | As a scout, I want to view a player's full profile with stats, videos, and posts | P0 |
| SCOUT-03 | As a scout, I want AI-recommended player profiles based on my search history | P2 |
| SCOUT-04 | As a player, I want to know when a scout views my profile | P1 |
| SCOUT-05 | As a scout, I want to bookmark/favorite players for later review | P1 |

---

## 3. MVP Scope

### 3.1 In Scope (v1.0)

| Area | What's Included |
|------|----------------|
| **Auth** | Email/password sign-up/login, role selection, profile creation, persistent session |
| **Feed** | Create text/image posts, chronological feed, like, comment, visibility toggle |
| **Follow** | Follow/unfollow, follower/following lists, follow notifications |
| **Teams** | Create team, invite via code, team feed, basic member management |
| **Stats** | Manual stat input per game (batting & pitching), stat history list view |
| **Scout Search** | Filter players by position/age/region, view player profiles |
| **Notifications** | In-app notification list (follow, like, comment, team invite) |
| **Navigation** | Bottom tab bar: Feed / Search / Add Post / Teams / Profile |

### 3.2 Out of Scope (v1.0 — Deferred to v1.1+)

| Feature | Reason |
|---------|--------|
| Google/Apple social login | Nice-to-have; email auth covers MVP |
| Direct messaging (DM) | Requires real-time chat infrastructure; defer to v1.1 |
| Team group chat | Same as DM; complex real-time feature |
| Video upload & AI video analysis | Heavy infra (storage, processing); defer to v1.1 |
| AI feedback (Grok API) | Requires API integration + prompt engineering; defer to v1.1 |
| AI scout recommendations | Depends on AI pipeline; defer to v1.1 |
| Stat charts & visualizations | Nice-to-have; list view is sufficient for MVP |
| Deep links / share externally | Requires universal link config; defer |
| Push notifications | In-app only for MVP; push is v1.1 |
| Profile view tracking (scout viewed you) | Privacy-sensitive; needs careful design |

### 3.3 MVP Success Criteria

- User can sign up, create profile, and select role
- User can create posts and see a feed of followed users' posts
- User can follow/unfollow other users
- User can create a team and invite members
- Player can record game stats and view history
- Scout can search and filter players by criteria
- All above works on both iOS and Android

---

## 4. Priority Matrix

### P0 — Must Have (Launch Blockers)

| Feature | Stories |
|---------|---------|
| Email auth + onboarding | AUTH-01, AUTH-03, AUTH-04, AUTH-05 |
| SNS feed (create/read/like/comment) | FEED-01, FEED-02, FEED-03, FEED-05 |
| Follow system (follow/unfollow/lists) | FOLLOW-01, FOLLOW-02, FOLLOW-03, FOLLOW-04 |
| Team creation + invite + team feed | TEAM-01, TEAM-02, TEAM-03 |
| Basic stat recording + history | SCORE-01, SCORE-02 |
| Scout player search + profile view | SCOUT-01, SCOUT-02 |

### P1 — Should Have (First Sprint After Launch)

| Feature | Stories |
|---------|---------|
| Social login (Google/Apple) | AUTH-02 |
| Password reset | AUTH-06 |
| Post stat tags | FEED-04 |
| Discover tab | FEED-06 |
| Mutual DM | FOLLOW-05 |
| Notification badge/count | FOLLOW-06 |
| Team score sharing | TEAM-04 |
| Team chat | TEAM-05 |
| Member removal | TEAM-06 |
| Video upload to game record | SCORE-03 |
| Coach stat recording | SCORE-04 |
| AI stat feedback | AI-01, AI-02 |
| Profile view notification | SCOUT-04 |
| Scout bookmarks | SCOUT-05 |

### P2 — Nice to Have (Future)

| Feature | Stories |
|---------|---------|
| External sharing / deep links | FEED-07 |
| Team role assignment | TEAM-07 |
| Stat charts | SCORE-05 |
| AI video analysis | SCORE-06 |
| AI drills suggestions | AI-03 |
| AI team vs league comparison | AI-04 |
| AI scout recommendations | SCOUT-03 |

---

## 5. Screen List & Text Wireframes

### 5.1 Auth Screens

#### 5.1.1 Welcome Screen (`WelcomeScreen`)
```
┌─────────────────────────────┐
│                             │
│         [App Logo]          │
│                             │
│        BallPark             │
│   "Your Baseball Network"   │
│                             │
│   ┌─────────────────────┐   │
│   │     Sign Up          │   │
│   └─────────────────────┘   │
│                             │
│   ┌─────────────────────┐   │
│   │     Log In           │   │
│   └─────────────────────┘   │
│                             │
└─────────────────────────────┘
```

#### 5.1.2 Sign Up Screen (`SignUpScreen`)
```
┌─────────────────────────────┐
│ ← Back                      │
│                             │
│   Create Account            │
│                             │
│   [Email Input          ]   │
│   [Password Input       ]   │
│   [Confirm Password     ]   │
│                             │
│   ┌─────────────────────┐   │
│   │    Create Account    │   │
│   └─────────────────────┘   │
│                             │
│   Already have an account?  │
│   Log in                    │
└─────────────────────────────┘
```

#### 5.1.3 Login Screen (`LoginScreen`)
```
┌─────────────────────────────┐
│ ← Back                      │
│                             │
│   Welcome Back              │
│                             │
│   [Email Input          ]   │
│   [Password Input       ]   │
│                             │
│   Forgot password?          │
│                             │
│   ┌─────────────────────┐   │
│   │       Log In         │   │
│   └─────────────────────┘   │
│                             │
│   Don't have an account?    │
│   Sign up                   │
└─────────────────────────────┘
```

#### 5.1.4 Role Selection Screen (`RoleSelectionScreen`)
```
┌─────────────────────────────┐
│                             │
│   What describes you best?  │
│                             │
│   ┌─────────────────────┐   │
│   │  ⚾ Player           │   │
│   │  I play baseball     │   │
│   └─────────────────────┘   │
│                             │
│   ┌─────────────────────┐   │
│   │  👁 Scout / Coach    │   │
│   │  I discover talent   │   │
│   └─────────────────────┘   │
│                             │
│   ┌─────────────────────┐   │
│   │      Continue        │   │
│   └─────────────────────┘   │
└─────────────────────────────┘
```

#### 5.1.5 Profile Setup Screen (`ProfileSetupScreen`)
```
┌─────────────────────────────┐
│                             │
│   Set Up Your Profile       │
│                             │
│      [Avatar Upload]        │
│                             │
│   [Display Name     ]      │
│   [Bio / About      ]      │
│                             │
│   --- Player fields ---     │
│   [Position Picker   ]      │
│   [Team Name         ]      │
│   [Age / Birth Year  ]      │
│   [Region / City     ]      │
│                             │
│   --- Scout fields ---      │
│   [Organization      ]      │
│   [Scouting Level    ]      │
│                             │
│   ┌─────────────────────┐   │
│   │   Complete Setup     │   │
│   └─────────────────────┘   │
└─────────────────────────────┘
```

### 5.2 Main Tab Screens

#### 5.2.1 Home Feed Screen (`HomeFeedScreen`) — Tab 1
```
┌─────────────────────────────┐
│ BallPark          [🔔 Bell] │
├─────────────────────────────┤
│ [Following] [Discover]      │
├─────────────────────────────┤
│ ┌─────────────────────────┐ │
│ │ [Avatar] @username · 2h │ │
│ │                         │ │
│ │ Just hit a 95mph       │ │
│ │ fastball in practice!   │ │
│ │                         │ │
│ │ [Image/Video Thumbnail] │ │
│ │                         │ │
│ │ ♡ 24   💬 3   ↗ Share  │ │
│ └─────────────────────────┘ │
│                             │
│ ┌─────────────────────────┐ │
│ │ [Avatar] @username · 5h │ │
│ │ ...next post...         │ │
│ └─────────────────────────┘ │
│                             │
├─────────────────────────────┤
│  🏠    🔍    ➕    👥    👤  │
│ Feed  Search Add  Teams Prof│
└─────────────────────────────┘
```

#### 5.2.2 Search Screen (`SearchScreen`) — Tab 2
```
┌─────────────────────────────┐
│ 🔍 [Search players, teams…] │
├─────────────────────────────┤
│ Filters:                    │
│ [Position ▼] [Region ▼]    │
│ [Age Range ▼] [Level ▼]    │
├─────────────────────────────┤
│ Results:                    │
│ ┌─────────────────────────┐ │
│ │ [Av] Player Name        │ │
│ │     SS · Age 22 · Tokyo │ │
│ │     AVG .312  HR 15     │ │
│ └─────────────────────────┘ │
│ ┌─────────────────────────┐ │
│ │ [Av] Player Name        │ │
│ │     P · Age 19 · Osaka  │ │
│ │     ERA 2.45  K 89      │ │
│ └─────────────────────────┘ │
│ ...                         │
├─────────────────────────────┤
│  🏠    🔍    ➕    👥    👤  │
└─────────────────────────────┘
```

#### 5.2.3 Create Post Screen (`CreatePostScreen`) — Tab 3 (Modal)
```
┌─────────────────────────────┐
│ ✕ Cancel       [Post]       │
├─────────────────────────────┤
│ [Avatar] @username          │
│                             │
│ [What's on your mind?     ] │
│ [                         ] │
│ [                         ] │
│                             │
│ Attached Media:             │
│ [ + Add Photo ]             │
│                             │
│ Visibility:                 │
│ (●) Public  (○) Followers   │
│                             │
│ Stat Tags (optional):       │
│ [+ Add Stat Tag]            │
│   e.g. Pitch: 92mph        │
│   e.g. AVG: .325           │
└─────────────────────────────┘
```

#### 5.2.4 Teams Screen (`TeamsScreen`) — Tab 4
```
┌─────────────────────────────┐
│ My Teams         [+ Create] │
├─────────────────────────────┤
│ ┌─────────────────────────┐ │
│ │ [Logo] Team Eagles      │ │
│ │        12 members       │ │
│ └─────────────────────────┘ │
│ ┌─────────────────────────┐ │
│ │ [Logo] Tokyo Stars      │ │
│ │        8 members        │ │
│ └─────────────────────────┘ │
│                             │
│ Join a Team:                │
│ [Enter invite code    ] [→] │
│                             │
├─────────────────────────────┤
│  🏠    🔍    ➕    👥    👤  │
└─────────────────────────────┘
```

#### 5.2.5 Profile Screen (`ProfileScreen`) — Tab 5
```
┌─────────────────────────────┐
│ ⚙                           │
├─────────────────────────────┤
│        [Avatar Large]       │
│        @username            │
│        Player · SS · Tokyo  │
│                             │
│    42 Following  128 Followers│
│                             │
│   [Edit Profile] [Follow]   │
├─────────────────────────────┤
│ [Posts] [Stats] [About]     │
├─────────────────────────────┤
│ --- Posts Tab ---            │
│ Grid of user's posts        │
│                             │
│ --- Stats Tab ---            │
│ Season stats summary table  │
│ Game history list            │
│                             │
│ --- About Tab ---            │
│ Bio, position, team, age    │
├─────────────────────────────┤
│  🏠    🔍    ➕    👥    👤  │
└─────────────────────────────┘
```

### 5.3 Detail / Sub-Screens

#### 5.3.1 Post Detail Screen (`PostDetailScreen`)
```
┌─────────────────────────────┐
│ ← Back                      │
├─────────────────────────────┤
│ [Avatar] @username · 2h     │
│                             │
│ Post content text here...   │
│                             │
│ [Image if attached]         │
│                             │
│ ♡ 24 likes   💬 3 comments  │
├─────────────────────────────┤
│ Comments:                   │
│ [Av] @user1: Great shot!    │
│ [Av] @user2: What pitch?    │
│ ...                         │
├─────────────────────────────┤
│ [Add a comment...     ] [→] │
└─────────────────────────────┘
```

#### 5.3.2 Team Detail Screen (`TeamDetailScreen`)
```
┌─────────────────────────────┐
│ ← Back            [⚙ Manage]│
│                             │
│   [Team Logo]               │
│   Team Eagles               │
│   12 members                │
│   Invite Code: ABC123       │
│                             │
├─────────────────────────────┤
│ [Feed]  [Members]  [Scores] │
├─────────────────────────────┤
│ --- Feed Tab ---             │
│ Team-only posts list        │
│ [+ New Team Post]           │
│                             │
│ --- Members Tab ---          │
│ [Av] Player 1 (Admin)      │
│ [Av] Player 2              │
│ [Av] Player 3              │
│                             │
│ --- Scores Tab ---           │
│ Game 1: W 5-3 vs Bears     │
│ Game 2: L 2-4 vs Hawks     │
└─────────────────────────────┘
```

#### 5.3.3 Stat Recording Screen (`StatRecordScreen`)
```
┌─────────────────────────────┐
│ ← Back          [Save]      │
│                             │
│   Record Game Stats         │
│                             │
│   Date: [2025-01-15    ]    │
│   Opponent: [Team name ]    │
│   Result: [W ▼] Score [5-3] │
│                             │
│ --- Batting ---              │
│   AB [4]  H [2]  HR [1]    │
│   RBI [3]  BB [1]  SO [0]  │
│                             │
│ --- Pitching ---             │
│   IP [7.0]  H [4]  ER [2]  │
│   K [9]  BB [2]  Pitch# [] │
│                             │
│ --- Notes ---                │
│   [Optional game notes   ]  │
│                             │
└─────────────────────────────┘
```

#### 5.3.4 Notifications Screen (`NotificationsScreen`)
```
┌─────────────────────────────┐
│ ← Back                      │
│                             │
│   Notifications             │
│                             │
│ ┌─────────────────────────┐ │
│ │ [Av] @scout1 followed   │ │
│ │      you         · 1h   │ │
│ └─────────────────────────┘ │
│ ┌─────────────────────────┐ │
│ │ [Av] @player2 liked     │ │
│ │      your post    · 3h  │ │
│ └─────────────────────────┘ │
│ ┌─────────────────────────┐ │
│ │ [Av] @player3 commented │ │
│ │      on your post · 5h  │ │
│ └─────────────────────────┘ │
│ ┌─────────────────────────┐ │
│ │ [👥] Team Eagles invited │ │
│ │      you          · 1d  │ │
│ └─────────────────────────┘ │
└─────────────────────────────┘
```

#### 5.3.5 Edit Profile Screen (`EditProfileScreen`)
```
┌─────────────────────────────┐
│ ← Cancel         [Save]     │
│                             │
│      [Avatar - tap to edit] │
│                             │
│   [Display Name      ]      │
│   [Bio               ]      │
│   [Position Picker   ]      │
│   [Team Name         ]      │
│   [Region / City     ]      │
│                             │
└─────────────────────────────┘
```

#### 5.3.6 Followers/Following List (`FollowListScreen`)
```
┌─────────────────────────────┐
│ ← Back                      │
│                             │
│ [Followers] [Following]     │
├─────────────────────────────┤
│ [Av] @username1   [Follow]  │
│ [Av] @username2 [Following] │
│ [Av] @username3   [Follow]  │
│ ...                         │
└─────────────────────────────┘
```

#### 5.3.7 Settings Screen (`SettingsScreen`)
```
┌─────────────────────────────┐
│ ← Back                      │
│                             │
│   Settings                  │
│                             │
│   Account                   │
│   > Edit Profile            │
│   > Change Password         │
│                             │
│   Preferences               │
│   > Notification Settings   │
│   > Privacy                 │
│                             │
│   About                     │
│   > Terms of Service        │
│   > Privacy Policy          │
│   > App Version 1.0.0       │
│                             │
│   [Log Out]                 │
│                             │
└─────────────────────────────┘
```

#### 5.3.8 Create Team Screen (`CreateTeamScreen`)
```
┌─────────────────────────────┐
│ ← Cancel         [Create]   │
│                             │
│   Create New Team           │
│                             │
│   [Team Logo Upload]        │
│   [Team Name         ]      │
│   [Description       ]      │
│   [Region / City     ]      │
│                             │
│   Privacy:                  │
│   (●) Private (invite only) │
│                             │
└─────────────────────────────┘
```

---

## 6. Navigation Map

```
App
├── Auth Stack (unauthenticated)
│   ├── WelcomeScreen
│   ├── LoginScreen
│   ├── SignUpScreen
│   ├── RoleSelectionScreen
│   └── ProfileSetupScreen
│
└── Main Tabs (authenticated)
    ├── Tab 1: Feed Stack
    │   ├── HomeFeedScreen
    │   ├── PostDetailScreen
    │   └── UserProfileScreen (other user)
    │
    ├── Tab 2: Search Stack
    │   ├── SearchScreen
    │   └── UserProfileScreen (from search result)
    │
    ├── Tab 3: CreatePostScreen (modal)
    │
    ├── Tab 4: Teams Stack
    │   ├── TeamsScreen (list)
    │   ├── CreateTeamScreen
    │   └── TeamDetailScreen
    │
    ├── Tab 5: Profile Stack
    │   ├── ProfileScreen (own)
    │   ├── EditProfileScreen
    │   ├── FollowListScreen
    │   ├── StatRecordScreen
    │   └── SettingsScreen
    │
    └── Shared Screens
        └── NotificationsScreen
```

---

## 7. Data Models Overview

These are the primary Firestore collections for the MVP. The Architect agent will define the full schema.

### Users
```
users/{userId}
  - email, displayName, avatarUrl
  - role: "player" | "scout" | "both"
  - position, teamName, region, age, bio
  - organization (scout)
  - followersCount, followingCount
  - createdAt, updatedAt
```

### Posts
```
posts/{postId}
  - authorId, authorName, authorAvatar
  - content (text)
  - mediaUrls[] (images)
  - visibility: "public" | "followers"
  - statTags: { label, value }[]
  - likesCount, commentsCount
  - teamId (null for public posts)
  - createdAt
```

### Comments
```
posts/{postId}/comments/{commentId}
  - authorId, authorName, authorAvatar
  - content
  - createdAt
```

### Follows
```
follows/{followerId_followingId}
  - followerId, followingId
  - createdAt
```

### Teams
```
teams/{teamId}
  - name, logoUrl, description, region
  - adminId
  - memberIds[]
  - inviteCode
  - createdAt
```

### Game Stats
```
stats/{statId}
  - playerId, teamId (optional)
  - date, opponent, result, score
  - batting: { ab, h, hr, rbi, bb, so }
  - pitching: { ip, h, er, k, bb, pitchCount }
  - notes
  - createdAt
```

### Notifications
```
notifications/{notifId}
  - userId (recipient)
  - type: "follow" | "like" | "comment" | "team_invite"
  - actorId, actorName, actorAvatar
  - referenceId (postId, teamId, etc.)
  - read: boolean
  - createdAt
```

---

## 8. Project Directory Structure

```
baseball-app/
├── App.tsx                    # App entry point
├── index.ts                   # Expo entry
├── app.json                   # Expo config
├── package.json
├── tsconfig.json
│
├── src/
│   ├── screens/               # All screen components
│   │   ├── auth/
│   │   │   ├── WelcomeScreen.tsx
│   │   │   ├── LoginScreen.tsx
│   │   │   ├── SignUpScreen.tsx
│   │   │   ├── RoleSelectionScreen.tsx
│   │   │   └── ProfileSetupScreen.tsx
│   │   ├── feed/
│   │   │   ├── HomeFeedScreen.tsx
│   │   │   └── PostDetailScreen.tsx
│   │   ├── search/
│   │   │   └── SearchScreen.tsx
│   │   ├── post/
│   │   │   └── CreatePostScreen.tsx
│   │   ├── teams/
│   │   │   ├── TeamsScreen.tsx
│   │   │   ├── CreateTeamScreen.tsx
│   │   │   └── TeamDetailScreen.tsx
│   │   ├── profile/
│   │   │   ├── ProfileScreen.tsx
│   │   │   ├── EditProfileScreen.tsx
│   │   │   ├── FollowListScreen.tsx
│   │   │   ├── StatRecordScreen.tsx
│   │   │   └── SettingsScreen.tsx
│   │   └── notifications/
│   │       └── NotificationsScreen.tsx
│   │
│   ├── components/            # Reusable UI components
│   │   ├── common/
│   │   │   ├── Button.tsx
│   │   │   ├── Input.tsx
│   │   │   ├── Avatar.tsx
│   │   │   ├── LoadingSpinner.tsx
│   │   │   └── EmptyState.tsx
│   │   ├── feed/
│   │   │   ├── PostCard.tsx
│   │   │   ├── PostActions.tsx
│   │   │   └── CommentItem.tsx
│   │   ├── profile/
│   │   │   ├── ProfileHeader.tsx
│   │   │   ├── StatsSummary.tsx
│   │   │   └── UserListItem.tsx
│   │   ├── teams/
│   │   │   ├── TeamCard.tsx
│   │   │   └── MemberListItem.tsx
│   │   └── search/
│   │       ├── SearchBar.tsx
│   │       ├── FilterChips.tsx
│   │       └── PlayerResultCard.tsx
│   │
│   ├── navigation/            # Navigation configuration
│   │   ├── AppNavigator.tsx       # Root navigator (auth vs main)
│   │   ├── AuthStack.tsx          # Auth flow stack
│   │   ├── MainTabs.tsx           # Bottom tab navigator
│   │   ├── FeedStack.tsx          # Feed tab stack
│   │   ├── SearchStack.tsx        # Search tab stack
│   │   ├── TeamsStack.tsx         # Teams tab stack
│   │   ├── ProfileStack.tsx       # Profile tab stack
│   │   └── types.ts               # Navigation type definitions
│   │
│   ├── services/              # Firebase & API service layer
│   │   ├── firebase.ts            # Firebase initialization
│   │   ├── authService.ts         # Auth operations
│   │   ├── userService.ts         # User CRUD
│   │   ├── postService.ts         # Post CRUD + feed queries
│   │   ├── followService.ts       # Follow/unfollow operations
│   │   ├── teamService.ts         # Team CRUD + membership
│   │   ├── statService.ts         # Game stat recording
│   │   ├── notificationService.ts # Notification operations
│   │   └── storageService.ts      # Image upload to Firebase Storage
│   │
│   ├── models/                # TypeScript type definitions
│   │   ├── User.ts
│   │   ├── Post.ts
│   │   ├── Comment.ts
│   │   ├── Team.ts
│   │   ├── GameStat.ts
│   │   ├── Notification.ts
│   │   └── Follow.ts
│   │
│   ├── hooks/                 # Custom React hooks
│   │   ├── useAuth.ts             # Auth state hook
│   │   ├── usePosts.ts            # Feed data hook
│   │   ├── useFollow.ts           # Follow state hook
│   │   ├── useTeam.ts             # Team data hook
│   │   ├── useNotifications.ts    # Notifications hook
│   │   └── useStats.ts            # Player stats hook
│   │
│   ├── contexts/              # React Context providers
│   │   ├── AuthContext.tsx         # Auth state provider
│   │   └── ThemeContext.tsx        # Theme provider
│   │
│   ├── constants/             # App constants
│   │   ├── theme.ts               # Colors, fonts, spacing
│   │   ├── positions.ts           # Baseball position list
│   │   ├── regions.ts             # Region/city list
│   │   └── config.ts              # App config constants
│   │
│   └── utils/                 # Utility functions
│       ├── formatDate.ts          # Date formatting helpers
│       ├── validation.ts          # Form validation
│       └── statsCalculator.ts     # Stat aggregation (AVG, ERA, etc.)
│
├── docs/                      # Documentation
│   └── PM_PLAN.md             # This file
│
├── firebase/                  # Firebase configuration
│   ├── firestore.rules        # Firestore security rules
│   └── storage.rules          # Storage security rules
│
└── assets/                    # Static assets
    ├── icon.png
    ├── favicon.png
    ├── adaptive-icon.png
    └── splash-icon.png
```

---

## 9. Tech Stack Summary

| Layer | Technology | Purpose |
|-------|-----------|---------|
| **Framework** | React Native + Expo SDK 54 | Cross-platform mobile app |
| **Language** | TypeScript (strict) | Type safety |
| **Navigation** | React Navigation v6 | Screen routing & tabs |
| **State** | React Context + hooks | Auth state, theme |
| **Backend** | Firebase | BaaS — auth, database, storage |
| **Auth** | Firebase Auth | Email/password authentication |
| **Database** | Cloud Firestore | Real-time NoSQL database |
| **Storage** | Firebase Storage | Image uploads |
| **Functions** | Firebase Cloud Functions | Server-side logic (notifications, search indexing) |
| **AI** (v1.1) | Grok API | Baseball analytics & feedback |
| **Image Picker** | expo-image-picker | Camera/gallery access |
| **Icons** | @expo/vector-icons | UI icons |

---

## 10. Non-Functional Requirements

| Requirement | Target |
|-------------|--------|
| **Performance** | Feed loads in < 2 seconds, smooth 60fps scrolling |
| **Offline** | Firestore offline persistence enabled; read cached data when offline |
| **Security** | Firestore rules enforce auth; no direct client DB writes without validation |
| **Privacy** | Followers-only posts not visible to non-followers; team posts restricted to members |
| **Image size** | Compress images to < 1MB before upload |
| **Pagination** | Feed and search results paginated (20 items per page) |
| **Accessibility** | Minimum touch target 44x44pt; screen reader labels on key elements |
| **Localization** | Japanese primary, English secondary (v1.1) |
| **Testing** | Unit tests for utils/services; E2E smoke tests for auth + feed flows |

---

## Appendix: Key Decisions

1. **Why Firestore over Realtime Database?** — Better querying for search/filter, structured data, offline support, and security rules.
2. **Why React Navigation over Expo Router?** — More mature, better TypeScript support for complex nested navigation patterns. Can migrate to Expo Router in v2.
3. **Why defer DM/Chat to v1.1?** — Real-time chat requires WebSocket infrastructure and UI complexity that isn't core to the MVP value proposition (showcasing skills + finding talent).
4. **Why defer AI features?** — The core value is the platform itself. AI enhancement comes after we validate the base social + stats experience.
5. **Why single role model instead of separate user types?** — Many users are both players and coaches. A single account with role flags is simpler and more flexible.

---

*Last updated: 2025-02-09*
*Author: PM Agent*
