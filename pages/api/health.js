// pages/api/health.js
// Liveness + dependency check for external uptime monitoring
// (2026-06-11 audit Phase B, issue #8).
//
// An uptime service (UptimeRobot — see SETUP_MONITORING.md) pings this
// every 5 minutes. Returns:
//   200 { ok: true }   — app serving AND Firestore reachable
//   503 { ok: false }  — app serving but Firestore unreachable
// A network-level failure (Vercel down, domain broken) is the third
// state the pinger detects on its own (no response at all).
//
// The Firestore check reads the systemConfig/cronStatus doc — a doc the
// crons already maintain — so the check exercises a REAL read path
// without touching restaurant data. A missing doc still counts as
// healthy (the read itself succeeded); only a thrown error is unhealthy.
//
// Public + unauthenticated by design: it leaks nothing but a boolean
// and the deploy SHA, and uptime monitors can't send auth headers on
// free tiers. Cheap to serve (single doc read, ~50ms).

import { adminDb } from '../../lib/firebaseAdmin';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const startedAt = Date.now();
  try {
    await adminDb.doc('systemConfig/cronStatus').get();
    return res.status(200).json({
      ok: true,
      firestore: 'up',
      latencyMs: Date.now() - startedAt,
      release: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) || 'local',
    });
  } catch (err) {
    console.error('[health] firestore check failed:', err?.message);
    return res.status(503).json({
      ok: false,
      firestore: 'down',
      latencyMs: Date.now() - startedAt,
      error: String(err?.message || err).slice(0, 200),
    });
  }
}
