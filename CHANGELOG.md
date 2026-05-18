# Changelog

All notable changes to HaloHelm are tracked here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and version
numbers follow loosely-semantic dating: `YYYY.MM.PATCH`.

## [Unreleased]

## [2026.05.17] — Production audit Phases 1B–5 (security hardening)

A sustained sweep through the 59-finding production audit. Closed all
CRITICAL + HIGH + MEDIUM items live on main; LOW items either fixed
or explicitly deferred with reasoning (see commits for full detail).

### Added — server-side endpoints
- `/api/restaurant/create` — token-gated, plan-validated, atomic
  restaurant + user-doc creation. Replaces the old client-side
  `createRestaurant()` + `createUserDoc()` pair that let any signed-in
  user mint a free Pro plan with inflated limits. Subdomain regex,
  reserved-list check, one-restaurant-per-uid invariant enforced in
  a single Firestore transaction. IP rate-limit at 3/min.
- `lib/rateLimit.js` — generic Firestore-backed sliding-window
  limiter used across `/api/payment/intent` (IP 20/min + RID 120/min),
  `/api/coupons/{validate,use}`, `/api/restaurant/create`,
  `/api/tableBill/get-or-create`, and `/api/petpooja/callback`.
- `lib/cronStatus.js` + cron-status dashboard card on
  `/superadmin/email` — every cron run records `systemConfig/cronStatus`
  so missed runs surface visually. Wraps `daily-summary`,
  `firestore-backup`, `petpooja-menu-sync`.
- GitHub Actions weekly Firestore backup (`firestore-backup.yml`)
  + one-shot `scripts/run-backup-once.js` runnable from a developer
  machine using firebase-admin.
- CI lint + build on every push (`.github/workflows/lint.yml`).
- Idempotency cache on `/api/payment/intent`:
  `restaurants/{rid}/paymentIntents/{sha256}` holds the previous
  intent for 60 s so double-click / browser-retry returns the same
  intent instead of a fresh gateway charge.

### Changed — Firestore rules (deployed live)
- `restaurants/{rid}` update: switched from 5-field BLOCKLIST to
  strict ALLOWLIST. Admin can no longer self-extend `trialEndsAt`,
  hijack `subdomain`, flip `gatewayActive`, or rewrite `ownerUid`.
- `restaurants/{rid}` create: rule removed — server endpoint only.
- `orders` paymentStatus + create schema locked (C1+C3).
- `orders` `list` denied for public (C2); customer bill listener
  refactored to per-doc reads driven by `tableBills.orderIds`.
- `tableBills.orderIds` arrayUnion-only, capped at 200.
- `waiterCalls` + `feedback` create rules schema-locked (field
  whitelist, size caps, status='pending'/isRead=false forced).
- `users/{uid}` self-update permitted for `email` + `emailSyncedAt`
  only — auth providers now write the new email back when
  Firebase Auth's value diverges from Firestore.
- `staff` writes gated by new `isActiveStaff()` helper that reads
  `staff.isActive==true` per-eval; closes the 1 h token grace
  window after admin disables a staff member.
- Explicit deny on `/rateLimit` and `/systemConfig` for clients.

