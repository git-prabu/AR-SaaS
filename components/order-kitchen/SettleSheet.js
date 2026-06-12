// components/order-kitchen/SettleSheet.js
//
// Settle-from-Orders flow (owner request, 12 Jun 2026; v2 same day):
// previously the Payments page was the ONLY place a table's bill could
// be settled. Tapping an occupied table with an unpaid balance on
// /admin/orders opens this sheet:
//
//   Stage 'choose'  — "Add items" (continue to the menu, the old
//                     pickTable behaviour) or "Settle bill".
//   Stage 'settle'  — method picker (Cash / UPI / Card):
//       cash → received-amount calculator with change-back display
//              (extras {cashReceived, changeGiven} ride to markOrderPaid
//              for the day-close cash reconciliation)
//       upi  → QR code for the restaurant's UPI ID with the EXACT
//              amount pre-filled (upi://pay?...&am=) — customer scans
//              the waiter's phone/tab, waiter confirms once the
//              payment-success screen is shown
//       card → straight confirm
//
// 🖨 Print bill is available at every stage (header button) — reuses
// lib/printKot's printBill() (80mm thermal HTML + popup chrome that
// survives iOS PWA windows) via the onPrintBill callback the parent
// wires to printBill + markBillPrinted.
//
// The parent owns the payment writes (markOrderPaid per unpaid order —
// sequentially, so lib/db's _autoCloseBillIfAllPaid sees the final
// state and closes the bill + frees the table on the last one).
//
// Rendering: same absolute bottom-sheet pattern as ActionQueueScreen's
// CashModal — proven inside both the desktop workspace and the mobile
// phone-frame. All surfaces use theme vars; the only literals are the
// fixed brand accents (gold/green/blue) with fixed-contrast text, and
// the QR card which is always white (QR codes need a white quiet zone
// in BOTH themes for scanners).

import React, { useEffect, useState } from 'react';
import QRCode from 'qrcode';

const METHODS = [
  { id: 'cash', label: 'Cash', icon: '💵', bg: '#C4A86D', fg: '#1A1815', paid: 'paid_cash' },
  { id: 'upi',  label: 'UPI',  icon: '📱', bg: '#4A8866', fg: '#EFEBE4', paid: 'paid_online' },
  { id: 'card', label: 'Card', icon: '💳', bg: '#6E8EAF', fg: '#EFEBE4', paid: 'paid_card' },
];

const rupee = (n) => '₹' + Math.round(Number(n) || 0).toLocaleString('en-IN');

