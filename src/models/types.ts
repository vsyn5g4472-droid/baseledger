import { Timestamp } from 'firebase/firestore';
import type { UserPlan } from '../services/planService';

export type { UserPlan };

// ============================================================
// User
// ============================================================

export type UserRole = 'player' | 'scout' | 'coach';
export type ThrowHand = 'left' | 'right' | 'both';
export type BatHand = 'left' | 'right' | 'switch';

export interface BattingStats {
  avg: number;
  gamesPlayed: number;
  totalAtBats: number;
  totalHits: number;
  totalHomeRuns: number;
  totalRbis: number;
}

export interface PitchingStats {
  era: number;
  gamesPlayed: number;
  totalInningsPitched: number;
  totalStrikeouts: number;
  totalEarnedRuns: number;
}

export interface FieldingStats {
  fieldingPct: number;
  totalPutouts: number;
  totalAssists: number;
  totalErrors: number;
}

export interface UserStats {
  batting: BattingStats;
  pitching: PitchingStats;
  fielding: FieldingStats;
}

/** スコアキーピングの表示項目ON/OFF（18項目、velocity は試合ごと velocityEnabled） */
export type RecordingItemId =
  | 'foul_tip'
  | 'sacrifice_fly'
  | 'fielders_choice'
  | 'double_play'
  | 'triple_play'
  | 'error_at_bat'
  | 'pickoff'
  | 'pickoff_balk'
  | 'pickoff_error'
  | 'bunt_stance'
  | 'bunt_detail'
  | 'sign_play'
  /** 個人のサイン見落とし（戦術 sign_play とは別、選手個別の戦術理解度指標） */
  | 'sign_miss'
  | 'pitch_zone_detail'
  | 'batted_ball_location'
  | 'batted_ball_distance'
  | 'runner_advancement_detail'
  | 'substitution';

export interface RecordingPreferences {
  /** true のとき詳細ON/OFFのうち上級向けの項目を表示 */
  detailMode: boolean;
  items: Partial<Record<RecordingItemId, boolean>>;
}

export interface User {
  uid: string;
  email: string;
  displayName: string;
  photoURL: string | null;
  /** Unique @ID chosen during onboarding. Null until set. */
  username: string | null;
  role: UserRole;
  position: string | null;
  team: string | null;
  age: number | null;
  throwHand: ThrowHand | null;
  batHand: BatHand | null;
  bio: string;
  stats: UserStats;
  plan: UserPlan;
  followersCount: number;
  followingCount: number;
  postsCount: number;
  isPublic: boolean;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  /** 未設定のユーザーは mergeWithDefaults で補完 */
  recordingPreferences?: RecordingPreferences;
}

// ============================================================
// Follow
// ============================================================

export interface Follow {
  followerId: string;
  followingId: string;
  createdAt: Timestamp;
}

// ============================================================
// Post
// ============================================================

export type PostType = 'highlight' | 'stats' | 'text' | 'video';
export type PostVisibility = 'public' | 'followers' | 'team';

export interface Post {
  id: string;
  authorId: string;
  authorName: string;
  authorPhotoURL: string | null;
  type: PostType;
  content: string;
  mediaURLs: string[];
  externalVideoUrl: string | null;
  statsData: Record<string, unknown> | null;
  likesCount: number;
  commentsCount: number;
  visibility: PostVisibility;
  teamId: string | null;
  createdAt: Timestamp;
  /** ローカル付与: ログインユーザーがいいね済みかどうか（Firestoreには保存しない） */
  isLiked?: boolean;
}

export interface Comment {
  id: string;
  authorId: string;
  authorName: string;
  authorPhotoURL: string | null;
  content: string;
  createdAt: Timestamp;
}

export interface Like {
  postId: string;
  userId: string;
  createdAt: Timestamp;
}

// ============================================================
// Team
// ============================================================

export type TeamMemberRole = 'owner' | 'admin' | 'member';

export interface Team {
  id: string;
  name: string;
  description: string;
  photoURL: string | null;
  ownerId: string;
  memberIds: string[];
  inviteCode: string;
  isPrivate: boolean;
  createdAt: Timestamp;
}

export interface TeamMember {
  userId: string;
  role: TeamMemberRole;
  joinedAt: Timestamp;
}

// ============================================================
// Score
// ============================================================

export interface BattingScore {
  atBats: number;
  hits: number;
  doubles: number;
  triples: number;
  homeRuns: number;
  rbis: number;
  walks: number;
  strikeouts: number;
  stolenBases: number;
}

export interface PitchingScore {
  inningsPitched: number;
  hits: number;
  runs: number;
  earnedRuns: number;
  walks: number;
  strikeouts: number;
  homeRunsAllowed: number;
}

