import Head from 'next/head';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';

const plans = [
  {
    name: 'Starter', price: '₹999', per: '/month',
    desc: 'Perfect for small restaurants just getting started.',
    features: ['20 menu items', '1 GB storage', 'QR code menu', 'Smart Menu Assistant', 'Basic analytics'],
    cta: 'Get started',
  },
  {
    name: 'Growth', price: '₹2,499', per: '/month',
    desc: 'The complete AR experience for growing restaurants.',
    tag: 'Most popular',
    features: ['60 menu items', '3 GB storage', 'AR food visualization', 'AI upselling', 'Dish ratings', 'Waiter call system'],
    cta: 'Get started',
  },
  {
    name: 'Pro', price: '₹4,999', per: '/month',
    desc: 'Full power for high-volume multi-location operations.',
    features: ['150 menu items', '10 GB storage', 'CSV menu import', 'Advanced analytics', 'Priority support', 'Custom branding'],
    cta: 'Get started',
  },
];

const MARQUEE_ITEMS = [
  '🍛 Biryani House','🌶️ Spice Garden','🍢 The Curry Co.',
  '🍲 Masala Junction','👑 Royal Kitchen','🚌 Dhaba Express',
  '🌿 Green Leaf Bistro','🔥 Tandoor Palace','⭐ Star Dining',
  '🍱 Thali World','🥘 Curry Republic','🫕 Pot & Pan',
];

function SunIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="5"/>
      <line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/>
      <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
      <line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/>
      <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
    </svg>
  );
}
function MoonIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
    </svg>
  );
}

