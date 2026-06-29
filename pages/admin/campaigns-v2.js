// pages/admin/campaigns-v2.js
//
// ★ REDESIGN EXEMPLAR ★ — duplicate of /admin/campaigns on the dark "ok-root"
// theme (via <OkShell>). Logic copied verbatim from campaigns.js — only the
// render is new. Original untouched.
import Head from 'next/head';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useFeatureAccess } from '../../hooks/useFeatureAccess';
import OkShell from '../../components/admin/OkShell';
import ConfirmModal from '../../components/ConfirmModal';
import { collection, onSnapshot, query, orderBy } from 'firebase/firestore';
import { createCampaign, deleteCampaign } from '../../lib/db';
import toast from 'react-hot-toast';

const WHATSAPP = '#3FAA63';
const INFO = '#6E8EAF';
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const inputStyle = {
  width: '100%', padding: '11px 13px', boxSizing: 'border-box',
  background: 'var(--card-2)', border: '1px solid var(--line)', borderRadius: 10,
  fontSize: 14, color: 'var(--tx)', fontFamily: 'var(--font-body)', outline: 'none',
};
const labelStyle = { display: 'block', fontFamily: 'var(--font-mono)', fontSize: 10.5, fontWeight: 700, color: 'var(--tx-3)', letterSpacing: '.05em', textTransform: 'uppercase', marginBottom: 6 };
const primaryBtn = { display: 'inline-flex', alignItems: 'center', gap: 6, padding: '11px 18px', borderRadius: 10, border: 'none', background: 'var(--accent)', color: 'var(--accent-ink)', fontSize: 13, fontWeight: 700, fontFamily: 'var(--font-display)', cursor: 'pointer' };
const ghostBtn = { padding: '8px 13px', borderRadius: 10, cursor: 'pointer', border: '1px solid var(--line)', background: 'var(--card)', color: 'var(--tx-2)', fontSize: 12.5, fontWeight: 600, fontFamily: 'var(--font-display)' };

