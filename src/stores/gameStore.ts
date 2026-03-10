import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import { db } from '../db';
import type {
  GameState,
  GamePhase,
  GameSetupInput,
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
  PickoffBase,
  PickoffResult,
  PickoffEvent,
  SubstitutionLog,
} from '../types/game';
import { RESULTS_NEEDING_ADVANCEMENT } from '../types/game';

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

// ============================================================
// ヘルパー: ユニークID生成
// ============================================================
let idSeq = 0;
function uid(prefix: string): string {
  return `${prefix}-${Date.now()}-${++idSeq}`;
}

// ============================================================
// ストアのアクション型定義
// ============================================================
interface GameActions {
  // --- ライフサイクル ---
  initGame: (input: GameSetupInput) => Promise<void>;
  loadGame: (id: string) => Promise<void>;
  setPhase: (phase: GamePhase) => void;
  persist: () => Promise<void>;

  // --- 投球アクション ---
  /** 1球を記録する。結果に応じてカウント・打席結果を自動進行 */
  recordPitch: (pitchType: PitchType | string, zone: StrikeZone, result: PitchResult, velocity?: number, pitchX?: number, pitchY?: number) => void;

  // --- 打席結果アクション (インプレイ時に呼ぶ) ---
  /** インプレイの結果を確定する */
  resolveAtBat: (result: AtBatResult, battedBall?: BattedBall, rbiCount?: number) => void;

  // --- ランナー操作 ---
  /** ランナーを進塁させる (得点を含む) */
  advanceRunners: (scoring: string[], advances: { from: 'first' | 'second' | 'third'; to: 'second' | 'third' | 'home' }[]) => void;

  // --- 進塁確認フロー ---
  /** Phase 1: 進塁確認モードに入る */
  beginAdvancementConfirmation: (result: AtBatResult, battedBall?: BattedBall, fielding?: FieldingRecord) => void;
  /** Phase 2: 進塁確認を確定する */
  confirmAdvancement: (finalAdvancements: RunnerAdvancement[]) => void;
  /** 進塁確認をキャンセルする */
  cancelAdvancement: () => void;

  // --- カスタム球種 ---
  /** カスタム球種を追加する */
  addCustomPitchType: (name: string) => void;

  // --- アンドゥ ---
  /** 直前の1球を取り消す */
  undoLastPitch: () => void;

  // --- プレイログ編集 ---
  /** 完了済み打席の結果・打点を修正し、スコアボードを再計算する */
  editAtBatLog: (logId: string, newResult: AtBatResult, newRbi: number) => void;

  // --- 牽制 ---
  /** 牽制を記録する。結果に応じてランナー状態を更新 */
  recordPickoff: (targetBase: PickoffBase, result: PickoffResult) => void;

  // --- 盗塁 ---
  /** 盗塁を記録する。ランナーを次の塁へ進める */
  recordStolenBase: (fromBase: 'first' | 'second' | 'third') => void;

  // --- クイックスタート ---
  /** 仮選手でゲームを即時開始する */
  quickStartGame: (options?: { awayName?: string; homeName?: string; velocityEnabled?: boolean; pitchDistanceM?: number; fenceLeft?: number; fenceCenter?: number; fenceRight?: number }) => Promise<void>;
  /** 仮選手を実選手名・背番号に紐付ける */
  updatePlayerMapping: (mappings: { playerId: string; newName: string; newNumber: string }[]) => Promise<void>;

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
    newPlayerData: { name: string; number: number | null; bats: 'L' | 'R' | 'S'; throws: 'L' | 'R' },
  ) => void;
}

type GameStore = { game: GameState | null } & GameActions;

// ============================================================
// 変換ユーティリティ
// ============================================================

function toPlayer(
  input: { name: string; number: string; position: string; bats: string; throws: string; isPlaceholder?: boolean },
  index: number,
): Player {
  return {
    id: uid('p'),
    name: input.name,
    number: input.number.trim() ? parseInt(input.number, 10) : null,
    position: input.position as Player['position'],
    bats: (input.bats || 'R') as Player['bats'],
    throws: (input.throws || 'R') as Player['throws'],
    ...(input.isPlaceholder ? { isPlaceholder: true } : {}),
  };
}

function toTeam(input: GameSetupInput['awayTeam']): Team {
  const starters = input.starters.map((s, i) => toPlayer(s, i));
  const bench = input.bench.map((b, i) => toPlayer(b, i + 100));
  const pitcher = input.pitcher ? toPlayer(input.pitcher, 999) : undefined;
  return {
    name: input.name,
    roster: { starters: starters as Roster['starters'], bench, pitcher },
  };
}

