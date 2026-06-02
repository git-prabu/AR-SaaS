// components/staff-v2/screens/MenuScreen.jsx
//
// Menu browser — per-seat chips, category tabs with emoji, item rows
// with thumbnail + name + description + price + spice pips, gold
// "+" add button OR [- qty +] stepper when in cart. Sticky gold
// "View order" bar at bottom.

import { useEffect, useMemo, useRef, useState } from 'react';
import { I } from '../ui/icons';
import { rupee, Thumb, VegMark, SpicePips, emojiFromCategory, spiceToInt } from '../ui/primitives';
import { todayKey } from '../../../lib/db';

export default function MenuScreen({
  table, menu, lines, selectedSeat, setSelectedSeat,
  onBack, onOpenItem, onQuickAdd, onRowStep, onViewOrder,
}) {
  const scrollRef = useRef(null);
  const catRefs = useRef({});
  const [activeCat, setActiveCat] = useState(null);

  // Build category list from real menu items (capacity may have gaps;
  // emoji is inferred via fuzzy name match in `emojiFromCategory`).
  const cats = useMemo(() => {
    const seen = new Set();
    const out = [];
    for (const m of menu || []) {
      const c = (m.category || '').trim() || 'Other';
      if (seen.has(c)) continue;
      seen.add(c);
      out.push({ id: c, label: c, emoji: emojiFromCategory(c) || '🍽' });
    }
    return out;
  }, [menu]);

  // Set first category active on mount / when menu loads.
  useEffect(() => {
    if (cats.length > 0 && !activeCat) setActiveCat(cats[0].id);
  }, [cats, activeCat]);

  // Seat chips: 0 = whole table, 1..N = per-seat. table.capacity defines N.
  const seats = useMemo(() => {
    const cap = Math.max(1, Math.min(20, Number(table?.capacity) || 4));
    return [0, ...Array.from({ length: cap }, (_, i) => i + 1)];
  }, [table?.capacity]);

  const orderCount = lines.reduce((s, l) => s + l.qty, 0);
  const orderTotal = lines.reduce((s, l) => s + l.qty * l.price, 0);

  // Quantity of the "simple" line for an item under the selected seat
  // (no custom modifiers / spice). Used by row stepper.
  const simpleQty = (itemId) => {
    const l = lines.find(x =>
      x.itemId === itemId && x.seat === selectedSeat &&
      (!x.notes || x.notes.length === 0) && !x.spiceCustom
    );
    return l ? l.qty : 0;
  };

  const scrollToCat = (cid) => {
    setActiveCat(cid);
    const el = catRefs.current[cid];
    if (el && scrollRef.current) {
      scrollRef.current.scrollTo({ top: el.offsetTop - 8, behavior: 'smooth' });
    }
  };

  // Scroll-tracked active category.
  const onScroll = () => {
    const sc = scrollRef.current; if (!sc) return;
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
      <div className="menuhead">
        <div className="menuhead-top">
          <button className="iconbtn" onClick={onBack} aria-label="Back">{I.back}</button>
          <div className="table-pill">
            <span className="tp-num">{table.label || table.id}</span>
            <span className="tp-meta">
              {table.zone || 'Floor'}
              <small>{table.capacity || 4} seats</small>
            </span>
          </div>
          <div style={{ flex: 1 }} />
          <button className="iconbtn" aria-label="Search">{I.search}</button>
        </div>
      </div>

      {/* Per-seat chips */}
      <div className="seatchips">
        {seats.map(s => (
          <button key={s} className={'seatchip' + (s === selectedSeat ? ' on' : '')} onClick={() => setSelectedSeat(s)}>
            {s === 0 ? <>🍽 Table</> : <>{I.user}Seat {s}</>}
            {seatCount(lines, s) > 0 && <span className="scount">{seatCount(lines, s)}</span>}
          </button>
        ))}
      </div>

      {/* Category tabs */}
      {cats.length > 0 && (
        <div className="cattabs">
          {cats.map(c => (
            <button key={c.id} className={'cattab' + (c.id === activeCat ? ' on' : '')} onClick={() => scrollToCat(c.id)}>
              <span className="cemoji">{c.emoji}</span>{c.label}
            </button>
          ))}
        </div>
      )}

      {/* Scrolling menu list */}
      <div className="scroll" ref={scrollRef} onScroll={onScroll}>
        {cats.length === 0 ? (
          <div className="empty">
            <span className="e-emoji">🍽</span>
            <p>No menu items yet. Ask your manager to add dishes from the Items page so they appear here.</p>
          </div>
        ) : (
        <div className="menulist">
          {cats.map(c => (
            <div key={c.id} ref={el => (catRefs.current[c.id] = el)}>
              <div className="catlabel"><span>{c.emoji}</span>{c.label}</div>
              {(menu || []).filter(m => ((m.category || '').trim() || 'Other') === c.id).map(item => {
                const q = simpleQty(item.id);
                const spice = spiceToInt(item.spiceLevel);
                const itemForThumb = { ...item, spice };
                // Same sold-out gate /admin/new-order uses — owner
                // marked the dish "out for today" via availableUntil.
                // Hides the add control and dims the row.
                const soldOut = item.availableUntil === todayKey();
                const openItem = () => { if (!soldOut) onOpenItem(item, null); };
                return (
                  <div key={item.id}
                    className={'itemrow' + (seatItemQty(lines, item.id, selectedSeat) > 0 ? ' has-qty' : '')}
                    style={{ marginBottom: 8, opacity: soldOut ? 0.5 : 1 }}>
                    <div onClick={openItem} style={{ cursor: soldOut ? 'not-allowed' : 'pointer' }}>
                      <Thumb item={itemForThumb} />
                    </div>
                    <div className="item-main" onClick={openItem} style={{ cursor: soldOut ? 'not-allowed' : 'pointer' }}>
                      <div className="item-name"><VegMark veg={item.isVeg !== false} />{item.name}</div>
                      {item.description && <div className="item-desc">{item.description}</div>}
                      <div className="item-foot">
                        <span className="item-price"><span className="cur">₹</span>{Math.round(item.price || 0)}</span>
                        <SpicePips level={spice} />
                        {soldOut && (
                          <span style={{
                            fontFamily: 'var(--font-mono)', fontSize: 9, fontWeight: 700,
                            letterSpacing: '.1em', textTransform: 'uppercase',
                            color: 'var(--danger)',
                            border: '1px solid var(--danger)', borderRadius: 4,
                            padding: '1px 6px',
                          }}>Sold out</span>
                        )}
                      </div>
                    </div>
                    {soldOut ? null : q > 0 ? (
                      <div className="stepper">
                        <button onClick={(e) => { e.stopPropagation(); onRowStep(item, selectedSeat, -1); }}>{I.minus}</button>
                        <span className="qty">{q}</span>
                        <button onClick={(e) => { e.stopPropagation(); onRowStep(item, selectedSeat, +1); }}>{I.plus}</button>
                      </div>
                    ) : (
                      <button className="add-btn" onClick={(e) => { e.stopPropagation(); onQuickAdd(item, selectedSeat); }} aria-label={`Add ${item.name}`}>
                        {I.plus}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          ))}
          <div style={{ height: orderCount > 0 ? 80 : 20 }} />
        </div>
        )}
      </div>

      {orderCount > 0 && (
        <div className="orderbar-wrap">
          <button className="orderbar" onClick={onViewOrder}>
            <div className="ob-l">
              <span className="ob-count">{orderCount} {orderCount === 1 ? 'item' : 'items'}</span>
              <span className="ob-sub">{table.label || table.id} · review order</span>
            </div>
            <span className="ob-r">{rupee(orderTotal)} {I.arrowR}</span>
          </button>
        </div>
      )}
    </div>
  );
}

function seatCount(lines, seat) {
  return lines.filter(l => l.seat === seat).reduce((s, l) => s + l.qty, 0);
}
function seatItemQty(lines, itemId, seat) {
  return lines.filter(l => l.itemId === itemId && l.seat === seat).reduce((s, l) => s + l.qty, 0);
}
