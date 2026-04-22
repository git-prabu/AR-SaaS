// pages/admin/day-close.js
// End-of-day (Z-report) view. Summarizes today's orders, payment-method
// breakdown, refunds, and a cash-drawer reconciliation section with printable
// Z-report output.
//
// This is the first cut — no shift records are persisted yet (so variance
// isn't historical). For v1.1, we can store a daily close doc with the cash
// counts for audit.
import Head from 'next/head';
import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../../hooks/useAuth';
import AdminLayout from '../../components/layout/AdminLayout';
import { getOrders } from '../../lib/db';
import PageHead from '../../components/PageHead';

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
  forest: '#1A1A1A',
  forestDarker: '#2A2A2A',
  forestText: '#EAE7E3',
  forestTextMuted: 'rgba(234,231,227,0.55)',
  forestTextFaint: 'rgba(234,231,227,0.35)',
  forestSubtleBg: 'rgba(255,255,255,0.04)',
  forestBorder: '1px solid rgba(255,255,255,0.06)',
};

const PAID_STATUSES = new Set(['paid_cash', 'paid_card', 'paid_online', 'paid']);
const formatRupee = n => '₹' + Math.round(Number(n) || 0).toLocaleString('en-IN');

function startOfToday() { const d = new Date(); d.setHours(0, 0, 0, 0); return d; }

