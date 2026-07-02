// pages/admin/orders.js
//
// Waiter station (Phase B.1 scaffold, 2026-06-03).
//
// Replaces the Phase A thin-wrapper. This is the standalone
// waiter app — 4-tab bottom nav:
//
//   Floor   — table grid → menu → review → send (Phase A flow,
//             unchanged: uses FloorScreen + MenuScreen +
//             ReviewScreen + ConfirmScreen)
//   Queue   — Action Queue (call-waiter pings + per-item
//             ready-to-serve + cash/card/UPI payment requests
//             from the customer menu). Wired in Phase B.2.
//   Orders  — today's orders ledger (read-only). Phase B.3.
//   History — past orders by date range. Phase B.4.
//
// The page subscribes to the same Firestore collections as
// /admin/order-kitchen so the Floor tab works identically.
// Action Queue / Orders / History will lean on the same orders
// subscription + a NEW waiterCalls subscription (added in B.2).
//
// Why duplicate from order-kitchen.js instead of importing it:
// /admin/order-kitchen is on the way out (it's the legacy
// combined view kept only for bookmarks). The two pages need
// to evolve independently — /admin/orders is going to grow the
// 3 new tabs; /admin/order-kitchen stays frozen. Refactoring
// to a shared hook waits until Phase G when the legacy file
// gets deleted.

import Head from 'next/head';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/router';

// ─── Viewport detection for desktop vs mobile shell ──────────────
// 920px breakpoint matches styles/order-kitchen.css desktop layout
// (owner's Claude Design spec). Below → existing phone-frame UI;
// at-or-above → new .pos shell with .rail + .workspace.
function useIsDesktop(breakpoint = 920) {
  const [isDesktop, setIsDesktop] = useState(false);
  useEffect(() => {
    const check = () => setIsDesktop(window.innerWidth >= breakpoint);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, [breakpoint]);
  return isDesktop;
}

function fmtClock(d) {
  const h = d.getHours() % 12 || 12;
  const m = String(d.getMinutes()).padStart(2, '0');
  const ampm = d.getHours() < 12 ? 'AM' : 'PM';
  return `${h}:${m} ${ampm}`;
}
import toast from 'react-hot-toast';
import { collection, onSnapshot, query, orderBy, where, limit } from 'firebase/firestore';

import { useAuth } from '../../hooks/useAuth';
import useOkTheme from '../../hooks/useOkTheme';
import { readStaffSession } from '../../lib/staffSession';
import { db, staffDb } from '../../lib/firebase';
import {
  getRestaurantById, createOrder,
  // Action queue writes (Phase B.2). Each has a *As variant that takes
  // the explicit Firestore instance so staff calls route through staffDb
  // and the staff custom claims ride along on the request.
  resolveWaiterCall, resolveWaiterCallAs,
  updateOrderStatus, updateOrderStatusAs,
  markOrderPaid, markOrderPaidAs,
  markOrderItemServedAs,
  markBillPrinted, ensureBillNumber,
  logStaffActivity,
  markTableSeated, freeTableSession,
  activateTableSession, clearTableSession,
  setWaitlistStatus,
} from '../../lib/db';
import { printBill } from '../../lib/printKot';
import {
  announceCall, announceReady, announcePayment,
  unlockSound, isVoiceEnabled, setVoiceEnabled as setVoiceEnabledLS,
} from '../../lib/sounds';

import FloorScreen from '../../components/order-kitchen/FloorScreen';
import MenuScreen, { ItemSheet } from '../../components/order-kitchen/MenuScreen';
import ReviewScreen, { ConfirmScreen } from '../../components/order-kitchen/ReviewScreen';
import ActionQueueScreen, { CashModal, IconSound, IconMic } from '../../components/order-kitchen/ActionQueueScreen';
import OrdersListScreen from '../../components/order-kitchen/OrdersListScreen';
import HistoryListScreen from '../../components/order-kitchen/HistoryListScreen';
import PushToggle from '../../components/order-kitchen/PushToggle';
import SettleSheet from '../../components/order-kitchen/SettleSheet';
import TableActionSheet from '../../components/order-kitchen/TableActionSheet';
import TableManagerModal from '../../components/order-kitchen/TableManagerModal';
import OkSidebar from '../../components/admin/OkSidebar';
import { I, VegMark, SpicePips, Thumb } from '../../components/order-kitchen/Icons';

// ─── helpers (parallel to order-kitchen.js) ───────────────────────
let _uid = 0;
const uid = () => 'L' + (++_uid);
const nowLabel = () => {
  const d = new Date();
  let h = d.getHours() % 12; if (h === 0) h = 12;
  return h + ':' + String(d.getMinutes()).padStart(2, '0');
};

const PAID = new Set(['paid_cash', 'paid_card', 'paid_online', 'paid']);
const TINTS = ['#C2562B', '#9A3F1C', '#C4A86D', '#A88247', '#4A7A5A', '#E8C89A', '#B52020', '#5A2310', '#8FC4A8', '#F4A0B0'];
function tintFor(s) {
  if (!s) return '#C4A86D';
  let h = 0;
  const str = String(s);
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) | 0;
  return TINTS[Math.abs(h) % TINTS.length];
}

const CAT_EMOJI = [
  { rx: /(starter|appetiz|snack)/i, e: '🥗' },
  { rx: /(main|curry)/i, e: '🍛' },
  { rx: /(bread|naan|roti|paratha|kulcha)/i, e: '🫓' },
  { rx: /(biryani|rice|pulao)/i, e: '🍚' },
  { rx: /(dessert|sweet|ice cream|kulfi)/i, e: '🍰' },
  { rx: /(drink|beverag|lassi|chai|coffee|tea|soda|juice|mocktail|cocktail)/i, e: '🥤' },
  { rx: /(pizza)/i, e: '🍕' },
  { rx: /(burger)/i, e: '🍔' },
  { rx: /(pasta|noodle)/i, e: '🍝' },
  { rx: /(soup|broth)/i, e: '🍲' },
  { rx: /(salad)/i, e: '🥗' },
  { rx: /(seafood|fish|prawn)/i, e: '🐟' },
  { rx: /(chicken|meat|lamb|mutton|beef|kebab)/i, e: '🍗' },
  { rx: /(breakfast|eggs?)/i, e: '🍳' },
];
function emojiFor(cat) {
  if (!cat) return '🍽';
  for (const { rx, e } of CAT_EMOJI) if (rx.test(cat)) return e;
  return '🍽';
}

function spiceToInt(v) {
  if (typeof v === 'number') return Math.max(0, Math.min(4, Math.round(v)));
  const s = String(v || '').toLowerCase().replace(/\s/g, '');
  if (s.startsWith('veryspicy')) return 4;
  if (s.startsWith('spicy')) return 3;
  if (s.startsWith('medium')) return 2;
  if (s.startsWith('mild')) return 1;
  return 0;
}

// ─── Action queue helpers (port from /admin/waiter) ───────────────
// Only the 4 reasons the customer modal can actually send. Old code
// carried 'condiment' / 'issue' which were never reachable.
const CALL_REASON_META = {
  water:      { label: 'Water' },
  bill:       { label: 'Bill' },
  assistance: { label: 'Assistance' },
  order:      { label: 'Take Order' },
};
function reasonLabel(reason) {
  if (!reason) return 'Assistance';
  const key = Object.keys(CALL_REASON_META).find(k => String(reason).toLowerCase().includes(k));
  return key ? CALL_REASON_META[key].label : 'Assistance';
}
function orderLabel(o) {
  if (typeof o.orderNumber === 'number' && o.orderNumber > 0) return `#${o.orderNumber}`;
  return '#' + (o.id || '').slice(-5).toUpperCase();
}

// Table status → floor label. 'served' (all items served, not yet paid) is
// distinct from 'sent' (kitchen still working) so a served table stops
// reading as "Cooking". 'ready' = fully paid → "Paid" (clear it next).
const STATUS_WORD = { free: 'Free', seated: 'Seated', sent: 'Cooking', served: 'Ready to pay', ready: 'Paid' };

// LocalStorage keys for sound preference — shared with /admin/waiter
// so toggling on one page persists to the other.
const LS_SOUND_KEY = 'ar_waiter_sound';

