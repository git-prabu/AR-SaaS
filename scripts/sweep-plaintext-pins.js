#!/usr/bin/env node
// scripts/sweep-plaintext-pins.js
// ═══════════════════════════════════════════════════════════════════════
// ONE-TIME SECURITY SWEEP — remove legacy plaintext staff PINs.
// ═══════════════════════════════════════════════════════════════════════
//
// Background (2026-06-11 production-readiness audit, issue #5):
//   /api/staff/login hashes PINs with bcrypt and lazily migrates legacy
//   plaintext `pin` fields the first time that staff member logs in.
//   Staff who haven't logged in since the hashing change still carry a
//   plaintext `pin` in their Firestore doc — readable by anyone with DB
//   access (owner, superadmin, a leaked backup).
//
// WHAT THIS DOES, for every restaurant's staff subcollection:
//   - doc has plaintext `pin` and NO `pinHash`  → bcrypt-hash it into
//     pinHash, then DELETE the plaintext field
//   - doc has BOTH `pin` and `pinHash`          → trust the existing
//     hash, just DELETE the plaintext field
//   - doc has only `pinHash`                    → already clean, skip
//   - doc has NEITHER                           → reported (staff can't
//     log in at all; owner should reset their PIN from /admin/staff)
//
// HOW TO RUN (from repo root):
//   Dry run (no writes):   node scripts/sweep-plaintext-pins.js
//   Apply:                 node scripts/sweep-plaintext-pins.js --apply
//
// CREDENTIALS: reads FIREBASE_ADMIN_PROJECT_ID / CLIENT_EMAIL /
//   PRIVATE_KEY from .env.local (same trio lib/firebaseAdmin.js uses),
//   falling back to GOOGLE_APPLICATION_CREDENTIALS if set.
//
// SAFETY: idempotent — re-running finds nothing left to do. Never
//   changes pinHash on docs that already have one (an existing hash is
//   the one staff actually log in with).

const path = require('path');
try { require('dotenv').config({ path: path.join(__dirname, '..', '.env.local') }); } catch {}

const admin = require('firebase-admin');
const bcrypt = require('bcryptjs');

if (process.env.FIREBASE_ADMIN_PROJECT_ID && process.env.FIREBASE_ADMIN_PRIVATE_KEY) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_ADMIN_PROJECT_ID,
      clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_ADMIN_PRIVATE_KEY.replace(/\\n/g, '\n'),
    }),
  });
} else if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
  admin.initializeApp();
} else {
  console.error('ERROR: no Firebase admin credentials found.');
  console.error('Set FIREBASE_ADMIN_* in .env.local or GOOGLE_APPLICATION_CREDENTIALS.');
  process.exit(1);
}

const db = admin.firestore();
const APPLY = process.argv.includes('--apply');

async function main() {
  console.log('═══════════════════════════════════════════════════');
  console.log(`Plaintext PIN sweep — ${APPLY ? 'LIVE MODE (writing)' : 'DRY RUN (no writes)'}`);
  console.log('═══════════════════════════════════════════════════\n');

  const restaurants = await db.collection('restaurants').get();
  let hashedAndCleaned = 0, cleanedOnly = 0, alreadyClean = 0, noCredentials = 0;

  for (const r of restaurants.docs) {
    const staff = await r.ref.collection('staff').get();
    for (const s of staff.docs) {
      const d = s.data();
      const label = `${r.id}/staff/${s.id} (${d.name || d.username || 'unnamed'})`;

      if (!d.pin && d.pinHash) { alreadyClean++; continue; }

      if (!d.pin && !d.pinHash) {
        noCredentials++;
        console.log(`  ⚠ NO PIN AT ALL: ${label} — owner must reset from /admin/staff`);
        continue;
      }

      if (d.pin && d.pinHash) {
        cleanedOnly++;
        console.log(`  ${APPLY ? '✓' : '→'} delete stray plaintext pin (hash already present): ${label}`);
        if (APPLY) {
          await s.ref.update({ pin: admin.firestore.FieldValue.delete() });
        }
        continue;
      }

      // plaintext only → hash it, then delete the plaintext
      hashedAndCleaned++;
      console.log(`  ${APPLY ? '✓' : '→'} hash + delete plaintext pin: ${label}`);
      if (APPLY) {
        const pinHash = await bcrypt.hash(String(d.pin), 10);
        await s.ref.update({
          pinHash,
          pin: admin.firestore.FieldValue.delete(),
          migratedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      }
    }
  }

  console.log('\n═══ Summary ═══');
  console.log(`  restaurants scanned:        ${restaurants.size}`);
  console.log(`  hashed + plaintext removed: ${hashedAndCleaned}`);
  console.log(`  plaintext removed (had hash): ${cleanedOnly}`);
  console.log(`  already clean:              ${alreadyClean}`);
  console.log(`  missing any credential:     ${noCredentials}`);
  if (!APPLY && (hashedAndCleaned + cleanedOnly) > 0) {
    console.log('\nDry run only. Re-run with --apply to write the changes.');
  }
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
