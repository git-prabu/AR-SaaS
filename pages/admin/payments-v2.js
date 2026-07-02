// pages/admin/payments-v2.js
//
// ★ REDESIGN EXEMPLAR ★ — duplicate of /admin/payments on the dark "ok-root"
// theme (via <OkShell>). ALL logic (live Firestore listener, period/custom-range
// filtering, two-step mark-paid with cash modal + change calc, 60s undo banner,
// auto-confirm unmatched-payment matching, sound/voice announce, CSV/print)
// copied verbatim — only the render is re-themed. ConfirmModal stays shared/light.
// Original /admin/payments untouched.
import Head from 'next/head';
import { useEffect, useState, useMemo, useRef } from 'react';
import { useFeatureAccess } from '../../hooks/useFeatureAccess';
import OkShell from '../../components/admin/OkShell';
import { updatePaymentStatus, markOrderPaidAs, cancelOrder, todayKey } from '../../lib/db';
import { exportRowsCsv } from '../../lib/csv';
import { collection, onSnapshot, query, orderBy, where, doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import toast from 'react-hot-toast';
import DateRangePicker from '../../components/DateRangePicker';
import { announcePayment, unlockSound, isVoiceEnabled, setVoiceEnabled as setVoiceEnabledLS } from '../../lib/sounds';
import ConfirmModal from '../../components/ConfirmModal';

// Dark theme object passed to the shared DateRangePicker (concrete hexes; it
// renders its own popover so it can't read the .ok-root CSS vars).
const INTER = "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
const DT = {
  font: INTER, cream: '#EFEBE4', ink: '#EFEBE4', shell: '#1C1A17', shellDarker: '#141210',
  warning: '#C4A86D', warningDim: '#C4A86D', success: '#3FAA63', danger: '#E0726D',
  mutedText: 'rgba(239,235,228,0.55)', faintText: 'rgba(239,235,228,0.35)',
  subtleBg: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)',
};

const PAYMENT_STATUS = {
  unpaid:           { label: 'Unpaid',         kind: 'unpaid',    color: 'var(--tx-3)', bg: 'var(--card-3)' },
  cash_requested:   { label: 'Cash requested', kind: 'requested', color: 'var(--gold)', bg: 'rgba(196,168,109,0.12)', methodKey: 'cash' },
  card_requested:   { label: 'Card requested', kind: 'requested', color: '#7FB3C9',      bg: 'rgba(74,116,136,0.18)',  methodKey: 'card' },
  online_requested: { label: 'UPI requested',  kind: 'requested', color: '#B79BD6',      bg: 'rgba(107,74,136,0.20)',  methodKey: 'online' },
  paid_cash:        { label: 'Paid · Cash',    kind: 'paid',      color: 'var(--success)', bg: 'rgba(63,170,99,0.12)', methodKey: 'cash' },
  paid_card:        { label: 'Paid · Card',    kind: 'paid',      color: 'var(--success)', bg: 'rgba(63,170,99,0.12)', methodKey: 'card' },
  paid_online:      { label: 'Paid · UPI',     kind: 'paid',      color: 'var(--success)', bg: 'rgba(63,170,99,0.12)', methodKey: 'online' },
};
const PAID_STATUSES = new Set(['paid_cash', 'paid_card', 'paid_online', 'paid']);

function startOfToday() { const d = new Date(); d.setHours(0, 0, 0, 0); return d.getTime() / 1000; }
function startOfWeek() { const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - d.getDay()); return d.getTime() / 1000; }
function startOfMonth() { const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(1); return d.getTime() / 1000; }
function formatRupee(n) { const v = Math.round(Number(n) || 0); return '₹' + v.toLocaleString('en-IN'); }
function formatElapsed(seconds) {
  if (seconds == null || seconds < 0) return '—';
  if (seconds < 60) return `${Math.floor(seconds)}s`;
  const totalMin = Math.floor(seconds / 60);
  if (totalMin < 60) { const s = Math.floor(seconds % 60); return s === 0 ? `${totalMin}m` : `${totalMin}m ${s}s`; }
  const totalHr = Math.floor(totalMin / 60);
  if (totalHr < 24) { const m = totalMin % 60; return m === 0 ? `${totalHr}h` : `${totalHr}h ${m}m`; }
  const d = Math.floor(totalHr / 24); const h = totalHr % 24; return h === 0 ? `${d}d` : `${d}d ${h}h`;
}
function orderLabel(o) { if (typeof o.orderNumber === 'number' && o.orderNumber > 0) return `#${o.orderNumber}`; return '#' + (o.id || '').slice(-5).toUpperCase(); }
function fmtTime(seconds) { if (!seconds) return '—'; return new Date(seconds * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }); }

async function fireReceiptEmail(rid, orderId, user) {
  if (!user || !rid || !orderId) return;
  try { const idToken = await user.getIdToken(); fetch('/api/email/send-receipt', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` }, body: JSON.stringify({ restaurantId: rid, orderId }) }).catch(err => console.warn('[receipt-email] fire failed:', err?.message)); }
  catch (err) { console.warn('[receipt-email] could not get idToken:', err?.message); }
}
async function firePetpoojaPaymentSync(rid, orderId, user) {
  if (!user || !rid || !orderId) return;
  try { const idToken = await user.getIdToken(); fetch('/api/petpooja/payment-sync', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` }, body: JSON.stringify({ restaurantId: rid, orderId }) }).catch(err => console.warn('[petpooja-sync] fire failed:', err?.message)); }
  catch (err) { console.warn('[petpooja-sync] could not get idToken:', err?.message); }
}

