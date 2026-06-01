// components/NewOrderModal.jsx
//
// Reusable order-entry modal. Same logic as /admin/new-order (May 14
// extraction) but rendered as a full-screen overlay so it can drop into
// any page that already knows the restaurantId.
//
// Why extract this:
//   The waiter staff page (/admin/waiter) needs in-page order taking so
//   waiters can punch in walk-in / takeaway orders WITHOUT leaving the
//   live action queue. /admin/new-order requires admin auth (useAuth),
//   but the waiter page also serves PIN-authed staff — they can't reach
//   /admin/new-order. By making this a self-contained component that
//   takes `rid` as a prop, both auth flows can use it.
//
// Props:
//   rid          — restaurant id (from useAuth().userData OR
//                  staffSession.restaurantId — caller resolves which)
//   actorLabel   — string used as `sessionId` on the order doc (e.g.
//                  "captain:owner@x.com" for admin or
//                  "captain:staff:waiter1" for staff). Audit trail only.
//   onClose      — called when the user dismisses the modal (× button,
//                  ESC, or backdrop click)
//   onPlaced     — called after a successful createOrder. Receives the
//                  new orderId. Caller decides whether to close the
//                  modal, refresh a list, or navigate.
//   lockedTable  — { code, label } — captain flow from Table View:
//                  forces dine-in for that table, hides toggle + input.
//
// Tax math, status routing (dine-in vs takeaway, paid_now vs unpaid)
// and field validation MIRROR /admin/new-order exactly so behaviour is
// identical regardless of which page launches the modal.
//
// ─── UI Phase 1 redesign (refs 3 + 5) ────────────────────────────────
// Mobile is now a two-screen flow:
//   1. MENU view (default): pure menu browsing — image-led item cards
//      with circular [+] / [− qty +] counters, sticky black bottom bar
//      showing "[N items] ₹XXX · View Order →".
//   2. CART view (slides up on bottom-bar tap): full order review —
//      setup (type / table / customer), itemised cart with stepper
//      per row, totals, place CTA. Back arrow returns to menu.
// Desktop keeps the 2-pane side-by-side layout (menu LEFT, cart RIGHT)
// because there's screen real estate for it, but the menu cards
// themselves get the same image-led polish.
// All BEHAVIOUR — state, validation, submit, locked-table mode, sold-
// out gating, tax math — is unchanged from the previous version.

import { useEffect, useMemo, useState } from 'react';
import { getAllMenuItems, createOrder, getRestaurantById, todayKey } from '../lib/db';
import toast from 'react-hot-toast';

// ── Search normalisation helpers ────────────────────────────────────
// Lowercase + diacritic strip so "creme brule" finds "Crème Brûlée".
function normalizeForSearch(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, ''); // combining diacritical marks block
}
// Typo-tolerant contains: exact substring, or any one-character-removed
// variant (handles a single missing/extra/wrong letter on 4+ char queries).
// Cheap O(word.length × hay.length) — fine for menus under ~500 items.
function fuzzyContains(hay, word) {
  if (!word) return true;
  if (hay.includes(word)) return true;
  if (word.length < 4) return false;
  for (let i = 0; i < word.length; i++) {
    const variant = word.slice(0, i) + word.slice(i + 1);
    if (hay.includes(variant)) return true;
  }
  return false;
}

// Stable 2-colour gradient per item id — used as the menu-card image
// when item.imageURL is missing. Hash-driven so each item keeps the
// SAME gradient across re-renders (no reshuffling), but the palette
// rotates across items so the grid still feels varied.
function gradientFor(id) {
  const palettes = [
    ['#FCE4B6', '#F0BE73'], // amber
    ['#D7E4D2', '#A8C49C'], // sage
    ['#E0DEEF', '#B8B3D8'], // lavender
    ['#FDD9D7', '#F5A29D'], // coral
    ['#D2E6EE', '#9CC7D8'], // sky
    ['#EBE3D5', '#C9B997'], // sand
  ];
  let h = 0;
  const s = String(id || 'x');
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  const [from, to] = palettes[Math.abs(h) % palettes.length];
  return `linear-gradient(135deg, ${from} 0%, ${to} 100%)`;
}

const INTER = "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
const A = {
  font: INTER,
  cream: '#EDEDED',
  ink: '#1A1A1A',
  shell: '#FFFFFF',
  shellDarker: '#F8F8F8',
  warning: '#C4A86D',
  warningDim: '#A08656',
  success: '#3F9E5A',
  danger: '#D9534F',
  mutedText: 'rgba(0,0,0,0.55)',
  faintText: 'rgba(0,0,0,0.38)',
  subtleBg: 'rgba(0,0,0,0.04)',
  border: '1px solid rgba(0,0,0,0.06)',
  borderStrong: '1px solid rgba(0,0,0,0.10)',
  cardShadow: '0 1px 2px rgba(0,0,0,0.04), 0 4px 12px rgba(0,0,0,0.04)',
};

