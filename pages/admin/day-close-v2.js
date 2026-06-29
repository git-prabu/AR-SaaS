// pages/admin/day-close-v2.js
//
// ★ REDESIGN EXEMPLAR ★ — duplicate of /admin/day-close on the Orders/Kitchen
// "ok-root" dark theme (via <OkShell>). ALL logic (day-scoped order summary,
// payment + cash-drawer reconciliation, save/lock + reopen, CSV export, recent
// closes) is copied verbatim from day-close.js — only the render is new.
// Original /admin/day-close untouched. A focused @media print block whitens
// the Z-report for paper so the dark theme doesn't print as a black slab.
import Head from 'next/head';
import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../../hooks/useAuth';
import OkShell from '../../components/admin/OkShell';
import { useFeatureAccess } from '../../hooks/useFeatureAccess';
import { getOrders, todayKey, saveDayClose, getDayClose, getDayCloses, reopenDay } from '../../lib/db';
import { exportRowsCsv } from '../../lib/csv';
import toast from 'react-hot-toast';

const PAID_STATUSES = new Set(['paid_cash', 'paid_card', 'paid_online', 'paid']);
const formatRupee = n => '₹' + Math.round(Number(n) || 0).toLocaleString('en-IN');

function dayBoundsFromKey(key) {
  if (!key) return { start: 0, end: 0 };
  const [y, m, d] = key.split('-').map(Number);
  const start = new Date(y, m - 1, d, 0, 0, 0, 0).getTime() / 1000;
  const end   = new Date(y, m - 1, d, 23, 59, 59, 999).getTime() / 1000;
  return { start, end };
}
function formatLongDate(key) {
  if (!key) return '';
  const [y, m, d] = key.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  return date.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}
