// pages/admin/kitchen-new.js
//
// Kitchen station — the KDS half of the Order & Kitchen split
// (Phase A scaffold, 2026-06-03).
//
// Gated by the 'kitchenStation' permission (lib/permissions.js).
// Owner reaches it from the sidebar "Kitchen Station" entry; staff
// with that permission reach it from the StaffShell bottom nav
// (the legacy 'kitchen' BUILTIN role still maps to /admin/kitchen
// for the existing kitchen display screen, which stays running
// until parity is reached and Phase G retires it).
//
// In Phase A this is a thin wrapper around OrderKitchen with
// `mode='kitchen'`. Phase C replaces the rendered ticket UI with
// the per-item ready/served bump + duplicate-dish highlighting +
// all-day counter strip — same as today's /admin/kitchen, ported
// into the new visual style.
//
// The URL ends in '-new' on purpose: the existing /admin/kitchen
// page is still live and the BUILTIN kitchen role still routes
// there. Once the new flow reaches parity (Phase G), this file gets
// renamed to /admin/kitchen and the legacy file is retired.

import OrderKitchen from './order-kitchen';

export default function KitchenNew() {
  return <OrderKitchen mode="kitchen" />;
}

KitchenNew.getLayout = (page) => page;