export interface FieldingScore {
  putouts: number;
  assists: number;
  errors: number;
}

export interface Score {
  id: string;
  playerId: string;
  gameDate: Timestamp;
  opponent: string;
  batting: BattingScore | null;
  pitching: PitchingScore | null;
  fielding: FieldingScore | null;
  videoURL: string | null;
  aiAnalysis: string | null;
  teamId: string | null;
  createdAt: Timestamp;
}

// ============================================================
// Message (DM)
// ============================================================

export interface Conversation {
  id: string;
  participants: [string, string];
  lastMessage: string;
  lastMessageAt: Timestamp;
}

export interface Message {
  id: string;
  senderId: string;
  content: string;
  createdAt: Timestamp;
  readBy: string[];
}

// ============================================================
// Group Chat
// ============================================================

export type GroupMessageType = 'text' | 'system' | 'schedule';

export interface Group {
  id: string;
  teamId: string | null;
  name: string;
  description: string;
  photoURL: string | null;
  memberIds: string[];
  lastMessage: string;
  lastMessageAt: Timestamp;
  lastMessageSenderId: string | null;
  createdAt: Timestamp;
}

export interface GroupMessage {
  id: string;
  senderId: string; // 'system' for automated messages
  senderName: string;
  content: string;
  type: GroupMessageType;
  scheduleDate: string | null; // ISO date string for schedule messages
  mediaURLs: string[];
  createdAt: Timestamp;
  readBy: string[];
}

// ============================================================
// Notification
// ============================================================

export type NotificationType =
  | 'follow'
  | 'like'
  | 'comment'
  | 'teamInvite'
  | 'dm'
  | 'aiReport';

export interface NotificationData {
  postId?: string;
  teamId?: string;
  conversationId?: string;
  scoreId?: string;
  message?: string;
}

export interface Notification {
  id: string;
  userId: string;
  type: NotificationType;
  fromUserId: string | null;
  data: NotificationData;
  read: boolean;
  createdAt: Timestamp;
}

// ============================================================
// AI Service Types
// ============================================================

export interface PerformanceAnalysis {
  summary: string;
  strengths: string[];
  weaknesses: string[];
  trends: {
    metric: string;
    direction: 'improving' | 'declining' | 'stable';
    description: string;
  }[];
}

export interface ImprovementSuggestion {
  area: 'batting' | 'pitching' | 'fielding' | 'general';
  title: string;
  description: string;
  priority: 'high' | 'medium' | 'low';
  drills: string[];
}

export interface VideoAnalysis {
  mechanics: string;
  observations: string[];
  suggestions: string[];
}

export interface RecommendedPlayer {
  user: User;
  matchScore: number;
  matchReasons: string[];
}

export interface TeamAnalysis {
  teamId: string;
  summary: string;
  strengths: string[];
  weaknesses: string[];
  playerHighlights: {
    playerId: string;
    playerName: string;
    highlight: string;
  }[];
}

// ============================================================
// Service Input Types
// ============================================================

export interface CreatePostInput {
  type: PostType;
  content: string;
  mediaURIs: string[];
  externalVideoUrl: string | null;
  statsData: Record<string, unknown> | null;
  visibility: PostVisibility;
  teamId: string | null;
}

export interface CreateScoreInput {
  gameDate: Date;
  opponent: string;
  batting: BattingScore | null;
  pitching: PitchingScore | null;
  fielding: FieldingScore | null;
  videoURI: string | null;
  teamId: string | null;
}

export interface CreateTeamInput {
  name: string;
  description: string;
  photoURI: string | null;
  isPrivate: boolean;
}

export interface ScoutSearchFilters {
  role?: UserRole;
  position?: string;
  minAge?: number;
  maxAge?: number;
  throwHand?: ThrowHand;
  batHand?: BatHand;
  minBattingAvg?: number;
  minEra?: number;
  team?: string;
}

export interface UpdateUserInput {
  displayName?: string;
  photoURL?: string | null;
  role?: UserRole;
  position?: string | null;
  team?: string | null;
  age?: number | null;
  throwHand?: ThrowHand | null;
  batHand?: BatHand | null;
  bio?: string;
  isPublic?: boolean;
}

// ============================================================
// Pagination
// ============================================================

export interface PaginatedResult<T> {
  items: T[];
  lastDoc: unknown;
  hasMore: boolean;
}

// ============================================================
// Error Handling
// ============================================================

export type AppErrorCode =
  | 'NOT_FOUND'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'VALIDATION'
  | 'NETWORK'
  | 'UNKNOWN';

export class AppError extends Error {
  constructor(
    public code: AppErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'AppError';
  }
}
