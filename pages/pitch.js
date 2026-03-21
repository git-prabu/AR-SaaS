import Head from 'next/head';
import { useState, useEffect, useRef, useCallback } from 'react';

/* ─── Auth ─────────────────────────────────────────────────── */
const PASS = 'RADICAL25';

/* ─── Colour tokens ─────────────────────────────────────────── */
const C = {
  bg: '#050408',
  gold: '#D4A843',
  goldLt: '#F0D88A',
  goldDk: '#8B6B14',
  cream: '#F2ECD8',
  dim: 'rgba(242,236,216,0.42)',
  dimmer: 'rgba(242,236,216,0.22)',
  glass: 'rgba(18,14,28,0.72)',
  border: 'rgba(212,168,67,0.22)',
  borderHi: 'rgba(212,168,67,0.55)',
};

const SLIDES = 10;

/* ════════════════════════════════════════════════════════════ */
export default function Pitch() {
  const [authed, setAuthed] = useState(false);
  const [pass, setPass] = useState('');
  const [passErr, setPassErr] = useState(false);
  const [cur, setCur] = useState(0);
  const [dir, setDir] = useState(1);
  const [show, setShow] = useState(true);
  const [mouse, setMouse] = useState({ x: 0, y: 0 });
  const transitioning = useRef(false);
  const canvasRef = useRef(null);
  const containerRef = useRef(null);

  /* ── Mouse parallax ── */
  useEffect(() => {
    if (!authed) return;
    const h = (e) => setMouse({
      x: (e.clientX / window.innerWidth - 0.5) * 2,
      y: (e.clientY / window.innerHeight - 0.5) * 2,
    });
    window.addEventListener('mousemove', h);
    return () => window.removeEventListener('mousemove', h);
  }, [authed]);

  /* ── Canvas particles ── */
  useEffect(() => {
    if (!authed) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const resize = () => { canvas.width = window.innerWidth; canvas.height = window.innerHeight; };
    resize();
    window.addEventListener('resize', resize);

    const N = 90;
    const pts = Array.from({ length: N }, () => ({
      x: Math.random() * window.innerWidth,
      y: Math.random() * window.innerHeight,
      vx: (Math.random() - 0.5) * 0.25,
      vy: (Math.random() - 0.5) * 0.25,
      r: Math.random() * 1.5 + 0.4,
      o: Math.random() * 0.35 + 0.08,
    }));

    let raf;
    const tick = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      pts.forEach(p => {
        p.x += p.vx; p.y += p.vy;
        if (p.x < 0 || p.x > canvas.width) p.vx *= -1;
        if (p.y < 0 || p.y > canvas.height) p.vy *= -1;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(212,168,67,${p.o})`;
        ctx.fill();
      });
      // faint connecting lines
      for (let i = 0; i < pts.length; i++) {
        for (let j = i + 1; j < pts.length; j++) {
          const dx = pts[i].x - pts[j].x, dy = pts[i].y - pts[j].y;
          const d = Math.sqrt(dx * dx + dy * dy);
          if (d < 120) {
            ctx.beginPath();
            ctx.moveTo(pts[i].x, pts[i].y);
            ctx.lineTo(pts[j].x, pts[j].y);
            ctx.strokeStyle = `rgba(212,168,67,${0.06 * (1 - d / 120)})`;
            ctx.lineWidth = 0.5;
            ctx.stroke();
          }
        }
      }
      raf = requestAnimationFrame(tick);
    };
    tick();
    return () => { cancelAnimationFrame(raf); window.removeEventListener('resize', resize); };
  }, [authed]);

  /* ── Navigation ── */
  const goTo = useCallback((n) => {
    if (transitioning.current || n < 0 || n >= SLIDES) return;
    transitioning.current = true;
    setDir(n > cur ? 1 : -1);
    setShow(false);
    setTimeout(() => { setCur(n); setShow(true); setTimeout(() => { transitioning.current = false; }, 520); }, 290);
  }, [cur]);

  const next = useCallback(() => goTo(cur + 1), [goTo, cur]);
  const prev = useCallback(() => goTo(cur - 1), [goTo, cur]);

  useEffect(() => {
    const k = (e) => {
      if (!authed) return;
      if (['ArrowDown', 'ArrowRight', ' '].includes(e.key)) { e.preventDefault(); next(); }
      if (['ArrowUp', 'ArrowLeft'].includes(e.key)) { e.preventDefault(); prev(); }
    };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [authed, next, prev]);

  useEffect(() => {
    if (!authed) return;
    let last = 0;
    const h = (e) => {
      e.preventDefault();
      const now = Date.now();
      if (now - last < 750) return;
      last = now;
      e.deltaY > 0 ? next() : prev();
    };
    let ts = 0;
    const ts_ = (e) => { ts = e.touches[0].clientY; };
    const te_ = (e) => {
      const dy = ts - e.changedTouches[0].clientY;
      if (Math.abs(dy) < 50) return;
      dy > 0 ? next() : prev();
    };
    const el = containerRef.current;
    el?.addEventListener('wheel', h, { passive: false });
    el?.addEventListener('touchstart', ts_, { passive: true });
    el?.addEventListener('touchend', te_, { passive: true });
    return () => {
      el?.removeEventListener('wheel', h);
      el?.removeEventListener('touchstart', ts_);
      el?.removeEventListener('touchend', te_);
    };
  }, [authed, next, prev]);

  /* ── Slide transition style ── */
  const S = {
    position: 'absolute', inset: 0,
    opacity: show ? 1 : 0,
    transform: show ? 'translateY(0) scale(1)' : `translateY(${dir * 40}px) scale(0.98)`,
    transition: 'opacity 0.38s cubic-bezier(0.16,1,0.3,1), transform 0.42s cubic-bezier(0.16,1,0.3,1)',
    display: 'flex', flexDirection: 'column',
    alignItems: 'center', justifyContent: 'center',
  };

  /* ── 3D tilt helper ── */
  const tilt = (xFactor = 8, yFactor = 6) => ({
    transform: `perspective(900px) rotateY(${mouse.x * xFactor}deg) rotateX(${-mouse.y * yFactor}deg)`,
    transition: 'transform 0.18s ease-out',
  });

  /* ── Password gate ── */
  if (!authed) return (
    <>
      <Head>
        <title>Advert Radical — Deck</title>
        <link href="https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Cormorant+Garamond:ital,wght@0,400;0,500;0,600;1,400;1,500&display=swap" rel="stylesheet" />
      </Head>
      <div style={{ minHeight: '100vh', background: C.bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <style>{`
          @keyframes shake { 0%,100%{transform:translateX(0)} 25%,75%{transform:translateX(-10px)} 50%{transform:translateX(10px)} }
          .pin { width:100%; padding:16px 22px; background:rgba(212,168,67,0.06); border:1.5px solid rgba(212,168,67,0.2); border-radius:12px; font-size:18px; color:${C.cream}; font-family:'Cormorant Garamond',serif; letter-spacing:0.22em; text-align:center; outline:none; }
          .pin:focus { border-color:rgba(212,168,67,0.6); background:rgba(212,168,67,0.1); }
          .pin.err { animation:shake 0.4s ease; border-color:#C44; }
          .pgo { width:100%; padding:16px; border-radius:12px; border:none; background:linear-gradient(135deg,${C.goldDk},${C.gold}); color:${C.bg}; font-size:15px; font-weight:700; cursor:pointer; letter-spacing:0.1em; font-family:'Cormorant Garamond',serif; margin-top:14px; }
        `}</style>
        <div style={{ width: 360, textAlign: 'center' }}>
          <div style={{ fontFamily: 'Bebas Neue,sans-serif', fontSize: 38, letterSpacing: '0.12em', color: C.cream, marginBottom: 4 }}>ADVERT RADICAL</div>
          <div style={{ fontFamily: 'Cormorant Garamond,serif', fontStyle: 'italic', fontSize: 14, color: C.dim, marginBottom: 40, letterSpacing: '0.08em' }}>Confidential · Investor Deck</div>
          <input className={`pin${passErr ? ' err' : ''}`} type="password" placeholder="ACCESS CODE" value={pass}
            onChange={e => setPass(e.target.value)} onKeyDown={e => e.key === 'Enter' && (pass.trim().toUpperCase() === PASS ? setAuthed(true) : (setPassErr(true), setTimeout(() => setPassErr(false), 600)))} />
          <button className="pgo" onClick={() => pass.trim().toUpperCase() === PASS ? setAuthed(true) : (setPassErr(true), setTimeout(() => setPassErr(false), 600))}>ENTER →</button>
          {passErr && <div style={{ color: '#E05A3A', fontSize: 13, marginTop: 10, fontFamily: 'Cormorant Garamond,serif' }}>Incorrect access code</div>}
        </div>
      </div>
    </>
  );

  /* ════════════ SLIDES ════════════ */
  const slides = [

    /* ─── 00 TITLE ─────────────────────────────── */
    <div key="s0" style={{ ...S, textAlign: 'center', overflow: 'hidden', padding: '0 60px' }}>
      <div style={{ position: 'absolute', inset: 0, background: `radial-gradient(ellipse at 60% 30%, rgba(212,168,67,0.12) 0%, transparent 55%), radial-gradient(ellipse at 20% 80%, rgba(212,168,67,0.07) 0%, transparent 50%)` }} />
      {/* Huge background text */}
      <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', fontFamily: 'Bebas Neue,sans-serif', fontSize: 'clamp(180px,22vw,280px)', letterSpacing: '-0.02em', color: 'rgba(212,168,67,0.04)', lineHeight: 0.85, whiteSpace: 'nowrap', pointerEvents: 'none', userSelect: 'none' }}>AR MENU</div>

      <div style={{ position: 'relative', zIndex: 2, ...tilt(6, 4) }}>
        <div style={{ fontFamily: 'Cormorant Garamond,serif', fontStyle: 'italic', fontSize: 'clamp(13px,1.3vw,16px)', letterSpacing: '0.25em', color: C.gold, marginBottom: 28, textTransform: 'uppercase' }}>
          Advert Radical · AR + AI Revenue Platform
        </div>
        <h1 style={{ fontFamily: 'Bebas Neue,sans-serif', fontSize: 'clamp(72px,10vw,140px)', lineHeight: 0.88, letterSpacing: '0.04em', color: C.cream, margin: '0 0 8px' }}>
          THE MENU THAT
        </h1>
        <h1 style={{
          fontFamily: 'Bebas Neue,sans-serif', fontSize: 'clamp(72px,10vw,140px)', lineHeight: 0.88, letterSpacing: '0.04em', margin: '0 0 36px',
          background: `linear-gradient(90deg,${C.goldDk},${C.gold},${C.goldLt},${C.gold})`, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent'
        }}>
          MAKES THEM ORDER.
        </h1>
        <p style={{ fontFamily: 'Cormorant Garamond,serif', fontSize: 'clamp(17px,1.8vw,22px)', color: C.dim, maxWidth: 560, margin: '0 auto 52px', lineHeight: 1.7 }}>
          Augmented reality menus that let customers see their food in 3D before they order — turning curiosity into revenue.
        </p>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, color: C.dimmer, fontFamily: 'Cormorant Garamond,serif', fontStyle: 'italic', fontSize: 15 }}>
          <span>Scroll or press</span>
          <kbd style={{ padding: '3px 12px', border: `1px solid ${C.border}`, borderRadius: 6, fontSize: 12, fontFamily: 'Cormorant Garamond,serif', color: C.dim, fontStyle: 'normal', letterSpacing: '0.05em' }}>→</kbd>
          <span>to begin</span>
        </div>
      </div>
    </div>,

    /* ─── 01 THE PROBLEM ────────────────────────── */
    <div key="s1" style={{ ...S, overflow: 'hidden' }}>
      <div style={{ position: 'absolute', inset: 0, background: `radial-gradient(ellipse at 80% 50%, rgba(180,40,20,0.09) 0%, transparent 55%)` }} />
      <div style={{ position: 'relative', zIndex: 2, width: '100%', maxWidth: 1200, padding: '0 80px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 80, alignItems: 'center' }}>

        {/* Left — big type */}
        <div>
          <div style={{ fontFamily: 'Cormorant Garamond,serif', fontStyle: 'italic', fontSize: 14, letterSpacing: '0.22em', color: 'rgba(212,168,67,0.6)', marginBottom: 24, textTransform: 'uppercase' }}>The Problem</div>
          <div style={{ fontFamily: 'Bebas Neue,sans-serif', fontSize: 'clamp(56px,7vw,96px)', lineHeight: 0.88, letterSpacing: '0.03em', marginBottom: 32 }}>
            <div style={{ WebkitTextStroke: `2px ${C.dim}`, WebkitTextFillColor: 'transparent' }}>YOUR CUSTOMERS</div>
            <div style={{ color: C.cream }}>ARE ORDERING</div>
            <div style={{ WebkitTextStroke: `2px ${C.gold}`, WebkitTextFillColor: 'transparent' }}>BLIND.</div>
          </div>
          <p style={{ fontFamily: 'Cormorant Garamond,serif', fontSize: 'clamp(15px,1.5vw,19px)', color: C.dim, lineHeight: 1.75, maxWidth: 400 }}>
            A text-only menu tells a customer nothing about what the food looks like, the portion size, or the presentation. They guess — and they order the safe option.
          </p>
          <div style={{ marginTop: 36, padding: '20px 24px', background: 'rgba(212,168,67,0.06)', border: `1px solid ${C.border}`, borderRadius: 14 }}>
            <div style={{ fontFamily: 'Bebas Neue,sans-serif', fontSize: 42, color: C.gold, lineHeight: 1 }}>68%</div>
            <div style={{ fontFamily: 'Cormorant Garamond,serif', fontSize: 14, color: C.dim, marginTop: 4 }}>of diners are more likely to order a dish they can visualise first</div>
            <div style={{ fontFamily: 'Cormorant Garamond,serif', fontStyle: 'italic', fontSize: 12, color: C.dimmer, marginTop: 8 }}>National Restaurant Association Research</div>
          </div>
        </div>

        {/* Right — static menu mockup */}
        <div style={{ ...tilt(10, 7) }}>
          <div style={{ background: 'rgba(15,12,22,0.9)', border: `1px solid rgba(255,255,255,0.07)`, borderRadius: 20, overflow: 'hidden', boxShadow: '0 40px 80px rgba(0,0,0,0.6)' }}>
            <div style={{ background: 'rgba(255,255,255,0.04)', padding: '14px 22px', borderBottom: '1px solid rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontFamily: 'Cormorant Garamond,serif', fontWeight: 600, fontSize: 14, color: 'rgba(255,255,255,0.4)', letterSpacing: '0.08em' }}>MENU.PDF</span>
              <span style={{ fontSize: 10, padding: '3px 10px', borderRadius: 20, background: 'rgba(200,60,40,0.15)', color: 'rgba(220,80,60,0.8)', fontFamily: 'Cormorant Garamond,serif', letterSpacing: '0.1em' }}>TEXT ONLY</span>
            </div>
            {[['Chicken Biryani', '₹280'], ['Paneer Tikka Masala', '₹320'], ['Dal Makhani', '₹180'], ['Garlic Butter Naan', '₹60'], ['Mango Lassi', '₹120'], ['Gulab Jamun', '₹80']].map(([n, p], i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 22px', borderBottom: '1px solid rgba(255,255,255,0.035)' }}>
                <span style={{ fontFamily: 'Cormorant Garamond,serif', fontSize: 15, color: 'rgba(255,255,255,0.45)' }}>{n}</span>
                <span style={{ fontFamily: 'Cormorant Garamond,serif', fontWeight: 600, fontSize: 15, color: 'rgba(255,255,255,0.25)' }}>{p}</span>
              </div>
            ))}
            <div style={{ padding: '14px 22px', display: 'flex', alignItems: 'center', gap: 8, background: 'rgba(200,60,40,0.08)' }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#C44', display: 'inline-block' }} />
              <span style={{ fontFamily: 'Cormorant Garamond,serif', fontStyle: 'italic', fontSize: 13, color: 'rgba(200,80,60,0.7)' }}>No photos · No visuals · No context</span>
            </div>
          </div>
        </div>
      </div>
    </div>,

    /* ─── 02 THE STATEMENT ──────────────────────── */
    <div key="s2" style={{ ...S, textAlign: 'center', overflow: 'hidden' }}>
      <div style={{ position: 'absolute', inset: 0, background: `radial-gradient(ellipse at 50% 50%, rgba(212,168,67,0.1) 0%, transparent 60%)` }} />
      <div style={{ position: 'relative', zIndex: 2, ...tilt(5, 3) }}>
        <div style={{ fontFamily: 'Cormorant Garamond,serif', fontStyle: 'italic', fontSize: 'clamp(13px,1.2vw,16px)', letterSpacing: '0.24em', color: C.gold, marginBottom: 32, textTransform: 'uppercase' }}>The Solution</div>
        <div style={{ fontFamily: 'Bebas Neue,sans-serif', lineHeight: 0.82, letterSpacing: '0.04em' }}>
          <div style={{ fontSize: 'clamp(80px,13vw,180px)', WebkitTextStroke: `2px ${C.dim}`, WebkitTextFillColor: 'transparent' }}>SCAN.</div>
          <div style={{ fontSize: 'clamp(80px,13vw,180px)', color: C.gold, textShadow: `0 0 80px rgba(212,168,67,0.3)` }}>SEE.</div>
          <div style={{ fontSize: 'clamp(80px,13vw,180px)', WebkitTextStroke: `2px ${C.cream}`, WebkitTextFillColor: 'transparent' }}>ORDER MORE.</div>
        </div>
        <p style={{ fontFamily: 'Cormorant Garamond,serif', fontSize: 'clamp(16px,1.6vw,20px)', color: C.dim, maxWidth: 540, margin: '40px auto 0', lineHeight: 1.7 }}>
          Customers point their phone at your QR code. Their order appears in 3D on the table. AI suggests the perfect add-ons. Revenue goes up.
        </p>
      </div>
    </div>,

    /* ─── 03 THE EXPERIENCE (AR image) ─────────── */
    <div key="s3" style={{ ...S, overflow: 'hidden', padding: 0 }}>
      {/* Full-bleed image */}
      <div style={{ position: 'absolute', inset: 0, backgroundImage: "url('/ar-experience.png')", backgroundSize: 'cover', backgroundPosition: 'center' }} />
      <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(135deg, rgba(5,4,8,0.88) 0%, rgba(5,4,8,0.5) 50%, rgba(5,4,8,0.2) 100%)' }} />

      <div style={{ position: 'relative', zIndex: 2, width: '100%', maxWidth: 1200, padding: '0 80px', display: 'flex', alignItems: 'flex-end', paddingBottom: '80px', height: '100%', justifyContent: 'flex-start' }}>
        <div style={{ maxWidth: 560 }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '6px 16px', borderRadius: 30, background: 'rgba(212,168,67,0.15)', border: `1px solid ${C.border}`, marginBottom: 24 }}>
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: C.gold, display: 'inline-block' }} />
            <span style={{ fontFamily: 'Cormorant Garamond,serif', fontSize: 12, fontWeight: 600, color: C.gold, letterSpacing: '0.18em', textTransform: 'uppercase' }}>AR Live · Zero App Download</span>
          </div>
          <h2 style={{ fontFamily: 'Bebas Neue,sans-serif', fontSize: 'clamp(56px,7vw,96px)', lineHeight: 0.88, letterSpacing: '0.03em', color: C.cream, marginBottom: 20 }}>
            FOOD THAT LOOKS<br />
            <span style={{ background: `linear-gradient(90deg,${C.gold},${C.goldLt})`, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>REAL ENOUGH</span><br />
            TO ORDER.
          </h2>
          <p style={{ fontFamily: 'Cormorant Garamond,serif', fontSize: 'clamp(15px,1.5vw,19px)', color: 'rgba(242,236,216,0.65)', lineHeight: 1.75, maxWidth: 440 }}>
            Photorealistic 3D models land on the customer's actual table through their phone camera. No headset. No app. Just point, see, and order.
          </p>
        </div>
      </div>
    </div>,

    /* ─── 04 HOW IT WORKS ───────────────────────── */
    <div key="s4" style={{ ...S, overflow: 'hidden', padding: '60px 80px' }}>
      <div style={{ position: 'absolute', inset: 0, background: `radial-gradient(ellipse at 50% 0%, rgba(212,168,67,0.06) 0%, transparent 55%)` }} />
      <div style={{ position: 'relative', zIndex: 2, width: '100%', maxWidth: 1200 }}>
        <div style={{ textAlign: 'center', marginBottom: 56 }}>
          <div style={{ fontFamily: 'Cormorant Garamond,serif', fontStyle: 'italic', fontSize: 14, letterSpacing: '0.22em', color: C.gold, marginBottom: 16, textTransform: 'uppercase' }}>How It Works</div>
          <div style={{ fontFamily: 'Bebas Neue,sans-serif', fontSize: 'clamp(44px,5.5vw,72px)', letterSpacing: '0.04em', color: C.cream, lineHeight: 0.9 }}>LIVE IN 5 MINUTES.</div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 24 }}>
          {[
            { n: '01', title: 'Upload Your Menu', body: 'Add your dishes, photos and prices to the dashboard. No design skills needed — takes under 5 minutes.', icon: '📋' },
            { n: '02', title: 'Print Your QR Codes', body: 'Your branded QR code is generated instantly. One per table. Stick it on and your AR menu is live.', icon: '🖨️' },
            { n: '03', title: 'Watch Orders Rise', body: 'Customers scan, see food in 3D, get AI suggestions, and order more. You track it all in real time.', icon: '📈' },
          ].map((s, i) => (
            <div key={i} style={{ ...tilt(7, 5), transformOrigin: i === 0 ? 'left center' : i === 2 ? 'right center' : 'center' }}>
              <div style={{ background: C.glass, border: `1px solid ${C.border}`, borderRadius: 24, padding: 36, backdropFilter: 'blur(20px)', boxShadow: '0 24px 60px rgba(0,0,0,0.45)', position: 'relative', overflow: 'hidden' }}>
                <div style={{ position: 'absolute', top: 20, right: 24, fontFamily: 'Bebas Neue,sans-serif', fontSize: 80, color: 'rgba(212,168,67,0.07)', lineHeight: 1, letterSpacing: '0.02em' }}>{s.n}</div>
                <div style={{ width: 52, height: 52, borderRadius: 16, background: 'rgba(212,168,67,0.1)', border: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24, marginBottom: 20 }}>{s.icon}</div>
                <div style={{ fontFamily: 'Bebas Neue,sans-serif', fontSize: 22, letterSpacing: '0.06em', color: C.cream, marginBottom: 12 }}>{s.title}</div>
                <p style={{ fontFamily: 'Cormorant Garamond,serif', fontSize: 15, color: C.dim, lineHeight: 1.75, margin: 0 }}>{s.body}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>,

    /* ─── 05 FEATURES ───────────────────────────── */
    <div key="s5" style={{ ...S, overflow: 'hidden', padding: '60px 80px' }}>
      <div style={{ position: 'absolute', inset: 0, background: `radial-gradient(ellipse at 30% 70%, rgba(212,168,67,0.06) 0%, transparent 50%), radial-gradient(ellipse at 70% 20%, rgba(100,80,180,0.05) 0%, transparent 50%)` }} />
      <div style={{ position: 'relative', zIndex: 2, width: '100%', maxWidth: 1200 }}>
        <div style={{ textAlign: 'center', marginBottom: 48 }}>
          <div style={{ fontFamily: 'Cormorant Garamond,serif', fontStyle: 'italic', fontSize: 14, letterSpacing: '0.22em', color: C.gold, marginBottom: 16, textTransform: 'uppercase' }}>Platform</div>
          <div style={{ fontFamily: 'Bebas Neue,sans-serif', fontSize: 'clamp(40px,5vw,68px)', letterSpacing: '0.04em', color: C.cream, lineHeight: 0.9 }}>EVERYTHING. IN ONE PLATFORM.</div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 16 }}>
          {[
            { icon: '🥽', title: 'AR Visualisation', body: 'Dishes appear life-size in 3D on the customer\'s table.' },
            { icon: '🤖', title: 'AI Upselling', body: 'Claude AI suggests the perfect add-ons at the right moment.' },
            { icon: '📱', title: 'Instant QR Menus', body: 'Per-table QR codes. Menu loads in under 2 seconds.' },
            { icon: '📊', title: 'Live Analytics', body: 'See which dishes get viewed and what drives orders.' },
            { icon: '🔔', title: 'Waiter Call System', body: 'Customers request service. Staff notified instantly.' },
            { icon: '⚡', title: '5-Minute Setup', body: 'Upload, print QR codes, go live. No tech skills needed.' },
          ].map((f, i) => (
            <div key={i} onMouseEnter={e => { e.currentTarget.style.borderColor = C.borderHi; e.currentTarget.style.background = 'rgba(212,168,67,0.07)'; }} onMouseLeave={e => { e.currentTarget.style.borderColor = C.border; e.currentTarget.style.background = C.glass; }}
              style={{ background: C.glass, border: `1px solid ${C.border}`, borderRadius: 18, padding: 26, backdropFilter: 'blur(16px)', transition: 'border-color 0.2s, background 0.2s', cursor: 'default' }}>
              <div style={{ fontSize: 26, marginBottom: 14 }}>{f.icon}</div>
              <div style={{ fontFamily: 'Bebas Neue,sans-serif', fontSize: 18, letterSpacing: '0.06em', color: C.cream, marginBottom: 8 }}>{f.title}</div>
              <p style={{ fontFamily: 'Cormorant Garamond,serif', fontSize: 14, color: C.dim, lineHeight: 1.7, margin: 0 }}>{f.body}</p>
            </div>
          ))}
        </div>
      </div>
    </div>,

    /* ─── 06 THE NUMBERS ────────────────────────── */
    <div key="s6" style={{ ...S, textAlign: 'center', overflow: 'hidden' }}>
      <div style={{ position: 'absolute', inset: 0, background: `radial-gradient(ellipse at 50% 50%, rgba(212,168,67,0.09) 0%, transparent 60%)` }} />
      <div style={{ position: 'relative', zIndex: 2, width: '100%', maxWidth: 1100, padding: '0 80px' }}>
        <div style={{ fontFamily: 'Cormorant Garamond,serif', fontStyle: 'italic', fontSize: 14, letterSpacing: '0.22em', color: C.gold, marginBottom: 48, textTransform: 'uppercase' }}>The Impact</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 2 }}>
          {[
            { num: '68%', label: 'of diners more likely to order a dish they can see first', src: 'National Restaurant Association' },
            { num: '3×', label: 'more add-ons ordered when food is visualised before ordering', src: 'Menu Engineering Research' },
            { num: '26%', label: 'average increase in order value with AR-enabled menus', src: 'Visual Commerce Study 2024' },
          ].map((s, i) => (
            <div key={i} style={{ padding: '48px 40px', borderLeft: i > 0 ? `1px solid rgba(212,168,67,0.12)` : 'none' }}>
              <div style={{
                fontFamily: 'Bebas Neue,sans-serif', fontSize: 'clamp(64px,9vw,120px)', lineHeight: 0.85, letterSpacing: '0.02em',
                background: `linear-gradient(135deg,${C.goldDk},${C.gold},${C.goldLt})`, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
                marginBottom: 20
              }}>{s.num}</div>
              <div style={{ fontFamily: 'Cormorant Garamond,serif', fontSize: 'clamp(15px,1.4vw,18px)', color: C.dim, lineHeight: 1.65, marginBottom: 12 }}>{s.label}</div>
              <div style={{ fontFamily: 'Cormorant Garamond,serif', fontStyle: 'italic', fontSize: 12, color: C.dimmer }}>{s.src}</div>
            </div>
          ))}
        </div>
        <div style={{ marginTop: 48, height: '1px', background: `linear-gradient(90deg,transparent,${C.border},transparent)` }} />
        <p style={{ fontFamily: 'Cormorant Garamond,serif', fontStyle: 'italic', fontSize: 'clamp(18px,2vw,26px)', color: C.dim, marginTop: 40, lineHeight: 1.6 }}>
          "Customers who see their food before ordering spend more. Always."
        </p>
      </div>
    </div>,

    /* ─── 07 MARKET ─────────────────────────────── */
    <div key="s7" style={{ ...S, textAlign: 'center', overflow: 'hidden' }}>
      <div style={{ position: 'absolute', inset: 0, background: `radial-gradient(ellipse at 40% 60%, rgba(100,80,180,0.06) 0%, transparent 55%), radial-gradient(ellipse at 65% 25%, rgba(212,168,67,0.08) 0%, transparent 50%)` }} />
      <div style={{ position: 'relative', zIndex: 2, width: '100%', maxWidth: 1060, padding: '0 80px' }}>
        <div style={{ fontFamily: 'Cormorant Garamond,serif', fontStyle: 'italic', fontSize: 14, letterSpacing: '0.22em', color: C.gold, marginBottom: 20, textTransform: 'uppercase' }}>The Opportunity</div>
        <div style={{ fontFamily: 'Bebas Neue,sans-serif', fontSize: 'clamp(40px,5vw,64px)', letterSpacing: '0.04em', color: C.cream, lineHeight: 0.9, marginBottom: 56 }}>
          INDIA'S RESTAURANTS ARE READY.<br />
          <span style={{ WebkitTextStroke: `2px rgba(212,168,67,0.4)`, WebkitTextFillColor: 'transparent' }}>AR IS NOT HERE YET.</span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 20 }}>
          {[
            { stat: '₹5.5L Cr', label: 'India restaurant industry size', sub: 'Growing at 9% annually · NRAI 2024' },
            { stat: '7.5M+', label: 'Restaurants across India', sub: 'Less than 0.1% use AR menus today' },
            { stat: 'First', label: 'AR menu platform built for India', sub: 'Vernacular, mobile-first, 5-min setup' },
          ].map(s => (
            <div key={s.stat} style={{ background: C.glass, border: `1px solid ${C.border}`, borderRadius: 24, padding: '36px 28px', backdropFilter: 'blur(16px)' }}>
              <div style={{
                fontFamily: 'Bebas Neue,sans-serif', fontSize: 'clamp(40px,5vw,60px)', letterSpacing: '0.02em',
                background: `linear-gradient(135deg,${C.gold},${C.goldLt})`, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
                lineHeight: 1, marginBottom: 16
              }}>{s.stat}</div>
              <div style={{ fontFamily: 'Cormorant Garamond,serif', fontWeight: 600, fontSize: 16, color: C.cream, marginBottom: 8 }}>{s.label}</div>
              <div style={{ fontFamily: 'Cormorant Garamond,serif', fontStyle: 'italic', fontSize: 13, color: C.dim }}>{s.sub}</div>
            </div>
          ))}
        </div>
      </div>
    </div>,

    /* ─── 08 PRICING ────────────────────────────── */
    <div key="s8" style={{ ...S, overflow: 'hidden', padding: '60px 80px' }}>
      <div style={{ position: 'absolute', inset: 0, background: `radial-gradient(ellipse at 50% 40%, rgba(212,168,67,0.07) 0%, transparent 55%)` }} />
      <div style={{ position: 'relative', zIndex: 2, width: '100%', maxWidth: 1060 }}>
        <div style={{ textAlign: 'center', marginBottom: 48 }}>
          <div style={{ fontFamily: 'Cormorant Garamond,serif', fontStyle: 'italic', fontSize: 14, letterSpacing: '0.22em', color: C.gold, marginBottom: 16, textTransform: 'uppercase' }}>Pricing</div>
          <div style={{ fontFamily: 'Bebas Neue,sans-serif', fontSize: 'clamp(40px,5vw,66px)', letterSpacing: '0.04em', color: C.cream, lineHeight: 0.9 }}>SIMPLE. TRANSPARENT. SCALABLE.</div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 20 }}>
          {[
            {
              name: 'Starter', price: '₹999', per: '/mo', glow: false, tag: null,
              features: ['20 menu items', 'QR code menu', 'AI Assistant', 'Basic analytics']
            },
            {
              name: 'Growth', price: '₹2,499', per: '/mo', glow: true, tag: 'Most Popular',
              features: ['60 menu items', 'AR food visualisation', 'AI upselling', 'Dish ratings', 'Waiter call system']
            },
            {
              name: 'Pro', price: '₹4,999', per: '/mo', glow: false, tag: null,
              features: ['150 menu items', 'CSV bulk import', 'Advanced analytics', 'Priority support', 'Custom branding']
            },
          ].map((p, i) => (
            <div key={p.name} style={{
              background: p.glow ? `linear-gradient(145deg,rgba(212,168,67,0.12),rgba(212,168,67,0.06))` : C.glass,
              border: `1.5px solid ${p.glow ? C.borderHi : C.border}`,
              borderRadius: 24, padding: '32px 28px', backdropFilter: 'blur(20px)',
              boxShadow: p.glow ? `0 0 60px rgba(212,168,67,0.12), 0 28px 60px rgba(0,0,0,0.4)` : '0 20px 50px rgba(0,0,0,0.35)',
              position: 'relative', transform: p.glow ? 'translateY(-8px)' : 'none',
            }}>
              {p.tag && (
                <div style={{ position: 'absolute', top: -14, left: '50%', transform: 'translateX(-50%)', padding: '5px 18px', background: `linear-gradient(135deg,${C.goldDk},${C.gold})`, color: C.bg, fontSize: 11, fontWeight: 700, borderRadius: 30, whiteSpace: 'nowrap', fontFamily: 'Cormorant Garamond,serif', letterSpacing: '0.08em' }}>
                  ✦ {p.tag}
                </div>
              )}
              <div style={{ fontFamily: 'Bebas Neue,sans-serif', fontSize: 22, letterSpacing: '0.1em', color: p.glow ? C.gold : C.cream, marginBottom: 4 }}>{p.name}</div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, marginBottom: 20, paddingBottom: 18, borderBottom: `1px solid ${p.glow ? 'rgba(212,168,67,0.2)' : 'rgba(242,236,216,0.08)'}` }}>
                <span style={{ fontFamily: 'Bebas Neue,sans-serif', fontSize: 42, color: C.cream, letterSpacing: '-0.01em', lineHeight: 1 }}>{p.price}</span>
                <span style={{ fontFamily: 'Cormorant Garamond,serif', fontSize: 14, color: C.dim }}>{p.per}</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {p.features.map(f => (
                  <div key={f} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ width: 16, height: 16, borderRadius: 5, background: `rgba(212,168,67,${p.glow ? '0.2' : '0.1'})`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, color: C.gold, flexShrink: 0 }}>✓</span>
                    <span style={{ fontFamily: 'Cormorant Garamond,serif', fontSize: 14, color: p.glow ? 'rgba(242,236,216,0.75)' : C.dim }}>{f}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
        <p style={{ textAlign: 'center', fontFamily: 'Cormorant Garamond,serif', fontStyle: 'italic', fontSize: 13, color: C.dimmer, marginTop: 24 }}>14-day free trial · No credit card required · Cancel anytime</p>
      </div>
    </div>,

    /* ─── 09 THE ASK / CLOSE ────────────────────── */
    <div key="s9" style={{ ...S, textAlign: 'center', overflow: 'hidden', padding: '0 80px' }}>
      <div style={{ position: 'absolute', inset: 0, background: `radial-gradient(ellipse at 50% 40%, rgba(212,168,67,0.13) 0%, transparent 55%)` }} />
      {/* Huge faint background number */}
      <div style={{ position: 'absolute', fontFamily: 'Bebas Neue,sans-serif', fontSize: '30vw', color: 'rgba(212,168,67,0.03)', lineHeight: 1, top: '50%', left: '50%', transform: 'translate(-50%,-50%)', userSelect: 'none', pointerEvents: 'none', whiteSpace: 'nowrap' }}>50</div>

      <div style={{ position: 'relative', zIndex: 2, maxWidth: 820, ...tilt(5, 3) }}>
        <div style={{ fontFamily: 'Cormorant Garamond,serif', fontStyle: 'italic', fontSize: 14, letterSpacing: '0.22em', color: C.gold, marginBottom: 20, textTransform: 'uppercase' }}>Founding Partner Programme</div>

        <h2 style={{ fontFamily: 'Bebas Neue,sans-serif', fontSize: 'clamp(56px,8vw,110px)', lineHeight: 0.88, letterSpacing: '0.04em', margin: '0 0 24px' }}>
          <span style={{ WebkitTextStroke: `2px ${C.dim}`, WebkitTextFillColor: 'transparent' }}>BE AMONG</span><br />
          <span style={{ background: `linear-gradient(90deg,${C.goldDk},${C.gold},${C.goldLt})`, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>THE FIRST 50.</span>
        </h2>

        <p style={{ fontFamily: 'Cormorant Garamond,serif', fontSize: 'clamp(16px,1.7vw,21px)', color: C.dim, lineHeight: 1.75, maxWidth: 580, margin: '0 auto 44px' }}>
          We're onboarding our first 50 founding partner restaurants in Chennai. Founding partners get locked-in pricing, 48-hour AR model creation, and a direct line to the founder.
        </p>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 16, marginBottom: 48 }}>
          {[
            { icon: '🔒', title: 'Locked-in pricing', body: 'Your rate never changes as we grow.' },
            { icon: '🥽', title: 'Priority AR setup', body: 'Your dishes in 3D within 48 hours.' },
            { icon: '📞', title: 'Direct founder access', body: 'Talk to Prabu, anytime.' },
          ].map(b => (
            <div key={b.title} style={{ background: 'rgba(212,168,67,0.06)', border: `1px solid ${C.border}`, borderRadius: 16, padding: '22px 18px' }}>
              <div style={{ fontSize: 22, marginBottom: 10 }}>{b.icon}</div>
              <div style={{ fontFamily: 'Bebas Neue,sans-serif', fontSize: 16, letterSpacing: '0.08em', color: C.cream, marginBottom: 6 }}>{b.title}</div>
              <div style={{ fontFamily: 'Cormorant Garamond,serif', fontSize: 13, color: C.dim }}>{b.body}</div>
            </div>
          ))}
        </div>

        <div style={{ display: 'flex', gap: 14, justifyContent: 'center', flexWrap: 'wrap', marginBottom: 40 }}>
          <a href="mailto:prabu@advertradical.com" style={{ padding: '16px 40px', borderRadius: 12, background: `linear-gradient(135deg,${C.goldDk},${C.gold})`, color: C.bg, fontFamily: 'Bebas Neue,sans-serif', fontSize: 17, letterSpacing: '0.1em', textDecoration: 'none', display: 'inline-block', boxShadow: `0 8px 32px rgba(212,168,67,0.3)` }}>
            GET STARTED →
          </a>
          <a href="https://ar-saa-s-kbzn.vercel.app/restaurant/spot" target="_blank" rel="noreferrer" style={{ padding: '16px 32px', borderRadius: 12, background: 'transparent', border: `1.5px solid ${C.border}`, color: C.dim, fontFamily: 'Bebas Neue,sans-serif', fontSize: 17, letterSpacing: '0.1em', textDecoration: 'none', display: 'inline-block' }}>
            SEE LIVE DEMO
          </a>
        </div>

        <div style={{ fontFamily: 'Cormorant Garamond,serif', fontSize: 15, color: C.dimmer }}>
          prabu@advertradical.com &nbsp;·&nbsp; Prabu · Founder, Advert Radical &nbsp;·&nbsp; Chennai
        </div>
      </div>
    </div>,
  ];

  /* ══ SHELL ══ */
  return (
    <>
      <Head>
        <title>Advert Radical — Deck</title>
        <link href="https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Cormorant+Garamond:ital,wght@0,400;0,500;0,600;1,400;1,500&display=swap" rel="stylesheet" />
        <meta name="robots" content="noindex,nofollow" />
      </Head>

      <div ref={containerRef} style={{ width: '100vw', height: '100vh', overflow: 'hidden', position: 'relative', background: C.bg, cursor: 'default' }}>
        <style>{`* { box-sizing:border-box; margin:0; padding:0; } a { text-decoration:none; } ::-webkit-scrollbar { display:none; }`}</style>

        {/* Particle canvas */}
        <canvas ref={canvasRef} style={{ position: 'fixed', inset: 0, zIndex: 0, pointerEvents: 'none' }} />

        {/* Slide content */}
        <div style={{ position: 'relative', width: '100%', height: '100%', zIndex: 1 }}>
          {slides[cur]}
        </div>

        {/* Progress — right side dots */}
        <div style={{ position: 'fixed', right: 24, top: '50%', transform: 'translateY(-50%)', display: 'flex', flexDirection: 'column', gap: 8, zIndex: 100 }}>
          {slides.map((_, i) => (
            <button key={i} onClick={() => goTo(i)} title={`Slide ${i + 1}`}
              style={{
                width: i === cur ? 5 : 4, height: i === cur ? 26 : 5, borderRadius: 99, border: 'none', cursor: 'pointer', padding: 0,
                transition: 'all 0.35s cubic-bezier(0.34,1.56,0.64,1)',
                background: i === cur ? C.gold : 'rgba(212,168,67,0.2)',
                boxShadow: i === cur ? `0 0 10px rgba(212,168,67,0.5)` : 'none'
              }} />
          ))}
        </div>

        {/* Counter */}
        <div style={{ position: 'fixed', bottom: 28, right: 28, fontFamily: 'Cormorant Garamond,serif', fontStyle: 'italic', fontSize: 13, color: 'rgba(212,168,67,0.35)', zIndex: 100, letterSpacing: '0.06em' }}>
          {String(cur + 1).padStart(2, '0')} / {String(SLIDES).padStart(2, '0')}
        </div>

        {/* Wordmark */}
        <div style={{ position: 'fixed', bottom: 28, left: 28, fontFamily: 'Bebas Neue,sans-serif', fontSize: 14, letterSpacing: '0.14em', color: 'rgba(212,168,67,0.25)', zIndex: 100 }}>
          ADVERT <span style={{ background: `linear-gradient(135deg,${C.goldDk},${C.gold})`, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>RADICAL</span>
        </div>

        {/* Nav arrows */}
        {cur > 0 && (
          <button onClick={prev} style={{ position: 'fixed', left: '50%', top: 24, transform: 'translateX(-50%)', width: 36, height: 36, borderRadius: '50%', border: `1px solid ${C.border}`, background: 'rgba(5,4,8,0.7)', color: C.dim, fontSize: 15, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, backdropFilter: 'blur(12px)' }}>↑</button>
        )}
        {cur < SLIDES - 1 && (
          <button onClick={next} style={{ position: 'fixed', left: '50%', bottom: 24, transform: 'translateX(-50%)', width: 36, height: 36, borderRadius: '50%', border: `1px solid ${C.border}`, background: 'rgba(5,4,8,0.7)', color: C.dim, fontSize: 15, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, backdropFilter: 'blur(12px)' }}>↓</button>
        )}
      </div>
    </>
  );
}