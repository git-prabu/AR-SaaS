// pages/admin/order-kitchen.js
//
// Order & Kitchen — the production port of the Claude Design
// prototype the owner verified in `/order-kitchen-reference.html`.
// Same JSX structure, same className strings, same CSS — wired to
// real Firestore data, real auth, real createOrder / updateOrder.
//
// Auth pattern mirrors /admin/kitchen.js exactly:
//   - useAuth() for admin (owner) sessions
//   - readStaffSession() for PIN-authed staff
//   - rid + scopedDb derived from whichever is active
//   - Firestore writes go through scopedDb so the staff token's
//     custom claims (role/rid/staffId) ride along, and existing
//     firestore.rules govern access.
//
// The /staff/order-kitchen URL serves this same page via the
// next.config.js afterFiles rewrite, so staff with the new
// `orderKitchen` permission see it through their drawer.

import Head from 'next/head';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/router';
import toast from 'react-hot-toast';
import { collection, doc, onSnapshot, query, orderBy, where, limit } from 'firebase/firestore';

import { useAuth } from '../../hooks/useAuth';
import { readStaffSession } from '../../lib/staffSession';
import { db, staffDb } from '../../lib/firebase';
import { getRestaurantById, createOrder, updateOrderStatusAs, updateOrderStatus } from '../../lib/db';

import FloorScreen from '../../components/order-kitchen/FloorScreen';
import MenuScreen, { ItemSheet } from '../../components/order-kitchen/MenuScreen';
import ReviewScreen, { ConfirmScreen } from '../../components/order-kitchen/ReviewScreen';
import KitchenScreen from '../../components/order-kitchen/KitchenScreen';
import { I } from '../../components/order-kitchen/Icons';

// ─── helpers ──────────────────────────────────────────────────────
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

