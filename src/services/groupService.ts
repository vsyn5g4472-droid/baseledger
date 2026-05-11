import {
  doc,
  getDoc,
  addDoc,
  updateDoc,
  collection,
  query,
  where,
  orderBy,
  limit as fbLimit,
  getDocs,
  onSnapshot,
  setDoc,
  Timestamp,
  arrayUnion,
} from 'firebase/firestore';
import { db, COLLECTIONS } from './firebase';
import { Group, GroupMessage, GroupMessageType, AppError } from '../models/types';

const GROUPS_COLLECTION = COLLECTIONS.GROUPS;
const GROUP_MESSAGES_SUBCOLLECTION = COLLECTIONS.GROUP_MESSAGES;

/**
 * Create a group chat linked to a team.
 */
export async function createGroup(
  teamId: string,
  name: string,
  description: string,
  memberIds: string[],
  photoURL: string | null = null,
): Promise<Group> {
  try {
    const groupData = {
      teamId,
      name,
      description,
      photoURL,
      memberIds,
      lastMessage: '',
      lastMessageAt: Timestamp.now(),
      lastMessageSenderId: null,
      createdAt: Timestamp.now(),
    };
    const ref = await addDoc(collection(db, GROUPS_COLLECTION), groupData);
    return { id: ref.id, ...groupData } as Group;
  } catch (error) {
    throw new AppError('NETWORK', `Failed to create group: ${(error as Error).message}`);
  }
}

/**
 * Get or create a group for a team (one group per team).
 */
export async function getOrCreateTeamGroup(
  teamId: string,
  teamName: string,
  memberIds: string[],
): Promise<Group> {
  try {
    const groupsRef = collection(db, GROUPS_COLLECTION);
    const q = query(groupsRef, where('teamId', '==', teamId));
    const snap = await getDocs(q);

    if (!snap.empty) {
      const d = snap.docs[0];
      const existing = { id: d.id, ...d.data() } as Group;
      const missing = memberIds.filter((id) => !(existing.memberIds ?? []).includes(id));
      if (missing.length > 0) {
        await updateDoc(doc(db, GROUPS_COLLECTION, d.id), {
          memberIds: arrayUnion(...missing),
        });
        return { ...existing, memberIds: [...(existing.memberIds ?? []), ...missing] };
      }
      return existing;
    }

    return createGroup(teamId, teamName, '', memberIds);
  } catch (error) {
    throw new AppError('NETWORK', `Failed to get/create team group: ${(error as Error).message}`);
  }
}

/**
 * Get all groups a user is a member of, ordered by most recent message.
 */
export async function getGroupsForUser(userId: string): Promise<Group[]> {
  try {
    const groupsRef = collection(db, GROUPS_COLLECTION);
    const q = query(
      groupsRef,
      where('memberIds', 'array-contains', userId),
      orderBy('lastMessageAt', 'desc'),
    );
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({ id: d.id, ...d.data() })) as Group[];
  } catch (error) {
    throw new AppError('NETWORK', `Failed to get groups: ${(error as Error).message}`);
  }
}

/**
 * Send a message to a group.
 */
export async function sendGroupMessage(
  groupId: string,
  senderId: string,
  senderName: string,
  content: string,
  type: GroupMessageType = 'text',
  opts?: { scheduleDate?: string | null; mediaURLs?: string[] },
): Promise<GroupMessage> {
  try {
    const messageData: Omit<GroupMessage, 'id'> = {
      senderId,
      senderName,
      content,
      type,
      scheduleDate: opts?.scheduleDate ?? null,
      mediaURLs: opts?.mediaURLs ?? [],
      createdAt: Timestamp.now(),
      readBy: [senderId],
    };

    const messagesRef = collection(db, GROUPS_COLLECTION, groupId, GROUP_MESSAGES_SUBCOLLECTION);
    const msgRef = await addDoc(messagesRef, messageData);

    await updateDoc(doc(db, GROUPS_COLLECTION, groupId), {
      lastMessage: type === 'schedule' ? `📅 ${content}` : content,
      lastMessageAt: Timestamp.now(),
      lastMessageSenderId: senderId,
    });

    return { id: msgRef.id, ...messageData };
  } catch (error) {
    throw new AppError('NETWORK', `Failed to send group message: ${(error as Error).message}`);
  }
}

/**
 * Real-time listener for group messages (newest 100, ordered ascending).
 */
export function onGroupMessagesUpdate(
  groupId: string,
  callback: (messages: GroupMessage[]) => void,
  onError?: (error: Error) => void,
): () => void {
  const messagesRef = collection(db, GROUPS_COLLECTION, groupId, GROUP_MESSAGES_SUBCOLLECTION);
  const q = query(messagesRef, orderBy('createdAt', 'asc'), fbLimit(100));

  return onSnapshot(q, (snap) => {
    const messages = snap.docs.map((d) => ({ id: d.id, ...d.data() })) as GroupMessage[];
    callback(messages);
  }, onError);
}

/**
 * Real-time listener for groups a user belongs to.
 */
export function onUserGroupsUpdate(
  userId: string,
  callback: (groups: Group[]) => void,
  onError?: (error: Error) => void,
): () => void {
  const groupsRef = collection(db, GROUPS_COLLECTION);
  const q = query(
    groupsRef,
    where('memberIds', 'array-contains', userId),
    orderBy('lastMessageAt', 'desc'),
  );

  return onSnapshot(q, (snap) => {
    const groups = snap.docs.map((d) => ({ id: d.id, ...d.data() })) as Group[];
    callback(groups);
  }, onError);
}

/**
 * Post a system message to all groups linked to a team when a score is saved.
 * Call this after addScore() when teamId is present.
 *
 * @param teamId - Team the score belongs to
 * @param playerName - Display name of the player who saved the score
 * @param opponent - Opponent team name
 * @param gameDate - Date of the game (formatted string)
 */
export async function notifyTeamGroupsOfScore(
  teamId: string,
  playerName: string,
  opponent: string,
  gameDate: string,
): Promise<void> {
  try {
    const groupsRef = collection(db, GROUPS_COLLECTION);
    const q = query(groupsRef, where('teamId', '==', teamId));
    const snap = await getDocs(q);

    const content = `⚾ ${playerName} が ${opponent} 戦のスコアを記録しました（${gameDate}）`;

    await Promise.all(
      snap.docs.map((d) =>
        sendGroupMessage(d.id, 'system', 'システム', content, 'system'),
      ),
    );
  } catch {
    // Fire-and-forget; don't throw
  }
}
