// pages/admin/waitlist-v2.js
//
// ★ REDESIGN EXEMPLAR ★ — duplicate of /admin/waitlist on the dark "ok-root"
// theme (via <OkShell>). Logic copied verbatim from waitlist.js — only the
// render is new. Original untouched.
import Head from 'next/head';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../../hooks/useAuth';
import OkShell from '../../components/admin/OkShell';
import { useFeatureAccess } from '../../hooks/useFeatureAccess';
import ConfirmModal from '../../components/ConfirmModal';
import { collection, onSnapshot, query, orderBy } from 'firebase/firestore';
import {
  createWaitlistEntry, setWaitlistStatus, deleteWaitlistEntry, getTables, markTableSeated,
} from '../../lib/db';
import toast from 'react-hot-toast';

const QUOTE_CHIPS = [['', 'No estimate'], [15, '15m'], [30, '30m'], [45, '45m'], [60, '1h']];

const inputStyle = {
  width: '100%', padding: '11px 13px', boxSizing: 'border-box',
  background: 'var(--card-2)', border: '1px solid var(--line)', borderRadius: 10,
  fontSize: 14, color: 'var(--tx)', fontFamily: 'var(--font-body)', outline: 'none',
};
const labelStyle = { display: 'block', fontFamily: 'var(--font-mono)', fontSize: 10.5, fontWeight: 700, color: 'var(--tx-3)', letterSpacing: '.05em', textTransform: 'uppercase', marginBottom: 6 };
const primaryBtn = { display: 'inline-flex', alignItems: 'center', gap: 6, padding: '11px 18px', borderRadius: 10, border: 'none', background: 'var(--accent)', color: 'var(--accent-ink)', fontSize: 13, fontWeight: 700, fontFamily: 'var(--font-display)', cursor: 'pointer' };
const ghostBtn = { padding: '8px 13px', borderRadius: 10, cursor: 'pointer', border: '1px solid var(--line)', background: 'var(--card)', color: 'var(--tx-2)', fontSize: 13, fontWeight: 600, fontFamily: 'var(--font-display)' };
const WHATSAPP = '#3FAA63';
const INFO = '#6E8EAF';

const STATUS_META = {
  waiting:   { label: 'Waiting',  color: 'var(--gold)' },
  notified:  { label: 'Notified', color: INFO },
  seated:    { label: 'Seated',   color: 'var(--success)' },
  cancelled: { label: 'Removed',  color: 'var(--tx-3)' },
  noshow:    { label: 'No-show',  color: 'var(--danger)' },
};

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

