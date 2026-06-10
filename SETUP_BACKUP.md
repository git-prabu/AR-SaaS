# Backups — Status, One Required Fix, and the Disaster Runbook

*Last verified: 2026-06-11 (audit Phase C). Verified by an actual
restore drill — not just "the file exists".*

## Current state

| Piece | Status |
|---|---|
| Backup script (`scripts/run-backup-once.js`) | ✅ Works — fresh 1.1 MB snapshot taken 2026-06-10 |
| Backup contents | ✅ Verified: parses cleanly, 19 top-level + 728 subcollection docs |
| Restore path | ✅ Drilled: docs restored to a scratch collection, read back 10/10, cleaned up |
| 90-day retention | ✅ Lifecycle rule live on the bucket (backups auto-delete after ~13 weekly snapshots) |
| **Weekly schedule (GitHub Action)** | ❌ **NEVER RUN — needs you (5 min, below)** |

## ⚠ The one thing you must do: add 4 GitHub Secrets

The weekly backup workflow exists but has produced **zero** backups —
it needs credentials that only you can add:

1. Open <https://github.com/git-prabu/AR-SaaS> → **Settings** →
   **Secrets and variables** → **Actions** → **New repository secret**.
2. Create these 4 secrets. The values are the matching lines from your
   local `.env.local` file (copy everything after the `=`):

   | Secret name | Where the value comes from |
   |---|---|
   | `FIREBASE_ADMIN_PROJECT_ID` | `.env.local` same name |
   | `FIREBASE_ADMIN_CLIENT_EMAIL` | `.env.local` same name |
   | `FIREBASE_ADMIN_PRIVATE_KEY` | `.env.local` same name — paste the whole quoted value **without** the surrounding quotes |
   | `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET` | `.env.local` same name |

3. Test it immediately: repo → **Actions** tab → **"Firestore weekly
   backup"** → **Run workflow** → Run. Green check ≈ 1 minute.
4. From then on it runs automatically every Monday 05:00 IST.

**Monthly habit (1 minute):** run `node scripts/verify-backup.js` from
the project folder — it checks the schedule is producing files, the
newest file parses, and the restore path still works. It warns loudly
if the newest backup is older than 8 days.

## Disaster runbook — "the database is broken/deleted, restore it"

> Stay calm; backups go back ~13 weeks. Best done with Claude's help,
> but written so anyone technical can follow.

1. **Stop the bleeding.** If data is being actively corrupted (bad
   deploy, bad script), pause Vercel deployments and close the app to
   traffic first (Vercel → project → Settings → pause).
2. **Pick the snapshot.** Firebase Console → Storage →
   `backups/` folder → note the newest file *from before the damage*,
   e.g. `backups/manual-2026-06-10-20-24-full.json`.
3. **Download the snapshot** to the project folder: Firebase Console →
   Storage → `backups/` → click the file → Download.
4. **Restore.** The repo has `scripts/firestore-restore.js`. It is
   dry-run by default (prints what it WOULD write, writes nothing):
   ```
   node scripts/firestore-restore.js ./<downloaded-file>.json
   ```
   Read the summary. Then restore — one collection if the damage is
   contained:
   ```
   node scripts/firestore-restore.js ./<file>.json --collection users --apply
   ```
   or everything (last resort — overwrites ALL collections):
   ```
   node scripts/firestore-restore.js ./<file>.json --all --apply
   ```
5. **Sanity-check before reopening:** open `/admin/orders` and the
   customer menu for one restaurant; confirm menus, staff and orders
   look right.
6. **Reopen** (unpause Vercel).

What backups do NOT cover:
- **Menu photos** (Storage files) — they live in the same bucket but
  outside `backups/`; deletion of the bucket itself would lose them.
  They're re-uploadable from each restaurant's phone if lost.
- **Firebase Auth accounts** — passwords aren't in Firestore. Accounts
  survive Firestore damage independently; a full project deletion
  would require users to re-register. (Acceptable risk at current
  scale; revisit if the platform grows.)
- **Changes made after the snapshot** — anything between the backup
  time and the disaster is gone. Weekly cadence = worst case ~7 days.
  If that ever becomes unacceptable, switch the Action's cron from
  weekly to daily (one-line change in
  `.github/workflows/firestore-backup.yml`).
