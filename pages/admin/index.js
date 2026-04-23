// pages/admin/index.js
// Admin dashboard HOME — command-center overview. Answers "what needs my
// attention right now?" at a glance:
//   - Today's revenue + orders + average order value
//   - Pending orders, active waiter calls (live from AdminDataContext)
//   - Unread feedback count
//   - Quick actions (new order, close day, menu items)
//
// IMPORTANT — DashboardContent is a CHILD of AdminLayout. The hooks
// useAdminOrders / useAdminWaiterCalls read from AdminDataContext, which
// is provided INSIDE AdminLayout. If we called these hooks in the outer
// AdminHome function, they'd run before the provider wrapped them and
// return empty defaults forever ("Loading live data…" stuck forever).
// Extracting the content keeps hooks inside the provider scope.
import { useEffect, useState, useMemo } from 'react';
import Link from 'next/link';
import { useAuth } from '../../hooks/useAuth';
import AdminLayout from '../../components/layout/AdminLayout';
import PageHead from '../../components/PageHead';
import { useAdminOrders, useAdminWaiterCalls } from '../../contexts/AdminDataContext';
import { getFeedback } from '../../lib/db';

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
const REQUESTED_STATUSES = new Set(['cash_requested', 'card_requested', 'online_requested']);
const formatRupee = n => '₹' + Math.round(Number(n) || 0).toLocaleString('en-IN');
function startOfToday() { const d = new Date(); d.setHours(0, 0, 0, 0); return d.getTime() / 1000; }

