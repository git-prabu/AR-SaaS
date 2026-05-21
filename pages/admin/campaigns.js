// pages/admin/campaigns.js
//
// Phase 5 #7 — Marketing campaigns. Reach your customers two free ways:
//   • WhatsApp click-to-send — generates personalised wa.me links you
//     tap to open each chat (no API cost, works for any list size).
//   • Email — a capped, rate-limited blast through the shared sender
//     (best for small lists; server enforces the cap + opt-outs).
// Audience is built live from your CRM (excludes anyone who opted out).
// Use {name} in the message to greet each guest by name. Past sends are
// saved to history. Admin-only.
import Head from 'next/head';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/router';
import { useAuth } from '../../hooks/useAuth';
import AdminLayout from '../../components/layout/AdminLayout';
import EmptyState from '../../components/EmptyState';
import ConfirmModal from '../../components/ConfirmModal';
import { db } from '../../lib/firebase';
import { collection, onSnapshot, query, orderBy } from 'firebase/firestore';
import { createCampaign, deleteCampaign } from '../../lib/db';
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
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const inputStyle = {
  width: '100%', padding: '11px 13px', boxSizing: 'border-box',
  background: A.shell, border: '1px solid rgba(0,0,0,0.12)', borderRadius: 9,
  fontSize: 14, color: A.ink, fontFamily: A.font, outline: 'none',
};
const labelStyle = { display: 'block', fontSize: 11.5, fontWeight: 700, color: A.faintText, letterSpacing: '0.04em', textTransform: 'uppercase', marginBottom: 6 };

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

