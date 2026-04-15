# ADVERT RADICAL — Complete Project Handoff Document

**Version:** v6 | **Date:** April 9, 2026 | **Author:** Prabu D (Chennai, India)
**Production:** https://ar-saa-s-kbzn.vercel.app
**GitHub:** https://github.com/git-prabu/AR-SaaS

---

## 1. WHAT IS ADVERT RADICAL?

Advert Radical is an **AR + AI SaaS platform** that gives Indian restaurants a QR-code-based digital menu with:
- **WebAR 3D dish previews** — customers scan a table QR code, see a live 3D model of each dish on their phone
- **AI-powered upselling** — Claude (Anthropic) suggests add-ons & combos based on what customers are ordering
- **Real-time waiter calls** — customers tap to call a waiter; kitchen/staff get instant audio + push notifications
- **Full admin dashboard** — analytics, menu management, order tracking, combo builder, offers, QR codes, payments
- **Super admin panel** — platform-level management of all restaurants, plans, AR model requests

**Business model:** B2B SaaS for restaurant chains. Three monthly plans:
| Plan | Price | Max Items | Storage |
|------|-------|-----------|---------|
| Starter | ₹999/mo | 25 | 500 MB |
| Growth | ₹2,499/mo | 75 | 2 GB |
| Pro | ₹4,999/mo | Unlimited | 10 GB |

**Demo routes:**
- Customer menu: `/restaurant/spot`
- Admin dashboard: `/admin/login`
- Super admin: `/superadmin/login`
- Pitch deck: `/pitch` (password: `RADICAL25`)

---

## 2. TECH STACK

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 16.1.6 (**Pages Router ONLY** — never App Router) |
| Frontend | React 18, CSS-in-JS (inline styles), Recharts, GSAP, react-hot-toast |
| Auth | Firebase Auth (dual instances: `adminAuth` + `superAdminAuth`) |
| Database | Firestore (client SDK via `lib/firebase.js`) |
| Storage | Firebase Storage (images + GLB 3D models) |
| AR | `<model-viewer>` web component via `public/ar-viewer.html` iframe |
| AI | Claude API (Anthropic) for menu upselling |
| Payments | Razorpay (API routes for order creation + signature verification) |
| 3D Generation | Meshy AI Image-to-3D API (generates GLB from dish photos) |
| Drag & Drop | @dnd-kit (menu item reordering) |
| Export | xlsx (CSV/Excel export from analytics) |
| Hosting | Vercel (auto-deploy from `main` branch) |
| Dev Tools | ESLint, Tailwind CSS (minimal usage — mostly inline styles) |

---

## 3. PROJECT STRUCTURE

