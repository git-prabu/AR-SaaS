// pages/book/[subdomain].js
//
// Phase 2 #8 — public "Book a table" form. Shareable link
// (halohelm.com/book/{subdomain}); submits to /api/reservation/create.
// Warm app palette so it feels part of the restaurant's brand.
import Head from 'next/head';
import { useState } from 'react';
import { useRouter } from 'next/router';

const C = {
  bg: '#0D0B08', card: '#17120D', text: '#FFF5E8',
  dim: 'rgba(255,245,232,0.6)', faint: 'rgba(255,245,232,0.4)',
  border: '1px solid rgba(255,245,232,0.12)', accent: '#F79B3D', accentDk: '#E05A3A',
};

const inputStyle = {
  width: '100%', padding: '13px 14px', boxSizing: 'border-box',
  background: 'rgba(255,255,255,0.04)', border: C.border, borderRadius: 11,
  fontSize: 15, color: C.text, fontFamily: "'Inter', sans-serif", outline: 'none',
};
const labelStyle = { display: 'block', fontSize: 12, fontWeight: 700, color: C.faint, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 7 };

export default function BookTable() {
  const router = useRouter();
  const { subdomain } = router.query;

  const [form, setForm] = useState({ name: '', phone: '', partySize: '2', date: '', time: '', note: '' });
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');

  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    if (!form.name.trim()) return setError('Please enter your name');
    if (form.phone.replace(/\D/g, '').length < 10) return setError('Please enter a valid phone number');
    if (!form.date) return setError('Please pick a date');
    if (!form.time) return setError('Please pick a time');
    setBusy(true);
    try {
      const r = await fetch('/api/reservation/create', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subdomain, ...form }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j.ok) { setError(j.error || 'Could not submit. Try again.'); setBusy(false); return; }
      setDone(true);
    } catch {
      setError('Network error. Try again.');
    } finally { setBusy(false); }
  };

  const todayKey = new Date(Date.now() + 5.5 * 3600 * 1000).toISOString().slice(0, 10);

  return (
    <>
      <Head>
        <title>Book a table</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link href="https://fonts.googleapis.com/css2?family=Poppins:wght@600;700;800&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet" />
      </Head>
      <div style={{ minHeight: '100vh', background: C.bg, color: C.text, fontFamily: "'Inter', sans-serif", display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
        <div style={{ width: '100%', maxWidth: 440 }}>
          {done ? (
            <div style={{ background: C.card, border: C.border, borderRadius: 18, padding: '40px 28px', textAlign: 'center' }}>
              <div style={{ width: 56, height: 56, borderRadius: '50%', margin: '0 auto 18px', background: 'linear-gradient(135deg,#E05A3A,#F79B3D)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 28 }}>✓</div>
              <div style={{ fontFamily: "'Poppins',sans-serif", fontWeight: 800, fontSize: 22, marginBottom: 8 }}>Request received</div>
              <div style={{ color: C.dim, fontSize: 14, lineHeight: 1.6 }}>
                We've got your booking request for <b style={{ color: C.text }}>{form.partySize}</b> on <b style={{ color: C.text }}>{form.date}</b> at <b style={{ color: C.text }}>{form.time}</b>. The restaurant will confirm shortly on <b style={{ color: C.text }}>{form.phone}</b>.
              </div>
            </div>
          ) : (
            <form onSubmit={submit} style={{ background: C.card, border: C.border, borderRadius: 18, padding: '28px 24px' }}>
              <div style={{ fontFamily: "'Poppins',sans-serif", fontWeight: 800, fontSize: 24, marginBottom: 4 }}>Book a table</div>
              <div style={{ color: C.dim, fontSize: 13.5, marginBottom: 22, lineHeight: 1.5 }}>Tell us when you're coming — we'll confirm your table.</div>

              {error && <div style={{ background: 'rgba(217,83,79,0.12)', border: '1px solid rgba(217,83,79,0.3)', color: '#E78', borderRadius: 10, padding: '10px 14px', fontSize: 13, marginBottom: 16 }}>{error}</div>}

              <div style={{ marginBottom: 14 }}>
                <label style={labelStyle}>Your name</label>
                <input style={inputStyle} value={form.name} onChange={set('name')} placeholder="e.g. Priya" />
              </div>
              <div style={{ marginBottom: 14 }}>
                <label style={labelStyle}>Phone</label>
                <input style={inputStyle} type="tel" value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value.replace(/\D/g, '').slice(0, 10) }))} placeholder="10-digit mobile" />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 14 }}>
                <div>
                  <label style={labelStyle}>Guests</label>
                  <input style={inputStyle} type="number" min="1" max="50" value={form.partySize} onChange={set('partySize')} />
                </div>
                <div>
                  <label style={labelStyle}>Date</label>
                  <input style={inputStyle} type="date" min={todayKey} value={form.date} onChange={set('date')} />
                </div>
                <div>
                  <label style={labelStyle}>Time</label>
                  <input style={inputStyle} type="time" value={form.time} onChange={set('time')} />
                </div>
              </div>
              <div style={{ marginBottom: 20 }}>
                <label style={labelStyle}>Note <span style={{ textTransform: 'none', fontWeight: 400 }}>(optional)</span></label>
                <input style={inputStyle} value={form.note} onChange={set('note')} placeholder="e.g. window seat, birthday" />
              </div>
              <button type="submit" disabled={busy} style={{
                width: '100%', padding: '15px', borderRadius: 12, border: 'none',
                background: 'linear-gradient(135deg,#E05A3A,#F79B3D)', color: '#fff',
                fontSize: 16, fontWeight: 800, fontFamily: "'Poppins',sans-serif", cursor: busy ? 'not-allowed' : 'pointer',
                opacity: busy ? 0.6 : 1, boxShadow: '0 8px 28px rgba(247,155,61,0.35)',
              }}>{busy ? 'Submitting…' : 'Request booking'}</button>
            </form>
          )}
        </div>
      </div>
    </>
  );
}

BookTable.getLayout = (page) => page;
