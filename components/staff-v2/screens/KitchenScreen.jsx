// components/staff-v2/screens/KitchenScreen.jsx
//
// Kitchen rail — live ticket cards bumped through new → cooking →
// ready → cleared. Subscribes to recent orders via the parent;
// receives status + count maps from the parent.
//
// Maps prototype status names to HaloHelm order.status values:
//   'new'     ↔ 'pending'        (just placed, kitchen hasn't started)
//   'cooking' ↔ 'preparing'      (kitchen is cooking)
//   'ready'   ↔ 'ready'          (done, awaiting waiter pickup)
//   'cleared' ↔ 'served'         (waiter picked up; drops from rail)
// Cancelled / takeaway / paid-and-served orders never appear here.

import { useMemo, useState } from 'react';
import { I } from '../ui/icons';
import { SpicePips } from '../ui/primitives';

export default function KitchenScreen({ orders, onBump }) {
  const [filter, setFilter] = useState('all');

  // Map order.status → ticket bucket the rail cares about.
  const bucket = (o) => {
    if (o.status === 'cancelled') return null;
    if (o.orderType === 'takeaway' || o.orderType === 'takeout') return null;
    // Already-served orders only stay on rail while unpaid (so the
    // kitchen sees what's been picked up). Once served + paid they
    // drop off — matches the existing kitchen page behaviour.
    if (o.status === 'served') return null;
    if (o.status === 'ready') return 'ready';
    if (o.status === 'preparing') return 'cooking';
    if (o.status === 'pending') return 'new';
    if (o.status === 'awaiting_payment') return 'new';
    return null;
  };

  const tickets = useMemo(() => {
    const ts = [];
    for (const o of orders || []) {
      const b = bucket(o);
      if (!b) continue;
      // Age in minutes from createdAt (Firestore Timestamp or Date)
      const created = o.createdAt?.toDate ? o.createdAt.toDate() : (o.createdAt ? new Date(o.createdAt) : new Date());
      const ageMin = Math.max(0, Math.floor((Date.now() - created.getTime()) / 60000));
      const placedAt = fmtTime(created);
      ts.push({
        id: '#' + (o.orderNumber ? String(o.orderNumber).padStart(4, '0') : String(o.id).slice(-4).toUpperCase()),
        orderId: o.id,
        table: String(o.tableNumber || '-'),
        zone: o.zone || 'Floor',
        waiter: o.placedBy || o.waiterName || '',
        placedAt, ageMin, status: b,
        items: Array.isArray(o.items) ? o.items : [],
      });
    }
    // Sort: new (urgency) first, then cooking, then ready;
    // within bucket, oldest first.
    const order = { new: 0, cooking: 1, ready: 2 };
    ts.sort((a, b) => (order[a.status] - order[b.status]) || (b.ageMin - a.ageMin));
    return ts;
  }, [orders]);

  const counts = useMemo(() => ({
    all: tickets.length,
    new: tickets.filter(t => t.status === 'new').length,
    cooking: tickets.filter(t => t.status === 'cooking').length,
    ready: tickets.filter(t => t.status === 'ready').length,
  }), [tickets]);

  const shown = filter === 'all' ? tickets : tickets.filter(t => t.status === filter);

  const FILTERS = [
    { id: 'all', label: 'All' },
    { id: 'new', label: 'New' },
    { id: 'cooking', label: 'Cooking' },
    { id: 'ready', label: 'Ready' },
  ];

  return (
    <div className="screen screen-enter">
      <div className="apphead">
        <div className="apphead-row">
          <div style={{ flex: 1 }}>
            <div className="eyebrow">Kitchen Display · live</div>
            <h1 className="h-screen">Kitchen rail</h1>
          </div>
          <button className="iconbtn gold" aria-label="Kitchen">{I.chef}</button>
        </div>
      </div>

      <div className="kfilter">
        {FILTERS.map(f => (
          <button key={f.id} className={filter === f.id ? 'on' : ''} onClick={() => setFilter(f.id)}>
            {f.label}<span className="kf-n">{counts[f.id]}</span>
          </button>
        ))}
      </div>

      <div className="scroll">
        {shown.length === 0 ? (
          <div className="empty">
            <span className="e-emoji">🍳</span>
            <p>No tickets here. New orders land on the rail instantly.</p>
          </div>
        ) : (
          <div className="ticketlist">
            {shown.map(t => <Ticket key={t.orderId} t={t} onBump={onBump} />)}
          </div>
        )}
      </div>
    </div>
  );
}

function Ticket({ t, onBump }) {
  const age = t.ageMin;
  const late = age >= 18 && t.status !== 'ready';
  const statusLabel = { new: 'New', cooking: 'Cooking', ready: 'Ready' }[t.status];
  return (
    <div className={'ticket status-' + t.status}>
      <div className="ticket-head">
        <div className="th-table">
          <b>{t.table.replace(/^T/i, '') || '-'}</b>
          <small>Table</small>
        </div>
        <div className="th-meta">
          <div className="th-id">
            {t.id}
            <span className={'kstatus ' + t.status}>{statusLabel}</span>
          </div>
          <div className="th-sub">
            {t.zone}{t.waiter ? ' · ' + t.waiter : ''} · {t.placedAt}
          </div>
        </div>
        <span className={'kage' + (late ? ' late' : '')}>{I.clock}&nbsp;{age}m</span>
      </div>

      <div className="ticket-items">
        {t.items.map((it, i) => (
          <div className="kitem" key={i}>
            <span className="ki-qty">{it.qty}×</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <span className="ki-name">{it.name}</span>
              <div className="ki-meta">
                <span className="ki-seat">{(it.seat ?? 0) === 0 ? 'Table' : 'Seat ' + it.seat}</span>
                {it.spice > 0 && <SpicePips level={it.spice} />}
                {(it.modifiers || it.notes || []).map((n, j) => <span className="li-modtag" key={j}>{n}</span>)}
                {it.note && <span className="li-modtag" style={{ textTransform: 'none', letterSpacing: 0 }}>{it.note}</span>}
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="ticket-foot">
        {t.status === 'new' && (
          <button className="bump start" onClick={() => onBump(t.orderId, 'preparing')}>
            {I.flame} Start cooking
          </button>
        )}
        {t.status === 'cooking' && (
          <button className="bump done" onClick={() => onBump(t.orderId, 'ready')}>
            {I.check} Mark ready
          </button>
        )}
        {t.status === 'ready' && (
          <button className="bump cleared" onClick={() => onBump(t.orderId, 'served')}>
            {I.check} Picked up · clear
          </button>
        )}
      </div>
    </div>
  );
}

function fmtTime(d) {
  let h = d.getHours() % 12; if (h === 0) h = 12;
  return h + ':' + String(d.getMinutes()).padStart(2, '0');
}