export default function WaitlistV2() {
  const { userData } = useAuth();
  const { ready, isAdmin, rid, scopedDb, canView, staffSession, planAllowsFeature } = useFeatureAccess('waitlist');
  const restaurantName = userData?.restaurantName || staffSession?.restaurantName || 'our restaurant';

  const [entries, setEntries] = useState([]);
  const [tables, setTables] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [now, setNow] = useState(Date.now());
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState(null);
  const [seatTarget, setSeatTarget] = useState(null);
  const [seatTable, setSeatTable] = useState('');
  const [confirm, setConfirm] = useState(null);
  const [showDone, setShowDone] = useState(false);

  useEffect(() => {
    if (!rid || !canView) return;
    const un = onSnapshot(
      query(collection(scopedDb, 'restaurants', rid, 'waitlist'), orderBy('createdAt', 'asc')),
      snap => { setEntries(snap.docs.map(d => ({ id: d.id, ...d.data() }))); setLoaded(true); },
      () => setLoaded(true)
    );
    return un;
  }, [rid]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!rid || !canView) return;
    getTables(rid, { db: scopedDb }).then(setTables).catch(() => {});
  }, [rid]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(t);
  }, []);

  const active = useMemo(() => entries.filter(e => e.status === 'waiting' || e.status === 'notified'), [entries]);
  const doneToday = useMemo(
    () => entries.filter(e => ['seated', 'cancelled', 'noshow'].includes(e.status) && isTodayTs(e.seatedAt || e.notifiedAt || e.createdAt))
      .sort((a, b) => tsMs(b.seatedAt || b.createdAt) - tsMs(a.seatedAt || a.createdAt)),
    [entries]
  );

  const stats = useMemo(() => {
    const coversWaiting = active.reduce((s, e) => s + (Number(e.partySize) || 0), 0);
    const seatedToday = entries.filter(e => e.status === 'seated' && isTodayTs(e.seatedAt));
    const waits = seatedToday.map(e => (tsMs(e.seatedAt) && tsMs(e.createdAt)) ? Math.round((tsMs(e.seatedAt) - tsMs(e.createdAt)) / 60000) : null).filter(v => v != null && v >= 0);
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
      await createWaitlistEntry(rid, { name: form.name, partySize: size, phone: form.phone, quotedMinutes: Number(form.quotedMinutes) || 0, note: form.note }, { db: scopedDb });
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
    return (
      <div className="ok-root" style={{ minHeight: '100vh', display: 'grid', placeItems: 'center' }}>
        <Head><title>Waitlist — HaloHelm</title></Head>
        <div style={{ color: 'var(--tx-3)', fontFamily: 'var(--font-body)', fontSize: 14 }}>Loading…</div>
      </div>
    );
  }
  if (planAllowsFeature === false) {
    return (
      <div className="ok-root" style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 24 }}>
        <Head><title>Waitlist — HaloHelm</title></Head>
        <div style={{ textAlign: 'center', maxWidth: 380 }}>
          <div style={{ fontSize: 44, marginBottom: 12 }}>✦</div>
          <div style={{ color: 'var(--tx)', fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 18, marginBottom: 6 }}>Upgrade required</div>
          <div style={{ color: 'var(--tx-3)', fontFamily: 'var(--font-body)', fontSize: 13.5, lineHeight: 1.6, marginBottom: 18 }}>The Waitlist is available on a higher plan. Upgrade to manage walk-in queues.</div>
          <Link href="/admin/subscription" style={{ ...primaryBtn, textDecoration: 'none' }}>View plans →</Link>
        </div>
      </div>
    );
  }
  if (!canView) {
    return (
      <div className="ok-root" style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 24 }}>
        <Head><title>Waitlist — HaloHelm</title></Head>
        <div style={{ textAlign: 'center', maxWidth: 360 }}>
          <div style={{ fontSize: 44, marginBottom: 12 }}>🔒</div>
          <div style={{ color: 'var(--tx)', fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 18, marginBottom: 6 }}>No access</div>
          <div style={{ color: 'var(--tx-3)', fontFamily: 'var(--font-body)', fontSize: 13.5, lineHeight: 1.6 }}>Your role doesn’t include the Waitlist. Ask the owner to grant it.</div>
        </div>
      </div>
    );
  }

  return (
    <>
      <Head><title>Waitlist — HaloHelm</title></Head>
      <OkShell active={null} eyebrow="Host stand · walk-in queue" title="Waitlist" brand={restaurantName}>
        {/* Add party */}
        <form onSubmit={add} style={{ background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 16, padding: '16px 18px', marginBottom: 22 }}>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 13, fontWeight: 700, color: 'var(--tx)', marginBottom: 14 }}>Add a party</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12, marginBottom: 12 }}>
            <div><label style={labelStyle}>Name</label><input style={inputStyle} value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Priya" /></div>
            <div><label style={labelStyle}>Party size</label><input style={inputStyle} type="number" min="1" max="99" value={form.partySize} onChange={e => setForm(f => ({ ...f, partySize: e.target.value }))} /></div>
            <div><label style={labelStyle}>Phone (optional)</label><input style={inputStyle} type="tel" value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value.replace(/\D/g, '').slice(0, 10) }))} placeholder="For WhatsApp notify" /></div>
          </div>
          <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <div style={{ flex: '1 1 220px' }}><label style={labelStyle}>Note (optional)</label><input style={inputStyle} value={form.note} onChange={e => setForm(f => ({ ...f, note: e.target.value }))} placeholder="e.g. high chair, window seat" /></div>
            <div>
              <label style={labelStyle}>Quoted wait</label>
              <div style={{ display: 'flex', gap: 6 }}>
                {QUOTE_CHIPS.map(([v, lbl]) => {
                  const sel = String(form.quotedMinutes) === String(v);
                  return (
                    <button type="button" key={lbl} onClick={() => setForm(f => ({ ...f, quotedMinutes: v === '' ? '' : String(v) }))}
                      style={{ padding: '9px 12px', borderRadius: 9, cursor: 'pointer', fontFamily: 'var(--font-display)', fontSize: 12.5, fontWeight: 700, border: sel ? 'none' : '1px solid var(--line)', background: sel ? 'var(--accent)' : 'var(--card)', color: sel ? 'var(--accent-ink)' : 'var(--tx-2)' }}>{lbl}</button>
                  );
                })}
              </div>
            </div>
          </div>
          <div style={{ marginTop: 16 }}>
            <button type="submit" disabled={saving} style={{ ...primaryBtn, opacity: saving ? 0.6 : 1 }}>{saving ? 'Adding…' : '+ Add to waitlist'}</button>
          </div>
        </form>

        {/* Stats */}
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 20 }}>
          <SCard label="Waiting now" value={stats.waitingNow} accent={stats.waitingNow > 0 ? 'var(--gold)' : 'var(--tx)'} />
          <SCard label="Guests waiting" value={stats.coversWaiting} />
          <SCard label="Seated today" value={stats.seatedToday} />
          <SCard label="Avg wait today" value={stats.avgWait ? fmtMins(stats.avgWait) : '—'} />
        </div>

        {/* Active queue */}
        {loaded && active.length === 0 && (
          <div style={{ textAlign: 'center', padding: '56px 20px', background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 16 }}>
            <div style={{ fontSize: 34, marginBottom: 12 }}>⏳</div>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 16, fontWeight: 700, color: 'var(--tx)', marginBottom: 6 }}>No one waiting</div>
            <div style={{ fontFamily: 'var(--font-body)', fontSize: 13, color: 'var(--tx-3)', maxWidth: 400, margin: '0 auto', lineHeight: 1.6 }}>When you're full, add walk-in guests here so nobody gets lost. They'll show up in order with a live wait timer.</div>
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {active.map((e, i) => {
            const sm = STATUS_META[e.status] || STATUS_META.waiting;
            const busy = busyId === e.id;
            const mins = elapsedMins(e);
            const overQuote = e.quotedMinutes > 0 && mins > e.quotedMinutes;
            return (
              <div key={e.id} style={{ background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 14, padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
                <div style={{ width: 30, height: 30, borderRadius: '50%', background: 'var(--card-3)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-display)', fontSize: 13, fontWeight: 700, color: 'var(--tx-2)', flexShrink: 0 }}>{i + 1}</div>
                <div style={{ flex: 1, minWidth: 170 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <span style={{ fontFamily: 'var(--font-display)', fontSize: 15.5, fontWeight: 700, color: 'var(--tx)' }}>{e.name || 'Guest'}</span>
                    <span style={{ padding: '2px 9px', borderRadius: 6, background: 'var(--card-3)', color: 'var(--tx-2)', fontSize: 12, fontWeight: 700 }}>{e.partySize} {e.partySize === 1 ? 'guest' : 'guests'}</span>
                    <span style={{ padding: '2px 9px', borderRadius: 6, background: 'var(--card-3)', color: sm.color, fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.04em' }}>{sm.label}</span>
                  </div>
                  <div style={{ fontFamily: 'var(--font-body)', fontSize: 12.5, color: 'var(--tx-3)', marginTop: 4, display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
                    {e.phone
                      ? <><a href={`tel:${e.phone}`} style={{ color: INFO, fontWeight: 600, textDecoration: 'none' }}>{e.phone}</a><a href={`https://wa.me/91${e.phone}`} target="_blank" rel="noopener noreferrer" style={{ color: WHATSAPP, fontWeight: 700, textDecoration: 'none' }}>WhatsApp</a></>
                      : <span>No phone</span>}
                    {e.note ? <span>{e.note}</span> : null}
                  </div>
                </div>
                <div style={{ textAlign: 'right', minWidth: 70 }}>
                  <div style={{ fontFamily: 'var(--font-display)', fontSize: 16, fontWeight: 700, color: overQuote ? 'var(--danger)' : 'var(--tx)' }}>{fmtMins(mins)}</div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--tx-3)', fontWeight: 600 }}>waiting{e.quotedMinutes > 0 ? ` · ~${e.quotedMinutes}m quoted` : ''}</div>
                </div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {e.status === 'waiting' && <ActBtn onClick={() => notify(e)} busy={busy} color={INFO}>Notify</ActBtn>}
                  <ActBtn onClick={() => openSeat(e)} busy={busy} color="var(--success)">Seat</ActBtn>
                  <ActBtn onClick={() => requestRemove(e)} busy={busy} color="var(--danger)">✕</ActBtn>
                </div>
              </div>
            );
          })}
        </div>

        {/* Done today */}
        {doneToday.length > 0 && (
          <div style={{ marginTop: 26 }}>
            <button onClick={() => setShowDone(s => !s)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'var(--font-display)', fontSize: 13, fontWeight: 700, color: 'var(--tx)', padding: 0, display: 'flex', alignItems: 'center', gap: 6 }}>
              Done today ({doneToday.length}) <span style={{ color: 'var(--tx-3)' }}>{showDone ? '▲' : '▼'}</span>
            </button>
            {showDone && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 12 }}>
                {doneToday.map(e => {
                  const sm = STATUS_META[e.status] || STATUS_META.seated;
                  const waited = (tsMs(e.seatedAt) && tsMs(e.createdAt)) ? Math.round((tsMs(e.seatedAt) - tsMs(e.createdAt)) / 60000) : null;
                  return (
                    <div key={e.id} style={{ background: 'var(--card-2)', border: '1px solid var(--line)', borderRadius: 12, padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                      <span style={{ padding: '2px 9px', borderRadius: 6, background: 'var(--card-3)', color: sm.color, fontSize: 11, fontWeight: 700, textTransform: 'uppercase' }}>{sm.label}</span>
                      <div style={{ flex: 1, minWidth: 150, fontFamily: 'var(--font-body)', fontSize: 13.5, color: 'var(--tx)' }}>
                        <span style={{ fontWeight: 700 }}>{e.name || 'Guest'}</span>
                        <span style={{ color: 'var(--tx-3)' }}> · {e.partySize} {e.partySize === 1 ? 'guest' : 'guests'}</span>
                        {e.status === 'seated' && e.tableCode ? <span style={{ color: 'var(--tx-3)' }}> · {e.tableCode}</span> : null}
                      </div>
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--tx-3)' }}>{e.status === 'seated' && waited != null ? `waited ${fmtMins(waited)} · ` : ''}{fmtClock(e.seatedAt || e.createdAt)}</span>
                      <button onClick={() => requestDelete(e)} style={{ background: 'none', border: 'none', color: 'var(--tx-3)', fontSize: 15, cursor: 'pointer', lineHeight: 1 }}>✕</button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Seat modal */}
        {seatTarget && (
          <div onClick={() => setSeatTarget(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 210, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
            <div onClick={ev => ev.stopPropagation()} style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 18, padding: 24, width: 'min(400px, 100%)', boxShadow: '0 30px 80px rgba(0,0,0,0.6)' }}>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 700, color: 'var(--tx)', marginBottom: 4 }}>Seat {seatTarget.name || 'party'}</div>
              <div style={{ fontFamily: 'var(--font-body)', fontSize: 13.5, color: 'var(--tx-3)', marginBottom: 18 }}>{seatTarget.partySize} {seatTarget.partySize === 1 ? 'guest' : 'guests'} · waited {fmtMins(elapsedMins(seatTarget))}</div>
              <label style={labelStyle}>Table (optional)</label>
              <select style={{ ...inputStyle, marginBottom: 18 }} value={seatTable} onChange={e => setSeatTable(e.target.value)}>
                <option value="">— No specific table —</option>
                {tables.map(t => <option key={t.id} value={t.code || t.label}>{t.label}{t.code && t.code !== t.label ? ` (${t.code})` : ''}</option>)}
              </select>
              <div style={{ display: 'flex', gap: 10 }}>
                <button onClick={() => setSeatTarget(null)} style={{ ...ghostBtn, flex: 1, padding: '12px', textAlign: 'center', justifyContent: 'center' }}>Cancel</button>
                <button onClick={confirmSeat} style={{ ...primaryBtn, flex: 1, justifyContent: 'center', background: 'var(--success)', color: '#fff' }}>Seat now</button>
              </div>
            </div>
          </div>
        )}

        <ConfirmModal open={!!confirm} title={confirm?.title} body={confirm?.body} confirmLabel={confirm?.confirmLabel} destructive={confirm?.destructive} onCancel={() => setConfirm(null)} onConfirm={async () => { await confirm.onConfirm(); setConfirm(null); }} />
      </OkShell>
    </>
  );
}

function ActBtn({ children, onClick, busy, color }) {
  return (
    <button onClick={onClick} disabled={busy} style={{ padding: '7px 12px', borderRadius: 8, cursor: busy ? 'not-allowed' : 'pointer', border: '1px solid var(--line)', background: 'var(--card-2)', color, fontFamily: 'var(--font-display)', fontSize: 12.5, fontWeight: 700, opacity: busy ? 0.5 : 1 }}>{children}</button>
  );
}

function SCard({ label, value, accent }) {
  return (
    <div style={{ background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 14, padding: '12px 16px', minWidth: 130 }}>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--tx-3)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.05em' }}>{label}</div>
      <div style={{ fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 700, marginTop: 4, color: accent || 'var(--tx)' }}>{value}</div>
    </div>
  );
}

WaitlistV2.getLayout = (page) => page;
