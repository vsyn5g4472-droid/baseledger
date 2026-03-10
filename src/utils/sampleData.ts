// =============================================================================
// Sample / Mock Data for Testing
// =============================================================================

import { Timestamp } from 'firebase/firestore';
import type {
  User,
  Post,
  Score,
  Team,
  UserStats,
  BattingScore,
  PitchingScore,
  FieldingScore,
} from '../models/types';

// ── Helpers ──────────────────────────────────────────────────────────────────

let idCounter = 1;
function nextId(prefix: string): string {
  return `${prefix}_${String(idCounter++).padStart(4, '0')}`;
}

function daysAgo(n: number): Timestamp {
  return Timestamp.fromDate(new Date(Date.now() - n * 86_400_000));
}

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

// ── Default Stats ────────────────────────────────────────────────────────────

function makeStats(overrides?: Partial<UserStats>): UserStats {
  return {
    batting: {
      avg: 0.265,
      gamesPlayed: 45,
      totalAtBats: 170,
      totalHits: 45,
      totalHomeRuns: 6,
      totalRbis: 28,
      ...overrides?.batting,
    },
    pitching: {
      era: 4.5,
      gamesPlayed: 0,
      totalInningsPitched: 0,
      totalStrikeouts: 0,
      totalEarnedRuns: 0,
      ...overrides?.pitching,
    },
    fielding: {
      fieldingPct: 0.97,
      totalPutouts: 85,
      totalAssists: 40,
      totalErrors: 4,
      ...overrides?.fielding,
    },
  };
}

// ── Sample Users ─────────────────────────────────────────────────────────────

