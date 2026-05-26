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
      { key: 'tables',    label: 'Table View' },
      { key: 'newOrder',  label: 'New Order' },
      { key: 'orders',    label: 'Orders' },
      { key: 'payments',  label: 'Payments' },
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

// Permission key → admin route it unlocks. Used by Stage B for nav + page
// gating (a staffer only sees/opens routes their role permits).
export const PERMISSION_ROUTES = {
  tables: '/admin/tables',
  newOrder: '/admin/new-order',
  orders: '/admin/orders',
  kitchen: '/admin/kitchen',
  waiter: '/admin/waiter',
  payments: '/admin/payments',
  analytics: '/admin/analytics',
  reports: '/admin/reports',
  dayClose: '/admin/day-close',
  activity: '/admin/notifications',
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
  settings: '/admin/settings',
  petpooja: '/admin/petpooja-connect',
  manageRoles: '/admin/roles',
};

// Keep only valid keys (drops anything stale if the registry shrinks).
export function sanitizePermissions(list) {
  if (!Array.isArray(list)) return [];
  const allowed = new Set(ALL_PERMISSION_KEYS);
  return [...new Set(list.filter(k => allowed.has(k)))];
}

// ── Staff page rollout (RBAC Stage B) ──────────────────────────
// Permission keys whose admin pages have been converted to support a
// staff login. A staffer only ever sees nav items that are BOTH granted
// by their role AND in this set, so they never land on an unconverted
// page. This list GROWS one batch at a time as pages are converted.
// (kitchen + waiter keep their own dedicated screens outside StaffShell.)
export const STAFF_ENABLED = ['reports', 'analytics', 'activity', 'orders', 'payments', 'newOrder', 'tables', 'qrcode', 'expenses', 'vendors', 'purchaseOrders', 'reservations', 'dayClose', 'customers', 'waitlist', 'feedback', 'marketing', 'promotions', 'addItems'];

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
