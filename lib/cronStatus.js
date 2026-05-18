// lib/cronStatus.js
//
// Persistent cron-run status tracker. Wraps every cron endpoint's main
// work so that even if the cron fails silently, the failure is recorded
// in Firestore for the superadmin to discover.
//
// Why this exists:
//   Before this helper, a Vercel cron failure (timeout, Firebase outage,
//   gmail SMTP auth rejection, etc.) was completely silent. The first sign
//   that something was wrong would be a restaurant calling to ask "where's
//   today's summary?" — hours after the failure.
//
// What it does:
//   On every cron run, after the work finishes (success OR failure),
//   writes a status doc at `systemConfig/cronStatus` capturing:
//     - lastRunAt:           server timestamp
//     - lastOutcome:         'ok' | 'partial' | 'failed'
//     - lastDurationMs:      how long the run took
//     - lastSummary:         per-cron payload (e.g. { sent, failed, dateKey })
//     - lastError:           error message if failed (no stack — keeps doc small)
//     - consecutiveFailures: incremented on failed/partial, reset on ok
//     - totalRuns:           lifetime counter
//     - totalFailures:       lifetime counter
//
// The doc is namespaced by cron name (e.g. `daily-summary`, `firestore-
// backup`, `petpooja-menu-sync`) so a status from one cron doesn't
// overwrite another. The single-doc-per-name design keeps reads cheap for
// a future superadmin dashboard widget that lists ALL cron statuses.
//
// CRITICAL design choice — the status write itself MUST NOT throw. If
// Firestore is the thing that's failing, the status write would also fail,
// and the catch block would swallow the original error. So we wrap
// recordCronRun in its own try/catch and just console.error on failure.
// The original cron handler still returns the actual outcome to Vercel.

import admin from 'firebase-admin';
import { adminDb } from './firebaseAdmin';

const STATUS_DOC = 'systemConfig/cronStatus';

/**
 * Record the outcome of one cron run.
 *
 * @param {string} cronName  e.g. 'daily-summary'
 * @param {object} opts
 * @param {boolean} opts.ok               true if cron succeeded (or "partial" is OK)
 * @param {number}  opts.durationMs       how long the cron took
 * @param {object}  [opts.summary]        per-cron result payload (e.g. { sent, failed, dateKey })
 * @param {string}  [opts.error]          error message (only if !ok)
 * @param {boolean} [opts.partial]        true if SOME work failed but cron didn't fully fail
 *
 * Never throws — failures are logged but don't propagate.
 */
export async function recordCronRun(cronName, opts) {
  if (!cronName || typeof cronName !== 'string') return;
  const ok = !!opts?.ok;
  const partial = !!opts?.partial;
  const outcome = ok ? (partial ? 'partial' : 'ok') : 'failed';

  // Build the per-cron updates as a nested key path so multiple crons
  // can update the same doc concurrently without overwriting each other's
  // fields. Firestore's dot-path syntax merges deeply.
  const k = (field) => `${cronName}.${field}`;
  const updates = {
    [k('lastRunAt')]:      admin.firestore.FieldValue.serverTimestamp(),
    [k('lastOutcome')]:    outcome,
    [k('lastDurationMs')]: Number(opts?.durationMs) || 0,
    [k('lastSummary')]:    sanitizeSummary(opts?.summary),
    [k('lastError')]:      ok ? null : String(opts?.error || 'Unknown error').slice(0, 500),
    [k('lastSuccessAt')]:  ok && !partial
      ? admin.firestore.FieldValue.serverTimestamp()
      : admin.firestore.FieldValue.delete(), // keep prior value when not OK
    [k('totalRuns')]:      admin.firestore.FieldValue.increment(1),
  };

  // Increment/reset consecutiveFailures: tricky with a single set() call,
  // so we do it as a transaction so the "increment vs reset" is atomic.
  try {
    await adminDb.runTransaction(async (tx) => {
      const ref = adminDb.doc(STATUS_DOC);
      const snap = await tx.get(ref);
      const prior = snap.exists ? (snap.data()?.[cronName] || {}) : {};

      const nextConsec = ok && !partial ? 0 : (Number(prior.consecutiveFailures) || 0) + 1;
      const nextTotalFail = (Number(prior.totalFailures) || 0) + (ok && !partial ? 0 : 1);

      // Use set(merge) so other crons' fields aren't disturbed by our write.
      const setDoc = {
        [cronName]: {
          ...prior,
          lastRunAt:          admin.firestore.FieldValue.serverTimestamp(),
          lastOutcome:        outcome,
          lastDurationMs:     Number(opts?.durationMs) || 0,
          lastSummary:        sanitizeSummary(opts?.summary),
          lastError:          ok ? null : String(opts?.error || 'Unknown error').slice(0, 500),
          consecutiveFailures: nextConsec,
          totalRuns:          (Number(prior.totalRuns) || 0) + 1,
          totalFailures:      nextTotalFail,
        },
      };
      if (ok && !partial) {
        setDoc[cronName].lastSuccessAt = admin.firestore.FieldValue.serverTimestamp();
      }
      tx.set(ref, setDoc, { merge: true });
    });
  } catch (err) {
    // Status write failed — log but don't throw. The cron handler still
    // returns its real result to Vercel; this only affects observability.
    console.error(`[cronStatus] failed to record ${cronName} run:`, err?.message);
  }
}

/**
 * Trim + sanitize the per-cron summary so it stays small + safe.
 * Firestore docs have a 1MB cap; cron summaries should be tiny anyway.
 */
function sanitizeSummary(summary) {
  if (!summary || typeof summary !== 'object') return null;
  try {
    const json = JSON.stringify(summary);
    if (json.length > 8 * 1024) {
      // Don't store huge payloads. Replace with a truncated marker.
      return { _truncated: true, sizeBytes: json.length, head: json.slice(0, 1024) };
    }
    return summary;
  } catch {
    return { _unserializable: true };
  }
}

/**
 * Convenience: wrap a cron handler's main async work.
 *
 * Usage in a cron endpoint:
 *
 *     return withCronStatus('daily-summary', async () => {
 *       const results = await runDailySummary();
 *       return { summary: results, partial: results.failed > 0 };
 *     }, res);
 *
 * The wrapper handles the outcome reporting AND returns the JSON response
 * to Vercel. The caller's function should return:
 *   { summary?: object, partial?: boolean }
 * On exception → marked as failed automatically.
 */
export async function withCronStatus(cronName, work, res) {
  const start = Date.now();
  try {
    const result = await work();
    const durationMs = Date.now() - start;
    await recordCronRun(cronName, {
      ok: true,
      partial: !!result?.partial,
      durationMs,
      summary: result?.summary,
    });
    return res.status(200).json({ ok: true, durationMs, ...(result?.summary || {}) });
  } catch (err) {
    const durationMs = Date.now() - start;
    await recordCronRun(cronName, {
      ok: false,
      durationMs,
      error: err?.message,
    });
    console.error(`[cron/${cronName}] fatal:`, err);
    return res.status(500).json({ ok: false, error: err?.message, durationMs });
  }
}
