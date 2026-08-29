import { create } from 'zustand';
import { produce } from 'immer';
import { immer } from 'zustand/middleware/immer';
import { db } from '../db';
import { incrementGameUsage } from '../services/planService';
import { capBatterTargetBase } from '../utils/runnerAdvancementRules';
import type {
  GameState,
  GamePhase,
  GameSetupInput,
  GameUndoSnapshot,
  Team,
  Player,
  Roster,
  BallparkInfo,
  PitchType,
  StrikeZone,
  PitchResult,
  PitchLog,
  AtBatResult,
  AtBatLog,
  BattedBall,
  Runners,
  Count,
  FieldingRecord,
  RunnerAdvancement,
  BaseTarget,
  PendingAdvancement,
  PendingPickoffSafe,
  PickoffBase,
  PickoffResult,
  PickoffEvent,
  SubstitutionLog,
  StolenBaseLog,
  StolenBasePitchContext,
  BuntType,
  BuntOutcome,
  SignPlayTag,
  SignMissEvent,
  SignMissContext,
  InningState,
  Position,
} from '../types/game';
import { BATTER_RESULTS_NEEDING_ADVANCEMENT } from '../types/game';
import type { AtBatExtra } from '../types/game';
import {
  reassignPitcherRecords,
  type PitcherReassignmentInput,
} from '../services/pitcherReassignmentService';
import {
  safeLocalGamePut,
  type LocalPutResult,
} from '../services/pitcherReassignmentPersistence';
import {
  findPitcherById,
  hasPitcherAttributionReference,
  hasUnresolvedPitcherStints,
  isUnassignedPitcherId,
  makeUnassignedPitcherInput,
  nextUnassignedPitcherNumber,
} from '../services/unassignedPitcherService';

// ============================================================
// ヘルパー: 攻撃/守備チームの判定
// ============================================================

/** 現在の攻撃側 ('away' | 'home') */
function offenseSide(game: GameState): 'away' | 'home' {
  return game.inning.half === 'top' ? 'away' : 'home';
}

/** 現在の守備側 ('away' | 'home') */
function defenseSide(game: GameState): 'away' | 'home' {
  return game.inning.half === 'top' ? 'home' : 'away';
}

/** 攻撃側チームを取得 */
function offenseTeam(game: GameState): Team {
  return offenseSide(game) === 'away' ? game.awayTeam : game.homeTeam;
}

/** 現在の打者を取得 */
function currentBatter(game: GameState): Player {
  const side = offenseSide(game);
  const idx = game.currentBatterIndex[side];
  return offenseTeam(game).roster.starters[idx];
}

/** 現在の投手IDを取得 */
function currentPitcherId(game: GameState): string {
  return game.currentPitcherId[defenseSide(game)];
}

/** 現在の捕手IDを取得 (守備チームのスタメン捕手) */
function currentCatcherId(game: GameState): string | undefined {
  const defSide = defenseSide(game);
  const defTeam = defSide === 'away' ? game.awayTeam : game.homeTeam;
  return defTeam.roster.starters.find((p) => p.position === 'C')?.id;
}

// ============================================================
// ヘルパー: ユニークID生成
// ============================================================
let idSeq = 0;
function uid(prefix: string): string {
  return `${prefix}-${Date.now()}-${++idSeq}`;
}

// ============================================================
// イニング内プレイ巻き戻し（undoStack）
// ============================================================

function inningKey(inning: InningState): string {
  return `${inning.number}-${inning.half}`;
}

function createUndoSnapshot(
  game: GameState,
  pendingPickoffSafe: PendingPickoffSafe | null,
): GameUndoSnapshot {
  return JSON.parse(JSON.stringify({
    inning: game.inning,
    pitchLogs: game.pitchLogs,
    atBatLogs: game.atBatLogs,
    pickoffEvents: game.pickoffEvents,
    stolenBaseLogs: game.stolenBaseLogs ?? [],
    substitutionLogs: game.substitutionLogs ?? [],
    signMissEvents: game.signMissEvents ?? [],
    runners: game.runners,
    count: game.count,
    scoreboard: game.scoreboard,
    currentBatterIndex: game.currentBatterIndex,
    currentPitcherId: game.currentPitcherId,
    currentAtBat: game.currentAtBat,
    totalPitchCount: game.totalPitchCount,
    currentPitcherPitchCount: game.currentPitcherPitchCount ?? { away: 0, home: 0 },
    pendingAdvancement: game.pendingAdvancement,
    pendingPickoffSafe,
    awayTeam: game.awayTeam,
    homeTeam: game.homeTeam,
  }));
}

function restoreUndoSnapshot(
  game: GameState,
  snap: GameUndoSnapshot,
): PendingPickoffSafe | null {
  game.inning = snap.inning;
  game.pitchLogs = snap.pitchLogs;
  game.atBatLogs = snap.atBatLogs;
  game.pickoffEvents = snap.pickoffEvents;
  game.stolenBaseLogs = snap.stolenBaseLogs;
  game.substitutionLogs = snap.substitutionLogs;
  game.signMissEvents = snap.signMissEvents;
  game.runners = snap.runners;
  game.count = snap.count;
  game.scoreboard = snap.scoreboard;
  game.currentBatterIndex = snap.currentBatterIndex;
  game.currentPitcherId = snap.currentPitcherId;
  game.currentAtBat = snap.currentAtBat;
  game.totalPitchCount = snap.totalPitchCount;
  game.currentPitcherPitchCount = snap.currentPitcherPitchCount;
  game.pendingAdvancement = snap.pendingAdvancement;
  game.awayTeam = snap.awayTeam;
  game.homeTeam = snap.homeTeam;
  game.preAdvancementSnapshot = undefined;
  return snap.pendingPickoffSafe;
}

function ensureUndoStackForCurrentInning(game: GameState): void {
  if (!game.undoStack) game.undoStack = [];
  const top = game.undoStack[game.undoStack.length - 1];
  if (top && inningKey(top.inning) !== inningKey(game.inning)) {
    game.undoStack = [];
  }
}

function pushUndoSnapshot(
  game: GameState,
  pendingPickoffSafe: PendingPickoffSafe | null,
): void {
  ensureUndoStackForCurrentInning(game);
  if (!game.undoStack) game.undoStack = [];
  game.undoStack.push(createUndoSnapshot(game, pendingPickoffSafe));
}

function canUndoPlayState(game: GameState | null): boolean {
  return !!(game?.undoStack && game.undoStack.length > 0);
}

/** addBenchPlayer / addBenchAndSubstitute 共通の新規選手入力データ */
type NewPlayerData = { name: string; number: number | null; bats: 'L' | 'R' | 'S'; throws: 'L' | 'R'; position?: string };

// ============================================================
// ストアのアクション型定義
// ============================================================
interface GameActions {
  // --- ライフサイクル ---
  initGame: (input: GameSetupInput) => Promise<void>;
  loadGame: (id: string) => Promise<void>;
  setPhase: (phase: GamePhase) => void;
  persist: () => Promise<void>;
  /** 月間試合枠を未消費なら 1 回だけ消費する（一時保存・試合終了時） */
  recordGameUsageOnce: () => Promise<void>;
  clearActiveGame: () => void;
  /** 試合中の投手記録を明示選択した選手へ移管し、端末保存を確認する。 */
  reassignActivePitcherRecords: (input: PitcherReassignmentInput) => Promise<LocalPutResult>;
  /** 実投手をまだ登録せず、新しい投球区間専用IDで投手交代する。 */
  startUnassignedPitcherStint: (
    side: 'away' | 'home',
  ) => Promise<'started' | 'blocked' | 'save_failed' | 'unknown_local_state'>;

  // --- 投球アクション ---
  /**
   * 1球を記録する。結果に応じてカウント・打席結果を自動進行
   * pitchExtra: バント構え等（記録ON時）
   */
  recordPitch: (
    pitchType: PitchType | string,
    zone: StrikeZone,
    result: PitchResult,
    velocity?: number,
    pitchX?: number,
    pitchY?: number,
    pitchExtra?: {
      buntAttempt?: boolean;
      buntOutcome?: BuntOutcome;
      battedBall?: BattedBall;
      /** ファウルで無効になった盗塁企図。走者は動かさずログだけ残す。 */
      stolenBaseNoPlayFromBases?: Array<'first' | 'second' | 'third'>;
      stolenBaseSignPlay?: SignPlayTag;
    },
  ) => void;

  // --- 打席結果アクション (インプレイ時に呼ぶ) ---
  /** インプレイの結果を確定する */
  resolveAtBat: (
    result: AtBatResult,
    battedBall?: BattedBall,
    rbiCount?: number,
    atBatExtra?: AtBatExtra,
  ) => void;

  // --- ランナー操作 ---
  /** ランナーを進塁させる (得点を含む) */
  advanceRunners: (scoring: string[], advances: { from: 'first' | 'second' | 'third'; to: 'second' | 'third' | 'home' }[]) => void;

  // --- 進塁確認フロー ---
  /** Phase 1: 進塁確認モードに入る */
  beginAdvancementConfirmation: (
    result: AtBatResult,
    battedBall?: BattedBall,
    fielding?: FieldingRecord,
    atBatExtra?: AtBatExtra,
  ) => void;
  /** Phase 2: 進塁確認を確定する */
  confirmAdvancement: (
    finalAdvancements: RunnerAdvancement[],
    atBatExtra?: AtBatExtra,
  ) => void;
  /** 進塁確認をキャンセルする */
  cancelAdvancement: () => void;
  /** 直前の打席の進塁確認結果を取り消してやり直す（undoLastPlay に委譲） */
  revertToPreAdvancement: () => void;

  // --- カスタム球種 ---
  /** カスタム球種を追加する */
  addCustomPitchType: (name: string) => void;

  // --- アンドゥ ---
  /** 直前の1プレイを取り消す（イニング内） */
  undoLastPlay: () => void;
  /** 直前の1球を取り消す（undoLastPlay に委譲） */
  undoLastPitch: () => void;
  /** 巻き戻し可能かどうか */
  canUndoPlay: () => boolean;

  // --- プレイログ編集 ---
  /** 完了済み打席の結果・打点・メモを修正し、スコアボードを再計算する */
  editAtBatLog: (logId: string, newResult: AtBatResult, newRbi: number, note?: string) => void;

  // --- 牽制 ---
  /** 牽制を記録する。結果に応じてランナー状態を更新 */
  recordPickoff: (targetBase: PickoffBase, result: PickoffResult) => void;
  /** 牽制セーフ時の進塁を確定する */
  confirmPickoffSafeAdvancement: (finalAdvancement: RunnerAdvancement) => void;
  /** 牽制セーフ進塁確認をキャンセルする */
  cancelPickoffSafe: () => void;

  // --- 盗塁 ---
  /** 盗塁成功を記録する。ランナーを次の塁へ進め StolenBaseLog を生成する */
  recordStolenBase: (fromBase: 'first' | 'second' | 'third', pitchContext?: StolenBasePitchContext) => void;
  /** 盗塁失敗（捕盗）を記録する。ランナーを消去しアウト数を増やし StolenBaseLog を生成する */
  recordCaughtStealing: (fromBase: 'first' | 'second' | 'third', pitchContext?: StolenBasePitchContext) => void;
  /** インプレー後ファウル落球時にストライク加算（打席継続） */
  addStrikeForFoulInPlay: () => void;