export const sampleUsers: User[] = [
  {
    uid: 'user_0001',
    email: 'tanaka.yuki@example.com',
    displayName: '田中 悠希',
    photoURL: null,
    username: null,
    role: 'player',
    position: 'pitcher',
    team: 'team_0001',
    age: 22,
    throwHand: 'right',
    batHand: 'right',
    bio: '右腕投手。ストレートとスライダーが武器。',
    stats: makeStats({
      batting: { avg: 0.12, gamesPlayed: 30, totalAtBats: 50, totalHits: 6, totalHomeRuns: 0, totalRbis: 2 },
      pitching: { era: 3.15, gamesPlayed: 30, totalInningsPitched: 180, totalStrikeouts: 155, totalEarnedRuns: 63 },
    }),
    followersCount: 320,
    followingCount: 45,
    postsCount: 18,
    isPublic: true,
    createdAt: daysAgo(365),
    updatedAt: daysAgo(1),
  },
  {
    uid: 'user_0002',
    email: 'suzuki.haruto@example.com',
    displayName: '鈴木 陽翔',
    photoURL: null,
    username: null,
    role: 'player',
    position: 'catcher',
    team: 'team_0001',
    age: 24,
    throwHand: 'right',
    batHand: 'right',
    bio: '守備型キャッチャー。リード力に自信あり。',
    stats: makeStats({
      batting: { avg: 0.248, gamesPlayed: 50, totalAtBats: 190, totalHits: 47, totalHomeRuns: 8, totalRbis: 35 },
      fielding: { fieldingPct: 0.995, totalPutouts: 420, totalAssists: 35, totalErrors: 2 },
    }),
    followersCount: 210,
    followingCount: 60,
    postsCount: 24,
    isPublic: true,
    createdAt: daysAgo(300),
    updatedAt: daysAgo(2),
  },
  {
    uid: 'user_0003',
    email: 'sato.ren@example.com',
    displayName: '佐藤 蓮',
    photoURL: null,
    username: null,
    role: 'player',
    position: 'shortstop',
    team: 'team_0001',
    age: 20,
    throwHand: 'right',
    batHand: 'left',
    bio: '俊足巧打の遊撃手。盗塁が得意。',
    stats: makeStats({
      batting: { avg: 0.295, gamesPlayed: 48, totalAtBats: 200, totalHits: 59, totalHomeRuns: 3, totalRbis: 22 },
      fielding: { fieldingPct: 0.965, totalPutouts: 75, totalAssists: 145, totalErrors: 8 },
    }),
    followersCount: 450,
    followingCount: 80,
    postsCount: 32,
    isPublic: true,
    createdAt: daysAgo(250),
    updatedAt: daysAgo(1),
  },
  {
    uid: 'user_0004',
    email: 'takahashi.minato@example.com',
    displayName: '高橋 湊',
    photoURL: null,
    username: null,
    role: 'player',
    position: 'first base',
    team: 'team_0001',
    age: 26,
    throwHand: 'left',
    batHand: 'left',
    bio: '長距離砲。ホームランバッター。',
    stats: makeStats({
      batting: { avg: 0.272, gamesPlayed: 52, totalAtBats: 220, totalHits: 60, totalHomeRuns: 18, totalRbis: 55 },
      fielding: { fieldingPct: 0.992, totalPutouts: 450, totalAssists: 30, totalErrors: 4 },
    }),
    followersCount: 680,
    followingCount: 35,
    postsCount: 15,
    isPublic: true,
    createdAt: daysAgo(400),
    updatedAt: daysAgo(3),
  },
  {
    uid: 'user_0005',
    email: 'ito.sora@example.com',
    displayName: '伊藤 蒼空',
    photoURL: null,
    username: null,
    role: 'player',
    position: 'center field',
    team: 'team_0002',
    age: 21,
    throwHand: 'right',
    batHand: 'switch',
    bio: 'スイッチヒッター。広い守備範囲が武器。',
    stats: makeStats({
      batting: { avg: 0.31, gamesPlayed: 50, totalAtBats: 210, totalHits: 65, totalHomeRuns: 10, totalRbis: 38 },
      fielding: { fieldingPct: 0.985, totalPutouts: 135, totalAssists: 5, totalErrors: 2 },
    }),
    followersCount: 520,
    followingCount: 90,
    postsCount: 40,
    isPublic: true,
    createdAt: daysAgo(200),
    updatedAt: daysAgo(1),
  },
  {
    uid: 'user_0006',
    email: 'watanabe.kaito@example.com',
    displayName: '渡辺 海斗',
    photoURL: null,
    username: null,
    role: 'player',
    position: 'pitcher',
    team: 'team_0002',
    age: 23,
    throwHand: 'left',
    batHand: 'left',
    bio: '左腕エース。チェンジアップが決め球。',
    stats: makeStats({
      batting: { avg: 0.095, gamesPlayed: 28, totalAtBats: 42, totalHits: 4, totalHomeRuns: 0, totalRbis: 1 },
      pitching: { era: 2.78, gamesPlayed: 28, totalInningsPitched: 195, totalStrikeouts: 190, totalEarnedRuns: 60 },
    }),
    followersCount: 750,
    followingCount: 50,
    postsCount: 22,
    isPublic: true,
    createdAt: daysAgo(350),
    updatedAt: daysAgo(2),
  },
  {
    uid: 'user_0007',
    email: 'yamamoto.riku@example.com',
    displayName: '山本 陸',
    photoURL: null,
    username: null,
    role: 'player',
    position: 'third base',
    team: 'team_0002',
    age: 25,
    throwHand: 'right',
    batHand: 'right',
    bio: '強肩強打の三塁手。勝負強い打撃が持ち味。',
    stats: makeStats({
      batting: { avg: 0.285, gamesPlayed: 50, totalAtBats: 205, totalHits: 58, totalHomeRuns: 14, totalRbis: 48 },
      fielding: { fieldingPct: 0.955, totalPutouts: 50, totalAssists: 120, totalErrors: 8 },
    }),
    followersCount: 380,
    followingCount: 70,
    postsCount: 28,
    isPublic: true,
    createdAt: daysAgo(280),
    updatedAt: daysAgo(1),
  },
  {
    uid: 'user_0008',
    email: 'nakamura.aoi@example.com',
    displayName: '中村 碧',
    photoURL: null,
    username: null,
    role: 'player',
    position: 'second base',
    team: 'team_0003',
    age: 19,
    throwHand: 'right',
    batHand: 'left',
    bio: '若手注目株。バットコントロールが光る。',
    stats: makeStats({
      batting: { avg: 0.315, gamesPlayed: 35, totalAtBats: 155, totalHits: 49, totalHomeRuns: 2, totalRbis: 18 },
      fielding: { fieldingPct: 0.975, totalPutouts: 80, totalAssists: 100, totalErrors: 5 },
    }),
    followersCount: 290,
    followingCount: 110,
    postsCount: 35,
    isPublic: true,
    createdAt: daysAgo(150),
    updatedAt: daysAgo(1),
  },
  {
    uid: 'user_0009',
    email: 'kobayashi.haru@example.com',
    displayName: '小林 晴',
    photoURL: null,
    username: null,
    role: 'scout',
    position: null,
    team: null,
    age: 45,
    throwHand: null,
    batHand: null,
    bio: '元プロ選手。現在はスカウトとして活動中。',
    stats: makeStats(),
    followersCount: 1200,
    followingCount: 300,
    postsCount: 55,
    isPublic: true,
    createdAt: daysAgo(500),
    updatedAt: daysAgo(1),
  },
  {
    uid: 'user_0010',
    email: 'yoshida.coach@example.com',
    displayName: '吉田 大輝',
    photoURL: null,
    username: null,
    role: 'coach',
    position: null,
    team: 'team_0001',
    age: 38,
    throwHand: null,
    batHand: null,
    bio: '指導歴15年のベテランコーチ。育成に定評あり。',
    stats: makeStats(),
    followersCount: 890,
    followingCount: 150,
    postsCount: 42,
    isPublic: true,
    createdAt: daysAgo(450),
    updatedAt: daysAgo(2),
  },
];

