// components/staff-v2/screens/ItemSheet.jsx
//
// Bottom-sheet item editor — Assign to seat / Spice level / Modifiers
// / Note to kitchen / qty stepper + Add CTA. Mirrors the prototype's
// MenuScreen.ItemSheet 1:1.

import { useEffect, useState } from 'react';
import { I } from '../ui/icons';
import { rupee, Thumb, VegMark, SPICE_LABELS, DEFAULT_MODIFIERS, spiceToInt } from '../ui/primitives';

export default function ItemSheet({ item, table, selectedSeat, editLine, onClose, onCommit }) {
  const isEdit = !!editLine;
  const baseSpice = spiceToInt(item.spiceLevel);

  const [qty, setQty]           = useState(editLine ? editLine.qty : 1);
  const [spice, setSpice]       = useState(editLine ? editLine.spice : baseSpice);
  const [notes, setNotes]       = useState(editLine ? [...(editLine.notes || [])] : []);
  const [seat, setSeat]         = useState(editLine ? editLine.seat : selectedSeat);
  const [freeNote, setFreeNote] = useState(editLine ? (editLine.freeNote || '') : '');

  const toggleMod = (m) => setNotes(n => n.includes(m) ? n.filter(x => x !== m) : [...n, m]);

  // ESC closes the sheet — keyboard a11y.
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose?.(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Body-scroll-lock while sheet is open (matches the prototype's UX
  // and prevents the floor/menu scrolling behind the sheet).
  useEffect(() => {
    if (typeof document === 'undefined') return;
    const body = document.body;
    const prev = body.style.overflow;
    body.style.overflow = 'hidden';
    return () => { body.style.overflow = prev; };
  }, []);

  const seats = (() => {
    const cap = Math.max(1, Math.min(20, Number(table?.capacity) || 4));
    return [0, ...Array.from({ length: cap }, (_, i) => i + 1)];
  })();

  // Modifier list — per-item override if present, else app default.
  // (Phase F will let owners configure modifiers per item in admin UI.)
  const modifiers = Array.isArray(item.modifiers) && item.modifiers.length > 0
    ? item.modifiers
    : DEFAULT_MODIFIERS;

  const spiceChanged = spice !== baseSpice;
  const hasCustomNotes = notes.length > 0 || freeNote.trim().length > 0;

  const itemForThumb = { ...item, spice: baseSpice };

  return (
    <>
      <div className="sheet-backdrop" onClick={onClose} />
      <div className="sheet" style={{ maxHeight: '90vh' }}>
        <div className="sheet-grab" />
        <div className="sheet-scroll" style={{ flex: 1 }}>
          <div className="detail-hero">
            <Thumb item={itemForThumb} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <h3><VegMark veg={item.isVeg !== false} /> {item.name}</h3>
              {item.description && <p>{item.description}</p>}
              <div className="dh-price">{rupee(item.price)}</div>
            </div>
          </div>

          {/* Seat assignment */}
          <div className="field-label">Assign to</div>
          <div className="opt-row">
            {seats.map(s => (
              <button key={s} className={'opt' + (s === seat ? ' on' : '')} onClick={() => setSeat(s)}>
                {s === 0 ? '🍽 Whole table' : `Seat ${s}`}
              </button>
            ))}
          </div>

          {/* Spice level — only shown if the dish has a non-zero default */}
          {baseSpice > 0 && (
            <>
              <div className="field-label">Spice level</div>
              <div className="opt-row">
                {SPICE_LABELS.map((lab, lv) => (
                  <button key={lv} className={'opt' + (lv === spice ? ' on' : '')} onClick={() => setSpice(lv)}>
                    {lv > 0 && <span className="spice-dot" />}
                    {lab}
                  </button>
                ))}
              </div>
            </>
          )}

          {/* Modifiers */}
          <div className="field-label">Modifiers</div>
          <div className="opt-row">
            {modifiers.map(m => (
              <button key={m} className={'opt' + (notes.includes(m) ? ' on' : '')} onClick={() => toggleMod(m)}>
                {m}
              </button>
            ))}
          </div>

          {/* Free note */}
          <div className="field-label">Note to kitchen</div>
          <textarea
            className="notes-input"
            placeholder="e.g. allergy — no peanuts, serve after mains…"
            value={freeNote}
            onChange={e => setFreeNote(e.target.value)}
          />
        </div>

        <div className="sheet-foot">
          <div className="qty-big">
            <button onClick={() => setQty(q => Math.max(1, q - 1))} aria-label="Decrease">{I.minus}</button>
            <span className="qty">{qty}</span>
            <button onClick={() => setQty(q => q + 1)} aria-label="Increase">{I.plus}</button>
          </div>
          <button
            className="cta"
            onClick={() => onCommit({
              item, qty, spice, notes, freeNote: freeNote.trim(), seat,
              spiceCustom: spiceChanged || hasCustomNotes,
              editUid: editLine ? editLine.uid : null,
            })}
          >
            {isEdit ? 'Update' : 'Add'}
            <span className="cta-amt">{rupee((item.price || 0) * qty)}</span>
          </button>
        </div>
      </div>
    </>
  );
}
