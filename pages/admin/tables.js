// pages/admin/tables.js
//
// Table View — the floor-plan POS screen (Phase 0).
//
// STEP 2 (this commit): "Manage Layout" mode only — admins add/edit/
// delete Areas (A/C, Rooftop, Bar…) and the Tables inside each. The
// data lands in restaurants/{rid}/areas + /tables (see lib/db.js).
//
// STEP 4 (next): a "Live View" mode is added to THIS page — the same
// areas/tables rendered as a colour-coded status grid (blank / running
// / KOT / printed / paid) derived from tableBills + orders, with
// per-table quick actions. The mode toggle is already scaffolded below
// so step 4 only has to fill in the live grid.
import Head from 'next/head';
import { useEffect, useState, useMemo } from 'react';
import { useRouter } from 'next/router';
import { useAuth } from '../../hooks/useAuth';
import AdminLayout from '../../components/layout/AdminLayout';
import EmptyState from '../../components/EmptyState';
import ConfirmModal from '../../components/ConfirmModal';
import { db } from '../../lib/firebase';
import { collection, onSnapshot, query, orderBy, where, limit } from 'firebase/firestore';
import {
  createArea, updateArea, deleteArea,
  createTable, updateTable, deleteTable,
  markKotPrinted, getRestaurantById,
} from '../../lib/db';
import { printKot } from '../../lib/printKot';
import toast from 'react-hot-toast';

// ═══ Aspire palette — same tokens as the other admin pages ═══
const INTER = "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
const A = {
  font: INTER,
  cream: '#EDEDED',
  ink: '#1A1A1A',
  shell: '#FFFFFF',
  shellDarker: '#F8F8F8',
  warning: '#C4A86D',
  warningDim: '#A08656',
  success: '#3F9E5A',
  danger: '#D9534F',
  mutedText: 'rgba(0,0,0,0.55)',
  faintText: 'rgba(0,0,0,0.38)',
  subtleBg: 'rgba(0,0,0,0.04)',
  border: '1px solid rgba(0,0,0,0.06)',
  borderStrong: '1px solid rgba(0,0,0,0.10)',
  cardShadow: '0 1px 2px rgba(0,0,0,0.04), 0 4px 12px rgba(0,0,0,0.04)',
};

const btnPrimary = {
  display: 'inline-flex', alignItems: 'center', gap: 7,
  padding: '9px 16px', borderRadius: 9, border: 'none', cursor: 'pointer',
  background: A.ink, color: A.cream, fontFamily: A.font, fontSize: 13, fontWeight: 600,
};
const btnGhost = {
  display: 'inline-flex', alignItems: 'center', gap: 6,
  padding: '7px 13px', borderRadius: 8, cursor: 'pointer',
  background: A.shell, border: A.borderStrong, color: A.ink, fontFamily: A.font, fontSize: 12, fontWeight: 600,
};
const inputStyle = {
  padding: '9px 12px', borderRadius: 8, border: A.borderStrong,
  fontSize: 13, fontFamily: A.font, color: A.ink, outline: 'none', background: A.shell, boxSizing: 'border-box',
};

// ═══ Live table-status palette (matches the Petpooja-style legend) ═══
// Status is DERIVED from tableBills + orders — never stored on the table.
const PAID_SET = new Set(['paid_cash', 'paid_card', 'paid_online', 'paid']);
const STATUS = {
  blank:   { key: 'blank',   label: 'Blank',       bg: '#F1F0ED', bd: 'rgba(0,0,0,0.10)', fg: 'rgba(0,0,0,0.45)', dot: '#BDBDB6' },
  running: { key: 'running', label: 'Running',     bg: '#DDEBFB', bd: '#A6C8EC',          fg: '#235E96',          dot: '#2D7DD2' },
  kot:     { key: 'kot',     label: 'Running KOT', bg: '#FBE7C2', bd: '#E6C684',          fg: '#8A6A1E',          dot: '#E0A52E' },
  printed: { key: 'printed', label: 'Printed',     bg: '#D6EEDC', bd: '#A2D3B0',          fg: '#2C7A47',          dot: '#3F9E5A' },
  paid:    { key: 'paid',    label: 'Paid',        bg: '#FCF4C6', bd: '#E6D789',          fg: '#897619',          dot: '#C9B23E' },
};