```
advert-radical/
├── pages/
│   ├── index.js                          # Landing page / homepage
│   ├── pitch.js                          # Investor pitch deck (pw: RADICAL25)
│   ├── seed.js                           # Database seeder (dev utility)
│   ├── _app.js                           # App wrapper — auth providers, error boundary
│   ├── _document.js                      # HTML document head
│   │
│   ├── restaurant/
│   │   └── [subdomain]/
│   │       └── index.js                  # Customer menu page (967 lines)
│   │                                     # AR viewer, ratings, combos, orders, waiter calls
│   │
│   ├── admin/
│   │   ├── login.js                      # Restaurant admin login
│   │   ├── index.js                      # Admin dashboard home
│   │   ├── analytics.js                  # Analytics dashboard (967 lines)
│   │   ├── orders.js                     # Order management (pending→preparing→ready→served)
│   │   ├── items.js                      # Menu items CRUD (~566 lines)
│   │   ├── combos.js                     # Smart combo builder
│   │   ├── offers.js                     # Time-limited offers management
│   │   ├── payments.js                   # Payment/transaction history
│   │   ├── requests.js                   # AR model upload requests
│   │   ├── notifications.js              # Staff push notifications
│   │   ├── qrcode.js                     # QR code generator for table sessions
│   │   └── subscription.js              # Plan management & Razorpay integration
│   │
│   ├── superadmin/
│   │   ├── login.js                      # Super admin login
│   │   ├── index.js                      # Platform overview dashboard
│   │   ├── restaurants.js                # Manage all restaurants
│   │   ├── requests.js                   # Approve/reject AR model requests
│   │   ├── plans.js                      # Subscription plan management
│   │   └── restaurant/
│   │       └── [id].js                   # Individual restaurant detail page
│   │
│   └── api/
│       ├── generate-model.js             # Meshy AI Image-to-3D API integration
│       └── payments/
│           ├── create-order.js           # Razorpay order creation
│           └── verify.js                 # Razorpay payment signature verification
│
├── components/
│   └── layout/
│       ├── AdminLayout.jsx               # Admin sidebar with real-time listeners
│       └── SuperAdminLayout.jsx          # Super admin sidebar layout
│   └── ARViewer.jsx                      # model-viewer iframe wrapper
│
├── lib/
│   ├── firebase.js                       # Firebase client init (dual apps)
│   ├── firebaseAdmin.js                  # Firebase Admin SDK (server-side)
│   ├── db.js                             # Client Firestore helpers (40+ functions)
│   ├── saDb.js                           # Super admin Firestore helpers
│   ├── storage.js                        # Firebase Storage helpers (admin)
│   ├── saStorage.js                      # Firebase Storage helpers (superadmin)
│   └── utils.js                          # Design tokens (T object) + utilities
│
├── hooks/
│   └── useAuth.js                        # Dual auth hook (admin + superadmin)
│
├── contexts/
│   └── AdminDataContext.js               # Shared real-time orders & waiter calls
│
├── public/
│   ├── ar-viewer.html                    # Standalone model-viewer for AR
│   ├── notification.mp3                  # Bell tone for order/call alerts
│   └── ar-experience.png                 # Marketing image
│
├── middleware.js                          # Subdomain routing (edge middleware)
├── next.config.js                        # Next.js config (image domains, strict mode)
└── package.json                          # Dependencies & scripts
```

---

## 4. ARCHITECTURE

### 4.1 Dual Firebase Authentication
Two separate Firebase app instances run in the browser:
- **`adminApp`** — used by restaurant admins AND customers
- **`superAdminApp`** — used exclusively by platform super admins

Each has its own `auth` object with independent sign-in sessions. This prevents auth collisions between admin and superadmin.

```
lib/firebase.js exports:
  adminApp, adminAuth       → used by hooks/useAuth.js (useAuth, useAdminAuth)
  superAdminAuth            → used by hooks/useAuth.js (useSuperAdminAuth)
  db (adminApp Firestore)   → used by lib/db.js
  superAdminDb              → used by lib/saDb.js
  storage, superAdminStorage
```

### 4.2 Subdomain Multi-Tenancy
- `middleware.js` intercepts requests at the edge
- Extracts subdomain from hostname (e.g., `spot` from `spot.advertradical.com`)
- Rewrites to `/restaurant/[subdomain]` — the customer menu page
- Local dev uses `?sub=spotname` query param
- Reserved subdomains (www, superadmin, api) are skipped

### 4.3 Real-Time Data Flow
```
AdminLayout.jsx
  └── onSnapshot listeners (Firestore)
      ├── orders collection → AdminDataContext
      └── waiterCalls collection → AdminDataContext
          └── All admin pages consume via useAdminOrders() / useAdminWaiterCalls()
              └── No duplicate listeners (context prevents re-subscription)
```

### 4.4 AR Model Pipeline
```
Restaurant uploads dish photo
  → Admin submits AR request (pages/admin/requests.js)
  → Super admin approves (pages/superadmin/requests.js)
  → Meshy AI generates GLB model (pages/api/generate-model.js)
  → Model stored in Firebase Storage
  → Customer sees 3D model in menu (public/ar-viewer.html iframe)
```

