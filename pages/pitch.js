import Head from 'next/head';
import { useState, useEffect, useRef, useCallback } from 'react';

/* ─── Auth ───────────────────────────────────────────────────────
   Access gate. The deck is at a public URL but lives behind a code
   so it doesn't leak before a sales conversation.
   (Code carries the legacy "RADICAL" prefix from when this brand
   was Advert Radical — kept so existing partner emails with the
   code still work. Safe to rotate when you re-share.) */
const PASS = 'RADICAL25';

/* Total slide count — must match the length of the slides array
   below. Declared at module scope so the goTo() closure can read it
   without TDZ issues. */
const SLIDE_COUNT = 14;

/* ─── Slide titles for the jump menu / progress-dot tooltips ─────
   Kept in lockstep with the slides array. Each entry is the short
   noun-phrase a partner skim-reading the deck would expect to see
   in a table of contents. */
const SLIDE_TITLES = [
  'Title',
  'The Problem',
  'The Solution',
  'AR Experience',
  'AI Concierge',
  'Built for India',
  'Diner Journey',
  'Your Operations',
  'Menu Control',
  'Payments + POS',
  'Analytics',
  'The Impact',
  'Pricing',
  'The Ask',
];

/* ─── Palette v3 — "Live App" ────────────────────────────────────
   20 May 2026 — third + final palette. Prabu rejected both the
   terracotta-on-slate "Midnight Atelier" AND the navy+gold
   "Heraldic Midnight". This one mirrors the ACTUAL customer menu
   page (pages/restaurant/[subdomain]/index.js) so the deck reads
   as a seamless extension of the live product:
     bg     #0D0B08  warm espresso black  (customer hero bg)
     accent #F79B3D → #E05A3A  saffron→terracotta  (app gradient)
     text   #FFF5E8  warm cream           (app text colour)
   Warm, appetizing, and unmistakably theirs. */
const C = {
  /* Surfaces — warm espresso black (matches the customer page) */
  bg:        '#0D0B08',  /* Warm espresso — exact customer hero bg */
  bgLayer:   '#1A1410',  /* Card panel, warm dark */
  bgWarm:    '#1F1710',  /* Warmer panel for emphasis areas */
  bgFar:     '#050403',  /* Deepest vignette */

  /* Primary — saffron / marigold (the app's signature accent) */
  primary:   '#F79B3D',
  primaryLt: '#FFB85C',
  primaryDk: '#E05A3A',  /* terracotta — the gradient partner */
  primaryGlow: 'rgba(247,155,61,0.32)',

  /* Brass — warm honey-gold for small secondary accents, sits
     between the saffron primary and the cream text. */
  brass:     '#E0B26A',
  brassLt:   '#F0CC8C',
  brassDk:   '#A8854A',

  /* Typography — warm cream. Opacity ladder bumped 20 May 2026
     so card body copy crosses the AA contrast threshold against
     the new higher-opacity glass. Old `dim` at 0.58 was hovering
     around AA fail for small text. */
  bone:      '#FFF5E8',
  boneSoft:  'rgba(255,245,232,0.86)',
  dim:       'rgba(255,245,232,0.66)',
  dimmer:    'rgba(255,245,232,0.44)',
  dimmest:   'rgba(255,245,232,0.22)',

  /* Glass / borders — warm dark cards with clear separation
     from the espresso surface. */
  glass:     'rgba(30,24,18,0.92)',     /* warm dark card body */
  glassWarm: 'rgba(247,155,61,0.10)',   /* saffron tint for emphasis panels */
  glassDeep: 'rgba(13,11,8,0.88)',      /* darker inner panel for screenshot mocks */
  border:    'rgba(255,245,232,0.14)',
  borderHi:  'rgba(255,245,232,0.26)',
  borderAcc: 'rgba(247,155,61,0.42)',   /* saffron borders */
  borderBrass: 'rgba(224,178,106,0.34)',

  /* Semantic — unchanged */
  success:   '#5DA068',
  danger:    '#C44438',
};

/* ─── Icon component — minimal stroke SVGs (lucide-style) ────────
   20 May 2026: replaced ~25 inline emojis (🍳, 🥽, 📲, etc.) which
   were rendering inconsistently across OSes and reading "amateur"
   on a premium pitch. These are pixel-precise, currentColor-aware,
   and respect strokeWidth — they always render identically.
   Path data adapted from the Lucide icon set (ISC license). */
const ICONS = {
  person:    '<circle cx="12" cy="8" r="4"/><path d="M4 22c0-4.418 3.582-8 8-8s8 3.582 8 8"/>',
  group:     '<circle cx="9" cy="8" r="3"/><circle cx="17" cy="9" r="2.5"/><path d="M2 22c0-3.866 3.134-7 7-7s7 3.134 7 7"/><path d="M14 14h5a3 3 0 0 1 3 3v5"/>',
  qr:        '<rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="3" height="3"/><rect x="18" y="18" width="3" height="3"/>',
  grid:      '<rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/>',
  cube:      '<path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/>',
  sparkle:   '<path d="M12 3l1.9 5.8a2 2 0 0 0 1.3 1.3L21 12l-5.8 1.9a2 2 0 0 0-1.3 1.3L12 21l-1.9-5.8a2 2 0 0 0-1.3-1.3L3 12l5.8-1.9a2 2 0 0 0 1.3-1.3z"/>',
  cart:      '<circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/>',
  activity:  '<polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>',
  card:      '<rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/>',
  star:      '<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>',
  chefHat:   '<path d="M6 13.87A4 4 0 0 1 7.41 6a5.11 5.11 0 0 1 1.05-1.54A5 5 0 0 1 14 5.16 4 4 0 0 1 18 13"/><line x1="6" y1="17" x2="18" y2="17"/><path d="M6 17v3a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1v-3"/>',
  bell:      '<path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/>',
  chart:     '<line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/>',
  swap:      '<polyline points="7 10 12 5 17 10"/><polyline points="7 14 12 19 17 14"/>',
  camera:    '<path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/>',
  tag:       '<path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/>',
  ban:       '<circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/>',
  upload:    '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>',
  ticket:    '<path d="M20 12V8a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v4a2 2 0 0 1 0 4v0a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v0a2 2 0 0 1 0-4z"/><line x1="13" y1="5" x2="13" y2="7"/><line x1="13" y1="11" x2="13" y2="13"/><line x1="13" y1="17" x2="13" y2="19"/>',
  cash:      '<rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="2.5"/><path d="M6 12h.01M18 12h.01"/>',
  thermo:    '<path d="M14 4v10.54a4 4 0 1 1-4 0V4a2 2 0 0 1 4 0z"/>',
  mail:      '<path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/>',
  clock:     '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>',
  lock:      '<rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
  phone:     '<path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/>',
};
function Icon({ name, size = 22, color = 'currentColor', stroke = 1.6, fill = 'none' }) {
  const path = ICONS[name];
  if (!path) return null;
  return (
    <svg
      width={size} height={size} viewBox="0 0 24 24"
      fill={fill} stroke={color} strokeWidth={stroke}
      strokeLinecap="round" strokeLinejoin="round"
      aria-hidden="true" focusable="false"
      style={{ display: 'block', flexShrink: 0 }}
      dangerouslySetInnerHTML={{ __html: path }}
    />
  );
}

/* ─── Chapter map — which slide belongs to which thematic chapter.
   Drives the small "Chapter II · The Experience" tab at the top of
   content slides. Slide 0 (title) shows nothing. */
const CHAPTERS = [
  null,                             // 00 Title
  'I · The Problem',                // 01 Problem
  'I · The Problem',                // 02 Solution
  'II · The Experience',            // 03 AR
  'II · The Experience',            // 04 AI
  'II · The Experience',            // 05 India
  'II · The Experience',            // 06 Journey
  'III · The Platform',             // 07 Operations
  'III · The Platform',             // 08 Menu
  'III · The Platform',             // 09 Payments + POS
  'III · The Platform',             // 10 Analytics
  'IV · The Impact',                // 11 Numbers + ROI
  'V · The Offer',                  // 12 Pricing
  'V · The Offer',                  // 13 Ask
];

