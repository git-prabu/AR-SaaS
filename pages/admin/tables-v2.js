// pages/admin/tables-v2.js
//
// ★ REDESIGN EXEMPLAR (2026-06-29) ★
// A duplicate of /admin/tables, re-laid-out in the Orders/Kitchen-Station
// "ok-root" design language (dark matte surfaces, gold + saffron accents,
// Poppins/Inter/JetBrains type, the .pos desktop shell with a left nav rail
// + stat strip + activity rail). Built so Prabu can open this side-by-side
// with the original /admin/tables and decide which look ships to production.
//
// IMPORTANT: every bit of *logic* below (Firestore subscriptions, the live
// status derivation, KOT/Bill/settle/free handlers, areas + tables CRUD,
// quick-import) is copied verbatim from pages/admin/tables.js so the two
// pages behave identically — ONLY the render layer is new. The original
// /admin/tables is left completely untouched.
import Head from 'next/head';
import Link from 'next/link';
import { useEffect, useState, useMemo } from 'react';
import { useRouter } from 'next/router';
import { useFeatureAccess } from '../../hooks/useFeatureAccess';
import OkSidebar from '../../components/admin/OkSidebar';
import AdminBanners from '../../components/admin/AdminBanners';
import ConfirmModal from '../../components/ConfirmModal';
import { collection, onSnapshot, query, orderBy, where, limit } from 'firebase/firestore';
import {
  createArea, updateArea, deleteArea,
  createTable, updateTable, deleteTable,
  markKotPrinted, markBillPrinted, ensureBillNumber, getRestaurantById,
  getOrCreateCaptainBill, attachOrderToBill, markOrderPaidAs,
  linkOrderToBill, freeTableSession, updateOrderStatus,
} from '../../lib/db';
import { printKot, printBill } from '../../lib/printKot';
import NewOrderModal from '../../components/NewOrderModal';
import toast from 'react-hot-toast';

// ─── Live table-status: keys + labels drive the logic (kept identical to
//     tables.js). The on-screen colours are mapped separately (SVIS) to the
//     dark theme's status tokens so they read on the matte surface. ───
const PAID_SET = new Set(['paid_cash', 'paid_card', 'paid_online', 'paid']);
const STATUS = {
  blank:   { key: 'blank',   label: 'Free' },
  running: { key: 'running', label: 'Running' },
  kot:     { key: 'kot',     label: 'Running KOT' },
  printed: { key: 'printed', label: 'Printed' },
  paid:    { key: 'paid',    label: 'Paid' },
  seated:  { key: 'seated',  label: 'Seated' },
};
// Dark-theme visual mapping (colour per status key).
const SVIS = {
  blank:   'var(--st-free)',
  seated:  '#9B8CF0',
  running: 'var(--st-sent)',
  kot:     'var(--gold)',
  printed: 'var(--st-served)',
  paid:    'var(--st-paid)',
};

// ─── New-theme inline style helpers ───
const okInput = {
  padding: '9px 12px', borderRadius: 10, border: '1px solid var(--line)',
  background: 'var(--card-2)', color: 'var(--tx)', fontSize: 13,
  fontFamily: 'var(--font-body)', outline: 'none', boxSizing: 'border-box',
};
const okBtn = {
  display: 'inline-flex', alignItems: 'center', gap: 7, padding: '9px 16px',
  borderRadius: 10, border: 'none', cursor: 'pointer', background: 'var(--accent)',
  color: 'var(--accent-ink)', fontFamily: 'var(--font-display)', fontSize: 13, fontWeight: 700,
};
const okGhost = {
  display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 14px',
  borderRadius: 10, cursor: 'pointer', background: 'var(--card)',
  border: '1px solid var(--line)', color: 'var(--tx)',
  fontFamily: 'var(--font-display)', fontSize: 12.5, fontWeight: 600,
};

function fmtClock(d) {
  const h = d.getHours() % 12 || 12;
  const m = String(d.getMinutes()).padStart(2, '0');
  const ampm = d.getHours() < 12 ? 'AM' : 'PM';
  return `${h}:${m} ${ampm}`;
}

