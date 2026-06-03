// pages/admin/kitchen-new.js
//
// Phase C (2026-06-03) — Kitchen Station (per-item KDS).
//
// Replaces the Phase A thin wrapper that delegated to
// OrderKitchen(mode='kitchen'). That wrapper inherited the
// per-ORDER bump UI; this page is per-ITEM, matching the
// existing /admin/kitchen behavior the owner asked for.
//
// What's wired here:
//   * Subscribe to orders (the only Firestore feed needed
//     for the rail — we don't render tables / menu items /
//     sessions / bills on this page).
//   * Per-item ready bump (stamps items[i].readyAt; order
//     auto-flips to status='ready' once every item has the
//     stamp — handled server-side by markOrderItemReadyAs).
//   * Per-item served bump (stamps items[i].servedAt; order
//     auto-flips to status='served' once every item is
//     stamped).
//   * Order-level "Start cooking" button on pending tickets
//     (pending → preparing). Per-item bumps only unlock once
//     the order is preparing OR ready.
//   * Duplicate-dish indicator: any dish appearing in 2+
//     active tickets gets a gold "×qty in N" badge so the
//     kitchen can batch-cook across tables.
//   * All-day counter strip at the top: 8 most-batched
//     dishes with totals.
//   * Filter pills (All / New / Cooking / Ready) with counts.
//
// Auth pattern is the same as /admin/orders: useAuth() +
// readStaffSession(); rid + scopedDb derived from whichever
// is present. Page bypasses AdminLayout / StaffShell so the
// dark UI takes the whole viewport.

import Head from 'next/head';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/router';
import toast from 'react-hot-toast';
import { collection, onSnapshot, query, orderBy, limit } from 'firebase/firestore';

import { useAuth } from '../../hooks/useAuth';
import useOkTheme from '../../hooks/useOkTheme';
import { readStaffSession } from '../../lib/staffSession';
import { db, staffDb } from '../../lib/firebase';
import {
  markOrderItemReadyAs, markOrderItemServedAs,
  updateOrderStatus, updateOrderStatusAs,
} from '../../lib/db';

import KitchenRailScreen from '../../components/order-kitchen/KitchenRailScreen';

