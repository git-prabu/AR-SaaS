// lib/permissions.js
//
// RBAC — single source of truth for the staff permissions a restaurant
// owner can grant to a custom role (Phase 8, 22 May 2026).
//
// IMPORTANT — owner-only areas are DELIBERATELY ABSENT and can never be
// granted to any staff role:
//   - subscription / billing
//   - account security (the owner's own login email/password)
//   - payment gateway credentials
// Those pages stay owner-only in the UI and in firestore.rules, so even a
// staffer who can manage roles can't hand them (or themselves) out.
//
// Each permission key maps 1:1 to an admin feature/route. The Roles matrix
// page renders its rows from PERMISSION_GROUPS; Stage B uses PERMISSION_ROUTES
// for nav/page gating and the keys for the Firestore rule checks.

export const PERMISSION_GROUPS = [
  {
    group: 'Operations',
    perms: [
      { key: 'tables',         label: 'Table View' },
      { key: 'newOrder',       label: 'New Order' },
      // ── Order & Kitchen station split (Phase A, 2026-06-03) ──
      // The unified 'orderKitchen' perm has been split into two:
      //   - 'orders'         → new waiter station (Floor + Action Queue
      //                        + Orders ledger + History), URL /admin/orders.
      //                        REUSES the existing key — the legacy orders
      //                        ledger has been moved to /admin/orders-ledger.
      //   - 'kitchenStation' → new KDS (per-item bump + duplicate-dish
      //                        indicator), URL /admin/kitchen-new. New key
      //                        (not 'kitchen' because that's a BUILTIN role
      //                        id — see BUILTIN_ROLES below).
      // expandLegacyPerms() below grandfathers any staff doc that still
      // carries 'orderKitchen' so they don't lose access at deploy time.
      { key: 'orders',         label: 'Orders' },
      { key: 'kitchenStation', label: 'Kitchen Station' },
      { key: 'payments',       label: 'Payments' },
      // NOTE: 'kitchen' and 'waiter' are NOT tickable features here — they are
      // the two BUILT-IN station roles (see BUILTIN_ROLES below). A staffer is
      // EITHER a Kitchen/Waiter station role OR a custom role; the Kitchen
      // Display and Waiter Dashboard are reached only via those built-in roles.
    ],
  },
  {
    group: 'Overview',
    perms: [
      { key: 'analytics', label: 'Analytics' },
      { key: 'reports',   label: 'Reports' },
      { key: 'dayClose',  label: 'Day Close' },
      { key: 'activity',  label: 'Activity' },
    ],
  },
  {
    group: 'Purchases',
    perms: [
      { key: 'expenses',       label: 'Expenses' },
      { key: 'vendors',        label: 'Vendors' },
      { key: 'purchaseOrders', label: 'Purchase Orders' },
    ],
  },
  {
    group: 'Catalog',
    perms: [
      { key: 'menuItems',  label: 'Menu Items' },
      { key: 'addItems',   label: 'Add Items' },
      { key: 'promotions', label: 'Promotions' },
    ],
  },
  {
    group: 'People',
    perms: [
      { key: 'customers',    label: 'Customers' },
      { key: 'marketing',    label: 'Marketing' },
      { key: 'reservations', label: 'Reservations' },
      { key: 'waitlist',     label: 'Waitlist' },
      { key: 'staff',        label: 'Staff' },
      { key: 'feedback',     label: 'Feedback' },
    ],
  },
  {
    group: 'Setup',
    perms: [
      { key: 'qrcode',      label: 'QR & Tables' },
      { key: 'settings',    label: 'Settings' },
      { key: 'petpooja',    label: 'Petpooja' },
      // Granting this lets a staffer manage roles. The owner-only areas
      // above still can't be granted by them (they aren't in this list at
      // all), so this can't be used to escalate into billing/security.
      { key: 'manageRoles', label: 'Roles & Permissions' },
    ],
  },
];

// Flat list of every grantable key — handy for validation.
export const ALL_PERMISSION_KEYS = PERMISSION_GROUPS.flatMap(g => g.perms.map(p => p.key));

// ── Built-in station roles (unified role model, 26 May 2026) ───────
// Kitchen and Waiter are the two roles that come with the system. They map
// to the dedicated Kitchen Display + Waiter Dashboard screens (NOT the
// permission-matrix features). In the staff "Role" picker they sit alongside
// the owner's custom roles, so a person is assigned exactly ONE role.
//   - id 'kitchen' / 'waiter' is a sentinel the Staff UI uses in the single
//     role dropdown; selecting it stores staff.role = that, staff.roleId = null.
//   - A custom role stores staff.role = 'staff' + staff.roleId = <staffRoles id>,
//     and its access is defined purely by that role's permission list.
export const BUILTIN_ROLES = [
  { id: 'kitchen', name: 'Kitchen', station: 'kitchen', desc: 'Kitchen Display screen' },
  { id: 'waiter',  name: 'Waiter',  station: 'waiter',  desc: 'Waiter Dashboard' },
];
export const BUILTIN_ROLE_IDS = BUILTIN_ROLES.map(r => r.id);