function createInitialGameState(input: GameSetupInput): GameState {
  const now = Date.now();
  const id = `game-${now}`;
  const away = toTeam(input.awayTeam);
  const home = toTeam(input.homeTeam);

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
    pitcherId: home.roster.pitcher?.id
      ?? home.roster.starters.find((p) => p.position === 'P')?.id
      ?? home.roster.starters[0].id,
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
    awayTeam: away,
    homeTeam: home,
    ballpark,
    inning: { number: 1, half: 'top' },
    count: { balls: 0, strikes: 0, outs: 0 },
    runners: { first: null, second: null, third: null },
    currentBatterIndex: { away: 0, home: 0 },
    currentPitcherId: {
      // DH制: pitcher フィールドを優先; 非DH: スタメンから P を探す
      away: away.roster.pitcher?.id
        ?? away.roster.starters.find((p) => p.position === 'P')?.id
        ?? away.roster.starters[0].id,
      home: home.roster.pitcher?.id
        ?? home.roster.starters.find((p) => p.position === 'P')?.id
        ?? home.roster.starters[0].id,
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
    currentAtBat: initialAtBat,
    totalPitchCount: { away: 0, home: 0 },
    pendingAdvancement: null,
    substitutionLogs: [],
    customPitchTypes: [],
    ...(input.isQuickStart ? { isQuickStart: true, hasUnmappedPlayers: true } : {}),
    pitchDistanceM: input.pitchDistanceM ?? 18.44,
    velocityEnabled: input.velocityEnabled ?? false,
    isDH: input.isDH ?? false,
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

  // 打席結果による進塁数
  let advanceBases = 1;
  switch (result) {
    case 'double': advanceBases = 2; break;
    case 'triple': advanceBases = 3; break;
  }

  // 打者が1塁に行く結果かどうか
  const batterGoesToFirst = ['single', 'error', 'fielders_choice'].includes(result);

  // フォースチェーン判定: 連続した塁が埋まっている場合のみフォース
  const isForced: Record<string, boolean> = { first: false, second: false, third: false };
  if (batterGoesToFirst && game.runners.first) {
    isForced['first'] = true;
    if (game.runners.second) {
      isForced['second'] = true;
      if (game.runners.third) {
        isForced['third'] = true;
      }
    }
  }

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

  // === ホームラン ===
  if (result === 'home_run') {
    for (const r of runners) {
      advancements.push({
        runnerId: r.player.id, playerName: r.player.name,
        fromBase: r.base, targetBase: 'home',
        outcome: 'safe', action: 'batted_ball',
        isForced: false, minBase: 'home',
      });
    }
    advancements.push({
      runnerId: batter.id, playerName: batter.name,
      fromBase: 'batter', targetBase: 'home',
      outcome: 'safe', action: 'batted_ball',
      isForced: false, minBase: 'home',
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

  for (const r of runners) {
    const curNum = BASE_ORDER[r.base];
    const defaultTarget = Math.min(curNum + advanceBases, 4);
    const minNum = isForced[r.base] ? Math.min(curNum + 1, 4) : curNum;

    // 犠飛のデフォルト: タッチアップ
    const action = (result === 'sacrifice_fly' || result === 'sacrifice_bunt')
      ? 'tag_up' as const
      : 'batted_ball' as const;

    advancements.push({
      runnerId: r.player.id,
      playerName: r.player.name,
      fromBase: r.base,
      targetBase: BASE_FROM_NUM[defaultTarget],
      outcome: 'safe',
      action,
      isForced: isForced[r.base],
      minBase: BASE_FROM_NUM[minNum],
    });
  }

  // 打者の進塁
  if (result === 'sacrifice_bunt' || result === 'sacrifice_fly') {
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
  } else if (result === 'fielders_choice') {
    advancements.push({
      runnerId: batter.id,
      playerName: batter.name,
      fromBase: 'batter',
      targetBase: 'first',
      outcome: 'safe',
      action: 'batted_ball',
      isForced: true,
      minBase: 'first',
    });
  } else {
    const batterTarget = BASE_FROM_NUM[Math.min(advanceBases, 3)];
    advancements.push({
      runnerId: batter.id,
      playerName: batter.name,
      fromBase: 'batter',
      targetBase: batterTarget,
      outcome: 'safe',
      action: 'batted_ball',
      isForced: true,
      minBase: batterTarget,
    });
  }

  return advancements;
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

    // --- ライフサイクル ---
    initGame: async (input) => {
      const gameState = createInitialGameState(input);
      await db.games.put(gameState);
      set({ game: gameState });
    },

    loadGame: async (id) => {
      const gameState = await db.games.get(id);
      if (gameState) set({ game: gameState });
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
      const game = get().game;
      if (game) await db.games.put(game);
    },

    // --- 投球記録 ---
    recordPitch: (pitchType, zone, result, velocity, pitchX, pitchY) => {
      set((state) => {
        const g = state.game;
        if (!g || g.phase !== 'live') return;

        const countBefore: Count = { ...g.count };
        const side = offenseSide(g);
        const defSide = defenseSide(g);

        // 通算球数 +1
        g.totalPitchCount[defSide] += 1;

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
        const pitchLog: PitchLog = {
          id: uid('pitch'),
          inning: { ...g.inning },
          pitchNumber: g.currentAtBat ? g.currentAtBat.pitches.length + 1 : 1,
          totalPitchNumber: g.totalPitchCount[defSide],
          pitcherId: currentPitcherId(g),
          batterId: currentBatter(g).id,
          pitchType,
          zone,
          result,
          countBefore,
          countAfter,
          timestamp: Date.now(),
          // undefined を含めると Firestore がエラーになるため、値がある場合のみ追加
          ...(pitchX !== undefined ? { pitchX } : {}),
          ...(pitchY !== undefined ? { pitchY } : {}),
          ...(velocity !== undefined ? { velocity } : {}),
        };

        g.pitchLogs.push(pitchLog);
        if (g.currentAtBat) {
          g.currentAtBat.pitches.push(pitchLog);
        }

        // 自動確定する打席結果がある場合
        if (atBatEnded && autoResult) {
          applyAtBatResultToRunners(g, autoResult, autoResult === 'walk' || autoResult === 'hit_by_pitch' ? 0 : 0);
          finalizeAtBatAndStartNext(g, autoResult);
        }

        g.updatedAt = Date.now();
      });
    },

    // --- インプレイ結果の確定 ---
    resolveAtBat: (result, battedBall, rbiCount = 0) => {
      const g = get().game;
      if (!g) return;

      // ランナーがいれば全インプレイ結果で進塁確認モードへ
      const hasRunners = g.runners.first || g.runners.second || g.runners.third;
      if (hasRunners) {
        get().beginAdvancementConfirmation(result, battedBall);
        return;
      }

      // ランナーなし → 自動解決
      set((state) => {
        const gs = state.game;
        if (!gs || gs.phase !== 'live') return;

        if (battedBall && gs.currentAtBat) {
          gs.currentAtBat.battedBall = battedBall;
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
    beginAdvancementConfirmation: (result, battedBall, fielding) => {
      set((state) => {
        const g = state.game;
        if (!g || g.phase !== 'live') return;

        if (battedBall && g.currentAtBat) {
          g.currentAtBat.battedBall = battedBall;
        }
        if (fielding && g.currentAtBat) {
          g.currentAtBat.fielding = fielding;
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
        };
        g.updatedAt = Date.now();
      });
    },

    confirmAdvancement: (finalAdvancements) => {
      set((state) => {
        const g = state.game;
        if (!g || !g.pendingAdvancement) return;

        const { result } = g.pendingAdvancement;

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
        }

        // ペンディングをクリア
        g.pendingAdvancement = null;

        // 打席完了
        finalizeAtBatAndStartNext(g, result);
        g.updatedAt = Date.now();
      });
    },

    cancelAdvancement: () => {
      set((state) => {
        const g = state.game;
        if (!g || !g.pendingAdvancement) return;

        // 先行加算したヒット/エラーを取り消し
        const result = g.pendingAdvancement.result;
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
    undoLastPitch: () => {
      set((state) => {
        const g = state.game;
        if (!g || g.pitchLogs.length === 0) return;

        const lastPitch = g.pitchLogs.pop()!;

        // currentAtBat から最後の投球を除去
        if (g.currentAtBat && g.currentAtBat.pitches.length > 0) {
          g.currentAtBat.pitches.pop();
        }

        // カウントを投球前に復元
        g.count = { ...lastPitch.countBefore };

        // 通算球数 -1
        const defSide = defenseSide(g);
        g.totalPitchCount[defSide] = Math.max(0, g.totalPitchCount[defSide] - 1);

        g.updatedAt = Date.now();
      });
    },

    // --- プレイログ編集 ---
    editAtBatLog: (logId, newResult, newRbi) => {
      set((state) => {
        const g = state.game;
        if (!g) return;
        const log = g.atBatLogs.find((l) => l.id === logId);
        if (!log) return;

        log.result = newResult;
        log.rbiCount = newRbi;

        // スコアボード全体を再計算
        recalculateScoreboard(g);
        g.updatedAt = Date.now();
      });
    },

    // --- 牽制 ---
    recordPickoff: (targetBase, result) => {
      set((state) => {
        const g = state.game;
        if (!g || g.phase !== 'live') return;

        const runner = g.runners[targetBase];
        if (!runner) return;

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
            // セーフ: 変更なし
            break;
        }

        g.updatedAt = Date.now();
      });
    },

    // --- 盗塁 ---
    recordStolenBase: (fromBase) => {
      set((state) => {
        const g = state.game;
        if (!g || g.phase !== 'live') return;

        const runner = g.runners[fromBase];
        if (!runner) return;

        const nextBase = fromBase === 'first' ? 'second'
          : fromBase === 'second' ? 'third'
          : null; // 3塁 → ホーム

        if (nextBase && !g.runners[nextBase]) {
          g.runners[nextBase] = runner;
          g.runners[fromBase] = null;
        } else if (fromBase === 'third') {
          addRun(g, 1);
          g.runners.third = null;
        }

        g.updatedAt = Date.now();
      });
    },

    // --- クイックスタート ---
    quickStartGame: async (options) => {
      const STARTER_POSITIONS = ['P', 'C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF'] as const;
      const makePlaceholders = () =>
        STARTER_POSITIONS.map((pos, i) => ({
          name: `${i + 1}番`,
          number: `${i + 1}`,
          position: pos,
          bats: 'R' as const,
          throws: 'R' as const,
          isPlaceholder: true,
        }));
      const input: GameSetupInput = {
        metadata: { category: 'practice', tournamentName: '' },
        awayTeam: { name: options?.awayName || 'チームA', starters: makePlaceholders(), bench: [] },
        homeTeam: { name: options?.homeName || 'チームB', starters: makePlaceholders(), bench: [] },
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
        for (const { playerId, newName, newNumber } of mappings) {
          for (const team of [g.awayTeam, g.homeTeam]) {
            const player = team.roster.starters.find((p) => p.id === playerId);
            if (player) {
              player.name = newName.trim() || player.name;
              player.number = newNumber.trim() ? parseInt(newNumber, 10) : player.number;
              player.isPlaceholder = false;
            }
          }
        }
        const allStarters = [...g.awayTeam.roster.starters, ...g.homeTeam.roster.starters];
        g.hasUnmappedPlayers = allStarters.some((p) => p.isPlaceholder);
        g.updatedAt = Date.now();
      });
      await get().persist();
    },

    substitutePlayer: (side, playerOutId, playerInId) => {
      set((state) => {
        const g = state.game;
        if (!g) return;

        const team = side === 'away' ? g.awayTeam : g.homeTeam;
        const outIdx = team.roster.starters.findIndex((p) => p.id === playerOutId);
        const inIdx  = team.roster.bench.findIndex((p) => p.id === playerInId);
        if (outIdx === -1 || inIdx === -1) return;

        const playerOut = team.roster.starters[outIdx];
        const playerIn  = team.roster.bench[inIdx];

        // 入れ替え: 控えの選手がスターターのポジションを引き継ぐ
        const positionToKeep = playerOut.position;
        playerIn.position = positionToKeep;

        // スターター/ベンチ入れ替え
        team.roster.starters[outIdx] = playerIn;
        team.roster.bench[inIdx] = playerOut;

        // 投手交代の場合: currentPitcherId を更新
        if (positionToKeep === 'P') {
          g.currentPitcherId[side] = playerIn.id;
          // 進行中の打席ログの pitcherId も更新
          if (g.currentAtBat && g.currentAtBat.pitcherId === playerOutId) {
            g.currentAtBat.pitcherId = playerIn.id;
          }
        }

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
          position: positionToKeep,
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
        if (outIdx === -1) return;

        const playerOut = team.roster.starters[outIdx];
        const positionToKeep = playerOut.position;

        // 新規選手をベンチに追加してからスターターへ昇格
        const newPlayer: Player = {
          id: uid('new-player'),
          name: newPlayerData.name.trim(),
          number: newPlayerData.number,
          position: positionToKeep,
          bats: newPlayerData.bats,
          throws: newPlayerData.throws,
          isPlaceholder: false,
        };

        team.roster.starters[outIdx] = newPlayer;
        team.roster.bench.push(playerOut);

        // 投手交代の場合: currentPitcherId を更新
        if (positionToKeep === 'P') {
          g.currentPitcherId[side] = newPlayer.id;
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
  })),
);
