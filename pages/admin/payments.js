import Head from 'next/head';
import { useEffect, useState } from 'react';
import { useAuth } from '../../hooks/useAuth';
import AdminLayout from '../../components/layout/AdminLayout';
import { updatePaymentStatus } from '../../lib/db';
import { useAdminOrders } from '../../contexts/AdminDataContext';
import { timeAgo, ADMIN_STYLES as S } from '../../lib/utils';

const PAYMENT_STATUS = {
    cash_requested: { label: 'Cash Requested', icon: '💵', color: '#A06010', bg: 'rgba(196,168,109,0.12)', border: 'rgba(196,168,109,0.3)' },
    card_requested: { label: 'Card Requested', icon: '💳', color: '#2A5FA0', bg: 'rgba(74,128,192,0.1)', border: 'rgba(74,128,192,0.25)' },
    online_requested: { label: 'Online Payment', icon: '📱', color: '#6030A0', bg: 'rgba(96,48,160,0.1)', border: 'rgba(96,48,160,0.25)' },
    paid_cash: { label: 'Paid — Cash', icon: '✅', color: '#4A7A5E', bg: 'rgba(74,122,94,0.08)', border: 'rgba(74,122,94,0.2)' },
    paid_card: { label: 'Paid — Card', icon: '✅', color: '#4A7A5E', bg: 'rgba(74,122,94,0.08)', border: 'rgba(74,122,94,0.2)' },
    paid_online: { label: 'Paid — Online', icon: '✅', color: '#4A7A5E', bg: 'rgba(74,122,94,0.08)', border: 'rgba(74,122,94,0.2)' },
    unpaid: { label: 'Unpaid', icon: '⏳', color: 'rgba(38,52,49,0.45)', bg: 'rgba(38,52,49,0.04)', border: 'rgba(38,52,49,0.1)' },
};