// ── Sample Teams ─────────────────────────────────────────────────────────────

export const sampleTeams: Team[] = [
  {
    id: 'team_0001',
    name: '東京サンダーボルツ',
    description: '東京を拠点に活動する社会人野球チーム。',
    photoURL: null,    ownerId: 'user_0010',
    memberIds: ['user_0001', 'user_0002', 'user_0003', 'user_0004', 'user_0010'],
    inviteCode: 'THUNDER2024',
    isPrivate: false,
    createdAt: daysAgo(400),
  },
  {
    id: 'team_0002',
    name: '大阪ブレイブス',
    description: '大阪で活動するクラブチーム。攻撃野球がモットー。',
    photoURL: null,    ownerId: 'user_0006',
    memberIds: ['user_0005', 'user_0006', 'user_0007'],
    inviteCode: 'BRAVES2024',
    isPrivate: false,
    createdAt: daysAgo(350),
  },
  {
    id: 'team_0003',
    name: '横浜スターズ',
    description: '横浜の若手中心チーム。将来性豊かな選手が揃う。',
    photoURL: null,    ownerId: 'user_0008',
    memberIds: ['user_0008'],
    inviteCode: 'STARS2024',
    isPrivate: true,
    createdAt: daysAgo(150),
  },
];

// ── Sample Scores ────────────────────────────────────────────────────────────

const opponents = [
  '千葉ライオンズ', '名古屋ドラゴンズ', '福岡ホークス', '札幌ファイターズ',
  '広島カープ', '仙台イーグルス', '埼玉バファローズ', '神戸マリナーズ',
];

function makeBattingScore(): BattingScore {
  const atBats = randomInt(3, 5);
  const hits = randomInt(0, Math.min(atBats, 3));
  return {
    atBats,
    hits,
    doubles: hits > 1 ? randomInt(0, 1) : 0,
    triples: hits > 2 ? randomInt(0, 1) : 0,
    homeRuns: hits > 0 ? randomInt(0, 1) : 0,
    rbis: randomInt(0, 3),
    walks: randomInt(0, 2),
    strikeouts: randomInt(0, 2),
    stolenBases: randomInt(0, 1),
  };
}

function makePitchingScore(): PitchingScore {
  const ip = randomInt(5, 9);
  return {
    inningsPitched: ip,
    hits: randomInt(3, 8),
    runs: randomInt(0, 4),
    earnedRuns: randomInt(0, 3),
    walks: randomInt(1, 4),
    strikeouts: randomInt(4, 10),
    homeRunsAllowed: randomInt(0, 2),
  };
}

function makeFieldingScore(): FieldingScore {
  return {
    putouts: randomInt(1, 8),
    assists: randomInt(0, 5),
    errors: randomInt(0, 1),
  };
}

export const sampleScores: Score[] = Array.from({ length: 30 }, (_, i) => {
  // Distribute scores among first 8 players (actual players, not scout/coach)
  const playerIdx = i % 8;
  const player = sampleUsers[playerIdx];
  const isPitcher = player.position === 'pitcher';

  return {
    id: `score_${String(i + 1).padStart(4, '0')}`,
    playerId: player.uid,
    gameDate: daysAgo(randomInt(1, 60)),
    opponent: pick(opponents),
    batting: isPitcher && Math.random() > 0.5 ? null : makeBattingScore(),
    pitching: isPitcher ? makePitchingScore() : null,
    fielding: makeFieldingScore(),
    videoURL: null,
    aiAnalysis: null,
    teamId: player.team,
    createdAt: daysAgo(randomInt(1, 60)),
  };
});