export default function AdminCampaigns() {
  const { user, userData, loading } = useAuth();
  const router = useRouter();
  const rid = userData?.restaurantId;

  const [customers, setCustomers] = useState([]);
  const [campaigns, setCampaigns] = useState([]);
  const [loaded, setLoaded] = useState(false);

  const [channel, setChannel] = useState('whatsapp');   // 'whatsapp' | 'email'
  const [name, setName] = useState('');
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [audType, setAudType] = useState('all');         // 'all' | 'lapsed' | 'tag'
  const [audTag, setAudTag] = useState('');
  const [waList, setWaList] = useState(null);
  const [sending, setSending] = useState(false);
  const [confirm, setConfirm] = useState(null);

  useEffect(() => { if (!loading && !user) router.push('/admin/login'); }, [loading, user, router]);

  useEffect(() => {
    if (!rid) return;
    const un = onSnapshot(collection(db, 'restaurants', rid, 'customers'),
      snap => { setCustomers(snap.docs.map(d => ({ id: d.id, ...d.data() }))); setLoaded(true); },
      () => setLoaded(true));
    return un;
  }, [rid]);

  useEffect(() => {
    if (!rid) return;
    const un = onSnapshot(query(collection(db, 'restaurants', rid, 'campaigns'), orderBy('createdAt', 'desc')),
      snap => setCampaigns(snap.docs.map(d => ({ id: d.id, ...d.data() }))),
      () => {});
    return un;
  }, [rid]);

  const allTags = useMemo(() => {
    const s = new Set();
    customers.forEach(c => (c.tags || []).forEach(t => s.add(t)));
    return [...s].sort();
  }, [customers]);

  const audienceLabel = audType === 'lapsed' ? 'Lapsed 30+ days' : audType === 'tag' ? `Tag: ${audTag || '—'}` : 'Everyone';

  // Recipients for the current channel + audience (opt-outs always excluded).
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
      await createCampaign(rid, { name, channel: 'whatsapp', message, audienceLabel, recipientCount: list.length, sentCount: list.length });
    } catch (e) { /* history write is best-effort */ }
    toast.success(`Generated ${list.length} WhatsApp link${list.length === 1 ? '' : 's'}`);
  };

  const sendEmail = async () => {
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
      await createCampaign(rid, { name, channel: 'email', subject, message, audienceLabel, recipientCount: j.recipientCount, sentCount: j.sentCount });
      toast.success(
        j.sentCount === 0
          ? 'No emails sent (no valid recipients)'
          : `Sent ${j.sentCount} email${j.sentCount === 1 ? '' : 's'}${j.capped ? ` — capped; ${j.recipientCount - j.sentCount} more, use a smaller audience or WhatsApp` : ''}`
      );
      setName(''); setSubject(''); setMessage('');
    } catch (e) {
      toast.error(e?.message || 'Send failed');
    } finally { setSending(false); }
  };

  const requestDelete = (c) => setConfirm({
    title: `Delete “${c.name || 'campaign'}”?`,
    body: 'This removes it from your campaign history. It does not unsend anything.',
    confirmLabel: 'Delete', destructive: true,
    onConfirm: async () => { await deleteCampaign(rid, c.id); toast.success('Deleted'); },
  });

  if (loading || !user) {
    return <AdminLayout><div style={{ padding: 40, fontFamily: A.font, color: A.mutedText }}>Loading…</div></AdminLayout>;
  }

  const noCustomers = loaded && customers.length === 0;

  return (
    <>
      <Head><title>Marketing — HaloHelm</title></Head>
      <AdminLayout>
        <div style={{ padding: '28px 26px', maxWidth: 920, margin: '0 auto', fontFamily: A.font, color: A.ink }}>
          <div style={{ marginBottom: 18 }}>
            <h1 style={{ fontSize: 26, fontWeight: 800, letterSpacing: '-0.5px', margin: 0 }}>Marketing</h1>
            <p style={{ fontSize: 13.5, color: A.mutedText, margin: '6px 0 0', lineHeight: 1.5 }}>
              Bring guests back with WhatsApp or email. Use <code style={{ background: A.subtleBg, padding: '1px 6px', borderRadius: 4, fontSize: 12 }}>{'{name}'}</code> to greet each person.
            </p>
          </div>

          {noCustomers && (
            <EmptyState title="No customers to message yet" subtitle="Add or sync customers on the Customers page first — then come back here to reach them." />
          )}

          {!noCustomers && (
            <>
              {/* Channel toggle */}
              <div style={{ display: 'flex', gap: 8, marginBottom: 18 }}>
                {[['whatsapp', 'WhatsApp', A.whatsapp], ['email', 'Email', A.info]].map(([k, label, col]) => (
                  <button key={k} onClick={() => { setChannel(k); setWaList(null); }}
                    style={{
                      padding: '9px 18px', borderRadius: 9, cursor: 'pointer', fontFamily: INTER, fontSize: 13.5, fontWeight: 700,
                      border: channel === k ? 'none' : A.borderStrong,
                      background: channel === k ? col : A.shell, color: channel === k ? '#fff' : A.mutedText,
                    }}>{label}</button>
                ))}
              </div>

              {/* Compose */}
              <div style={{ background: A.shell, border: A.border, borderRadius: 14, padding: '18px', boxShadow: A.cardShadow, marginBottom: 22 }}>
                <div style={{ marginBottom: 14 }}>
                  <label style={labelStyle}>Campaign name <span style={{ textTransform: 'none', fontWeight: 400, color: A.faintText }}>(only you see this)</span></label>
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
                  <textarea style={{ ...inputStyle, minHeight: 110, resize: 'vertical' }} maxLength={2000}
                    value={message} onChange={e => setMessage(e.target.value)}
                    placeholder={`Hi {name}, we've missed you! Show this message for 10% off your next visit. — ${userData?.restaurantName || 'our team'}`} />
                  <div style={{ fontSize: 11, color: A.faintText, marginTop: 4, textAlign: 'right' }}>{message.length}/2000</div>
                </div>

                {/* Audience */}
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
                  <div style={{ flex: 1, minWidth: 140, fontSize: 13, color: A.mutedText, paddingBottom: 11 }}>
                    <b style={{ color: A.ink }}>{recipients.length}</b> {channel === 'email' ? 'with email' : 'with phone'} · opt-outs excluded
                  </div>
                </div>

                <div style={{ marginTop: 16 }}>
                  {channel === 'whatsapp' ? (
                    <button onClick={generateWhatsApp} style={{ ...primaryBtn, background: A.whatsapp }}>Generate WhatsApp links</button>
                  ) : (
                    <button onClick={sendEmail} disabled={sending} style={{ ...primaryBtn, opacity: sending ? 0.6 : 1 }}>
                      {sending ? 'Sending…' : `Send email to ${recipients.length}`}
                    </button>
                  )}
                  {channel === 'email' && (
                    <div style={{ fontSize: 12, color: A.faintText, marginTop: 8, lineHeight: 1.5 }}>
                      Uses your shared HaloHelm sender — best for small lists (up to 40 per send). For bigger blasts, use WhatsApp.
                    </div>
                  )}
                </div>
              </div>

              {/* WhatsApp links panel */}
              {channel === 'whatsapp' && waList && (
                <div style={{ background: A.shell, border: A.border, borderRadius: 14, padding: '16px 18px', boxShadow: A.cardShadow, marginBottom: 22 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 12 }}>
                    <div style={{ fontSize: 14, fontWeight: 800 }}>{waList.length} link{waList.length === 1 ? '' : 's'} ready</div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button onClick={() => copy(message, 'Message')} style={ghostBtn}>Copy message</button>
                      <button onClick={() => copy(waList.map(w => w.phone).join(', '), 'Numbers')} style={ghostBtn}>Copy numbers</button>
                    </div>
                  </div>
                  <div style={{ fontSize: 12, color: A.faintText, marginBottom: 12, lineHeight: 1.5 }}>
                    Tap “Open” to launch each chat with the message pre-filled, then press send in WhatsApp.
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 360, overflowY: 'auto' }}>
                    {waList.map((w, i) => (
                      <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '8px 10px', background: A.shellDarker, borderRadius: 9 }}>
                        <div style={{ fontSize: 13.5, minWidth: 0 }}>
                          <span style={{ fontWeight: 700 }}>{w.name}</span>
                          <span style={{ color: A.faintText, marginLeft: 8 }}>{w.phone}</span>
                        </div>
                        <a href={w.url} target="_blank" rel="noopener noreferrer"
                          style={{ flexShrink: 0, padding: '7px 16px', borderRadius: 8, background: A.whatsapp, color: '#fff', fontSize: 12.5, fontWeight: 700, textDecoration: 'none' }}>Open</a>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* History */}
              <div style={{ fontSize: 13, fontWeight: 800, color: A.ink, margin: '4px 0 12px' }}>History</div>
              {campaigns.length === 0 ? (
                <div style={{ color: A.mutedText, fontSize: 13.5, padding: '4px 2px' }}>No campaigns sent yet.</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {campaigns.map(c => (
                    <div key={c.id} style={{ background: A.shell, border: A.border, borderRadius: 12, padding: '13px 15px', boxShadow: A.cardShadow, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                      <span style={{ padding: '3px 9px', borderRadius: 6, fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.04em', background: c.channel === 'email' ? 'rgba(45,125,210,0.12)' : 'rgba(37,211,102,0.14)', color: c.channel === 'email' ? A.info : '#1A8A4A' }}>{c.channel}</span>
                      <div style={{ flex: 1, minWidth: 160 }}>
                        <div style={{ fontSize: 14.5, fontWeight: 700 }}>{c.name || '(untitled)'}</div>
                        <div style={{ fontSize: 12.5, color: A.mutedText, marginTop: 2 }}>{c.audienceLabel || 'Everyone'} · {fmtWhen(c.createdAt)}</div>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: 15, fontWeight: 800 }}>{c.sentCount ?? 0}</div>
                        <div style={{ fontSize: 10.5, color: A.faintText, fontWeight: 600, textTransform: 'uppercase' }}>{c.channel === 'email' ? 'sent' : 'links'}</div>
                      </div>
                      <button onClick={() => requestDelete(c)} style={{ ...ghostBtn, color: A.danger }}>✕</button>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </AdminLayout>

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
  fontSize: 12.5, fontWeight: 700, fontFamily: INTER,
};
