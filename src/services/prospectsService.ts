// ============================================================
// Prospects / Category Ranking Service
//
// 将来の外部 API 連携を見据えた設計。
// カテゴリ別（プロ・大学・社会人・高校）に選手データを管理する。
// 本番では: const res = await fetch(`${API_BASE}/prospects?category=${category}`)
// ============================================================

export type PlayerCategory = 'pro' | 'college' | 'industrial' | 'high_school';

export const CATEGORY_LABELS: Record<PlayerCategory, string> = {
  pro:          'プロ',
  college:      '大学',
  industrial:   '社会人',
  high_school:  '高校',
};

export interface ProspectStats {
  battingAvg?:  string;   // 打率 e.g. ".342"
  era?:         string;   // 防御率 e.g. "2.15"
  maxVelocity?: string;   // 最速球速 e.g. "155"  (km/h)
  homeRuns?:    string;   // 本塁打 e.g. "18"
  strikeouts?:  string;   // 奪三振 e.g. "143"
  wins?:        string;   // 勝利数 e.g. "9"
  stolenBases?: string;   // 盗塁数 e.g. "22"
  ops?:         string;   // OPS e.g. ".921"
}

export interface ProspectPlayer {
  id: string;
  rank: number;
  name: string;
  nameEn: string;
  team: string;
  teamCode: string;
  position: string;
  category: PlayerCategory;
  stats: ProspectStats;
  attentionScore: number;
  trend: 'up' | 'down' | 'flat';
}

// ── Team colour palette ────────────────────────────────────────────────────────
export const PROSPECT_TEAM_COLORS: Record<string, string> = {
  // NPB
  LAD: '#005A9C', BOS: '#BD3039', CHC: '#0E3386',
  NYY: '#003087', YS:  '#009944', HAN: '#FFE600',
  SFH: '#FF8200', SEI: '#002B7F', YOK: '#003580',
  YOM: '#CC0000', CHI: '#E50024', LIO: '#003087',
  ORX: '#00A0C6', EAG: '#862633', BUFB: '#009245',
  // University
  WAS:  '#6F1E2D', KE: '#003087', TK: '#007AC0',
  HOS:  '#003087', RI: '#005BAC', ME: '#D7000F',
  // Industrial
  HONDA:   '#CC0000', TOKYO_GAS: '#0079C2', SONY:  '#003087',
  NTT:     '#009944', TOYOTA:    '#CC0000', KOBE:  '#005BAC',
  // High school
  OSAKA_T: '#CC0000', KANAGAWA_H: '#005BAC', KYUSHU_H: '#FF8200',
  KANTO_H: '#009944', TOHOKU_H:  '#003087',
};

// ── Mock Data ──────────────────────────────────────────────────────────────────

const PRO_PLAYERS: ProspectPlayer[] = [
  { id: 'pro-1', rank: 1, name: '大谷 翔平',  nameEn: 'Shohei Ohtani',   team: 'ドジャース',         teamCode: 'LAD', position: 'DH/P',  category: 'pro', stats: { homeRuns: '44',  battingAvg: '.310' }, attentionScore: 99, trend: 'up' },
  { id: 'pro-2', rank: 2, name: '山本 由伸',  nameEn: 'Yoshinobu Yamamoto', team: 'ドジャース',       teamCode: 'LAD', position: 'P',     category: 'pro', stats: { era: '2.33', maxVelocity: '161' }, attentionScore: 91, trend: 'up' },
  { id: 'pro-3', rank: 3, name: '佐々木 朗希', nameEn: 'Roki Sasaki',     team: 'ドジャース',         teamCode: 'LAD', position: 'P',     category: 'pro', stats: { strikeouts: '185', maxVelocity: '165' }, attentionScore: 88, trend: 'up' },
  { id: 'pro-4', rank: 4, name: '吉田 正尚',  nameEn: 'Masataka Yoshida', team: 'レッドソックス',     teamCode: 'BOS', position: 'LF',    category: 'pro', stats: { battingAvg: '.291', ops: '.821' }, attentionScore: 82, trend: 'flat' },
  { id: 'pro-5', rank: 5, name: '鈴木 誠也',  nameEn: 'Seiya Suzuki',    team: 'カブス',             teamCode: 'CHC', position: 'RF',    category: 'pro', stats: { battingAvg: '.279', homeRuns: '21' }, attentionScore: 79, trend: 'up' },
  { id: 'pro-6', rank: 6, name: '村上 宗隆',  nameEn: 'Munetaka Murakami', team: 'ヤクルト',          teamCode: 'YS',  position: '3B',    category: 'pro', stats: { homeRuns: '31', battingAvg: '.262' }, attentionScore: 75, trend: 'down' },
  { id: 'pro-7', rank: 7, name: '近本 光司',  nameEn: 'Koji Chikamoto',  team: '阪神',               teamCode: 'HAN', position: 'CF',    category: 'pro', stats: { battingAvg: '.294', stolenBases: '28' }, attentionScore: 71, trend: 'up' },
  { id: 'pro-8', rank: 8, name: '清原 正吾',  nameEn: 'Shogo Kiyohara', team: 'ソフトバンク',         teamCode: 'SFH', position: '1B',    category: 'pro', stats: { battingAvg: '.318', homeRuns: '14' }, attentionScore: 68, trend: 'up' },
];