export default function AdminTables() {
  const { user, userData, loading } = useAuth();
  const router = useRouter();
  const rid = userData?.restaurantId;

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
  // 'manage' = floor-plan editor (areas + tables CRUD).
  const [mode, setMode] = useState('live');
  const [detailTable, setDetailTable] = useState(null); // table whose bill is open in the side panel

  const sessionCodes = useMemo(() => Object.keys(sessions), [sessions]);
  const [restaurantName, setRestaurantName] = useState('');
  useEffect(() => { if (rid) getRestaurantById(rid).then(r => setRestaurantName(r?.name || '')).catch(() => {}); }, [rid]);

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
    if (state.billId) markKotPrinted(rid, state.billId).catch(() => {});
  };

  // Inline-form state
  const [newAreaName, setNewAreaName] = useState('');
  const [addingArea, setAddingArea] = useState(false);
  const [tableForm, setTableForm] = useState(null); // { areaId, label, code, capacity } | null
  const [editingArea, setEditingArea] = useState(null); // { id, name } | null
  const [editingTable, setEditingTable] = useState(null); // { id, label, code, capacity, areaId } | null

  // Redirect to login if unauthenticated once auth resolves.
  useEffect(() => {
    if (!loading && !user) router.push('/admin/login');
  }, [loading, user, router]);

  // Live subscriptions to areas + tables.
  useEffect(() => {
    if (!rid) return;
    let n = 0;
    const done = () => { if (++n >= 2) setDataLoaded(true); };
    const ua = onSnapshot(
      query(collection(db, 'restaurants', rid, 'areas'), orderBy('sortOrder', 'asc')),
      snap => { setAreas(snap.docs.map(d => ({ id: d.id, ...d.data() }))); done(); },
      () => done()
    );
    const ut = onSnapshot(
      query(collection(db, 'restaurants', rid, 'tables'), orderBy('sortOrder', 'asc')),
      snap => { setTables(snap.docs.map(d => ({ id: d.id, ...d.data() }))); done(); },
      () => done()
    );
    // tableSessions (doc id = table code) → currentBillId per table.
    // Also the import source for Step 3.
    const us = onSnapshot(
      collection(db, 'restaurants', rid, 'tableSessions'),
      snap => {
        const m = {};
        snap.docs.forEach(d => { m[d.id] = { id: d.id, ...d.data() }; });
        setSessions(m);
      },
      () => {}
    );
    // Open bills only (status == 'open') — keyed by billId. Drives which
    // table is "running" and carries the kotPrintedAt/billPrintedAt flags.
    const ub = onSnapshot(
      query(collection(db, 'restaurants', rid, 'tableBills'), where('status', '==', 'open')),
      snap => {
        const m = {};
        snap.docs.forEach(d => { m[d.id] = { id: d.id, ...d.data() }; });
        setBills(m);
      },
      () => {}
    );
    // Recent orders (bounded) — to read paymentStatus/total/items for the
    // orders on each open bill. Same listener shape the kitchen page uses,
    // capped so a long-lived restaurant doesn't stream its whole history.
    const uo = onSnapshot(
      query(collection(db, 'restaurants', rid, 'orders'), orderBy('createdAt', 'desc'), limit(300)),
      snap => {
        const m = {};
        snap.docs.forEach(d => { m[d.id] = { id: d.id, ...d.data() }; });
        setOrdersById(m);
      },
      () => {}
    );
    return () => { ua(); ut(); us(); ub(); uo(); };
  }, [rid]);

  // Default the import count to however many QR table-sessions already
  // exist (so "import" feels like it carries their current setup), else 12.
  useEffect(() => {
    if (importCount === '' && sessionCodes.length > 0) setImportCount(String(sessionCodes.length));
  }, [sessionCodes, importCount]);

  // ── Quick-add / import existing tables (Step 3) ─────────────
  const handleImport = async (countRaw) => {
    const n = Math.max(1, Math.min(100, Math.floor(Number(countRaw) || 0)));
    if (!n) { toast.error('Enter how many tables (1–100)'); return; }
    setImporting(true);
    try {
      // 1. Ensure a "Main" area exists to drop them into.
      let mainAreaId = areas.find(a => (a.name || '').toLowerCase() === 'main')?.id;
      if (!mainAreaId) {
        const ref = await createArea(rid, { name: 'Main', sortOrder: 0 });
        mainAreaId = ref.id;
      }
      // 2. Create Table 1..n, skipping any code that already exists
      //    (so re-running is safe + won't clash with manual adds).
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

  const tablesByArea = useMemo(() => {
    const map = {};
    for (const t of tables) {
      const k = t.areaId || '_unassigned';
      (map[k] = map[k] || []).push(t);
    }
    return map;
  }, [tables]);

  // Derive each table's live status. Orders reach a table TWO ways:
  //   1. via the open tableBill (customer QR flow attaches orderIds), or
  //   2. directly by tableNumber === table.code, with NO bill — this is
  //      how waiter / admin "New Order" creates dine-in orders (they set
  //      tableNumber but never attach to a bill).
  // We union both so a table shows "Running" regardless of how the order
  // was placed. (20 May 2026 fix — waiter orders weren't appearing.)
  // Returns { [tableId]: { status, billId, orderCount, itemCount, total } }.
  const allOrdersList = useMemo(() => Object.values(ordersById), [ordersById]);
  const statesByTable = useMemo(() => {
    const out = {};
    for (const t of tables) {
      const session = sessions[t.code];
      const billId = session?.currentBillId;
      const bill = billId ? bills[billId] : null; // bills map only has OPEN bills
      const code = String(t.code || '');

      // (1) orders on the open bill
      const fromBill = bill ? (bill.orderIds || []).map(id => ordersById[id]).filter(Boolean) : [];

      // (2) bill-less dine-in orders matched by table code. Only ACTIVE
      //     ones (not cancelled, not already served-AND-paid) so old
      //     completed orders from earlier today don't keep the table lit.
      const fromTable = code ? allOrdersList.filter(o => {
        if (String(o.tableNumber || '') !== code) return false;
        if (o.orderType === 'takeaway' || o.orderType === 'takeout') return false;
        if (o.status === 'cancelled') return false;
        const done = o.status === 'served' && PAID_SET.has(o.paymentStatus);
        return !done;
      }) : [];

      // union + dedupe by id, drop cancelled
      const map = {};
      for (const o of [...fromBill, ...fromTable]) {
        if (o && o.status !== 'cancelled') map[o.id] = o;
      }
      const liveOrders = Object.values(map);

      if (liveOrders.length === 0) { out[t.id] = { status: STATUS.blank, billId: billId || null, orderCount: 0, itemCount: 0, total: 0 }; continue; }

      const total     = liveOrders.reduce((s, o) => s + (Number(o.total) || 0), 0);
      const itemCount = liveOrders.reduce((s, o) => s + (Array.isArray(o.items) ? o.items.length : 0), 0);
      const allPaid   = liveOrders.every(o => PAID_SET.has(o.paymentStatus));

      let status;
      if (allPaid)                 status = STATUS.paid;
      else if (bill?.billPrintedAt) status = STATUS.printed;  // bill flags (Phase 1) — only when a bill exists
      else if (bill?.kotPrintedAt)  status = STATUS.kot;
      else                         status = STATUS.running;

      out[t.id] = { status, billId: billId || null, orderCount: liveOrders.length, itemCount, total, orders: liveOrders };
    }
    return out;
  }, [tables, sessions, bills, ordersById, allOrdersList]);

  const statusCounts = useMemo(() => {
    const c = { running: 0, kot: 0, printed: 0, paid: 0, blank: 0 };
    Object.values(statesByTable).forEach(s => { c[s.status.key] = (c[s.status.key] || 0) + 1; });
    return c;
  }, [statesByTable]);

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
        // Unassign tables in this area first so they aren't orphaned to a
        // dead areaId, then delete the area doc.
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
    // Code must be URL-safe-ish (it becomes the QR path segment)
    if (!/^[A-Za-z0-9_-]{1,12}$/.test(code)) {
      toast.error('Code: letters/digits/-/_ only, max 12 chars');
      return;
    }
    // Prevent duplicate codes (they map to one tableSessions doc each)
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

  // ── Render ──────────────────────────────────────────────────
  if (loading || !user) {
    return <AdminLayout><div style={{ padding: 40, fontFamily: A.font, color: A.mutedText }}>Loading…</div></AdminLayout>;
  }

  const totalTables = tables.length;

  return (
    <>
      <Head><title>Table View — HaloHelm</title></Head>
      <AdminLayout>
        <div style={{ padding: '28px 26px', maxWidth: 1100, margin: '0 auto', fontFamily: A.font, color: A.ink }}>

          {/* Header + mode toggle */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, marginBottom: 18, flexWrap: 'wrap' }}>
            <div>
              <h1 style={{ fontSize: 26, fontWeight: 800, letterSpacing: '-0.5px', margin: 0 }}>Table View</h1>
              <p style={{ fontSize: 13.5, color: A.mutedText, margin: '5px 0 0', lineHeight: 1.5 }}>
                {mode === 'live'
                  ? `${areas.length} area${areas.length === 1 ? '' : 's'} · ${totalTables} table${totalTables === 1 ? '' : 's'} · live status`
                  : 'Build your floor plan — areas and the tables inside them.'}
              </p>
            </div>
            {/* Live / Manage segmented toggle */}
            <div style={{ display: 'inline-flex', background: A.subtleBg, borderRadius: 10, padding: 3, gap: 2 }}>
              {[['live', 'Live'], ['manage', 'Manage Layout']].map(([m, label]) => (
                <button key={m} onClick={() => setMode(m)}
                  style={{
                    padding: '8px 16px', borderRadius: 8, border: 'none', cursor: 'pointer',
                    fontFamily: A.font, fontSize: 13, fontWeight: 700,
                    background: mode === m ? A.shell : 'transparent',
                    color: mode === m ? A.ink : A.mutedText,
                    boxShadow: mode === m ? A.cardShadow : 'none',
                  }}>{label}</button>
              ))}
            </div>
          </div>

          {/* ═══ LIVE MODE — status grid ═══ */}
          {mode === 'live' && (
            <div>
              {/* Legend + live counts */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 18, flexWrap: 'wrap', marginBottom: 22, padding: '12px 16px', background: A.shell, border: A.border, borderRadius: 12, boxShadow: A.cardShadow }}>
                {Object.values(STATUS).map(s => (
                  <span key={s.key} style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 12.5, color: A.mutedText, fontWeight: 600 }}>
                    <span style={{ width: 11, height: 11, borderRadius: 3, background: s.bg, border: `1.5px solid ${s.bd}` }} />
                    {s.label}
                    {statusCounts[s.key] > 0 && <span style={{ color: A.ink, fontWeight: 800 }}>{statusCounts[s.key]}</span>}
                  </span>
                ))}
              </div>

              {dataLoaded && totalTables === 0 && (
                <EmptyState title="No tables yet" subtitle="Switch to “Manage Layout” to add areas and tables, or import a quick set." />
              )}

              {areas.map(area => {
                const at = tablesByArea[area.id] || [];
                if (at.length === 0) return null;
                return (
                  <div key={area.id} style={{ marginBottom: 28 }}>
                    <h2 style={{ fontSize: 15, fontWeight: 800, margin: '0 0 12px', letterSpacing: '-0.2px', color: A.ink }}>{area.name}</h2>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(132px, 1fr))', gap: 12 }}>
                      {at.map(t => {
                        const st = statesByTable[t.id] || { status: STATUS.blank, total: 0, itemCount: 0 };
                        const s = st.status;
                        const busy = s.key !== 'blank';
                        return (
                          <button key={t.id} onClick={() => busy && setDetailTable(t)}
                            style={{
                              textAlign: 'left', cursor: busy ? 'pointer' : 'default',
                              background: s.bg, border: `1.5px solid ${s.bd}`, borderRadius: 12,
                              padding: '13px 14px', minHeight: 84, fontFamily: A.font,
                              display: 'flex', flexDirection: 'column', justifyContent: 'space-between', gap: 8,
                            }}>
                            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 6 }}>
                              <span style={{ fontSize: 14, fontWeight: 800, color: A.ink, lineHeight: 1.2 }}>{t.label}</span>
                              <span style={{ width: 9, height: 9, borderRadius: '50%', background: s.dot, flexShrink: 0, marginTop: 3 }} />
                            </div>
                            {busy ? (
                              <div>
                                <div style={{ fontSize: 11.5, fontWeight: 700, color: s.fg, textTransform: 'uppercase', letterSpacing: '0.03em' }}>{s.label}</div>
                                <div style={{ fontSize: 13, fontWeight: 800, color: A.ink, marginTop: 2 }}>
                                  ₹{Math.round(st.total)}{st.itemCount ? <span style={{ fontWeight: 600, color: A.mutedText, fontSize: 11 }}> · {st.itemCount} item{st.itemCount === 1 ? '' : 's'}</span> : null}
                                </div>
                              </div>
                            ) : (
                              <div style={{ fontSize: 11.5, fontWeight: 600, color: A.faintText }}>{t.capacity || 4} seats · free</div>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}

              {/* Unassigned tables in live mode */}
              {(tablesByArea._unassigned || []).length > 0 && (
                <div style={{ marginBottom: 28 }}>
                  <h2 style={{ fontSize: 15, fontWeight: 800, margin: '0 0 12px', color: A.danger }}>Unassigned</h2>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(132px, 1fr))', gap: 12 }}>
                    {tablesByArea._unassigned.map(t => {
                      const st = statesByTable[t.id] || { status: STATUS.blank };
                      const s = st.status;
                      return (
                        <div key={t.id} style={{ background: s.bg, border: `1.5px solid ${s.bd}`, borderRadius: 12, padding: '13px 14px', minHeight: 84 }}>
                          <div style={{ fontSize: 14, fontWeight: 800, color: A.ink }}>{t.label}</div>
                          <div style={{ fontSize: 11.5, color: A.mutedText, marginTop: 4 }}>{s.label}</div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ═══ MANAGE MODE — floor-plan editor ═══ */}
          {mode === 'manage' && (
          <div>
          {/* Add area control */}
          {!addingArea ? (
            <button style={{ ...btnPrimary, marginBottom: 22 }} onClick={() => setAddingArea(true)}>
              <span style={{ fontSize: 16, lineHeight: 1 }}>+</span> Add area
            </button>
          ) : (
            <div style={{ display: 'flex', gap: 8, marginBottom: 22, alignItems: 'center', flexWrap: 'wrap' }}>
              <input autoFocus style={{ ...inputStyle, width: 240 }} placeholder="Area name (e.g. Rooftop, A/C, Bar)"
                value={newAreaName} onChange={e => setNewAreaName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleAddArea()} />
              <button style={btnPrimary} onClick={handleAddArea}>Add</button>
              <button style={btnGhost} onClick={() => { setAddingArea(false); setNewAreaName(''); }}>Cancel</button>
            </div>
          )}

          {/* Empty state + quick import */}
          {dataLoaded && areas.length === 0 && (tablesByArea._unassigned || []).length === 0 && (
            <div>
              <EmptyState
                title="No tables yet"
                subtitle="Add areas + tables manually below, or import a quick set to get started in one click."
              />
              <div style={{ maxWidth: 460, margin: '16px auto 0', padding: '18px 20px', background: A.shell, border: A.borderStrong, borderRadius: 14, boxShadow: A.cardShadow, textAlign: 'center' }}>
                <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 4 }}>Quick start</div>
                <div style={{ fontSize: 13, color: A.mutedText, marginBottom: 14, lineHeight: 1.5 }}>
                  {sessionCodes.length > 0
                    ? `You have ${sessionCodes.length} table${sessionCodes.length === 1 ? '' : 's'} set up from your QR codes. Import them into a “Main” area:`
                    : 'Create a batch of numbered tables in a “Main” area — you can rename, move, or split them into areas afterwards:'}
                </div>
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                  <input type="number" min="1" max="100" style={{ ...inputStyle, width: 90, textAlign: 'center' }}
                    placeholder="12" value={importCount} onChange={e => setImportCount(e.target.value)} />
                  <button style={{ ...btnPrimary, opacity: importing ? 0.6 : 1 }} disabled={importing}
                    onClick={() => handleImport(importCount || 12)}>
                    {importing ? 'Adding…' : `Create ${Math.max(1, Math.min(100, Math.floor(Number(importCount) || 12)))} tables`}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Areas + their tables */}
          {areas.map(area => {
            const at = tablesByArea[area.id] || [];
            return (
              <div key={area.id} style={{ marginBottom: 26 }}>
                {/* Area header row */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                  {editingArea?.id === area.id ? (
                    <>
                      <input autoFocus style={{ ...inputStyle, width: 200 }} value={editingArea.name}
                        onChange={e => setEditingArea({ ...editingArea, name: e.target.value })}
                        onKeyDown={e => e.key === 'Enter' && handleRenameArea()} />
                      <button style={btnPrimary} onClick={handleRenameArea}>Save</button>
                      <button style={btnGhost} onClick={() => setEditingArea(null)}>Cancel</button>
                    </>
                  ) : (
                    <>
                      <h2 style={{ fontSize: 16, fontWeight: 800, margin: 0, letterSpacing: '-0.2px' }}>{area.name}</h2>
                      <span style={{ fontSize: 12, color: A.faintText, fontWeight: 600 }}>{at.length} table{at.length === 1 ? '' : 's'}</span>
                      <button style={{ ...btnGhost, padding: '4px 10px', fontSize: 11 }} onClick={() => setEditingArea({ id: area.id, name: area.name })}>Rename</button>
                      <button style={{ ...btnGhost, padding: '4px 10px', fontSize: 11, color: A.danger, borderColor: 'rgba(217,83,79,0.30)' }} onClick={() => requestDeleteArea(area)}>Delete</button>
                    </>
                  )}
                </div>

                {/* Tables grid */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 12 }}>
                  {at.map(t => (
                    <div key={t.id} style={{ background: A.shell, border: A.border, borderRadius: 12, padding: 14, boxShadow: A.cardShadow }}>
                      {editingTable?.id === t.id ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                          <input style={inputStyle} placeholder="Name" value={editingTable.label} onChange={e => setEditingTable({ ...editingTable, label: e.target.value })} />
                          <input style={inputStyle} placeholder="Code" value={editingTable.code} onChange={e => setEditingTable({ ...editingTable, code: e.target.value })} />
                          <input style={inputStyle} type="number" min="1" placeholder="Seats" value={editingTable.capacity} onChange={e => setEditingTable({ ...editingTable, capacity: e.target.value })} />
                          <div style={{ display: 'flex', gap: 6 }}>
                            <button style={{ ...btnPrimary, flex: 1, justifyContent: 'center' }} onClick={handleUpdateTable}>Save</button>
                            <button style={btnGhost} onClick={() => setEditingTable(null)}>✕</button>
                          </div>
                        </div>
                      ) : (
                        <>
                          <div style={{ fontSize: 14, fontWeight: 700 }}>{t.label}</div>
                          <div style={{ fontSize: 12, color: A.mutedText, marginTop: 3 }}>
                            <span style={{ fontFamily: 'monospace', background: A.subtleBg, padding: '1px 6px', borderRadius: 4 }}>{t.code}</span>
                            <span style={{ marginLeft: 8 }}>{t.capacity || 4} seats</span>
                          </div>
                          <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
                            <button style={{ ...btnGhost, padding: '4px 10px', fontSize: 11 }} onClick={() => setEditingTable({ id: t.id, label: t.label, code: t.code, capacity: t.capacity || 4, areaId: t.areaId })}>Edit</button>
                            <button style={{ ...btnGhost, padding: '4px 10px', fontSize: 11, color: A.danger, borderColor: 'rgba(217,83,79,0.30)' }} onClick={() => requestDeleteTable(t)}>Delete</button>
                          </div>
                        </>
                      )}
                    </div>
                  ))}

                  {/* Add-table tile */}
                  {tableForm?.areaId === area.id ? (
                    <div style={{ background: A.shellDarker, border: A.borderStrong, borderRadius: 12, padding: 14, display: 'flex', flexDirection: 'column', gap: 7 }}>
                      <input autoFocus style={inputStyle} placeholder="Name (e.g. Table 1)" value={tableForm.label} onChange={e => setTableForm({ ...tableForm, label: e.target.value })} />
                      <input style={inputStyle} placeholder="Code (e.g. 1, A1)" value={tableForm.code} onChange={e => setTableForm({ ...tableForm, code: e.target.value })} />
                      <input style={inputStyle} type="number" min="1" placeholder="Seats" value={tableForm.capacity} onChange={e => setTableForm({ ...tableForm, capacity: e.target.value })} />
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button style={{ ...btnPrimary, flex: 1, justifyContent: 'center' }} onClick={handleSaveTable}>Add</button>
                        <button style={btnGhost} onClick={() => setTableForm(null)}>✕</button>
                      </div>
                    </div>
                  ) : (
                    <button
                      onClick={() => setTableForm({ areaId: area.id, label: '', code: '', capacity: 4 })}
                      style={{ background: 'transparent', border: `1.5px dashed rgba(0,0,0,0.16)`, borderRadius: 12, padding: 14, cursor: 'pointer', color: A.mutedText, fontFamily: A.font, fontSize: 13, fontWeight: 600, minHeight: 86, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                      <span style={{ fontSize: 16 }}>+</span> Add table
                    </button>
                  )}
                </div>
              </div>
            );
          })}

          {/* Unassigned tables (e.g. orphaned after an area delete) */}
          {(tablesByArea._unassigned || []).length > 0 && (
            <div style={{ marginBottom: 26 }}>
              <h2 style={{ fontSize: 16, fontWeight: 800, margin: '0 0 12px', color: A.danger }}>Unassigned</h2>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 12 }}>
                {tablesByArea._unassigned.map(t => (
                  <div key={t.id} style={{ background: A.shell, border: A.border, borderRadius: 12, padding: 14, boxShadow: A.cardShadow }}>
                    <div style={{ fontSize: 14, fontWeight: 700 }}>{t.label}</div>
                    <div style={{ fontSize: 12, color: A.mutedText, marginTop: 3 }}>
                      <span style={{ fontFamily: 'monospace', background: A.subtleBg, padding: '1px 6px', borderRadius: 4 }}>{t.code}</span>
                    </div>
                    {/* Move-to-area picker */}
                    {areas.length > 0 && (
                      <select
                        defaultValue=""
                        onChange={async (e) => { if (e.target.value) { await updateTable(rid, t.id, { areaId: e.target.value }); toast.success('Moved'); } }}
                        style={{ ...inputStyle, marginTop: 10, width: '100%' }}>
                        <option value="" disabled>Move to area…</option>
                        {areas.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                      </select>
                    )}
                    <button style={{ ...btnGhost, padding: '4px 10px', fontSize: 11, color: A.danger, borderColor: 'rgba(217,83,79,0.30)', marginTop: 8 }} onClick={() => requestDeleteTable(t)}>Delete</button>
                  </div>
                ))}
              </div>
            </div>
          )}
          </div>
          )}
        </div>
      </AdminLayout>

      {/* Bill detail side panel (live mode → tap a running table) */}
      {detailTable && (() => {
        const st = statesByTable[detailTable.id] || { status: STATUS.blank, orders: [], total: 0 };
        const orders = st.orders || [];
        return (
          <div onClick={() => setDetailTable(null)}
            style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(0,0,0,0.40)', display: 'flex', justifyContent: 'flex-end' }}>
            <div onClick={e => e.stopPropagation()}
              style={{ width: 'min(420px, 100%)', height: '100%', background: A.shell, fontFamily: A.font, color: A.ink, display: 'flex', flexDirection: 'column', boxShadow: '-10px 0 40px rgba(0,0,0,0.25)' }}>
              <div style={{ padding: '18px 22px', borderBottom: A.border, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                  <div style={{ fontSize: 18, fontWeight: 800 }}>{detailTable.label}</div>
                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
                    <span style={{ width: 9, height: 9, borderRadius: '50%', background: st.status.dot }} />
                    <span style={{ fontSize: 12, fontWeight: 700, color: st.status.fg }}>{st.status.label}</span>
                  </div>
                </div>
                <button onClick={() => setDetailTable(null)} style={{ ...btnGhost, padding: '6px 10px' }}>✕</button>
              </div>
              <div style={{ flex: 1, overflowY: 'auto', padding: '16px 22px' }}>
                {orders.length === 0 ? (
                  <div style={{ color: A.mutedText, fontSize: 14, paddingTop: 20, textAlign: 'center' }}>No live orders on this table.</div>
                ) : orders.map((o, oi) => (
                  <div key={o.id} style={{ marginBottom: 16, paddingBottom: 14, borderBottom: oi < orders.length - 1 ? A.border : 'none' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: A.mutedText, marginBottom: 6, fontWeight: 600 }}>
                      <span>Order {o.orderNumber ? `#${o.orderNumber}` : o.id.slice(-5)}</span>
                      <span style={{ textTransform: 'capitalize' }}>{(o.paymentStatus || 'unpaid').replace('_', ' ')}</span>
                    </div>
                    {(o.items || []).map((it, i) => (
                      <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, padding: '3px 0' }}>
                        <span>{it.qty || 1}× {it.name}</span>
                        <span style={{ color: A.mutedText }}>₹{(it.price || 0) * (it.qty || 1)}</span>
                      </div>
                    ))}
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, fontWeight: 700, marginTop: 6 }}>
                      <span>Order total</span><span>₹{Math.round(o.total || 0)}</span>
                    </div>
                  </div>
                ))}
              </div>
              <div style={{ padding: '16px 22px', borderTop: A.border }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 16, fontWeight: 800, marginBottom: 12 }}>
                  <span>Table total</span><span>₹{Math.round(st.total || 0)}</span>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button onClick={() => handlePrintKot(detailTable, st)}
                    style={{ ...btnGhost, flex: 1, justifyContent: 'center', padding: '11px 14px' }}>
                    🖨 Print KOT
                  </button>
                  <a href="/admin/orders" style={{ ...btnPrimary, flex: 1, justifyContent: 'center', textDecoration: 'none', padding: '11px 14px' }}>Open in Orders →</a>
                </div>
                <div style={{ fontSize: 11, color: A.faintText, textAlign: 'center', marginTop: 10 }}>
                  KOT prints to any printer set on this device. Bill print + take-payment arrive next.
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      <ConfirmModal
        open={!!confirm}
        title={confirm?.title}
        body={confirm?.body}
        confirmLabel={confirm?.confirmLabel}
        destructive={confirm?.destructive}
        onCancel={() => setConfirm(null)}
        onConfirm={async () => { await confirm.onConfirm(); setConfirm(null); }}
      />
    </>
  );
}
