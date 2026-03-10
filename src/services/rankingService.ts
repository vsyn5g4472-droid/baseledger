// ============================================================
// Ranking Service
// 将来的に外部API（NPB公式・スポーツデータAPI等）と差し替え可能な
// インターフェース設計。現時点はモックデータを返す。
// ============================================================

export interface FeaturedPlayer {
  id: string;
  name: string;
  nameEn: string;
  team: string;
  teamCode: string;       // チーム識別コード（カラー用）
  number: number;
  position: string;
  attentionScore: number; // 注目度スコア 0-100
  trend: 'up' | 'down' | 'flat'; // 前日比トレンド
  statLabel: string;      // ハイライト統計ラベル（例: "打率"）
  statValue: string;      // ハイライト統計値（例: ".342"）
}

// ── Mock Data ─────────────────────────────────────────────────────────────────
// NPB & MLB の著名選手をモックデータとして定義
const MOCK_FEATURED: FeaturedPlayer[] = [
  {
    id: 'player-001',
    name: '大谷 翔平',
    nameEn: 'Shohei Ohtani',
    team: 'ロサンゼルス・ドジャース',
    teamCode: 'LAD',
    number: 17,
    position: 'DH / P',
    attentionScore: 99,
    trend: 'up',
    statLabel: '本塁打',
    statValue: '44',
  },
  {
    id: 'player-002',
    name: '山本 由伸',
    nameEn: 'Yoshinobu Yamamoto',
    team: 'ロサンゼルス・ドジャース',
    teamCode: 'LAD',
    number: 18,
    position: 'P',
    attentionScore: 91,
    trend: 'up',
    statLabel: '防御率',
    statValue: '2.33',
  },
  {
    id: 'player-003',
    name: '佐々木 朗希',
    nameEn: 'Roki Sasaki',
    team: 'ロサンゼルス・ドジャース',
    teamCode: 'LAD',
    number: 11,
    position: 'P',
    attentionScore: 88,
    trend: 'up',
    statLabel: '奪三振',
    statValue: '185',
  },
  {
    id: 'player-004',
    name: '吉田 正尚',
    nameEn: 'Masataka Yoshida',
    team: 'ボストン・レッドソックス',
    teamCode: 'BOS',
    number: 7,
    position: 'LF',
    attentionScore: 82,
    trend: 'flat',
    statLabel: '打率',
    statValue: '.291',
  },
  {
    id: 'player-005',
    name: '鈴木 誠也',
    nameEn: 'Seiya Suzuki',
    team: 'シカゴ・カブス',
    teamCode: 'CHC',
    number: 27,
    position: 'RF',
    attentionScore: 79,
    trend: 'up',
    statLabel: '打点',
    statValue: '72',
  },
  {
    id: 'player-006',
    name: '村上 宗隆',
    nameEn: 'Munetaka Murakami',
    team: '東京ヤクルトスワローズ',
    teamCode: 'YS',
    number: 55,
    position: '3B',
    attentionScore: 75,
    trend: 'down',
    statLabel: '本塁打',
    statValue: '31',
  },
  {
    id: 'player-007',
    name: '近本 光司',
    nameEn: 'Koji Chikamoto',
    team: '阪神タイガース',
    teamCode: 'HAN',
    number: 5,
    position: 'CF',
    attentionScore: 71,
    trend: 'up',
    statLabel: '盗塁',
    statValue: '28',
  },
  {
    id: 'player-008',
    name: '清原 正吾',
    nameEn: 'Shogo Kiyohara',
    team: '福岡ソフトバンクホークス',
    teamCode: 'SFH',
    number: 5,
    position: '1B / OF',
    attentionScore: 68,
    trend: 'up',
    statLabel: '打率',
    statValue: '.318',
  },
];

// ── Team color mapping ────────────────────────────────────────────────────────
export const TEAM_COLORS: Record<string, string> = {
  LAD: '#005A9C',
  BOS: '#BD3039',
  CHC: '#0E3386',
  NYY: '#003087',
  YS: '#009944',
  HAN: '#FFE600',
  SFH: '#FFD700',
  SEI: '#002B7F',
  YOK: '#003580',
};

// ── Service interface ─────────────────────────────────────────────────────────
export interface RankingServiceOptions {
  limit?: number;
  position?: string;   // ポジションフィルター（将来用）
  team?: string;       // チームフィルター（将来用）
}

/**
 * 注目選手ランキングを取得する。
 * 将来的に外部APIのエンドポイントに切り替え可能。
 */
export async function getRankedPlayers(
  options: RankingServiceOptions = {},
): Promise<FeaturedPlayer[]> {
  // 本番では: const res = await fetch(`${API_BASE}/ranking?limit=${options.limit ?? 10}`);
  await new Promise((r) => setTimeout(r, 150)); // ネットワーク遅延のシミュレート
  let result = [...MOCK_FEATURED];
  if (options.position) {
    result = result.filter((p) => p.position.includes(options.position!));
  }
  if (options.team) {
    result = result.filter((p) => p.teamCode === options.team);
  }
  return result.slice(0, options.limit ?? result.length);
}

/**
 * 特定選手の詳細を取得する。
 */
export async function getPlayerById(id: string): Promise<FeaturedPlayer | null> {
  return MOCK_FEATURED.find((p) => p.id === id) ?? null;
}
