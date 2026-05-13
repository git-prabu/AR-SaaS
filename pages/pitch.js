import Head from 'next/head';
import { useState, useEffect, useRef, useCallback } from 'react';

/* ─── Auth ───────────────────────────────────────────────────────
   Access gate. The deck is at a public URL but lives behind a code
   so it doesn't leak before a sales conversation. */
const PASS = 'RADICAL25';

/* Total slide count — must match the length of the slides array
   below. Declared at module scope so the goTo() closure can read it
   without TDZ issues (the slides array itself can't be referenced
   from useCallback because it's built later in the render body). */
const SLIDE_COUNT = 14;

/* ─── Colour tokens — Premium Cinematic Gold ──────────────────────
   Richer, warmer, more saturated than the previous palette.
   Adds a copper accent that complements gold without competing —
   evokes Indian restaurant warmth + high-end whisky brand polish. */
const C = {
  /* Surfaces */
  bg:        '#0A0612',                 /* deep aubergine-black */
  bgLayer:   '#13091F',                 /* slightly purplish dark for layering */
  bgFar:     '#040208',                 /* near-pure black for vignette ends */

  /* Primary gold family — warmer + more saturated */
  gold:      '#E8B864',
  goldLt:    '#F8DD9C',
  goldDk:    '#8E6418',
  goldGlow:  'rgba(232,184,100,0.42)',

  /* Copper accent — sparingly used for emphasis chips, hover hints */
  copper:    '#D17A47',
  copperLt:  '#E89867',
  ember:     '#9B4321',

  /* Type */
  cream:     '#F5ECD7',
  creamLt:   '#FFFAF0',
  dim:       'rgba(245,236,215,0.55)',
  dimmer:    'rgba(245,236,215,0.32)',
  dimmest:   'rgba(245,236,215,0.18)',

  /* Glass / borders */
  glass:     'rgba(13,9,25,0.66)',
  glassWarm: 'rgba(232,184,100,0.06)',
  border:    'rgba(232,184,100,0.24)',
  borderHi:  'rgba(232,184,100,0.55)',
  borderCu:  'rgba(209,122,71,0.32)',
};