// ── Sample Posts ──────────────────────────────────────────────────────────────

const postContents = {
  highlight: [
    '今日の試合でサヨナラヒット！チーム一丸で掴んだ勝利です。',
    '初回に3ランホームラン！最高の滑り出しでした。',
    'ファインプレーで三塁線のライナーをキャッチ！',
    '完封勝利！最後まで集中できました。',
    '9回2アウトから逆転打！諦めない気持ちが大事。',
  ],
  stats: [
    '今週の成績: 15打数6安打 (.400) 2本塁打 5打点',
    '先発登板: 7回 被安打4 奪三振8 自責点1',
    '今月の打率が.320に上昇。調子が上向いてきた。',
    '守備率.990をキープ中。エラーゼロを目指します。',
    '今シーズン初の完投勝利を記録！',
  ],
  text: [
    '冬のトレーニング開始。来シーズンに向けて体力強化します。',
    '新しいバットを試してみた。振り抜きやすくて良い感触。',
    'チームメイトと自主練。切磋琢磨できる仲間に感謝。',
    'フォーム改善に取り組んでいます。コーチのアドバイスが的確。',
    '試合後のミーティング。反省点を次に活かします。',
  ],
  video: [
    'バッティング練習の動画です。スイングの改善ポイントを意識中。',
    'ブルペンでの投球練習。新しい変化球を試しています。',
    'ノックの様子。足の運びを重点的に練習中。',
    'フリーバッティングの動画。タイミングの取り方を調整中。',
    '試合のダイジェスト映像です。',
  ],
};

export const samplePosts: Post[] = Array.from({ length: 20 }, (_, i) => {
  const author = sampleUsers[i % sampleUsers.length];
  const types: Array<'highlight' | 'stats' | 'text' | 'video'> = ['highlight', 'stats', 'text', 'video'];
  const type = types[i % types.length];
  const contents = postContents[type];

  return {
    id: `post_${String(i + 1).padStart(4, '0')}`,
    authorId: author.uid,
    authorName: author.displayName,
    authorPhotoURL: author.photoURL,
    type,
    content: contents[i % contents.length],
    mediaURLs: type === 'video' ? ['https://example.com/video.mp4'] : [],
    externalVideoUrl: null,
    statsData: type === 'stats' ? { avg: 0.32, hr: 2, rbi: 5 } : null,
    likesCount: randomInt(0, 50),
    commentsCount: randomInt(0, 15),
    visibility: 'public',
    teamId: author.team,
    createdAt: daysAgo(randomInt(1, 30)),
  };
});

// ── Generator Functions ──────────────────────────────────────────────────────

export function generateMockUser(overrides?: Partial<User>): User {
  const id = nextId('user');
  return ({
    uid: id,
    email: `${id}@example.com`,
    displayName: `テスト選手 ${id}`,
    photoURL: null,
    username: null,
    role: 'player',
    position: 'shortstop',
    team: null,
    age: randomInt(18, 35),
    throwHand: 'right',
    batHand: 'right',
    bio: 'テスト用の選手プロフィールです。',
    stats: makeStats(),
    followersCount: 0,
    followingCount: 0,
    postsCount: 0,
    isPublic: true,
    createdAt: Timestamp.now(),
    updatedAt: Timestamp.now(),
    ...overrides,
  }) as User;
}

export function generateMockPost(authorId: string, overrides?: Partial<Post>): Post {
  const id = nextId('post');
  return ({
    id,
    authorId,
    authorName: 'テスト選手',
    authorPhotoURL: null,
    type: 'text',
    content: 'テスト投稿です。',
    mediaURLs: [],
    externalVideoUrl: null,
    statsData: null,
    likesCount: 0,
    commentsCount: 0,
    visibility: 'public',
    teamId: null,
    createdAt: Timestamp.now(),
    ...overrides,
  }) as Post;
}

export function generateMockScore(playerId: string, overrides?: Partial<Score>): Score {
  const id = nextId('score');
  return {
    id,
    playerId,
    gameDate: daysAgo(randomInt(1, 30)),
    opponent: pick(opponents),
    batting: makeBattingScore(),
    pitching: null,
    fielding: makeFieldingScore(),
    videoURL: null,
    aiAnalysis: null,
    teamId: null,
    createdAt: Timestamp.now(),
    ...overrides,
  };
}
