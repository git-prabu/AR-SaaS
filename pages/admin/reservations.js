// pages/admin/reservations.js
//
// Phase 2 #8 — admin reservation management. Lists booking requests
// (live via onSnapshot), grouped by date, with status flow:
//   requested → confirmed → seated   (or cancelled)
// Customers submit via the public /book/[subdomain] form.
import Head from 'next/head';
import { useEffect, useState, useMemo } from 'react';
import { useRouter } from 'next/router';
import { useAuth } from '../../hooks/useAuth';
import AdminLayout from '../../components/layout/AdminLayout';
import FeatureShell from '../../components/layout/FeatureShell';
import { useFeatureAccess } from '../../hooks/useFeatureAccess';
import EmptyState from '../../components/EmptyState';
import ConfirmModal from '../../components/ConfirmModal';
import { db } from '../../lib/firebase';
import { collection, onSnapshot, query, orderBy } from 'firebase/firestore';
import { updateReservation, deleteReservation } from '../../lib/db';
import toast from 'react-hot-toast';

const INTER = "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
const A = {
  font: INTER, cream: '#EDEDED', ink: '#1A1A1A', shell: '#FFFFFF', shellDarker: '#F8F8F8',
  warning: '#C4A86D', warningDim: '#A08656', success: '#3F9E5A', danger: '#D9534F',
  info: '#2D7DD2',
  mutedText: 'rgba(0,0,0,0.55)', faintText: 'rgba(0,0,0,0.38)', subtleBg: 'rgba(0,0,0,0.04)',
  border: '1px solid rgba(0,0,0,0.06)', borderStrong: '1px solid rgba(0,0,0,0.10)',
  cardShadow: '0 1px 2px rgba(0,0,0,0.04), 0 4px 12px rgba(0,0,0,0.04)',
};

const STATUS_META = {
  requested: { label: 'Requested', bg: 'rgba(196,168,109,0.14)', color: A.warningDim },
  confirmed: { label: 'Confirmed', bg: 'rgba(45,125,210,0.12)',  color: A.info },
  seated:    { label: 'Seated',    bg: 'rgba(63,158,90,0.12)',   color: A.success },
  cancelled: { label: 'Cancelled', bg: 'rgba(217,83,79,0.10)',   color: A.danger },
};

function fmtDate(key) {
  if (!key) return '';
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });
}

