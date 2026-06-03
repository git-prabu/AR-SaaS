// pages/admin/orders.js
//
// Waiter station (Phase A scaffold, 2026-06-03).
//
// This URL used to host the orders LEDGER — that page has been moved
// to /admin/orders-ledger so the URL can serve the new waiter station
// instead. The 'orders' permission (lib/permissions.js) still gates
// this page exactly as before, so existing role assignments continue
// to grant access; only the page content has changed.
//
// In Phase A this is a thin wrapper that renders the OrderKitchen
// component in `mode='floor'`. Phase B will replace this with the
// full 4-tab waiter UI (Floor, Action Queue, Orders ledger,
// History) — keeping the same URL and permission key.
//
// Owners reach the legacy ledger at /admin/orders-ledger if they need
// it during the transition.

import OrderKitchen from './order-kitchen';

export default function Orders() {
  return <OrderKitchen mode="floor" />;
}

// Full-screen station — bypass AdminLayout / StaffShell so the
// phone-frame UI takes the whole viewport, same pattern as
// /admin/order-kitchen and /admin/kitchen.
Orders.getLayout = (page) => page;
