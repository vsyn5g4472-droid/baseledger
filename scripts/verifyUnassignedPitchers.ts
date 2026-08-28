import type { AtBatLog, GameState, PitchLog, Player } from '../src/types/game';
import {
  findPitcherById,
  hasUnresolvedPitcherStints,
  listUnresolvedPitcherStints,
  makeUnassignedPitcherInput,
  nextUnassignedPitcherNumber,
} from '../src/services/unassignedPitcherService';
import {
  listPitcherAttributionCandidates,
  listPitcherReassignmentDestinations,
  reassignPitcherRecords,
} from '../src/services/pitcherReassignmentService';
import { buildAIReportInput } from '../src/utils/multiGameStats';
import { computeGameAnalytics } from '../src/utils/gameStatsCalculator';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`検証失敗: ${message}`);
}

function player(id: string, position: Player['position'], extra?: Partial<Player>): Player {
  return { id, name: id, number: null, position, bats: 'R', throws: 'R', ...extra };
}

function pitch(id: string, pitcherId: string, half: 'top' | 'bottom'): PitchLog {
  return {
    id,
    inning: { number: 1, half },
    pitchNumber: 1,
    totalPitchNumber: 1,
    pitcherId,
    batterId: half === 'top' ? 'A1' : 'H1',
    pitchType: 'fastball',
    zone: '5',
    result: 'strike_called',
    countBefore: { balls: 0, strikes: 0, outs: 0 },
    countAfter: { balls: 0, strikes: 1, outs: 0 },
    timestamp: 1,
  };
}

function atBat(id: string, pitcherId: string, half: 'top' | 'bottom'): AtBatLog {
  return {
    id,
    inning: { number: 1, half },
    batterId: half === 'top' ? 'A1' : 'H1',
    pitcherId,
    pitches: [pitch(`${id}-pitch`, pitcherId, half)],
    result: 'strikeout',
    rbiCount: 0,
    runnersBeforePlay: { first: null, second: null, third: null },
    runnersAfterPlay: { first: null, second: null, third: null },
    timestamp: 1,
  };
}

function starters(prefix: string): GameState['awayTeam']['roster']['starters'] {
  return Array.from({ length: 9 }, (_, index) =>
    player(`${prefix}${index + 1}`, '', { name: `選手${index + 1}`, isPlaceholder: true }),
  ) as GameState['awayTeam']['roster']['starters'];
}

function baseGame(): GameState {
  const awayStarters = starters('A');
  const homeStarters = starters('H');
  const awayUnassigned = player('U-away-1', '', {
    name: '投手未登録1',
    isPlaceholder: true,
    isUnassignedPitcher: true,
  });
  const homeUnassigned = player('U-home-1', '', {
    name: '投手未登録1',
    isPlaceholder: true,
    isUnassignedPitcher: true,
  });
  return {
    id: 'unassigned-test',
    phase: 'live',
    createdAt: 1,
    updatedAt: 1,
    metadata: { category: 'practice', tournamentName: '' },
    awayTeam: {
      name: 'Away',
      roster: { starters: awayStarters, bench: [], unassignedPitchers: [awayUnassigned] },
    },
    homeTeam: {
      name: 'Home',
      roster: { starters: homeStarters, bench: [], unassignedPitchers: [homeUnassigned] },
    },
    ballpark: { name: '', fenceDistance: { left: 0, center: 0, right: 0 } },
    inning: { number: 1, half: 'top' },
    count: { balls: 0, strikes: 1, outs: 0 },
    runners: { first: null, second: null, third: null },
    currentBatterIndex: { away: 0, home: 0 },
    currentPitcherId: { away: awayUnassigned.id, home: homeUnassigned.id },
    scoreboard: {
      innings: [], awayTotal: 0, homeTotal: 0,
      awayHits: 0, homeHits: 0, awayErrors: 0, homeErrors: 0,
    },
    pitchLogs: [pitch('top-pitch', homeUnassigned.id, 'top')],
    atBatLogs: [],
    pickoffEvents: [],
    stolenBaseLogs: [],
    currentAtBat: atBat('current', homeUnassigned.id, 'top'),
    totalPitchCount: { away: 0, home: 1 },
    currentPitcherPitchCount: { away: 0, home: 1 },
    pendingAdvancement: null,
    substitutionLogs: [],
    signMissEvents: [],
    customPitchTypes: [],
    isQuickStart: true,
    hasUnmappedPlayers: true,
    isDH: { away: false, home: false },
  };
}