// `mode` controls which side of the station is rendered:
//   - 'full'    (default): owner's combined view. Bottom nav lets them
//                          toggle Floor ↔ Kitchen inside the page. This
//                          is what /admin/order-kitchen URL serves
//                          (legacy backward compat).
//   - 'floor'   waiter station. Initial tab forced to Floor. No internal
//                          bottom-nav switcher — the WaiterShell bottom
//                          nav (Phase B) replaces it. Served at /admin/orders.
//   - 'kitchen' kitchen station. Initial tab forced to Kitchen. No internal
//                          bottom-nav switcher — Phase C wires per-item bump.
//                          Served at /admin/kitchen-new.
export default function OrderKitchen({ mode = 'full' } = {}) {
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

  // Auth gate — bounce out if neither signed in. Mirrors /admin/kitchen.js logic.
  useEffect(() => {
    if (!authChecked || adminLoading) return;
    if (user && !userData) return; // waiting for userData to load
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

  // Track first-fire of each subscription. Without these, the page
  // gates the floor on `restaurant !== null` only, so the moment
  // restaurant loads (~one-shot fetch, often the fastest) the floor
  // renders with empty `areas` / `rawTables`. tables.useMemo runs
  // over 0 rows, the filter returns 0, the floor shows blank.
  // Owner's image-1 captured exactly this window: a click on a zone
  // tab arrived AFTER the snapshots fired, so the second render had
  // populated tables and the same zone filter suddenly worked.
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
    return () => { ua(); ut(); us(); ub(); uo(); um(); };
  }, [rid, scopedDb]);

  // Live age tick — bumps every 30s so kitchen ticket "Xm" advances.
  const [, setTick] = useState(0);
  useEffect(() => { const iv = setInterval(() => setTick(t => t + 1), 30_000); return () => clearInterval(iv); }, []);

  // ─── Derived data in prototype shape ────────────────────────────
  const allOrdersList = useMemo(() => Object.values(ordersById), [ordersById]);

  const zones = useMemo(() => {
    const names = areas.map(a => a.name || 'Area');
    // Include 'Floor' as a zone if ANY table can't be resolved to a
    // known area — either no areaId at all, OR areaId points to a
    // deleted/renamed area that no longer exists in `areas`. Without
    // this, orphaned tables get zone:'Floor' from the table mapping
    // below but 'Floor' isn't in zones — so they vanish from every
    // tab. Owner's first deploy hit exactly this case: 5 tables, 2
    // areas in tabs, but tables didn't render because their areaId
    // referenced areas that aren't in the current areas list.
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

      // Union live orders reaching this table (via bill OR by tableNumber).
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

  // Kitchen tickets derived from active orders.
  const tickets = useMemo(() => {
    const ts = [];
    for (const o of allOrdersList) {
      let bucket = null;
      if (o.status === 'cancelled') continue;
      if (o.orderType === 'takeaway' || o.orderType === 'takeout') continue;
      if (o.status === 'served') continue;
      if (o.status === 'ready') bucket = 'ready';
      else if (o.status === 'preparing') bucket = 'cooking';
      else if (o.status === 'pending') bucket = 'new';
      else if (o.status === 'awaiting_payment') bucket = 'new';
      if (!bucket) continue;
      const created = o.createdAt?.toDate ? o.createdAt.toDate() : new Date();
      const ageMin = Math.max(0, Math.floor((Date.now() - created.getTime()) / 60000));
      const placedAt = (created.getHours() % 12 || 12) + ':' + String(created.getMinutes()).padStart(2, '0');
      ts.push({
        id: '#' + (o.orderNumber ? String(o.orderNumber).padStart(4, '0') : String(o.id).slice(-4).toUpperCase()),
        _orderId: o.id,
        table: String(o.tableNumber || '-'),
        zone: o.zone || 'Floor',
        waiter: o.placedBy || '',
        placedAt, ageMin, status: bucket,
        items: (o.items || []).map(it => ({
          name: it.name || '', qty: Number(it.qty) || 1,
          seat: Number(it.seat) || 0,
          spice: typeof it.spice === 'number' ? it.spice : spiceToInt(it.spiceLevel),
          notes: it.modifiers || it.notes || [],
        })),
      });
    }
    return ts;
  }, [allOrdersList]);

  // ─── App state ──────────────────────────────────────────────────
  const [screen, setScreen] = useState('floor');
  // Initial tab respects `mode`: kitchen-only pages land on Kitchen,
  // everyone else (waiter / combined / no-prop fallback) starts on Floor.
  const [tab, setTab] = useState(mode === 'kitchen' ? 'kitchen' : 'floor');
  const [zone, setZone] = useState(null);
  const [activeTable, setActiveTable] = useState(null);
  const [selectedSeat, setSelectedSeat] = useState(0);
  const [drafts, setDrafts] = useState({});
  const [sheet, setSheet] = useState(null);
  const [lastTicket, setLastTicket] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  // Keep `zone` in sync with the available zones list. Both
  // conditions matter:
  //   (a) initial-mount: zone starts null, set to zones[0] once
  //       zones populates.
  //   (b) STALE: if the current `zone` value isn't in `zones`
  //       anymore (e.g. first render had zones=['Floor'] from
  //       the fallback because areas hadn't loaded yet, then
  //       areas arrived with ['Rooftop','Ground'] — `zone` is
  //       stuck on 'Floor', no table matches, floor renders
  //       empty until the user clicks a tab. This was the
  //       "starting empty" bug owner kept reporting).
  useEffect(() => {
    if (zones.length === 0) return;
    if (zone == null || !zones.includes(zone)) setZone(zones[0]);
  }, [zones, zone]);

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

  // ─── Send to kitchen (real Firestore write) ─────────────────────
  const sendOrder = async (totalFromReview) => {
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
      console.error('order-kitchen send failed:', e);
      toast.error('Could not place the order. Try again.');
    }
    setSubmitting(false);
  };

  // ─── Kitchen bump ────────────────────────────────────────────────
  const onBump = useCallback(async (ticket, nextStatus) => {
    // nextStatus is prototype name: cooking | ready | cleared
    const map = { cooking: 'preparing', ready: 'ready', cleared: 'served' };
    const orderStatus = map[nextStatus] || nextStatus;
    try {
      if (isAdmin) await updateOrderStatus(rid, ticket._orderId, orderStatus, { db: scopedDb });
      else await updateOrderStatusAs(scopedDb, rid, ticket._orderId, orderStatus);
    } catch (e) {
      console.error('order-kitchen bump failed:', e);
      toast.error('Could not update the order.');
    }
  }, [rid, scopedDb, isAdmin]);

  // ─── Render gate ────────────────────────────────────────────────
  if (!authChecked || adminLoading) return null;
  if (!isAdmin && !staffSession) return null;

  // Loading skeleton while first Firestore batch arrives. Must wait
  // for areas AND tables to fire — see the comment on areasReady/
  // tablesReady states above. `>= 0` is always true and was the bug.
  const dataReady = restaurant !== null && areasReady && tablesReady;

  // ─── Body ───────────────────────────────────────────────────────
  let body;
  if (tab === 'kitchen') {
    body = <KitchenScreen tickets={tickets} onBump={onBump} />;
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
        onViewKitchen={() => { setTab('kitchen'); }}
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

  // Internal Floor↔Kitchen toggle is owner-only (mode='full'). The
  // dedicated /admin/orders and /admin/kitchen-new pages each own one
  // half of the station; cross-page navigation goes through the sidebar
  // (admin) or StaffShell bottom nav (staff). Phase B will replace
  // this whole conditional with the 4-tab waiter bottom nav.
  const showNav = mode === 'full' && ((tab === 'kitchen') || (tab === 'floor' && screen === 'floor'));
  const newTickets = tickets.filter(t => t.status === 'new').length;

  return (
    <>
      <Head><title>Order & Kitchen — HaloHelm</title></Head>
      <div className="ok-root">
        <div className="page-bg">
          <div className="frame">
            <div className="notch" />
            <div className="screenwrap">
              {/* Notch clearance — the .notch is absolute-positioned at
                  top:8px of .frame (height 28px), and .screenwrap also
                  starts at frame-top. Without this spacer, the apphead's
                  eyebrow row collides with the notch in the center 124px
                  and gets clipped ("GOOD AFTERNOON" → "GOOD AFT..."). 30px
                  matches notch height + a small buffer. */}
              <div style={{ height: 30, flexShrink: 0 }} />
              {body}
              {showNav && (
                <div className="botnav">
                  <button className={tab === 'floor' ? 'on' : ''} onClick={() => { setTab('floor'); setScreen('floor'); }}>
                    {I.grid}<span>Floor</span>
                  </button>
                  <button className={tab === 'kitchen' ? 'on' : ''} onClick={() => setTab('kitchen')}>
                    {newTickets > 0 && <span className="navbadge">{newTickets}</span>}
                    {I.chef}<span>Kitchen</span>
                  </button>
                </div>
              )}
              {sheet && (
                <ItemSheet
                  item={sheet.item} table={activeTable} selectedSeat={selectedSeat} editLine={sheet.editLine}
                  onClose={() => setSheet(null)} onCommit={commitSheet}
                />
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

// Full-screen station app — bypass AdminLayout / StaffShell so the
// prototype's CSS takes the entire viewport. Same pattern as
// /admin/kitchen.js and /admin/waiter.js.
OrderKitchen.getLayout = (page) => page;
