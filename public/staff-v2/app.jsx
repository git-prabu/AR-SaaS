/* Main app — routing, order state, kitchen tickets.
 *
 * Production wiring: reads live data from window.SV2 (populated by
 * data.js from Firestore) and writes orders via window.SV2.createOrder
 * / window.SV2.updateOrderStatus.
 *
 * Differences from the original Claude Design prototype:
 * - tables, menu, tickets come from window.SV2 (live Firestore data),
 *   not hardcoded data.jsx arrays
 * - sendOrder() calls SV2.createOrder so the order persists
 * - bumpTicket() calls SV2.updateOrderStatus for real kitchen flow
 * - TweaksPanel removed (defaults baked in: gold + dark + auto shape)
 * - waiter name read from SV2.session
 */

const { useState, useEffect, useRef } = React;

let _uid = 0;
const uid = () => 'L' + (++_uid);
const nowLabel = () => {
  const d = new Date();
  let h = d.getHours() % 12; if (h === 0) h = 12;
  return h + ':' + String(d.getMinutes()).padStart(2, '0');
};

// Custom hook: re-renders the component whenever SV2.bumpVersion ticks
// (i.e. whenever any Firestore subscription delivers new data).
function useSV2Version() {
  const [, setV] = useState(0);
  useEffect(() => {
    if (!window.SV2) return;
    return window.SV2.subscribe(() => setV(v => v + 1));
  }, []);
  // Read the live version on every render so values inside this
  // component see the freshest window.TABLES / window.MENU / etc.
  return (window.SV2 && window.SV2.bumpVersion) || 0;
}

