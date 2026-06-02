// components/staff-v2/screens/ReviewScreen.jsx
//
// Order review — grouped by seat, edit/delete per line, totals
// (subtotal + GST + grand), solid "Send to kitchen" footer.

import { useMemo } from 'react';
import { I } from '../ui/icons';
import { rupee, VegMark, SpicePips } from '../ui/primitives';

export default function ReviewScreen({
  table, lines, restaurant,
  onBack, onAddMore, onEdit, onRemove, onStep, onSend,
}) {
  // Tax math mirrors the legacy admin order flow: GST split into CGST
  // and SGST, optional service charge, round-off to whole rupees.
  const totals = useMemo(() => {
    const subtotal = lines.reduce((s, l) => s + l.qty * l.price, 0);
    const gstPct = Number(restaurant?.gstPercent) || 0;
    const scPct = Number(restaurant?.serviceChargePercent) || 0;
    const cgst = subtotal * (gstPct / 2) / 100;
    const sgst = subtotal * (gstPct / 2) / 100;
    const serviceCharge = subtotal * scPct / 100;
    const preRound = subtotal + cgst + sgst + serviceCharge;
    const grandTotal = Math.round(preRound);
    const roundOff = grandTotal - preRound;
    return { subtotal, gstPct, scPct, cgst, sgst, serviceCharge, roundOff, grandTotal };
  }, [lines, restaurant]);

  const count = lines.reduce((s, l) => s + l.qty, 0);
  const seatsPresent = [...new Set(lines.map(l => l.seat))].sort((a, b) => a - b);

  return (
    <div className="screen screen-back">
      <div className="apphead">
        <div className="apphead-row">
          <button className="iconbtn" onClick={onBack} aria-label="Back">{I.back}</button>
          <div style={{ flex: 1 }}>
            <div className="eyebrow">{table.label || table.id} · {table.zone || 'Floor'}</div>
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
                        <div className="li-name">
                          <VegMark veg={l.veg !== false} />
                          {l.name}
                          {l.spice > 0 && <SpicePips level={l.spice} />}
                        </div>
                        {(l.notes && l.notes.length > 0) && (
                          <div className="li-mods">
                            {l.notes.map((n, i) => <span className="li-modtag" key={i}>{n}</span>)}
                          </div>
                        )}
                        {l.freeNote && (
                          <div className="li-mods">
                            <span className="li-modtag" style={{ textTransform: 'none', letterSpacing: 0 }}>{l.freeNote}</span>
                          </div>
                        )}
                        <div className="li-actions">
                          <div className="stepper" style={{ marginRight: 4 }}>
                            <button onClick={() => onStep(l.uid, -1)} aria-label="Decrease">{I.minus}</button>
                            <span className="qty">{l.qty}</span>
                            <button onClick={() => onStep(l.uid, +1)} aria-label="Increase">{I.plus}</button>
                          </div>
                          <button className="li-act" onClick={() => onEdit(l)} aria-label="Edit">{I.edit}</button>
                          <button className="li-act del" onClick={() => onRemove(l.uid)} aria-label="Remove">{I.trash}</button>
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
              <div className="trow"><span>Subtotal</span><span>{rupee(totals.subtotal)}</span></div>
              {totals.gstPct > 0 && (
                <>
                  <div className="trow"><span>CGST {totals.gstPct / 2}%</span><span>{rupee(totals.cgst)}</span></div>
                  <div className="trow"><span>SGST {totals.gstPct / 2}%</span><span>{rupee(totals.sgst)}</span></div>
                </>
              )}
              {totals.scPct > 0 && <div className="trow"><span>Service {totals.scPct}%</span><span>{rupee(totals.serviceCharge)}</span></div>}
              {Math.abs(totals.roundOff) > 0.01 && (
                <div className="trow"><span>Round off</span><span>{totals.roundOff > 0 ? '+' : ''}{rupee(totals.roundOff)}</span></div>
              )}
              <div className="trow grand">
                <span>Total</span>
                <span><span className="cur">₹</span>{totals.grandTotal.toLocaleString('en-IN')}</span>
              </div>
            </div>
            <div style={{ height: 16 }} />
          </div>
        )}
      </div>

      {lines.length > 0 && (
        <div className="send-footer">
          <button className="orderbar" onClick={() => onSend(totals)}>
            <div className="ob-l">
              <span className="ob-count">Send to kitchen</span>
              <span className="ob-sub">{count} items · {table.label || table.id}</span>
            </div>
            <span className="ob-r">{I.send} {rupee(totals.grandTotal)}</span>
          </button>
        </div>
      )}
    </div>
  );
}
