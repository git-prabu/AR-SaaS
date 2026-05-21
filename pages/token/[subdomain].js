// pages/token/[subdomain].js
//
// Phase 2 #9 — public counter/queue display. Big "Now Serving" board
// for QSR / counter-service formats: mount a screen near the counter,
// open this URL, customers watch for their token number.
//
// Public + no auth. Polls /api/token/[subdomain] every few seconds
// (can't use a live Firestore listener — orders aren't publicly
// listable post-C2; the endpoint returns only token numbers). Warm
// app palette + huge numbers for across-the-room readability.
import Head from 'next/head';
import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/router';

const POLL_MS = 6000;

export default function TokenDisplay() {
  const router = useRouter();
  const { subdomain } = router.query;

  const [data, setData] = useState({ restaurantName: '', nowServing: [], preparing: [] });
  const [err, setErr] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const poll = useCallback(async () => {
    if (!subdomain) return;
    try {
      const r = await fetch(`/api/token/${encodeURIComponent(subdomain)}`, { cache: 'no-store' });
      if (!r.ok) { setErr(true); setLoaded(true); return; }
      const j = await r.json();
      setData({ restaurantName: j.restaurantName || '', nowServing: j.nowServing || [], preparing: j.preparing || [] });
      setErr(false); setLoaded(true);
    } catch { setErr(true); setLoaded(true); }
  }, [subdomain]);

  useEffect(() => {
    if (!subdomain) return;
    poll();
    const t = setInterval(poll, POLL_MS);
    // Refresh immediately when the tab regains focus (e.g. screen wakes).
    const onVis = () => { if (!document.hidden) poll(); };
    document.addEventListener('visibilitychange', onVis);
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', onVis); };
  }, [subdomain, poll]);

  const { restaurantName, nowServing, preparing } = data;

  return (
    <>
      <Head>
        <title>{restaurantName ? `${restaurantName} — Now Serving` : 'Now Serving'}</title>
        <meta name="robots" content="noindex,nofollow" />
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />
        <link href="https://fonts.googleapis.com/css2?family=Poppins:wght@600;700;800;900&family=Inter:wght@500;600;700&display=swap" rel="stylesheet" />
      </Head>
      <div style={{
        minHeight: '100vh', background: '#0D0B08', color: '#FFF5E8',
        fontFamily: "'Inter', sans-serif", display: 'flex', flexDirection: 'column',
        padding: 'clamp(20px, 4vw, 56px)', boxSizing: 'border-box',
      }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 'clamp(20px,3vw,40px)' }}>
          <div style={{ fontFamily: "'Poppins', sans-serif", fontWeight: 800, fontSize: 'clamp(20px,2.6vw,34px)', color: '#FFF5E8' }}>
            {restaurantName || 'Order Status'}
          </div>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 9, fontSize: 'clamp(11px,1.2vw,14px)', color: 'rgba(255,245,232,0.5)', fontWeight: 600 }}>
            <span style={{ width: 9, height: 9, borderRadius: '50%', background: err ? '#D9534F' : '#5DA068', boxShadow: err ? 'none' : '0 0 10px #5DA068' }} />
            {err ? 'Reconnecting…' : 'Live'}
          </div>
        </div>

        {/* Now Serving — the hero board */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
          <div style={{
            fontFamily: "'Poppins', sans-serif", fontWeight: 700,
            fontSize: 'clamp(16px,2vw,26px)', letterSpacing: '0.16em', textTransform: 'uppercase',
            color: '#F79B3D', marginBottom: 'clamp(14px,2vw,28px)',
            display: 'inline-flex', alignItems: 'center', gap: 12,
          }}>
            <span style={{ width: 12, height: 12, borderRadius: '50%', background: '#F79B3D', boxShadow: '0 0 16px #F79B3D' }} />
            Ready — please collect
          </div>

          {!loaded ? (
            <div style={{ color: 'rgba(255,245,232,0.4)', fontSize: 'clamp(16px,2vw,22px)' }}>Loading…</div>
          ) : nowServing.length === 0 ? (
            <div style={{ color: 'rgba(255,245,232,0.35)', fontSize: 'clamp(18px,2.4vw,28px)', fontWeight: 600 }}>
              No orders ready right now.
            </div>
          ) : (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'clamp(14px,1.6vw,26px)' }}>
              {nowServing.map(n => (
                <div key={n} style={{
                  minWidth: 'clamp(120px,12vw,200px)', padding: 'clamp(18px,2.4vw,38px) clamp(20px,2.6vw,44px)',
                  borderRadius: 'clamp(14px,1.4vw,22px)',
                  background: 'linear-gradient(135deg,#E05A3A,#F79B3D)', color: '#1A1208',
                  textAlign: 'center', boxShadow: '0 12px 40px rgba(247,155,61,0.30)',
                }}>
                  <div style={{ fontSize: 'clamp(10px,1vw,13px)', fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', opacity: 0.7 }}>Token</div>
                  <div style={{ fontFamily: "'Poppins', sans-serif", fontWeight: 900, fontSize: 'clamp(56px,8vw,120px)', lineHeight: 1 }}>{n}</div>
                </div>
              ))}
            </div>
          )}

          {/* Preparing strip */}
          <div style={{ marginTop: 'auto', paddingTop: 'clamp(24px,4vw,48px)' }}>
            <div style={{
              fontSize: 'clamp(12px,1.3vw,16px)', fontWeight: 700, letterSpacing: '0.14em',
              textTransform: 'uppercase', color: 'rgba(255,245,232,0.5)', marginBottom: 'clamp(10px,1.4vw,18px)',
            }}>
              Preparing
            </div>
            {preparing.length === 0 ? (
              <div style={{ color: 'rgba(255,245,232,0.28)', fontSize: 'clamp(14px,1.6vw,20px)' }}>—</div>
            ) : (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'clamp(8px,1vw,14px)' }}>
                {preparing.map(n => (
                  <div key={n} style={{
                    minWidth: 'clamp(56px,5vw,88px)', padding: 'clamp(8px,1vw,16px)',
                    borderRadius: 'clamp(10px,1vw,16px)', textAlign: 'center',
                    background: 'rgba(255,245,232,0.06)', border: '1px solid rgba(255,245,232,0.12)',
                    fontFamily: "'Poppins', sans-serif", fontWeight: 800,
                    fontSize: 'clamp(26px,3.4vw,52px)', color: 'rgba(255,245,232,0.78)',
                  }}>{n}</div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

// Full-bleed display — no admin chrome.
TokenDisplay.getLayout = (page) => page;