export default function SettleSheet({
  table,        // { id, zone, _code, ... } — the floor-token table object
  orders,       // live UNPAID orders on this table's bill
  total,        // unpaid total (₹)
  restaurant,   // restaurant doc — upiId + name for the UPI QR
  onAddItems,   // () => open the menu for this table (old behaviour)
  onSettle,     // async (paidStatus, methodLabel, extras) => mark everything paid
  onPrintBill,  // () => print the outstanding bill from this device
  onClose,
}) {
  const [stage, setStage] = useState('choose');
  const [method, setMethod] = useState(null); // METHODS entry
  const [busy, setBusy] = useState(false);

  // ── Cash calculator state ───────────────────────────────────────
  const [received, setReceived] = useState('');
  const receivedNum = Number(received) || 0;
  const change = receivedNum - total;
  const cashOk = receivedNum >= Math.round(total);
  // Sensible quick-fill chips: exact, then the next common notes up.
  const chips = [...new Set([
    Math.round(total),
    Math.ceil(total / 100) * 100,
    Math.ceil(total / 500) * 500,
    Math.ceil(total / 2000) * 2000,
  ])].filter(v => v >= Math.round(total)).slice(0, 4);

  // ── UPI QR ──────────────────────────────────────────────────────
  const upiId = (restaurant?.upiId || '').trim();
  const [qrDataUrl, setQrDataUrl] = useState(null);
  useEffect(() => {
    if (method?.id !== 'upi' || !upiId) { setQrDataUrl(null); return; }
    // Same upi:// URI convention the customer page uses
    // (pages/restaurant/[subdomain] runUpiPayment) — pa/pn/am/cu/tn.
    const tn = `Table ${String(table.id).replace(/^T/i, '')} bill`;
    const uri = `upi://pay?pa=${encodeURIComponent(upiId)}&pn=${encodeURIComponent(restaurant?.name || 'Restaurant')}&am=${Math.round(total)}&cu=INR&tn=${encodeURIComponent(tn)}`;
    let alive = true;
    QRCode.toDataURL(uri, { margin: 1, width: 240 })
      .then(url => { if (alive) setQrDataUrl(url); })
      .catch(() => { if (alive) setQrDataUrl(null); });
    return () => { alive = false; };
  }, [method?.id, upiId, total, table.id, restaurant?.name]);

  const confirm = async () => {
    if (!method || busy) return;
    if (method.id === 'cash' && !cashOk) return;
    setBusy(true);
    try {
      const extras = method.id === 'cash'
        ? { cashReceived: receivedNum, changeGiven: Math.max(0, Math.round(change)) }
        : {};
      await onSettle(method.paid, method.label, extras);
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
          maxHeight: '92%', overflowY: 'auto',
          background: 'var(--card)',
          borderRadius: '22px 22px 0 0',
          border: '1px solid var(--line)', borderBottom: 'none',
          padding: '14px 18px 26px',
          display: 'flex', flexDirection: 'column', gap: 14,
        }}
      >
        <div style={{
          width: 36, height: 4, borderRadius: 2,
          background: 'var(--line)', alignSelf: 'center', flexShrink: 0,
        }} />

        {/* Header — table + unpaid balance + print */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
              <span style={{
                fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 20,
                color: 'var(--tx)',
              }}>Table {String(table.id).replace(/^T/i, '')}</span>
              <span style={{
                fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--tx-3)',
                textTransform: 'uppercase', letterSpacing: '0.08em',
              }}>{table.zone}</span>
            </div>
            <div style={{ fontFamily: 'var(--font-body)', fontSize: 12.5, color: 'var(--tx-2)', marginTop: 2 }}>
              {count} unpaid order{count === 1 ? '' : 's'} · {rupee(total)}
            </div>
          </div>
          {/* Print the outstanding bill — available at every stage so
              the classic "bill first, then pay" flow works. */}
          <button
            onClick={onPrintBill}
            title="Print bill"
            aria-label="Print bill"
            style={{
              width: 44, height: 44, borderRadius: 12, flexShrink: 0,
              background: 'var(--card-2)', border: '1px solid var(--line)',
              color: 'var(--tx)', cursor: 'pointer', fontSize: 19,
            }}
          >🖨</button>
          <span style={{
            fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 22,
            color: 'var(--gold)', flexShrink: 0,
          }}>{rupee(total)}</span>
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
            {/* Method picker */}
            <div style={{ display: 'flex', gap: 8 }}>
              {METHODS.map(m => {
                const on = method?.id === m.id;
                return (
                  <button
                    key={m.id}
                    onClick={() => setMethod(m)}
                    disabled={busy}
                    style={{
                      flex: 1, padding: '13px 8px', borderRadius: 13,
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

            {/* ── CASH: received + change calculator ── */}
            {method?.id === 'cash' && (
              <div style={{
                background: 'var(--card-2)', border: '1px solid var(--line)',
                borderRadius: 13, padding: '14px 14px 12px',
                display: 'flex', flexDirection: 'column', gap: 10,
              }}>
                <label style={{
                  fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 700,
                  letterSpacing: '0.10em', textTransform: 'uppercase', color: 'var(--tx-2)',
                }}>Cash received</label>
                <input
                  inputMode="numeric"
                  value={received}
                  onChange={e => setReceived(e.target.value.replace(/[^\d]/g, '').slice(0, 7))}
                  placeholder={String(Math.round(total))}
                  autoFocus
                  style={{
                    width: '100%', padding: '12px 14px', boxSizing: 'border-box',
                    fontFamily: 'var(--font-mono)', fontSize: 20, fontWeight: 700,
                    background: 'var(--card)', color: 'var(--tx)',
                    border: '1px solid var(--line)', borderRadius: 10, outline: 'none',
                  }}
                />
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {chips.map(v => (
                    <button key={v} onClick={() => setReceived(String(v))} style={{
                      padding: '6px 12px', borderRadius: 999,
                      background: Number(received) === v ? 'var(--accent)' : 'var(--card)',
                      color: Number(received) === v ? 'var(--accent-ink)' : 'var(--tx-2)',
                      border: '1px solid var(--line)', cursor: 'pointer',
                      fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 700,
                    }}>{rupee(v)}</button>
                  ))}
                </div>
                <div style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
                  paddingTop: 8, borderTop: '1px solid var(--line)',
                }}>
                  <span style={{ fontFamily: 'var(--font-body)', fontSize: 13, color: 'var(--tx-2)' }}>
                    Change to return
                  </span>
                  <span style={{
                    fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 20,
                    color: received === '' ? 'var(--tx-3)' : (change < 0 ? 'var(--danger)' : 'var(--st-ready)'),
                  }}>
                    {received === '' ? '—' : (change < 0 ? `${rupee(Math.abs(change))} short` : rupee(change))}
                  </span>
                </div>
              </div>
            )}

            {/* ── UPI: QR with exact amount ── */}
            {method?.id === 'upi' && (
              upiId ? (
                <div style={{
                  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8,
                  // Always-white card: QR scanners need a white quiet zone
                  // regardless of app theme.
                  background: '#FFFFFF', borderRadius: 13, padding: '16px 14px 12px',
                  border: '1px solid var(--line)',
                }}>
                  {qrDataUrl ? (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img src={qrDataUrl} alt={`UPI QR — pay ${rupee(total)} to ${upiId}`}
                      style={{ width: 200, height: 200 }} />
                  ) : (
                    <div style={{ width: 200, height: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#999', fontFamily: 'var(--font-body)', fontSize: 12 }}>
                      Generating QR…
                    </div>
                  )}
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 700, color: '#1A1815' }}>{upiId}</div>
                  <div style={{ fontFamily: 'var(--font-body)', fontSize: 12, color: '#666' }}>
                    Customer scans with any UPI app · amount {rupee(total)} is pre-filled
                  </div>
                </div>
              ) : (
                <div style={{
                  background: 'var(--card-2)', border: '1px solid var(--line)',
                  borderRadius: 13, padding: '16px 14px',
                  fontFamily: 'var(--font-body)', fontSize: 13, color: 'var(--tx-2)', lineHeight: 1.5,
                }}>
                  No UPI ID is set for this restaurant yet. The owner can add
                  it in <b style={{ color: 'var(--tx)' }}>Payment Gateway</b> settings — then the QR
                  appears here with the amount pre-filled. You can still confirm
                  a UPI payment received some other way.
                </div>
              )
            )}

            {/* Confirm row */}
            <div style={{ display: 'flex', gap: 10 }}>
              <button
                onClick={() => (busy ? null : (setMethod(null), setReceived(''), setStage('choose')))}
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
                disabled={!method || busy || (method?.id === 'cash' && !cashOk)}
                style={{
                  flex: 2, padding: '13px', borderRadius: 11, border: 'none',
                  background: method && !(method.id === 'cash' && !cashOk) ? 'var(--accent)' : 'var(--card-3)',
                  color: method && !(method.id === 'cash' && !cashOk) ? 'var(--accent-ink)' : 'var(--tx-3)',
                  cursor: method && !busy && !(method.id === 'cash' && !cashOk) ? 'pointer' : 'not-allowed',
                  fontFamily: 'var(--font-display)', fontSize: 14, fontWeight: 700,
                  opacity: busy ? 0.6 : 1,
                }}
              >
                {busy ? 'Settling…'
                  : !method ? 'Pick a method'
                  : method.id === 'cash' ? (cashOk ? `Confirm ${rupee(total)} · Cash` : 'Enter amount received')
                  : method.id === 'upi' ? `Payment received · ${rupee(total)}`
                  : `Confirm ${rupee(total)} · Card`}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
