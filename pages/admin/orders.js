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
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/router';
import toast from 'react-hot-toast';
import { collection, onSnapshot, query, orderBy, where, limit } from 'firebase/firestore';

import { useAuth } from '../../hooks/useAuth';
import { readStaffSession } from '../../lib/staffSession';
import { db, staffDb } from '../../lib/firebase';
import { getRestaurantById, createOrder } from '../../lib/db';

import FloorScreen from '../../components/order-kitchen/FloorScreen';
import MenuScreen, { ItemSheet } from '../../components/order-kitchen/MenuScreen';
import ReviewScreen, { ConfirmScreen } from '../../components/order-kitchen/ReviewScreen';
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

  // Live age tick — drives any "Xm ago" displays in the queue / orders /
  // history tabs. 30s is the same cadence the kitchen ticket "Xm" uses
  // in /admin/order-kitchen.
  const [, setTick] = useState(0);
  useEffect(() => { const iv = setInterval(() => setTick(t => t + 1), 30_000); return () => clearInterval(iv); }, []);

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

  // Stale-zone guard — keep `zone` in sync with the zones list.
  // Without this, the floor renders empty on initial mount because
  // the first render falls back to ['Floor'] (areas hadn't loaded
  // yet) and the effect didn't recover when areas arrived. See the
  // long comment in order-kitchen.js for the full trace.
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
            }}>Action Queue</div>
            <h1 style={{
              fontFamily: "'Poppins', -apple-system, BlinkMacSystemFont, sans-serif",
              fontWeight: 700, fontSize: 27, letterSpacing: '-0.02em',
              margin: '2px 0 0', color: '#EFEBE4', lineHeight: 1.1,
            }}>Queue</h1>
          </div>
        </div>
        <div className="scroll">
          <div className="empty">
            <span className="e-emoji">🔔</span>
            <p>Action Queue wires up next (Phase B.2). It will show call-waiter pings, ready-to-deliver items, and customer payment requests in the same priority order as /admin/waiter does today.</p>
          </div>
        </div>
      </div>
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
