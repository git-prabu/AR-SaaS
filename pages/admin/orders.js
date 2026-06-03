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
import toast from 'react-hot-toast';
import { collection, onSnapshot, query, orderBy, where, limit } from 'firebase/firestore';

import { useAuth } from '../../hooks/useAuth';
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
} from '../../lib/db';
import {
  announceCall, announceReady, announcePayment,
  unlockSound, isVoiceEnabled, setVoiceEnabled as setVoiceEnabledLS,
} from '../../lib/sounds';

import FloorScreen from '../../components/order-kitchen/FloorScreen';
import MenuScreen, { ItemSheet } from '../../components/order-kitchen/MenuScreen';
import ReviewScreen, { ConfirmScreen } from '../../components/order-kitchen/ReviewScreen';
import ActionQueueScreen, { CashModal } from '../../components/order-kitchen/ActionQueueScreen';
import { I } from '../../components/order-kitchen/Icons';

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

// LocalStorage keys for sound preference — shared with /admin/waiter
// so toggling on one page persists to the other.
const LS_SOUND_KEY = 'ar_waiter_sound';

export default function Orders() {
  const router = useRouter();
  const { user, userData, loading: adminLoading } = useAuth();
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
    return () => { ua(); ut(); us(); ub(); uo(); um(); uc(); };
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
        if (allPaid || bill?.billPrintedAt) status = 'ready';
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
  const [zone, setZone] = useState(null);
  const [activeTable, setActiveTable] = useState(null);
  const [selectedSeat, setSelectedSeat] = useState(0);
  const [drafts, setDrafts] = useState({});
  const [sheet, setSheet] = useState(null);
  const [lastTicket, setLastTicket] = useState(null);
  const [submitting, setSubmitting] = useState(false);

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
    if (zone == null || !zones.includes(zone)) setZone(zones[0]);
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

  const pickTable = (table) => {
    setActiveTable(table);
    setSelectedSeat(0);
    setScreen('menu');
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

      const tk = {
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
      />
    );
  } else if (tab === 'orders') {
    body = (
      <div className="screen screen-enter">
        <div style={{
          padding: '14px 20px', flexShrink: 0,
          display: 'flex', flexDirection: 'row', alignItems: 'center',
          gap: 12, width: '100%',
        }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{
              fontFamily: "'JetBrains Mono', ui-monospace, monospace",
              fontSize: 10, fontWeight: 600, letterSpacing: '0.18em',
              textTransform: 'uppercase', color: 'rgba(239,235,228,0.38)',
            }}>Today</div>
            <h1 style={{
              fontFamily: "'Poppins', -apple-system, BlinkMacSystemFont, sans-serif",
              fontWeight: 700, fontSize: 27, letterSpacing: '-0.02em',
              margin: '2px 0 0', color: '#EFEBE4', lineHeight: 1.1,
            }}>Orders</h1>
          </div>
        </div>
        <div className="scroll">
          <div className="empty">
            <span className="e-emoji">📒</span>
            <p>Today&apos;s orders ledger lands here in Phase B.3 — Active / Served filter chips, the same data /admin/orders-ledger shows now but in this dark UI.</p>
          </div>
        </div>
      </div>
    );
  } else if (tab === 'history') {
    body = (
      <div className="screen screen-enter">
        <div style={{
          padding: '14px 20px', flexShrink: 0,
          display: 'flex', flexDirection: 'row', alignItems: 'center',
          gap: 12, width: '100%',
        }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{
              fontFamily: "'JetBrains Mono', ui-monospace, monospace",
              fontSize: 10, fontWeight: 600, letterSpacing: '0.18em',
              textTransform: 'uppercase', color: 'rgba(239,235,228,0.38)',
            }}>Past shifts</div>
            <h1 style={{
              fontFamily: "'Poppins', -apple-system, BlinkMacSystemFont, sans-serif",
              fontWeight: 700, fontSize: 27, letterSpacing: '-0.02em',
              margin: '2px 0 0', color: '#EFEBE4', lineHeight: 1.1,
            }}>History</h1>
          </div>
        </div>
        <div className="scroll">
          <div className="empty">
            <span className="e-emoji">🗓️</span>
            <p>History lands in Phase B.4 — date-range picker, resolved calls and served orders together, so the waiter can audit a past shift.</p>
          </div>
        </div>
      </div>
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
    body = (
      <ConfirmScreen
        ticket={lastTicket}
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
        <div className="page-bg">
          <div className="frame">
            <div className="notch" />
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
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

// Full-screen station — bypass AdminLayout / StaffShell so the
// phone-frame UI takes the whole viewport.
Orders.getLayout = (page) => page;
