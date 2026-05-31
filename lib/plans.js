// lib/plans.js — Single source of truth for all subscription plans.
//
// Imported by:
//   - pages/index.js                       (landing pricing section)
//   - pages/pitch.js                       (landing pricing section)
//   - pages/signup.js                      (trial signup plan picker)
//   - pages/admin/subscription.js          (in-app upgrade UI)
//   - pages/api/payments/create-order.js   (Razorpay order creation)
//   - pages/api/payments/verify.js         (payment verification + expiry write)
//   - pages/superadmin/plans.js            (per-restaurant plan editor)
//   - pages/superadmin/restaurant/[id].js  (per-restaurant detail editor)
//   - pages/superadmin/restaurants.js      (restaurant list)
//   - components/layout/AdminLayout.jsx    (sidebar nav gating)
//   - lib/db.js + lib/saDb.js              (new-restaurant defaults)
//
// To change prices, limits, tier names, OR the per-tier feature list — edit
// this file only. Every other file imports from here; if you find a hard-
// coded "₹999" or "maxItems: 20" elsewhere, it's drift, not by design.

// ── Constants ──────────────────────────────────────────────────────────
export const TRIAL_DAYS = 14;           // length of the post-signup trial
export const GRACE_DAYS = 12;           // soft grace after expiry before lock
export const BILLING_PERIOD_DAYS = 30;  // back-compat: monthly default

// Sentinel for "unlimited" caps. We use a large finite number (not Infinity)
// so plain `count >= maxX` comparisons work everywhere — no special cases.
// 99999 is comfortably above any plausible Indian restaurant's menu or staff.
export const UNLIMITED = 99999;

// ── Billing periods ────────────────────────────────────────────────────
export const BILLING_PERIODS = [
  { id: 'monthly',    label: 'Monthly',                 days:  30, savingsLabel: '' },
  { id: 'threeMonth', label: '3 months',                days:  90, savingsLabel: '10% off' },
  { id: 'sixMonth',   label: '6 months · 1 mo free',    days: 180, savingsLabel: '1 month free' },
  { id: 'annual',     label: 'Annual · 2 mo free',      days: 365, savingsLabel: '2 months free' },
];
export function getPeriod(id) {
  return BILLING_PERIODS.find(p => p.id === id) || BILLING_PERIODS[0];
}
export function expiryDaysFor(id) {
  return getPeriod(id).days;
}

// ── Plans ──────────────────────────────────────────────────────────────
// Each plan carries:
//   id              — internal key (starter/growth/pro)
//   name            — display name
//   tagline         — one-line marketing copy
//   popular         — UI flag for the "Most popular" ribbon
//   maxItems        — hard cap on menu items
//   maxARModels     — hard cap on dishes with AR (cost-control lever)
//   maxStorageMB    — hard cap on uploaded media (images + AR models)
//   maxStaff        — hard cap on staff logins (incl. custom roles)
//   includedPerms   — feature permissions the plan unlocks (see lib/permissions.js)
//   prices          — per-period { inr, paise } for Razorpay + UI
//   price / priceInPaise / priceDisplay / period
//                   — back-compat shims for callers that still read the
//                     monthly fields directly.
//   features        — marketing bullets shown on landing / upgrade UI.
//
// Caps are enforced server-side:
//   maxItems       → lib/db.js submitRequestAndPublish / createMenuItem
//   maxARModels    → pages/superadmin/requests.js (model approval)
//   maxStorageMB   → lib/storage.js + delete handlers
//   maxStaff       → pages/api/staff/create.js
//   includedPerms  → canUseFeature() called by AdminLayout sidebar + page
//                    guards + API routes.

const M_STARTER = { inr:  999, paise:  99900 };
const M_GROWTH  = { inr: 2499, paise: 249900 };
const M_PRO     = { inr: 3499, paise: 349900 };

