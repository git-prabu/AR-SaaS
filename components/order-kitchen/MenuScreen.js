// components/order-kitchen/MenuScreen.js
//
// Direct 1:1 port of the Claude Design prototype's menu.jsx.
// Same JSX structure, same className strings, same logic for
// scroll-tracked active category. Window globals converted to
// props/imports.

import React, { useState, useRef } from 'react';
import { I, rupee, Thumb, VegMark, SpicePips } from './Icons';

function seatCount(lines, seat) {
  return lines.filter(l => l.seat === seat).reduce((s, l) => s + l.qty, 0);
}
function seatItemQty(lines, itemId, seat) {
  return lines.filter(l => l.itemId === itemId && l.seat === seat).reduce((s, l) => s + l.qty, 0);
}

export default function MenuScreen({
  table, lines, selectedSeat, setSelectedSeat,
  categories, menu,
  onBack, onOpenItem, onQuickAdd, onRowStep, onViewOrder,
}) {
  const cats = categories;
  const [activeCat, setActiveCat] = useState(cats[0]?.id);
  const scrollRef = useRef(null);
  const catRefs = useRef({});

  const orderCount = lines.reduce((s, l) => s + l.qty, 0);
  const orderTotal = lines.reduce((s, l) => s + l.qty * l.price, 0);

  // seat options: 0 = shared/table, then 1..seats
  const seats = [0, ...Array.from({ length: table.seats }, (_, i) => i + 1)];

  // qty for the "simple" inline line of an item under the selected seat
  const simpleQty = (itemId) => {
    const l = lines.find(x => x.itemId === itemId && x.seat === selectedSeat && (!x.notes || x.notes.length === 0) && x.spiceCustom !== true);
    return l ? l.qty : 0;
  };

  const scrollToCat = (cid) => {
    setActiveCat(cid);
    const el = catRefs.current[cid];
    if (el && scrollRef.current) {
      scrollRef.current.scrollTo({ top: el.offsetTop - 8, behavior: 'smooth' });
    }
  };

  // highlight active category on scroll
  const onScroll = () => {
    const sc = scrollRef.current;
    if (!sc) return;
    const top = sc.scrollTop + 60;
    let cur = cats[0]?.id;
    for (const c of cats) {
      const el = catRefs.current[c.id];
      if (el && el.offsetTop <= top) cur = c.id;
    }
    if (cur && cur !== activeCat) setActiveCat(cur);
  };

  return (
    <div className="screen screen-enter">
      {/* menuhead — pure inline styles (mirrors apphead fix from
          FloorScreen / KitchenScreen / ReviewScreen). */}
      <div style={{
        padding: '10px 20px 10px',
        flexShrink: 0,
        display: 'flex',
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        width: '100%',
      }}>
        <button onClick={onBack} style={{
          width: 40, height: 40, borderRadius: 13, flexShrink: 0,
          background: '#221F1B', border: '1px solid rgba(196,168,109,0.13)',
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          color: '#EFEBE4', cursor: 'pointer', padding: 0,
        }}>
          <span style={{ width: 18, height: 18, display: 'inline-flex' }}>{I.back}</span>
        </button>
        <div style={{
          display: 'flex', flexDirection: 'row', alignItems: 'center', gap: 10,
          padding: '7px 12px', borderRadius: 16, flexShrink: 1, minWidth: 0,
          background: '#221F1B', border: '1px solid rgba(196,168,109,0.13)',
        }}>
          <span style={{
            fontFamily: "'Poppins', -apple-system, BlinkMacSystemFont, sans-serif",
            fontWeight: 700, fontSize: 14, color: '#EFEBE4', flexShrink: 0,
          }}>{table.id}</span>
          <span style={{
            display: 'flex', flexDirection: 'column', minWidth: 0,
            fontFamily: "'JetBrains Mono', ui-monospace, monospace",
            fontSize: 10, color: 'rgba(239,235,228,0.74)',
            textTransform: 'uppercase', letterSpacing: '0.06em',
          }}>
            {table.zone}
            <small style={{ fontSize: 9, color: 'rgba(239,235,228,0.38)', textTransform: 'none', letterSpacing: 0 }}>
              {table.seats} seats · open {table.openedAt || 'now'}
            </small>
          </span>
        </div>
        <div style={{ flex: 1 }} />
        <button style={{
          width: 40, height: 40, borderRadius: 13, flexShrink: 0,
          background: '#221F1B', border: '1px solid rgba(196,168,109,0.13)',
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          color: '#EFEBE4', cursor: 'pointer', padding: 0,
        }}>
          <span style={{ width: 18, height: 18, display: 'inline-flex' }}>{I.search}</span>
        </button>
      </div>

      {/* per-seat selector */}
      <div className="seatchips">
        {seats.map(s => (
          <button key={s} className={'seatchip' + (s === selectedSeat ? ' on' : '')} onClick={() => setSelectedSeat(s)}>
            {s === 0 ? <>🍽 Table</> : <>{I.user}Seat {s}</>}
            {seatCount(lines, s) > 0 && <span className="scount">{seatCount(lines, s)}</span>}
          </button>
        ))}
      </div>

      {/* category tabs */}
      <div className="cattabs">
        {cats.map(c => (
          <button key={c.id} className={'cattab' + (c.id === activeCat ? ' on' : '')} onClick={() => scrollToCat(c.id)}>
            <span className="cemoji">{c.emoji}</span>{c.label}
          </button>
        ))}
      </div>

      <div className="scroll" ref={scrollRef} onScroll={onScroll}>
        <div className="menulist">
          {cats.map(c => (
            <div key={c.id} ref={el => (catRefs.current[c.id] = el)}>
              <div className="catlabel"><span>{c.emoji}</span>{c.label}</div>
              {menu.filter(m => m.cat === c.id).map(item => {
                const q = simpleQty(item.id);
                return (
                  <div key={item.id} className={'itemrow' + (seatItemQty(lines, item.id, selectedSeat) > 0 ? ' has-qty' : '')} style={{ marginBottom: 8 }}>
                    <div onClick={() => onOpenItem(item, null)} style={{ cursor: 'pointer' }}>
                      <Thumb item={item} />
                    </div>
                    <div className="item-main" onClick={() => onOpenItem(item, null)} style={{ cursor: 'pointer' }}>
                      <div className="item-name"><VegMark veg={item.veg} />{item.name}</div>
                      <div className="item-desc">{item.desc}</div>
                      <div className="item-foot">
                        <span className="item-price"><span className="cur">₹</span>{item.price}</span>
                        <SpicePips level={item.spice} />
                      </div>
                    </div>
                    {q > 0 ? (
                      <div className="stepper">
                        <button onClick={() => onRowStep(item, selectedSeat, -1)}>{I.minus}</button>
                        <span className="qty">{q}</span>
                        <button onClick={() => onRowStep(item, selectedSeat, +1)}>{I.plus}</button>
                      </div>
                    ) : (
                      <button className="add-btn" onClick={() => onQuickAdd(item, selectedSeat)}>{I.plus}</button>
                    )}
                  </div>
                );
              })}
            </div>
          ))}
          <div style={{ height: orderCount > 0 ? 80 : 20 }} />
        </div>
      </div>

      {orderCount > 0 && (
        <div className="orderbar-wrap">
          <button className="orderbar" onClick={onViewOrder}>
            <div className="ob-l">
              <span className="ob-count">{orderCount} {orderCount === 1 ? 'item' : 'items'}</span>
              <span className="ob-sub">{table.id} · review order</span>
            </div>
            <span className="ob-r">{rupee(orderTotal)} {I.arrowR}</span>
          </button>
        </div>
      )}
    </div>
  );
}

