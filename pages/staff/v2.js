// pages/staff/v2.js
//
// Parallel new staff app — Aspire-deep theme order management.
// Lives alongside the existing /staff/waiter & /staff/kitchen until
// the new flow is feature-complete and the owner switches over.
//
// All UI scoped under .sv2 — dark theme tokens cannot leak.
//
// Architecture mirrors the prototype's app.jsx:
//   - Tab state: 'floor' | 'kitchen' (bottom nav)
//   - Screen state within floor tab: 'floor' | 'menu' | 'review' | 'confirm'
//   - Drafts: per-table cart lines (Map<tableId, line[]>)
//   - Item sheet: { item, editLine } or null
//
// Phase B: floor → menu → review → confirm end-to-end with real
// menu data and real createOrder writes. Kitchen tab placeholder.
// Phase C wires live Firestore subscriptions to floor table status.
// Phase D builds the real kitchen rail.

import Head from 'next/head';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/router';
import toast from 'react-hot-toast';
import { readStaffSession } from '../../lib/staffSession';
import { staffDb } from '../../lib/firebase';
import { collection, onSnapshot, query, orderBy, where, limit } from 'firebase/firestore';
import { getAllMenuItems, getRestaurantById, createOrder, updateOrderStatusAs } from '../../lib/db';
import { I } from '../../components/staff-v2/ui/icons';
import FloorScreen from '../../components/staff-v2/screens/FloorScreen';
import MenuScreen from '../../components/staff-v2/screens/MenuScreen';
import ItemSheet from '../../components/staff-v2/screens/ItemSheet';
import ReviewScreen from '../../components/staff-v2/screens/ReviewScreen';
import ConfirmScreen from '../../components/staff-v2/screens/ConfirmScreen';
import KitchenScreen from '../../components/staff-v2/screens/KitchenScreen';

// uid generator for cart lines — local-only, never persisted.
let _uid = 0;
const uid = () => 'L' + (++_uid);

const nowLabel = () => {
  const d = new Date();
  let h = d.getHours() % 12; if (h === 0) h = 12;
  return h + ':' + String(d.getMinutes()).padStart(2, '0');
};

