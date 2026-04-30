import Head from 'next/head';
import { useEffect, useState, useMemo, useRef } from 'react';
import { useAuth } from '../../hooks/useAuth';
import AdminLayout from '../../components/layout/AdminLayout';
import { updatePaymentStatus, markOrderPaid, todayKey } from '../../lib/db';
import { db } from '../../lib/firebase';
import { collection, onSnapshot, query, orderBy } from 'firebase/firestore';
import toast from 'react-hot-toast';
import DateRangePicker from '../../components/DateRangePicker';
import {
  announcePayment, unlockSound,
  isVoiceEnabled, setVoiceEnabled as setVoiceEnabledLS,
} from '../../lib/sounds';

// ═══ Aspire palette — same tokens as analytics/orders/kitchen/waiter ═══
const INTER = "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
const A = {
  font: INTER,
  cream: '#EDEDED',
  ink: '#1A1A1A',
  shell: '#FFFFFF',
  shellDarker: '#FAFAF8',
  warning: '#C4A86D',
  warningDim: '#A08656',
  success: '#3F9E5A',
  danger: '#D9534F',
  mutedText: 'rgba(0,0,0,0.55)',
  faintText: 'rgba(0,0,0,0.38)',
  subtleBg: 'rgba(0,0,0,0.04)',
  border: '1px solid rgba(0,0,0,0.06)',
  shadowCard: '0 2px 10px rgba(38,52,49,0.03)',
  // Matte-black signature tokens for the LIVE PAYMENTS stats card
  forest: '#1A1A1A',
  forestDarker: '#2A2A2A',
  forestText: '#EAE7E3',
  forestTextMuted: 'rgba(234,231,227,0.55)',
  forestTextFaint: 'rgba(234,231,227,0.35)',
  forestSubtleBg: 'rgba(255,255,255,0.04)',
  forestBorder: '1px solid rgba(255,255,255,0.06)',
};

// ═══ Payment status metadata — maps raw Firestore status to display label + accent color.
//     `kind` groups statuses: 'unpaid' (customer not yet picked method), 'requested' (customer picked, admin needs to confirm), 'paid' (settled).
//     `methodKey` is the suffix used to construct the paid_* status: 'cash' → 'paid_cash'.
// ═══
const PAYMENT_STATUS = {
  unpaid:           { label: 'Unpaid',         kind: 'unpaid',    color: A.faintText,    bg: A.subtleBg },
  cash_requested:   { label: 'Cash requested', kind: 'requested', color: A.warningDim,   bg: 'rgba(196,168,109,0.10)', methodKey: 'cash' },
  card_requested:   { label: 'Card requested', kind: 'requested', color: '#4A7488',      bg: 'rgba(74,116,136,0.10)',  methodKey: 'card' },
  online_requested: { label: 'UPI requested',  kind: 'requested', color: '#6B4A88',      bg: 'rgba(107,74,136,0.10)',  methodKey: 'online' },
  paid_cash:        { label: 'Paid · Cash',    kind: 'paid',      color: A.success,      bg: 'rgba(63,158,90,0.10)',   methodKey: 'cash' },
  paid_card:        { label: 'Paid · Card',    kind: 'paid',      color: A.success,      bg: 'rgba(63,158,90,0.10)',   methodKey: 'card' },
  paid_online:      { label: 'Paid · UPI',     kind: 'paid',      color: A.success,      bg: 'rgba(63,158,90,0.10)',   methodKey: 'online' },
};
const PAID_STATUSES = new Set(['paid_cash', 'paid_card', 'paid_online', 'paid']);

// ═══ Period boundaries for stats + history filtering ═══
function startOfToday() { const d = new Date(); d.setHours(0,0,0,0); return d.getTime() / 1000; }
function startOfWeek()  { const d = new Date(); d.setHours(0,0,0,0); d.setDate(d.getDate() - d.getDay()); return d.getTime() / 1000; }
function startOfMonth() { const d = new Date(); d.setHours(0,0,0,0); d.setDate(1); return d.getTime() / 1000; }