export default function KitchenNew() {
  const router = useRouter();
  const { user, userData, loading: adminLoading } = useAuth();
  const { isLight, toggle: toggleTheme } = useOkTheme();
  const [staffSession, setStaffSession] = useState(null);
  const [authChecked, setAuthChecked] = useState(false);

  useEffect(() => {
    setStaffSession(readStaffSession());
    setAuthChecked(true);
  }, []);

  const rid = userData?.restaurantId || staffSession?.restaurantId;
  const isAdmin = !!userData?.restaurantId;
  const scopedDb = isAdmin ? db : staffDb;

  // Auth gate — match /admin/orders / /admin/order-kitchen.
  useEffect(() => {
    if (!authChecked || adminLoading) return;
    if (user && !userData) return;
    if (isAdmin) return;
    if (staffSession) return;
    router.replace('/staff/login');
  }, [authChecked, adminLoading, user, userData, isAdmin, staffSession, router]);

  // ─── Orders subscription ────────────────────────────────────────
  const [ordersById, setOrdersById] = useState({});
  const [ordersReady, setOrdersReady] = useState(false);
  useEffect(() => {
    if (!rid) return;
    const uo = onSnapshot(
      query(collection(scopedDb, 'restaurants', rid, 'orders'), orderBy('createdAt', 'desc'), limit(300)),
      snap => {
        const m = {};
        snap.docs.forEach(d => { m[d.id] = { id: d.id, ...d.data() }; });
        setOrdersById(m);
        setOrdersReady(true);
      },
      () => setOrdersReady(true),
    );
    return () => uo();
  }, [rid, scopedDb]);

  // 1-second tick so the per-ticket age display refreshes live.
  const [, setTick] = useState(0);
  useEffect(() => { const iv = setInterval(() => setTick(t => t + 1), 1000); return () => clearInterval(iv); }, []);

  // ─── Filter + updating state ────────────────────────────────────
  const [filter, setFilter] = useState('all');
  // `updatingKey` is a string identifying the in-flight write so the
  // affected pill / button can show a "Saving…" affordance without
  // disabling the rest of the rail.
  const [updatingKey, setUpdatingKey] = useState(null);

  // ─── Derived data ───────────────────────────────────────────────
  // Active orders (anything not served + not cancelled). Takeaway
  // orders DO show on the kitchen — they're still tickets the kitchen
  // has to cook even if no waiter delivers them.
  const activeOrders = useMemo(() => {
    return Object.values(ordersById)
      .filter(o => ['pending', 'preparing', 'ready'].includes(o.status))
      .map(o => ({ ...o, items: Array.isArray(o.items) ? o.items : [] }));
  }, [ordersById]);

  // Duplicate-dish aggregation: name → { totalQty, ticketCount }.
  // A dish only qualifies if it appears in 2+ DISTINCT tickets — a
  // single ticket with 5×Paneer isn't a batching opportunity. Top 8
  // by ticket count drive both the all-day counter strip AND the
  // per-ticket dish highlighting.
  const allDay = useMemo(() => {
    const map = new Map();
    activeOrders.forEach(o => {
      // Per-ticket: collapse multiple lines of same dish first
      // (edge case but safer for the count).
      const perTicket = new Map();
      o.items.forEach(it => {
        const key = it.name;
        if (!key) return;
        perTicket.set(key, (perTicket.get(key) || 0) + (Number(it.qty) || 1));
      });
      perTicket.forEach((qty, name) => {
        const existing = map.get(name) || { totalQty: 0, ticketCount: 0 };
        map.set(name, { totalQty: existing.totalQty + qty, ticketCount: existing.ticketCount + 1 });
      });
    });
    return Array.from(map.entries())
      .filter(([, info]) => info.ticketCount >= 2)
      .sort((a, b) => b[1].ticketCount - a[1].ticketCount || b[1].totalQty - a[1].totalQty)
      .slice(0, 8)
      .map(([name, info]) => [name, info.totalQty, info.ticketCount]);
  }, [activeOrders]);

  const duplicateDishes = useMemo(() => new Set(allDay.map(([name]) => name)), [allDay]);

  // ─── Handlers ───────────────────────────────────────────────────
  const onStartOrder = async (order) => {
    setUpdatingKey(`${order.id}:start`);
    try {
      if (isAdmin) await updateOrderStatus(rid, order.id, 'preparing', { db: scopedDb });
      else         await updateOrderStatusAs(scopedDb, rid, order.id, 'preparing');
    } catch (e) {
      console.error('Start cooking failed:', e);
      toast.error('Could not start the order. Retry.');
    }
    setUpdatingKey(null);
  };

  const onMarkItemReady = async (order, itemIdx) => {
    const k = `${order.id}:item:${itemIdx}`;
    setUpdatingKey(k);
    try {
      await markOrderItemReadyAs(scopedDb, rid, order.id, itemIdx);
    } catch (e) {
      console.error('Mark item ready failed:', e);
      toast.error('Could not mark item ready. Retry.');
    }
    setUpdatingKey(null);
  };

  const onMarkItemServed = async (order, itemIdx) => {
    const k = `${order.id}:item:${itemIdx}`;
    setUpdatingKey(k);
    try {
      await markOrderItemServedAs(scopedDb, rid, order.id, itemIdx);
    } catch (e) {
      console.error('Mark item served failed:', e);
      toast.error('Could not mark item served. Retry.');
    }
    setUpdatingKey(null);
  };

  // ─── Render gate ────────────────────────────────────────────────
  if (!authChecked || adminLoading) return null;
  if (!isAdmin && !staffSession) return null;

  return (
    <>
      <Head><title>Kitchen Station — HaloHelm</title></Head>
      <div className="ok-root">
        <div className="page-bg">
          <div className="frame">
            <div className="notch" />
            <button
              className="ok-theme-toggle"
              onClick={toggleTheme}
              title={isLight ? 'Switch to dark theme' : 'Switch to light theme'}
              aria-label="Toggle theme"
            >{isLight ? '🌙' : '☀️'}</button>
            <div className="screenwrap">
              {/* Notch clearance — see comment in order-kitchen.js */}
              <div style={{ height: 30, flexShrink: 0 }} />
              {ordersReady ? (
                <KitchenRailScreen
                  orders={activeOrders}
                  duplicateDishes={duplicateDishes}
                  allDay={allDay}
                  filter={filter}
                  onFilterChange={setFilter}
                  onStartOrder={onStartOrder}
                  onMarkItemReady={onMarkItemReady}
                  onMarkItemServed={onMarkItemServed}
                  updatingKey={updatingKey}
                />
              ) : (
                <div className="screen screen-enter">
                  <div className="empty">
                    <span className="e-emoji">⏳</span>
                    <p>Loading the kitchen rail…</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

KitchenNew.getLayout = (page) => page;
