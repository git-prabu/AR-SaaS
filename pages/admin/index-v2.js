// pages/admin/index-v2.js
//
// ★ REDESIGN EXEMPLAR ★ — duplicate of the admin dashboard home (/admin →
// pages/admin/index.js) on the dark "ok-root" theme (via <OkShell>). The
// original reads orders/calls from AdminDataContext (provided inside
// AdminLayout); since OkShell doesn't provide that, this v2 subscribes to
// orders + waiterCalls DIRECTLY (same collections AdminLayout listens to).
// All derivations (today stats, needs-attention, onboarding checklist) are
// copied verbatim. Original /admin (index.js) untouched.
import Head from 'next/head';
import Link from 'next/link';
import { useEffect, useState, useMemo } from 'react';
import { useRouter } from 'next/router';
import { useAuth } from '../../hooks/useAuth';
import OkShell from '../../components/admin/OkShell';
import { db } from '../../lib/firebase';
import { collection, onSnapshot, query, orderBy } from 'firebase/firestore';
import { getFeedback, getRestaurantById, getAllMenuItems, getStaffMembers, updateRestaurant } from '../../lib/db';
import toast from 'react-hot-toast';

const PAID_STATUSES = new Set(['paid_cash', 'paid_card', 'paid_online', 'paid']);
const REQUESTED_STATUSES = new Set(['cash_requested', 'card_requested', 'online_requested']);
const formatRupee = n => '₹' + Math.round(Number(n) || 0).toLocaleString('en-IN');
function startOfToday() { const d = new Date(); d.setHours(0, 0, 0, 0); return d.getTime() / 1000; }

