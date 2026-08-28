import { doc, getDoc, setDoc, serverTimestamp, collection, query, where, getDocs, limit } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from './firebase';
import { getUsageLimitsWithBonus } from './planService';

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function randomInviteCode(): string {
  let code = '';
  for (let i = 0; i < 8; i++) {
    code += CODE_CHARS.charAt(Math.floor(Math.random() * CODE_CHARS.length));
  }
  return code;
}

/** @deprecated Use getInviteCodeForUser instead */
export function generateInviteCode(userId: string): string {
  return userId.substring(0, 8);
}

export type InviteRedeemResult = {
  applied: boolean;
  message?: string;
};

const INVITE_REASON_MESSAGES: Record<string, string> = {
  device_already_used: 'このデバイスではすでに招待特典を利用済みです',
  own_code: '自分の招待コードは利用できません',
  already_used: 'すでにこの招待コードは利用済みです',
  invite_code_not_found: '招待コードが見つかりません',
  invalid_invite_code: '招待コードが不正です',
  invalid_device_id: 'デバイス情報の取得に失敗しました',
  unauthenticated: 'ログインしてからもう一度お試しください',
};

function inviteErrorMessage(error: unknown): string {
  const e = error as { code?: string; message?: string; details?: { reason?: string } };
  const reason = e?.details?.reason;
  if (reason && INVITE_REASON_MESSAGES[reason]) {
    return INVITE_REASON_MESSAGES[reason];
  }
  if (typeof e?.message === 'string' && e.message.length > 0) {
    return e.message;
  }
  return '招待コードの利用に失敗しました';
}

/**
 * ユーザーの招待コードを取得する。未登録なら Firestore に冪等で作成する。
 */
export async function getInviteCodeForUser(userId: string): Promise<string> {
  const userRef = doc(db, 'users', userId);
  const userSnap = await getDoc(userRef);
  const existing = userSnap.data()?.referralCode as string | undefined;
  if (existing) {
    const codeSnap = await getDoc(doc(db, 'inviteCodes', existing));
    if (codeSnap.exists() && codeSnap.data()?.ownerId === userId) {
      return existing;
    }
  }

  const ownedCodes = await getDocs(
    query(collection(db, 'inviteCodes'), where('ownerId', '==', userId), limit(1)),
  );
  if (!ownedCodes.empty) {
    const code = ownedCodes.docs[0].id;
    await setDoc(userRef, { referralCode: code }, { merge: true });
    return code;
  }

  const legacyCode = userId.substring(0, 8);
  const legacySnap = await getDoc(doc(db, 'inviteCodes', legacyCode));
  if (legacySnap.exists() && legacySnap.data()?.ownerId === userId) {
    await setDoc(userRef, { referralCode: legacyCode }, { merge: true });
    return legacyCode;
  }

  for (let attempt = 0; attempt < 10; attempt++) {
    const code = randomInviteCode();
    const codeRef = doc(db, 'inviteCodes', code);
    const codeSnap = await getDoc(codeRef);
    if (codeSnap.exists()) continue;
    await setDoc(codeRef, {
      ownerId: userId,
      usedBy: [],
      createdAt: serverTimestamp(),
    });
    await setDoc(userRef, { referralCode: code }, { merge: true });
    return code;
  }

  throw new Error('招待コードの生成に失敗しました');
}

/** @alias getInviteCodeForUser */
export async function registerInviteCode(userId: string): Promise<string> {
  return getInviteCodeForUser(userId);
}

/**
 * 招待コードを利用して特典を受け取る。
 * 検証・特典付与はすべて Cloud Functions (redeemInviteCode) 側で行う。
 */
export async function useInviteCode(inviteCode: string, deviceId: string): Promise<InviteRedeemResult> {
  const redeem = httpsCallable<
    { inviteCode: string; deviceId: string },
    { applied: boolean; reason?: string }
  >(functions, 'redeemInviteCode');
  try {
    const { data } = await redeem({ inviteCode: inviteCode.trim(), deviceId });
    if (!data.applied) {
      const message = data.reason
        ? INVITE_REASON_MESSAGES[data.reason] ?? '招待コードを利用できませんでした'
        : '招待コードを利用できませんでした';
      return { applied: false, message };
    }
    return { applied: true };
  } catch (error) {
    return { applied: false, message: inviteErrorMessage(error) };
  }
}

export { getUsageLimitsWithBonus };
