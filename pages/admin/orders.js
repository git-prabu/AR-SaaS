import Head from 'next/head';
import { useEffect, useState } from 'react';
import { useAuth } from '../../hooks/useAuth';
import AdminLayout from '../../components/layout/AdminLayout';
import { updateOrderStatus, updatePaymentStatus } from '../../lib/db';
import { useAdminOrders } from '../../contexts/AdminDataContext';
import toast from 'react-hot-toast';
import { timeAgo, T, ADMIN_STYLES as S } from '../../lib/utils';

const STATUS_META = {
  pending:   { label: 'New Order',  color: T.danger,  bg: T.dangerLight,  next: 'preparing', nextLabel: 'Start Preparing' },
  preparing: { label: 'Preparing',  color: T.warning, bg: T.warningLight, next: 'ready',     nextLabel: 'Mark Ready' },
  ready:     { label: 'Ready',      color: T.success, bg: T.successLight, next: 'served',    nextLabel: 'Mark Served' },
  served:    { label: 'Served',     color: T.stone,   bg: T.accentLight,  next: null,        nextLabel: null },
};

export default function AdminOrders() {
  const { userData } = useAuth();
  const { orders } = useAdminOrders();
  const [filter, setFilter] = useState('active');
  const [updating, setUpdating] = useState(null);
  const [tick, setTick] = useState(0);
  const rid = userData?.restaurantId;

  useEffect(() => {
    const t = setInterval(() => setTick(n => n + 1), 30000);
    return () => clearInterval(t);
  }, []);

  const advance = async (order) => {
    const meta = STATUS_META[order.status];
    if (!meta?.next) return;
    setUpdating(order.id);
    try { await updateOrderStatus(rid, order.id, meta.next); }
    catch { toast.error('Failed to update order status'); }
    setUpdating(null);
  };

  const displayed = orders.filter(o => {
    if (filter === 'active') return o.status !== 'served';
    if (filter === 'served') return o.status === 'served';
    return true;
  });

  const pendingCount = orders.filter(o => o.status === 'pending').length;
  const preparingCount = orders.filter(o => o.status === 'preparing').length;
  const readyCount = orders.filter(o => o.status === 'ready').length;

  return (
    <AdminLayout>
      <Head><title>Orders — Advert Radical</title></Head>
      <div className="orders-page" style={{ background: T.cream, minHeight: '100vh', fontFamily: T.font }}>
        <div style={{ maxWidth: 980, margin: '0 auto' }}>
          <style>{`
            @keyframes spin    { to{transform:rotate(360deg)} }
            @keyframes fadeUp  { from{opacity:0;transform:translateY(8px)} to{opacity:1;transform:none} }
            @keyframes pulse   { 0%,100%{opacity:1} 50%{opacity:0.4} }
            .order-card { animation: fadeUp 0.25s ease both; transition: all 0.2s; }
            .order-card:hover { box-shadow: ${T.shadowElevated}; transform: translateY(-1px); }
            .adv-btn {
              padding:10px 20px; border-radius:${T.radiusBtn}px; border:none;
              font-size:12px; font-weight:600; cursor:pointer; font-family:${T.font};
              transition:all 0.18s; letter-spacing:-0.1px; box-shadow:${T.shadowBtn};
            }
            .adv-btn:hover { filter:brightness(1.06); transform:translateY(-1px); box-shadow:${T.shadowElevated}; }
            .adv-btn:disabled { opacity:0.5; cursor:not-allowed; transform:none; box-shadow:none; }
            .filter-btn {
              padding:9px 24px; border-radius:${T.radiusPill}px; border:none;
              font-size:12px; font-weight:600; cursor:pointer; font-family:${T.font};
              transition:all 0.18s; letter-spacing:-0.1px;
            }
            .filter-btn:hover { transform:translateY(-1px); }
            .stat-card { transition:all 0.2s; cursor:default; }
            .stat-card:hover { transform:translateY(-2px); }
            .orders-page { padding:36px 36px 64px; }
            .stat-grid { grid-template-columns:repeat(3,1fr); }
            @media(max-width:767px){
              .orders-page { padding:20px 16px 40px; }
              .stat-grid { grid-template-columns:repeat(3,1fr); gap:8px !important; }
              .stat-card { padding:14px 12px !important; flex-direction:column !important; gap:4px !important; text-align:center; }
              .stat-card .stat-num { font-size:22px !important; }
              .stat-card .stat-label { font-size:8px !important; letter-spacing:1.5px !important; }
              .order-card { padding:18px 16px !important; }
              .order-top { flex-direction:column; gap:10px !important; }
              .order-items { padding:10px 12px !important; }
              .order-actions { flex-direction:column; align-items:stretch !important; }
              .order-actions .adv-btn { text-align:center; }
            }
          `}</style>

          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 32, flexWrap: 'wrap', gap: 12 }}>
            <div>
              <h1 style={S.h1}>Orders</h1>
              <p style={S.sub}>Live incoming orders from your tables</p>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              {pendingCount > 0 && (
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 8, padding: '8px 18px',
                  borderRadius: T.radiusPill, background: T.dangerLight, border: `1px solid ${T.sand}`,
                }}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: T.danger, animation: 'pulse 1.5s infinite' }} />
                  <span style={{ fontSize: 12, fontWeight: 700, color: T.danger }}>{pendingCount} new</span>
                </div>
              )}
              <div style={{
                display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, fontWeight: 600,
                padding: '7px 16px', borderRadius: T.radiusPill,
                background: T.accent, color: '#C4A86D', border: 'none',
                boxShadow: T.shadowBtn,
              }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#C4A86D', animation: 'pulse 2s infinite' }} />
                Live
              </div>
            </div>
          </div>

          {/* Summary cards */}
          <div className="stat-grid" style={{ display: 'grid', gap: 14, marginBottom: 32 }}>
            {[
              { label: 'NEW', count: pendingCount },
              { label: 'PREPARING', count: preparingCount },
              { label: 'READY', count: readyCount },
            ].map(s => (
              <div key={s.label} className="stat-card" style={{
                padding: '20px 24px', background: T.white,
                borderRadius: T.radiusCard,
                display: 'flex', alignItems: 'center', gap: 14,
                border: `1px solid ${T.sand}`,
                boxShadow: T.shadowCard,
              }}>
                <span className="stat-num" style={{ fontWeight: 700, fontSize: 28, color: T.ink, lineHeight: 1, letterSpacing: '-1px' }}>{s.count}</span>
                <span className="stat-label" style={{ fontSize: 11, color: T.stone, fontWeight: 600, letterSpacing: '2px' }}>{s.label}</span>
              </div>
            ))}
          </div>

          {/* Filter tabs */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 28 }}>
            {[['active', 'Active'], ['served', 'Served'], ['all', 'All']].map(([val, label]) => (
              <button key={val} className="filter-btn" onClick={() => setFilter(val)}
                style={{
                  background: filter === val ? T.accent : T.white,
                  color: filter === val ? '#EAE7E3' : T.stone,
                  boxShadow: filter === val ? T.shadowBtn : T.shadowCard,
                  border: filter === val ? 'none' : `1px solid ${T.sand}`,
                }}>
                {label}
              </button>
            ))}
          </div>

          {/* Orders list */}
          {displayed.length === 0 ? (
            <div style={{ ...S.card, padding: '72px 32px', textAlign: 'center' }}>
              <div style={{ width: 48, height: 3, background: T.sand, borderRadius: 2, margin: '0 auto 20px' }} />
              <div style={{ fontWeight: 600, fontSize: 16, color: T.ink, marginBottom: 8, letterSpacing: '-0.2px' }}>
                {filter === 'active' ? 'No active orders' : 'No orders yet'}
              </div>
              <div style={{ fontSize: 13, color: T.stone, lineHeight: 1.6 }}>
                {filter === 'active' ? 'New orders will appear here in real time.' : 'Orders from your tables will show up here.'}
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {displayed.map((order, idx) => {
                const meta = STATUS_META[order.status] || STATUS_META.pending;
                const isNew = order.status === 'pending';
                const secs = order.createdAt?.seconds;
                const total = order.total || order.items?.reduce((s, i) => s + ((i.price || 0) * (i.qty || 1)), 0) || 0;

                return (
                  <div key={order.id} className="order-card"
                    style={{ ...S.card, padding: '24px 26px', animationDelay: `${idx * 0.04}s`, borderLeft: `4px solid ${meta.color}` }}>

                    {/* Top row */}
                    <div className="order-top" style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 8 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                        <div style={{ fontWeight: 700, fontSize: 17, color: T.ink, letterSpacing: '-0.4px' }}>
                          Table {order.tableNumber || '—'}
                        </div>
                        <span style={{
                          fontSize: 11, fontWeight: 600, padding: '4px 12px', borderRadius: T.radiusPill,
                          background: meta.bg, color: meta.color, border: `1px solid ${T.sand}`,
                          display: 'inline-flex', alignItems: 'center', gap: 6,
                        }}>
                          <span style={{ width: 6, height: 6, borderRadius: '50%', background: meta.color }} />
                          {meta.label}
                        </span>
                        {isNew && <span style={{ fontSize: 10, fontWeight: 800, color: T.danger, animation: 'pulse 1.5s infinite', letterSpacing: '1.5px' }}>NEW</span>}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
                        <span style={{ fontSize: 12, color: T.mist, fontWeight: 500 }}>{timeAgo(secs)}</span>
                        <span style={{ fontWeight: 800, fontSize: 17, color: T.ink, letterSpacing: '-0.5px' }}>₹{total}</span>
                      </div>
                    </div>

                    {/* Items */}
                    <div className="order-items" style={{
                      display: 'flex', flexDirection: 'column', gap: 6,
                      marginBottom: order.specialInstructions ? 14 : 18,
                      padding: '12px 16px', borderRadius: T.radiusBtn,
                      background: T.cream, border: `1px solid ${T.sand}`,
                    }}>
                      {(order.items || []).map((item, i) => (
                        <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 13, color: T.charcoal }}>
                          <span style={{ fontWeight: 500 }}>{item.name} <span style={{ color: T.mist, fontWeight: 400 }}>× {item.qty}</span></span>
                          <span style={{ fontWeight: 600, color: T.stone, fontSize: 12 }}>₹{(item.price || 0) * (item.qty || 1)}</span>
                        </div>
                      ))}
                    </div>

                    {/* Special instructions */}
                    {order.specialInstructions && (
                      <div style={{
                        padding: '10px 14px', borderRadius: T.radiusBtn, fontSize: 13,
                        background: T.warningLight, border: `1px solid ${T.sand}`,
                        color: T.charcoal, marginBottom: 18, lineHeight: 1.5,
                      }}>
                        <span style={{ color: T.warning, fontWeight: 700, fontSize: 10, marginRight: 8, letterSpacing: '1px' }}>NOTE</span>
                        {order.specialInstructions}
                      </div>
                    )}

                    {/* Payment status */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
                      {['paid_cash', 'paid_card', 'paid_online', 'paid'].includes(order.paymentStatus) ? (
                        <span style={{
                          fontSize: 11, fontWeight: 600, padding: '5px 14px', borderRadius: T.radiusPill,
                          background: T.successLight, color: T.success, border: `1px solid ${T.sand}`,
                          display: 'inline-flex', alignItems: 'center', gap: 6,
                        }}>
                          <span style={{ width: 6, height: 6, borderRadius: '50%', background: T.success }} />
                          {order.paymentStatus === 'paid_card' ? 'Card Verified' : order.paymentStatus === 'paid_online' ? 'UPI Verified' : 'Cash Verified'}
                        </span>
                      ) : ['cash_requested', 'card_requested', 'online_requested'].includes(order.paymentStatus) ? (
                        <>
                          <span style={{
                            fontSize: 11, fontWeight: 600, padding: '5px 14px', borderRadius: T.radiusPill,
                            background: T.warningLight, color: T.warning, border: `1px solid ${T.sand}`,
                            animation: 'pulse 2s infinite',
                          }}>
                            {order.paymentStatus === 'cash_requested' ? 'Cash — Awaiting' : order.paymentStatus === 'card_requested' ? 'Card — Awaiting' : 'UPI — Awaiting'}
                          </span>
                          <button className="adv-btn"
                            onClick={async () => {
                              setUpdating(order.id + '_pay');
                              try {
                                const paidMap = { cash_requested: 'paid_cash', card_requested: 'paid_card', online_requested: 'paid_online' };
                                await updatePaymentStatus(rid, order.id, paidMap[order.paymentStatus] || 'paid_cash');
                              } catch { toast.error('Failed to verify payment'); }
                              setUpdating(null);
                            }}
                            disabled={updating === order.id + '_pay'}
                            style={{ background: T.success, color: '#fff', padding: '7px 16px', fontSize: 11 }}>
                            Verify
                          </button>
                          <button className="adv-btn"
                            onClick={async () => {
                              setUpdating(order.id + '_pay');
                              try { await updatePaymentStatus(rid, order.id, 'payment_issue'); }
                              catch { toast.error('Failed to update'); }
                              setUpdating(null);
                            }}
                            disabled={updating === order.id + '_pay'}
                            style={{ background: T.dangerLight, color: T.danger, padding: '7px 14px', fontSize: 11, border: `1px solid ${T.sand}`, boxShadow: 'none' }}>
                            Issue
                          </button>
                        </>
                      ) : order.paymentStatus === 'payment_issue' ? (
                        <>
                          <span style={{ fontSize: 11, fontWeight: 600, padding: '5px 14px', borderRadius: T.radiusPill, background: T.dangerLight, color: T.danger, border: `1px solid ${T.sand}` }}>
                            Payment Issue
                          </span>
                          <button className="adv-btn"
                            onClick={async () => {
                              setUpdating(order.id + '_pay');
                              try { await updatePaymentStatus(rid, order.id, 'paid_cash'); }
                              catch { toast.error('Failed to update'); }
                              setUpdating(null);
                            }}
                            disabled={updating === order.id + '_pay'}
                            style={{ background: T.success, color: '#fff', padding: '6px 16px', fontSize: 11 }}>
                            Resolved — Mark Paid
                          </button>
                        </>
                      ) : (
                        <span style={{ fontSize: 11, color: T.mist, fontWeight: 500 }}>Payment pending</span>
                      )}
                    </div>

                    {/* Action */}
                    <div className="order-actions" style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                      {meta.next && (
                        <button className="adv-btn" disabled={updating === order.id}
                          onClick={() => advance(order)}
                          style={{ background: meta.color, color: '#fff', padding: '11px 24px', fontSize: 13 }}>
                          {updating === order.id
                            ? <span style={{ display: 'inline-block', width: 14, height: 14, border: '2px solid rgba(255,255,255,0.4)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
                            : meta.nextLabel}
                        </button>
                      )}
                      {order.status === 'served' && (
                        <span style={{ fontSize: 12, color: T.stone, fontWeight: 600 }}>Completed</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </AdminLayout>
  );
}

AdminOrders.getLayout = (page) => page;
