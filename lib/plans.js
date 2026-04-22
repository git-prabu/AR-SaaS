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
