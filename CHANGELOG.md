# Changelog

All notable changes to HaloHelm are tracked here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and version
numbers follow loosely-semantic dating: `YYYY.MM.PATCH`.

## [Unreleased]

### Added
- **Production audit Phase 1A** — security headers (HSTS, X-Frame-Options,
  Content-Type-Options, Referrer-Policy, Permissions-Policy) wired into
  `next.config.js`; explicit Firestore composite indexes for the
  auto-confirm matcher + needs-match queue; RFC 9116 security.txt at
  `/.well-known/security.txt` for responsible disclosure.

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
