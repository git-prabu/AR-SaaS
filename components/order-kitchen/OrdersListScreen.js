// components/order-kitchen/OrdersListScreen.js
//
// Phase B.3 (2026-06-03) — Today's orders ledger.
//
// Read-only list of every order created today. Filter chips
// (Active / Served / All) so the waiter can answer the common
// "what did table 5 just order?" question without leaving the
// Queue tab.
//
// Card layout mirrors /admin/waiter's Orders tab: a table/customer +
// status + order # + time header, the itemised line-item list, and a
// payment-status + total footer — so the v2 waiter station reads the
// same as the legacy one. The Aspire-light palette becomes the dark
// Order & Kitchen palette here (and flips in light mode via CSS vars).

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
  goldText:   'var(--badge-gold)',
  green:      '#4A8866',
  greenBg:    'rgba(74,136,102,0.14)',
  greenText:  'var(--badge-green)',
  amber:      '#C2562B',
  amberBg:    'rgba(194,86,43,0.14)',
  amberText:  'var(--badge-amber)',
  blue:       '#6E8EAF',
  blueBg:     'rgba(110,142,175,0.14)',
  blueText:   'var(--badge-blue)',
  muted:      'var(--tx-3)',
  mutedBg:    'var(--line-soft)',
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

// Footer payment line — mirrors /admin/waiter's Orders card (checkmark
// once paid, hourglass while a settle is pending, plain "Unpaid" else).
const PAID_LABELS = { paid_cash: '✓ Cash paid', paid_card: '✓ Card paid', paid_online: '✓ UPI paid', paid: '✓ Paid' };
function paymentLine(paymentStatus) {
  if (PAID_LABELS[paymentStatus]) return PAID_LABELS[paymentStatus];
  if (paymentStatus === 'cash_requested')   return '⏳ Cash pending';
  if (paymentStatus === 'card_requested')   return '⏳ Card pending';
  if (paymentStatus === 'online_requested') return '⏳ UPI pending';
  return 'Unpaid';
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

export default function OrdersListScreen({ orders, filter, onFilterChange, desktop = false }) {
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
          }}>Today · live</div>
          <h1 style={{
            fontFamily: "'Poppins', -apple-system, BlinkMacSystemFont, sans-serif",
            fontWeight: 700, fontSize: 27, letterSpacing: '-0.02em',
            margin: '2px 0 0', color: COLORS.text, lineHeight: 1.1,
          }}>Orders</h1>
        </div>
      </div>
      )}

      {/* Filter chips — aligned to the app's 30px content gutter on desktop
          so they line up with the ws-head title and the station toggle. */}
      <div style={{
        padding: desktop ? '2px 30px 14px' : '6px 16px 12px', flexShrink: 0,
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
                // explicit min-width + centered text so a single digit reads as
                // a rounded count pill, not a blank dot (owner: "not visible").
                minWidth: 18, padding: '1px 6px', borderRadius: 999, textAlign: 'center',
                background: on ? 'rgba(0,0,0,0.16)' : 'var(--line-soft)',
                color: on ? COLORS.goldText : COLORS.textFaint,
                fontFamily: "'JetBrains Mono', ui-monospace, monospace",
                fontSize: 10, fontWeight: 700,
              }}>{c.count}</span>
            </button>
          );
        })}
      </div>

      {/* scroll owns overflow only — inner grid owns the 30px gutter so cards
          align with the chips above (avoids .scroll's own padding stacking). */}
      <div className="scroll" style={{ padding: 0 }}>
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
          <div className="ok-stack-list" style={{
            display: 'grid',
            gridTemplateColumns: desktop ? 'repeat(auto-fill, minmax(300px, 1fr))' : '1fr',
            gap: 12,
            padding: desktop ? '4px 30px 28px' : '4px 16px 24px',
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
  const items = Array.isArray(order.items) ? order.items : [];
  const isTakeaway = order.orderType === 'takeaway' || order.orderType === 'takeout';
  const tableLabel = isTakeaway
    ? `📦 Takeaway · ${order.customerName || 'Customer'}`
    : `🍽️ Table ${order.tableNumber || '—'}`;
  const isPaid = PAID.has(order.paymentStatus);
  const total = '₹' + Math.round(Number(order.total) || 0).toLocaleString('en-IN');

  const mono = "'JetBrains Mono', ui-monospace, monospace";
  const sans = "'Inter', -apple-system, BlinkMacSystemFont, sans-serif";
  const disp = "'Poppins', -apple-system, BlinkMacSystemFont, sans-serif";

  return (
    <div style={{
      background: COLORS.card,
      borderRadius: 12,
      border: `1px solid ${COLORS.border}`,
      overflow: 'hidden',
      display: 'flex', flexDirection: 'column',
    }}>
      {/* Header — table/customer, status, order #, time */}
      <div style={{
        padding: '12px 14px', borderBottom: `1px solid ${COLORS.border}`,
        display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10,
      }}>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontFamily: disp, fontSize: 14, fontWeight: 700, color: COLORS.text, letterSpacing: '-0.1px', marginBottom: 5 }}>
            {tableLabel}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span style={{
              fontFamily: mono, fontSize: 10, fontWeight: 700, letterSpacing: '0.12em',
              padding: '2px 7px', borderRadius: 4, textTransform: 'uppercase',
              background: status.bg, color: status.fg,
            }}>{status.label}</span>
            <span style={{ fontFamily: mono, fontSize: 11, color: COLORS.textFaint }}>{orderLabel(order)}</span>
            <span style={{ fontFamily: sans, fontSize: 11, color: COLORS.textFaint }}>· {fmtTime(order.createdAt?.seconds)}</span>
          </div>
        </div>
      </div>

      {/* Items — the "what was ordered" proof */}
      <div style={{ padding: '10px 14px', flex: 1 }}>
        {items.length === 0 ? (
          <div style={{ fontFamily: sans, fontSize: 12, color: COLORS.textFaint, fontStyle: 'italic' }}>No items recorded.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {items.map((it, i) => (
              <div key={i} style={{ display: 'grid', gridTemplateColumns: 'auto 1fr auto', gap: 8, alignItems: 'baseline', fontSize: 12 }}>
                <span style={{ fontFamily: mono, color: COLORS.goldText, fontWeight: 700, minWidth: 26 }}>{it.qty || 1}×</span>
                <span style={{ fontFamily: sans, color: COLORS.text, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {it.name}
                  {it.note ? <span style={{ color: COLORS.textFaint, fontStyle: 'italic' }}> — {it.note}</span> : null}
                </span>
                <span style={{ fontFamily: mono, color: COLORS.textMuted }}>₹{Math.round((Number(it.price) || 0) * (Number(it.qty) || 1)).toLocaleString('en-IN')}</span>
              </div>
            ))}
          </div>
        )}
        {order.specialInstructions && (
          <div style={{ marginTop: 8, padding: '6px 10px', background: 'var(--card-2)', borderRadius: 6, fontFamily: sans, fontSize: 11, color: COLORS.textMuted, fontStyle: 'italic' }}>
            📝 {order.specialInstructions}
          </div>
        )}
      </div>

      {/* Footer — payment status + total */}
      <div style={{
        padding: '10px 14px', borderTop: `1px solid ${COLORS.border}`, background: 'var(--card-2)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <span style={{
          fontFamily: sans, fontSize: 11, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase',
          color: isPaid ? COLORS.greenText : COLORS.textMuted,
        }}>{paymentLine(order.paymentStatus)}</span>
        <span style={{ fontFamily: disp, fontSize: 16, fontWeight: 700, color: COLORS.text, fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.3px' }}>{total}</span>
      </div>
    </div>
  );
}