  // --- 振り逃げ（第3ストライク不捕球） ---
  /** 振り逃げ選択を「通常の三振」で確定する（アウト+1） */
  resolveUncaughtThirdAsStrikeout: () => void;
  /** 振り逃げ選択を「振り逃げ出塁」で確定し、進塁確認へ進む */
  resolveUncaughtThirdAsReached: () => void;
  /** 盗塁進塁確認後に走者位置と StolenBaseLog を確定する */
  confirmStolenBaseAdvancements: (finalAdvancements: RunnerAdvancement[], pitchContext?: StolenBasePitchContext) => void;

  // --- クイックスタート ---
  /** 仮選手でゲームを即時開始する */
  quickStartGame: (options?: { awayName?: string; homeName?: string; velocityEnabled?: boolean; pitchDistanceM?: number; fenceLeft?: number; fenceCenter?: number; fenceRight?: number }) => Promise<void>;
  /** 仮選手を実選手名・背番号・ポジションに紐付ける */
  updatePlayerMapping: (mappings: { playerId: string; newName: string; newNumber: string; newPosition?: string; newThrows?: string; newBats?: string; isPitcher?: boolean; side?: 'away' | 'home' }[]) => Promise<void>;
  /** 試合中にDH設定を変更する。ON時は投手プレースホルダーを作成し、OFF時は削除する */
  setGameDH: (side: 'away' | 'home', enabled: boolean) => void;
  /** 指定選手の打席方向(bats)をGameStateに反映する */
  updatePlayerBats: (playerId: string, bats: 'L' | 'R' | 'S') => void;

  // --- サインミス（選手個別） ---
  /**
   * 指定選手のサインミスを記録する。
   * 戦術 sign_play とは別の指標で、個人の戦術理解度の集計に用いる。
   */
  recordSignMiss: (input: {
    playerId: string;
    playerName: string;
    side: 'away' | 'home';
    context: SignMissContext;
    note?: string;
  }) => void;

  // --- 選手交代 ---
  /** 出場中の選手を控え選手に交代させる */
  substitutePlayer: (side: 'away' | 'home', playerOutId: string, playerInId: string) => void;
  /**
   * 新規選手をベンチに追加しつつ即時交代する。
   * 試合中に名前・番号・投打のみ入力して素早く登録できる「クイック交代」用。
   */
  addBenchAndSubstitute: (
    side: 'away' | 'home',
    playerOutId: string,
    newPlayerData: { name: string; number: number | null; bats: 'L' | 'R' | 'S'; throws: 'L' | 'R'; position?: string },
  ) => void;

  /** スタメン2選手の守備位置を入れ替える */
  swapStarterPositions: (side: 'away' | 'home', playerAId: string, playerBId: string) => void;
  /** スタメン選手の守備位置を直接変更する */
  changeStarterPosition: (side: 'away' | 'home', playerId: string, newPosition: Position) => void;
  /** 新規選手をベンチに追加する（即時交代なし） */
  addBenchPlayer: (side: 'away' | 'home', newPlayerData: NewPlayerData) => void;
  /**
   * ポジション変更・交代を一括コミットする（undoSnapshot は1回のみ）。
   * starterPositions: ポジション変更リスト
   * substitutions: スタメン←→ベンチ交代リスト
   */
  commitPositionChanges: (
    side: 'away' | 'home',
    starterPositions: { playerId: string; newPosition: Position }[],
    substitutions: { playerOutId: string; playerInId: string; targetPosition: Position }[],
    dhTermination?: { dhPlayerOutId: string; pitcherId: string },
  ) => boolean;

  /** 攻撃時選手交代（代打・代走）を一括コミットする */
  commitOffensiveSubstitutions: (
    side: 'away' | 'home',
    substitutions: {
      playerOutId: string;
      playerInId: string;
      type: 'pinch_hitter' | 'pinch_runner';
      baseIfRunner?: 'first' | 'second' | 'third';
    }[],
  ) => void;

  // --- 球速記録 ---
  /** 試合中に球速記録のON/OFFを切り替え、永続化する */
  setVelocityEnabled: (enabled: boolean) => Promise<void>;

  /** 進行中打席のメモを更新する */
  setCurrentAtBatNote: (note: string) => void;
}

/**
 * 3ストライク到達時に「三振」か「振り逃げ」かの選択を待っている状態。
 * 打席はまだ閉じていない（アウトも加算していない）。
 * pendingPickoffSafe と同じく永続化しない一時的な UI 状態なので GameState には置かない。
 */
type PendingUncaughtThird = { result: 'strikeout' | 'strikeout_looking' };

type GameStore = {
  game: GameState | null;
  pendingPickoffSafe: PendingPickoffSafe | null;
  pendingUncaughtThird: PendingUncaughtThird | null;
  /** 直前の端末保存結果が不明な間、古いstateによる追加保存を止める。 */
  persistBlocked: boolean;
} & GameActions;

// ============================================================
// 変換ユーティリティ
// ============================================================

function toPlayer(
  input: { name: string; number: string; position: string; bats: string; throws: string; isPlaceholder?: boolean; isUnassignedPitcher?: boolean; realPlayerId?: string },
  index: number,
): Player {
  return {
    id: uid(input.isUnassignedPitcher ? 'unassigned-pitcher' : 'p'),
    name: input.name,
    number: input.number.trim() ? parseInt(input.number, 10) : null,
    position: input.position as Player['position'],
    bats: (input.bats || 'R') as Player['bats'],
    throws: (input.throws || 'R') as Player['throws'],
    ...(input.isPlaceholder ? { isPlaceholder: true } : {}),
    ...(input.isUnassignedPitcher ? { isUnassignedPitcher: true } : {}),
    ...(input.realPlayerId ? { realPlayerId: input.realPlayerId } : {}),
  };
}

function toTeam(input: GameSetupInput['awayTeam']): Team {
  const starters = input.starters.map((s, i) => toPlayer(s, i));
  const bench = input.bench.map((b, i) => toPlayer(b, i + 100));
  const pitcher = input.pitcher ? toPlayer(input.pitcher, 999) : undefined;
  const unassignedPitchers = input.unassignedPitchers?.map((p, i) => toPlayer(p, i + 1000));
  return {
    name: input.name,
    roster: {
      starters: starters as Roster['starters'],
      bench,
      pitcher,
      ...(unassignedPitchers?.length ? { unassignedPitchers } : {}),
    },
  };
}

/**
 * 試合開始時の投手を解決する。
 *
 * 登録済み投手を優先し、「今は登録しない」経路だけは打順外の未割当投手を使用する。
 * どちらも無い状態で1番打者へフォールバックすると、打者が投手として記録されて
 * 以後の投球・分析データまで誤るため、不正な入力はここで拒否する。
 */
function initialPitcher(team: Team): Player {
  const pitcher = team.roster.pitcher
    ?? team.roster.starters.find((player) => player.position === 'P')
    ?? team.roster.unassignedPitchers?.[0];
  if (!pitcher) {
    throw new Error(`${team.name}: pitcher is not configured`);
  }
  return pitcher;
}

function createInitialGameState(input: GameSetupInput): GameState {
  const now = Date.now();
  const id = `game-${now}`;
  const away = toTeam(input.awayTeam);
  const home = toTeam(input.homeTeam);
  const awayPitcher = initialPitcher(away);
  const homePitcher = initialPitcher(home);

  const ballpark: BallparkInfo = {
    name: input.ballpark.name || '',
    fenceDistance: {
      left: parseFloat(input.ballpark.fenceLeft) || 0,
      center: parseFloat(input.ballpark.fenceCenter) || 0,
      right: parseFloat(input.ballpark.fenceRight) || 0,
    },
  };

  const initialAtBat: AtBatLog = {
    id: uid('ab'),
    inning: { number: 1, half: 'top' },
    batterId: away.roster.starters[0].id,
    pitcherId: homePitcher.id,
    pitches: [],
    result: null,
    rbiCount: 0,
    runnersBeforePlay: { first: null, second: null, third: null },
    runnersAfterPlay: { first: null, second: null, third: null },
    timestamp: now,
  };

  return {
    id,
    phase: 'live',
    createdAt: now,
    updatedAt: now,
    metadata: input.metadata,
    usageCounted: false,
    awayTeam: away,
    homeTeam: home,
    ballpark,
    inning: { number: 1, half: 'top' },
    count: { balls: 0, strikes: 0, outs: 0 },
    runners: { first: null, second: null, third: null },
    currentBatterIndex: { away: 0, home: 0 },
    currentPitcherId: {
      // DH制: pitcher フィールドを優先; 非DH: スタメンから P を探す
      away: awayPitcher.id,
      home: homePitcher.id,
    },
    scoreboard: {
      innings: [],
      awayTotal: 0,
      homeTotal: 0,
      awayHits: 0,
      homeHits: 0,
      awayErrors: 0,
      homeErrors: 0,
    },
    pitchLogs: [],
    atBatLogs: [],
    pickoffEvents: [],
    stolenBaseLogs: [],
    currentAtBat: initialAtBat,
    totalPitchCount: { away: 0, home: 0 },
    currentPitcherPitchCount: { away: 0, home: 0 },
    pendingAdvancement: null,
    substitutionLogs: [],
    signMissEvents: [],
    customPitchTypes: [],
    ...(input.isQuickStart ? { isQuickStart: true, hasUnmappedPlayers: true } : {}),
    ...(input.isScout ? { isScout: true } : {}),
    pitchDistanceM: input.pitchDistanceM ?? 18.44,
    velocityEnabled: input.velocityEnabled ?? false,
    isDH: {
      away: input.awayIsDH ?? false,
      home: input.homeIsDH ?? false,
    },
  };
}

// ============================================================
// カウント操作ヘルパー (immer draft 内で使用)
// ============================================================

/** カウントをリセット (次の打者用) */
function resetCount(game: GameState) {
  game.count.balls = 0;
  game.count.strikes = 0;
}

/** 打順を進める */
function advanceBatterIndex(game: GameState) {
  const side = offenseSide(game);
  game.currentBatterIndex[side] = (game.currentBatterIndex[side] + 1) % 9;
}

/** 現在の打席を確定してアーカイブし、新しい打席を開始 */
function finalizeAtBatAndStartNext(game: GameState, result: AtBatResult) {
  if (game.currentAtBat) {
    game.currentAtBat.result = result;
    game.currentAtBat.runnersAfterPlay = { ...game.runners };
    game.atBatLogs.push(game.currentAtBat);
  }

  // 3アウトならイニング交代
  // 打者は打席を完了しているので、次のイニングに備えて打順を1つ進める
  // ※ recordPickoff（牽制死）でイニング交代する場合は打席途中のため進めない（正しい動作）
  if (game.count.outs >= 3) {
    advanceBatterIndex(game);
    changeInning(game);
    return;
  }

  // 次の打者
  advanceBatterIndex(game);
  resetCount(game);
  startNewAtBat(game);
}

/** 新しい打席ログを開始 */
function startNewAtBat(game: GameState) {
  const batter = currentBatter(game);
  const pitcherId = currentPitcherId(game);
  game.currentAtBat = {
    id: uid('ab'),
    inning: { ...game.inning },
    batterId: batter.id,
    pitcherId,
    pitches: [],
    result: null,
    rbiCount: 0,
    runnersBeforePlay: {
      first: game.runners.first ? { ...game.runners.first } : null,
      second: game.runners.second ? { ...game.runners.second } : null,
      third: game.runners.third ? { ...game.runners.third } : null,
    },
    runnersAfterPlay: { first: null, second: null, third: null },
    timestamp: Date.now(),
  };
}