### 4.5 Payment Flow
```
Customer places order → createOrder() in Firestore
Admin creates Razorpay order → /api/payments/create-order
Razorpay checkout opens → customer pays
Verify signature → /api/payments/verify
Update restaurant subscription in Firestore
```

---

## 5. FIRESTORE DATA MODEL

```
restaurants/{restaurantId}/
├── name, subdomain, email, phone, address, logo
├── plan ('starter'|'growth'|'pro'), maxItems, maxStorageMB
├── subscriptionStart, subscriptionEnd, paymentStatus
├── isActive, createdAt
│
├── menuItems/{itemId}
│   ├── name, description, category, price
│   ├── imageURL, modelURL, arReady
│   ├── isFeatured, isActive, sortOrder
│   ├── ingredients[], calories, protein, carbs, fats, prepTime
│   ├── spiceLevel (1-5), isVeg (boolean), badge (text)
│   ├── views, arViews
│   ├── ratingSum, ratingCount, ratingAvg
│   └── createdAt, updatedAt
│
├── orders/{orderId}
│   ├── items [{name, price, qty}], total
│   ├── tableNumber
│   ├── status ('pending'|'preparing'|'ready'|'served')
│   ├── paymentStatus ('paid'|'unpaid'), paymentUpdatedAt
│   └── createdAt, updatedAt
│
├── analytics/{YYYY-MM-DD}
│   ├── totalVisits, uniqueVisitors, repeatVisitors
│   ├── sessions[]
│   └── date
│
├── waiterCalls/{callId}
│   ├── tableNumber
│   ├── status ('pending'|'resolved')
│   └── createdAt, resolvedAt
│
├── offers/{offerId}
│   ├── title, description, discount
│   ├── startDate, endDate
│   ├── applicableItems[]
│   └── createdAt, updatedAt
│
├── combos/{comboId}
│   ├── name, description, price, itemIds[]
│   ├── isActive
│   └── createdAt
│
├── tableSessions/{tableNumber}
│   ├── sid (session ID — rotates on QR activation)
│   ├── isActive, expiresAt
│   └── createdAt
│
└── requests/{requestId}
    ├── name, description, category, price, imageURL
    ├── nutritionalData {calories, protein, carbs, fats}
    ├── prepTime, spiceLevel, isVeg, badge, ingredients[]
    ├── status ('pending'|'approved'|'rejected')
    ├── modelURL, arReady
    └── createdAt, reviewedAt

users/{uid}/
├── email, role ('restaurant'|'superadmin')
├── restaurantId, restaurantName
└── createdAt

plans/{planId}/
├── name, price, maxItems, maxStorageMB
└── features[]
```

---

## 6. DESIGN SYSTEM

### 6.1 Cinematic Color Palette (LOCKED)

| Token | Hex | Usage |
|-------|-----|-------|
| Deep Forest | `#263431` | Primary accent, sidebar bg, dark sections |
| Antique Gold | `#C4A86D` | Highlights, badges, gold accents |
| Soft Cream | `#EAE7E3` | Page backgrounds, muted surfaces |
| Stone Grey | `#635F5A` | Secondary text, subtle labels |
| White | `#FFFFFF` | Card backgrounds |
| Charcoal | `#3A4A46` | Body text on light bg |
| Sand | `#D6CCBA` | Borders, dividers |
| Success Green | `#4A7A5E` | Positive metrics |
| Danger Red | `#8A4A42` | Alerts, negative metrics |
| Warning Gold | `#C4A86D` | Caution states |

### 6.2 Typography

| Element | Font | Weight | Size |
|---------|------|--------|------|
| Page titles | Playfair Display | 700 | 30px |
| Section headings | Playfair Display | 700 | 22px |
| Metric values | Outfit | 700 | 24-30px |
| Body text | Outfit | 400-500 | 13-14px |
| Labels | Outfit | 600 | 10-12px |

### 6.3 Spacing & Effects
- Card border-radius: 14px
- Button border-radius: 10px
- Pill border-radius: 24px
- Card shadow: `0 1px 4px rgba(38,52,49,0.06)`
- Elevated shadow: `0 8px 32px rgba(38,52,49,0.10)`

