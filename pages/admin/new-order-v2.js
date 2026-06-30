// pages/admin/new-order-v2.js
//
// ★ REDESIGN EXEMPLAR ★ — duplicate of /admin/new-order on the dark "ok-root"
// theme (via <OkShell>). Logic (menu load, fuzzy search, cart, tax math,
// createOrder routing) copied verbatim from new-order.js — only the render is
// new. Original untouched.
import { useEffect, useMemo, useState } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { useFeatureAccess } from '../../hooks/useFeatureAccess';
import OkShell from '../../components/admin/OkShell';
import { getAllMenuItems, createOrder, getRestaurantById, todayKey } from '../../lib/db';
import toast from 'react-hot-toast';

function normalizeForSearch(s) {
  return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}
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

const formatRupee = n => '₹' + Math.round(Number(n) || 0).toLocaleString('en-IN');
const inputStyle = { width: '100%', padding: '10px 12px', boxSizing: 'border-box', background: 'var(--card-2)', border: '1px solid var(--line)', borderRadius: 9, fontSize: 14, color: 'var(--tx)', fontFamily: 'var(--font-body)', outline: 'none' };

export default function NewOrderV2() {
  const router = useRouter();
  const { ready, rid, scopedDb, canView, userData, staffSession } = useFeatureAccess('newOrder');
  const restaurantName = userData?.restaurantName || staffSession?.restaurantName || 'Your Restaurant';

  const [items, setItems] = useState([]);
  const [restaurant, setRestaurant] = useState(null);
  const [loading, setLoading] = useState(true);

  const [cart, setCart] = useState([]);
  const [category, setCategory] = useState('all');
  const [search, setSearch] = useState('');

  const [orderType, setOrderType] = useState('dinein');
  const [tableNumber, setTableNumber] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [specialNote, setSpecialNote] = useState('');
  const [source, setSource] = useState('walkin');
  const [paidNow, setPaidNow] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!rid || !canView) return;
    setLoading(true);
    Promise.all([getAllMenuItems(rid, { db: scopedDb }), getRestaurantById(rid, { db: scopedDb })])
      .then(([menu, rest]) => { setItems((menu || []).filter(i => i.isActive !== false)); setRestaurant(rest); setLoading(false); })
      .catch(err => { console.error('new-order load:', err); setLoading(false); toast.error('Could not load menu.'); });
  }, [rid, canView, scopedDb]); // eslint-disable-line react-hooks/exhaustive-deps

  const categories = useMemo(() => ['all', ...Array.from(new Set(items.map(i => i.category).filter(Boolean)))], [items]);

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
  const changeQty = (id, delta) => setCart(prev => prev.map(c => c.id === id ? { ...c, qty: c.qty + delta } : c).filter(c => c.qty > 0));

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

  const canSubmit = cart.length > 0 && !submitting && (orderType === 'dinein' ? tableNumber.trim().length > 0 : customerName.trim().length > 0);

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      const isTakeawayPaid = orderType === 'takeaway' && paidNow;
      await createOrder(rid, {
        items: cart.map(c => ({ id: c.id, name: c.name, price: c.price, qty: c.qty, note: c.note || '' })),
        subtotal: totals.subtotal, gstPercent: totals.gstPct, cgst: totals.cgst, sgst: totals.sgst,
        serviceCharge: totals.serviceCharge, roundOff: totals.roundOff, total: totals.grandTotal,
        tableNumber: orderType === 'dinein' ? tableNumber.trim() : '', orderType, source,
        customerName: orderType !== 'dinein' ? customerName.trim() : '', customerPhone: customerPhone.trim(),
        specialInstructions: specialNote.trim(),
        sessionId: `captain:${userData?.email || staffSession?.name || 'staff'}`,
        paymentStatus: isTakeawayPaid ? 'paid_cash' : 'unpaid',
      }, { db: scopedDb });
      toast.success(orderType === 'takeaway' && !paidNow ? 'Order saved. Will send to kitchen once payment is collected.' : 'Order placed! Sent to kitchen.');
      setCart([]); setTableNumber(''); setCustomerName(''); setCustomerPhone(''); setSpecialNote(''); setPaidNow(false); setOrderType('dinein');
      setTimeout(() => router.push('/admin/orders'), 500);
    } catch (e) {
      console.error('createOrder (captain) failed:', e);
      toast.error('Could not place order. Try again.');
    }
    setSubmitting(false);
  };

  if (!ready) {
    return (
      <div className="ok-root" style={{ minHeight: '100vh', display: 'grid', placeItems: 'center' }}>
        <Head><title>New Order — HaloHelm</title></Head>
        <div style={{ color: 'var(--tx-3)', fontFamily: 'var(--font-body)', fontSize: 14 }}>Loading…</div>
      </div>
    );
  }
  if (!canView) {
    return (
      <div className="ok-root" style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 24 }}>
        <Head><title>New Order — HaloHelm</title></Head>
        <div style={{ textAlign: 'center', maxWidth: 360 }}>
          <div style={{ fontSize: 44, marginBottom: 12 }}>🔒</div>
          <div style={{ color: 'var(--tx)', fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 18, marginBottom: 6 }}>No access</div>
          <div style={{ color: 'var(--tx-3)', fontFamily: 'var(--font-body)', fontSize: 13.5, lineHeight: 1.6 }}>Your role doesn’t include New Order. Ask the owner to grant it.</div>
        </div>
      </div>
    );
  }

  const segBtn = (on) => ({ flex: 1, padding: '8px 10px', borderRadius: 8, border: 'none', background: on ? 'var(--accent)' : 'transparent', color: on ? 'var(--accent-ink)' : 'var(--tx-2)', fontFamily: 'var(--font-display)', fontSize: 13, fontWeight: 700, cursor: 'pointer' });

  return (
    <>
      <Head><title>New Order — HaloHelm</title></Head>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}} @media (max-width: 980px){ .no-grid{ grid-template-columns: 1fr !important; } }`}</style>
      <OkShell active={null} eyebrow="Operations · walk-in punch-in" title="New Order" brand={restaurantName} scroll={false}>
        <div className="no-grid" style={{ flex: 1, minHeight: 0, display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 380px', gap: 18, padding: '2px 30px 24px', overflow: 'hidden' }}>
          {/* Menu */}
          <div style={{ background: 'var(--card)', borderRadius: 16, border: '1px solid var(--line)', overflow: 'hidden', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
            <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--line)', flexShrink: 0 }}>
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search menu…" style={inputStyle} />
            </div>
            <div style={{ padding: '10px 18px', borderBottom: '1px solid var(--line)', display: 'flex', gap: 6, flexWrap: 'wrap', flexShrink: 0 }}>
              {categories.map(c => (
                <button key={c} onClick={() => setCategory(c)} style={{ padding: '6px 14px', borderRadius: 'var(--r-pill)', border: category === c ? 'none' : '1px solid var(--line)', background: category === c ? 'var(--accent)' : 'var(--card)', color: category === c ? 'var(--accent-ink)' : 'var(--tx-2)', fontFamily: 'var(--font-display)', fontSize: 12, fontWeight: 600, cursor: 'pointer', textTransform: 'capitalize', whiteSpace: 'nowrap' }}>
                  {c === 'all' ? `All (${items.length})` : c}
                </button>
              ))}
            </div>
            <div style={{ padding: 14, overflowY: 'auto', minHeight: 0, flex: 1 }}>
              {loading ? (
                <div style={{ textAlign: 'center', padding: 60 }}>
                  <div style={{ width: 26, height: 26, border: '3px solid var(--gold)', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto 10px' }} />
                  <div style={{ fontFamily: 'var(--font-body)', fontSize: 13, color: 'var(--tx-3)' }}>Loading menu…</div>
                </div>
              ) : filtered.length === 0 ? (
                <div style={{ textAlign: 'center', padding: 40, color: 'var(--tx-3)', fontFamily: 'var(--font-body)', fontSize: 13 }}>No items match the filter.</div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(170px, 1fr))', gap: 10 }}>
                  {filtered.map(item => {
                    const soldOut = item.availableUntil === todayKey();
                    return (
                      <button key={item.id} onClick={() => !soldOut && addToCart(item)} disabled={soldOut}
                        style={{ textAlign: 'left', background: 'var(--card-2)', border: '1px solid var(--line)', borderRadius: 12, padding: 12, cursor: soldOut ? 'not-allowed' : 'pointer', opacity: soldOut ? 0.5 : 1, fontFamily: 'var(--font-body)' }}>
                        <div style={{ fontFamily: 'var(--font-display)', fontSize: 13, fontWeight: 600, color: 'var(--tx)', lineHeight: 1.3, marginBottom: 4 }}>{item.name}</div>
                        <div style={{ fontSize: 11, color: 'var(--tx-3)', marginBottom: 6 }}>{item.category || '—'}</div>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 700, color: 'var(--tx)' }}>{formatRupee(item.price)}</span>
                          {soldOut ? <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, fontWeight: 700, color: 'var(--danger)', letterSpacing: '.08em', textTransform: 'uppercase' }}>Sold out</span> : <span style={{ fontSize: 11, color: 'var(--gold)', fontWeight: 700 }}>+ Add</span>}
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Cart */}
          <div style={{ background: 'var(--card)', borderRadius: 16, border: '1px solid var(--line)', overflow: 'hidden', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
            <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--line)', flexShrink: 0 }}>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 600, color: 'var(--tx-3)', letterSpacing: '.08em', textTransform: 'uppercase', marginBottom: 8 }}>Order type</div>
              <div style={{ display: 'flex', width: '100%', background: 'var(--card-2)', borderRadius: 10, padding: 3 }}>
                <button onClick={() => setOrderType('dinein')} style={segBtn(orderType === 'dinein')}>Dine-in</button>
                <button onClick={() => setOrderType('takeaway')} style={segBtn(orderType === 'takeaway')}>Takeaway</button>
              </div>
            </div>
            <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--line)', flexShrink: 0 }}>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 600, color: 'var(--tx-3)', letterSpacing: '.08em', textTransform: 'uppercase', marginBottom: 8 }}>Channel</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {[['walkin', 'Walk-in'], ['phone', 'Phone'], ['zomato', 'Zomato'], ['swiggy', 'Swiggy'], ['other', 'Other']].map(([k, label]) => (
                  <button key={k} type="button" onClick={() => setSource(k)} style={{ padding: '7px 12px', borderRadius: 8, cursor: 'pointer', fontFamily: 'var(--font-display)', fontSize: 12.5, fontWeight: 600, border: source === k ? 'none' : '1px solid var(--line)', background: source === k ? 'var(--accent)' : 'var(--card)', color: source === k ? 'var(--accent-ink)' : 'var(--tx-2)' }}>{label}</button>
                ))}
              </div>
            </div>
            <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--line)', display: 'flex', flexDirection: 'column', gap: 10, flexShrink: 0 }}>
              {orderType === 'dinein' ? (
                <div>
                  <label style={{ display: 'block', fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 600, color: 'var(--tx-3)', letterSpacing: '.06em', textTransform: 'uppercase', marginBottom: 5 }}>Table number *</label>
                  <input value={tableNumber} onChange={e => setTableNumber(e.target.value)} placeholder="e.g. 5" style={inputStyle} />
                </div>
              ) : (
                <>
                  <div>
                    <label style={{ display: 'block', fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 600, color: 'var(--tx-3)', letterSpacing: '.06em', textTransform: 'uppercase', marginBottom: 5 }}>Customer name *</label>
                    <input value={customerName} onChange={e => setCustomerName(e.target.value)} placeholder="e.g. Priya" style={inputStyle} />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 600, color: 'var(--tx-3)', letterSpacing: '.06em', textTransform: 'uppercase', marginBottom: 5 }}>Phone (optional)</label>
                    <input value={customerPhone} onChange={e => setCustomerPhone(e.target.value.replace(/\D/g, '').slice(0, 10))} placeholder="10-digit mobile" style={{ ...inputStyle, fontFamily: 'var(--font-mono)' }} />
                  </div>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', background: paidNow ? 'rgba(63,170,99,0.10)' : 'var(--card-2)', border: paidNow ? '1px solid rgba(63,170,99,0.35)' : '1px solid var(--line)', borderRadius: 10, cursor: 'pointer' }}>
                    <input type="checkbox" checked={paidNow} onChange={e => setPaidNow(e.target.checked)} style={{ width: 16, height: 16, accentColor: 'var(--success)', cursor: 'pointer' }} />
                    <span style={{ flex: 1, fontFamily: 'var(--font-body)', fontSize: 13, color: 'var(--tx)', fontWeight: 600 }}>Customer paid cash now</span>
                    <span style={{ fontFamily: 'var(--font-body)', fontSize: 11, color: 'var(--tx-3)' }}>{paidNow ? 'Sends to kitchen' : 'Hold until paid'}</span>
                  </label>
                </>
              )}
            </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: '14px 18px', minHeight: 0 }}>
              {cart.length === 0 ? (
                <div style={{ textAlign: 'center', padding: 40, color: 'var(--tx-3)', fontFamily: 'var(--font-body)', fontSize: 13 }}>Tap items to add to this order.</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {cart.map(c => (
                    <div key={c.id} style={{ display: 'grid', gridTemplateColumns: '1fr auto auto', gap: 10, alignItems: 'center' }}>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontFamily: 'var(--font-display)', fontSize: 13, fontWeight: 600, color: 'var(--tx)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.name}</div>
                        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--tx-3)' }}>{formatRupee(c.price)} × {c.qty}</div>
                      </div>
                      <div style={{ display: 'inline-flex', background: 'var(--card-2)', borderRadius: 8, overflow: 'hidden' }}>
                        <button onClick={() => changeQty(c.id, -1)} style={{ padding: '4px 10px', border: 'none', background: 'transparent', cursor: 'pointer', fontSize: 14, color: 'var(--tx)' }}>−</button>
                        <span style={{ padding: '4px 10px', fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 700, color: 'var(--tx)', minWidth: 24, textAlign: 'center' }}>{c.qty}</span>
                        <button onClick={() => changeQty(c.id, 1)} style={{ padding: '4px 10px', border: 'none', background: 'transparent', cursor: 'pointer', fontSize: 14, color: 'var(--tx)' }}>+</button>
                      </div>
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 700, color: 'var(--tx)', minWidth: 56, textAlign: 'right' }}>{formatRupee(c.price * c.qty)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
            {cart.length > 0 && (
              <div style={{ padding: '10px 18px', borderTop: '1px solid var(--line)', flexShrink: 0 }}>
                <input value={specialNote} onChange={e => setSpecialNote(e.target.value)} placeholder="Special instructions (optional)" style={{ ...inputStyle, fontSize: 12 }} />
              </div>
            )}
            <div style={{ padding: '14px 18px', borderTop: '1px solid var(--line)', background: 'var(--card-2)', flexShrink: 0 }}>
              {cart.length > 0 && (
                <div style={{ fontFamily: 'var(--font-body)', fontSize: 12, color: 'var(--tx-3)', marginBottom: 10 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Subtotal</span><span style={{ fontFamily: 'var(--font-mono)' }}>{formatRupee(totals.subtotal)}</span></div>
                  {totals.gstPct > 0 && (<>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>CGST {totals.gstPct / 2}%</span><span style={{ fontFamily: 'var(--font-mono)' }}>{formatRupee(totals.cgst)}</span></div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>SGST {totals.gstPct / 2}%</span><span style={{ fontFamily: 'var(--font-mono)' }}>{formatRupee(totals.sgst)}</span></div>
                  </>)}
                  {totals.serviceCharge > 0 && <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Service {restaurant?.serviceChargePercent || 0}%</span><span style={{ fontFamily: 'var(--font-mono)' }}>{formatRupee(totals.serviceCharge)}</span></div>}
                  {Math.abs(totals.roundOff) > 0.01 && <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Round-off</span><span style={{ fontFamily: 'var(--font-mono)' }}>{totals.roundOff > 0 ? '+' : ''}{formatRupee(totals.roundOff)}</span></div>}
                </div>
              )}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 12 }}>
                <span style={{ fontFamily: 'var(--font-display)', fontSize: 13, fontWeight: 600, color: 'var(--tx)' }}>Total {totals.itemCount > 0 ? `(${totals.itemCount} item${totals.itemCount === 1 ? '' : 's'})` : ''}</span>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 22, fontWeight: 700, color: 'var(--tx)' }}>{formatRupee(totals.grandTotal)}</span>
              </div>
              <button onClick={handleSubmit} disabled={!canSubmit}
                style={{ width: '100%', padding: 14, borderRadius: 10, border: 'none', background: canSubmit ? 'var(--accent)' : 'var(--card-3)', color: canSubmit ? 'var(--accent-ink)' : 'var(--tx-3)', fontFamily: 'var(--font-display)', fontSize: 14, fontWeight: 700, cursor: canSubmit ? 'pointer' : 'not-allowed', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                {submitting ? (<><span style={{ width: 14, height: 14, border: '2px solid var(--accent-ink)', borderTopColor: 'transparent', borderRadius: '50%', display: 'inline-block', animation: 'spin 0.7s linear infinite' }} />Sending…</>) : 'Place Order → Kitchen'}
              </button>
              {cart.length > 0 && (
                <button onClick={() => { if (confirm('Clear the cart?')) setCart([]); }} style={{ width: '100%', marginTop: 8, padding: 8, borderRadius: 8, border: '1px solid var(--line)', background: 'transparent', color: 'var(--tx-3)', fontFamily: 'var(--font-display)', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>Clear cart</button>
              )}
            </div>
          </div>
        </div>
      </OkShell>
    </>
  );
}

NewOrderV2.getLayout = (page) => page;
