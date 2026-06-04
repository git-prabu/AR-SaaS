// components/order-kitchen/HistoryListScreen.js
//
// Phase B.4 (2026-06-03) — Past shifts history view.
//
// Combined feed of:
//   - resolved waiter calls (status='resolved')
//   - served orders (status='served')
// Sorted newest-first by resolved/served time. Period chips
// (Today / Week / Month / All) + a search box (matches table
// number or label).
//
// Mirrors /admin/waiter History tab — same data shape, same
// filter semantics. Dark Order & Kitchen palette here.

import React from 'react';

// Theme-responsive tokens go through CSS vars so light mode flips
// them at paint time without recomputing inline styles in JS.
const COLORS = {
  text:       'var(--tx)',
  textMuted:  'var(--tx-2)',
  textFaint:  'var(--tx-3)',
  card:       'var(--card)',
  border:     'var(--line)',
  gold:       '#C4A86D',
  goldBg:     'rgba(196,168,109,0.14)',
  goldText:   '#D6BC85',
  green:      '#4A8866',
  greenBg:    'rgba(74,136,102,0.14)',
  greenText:  '#7BA890',
  mutedBg:    'var(--line-soft)',
};

const CALL_REASON_META = {
  water:      'Water',
  bill:       'Bill',
  assistance: 'Assistance',
  order:      'Take Order',
};
function reasonLabel(reason) {
  if (!reason) return 'Assistance';
  const k = Object.keys(CALL_REASON_META).find(k => String(reason).toLowerCase().includes(k));
  return k ? CALL_REASON_META[k] : 'Assistance';
}
function orderLabel(o) {
  if (typeof o.orderNumber === 'number' && o.orderNumber > 0) return `#${String(o.orderNumber).padStart(4, '0')}`;
  return '#' + (o.id || '').slice(-4).toUpperCase();
}

function startOfToday() { const d = new Date(); d.setHours(0, 0, 0, 0); return d.getTime() / 1000; }
function startOfWeek()  { const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - d.getDay()); return d.getTime() / 1000; }
function startOfMonth() { const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(1); return d.getTime() / 1000; }

function fmtClock(seconds) {
  if (!seconds) return '—';
  const d = new Date(seconds * 1000);
  const h = d.getHours() % 12 || 12;
  const m = String(d.getMinutes()).padStart(2, '0');
  const ampm = d.getHours() < 12 ? 'AM' : 'PM';
  return `${h}:${m} ${ampm}`;
}
function fmtDate(seconds) {
  if (!seconds) return '';
  const d = new Date(seconds * 1000);
  return `${d.getDate()}/${d.getMonth() + 1}`;
}