const formatRupee = n => '₹' + Math.round(Number(n) || 0).toLocaleString('en-IN');

export default function NewOrderModal({ rid, actorLabel, onClose, onPlaced, lockedTable }) {
  // ─── State (UNCHANGED behaviour-wise) ─────────────────────────────
  const [items, setItems] = useState([]);
  const [restaurant, setRestaurant] = useState(null);
  const [loading, setLoading] = useState(true);

  const [cart, setCart] = useState([]);  // [{id, name, price, qty, note}]
  const [category, setCategory] = useState('all');
  const [search, setSearch] = useState('');

  const [orderType, setOrderType] = useState(lockedTable ? 'dinein' : 'dinein');
  const [tableNumber, setTableNumber] = useState(lockedTable?.code || '');
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [specialNote, setSpecialNote] = useState('');
  const [paidNow, setPaidNow] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // NEW: mobile two-view toggle. Doesn't affect desktop (which always
  // shows both panes side by side via CSS).
  //   'menu' → image-led menu browser with sticky bottom bar
  //   'cart' → full-screen sheet with setup + items + totals + Place
  const [mobileSheet, setMobileSheet] = useState('menu');

  // Fetch menu + restaurant once when the modal opens.
  useEffect(() => {
    if (!rid) return;
    setLoading(true);
    Promise.all([getAllMenuItems(rid), getRestaurantById(rid)])
      .then(([menu, rest]) => {
        setItems((menu || []).filter(i => i.isActive !== false));
        setRestaurant(rest);
        setLoading(false);
      })
      .catch(err => { console.error('NewOrderModal load:', err); setLoading(false); toast.error('Could not load menu.'); });
  }, [rid]);

  // ESC closes the modal — keyboard a11y + power-user friendly.
  // On mobile, ESC from the cart sheet returns to the menu instead
  // of closing the whole modal — matches the usual back-button mental
  // model on phones.
  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== 'Escape' || submitting) return;
      if (mobileSheet === 'cart') { setMobileSheet('menu'); return; }
      onClose?.();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, submitting, mobileSheet]);

  // Body-scroll-lock while the modal is open. Without this, scrolling
  // inside the modal on mobile bleeds through to the page behind:
  // when the inner scroll container hits its top or bottom, the
  // touchmove keeps going and drags the waiter dashboard underneath.
  // Lock body overflow for the lifetime of the modal; restore on close.
  useEffect(() => {
    if (typeof document === 'undefined') return;
    const body = document.body;
    const prevOverflow = body.style.overflow;
    const prevPaddingRight = body.style.paddingRight;
    // Compensate for the scrollbar that disappears when overflow:hidden
    // is set on desktop (mobile typically has no scrollbar so diff=0).
    const scrollbarW = window.innerWidth - document.documentElement.clientWidth;
    body.style.overflow = 'hidden';
    if (scrollbarW > 0) body.style.paddingRight = `${scrollbarW}px`;
    return () => {
      body.style.overflow = prevOverflow;
      body.style.paddingRight = prevPaddingRight;
    };
  }, []);

  const categories = useMemo(() => ['all', ...Array.from(new Set(items.map(i => i.category).filter(Boolean)))], [items]);

  // Fuzzy / typo-tolerant search.
  //  - Lowercases + strips diacritics so "creme brule" matches "Crème Brûlée"
  //  - Splits the query into words; EVERY word must hit somewhere — so
  //    "brule creme" or "dessert creme" both work (word order doesn't matter)
  //  - For 4+ char words also matches with ONE character removed, so a
  //    small typo like "creem" → still finds "crème". Cheap O(n) per word
  //    relative to the (tiny) menu size.
  //  - Searches across name + category + description so an owner can
  //    type "dessert" and see every dessert item.
  const filtered = useMemo(() => {
    let result = items;
    if (category !== 'all') result = result.filter(i => i.category === category);
    const q = normalizeForSearch(search.trim());
    if (!q) return result;
    const words = q.split(/\s+/).filter(Boolean);
    return result.filter(i => {
      const hay = normalizeForSearch(`${i.name || ''} ${i.category || ''} ${i.description || ''}`);
      return words.every(w => fuzzyContains(hay, w));
    });
  }, [items, category, search]);

  const addToCart = (item) => {
    setCart(prev => {
      const existing = prev.find(c => c.id === item.id);
      if (existing) return prev.map(c => c.id === item.id ? { ...c, qty: c.qty + 1 } : c);
      return [...prev, { id: item.id, name: item.name, price: item.price || 0, qty: 1, note: '' }];
    });
  };
  const changeQty = (id, delta) => {
    setCart(prev => prev
      .map(c => c.id === id ? { ...c, qty: c.qty + delta } : c)
      .filter(c => c.qty > 0)
    );
  };

  // Quick lookup: current qty for an item id in the cart. Used by the
  // menu-card counter (no qty → big circular "+", qty>0 → "− N +" pill).
  const cartQtyFor = (id) => cart.find(c => c.id === id)?.qty || 0;

  // Tax math — mirrors /admin/new-order exactly (which itself mirrors
  // the customer checkout flow). CGST + SGST split out of `gstPercent`,
  // service charge separate, round-off to whole rupees.
  const totals = useMemo(() => {
    const subtotal = cart.reduce((s, c) => s + c.qty * c.price, 0);
    const gstPct = restaurant?.gstPercent || 0;
    const scPct = restaurant?.serviceChargePercent || 0;
    const cgst = subtotal * (gstPct / 2) / 100;
    const sgst = subtotal * (gstPct / 2) / 100;
    const serviceCharge = subtotal * scPct / 100;
    const preRound = subtotal + cgst + sgst + serviceCharge;
    const grandTotal = Math.round(preRound);
    const roundOff = grandTotal - preRound;
    return { subtotal, gstPct, cgst, sgst, serviceCharge, roundOff, grandTotal, itemCount: cart.reduce((s, c) => s + c.qty, 0) };
  }, [cart, restaurant]);

  const canSubmit = cart.length > 0 && !submitting && (
    orderType === 'dinein' ? tableNumber.trim().length > 0 : customerName.trim().length > 0
  );
  // Tells the waiter what's missing so they can fix it. Used both in
  // the disabled CTA label on mobile and in a small banner on the
  // cart sheet.
  const missingHint = (() => {
    if (submitting) return null;
    if (cart.length === 0) return 'Add items';
    if (orderType === 'dinein' && !tableNumber.trim()) return 'Enter table';
    if (orderType !== 'dinein' && !customerName.trim()) return 'Enter name';
    return null;
  })();

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      // Same status routing as /admin/new-order:
      //   dinein unpaid     → 'pending'           (kitchen sees it now)
      //   takeaway unpaid   → 'awaiting_payment'  (kitchen waits)
      //   takeaway paid_now → 'pending'           (cash-at-counter, go)
      const isTakeawayPaid = orderType === 'takeaway' && paidNow;
      const orderId = await createOrder(rid, {
        items: cart.map(c => ({ id: c.id, name: c.name, price: c.price, qty: c.qty, note: c.note || '' })),
        subtotal: totals.subtotal,
        gstPercent: totals.gstPct,
        cgst: totals.cgst,
        sgst: totals.sgst,
        serviceCharge: totals.serviceCharge,
        roundOff: totals.roundOff,
        total: totals.grandTotal,
        tableNumber: orderType === 'dinein' ? tableNumber.trim() : '',
        orderType,
        customerName: orderType !== 'dinein' ? customerName.trim() : '',
        customerPhone: customerPhone.trim(),
        specialInstructions: specialNote.trim(),
        sessionId: actorLabel || 'captain:staff',
        paymentStatus: isTakeawayPaid ? 'paid_cash' : 'unpaid',
      });
      const successMsg = orderType === 'takeaway' && !paidNow
        ? 'Order saved. Will send to kitchen once payment is collected.'
        : 'Order placed! Sent to kitchen.';
      toast.success(successMsg);
      onPlaced?.(orderId);
    } catch (e) {
      console.error('NewOrderModal createOrder failed:', e);
      toast.error('Could not place order. Try again.');
    }
    setSubmitting(false);
  };

  // ─── Small inline components for readability ──────────────────────

  // The setup block (order type / table / customer / paid-now) — used
  // at the top of the cart sheet on both mobile and desktop. Identical
  // behaviour to the previous version, just extracted so the cart
  // sheet structure reads cleanly.
  const SetupBlock = () => (
    <>
      {!lockedTable && (
        <div style={{ padding: '12px 16px', borderBottom: A.border }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: A.faintText, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 8 }}>Order type</div>
          <div style={{ display: 'inline-flex', width: '100%', background: A.subtleBg, borderRadius: 10, padding: 3 }}>
            {[
              { k: 'dinein',   label: 'Dine-in' },
              { k: 'takeaway', label: 'Takeaway' },
            ].map(t => (
              <button key={t.k} onClick={() => setOrderType(t.k)}
                style={{
                  flex: 1, padding: '8px 10px', borderRadius: 7, border: 'none',
                  background: orderType === t.k ? A.ink : 'transparent',
                  color: orderType === t.k ? A.cream : A.mutedText,
                  fontSize: 13, fontWeight: 600, fontFamily: A.font, cursor: 'pointer',
                }}>
                {t.label}
              </button>
            ))}
          </div>
        </div>
      )}
      <div style={{ padding: '12px 16px', borderBottom: A.border, display: 'flex', flexDirection: 'column', gap: 10 }}>
        {lockedTable ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 11, fontWeight: 600, color: A.faintText, letterSpacing: '0.06em', textTransform: 'uppercase' }}>Adding to</span>
            <span style={{ padding: '6px 12px', borderRadius: 8, background: A.ink, color: A.cream, fontSize: 14, fontWeight: 700 }}>
              {lockedTable.label || `Table ${lockedTable.code}`}
            </span>
          </div>
        ) : orderType === 'dinein' ? (
          <div>
            <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: A.faintText, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 5 }}>Table number *</label>
            <input
              value={tableNumber} onChange={e => setTableNumber(e.target.value)}
              placeholder="e.g. 5" required
              className="nom-input"
              style={{ width: '100%', padding: '10px 12px', boxSizing: 'border-box', background: A.shell, border: A.borderStrong, borderRadius: 8, fontSize: 14, color: A.ink, fontFamily: A.font, transition: 'border-color 0.15s, box-shadow 0.15s' }}
            />
          </div>
        ) : (
          <>
            <div>
              <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: A.faintText, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 5 }}>Customer name *</label>
              <input
                value={customerName} onChange={e => setCustomerName(e.target.value)}
                placeholder="e.g. Priya" required
                className="nom-input"
                style={{ width: '100%', padding: '10px 12px', boxSizing: 'border-box', background: A.shell, border: A.borderStrong, borderRadius: 8, fontSize: 14, color: A.ink, fontFamily: A.font, transition: 'border-color 0.15s, box-shadow 0.15s' }}
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: A.faintText, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 5 }}>Phone (optional)</label>
              <input
                value={customerPhone} onChange={e => setCustomerPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
                placeholder="10-digit mobile"
                className="nom-input"
                style={{ width: '100%', padding: '10px 12px', boxSizing: 'border-box', background: A.shell, border: A.borderStrong, borderRadius: 8, fontSize: 14, color: A.ink, fontFamily: "'JetBrains Mono', monospace", transition: 'border-color 0.15s, box-shadow 0.15s' }}
              />
            </div>
            <label style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '10px 12px', background: paidNow ? 'rgba(63,158,90,0.08)' : A.subtleBg,
              border: paidNow ? `1px solid rgba(63,158,90,0.35)` : A.borderStrong,
              borderRadius: 8, cursor: 'pointer',
            }}>
              <input
                type="checkbox"
                checked={paidNow}
                onChange={e => setPaidNow(e.target.checked)}
                style={{ width: 16, height: 16, accentColor: A.success, cursor: 'pointer' }}
              />
              <span style={{ flex: 1, fontSize: 13, color: A.ink, fontWeight: 600 }}>
                Customer paid cash now
              </span>
              <span style={{ fontSize: 11, color: A.mutedText, fontWeight: 500 }}>
                {paidNow ? 'Sends to kitchen immediately' : 'Hold until paid'}
              </span>
            </label>
          </>
        )}
      </div>
    </>
  );

  // Cart items list with row stepper (used at center of cart sheet
  // on mobile and middle of cart pane on desktop). Empty-state copy
  // adapts to whether we're on mobile (where menu is on a different
  // screen) or desktop (menu is side-by-side).
  const CartList = () => (
    <div className="nom-scroll nom-cart-list-wrap" style={{ flex: 1, overflowY: 'auto', padding: '12px 16px' }}>
      {cart.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 40, color: A.faintText, fontSize: 13, lineHeight: 1.5 }}>
          <span className="ar-hide-mobile">Tap items on the left to add.</span>
          <span className="ar-show-mobile">No items yet — tap “Back to menu” to add.</span>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {cart.map(c => (
            <div key={c.id} style={{ display: 'grid', gridTemplateColumns: '1fr auto auto', gap: 10, alignItems: 'center' }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: A.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.name}</div>
                <div style={{ fontSize: 11, color: A.mutedText, fontFamily: "'JetBrains Mono', monospace" }}>{formatRupee(c.price)} × {c.qty}</div>
              </div>
              <div style={{ display: 'inline-flex', background: A.subtleBg, borderRadius: 8, overflow: 'hidden' }}>
                <button className="nom-qty-btn" onClick={() => changeQty(c.id, -1)}
                  style={{ padding: '4px 10px', border: 'none', background: 'transparent', cursor: 'pointer', fontSize: 14, color: A.ink, fontFamily: A.font }}>−</button>
                <span style={{ padding: '4px 10px', fontSize: 13, fontWeight: 700, color: A.ink, fontFamily: "'JetBrains Mono', monospace", minWidth: 24, textAlign: 'center' }}>{c.qty}</span>
                <button className="nom-qty-btn" onClick={() => changeQty(c.id, 1)}
                  style={{ padding: '4px 10px', border: 'none', background: 'transparent', cursor: 'pointer', fontSize: 14, color: A.ink, fontFamily: A.font }}>+</button>
              </div>
              <span style={{ fontSize: 13, fontWeight: 700, color: A.ink, fontFamily: "'JetBrains Mono', monospace", minWidth: 56, textAlign: 'right' }}>
                {formatRupee(c.price * c.qty)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  // Totals breakdown + the big Place Order CTA. Same numbers and
  // submit behaviour as before; rendered both inside the desktop cart
  // pane and at the bottom of the mobile cart sheet.
  const TotalsAndSubmit = () => (
    <div className="nom-totals" style={{ padding: '12px 16px', borderTop: A.border, background: A.shellDarker }}>
      {cart.length > 0 && (
        <div style={{ fontSize: 12, color: A.mutedText, marginBottom: 10 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Subtotal</span><span style={{ fontFamily: "'JetBrains Mono', monospace" }}>{formatRupee(totals.subtotal)}</span></div>
          {totals.gstPct > 0 && (
            <>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>CGST {totals.gstPct / 2}%</span><span style={{ fontFamily: "'JetBrains Mono', monospace" }}>{formatRupee(totals.cgst)}</span></div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>SGST {totals.gstPct / 2}%</span><span style={{ fontFamily: "'JetBrains Mono', monospace" }}>{formatRupee(totals.sgst)}</span></div>
            </>
          )}
          {totals.serviceCharge > 0 && (
            <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Service {restaurant?.serviceChargePercent || 0}%</span><span style={{ fontFamily: "'JetBrains Mono', monospace" }}>{formatRupee(totals.serviceCharge)}</span></div>
          )}
          {Math.abs(totals.roundOff) > 0.01 && (
            <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Round-off</span><span style={{ fontFamily: "'JetBrains Mono', monospace" }}>{totals.roundOff > 0 ? '+' : ''}{formatRupee(totals.roundOff)}</span></div>
          )}
        </div>
      )}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 12 }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: A.ink, letterSpacing: '-0.1px' }}>Total {totals.itemCount > 0 ? `(${totals.itemCount} item${totals.itemCount === 1 ? '' : 's'})` : ''}</span>
        <span style={{ fontSize: 22, fontWeight: 700, color: A.ink, letterSpacing: '-0.5px', fontFamily: "'JetBrains Mono', monospace" }}>
          {formatRupee(totals.grandTotal)}
        </span>
      </div>
      <button
        onClick={handleSubmit}
        disabled={!canSubmit}
        style={{
          width: '100%', padding: '14px',
          borderRadius: 10, border: 'none',
          background: canSubmit ? A.ink : A.subtleBg,
          color: canSubmit ? A.cream : A.faintText,
          fontSize: 14, fontWeight: 600, fontFamily: A.font,
          cursor: canSubmit ? 'pointer' : 'not-allowed',
          transition: 'all 0.15s',
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
        }}>
        {submitting ? (
          <>
            <span style={{ width: 14, height: 14, border: `2px solid ${A.cream}`, borderTopColor: 'transparent', borderRadius: '50%', display: 'inline-block', animation: 'nom-spin 0.7s linear infinite' }} />
            Sending…
          </>
        ) : missingHint ? missingHint : `Place Order → Kitchen`}
      </button>
      {cart.length > 0 && (
        <button
          onClick={() => { if (confirm('Clear the cart?')) setCart([]); }}
          style={{
            width: '100%', marginTop: 8, padding: '8px',
            borderRadius: 8, border: A.border,
            background: 'transparent', color: A.mutedText,
            fontSize: 12, fontWeight: 600, fontFamily: A.font, cursor: 'pointer',
          }}>
          Clear cart
        </button>
      )}
    </div>
  );

  // ─── Render ───────────────────────────────────────────────────────
  return (
    <div
      onClick={(e) => { if (e.target === e.currentTarget && !submitting) onClose?.(); }}
      style={{
        position: 'fixed', inset: 0, zIndex: 100,
        background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(6px)',
        display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
        padding: '24px 16px',
        fontFamily: A.font,
        animation: 'nom-fade-in 0.18s ease',
      }}>
      <style>{`
        @keyframes nom-fade-in { from { opacity: 0; } to { opacity: 1; } }
        @keyframes nom-spin { to { transform: rotate(360deg); } }
        @keyframes nom-slide-up { from { transform: translateY(100%); } to { transform: none; } }
        .nom-input:focus { border-color: ${A.ink}; box-shadow: 0 0 0 3px rgba(0,0,0,0.04); outline: none; }
        .nom-menu-card:hover { border-color: rgba(0,0,0,0.15); transform: translateY(-1px); }
        .nom-qty-btn:hover { background: ${A.subtleBg}; }
        /* The big circular [+] add button on each item card, and the
           rounded [− qty +] pill that replaces it once the item is in
           the cart. Plain CSS so we don't recompute styles on every
           render of a 200-item menu. */
        .nom-card-add {
          width: 32px; height: 32px; border-radius: 50%; border: none;
          background: ${A.ink}; color: ${A.cream};
          font-size: 18px; font-weight: 700; line-height: 1; cursor: pointer;
          box-shadow: 0 2px 6px rgba(0,0,0,0.18);
          transition: transform 0.12s, box-shadow 0.12s;
        }
        .nom-card-add:hover { transform: scale(1.06); box-shadow: 0 3px 10px rgba(0,0,0,0.22); }
        .nom-card-pill {
          display: inline-flex; align-items: center;
          background: ${A.ink}; color: ${A.cream};
          border-radius: 999px; padding: 2px;
          box-shadow: 0 2px 6px rgba(0,0,0,0.18);
        }
        .nom-card-pill button {
          width: 26px; height: 26px; border-radius: 50%;
          border: none; background: transparent; color: ${A.cream};
          font-size: 15px; font-weight: 700; cursor: pointer; line-height: 1;
        }
        .nom-card-pill button:hover { background: rgba(255,255,255,0.08); }
        .nom-card-pill .qty {
          padding: 0 8px; font-size: 13px; font-weight: 700;
          font-family: 'JetBrains Mono', monospace; min-width: 18px; text-align: center;
        }
        /* overscroll-behavior:contain stops touch scrolls inside the
           menu / cart from leaking out to the page behind once they
           hit the top or bottom of the scroller. Pairs with the body-
           scroll lock effect above. */
        .nom-scroll { overscroll-behavior: contain; -webkit-overflow-scrolling: touch; }
        /* Sticky mobile action bar — desktop-hidden by default. */
        .nom-mobile-bar { display: none; }
        /* Mobile back-to-menu header inside the cart sheet — hidden on
           desktop where the cart is permanently visible beside menu. */
        .nom-cart-back { display: none; }
        @media (max-width: 900px) {
          .nom-grid { grid-template-columns: 1fr !important; }
          .nom-cart-pane { max-height: none !important; }
          /* Two-view mobile flow: only one pane is visible at a time.
             The other is removed from layout via display:none — its
             internal scroll state is preserved by keeping the node
             mounted (React doesn't unmount, just hides). */
          .nom-mobile-hidden { display: none !important; }
          /* Sticky-fixed bottom action bar on mobile. Tap → opens cart
             sheet. iOS safe-area inset keeps it above the home indicator. */
          .nom-mobile-bar {
            display: flex !important;
            position: fixed; left: 0; right: 0; bottom: 0; z-index: 110;
            padding: 12px 14px calc(12px + env(safe-area-inset-bottom)) 14px;
            background: ${A.ink}; color: ${A.cream};
            box-shadow: 0 -6px 20px rgba(0,0,0,0.28);
            align-items: center; gap: 12px;
            cursor: pointer; user-select: none;
            animation: nom-slide-up 0.22s ease both;
          }
          /* Back-to-menu header at top of the cart sheet on mobile. */
          .nom-cart-back { display: flex !important; }
          /* Reserve breathing room at the bottom of the menu grid on
             mobile so the floating bar doesn't cover the last row. */
          .nom-pane-menu .nom-scroll { padding-bottom: 96px !important; }
          /* The mobile cart sheet should fill the whole modal vertically
             (no max-height) so the totals + Place CTA sit at the bottom
             of the screen, not floating. */
          .nom-pane-cart { animation: nom-slide-up 0.22s ease both; }
        }
      `}</style>

      <div style={{
        width: '100%', maxWidth: 1180, maxHeight: 'calc(100vh - 48px)',
        background: A.cream, borderRadius: 14,
        boxShadow: '0 24px 60px rgba(0,0,0,0.35)',
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
      }}>
        {/* Modal header */}
        <div style={{ padding: '16px 22px', borderBottom: A.border, background: A.shell, display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 11, fontWeight: 500, color: A.faintText, letterSpacing: '0.05em', marginBottom: 4 }}>
              Operations · New Order
            </div>
            <div style={{ fontWeight: 600, fontSize: 20, color: A.ink, letterSpacing: '-0.3px' }}>
              Take an order
            </div>
          </div>
          <button
            onClick={() => !submitting && onClose?.()}
            disabled={submitting}
            aria-label="Close"
            style={{
              width: 36, height: 36, borderRadius: 8, border: A.border,
              background: A.shell, color: A.mutedText, fontSize: 18, lineHeight: 1,
              cursor: submitting ? 'not-allowed' : 'pointer', fontFamily: A.font,
            }}>×</button>
        </div>

        {/* Body — desktop 2-pane, mobile 1-pane-at-a-time (toggled) */}
        <div className="nom-grid ar-new-order-grid" style={{ flex: 1, padding: 16, display: 'grid', gridTemplateColumns: '1fr 380px', gap: 14, overflow: 'hidden' }}>

          {/* MENU PANE — left on desktop, screen 1 on mobile */}
          <div
            className={`nom-pane-menu ar-new-order-menu ${mobileSheet !== 'menu' ? 'nom-mobile-hidden' : ''}`}
            style={{ background: A.shell, borderRadius: 14, border: A.border, boxShadow: A.cardShadow, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            <div style={{ padding: '12px 16px', borderBottom: A.border, display: 'flex', alignItems: 'center', gap: 10 }}>
              <span aria-hidden style={{ fontSize: 13, color: A.mutedText, lineHeight: 1 }}>🔍</span>
              <input
                value={search} onChange={e => setSearch(e.target.value)}
                placeholder="Search menu…"
                className="nom-input"
                style={{ flex: 1, minWidth: 0, padding: '9px 14px', borderRadius: 8, border: A.borderStrong, background: A.shellDarker, fontSize: 13, fontFamily: A.font, color: A.ink, transition: 'border-color 0.15s, box-shadow 0.15s' }}
              />
            </div>
            <div style={{ padding: '8px 16px', borderBottom: A.border, display: 'flex', gap: 6, flexWrap: 'wrap', overflowX: 'auto' }}>
              {categories.map(c => (
                <button key={c} onClick={() => setCategory(c)}
                  style={{
                    padding: '6px 14px', borderRadius: 20,
                    border: A.border, background: category === c ? A.ink : A.shell,
                    color: category === c ? A.cream : A.mutedText,
                    fontSize: 12, fontWeight: 600, fontFamily: A.font,
                    cursor: 'pointer', textTransform: 'capitalize', whiteSpace: 'nowrap',
                  }}>
                  {c === 'all' ? `All (${items.length})` : c}
                </button>
              ))}
            </div>

            <div className="nom-scroll" style={{ flex: 1, overflowY: 'auto', padding: 12, minHeight: 280 }}>
              {loading ? (
                <div style={{ textAlign: 'center', padding: 60 }}>
                  <div style={{ width: 26, height: 26, border: `3px solid ${A.warning}`, borderTopColor: 'transparent', borderRadius: '50%', animation: 'nom-spin 0.8s linear infinite', margin: '0 auto 10px' }} />
                  <div style={{ fontSize: 13, color: A.mutedText }}>Loading menu…</div>
                </div>
              ) : filtered.length === 0 ? (
                <div style={{ textAlign: 'center', padding: 40, color: A.mutedText, fontSize: 13 }}>
                  No items match the filter.
                </div>
              ) : (
                <div className="ar-new-order-items" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(170px, 1fr))', gap: 10 }}>
                  {filtered.map(item => {
                    const soldOut = item.availableUntil === todayKey();
                    const qty = cartQtyFor(item.id);
                    return (
                      <div key={item.id}
                        className="nom-menu-card"
                        style={{
                          textAlign: 'left', background: A.shell,
                          border: A.border, borderRadius: 12, overflow: 'hidden',
                          opacity: soldOut ? 0.55 : 1,
                          transition: 'all 0.15s',
                          fontFamily: A.font,
                          display: 'flex', flexDirection: 'column',
                          position: 'relative',
                        }}>
                        {/* Tap the image area / title to add to cart.
                            Lets the waiter add by tapping anywhere on
                            the card, not just the small + button. */}
                        <button
                          type="button"
                          onClick={() => !soldOut && addToCart(item)}
                          disabled={soldOut}
                          style={{
                            border: 'none', padding: 0, margin: 0,
                            background: 'transparent', textAlign: 'left',
                            cursor: soldOut ? 'not-allowed' : 'pointer',
                            display: 'block',
                          }}>
                          {/* Image area — real photo if available,
                              otherwise a deterministic gradient with
                              the first letter of the item name. */}
                          <div style={{
                            width: '100%', aspectRatio: '4 / 3',
                            background: item.imageURL ? '#f0f0f0' : gradientFor(item.id),
                            position: 'relative', overflow: 'hidden',
                          }}>
                            {item.imageURL ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={item.imageURL} alt=""
                                style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                                loading="lazy"
                              />
                            ) : (
                              <span style={{
                                position: 'absolute', inset: 0,
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                fontSize: 32, fontWeight: 700, color: 'rgba(0,0,0,0.18)',
                                fontFamily: A.font, letterSpacing: '-0.5px',
                              }}>
                                {(item.name || '?').trim().charAt(0).toUpperCase()}
                              </span>
                            )}
                            {soldOut && (
                              <span style={{
                                position: 'absolute', top: 8, left: 8,
                                fontSize: 9, fontWeight: 700, color: '#fff',
                                background: A.danger, padding: '3px 7px', borderRadius: 4,
                                letterSpacing: '0.08em', textTransform: 'uppercase',
                              }}>
                                Sold out
                              </span>
                            )}
                          </div>
                          <div style={{ padding: '10px 12px 12px 12px' }}>
                            <div style={{ fontSize: 13, fontWeight: 600, color: A.ink, lineHeight: 1.25, marginBottom: 3, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                              {item.name}
                            </div>
                            <div style={{ fontSize: 11, color: A.mutedText, marginBottom: 8, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {item.category || '—'}
                            </div>
                            <span style={{ fontSize: 14, fontWeight: 700, color: A.ink, fontFamily: "'JetBrains Mono', monospace" }}>
                              {formatRupee(item.price)}
                            </span>
                          </div>
                        </button>
                        {/* Floating add control — circular [+] when not
                            in cart, [− qty +] pill when in cart. Sits
                            at bottom-right of the card, overlapping the
                            image bottom-edge for a tactile look. */}
                        {!soldOut && (
                          <div style={{ position: 'absolute', right: 10, bottom: 10 }}>
                            {qty === 0 ? (
                              <button
                                type="button" aria-label={`Add ${item.name}`}
                                onClick={(e) => { e.stopPropagation(); addToCart(item); }}
                                className="nom-card-add">+</button>
                            ) : (
                              <span className="nom-card-pill">
                                <button type="button" aria-label="Remove one"
                                  onClick={(e) => { e.stopPropagation(); changeQty(item.id, -1); }}>−</button>
                                <span className="qty">{qty}</span>
                                <button type="button" aria-label="Add one more"
                                  onClick={(e) => { e.stopPropagation(); changeQty(item.id, 1); }}>+</button>
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* CART PANE — right on desktop, slide-up sheet on mobile */}
          <div
            className={`nom-cart-pane nom-pane-cart ar-new-order-cart ${mobileSheet !== 'cart' ? 'nom-mobile-hidden' : ''}`}
            style={{ background: A.shell, borderRadius: 14, border: A.border, boxShadow: A.cardShadow, overflow: 'hidden', display: 'flex', flexDirection: 'column', maxHeight: 'calc(100vh - 180px)' }}>

            {/* Mobile-only back header — desktop hides via CSS */}
            <button
              type="button"
              className="nom-cart-back"
              onClick={() => setMobileSheet('menu')}
              style={{
                width: '100%', display: 'flex', alignItems: 'center', gap: 8,
                padding: '12px 14px', borderBottom: A.border,
                background: A.shellDarker, border: 'none',
                fontFamily: A.font, fontSize: 13, fontWeight: 600,
                color: A.ink, cursor: 'pointer',
              }}>
              <span style={{ fontSize: 18, lineHeight: 1, color: A.warningDim }}>←</span>
              Back to menu
              <span style={{ marginLeft: 'auto', fontSize: 11, color: A.mutedText, fontWeight: 500 }}>
                {cart.length > 0 ? `${totals.itemCount} item${totals.itemCount === 1 ? '' : 's'}` : 'Cart empty'}
              </span>
            </button>

            <SetupBlock />
            <CartList />

            {/* Per-order special note (whole order, not per item — per-
                item notes land in Phase 5). */}
            {cart.length > 0 && (
              <div style={{ padding: '10px 16px', borderTop: A.border }}>
                <input
                  value={specialNote} onChange={e => setSpecialNote(e.target.value)}
                  placeholder="Special instructions (optional)"
                  className="nom-input"
                  style={{ width: '100%', padding: '8px 12px', boxSizing: 'border-box', background: A.shellDarker, border: A.border, borderRadius: 8, fontSize: 12, color: A.ink, fontFamily: A.font, transition: 'border-color 0.15s, box-shadow 0.15s' }}
                />
              </div>
            )}

            <TotalsAndSubmit />
          </div>
        </div>

        {/* Sticky bottom action bar — MOBILE ONLY (menu view only).
            Tap anywhere on the bar (not just the button) to open the
            cart sheet. Big readable total + item count + "View Order"
            CTA. When canSubmit is false the CTA still opens the cart
            sheet (so the waiter can see what's missing) but it shows
            the missing-field hint instead of "View Order". */}
        {mobileSheet === 'menu' && (
          <div
            className="nom-mobile-bar"
            onClick={() => setMobileSheet('cart')}
            role="button" tabIndex={0}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') setMobileSheet('cart'); }}
          >
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: 'rgba(234,231,227,0.55)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 2 }}>
                {cart.length === 0
                  ? 'Cart empty'
                  : `${totals.itemCount} item${totals.itemCount === 1 ? '' : 's'}`}
              </div>
              <div style={{ fontSize: 20, fontWeight: 700, color: A.cream, letterSpacing: '-0.3px', fontFamily: "'JetBrains Mono', monospace" }}>
                {formatRupee(totals.grandTotal)}
              </div>
            </div>
            <span
              style={{
                padding: '12px 18px', borderRadius: 10,
                background: cart.length > 0 ? A.warning : 'rgba(234,231,227,0.18)',
                color: cart.length > 0 ? A.ink : 'rgba(234,231,227,0.55)',
                fontSize: 14, fontWeight: 700, fontFamily: A.font,
                whiteSpace: 'nowrap',
                display: 'inline-flex', alignItems: 'center', gap: 6,
                minWidth: 140, justifyContent: 'center',
              }}>
              {cart.length === 0 ? 'Add items' : `View order →`}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
