// ============================================================
// 守備位置
// ============================================================
export const POSITIONS = ['', 'P', 'C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF', 'DH'] as const;
export type Position = (typeof POSITIONS)[number];

// ============================================================
// 選手
// ============================================================
export interface Player {
  id: string;
  name: string;
  number: number | null;        // 背番号 (任意: 草野球では番号なし可)
  position: Position;
  bats: 'L' | 'R' | 'S';      // 打席 (左/右/両)
  throws: 'L' | 'R';           // 投球 (左/右)
  isPlaceholder?: boolean;      // クイックスタート時の仮選手
  realPlayerId?: string;        // Firestore 名簿との紐付けID
}

// ============================================================
// ロースター（スタメン＋控え）
// ============================================================
export interface Roster {
  starters: [Player, Player, Player, Player, Player, Player, Player, Player, Player];
  bench: Player[];
  pitcher?: Player;   // DH制: 打順外の投手
}

// ============================================================
// チーム
// ============================================================
export interface Team {
  name: string;
  roster: Roster;
}

// ============================================================
// 球場情報
// ============================================================
export interface BallparkInfo {
  name: string;
  fenceDistance: {
    left: number;    // 左翼フェンス距離 (m)
    center: number;  // 中堅フェンス距離 (m)
    right: number;   // 右翼フェンス距離 (m)
  };
}

/** デフォルト球場サイズ（未設定: 0 = 飛距離計算スキップ） */
export const DEFAULT_BALLPARK: BallparkInfo = {
  name: '',
  fenceDistance: { left: 0, center: 0, right: 0 },
};

// ============================================================
// カウント・イニング状態
// ============================================================
export interface Count {
  balls: number;      // 0-3 (4でフォアボール)
  strikes: number;    // 0-2 (3で三振)
  outs: number;       // 0-2 (3でチェンジ)
}

export type HalfInning = 'top' | 'bottom';

export interface InningState {
  number: number;        // 1〜 (イニング番号)
  half: HalfInning;     // 表 / 裏
}

// ============================================================
// ランナー状態
// ============================================================
export interface Runners {
  first: Player | null;
  second: Player | null;
  third: Player | null;
}

// ============================================================
// 守備番号 (1=投手 〜 9=右翼手)
// ============================================================
export type FielderNumber = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;

export interface FieldingRecord {
  fielders: FielderNumber[];  // 関与した守備番号 (例: [6,4,3])
}

// ============================================================
// 牽制（Pickoff）
// ============================================================
export type PickoffResult = 'safe' | 'out' | 'balk' | 'error';
export type PickoffBase = 'first' | 'second' | 'third';

export interface PickoffEvent {
  id: string;
  inning: InningState;
  pitcherId: string;
  runnerId: string;
  targetBase: PickoffBase;
  result: PickoffResult;
  timestamp: number;
}

// ============================================================
// 走者進塁の結果・アクション
// ============================================================
export type RunnerOutcome = 'safe' | 'out_tag' | 'out_force' | 'error_advance';
export type RunnerAction = 'batted_ball' | 'tag_up' | 'wild_pitch' | 'stolen_base';
export type BaseTarget = 'first' | 'second' | 'third' | 'home' | 'out';

// アウト詳細理由
export type OutDetail =
  | 'force_out'        // フォースアウト
  | 'tag_out'          // タッチアウト
  | 'tag_up_fail'      // タッチアップ失敗
  | 'rundown'          // 挟殺（ランダウンプレイ）
  | 'caught_stealing'  // 盗塁死
  | 'pickoff'          // 牽制死
  | 'other';           // その他

export interface RunnerAdvancement {
  runnerId: string;
  playerName: string;
  fromBase: 'batter' | 'first' | 'second' | 'third';
  targetBase: BaseTarget;
  outcome: RunnerOutcome;
  action: RunnerAction;
  isForced: boolean;
  minBase: BaseTarget;
  outDetail?: OutDetail;   // アウトの場合の詳細理由
}

/** バント球の付加情報（構え・結果） */
export type BuntOutcome = 'stance_only' | 'foul' | 'swing_miss' | 'in_play';

/** 打席におけるバントの分類 */
export type BuntType = 'sacrifice' | 'squeeze' | 'safety' | 'push' | 'drag';

/** 打者の超過進塁理由（単打で2塁など） */
export type BatterAdvancementReason = 'good_baserunning' | 'error' | 'fielders_choice';

/** 打席付加情報 */
export interface AtBatExtra {
  buntType?: BuntType;
  signPlay?: SignPlayTag;
  batterAdvancementReasons?: BatterAdvancementReason[];
}

