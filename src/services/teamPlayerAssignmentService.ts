import {
  collection,
  doc,
  getDocs,
  setDoc,
  deleteDoc,
  Timestamp,
} from 'firebase/firestore';
import { db, COLLECTIONS } from './firebase';
import type { TeamPlayerAssignment } from '../models/types';
import { AppError } from '../models/types';

function assignmentsRef(teamId: string) {
  return collection(db, COLLECTIONS.TEAMS, teamId, COLLECTIONS.TEAM_PLAYER_ASSIGNMENTS);
}

/** 選手名をドキュメント ID 用に正規化（試合ごとに playerId が異なっても名前で再利用） */
export function teamAssignmentDocId(playerName: string): string {
  return `pn_${playerName.trim().replace(/[/\\]/g, '_')}`;
}

export async function getTeamPlayerAssignments(
  teamId: string,
): Promise<TeamPlayerAssignment[]> {
  try {
    const snap = await getDocs(assignmentsRef(teamId));
    return snap.docs.map((d) => ({ ...d.data(), playerId: d.data().playerId ?? d.id }) as TeamPlayerAssignment);
  } catch (error) {
    throw new AppError('NETWORK', `紐付けの取得に失敗しました: ${(error as Error).message}`);
  }
}

export async function saveTeamPlayerAssignment(
  teamId: string,
  assignment: Omit<TeamPlayerAssignment, 'updatedAt'>,
): Promise<void> {
  try {
    const docId = teamAssignmentDocId(assignment.playerName);
    const ref = doc(db, COLLECTIONS.TEAMS, teamId, COLLECTIONS.TEAM_PLAYER_ASSIGNMENTS, docId);
    await setDoc(ref, {
      ...assignment,
      playerId: docId,
      updatedAt: Timestamp.now(),
    });
  } catch (error) {
    throw new AppError('NETWORK', `紐付けの保存に失敗しました: ${(error as Error).message}`);
  }
}

export async function saveTeamPlayerAssignments(
  teamId: string,
  assignments: Omit<TeamPlayerAssignment, 'updatedAt'>[],
): Promise<void> {
  await Promise.all(assignments.map((a) => saveTeamPlayerAssignment(teamId, a)));
}

export async function deleteTeamPlayerAssignment(
  teamId: string,
  playerName: string,
): Promise<void> {
  try {
    const docId = teamAssignmentDocId(playerName);
    await deleteDoc(doc(db, COLLECTIONS.TEAMS, teamId, COLLECTIONS.TEAM_PLAYER_ASSIGNMENTS, docId));
  } catch (error) {
    throw new AppError('NETWORK', `紐付けの削除に失敗しました: ${(error as Error).message}`);
  }
}

/** チーム紐付けを選手名で検索 */
export function findAssignmentByPlayerName(
  assignments: TeamPlayerAssignment[],
  playerName: string,
): TeamPlayerAssignment | undefined {
  const normalized = playerName.trim();
  return assignments.find((a) => a.playerName.trim() === normalized);
}