export default function AdminPayments() {
    const { userData } = useAuth();
    const { orders: allOrders } = useAdminOrders(); // shared from AdminLayout — no duplicate listener
    const [filter, setFilter] = useState('pending'); // 'pending' | 'completed' | 'all'
    const [updating, setUpdating] = useState(null);
    const [tick, setTick] = useState(0);
    const rid = userData?.restaurantId;

    // Filter to only show orders relevant to payments
    const orders = allOrders.filter(o =>
        o.status === 'served' ||
        ['cash_requested', 'card_requested', 'online_requested', 'paid_cash', 'paid_card', 'paid_online'].includes(o.paymentStatus)
    );

    useEffect(() => {
        const t = setInterval(() => setTick(n => n + 1), 30000);
        return () => clearInterval(t);
    }, []);

    const isPaid = (ps) => ['paid_cash', 'paid_card', 'paid_online', 'paid'].includes(ps);
    const isPending = (o) => !isPaid(o.paymentStatus);

    const displayed = orders.filter(o => {
        if (filter === 'pending') return isPending(o);
        if (filter === 'completed') return isPaid(o.paymentStatus);
        return true;
    });

    const pendingCount = orders.filter(o => isPending(o)).length;
    const completedCount = orders.filter(o => isPaid(o.paymentStatus)).length;
    const totalRevenue = orders.filter(o => isPaid(o.paymentStatus)).reduce((s, o) => s + (o.total || 0), 0);

    const markPaid = async (orderId, method) => {
        if (!rid) return;
        setUpdating(orderId);
        const statusMap = { cash_requested: 'paid_cash', card_requested: 'paid_card', online_requested: 'paid_online' };
        await updatePaymentStatus(rid, orderId, statusMap[method] || 'paid_cash');
        setUpdating(null);
    };

    return (
        <AdminLayout>
            <Head><title>Payments — Advert Radical</title></Head>
            <div style={{ background: '#EAE7E3', minHeight: '100vh', padding: 32, fontFamily: 'Outfit, sans-serif' }}>
                <div style={{ maxWidth: 960, margin: '0 auto' }}>
                    <style>{`
            @keyframes spin    { to{transform:rotate(360deg)} }
            @keyframes fadeUp  { from{opacity:0;transform:translateY(8px)} to{opacity:1;transform:none} }
            @keyframes pulse   { 0%,100%{opacity:1} 50%{opacity:0.4} }
            .pay-card { animation: fadeUp 0.22s ease both; }
            .pay-btn { padding:10px 20px; border-radius:10px; border:none; font-size:12px; font-weight:600; cursor:pointer; font-family:Outfit,sans-serif; transition:all 0.18s; letter-spacing:0.02em; }
            .pay-btn:hover { filter:brightness(0.93); transform:translateY(-1px); box-shadow:0 4px 12px rgba(38,52,49,0.12); }
            .pay-btn:disabled { opacity:0.5; cursor:not-allowed; transform:none; box-shadow:none; }
            .pf-btn { padding:9px 22px; border-radius:30px; border:none; font-size:12px; font-weight:600; cursor:pointer; font-family:Outfit,sans-serif; transition:all 0.18s; letter-spacing:0.01em; }
          `}</style>

                    {/* Header */}
                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
                        <div>
                            <h1 style={S.h1}>Payments</h1>
                            <p style={S.sub}>Track and manage table payments</p>
                        </div>
                    </div>

                    {/* Summary cards */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12, marginBottom: 24 }}>
                        <div style={{ ...S.card, padding: '18px 22px', background: 'rgba(196,168,109,0.10)', display: 'flex', alignItems: 'center', gap: 14 }}>
                            <span style={{ fontFamily: 'Outfit, sans-serif', fontWeight: 700, fontSize: 28, color: '#C4A86D', lineHeight: 1 }}>{pendingCount}</span>
                            <span style={{ fontSize: 13, color: '#A06010', fontWeight: 600, fontFamily: 'Outfit, sans-serif' }}>Pending</span>
                        </div>
                        <div style={{ ...S.card, padding: '18px 22px', background: 'rgba(74,122,94,0.10)', display: 'flex', alignItems: 'center', gap: 14 }}>
                            <span style={{ fontFamily: 'Outfit, sans-serif', fontWeight: 700, fontSize: 28, color: '#4A7A5E', lineHeight: 1 }}>{completedCount}</span>
                            <span style={{ fontSize: 13, color: '#1A6B38', fontWeight: 600, fontFamily: 'Outfit, sans-serif' }}>Completed</span>
                        </div>
                        <div style={{ ...S.card, padding: '18px 22px', background: 'rgba(38,52,49,0.08)', display: 'flex', alignItems: 'center', gap: 14 }}>
                            <span style={{ fontFamily: 'Outfit, sans-serif', fontWeight: 700, fontSize: 28, color: '#263431', lineHeight: 1 }}>₹{totalRevenue}</span>
                            <span style={{ fontSize: 13, color: '#263431', fontWeight: 600, fontFamily: 'Outfit, sans-serif', opacity: 0.7 }}>Collected</span>
                        </div>
                    </div>

                    {/* Filter tabs */}
                    <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
                        {[['pending', 'Pending'], ['completed', 'Completed'], ['all', 'All']].map(([val, label]) => (
                            <button key={val} className="pf-btn" onClick={() => setFilter(val)}
                                style={{ background: filter === val ? '#263431' : '#fff', color: filter === val ? '#EAE7E3' : 'rgba(38,52,49,0.55)', boxShadow: filter === val ? '0 2px 8px rgba(28,40,37,0.2)' : '0 1px 4px rgba(38,52,49,0.06)' }}>
                                {label}{val === 'pending' && pendingCount > 0 ? ` (${pendingCount})` : ''}
                            </button>
                        ))}
                    </div>

                    {/* Payments list */}
                    {displayed.length === 0 ? (
                        <div style={{ ...S.card, padding: '60px 32px', textAlign: 'center' }}>
                            <div style={{ fontSize: 40, marginBottom: 12 }}>💰</div>
                            <div style={{ fontFamily: "'Playfair Display', Georgia, serif", fontWeight: 700, fontSize: 17, color: '#263431', marginBottom: 6 }}>
                                {filter === 'pending' ? 'No pending payments' : filter === 'completed' ? 'No completed payments' : 'No payments yet'}
                            </div>
                            <div style={{ fontSize: 13, color: 'rgba(38,52,49,0.4)' }}>
                                {filter === 'pending' ? 'Payment requests from customers will appear here.' : 'Payments will show up once orders are served and settled.'}
                            </div>
                        </div>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                            {displayed.map((order, idx) => {
                                const ps = PAYMENT_STATUS[order.paymentStatus] || PAYMENT_STATUS.unpaid;
                                const paid = isPaid(order.paymentStatus);
                                const secs = order.createdAt?.seconds;
                                const total = order.total || order.items?.reduce((s, i) => s + ((i.price || 0) * (i.qty || 1)), 0) || 0;

                                return (
                                    <div key={order.id} className="pay-card"
                                        style={{ ...S.card, padding: '20px 24px', animationDelay: `${idx * 0.04}s`, borderLeft: `4px solid ${ps.color}`, opacity: paid ? 0.7 : 1 }}>

                                        {/* Top row */}
                                        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                                <div style={{ fontFamily: "'Playfair Display', Georgia, serif", fontWeight: 700, fontSize: 18, color: '#263431' }}>
                                                    Table {order.tableNumber || '—'}
                                                </div>
                                                <span style={{ fontSize: 11, fontWeight: 600, padding: '4px 12px', borderRadius: 24, background: ps.bg, color: ps.color, border: `1px solid ${ps.border}`, fontFamily: 'Outfit, sans-serif', letterSpacing: '0.01em', whiteSpace: 'nowrap' }}>
                                                    {ps.icon} {ps.label}
                                                </span>
                                            </div>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                                                <span style={{ fontSize: 12, color: 'rgba(38,52,49,0.4)' }}>{timeAgo(secs)}</span>
                                                <span style={{ fontFamily: 'Outfit, sans-serif', fontWeight: 700, fontSize: 18, color: '#263431' }}>₹{total}</span>
                                            </div>
                                        </div>

                                        {/* Items summary */}
                                        <div style={{ fontSize: 13, color: 'rgba(38,52,49,0.55)', marginBottom: 14, lineHeight: 1.6 }}>
                                            {(order.items || []).map(i => `${i.name} × ${i.qty}`).join(', ')}
                                        </div>

                                        {/* Order status */}
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: paid ? 0 : 14, fontSize: 11, color: 'rgba(38,52,49,0.4)' }}>
                                            <span>Order: {order.status || 'pending'}</span>
                                        </div>

                                        {/* Action buttons */}
                                        {!paid && (
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                                                <button className="pay-btn"
                                                    disabled={updating === order.id}
                                                    onClick={() => markPaid(order.id, order.paymentStatus)}
                                                    style={{ background: '#4A7A5E', color: '#fff', padding: '10px 22px' }}>
                                                    {updating === order.id
                                                        ? <span style={{ display: 'inline-block', width: 14, height: 14, border: '2px solid rgba(255,255,255,0.4)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
                                                        : '✓ Mark as Paid'}
                                                </button>
                                                {order.paymentStatus === 'unpaid' && (
                                                    <span style={{ fontSize: 12, color: 'rgba(38,52,49,0.4)', fontStyle: 'italic' }}>
                                                        Customer hasn't selected a payment method yet
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
        </AdminLayout>
    );
}

AdminPayments.getLayout = (page) => page;