/** イニング交代 */
function changeInning(game: GameState) {
  // 現在イニングの得点を記録
  ensureInningScore(game);

  if (game.inning.half === 'top') {
    game.inning.half = 'bottom';
  } else {
    game.inning.half = 'top';
    game.inning.number += 1;
  }

  // カウント・ランナーをリセット
  game.count = { balls: 0, strikes: 0, outs: 0 };
  game.runners = { first: null, second: null, third: null };

  // 次の打者の打席開始
  startNewAtBat(game);
}

/** スコアボードのイニング得点エントリを確保 */
function ensureInningScore(game: GameState) {
  const inningNum = game.inning.number;
  let entry = game.scoreboard.innings.find((e) => e.inning === inningNum);
  if (!entry) {
    entry = { inning: inningNum, away: 0, home: 0 };
    game.scoreboard.innings.push(entry);
  }
}

/** 得点を加算 */
function addRun(game: GameState, count: number) {
  const side = offenseSide(game);
  ensureInningScore(game);
  const entry = game.scoreboard.innings.find((e) => e.inning === game.inning.number)!;
  entry[side] += count;
  if (side === 'away') {
    game.scoreboard.awayTotal += count;
  } else {
    game.scoreboard.homeTotal += count;
  }
}

/** ヒット数を加算 */
function addHit(game: GameState) {
  const side = offenseSide(game);
  if (side === 'away') game.scoreboard.awayHits += 1;
  else game.scoreboard.homeHits += 1;
}

/** エラー数を加算 */
function addError(game: GameState) {
  const side = defenseSide(game);
  if (side === 'away') game.scoreboard.awayErrors += 1;
  else game.scoreboard.homeErrors += 1;
}

// ============================================================
// スコアボード再計算 (プレイログ編集用)
// ============================================================

const HIT_RESULTS: AtBatResult[] = ['single', 'double', 'triple', 'home_run'];

function recalculateScoreboard(game: GameState) {
  let awayRuns = 0, homeRuns = 0;
  let awayHits = 0, homeHits = 0;
  let awayErrors = 0, homeErrors = 0;

  for (const log of game.atBatLogs) {
    if (!log.result) continue;
    const isTop = log.inning.half === 'top';

    // 打点(RBI) → 得点
    if (isTop) awayRuns += log.rbiCount;
    else homeRuns += log.rbiCount;

    // ヒット
    if (HIT_RESULTS.includes(log.result)) {
      if (isTop) awayHits++;
      else homeHits++;
    }

    // エラー (守備側に加算 = 攻撃の逆)
    if (log.result === 'error') {
      if (isTop) homeErrors++;
      else awayErrors++;
    }
  }

  game.scoreboard.awayTotal = awayRuns;
  game.scoreboard.homeTotal = homeRuns;
  game.scoreboard.awayHits = awayHits;
  game.scoreboard.homeHits = homeHits;
  game.scoreboard.awayErrors = awayErrors;
  game.scoreboard.homeErrors = homeErrors;
}

// ============================================================
// 進塁確認: デフォルト算出ヘルパー
// ============================================================

const BASE_ORDER: Record<string, number> = { first: 1, second: 2, third: 3, home: 4 };
const BASE_FROM_NUM: Record<number, BaseTarget> = { 1: 'first', 2: 'second', 3: 'third', 4: 'home' };

/** 打席結果に基づいてデフォルトの進塁先を算出する */
function computeDefaultAdvancements(game: GameState, result: AtBatResult): RunnerAdvancement[] {
  const batter = currentBatter(game);
  const advancements: RunnerAdvancement[] = [];

  // ランナーを3塁→2塁→1塁の順で処理 (遠い塁から)
  const runners: { base: 'third' | 'second' | 'first'; player: Player }[] = [];
  if (game.runners.third) runners.push({ base: 'third', player: game.runners.third });
  if (game.runners.second) runners.push({ base: 'second', player: game.runners.second });
  if (game.runners.first) runners.push({ base: 'first', player: game.runners.first });

  // === 併殺打 (DP) 専用ロジック ===
  if (result === 'double_play') {
    // フォース判定: 打者→1塁は常にフォース起点
    const dpForced: Record<string, boolean> = { first: false, second: false, third: false };
    if (game.runners.first) {
      dpForced['first'] = true;
      if (game.runners.second) dpForced['second'] = true;
    }

    // 1塁側から最初のフォースランナー1人をアウト
    let forceOutDone = false;
    const runnersAsc = [...runners].reverse(); // 1塁→2塁→3塁の順
    for (const r of runnersAsc) {
      const curNum = BASE_ORDER[r.base];
      if (!forceOutDone && dpForced[r.base]) {
        advancements.push({
          runnerId: r.player.id, playerName: r.player.name,
          fromBase: r.base, targetBase: 'out',
          outcome: 'out_force', action: 'batted_ball',
          isForced: true, minBase: 'out',
        });
        forceOutDone = true;
      } else {
        advancements.push({
          runnerId: r.player.id, playerName: r.player.name,
          fromBase: r.base, targetBase: BASE_FROM_NUM[curNum],
          outcome: 'safe', action: 'batted_ball',
          isForced: false, minBase: BASE_FROM_NUM[curNum],
        });
      }
    }

    // 打者: アウト
    advancements.push({
      runnerId: batter.id, playerName: batter.name,
      fromBase: 'batter', targetBase: 'out',
      outcome: 'out_force', action: 'batted_ball',
      isForced: true, minBase: 'out',
    });

    return advancements;
  }

  // === ホームラン（表示は元の塁、進塁先は記録者がドラッグで指定） ===
  if (result === 'home_run') {
    for (const r of runners) {
      const curNum = BASE_ORDER[r.base];
      advancements.push({
        runnerId: r.player.id, playerName: r.player.name,
        fromBase: r.base, targetBase: BASE_FROM_NUM[curNum],
        outcome: 'safe', action: 'batted_ball',
        isForced: false, minBase: BASE_FROM_NUM[curNum],
      });
    }
    advancements.push({
      runnerId: batter.id, playerName: batter.name,
      fromBase: 'batter', targetBase: 'first',
      outcome: 'safe', action: 'batted_ball',
      isForced: false, minBase: 'first',
    });
    return advancements;
  }

  // === アウト結果 (ランナー有: タッチアップ等の記録用) ===
  if (['groundout', 'flyout', 'lineout', 'pop_out'].includes(result)) {
    const isFly = result !== 'groundout';
    // ランナー: 現在塁に留まるのがデフォルト（ユーザーが変更可能）
    for (const r of runners) {
      const curNum = BASE_ORDER[r.base];
      advancements.push({
        runnerId: r.player.id, playerName: r.player.name,
        fromBase: r.base, targetBase: BASE_FROM_NUM[curNum],
        outcome: 'safe', action: 'batted_ball',
        isForced: false, minBase: BASE_FROM_NUM[curNum],
      });
    }
    // 打者: アウト
    advancements.push({
      runnerId: batter.id, playerName: batter.name,
      fromBase: 'batter', targetBase: 'out',
      outcome: isFly ? 'out_tag' : 'out_force',
      action: 'batted_ball', isForced: true, minBase: 'out',
    });
    return advancements;
  }

  // === トリプルプレイ ===
  if (result === 'triple_play') {
    for (const r of runners) {
      advancements.push({
        runnerId: r.player.id, playerName: r.player.name,
        fromBase: r.base, targetBase: 'out',
        outcome: 'out_tag', action: 'batted_ball',
        isForced: false, minBase: 'out',
      });
    }
    advancements.push({
      runnerId: batter.id, playerName: batter.name,
      fromBase: 'batter', targetBase: 'out',
      outcome: 'out_force', action: 'batted_ball',
      isForced: true, minBase: 'out',
    });
    return advancements;
  }

  // === ヒット・エラー・その他: 全員を元の塁に配置（記録者がドラッグで進塁先を指定） ===
  for (const r of runners) {
    const curNum = BASE_ORDER[r.base];
    advancements.push({
      runnerId: r.player.id,
      playerName: r.player.name,
      fromBase: r.base,
      targetBase: BASE_FROM_NUM[curNum],
      outcome: 'safe',
      action: 'batted_ball',
      isForced: false,
      minBase: BASE_FROM_NUM[curNum],
    });
  }

  if (result === 'sacrifice_fly') {
    advancements.push({
      runnerId: batter.id,
      playerName: batter.name,
      fromBase: 'batter',
      targetBase: 'out',
      outcome: 'out_tag',
      action: 'batted_ball',
      isForced: false,
      minBase: 'out',
    });
  } else if (result === 'sacrifice_bunt') {
    advancements.push({
      runnerId: batter.id,
      playerName: batter.name,
      fromBase: 'batter',
      targetBase: 'out',
      outcome: 'out_tag',
      action: 'batted_ball',
      isForced: false,
      minBase: 'out',
    });
  } else {
    const batterTarget =
      result === 'double' ? 'second' as const :
      result === 'triple' ? 'third' as const :
      'first' as const;
    advancements.push({
      runnerId: batter.id,
      playerName: batter.name,
      fromBase: 'batter',
      targetBase: batterTarget,
      outcome: 'safe',
      action: 'batted_ball',
      isForced: false,
      minBase: batterTarget,
    });
  }

  return capBatterTargetBase(advancements);
}

/** ランナーBeforePlay or 打者から Player を検索 */
function findPlayerById(game: GameState, playerId: string): Player | null {
  const rb = game.currentAtBat?.runnersBeforePlay;
  if (rb?.first?.id === playerId) return rb.first;
  if (rb?.second?.id === playerId) return rb.second;
  if (rb?.third?.id === playerId) return rb.third;
  const batter = currentBatter(game);
  if (batter.id === playerId) return batter;
  return null;
}

/** applyAtBatResultToRunners がこの結果で加えるアウト数（進塁確認省略判定用・同期必須） */
function outsAddedPreviewForResolve(result: AtBatResult): number {
  switch (result) {
    case 'strikeout':
    case 'strikeout_looking':
      return 1;
    case 'groundout':
    case 'flyout':
    case 'lineout':
    case 'pop_out':
      return 1;
    case 'double_play':
      return 2;
    case 'triple_play':
      return 3;
    case 'sacrifice_bunt':
    case 'sacrifice_fly':
      return 1;
    default:
      return 0;
  }
}

/**
 * 進塁確認なしでイニング終了まで一気に確定してよいか。
 * 三塁走者＋上空飛／犠打系は得点・タッチアップ入力が進塁画面に依存するため省略しない。
 */
function shouldResolveInPlayWithoutAdvancement(game: GameState, result: AtBatResult): boolean {
  const added = outsAddedPreviewForResolve(result);
  if (added <= 0 || game.count.outs + added < 3) return false;
  if (game.runners.third) {
    if (result === 'flyout' || result === 'lineout' || result === 'pop_out') return false;
    if (result === 'sacrifice_bunt' || result === 'sacrifice_fly') return false;
  }
  return true;
}

/**
 * 振り逃げ（第3ストライク不捕球）が成立しうる状況か。
 * 2アウト時は一塁が埋まっていても成立、2アウト未満は一塁が空いている時のみ。
 * ここが false の三振は従来通り即アウト確定し、記録のテンポを変えない。
 */
function canReachOnUncaughtThird(game: GameState): boolean {
  return game.count.outs >= 2 || game.runners.first === null;
}

// ============================================================
// 打席結果 → ランナー進塁ロジック (自動解決用、従来通り)
// ============================================================