/* ── Item detail sheet ────────────────────────────────────── */
const SPICE_LABELS = ['No spice', 'Mild', 'Medium', 'Spicy', 'Very spicy'];
const MODIFIERS = ['Extra spicy', 'No onion', 'No garlic', 'Less oil', 'Extra gravy', 'Jain'];

export function ItemSheet({ item, table, selectedSeat, editLine, onClose, onCommit }) {
  const isEdit = !!editLine;
  const [qty, setQty] = useState(editLine ? editLine.qty : 1);
  const [spice, setSpice] = useState(editLine ? editLine.spice : item.spice);
  const [notes, setNotes] = useState(editLine ? [...editLine.notes] : []);
  const [seat, setSeat] = useState(editLine ? editLine.seat : selectedSeat);
  const [freeNote, setFreeNote] = useState(editLine ? (editLine.freeNote || '') : '');

  const toggleMod = (m) => setNotes(n => n.includes(m) ? n.filter(x => x !== m) : [...n, m]);
  const seats = [0, ...Array.from({ length: table.seats }, (_, i) => i + 1)];
  const allNotes = [...notes, ...(freeNote.trim() ? [freeNote.trim()] : [])];
  const spiceChanged = spice !== item.spice;

  return (
    <>
      <div className="sheet-backdrop" onClick={onClose} />
      <div className="sheet" style={{ maxHeight: '90%' }}>
        <div className="sheet-grab" />
        <div className="sheet-scroll">
          <div className="detail-hero">
            <Thumb item={item} />
            <div style={{ flex: 1 }}>
              <h3><VegMark veg={item.veg} /> {item.name}</h3>
              <p>{item.desc}</p>
              <div className="dh-price">{rupee(item.price)}</div>
            </div>
          </div>

          {/* seat */}
          <div className="field-label">Assign to</div>
          <div className="opt-row">
            {seats.map(s => (
              <button key={s} className={'opt' + (s === seat ? ' on' : '')} onClick={() => setSeat(s)}>
                {s === 0 ? '🍽 Whole table' : `Seat ${s}`}
              </button>
            ))}
          </div>

          {/* spice */}
          {item.spice > 0 && (
            <>
              <div className="field-label">Spice level</div>
              <div className="opt-row">
                {SPICE_LABELS.map((lab, lv) => (
                  <button key={lv} className={'opt' + (lv === spice ? ' on' : '')} onClick={() => setSpice(lv)}>
                    {lv > 0 && <span className="spice-dot" />}{lab}
                  </button>
                ))}
              </div>
            </>
          )}

          {/* modifiers */}
          <div className="field-label">Modifiers</div>
          <div className="opt-row">
            {MODIFIERS.map(m => (
              <button key={m} className={'opt' + (notes.includes(m) ? ' on' : '')} onClick={() => toggleMod(m)}>{m}</button>
            ))}
          </div>

          {/* free note */}
          <div className="field-label">Note to kitchen</div>
          <textarea className="notes-input" placeholder="e.g. allergy — no peanuts, serve after mains…" value={freeNote} onChange={e => setFreeNote(e.target.value)} />
        </div>

        <div className="sheet-foot">
          <div className="qty-big">
            <button onClick={() => setQty(q => Math.max(1, q - 1))}>{I.minus}</button>
            <span className="qty">{qty}</span>
            <button onClick={() => setQty(q => q + 1)}>{I.plus}</button>
          </div>
          <button className="cta" onClick={() => onCommit({ item, qty, spice, notes: allNotes, freeNote: freeNote.trim(), seat, spiceCustom: spiceChanged || allNotes.length > 0, editUid: editLine ? editLine.uid : null })}>
            {isEdit ? 'Update' : 'Add'}
            <span className="cta-amt">{rupee(item.price * qty)}</span>
          </button>
        </div>
      </div>
    </>
  );
}
