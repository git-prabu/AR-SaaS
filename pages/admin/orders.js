import Head from 'next/head';
import { useEffect, useState, useRef } from 'react';
import { useAuth } from '../../hooks/useAuth';
import AdminLayout from '../../components/layout/AdminLayout';
import { getOrders, updateOrderStatus, updatePaymentStatus } from '../../lib/db';
import { db } from '../../lib/firebase';
import { collection, onSnapshot, query, orderBy } from 'firebase/firestore';

const S = {
    card: { background: '#FFFFFF', border: '1px solid rgba(42,31,16,0.07)', borderRadius: 20, boxShadow: '0 2px 14px rgba(42,31,16,0.05)' },
    h1: { fontFamily: 'Poppins,sans-serif', fontWeight: 800, fontSize: 22, color: '#1E1B18', margin: 0 },
    sub: { fontSize: 13, color: 'rgba(42,31,16,0.45)', marginTop: 4 },
};

const STATUS_FLOW = ['pending', 'preparing', 'ready', 'served'];

const STATUS_META = {
    pending: { label: 'New Order', color: '#E05A3A', bg: 'rgba(224,90,58,0.1)', next: 'preparing', nextLabel: 'Start Preparing' },
    preparing: { label: 'Preparing', color: '#F79B3D', bg: 'rgba(247,155,61,0.1)', next: 'ready', nextLabel: 'Mark Ready' },
    ready: { label: 'Ready', color: '#5A9A78', bg: 'rgba(90,154,120,0.1)', next: 'served', nextLabel: 'Mark Served' },
    served: { label: 'Served', color: 'rgba(42,31,16,0.35)', bg: 'rgba(42,31,16,0.05)', next: null, nextLabel: null },
};

function timeAgo(seconds) {
    if (!seconds) return 'just now';
    const diff = Math.floor(Date.now() / 1000) - seconds;
    if (diff < 60) return `${diff}s ago`;
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    return `${Math.floor(diff / 3600)}h ago`;
}