export default function HomePage() {
  const [dark, setDark]       = useState(true);
  const [mounted, setMounted] = useState(false);
  const revealRefs  = useRef([]);
  const countersRef = useRef(null);
  const countsDone  = useRef(false);

  useEffect(() => {
    const saved = localStorage.getItem('ar_theme');
    setDark(saved !== 'light');
    setMounted(true);
  }, []);

  useEffect(() => {
    if (mounted) localStorage.setItem('ar_theme', dark ? 'dark' : 'light');
  }, [dark, mounted]);

  useEffect(() => {
    const els = revealRefs.current.filter(Boolean);
    const io = new IntersectionObserver(
      entries => entries.forEach(e => { if (e.isIntersecting) { e.target.classList.add('ar-revealed'); io.unobserve(e.target); } }),
      { threshold: 0.1 }
    );
    els.forEach(el => io.observe(el));
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    const el = countersRef.current;
    if (!el) return;
    const io = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting && !countsDone.current) {
        countsDone.current = true;
        el.querySelectorAll('[data-to]').forEach(node => {
          const to = +node.dataset.to, suffix = node.dataset.suffix || '';
          let start; const dur = 1400;
          const tick = ts => {
            if (!start) start = ts;
            const p = Math.min((ts - start) / dur, 1);
            node.textContent = Math.round(to * (1 - Math.pow(1 - p, 4))) + suffix;
            if (p < 1) requestAnimationFrame(tick);
          };
          requestAnimationFrame(tick);
        });
      }
    }, { threshold: 0.5 });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const addReveal = el => { if (el && !revealRefs.current.includes(el)) revealRefs.current.push(el); };

  const handleToggle = () => {
    setDark(d => !d);
    const btn = document.querySelector('.theme-toggle');
    if (btn) { btn.classList.remove('popping'); void btn.offsetWidth; btn.classList.add('popping'); setTimeout(() => btn.classList.remove('popping'), 400); }
  };

  return (
    <>
      <Head>
        <title>Advert Radical — AR Menus for Restaurants</title>
        <meta name="description" content="Give your restaurant an AR-powered menu. Customers scan, see food in 3D, and order more."/>
        <link href="https://fonts.googleapis.com/css2?family=Poppins:wght@300;400;500;600;700;800;900&family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet"/>
      </Head>

      <div data-theme={dark ? 'dark' : 'light'} className="ar-root" style={{fontFamily:'Inter,sans-serif', overflowX:'hidden', minHeight:'100vh'}}>
        <style>{`
          /* ════════════════════════════════════════
             CSS CUSTOM PROPERTIES — PER THEME
          ════════════════════════════════════════ */

          .ar-root[data-theme="dark"] {
            --hero-bg:         #141008;
            --hero-h1:         #FFF5E8;
            --hero-sub:        rgba(255,245,220,0.52);
            --hero-badge-bg:   rgba(247,155,61,0.12);
            --hero-badge-bd:   rgba(247,155,61,0.25);
            --hero-badge-tx:   rgba(255,200,120,0.9);
            --hero-glow1:      rgba(247,155,61,0.12);
            --hero-glow2:      rgba(224,90,58,0.1);
            --hero-grid:       rgba(255,245,220,0.025);
            --hero-divider:    rgba(255,245,220,0.08);
            --hero-stat:       #FFF5E8;
            --hero-stat-lbl:   rgba(255,245,220,0.42);
            --hero-proof-h:    #FFF5E8;
            --hero-proof-l:    rgba(255,245,220,0.42);
            --hero-avatar-bd:  #1A1208;
            --nav-bg:          rgba(12,10,8,0.88);
            --nav-bd:          rgba(255,245,220,0.07);
            --nav-link:        rgba(255,245,220,0.55);
            --nav-link-hv:     #FFF5E8;
            --nav-link-hbg:    rgba(255,255,255,0.07);
            --nav-logo:        #FFF5E8;
            --toggle-bg:       rgba(255,255,255,0.07);
            --toggle-color:    rgba(255,245,220,0.55);
            --fc-bg:           rgba(255,255,255,0.96);
            --fc-bd:           rgba(26,18,8,0.07);
            --fc-lbl:          rgba(26,18,8,0.42);
            --fc-val:          #1A1208;
            --ghost-bg:        rgba(255,245,220,0.07);
            --ghost-bd:        rgba(255,245,220,0.15);
            --ghost-tx:        rgba(255,245,220,0.8);
            --ghost-hbg:       rgba(255,245,220,0.13);
            --ghost-hbd:       rgba(255,245,220,0.26);
            --ghost-htx:       #FFF5E8;
            --mq-bg:           rgba(255,255,255,0.5);
            --mq-bd:           rgba(26,18,8,0.06);
            --mq-item-bg:      rgba(255,255,255,0.65);
            --mq-item-bd:      rgba(26,18,8,0.07);
            --mq-item-tx:      rgba(26,18,8,0.55);
            --stats-bg:        #0C0A08;
            --stats-bd:        rgba(255,245,220,0.06);
            --stats-num:       #FFF5E8;
            --stats-lbl:       rgba(255,245,220,0.45);
            --stats-div:       rgba(255,245,220,0.1);
            --how-bg:          #FAF7F2;
            --how-bd:          rgba(26,18,8,0.06);
            --how-h2:          #1A1208;
            --how-p:           rgba(26,18,8,0.52);
            --db-bg:           #fff;
            --db-bd:           rgba(26,18,8,0.06);
            --db-sh:           rgba(26,18,8,0.15);
            --feat-bg:         #F5E6D3;
            --feat-bd:         rgba(26,18,8,0.06);
            --feat-h2:         #1A1208;
            --feat-p:          rgba(26,18,8,0.52);
            --bcard-bg:        #fff;
            --bcard-bd:        rgba(26,18,8,0.07);
            --bcard-sh:        rgba(26,18,8,0.05);
            --bcard-h3:        #1A1208;
            --bcard-p:         rgba(26,18,8,0.54);
            --bcard-hbd:       rgba(247,155,61,0.28);
            --bcard-hsh:       rgba(26,18,8,0.12);
            --demo-bg:         #0C0A08;
            --demo-bd:         rgba(255,245,220,0.06);
            --demo-title:      #FFF5E8;
            --demo-sub:        rgba(255,245,220,0.42);
            --demo-btn-bg:     rgba(247,155,61,0.08);
            --demo-btn-bd:     rgba(247,155,61,0.4);
            --demo-btn-tx:     #F79B3D;
            --price-bg:        #FAF7F2;
            --price-h2:        #1A1208;
            --price-p:         rgba(26,18,8,0.5);
            --pc-bg:           #fff;
            --pc-bd:           rgba(26,18,8,0.08);
            --pc-sh:           rgba(26,18,8,0.06);
            --pc-tx:           #1A1208;
            --pc-muted:        rgba(26,18,8,0.45);
            --pc-sep:          rgba(26,18,8,0.07);
            --pc-btn-bg:       #fff;
            --pc-btn-bd:       rgba(26,18,8,0.15);
            --pc-btn-tx:       #1A1208;
            --chk-bg:          rgba(26,18,8,0.07);
            --chk-tx:          rgba(26,18,8,0.5);
          }

          .ar-root[data-theme="light"] {
            --hero-bg:         #FAF7F2;
            --hero-h1:         #1A1208;
            --hero-sub:        rgba(26,18,8,0.56);
            --hero-badge-bg:   rgba(247,155,61,0.1);
            --hero-badge-bd:   rgba(247,155,61,0.3);
            --hero-badge-tx:   #8B4020;
            --hero-glow1:      rgba(247,155,61,0.1);
            --hero-glow2:      rgba(224,90,58,0.07);
            --hero-grid:       rgba(26,18,8,0.028);
            --hero-divider:    rgba(26,18,8,0.08);
            --hero-stat:       #1A1208;
            --hero-stat-lbl:   rgba(26,18,8,0.45);
            --hero-proof-h:    #1A1208;
            --hero-proof-l:    rgba(26,18,8,0.45);
            --hero-avatar-bd:  #FAF7F2;
            --nav-bg:          rgba(250,247,242,0.92);
            --nav-bd:          rgba(26,18,8,0.09);
            --nav-link:        rgba(26,18,8,0.55);
            --nav-link-hv:     #1A1208;
            --nav-link-hbg:    rgba(26,18,8,0.06);
            --nav-logo:        #1A1208;
            --toggle-bg:       rgba(26,18,8,0.07);
            --toggle-color:    rgba(26,18,8,0.55);
            --fc-bg:           rgba(255,255,255,0.98);
            --fc-bd:           rgba(26,18,8,0.09);
            --fc-lbl:          rgba(26,18,8,0.42);
            --fc-val:          #1A1208;
            --ghost-bg:        rgba(26,18,8,0.05);
            --ghost-bd:        rgba(26,18,8,0.16);
            --ghost-tx:        rgba(26,18,8,0.72);
            --ghost-hbg:       rgba(26,18,8,0.09);
            --ghost-hbd:       rgba(26,18,8,0.26);
            --ghost-htx:       #1A1208;
            --mq-bg:           rgba(255,255,255,0.82);
            --mq-bd:           rgba(26,18,8,0.08);
            --mq-item-bg:      #fff;
            --mq-item-bd:      rgba(26,18,8,0.09);
            --mq-item-tx:      rgba(26,18,8,0.6);
            --stats-bg:        #F0DCC8;
            --stats-bd:        rgba(26,18,8,0.07);
            --stats-num:       #1A1208;
            --stats-lbl:       rgba(26,18,8,0.52);
            --stats-div:       rgba(26,18,8,0.12);
            --how-bg:          #FAF7F2;
            --how-bd:          rgba(26,18,8,0.06);
            --how-h2:          #1A1208;
            --how-p:           rgba(26,18,8,0.52);
            --db-bg:           #fff;
            --db-bd:           rgba(26,18,8,0.07);
            --db-sh:           rgba(26,18,8,0.12);
            --feat-bg:         #F5E6D3;
            --feat-bd:         rgba(26,18,8,0.06);
            --feat-h2:         #1A1208;
            --feat-p:          rgba(26,18,8,0.52);
            --bcard-bg:        #fff;
            --bcard-bd:        rgba(26,18,8,0.07);
            --bcard-sh:        rgba(26,18,8,0.04);
            --bcard-h3:        #1A1208;
            --bcard-p:         rgba(26,18,8,0.54);
            --bcard-hbd:       rgba(247,155,61,0.28);
            --bcard-hsh:       rgba(26,18,8,0.1);
            --demo-bg:         #1A1208;
            --demo-bd:         rgba(255,245,220,0.06);
            --demo-title:      #FFF5E8;
            --demo-sub:        rgba(255,245,220,0.42);
            --demo-btn-bg:     rgba(247,155,61,0.1);
            --demo-btn-bd:     rgba(247,155,61,0.45);
            --demo-btn-tx:     #F79B3D;
            --price-bg:        #FAF7F2;
            --price-h2:        #1A1208;
            --price-p:         rgba(26,18,8,0.5);
            --pc-bg:           #fff;
            --pc-bd:           rgba(26,18,8,0.09);
            --pc-sh:           rgba(26,18,8,0.05);
            --pc-tx:           #1A1208;
            --pc-muted:        rgba(26,18,8,0.45);
            --pc-sep:          rgba(26,18,8,0.08);
            --pc-btn-bg:       #fff;
            --pc-btn-bd:       rgba(26,18,8,0.16);
            --pc-btn-tx:       #1A1208;
            --chk-bg:          rgba(26,18,8,0.07);
            --chk-tx:          rgba(26,18,8,0.5);
          }

          /* ════════════════════════════════════════
             GLOBAL THEME TRANSITION (300ms on all
             color/bg/border props, NOT transforms)
          ════════════════════════════════════════ */
          * { box-sizing:border-box; margin:0; padding:0; }
          a { text-decoration:none; color:inherit; }

          .ar-root * {
            transition:
              background-color 0.3s ease,
              border-color     0.3s ease,
              color            0.3s ease,
              box-shadow       0.3s ease,
              fill             0.3s ease,
              stroke           0.3s ease;
          }
          /* Prevent transition override on animations */
          .ar-root .no-transition,
          .ar-root .marquee-track { transition: none !important; }

          /* ── Keyframes ── */
          @keyframes fadeUp    { from{opacity:0;transform:translateY(32px)} to{opacity:1;transform:none} }
          @keyframes heroFade  { from{opacity:0;transform:translateY(40px)} to{opacity:1;transform:none} }
          @keyframes blink     { 0%,100%{opacity:1} 50%{opacity:0.2} }
          @keyframes float     { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-14px)} }
          @keyframes floatB    { 0%,100%{transform:translateY(0) rotate(-1deg)} 50%{transform:translateY(-9px) rotate(1deg)} }
          @keyframes shimmer   { 0%{background-position:200% center} 100%{background-position:-200% center} }
          @keyframes marquee   { 0%{transform:translateX(0)} 100%{transform:translateX(-50%)} }
          @keyframes pulse     { 0%,100%{box-shadow:0 0 0 0 rgba(247,155,61,0.4)} 50%{box-shadow:0 0 0 8px rgba(247,155,61,0)} }
          @keyframes togglePop { 0%{transform:scale(0.8)} 60%{transform:scale(1.15)} 100%{transform:scale(1)} }

          /* ── Scroll reveal ── */
          .ar-reveal { opacity:0; transform:translateY(28px); transition:opacity 0.7s cubic-bezier(0.16,1,0.3,1), transform 0.7s cubic-bezier(0.16,1,0.3,1) !important; }
          .ar-reveal.ar-revealed { opacity:1; transform:none; }
          .ar-reveal.d1 { transition-delay:0.08s !important; }
          .ar-reveal.d2 { transition-delay:0.16s !important; }
          .ar-reveal.d3 { transition-delay:0.24s !important; }
          .ar-reveal.d4 { transition-delay:0.32s !important; }

          /* ── Nav ── */
          .nav {
            position:fixed; top:0; left:0; right:0; z-index:100;
            padding:0 40px; height:68px;
            display:flex; align-items:center; justify-content:space-between;
            background:var(--nav-bg);
            backdrop-filter:blur(24px); -webkit-backdrop-filter:blur(24px);
            border-bottom:1px solid var(--nav-bd);
          }
          .nav-link {
            font-size:14px; color:var(--nav-link); font-weight:500;
            padding:7px 16px; border-radius:8px;
          }
          .nav-link:hover { color:var(--nav-link-hv); background:var(--nav-link-hbg); }
          .nav-cta {
            padding:9px 22px; background:#F79B3D; color:#1A1208;
            border-radius:10px; font-size:13px; font-weight:700;
            font-family:Poppins,sans-serif;
            box-shadow:0 4px 16px rgba(247,155,61,0.35);
          }
          .nav-cta:hover { background:#F4A730; transform:translateY(-1px); box-shadow:0 8px 24px rgba(247,155,61,0.45); }

          /* ── Theme toggle ── */
          .theme-toggle {
            width:38px; height:38px; border-radius:10px; border:none;
            cursor:pointer; display:flex; align-items:center; justify-content:center;
            background:var(--toggle-bg); color:var(--toggle-color);
            margin-left:4px;
          }
          .theme-toggle:hover { filter:brightness(1.3); }
          .theme-toggle.popping { animation:togglePop 0.35s cubic-bezier(0.34,1.56,0.64,1) !important; }

          /* ── Buttons ── */
          .btn-amber {
            display:inline-flex; align-items:center; gap:8px;
            padding:14px 28px; border-radius:12px; border:none;
            background:linear-gradient(90deg,#E05A3A,#F79B3D,#E05A3A);
            background-size:200% auto;
            color:#fff; font-family:Poppins,sans-serif; font-weight:700; font-size:15px;
            cursor:pointer; animation:shimmer 2.5s linear infinite;
            box-shadow:0 8px 24px rgba(224,90,58,0.4);
          }
          .btn-amber:hover { transform:translateY(-2px); box-shadow:0 14px 36px rgba(224,90,58,0.52); }

          .btn-ghost {
            display:inline-flex; align-items:center; gap:8px;
            padding:14px 24px; border-radius:12px;
            background:var(--ghost-bg); border:1px solid var(--ghost-bd);
            color:var(--ghost-tx);
            font-family:Poppins,sans-serif; font-weight:600; font-size:15px; cursor:pointer;
          }
          .btn-ghost:hover { background:var(--ghost-hbg); border-color:var(--ghost-hbd); color:var(--ghost-htx); }

          /* ── Marquee ── */
          .marquee-wrap { overflow:hidden; }
          .marquee-track { display:flex; width:max-content; animation:marquee 32s linear infinite; }
          .marquee-track:hover { animation-play-state:paused; }
          .marquee-item {
            display:inline-flex; align-items:center; gap:8px;
            padding:8px 18px; margin:0 6px;
            background:var(--mq-item-bg); border:1px solid var(--mq-item-bd);
            border-radius:30px; font-size:13px; font-weight:600;
            color:var(--mq-item-tx); white-space:nowrap;
          }

          /* ── Bento ── */
          .bento { display:grid; grid-template-columns:1.55fr 1fr 1fr; grid-template-rows:auto auto; gap:14px; }
          .bento-tall { grid-row:span 2; }
          .bento-card {
            background:var(--bcard-bg); border:1.5px solid var(--bcard-bd);
            border-radius:22px; padding:30px; overflow:hidden; position:relative;
            box-shadow:0 1px 12px var(--bcard-sh);
          }
          .bento-card:hover { transform:translateY(-5px); box-shadow:0 18px 44px var(--bcard-hsh); border-color:var(--bcard-hbd); }
          /* Dark bento cards stay dark in both themes — intentional visual contrast */
          .bento-dark {
            background:#1A1208 !important;
            border-color:rgba(255,245,220,0.08) !important;
          }
          .bento-dark:hover { border-color:rgba(247,155,61,0.3) !important; box-shadow:0 20px 48px rgba(0,0,0,0.35) !important; }
          .bento-icon { width:50px; height:50px; border-radius:14px; display:flex; align-items:center; justify-content:center; font-size:22px; margin-bottom:20px; }

          /* ── Steps ── */
          .step-num-box {
            width:46px; height:46px; border-radius:14px; flex-shrink:0;
            background:linear-gradient(135deg,#E05A3A,#F79B3D);
            display:flex; align-items:center; justify-content:center;
            font-family:Poppins,sans-serif; font-weight:800; font-size:13px; color:#fff;
            box-shadow:0 6px 18px rgba(224,90,58,0.35); position:relative; z-index:1;
          }

          /* ── Plan cards ── */
          .plan-grid { display:grid; grid-template-columns:repeat(3,1fr); gap:20px; max-width:1060px; margin:0 auto; }
          .plan-card { border-radius:24px; padding:36px 32px; position:relative; overflow:visible; display:flex; flex-direction:column; }
          .pc-light { background:var(--pc-bg); border:1.5px solid var(--pc-bd); box-shadow:0 2px 16px var(--pc-sh); }
          .pc-light:hover { transform:translateY(-4px); box-shadow:0 16px 40px var(--pc-sh); }
          .pc-dark  { background:#0C0A08; border:1.5px solid rgba(247,155,61,0.3); box-shadow:0 8px 40px rgba(0,0,0,0.35); }
          .pc-dark:hover  { transform:translateY(-6px); box-shadow:0 20px 56px rgba(0,0,0,0.45); }
          .chk-l { width:20px; height:20px; border-radius:6px; background:var(--chk-bg); display:flex; align-items:center; justify-content:center; font-size:10px; color:var(--chk-tx); font-weight:800; flex-shrink:0; }
          .chk-d { width:20px; height:20px; border-radius:6px; background:rgba(247,155,61,0.18); display:flex; align-items:center; justify-content:center; font-size:10px; color:#F79B3D; font-weight:800; flex-shrink:0; }

          /* ── Utilities ── */
          .section-inner { max-width:1400px; margin:0 auto; padding:0 56px; }

          /* ── Float animations ── */
          .fa { animation:float 5.5s ease-in-out infinite; }
          .fb { animation:floatB 7s ease-in-out 1s infinite; }
          .fc { animation:float 6.5s ease-in-out 2s infinite; }

          /* ── Responsive ── */
          @media(max-width:1100px) {
            .bento { grid-template-columns:1fr 1fr; }
            .bento-tall { grid-row:span 1; }
            .plan-grid { grid-template-columns:1fr; max-width:420px; }
          }
          @media(max-width:820px) {
            .hero-grid, .how-grid { grid-template-columns:1fr !important; }
            .nav { padding:0 20px; }
            .nl-hide { display:none; }
            .section-inner { padding:0 24px; }
            .bento { grid-template-columns:1fr; }
          }
        `}</style>

        {/* ══ NAV ══ */}
        <nav className="nav">
          <span style={{fontFamily:'Poppins,sans-serif', fontWeight:800, fontSize:17, color:'var(--nav-logo)', letterSpacing:'-0.01em'}}>
            Advert <span style={{background:'linear-gradient(135deg,#E05A3A,#F79B3D)', WebkitBackgroundClip:'text', WebkitTextFillColor:'transparent'}}>Radical</span>
          </span>
          <div style={{display:'flex', alignItems:'center', gap:2}}>
            <a href="#how"      className="nav-link nl-hide">How it works</a>
            <a href="#features" className="nav-link nl-hide">Features</a>
            <a href="#plans"    className="nav-link nl-hide">Pricing</a>
            <Link href="/admin/login" className="nav-link nl-hide">Sign in</Link>
          </div>
          <div style={{display:'flex', alignItems:'center', gap:8}}>
            <button className="theme-toggle" title={dark ? 'Switch to light mode' : 'Switch to dark mode'} onClick={handleToggle}>
              {mounted ? (dark ? <SunIcon/> : <MoonIcon/>) : <SunIcon/>}
            </button>
            <Link href="/admin/login" className="nav-cta">Get started →</Link>
          </div>
        </nav>

        {/* ══ HERO ══ */}
        <section style={{background:'var(--hero-bg)', padding:'160px 56px 100px', position:'relative', overflow:'hidden', minHeight:'100vh', display:'flex', alignItems:'center'}} className="hero-section">
          <div style={{position:'absolute', top:'-10%', right:'-5%', width:700, height:700, borderRadius:'50%', background:'radial-gradient(circle, var(--hero-glow1) 0%, transparent 65%)', pointerEvents:'none'}} className="no-transition"/>
          <div style={{position:'absolute', bottom:'-15%', left:'-8%', width:600, height:600, borderRadius:'50%', background:'radial-gradient(circle, var(--hero-glow2) 0%, transparent 65%)', pointerEvents:'none'}} className="no-transition"/>
          <div style={{position:'absolute', inset:0, backgroundImage:`linear-gradient(var(--hero-grid) 1px, transparent 1px), linear-gradient(90deg, var(--hero-grid) 1px, transparent 1px)`, backgroundSize:'64px 64px', pointerEvents:'none'}} className="no-transition"/>

          <div className="hero-grid" style={{maxWidth:1400, margin:'0 auto', width:'100%', position:'relative', zIndex:1, display:'grid', gridTemplateColumns:'1fr 1fr', gap:56, alignItems:'center'}}>

            {/* LEFT */}
            <div>
              <div style={{display:'inline-flex', alignItems:'center', gap:8, padding:'6px 14px 6px 10px', borderRadius:30, background:'var(--hero-badge-bg)', border:'1px solid var(--hero-badge-bd)', fontSize:12, fontWeight:600, color:'var(--hero-badge-tx)', letterSpacing:'0.02em', marginBottom:28, animation:'heroFade 0.6s ease both'}}>
                <span className="no-transition" style={{width:8, height:8, borderRadius:'50%', background:'#F79B3D', animation:'pulse 2s infinite', flexShrink:0}}/>
                AR + AI Revenue Platform
              </div>

              <h1 style={{fontFamily:'Poppins,sans-serif', fontWeight:900, fontSize:'clamp(40px,4.8vw,68px)', lineHeight:1.0, letterSpacing:'-0.03em', color:'var(--hero-h1)', marginBottom:24, animation:'heroFade 0.7s ease 0.1s both'}}>
                The AR Menu<br/>
                <span style={{background:'linear-gradient(90deg,#F79B3D,#E05A3A)', WebkitBackgroundClip:'text', WebkitTextFillColor:'transparent'}}>That Sells</span><br/>
                More Food.
              </h1>

              <p style={{fontSize:17, color:'var(--hero-sub)', lineHeight:1.85, maxWidth:440, marginBottom:40, animation:'heroFade 0.7s ease 0.2s both'}}>
                Customers scan your QR, watch dishes appear life-size in 3D on their table, get AI-powered suggestions — and order more. No app. No friction.
              </p>

              <div style={{display:'flex', gap:12, alignItems:'center', flexWrap:'wrap', animation:'heroFade 0.7s ease 0.3s both'}}>
                <Link href="/admin/login"><button className="btn-amber">Start free trial</button></Link>
                <a href="https://ar-saa-s-kbzn.vercel.app/restaurant/spot" target="_blank" rel="noreferrer">
                  <button className="btn-ghost">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polygon points="5 3 19 12 5 21 5 3"/></svg>
                    See live demo
                  </button>
                </a>
              </div>

              <div style={{display:'flex', alignItems:'center', gap:14, marginTop:36, paddingTop:28, borderTop:'1px solid var(--hero-divider)'}}>
                <div style={{display:'flex'}}>
                  {['🧑‍🍳','👨‍🍳','👩‍🍳','🧑‍🍳'].map((e,i)=>(
                    <div key={i} style={{width:30, height:30, borderRadius:'50%', background:`hsl(${30+i*20},60%,${30+i*5}%)`, border:`2px solid var(--hero-avatar-bd)`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:14, marginLeft:i===0?0:-8, position:'relative', zIndex:4-i}}>
                      {e}
                    </div>
                  ))}
                </div>
                <div>
                  <div style={{fontFamily:'Poppins,sans-serif', fontWeight:700, fontSize:14, color:'var(--hero-proof-h)', lineHeight:1}}>500+ restaurants</div>
                  <div style={{fontSize:12, color:'var(--hero-proof-l)', marginTop:3}}>already growing with Advert Radical</div>
                </div>
              </div>
            </div>

            {/* RIGHT — Phone */}
            <div style={{display:'flex', justifyContent:'center', alignItems:'center', position:'relative'}}>
              <div className="no-transition" style={{position:'absolute', inset:0, background:'radial-gradient(ellipse at 50% 50%, rgba(247,155,61,0.18) 0%, transparent 65%)', filter:'blur(20px)', borderRadius:'50%', pointerEvents:'none'}}/>
              <div className="fa" style={{position:'relative', zIndex:2}}>
                <div style={{width:260, height:520, borderRadius:44, background:'#1A1208', boxShadow:'0 40px 100px rgba(0,0,0,0.55), 0 0 0 1px rgba(255,255,255,0.08)', position:'relative', overflow:'hidden'}}>
                  <div style={{position:'absolute', top:12, left:'50%', transform:'translateX(-50%)', width:96, height:28, background:'#1A1208', borderRadius:14, zIndex:4}}/>
                  <div style={{position:'absolute', top:0, left:0, right:0, bottom:0, background:'linear-gradient(180deg,#0E1828,#0A1220)', borderRadius:44, overflow:'hidden'}}>
                    <div style={{padding:'52px 16px 20px', height:'100%', display:'flex', flexDirection:'column'}}>
                      <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16}}>
                        <div>
                          <div style={{fontSize:9, fontWeight:700, color:'rgba(255,245,220,0.35)', letterSpacing:'0.08em', marginBottom:3}}>THE SPOT RESTAURANT</div>
                          <div style={{fontSize:17, fontWeight:800, color:'#FFF5E8', fontFamily:'Poppins,sans-serif', letterSpacing:'-0.02em'}}>AR Menu</div>
                        </div>
                        <div style={{width:34, height:34, borderRadius:12, background:'rgba(247,155,61,0.15)', border:'1px solid rgba(247,155,61,0.3)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:16}}>🥽</div>
                      </div>
                      <div style={{display:'flex', gap:6, marginBottom:14}}>
                        {['All','Biryani','Starters','Desserts'].map((c,i)=>(
                          <div key={c} style={{padding:'5px 11px', borderRadius:20, background:i===0?'#F79B3D':'rgba(255,255,255,0.07)', fontSize:9, fontWeight:700, color:i===0?'#1A1208':'rgba(255,245,220,0.45)', whiteSpace:'nowrap', flexShrink:0}}>{c}</div>
                        ))}
                      </div>
                      <div style={{display:'flex', flexDirection:'column', gap:8, flex:1}}>
                        {[
                          {n:'Chicken Biryani',p:'₹320',e:'🍛',glow:'rgba(247,155,61,0.2)',bg:'rgba(247,155,61,0.08)'},
                          {n:'Paneer Tikka',   p:'₹240',e:'🍢',glow:'rgba(224,90,58,0.15)',bg:'rgba(224,90,58,0.08)'},
                          {n:'Dal Makhani',    p:'₹180',e:'🍲',glow:'rgba(100,180,120,0.12)',bg:'rgba(100,180,120,0.08)'},
                        ].map(d=>(
                          <div key={d.n} style={{display:'flex', alignItems:'center', gap:10, padding:'10px 12px', borderRadius:16, background:d.bg, border:`1px solid ${d.glow}`, boxShadow:`0 4px 16px ${d.glow}`}}>
                            <div style={{width:42, height:42, borderRadius:12, background:'rgba(255,255,255,0.07)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:20, flexShrink:0}}>{d.e}</div>
                            <div style={{flex:1, minWidth:0}}>
                              <div style={{fontSize:10, fontWeight:700, color:'rgba(255,245,232,0.9)', marginBottom:3}}>{d.n}</div>
                              <span style={{fontSize:8, fontWeight:700, padding:'2px 6px', borderRadius:6, background:'rgba(247,155,61,0.2)', color:'#F79B3D'}}>AR</span>
                            </div>
                            <div style={{fontSize:11, fontWeight:800, color:'#F79B3D', fontFamily:'Poppins,sans-serif'}}>{d.p}</div>
                          </div>
                        ))}
                      </div>
                      <div style={{marginTop:12, padding:'8px 12px', borderRadius:12, background:'rgba(100,210,255,0.06)', border:'1px solid rgba(100,210,255,0.14)', display:'flex', alignItems:'center', gap:7}}>
                        <div className="no-transition" style={{width:7, height:7, borderRadius:'50%', background:'#64D2FF', animation:'blink 1.5s infinite'}}/>
                        <span style={{fontSize:8.5, fontWeight:700, color:'rgba(100,210,255,0.85)', letterSpacing:'0.04em'}}>AR LIVE — TAP ANY DISH</span>
                      </div>
                    </div>
                  </div>
                  <div style={{position:'absolute', bottom:10, left:'50%', transform:'translateX(-50%)', width:80, height:3, background:'rgba(255,255,255,0.18)', borderRadius:2}}/>
                </div>

                {/* Floating card — top right */}
                <div className="fb" style={{position:'absolute', top:'6%', right:'-22%', background:'var(--fc-bg)', borderRadius:18, padding:'12px 16px', boxShadow:'0 12px 36px rgba(26,18,8,0.16)', border:'1px solid var(--fc-bd)', minWidth:148, zIndex:5}}>
                  <div style={{display:'flex', alignItems:'center', gap:10}}>
                    <div style={{width:36, height:36, borderRadius:10, background:'rgba(100,210,120,0.12)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:16}}>📈</div>
                    <div>
                      <div style={{fontSize:9.5, fontWeight:600, color:'var(--fc-lbl)', marginBottom:2}}>Avg order value</div>
                      <div style={{fontSize:18, fontWeight:900, color:'var(--fc-val)', fontFamily:'Poppins,sans-serif', letterSpacing:'-0.02em'}}>↑ 28%</div>
                    </div>
                  </div>
                </div>

                {/* Floating card — bottom left */}
                <div className="fc" style={{position:'absolute', bottom:'12%', left:'-20%', background:'var(--fc-bg)', borderRadius:18, padding:'12px 16px', boxShadow:'0 12px 36px rgba(26,18,8,0.16)', border:'1px solid var(--fc-bd)', minWidth:156, zIndex:5}}>
                  <div style={{display:'flex', alignItems:'center', gap:10}}>
                    <div style={{width:36, height:36, borderRadius:10, background:'rgba(247,155,61,0.1)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:16}}>👁️</div>
                    <div>
                      <div style={{fontSize:9.5, fontWeight:600, color:'var(--fc-lbl)', marginBottom:2}}>AR views today</div>
                      <div style={{fontSize:18, fontWeight:900, color:'var(--fc-val)', fontFamily:'Poppins,sans-serif', letterSpacing:'-0.02em'}}>2,841</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ══ MARQUEE ══ */}
        <div style={{background:'var(--how-bg)', borderTop:'1px solid var(--mq-bd)', borderBottom:'1px solid var(--mq-bd)', padding:'14px 0', backdropFilter:'blur(12px)'}}>
          <div className="marquee-wrap">
            <div className="marquee-track no-transition">
              {[...MARQUEE_ITEMS,...MARQUEE_ITEMS].map((item,i)=>(
                <span key={i} className="marquee-item">{item}</span>
              ))}
            </div>
          </div>
        </div>

        {/* ══ STATS BAND ══ */}
        <div style={{background:'var(--stats-bg)', borderTop:'1px solid var(--stats-bd)', borderBottom:'1px solid var(--stats-bd)', padding:'64px 56px'}}>
          <div ref={countersRef} style={{maxWidth:1400, margin:'0 auto', display:'grid', gridTemplateColumns:'repeat(4,1fr)'}}>
            {[
              {to:28,  suffix:'%',    label:'Increase in avg order value', pre:'↑ '},
              {to:500, suffix:'+',    label:'Restaurants on the platform',  pre:''},
              {to:5,   suffix:' min', label:'Average setup time',           pre:''},
              {to:4.8, suffix:'★',   label:'Average customer rating',      pre:''},
            ].map((s,i)=>(
              <div key={i} className="ar-reveal" ref={addReveal} style={{padding:'0 40px', position:'relative', transitionDelay:`${i*0.08}s`}}>
                {i>0 && <div style={{position:'absolute', left:0, top:'10%', height:'80%', width:1, background:'var(--stats-div)'}}/>}
                <div style={{fontFamily:'Poppins,sans-serif', fontWeight:900, fontSize:'clamp(36px,3.5vw,52px)', color:'var(--stats-num)', letterSpacing:'-0.03em', lineHeight:1, marginBottom:10}}>
                  {s.pre}<span data-to={s.to} data-suffix={s.suffix}>{s.to}{s.suffix}</span>
                </div>
                <div style={{fontSize:14, color:'var(--stats-lbl)', fontWeight:500, lineHeight:1.5}}>{s.label}</div>
              </div>
            ))}
          </div>
        </div>

        {/* ══ HOW IT WORKS ══ */}
        <section id="how" style={{padding:'96px 0', background:'var(--how-bg)', borderBottom:'1px solid var(--how-bd)', position:'relative', zIndex:1}}>
          <div className="section-inner">
            <div className="how-grid" style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:80, alignItems:'center'}}>
              <div ref={addReveal} className="ar-reveal">
                <span style={{display:'inline-block', fontSize:11, fontWeight:700, letterSpacing:'0.1em', textTransform:'uppercase', color:'#E05A3A', marginBottom:14}}>How it works</span>
                <h2 style={{fontFamily:'Poppins,sans-serif', fontWeight:800, fontSize:'clamp(28px,3.2vw,44px)', color:'var(--how-h2)', lineHeight:1.1, letterSpacing:'-0.02em', marginBottom:18}}>
                  From QR scan to<br/>3D AR in seconds
                </h2>
                <p style={{fontSize:16, color:'var(--how-p)', lineHeight:1.85, marginBottom:48, maxWidth:380}}>
                  No app downloads. No tech setup. Your customers simply scan and watch their food come to life on the table.
                </p>
                <div style={{display:'flex', flexDirection:'column', gap:0}}>
                  {[
                    {n:'01',title:'Upload your menu',       desc:'Add dish photos, 3D models, prices, and descriptions through your admin dashboard in minutes.'},
                    {n:'02',title:'Get your QR code',        desc:'A branded QR code and custom subdomain are generated instantly — ready to place on every table.'},
                    {n:'03',title:'Customers scan & order',  desc:'They point their phone, food appears life-size in 3D, AI suggests pairings — orders go up.'},
                  ].map((s,i)=>(
                    <div key={s.n} style={{position:'relative', paddingBottom:i<2?32:0}}>
                      {i<2 && <div style={{position:'absolute', left:22, top:48, height:32, width:2, background:'linear-gradient(180deg,rgba(224,90,58,0.35),transparent)'}}/>}
                      <div style={{display:'flex', gap:20, alignItems:'flex-start'}}>
                        <div className="step-num-box">{s.n}</div>
                        <div style={{paddingTop:4}}>
                          <div style={{fontFamily:'Poppins,sans-serif', fontWeight:700, fontSize:16, color:'var(--how-h2)', marginBottom:6}}>{s.title}</div>
                          <div style={{fontSize:14, color:'var(--how-p)', lineHeight:1.75}}>{s.desc}</div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div ref={addReveal} className="ar-reveal d2" style={{display:'flex', justifyContent:'center'}}>
                <div style={{width:'100%', maxWidth:460, borderRadius:24, background:'var(--db-bg)', boxShadow:`0 28px 72px var(--db-sh)`, border:`1px solid var(--db-bd)`, overflow:'hidden'}}>
                  <div style={{background:'#1A1208', padding:'14px 20px', display:'flex', alignItems:'center', gap:8}}>
                    {['#FF5F57','#FEBC2E','#28C840'].map(c=><div key={c} style={{width:11,height:11,borderRadius:'50%',background:c}}/>)}
                    <div style={{flex:1}}/>
                    <div style={{fontSize:10, fontWeight:600, color:'rgba(255,245,220,0.35)', letterSpacing:'0.04em'}}>Advert Radical Dashboard</div>
                  </div>
                  <div style={{padding:22}}>
                    <div style={{display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:10, marginBottom:18}}>
                      {[
                        {l:'AR Views',v:'12,450',c:'↑ 24%',bg:'rgba(224,90,58,0.08)',ac:'#C04A28'},
                        {l:'Scans',   v:'3,291', c:'↑ 12%',bg:'rgba(143,196,168,0.12)',ac:'#1A5A38'},
                        {l:'Rating',  v:'4.8★',  c:'Top 3%',bg:'rgba(244,208,112,0.15)',ac:'#7A5A10'},
                      ].map(m=>(
                        <div key={m.l} style={{background:m.bg, borderRadius:12, padding:'12px 14px'}}>
                          <div style={{fontSize:10, color:'rgba(26,18,8,0.45)', marginBottom:4, fontWeight:600}}>{m.l}</div>
                          <div style={{fontSize:16, fontWeight:900, color:'#1A1208', fontFamily:'Poppins,sans-serif', letterSpacing:'-0.01em', marginBottom:2}}>{m.v}</div>
                          <div style={{fontSize:10, fontWeight:700, color:m.ac}}>{m.c}</div>
                        </div>
                      ))}
                    </div>
                    <div style={{background:'#1A1208', borderRadius:16, padding:18}}>
                      <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:14}}>
                        <div style={{fontSize:11, fontWeight:700, color:'rgba(255,245,220,0.5)', letterSpacing:'0.05em'}}>WEEKLY AR VIEWS</div>
                        <div style={{fontSize:10, color:'rgba(247,155,61,0.7)', fontWeight:600}}>↑ 18% vs last week</div>
                      </div>
                      <div style={{display:'flex', alignItems:'flex-end', gap:7, height:80}}>
                        {[42,68,54,82,75,100,91].map((h,i)=>(
                          <div key={i} style={{flex:1, borderRadius:7, background:i===5?'linear-gradient(0deg,#F79B3D,#E05A3A)':'rgba(255,255,255,0.1)', height:`${h}%`}}/>
                        ))}
                      </div>
                      <div style={{display:'flex', gap:7, marginTop:8}}>
                        {['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].map((d,i)=>(
                          <div key={i} style={{flex:1, textAlign:'center', fontSize:8, color:'rgba(255,245,220,0.3)', fontWeight:600}}>{d}</div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ══ FEATURES BENTO ══ */}
        <section id="features" style={{padding:'96px 0', background:'var(--feat-bg)', borderBottom:'1px solid var(--feat-bd)', position:'relative', zIndex:1}}>
          <div className="section-inner">
            <div ref={addReveal} className="ar-reveal" style={{marginBottom:52}}>
              <span style={{display:'inline-block', fontSize:11, fontWeight:700, letterSpacing:'0.1em', textTransform:'uppercase', color:'#E05A3A', marginBottom:14}}>Platform features</span>
              <div style={{display:'flex', alignItems:'flex-end', justifyContent:'space-between', flexWrap:'wrap', gap:16}}>
                <h2 style={{fontFamily:'Poppins,sans-serif', fontWeight:800, fontSize:'clamp(28px,3.2vw,44px)', color:'var(--feat-h2)', lineHeight:1.1, letterSpacing:'-0.02em'}}>Every tool to grow revenue</h2>
                <p style={{fontSize:15, color:'var(--feat-p)', maxWidth:320, lineHeight:1.75, paddingBottom:4}}>
                  One platform built specifically for Indian restaurants — AR menus, AI upselling, analytics, and more.
                </p>
              </div>
            </div>

            <div ref={addReveal} className="bento ar-reveal">
              {/* AR — always dark */}
              <div className="bento-card bento-tall bento-dark" style={{display:'flex', flexDirection:'column', justifyContent:'space-between', minHeight:320}}>
                <div>
                  <div className="bento-icon" style={{background:'rgba(247,155,61,0.15)', border:'1px solid rgba(247,155,61,0.3)'}}>🥽</div>
                  <h3 style={{fontFamily:'Poppins,sans-serif', fontWeight:800, fontSize:20, color:'#FFF5E8', marginBottom:10, letterSpacing:'-0.01em'}}>AR Visualization</h3>
                  <p style={{fontSize:14, color:'rgba(255,245,220,0.5)', lineHeight:1.8, maxWidth:320}}>Dishes appear life-size in 3D right on your customers' table. Works on Android Chrome and iOS Safari — zero app download required.</p>
                </div>
                <div style={{marginTop:32, position:'relative', height:100}}>
                  {[
                    {e:'🍛',s:{left:'5%',  top:0},    dur:5,  del:0},
                    {e:'🍢',s:{left:'38%', top:'20%'}, dur:6.5,del:1.2},
                    {e:'🍕',s:{right:'8%', top:0},     dur:5.8,del:0.6},
                    {e:'🍲',s:{left:'22%', bottom:0},  dur:7,  del:2,  op:0.5},
                  ].map((f,i)=>(
                    <div key={i} className="no-transition" style={{position:'absolute', ...f.s, fontSize:i===0?48:i===2?44:i===1?40:36, filter:'drop-shadow(0 8px 20px rgba(0,0,0,0.5))', animation:`float ${f.dur}s ease-in-out ${f.del}s infinite`, opacity:f.op||1}}>{f.e}</div>
                  ))}
                </div>
              </div>

              {/* AI Upselling */}
              <div className="bento-card">
                <div className="bento-icon" style={{background:'rgba(224,90,58,0.1)', border:'1px solid rgba(224,90,58,0.2)'}}>🤖</div>
                <h3 style={{fontFamily:'Poppins,sans-serif', fontWeight:700, fontSize:16, color:'var(--bcard-h3)', marginBottom:8}}>AI Upselling</h3>
                <p style={{fontSize:13.5, color:'var(--bcard-p)', lineHeight:1.72}}>Claude AI suggests complementary dishes when a customer opens any item — proven to increase average order value.</p>
              </div>

              {/* Dish Ratings */}
              <div className="bento-card">
                <div className="bento-icon" style={{background:'rgba(244,208,112,0.2)', border:'1px solid rgba(244,208,112,0.4)'}}>⭐</div>
                <h3 style={{fontFamily:'Poppins,sans-serif', fontWeight:700, fontSize:16, color:'var(--bcard-h3)', marginBottom:8}}>Dish Ratings</h3>
                <p style={{fontSize:13.5, color:'var(--bcard-p)', lineHeight:1.72}}>Customers rate dishes 1–5 stars inline. Real-time feedback helps you spotlight your best performers.</p>
              </div>

              {/* Waiter Calls */}
              <div className="bento-card">
                <div className="bento-icon" style={{background:'rgba(247,155,61,0.12)', border:'1px solid rgba(247,155,61,0.28)'}}>🔔</div>
                <h3 style={{fontFamily:'Poppins,sans-serif', fontWeight:700, fontSize:16, color:'var(--bcard-h3)', marginBottom:8}}>Waiter Call System</h3>
                <p style={{fontSize:13.5, color:'var(--bcard-p)', lineHeight:1.72}}>Customers tap to request water, bill, or help. Live push notification reaches your admin instantly.</p>
              </div>

              {/* Analytics — always dark */}
              <div className="bento-card bento-dark">
                <div className="bento-icon" style={{background:'rgba(143,196,168,0.15)', border:'1px solid rgba(143,196,168,0.3)'}}>📊</div>
                <h3 style={{fontFamily:'Poppins,sans-serif', fontWeight:700, fontSize:16, color:'#FFF5E8', marginBottom:8}}>Menu Analytics</h3>
                <p style={{fontSize:13.5, color:'rgba(255,245,220,0.5)', lineHeight:1.72}}>See which dishes get the most views, AR launches, and ratings — know exactly what to promote and what to change.</p>
              </div>

              {/* QR — always dark, full width */}
              <div className="bento-card bento-dark" style={{gridColumn:'1 / -1', display:'flex', alignItems:'center', gap:36, flexWrap:'wrap'}}>
                <div className="bento-icon" style={{background:'rgba(247,155,61,0.12)', border:'1px solid rgba(247,155,61,0.28)', flexShrink:0}}>⚡</div>
                <div style={{flex:1, minWidth:220}}>
                  <h3 style={{fontFamily:'Poppins,sans-serif', fontWeight:700, fontSize:16, color:'#FFF5E8', marginBottom:8}}>Instant QR & Subdomain</h3>
                  <p style={{fontSize:13.5, color:'rgba(255,245,220,0.46)', lineHeight:1.72, maxWidth:520}}>Your branded menu URL and QR code ready in under 5 minutes. Stick QRs on every table and your AR menu is live — no technical setup needed.</p>
                </div>
                <Link href="/admin/login" style={{flexShrink:0, padding:'12px 26px', borderRadius:12, border:'1px solid rgba(247,155,61,0.35)', background:'rgba(247,155,61,0.08)', color:'#F79B3D', fontFamily:'Poppins,sans-serif', fontWeight:700, fontSize:14, textDecoration:'none', whiteSpace:'nowrap'}}>
                  Get your QR →
                </Link>
              </div>
            </div>
          </div>
        </section>

        {/* ══ DEMO STRIP ══ */}
        <div style={{background:'var(--demo-bg)', padding:'28px 56px', borderTop:'1px solid var(--demo-bd)'}}>
          <div style={{maxWidth:1400, margin:'0 auto', display:'flex', alignItems:'center', justifyContent:'space-between', flexWrap:'wrap', gap:20}}>
            <div>
              <div style={{display:'flex', alignItems:'center', gap:8, marginBottom:6}}>
                <div className="no-transition" style={{width:8, height:8, borderRadius:'50%', background:'#F79B3D', animation:'pulse 2s infinite'}}/>
                <span style={{fontSize:11, fontWeight:700, color:'rgba(247,155,61,0.65)', letterSpacing:'0.08em', textTransform:'uppercase'}}>Live demo</span>
              </div>
              <div style={{fontFamily:'Poppins,sans-serif', fontWeight:700, fontSize:18, color:'var(--demo-title)'}}>See a real AR menu in action — open on your phone</div>
              <div style={{fontSize:13, color:'var(--demo-sub)', marginTop:4}}>No account needed. Works on any smartphone.</div>
            </div>
            <a href="https://ar-saa-s-kbzn.vercel.app/restaurant/spot" target="_blank" rel="noreferrer">
              <button style={{padding:'13px 26px', borderRadius:12, border:`1px solid var(--demo-btn-bd)`, background:'var(--demo-btn-bg)', color:'var(--demo-btn-tx)', fontSize:14, fontWeight:700, fontFamily:'Poppins,sans-serif', cursor:'pointer', transition:'all 0.2s', whiteSpace:'nowrap'}}>
                Open Live Demo →
              </button>
            </a>
          </div>
        </div>

        {/* ══ PRICING ══ */}
        <section id="plans" style={{padding:'96px 0', background:'var(--price-bg)', position:'relative', zIndex:1}}>
          <div className="section-inner">
            <div style={{textAlign:'center', marginBottom:56}}>
              <div ref={addReveal} className="ar-reveal">
                <span style={{display:'inline-block', fontSize:11, fontWeight:700, letterSpacing:'0.1em', textTransform:'uppercase', color:'#E05A3A', marginBottom:14}}>Pricing</span>
                <h2 style={{fontFamily:'Poppins,sans-serif', fontWeight:800, fontSize:'clamp(28px,3.2vw,44px)', color:'var(--price-h2)', letterSpacing:'-0.02em', marginBottom:12}}>Simple, transparent pricing</h2>
                <p style={{fontSize:15, color:'var(--price-p)', lineHeight:1.75}}>Monthly plans. No hidden fees. Cancel anytime.</p>
              </div>
            </div>
            <div ref={addReveal} className="plan-grid ar-reveal">
              {plans.map(p => {
                const f = !!p.tag;
                return (
                  <div key={p.name} className={`plan-card ${f?'pc-dark':'pc-light'}`}>
                    {p.tag && (
                      <div style={{position:'absolute', top:-14, left:'50%', transform:'translateX(-50%)', padding:'5px 18px', background:'linear-gradient(135deg,#E05A3A,#F79B3D)', color:'#fff', fontSize:11, fontWeight:700, borderRadius:30, whiteSpace:'nowrap', boxShadow:'0 4px 14px rgba(224,90,58,0.4)'}}>
                        ✦ {p.tag}
                      </div>
                    )}
                    <div style={{width:36, height:4, borderRadius:2, background:f?'linear-gradient(90deg,#F79B3D,#E05A3A)':'var(--chk-bg)', marginBottom:22, boxShadow:f?'0 2px 10px rgba(247,155,61,0.4)':'none'}}/>
                    <div style={{fontFamily:'Poppins,sans-serif', fontWeight:700, fontSize:17, color:f?'#FFF5E8':'var(--pc-tx)', marginBottom:6}}>{p.name}</div>
                    <p style={{fontSize:13, color:f?'rgba(255,245,220,0.45)':'var(--pc-muted)', lineHeight:1.65, marginBottom:20}}>{p.desc}</p>
                    <div style={{display:'flex', alignItems:'baseline', gap:4, marginBottom:24, paddingBottom:20, borderBottom:`1px solid ${f?'rgba(255,245,220,0.1)':'var(--pc-sep)'}`}}>
                      <span style={{fontFamily:'Poppins,sans-serif', fontWeight:900, fontSize:38, color:f?'#FFF5E8':'var(--pc-tx)', letterSpacing:'-0.03em', lineHeight:1}}>{p.price}</span>
                      <span style={{fontSize:13, color:f?'rgba(255,245,220,0.4)':'var(--pc-muted)', fontWeight:500}}>/month</span>
                    </div>
                    <div style={{display:'flex', flexDirection:'column', gap:10, marginBottom:28, flex:1}}>
                      {p.features.map(feat=>(
                        <div key={feat} style={{display:'flex', alignItems:'center', gap:10, fontSize:13, color:f?'rgba(255,245,220,0.7)':'var(--pc-tx)'}}>
                          <div className={f?'chk-d':'chk-l'}>✓</div>
                          {feat}
                        </div>
                      ))}
                    </div>
                    <Link href="/admin/login">
                      <button style={{width:'100%', padding:'14px', borderRadius:12, border:f?'none':`1.5px solid var(--pc-btn-bd)`, background:f?'linear-gradient(135deg,#E05A3A,#F79B3D)':'var(--pc-btn-bg)', color:f?'#fff':'var(--pc-btn-tx)', fontSize:14, fontWeight:700, fontFamily:'Poppins,sans-serif', cursor:'pointer', boxShadow:f?'0 8px 24px rgba(224,90,58,0.4)':'none'}}>
                        {p.cta}
                      </button>
                    </Link>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {/* ══ CTA — always dark ══ */}
        <section style={{background:'#0C0A08', padding:'96px 56px', position:'relative', overflow:'hidden', borderTop:'1px solid rgba(255,245,220,0.06)'}}>
          <div className="no-transition" style={{position:'absolute', top:'-30%', left:'50%', transform:'translateX(-50%)', width:800, height:600, borderRadius:'50%', background:'radial-gradient(ellipse, rgba(247,155,61,0.1) 0%, transparent 60%)', pointerEvents:'none', filter:'blur(40px)'}}/>
          <div style={{maxWidth:800, margin:'0 auto', textAlign:'center', position:'relative', zIndex:1}}>
            <div ref={addReveal} className="ar-reveal">
              <div style={{display:'inline-flex', alignItems:'center', gap:7, padding:'5px 14px', borderRadius:30, background:'rgba(247,155,61,0.1)', border:'1px solid rgba(247,155,61,0.2)', fontSize:11, fontWeight:700, color:'rgba(247,155,61,0.75)', letterSpacing:'0.08em', textTransform:'uppercase', marginBottom:28}}>✦ Join 500+ restaurants</div>
              <h2 style={{fontFamily:'Poppins,sans-serif', fontWeight:900, fontSize:'clamp(32px,4.5vw,60px)', color:'#FFF5E8', lineHeight:1.08, letterSpacing:'-0.03em', marginBottom:20}}>
                Ready to bring your<br/>
                <span style={{background:'linear-gradient(90deg,#F79B3D,#E05A3A)', WebkitBackgroundClip:'text', WebkitTextFillColor:'transparent'}}>menu to life?</span>
              </h2>
              <p style={{fontSize:17, color:'rgba(255,245,220,0.48)', lineHeight:1.85, maxWidth:480, margin:'0 auto 40px'}}>
                Start your free trial today. No credit card required. Your AR menu will be live in under 5 minutes.
              </p>
              <div style={{display:'flex', justifyContent:'center', gap:12, flexWrap:'wrap', marginBottom:48}}>
                <Link href="/admin/login"><button className="btn-amber" style={{fontSize:16, padding:'16px 36px'}}>Start free trial →</button></Link>
                <a href="mailto:hello@advertradical.com"><button className="btn-ghost" style={{fontSize:16, padding:'16px 28px'}}>Talk to us</button></a>
              </div>
              <div style={{display:'flex', justifyContent:'center', gap:32, flexWrap:'wrap'}}>
                {[{icon:'✉️',label:'hello@advertradical.com',href:'mailto:hello@advertradical.com'},{icon:'📞',label:'+91 98765 43210',href:'tel:+919876543210'}].map(c=>(
                  <a key={c.href} href={c.href} style={{display:'flex', alignItems:'center', gap:8, fontSize:14, color:'rgba(255,245,220,0.45)', fontWeight:500}}
                    onMouseOver={e=>e.currentTarget.style.color='rgba(255,245,220,0.8)'}
                    onMouseOut={e=>e.currentTarget.style.color='rgba(255,245,220,0.45)'}>
                    <span>{c.icon}</span> {c.label}
                  </a>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* ══ FOOTER — always dark ══ */}
        <footer style={{background:'#0C0A08', borderTop:'1px solid rgba(255,245,220,0.07)', padding:'24px 56px'}}>
          <div style={{maxWidth:1400, margin:'0 auto', display:'flex', alignItems:'center', justifyContent:'space-between', flexWrap:'wrap', gap:16}}>
            <span style={{fontFamily:'Poppins,sans-serif', fontWeight:800, fontSize:15, color:'#FFF5E8'}}>
              Advert <span style={{background:'linear-gradient(135deg,#E05A3A,#F79B3D)', WebkitBackgroundClip:'text', WebkitTextFillColor:'transparent'}}>Radical</span>
            </span>
            <span style={{fontSize:13, color:'rgba(255,245,220,0.25)'}}>© {new Date().getFullYear()} Advert Radical. All rights reserved.</span>
            <div style={{display:'flex', gap:24, alignItems:'center'}}>
              {['Privacy','Terms'].map(l=>(
                <a key={l} href="#" style={{fontSize:13, color:'rgba(255,245,220,0.3)'}}
                  onMouseOver={e=>e.currentTarget.style.color='rgba(255,245,220,0.6)'}
                  onMouseOut={e=>e.currentTarget.style.color='rgba(255,245,220,0.3)'}>{l}</a>
              ))}
              <Link href="/admin/login" style={{fontSize:13, color:'rgba(255,245,220,0.3)'}}>Sign in</Link>
              <Link href="/superadmin/login" style={{fontSize:13, color:'rgba(255,245,220,0.2)'}}>Super Admin</Link>
            </div>
          </div>
        </footer>
      </div>
    </>
  );
}