/** チーム戦術タグ（サインプレー） */
export type SignPlayTag =
  | 'hit_and_run'
  | 'run_and_hit'
  | 'squeeze'
  | 'double_steal'
  | 'delayed_steal'
  | 'bunt_and_run';

// ============================================================
// 進塁確認ペンディング状態
// ============================================================
export interface PendingAdvancement {
  result: AtBatResult;
  battedBall?: BattedBall;
  fielding?: FieldingRecord;
  advancements: RunnerAdvancement[];
  /** 打席完了時に AtBatLog へ取り込む */
  atBatExtra?: AtBatExtra;
}

// 牽制セーフ時の進塁確認ペンディング状態
export interface PendingPickoffSafe {
  fromBase: PickoffBase;
  runnerId: string;
  playerName: string;
}

/** ランナーなしでも打者進塁確認が必要なヒット系結果 */
export const HIT_RESULTS_NEEDING_BATTER_ADVANCEMENT: AtBatResult[] = [
  'single', 'double', 'triple',
];

/** 手動進塁確認が必要な打席結果 */
export const RESULTS_NEEDING_ADVANCEMENT: AtBatResult[] = [
  'single', 'double', 'triple',
  'error', 'fielders_choice',
  'sacrifice_bunt', 'sacrifice_fly',
  'double_play',
];

// ============================================================
// 球種
// ============================================================
export const PITCH_TYPES = [
  'fastball',     // ストレート
  'curve',        // カーブ
  'slider',       // スライダー
  'changeup',     // チェンジアップ
  'cutter',       // カットボール
  'sinker',       // シンカー
  'splitter',     // スプリット
  'knuckle',      // ナックル
  'fork',         // フォーク
  'shootball',    // シュート
] as const;
export type PitchType = (typeof PITCH_TYPES)[number];

// ============================================================
// ストライクゾーン (3x3 + ボールゾーン)
// ============================================================
export type StrikeZone =
  | '1' | '2' | '3'     // 上段 (左→右、打者視点)
  | '4' | '5' | '6'     // 中段
  | '7' | '8' | '9'     // 下段
  | 'BH'                 // ボール (高め)
  | 'BL'                 // ボール (低め)
  | 'BI'                 // ボール (内角)
  | 'BO';                // ボール (外角)

// ============================================================
// 投球結果
// ============================================================
export type PitchResult =
  | 'strike_called'      // 見逃しストライク
  | 'strike_swinging'    // 空振りストライク
  | 'ball'               // ボール
  | 'foul'               // ファウル
  | 'foul_tip'           // ファウルチップ
  | 'hit_by_pitch'       // 死球
  | 'in_play';           // インプレイ（打球）

// ============================================================
// 1球ごとの投球ログ
// ============================================================
export interface PitchLog {
  id: string;
  inning: InningState;
  pitchNumber: number;        // この打席での球数
  totalPitchNumber: number;   // この試合での通算球数
  pitcherId: string;
  batterId: string;
  catcherId?: string;             // 捕手ID（守備チームの捕手ポジション選手）
  pitchType: PitchType | string;  // カスタム球種にも対応
  zone: StrikeZone;
  pitchX?: number;            // キャンバス正規化座標 X (0-1, 左=0 右=1)
  pitchY?: number;            // キャンバス正規化座標 Y (0-1, 上=0 下=1)
  result: PitchResult;
  velocity?: number;          // 球速 (km/h, 任意)
  countBefore: Count;         // この球を投げる前のカウント
  countAfter: Count;          // この球を投げた後のカウント
  timestamp: number;
  /** バントの構えを見せたか */
  buntAttempt?: boolean;
  /** バント意図がある球の詳細 */
  buntOutcome?: BuntOutcome;
}

// ============================================================
// サインミス（選手個別の戦術理解度指標）
//   sign_play（チーム戦術タグ）とは別物。
//   個人がサインを見落とした事象を選手単位で記録する。
// ============================================================
export type SignMissContext = 'batting' | 'baserunning' | 'fielding' | 'pitching';

export interface SignMissEvent {
  id: string;
  inning: InningState;
  /** 関与中の打席があれば紐付ける（任意） */
  atBatId?: string;
  side: 'away' | 'home';
  playerId: string;
  playerName: string;
  context: SignMissContext;
  note?: string;
  timestamp: number;
}

// ============================================================
// 盗塁企図ログ
// ============================================================

/** recordStolenBase / recordCaughtStealing に渡す投球コンテキスト */
export interface StolenBasePitchContext {
  pitchType?: PitchType | string;
  pitchZone?: StrikeZone;
  pitchVelocity?: number;
  countBefore?: Count;
  pitchResult?: PitchResult;
  signPlay?: SignPlayTag;
}

