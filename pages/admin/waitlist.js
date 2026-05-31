// pages/admin/waitlist.js
//
// Phase 7 — Waitlist / host stand. The walk-in queue for when the floor
// is full: add a party (name, size, phone), watch their wait tick live,
// notify them on WhatsApp when a table opens, then seat them (optionally
// onto a specific table). Distinct from Reservations (future bookings) —
// this is right-now walk-ins. Admin-only PII (see firestore.rules).
import Head from 'next/head';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/router';
import { useAuth } from '../../hooks/useAuth';
import AdminLayout from '../../components/layout/AdminLayout';
import FeatureShell from '../../components/layout/FeatureShell';
import { useFeatureAccess } from '../../hooks/useFeatureAccess';
import EmptyState from '../../components/EmptyState';
import ConfirmModal from '../../components/ConfirmModal';
import { db } from '../../lib/firebase';
import { collection, onSnapshot, query, orderBy } from 'firebase/firestore';
import {
  createWaitlistEntry, setWaitlistStatus, deleteWaitlistEntry, getTables, markTableSeated,
} from '../../lib/db';
import toast from 'react-hot-toast';

const INTER = "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
const A = {
  font: INTER, cream: '#EDEDED', ink: '#1A1A1A', shell: '#FFFFFF', shellDarker: '#F8F8F8',
  warning: '#C4A86D', warningDim: '#A08656', success: '#3F9E5A', danger: '#D9534F', info: '#2D7DD2',
  whatsapp: '#25D366',
  mutedText: 'rgba(0,0,0,0.55)', faintText: 'rgba(0,0,0,0.38)', subtleBg: 'rgba(0,0,0,0.04)',
  border: '1px solid rgba(0,0,0,0.06)', borderStrong: '1px solid rgba(0,0,0,0.10)',
  cardShadow: '0 1px 2px rgba(0,0,0,0.04), 0 4px 12px rgba(0,0,0,0.04)',
};

const QUOTE_CHIPS = [['', 'No estimate'], [15, '15m'], [30, '30m'], [45, '45m'], [60, '1h']];

const inputStyle = {
  width: '100%', padding: '11px 13px', boxSizing: 'border-box',
  background: A.shell, border: '1px solid rgba(0,0,0,0.12)', borderRadius: 9,
  fontSize: 14, color: A.ink, fontFamily: A.font, outline: 'none',
};
const labelStyle = { display: 'block', fontSize: 11.5, fontWeight: 700, color: A.faintText, letterSpacing: '0.04em', textTransform: 'uppercase', marginBottom: 6 };

function fmtMins(mins) {
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60), m = mins % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}
function tsMs(ts) { return ts?.seconds ? ts.seconds * 1000 : (ts?.toMillis ? ts.toMillis() : 0); }
function isTodayTs(ts) {
  const ms = tsMs(ts);
  if (!ms) return false;
  const d = new Date(ms), n = new Date();
  return d.getFullYear() === n.getFullYear() && d.getMonth() === n.getMonth() && d.getDate() === n.getDate();
}
function fmtClock(ts) {
  const ms = tsMs(ts);
  if (!ms) return '';
  return new Date(ms).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true });
}

const emptyForm = () => ({ name: '', partySize: '2', phone: '', quotedMinutes: '', note: '' });

const STATUS_META = {
  waiting:   { label: 'Waiting',  bg: 'rgba(196,168,109,0.16)', color: A.warningDim },
  notified:  { label: 'Notified', bg: 'rgba(45,125,210,0.12)',  color: A.info },
  seated:    { label: 'Seated',   bg: 'rgba(63,158,90,0.12)',   color: A.success },
  cancelled: { label: 'Removed',  bg: 'rgba(0,0,0,0.06)',       color: A.faintText },
  noshow:    { label: 'No-show',  bg: 'rgba(217,83,79,0.10)',   color: A.danger },
};