// ─── DashboardContent — renders INSIDE AdminLayout, can read context ───
function DashboardContent() {
  const { userData } = useAuth();
  const rid = userData?.restaurantId;
  const restaurantName = userData?.restaurantName || 'Your Restaurant';
  const { orders, loaded: ordersLoaded } = useAdminOrders();
  const { calls, loaded: callsLoaded } = useAdminWaiterCalls();

  const [feedback, setFeedback] = useState([]);
  useEffect(() => {
    if (!rid) return;
    getFeedback(rid).then(setFeedback).catch(() => {});
  }, [rid]);

  // Today-scoped derivations from the shared live streams (no extra listeners).
  const stats = useMemo(() => {
    const todayStart = startOfToday();
    const todayOrders = orders.filter(o => (o.createdAt?.seconds || 0) >= todayStart);
    const paid = todayOrders.filter(o => PAID_STATUSES.has(o.paymentStatus));
    const pending = orders.filter(o => o.status === 'pending');
    const preparing = orders.filter(o => o.status === 'preparing');
    const ready = orders.filter(o => o.status === 'ready');
    const unpaidServed = todayOrders.filter(o =>
      o.status === 'served' && !PAID_STATUSES.has(o.paymentStatus) && o.paymentStatus !== 'refunded'
    );
    const paymentRequests = orders.filter(o => REQUESTED_STATUSES.has(o.paymentStatus));
    const revenue = paid.reduce((s, o) => s + (o.total || 0), 0);
    const aov = paid.length > 0 ? revenue / paid.length : 0;
    const activeCalls = calls.filter(c => c.status === 'pending');
    const unreadFeedback = feedback.filter(f => !f.isRead).length;
    return {
      ordersToday: todayOrders.length,
      revenue, aov,
      pending: pending.length,
      preparing: preparing.length,
      ready: ready.length,
      unpaidServed: unpaidServed.length,
      paymentRequests: paymentRequests.length,
      activeCalls: activeCalls.length,
      unreadFeedback,
    };
  }, [orders, calls, feedback]);

  // Attention-priority list — only show cards for things that actually need action.
  const alerts = [];
  if (stats.pending > 0) alerts.push({ key: 'pending',   label: 'New orders awaiting kitchen',     count: stats.pending,         tone: 'danger',  href: '/admin/orders' });
  if (stats.paymentRequests > 0) alerts.push({ key: 'payrq', label: 'Payment requests to verify', count: stats.paymentRequests, tone: 'warning', href: '/admin/payments' });
  if (stats.activeCalls > 0) alerts.push({ key: 'calls',   label: 'Waiter calls waiting',          count: stats.activeCalls,     tone: 'warning', href: '/admin/waiter' });
  if (stats.ready > 0) alerts.push({ key: 'ready',         label: 'Ready to serve',                count: stats.ready,           tone: 'success', href: '/admin/waiter' });
  if (stats.unreadFeedback > 0) alerts.push({ key: 'fb',   label: 'Unread customer reviews',       count: stats.unreadFeedback,  tone: 'info',    href: '/admin/feedback' });
  if (stats.unpaidServed > 0) alerts.push({ key: 'unpaid', label: 'Unpaid served orders (today)',  count: stats.unpaidServed,    tone: 'danger',  href: '/admin/payments' });

  const toneColors = {
    danger:  { bg: 'rgba(217,83,79,0.08)',  border: 'rgba(217,83,79,0.22)',  text: A.danger  },
    warning: { bg: 'rgba(196,168,109,0.10)', border: 'rgba(196,168,109,0.25)', text: A.warningDim },
    success: { bg: 'rgba(63,158,90,0.08)',   border: 'rgba(63,158,90,0.22)',   text: A.success },
    info:    { bg: A.subtleBg,                border: 'rgba(0,0,0,0.10)',       text: A.mutedText },
  };

  const loading = !ordersLoaded || !callsLoaded;

  return (
    <div style={{ background: A.cream, minHeight: '100vh', fontFamily: A.font }}>
      <style>{`
        @keyframes pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.35; } }
        @keyframes fadeUp { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }
        .home-action:hover { transform: translateY(-2px); box-shadow: 0 8px 24px rgba(0,0,0,0.08); }
        .home-alert:hover { transform: translateY(-1px); box-shadow: 0 6px 16px rgba(0,0,0,0.06); }
      `}</style>

      <div style={{ padding: '24px 28px 0' }}>
        <div style={{ marginBottom: 18 }}>
          <div style={{ fontSize: 11, fontWeight: 500, color: A.faintText, letterSpacing: '0.05em', marginBottom: 6 }}>
            Dashboard
          </div>
          <div style={{ fontWeight: 600, fontSize: 28, color: A.ink, letterSpacing: '-0.5px', lineHeight: 1.1, marginBottom: 6 }}>
            {restaurantName}
          </div>
          <div style={{ fontSize: 13, color: A.mutedText }}>
            {new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
          </div>
        </div>

        {/* ═══ LIVE TODAY signature card — matches analytics LIVE TODAY ═══ */}
        <div style={{
          background: `linear-gradient(135deg, ${A.forest} 0%, ${A.forestDarker} 100%)`,
          borderRadius: 14, padding: '20px 24px', marginBottom: 14,
          border: A.forestBorder, boxShadow: '0 4px 16px rgba(0,0,0,0.15)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: A.warning, animation: 'pulse 2s ease infinite', boxShadow: '0 0 8px rgba(196,168,109,0.60)' }} />
            <span style={{ fontSize: 12, fontWeight: 600, letterSpacing: '0.10em', textTransform: 'uppercase', color: A.warning }}>TODAY · LIVE</span>
            <span style={{ flex: 1, height: 1, background: 'rgba(234,231,227,0.08)' }} />
            <span style={{ fontSize: 11, color: A.forestTextMuted, fontWeight: 500 }}>
              {new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
            </span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
            {[
              { label: 'REVENUE', value: formatRupee(stats.revenue), color: A.warning },
              { label: 'ORDERS',  value: stats.ordersToday,           color: A.forestText },
              { label: 'AVG ORDER', value: formatRupee(stats.aov),    color: A.forestText },
              { label: 'IN KITCHEN', value: stats.pending + stats.preparing, color: (stats.pending + stats.preparing) > 0 ? A.warning : A.forestTextFaint },
            ].map(s => (
              <div key={s.label} style={{ padding: '16px 18px', borderRadius: 10, background: A.forestSubtleBg, border: A.forestBorder }}>
                <div style={{ fontSize: 11, fontWeight: 500, letterSpacing: '0.06em', textTransform: 'uppercase', color: A.forestTextFaint, marginBottom: 8 }}>
                  {s.label}
                </div>
                <div style={{ fontWeight: 700, fontSize: 26, lineHeight: 1, letterSpacing: '-0.5px', color: s.color }}>{s.value}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div style={{ padding: '0 28px 60px', display: 'grid', gridTemplateColumns: '1fr 320px', gap: 14 }}>
        {/* ═══ LEFT — Needs attention ═══ */}
        <div style={{ background: A.shell, borderRadius: 14, border: A.border, boxShadow: A.cardShadow, padding: '22px 26px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: A.warning }} />
            <span style={{ fontSize: 12, fontWeight: 600, letterSpacing: '0.10em', textTransform: 'uppercase', color: A.warning }}>Needs Attention</span>
            <span style={{ flex: 1, height: 1, background: 'rgba(196,168,109,0.20)' }} />
          </div>

          {loading ? (
            <div style={{ padding: 32, textAlign: 'center', color: A.mutedText, fontSize: 13 }}>Loading live data…</div>
          ) : alerts.length === 0 ? (
            <div style={{ padding: '32px 20px', textAlign: 'center' }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: A.success, marginBottom: 6 }}>All clear ✓</div>
              <div style={{ fontSize: 13, color: A.mutedText }}>No pending orders, calls, or unread feedback right now.</div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {alerts.map(a => {
                const c = toneColors[a.tone];
                return (
                  <Link key={a.key} href={a.href} style={{ textDecoration: 'none' }}>
                    <div className="home-alert" style={{
                      padding: '14px 18px', borderRadius: 12,
                      background: c.bg, border: `1px solid ${c.border}`,
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 14,
                      transition: 'all 0.15s', cursor: 'pointer',
                    }}>
                      <span style={{ fontSize: 14, fontWeight: 600, color: A.ink, letterSpacing: '-0.1px' }}>
                        {a.label}
                      </span>
                      <span style={{
                        fontWeight: 700, fontSize: 24, color: c.text,
                        fontFamily: "'JetBrains Mono', monospace",
                        letterSpacing: '-0.3px', lineHeight: 1,
                      }}>{a.count}</span>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </div>

        {/* ═══ RIGHT — Quick actions ═══ */}
        <div style={{ background: A.shell, borderRadius: 14, border: A.border, boxShadow: A.cardShadow, padding: '22px 26px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: A.warning }} />
            <span style={{ fontSize: 12, fontWeight: 600, letterSpacing: '0.10em', textTransform: 'uppercase', color: A.warning }}>Quick Actions</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {[
              { label: 'New walk-in order', href: '/admin/new-order', accent: true },
              { label: 'View all orders',    href: '/admin/orders' },
              { label: 'Kitchen display',    href: '/admin/kitchen' },
              { label: 'Waiter dashboard',   href: '/admin/waiter' },
              { label: 'Day close / Z-report', href: '/admin/day-close' },
              { label: 'Full analytics',     href: '/admin/analytics' },
              { label: 'Manage menu',        href: '/admin/items' },
            ].map(q => (
              <Link key={q.href} href={q.href} style={{ textDecoration: 'none' }}>
                <div className="home-action" style={{
                  padding: '12px 16px', borderRadius: 10,
                  background: q.accent ? A.ink : A.shellDarker,
                  color:      q.accent ? A.cream : A.ink,
                  border:     q.accent ? `1px solid ${A.ink}` : A.border,
                  fontSize: 13, fontWeight: 600,
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  transition: 'all 0.15s', cursor: 'pointer',
                }}>
                  <span>{q.label}</span>
                  <span style={{ fontSize: 13, opacity: 0.7 }}>→</span>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Outer page — just wraps AdminLayout around DashboardContent ───
export default function AdminHome() {
  return (
    <AdminLayout>
      <PageHead title="Dashboard" />
      <DashboardContent />
    </AdminLayout>
  );
}

AdminHome.getLayout = (page) => page;