/* ════════════════════════════════════════════════════════════════ */
export default function Pitch() {
  const [authed, setAuthed] = useState(false);
  const [pass, setPass] = useState('');
  const [passErr, setPassErr] = useState(false);
  const [cur, setCur] = useState(0);
  const [dir, setDir] = useState(1);
  const [show, setShow] = useState(true);
  const [mouse, setMouse] = useState({ x: 0, y: 0 });
  const [reducedMotion, setReducedMotion] = useState(false);
  const transitioning = useRef(false);
  const canvasRef = useRef(null);
  const containerRef = useRef(null);

  /* ── Honor prefers-reduced-motion so the deck doesn't burn battery
       on tablets or trigger vestibular issues during demos. */
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReducedMotion(mq.matches);
    const fn = (e) => setReducedMotion(e.matches);
    mq.addEventListener?.('change', fn);
    return () => mq.removeEventListener?.('change', fn);
  }, []);

  /* ── Mouse parallax for tilt effects ── */
  useEffect(() => {
    if (!authed || reducedMotion) return;
    const h = (e) => setMouse({
      x: (e.clientX / window.innerWidth - 0.5) * 2,
      y: (e.clientY / window.innerHeight - 0.5) * 2,
    });
    window.addEventListener('mousemove', h);
    return () => window.removeEventListener('mousemove', h);
  }, [authed, reducedMotion]);

  /* ── Canvas particles + drifting glow orbs ── */
  useEffect(() => {
    if (!authed || reducedMotion) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const resize = () => { canvas.width = window.innerWidth; canvas.height = window.innerHeight; };
    resize();
    window.addEventListener('resize', resize);

    /* Small drifting particles — vary in size + tint (gold + copper). */
    const N = 110;
    const pts = Array.from({ length: N }, (_, i) => ({
      x: Math.random() * window.innerWidth,
      y: Math.random() * window.innerHeight,
      vx: (Math.random() - 0.5) * 0.22,
      vy: (Math.random() - 0.5) * 0.22,
      r: Math.random() * 1.6 + 0.4,
      o: Math.random() * 0.35 + 0.08,
      tint: i % 7 === 0 ? 'cu' : 'go',
    }));

    /* Larger, soft glow orbs that drift behind the particles. Adds
       depth without overwhelming the type. */
    const orbs = [
      { x: 0.2,  y: 0.3,  r: 220, c: 'rgba(232,184,100,0.10)', vx:  0.08, vy:  0.04 },
      { x: 0.78, y: 0.62, r: 280, c: 'rgba(209,122,71,0.08)',  vx: -0.06, vy:  0.07 },
      { x: 0.5,  y: 0.85, r: 200, c: 'rgba(232,184,100,0.05)', vx:  0.05, vy: -0.05 },
    ];

    let raf;
    const tick = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      /* Glow orbs first (behind everything) */
      orbs.forEach(o => {
        const cx = o.x * canvas.width;
        const cy = o.y * canvas.height;
        const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, o.r);
        grad.addColorStop(0, o.c);
        grad.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(cx, cy, o.r, 0, Math.PI * 2);
        ctx.fill();
        /* Drift */
        o.x += o.vx / canvas.width * 60;
        o.y += o.vy / canvas.height * 60;
        if (o.x < 0 || o.x > 1) o.vx *= -1;
        if (o.y < 0 || o.y > 1) o.vy *= -1;
      });

      /* Particles */
      pts.forEach(p => {
        p.x += p.vx; p.y += p.vy;
        if (p.x < 0 || p.x > canvas.width) p.vx *= -1;
        if (p.y < 0 || p.y > canvas.height) p.vy *= -1;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = p.tint === 'cu'
          ? `rgba(209,122,71,${p.o})`
          : `rgba(232,184,100,${p.o})`;
        ctx.fill();
      });

      /* Faint connecting lines between nearby particles */
      for (let i = 0; i < pts.length; i++) {
        for (let j = i + 1; j < pts.length; j++) {
          const dx = pts[i].x - pts[j].x, dy = pts[i].y - pts[j].y;
          const d2 = dx * dx + dy * dy;
          if (d2 < 14400) {
            const d = Math.sqrt(d2);
            ctx.beginPath();
            ctx.moveTo(pts[i].x, pts[i].y);
            ctx.lineTo(pts[j].x, pts[j].y);
            ctx.strokeStyle = `rgba(232,184,100,${0.06 * (1 - d / 120)})`;
            ctx.lineWidth = 0.5;
            ctx.stroke();
          }
        }
      }
      raf = requestAnimationFrame(tick);
    };
    tick();
    return () => { cancelAnimationFrame(raf); window.removeEventListener('resize', resize); };
  }, [authed, reducedMotion]);

  /* ── Navigation ── */
  const goTo = useCallback((n) => {
    if (transitioning.current || n < 0 || n >= SLIDE_COUNT) return;
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
      if (['ArrowDown', 'ArrowRight', ' ', 'PageDown'].includes(e.key)) { e.preventDefault(); next(); }
      if (['ArrowUp', 'ArrowLeft', 'PageUp'].includes(e.key)) { e.preventDefault(); prev(); }
      if (e.key === 'Home') { e.preventDefault(); goTo(0); }
      if (e.key === 'End')  { e.preventDefault(); goTo(SLIDE_COUNT - 1); }
    };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [authed, next, prev, goTo]);

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
  const tilt = (xFactor = 8, yFactor = 6) => reducedMotion ? {} : ({
    transform: `perspective(900px) rotateY(${mouse.x * xFactor}deg) rotateX(${-mouse.y * yFactor}deg)`,
    transition: 'transform 0.18s ease-out',
  });

  /* ── Section label helper — used at the top of most content slides */
  const sectionLabel = (txt) => (
    <div style={{ fontFamily: 'Cormorant Garamond,serif', fontStyle: 'italic', fontSize: 'clamp(13px,1.2vw,15px)', letterSpacing: '0.26em', color: C.gold, marginBottom: 18, textTransform: 'uppercase' }}>
      {txt}
    </div>
  );

  /* ── Big stacked-type headline helper ── */
  const headlineStyle = {
    fontFamily: 'Bebas Neue,sans-serif',
    lineHeight: 0.88,
    letterSpacing: '0.035em',
    margin: 0,
  };

  /* ── Password gate ── */
  if (!authed) return (
    <>
      <Head>
        <title>Advert Radical · Partner Brief</title>
        <link href="https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Cormorant+Garamond:ital,wght@0,400;0,500;0,600;1,400;1,500&display=swap" rel="stylesheet" />
        <meta name="robots" content="noindex,nofollow" />
      </Head>
      <div style={{ minHeight: '100vh', background: C.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative', overflow: 'hidden' }}>
        {/* Subtle ambient gradient behind the gate */}
        <div style={{ position: 'absolute', inset: 0, background: `radial-gradient(ellipse at 50% 35%, rgba(232,184,100,0.10) 0%, transparent 55%), radial-gradient(ellipse at 30% 80%, rgba(209,122,71,0.06) 0%, transparent 50%)` }} />
        <style>{`
          @keyframes shake { 0%,100%{transform:translateX(0)} 25%,75%{transform:translateX(-10px)} 50%{transform:translateX(10px)} }
          .pin { width:100%; padding:16px 22px; background:rgba(232,184,100,0.06); border:1.5px solid rgba(232,184,100,0.22); border-radius:12px; font-size:18px; color:${C.cream}; font-family:'Cormorant Garamond',serif; letter-spacing:0.22em; text-align:center; outline:none; }
          .pin:focus { border-color:rgba(232,184,100,0.65); background:rgba(232,184,100,0.1); }
          .pin.err { animation:shake 0.4s ease; border-color:#C44; }
          .pgo { width:100%; padding:16px; border-radius:12px; border:none; background:linear-gradient(135deg,${C.goldDk},${C.gold}); color:${C.bg}; font-size:15px; font-weight:700; cursor:pointer; letter-spacing:0.1em; font-family:'Cormorant Garamond',serif; margin-top:14px; }
          .pgo:hover { filter:brightness(1.08); }
        `}</style>
        <div style={{ width: 380, textAlign: 'center', position: 'relative', zIndex: 2 }}>
          <div style={{ fontFamily: 'Bebas Neue,sans-serif', fontSize: 40, letterSpacing: '0.14em', color: C.cream, marginBottom: 4 }}>ADVERT <span style={{ background: `linear-gradient(135deg,${C.goldDk},${C.gold},${C.goldLt})`, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>RADICAL</span></div>
          <div style={{ fontFamily: 'Cormorant Garamond,serif', fontStyle: 'italic', fontSize: 14, color: C.dim, marginBottom: 44, letterSpacing: '0.08em' }}>Partner Brief · Restricted Access</div>
          <input className={`pin${passErr ? ' err' : ''}`} type="password" placeholder="ACCESS CODE" value={pass}
            onChange={e => setPass(e.target.value)} onKeyDown={e => e.key === 'Enter' && (pass.trim().toUpperCase() === PASS ? setAuthed(true) : (setPassErr(true), setTimeout(() => setPassErr(false), 600)))} />
          <button className="pgo" onClick={() => pass.trim().toUpperCase() === PASS ? setAuthed(true) : (setPassErr(true), setTimeout(() => setPassErr(false), 600))}>ENTER →</button>
          {passErr && <div style={{ color: '#E05A3A', fontSize: 13, marginTop: 10, fontFamily: 'Cormorant Garamond,serif' }}>Incorrect access code</div>}
        </div>
      </div>
    </>
  );

  /* ════════════════════════════════════════════════════════════════
     SLIDES — 14 total. Each slide is its own JSX block inside
     the `slides` array. Order: Title → Problem → Solution →
     AR → AI → India → Journey → Operations → Menu → Payments+POS →
     Analytics → Numbers+ROI → Pricing → CTA.
     ════════════════════════════════════════════════════════════════ */
  const slides = [

    /* ─── 00 TITLE / HERO ──────────────────────────────────────── */
    <div key="s0" style={{ ...S, textAlign: 'center', overflow: 'hidden', padding: '0 60px' }}>
      <div style={{ position: 'absolute', inset: 0, background: `radial-gradient(ellipse at 60% 30%, rgba(232,184,100,0.13) 0%, transparent 55%), radial-gradient(ellipse at 20% 80%, rgba(209,122,71,0.08) 0%, transparent 50%)` }} />
      {/* Huge faint background headline */}
      <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', fontFamily: 'Bebas Neue,sans-serif', fontSize: 'clamp(180px,22vw,300px)', letterSpacing: '-0.02em', color: 'rgba(232,184,100,0.04)', lineHeight: 0.85, whiteSpace: 'nowrap', pointerEvents: 'none', userSelect: 'none' }}>AR MENU</div>

      <div style={{ position: 'relative', zIndex: 2, ...tilt(6, 4) }}>
        <div style={{ fontFamily: 'Cormorant Garamond,serif', fontStyle: 'italic', fontSize: 'clamp(13px,1.3vw,16px)', letterSpacing: '0.28em', color: C.gold, marginBottom: 28, textTransform: 'uppercase' }}>
          Advert Radical · AR + AI Revenue Platform
        </div>
        <h1 style={{ ...headlineStyle, fontSize: 'clamp(72px,10vw,140px)', color: C.cream, marginBottom: 8 }}>
          THE MENU THAT
        </h1>
        <h1 style={{
          ...headlineStyle, fontSize: 'clamp(72px,10vw,140px)', marginBottom: 36,
          background: `linear-gradient(90deg,${C.goldDk},${C.gold} 35%,${C.goldLt} 55%,${C.gold} 80%,${C.copperLt})`,
          WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
          filter: reducedMotion ? 'none' : 'drop-shadow(0 0 28px rgba(232,184,100,0.18))',
        }}>
          MAKES THEM ORDER.
        </h1>
        <p style={{ fontFamily: 'Cormorant Garamond,serif', fontSize: 'clamp(17px,1.8vw,22px)', color: C.dim, maxWidth: 580, margin: '0 auto 52px', lineHeight: 1.7 }}>
          Augmented reality menus that let your diners see their food in 3D before they order — turning curiosity into revenue.
        </p>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, color: C.dimmer, fontFamily: 'Cormorant Garamond,serif', fontStyle: 'italic', fontSize: 15 }}>
          <span>Scroll or press</span>
          <kbd style={{ padding: '3px 12px', border: `1px solid ${C.border}`, borderRadius: 6, fontSize: 12, fontFamily: 'Cormorant Garamond,serif', color: C.dim, fontStyle: 'normal', letterSpacing: '0.05em' }}>→</kbd>
          <span>to begin</span>
        </div>
      </div>
    </div>,

    /* ─── 01 THE PROBLEM ───────────────────────────────────────── */
    <div key="s1" style={{ ...S, overflow: 'hidden' }}>
      <div style={{ position: 'absolute', inset: 0, background: `radial-gradient(ellipse at 80% 50%, rgba(180,40,20,0.10) 0%, transparent 55%)` }} />
      <div style={{ position: 'relative', zIndex: 2, width: '100%', maxWidth: 1200, padding: '0 80px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 80, alignItems: 'center' }}>

        <div>
          {sectionLabel('The Problem')}
          <div style={{ ...headlineStyle, fontSize: 'clamp(56px,7vw,96px)', marginBottom: 32 }}>
            <div style={{ WebkitTextStroke: `2px ${C.dim}`, WebkitTextFillColor: 'transparent' }}>YOUR CUSTOMERS</div>
            <div style={{ color: C.cream }}>ARE ORDERING</div>
            <div style={{ WebkitTextStroke: `2px ${C.gold}`, WebkitTextFillColor: 'transparent' }}>BLIND.</div>
          </div>
          <p style={{ fontFamily: 'Cormorant Garamond,serif', fontSize: 'clamp(15px,1.5vw,19px)', color: C.dim, lineHeight: 1.75, maxWidth: 420 }}>
            A text-only menu tells a customer nothing about what the food looks like, the portion size, or the presentation. They guess — and they pick the safe option. You lose the upsell.
          </p>
          <div style={{ marginTop: 36, padding: '22px 24px', background: 'rgba(232,184,100,0.06)', border: `1px solid ${C.border}`, borderRadius: 14 }}>
            <div style={{ fontFamily: 'Bebas Neue,sans-serif', fontSize: 44, color: C.gold, lineHeight: 1, letterSpacing: '0.02em' }}>68%</div>
            <div style={{ fontFamily: 'Cormorant Garamond,serif', fontSize: 14, color: C.dim, marginTop: 4 }}>of diners are more likely to order a dish they can visualise first</div>
            <div style={{ fontFamily: 'Cormorant Garamond,serif', fontStyle: 'italic', fontSize: 12, color: C.dimmer, marginTop: 8 }}>National Restaurant Association Research</div>
          </div>
        </div>

        {/* Right — static text-only menu mockup */}
        <div style={{ ...tilt(10, 7) }}>
          <div style={{ background: 'rgba(15,12,22,0.92)', border: `1px solid rgba(255,255,255,0.07)`, borderRadius: 20, overflow: 'hidden', boxShadow: '0 40px 80px rgba(0,0,0,0.6)' }}>
            <div style={{ background: 'rgba(255,255,255,0.04)', padding: '14px 22px', borderBottom: '1px solid rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontFamily: 'Cormorant Garamond,serif', fontWeight: 600, fontSize: 14, color: 'rgba(255,255,255,0.4)', letterSpacing: '0.08em' }}>MENU.PDF</span>
              <span style={{ fontSize: 10, padding: '3px 10px', borderRadius: 20, background: 'rgba(200,60,40,0.16)', color: 'rgba(220,80,60,0.85)', fontFamily: 'Cormorant Garamond,serif', letterSpacing: '0.1em' }}>TEXT ONLY</span>
            </div>
            {[['Chicken Biryani', '₹280'], ['Paneer Tikka Masala', '₹320'], ['Dal Makhani', '₹180'], ['Garlic Butter Naan', '₹60'], ['Mango Lassi', '₹120'], ['Gulab Jamun', '₹80']].map(([n, p], i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 22px', borderBottom: '1px solid rgba(255,255,255,0.035)' }}>
                <span style={{ fontFamily: 'Cormorant Garamond,serif', fontSize: 15, color: 'rgba(255,255,255,0.45)' }}>{n}</span>
                <span style={{ fontFamily: 'Cormorant Garamond,serif', fontWeight: 600, fontSize: 15, color: 'rgba(255,255,255,0.25)' }}>{p}</span>
              </div>
            ))}
            <div style={{ padding: '14px 22px', display: 'flex', alignItems: 'center', gap: 8, background: 'rgba(200,60,40,0.08)' }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#C44', display: 'inline-block' }} />
              <span style={{ fontFamily: 'Cormorant Garamond,serif', fontStyle: 'italic', fontSize: 13, color: 'rgba(200,80,60,0.75)' }}>No photos · No visuals · No context</span>
            </div>
          </div>
        </div>
      </div>
    </div>,

    /* ─── 02 SOLUTION STATEMENT ──────────────────────────────────── */
    <div key="s2" style={{ ...S, textAlign: 'center', overflow: 'hidden' }}>
      <div style={{ position: 'absolute', inset: 0, background: `radial-gradient(ellipse at 50% 50%, rgba(232,184,100,0.12) 0%, transparent 60%)` }} />
      <div style={{ position: 'relative', zIndex: 2, ...tilt(5, 3) }}>
        {sectionLabel('The Solution')}
        <div style={{ ...headlineStyle, lineHeight: 0.82 }}>
          <div style={{ fontSize: 'clamp(80px,13vw,180px)', WebkitTextStroke: `2px ${C.dim}`, WebkitTextFillColor: 'transparent' }}>SCAN.</div>
          <div style={{ fontSize: 'clamp(80px,13vw,180px)', color: C.gold, textShadow: `0 0 80px rgba(232,184,100,0.35)` }}>SEE.</div>
          <div style={{ fontSize: 'clamp(80px,13vw,180px)', WebkitTextStroke: `2px ${C.cream}`, WebkitTextFillColor: 'transparent' }}>ORDER MORE.</div>
        </div>
        <p style={{ fontFamily: 'Cormorant Garamond,serif', fontSize: 'clamp(16px,1.6vw,20px)', color: C.dim, maxWidth: 560, margin: '40px auto 0', lineHeight: 1.7 }}>
          Diners point their phone at your QR code. Their order appears in 3D on the table. AI suggests the perfect add-ons. Revenue goes up.
        </p>
      </div>
    </div>,

    /* ─── 03 AR EXPERIENCE ────────────────────────────────────── */
    <div key="s3" style={{ ...S, overflow: 'hidden', padding: 0 }}>
      <div style={{ position: 'absolute', inset: 0, backgroundImage: "url('/ar-experience.png')", backgroundSize: 'cover', backgroundPosition: 'center' }} />
      {/* Stronger left-side gradient for the type to sit on */}
      <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(110deg, rgba(10,6,18,0.94) 0%, rgba(10,6,18,0.65) 40%, rgba(10,6,18,0.25) 70%, rgba(10,6,18,0.05) 100%)' }} />

      <div style={{ position: 'relative', zIndex: 2, width: '100%', maxWidth: 1200, padding: '0 80px', display: 'flex', alignItems: 'flex-end', paddingBottom: '80px', height: '100%', justifyContent: 'flex-start' }}>
        <div style={{ maxWidth: 580 }}>
          <div className="ar-pill" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '6px 16px', borderRadius: 30, background: 'rgba(232,184,100,0.18)', border: `1px solid ${C.borderHi}`, marginBottom: 24, backdropFilter: 'blur(8px)' }}>
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: C.gold, display: 'inline-block', boxShadow: `0 0 10px ${C.gold}` }} />
            <span style={{ fontFamily: 'Cormorant Garamond,serif', fontSize: 12, fontWeight: 600, color: C.gold, letterSpacing: '0.18em', textTransform: 'uppercase' }}>AR Live · Zero App Download</span>
          </div>
          <h2 style={{ ...headlineStyle, fontSize: 'clamp(56px,7vw,96px)', color: C.cream, marginBottom: 22 }}>
            FOOD THAT LOOKS<br />
            <span style={{ background: `linear-gradient(90deg,${C.gold},${C.goldLt},${C.copperLt})`, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>REAL ENOUGH</span><br />
            TO ORDER.
          </h2>
          <p style={{ fontFamily: 'Cormorant Garamond,serif', fontSize: 'clamp(15px,1.5vw,19px)', color: 'rgba(245,236,215,0.72)', lineHeight: 1.75, maxWidth: 460 }}>
            Photorealistic 3D models land on the customer's actual table through their phone camera. No headset. No app download. Just point, see, and order.
          </p>
        </div>
      </div>
    </div>,

    /* ─── 04 AI CONCIERGE ──────────────────────────────────────── */
    <div key="s4" style={{ ...S, overflow: 'hidden', padding: '60px 80px' }}>
      <div style={{ position: 'absolute', inset: 0, background: `radial-gradient(ellipse at 30% 30%, rgba(232,184,100,0.10) 0%, transparent 55%), radial-gradient(ellipse at 75% 75%, rgba(209,122,71,0.08) 0%, transparent 50%)` }} />
      <div style={{ position: 'relative', zIndex: 2, width: '100%', maxWidth: 1200 }}>
        <div style={{ textAlign: 'center', marginBottom: 50 }}>
          {sectionLabel('AI Concierge')}
          <div style={{ ...headlineStyle, fontSize: 'clamp(48px,6vw,84px)', color: C.cream }}>
            AN AI MAÎTRE D'<br />
            <span style={{ background: `linear-gradient(90deg,${C.gold},${C.goldLt})`, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>FOR EVERY DINER.</span>
          </div>
          <p style={{ fontFamily: 'Cormorant Garamond,serif', fontSize: 'clamp(15px,1.6vw,19px)', color: C.dim, maxWidth: 680, margin: '20px auto 0', lineHeight: 1.7 }}>
            Powered by Anthropic Claude. Asks 5 short questions, suggests the perfect dishes — solo or for the whole table.
          </p>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 28 }}>
          {[
            {
              icon: '👤',
              tag: 'Solo Diner Mode',
              questions: [
                { q: 'Dietary preference?', a: 'Veg · Non-veg · Either' },
                { q: 'What\'s your mood?', a: 'Comfort · Healthy · Popular · Adventurous' },
                { q: 'Spice tolerance?', a: 'Mild · Medium · Spicy' },
                { q: 'How hungry?', a: 'Light bite · Regular · Feast mode' },
                { q: 'Budget per dish?', a: 'Under ₹200 · ₹200–500 · ₹500+' },
              ],
            },
            {
              icon: '👥',
              tag: 'Group Mode',
              questions: [
                { q: 'Anyone vegetarian?', a: 'Keep it veg-friendly · No · Mix' },
                { q: 'Group spice limit?', a: 'Mild · Medium · Spicy · No limit' },
                { q: 'How are you ordering?', a: 'Individual · Sharing · Mix' },
                { q: 'The vibe today?', a: 'Comfort · Light · Popular · Adventurous' },
                { q: 'Budget per head?', a: 'Under ₹200 · ₹200–500 · ₹500+' },
              ],
            },
          ].map((card, ci) => (
            <div key={ci} style={{ ...tilt(ci === 0 ? -5 : 5, 4), background: C.glass, border: `1px solid ${C.border}`, borderRadius: 24, padding: 32, backdropFilter: 'blur(20px)', boxShadow: '0 24px 60px rgba(0,0,0,0.45)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
                <span style={{ fontSize: 28 }}>{card.icon}</span>
                <span style={{ fontFamily: 'Bebas Neue,sans-serif', fontSize: 18, letterSpacing: '0.10em', color: C.gold }}>{card.tag}</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {card.questions.map((it, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'baseline', gap: 12, paddingBottom: 10, borderBottom: i === card.questions.length - 1 ? 'none' : `1px solid rgba(232,184,100,0.10)` }}>
                    <span style={{ fontFamily: 'Bebas Neue,sans-serif', fontSize: 14, color: C.gold, letterSpacing: '0.04em', minWidth: 22 }}>0{i + 1}</span>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontFamily: 'Cormorant Garamond,serif', fontWeight: 600, fontSize: 15, color: C.cream, marginBottom: 2 }}>{it.q}</div>
                      <div style={{ fontFamily: 'Cormorant Garamond,serif', fontStyle: 'italic', fontSize: 12, color: C.dim }}>{it.a}</div>
                    </div>
                  </div>
                ))}
              </div>
              <div style={{ marginTop: 20, padding: '12px 14px', background: 'rgba(232,184,100,0.08)', border: `1px solid ${C.border}`, borderRadius: 10, fontFamily: 'Cormorant Garamond,serif', fontStyle: 'italic', fontSize: 13, color: C.dim }}>
                ✦ Claude picks the 3–6 best matches from your menu.
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>,

    /* ─── 05 DESIGNED FOR INDIA (multi-language + mobile-first + UPI) ── */
    <div key="s5" style={{ ...S, overflow: 'hidden', padding: '60px 80px' }}>
      <div style={{ position: 'absolute', inset: 0, background: `radial-gradient(ellipse at 50% 30%, rgba(232,184,100,0.08) 0%, transparent 55%)` }} />
      <div style={{ position: 'relative', zIndex: 2, width: '100%', maxWidth: 1200, textAlign: 'center' }}>
        {sectionLabel('Built for India')}
        <div style={{ ...headlineStyle, fontSize: 'clamp(56px,8vw,108px)', marginBottom: 24 }}>
          <span style={{ color: C.cream }}>ENGLISH.</span>
          <span style={{ color: 'transparent', WebkitTextStroke: `2px ${C.gold}`, margin: '0 0.18em' }}>தமிழ்.</span>
          <span style={{ background: `linear-gradient(90deg,${C.gold},${C.copperLt})`, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>हिन्दी.</span>
        </div>
        <p style={{ fontFamily: 'Cormorant Garamond,serif', fontSize: 'clamp(16px,1.6vw,20px)', color: C.dim, maxWidth: 640, margin: '0 auto 48px', lineHeight: 1.7 }}>
          Diners pick their language on the menu page. Item names, AI questions, payment screens, status updates — all switch instantly. No translator needed.
        </p>

        {/* Sample cards in 3 languages */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 20, maxWidth: 980, margin: '0 auto' }}>
          {[
            { lang: 'EN', name: 'Lamb Hyderabadi Biryani', meta: 'Medium spice · 35 min', cta: 'View in AR' },
            { lang: 'தமிழ்', name: 'ஆட்டிறைச்சி ஹைதராபாதி பிரியாணி', meta: 'மிதமான காரம் · 35 நிமிடம்', cta: 'AR-இல் பார்' },
            { lang: 'हिन्दी', name: 'लैम्ब हैदराबादी बिरयानी', meta: 'मध्यम तीखापन · 35 मिनट', cta: 'AR में देखें' },
          ].map((card, i) => (
            <div key={i} style={{ ...tilt((i - 1) * 5, 3), background: C.glass, border: `1px solid ${C.border}`, borderRadius: 18, padding: 24, backdropFilter: 'blur(16px)', textAlign: 'left' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                <span style={{ fontFamily: 'Bebas Neue,sans-serif', fontSize: 13, letterSpacing: '0.12em', color: C.gold }}>{card.lang}</span>
                <span style={{ fontSize: 9, padding: '3px 8px', borderRadius: 6, background: 'rgba(232,184,100,0.18)', color: C.gold, fontFamily: 'Cormorant Garamond,serif', letterSpacing: '0.1em' }}>◆ AR</span>
              </div>
              <div style={{ aspectRatio: '4/3', borderRadius: 12, background: 'linear-gradient(135deg,rgba(232,184,100,0.20),rgba(209,122,71,0.16))', marginBottom: 14, position: 'relative', overflow: 'hidden' }}>
                <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(ellipse at 50% 60%, rgba(232,184,100,0.4) 0%, transparent 65%)' }} />
              </div>
              <div style={{ fontFamily: 'Cormorant Garamond,serif', fontWeight: 700, fontSize: 15, color: C.cream, lineHeight: 1.3, marginBottom: 6 }}>{card.name}</div>
              <div style={{ fontFamily: 'Cormorant Garamond,serif', fontSize: 12, color: C.dim, marginBottom: 10 }}>{card.meta}</div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontFamily: 'Bebas Neue,sans-serif', fontSize: 18, color: C.gold, letterSpacing: '0.02em' }}>₹520</span>
                <span style={{ fontFamily: 'Cormorant Garamond,serif', fontSize: 11, color: C.dim, fontStyle: 'italic' }}>{card.cta} →</span>
              </div>
            </div>
          ))}
        </div>

        <div style={{ marginTop: 36, display: 'flex', justifyContent: 'center', gap: 28, flexWrap: 'wrap', fontFamily: 'Cormorant Garamond,serif', fontSize: 13, color: C.dimmer, letterSpacing: '0.04em' }}>
          <span>✦ Mobile-first</span>
          <span>·</span>
          <span>✦ UPI-native (GPay, PhonePe, Paytm)</span>
          <span>·</span>
          <span>✦ Works on any phone with a camera</span>
          <span>·</span>
          <span>✦ Save to home screen (PWA)</span>
        </div>
      </div>
    </div>,

    /* ─── 06 THE DINER JOURNEY ─────────────────────────────────── */
    <div key="s6" style={{ ...S, overflow: 'hidden', padding: '60px 80px' }}>
      <div style={{ position: 'absolute', inset: 0, background: `radial-gradient(ellipse at 50% 0%, rgba(232,184,100,0.07) 0%, transparent 55%)` }} />
      <div style={{ position: 'relative', zIndex: 2, width: '100%', maxWidth: 1300 }}>
        <div style={{ textAlign: 'center', marginBottom: 48 }}>
          {sectionLabel('The Diner Journey')}
          <div style={{ ...headlineStyle, fontSize: 'clamp(44px,5.5vw,76px)', color: C.cream }}>
            ONE SCAN.<br />
            <span style={{ background: `linear-gradient(90deg,${C.gold},${C.goldLt})`, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>EVERYTHING THAT FOLLOWS.</span>
          </div>
        </div>
        {/* Step rail */}
        <div style={{ position: 'relative' }}>
          {/* Horizontal connecting line */}
          <div style={{ position: 'absolute', top: 24, left: '4%', right: '4%', height: 1, background: `linear-gradient(90deg, transparent, ${C.border}, ${C.borderHi}, ${C.border}, transparent)`, zIndex: 0 }} />

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(8,1fr)', gap: 12, position: 'relative', zIndex: 1 }}>
            {[
              { n: '01', icon: '📲', t: 'Scan QR',         s: 'At their table' },
              { n: '02', icon: '🍽️', t: 'Browse menu',     s: 'In their language' },
              { n: '03', icon: '🥽', t: 'Tap → AR',         s: 'See it in 3D' },
              { n: '04', icon: '✨', t: 'AI suggests',      s: 'Smart pairings' },
              { n: '05', icon: '🛒', t: 'Add to cart',      s: 'With notes' },
              { n: '06', icon: '🍳', t: 'Track live',       s: 'Placed→Served' },
              { n: '07', icon: '💳', t: 'Pay any way',      s: 'Cash/Card/UPI' },
              { n: '08', icon: '⭐', t: 'Rate dishes',      s: 'Feedback flows' },
            ].map((st, i) => (
              <div key={i} style={{ textAlign: 'center' }}>
                <div style={{
                  width: 48, height: 48, borderRadius: '50%',
                  background: i % 2 === 0 ? `linear-gradient(135deg,${C.goldDk},${C.gold})` : `linear-gradient(135deg,${C.ember},${C.copper})`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  margin: '0 auto 14px',
                  fontSize: 22,
                  boxShadow: `0 4px 16px ${i % 2 === 0 ? 'rgba(232,184,100,0.35)' : 'rgba(209,122,71,0.30)'}`,
                  border: `1.5px solid ${C.bg}`,
                }}>{st.icon}</div>
                <div style={{ fontFamily: 'Bebas Neue,sans-serif', fontSize: 11, letterSpacing: '0.12em', color: C.gold, marginBottom: 6 }}>{st.n}</div>
                <div style={{ fontFamily: 'Cormorant Garamond,serif', fontWeight: 700, fontSize: 14, color: C.cream, marginBottom: 4 }}>{st.t}</div>
                <div style={{ fontFamily: 'Cormorant Garamond,serif', fontStyle: 'italic', fontSize: 11, color: C.dim, lineHeight: 1.4 }}>{st.s}</div>
              </div>
            ))}
          </div>
        </div>
        <p style={{ textAlign: 'center', marginTop: 56, fontFamily: 'Cormorant Garamond,serif', fontStyle: 'italic', fontSize: 'clamp(15px,1.5vw,18px)', color: C.dim, maxWidth: 740, marginLeft: 'auto', marginRight: 'auto', lineHeight: 1.7 }}>
          From the first tap on the QR to the last bite of dessert — your diner never leaves the experience, never has to wave for a waiter, never has to wonder where their order is.
        </p>
      </div>
    </div>,

    /* ─── 07 YOUR OPERATIONS ───────────────────────────────────── */
    <div key="s7" style={{ ...S, overflow: 'hidden', padding: '60px 80px' }}>
      <div style={{ position: 'absolute', inset: 0, background: `radial-gradient(ellipse at 20% 50%, rgba(232,184,100,0.08) 0%, transparent 50%), radial-gradient(ellipse at 80% 50%, rgba(209,122,71,0.06) 0%, transparent 50%)` }} />
      <div style={{ position: 'relative', zIndex: 2, width: '100%', maxWidth: 1200 }}>
        <div style={{ textAlign: 'center', marginBottom: 50 }}>
          {sectionLabel('Your Operations')}
          <div style={{ ...headlineStyle, fontSize: 'clamp(44px,5.5vw,76px)', color: C.cream, lineHeight: 0.92 }}>
            EVERY ORDER. EVERY TABLE.<br />
            <span style={{ background: `linear-gradient(90deg,${C.gold},${C.goldLt})`, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>IN REAL TIME.</span>
          </div>
          <p style={{ fontFamily: 'Cormorant Garamond,serif', fontSize: 'clamp(15px,1.5vw,18px)', color: C.dim, maxWidth: 660, margin: '20px auto 0', lineHeight: 1.7 }}>
            The moment a diner taps Place Order, your kitchen sees it. Your waiters get a live action queue. You mark a Biryani done while the Dal is still cooking.
          </p>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 24 }}>
          {[
            {
              icon: '🍳', tag: 'Kitchen Display (KDS)',
              points: ['Auto-shows new orders the second they place', 'Voice + chime announcements', 'Per-item ready button — finer than per-order'],
            },
            {
              icon: '🔔', tag: 'Waiter Dashboard',
              points: ['Live action queue: calls, serves, payments', 'Instant table-side waiter calls', 'Cash collection with auto-change calc'],
            },
            {
              icon: '📊', tag: 'Activity Feed',
              points: ['Real-time stream of everything happening', 'Order placed · Status changed · Payment received', 'Audit trail for every staff action'],
            },
          ].map((b, i) => (
            <div key={i} style={{ ...tilt((i - 1) * 5, 4), background: C.glass, border: `1px solid ${C.border}`, borderRadius: 22, padding: 32, backdropFilter: 'blur(18px)', boxShadow: '0 24px 60px rgba(0,0,0,0.42)', position: 'relative', overflow: 'hidden' }}>
              <div style={{ position: 'absolute', top: 18, right: 22, fontFamily: 'Bebas Neue,sans-serif', fontSize: 80, color: 'rgba(232,184,100,0.06)', lineHeight: 1 }}>0{i + 1}</div>
              <div style={{ width: 52, height: 52, borderRadius: 14, background: `linear-gradient(135deg,${C.goldDk},${C.gold})`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24, marginBottom: 20, boxShadow: `0 4px 16px ${C.goldGlow}` }}>{b.icon}</div>
              <div style={{ fontFamily: 'Bebas Neue,sans-serif', fontSize: 18, letterSpacing: '0.08em', color: C.cream, marginBottom: 18 }}>{b.tag}</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
                {b.points.map(p => (
                  <div key={p} style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                    <span style={{ color: C.gold, fontSize: 12, marginTop: 4, flexShrink: 0 }}>◆</span>
                    <span style={{ fontFamily: 'Cormorant Garamond,serif', fontSize: 14, color: C.dim, lineHeight: 1.65 }}>{p}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div style={{ marginTop: 36, padding: '14px 20px', background: 'rgba(232,184,100,0.05)', border: `1px solid ${C.border}`, borderRadius: 12, fontFamily: 'Cormorant Garamond,serif', fontStyle: 'italic', fontSize: 14, color: C.dim, textAlign: 'center' }}>
          ✦ Staff sign in with a 4-digit PIN. Disable a staff member — they're logged out in real time.
        </div>
      </div>
    </div>,

    /* ─── 08 MENU MANAGEMENT ───────────────────────────────────── */
    <div key="s8" style={{ ...S, overflow: 'hidden', padding: '60px 80px' }}>
      <div style={{ position: 'absolute', inset: 0, background: `radial-gradient(ellipse at 70% 30%, rgba(232,184,100,0.07) 0%, transparent 55%)` }} />
      <div style={{ position: 'relative', zIndex: 2, width: '100%', maxWidth: 1200 }}>
        <div style={{ marginBottom: 44 }}>
          {sectionLabel('Menu Control')}
          <div style={{ ...headlineStyle, fontSize: 'clamp(44px,5.5vw,76px)', color: C.cream, lineHeight: 0.92 }}>
            UPDATE YOUR MENU<br />
            <span style={{ background: `linear-gradient(90deg,${C.gold},${C.goldLt})`, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>IN SECONDS, NOT WEEKS.</span>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1.3fr 1fr', gap: 36, alignItems: 'center' }}>
          {/* Left — feature list */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {[
              { icon: '🪶', t: 'Drag, rename, reorder', s: 'Categories and dishes — change the order diners see instantly. No reload.' },
              { icon: '📸', t: 'Photo + AR upload', s: 'Drop a photo. Request an AR model and we deliver in 48 hours.' },
              { icon: '🌶️', t: 'Spice, prep time, calories', s: 'Tag every dish so diners filter by what matters to them.' },
              { icon: '🚫', t: 'Sold out for today', s: 'One toggle hides a dish from tonight\'s service. Resets at midnight.' },
              { icon: '📥', t: 'CSV bulk import', s: 'Migrating from another system? Drop in a CSV — done.' },
              { icon: '🎟️', t: 'Coupons & offers', s: 'Discount codes, promo flags, Chef\'s Special / Popular badges.' },
            ].map((row, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 16, padding: '14px 18px', background: i === 1 ? 'rgba(232,184,100,0.06)' : 'transparent', border: `1px solid ${i === 1 ? C.border : 'transparent'}`, borderRadius: 12 }}>
                <div style={{ width: 40, height: 40, borderRadius: 10, background: 'rgba(232,184,100,0.10)', border: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, flexShrink: 0 }}>{row.icon}</div>
                <div>
                  <div style={{ fontFamily: 'Bebas Neue,sans-serif', fontSize: 15, letterSpacing: '0.07em', color: C.cream, marginBottom: 4 }}>{row.t}</div>
                  <div style={{ fontFamily: 'Cormorant Garamond,serif', fontSize: 13, color: C.dim, lineHeight: 1.65 }}>{row.s}</div>
                </div>
              </div>
            ))}
          </div>

          {/* Right — fake dashboard preview */}
          <div style={{ ...tilt(8, 5) }}>
            <div style={{ background: 'rgba(15,12,22,0.92)', border: `1px solid ${C.border}`, borderRadius: 18, overflow: 'hidden', boxShadow: '0 30px 80px rgba(0,0,0,0.55)' }}>
              <div style={{ padding: '14px 18px', borderBottom: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'rgba(232,184,100,0.04)' }}>
                <span style={{ fontFamily: 'Bebas Neue,sans-serif', fontSize: 13, letterSpacing: '0.10em', color: C.gold }}>MENU ITEMS</span>
                <span style={{ fontSize: 10, padding: '3px 10px', borderRadius: 20, background: 'rgba(63,158,90,0.16)', color: '#6EC98A', fontFamily: 'Cormorant Garamond,serif', letterSpacing: '0.08em' }}>● LIVE</span>
              </div>
              {[
                { veg: '🟢', name: 'Paneer Tikka', cat: 'Starters', price: '₹240', tag: '⚡ Popular' },
                { veg: '🟢', name: 'Masala Dosa', cat: 'Breakfast', price: '₹180', tag: '★ Chef' },
                { veg: '🔴', name: 'Chicken Biryani', cat: 'Mains', price: '₹320', tag: null },
                { veg: '🟢', name: 'Dal Makhani', cat: 'Mains', price: '₹220', tag: null },
                { veg: '🟢', name: 'Gulab Jamun', cat: 'Dessert', price: '₹120', tag: '★ Chef' },
              ].map((it, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 18px', borderBottom: i < 4 ? '1px solid rgba(232,184,100,0.06)' : 'none' }}>
                  <span style={{ fontSize: 12 }}>{it.veg}</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontFamily: 'Cormorant Garamond,serif', fontWeight: 600, fontSize: 13, color: C.cream }}>{it.name}</div>
                    <div style={{ fontFamily: 'Cormorant Garamond,serif', fontSize: 11, color: C.dim, marginTop: 1 }}>{it.cat}</div>
                  </div>
                  {it.tag && (
                    <span style={{ fontSize: 9, padding: '2px 7px', borderRadius: 5, background: 'rgba(232,184,100,0.16)', color: C.gold, fontFamily: 'Cormorant Garamond,serif', letterSpacing: '0.04em' }}>{it.tag}</span>
                  )}
                  <span style={{ fontFamily: 'Bebas Neue,sans-serif', fontSize: 14, color: C.gold, letterSpacing: '0.02em' }}>{it.price}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>,

    /* ─── 09 PAYMENTS + POS ────────────────────────────────────── */
    <div key="s9" style={{ ...S, overflow: 'hidden', padding: '60px 80px' }}>
      <div style={{ position: 'absolute', inset: 0, background: `radial-gradient(ellipse at 25% 50%, rgba(232,184,100,0.08) 0%, transparent 50%), radial-gradient(ellipse at 75% 50%, rgba(209,122,71,0.07) 0%, transparent 50%)` }} />
      <div style={{ position: 'relative', zIndex: 2, width: '100%', maxWidth: 1200 }}>
        <div style={{ textAlign: 'center', marginBottom: 44 }}>
          {sectionLabel('Payments + POS')}
          <div style={{ ...headlineStyle, fontSize: 'clamp(40px,5vw,68px)', color: C.cream }}>
            ONE TAP. ANY METHOD.<br />
            <span style={{ background: `linear-gradient(90deg,${C.gold},${C.copperLt})`, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>NATIVE POS SYNC.</span>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 28 }}>
          {/* Left — Payment picker mock */}
          <div style={{ background: C.glass, border: `1px solid ${C.border}`, borderRadius: 22, padding: 28, backdropFilter: 'blur(18px)' }}>
            <div style={{ fontFamily: 'Bebas Neue,sans-serif', fontSize: 16, letterSpacing: '0.10em', color: C.gold, marginBottom: 8 }}>SWIGGY-STYLE PICKER</div>
            <div style={{ fontFamily: 'Cormorant Garamond,serif', fontSize: 14, color: C.dim, marginBottom: 22, lineHeight: 1.6 }}>Diners pick their UPI app by name — not a generic "Pay with UPI" button.</div>

            <div style={{ background: 'rgba(15,12,22,0.85)', borderRadius: 16, padding: 18, border: `1px solid ${C.border}` }}>
              <div style={{ fontFamily: 'Cormorant Garamond,serif', fontSize: 11, color: C.dim, letterSpacing: '0.10em', textTransform: 'uppercase', marginBottom: 10 }}>Pay with UPI</div>
              {[
                { name: 'Google Pay', mark: 'G', col: '#4285F4', bg: '#FFFFFF', sel: true },
                { name: 'PhonePe',    mark: 'PP', col: '#FFFFFF', bg: '#5F259F' },
                { name: 'Paytm UPI',  mark: 'Pay',col: '#FFFFFF', bg: '#00BAF2' },
                { name: 'Other UPI',  mark: '↗',  col: 'rgba(255,255,255,0.6)', bg: 'rgba(255,255,255,0.08)' },
              ].map((m, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 10, borderRadius: 10, border: `${m.sel ? 2 : 1}px solid ${m.sel ? C.gold : 'rgba(255,255,255,0.08)'}`, background: m.sel ? 'rgba(232,184,100,0.06)' : 'transparent', marginBottom: 6 }}>
                  <div style={{ width: 32, height: 32, borderRadius: 8, background: m.bg, color: m.col, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Bebas Neue,sans-serif', fontSize: m.mark.length > 2 ? 11 : 14, letterSpacing: '0.02em', flexShrink: 0 }}>{m.mark}</div>
                  <span style={{ flex: 1, fontFamily: 'Cormorant Garamond,serif', fontWeight: 600, fontSize: 13, color: C.cream }}>{m.name}</span>
                  <span style={{ width: 16, height: 16, borderRadius: '50%', border: `2px solid ${m.sel ? C.gold : 'rgba(255,255,255,0.2)'}`, position: 'relative' }}>{m.sel && <span style={{ position: 'absolute', inset: 3, borderRadius: '50%', background: C.gold }} />}</span>
                </div>
              ))}
              <div style={{ fontFamily: 'Cormorant Garamond,serif', fontSize: 11, color: C.dim, letterSpacing: '0.10em', textTransform: 'uppercase', margin: '14px 0 8px' }}>Or pay at table</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginBottom: 14 }}>
                <div style={{ padding: '8px 10px', borderRadius: 10, border: '1px solid rgba(255,255,255,0.10)', display: 'flex', alignItems: 'center', gap: 8, fontFamily: 'Cormorant Garamond,serif', fontSize: 13, color: C.cream }}>
                  <span style={{ width: 28, height: 28, borderRadius: 7, background: 'rgba(63,158,90,0.18)', color: '#6EC98A', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14 }}>💵</span>
                  Cash
                </div>
                <div style={{ padding: '8px 10px', borderRadius: 10, border: '1px solid rgba(255,255,255,0.10)', display: 'flex', alignItems: 'center', gap: 8, fontFamily: 'Cormorant Garamond,serif', fontSize: 13, color: C.cream }}>
                  <span style={{ width: 28, height: 28, borderRadius: 7, background: 'rgba(74,128,192,0.18)', color: '#9BB8E0', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14 }}>💳</span>
                  Card
                </div>
              </div>
              <div style={{ padding: '12px 14px', borderRadius: 12, background: `linear-gradient(135deg,${C.goldDk},${C.gold})`, color: C.bg, fontFamily: 'Bebas Neue,sans-serif', fontSize: 14, letterSpacing: '0.08em', textAlign: 'center' }}>
                PAY ₹520 VIA GOOGLE PAY
              </div>
            </div>
          </div>

          {/* Right — POS integration card */}
          <div style={{ background: C.glass, border: `1px solid ${C.border}`, borderRadius: 22, padding: 28, backdropFilter: 'blur(18px)' }}>
            <div style={{ fontFamily: 'Bebas Neue,sans-serif', fontSize: 16, letterSpacing: '0.10em', color: C.gold, marginBottom: 8 }}>PETPOOJA-NATIVE</div>
            <div style={{ fontFamily: 'Cormorant Garamond,serif', fontSize: 14, color: C.dim, marginBottom: 22, lineHeight: 1.6 }}>Already on Petpooja? We sync both ways — no manual data entry.</div>

            {/* Sync diagram */}
            <div style={{ background: 'rgba(15,12,22,0.85)', borderRadius: 16, padding: 24, border: `1px solid ${C.border}`, marginBottom: 18 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
                <div style={{ flex: 1, textAlign: 'center' }}>
                  <div style={{ width: 64, height: 64, borderRadius: 14, background: `linear-gradient(135deg,${C.goldDk},${C.gold})`, margin: '0 auto 10px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 28 }}>🍽️</div>
                  <div style={{ fontFamily: 'Bebas Neue,sans-serif', fontSize: 13, letterSpacing: '0.10em', color: C.cream }}>ADVERT RADICAL</div>
                </div>
                <div style={{ flex: 0.6, position: 'relative', height: 30 }}>
                  <div style={{ position: 'absolute', top: 6, left: 0, right: 0, height: 1, background: `linear-gradient(90deg,${C.gold},${C.copper})` }} />
                  <div style={{ position: 'absolute', bottom: 6, left: 0, right: 0, height: 1, background: `linear-gradient(90deg,${C.copper},${C.gold})` }} />
                  <div style={{ position: 'absolute', top: 0, left: '50%', transform: 'translateX(-50%)', fontSize: 14, color: C.gold }}>→</div>
                  <div style={{ position: 'absolute', bottom: 0, left: '50%', transform: 'translateX(-50%)', fontSize: 14, color: C.copper }}>←</div>
                </div>
                <div style={{ flex: 1, textAlign: 'center' }}>
                  <div style={{ width: 64, height: 64, borderRadius: 14, background: 'rgba(255,255,255,0.06)', border: `1px solid ${C.border}`, margin: '0 auto 10px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Bebas Neue,sans-serif', fontSize: 22, color: C.gold, letterSpacing: '0.06em' }}>POS</div>
                  <div style={{ fontFamily: 'Bebas Neue,sans-serif', fontSize: 13, letterSpacing: '0.10em', color: C.cream }}>PETPOOJA</div>
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {[
                'Menu items + categories sync both directions',
                'Stock status (in-stock / out / sold today) auto-flows',
                'Orders placed here push into your Petpooja queue',
                'Payments confirmed here update your Petpooja receipt',
              ].map(t => (
                <div key={t} style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                  <span style={{ color: C.gold, fontSize: 11, marginTop: 5 }}>◆</span>
                  <span style={{ fontFamily: 'Cormorant Garamond,serif', fontSize: 13, color: C.dim, lineHeight: 1.65 }}>{t}</span>
                </div>
              ))}
            </div>

            <div style={{ marginTop: 18, padding: '10px 14px', background: 'rgba(232,184,100,0.06)', border: `1px dashed ${C.border}`, borderRadius: 10, fontFamily: 'Cormorant Garamond,serif', fontStyle: 'italic', fontSize: 12, color: C.dim }}>
              ✦ Pro plan feature. Petpooja onboarding included.
            </div>
          </div>
        </div>
      </div>
    </div>,

    /* ─── 10 ANALYTICS & GROWTH ────────────────────────────────── */
    <div key="s10" style={{ ...S, overflow: 'hidden', padding: '60px 80px' }}>
      <div style={{ position: 'absolute', inset: 0, background: `radial-gradient(ellipse at 50% 70%, rgba(232,184,100,0.08) 0%, transparent 55%)` }} />
      <div style={{ position: 'relative', zIndex: 2, width: '100%', maxWidth: 1200 }}>
        <div style={{ marginBottom: 44 }}>
          {sectionLabel('Grow Smarter')}
          <div style={{ ...headlineStyle, fontSize: 'clamp(44px,5.5vw,76px)', color: C.cream, lineHeight: 0.92 }}>
            KNOW WHAT SELLS.<br />
            <span style={{ background: `linear-gradient(90deg,${C.gold},${C.goldLt})`, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>FIX WHAT DOESN'T.</span>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 18 }}>
          {[
            { icon: '✉️', t: 'Daily Summary Email',  s: 'Lands in your inbox at 12:30 AM. Yesterday\'s revenue, top dishes, busiest hour, payment breakdown.' },
            { icon: '🌡️', t: 'Dish Heatmap',          s: 'Which dishes get viewed, which get ordered, which get re-ordered. Cut the dead weight.' },
            { icon: '⏱️', t: 'Peak Hour Insights',    s: 'Hourly order density. Plan staff. Plan prep. Plan promotions.' },
            { icon: '⭐', t: 'Customer Ratings',      s: 'Diners rate each dish after eating. See trends. Reward winners.' },
          ].map(card => (
            <div key={card.t} style={{ background: C.glass, border: `1px solid ${C.border}`, borderRadius: 18, padding: 24, backdropFilter: 'blur(16px)' }}>
              <div style={{ width: 44, height: 44, borderRadius: 12, background: 'rgba(232,184,100,0.10)', border: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, marginBottom: 16 }}>{card.icon}</div>
              <div style={{ fontFamily: 'Bebas Neue,sans-serif', fontSize: 14, letterSpacing: '0.08em', color: C.cream, marginBottom: 10 }}>{card.t}</div>
              <p style={{ fontFamily: 'Cormorant Garamond,serif', fontSize: 13, color: C.dim, lineHeight: 1.7, margin: 0 }}>{card.s}</p>
            </div>
          ))}
        </div>

        {/* Bottom: extra feature strip */}
        <div style={{ marginTop: 32, padding: '20px 28px', background: 'rgba(232,184,100,0.04)', border: `1px solid ${C.border}`, borderRadius: 16, display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 16 }}>
          {[
            { l: 'Coupon system',     s: 'Promo codes, %-off, ₹-off' },
            { l: 'Weekly auto-backup', s: 'Firestore snapshot every Sunday' },
            { l: 'Audit log',          s: 'Every change tracked by user' },
            { l: 'Customer feedback',  s: '"Tell us how we did" form' },
          ].map(x => (
            <div key={x.l}>
              <div style={{ fontFamily: 'Bebas Neue,sans-serif', fontSize: 13, letterSpacing: '0.10em', color: C.gold, marginBottom: 4 }}>{x.l}</div>
              <div style={{ fontFamily: 'Cormorant Garamond,serif', fontSize: 12, color: C.dim, fontStyle: 'italic' }}>{x.s}</div>
            </div>
          ))}
        </div>
      </div>
    </div>,

    /* ─── 11 THE NUMBERS + ROI ─────────────────────────────────── */
    <div key="s11" style={{ ...S, textAlign: 'center', overflow: 'hidden' }}>
      <div style={{ position: 'absolute', inset: 0, background: `radial-gradient(ellipse at 50% 50%, rgba(232,184,100,0.10) 0%, transparent 60%)` }} />
      <div style={{ position: 'relative', zIndex: 2, width: '100%', maxWidth: 1100, padding: '0 80px' }}>
        {sectionLabel('The Impact')}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 2, marginTop: 20 }}>
          {[
            { num: '68%', label: 'of diners more likely to order a dish they can see first',     src: 'National Restaurant Association' },
            { num: '3×',  label: 'more add-ons ordered when food is visualised before ordering', src: 'Menu Engineering Research' },
            { num: '26%', label: 'average increase in order value with AR-enabled menus',         src: 'Visual Commerce Study 2024' },
          ].map((s, i) => (
            <div key={i} style={{ padding: '40px 32px', borderLeft: i > 0 ? `1px solid rgba(232,184,100,0.16)` : 'none' }}>
              <div style={{
                fontFamily: 'Bebas Neue,sans-serif', fontSize: 'clamp(64px,9vw,120px)', lineHeight: 0.85, letterSpacing: '0.02em',
                background: `linear-gradient(135deg,${C.goldDk},${C.gold},${C.goldLt})`, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
                marginBottom: 20,
                filter: 'drop-shadow(0 0 24px rgba(232,184,100,0.18))',
              }}>{s.num}</div>
              <div style={{ fontFamily: 'Cormorant Garamond,serif', fontSize: 'clamp(14px,1.3vw,17px)', color: C.dim, lineHeight: 1.6, marginBottom: 12 }}>{s.label}</div>
              <div style={{ fontFamily: 'Cormorant Garamond,serif', fontStyle: 'italic', fontSize: 12, color: C.dimmer }}>{s.src}</div>
            </div>
          ))}
        </div>

        <div style={{ marginTop: 36, height: '1px', background: `linear-gradient(90deg,transparent,${C.border},transparent)` }} />

        {/* ROI math row */}
        <div style={{ marginTop: 36, display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 20, textAlign: 'left' }}>
          {[
            { plan: 'Starter ₹999',   payback: 'Pays for itself with 4 extra dishes a month',  hint: '₹250 avg dish · 4 dishes/mo = ₹1,000' },
            { plan: 'Growth ₹2,499',  payback: 'Pays for itself with 8 extra dishes a month',  hint: 'Most restaurants see 30+ extra orders' },
            { plan: 'Pro ₹4,999',     payback: 'Pays for itself with 17 extra dishes a month', hint: 'Petpooja-integrated kitchens see even more' },
          ].map(r => (
            <div key={r.plan} style={{ padding: '20px 22px', background: 'rgba(232,184,100,0.05)', border: `1px solid ${C.border}`, borderRadius: 14 }}>
              <div style={{ fontFamily: 'Bebas Neue,sans-serif', fontSize: 14, letterSpacing: '0.10em', color: C.gold, marginBottom: 6 }}>{r.plan}</div>
              <div style={{ fontFamily: 'Cormorant Garamond,serif', fontSize: 15, color: C.cream, marginBottom: 4, lineHeight: 1.5 }}>{r.payback}</div>
              <div style={{ fontFamily: 'Cormorant Garamond,serif', fontSize: 11, color: C.dimmer, fontStyle: 'italic' }}>{r.hint}</div>
            </div>
          ))}
        </div>

        <p style={{ fontFamily: 'Cormorant Garamond,serif', fontStyle: 'italic', fontSize: 'clamp(17px,1.9vw,24px)', color: C.dim, marginTop: 36, lineHeight: 1.6 }}>
          "Customers who see their food before ordering spend more. Always."
        </p>
      </div>
    </div>,

    /* ─── 12 PRICING ───────────────────────────────────────────── */
    <div key="s12" style={{ ...S, overflow: 'hidden', padding: '60px 80px' }}>
      <div style={{ position: 'absolute', inset: 0, background: `radial-gradient(ellipse at 50% 40%, rgba(232,184,100,0.08) 0%, transparent 55%)` }} />
      <div style={{ position: 'relative', zIndex: 2, width: '100%', maxWidth: 1100 }}>
        <div style={{ textAlign: 'center', marginBottom: 48 }}>
          {sectionLabel('Pricing')}
          <div style={{ ...headlineStyle, fontSize: 'clamp(40px,5vw,68px)', color: C.cream }}>SIMPLE. TRANSPARENT. SCALABLE.</div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 20 }}>
          {[
            {
              name: 'Starter', price: '₹999', per: '/mo', glow: false, tag: null,
              features: ['20 menu items', 'QR code menu', 'AI Smart Assistant', 'Basic analytics', 'Multi-language (EN/TA/HI)'],
            },
            {
              name: 'Growth', price: '₹2,499', per: '/mo', glow: true, tag: 'Most Popular',
              features: ['60 menu items', 'AR food visualisation', 'AI upselling', 'Customer ratings', 'Waiter call system', 'Daily summary email'],
            },
            {
              name: 'Pro', price: '₹4,999', per: '/mo', glow: false, tag: null,
              features: ['150 menu items', 'Petpooja POS sync', 'CSV bulk import', 'Advanced analytics', 'Priority support', 'Custom branding'],
            },
          ].map((p) => (
            <div key={p.name} style={{
              background: p.glow ? `linear-gradient(145deg,rgba(232,184,100,0.14),rgba(232,184,100,0.06))` : C.glass,
              border: `1.5px solid ${p.glow ? C.borderHi : C.border}`,
              borderRadius: 24, padding: '32px 28px', backdropFilter: 'blur(20px)',
              boxShadow: p.glow ? `0 0 60px rgba(232,184,100,0.14), 0 28px 60px rgba(0,0,0,0.45)` : '0 20px 50px rgba(0,0,0,0.38)',
              position: 'relative', transform: p.glow ? 'translateY(-8px)' : 'none',
            }}>
              {p.tag && (
                <div style={{ position: 'absolute', top: -14, left: '50%', transform: 'translateX(-50%)', padding: '5px 18px', background: `linear-gradient(135deg,${C.goldDk},${C.gold})`, color: C.bg, fontSize: 11, fontWeight: 700, borderRadius: 30, whiteSpace: 'nowrap', fontFamily: 'Cormorant Garamond,serif', letterSpacing: '0.08em' }}>
                  ✦ {p.tag}
                </div>
              )}
              <div style={{ fontFamily: 'Bebas Neue,sans-serif', fontSize: 22, letterSpacing: '0.10em', color: p.glow ? C.gold : C.cream, marginBottom: 4 }}>{p.name}</div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, marginBottom: 20, paddingBottom: 18, borderBottom: `1px solid ${p.glow ? 'rgba(232,184,100,0.22)' : 'rgba(245,236,215,0.10)'}` }}>
                <span style={{ fontFamily: 'Bebas Neue,sans-serif', fontSize: 42, color: C.cream, letterSpacing: '-0.01em', lineHeight: 1 }}>{p.price}</span>
                <span style={{ fontFamily: 'Cormorant Garamond,serif', fontSize: 14, color: C.dim }}>{p.per}</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {p.features.map(f => (
                  <div key={f} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ width: 16, height: 16, borderRadius: 5, background: `rgba(232,184,100,${p.glow ? '0.20' : '0.10'})`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, color: C.gold, flexShrink: 0 }}>✓</span>
                    <span style={{ fontFamily: 'Cormorant Garamond,serif', fontSize: 14, color: p.glow ? 'rgba(245,236,215,0.80)' : C.dim }}>{f}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
        <p style={{ textAlign: 'center', fontFamily: 'Cormorant Garamond,serif', fontStyle: 'italic', fontSize: 13, color: C.dimmer, marginTop: 24 }}>14-day free trial · No credit card required · Cancel anytime · Onboarding included</p>
      </div>
    </div>,

    /* ─── 13 THE ASK / CTA ─────────────────────────────────────── */
    <div key="s13" style={{ ...S, textAlign: 'center', overflow: 'hidden', padding: '0 80px' }}>
      <div style={{ position: 'absolute', inset: 0, background: `radial-gradient(ellipse at 50% 40%, rgba(232,184,100,0.15) 0%, transparent 55%)` }} />
      <div style={{ position: 'absolute', fontFamily: 'Bebas Neue,sans-serif', fontSize: '30vw', color: 'rgba(232,184,100,0.035)', lineHeight: 1, top: '50%', left: '50%', transform: 'translate(-50%,-50%)', userSelect: 'none', pointerEvents: 'none', whiteSpace: 'nowrap' }}>50</div>

      <div style={{ position: 'relative', zIndex: 2, maxWidth: 860, ...tilt(5, 3) }}>
        {sectionLabel('Founding Partner Programme · Chennai')}

        <h2 style={{ ...headlineStyle, fontSize: 'clamp(56px,8vw,110px)', margin: '0 0 24px' }}>
          <span style={{ WebkitTextStroke: `2px ${C.dim}`, WebkitTextFillColor: 'transparent' }}>BE AMONG</span><br />
          <span style={{
            background: `linear-gradient(90deg,${C.goldDk},${C.gold},${C.goldLt},${C.copperLt})`,
            WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
            filter: 'drop-shadow(0 0 28px rgba(232,184,100,0.22))',
          }}>THE FIRST 50.</span>
        </h2>

        <p style={{ fontFamily: 'Cormorant Garamond,serif', fontSize: 'clamp(16px,1.7vw,21px)', color: C.dim, lineHeight: 1.75, maxWidth: 620, margin: '0 auto 44px' }}>
          We're onboarding our first 50 founding partner restaurants in Chennai. Founding partners get locked-in pricing for life, 48-hour AR model creation, and a direct line to the founder.
        </p>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 16, marginBottom: 44 }}>
          {[
            { icon: '🔒', title: 'Locked-in pricing', body: 'Your rate never changes as we grow.' },
            { icon: '🥽', title: 'Priority AR setup',  body: 'Your dishes in 3D within 48 hours.' },
            { icon: '📞', title: 'Direct founder access', body: 'WhatsApp, email, or call — anytime.' },
          ].map(b => (
            <div key={b.title} style={{ background: 'rgba(232,184,100,0.07)', border: `1px solid ${C.border}`, borderRadius: 16, padding: '22px 18px' }}>
              <div style={{ fontSize: 24, marginBottom: 10 }}>{b.icon}</div>
              <div style={{ fontFamily: 'Bebas Neue,sans-serif', fontSize: 16, letterSpacing: '0.08em', color: C.cream, marginBottom: 6 }}>{b.title}</div>
              <div style={{ fontFamily: 'Cormorant Garamond,serif', fontSize: 13, color: C.dim }}>{b.body}</div>
            </div>
          ))}
        </div>

        <div style={{ display: 'flex', gap: 14, justifyContent: 'center', flexWrap: 'wrap', marginBottom: 32 }}>
          <a href="https://wa.me/919876543210" target="_blank" rel="noreferrer" style={{ padding: '16px 36px', borderRadius: 12, background: `linear-gradient(135deg,${C.goldDk},${C.gold})`, color: C.bg, fontFamily: 'Bebas Neue,sans-serif', fontSize: 17, letterSpacing: '0.1em', textDecoration: 'none', display: 'inline-block', boxShadow: `0 8px 32px rgba(232,184,100,0.35)` }}>
            BOOK A DEMO →
          </a>
          <a href="mailto:hello@advertradical.com" style={{ padding: '16px 28px', borderRadius: 12, background: 'transparent', border: `1.5px solid ${C.border}`, color: C.cream, fontFamily: 'Bebas Neue,sans-serif', fontSize: 17, letterSpacing: '0.1em', textDecoration: 'none', display: 'inline-block' }}>
            EMAIL US
          </a>
          <a href="https://advertradical.vercel.app/restaurant/spot" target="_blank" rel="noreferrer" style={{ padding: '16px 28px', borderRadius: 12, background: 'transparent', border: `1.5px solid ${C.border}`, color: C.dim, fontFamily: 'Bebas Neue,sans-serif', fontSize: 17, letterSpacing: '0.1em', textDecoration: 'none', display: 'inline-block' }}>
            SEE LIVE DEMO
          </a>
        </div>

        <div style={{ fontFamily: 'Cormorant Garamond,serif', fontSize: 14, color: C.dimmer, lineHeight: 1.7 }}>
          <div>Prabu · Founder, Advert Radical · Chennai</div>
          <div style={{ marginTop: 4 }}>
            <a href="tel:+919876543210" style={{ color: C.dim }}>+91 98765 43210</a>
            &nbsp;·&nbsp;
            <a href="mailto:hello@advertradical.com" style={{ color: C.dim }}>hello@advertradical.com</a>
          </div>
        </div>
      </div>
    </div>,
  ];

  /* Defensive runtime check: keeps SLIDE_COUNT in sync with the
     actual array length in case slides are added/removed later. */
  if (process.env.NODE_ENV !== 'production' && slides.length !== SLIDE_COUNT) {
    // eslint-disable-next-line no-console
    console.warn(`[pitch] SLIDE_COUNT (${SLIDE_COUNT}) doesn't match slides.length (${slides.length}). Update SLIDE_COUNT at top of file.`);
  }
  const slidesCount = SLIDE_COUNT;

  /* ════════════════════════════════════════════════════════════════
     SHELL
     ════════════════════════════════════════════════════════════════ */
  return (
    <>
      <Head>
        <title>Advert Radical · Partner Brief</title>
        <link href="https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Cormorant+Garamond:ital,wght@0,400;0,500;0,600;1,400;1,500&display=swap" rel="stylesheet" />
        <meta name="robots" content="noindex,nofollow" />
      </Head>

      <div ref={containerRef} style={{ width: '100vw', height: '100vh', overflow: 'hidden', position: 'relative', background: C.bg, cursor: 'default' }}>
        <style>{`
          * { box-sizing:border-box; margin:0; padding:0; }
          a { text-decoration:none; }
          ::-webkit-scrollbar { display:none; }

          /* Subtle grain overlay — adds cinematic film quality.
             Uses an inline SVG-as-data-uri so no asset request needed. */
          .grain::before {
            content: '';
            position: fixed; inset: 0;
            pointer-events: none;
            z-index: 2;
            opacity: 0.05;
            background-image: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='240' height='240'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/></filter><rect width='100%' height='100%' filter='url(%23n)'/></svg>");
            background-size: 240px 240px;
            mix-blend-mode: overlay;
          }

          /* Slow pulse for the AR live indicator dot. */
          @keyframes ar-pulse {
            0%, 100% { box-shadow: 0 0 10px rgba(232,184,100,0.5); }
            50%      { box-shadow: 0 0 22px rgba(232,184,100,0.9); }
          }
          .ar-pill > span:first-child {
            animation: ar-pulse 2s ease-in-out infinite;
          }

          @media (prefers-reduced-motion: reduce) {
            * { animation: none !important; transition: none !important; }
          }
        `}</style>

        {/* Particle canvas */}
        <canvas ref={canvasRef} style={{ position: 'fixed', inset: 0, zIndex: 0, pointerEvents: 'none' }} />

        {/* Grain overlay layer */}
        <div className="grain" />

        {/* Vignette — slight darkening at edges for cinematic framing */}
        <div style={{ position: 'fixed', inset: 0, zIndex: 1, pointerEvents: 'none', background: `radial-gradient(ellipse at 50% 50%, transparent 55%, rgba(4,2,8,0.55) 100%)` }} />

        {/* Slide content */}
        <div style={{ position: 'relative', width: '100%', height: '100%', zIndex: 3 }}>
          {slides[cur]}
        </div>

        {/* Right-side progress dots */}
        <div style={{ position: 'fixed', right: 24, top: '50%', transform: 'translateY(-50%)', display: 'flex', flexDirection: 'column', gap: 6, zIndex: 100 }}>
          {slides.map((_, i) => (
            <button key={i} onClick={() => goTo(i)} title={`Slide ${i + 1}`}
              style={{
                width: i === cur ? 5 : 4, height: i === cur ? 22 : 4, borderRadius: 99, border: 'none', cursor: 'pointer', padding: 0,
                transition: 'all 0.35s cubic-bezier(0.34,1.56,0.64,1)',
                background: i === cur ? C.gold : 'rgba(232,184,100,0.20)',
                boxShadow: i === cur ? `0 0 10px rgba(232,184,100,0.55)` : 'none',
              }} />
          ))}
        </div>

        {/* Counter */}
        <div style={{ position: 'fixed', bottom: 28, right: 28, fontFamily: 'Cormorant Garamond,serif', fontStyle: 'italic', fontSize: 13, color: 'rgba(232,184,100,0.40)', zIndex: 100, letterSpacing: '0.06em' }}>
          {String(cur + 1).padStart(2, '0')} / {String(slidesCount).padStart(2, '0')}
        </div>

        {/* Wordmark */}
        <div style={{ position: 'fixed', bottom: 28, left: 28, fontFamily: 'Bebas Neue,sans-serif', fontSize: 14, letterSpacing: '0.14em', color: 'rgba(232,184,100,0.30)', zIndex: 100 }}>
          ADVERT <span style={{ background: `linear-gradient(135deg,${C.goldDk},${C.gold})`, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>RADICAL</span>
        </div>

        {/* Nav arrows */}
        {cur > 0 && (
          <button onClick={prev} style={{ position: 'fixed', left: '50%', top: 24, transform: 'translateX(-50%)', width: 36, height: 36, borderRadius: '50%', border: `1px solid ${C.border}`, background: 'rgba(10,6,18,0.7)', color: C.dim, fontSize: 15, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, backdropFilter: 'blur(12px)' }}>↑</button>
        )}
        {cur < slidesCount - 1 && (
          <button onClick={next} style={{ position: 'fixed', left: '50%', bottom: 24, transform: 'translateX(-50%)', width: 36, height: 36, borderRadius: '50%', border: `1px solid ${C.border}`, background: 'rgba(10,6,18,0.7)', color: C.dim, fontSize: 15, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, backdropFilter: 'blur(12px)' }}>↓</button>
        )}
      </div>
    </>
  );
}
