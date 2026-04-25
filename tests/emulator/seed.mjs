/**
 * Emulator 用テストデータ投入スクリプト。
 *
 * Admin SDK 経由で、以下のユーザーと AI 利用カウンタを準備します:
 *   - test-free            : FREE     （AI 利用不可）
 *   - test-light           : LIGHT    （通常利用）
 *   - test-light-exhausted : LIGHT    （本日の利用枠を使い切った状態）
 *   - test-pro             : PRO      （最上位）
 *
 * 先に `npm --prefix tests/emulator install` を実行してから、
 *   FIREBASE_AUTH_EMULATOR_HOST=localhost:9099 \
 *   FIRESTORE_EMULATOR_HOST=localhost:8080 \
 *   GCLOUD_PROJECT=demo-baseledger \
 *   node seed.mjs
 * で実行します。
 */

import admin from 'firebase-admin';

const PROJECT_ID = process.env.GCLOUD_PROJECT || 'demo-baseledger';
const DAILY_LIMIT = 20;

process.env.FIRESTORE_EMULATOR_HOST   ||= 'localhost:8080';
process.env.FIREBASE_AUTH_EMULATOR_HOST ||= 'localhost:9099';
process.env.GCLOUD_PROJECT            = PROJECT_ID;

admin.initializeApp({ projectId: PROJECT_ID });

const auth = admin.auth();
const db   = admin.firestore();

/** JST 日付 (YYYY-MM-DD) */
function todayJST() {
  return new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Tokyo' });
}

const USERS = [
  { uid: 'test-free',             email: 'free@test.local',             plan: 'free'  },
  { uid: 'test-light',            email: 'light@test.local',            plan: 'light' },
  { uid: 'test-light-exhausted',  email: 'light-exhausted@test.local',  plan: 'light' },
  { uid: 'test-pro',              email: 'pro@test.local',              plan: 'pro'   },
];

async function upsertAuthUser(u) {
  try {
    await auth.getUser(u.uid);
    await auth.updateUser(u.uid, { email: u.email, password: 'password' });
  } catch {
    await auth.createUser({ uid: u.uid, email: u.email, password: 'password' });
  }
}

async function main() {
  console.log(`[seed] project=${PROJECT_ID}`);

  for (const u of USERS) {
    await upsertAuthUser(u);
    await db.collection('users').doc(u.uid).set(
      {
        uid:       u.uid,
        email:     u.email,
        plan:      u.plan,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
    console.log(`  ↪ user: ${u.uid} (${u.plan})`);
  }

  // test-light-exhausted の本日分を上限まで使った状態にセット
  const exhaustedDocId = `test-light-exhausted_${todayJST()}`;
  await db.collection('aiUsageDaily').doc(exhaustedDocId).set({
    uid:       'test-light-exhausted',
    day:       todayJST(),
    count:     DAILY_LIMIT,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });
  console.log(`  ↪ aiUsageDaily/${exhaustedDocId}.count = ${DAILY_LIMIT}`);

  console.log('[seed] done');
  process.exit(0);
}

main().catch((err) => {
  console.error('[seed] failed:', err);
  process.exit(1);
});