const COLLEGE_PLAYERS: ProspectPlayer[] = [
  { id: 'col-1', rank: 1, name: '宗山 塁',    nameEn: 'Rui Murayama',   team: '明治大学',    teamCode: 'ME',  position: 'SS',   category: 'college', stats: { battingAvg: '.385', ops: '.991' },     attentionScore: 95, trend: 'up' },
  { id: 'col-2', rank: 2, name: '金丸 夢斗',  nameEn: 'Yumeto Kanamaru', team: '関西大学',   teamCode: 'RI',  position: 'P',    category: 'college', stats: { era: '1.02', maxVelocity: '153' },     attentionScore: 89, trend: 'up' },
  { id: 'col-3', rank: 3, name: '石塚 裕惺',  nameEn: 'Yusei Ishizuka', team: '花咲徳栄',    teamCode: 'ME',  position: 'SS/2B',category: 'college', stats: { battingAvg: '.362', stolenBases: '18' }, attentionScore: 82, trend: 'up' },
  { id: 'col-4', rank: 4, name: '伊原 陵人',  nameEn: 'Ryoto Ihara',    team: '亜細亜大学',  teamCode: 'TK',  position: 'P',    category: 'college', stats: { era: '1.44', wins: '8' },              attentionScore: 78, trend: 'flat' },
  { id: 'col-5', rank: 5, name: '中村 優斗',  nameEn: 'Yuto Nakamura',  team: '愛工大名電', teamCode: 'ME',  position: 'OF',   category: 'college', stats: { battingAvg: '.339', homeRuns: '9' },     attentionScore: 73, trend: 'up' },
  { id: 'col-6', rank: 6, name: '篠田 佳奈',  nameEn: 'Yoshina Shinoda', team: '早稲田大学', teamCode: 'WAS', position: 'P',    category: 'college', stats: { era: '2.18', strikeouts: '112' },       attentionScore: 70, trend: 'down' },
  { id: 'col-7', rank: 7, name: '鈴木 陽斗',  nameEn: 'Haruto Suzuki',  team: '慶應大学',    teamCode: 'KE',  position: '1B',   category: 'college', stats: { battingAvg: '.318', homeRuns: '12' },    attentionScore: 66, trend: 'flat' },
];

const INDUSTRIAL_PLAYERS: ProspectPlayer[] = [
  { id: 'ind-1', rank: 1, name: '寺地 隆成',  nameEn: 'Ryusei Terachi',  team: 'Honda',       teamCode: 'HONDA',     position: 'P',  category: 'industrial', stats: { era: '1.22', maxVelocity: '155' }, attentionScore: 86, trend: 'up' },
  { id: 'ind-2', rank: 2, name: '坂本 勇人2', nameEn: 'Hayato Sakamoto2', team: '東京ガス',   teamCode: 'TOKYO_GAS', position: 'SS', category: 'industrial', stats: { battingAvg: '.355', ops: '.946' }, attentionScore: 81, trend: 'up' },
  { id: 'ind-3', rank: 3, name: '今野 龍太',  nameEn: 'Ryuta Imano',    team: 'JR東日本',    teamCode: 'NTT',       position: 'P',  category: 'industrial', stats: { era: '1.65', wins: '7' },          attentionScore: 77, trend: 'flat' },
  { id: 'ind-4', rank: 4, name: '高山 壮汰',  nameEn: 'Sota Takayama',  team: 'トヨタ自動車', teamCode: 'TOYOTA',    position: '3B', category: 'industrial', stats: { battingAvg: '.341', homeRuns: '8' }, attentionScore: 73, trend: 'up' },
  { id: 'ind-5', rank: 5, name: '田中 悠仁',  nameEn: 'Yuto Tanaka',    team: 'Sony',        teamCode: 'SONY',      position: 'OF', category: 'industrial', stats: { battingAvg: '.307', stolenBases: '15' }, attentionScore: 69, trend: 'down' },
  { id: 'ind-6', rank: 6, name: '辻本 倫太郎', nameEn: 'Rintaro Tsujimoto', team: 'NTT西日本', teamCode: 'NTT',    position: 'P',  category: 'industrial', stats: { era: '2.01', strikeouts: '98' },    attentionScore: 64, trend: 'flat' },
];