// ─── Rail icons (24px stroke, currentColor) ───
const I = {
  orders: (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M8 3h8l1 4H7l1-4Z"/><path d="M7 7v12a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1V7"/><path d="M10 11h4M10 15h4"/></svg>),
  chef:   (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M7 14a4 4 0 1 1 1-7.9 4 4 0 0 1 8 0A4 4 0 1 1 17 14"/><path d="M7 14v5a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1v-5"/></svg>),
  grid:   (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></svg>),
  menu:   (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M6 3v8a2 2 0 0 0 2 2h0V3M8 3v18"/><path d="M16 3c-1.5 1-2 3-2 5s.5 4 2 5v8"/></svg>),
  staff:  (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><circle cx="9" cy="8" r="3"/><path d="M3 20a6 6 0 0 1 12 0"/><path d="M16 5.5a3 3 0 0 1 0 5M18 20a6 6 0 0 0-3-5.2"/></svg>),
  chart:  (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/></svg>),
  close:  (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 6l12 12M18 6L6 18"/></svg>),
  clock:  (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>),
};

export default function AdminTablesV2() {
  // RBAC: owner OR a staff member whose role grants 'tables'. Staff get the
  // LIVE floor grid + live ops (seat/bill/pay/clear) via staffDb. Floor-plan
  // editing (Manage mode: tables/areas CRUD) stays owner-only (gated below).
  const { ready, isAdmin, rid, scopedDb, canView, userData, staffSession } = useFeatureAccess('tables');
  const router = useRouter();

  const [areas, setAreas] = useState([]);
  const [tables, setTables] = useState([]);
  const [sessions, setSessions] = useState({});   // tableSessions keyed by code (doc id)
  const [bills, setBills] = useState({});          // open tableBills keyed by billId
  const [ordersById, setOrdersById] = useState({}); // recent orders keyed by orderId
  const [dataLoaded, setDataLoaded] = useState(false);
  const [confirm, setConfirm] = useState(null);
  const [importCount, setImportCount] = useState('');
  const [importing, setImporting] = useState(false);
  // 'live' = colour-coded status grid (default daily-use view).
  // 'manage' = floor-plan editor (areas + tables CRUD). Derived from the route
  // so Manage Layout is its own page (/admin/manage-layout-v2) rather than an
  // in-page toggle; this same component serves both routes.
  const mode = (router.pathname === '/admin/manage-layout-v2' && isAdmin) ? 'manage' : 'live';
  const [detailTable, setDetailTable] = useState(null); // table whose bill is open in the side panel
  const [orderModalTable, setOrderModalTable] = useState(null); // { code, label } → captain order modal open

  // Lightweight live clock for the workspace header (matches Orders page).
  const [clockNow, setClockNow] = useState(() => new Date());
  useEffect(() => { const id = setInterval(() => setClockNow(new Date()), 30000); return () => clearInterval(id); }, []);

  const sessionCodes = useMemo(() => Object.keys(sessions), [sessions]);
  const [restaurant, setRestaurant] = useState(null);
  const restaurantName = restaurant?.name || '';
  const [payBusy, setPayBusy] = useState(false);
  useEffect(() => { if (rid && canView) getRestaurantById(rid, { db: scopedDb }).then(r => setRestaurant(r || null)).catch(() => {}); }, [rid, canView, scopedDb]); // eslint-disable-line react-hooks/exhaustive-deps

  // Print a combined KOT for everything currently on a table's bill,
  // then stamp the bill so the grid flips to gold "Running KOT".
  const handlePrintKot = (table, state) => {
    const orders = state?.orders || [];
    if (orders.length === 0) { toast.error('Nothing to print on this table'); return; }
    const merged = {
      tableNumber: table.code || table.label,
      orderType: 'dinein',
      items: orders.flatMap(o => Array.isArray(o.items) ? o.items : []),
      orderNumber: null,
      specialInstructions: orders.map(o => o.specialInstructions).filter(Boolean).join(' · ') || null,
    };
    const ok = printKot(merged, { restaurantName });
    if (!ok) { toast.error('Allow pop-ups to print the KOT'); return; }
    if (state.billId) markKotPrinted(rid, state.billId, { db: scopedDb }).catch(() => {});
  };

  // Captain order placed → attach it to the table's bill so it joins the
  // running tab and the Table View shows the full lifecycle.
  const handleCaptainOrderPlaced = async (orderId, tableCode) => {
    try {
      const billId = await getOrCreateCaptainBill(rid, tableCode, { db: scopedDb });
      await attachOrderToBill(rid, billId, orderId, { db: scopedDb });
      await linkOrderToBill(rid, orderId, billId, { db: scopedDb });
    } catch (e) {
      console.warn('captain bill attach failed:', e?.message || e);
    }
    setOrderModalTable(null);
  };

  // Inline-form state
  const [newAreaName, setNewAreaName] = useState('');
  const [addingArea, setAddingArea] = useState(false);
  const [tableForm, setTableForm] = useState(null); // { areaId, label, code, capacity } | null
  const [editingArea, setEditingArea] = useState(null); // { id, name } | null
  const [editingTable, setEditingTable] = useState(null); // { id, label, code, capacity, areaId } | null

  // Live subscriptions to areas + tables.
  useEffect(() => {
    if (!rid || !canView) return;
    let n = 0;
    const done = () => { if (++n >= 2) setDataLoaded(true); };
    const ua = onSnapshot(
      query(collection(scopedDb, 'restaurants', rid, 'areas'), orderBy('sortOrder', 'asc')),
      snap => { setAreas(snap.docs.map(d => ({ id: d.id, ...d.data() }))); done(); },
      () => done()
    );
    const ut = onSnapshot(
      query(collection(scopedDb, 'restaurants', rid, 'tables'), orderBy('sortOrder', 'asc')),
      snap => { setTables(snap.docs.map(d => ({ id: d.id, ...d.data() }))); done(); },
      () => done()
    );
    const us = onSnapshot(
      collection(scopedDb, 'restaurants', rid, 'tableSessions'),
      snap => {
        const m = {};
        snap.docs.forEach(d => { m[d.id] = { id: d.id, ...d.data() }; });
        setSessions(m);
      },
      () => {}
    );
    const ub = onSnapshot(
      query(collection(scopedDb, 'restaurants', rid, 'tableBills'), where('status', '==', 'open')),
      snap => {
        const m = {};
        snap.docs.forEach(d => { m[d.id] = { id: d.id, ...d.data() }; });
        setBills(m);
      },
      () => {}
    );
    const uo = onSnapshot(
      query(collection(scopedDb, 'restaurants', rid, 'orders'), orderBy('createdAt', 'desc'), limit(300)),
      snap => {
        const m = {};
        snap.docs.forEach(d => { m[d.id] = { id: d.id, ...d.data() }; });
        setOrdersById(m);
      },
      () => {}
    );
    return () => { ua(); ut(); us(); ub(); uo(); };
  }, [rid, canView, scopedDb]);

  // Default the import count to however many QR table-sessions already exist.
  useEffect(() => {
    if (importCount === '' && sessionCodes.length > 0) setImportCount(String(sessionCodes.length));
  }, [sessionCodes, importCount]);

  // ── Quick-add / import existing tables ─────────────
  const handleImport = async (countRaw) => {
    const n = Math.max(1, Math.min(100, Math.floor(Number(countRaw) || 0)));
    if (!n) { toast.error('Enter how many tables (1–100)'); return; }
    setImporting(true);
    try {
      let mainAreaId = areas.find(a => (a.name || '').toLowerCase() === 'main')?.id;
      if (!mainAreaId) {
        const ref = await createArea(rid, { name: 'Main', sortOrder: 0 });
        mainAreaId = ref.id;
      }
      const existing = new Set(tables.map(t => (t.code || '').toLowerCase()));
      let created = 0;
      for (let i = 1; i <= n; i++) {
        const code = String(i);
        if (existing.has(code)) continue;
        await createTable(rid, { label: `Table ${i}`, code, areaId: mainAreaId, capacity: 4, sortOrder: i });
        created += 1;
      }
      toast.success(created ? `Added ${created} table${created === 1 ? '' : 's'} to "Main"` : 'All those tables already exist');
    } catch (e) {
      toast.error('Import failed: ' + (e?.message || 'error'));
    } finally {
      setImporting(false);
    }
  };

  // Print the customer bill + stamp billPrintedAt so the table flips to "Printed".
  const handlePrintBill = async (table, state) => {
    const orders = state?.orders || [];
    if (orders.length === 0) { toast.error('Nothing to bill on this table'); return; }
    const billNumber = ensureBillNumber(rid, state?.billId, { db: scopedDb });
    const ok = await printBill(orders, {
      restaurant,
      tableLabel: table.code || table.label,
      cashier: staffSession?.name || 'Owner',
      billNumber,
    });
    if (!ok) { toast.error('Allow pop-ups to print the bill'); return; }
    if (state.billId) markBillPrinted(rid, state.billId, { db: scopedDb }).catch(() => {});
  };

  // Release a table back to Blank.
  const releaseTable = async (table, orders, billId) => {
    await Promise.all((orders || []).map(o =>
      o.status === 'served' ? null : updateOrderStatus(rid, o.id, 'served', { db: scopedDb }).catch(() => {})
    ));
    await freeTableSession(rid, table.code, billId, { db: scopedDb });
  };

  // Settle the table: mark every unpaid order paid_<method>, then release.
  const handleMarkPaid = async (table, state, method) => {
    const orders = state?.orders || [];
    if (orders.length === 0) { toast.error('Nothing to settle on this table'); return; }
    const PAID = new Set(['paid_cash', 'paid_card', 'paid_online', 'paid']);
    const unpaid = orders.filter(o => !PAID.has(o.paymentStatus));
    setPayBusy(true);
    try {
      if (unpaid.length > 0) {
        const status = `paid_${method}`;
        for (const o of unpaid) await markOrderPaidAs(scopedDb, rid, o.id, status);
      }
      await releaseTable(table, orders, state.billId);
      toast.success(`${table.label} settled${unpaid.length ? ` (${method})` : ''}`);
      setDetailTable(null);
    } catch (e) {
      toast.error('Could not settle: ' + (e?.message || 'error'));
    } finally { setPayBusy(false); }
  };

  // Free an already-settled table without taking another payment.
  const handleFreeTable = async (table, state) => {
    setPayBusy(true);
    try {
      await releaseTable(table, state?.orders || [], state?.billId);
      toast.success(`${table.label} cleared`);
      setDetailTable(null);
    } catch (e) {
      toast.error('Could not clear: ' + (e?.message || 'error'));
    } finally { setPayBusy(false); }
  };

  const tablesByArea = useMemo(() => {
    const map = {};
    for (const t of tables) {
      const k = t.areaId || '_unassigned';
      (map[k] = map[k] || []).push(t);
    }
    return map;
  }, [tables]);

  // Derive each table's live status (union of bill orders + bill-less
  // tableNumber-matched dine-in orders). Identical to tables.js.
  const allOrdersList = useMemo(() => Object.values(ordersById), [ordersById]);
  const statesByTable = useMemo(() => {
    const out = {};
    for (const t of tables) {
      const session = sessions[t.code];
      const billId = session?.currentBillId;
      const bill = billId ? bills[billId] : null;
      const code = String(t.code || '');

      const fromBill = bill ? (bill.orderIds || []).map(id => ordersById[id]).filter(Boolean) : [];
      const fromTable = code ? allOrdersList.filter(o => {
        if (String(o.tableNumber || '') !== code) return false;
        if (o.orderType === 'takeaway' || o.orderType === 'takeout') return false;
        if (o.status === 'cancelled') return false;
        const done = o.status === 'served' && PAID_SET.has(o.paymentStatus);
        return !done;
      }) : [];

      const map = {};
      for (const o of [...fromBill, ...fromTable]) {
        if (o && o.status !== 'cancelled') map[o.id] = o;
      }
      const liveOrders = Object.values(map);

      if (liveOrders.length === 0) {
        if (session?.seatedAt) {
          out[t.id] = { status: STATUS.seated, billId: billId || null, orderCount: 0, itemCount: 0, total: 0, orders: [],
            seatedName: session.seatedName || '', seatedPartySize: session.seatedPartySize || 0 };
        } else {
          out[t.id] = { status: STATUS.blank, billId: billId || null, orderCount: 0, itemCount: 0, total: 0 };
        }
        continue;
      }

      const total     = liveOrders.reduce((s, o) => s + (Number(o.total) || 0), 0);
      const itemCount = liveOrders.reduce((s, o) => s + (Array.isArray(o.items) ? o.items.length : 0), 0);
      const allPaid   = liveOrders.every(o => PAID_SET.has(o.paymentStatus));

      let status;
      if (allPaid)                 status = STATUS.paid;
      else if (bill?.billPrintedAt) status = STATUS.printed;
      else if (bill?.kotPrintedAt)  status = STATUS.kot;
      else                         status = STATUS.running;

      out[t.id] = { status, billId: billId || null, orderCount: liveOrders.length, itemCount, total, orders: liveOrders };
    }
    return out;
  }, [tables, sessions, bills, ordersById, allOrdersList]);

  const statusCounts = useMemo(() => {
    const c = { running: 0, kot: 0, printed: 0, paid: 0, seated: 0, blank: 0 };
    Object.values(statesByTable).forEach(s => { c[s.status.key] = (c[s.status.key] || 0) + 1; });
    return c;
  }, [statesByTable]);

  // Header stat-strip summary: occupied tables + open revenue across all tables.
  const liveSummary = useMemo(() => {
    let occupied = 0, revenue = 0;
    Object.values(statesByTable).forEach(s => {
      if (s.status.key !== 'blank') occupied += 1;
      revenue += Number(s.total) || 0;
    });
    return { occupied, revenue };
  }, [statesByTable]);

  // Running tables — every occupied table: seated PLUS the ones with an active
  // order (running / KOT / bill printed / paid). Only truly-free ("blank")
  // tables are hidden, so "Running now" shows seated tables too and matches the
  // Floor's service queue (which also lists seated).
  const runningTables = useMemo(() => {
    const idle = new Set(['blank']);
    return tables
      .filter(t => !idle.has(statesByTable[t.id]?.status.key || 'blank'))
      .sort((a, b) => (statesByTable[b.id]?.total || 0) - (statesByTable[a.id]?.total || 0));
  }, [tables, statesByTable]);

  // ── Area handlers ───────────────────────────────────────────
  const handleAddArea = async () => {
    const name = newAreaName.trim();
    if (!name) { toast.error('Enter an area name'); return; }
    try {
      await createArea(rid, { name, sortOrder: areas.length });
      setNewAreaName(''); setAddingArea(false);
      toast.success(`Area "${name}" added`);
    } catch (e) { toast.error('Could not add area: ' + (e?.message || 'error')); }
  };

  const handleRenameArea = async () => {
    const name = (editingArea?.name || '').trim();
    if (!name) { toast.error('Enter an area name'); return; }
    try {
      await updateArea(rid, editingArea.id, { name });
      setEditingArea(null);
      toast.success('Area renamed');
    } catch (e) { toast.error('Could not rename: ' + (e?.message || 'error')); }
  };

  const requestDeleteArea = (area) => {
    const count = (tablesByArea[area.id] || []).length;
    setConfirm({
      title: `Delete "${area.name}"?`,
      body: count > 0
        ? `This area has ${count} table${count === 1 ? '' : 's'}. They'll become unassigned (not deleted). You can move them to another area afterwards.`
        : 'This area has no tables. It will be removed.',
      confirmLabel: 'Delete area',
      destructive: true,
      onConfirm: async () => {
        const inArea = tablesByArea[area.id] || [];
        await Promise.all(inArea.map(t => updateTable(rid, t.id, { areaId: null })));
        await deleteArea(rid, area.id);
        toast.success('Area deleted');
      },
    });
  };

  // ── Table handlers ──────────────────────────────────────────
  const handleSaveTable = async () => {
    const f = tableForm;
    const label = (f.label || '').trim();
    const code = (f.code || '').trim();
    if (!label) { toast.error('Enter a table name'); return; }
    if (!code)  { toast.error('Enter a QR code/number'); return; }
    if (!/^[A-Za-z0-9_-]{1,12}$/.test(code)) {
      toast.error('Code: letters/digits/-/_ only, max 12 chars');
      return;
    }
    if (tables.some(t => (t.code || '').toLowerCase() === code.toLowerCase())) {
      toast.error(`Code "${code}" is already used by another table`);
      return;
    }
    try {
      const areaTables = tablesByArea[f.areaId] || [];
      await createTable(rid, {
        label, code, areaId: f.areaId || null,
        capacity: Number(f.capacity) || 4,
        sortOrder: areaTables.length,
      });
      setTableForm(null);
      toast.success(`Table "${label}" added`);
    } catch (e) { toast.error('Could not add table: ' + (e?.message || 'error')); }
  };

  const handleUpdateTable = async () => {
    const f = editingTable;
    const label = (f.label || '').trim();
    const code = (f.code || '').trim();
    if (!label) { toast.error('Enter a table name'); return; }
    if (!/^[A-Za-z0-9_-]{1,12}$/.test(code)) { toast.error('Code: letters/digits/-/_ only, max 12'); return; }
    if (tables.some(t => t.id !== f.id && (t.code || '').toLowerCase() === code.toLowerCase())) {
      toast.error(`Code "${code}" is already used`); return;
    }
    try {
      await updateTable(rid, f.id, { label, code, capacity: Number(f.capacity) || 4 });
      setEditingTable(null);
      toast.success('Table updated');
    } catch (e) { toast.error('Could not update: ' + (e?.message || 'error')); }
  };

  const requestDeleteTable = (t) => {
    setConfirm({
      title: `Delete "${t.label}"?`,
      body: 'The table is removed from the floor plan. Its QR code/number stops resolving. Any past orders stay in your records.',
      confirmLabel: 'Delete table',
      destructive: true,
      onConfirm: async () => { await deleteTable(rid, t.id); toast.success('Table deleted'); },
    });
  };

  const totalTables = tables.length;
  const greeting = (() => {
    const h = clockNow.getHours();
    return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
  })();

  // ── Loading / no-access gates (replace FeatureShell's neutral screens) ──
  if (!ready) {
    return (
      <div className="ok-root" style={{ minHeight: '100vh', display: 'grid', placeItems: 'center' }}>
        <Head><title>Tables — HaloHelm</title></Head>
        <div style={{ color: 'var(--tx-3)', fontFamily: 'var(--font-body)', fontSize: 14 }}>Loading…</div>
      </div>
    );
  }
  if (!canView) {
    return (
      <div className="ok-root" style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 24 }}>
        <Head><title>Tables — HaloHelm</title></Head>
        <div style={{ textAlign: 'center', maxWidth: 360 }}>
          <div style={{ fontSize: 44, marginBottom: 12 }}>🔒</div>
          <div style={{ color: 'var(--tx)', fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 18, marginBottom: 6 }}>No access</div>
          <div style={{ color: 'var(--tx-3)', fontFamily: 'var(--font-body)', fontSize: 13.5, lineHeight: 1.6 }}>
            Your role doesn’t include the Tables station. Ask the owner to grant it.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="ok-root">
      <Head><title>Tables — HaloHelm</title></Head>
      <div className="okv-shell">
        {/* ── Left nav rail (shared full sidebar) ── */}
        <OkSidebar brand={restaurantName} />

        {/* ── Workspace ── */}
        <main className="workspace">
          <AdminBanners />
          <div className="ws-head">
            <div className="ws-title">
              <div className="ws-eyebrow">{mode === 'manage' ? 'Setup · Floor layout' : `${greeting} · ${restaurantName || 'HaloHelm'}`}</div>
              <h1 className="ws-h1">{mode === 'manage' ? 'Manage Layout' : 'Tables'}</h1>
            </div>
            <div className="ws-clock" style={{ marginLeft: 'auto' }}>{I.clock}{fmtClock(clockNow)}</div>
          </div>

          {/* ═══ LIVE MODE ═══ */}
          {mode === 'live' && (
            <div className="floor-layout">
              <div className="floor-main">
                {/* Toolbar: status legend with live counts */}
                <div className="floor-toolbar">
                  <div className="legend" style={{ marginLeft: 0 }}>
                    {Object.values(STATUS).map(s => (
                      <span key={s.key} className="l">
                        <span className="swatch" style={{ background: SVIS[s.key] }} />
                        {s.label}
                        {statusCounts[s.key] > 0 && <b style={{ color: 'var(--tx)', marginLeft: 2 }}>{statusCounts[s.key]}</b>}
                      </span>
                    ))}
                  </div>
                </div>

                {/* Stat strip */}
                <div className="statstrip">
                  <div className="statcard">
                    <div className="sc-k"><i style={{ background: 'var(--st-sent)' }} />OCCUPIED</div>
                    <div className="sc-v">{liveSummary.occupied}<small>/ {totalTables}</small></div>
                  </div>
                  <div className="statcard">
                    <div className="sc-k"><i style={{ background: 'var(--gold)' }} />RUNNING KOT</div>
                    <div className="sc-v">{statusCounts.kot}</div>
                  </div>
                  <div className="statcard">
                    <div className="sc-k"><i style={{ background: 'var(--st-served)' }} />BILL PRINTED</div>
                    <div className="sc-v">{statusCounts.printed}</div>
                  </div>
                  <div className="statcard">
                    <div className="sc-k"><i style={{ background: 'var(--accent)' }} />OPEN REVENUE</div>
                    <div className="sc-v">₹{Math.round(liveSummary.revenue).toLocaleString('en-IN')}</div>
                  </div>
                </div>

                <div className="floor-scroll">
                  {dataLoaded && totalTables === 0 && (
                    <div style={{ textAlign: 'center', color: 'var(--tx-3)', fontFamily: 'var(--font-body)', fontSize: 14, padding: '60px 16px', lineHeight: 1.7 }}>
                      No tables yet.<br />Switch to <b style={{ color: 'var(--tx-2)' }}>Manage Layout</b> to add areas and tables.
                    </div>
                  )}

                  {areas.map(area => {
                    const at = tablesByArea[area.id] || [];
                    if (at.length === 0) return null;
                    return (
                      <div key={area.id} style={{ marginBottom: 26 }}>
                        <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 15, fontWeight: 700, margin: '0 0 12px', color: 'var(--tx)', letterSpacing: '-0.01em' }}>{area.name}</h2>
                        <div className="floor-grid">
                          {at.map(t => {
                            const st = statesByTable[t.id] || { status: STATUS.blank, total: 0, itemCount: 0 };
                            const s = st.status;
                            const busy = s.key !== 'blank';
                            const c = SVIS[s.key];
                            const cap = Math.max(2, Math.min(12, Number(t.capacity) || 4));
                            return (
                              <button
                                key={t.id}
                                className={`tabletok ${busy ? '' : 'status-free'}`}
                                onClick={() => busy ? setDetailTable(t) : setOrderModalTable({ code: t.code, label: t.label })}
                                style={busy ? { borderColor: c, boxShadow: `0 0 0 1px ${c}55, 0 10px 24px ${c}1f` } : undefined}
                              >
                                <span className="tdot" style={{ background: c, boxShadow: busy ? `0 0 7px ${c}` : 'none' }} />
                                <span style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 16, color: 'var(--tx)', lineHeight: 1.1, textAlign: 'center' }}>{t.label}</span>
                                {busy && s.key === 'seated' ? (
                                  <span style={{ fontFamily: 'var(--font-body)', fontSize: 12, fontWeight: 600, color: 'var(--tx)', marginTop: 1 }}>
                                    {st.seatedName || 'Guest'}{st.seatedPartySize ? <span style={{ color: 'var(--tx-3)', fontWeight: 500 }}> · {st.seatedPartySize} pax</span> : null}
                                  </span>
                                ) : (
                                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '.08em', color: 'var(--tx-3)', textTransform: 'uppercase' }}>{cap} seats</span>
                                )}
                                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9.5, letterSpacing: '.05em', textTransform: 'uppercase', color: c, fontWeight: 700, marginTop: 1 }}>
                                  {busy ? s.label : 'Tap to order'}
                                </span>
                                {busy && st.total > 0 && (
                                  <span style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 13, color: 'var(--accent)', marginTop: 1 }}>
                                    ₹{Math.round(st.total)}{st.itemCount ? <span style={{ color: 'var(--tx-3)', fontWeight: 500, fontSize: 10 }}> · {st.itemCount}</span> : null}
                                  </span>
                                )}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}

                  {(tablesByArea._unassigned || []).length > 0 && (
                    <div style={{ marginBottom: 26 }}>
                      <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 15, fontWeight: 700, margin: '0 0 12px', color: 'var(--danger)' }}>Unassigned</h2>
                      <div className="floor-grid">
                        {tablesByArea._unassigned.map(t => {
                          const st = statesByTable[t.id] || { status: STATUS.blank };
                          const s = st.status;
                          const busy = s.key !== 'blank';
                          const c = SVIS[s.key];
                          return (
                            <button key={t.id} className={`tabletok ${busy ? '' : 'status-free'}`}
                              onClick={() => busy ? setDetailTable(t) : setOrderModalTable({ code: t.code, label: t.label })}
                              style={busy ? { borderColor: c, boxShadow: `0 0 0 1px ${c}55` } : undefined}>
                              <span className="tdot" style={{ background: c }} />
                              <span style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 16, color: 'var(--tx)' }}>{t.label}</span>
                              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9.5, letterSpacing: '.05em', textTransform: 'uppercase', color: c, fontWeight: 700 }}>{s.label}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Activity rail — running tables right now */}
              <aside className="activity">
                <div className="activity-head">
                  <h3>Running now</h3>
                  <span className="a-live"><i />LIVE</span>
                </div>
                <div className="activity-list">
                  {runningTables.length === 0 ? (
                    <div className="act-empty">All tables free.<br />Busy tables will land here.</div>
                  ) : (
                    runningTables.map(t => {
                      const st = statesByTable[t.id];
                      const s = st.status;
                      const c = SVIS[s.key];
                      return (
                        <button key={t.id} className="act-card" onClick={() => setDetailTable(t)}>
                          <div className="ac-top">
                            <div className="ac-table" style={{ color: c }}>{String(t.label).replace(/[^0-9A-Za-z]/g, '').slice(-3) || 'T'}</div>
                            <div className="ac-meta">
                              <div className="ac-zone">{t.label}</div>
                              <div className="ac-sub">
                                {s.key === 'seated'
                                  ? `${st.seatedName || 'Seated'}${st.seatedPartySize ? ` · ${st.seatedPartySize} pax` : ''}`
                                  : `${st.itemCount} item${st.itemCount === 1 ? '' : 's'} · ₹${Math.round(st.total).toLocaleString('en-IN')}`}
                              </div>
                            </div>
                            <span className="ac-badge" style={{ background: `${c}22`, color: c }}>{s.label}</span>
                          </div>
                        </button>
                      );
                    })
                  )}
                </div>
              </aside>
            </div>
          )}

          {/* ═══ MANAGE MODE — floor-plan editor (owner-only) ═══ */}
          {mode === 'manage' && isAdmin && (
            <div className="floor-scroll" style={{ paddingTop: 8 }}>
              {/* Add area control */}
              {!addingArea ? (
                <button style={{ ...okBtn, marginBottom: 22 }} onClick={() => setAddingArea(true)}>
                  <span style={{ fontSize: 16, lineHeight: 1 }}>+</span> Add area
                </button>
              ) : (
                <div style={{ display: 'flex', gap: 8, marginBottom: 22, alignItems: 'center', flexWrap: 'wrap' }}>
                  <input autoFocus style={{ ...okInput, width: 240 }} placeholder="Area name (e.g. Rooftop, A/C, Bar)"
                    value={newAreaName} onChange={e => setNewAreaName(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleAddArea()} />
                  <button style={okBtn} onClick={handleAddArea}>Add</button>
                  <button style={okGhost} onClick={() => { setAddingArea(false); setNewAreaName(''); }}>Cancel</button>
                </div>
              )}

              {/* Empty state + quick import */}
              {dataLoaded && areas.length === 0 && (tablesByArea._unassigned || []).length === 0 && (
                <div style={{ maxWidth: 460, margin: '8px auto 0', padding: '20px 22px', background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 16, textAlign: 'center' }}>
                  <div style={{ fontSize: 15, fontWeight: 700, fontFamily: 'var(--font-display)', color: 'var(--tx)', marginBottom: 5 }}>Quick start</div>
                  <div style={{ fontSize: 13, color: 'var(--tx-2)', marginBottom: 14, lineHeight: 1.55, fontFamily: 'var(--font-body)' }}>
                    {sessionCodes.length > 0
                      ? `You have ${sessionCodes.length} table${sessionCodes.length === 1 ? '' : 's'} set up from your QR codes. Import them into a “Main” area:`
                      : 'Create a batch of numbered tables in a “Main” area — rename, move, or split them into areas afterwards:'}
                  </div>
                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                    <input type="number" min="1" max="100" style={{ ...okInput, width: 90, textAlign: 'center' }}
                      placeholder="12" value={importCount} onChange={e => setImportCount(e.target.value)} />
                    <button style={{ ...okBtn, opacity: importing ? 0.6 : 1 }} disabled={importing}
                      onClick={() => handleImport(importCount || 12)}>
                      {importing ? 'Adding…' : `Create ${Math.max(1, Math.min(100, Math.floor(Number(importCount) || 12)))} tables`}
                    </button>
                  </div>
                </div>
              )}

              {/* Areas + their tables */}
              {areas.map(area => {
                const at = tablesByArea[area.id] || [];
                return (
                  <div key={area.id} style={{ marginBottom: 26 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
                      {editingArea?.id === area.id ? (
                        <>
                          <input autoFocus style={{ ...okInput, width: 200 }} value={editingArea.name}
                            onChange={e => setEditingArea({ ...editingArea, name: e.target.value })}
                            onKeyDown={e => e.key === 'Enter' && handleRenameArea()} />
                          <button style={okBtn} onClick={handleRenameArea}>Save</button>
                          <button style={okGhost} onClick={() => setEditingArea(null)}>Cancel</button>
                        </>
                      ) : (
                        <>
                          <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 16, fontWeight: 700, margin: 0, color: 'var(--tx)' }}>{area.name}</h2>
                          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--tx-3)' }}>{at.length} table{at.length === 1 ? '' : 's'}</span>
                          <button style={{ ...okGhost, padding: '4px 11px', fontSize: 11 }} onClick={() => setEditingArea({ id: area.id, name: area.name })}>Rename</button>
                          <button style={{ ...okGhost, padding: '4px 11px', fontSize: 11, color: 'var(--danger)', borderColor: 'rgba(217,83,79,0.30)' }} onClick={() => requestDeleteArea(area)}>Delete</button>
                        </>
                      )}
                    </div>

                    <div className="floor-grid">
                      {at.map(t => (
                        <div key={t.id} style={{ background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 14, padding: 14 }}>
                          {editingTable?.id === t.id ? (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                              <input style={okInput} placeholder="Name" value={editingTable.label} onChange={e => setEditingTable({ ...editingTable, label: e.target.value })} />
                              <input style={okInput} placeholder="Code" value={editingTable.code} onChange={e => setEditingTable({ ...editingTable, code: e.target.value })} />
                              <input style={okInput} type="number" min="1" placeholder="Seats" value={editingTable.capacity} onChange={e => setEditingTable({ ...editingTable, capacity: e.target.value })} />
                              <div style={{ display: 'flex', gap: 6 }}>
                                <button style={{ ...okBtn, flex: 1, justifyContent: 'center' }} onClick={handleUpdateTable}>Save</button>
                                <button style={okGhost} onClick={() => setEditingTable(null)}>✕</button>
                              </div>
                            </div>
                          ) : (
                            <>
                              <div style={{ fontFamily: 'var(--font-display)', fontSize: 15, fontWeight: 700, color: 'var(--tx)' }}>{t.label}</div>
                              <div style={{ fontSize: 12, color: 'var(--tx-2)', marginTop: 5, display: 'flex', alignItems: 'center', gap: 8 }}>
                                <span style={{ fontFamily: 'var(--font-mono)', background: 'var(--card-3)', padding: '2px 7px', borderRadius: 5, color: 'var(--tx-2)' }}>{t.code}</span>
                                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--tx-3)' }}>{t.capacity || 4} seats</span>
                              </div>
                              <div style={{ display: 'flex', gap: 6, marginTop: 11 }}>
                                <button style={{ ...okGhost, padding: '4px 11px', fontSize: 11 }} onClick={() => setEditingTable({ id: t.id, label: t.label, code: t.code, capacity: t.capacity || 4, areaId: t.areaId })}>Edit</button>
                                <button style={{ ...okGhost, padding: '4px 11px', fontSize: 11, color: 'var(--danger)', borderColor: 'rgba(217,83,79,0.30)' }} onClick={() => requestDeleteTable(t)}>Delete</button>
                              </div>
                            </>
                          )}
                        </div>
                      ))}

                      {/* Add-table tile */}
                      {tableForm?.areaId === area.id ? (
                        <div style={{ background: 'var(--card-2)', border: '1px solid var(--line)', borderRadius: 14, padding: 14, display: 'flex', flexDirection: 'column', gap: 7 }}>
                          <input autoFocus style={okInput} placeholder="Name (e.g. Table 1)" value={tableForm.label} onChange={e => setTableForm({ ...tableForm, label: e.target.value })} />
                          <input style={okInput} placeholder="Code (e.g. 1, A1)" value={tableForm.code} onChange={e => setTableForm({ ...tableForm, code: e.target.value })} />
                          <input style={okInput} type="number" min="1" placeholder="Seats" value={tableForm.capacity} onChange={e => setTableForm({ ...tableForm, capacity: e.target.value })} />
                          <div style={{ display: 'flex', gap: 6 }}>
                            <button style={{ ...okBtn, flex: 1, justifyContent: 'center' }} onClick={handleSaveTable}>Add</button>
                            <button style={okGhost} onClick={() => setTableForm(null)}>✕</button>
                          </div>
                        </div>
                      ) : (
                        <button
                          onClick={() => setTableForm({ areaId: area.id, label: '', code: '', capacity: 4 })}
                          style={{ background: 'transparent', border: '1.5px dashed var(--line)', borderRadius: 14, padding: 14, cursor: 'pointer', color: 'var(--tx-2)', fontFamily: 'var(--font-display)', fontSize: 13, fontWeight: 600, minHeight: 96, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                          <span style={{ fontSize: 16 }}>+</span> Add table
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}

              {/* Unassigned tables */}
              {(tablesByArea._unassigned || []).length > 0 && (
                <div style={{ marginBottom: 26 }}>
                  <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 16, fontWeight: 700, margin: '0 0 12px', color: 'var(--danger)' }}>Unassigned</h2>
                  <div className="floor-grid">
                    {tablesByArea._unassigned.map(t => (
                      <div key={t.id} style={{ background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 14, padding: 14 }}>
                        <div style={{ fontFamily: 'var(--font-display)', fontSize: 15, fontWeight: 700, color: 'var(--tx)' }}>{t.label}</div>
                        <div style={{ fontSize: 12, marginTop: 5 }}>
                          <span style={{ fontFamily: 'var(--font-mono)', background: 'var(--card-3)', padding: '2px 7px', borderRadius: 5, color: 'var(--tx-2)' }}>{t.code}</span>
                        </div>
                        {areas.length > 0 && (
                          <select
                            defaultValue=""
                            onChange={async (e) => { if (e.target.value) { await updateTable(rid, t.id, { areaId: e.target.value }); toast.success('Moved'); } }}
                            style={{ ...okInput, marginTop: 10, width: '100%' }}>
                            <option value="" disabled>Move to area…</option>
                            {areas.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                          </select>
                        )}
                        <button style={{ ...okGhost, padding: '4px 11px', fontSize: 11, color: 'var(--danger)', borderColor: 'rgba(217,83,79,0.30)', marginTop: 8 }} onClick={() => requestDeleteTable(t)}>Delete</button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </main>
      </div>

      {/* ── Bill detail side panel (live mode → tap a running table) ── */}
      {detailTable && (() => {
        const st = statesByTable[detailTable.id] || { status: STATUS.blank, orders: [], total: 0 };
        const orders = st.orders || [];
        const c = SVIS[st.status.key];
        return (
          <div onClick={() => setDetailTable(null)}
            style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(0,0,0,0.55)', display: 'flex', justifyContent: 'flex-end' }}>
            <div onClick={e => e.stopPropagation()}
              style={{ width: 'min(420px, 100%)', height: '100%', background: 'var(--surface)', fontFamily: 'var(--font-body)', color: 'var(--tx)', display: 'flex', flexDirection: 'column', borderLeft: '1px solid var(--line)', boxShadow: '-20px 0 60px rgba(0,0,0,0.5)' }}>
              <div style={{ padding: '18px 22px', borderBottom: '1px solid var(--line)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                  <div style={{ fontFamily: 'var(--font-display)', fontSize: 19, fontWeight: 700 }}>{detailTable.label}</div>
                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: 7, marginTop: 5 }}>
                    <span style={{ width: 9, height: 9, borderRadius: '50%', background: c }} />
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 700, color: c, letterSpacing: '.05em', textTransform: 'uppercase' }}>{st.status.label}</span>
                  </div>
                </div>
                <button onClick={() => setDetailTable(null)} style={{ ...okGhost, padding: '7px 9px' }}>{I.close}</button>
              </div>
              <div style={{ flex: 1, overflowY: 'auto', padding: '16px 22px' }}>
                {orders.length === 0 ? (
                  <div style={{ color: 'var(--tx-3)', fontSize: 14, paddingTop: 20, textAlign: 'center', lineHeight: 1.7 }}>
                    {st.status.key === 'seated'
                      ? <>Seated{st.seatedName ? `: ${st.seatedName}` : ''}{st.seatedPartySize ? ` · ${st.seatedPartySize} guest${st.seatedPartySize === 1 ? '' : 's'}` : ''}.<br />Tap “+ Add items” to take their order.</>
                      : 'No live orders on this table.'}
                  </div>
                ) : orders.map((o, oi) => (
                  <div key={o.id} style={{ marginBottom: 16, paddingBottom: 14, borderBottom: oi < orders.length - 1 ? '1px solid var(--line)' : 'none' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--tx-3)', marginBottom: 7, textTransform: 'uppercase', letterSpacing: '.04em' }}>
                      <span>Order {o.orderNumber ? `#${o.orderNumber}` : o.id.slice(-5)}</span>
                      <span>{(o.paymentStatus || 'unpaid').replace('_', ' ')}</span>
                    </div>
                    {(o.items || []).map((it, i) => (
                      <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13.5, padding: '3px 0' }}>
                        <span style={{ color: 'var(--tx)' }}>{it.qty || 1}× {it.name}</span>
                        <span style={{ color: 'var(--tx-3)' }}>₹{(it.price || 0) * (it.qty || 1)}</span>
                      </div>
                    ))}
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13.5, fontWeight: 700, marginTop: 6, color: 'var(--tx)' }}>
                      <span>Order total</span><span>₹{Math.round(o.total || 0)}</span>
                    </div>
                  </div>
                ))}
              </div>
              <div style={{ padding: '16px 22px', borderTop: '1px solid var(--line)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: 'var(--font-display)', fontSize: 17, fontWeight: 700, marginBottom: 12 }}>
                  <span>Table total</span><span style={{ color: 'var(--accent)' }}>₹{Math.round(st.total || 0)}</span>
                </div>
                <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                  <button onClick={() => { const t = detailTable; setDetailTable(null); setOrderModalTable({ code: t.code, label: t.label }); }}
                    style={{ ...okBtn, flex: 1, justifyContent: 'center', padding: '11px 14px' }}>
                    + Add items
                  </button>
                  <button onClick={() => handlePrintKot(detailTable, st)} style={{ ...okGhost, flex: 1, justifyContent: 'center', padding: '11px 14px' }}>🖨 KOT</button>
                  <button onClick={() => handlePrintBill(detailTable, st)} style={{ ...okGhost, flex: 1, justifyContent: 'center', padding: '11px 14px' }}>🧾 Bill</button>
                </div>
                {(st.status.key === 'paid' || st.status.key === 'seated') ? (
                  <button disabled={payBusy} onClick={() => handleFreeTable(detailTable, st)}
                    style={{ width: '100%', boxSizing: 'border-box', justifyContent: 'center', padding: '12px 14px', borderRadius: 10, border: 'none', cursor: payBusy ? 'not-allowed' : 'pointer', fontFamily: 'var(--font-display)', fontSize: 13.5, fontWeight: 700, background: 'var(--accent)', color: 'var(--accent-ink)', opacity: payBusy ? 0.6 : 1 }}>
                    ✓ Free table — clear for next guest
                  </button>
                ) : (
                  <>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 700, color: 'var(--tx-3)', letterSpacing: '0.08em', textTransform: 'uppercase', margin: '8px 0 7px' }}>Settle table</div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      {[['cash', 'Cash'], ['card', 'Card'], ['online', 'UPI']].map(([m, label]) => (
                        <button key={m} disabled={payBusy} onClick={() => handleMarkPaid(detailTable, st, m)}
                          style={{ flex: 1, justifyContent: 'center', padding: '11px 14px', borderRadius: 10, border: 'none', cursor: payBusy ? 'not-allowed' : 'pointer', fontFamily: 'var(--font-display)', fontSize: 13, fontWeight: 700, background: 'var(--success)', color: '#fff', opacity: payBusy ? 0.6 : 1 }}>
                          {label}
                        </button>
                      ))}
                    </div>
                  </>
                )}
                <Link href={isAdmin ? '/admin/orders' : '/staff/orders'} style={{ ...okGhost, width: '100%', justifyContent: 'center', textDecoration: 'none', padding: '10px 14px', boxSizing: 'border-box', marginTop: 8 }}>Open in Orders →</Link>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Captain order modal — tableside ordering from the Table View */}
      {orderModalTable && (
        <NewOrderModal
          rid={rid}
          actorLabel={`captain:${userData?.email || 'admin'}`}
          lockedTable={orderModalTable}
          onClose={() => setOrderModalTable(null)}
          onPlaced={(orderId) => handleCaptainOrderPlaced(orderId, orderModalTable.code)}
        />
      )}

      <ConfirmModal
        open={!!confirm}
        title={confirm?.title}
        body={confirm?.body}
        confirmLabel={confirm?.confirmLabel}
        destructive={confirm?.destructive}
        onCancel={() => setConfirm(null)}
        onConfirm={async () => { await confirm.onConfirm(); setConfirm(null); }}
      />
    </div>
  );
}

// Render without the default admin chrome — this page draws its own .pos shell.
AdminTablesV2.getLayout = (page) => page;
