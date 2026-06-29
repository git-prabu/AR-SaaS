// pages/admin/reservations-v2.js
//
// ★ REDESIGN EXEMPLAR ★ — duplicate of /admin/reservations on the dark
// "ok-root" theme (via <OkShell>). Logic copied verbatim from
// reservations.js — only the render is new. Original untouched.
import Head from 'next/head';
import { useEffect, useState, useMemo } from 'react';
import { useAuth } from '../../hooks/useAuth';
import OkShell from '../../components/admin/OkShell';
import { useFeatureAccess } from '../../hooks/useFeatureAccess';
import ConfirmModal from '../../components/ConfirmModal';
import { collection, onSnapshot, query, orderBy } from 'firebase/firestore';
import { updateReservation, deleteReservation } from '../../lib/db';
import toast from 'react-hot-toast';

const STATUS_META = {
  requested: { label: 'Requested', color: 'var(--gold)' },
  confirmed: { label: 'Confirmed', color: 'var(--st-paid)' },
  seated:    { label: 'Seated',    color: 'var(--success)' },
  cancelled: { label: 'Cancelled', color: 'var(--danger)' },
};

function fmtDate(key) {
  if (!key) return '';
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });
}

export default function ReservationsV2() {
  const { userData } = useAuth();
  const { ready, isAdmin, rid, scopedDb, canView } = useFeatureAccess('reservations');
  const restaurantName = userData?.restaurantName || 'Your Restaurant';

  const [reservations, setReservations] = useState([]);
  const [dataLoaded, setDataLoaded] = useState(false);
  const [filter, setFilter] = useState('upcoming');
  const [confirm, setConfirm] = useState(null);
  const [busyId, setBusyId] = useState(null);

  useEffect(() => {
    if (!rid || !canView) return;
    const un = onSnapshot(
      query(collection(scopedDb, 'restaurants', rid, 'reservations'), orderBy('date', 'asc')),
      snap => { setReservations(snap.docs.map(d => ({ id: d.id, ...d.data() }))); setDataLoaded(true); },
      () => setDataLoaded(true)
    );
    return un;
  }, [rid]); // eslint-disable-line react-hooks/exhaustive-deps

  const todayKey = new Date(Date.now() + 5.5 * 3600 * 1000).toISOString().slice(0, 10);

  const visible = useMemo(() => {
    let list = reservations;
    if (filter === 'upcoming') list = list.filter(r => r.date >= todayKey && r.status !== 'cancelled');
    else if (filter === 'requested') list = list.filter(r => r.status === 'requested');
    return [...list].sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
  }, [reservations, filter, todayKey]);

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
    return (
      <div className="ok-root" style={{ minHeight: '100vh', display: 'grid', placeItems: 'center' }}>
        <Head><title>Reservations — HaloHelm</title></Head>
        <div style={{ color: 'var(--tx-3)', fontFamily: 'var(--font-body)', fontSize: 14 }}>Loading…</div>
      </div>
    );
  }
  if (!canView) {
    return (
      <div className="ok-root" style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 24 }}>
        <Head><title>Reservations — HaloHelm</title></Head>
        <div style={{ textAlign: 'center', maxWidth: 360 }}>
          <div style={{ fontSize: 44, marginBottom: 12 }}>🔒</div>
          <div style={{ color: 'var(--tx)', fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 18, marginBottom: 6 }}>No access</div>
          <div style={{ color: 'var(--tx-3)', fontFamily: 'var(--font-body)', fontSize: 13.5, lineHeight: 1.6 }}>Your role doesn’t include Reservations. Ask the owner to grant it.</div>
        </div>
      </div>
    );
  }

  const headRight = requestedCount > 0 ? (
    <span style={{ padding: '6px 12px', borderRadius: 'var(--r-pill)', background: 'rgba(196,168,109,0.16)', color: 'var(--gold)', fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 13 }}>
      {requestedCount} new request{requestedCount === 1 ? '' : 's'}
    </span>
  ) : null;

  return (
    <>
      <Head><title>Reservations — HaloHelm</title></Head>
      <OkShell active={null} eyebrow="Bookings · from your public page" title="Reservations" brand={restaurantName} headRight={headRight}>
        {/* Filter pills */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 22, flexWrap: 'wrap' }}>
          {[['upcoming', 'Upcoming'], ['requested', 'New requests'], ['all', 'All']].map(([k, label]) => {
            const sel = filter === k;
            return (
              <button key={k} onClick={() => setFilter(k)} style={{
                padding: '8px 14px', borderRadius: 10, cursor: 'pointer', fontFamily: 'var(--font-display)', fontSize: 13, fontWeight: 700,
                border: sel ? 'none' : '1px solid var(--line)', background: sel ? 'var(--accent)' : 'var(--card)', color: sel ? 'var(--accent-ink)' : 'var(--tx-2)',
              }}>{label}</button>
            );
          })}
        </div>

        {dataLoaded && visible.length === 0 && (
          <div style={{ textAlign: 'center', padding: '56px 20px', background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 16 }}>
            <div style={{ fontSize: 34, marginBottom: 12 }}>📅</div>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 16, fontWeight: 700, color: 'var(--tx)', marginBottom: 6 }}>No reservations</div>
            <div style={{ fontFamily: 'var(--font-body)', fontSize: 13, color: 'var(--tx-3)', maxWidth: 380, margin: '0 auto', lineHeight: 1.6 }}>Bookings from your /book page show up here. Share the link with customers.</div>
          </div>
        )}

        {Object.keys(byDate).map(date => (
          <div key={date} style={{ marginBottom: 24 }}>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 13, fontWeight: 700, color: date === todayKey ? 'var(--gold)' : 'var(--tx)', marginBottom: 10 }}>
              {date === todayKey ? 'Today · ' : ''}{fmtDate(date)}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {byDate[date].map(r => {
                const sm = STATUS_META[r.status] || STATUS_META.requested;
                const busy = busyId === r.id;
                return (
                  <div key={r.id} style={{ background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 14, padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
                    <div style={{ minWidth: 60, textAlign: 'center' }}>
                      <div style={{ fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 700, color: 'var(--tx)' }}>{r.time}</div>
                      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10.5, color: 'var(--tx-3)', fontWeight: 600 }}>{r.partySize} guest{r.partySize === 1 ? '' : 's'}</div>
                    </div>
                    <div style={{ flex: 1, minWidth: 160 }}>
                      <div style={{ fontFamily: 'var(--font-display)', fontSize: 15, fontWeight: 700, color: 'var(--tx)' }}>{r.name}</div>
                      <div style={{ fontFamily: 'var(--font-body)', fontSize: 12.5, color: 'var(--tx-3)', marginTop: 2 }}>
                        <a href={`tel:${r.phone}`} style={{ color: 'var(--st-paid)', fontWeight: 600, textDecoration: 'none' }}>{r.phone}</a>
                        {r.note ? <span> · {r.note}</span> : null}
                      </div>
                    </div>
                    <span style={{ padding: '4px 10px', borderRadius: 6, background: 'var(--card-3)', color: sm.color, fontFamily: 'var(--font-mono)', fontSize: 10.5, fontWeight: 700, letterSpacing: '.04em', textTransform: 'uppercase' }}>{sm.label}</span>
                    <div style={{ display: 'flex', gap: 6 }}>
                      {r.status === 'requested' && <ActBtn onClick={() => setStatus(r, 'confirmed')} busy={busy} color="var(--st-paid)">Confirm</ActBtn>}
                      {r.status === 'confirmed' && <ActBtn onClick={() => setStatus(r, 'seated')} busy={busy} color="var(--success)">Seated</ActBtn>}
                      {r.status !== 'cancelled' && r.status !== 'seated' && <ActBtn onClick={() => setStatus(r, 'cancelled')} busy={busy} color="var(--danger)">Cancel</ActBtn>}
                      <ActBtn onClick={() => requestDelete(r)} busy={busy} color="var(--tx-3)">✕</ActBtn>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}

        <ConfirmModal open={!!confirm} title={confirm?.title} body={confirm?.body} confirmLabel={confirm?.confirmLabel} destructive={confirm?.destructive} onCancel={() => setConfirm(null)} onConfirm={async () => { await confirm.onConfirm(); setConfirm(null); }} />
      </OkShell>
    </>
  );
}

function ActBtn({ children, onClick, busy, color }) {
  return (
    <button onClick={onClick} disabled={busy} style={{
      padding: '6px 11px', borderRadius: 8, cursor: busy ? 'not-allowed' : 'pointer',
      border: '1px solid var(--line)', background: 'var(--card-2)', color,
      fontFamily: 'var(--font-display)', fontSize: 12, fontWeight: 700, opacity: busy ? 0.5 : 1,
    }}>{children}</button>
  );
}

ReservationsV2.getLayout = (page) => page;