function isLapsed(iso, days = 30) {
  if (!iso) return false;
  const t = Date.parse(iso);
  return !isNaN(t) && (Date.now() - t) > days * 86400000;
}
function fmtWhen(ts) {
  const d = ts?.toDate ? ts.toDate() : (ts?.seconds ? new Date(ts.seconds * 1000) : null);
  if (!d) return '';
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

export default function CampaignsV2() {
  const { ready, isAdmin, rid, scopedDb, canView, user, userData, staffSession, planAllowsFeature } = useFeatureAccess('marketing');
  const restaurantName = userData?.restaurantName || staffSession?.restaurantName || 'Your Restaurant';

  const [customers, setCustomers] = useState([]);
  const [campaigns, setCampaigns] = useState([]);
  const [loaded, setLoaded] = useState(false);

  const [channel, setChannel] = useState('whatsapp');
  const [name, setName] = useState('');
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [audType, setAudType] = useState('all');
  const [audTag, setAudTag] = useState('');
  const [waList, setWaList] = useState(null);
  const [sending, setSending] = useState(false);
  const [confirm, setConfirm] = useState(null);

  useEffect(() => {
    if (!rid || !canView) return;
    const un = onSnapshot(collection(scopedDb, 'restaurants', rid, 'customers'),
      snap => { setCustomers(snap.docs.map(d => ({ id: d.id, ...d.data() }))); setLoaded(true); },
      () => setLoaded(true));
    return un;
  }, [rid, canView, scopedDb]);

  useEffect(() => {
    if (!rid || !canView) return;
    const un = onSnapshot(query(collection(scopedDb, 'restaurants', rid, 'campaigns'), orderBy('createdAt', 'desc')),
      snap => setCampaigns(snap.docs.map(d => ({ id: d.id, ...d.data() }))),
      () => {});
    return un;
  }, [rid, canView, scopedDb]);

  const allTags = useMemo(() => {
    const s = new Set();
    customers.forEach(c => (c.tags || []).forEach(t => s.add(t)));
    return [...s].sort();
  }, [customers]);

  const audienceLabel = audType === 'lapsed' ? 'Lapsed 30+ days' : audType === 'tag' ? `Tag: ${audTag || '—'}` : 'Everyone';

  const recipients = useMemo(() => {
    return customers.filter(c => {
      if (c.marketingOptOut) return false;
      if (channel === 'email') { if (!EMAIL_RE.test(String(c.email || '').trim())) return false; }
      else { if (String(c.phone || '').replace(/\D/g, '').length < 10) return false; }
      if (audType === 'tag') return !!audTag && Array.isArray(c.tags) && c.tags.includes(audTag);
      if (audType === 'lapsed') return isLapsed(c.lastSeenAt);
      return true;
    });
  }, [customers, channel, audType, audTag]);

  const copy = async (text, label) => {
    try { await navigator.clipboard.writeText(text); toast.success(`${label} copied`); }
    catch { toast.error('Copy failed — select and copy manually'); }
  };

  const generateWhatsApp = async () => {
    if (!name.trim()) return toast.error('Give the campaign a name');
    if (!message.trim()) return toast.error('Write a message');
    if (recipients.length === 0) return toast.error('No customers with a phone in this audience');
    const list = recipients.map(c => {
      const text = message.replace(/\{name\}/gi, c.name || 'there');
      return { name: c.name || c.phone, phone: c.phone, url: `https://wa.me/91${c.phone}?text=${encodeURIComponent(text)}` };
    });
    setWaList(list);
    try {
      await createCampaign(rid, { name, channel: 'whatsapp', message, audienceLabel, recipientCount: list.length, sentCount: list.length }, { db: scopedDb });
    } catch (e) { /* history write is best-effort */ }
    toast.success(`Generated ${list.length} WhatsApp link${list.length === 1 ? '' : 's'}`);
  };

  const sendEmail = async () => {
    if (!isAdmin || !user) return toast.error('Email campaigns are owner-only.');
    if (!name.trim()) return toast.error('Give the campaign a name');
    if (!subject.trim()) return toast.error('Add an email subject');
    if (!message.trim()) return toast.error('Write a message');
    if (recipients.length === 0) return toast.error('No customers with an email in this audience');
    setSending(true);
    try {
      const token = await user.getIdToken();
      const r = await fetch('/api/crm/campaign-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ subject, message, audience: { type: audType, tag: audType === 'tag' ? audTag : undefined } }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j.ok) throw new Error(j.error || 'Send failed');
      await createCampaign(rid, { name, channel: 'email', subject, message, audienceLabel, recipientCount: j.recipientCount, sentCount: j.sentCount }, { db: scopedDb });
      toast.success(j.sentCount === 0 ? 'No emails sent (no valid recipients)' : `Sent ${j.sentCount} email${j.sentCount === 1 ? '' : 's'}${j.capped ? ` — capped; ${j.recipientCount - j.sentCount} more, use a smaller audience or WhatsApp` : ''}`);
      setName(''); setSubject(''); setMessage('');
    } catch (e) {
      toast.error(e?.message || 'Send failed');
    } finally { setSending(false); }
  };

  const requestDelete = (c) => setConfirm({
    title: `Delete “${c.name || 'campaign'}”?`,
    body: 'This removes it from your campaign history. It does not unsend anything.',
    confirmLabel: 'Delete', destructive: true,
    onConfirm: async () => { await deleteCampaign(rid, c.id, { db: scopedDb }); toast.success('Deleted'); },
  });

  if (!ready) {
    return (
      <div className="ok-root" style={{ minHeight: '100vh', display: 'grid', placeItems: 'center' }}>
        <Head><title>Marketing — HaloHelm</title></Head>
        <div style={{ color: 'var(--tx-3)', fontFamily: 'var(--font-body)', fontSize: 14 }}>Loading…</div>
      </div>
    );
  }
  if (planAllowsFeature === false) {
    return (
      <div className="ok-root" style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 24 }}>
        <Head><title>Marketing — HaloHelm</title></Head>
        <div style={{ textAlign: 'center', maxWidth: 380 }}>
          <div style={{ fontSize: 44, marginBottom: 12 }}>✦</div>
          <div style={{ color: 'var(--tx)', fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 18, marginBottom: 6 }}>Upgrade required</div>
          <div style={{ color: 'var(--tx-3)', fontFamily: 'var(--font-body)', fontSize: 13.5, lineHeight: 1.6, marginBottom: 18 }}>Marketing campaigns are available on a higher plan. Upgrade to reach guests via WhatsApp & email.</div>
          <Link href="/admin/subscription" style={{ ...primaryBtn, textDecoration: 'none' }}>View plans →</Link>
        </div>
      </div>
    );
  }
  if (!canView) {
    return (
      <div className="ok-root" style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 24 }}>
        <Head><title>Marketing — HaloHelm</title></Head>
        <div style={{ textAlign: 'center', maxWidth: 360 }}>
          <div style={{ fontSize: 44, marginBottom: 12 }}>🔒</div>
          <div style={{ color: 'var(--tx)', fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 18, marginBottom: 6 }}>No access</div>
          <div style={{ color: 'var(--tx-3)', fontFamily: 'var(--font-body)', fontSize: 13.5, lineHeight: 1.6 }}>Your role doesn’t include Marketing. Ask the owner to grant it.</div>
        </div>
      </div>
    );
  }

  const noCustomers = loaded && customers.length === 0;

  return (
    <>
      <Head><title>Marketing — HaloHelm</title></Head>
      <OkShell active={null} eyebrow="Reach your guests · WhatsApp & email" title="Marketing" brand={restaurantName}>
        {noCustomers && (
          <div style={{ textAlign: 'center', padding: '56px 20px', background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 16 }}>
            <div style={{ fontSize: 34, marginBottom: 12 }}>📣</div>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 16, fontWeight: 700, color: 'var(--tx)', marginBottom: 6 }}>No customers to message yet</div>
            <div style={{ fontFamily: 'var(--font-body)', fontSize: 13, color: 'var(--tx-3)', maxWidth: 380, margin: '0 auto', lineHeight: 1.6 }}>Add or sync customers on the Customers page first — then come back here to reach them.</div>
          </div>
        )}

        {!noCustomers && (
          <>
            {/* Channel toggle */}
            <div style={{ display: 'flex', gap: 8, marginBottom: 18 }}>
              {[['whatsapp', 'WhatsApp', WHATSAPP], ...(isAdmin ? [['email', 'Email', INFO]] : [])].map(([k, label, col]) => {
                const sel = channel === k;
                return (
                  <button key={k} onClick={() => { setChannel(k); setWaList(null); }} style={{
                    padding: '9px 18px', borderRadius: 10, cursor: 'pointer', fontFamily: 'var(--font-display)', fontSize: 13.5, fontWeight: 700,
                    border: sel ? 'none' : '1px solid var(--line)', background: sel ? col : 'var(--card)', color: sel ? '#fff' : 'var(--tx-2)',
                  }}>{label}</button>
                );
              })}
            </div>

            {/* Compose */}
            <div style={{ background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 16, padding: 18, marginBottom: 22 }}>
              <div style={{ marginBottom: 14 }}>
                <label style={labelStyle}>Campaign name <span style={{ textTransform: 'none', fontWeight: 400, color: 'var(--tx-3)' }}>(only you see this)</span></label>
                <input style={inputStyle} value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Weekend biryani offer" />
              </div>
              {channel === 'email' && (
                <div style={{ marginBottom: 14 }}>
                  <label style={labelStyle}>Email subject</label>
                  <input style={inputStyle} value={subject} onChange={e => setSubject(e.target.value)} placeholder="e.g. A little something for the weekend 🍛" />
                </div>
              )}
              <div style={{ marginBottom: 14 }}>
                <label style={labelStyle}>Message</label>
                <textarea style={{ ...inputStyle, minHeight: 110, resize: 'vertical' }} maxLength={2000} value={message} onChange={e => setMessage(e.target.value)}
                  placeholder={`Hi {name}, we've missed you! Show this message for 10% off your next visit. — ${restaurantName}`} />
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--tx-3)', marginTop: 4, textAlign: 'right' }}>{message.length}/2000</div>
              </div>
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
                <div style={{ minWidth: 180 }}>
                  <label style={labelStyle}>Audience</label>
                  <select style={inputStyle} value={audType} onChange={e => setAudType(e.target.value)}>
                    <option value="all">Everyone</option>
                    <option value="lapsed">Lapsed (30+ days)</option>
                    <option value="tag">By tag</option>
                  </select>
                </div>
                {audType === 'tag' && (
                  <div style={{ minWidth: 160 }}>
                    <label style={labelStyle}>Tag</label>
                    <select style={inputStyle} value={audTag} onChange={e => setAudTag(e.target.value)}>
                      <option value="">Select tag…</option>
                      {allTags.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </div>
                )}
                <div style={{ flex: 1, minWidth: 140, fontFamily: 'var(--font-body)', fontSize: 13, color: 'var(--tx-3)', paddingBottom: 11 }}>
                  <b style={{ color: 'var(--tx)' }}>{recipients.length}</b> {channel === 'email' ? 'with email' : 'with phone'} · opt-outs excluded
                </div>
              </div>
              <div style={{ marginTop: 16 }}>
                {channel === 'whatsapp' ? (
                  <button onClick={generateWhatsApp} style={{ ...primaryBtn, background: WHATSAPP, color: '#fff' }}>Generate WhatsApp links</button>
                ) : (
                  <button onClick={sendEmail} disabled={sending} style={{ ...primaryBtn, opacity: sending ? 0.6 : 1 }}>{sending ? 'Sending…' : `Send email to ${recipients.length}`}</button>
                )}
                {channel === 'email' && (
                  <div style={{ fontFamily: 'var(--font-body)', fontSize: 12, color: 'var(--tx-3)', marginTop: 8, lineHeight: 1.5 }}>
                    Uses your shared HaloHelm sender — best for small lists (up to 40 per send). For bigger blasts, use WhatsApp.
                  </div>
                )}
              </div>
            </div>

            {/* WhatsApp links */}
            {channel === 'whatsapp' && waList && (
              <div style={{ background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 16, padding: '16px 18px', marginBottom: 22 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 12 }}>
                  <div style={{ fontFamily: 'var(--font-display)', fontSize: 14, fontWeight: 700, color: 'var(--tx)' }}>{waList.length} link{waList.length === 1 ? '' : 's'} ready</div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button onClick={() => copy(message, 'Message')} style={ghostBtn}>Copy message</button>
                    <button onClick={() => copy(waList.map(w => w.phone).join(', '), 'Numbers')} style={ghostBtn}>Copy numbers</button>
                  </div>
                </div>
                <div style={{ fontFamily: 'var(--font-body)', fontSize: 12, color: 'var(--tx-3)', marginBottom: 12, lineHeight: 1.5 }}>
                  Tap “Open” to launch each chat with the message pre-filled, then press send in WhatsApp.
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 360, overflowY: 'auto' }}>
                  {waList.map((w, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '8px 10px', background: 'var(--card-2)', borderRadius: 10 }}>
                      <div style={{ fontFamily: 'var(--font-body)', fontSize: 13.5, minWidth: 0 }}>
                        <span style={{ fontWeight: 700, color: 'var(--tx)' }}>{w.name}</span>
                        <span style={{ color: 'var(--tx-3)', marginLeft: 8 }}>{w.phone}</span>
                      </div>
                      <a href={w.url} target="_blank" rel="noopener noreferrer" style={{ flexShrink: 0, padding: '7px 16px', borderRadius: 8, background: WHATSAPP, color: '#fff', fontFamily: 'var(--font-display)', fontSize: 12.5, fontWeight: 700, textDecoration: 'none' }}>Open</a>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* History */}
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 13, fontWeight: 700, color: 'var(--tx)', margin: '4px 0 12px' }}>History</div>
            {campaigns.length === 0 ? (
              <div style={{ color: 'var(--tx-3)', fontFamily: 'var(--font-body)', fontSize: 13.5, padding: '4px 2px' }}>No campaigns sent yet.</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {campaigns.map(c => (
                  <div key={c.id} style={{ background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 14, padding: '13px 15px', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                    <span style={{ padding: '3px 9px', borderRadius: 6, fontFamily: 'var(--font-mono)', fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.04em', background: 'var(--card-3)', color: c.channel === 'email' ? INFO : WHATSAPP }}>{c.channel}</span>
                    <div style={{ flex: 1, minWidth: 160 }}>
                      <div style={{ fontFamily: 'var(--font-display)', fontSize: 14.5, fontWeight: 700, color: 'var(--tx)' }}>{c.name || '(untitled)'}</div>
                      <div style={{ fontFamily: 'var(--font-body)', fontSize: 12.5, color: 'var(--tx-3)', marginTop: 2 }}>{c.audienceLabel || 'Everyone'} · {fmtWhen(c.createdAt)}</div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontFamily: 'var(--font-display)', fontSize: 15, fontWeight: 700, color: 'var(--tx)' }}>{c.sentCount ?? 0}</div>
                      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9.5, color: 'var(--tx-3)', fontWeight: 600, textTransform: 'uppercase' }}>{c.channel === 'email' ? 'sent' : 'links'}</div>
                    </div>
                    <button onClick={() => requestDelete(c)} style={{ ...ghostBtn, color: 'var(--danger)' }}>✕</button>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        <ConfirmModal open={!!confirm} title={confirm?.title} body={confirm?.body} confirmLabel={confirm?.confirmLabel} destructive={confirm?.destructive} onCancel={() => setConfirm(null)} onConfirm={async () => { await confirm.onConfirm(); setConfirm(null); }} />
      </OkShell>
    </>
  );
}

CampaignsV2.getLayout = (page) => page;
