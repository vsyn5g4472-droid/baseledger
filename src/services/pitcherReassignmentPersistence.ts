import { db as localDb } from '../db';
import type { GameState } from '../types/game';
import {
  commitPitcherReassignmentToCloud,
  fetchOwnedGameFromServer,
  stripGameMetadata,
  verifyPitcherReassignmentOnCloud,
  type CloudCommitResult,
  type SavedGame,
} from './gameService';
import {
  comparePitcherReassignmentLogIdSets,
  reassignPitcherRecords,
  type PitcherReassignmentInput,
} from './pitcherReassignmentService';

export type LocalPutResult =
  | { kind: 'applied'; game: GameState }
  | { kind: 'not_applied' }
  | { kind: 'unknown_local_state'; error: unknown };

export type FinishedPitcherReassignmentResult =
  | { kind: 'success'; game: GameState; storage: 'cloud_and_local' | 'local_only' }
  | { kind: 'already_applied'; game: GameState }
  | { kind: 'conflict_remote_changed'; remoteUpdatedAt: number }
  | { kind: 'conflict_log_state'; relation: 'cloud_ahead' | 'local_ahead' | 'diverged' }
  | { kind: 'conflict_doc_missing' | 'conflict_not_owner' }
  | { kind: 'cloud_ok_local_failed'; cloudGame: SavedGame; logId: string }
  | { kind: 'unknown_local_state'; error: unknown; logId: string }
  | { kind: 'cloud_state_undeterminable'; error: unknown }
  | { kind: 'cloud_commit_failed'; error: unknown }
  | { kind: 'local_save_failed'; error: unknown };

function hasLog(game: GameState | undefined, logId: string): game is GameState {
  return !!game?.pitcherReassignmentLogs?.some((log) => log.id === logId);
}

/** AsyncStorageの部分成功を、再読込した移管ログIDで判定する。 */
export async function safeLocalGamePut(game: GameState, logId: string): Promise<LocalPutResult> {
  try {
    await localDb.games.put(game);
    return { kind: 'applied', game };
  } catch (error) {
    try {
      const reread = await localDb.games.get(game.id);
      return hasLog(reread, logId)
        ? { kind: 'applied', game: reread }
        : { kind: 'not_applied' };
    } catch (readError) {
      return { kind: 'unknown_local_state', error: readError ?? error };
    }
  }
}

function localResultAfterCloud(
  local: LocalPutResult,
  cloudGame: SavedGame,
  logId: string,
): FinishedPitcherReassignmentResult {
  if (local.kind === 'applied') return { kind: 'success', game: local.game, storage: 'cloud_and_local' };
  // クラウド側の成功は確定済み。端末結果が失敗・不明のどちらでも
  // クラウド正本を保持し、明示的な復旧導線へ送る。
  return { kind: 'cloud_ok_local_failed', cloudGame, logId };
}

function committedCloudSnapshot(next: GameState, ownerId: string): SavedGame {
  return { ...next, ownerId, savedAt: Date.now() };
}

/** 終了試合の移管。所有済みクラウド試合ではクラウドを先に確定させる。 */
export async function reassignFinishedGamePitcher(
  gameId: string,
  input: PitcherReassignmentInput,
  userId?: string,
): Promise<FinishedPitcherReassignmentResult> {
  const before = await localDb.games.get(gameId);
  if (!before) throw new Error('端末の試合データが見つかりません。');
  const reassigned = reassignPitcherRecords(before, input);
  if (reassigned.alreadyApplied) return { kind: 'already_applied', game: before };
  const next = reassigned.game;

  const lookup = userId
    ? await fetchOwnedGameFromServer(gameId, userId)
    : { kind: 'confirmed_no_owned_doc' as const };
  if (lookup.kind === 'undeterminable') {
    return { kind: 'cloud_state_undeterminable', error: lookup.error };
  }

  if (lookup.kind === 'confirmed_no_owned_doc') {
    const local = await safeLocalGamePut(next, input.logId);
    if (local.kind === 'applied') return { kind: 'success', game: local.game, storage: 'local_only' };
    if (local.kind === 'unknown_local_state') return { ...local, logId: input.logId };
    return { kind: 'local_save_failed', error: new Error('端末へ保存できませんでした。') };
  }

  // updatedAt が偶然一致しても、移管履歴が片側先行・分岐している状態を上書きしない。
  // cloud_ahead は UI で全試合置換を明示確認してから解消する。
  const logRelation = comparePitcherReassignmentLogIdSets(
    (before.pitcherReassignmentLogs ?? []).map((log) => log.id),
    (lookup.game.pitcherReassignmentLogs ?? []).map((log) => log.id),
  );
  if (logRelation.kind !== 'in_sync') {
    return { kind: 'conflict_log_state', relation: logRelation.kind };
  }

  let cloudResult: CloudCommitResult;
  try {
    cloudResult = await commitPitcherReassignmentToCloud(
      next,
      input.logId,
      before.updatedAt,
      userId!,
    );
  } catch (error) {
    const verification = await verifyPitcherReassignmentOnCloud(gameId, input.logId, userId!);
    if (verification.kind === 'log_found') {
      const authoritative = stripGameMetadata(verification.cloudGame);
      const local = await safeLocalGamePut(authoritative, input.logId);
      return localResultAfterCloud(local, verification.cloudGame, input.logId);
    }
    if (verification.kind === 'undeterminable') {
      return { kind: 'cloud_state_undeterminable', error: verification.error };
    }
    return { kind: 'cloud_commit_failed', error };
  }

  if (cloudResult.kind === 'conflict_remote_changed') return cloudResult;
  if (cloudResult.kind === 'conflict_doc_missing' || cloudResult.kind === 'conflict_not_owner') {
    return cloudResult;
  }
  if (cloudResult.kind === 'already_applied') {
    const authoritative = stripGameMetadata(cloudResult.cloudGame);
    const local = await safeLocalGamePut(authoritative, input.logId);
    if (local.kind === 'applied') return { kind: 'already_applied', game: local.game };
    return localResultAfterCloud(local, cloudResult.cloudGame, input.logId);
  }

  const local = await safeLocalGamePut(next, input.logId);
  return localResultAfterCloud(local, committedCloudSnapshot(next, lookup.game.ownerId), input.logId);
}

export async function applyCloudPitcherReassignmentToLocal(
  cloudGame: SavedGame,
  expectedLogId: string,
): Promise<LocalPutResult> {
  return safeLocalGamePut(stripGameMetadata(cloudGame), expectedLogId);
}
