// lib/plans.js — Single source of truth for all subscription plans.
//
// Imported by:
//   - pages/index.js              (landing pricing section)
//   - pages/signup.js             (trial signup plan picker)
//   - pages/admin/subscription.js (in-app upgrade UI)
//   - pages/api/payments/create-order.js  (Razorpay order creation)
//   - pages/api/payments/verify.js        (payment verification + expiry write)
//
// To change prices, limits, or tier names — edit this file only.

export const BILLING_PERIOD_DAYS = 30;   // monthly
export const TRIAL_DAYS = 14;

export const PLANS = [
  {
    id: 'starter',
    name: 'Starter',
    price: 999,                 // INR per month
    priceDisplay: '₹999',
    priceInPaise: 99900,        // for Razorpay (1 INR = 100 paise)
    period: '/month',
    maxItems: 20,
    maxStorageMB: 1024,
    tagline: 'Perfect for small restaurants just getting started.',
    features: [
      '20 menu items',
      '1 GB storage',
      'QR code menu',
      'AR food visualization',
      'Basic analytics',
      'Customer feedback',
    ],
  },
  {
    id: 'growth',
    name: 'Growth',
    price: 2499,
    priceDisplay: '₹2,499',
    priceInPaise: 249900,
    period: '/month',
    maxItems: 60,
    maxStorageMB: 3072,
    tagline: 'The complete AR + POS experience.',
    popular: true,
    features: [
      '60 menu items',
      '3 GB storage',
      'Everything in Starter',
      'AI upselling',
      'Kitchen display + waiter calls',
      'Dish ratings & reviews',
    ],
  },
  {
    id: 'pro',
    name: 'Pro',
    price: 4999,
    priceDisplay: '₹4,999',
    priceInPaise: 499900,
    period: '/month',
    maxItems: 150,
    maxStorageMB: 10240,
    tagline: 'Full power for high-volume multi-location operations.',
    features: [
      '150 menu items',
      '10 GB storage',
      'Everything in Growth',
      'CSV menu import',
      'Advanced analytics',
      'Priority support',
      'Custom branding',
      'Petpooja POS integration',
    ],
  },
];

// Returns the plan object for a given id. Falls back to Starter if id is
// unknown — prevents crashes if Firestore has a stale/corrupted plan field.
export function getPlan(id) {
  return PLANS.find(p => p.id === normalizePlanId(id)) || PLANS[0];
}

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

// Quick helper for price-in-paise lookup (used by Razorpay create-order).
export function getPriceInPaise(planId) {
  return getPlan(planId).priceInPaise;
}

// ── May 4 — Pro-only feature gating ──────────────────────────────────
// Some integrations (Petpooja hybrid, etc.) carry rollout risk and we
// only want them available on the Pro plan during initial pilot. This
// is the SINGLE place that decides eligibility — every UI gate, page
// guard, and server-side check imports from here so we can flip the
// list of allowed plan IDs without hunting through the codebase.
//
// Rule of thumb: any feature whose breakage would visibly affect the
// customer-facing flow (order placement, payment, billing) goes here
// behind 'pro' until it has burned in for >=2 months on Pro pilot
// restaurants without a regression. Then we promote to ['growth', 'pro']
// or ['starter', 'growth', 'pro'].
//
// Currently behind this gate:
//   - Petpooja hybrid integration (POS sync, menu pull, order push,
//     payment status sync) — ships May 2026 to Pro pilots only.
const PETPOOJA_FEATURE_PLANS = new Set(['pro']);

// Returns true ONLY when the restaurant's current plan is on the
// Petpooja-allowed list. Used by:
//   - admin sidebar (hides "Connect Petpooja" link for non-Pro)
//   - /admin/petpooja-connect page (redirects to upgrade if not Pro)
//   - every /api/petpooja/* server endpoint (returns 403 if not Pro)
//   - lib/petpoojaSync orchestration (skips work for non-Pro)
//
// Pass either the full restaurant doc (we read .plan) or just the plan
// id string. Both are tolerated so callers don't have to remember which.
// `null` / `undefined` / unknown plan ids → falls through to Starter
// via normalizePlanId() → returns false. Safe by default.
export function canUsePetpoojaIntegration(restaurantOrPlanId) {
  const planId = typeof restaurantOrPlanId === 'string'
    ? restaurantOrPlanId
    : restaurantOrPlanId?.plan;
  return PETPOOJA_FEATURE_PLANS.has(normalizePlanId(planId));
}
