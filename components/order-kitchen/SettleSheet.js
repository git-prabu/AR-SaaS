// components/order-kitchen/SettleSheet.js
//
// Settle-from-Orders flow (owner request, 12 Jun 2026): previously the
// Payments page was the ONLY place a table's bill could be settled.
// Now tapping an occupied table with an unpaid balance on /admin/orders
// opens this sheet:
//
//   Stage 'choose'  — "Add items" (continue to the menu, the old
//                     pickTable behaviour) or "Settle bill".
//   Stage 'settle'  — method picker (Cash / UPI / Card) + confirm.
//
// The parent owns the actual payment writes (markOrderPaid per unpaid
// order — sequentially, so lib/db's _autoCloseBillIfAllPaid sees the
// final state and closes the bill + frees the table on the last one).
//
// Rendering: same absolute bottom-sheet pattern as ActionQueueScreen's
// CashModal — proven to position correctly inside both the desktop
// workspace and the mobile phone-frame. All surfaces use theme vars;
// the only literals are the fixed brand accents (gold/green/blue) with
// their fixed-contrast text, which read correctly in both themes.

import React, { useState } from 'react';

const METHODS = [
  { id: 'cash', label: 'Cash', icon: '💵', bg: '#C4A86D', fg: '#1A1815', paid: 'paid_cash' },
  { id: 'upi',  label: 'UPI',  icon: '📱', bg: '#4A8866', fg: '#EFEBE4', paid: 'paid_online' },
  { id: 'card', label: 'Card', icon: '💳', bg: '#6E8EAF', fg: '#EFEBE4', paid: 'paid_card' },
];

const rupee = (n) => '₹' + Math.round(Number(n) || 0).toLocaleString('en-IN');

export default function SettleSheet({
  table,        // { id, zone, ... } — the floor-token table object
  orders,       // live UNPAID orders on this table's bill
  total,        // unpaid total (₹)
  onAddItems,   // () => open the menu for this table (old behaviour)
  onSettle,     // async (paidStatus, methodLabel) => mark everything paid
  onClose,
}) {
  const [stage, setStage] = useState('choose');
  const [method, setMethod] = useState(null); // METHODS entry
  const [busy, setBusy] = useState(false);

  const confirm = async () => {
    if (!method || busy) return;
    setBusy(true);
    try {
      await onSettle(method.paid, method.label);
      // parent closes the sheet on success
    } catch {
      // parent toasts the error; let the user retry
      setBusy(false);
    }
  };

  const count = orders.length;

  return (
    <div
      onClick={busy ? undefined : onClose}
      style={{
        position: 'absolute', inset: 0, zIndex: 80,
        background: 'rgba(0,0,0,0.72)',
        display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: '100%', maxWidth: 430,
          background: 'var(--card)',
          borderRadius: '22px 22px 0 0',
          border: '1px solid var(--line)', borderBottom: 'none',
          padding: '14px 18px 26px',
          display: 'flex', flexDirection: 'column', gap: 14,
        }}
      >
        <div style={{
          width: 36, height: 4, borderRadius: 2,
          background: 'var(--line)', alignSelf: 'center',
        }} />

        {/* Header — table + unpaid balance */}
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
          <span style={{
            fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 20,
            color: 'var(--tx)',
          }}>Table {String(table.id).replace(/^T/i, '')}</span>
          <span style={{
            fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--tx-3)',
            textTransform: 'uppercase', letterSpacing: '0.08em',
          }}>{table.zone}</span>
          <span style={{
            marginLeft: 'auto',
            fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 20,
            color: 'var(--gold)',
          }}>{rupee(total)}</span>
        </div>
        <div style={{
          fontFamily: 'var(--font-body)', fontSize: 12.5, color: 'var(--tx-2)',
          marginTop: -8,
        }}>
          {count} unpaid order{count === 1 ? '' : 's'} on this table
        </div>

        {stage === 'choose' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <button
              onClick={() => { onClose(); onAddItems(); }}
              style={{
                width: '100%', padding: '15px 16px', borderRadius: 13,
                background: 'var(--card-2)', border: '1px solid var(--line)',
                color: 'var(--tx)', cursor: 'pointer', textAlign: 'left',
                fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 15,
                display: 'flex', alignItems: 'center', gap: 12,
              }}
            >
              <span style={{ fontSize: 18 }}>🍽</span>
              <span style={{ flex: 1 }}>
                Add items
                <span style={{ display: 'block', fontFamily: 'var(--font-body)', fontWeight: 400, fontSize: 12, color: 'var(--tx-2)', marginTop: 2 }}>
                  Open the menu and add to this table's order
                </span>
              </span>
            </button>
            <button
              onClick={() => setStage('settle')}
              style={{
                width: '100%', padding: '15px 16px', borderRadius: 13,
                background: 'var(--accent)', border: 'none',
                color: 'var(--accent-ink)', cursor: 'pointer', textAlign: 'left',
                fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 15,
                display: 'flex', alignItems: 'center', gap: 12,
              }}
            >
              <span style={{ fontSize: 18 }}>₹</span>
              <span style={{ flex: 1 }}>
                Settle bill
                <span style={{ display: 'block', fontFamily: 'var(--font-body)', fontWeight: 500, fontSize: 12, color: 'rgba(26,24,21,0.7)', marginTop: 2 }}>
                  Collect {rupee(total)} and close the table
                </span>
              </span>
            </button>
          </div>
        )}

        {stage === 'settle' && (
          <>
            <div style={{ display: 'flex', gap: 8 }}>
              {METHODS.map(m => {
                const on = method?.id === m.id;
                return (
                  <button
                    key={m.id}
                    onClick={() => setMethod(m)}
                    disabled={busy}
                    style={{
                      flex: 1, padding: '14px 8px', borderRadius: 13,
                      background: on ? m.bg : 'var(--card-2)',
                      border: `1px solid ${on ? m.bg : 'var(--line)'}`,
                      color: on ? m.fg : 'var(--tx)',
                      cursor: 'pointer',
                      fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 14,
                      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5,
                    }}
                  >
                    <span style={{ fontSize: 20 }}>{m.icon}</span>
                    {m.label}
                  </button>
                );
              })}
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button
                onClick={() => (busy ? null : setStage('choose'))}
                disabled={busy}
                style={{
                  flex: 1, padding: '13px', borderRadius: 11,
                  background: 'var(--card-2)', border: '1px solid var(--line)',
                  color: 'var(--tx)', cursor: 'pointer',
                  fontFamily: 'var(--font-body)', fontSize: 13, fontWeight: 600,
                  opacity: busy ? 0.6 : 1,
                }}
              >Back</button>
              <button
                onClick={confirm}
                disabled={!method || busy}
                style={{
                  flex: 2, padding: '13px', borderRadius: 11, border: 'none',
                  background: method ? 'var(--accent)' : 'var(--card-3)',
                  color: method ? 'var(--accent-ink)' : 'var(--tx-3)',
                  cursor: method && !busy ? 'pointer' : 'not-allowed',
                  fontFamily: 'var(--font-display)', fontSize: 14, fontWeight: 700,
                  opacity: busy ? 0.6 : 1,
                }}
              >
                {busy ? 'Settling…' : method ? `Confirm ${rupee(total)} · ${method.label}` : 'Pick a method'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
