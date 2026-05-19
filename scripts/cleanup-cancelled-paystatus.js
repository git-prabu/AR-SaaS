#!/usr/bin/env node
// scripts/cleanup-cancelled-paystatus.js
//
// One-shot data fix. Pre-fix, the customer page could land a
// paymentStatus='cash_requested' (etc.) on an order whose status had
// already been flipped to 'cancelled' — that combination is no longer
// reachable thanks to the rule fix, but old docs still carry the
// inconsistent state. Resets every cancelled order's paymentStatus
// to 'unpaid' so admin /admin/payments doesn't keep showing them as
// "waiting on payment".

require('dotenv').config({ path: '.env.local' });
const admin = require('firebase-admin');

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId:   process.env.FIREBASE_ADMIN_PROJECT_ID,
      clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
      privateKey:  process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    }),
  });
}
const db = admin.firestore();

async function main() {
  const restSnap = await db.collection('restaurants').get();
  let totalChecked = 0;
  let totalFixed = 0;
  const REQUESTED = new Set(['cash_requested', 'card_requested', 'online_requested']);

  for (const r of restSnap.docs) {
    const ordersSnap = await db.collection(`restaurants/${r.id}/orders`)
      .where('status', '==', 'cancelled')
      .get();
    for (const o of ordersSnap.docs) {
      totalChecked += 1;
      const d = o.data();
      if (REQUESTED.has(d.paymentStatus)) {
        console.log(`Fixing restaurants/${r.id}/orders/${o.id}: ${d.paymentStatus} → unpaid`);
        await o.ref.update({
          paymentStatus: 'unpaid',
          paymentUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
          paymentResetBy: 'cleanup-script',
        });
        totalFixed += 1;
      }
    }
  }
  console.log(`\nChecked ${totalChecked} cancelled order(s). Fixed ${totalFixed}.`);
  process.exit(0);
}

main().catch(err => { console.error('FAILED:', err); process.exit(1); });