/** 打席結果に基づくデフォルトのランナー処理 */
function applyAtBatResultToRunners(game: GameState, result: AtBatResult, rbiCount: number) {
  const batter = currentBatter(game);

  switch (result) {
    // --- アウト系 ---
    case 'strikeout':
    case 'strikeout_looking':
      game.count.outs += 1;
      break;
    case 'groundout':
    case 'flyout':
    case 'lineout':
    case 'pop_out':
      game.count.outs += 1;
      break;
    case 'double_play':
      game.count.outs += 2;
      break;
    case 'triple_play':
      game.count.outs += 3;
      break;
    case 'sacrifice_bunt':
    case 'sacrifice_fly':
      game.count.outs += 1;
      break;

    // --- 出塁系 ---
    case 'walk':
    case 'hit_by_pitch': {
      // 押し出しチェック: 満塁なら得点
      if (game.runners.first && game.runners.second && game.runners.third) {
        addRun(game, 1);
        game.runners.third = game.runners.second;
        game.runners.second = game.runners.first;
      } else if (game.runners.first && game.runners.second) {
        game.runners.third = game.runners.second;
        game.runners.second = game.runners.first;
      } else if (game.runners.first) {
        game.runners.second = game.runners.first;
      }
      game.runners.first = batter;
      break;
    }
    case 'single': {
      addHit(game);
      // 三塁走者 → ホーム
      if (game.runners.third) { addRun(game, 1); game.runners.third = null; }
      // 二塁走者 → 三塁 (or ホーム - 簡易: 三塁止まり)
      if (game.runners.second) { game.runners.third = game.runners.second; game.runners.second = null; }
      // 一塁走者 → 二塁
      if (game.runners.first) { game.runners.second = game.runners.first; }
      game.runners.first = batter;
      break;
    }
    case 'double': {
      addHit(game);
      if (game.runners.third) { addRun(game, 1); game.runners.third = null; }
      if (game.runners.second) { addRun(game, 1); game.runners.second = null; }
      if (game.runners.first) { game.runners.third = game.runners.first; game.runners.first = null; }
      game.runners.second = batter;
      break;
    }
    case 'triple': {
      addHit(game);
      let runs = 0;
      if (game.runners.third) { runs++; game.runners.third = null; }
      if (game.runners.second) { runs++; game.runners.second = null; }
      if (game.runners.first) { runs++; game.runners.first = null; }
      if (runs > 0) addRun(game, runs);
      game.runners.third = batter;
      break;
    }
    case 'home_run': {
      addHit(game);
      let runs = 1; // 打者自身
      if (game.runners.first) { runs++; game.runners.first = null; }
      if (game.runners.second) { runs++; game.runners.second = null; }
      if (game.runners.third) { runs++; game.runners.third = null; }
      addRun(game, runs);
      break;
    }
    case 'fielders_choice':
    case 'error':
      // 進塁は resolveAtBat 側で advanceRunners を別途呼ぶ想定
      if (result === 'error') addError(game);
      game.runners.first = batter;
      break;
  }

  // RBIをcurrentAtBatに記録
  if (game.currentAtBat) {
    game.currentAtBat.rbiCount = rbiCount;
  }
}

// ============================================================
// Zustand ストア
// ============================================================