function shiftDayKey(key, deltaDays) {
  const [y, m, d] = key.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  date.setDate(date.getDate() + deltaDays);
  const yy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

// Dark tile.
function Tile({ label, value, color = 'var(--tx)', sub, big = 20 }) {
  return (
    <div style={{ padding: '14px 16px', borderRadius: 12, background: 'var(--card-2)', border: '1px solid var(--line)' }}>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 600, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--tx-3)', marginBottom: 8 }}>{label}</div>
      <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: big, lineHeight: 1, letterSpacing: '-0.02em', color }}>{value}</div>
      {sub && <div style={{ fontFamily: 'var(--font-body)', fontSize: 10.5, color: 'var(--tx-3)', marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

export default function DayCloseV2() {
  const { userData } = useAuth();
  const { ready, isAdmin, rid, scopedDb, canView, staffSession } = useFeatureAccess('dayClose');
  const restaurantName = userData?.restaurantName || staffSession?.restaurantName || 'Your Restaurant';

  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [openingCash, setOpeningCash] = useState('');
  const [closingCash, setClosingCash] = useState('');
  const [selectedDate, setSelectedDate] = useState(() => todayKey());
  const isToday = selectedDate === todayKey();

  const [closeDoc, setCloseDoc] = useState(null);
  const [closeBusy, setCloseBusy] = useState(false);
  const [history, setHistory] = useState([]);
  const locked = !!closeDoc?.locked;

  useEffect(() => {
    if (!rid || !canView) return;
    setLoading(true);
    getOrders(rid, { db: scopedDb })
      .then(data => { setOrders(data || []); setLoading(false); })
      .catch(err => { console.error('day-close load:', err); setLoading(false); });
  }, [rid]); // eslint-disable-line react-hooks/exhaustive-deps

  const loadCloseState = async () => {
    if (!rid || !canView) return;
    try {
      const [d, h] = await Promise.all([getDayClose(rid, selectedDate, { db: scopedDb }), getDayCloses(rid, 30, { db: scopedDb })]);
      setCloseDoc(d);
      setHistory(h);
      if (d?.locked) {
        setOpeningCash(d.openingCash != null ? String(d.openingCash) : '');
        setClosingCash(d.closingCash != null ? String(d.closingCash) : '');
      }
    } catch (e) { console.error('day-close state load:', e); }
  };
  useEffect(() => { loadCloseState(); /* eslint-disable-next-line */ }, [rid, selectedDate]);

  const dayOrders = useMemo(() => {
    const { start, end } = dayBoundsFromKey(selectedDate);
    return orders.filter(o => {
      const ts = o.createdAt?.seconds || 0;
      return ts >= start && ts <= end;
    });
  }, [orders, selectedDate]);

  const summary = useMemo(() => {
    const served = dayOrders.filter(o => o.status === 'served');
    const refunded = dayOrders.filter(o => o.paymentStatus === 'refunded');
    const paid = dayOrders.filter(o => PAID_STATUSES.has(o.paymentStatus));
    const unpaid = dayOrders.filter(o =>
      o.status === 'served' && !PAID_STATUSES.has(o.paymentStatus) && o.paymentStatus !== 'refunded'
    );
    const grossRevenue = paid.reduce((s, o) => s + (o.total || 0), 0);
    const refundTotal  = refunded.reduce((s, o) => s + (o.total || 0), 0);
    const byMethod = { cash: 0, card: 0, online: 0, other: 0 };
    const countByMethod = { cash: 0, card: 0, online: 0, other: 0 };
    paid.forEach(o => {
      const m = o.paymentStatus;
      if (m === 'paid_cash')         { byMethod.cash += o.total || 0;   countByMethod.cash += 1; }
      else if (m === 'paid_card')    { byMethod.card += o.total || 0;   countByMethod.card += 1; }
      else if (m === 'paid_online')  { byMethod.online += o.total || 0; countByMethod.online += 1; }
      else                            { byMethod.other += o.total || 0; countByMethod.other += 1; }
    });
    const taxCollected       = paid.reduce((s, o) => s + (Number(o.cgst) || 0) + (Number(o.sgst) || 0), 0);
    const discountTotal      = paid.reduce((s, o) => s + (Number(o.discount) || 0), 0);
    const serviceChargeTotal = paid.reduce((s, o) => s + (Number(o.serviceCharge) || 0), 0);
    return {
      totalOrders: dayOrders.length, servedCount: served.length, paidCount: paid.length,
      unpaidCount: unpaid.length, unpaidTotal: unpaid.reduce((s, o) => s + (o.total || 0), 0),
      refundedCount: refunded.length, refundTotal, grossRevenue, netRevenue: grossRevenue,
      taxCollected, discountTotal, serviceChargeTotal, byMethod, countByMethod,
    };
  }, [dayOrders]);

  const opening = Number(openingCash) || 0;
  const closing = Number(closingCash) || 0;
  const expectedCash = opening + summary.byMethod.cash;
  const cashVariance = closing - expectedCash;

  const printZReport = () => { if (typeof window !== 'undefined') window.print(); };

  const exportZReport = () => {
    const m2 = (n) => (Number(n) || 0).toFixed(2);
    const rows = [
      ['Day Close — Z-Report', ''], ['Date', selectedDate], ['', ''],
      ['Total orders', summary.totalOrders], ['Served', summary.servedCount], ['Paid', summary.paidCount], ['Unpaid (served)', summary.unpaidCount], ['', ''],
      ['Gross revenue (paid)', m2(summary.grossRevenue)], ['Discounts', m2(summary.discountTotal)], ['Service charge', m2(summary.serviceChargeTotal)],
      ['GST collected (CGST+SGST)', m2(summary.taxCollected)], ['Refunds', m2(summary.refundTotal)], ['Outstanding (unpaid)', m2(summary.unpaidTotal)], ['', ''],
      ['Payment methods', ''], ['Cash', m2(summary.byMethod.cash)], ['Card', m2(summary.byMethod.card)], ['UPI / Online', m2(summary.byMethod.online)], ['Other', m2(summary.byMethod.other)], ['', ''],
      ['Cash drawer', ''], ['Opening cash', m2(opening)], ['Cash sales', m2(summary.byMethod.cash)], ['Expected cash', m2(expectedCash)], ['Counted at close', m2(closing)], ['Variance', m2(cashVariance)],
    ];
    exportRowsCsv(rows, `z-report-${selectedDate}.csv`);
  };

  const handleCloseDay = async () => {
    if (!rid) return;
    setCloseBusy(true);
    try {
      await saveDayClose(rid, selectedDate, { openingCash: opening, closingCash: closing, expectedCash, cashVariance, summary }, { db: scopedDb });
      toast.success(`Day ${selectedDate} closed & locked`);
      await loadCloseState();
    } catch (e) {
      toast.error('Could not close day: ' + (e?.message || 'error'));
    } finally { setCloseBusy(false); }
  };

  const handleReopenDay = async () => {
    if (!rid) return;
    setCloseBusy(true);
    try {
      await reopenDay(rid, selectedDate, { db: scopedDb });
      toast.success(`Day ${selectedDate} reopened`);
      await loadCloseState();
    } catch (e) {
      toast.error('Could not reopen: ' + (e?.message || 'error'));
    } finally { setCloseBusy(false); }
  };

  if (!ready) {
    return (
      <div className="ok-root" style={{ minHeight: '100vh', display: 'grid', placeItems: 'center' }}>
        <Head><title>Day Close — HaloHelm</title></Head>
        <div style={{ color: 'var(--tx-3)', fontFamily: 'var(--font-body)', fontSize: 14 }}>Loading…</div>
      </div>
    );
  }
  if (!canView) {
    return (
      <div className="ok-root" style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 24 }}>
        <Head><title>Day Close — HaloHelm</title></Head>
        <div style={{ textAlign: 'center', maxWidth: 360 }}>
          <div style={{ fontSize: 44, marginBottom: 12 }}>🔒</div>
          <div style={{ color: 'var(--tx)', fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 18, marginBottom: 6 }}>No access</div>
          <div style={{ color: 'var(--tx-3)', fontFamily: 'var(--font-body)', fontSize: 13.5, lineHeight: 1.6 }}>Your role doesn’t include Day Close. Ask the owner to grant it.</div>
        </div>
      </div>
    );
  }

  const dateBtn = { width: 36, height: 36, borderRadius: 9, border: '1px solid var(--line)', background: 'var(--card)', color: 'var(--tx)', fontSize: 15, fontWeight: 700, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' };
  const actionBtn = { padding: '9px 16px', borderRadius: 10, border: '1px solid var(--line)', background: 'var(--card)', color: 'var(--tx)', fontFamily: 'var(--font-display)', fontSize: 13, fontWeight: 600, cursor: 'pointer' };

  return (
    <>
      <Head><title>Day Close — HaloHelm</title></Head>
      <style>{`
        @keyframes spin{to{transform:rotate(360deg)}}
        @media print {
          .dc-noprint { display: none !important; }
          .ok-root .rail { display: none !important; }
          .ok-root, .ok-root .pos, .ok-root .workspace { background:#fff !important; height:auto !important; display:block !important; overflow:visible !important; }
          .ok-root .ws-head { display:none !important; }
          .dc-print, .dc-print * { background:#fff !important; color:#000 !important; border-color:#ccc !important; box-shadow:none !important; }
          .dc-print input { border:none !important; padding:0 !important; }
        }
      `}</style>
      <OkShell active={null} eyebrow={isToday ? `End-of-shift · ${restaurantName}` : `Past day · ${restaurantName}`} title="Day Close" brand={restaurantName}>
        {/* Toolbar */}
        <div className="dc-noprint" style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
          <button onClick={() => setSelectedDate(d => shiftDayKey(d, -1))} title="Previous day" style={dateBtn}>‹</button>
          <input type="date" value={selectedDate} max={todayKey()} onChange={e => { if (e.target.value) setSelectedDate(e.target.value); }}
            style={{ padding: '8px 12px', borderRadius: 9, border: '1px solid var(--line)', background: 'var(--card)', color: 'var(--tx)', fontSize: 13, fontWeight: 600, fontFamily: 'var(--font-body)', outline: 'none', minWidth: 150, colorScheme: 'dark' }} />
          <button onClick={() => setSelectedDate(d => shiftDayKey(d, 1))} disabled={isToday} title={isToday ? 'Cannot view future days' : 'Next day'} style={{ ...dateBtn, cursor: isToday ? 'not-allowed' : 'pointer', opacity: isToday ? 0.4 : 1 }}>›</button>
          {!isToday && <button onClick={() => setSelectedDate(todayKey())} style={{ ...actionBtn, color: 'var(--tx-2)' }}>Today</button>}
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button onClick={exportZReport} style={actionBtn}>Download CSV</button>
            <button onClick={printZReport} style={actionBtn}>Print Z-report →</button>
            {locked ? (
              <button onClick={handleReopenDay} disabled={closeBusy} style={{ ...actionBtn, color: 'var(--danger)', borderColor: 'rgba(217,83,79,0.3)', opacity: closeBusy ? 0.6 : 1 }}>Reopen day</button>
            ) : (
              <button onClick={handleCloseDay} disabled={closeBusy} style={{ padding: '9px 16px', borderRadius: 10, border: 'none', background: 'var(--accent)', color: 'var(--accent-ink)', fontFamily: 'var(--font-display)', fontSize: 13, fontWeight: 700, cursor: closeBusy ? 'not-allowed' : 'pointer', opacity: closeBusy ? 0.6 : 1 }}>{closeBusy ? 'Closing…' : 'Close & lock day'}</button>
            )}
          </div>
        </div>

        {locked && (
          <div className="dc-noprint" style={{ marginBottom: 16, padding: '12px 18px', background: 'rgba(63,170,99,0.12)', border: '1px solid rgba(63,170,99,0.28)', borderRadius: 12, display: 'flex', alignItems: 'center', gap: 10, fontFamily: 'var(--font-body)', fontSize: 13, color: 'var(--success)', fontWeight: 600 }}>
            <span style={{ fontSize: 15 }}>🔒</span> This day is closed &amp; locked. The figures below are the frozen record. Reopen to recount.
          </div>
        )}

        <div className="dc-print">
          {/* Z-report signature card */}
          <div style={{ background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 16, padding: '20px 24px', marginBottom: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
              <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--gold)', boxShadow: '0 0 8px rgba(196,168,109,0.6)' }} />
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 700, letterSpacing: '.10em', textTransform: 'uppercase', color: 'var(--gold)' }}>Z-Report · {restaurantName}</span>
              <span style={{ flex: 1, height: 1, background: 'var(--line-soft)' }} />
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--tx-3)' }}>{isToday ? new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : formatLongDate(selectedDate)}</span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12 }}>
              <Tile label="Orders" value={summary.totalOrders} big={26} />
              <Tile label="Paid" value={summary.paidCount} color="var(--success)" big={26} />
              <Tile label="Unpaid" value={summary.unpaidCount} color={summary.unpaidCount > 0 ? 'var(--danger)' : 'var(--tx-3)'} big={26} />
              <Tile label="Gross revenue" value={formatRupee(summary.grossRevenue)} color="var(--gold)" big={26} />
            </div>
          </div>

          {/* Sales breakdown */}
          <div style={{ background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 16, padding: '18px 22px', marginBottom: 14 }}>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--tx-2)', marginBottom: 14 }}>
              Sales breakdown <span style={{ fontWeight: 500, textTransform: 'none', letterSpacing: 0, color: 'var(--tx-3)' }}>· paid orders</span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12 }}>
              <Tile label="Discounts" value={formatRupee(summary.discountTotal)} />
              <Tile label="Service charge" value={formatRupee(summary.serviceChargeTotal)} />
              <Tile label="GST collected" value={formatRupee(summary.taxCollected)} />
              <Tile label="Refunds" value={formatRupee(summary.refundTotal)} />
            </div>
          </div>

          {loading ? (
            <div style={{ background: 'var(--card)', borderRadius: 16, padding: 48, textAlign: 'center', border: '1px solid var(--line)' }}>
              <div style={{ width: 28, height: 28, border: '3px solid var(--gold)', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto 12px' }} />
              <div style={{ fontFamily: 'var(--font-body)', fontSize: 13, color: 'var(--tx-3)' }}>{isToday ? "Loading today's orders…" : 'Loading orders for this day…'}</div>
            </div>
          ) : (
            <>
              {/* Payment breakdown */}
              <div style={{ background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 16, padding: '22px 26px', marginBottom: 14 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
                  <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--gold)' }} />
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 700, letterSpacing: '.10em', textTransform: 'uppercase', color: 'var(--gold)' }}>Payment breakdown</span>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12 }}>
                  {[{ key: 'cash', label: 'Cash' }, { key: 'card', label: 'Card' }, { key: 'online', label: 'UPI / Online' }].map(m => (
                    <Tile key={m.key} label={m.label} value={formatRupee(summary.byMethod[m.key])} big={22} sub={`${summary.countByMethod[m.key]} order${summary.countByMethod[m.key] === 1 ? '' : 's'}`} />
                  ))}
                </div>
                {(summary.unpaidCount > 0 || summary.refundedCount > 0) && (
                  <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--line)', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
                    <div style={{ padding: '12px 16px', borderRadius: 12, background: 'rgba(217,83,79,0.08)', border: '1px solid rgba(217,83,79,0.18)' }}>
                      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 600, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--danger)', marginBottom: 6 }}>Unpaid (served)</div>
                      <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 18, color: 'var(--tx)' }}>{formatRupee(summary.unpaidTotal)} <span style={{ fontSize: 12, color: 'var(--tx-3)', fontWeight: 500 }}>· {summary.unpaidCount}</span></div>
                    </div>
                    <div style={{ padding: '12px 16px', borderRadius: 12, background: 'rgba(217,83,79,0.08)', border: '1px solid rgba(217,83,79,0.18)' }}>
                      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 600, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--danger)', marginBottom: 6 }}>Refunded</div>
                      <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 18, color: 'var(--tx)' }}>{formatRupee(summary.refundTotal)} <span style={{ fontSize: 12, color: 'var(--tx-3)', fontWeight: 500 }}>· {summary.refundedCount}</span></div>
                    </div>
                  </div>
                )}
              </div>

              {/* Cash drawer */}
              <div style={{ background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 16, padding: '22px 26px', marginBottom: 14 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
                  <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--gold)' }} />
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 700, letterSpacing: '.10em', textTransform: 'uppercase', color: 'var(--gold)' }}>Cash drawer</span>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 14, marginBottom: 14 }}>
                  <div>
                    <label style={{ display: 'block', fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 600, color: 'var(--tx-3)', letterSpacing: '.06em', textTransform: 'uppercase', marginBottom: 7 }}>Opening cash (float)</label>
                    <input type="number" inputMode="decimal" value={openingCash} onChange={e => setOpeningCash(e.target.value)} placeholder="0" disabled={locked} readOnly={locked}
                      style={{ width: '100%', padding: '12px 14px', boxSizing: 'border-box', background: locked ? 'var(--card-3)' : 'var(--card-2)', border: '1px solid var(--line)', borderRadius: 10, fontSize: 16, color: 'var(--tx)', fontFamily: 'var(--font-mono)', outline: 'none' }} />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 600, color: 'var(--tx-3)', letterSpacing: '.06em', textTransform: 'uppercase', marginBottom: 7 }}>Cash counted at close</label>
                    <input type="number" inputMode="decimal" value={closingCash} onChange={e => setClosingCash(e.target.value)} placeholder="0" disabled={locked} readOnly={locked}
                      style={{ width: '100%', padding: '12px 14px', boxSizing: 'border-box', background: locked ? 'var(--card-3)' : 'var(--card-2)', border: '1px solid var(--line)', borderRadius: 10, fontSize: 16, color: 'var(--tx)', fontFamily: 'var(--font-mono)', outline: 'none' }} />
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, paddingTop: 14, borderTop: '1px solid var(--line)' }}>
                  <div style={{ padding: '12px 16px', borderRadius: 12, background: 'var(--card-2)' }}>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 600, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--tx-3)', marginBottom: 6 }}>Expected cash</div>
                    <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: 20, color: 'var(--tx)' }}>{formatRupee(expectedCash)}</div>
                    <div style={{ fontFamily: 'var(--font-body)', fontSize: 10, color: 'var(--tx-3)', marginTop: 3 }}>{formatRupee(opening)} opening + {formatRupee(summary.byMethod.cash)} cash sales</div>
                  </div>
                  <div style={{ padding: '12px 16px', borderRadius: 12, background: 'var(--card-2)' }}>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 600, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--tx-3)', marginBottom: 6 }}>Counted</div>
                    <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: 20, color: 'var(--tx)' }}>{formatRupee(closing)}</div>
                  </div>
                  <div style={{
                    padding: '12px 16px', borderRadius: 12,
                    background: Math.abs(cashVariance) < 1 ? 'rgba(63,170,99,0.10)' : cashVariance > 0 ? 'rgba(196,168,109,0.12)' : 'rgba(217,83,79,0.10)',
                    border: `1px solid ${Math.abs(cashVariance) < 1 ? 'rgba(63,170,99,0.24)' : cashVariance > 0 ? 'rgba(196,168,109,0.26)' : 'rgba(217,83,79,0.24)'}`,
                  }}>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 600, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--tx-3)', marginBottom: 6 }}>Variance</div>
                    <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: 20, color: Math.abs(cashVariance) < 1 ? 'var(--success)' : cashVariance > 0 ? 'var(--gold)' : 'var(--danger)' }}>
                      {cashVariance === 0 ? '₹0' : (cashVariance > 0 ? '+' : '') + formatRupee(cashVariance)}
                    </div>
                    <div style={{ fontFamily: 'var(--font-body)', fontSize: 10, color: 'var(--tx-3)', marginTop: 3 }}>{Math.abs(cashVariance) < 1 ? 'Balanced' : cashVariance > 0 ? 'Over (extra cash)' : 'Short'}</div>
                  </div>
                </div>
              </div>

              <div style={{ fontFamily: 'var(--font-body)', fontSize: 11, color: 'var(--tx-3)', textAlign: 'center', marginTop: 18 }}>
                Z-report · {new Date().toLocaleString('en-IN')} · Printed from HaloHelm admin
              </div>

              {/* Recent closes */}
              {history.length > 0 && (
                <div className="dc-noprint" style={{ marginTop: 24, background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 16, padding: '18px 20px' }}>
                  <div style={{ fontFamily: 'var(--font-display)', fontSize: 14, fontWeight: 700, color: 'var(--tx)', marginBottom: 12 }}>Recent closes</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    {history.map(h => {
                      const v = Number(h.cashVariance) || 0;
                      const vColor = Math.abs(v) < 1 ? 'var(--success)' : v > 0 ? 'var(--gold)' : 'var(--danger)';
                      return (
                        <button key={h.id} onClick={() => setSelectedDate(h.dateKey)} style={{
                          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '9px 12px', borderRadius: 9, border: 'none', cursor: 'pointer',
                          background: h.dateKey === selectedDate ? 'var(--card-2)' : 'transparent', textAlign: 'left',
                        }}>
                          <span style={{ fontFamily: 'var(--font-body)', fontSize: 13, fontWeight: 600, color: 'var(--tx)' }}>{formatLongDate(h.dateKey)}</span>
                          <span style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                            <span style={{ fontFamily: 'var(--font-body)', fontSize: 12, color: 'var(--tx-3)' }}>{formatRupee(h.summary?.grossRevenue || 0)}</span>
                            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 700, color: vColor, minWidth: 64, textAlign: 'right' }}>{v === 0 ? '₹0' : (v > 0 ? '+' : '') + formatRupee(v)}</span>
                            <span style={{ fontSize: 10 }}>🔒</span>
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </OkShell>
    </>
  );
}

DayCloseV2.getLayout = (page) => page;
