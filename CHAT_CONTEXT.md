# HaloHelm — Project Handoff (2026-05-09)

> Single document covering everything a fresh Claude chat needs to continue work
> on HaloHelm without re-explaining context. Hand this to the next chat
> alongside the GitHub link / zipped source.
>
> **Branch:** `claude/fervent-bassi-70891e` (auto-deployed to production main)
> **Production main HEAD:** `7263f0c` — *"Coach-mark: tooltip above for fixed FABs + light theme as default"*
> **GitHub:** https://github.com/git-prabu/AR-SaaS
> **Live URL:** https://HaloHelm.vercel.app
> **Demo restaurant:** `/restaurant/spot` · Admin: `/admin/login` (admin@dummy.com / dummy123)

---

## 1. What is HaloHelm

AR + AI SaaS for Indian restaurants. A diner scans a QR at their table, lands
on the restaurant's branded menu page, can preview any dish in 3D AR right on
their table (WebAR via `<model-viewer>`), get AI dish recommendations ("Help Me
Choose"), order, pay, call the waiter, see the bill. The restaurant owner gets
an admin dashboard (orders, kitchen display, waiter, payments, analytics, menu
manager, staff logins, customer feedback, requests, QR generator, settings,
subscription, Petpooja POS integration).

**Founder:** Prabu (Chennai, India), non-technical solo founder. Uses Claude
Code CLI for targeted fixes, Claude.ai chat for design-heavy work. Reviews
diffs before accepting. Asks for complete files (not snippets) when working in
Claude.ai.

**Pricing:** Starter ₹999, Growth ₹2,499, Pro ₹4,999 (monthly). Pro is gated
to Petpooja POS integration.

---

## 2. Stack (current as of v6, May 2026)

- **Next.js 16.1.6** with **Turbopack**, **Pages Router only** (App Router is
  banned — never create an `app/` directory or use server components).
- **Firebase Auth** (`adminApp` + `superAdminApp` + `staffApp` — three
  independent Firebase apps, see `lib/firebase.js`).
- **Firestore** (client SDK + Admin SDK in API routes).
- **Firebase Storage** for menu images, AR `.glb` models, category images.
- **Razorpay** for plan-upgrade payments (live keys live in Vercel env).
- **Anthropic Claude API** for the Help-Me-Choose dish recommender.
- **`<model-viewer>` 3.4.0** (Google) for WebAR via `public/ar-viewer.html`
  iframe. **DO NOT bump version** — 3.4.0 is the most CDN-cache-warm build;
  bumping costs 300-500ms on first AR launch.
- **react-hot-toast** for toasts. **Recharts** for analytics charts. **GSAP**
  for landing-page animations. **`@dnd-kit`** for drag-reorder. **`xlsx`** for
  CSV import/export.
- **Vercel** auto-deploys `main`. Builds use Turbopack which is *strict* about
  duplicate const declarations and JS hoisting (TDZ) — has caught two bugs
  this session.

---

## 3. Repository layout (paths the next chat will need)

```
advert-radical/
├── pages/
│   ├── index.js                       — landing page
│   ├── pitch.js                       — sales pitch deck (pw: RADICAL25)
│   ├── signup.js                      — restaurant signup
│   ├── _app.js
│   ├── _document.js
│   ├── api/
│   │   ├── manifest.js                — per-restaurant PWA manifest
│   │   ├── orders/
│   │   │   ├── add-items.js
│   │   │   └── ...
│   │   ├── payments/
│   │   │   ├── create-order.js        — Razorpay subscription
│   │   │   └── verify.js              — Razorpay verify + plan-downgrade auto-disconnect
│   │   ├── staff/
│   │   │   ├── login.js               — bcrypt PIN + custom-token
│   │   │   ├── create.js
│   │   │   └── update.js              — toggleActive / rename / rotatePin / delete
│   │   ├── petpooja/                  — Pro POS integration (10 endpoints)
│   │   ├── coupons/validate.js
│   │   ├── email/send-receipt.js
│   │   ├── cron/
│   │   │   ├── petpooja-menu-sync.js  — daily 04:00 UTC
│   │   │   ├── daily-summary.js
│   │   │   └── firestore-backup.js
│   │   └── ...
│   ├── admin/
│   │   ├── login.js
│   │   ├── index.js                   — dashboard home
│   │   ├── analytics.js
│   │   ├── reports.js
│   │   ├── orders.js
│   │   ├── kitchen.js                 — KDS, per-item ready/served
│   │   ├── waiter.js                  — calls + serves + payments queue
│   │   ├── payments.js
│   │   ├── items.js                   — menu manager (huge file, ~1600 lines)
│   │   ├── requests.js                — AR-model upload requests + nutrient calc
│   │   ├── combos.js
│   │   ├── offers.js
│   │   ├── coupons.js
│   │   ├── staff.js                   — staff logins
│   │   ├── feedback.js
│   │   ├── notifications.js
│   │   ├── qrcode.js
│   │   ├── settings.js
│   │   ├── subscription.js            — Razorpay upgrade UI
│   │   ├── gateway.js                 — Paytm gateway config
│   │   └── petpooja-connect.js        — Pro-only POS onboarding
│   ├── superadmin/
│   │   └── ...
│   ├── restaurant/
│   │   └── [subdomain]/
│   │       └── index.js               — CUSTOMER MENU PAGE (huge file, ~8000+ lines)
│   ├── staff/
│   │   └── login.js
│   └── r/[subdomain]/[table].js       — QR-scan redirect resolving sid
├── components/
│   ├── layout/
│   │   ├── AdminLayout.jsx
│   │   └── SuperAdminLayout.jsx
│   ├── ConfirmModal.jsx               — styled card replacement for confirm()
│   ├── ARViewer.jsx                   — iframe wrapper for ar-viewer.html
│   ├── PageHead.jsx                   — title format wrapper
│   ├── DateRangePicker.jsx
│   ├── EmptyState.jsx
│   ├── BulkActionBar.jsx
│   └── ...
├── hooks/
│   ├── useAuth.js                     — admin auth
│   ├── useStaffAuth.js                — staff auth (separate Firebase app)
│   ├── useSuperAdminAuth.js
│   └── useBulkSelection.js
├── lib/
│   ├── firebase.js                    — three Firebase apps
│   ├── firebaseAdmin.js               — server-side Admin SDK
│   ├── db.js                          — all Firestore mutations (~1000 lines)
│   ├── storage.js                     — image upload + resize + bulk optimize
│   ├── plans.js                       — single source of truth for plan catalog
│   ├── staffAuth.js                   — server-side bcrypt + rate-limit + token
│   ├── petpooja.js                    — Petpooja API client
│   ├── petpoojaSync.js                — sync orchestration
│   ├── petpoojaInboundAuth.js         — inbound webhook auth
│   ├── petpoojaMock.js                — mock responses for dev
│   ├── email.js                       — sendReceiptForOrder + nodemailer
│   ├── dailySummary.js                — daily summary email body
│   ├── sounds.js                      — kitchen/waiter chimes + voice
│   ├── gateway.js                     — Paytm helpers
│   └── utils.js                       — design tokens + helpers
├── public/
│   ├── ar-viewer.html                 — model-viewer iframe (AR + tutorial)
│   ├── manifest.json                  — admin-side PWA manifest
│   ├── sw.js                          — service worker (currently ar-v24)
│   └── icon-*.png
├── firestore.rules
├── firestore.indexes.json
├── firebase.json
├── .firebaserc                        — project advert-radical
├── vercel.json                        — cron schedule "0 4 * * *"
├── next.config.js
├── package.json
└── package-lock.json
```

### Critical file path mapping (Claude.ai output filename → project path)

When asking Claude.ai for complete files, use these output names:

| Output filename | Project path |
|---|---|
| `landing_index.js` | `pages/index.js` |
| `menu_index.js` | `pages/restaurant/[subdomain]/index.js` |
| `admin_items.js` | `pages/admin/items.js` |
| `admin_orders.js` | `pages/admin/orders.js` |
| `admin_kitchen.js` | `pages/admin/kitchen.js` |
| `admin_waiter.js` | `pages/admin/waiter.js` |
| `admin_staff.js` | `pages/admin/staff.js` |
| `admin_requests.js` | `pages/admin/requests.js` |
| `analytics.js` | `pages/admin/analytics.js` |
| `payments.js` | `pages/admin/payments.js` |
| `notifications.js` | `pages/admin/notifications.js` |
| `qrcode.js` | `pages/admin/qrcode.js` |
| `db.js` | `lib/db.js` |
| `storage.js` | `lib/storage.js` |
| `firebase.js` | `lib/firebase.js` |
| `useAuth.js` | `hooks/useAuth.js` |
| `useStaffAuth.js` | `hooks/useStaffAuth.js` |
| `AdminLayout.jsx` | `components/layout/AdminLayout.jsx` |
| `ConfirmModal.jsx` | `components/ConfirmModal.jsx` |
| `_app.js` | `pages/_app.js` |

---

## 4. Design system (LOCKED — do not propose changes without explicit approval)

Two coexisting palettes — different surfaces use different ones.

**Customer menu page (Aspire warm cream + orange theme):**
- `#FFFFFF` — card background
- `#FFF6E4` / `#FFF1DC` — page wash gradient endpoints
- `#F79B3D` — primary accent (CTAs, badges, AR brand)
- `#FFB347` — accent secondary (gradient buddy of `#F79B3D`)
- `#C97A1A` — deep gold (Chef's Special badge color, accents on dark)
- `#FFE6CF` — cream highlight
- `#FFD58A` — warm light (used in AR banner gradient)
- `#1E1B18` — primary text
- `#1A1612` — dark mode card bg
- `#FFF5E8` — dark mode text
- Veg green `#5DA068`, danger `#E05A3A`, success `#3F9E5A`

Body font: **Inter**. Display: **Poppins** (titles, hero copy). Mono:
**JetBrains Mono** (prices, codes).

**Admin pages (Aspire cinematic — same name but different palette):**
- `#1A1A1A` — ink (matte black, primary text + signature stat-card bg)
- `#2A2A2A` — ink darker (gradient buddy)
- `#EDEDED` — cream (page bg)
- `#FFFFFF` — shell (card bg)
- `#FAFAF8` — shellDarker
- `#C4A86D` — antique gold (warning / accent)
- `#A08656` — warningDim
- Forest tokens for the matte-black signature stat card: `#1A1A1A`,
  `#2A2A2A`, `#EAE7E3` (forestText), `rgba(234,231,227,0.55)`, etc.
- Border: `1px solid rgba(0,0,0,0.06)` (`A.border`)
- BorderStrong: `1px solid rgba(0,0,0,0.10)` (`A.borderStrong`)
- Card shadow: `'0 1px 2px rgba(0,0,0,0.04), 0 4px 12px rgba(0,0,0,0.04)'`

Both palettes co-exist because the customer menu and the admin chrome live at
different URLs. Don't try to "unify" them — they're intentionally different.

**Iconography**: emoji where it works (🍽️, 🥽, ✨), inline SVG everywhere
else. No icon library installed; the customer page weighs on bundle size.

---

## 5. Critical bug guards (carry forward — check before any edit)

These have caused regressions in past sessions. Verify when touching the
listed files:

1. **`pages/restaurant/[subdomain]/index.js` — `isSoldOutToday` declaration
   ordering.** Must be declared BEFORE any useMemo that references it (e.g.
   `enrichedItems`). JS hoisting will crash the page if reversed.

2. **`pages/restaurant/[subdomain]/index.js` — single `tableNumber` declaration
   from `router.query`.** The cart form uses a separate `orderTableInput` /
   `setOrderTableInput` state. Don't conflate.

3. **`pages/restaurant/[subdomain]/index.js` — TRANSLATIONS object must hold
   actual string values.** Not `{t.xxx}` template literals. Each language key
   resolves to a flat string at component-mount.

4. **State hoisting on `pages/restaurant/[subdomain]/index.js`.** Any state
   used in the body-scroll-lock useEffect's deps array MUST be declared
   BEFORE that useEffect or it sits in TDZ at component render and Turbopack
   crashes the prerender. Bit me on `showOrderMoreCard` (commit `00d4afc`)
   and `scrollTicking` (commit `620ff85`). Always declare new modal-related
   state alongside the other modal flags around line 850-1100.

5. **`pages/admin/items.js` — `isSoldOutToday` ordering** (same hoisting risk
   as the customer menu).

6. **`lib/db.js` — never rename or restructure existing functions.** Only add
   new ones at the bottom. Many pages reference these by name; renames break
   distant call sites.

7. **Turbopack rejects duplicate const declarations** in the same scope.
   When refactoring a long block, `git diff` and grep for the renamed/added
   identifier before committing.

---

## 6. Conventions established / followed

- **Commit each logical change separately.** A handful of fixes batched into
  one commit makes reverts painful — and we've reverted twice this session.
- **Always show file path mapping** for any file output.
- **Output complete files** when working in Claude.ai chat (Prabu manually
  downloads + replaces).
- **Replace `confirm()` and `alert()` with `<ConfirmModal>`.** Native browser
  popups are explicitly out of style. Shipped this for delete prompts on
  `/admin/items`, `/admin/staff`, `/admin/orders`, `/admin/payments`. Always
  check fresh additions for `confirm(`.
- **Replace native `prompt()` with inline UI** (e.g. category rename uses an
  inline `<input>` swap, not `prompt()`).
- **Toasts for success/info, ConfirmModal for destructive confirmation,
  banners for persistent state.**
- **Pro features must auto-disconnect on plan downgrade.** `verify.js`
  already calls `petpoojaDisconnect(reason: 'plan-downgrade')` when a
  Razorpay payment lands a non-Pro plan. Disconnect hides Petpooja-mirrored
  items (`isActive: false`) and admin can't re-activate them without
  re-upgrading + reconnecting (three-layer paywall enforcement).
- **Petpooja-mirrored items have read-only category names.** When admin tries
  to rename a category that contains any item with `petpoojaItemId`, refuse
  with a toast directing them to rename in Petpooja first.
- **Header search vs sticky pill search:** moved to header icon (current).
  If asked to revert, the previous design was a sticky pill above the
  category strip.
- **Dark mode is OPT-IN.** First-time visitors land in light theme. Stored
  in `localStorage.ar_theme`.

---

## 7. Where main is right now (HEAD = `7263f0c`)

### Customer menu (`/restaurant/[subdomain]`)

- **Top header (sticky):** restaurant logo with rotating CircularText, name +
  subtitle, day/night toggle, search icon button, AR Live badge (when AR
  dishes exist), language picker (EN/TA/HI). Smooth Medium-style scroll
  hide/show (per-frame `translateY` finger-track + 180ms snap on idle).
- **Search:** Tap the round search icon in the header → expands a full-width
  pill input below. Esc / × clears + closes. On mobile, `enterKeyHint="search"`
  + form-submit blur dismisses the keyboard. Active search hides the AR
  banner / Combo Deals / category sections and shows a flat result list.
- **Category strip (image tiles):** below the search bar. Each tile shows a
  64×64 circular image (admin-uploaded → first-item fallback → emoji). Tap a
  tile → smooth-scrolls the page so the matching `cat-section-{slug}` ID
  lands `~hdrHeight + 16` from the top of the viewport (no longer covered by
  the sticky header).
- **AR banner (v4):** compact horizontal layout, ~96px tall. SVG on left:
  iPhone-realistic phone (notch + home indicator + side buttons + orange
  gradient screen) + small wooden table on the right. Animated dish rises
  out of the phone, lands on the table with a shimmer ring. Brand palette
  (`#F79B3D`, `#C97A1A`, `#FFE6CF`). Headline: "See it on your table".
  Subtitle: "Tap any card with the AR pill, then 'View in AR' to preview…".
  Pill: "★ N dishes ready". **No CTA chip** (the previous TRY IT chip read
  as a broken button — explicitly removed per Prabu's feedback).
- **Combo Deals section:** above the category sections. Always renders if
  any active combo exists (was previously gated on `activeCat === 'All'`
  which silently hid combos when a tile was tapped — fixed in `535ae4c`).
- **Category sections:** one per category in admin-set order, each with a
  heading bar + horizontal-scroll row of menu cards. Cards keep the original
  full-info layout (image + name + price + badges + AR pill + sold-out
  overlay). Featured items appear first within each category. Section IDs
  are `cat-section-{slugified-name}` for the tile-tap scroll targets.
- **Card design (unchanged from baseline):** 185px image with sold-out /
  out-of-stock overlays + AR pill + veg dot + offer ribbon. Body shows
  badges (max 2: Chef's Special > Featured > Popular > offer label),
  name (multilingual), price (with offer crossout), calories, rating,
  spice level + prep time, AR CTA hint.
- **Quick-add (+) button:** floating round button bottom-right of every
  card image. Plain item → instant base-price add to cart. Item with
  variants (Half/Full etc.) → opens detail modal so user picks. Once
  in cart, button morphs into `−  N  +` stepper. Implemented as a
  `<span role="button">` because the card outer element is itself a
  `<button>`.
- **Bottom FABs (fixed):** Order Status / My Bill (top row, conditional
  on order placed), Cart (top row right when items in cart),
  Help Me Choose / Call Waiter (bottom row, always visible).
- **Welcome coach-mark tour (first visit):** 6 steps for takeaway, 7 for
  dine-in. Step 1 + last step are no-target (centered intro/outro).
  Steps 2-N spotlight real DOM elements. Tour state persists per-restaurant
  via `localStorage.ar_welcome_seen_{rid}`.
  - **Step 2 highlights `.card .c-img` (dish photo only, not full card).**
    With full-card spotlight the tooltip overlapped the rest of the card.
  - **Spotlight tracks scroll frame-perfect** (rAF-throttled measure on
    scroll/resize, no CSS transition on geometry).
  - **Placement decided once per step** based on whether the target is
    inside a `position: fixed` ancestor:
    - **Fixed (FABs):** skip scroll-to-top, place tooltip ABOVE.
    - **Scrollable (cards, headers):** scroll target to 88px from top,
      place tooltip BELOW.
- **Item detail sheet (`SwipeableSheet`)** and all overlay sheets
  (`SheetOverlay`): swipe-to-close works ANYWHERE on the sheet, gestures
  state-machined as `idle | pending | dragging | scrolling`. If the inner
  scroll is at top and user pulls down → sheet drag commits. If scroll is
  not at top OR user pulls up → native scroll keeps. (Swiggy-style).
- **Order-more card (dine-in only):** after the rating sheet dismisses on a
  dine-in order, an "Order more?" sheet opens. "Yes, order more" closes the
  card; tapping the X / backdrop opens the bill modal with payment-method
  picker. Takeaway skips this card (customers walk away after pickup).

### Admin items (`/admin/items`)

- **Header:** breadcrumb, Add Items button, matte-black TEAM stat card
  (Total / Active / Hidden / OOS / Sold-Out-Today counts).
- **Restaurant Code banner:** subdomain shown prominently with a Copy
  button (added so admin can share the code with new staff).
- **Filters:** All / Active / Hidden / Out of stock / Sold today, plus
  search.
- **Customer-menu category order strip (drag-reorder):**
  one chip per category in customer-menu order. Each chip:
  - Drag handle (`⋮⋮`) — drag to reorder; saves to
    `restaurants/{rid}.categoryOrder`.
  - Circular image button — click to upload that category's tile photo
    (uploads at 320×320 max, 0.82 quality). Click × next to chip to
    clear admin image (revert to first-item fallback).
  - ✎ pencil — inline rename. Refuses if the category contains
    Petpooja-mirrored items in hybrid mode.
  - Item count badge.
- **Items table (grouped by category):** rows in customer-menu order,
  with featured-first sort within each category and sold-out-today sinking
  to the bottom. Category heading row injected each time category changes.
  Existing per-row drag-reorder, image upload, edit, delete still works.
- **Bulk actions:** Mark sold today / available today / Change category /
  Delete (uses ConfirmModal).
- **Optimize images** button: now covers BOTH menu items AND admin
  category images. ConfirmModal (replaces native `confirm()`) shows
  e.g. "Optimize 5 menu + 2 category images?". Per-image cap was
  tightened in commit `4dd8d5e` (default 1200×1200 → 800×800, JPEG
  quality 0.85 → 0.78, skip-threshold 200KB → 80KB).
- **Hybrid Petpooja mode:** when restaurant.posMode === `petpooja_hybrid`,
  shows yellow banner. Items with `petpoojaItemId` get an orange
  "Petpooja" badge. Edit/delete on those items → toast "managed in
  Petpooja". Local items (no `petpoojaItemId`) are always editable.

### Other admin pages

- **Kitchen:** orders auto-show, sound + voice announcements for new
  orders. Pending → Start. Preparing/Ready → per-item Mark Ready /
  Mark Served buttons. Order auto-flips to status='served' when ALL
  items have `servedAt`. Recall to New shortcut still on preparing.
- **Waiter:** action queue with Calls + per-item Serves + Payment
  collection. Per-item ready triggers a serve action (was previously
  only fired when whole order was ready). Cash payment → modal with
  cashReceived + auto-computed change.
- **Staff:** restaurant code banner up top. Add staff is faster
  (parallelized PIN hash + uniqueness check, fire-and-forget Auth
  pre-provisioning). Live Firestore listener on each staff's own doc
  forces logout when admin disables/deletes. Token-refresh fallback
  in `useStaffAuth` catches the case the listener misses.
- **Requests:** AR-model upload form with auto-translate (TA/HI)
  via MyMemory free API and auto-calculate-nutrition via USDA FDC API.
  USDA query now uses `dataType=Foundation,SR Legacy` filter +
  pageSize=5 + best-name-match selection + unit-`g` checks on
  protein/carbs/fats + zero-result fallback.
- **Subscription:** Razorpay upgrade flow. Now requires admin
  idToken + accepts optional idempotencyKey. **Razorpay env vars
  must be set on Vercel** (`RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`,
  `NEXT_PUBLIC_RAZORPAY_KEY_ID`) — Prabu has not confirmed this yet.

### Customer-menu side (additional)

- **Per-item ready/served stamping** in `lib/db.js` via
  `markOrderItemReadyAs` / `markOrderItemServedAs`. Order's overall
  status auto-flips to 'served' when every item has `servedAt`.
- **Send-receipt endpoint** verifies caller owns the restaurant.
- **Order-create** has idempotency via the request body's order id.
- **Firestore rules** harden /analytics writes (YYYY-MM-DD doc id,
  schema-locked, increment-only) and menuItem rating writes (per-write
  delta caps, ratingAvg ∈ [0, 5]).
- **Per-restaurant manifest** validates `subdomain` (`^[a-z0-9-]{1,63}$`)
  and `table` (digits-only, ≤8) before echoing into start_url / scope.

---

## 8. THIS SESSION — every commit, in order

The session opened on production main `4f1f66f` and now sits at `7263f0c`.
46 commits. Grouping by theme below; each has a one-line "what changed" and
the user feedback / context that triggered it.

### A. Audit-fix batches (May 5)

| Commit | What |
|---|---|
| `0e93bd8` | Security audit batch: add-items modDelta validation; firestore.rules tightened on /analytics + ratings; create-order idToken auth + idempotencyKey; manifest subdomain length-validation. |
| `c6ff3c1` | React hooks audit: kitchen + waiter flash-timer cleanup; requests.js USDA + MyMemory fetches wrapped in AbortController timeouts; analytics deps fixed (move priorStartDate inside useMemo); payments deps fixed (use customBounds + periodStart). |
| `71b7fc1` | Code quality: petpoojaSync.applyMenu sequential-commit with partial-success surface; petpoojaSync.loadAndGate console.warn for skipped reasons; staff.js defensive check on getStaffMembers result. |
| `b76029f` | manifest subdomain length cap 32 → 63 (DNS label limit) — fix for restaurants with long names. |

### B. Petpooja paywall hardening (May 5)

| Commit | What |
|---|---|
| `326a9ea` | create-order surfaces underlying Razorpay error description back to client (+ hint when env vars missing); items page only blocks edit/delete when `petpoojaItemId` is set + adds orange "Petpooja" badge per item. |
| `1d062ea` | items.js confirm() → ConfirmModal for delete/bulk-delete; petpoojaSync.disconnect() now `isActive: false` on every Petpooja-mirrored item. |
| `0e7d68a` | items.toggleActive + handleSave refuse to re-enable / save Petpooja items when not in `petpooja_hybrid` mode. Three-layer paywall: auto-disconnect + hide-on-disconnect + block-re-activate. |

### C. AR scan UX rework (May 5–8)

After several missteps:

| Commit | What |
|---|---|
| `87476cd` | First "scan UX" attempt: bumped model-viewer to 3.5.0 + added xr-environment + scan-help overlay. **Made things slower.** |
| `fd5bb0b` | **Reverted `87476cd`** — Prabu's call. |
| `1da00c1` | Research-driven retry: stay on 3.4.0, no xr-environment, scan-help overlay rendered as a CHILD of `<model-viewer>` (DOM Overlay constraint), CSS-only visibility via `[ar-status="session-started"]` selector. |
| `c252b73` | Phone-tilt SVG diagram inside the in-AR scan-help overlay. |
| `502d5fe` | **Pre-AR tutorial overlay** that shows BEFORE AR launches. iOS-friendly because Apple's AR Quick Look replaces our HTML once AR starts; this teaches posture before the handoff. |
| `f35ec7c` | Tutorial v2: minimal copy, animation-led, instant transition, reliable iOS auto-launch via `arBtn.click()` (preserves user-gesture chain better than `viewer.activateAR()`). |
| `44398b7` | Tutorial v3: redrew SVG as a side-view (phone rises + tilts above a wooden table) per Prabu's photoshop reference. |
| `0c38a61` | Tutorial v4: SMIL-only animation timing (was CSS for phone + SMIL for beam — drifted), slowed to 6s, beam path retuned. |

### D. Page-level audit follow-ups (May 8)

| Commit | What |
|---|---|
| `3eab53d` | Quick-wins batch: Restaurant Code banner on /admin/staff; staff create ~330ms faster (parallelize PIN-hash with username uniqueness + fire-and-forget auth pre-provisioning); nutrient calc fixes (USDA dataType filter, pageSize=5, unit checks, sanity guard). |
| `88b3db2` | Staff session invalidation: live Firestore listener in kitchen.js + waiter.js on the staff's own doc (real-time logout on disable/delete); token-refresh fallback via onIdTokenChanged in useStaffAuth. Per-item ready/served on /admin/kitchen with `markOrderItemReadyAs` + `markOrderItemServedAs` helpers. |
| `9bd612c` | Build fix: I'd added the `markOrderItemReadyAs` exports to lib/db.js but forgot to git-add the file. Build broke; this commit adds the file. |
| `849f9d0` | Order-more card after rating in dine-in; takeaway unchanged. |
| `00d4afc` | Build fix: `showOrderMoreCard` was used in the body-scroll-lock useEffect deps array but declared further down — TDZ at prerender. Hoisted to the modal-flags block. |
| `233c2f8` | Waiter per-item notification (actionQueue now emits one serve entry per ready-but-not-served item across all in-flight orders) + staff sign-in bounce fix (firestore.rules let staff read own doc; listener no longer logs out on permission-denied — only on snapshot data showing the staff is gone). |
| `507b2f1` | Replaced native confirm() with ConfirmModal for staff delete (was missed when /admin/items got the same fix in `1d062ea`). |

### E. Menu redesign — admin-controlled order, badges, AR banner v3 (May 8)

| Commit | What |
|---|---|
| `4222729` | Step 1: built `featuredSection` / `categorySections` / `categoryStrip` data derivations off `enrichedItems`. No UI change. |
| `508911b` | Step 2: replaced flat `.grid` with horizontal-scroll `.cat-section` + `.cat-row` per category. Featured top-section above. CSS scroll-snap. Cards keep their visual layout. |
| `3f04506` | Step 3: replaced text pills with image-tile category strip. Featured tile prepended (gold). Tap-to-scroll handler. |
| `3792376` | Step 4: quick-add (+) button on every card. Items with variants → modal. Sold-out / OOS → no button. |
| `59037b4` | Step 5: AR banner v1 with explanatory SVG (dish rises from phone onto table). |
| `ea593b0` | Commit A: dropped the auto-Featured row + Featured tile per Prabu's revised spec. Featured items keep showing first WITHIN each category. |
| `79577b2` | Commit B: drag-reorder strip on /admin/items writes to `restaurants/{rid}.categoryOrder`; customer page reads it. New categories auto-append at end. |
| `264e8c1` | Commit C: per-category image upload on each chip (320×320 cap, 0.82 quality). Stored as `restaurants/{rid}.categoryImages` map. × button to clear admin image. |
| `a3e2a87` | Commit D: /admin/items rows grouped under category headings (customer-menu order, featured-first inside each, sold-out sinks). Category heading row injected each time the rendered item's category differs. Existing drag/select unchanged. |
| `a80d72d` | Commit E: badge hierarchy on customer card (Chef's Special > Featured > Popular > offer label, max 2 visible). Removed legacy offer-label ribbon over the image. |
| `e89e3f2` | Commit F: AR banner v2 — vertical centred layout, no TRY IT chip, bigger SVG (200×120). |

### F. Mid-session tweaks (May 8)

| Commit | What |
|---|---|
| `2701139` | Move search to header icon button + iOS auto-zoom guard (16px font-size global rule) + tighter category image resize on upload. |
| `216a92c` | Header smoothness — first attempt: binary state + CSS transition. Plus category-click scroll-offset (uses measured hdrHeight) and onKeyDown blur on cart inputs. |
| `7b3ff83` | #1: ConfirmModal for "Optimize images" + extends bulk-optimize to category images. lib/storage.optimizeOneImage now accepts opts forwarded to resizeImage. |
| `8152d58` | #5 AR banner v4: prominent phone (52×92, ~45% of SVG width) + brand palette (#F79B3D / #C97A1A / #FFE6CF / cream) + dropped sparkle dots + iPhone-real details (notch, home indicator, side buttons). |

### G. Header/optimizer correction batch (May 8–9)

Prabu reported the binary-state header was glitching, asked to revert.

| Commit | What |
|---|---|
| `4dd8d5e` | Revert header to Medium-style pixel-by-pixel + tighten image optimizer (defaults 1200×1200/0.85 → 800×800/0.78; skip threshold 200KB → 80KB; re-encode threshold 500KB → 200KB). |
| `620ff85` | Build fix: I had a duplicate `scrollTicking` const after the revert. Removed the duplicate. |

### H. Coach-mark tour smoothing (May 8–9)

| Commit | What |
|---|---|
| `6630720` | First "smoother" attempt: 0.32s CSS transitions on the SVG mask rect / spotlight ring / tooltip top+left + tighter tooltip + 96px SAFE_BOTTOM. **Made step transitions feel laggy** (transitions chasing scroll = 700ms behind). |
| `e3b59a2` | Removed all those transitions; rAF-throttle scroll/resize re-measurement so the spotlight tracks the scroll frame-perfect. Removed 380ms setTimeout — measure immediately. Step 2 selector changed from `.card` to `.card .c-img` so the spotlight only covers the dish photo (~185px) instead of the full card (~500-600px). |
| `da28867` | Pin-target-near-top (88px) + always-place-tooltip-below for scrollable targets. Removed above/below/centered branching that flip-flopped during scroll. |
| `7263f0c` | Detect fixed-position-ancestor targets (FABs); skip scroll-to-top + lock placement to 'above' for those. Light theme default (was dark). |

---

## 9. Pending work / open questions / loose ends

### Blocking

1. **Razorpay env vars on Vercel** — Prabu needs to set
   `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, and `NEXT_PUBLIC_RAZORPAY_KEY_ID`
   in the Production environment for the subscription upgrade flow to work.
   The new client-side error toast surfaces "Authentication failed" when
   Razorpay rejects credentials. Until this is set, no one can upgrade.

### Iteration in progress

2. **Header smoothness** — Prabu still feels Medium-style scroll has the
   "step-by-step / brake-pumping" feel he originally complained about, but
   the binary-state alternative was worse (glitchy). Current state is
   acceptable but not great. Options offered (waiting for choice):
   - (a) Smaller pixel steps (low-pass filter on diff)
   - (b) `position: fixed` + `transform: translate3d` (explicit GPU layer)
   - (c) IntersectionObserver-driven binary with longer 0.5s ease-in-out
   - (d) Just leave the header always visible (zero risk, lose the screen
     space)

3. **AR banner mood** — Prabu has gone through v1 (vertical/cartoonish) →
   v2 (centred/bigger) → v3 (compact horizontal) → v4 (prominent phone +
   brand palette). v4 is live. No active complaints but Prabu may want
   another iteration if shown a reference image.

### Not started

4. **iOS USDZ generation** — flagged for later. Apple AR Quick Look needs
   `.usdz` files; we only have `.glb`. Without USDZ the iOS "View in AR"
   button works only because of Apple's GLB→USDZ runtime fallback, which
   is unreliable. Real fix requires server-side `usdzconvert` (Apple's
   tool) or commercial converters.

5. **Service worker version** — `public/sw.js` currently `ar-v24`.
   Bump on the next material change to invalidate browser caches.

6. **Pre-existing console hydration errors on /pitch and customer menu**
   — flagged in audit but not fixed. Console noise, no user-visible bug.

### From original April-2026 roadmap (still pending)

7. **PWA / offline support** (HIGH)
8. **Email notifications polish** — order confirmations exist
   (`api/email/send-receipt`), daily summary cron exists. Delivery
   reliability + templates need work.
9. **Super-admin pages polish** to match the cinematic theme of admin.
10. **Allergen / dietary tags** (Jain, Gluten-free badges).
11. **Loyalty system** — coupons exist, no points-based rewards.
12. **Custom domain** — `HaloHelm.com` not purchased.
13. **Test suite** — no Jest/Playwright.

---

## 10. User preferences and working style (Prabu)

- **Non-technical solo founder.** Talk in plain English; explain *why* a
  fix works, not just *what* it does.
- **Reviews diffs before accepting.** Walk him through what changed.
- **Strong design opinions** but iterates by reaction (ships v1, says
  "make it more like X", iterates). Doesn't always articulate the goal
  upfront — be ready to iterate 3-4× on visual work.
- **Asks for "context file for chat" / handoff doc** when switching
  chats. This document IS the response to one of those.
- **Uses two Claude surfaces in parallel:**
  - Claude.ai chat (claude.ai) for design + multi-file work — outputs
    complete files he downloads + replaces.
  - Claude Code CLI (this current chat) for targeted fixes + git ops.
  When working on the same project across both, they can step on each
  other — handoff docs like this prevent that.
- **Morning sessions** (before 6:30pm IST) preferred to dodge peak quota.
- **Strict bug-guard discipline** — see Section 5. He'll call out
  regressions on these immediately.
- **Honest reviews** — when something doesn't work he'll say so directly
  ("not good enough", "still hidden", "feels jaggy"). Don't sugarcoat in
  return; he prefers candor.

---

## 11. What NOT to touch / ship without explicit approval

- **`model-viewer` library version.** Locked at 3.4.0 (CDN cache).
- **Customer menu palette tokens** (`#F79B3D` / `#FFE6CF` / `#1E1B18` etc.)
  and admin palette tokens (`A.ink` / `A.warning` / etc.).
- **`lib/db.js` function names + signatures.** Add new ones at the
  bottom; never rename.
- **Pages Router architecture.** No `app/` directory.
- **Existing migrations** — Petpooja schema, staff custom-claim shape
  (`{role, rid, staffId, kind: 'staff'}`), Firestore rule structure.
- **Plan catalog (`lib/plans.js`)** — single source of truth. If price
  or limit changes, edit there only.
- **Hooks order in `pages/restaurant/[subdomain]/index.js`** — extremely
  long file with strict declaration ordering. New state goes in the
  modal-flags block ~line 850-1100; new effects go AFTER all state
  declarations but BEFORE the body-scroll-lock useEffect.
- **`firestore.rules`** — already deployed against production data.
  Tightened for /analytics + ratings + staff self-read in this session.
  Any change requires `firebase deploy --only firestore:rules`.

---

## 12. How to deploy / verify

- **Code:** push to `claude/fervent-bassi-70891e` → also push to `main`
  (current workflow `git push origin claude/fervent-bassi-70891e:main`).
  Vercel auto-builds main.
- **Firestore rules:** `firebase deploy --only firestore:rules`
  (Prabu's machine has this configured; Claude Code CLI also has access
  via `firebase` CLI v15.12.0 logged into project `advert-radical`).
- **Vercel env vars** (Razorpay) — UI: project → Settings → Environment
  Variables → Production. Must redeploy after editing.
- **Cron schedule** is at `vercel.json` — `0 4 * * *` (daily 04:00 UTC).
  Hobby plan caps at once-per-day; don't add more crons without
  upgrading the Vercel plan.

---

## 13. Quick reference — recent session firestore.rules

The rules at HEAD honor:
- Public read on restaurants, menuItems, orders, offers, combos, etc.
- Public schema-locked write on `/analytics` (YYYY-MM-DD doc id only;
  increment-only counters; allowed field set).
- Public schema-locked update on menuItems for views/arViews/ratings
  (per-write deltas capped: views/arViews ≤ +1, ratingCount ≤ +1,
  ratingSum delta in [0,5], ratingAvg ∈ [0,5]).
- Staff can read their OWN staff doc (custom claim staffId match).
- Restaurant admin can read/write all their restaurant's data.
- Superadmin full access.
- Staff (kind === 'staff', rid match) can read+update orders +
  waiterCalls + tableBills + only the `currentBillId` field of
  tableSessions.

---

## 14. Pasteable kickoff message for the new chat

```
I'm continuing work on HaloHelm (AR + AI SaaS for Indian restaurants,
Next.js Pages Router, Firebase). I've just pasted CHAT_CONTEXT.md which has
the full project context, palette tokens, file paths, every change in the
last session, bug guards, and a list of pending work.

Production main HEAD is 7263f0c. Branch is claude/fervent-bassi-70891e on
GitHub: https://github.com/git-prabu/AR-SaaS

Next focus: design improvements to the customer menu card. I'd like a
designer-grade pass on the menu item card on /restaurant/[subdomain] —
look-and-feel, hierarchy, breathing room, micro-interactions. Keep
everything functional (price, badges, AR pill, quick-add (+) button,
sold-out overlay, OOS overlay, rating, calories, prep time, spice level)
but propose a more polished visual treatment.

Ground rules from the handoff doc that apply to design work:
- Customer menu palette is locked (#F79B3D, #C97A1A, #FFE6CF, #FFD58A,
  cream backgrounds, #1E1B18 text). Don't change tokens; only how they're
  used.
- Body font Inter, display Poppins, mono JetBrains Mono.
- Pages Router only.
- Output complete files with the file-path mapping at the top, since I
  download + replace manually.
- Never reorder isSoldOutToday vs enrichedItems; never declare modal
  state below the body-scroll-lock useEffect (TDZ at prerender).
- Categorized horizontal-scroll layout stays — only the card visual
  changes. Quick-add button must keep its current position (bottom-right
  of image).

Please ask me 2-3 quick questions if you need direction (e.g. "softer or
sharper corners?", "more or less negative space?", "any reference apps?")
before producing the v1.
```

---

*End of handoff. Last commit on main: `7263f0c`. Document path:
`CHAT_CONTEXT.md` in the project root of the worktree
`.claude/worktrees/fervent-bassi-70891e/`.*
