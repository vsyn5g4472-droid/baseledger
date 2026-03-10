import {
  doc,
  getDoc,
  addDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  collection,
  query,
  where,
  getDocs,
  arrayUnion,
  arrayRemove,
  Timestamp,
} from 'firebase/firestore';
import { db, COLLECTIONS } from './firebase';
import {
  Team,
  TeamMember,
  CreateTeamInput,
  User,
  AppError,
} from '../models/types';
import { uploadImage } from './storageService';
import { createNotification } from './notificationService';
import { getUser } from './userService';

/**
 * Generate a unique 8-character alphanumeric invite code.
 */
export function generateInviteCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  let code = '';
  for (let i = 0; i < 8; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

/**
 * Create a new team and add the creator as owner.
 * @param ownerId - User ID of the team creator
 * @param input - Team creation input
 */
export async function createTeam(ownerId: string, input: CreateTeamInput): Promise<Team> {
  try {
    let photoURL: string | null = null;
    if (input.photoURI) {
      const path = `teams/${Date.now()}/photo.jpg`;
      photoURL = await uploadImage(input.photoURI, path);
    }

    const teamData = {
      name: input.name,
      description: input.description,
      photoURL,
      ownerId,
      memberIds: [ownerId],
      inviteCode: generateInviteCode(),
      isPrivate: input.isPrivate,
      createdAt: Timestamp.now(),
    };

    const teamRef = await addDoc(collection(db, COLLECTIONS.TEAMS), teamData);

    // Add owner as member in subcollection
    const memberData: TeamMember = {
      userId: ownerId,
      role: 'owner',
      joinedAt: Timestamp.now(),
    };
    await setDoc(
      doc(db, COLLECTIONS.TEAMS, teamRef.id, COLLECTIONS.TEAM_MEMBERS, ownerId),
      memberData,
    );

    return { id: teamRef.id, ...teamData } as Team;
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError('NETWORK', `Failed to create team: ${(error as Error).message}`);
  }
}

/**
 * Get a team by ID.
 * @param teamId - Team document ID
 */
export async function getTeam(teamId: string): Promise<Team> {
  try {
    const snap = await getDoc(doc(db, COLLECTIONS.TEAMS, teamId));
    if (!snap.exists()) {
      throw new AppError('NOT_FOUND', 'Team not found');
    }
    return { id: snap.id, ...snap.data() } as Team;
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError('NETWORK', `Failed to get team: ${(error as Error).message}`);
  }
}

/**
 * Get all teams a user belongs to.
 * @param userId - User ID
 */
export async function getUserTeams(userId: string): Promise<Team[]> {
  try {
    const teamsRef = collection(db, COLLECTIONS.TEAMS);
    const q = query(teamsRef, where('memberIds', 'array-contains', userId));
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({ id: d.id, ...d.data() })) as Team[];
  } catch (error) {
    throw new AppError('NETWORK', `Failed to get user teams: ${(error as Error).message}`);
  }
}

/**
 * Join a team using an invite code.
 * @param userId - User joining the team
 * @param inviteCode - 8-character invite code
 */
export async function joinTeamByCode(userId: string, inviteCode: string): Promise<Team> {
  try {
    const teamsRef = collection(db, COLLECTIONS.TEAMS);
    const q = query(teamsRef, where('inviteCode', '==', inviteCode));
    const snap = await getDocs(q);

    if (snap.empty) {
      throw new AppError('NOT_FOUND', 'Invalid invite code');
    }

    const teamDoc = snap.docs[0];
    const team = { id: teamDoc.id, ...teamDoc.data() } as Team;

    // Check if already a member
    if (team.memberIds.includes(userId)) {
      throw new AppError('VALIDATION', 'Already a member of this team');
    }

    // Add to memberIds array
    await updateDoc(doc(db, COLLECTIONS.TEAMS, team.id), {
      memberIds: arrayUnion(userId),
    });

    // Add member subcollection doc
    const memberData: TeamMember = {
      userId,
      role: 'member',
      joinedAt: Timestamp.now(),
    };
    await setDoc(
      doc(db, COLLECTIONS.TEAMS, team.id, COLLECTIONS.TEAM_MEMBERS, userId),
      memberData,
    );

    return { ...team, memberIds: [...team.memberIds, userId] };
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError('NETWORK', `Failed to join team: ${(error as Error).message}`);
  }
}

