// pages/admin/new-order.js
// Staff-facing walk-in / takeaway order entry. Complements the customer QR
// flow — when a customer walks up to the counter or picks up an order, the
// staff uses this page to punch in the order instead of asking the customer
// to scan a QR.
//
// Features:
//   - Menu browser with category filter + search
//   - Running cart with inline qty +/-
//   - Dine-in (table number) OR Takeaway (customer name/phone) toggle
//   - Tax (CGST+SGST) + service charge + round-off matching customer flow
//   - createOrder → status depends on orderType + payment:
//       dine-in unpaid     → status='pending' (kitchen starts immediately)
//       takeaway unpaid    → status='awaiting_payment' (Phase F: kitchen
//                            only sees it after admin marks paid)
//       takeaway paid_cash → status='pending' (counter cash, kitchen starts)
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/router';
import { useAuth } from '../../hooks/useAuth';
import AdminLayout from '../../components/layout/AdminLayout';
import PageHead from '../../components/PageHead';
import { getAllMenuItems, createOrder, getRestaurantById, todayKey } from '../../lib/db';
import toast from 'react-hot-toast';

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

export default function AdminNewOrder() {
  const router = useRouter();
  const { userData } = useAuth();
  const rid = userData?.restaurantId;

  const [items, setItems] = useState([]);
  const [restaurant, setRestaurant] = useState(null);
  const [loading, setLoading] = useState(true);

  const [cart, setCart] = useState([]);  // [{id, name, price, qty, note}]
  const [category, setCategory] = useState('all');
  const [search, setSearch] = useState('');

  const [orderType, setOrderType] = useState('dinein');  // 'dinein' | 'takeaway'
  const [tableNumber, setTableNumber] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [specialNote, setSpecialNote] = useState('');
  // Phase F — for takeaway orders, captain can flag "Customer paid now"
  // (cash at the counter) so the order skips `awaiting_payment` and goes
  // straight to the kitchen. Default is false: customer typically pays
  // at pickup, so the order should hold until then.
  const [paidNow, setPaidNow] = useState(false);

  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!rid) return;
    setLoading(true);
    Promise.all([getAllMenuItems(rid), getRestaurantById(rid)])
      .then(([menu, rest]) => {
        setItems((menu || []).filter(i => i.isActive !== false));
        setRestaurant(rest);
        setLoading(false);
      })
      .catch(err => { console.error('new-order load:', err); setLoading(false); toast.error('Could not load menu.'); });
  }, [rid]);

  const categories = useMemo(() => ['all', ...Array.from(new Set(items.map(i => i.category).filter(Boolean)))], [items]);

  const filtered = useMemo(() => {
    let result = items;
    if (category !== 'all') result = result.filter(i => i.category === category);
    const q = search.trim().toLowerCase();
    if (q) result = result.filter(i => (i.name || '').toLowerCase().includes(q));
    return result;
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
  const removeItem = (id) => setCart(prev => prev.filter(c => c.id !== id));

  // Tax math — mirrors the customer checkout flow exactly
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
      // Phase F: takeaway + paidNow → paymentStatus='paid_cash' so
      // createOrder sets status='pending' (kitchen sees it immediately).
      // Otherwise paymentStatus='unpaid' and createOrder routes
      // takeaway to awaiting_payment, dine-in to pending.
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
        sessionId: `captain:${userData?.email || 'staff'}`,
        paymentStatus: isTakeawayPaid ? 'paid_cash' : 'unpaid',
      });
      const successMsg = orderType === 'takeaway' && !paidNow
        ? 'Order saved. Will send to kitchen once payment is collected.'
        : 'Order placed! Sent to kitchen.';
      toast.success(successMsg);
      // Reset form
      setCart([]);
      setTableNumber('');
      setCustomerName('');
      setCustomerPhone('');
      setSpecialNote('');
      setPaidNow(false);
      setOrderType('dinein');
      // Jump to orders for verification
      setTimeout(() => router.push('/admin/orders'), 500);
    } catch (e) {
      console.error('createOrder (captain) failed:', e);
      toast.error('Could not place order. Try again.');
    }
    setSubmitting(false);
  };

  return (
    <AdminLayout>
      <PageHead title="New Order" />
      <div style={{ background: A.cream, minHeight: '100vh', fontFamily: A.font }}>
        <style>{`
          @keyframes spin { to { transform: rotate(360deg); } }
          .no-new-order-input:focus { border-color: ${A.ink}; box-shadow: 0 0 0 3px rgba(0,0,0,0.04); outline: none; }
          .menu-item-card:hover { border-color: rgba(0,0,0,0.15); transform: translateY(-1px); }
          .qty-btn:hover { background: ${A.subtleBg}; }
        `}</style>

        {/* Header */}
        <div style={{ padding: '24px 28px 0' }}>
          <div style={{ fontSize: 11, fontWeight: 500, color: A.faintText, letterSpacing: '0.05em', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
            <span>Operations</span>
            <span style={{ opacity: 0.5 }}>›</span>
            <span style={{ color: A.mutedText }}>New Order</span>
          </div>
          <div style={{ fontWeight: 600, fontSize: 26, color: A.ink, letterSpacing: '-0.4px', lineHeight: 1, marginBottom: 4 }}>
            New Order
          </div>
          <div style={{ fontSize: 13, color: A.mutedText, marginBottom: 20 }}>
            Walk-in / takeaway order punch-in for counter staff.
          </div>
        </div>

        <div style={{ padding: '0 28px 60px', display: 'grid', gridTemplateColumns: '1fr 380px', gap: 18 }}>
          {/* LEFT — Menu */}
          <div style={{ background: A.shell, borderRadius: 14, border: A.border, boxShadow: A.cardShadow, overflow: 'hidden' }}>
            {/* Filters */}
            <div style={{ padding: '14px 18px', borderBottom: A.border, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <input
                value={search} onChange={e => setSearch(e.target.value)}
                placeholder="Search menu…"
                className="no-new-order-input"
                style={{
                  flex: 1, minWidth: 180,
                  padding: '9px 14px', borderRadius: 8,
                  border: A.borderStrong, background: A.shellDarker,
                  fontSize: 13, fontFamily: A.font, color: A.ink,
                  transition: 'border-color 0.15s, box-shadow 0.15s',
                }}
              />
            </div>
            <div style={{ padding: '10px 18px', borderBottom: A.border, display: 'flex', gap: 6, flexWrap: 'wrap', overflowX: 'auto' }}>
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

            {/* Items grid */}
            <div style={{ padding: 14, minHeight: 400 }}>
              {loading ? (
                <div style={{ textAlign: 'center', padding: 60 }}>
                  <div style={{ width: 26, height: 26, border: `3px solid ${A.warning}`, borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto 10px' }} />
                  <div style={{ fontSize: 13, color: A.mutedText }}>Loading menu…</div>
                </div>
              ) : filtered.length === 0 ? (
                <div style={{ textAlign: 'center', padding: 40, color: A.mutedText, fontSize: 13 }}>
                  No items match the filter.
                </div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 10 }}>
                  {filtered.map(item => {
                    const soldOut = item.availableUntil === todayKey();
                    return (
                      <button key={item.id}
                        className="menu-item-card"
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

          {/* RIGHT — Cart + order details */}
          <div style={{ background: A.shell, borderRadius: 14, border: A.border, boxShadow: A.cardShadow, overflow: 'hidden', display: 'flex', flexDirection: 'column', maxHeight: 'calc(100vh - 140px)' }}>
            {/* Order-type toggle */}
            <div style={{ padding: '14px 18px', borderBottom: A.border }}>
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

            {/* Customer/table fields */}
            <div style={{ padding: '14px 18px', borderBottom: A.border, display: 'flex', flexDirection: 'column', gap: 10 }}>
              {orderType === 'dinein' ? (
                <div>
                  <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: A.faintText, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 5 }}>Table number *</label>
                  <input
                    value={tableNumber} onChange={e => setTableNumber(e.target.value)}
                    placeholder="e.g. 5" required
                    className="no-new-order-input"
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
                      className="no-new-order-input"
                      style={{ width: '100%', padding: '10px 12px', boxSizing: 'border-box', background: A.shell, border: A.borderStrong, borderRadius: 8, fontSize: 14, color: A.ink, fontFamily: A.font, transition: 'border-color 0.15s, box-shadow 0.15s' }}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: A.faintText, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 5 }}>Phone (optional)</label>
                    <input
                      value={customerPhone} onChange={e => setCustomerPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
                      placeholder="10-digit mobile"
                      className="no-new-order-input"
                      style={{ width: '100%', padding: '10px 12px', boxSizing: 'border-box', background: A.shell, border: A.borderStrong, borderRadius: 8, fontSize: 14, color: A.ink, fontFamily: "'JetBrains Mono', monospace", transition: 'border-color 0.15s, box-shadow 0.15s' }}
                    />
                  </div>
                  {/* Phase F — pay-now toggle for takeaway. When OFF (default)
                      the order parks in `awaiting_payment` and the kitchen
                      doesn't see it until staff marks it paid. When ON the
                      order goes straight to the kitchen with paymentStatus
                      already paid_cash. */}
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
                      {paidNow
                        ? 'Sends to kitchen immediately'
                        : 'Hold until paid'}
                    </span>
                  </label>
                </>
              )}
            </div>

            {/* Cart items */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '14px 18px' }}>
              {cart.length === 0 ? (
                <div style={{ textAlign: 'center', padding: 40, color: A.faintText, fontSize: 13 }}>
                  Tap items on the left to add.
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
                        <button className="qty-btn" onClick={() => changeQty(c.id, -1)}
                          style={{ padding: '4px 10px', border: 'none', background: 'transparent', cursor: 'pointer', fontSize: 14, color: A.ink, fontFamily: A.font }}>−</button>
                        <span style={{ padding: '4px 10px', fontSize: 13, fontWeight: 700, color: A.ink, fontFamily: "'JetBrains Mono', monospace", minWidth: 24, textAlign: 'center' }}>{c.qty}</span>
                        <button className="qty-btn" onClick={() => changeQty(c.id, 1)}
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
              <div style={{ padding: '10px 18px', borderTop: A.border }}>
                <input
                  value={specialNote} onChange={e => setSpecialNote(e.target.value)}
                  placeholder="Special instructions (optional)"
                  className="no-new-order-input"
                  style={{ width: '100%', padding: '8px 12px', boxSizing: 'border-box', background: A.shellDarker, border: A.border, borderRadius: 8, fontSize: 12, color: A.ink, fontFamily: A.font, transition: 'border-color 0.15s, box-shadow 0.15s' }}
                />
              </div>
            )}

            {/* Totals + submit */}
            <div style={{ padding: '14px 18px', borderTop: A.border, background: A.shellDarker }}>
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
                    <span style={{ width: 14, height: 14, border: `2px solid ${A.cream}`, borderTopColor: 'transparent', borderRadius: '50%', display: 'inline-block', animation: 'spin 0.7s linear infinite' }} />
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
      </div>
    </AdminLayout>
  );
}

AdminNewOrder.getLayout = (page) => page;