export interface StolenBaseLog {
  id: string;
  inning: InningState;
  runnerId: string;
  runnerName: string;
  fromBase: 'first' | 'second' | 'third';
  toBase: 'second' | 'third' | 'home';
  result: 'safe' | 'out';
  // 投球コンテキスト（投球モーダル経由で自動付与）
  pitchType?: PitchType | string;
  pitchZone?: StrikeZone;
  pitchVelocity?: number;
  countBefore?: Count;       // 投球前のカウント
  pitchResult?: PitchResult; // その球の結果（ボール/ストライク等）
  outsAtTime: number;
  timestamp: number;
  signPlay?: SignPlayTag;
}

// ============================================================
// 打球属性
// ============================================================
export type BattedBallType = 'grounder' | 'liner' | 'fly' | 'popup';

export interface BattedBall {
  type: BattedBallType;
  fieldX: number;             // フィールド座標 X (0-1 正規化)
  fieldY: number;             // フィールド座標 Y (0-1 正規化)
  estimatedDistance: number;  // 推定飛距離 (m)
}

// ============================================================
// 打席結果
// ============================================================
export type AtBatResult =
  | 'strikeout'           // 三振
  | 'strikeout_looking'   // 見逃し三振
  | 'walk'                // 四球
  | 'hit_by_pitch'        // 死球
  | 'single'              // 単打
  | 'double'              // 二塁打
  | 'triple'              // 三塁打
  | 'home_run'            // 本塁打
  | 'groundout'           // ゴロアウト
  | 'flyout'              // フライアウト
  | 'lineout'             // ライナーアウト
  | 'pop_out'             // ポップフライ
  | 'sacrifice_bunt'      // 犠打
  | 'sacrifice_fly'       // 犠飛
  | 'fielders_choice'     // 野選
  | 'error'               // エラー
  | 'double_play'         // ダブルプレイ
  | 'triple_play';        // トリプルプレイ

// ============================================================
// 打席ログ
// ============================================================
export interface AtBatLog {
  id: string;
  inning: InningState;
  batterId: string;
  pitcherId: string;
  pitches: PitchLog[];
  result: AtBatResult | null;  // null = 打席進行中
  battedBall?: BattedBall;
  fielding?: FieldingRecord;   // 関与した守備番号
  rbiCount: number;
  outType?: 'force' | 'tag';  // 打球アウトの種別（フォースアウト/タッチアウト）
  runnersBeforePlay: Runners;
  runnersAfterPlay: Runners;
  runnerAdvancements?: RunnerAdvancement[];  // 進塁詳細（outDetail含む）永続化用
  timestamp: number;
  note?: string;               // 打者・打席に関するフリーメモ
  /** バントの分類（犠打・スクイズ等） */
  buntType?: BuntType;
  /** サインプレー */
  signPlay?: SignPlayTag;
  /** 打者がデフォルトより先に進んだ理由（複数選択可） */
  batterAdvancementReasons?: BatterAdvancementReason[];
}

// ============================================================
// スコアボード
// ============================================================
export interface InningScore {
  inning: number;
  away: number;
  home: number;
}

export interface Scoreboard {
  innings: InningScore[];
  awayTotal: number;
  homeTotal: number;
  awayHits: number;
  homeHits: number;
  awayErrors: number;
  homeErrors: number;
}

// ============================================================
// 試合メタデータ (カテゴリ分類)
// ============================================================
export type GameCategory =
  | 'practice'     // 練習試合
  | 'official'     // 公式戦
  | 'tournament'   // 大会
  | 'other';       // その他

export interface GameMetadata {
  category: GameCategory;
  tournamentName: string;   // 大会名・メモ (自由記述)
}

// ============================================================
// ゲームフェーズ
// ============================================================
export type GamePhase =
  | 'setup'       // セットアップ中
  | 'live'        // 試合中
  | 'paused'      // 一時保存中
  | 'finished';   // 試合終了

// ============================================================
// GameState: マスター状態
// ============================================================
export interface GameState {
  // メタ情報
  id: string;
  phase: GamePhase;
  createdAt: number;
  updatedAt: number;
  metadata: GameMetadata;

  // チーム
  awayTeam: Team;
  homeTeam: Team;

  // 球場
  ballpark: BallparkInfo;

  // 進行状態
  inning: InningState;
  count: Count;
  runners: Runners;
  currentBatterIndex: {
    away: number;   // 先攻の現在打順 (0-8)
    home: number;   // 後攻の現在打順 (0-8)
  };
  currentPitcherId: {
    away: string;   // 先攻の現投手ID
    home: string;   // 後攻の現投手ID
  };