export default function AdminDayClose() {
  const { userData } = useAuth();
  const rid = userData?.restaurantId;
  const restaurantName = userData?.restaurantName || 'Your Restaurant';

  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [openingCash, setOpeningCash] = useState('');
  const [closingCash, setClosingCash] = useState('');

  useEffect(() => {
    if (!rid) return;
    setLoading(true);
    getOrders(rid)
      .then(data => { setOrders(data || []); setLoading(false); })
      .catch(err => { console.error('day-close load:', err); setLoading(false); });
  }, [rid]);

  // ─── Today's orders ───
  const todayOrders = useMemo(() => {
    const startTs = startOfToday().getTime() / 1000;
    return orders.filter(o => (o.createdAt?.seconds || 0) >= startTs);
  }, [orders]);

  // ─── Summary derivations ───
  const summary = useMemo(() => {
    const served = todayOrders.filter(o => o.status === 'served');
    const refunded = todayOrders.filter(o => o.paymentStatus === 'refunded');
    const paid = todayOrders.filter(o => PAID_STATUSES.has(o.paymentStatus));
    const unpaid = todayOrders.filter(o =>
      o.status === 'served' && !PAID_STATUSES.has(o.paymentStatus) && o.paymentStatus !== 'refunded'
    );

    const grossRevenue = paid.reduce((s, o) => s + (o.total || 0), 0);
    const refundTotal  = refunded.reduce((s, o) => s + (o.total || 0), 0);
    const netRevenue   = grossRevenue; // PAID_STATUSES excludes refunded, so paid total is already net

    const byMethod = { cash: 0, card: 0, online: 0, other: 0 };
    const countByMethod = { cash: 0, card: 0, online: 0, other: 0 };
    paid.forEach(o => {
      const m = o.paymentStatus;
      if (m === 'paid_cash')         { byMethod.cash += o.total || 0;   countByMethod.cash += 1; }
      else if (m === 'paid_card')    { byMethod.card += o.total || 0;   countByMethod.card += 1; }
      else if (m === 'paid_online')  { byMethod.online += o.total || 0; countByMethod.online += 1; }
      else                            { byMethod.other += o.total || 0; countByMethod.other += 1; }
    });

    return {
      totalOrders: todayOrders.length,
      servedCount: served.length,
      paidCount: paid.length,
      unpaidCount: unpaid.length,
      unpaidTotal: unpaid.reduce((s, o) => s + (o.total || 0), 0),
      refundedCount: refunded.length,
      refundTotal,
      grossRevenue,
      netRevenue,
      byMethod, countByMethod,
    };
  }, [todayOrders]);

  // ─── Cash reconciliation ───
  const opening = Number(openingCash) || 0;
  const closing = Number(closingCash) || 0;
  const expectedCash = opening + summary.byMethod.cash;
  const cashVariance = closing - expectedCash;

  const printZReport = () => {
    if (typeof window !== 'undefined') window.print();
  };

  return (
    <AdminLayout>
      <PageHead title="Day Close" />
      <div style={{ background: A.cream, minHeight: '100vh', fontFamily: A.font }}>
        <style>{`
          @keyframes spin { to { transform: rotate(360deg); } }
          @media print {
            .no-print { display: none !important; }
            body { background: white !important; }
            .z-report-printable {
              box-shadow: none !important;
              border: none !important;
              page-break-inside: avoid;
            }
          }
        `}</style>

        {/* Header */}
        <div style={{ padding: '24px 28px 0' }}>
          <div className="no-print" style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 14, marginBottom: 18, flexWrap: 'wrap' }}>
            <div>
              <div style={{ fontSize: 11, fontWeight: 500, color: A.faintText, letterSpacing: '0.05em', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
                <span>Overview</span>
                <span style={{ opacity: 0.5 }}>›</span>
                <span style={{ color: A.mutedText }}>Day Close</span>
              </div>
              <div style={{ fontWeight: 600, fontSize: 26, color: A.ink, letterSpacing: '-0.4px', lineHeight: 1 }}>
                Day Close
              </div>
              <div style={{ fontSize: 13, color: A.mutedText, marginTop: 6 }}>
                End-of-shift reconciliation for {new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
              </div>
            </div>
            <button
              onClick={printZReport}
              style={{
                padding: '10px 18px', borderRadius: 10, border: 'none',
                background: A.ink, color: A.cream,
                fontSize: 13, fontWeight: 600, fontFamily: A.font, cursor: 'pointer',
                boxShadow: '0 2px 8px rgba(0,0,0,0.10)',
              }}>
              Print Z-report →
            </button>
          </div>
        </div>

        {/* Printable area starts here */}
        <div className="z-report-printable" style={{ padding: '0 28px 60px' }}>
          {/* Signature stats card */}
          <div style={{
            background: `linear-gradient(135deg, ${A.forest} 0%, ${A.forestDarker} 100%)`,
            borderRadius: 14, padding: '20px 24px', marginBottom: 14,
            border: A.forestBorder, boxShadow: '0 4px 16px rgba(0,0,0,0.15)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
              <span style={{ width: 7, height: 7, borderRadius: '50%', background: A.warning, boxShadow: '0 0 8px rgba(196,168,109,0.60)' }} />
              <span style={{ fontSize: 12, fontWeight: 600, letterSpacing: '0.10em', textTransform: 'uppercase', color: A.warning }}>Z-REPORT · {restaurantName}</span>
              <span style={{ flex: 1, height: 1, background: 'rgba(234,231,227,0.08)' }} />
              <span style={{ fontSize: 11, color: A.forestTextMuted, fontWeight: 500 }}>
                {new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
              </span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
              {[
                { label: 'ORDERS',        value: summary.totalOrders,                       color: A.forestText },
                { label: 'PAID',          value: summary.paidCount,                          color: A.success },
                { label: 'UNPAID',        value: summary.unpaidCount,                        color: summary.unpaidCount > 0 ? A.danger : A.forestTextFaint },
                { label: 'GROSS REVENUE', value: formatRupee(summary.grossRevenue),          color: A.warning },
              ].map(s => (
                <div key={s.label} style={{ padding: '16px 18px', borderRadius: 10, background: A.forestSubtleBg, border: A.forestBorder }}>
                  <div style={{ fontSize: 11, fontWeight: 500, letterSpacing: '0.06em', textTransform: 'uppercase', color: A.forestTextFaint, marginBottom: 8 }}>{s.label}</div>
                  <div style={{ fontWeight: 700, fontSize: 26, lineHeight: 1, letterSpacing: '-0.5px', color: s.color }}>{s.value}</div>
                </div>
              ))}
            </div>
          </div>

          {loading ? (
            <div style={{ background: A.shell, borderRadius: 14, padding: 48, textAlign: 'center', boxShadow: A.cardShadow, border: A.border }}>
              <div style={{ width: 28, height: 28, border: `3px solid ${A.warning}`, borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto 12px' }} />
              <div style={{ fontSize: 13, color: A.mutedText }}>Loading today's orders…</div>
            </div>
          ) : (
            <>
              {/* Payment breakdown */}
              <div style={{
                background: A.shell, borderRadius: 14, padding: '22px 26px',
                border: A.border, boxShadow: A.cardShadow, marginBottom: 14,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
                  <span style={{ width: 7, height: 7, borderRadius: '50%', background: A.warning }} />
                  <span style={{ fontSize: 12, fontWeight: 600, letterSpacing: '0.10em', textTransform: 'uppercase', color: A.warning }}>Payment Breakdown</span>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
                  {[
                    { key: 'cash',   label: 'Cash' },
                    { key: 'card',   label: 'Card' },
                    { key: 'online', label: 'UPI / Online' },
                  ].map(m => (
                    <div key={m.key} style={{ padding: '14px 18px', borderRadius: 10, background: A.shellDarker, border: A.border }}>
                      <div style={{ fontSize: 11, fontWeight: 500, letterSpacing: '0.06em', textTransform: 'uppercase', color: A.faintText, marginBottom: 6 }}>
                        {m.label}
                      </div>
                      <div style={{ fontWeight: 700, fontSize: 22, color: A.ink, lineHeight: 1, letterSpacing: '-0.4px' }}>
                        {formatRupee(summary.byMethod[m.key])}
                      </div>
                      <div style={{ fontSize: 11, color: A.mutedText, marginTop: 4 }}>
                        {summary.countByMethod[m.key]} order{summary.countByMethod[m.key] === 1 ? '' : 's'}
                      </div>
                    </div>
                  ))}
                </div>
                {(summary.unpaidCount > 0 || summary.refundedCount > 0) && (
                  <div style={{ marginTop: 14, paddingTop: 14, borderTop: A.border, display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12 }}>
                    <div style={{ padding: '12px 16px', borderRadius: 10, background: 'rgba(217,83,79,0.05)', border: '1px solid rgba(217,83,79,0.15)' }}>
                      <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: A.danger, marginBottom: 6 }}>Unpaid (served)</div>
                      <div style={{ fontWeight: 700, fontSize: 18, color: A.ink }}>{formatRupee(summary.unpaidTotal)} <span style={{ fontSize: 12, color: A.mutedText, fontWeight: 500 }}>· {summary.unpaidCount}</span></div>
                    </div>
                    <div style={{ padding: '12px 16px', borderRadius: 10, background: 'rgba(217,83,79,0.05)', border: '1px solid rgba(217,83,79,0.15)' }}>
                      <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: A.danger, marginBottom: 6 }}>Refunded</div>
                      <div style={{ fontWeight: 700, fontSize: 18, color: A.ink }}>{formatRupee(summary.refundTotal)} <span style={{ fontSize: 12, color: A.mutedText, fontWeight: 500 }}>· {summary.refundedCount}</span></div>
                    </div>
                  </div>
                )}
              </div>

              {/* Cash drawer reconciliation */}
              <div style={{
                background: A.shell, borderRadius: 14, padding: '22px 26px',
                border: A.border, boxShadow: A.cardShadow, marginBottom: 14,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
                  <span style={{ width: 7, height: 7, borderRadius: '50%', background: A.warning }} />
                  <span style={{ fontSize: 12, fontWeight: 600, letterSpacing: '0.10em', textTransform: 'uppercase', color: A.warning }}>Cash Drawer</span>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 14, marginBottom: 14 }}>
                  <div>
                    <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: A.faintText, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 7 }}>
                      Opening cash (float)
                    </label>
                    <input
                      type="number" inputMode="decimal" value={openingCash}
                      onChange={e => setOpeningCash(e.target.value)} placeholder="0"
                      className="no-print"
                      style={{
                        width: '100%', padding: '12px 14px', boxSizing: 'border-box',
                        background: A.shell, border: A.borderStrong, borderRadius: 10,
                        fontSize: 16, color: A.ink, fontFamily: "'JetBrains Mono', monospace", outline: 'none',
                      }}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: A.faintText, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 7 }}>
                      Cash counted at close
                    </label>
                    <input
                      type="number" inputMode="decimal" value={closingCash}
                      onChange={e => setClosingCash(e.target.value)} placeholder="0"
                      className="no-print"
                      style={{
                        width: '100%', padding: '12px 14px', boxSizing: 'border-box',
                        background: A.shell, border: A.borderStrong, borderRadius: 10,
                        fontSize: 16, color: A.ink, fontFamily: "'JetBrains Mono', monospace", outline: 'none',
                      }}
                    />
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, paddingTop: 14, borderTop: A.border }}>
                  <div style={{ padding: '12px 16px', borderRadius: 10, background: A.shellDarker }}>
                    <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: A.faintText, marginBottom: 6 }}>Expected cash</div>
                    <div style={{ fontWeight: 700, fontSize: 20, color: A.ink, fontFamily: "'JetBrains Mono', monospace" }}>{formatRupee(expectedCash)}</div>
                    <div style={{ fontSize: 10, color: A.mutedText, marginTop: 3 }}>
                      {formatRupee(opening)} opening + {formatRupee(summary.byMethod.cash)} cash sales
                    </div>
                  </div>
                  <div style={{ padding: '12px 16px', borderRadius: 10, background: A.shellDarker }}>
                    <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: A.faintText, marginBottom: 6 }}>Counted</div>
                    <div style={{ fontWeight: 700, fontSize: 20, color: A.ink, fontFamily: "'JetBrains Mono', monospace" }}>{formatRupee(closing)}</div>
                  </div>
                  <div style={{
                    padding: '12px 16px', borderRadius: 10,
                    background: Math.abs(cashVariance) < 1 ? 'rgba(63,158,90,0.08)'
                             : cashVariance > 0 ? 'rgba(196,168,109,0.10)'
                             : 'rgba(217,83,79,0.08)',
                    border: `1px solid ${Math.abs(cashVariance) < 1 ? 'rgba(63,158,90,0.22)' : cashVariance > 0 ? 'rgba(196,168,109,0.25)' : 'rgba(217,83,79,0.22)'}`,
                  }}>
                    <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: A.faintText, marginBottom: 6 }}>
                      Variance
                    </div>
                    <div style={{ fontWeight: 700, fontSize: 20, color: Math.abs(cashVariance) < 1 ? A.success : cashVariance > 0 ? A.warningDim : A.danger, fontFamily: "'JetBrains Mono', monospace" }}>
                      {cashVariance === 0 ? '₹0' : (cashVariance > 0 ? '+' : '') + formatRupee(cashVariance)}
                    </div>
                    <div style={{ fontSize: 10, color: A.mutedText, marginTop: 3 }}>
                      {Math.abs(cashVariance) < 1 ? 'Balanced' : cashVariance > 0 ? 'Over (extra cash)' : 'Short'}
                    </div>
                  </div>
                </div>
              </div>

              {/* Footer note (shows in print too) */}
              <div style={{ fontSize: 11, color: A.faintText, textAlign: 'center', marginTop: 18 }}>
                Z-report · {new Date().toLocaleString('en-IN')} · Printed from Advert Radical admin
              </div>
            </>
          )}
        </div>
      </div>
    </AdminLayout>
  );
}

AdminDayClose.getLayout = (page) => page;