export default function AdminWaitlist() {
  const { userData } = useAuth();
  const router = useRouter();
  // RBAC: owner OR a staff member whose role grants 'waitlist'.
  const { ready, isAdmin, rid, scopedDb, canView, staffSession, planAllowsFeature } = useFeatureAccess('waitlist');
  const restaurantName = userData?.restaurantName || staffSession?.restaurantName || 'our restaurant';

  const [entries, setEntries] = useState([]);
  const [tables, setTables] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [now, setNow] = useState(Date.now());
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState(null);
  const [seatTarget, setSeatTarget] = useState(null);  // entry being seated
  const [seatTable, setSeatTable] = useState('');
  const [confirm, setConfirm] = useState(null);
  const [showDone, setShowDone] = useState(false);

  // Access + redirect handled by useFeatureAccess('waitlist').

  useEffect(() => {
    if (!rid || !canView) return;
    const un = onSnapshot(
      query(collection(scopedDb, 'restaurants', rid, 'waitlist'), orderBy('createdAt', 'asc')),
      snap => { setEntries(snap.docs.map(d => ({ id: d.id, ...d.data() }))); setLoaded(true); },
      () => setLoaded(true)
    );
    return un;
  }, [rid]);

  useEffect(() => {
    if (!rid || !canView) return;
    getTables(rid, { db: scopedDb }).then(setTables).catch(() => {});
  }, [rid]);

  // Tick every 30s so the live wait timers stay current without a write.
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(t);
  }, []);

  const active = useMemo(
    () => entries.filter(e => e.status === 'waiting' || e.status === 'notified'),
    [entries]
  );
  const doneToday = useMemo(
    () => entries
      .filter(e => ['seated', 'cancelled', 'noshow'].includes(e.status) && isTodayTs(e.seatedAt || e.notifiedAt || e.createdAt))
      .sort((a, b) => tsMs(b.seatedAt || b.createdAt) - tsMs(a.seatedAt || a.createdAt)),
    [entries]
  );

  const stats = useMemo(() => {
    const coversWaiting = active.reduce((s, e) => s + (Number(e.partySize) || 0), 0);
    const seatedToday = entries.filter(e => e.status === 'seated' && isTodayTs(e.seatedAt));
    const waits = seatedToday
      .map(e => (tsMs(e.seatedAt) && tsMs(e.createdAt)) ? Math.round((tsMs(e.seatedAt) - tsMs(e.createdAt)) / 60000) : null)
      .filter(v => v != null && v >= 0);
    const avg = waits.length ? Math.round(waits.reduce((s, v) => s + v, 0) / waits.length) : 0;
    return { waitingNow: active.length, coversWaiting, seatedToday: seatedToday.length, avgWait: avg };
  }, [active, entries]);

  const elapsedMins = (e) => {
    const start = tsMs(e.createdAt) || now;
    return Math.max(0, Math.round((now - start) / 60000));
  };

  const add = async (e) => {
    e?.preventDefault();
    if (!form.name.trim()) { toast.error('Enter the guest name'); return; }
    const size = Math.floor(Number(form.partySize) || 0);
    if (!size || size < 1) { toast.error('Enter party size'); return; }
    setSaving(true);
    try {
      await createWaitlistEntry(rid, {
        name: form.name, partySize: size, phone: form.phone,
        quotedMinutes: Number(form.quotedMinutes) || 0, note: form.note,
      }, { db: scopedDb });
      toast.success('Added to waitlist');
      setForm(emptyForm());
    } catch (err) {
      toast.error('Could not add: ' + (err?.message || 'error'));
    } finally { setSaving(false); }
  };

  const notify = async (entry) => {
    setBusyId(entry.id);
    try {
      await setWaitlistStatus(rid, entry.id, 'notified', { db: scopedDb });
      if (entry.phone && entry.phone.length >= 10) {
        const msg = `Hi ${entry.name || 'there'}, your table at ${restaurantName} is ready! Please come to the host stand. Thanks for waiting.`;
        const url = `https://wa.me/91${entry.phone}?text=${encodeURIComponent(msg)}`;
        if (typeof window !== 'undefined') window.open(url, '_blank', 'noopener');
        toast.success('Marked notified · WhatsApp opened');
      } else {
        toast.success('Marked notified');
      }
    } catch (err) {
      toast.error('Failed: ' + (err?.message || 'error'));
    } finally { setBusyId(null); }
  };

  const openSeat = (entry) => { setSeatTarget(entry); setSeatTable(''); };
  const confirmSeat = async () => {
    const entry = seatTarget;
    setSeatTarget(null);
    setBusyId(entry.id);
    try {
      await setWaitlistStatus(rid, entry.id, 'seated', { tableCode: seatTable || null, db: scopedDb });
      // Mark the chosen table occupied so it shows as "Seated" in the
      // Table View until an order is taken (or the table is freed).
      if (seatTable) await markTableSeated(rid, seatTable, { name: entry.name, partySize: entry.partySize }, { db: scopedDb });
      toast.success(`${entry.name || 'Party'} seated${seatTable ? ` at ${seatTable}` : ''}`);
    } catch (err) {
      toast.error('Could not seat: ' + (err?.message || 'error'));
    } finally { setBusyId(null); }
  };

  const requestRemove = (entry) => setConfirm({
    title: `Remove ${entry.name || 'this party'}?`,
    body: 'They left or no longer need a table. This takes them off the queue.',
    confirmLabel: 'Remove', destructive: true,
    onConfirm: async () => { await setWaitlistStatus(rid, entry.id, 'cancelled', { db: scopedDb }); toast.success('Removed'); },
  });

  const requestDelete = (entry) => setConfirm({
    title: 'Delete permanently?',
    body: `Remove ${entry.name || 'this entry'} from today's history. This can't be undone.`,
    confirmLabel: 'Delete', destructive: true,
    onConfirm: async () => { await deleteWaitlistEntry(rid, entry.id, { db: scopedDb }); toast.success('Deleted'); },
  });

  if (!ready) {
    return <FeatureShell ready={ready} isAdmin={isAdmin} active="/admin/waitlist" permKey="waitlist" planAllowsFeature={planAllowsFeature}><div style={{ padding: 40, fontFamily: A.font, color: A.mutedText }}>Loading…</div></FeatureShell>;
  }

  return (
    <>
      <Head><title>Waitlist — HaloHelm</title></Head>
      <FeatureShell ready={ready} isAdmin={isAdmin} active="/admin/waitlist" permKey="waitlist" planAllowsFeature={planAllowsFeature}>
        <div style={{ padding: '28px 26px', maxWidth: 920, margin: '0 auto', fontFamily: A.font, color: A.ink }}>
          <div style={{ marginBottom: 18 }}>
            <h1 style={{ fontSize: 26, fontWeight: 800, letterSpacing: '-0.5px', margin: 0 }}>Waitlist</h1>
            <p style={{ fontSize: 13.5, color: A.mutedText, margin: '6px 0 0', lineHeight: 1.5 }}>
              Hold walk-in guests when you're full. Notify them when a table opens, then seat them.
            </p>
          </div>

          {/* Add party */}
          <form onSubmit={add} style={{ background: A.shell, border: A.border, borderRadius: 14, padding: '16px 18px', boxShadow: A.cardShadow, marginBottom: 22 }}>
            <div style={{ fontSize: 13, fontWeight: 800, marginBottom: 14 }}>Add a party</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12, marginBottom: 12 }}>
              <div>
                <label style={labelStyle}>Name</label>
                <input style={inputStyle} value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Priya" />
              </div>
              <div>
                <label style={labelStyle}>Party size</label>
                <input style={inputStyle} type="number" min="1" max="99" value={form.partySize} onChange={e => setForm(f => ({ ...f, partySize: e.target.value }))} />
              </div>
              <div>
                <label style={labelStyle}>Phone (optional)</label>
                <input style={inputStyle} type="tel" value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value.replace(/\D/g, '').slice(0, 10) }))} placeholder="For WhatsApp notify" />
              </div>
            </div>
            <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'flex-end' }}>
              <div style={{ flex: '1 1 220px' }}>
                <label style={labelStyle}>Note (optional)</label>
                <input style={inputStyle} value={form.note} onChange={e => setForm(f => ({ ...f, note: e.target.value }))} placeholder="e.g. high chair, window seat" />
              </div>
              <div>
                <label style={labelStyle}>Quoted wait</label>
                <div style={{ display: 'flex', gap: 6 }}>
                  {QUOTE_CHIPS.map(([v, lbl]) => (
                    <button type="button" key={lbl} onClick={() => setForm(f => ({ ...f, quotedMinutes: v === '' ? '' : String(v) }))}
                      style={{
                        padding: '9px 12px', borderRadius: 8, cursor: 'pointer', fontFamily: INTER, fontSize: 12.5, fontWeight: 700,
                        border: String(form.quotedMinutes) === String(v) ? 'none' : '1px solid rgba(0,0,0,0.12)',
                        background: String(form.quotedMinutes) === String(v) ? A.ink : A.shell,
                        color: String(form.quotedMinutes) === String(v) ? A.cream : A.mutedText,
                      }}>{lbl}</button>
                  ))}
                </div>
              </div>
            </div>
            <div style={{ marginTop: 16 }}>
              <button type="submit" disabled={saving} style={{ ...primaryBtn, opacity: saving ? 0.6 : 1 }}>
                {saving ? 'Adding…' : '+ Add to waitlist'}
              </button>
            </div>
          </form>

          {/* Stats */}
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 20 }}>
            <StatCard label="Waiting now" value={stats.waitingNow} accent={stats.waitingNow > 0 ? A.warningDim : A.ink} />
            <StatCard label="Guests waiting" value={stats.coversWaiting} />
            <StatCard label="Seated today" value={stats.seatedToday} />
            <StatCard label="Avg wait today" value={stats.avgWait ? fmtMins(stats.avgWait) : '—'} />
          </div>

          {/* Active queue */}
          {loaded && active.length === 0 && (
            <EmptyState title="No one waiting" subtitle="When you're full, add walk-in guests here so nobody gets lost. They'll show up in order with a live wait timer." />
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {active.map((e, i) => {
              const sm = STATUS_META[e.status] || STATUS_META.waiting;
              const busy = busyId === e.id;
              const mins = elapsedMins(e);
              const overQuote = e.quotedMinutes > 0 && mins > e.quotedMinutes;
              return (
                <div key={e.id} style={{ background: A.shell, border: A.border, borderRadius: 12, padding: '14px 16px', boxShadow: A.cardShadow, display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
                  <div style={{ width: 30, height: 30, borderRadius: '50%', background: A.subtleBg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 800, color: A.mutedText, flexShrink: 0 }}>{i + 1}</div>
                  <div style={{ flex: 1, minWidth: 170 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 15.5, fontWeight: 700 }}>{e.name || 'Guest'}</span>
                      <span style={{ padding: '2px 9px', borderRadius: 6, background: A.subtleBg, color: A.ink, fontSize: 12, fontWeight: 700 }}>{e.partySize} {e.partySize === 1 ? 'guest' : 'guests'}</span>
                      <span style={{ padding: '2px 9px', borderRadius: 6, background: sm.bg, color: sm.color, fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{sm.label}</span>
                    </div>
                    <div style={{ fontSize: 12.5, color: A.mutedText, marginTop: 4, display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
                      {e.phone
                        ? <>
                            <a href={`tel:${e.phone}`} style={{ color: A.info, fontWeight: 600, textDecoration: 'none' }}>{e.phone}</a>
                            <a href={`https://wa.me/91${e.phone}`} target="_blank" rel="noopener noreferrer" style={{ color: A.whatsapp, fontWeight: 700, textDecoration: 'none' }}>WhatsApp</a>
                          </>
                        : <span style={{ color: A.faintText }}>No phone</span>}
                      {e.note ? <span style={{ color: A.faintText }}>{e.note}</span> : null}
                    </div>
                  </div>

                  <div style={{ textAlign: 'right', minWidth: 70 }}>
                    <div style={{ fontSize: 16, fontWeight: 800, color: overQuote ? A.danger : A.ink }}>{fmtMins(mins)}</div>
                    <div style={{ fontSize: 10.5, color: A.faintText, fontWeight: 600 }}>
                      waiting{e.quotedMinutes > 0 ? ` · ~${e.quotedMinutes}m quoted` : ''}
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {e.status === 'waiting' && <ActBtn onClick={() => notify(e)} busy={busy} color={A.info}>Notify</ActBtn>}
                    <ActBtn onClick={() => openSeat(e)} busy={busy} color={A.success}>Seat</ActBtn>
                    <ActBtn onClick={() => requestRemove(e)} busy={busy} color={A.danger}>✕</ActBtn>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Done today */}
          {doneToday.length > 0 && (
            <div style={{ marginTop: 26 }}>
              <button onClick={() => setShowDone(s => !s)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontFamily: INTER, fontSize: 13, fontWeight: 800, color: A.ink, padding: 0, display: 'flex', alignItems: 'center', gap: 6 }}>
                Done today ({doneToday.length}) <span style={{ color: A.faintText }}>{showDone ? '▲' : '▼'}</span>
              </button>
              {showDone && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 12 }}>
                  {doneToday.map(e => {
                    const sm = STATUS_META[e.status] || STATUS_META.seated;
                    const waited = (tsMs(e.seatedAt) && tsMs(e.createdAt)) ? Math.round((tsMs(e.seatedAt) - tsMs(e.createdAt)) / 60000) : null;
                    return (
                      <div key={e.id} style={{ background: A.shellDarker, border: A.border, borderRadius: 10, padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                        <span style={{ padding: '2px 9px', borderRadius: 6, background: sm.bg, color: sm.color, fontSize: 11, fontWeight: 800, textTransform: 'uppercase' }}>{sm.label}</span>
                        <div style={{ flex: 1, minWidth: 150, fontSize: 13.5 }}>
                          <span style={{ fontWeight: 700 }}>{e.name || 'Guest'}</span>
                          <span style={{ color: A.mutedText }}> · {e.partySize} {e.partySize === 1 ? 'guest' : 'guests'}</span>
                          {e.status === 'seated' && e.tableCode ? <span style={{ color: A.mutedText }}> · {e.tableCode}</span> : null}
                        </div>
                        <span style={{ fontSize: 12, color: A.faintText }}>
                          {e.status === 'seated' && waited != null ? `waited ${fmtMins(waited)} · ` : ''}{fmtClock(e.seatedAt || e.createdAt)}
                        </span>
                        <button onClick={() => requestDelete(e)} style={{ background: 'none', border: 'none', color: A.faintText, fontSize: 15, cursor: 'pointer', lineHeight: 1 }}>✕</button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      </FeatureShell>

      {/* Seat modal */}
      {seatTarget && (
        <div onClick={() => setSeatTarget(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 70, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div onClick={ev => ev.stopPropagation()} style={{ background: A.shell, borderRadius: 16, padding: '24px', width: 'min(400px, 100%)', fontFamily: A.font, boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }}>
            <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 4 }}>Seat {seatTarget.name || 'party'}</div>
            <div style={{ fontSize: 13.5, color: A.mutedText, marginBottom: 18 }}>{seatTarget.partySize} {seatTarget.partySize === 1 ? 'guest' : 'guests'} · waited {fmtMins(elapsedMins(seatTarget))}</div>
            <label style={labelStyle}>Table (optional)</label>
            <select style={{ ...inputStyle, marginBottom: 18 }} value={seatTable} onChange={e => setSeatTable(e.target.value)}>
              <option value="">— No specific table —</option>
              {tables.map(t => <option key={t.id} value={t.code || t.label}>{t.label}{t.code && t.code !== t.label ? ` (${t.code})` : ''}</option>)}
            </select>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => setSeatTarget(null)} style={{ ...ghostBtn, flex: 1, padding: '12px' }}>Cancel</button>
              <button onClick={confirmSeat} style={{ ...primaryBtn, flex: 1, justifyContent: 'center', background: A.success }}>Seat now</button>
            </div>
          </div>
        </div>
      )}

      <ConfirmModal
        open={!!confirm} title={confirm?.title} body={confirm?.body}
        confirmLabel={confirm?.confirmLabel} destructive={confirm?.destructive}
        onCancel={() => setConfirm(null)}
        onConfirm={async () => { await confirm.onConfirm(); setConfirm(null); }}
      />
    </>
  );
}

const primaryBtn = {
  display: 'inline-flex', alignItems: 'center', gap: 6, padding: '11px 18px', borderRadius: 9,
  border: 'none', background: A.ink, color: A.cream, fontSize: 13.5, fontWeight: 700, fontFamily: INTER, cursor: 'pointer',
};
const ghostBtn = {
  padding: '8px 13px', borderRadius: 8, cursor: 'pointer',
  border: '1px solid rgba(0,0,0,0.12)', background: A.shell, color: A.mutedText,
  fontSize: 13, fontWeight: 700, fontFamily: INTER,
};

function ActBtn({ children, onClick, busy, color }) {
  return (
    <button onClick={onClick} disabled={busy}
      style={{
        padding: '7px 12px', borderRadius: 7, cursor: busy ? 'not-allowed' : 'pointer',
        border: '1px solid rgba(0,0,0,0.10)', background: '#FFFFFF', color,
        fontSize: 12.5, fontWeight: 700, fontFamily: INTER, opacity: busy ? 0.5 : 1,
      }}>{children}</button>
  );
}

function StatCard({ label, value, accent }) {
  return (
    <div style={{ background: A.shell, border: A.border, borderRadius: 12, padding: '12px 16px', minWidth: 130, boxShadow: A.cardShadow }}>
      <div style={{ fontSize: 11, color: A.faintText, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 800, marginTop: 4, color: accent || A.ink }}>{value}</div>
    </div>
  );
}