export default function StaffV2() {
  const router = useRouter();
  const [session, setSession] = useState(null);
  const [checked, setChecked] = useState(false);

  useEffect(() => { setSession(readStaffSession()); setChecked(true); }, []);
  useEffect(() => { if (checked && !session) router.replace('/staff/login'); }, [checked, session, router]);

  // Live tick so kitchen ticket ages advance without needing fresh
  // order data — every 30s nudges a counter that's read inside
  // KitchenScreen's age math. Same idea as the prototype's 25s tick.
  const [, setTick] = useState(0);
  useEffect(() => {
    const iv = setInterval(() => setTick(t => t + 1), 30_000);
    return () => clearInterval(iv);
  }, []);

  // ── Data load (Phase C: live subscriptions) ──────────────────────
  const [restaurant, setRestaurant] = useState(null);
  const [menu, setMenu] = useState([]);
  const [areas, setAreas] = useState([]);
  const [tables, setTables] = useState([]);
  const [sessions, setSessions] = useState({});      // tableSessions keyed by table.code
  const [bills, setBills] = useState({});            // open tableBills keyed by billId
  const [ordersById, setOrdersById] = useState({}); // recent orders keyed by orderId
  const [loading, setLoading] = useState(true);

  const rid = session?.restaurantId;

  // One-shot loads (rarely change mid-shift): restaurant + menu.
  useEffect(() => {
    if (!rid) return;
    let cancelled = false;
    setLoading(true);
    Promise.all([
      getRestaurantById(rid, { db: staffDb }),
      getAllMenuItems(rid, { db: staffDb }),
    ]).then(([r, m]) => {
      if (cancelled) return;
      setRestaurant(r);
      setMenu((m || []).filter(i => i.isActive !== false));
      setLoading(false);
    }).catch(err => {
      console.error('staff-v2 load:', err);
      if (cancelled) return;
      toast.error('Could not load the menu.');
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [rid]);

  // Live subscriptions — areas, tables, tableSessions, open bills,
  // recent orders. Same shape /admin/tables.js uses so v2 sees the
  // exact same floor state in real time. Stream caps at 300 orders
  // (matches kitchen page) so a long-lived restaurant doesn't
  // stream its whole history.
  useEffect(() => {
    if (!rid) return;
    const ua = onSnapshot(
      query(collection(staffDb, 'restaurants', rid, 'areas'), orderBy('sortOrder', 'asc')),
      snap => setAreas(snap.docs.map(d => ({ id: d.id, ...d.data() }))),
      () => {}
    );
    const ut = onSnapshot(
      query(collection(staffDb, 'restaurants', rid, 'tables'), orderBy('sortOrder', 'asc')),
      snap => setTables(snap.docs.map(d => ({ id: d.id, ...d.data() }))),
      () => {}
    );
    const us = onSnapshot(
      collection(staffDb, 'restaurants', rid, 'tableSessions'),
      snap => {
        const m = {};
        snap.docs.forEach(d => { m[d.id] = { id: d.id, ...d.data() }; });
        setSessions(m);
      },
      () => {}
    );
    const ub = onSnapshot(
      query(collection(staffDb, 'restaurants', rid, 'tableBills'), where('status', '==', 'open')),
      snap => {
        const m = {};
        snap.docs.forEach(d => { m[d.id] = { id: d.id, ...d.data() }; });
        setBills(m);
      },
      () => {}
    );
    const uo = onSnapshot(
      query(collection(staffDb, 'restaurants', rid, 'orders'), orderBy('createdAt', 'desc'), limit(300)),
      snap => {
        const m = {};
        snap.docs.forEach(d => { m[d.id] = { id: d.id, ...d.data() }; });
        setOrdersById(m);
      },
      () => {}
    );
    return () => { ua(); ut(); us(); ub(); uo(); };
  }, [rid]);

  // ── Live per-table status + total ─────────────────────────────────
  // Mirrors /admin/tables.js logic so the two views can't drift.
  //   - status 'sent'   → orders are in the kitchen (running / KOT)
  //   - status 'ready'  → bill printed OR all orders paid (awaiting clear)
  //   - status 'seated' → host seated a party but no order placed yet
  //   - status 'free'   → no live orders, no seated hold
  const PAID_SET = new Set(['paid_cash', 'paid_card', 'paid_online', 'paid']);
  const allOrdersList = useMemo(() => Object.values(ordersById), [ordersById]);
  const { statuses, totals } = useMemo(() => {
    const st = {}, tot = {};
    for (const t of tables) {
      const sess = sessions[t.code];
      const billId = sess?.currentBillId;
      const bill = billId ? bills[billId] : null;
      const code = String(t.code || '');

      // Orders reach a table two ways: via the open tableBill OR
      // directly by tableNumber === table.code (waiter/admin dine-in
      // orders, which never attach to a bill).
      const fromBill = bill ? (bill.orderIds || []).map(id => ordersById[id]).filter(Boolean) : [];
      const fromTable = code ? allOrdersList.filter(o => {
        if (String(o.tableNumber || '') !== code) return false;
        if (o.orderType === 'takeaway' || o.orderType === 'takeout') return false;
        if (o.status === 'cancelled') return false;
        const done = o.status === 'served' && PAID_SET.has(o.paymentStatus);
        return !done;
      }) : [];
      const dedup = {};
      for (const o of [...fromBill, ...fromTable]) if (o && o.status !== 'cancelled') dedup[o.id] = o;
      const live = Object.values(dedup);

      if (live.length === 0) {
        st[t.id] = sess?.seatedAt ? 'seated' : 'free';
        tot[t.id] = 0;
        continue;
      }
      tot[t.id] = live.reduce((s, o) => s + (Number(o.total) || 0), 0);
      const allPaid = live.every(o => PAID_SET.has(o.paymentStatus));
      if (allPaid)                     st[t.id] = 'ready';
      else if (bill?.billPrintedAt)    st[t.id] = 'ready';
      else                              st[t.id] = 'sent';
    }
    return { statuses: st, totals: tot };
  }, [tables, sessions, bills, ordersById, allOrdersList]);

  // ── App state ────────────────────────────────────────────────────
  const [tab, setTab] = useState('floor');                  // 'floor' | 'kitchen'
  const [screen, setScreen] = useState('floor');            // 'floor' | 'menu' | 'review' | 'confirm'
  const [zone, setZone] = useState(null);
  const [activeTable, setActiveTable] = useState(null);
  const [selectedSeat, setSelectedSeat] = useState(0);
  const [drafts, setDrafts] = useState({});                 // { [tableId]: line[] }
  const [sheet, setSheet] = useState(null);                 // { item, editLine }
  const [lastTicket, setLastTicket] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  const lines = activeTable ? (drafts[activeTable.id] || []) : [];
  const setLines = useCallback((updater) => {
    if (!activeTable) return;
    setDrafts(d => ({ ...d, [activeTable.id]: updater(d[activeTable.id] || []) }));
  }, [activeTable]);

  // ── Cart operations ──────────────────────────────────────────────
  const lineFromItem = (item, { qty, spice, notes, freeNote, seat, spiceCustom }) => ({
    uid: uid(),
    itemId: item.id,
    name: item.name,
    price: Number(item.price) || 0,
    veg: item.isVeg !== false,
    qty,
    spice,
    notes: notes || [],
    freeNote: freeNote || '',
    seat,
    spiceCustom: !!spiceCustom,
  });

  const findSimple = (arr, itemId, seat) => arr.find(x =>
    x.itemId === itemId &&
    x.seat === seat &&
    (!x.notes || x.notes.length === 0) &&
    !x.spiceCustom
  );

  const quickAdd = (item, seat) => setLines(arr => {
    const ex = findSimple(arr, item.id, seat);
    if (ex) return arr.map(l => l.uid === ex.uid ? { ...l, qty: l.qty + 1 } : l);
    const baseSpice = spiceIntFromItem(item);
    return [...arr, lineFromItem(item, { qty: 1, spice: baseSpice, notes: [], seat, spiceCustom: false })];
  });

  const rowStep = (item, seat, delta) => setLines(arr => {
    const ex = findSimple(arr, item.id, seat);
    if (!ex) {
      if (delta <= 0) return arr;
      const baseSpice = spiceIntFromItem(item);
      return [...arr, lineFromItem(item, { qty: 1, spice: baseSpice, notes: [], seat, spiceCustom: false })];
    }
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
      if (editUid) {
        return arr.map(l => l.uid === editUid ? { ...l, qty, spice, notes, freeNote, seat, spiceCustom } : l);
      }
      if (!spiceCustom) {
        const ex = findSimple(arr, item.id, seat);
        if (ex) return arr.map(l => l.uid === ex.uid ? { ...l, qty: l.qty + qty } : l);
      }
      return [...arr, lineFromItem(item, { qty, spice, notes, freeNote, seat, spiceCustom })];
    });
    setSheet(null);
  };

  // ── Navigation ───────────────────────────────────────────────────
  const pickTable = (table) => {
    setActiveTable(table);
    setSelectedSeat(0);
    setScreen('menu');
  };

  // ── Send-to-kitchen ──────────────────────────────────────────────
  const sendOrder = async (totals) => {
    if (submitting || !activeTable || lines.length === 0) return;
    setSubmitting(true);
    try {
      // Each cart line becomes an order item with per-seat / spice /
      // notes / freeNote fields carried into the order doc. Existing
      // KOT print + kitchen consumers will see the seat tag.
      const items = lines.map(l => ({
        id: l.itemId,
        name: l.name,
        price: l.price,
        qty: l.qty,
        seat: l.seat,                  // 0 = whole table
        spice: l.spice || 0,           // 0..4
        modifiers: l.notes || [],      // ['No onion', ...]
        note: l.freeNote || '',
      }));
      const placedAt = nowLabel();
      const actorLabel = session?.staffId ? `captain:staff:${session.staffId}` : 'captain:staff';
      const orderId = await createOrder(rid, {
        items,
        subtotal: totals.subtotal,
        gstPercent: totals.gstPct,
        cgst: totals.cgst,
        sgst: totals.sgst,
        serviceCharge: totals.serviceCharge,
        roundOff: totals.roundOff,
        total: totals.grandTotal,
        tableNumber: activeTable.code || activeTable.label || activeTable.id,
        orderType: 'dinein',
        sessionId: actorLabel,
        paymentStatus: 'unpaid',
        // Per-seat + modifier tracking lives on items[], plus a roll-up
        // here for quick filtering (e.g. "who ordered for seat 3").
        seatsUsed: [...new Set(lines.map(l => l.seat))].sort((a, b) => a - b),
        placedFromV2: true,
      }, { db: staffDb });

      const tk = {
        id: '#' + (typeof orderId === 'string' ? orderId.slice(-4).toUpperCase() : orderId),
        table: activeTable.label || activeTable.id,
        zone: activeTable.zone || 'Floor',
        waiter: session?.name || 'Staff',
        placedAt,
        items,
      };
      setLastTicket(tk);
      // Clear this table's draft and route to confirm.
      setDrafts(d => ({ ...d, [activeTable.id]: [] }));
      setScreen('confirm');
      toast.success('Order placed.');
    } catch (e) {
      console.error('staff-v2 createOrder failed:', e);
      toast.error('Could not place order. Try again.');
    }
    setSubmitting(false);
  };

  if (!checked) return null;
  if (!session) return null;

  // Kitchen bump — write order status changes via staffDb so the
  // staff token rides along (matches the existing /admin/kitchen
  // pattern with updateOrderStatusAs).
  const handleBump = useCallback(async (orderId, nextStatus) => {
    try {
      await updateOrderStatusAs(staffDb, rid, orderId, nextStatus);
    } catch (e) {
      console.error('staff-v2 bump:', e);
      toast.error('Could not update the order. Try again.');
    }
  }, [rid]);

  // ── Render ───────────────────────────────────────────────────────
  let body;
  if (tab === 'kitchen') {
    body = <KitchenScreen orders={allOrdersList} onBump={handleBump} />;
  } else if (loading) {
    body = (
      <div className="screen screen-enter">
        <div className="empty">
          <span className="e-emoji">⏳</span>
          <p>Loading your floor…</p>
        </div>
      </div>
    );
  } else if (screen === 'menu' && activeTable) {
    body = (
      <MenuScreen
        table={activeTable}
        menu={menu}
        lines={lines}
        selectedSeat={selectedSeat}
        setSelectedSeat={setSelectedSeat}
        onBack={() => setScreen('floor')}
        onOpenItem={(item, editLine) => setSheet({ item, editLine })}
        onQuickAdd={quickAdd}
        onRowStep={rowStep}
        onViewOrder={() => setScreen('review')}
      />
    );
  } else if (screen === 'review' && activeTable) {
    body = (
      <ReviewScreen
        table={activeTable}
        lines={lines}
        restaurant={restaurant}
        onBack={() => setScreen('menu')}
        onAddMore={() => setScreen('menu')}
        onEdit={(l) => setSheet({ item: menu.find(m => m.id === l.itemId), editLine: l })}
        onRemove={removeLine}
        onStep={stepLine}
        onSend={sendOrder}
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
        tables={tables}
        areas={areas}
        zone={zone}
        setZone={setZone}
        onPick={pickTable}
        totals={totals}
        statuses={statuses}
        waiter={session.name || 'Staff'}
      />
    );
  }

  const showNav = (tab === 'kitchen') || (tab === 'floor' && screen === 'floor');

  // Count of 'pending' orders to show as a badge on the Kitchen tab
  // — same urgency signal the prototype shows. Limited to dine-in,
  // non-cancelled orders.
  const newTickets = allOrdersList.filter(o =>
    o.status === 'pending'
    && o.status !== 'cancelled'
    && o.orderType !== 'takeaway'
    && o.orderType !== 'takeout'
  ).length;

  return (
    <>
      <Head>
        <title>Waiter · Order &amp; Kitchen — HaloHelm</title>
      </Head>
      <div className="sv2">
        <div className="frame">
          <div className="screenwrap">
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
                item={sheet.item}
                table={activeTable}
                selectedSeat={selectedSeat}
                editLine={sheet.editLine}
                onClose={() => setSheet(null)}
                onCommit={commitSheet}
              />
            )}
          </div>
        </div>
      </div>
    </>
  );
}

// Item.spiceLevel can be a string ('Medium') or a number — normalize.
function spiceIntFromItem(item) {
  const v = item?.spiceLevel;
  if (typeof v === 'number') return Math.max(0, Math.min(4, Math.round(v)));
  const s = String(v || '').toLowerCase().replace(/\s/g, '');
  if (s.startsWith('veryspicy')) return 4;
  if (s.startsWith('spicy')) return 3;
  if (s.startsWith('medium')) return 2;
  if (s.startsWith('mild')) return 1;
  return 0;
}

StaffV2.getLayout = (page) => page;