  // スコアボード
  scoreboard: Scoreboard;

  // ログ
  pitchLogs: PitchLog[];
  atBatLogs: AtBatLog[];
  pickoffEvents: PickoffEvent[];
  stolenBaseLogs: StolenBaseLog[];
  currentAtBat: AtBatLog | null;

  // 統計 (通算球数)
  totalPitchCount: {
    away: number;
    home: number;
  };

  // 現在登板中の投手の球数（投手交代でリセット）
  currentPitcherPitchCount?: {
    away: number;
    home: number;
  };

  // 進塁確認ペンディング
  pendingAdvancement: PendingAdvancement | null;

  // 選手交代ログ
  substitutionLogs: SubstitutionLog[];

  // サインミス（選手個別）
  signMissEvents: SignMissEvent[];

  // カスタム球種 (ユーザー追加分)
  customPitchTypes: string[];

  // クイックスタート関連
  isQuickStart?: boolean;         // クイックスタートで開始された試合
  hasUnmappedPlayers?: boolean;   // 仮選手が未紐付けのまま残っている

  // 偵察モード
  isScout?: boolean;              // 偵察モードで記録された試合

  // 計測設定
  pitchDistanceM?: number;        // 投球距離 (m): 18.44=一般・中学, 16.00=学童
  velocityEnabled?: boolean;      // 球速計測モード ON/OFF

  // DH制 (チームごとに独立)
  isDH?: { away: boolean; home: boolean };

  // 直前の打席進塁確認前のスナップショット（やり直し用・旧形式、undoStack に移行）
  preAdvancementSnapshot?: {
    runners: Runners;
    count: Count;
    scoreboard: Scoreboard;
    inning: InningState;
    currentBatterIndex: { away: number; home: number };
    currentPitcherId: { away: string; home: string };
    currentAtBat: AtBatLog | null;
    pendingAdvancement: PendingAdvancement | null;
  };

  /** イニング内プレイ巻き戻し用スタック（メモリ上のみ、DB には保存しない） */
  undoStack?: GameUndoSnapshot[];
}

/** 1プレイ巻き戻し用のゲーム状態スナップショット */
export interface GameUndoSnapshot {
  inning: InningState;
  pitchLogs: PitchLog[];
  atBatLogs: AtBatLog[];
  pickoffEvents: PickoffEvent[];
  stolenBaseLogs: StolenBaseLog[];
  substitutionLogs: SubstitutionLog[];
  signMissEvents: SignMissEvent[];
  runners: Runners;
  count: Count;
  scoreboard: Scoreboard;
  currentBatterIndex: { away: number; home: number };
  currentPitcherId: { away: string; home: string };
  currentAtBat: AtBatLog | null;
  totalPitchCount: { away: number; home: number };
  currentPitcherPitchCount: { away: number; home: number };
  pendingAdvancement: PendingAdvancement | null;
  pendingPickoffSafe: PendingPickoffSafe | null;
  awayTeam: Team;
  homeTeam: Team;
}

// ============================================================
// 選手交代ログ
// ============================================================
export interface SubstitutionLog {
  id: string;
  inning: InningState;
  outs: number;
  side: 'away' | 'home';      // 交代が発生したチーム
  position: Position;          // 交代が起きたポジション
  playerOutId: string;
  playerOutName: string;
  playerInId: string;
  playerInName: string;
  timestamp: number;
  substitutionType?: 'pinch_hitter' | 'pinch_runner';
}

// ============================================================
// セットアップ入力用の型 (フォーム用)
// ============================================================
export interface PlayerInput {
  name: string;
  number: string;
  position: Position;
  bats: 'L' | 'R' | 'S';
  throws: 'L' | 'R';
  isPlaceholder?: boolean;
  realPlayerId?: string;
}

export interface TeamInput {
  name: string;
  starters: PlayerInput[];
  bench: PlayerInput[];
  pitcher?: PlayerInput;   // DH制: 打順外の投手
}

export interface GameSetupInput {
  metadata: GameMetadata;
  awayTeam: TeamInput;
  homeTeam: TeamInput;
  ballpark: {
    name: string;
    fenceLeft: string;
    fenceCenter: string;
    fenceRight: string;
  };
  isQuickStart?: boolean;
  isScout?: boolean;
  pitchDistanceM?: number;
  velocityEnabled?: boolean;
  awayIsDH?: boolean;  // 先攻チームのDH制ON/OFF
  homeIsDH?: boolean;  // 後攻チームのDH制ON/OFF
}
