// scripts/firestore-restore.js
//
// Manual restore script for emergencies. Reads a backup JSON produced by
// /api/cron/firestore-backup and writes the documents back to Firestore.
//
// THIS IS DESTRUCTIVE. It can overwrite live data with a stale backup.
// Defaults to DRY-RUN mode — prints what it would do, doesn't write.
// Pass `--apply` to actually write. Pass `--collection <name>` to restore
// just one top-level collection (e.g. just `users` after a bad delete).
//
// Usage from a fresh terminal in the project folder:
//
//   # 1. Get a backup file. Either download from Cloud Storage or fetch
//   #    via gsutil:
//   #      gsutil cp gs://<bucket>/backups/2026-04-28-05-00-full.json .
//   #
//   # 2. Dry-run inspection:
//   #      node scripts/firestore-restore.js ./2026-04-28-05-00-full.json
//   #
//   # 3. Restore one collection if a real disaster happens:
//   #      node scripts/firestore-restore.js ./2026-04-28-05-00-full.json --collection users --apply
//   #
//   # 4. Full restore (last resort — will overwrite EVERYTHING):
//   #      node scripts/firestore-restore.js ./2026-04-28-05-00-full.json --all --apply
//
// Auth: uses the same FIREBASE_ADMIN_* env vars as the rest of the
// project. Run from a machine where these are set (your dev box with
// .env.local, or a CI runner with the secrets).

const fs    = require('fs');
const path  = require('path');
const admin = require('firebase-admin');

// Load .env.local manually — avoids adding `dotenv` as a dependency just
// for an emergency-only script. Falls back to whatever's already in
// process.env when .env.local isn't there (e.g., running on a CI runner
// with the secrets as native env vars).
try {
  const envPath = path.join(__dirname, '..', '.env.local');
  if (fs.existsSync(envPath)) {
    const envText = fs.readFileSync(envPath, 'utf8');
    for (const rawLine of envText.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith('#')) continue;
      const eq = line.indexOf('=');
      if (eq === -1) continue;
      const key = line.slice(0, eq).trim();
      let val = line.slice(eq + 1).trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      if (!process.env[key]) process.env[key] = val;
    }
  }
} catch (err) {
  console.warn('Could not load .env.local:', err.message);
}

// ── CLI args ──────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
if (args.length < 1 || args.includes('--help')) {
  console.log('Usage: node scripts/firestore-restore.js <backup.json> [--collection <name>] [--all] [--apply]');
  process.exit(1);
}
const backupPath  = args[0];
const apply       = args.includes('--apply');
const restoreAll  = args.includes('--all');
const colIdx      = args.indexOf('--collection');
const onlyCollection = colIdx !== -1 ? args[colIdx + 1] : null;

if (!apply) {
  console.log('━━━ DRY RUN ━━━ (pass --apply to actually write)');
}
if (!restoreAll && !onlyCollection) {
  console.error('Error: pass --collection <name> OR --all to choose what to restore.');
  process.exit(1);
}

// ── Read backup ───────────────────────────────────────────────────────────
const raw = fs.readFileSync(backupPath, 'utf8');
const backup = JSON.parse(raw);
console.log(`Backup taken at: ${backup.exportedAt}`);
console.log(`Restaurants in backup: ${backup.restaurantCount}`);

// ── Init Firebase Admin ───────────────────────────────────────────────────
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId:   process.env.FIREBASE_ADMIN_PROJECT_ID,
      clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
      privateKey:  String(process.env.FIREBASE_ADMIN_PRIVATE_KEY || '').replace(/\\n/g, '\n'),
    }),
  });
}
const db = admin.firestore();

// ── Restore helpers ───────────────────────────────────────────────────────

// Convert backup-shape values back into Firestore-native types. Timestamps
// were serialised by the export with __type:'timestamp' + iso — turn them
// back into Firestore Timestamps so range queries on createdAt still work.
function rehydrate(value) {
  if (value == null) return value;
  if (Array.isArray(value)) return value.map(rehydrate);
  if (typeof value === 'object') {
    if (value.__type === 'timestamp' && typeof value.seconds === 'number') {
      return admin.firestore.Timestamp.fromMillis(value.seconds * 1000);
    }
    const out = {};
    for (const [k, v] of Object.entries(value)) out[k] = rehydrate(v);
    return out;
  }
  return value;
}

async function restoreTopLevel(name, docs) {
  console.log(`\n[${name}] ${docs.length} doc(s)`);
  if (!apply) return;
  const batchSize = 400; // Firestore batch limit is 500; keep some headroom.
  for (let i = 0; i < docs.length; i += batchSize) {
    const batch = db.batch();
    for (const d of docs.slice(i, i + batchSize)) {
      const { _id, ...data } = d;
      batch.set(db.collection(name).doc(_id), rehydrate(data));
    }
    await batch.commit();
    process.stdout.write('.');
  }
  process.stdout.write(' done\n');
}

async function restoreRestaurantSubs(rid, subs) {
  console.log(`  → restaurants/${rid}`);
  for (const [subName, docs] of Object.entries(subs)) {
    if (docs.length === 0) continue;
    console.log(`     [${subName}] ${docs.length} doc(s)`);
    if (!apply) continue;
    const batchSize = 400;
    for (let i = 0; i < docs.length; i += batchSize) {
      const batch = db.batch();
      for (const d of docs.slice(i, i + batchSize)) {
        const { _id, ...data } = d;
        batch.set(db.collection('restaurants').doc(rid).collection(subName).doc(_id), rehydrate(data));
      }
      await batch.commit();
    }
  }
}

// ── Run ───────────────────────────────────────────────────────────────────
(async () => {
  try {
    if (onlyCollection) {
      // Restore just one top-level collection.
      const docs = backup.topLevel?.[onlyCollection];
      if (!docs) {
        console.error(`Collection "${onlyCollection}" not found in backup.`);
        console.log('Available top-level collections:', Object.keys(backup.topLevel || {}).join(', '));
        process.exit(1);
      }
      await restoreTopLevel(onlyCollection, docs);
    } else if (restoreAll) {
      // Full restore: top-level then per-restaurant subcollections.
      console.log('\n=== Top-level collections ===');
      for (const [name, docs] of Object.entries(backup.topLevel || {})) {
        await restoreTopLevel(name, docs);
      }
      console.log('\n=== Per-restaurant subcollections ===');
      for (const [rid, subs] of Object.entries(backup.restaurantSubcollections || {})) {
        await restoreRestaurantSubs(rid, subs);
      }
    }
    console.log(apply ? '\n✓ Restore complete.' : '\nDry-run complete. Pass --apply to write.');
    process.exit(0);
  } catch (err) {
    console.error('\nRestore failed:', err);
    process.exit(1);
  }
})();