// ── Admin-tier permissions (RBAC escalation guard, 26 May 2026) ────
// A staff "manager" (someone granted the 'staff' permission, who can onboard
// other staff) must NOT be able to hand out these higher-power permissions —
// otherwise they could mint another manager / role-editor / settings-or-POS
// admin and escalate. Only the owner can assign a role that grants any of
// these. Enforced server-side in /api/staff/create and mirrored client-side
// in the Staff page's role picker. (Billing / account-security / payment
// gateway aren't even in the grantable list, so they're protected regardless.)
export const ADMIN_TIER_PERMS = ['staff', 'manageRoles', 'settings', 'petpooja'];

// Permission key → admin route it unlocks. Used by Stage B for nav + page
// gating (a staffer only sees/opens routes their role permits).
export const PERMISSION_ROUTES = {
  tables: '/admin/tables',
  newOrder: '/admin/new-order',
  // 'orders' now points to the new waiter station (was: the orders ledger,
  // which has been moved to /admin/orders-ledger as a transition fallback).
  orders: '/admin/orders',
  // New KDS for the split. Will be renamed to /admin/kitchen once the
  // legacy /admin/kitchen page is retired.
  kitchenStation: '/admin/kitchen-new',
  // Legacy 'orderKitchen' route kept for backwards-compat redirects
  // (the page itself still exists and redirects based on perms).
  orderKitchen: '/admin/order-kitchen',
  kitchen: '/admin/kitchen',
  waiter: '/admin/waiter',
  payments: '/admin/payments',
  analytics: '/admin/analytics',
  reports: '/admin/reports',
  dayClose: '/admin/day-close',
  activity: '/admin/activity-log',
  expenses: '/admin/expenses',
  vendors: '/admin/vendors',
  purchaseOrders: '/admin/purchase-orders',
  menuItems: '/admin/items',
  addItems: '/admin/requests',
  promotions: '/admin/promotions',
  customers: '/admin/customers',
  marketing: '/admin/campaigns',
  reservations: '/admin/reservations',
  waitlist: '/admin/waitlist',
  staff: '/admin/staff',
  feedback: '/admin/feedback',
  qrcode: '/admin/qrcode',
  settings: '/admin/business-info',
  petpooja: '/admin/petpooja-pos',
  manageRoles: '/admin/roles',
  help: '/admin/help',
};

// Perms every signed-in staff member implicitly holds, regardless of
// what their role grants and regardless of the restaurant's plan tier
// (2026-06-11 audit #16). Deliberately NOT in PERMISSION_GROUPS so they
// never clutter the roles-matrix editor — there's nothing to "grant".
// Used by useFeatureAccess (page gate) and StaffShell (nav filter).
export const UNIVERSAL_STAFF_PERMS = ['help'];

// Keep only valid keys (drops anything stale if the registry shrinks).
export function sanitizePermissions(list) {
  if (!Array.isArray(list)) return [];
  const expanded = expandLegacyPerms(list);
  const allowed = new Set(ALL_PERMISSION_KEYS);
  return [...new Set(expanded.filter(k => allowed.has(k)))];
}

// ── Legacy permission compatibility (Order & Kitchen split, 2026-06-03) ──
// The unified 'orderKitchen' perm got split into 'orders' + 'kitchenStation'.
// Staff docs / Firebase Auth claims written BEFORE this change still carry
// 'orderKitchen' in their list. Without expansion they would silently lose
// access to BOTH new pages the second this deploys — owner has to manually
// re-tick every staff role.
//
// Expand on every read instead: turn 'orderKitchen' into both new keys
// (and keep it in the list so any code still looking for the legacy key
// also matches — defence in depth). Idempotent: lists that don't contain
// 'orderKitchen' are returned unchanged.
export function expandLegacyPerms(list) {
  if (!Array.isArray(list)) return [];
  if (!list.includes('orderKitchen')) return list;
  const out = new Set(list);
  out.add('orders');
  out.add('kitchenStation');
  return [...out];
}

// ── Staff page rollout (RBAC Stage B) ──────────────────────────
// Permission keys whose admin pages have been converted to support a
// staff login. A staffer only ever sees nav items that are BOTH granted
// by their role AND in this set, so they never land on an unconverted
// page. This list GROWS one batch at a time as pages are converted.
// (kitchen + waiter keep their own dedicated screens outside StaffShell.)
export const STAFF_ENABLED = ['reports', 'analytics', 'activity', 'orders', 'kitchenStation', 'payments', 'newOrder', 'orderKitchen', 'tables', 'qrcode', 'menuItems', 'addItems', 'promotions', 'expenses', 'vendors', 'purchaseOrders', 'reservations', 'dayClose', 'customers', 'waitlist', 'feedback', 'marketing', 'staff', 'help'];

// Where a staffer lands after login: their station first (kitchen/waiter
// keep their dedicated screens), otherwise the first staff-enabled feature
// their role grants. Returns null when the role grants nothing reachable
// yet (caller decides what to do).
export function computeStaffLanding(perms = []) {
  const p = Array.isArray(perms) ? perms : [];
  // Prefer a StaffShell feature so a multi-feature staffer (e.g. a Manager)
  // lands somewhere WITH a sidebar to navigate their whole role — instead of
  // being dumped on the bare kitchen/waiter station screen. Pure station
  // staff (only kitchen/waiter) fall through to their dedicated screen.
  const firstShell = STAFF_ENABLED.find(k => p.includes(k));
  if (firstShell) return PERMISSION_ROUTES[firstShell];
  if (p.includes('kitchen')) return '/admin/kitchen';
  if (p.includes('waiter'))  return '/admin/waiter';
  return null;
}