### 6.4 Design Tokens Location
All tokens live in `lib/utils.js` as the `T` object. Every admin page imports `T` and uses inline CSS-in-JS styles referencing these tokens.

---

## 7. ENVIRONMENT VARIABLES

Create `.env.local` with:

```env
# Firebase Client (public — prefixed NEXT_PUBLIC_)
NEXT_PUBLIC_FIREBASE_API_KEY=
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=
NEXT_PUBLIC_FIREBASE_PROJECT_ID=
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=
NEXT_PUBLIC_FIREBASE_APP_ID=

# Firebase Admin (server-only — used in API routes)
FIREBASE_ADMIN_PROJECT_ID=
FIREBASE_ADMIN_CLIENT_EMAIL=
FIREBASE_ADMIN_PRIVATE_KEY=        # Include literal \n in the key

# Razorpay
NEXT_PUBLIC_RAZORPAY_KEY_ID=
RAZORPAY_KEY_ID=
RAZORPAY_KEY_SECRET=

# Domain
NEXT_PUBLIC_BASE_DOMAIN=advertradical.com
```

---

## 8. KEY DATABASE FUNCTIONS (lib/db.js)

40+ exported functions organized by domain:

**Restaurants:** `getRestaurantBySubdomain`, `getRestaurantById`, `getAllRestaurants`, `createRestaurant`, `updateRestaurant`

**Menu Items:** `getMenuItems`, `getAllMenuItems`, `incrementItemView`, `incrementARView`, `updateMenuItem`, `deleteMenuItem`, `createMenuItem`, `getAllMenuItemsAllRestaurants`

**Orders:** `createOrder`, `getOrders`, `updateOrderStatus`, `updatePaymentStatus`

**Analytics:** `trackVisit`, `getAnalytics`, `getTodayAnalytics`, `getWaiterCallsCount`

**Waiter Calls:** `createWaiterCall`, `getWaiterCalls`, `resolveWaiterCall`, `deleteWaiterCall`

**Offers:** `getActiveOffers`, `getAllOffers`, `createOffer`, `updateOffer`, `deleteOffer`

**Combos:** `getCombos`, `createCombo`, `updateCombo`, `deleteCombo`

**Requests:** `getRequests`, `getAllPendingRequests`, `submitRequest`, `updateRequestStatus`, `deleteRequest`, `submitRequestAndPublish`

**Users:** `getUserData`, `createUserDoc`

**Ratings:** `rateMenuItem`

**Table Sessions:** `activateTableSession`, `clearTableSession`, `getTableSession`, `getAllTableSessions`, `isSessionValid`, `isSessionValidWithSid`

---

## 9. ADMIN SIDEBAR NAVIGATION

The admin sidebar (`AdminLayout.jsx`) is organized into 5 sections:

```
OVERVIEW
  ├── Analytics          /admin/analytics
  └── Revenue Reports    /admin/revenue (placeholder)

OPERATIONS
  ├── Orders             /admin/orders
  ├── Kitchen (KDS)      /admin/kitchen (placeholder)
  ├── Waiter             /admin/waiter (placeholder)
  └── Payments           /admin/payments

MENU
  ├── Menu Items         /admin/items
  ├── Combo Builder      /admin/combos
  ├── Offers             /admin/offers
  └── Coupons            /admin/coupons (placeholder)

PEOPLE
  ├── Staff Logins       /admin/staff (placeholder)
  ├── Customer Feedback  /admin/feedback (placeholder)
  └── Notifications      /admin/notifications

SETUP
  ├── Add Items          /admin/requests
  ├── QR Code            /admin/qrcode
  ├── Settings           /admin/settings (placeholder)
  └── Subscription       /admin/subscription
```

*Note: Items marked "placeholder" have nav entries but incomplete or missing page implementations.*

---

## 10. ANALYTICS DASHBOARD (pages/admin/analytics.js)