export default function AdminReservations() {
  const router = useRouter();
  // RBAC: owner OR a staff member whose role grants 'reservations'.
  const { ready, isAdmin, rid, scopedDb, canView } = useFeatureAccess('reservations');

  const [reservations, setReservations] = useState([]);
  const [dataLoaded, setDataLoaded] = useState(false);
  const [filter, setFilter] = useState('upcoming'); // upcoming | requested | all
  const [confirm, setConfirm] = useState(null);
  const [busyId, setBusyId] = useState(null);

  // Access + redirect handled by useFeatureAccess('reservations').

  useEffect(() => {
    if (!rid || !canView) return;
    const un = onSnapshot(
      query(collection(scopedDb, 'restaurants', rid, 'reservations'), orderBy('date', 'asc')),
      snap => { setReservations(snap.docs.map(d => ({ id: d.id, ...d.data() }))); setDataLoaded(true); },
      () => setDataLoaded(true)
    );
    return un;
  }, [rid]);

  const todayKey = new Date(Date.now() + 5.5 * 3600 * 1000).toISOString().slice(0, 10);

  const visible = useMemo(() => {
    let list = reservations;
    if (filter === 'upcoming') list = list.filter(r => r.date >= todayKey && r.status !== 'cancelled');
    else if (filter === 'requested') list = list.filter(r => r.status === 'requested');
    // sort by date then time
    return [...list].sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
  }, [reservations, filter, todayKey]);

  // group by date
  const byDate = useMemo(() => {
    const m = {};
    for (const r of visible) (m[r.date] = m[r.date] || []).push(r);
    return m;
  }, [visible]);

  const setStatus = async (r, status) => {
    setBusyId(r.id);
    try { await updateReservation(rid, r.id, { status }, { db: scopedDb }); toast.success(`Marked ${status}`); }
    catch (e) { toast.error('Update failed: ' + (e?.message || 'error')); }
    finally { setBusyId(null); }
  };

  const requestDelete = (r) => setConfirm({
    title: `Delete ${r.name}'s booking?`,
    body: 'This removes the reservation permanently.',
    confirmLabel: 'Delete', destructive: true,
    onConfirm: async () => { await deleteReservation(rid, r.id, { db: scopedDb }); toast.success('Deleted'); },
  });

  const requestedCount = reservations.filter(r => r.status === 'requested').length;

  if (!ready) {
    return <FeatureShell isAdmin={isAdmin} active="/admin/reservations"><div style={{ padding: 40, fontFamily: A.font, color: A.mutedText }}>Loading…</div></FeatureShell>;
  }

  return (
    <>
      <Head><title>Reservations — HaloHelm</title></Head>
      <FeatureShell isAdmin={isAdmin} active="/admin/reservations">
        <div style={{ padding: '28px 26px', maxWidth: 920, margin: '0 auto', fontFamily: A.font, color: A.ink }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', marginBottom: 18 }}>
            <div>
              <h1 style={{ fontSize: 26, fontWeight: 800, letterSpacing: '-0.5px', margin: 0 }}>Reservations</h1>
              <p style={{ fontSize: 13.5, color: A.mutedText, margin: '6px 0 0', lineHeight: 1.5 }}>
                Bookings from your public page · share <code style={{ background: A.subtleBg, padding: '1px 6px', borderRadius: 4, fontSize: 12 }}>halohelm.com/book/{rid ? '{your-subdomain}' : '…'}</code>
              </p>
            </div>
            {requestedCount > 0 && (
              <span style={{ padding: '6px 12px', borderRadius: 8, background: 'rgba(196,168,109,0.16)', color: A.warningDim, fontWeight: 700, fontSize: 13 }}>
                {requestedCount} new request{requestedCount === 1 ? '' : 's'}
              </span>
            )}
          </div>

          {/* Filter pills */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 22 }}>
            {[['upcoming', 'Upcoming'], ['requested', 'New requests'], ['all', 'All']].map(([k, label]) => (
              <button key={k} onClick={() => setFilter(k)}
                style={{
                  padding: '8px 14px', borderRadius: 8, cursor: 'pointer', fontFamily: A.font, fontSize: 13, fontWeight: 600,
                  border: filter === k ? 'none' : A.borderStrong,
                  background: filter === k ? A.ink : A.shell, color: filter === k ? A.cream : A.mutedText,
                }}>{label}</button>
            ))}
          </div>

          {dataLoaded && visible.length === 0 && (
            <EmptyState title="No reservations" subtitle="Bookings from your /book page show up here. Share the link with customers." />
          )}

          {Object.keys(byDate).map(date => (
            <div key={date} style={{ marginBottom: 24 }}>
              <div style={{ fontSize: 13, fontWeight: 800, color: date === todayKey ? A.warningDim : A.ink, marginBottom: 10, letterSpacing: '-0.1px' }}>
                {date === todayKey ? 'Today · ' : ''}{fmtDate(date)}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {byDate[date].map(r => {
                  const sm = STATUS_META[r.status] || STATUS_META.requested;
                  const busy = busyId === r.id;
                  return (
                    <div key={r.id} style={{ background: A.shell, border: A.border, borderRadius: 12, padding: '14px 16px', boxShadow: A.cardShadow, display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
                      <div style={{ minWidth: 60, textAlign: 'center' }}>
                        <div style={{ fontSize: 18, fontWeight: 800, color: A.ink }}>{r.time}</div>
                        <div style={{ fontSize: 11, color: A.faintText, fontWeight: 600 }}>{r.partySize} guest{r.partySize === 1 ? '' : 's'}</div>
                      </div>
                      <div style={{ flex: 1, minWidth: 160 }}>
                        <div style={{ fontSize: 15, fontWeight: 700 }}>{r.name}</div>
                        <div style={{ fontSize: 12.5, color: A.mutedText, marginTop: 2 }}>
                          <a href={`tel:${r.phone}`} style={{ color: A.info, fontWeight: 600, textDecoration: 'none' }}>{r.phone}</a>
                          {r.note ? <span> · {r.note}</span> : null}
                        </div>
                      </div>
                      <span style={{ padding: '4px 10px', borderRadius: 6, background: sm.bg, color: sm.color, fontSize: 11, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase' }}>{sm.label}</span>
                      <div style={{ display: 'flex', gap: 6 }}>
                        {r.status === 'requested' && <ActBtn onClick={() => setStatus(r, 'confirmed')} busy={busy} color={A.info}>Confirm</ActBtn>}
                        {r.status === 'confirmed' && <ActBtn onClick={() => setStatus(r, 'seated')} busy={busy} color={A.success}>Seated</ActBtn>}
                        {r.status !== 'cancelled' && r.status !== 'seated' && <ActBtn onClick={() => setStatus(r, 'cancelled')} busy={busy} color={A.danger}>Cancel</ActBtn>}
                        <ActBtn onClick={() => requestDelete(r)} busy={busy} color={A.faintText}>✕</ActBtn>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </FeatureShell>

      <ConfirmModal
        open={!!confirm} title={confirm?.title} body={confirm?.body}
        confirmLabel={confirm?.confirmLabel} destructive={confirm?.destructive}
        onCancel={() => setConfirm(null)}
        onConfirm={async () => { await confirm.onConfirm(); setConfirm(null); }}
      />
    </>
  );
}

function ActBtn({ children, onClick, busy, color }) {
  return (
    <button onClick={onClick} disabled={busy}
      style={{
        padding: '6px 11px', borderRadius: 7, cursor: busy ? 'not-allowed' : 'pointer',
        border: '1px solid rgba(0,0,0,0.10)', background: '#FFFFFF', color,
        fontSize: 12, fontWeight: 700, fontFamily: INTER, opacity: busy ? 0.5 : 1,
      }}>{children}</button>
  );
}