export default function AdminHomeV2() {
  const { user, userData, loading } = useAuth();
  const router = useRouter();
  const rid = userData?.restaurantId;
  const [restaurantName, setRestaurantName] = useState('Your Restaurant');

  const [orders, setOrders] = useState([]);
  const [ordersLoaded, setOrdersLoaded] = useState(false);
  const [calls, setCalls] = useState([]);
  const [callsLoaded, setCallsLoaded] = useState(false);
  const [feedback, setFeedback] = useState([]);

  useEffect(() => { if (!loading && !user) router.push('/admin/login'); }, [loading, user, router]);

  useEffect(() => {
    if (!rid) return;
    getRestaurantById(rid).then(r => { if (r?.name) setRestaurantName(r.name); }).catch(() => {});
    getFeedback(rid).then(setFeedback).catch(() => {});
  }, [rid]);

  // Direct listeners — replace AdminDataContext (not available outside AdminLayout).
  useEffect(() => {
    if (!rid) return;
    const un = onSnapshot(query(collection(db, 'restaurants', rid, 'orders'), orderBy('createdAt', 'desc')),
      snap => { setOrders(snap.docs.map(d => ({ id: d.id, ...d.data() }))); setOrdersLoaded(true); },
      () => setOrdersLoaded(true));
    return un;
  }, [rid]);
  useEffect(() => {
    if (!rid) return;
    const un = onSnapshot(query(collection(db, 'restaurants', rid, 'waiterCalls'), orderBy('createdAt', 'desc')),
      snap => { setCalls(snap.docs.map(d => ({ id: d.id, ...d.data() }))); setCallsLoaded(true); },
      () => setCallsLoaded(true));
    return un;
  }, [rid]);

  const stats = useMemo(() => {
    const todayStart = startOfToday();
    const todayOrders = orders.filter(o => (o.createdAt?.seconds || 0) >= todayStart);
    const paid = todayOrders.filter(o => PAID_STATUSES.has(o.paymentStatus));
    const pending = orders.filter(o => o.status === 'pending');
    const preparing = orders.filter(o => o.status === 'preparing');
    const ready = orders.filter(o => o.status === 'ready');
    const unpaidServed = todayOrders.filter(o => o.status === 'served' && !PAID_STATUSES.has(o.paymentStatus) && o.paymentStatus !== 'refunded');
    const paymentRequests = orders.filter(o => REQUESTED_STATUSES.has(o.paymentStatus));
    const revenue = paid.reduce((s, o) => s + (o.total || 0), 0);
    const aov = paid.length > 0 ? revenue / paid.length : 0;
    const activeCalls = calls.filter(c => c.status === 'pending');
    const unreadFeedback = feedback.filter(f => !f.isRead).length;
    return {
      ordersToday: todayOrders.length, revenue, aov,
      pending: pending.length, preparing: preparing.length, ready: ready.length,
      unpaidServed: unpaidServed.length, paymentRequests: paymentRequests.length,
      activeCalls: activeCalls.length, unreadFeedback,
    };
  }, [orders, calls, feedback]);

  const alerts = [];
  if (stats.pending > 0) alerts.push({ key: 'pending', label: 'New orders awaiting kitchen', count: stats.pending, tone: 'danger', href: '/admin/orders' });
  if (stats.paymentRequests > 0) alerts.push({ key: 'payrq', label: 'Payment requests to verify', count: stats.paymentRequests, tone: 'warning', href: '/admin/payments' });
  if (stats.activeCalls > 0) alerts.push({ key: 'calls', label: 'Waiter calls waiting', count: stats.activeCalls, tone: 'warning', href: '/admin/orders' });
  if (stats.ready > 0) alerts.push({ key: 'ready', label: 'Ready to serve', count: stats.ready, tone: 'success', href: '/admin/orders' });
  if (stats.unreadFeedback > 0) alerts.push({ key: 'fb', label: 'Unread customer reviews', count: stats.unreadFeedback, tone: 'info', href: '/admin/feedback' });
  if (stats.unpaidServed > 0) alerts.push({ key: 'unpaid', label: 'Unpaid served orders (today)', count: stats.unpaidServed, tone: 'danger', href: '/admin/payments' });

  const toneColors = {
    danger:  { bg: 'rgba(217,83,79,0.10)',  border: 'rgba(217,83,79,0.28)',  text: 'var(--danger)' },
    warning: { bg: 'rgba(196,168,109,0.12)', border: 'rgba(196,168,109,0.28)', text: 'var(--gold)' },
    success: { bg: 'rgba(63,170,99,0.10)',   border: 'rgba(63,170,99,0.26)',   text: 'var(--success)' },
    info:    { bg: 'var(--card-3)',          border: 'var(--line)',            text: 'var(--tx-2)' },
  };

  const loadingData = !ordersLoaded || !callsLoaded;

  if (loading || !user) {
    return (
      <div className="ok-root" style={{ minHeight: '100vh', display: 'grid', placeItems: 'center' }}>
        <Head><title>Dashboard — HaloHelm</title></Head>
        <div style={{ color: 'var(--tx-3)', fontFamily: 'var(--font-body)', fontSize: 14 }}>Loading…</div>
      </div>
    );
  }

  const todayLabel = new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

  return (
    <>
      <Head><title>Dashboard — HaloHelm</title></Head>
      <style>{`@keyframes ok-pulse{0%,100%{opacity:1}50%{opacity:.35}}`}</style>
      <OkShell active={null} eyebrow={todayLabel} title={restaurantName} brand={restaurantName}>
        {/* LIVE TODAY card */}
        <div style={{ background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 16, padding: '20px 24px', marginBottom: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--gold)', animation: 'ok-pulse 2s ease infinite', boxShadow: '0 0 8px rgba(196,168,109,0.6)' }} />
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 700, letterSpacing: '.10em', textTransform: 'uppercase', color: 'var(--gold)' }}>Today · Live</span>
            <span style={{ flex: 1, height: 1, background: 'var(--line-soft)' }} />
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--tx-3)' }}>{new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12 }}>
            {[
              { label: 'Revenue', value: formatRupee(stats.revenue), color: 'var(--gold)' },
              { label: 'Orders', value: stats.ordersToday, color: 'var(--tx)' },
              { label: 'Avg order', value: formatRupee(stats.aov), color: 'var(--tx)' },
              { label: 'In kitchen', value: stats.pending + stats.preparing, color: (stats.pending + stats.preparing) > 0 ? 'var(--gold)' : 'var(--tx-3)' },
            ].map(s => (
              <div key={s.label} style={{ padding: '16px 18px', borderRadius: 12, background: 'var(--card-2)', border: '1px solid var(--line)' }}>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 600, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--tx-3)', marginBottom: 8 }}>{s.label}</div>
                <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 26, lineHeight: 1, letterSpacing: '-0.02em', color: s.color }}>{s.value}</div>
              </div>
            ))}
          </div>
        </div>

        <OnboardingChecklist rid={rid} ordersCount={orders.length} />

        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 320px', gap: 14 }} className="idx-grid">
          {/* Needs attention */}
          <div style={{ background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 16, padding: '22px 26px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
              <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--gold)' }} />
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 700, letterSpacing: '.10em', textTransform: 'uppercase', color: 'var(--gold)' }}>Needs attention</span>
              <span style={{ flex: 1, height: 1, background: 'var(--line-soft)' }} />
            </div>
            {loadingData ? (
              <div style={{ padding: 32, textAlign: 'center', color: 'var(--tx-3)', fontFamily: 'var(--font-body)', fontSize: 13 }}>Loading live data…</div>
            ) : alerts.length === 0 ? (
              <div style={{ padding: '32px 20px', textAlign: 'center' }}>
                <div style={{ fontFamily: 'var(--font-display)', fontSize: 15, fontWeight: 700, color: 'var(--success)', marginBottom: 6 }}>All clear ✓</div>
                <div style={{ fontFamily: 'var(--font-body)', fontSize: 13, color: 'var(--tx-3)' }}>No pending orders, calls, or unread feedback right now.</div>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {alerts.map(a => {
                  const c = toneColors[a.tone];
                  return (
                    <Link key={a.key} href={a.href} style={{ textDecoration: 'none' }}>
                      <div style={{ padding: '14px 18px', borderRadius: 12, background: c.bg, border: `1px solid ${c.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 14, cursor: 'pointer' }}>
                        <span style={{ fontFamily: 'var(--font-display)', fontSize: 14, fontWeight: 600, color: 'var(--tx)' }}>{a.label}</span>
                        <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: 24, color: c.text, lineHeight: 1 }}>{a.count}</span>
                      </div>
                    </Link>
                  );
                })}
              </div>
            )}
          </div>

          {/* Quick actions */}
          <div style={{ background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 16, padding: '22px 26px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
              <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--gold)' }} />
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 700, letterSpacing: '.10em', textTransform: 'uppercase', color: 'var(--gold)' }}>Quick actions</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {[
                { label: 'New walk-in order', href: '/admin/new-order', accent: true },
                { label: 'View all orders', href: '/admin/orders' },
                { label: 'Kitchen station', href: '/admin/kitchen-new' },
                { label: 'Tables', href: '/admin/tables-v2' },
                { label: 'Day close / Z-report', href: '/admin/day-close-v2' },
                { label: 'Reports', href: '/admin/reports-v2' },
                { label: 'Manage menu', href: '/admin/items' },
              ].map(q => (
                <Link key={q.href} href={q.href} style={{ textDecoration: 'none' }}>
                  <div style={{ padding: '12px 16px', borderRadius: 10, background: q.accent ? 'var(--accent)' : 'var(--card-2)', color: q.accent ? 'var(--accent-ink)' : 'var(--tx)', border: q.accent ? 'none' : '1px solid var(--line)', fontFamily: 'var(--font-display)', fontSize: 13, fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer' }}>
                    <span>{q.label}</span><span style={{ fontSize: 13, opacity: 0.7 }}>→</span>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </div>
        <style>{`@media (max-width: 920px){ .idx-grid{ grid-template-columns: 1fr !important; } }`}</style>
      </OkShell>
    </>
  );
}

// Onboarding checklist — dark-themed; logic verbatim from index.js.
function OnboardingChecklist({ rid, ordersCount }) {
  const [restaurant, setRestaurant] = useState(null);
  const [menuItemCount, setMenuItemCount] = useState(0);
  const [staffCount, setStaffCount] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const [dismissing, setDismissing] = useState(false);
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    if (!rid) return;
    let cancelled = false;
    Promise.all([getRestaurantById(rid), getAllMenuItems(rid), getStaffMembers(rid).catch(() => [])])
      .then(([r, items, staff]) => {
        if (cancelled) return;
        setRestaurant(r || {});
        setMenuItemCount((items || []).length);
        setStaffCount((staff || []).length);
        setLoaded(true);
      }).catch(err => { console.error('onboarding checklist load:', err); if (!cancelled) setLoaded(true); });
    return () => { cancelled = true; };
  }, [rid]);

  if (!loaded || hidden || restaurant?.onboardingComplete === true) return null;

  const profileDone = !!(restaurant?.address?.trim() && restaurant?.phone?.trim() && restaurant?.cuisine?.trim());
  const itemsDone = menuItemCount > 0;
  const tablesDone = !!(restaurant?.tableCount > 0) || ordersCount > 0;
  const staffDone = staffCount > 0;
  const orderDone = ordersCount > 0;

  const steps = [
    { key: 'profile', done: profileDone, label: 'Complete restaurant profile', sub: 'Address, phone, cuisine — shown on customer menu + bills.', href: '/admin/business-info' },
    { key: 'items', done: itemsDone, label: 'Add your first menu item', sub: 'Photo, name, price. AR model can come later.', href: '/admin/requests' },
    { key: 'tables', done: tablesDone, label: 'Generate table QR codes', sub: 'Print + place on each table — customers scan to order.', href: '/admin/qrcode' },
    { key: 'staff', done: staffDone, label: 'Invite kitchen + waiter staff', sub: 'Each staff gets a PIN to log in on their tablet.', href: '/admin/staff' },
    { key: 'order', done: orderDone, label: 'Place a test order', sub: 'Walk-in order from New Order or scan a table QR yourself.', href: '/admin/new-order' },
  ];

  const completedCount = steps.filter(s => s.done).length;
  const allDone = completedCount === steps.length;
  const progressPct = Math.round((completedCount / steps.length) * 100);

  const dismiss = async () => {
    setDismissing(true);
    try {
      await updateRestaurant(rid, { onboardingComplete: true });
      setHidden(true);
      toast.success(allDone ? "You're all set up!" : 'Checklist dismissed.');
    } catch (e) { console.error('dismiss onboarding:', e); toast.error('Could not save — try again.'); }
    finally { setDismissing(false); }
  };

  return (
    <div style={{ background: 'var(--card)', borderRadius: 16, border: '1px solid var(--line)', padding: '22px 26px', marginBottom: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
        <span style={{ width: 7, height: 7, borderRadius: '50%', background: allDone ? 'var(--success)' : 'var(--gold)' }} />
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 700, letterSpacing: '.10em', textTransform: 'uppercase', color: allDone ? 'var(--success)' : 'var(--gold)' }}>{allDone ? "You're all set" : 'Get started'}</span>
        <span style={{ flex: 1, height: 1, background: 'var(--line-soft)' }} />
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--tx-3)' }}>{completedCount} / {steps.length} ({progressPct}%)</span>
        <button onClick={dismiss} disabled={dismissing} title="Hide this checklist permanently"
          style={{ padding: '5px 12px', borderRadius: 8, border: '1px solid var(--line)', background: 'var(--card-2)', fontFamily: 'var(--font-display)', fontSize: 11, fontWeight: 600, color: 'var(--tx-2)', cursor: dismissing ? 'not-allowed' : 'pointer', opacity: dismissing ? 0.5 : 1 }}>
          {dismissing ? '…' : (allDone ? 'Done — hide' : 'Dismiss')}
        </button>
      </div>
      <div style={{ height: 4, background: 'var(--card-3)', borderRadius: 2, overflow: 'hidden', marginBottom: 18 }}>
        <div style={{ width: `${progressPct}%`, height: '100%', background: allDone ? 'var(--success)' : 'linear-gradient(90deg, var(--gold), var(--gold-dim))', transition: 'width 0.3s ease' }} />
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {steps.map(s => (
          <div key={s.key} style={{ display: 'grid', gridTemplateColumns: '24px 1fr auto', gap: 14, alignItems: 'center', padding: '10px 14px', borderRadius: 10, background: s.done ? 'rgba(63,170,99,0.06)' : 'var(--card-2)', border: s.done ? '1px solid rgba(63,170,99,0.18)' : '1px solid var(--line)', opacity: s.done ? 0.8 : 1 }}>
            <div style={{ width: 22, height: 22, borderRadius: 6, border: s.done ? '1.5px solid var(--success)' : '1.5px solid var(--line)', background: s.done ? 'var(--success)' : 'transparent', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 13, fontWeight: 700 }}>{s.done ? '✓' : ''}</div>
            <div>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: 13, fontWeight: 600, color: 'var(--tx)', textDecoration: s.done ? 'line-through' : 'none' }}>{s.label}</div>
              <div style={{ fontFamily: 'var(--font-body)', fontSize: 11, color: 'var(--tx-3)', marginTop: 2 }}>{s.sub}</div>
            </div>
            {!s.done && (
              <Link href={s.href} style={{ textDecoration: 'none' }}>
                <span style={{ padding: '6px 14px', borderRadius: 8, background: 'var(--accent)', color: 'var(--accent-ink)', fontFamily: 'var(--font-display)', fontSize: 11, fontWeight: 700, display: 'inline-block' }}>Go →</span>
              </Link>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

AdminHomeV2.getLayout = (page) => page;
