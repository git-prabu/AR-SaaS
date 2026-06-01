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
//
// Tax math, status routing (dine-in vs takeaway, paid_now vs unpaid)
// and field validation MIRROR /admin/new-order exactly so behaviour is
// identical regardless of which page launches the modal.

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
  // lockedTable = { code, label } — when set (captain flow from Table
  // View), the order is forced to dine-in for that exact table: the
  // type toggle + table input are hidden and the table is pre-filled.
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
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape' && !submitting) onClose?.(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, submitting]);

  // Body-scroll-lock while the modal is open. Without this, scrolling
  // inside the modal on mobile bleeds through to the page behind:
  // when the inner scroll container hits its top or bottom, the
  // touchmove keeps going and drags the waiter dashboard underneath
  // (owner reported this). Lock the body for the lifetime of the
  // modal; restore the previous overflow + scroll position on unmount.
  useEffect(() => {
    if (typeof document === 'undefined') return;
    const body = document.body;
    const prevOverflow = body.style.overflow;
    const prevPaddingRight = body.style.paddingRight;
    // Preserve scroll position by compensating for the scrollbar that
    // disappears when overflow:hidden is set (desktop only; mobile has
    // no scrollbar so the diff is 0).
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
        /* overscroll-behavior:contain stops touch scrolls inside the
           menu / cart from leaking out to the page behind once they
           hit the top or bottom of the scroller. Needs the body-scroll
           lock too (the effect above) — together they fully isolate
           modal scrolling from the underlying waiter dashboard. */
        .nom-scroll { overscroll-behavior: contain; -webkit-overflow-scrolling: touch; }
        /* Sticky mobile action bar — desktop-hidden by default. */
        .nom-mobile-bar { display: none; }
        @media (max-width: 900px) {
          .nom-grid { grid-template-columns: 1fr !important; }
          .nom-cart-pane { max-height: none !important; }
          /* Sticky-fixed bottom action bar on mobile, showing live
             cart count + grand total + Place Order button. The waiter
             can scroll the menu freely and place the order from
             anywhere without scrolling back up to the cart pane.
             Plain fixed positioning so it stays glued to the viewport
             bottom even when the keyboard / native scroll position
             changes. iOS safe-area inset keeps it above the bottom
             home-indicator bar on notched iPhones. */
          .nom-mobile-bar {
            display: flex !important;
            position: fixed; left: 0; right: 0; bottom: 0; z-index: 110;
            padding: 12px 14px calc(12px + env(safe-area-inset-bottom)) 14px;
            background: ${A.ink}; color: ${A.cream};
            box-shadow: 0 -6px 20px rgba(0,0,0,0.28);
            align-items: center; gap: 12px;
            animation: nom-slide-up 0.22s ease both;
          }
          /* Hide the in-cart-pane totals + submit on mobile since the
             floating bar replaces them. Keeps the cart pane focused on
             order setup (type / table) + item list. */
          .nom-desktop-bottom { display: none !important; }
          /* Reserve breathing room at the bottom of the cart pane so
             the floating bar doesn't cover the last cart item. */
          .nom-cart-pane > .nom-cart-list-wrap { padding-bottom: 100px !important; }
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

        {/* Body — same 2-pane layout as /admin/new-order */}
        <div className="nom-grid ar-new-order-grid" style={{ flex: 1, padding: 16, display: 'grid', gridTemplateColumns: '1fr 380px', gap: 14, overflow: 'hidden' }}>

          {/* LEFT — Menu (renders SECOND on mobile via .ar-new-order-menu) */}
          <div className="ar-new-order-menu" style={{ background: A.shell, borderRadius: 14, border: A.border, boxShadow: A.cardShadow, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            <div style={{ padding: '12px 16px', borderBottom: A.border, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <input
                value={search} onChange={e => setSearch(e.target.value)}
                placeholder="Search menu…"
                className="nom-input"
                style={{ flex: 1, minWidth: 180, padding: '9px 14px', borderRadius: 8, border: A.borderStrong, background: A.shellDarker, fontSize: 13, fontFamily: A.font, color: A.ink, transition: 'border-color 0.15s, box-shadow 0.15s' }}
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
                    // Same sold-out gate as /admin/new-order — `availableUntil`
                    // set to today's date key means staff already flagged this
                    // dish out for the rest of the day.
                    const soldOut = item.availableUntil === todayKey();
                    return (
                      <button key={item.id}
                        className="nom-menu-card"
                        onClick={() => !soldOut && addToCart(item)}
                        disabled={soldOut}
                        style={{
                          textAlign: 'left', background: A.shell,
                          border: A.border, borderRadius: 10, padding: 12,
                          cursor: soldOut ? 'not-allowed' : 'pointer',
                          opacity: soldOut ? 0.5 : 1,
                          transition: 'all 0.15s',
                          fontFamily: A.font,
                        }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: A.ink, lineHeight: 1.3, marginBottom: 4 }}>
                          {item.name}
                        </div>
                        <div style={{ fontSize: 11, color: A.mutedText, marginBottom: 6 }}>
                          {item.category || '—'}
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                          <span style={{ fontSize: 13, fontWeight: 700, color: A.ink, fontFamily: "'JetBrains Mono', monospace" }}>
                            {formatRupee(item.price)}
                          </span>
                          {soldOut ? (
                            <span style={{ fontSize: 9, fontWeight: 700, color: A.danger, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                              Sold out
                            </span>
                          ) : (
                            <span style={{ fontSize: 11, color: A.warning, fontWeight: 700 }}>+ Add</span>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* RIGHT — Cart + customer/table fields + totals (renders FIRST
              on mobile via .ar-new-order-cart so the operator sees the
              order-type / table / channel setup before scrolling through
              menu items). */}
          <div className="nom-cart-pane ar-new-order-cart" style={{ background: A.shell, borderRadius: 14, border: A.border, boxShadow: A.cardShadow, overflow: 'hidden', display: 'flex', flexDirection: 'column', maxHeight: 'calc(100vh - 180px)' }}>
            {/* Order-type toggle — hidden in captain (locked-table) mode */}
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

            {/* Customer / table fields */}
            <div style={{ padding: '12px 16px', borderBottom: A.border, display: 'flex', flexDirection: 'column', gap: 10 }}>
              {lockedTable ? (
                // Captain mode — fixed table, no input.
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
                  {/* Phase-F pay-now toggle: same semantics as /admin/new-order. */}
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

            {/* Cart items */}
            <div className="nom-scroll nom-cart-list-wrap" style={{ flex: 1, overflowY: 'auto', padding: '12px 16px' }}>
              {cart.length === 0 ? (
                <div style={{ textAlign: 'center', padding: 40, color: A.faintText, fontSize: 13 }}>
                  <span className="ar-hide-mobile">Tap items on the left to add.</span>
                  <span className="ar-show-mobile">Scroll down and tap items to add to this order.</span>
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

            {/* Special note */}
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

            {/* Totals + submit — desktop only. On mobile the floating
                bottom bar below replaces this so the operator can place
                the order from anywhere on the page without scrolling
                back up to the cart pane. */}
            <div className="nom-desktop-bottom" style={{ padding: '12px 16px', borderTop: A.border, background: A.shellDarker }}>
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
                ) : `Place Order → Kitchen`}
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
          </div>
        </div>

        {/* Sticky bottom action bar — MOBILE ONLY. CSS in the <style>
            block above un-hides it under 900px. Always shows: lets
            the waiter see live cart count + total while browsing the
            menu, and place the order with one tap from anywhere.
            Disabled when canSubmit is false (e.g. no table number
            entered yet) — disabled state shows what's still needed
            so the waiter knows what to fix. */}
        <div className="nom-mobile-bar">
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
          <button
            onClick={handleSubmit}
            disabled={!canSubmit}
            style={{
              padding: '12px 18px', borderRadius: 10, border: 'none',
              background: canSubmit ? A.warning : 'rgba(234,231,227,0.18)',
              color: canSubmit ? A.ink : 'rgba(234,231,227,0.45)',
              fontSize: 14, fontWeight: 700, fontFamily: A.font,
              cursor: canSubmit ? 'pointer' : 'not-allowed',
              whiteSpace: 'nowrap',
              display: 'inline-flex', alignItems: 'center', gap: 6,
              minWidth: 140, justifyContent: 'center',
            }}>
            {submitting ? (
              <>
                <span style={{ width: 14, height: 14, border: `2px solid ${A.ink}`, borderTopColor: 'transparent', borderRadius: '50%', display: 'inline-block', animation: 'nom-spin 0.7s linear infinite' }} />
                Sending…
              </>
            ) : cart.length === 0 ? 'Add items' : !canSubmit ? (orderType === 'dinein' ? 'Enter table' : 'Enter name') : 'Place Order →'}
          </button>
        </div>
      </div>
    </div>
  );
}