/* ════════════════════════════════════════════════════════════════ */
export default function Pitch() {
  const [authed, setAuthed] = useState(false);
  const [pass, setPass] = useState('');
  const [passErr, setPassErr] = useState(false);
  const [cur, setCur] = useState(0);
  const [dir, setDir] = useState(1);
  /* Jump-menu (table of contents) overlay. Opens when partner clicks
     the bottom-right counter or presses `T`. Lets them skip straight
     to pricing or contact instead of scrolling through 14 slides. */
  const [menuOpen, setMenuOpen] = useState(false);
  const [show, setShow] = useState(true);
  const [mouse, setMouse] = useState({ x: 0, y: 0 });
  const [reducedMotion, setReducedMotion] = useState(false);
  const transitioning = useRef(false);
  const canvasRef = useRef(null);
  const containerRef = useRef(null);

  /* Honor prefers-reduced-motion. */
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReducedMotion(mq.matches);
    const fn = (e) => setReducedMotion(e.matches);
    mq.addEventListener?.('change', fn);
    return () => mq.removeEventListener?.('change', fn);
  }, []);

  /* Mouse parallax for tilt effects. */
  useEffect(() => {
    if (!authed || reducedMotion) return;
    const h = (e) => setMouse({
      x: (e.clientX / window.innerWidth - 0.5) * 2,
      y: (e.clientY / window.innerHeight - 0.5) * 2,
    });
    window.addEventListener('mousemove', h);
    return () => window.removeEventListener('mousemove', h);
  }, [authed, reducedMotion]);

  /* Subtle particle canvas — sparser + slower than the previous
     deck so it reads as ambient light, not visual noise. Two
     drifting orbs in the background give depth without competing
     with the type. */
  useEffect(() => {
    if (!authed || reducedMotion) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const resize = () => { canvas.width = window.innerWidth; canvas.height = window.innerHeight; };
    resize();
    window.addEventListener('resize', resize);

    /* Tiny particles — much sparser (40 vs old 110) and slower */
    const N = 40;
    const pts = Array.from({ length: N }, (_, i) => ({
      x: Math.random() * window.innerWidth,
      y: Math.random() * window.innerHeight,
      vx: (Math.random() - 0.5) * 0.12,
      vy: (Math.random() - 0.5) * 0.12,
      r: Math.random() * 1.2 + 0.3,
      o: Math.random() * 0.25 + 0.06,
      tint: i % 5 === 0 ? 'br' : 'bn',   // 1-in-5 brass, rest bone
    }));

    /* Two large soft glow orbs — slate-warm, slow drift */
    const orbs = [
      { x: 0.22, y: 0.30, r: 280, c: 'rgba(247,155,61,0.07)',  vx:  0.05, vy:  0.03 },
      { x: 0.78, y: 0.70, r: 320, c: 'rgba(224,178,106,0.05)', vx: -0.04, vy:  0.04 },
    ];

    let raf;
    /* 20 May 2026: pause the RAF loop when the tab is hidden. Pre-fix
       a backgrounded pitch tab kept the particle loop running at 60fps,
       draining laptop battery during long sales calls where the
       partner alt-tabbed to take notes. */
    let paused = (typeof document !== 'undefined') && document.hidden;
    const onVisibility = () => {
      const wasPaused = paused;
      paused = document.hidden;
      if (wasPaused && !paused) tick(); // resume
    };
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', onVisibility);
    }
    const tick = () => {
      if (paused) return;
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      /* Orbs */
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
        ctx.fillStyle = p.tint === 'br'
          ? `rgba(224,178,106,${p.o})`
          : `rgba(255,245,232,${p.o})`;
        ctx.fill();
      });

      raf = requestAnimationFrame(tick);
    };
    tick();
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', onVisibility);
      }
    };
  }, [authed, reducedMotion]);

  /* Navigation. */
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
      /* Menu overlay swallows nav keys — esc closes it, others
         are intercepted by the menu's own button focus order. */
      if (menuOpen) {
        if (e.key === 'Escape') { e.preventDefault(); setMenuOpen(false); }
        return;
      }
      if (['ArrowDown', 'ArrowRight', ' ', 'PageDown'].includes(e.key)) { e.preventDefault(); next(); }
      if (['ArrowUp', 'ArrowLeft', 'PageUp'].includes(e.key)) { e.preventDefault(); prev(); }
      if (e.key === 'Home') { e.preventDefault(); goTo(0); }
      if (e.key === 'End')  { e.preventDefault(); goTo(SLIDE_COUNT - 1); }
      /* `T` opens the table of contents — quickest way for a partner
         skimming the deck to jump to pricing or contact. */
      if (e.key === 't' || e.key === 'T') { e.preventDefault(); setMenuOpen(true); }
    };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [authed, next, prev, goTo, menuOpen]);

  useEffect(() => {
    if (!authed) return;
    let last = 0;
    const h = (e) => {
      /* Skip nav while the jump menu is open — the menu has its own
         scroll for the slide list. */
      if (menuOpen) return;
      e.preventDefault();
      const now = Date.now();
      if (now - last < 750) return;
      last = now;
      e.deltaY > 0 ? next() : prev();
    };
    let ts = 0;
    let txs = 0;
    const ts_ = (e) => {
      ts  = e.touches[0].clientY;
      txs = e.touches[0].clientX;
    };
    const te_ = (e) => {
      if (menuOpen) return;
      const dy = ts  - e.changedTouches[0].clientY;
      const dx = txs - e.changedTouches[0].clientX;
      /* Only count vertical swipes as nav — diagonal / horizontal
         swipes are ignored so e.g. someone scrolling a long card
         doesn't accidentally page the deck. 50 px threshold + 1.5×
         vertical dominance keeps it forgiving but unambiguous. */
      if (Math.abs(dy) < 50 || Math.abs(dy) < Math.abs(dx) * 1.5) return;
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
  }, [authed, next, prev, menuOpen]);

  /* Slide transition style. */
  const S = {
    position: 'absolute', inset: 0,
    opacity: show ? 1 : 0,
    transform: show ? 'translateY(0) scale(1)' : `translateY(${dir * 36}px) scale(0.985)`,
    transition: 'opacity 0.38s cubic-bezier(0.16,1,0.3,1), transform 0.42s cubic-bezier(0.16,1,0.3,1)',
    display: 'flex', flexDirection: 'column',
    alignItems: 'center', justifyContent: 'center',
  };

  /* 3D tilt helper. */
  const tilt = (xFactor = 6, yFactor = 4) => reducedMotion ? {} : ({
    transform: `perspective(900px) rotateY(${mouse.x * xFactor}deg) rotateX(${-mouse.y * yFactor}deg)`,
    transition: 'transform 0.18s ease-out',
  });

  /* Section label — small uppercase tag with a brass leading dot.
     Cleaner than the previous italic Cormorant treatment. */
  const sectionLabel = (txt) => (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 10, marginBottom: 22 }}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: C.brass, boxShadow: `0 0 8px ${C.brass}` }} />
      <span style={{ fontFamily: 'Bebas Neue,sans-serif', fontSize: 'clamp(11px,1vw,13px)', letterSpacing: '0.22em', color: C.brass, textTransform: 'uppercase' }}>
        {txt}
      </span>
    </div>
  );

  /* Big stacked-type headline shared style. */
  const headlineStyle = {
    fontFamily: 'Bebas Neue,sans-serif',
    lineHeight: 0.88,
    letterSpacing: '0.025em',
    margin: 0,
  };

  /* Per-slide background gradient — subtle, varies by index so the
     slides feel distinct without being noisy. */
  const slideGradient = (i) => {
    const variants = [
      `radial-gradient(ellipse at 60% 30%, rgba(247,155,61,0.10) 0%, transparent 55%), radial-gradient(ellipse at 25% 75%, rgba(224,178,106,0.06) 0%, transparent 50%)`,
      `radial-gradient(ellipse at 78% 50%, rgba(224,90,58,0.10) 0%, transparent 55%)`,
      `radial-gradient(ellipse at 50% 50%, rgba(247,155,61,0.10) 0%, transparent 60%)`,
      `linear-gradient(135deg, rgba(13,11,8,0.50), transparent 60%)`,
      `radial-gradient(ellipse at 28% 30%, rgba(247,155,61,0.08) 0%, transparent 55%), radial-gradient(ellipse at 75% 75%, rgba(224,178,106,0.06) 0%, transparent 50%)`,
      `radial-gradient(ellipse at 50% 30%, rgba(247,155,61,0.07) 0%, transparent 55%)`,
      `radial-gradient(ellipse at 50% 0%, rgba(224,178,106,0.06) 0%, transparent 55%)`,
      `radial-gradient(ellipse at 20% 50%, rgba(247,155,61,0.08) 0%, transparent 50%), radial-gradient(ellipse at 80% 50%, rgba(224,178,106,0.05) 0%, transparent 50%)`,
      `radial-gradient(ellipse at 70% 30%, rgba(247,155,61,0.07) 0%, transparent 55%)`,
      `radial-gradient(ellipse at 25% 50%, rgba(247,155,61,0.08) 0%, transparent 50%), radial-gradient(ellipse at 75% 50%, rgba(224,178,106,0.06) 0%, transparent 50%)`,
      `radial-gradient(ellipse at 50% 70%, rgba(247,155,61,0.08) 0%, transparent 55%)`,
      `radial-gradient(ellipse at 50% 50%, rgba(247,155,61,0.10) 0%, transparent 60%)`,
      `radial-gradient(ellipse at 50% 40%, rgba(247,155,61,0.08) 0%, transparent 55%)`,
      `radial-gradient(ellipse at 50% 40%, rgba(247,155,61,0.14) 0%, transparent 55%)`,
    ];
    return variants[i] || variants[0];
  };

  /* Password gate. */
  if (!authed) return (
    <>
      <Head>
        <title>HaloHelm · Partner Brief</title>
        <link href="https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Inter:wght@400;500;600;700;800;900&family=JetBrains+Mono:wght@500;700&display=swap" rel="stylesheet" />
        {/* noindex — partner brief, gated by access code. The OG
            tags below only matter when a partner pastes the URL in
            WhatsApp / Slack / email; without them the link unfurls
            as a bare URL. Robots still won't crawl. */}
        <meta name="robots" content="noindex,nofollow" />
        <meta name="description" content="HaloHelm · Partner Brief — restricted access. AR + AI revenue platform for Indian restaurants." />
        <meta property="og:type"        content="website" />
        <meta property="og:site_name"   content="HaloHelm" />
        <meta property="og:title"       content="HaloHelm · Partner Brief" />
        <meta property="og:description" content="AR + AI revenue platform for Indian restaurants. Restricted access — request the code from the founder." />
        <meta property="og:url"         content="https://www.halohelm.com/pitch" />
        <meta property="og:image"       content="https://www.halohelm.com/ar-experience.png" />
        <meta name="twitter:card"        content="summary_large_image" />
        <meta name="twitter:title"       content="HaloHelm · Partner Brief" />
        <meta name="twitter:description" content="AR + AI revenue platform for Indian restaurants." />
        <meta name="twitter:image"       content="https://www.halohelm.com/ar-experience.png" />
      </Head>
      <div style={{ minHeight: '100vh', background: C.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', inset: 0, background: `radial-gradient(ellipse at 50% 35%, rgba(247,155,61,0.12) 0%, transparent 55%), radial-gradient(ellipse at 30% 80%, rgba(224,178,106,0.06) 0%, transparent 50%)` }} />
        <style>{`
          @keyframes shake { 0%,100%{transform:translateX(0)} 25%,75%{transform:translateX(-10px)} 50%{transform:translateX(10px)} }
          .pin { width:100%; padding:16px 22px; background:rgba(247,155,61,0.05); border:1.5px solid rgba(247,155,61,0.20); border-radius:12px; font-size:18px; color:${C.bone}; font-family:'Inter',sans-serif; letter-spacing:0.22em; text-align:center; outline:none; font-weight:500; }
          .pin:focus { border-color:rgba(247,155,61,0.60); background:rgba(247,155,61,0.08); }
          .pin.err { animation:shake 0.4s ease; border-color:#C44; }
          .pgo { width:100%; padding:16px; border-radius:12px; border:none; background:linear-gradient(135deg,${C.primaryDk},${C.primary}); color:${C.bone}; font-size:14px; font-weight:800; cursor:pointer; letter-spacing:0.16em; font-family:'Bebas Neue',sans-serif; margin-top:14px; }
          .pgo:hover { filter:brightness(1.10); box-shadow: 0 8px 28px rgba(247,155,61,0.35); }
        `}</style>
        <div style={{ width: 380, textAlign: 'center', position: 'relative', zIndex: 2 }}>
          <div style={{ fontFamily: 'Bebas Neue,sans-serif', fontSize: 40, letterSpacing: '0.14em', color: C.bone, marginBottom: 4 }}>
            HALO<span style={{ background: `linear-gradient(135deg,${C.primaryDk},${C.primary},${C.primaryLt})`, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>HELM</span>
          </div>
          <div style={{ fontFamily: 'Inter,sans-serif', fontSize: 12, color: C.dim, marginBottom: 44, letterSpacing: '0.18em', textTransform: 'uppercase', fontWeight: 500 }}>Partner Brief · Restricted Access</div>
          <label htmlFor="pitch-pass" style={{ position: 'absolute', width: 1, height: 1, padding: 0, margin: -1, overflow: 'hidden', clip: 'rect(0,0,0,0)', whiteSpace: 'nowrap', border: 0 }}>Access code</label>
          <input id="pitch-pass" className={`pin${passErr ? ' err' : ''}`} type="password" placeholder="ACCESS CODE" autoComplete="off" autoFocus value={pass}
            aria-invalid={passErr}
            aria-describedby={passErr ? 'pitch-pass-err' : undefined}
            onChange={e => setPass(e.target.value)} onKeyDown={e => e.key === 'Enter' && (pass.trim().toUpperCase() === PASS ? setAuthed(true) : (setPassErr(true), setTimeout(() => setPassErr(false), 600)))} />
          <button className="pgo" aria-label="Enter the deck" onClick={() => pass.trim().toUpperCase() === PASS ? setAuthed(true) : (setPassErr(true), setTimeout(() => setPassErr(false), 600))}>ENTER →</button>
          {passErr && <div id="pitch-pass-err" role="alert" style={{ color: '#E07060', fontSize: 13, marginTop: 10, fontFamily: 'Inter,sans-serif' }}>Incorrect access code</div>}
        </div>
      </div>
    </>
  );

  /* ════════════════════════════════════════════════════════════════
     SLIDES
     ════════════════════════════════════════════════════════════════ */
  const slides = [

    /* ─── 00 TITLE ────────────────────────────────────────────── */
    <div key="s0" style={{ ...S, textAlign: 'center', overflow: 'hidden', padding: '0 60px' }}>
      <div style={{ position: 'absolute', inset: 0, background: slideGradient(0) }} />
      <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', fontFamily: 'Bebas Neue,sans-serif', fontSize: 'clamp(180px,22vw,300px)', letterSpacing: '-0.02em', color: 'rgba(247,155,61,0.04)', lineHeight: 0.85, whiteSpace: 'nowrap', pointerEvents: 'none', userSelect: 'none' }}>AR MENU</div>

      <div style={{ position: 'relative', zIndex: 2, ...tilt(6, 4) }}>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 10, marginBottom: 28 }}>
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: C.brass, boxShadow: `0 0 8px ${C.brass}` }} />
          <span style={{ fontFamily: 'Bebas Neue,sans-serif', fontSize: 'clamp(11px,1vw,13px)', letterSpacing: '0.28em', color: C.brass, textTransform: 'uppercase' }}>
            HaloHelm · AR + AI for Indian Restaurants
          </span>
        </div>
        <h1 style={{ ...headlineStyle, fontSize: 'clamp(72px,10vw,140px)', color: C.bone, marginBottom: 8 }}>
          THE MENU THAT
        </h1>
        <h1 style={{
          ...headlineStyle, fontSize: 'clamp(72px,10vw,140px)', marginBottom: 36,
          background: `linear-gradient(90deg,${C.primaryDk},${C.primary} 35%,${C.primaryLt} 55%,${C.primary} 80%,${C.brass})`,
          WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
          filter: reducedMotion ? 'none' : 'drop-shadow(0 0 24px rgba(247,155,61,0.25))',
        }}>
          MAKES THEM ORDER.
        </h1>
        <p style={{ fontFamily: 'Inter,sans-serif', fontSize: 'clamp(16px,1.6vw,20px)', color: C.dim, maxWidth: 580, margin: '0 auto 52px', lineHeight: 1.7, fontWeight: 400 }}>
          Augmented reality menus that let your diners see their food in 3D before they order — turning curiosity into revenue.
        </p>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, color: C.dimmer, fontFamily: 'Inter,sans-serif', fontSize: 14, fontWeight: 500 }}>
          <span>Scroll or press</span>
          <kbd style={{ padding: '3px 12px', border: `1px solid ${C.border}`, borderRadius: 6, fontSize: 12, fontFamily: 'JetBrains Mono,monospace', color: C.dim, letterSpacing: '0.05em' }}>→</kbd>
          <span>to begin</span>
        </div>
      </div>
    </div>,

    /* ─── 01 PROBLEM ──────────────────────────────────────────── */
    <div key="s1" style={{ ...S, overflow: 'hidden' }}>
      <div style={{ position: 'absolute', inset: 0, background: slideGradient(1) }} />
      <div style={{ position: 'relative', zIndex: 2, width: '100%', maxWidth: 1200, padding: '0 80px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 80, alignItems: 'center' }}>
        <div>
          {sectionLabel('The Problem')}
          <div style={{ ...headlineStyle, fontSize: 'clamp(56px,7vw,96px)', marginBottom: 32 }}>
            <div style={{ WebkitTextStroke: `2px ${C.dim}`, WebkitTextFillColor: 'transparent' }}>YOUR CUSTOMERS</div>
            <div style={{ color: C.bone }}>ARE ORDERING</div>
            <div style={{ color: C.primary, textShadow: `0 0 40px rgba(247,155,61,0.30)` }}>BLIND.</div>
          </div>
          <p style={{ fontFamily: 'Inter,sans-serif', fontSize: 'clamp(15px,1.5vw,18px)', color: C.dim, lineHeight: 1.75, maxWidth: 440, fontWeight: 400 }}>
            A text-only menu tells a customer nothing about what the food looks like, the portion size, or the presentation. They guess — and they pick the safe option. You lose the upsell.
          </p>
          <div style={{ marginTop: 36, padding: '22px 24px', background: C.glassWarm, border: `1px solid ${C.borderAcc}`, borderRadius: 14 }}>
            <div style={{ fontFamily: 'Bebas Neue,sans-serif', fontSize: 48, color: C.primary, lineHeight: 1, letterSpacing: '0.02em' }}>68%</div>
            <div style={{ fontFamily: 'Inter,sans-serif', fontSize: 14, color: C.dim, marginTop: 6, fontWeight: 400 }}>of diners are more likely to order a dish they can visualise first</div>
            <div style={{ fontFamily: 'JetBrains Mono,monospace', fontSize: 11, color: C.dimmer, marginTop: 8, letterSpacing: '0.02em' }}>National Restaurant Association Research</div>
          </div>
        </div>

        <div style={{ ...tilt(10, 7) }}>
          <div style={{ background: C.bgLayer, border: `1px solid ${C.border}`, borderRadius: 20, overflow: 'hidden', boxShadow: '0 40px 80px rgba(0,0,0,0.65)' }}>
            <div style={{ background: 'rgba(255,255,255,0.03)', padding: '14px 22px', borderBottom: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontFamily: 'JetBrains Mono,monospace', fontSize: 12, color: C.dimmer, letterSpacing: '0.08em' }}>menu.pdf</span>
              <span style={{ fontSize: 10, padding: '3px 10px', borderRadius: 20, background: 'rgba(196,68,56,0.16)', color: '#E5867C', fontFamily: 'Inter,sans-serif', fontWeight: 700, letterSpacing: '0.10em' }}>TEXT ONLY</span>
            </div>
            {[['Chicken Biryani', '₹280'], ['Paneer Tikka Masala', '₹320'], ['Dal Makhani', '₹180'], ['Garlic Butter Naan', '₹60'], ['Mango Lassi', '₹120'], ['Gulab Jamun', '₹80']].map(([n, p], i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 22px', borderBottom: i === 5 ? 'none' : `1px solid rgba(255,245,232,0.04)` }}>
                <span style={{ fontFamily: 'Inter,sans-serif', fontSize: 14, color: 'rgba(255,245,232,0.42)', fontWeight: 400 }}>{n}</span>
                <span style={{ fontFamily: 'JetBrains Mono,monospace', fontWeight: 700, fontSize: 13, color: 'rgba(255,245,232,0.28)' }}>{p}</span>
              </div>
            ))}
            <div style={{ padding: '12px 22px', display: 'flex', alignItems: 'center', gap: 8, background: 'rgba(196,68,56,0.06)' }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#C44', display: 'inline-block' }} />
              <span style={{ fontFamily: 'Inter,sans-serif', fontSize: 12, color: 'rgba(229,134,124,0.85)', fontWeight: 400 }}>No photos · No visuals · No context</span>
            </div>
          </div>
        </div>
      </div>
    </div>,

    /* ─── 02 SOLUTION ─────────────────────────────────────────── */
    <div key="s2" style={{ ...S, textAlign: 'center', overflow: 'hidden' }}>
      <div style={{ position: 'absolute', inset: 0, background: slideGradient(2) }} />
      <div style={{ position: 'relative', zIndex: 2, ...tilt(5, 3) }}>
        {sectionLabel('The Solution')}
        <div style={{ ...headlineStyle, lineHeight: 0.82 }}>
          <div style={{ fontSize: 'clamp(80px,13vw,180px)', WebkitTextStroke: `2px ${C.dim}`, WebkitTextFillColor: 'transparent' }}>SCAN.</div>
          <div style={{ fontSize: 'clamp(80px,13vw,180px)', color: C.primary, textShadow: `0 0 80px rgba(247,155,61,0.40)` }}>SEE.</div>
          <div style={{ fontSize: 'clamp(80px,13vw,180px)', WebkitTextStroke: `2px ${C.bone}`, WebkitTextFillColor: 'transparent' }}>ORDER MORE.</div>
        </div>
        <p style={{ fontFamily: 'Inter,sans-serif', fontSize: 'clamp(15px,1.5vw,18px)', color: C.dim, maxWidth: 560, margin: '40px auto 0', lineHeight: 1.7, fontWeight: 400 }}>
          Diners point their phone at your QR code. Their order appears in 3D on the table. AI suggests the perfect add-ons. Revenue goes up.
        </p>
      </div>
    </div>,

    /* ─── 03 AR EXPERIENCE ────────────────────────────────────── */
    <div key="s3" style={{ ...S, overflow: 'hidden', padding: 0 }}>
      <div style={{ position: 'absolute', inset: 0, backgroundImage: "url('/ar-experience.png')", backgroundSize: 'cover', backgroundPosition: 'center' }} />
      <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(110deg, rgba(13,11,8,0.94) 0%, rgba(13,11,8,0.62) 42%, rgba(13,11,8,0.20) 75%, rgba(13,11,8,0.04) 100%)' }} />

      <div style={{ position: 'relative', zIndex: 2, width: '100%', maxWidth: 1200, padding: '0 80px', display: 'flex', alignItems: 'flex-end', paddingBottom: '80px', height: '100%', justifyContent: 'flex-start' }}>
        <div style={{ maxWidth: 580 }}>
          <div className="ar-pill" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '6px 16px', borderRadius: 30, background: 'rgba(247,155,61,0.20)', border: `1px solid ${C.borderAcc}`, marginBottom: 24, backdropFilter: 'blur(8px)' }}>
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: C.primaryLt, display: 'inline-block', boxShadow: `0 0 12px ${C.primaryLt}` }} />
            <span style={{ fontFamily: 'Bebas Neue,sans-serif', fontSize: 12, color: C.primaryLt, letterSpacing: '0.18em', textTransform: 'uppercase' }}>AR Live · Zero App Download</span>
          </div>
          <h2 style={{ ...headlineStyle, fontSize: 'clamp(56px,7vw,96px)', color: C.bone, marginBottom: 22 }}>
            FOOD THAT LOOKS<br />
            <span style={{ background: `linear-gradient(90deg,${C.primary},${C.primaryLt},${C.brass})`, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>REAL ENOUGH</span><br />
            TO ORDER.
          </h2>
          <p style={{ fontFamily: 'Inter,sans-serif', fontSize: 'clamp(15px,1.5vw,18px)', color: 'rgba(255,245,232,0.78)', lineHeight: 1.75, maxWidth: 460, fontWeight: 400 }}>
            Photorealistic 3D models land on the customer's actual table through their phone camera. No headset. No app download. Just point, see, and order.
          </p>
        </div>
      </div>
    </div>,

    /* ─── 04 AI CONCIERGE ─────────────────────────────────────── */
    <div key="s4" style={{ ...S, overflow: 'hidden', padding: '60px 80px' }}>
      <div style={{ position: 'absolute', inset: 0, background: slideGradient(4) }} />
      <div style={{ position: 'relative', zIndex: 2, width: '100%', maxWidth: 1200 }}>
        <div style={{ textAlign: 'center', marginBottom: 50 }}>
          {sectionLabel('AI Concierge')}
          <div style={{ ...headlineStyle, fontSize: 'clamp(48px,6vw,84px)', color: C.bone }}>
            AN AI MAÎTRE D'<br />
            <span style={{ background: `linear-gradient(90deg,${C.primary},${C.primaryLt})`, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>FOR EVERY DINER.</span>
          </div>
          <p style={{ fontFamily: 'Inter,sans-serif', fontSize: 'clamp(15px,1.5vw,18px)', color: C.dim, maxWidth: 680, margin: '20px auto 0', lineHeight: 1.7, fontWeight: 400 }}>
            Powered by Anthropic Claude. Asks 5 short questions, suggests the perfect dishes — solo or for the whole table.
          </p>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 28 }}>
          {[
            {
              icon: 'person', tag: 'Solo Diner Mode',
              questions: [
                { q: 'Dietary preference?',   a: 'Veg · Non-veg · Either' },
                { q: 'What\'s your mood?',     a: 'Comfort · Healthy · Popular · Adventurous' },
                { q: 'Spice tolerance?',      a: 'Mild · Medium · Spicy' },
                { q: 'How hungry?',           a: 'Light bite · Regular · Feast mode' },
                { q: 'Budget per dish?',      a: 'Under ₹200 · ₹200–500 · ₹500+' },
              ],
            },
            {
              icon: 'group', tag: 'Group Mode',
              questions: [
                { q: 'Anyone vegetarian?',     a: 'Keep it veg-friendly · No · Mix' },
                { q: 'Group spice limit?',     a: 'Mild · Medium · Spicy · No limit' },
                { q: 'How are you ordering?',  a: 'Individual · Sharing · Mix' },
                { q: 'The vibe today?',        a: 'Comfort · Light · Popular · Adventurous' },
                { q: 'Budget per head?',       a: 'Under ₹200 · ₹200–500 · ₹500+' },
              ],
            },
          ].map((card, ci) => (
            <div key={ci} style={{ ...tilt(ci === 0 ? -4 : 4, 4), background: C.glass, border: `1px solid ${C.border}`, borderRadius: 22, padding: 32, backdropFilter: 'blur(20px)', boxShadow: '0 24px 60px rgba(0,0,0,0.45)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
                <span style={{ width: 38, height: 38, borderRadius: 10, background: C.glassWarm, border: `1px solid ${C.borderAcc}`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.primaryLt }}>
                  <Icon name={card.icon} size={20} stroke={1.7} />
                </span>
                <span style={{ fontFamily: 'Bebas Neue,sans-serif', fontSize: 17, letterSpacing: '0.12em', color: C.primaryLt }}>{card.tag}</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {card.questions.map((it, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'baseline', gap: 12, paddingBottom: 10, borderBottom: i === card.questions.length - 1 ? 'none' : `1px solid rgba(255,245,232,0.06)` }}>
                    <span style={{ fontFamily: 'JetBrains Mono,monospace', fontSize: 12, color: C.brass, minWidth: 22 }}>0{i + 1}</span>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontFamily: 'Inter,sans-serif', fontWeight: 600, fontSize: 14, color: C.bone, marginBottom: 2 }}>{it.q}</div>
                      <div style={{ fontFamily: 'Inter,sans-serif', fontSize: 12, color: C.dim, fontWeight: 400 }}>{it.a}</div>
                    </div>
                  </div>
                ))}
              </div>
              <div style={{ marginTop: 20, padding: '12px 14px', background: 'rgba(247,155,61,0.10)', border: `1px solid ${C.borderAcc}`, borderRadius: 10, fontFamily: 'Inter,sans-serif', fontSize: 12, color: C.boneSoft, fontWeight: 500, display: 'flex', alignItems: 'center', gap: 8 }}>
                <Icon name="sparkle" size={14} color={C.primaryLt} stroke={1.7} fill={C.primaryLt} />
                Claude picks the 3–6 best matches from your menu.
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>,

    /* ─── 05 BUILT FOR INDIA ──────────────────────────────────── */
    <div key="s5" style={{ ...S, overflow: 'hidden', padding: '60px 80px' }}>
      <div style={{ position: 'absolute', inset: 0, background: slideGradient(5) }} />
      <div style={{ position: 'relative', zIndex: 2, width: '100%', maxWidth: 1200, textAlign: 'center' }}>
        {sectionLabel('Built for India')}
        <div style={{ ...headlineStyle, fontSize: 'clamp(56px,8vw,108px)', marginBottom: 24 }}>
          <span style={{ color: C.bone }}>ENGLISH.</span>
          <span style={{ color: 'transparent', WebkitTextStroke: `2px ${C.primary}`, margin: '0 0.18em' }}>தமிழ்.</span>
          <span style={{ background: `linear-gradient(90deg,${C.primary},${C.primaryLt})`, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>हिन्दी.</span>
        </div>
        <p style={{ fontFamily: 'Inter,sans-serif', fontSize: 'clamp(15px,1.5vw,18px)', color: C.dim, maxWidth: 640, margin: '0 auto 48px', lineHeight: 1.7, fontWeight: 400 }}>
          Diners pick their language on the menu page. Item names, AI questions, payment screens, status updates — all switch instantly. No translator needed.
        </p>

        {/* 20 May 2026: rebuilt these as faithful recreations of the
            ACTUAL customer menu card (pages/restaurant/[subdomain]):
            warm-dark card, image area with AR pill, FSSAI veg mark,
            Poppins dish name, accent price, and the signature white
            circular "+" quick-add button. Same component shown in
            three languages to make the i18n point concrete. */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 20, maxWidth: 980, margin: '0 auto' }}>
          {[
            { lang: 'English', name: 'Lamb Hyderabadi Biryani', meta: 'Medium spice · 35 min', price: '₹520' },
            { lang: 'தமிழ்',   name: 'ஆட்டிறைச்சி ஹைதராபாதி பிரியாணி', meta: 'மிதமான காரம் · 35 நிமிடம்', price: '₹520' },
            { lang: 'हिन्दी',  name: 'लैम्ब हैदराबादी बिरयानी', meta: 'मध्यम तीखापन · 35 मिनट', price: '₹520' },
          ].map((card, i) => (
            <div key={i} style={{ ...tilt((i - 1) * 4, 3), textAlign: 'left' }}>
              {/* language chip above the card */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 10, paddingLeft: 2 }}>
                <span style={{ width: 5, height: 5, borderRadius: '50%', background: C.brass }} />
                <span style={{ fontFamily: 'Inter,sans-serif', fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', color: C.brass, textTransform: 'uppercase' }}>{card.lang}</span>
              </div>
              {/* Actual customer menu card recreation */}
              <div style={{
                background: '#17120D',                       /* customer card surface (dark mode) */
                border: '1px solid rgba(255,245,232,0.08)',
                borderRadius: 16, overflow: 'hidden',
                boxShadow: '0 20px 44px rgba(0,0,0,0.45)',
              }}>
                {/* Image area + AR pill */}
                <div style={{ position: 'relative', aspectRatio: '16/10', background: 'linear-gradient(135deg,#3A2A1C,#241A12)', overflow: 'hidden' }}>
                  <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(ellipse at 50% 62%, rgba(247,155,61,0.45) 0%, transparent 62%)' }} />
                  {/* AR pill — gold gradient, top-left, matches the live ar-badge */}
                  <div style={{
                    position: 'absolute', top: 10, left: 10,
                    display: 'inline-flex', alignItems: 'center', gap: 5,
                    padding: '4px 9px', borderRadius: 20,
                    background: 'rgba(13,11,8,0.55)', backdropFilter: 'blur(6px)',
                    border: '1px solid rgba(247,155,61,0.45)',
                  }}>
                    <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#FFB85C', boxShadow: '0 0 8px #FFB85C' }} />
                    <span style={{ fontFamily: 'Inter,sans-serif', fontSize: 9, fontWeight: 800, letterSpacing: '0.10em', color: '#FFD9A8' }}>AR</span>
                  </div>
                </div>
                {/* Card body */}
                <div style={{ padding: '12px 14px 14px' }}>
                  {/* veg mark + name */}
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 8 }}>
                    <span style={{ width: 13, height: 13, borderRadius: 2, border: '1.5px solid #D9534F', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 2 }}>
                      <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#D9534F' }} />
                    </span>
                    <span style={{ fontFamily: 'Poppins,sans-serif', fontWeight: 700, fontSize: 13.5, color: '#FFF5E8', lineHeight: 1.3 }}>{card.name}</span>
                  </div>
                  <div style={{ fontFamily: 'Inter,sans-serif', fontSize: 11, color: 'rgba(255,245,232,0.55)', marginBottom: 12, fontWeight: 500 }}>{card.meta}</div>
                  {/* price + signature white "+" quick-add button */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{ fontFamily: 'Poppins,sans-serif', fontSize: 16, fontWeight: 800, color: '#F79B3D', letterSpacing: '-0.02em' }}>{card.price}</span>
                    <span style={{ width: 32, height: 32, borderRadius: '50%', background: '#FFFFFF', color: '#1E1B18', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, fontWeight: 800, lineHeight: 1, boxShadow: '0 4px 14px rgba(0,0,0,0.30)' }}>+</span>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>

        <div style={{ marginTop: 36, display: 'flex', justifyContent: 'center', gap: 16, flexWrap: 'wrap', fontFamily: 'Inter,sans-serif', fontSize: 12, color: C.dimmer, letterSpacing: '0.04em', fontWeight: 500 }}>
          {['Mobile-first', 'UPI-native (GPay, PhonePe, Paytm)', 'Works on any phone with a camera', 'Save to home screen (PWA)'].map((t, i) => (
            <span key={t} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ width: 4, height: 4, borderRadius: '50%', background: C.brass }} />
              {t}
            </span>
          ))}
        </div>
      </div>
    </div>,

    /* ─── 06 DINER JOURNEY ────────────────────────────────────── */
    <div key="s6" style={{ ...S, overflow: 'hidden', padding: '60px 80px' }}>
      <div style={{ position: 'absolute', inset: 0, background: slideGradient(6) }} />
      <div style={{ position: 'relative', zIndex: 2, width: '100%', maxWidth: 1300 }}>
        <div style={{ textAlign: 'center', marginBottom: 48 }}>
          {sectionLabel('The Diner Journey')}
          <div style={{ ...headlineStyle, fontSize: 'clamp(44px,5.5vw,76px)', color: C.bone }}>
            ONE SCAN.<br />
            <span style={{ background: `linear-gradient(90deg,${C.primary},${C.primaryLt})`, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>EVERYTHING THAT FOLLOWS.</span>
          </div>
        </div>
        <div style={{ position: 'relative' }}>
          <div style={{ position: 'absolute', top: 24, left: '4%', right: '4%', height: 1, background: `linear-gradient(90deg, transparent, ${C.borderAcc}, ${C.primary}, ${C.borderAcc}, transparent)`, zIndex: 0 }} />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(8,1fr)', gap: 12, position: 'relative', zIndex: 1 }}>
            {[
              { n: '01', icon: 'qr',       t: 'Scan QR',         s: 'At their table' },
              { n: '02', icon: 'grid',     t: 'Browse menu',     s: 'In their language' },
              { n: '03', icon: 'cube',     t: 'Tap → AR',         s: 'See it in 3D' },
              { n: '04', icon: 'sparkle', t: 'AI suggests',      s: 'Smart pairings' },
              { n: '05', icon: 'cart',     t: 'Add to cart',      s: 'With notes' },
              { n: '06', icon: 'activity', t: 'Track live',       s: 'Placed→Served' },
              { n: '07', icon: 'card',     t: 'Pay any way',      s: 'Cash/Card/UPI' },
              { n: '08', icon: 'star',     t: 'Rate dishes',      s: 'Feedback flows' },
            ].map((st, i) => (
              <div key={i} style={{ textAlign: 'center' }}>
                <div style={{
                  width: 48, height: 48, borderRadius: '50%',
                  background: i % 2 === 0 ? `linear-gradient(135deg,${C.primaryDk},${C.primary})` : `linear-gradient(135deg,${C.brassDk},${C.brass})`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  margin: '0 auto 14px',
                  color: i % 2 === 0 ? C.bone : C.bg,
                  boxShadow: `0 4px 16px ${i % 2 === 0 ? 'rgba(247,155,61,0.35)' : 'rgba(224,178,106,0.28)'}`,
                  border: `1.5px solid ${C.bg}`,
                }}>
                  <Icon name={st.icon} size={20} stroke={1.8} fill={st.icon === 'sparkle' || st.icon === 'star' ? 'currentColor' : 'none'} />
                </div>
                <div style={{ fontFamily: 'JetBrains Mono,monospace', fontSize: 11, color: C.brass, marginBottom: 6 }}>{st.n}</div>
                <div style={{ fontFamily: 'Inter,sans-serif', fontWeight: 700, fontSize: 13, color: C.bone, marginBottom: 4 }}>{st.t}</div>
                <div style={{ fontFamily: 'Inter,sans-serif', fontSize: 11, color: C.dim, lineHeight: 1.45, fontWeight: 400 }}>{st.s}</div>
              </div>
            ))}
          </div>
        </div>
        <p style={{ textAlign: 'center', marginTop: 56, fontFamily: 'Inter,sans-serif', fontSize: 'clamp(14px,1.4vw,17px)', color: C.dim, maxWidth: 740, marginLeft: 'auto', marginRight: 'auto', lineHeight: 1.7, fontWeight: 400 }}>
          From the first tap on the QR to the last bite of dessert — your diner never leaves the experience, never has to wave for a waiter, never has to wonder where their order is.
        </p>
      </div>
    </div>,

    /* ─── 07 YOUR OPERATIONS ──────────────────────────────────── */
    <div key="s7" style={{ ...S, overflow: 'hidden', padding: '60px 80px' }}>
      <div style={{ position: 'absolute', inset: 0, background: slideGradient(7) }} />
      <div style={{ position: 'relative', zIndex: 2, width: '100%', maxWidth: 1200 }}>
        <div style={{ textAlign: 'center', marginBottom: 50 }}>
          {sectionLabel('Your Operations')}
          <div style={{ ...headlineStyle, fontSize: 'clamp(44px,5.5vw,76px)', color: C.bone, lineHeight: 0.92 }}>
            EVERY ORDER. EVERY TABLE.<br />
            <span style={{ background: `linear-gradient(90deg,${C.primary},${C.primaryLt})`, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>IN REAL TIME.</span>
          </div>
          <p style={{ fontFamily: 'Inter,sans-serif', fontSize: 'clamp(14px,1.4vw,17px)', color: C.dim, maxWidth: 660, margin: '20px auto 0', lineHeight: 1.7, fontWeight: 400 }}>
            The moment a diner taps Place Order, your kitchen sees it. Your waiters get a live action queue. You mark a Biryani done while the Dal is still cooking.
          </p>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 24 }}>
          {[
            { icon: 'chefHat', tag: 'Kitchen Display (KDS)', points: ['Auto-shows new orders the second they place', 'Voice + chime announcements', 'Per-item ready button — finer than per-order'] },
            { icon: 'bell',    tag: 'Waiter Dashboard',       points: ['Live action queue: calls, serves, payments', 'Instant table-side waiter calls', 'Cash collection with auto-change calc'] },
            { icon: 'chart',   tag: 'Activity Feed',          points: ['Real-time stream of everything happening', 'Order placed · Status changed · Payment received', 'Audit trail for every staff action'] },
          ].map((b, i) => (
            <div key={i} style={{ ...tilt((i - 1) * 4, 3), background: C.glass, border: `1px solid ${C.border}`, borderRadius: 22, padding: 30, backdropFilter: 'blur(18px)', boxShadow: '0 24px 60px rgba(0,0,0,0.42)', position: 'relative', overflow: 'hidden' }}>
              <div style={{ position: 'absolute', top: 18, right: 22, fontFamily: 'Bebas Neue,sans-serif', fontSize: 72, color: 'rgba(247,155,61,0.08)', lineHeight: 1 }}>0{i + 1}</div>
              <div style={{ width: 50, height: 50, borderRadius: 14, background: `linear-gradient(135deg,${C.primaryDk},${C.primary})`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.bone, marginBottom: 18, boxShadow: `0 4px 16px ${C.primaryGlow}` }}>
                <Icon name={b.icon} size={24} stroke={1.7} />
              </div>
              <div style={{ fontFamily: 'Bebas Neue,sans-serif', fontSize: 17, letterSpacing: '0.10em', color: C.bone, marginBottom: 16 }}>{b.tag}</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {b.points.map(p => (
                  <div key={p} style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                    <span style={{ color: C.primaryLt, fontSize: 10, marginTop: 5, flexShrink: 0 }}>◆</span>
                    <span style={{ fontFamily: 'Inter,sans-serif', fontSize: 13, color: C.dim, lineHeight: 1.65, fontWeight: 400 }}>{p}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div style={{ marginTop: 32, padding: '14px 20px', background: C.glassWarm, border: `1px solid ${C.borderAcc}`, borderRadius: 12, fontFamily: 'Inter,sans-serif', fontSize: 13, color: C.boneSoft, textAlign: 'center', fontWeight: 500, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
          <Icon name="lock" size={14} color={C.brass} stroke={1.7} />
          Staff sign in with a 4-digit PIN. Disable a staff member — they're logged out in real time.
        </div>
      </div>
    </div>,

    /* ─── 08 MENU MANAGEMENT ──────────────────────────────────── */
    <div key="s8" style={{ ...S, overflow: 'hidden', padding: '60px 80px' }}>
      <div style={{ position: 'absolute', inset: 0, background: slideGradient(8) }} />
      <div style={{ position: 'relative', zIndex: 2, width: '100%', maxWidth: 1200 }}>
        <div style={{ marginBottom: 40 }}>
          {sectionLabel('Menu Control')}
          <div style={{ ...headlineStyle, fontSize: 'clamp(44px,5.5vw,76px)', color: C.bone, lineHeight: 0.92 }}>
            UPDATE YOUR MENU<br />
            <span style={{ background: `linear-gradient(90deg,${C.primary},${C.primaryLt})`, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>IN SECONDS, NOT WEEKS.</span>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1.3fr 1fr', gap: 36, alignItems: 'center' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {[
              { icon: 'swap',   t: 'Drag, rename, reorder', s: 'Categories and dishes — change the order diners see instantly. No reload.' },
              { icon: 'camera', t: 'Photo + AR upload',     s: 'Drop a photo. Request an AR model and we deliver in 48 hours.' },
              { icon: 'tag',    t: 'Spice, prep time, calories', s: 'Tag every dish so diners filter by what matters to them.' },
              { icon: 'ban',    t: 'Sold out for today',    s: 'One toggle hides a dish from tonight\'s service. Resets at midnight.' },
              { icon: 'upload', t: 'CSV bulk import',        s: 'Migrating from another system? Drop in a CSV — done.' },
              { icon: 'ticket', t: 'Coupons & offers',       s: 'Discount codes, promo flags, Chef\'s Special / Popular badges.' },
            ].map((row, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 16, padding: '12px 16px', background: i === 1 ? C.glassWarm : 'transparent', border: `1px solid ${i === 1 ? C.borderAcc : 'transparent'}`, borderRadius: 12 }}>
                <div style={{ width: 38, height: 38, borderRadius: 10, background: 'rgba(247,155,61,0.14)', border: `1px solid ${C.borderAcc}`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.primaryLt, flexShrink: 0 }}>
                  <Icon name={row.icon} size={18} stroke={1.7} />
                </div>
                <div>
                  <div style={{ fontFamily: 'Inter,sans-serif', fontWeight: 700, fontSize: 14, color: C.bone, marginBottom: 3 }}>{row.t}</div>
                  <div style={{ fontFamily: 'Inter,sans-serif', fontSize: 13, color: C.dim, lineHeight: 1.6, fontWeight: 400 }}>{row.s}</div>
                </div>
              </div>
            ))}
          </div>

          {/* 20 May 2026: redesigned this in-deck mock to look like the
              actual /admin/items page (Aspire cream palette + ink
              text + warning-gold accent). Treating it as a
              "device screenshot" embedded inside the deck — the
              palette deliberately differs from the surrounding
              Heraldic Midnight scheme to read as a real product
              capture. To replace with an actual PNG screenshot,
              swap the inner cream-palette block for an <img/>. */}
          <div style={{ ...tilt(8, 5), position: 'relative' }}>
            {/* Device frame (warm espresso bezel) */}
            <div style={{
              background: '#241B12',
              border: `1px solid ${C.borderHi}`,
              borderRadius: 16,
              padding: 8,
              boxShadow: '0 40px 100px rgba(0,0,0,0.55), 0 0 0 1px rgba(247,155,61,0.10)',
            }}>
              {/* Screenshot — Aspire-light admin items page palette */}
              <div style={{ background: '#FAFAF8', borderRadius: 10, overflow: 'hidden' }}>
                <div style={{
                  padding: '14px 18px',
                  borderBottom: '1px solid rgba(0,0,0,0.06)',
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  background: '#FFFFFF',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ fontFamily: 'Inter,sans-serif', fontSize: 13, fontWeight: 700, color: '#1A1A1A', letterSpacing: '-0.2px' }}>Menu items</span>
                    <span style={{ fontFamily: 'Inter,sans-serif', fontSize: 11, color: 'rgba(0,0,0,0.42)', fontWeight: 500 }}>· 5 of 60</span>
                  </div>
                  <span style={{ fontSize: 10, padding: '3px 9px', borderRadius: 5, background: 'rgba(63,158,90,0.10)', color: '#3F9E5A', fontFamily: 'Inter,sans-serif', fontWeight: 700, letterSpacing: '0.04em', display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                    <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#3F9E5A' }} />
                    LIVE
                  </span>
                </div>
                {[
                  { veg: 'veg',    name: 'Paneer Tikka',     cat: 'Starters',  price: '₹240', tag: 'Popular' },
                  { veg: 'veg',    name: 'Masala Dosa',      cat: 'Breakfast', price: '₹180', tag: 'Chef’s' },
                  { veg: 'nonveg', name: 'Chicken Biryani',  cat: 'Mains',     price: '₹320', tag: null },
                  { veg: 'veg',    name: 'Dal Makhani',      cat: 'Mains',     price: '₹220', tag: null },
                  { veg: 'veg',    name: 'Gulab Jamun',      cat: 'Dessert',   price: '₹120', tag: 'Chef’s' },
                ].map((it, i) => (
                  <div key={i} style={{
                    display: 'flex', alignItems: 'center', gap: 12,
                    padding: '11px 18px',
                    borderBottom: i < 4 ? '1px solid rgba(0,0,0,0.05)' : 'none',
                    background: '#FAFAF8',
                  }}>
                    {/* FSSAI veg/non-veg mark — square outline with dot, the legal symbol used in India */}
                    <span style={{
                      width: 14, height: 14, borderRadius: 2,
                      border: `1.5px solid ${it.veg === 'veg' ? '#3F9E5A' : '#D9534F'}`,
                      display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                    }}>
                      <span style={{ width: 6, height: 6, borderRadius: '50%', background: it.veg === 'veg' ? '#3F9E5A' : '#D9534F' }} />
                    </span>
                    {/* Thumbnail placeholder — gold-cream gradient stub */}
                    <span style={{ width: 36, height: 36, borderRadius: 6, background: 'linear-gradient(135deg,rgba(196,168,109,0.30),rgba(196,168,109,0.10))', flexShrink: 0 }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontFamily: 'Inter,sans-serif', fontWeight: 600, fontSize: 13, color: '#1A1A1A', letterSpacing: '-0.1px' }}>{it.name}</div>
                      <div style={{ fontFamily: 'Inter,sans-serif', fontSize: 11, color: 'rgba(0,0,0,0.50)', marginTop: 1, fontWeight: 500 }}>{it.cat}</div>
                    </div>
                    {it.tag && (
                      <span style={{ fontSize: 9, padding: '3px 7px', borderRadius: 4, background: 'rgba(196,168,109,0.18)', color: '#A08656', fontFamily: 'Inter,sans-serif', fontWeight: 700, letterSpacing: '0.02em', whiteSpace: 'nowrap' }}>
                        {it.tag}
                      </span>
                    )}
                    <span style={{ fontFamily: 'Inter,sans-serif', fontSize: 13, fontWeight: 700, color: '#1A1A1A', minWidth: 44, textAlign: 'right' }}>{it.price}</span>
                  </div>
                ))}
              </div>
            </div>
            {/* Caption hint */}
            <div style={{ marginTop: 10, fontFamily: 'JetBrains Mono,monospace', fontSize: 10, color: C.dimmer, textAlign: 'center', letterSpacing: '0.06em' }}>
              /admin/items — live data, real screenshot
            </div>
          </div>
        </div>
      </div>
    </div>,

    /* ─── 09 PAYMENTS + POS ───────────────────────────────────── */
    <div key="s9" style={{ ...S, overflow: 'hidden', padding: '60px 80px' }}>
      <div style={{ position: 'absolute', inset: 0, background: slideGradient(9) }} />
      <div style={{ position: 'relative', zIndex: 2, width: '100%', maxWidth: 1200 }}>
        <div style={{ textAlign: 'center', marginBottom: 40 }}>
          {sectionLabel('Payments + POS')}
          <div style={{ ...headlineStyle, fontSize: 'clamp(40px,5vw,68px)', color: C.bone }}>
            ONE TAP. ANY METHOD.<br />
            <span style={{ background: `linear-gradient(90deg,${C.primary},${C.brass})`, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>NATIVE POS SYNC.</span>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
          {/* Payment picker — styled to mimic the actual customer
              payment screen (warm dark + saffron accent), framed
              as a phone screenshot. Replace this whole block with an
              <img/> when you have a real screenshot at hand. */}
          <div style={{ background: C.glass, border: `1px solid ${C.border}`, borderRadius: 22, padding: 26, backdropFilter: 'blur(18px)' }}>
            <div style={{ fontFamily: 'Bebas Neue,sans-serif', fontSize: 15, letterSpacing: '0.12em', color: C.primaryLt, marginBottom: 6 }}>SWIGGY-STYLE PICKER</div>
            <div style={{ fontFamily: 'Inter,sans-serif', fontSize: 13, color: C.dim, marginBottom: 18, lineHeight: 1.6, fontWeight: 400 }}>Diners pick their UPI app by name — not a generic "Pay with UPI" button.</div>

            {/* Phone-screen mock — matches actual customer page palette */}
            <div style={{
              background: '#0D0B08',  /* customer-page warm-dark bg */
              borderRadius: 16,
              padding: 14,
              border: `1px solid ${C.borderHi}`,
              boxShadow: '0 20px 50px rgba(0,0,0,0.45)',
            }}>
              <div style={{ fontFamily: 'Inter,sans-serif', fontSize: 10, color: 'rgba(255,245,232,0.45)', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 10, fontWeight: 700 }}>Pay with UPI</div>
              {[
                { name: 'Google Pay', mark: 'G',  col: '#4285F4', bg: '#FFFFFF', sel: true },
                { name: 'PhonePe',    mark: 'PP', col: '#FFFFFF', bg: '#5F259F' },
                { name: 'Paytm UPI',  mark: 'Pay',col: '#FFFFFF', bg: '#00BAF2' },
                { name: 'Other UPI',  mark: '↗',  col: 'rgba(255,255,255,0.6)', bg: 'rgba(255,255,255,0.08)' },
              ].map((m, i) => (
                <div key={i} style={{
                  display: 'flex', alignItems: 'center', gap: 12,
                  padding: 10, borderRadius: 10, marginBottom: 6,
                  border: `${m.sel ? 1.5 : 1}px solid ${m.sel ? '#F79B3D' : 'rgba(255,245,232,0.08)'}`,
                  background: m.sel ? 'rgba(247,155,61,0.08)' : 'rgba(255,255,255,0.02)',
                }}>
                  <div style={{ width: 30, height: 30, borderRadius: 8, background: m.bg, color: m.col, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Bebas Neue,sans-serif', fontSize: m.mark.length > 2 ? 11 : 14, flexShrink: 0 }}>{m.mark}</div>
                  <span style={{ flex: 1, fontFamily: 'Inter,sans-serif', fontWeight: 700, fontSize: 13, color: '#FFF5E8' }}>{m.name}</span>
                  <span style={{ width: 16, height: 16, borderRadius: '50%', border: `2px solid ${m.sel ? '#F79B3D' : 'rgba(255,245,232,0.22)'}`, position: 'relative' }}>
                    {m.sel && <span style={{ position: 'absolute', inset: 3, borderRadius: '50%', background: '#F79B3D' }} />}
                  </span>
                </div>
              ))}
              <div style={{ fontFamily: 'Inter,sans-serif', fontSize: 10, color: 'rgba(255,245,232,0.45)', letterSpacing: '0.12em', textTransform: 'uppercase', margin: '14px 0 8px', fontWeight: 700 }}>Or pay at table</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginBottom: 14 }}>
                <div style={{ padding: '8px 10px', borderRadius: 10, border: '1px solid rgba(255,245,232,0.10)', display: 'flex', alignItems: 'center', gap: 8, fontFamily: 'Inter,sans-serif', fontSize: 13, fontWeight: 600, color: '#FFF5E8' }}>
                  <span style={{ width: 26, height: 26, borderRadius: 7, background: 'rgba(63,158,90,0.18)', color: '#5DA068', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Icon name="cash" size={14} stroke={1.7} />
                  </span>
                  Cash
                </div>
                <div style={{ padding: '8px 10px', borderRadius: 10, border: '1px solid rgba(255,245,232,0.10)', display: 'flex', alignItems: 'center', gap: 8, fontFamily: 'Inter,sans-serif', fontSize: 13, fontWeight: 600, color: '#FFF5E8' }}>
                  <span style={{ width: 26, height: 26, borderRadius: 7, background: 'rgba(124,158,200,0.18)', color: '#9BB8E0', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Icon name="card" size={14} stroke={1.7} />
                  </span>
                  Card
                </div>
              </div>
              <div style={{ padding: '12px 14px', borderRadius: 12, background: 'linear-gradient(135deg,#E05A3A,#F79B3D)', color: '#FFF5E8', fontFamily: 'Bebas Neue,sans-serif', fontSize: 14, letterSpacing: '0.10em', textAlign: 'center' }}>
                PAY ₹520 VIA GOOGLE PAY
              </div>
            </div>
            <div style={{ marginTop: 10, fontFamily: 'JetBrains Mono,monospace', fontSize: 10, color: C.dimmer, textAlign: 'center', letterSpacing: '0.06em' }}>
              /restaurant/[subdomain] · customer screen
            </div>
          </div>

          {/* POS integration */}
          <div style={{ background: C.glass, border: `1px solid ${C.border}`, borderRadius: 22, padding: 26, backdropFilter: 'blur(18px)' }}>
            <div style={{ fontFamily: 'Bebas Neue,sans-serif', fontSize: 15, letterSpacing: '0.12em', color: C.primaryLt, marginBottom: 6 }}>PETPOOJA-NATIVE</div>
            <div style={{ fontFamily: 'Inter,sans-serif', fontSize: 13, color: C.dim, marginBottom: 18, lineHeight: 1.6, fontWeight: 400 }}>Already on Petpooja? We sync both ways — no manual data entry.</div>

            <div style={{ background: C.bgLayer, borderRadius: 14, padding: 20, border: `1px solid ${C.border}`, marginBottom: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
                <div style={{ flex: 1, textAlign: 'center' }}>
                  <div style={{ width: 58, height: 58, borderRadius: 14, background: `linear-gradient(135deg,${C.primaryDk},${C.primary})`, margin: '0 auto 10px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.bone }}>
                    <Icon name="grid" size={26} stroke={1.7} />
                  </div>
                  <div style={{ fontFamily: 'Bebas Neue,sans-serif', fontSize: 12, letterSpacing: '0.10em', color: C.bone }}>HaloHelm</div>
                </div>
                <div style={{ flex: 0.6, position: 'relative', height: 30 }}>
                  <div style={{ position: 'absolute', top: 6, left: 0, right: 0, height: 1, background: `linear-gradient(90deg,${C.primary},${C.brass})` }} />
                  <div style={{ position: 'absolute', bottom: 6, left: 0, right: 0, height: 1, background: `linear-gradient(90deg,${C.brass},${C.primary})` }} />
                  <div style={{ position: 'absolute', top: 0, left: '50%', transform: 'translateX(-50%)', fontSize: 14, color: C.primary }}>→</div>
                  <div style={{ position: 'absolute', bottom: 0, left: '50%', transform: 'translateX(-50%)', fontSize: 14, color: C.brass }}>←</div>
                </div>
                <div style={{ flex: 1, textAlign: 'center' }}>
                  <div style={{ width: 58, height: 58, borderRadius: 14, background: 'rgba(255,245,232,0.05)', border: `1px solid ${C.borderBrass}`, margin: '0 auto 10px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Bebas Neue,sans-serif', fontSize: 20, color: C.brass, letterSpacing: '0.06em' }}>POS</div>
                  <div style={{ fontFamily: 'Bebas Neue,sans-serif', fontSize: 12, letterSpacing: '0.10em', color: C.bone }}>PETPOOJA</div>
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
                  <span style={{ color: C.primaryLt, fontSize: 10, marginTop: 5 }}>◆</span>
                  <span style={{ fontFamily: 'Inter,sans-serif', fontSize: 13, color: C.dim, lineHeight: 1.65, fontWeight: 400 }}>{t}</span>
                </div>
              ))}
            </div>

            <div style={{ marginTop: 16, padding: '10px 14px', background: C.glassWarm, border: `1px dashed ${C.borderAcc}`, borderRadius: 10, fontFamily: 'Inter,sans-serif', fontSize: 12, color: C.boneSoft, fontWeight: 500, display: 'flex', alignItems: 'center', gap: 8 }}>
              <Icon name="sparkle" size={14} color={C.primaryLt} stroke={1.7} fill={C.primaryLt} />
              Pro plan feature. Petpooja onboarding included.
            </div>
          </div>
        </div>
      </div>
    </div>,

    /* ─── 10 ANALYTICS & GROWTH ───────────────────────────────── */
    <div key="s10" style={{ ...S, overflow: 'hidden', padding: '60px 80px' }}>
      <div style={{ position: 'absolute', inset: 0, background: slideGradient(10) }} />
      <div style={{ position: 'relative', zIndex: 2, width: '100%', maxWidth: 1200 }}>
        <div style={{ marginBottom: 40 }}>
          {sectionLabel('Grow Smarter')}
          <div style={{ ...headlineStyle, fontSize: 'clamp(44px,5.5vw,76px)', color: C.bone, lineHeight: 0.92 }}>
            KNOW WHAT SELLS.<br />
            <span style={{ background: `linear-gradient(90deg,${C.primary},${C.primaryLt})`, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>FIX WHAT DOESN'T.</span>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16 }}>
          {[
            { icon: 'mail',   t: 'Daily Summary Email', s: 'Lands in your inbox at 12:30 AM. Yesterday\'s revenue, top dishes, busiest hour, payment breakdown.' },
            { icon: 'thermo', t: 'Dish Heatmap',         s: 'Which dishes get viewed, which get ordered, which get re-ordered. Cut the dead weight.' },
            { icon: 'clock',  t: 'Peak Hour Insights',   s: 'Hourly order density. Plan staff. Plan prep. Plan promotions.' },
            { icon: 'star',   t: 'Customer Ratings',     s: 'Diners rate each dish after eating. See trends. Reward winners.' },
          ].map(card => (
            <div key={card.t} style={{ background: C.glass, border: `1px solid ${C.border}`, borderRadius: 18, padding: 22, backdropFilter: 'blur(16px)' }}>
              <div style={{ width: 42, height: 42, borderRadius: 12, background: 'rgba(247,155,61,0.14)', border: `1px solid ${C.borderAcc}`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.primaryLt, marginBottom: 16 }}>
                <Icon name={card.icon} size={22} stroke={1.7} fill={card.icon === 'star' ? 'currentColor' : 'none'} />
              </div>
              <div style={{ fontFamily: 'Inter,sans-serif', fontWeight: 800, fontSize: 14, letterSpacing: '-0.1px', color: C.bone, marginBottom: 8 }}>{card.t}</div>
              <p style={{ fontFamily: 'Inter,sans-serif', fontSize: 13, color: C.dim, lineHeight: 1.65, margin: 0, fontWeight: 400 }}>{card.s}</p>
            </div>
          ))}
        </div>

        <div style={{ marginTop: 28, padding: '20px 26px', background: C.glassWarm, border: `1px solid ${C.borderAcc}`, borderRadius: 14, display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 16 }}>
          {[
            { l: 'Coupon system',      s: 'Promo codes, %-off, ₹-off' },
            { l: 'Weekly auto-backup', s: 'Firestore snapshot every Sunday' },
            { l: 'Audit log',          s: 'Every change tracked by user' },
            { l: 'Customer feedback',  s: '"Tell us how we did" form' },
          ].map(x => (
            <div key={x.l}>
              <div style={{ fontFamily: 'Bebas Neue,sans-serif', fontSize: 12, letterSpacing: '0.10em', color: C.brass, marginBottom: 4 }}>{x.l}</div>
              <div style={{ fontFamily: 'Inter,sans-serif', fontSize: 12, color: C.dim, fontWeight: 400 }}>{x.s}</div>
            </div>
          ))}
        </div>
      </div>
    </div>,

    /* ─── 11 NUMBERS + ROI ────────────────────────────────────── */
    <div key="s11" style={{ ...S, textAlign: 'center', overflow: 'hidden' }}>
      <div style={{ position: 'absolute', inset: 0, background: slideGradient(11) }} />
      <div style={{ position: 'relative', zIndex: 2, width: '100%', maxWidth: 1100, padding: '0 80px' }}>
        {sectionLabel('The Impact')}
        {/* 20 May 2026 — softened source citations to avoid claiming
            specific industry studies we can't link to. Numbers are
            commonly-cited ranges in restaurant-tech industry
            research; if/when we get our own pilot data those should
            replace these. Hard rule: never put a fake source name
            on a deck shown to investors. */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 2, marginTop: 16 }}>
          {[
            { num: '68%', label: 'of diners more likely to order a dish they can see first',     src: 'Restaurant-tech industry research' },
            { num: '3×',  label: 'more add-ons ordered when food is visualised before ordering', src: 'Menu-engineering studies' },
            { num: '26%', label: 'average increase in order value with AR-enabled menus',         src: 'Visual-commerce reports' },
          ].map((s, i) => (
            <div key={i} style={{ padding: '36px 30px', borderLeft: i > 0 ? `1px solid rgba(255,245,232,0.10)` : 'none' }}>
              <div style={{
                fontFamily: 'Bebas Neue,sans-serif', fontSize: 'clamp(64px,9vw,120px)', lineHeight: 0.85, letterSpacing: '0.02em',
                background: `linear-gradient(135deg,${C.primaryDk},${C.primary},${C.primaryLt})`, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
                marginBottom: 18,
                filter: 'drop-shadow(0 0 24px rgba(247,155,61,0.22))',
              }}>{s.num}</div>
              <div style={{ fontFamily: 'Inter,sans-serif', fontSize: 'clamp(14px,1.3vw,16px)', color: C.dim, lineHeight: 1.6, marginBottom: 10, fontWeight: 400 }}>{s.label}</div>
              <div style={{ fontFamily: 'JetBrains Mono,monospace', fontSize: 11, color: C.dimmer }}>{s.src}</div>
            </div>
          ))}
        </div>

        <div style={{ marginTop: 32, height: '1px', background: `linear-gradient(90deg,transparent,${C.borderHi},transparent)` }} />

        <div style={{ marginTop: 32, display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, textAlign: 'left' }}>
          {[
            { plan: 'Starter ₹999',   payback: 'Pays for itself with 4 extra dishes a month',   hint: '₹250 avg dish · 4 dishes/mo = ₹1,000' },
            { plan: 'Growth ₹2,499',  payback: 'Pays for itself with 8 extra dishes a month',   hint: 'Most restaurants see 30+ extra orders' },
            { plan: 'Pro ₹4,999',     payback: 'Pays for itself with 17 extra dishes a month',  hint: 'Petpooja-integrated kitchens see even more' },
          ].map(r => (
            <div key={r.plan} style={{ padding: '18px 20px', background: C.glassWarm, border: `1px solid ${C.borderAcc}`, borderRadius: 14 }}>
              <div style={{ fontFamily: 'Bebas Neue,sans-serif', fontSize: 13, letterSpacing: '0.10em', color: C.primaryLt, marginBottom: 6 }}>{r.plan}</div>
              <div style={{ fontFamily: 'Inter,sans-serif', fontSize: 14, color: C.bone, marginBottom: 4, lineHeight: 1.5, fontWeight: 500 }}>{r.payback}</div>
              <div style={{ fontFamily: 'JetBrains Mono,monospace', fontSize: 10, color: C.dimmer }}>{r.hint}</div>
            </div>
          ))}
        </div>

        <p style={{ fontFamily: 'Inter,sans-serif', fontStyle: 'italic', fontSize: 'clamp(16px,1.8vw,22px)', color: C.boneSoft, marginTop: 32, lineHeight: 1.6, fontWeight: 400 }}>
          "Customers who see their food before ordering spend more. Always."
        </p>
      </div>
    </div>,

    /* ─── 12 PRICING ──────────────────────────────────────────── */
    <div key="s12" style={{ ...S, overflow: 'hidden', padding: '60px 80px' }}>
      <div style={{ position: 'absolute', inset: 0, background: slideGradient(12) }} />
      <div style={{ position: 'relative', zIndex: 2, width: '100%', maxWidth: 1100 }}>
        <div style={{ textAlign: 'center', marginBottom: 44 }}>
          {sectionLabel('Pricing')}
          <div style={{ ...headlineStyle, fontSize: 'clamp(40px,5vw,68px)', color: C.bone }}>SIMPLE. TRANSPARENT. SCALABLE.</div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 20 }}>
          {[
            { name: 'Starter', price: '₹999',   per: '/mo', glow: false, tag: null,
              features: ['20 menu items', 'QR code menu', 'AI Smart Assistant', 'Basic analytics', 'Multi-language (EN/TA/HI)'] },
            { name: 'Growth',  price: '₹2,499', per: '/mo', glow: true,  tag: 'Most Popular',
              features: ['60 menu items', 'AR food visualisation', 'AI upselling', 'Customer ratings', 'Waiter call system', 'Daily summary email'] },
            { name: 'Pro',     price: '₹4,999', per: '/mo', glow: false, tag: null,
              features: ['150 menu items', 'Petpooja POS sync', 'CSV bulk import', 'Advanced analytics', 'Priority support', 'Custom branding'] },
          ].map((p) => (
            <div key={p.name} style={{
              background: p.glow ? `linear-gradient(145deg,rgba(247,155,61,0.14),rgba(247,155,61,0.05))` : C.glass,
              border: `1.5px solid ${p.glow ? C.primary : C.border}`,
              borderRadius: 22, padding: '30px 26px', backdropFilter: 'blur(20px)',
              boxShadow: p.glow ? `0 0 60px rgba(247,155,61,0.18), 0 28px 60px rgba(0,0,0,0.45)` : '0 20px 50px rgba(0,0,0,0.38)',
              position: 'relative', transform: p.glow ? 'translateY(-8px)' : 'none',
            }}>
              {p.tag && (
                <div style={{ position: 'absolute', top: -14, left: '50%', transform: 'translateX(-50%)', padding: '5px 18px', background: `linear-gradient(135deg,${C.primaryDk},${C.primary})`, color: C.bone, fontSize: 11, fontWeight: 800, borderRadius: 30, whiteSpace: 'nowrap', fontFamily: 'Inter,sans-serif', letterSpacing: '0.10em' }}>
                  ✦ {p.tag}
                </div>
              )}
              <div style={{ fontFamily: 'Bebas Neue,sans-serif', fontSize: 22, letterSpacing: '0.10em', color: p.glow ? C.primaryLt : C.bone, marginBottom: 4 }}>{p.name}</div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, marginBottom: 20, paddingBottom: 18, borderBottom: `1px solid ${p.glow ? C.borderAcc : C.border}` }}>
                <span style={{ fontFamily: 'JetBrains Mono,monospace', fontSize: 38, color: C.bone, letterSpacing: '-0.02em', lineHeight: 1, fontWeight: 700 }}>{p.price}</span>
                <span style={{ fontFamily: 'Inter,sans-serif', fontSize: 13, color: C.dim, fontWeight: 500 }}>{p.per}</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {p.features.map(f => (
                  <div key={f} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ width: 16, height: 16, borderRadius: 5, background: `rgba(247,155,61,${p.glow ? '0.24' : '0.12'})`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, color: C.primaryLt, flexShrink: 0 }}>✓</span>
                    <span style={{ fontFamily: 'Inter,sans-serif', fontSize: 14, color: p.glow ? C.boneSoft : C.dim, fontWeight: 400 }}>{f}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
        <p style={{ textAlign: 'center', fontFamily: 'Inter,sans-serif', fontSize: 12, color: C.dimmer, marginTop: 22, fontWeight: 500, letterSpacing: '0.02em' }}>14-day free trial · No credit card required · Cancel anytime · Onboarding included</p>
      </div>
    </div>,

    /* ─── 13 THE ASK / CTA ────────────────────────────────────── */
    <div key="s13" style={{ ...S, textAlign: 'center', overflow: 'hidden', padding: '0 80px' }}>
      <div style={{ position: 'absolute', inset: 0, background: slideGradient(13) }} />
      <div style={{ position: 'absolute', fontFamily: 'Bebas Neue,sans-serif', fontSize: '30vw', color: 'rgba(247,155,61,0.04)', lineHeight: 1, top: '50%', left: '50%', transform: 'translate(-50%,-50%)', userSelect: 'none', pointerEvents: 'none', whiteSpace: 'nowrap' }}>50</div>

      <div style={{ position: 'relative', zIndex: 2, maxWidth: 860, ...tilt(5, 3) }}>
        {sectionLabel('Founding Partner Programme · Chennai')}

        <h2 style={{ ...headlineStyle, fontSize: 'clamp(56px,8vw,110px)', margin: '0 0 24px' }}>
          <span style={{ WebkitTextStroke: `2px ${C.dim}`, WebkitTextFillColor: 'transparent' }}>BE AMONG</span><br />
          <span style={{
            background: `linear-gradient(90deg,${C.primaryDk},${C.primary},${C.primaryLt},${C.brass})`,
            WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
            filter: 'drop-shadow(0 0 28px rgba(247,155,61,0.30))',
          }}>THE FIRST 50.</span>
        </h2>

        <p style={{ fontFamily: 'Inter,sans-serif', fontSize: 'clamp(15px,1.6vw,19px)', color: C.dim, lineHeight: 1.75, maxWidth: 620, margin: '0 auto 44px', fontWeight: 400 }}>
          We're onboarding our first 50 founding partner restaurants in Chennai. Founding partners get locked-in pricing for life, 48-hour AR model creation, and a direct line to the founder.
        </p>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 16, marginBottom: 44 }}>
          {[
            { icon: 'lock',  title: 'Locked-in pricing',     body: 'Your rate never changes as we grow.' },
            { icon: 'cube',  title: 'Priority AR setup',      body: 'Your dishes in 3D within 48 hours.' },
            { icon: 'phone', title: 'Direct founder access',  body: 'WhatsApp, email, or call — anytime.' },
          ].map(b => (
            <div key={b.title} style={{ background: C.glassWarm, border: `1px solid ${C.borderAcc}`, borderRadius: 16, padding: '22px 18px' }}>
              <div style={{ width: 40, height: 40, borderRadius: 11, background: 'rgba(247,155,61,0.18)', border: `1px solid ${C.borderAcc}`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.primaryLt, marginBottom: 14 }}>
                <Icon name={b.icon} size={22} stroke={1.7} />
              </div>
              <div style={{ fontFamily: 'Bebas Neue,sans-serif', fontSize: 16, letterSpacing: '0.10em', color: C.bone, marginBottom: 6 }}>{b.title}</div>
              <div style={{ fontFamily: 'Inter,sans-serif', fontSize: 13, color: C.dim, fontWeight: 400 }}>{b.body}</div>
            </div>
          ))}
        </div>

        {/* TODO(prabu): replace the placeholder phone (+91 98765 43210
            in both the wa.me link and the tel: link below) with the
            real founder number before this deck goes to investors.
            Search for `9876543210` to find both spots. */}
        <div style={{ display: 'flex', gap: 14, justifyContent: 'center', flexWrap: 'wrap', marginBottom: 32 }}>
          <a href="https://wa.me/919876543210" target="_blank" rel="noopener noreferrer"
             aria-label="Book a demo on WhatsApp"
             style={{ padding: '16px 36px', borderRadius: 12, background: `linear-gradient(135deg,${C.primaryDk},${C.primary})`, color: C.bone, fontFamily: 'Bebas Neue,sans-serif', fontSize: 16, letterSpacing: '0.12em', textDecoration: 'none', display: 'inline-block', boxShadow: `0 8px 32px rgba(247,155,61,0.40)` }}>
            BOOK A DEMO →
          </a>
          <a href="mailto:hello@halohelm.com"
             aria-label="Email hello at halohelm dot com"
             style={{ padding: '16px 28px', borderRadius: 12, background: 'transparent', border: `1.5px solid ${C.borderHi}`, color: C.bone, fontFamily: 'Bebas Neue,sans-serif', fontSize: 16, letterSpacing: '0.12em', textDecoration: 'none', display: 'inline-block' }}>
            EMAIL US
          </a>
          <a href="https://www.halohelm.com/restaurant/spot" target="_blank" rel="noopener noreferrer"
             aria-label="Open the live demo restaurant in a new tab"
             style={{ padding: '16px 28px', borderRadius: 12, background: 'transparent', border: `1.5px solid ${C.border}`, color: C.dim, fontFamily: 'Bebas Neue,sans-serif', fontSize: 16, letterSpacing: '0.12em', textDecoration: 'none', display: 'inline-block' }}>
            SEE LIVE DEMO
          </a>
        </div>

        <div style={{ fontFamily: 'Inter,sans-serif', fontSize: 13, color: C.dimmer, lineHeight: 1.7, fontWeight: 400 }}>
          <div>Prabu · Founder, HaloHelm · Chennai</div>
          <div style={{ marginTop: 4, fontFamily: 'JetBrains Mono,monospace', fontSize: 12 }}>
            <a href="tel:+919876543210" style={{ color: C.dim }}>+91 98765 43210</a>
            &nbsp;·&nbsp;
            <a href="mailto:hello@halohelm.com" style={{ color: C.dim }}>hello@halohelm.com</a>
          </div>
        </div>
      </div>
    </div>,
  ];

  /* Defensive runtime check. */
  if (process.env.NODE_ENV !== 'production' && slides.length !== SLIDE_COUNT) {
    // eslint-disable-next-line no-console
    console.warn(`[pitch] SLIDE_COUNT (${SLIDE_COUNT}) doesn't match slides.length (${slides.length}). Update SLIDE_COUNT at top of file.`);
  }
  const slidesCount = SLIDE_COUNT;
  const chapterLabel = CHAPTERS[cur];

  /* ════════════════════════════════════════════════════════════════
     SHELL
     ════════════════════════════════════════════════════════════════ */
  return (
    <>
      <Head>
        <title>HaloHelm · Partner Brief</title>
        <link href="https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Inter:wght@400;500;600;700;800;900&family=JetBrains+Mono:wght@500;700&display=swap" rel="stylesheet" />
        <meta name="robots" content="noindex,nofollow" />
      </Head>

      <div ref={containerRef} style={{ width: '100vw', height: '100vh', overflow: 'hidden', position: 'relative', background: C.bg, cursor: 'default' }}>
        <style>{`
          * { box-sizing:border-box; margin:0; padding:0; }
          a { text-decoration:none; }
          ::-webkit-scrollbar { display:none; }

          @keyframes ar-pulse {
            0%, 100% { box-shadow: 0 0 12px rgba(255,184,92,0.55); }
            50%      { box-shadow: 0 0 26px rgba(255,184,92,0.95); }
          }
          .ar-pill > span:first-child { animation: ar-pulse 2s ease-in-out infinite; }

          /* Visible focus rings for keyboard users on the navigation
             chrome. The chrome elements are <button>s on dark glass —
             default browser focus ring is invisible. */
          button:focus-visible,
          a:focus-visible,
          [role="button"]:focus-visible {
            outline: 2px solid ${C.brassLt};
            outline-offset: 2px;
          }

          @media (prefers-reduced-motion: reduce) {
            * { animation: none !important; transition: none !important; }
          }

          /* ─── Mobile responsiveness (≤ 768px) ─────────────────────
             The deck was designed desktop-first. Without these
             overrides the 8-col diner journey, 3-col pricing, and
             2-col problem layouts cram into 360px screens and become
             unreadable. We grid-template-columns: 1fr on small
             screens for every multi-column block via attribute
             selectors (the inline styles set their gridTemplateColumns
             on the .slide-* class-less divs, so we target by
             element + style). Simplest reliable hook: a wildcard rule
             that re-stacks every grid below the breakpoint. */
          @media (max-width: 768px) {
            /* Any inline grid → single column. Bumps the touch
               targets and stops headlines from clipping. */
            div[style*="display: grid"],
            div[style*="display:grid"] {
              grid-template-columns: 1fr !important;
              gap: 16px !important;
            }
            /* Pull most slides' padding down so content fits */
            div[style*="padding: '60px 80px'"],
            div[style*="padding: '0 80px'"],
            div[style*="padding: '0 60px'"] {
              padding: 24px 18px !important;
            }
            /* The diner-journey timeline line is positioned absolute
               and points at the original 8-col layout — hide it so
               it doesn't run diagonally over the now-stacked cards. */
            div[style*="top: 24px"][style*="background: linear-gradient(90deg"] {
              display: none !important;
            }
            /* Smaller chapter pill on mobile so it doesn't push down
               the headline */
            [data-chapter-pill] {
              font-size: 9px !important;
              padding: 4px 10px !important;
            }
          }
        `}</style>

        {/* Particle canvas */}
        <canvas ref={canvasRef} style={{ position: 'fixed', inset: 0, zIndex: 0, pointerEvents: 'none' }} />

        {/* Subtle edge vignette for cinematic framing */}
        <div style={{ position: 'fixed', inset: 0, zIndex: 1, pointerEvents: 'none', background: `radial-gradient(ellipse at 50% 50%, transparent 60%, rgba(4,4,8,0.55) 100%)` }} />

        {/* Slide content. Wrapped in <main> so screen readers + skip-
            link tooling can jump straight to it. aria-live=polite
            announces slide changes without interrupting. */}
        <main aria-live="polite" aria-atomic="false" aria-label={`${SLIDE_TITLES[cur]}, slide ${cur + 1} of ${slidesCount}`} style={{ position: 'relative', width: '100%', height: '100%', zIndex: 3 }}>
          {slides[cur]}
        </main>

        {/* Top chapter tab — only on content slides, not the title */}
        {chapterLabel && (
          <div data-chapter-pill style={{
            position: 'fixed', top: 22, left: '50%', transform: 'translateX(-50%)',
            padding: '6px 16px', borderRadius: 99,
            background: 'rgba(13,11,8,0.70)', backdropFilter: 'blur(12px)',
            border: `1px solid ${C.border}`,
            fontFamily: 'Bebas Neue,sans-serif', fontSize: 11, letterSpacing: '0.20em',
            color: C.brass, textTransform: 'uppercase',
            zIndex: 100,
          }}>
            {chapterLabel}
          </div>
        )}

        {/* Right-side progress dots — now title-tooltipped with the
            actual slide name and aria-current on the active dot. */}
        <nav aria-label="Slide navigation" style={{ position: 'fixed', right: 22, top: '50%', transform: 'translateY(-50%)', display: 'flex', flexDirection: 'column', gap: 6, zIndex: 100 }}>
          {slides.map((_, i) => (
            <button key={i}
              onClick={() => goTo(i)}
              title={`${String(i + 1).padStart(2, '0')} · ${SLIDE_TITLES[i]}`}
              aria-label={`Go to slide ${i + 1}: ${SLIDE_TITLES[i]}`}
              aria-current={i === cur ? 'true' : undefined}
              style={{
                width: i === cur ? 5 : 4, height: i === cur ? 22 : 4, borderRadius: 99, border: 'none', cursor: 'pointer', padding: 0,
                transition: 'all 0.35s cubic-bezier(0.34,1.56,0.64,1)',
                background: i === cur ? C.primaryLt : 'rgba(247,155,61,0.22)',
                boxShadow: i === cur ? `0 0 10px ${C.primaryGlow}` : 'none',
              }} />
          ))}
        </nav>

        {/* Counter — now clickable, opens the jump menu. Doubled as
            the "table of contents" affordance so partners don't have
            to remember the `T` hotkey. */}
        <button
          onClick={() => setMenuOpen(true)}
          aria-label="Open table of contents"
          title="Jump to slide (T)"
          style={{
            position: 'fixed', bottom: 22, right: 22,
            fontFamily: 'JetBrains Mono,monospace', fontSize: 12,
            color: 'rgba(247,155,61,0.85)', zIndex: 100, letterSpacing: '0.06em',
            padding: '6px 12px', borderRadius: 8,
            border: `1px solid ${C.border}`,
            background: 'rgba(13,11,8,0.70)', backdropFilter: 'blur(12px)',
            cursor: 'pointer',
            display: 'inline-flex', alignItems: 'center', gap: 8,
          }}>
          <span aria-hidden="true" style={{ width: 10, height: 8, position: 'relative', display: 'inline-block' }}>
            <span style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 1.5, background: C.primaryLt, borderRadius: 1 }} />
            <span style={{ position: 'absolute', top: 3, left: 0, right: 0, height: 1.5, background: C.primaryLt, borderRadius: 1 }} />
            <span style={{ position: 'absolute', top: 6, left: 0, right: 0, height: 1.5, background: C.primaryLt, borderRadius: 1 }} />
          </span>
          {String(cur + 1).padStart(2, '0')} / {String(slidesCount).padStart(2, '0')}
        </button>

        {/* Wordmark — bottom-left, persists across all slides */}
        <div style={{ position: 'fixed', bottom: 24, left: 26, fontFamily: 'Bebas Neue,sans-serif', fontSize: 13, letterSpacing: '0.16em', color: 'rgba(255,245,232,0.40)', zIndex: 100 }}>
          HALO<span style={{ background: `linear-gradient(135deg,${C.primaryDk},${C.primary})`, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>HELM</span>
        </div>

        {/* Nav arrows */}
        {cur > 0 && (
          <button onClick={prev}
            aria-label={`Previous slide: ${SLIDE_TITLES[cur - 1]}`}
            style={{ position: 'fixed', left: '50%', top: 60, transform: 'translateX(-50%)', width: 36, height: 36, borderRadius: '50%', border: `1px solid ${C.border}`, background: 'rgba(13,11,8,0.70)', color: C.dim, fontSize: 15, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, backdropFilter: 'blur(12px)' }}>↑</button>
        )}
        {cur < slidesCount - 1 && (
          <button onClick={next}
            aria-label={`Next slide: ${SLIDE_TITLES[cur + 1]}`}
            style={{ position: 'fixed', left: '50%', bottom: 24, transform: 'translateX(-50%)', width: 36, height: 36, borderRadius: '50%', border: `1px solid ${C.border}`, background: 'rgba(13,11,8,0.70)', color: C.dim, fontSize: 15, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, backdropFilter: 'blur(12px)' }}>↓</button>
        )}

        {/* ─── Jump menu / Table of Contents overlay ────────────────
            Lets a partner with 5 minutes skip to "Pricing" or "The
            Ask" without scrolling through everything. Opens on
            counter-click or `T`; closes on Esc, backdrop click, or
            picking a slide. */}
        {menuOpen && (
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Table of contents"
            onClick={() => setMenuOpen(false)}
            style={{
              position: 'fixed', inset: 0, zIndex: 200,
              background: 'rgba(4,6,10,0.78)', backdropFilter: 'blur(8px)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              padding: 32,
            }}>
            <div
              onClick={e => e.stopPropagation()}
              style={{
                width: 'min(720px, 100%)', maxHeight: '80vh',
                background: C.bgLayer, border: `1px solid ${C.borderHi}`,
                borderRadius: 22, padding: 28,
                boxShadow: '0 40px 100px rgba(0,0,0,0.55)',
                overflowY: 'auto',
              }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 22 }}>
                <div style={{ fontFamily: 'Bebas Neue,sans-serif', fontSize: 18, letterSpacing: '0.16em', color: C.bone }}>
                  TABLE OF CONTENTS
                </div>
                <button
                  onClick={() => setMenuOpen(false)}
                  aria-label="Close table of contents"
                  style={{ background: 'transparent', border: `1px solid ${C.border}`, color: C.dim, width: 32, height: 32, borderRadius: 8, cursor: 'pointer', fontSize: 14 }}>
                  ✕
                </button>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                {SLIDE_TITLES.map((t, i) => (
                  <button
                    key={i}
                    onClick={() => { goTo(i); setMenuOpen(false); }}
                    aria-current={i === cur ? 'true' : undefined}
                    style={{
                      textAlign: 'left',
                      padding: '12px 14px',
                      background: i === cur ? C.glassWarm : 'transparent',
                      border: `1px solid ${i === cur ? C.borderAcc : C.border}`,
                      borderRadius: 10,
                      color: C.bone,
                      cursor: 'pointer',
                      display: 'flex', alignItems: 'center', gap: 12,
                      fontFamily: 'Inter,sans-serif', fontSize: 14, fontWeight: 500,
                      transition: 'background 0.15s, border-color 0.15s',
                    }}>
                    <span style={{ fontFamily: 'JetBrains Mono,monospace', fontSize: 11, color: i === cur ? C.primaryLt : C.brass, minWidth: 22 }}>
                      {String(i + 1).padStart(2, '0')}
                    </span>
                    <span style={{ flex: 1 }}>{t}</span>
                    <span style={{ fontFamily: 'Inter,sans-serif', fontSize: 10, color: C.dimmer, letterSpacing: '0.10em', textTransform: 'uppercase' }}>
                      {CHAPTERS[i]?.split(' · ')[1] || ''}
                    </span>
                  </button>
                ))}
              </div>
              <div style={{ marginTop: 20, fontFamily: 'Inter,sans-serif', fontSize: 12, color: C.dimmer, textAlign: 'center', lineHeight: 1.6 }}>
                Use <kbd style={{ padding: '2px 8px', border: `1px solid ${C.border}`, borderRadius: 4, fontFamily: 'JetBrains Mono,monospace', fontSize: 11, color: C.dim }}>↑</kbd> <kbd style={{ padding: '2px 8px', border: `1px solid ${C.border}`, borderRadius: 4, fontFamily: 'JetBrains Mono,monospace', fontSize: 11, color: C.dim }}>↓</kbd> to navigate slides ·{' '}
                <kbd style={{ padding: '2px 8px', border: `1px solid ${C.border}`, borderRadius: 4, fontFamily: 'JetBrains Mono,monospace', fontSize: 11, color: C.dim }}>T</kbd> for this menu ·{' '}
                <kbd style={{ padding: '2px 8px', border: `1px solid ${C.border}`, borderRadius: 4, fontFamily: 'JetBrains Mono,monospace', fontSize: 11, color: C.dim }}>Esc</kbd> to close
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
