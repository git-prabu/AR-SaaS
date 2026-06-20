// components/order-kitchen/TableActionSheet.js
//
// Floor table actions (owner request, 20 Jun 2026). Tapping a table that
// has NO unpaid balance used to jump straight into the menu. Now it opens
// this little sheet so the floor can manage occupancy the way a pro POS
// does — mark a table Seated before any order exists, and explicitly Clear
// it once the bill is paid (frees it for the next party).
//
// Adapts to the table's status (derived in /admin/orders):
//   free   → [Seat guests] (markTableSeated) · [Start order →] (open menu)
//   seated → [Take order →] (open menu)      · [Clear table]  (freeTableSession)
//   ready  → [Clear table]  (freeTableSession) · [Add items]  (open menu)
//
// 'sent' (unpaid orders present) never reaches here — that path opens the
// SettleSheet instead. The parent owns the Firestore writes; this is just
// the chooser. Same absolute bottom-sheet pattern + theme vars as
// SettleSheet, so it renders correctly in both the desktop workspace and
// the mobile phone-frame.

import React, { useState } from 'react';

export default function TableActionSheet({
  table,      // { id, zone, status, occupied, openedAt, _code }
  onSeat,     // async () => mark the table Seated (no order yet)
  onOrder,    // () => open the menu for this table
  onClear,    // async () => free the table for the next party
  onClose,
}) {
  // 'seat' | 'clear' while that async write is in flight (disables the sheet).
  const [busy, setBusy] = useState(null);
  const status = table.status || 'free';
  const tableNum = String(table.id).replace(/^T/i, '');

  // Party size for seating — so the floor's "seated" count reads as the
  // covers (e.g. 3/4), not 0/N. Chips run 1..capacity (capped at 8, the
  // last shows a "+"). Default 2 — the most common walk-in party.
  const seats = Math.max(1, Number(table.seats) || 4);
  const partyMax = Math.min(8, seats);
  const partyChips = Array.from({ length: partyMax }, (_, i) => i + 1);
  const [party, setParty] = useState(Math.min(2, seats));

  const run = async (kind, fn) => {
    if (busy) return;
    setBusy(kind);
    try {
      await fn();
      // parent closes the sheet + toasts on success
    } catch {
      // parent toasts the error; let the user retry
      setBusy(null);
    }
  };

  const sub =
    status === 'seated' ? 'Seated · awaiting order'
    : status === 'ready' ? 'Bill paid · ready to clear'
    : 'Empty';

  // Big stacked action button (icon · title · subtitle) — matches the
  // SettleSheet "choose" stage.
  const Action = ({ icon, title, desc, onClick, primary, disabled, loading }) => (
    <button
      onClick={onClick}
      disabled={disabled || !!busy}
      style={{
        width: '100%', padding: '15px 16px', borderRadius: 13,
        background: primary ? 'var(--accent)' : 'var(--card-2)',
        border: primary ? 'none' : '1px solid var(--line)',
        color: primary ? 'var(--accent-ink)' : 'var(--tx)',
        cursor: (disabled || busy) ? 'not-allowed' : 'pointer', textAlign: 'left',
        fontFamily: 'var(--font-display)', fontWeight: primary ? 700 : 600, fontSize: 15,
        display: 'flex', alignItems: 'center', gap: 12,
        opacity: (disabled || (busy && !loading)) ? 0.5 : 1,
      }}
    >
      <span style={{ fontSize: 18 }}>{loading ? '⏳' : icon}</span>
      <span style={{ flex: 1 }}>
        {loading ? 'Working…' : title}
        {!loading && desc && (
          <span style={{
            display: 'block', fontFamily: 'var(--font-body)', fontWeight: primary ? 500 : 400,
            fontSize: 12, color: primary ? 'rgba(26,24,21,0.7)' : 'var(--tx-2)', marginTop: 2,
          }}>{desc}</span>
        )}
      </span>
    </button>
  );

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

        {/* Header — table + state */}
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
          <span style={{
            fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 20, color: 'var(--tx)',
          }}>Table {tableNum}</span>
          <span style={{
            fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--tx-3)',
            textTransform: 'uppercase', letterSpacing: '0.08em',
          }}>{table.zone}</span>
          <span style={{
            marginLeft: 'auto',
            fontFamily: 'var(--font-body)', fontSize: 12.5,
            color: status === 'ready' ? 'var(--st-ready)' : status === 'seated' ? 'var(--st-seated, var(--gold))' : 'var(--tx-2)',
            fontWeight: 600,
          }}>{sub}</span>
        </div>

        {/* Status-adaptive actions */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {status === 'free' && (
            <>
              {/* Party size — keeps the floor's seated count honest (covers/seats) */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <span style={{
                  fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 700,
                  letterSpacing: '0.10em', textTransform: 'uppercase', color: 'var(--tx-2)',
                }}>Party size</span>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {partyChips.map(n => {
                    const on = party === n;
                    const plus = n === partyMax && seats > partyMax;
                    return (
                      <button key={n} onClick={() => setParty(n)} disabled={!!busy} style={{
                        minWidth: 42, padding: '9px 10px', borderRadius: 10,
                        background: on ? 'var(--accent)' : 'var(--card-2)',
                        color: on ? 'var(--accent-ink)' : 'var(--tx)',
                        border: `1px solid ${on ? 'var(--accent)' : 'var(--line)'}`,
                        cursor: busy ? 'not-allowed' : 'pointer',
                        fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 14,
                      }}>{n}{plus ? '+' : ''}</button>
                    );
                  })}
                </div>
              </div>
              <Action icon="🪑" title={`Seat ${party} ${party === 1 ? 'guest' : 'guests'}`} desc="Mark occupied — take the order later"
                primary onClick={() => run('seat', () => onSeat(party))} loading={busy === 'seat'} />
              <Action icon="🍽" title="Start order →" desc="Open the menu and take the order now"
                onClick={() => { onClose(); onOrder(); }} />
            </>
          )}

          {status === 'seated' && (
            <>
              <Action icon="🍽" title="Take order →" desc="Open the menu for this table"
                primary onClick={() => { onClose(); onOrder(); }} />
              <Action icon="🧹" title="Clear table" desc="Guests left without ordering — free it"
                onClick={() => run('clear', onClear)} loading={busy === 'clear'} />
            </>
          )}

          {status === 'ready' && (
            <>
              <Action icon="✓" title="Clear table" desc="Bill is paid — free it for the next guests"
                primary onClick={() => run('clear', onClear)} loading={busy === 'clear'} />
              <Action icon="🍽" title="Add items" desc="They're ordering a bit more"
                onClick={() => { onClose(); onOrder(); }} />
            </>
          )}
        </div>
      </div>
    </div>
  );
}