const HIGH_SCHOOL_PLAYERS: ProspectPlayer[] = [
  { id: 'hs-1', rank: 1, name: '藤田 悠太郎', nameEn: 'Yutaro Fujita',  team: '大阪桐蔭',    teamCode: 'OSAKA_T',  position: 'P',   category: 'high_school', stats: { era: '0.88', maxVelocity: '150' }, attentionScore: 94, trend: 'up' },
  { id: 'hs-2', rank: 2, name: '村田 賢一',   nameEn: 'Kenichi Murata', team: '横浜',        teamCode: 'KANAGAWA_H',position: 'P',  category: 'high_school', stats: { era: '0.62', maxVelocity: '148' }, attentionScore: 90, trend: 'up' },
  { id: 'hs-3', rank: 3, name: '清水 大暉',   nameEn: 'Daiki Shimizu',  team: '明豊',        teamCode: 'KYUSHU_H', position: '1B',  category: 'high_school', stats: { battingAvg: '.468', homeRuns: '11' }, attentionScore: 85, trend: 'up' },
  { id: 'hs-4', rank: 4, name: '前田 悠伍',   nameEn: 'Yugo Maeda',     team: '大阪桐蔭',    teamCode: 'OSAKA_T',  position: 'P',   category: 'high_school', stats: { era: '0.74', wins: '12' },          attentionScore: 81, trend: 'flat' },
  { id: 'hs-5', rank: 5, name: '佐々木 麟太郎', nameEn: 'Rintaro Sasaki', team: '花巻東',    teamCode: 'TOHOKU_H', position: '1B',  category: 'high_school', stats: { battingAvg: '.441', homeRuns: '14' }, attentionScore: 79, trend: 'up' },
  { id: 'hs-6', rank: 6, name: '真鍋 慧',     nameEn: 'Satoshi Manabe', team: '広陵',        teamCode: 'KANTO_H',  position: 'C',   category: 'high_school', stats: { battingAvg: '.395', homeRuns: '7' },  attentionScore: 74, trend: 'down' },
  { id: 'hs-7', rank: 7, name: '齋藤 響介',   nameEn: 'Kyosuke Saito',  team: '仙台育英',    teamCode: 'TOHOKU_H', position: 'SS',  category: 'high_school', stats: { battingAvg: '.421', stolenBases: '19' }, attentionScore: 71, trend: 'up' },
];

const ALL_PROSPECTS: Record<PlayerCategory, ProspectPlayer[]> = {
  pro:          PRO_PLAYERS,
  college:      COLLEGE_PLAYERS,
  industrial:   INDUSTRIAL_PLAYERS,
  high_school:  HIGH_SCHOOL_PLAYERS,
};

// ── Service interface ──────────────────────────────────────────────────────────

export interface ProspectsServiceOptions {
  limit?: number;
  position?: string;
}

/**
 * カテゴリ別の注目選手ランキングを取得する。
 * 将来的に外部APIエンドポイントに切り替え可能。
 */
export async function getProspectsByCategory(
  category: PlayerCategory,
  options: ProspectsServiceOptions = {},
): Promise<ProspectPlayer[]> {
  // 本番では: const res = await fetch(`${API_BASE}/prospects?category=${category}&limit=${options.limit}`);
  await new Promise((r) => setTimeout(r, 120));
  let result = ALL_PROSPECTS[category] ?? [];
  if (options.position) {
    result = result.filter((p) => p.position.includes(options.position!));
  }
  return result.slice(0, options.limit ?? result.length);
}

/**
 * 全カテゴリの先頭N件を取得する（フィード用プレビュー）。
 */
export async function getTopProspectsAll(limit = 3): Promise<ProspectPlayer[]> {
  const all = Object.values(ALL_PROSPECTS).flat();
  all.sort((a, b) => b.attentionScore - a.attentionScore);
  return all.slice(0, limit);
}
