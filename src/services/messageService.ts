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
  startAfter,
  getDocs,
  onSnapshot,
  setDoc,
  Timestamp,
  QueryDocumentSnapshot,
  DocumentData,
  QueryConstraint,
  writeBatch,
  arrayUnion,
} from 'firebase/firestore';
import { db, COLLECTIONS } from './firebase';
import {
  Conversation,
  Message,
  PaginatedResult,
  AppError,
} from '../models/types';
import { isMutualFollow } from './followService';
import { createNotification } from './notificationService';

/** Collection name for conversation documents. */
const CONVERSATIONS_COLLECTION = COLLECTIONS.MESSAGES;

/** Subcollection name for individual messages within a conversation. */
const MESSAGES_SUBCOLLECTION = 'messages';

/**
 * Generate a deterministic conversation ID from two user IDs.
 * Sorts alphabetically to ensure consistency regardless of who initiates.
 */
function conversationId(userId1: string, userId2: string): string {
  return [userId1, userId2].sort().join('_');
}

/**
 * Check if two users can message each other (mutual follow required).
 * @param userId1 - First user
 * @param userId2 - Second user
 */
export async function canMessage(userId1: string, userId2: string): Promise<boolean> {
  try {
    return isMutualFollow(userId1, userId2);
  } catch (error) {
    throw new AppError('NETWORK', `Failed to check message permission: ${(error as Error).message}`);
  }
}

/**
 * Get an existing conversation between two users, or create a new one.
 * @param userId1 - First participant
 * @param userId2 - Second participant
 */
export async function getOrCreateConversation(
  userId1: string,
  userId2: string,
): Promise<Conversation> {
  try {
    const convoId = conversationId(userId1, userId2);
    const convoRef = doc(db, CONVERSATIONS_COLLECTION, convoId);
    const snap = await getDoc(convoRef);

    if (snap.exists()) {
      return { id: snap.id, ...snap.data() } as Conversation;
    }

    // Create new conversation
    const participants: [string, string] = [userId1, userId2].sort() as [string, string];
    const convoData = {
      participants,
      lastMessage: '',
      lastMessageAt: Timestamp.now(),
    };

    await setDoc(convoRef, convoData);
    return { id: convoId, ...convoData } as Conversation;
  } catch (error) {
    throw new AppError('NETWORK', `Failed to get/create conversation: ${(error as Error).message}`);
  }
}

/**
 * Send a message in a conversation. Creates the conversation if it doesn't exist.
 * Requires mutual follow.
 * @param senderId - Sender user ID
 * @param receiverId - Receiver user ID
 * @param content - Message text
 */
export async function sendMessage(
  senderId: string,
  receiverId: string,
  content: string,
): Promise<Message> {
  try {
    // Check mutual follow
    const allowed = await canMessage(senderId, receiverId);
    if (!allowed) {
      throw new AppError('FORBIDDEN', 'Both users must follow each other to send messages');
    }

    const conversation = await getOrCreateConversation(senderId, receiverId);

    const messageData = {
      senderId,
      content,
      createdAt: Timestamp.now(),
      readBy: [senderId],
    };

    const messagesRef = collection(
      db,
      CONVERSATIONS_COLLECTION,
      conversation.id,
      MESSAGES_SUBCOLLECTION,
    );
    const msgRef = await addDoc(messagesRef, messageData);

    // Update conversation with last message info
    await updateDoc(doc(db, CONVERSATIONS_COLLECTION, conversation.id), {
      lastMessage: content,
      lastMessageAt: Timestamp.now(),
    });

    // Send DM notification (fire and forget)
    createNotification(receiverId, 'dm', senderId, {
      conversationId: conversation.id,
      message: content.length > 100 ? content.substring(0, 100) + '...' : content,
    }).catch(() => {});

    return { id: msgRef.id, ...messageData } as Message;
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError('NETWORK', `Failed to send message: ${(error as Error).message}`);
  }
}

/**
 * Get a user's conversations sorted by most recent message.
 * @param userId - User ID
 */
export async function getConversations(userId: string): Promise<Conversation[]> {
  try {
    const convosRef = collection(db, CONVERSATIONS_COLLECTION);
    const q = query(
      convosRef,
      where('participants', 'array-contains', userId),
      orderBy('lastMessageAt', 'desc'),
    );
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({ id: d.id, ...d.data() })) as Conversation[];
  } catch (error) {
    throw new AppError('NETWORK', `Failed to get conversations: ${(error as Error).message}`);
  }
}

/**
 * Get messages for a conversation with pagination.
 * @param conversationId - Conversation document ID
 * @param lastDoc - Cursor for pagination
 * @param pageLimit - Number of results per page
 */
export async function getMessages(
  conversationId: string,
  lastDoc?: unknown,
  pageLimit: number = 50,
): Promise<PaginatedResult<Message>> {
  try {
    const messagesRef = collection(
      db,
      CONVERSATIONS_COLLECTION,
      conversationId,
      MESSAGES_SUBCOLLECTION,
    );
    const constraints: any[] = [
      orderBy('createdAt', 'desc'),
      fbLimit(pageLimit + 1),
    ];

    if (lastDoc) {
      constraints.splice(1, 0, startAfter(lastDoc as QueryDocumentSnapshot<DocumentData>));
    }

    const q = query(messagesRef, ...(constraints as any[]));
    const snap = await getDocs(q);
    const docs = snap.docs;
    const hasMore = docs.length > pageLimit;
    const items = docs.slice(0, pageLimit).map((d) => ({
      id: d.id,
      ...d.data(),
    })) as Message[];

    return {
      items,
      lastDoc: docs.length > 0 ? docs[Math.min(docs.length - 1, pageLimit - 1)] : null,
      hasMore,
    };
  } catch (error) {
    throw new AppError('NETWORK', `Failed to get messages: ${(error as Error).message}`);
  }
}

/**
 * Mark all messages in a conversation as read by a user.
 * @param conversationId - Conversation ID
 * @param userId - User marking messages as read
 */
export async function markAsRead(conversationId: string, userId: string): Promise<void> {
  try {
    const messagesRef = collection(
      db,
      CONVERSATIONS_COLLECTION,
      conversationId,
      MESSAGES_SUBCOLLECTION,
    );

    // Get unread messages (those where userId is not in readBy)
    const q = query(messagesRef, orderBy('createdAt', 'desc'), fbLimit(100));
    const snap = await getDocs(q);

    const batch = writeBatch(db);
    let updated = false;

    for (const msgDoc of snap.docs) {
      const data = msgDoc.data() as Message;
      if (!data.readBy.includes(userId)) {
        batch.update(msgDoc.ref, { readBy: arrayUnion(userId) });
        updated = true;
      }
    }

    if (updated) {
      await batch.commit();
    }
  } catch (error) {
    throw new AppError('NETWORK', `Failed to mark as read: ${(error as Error).message}`);
  }
}

/**
 * Real-time listener for messages in a conversation.
 * @param conversationId - Conversation to listen to
 * @param callback - Called with updated messages
 * @returns Unsubscribe function
 */
export function onMessagesUpdate(
  conversationId: string,
  callback: (messages: Message[]) => void,
): () => void {
  const messagesRef = collection(
    db,
    CONVERSATIONS_COLLECTION,
    conversationId,
    MESSAGES_SUBCOLLECTION,
  );
  const q = query(messagesRef, orderBy('createdAt', 'desc'), fbLimit(100));

  return onSnapshot(q, (snap) => {
    const messages = snap.docs.map((d) => ({
      id: d.id,
      ...d.data(),
    })) as Message[];
    callback(messages);
  });
}