export default function Orders() {
  const router = useRouter();
  const { user, userData, loading: adminLoading } = useAuth();
  const { isLight, toggle: toggleTheme } = useOkTheme();
  const isDesktop = useIsDesktop(920);
  const [staffSession, setStaffSession] = useState(null);
  const [authChecked, setAuthChecked] = useState(false);

  useEffect(() => {
    setStaffSession(readStaffSession());
    setAuthChecked(true);
  }, []);

  const rid = userData?.restaurantId || staffSession?.restaurantId;
  const isAdmin = !!userData?.restaurantId;
  const scopedDb = isAdmin ? db : staffDb;
  const waiter = (isAdmin ? (userData?.restaurantName || 'Admin') : (staffSession?.name || 'Staff'));

  // Push subscriber identity (FCM). See pages/admin/kitchen-new.js for
  // the matching block. Cloud Function fans out events whose required
  // perm matches this subscriber's perms (or always for admin).
  const pushSubscriber = isAdmin && user
    ? { kind: 'admin', id: user.uid, perms: [] }
    : (staffSession ? { kind: 'staff', id: staffSession.staffId, perms: staffSession.perms || [] } : null);

  // Auth gate — bounce out if neither signed in. Same logic as the
  // /admin/order-kitchen flow.
  useEffect(() => {
    if (!authChecked || adminLoading) return;
    if (user && !userData) return;
    if (isAdmin) return;
    if (staffSession) return;
    router.replace('/staff/login');
  }, [authChecked, adminLoading, user, userData, isAdmin, staffSession, router]);

  // ─── Live Firestore subscriptions ───────────────────────────────
  const [restaurant, setRestaurant] = useState(null);
  const [areas, setAreas] = useState([]);
  const [rawTables, setRawTables] = useState([]);
  const [sessions, setSessions] = useState({});
  const [bills, setBills] = useState({});
  const [ordersById, setOrdersById] = useState({});
  const [rawMenu, setRawMenu] = useState([]);
  const [allCalls, setAllCalls] = useState([]);  // Phase B.2 — waiterCalls feed
  const [waitlist, setWaitlist] = useState([]);  // host-stand walk-in queue, shown on the floor
  const [areasReady, setAreasReady] = useState(false);
  const [tablesReady, setTablesReady] = useState(false);

  useEffect(() => {
    if (!rid) return;
    getRestaurantById(rid, { db: scopedDb }).then(setRestaurant).catch(() => {});
  }, [rid, scopedDb]);

  useEffect(() => {
    if (!rid) return;
    const ua = onSnapshot(query(collection(scopedDb, 'restaurants', rid, 'areas'), orderBy('sortOrder', 'asc')),
      snap => { setAreas(snap.docs.map(d => ({ id: d.id, ...d.data() }))); setAreasReady(true); }, () => setAreasReady(true));
    const ut = onSnapshot(query(collection(scopedDb, 'restaurants', rid, 'tables'), orderBy('sortOrder', 'asc')),
      snap => { setRawTables(snap.docs.map(d => ({ id: d.id, ...d.data() }))); setTablesReady(true); }, () => setTablesReady(true));
    const us = onSnapshot(collection(scopedDb, 'restaurants', rid, 'tableSessions'),
      snap => { const m = {}; snap.docs.forEach(d => { m[d.id] = { id: d.id, ...d.data() }; }); setSessions(m); }, () => {});
    const ub = onSnapshot(query(collection(scopedDb, 'restaurants', rid, 'tableBills'), where('status', '==', 'open')),
      snap => { const m = {}; snap.docs.forEach(d => { m[d.id] = { id: d.id, ...d.data() }; }); setBills(m); }, () => {});
    const uo = onSnapshot(query(collection(scopedDb, 'restaurants', rid, 'orders'), orderBy('createdAt', 'desc'), limit(300)),
      snap => { const m = {}; snap.docs.forEach(d => { m[d.id] = { id: d.id, ...d.data() }; }); setOrdersById(m); }, () => {});
    const um = onSnapshot(collection(scopedDb, 'restaurants', rid, 'menuItems'),
      snap => setRawMenu(snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(i => i.isActive !== false)), () => {});
    // Phase B.2 — waiterCalls feed for the Action Queue tab.
    const uc = onSnapshot(query(collection(scopedDb, 'restaurants', rid, 'waiterCalls'), orderBy('createdAt', 'desc')),
      snap => setAllCalls(snap.docs.map(d => ({ id: d.id, ...d.data() }))),
      err => console.error('orders waiterCalls listener error:', err));
    // Walk-in waitlist — so the floor manager sees who's waiting and can
    // notify a party when a table frees up (host stand adds them).
    const uw = onSnapshot(query(collection(scopedDb, 'restaurants', rid, 'waitlist'), orderBy('createdAt', 'asc')),
      snap => setWaitlist(snap.docs.map(d => ({ id: d.id, ...d.data() }))),
      err => console.error('orders waitlist listener error:', err));
    return () => { ua(); ut(); us(); ub(); uo(); um(); uc(); uw(); };
  }, [rid, scopedDb]);

  // Live age tick — drives the elapsed timer + "Xm ago" displays. Queue
  // needs second-resolution so a fresh call shows accurate age; other
  // tabs only need ~30s, but the one-second tick is cheap (a single
  // setState bump) so we use it everywhere.
  const [, setTick] = useState(0);
  useEffect(() => { const iv = setInterval(() => setTick(t => t + 1), 1000); return () => clearInterval(iv); }, []);

  // ─── Derived data (same shape as /admin/order-kitchen) ──────────
  const allOrdersList = useMemo(() => Object.values(ordersById), [ordersById]);

  const zones = useMemo(() => {
    const names = areas.map(a => a.name || 'Area');
    const hasUnresolved = rawTables.some(t => {
      if (!t.areaId) return true;
      return !areas.find(a => a.id === t.areaId);
    });
    if (hasUnresolved) names.push('Floor');
    return Array.from(new Set(names.length ? names : ['Floor']));
  }, [areas, rawTables]);

  const tables = useMemo(() => {
    return rawTables.map(t => {
      const cap = Math.max(1, Math.min(20, Number(t.capacity) || 4));
      const shape = cap >= 7 ? 'long' : (cap <= 2 ? 'round' : 'square');
      const area = areas.find(a => a.id === t.areaId);
      const zoneName = area ? (area.name || 'Area') : 'Floor';
      const sess = sessions[t.code];
      const billId = sess?.currentBillId;
      const bill = billId ? bills[billId] : null;
      const code = String(t.code || '');

      const fromBill = bill ? (bill.orderIds || []).map(id => ordersById[id]).filter(Boolean) : [];
      const fromTable = code ? allOrdersList.filter(o => {
        if (String(o.tableNumber || '') !== code) return false;
        if (o.orderType === 'takeaway' || o.orderType === 'takeout') return false;
        if (o.status === 'cancelled') return false;
        return !(o.status === 'served' && PAID.has(o.paymentStatus));
      }) : [];
      const dedup = {};
      for (const o of [...fromBill, ...fromTable]) if (o && o.status !== 'cancelled') dedup[o.id] = o;
      const live = Object.values(dedup);

      let status = 'free';
      let occupied = 0;
      let openedAt = '';
      if (live.length === 0) {
        if (sess?.seatedAt) {
          status = 'seated';
          occupied = Number(sess.seatedPartySize) || 0;
        }
      } else {
        const allPaid = live.every(o => PAID.has(o.paymentStatus));
        // Paid = "Paid" (clear next). Bill printed OR all items served but
        // unpaid = "Ready to pay" (collect payment). Otherwise still "Cooking".
        if (allPaid) status = 'ready';
        else if (bill?.billPrintedAt || live.every(o => o.status === 'served')) status = 'served';
        else status = 'sent';
        occupied = cap;
        const earliest = live.reduce((a, b) => {
          const ta = a.createdAt?.toMillis ? a.createdAt.toMillis() : Infinity;
          const tb = b.createdAt?.toMillis ? b.createdAt.toMillis() : Infinity;
          return ta < tb ? a : b;
        });
        if (earliest.createdAt?.toDate) {
          const d = earliest.createdAt.toDate();
          const h = d.getHours() % 12 || 12;
          openedAt = h + ':' + String(d.getMinutes()).padStart(2, '0');
        }
      }

      return {
        id: t.label || t.code || t.id,
        _docId: t.id, _code: t.code,
        zone: zoneName,
        shape, seats: cap, status,
        occupied, openedAt,
        x: 1, y: 1, w: 1, h: 1,
      };
    });
  }, [rawTables, areas, sessions, bills, ordersById, allOrdersList]);

  const totals = useMemo(() => {
    const out = {};
    tables.forEach(t => {
      const code = String(t._code || '');
      const sess = sessions[code];
      const billId = sess?.currentBillId;
      const bill = billId ? bills[billId] : null;
      const fromBill = bill ? (bill.orderIds || []).map(id => ordersById[id]).filter(Boolean) : [];
      const fromTable = code ? allOrdersList.filter(o => {
        if (String(o.tableNumber || '') !== code) return false;
        if (o.orderType === 'takeaway' || o.orderType === 'takeout') return false;
        if (o.status === 'cancelled') return false;
        return !(o.status === 'served' && PAID.has(o.paymentStatus));
      }) : [];
      const dedup = {};
      for (const o of [...fromBill, ...fromTable]) if (o && o.status !== 'cancelled') dedup[o.id] = o;
      out[t.id] = Object.values(dedup).reduce((s, o) => s + (Number(o.total) || 0), 0);
    });
    return out;
  }, [tables, sessions, bills, ordersById, allOrdersList]);

  const categories = useMemo(() => {
    const seen = new Set(); const out = [];
    for (const m of rawMenu) {
      const c = (m.category || '').trim() || 'Other';
      if (seen.has(c)) continue;
      seen.add(c);
      out.push({ id: c, label: c, emoji: emojiFor(c) });
    }
    return out;
  }, [rawMenu]);

  const menu = useMemo(() => rawMenu.map(m => ({
    id: m.id,
    cat: (m.category || '').trim() || 'Other',
    name: m.name || '',
    desc: m.description || '',
    price: Math.round(Number(m.price) || 0),
    veg: m.isVeg !== false,
    spice: spiceToInt(m.spiceLevel),
    emoji: emojiFor((m.category || '').trim()),
    tint: tintFor(m.id || m.name),
    imageURL: m.imageURL || null,
  })), [rawMenu]);

  // ─── Phase B.2 — Action Queue (calls + serves + payments) ────────
  // Merged feed, sorted oldest-first. Mirrors /admin/waiter exactly,
  // minus the `inScope` area filter — owner's call: every waiter sees
  // every action. Each item is {id, type, table, subtitle, seconds, raw}.
  const actionQueue = useMemo(() => {
    // Pending calls — straightforward map from allCalls.
    const calls = allCalls
      .filter(c => c.status === 'pending')
      .map(c => ({
        id: 'call:' + c.id,
        rawId: c.id,
        type: 'call',
        table: c.tableNumber || '—',
        subtitle: reasonLabel(c.reason),
        seconds: c.createdAt?.seconds || 0,
        raw: c,
      }));

    // Per-item ready-to-serve. Each item with readyAt-but-not-servedAt
    // becomes its OWN queue card so the waiter sees the moment any item
    // is ready, not only when the whole order is ready. Legacy orders
    // (no per-item readyAt stamps) fall back to the order-level path so
    // existing in-flight tickets still surface.
    const serves = [];
    for (const o of allOrdersList) {
      if (o.status === 'cancelled' || o.status === 'served') continue;
      const itemsArr = Array.isArray(o.items) ? o.items : [];
      const readyItems = itemsArr
        .map((it, idx) => ({ ...it, idx }))
        .filter(it => it.readyAt && !it.servedAt);
      const isTakeaway = o.orderType === 'takeaway' || o.orderType === 'takeout';
      const tableLabel = isTakeaway ? (o.customerName || 'Pickup') : (o.tableNumber || '—');

      if (readyItems.length > 0) {
        for (const it of readyItems) {
          const readySeconds = it.readyAt?.seconds
            || (it.readyAt instanceof Date ? Math.floor(it.readyAt.getTime() / 1000) : 0)
            || o.updatedAt?.seconds || o.createdAt?.seconds || 0;
          serves.push({
            id: `serve:${o.id}:${it.idx}`,
            rawId: o.id, itemIdx: it.idx, itemName: it.name,
            type: 'serve', isTakeaway,
            table: tableLabel,
            subtitle: `${orderLabel(o)} · ${it.qty || 1}× ${it.name}`,
            seconds: readySeconds,
            raw: o,
          });
        }
      } else if (o.status === 'ready') {
        // Legacy fallback — whole-order ready stamp.
        serves.push({
          id: 'serve:' + o.id,
          rawId: o.id, type: 'serve', isTakeaway,
          table: tableLabel,
          subtitle: `${orderLabel(o)} · ${itemsArr.length} item${itemsArr.length === 1 ? '' : 's'}`,
          seconds: o.updatedAt?.seconds || o.createdAt?.seconds || 0,
          raw: o,
        });
      }
    }

    // Customer-requested payments. paymentStatus ends in '_requested'.
    const payments = allOrdersList
      .filter(o => /_requested$/.test(o.paymentStatus || ''))
      .map(o => {
        const isTakeaway = o.orderType === 'takeaway' || o.orderType === 'takeout';
        const method = (o.paymentStatus || '').replace('_requested', '');  // cash | card | online
        const methodLabel = method === 'cash' ? 'Cash' : method === 'card' ? 'Card' : 'UPI';
        const totalRupees = '₹' + Math.round(Number(o.total) || 0).toLocaleString('en-IN');
        return {
          id: 'pay:' + o.id, rawId: o.id, type: 'payment',
          method, methodLabel, isTakeaway,
          table: isTakeaway ? (o.customerName || 'Pickup') : (o.tableNumber || '—'),
          subtitle: `${orderLabel(o)} · ${totalRupees} · ${methodLabel}`,
          seconds: o.paymentUpdatedAt?.seconds || o.updatedAt?.seconds || o.createdAt?.seconds || 0,
          raw: o,
        };
      });

    return [...calls, ...serves, ...payments].sort((a, b) => (a.seconds || 0) - (b.seconds || 0));
  }, [allCalls, allOrdersList]);

  const queueCount = actionQueue.length;

  // ─── App state ──────────────────────────────────────────────────
  const [screen, setScreen] = useState('floor');
  // 4-tab waiter shell: 'floor' | 'queue' | 'orders' | 'history'.
  // Defaults to floor on every load — that's the most-used tab.
  const [tab, setTab] = useState('floor');

  // ─── Station (new full-sidebar nav) ─────────────────────────────
  // The shared OkSidebar splits this page into two destinations:
  //   /admin/orders                  → Floor station (the table map)
  //   /admin/orders?station=waiter   → Waiter station (Action Queue /
  //                                    Orders / History via an in-page toggle)
  // Sync the internal `tab` to the URL station whenever it changes.
  const station = router.query.station === 'waiter' ? 'waiter' : 'floor';
  useEffect(() => {
    if (station === 'waiter') {
      setTab(t => (t === 'floor' ? 'queue' : t));
    } else {
      setTab('floor');
      setScreen('floor');
    }
  }, [station]); // eslint-disable-line react-hooks/exhaustive-deps
  const [zone, setZone] = useState(null);
  const [activeTable, setActiveTable] = useState(null);
  const [selectedSeat, setSelectedSeat] = useState(0);
  const [drafts, setDrafts] = useState({});
  const [sheet, setSheet] = useState(null);
  const [lastTicket, setLastTicket] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  // Phase B.3 / B.4 — Orders tab filter + History tab period/search.
  // Defaults match /admin/waiter (active orders, today's history).
  const [ordersFilter, setOrdersFilter] = useState('active');
  const [historyPeriod, setHistoryPeriod] = useState('today');
  const [historySearch, setHistorySearch] = useState('');
  // Desktop menu search query — owner reported "search is not
  // working" on the desktop dish grid. The mobile MenuScreen has
  // its own internal search state.
  const [menuSearchQ, setMenuSearchQ] = useState('');

  // Phase B.2 — Action Queue state.
  // resolvingId disables the action button on the card whose write is
  // in-flight so double-taps can't fire the same write twice.
  const [resolvingId, setResolvingId] = useState(null);
  // cashModal: null | { item, cashReceived } — open when waiter taps
  // "Mark Paid" on a cash payment request (Card/UPI direct-mark, no modal).
  const [cashModal, setCashModal] = useState(null);
  // Sound + voice toggles. Sound default ON; voice default OFF (some
  // staff find TTS chatty). Both persist to localStorage so the
  // setting carries across page reloads + matches /admin/waiter.
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [voiceEnabled, setVoiceEnabledState] = useState(false);
  // Flashing-IDs drives the gold pulse ring on newly-arrived cards
  // (auto-clears after 4s). unseenIds tracks NEW items the waiter
  // hasn't yet seen — used for the Queue tab's bottom-nav badge so
  // the waiter knows there's something to look at even from Floor.
  const [flashingIds, setFlashingIds] = useState(() => new Set());
  const [unseenIds, setUnseenIds] = useState(() => new Set());
  // Refs for the new-arrival detector (we compare current vs previous
  // ids to know what's NEW). initialLoadDoneRef stops the very first
  // snapshot from being interpreted as "9 new calls just arrived"
  // (because going from empty → 9 isn't a real arrival, the snapshot
  // is just settling). flashTimersRef collects the setTimeout handles
  // so we can clear them on unmount.
  const prevActionIdsRef = useRef(new Set());
  const initialLoadDoneRef = useRef(false);
  const flashTimersRef = useRef([]);

  // Stale-zone guard — keep `zone` in sync with the zones list.
  // Without this, the floor renders empty on initial mount because
  // the first render falls back to ['Floor'] (areas hadn't loaded
  // yet) and the effect didn't recover when areas arrived. See the
  // long comment in order-kitchen.js for the full trace.
  useEffect(() => {
    if (zones.length === 0) return;
    if (zone == null || !zones.includes(zone)) {
      // Restore the last-picked zone across reloads instead of always
      // snapping back to the first area.
      let saved = null;
      try { saved = sessionStorage.getItem('ar_floor_zone'); } catch {}
      setZone(zones.includes(saved) ? saved : zones[0]);
    } else {
      try { sessionStorage.setItem('ar_floor_zone', zone); } catch {}
    }
  }, [zones, zone]);

  // ─── Phase B.2 — Sound + voice prefs (LS-persisted) ──────────────
  // Load on mount, save on change. Sound key is shared with the
  // existing /admin/waiter so toggling on one updates the other.
  useEffect(() => {
    try {
      const stored = localStorage.getItem(LS_SOUND_KEY);
      if (stored !== null) setSoundEnabled(stored === 'true');
    } catch {}
    try {
      setVoiceEnabledState(isVoiceEnabled());
    } catch {}
  }, []);
  useEffect(() => {
    try { localStorage.setItem(LS_SOUND_KEY, String(soundEnabled)); } catch {}
  }, [soundEnabled]);
  useEffect(() => { setVoiceEnabledLS(voiceEnabled); }, [voiceEnabled]);

  // ─── Phase B.2 — New-arrival detector ───────────────────────────
  // Watches actionQueue for NEW ids. On first arrival, drops a 4s
  // gold flash + plays the highest-priority chime (payment > call >
  // serve) + tracks the item as "unseen" until the waiter visits
  // the Queue tab. Marking the first snapshot as "settled" prevents
  // the initial 9 calls (or whatever's already pending at load
  // time) from all going off as if they just arrived.
  useEffect(() => {
    const currentIds = new Set(actionQueue.map(i => i.id));
    const prevIds = prevActionIdsRef.current;

    if (!initialLoadDoneRef.current) {
      prevActionIdsRef.current = currentIds;
      initialLoadDoneRef.current = true;
      return;
    }

    const newlyAdded = actionQueue.filter(i => !prevIds.has(i.id));
    if (newlyAdded.length > 0) {
      const newIds = newlyAdded.map(i => i.id);
      setFlashingIds(prev => { const n = new Set(prev); newIds.forEach(id => n.add(id)); return n; });
      setUnseenIds(prev => { const n = new Set(prev); newIds.forEach(id => n.add(id)); return n; });
      const t = setTimeout(() => {
        setFlashingIds(prev => { const n = new Set(prev); newIds.forEach(id => n.delete(id)); return n; });
        flashTimersRef.current = flashTimersRef.current.filter(h => h !== t);
      }, 4000);
      flashTimersRef.current.push(t);

      // Sound + voice for the highest-priority new item.
      // payment > call > serve — cash collection is the most "respond
      // now" event for the waiter; ready-to-serve is the most casual.
      const priority = { payment: 3, call: 2, serve: 1 };
      const pick = [...newlyAdded].sort((a, b) => (priority[b.type] || 0) - (priority[a.type] || 0))[0];
      if (pick.type === 'payment') {
        announcePayment(pick.table, pick.methodLabel || 'payment', { sound: soundEnabled });
      } else if (pick.type === 'call') {
        announceCall(pick.table, pick.subtitle, { sound: soundEnabled });
      } else {
        announceReady(pick.table, { sound: soundEnabled });
      }
    }

    // Drop "unseen" markers for items that disappeared (resolved by
    // this user or another). Keeps the badge accurate.
    setUnseenIds(prev => {
      let changed = false;
      const next = new Set(prev);
      for (const id of next) if (!currentIds.has(id)) { next.delete(id); changed = true; }
      return changed ? next : prev;
    });

    prevActionIdsRef.current = currentIds;
  }, [actionQueue, soundEnabled]);

  // When waiter visits the Queue tab, clear unseen markers.
  useEffect(() => {
    if (tab === 'queue' && unseenIds.size > 0) setUnseenIds(new Set());
  }, [tab, unseenIds.size]);

  // Cleanup the flash timeout handles on unmount so we don't leak.
  useEffect(() => () => { flashTimersRef.current.forEach(clearTimeout); }, []);

  const lines = activeTable ? (drafts[activeTable.id] || []) : [];
  const setLines = useCallback((updater) => {
    if (!activeTable) return;
    setDrafts(d => ({ ...d, [activeTable.id]: updater(d[activeTable.id] || []) }));
  }, [activeTable]);

  const lineFromItem = (item, { qty, spice, notes, freeNote, seat, spiceCustom }) => ({
    uid: uid(), itemId: item.id, name: item.name, price: item.price, veg: item.veg,
    qty, spice, notes: notes || [], freeNote: freeNote || '', seat, spiceCustom: !!spiceCustom,
  });
  const findSimple = (arr, itemId, seat) => arr.find(x => x.itemId === itemId && x.seat === seat && (!x.notes || x.notes.length === 0) && !x.spiceCustom);

  const quickAdd = (item, seat) => setLines(arr => {
    const ex = findSimple(arr, item.id, seat);
    if (ex) return arr.map(l => l.uid === ex.uid ? { ...l, qty: l.qty + 1 } : l);
    return [...arr, lineFromItem(item, { qty: 1, spice: item.spice, notes: [], seat, spiceCustom: false })];
  });
  const rowStep = (item, seat, delta) => setLines(arr => {
    const ex = findSimple(arr, item.id, seat);
    if (!ex) return delta > 0 ? [...arr, lineFromItem(item, { qty: 1, spice: item.spice, notes: [], seat, spiceCustom: false })] : arr;
    const nq = ex.qty + delta;
    return nq <= 0 ? arr.filter(l => l.uid !== ex.uid) : arr.map(l => l.uid === ex.uid ? { ...l, qty: nq } : l);
  });
  const stepLine = (uidv, delta) => setLines(arr => arr.flatMap(l => {
    if (l.uid !== uidv) return [l];
    const nq = l.qty + delta;
    return nq <= 0 ? [] : [{ ...l, qty: nq }];
  }));
  const removeLine = (uidv) => setLines(arr => arr.filter(l => l.uid !== uidv));
  const commitSheet = ({ item, qty, spice, notes, freeNote, seat, spiceCustom, editUid }) => {
    setLines(arr => {
      if (editUid) return arr.map(l => l.uid === editUid ? { ...l, qty, spice, notes, freeNote, seat, spiceCustom } : l);
      if (!spiceCustom) {
        const ex = findSimple(arr, item.id, seat);
        if (ex) return arr.map(l => l.uid === ex.uid ? { ...l, qty: l.qty + qty } : l);
      }
      return [...arr, lineFromItem(item, { qty, spice, notes, freeNote, seat, spiceCustom })];
    });
    setSheet(null);
  };

  // Open the menu for a table (the original pickTable behaviour).
  const openMenuFor = (table) => {
    setActiveTable(table);
    setSelectedSeat(0);
    setScreen('menu');
  };

  // Live UNPAID orders for a table — mirrors the dedup the `tables`
  // memo uses (bill.orderIds ∪ tableNumber match), then filters to
  // not-yet-paid. Used by the settle flow; kept as a plain function
  // (not a memo) because it only runs on a tap.
  const liveUnpaidForTable = (table) => {
    const code = String(table._code || '');
    const sess = sessions[code];
    const billId = sess?.currentBillId;
    const bill = billId ? bills[billId] : null;
    const fromBill = bill ? (bill.orderIds || []).map(id => ordersById[id]).filter(Boolean) : [];
    const fromTable = code ? allOrdersList.filter(o => {
      if (String(o.tableNumber || '') !== code) return false;
      if (o.orderType === 'takeaway' || o.orderType === 'takeout') return false;
      if (o.status === 'cancelled') return false;
      return !(o.status === 'served' && PAID.has(o.paymentStatus));
    }) : [];
    const dedup = {};
    for (const o of [...fromBill, ...fromTable]) if (o && o.status !== 'cancelled') dedup[o.id] = o;
    return Object.values(dedup).filter(o => !PAID.has(o.paymentStatus));
  };

  // Settle-from-Orders (owner request, 12 Jun 2026): tapping a table
  // that has an unpaid balance now offers Add items / Settle bill
  // instead of jumping straight into the menu. Free/seated tables and
  // fully-paid tables keep the old direct-to-menu behaviour.
  const [settleSheet, setSettleSheet] = useState(null); // { table, orders, total }
  // Table actions (seat / clear) — owner request, 20 Jun 2026. Only the
  // owner OR staff with the 'tables' permission may seat/free tables (the
  // firestore.rules tableSessions write is scoped to exactly that). For
  // anyone else the tap keeps the old straight-to-menu fast path.
  const [tableSheet, setTableSheet] = useState(null); // { table }
  const canManageTables = isAdmin || (staffSession?.perms || []).includes('tables');
  // Floor-plan editor (add/edit/delete tables + areas) — owner-only, since
  // the table CRUD writes through the admin db. Opened from the floor header.
  const [manageTablesOpen, setManageTablesOpen] = useState(false);

  const pickTable = (table) => {
    const unpaid = liveUnpaidForTable(table);
    if (unpaid.length > 0) {
      const total = unpaid.reduce((s, o) => s + (Number(o.total) || 0), 0);
      setSettleSheet({ table, orders: unpaid, total });
      return;
    }
    // No unpaid balance — table is free, seated (occupied, no order yet), or
    // ready (bill paid). Offer the seat/order/clear chooser to whoever can
    // manage tables; everyone else goes straight to the menu as before.
    if (canManageTables) { setTableSheet({ table }); return; }
    openMenuFor(table);
  };

  // Mark a table Seated (occupied, before any order) — pro-POS occupancy.
  const seatTable = async (table, partySize = 0) => {
    const code = String(table._code || table.id || '');
    try {
      // Turn the table's ordering QR ON for the new party — FIRST, because it's
      // a full setDoc of the token fields and the seated-hold merge below rides
      // on top. Reuse the existing sid so a pre-printed QR keeps working across
      // parties — only isActive + a fresh expiry flip.
      await activateTableSession(rid, code, 2, { db: scopedDb, sid: sessions[code]?.sid });
      await markTableSeated(rid, code, { partySize }, { db: scopedDb });
      logStaffActivity(scopedDb, rid, { action: 'table_seated', refType: 'table', refId: code, tableNumber: code });
      toast.success(`Table ${String(table.id).replace(/^T/i, '')} seated · QR live`);
      setTableSheet(null);
    } catch (e) {
      console.error('seat failed:', e);
      toast.error('Could not mark the table seated. Try again.');
      throw e; // TableActionSheet resets its busy state on rejection
    }
  };

  // Clear a settled table → free it for the next party. A 'ready' table
  // still carries orders that are PAID but not marked served (served+paid
  // orders already drop off on their own) — those keep the table occupied
  // in the floor derivation, so we mark them served here, THEN freeTableSession
  // closes any lingering open bill + drops the seated hold. This sheet only
  // opens when the table has no UNPAID balance, so everything left is paid.
  const clearTable = async (table) => {
    const code = String(table._code || table.id || '');
    const billId = sessions[code]?.currentBillId || null;
    try {
      const lingering = allOrdersList.filter(o =>
        String(o.tableNumber || '') === code &&
        o.orderType !== 'takeaway' && o.orderType !== 'takeout' &&
        o.status !== 'cancelled' && o.status !== 'served'
      );
      for (const o of lingering) {
        if (staffSession) await updateOrderStatusAs(staffDb, rid, o.id, 'served');
        else              await updateOrderStatus(rid, o.id, 'served');
      }
      await freeTableSession(rid, code, billId, { db: scopedDb });
      // Turn the table's ordering QR OFF — the now-empty table can't be ordered
      // on until the next party is seated. Best-effort: harmless no-op if the
      // table never had a session doc.
      await clearTableSession(rid, code, { db: scopedDb }).catch(() => {});
      logStaffActivity(scopedDb, rid, { action: 'table_cleared', refType: 'table', refId: code, tableNumber: code });
      toast.success(`Table ${String(table.id).replace(/^T/i, '')} cleared`);
      setTableSheet(null);
    } catch (e) {
      console.error('clear failed:', e);
      toast.error('Could not clear the table. Try again.');
      throw e; // TableActionSheet resets its busy state on rejection
    }
  };

  // Mark every unpaid order on the table paid_<method>. SEQUENTIAL on
  // purpose: lib/db's _autoCloseBillIfAllPaid runs after each mark and
  // checks the bill's sibling orders — parallel writes could each see
  // another still-unpaid sibling and NOBODY would close the bill. One
  // at a time, the final mark sees all-paid and closes the bill +
  // frees the table session.
  //
  // v2: `extras` carries the cash calculator's { cashReceived,
  // changeGiven }. Stamped on the FIRST order only — the amounts are
  // bill-level (one handover of cash for the whole table); duplicating
  // them on every sibling order would double-count cash in day-close
  // reconciliation.
  const settleTable = async (paidStatus, methodLabel, extras = {}) => {
    if (!settleSheet) return;
    const { table, orders: toSettle, total } = settleSheet;
    try {
      for (let i = 0; i < toSettle.length; i++) {
        const o = toSettle[i];
        const ex = i === 0 ? extras : {};
        if (staffSession) await markOrderPaidAs(staffDb, rid, o.id, paidStatus, ex);
        else              await markOrderPaid(rid, o.id, paidStatus, ex);
      }
      // One rich accountability entry for the whole settle (the per-order
      // payment_marked entries above carry the detail; this carries the
      // money + table — what the owner actually scans for).
      logStaffActivity(scopedDb, rid, {
        action: 'table_settled', refType: 'order',
        refId: toSettle[0]?.id || null,
        tableNumber: table._code || table.id,
        amount: total, detail: methodLabel,
      });
      toast.success(`Table ${table.id} settled — ₹${Math.round(total).toLocaleString('en-IN')} (${methodLabel})`);
      setSettleSheet(null);
    } catch (e) {
      console.error('settle failed:', e);
      toast.error('Could not settle the table. Try again.');
      throw e; // SettleSheet resets its busy state on rejection
    }
  };

  // Print the outstanding bill from the waiter's own device. Reuses
  // lib/printKot's printBill (thermal HTML + popup chrome that survives
  // chrome-less iOS PWA windows) — same path Tables uses.
  //
  // Bill v2: assigns the formal running Bill No. at first print
  // (ensureBillNumber — reprints reuse the same number), passes the
  // cashier name, and stamps billPrintedAt so the floor token flips
  // to "ready". printBill is async (it may render a UPI pay-QR per
  // the restaurant's Bill Settings) but opens its window synchronously
  // inside this tap, so popup blockers stay happy.
  const printSettleBill = async () => {
    if (!settleSheet) return;
    const { table, orders: toPrint } = settleSheet;
    const billId = sessions[String(table._code || '')]?.currentBillId;
    // NOT awaited here — printBill must call window.open inside this
    // tap's gesture context, so the number rides along as a promise
    // and printBill resolves it after the window is already open.
    const billNumber = ensureBillNumber(rid, billId, { db: scopedDb });
    const ok = await printBill(toPrint, {
      restaurant,
      tableLabel: table._code || table.id,
      cashier: staffSession?.name || 'Owner',
      billNumber,
    });
    if (!ok) { toast.error('Allow pop-ups to print the bill'); return; }
    if (billId) markBillPrinted(rid, billId, { db: scopedDb }).catch(() => {});
  };

  // ─── Send to kitchen ────────────────────────────────────────────
  const sendOrder = async () => {
    if (submitting || !activeTable || lines.length === 0) return;
    setSubmitting(true);
    try {
      const subtotal = lines.reduce((s, l) => s + l.qty * l.price, 0);
      const gstPct = Number(restaurant?.gstPercent) || 0;
      const scPct = Number(restaurant?.serviceChargePercent) || 0;
      const cgst = subtotal * (gstPct / 2) / 100;
      const sgst = subtotal * (gstPct / 2) / 100;
      const serviceCharge = subtotal * scPct / 100;
      const preRound = subtotal + cgst + sgst + serviceCharge;
      const grandTotal = Math.round(preRound);
      const roundOff = grandTotal - preRound;

      const itemsForOrder = lines.map(l => ({
        id: l.itemId, name: l.name, price: l.price, qty: l.qty,
        seat: l.seat, spice: l.spice || 0,
        modifiers: l.notes || [], note: l.freeNote || '',
      }));

      const actorLabel = staffSession?.staffId ? `captain:staff:${staffSession.staffId}`
        : (isAdmin ? `captain:admin:${user?.email || 'owner'}` : 'captain:staff');

      const orderId = await createOrder(rid, {
        items: itemsForOrder,
        subtotal,
        gstPercent: gstPct, cgst, sgst,
        serviceCharge, roundOff, total: grandTotal,
        tableNumber: activeTable._code || activeTable.id,
        orderType: 'dinein',
        sessionId: actorLabel,
        paymentStatus: 'unpaid',
        seatsUsed: [...new Set(lines.map(l => l.seat))].sort((a, b) => a - b),
        placedFromOrderKitchen: true,
      }, { db: scopedDb });

      // The ticket id is set to a slug of the Firestore doc id as a
      // STARTING placeholder. The confirm screen render below
      // upgrades it to "#0042" once the orders subscription syncs
      // and the new order doc (with its server-assigned orderNumber)
      // reaches ordersById. Storing the orderId lets the render
      // look it back up.
      const tk = {
        _orderId: orderId,
        id: '#' + (typeof orderId === 'string' ? orderId.slice(-4).toUpperCase() : orderId),
        table: activeTable.id, zone: activeTable.zone, waiter, placedAt: nowLabel(),
        items: lines.map(l => ({ name: l.name, qty: l.qty, seat: l.seat, spice: l.spice, notes: [...l.notes] })),
      };
      setLastTicket(tk);
      setDrafts(d => ({ ...d, [activeTable.id]: [] }));
      setScreen('confirm');
      toast.success('Order placed.');
    } catch (e) {
      console.error('orders send failed:', e);
      toast.error('Could not place the order. Try again.');
    }
    setSubmitting(false);
  };

  // ─── Phase B.2 — Action Queue handlers ──────────────────────────
  // handleAction dispatches per type. Cash payments open the receipt
  // modal first (cashReceived + auto-change). Card / UPI direct-mark.
  // Serves with itemIdx use the per-item helper; legacy ready (no
  // itemIdx) marks the whole order served at once.
  const handleAction = async (item) => {
    if (item.type === 'payment' && item.method === 'cash') {
      const totalRupees = Math.round(Number(item.raw?.total) || 0);
      setCashModal({ item, cashReceived: String(totalRupees) });
      return;
    }
    setResolvingId(item.id);
    try {
      if (item.type === 'call') {
        if (staffSession) await resolveWaiterCallAs(staffDb, rid, item.rawId);
        else              await resolveWaiterCall(rid, item.rawId);
        toast.success('Call resolved.');
      } else if (item.type === 'serve') {
        if (typeof item.itemIdx === 'number') {
          const fs = staffSession ? staffDb : db;
          await markOrderItemServedAs(fs, rid, item.rawId, item.itemIdx);
          toast.success(`${item.itemName || 'Item'} served.`);
        } else if (staffSession) {
          await updateOrderStatusAs(staffDb, rid, item.rawId, 'served');
          toast.success('Order served.');
        } else {
          await updateOrderStatus(rid, item.rawId, 'served');
          toast.success('Order served.');
        }
      } else if (item.type === 'payment') {
        const newStatus = `paid_${item.method}`;
        if (staffSession) await markOrderPaidAs(staffDb, rid, item.rawId, newStatus);
        else              await markOrderPaid(rid, item.rawId, newStatus);
        toast.success(`${item.methodLabel || 'Payment'} marked paid.`);
      }
    } catch (e) {
      console.error('handleAction failed:', e);
      const msg = item.type === 'call'    ? 'Could not resolve call. Retry in a moment.'
               : item.type === 'serve'   ? 'Could not mark order as served. Retry in a moment.'
                                         : 'Could not mark payment. Retry in a moment.';
      toast.error(msg);
    }
    setResolvingId(null);
  };

  // Cash modal confirm — validates cashReceived >= total, persists
  // both cashReceived + changeGiven on the order doc for cash-drawer
  // audit (the existing /admin/payments reconciliation reads these).
  const confirmCashPayment = async () => {
    if (!cashModal) return;
    const { item, cashReceived } = cashModal;
    const total = Math.round(Number(item.raw?.total) || 0);
    const received = Math.round(Number(cashReceived) || 0);
    if (received < total) {
      toast.error(`Cash received (₹${received}) is less than total (₹${total}).`);
      return;
    }
    const change = received - total;
    setResolvingId(item.id);
    try {
      const extras = { cashReceived: received, changeGiven: change };
      if (staffSession) await markOrderPaidAs(staffDb, rid, item.rawId, 'paid_cash', extras);
      else              await markOrderPaid(rid, item.rawId, 'paid_cash', extras);
      toast.success(change > 0 ? `Paid · Change ₹${change}` : 'Paid · Exact cash');
      setCashModal(null);
    } catch (e) {
      console.error('Cash payment failed:', e);
      toast.error('Could not mark payment. Retry in a moment.');
    }
    setResolvingId(null);
  };

  // Sound toggle also unlocks the AudioContext on first activation —
  // browsers require a user gesture before playing audio.
  const toggleSound = () => {
    setSoundEnabled(v => !v);
    try { unlockSound(); } catch {}
  };
  const toggleVoice = () => setVoiceEnabledState(v => !v);

  // ─── Desktop-only derivations (stat strip + service queue) ────
  // MUST sit BEFORE the early-return render gate — otherwise the
  // hooks run conditionally and React throws a rules-of-hooks
  // error ("Rendered fewer hooks than expected"), which the
  // ErrorBoundary catches as "Something went wrong".
  // Owner caught this in the morning on both /admin/orders and
  // /admin/kitchen-new — symptom was a white screen with the
  // generic ErrorBoundary fallback. Moving the hooks above the
  // gate fixes both pages.
  const stats = useMemo(() => {
    let seated = 0, cooking = 0, ready = 0, revenue = 0;
    tables.forEach(t => {
      if (t.status === 'seated') seated++;
      else if (t.status === 'sent') cooking++;
      else if (t.status === 'served') ready++; // "ready to pay" = served, awaiting payment
      revenue += (totals[t.id] || 0);
    });
    return { seated, cooking, ready, revenue };
  }, [tables, totals]);

  const serviceQueue = useMemo(() => {
    return tables
      .filter(t => t.status === 'seated' || t.status === 'sent' || t.status === 'served' || t.status === 'ready')
      .sort((a, b) => (a.openedAt || '').localeCompare(b.openedAt || ''));
  }, [tables]);

  // Active walk-in parties (waiting + notified), oldest first — shown in the
  // floor's right rail so the table manager can notify a party when a table
  // frees up. Host stand (Waitlist page) adds them; here it's read + notify.
  const waitlistActive = useMemo(
    () => waitlist.filter(e => e.status === 'waiting' || e.status === 'notified'),
    [waitlist]
  );
  const notifyWaitParty = async (entry) => {
    try {
      await setWaitlistStatus(rid, entry.id, 'notified', { db: scopedDb });
    } catch (e) { console.error('waitlist notify failed:', e); }
  };

  const [clockNow, setClockNow] = useState(() => new Date());
  useEffect(() => {
    if (!isDesktop) return;
    const iv = setInterval(() => setClockNow(new Date()), 1000);
    return () => clearInterval(iv);
  }, [isDesktop]);

  // ─── Render gate ────────────────────────────────────────────────
  if (!authChecked || adminLoading) return null;
  if (!isAdmin && !staffSession) return null;

  const dataReady = restaurant !== null && areasReady && tablesReady;

  // ─── Body ───────────────────────────────────────────────────────
  // Floor tab respects the existing menu/review/confirm sub-screen
  // flow; the other 3 tabs are simple list views (Phase B.2-B.4
  // replace the Coming Soon placeholders with the real screens).
  let body;
  if (tab === 'queue') {
    body = (
      <ActionQueueScreen
        items={actionQueue}
        onAction={handleAction}
        resolvingId={resolvingId}
        soundEnabled={soundEnabled}
        onToggleSound={toggleSound}
        voiceEnabled={voiceEnabled}
        onToggleVoice={toggleVoice}
        flashingIds={flashingIds}
        desktop={isDesktop}
      />
    );
  } else if (tab === 'orders') {
    body = (
      <OrdersListScreen
        orders={allOrdersList}
        filter={ordersFilter}
        onFilterChange={setOrdersFilter}
        desktop={isDesktop}
      />
    );
  } else if (tab === 'history') {
    body = (
      <HistoryListScreen
        allCalls={allCalls}
        allOrders={allOrdersList}
        period={historyPeriod}
        onPeriodChange={setHistoryPeriod}
        search={historySearch}
        onSearchChange={setHistorySearch}
        desktop={isDesktop}
      />
    );
  } else if (!dataReady) {
    body = (
      <div className="screen screen-enter">
        <div className="empty"><span className="e-emoji">⏳</span><p>Loading your floor…</p></div>
      </div>
    );
  } else if (screen === 'menu' && activeTable) {
    body = (
      <MenuScreen
        table={activeTable} lines={lines} selectedSeat={selectedSeat} setSelectedSeat={setSelectedSeat}
        categories={categories} menu={menu}
        onBack={() => setScreen('floor')}
        onOpenItem={(item, editLine) => setSheet({ item, editLine })}
        onQuickAdd={quickAdd} onRowStep={rowStep}
        onViewOrder={() => setScreen('review')}
      />
    );
  } else if (screen === 'review' && activeTable) {
    body = (
      <ReviewScreen
        table={activeTable} lines={lines}
        onBack={() => setScreen('menu')} onAddMore={() => setScreen('menu')}
        onEdit={(l) => setSheet({ item: menu.find(m => m.id === l.itemId), editLine: l })}
        onRemove={removeLine} onStep={stepLine} onSend={sendOrder}
      />
    );
  } else if (screen === 'confirm' && lastTicket) {
    // Upgrade the random-looking slug id to the real "#0042" once
    // the orders subscription has synced the new doc. Falls back to
    // the slug while the round-trip is in flight (typically <1s on
    // Firestore).
    const realOrder = ordersById[lastTicket._orderId];
    const ticketWithRealId = realOrder?.orderNumber
      ? { ...lastTicket, id: `#${String(realOrder.orderNumber).padStart(4, '0')}` }
      : lastTicket;
    body = (
      <ConfirmScreen
        ticket={ticketWithRealId}
        onNewOrder={() => { setScreen('floor'); setActiveTable(null); setLastTicket(null); }}
        onViewKitchen={() => router.push('/admin/kitchen-new')}
      />
    );
  } else {
    body = (
      <FloorScreen
        tables={tables} zones={zones} zone={zone || zones[0]} setZone={setZone}
        onPick={pickTable} totals={totals} tweakShape="auto"
        waiter={waiter}
        isLight={isLight} onToggleTheme={toggleTheme}
        pushRestaurantId={rid} pushSubscriber={pushSubscriber}
        onManageTables={null}
      />
    );
  }

  // Bottom nav rules:
  //   - tab='floor' AND screen='floor' → show 4-tab nav.
  //   - tab='floor' AND screen='menu'/'review'/'confirm' → HIDE (sub-flow
  //     has its own back button / send footer; bottom nav would be noise).
  //   - any other tab → always show 4-tab nav (those tabs don't have a
  //     drill-down sub-flow yet).
  const showNav = tab !== 'floor' || screen === 'floor';

  return (
    <>
      <Head><title>Orders — HaloHelm</title></Head>
      <div className="ok-root">
        {isDesktop ? (
          <div className="okv-shell">
            <OkSidebar brand={restaurant?.name || waiter} />
            <main className="workspace">
              {/* ws-head only shows on first-level views (floor map +
                  queue/orders/history tabs). Sub-flows (menu/review/
                  confirm) have their own toolbar/back button. */}
              {!(tab === 'floor' && (screen === 'menu' || screen === 'review' || screen === 'confirm')) && (
                <div className="ws-head">
                  <div className="ws-title">
                    <div className="ws-eyebrow">{(() => {
                      const h = clockNow.getHours();
                      const g = h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
                      return `${g} · ${waiter}`;
                    })()}</div>
                    <h1 className="ws-h1">{station === 'waiter' ? 'Waiter' : 'Floor plan'}</h1>
                  </div>
                  {/* Header controls — sound + voice (waiter station only)
                      and push notifications, in ONE aligned group so they
                      line up as a row (was: bell in the header + sound/voice
                      floating in the queue body → looked misaligned). The
                      group carries the only marginLeft:auto; the clock gets 0
                      so the free space isn't split (owner screenshot, 12 Jun). */}
                  <div style={{ marginLeft: 'auto', marginRight: 14, display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                    {station === 'waiter' && (
                      <>
                        <button onClick={toggleSound} className={`ok-iconbtn${soundEnabled ? ' on' : ''}`}
                          title={soundEnabled ? 'Sound on — tap to mute' : 'Muted — tap to enable'} aria-label="Toggle sound">
                          <IconSound on={soundEnabled} />
                        </button>
                        <button onClick={toggleVoice} className={`ok-iconbtn${voiceEnabled ? ' on' : ''}`}
                          title={voiceEnabled ? 'Voice on — tap to silence' : 'Voice off — tap to enable'} aria-label="Toggle voice">
                          <IconMic on={voiceEnabled} />
                        </button>
                      </>
                    )}
                    {rid && pushSubscriber && (
                      <PushToggle restaurantId={rid} subscriber={pushSubscriber} />
                    )}
                  </div>
                  <div className="ws-clock" style={{ marginLeft: 0 }}>{I.clock}{fmtClock(clockNow)}</div>
                </div>
              )}

              {/* Waiter station — in-page Action Queue / Orders / History toggle
                  (replaces the old rail tabs now that the full sidebar owns nav). */}
              {station === 'waiter' && (
                <div style={{ display: 'flex', gap: 8, padding: '0 30px 12px', flexWrap: 'wrap' }}>
                  {[['queue', 'Action Queue'], ['orders', 'Orders'], ['history', 'History']].map(([k, label]) => {
                    const on = tab === k;
                    return (
                      <button key={k} onClick={() => setTab(k)} style={{
                        padding: '8px 16px', borderRadius: 10, fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 13,
                        background: on ? 'var(--accent)' : 'var(--card)', color: on ? 'var(--accent-ink)' : 'var(--tx-2)',
                        border: on ? '1px solid transparent' : '1px solid var(--line)',
                        display: 'inline-flex', alignItems: 'center', gap: 8, cursor: 'pointer',
                      }}>
                        {label}
                        {k === 'queue' && queueCount > 0 && (
                          <span style={{ minWidth: 18, height: 18, padding: '0 5px', borderRadius: 9, background: on ? 'rgba(0,0,0,0.18)' : 'var(--saffron)', color: '#fff', fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 700, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>{queueCount}</span>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}

              {tab === 'floor' && dataReady && screen === 'floor' && (
                <div className="floor-layout">
                  <div className="floor-main">
                    <div className="floor-toolbar">
                      {zones.length > 1 && (
                        <div className="seg">
                          <div
                            className="seg-pill"
                            style={{
                              transform: `translateX(calc(${Math.max(0, zones.indexOf(zone || zones[0]))} * (100% + 4px)))`,
                              width: `calc(${100 / zones.length}% - ${4 + 4 / zones.length}px)`,
                            }}
                          />
                          {zones.map(z => (
                            <button
                              key={z}
                              className={z === (zone || zones[0]) ? 'on' : ''}
                              onClick={() => setZone(z)}
                            >{z}</button>
                          ))}
                        </div>
                      )}
                      <div className="legend">
                        <span className="l"><span className="swatch" style={{ background: 'var(--st-free)' }} />Free</span>
                        <span className="l"><span className="swatch" style={{ background: 'var(--st-seated)' }} />Seated</span>
                        <span className="l"><span className="swatch" style={{ background: 'var(--st-sent)' }} />Cooking</span>
                        <span className="l"><span className="swatch" style={{ background: 'var(--st-served)' }} />Ready to pay</span>
                        <span className="l"><span className="swatch" style={{ background: 'var(--st-paid)' }} />Paid</span>
                      </div>
                    </div>
                    <div className="statstrip">
                      <div className="statcard">
                        <div className="sc-k"><i style={{ background: 'var(--st-seated)' }} />SEATED</div>
                        <div className="sc-v">{stats.seated}</div>
                      </div>
                      <div className="statcard">
                        <div className="sc-k"><i style={{ background: 'var(--st-sent)' }} />COOKING</div>
                        <div className="sc-v">{stats.cooking}</div>
                      </div>
                      <div className="statcard">
                        <div className="sc-k"><i style={{ background: 'var(--st-ready)' }} />READY TO PAY</div>
                        <div className="sc-v">{stats.ready}</div>
                      </div>
                      <div className="statcard">
                        <div className="sc-k"><i style={{ background: 'var(--gold)' }} />OPEN REVENUE</div>
                        <div className="sc-v">₹{Math.round(stats.revenue).toLocaleString('en-IN')}</div>
                      </div>
                    </div>
                    <div className="floor-scroll">
                      <div className="floor-grid">
                        {tables.filter(t => t.zone === (zone || zones[0])).map(t => {
                          // Shape varies by seats: round (≤2), square (3–6),
                          // long (7+) — and the status word shows on all of them.
                          const total = totals[t.id] || 0;
                          const isLong = t.shape === 'long';
                          return (
                            <button key={t.id} className={`tabletok shape-${t.shape || 'square'} status-${t.status}`} onClick={() => pickTable(t)}>
                              <span className="tdot" />
                              {isLong ? (
                                <>
                                  <div className="tlong-l">
                                    <span className="tnum">{t.id}</span>
                                    <span className="tseat">{t.occupied ? `${t.occupied}/${t.seats}` : `${t.seats} seats`}</span>
                                  </div>
                                  <div className="tlong-r">
                                    {total > 0 && <span className="ttotal">₹{total.toLocaleString('en-IN')}</span>}
                                    <span className="tlabel">{STATUS_WORD[t.status] || t.status}</span>
                                  </div>
                                </>
                              ) : (
                                <>
                                  <span className="tnum">{t.id}</span>
                                  <span className="tseat">{t.occupied ? `${t.occupied}/${t.seats}` : `${t.seats} seats`}</span>
                                  <span className="tlabel">{STATUS_WORD[t.status] || t.status}</span>
                                  {total > 0 && <span className="ttotal">₹{total.toLocaleString('en-IN')}</span>}
                                </>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                  <aside className="activity">
                    {/* Waitlist — walk-in parties from the host stand. Shown
                        only when someone's waiting, so a quiet floor stays
                        clean. Lets the table manager notify a party when a
                        table frees up. */}
                    {waitlistActive.length > 0 && (
                      <div style={{ marginBottom: 16, paddingBottom: 16, borderBottom: '1px solid var(--line)' }}>
                        <div className="activity-head" style={{ marginBottom: 10 }}>
                          <h3>Waitlist</h3>
                          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--badge-gold)' }}>{waitlistActive.length} waiting</span>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 240, overflowY: 'auto' }}>
                          {waitlistActive.map(e => {
                            const waited = e.createdAt?.seconds ? Math.max(0, Math.floor((Date.now() / 1000 - e.createdAt.seconds) / 60)) : null;
                            const notified = e.status === 'notified';
                            return (
                              <div key={e.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 10, background: 'var(--card)', border: '1px solid var(--line)' }}>
                                <div style={{ minWidth: 0, flex: 1 }}>
                                  <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 13, color: 'var(--tx)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{e.name || 'Guest'}</div>
                                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--tx-3)', marginTop: 2 }}>
                                    {(e.partySize || 1)} pax · {waited != null ? `${waited}m wait` : 'just now'}
                                  </div>
                                </div>
                                {notified ? (
                                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase', padding: '5px 10px', borderRadius: 50, background: 'rgba(63,170,99,0.16)', color: 'var(--st-ready)', whiteSpace: 'nowrap' }}>Notified</span>
                                ) : (
                                  <button onClick={() => notifyWaitParty(e)} style={{ fontFamily: 'var(--font-display)', fontSize: 12, fontWeight: 700, padding: '7px 13px', borderRadius: 9, background: 'var(--accent)', color: 'var(--accent-ink)', border: 'none', cursor: 'pointer', flexShrink: 0 }}>Notify</button>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                    <div className="activity-head">
                      <h3>Service queue</h3>
                      <span className="a-live"><i />LIVE</span>
                    </div>
                    <div className="activity-list">
                      {serviceQueue.length === 0 ? (
                        <div className="act-empty">Quiet for now.<br />Active tables will land here.</div>
                      ) : (
                        serviceQueue.map(t => (
                          <button key={t.id} className="act-card" onClick={() => pickTable(t)}>
                            <div className="ac-top">
                              <div className="ac-table">{String(t.id).replace(/^T/, '').slice(0, 3)}</div>
                              <div className="ac-meta">
                                <div className="ac-zone">{t.zone}</div>
                                <div className="ac-sub">{t.status === 'seated' ? `${t.occupied}/${t.seats} · seated` : `${t.occupied}/${t.seats} · ₹${(totals[t.id] || 0).toLocaleString('en-IN')}`}</div>
                              </div>
                              <span className={`ac-badge ${t.status}`}>
                                {t.status === 'sent' ? 'COOKING' : t.status === 'served' ? 'TO PAY' : t.status === 'seated' ? 'SEATED' : 'PAID'}
                              </span>
                            </div>
                          </button>
                        ))
                      )}
                    </div>
                  </aside>
                </div>
              )}

              {/* ─── Desktop Menu + Cart (order-layout) ─── */}
              {tab === 'floor' && (screen === 'menu' || screen === 'review') && activeTable && (() => {
                const seats = [0, ...Array.from({ length: activeTable.seats }, (_, i) => i + 1)];
                const seatTotalQty = (s) => lines.filter(l => l.seat === s).reduce((sum, l) => sum + l.qty, 0);
                const seatItemQty = (id, s) => lines.filter(l => l.itemId === id && l.seat === s).reduce((sum, l) => sum + l.qty, 0);
                const count = lines.reduce((s, l) => s + l.qty, 0);
                const subtotal = lines.reduce((s, l) => s + l.qty * l.price, 0);
                const tax = Math.round(subtotal * 0.05);
                const total = subtotal + tax;
                const seatsPresent = [...new Set(lines.map(l => l.seat))].sort((a, b) => a - b);
                return (
                  <div className="order-layout" style={{
                    flex: 1, minHeight: 0,
                    display: 'grid', gridTemplateColumns: '1fr 392px',
                  }}>
                    <div className="menu-pane" style={{
                      minWidth: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden',
                    }}>
                      <div className="menu-toolbar">
                        <button className="backbtn" onClick={() => setScreen('floor')}>{I.back}</button>
                        <div className="table-pill">
                          <span className="tp-num">{String(activeTable.id).replace(/^T/, '').slice(0, 3)}</span>
                          <span className="tp-meta">{activeTable.zone}<small>{activeTable.seats} SEATS · OPEN NOW</small></span>
                        </div>
                        {/* Desktop dish search. When non-empty,
                            category sections with zero matches are
                            hidden and the cat tabs above lose
                            scroll-anchor meaning, but they still
                            jump to whichever section is rendered. */}
                        <input
                          type="search"
                          value={menuSearchQ}
                          onChange={(e) => setMenuSearchQ(e.target.value)}
                          placeholder="Search dishes…"
                          style={{
                            flex: 1, minWidth: 0, marginLeft: 12,
                            padding: '8px 12px', borderRadius: 10,
                            background: 'var(--card)',
                            border: '1px solid var(--line)',
                            color: 'var(--tx)', fontSize: 13,
                            outline: 'none',
                            fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
                          }}
                        />
                      </div>
                      <div className="cattabs">
                        {categories.map(c => (
                          <button
                            key={c.id}
                            className="cattab"
                            onClick={() => {
                              const el = document.getElementById(`cat-${c.id}`);
                              if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
                            }}
                          >
                            <span className="cemoji">{c.emoji}</span>{c.label}
                          </button>
                        ))}
                      </div>
                      <div className="menu-scroll">
                        {(() => {
                          const q = menuSearchQ.trim().toLowerCase();
                          const itemMatches = (it) => !q
                            || (it.name || '').toLowerCase().includes(q)
                            || (it.desc || '').toLowerCase().includes(q);
                          const sections = categories.map(c => ({
                            cat: c,
                            items: menu.filter(m => m.cat === c.id && itemMatches(m)),
                          })).filter(s => s.items.length > 0);
                          if (q && sections.length === 0) {
                            return (
                              <div style={{
                                padding: '60px 20px', textAlign: 'center',
                                color: 'var(--tx-3)',
                                fontSize: 14,
                              }}>No dishes match "{menuSearchQ}".</div>
                            );
                          }
                          return sections.map(({ cat: c, items }) => {
                          return (
                            <div key={c.id} id={`cat-${c.id}`} className="cat-section">
                              <h3 className="cat-section-label"><span className="cemoji">{c.emoji}</span>{c.label}</h3>
                              <div className="dish-grid">
                                {items.map(item => {
                                  const qty = seatItemQty(item.id, selectedSeat);
                                  return (
                                    <div key={item.id} className={'dish-card' + (qty > 0 ? ' has-qty' : '')}>
                                      <div className="dish-photo" onClick={() => setSheet({ item, editLine: null })}
                                        style={{ background: `linear-gradient(150deg, ${item.tint}, ${item.tint}AA)` }}>
                                        {item.imageURL ? (
                                          /* eslint-disable-next-line @next/next/no-img-element */
                                          <img
                                            src={item.imageURL}
                                            alt={item.name}
                                            loading="lazy"
                                            decoding="async"
                                            style={{
                                              position: 'absolute', inset: 0,
                                              width: '100%', height: '100%',
                                              objectFit: 'cover', zIndex: 1,
                                            }}
                                          />
                                        ) : (
                                          <span className="dish-emoji">{item.emoji}</span>
                                        )}
                                        <div className="dish-veg" style={{ zIndex: 3 }}><VegMark veg={item.veg} /></div>
                                        {qty > 0 && <span className="dish-qty-badge">{qty}</span>}
                                        {!item.imageURL && <span className="ph-tag">photo</span>}
                                      </div>
                                      <div className="dish-body">
                                        <div className="dish-name">{item.name}</div>
                                        <div className="dish-desc">{item.desc || ' '}</div>
                                        <div className="dish-foot">
                                          <div className="dish-price"><span className="cur">₹</span>{item.price}</div>
                                          {item.spice > 0 && <span className="dish-spice"><SpicePips level={item.spice} /></span>}
                                          {qty > 0 ? (
                                            <div className="dish-stepper">
                                              <button onClick={() => rowStep(item, selectedSeat, -1)}>{I.minus}</button>
                                              <span className="qty">{qty}</span>
                                              <button onClick={() => rowStep(item, selectedSeat, 1)}>{I.plus}</button>
                                            </div>
                                          ) : (
                                            <button className="dish-add" onClick={() => quickAdd(item, selectedSeat)}>{I.plus}</button>
                                          )}
                                        </div>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          );
                          });
                        })()}
                      </div>
                    </div>
                    <aside className="cart-pane">
                      <div className="cart-head">
                        <div className="cart-head-top">
                          <h2>Current order</h2>
                          <span className="cart-count">{count} {count === 1 ? 'item' : 'items'}</span>
                        </div>
                      </div>
                      <div className="seatbar">
                        {seats.map(s => (
                          <button
                            key={s}
                            className={'seatchip' + (s === selectedSeat ? ' on' : '')}
                            onClick={() => setSelectedSeat(s)}
                          >
                            {s === 0 ? '🍽 Table' : `Seat ${s}`}
                            {seatTotalQty(s) > 0 && <span className="scount">{seatTotalQty(s)}</span>}
                          </button>
                        ))}
                      </div>
                      {lines.length === 0 ? (
                        <div className="cart-empty">
                          <span className="ce-emoji">🍽</span>
                          <p>Add items from the menu to start the order.</p>
                        </div>
                      ) : (
                        <div className="cart-scroll">
                          {seatsPresent.map(seat => {
                            const segLines = lines.filter(l => l.seat === seat);
                            const segSum = segLines.reduce((s, l) => s + l.qty * l.price, 0);
                            return (
                              <div className="seat-group" key={seat}>
                                <div className="seat-group-head">
                                  <span className="seat-badge">{seat === 0 ? '🍽' : seat}</span>
                                  <span className="sg-label">{seat === 0 ? 'Whole table' : `Seat ${seat}`}</span>
                                  <span className="sg-sum">₹{segSum.toLocaleString('en-IN')}</span>
                                </div>
                                {segLines.map(l => (
                                  <div className="lineitem" key={l.uid}>
                                    <span className="li-qty">{l.qty}×</span>
                                    <div className="li-body">
                                      <div className="li-name"><VegMark veg={l.veg} />{l.name}{l.spice > 0 && <SpicePips level={l.spice} />}</div>
                                      {(l.notes && l.notes.length > 0) && (
                                        <div className="li-mods">
                                          {l.notes.map((n, i) => <span className="li-modtag" key={i}>{n}</span>)}
                                        </div>
                                      )}
                                    </div>
                                    <div className="li-side">
                                      <span className="li-price">₹{(l.qty * l.price).toLocaleString('en-IN')}</span>
                                      <div className="li-actions">
                                        <button className="li-act" onClick={() => setSheet({ item: menu.find(m => m.id === l.itemId), editLine: l })}>{I.edit}</button>
                                        <button className="li-act del" onClick={() => removeLine(l.uid)}>{I.trash}</button>
                                      </div>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            );
                          })}
                        </div>
                      )}
                      {lines.length > 0 && (
                        <div className="cart-foot">
                          <div className="totals">
                            <div className="trow"><span>Subtotal</span><span>₹{subtotal.toLocaleString('en-IN')}</span></div>
                            <div className="trow"><span>GST (5%)</span><span>₹{tax.toLocaleString('en-IN')}</span></div>
                            <div className="trow grand"><span>Total</span><span><span className="cur">₹</span>{total.toLocaleString('en-IN')}</span></div>
                          </div>
                          <button className="send-btn" onClick={() => sendOrder(total)} disabled={submitting}>
                            {I.send} Send to kitchen
                          </button>
                        </div>
                      )}
                    </aside>
                  </div>
                );
              })()}

              {/* ─── Desktop Confirm (success modal) ─── */}
              {tab === 'floor' && screen === 'confirm' && lastTicket && (() => {
                const realOrder = ordersById[lastTicket._orderId];
                const ticketId = realOrder?.orderNumber
                  ? `#${String(realOrder.orderNumber).padStart(4, '0')}`
                  : lastTicket.id;
                return (
                <div className="modal-backdrop" style={{ position: 'absolute' }}>
                  <div className="success-card">
                    <div className="ring"><span className="check">{I.check}</span></div>
                    <h2>Order sent</h2>
                    <p className="s-sub">Ticket {ticketId} is on the kitchen rail for {lastTicket.table}.</p>
                    <div className="success-meta">
                      <div className="sm-card"><div className="sm-k">TICKET</div><div className="sm-v">{ticketId}</div></div>
                      <div className="sm-card"><div className="sm-k">TABLE</div><div className="sm-v">{lastTicket.table}</div></div>
                      <div className="sm-card"><div className="sm-k">SENT</div><div className="sm-v">{lastTicket.placedAt}</div></div>
                    </div>
                    <div className="success-actions">
                      <button className="s-primary" onClick={() => { setScreen('floor'); setActiveTable(null); setLastTicket(null); }}>Back to floor</button>
                      <button className="s-secondary" onClick={() => router.push('/admin/kitchen-new')}>View kitchen rail {I.chevR}</button>
                    </div>
                  </div>
                </div>
                );
              })()}

              {/* ─── Other tabs (queue/orders/history) — render existing
                    components inside workspace; ws-head hides for these
                    since each component has its own apphead. Phase 4
                    desktop redesign for these tabs. ─── */}
              {tab !== 'floor' && body}
              {!dataReady && tab === 'floor' && screen === 'floor' && (
                <div style={{ padding: 40, textAlign: 'center', color: 'var(--tx-3)' }}>Loading the floor…</div>
              )}

              {sheet && (
                <ItemSheet
                  item={sheet.item} table={activeTable} selectedSeat={selectedSeat} editLine={sheet.editLine}
                  onClose={() => setSheet(null)} onCommit={commitSheet}
                />
              )}
              {cashModal && (
                <CashModal
                  item={cashModal.item}
                  cashReceived={cashModal.cashReceived}
                  onChange={(v) => setCashModal(c => c ? { ...c, cashReceived: v } : c)}
                  onConfirm={confirmCashPayment}
                  onCancel={() => setCashModal(null)}
                  isResolving={resolvingId === cashModal.item.id}
                />
              )}
              {settleSheet && (
                <SettleSheet
                  table={settleSheet.table}
                  orders={settleSheet.orders}
                  total={settleSheet.total}
                  restaurant={restaurant}
                  onAddItems={() => openMenuFor(settleSheet.table)}
                  onSettle={settleTable}
                  onPrintBill={printSettleBill}
                  onClose={() => setSettleSheet(null)}
                />
              )}
              {tableSheet && (
                <TableActionSheet
                  table={tableSheet.table}
                  onSeat={(party) => seatTable(tableSheet.table, party)}
                  onOrder={() => openMenuFor(tableSheet.table)}
                  onClear={() => clearTable(tableSheet.table)}
                  onClose={() => setTableSheet(null)}
                />
              )}
              {manageTablesOpen && isAdmin && (
                <TableManagerModal
                  rid={rid}
                  areas={areas}
                  tables={rawTables}
                  onClose={() => setManageTablesOpen(false)}
                />
              )}
            </main>
          </div>
        ) : (
        <div className="page-bg">
          <div className="frame">
            <div className="notch" />
            {/* The floating theme toggle (top-right of frame) was
                awkwardly stacked above the FloorScreen apphead bell.
                Removed — the toggle now lives inline in FloorScreen's
                apphead via the isLight/onToggleTheme props passed
                above. Other screens (queue/orders/history) inherit
                the same theme via the body attribute set by useOkTheme;
                their own appheads can grow a toggle later if needed,
                but Floor is the only screen owner regularly uses. */}
            <div className="screenwrap">
              {/* Notch clearance — see comment in order-kitchen.js */}
              <div style={{ height: 30, flexShrink: 0 }} />
              {body}
              {showNav && (
                <div className="botnav">
                  <button className={tab === 'floor' ? 'on' : ''} onClick={() => { setTab('floor'); setScreen('floor'); }}>
                    {I.grid}<span>Floor</span>
                  </button>
                  <button className={tab === 'queue' ? 'on' : ''} onClick={() => setTab('queue')}>
                    {/* Badge surfaces unseen items from any tab so the
                        waiter spots new actions without staring at the
                        Queue tab. Falls back to queueCount when there
                        are open items the user HAS seen (= same count
                        as before unseen-tracking kicks in). */}
                    {(unseenIds.size > 0 || (tab !== 'queue' && queueCount > 0)) && (
                      <span className="navbadge">{unseenIds.size > 0 ? unseenIds.size : queueCount}</span>
                    )}
                    {I.bell}<span>Queue</span>
                  </button>
                  <button className={tab === 'orders' ? 'on' : ''} onClick={() => setTab('orders')}>
                    {I.receipt}<span>Orders</span>
                  </button>
                  <button className={tab === 'history' ? 'on' : ''} onClick={() => setTab('history')}>
                    {I.clock}<span>History</span>
                  </button>
                </div>
              )}
              {sheet && (
                <ItemSheet
                  item={sheet.item} table={activeTable} selectedSeat={selectedSeat} editLine={sheet.editLine}
                  onClose={() => setSheet(null)} onCommit={commitSheet}
                />
              )}
              {cashModal && (
                <CashModal
                  item={cashModal.item}
                  cashReceived={cashModal.cashReceived}
                  onChange={(v) => setCashModal(c => c ? { ...c, cashReceived: v } : c)}
                  onConfirm={confirmCashPayment}
                  onCancel={() => setCashModal(null)}
                  isResolving={resolvingId === cashModal.item.id}
                />
              )}
              {settleSheet && (
                <SettleSheet
                  table={settleSheet.table}
                  orders={settleSheet.orders}
                  total={settleSheet.total}
                  restaurant={restaurant}
                  onAddItems={() => openMenuFor(settleSheet.table)}
                  onSettle={settleTable}
                  onPrintBill={printSettleBill}
                  onClose={() => setSettleSheet(null)}
                />
              )}
              {tableSheet && (
                <TableActionSheet
                  table={tableSheet.table}
                  onSeat={(party) => seatTable(tableSheet.table, party)}
                  onOrder={() => openMenuFor(tableSheet.table)}
                  onClear={() => clearTable(tableSheet.table)}
                  onClose={() => setTableSheet(null)}
                />
              )}
              {manageTablesOpen && isAdmin && (
                <TableManagerModal
                  rid={rid}
                  areas={areas}
                  tables={rawTables}
                  onClose={() => setManageTablesOpen(false)}
                />
              )}
            </div>
          </div>
        </div>
        )}
      </div>
    </>
  );
}

// Full-screen station — bypass AdminLayout / StaffShell so the
// phone-frame UI takes the whole viewport.
Orders.getLayout = (page) => page;
