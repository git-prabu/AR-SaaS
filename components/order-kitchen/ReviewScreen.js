// components/order-kitchen/ReviewScreen.js
//
// Direct 1:1 port of the Claude Design prototype's review.jsx.
// Two exports: ReviewScreen (cart grouped by seat + send footer)
// and ConfirmScreen (sent confirmation with ring+check animation).

import React from 'react';
import { I, rupee, VegMark, SpicePips } from './Icons';

export default function ReviewScreen({ table, lines, onBack, onEdit, onRemove, onStep, onAddMore, onSend }) {
  const count = lines.reduce((s, l) => s + l.qty, 0);
  const subtotal = lines.reduce((s, l) => s + l.qty * l.price, 0);
  const tax = Math.round(subtotal * 0.05);
  const total = subtotal + tax;

  // group by seat (0 = whole table)
  const seatsPresent = [...new Set(lines.map(l => l.seat))].sort((a, b) => a - b);

  return (
    <div className="screen screen-back">
      <div className="apphead">
        <div className="apphead-row">
          <button className="iconbtn" onClick={onBack}>{I.back}</button>
          <div style={{ flex: 1 }}>
            <div className="eyebrow">{table.id} · {table.zone}</div>
            <h1 className="h-screen" style={{ fontSize: 23 }}>Review order</h1>
          </div>
          <div className="table-pill" style={{ padding: '7px 14px' }}>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--tx-2)' }}>{count} items</span>
          </div>
        </div>
      </div>

      <div className="scroll">
        {lines.length === 0 ? (
          <div className="empty">
            <span className="e-emoji">🍽</span>
            <p>No items yet. Head back to the menu to start the order.</p>
            <button className="cta" style={{ flex: 'none', padding: '13px 24px' }} onClick={onAddMore}>Browse menu</button>
          </div>
        ) : (
          <div className="review-scroll">
            {seatsPresent.map(seat => {
              const segLines = lines.filter(l => l.seat === seat);
              const segSum = segLines.reduce((s, l) => s + l.qty * l.price, 0);
              return (
                <div className="seat-group" key={seat}>
                  <div className="seat-group-head">
                    <span className="seat-badge">{seat === 0 ? '🍽' : seat}</span>
                    <span className="sg-label">{seat === 0 ? 'Whole table' : `Seat ${seat}`}</span>
                    <span className="sg-sum">{rupee(segSum)}</span>
                  </div>
                  {segLines.map(l => (
                    <div className="lineitem" key={l.uid}>
                      <span className="li-qty">{l.qty}×</span>
                      <div className="li-body">
                        <div className="li-name"><VegMark veg={l.veg} />{l.name}{l.spice > 0 && <SpicePips level={l.spice} />}</div>
                        {(l.notes && l.notes.length > 0) && (
                          <div className="li-mods">
                            {l.notes.map((n, i) => <span className="li-modtag" key={i}>{n}</span>)}
                          </div>
                        )}
                        <div className="li-actions">
                          <div className="stepper" style={{ marginRight: 4 }}>
                            <button onClick={() => onStep(l.uid, -1)}>{I.minus}</button>
                            <span className="qty">{l.qty}</span>
                            <button onClick={() => onStep(l.uid, +1)}>{I.plus}</button>
                          </div>
                          <button className="li-act" onClick={() => onEdit(l)}>{I.edit}</button>
                          <button className="li-act del" onClick={() => onRemove(l.uid)}>{I.trash}</button>
                        </div>
                      </div>
                      <span className="li-price">{rupee(l.qty * l.price)}</span>
                    </div>
                  ))}
                </div>
              );
            })}

            <button className="opt" style={{ marginTop: 18, width: '100%', justifyContent: 'center', padding: '13px' }} onClick={onAddMore}>
              {I.plus} Add more items
            </button>

            <div className="totals">
              <div className="trow"><span>Subtotal</span><span>{rupee(subtotal)}</span></div>
              <div className="trow"><span>GST (5%)</span><span>{rupee(tax)}</span></div>
              <div className="trow grand"><span>Total</span><span><span className="cur">₹</span>{total.toLocaleString('en-IN')}</span></div>
            </div>
            <div style={{ height: 16 }} />
          </div>
        )}
      </div>

      {lines.length > 0 && (
        <div className="send-footer">
          <button className="orderbar" onClick={() => onSend(total)} style={{ background: 'var(--accent)' }}>
            <div className="ob-l">
              <span className="ob-count">Send to kitchen</span>
              <span className="ob-sub">{count} items · {table.id}</span>
            </div>
            <span className="ob-r">{I.send} {rupee(total)}</span>
          </button>
        </div>
      )}
    </div>
  );
}

/* ── Sent confirmation ────────────────────────────────────── */
export function ConfirmScreen({ ticket, onNewOrder, onViewKitchen }) {
  return (
    <div className="screen screen-enter">
      <div className="confirm">
        <div className="ring"><span className="check">{I.check}</span></div>
        <h2>Order sent</h2>
        <p className="c-sub">Ticket {ticket.id} is on the kitchen rail for {ticket.table}.</p>

        <div className="ticket-meta">
          <div className="tm-card"><div className="tm-k">Ticket</div><div className="tm-v">{ticket.id}</div></div>
          <div className="tm-card"><div className="tm-k">Table</div><div className="tm-v">{ticket.table}</div></div>
          <div className="tm-card"><div className="tm-k">Sent</div><div className="tm-v">{ticket.placedAt}</div></div>
        </div>

        <div className="routed"><span className="pulse" />Routed to kitchen · {ticket.items.reduce((s, i) => s + i.qty, 0)} items</div>

        <div className="confirm-actions">
          <button className="cta" onClick={onNewOrder}>Back to floor</button>
          <button className="cta dark" onClick={onViewKitchen}>View kitchen rail {I.chevR}</button>
        </div>
      </div>
    </div>
  );
}