export default function HistoryListScreen({
  allCalls, allOrders,
  period, onPeriodChange,
  search, onSearchChange,
  desktop = false,
}) {
  const rangeStart = period === 'today' ? startOfToday()
                   : period === 'week'  ? startOfWeek()
                   : period === 'month' ? startOfMonth()
                   : 0;

  const callsHist = allCalls
    .filter(c => c.status === 'resolved')
    .filter(c => (c.resolvedAt?.seconds || c.createdAt?.seconds || 0) >= rangeStart)
    .map(c => ({
      id: 'call:' + c.id, type: 'call',
      isTakeaway: false,
      table: c.tableNumber || '—',
      label: reasonLabel(c.reason),
      createdSec: c.createdAt?.seconds || 0,
      resolvedSec: c.resolvedAt?.seconds || null,
    }));
  const ordersHist = allOrders
    .filter(o => o.status === 'served')
    .filter(o => (o.updatedAt?.seconds || o.createdAt?.seconds || 0) >= rangeStart)
    .map(o => {
      const isTakeaway = o.orderType === 'takeaway' || o.orderType === 'takeout';
      const itemCount = (o.items || []).length;
      return {
        id: 'serve:' + o.id, type: 'serve', isTakeaway,
        table: isTakeaway ? (o.customerName || 'Pickup') : (o.tableNumber || '—'),
        label: `${orderLabel(o)} · ${itemCount} item${itemCount === 1 ? '' : 's'}`,
        createdSec: o.createdAt?.seconds || 0,
        resolvedSec: o.updatedAt?.seconds || null,
        order: o,
      };
    });

  let combined = [...callsHist, ...ordersHist]
    .sort((a, b) => (b.resolvedSec || 0) - (a.resolvedSec || 0));

  const q = (search || '').trim().toLowerCase();
  if (q) {
    combined = combined.filter(h =>
      String(h.table).toLowerCase().includes(q) || h.label.toLowerCase().includes(q)
    );
  }

  const chips = [
    { id: 'today', label: 'Today' },
    { id: 'week',  label: 'Week' },
    { id: 'month', label: 'Month' },
    { id: 'all',   label: 'All time' },
  ];

  const callsCount  = combined.filter(h => h.type === 'call').length;
  const servesCount = combined.filter(h => h.type === 'serve').length;

  return (
    <div className="screen screen-enter">
      {/* apphead skipped on desktop — ws-head provides the title */}
      {!desktop && (
      <div style={{
        padding: '14px 20px', flexShrink: 0,
        display: 'flex', flexDirection: 'row', alignItems: 'center', gap: 12,
        width: '100%',
      }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontFamily: "'JetBrains Mono', ui-monospace, monospace",
            fontSize: 10, fontWeight: 600, letterSpacing: '0.18em',
            textTransform: 'uppercase', color: COLORS.textFaint,
          }}>Past shifts</div>
          <h1 style={{
            fontFamily: "'Poppins', -apple-system, BlinkMacSystemFont, sans-serif",
            fontWeight: 700, fontSize: 27, letterSpacing: '-0.02em',
            margin: '2px 0 0', color: COLORS.text, lineHeight: 1.1,
          }}>History</h1>
        </div>
      </div>
      )}

      {/* period chips */}
      <div style={{
        padding: '6px 16px 8px', flexShrink: 0,
        display: 'flex', gap: 8, flexWrap: 'wrap',
      }}>
        {chips.map(c => {
          const on = period === c.id;
          return (
            <button
              key={c.id}
              onClick={() => onPeriodChange(c.id)}
              style={{
                padding: '8px 14px', borderRadius: 999,
                border: `1px solid ${on ? COLORS.gold : COLORS.border}`,
                background: on ? COLORS.goldBg : COLORS.card,
                color: on ? COLORS.goldText : COLORS.textMuted,
                fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
                fontSize: 12, fontWeight: 600, cursor: 'pointer',
              }}
            >{c.label}</button>
          );
        })}
      </div>

      {/* search */}
      <div style={{ padding: '0 16px 10px', flexShrink: 0 }}>
        <input
          type="search"
          value={search}
          onChange={e => onSearchChange(e.target.value)}
          placeholder="Search by table or order number"
          style={{
            width: '100%',
            padding: '11px 14px',
            background: COLORS.card,
            border: `1px solid ${COLORS.border}`,
            borderRadius: 11,
            color: COLORS.text,
            fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
            fontSize: 13,
            outline: 'none',
          }}
        />
      </div>

      {/* count summary */}
      {combined.length > 0 && (
        <div style={{
          padding: '0 20px 8px', flexShrink: 0,
          fontFamily: "'JetBrains Mono', ui-monospace, monospace",
          fontSize: 10, fontWeight: 600, letterSpacing: '0.10em',
          textTransform: 'uppercase', color: COLORS.textFaint,
        }}>
          {servesCount} served · {callsCount} {callsCount === 1 ? 'call' : 'calls'} resolved
        </div>
      )}

      <div className="scroll">
        {combined.length === 0 ? (
          <div className="empty">
            <span className="e-emoji">🗓️</span>
            <p>{q
              ? `Nothing matched "${q}". Try clearing the search or widening the date range.`
              : 'No history in this range yet. Try a wider period.'}</p>
          </div>
        ) : (
          <div className="ok-stack-list" style={{
            display: 'flex', flexDirection: 'column', gap: 6,
            padding: '2px 16px 24px',
          }}>
            {combined.map(h => <HistoryRow key={h.id} item={h} />)}
          </div>
        )}
      </div>
    </div>
  );
}

function HistoryRow({ item }) {
  const isCall = item.type === 'call';
  const typeBg = isCall ? COLORS.goldBg : COLORS.greenBg;
  const typeFg = isCall ? COLORS.goldText : COLORS.greenText;
  const typeLabel = isCall ? 'CALL' : 'SERVED';

  // Show date prefix when the resolved time isn't today
  const todaySec = startOfToday();
  const showDate = (item.resolvedSec || 0) < todaySec;

  return (
    <div style={{
      background: COLORS.card,
      borderRadius: 10,
      border: `1px solid ${COLORS.border}`,
      padding: '10px 12px',
      display: 'grid',
      gridTemplateColumns: 'auto 1fr auto',
      gap: 10, alignItems: 'center',
    }}>
      <span style={{
        fontFamily: "'JetBrains Mono', ui-monospace, monospace",
        fontSize: 9, fontWeight: 700, letterSpacing: '0.12em',
        padding: '2px 7px', borderRadius: 4, textTransform: 'uppercase',
        background: typeBg, color: typeFg, whiteSpace: 'nowrap',
      }}>{typeLabel}</span>
      <div style={{ minWidth: 0 }}>
        <div style={{
          fontFamily: "'Poppins', -apple-system, BlinkMacSystemFont, sans-serif",
          fontWeight: 700, fontSize: 13, color: COLORS.text,
          letterSpacing: '-0.2px',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {item.isTakeaway ? `Takeaway · ${item.table}` : `Table ${item.table}`}
        </div>
        <div style={{
          fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
          fontSize: 11, color: COLORS.textMuted,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>{item.label}</div>
      </div>
      <span style={{
        textAlign: 'right',
        fontFamily: "'JetBrains Mono', ui-monospace, monospace",
        fontSize: 11, color: COLORS.textFaint, whiteSpace: 'nowrap',
      }}>
        {showDate ? fmtDate(item.resolvedSec) + ' · ' : ''}{fmtClock(item.resolvedSec)}
      </span>
    </div>
  );
}