const game = baseGame();
assert(game.awayTeam.roster.starters.every((p) => p.position === ''), '仮選手に守備位置を自動設定しない');
assert(findPitcherById(game.homeTeam, 'U-home-1')?.isUnassignedPitcher, '打順外の未割当投手をID解決できる');
assert(listUnresolvedPitcherStints(game).length === 2, '両チームの未割当区間を検出する');
assert(hasUnresolvedPitcherStints(game), '未割当投手がある試合を共有停止対象にする');

const gameAnalytics = computeGameAnalytics(game);
assert(gameAnalytics.pitching.homePitchers[0]?.playerId === 'U-home-1', '単一試合では未割当投手の記録を表示する');
assert(buildAIReportInput(game).pitcher === null, 'AI入力から未割当投手を除外する');

game.homeTeam.roster.starters[0].isPlaceholder = false;
game.homeTeam.roster.starters[0].name = '実投手H';
const resolved = reassignPitcherRecords(game, {
  logId: 'resolve-home',
  side: 'home',
  fromPitcherId: 'U-home-1',
  toPitcherId: 'H1',
  reason: 'unassigned_pitcher_resolved',
  createdAt: 10,
});
assert(resolved.game.currentPitcherId.home === 'H1', '現投手を明示選択した実投手へ移管する');
assert(resolved.game.pitchLogs[0].pitcherId === 'H1', '投球ログを実投手へ移管する');
assert(resolved.game.homeTeam.roster.starters[0].position === 'P', '非DHの実投手だけをPにする');
assert(!resolved.game.homeTeam.roster.unassignedPitchers, '解決済み区間を専用一覧から除去する');
assert(resolved.log.reason === 'unassigned_pitcher_resolved', '解決理由を履歴に残す');
assert(nextUnassignedPitcherNumber(resolved.game, 'home') === 2, '解決後も投球区間番号を再利用しない');
assert(resolved.game.substitutionLogs.length === 0, '打順交代ログを生成・変更しない');
assert(listUnresolvedPitcherStints(resolved.game).length === 1, '未解決の別チーム区間は残す');

const dh = baseGame();
dh.inning.half = 'bottom';
dh.currentAtBat = atBat('dh-current', 'U-away-1', 'bottom');
dh.pitchLogs = [pitch('dh-pitch', 'U-away-1', 'bottom')];
dh.isDH = { away: true, home: false };
dh.awayTeam.roster.pitcher = player('DH-real', 'P', { name: 'DH実投手' });
const dhSource = listPitcherAttributionCandidates(dh).find(
  (candidate) => candidate.side === 'away' && candidate.pitcherId === 'U-away-1',
);
assert(dhSource, 'DHの現未割当投手を移管元候補に出す');
assert(
  listPitcherReassignmentDestinations(dh, dhSource).some((candidate) => candidate.id === 'DH-real'),
  'DHで後から登録した打順外投手を移管先候補に出す',
);
const dhResolved = reassignPitcherRecords(dh, {
  logId: 'resolve-dh',
  side: 'away',
  fromPitcherId: 'U-away-1',
  toPitcherId: 'DH-real',
  reason: 'unassigned_pitcher_resolved',
});
assert(dhResolved.game.awayTeam.roster.pitcher?.id === 'DH-real', 'DHの登録済み打順外投手へ移管する');
assert(!dhResolved.game.awayTeam.roster.unassignedPitchers, 'DHでも解決済み区間を除去する');
assert(dhResolved.game.awayTeam.roster.starters.every((p) => p.position === ''), 'DH移管で打順を変更しない');

const firstInput = makeUnassignedPitcherInput(1);
const secondInput = makeUnassignedPitcherInput(2);
assert(firstInput.name === '投手未登録1' && secondInput.name === '投手未登録2', '投球区間ごとに表示名を分ける');
assert(firstInput.position === '' && firstInput.isUnassignedPitcher, '未割当投手に守備位置を付けない');

console.log('unassigned pitcher verification: OK');