function App() {
  // Force re-render when Firestore data arrives / updates.
  const dataVersion = useSV2Version();
  const sv2 = window.SV2;
  const session = (sv2 && sv2.session) || {};
  const waiter = (session.name || 'Staff');

  const [screen, setScreen] = useState('floor');     // floor | menu | review | confirm
  const [tab, setTab] = useState('floor');           // floor | kitchen
  const [zone, setZone] = useState((window.ZONES && window.ZONES[0]) || 'Floor');
  const [activeTable, setActiveTable] = useState(null);
  const [selectedSeat, setSelectedSeat] = useState(0);
  const [drafts, setDrafts] = useState({});          // tableId -> lines[]
  const [sheet, setSheet] = useState(null);          // { item, editLine }
  const [lastTicket, setLastTicket] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  // Live data straight off window globals — re-read on every render so
  // a snapshot update propagates through. dataVersion is the trigger.
  const tables = window.TABLES || [];
  const totals = window.TABLE_TOTALS || {};
  const tickets = window.SEED_TICKETS || [];

  // Keep zone valid if the available zones change (data first loads, etc.)
  useEffect(() => {
    const zones = window.ZONES || ['Floor'];
    if (!zones.includes(zone)) setZone(zones[0]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dataVersion]);

  const lines = activeTable ? (drafts[activeTable.id] || []) : [];
  const setLines = (updater) => setDrafts(d => ({ ...d, [activeTable.id]: updater(d[activeTable.id] || []) }));

  // ── order ops ───────────────────────────────────────────
  const lineFromItem = (item, { qty, spice, notes, freeNote, seat, spiceCustom }) => ({
    uid: uid(), itemId: item.id, name: item.name, price: item.price, veg: item.veg,
    qty, spice, notes: notes || [], freeNote: freeNote || '', seat, spiceCustom: !!spiceCustom,
  });

  const findSimple = (arr, itemId, seat) => arr.find(x => x.itemId === itemId && x.seat === seat && x.notes.length === 0 && !x.spiceCustom);

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

  const stepLine = (uidv, delta) => setLines(arr => {
    return arr.flatMap(l => {
      if (l.uid !== uidv) return [l];
      const nq = l.qty + delta;
      return nq <= 0 ? [] : [{ ...l, qty: nq }];
    });
  });

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

  // ── navigation ──────────────────────────────────────────
  const pickTable = (table) => {
    setActiveTable(table);
    setSelectedSeat(0);
    setScreen('menu');
  };

  // ── send to kitchen ──────────────────────────────────────
  const sendOrder = async (total) => {
    if (submitting || !activeTable || lines.length === 0) return;
    setSubmitting(true);
    try {
      const subtotal = lines.reduce((s, l) => s + l.qty * l.price, 0);
      // Real restaurant tax fields from SV2_RAW.restaurant if available
      const r = (window.SV2_RAW && window.SV2_RAW.restaurant) || {};
      const gstPct = Number(r.gstPercent) || 0;
      const scPct = Number(r.serviceChargePercent) || 0;
      const cgst = subtotal * (gstPct / 2) / 100;
      const sgst = subtotal * (gstPct / 2) / 100;
      const serviceCharge = subtotal * scPct / 100;
      const preRound = subtotal + cgst + sgst + serviceCharge;
      const grandTotal = Math.round(preRound);
      const roundOff = grandTotal - preRound;

      const items = lines.map(l => ({
        id: l.itemId, name: l.name, price: l.price, qty: l.qty,
        seat: l.seat, spice: l.spice || 0,
        modifiers: l.notes || [], note: l.freeNote || '',
      }));

      const actorLabel = session.staffId ? ('captain:staff:' + session.staffId) : 'captain:staff';
      const res = await window.SV2.createOrder({
        items, subtotal,
        gstPercent: gstPct, cgst, sgst,
        serviceCharge, roundOff, total: grandTotal,
        tableNumber: activeTable._code || activeTable.id,
        orderType: 'dinein',
        sessionId: actorLabel,
        paymentStatus: 'unpaid',
        seatsUsed: [...new Set(lines.map(l => l.seat))].sort((a, b) => a - b),
        placedFromV2: true,
      });

      const tk = {
        id: '#' + (res.orderNumber ? String(res.orderNumber).padStart(4, '0') : (res.id || '').slice(-4).toUpperCase()),
        table: activeTable.id, zone: activeTable.zone, waiter: waiter,
        placedAt: nowLabel(), ageMin: 0, status: 'new',
        items: lines.map(l => ({ name: l.name, qty: l.qty, seat: l.seat, spice: l.spice, notes: [...l.notes] })),
      };
      setLastTicket(tk);
      setDrafts(d => ({ ...d, [activeTable.id]: [] }));
      setScreen('confirm');
    } catch (e) {
      console.error('sendOrder failed:', e);
      alert('Could not send the order. Please try again.');
    }
    setSubmitting(false);
  };

  const bumpTicket = async (id, status) => {
    // status: prototype names (new/cooking/ready/cleared) → HaloHelm order.status
    const map = { cooking: 'preparing', ready: 'ready', cleared: 'served' };
    // The ticket id we have is the prototype id like '#0042'; find the
    // raw order via _orderId we stamped into SEED_TICKETS.
    const ticket = (window.SEED_TICKETS || []).find(t => t.id === id);
    if (!ticket || !ticket._orderId) return;
    try {
      await window.SV2.updateOrderStatus(ticket._orderId, map[status] || status);
    } catch (e) {
      console.error('bumpTicket failed:', e);
    }
  };

  const newTickets = tickets.filter(x => x.status === 'new').length;

  // ── render ──────────────────────────────────────────────
  let body;
  if (tab === 'kitchen') {
    body = <window.KitchenScreen tickets={tickets} onBump={bumpTicket} />;
  } else if (!window.SV2 || !window.SV2.ready) {
    body = (
      <div className="screen screen-enter">
        <div className="empty">
          <span className="e-emoji">⏳</span>
          <p>Loading your floor…</p>
        </div>
      </div>
    );
  } else if (screen === 'menu' && activeTable) {
    body = <window.MenuScreen
      table={activeTable} lines={lines} selectedSeat={selectedSeat} setSelectedSeat={setSelectedSeat}
      onBack={() => { setScreen('floor'); }}
      onOpenItem={(item, editLine) => setSheet({ item, editLine })}
      onQuickAdd={quickAdd} onRowStep={rowStep}
      onViewOrder={() => setScreen('review')} />;
  } else if (screen === 'review' && activeTable) {
    body = <window.ReviewScreen
      table={activeTable} lines={lines}
      onBack={() => setScreen('menu')} onAddMore={() => setScreen('menu')}
      onEdit={(l) => setSheet({ item: window.MENU.find(m => m.id === l.itemId), editLine: l })}
      onRemove={removeLine} onStep={stepLine} onSend={sendOrder} />;
  } else if (screen === 'confirm' && lastTicket) {
    body = <window.ConfirmScreen ticket={lastTicket}
      onNewOrder={() => { setScreen('floor'); setActiveTable(null); }}
      onViewKitchen={() => { setTab('kitchen'); }} />;
  } else {
    body = <window.FloorScreen tables={tables} zone={zone} setZone={setZone} onPick={pickTable} totals={totals} tweakShape="auto" waiter={waiter} />;
  }

  const showNav = (tab === 'kitchen') || (tab === 'floor' && (screen === 'floor'));

  return (
    <div className="frame">
      <div className="screenwrap">
        <div className="screen" style={{ flex: 1, minHeight: 0 }}>
          {body}
        </div>

        {showNav && (
          <div className="botnav">
            <button className={tab === 'floor' ? 'on' : ''} onClick={() => { setTab('floor'); setScreen('floor'); }}>
              {window.I.grid}<span>Floor</span>
            </button>
            <button className={tab === 'kitchen' ? 'on' : ''} onClick={() => setTab('kitchen')}>
              {newTickets > 0 && <span className="navbadge">{newTickets}</span>}
              {window.I.chef}<span>Kitchen</span>
            </button>
          </div>
        )}

        {sheet && (
          <window.ItemSheet item={sheet.item} table={activeTable} selectedSeat={selectedSeat} editLine={sheet.editLine}
            onClose={() => setSheet(null)} onCommit={commitSheet} />
        )}
      </div>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
