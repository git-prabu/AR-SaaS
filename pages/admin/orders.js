import Head from 'next/head';
import { useEffect, useState, useMemo, useRef } from 'react';
import { useAuth } from '../../hooks/useAuth';
import AdminLayout from '../../components/layout/AdminLayout';
import { updateOrderStatus, updatePaymentStatus } from '../../lib/db';
import { db } from '../../lib/firebase';
import { collection, onSnapshot, query, orderBy } from 'firebase/firestore';
import toast from 'react-hot-toast';
import { timeAgo } from '../../lib/utils';

// ─────────────────────────────────────────────────────────────
// Aspire palette — matches analytics/reports for brand consistency.
// Falls back to T tokens for legacy fields where equivalents don't exist.
// ─────────────────────────────────────────────────────────────
const INTER = "'Inter', -apple-system, BlinkMacSystemFont, sans-serif";
const A = {
  font: INTER,
  cream: '#EDEDED',
  ink: '#1A1A1A',
  shell: '#FFFFFF',
  warning: '#C4A86D',
  mutedText: 'rgba(0,0,0,0.55)',
  faintText: 'rgba(0,0,0,0.38)',
  subtleBg: 'rgba(0,0,0,0.04)',
  border: '1px solid rgba(0,0,0,0.06)',
  borderStrong: '1px solid rgba(0,0,0,0.12)',
  cardShadow: '0 1px 2px rgba(0,0,0,0.04), 0 4px 12px rgba(0,0,0,0.04)',
  // Matte-black signature card tokens
  forest: '#1A1A1A',
  forestDarker: '#2A2A2A',
  forestText: '#EAE7E3',
  forestTextMuted: 'rgba(234,231,227,0.55)',
  forestTextFaint: 'rgba(234,231,227,0.35)',
  forestSubtleBg: 'rgba(255,255,255,0.04)',
  forestBorder: '1px solid rgba(255,255,255,0.06)',
  // Semantics
  success: '#3F9E5A',
  danger: '#D9534F',
  successOnDark: '#6BBF7F',
  dangerOnDark: '#E87973',
};

// Status metadata drives pill color, next-state transition, and button label.
const STATUS_META = {
  pending:   { label: 'New Order', next: 'preparing', nextLabel: 'Start Preparing', kind: 'pending' },
  preparing: { label: 'Preparing', next: 'ready',     nextLabel: 'Mark Ready',      kind: 'preparing' },
  ready:     { label: 'Ready',     next: 'served',    nextLabel: 'Mark Served',     kind: 'ready' },
  served:    { label: 'Served',    next: null,        nextLabel: null,              kind: 'served' },
};

// Period filter → timestamp range.
function periodRange(period) {
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
  if (period === 'today') return { start: startOfToday.getTime() / 1000, end: Infinity };
  if (period === 'week') {
    const d = new Date(startOfToday); d.setDate(d.getDate() - 6);
    return { start: d.getTime() / 1000, end: Infinity };
  }
  if (period === 'month') {
    const d = new Date(startOfToday); d.setDate(d.getDate() - 29);
    return { start: d.getTime() / 1000, end: Infinity };
  }
  return { start: 0, end: Infinity }; // 'all'
}

// Payment status helpers.
const PAID_STATUSES = new Set(['paid_cash', 'paid_card', 'paid_online', 'paid']);
const REQUESTED_STATUSES = new Set(['cash_requested', 'card_requested', 'online_requested']);

// Format HH:MM (24h) for time column.
function fmtTime(seconds) {
  if (!seconds) return '—';
  const d = new Date(seconds * 1000);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}
const formatRupee = n => '₹' + (Math.round(n || 0)).toLocaleString('en-IN');

