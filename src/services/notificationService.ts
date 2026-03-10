import {
  doc,
  collection,
  addDoc,
  getDoc,
  getDocs,
  updateDoc,
  query,
  where,
  orderBy,
  limit as fbLimit,
  startAfter,
  onSnapshot,
  writeBatch,
  Timestamp,
  QueryDocumentSnapshot,
  DocumentData,
  QueryConstraint,
  getCountFromServer,
} from 'firebase/firestore';
import { db, COLLECTIONS } from './firebase';
import {
  Notification,
  NotificationType,
  NotificationData,
  PaginatedResult,
  AppError,
} from '../models/types';

/**
 * Create a notification for a user.
 * @param userId - Recipient user ID
 * @param type - Notification type
 * @param fromUserId - ID of the user who triggered the notification (null for system)
 * @param data - Additional notification data
 */
export async function createNotification(
  userId: string,
  type: NotificationType,
  fromUserId: string | null,
  data: NotificationData,
): Promise<void> {
  try {
    // Don't notify yourself
    if (fromUserId && fromUserId === userId) return;

    const notifData = {
      userId,
      type,
      fromUserId,
      data,
      read: false,
      createdAt: Timestamp.now(),
    };
    await addDoc(collection(db, COLLECTIONS.NOTIFICATIONS), notifData);
  } catch (error) {
    throw new AppError('NETWORK', `Failed to create notification: ${(error as Error).message}`);
  }
}

/**
 * Get a user's notifications with pagination.
 * @param userId - User whose notifications to fetch
 * @param lastDoc - Cursor for pagination
 * @param pageLimit - Number of results per page
 */
export async function getNotifications(
  userId: string,
  lastDoc?: unknown,
  pageLimit: number = 20,
): Promise<PaginatedResult<Notification>> {
  try {
    const notifsRef = collection(db, COLLECTIONS.NOTIFICATIONS);
    const constraints: any[] = [
      where('userId', '==', userId),
      orderBy('createdAt', 'desc'),
      fbLimit(pageLimit + 1),
    ];

    if (lastDoc) {
      constraints.splice(2, 0, startAfter(lastDoc as QueryDocumentSnapshot<DocumentData>));
    }

    const q = query(notifsRef, ...(constraints as any[]));
    const snap = await getDocs(q);
    const docs = snap.docs;
    const hasMore = docs.length > pageLimit;
    const items = docs.slice(0, pageLimit).map((d) => ({
      id: d.id,
      ...d.data(),
    })) as Notification[];

    return {
      items,
      lastDoc: docs.length > 0 ? docs[Math.min(docs.length - 1, pageLimit - 1)] : null,
      hasMore,
    };
  } catch (error) {
    throw new AppError('NETWORK', `Failed to get notifications: ${(error as Error).message}`);
  }
}

/**
 * Mark a single notification as read.
 * @param notificationId - Notification document ID
 */
export async function markAsRead(notificationId: string): Promise<void> {
  try {
    await updateDoc(doc(db, COLLECTIONS.NOTIFICATIONS, notificationId), {
      read: true,
    });
  } catch (error) {
    throw new AppError('NETWORK', `Failed to mark notification as read: ${(error as Error).message}`);
  }
}

/**
 * Mark all of a user's notifications as read.
 * @param userId - User whose notifications to mark as read
 */
export async function markAllAsRead(userId: string): Promise<void> {
  try {
    const notifsRef = collection(db, COLLECTIONS.NOTIFICATIONS);
    const q = query(
      notifsRef,
      where('userId', '==', userId),
      where('read', '==', false),
    );
    const snap = await getDocs(q);

    if (snap.empty) return;

    const batch = writeBatch(db);
    snap.docs.forEach((d) => {
      batch.update(d.ref, { read: true });
    });
    await batch.commit();
  } catch (error) {
    throw new AppError('NETWORK', `Failed to mark all as read: ${(error as Error).message}`);
  }
}

/**
 * Get the count of unread notifications for a user.
 * @param userId - User ID
 */
export async function getUnreadCount(userId: string): Promise<number> {
  try {
    const notifsRef = collection(db, COLLECTIONS.NOTIFICATIONS);
    const q = query(
      notifsRef,
      where('userId', '==', userId),
      where('read', '==', false),
    );
    const snap = await getCountFromServer(q);
    return snap.data().count;
  } catch (error) {
    throw new AppError('NETWORK', `Failed to get unread count: ${(error as Error).message}`);
  }
}

/**
 * Real-time listener for a user's notifications.
 * @param userId - User ID to listen for
 * @param callback - Called with updated notifications list
 * @returns Unsubscribe function
 */
export function onNotificationsUpdate(
  userId: string,
  callback: (notifications: Notification[]) => void,
): () => void {
  const notifsRef = collection(db, COLLECTIONS.NOTIFICATIONS);
  const q = query(
    notifsRef,
    where('userId', '==', userId),
    orderBy('createdAt', 'desc'),
    fbLimit(50),
  );

  return onSnapshot(q, (snap) => {
    const notifications = snap.docs.map((d) => ({
      id: d.id,
      ...d.data(),
    })) as Notification[];
    callback(notifications);
  });
}
