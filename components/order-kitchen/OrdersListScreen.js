// components/order-kitchen/OrdersListScreen.js
//
// Phase B.3 (2026-06-03) — Today's orders ledger.
//
// Read-only list of every order created today. Filter chips
// (Active / Served / All) so the waiter can answer the common
// "what did table 5 just order?" question without leaving the
// Queue tab.
//
// Mirrors what /admin/waiter shows under its Orders tab — same
// filter semantics, same status badges. The Aspire-light palette
// becomes the dark Order & Kitchen palette here.
//
// All inline styles for the apphead (no .apphead-row className —
// it has a layout bug in production; FloorScreen / KitchenScreen
// / ReviewScreen all dodge it the same way).

import React from 'react';

const COLORS = {
  text:       '#EFEBE4',
  textMuted:  'rgba(239,235,228,0.55)',
  textFaint:  'rgba(239,235,228,0.38)',
  card:       '#221F1B',
  border:     'rgba(196,168,109,0.13)',
  gold:       '#C4A86D',
  goldBg:     'rgba(196,168,109,0.14)',
  goldText:   '#D6BC85',
  green:      '#4A8866',
  greenBg:    'rgba(74,136,102,0.14)',
  greenText:  '#7BA890',
  amber:      '#C2562B',
  amberBg:    'rgba(194,86,43,0.14)',
  amberText:  '#D8783C',
  blue:       '#6E8EAF',
  blueBg:     'rgba(110,142,175,0.14)',
  blueText:   '#8FA8C2',
  muted:      '#5A554E',
  mutedBg:    'rgba(255,255,255,0.04)',
};

const PAID = new Set(['paid_cash', 'paid_card', 'paid_online', 'paid']);
const ACTIVE_STATUSES = new Set(['pending', 'preparing', 'ready']);

function statusBadge(status) {
  if (status === 'pending')   return { label: 'Placed',   bg: COLORS.goldBg,  fg: COLORS.goldText };
  if (status === 'preparing') return { label: 'Cooking',  bg: COLORS.amberBg, fg: COLORS.amberText };
  if (status === 'ready')     return { label: 'Ready',    bg: COLORS.greenBg, fg: COLORS.greenText };
  if (status === 'served')    return { label: 'Served',   bg: COLORS.mutedBg, fg: COLORS.textMuted };
  if (status === 'cancelled') return { label: 'Cancelled', bg: COLORS.mutedBg, fg: COLORS.textFaint };
  return { label: status, bg: COLORS.mutedBg, fg: COLORS.textMuted };
}

function paymentBadge(paymentStatus) {
  if (PAID.has(paymentStatus)) {
    const method = paymentStatus.replace('paid_', '').toUpperCase();
    return { label: method === 'PAID' ? 'PAID' : `PAID · ${method}`, bg: COLORS.greenBg, fg: COLORS.greenText };
  }
  if (/_requested$/.test(paymentStatus || '')) return { label: 'PAYMENT REQUESTED', bg: COLORS.amberBg, fg: COLORS.amberText };
  return null;
}

function fmtTime(seconds) {
  if (!seconds) return '—';
  const d = new Date(seconds * 1000);
  const h = d.getHours() % 12 || 12;
  const m = String(d.getMinutes()).padStart(2, '0');
  const ampm = d.getHours() < 12 ? 'AM' : 'PM';
  return `${h}:${m} ${ampm}`;
}

function orderLabel(o) {
  if (typeof o.orderNumber === 'number' && o.orderNumber > 0) return `#${String(o.orderNumber).padStart(4, '0')}`;
  return '#' + (o.id || '').slice(-4).toUpperCase();
}