export default function AdminOrders() {
    const { userData } = useAuth();
    const [orders, setOrders] = useState([]);
    const [filter, setFilter] = useState('active'); // 'active' | 'served' | 'all'
    const [updating, setUpdating] = useState(null);
    const [tick, setTick] = useState(0);
    const [soundOn, setSoundOn] = useState(() => {
        if (typeof window === 'undefined') return true;
        return localStorage.getItem('ar_order_sound') !== 'off';
    });
    const prevCountRef = useRef(0);
    const notifGrantedRef = useRef(false);   // tracks OS notification permission
    const soundOnRef = useRef(soundOn);       // stable ref so snapshot closure stays fresh

    // Keep soundOnRef in sync whenever the toggle changes
    useEffect(() => { soundOnRef.current = soundOn; }, [soundOn]);

    // ── Browser OS notification permission ────────────────────────────────
    useEffect(() => {
        if (typeof window === 'undefined' || !('Notification' in window)) return;
        if (Notification.permission === 'granted') {
            notifGrantedRef.current = true;
        } else if (Notification.permission !== 'denied') {
            Notification.requestPermission().then(p => {
                notifGrantedRef.current = p === 'granted';
            });
        }
    }, []);

    const showOsNotif = (title, body) => {
        if (!notifGrantedRef.current) return;
        try {
            const n = new Notification(title, { body, icon: '/favicon.ico', tag: 'ar-alert' });
            setTimeout(() => n.close(), 8000);
            n.onclick = () => { window.focus(); n.close(); };
        } catch { }
    };

    const toggleSound = () => {
        setSoundOn(prev => {
            const next = !prev;
            localStorage.setItem('ar_order_sound', next ? 'on' : 'off');
            return next;
        });
    };

    const playAlert = () => {
        // Use ref (not state) so the snapshot closure always sees the latest toggle value
        if (!soundOnRef.current) return;
        try { new Audio('/notification.mp3').play().catch(() => { }); } catch { }
    };
    const rid = userData?.restaurantId;

    /* ── Real-time listener ── */
    useEffect(() => {
        if (!rid) return;
        const q = query(
            collection(db, 'restaurants', rid, 'orders'),
            orderBy('createdAt', 'desc')
        );
        const unsub = onSnapshot(q, (snap) => {
            const docs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
            // New order notification
            const newPending = docs.filter(o => o.status === 'pending').length;
            if (prevCountRef.current > 0 && newPending > prevCountRef.current) {
                // Sound + OS notification handled globally by AdminLayout
            }
            prevCountRef.current = newPending;
            setOrders(docs);
        });
        return unsub;
    }, [rid]);

    /* ── Refresh time-ago every 30s ── */
    useEffect(() => {
        const t = setInterval(() => setTick(n => n + 1), 30000);
        return () => clearInterval(t);
    }, []);

    const advance = async (order) => {
        const meta = STATUS_META[order.status];
        if (!meta?.next) return;
        setUpdating(order.id);
        await updateOrderStatus(rid, order.id, meta.next);
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
            <div style={{ background: '#F2F0EC', minHeight: '100vh', padding: 32, fontFamily: 'Inter,sans-serif' }}>
                <div style={{ maxWidth: 960, margin: '0 auto' }}>
                    <style>{`
            @keyframes spin    { to{transform:rotate(360deg)} }
            @keyframes fadeUp  { from{opacity:0;transform:translateY(8px)} to{opacity:1;transform:none} }
            @keyframes pulse   { 0%,100%{opacity:1} 50%{opacity:0.4} }
            @keyframes newOrder{ 0%{background:rgba(224,90,58,0.08)} 50%{background:rgba(224,90,58,0.18)} 100%{background:rgba(224,90,58,0.08)} }
            .order-card { animation: fadeUp 0.22s ease both; }
            .order-card.pending { animation: newOrder 2s ease 3; }
            .adv-btn { padding:8px 16px; border-radius:10px; border:none; font-size:12px; font-weight:700; cursor:pointer; font-family:Inter,sans-serif; transition:all 0.15s; }
            .adv-btn:hover { filter:brightness(0.92); transform:translateY(-1px); }
            .adv-btn:disabled { opacity:0.5; cursor:not-allowed; transform:none; }
            .filter-btn { padding:8px 20px; border-radius:30px; border:none; font-size:12px; font-weight:600; cursor:pointer; font-family:Inter,sans-serif; transition:all 0.15s; }
          `}</style>

                    {/* Header */}
                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
                        <div>
                            <h1 style={S.h1}>Orders</h1>
                            <p style={S.sub}>Live incoming orders from your tables</p>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                            {/* Sound toggle */}
                            <button onClick={toggleSound}
                                title={soundOn ? 'Sound alerts on — click to mute' : 'Sound alerts off — click to enable'}
                                style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '8px 14px', borderRadius: 30, border: `1.5px solid ${soundOn ? 'rgba(90,154,120,0.35)' : 'rgba(42,31,16,0.15)'}`, background: soundOn ? 'rgba(90,154,120,0.08)' : 'rgba(42,31,16,0.04)', color: soundOn ? '#1A6040' : 'rgba(42,31,16,0.4)', fontSize: 12, fontWeight: 700, cursor: 'pointer', transition: 'all 0.18s', fontFamily: 'Inter,sans-serif' }}>
                                <span style={{ fontSize: 14 }}>{soundOn ? '🔔' : '🔕'}</span>
                                {soundOn ? 'Sound On' : 'Sound Off'}
                            </button>
                            {/* New orders badge */}
                            {pendingCount > 0 && (
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 16px', borderRadius: 30, background: 'rgba(224,90,58,0.1)', border: '1px solid rgba(224,90,58,0.25)' }}>
                                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#E05A3A', display: 'inline-block', animation: 'pulse 1.2s infinite' }} />
                                    <span style={{ fontSize: 13, fontWeight: 700, color: '#C04A28' }}>{pendingCount} new order{pendingCount > 1 ? 's' : ''}</span>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Summary pills */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12, marginBottom: 24 }}>
                        {[
                            { label: 'New', count: pendingCount, color: '#E05A3A', bg: 'rgba(224,90,58,0.07)' },
                            { label: 'Preparing', count: preparingCount, color: '#F79B3D', bg: 'rgba(247,155,61,0.1)' },
                            { label: 'Ready', count: readyCount, color: '#5A9A78', bg: 'rgba(90,154,120,0.1)' },
                        ].map(s => (
                            <div key={s.label} style={{ ...S.card, padding: '16px 20px', background: s.bg, display: 'flex', alignItems: 'center', gap: 14 }}>
                                <span style={{ fontFamily: 'Poppins,sans-serif', fontWeight: 800, fontSize: 28, color: s.color, lineHeight: 1 }}>{s.count}</span>
                                <span style={{ fontSize: 13, color: s.color, fontWeight: 600 }}>{s.label}</span>
                            </div>
                        ))}
                    </div>

                    {/* Filter tabs */}
                    <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
                        {[['active', 'Active'], ['served', 'Served'], ['all', 'All']].map(([val, label]) => (
                            <button key={val} className="filter-btn" onClick={() => setFilter(val)}
                                style={{ background: filter === val ? '#1E1B18' : '#fff', color: filter === val ? '#FFF5E8' : 'rgba(42,31,16,0.55)', boxShadow: filter === val ? '0 2px 8px rgba(30,27,24,0.2)' : '0 1px 4px rgba(42,31,16,0.06)' }}>
                                {label}
                            </button>
                        ))}
                    </div>

                    {/* Orders list */}
                    {displayed.length === 0 ? (
                        <div style={{ ...S.card, padding: '60px 32px', textAlign: 'center' }}>
                            <div style={{ fontSize: 40, marginBottom: 12 }}>🛒</div>
                            <div style={{ fontFamily: 'Poppins,sans-serif', fontWeight: 700, fontSize: 16, color: '#1E1B18', marginBottom: 6 }}>
                                {filter === 'active' ? 'No active orders' : 'No orders yet'}
                            </div>
                            <div style={{ fontSize: 13, color: 'rgba(42,31,16,0.4)' }}>
                                {filter === 'active' ? 'New orders will appear here in real time.' : 'Orders from your tables will show up here.'}
                            </div>
                        </div>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                            {displayed.map((order, idx) => {
                                const meta = STATUS_META[order.status] || STATUS_META.pending;
                                const isNew = order.status === 'pending';
                                const secs = order.createdAt?.seconds;
                                const total = order.total || order.items?.reduce((s, i) => s + ((i.price || 0) * (i.qty || 1)), 0) || 0;

                                return (
                                    <div key={order.id} className={`order-card${isNew ? ' pending' : ''}`}
                                        style={{ ...S.card, padding: '20px 24px', animationDelay: `${idx * 0.04}s`, borderLeft: `4px solid ${meta.color}` }}>

                                        {/* Top row */}
                                        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 14, flexWrap: 'wrap', gap: 8 }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                                <div style={{ fontFamily: 'Poppins,sans-serif', fontWeight: 800, fontSize: 18, color: '#1E1B18' }}>
                                                    Table {order.tableNumber || '—'}
                                                </div>
                                                <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 20, background: meta.bg, color: meta.color, letterSpacing: '0.05em' }}>
                                                    {meta.label}
                                                </span>
                                                {isNew && <span style={{ fontSize: 11, fontWeight: 700, color: 'rgba(224,90,58,0.8)', animation: 'pulse 1.2s infinite' }}>● NEW</span>}
                                            </div>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                                                <span style={{ fontSize: 12, color: 'rgba(42,31,16,0.4)' }}>{timeAgo(secs)}</span>
                                                <span style={{ fontFamily: 'Poppins,sans-serif', fontWeight: 800, fontSize: 18, color: '#1E1B18' }}>₹{total}</span>
                                            </div>
                                        </div>

                                        {/* Items */}
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: order.specialInstructions ? 12 : 16 }}>
                                            {(order.items || []).map((item, i) => (
                                                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 14, color: '#1E1B18' }}>
                                                    <span style={{ fontWeight: 500 }}>{item.name} <span style={{ color: 'rgba(42,31,16,0.45)', fontWeight: 400 }}>× {item.qty}</span></span>
                                                    <span style={{ fontWeight: 600, color: 'rgba(42,31,16,0.6)', fontSize: 13 }}>₹{(item.price || 0) * (item.qty || 1)}</span>
                                                </div>
                                            ))}
                                        </div>

                                        {/* Special instructions */}
                                        {order.specialInstructions && (
                                            <div style={{ padding: '8px 12px', borderRadius: 10, background: 'rgba(247,155,61,0.07)', border: '1px solid rgba(247,155,61,0.2)', fontSize: 13, color: 'rgba(42,31,16,0.65)', marginBottom: 16, display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                                                <span style={{ flexShrink: 0 }}>📝</span>
                                                <span>{order.specialInstructions}</span>
                                            </div>
                                        )}

                                        {/* Payment status */}
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
                                            {['paid_cash', 'paid_card', 'paid_online', 'paid'].includes(order.paymentStatus) ? (
                                                <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 20, background: 'rgba(45,139,78,0.12)', color: '#2D8B4E', border: '1px solid rgba(45,139,78,0.25)' }}>
                                                    ✅ {order.paymentStatus === 'paid_card' ? 'Card Paid' : order.paymentStatus === 'paid_online' ? 'Paid Online' : 'Cash Paid'}
                                                </span>
                                            ) : ['cash_requested', 'card_requested', 'online_requested'].includes(order.paymentStatus) ? (
                                                <>
                                                    <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 20, background: 'rgba(247,155,61,0.15)', color: '#A06010', border: '1px solid rgba(247,155,61,0.35)' }}>
                                                        {order.paymentStatus === 'cash_requested' ? '💵 Cash Requested' : order.paymentStatus === 'card_requested' ? '💳 Card Requested' : '📱 Online Payment'}
                                                    </span>
                                                    <button className="adv-btn"
                                                        onClick={async () => {
                                                            setUpdating(order.id + '_pay');
                                                            const paidMap = { cash_requested: 'paid_cash', card_requested: 'paid_card', online_requested: 'paid_online' };
                                                            await updatePaymentStatus(rid, order.id, paidMap[order.paymentStatus] || 'paid_cash');
                                                            setUpdating(null);
                                                        }}
                                                        disabled={updating === order.id + '_pay'}
                                                        style={{ background: '#2D8B4E', color: '#fff', padding: '5px 14px', fontSize: 11 }}>
                                                        ✓ Mark as Paid
                                                    </button>
                                                </>
                                            ) : (
                                                <span style={{ fontSize: 11, color: 'rgba(42,31,16,0.35)' }}>Payment pending</span>
                                            )}
                                        </div>

                                        {/* Action */}
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                                        {meta.next && (
                                            <button className="adv-btn" disabled={updating === order.id}
                                                onClick={() => advance(order)}
                                                style={{ background: meta.color, color: '#fff', padding: '10px 20px' }}>
                                                {updating === order.id
                                                    ? <span style={{ display: 'inline-block', width: 14, height: 14, border: '2px solid rgba(255,255,255,0.4)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
                                                    : `→ ${meta.nextLabel}`}
                                            </button>
                                        )}
                                        {order.status === 'served' && (
                                            <span style={{ fontSize: 12, color: 'rgba(42,31,16,0.35)', fontStyle: 'italic' }}>✓ Completed</span>
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