The analytics page (967 lines) is the most complex admin page. It features:

### Sections (top to bottom):
1. **Hero Header** — Restaurant name + "Analytics" (gold italic), date range selector (7/14/30/90 days)
2. **LIVE TODAY** — Large white card with 4 colored stat cards: Visitors (blue), Orders (green), Revenue (gold), Waiter Calls (coral)
3. **Smart Insights** — Dark green gradient background, 4 AI-generated insights with typed badges (WIN / OPPORTUNITY / ACTION NEEDED / INSIGHT), colored left borders
4. **Customer Journey Funnel** — Dark background, tapering funnel visualization (Menu Views → AR Engaged → Ordered), gold conversion badges, overall conversion rate
5. **Dish Performance** — Bento grid layout: best seller hero card + 5 other item cards with progress bars
6. **Visits Over Time** — Gold/green area chart (Recharts AreaChart)
7. **Waiter Call Summary** — Dark cinematic card with response time, resolution rate, total calls
8. **Top Menu Items** — Horizontal bar list showing top 8 items with numbered rankings
9. **Restaurant Health Score** — Score out of 100, motivation quote (when >= 70), always-visible alerts or "ALL CLEAR" indicator

### Data Sources:
- `getAnalytics(restaurantId, days)` — historical visit data
- `getTodayAnalytics(restaurantId)` — today's stats
- `getMenuItems(restaurantId)` — dish performance data
- `useAdminOrders()` — real-time orders from context
- `useAdminWaiterCalls()` — real-time waiter calls from context

---

## 11. CUSTOMER MENU PAGE (pages/restaurant/[subdomain]/index.js)

The customer-facing menu page (967 lines) handles the full dining experience:

- **Table session validation** — QR code contains session ID, validated against Firestore
- **Menu display** — Categories, items with images, prices, ratings
- **AR preview** — Tap to view 3D model via model-viewer iframe
- **Item ratings** — Star rating system, stored in Firestore
- **Active offers** — Time-filtered offer display
- **Combo selector** — Pre-built meal combos
- **Order placement** — Cart → order creation in Firestore
- **Waiter call** — One-tap waiter request
- **Payment integration** — Razorpay checkout
- **View tracking** — `incrementItemView()` and `incrementARView()` for analytics

---

## 12. DEPLOYMENT

### Vercel Configuration
- **Auto-deploy** from `main` branch on push
- **Framework preset:** Next.js (auto-detected)
- **Build command:** `next build`
- **Output directory:** `.next`
- **Environment variables:** Set in Vercel dashboard (all from Section 7)
- **Domain:** `ar-saa-s-kbzn.vercel.app` (custom domain `advertradical.com` not yet purchased)

### next.config.js
```javascript
{
  reactStrictMode: true,
  images: {
    domains: ['firebasestorage.googleapis.com', 'storage.googleapis.com']
  }
}
```

### Local Development
```bash
npm install
# Copy .env.local with Firebase + Razorpay credentials
npm run dev
# Dev server runs on http://localhost:3000
# Use ?sub=spot to simulate subdomain routing locally
```

---

## 13. CRITICAL RULES & CONVENTIONS

1. **Pages Router ONLY** — Never use App Router (app/ directory). All routes are in pages/.
2. **Complete file outputs** — When modifying a file, always output the complete file, never partial patches.
3. **CSS-in-JS inline styles** — The project uses inline `style={{}}` props, not CSS modules or Tailwind classes for component styling.
4. **Design tokens** — Always use `T.xxx` from `lib/utils.js` for colors, fonts, radii, shadows. Never hardcode hex values.
5. **Dual Firebase** — Admin and superadmin use separate Firebase app instances. Never cross them.
6. **isSoldOutToday guard** — Menu items have a `isSoldOutToday` field. Always check it when displaying items to customers.
7. **Font hierarchy** — Page title (30px) > Section heading (22px) > Metric values (24-30px) > Body (13-14px) > Labels (10-12px). Never invert this.
8. **Playfair Display** for headings, **Outfit** for body and numbers.