export const PLANS = [
  {
    id: 'starter',
    name: 'Starter',
    tagline: 'For small restaurants getting started with AR + QR ordering.',
    popular: false,
    maxItems:      50,
    maxARModels:   15,
    maxStorageMB:  1024,   // 1 GB
    maxStaff:      5,
    includedPerms: [
      // Operations
      'tables', 'newOrder', 'orders', 'payments',
      // Overview
      'analytics', 'reports', 'dayClose', 'activity',
      // Catalog
      'menuItems', 'addItems',
      // People (basic Customers + Reservations kept here per owner's call —
      // gives Starter the diner-relationship hook so the upgrade to
      // Growth/Pro can use that data for marketing campaigns. Marketing +
      // Waitlist remain Growth+ as the upsell.)
      'customers', 'reservations', 'staff', 'feedback',
      // Setup
      'qrcode',
    ],
    prices: {
      monthly:    M_STARTER,
      threeMonth: { inr:  2699, paise:  269900 }, // ~10% off
      sixMonth:   { inr:  4990, paise:  499000 }, // 1 month free
      annual:     { inr:  9990, paise:  999000 }, // 2 months free
    },
    // ── Back-compat (legacy callers read these monthly fields) ──
    price:        M_STARTER.inr,
    priceInPaise: M_STARTER.paise,
    priceDisplay: '₹999',
    period:       '/month',
    features: [
      '50 menu items',
      '15 AR models',
      '1 GB storage',
      '5 staff logins',
      'QR menu + AR food viewer',
      'Orders, payments, table view',
      'Customers + reservations',
      'Basic analytics + reports',
      'Customer feedback',
    ],
  },
  {
    id: 'growth',
    name: 'Growth',
    tagline: 'The complete AR + POS-lite experience for busy full-service restaurants.',
    popular: true,
    maxItems:      100,
    maxARModels:   50,
    maxStorageMB:  5120,   // 5 GB
    maxStaff:      8,
    includedPerms: [
      // All Starter perms
      'tables', 'newOrder', 'orders', 'payments',
      'analytics', 'reports', 'dayClose', 'activity',
      'menuItems', 'addItems',
      'customers', 'reservations', 'staff', 'feedback',
      'qrcode',
      // Growth adds:
      'promotions',         // offers / coupons / combos
      'marketing',          // WhatsApp + email campaigns
      'waitlist',           // host stand
      'analyticsAdvanced',  // item-level signals + Restaurant Health insights
    ],
    prices: {
      monthly:    M_GROWTH,
      threeMonth: { inr:  6749, paise:  674900 }, // ~10% off
      sixMonth:   { inr: 12490, paise: 1249000 }, // 1 month free
      annual:     { inr: 24990, paise: 2499000 }, // 2 months free
    },
    price:        M_GROWTH.inr,
    priceInPaise: M_GROWTH.paise,
    priceDisplay: '₹2,499',
    period:       '/month',
    features: [
      'Everything in Starter',
      '100 menu items',
      '50 AR models',
      '5 GB storage',
      '8 staff logins',
      'AI Smart Picker (Help Me Choose)',
      'Promotions: offers, coupons, combos',
      'Marketing: WhatsApp + email campaigns',
      'Waitlist / host stand',
      'Advanced analytics + insights',
    ],
  },
  {
    id: 'pro',
    name: 'Pro',
    tagline: 'Full operations + integrations for high-volume restaurants.',
    popular: false,
    maxItems:      UNLIMITED,
    maxARModels:   100,
    maxStorageMB:  20480,  // 20 GB
    maxStaff:      UNLIMITED,
    includedPerms: [
      // All Growth perms
      'tables', 'newOrder', 'orders', 'payments',
      'analytics', 'reports', 'dayClose', 'activity',
      'menuItems', 'addItems',
      'customers', 'reservations', 'staff', 'feedback',
      'qrcode',
      'promotions', 'marketing', 'waitlist', 'analyticsAdvanced',
      // Pro adds:
      'vendors',         // vendor registry + payables
      'expenses',        // expense log
      'purchaseOrders',  // PO creation + tracking
      'petpooja',        // Petpooja POS integration
    ],
    prices: {
      monthly:    M_PRO,
      threeMonth: { inr:  9449, paise:  944900 }, // ~10% off
      sixMonth:   { inr: 17490, paise: 1749000 }, // 1 month free
      annual:     { inr: 34990, paise: 3499000 }, // 2 months free
    },
    price:        M_PRO.inr,
    priceInPaise: M_PRO.paise,
    priceDisplay: '₹3,499',
    period:       '/month',
    features: [
      'Everything in Growth',
      'Unlimited menu items',
      '100 AR models',
      '20 GB storage',
      'Unlimited staff logins',
      'Purchases: vendors, expenses, POs',
      'Petpooja POS integration',
      'Priority support',
      'Custom branding',
      'Multiple menus + custom menu UI (roadmap)',
    ],
  },
];

// ── Plan helpers ───────────────────────────────────────────────────────

// Legacy id mapping. The earlier subscription.js used basic/pro/premium;
// anyone whose restaurant doc still carries those ids gets normalized to the
// current starter/growth/pro scheme on read. No data migration needed.
export const LEGACY_PLAN_ID_MAP = {
  basic:   'starter',
  premium: 'pro',
  // 'pro' maps to itself
};

export function normalizePlanId(id) {
  if (!id) return 'starter';
  return LEGACY_PLAN_ID_MAP[id] || id;
}

// Returns the plan object for a given id. Falls back to Starter if id is
// unknown — prevents crashes if Firestore has a stale/corrupted plan field.
export function getPlan(id) {
  return PLANS.find(p => p.id === normalizePlanId(id)) || PLANS[0];
}

// Per-period price helpers (used by Razorpay create-order + checkout UI).
// Defaults to monthly when period is omitted — keeps legacy callers working.
export function getPrice(planId, period = 'monthly') {
  const plan = getPlan(planId);
  return (plan.prices && plan.prices[period] && plan.prices[period].inr) || plan.price;
}
export function getPriceInPaise(planId, period = 'monthly') {
  const plan = getPlan(planId);
  return (plan.prices && plan.prices[period] && plan.prices[period].paise) || plan.priceInPaise;
}

// ── Feature gating (plan-level) ────────────────────────────────────────
// canUseFeature(restaurantOrPlanId, permKey) → boolean.
// Single source of truth for "does this restaurant's plan unlock feature X".
// Both the sidebar nav (AdminLayout) and the page guards / API routes call
// through here, so toggling a feature for a tier = edit PLANS[].includedPerms.
//
// Pass either the full restaurant doc (we read .plan) or just the plan id.
// Unknown plan → Starter (safest fail-closed default).
export function canUseFeature(restaurantOrPlanId, permKey) {
  if (!permKey) return false;
  const planId = typeof restaurantOrPlanId === 'string'
    ? restaurantOrPlanId
    : restaurantOrPlanId?.plan;
  const plan = getPlan(planId);
  return Array.isArray(plan.includedPerms) && plan.includedPerms.includes(permKey);
}

// Thin wrapper kept for the existing call sites in AdminLayout, the
// /admin/petpooja-connect page, the /api/petpooja/* endpoints, and
// lib/petpoojaSync. Going forward, prefer canUseFeature(plan, 'petpooja').
export function canUsePetpoojaIntegration(restaurantOrPlanId) {
  return canUseFeature(restaurantOrPlanId, 'petpooja');
}
