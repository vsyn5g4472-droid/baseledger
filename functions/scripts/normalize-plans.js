#!/usr/bin/env node
/**
 * users コレクションの plan フィールドを正規化するワンショットスクリプト。
 *
 * 新しい Firestore Rules では users/{userId} の create 時に `plan == 'free'` を
 * 強制するため、既存ユーザーで plan が欠損している場合に備え、このスクリプトで
 * 'free' に初期化する。
 *
 * 実行前に以下のいずれかで Admin クレデンシャルを用意してください:
 *   A) GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json
 *   B) firebase-admin が検出できる `gcloud auth application-default login`
 *
 * 使用方法:
 *   # DRY RUN（更新しない、件数だけ表示）
 *   npm --prefix functions run normalize-plans:dry
 *
 *   # 実行（--apply を渡す）
 *   npm --prefix functions run normalize-plans:apply
 */

const admin = require('firebase-admin');

const VALID_PLANS = new Set(['free', 'light', 'standard', 'pro']);

async function main() {
  const isApply = process.argv.includes('--apply');

  if (admin.apps.length === 0) {
    admin.initializeApp();
  }
  const db = admin.firestore();

  console.log(`[normalize-plans] mode: ${isApply ? 'APPLY' : 'DRY RUN'}`);
  const snap = await db.collection('users').get();

  let needUpdate = 0;
  let alreadyValid = 0;
  const batches = [];
  let batch = db.batch();
  let batchOps = 0;

  for (const doc of snap.docs) {
    const data = doc.data();
    const plan = data.plan;
    if (typeof plan === 'string' && VALID_PLANS.has(plan)) {
      alreadyValid++;
      continue;
    }

    needUpdate++;
    console.log(`  ↪ ${doc.id}: plan=${JSON.stringify(plan)} → 'free'`);

    if (isApply) {
      batch.set(doc.ref, { plan: 'free' }, { merge: true });
      batchOps++;
      if (batchOps >= 400) {
        batches.push(batch.commit());
        batch = db.batch();
        batchOps = 0;
      }
    }
  }

  if (isApply && batchOps > 0) batches.push(batch.commit());
  if (batches.length > 0) await Promise.all(batches);

  console.log('\n[normalize-plans] result:');
  console.log(`  total users      : ${snap.size}`);
  console.log(`  already valid    : ${alreadyValid}`);
  console.log(`  ${isApply ? 'updated' : 'would update'} : ${needUpdate}`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