---

## 14. REMAINING WORK & ROADMAP

### HIGH PRIORITY
- [ ] **Razorpay payments UI** — API routes exist (`/api/payments/`), but the subscription page UI needs to be fully wired up with plan selection → checkout flow
- [ ] **Multi-language menu fields** — `nameTA` (Tamil), `nameHI` (Hindi) inputs in admin items page for multilingual menus
- [ ] **Video in landing page** — Chapter 3 section on `pages/index.js` currently shows an image; replace with video when asset is ready
- [ ] **Placeholder admin pages** — Several sidebar nav items link to pages that don't exist yet:
  - `/admin/revenue` (Revenue Reports)
  - `/admin/kitchen` (Kitchen Display System)
  - `/admin/waiter` (Waiter Management)
  - `/admin/coupons` (Coupon Management)
  - `/admin/staff` (Staff Logins)
  - `/admin/feedback` (Customer Feedback)
  - `/admin/settings` (Restaurant Settings)

### MEDIUM PRIORITY
- [ ] **Allergen/dietary tags** — Veg/Non-veg/Jain/Gluten-free badge system for menu items
- [ ] **Loyalty & coupons system** — Customer loyalty points, coupon generation and redemption
- [ ] **Kitchen Display System (KDS)** — Real-time order queue for kitchen staff
- [ ] **Staff management** — Multiple staff logins per restaurant with role-based access

### LOW PRIORITY
- [ ] **Custom domain** — `advertradical.com` not yet purchased
- [ ] **Dark/light mode toggle** — Currently non-functional in admin
- [ ] **Pitch deck polish** — Visual improvements pending reference designs
- [ ] **PWA support** — Add service worker for offline menu viewing
- [ ] **Email notifications** — Order confirmations, daily summary emails

### KNOWN ISSUES
- Some admin sidebar nav items point to pages that don't exist yet (listed above)
- Analytics page `isSoldOutToday` data depends on restaurant actually using the sold-out feature
- Table session expiry cleanup is not automated (no cron/cloud function)

---

## 15. GIT WORKFLOW

- **Main branch:** `main` — auto-deploys to Vercel
- **Working branches:** Created per feature/session (e.g., `claude/heuristic-mcclintock`)
- **Commit style:** Descriptive messages — "Fix My Bill mobile tap — restructure sheet layout to fix iOS Safari bug"
- **No CI/CD pipeline** beyond Vercel auto-deploy
- **No test suite** currently

---

## 16. THIRD-PARTY SERVICES

| Service | Purpose | Dashboard |
|---------|---------|-----------|
| Firebase | Auth, Firestore, Storage | console.firebase.google.com |
| Vercel | Hosting & deployment | vercel.com/dashboard |
| Razorpay | Payment processing | dashboard.razorpay.com |
| Meshy AI | 3D model generation | meshy.ai |
| Anthropic | Claude AI for upselling | console.anthropic.com |

---

## 17. HOW TO ONBOARD A NEW DEVELOPER / AI ASSISTANT

1. Clone the repo and run `npm install`
2. Get `.env.local` credentials from Prabu (Firebase, Razorpay, Meshy keys)
3. Read this handoff document fully
4. Read `lib/utils.js` for design tokens
5. Read `lib/db.js` for all Firestore operations
6. Read `hooks/useAuth.js` for auth flow
7. Check `components/layout/AdminLayout.jsx` for sidebar structure
8. Start dev server: `npm run dev`
9. Test customer menu at `localhost:3000/restaurant/spot`
10. Test admin at `localhost:3000/admin/login`

**Key principle:** This project uses CSS-in-JS inline styles with design tokens from `T` object. Always maintain the cinematic visual language — Deep Forest, Antique Gold, Soft Cream palette with Playfair Display headings and Outfit body text.

---

*This document should be provided alongside the GitHub repo link and zipped source code for complete project context.*