// "Today · 20 Apr" / "Yesterday · 19 Apr" / "18 Apr" format for day tags.
function dayLabel(seconds) {
  if (!seconds) return '';
  const d = new Date(seconds * 1000);
  const today = new Date(); today.setHours(0,0,0,0);
  const yesterday = new Date(today); yesterday.setDate(yesterday.getDate() - 1);
  const dateOnly = new Date(d); dateOnly.setHours(0,0,0,0);
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const dm = `${d.getDate()} ${months[d.getMonth()]}`;
  if (dateOnly.getTime() === today.getTime()) return `Today · ${dm}`;
  if (dateOnly.getTime() === yesterday.getTime()) return `Yesterday · ${dm}`;
  return dm;
}
function dayKey(seconds) {
  if (!seconds) return 'unknown';
  const d = new Date(seconds * 1000);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

// Order display label — prefers the sequential orderNumber; falls back to id slice.
function orderLabel(o) {
  if (typeof o.orderNumber === 'number' && o.orderNumber > 0) return `#${o.orderNumber}`;
  return '#' + (o.id || '').slice(-5).toUpperCase();
}

// Normalize legacy "Not specified"/"None"/"—" table values to blank.
function cleanTable(t) {
  if (!t) return '';
  const s = String(t).trim();
  if (!s || s === '—' || s.toLowerCase() === 'not specified' || s.toLowerCase() === 'none') return '';
  return s;
}

export default function AdminOrders() {
  const { userData } = useAuth();
  const [orders, setOrders] = useState([]);
  const [statusFilter, setStatusFilter] = useState('active');   // active | served | all
  const [periodFilter, setPeriodFilter] = useState('today');    // today | week | month | all
  const [searchQ, setSearchQ] = useState('');
  const [updating, setUpdating] = useState(null);
  const [, setTick] = useState(0);
  // Tracks which order row is currently expanded. Only one at a time for focus.
  const [expandedOrderId, setExpandedOrderId] = useState(null);
  // Sound alert — default ON, persisted in localStorage
  const [soundEnabled, setSoundEnabled] = useState(true);
  const prevPendingRef = useRef(null);       // tracks last known pending count
  const audioRef = useRef(null);             // single Audio instance
  const rid = userData?.restaurantId;

  // Load sound preference from localStorage once on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem('ar_orders_sound');
      if (stored !== null) setSoundEnabled(stored === 'true');
    } catch {}
    // Preload audio
    try {
      audioRef.current = new Audio('/notification.mp3');
      audioRef.current.preload = 'auto';
    } catch {}
  }, []);

  // Persist sound preference whenever it changes
  useEffect(() => {
    try { localStorage.setItem('ar_orders_sound', String(soundEnabled)); } catch {}
  }, [soundEnabled]);

  // Firestore listener — no limit so "All Time" works; filtering happens client-side.
  useEffect(() => {
    if (!rid) return;
    const q = query(collection(db, 'restaurants', rid, 'orders'), orderBy('createdAt', 'desc'));
    return onSnapshot(q, snap => {
      setOrders(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    }, err => {
      console.error('Orders listener error:', err);
    });
  }, [rid]);

  // Sound alert — plays when pending count goes UP.
  // First snapshot doesn't trigger (we only set the baseline).
  // Browser autoplay policy: the sound will only play if the user has interacted with the page
  // at least once. We handle the autoplay rejection silently to avoid console noise.
  useEffect(() => {
    const pendingNow = orders.filter(o => o.status === 'pending').length;
    const prev = prevPendingRef.current;
    if (prev !== null && pendingNow > prev && soundEnabled && audioRef.current) {
      // Reset playback position in case it was mid-play
      audioRef.current.currentTime = 0;
      audioRef.current.play().catch(() => {
        // Autoplay blocked before first user gesture; silent fail.
      });
    }
    prevPendingRef.current = pendingNow;
  }, [orders, soundEnabled]);

  // 30s tick so "2 min ago" updates without user interaction.
  useEffect(() => {
    const t = setInterval(() => setTick(n => n + 1), 30000);
    return () => clearInterval(t);
  }, []);

  // Advance status pipeline (pending → preparing → ready → served).
  const advance = async (order) => {
    const meta = STATUS_META[order.status];
    if (!meta?.next) return;
    setUpdating(order.id);
    try { await updateOrderStatus(rid, order.id, meta.next); }
    catch { toast.error('Failed to update order status'); }
    setUpdating(null);
  };

  // Verify payment action (from requested → paid).
  const verifyPayment = async (order) => {
    setUpdating(order.id + '_pay');
    try {
      const paidMap = { cash_requested: 'paid_cash', card_requested: 'paid_card', online_requested: 'paid_online' };
      await updatePaymentStatus(rid, order.id, paidMap[order.paymentStatus] || 'paid_cash');
    } catch { toast.error('Failed to verify payment'); }
    setUpdating(null);
  };

  // Flag a payment issue (for disputes).
  const flagPaymentIssue = async (order) => {
    setUpdating(order.id + '_pay');
    try { await updatePaymentStatus(rid, order.id, 'payment_issue'); }
    catch { toast.error('Failed to update'); }
    setUpdating(null);
  };

  // Resolve a payment issue.
  const resolvePaymentIssue = async (order) => {
    setUpdating(order.id + '_pay');
    try { await updatePaymentStatus(rid, order.id, 'paid_cash'); }
    catch { toast.error('Failed to update'); }
    setUpdating(null);
  };

  // ── Derived state: filtered orders + grouping ──
  const filtered = useMemo(() => {
    const range = periodRange(periodFilter);
    const q = searchQ.trim().toLowerCase();
    const numericQ = q.replace(/^#/, '').trim();

    return orders.filter(o => {
      // Status filter
      if (statusFilter === 'active' && o.status === 'served') return false;
      if (statusFilter === 'served' && o.status !== 'served') return false;

      // Period filter
      const secs = o.createdAt?.seconds || 0;
      if (secs < range.start || secs > range.end) return false;

      // Search filter
      if (q) {
        const items = (o.items || []).map(i => (i.name || '').toLowerCase()).join(' ');
        const tableNorm = cleanTable(o.tableNumber).toLowerCase();
        const idLower = (o.id || '').toLowerCase();
        const ordNum = typeof o.orderNumber === 'number' ? String(o.orderNumber) : '';
        // Table match: "3", "table 3", "t3" all hit table 3
        let tableMatch = false;
        if (tableNorm) {
          if (numericQ && /^\d+$/.test(numericQ) && tableNorm === numericQ) tableMatch = true;
          if (/^(t|table)\s*(\d+)$/.test(q)) {
            const n = q.replace(/^(t|table)\s*/, '').trim();
            if (tableNorm === n) tableMatch = true;
          }
          if (tableNorm.includes(q)) tableMatch = true;
        }
        const ordNumMatch = ordNum && ordNum === numericQ;
        if (!tableMatch && !items.includes(q) && !idLower.includes(q) && !ordNumMatch) return false;
      }
      return true;
    });
  }, [orders, statusFilter, periodFilter, searchQ]);

  // Group filtered orders by day (for the day-tag dividers).
  const grouped = useMemo(() => {
    const groups = [];
    let currentKey = null; let currentItems = null;
    for (const o of filtered) {
      const k = dayKey(o.createdAt?.seconds);
      if (k !== currentKey) {
        currentKey = k;
        currentItems = { key: k, firstSecs: o.createdAt?.seconds, orders: [] };
        groups.push(currentItems);
      }
      currentItems.orders.push(o);
    }
    return groups;
  }, [filtered]);

  // ── Signature card stats (always today, per spec) ──
  const todayStats = useMemo(() => {
    const range = periodRange('today');
    const today = orders.filter(o => (o.createdAt?.seconds || 0) >= range.start);
    const pending = today.filter(o => o.status === 'pending').length;
    const preparing = today.filter(o => o.status === 'preparing').length;
    const ready = today.filter(o => o.status === 'ready').length;
    const served = today.filter(o => o.status === 'served');
    const revenue = served.reduce((s, o) => s + (o.total || 0), 0);
    return { pending, preparing, ready, servedCount: served.length, revenue, inFlight: pending + preparing + ready };
  }, [orders]);

  // ── Tab counts (respect period filter) ──
  const tabCounts = useMemo(() => {
    const range = periodRange(periodFilter);
    const scoped = orders.filter(o => (o.createdAt?.seconds || 0) >= range.start);
    return {
      active: scoped.filter(o => o.status !== 'served').length,
      served: scoped.filter(o => o.status === 'served').length,
      all: scoped.length,
    };
  }, [orders, periodFilter]);

  return (
    <AdminLayout>
      <Head><title>Orders — Advert Radical</title></Head>
      <div style={{ background: A.cream, minHeight: '100vh', fontFamily: A.font }}>
          <style>{`
            @keyframes spin    { to { transform: rotate(360deg); } }
            @keyframes fadeUp  { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }
            @keyframes pulse   { 0%,100% { opacity: 1; } 50% { opacity: 0.4; } }
            .entry { transition: all 0.18s; animation: fadeUp 0.25s ease both; }
            .entry:hover { box-shadow: 0 4px 16px rgba(0,0,0,0.06); }
            .entry.pending::before { animation: pulse 1.5s infinite; }
            .status-tab:hover:not(.active) { border-color: rgba(0,0,0,0.18); color: ${A.ink}; }
            .day-pill:hover:not(.active) { color: ${A.ink}; }
            .entry-btn:hover { transform: translateY(-1px); box-shadow: 0 4px 12px rgba(0,0,0,0.15); }
            .search:focus { border-color: rgba(0,0,0,0.25); }
            @media (max-width: 767px) {
              .signature { padding: 18px 20px !important; }
              .tiles-grid { grid-template-columns: repeat(2, 1fr) !important; }
              .controls { flex-direction: column; align-items: stretch !important; }
              .controls-left { flex-wrap: wrap; }
              .search { width: 100% !important; min-width: 0 !important; }
              .day-pills { align-self: flex-start; }
              .entry-main { grid-template-columns: auto auto 1fr !important; gap: 12px !important; }
              .entry-time, .entry-num { grid-row: 1; }
              .entry-middle { grid-column: 1 / -1; margin-top: 6px; }
              .entry-amount { grid-row: 1; grid-column: 3; text-align: right; }
              .entry-action { grid-column: 1 / -1; text-align: right; margin-top: 8px; }
            }
          `}</style>

          {/* ── Header — matches analytics/reports breadcrumb + title pattern ── */}
          <div style={{ padding: '24px 28px 0' }}>
            <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 18, flexWrap: 'wrap', gap: 14 }}>
              <div>
                <div style={{ fontFamily: A.font, fontSize: 11, fontWeight: 500, color: A.faintText, marginBottom: 6, letterSpacing: '0.05em' }}>Admin</div>
                <div style={{ fontFamily: A.font, fontSize: 26, fontWeight: 600, color: A.ink, letterSpacing: '-0.4px', lineHeight: 1 }}>Orders</div>
                <div style={{ fontFamily: A.font, fontSize: 13, color: A.mutedText, marginTop: 6 }}>Live incoming orders from your tables</div>
              </div>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
              {/* Sound toggle — click to mute/unmute new-order alerts */}
              <button
                onClick={() => setSoundEnabled(v => !v)}
                title={soundEnabled ? 'Mute new-order sound' : 'Enable new-order sound'}
                style={{
                  width: 34, height: 34, borderRadius: '50%',
                  background: A.shell, border: A.borderStrong,
                  cursor: 'pointer', padding: 0,
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  color: soundEnabled ? A.ink : A.faintText,
                  fontFamily: A.font, fontSize: 15, lineHeight: 1,
                  transition: 'all 0.15s',
                }}>
                {soundEnabled ? '🔔' : '🔕'}
              </button>
              <div style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                padding: '7px 15px', borderRadius: 20,
                background: A.ink, color: A.forestText,
                fontSize: 11, fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase',
              }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: A.successOnDark, animation: 'pulse 1.8s infinite' }} />
                Live
              </div>
            </div>
          </div>
          </div>

          {/* ── Main content section — matches analytics/reports per-section padding pattern ── */}
          <div style={{ padding: '0 28px 40px' }}>
          {/* ── Signature card: LIVE KITCHEN ── */}
          <div className="signature" style={{
            background: `linear-gradient(135deg, ${A.forest} 0%, ${A.forestDarker} 100%)`,
            borderRadius: 14, padding: '22px 26px', marginBottom: 28,
            border: A.forestBorder, boxShadow: '0 4px 16px rgba(0,0,0,0.15)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18 }}>
              <span style={{ width: 7, height: 7, borderRadius: '50%', background: A.warning, boxShadow: '0 0 8px rgba(196,168,109,0.60)' }} />
              <span style={{ fontSize: 12, fontWeight: 600, letterSpacing: '0.10em', textTransform: 'uppercase', color: A.warning }}>LIVE KITCHEN</span>
              <span style={{ flex: 1, height: 1, background: 'rgba(234,231,227,0.08)' }} />
              <span style={{ fontSize: 11, color: A.forestTextMuted, fontWeight: 500, fontVariantNumeric: 'tabular-nums' }}>
                {todayStats.servedCount} served · {todayStats.inFlight} in flight
              </span>
            </div>
            <div className="tiles-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
              {/* NEW ORDERS — gold with pulsing dot */}
              <div style={{ padding: '16px 18px', borderRadius: 10, background: A.forestSubtleBg, border: A.forestBorder }}>
                <div style={{ fontSize: 11, fontWeight: 500, letterSpacing: '0.06em', textTransform: 'uppercase', color: A.forestTextFaint, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: A.dangerOnDark, animation: 'pulse 1.5s infinite', display: 'inline-block' }} />
                  NEW ORDERS
                </div>
                <div style={{ fontWeight: 700, fontSize: 26, letterSpacing: '-0.4px', lineHeight: 1, fontVariantNumeric: 'tabular-nums', color: A.warning }}>{todayStats.pending}</div>
                <div style={{ fontSize: 11, color: A.forestTextFaint, marginTop: 4 }}>awaiting acknowledgement</div>
              </div>
              {/* PREPARING — cream */}
              <div style={{ padding: '16px 18px', borderRadius: 10, background: A.forestSubtleBg, border: A.forestBorder }}>
                <div style={{ fontSize: 11, fontWeight: 500, letterSpacing: '0.06em', textTransform: 'uppercase', color: A.forestTextFaint, marginBottom: 8 }}>PREPARING</div>
                <div style={{ fontWeight: 700, fontSize: 26, letterSpacing: '-0.4px', lineHeight: 1, fontVariantNumeric: 'tabular-nums', color: A.forestText }}>{todayStats.preparing}</div>
                <div style={{ fontSize: 11, color: A.forestTextFaint, marginTop: 4 }}>in the kitchen now</div>
              </div>
              {/* READY — luminous green */}
              <div style={{ padding: '16px 18px', borderRadius: 10, background: A.forestSubtleBg, border: A.forestBorder }}>
                <div style={{ fontSize: 11, fontWeight: 500, letterSpacing: '0.06em', textTransform: 'uppercase', color: A.forestTextFaint, marginBottom: 8 }}>READY TO SERVE</div>
                <div style={{ fontWeight: 700, fontSize: 26, letterSpacing: '-0.4px', lineHeight: 1, fontVariantNumeric: 'tabular-nums', color: A.successOnDark }}>{todayStats.ready}</div>
                <div style={{ fontSize: 11, color: A.forestTextFaint, marginTop: 4 }}>waiter pickup</div>
              </div>
              {/* TODAY'S REVENUE — gold */}
              <div style={{ padding: '16px 18px', borderRadius: 10, background: A.forestSubtleBg, border: A.forestBorder }}>
                <div style={{ fontSize: 11, fontWeight: 500, letterSpacing: '0.06em', textTransform: 'uppercase', color: A.forestTextFaint, marginBottom: 8 }}>TODAY&apos;S REVENUE</div>
                <div style={{ fontWeight: 700, fontSize: 26, letterSpacing: '-0.4px', lineHeight: 1, fontVariantNumeric: 'tabular-nums', color: A.warning }}>{formatRupee(todayStats.revenue)}</div>
                <div style={{ fontSize: 11, color: A.forestTextFaint, marginTop: 4 }}>{todayStats.servedCount} completed order{todayStats.servedCount === 1 ? '' : 's'}</div>
              </div>
            </div>
          </div>

          {/* ── Controls: [status tabs | search] left, [day pills] right ── */}
          <div className="controls" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 18, flexWrap: 'wrap', marginBottom: 28 }}>
            <div className="controls-left" style={{ display: 'flex', alignItems: 'center', gap: 18, flexWrap: 'wrap' }}>
              {/* Status tabs — primary */}
              <div style={{ display: 'inline-flex', gap: 6 }}>
                {[
                  { k: 'active', label: 'Active', count: tabCounts.active, showCount: true },
                  { k: 'served', label: 'Served', count: tabCounts.served, showCount: true },
                  { k: 'all',    label: 'All',    count: tabCounts.all,    showCount: false },
                ].map(t => {
                  const active = statusFilter === t.k;
                  return (
                    <button key={t.k} className="status-tab"
                      onClick={() => setStatusFilter(t.k)}
                      style={{
                        padding: '9px 22px', borderRadius: 20,
                        border: active ? `1px solid ${A.ink}` : A.borderStrong,
                        background: active ? A.ink : A.shell,
                        color: active ? A.forestText : A.mutedText,
                        fontFamily: A.font, fontSize: 13, fontWeight: active ? 600 : 500,
                        cursor: 'pointer', transition: 'all 0.15s',
                      }}>
                      {t.label}
                      {t.showCount && (
                        <span style={{
                          marginLeft: 7, padding: '1px 7px',
                          background: active ? 'rgba(234,231,227,0.16)' : 'rgba(196,168,109,0.16)',
                          color: active ? A.forestText : A.warning,
                          borderRadius: 10, fontSize: 11, fontWeight: 700,
                        }}>{t.count}</span>
                      )}
                    </button>
                  );
                })}
              </div>
              {/* Divider */}
              <span style={{ width: 1, height: 22, background: 'rgba(0,0,0,0.10)' }} />
              {/* Search — compact, 220px */}
              <input
                className="search"
                value={searchQ}
                onChange={e => setSearchQ(e.target.value)}
                placeholder="Search order #, table, item..."
                style={{
                  padding: '9px 14px', background: A.shell, border: A.borderStrong,
                  borderRadius: 10, fontSize: 13, fontFamily: A.font,
                  color: A.ink, width: 220, outline: 'none', transition: 'border-color 0.15s',
                }}
              />
            </div>
            {/* Day pills — right */}
            <div className="day-pills" style={{
              display: 'inline-flex', background: A.shell, border: A.borderStrong,
              borderRadius: 10, padding: 3,
            }}>
              {[['today', 'Today'], ['week', 'Week'], ['month', 'Month'], ['all', 'All']].map(([val, label]) => {
                const active = periodFilter === val;
                return (
                  <button key={val} className="day-pill"
                    onClick={() => setPeriodFilter(val)}
                    style={{
                      padding: '7px 14px', fontFamily: A.font, fontSize: 12,
                      fontWeight: active ? 600 : 500,
                      color: active ? A.forestText : A.mutedText,
                      background: active ? A.ink : 'transparent',
                      border: 'none', borderRadius: 7, cursor: 'pointer',
                      transition: 'all 0.15s',
                    }}>{label}</button>
                );
              })}
            </div>
          </div>

          {/* ── Timeline ── */}
          {grouped.length === 0 ? (
            <div style={{
              background: A.shell, borderRadius: 14, border: A.border,
              padding: '64px 32px', textAlign: 'center', boxShadow: A.cardShadow,
            }}>
              {/* Three-dot empty indicator: first dot pulses to signal "listening for orders" */}
              <div style={{ display: 'inline-flex', gap: 10, marginBottom: 22, alignItems: 'center' }}>
                <span style={{ width: 10, height: 10, borderRadius: '50%', background: A.warning, opacity: 0.8, animation: 'pulse 1.8s infinite' }} />
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'rgba(0,0,0,0.10)' }} />
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'rgba(0,0,0,0.06)' }} />
              </div>
              <div style={{ fontWeight: 600, fontSize: 16, color: A.ink, marginBottom: 8, letterSpacing: '-0.2px' }}>
                {statusFilter === 'active' ? 'No active orders' : 'No orders to show'}
              </div>
              <div style={{ fontSize: 13, color: A.mutedText, lineHeight: 1.6, maxWidth: 320, margin: '0 auto' }}>
                {statusFilter === 'active'
                  ? 'New orders from your tables will appear here in real time.'
                  : 'Try a different filter or time period above.'}
              </div>
            </div>
          ) : (
            <div style={{ position: 'relative', paddingLeft: 28 }}>
              {/* Vertical connecting line */}
              <div style={{ position: 'absolute', left: 8, top: 16, bottom: 16, width: 1, background: 'rgba(0,0,0,0.08)' }} />

              {grouped.map((group, gi) => {
                const dayRevenue = group.orders
                  .filter(o => PAID_STATUSES.has(o.paymentStatus))
                  .reduce((s, o) => s + (o.total || 0), 0);
                return (
                  <div key={group.key}>
                    {/* Day tag — Today gets the dark ink style, others get cream */}
                    {(() => {
                      const lbl = dayLabel(group.firstSecs);
                      const isToday = lbl.startsWith('Today');
                      return (
                        <div style={{
                          display: 'inline-flex', alignItems: 'center', gap: 12,
                          margin: gi === 0 ? '0 0 22px -28px' : '22px 0 22px -28px',
                          background: isToday ? A.ink : A.shell,
                          color: isToday ? A.forestText : A.mutedText,
                          padding: '7px 16px', borderRadius: 20,
                          border: isToday ? `1px solid ${A.ink}` : A.borderStrong,
                          fontSize: 11, fontWeight: 600, letterSpacing: '0.05em',
                          textTransform: 'uppercase',
                          position: 'relative', zIndex: 1,
                        }}>
                          {lbl}
                          <span style={{ color: isToday ? A.forestTextFaint : A.faintText, fontWeight: 500 }}>
                            {group.orders.length} {group.orders.length === 1 ? 'order' : 'orders'}
                            {dayRevenue > 0 && ` · ${formatRupee(dayRevenue)}`}
                          </span>
                        </div>
                      );
                    })()}

                    {group.orders.map((order, idx) => {
                      const meta = STATUS_META[order.status] || STATUS_META.pending;
                      const secs = order.createdAt?.seconds;
                      const total = order.total || (order.items || []).reduce((s, i) => s + ((i.price || 0) * (i.qty || 1)), 0);
                      const table = cleanTable(order.tableNumber);
                      const itemsList = (order.items || []).map(i => i.name).filter(Boolean);
                      const itemsText = itemsList.length === 0 ? '—'
                        : itemsList.length <= 2 ? itemsList.join(', ')
                        : itemsList.slice(0, 2).join(', ');
                      const hiddenItemCount = Math.max(0, itemsList.length - 2);
                      const itemCount = (order.items || []).reduce((s, i) => s + (i.qty || 1), 0);

                      // Payment descriptor for subtitle
                      const pmt = order.paymentStatus;
                      let paymentText = 'Pending';
                      if (PAID_STATUSES.has(pmt)) {
                        paymentText = pmt === 'paid_card' ? 'Card · Verified'
                                    : pmt === 'paid_online' ? 'UPI · Verified'
                                    : 'Cash · Verified';
                      } else if (REQUESTED_STATUSES.has(pmt)) {
                        paymentText = pmt === 'cash_requested' ? 'Cash — Awaiting'
                                    : pmt === 'card_requested' ? 'Card — Awaiting'
                                    : 'UPI — Awaiting';
                      } else if (pmt === 'payment_issue') {
                        paymentText = 'Payment Issue';
                      }

                      // Timeline dot style per status
                      const dotStyle = {
                        pending:   { border: `2px solid ${A.warning}`, background: 'rgba(196,168,109,0.14)' },
                        preparing: { border: `2px solid ${A.ink}`, background: A.shell },
                        ready:     { border: `2px solid ${A.success}`, background: 'rgba(63,158,90,0.12)' },
                        served:    { border: `2px solid ${A.faintText}`, background: A.shell },
                      }[meta.kind];

                      // Entry background treatment
                      const isPending = meta.kind === 'pending';
                      const entryBg = isPending
                        ? `linear-gradient(90deg, rgba(196,168,109,0.05) 0%, ${A.shell} 22%)`
                        : A.shell;
                      const entryBorderLeft = isPending ? `2px solid ${A.warning}` : 'none';

                      return (
                        /* ═══ FLEX WRAPPER ═══
                           Why: the dot must be vertically centered on the entry card regardless of
                           card height (collapsed/expanded). Flexbox align-items:center does this for
                           free — no CSS math, no magic numbers. Dot and card are siblings in a row.
                           The wrapper bleeds 28px to the left (negative marginLeft) so the dot lands
                           on the timeline's vertical line at parent.left + 8. */
                        <div key={order.id} style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 14,
                          marginLeft: -28,         // pull dot into the timeline column
                          marginBottom: 10,
                        }}>
                          {/* Dot: fixed-size flex child, naturally centered by align-items:center */}
                          <span style={{
                            flexShrink: 0,
                            width: 10, height: 10, borderRadius: '50%',
                            marginLeft: 3,           // line at left:8 of parent, dot width 10 → margin 3 centers on line
                            zIndex: 1,
                            ...dotStyle,
                          }} />
                          {/* The card itself — flex: 1 so it takes remaining width */}
                          <div className={`entry ${meta.kind}`}
                            onClick={(e) => {
                              if (e.target.closest('button')) return;
                              setExpandedOrderId(expandedOrderId === order.id ? null : order.id);
                            }}
                            style={{
                              flex: 1,
                              background: entryBg, border: A.border, borderRadius: 14,
                              borderLeft: entryBorderLeft,
                              padding: '18px 24px',
                              animationDelay: `${idx * 0.03}s`,
                              cursor: 'pointer',
                            }}>
                          <div className="entry-main" style={{
                            display: 'grid',
                            gridTemplateColumns: '56px 58px 1fr auto auto',
                            gap: 24,
                            alignItems: 'center',
                          }}>
                            {/* Time */}
                            <span className="entry-time" style={{
                              fontSize: 11, color: A.faintText, fontVariantNumeric: 'tabular-nums',
                              fontWeight: 500, letterSpacing: '0.02em',
                            }}>{fmtTime(secs)}</span>

                            {/* Order # */}
                            <span className="entry-num" style={{
                              fontWeight: 700, fontSize: 17, fontVariantNumeric: 'tabular-nums',
                              letterSpacing: '-0.4px', color: A.ink,
                            }}>{orderLabel(order)}</span>

                            {/* Middle: items + subtitle */}
                            <div className="entry-middle" style={{ minWidth: 0 }}>
                              <div className="entry-items" style={{
                                fontSize: 14, color: A.ink, fontWeight: 500,
                                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                                marginBottom: 4,
                              }}>
                                {table && <span>Table {table} · </span>}
                                {itemsText}
                                {hiddenItemCount > 0 && (
                                  <span style={{
                                    display: 'inline-block', marginLeft: 8,
                                    padding: '2px 8px', borderRadius: 10,
                                    background: 'rgba(196,168,109,0.14)', color: A.warning,
                                    fontSize: 10, fontWeight: 700, letterSpacing: '0.04em',
                                    verticalAlign: 'middle',
                                  }}>+{hiddenItemCount} more</span>
                                )}
                                <span style={{
                                  display: 'inline-block', marginLeft: 8,
                                  color: A.faintText, fontSize: 11,
                                  transition: 'transform 0.2s',
                                  transform: expandedOrderId === order.id ? 'rotate(180deg)' : 'rotate(0deg)',
                                }}>▾</span>
                              </div>
                              <div className="entry-sub" style={{
                                fontSize: 11, color: A.faintText, fontWeight: 500,
                                display: 'inline-flex', alignItems: 'center', gap: 8,
                              }}>
                                <span>{itemCount} {itemCount === 1 ? 'item' : 'items'}</span>
                                <span style={{ color: 'rgba(0,0,0,0.12)' }}>·</span>
                                <span>{paymentText}</span>
                                {order.specialInstructions && (
                                  <>
                                    <span style={{ color: 'rgba(0,0,0,0.12)' }}>·</span>
                                    <span style={{ color: A.warning, fontWeight: 600 }}>
                                      Has note
                                    </span>
                                  </>
                                )}
                              </div>
                            </div>

                            {/* Amount */}
                            <span className="entry-amount" style={{
                              fontSize: 15, fontWeight: 700, fontVariantNumeric: 'tabular-nums',
                              letterSpacing: '-0.3px', textAlign: 'right', color: A.ink, minWidth: 80,
                            }}>{formatRupee(total)}</span>

                            {/* Action: button for active states, status pill for served */}
                            <div className="entry-action" style={{ minWidth: 140, textAlign: 'right' }}>
                              {meta.next ? (
                                // Active order: show advance button
                                <button className="entry-btn" disabled={updating === order.id}
                                  onClick={() => advance(order)}
                                  style={{
                                    background: isPending ? A.warning : meta.kind === 'ready' ? A.success : A.ink,
                                    color: isPending ? A.ink : meta.kind === 'ready' ? '#fff' : A.forestText,
                                    border: 'none',
                                    padding: '9px 18px', borderRadius: 8,
                                    fontSize: 12, fontWeight: 600, cursor: 'pointer',
                                    fontFamily: A.font, whiteSpace: 'nowrap',
                                    letterSpacing: '-0.1px',
                                    opacity: updating === order.id ? 0.6 : 1,
                                  }}>
                                  {updating === order.id
                                    ? <span style={{ display: 'inline-block', width: 12, height: 12, border: '2px solid rgba(255,255,255,0.4)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
                                    : meta.nextLabel}
                                </button>
                              ) : (
                                // Served order: passive status pill
                                <span style={{
                                  fontSize: 10, fontWeight: 700, letterSpacing: '0.08em',
                                  textTransform: 'uppercase', padding: '5px 12px', borderRadius: 10,
                                  background: 'transparent', color: A.faintText, display: 'inline-block',
                                }}>Served · {timeAgo(secs)}</span>
                              )}
                            </div>
                          </div>

                          {/* Expanded row for payment verification actions (only when awaiting) */}
                          {REQUESTED_STATUSES.has(order.paymentStatus) && (
                            <div style={{
                              marginTop: 12, paddingTop: 12,
                              borderTop: '1px dashed rgba(0,0,0,0.06)',
                              display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
                            }}>
                              <span style={{
                                fontSize: 10, fontWeight: 700, letterSpacing: '0.08em',
                                textTransform: 'uppercase', padding: '5px 12px', borderRadius: 10,
                                background: 'rgba(196,168,109,0.14)', color: A.warning,
                                animation: 'pulse 2s infinite',
                              }}>
                                {paymentText}
                              </span>
                              <button onClick={() => verifyPayment(order)}
                                disabled={updating === order.id + '_pay'}
                                style={{
                                  background: A.success, color: '#fff', border: 'none',
                                  padding: '7px 16px', borderRadius: 8,
                                  fontSize: 11, fontWeight: 600, cursor: 'pointer',
                                  fontFamily: A.font, letterSpacing: '-0.1px',
                                  opacity: updating === order.id + '_pay' ? 0.6 : 1,
                                }}>
                                Verify Payment
                              </button>
                              <button onClick={() => flagPaymentIssue(order)}
                                disabled={updating === order.id + '_pay'}
                                style={{
                                  background: 'rgba(217,83,79,0.08)', color: A.danger,
                                  border: `1px solid rgba(217,83,79,0.20)`,
                                  padding: '7px 14px', borderRadius: 8,
                                  fontSize: 11, fontWeight: 600, cursor: 'pointer',
                                  fontFamily: A.font, letterSpacing: '-0.1px',
                                }}>
                                Flag Issue
                              </button>
                            </div>
                          )}

                          {/* Expanded row for payment_issue resolution */}
                          {order.paymentStatus === 'payment_issue' && (
                            <div style={{
                              marginTop: 12, paddingTop: 12,
                              borderTop: '1px dashed rgba(0,0,0,0.06)',
                              display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
                            }}>
                              <span style={{
                                fontSize: 10, fontWeight: 700, letterSpacing: '0.08em',
                                textTransform: 'uppercase', padding: '5px 12px', borderRadius: 10,
                                background: 'rgba(217,83,79,0.08)', color: A.danger,
                                border: `1px solid rgba(217,83,79,0.20)`,
                              }}>
                                Payment Issue
                              </span>
                              <button onClick={() => resolvePaymentIssue(order)}
                                disabled={updating === order.id + '_pay'}
                                style={{
                                  background: A.success, color: '#fff', border: 'none',
                                  padding: '7px 16px', borderRadius: 8,
                                  fontSize: 11, fontWeight: 600, cursor: 'pointer',
                                  fontFamily: A.font, letterSpacing: '-0.1px',
                                }}>
                                Resolve — Mark Paid
                              </button>
                            </div>
                          )}

                          {/* Special instructions */}
                          {order.specialInstructions && (
                            <div style={{
                              marginTop: 12, padding: '10px 14px', borderRadius: 8,
                              background: 'rgba(196,168,109,0.08)',
                              border: `1px solid rgba(196,168,109,0.20)`,
                              fontSize: 12, color: A.ink, lineHeight: 1.5,
                            }}>
                              <span style={{ color: A.warning, fontWeight: 700, fontSize: 10, marginRight: 8, letterSpacing: '0.1em' }}>NOTE</span>
                              {order.specialInstructions}
                            </div>
                          )}

                          {/* Expanded detail: full items list with per-item breakdown */}
                          {expandedOrderId === order.id && (order.items || []).length > 0 && (
                            <div style={{
                              marginTop: 14, paddingTop: 14,
                              borderTop: '1px dashed rgba(0,0,0,0.08)',
                            }}>
                              <div style={{
                                fontSize: 10, fontWeight: 700, letterSpacing: '0.10em',
                                textTransform: 'uppercase', color: A.faintText, marginBottom: 10,
                              }}>Full order · {(order.items || []).length} item{(order.items || []).length === 1 ? '' : 's'}</div>
                              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                {(order.items || []).map((item, i) => {
                                  const lineTotal = (item.price || 0) * (item.qty || 1);
                                  return (
                                    <div key={i} style={{
                                      display: 'grid',
                                      gridTemplateColumns: '36px 1fr auto',
                                      gap: 14, alignItems: 'flex-start',
                                      padding: '4px 0',
                                    }}>
                                      <span style={{
                                        fontFamily: A.font, fontWeight: 700, fontSize: 13,
                                        color: A.warning, fontVariantNumeric: 'tabular-nums',
                                      }}>{item.qty || 1}×</span>
                                      <div>
                                        <div style={{ fontSize: 13, fontWeight: 500, color: A.ink, lineHeight: 1.4 }}>
                                          {item.name}
                                        </div>
                                        {item.note && (
                                          <div style={{
                                            fontSize: 11, color: A.warning, fontWeight: 500,
                                            marginTop: 3, lineHeight: 1.4,
                                          }}>
                                            <span style={{ fontWeight: 700 }}>Note: </span>{item.note}
                                          </div>
                                        )}
                                      </div>
                                      <span style={{
                                        fontSize: 12, fontWeight: 600, color: A.mutedText,
                                        fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap',
                                      }}>{formatRupee(lineTotal)}</span>
                                    </div>
                                  );
                                })}
                              </div>
                              <div style={{
                                marginTop: 10, fontSize: 10, color: A.faintText,
                                letterSpacing: '0.05em', textAlign: 'center',
                              }}>Click row to collapse</div>
                            </div>
                          )}
                        </div>
                        </div>
                      );
                    })}
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