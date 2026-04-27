// pages/api/cron/firestore-backup.js
//
// Weekly Firestore backup. Walks the database, serialises every collection
// + subcollection we care about into a single JSON blob, then uploads it
// to Cloud Storage at `backups/{YYYY-MM-DD-HH-mm}-full.json`.
//
// Why a custom export (vs. Firestore's managed `gcloud firestore export`):
//   - Managed export requires gcloud CLI + a paid GCP project with the
//     correct IAM bindings. Hobby-tier projects without billing can't use
//     it.
//   - Our exports go to the same Storage bucket Firebase already uses, and
//     the JSON format is human-readable for ad-hoc inspection.
//
// Schedule: Sundays at 23:30 UTC (= Mondays 05:00 IST). Runs once a week.
// See vercel.json for the cron config.
//
// Auth: same CRON_SECRET pattern as the daily-summary cron.
//
// Restore: see scripts/firestore-restore.js (companion script — runs from
// the dev's machine, never in production).

import { adminDb, adminStorage } from '../../../lib/firebaseAdmin';

// Top-level collections to export. (Don't include `systemConfig` — keeping
// the sender App Password out of backups by default is safer.)
const TOP_LEVEL_COLLECTIONS = ['users', 'plans', 'requests', 'restaurants'];

// Per-restaurant subcollections to export. Stops at known names so a
// runaway/test subcollection doesn't bloat the backup unexpectedly.
const RESTAURANT_SUBCOLLECTIONS = [
  'menuItems',
  'orders',
  'orderCounters',
  'requests',
  'staff',
  'tableSessions',
  'coupons',
  'offers',
  'combos',
  'feedback',
  'waiterCalls',
  'analytics',
];

export default async function handler(req, res) {
  // Auth — same secret as daily-summary cron.
  const auth = req.headers.authorization || '';
  const expected = process.env.CRON_SECRET;
  if (!expected) return res.status(500).json({ ok: false, error: 'CRON_SECRET not configured.' });
  if (auth !== `Bearer ${expected}`) return res.status(401).json({ ok: false, error: 'Unauthorized.' });

  const startedAt = Date.now();
  const stamp = formatStamp(new Date());
  const filename = `backups/${stamp}-full.json`;

  try {
    // 1. Top-level collections.
    const topLevel = {};
    for (const name of TOP_LEVEL_COLLECTIONS) {
      const snap = await adminDb.collection(name).get();
      topLevel[name] = snap.docs.map(d => ({ _id: d.id, ...d.data() }));
    }

    // 2. Per-restaurant subcollections. Walks the restaurants list (already
    //    fetched above) and reads each named subcollection in parallel for
    //    each restaurant. Reads can run concurrently across subcollections
    //    of one restaurant; we keep restaurants serialised to bound peak
    //    Firestore concurrency on a Hobby tier.
    const restaurantSubs = {}; // { [rid]: { [subname]: [docs] } }
    for (const rDoc of topLevel.restaurants || []) {
      const rid = rDoc._id;
      const subs = {};
      const subSnaps = await Promise.all(
        RESTAURANT_SUBCOLLECTIONS.map(async (sub) => ({
          name: sub,
          snap: await adminDb.collection('restaurants').doc(rid).collection(sub).get(),
        }))
      );
      for (const { name, snap } of subSnaps) {
        subs[name] = snap.docs.map(d => ({ _id: d.id, ...d.data() }));
      }
      restaurantSubs[rid] = subs;
    }

    // 3. Build the export blob. JSON-stringify with our custom replacer so
    //    Firestore Timestamps serialise as ISO strings (not "[object]").
    const payload = {
      version: 1,
      exportedAt: new Date().toISOString(),
      restaurantCount: (topLevel.restaurants || []).length,
      topLevel,
      restaurantSubcollections: restaurantSubs,
    };
    const json = JSON.stringify(payload, firestoreReplacer, 2);
    const bytes = Buffer.byteLength(json, 'utf8');

    // 4. Upload to Cloud Storage. The default bucket is the one Firebase
    //    Storage uses; firebase-admin returns it via storage.bucket()
    //    when no name is passed.
    const bucket = adminStorage.bucket();
    const file = bucket.file(filename);
    await file.save(json, {
      contentType: 'application/json; charset=utf-8',
      metadata: {
        cacheControl: 'private, max-age=0',
        metadata: {
          exportedAt: payload.exportedAt,
          restaurantCount: String(payload.restaurantCount),
          version: '1',
        },
      },
    });

    const elapsedMs = Date.now() - startedAt;
    console.log('[cron/firestore-backup]', JSON.stringify({
      filename, bytes, restaurantCount: payload.restaurantCount, elapsedMs,
    }));

    return res.status(200).json({
      ok: true,
      filename,
      bytes,
      restaurantCount: payload.restaurantCount,
      elapsedMs,
    });
  } catch (err) {
    console.error('[cron/firestore-backup] fatal:', err);
    return res.status(500).json({ ok: false, error: err.message });
  }
}

// Replacer for JSON.stringify — Firestore Timestamps + GeoPoints don't
// serialise nicely by default. Convert known shapes to plain primitives.
function firestoreReplacer(_key, value) {
  if (value == null) return value;
  // Firestore Timestamp (admin SDK) — has _seconds and _nanoseconds.
  if (typeof value === 'object' && '_seconds' in value && '_nanoseconds' in value) {
    return { __type: 'timestamp', iso: new Date(value._seconds * 1000).toISOString(), seconds: value._seconds };
  }
  // Firestore Timestamp (client SDK shape) — has seconds and nanoseconds.
  if (typeof value === 'object' && 'seconds' in value && 'nanoseconds' in value && Object.keys(value).length === 2) {
    return { __type: 'timestamp', iso: new Date(value.seconds * 1000).toISOString(), seconds: value.seconds };
  }
  return value;
}

// "2026-04-26-23-30" — sortable ISO-ish stamp without the Z punctuation
// that Cloud Storage object names allow but are awkward to read.
function formatStamp(d) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}-${pad(d.getUTCHours())}-${pad(d.getUTCMinutes())}`;
}
