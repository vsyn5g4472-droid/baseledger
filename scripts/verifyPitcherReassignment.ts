import type { GameState, Player, PitchLog, AtBatLog } from '../src/types/game';
import {
  comparePitcherReassignmentLogIdSets,
  reassignPitcherRecords,
} from '../src/services/pitcherReassignmentService';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`検証失敗: ${message}`);
}

function player(id: string, position: Player['position']): Player {
  return { id, name: id, number: null, position, bats: 'R', throws: 'R' };
}

function pitch(id: string, pitcherId: string, half: 'top' | 'bottom'): PitchLog {
  return {
    id,
    inning: { number: 1, half },
    pitchNumber: 1,
    totalPitchNumber: 1,
    pitcherId,
    batterId: 'batter',
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
    batterId: 'batter',
    pitcherId,
    pitches: [pitch(`${id}-pitch`, pitcherId, half)],
    result: 'strikeout',
    rbiCount: 0,
    runnersBeforePlay: { first: null, second: null, third: null },
    runnersAfterPlay: { first: null, second: null, third: null },
    timestamp: 1,
  };
}

function baseGame(): GameState {
  const awayStarters = [
    player('A', 'P'), player('B', 'C'), player('C', '1B'),
    player('A4', '2B'), player('A5', '3B'), player('A6', 'SS'),
    player('A7', 'LF'), player('A8', 'CF'), player('A9', 'RF'),
  ] as GameState['awayTeam']['roster']['starters'];
  const homeStarters = [
    player('H', 'P'), player('H2', 'C'), player('H3', '1B'),
    player('H4', '2B'), player('H5', '3B'), player('H6', 'SS'),
    player('H7', 'LF'), player('H8', 'CF'), player('H9', 'RF'),
  ] as GameState['homeTeam']['roster']['starters'];
  const awayPitch = pitch('p-away', 'A', 'bottom');
  const homePitch = pitch('p-home', 'H', 'top');
  return {
    id: 'game-test', phase: 'live', createdAt: 1, updatedAt: 10,
    metadata: { category: 'practice', tournamentName: '' },
    awayTeam: { name: 'Away', roster: { starters: awayStarters, bench: [player('D', '')] } },
    homeTeam: { name: 'Home', roster: { starters: homeStarters, bench: [] } },
    ballpark: { name: '', fenceDistance: { left: 0, center: 0, right: 0 } },
    inning: { number: 1, half: 'bottom' },
    count: { balls: 0, strikes: 0, outs: 0 },
    runners: { first: null, second: null, third: null },
    currentBatterIndex: { away: 0, home: 0 },
    currentPitcherId: { away: 'A', home: 'H' },
    scoreboard: { innings: [], awayTotal: 0, homeTotal: 0, awayHits: 0, homeHits: 0, awayErrors: 0, homeErrors: 0 },
    pitchLogs: [awayPitch, homePitch],
    atBatLogs: [atBat('ab-away', 'A', 'bottom'), atBat('ab-home', 'H', 'top')],
    pickoffEvents: [
      { id: 'po-away', inning: { number: 1, half: 'bottom' }, pitcherId: 'A', runnerId: 'r', targetBase: 'first', result: 'safe', timestamp: 1 },
      { id: 'po-home', inning: { number: 1, half: 'top' }, pitcherId: 'H', runnerId: 'r', targetBase: 'first', result: 'safe', timestamp: 1 },
    ],
    stolenBaseLogs: [],
    currentAtBat: atBat('current', 'A', 'bottom'),
    totalPitchCount: { away: 1, home: 1 },
    currentPitcherPitchCount: { away: 1, home: 1 },
    pendingAdvancement: null,
    substitutionLogs: [{ id: 'sub', inning: { number: 1, half: 'bottom' }, outs: 0, side: 'away', position: 'P', playerOutId: 'A', playerOutName: 'A', playerInId: 'B', playerInName: 'B', timestamp: 1 }],
    signMissEvents: [
      { id: 'sm-away', inning: { number: 1, half: 'bottom' }, side: 'away', playerId: 'A', playerName: 'A', context: 'pitching', timestamp: 1 },
      { id: 'sm-other-side', inning: { number: 1, half: 'top' }, side: 'home', playerId: 'A', playerName: 'A', context: 'pitching', timestamp: 1 },
      { id: 'sm-fielding', inning: { number: 1, half: 'bottom' }, side: 'away', playerId: 'A', playerName: 'A', context: 'fielding', timestamp: 1 },
    ],
    customPitchTypes: [], isDH: { away: false, home: false },
    undoStack: [{} as GameState['undoStack'] extends (infer U)[] | undefined ? U : never],
    preAdvancementSnapshot: {
      runners: { first: null, second: null, third: null }, count: { balls: 0, strikes: 0, outs: 0 },
      scoreboard: { innings: [], awayTotal: 0, homeTotal: 0, awayHits: 0, homeHits: 0, awayErrors: 0, homeErrors: 0 },
      inning: { number: 1, half: 'bottom' }, currentBatterIndex: { away: 0, home: 0 },
      currentPitcherId: { away: 'A', home: 'H' }, currentAtBat: null, pendingAdvancement: null,
    },
  };
}

