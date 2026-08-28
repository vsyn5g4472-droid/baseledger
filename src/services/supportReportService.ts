import { addDoc, collection, Timestamp } from 'firebase/firestore';
import { db } from './firebase';

export type SupportReportCategory = 'bug' | 'feature' | 'other';

const CATEGORY_LABELS: Record<SupportReportCategory, string> = {
  bug: 'バグ',
  feature: '機能要望',
  other: 'その他',
};

export async function submitSupportReport(params: {
  userId: string;
  displayName: string;
  email: string;
  category: SupportReportCategory;
  message: string;
  appVersion: string;
  platform: string;
}): Promise<void> {
  await addDoc(collection(db, 'supportReports'), {
    userId: params.userId,
    displayName: params.displayName,
    email: params.email,
    category: params.category,
    categoryLabel: CATEGORY_LABELS[params.category],
    message: params.message.trim(),
    appVersion: params.appVersion,
    platform: params.platform,
    createdAt: Timestamp.now(),
  });
}
