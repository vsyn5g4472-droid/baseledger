import {
  collection,
  doc,
  addDoc,
  getDoc,
  getDocs,
  updateDoc,
  deleteDoc,
  Timestamp,
} from 'firebase/firestore';
import { db, COLLECTIONS } from './firebase';
import type { TeamPlayer } from '../models/types';

function playersRef(teamId: string) {
  return collection(db, COLLECTIONS.TEAMS, teamId, COLLECTIONS.TEAM_PLAYERS);
}

export async function getTeamPlayers(teamId: string): Promise<TeamPlayer[]> {
  const snap = await getDocs(playersRef(teamId));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() })) as TeamPlayer[];
}

export async function addTeamPlayer(
  teamId: string,
  data: Omit<TeamPlayer, 'id' | 'createdAt'>,
): Promise<TeamPlayer> {
  const ref = await addDoc(playersRef(teamId), { ...data, createdAt: Timestamp.now() });
  const snap = await getDoc(ref);
  return { id: snap.id, ...snap.data() } as TeamPlayer;
}

export async function updateTeamPlayer(
  teamId: string,
  playerId: string,
  data: Partial<Omit<TeamPlayer, 'id' | 'createdAt'>>,
): Promise<void> {
  await updateDoc(doc(db, COLLECTIONS.TEAMS, teamId, COLLECTIONS.TEAM_PLAYERS, playerId), data);
}

export async function deleteTeamPlayer(teamId: string, playerId: string): Promise<void> {
  await deleteDoc(doc(db, COLLECTIONS.TEAMS, teamId, COLLECTIONS.TEAM_PLAYERS, playerId));
}