export default function OrdersListScreen({ orders, filter, onFilterChange }) {
  const startOfTodaySec = (() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d.getTime() / 1000; })();
  const today = orders.filter(o =>
    (o.createdAt?.seconds || 0) >= startOfTodaySec
    && o.status !== 'cancelled' && o.status !== 'awaiting_payment'
  );

  const counts = {
    active: today.filter(o => ACTIVE_STATUSES.has(o.status)).length,
    served: today.filter(o => o.status === 'served').length,
    all:    today.length,
  };

  const visible = today
    .filter(o => {
      if (filter === 'active') return ACTIVE_STATUSES.has(o.status);
      if (filter === 'served') return o.status === 'served';
      return true;
    })
    .sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));

  const chips = [
    { id: 'active', label: 'Active', count: counts.active },
    { id: 'served', label: 'Served', count: counts.served },
    { id: 'all',    label: 'All',    count: counts.all },
  ];

  return (
    <div className="screen screen-enter">
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
          }}>Today · live</div>
          <h1 style={{
            fontFamily: "'Poppins', -apple-system, BlinkMacSystemFont, sans-serif",
            fontWeight: 700, fontSize: 27, letterSpacing: '-0.02em',
            margin: '2px 0 0', color: COLORS.text, lineHeight: 1.1,
          }}>Orders</h1>
        </div>
      </div>

      <div style={{
        padding: '6px 16px 12px', flexShrink: 0,
        display: 'flex', gap: 8, flexWrap: 'wrap',
      }}>
        {chips.map(c => {
          const on = filter === c.id;
          return (
            <button
              key={c.id}
              onClick={() => onFilterChange(c.id)}
              style={{
                padding: '8px 14px', borderRadius: 999,
                border: `1px solid ${on ? COLORS.gold : COLORS.border}`,
                background: on ? COLORS.goldBg : COLORS.card,
                color: on ? COLORS.goldText : COLORS.textMuted,
                fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
                fontSize: 12, fontWeight: 600, cursor: 'pointer',
                letterSpacing: '-0.1px',
                display: 'inline-flex', alignItems: 'center', gap: 6,
              }}
            >
              {c.label}
              <span style={{
                padding: '1px 6px', borderRadius: 999,
                background: on ? 'rgba(0,0,0,0.32)' : 'rgba(255,255,255,0.06)',
                fontFamily: "'JetBrains Mono', ui-monospace, monospace",
                fontSize: 10, fontWeight: 700,
              }}>{c.count}</span>
            </button>
          );
        })}
      </div>

      <div className="scroll">
        {visible.length === 0 ? (
          <div className="empty">
            <span className="e-emoji">📒</span>
            <p>{
              filter === 'active' ? 'No active orders right now. New tickets show up here as the kitchen receives them.'
              : filter === 'served' ? 'Nothing has been served today yet.'
              : 'No orders today yet.'
            }</p>
          </div>
        ) : (
          <div style={{
            display: 'flex', flexDirection: 'column', gap: 8,
            padding: '4px 16px 24px',
          }}>
            {visible.map(o => <OrderCard key={o.id} order={o} />)}
          </div>
        )}
      </div>
    </div>
  );
}

function OrderCard({ order }) {
  const status = statusBadge(order.status);
  const payment = paymentBadge(order.paymentStatus);
  const itemCount = Array.isArray(order.items) ? order.items.reduce((s, i) => s + (Number(i.qty) || 1), 0) : 0;
  const isTakeaway = order.orderType === 'takeaway' || order.orderType === 'takeout';
  const tableLabel = isTakeaway ? (order.customerName || 'Pickup') : (order.tableNumber ? `Table ${order.tableNumber}` : '—');
  const total = '₹' + Math.round(Number(order.total) || 0).toLocaleString('en-IN');

  return (
    <div style={{
      background: COLORS.card,
      borderRadius: 12,
      border: `1px solid ${COLORS.border}`,
      padding: '12px 14px',
      display: 'flex', flexDirection: 'column', gap: 8,
    }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
        <span style={{
          fontFamily: "'JetBrains Mono', ui-monospace, monospace",
          fontWeight: 700, fontSize: 13, color: COLORS.gold,
          letterSpacing: '-0.2px',
        }}>{orderLabel(order)}</span>
        <span style={{
          fontFamily: "'Poppins', -apple-system, BlinkMacSystemFont, sans-serif",
          fontWeight: 700, fontSize: 14, color: COLORS.text,
        }}>{isTakeaway ? `Takeaway · ${tableLabel}` : tableLabel}</span>
        <span style={{
          fontFamily: "'JetBrains Mono', ui-monospace, monospace",
          fontSize: 10, fontWeight: 700, letterSpacing: '0.12em',
          padding: '2px 7px', borderRadius: 4, textTransform: 'uppercase',
          background: status.bg, color: status.fg,
        }}>{status.label}</span>
        {payment && (
          <span style={{
            fontFamily: "'JetBrains Mono', ui-monospace, monospace",
            fontSize: 10, fontWeight: 700, letterSpacing: '0.12em',
            padding: '2px 7px', borderRadius: 4, textTransform: 'uppercase',
            background: payment.bg, color: payment.fg,
          }}>{payment.label}</span>
        )}
        <span style={{
          marginLeft: 'auto',
          fontFamily: "'JetBrains Mono', ui-monospace, monospace",
          fontSize: 11, color: COLORS.textFaint,
        }}>{fmtTime(order.createdAt?.seconds)}</span>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{
          flex: 1,
          fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
          fontSize: 12, color: COLORS.textMuted,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {itemCount} {itemCount === 1 ? 'item' : 'items'}
          {Array.isArray(order.items) && order.items.length > 0 && (
            <span> · {order.items.slice(0, 3).map(i => i.name).filter(Boolean).join(' · ')}
              {order.items.length > 3 && ` · +${order.items.length - 3} more`}
            </span>
          )}
        </div>
        <span style={{
          fontFamily: "'Poppins', -apple-system, BlinkMacSystemFont, sans-serif",
          fontWeight: 700, fontSize: 15, color: COLORS.text,
          fontVariantNumeric: 'tabular-nums',
        }}>{total}</span>
      </div>
    </div>
  );
}