// ═══ Utils ═══
function formatRupee(n) {
  const v = Math.round(Number(n) || 0);
  return '₹' + v.toLocaleString('en-IN');
}
// ═══ Format elapsed seconds as human-readable duration.
//     Cascades through: seconds → minutes+seconds → hours+minutes → days+hours.
//     Drops smaller units once we're in the larger ones (e.g., at hours we don't show seconds
//     because they're irrelevant at that scale).
//     Examples: 45s, 2m 30s, 3m, 1h 5m, 3h, 106h 6m stays short, 5d 2h.
// ═══
function formatElapsed(seconds) {
  if (seconds == null || seconds < 0) return '—';
  if (seconds < 60) return `${Math.floor(seconds)}s`;
  const totalMin = Math.floor(seconds / 60);
  if (totalMin < 60) {
    const s = Math.floor(seconds % 60);
    return s === 0 ? `${totalMin}m` : `${totalMin}m ${s}s`;
  }
  const totalHr = Math.floor(totalMin / 60);
  if (totalHr < 24) {
    const m = totalMin % 60;
    return m === 0 ? `${totalHr}h` : `${totalHr}h ${m}m`;
  }
  const d = Math.floor(totalHr / 24);
  const h = totalHr % 24;
  return h === 0 ? `${d}d` : `${d}d ${h}h`;
}
function orderLabel(o) {
  if (typeof o.orderNumber === 'number' && o.orderNumber > 0) return `#${o.orderNumber}`;
  return '#' + (o.id || '').slice(-5).toUpperCase();
}
function fmtTime(seconds) {
  if (!seconds) return '—';
  return new Date(seconds * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export default function AdminPayments() {
  const { userData } = useAuth();
  const rid = userData?.restaurantId;

  const [allOrders, setAllOrders] = useState([]);
  const [loaded, setLoaded] = useState(false); // true after first Firestore snapshot arrives
  const [filter, setFilter] = useState('pending'); // 'pending' | 'completed' | 'all'
  // Default to 'today' — admins open this page to handle current-shift payments.
  // Historical data is still accessible via Week/Month/All pills when needed (e.g. revenue review).
  const [period, setPeriod] = useState('today');
  // Custom date range — overrides `period` when active. Kept as a separate
  // object so a single setter can flip active + dates atomically (avoids
  // "active true but start empty" intermediate state). Shared shape across
  // payments/waiter/orders for consistency with the DateRangePicker component.
  const [customRange, setCustomRange] = useState({ active: false, start: '', end: '' });
  const [search, setSearch] = useState('');
  const [updating, setUpdating] = useState(null);  // order id currently being updated
  const [expandedId, setExpandedId] = useState(null);
  // Map<orderId, 'cash'|'card'|'online'> — which method the admin has PICKED for each unpaid
  // order (not yet committed). Separate from the actual paymentStatus so the two-step flow works:
  // step 1 tap Cash/Card/UPI (stored here), step 2 tap "Mark as Paid" (commits via markPaid).
  const [selectedMethods, setSelectedMethods] = useState({});
  // Undo banner state (fixed-position bottom toast with "Undo" action). Named
  // undoBanner to avoid shadowing the react-hot-toast import.
  const [undoBanner, setUndoBanner] = useState(null);  // { orderId, previousStatus, expiresAt, timeoutId }

  // Phase D — sound + voice on new payment-requested orders.
  // Stored under `ar_payments_sound` (separate from kitchen/waiter so the
  // admin can mute payments-page chimes without affecting the kitchen).
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [voiceEnabled, setVoiceEnabledState] = useState(false);
  // Phase E — cash payment confirmation modal (mirrors waiter.js behaviour).
  // When admin marks an order paid with method='cash', we open this modal
  // first to capture cashReceived + auto-compute change. Card / UPI mark-paid
  // is one-tap (no input needed). Both values get persisted on the order
  // doc for end-of-shift cash-drawer reconciliation.
  const [cashModal, setCashModal] = useState(null);  // { order } | null
  const [cashReceived, setCashReceived] = useState('');
  const prevRequestedIdsRef = useRef(new Set());
  const initialPaymentsLoadedRef = useRef(false);

  useEffect(() => {
    try {
      const stored = localStorage.getItem('ar_payments_sound');
      if (stored !== null) setSoundEnabled(stored === 'true');
    } catch {}
    try { setVoiceEnabledState(isVoiceEnabled()); } catch {}
  }, []);
  useEffect(() => {
    try { localStorage.setItem('ar_payments_sound', String(soundEnabled)); } catch {}
  }, [soundEnabled]);
  useEffect(() => { setVoiceEnabledLS(voiceEnabled); }, [voiceEnabled]);

  // ── Firestore listener ──
  useEffect(() => {
    if (!rid) return;
    const q = query(collection(db, 'restaurants', rid, 'orders'), orderBy('createdAt', 'desc'));
    return onSnapshot(q, snap => {
      setAllOrders(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      setLoaded(true);
    }, err => {
      console.error('Payments listener error:', err);
      setLoaded(true); // mark loaded even on error so the empty state shows instead of infinite loading
    });
  }, [rid]);

  // ── Cleanup undo banner timeout on unmount ──
  useEffect(() => () => { if (undoBanner?.timeoutId) clearTimeout(undoBanner.timeoutId); }, [undoBanner]);

  // Phase D — chime + speak when a new payment-requested order arrives.
  // Diff by id so we can pick the actual new order and announce its
  // table + method. Skips first snapshot so existing requests on page
  // open don't trigger a flurry of chimes.
  useEffect(() => {
    const requested = allOrders.filter(o =>
      ['cash_requested', 'card_requested', 'online_requested'].includes(o.paymentStatus)
    );
    const currentIds = new Set(requested.map(o => o.id));

    if (!initialPaymentsLoadedRef.current) {
      prevRequestedIdsRef.current = currentIds;
      initialPaymentsLoadedRef.current = true;
      return;
    }

    const prevIds = prevRequestedIdsRef.current;
    const newOnes = requested.filter(o => !prevIds.has(o.id));
    if (newOnes.length > 0) {
      const o = newOnes[0];
      const isTakeaway = o.orderType === 'takeaway' || o.orderType === 'takeout';
      const rawTable = isTakeaway ? (o.customerName || 'Takeaway') : (o.tableNumber || '');
      const tableLabel = String(rawTable || '').trim() || 'unknown';
      const methodLabel = PAYMENT_STATUS[o.paymentStatus]?.methodKey === 'cash' ? 'Cash'
                        : PAYMENT_STATUS[o.paymentStatus]?.methodKey === 'card' ? 'Card'
                        : PAYMENT_STATUS[o.paymentStatus]?.methodKey === 'online' ? 'UPI'
                        : 'payment';
      // Sound + voice independently gated (Apr 30 fix). soundEnabled
      // controls only the chime; voice is gated by the global
      // ar_voice_enabled flag inside lib/sounds.
      announcePayment(tableLabel, methodLabel, { sound: soundEnabled });
    }
    prevRequestedIdsRef.current = currentIds;
  }, [allOrders, soundEnabled]);

  // ═══ Payment-relevant orders ═══
  // Only show orders that are either:
  //   (a) served AND have any paymentStatus (including 'unpaid' — customer ate, needs to pay)
  //   (b) have an active requested status (even if not served yet, though this is rare)
  //   (c) Phase F — takeaway in `awaiting_payment`: payment must clear
  //       BEFORE the kitchen sees the order. Admin needs to see these
  //       prominently here to mark them paid (or wait for the gateway
  //       webhook to land in Phase J).
  // Orders that are pending/preparing dine-in with no payment activity are
  // irrelevant — the customer hasn't asked to pay yet.
  const relevantOrders = useMemo(() => {
    return allOrders.filter(o => {
      const hasPaymentActivity = o.paymentStatus && o.paymentStatus !== 'inactive';
      if (!hasPaymentActivity) return false;
      if (o.status === 'awaiting_payment') return true;  // Phase F — pay-first takeaway
      if (o.status === 'served') return true;
      // Also show orders with active payment requests that aren't yet served (unusual but possible)
      if (['cash_requested', 'card_requested', 'online_requested'].includes(o.paymentStatus)) return true;
      if (PAID_STATUSES.has(o.paymentStatus)) return true;
      // 'unpaid' but not yet served — not shown (nothing to pay for yet)
      return false;
    });
  }, [allOrders]);

  const isPaid = (o) => PAID_STATUSES.has(o.paymentStatus);
  const isRequested = (o) => PAYMENT_STATUS[o.paymentStatus]?.kind === 'requested';

  // ═══ Period filtering (applies to all stats + list) ═══
  // When a custom range is active, it overrides the period pills. Custom
  // bounds use local midnight→23:59:59 to match the period-pill semantics.
  const customBounds = useMemo(() => {
    if (!customRange.active || !customRange.start || !customRange.end) return null;
    const s = new Date(customRange.start + 'T00:00:00'); s.setHours(0, 0, 0, 0);
    const e = new Date(customRange.end   + 'T23:59:59'); e.setHours(23, 59, 59, 999);
    return { start: s.getTime() / 1000, end: e.getTime() / 1000 };
  }, [customRange]);

  const periodStart = useMemo(() => {
    if (period === 'today') return startOfToday();
    if (period === 'week')  return startOfWeek();
    if (period === 'month') return startOfMonth();
    return 0;
  }, [period]);

  // For paid orders, filter by paymentUpdatedAt (when money arrived).
  // For unpaid/requested, filter by createdAt (when bill was generated).
  const inPeriod = (o) => {
    const ts = isPaid(o)
      ? (o.paymentUpdatedAt?.seconds || o.createdAt?.seconds || 0)
      : (o.createdAt?.seconds || 0);
    if (customBounds) return ts >= customBounds.start && ts <= customBounds.end;
    if (periodStart === 0) return true;
    return ts >= periodStart;
  };

  // ═══ Stats (always based on period, not current filter) ═══
  const stats = useMemo(() => {
    const inRange = relevantOrders.filter(inPeriod);
    const pending = inRange.filter(o => !isPaid(o));
    const paid = inRange.filter(o => isPaid(o));
    const collected = paid.reduce((s, o) => s + (o.total || 0), 0);

    // Average collection time: from bill-ready (createdAt of requested status) → paymentUpdatedAt (paid).
    // We approximate bill-ready as createdAt since we don't track request timestamp separately.
    const withTimes = paid.filter(o => o.createdAt?.seconds && o.paymentUpdatedAt?.seconds);
    const avgSec = withTimes.length > 0
      ? Math.round(withTimes.reduce((s, o) => s + (o.paymentUpdatedAt.seconds - o.createdAt.seconds), 0) / withTimes.length)
      : null;

    // Method breakdown
    const methodCounts = paid.reduce((acc, o) => {
      const key = PAYMENT_STATUS[o.paymentStatus]?.methodKey || 'other';
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {});

    return { pending: pending.length, paidCount: paid.length, collected, avgSec, methodCounts };
  }, [relevantOrders, period, customRange]);  // eslint-disable-line react-hooks/exhaustive-deps

  // ═══ List of orders shown — applies filter + period + search ═══
  const displayed = useMemo(() => {
    let list = relevantOrders.filter(inPeriod);
    if (filter === 'pending')   list = list.filter(o => !isPaid(o));
    if (filter === 'completed') list = list.filter(o => isPaid(o));
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter(o => {
        if (String(o.tableNumber || '').toLowerCase().includes(q)) return true;
        if (orderLabel(o).toLowerCase().includes(q)) return true;
        if (String(o.total || '').includes(q)) return true;
        return false;
      });
    }
    return list;
  }, [relevantOrders, filter, period, search, customRange]);  // eslint-disable-line react-hooks/exhaustive-deps

  // ═══ Mark as paid — called with explicit method so `unpaid` orders don't silently default to cash ═══
  // Cash payments route through the cash modal first (Phase E) so we
  // can capture cashReceived + changeGiven for the cash-drawer audit
  // trail. Card / UPI commit immediately because there's no extra
  // info to capture for them.
  const markPaid = async (order, method /* 'cash' | 'card' | 'online' */) => {
    if (!rid) return;
    if (method === 'cash') {
      const total = Math.round(Number(order?.total) || 0);
      setCashModal({ order });
      setCashReceived(String(total));
      return;
    }
    const previousStatus = order.paymentStatus;
    const newStatus = `paid_${method}`;
    setUpdating(order.id);
    try {
      // markOrderPaid (vs the bare updatePaymentStatus) also closes the
      // bill when every sibling order on the same billId is now paid,
      // and clears tableSessions.currentBillId so the next QR scan
      // opens a FRESH bill at that table. Required so the customer
      // doesn't keep seeing the closed bill on subsequent visits.
      await markOrderPaid(rid, order.id, newStatus);
      // Clear any selected method for this order (row is now paid, will disappear from pending filter)
      setSelectedMethods(prev => { const n = { ...prev }; delete n[order.id]; return n; });
      // Show undo banner for 60 seconds
      showUndoBanner(order.id, previousStatus);
    } catch (e) {
      console.error('Payment update failed:', e);
      toast.error('Could not mark as paid. Check connection and retry.');
    }
    setUpdating(null);
  };

  // Phase E — confirm cash payment from the modal. Persists cashReceived
  // + changeGiven on the order doc + closes any auto-closeable bill.
  const confirmCashPayment = async () => {
    if (!cashModal || !rid) return;
    const order = cashModal.order;
    const total = Math.round(Number(order?.total) || 0);
    const received = Math.round(Number(cashReceived) || 0);
    if (received < total) {
      toast.error(`Cash received (₹${received}) is less than total (₹${total}).`);
      return;
    }
    const change = received - total;
    const previousStatus = order.paymentStatus;
    setUpdating(order.id);
    try {
      await markOrderPaid(rid, order.id, 'paid_cash', { cashReceived: received, changeGiven: change });
      setSelectedMethods(prev => { const n = { ...prev }; delete n[order.id]; return n; });
      showUndoBanner(order.id, previousStatus);
      toast.success(change > 0 ? `Paid · Change ₹${change}` : 'Paid · Exact cash');
      setCashModal(null);
      setCashReceived('');
    } catch (e) {
      console.error('Cash payment failed:', e);
      toast.error('Could not mark as paid. Retry in a moment.');
    }
    setUpdating(null);
  };

  // ═══ Undo — restores previous payment status ═══
  const undoPayment = async () => {
    if (!undoBanner || !rid) return;
    const { orderId, previousStatus, timeoutId } = undoBanner;
    if (timeoutId) clearTimeout(timeoutId);
    setUndoBanner(null);
    try {
      await updatePaymentStatus(rid, orderId, previousStatus);
      toast.success('Payment undone.');
    } catch (e) {
      console.error('Undo failed:', e);
      toast.error('Undo failed. The payment is still marked — try marking it back manually.');
    }
  };

  const showUndoBanner = (orderId, previousStatus) => {
    if (undoBanner?.timeoutId) clearTimeout(undoBanner.timeoutId);
    const expiresAt = Date.now() + 60000;
    const timeoutId = setTimeout(() => setUndoBanner(null), 60000);
    setUndoBanner({ orderId, previousStatus, expiresAt, timeoutId });
  };

  // ═══ CSV export — daily reconciliation ═══
  const exportCSV = () => {
    const rows = [
      ['Order #', 'Table', 'Status', 'Method', 'Total', 'Items', 'Bill time', 'Paid time'],
      ...displayed.map(o => {
        const meta = PAYMENT_STATUS[o.paymentStatus] || PAYMENT_STATUS.unpaid;
        return [
          orderLabel(o),
          o.tableNumber || '',
          meta.label,
          meta.methodKey || '—',
          o.total || 0,
          (o.items || []).map(i => `${i.qty || 1}x ${i.name}`).join('; '),
          fmtTime(o.createdAt?.seconds),
          fmtTime(o.paymentUpdatedAt?.seconds),
        ];
      }),
    ];
    const csv = rows.map(r => r.map(cell => {
      const s = String(cell);
      return s.includes(',') || s.includes('"') ? `"${s.replace(/"/g, '""')}"` : s;
    }).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `payments-${period}-${new Date().toISOString().slice(0,10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const print = () => { if (typeof window !== 'undefined') window.print(); };

  // Grouped-by-day for the list display (matches orders page pattern)
  const grouped = useMemo(() => {
    const map = new Map();
    displayed.forEach(o => {
      const secs = o.createdAt?.seconds || 0;
      const d = new Date(secs * 1000);
      const key = d.toISOString().slice(0, 10);
      if (!map.has(key)) map.set(key, { key, date: d, orders: [] });
      map.get(key).orders.push(o);
    });
    return Array.from(map.values()).sort((a, b) => b.date - a.date);
  }, [displayed]);

  return (
    <AdminLayout>
      <Head><title>Payments | Advert Radical</title></Head>
      <div style={{ background: A.cream, minHeight: '100vh', fontFamily: A.font }}>
        <style>{`
          @keyframes pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.4; } }
          @keyframes fadeUp { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }
          @keyframes spin { to { transform: rotate(360deg); } }
          @keyframes slideUp { from { transform: translateY(100%); opacity: 0; } to { transform: none; opacity: 1; } }
          .pay-row { transition: all 0.15s; }
          .pay-row:hover { box-shadow: 0 4px 20px rgba(38,52,49,0.06); }
          .pay-tab-pill:hover:not(.active) { background: ${A.subtleBg}; color: ${A.ink}; }
          .pay-period-pill:hover:not(.active) { background: ${A.subtleBg}; color: ${A.ink}; }
          .pay-icon-btn:hover { background: ${A.shellDarker}; }
          .pay-action-btn:hover:not(:disabled) { filter: brightness(1.08); }
          @media print {
            .no-print { display: none !important; }
          }
        `}</style>

        {/* ═══ Header ═══ */}
        <div style={{ padding: '24px 28px 0' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 12, gap: 14, flexWrap: 'wrap' }}>
            <div>
              <div style={{ fontSize: 11, fontWeight: 500, color: A.faintText, marginBottom: 6, letterSpacing: '0.05em', display: 'flex', alignItems: 'center', gap: 6 }}>
                <span>Operations</span>
                <span style={{ opacity: 0.5 }}>›</span>
                <span style={{ color: A.mutedText }}>Payments</span>
              </div>
              <div style={{ fontWeight: 600, fontSize: 28, color: A.ink, letterSpacing: '-0.5px', lineHeight: 1.1 }}>
                Payments
              </div>
            </div>

            <div className="no-print" style={{ display: 'flex', gap: 6, alignItems: 'center', alignSelf: 'flex-start' }}>
              {/* Sound toggle (Phase D) — chimes when a customer requests payment.
                  Tapping also unlocks the AudioContext so subsequent automatic
                  plays aren't blocked by autoplay policy. */}
              <button className="pay-icon-btn"
                onClick={() => { setSoundEnabled(v => !v); unlockSound(); }}
                title={soundEnabled ? 'Mute payment-request sound' : 'Enable payment-request sound'}
                style={{
                  padding: '8px 12px', borderRadius: 10, border: A.border, background: A.shell,
                  color: soundEnabled ? A.ink : A.faintText,
                  fontSize: 14, cursor: 'pointer', fontFamily: A.font, minWidth: 38,
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                }}>
                {soundEnabled ? (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 5 6 9H2v6h4l5 4V5z"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/></svg>
                ) : (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 5 6 9H2v6h4l5 4V5z"/><line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/></svg>
                )}
              </button>
              {/* Voice toggle (Phase D) — speaks "Table N, cash/card/UPI payment requested". */}
              <button className="pay-icon-btn"
                onClick={() => setVoiceEnabledState(v => !v)}
                title={voiceEnabled ? 'Mute voice announcements' : 'Enable voice announcements'}
                style={{
                  padding: '8px 12px', borderRadius: 10, border: A.border, background: A.shell,
                  color: voiceEnabled ? A.ink : A.faintText,
                  fontSize: 14, cursor: 'pointer', fontFamily: A.font, minWidth: 38,
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                }}>
                {voiceEnabled ? (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z"/><path d="M19 10v1a7 7 0 0 1-14 0v-1"/><line x1="12" y1="18" x2="12" y2="22"/><line x1="8" y1="22" x2="16" y2="22"/></svg>
                ) : (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><line x1="1" y1="1" x2="23" y2="23"/><path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V5a3 3 0 0 0-5.94-.6"/><path d="M17 16.95A7 7 0 0 1 5 12v-1m14 0v1a7 7 0 0 1-.11 1.23"/><line x1="12" y1="18" x2="12" y2="22"/><line x1="8" y1="22" x2="16" y2="22"/></svg>
                )}
              </button>
              <button className="pay-icon-btn" onClick={exportCSV} title="Export current view as CSV"
                style={{
                  padding: '8px 14px', borderRadius: 10, border: A.border, background: A.shell,
                  color: A.ink, fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: A.font,
                }}>Export CSV</button>
              <button className="pay-icon-btn" onClick={print} title="Print"
                style={{
                  padding: '8px 14px', borderRadius: 10, border: A.border, background: A.shell,
                  color: A.ink, fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: A.font,
                }}>Print</button>
            </div>
          </div>

          {/* Signature matte-black stats card — compact single-row layout matching kitchen/waiter */}
          <div style={{
            background: `linear-gradient(135deg, ${A.forest} 0%, ${A.forestDarker} 100%)`,
            borderRadius: 12, padding: '12px 18px', marginTop: 12, marginBottom: 14,
            border: A.forestBorder,
            boxShadow: '0 4px 16px rgba(38,52,49,0.12)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 20, flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                <div style={{ width: 6, height: 6, borderRadius: '50%', background: A.warning, animation: 'pulse 2s ease infinite', boxShadow: '0 0 6px rgba(196,168,109,0.6)' }} />
                <span style={{ fontFamily: A.font, fontSize: 11, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: A.warning }}>LIVE PAYMENTS</span>
              </div>
              <div style={{ width: 1, height: 28, background: 'rgba(234,231,227,0.10)', flexShrink: 0 }} />
              <div style={{ display: 'flex', alignItems: 'center', gap: 20, flex: 1, flexWrap: 'wrap' }}>
                <div style={{ minWidth: 80 }}>
                  <div style={{ fontSize: 9, fontWeight: 600, letterSpacing: '0.10em', textTransform: 'uppercase', color: A.forestTextFaint, marginBottom: 2 }}>Pending</div>
                  <div style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 700, fontSize: 22, color: stats.pending > 0 ? A.warning : A.forestText, lineHeight: 1, letterSpacing: '-0.5px' }}>
                    {stats.pending}
                  </div>
                </div>
                <div style={{ width: 1, height: 24, background: 'rgba(234,231,227,0.06)', flexShrink: 0 }} />
                <div style={{ minWidth: 120 }}>
                  <div style={{ fontSize: 9, fontWeight: 600, letterSpacing: '0.10em', textTransform: 'uppercase', color: A.forestTextFaint, marginBottom: 2 }}>Collected</div>
                  <div style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 700, fontSize: 22, color: A.warning, lineHeight: 1, letterSpacing: '-0.5px' }}>
                    {formatRupee(stats.collected)}
                  </div>
                </div>
                <div style={{ width: 1, height: 24, background: 'rgba(234,231,227,0.06)', flexShrink: 0 }} />
                <div style={{ minWidth: 80 }}>
                  <div style={{ fontSize: 9, fontWeight: 600, letterSpacing: '0.10em', textTransform: 'uppercase', color: A.forestTextFaint, marginBottom: 2 }}>
                    Paid
                    {stats.paidCount > 0 && (
                      <span style={{ color: A.forestTextMuted, fontWeight: 500, letterSpacing: 0, textTransform: 'none', marginLeft: 6 }}>
                        · {stats.methodCounts.cash || 0} cash · {stats.methodCounts.card || 0} card · {stats.methodCounts.online || 0} UPI
                      </span>
                    )}
                  </div>
                  <div style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 700, fontSize: 18, color: A.success, lineHeight: 1, letterSpacing: '-0.3px' }}>
                    {stats.paidCount}
                  </div>
                </div>
                <div style={{ width: 1, height: 24, background: 'rgba(234,231,227,0.06)', flexShrink: 0 }} />
                <div style={{ minWidth: 100 }}>
                  <div style={{ fontSize: 9, fontWeight: 600, letterSpacing: '0.10em', textTransform: 'uppercase', color: A.forestTextFaint, marginBottom: 2 }}>Avg collection</div>
                  <div style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 700, fontSize: 18, color: A.forestText, lineHeight: 1, letterSpacing: '-0.3px' }}>
                    {stats.avgSec != null ? formatElapsed(stats.avgSec) : '—'}
                  </div>
                </div>
              </div>
              <span style={{ fontFamily: A.font, fontSize: 10, color: A.forestTextMuted, fontWeight: 500, flexShrink: 0, letterSpacing: '0.02em' }}>
                {customRange.active
                  ? `${customRange.start} → ${customRange.end}`
                  : period === 'today' ? 'Today' : period === 'week' ? 'This week' : period === 'month' ? 'This month' : 'All time'}
              </span>
            </div>
          </div>
        </div>

        {/* ═══ Filter bar ═══ */}
        <div className="no-print" style={{ padding: '0 28px', marginBottom: 14 }}>
          <div style={{
            background: A.shell, border: A.border, borderRadius: 14,
            boxShadow: A.shadowCard, padding: '12px 18px',
            display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap',
          }}>
            {/* Status filter tabs */}
            <div style={{ display: 'inline-flex', background: A.subtleBg, borderRadius: 10, padding: 3 }}>
              {[
                ['pending',   'Pending',   stats.pending],
                ['completed', 'Completed', stats.paidCount],
                ['all',       'All',       null],
              ].map(([val, label, count]) => {
                const active = filter === val;
                return (
                  <button key={val} className={`pay-tab-pill ${active ? 'active' : ''}`}
                    onClick={() => setFilter(val)}
                    style={{
                      padding: '7px 14px', borderRadius: 7, border: 'none', cursor: 'pointer',
                      fontFamily: A.font, fontSize: 12, fontWeight: active ? 700 : 600,
                      background: active ? A.ink : 'transparent',
                      color: active ? A.cream : A.mutedText,
                      display: 'inline-flex', alignItems: 'center', gap: 6,
                      transition: 'all 0.15s',
                    }}>
                    {label}
                    {count != null && count > 0 && (
                      <span style={{
                        padding: '1px 6px', borderRadius: 8,
                        background: active ? 'rgba(237,237,237,0.18)' : 'rgba(196,168,109,0.20)',
                        color: active ? A.cream : A.warningDim,
                        fontSize: 10, fontWeight: 700, fontFamily: "'JetBrains Mono', monospace",
                      }}>{count}</span>
                    )}
                  </button>
                );
              })}
            </div>

            <span style={{ width: 1, height: 22, background: 'rgba(0,0,0,0.10)' }} />

            {/* Period pills + Custom date-range picker.
                Wrapped in position:relative so DateRangePicker's popover anchors to
                this group (absolute top:42 right:0). Picking a period pill clears
                any active custom range; picking Custom overrides the period pill. */}
            <div style={{ display: 'inline-flex', gap: 4, position: 'relative', alignItems: 'center' }}>
              {[['today', 'Today'], ['week', 'Week'], ['month', 'Month'], ['all', 'All']].map(([val, label]) => {
                const active = !customRange.active && period === val;
                return (
                  <button key={val} className={`pay-period-pill ${active ? 'active' : ''}`}
                    onClick={() => { setCustomRange({ active: false, start: '', end: '' }); setPeriod(val); }}
                    style={{
                      padding: '6px 12px', fontFamily: A.font, fontSize: 12, fontWeight: active ? 700 : 500,
                      background: active ? A.ink : 'transparent',
                      color: active ? A.cream : A.mutedText,
                      border: 'none', borderRadius: 7, cursor: 'pointer',
                      transition: 'all 0.15s',
                    }}>{label}</button>
                );
              })}
              <DateRangePicker
                value={customRange}
                onChange={setCustomRange}
                maxDate={todayKey()}
                theme={A}
                pillClassName="pay-period-pill"
              />
            </div>

            <span style={{ width: 1, height: 22, background: 'rgba(0,0,0,0.10)' }} />

            {/* Search */}
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search order #, table, amount…"
              style={{
                flex: 1, minWidth: 220,
                padding: '8px 12px', borderRadius: 8,
                border: A.border, background: A.shellDarker,
                fontSize: 13, fontFamily: A.font, color: A.ink,
                outline: 'none',
              }}
              onFocus={e => e.target.style.background = A.shell}
              onBlur={e => e.target.style.background = A.shellDarker}
            />
            <span style={{ fontSize: 12, color: A.faintText, fontWeight: 500 }}>
              {displayed.length} order{displayed.length === 1 ? '' : 's'}
            </span>
          </div>
        </div>

        {/* ═══ Orders list ═══ */}
        <div style={{ padding: '0 28px 80px' }}>
          {!loaded ? (
            // Loading state — shown while Firestore fetches orders. Prevents
            // flashing "No payments" before data arrives on first load.
            <div style={{
              background: A.shell, borderRadius: 14, border: A.border,
              padding: '64px 32px', textAlign: 'center', boxShadow: A.shadowCard,
            }}>
              <div style={{
                display: 'inline-block', width: 24, height: 24,
                border: `2px solid ${A.subtleBg}`, borderTopColor: A.warning,
                borderRadius: '50%', animation: 'spin 0.8s linear infinite',
                marginBottom: 16,
              }} />
              <div style={{ fontSize: 13, color: A.mutedText }}>Loading payments…</div>
            </div>
          ) : grouped.length === 0 ? (
            <div style={{
              background: A.shell, borderRadius: 14, border: A.border,
              padding: '64px 32px', textAlign: 'center', boxShadow: A.shadowCard,
            }}>
              <div style={{ display: 'inline-flex', gap: 10, marginBottom: 20, alignItems: 'center' }}>
                <span style={{ width: 10, height: 10, borderRadius: '50%', background: A.warning, opacity: 0.8, animation: 'pulse 1.8s infinite' }} />
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'rgba(0,0,0,0.10)' }} />
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'rgba(0,0,0,0.06)' }} />
              </div>
              <div style={{ fontWeight: 600, fontSize: 16, color: A.ink, marginBottom: 8, letterSpacing: '-0.2px' }}>
                {filter === 'pending' ? 'No pending payments' : filter === 'completed' ? 'No completed payments' : 'No payments yet'}
              </div>
              <div style={{ fontSize: 13, color: A.mutedText, lineHeight: 1.6, maxWidth: 360, margin: '0 auto' }}>
                {filter === 'pending'
                  ? 'Payment requests from customers will appear here.'
                  : 'Payments will show up once orders are served and settled.'}
              </div>
            </div>
          ) : (
            grouped.map(group => (
              <div key={group.key} style={{ marginBottom: 28 }}>
                {/* Day tag */}
                <div style={{ display: 'inline-block', padding: '5px 14px', borderRadius: 14, background: A.ink, color: A.cream, fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 14 }}>
                  {group.date.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })}
                  <span style={{ color: 'rgba(237,237,237,0.5)', marginLeft: 10, fontWeight: 500 }}>
                    {group.orders.length} order{group.orders.length === 1 ? '' : 's'}
                  </span>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {group.orders.map((order, idx) => {
                    const meta = PAYMENT_STATUS[order.paymentStatus] || PAYMENT_STATUS.unpaid;
                    const paid = isPaid(order);
                    const requested = isRequested(order);
                    const total = order.total || (order.items || []).reduce((s, i) => s + ((i.price || 0) * (i.qty || 1)), 0);
                    const expanded = expandedId === order.id;

                    // Collection time — for paid orders, how long from createdAt to paymentUpdatedAt
                    const collectionTime = (paid && order.createdAt?.seconds && order.paymentUpdatedAt?.seconds)
                      ? order.paymentUpdatedAt.seconds - order.createdAt.seconds
                      : null;

                    return (
                      <div key={order.id} className="pay-row"
                        onClick={(e) => {
                          if (e.target.closest('button') || e.target.closest('input')) return;
                          setExpandedId(expanded ? null : order.id);
                        }}
                        style={{
                          background: A.shell, borderRadius: 14, border: A.border,
                          borderLeft: paid ? `4px solid ${A.success}` : requested ? `4px solid ${A.warning}` : `4px solid rgba(0,0,0,0.15)`,
                          boxShadow: A.shadowCard,
                          padding: '16px 22px',
                          animation: 'fadeUp 0.22s ease both',
                          animationDelay: `${Math.min(idx * 0.03, 0.3)}s`,
                          cursor: 'pointer',
                          opacity: paid ? 0.85 : 1,
                        }}>
                        {/* Top row: order # · table · status · amount */}
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', minWidth: 0 }}>
                            <span style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 700, fontSize: 17, color: A.ink, letterSpacing: '-0.4px' }}>
                              {orderLabel(order)}
                            </span>
                            <span style={{ color: A.faintText, fontSize: 14 }}>·</span>
                            <span style={{ fontSize: 14, fontWeight: 600, color: A.ink }}>
                              {(order.orderType === 'takeaway' || order.orderType === 'takeout')
                                ? `Takeaway${order.customerName ? ` · ${order.customerName}` : ''}`
                                : `Table ${order.tableNumber || '—'}`}
                            </span>
                            <span style={{
                              fontSize: 10, fontWeight: 700, letterSpacing: '0.08em',
                              padding: '3px 8px', borderRadius: 4, textTransform: 'uppercase',
                              background: meta.bg, color: meta.color,
                            }}>
                              {meta.label}
                            </span>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                            <span style={{ fontSize: 11, color: A.faintText, fontWeight: 500, whiteSpace: 'nowrap' }}>
                              {fmtTime(order.createdAt?.seconds)}
                            </span>
                            <span style={{
                              fontFamily: "'JetBrains Mono', monospace", fontWeight: 700, fontSize: 16,
                              color: A.ink, letterSpacing: '-0.3px', fontVariantNumeric: 'tabular-nums',
                            }}>
                              {formatRupee(total)}
                            </span>
                          </div>
                        </div>

                        {/* Subtitle: item count, collection time if paid */}
                        <div style={{ marginTop: 6, fontSize: 12, color: A.mutedText, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                          <span>{(order.items || []).length} item{(order.items || []).length === 1 ? '' : 's'}</span>
                          {collectionTime != null && (
                            <>
                              <span style={{ color: A.faintText }}>·</span>
                              <span>Collected {formatElapsed(collectionTime)} after bill</span>
                            </>
                          )}
                          {!paid && (
                            <>
                              <span style={{ color: A.faintText }}>·</span>
                              <span style={{
                                fontSize: 10, color: A.faintText, fontStyle: 'italic',
                              }}>Click to {expanded ? 'collapse' : 'view items'}</span>
                            </>
                          )}
                        </div>

                        {/* Expanded items list */}
                        {expanded && (order.items || []).length > 0 && (
                          <div style={{
                            marginTop: 12, paddingTop: 12,
                            borderTop: '1px dashed rgba(0,0,0,0.08)',
                          }}>
                            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.10em', textTransform: 'uppercase', color: A.faintText, marginBottom: 8 }}>
                              Bill breakdown
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                              {(order.items || []).map((item, i) => {
                                const lineTotal = (item.price || 0) * (item.qty || 1);
                                return (
                                  <div key={i} style={{
                                    display: 'grid', gridTemplateColumns: '36px 1fr auto',
                                    gap: 14, alignItems: 'center',
                                  }}>
                                    <span style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 700, fontSize: 13, color: A.warning }}>
                                      {item.qty || 1}×
                                    </span>
                                    <span style={{ fontSize: 13, fontWeight: 500, color: A.ink }}>
                                      {item.name}
                                    </span>
                                    <span style={{ fontSize: 12, fontWeight: 600, color: A.mutedText, fontVariantNumeric: 'tabular-nums' }}>
                                      {formatRupee(lineTotal)}
                                    </span>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        )}

                        {/* Actions row — only for unpaid orders */}
                        {!paid && (
                          <div className="no-print" style={{
                            marginTop: 14,
                            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                            gap: 12, flexWrap: 'wrap',
                          }}>
                            {requested ? (
                              // Customer picked a method — method pre-selected, admin just confirms.
                              // Left: show the selected method as a confirmation label.
                              // Right: Mark as Paid button.
                              <>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                  <span style={{ fontSize: 11, fontWeight: 600, color: A.mutedText, letterSpacing: '0.04em' }}>
                                    Customer selected:
                                  </span>
                                  <span style={{
                                    padding: '6px 14px', borderRadius: 8,
                                    background: 'rgba(196,168,109,0.14)',
                                    border: `1px solid rgba(196,168,109,0.35)`,
                                    color: A.warningDim,
                                    fontSize: 12, fontWeight: 700, letterSpacing: '0.02em',
                                  }}>
                                    {meta.methodKey === 'cash' ? 'Cash' : meta.methodKey === 'card' ? 'Card' : 'UPI'}
                                  </span>
                                </div>
                                <button className="pay-action-btn"
                                  disabled={updating === order.id}
                                  onClick={() => markPaid(order, meta.methodKey)}
                                  style={{
                                    padding: '9px 20px', borderRadius: 8, border: 'none',
                                    background: A.success, color: A.shell,
                                    fontFamily: A.font, fontSize: 13, fontWeight: 700,
                                    cursor: 'pointer', letterSpacing: '0.01em',
                                    opacity: updating === order.id ? 0.6 : 1,
                                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                                    minWidth: 130,
                                  }}>
                                  {updating === order.id
                                    ? <span style={{ display: 'inline-block', width: 13, height: 13, border: '2px solid rgba(255,255,255,0.4)', borderTopColor: A.shell, borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
                                    : 'Mark as Paid'}
                                </button>
                              </>
                            ) : (
                              // Unpaid — customer hasn't picked. Two-step flow:
                              //   1. Cash is pre-selected by default (most common in India — saves a tap).
                              //      Admin can switch to Card/UPI by tapping.
                              //   2. Admin taps Mark as Paid → commits via markPaid().
                              // If admin marks wrong method, the 60s undo toast catches it.
                              (() => {
                                const effectiveMethod = selectedMethods[order.id] || 'cash';
                                return (
                                  <>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                                      <span style={{ fontSize: 11, fontWeight: 600, color: A.mutedText, letterSpacing: '0.04em' }}>
                                        Mark as paid by:
                                      </span>
                                      {[
                                        { key: 'cash',   label: 'Cash' },
                                        { key: 'card',   label: 'Card' },
                                        { key: 'online', label: 'UPI' },
                                      ].map(m => {
                                        const selected = effectiveMethod === m.key;
                                        return (
                                          <button key={m.key} className="pay-action-btn"
                                            disabled={updating === order.id}
                                            onClick={() => setSelectedMethods(prev => ({ ...prev, [order.id]: m.key }))}
                                            style={{
                                              padding: '7px 16px', borderRadius: 8,
                                              // Tinted gold bg + border + bold when selected; subtle gray when not.
                                              background: selected ? 'rgba(196,168,109,0.16)' : A.subtleBg,
                                              border: selected ? `1.5px solid ${A.warning}` : `1.5px solid transparent`,
                                              color: selected ? A.warningDim : A.ink,
                                              fontFamily: A.font, fontSize: 12,
                                              fontWeight: selected ? 700 : 600,
                                              cursor: 'pointer',
                                              transition: 'all 0.12s',
                                            }}>
                                            {m.label}
                                          </button>
                                        );
                                      })}
                                    </div>
                                    <button className="pay-action-btn"
                                      disabled={updating === order.id}
                                      onClick={() => markPaid(order, effectiveMethod)}
                                      style={{
                                        padding: '9px 20px', borderRadius: 8, border: 'none',
                                        background: A.success, color: A.shell,
                                        fontFamily: A.font, fontSize: 13, fontWeight: 700,
                                        cursor: 'pointer', letterSpacing: '0.01em',
                                        opacity: updating === order.id ? 0.6 : 1,
                                        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                                        minWidth: 130,
                                        transition: 'all 0.15s',
                                      }}>
                                      {updating === order.id
                                        ? <span style={{ display: 'inline-block', width: 13, height: 13, border: '2px solid rgba(255,255,255,0.4)', borderTopColor: A.shell, borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
                                        : 'Mark as Paid'}
                                    </button>
                                  </>
                                );
                              })()
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))
          )}
        </div>

        {/* ═══ Undo banner (60-second window) ═══
            Note: AdminLayout has a 240px sidebar. `position: fixed` + `left: 50%`
            would center on the viewport (including sidebar), making the banner appear
            visually off-center relative to the content area. Shift right by 120px
            (half the sidebar width) so the banner centers on the visible content. */}
        {undoBanner && (
          <div className="no-print" style={{
            position: 'fixed', bottom: 24,
            left: 'calc(50% + 120px)', transform: 'translateX(-50%)',
            zIndex: 100,
            background: A.ink, color: A.cream,
            borderRadius: 12, padding: '12px 18px',
            boxShadow: '0 8px 32px rgba(0,0,0,0.25)',
            display: 'flex', alignItems: 'center', gap: 14,
            fontFamily: A.font, fontSize: 13, fontWeight: 500,
            animation: 'slideUp 0.25s ease both',
          }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: A.success, flexShrink: 0 }} />
            <span>Payment marked. Undo within 60 seconds if incorrect.</span>
            <button onClick={undoPayment} style={{
              padding: '6px 14px', borderRadius: 6, border: 'none',
              background: A.warning, color: A.ink,
              fontFamily: A.font, fontSize: 12, fontWeight: 700,
              cursor: 'pointer', letterSpacing: '0.02em',
            }}>Undo</button>
            <button onClick={() => { if (undoBanner.timeoutId) clearTimeout(undoBanner.timeoutId); setUndoBanner(null); }} style={{
              padding: '4px 8px', borderRadius: 6, border: 'none',
              background: 'transparent', color: 'rgba(237,237,237,0.4)',
              fontSize: 16, cursor: 'pointer', lineHeight: 1,
            }}>×</button>
          </div>
        )}

        {/* ═══ Phase E — Cash payment confirmation modal ═══
            Mirrors the waiter-dashboard cash modal so the UX is the same
            wherever staff confirm a cash payment. Captures cashReceived
            + auto-computes changeGiven; both persist on the order doc
            via markOrderPaid extras for the cash-drawer audit trail. */}
        {cashModal && (() => {
          const order = cashModal.order;
          const total = Math.round(Number(order?.total) || 0);
          const received = Math.round(Number(cashReceived) || 0);
          const change = Math.max(0, received - total);
          const ok = received >= total;
          return (
            <div
              className="no-print"
              onClick={() => { setCashModal(null); setCashReceived(''); }}
              style={{
                position: 'fixed', inset: 0, zIndex: 100,
                background: 'rgba(0,0,0,0.45)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                padding: 16, fontFamily: A.font,
              }}
            >
              <div
                onClick={e => e.stopPropagation()}
                style={{
                  background: A.shell, borderRadius: 16, padding: '24px 24px 20px',
                  width: '100%', maxWidth: 380, boxShadow: '0 20px 60px rgba(0,0,0,0.25)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                  <span style={{
                    fontSize: 9, fontWeight: 700, letterSpacing: '0.10em',
                    padding: '2px 7px', borderRadius: 4, textTransform: 'uppercase',
                    background: 'rgba(196,168,109,0.14)', color: A.warningDim,
                  }}>PAY · CASH</span>
                  <span style={{ fontSize: 12, color: A.mutedText, fontWeight: 500 }}>
                    {orderLabel(order)} · Table {order.tableNumber || '—'}
                  </span>
                </div>
                <div style={{ fontSize: 18, fontWeight: 700, color: A.ink, letterSpacing: '-0.3px', marginBottom: 18 }}>
                  Cash payment
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 14, padding: '10px 14px', background: A.shellDarker, borderRadius: 10 }}>
                  <span style={{ fontSize: 12, color: A.mutedText, fontWeight: 500 }}>Order total</span>
                  <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 18, fontWeight: 700, color: A.ink, letterSpacing: '-0.3px' }}>
                    ₹{total.toLocaleString('en-IN')}
                  </span>
                </div>

                <label style={{ display: 'block', fontSize: 11, color: A.mutedText, fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase', marginBottom: 6 }}>
                  Cash received
                </label>
                <div style={{ position: 'relative', marginBottom: 12 }}>
                  <span style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', fontSize: 16, color: A.mutedText, fontWeight: 600 }}>₹</span>
                  <input
                    type="number"
                    inputMode="numeric"
                    min={total}
                    value={cashReceived}
                    onChange={e => setCashReceived(e.target.value)}
                    autoFocus
                    style={{
                      width: '100%', padding: '12px 14px 12px 28px',
                      borderRadius: 10, border: A.border, background: A.shell,
                      fontSize: 18, fontWeight: 700, fontFamily: "'JetBrains Mono', monospace",
                      color: A.ink, outline: 'none', letterSpacing: '-0.3px',
                    }}
                  />
                </div>

                <div style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
                  marginBottom: 18, padding: '10px 14px',
                  background: change > 0 ? 'rgba(63,158,90,0.08)' : A.shellDarker,
                  borderRadius: 10,
                }}>
                  <span style={{ fontSize: 12, color: A.mutedText, fontWeight: 500 }}>Change to give</span>
                  <span style={{
                    fontFamily: "'JetBrains Mono', monospace", fontSize: 18, fontWeight: 700,
                    color: change > 0 ? A.success : A.faintText,
                    letterSpacing: '-0.3px',
                  }}>
                    ₹{change.toLocaleString('en-IN')}
                  </span>
                </div>

                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    onClick={() => { setCashModal(null); setCashReceived(''); }}
                    disabled={updating === order.id}
                    style={{
                      flex: 1, padding: '12px 16px', borderRadius: 10, border: A.border,
                      background: A.shell, color: A.mutedText,
                      fontFamily: A.font, fontSize: 13, fontWeight: 600, cursor: 'pointer',
                    }}
                  >
                    Cancel
                  </button>
                  <button
                    onClick={confirmCashPayment}
                    disabled={!ok || updating === order.id}
                    style={{
                      flex: 2, padding: '12px 16px', borderRadius: 10, border: 'none',
                      background: ok ? A.warning : 'rgba(196,168,109,0.35)',
                      color: A.ink, fontFamily: A.font, fontSize: 13, fontWeight: 700,
                      cursor: ok ? 'pointer' : 'not-allowed', letterSpacing: '0.01em',
                      display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                    }}
                  >
                    {updating === order.id
                      ? <span style={{ display: 'inline-block', width: 14, height: 14, border: '2px solid rgba(0,0,0,0.4)', borderTopColor: A.ink, borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
                      : `Confirm Payment${change > 0 ? ` (₹${change} change)` : ''}`}
                  </button>
                </div>
              </div>
            </div>
          );
        })()}
      </div>
    </AdminLayout>
  );
}

AdminPayments.getLayout = (page) => page;