# BallPark — Security Checklist & Review

> **Version**: 1.0.0-mvp
> **Last Updated**: 2026-02-09
> **Author**: QA Agent

---

## Table of Contents

1. [Authentication Security](#1-authentication-security)
2. [Data Privacy & Access Control](#2-data-privacy--access-control)
3. [Input Validation Requirements](#3-input-validation-requirements)
4. [Media Upload Security](#4-media-upload-security)
5. [API Rate Limiting](#5-api-rate-limiting)
6. [OWASP Mobile Top 10](#6-owasp-mobile-top-10)
7. [Privacy Compliance](#7-privacy-compliance)
8. [DM Access Control](#8-dm-access-control)
9. [Team Data Isolation](#9-team-data-isolation)
10. [Firebase-Specific Security](#10-firebase-specific-security)
11. [Checklist Summary](#11-checklist-summary)

---

## 1. Authentication Security

### Token Handling

| Item | Status | Notes |
|------|--------|-------|
| Firebase Auth tokens used (not custom JWTs) | Required | Leverage Firebase's managed token lifecycle |
| Tokens stored via `getReactNativePersistence(AsyncStorage)` | Implemented | See `src/services/firebase.ts` |
| No tokens stored in plain text or logs | Required | Verify no `console.log(token)` in production |
| Token refresh handled automatically by Firebase SDK | Built-in | SDK refreshes ID tokens before expiry |
| Sign-out clears all local auth state | Required | Call `auth.signOut()` + clear any cached user data |

### Session Management

| Item | Status | Notes |
|------|--------|-------|
| Sessions persist across app restarts | Implemented | AsyncStorage persistence |
| Session invalidation on password change | Built-in | Firebase Auth revokes tokens |
| No session fixation vulnerabilities | Built-in | Firebase generates new tokens per auth event |
| Concurrent session handling | Not restricted | User can be signed in on multiple devices (acceptable for MVP) |

### Password Policy

| Item | Status | Notes |
|------|--------|-------|
| Minimum 8 characters | Required | Enforce client-side + Firebase Auth config |
| Firebase Auth handles hashing & storage | Built-in | Never store passwords client-side |
| Password reset via email link | Required | Firebase `sendPasswordResetEmail()` |
| No password in URL parameters or logs | Required | Verify in all auth flows |

### Authentication Providers

| Item | Status | Notes |
|------|--------|-------|
| Email/password (MVP) | Implemented | Primary auth method |
| Google OAuth (P1) | Planned | Use Firebase Auth Google provider |
| Apple Sign-In (P1) | Planned | Required for iOS App Store if other social logins exist |
| Brute-force protection | Built-in | Firebase Auth rate-limits failed login attempts |

---

## 2. Data Privacy & Access Control

### Who Can See What

| Data | Owner | Followers | Team Members | Public Users | Unauthenticated |
|------|-------|-----------|--------------|--------------|-----------------|
| Public profile | Full | Full | Full | Full | None |
| Private profile | Full | Full | Full | None | None |
| Public posts | Full | Full | Full | Full | None |
| Follower-only posts | Full | Full | N/A | None | None |
| Team posts | Full | N/A | Full | None | None |
| Scores (public player) | Full | Full | Full | Full | None |
| Scores (private player) | Full | Full | Team only | None | None |
| DM conversations | Full | N/A | N/A | None | None |
| Notifications | Full | N/A | N/A | None | None |
| User email | Owner only | None | None | None | None |

### Firestore Security Rules Coverage

| Collection | Read Rules | Write Rules | Status |
|------------|-----------|-------------|--------|
| `users/{userId}` | Public/follower-based | Owner only | Defined |
| `follows/{followId}` | Authenticated | Follower creates, follower deletes | Defined |
| `posts/{postId}` | Visibility-based | Author only | Defined |
| `posts/{postId}/comments` | Authenticated (inherits) | Author creates, author/post-author deletes | Defined |
| `likes/{likeId}` | Authenticated | User creates/deletes own | Defined |
| `teams/{teamId}` | Members (or public) | Admin/owner | Defined |
| `teams/{teamId}/members` | Team members | Self-join or admin | Defined |
| `scores/{scoreId}` | Owner/team/follower/public | Owner only | Defined |
| `messages/{convId}` | Participants only | Participants only | Defined |
| `messages/{convId}/messages` | Participants only | Participants only | Defined |
| `notifications/{notifId}` | Recipient only | Cloud Functions only (create); recipient (update/delete) | Defined |

### Sensitive Field Protection

| Field | Protection |
|-------|-----------|
| `user.email` | Not exposed in public queries; only owner reads |
| Counter fields (`followersCount`, `likesCount`, etc.) | Client cannot modify directly; Cloud Functions only |
| `user.uid` | Immutable after creation |
| `post.authorId` | Immutable after creation |
| `score.playerId` | Immutable after creation |
| `notification.userId` | Immutable |
| `team.ownerId` | Immutable (transfer via dedicated admin operation) |

---

## 3. Input Validation Requirements

### Client-Side Validation

| Field | Rule | Enforce On |
|-------|------|-----------|
| Email | Valid email format (RFC 5322 basic) | Registration, login |
| Password | Min 8 chars | Registration |
| Display name | 1–50 chars, no leading/trailing whitespace | Profile create/edit |
| Bio | 0–500 chars | Profile create/edit |
| Post content | 0–2000 chars (text type requires ≥1) | Post creation |
| Comment | 1–500 chars | Comment creation |
| Team name | 1–50 chars | Team creation |
| Team description | 0–500 chars | Team creation |
| Message content | 1–2000 chars | Message send |
| Age | 5–100 (integer) | Profile create/edit |
| Stat values | Non-negative integers (except innings: decimal .0/.1/.2) | Score recording |
| Innings pitched | Format: N.0, N.1, or N.2 only | Score recording |

### Server-Side Validation (Firestore Rules)

| Validation | Location |
|-----------|----------|
| String length checks | `isValidString()` helper in firestore.rules |
| Non-negative counters | `isNonNegative()` helper |
| Enum membership (`role`, `visibility`, etc.) | `in []` checks in rules |
| Timestamp presence | `is timestamp` checks |
| Immutable field enforcement | Compare `request.resource` to `resource` |

### XSS / Injection Prevention

| Risk | Mitigation |
|------|-----------|
| XSS in text fields | React Native renders text as native components (no HTML). Sanitize before any WebView display. |
| Script injection in display names | React Native `<Text>` component auto-escapes |
| Firebase injection | Firestore SDK parameterizes all queries; no raw query construction |
| Deep link injection | Validate all deep link parameters before use |

---

## 4. Media Upload Security

### File Type Restrictions

| Context | Allowed Types | Enforced By |
|---------|--------------|-------------|
| Profile photo | JPEG, PNG, GIF, WebP | Storage rules `contentType.matches()` |
| Post images | JPEG, PNG, GIF, WebP | Storage rules |
| Post/score video | MP4, MOV, AVI | Storage rules `contentType.matches()` |
| All other types | Blocked | Storage rules deny-all catch |

### File Size Limits

| Context | Max Size | Enforced By |
|---------|----------|-------------|
| Profile photo | 10 MB | Storage rules `request.resource.size` |
| Post image | 10 MB | Storage rules |
| Post video | 100 MB | Storage rules |
| Score video | 100 MB | Storage rules |

### Additional Media Security

| Item | Status | Notes |
|------|--------|-------|
| Client-side image compression before upload | Required | Compress to < 1 MB for images (per NFR) |
| Content-Type header validation | Implemented | Storage rules check `contentType` |
| No executable file uploads | Implemented | Only image/video MIME types allowed |
| Storage paths scoped to resource type | Implemented | `users/`, `posts/`, `scores/`, `teams/` |
| Signed URLs with expiration | Recommended | Use `getDownloadURL()` which includes token |
| Virus/malware scanning | Not implemented | Consider Cloud Functions scan for v1.1 |
| Image metadata stripping (EXIF) | Recommended | Strip GPS/camera data for privacy |

---

## 5. API Rate Limiting

### Recommended Limits

| Action | Limit | Enforcement |
|--------|-------|-------------|
| Login attempts | 5 per 15 min per IP | Firebase Auth built-in |
| Post creation | 10 per hour per user | Cloud Function check |
| Comment creation | 30 per hour per user | Cloud Function check |
| Like/unlike toggle | 60 per hour per user | Client-side debounce + Cloud Function |
| Follow/unfollow | 30 per hour per user | Cloud Function check |
| Message send | 60 per hour per conversation | Cloud Function check |
| Score creation | 20 per day per user | Cloud Function check |
| Media upload | 50 per day per user | Cloud Function check |
| Search queries | 60 per minute per user | Client-side debounce |
| AI analysis requests | 10 per day per user | Cloud Function check |

### Implementation Strategy

1. **Client-side debouncing**: Debounce rapid-fire actions (like, follow toggle) with minimum 500ms between calls.
2. **Cloud Functions rate limiter**: Store rate counters in Firestore or Redis. Check before executing action.
3. **Firebase Auth**: Automatically rate-limits login attempts.
4. **Firestore quotas**: Monitor Firestore read/write quotas via Firebase console.

---

## 6. OWASP Mobile Top 10

### M1: Improper Credential Usage

| Risk | Mitigation | Status |
|------|-----------|--------|
| Hardcoded credentials | Firebase config via env vars (`EXPO_PUBLIC_*`) | Implemented |
| API keys in client code | Grok API key server-side only (Cloud Functions) | Implemented |
| Credentials in version control | `.env` in `.gitignore` | Required |

### M2: Inadequate Supply Chain Security

| Risk | Mitigation | Status |
|------|-----------|--------|
| Vulnerable dependencies | Regular `npm audit`, Dependabot | Recommended |
| Malicious packages | Pin dependency versions, review lockfile changes | Recommended |
| Expo SDK updates | Track Expo security advisories | Required |

### M3: Insecure Authentication/Authorization

| Risk | Mitigation | Status |
|------|-----------|--------|
| Missing auth checks | Firestore rules require `isAuthenticated()` | Implemented |
| Broken authorization | Firestore rules enforce `isOwner()`, `isTeamMember()`, etc. | Implemented |
| Token leakage | No tokens in URLs or logs | Required |

### M4: Insufficient Input/Output Validation

| Risk | Mitigation | Status |
|------|-----------|--------|
| Malformed data in Firestore | Server-side validation in Firestore rules | Implemented |
| Client-side validation bypass | Always validate in Firestore rules (source of truth) | Implemented |
| Oversize payloads | Size checks in rules + client validation | Implemented |

### M5: Insecure Communication

| Risk | Mitigation | Status |
|------|-----------|--------|
| Man-in-the-middle | Firebase SDK uses HTTPS/TLS by default | Built-in |
| Certificate pinning | React Native + Expo does not support easily; low priority for MVP | Deferred |
| Data in transit encryption | All Firebase communication over TLS 1.2+ | Built-in |

### M6: Inadequate Privacy Controls

| Risk | Mitigation | Status |
|------|-----------|--------|
| Over-collection of data | Minimal data collection (no analytics tracking beyond Firebase) | Implemented |
| Data exposure in logs | No PII in console.log in production | Required |
| Profile visibility settings | `isPublic` flag on user profiles | Implemented |

### M7: Insufficient Binary Protections

| Risk | Mitigation | Status |
|------|-----------|--------|
| Reverse engineering | React Native JS bundle is readable; no secrets in client code | Accepted risk |
| Code tampering | App signing (iOS/Android) | Built-in |
| Debug builds in production | Ensure release builds strip dev tools | Required |

### M8: Security Misconfiguration

| Risk | Mitigation | Status |
|------|-----------|--------|
| Default Firebase rules (allow all) | Custom rules written and deployed | Implemented |
| Open Storage buckets | Storage rules restrict by auth + file type | Implemented |
| Debug mode in production | Strip `__DEV__` checks, disable remote debugging | Required |

### M9: Insecure Data Storage

| Risk | Mitigation | Status |
|------|-----------|--------|
| Sensitive data in AsyncStorage | Only auth tokens (encrypted by OS on iOS) | Acceptable |
| Firestore offline cache | Contains user data; device encryption relied upon | Acceptable |
| Clipboard leakage | No auto-copy of sensitive data | Required |

### M10: Insufficient Cryptography

| Risk | Mitigation | Status |
|------|-----------|--------|
| Custom crypto implementation | Not applicable — using Firebase Auth | N/A |
| Weak algorithms | Firebase uses industry-standard algorithms | Built-in |
| Key management | Managed by Firebase; no client-side key storage | Built-in |

---

## 7. Privacy Compliance

### Data Export (Right of Access)

| Item | Implementation |
|------|---------------|
| User can request data export | Cloud Function that aggregates user's data across all collections |
| Exported data includes | Profile, posts, comments, likes, follows, scores, messages, notifications |
| Format | JSON download |
| Timeline | Within 30 days of request (per GDPR/APPI) |

### Data Deletion (Right to Erasure)

| Item | Implementation |
|------|---------------|
| Account deletion | Cloud Function that cascades deletion across all collections |
| Deletion scope | User doc, follows (both directions), posts, comments, likes, scores, messages, notifications, Storage files |
| Denormalized data cleanup | Update `authorName`/`authorPhotoURL` on orphaned posts/comments to "Deleted User" |
| Timeline | Within 30 days of request |
| Retention | No data retained after deletion except anonymized analytics |

### Data Minimization

| Principle | Implementation |
|-----------|---------------|
| Collect only necessary data | No address, phone, or government ID collected |
| Optional fields | position, team, age, throwHand, batHand, bio are all optional |
| No tracking | No third-party analytics SDK in MVP |

### Japan-Specific (APPI)

| Item | Status |
|------|--------|
| Purpose of use disclosed | Required in Terms of Service |
| Consent for data processing | Required at registration |
| Cross-border data transfer notice | Required if Firebase region is outside Japan |
| Data protection officer | Recommended for scale |

---

## 8. DM Access Control

### Mutual Follow Requirement

| Rule | Enforcement |
|------|-------------|
| DMs require mutual follow between both users | Firestore rules check `isFollowing(A, B) && isFollowing(B, A)` on conversation creation |
| Unfollow breaks DM access for new conversations | New conversation creation blocked if mutual follow broken |
| Existing conversations remain accessible | Once created, conversation participants are fixed |
| Cannot add third party to DM | `participants.size() == 2` enforced in rules |

### Message Security

| Item | Enforcement |
|------|-------------|
| Only participants can read messages | Firestore rules check `request.auth.uid in participants` |
| Only participants can send messages | Firestore rules check `senderId == request.auth.uid` + participant check |
| Message content immutable after send | Firestore rules block content changes on update |
| Read receipts scoped to participants | `readBy` array only modifiable by participants |
| No message deletion (MVP) | `allow delete: if false` in rules |

---

## 9. Team Data Isolation

### Team Boundary Enforcement

| Data | Isolation Rule | Enforcement |
|------|---------------|-------------|
| Team details | Members only (or public if `!isPrivate`) | Firestore rules `memberIds` check |
| Team member list | Members only | Firestore rules `isTeamMember()` |
| Team posts (`visibility='team'`) | Team members only | Post read rules check `isTeamMember(teamId)` |
| Team scores | Team members + score owner | Score read rules check membership |
| Team chat (future) | Members only | Same pattern as messages |
| Invite code | Visible to members, usable by anyone | By design (share code to invite) |

### Admin Operations

| Operation | Required Role | Enforcement |
|-----------|--------------|-------------|
| Update team details | Owner or Admin | `isTeamAdmin()` check |
| Remove member | Owner or Admin (cannot remove owner) | Rules check `resource.data.role != 'owner'` |
| Promote to admin | Owner or Admin | `isTeamAdmin()` check |
| Delete team | Owner only | `isTeamOwner()` check |
| Transfer ownership | Owner only | Cloud Function (admin SDK) |

### Member Self-Service

| Operation | Allowed |
|-----------|---------|
| Join via invite code | Yes (self-join as 'member') |
| Leave team | Yes (except owner) |
| View team data | Yes (all members) |
| Post to team | Yes (all members) |
| Change own role | No (admin operation) |

---

## 10. Firebase-Specific Security

### Firestore Rules

| Item | Status |
|------|--------|
| `rules_version = '2'` used | Yes |
| No wildcard `allow read, write: if true` rules | Verified |
| All collections have explicit rules | Yes |
| Helper functions for reusable checks | Yes (`isAuthenticated`, `isOwner`, `isTeamMember`, `isTeamAdmin`) |
| Counter fields protected from client manipulation | Yes (immutable in client writes) |
| Composite document IDs enforced | Yes (follows, likes) |

### Storage Rules

| Item | Status |
|------|--------|
| File type whitelisting (not blacklisting) | Yes |
| File size limits enforced | Yes (10MB images, 100MB videos) |
| Path-scoped rules (users/, posts/, scores/, teams/) | Yes |
| Catch-all deny rule for unmatched paths | Yes |
| Authenticated-only access | Yes |

### Cloud Functions Security

| Item | Status |
|------|--------|
| Grok API key in Cloud Functions environment only | Required |
| Admin SDK bypasses rules (used for counter updates) | By design |
| Input validation in callable functions | Required |
| CORS configured for callable functions | Required |
| No secrets in function source code | Required |

### Firebase Project Configuration

| Item | Status |
|------|--------|
| App Check enabled | Recommended for production |
| Authorized domains configured | Required |
| API key restrictions in Google Cloud Console | Recommended |
| Firebase Auth email enumeration protection | Enable in Firebase Console |
| Firestore backup enabled | Recommended |

---

## 11. Checklist Summary

### Pre-Launch Checklist

- [ ] All Firestore security rules deployed and tested with emulator
- [ ] All Storage security rules deployed and tested
- [ ] No `console.log` with sensitive data in production build
- [ ] `.env` file excluded from version control
- [ ] Grok API key only in Cloud Functions environment variables
- [ ] Firebase Auth brute-force protection verified
- [ ] Input validation on all user-facing forms (client + rules)
- [ ] Media upload type and size restrictions tested
- [ ] Rate limiting implemented for high-frequency operations
- [ ] Privacy policy and terms of service written and accessible
- [ ] Data export endpoint implemented (or planned for first update)
- [ ] Account deletion endpoint implemented (or planned for first update)
- [ ] All team data isolation rules verified with integration tests
- [ ] DM mutual follow requirement verified
- [ ] Release build tested (no debug tools, no dev logging)
- [ ] `npm audit` run with no critical/high vulnerabilities
- [ ] Firebase App Check evaluated and configured if applicable

### Post-Launch Monitoring

- [ ] Firebase Security Rules monitoring enabled
- [ ] Firestore usage quotas monitored
- [ ] Storage usage monitored
- [ ] Cloud Functions error rates monitored
- [ ] Auth failure patterns reviewed weekly
- [ ] Dependency vulnerability scanning (automated)

---

*Last Updated: 2026-02-09*
*Author: QA Agent*