export const useGameStore = create<GameStore>()(
  immer((set, get) => ({
    game: null,
    pendingPickoffSafe: null,
    pendingUncaughtThird: null,
    persistBlocked: false,

    // --- ライフサイクル ---
    initGame: async (input) => {
      const gameState = createInitialGameState(input);
      gameState.undoStack = [];
      await db.games.put(gameState);
      set({ game: gameState, persistBlocked: false });
    },

    loadGame: async (id) => {
      const gameState = await db.games.get(id);
      if (gameState) {
        // 旧データ互換: 新規追加フィールドのデフォルト値を保証
        if (!gameState.signMissEvents) gameState.signMissEvents = [];
        // 後方互換: isDH: boolean (旧形式) → { away, home } (新形式) に変換
        if (typeof gameState.isDH === 'boolean') {
          const legacy = gameState.isDH as unknown as boolean;
          (gameState as any).isDH = { away: legacy, home: legacy };
        }
        // 開始時に枠を消費していた旧データは二重カウントを避けるため消費済み扱い
        if (gameState.usageCounted == null) {
          gameState.usageCounted = true;
        }
        gameState.undoStack = [];
        // 三振/振り逃げの選択待ちは永続化されないため、状態から復元する。
        // 打席が開いたまま 3ストライクに達しているのは選択待ちの場合だけ。
        const openAtBat = gameState.currentAtBat;
        const lastPitch = openAtBat?.pitches[openAtBat.pitches.length - 1];
        const pendingUncaughtThird =
          openAtBat && openAtBat.result === null
          && gameState.count.strikes >= 3 && !gameState.pendingAdvancement
            ? { result: (lastPitch?.result === 'strike_called' ? 'strikeout_looking' : 'strikeout') as 'strikeout' | 'strikeout_looking' }
            : null;
        set({ game: gameState, pendingUncaughtThird, persistBlocked: false });
      }
    },

    setPhase: (phase) => {
      set((state) => {
        if (state.game) {
          state.game.phase = phase;
          state.game.updatedAt = Date.now();
        }
      });
    },

    persist: async () => {
      if (get().persistBlocked) {
        if (__DEV__) console.warn('[persist] blocked: unknown_local_state');
        return;
      }
      const game = get().game;
      if (game) {
        const { undoStack: _undo, ...toSave } = game;
        await db.games.put(toSave as GameState);
      }
    },

    recordGameUsageOnce: async () => {
      const game = get().game;
      if (!game || game.usageCounted) return;
      if (get().persistBlocked) return;
      await incrementGameUsage();
      set((state) => {
        if (state.game) {
          state.game.usageCounted = true;
          state.game.updatedAt = Date.now();
        }
      });
      const updated = get().game;
      if (updated) {
        const { undoStack: _undo, ...toSave } = updated;
        await db.games.put(toSave as GameState);
      }
    },

    clearActiveGame: () => {
      set({
        game: null,
        pendingPickoffSafe: null,
        pendingUncaughtThird: null,
        persistBlocked: false,
      });
    },

    reassignActivePitcherRecords: async (input) => {
      const before = get().game;
      if (!before) throw new Error('進行中の試合がありません。');
      if (get().persistBlocked) {
        return { kind: 'unknown_local_state', error: new Error('端末の保存状態を確認できません。') };
      }
      const next = reassignPitcherRecords(before, input).game;
      const local = await safeLocalGamePut(next, input.logId);
      if (local.kind === 'applied') {
        set({ game: local.game, persistBlocked: false });
      } else if (local.kind === 'unknown_local_state') {
        set({ persistBlocked: true });
      }
      return local;
    },

    startUnassignedPitcherStint: async (side) => {
      const before = get().game;
      if (!before || get().persistBlocked) return 'blocked';

      const sequence = nextUnassignedPitcherNumber(before, side);
      const pitcher = toPlayer(makeUnassignedPitcherInput(sequence), 1000 + sequence);
      const pendingPickoffSafe = get().pendingPickoffSafe;
      const next = produce(before, (g) => {
        const team = side === 'away' ? g.awayTeam : g.homeTeam;
        const previousPitcherId = g.currentPitcherId[side];

        pushUndoSnapshot(g, pendingPickoffSafe);
        team.roster.unassignedPitchers = [
          ...(team.roster.unassignedPitchers ?? []),
          pitcher,
        ];
        g.currentPitcherId[side] = pitcher.id;
        if (!g.currentPitcherPitchCount) g.currentPitcherPitchCount = { away: 0, home: 0 };
        g.currentPitcherPitchCount[side] = 0;
        if (g.currentAtBat?.pitcherId === previousPitcherId) {
          // 交代前に記録済みの各PitchLogは旧IDのまま保持し、進行中打席の代表投手だけ切り替える。
          g.currentAtBat.pitcherId = pitcher.id;
        }

        // 投球参照を一度も持たなかった旧区間は共有を永久に妨げないよう除去する。
        team.roster.unassignedPitchers = team.roster.unassignedPitchers.filter(
          (candidate) =>
            candidate.id === pitcher.id
            || hasPitcherAttributionReference(g, side, candidate.id),
        );
        g.hasUnmappedPlayers = true;
        g.updatedAt = Date.now();
      });

      const { undoStack: _undo, ...toSave } = next;
      try {
        await db.games.put(toSave as GameState);
        set({ game: next });
        return 'started';
      } catch {
        try {
          const reread = await db.games.get(next.id);
          const savedPitcher = reread
            ? findPitcherById(side === 'away' ? reread.awayTeam : reread.homeTeam, pitcher.id)
            : undefined;
          if (reread?.currentPitcherId[side] === pitcher.id && savedPitcher?.isUnassignedPitcher) {
            // 書き込み成功後に例外だけ返ったケース。生成済みのnextを正として継続する。
            set({ game: next, persistBlocked: false });
            return 'started';
          }
          return 'save_failed';
        } catch {
          set({ persistBlocked: true });
          return 'unknown_local_state';
        }
      }
    },

    setVelocityEnabled: async (enabled) => {
      set((state) => {
        if (!state.game) return;
        state.game.velocityEnabled = enabled;
        state.game.updatedAt = Date.now();
      });
      await get().persist();
    },

    setCurrentAtBatNote: (note) => {
      set((state) => {
        const g = state.game;
        if (!g?.currentAtBat) return;
        g.currentAtBat.note = note.trim() || undefined;
        g.updatedAt = Date.now();
      });
    },

    // --- 投球記録 ---
    recordPitch: (pitchType, zone, result, velocity, pitchX, pitchY, pitchExtra) => {
      set((state) => {
        const g = state.game;
        if (!g) return;
        if (g.phase === 'paused') g.phase = 'live';
        else if (g.phase !== 'live') return;

        pushUndoSnapshot(g, state.pendingPickoffSafe);

        const countBefore: Count = { ...g.count };
        const side = offenseSide(g);
        const defSide = defenseSide(g);

        // 通算球数 +1
        g.totalPitchCount[defSide] += 1;
        if (!g.currentPitcherPitchCount) g.currentPitcherPitchCount = { away: 0, home: 0 };
        g.currentPitcherPitchCount[defSide] += 1;

        // カウント更新
        let atBatEnded = false;
        let autoResult: AtBatResult | null = null;

        switch (result) {
          case 'ball':
            g.count.balls += 1;
            if (g.count.balls >= 4) {
              autoResult = 'walk';
              atBatEnded = true;
            }
            break;
          case 'strike_called':
          case 'strike_swinging':
            g.count.strikes += 1;
            if (g.count.strikes >= 3) {
              autoResult = result === 'strike_called' ? 'strikeout_looking' : 'strikeout';
              atBatEnded = true;
            }
            break;
          case 'foul':
          case 'foul_tip':
            if (g.count.strikes < 2) {
              g.count.strikes += 1;
            }
            // 2ストライク後のファウルはカウント変わらず
            break;
          case 'hit_by_pitch':
            autoResult = 'hit_by_pitch';
            atBatEnded = true;
            break;
          case 'in_play':
            // resolveAtBat で別途結果を確定する
            break;
        }

        const countAfter: Count = { ...g.count };

        // PitchLog を作成
        const catcherId = currentCatcherId(g);
        const pitchLog: PitchLog = {
          id: uid('pitch'),
          inning: { ...g.inning },
          pitchNumber: g.currentAtBat ? g.currentAtBat.pitches.length + 1 : 1,
          totalPitchNumber: g.totalPitchCount[defSide],
          pitcherId: currentPitcherId(g),
          batterId: currentBatter(g).id,
          ...(catcherId !== undefined ? { catcherId } : {}),
          pitchType,
          zone,
          result,
          ...(pitchExtra?.battedBall ? { battedBall: pitchExtra.battedBall } : {}),
          countBefore,
          countAfter,
          timestamp: Date.now(),
          // undefined を含めると Firestore がエラーになるため、値がある場合のみ追加
          ...(pitchX !== undefined ? { pitchX } : {}),
          ...(pitchY !== undefined ? { pitchY } : {}),
          ...(velocity !== undefined ? { velocity } : {}),
          ...(pitchExtra?.buntAttempt ? { buntAttempt: true } : {}),
          ...(pitchExtra?.buntOutcome ? { buntOutcome: pitchExtra.buntOutcome } : {}),
        };

        g.pitchLogs.push(pitchLog);
        if (g.currentAtBat) {
          g.currentAtBat.pitches.push(pitchLog);
        }

        // ファウルでプレーが無効になった盗塁企図は、走者を動かさず分析用ログだけ残す。
        // 同じ投球のUndoスナップショットに含めるため recordPitch 内で生成する。
        const noPlayBases = [...new Set(pitchExtra?.stolenBaseNoPlayFromBases ?? [])];
        if (!g.stolenBaseLogs) g.stolenBaseLogs = [];
        for (const fromBase of noPlayBases) {
          const runner = g.runners[fromBase];
          if (!runner) continue;
          const toBase: StolenBaseLog['toBase'] = fromBase === 'first' ? 'second'
            : fromBase === 'second' ? 'third'
            : 'home';
          g.stolenBaseLogs.push({
            id: uid('sb-no-play'),
            inning: { ...g.inning },
            runnerId: runner.id,
            runnerName: runner.name,
            fromBase,
            toBase,
            result: 'no_play',
            noPlayReason: 'foul',
            pitchType,
            pitchZone: zone,
            ...(velocity !== undefined ? { pitchVelocity: velocity } : {}),
            countBefore,
            pitchResult: 'foul',
            outsAtTime: countBefore.outs,
            timestamp: Date.now(),
            ...(pitchExtra?.stolenBaseSignPlay
              ? { signPlay: pitchExtra.stolenBaseSignPlay }
              : {}),
          });
        }

        // 自動確定する打席結果がある場合
        if (atBatEnded && autoResult) {
          if (
            (autoResult === 'strikeout' || autoResult === 'strikeout_looking') &&
            canReachOnUncaughtThird(g)
          ) {
            // 振り逃げの可能性がある三振は打席を閉じず、三振/振り逃げの選択を待つ。
            // ここでアウトを加算しないため、振り逃げ出塁時に outs は増えない。
            state.pendingUncaughtThird = { result: autoResult };
          } else {
            applyAtBatResultToRunners(g, autoResult, autoResult === 'walk' || autoResult === 'hit_by_pitch' ? 0 : 0);
            finalizeAtBatAndStartNext(g, autoResult);
          }
        }

        g.updatedAt = Date.now();
      });
    },

    // --- インプレイ結果の確定 ---
    resolveAtBat: (result, battedBall, rbiCount = 0, atBatExtra) => {
      const g = get().game;
      if (!g) return;

      // ホームランは打者+ランナー全員が生還するため、rbiCountを自動計算
      if (result === 'home_run') {
        const r = g.runners;
        rbiCount = 1 + (r.first ? 1 : 0) + (r.second ? 1 : 0) + (r.third ? 1 : 0);
      }

      // ランナーがいる、または打者の到達塁確認が必要な場合は進塁確認モードへ
      const hasRunners = g.runners.first || g.runners.second || g.runners.third;
      const needsBatterAdvancement = BATTER_RESULTS_NEEDING_ADVANCEMENT.includes(result);
      if ((hasRunners || needsBatterAdvancement) && result !== 'home_run' && !shouldResolveInPlayWithoutAdvancement(g, result)) {
        get().beginAdvancementConfirmation(result, battedBall, undefined, atBatExtra);
        return;
      }

      // ランナーなし、または3アウトで進塁確認を省略 → 自動解決
      set((state) => {
        const gs = state.game;
        if (!gs || gs.phase !== 'live') return;

        pushUndoSnapshot(gs, state.pendingPickoffSafe);

        if (battedBall && gs.currentAtBat) {
          gs.currentAtBat.battedBall = battedBall;
        }
        if (atBatExtra?.buntType && gs.currentAtBat) {
          gs.currentAtBat.buntType = atBatExtra.buntType;
        }
        if (atBatExtra?.signPlay && gs.currentAtBat) {
          gs.currentAtBat.signPlay = atBatExtra.signPlay;
        }

        applyAtBatResultToRunners(gs, result, rbiCount);
        finalizeAtBatAndStartNext(gs, result);
        gs.updatedAt = Date.now();
      });
    },

    // --- ランナー手動操作 ---
    advanceRunners: (scoring, advances) => {
      set((state) => {
        const g = state.game;
        if (!g) return;

        // 得点処理 (ホームイン)
        for (const runnerId of scoring) {
          // ランナーを塁上から除去
          if (g.runners.first?.id === runnerId) g.runners.first = null;
          if (g.runners.second?.id === runnerId) g.runners.second = null;
          if (g.runners.third?.id === runnerId) g.runners.third = null;
          addRun(g, 1);
        }

        // 進塁処理
        for (const adv of advances) {
          const runner = g.runners[adv.from];
          if (!runner) continue;
          g.runners[adv.from] = null;
          if (adv.to === 'home') {
            addRun(g, 1);
          } else {
            g.runners[adv.to] = runner;
          }
        }

        g.updatedAt = Date.now();
      });
    },

    // --- 進塁確認フロー ---
    beginAdvancementConfirmation: (result, battedBall, fielding, atBatExtra) => {
      set((state) => {
        const g = state.game;
        if (!g) return;
        if (g.phase === 'paused') g.phase = 'live';
        else if (g.phase !== 'live') return;

        if (battedBall && g.currentAtBat) {
          g.currentAtBat.battedBall = battedBall;
        }
        if (fielding && g.currentAtBat) {
          g.currentAtBat.fielding = fielding;
        }
        if (atBatExtra?.buntType && g.currentAtBat) {
          g.currentAtBat.buntType = atBatExtra.buntType;
        }
        if (atBatExtra?.signPlay && g.currentAtBat) {
          g.currentAtBat.signPlay = atBatExtra.signPlay;
        }

        // ヒット数・エラー数の先行加算
        if (['single', 'double', 'triple', 'home_run'].includes(result)) {
          addHit(g);
        }
        if (result === 'error') {
          addError(g);
        }

        const advancements = computeDefaultAdvancements(g, result);

        g.pendingAdvancement = {
          result,
          battedBall,
          fielding,
          advancements,
          atBatExtra,
        };
        g.updatedAt = Date.now();
      });
    },

    confirmAdvancement: (finalAdvancements, atBatExtra) => {
      set((state) => {
        const g = state.game;
        if (!g || !g.pendingAdvancement) return;

        pushUndoSnapshot(g, state.pendingPickoffSafe);

        const { result, atBatExtra: pendingExtra } = g.pendingAdvancement;
        const mergedExtra = { ...pendingExtra, ...atBatExtra };
        if (mergedExtra.buntType && g.currentAtBat) {
          g.currentAtBat.buntType = mergedExtra.buntType;
        }
        if (mergedExtra.signPlay && g.currentAtBat) {
          g.currentAtBat.signPlay = mergedExtra.signPlay;
        }
        if (mergedExtra.batterAdvancementReasons?.length && g.currentAtBat) {
          g.currentAtBat.batterAdvancementReasons = mergedExtra.batterAdvancementReasons;
        }

        // ランナーをクリアして再配置
        g.runners = { first: null, second: null, third: null };

        let runsScored = 0;
        let outsAdded = 0;
        let hasForceOut = false;

        for (const adv of finalAdvancements) {
          if (adv.targetBase === 'home' && adv.outcome === 'safe') {
            runsScored++;
          } else if (adv.targetBase === 'out' || adv.outcome === 'out_tag' || adv.outcome === 'out_force') {
            outsAdded++;
            if (adv.outcome === 'out_force') hasForceOut = true;
          } else if (adv.targetBase !== 'home') {
            // 塁上に配置
            const player = findPlayerById(g, adv.runnerId);
            if (player) {
              g.runners[adv.targetBase] = player;
            }
          }
        }

        // アウト加算
        g.count.outs += outsAdded;

        // 3アウト目がフォースアウト → 得点無効
        const totalOuts = g.count.outs;
        if (totalOuts >= 3 && hasForceOut) {
          runsScored = 0;
        }

        // 得点加算
        if (runsScored > 0) {
          addRun(g, runsScored);
        }

        // RBI計算 (エラーは0)
        const rbi = result === 'error' ? 0 : runsScored;
        if (g.currentAtBat) {
          g.currentAtBat.rbiCount = rbi;
          // 進塁詳細を打席ログに保存（outDetail含む）
          g.currentAtBat.runnerAdvancements = finalAdvancements;
          // 打者行のアウト種別を outType として保存
          const batterAdv = finalAdvancements.find(
            (a) => a.fromBase === 'batter' && (a.outcome === 'out_force' || a.outcome === 'out_tag'),
          );
          if (batterAdv) {
            g.currentAtBat.outType = batterAdv.outcome === 'out_force' ? 'force' : 'tag';
          }
          // 三振が進塁確認に来る経路は振り逃げ分岐のみなので、打者がセーフなら振り逃げ出塁
          if (
            (result === 'strikeout' || result === 'strikeout_looking') &&
            finalAdvancements.some((a) => a.fromBase === 'batter' && a.outcome === 'safe')
          ) {
            g.currentAtBat.reachedOnUncaughtThird = true;
          }
        }

        // ペンディングをクリア
        g.pendingAdvancement = null;

        // 打席完了（犠飛・併殺打の自動判定）
        let effectiveResult = result;
        if (result === 'flyout') {
          const hasRunnerScored = finalAdvancements.some(
            (a) => a.fromBase !== 'batter' && a.targetBase === 'home' && a.outcome === 'safe',
          );
          if (hasRunnerScored) effectiveResult = 'sacrifice_fly';
        }
        if (result === 'groundout' && outsAdded >= 2) {
          effectiveResult = 'double_play';
        }
        finalizeAtBatAndStartNext(g, effectiveResult);
        g.updatedAt = Date.now();
      });
    },

    cancelAdvancement: () => {
      set((state) => {
        const g = state.game;
        if (!g || !g.pendingAdvancement) return;

        const result = g.pendingAdvancement.result;

        // 振り逃げの進塁確認をキャンセルした場合は通常の三振として確定する。
        // ここで打席を閉じないと、3ストライクのまま結果を入力する導線がなく宙ぶらりんになる。
        if (result === 'strikeout' || result === 'strikeout_looking') {
          g.pendingAdvancement = null;
          applyAtBatResultToRunners(g, result, 0);
          finalizeAtBatAndStartNext(g, result);
          g.updatedAt = Date.now();
          return;
        }

        // 先行加算したヒット/エラーを取り消し
        if (['single', 'double', 'triple', 'home_run'].includes(result)) {
          const side = offenseSide(g);
          if (side === 'away') g.scoreboard.awayHits -= 1;
          else g.scoreboard.homeHits -= 1;
        }
        if (result === 'error') {
          const side = defenseSide(g);
          if (side === 'away') g.scoreboard.awayErrors -= 1;
          else g.scoreboard.homeErrors -= 1;
        }

        g.pendingAdvancement = null;
        g.updatedAt = Date.now();
      });
    },

    revertToPreAdvancement: () => {
      get().undoLastPlay();
    },

    confirmPickoffSafeAdvancement: (finalAdvancement) => {
      set((state) => {
        const g = state.game;
        if (!g) return;
        if (g.phase === 'paused') g.phase = 'live';
        else if (g.phase !== 'live') return;

        const { fromBase, targetBase, outcome } = finalAdvancement;
        const runner = g.runners[fromBase as 'first' | 'second' | 'third'];
        if (!runner) return;

        pushUndoSnapshot(g, state.pendingPickoffSafe);

        g.runners[fromBase as 'first' | 'second' | 'third'] = null;
        if (targetBase === 'home' && outcome === 'safe') {
          addRun(g, 1);
        } else if (outcome === 'out_tag' || outcome === 'out_force' || targetBase === 'out') {
          g.count.outs += 1;
          if (g.count.outs >= 3) changeInning(g);
        } else {
          g.runners[targetBase as 'first' | 'second' | 'third'] = runner;
        }
        state.pendingPickoffSafe = null;
        g.updatedAt = Date.now();
      });
    },

    cancelPickoffSafe: () => {
      set((state) => { state.pendingPickoffSafe = null; });
    },

    // --- カスタム球種 ---
    addCustomPitchType: (name) => {
      set((state) => {
        const g = state.game;
        if (!g) return;
        const trimmed = name.trim();
        if (!trimmed) return;
        if (g.customPitchTypes.includes(trimmed)) return;
        g.customPitchTypes.push(trimmed);
        g.updatedAt = Date.now();
      });
    },

    // --- アンドゥ ---
    undoLastPlay: () => {
      set((state) => {
        const g = state.game;
        if (!g?.undoStack?.length) return;
        const snap = g.undoStack.pop()!;
        state.pendingPickoffSafe = restoreUndoSnapshot(g, snap);
        // 三振/振り逃げの選択待ちは巻き戻し対象の外なので必ず解除する
        state.pendingUncaughtThird = null;
        g.updatedAt = Date.now();
      });
    },

    undoLastPitch: () => {
      get().undoLastPlay();
    },

    canUndoPlay: () => canUndoPlayState(get().game),

    // --- プレイログ編集 ---
    editAtBatLog: (logId, newResult, newRbi, note) => {
      set((state) => {
        const g = state.game;
        if (!g) return;
        const log = g.atBatLogs.find((l) => l.id === logId);
        if (!log) return;

        log.result = newResult;
        log.rbiCount = newRbi;
        // note が渡された場合のみ更新（undefined のときは既存値を維持）
        if (note !== undefined) log.note = note;

        // スコアボード全体を再計算
        recalculateScoreboard(g);
        g.updatedAt = Date.now();
      });
    },

    // --- 牽制 ---
    recordPickoff: (targetBase, result) => {
      set((state) => {
        const g = state.game;
        if (!g) return;
        if (g.phase === 'paused') g.phase = 'live';
        else if (g.phase !== 'live') return;

        const runner = g.runners[targetBase];
        if (!runner) return;

        pushUndoSnapshot(g, state.pendingPickoffSafe);

        const event: PickoffEvent = {
          id: uid('po'),
          inning: { ...g.inning },
          pitcherId: currentPitcherId(g),
          runnerId: runner.id,
          targetBase,
          result,
          timestamp: Date.now(),
        };
        g.pickoffEvents.push(event);

        switch (result) {
          case 'out':
            // ランナーアウト
            g.runners[targetBase] = null;
            g.count.outs += 1;
            if (g.count.outs >= 3) {
              changeInning(g);
            }
            break;
          case 'balk':
            // ボーク: 全ランナー1塁進塁
            if (g.runners.third) {
              addRun(g, 1);
              g.runners.third = null;
            }
            if (g.runners.second) {
              g.runners.third = g.runners.second;
              g.runners.second = null;
            }
            if (g.runners.first) {
              g.runners.second = g.runners.first;
              g.runners.first = null;
            }
            break;
          case 'error':
            // エラー: 対象ランナー1塁進塁
            {
              const nextBase = targetBase === 'first' ? 'second'
                : targetBase === 'second' ? 'third'
                : null; // 3塁からはホーム
              if (nextBase && !g.runners[nextBase]) {
                g.runners[nextBase] = runner;
                g.runners[targetBase] = null;
              } else if (targetBase === 'third') {
                // 3塁走者 → ホーム
                addRun(g, 1);
                g.runners.third = null;
              }
              addError(g);
            }
            break;
          case 'safe':
            // セーフ: 進塁確認待ちに設定
            state.pendingPickoffSafe = { fromBase: targetBase, runnerId: runner.id, playerName: runner.name };
            break;
        }

        g.updatedAt = Date.now();
      });
    },

    // --- 盗塁 ---
    recordStolenBase: (fromBase, pitchContext) => {
      set((state) => {
        const g = state.game;
        if (!g) return;
        if (g.phase === 'paused') g.phase = 'live';
        else if (g.phase !== 'live') return;

        const runner = g.runners[fromBase];
        if (!runner) return;

        pushUndoSnapshot(g, state.pendingPickoffSafe);

        const toBase: StolenBaseLog['toBase'] = fromBase === 'first' ? 'second'
          : fromBase === 'second' ? 'third'
          : 'home';

        // ランナー進塁
        if (toBase !== 'home' && !g.runners[toBase]) {
          g.runners[toBase] = runner;
          g.runners[fromBase] = null;
        } else if (fromBase === 'third') {
          addRun(g, 1);
          g.runners.third = null;
        }

        // StolenBaseLog を生成
        const log: StolenBaseLog = {
          id: `sb_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
          inning: { ...g.inning },
          runnerId: runner.id,
          runnerName: runner.name,
          fromBase,
          toBase,
          result: 'safe',
          outsAtTime: g.count.outs,
          timestamp: Date.now(),
          ...pitchContext,
        };
        if (!g.stolenBaseLogs) g.stolenBaseLogs = [];
        g.stolenBaseLogs.push(log);

        g.updatedAt = Date.now();
      });
    },

    recordCaughtStealing: (fromBase, pitchContext) => {
      set((state) => {
        const g = state.game;
        if (!g) return;
        if (g.phase === 'paused') g.phase = 'live';
        else if (g.phase !== 'live') return;

        const runner = g.runners[fromBase];
        if (!runner) return;

        pushUndoSnapshot(g, state.pendingPickoffSafe);

        const toBase: StolenBaseLog['toBase'] = fromBase === 'first' ? 'second'
          : fromBase === 'second' ? 'third'
          : 'home';

        // ランナー消去 + アウト数 +1
        g.runners[fromBase] = null;
        g.count.outs += 1;
        if (g.count.outs >= 3) changeInning(g);

        // StolenBaseLog を生成（result: 'out'）
        const log: StolenBaseLog = {
          id: `cs_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
          inning: { ...g.inning },
          runnerId: runner.id,
          runnerName: runner.name,
          fromBase,
          toBase,
          result: 'out',
          outsAtTime: g.count.outs - 1, // アウト増加前の値を記録
          timestamp: Date.now(),
          ...pitchContext,
        };
        if (!g.stolenBaseLogs) g.stolenBaseLogs = [];
        g.stolenBaseLogs.push(log);

        g.updatedAt = Date.now();
      });
    },

    addStrikeForFoulInPlay: () => {
      set((state) => {
        const g = state.game;
        if (!g) return;
        if (g.phase === 'paused') g.phase = 'live';
        else if (g.phase !== 'live') return;
        pushUndoSnapshot(g, state.pendingPickoffSafe);
        if (g.count.strikes < 2) {
          g.count.strikes += 1;
        }
        g.updatedAt = Date.now();
      });
    },

    // --- 振り逃げ（第3ストライク不捕球） ---
    resolveUncaughtThirdAsStrikeout: () => {
      set((state) => {
        const g = state.game;
        if (!g || !state.pendingUncaughtThird) return;
        const result = state.pendingUncaughtThird.result;
        state.pendingUncaughtThird = null;
        // 選択待ちに入る直前の recordPitch で undo スナップショットを積んでいるので、
        // ここでは積まない（通常の三振と巻き戻し回数を揃える）
        applyAtBatResultToRunners(g, result, 0);
        finalizeAtBatAndStartNext(g, result);
        g.updatedAt = Date.now();
      });
    },

    resolveUncaughtThirdAsReached: () => {
      set((state) => {
        const g = state.game;
        if (!g || !state.pendingUncaughtThird) return;
        const result = state.pendingUncaughtThird.result;
        state.pendingUncaughtThird = null;
        // computeDefaultAdvancements は三振を明示分岐で扱わず汎用フォールバックに落ちるため、
        // 「走者は据え置き・打者は一塁へ safe」= 振り逃げの初期状態がそのまま得られる
        g.pendingAdvancement = {
          result,
          advancements: computeDefaultAdvancements(g, result),
        };
        g.updatedAt = Date.now();
      });
    },

    confirmStolenBaseAdvancements: (finalAdvancements, pitchContext) => {
      set((state) => {
        const g = state.game;
        if (!g) return;
        if (g.phase === 'paused') g.phase = 'live';
        else if (g.phase !== 'live') return;

        pushUndoSnapshot(g, state.pendingPickoffSafe);

        for (const adv of finalAdvancements) {
          const fromBase = adv.fromBase as 'first' | 'second' | 'third';
          const runner = g.runners[fromBase];
          if (!runner) continue;

          const defaultToBase: StolenBaseLog['toBase'] = fromBase === 'first' ? 'second'
            : fromBase === 'second' ? 'third' : 'home';

          g.runners[fromBase] = null;

          const isOut = adv.outcome === 'out_tag' || adv.outcome === 'out_force' || adv.targetBase === 'out';
          if (isOut) {
            g.count.outs += 1;
            if (g.count.outs >= 3) changeInning(g);
            const log: StolenBaseLog = {
              id: uid('cs'), inning: { ...g.inning }, runnerId: runner.id,
              runnerName: runner.name, fromBase, toBase: defaultToBase, result: 'out',
              outsAtTime: g.count.outs - 1, timestamp: Date.now(), ...(pitchContext ?? {}),
            };
            if (!g.stolenBaseLogs) g.stolenBaseLogs = [];
            g.stolenBaseLogs.push(log);
          } else {
            const tb = adv.targetBase;
            const confirmedBase: StolenBaseLog['toBase'] = (tb === 'second' || tb === 'third' || tb === 'home')
              ? tb : defaultToBase;
            if (confirmedBase === 'home') {
              addRun(g, 1);
            } else {
              g.runners[confirmedBase] = runner;
            }
            const log: StolenBaseLog = {
              id: uid('sb'), inning: { ...g.inning }, runnerId: runner.id,
              runnerName: runner.name, fromBase, toBase: confirmedBase, result: 'safe',
              outsAtTime: g.count.outs, timestamp: Date.now(), ...(pitchContext ?? {}),
            };
            if (!g.stolenBaseLogs) g.stolenBaseLogs = [];
            g.stolenBaseLogs.push(log);
          }
        }

        g.updatedAt = Date.now();
      });
    },

    // --- クイックスタート ---
    quickStartGame: async (options) => {
      const makePlaceholders = () =>
        Array.from({ length: 9 }, (_, i) => ({
          name: '',
          number: '',
          position: '' as Player['position'],
          bats: 'R' as const,
          throws: 'R' as const,
          isPlaceholder: true,
        }));
      const input: GameSetupInput = {
        metadata: { category: 'practice', tournamentName: '' },
        awayTeam: {
          name: options?.awayName || 'チームA',
          starters: makePlaceholders(),
          bench: [],
          unassignedPitchers: [makeUnassignedPitcherInput(1)],
        },
        homeTeam: {
          name: options?.homeName || 'チームB',
          starters: makePlaceholders(),
          bench: [],
          unassignedPitchers: [makeUnassignedPitcherInput(1)],
        },
        ballpark: {
          name: '',
          fenceLeft:   String(options?.fenceLeft   ?? 91),
          fenceCenter: String(options?.fenceCenter ?? 120),
          fenceRight:  String(options?.fenceRight  ?? 91),
        },
        isQuickStart: true,
        velocityEnabled: options?.velocityEnabled ?? false,
        pitchDistanceM: options?.pitchDistanceM ?? 18.44,
      };
      await get().initGame(input);
    },

    updatePlayerMapping: async (mappings) => {
      set((state) => {
        const g = state.game;
        if (!g) return;
        for (const { playerId, newName, newNumber, newPosition, newThrows, newBats, isPitcher, side } of mappings) {
          // 投手行（DH制）は side で直接 roster.pitcher を更新する
          if (isPitcher && side) {
            const team = side === 'away' ? g.awayTeam : g.homeTeam;
            if (team.roster.pitcher) {
              if (newName.trim()) team.roster.pitcher.name = newName.trim();
              if (newNumber.trim()) team.roster.pitcher.number = parseInt(newNumber, 10);
              if (newThrows === 'L' || newThrows === 'R') team.roster.pitcher.throws = newThrows;
              if (newBats === 'L' || newBats === 'R' || newBats === 'S') team.roster.pitcher.bats = newBats;
              team.roster.pitcher.isPlaceholder = !newName.trim();
            }
            continue;
          }
          for (const team of [g.awayTeam, g.homeTeam]) {
            const player = team.roster.starters.find((p) => p.id === playerId);
            if (player) {
              player.name = newName.trim() || player.name;
              player.number = newNumber.trim() ? parseInt(newNumber, 10) : player.number;
              if (newPosition?.trim()) player.position = newPosition.trim() as any;
              if (newThrows === 'L' || newThrows === 'R') player.throws = newThrows;
              if (newBats === 'L' || newBats === 'R' || newBats === 'S') player.bats = newBats;
              player.isPlaceholder = false;
            }
          }
        }

        // ポジション変更後、投手が P でなくなった場合は currentPitcherId を再解決する
        for (const side of ['away', 'home'] as const) {
          const team = side === 'away' ? g.awayTeam : g.homeTeam;
          const currentPitcher = team.roster.starters.find((p) => p.id === g.currentPitcherId[side]);
          if (currentPitcher && currentPitcher.position !== 'P') {
            const newPitcher = team.roster.starters.find((p) => p.position === 'P');
            if (newPitcher) {
            g.currentPitcherId[side] = newPitcher.id;
            if (g.currentAtBat && g.currentAtBat.pitcherId === currentPitcher.id) {
              g.currentAtBat.pitcherId = newPitcher.id;
            }
          }
          }
        }

        // 塁上走者のスナップショットを最新の選手データで同期する
        const allPlayers = [
          ...g.awayTeam.roster.starters,
          ...g.homeTeam.roster.starters,
        ];
        for (const base of ['first', 'second', 'third'] as const) {
          const runner = g.runners[base];
          if (runner) {
            const updated = allPlayers.find((p) => p.id === runner.id);
            if (updated) g.runners[base] = { ...updated };
          }
        }

        const allStarters = [...g.awayTeam.roster.starters, ...g.homeTeam.roster.starters];
        g.hasUnmappedPlayers =
          allStarters.some((p) => p.isPlaceholder)
          || hasUnresolvedPitcherStints(g);
        g.updatedAt = Date.now();
      });
      await get().persist();
    },

    setGameDH: (side, enabled) => {
      set((state) => {
        const g = state.game;
        if (!g) return;
        if (!g.isDH) g.isDH = { away: false, home: false };
        g.isDH[side] = enabled;
        const team = side === 'away' ? g.awayTeam : g.homeTeam;
        if (!enabled) {
          team.roster.pitcher = undefined;
        } else if (!team.roster.pitcher) {
          team.roster.pitcher = {
            id: uid('p'),
            name: '',
            number: null,
            position: 'P',
            bats: 'R',
            throws: 'R',
            isPlaceholder: true,
          };
        }
        g.updatedAt = Date.now();
      });
    },

    updatePlayerBats: (playerId, bats) => {
      set((state) => {
        const g = state.game;
        if (!g) return;
        for (const team of [g.awayTeam, g.homeTeam]) {
          const player = team.roster.starters.find((p) => p.id === playerId);
          if (player) {
            player.bats = bats;
            break;
          }
        }
        g.updatedAt = Date.now();
      });
    },

    recordSignMiss: ({ playerId, playerName, side, context, note }) => {
      set((state) => {
        const g = state.game;
        if (!g) return;

        pushUndoSnapshot(g, state.pendingPickoffSafe);

        if (!g.signMissEvents) g.signMissEvents = [];
        const evt: SignMissEvent = {
          id: uid('signmiss'),
          inning: { ...g.inning },
          atBatId: g.currentAtBat?.id,
          side,
          playerId,
          playerName,
          context,
          ...(note ? { note } : {}),
          timestamp: Date.now(),
        };
        g.signMissEvents.push(evt);
        g.updatedAt = Date.now();
      });
    },

    substitutePlayer: (side, playerOutId, playerInId) => {
      set((state) => {
        const g = state.game;
        if (!g) return;

        const team = side === 'away' ? g.awayTeam : g.homeTeam;
        const inIdx = team.roster.bench.findIndex((p) => p.id === playerInId);
        if (inIdx === -1) return;

        const outIdx = team.roster.starters.findIndex((p) => p.id === playerOutId);
        const isDHPitcher = outIdx === -1 && !!g.isDH?.[side] && team.roster.pitcher?.id === playerOutId;
        if (outIdx === -1 && !isDHPitcher) return;

        pushUndoSnapshot(g, state.pendingPickoffSafe);

        const playerIn = team.roster.bench[inIdx];
        let playerOut: Player | undefined;

        if (isDHPitcher) {
          // DH制の投手交代: roster.pitcher を更新（starters には手を付けない）
          playerOut = team.roster.pitcher!;
          playerIn.position = 'P';
          team.roster.pitcher = playerIn;
          team.roster.bench[inIdx] = playerOut;

          if (!isUnassignedPitcherId(g, side, g.currentPitcherId[side])) {
            g.currentPitcherId[side] = playerIn.id;
            if (!g.currentPitcherPitchCount) g.currentPitcherPitchCount = { away: 0, home: 0 };
            g.currentPitcherPitchCount[side] = 0;
            if (g.currentAtBat && g.currentAtBat.pitcherId === playerOutId) {
              g.currentAtBat.pitcherId = playerIn.id;
            }
          }
        } else {
          // 通常の交代: starters を更新
          playerOut = team.roster.starters[outIdx];
          const positionToKeep = playerOut.position;
          playerIn.position = positionToKeep;
          team.roster.starters[outIdx] = playerIn;
          team.roster.bench[inIdx] = playerOut;

          if (
            positionToKeep === 'P'
            && !isUnassignedPitcherId(g, side, g.currentPitcherId[side])
          ) {
            g.currentPitcherId[side] = playerIn.id;
            if (!g.currentPitcherPitchCount) g.currentPitcherPitchCount = { away: 0, home: 0 };
            g.currentPitcherPitchCount[side] = 0;
            if (g.currentAtBat && g.currentAtBat.pitcherId === playerOutId) {
              g.currentAtBat.pitcherId = playerIn.id;
            }
          }
        }

        if (!playerOut) return;

        // 交代選手がバッターボックスにいる場合: batterId を更新
        if (side === offenseSide(g) && g.currentAtBat?.batterId === playerOutId) {
          g.currentAtBat.batterId = playerIn.id;
        }

        // 交代選手が塁上にいる場合: Runners を更新
        for (const base of ['first', 'second', 'third'] as const) {
          const runner = g.runners[base];
          if (runner && runner.id === playerOutId) {
            g.runners[base] = { ...playerIn };
          }
        }

        // 交代ログを記録
        const log: SubstitutionLog = {
          id: uid('sub'),
          inning: { ...g.inning },
          outs: g.count.outs,
          side,
          position: playerOut.position,
          playerOutId,
          playerOutName: playerOut.name,
          playerInId,
          playerInName: playerIn.name,
          timestamp: Date.now(),
        };
        if (!g.substitutionLogs) g.substitutionLogs = [];
        g.substitutionLogs.push(log);
        g.updatedAt = Date.now();
      });
      get().persist();
    },

    addBenchAndSubstitute: (side, playerOutId, newPlayerData) => {
      set((state) => {
        const g = state.game;
        if (!g) return;

        const team = side === 'away' ? g.awayTeam : g.homeTeam;
        const outIdx = team.roster.starters.findIndex((p) => p.id === playerOutId);
        const isDHPitcher = outIdx === -1 && !!g.isDH?.[side] && team.roster.pitcher?.id === playerOutId;
        if (outIdx === -1 && !isDHPitcher) return;

        pushUndoSnapshot(g, state.pendingPickoffSafe);

        const playerOut = isDHPitcher ? team.roster.pitcher! : team.roster.starters[outIdx];
        const positionToKeep = playerOut.position;

        // ユーザーが明示的にポジションを指定した場合はそちらを優先する
        const newPlayer: Player = {
          id: uid('new-player'),
          name: newPlayerData.name.trim(),
          number: newPlayerData.number,
          position: (newPlayerData.position?.trim() as any) || positionToKeep,
          bats: newPlayerData.bats,
          throws: newPlayerData.throws,
          isPlaceholder: false,
        };

        if (isDHPitcher) {
          // DH制の投手交代: roster.pitcher を更新（starters には手を付けない）
          newPlayer.position = 'P';
          team.roster.pitcher = newPlayer;
        } else {
          team.roster.starters[outIdx] = newPlayer;
        }
        team.roster.bench.push(playerOut);

        // 投手交代の場合: currentPitcherId を更新
        if (
          (positionToKeep === 'P' || isDHPitcher)
          && !isUnassignedPitcherId(g, side, g.currentPitcherId[side])
        ) {
          g.currentPitcherId[side] = newPlayer.id;
          if (!g.currentPitcherPitchCount) g.currentPitcherPitchCount = { away: 0, home: 0 };
          g.currentPitcherPitchCount[side] = 0;
          if (g.currentAtBat && g.currentAtBat.pitcherId === playerOutId) {
            g.currentAtBat.pitcherId = newPlayer.id;
          }
        }

        // 交代選手がバッターボックスにいる場合: batterId を更新
        if (side === offenseSide(g) && g.currentAtBat?.batterId === playerOutId) {
          g.currentAtBat.batterId = newPlayer.id;
        }

        // 交代選手が塁上にいる場合: Runners を更新
        for (const base of ['first', 'second', 'third'] as const) {
          const runner = g.runners[base];
          if (runner && runner.id === playerOutId) {
            g.runners[base] = { ...newPlayer };
          }
        }

        // 交代ログを記録
        const log: SubstitutionLog = {
          id: uid('sub'),
          inning: { ...g.inning },
          outs: g.count.outs,
          side,
          position: positionToKeep,
          playerOutId,
          playerOutName: playerOut.name,
          playerInId: newPlayer.id,
          playerInName: newPlayer.name,
          timestamp: Date.now(),
        };
        if (!g.substitutionLogs) g.substitutionLogs = [];
        g.substitutionLogs.push(log);
        g.updatedAt = Date.now();
      });
      get().persist();
    },

    swapStarterPositions: (side, playerAId, playerBId) => {
      set((state) => {
        const g = state.game;
        if (!g) return;
        const team = side === 'away' ? g.awayTeam : g.homeTeam;
        const aIdx = team.roster.starters.findIndex((p) => p.id === playerAId);
        const bIdx = team.roster.starters.findIndex((p) => p.id === playerBId);
        if (aIdx === -1 || bIdx === -1 || aIdx === bIdx) return;

        pushUndoSnapshot(g, state.pendingPickoffSafe);

        const posA = team.roster.starters[aIdx].position;
        const posB = team.roster.starters[bIdx].position;
        team.roster.starters[aIdx].position = posB;
        team.roster.starters[bIdx].position = posA;

        const currentIsUnassigned = isUnassignedPitcherId(g, side, g.currentPitcherId[side]);
        if (posA === 'P' && !currentIsUnassigned) {
          g.currentPitcherId[side] = playerBId;
        } else if (posB === 'P' && !currentIsUnassigned) {
          g.currentPitcherId[side] = playerAId;
        }
        g.updatedAt = Date.now();
      });
      get().persist();
    },

    changeStarterPosition: (side, playerId, newPosition) => {
      set((state) => {
        const g = state.game;
        if (!g) return;
        const team = side === 'away' ? g.awayTeam : g.homeTeam;
        const idx = team.roster.starters.findIndex((p) => p.id === playerId);
        if (idx === -1) return;

        const oldPos = team.roster.starters[idx].position;
        if (oldPos === newPosition) return;

        pushUndoSnapshot(g, state.pendingPickoffSafe);

        team.roster.starters[idx].position = newPosition;

        const currentIsUnassigned = isUnassignedPitcherId(g, side, g.currentPitcherId[side]);
        if (newPosition === 'P' && !currentIsUnassigned) {
          g.currentPitcherId[side] = playerId;
        } else if (oldPos === 'P' && !currentIsUnassigned) {
          const newPitcher = team.roster.starters.find((p) => p.position === 'P');
          if (newPitcher) g.currentPitcherId[side] = newPitcher.id;
        }
        g.updatedAt = Date.now();
      });
      get().persist();
    },

    addBenchPlayer: (side, newPlayerData) => {
      set((state) => {
        const g = state.game;
        if (!g) return;

        pushUndoSnapshot(g, state.pendingPickoffSafe);

        const team = side === 'away' ? g.awayTeam : g.homeTeam;
        const newPlayer: Player = {
          id: uid('new-player'),
          name: newPlayerData.name.trim(),
          number: newPlayerData.number,
          position: ((newPlayerData.position?.trim() || '') as Position),
          bats: newPlayerData.bats,
          throws: newPlayerData.throws,
          isPlaceholder: false,
        };
        team.roster.bench.push(newPlayer);
        g.updatedAt = Date.now();
      });
      get().persist();
    },

    commitPositionChanges: (side, starterPositions, substitutions, dhTermination) => {
      let committed = false;
      set((state) => {
        const g = state.game;
        if (!g) return;
        const team = side === 'away' ? g.awayTeam : g.homeTeam;

        let dhPlan: { outIdx: number; playerOut: Player; pitcher: Player } | null = null;
        if (dhTermination) {
          const outIdx = team.roster.starters.findIndex(
            (player) => player.id === dhTermination.dhPlayerOutId,
          );
          const playerOut = outIdx >= 0 ? team.roster.starters[outIdx] : undefined;
          const pitcher = team.roster.pitcher;
          if (
            !g.isDH?.[side]
            || !playerOut
            || playerOut.position !== 'DH'
            || !pitcher
            || pitcher.id !== dhTermination.pitcherId
            || g.currentPitcherId[side] !== pitcher.id
            || team.roster.bench.some((player) => player.id === playerOut.id)
            || team.roster.bench.some((player) => player.id === pitcher.id)
            || team.roster.starters.some(
              (player, index) => index !== outIdx && player.id === pitcher.id,
            )
            || team.roster.starters.filter((player) => player.position === 'DH').length !== 1
            || team.roster.starters.some(
              (player, index) => index !== outIdx && player.position === 'P',
            )
          ) {
            return;
          }
          dhPlan = { outIdx, playerOut, pitcher };
        }

        pushUndoSnapshot(g, state.pendingPickoffSafe);

        if (dhPlan) {
          const { outIdx, playerOut, pitcher } = dhPlan;
          team.roster.starters[outIdx] = { ...pitcher, position: 'P' };
          team.roster.bench.push(playerOut);
          team.roster.pitcher = undefined;
          g.isDH![side] = false;

          if (side === offenseSide(g) && g.currentAtBat?.batterId === playerOut.id) {
            g.currentAtBat.batterId = pitcher.id;
          }
          for (const base of ['first', 'second', 'third'] as const) {
            if (g.runners[base]?.id === playerOut.id) {
              g.runners[base] = { ...pitcher, position: 'P' };
            }
          }

          const log: SubstitutionLog = {
            id: uid('sub'),
            inning: { ...g.inning },
            outs: g.count.outs,
            side,
            position: 'DH',
            playerOutId: playerOut.id,
            playerOutName: playerOut.name,
            playerInId: pitcher.id,
            playerInName: pitcher.name,
            timestamp: Date.now(),
          };
          if (!g.substitutionLogs) g.substitutionLogs = [];
          g.substitutionLogs.push(log);
        }

        // 1. 交代を先に適用（posToKeep をポジション変更前の状態で取得するため）
        for (const { playerOutId, playerInId, targetPosition } of substitutions) {
          const inIdx = team.roster.bench.findIndex((p) => p.id === playerInId);
          if (inIdx === -1) continue;

          const outIdx = team.roster.starters.findIndex((p) => p.id === playerOutId);
          const isDHPitcher = outIdx === -1 && !!g.isDH?.[side] && team.roster.pitcher?.id === playerOutId;
          if (outIdx === -1 && !isDHPitcher) continue;

          const playerIn = team.roster.bench[inIdx];
          let playerOut: Player;

          if (isDHPitcher) {
            playerOut = team.roster.pitcher!;
            playerIn.position = 'P';
            team.roster.pitcher = playerIn;
            team.roster.bench[inIdx] = playerOut;
            if (!isUnassignedPitcherId(g, side, g.currentPitcherId[side])) {
              g.currentPitcherId[side] = playerIn.id;
              if (!g.currentPitcherPitchCount) g.currentPitcherPitchCount = { away: 0, home: 0 };
              g.currentPitcherPitchCount[side] = 0;
              if (g.currentAtBat && g.currentAtBat.pitcherId === playerOutId) {
                g.currentAtBat.pitcherId = playerIn.id;
              }
            }
          } else {
            playerOut = team.roster.starters[outIdx];
            const posToKeep = targetPosition;
            playerIn.position = posToKeep;
            team.roster.starters[outIdx] = playerIn;
            team.roster.bench[inIdx] = playerOut;

            if (
              posToKeep === 'P'
              && !isUnassignedPitcherId(g, side, g.currentPitcherId[side])
            ) {
              g.currentPitcherId[side] = playerIn.id;
              if (!g.currentPitcherPitchCount) g.currentPitcherPitchCount = { away: 0, home: 0 };
              g.currentPitcherPitchCount[side] = 0;
              if (g.currentAtBat && g.currentAtBat.pitcherId === playerOutId) {
                g.currentAtBat.pitcherId = playerIn.id;
              }
            }
          }

          if (side === offenseSide(g) && g.currentAtBat?.batterId === playerOutId) {
            g.currentAtBat.batterId = playerIn.id;
          }

          for (const base of ['first', 'second', 'third'] as const) {
            if (g.runners[base]?.id === playerOutId) {
              g.runners[base] = { ...playerIn };
            }
          }

          const log: SubstitutionLog = {
            id: uid('sub'),
            inning: { ...g.inning },
            outs: g.count.outs,
            side,
            position: playerOut.position,
            playerOutId,
            playerOutName: playerOut.name,
            playerInId,
            playerInName: playerIn.name,
            timestamp: Date.now(),
          };
          if (!g.substitutionLogs) g.substitutionLogs = [];
          g.substitutionLogs.push(log);
        }

        // 2. ポジション変更を後に適用
        for (const { playerId, newPosition } of starterPositions) {
          const idx = team.roster.starters.findIndex((p) => p.id === playerId);
          if (idx === -1) continue;
          const oldPos = team.roster.starters[idx].position;
          team.roster.starters[idx].position = newPosition;
          const currentIsUnassigned = isUnassignedPitcherId(g, side, g.currentPitcherId[side]);
          if (newPosition === 'P' && !currentIsUnassigned) {
            g.currentPitcherId[side] = playerId;
          } else if (oldPos === 'P' && !currentIsUnassigned) {
            const newPitcher = team.roster.starters.find((p) => p.position === 'P');
            if (newPitcher) g.currentPitcherId[side] = newPitcher.id;
          }
        }

        g.updatedAt = Date.now();
        committed = true;
      });
      if (committed) get().persist();
      return committed;
    },

    commitOffensiveSubstitutions: (side, substitutions) => {
      set((state) => {
        const g = state.game;
        if (!g) return;
        const team = side === 'away' ? g.awayTeam : g.homeTeam;
        pushUndoSnapshot(g, state.pendingPickoffSafe);
        for (const { playerOutId, playerInId, type, baseIfRunner } of substitutions) {
          const inIdx = team.roster.bench.findIndex((p) => p.id === playerInId);
          if (inIdx === -1) continue;
          const outIdx = team.roster.starters.findIndex((p) => p.id === playerOutId);
          if (outIdx === -1) continue;
          const playerIn = team.roster.bench[inIdx];
          const playerOut = team.roster.starters[outIdx];
          playerIn.position = '' as Position;
          team.roster.starters[outIdx] = playerIn;
          team.roster.bench[inIdx] = playerOut;
          if (type === 'pinch_hitter' && g.currentAtBat?.batterId === playerOutId) {
            g.currentAtBat.batterId = playerIn.id;
          }
          if (type === 'pinch_runner' && baseIfRunner && g.runners[baseIfRunner]?.id === playerOutId) {
            g.runners[baseIfRunner] = { ...playerIn };
          }
          const log: SubstitutionLog = {
            id: uid('sub'),
            inning: { ...g.inning },
            outs: g.count.outs,
            side,
            position: playerOut.position,
            playerOutId,
            playerOutName: playerOut.name,
            playerInId,
            playerInName: playerIn.name,
            timestamp: Date.now(),
            substitutionType: type,
          };
          if (!g.substitutionLogs) g.substitutionLogs = [];
          g.substitutionLogs.push(log);
        }
        g.updatedAt = Date.now();
      });
      get().persist();
    },
  })),
);