const original = baseGame();
const originalSubstitution = JSON.stringify(original.substitutionLogs);
const originalAwayStarterIds = original.awayTeam.roster.starters.map((player) => player.id).join(',');
const first = reassignPitcherRecords(original, {
  logId: 'move-1', side: 'away', fromPitcherId: 'A', toPitcherId: 'B', reason: 'manual_correction', createdAt: 20,
});
assert(original.currentPitcherId.away === 'A', '純粋関数が入力を変更しない');
assert(first.game.currentPitcherId.away === 'B', '現投手を移管する');
assert(first.game.pitchLogs[0].pitcherId === 'B' && first.game.pitchLogs[1].pitcherId === 'H', 'sideを限定してPitchLogを移管する');
assert(first.game.atBatLogs[0].pitcherId === 'B' && first.game.atBatLogs[0].pitches[0].pitcherId === 'B', 'AtBatLogとネストPitchLogを移管する');
assert(first.game.currentAtBat?.pitcherId === 'B' && first.game.currentAtBat.pitches[0].pitcherId === 'B', '進行中打席を移管する');
assert(first.game.pickoffEvents[0].pitcherId === 'B', '牽制記録を移管する');
assert(first.game.signMissEvents[0].playerId === 'B' && first.game.signMissEvents[0].playerName === 'B', '投球サインミスを移管する');
assert(first.game.signMissEvents[1].playerId === 'A' && first.game.signMissEvents[2].playerId === 'A', '別sideと別contextを変更しない');
assert(JSON.stringify(first.game.substitutionLogs) === originalSubstitution, 'SubstitutionLogを変更しない');
assert(first.game.awayTeam.roster.starters[0].position === '' && first.game.awayTeam.roster.starters[1].position === 'P', '非DHのPlayerを移動せずPだけ付け替える');
assert(first.game.awayTeam.roster.starters.map((player) => player.id).join(',') === originalAwayStarterIds, '非DHのstarter ID・順序・人数を変えない');
assert(first.game.undoStack?.length === 0 && first.game.preAdvancementSnapshot === undefined, 'Undoと旧スナップショットを破棄する');
assert(first.log.affectedCounts.currentAtBatPitches === 1 && first.log.affectedCounts.signMissEvents === 1, '移管履歴にフィールド別件数を保存する');

const same = reassignPitcherRecords(first.game, {
  logId: 'move-1', side: 'away', fromPitcherId: 'A', toPitcherId: 'B', reason: 'manual_correction',
});
assert(same.alreadyApplied && same.game === first.game, '同じlogIdを冪等に処理する');

const second = reassignPitcherRecords(first.game, {
  logId: 'move-2', side: 'away', fromPitcherId: 'B', toPitcherId: 'C', reason: 'manual_correction', createdAt: 30,
});
assert(second.game.currentPitcherId.away === 'C' && second.game.pitchLogs[0].pitcherId === 'C', 'A→B→Cを再移管する');
assert(second.game.pitcherReassignmentLogs?.length === 2, '移管履歴を追記する');

const zeroPitch = baseGame();
zeroPitch.pitchLogs = [];
zeroPitch.atBatLogs = [];
zeroPitch.pickoffEvents = [];
zeroPitch.signMissEvents = [];
zeroPitch.currentAtBat = null;
const zeroResult = reassignPitcherRecords(zeroPitch, {
  logId: 'zero', side: 'away', fromPitcherId: 'A', toPitcherId: 'B', reason: 'manual_correction',
});
assert(zeroResult.game.currentPitcherId.away === 'B', '0球の現投手も訂正できる');

const historical = baseGame();
historical.currentPitcherId.away = 'C';
historical.awayTeam.roster.starters[0].position = '';
historical.awayTeam.roster.starters[2].position = 'P';
historical.currentAtBat = null;
const rosterBefore = JSON.stringify(historical.awayTeam.roster);
const historicalResult = reassignPitcherRecords(historical, {
  logId: 'historical', side: 'away', fromPitcherId: 'A', toPitcherId: 'B', reason: 'manual_correction',
});
assert(JSON.stringify(historicalResult.game.awayTeam.roster) === rosterBefore, '過去投手の移管ではロースターを変更しない');

const dh = baseGame();
dh.isDH = { away: true, home: false };
const dhStarterIdsBefore = dh.awayTeam.roster.starters.map((p) => p.id).join(',');
const oldDhPitcher = player('DH-A', 'P');
dh.awayTeam.roster.pitcher = oldDhPitcher;
dh.currentPitcherId.away = oldDhPitcher.id;
dh.pitchLogs = [pitch('dh-pitch', oldDhPitcher.id, 'bottom')];
dh.atBatLogs = [];
dh.currentAtBat = null;
dh.pickoffEvents = [];
dh.signMissEvents = [];
const dhResult = reassignPitcherRecords(dh, {
  logId: 'dh', side: 'away', fromPitcherId: oldDhPitcher.id, toPitcherId: 'D', reason: 'manual_correction',
});
assert(dhResult.game.awayTeam.roster.pitcher?.id === 'D', 'DHの打順外投手を設定する');
assert(!dhResult.game.awayTeam.roster.bench.some((p) => p.id === 'D'), 'DH移管先をbenchから除く');
assert(!dhResult.game.awayTeam.roster.bench.some((p) => p.id === oldDhPitcher.id), '旧仮投手をbenchへ追加しない');
assert(dhResult.game.awayTeam.roster.starters.map((p) => p.id).join(',') === dhStarterIdsBefore, 'DHのstartersを変更しない');

assert(comparePitcherReassignmentLogIdSets(['1'], ['1']).kind === 'in_sync', '同一ログ集合を判定する');
assert(comparePitcherReassignmentLogIdSets(['1'], ['1', '2']).kind === 'cloud_ahead', 'クラウド先行を判定する');
assert(comparePitcherReassignmentLogIdSets(['1', '2'], ['1']).kind === 'local_ahead', '端末先行を判定する');
assert(comparePitcherReassignmentLogIdSets(['1'], ['2']).kind === 'diverged', '分岐を判定する');

console.log('pitcher reassignment verification: OK');
