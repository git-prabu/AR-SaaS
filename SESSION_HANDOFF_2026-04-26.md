# Advert Radical — Session Handoff (2026-04-26)

This is a fresh handoff doc for the **second** Claude session that worked
on the project (the first session's handoff is `CHAT_CONTEXT.md`).
This doc covers everything done since `CHAT_CONTEXT.md` was generated.

Read this if you (Claude) are picking up after a chat rewind, a context
loss, or just need a fast "what's the current state" snapshot. The
original `CHAT_CONTEXT.md` (Sprint 0 + Sprint 1 era) is still valid for
foundational context — read both.

---

## 1. Quick orientation

- **Project root:** `C:\Users\Prabu D\OneDrive\Desktop\advert-radical-v6\advert-radical\`
- **Repo:** https://github.com/git-prabu/AR-SaaS
- **Live:** https://ar-saa-s-kbzn.vercel.app  →  https://advertradical.vercel.app
- **Current branch:** `main` (also `claude/nostalgic-black-40e297` is the active feature branch — both at same HEAD)
- **Latest commit:** `89ed728` — "Fix waiter History day grouping + analytics chart snap on period change"
- **Rollback anchor:** tag `v0.9-stable` at commit `57b1f84` (still valid)
- **User:** Prabu D, solo non-technical founder, Chennai (IST). All workflow rules from `CHAT_CONTEXT.md` §5 still apply.

---

## 2. Commits added in this session (chronological)

Bringing us from `7e9f527` (the last commit covered by `CHAT_CONTEXT.md`) up to `89ed728` (today, HEAD).

### Sprint 1 loose ends (closed in this session)

| Commit | What |
|---|---|
| `2896fa9` | Custom date picker spread to /admin/payments, /admin/waiter (History), /admin/orders + past-day navigation strip on /admin/day-close. New shared `components/DateRangePicker.jsx`. |
| `f4c05be` | Rewired /admin/analytics range pills (7d/14d/30d/90d → Today/Week/Month/All/Custom) AND fixed a critical bug: when a custom range was active, `committedRange` was stored as the string `"YYYY-MM-DD_YYYY-MM-DD"` then used in `Date.now() - committedRange * 86400000` → NaN → every derived stat showed 0. |
| `7e26696` | /admin/analytics Today mode now buckets Revenue Over Time by hour (00–23) instead of by day. Matches /admin/reports. |
| `769414e` | Migrated all 6 superadmin pages + SuperAdminLayout from Tastywala amber/forest to the Aspire palette. |
| `cdc03a6` | Promotions inline-edit rebuild — consolidated /admin/{offers,coupons,combos} into /admin/promotions with inline drawers. Old pages became 308-redirect stubs. Single Promotions entry in CATALOG nav. |
| `5f5af60` | Promotions: restored the rich card layout from the old per-entity pages (matte-black stats strip + filter pills + image thumbnails + status pills) — the first cut was too minimal. |

### Email notifications (Sprint 2.9)

| Commit | What |
|---|---|
| `4a825b9` | Daily summary email feature — Vercel cron at midnight IST, super-admin sender management, /superadmin/email page, send-test endpoint, Notifications email override per-restaurant in /admin/settings, Firestore systemConfig rule, vercel.json cron schedule, nodemailer dep added. |
| `b0caaee` | Email Settings: editable test-recipient field (the auth email was a placeholder, so test sends went nowhere — now you can type any address). |
| `24344cf` | Email Settings: don't disable Save when initial Firestore load fails (fall back to EMPTY for the dirty check). |

### Sprint 2 (all 11 items shipped)

| Commit | What |
|---|---|
| `2b7a63c` | Sprint 2.1 — tablet-friendly touch targets on Kitchen + Waiter (≥44pt). **NOTE: Prabu says this still doesn't feel right for tablet/mobile — needs a redo (see § 4 below).** |
| `54f32e7` | Sprint 2.2 — new `components/EmptyState.jsx` + first-time empty page CTAs on items / staff / requests. |
| `9db2538` | Sprint 2.3 — onboarding checklist on /admin dashboard for new restaurants. 5 steps, dismissable, writes `onboardingComplete=true`. |
| `9ab1bc0` | Sprint 2.4 + 2.5 — shared UI primitives (`components/ui/{Button,Card,Drawer,Input,Label,Pill}.jsx` + `lib/theme.js`) + `lastModifiedBy` audit foundation via `withActor()` wrapper in lib/db.js. Migration is gradual — existing pages still use inline styles. |
| `dd40919` | Sprint 2.6 + 2.8 + 2.10 — bulk actions on /admin/items (`hooks/useBulkSelection.js` + `components/admin/BulkActionBar.jsx`); CSV import/export (Petpooja-compatible schema, no new npm dep); Firestore weekly backups (`pages/api/cron/firestore-backup.js` + `scripts/firestore-restore.js` + second cron in vercel.json). |

### Customer-side bug fixes (post-Sprint 2 testing finds)

| Commit | What |
|---|---|
| `7bbbc4d` | Active offers were filtered on a non-existent `isActive` field. Now subscribe to full offers collection and derive active set client-side via `offerStatus()` (same as admin Promotions). |
| `282e481` | Mobile cart `Confirm & Place Order` button was below the fold on phones. Form step now wrapped in `flex:1 + overflowY:auto + minHeight:0`; header pinned, Confirm button pinned outside scroll container. |

### Today's bug fixes (latest, this session)

| Commit | What |
|---|---|
| `89ed728` | (1) /admin/waiter History tab now groups by day with matte-black day-tag pills like /admin/payments. (2) /admin/analytics Revenue Over Time chart no longer snaps to end on period change — added `key={committedBounds}` to AreaChart + BarChart so each period gets a clean remount + fresh animation. |

---

## 3. Current state of the codebase

### New top-level files (added in this session)

```
components/
  DateRangePicker.jsx         (shared Custom-pill popover used in payments/waiter/orders/analytics)
  EmptyState.jsx              (Sprint 2.2 — reusable empty-state card with CTA)
  admin/
    BulkActionBar.jsx         (Sprint 2.6 — floating action bar on /admin/items)
  ui/
    Button.jsx, Card.jsx, Drawer.jsx, Input.jsx, Label.jsx, Pill.jsx
                              (Sprint 2.4 — shared primitives, gradual migration)
hooks/
  useBulkSelection.js         (Sprint 2.6)
lib/
  email.js                    (Sprint 2.9 — Nodemailer wrapper, reads sender from Firestore)
  theme.js                    (Sprint 2.4 — Aspire tokens)
pages/admin/
  promotions.js               (rebuilt with inline drawers; old offers/coupons/combos.js are now redirect stubs)
pages/api/
  cron/daily-summary.js       (Sprint 2.9 — midnight IST cron)
  cron/firestore-backup.js    (Sprint 2.10 — Sunday 11 PM UTC = Monday 5 AM IST cron)
  email/send-test.js          (test-send endpoint, requires superadmin Firebase ID token)
pages/superadmin/
  email.js                    (super-admin page to set/rotate sender Gmail)
scripts/
  firestore-restore.js        (CLI restore script — node scripts/firestore-restore.js <file.json> --apply)
vercel.json                   (both cron schedules)
SESSION_HANDOFF_2026-04-26.md (THIS FILE)
```

### Modified files of note

- `lib/db.js` — added `withActor()` wrapper at the bottom + 4 feedback mutation helpers (`markFeedbackRead`, `markAllFeedbackRead`, `updateFeedbackNote`, `deleteFeedback`). All new mutations use `withActor()` to stamp `lastModifiedBy` + `lastModifiedAt`. **No-restructure rule still applies — never reorder existing helpers.**
- `pages/admin/index.js` — onboarding checklist (Sprint 2.3) + LIVE TODAY card.
- `pages/admin/items.js` — bulk selection + bulk actions + CSV export/import.
- `pages/admin/{payments,waiter,orders,day-close}.js` — Custom date picker integration.
- `pages/admin/analytics.js` — Today/Week/Month/All/Custom pills, hourly Today-mode chart, NaN-bug fix on stats, chart `key={committedBounds}` for clean remount.
- `pages/admin/settings.js` — Notifications email field (per-restaurant override for daily summary).
- `pages/admin/waiter.js` — Custom date picker in History tab + day grouping (today's fix).
- `pages/restaurant/[subdomain]/index.js` — active-offers filter fix + mobile cart scroll fix.
- `components/layout/AdminLayout.jsx` — single Promotions entry replaces Combos / Offers / Coupons.
- `components/layout/SuperAdminLayout.jsx` — Aspire palette + Email Settings nav entry + mail icon.
- `firestore.rules` — added `match /systemConfig/{configId}` (superadmin-only).
- `package.json` — added `nodemailer ^6.9.16`.

---

## 4. Pending / known issues

### Production setup tasks Prabu has done

- ✅ Created `halohelm.notification@gmail.com` (or similar) as the sender Gmail
- ✅ Generated a 16-char App Password
- ✅ Added `CRON_SECRET` to Vercel env vars
- ✅ Pasted sender credentials into `/superadmin/email`
- ✅ Test email arriving in inbox
- ✅ Deployed firestore.rules (after fixing local-stale issue: I copied the worktree's rules into his main project dir before he deployed)

### Bugs still pending (raised today, NOT fixed)

1. **Tablet/mobile design on Kitchen + Waiter is not actually good.** Sprint 2.1 (`2b7a63c`) bumped touch targets but Prabu confirms the layouts are still not properly responsive for tablet/phone use. Next task: real responsive CSS audit + redo. Test at 375px (mobile), 768px (tablet), 1024px (tablet landscape).

### Plans on the table but not yet built

1. **Internet issue fix.** Prabu mentioned a planned fix for an internet/connectivity issue. The plan was discussed in a part of the chat that got rewound out — no breadcrumb on disk, no memory note, no commit. **Prabu needs to re-describe the symptom + direction before I can rebuild it.** Likely related to: kitchen/waiter tablet on flaky wifi, customer cart on 4G drops, or something similar — but unconfirmed.

### Remaining manual tests Prabu hasn't gotten to

Prabu authorized me to **sign up a test restaurant on production** (he has 14-day trial + can extend via super admin). Use this to verify the items below myself; for items that need a real device or his eyes, leave them for him.

| # | Test | Who can do it |
|---|---|---|
| 3  | Onboarding checklist for new restaurant | I can — sign up new test restaurant on prod |
| 5  | `lastModifiedBy` stamps on writes | I can — make a feedback action then check Firestore in Firebase Console |
| 6  | Bulk actions on items | I can — add items, multi-select, run actions, verify in Firestore |
| 7  | Superadmin Aspire migration | He should — visual judgment |
| 8  | CSV import/export round-trip | I can — export, edit, import, verify |
| 9  | Daily summary email cron at midnight IST tonight | Prabu watches inbox tomorrow morning |
| 10 | Firestore backup file appears in Cloud Storage | I can — fire cron manually, check bucket |
| 11a| Active offers visible on customer page | I can — add offer with today's dates, view customer page |
| 11b| Mobile cart Confirm reachable on real phone | He should — needs real phone |
| 12 | Promotions drawer create/edit/delete lifecycle | I can — sign in as test admin |
| 13 | PWA install on Chrome desktop / iOS / Android | He should — needs real devices |

### Long-tail TODOs

- 1 code TODO in `pages/api/coupons/validate.js` — coupon `usedCount` increment should move from client to server. Small (~30 min).
- v1.0 prep notes from §15 of `CHAT_CONTEXT.md`:
  - Razorpay subscription button still has placeholder env vars on Vercel (Prabu hasn't signed up for Razorpay yet)
  - `NEXT_PUBLIC_BASE_DOMAIN` is `advertradical.com` but the domain isn't purchased yet
  - `planExpiresAt` enforcement is lazy (intentional for v1.0)

---

## 5. Critical invariants reaffirmed (DON'T break)

All from `CHAT_CONTEXT.md` §4 still apply. Reminder of the load-bearing ones:

- **Pages Router only**, JavaScript only, no Tailwind on admin pages, Inter font on admin pages, Aspire palette locked.
- **`lib/db.js` no-restructure** — only add new helpers at the bottom. New mutations use `withActor()` to stamp lastModifiedBy/lastModifiedAt.
- **`todayKey()` from lib/db** for date keys — never `new Date().toISOString().split('T')[0]` (UTC bug).
- **`lib/firebase.js` SSR guard** — `persistentLocalCache` must NOT run on the server.
- **Three Firebase apps** — `adminApp`, `superAdminApp`, `staffApp`. Superadmin pages use `saDb`.
- **Customer page bug guards** (`pages/restaurant/[subdomain]/index.js`):
  - `todayStr`/`isSoldOutToday` declared BEFORE `enrichedItems`
  - Only ONE declaration of `tableNumber` from `router.query`
  - `TRANSLATIONS` must have actual string values, never template literals
- **Firestore rules + indexes need manual deploy** — `firebase deploy --only firestore:rules,firestore:indexes`
- **`firestore.rules` workflow gotcha** — the deploy uses Prabu's MAIN project dir, NOT the worktree. After I edit rules, his main dir's copy is stale until he `git pull origin main`. Easiest workaround for now: I copy the file directly from worktree to main project before he deploys.

---

## 6. Conventions for new code (this session)

- **`withActor()`** in `lib/db.js` — all new mutation helpers wrap their payload through this so `lastModifiedBy` (uid) + `lastModifiedAt` (serverTimestamp) get stamped automatically. Don't write raw `updateDoc` / `setDoc` calls in new helpers.
- **Shared UI primitives** (`components/ui/*`) are available — use them on NEW pages. Don't bulk-migrate existing pages; that's deliberate scope discipline.
- **CSV is hand-rolled** (no new dep) — `pages/admin/items.js` has the parsing/serializing inline.
- **DateRangePicker** is the canonical custom date control — use it on any new page that has a Today/Week/Month/All filter.
- **Onboarding checklist** is one-shot per restaurant — once dismissed or all-done, it writes `onboardingComplete=true` and doesn't reappear.

---

## 7. Cron + email plumbing summary

| Cron | Schedule (UTC) | IST equiv | Purpose |
|---|---|---|---|
| `/api/cron/daily-summary`   | `30 18 * * *` | midnight (00:00) IST daily   | Per-restaurant daily summary email |
| `/api/cron/firestore-backup`| `30 23 * * 0` | Monday 05:00 IST weekly       | Full Firestore JSON dump to Cloud Storage `backups/{ts}-full.json` |

Both protected by `Bearer ${CRON_SECRET}` (Vercel env). Manual fire from PowerShell:

```powershell
$secret = "PASTE_CRON_SECRET"
curl.exe -H "Authorization: Bearer $secret" https://ar-saa-s-kbzn.vercel.app/api/cron/daily-summary
curl.exe -H "Authorization: Bearer $secret" https://ar-saa-s-kbzn.vercel.app/api/cron/firestore-backup
```

Sender Gmail credentials live in Firestore at `systemConfig/email`. Editable by Prabu in `/superadmin/email` (no redeploy required).

Restore from a backup JSON: `node scripts/firestore-restore.js path/to/backup.json --apply`. Defaults to dry-run unless `--apply` is passed.

---

## 8. What I'd do next (resumption plan)

1. **Sign up a test restaurant on production** (Prabu authorized this) and run the manual checks marked "I can" in §4 above.
2. **Real tablet/mobile responsive pass** on `/admin/kitchen` + `/admin/waiter`. Test at 375px / 768px / 1024px viewports.
3. **Wait for Prabu** to describe the planned internet-issue fix, then build it.
4. **Ship the leftover TODO** in `coupons/validate.js`.
5. **v1.0 tag** once Prabu greenlights.

---

## 9. Memory files (Prabu's auto-memory, persistent)

Located at `C:\Users\Prabu D\.claude\projects\C--Users-Prabu-D-OneDrive-Desktop-advert-radical-v6-advert-radical\memory\`:

- `MEMORY.md` — index
- `project_advert_radical.md` — project overview
- `project_roadmap_priorities.md` — Prabu's priority list
- `feedback_session_rules.md` — workflow rules
- `feedback_context_file_protocol.md` — when Prabu asks for a context file, produce a comprehensive handoff (THIS doc is one)
- `user_prabu.md` — founder profile

---

End of handoff.