export default function PaymentsV2() {
  const { ready, isAdmin, rid, scopedDb, canView, user } = useFeatureAccess('payments');

  const [allOrders, setAllOrders] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [filter, setFilter] = useState('pending');
  const [period, setPeriod] = useState('today');
  const [customRange, setCustomRange] = useState({ active: false, start: '', end: '' });
  const [search, setSearch] = useState('');
  const [updating, setUpdating] = useState(null);
  const [confirmDialog, setConfirmDialog] = useState(null);
  const [expandedId, setExpandedId] = useState(null);
  const [selectedMethods, setSelectedMethods] = useState({});
  const [undoBanner, setUndoBanner] = useState(null);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [voiceEnabled, setVoiceEnabledState] = useState(false);
  const [cashModal, setCashModal] = useState(null);
  const [cashReceived, setCashReceived] = useState('');
  const prevRequestedIdsRef = useRef(new Set());
  const initialPaymentsLoadedRef = useRef(false);
  const [unmatched, setUnmatched] = useState([]);
  const [unmatchedAssigning, setUnmatchedAssigning] = useState(null);

  useEffect(() => {
    try { const stored = localStorage.getItem('ar_payments_sound'); if (stored !== null) setSoundEnabled(stored === 'true'); } catch {}
    try { setVoiceEnabledState(isVoiceEnabled()); } catch {}
  }, []);
  useEffect(() => { try { localStorage.setItem('ar_payments_sound', String(soundEnabled)); } catch {} }, [soundEnabled]);
  useEffect(() => { setVoiceEnabledLS(voiceEnabled); }, [voiceEnabled]);

  useEffect(() => {
    if (!rid || !canView) return;
    const q = query(collection(scopedDb, 'restaurants', rid, 'orders'), orderBy('createdAt', 'desc'));
    return onSnapshot(q, snap => { setAllOrders(snap.docs.map(d => ({ id: d.id, ...d.data() }))); setLoaded(true); }, err => { console.error('Payments listener error:', err); setLoaded(true); });
  }, [rid, canView, scopedDb]);

  useEffect(() => {
    if (!rid || !isAdmin) return;
    const q = query(collection(scopedDb, 'restaurants', rid, 'needsMatch'), where('resolved', '==', false), orderBy('receivedAt', 'desc'));
    return onSnapshot(q, snap => { setUnmatched(snap.docs.map(d => ({ id: d.id, ...d.data() }))); }, err => { if (err?.code !== 'permission-denied') console.warn('needsMatch listener error:', err?.message); });
  }, [rid, isAdmin, scopedDb]);

  const assignUnmatched = async (unmatchedId, orderId) => {
    if (!rid) return;
    setUnmatchedAssigning(unmatchedId);
    try {
      const um = unmatched.find(u => u.id === unmatchedId);
      await markOrderPaidAs(scopedDb, rid, orderId, 'paid_online', { gatewayProviderRef: um?.providerTxnId || null, autoConfirmPayerVpa: um?.payerVpa || null, autoConfirmResolvedFrom: 'manual-assign' }).catch(async () => { await updatePaymentStatus(rid, orderId, 'paid_online', { db: scopedDb }); });
      await updateDoc(doc(scopedDb, 'restaurants', rid, 'needsMatch', unmatchedId), { resolved: true, resolvedAt: serverTimestamp(), resolvedOrderId: orderId });
      toast.success('Payment assigned to order');
    } catch (e) { console.error('assignUnmatched failed:', e); toast.error('Could not assign payment'); }
    finally { setUnmatchedAssigning(null); }
  };

  useEffect(() => () => { if (undoBanner?.timeoutId) clearTimeout(undoBanner.timeoutId); }, [undoBanner]);

  useEffect(() => {
    const requested = allOrders.filter(o => ['cash_requested', 'card_requested', 'online_requested'].includes(o.paymentStatus));
    const currentIds = new Set(requested.map(o => o.id));
    if (!initialPaymentsLoadedRef.current) { prevRequestedIdsRef.current = currentIds; initialPaymentsLoadedRef.current = true; return; }
    const prevIds = prevRequestedIdsRef.current;
    const newOnes = requested.filter(o => !prevIds.has(o.id));
    if (newOnes.length > 0) {
      const o = newOnes[0];
      const isTakeaway = o.orderType === 'takeaway' || o.orderType === 'takeout';
      const rawTable = isTakeaway ? (o.customerName || 'Takeaway') : (o.tableNumber || '');
      const tableLabel = String(rawTable || '').trim() || 'unknown';
      const methodLabel = PAYMENT_STATUS[o.paymentStatus]?.methodKey === 'cash' ? 'Cash' : PAYMENT_STATUS[o.paymentStatus]?.methodKey === 'card' ? 'Card' : PAYMENT_STATUS[o.paymentStatus]?.methodKey === 'online' ? 'UPI' : 'payment';
      announcePayment(tableLabel, methodLabel, { sound: soundEnabled });
    }
    prevRequestedIdsRef.current = currentIds;
  }, [allOrders, soundEnabled]);

  const relevantOrders = useMemo(() => {
    return allOrders.filter(o => {
      if (o.status === 'cancelled') return false;
      const hasPaymentActivity = o.paymentStatus && o.paymentStatus !== 'inactive';
      if (!hasPaymentActivity) return false;
      if (o.status === 'awaiting_payment') return true;
      if (o.status === 'served') return true;
      if (['cash_requested', 'card_requested', 'online_requested'].includes(o.paymentStatus)) return true;
      if (PAID_STATUSES.has(o.paymentStatus)) return true;
      return false;
    });
  }, [allOrders]);

  const isPaid = (o) => PAID_STATUSES.has(o.paymentStatus);
  const isRequested = (o) => PAYMENT_STATUS[o.paymentStatus]?.kind === 'requested';

  const customBounds = useMemo(() => {
    if (!customRange.active || !customRange.start || !customRange.end) return null;
    const s = new Date(customRange.start + 'T00:00:00'); s.setHours(0, 0, 0, 0);
    const e = new Date(customRange.end + 'T23:59:59'); e.setHours(23, 59, 59, 999);
    return { start: s.getTime() / 1000, end: e.getTime() / 1000 };
  }, [customRange]);

  const periodStart = useMemo(() => { if (period === 'today') return startOfToday(); if (period === 'week') return startOfWeek(); if (period === 'month') return startOfMonth(); return 0; }, [period]);

  const inPeriod = (o) => {
    const ts = isPaid(o) ? (o.paymentUpdatedAt?.seconds || o.createdAt?.seconds || 0) : (o.createdAt?.seconds || 0);
    if (customBounds) return ts >= customBounds.start && ts <= customBounds.end;
    if (periodStart === 0) return true;
    return ts >= periodStart;
  };

  const stats = useMemo(() => {
    const inRange = relevantOrders.filter(inPeriod);
    const pending = inRange.filter(o => !isPaid(o));
    const paid = inRange.filter(o => isPaid(o));
    const collected = paid.reduce((s, o) => s + (o.total || 0), 0);
    const withTimes = paid.filter(o => o.createdAt?.seconds && o.paymentUpdatedAt?.seconds);
    const avgSec = withTimes.length > 0 ? Math.round(withTimes.reduce((s, o) => s + (o.paymentUpdatedAt.seconds - o.createdAt.seconds), 0) / withTimes.length) : null;
    const methodCounts = paid.reduce((acc, o) => { const key = PAYMENT_STATUS[o.paymentStatus]?.methodKey || 'other'; acc[key] = (acc[key] || 0) + 1; return acc; }, {});
    return { pending: pending.length, paidCount: paid.length, collected, avgSec, methodCounts };
  }, [relevantOrders, customBounds, periodStart]); // eslint-disable-line react-hooks/exhaustive-deps

  const displayed = useMemo(() => {
    let list = relevantOrders.filter(inPeriod);
    if (filter === 'pending') list = list.filter(o => !isPaid(o));
    if (filter === 'completed') list = list.filter(o => isPaid(o));
    const q = search.trim().toLowerCase();
    if (q) list = list.filter(o => { if (String(o.tableNumber || '').toLowerCase().includes(q)) return true; if (orderLabel(o).toLowerCase().includes(q)) return true; if (String(o.total || '').includes(q)) return true; return false; });
    return list;
  }, [relevantOrders, filter, search, customBounds, periodStart]); // eslint-disable-line react-hooks/exhaustive-deps

  const markPaid = async (order, method) => {
    if (!rid) return;
    if (method === 'cash') { const total = Math.round(Number(order?.total) || 0); setCashModal({ order }); setCashReceived(String(total)); return; }
    const previousStatus = order.paymentStatus; const newStatus = `paid_${method}`;
    setUpdating(order.id);
    try {
      await markOrderPaidAs(scopedDb, rid, order.id, newStatus);
      fireReceiptEmail(rid, order.id, user); firePetpoojaPaymentSync(rid, order.id, user);
      setSelectedMethods(prev => { const n = { ...prev }; delete n[order.id]; return n; });
      showUndoBanner(order.id, previousStatus);
    } catch (e) { console.error('Payment update failed:', e); toast.error('Could not mark as paid. Check connection and retry.'); }
    setUpdating(null);
  };

  const confirmCashPayment = async () => {
    if (!cashModal || !rid) return;
    const order = cashModal.order;
    const total = Math.round(Number(order?.total) || 0);
    const received = Math.round(Number(cashReceived) || 0);
    if (received < total) { toast.error(`Cash received (₹${received}) is less than total (₹${total}).`); return; }
    const change = received - total;
    const previousStatus = order.paymentStatus;
    setUpdating(order.id);
    try {
      await markOrderPaidAs(scopedDb, rid, order.id, 'paid_cash', { cashReceived: received, changeGiven: change });
      fireReceiptEmail(rid, order.id, user); firePetpoojaPaymentSync(rid, order.id, user);
      setSelectedMethods(prev => { const n = { ...prev }; delete n[order.id]; return n; });
      showUndoBanner(order.id, previousStatus);
      toast.success(change > 0 ? `Paid · Change ₹${change}` : 'Paid · Exact cash');
      setCashModal(null); setCashReceived('');
    } catch (e) { console.error('Cash payment failed:', e); toast.error('Could not mark as paid. Retry in a moment.'); }
    setUpdating(null);
  };

  const cancelFromPayments = (order) => {
    const cancellable = order.status === 'awaiting_payment' || ['cash_requested', 'card_requested', 'online_requested'].includes(order.paymentStatus);
    if (!cancellable) { toast.error('Cannot cancel — order is past the cancellable window.'); return; }
    const ref = order.orderNumber ? `#${order.orderNumber}` : `for table ${order.tableNumber || '—'}`;
    setConfirmDialog({
      title: `Cancel order ${ref}?`,
      body: order.status === 'awaiting_payment' ? "The customer's order is parked waiting for payment. Cancelling removes it cleanly — they haven't been charged yet." : "Payment was requested but never confirmed. Cancelling marks the order cancelled and removes it from this list.",
      confirmLabel: 'Yes, cancel order', cancelLabel: 'Keep order', destructive: true,
      onConfirm: async () => {
        setUpdating(order.id);
        try { await cancelOrder(rid, order.id, 'cancelled-by-admin', { db: scopedDb }); toast.success('Order cancelled'); }
        catch (e) { console.error('[cancel] failed', e); const codeNote = e?.code === 'permission-denied' ? ' (permission denied — try refreshing the page)' : e?.code ? ` (${e.code})` : ''; toast.error('Could not cancel.' + codeNote); }
        setUpdating(null);
      },
    });
  };

  const undoPayment = async () => {
    if (!undoBanner || !rid) return;
    const { orderId, previousStatus, timeoutId } = undoBanner;
    if (timeoutId) clearTimeout(timeoutId);
    setUndoBanner(null);
    try { await updatePaymentStatus(rid, orderId, previousStatus, { db: scopedDb }); toast.success('Payment undone.'); }
    catch (e) { console.error('Undo failed:', e); toast.error('Undo failed. The payment is still marked — try marking it back manually.'); }
  };
  const showUndoBanner = (orderId, previousStatus) => { if (undoBanner?.timeoutId) clearTimeout(undoBanner.timeoutId); const expiresAt = Date.now() + 60000; const timeoutId = setTimeout(() => setUndoBanner(null), 60000); setUndoBanner({ orderId, previousStatus, expiresAt, timeoutId }); };

  const exportCSV = () => {
    const rows = [
      ['Order #', 'Table', 'Status', 'Method', 'Total', 'Items', 'Bill time', 'Paid time'],
      ...displayed.map(o => { const meta = PAYMENT_STATUS[o.paymentStatus] || PAYMENT_STATUS.unpaid; return [orderLabel(o), o.tableNumber || '', meta.label, meta.methodKey || '—', o.total || 0, (o.items || []).map(i => `${i.qty || 1}x ${i.name}`).join('; '), fmtTime(o.createdAt?.seconds), fmtTime(o.paymentUpdatedAt?.seconds)]; }),
    ];
    exportRowsCsv(rows, `payments-${period}-${new Date().toISOString().slice(0, 10)}.csv`);
  };
  const print = () => { if (typeof window !== 'undefined') window.print(); };

  const grouped = useMemo(() => {
    const map = new Map();
    displayed.forEach(o => { const secs = o.createdAt?.seconds || 0; const d = new Date(secs * 1000); const key = d.toISOString().slice(0, 10); if (!map.has(key)) map.set(key, { key, date: d, orders: [] }); map.get(key).orders.push(o); });
    return Array.from(map.values()).sort((a, b) => b.date - a.date);
  }, [displayed]);

  if (!ready) return (<div className="ok-root" style={{ minHeight: '100vh', display: 'grid', placeItems: 'center' }}><Head><title>Payments — HaloHelm</title></Head><div style={{ color: 'var(--tx-3)', fontFamily: 'var(--font-body)', fontSize: 14 }}>Loading…</div></div>);
  if (!canView) return (<div className="ok-root" style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 24 }}><Head><title>Payments — HaloHelm</title></Head><div style={{ textAlign: 'center', maxWidth: 360 }}><div style={{ fontSize: 44, marginBottom: 12 }}>🔒</div><div style={{ color: 'var(--tx)', fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 18, marginBottom: 6 }}>No access</div><div style={{ color: 'var(--tx-3)', fontFamily: 'var(--font-body)', fontSize: 13.5, lineHeight: 1.6 }}>Your role doesn’t include Payments. Ask the owner to grant it.</div></div></div>);

  const iconBtn = (on) => ({ padding: '8px 12px', borderRadius: 10, border: `1px solid ${on ? '#C4A86D' : 'var(--line)'}`, background: on ? 'rgba(196,168,109,0.16)' : 'var(--card)', color: on ? '#D6BC85' : 'var(--tx-3)', fontSize: 14, cursor: 'pointer', minWidth: 38, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' });
  const headRight = (
    <div className="no-print" style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
      <button onClick={() => { setSoundEnabled(v => !v); unlockSound(); }} title={soundEnabled ? 'Mute payment sound' : 'Enable payment sound'} style={iconBtn(soundEnabled)}>
        {soundEnabled ? <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 5 6 9H2v6h4l5 4V5z" /><path d="M15.54 8.46a5 5 0 0 1 0 7.07" /><path d="M19.07 4.93a10 10 0 0 1 0 14.14" /></svg> : <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 5 6 9H2v6h4l5 4V5z" /><line x1="23" y1="9" x2="17" y2="15" /><line x1="17" y1="9" x2="23" y2="15" /></svg>}
      </button>
      <button onClick={() => setVoiceEnabledState(v => !v)} title={voiceEnabled ? 'Mute voice' : 'Enable voice'} style={iconBtn(voiceEnabled)}>
        {voiceEnabled ? <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z" /><path d="M19 10v1a7 7 0 0 1-14 0v-1" /><line x1="12" y1="18" x2="12" y2="22" /><line x1="8" y1="22" x2="16" y2="22" /></svg> : <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><line x1="1" y1="1" x2="23" y2="23" /><path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V5a3 3 0 0 0-5.94-.6" /><path d="M17 16.95A7 7 0 0 1 5 12v-1m14 0v1a7 7 0 0 1-.11 1.23" /><line x1="12" y1="18" x2="12" y2="22" /><line x1="8" y1="22" x2="16" y2="22" /></svg>}
      </button>
      <button onClick={exportCSV} style={{ padding: '8px 14px', borderRadius: 10, border: '1px solid var(--line)', background: 'var(--card)', color: 'var(--tx)', fontFamily: 'var(--font-display)', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>Export CSV</button>
      <button onClick={print} style={{ padding: '8px 14px', borderRadius: 10, border: '1px solid var(--line)', background: 'var(--card)', color: 'var(--tx)', fontFamily: 'var(--font-display)', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>Print</button>
    </div>
  );

  const periodLabel = customRange.active ? `${customRange.start} → ${customRange.end}` : period === 'today' ? 'Today' : period === 'week' ? 'This week' : period === 'month' ? 'This month' : 'All time';

  return (
    <>
      <Head><title>Payments — HaloHelm</title></Head>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}@keyframes ok-pulse{0%,100%{opacity:1}50%{opacity:.4}}@keyframes slideUp{from{transform:translateY(100%);opacity:0}to{transform:none;opacity:1}}@media print{.no-print{display:none!important}}`}</style>
      <OkShell active={null} eyebrow="Operations · collect & reconcile" title="Payments" brand={periodLabel} headRight={headRight}>
        {/* Live payments strip */}
        <div style={{ background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 14, padding: '12px 18px', marginBottom: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 20, flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 700, letterSpacing: '.12em', textTransform: 'uppercase', color: 'var(--gold)' }}>Live payments</span>
            </div>
            <div style={{ width: 1, height: 28, background: 'var(--line-soft)', flexShrink: 0 }} />
            <div style={{ display: 'flex', alignItems: 'center', gap: 20, flex: 1, flexWrap: 'wrap' }}>
              <div style={{ minWidth: 80 }}><div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, fontWeight: 600, letterSpacing: '.10em', textTransform: 'uppercase', color: 'var(--tx-3)', marginBottom: 2 }}>Pending</div><div style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: 22, color: stats.pending > 0 ? 'var(--gold)' : 'var(--tx)', lineHeight: 1 }}>{stats.pending}</div></div>
              <div style={{ width: 1, height: 24, background: 'var(--line)', flexShrink: 0 }} />
              <div style={{ minWidth: 120 }}><div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, fontWeight: 600, letterSpacing: '.10em', textTransform: 'uppercase', color: 'var(--tx-3)', marginBottom: 2 }}>Collected</div><div style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: 22, color: 'var(--gold)', lineHeight: 1 }}>{formatRupee(stats.collected)}</div></div>
              <div style={{ width: 1, height: 24, background: 'var(--line)', flexShrink: 0 }} />
              <div style={{ minWidth: 80 }}><div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, fontWeight: 600, letterSpacing: '.10em', textTransform: 'uppercase', color: 'var(--tx-3)', marginBottom: 2 }}>Paid{stats.paidCount > 0 && <span style={{ color: 'var(--tx-3)', fontWeight: 500, letterSpacing: 0, textTransform: 'none', marginLeft: 6 }}>· {stats.methodCounts.cash || 0} cash · {stats.methodCounts.card || 0} card · {stats.methodCounts.online || 0} UPI</span>}</div><div style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: 18, color: 'var(--success)', lineHeight: 1 }}>{stats.paidCount}</div></div>
              <div style={{ width: 1, height: 24, background: 'var(--line)', flexShrink: 0 }} />
              <div style={{ minWidth: 100 }}><div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, fontWeight: 600, letterSpacing: '.10em', textTransform: 'uppercase', color: 'var(--tx-3)', marginBottom: 2 }}>Avg collection</div><div style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: 18, color: 'var(--tx)', lineHeight: 1 }}>{stats.avgSec != null ? formatElapsed(stats.avgSec) : '—'}</div></div>
            </div>
          </div>
        </div>

        {/* Filter bar */}
        <div className="no-print" style={{ background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 14, padding: '12px 18px', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
          <div style={{ display: 'inline-flex', background: 'var(--card-2)', borderRadius: 10, padding: 3 }}>
            {[['pending', 'Pending', stats.pending], ['completed', 'Completed', stats.paidCount], ['all', 'All', null]].map(([val, label, count]) => {
              const active = filter === val;
              return (<button key={val} onClick={() => setFilter(val)} style={{ padding: '7px 14px', borderRadius: 7, border: 'none', cursor: 'pointer', fontFamily: 'var(--font-display)', fontSize: 12, fontWeight: active ? 700 : 600, background: active ? 'var(--accent)' : 'transparent', color: active ? 'var(--accent-ink)' : 'var(--tx-2)', display: 'inline-flex', alignItems: 'center', gap: 6 }}>{label}{count != null && count > 0 && <span style={{ padding: '1px 6px', borderRadius: 8, background: active ? 'rgba(26,24,21,0.18)' : 'rgba(196,168,109,0.20)', color: active ? 'var(--accent-ink)' : 'var(--gold)', fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 700 }}>{count}</span>}</button>);
            })}
          </div>
          <span style={{ width: 1, height: 22, background: 'var(--line)' }} />
          <div style={{ display: 'inline-flex', gap: 4, position: 'relative', alignItems: 'center' }}>
            {[['today', 'Today'], ['week', 'Week'], ['month', 'Month'], ['all', 'All']].map(([val, label]) => {
              const active = !customRange.active && period === val;
              return (<button key={val} onClick={() => { setCustomRange({ active: false, start: '', end: '' }); setPeriod(val); }} style={{ padding: '6px 12px', fontFamily: 'var(--font-display)', fontSize: 12, fontWeight: active ? 700 : 500, background: active ? 'var(--accent)' : 'transparent', color: active ? 'var(--accent-ink)' : 'var(--tx-2)', border: 'none', borderRadius: 7, cursor: 'pointer' }}>{label}</button>);
            })}
            <DateRangePicker value={customRange} onChange={setCustomRange} maxDate={todayKey()} theme={DT} pillClassName="pay-period-pill" />
          </div>
          <span style={{ width: 1, height: 22, background: 'var(--line)' }} />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search order #, table, amount…" style={{ flex: 1, minWidth: 220, padding: '8px 12px', borderRadius: 8, border: '1px solid var(--line)', background: 'var(--card-2)', fontSize: 13, fontFamily: 'var(--font-body)', color: 'var(--tx)', outline: 'none' }} />
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--tx-3)' }}>{displayed.length} order{displayed.length === 1 ? '' : 's'}</span>
        </div>

        {/* Unmatched payments */}
        {unmatched.length > 0 && (
          <div style={{ background: 'rgba(196,168,109,0.08)', border: '1.5px solid rgba(196,168,109,0.40)', borderRadius: 14, padding: 18, marginBottom: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: 14, fontWeight: 700, color: 'var(--gold)' }}>{unmatched.length} payment{unmatched.length === 1 ? '' : 's'} need{unmatched.length === 1 ? 's' : ''} matching</div>
            </div>
            <div style={{ fontFamily: 'var(--font-body)', fontSize: 13, color: 'var(--tx-2)', lineHeight: 1.5, marginBottom: 14 }}>These UPI payments arrived but couldn't be auto-matched to a single order. Pick the right order for each one to confirm it.</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {unmatched.map(u => {
                const MATCHABLE = new Set(['unpaid', 'pending', 'online_requested']);
                const cutoff = Date.now() - 30 * 60 * 1000;
                const candidates = allOrders.filter(o => { if (Number(o.total) !== Number(u.amount)) return false; if (!MATCHABLE.has(o.paymentStatus)) return false; const t = o.createdAt?.toDate?.()?.getTime?.() || 0; return t >= cutoff; });
                return (
                  <div key={u.id} style={{ background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 10, padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                    <div style={{ flex: '1 1 200px', minWidth: 200 }}>
                      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 17, fontWeight: 800, color: 'var(--tx)' }}>₹{Number(u.amount).toFixed(2)}</div>
                      <div style={{ fontFamily: 'var(--font-body)', fontSize: 11, color: 'var(--tx-3)', marginTop: 2 }}>{u.payerVpa || '—'} · {u.provider || '?'} · {u.reason === 'multiple_match' ? 'multiple candidates' : 'no candidates'}</div>
                    </div>
                    {candidates.length === 0 ? <div style={{ fontFamily: 'var(--font-body)', fontSize: 12, color: 'var(--tx-3)', fontStyle: 'italic' }}>No matching orders in last 30 min</div> : (
                      <select defaultValue="" onChange={e => { if (e.target.value) assignUnmatched(u.id, e.target.value); e.target.value = ''; }} disabled={unmatchedAssigning === u.id} style={{ padding: '8px 10px', borderRadius: 7, border: '1px solid var(--line)', background: 'var(--card-2)', fontSize: 13, fontFamily: 'var(--font-body)', color: 'var(--tx)', cursor: 'pointer' }}>
                        <option value="" disabled>{unmatchedAssigning === u.id ? 'Assigning…' : `Assign to order (${candidates.length})…`}</option>
                        {candidates.map(o => <option key={o.id} value={o.id}>#{(o.orderId || o.id).slice(-6).toUpperCase()}{o.tableNumber ? ` · Table ${o.tableNumber}` : ' · Takeaway'}{' · ₹'}{Number(o.total).toFixed(2)}</option>)}
                      </select>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Orders list */}
        {!loaded ? (
          <div style={{ background: 'var(--card)', borderRadius: 14, border: '1px solid var(--line)', padding: '64px 32px', textAlign: 'center' }}>
            <div style={{ display: 'inline-block', width: 24, height: 24, border: '2px solid var(--card-3)', borderTopColor: 'var(--gold)', borderRadius: '50%', animation: 'spin 0.8s linear infinite', marginBottom: 16 }} />
            <div style={{ fontFamily: 'var(--font-body)', fontSize: 13, color: 'var(--tx-3)' }}>Loading payments…</div>
          </div>
        ) : grouped.length === 0 ? (
          <div style={{ background: 'var(--card)', borderRadius: 14, border: '1px solid var(--line)', padding: '64px 32px', textAlign: 'center' }}>
            <div style={{ fontSize: 30, marginBottom: 12 }}>💳</div>
            <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 16, color: 'var(--tx)', marginBottom: 8 }}>{filter === 'pending' ? 'No pending payments' : filter === 'completed' ? 'No completed payments' : 'No payments yet'}</div>
            <div style={{ fontFamily: 'var(--font-body)', fontSize: 13, color: 'var(--tx-3)', lineHeight: 1.6, maxWidth: 360, margin: '0 auto' }}>{filter === 'pending' ? 'Payment requests from customers will appear here.' : 'Payments will show up once orders are served and settled.'}</div>
          </div>
        ) : (
          grouped.map(group => (
            <div key={group.key} style={{ marginBottom: 28 }}>
              <div style={{ display: 'inline-block', padding: '5px 14px', borderRadius: 14, background: 'var(--accent)', color: 'var(--accent-ink)', fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', marginBottom: 14 }}>
                {group.date.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })}<span style={{ opacity: 0.6, marginLeft: 10, fontWeight: 500 }}>{group.orders.length} order{group.orders.length === 1 ? '' : 's'}</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {group.orders.map(order => {
                  const meta = PAYMENT_STATUS[order.paymentStatus] || PAYMENT_STATUS.unpaid;
                  const paid = isPaid(order); const requested = isRequested(order);
                  const total = order.total || (order.items || []).reduce((s, i) => s + ((i.price || 0) * (i.qty || 1)), 0);
                  const expanded = expandedId === order.id;
                  const collectionTime = (paid && order.createdAt?.seconds && order.paymentUpdatedAt?.seconds) ? order.paymentUpdatedAt.seconds - order.createdAt.seconds : null;
                  return (
                    <div key={order.id} onClick={(e) => { if (e.target.closest('button') || e.target.closest('input')) return; setExpandedId(expanded ? null : order.id); }} style={{ background: 'var(--card)', borderRadius: 14, border: '1px solid var(--line)', borderLeft: paid ? '4px solid var(--success)' : requested ? '4px solid var(--gold)' : '4px solid var(--line-strong, rgba(255,255,255,0.18))', padding: '16px 22px', cursor: 'pointer', opacity: paid ? 0.85 : 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', minWidth: 0 }}>
                          <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: 17, color: 'var(--tx)' }}>{orderLabel(order)}</span>
                          <span style={{ color: 'var(--tx-3)', fontSize: 14 }}>·</span>
                          <span style={{ fontFamily: 'var(--font-body)', fontSize: 14, fontWeight: 600, color: 'var(--tx)' }}>{(order.orderType === 'takeaway' || order.orderType === 'takeout') ? `Takeaway${order.customerName ? ` · ${order.customerName}` : ''}` : `Table ${order.tableNumber || '—'}`}</span>
                          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 700, letterSpacing: '.08em', padding: '3px 8px', borderRadius: 4, textTransform: 'uppercase', background: meta.bg, color: meta.color }}>{meta.label}</span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--tx-3)', whiteSpace: 'nowrap' }}>{fmtTime(order.createdAt?.seconds)}</span>
                          <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: 16, color: 'var(--tx)', fontVariantNumeric: 'tabular-nums' }}>{formatRupee(total)}</span>
                        </div>
                      </div>
                      <div style={{ marginTop: 6, fontFamily: 'var(--font-body)', fontSize: 12, color: 'var(--tx-3)', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                        <span>{(order.items || []).length} item{(order.items || []).length === 1 ? '' : 's'}</span>
                        {collectionTime != null && <><span>·</span><span>Collected {formatElapsed(collectionTime)} after bill</span></>}
                        {!paid && <><span>·</span><span style={{ fontStyle: 'italic' }}>Click to {expanded ? 'collapse' : 'view items'}</span></>}
                      </div>
                      {expanded && (order.items || []).length > 0 && (
                        <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px dashed var(--line)' }}>
                          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 700, letterSpacing: '.10em', textTransform: 'uppercase', color: 'var(--tx-3)', marginBottom: 8 }}>Bill breakdown</div>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                            {(order.items || []).map((item, i) => (
                              <div key={i} style={{ display: 'grid', gridTemplateColumns: '36px 1fr auto', gap: 14, alignItems: 'center' }}>
                                <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: 13, color: 'var(--gold)' }}>{item.qty || 1}×</span>
                                <span style={{ fontFamily: 'var(--font-body)', fontSize: 13, fontWeight: 500, color: 'var(--tx)' }}>{item.name}</span>
                                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 600, color: 'var(--tx-2)', fontVariantNumeric: 'tabular-nums' }}>{formatRupee((item.price || 0) * (item.qty || 1))}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                      {!paid && (
                        <div className="no-print" style={{ marginTop: 14, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                          {requested ? (
                            <>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                <span style={{ fontFamily: 'var(--font-body)', fontSize: 11, fontWeight: 600, color: 'var(--tx-3)' }}>Customer selected:</span>
                                <span style={{ padding: '6px 14px', borderRadius: 8, background: 'rgba(196,168,109,0.14)', border: '1px solid rgba(196,168,109,0.35)', color: 'var(--gold)', fontFamily: 'var(--font-display)', fontSize: 12, fontWeight: 700 }}>{meta.methodKey === 'cash' ? 'Cash' : meta.methodKey === 'card' ? 'Card' : 'UPI'}</span>
                              </div>
                              <div style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
                                <button disabled={updating === order.id} onClick={() => cancelFromPayments(order)} style={{ padding: '8px 14px', borderRadius: 8, background: 'transparent', color: 'var(--danger)', border: '1.5px solid rgba(217,83,79,0.30)', fontFamily: 'var(--font-display)', fontSize: 12, fontWeight: 600, cursor: 'pointer', opacity: updating === order.id ? 0.6 : 1 }}>Cancel</button>
                                <button disabled={updating === order.id} onClick={() => markPaid(order, meta.methodKey)} style={{ padding: '9px 20px', borderRadius: 8, border: 'none', background: 'var(--success)', color: '#fff', fontFamily: 'var(--font-display)', fontSize: 13, fontWeight: 700, cursor: 'pointer', opacity: updating === order.id ? 0.6 : 1, minWidth: 130, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>{updating === order.id ? <span style={{ display: 'inline-block', width: 13, height: 13, border: '2px solid rgba(255,255,255,0.4)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} /> : 'Mark as Paid'}</button>
                              </div>
                            </>
                          ) : (() => {
                            const effectiveMethod = selectedMethods[order.id] || 'cash';
                            return (
                              <>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                                  <span style={{ fontFamily: 'var(--font-body)', fontSize: 11, fontWeight: 600, color: 'var(--tx-3)' }}>Mark as paid by:</span>
                                  {[{ key: 'cash', label: 'Cash' }, { key: 'card', label: 'Card' }, { key: 'online', label: 'UPI' }].map(m => {
                                    const selected = effectiveMethod === m.key;
                                    return (<button key={m.key} disabled={updating === order.id} onClick={() => setSelectedMethods(prev => ({ ...prev, [order.id]: m.key }))} style={{ padding: '7px 16px', borderRadius: 8, background: selected ? 'rgba(196,168,109,0.16)' : 'var(--card-2)', border: selected ? '1.5px solid var(--gold)' : '1.5px solid transparent', color: selected ? 'var(--gold)' : 'var(--tx)', fontFamily: 'var(--font-display)', fontSize: 12, fontWeight: selected ? 700 : 600, cursor: 'pointer' }}>{m.label}</button>);
                                  })}
                                </div>
                                <div style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
                                  <button disabled={updating === order.id} onClick={() => cancelFromPayments(order)} style={{ padding: '8px 14px', borderRadius: 8, background: 'transparent', color: 'var(--danger)', border: '1.5px solid rgba(217,83,79,0.30)', fontFamily: 'var(--font-display)', fontSize: 12, fontWeight: 600, cursor: 'pointer', opacity: updating === order.id ? 0.6 : 1 }}>Cancel</button>
                                  <button disabled={updating === order.id} onClick={() => markPaid(order, effectiveMethod)} style={{ padding: '9px 20px', borderRadius: 8, border: 'none', background: 'var(--success)', color: '#fff', fontFamily: 'var(--font-display)', fontSize: 13, fontWeight: 700, cursor: 'pointer', opacity: updating === order.id ? 0.6 : 1, minWidth: 130, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>{updating === order.id ? <span style={{ display: 'inline-block', width: 13, height: 13, border: '2px solid rgba(255,255,255,0.4)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} /> : 'Mark as Paid'}</button>
                                </div>
                              </>
                            );
                          })()}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))
        )}

        {/* Undo banner */}
        {undoBanner && (
          <div className="no-print" style={{ position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)', zIndex: 130, background: 'var(--surface)', color: 'var(--tx)', border: '1px solid var(--line)', borderRadius: 12, padding: '12px 18px', boxShadow: '0 12px 40px rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', gap: 14, fontFamily: 'var(--font-body)', fontSize: 13, fontWeight: 500, maxWidth: 'calc(100vw - 32px)', animation: 'slideUp 0.25s ease both' }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--success)', flexShrink: 0 }} />
            <span style={{ flex: 1, minWidth: 0 }}>Payment marked. Undo within 60 seconds if incorrect.</span>
            <button onClick={undoPayment} style={{ padding: '6px 14px', borderRadius: 6, border: 'none', background: 'var(--gold)', color: '#1a1814', fontFamily: 'var(--font-display)', fontSize: 12, fontWeight: 700, cursor: 'pointer', flexShrink: 0 }}>Undo</button>
            <button onClick={() => { if (undoBanner.timeoutId) clearTimeout(undoBanner.timeoutId); setUndoBanner(null); }} style={{ padding: '4px 8px', borderRadius: 6, border: 'none', background: 'transparent', color: 'var(--tx-3)', fontSize: 16, cursor: 'pointer', lineHeight: 1, flexShrink: 0 }}>×</button>
          </div>
        )}

        {/* Cash modal */}
        {cashModal && (() => {
          const order = cashModal.order;
          const total = Math.round(Number(order?.total) || 0);
          const received = Math.round(Number(cashReceived) || 0);
          const change = Math.max(0, received - total);
          const ok = received >= total;
          return (
            <div className="no-print" onClick={() => { setCashModal(null); setCashReceived(''); }} style={{ position: 'fixed', inset: 0, zIndex: 130, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
              <div onClick={e => e.stopPropagation()} style={{ background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 16, padding: '24px 24px 20px', width: '100%', maxWidth: 380, boxShadow: '0 20px 60px rgba(0,0,0,0.5)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, fontWeight: 700, letterSpacing: '.10em', padding: '2px 7px', borderRadius: 4, textTransform: 'uppercase', background: 'rgba(196,168,109,0.14)', color: 'var(--gold)' }}>PAY · CASH</span>
                  <span style={{ fontFamily: 'var(--font-body)', fontSize: 12, color: 'var(--tx-3)' }}>{orderLabel(order)} · Table {order.tableNumber || '—'}</span>
                </div>
                <div style={{ fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 700, color: 'var(--tx)', marginBottom: 18 }}>Cash payment</div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 14, padding: '10px 14px', background: 'var(--card-2)', borderRadius: 10 }}>
                  <span style={{ fontFamily: 'var(--font-body)', fontSize: 12, color: 'var(--tx-3)' }}>Order total</span>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 18, fontWeight: 700, color: 'var(--tx)' }}>₹{total.toLocaleString('en-IN')}</span>
                </div>
                <label style={{ display: 'block', fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--tx-3)', fontWeight: 600, letterSpacing: '.04em', textTransform: 'uppercase', marginBottom: 6 }}>Cash received</label>
                <div style={{ position: 'relative', marginBottom: 12 }}>
                  <span style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', fontSize: 16, color: 'var(--tx-3)', fontWeight: 600 }}>₹</span>
                  <input type="number" inputMode="numeric" min={total} value={cashReceived} onChange={e => setCashReceived(e.target.value)} autoFocus style={{ width: '100%', padding: '12px 14px 12px 28px', borderRadius: 10, border: '1px solid var(--line)', background: 'var(--card-2)', fontSize: 18, fontWeight: 700, fontFamily: 'var(--font-mono)', color: 'var(--tx)', outline: 'none' }} />
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 18, padding: '10px 14px', background: change > 0 ? 'rgba(63,170,99,0.10)' : 'var(--card-2)', borderRadius: 10 }}>
                  <span style={{ fontFamily: 'var(--font-body)', fontSize: 12, color: 'var(--tx-3)' }}>Change to give</span>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 18, fontWeight: 700, color: change > 0 ? 'var(--success)' : 'var(--tx-3)' }}>₹{change.toLocaleString('en-IN')}</span>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button onClick={() => { setCashModal(null); setCashReceived(''); }} disabled={updating === order.id} style={{ flex: 1, padding: '12px 16px', borderRadius: 10, border: '1px solid var(--line)', background: 'var(--card)', color: 'var(--tx-2)', fontFamily: 'var(--font-display)', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Cancel</button>
                  <button onClick={confirmCashPayment} disabled={!ok || updating === order.id} style={{ flex: 2, padding: '12px 16px', borderRadius: 10, border: 'none', background: ok ? 'var(--accent)' : 'rgba(196,168,109,0.35)', color: 'var(--accent-ink)', fontFamily: 'var(--font-display)', fontSize: 13, fontWeight: 700, cursor: ok ? 'pointer' : 'not-allowed', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>{updating === order.id ? <span style={{ display: 'inline-block', width: 14, height: 14, border: '2px solid rgba(0,0,0,0.4)', borderTopColor: 'var(--accent-ink)', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} /> : `Confirm Payment${change > 0 ? ` (₹${change} change)` : ''}`}</button>
                </div>
              </div>
            </div>
          );
        })()}
      </OkShell>
      <ConfirmModal open={!!confirmDialog} {...(confirmDialog || {})} onCancel={() => setConfirmDialog(null)} />
    </>
  );
}

PaymentsV2.getLayout = (page) => page;