/**
 * Send a team invite notification to a user.
 * @param teamId - Team to invite to
 * @param userId - User to invite
 * @param inviterId - User sending the invite
 */
export async function inviteToTeam(
  teamId: string,
  userId: string,
  inviterId: string,
): Promise<void> {
  try {
    await createNotification(userId, 'teamInvite', inviterId, { teamId });
  } catch (error) {
    throw new AppError('NETWORK', `Failed to send invite: ${(error as Error).message}`);
  }
}

/**
 * Leave a team. The owner cannot leave — they must transfer ownership first.
 * @param teamId - Team to leave
 * @param userId - User leaving
 */
export async function leaveTeam(teamId: string, userId: string): Promise<void> {
  try {
    const team = await getTeam(teamId);

    if (team.ownerId === userId) {
      throw new AppError('VALIDATION', 'Team owner cannot leave. Transfer ownership first.');
    }

    if (!team.memberIds.includes(userId)) {
      throw new AppError('VALIDATION', 'Not a member of this team');
    }

    // Remove from memberIds
    await updateDoc(doc(db, COLLECTIONS.TEAMS, teamId), {
      memberIds: arrayRemove(userId),
    });

    // Remove member subcollection doc
    await deleteDoc(doc(db, COLLECTIONS.TEAMS, teamId, COLLECTIONS.TEAM_MEMBERS, userId));
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError('NETWORK', `Failed to leave team: ${(error as Error).message}`);
  }
}

/**
 * Remove a member from a team. Only admins/owners can remove members.
 * @param teamId - Team ID
 * @param memberId - Member to remove
 * @param adminId - Admin performing the removal
 */
export async function removeMember(
  teamId: string,
  memberId: string,
  adminId: string,
): Promise<void> {
  try {
    // Check admin permissions
    const adminMemberSnap = await getDoc(
      doc(db, COLLECTIONS.TEAMS, teamId, COLLECTIONS.TEAM_MEMBERS, adminId),
    );
    if (!adminMemberSnap.exists()) {
      throw new AppError('FORBIDDEN', 'Not a member of this team');
    }

    const adminRole = (adminMemberSnap.data() as TeamMember).role;
    if (adminRole !== 'owner' && adminRole !== 'admin') {
      throw new AppError('FORBIDDEN', 'Only owners and admins can remove members');
    }

    // Cannot remove the owner
    const team = await getTeam(teamId);
    if (memberId === team.ownerId) {
      throw new AppError('FORBIDDEN', 'Cannot remove the team owner');
    }

    // Remove from memberIds
    await updateDoc(doc(db, COLLECTIONS.TEAMS, teamId), {
      memberIds: arrayRemove(memberId),
    });

    // Remove member subcollection doc
    await deleteDoc(doc(db, COLLECTIONS.TEAMS, teamId, COLLECTIONS.TEAM_MEMBERS, memberId));
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError('NETWORK', `Failed to remove member: ${(error as Error).message}`);
  }
}

/**
 * Get all team members with their user profile data.
 * @param teamId - Team ID
 */
export async function getTeamMembers(
  teamId: string,
): Promise<(TeamMember & { user: User })[]> {
  try {
    const membersRef = collection(db, COLLECTIONS.TEAMS, teamId, COLLECTIONS.TEAM_MEMBERS);
    const snap = await getDocs(membersRef);

    const results: (TeamMember & { user: User })[] = [];
    for (const memberDoc of snap.docs) {
      const member = memberDoc.data() as TeamMember;
      try {
        const user = await getUser(member.userId);
        results.push({ ...member, user });
      } catch {
        // Skip members whose user doc doesn't exist
      }
    }

    return results;
  } catch (error) {
    throw new AppError('NETWORK', `Failed to get team members: ${(error as Error).message}`);
  }
}

/**
 * Update team information. Only the owner or admins can update.
 * @param teamId - Team ID
 * @param data - Fields to update
 */
export async function updateTeam(
  teamId: string,
  data: Partial<Pick<Team, 'name' | 'description' | 'photoURL' | 'isPrivate'>>,
): Promise<void> {
  try {
    await updateDoc(doc(db, COLLECTIONS.TEAMS, teamId), data);
  } catch (error) {
    throw new AppError('NETWORK', `Failed to update team: ${(error as Error).message}`);
  }
}