### Changed — Storage rules (deployed live)
- Replaced `allow write: if isAuth();` (any signed-in user could
  upload into ANY restaurant's bucket) with restaurantId-bound
  + content-type-allowlisted + size-capped rules:
  `restaurants/{rid}/images/*` (10 MB, image/*),
  `restaurants/{rid}/models/*` (100 MB, model/gltf-binary or
  application/octet-stream). Catch-all locked to superadmin.

### Changed — endpoint hardening
- `/api/generate-model` — superadmin Bearer token required (was
  unauthenticated; Meshy quota was burnable by anyone).
- `/api/payment/intent` — rejects cancelled / paid / non-eligible-
  paymentStatus orders; rejects orders >6 h old.
- `/api/staff/login` — plaintext PIN fallback now LAZY-MIGRATES on
  success (hash + delete plain field atomically); generic error
  log on lookup failure removes fingerprint risk.
- `/api/tableBill/get-or-create` — `tableNumber` regex `/^\d{1,5}$/`.
- `/api/manifest` — `table` regex tightened to `/^\d{1,5}$/`;
  truncated restaurant names now end with `…`.
- `/api/petpooja/callback` — per-(restID, orderID) rate limit
  closes the status-flip spam vector.
- `/api/auto-confirm/[provider]` — signature failures now log the
  client IP + body hash (not content).
- Signup page (`pages/signup.js`) — calls `/api/restaurant/create`
  with Bearer ID token; surfaces server validation errors.
- Superadmin AR generate (`pages/superadmin/requests.js`) — sends
  Bearer ID token to `/api/generate-model`.

### Added — landing page polish
- OG + Twitter Card metadata on `/` so unfurled links show
  hero card + title instead of a bare URL.

### Operational
- Manual Firestore backup taken 16 May 2026 (815 KB snapshot in
  Cloud Storage at `backups/manual-…-full.json`).

## [2026.05.16-Phase-1A] — Security headers + indexes + security.txt

### Added
- Security headers (HSTS, X-Frame-Options, Content-Type-Options,
  Referrer-Policy, Permissions-Policy) wired into `next.config.js`.
- Explicit Firestore composite indexes for the auto-confirm matcher
  + needs-match queue.
- RFC 9116 security.txt at `/.well-known/security.txt` for
  responsible disclosure.

## [2026.05.16] — Domain + Brand + Polish

### Added
- Custom domain `halohelm.com` live on Vercel (DNS via Namecheap)
- Email forwarders: `hello@`, `support@`, `admin@` → personal gmail
- Firebase Authorized Domains + Google OAuth credentials updated for new domain
- Privacy Policy (`/privacy`) + Terms of Service (`/terms`) — DPDP Act 2023 compliant starter drafts
- Custom 404 + 500 branded error pages
- `robots.txt` + dynamic `sitemap.xml` for SEO
- Global email-verification banner across admin pages (resend with 60s cooldown)
- `/admin/help` FAQ page (28 questions, 7 categories, accordion UX)
- PWA install prompt on admin pages (Chrome / Edge / Brave)
- Design brief for logo + OG image at `docs/DESIGN_BRIEF.md`

### Changed
- All brand references: "Advert Radical" → "HaloHelm" (across 50+ files)
- All hardcoded URLs: `ar-saa-s-kbzn.vercel.app` / `advertradical.com` → `halohelm.com`
- Vercel project renamed `ar-saa-s-kbzn` → `halohelm`
- Firebase project public-facing name → "HaloHelm"

### Fixed
- Google sign-in mobile bug: was popup-first with redirect-fallback (broke on
  Android Chrome due to user-gesture race); now mobile UA goes straight to
  redirect, desktop keeps popup
- "Scan QR to Pay" UX bug: was pre-stamping `online_requested` before
  rendering the QR, which triggered the bill-level "Payment Done" screen
  before the QR ever showed. Status now only stamps on explicit "I've paid".
- PhonePe logo replaced with Devanagari "पे" character (actual brand mark)
- `/r/[subdomain]/[table]` perf fix: pinned Vercel functions to Mumbai
  (`bom1`) to colocate with Firestore in `asia-south1`; cross-ocean
  roundtrips dropped from ~250ms to ~30-80ms. Added in-memory cache for
  subdomain → restaurantId lookup (5-min TTL on warm functions).
- Gateway settings save bug: `preserve()` helper was returning `undefined`
  for unset secrets, which Firestore rejects with a 500. Now falls back to
  empty string. Also wrapped handler in try/catch for JSON 500s instead of
  Next's default HTML page (which was surfacing as "Unexpected token 'I'").

## [2026.05.14] — Auto-Confirm UPI (Razorpay / Paytm / PhonePe)

### Added
- Webhook-based auto-confirmation of UPI payments (no manual "I've paid"
  needed once enabled): `lib/autoConfirm.js` + per-provider modules in
  `lib/autoConfirmProviders/`; webhook endpoint at
  `/api/auto-confirm/[provider]?rid=...` with HMAC-SHA256 signature
  verification (Razorpay), PhonePe SHA256+salt, Paytm checksum via official
  `paytmchecksum` package.
- Two-stage matcher: reference match (`Order-XXXXXX` from txn note) →
  amount+time fallback (15-min window, exact match required). Ambiguous
  matches written to `restaurants/{rid}/needsMatch` for staff manual assign.
- `/admin/gateway` restructured into 2 top-level tabs: "Auto-Confirm UPI"
  (recommended) + "Full Gateway" (legacy, kept for cards/netbanking).
- Customer payment UI: waiting-spinner state replaces trust button when
  auto-confirm is active. 30-second manual-confirm fallback for webhook
  delays. "Preview mode" toggle on /admin/gateway for demos.

### Changed
- Customer payment picker redesigned: branded one-tap UPI app rows (Google
  Pay, PhonePe, Paytm, Scan QR), inline SVG brand logos, "Preferred
  Payment" featured card with last-used app, hairline dividers between
  rows. UPI VPA collect input gated on gateway active.

## [2026.05.13] — Customer-facing perf + Auth hardening

### Added
- Auth: Google sign-in/up with redirect fallback for popup blockers;
  in-app "Change Password" + "Change Email" at `/admin/settings/security`
  using `verifyBeforeUpdateEmail` (old email keeps working until link
  clicked); "Forgot password?" inline panel on admin login with
  anti-enumeration error message.
- Email verification at signup with "Check your inbox" success screen.
- Waiter page Orders tab: live grid of today's orders with status filters,
  items/total breakdown, payment-status badges.
- Waiter page "+ New Order" via reusable `NewOrderModal` component.

### Fixed
- Login form was refreshing instead of submitting because `next/dynamic`
  introduces a hydration boundary; reverted `AuthProviders` to a static
  import. Trade-off: firebase/auth (~80KB) back in shared bundle.
- Daily summary emails showed 0 orders/0 revenue when Vercel cron fired
  ~30 min late: `yesterdayISTKey()` now subtracts 6 hours from IST-now
  (was 60 min), handles cron jitter up to ±2 hours safely.
- Service worker `ar-v25`: low-internet menu page cold-start rescue with
  `networkFirstRaceTimeout` strategy (2.5s for menu, 4s for other navs).

---

*For older history, see git log. This file starts from 2026-05-13 when the
project transitioned from internal-build to production-ready.*
