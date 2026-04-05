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

  // ── GSAP scroll story ──
  const spacerRef   = useRef(null);
  const chRefs      = useRef([]);
  const activeChRef = useRef(0);
  const [activeCh, setActiveCh] = useState(0);
  const [statCount, setStatCount] = useState(0);

  // ── Mobile swipe story ──
  const [mobileCh, setMobileCh]       = useState(0);
  const [mobileCount, setMobileCount] = useState(0);
  const mobileDoneRef   = useRef(false);
  const touchStartRef   = useRef(0);
  const touchStartY     = useRef(0);

  const handleTouchStart = (e) => {
    touchStartRef.current = e.touches[0].clientX;
    touchStartY.current   = e.touches[0].clientY;
  };
  const handleTouchEnd = (e) => {
    const dx = touchStartRef.current - e.changedTouches[0].clientX;
    const dy = Math.abs(touchStartY.current - e.changedTouches[0].clientY);
    if (dy > Math.abs(dx)) return; // vertical scroll — don't intercept
    if (dx >  48) setMobileCh(p => { const n = Math.min(5, p+1); if (n===5 && !mobileDoneRef.current) { mobileDoneRef.current=true; animateMobileCount(); } return n; });
    if (dx < -48) setMobileCh(p => Math.max(0, p-1));
  };
  const animateMobileCount = () => {
    let start; const dur = 1600;
    const tick = ts => {
      if (!start) start = ts;
      const p = Math.min((ts-start)/dur, 1);
      setMobileCount(Math.round(28*(1-Math.pow(1-p,3))));
      if (p < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  };
  const statDoneRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    let ctx;
    (async () => {
      const { default: gsap } = await import('gsap');
      const { ScrollTrigger }  = await import('gsap/ScrollTrigger');
      if (cancelled) return;
      gsap.registerPlugin(ScrollTrigger);
      ctx = gsap.context(() => {
        // Explicitly show ch0, hide rest
        gsap.set(chRefs.current[0], { opacity:1, y:0 });
        const tl = gsap.timeline({
          scrollTrigger: {
            trigger: spacerRef.current,
            start: 'top top',
            end: 'bottom bottom',
            scrub: 1.2,
            invalidateOnRefresh: true,
            onUpdate: self => {
              const ch = Math.min(5, Math.floor(self.progress * 7));
              if (ch !== activeChRef.current) { activeChRef.current = ch; setActiveCh(ch); }
            },
          },
        });
        tl.set({}, {}, 6);
        [[0,1],[1,2],[2,3],[3,4],[4,5]].forEach(([out, inn]) => {
          const t = out + 1;
          tl.to(chRefs.current[out], { opacity:0, y:-56, duration:0.5 }, t);
          tl.fromTo(chRefs.current[inn], { opacity:0, y:72 }, { opacity:1, y:0, duration:0.5 }, t + 0.2);
        });
        // Ch04: stagger AI cards in
        const aiCards = chRefs.current[4]?.querySelectorAll('.ai-card');
        if (aiCards?.length) {
          gsap.set(aiCards, { y:22, opacity:0 });
          tl.to(aiCards, { y:0, opacity:1, stagger:0.09, duration:0.28, ease:'power2.out' }, 4.6);
        }
      });
    })();
    return () => { cancelled = true; ctx && ctx.revert(); };
  }, []);


  // Animate +28% counter when Ch05 becomes active
  useEffect(() => {
    if (activeCh === 5 && !statDoneRef.current) {
      statDoneRef.current = true;
      let start;
      const dur = 1600;
      const tick = ts => {
        if (!start) start = ts;
        const p = Math.min((ts - start) / dur, 1);
        const ease = 1 - Math.pow(1 - p, 3);
        setStatCount(Math.round(28 * ease));
        if (p < 1) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    }
  }, [activeCh]);

  // ── Nav hide on scroll down, show on scroll up ──
  useEffect(() => {
    let lastY = window.scrollY;
    const handle = () => {
      const y = window.scrollY;
      const nav = document.querySelector('.nav');
      if (!nav) return;
      if (y < 80) {
        nav.style.transform = 'translateY(0)';
      } else if (y > lastY + 3) {
        nav.style.transform = 'translateY(-110%)';
      } else if (y < lastY - 3) {
        nav.style.transform = 'translateY(0)';
      }
      lastY = y;
    };
    window.addEventListener('scroll', handle, { passive: true });
    return () => window.removeEventListener('scroll', handle);
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

      <div data-theme={dark ? 'dark' : 'light'} className="ar-root" style={{fontFamily:'Inter,sans-serif', overflowX:'clip', minHeight:'100vh'}}>
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
            position:fixed; top:0; left:0; right:0; z-index:200;
            padding:0 40px; height:68px;
            display:flex; align-items:center; justify-content:space-between;
            background:var(--nav-bg);
            backdrop-filter:blur(24px); -webkit-backdrop-filter:blur(24px);
            border-bottom:1px solid var(--nav-bd);
            transform:translateY(0);
            transition:transform 0.42s cubic-bezier(0.16,1,0.3,1) !important;
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
            /* ── Grid collapses ── */
            .hero-grid, .how-grid { grid-template-columns:1fr !important; }
            .how-grid { gap:36px !important; }
            .nav { padding:0 20px; }
            .nl-hide { display:none; }
            .section-inner { padding:0 20px; }
            .bento { grid-template-columns:1fr; }

            /* ── Stats band ── */
            .stats-band-outer { padding:40px 20px !important; }
            .stats-inner-grid { grid-template-columns:1fr 1fr !important; gap:28px 0 !important; }
            .stats-inner-grid > div { padding:0 16px !important; }
            .stat-divider { display:none !important; }

            /* ── How it works — hide dashboard, text is enough ── */
            .how-dash-col { display:none !important; }

            /* ── Demo strip ── */
            .demo-strip { padding:22px 20px !important; }
            .demo-strip > div { flex-direction:column !important; align-items:flex-start !important; gap:14px !important; }

            /* ── Pricing ── */
            .plan-grid { grid-template-columns:1fr !important; max-width:100% !important; }

            /* ── CTA section ── */
            .cta-section { padding:64px 20px !important; }

            /* ── Footer ── */
            footer { padding:24px 20px !important; }
            footer > div { flex-direction:column !important; align-items:flex-start !important; gap:14px !important; }
            footer > div > div { gap:16px !important; flex-wrap:wrap !important; }

            /* ── Bento full-width card ── */
            .bento-card[style*="gridColumn"] { grid-column:auto !important; flex-direction:column !important; align-items:flex-start !important; }

            /* ── Section top/bottom padding reduction ── */
            #how, #features, #plans { padding-top:64px !important; padding-bottom:64px !important; }
          }

          /* ══════════════════════════════════════
             SCROLL STORY
          ══════════════════════════════════════ */
          @keyframes scanMove   { 0%{top:12%;opacity:1} 48%{top:80%;opacity:0.9} 52%{top:80%;opacity:0.9} 100%{top:12%;opacity:1} }
          @keyframes ringExpand { 0%{transform:scale(0.6);opacity:1} 100%{transform:scale(2.2);opacity:0} }
          @keyframes dishFloat  { 0%,100%{transform:translateY(0px)} 50%{transform:translateY(-10px)} }
          @keyframes scrollDrop { 0%,100%{transform:translate(-50%,0)} 50%{transform:translate(-50%,7px)} }
          @keyframes dotBlink   { 0%,100%{opacity:1} 50%{opacity:0.3} }

          .story-pin {
            position:sticky; top:0; height:100vh; width:100%;
            background:#0C0A08; overflow:hidden;
            display:flex; align-items:center; justify-content:center;
          }
          /* Ambient glow */
          .story-pin::before,
          .story-pin::after {
            content:''; position:absolute; border-radius:50%; pointer-events:none;
          }
          .story-pin::before {
            width:70vw; height:70vw; top:-20%; right:-15%;
            background:radial-gradient(circle, rgba(247,155,61,0.07) 0%, transparent 60%);
          }
          .story-pin::after {
            width:55vw; height:55vw; bottom:-20%; left:-10%;
            background:radial-gradient(circle, rgba(224,90,58,0.05) 0%, transparent 65%);
          }
          /* Hairline grid */
          .s-grid {
            position:absolute; inset:0; pointer-events:none;
            background-image:
              linear-gradient(rgba(255,245,220,0.022) 1px, transparent 1px),
              linear-gradient(90deg, rgba(255,245,220,0.022) 1px, transparent 1px);
            background-size:80px 80px;
          }

          /* Chapter wrapper */
          .s-ch {
            position:absolute; inset:0;
            display:flex; flex-direction:column;
            align-items:center; justify-content:center;
            padding:80px 32px 96px;
            will-change:opacity,transform;
          }
          /* GSAP sets initial states; all chapters default hidden */
          .s-ch { opacity:0; transform:translateY(72px); }

          /* Typography */
          .s-eye {
            font-family:Poppins,sans-serif; font-weight:600;
            font-size:10px; letter-spacing:0.28em; text-transform:uppercase;
            color:rgba(247,155,61,0.45); margin-bottom:20px;
          }
          .s-h {
            font-family:Poppins,sans-serif; font-weight:900;
            font-size:clamp(52px,7vw,96px);
            line-height:0.92; letter-spacing:-0.04em;
            color:#FFF5E8; text-align:center; margin-bottom:0;
          }
          .s-h em {
            display:block; font-style:normal;
            -webkit-text-stroke:2px rgba(255,245,220,0.5);
            -webkit-text-fill-color:transparent;
          }
          .s-sub {
            font-size:clamp(14px,1.4vw,17px); font-weight:400;
            color:rgba(255,245,220,0.32); line-height:1.75;
            text-align:center; max-width:500px; font-family:Inter,sans-serif;
          }
          .s-vis { margin:30px 0 24px; }

          /* ── Ch01 — Menu card ── */
          .menu-card {
            width:288px;
            background:#111009;
            border:1px solid rgba(255,245,220,0.1);
            border-radius:18px;
            box-shadow:0 24px 60px rgba(0,0,0,0.7);
            overflow:hidden;
          }
          .menu-card-head {
            background:#1A1208;
            padding:14px 20px;
            display:flex; align-items:center; justify-content:space-between;
            border-bottom:1px solid rgba(255,245,220,0.07);
          }
          .menu-card-title {
            font-family:Poppins,sans-serif; font-weight:800;
            font-size:13px; letter-spacing:0.06em; color:rgba(255,245,220,0.7);
          }
          .menu-card-badge {
            font-size:9px; font-weight:700; letter-spacing:0.1em;
            background:rgba(224,90,58,0.15); color:rgba(224,90,58,0.85);
            border:1px solid rgba(224,90,58,0.25); border-radius:5px;
            padding:3px 8px; text-transform:uppercase;
          }
          .menu-card-body { padding:8px 0; }
          .menu-row {
            display:flex; justify-content:space-between; align-items:center;
            padding:10px 20px;
            border-bottom:1px solid rgba(255,245,220,0.04);
          }
          .menu-row:last-child { border-bottom:none; }
          .menu-row-name {
            font-family:Poppins,sans-serif; font-weight:500;
            font-size:13px; color:rgba(255,245,220,0.55);
          }
          .menu-row-price {
            font-family:Poppins,sans-serif; font-weight:700;
            font-size:13px; color:rgba(255,245,220,0.35);
          }
          .menu-card-foot {
            padding:12px 20px;
            background:rgba(224,90,58,0.07);
            border-top:1px solid rgba(224,90,58,0.15);
            display:flex; align-items:center; gap:8px;
          }
          .menu-foot-dot {
            width:6px; height:6px; border-radius:50%;
            background:#E05A3A; flex-shrink:0;
            animation:dotBlink 2s ease-in-out infinite;
          }
          .menu-foot-text {
            font-size:10px; font-weight:700; letter-spacing:0.09em;
            text-transform:uppercase; color:rgba(224,90,58,0.7);
          }

          /* ── Ch02 — QR wrap ── */
          .qr-wrap {
            position:relative; width:220px; height:220px;
          }
          .qr-c { position:absolute; width:22px; height:22px; }
          .qr-c.tl { top:0;left:0; border-top:2.5px solid #F79B3D; border-left:2.5px solid #F79B3D; border-radius:4px 0 0 0; }
          .qr-c.tr { top:0;right:0; border-top:2.5px solid #F79B3D; border-right:2.5px solid #F79B3D; border-radius:0 4px 0 0; }
          .qr-c.bl { bottom:0;left:0; border-bottom:2.5px solid #F79B3D; border-left:2.5px solid #F79B3D; border-radius:0 0 0 4px; }
          .qr-c.br { bottom:0;right:0; border-bottom:2.5px solid #F79B3D; border-right:2.5px solid #F79B3D; border-radius:0 0 4px 0; }
          .qr-inner {
            position:absolute; inset:16px;
            background:#FFF8EE; border-radius:12px;
            display:flex; align-items:center; justify-content:center;
            box-shadow:0 12px 48px rgba(0,0,0,0.55), 0 0 0 1px rgba(247,155,61,0.15);
            overflow:hidden;
          }
          .qr-scan {
            position:absolute; left:0; right:0; height:2.5px;
            background:linear-gradient(90deg,transparent,rgba(247,155,61,0.9) 30%,rgba(247,155,61,0.9) 70%,transparent);
            box-shadow:0 0 12px rgba(247,155,61,1), 0 0 28px rgba(247,155,61,0.5);
            border-radius:2px; top:10%;
            animation:scanMove 2.4s ease-in-out infinite;
          }
          .qr-label {
            position:absolute; bottom:-28px; left:50%; transform:translateX(-50%);
            font-size:9px; font-weight:700; letter-spacing:0.22em;
            color:rgba(247,155,61,0.45); text-transform:uppercase; white-space:nowrap;
          }

          /* ── Ch03 — Phone + floating AR food ── */
          /* ── Ch03 — AR image ── */
          .ar-img-wrap {
            position:relative; display:inline-block;
            border-radius:20px; overflow:hidden;
            box-shadow:0 32px 80px rgba(0,0,0,0.75),
                       0 0 0 1px rgba(247,155,61,0.18),
                       0 0 80px rgba(247,155,61,0.08);
          }
          .ar-img {
            display:block;
            width:min(700px, 88vw);
            height:auto;
            border-radius:20px;
          }
          /* Corner brackets overlay */
          .ar-img-c { position:absolute; width:22px; height:22px; z-index:3; }
          .ar-img-c.tl { top:12px; left:12px; border-top:2.5px solid rgba(247,155,61,0.9); border-left:2.5px solid rgba(247,155,61,0.9); border-radius:3px 0 0 0; }
          .ar-img-c.tr { top:12px; right:12px; border-top:2.5px solid rgba(247,155,61,0.9); border-right:2.5px solid rgba(247,155,61,0.9); border-radius:0 3px 0 0; }
          .ar-img-c.bl { bottom:12px; left:12px; border-bottom:2.5px solid rgba(247,155,61,0.9); border-left:2.5px solid rgba(247,155,61,0.9); border-radius:0 0 0 3px; }
          .ar-img-c.br { bottom:12px; right:12px; border-bottom:2.5px solid rgba(247,155,61,0.9); border-right:2.5px solid rgba(247,155,61,0.9); border-radius:0 0 3px 0; }
          /* AR LIVE badge */
          .ar-img-badge {
            position:absolute; top:20px; left:20px; z-index:4;
            background:rgba(0,0,0,0.65); border:1px solid rgba(247,155,61,0.45);
            border-radius:7px; padding:5px 10px;
            display:flex; align-items:center; gap:6px;
            font-size:9px; font-weight:700; letter-spacing:0.16em;
            text-transform:uppercase; color:rgba(247,155,61,0.95);
            backdrop-filter:blur(8px);
          }
          .ar-img-badge-dot {
            width:6px; height:6px; border-radius:50%; background:#F79B3D;
            box-shadow:0 0 8px rgba(247,155,61,0.9);
            animation:dotBlink 1.2s ease-in-out infinite; flex-shrink:0;
          }
          /* Subtle amber glow at bottom */
          .ar-img-glow {
            position:absolute; bottom:0; left:0; right:0; height:40%;
            background:linear-gradient(to top, rgba(247,155,61,0.06) 0%, transparent 100%);
            pointer-events:none;
          }
          .ar-cam-topbar, .ar-cam-bottombar {
            position:absolute; left:0; right:0;
            padding:8px 12px; z-index:5;
            display:flex; justify-content:space-between; align-items:center;
          }
          .ar-cam-topbar {
            top:0;
            background:linear-gradient(to bottom, rgba(0,0,0,0.75) 0%, transparent 100%);
          }
          .ar-cam-bottombar {
            bottom:0;
            background:linear-gradient(to top, rgba(0,0,0,0.85) 0%, transparent 100%);
            padding-bottom:10px;
          }
          .ar-cam-lbl {
            font-size:8px; font-weight:700; letter-spacing:0.14em;
            text-transform:uppercase; color:rgba(255,245,220,0.65);
          }
          .ar-rec-dot {
            width:7px; height:7px; border-radius:50%; background:#FF3B30;
            animation:dotBlink 1.4s ease-in-out infinite;
          }
          /* Frame corner brackets */
          .ar-fc { position:absolute; width:16px; height:16px; z-index:4; }
          .ar-fc.tl { top:6px; left:6px; border-top:2px solid rgba(247,155,61,0.7); border-left:2px solid rgba(247,155,61,0.7); border-radius:2px 0 0 0; }
          .ar-fc.tr { top:6px; right:6px; border-top:2px solid rgba(247,155,61,0.7); border-right:2px solid rgba(247,155,61,0.7); border-radius:0 2px 0 0; }
          .ar-fc.bl { bottom:6px; left:6px; border-bottom:2px solid rgba(247,155,61,0.7); border-left:2px solid rgba(247,155,61,0.7); border-radius:0 0 0 2px; }
          .ar-fc.br { bottom:6px; right:6px; border-bottom:2px solid rgba(247,155,61,0.7); border-right:2px solid rgba(247,155,61,0.7); border-radius:0 0 2px 0; }
          /* Food + bounding box */
          .ar-cam-food-wrap {
            position:absolute; left:50%; top:26px;
            transform:translateX(-50%);
            width:120px; height:104px;
            display:flex; align-items:center; justify-content:center; z-index:3;
          }
          .ar-bbox {
            position:absolute; inset:0;
            border:1.5px dashed rgba(247,155,61,0.65); border-radius:6px;
          }
          .ar-handle {
            position:absolute; width:8px; height:8px; border-radius:2px;
            background:#F79B3D; box-shadow:0 0 8px rgba(247,155,61,0.9);
          }
          .ar-cam-food { animation:dishFloat 3.4s ease-in-out infinite; position:relative; z-index:2; }
          .ar-surf-shadow {
            position:absolute; bottom:-6px; left:50%; transform:translateX(-50%);
            width:56px; height:10px; border-radius:50%;
            background:radial-gradient(ellipse, rgba(247,155,61,0.55) 0%, transparent 70%);
            filter:blur(4px);
          }
          .ar-coords-lbl {
            position:absolute; bottom:-22px; left:50%; transform:translateX(-50%);
            font-size:7px; font-weight:600; letter-spacing:0.05em;
            color:rgba(247,155,61,0.5); white-space:nowrap; font-family:monospace;
          }
          /* Perspective mesh */
          .ar-mesh-plane {
            position:absolute; bottom:26px; left:0; right:0; z-index:2;
          }
          /* ── Ch04 — AI suggest ── */
          .ai-stack { display:flex; flex-direction:column; gap:9px; width:308px; }
          .ai-card {
            background:#fff;
            border-radius:14px; padding:13px 16px;
            display:flex; align-items:center; gap:12px;
            box-shadow:0 6px 28px rgba(0,0,0,0.22), 0 1px 3px rgba(0,0,0,0.15);
          }
          .ai-card-icon { font-size:28px; flex-shrink:0; line-height:1; }
          .ai-card-info { flex:1; min-width:0; }
          .ai-card-name { font-family:Poppins,sans-serif; font-weight:700; font-size:13.5px; color:#1A1208; line-height:1.2; }
          .ai-card-hint { font-size:11px; color:rgba(26,18,8,0.45); margin-top:2px; font-weight:500; }
          .ai-add {
            width:28px; height:28px; border-radius:8px; flex-shrink:0;
            background:linear-gradient(135deg,#E05A3A,#F79B3D);
            display:flex; align-items:center; justify-content:center;
            color:#fff; font-size:18px; line-height:1; font-weight:300;
            box-shadow:0 3px 10px rgba(224,90,58,0.4);
          }
          .ai-badge {
            display:flex; align-items:center; gap:6px;
            margin-bottom:10px;
            font-size:10px; font-weight:700; letter-spacing:0.12em;
            color:rgba(247,155,61,0.55); text-transform:uppercase;
          }
          .ai-badge-dot { width:5px; height:5px; border-radius:50%; background:#F79B3D; animation:dotBlink 1.5s infinite; }

          /* ── Ch05 — Stat ── */
          .stat-card {
            background:linear-gradient(145deg,#141008,#1c1608);
            border:1px solid rgba(247,155,61,0.18);
            border-radius:22px; padding:28px 36px;
            text-align:center; min-width:280px;
            box-shadow:0 28px 70px rgba(0,0,0,0.65), 0 0 0 1px rgba(247,155,61,0.06);
          }
          .stat-big {
            font-family:Poppins,sans-serif; font-weight:900;
            font-size:76px; line-height:1; letter-spacing:-0.05em;
            background:linear-gradient(135deg,#F79B3D 20%,#E05A3A 80%);
            -webkit-background-clip:text; -webkit-text-fill-color:transparent;
          }
          .stat-desc { font-size:13px; color:rgba(255,245,220,0.6); margin-top:6px; font-weight:500; letter-spacing:0.01em; }
          .stat-chart {
            display:flex; align-items:flex-end; gap:4px;
            height:36px; margin:18px auto 0; width:fit-content;
          }
          .stat-bar { width:8px; border-radius:3px 3px 0 0; }
          .stat-two {
            display:flex; gap:16px; justify-content:center; margin-top:16px;
            padding-top:16px; border-top:1px solid rgba(255,245,220,0.07);
          }
          .stat-pill {
            display:flex; flex-direction:column; align-items:center; gap:2px;
          }
          .stat-pill-num {
            font-family:Poppins,sans-serif; font-weight:800; font-size:18px;
            color:#FFF5E8; letter-spacing:-0.02em;
          }
          .stat-pill-lbl { font-size:10px; color:rgba(255,245,220,0.35); font-weight:500; }

          /* Progress dots */
          .s-dots {
            position:absolute; bottom:28px; left:50%; transform:translateX(-50%);
            display:flex; gap:7px; align-items:center; z-index:10;
          }
          .s-dot {
            height:5px; border-radius:3px; width:5px;
            background:rgba(255,245,220,0.18);
            transition:width 0.45s cubic-bezier(0.34,1.56,0.64,1), background 0.35s ease !important;
          }
          .s-dot.on { width:24px !important; background:#F79B3D; }

          /* Scroll hint */
          .s-hint {
            position:absolute; bottom:34px; left:50%;
            animation:scrollDrop 1.8s ease-in-out infinite;
            pointer-events:none; z-index:20;
            transition:opacity 0.5s ease;
          }
          .s-hint-mouse {
            width:20px; height:32px;
            border:1.5px solid rgba(255,245,220,0.28); border-radius:10px;
            display:flex; align-items:flex-start; justify-content:center;
            padding-top:4px; margin:0 auto 5px;
          }
          .s-hint-wheel { width:2px; height:6px; background:rgba(255,245,220,0.5); border-radius:2px; }
          .s-hint-txt {
            display:block; text-align:center;
            font-size:9px; font-weight:700; letter-spacing:0.2em;
            text-transform:uppercase; color:rgba(255,245,220,0.25);
          }

          @media(max-width:820px) {
            .s-h { font-size:clamp(44px,12vw,72px); }
            .menu-card, .ai-stack { width:90vw; max-width:288px; }
          }
          /* ── Mobile Story ── */
          .mobile-story-outer { display:none; }

          @media(max-width:820px) {
            /* Kill the GSAP story entirely on mobile */
            .story-spacer { display:none !important; }
            .story-pin   { display:none !important; }
            /* Show mobile version */
            .mobile-story-outer {
              display:block; height:100vh;
              background:#0C0A08; overflow:hidden;
              position:relative;
            }
            /* Smaller headline for mobile */
            .s-h { font-size:clamp(38px,10.5vw,56px) !important; }
            /* Mobile chapter cards */
            .mob-ch {
              position:absolute; inset:0;
              display:flex; flex-direction:column;
              align-items:center; justify-content:center;
              padding:80px 28px 90px;
              transition:opacity 0.38s ease, transform 0.4s cubic-bezier(0.16,1,0.3,1);
              will-change:opacity,transform;
            }
            .mob-ch.active  { opacity:1; transform:translateX(0); pointer-events:auto; }
            .mob-ch.before  { opacity:0; transform:translateX(-56px); pointer-events:none; }
            .mob-ch.after   { opacity:0; transform:translateX(56px);  pointer-events:none; }
            /* Tap zones */
            .mob-tap-prev, .mob-tap-next {
              position:absolute; top:0; bottom:0; width:40%; z-index:20;
              display:flex; align-items:flex-end; padding-bottom:36px;
            }
            .mob-tap-prev { left:0; justify-content:flex-start; padding-left:20px; }
            .mob-tap-next { right:0; justify-content:flex-end; padding-right:20px; }
            .mob-tap-btn {
              width:40px; height:40px; border-radius:50%;
              background:rgba(255,255,255,0.06); border:1px solid rgba(255,255,255,0.1);
              display:flex; align-items:center; justify-content:center;
              color:rgba(255,245,220,0.5); font-size:18px; cursor:pointer;
              transition:background 0.2s, color 0.2s;
            }
            .mob-tap-btn:active { background:rgba(247,155,61,0.18); color:#F79B3D; }
            /* Swipe hint */
            .mob-swipe-hint {
              position:absolute; bottom:58px; left:50%; transform:translateX(-50%);
              font-size:9px; font-weight:700; letter-spacing:0.2em;
              text-transform:uppercase; color:rgba(255,245,220,0.22);
              white-space:nowrap; pointer-events:none;
            }
            /* Override visual sizes for mobile */
            .menu-card { width:min(288px,84vw); }
            .qr-wrap   { width:min(200px,72vw); height:min(200px,72vw); }
            .ai-stack  { width:min(308px,90vw); }
            .stat-card { min-width:unset; width:min(280px,86vw); }
            .ar-img    { width:min(340px,92vw) !important; }
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
            <Link href="/signup?plan=growth" className="nav-cta">Get started →</Link>
          </div>
        </nav>

        {/* ══ SCROLL STORY HERO ══ */}
        <section ref={spacerRef} className="story-spacer" style={{height:'600vh', position:'relative'}}>
          <div className="story-pin">
            <div className="s-grid no-transition"/>

            {/* ── Chapter 00 — Hero (positive opening) ── */}
            <div ref={el => chRefs.current[0] = el} className="s-ch" style={{pointerEvents: activeCh===0?'auto':'none', flexDirection:'row', padding:'0', background:'radial-gradient(ellipse at 65% 30%, rgba(247,155,61,0.08) 0%, transparent 55%)'}}>
              <div style={{maxWidth:1280, width:'100%', display:'grid', gridTemplateColumns:'1fr 1fr', gap:56, alignItems:'center', padding:'88px 72px'}}>

                {/* LEFT — text */}
                <div>
                  <div style={{display:'inline-flex', alignItems:'center', gap:8, padding:'6px 14px 6px 10px', borderRadius:30, background:'rgba(247,155,61,0.12)', border:'1px solid rgba(247,155,61,0.25)', fontSize:12, fontWeight:600, color:'rgba(255,200,120,0.9)', letterSpacing:'0.02em', marginBottom:28, animation:'heroFade 0.6s ease both'}}>
                    <span className="no-transition" style={{width:8, height:8, borderRadius:'50%', background:'#F79B3D', animation:'pulse 2s infinite', flexShrink:0}}/>
                    AR + AI Revenue Platform
                  </div>
                  <h1 style={{fontFamily:'Poppins,sans-serif', fontWeight:900, fontSize:'clamp(38px,4.2vw,62px)', lineHeight:1.0, letterSpacing:'-0.03em', color:'#FFF5E8', marginBottom:24, animation:'heroFade 0.7s ease 0.1s both'}}>
                    The AR Menu<br/>
                    <span style={{background:'linear-gradient(90deg,#F79B3D,#E05A3A)', WebkitBackgroundClip:'text', WebkitTextFillColor:'transparent'}}>That Sells</span><br/>
                    More Food.
                  </h1>
                  <p style={{fontSize:16, color:'rgba(255,245,220,0.52)', lineHeight:1.85, maxWidth:420, marginBottom:36, animation:'heroFade 0.7s ease 0.2s both'}}>
                    Customers scan your QR, watch dishes appear life-size in 3D on their table, get AI-powered suggestions — and order more. No app. No friction.
                  </p>
                  <div style={{display:'flex', gap:12, alignItems:'center', flexWrap:'wrap', animation:'heroFade 0.7s ease 0.3s both'}}>
                    <Link href="/signup?plan=growth"><button className="btn-amber">Start free trial</button></Link>
                    <a href="https://ar-saa-s-kbzn.vercel.app/restaurant/spot" target="_blank" rel="noreferrer">
                      <button className="btn-ghost">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polygon points="5 3 19 12 5 21 5 3"/></svg>
                        See live demo
                      </button>
                    </a>
                  </div>
                  <div style={{display:'flex', alignItems:'center', gap:14, marginTop:32, paddingTop:24, borderTop:'1px solid rgba(255,245,220,0.08)'}}>
                    <div style={{display:'flex'}}>
                      {['🧑‍🍳','👨‍🍳','👩‍🍳','🧑‍🍳'].map((e,i)=>(
                        <div key={i} style={{width:30, height:30, borderRadius:'50%', background:`hsl(${30+i*20},60%,${30+i*5}%)`, border:'2px solid #1A1208', display:'flex', alignItems:'center', justifyContent:'center', fontSize:14, marginLeft:i===0?0:-8, position:'relative', zIndex:4-i}}>
                          {e}
                        </div>
                      ))}
                    </div>
                    <div>
                      <div style={{fontFamily:'Poppins,sans-serif', fontWeight:700, fontSize:14, color:'#FFF5E8', lineHeight:1}}>500+ restaurants</div>
                      <div style={{fontSize:12, color:'rgba(255,245,220,0.42)', marginTop:3}}>already growing with Advert Radical</div>
                    </div>
                  </div>
                  {/* Scroll nudge */}
                  <div style={{marginTop:28, display:'flex', alignItems:'center', gap:8, opacity:0.35}}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><polyline points="19 12 12 19 5 12"/></svg>
                    <span style={{fontSize:10, fontWeight:700, letterSpacing:'0.18em', textTransform:'uppercase', color:'rgba(255,245,220,0.6)'}}>Scroll to see how it works</span>
                  </div>
                </div>

                {/* RIGHT — Phone mockup */}
                <div style={{display:'flex', justifyContent:'center', alignItems:'center', position:'relative'}}>
                  <div className="no-transition" style={{position:'absolute', inset:0, background:'radial-gradient(ellipse at 50% 50%, rgba(247,155,61,0.18) 0%, transparent 65%)', filter:'blur(20px)', borderRadius:'50%', pointerEvents:'none'}}/>
                  <div className="fa" style={{position:'relative', zIndex:2}}>
                    <div style={{width:248, height:498, borderRadius:44, background:'#1A1208', boxShadow:'0 40px 100px rgba(0,0,0,0.55), 0 0 0 1px rgba(255,255,255,0.08)', position:'relative', overflow:'hidden'}}>
                      <div style={{position:'absolute', top:12, left:'50%', transform:'translateX(-50%)', width:90, height:26, background:'#1A1208', borderRadius:13, zIndex:4}}/>
                      <div style={{position:'absolute', top:0, left:0, right:0, bottom:0, background:'linear-gradient(180deg,#0E1828,#0A1220)', borderRadius:44, overflow:'hidden'}}>
                        <div style={{padding:'48px 14px 18px', height:'100%', display:'flex', flexDirection:'column'}}>
                          <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:14}}>
                            <div>
                              <div style={{fontSize:8, fontWeight:700, color:'rgba(255,245,220,0.35)', letterSpacing:'0.08em', marginBottom:3}}>THE SPOT RESTAURANT</div>
                              <div style={{fontSize:16, fontWeight:800, color:'#FFF5E8', fontFamily:'Poppins,sans-serif', letterSpacing:'-0.02em'}}>AR Menu</div>
                            </div>
                            <div style={{width:32, height:32, borderRadius:10, background:'rgba(247,155,61,0.15)', border:'1px solid rgba(247,155,61,0.3)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:15}}>🥽</div>
                          </div>
                          <div style={{display:'flex', gap:5, marginBottom:12}}>
                            {['All','Biryani','Starters','Desserts'].map((cat,i)=>(
                              <div key={cat} style={{padding:'4px 10px', borderRadius:20, background:i===0?'#F79B3D':'rgba(255,255,255,0.07)', fontSize:8, fontWeight:700, color:i===0?'#1A1208':'rgba(255,245,220,0.45)', whiteSpace:'nowrap', flexShrink:0}}>{cat}</div>
                            ))}
                          </div>
                          <div style={{display:'flex', flexDirection:'column', gap:7, flex:1}}>
                            {[
                              {n:'Chicken Biryani',p:'₹320',e:'🍛',glow:'rgba(247,155,61,0.2)',bg:'rgba(247,155,61,0.08)'},
                              {n:'Paneer Tikka',   p:'₹240',e:'🍢',glow:'rgba(224,90,58,0.15)',bg:'rgba(224,90,58,0.08)'},
                              {n:'Dal Makhani',    p:'₹180',e:'🍲',glow:'rgba(100,180,120,0.12)',bg:'rgba(100,180,120,0.08)'},
                            ].map(d=>(
                              <div key={d.n} style={{display:'flex', alignItems:'center', gap:9, padding:'9px 11px', borderRadius:14, background:d.bg, border:`1px solid ${d.glow}`, boxShadow:`0 3px 14px ${d.glow}`}}>
                                <div style={{width:38, height:38, borderRadius:10, background:'rgba(255,255,255,0.07)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:18, flexShrink:0}}>{d.e}</div>
                                <div style={{flex:1, minWidth:0}}>
                                  <div style={{fontSize:9, fontWeight:700, color:'rgba(255,245,232,0.9)', marginBottom:3}}>{d.n}</div>
                                  <span style={{fontSize:7, fontWeight:700, padding:'2px 5px', borderRadius:5, background:'rgba(247,155,61,0.2)', color:'#F79B3D'}}>AR</span>
                                </div>
                                <div style={{fontSize:10, fontWeight:800, color:'#F79B3D', fontFamily:'Poppins,sans-serif'}}>{d.p}</div>
                              </div>
                            ))}
                          </div>
                          <div style={{marginTop:10, padding:'7px 11px', borderRadius:10, background:'rgba(100,210,255,0.06)', border:'1px solid rgba(100,210,255,0.14)', display:'flex', alignItems:'center', gap:6}}>
                            <div className="no-transition" style={{width:6, height:6, borderRadius:'50%', background:'#64D2FF', animation:'blink 1.5s infinite'}}/>
                            <span style={{fontSize:7.5, fontWeight:700, color:'rgba(100,210,255,0.85)', letterSpacing:'0.04em'}}>AR LIVE — TAP ANY DISH</span>
                          </div>
                        </div>
                      </div>
                      <div style={{position:'absolute', bottom:9, left:'50%', transform:'translateX(-50%)', width:72, height:3, background:'rgba(255,255,255,0.18)', borderRadius:2}}/>
                    </div>
                    {/* Floating card — top right */}
                    <div className="fb" style={{position:'absolute', top:'6%', right:'-22%', background:'rgba(255,255,255,0.97)', borderRadius:18, padding:'11px 15px', boxShadow:'0 12px 36px rgba(26,18,8,0.18)', border:'1px solid rgba(26,18,8,0.07)', minWidth:140, zIndex:5}}>
                      <div style={{display:'flex', alignItems:'center', gap:10}}>
                        <div style={{width:34, height:34, borderRadius:10, background:'rgba(100,210,120,0.12)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:15}}>📈</div>
                        <div>
                          <div style={{fontSize:9, fontWeight:600, color:'rgba(26,18,8,0.42)', marginBottom:2}}>Avg order value</div>
                          <div style={{fontSize:17, fontWeight:900, color:'#1A1208', fontFamily:'Poppins,sans-serif', letterSpacing:'-0.02em'}}>↑ 28%</div>
                        </div>
                      </div>
                    </div>
                    {/* Floating card — bottom left */}
                    <div className="fc" style={{position:'absolute', bottom:'12%', left:'-20%', background:'rgba(255,255,255,0.97)', borderRadius:18, padding:'11px 15px', boxShadow:'0 12px 36px rgba(26,18,8,0.18)', border:'1px solid rgba(26,18,8,0.07)', minWidth:148, zIndex:5}}>
                      <div style={{display:'flex', alignItems:'center', gap:10}}>
                        <div style={{width:34, height:34, borderRadius:10, background:'rgba(247,155,61,0.1)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:15}}>👁️</div>
                        <div>
                          <div style={{fontSize:9, fontWeight:600, color:'rgba(26,18,8,0.42)', marginBottom:2}}>AR views today</div>
                          <div style={{fontSize:17, fontWeight:900, color:'#1A1208', fontFamily:'Poppins,sans-serif', letterSpacing:'-0.02em'}}>2,841</div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>



            {/* ── Chapter 01 — The problem ── */}
            <div ref={el => chRefs.current[1] = el} className="s-ch" style={{pointerEvents: activeCh===1?'auto':'none', background:'radial-gradient(ellipse at 75% 20%, rgba(224,90,58,0.07) 0%, transparent 55%)'}}>
              <div className="s-eye">The Problem</div>
              <h2 className="s-h">Your menu<em>is a PDF.</em></h2>
              <div className="s-vis">
                <div className="menu-card no-transition">
                  <div className="menu-card-head">
                    <span className="menu-card-title">MENU</span>
                    <span className="menu-card-badge">PDF</span>
                  </div>
                  <div className="menu-card-body">
                    {[['Chicken Biryani','₹280'],['Paneer Tikka','₹240'],['Dal Makhani','₹180'],['Gulab Jamun','₹80']].map(([n,p])=>(
                      <div key={n} className="menu-row">
                        <span className="menu-row-name">{n}</span>
                        <span className="menu-row-price">{p}</span>
                      </div>
                    ))}
                  </div>
                  <div className="menu-card-foot">
                    <div className="menu-foot-dot no-transition"/>
                    <span className="menu-foot-text">No photos · No 3D · No engagement</span>
                  </div>
                </div>
              </div>
              <p className="s-sub">Plain text. No visuals. Customers have no idea what they are ordering.</p>
            </div>

            {/* ── Chapter 02 — One scan ── */}
            <div ref={el => chRefs.current[2] = el} className="s-ch" style={{pointerEvents: activeCh===2?'auto':'none', background:'radial-gradient(ellipse at 65% 75%, rgba(247,155,61,0.06) 0%, transparent 55%)'}}>
              <div className="s-eye">The Trigger</div>
              <h2 className="s-h">One scan.<em>No app needed.</em></h2>
              <div className="s-vis">
                <div className="qr-wrap no-transition">
                  <div className="qr-c tl"/><div className="qr-c tr"/>
                  <div className="qr-c bl"/><div className="qr-c br"/>
                  <div className="qr-inner">
                    <svg width="148" height="148" viewBox="0 0 147 147" style={{display:'block', position:'relative', zIndex:1}}>
                      {/* Finder TL */}
                      <rect x="0" y="0" width="49" height="49" rx="4" fill="#1A1208"/>
                      <rect x="7" y="7" width="35" height="35" rx="2" fill="#FFF8EE"/>
                      <rect x="14" y="14" width="21" height="21" rx="1" fill="#1A1208"/>
                      {/* Finder TR */}
                      <rect x="98" y="0" width="49" height="49" rx="4" fill="#1A1208"/>
                      <rect x="105" y="7" width="35" height="35" rx="2" fill="#FFF8EE"/>
                      <rect x="112" y="14" width="21" height="21" rx="1" fill="#1A1208"/>
                      {/* Finder BL */}
                      <rect x="0" y="98" width="49" height="49" rx="4" fill="#1A1208"/>
                      <rect x="7" y="105" width="35" height="35" rx="2" fill="#FFF8EE"/>
                      <rect x="14" y="112" width="21" height="21" rx="1" fill="#1A1208"/>
                      {/* Data modules — computed, all dark */}
                      {(() => {
                        const M = 7; const mods = [];
                        for (let r = 0; r < 21; r++) {
                          for (let col = 0; col < 21; col++) {
                            if (r <= 7 && col <= 7) continue;
                            if (r <= 7 && col >= 13) continue;
                            if (r >= 13 && col <= 7) continue;
                            if (r === 6 && col >= 8 && col <= 12) continue;
                            if (col === 6 && r >= 8 && r <= 12) continue;
                            if ((col * 7 + r * 13 + col * r * 3) % 10 < 5)
                              mods.push(<rect key={`${r}-${col}`} x={col*M} y={r*M} width={M-1} height={M-1} rx="0.5" fill="#1A1208" opacity="0.8"/>);
                          }
                        }
                        return mods;
                      })()}
                      {/* Timing dots */}
                      {[8,10,12].map(col=><rect key={`th${col}`} x={col*7} y={42} width="6" height="6" fill="#1A1208"/>)}
                      {[8,10,12].map(r=><rect key={`tv${r}`} x={42} y={r*7} width="6" height="6" fill="#1A1208"/>)}
                    </svg>
                    <div className="qr-scan no-transition"/>
                  </div>
                  <div className="qr-label">Point any camera to scan</div>
                </div>
              </div>
              <p className="s-sub">Customer opens camera, points at the table. No downloads, no accounts.</p>
            </div>

            {/* ── Chapter 03 — Food in 3D ── */}
            <div ref={el => chRefs.current[3] = el} className="s-ch" style={{pointerEvents: activeCh===3?'auto':'none', background:'radial-gradient(ellipse at 35% 35%, rgba(60,140,255,0.05) 0%, transparent 55%)'}}>
              <div className="s-eye">The Experience</div>
              <h2 className="s-h">Food appears<em>in 3D.</em></h2>
              <div className="s-vis">
                <div className="ar-img-wrap no-transition">
                  {/* Corner brackets */}
                  <div className="ar-img-c tl"/><div className="ar-img-c tr"/>
                  <div className="ar-img-c bl"/><div className="ar-img-c br"/>
                  {/* AR LIVE badge */}
                  <div className="ar-img-badge no-transition">
                    <div className="ar-img-badge-dot no-transition"/>
                    AR LIVE
                  </div>
                  {/* The image */}
                  <img
                    src="/ar-experience.png"
                    alt="Chicken biryani appearing in augmented reality on a restaurant table"
                    className="ar-img no-transition"
                  />
                  {/* Subtle amber glow beneath */}
                  <div className="ar-img-glow no-transition"/>
                </div>
              </div>
              <p className="s-sub">Photorealistic 3D models appear life-size on the customer's actual table — before they order.</p>
            </div>

            {/* ── Chapter 04 — AI suggests ── */}
            <div ref={el => chRefs.current[4] = el} className="s-ch" style={{pointerEvents: activeCh===4?'auto':'none', background:'radial-gradient(ellipse at 60% 60%, rgba(80,210,130,0.05) 0%, transparent 60%)'}}>
              <div className="s-eye">The Intelligence</div>
              <h2 className="s-h">AI suggests<em>what&apos;s next.</em></h2>
              <div className="s-vis">
                <div style={{display:'flex', flexDirection:'column', gap:0}}>
                  <div className="ai-badge no-transition">
                    <div className="ai-badge-dot no-transition"/>
                    Claude AI &nbsp;&middot;&nbsp; Personalised upsells
                  </div>
                  <div className="ai-stack no-transition">
                    {[
                      {e:'🥤',n:'Mango Lassi',  h:'Pairs perfectly with biryani · ₹120'},
                      {e:'🫓',n:'Garlic Naan',   h:'Most popular add-on · ₹60'},
                      {e:'🍮',n:'Gulab Jamun',   h:'Completes the meal · ₹80'},
                    ].map((item,i)=>(
                      <div key={i} className="ai-card">
                        <span className="ai-card-icon">{item.e}</span>
                        <div className="ai-card-info">
                          <div className="ai-card-name">{item.n}</div>
                          <div className="ai-card-hint">{item.h}</div>
                        </div>
                        <div className="ai-add">+</div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
              <p className="s-sub">Smart upsells shown at the right moment. No staff training required.</p>
            </div>

            {/* ── Chapter 05 — The result ── */}
            <div ref={el => chRefs.current[5] = el} className="s-ch" style={{pointerEvents: activeCh===5?'auto':'none', background:'radial-gradient(ellipse at 50% 40%, rgba(247,155,61,0.10) 0%, transparent 55%)'}}>
              <div className="s-eye">The Result</div>
              <h2 className="s-h">Orders<em>up 28%.</em></h2>
              <div className="s-vis">
                <div className="stat-card no-transition">
                  <div className="stat-big">+{statCount}%</div>
                  <div className="stat-desc">Average order value increase</div>
                  <div className="stat-chart">
                    {[14,20,17,28,22,35,27,44,34,56,42,68].map((h,i)=>(
                      <div key={i} className="stat-bar" style={{height:`${h}px`, background: i>=8 ? 'linear-gradient(0deg,#F79B3D,#E05A3A)' : 'rgba(247,155,61,0.2)'}}/>
                    ))}
                  </div>
                  <div className="stat-two">
                    <div className="stat-pill"><span className="stat-pill-num">500+</span><span className="stat-pill-lbl">Restaurants</span></div>
                    <div style={{width:1, background:'rgba(255,245,220,0.08)'}}/>
                    <div className="stat-pill"><span className="stat-pill-num">90 days</span><span className="stat-pill-lbl">Avg. to see results</span></div>
                  </div>
                </div>
              </div>
              <p className="s-sub" style={{marginBottom:22}}>Average across our partners in the first 90 days on the platform.</p>
              <div style={{display:'flex', gap:12, flexWrap:'wrap', justifyContent:'center'}}>
                <Link href="/admin/login"><button className="btn-amber">Start free trial →</button></Link>
                <a href="https://ar-saa-s-kbzn.vercel.app/restaurant/spot" target="_blank" rel="noreferrer">
                  <button className="btn-ghost">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polygon points="5 3 19 12 5 21 5 3"/></svg>
                    See live demo
                  </button>
                </a>
              </div>
            </div>

            {/* Progress dots */}
            <div className="s-dots">
              {[0,1,2,3,4,5].map(i=>(
                <div key={i} className={`s-dot${activeCh===i?' on':''}`}/>
              ))}
            </div>

            {/* Scroll hint */}
            <div className="s-hint" style={{opacity: activeCh===0 ? 1 : 0}}>
              <div className="s-hint-mouse"><div className="s-hint-wheel"/></div>
              <span className="s-hint-txt">Scroll</span>
            </div>
          </div>
        </section>
        {/* ══ END SCROLL STORY ══ */}

        {/* ══ MOBILE STORY (≤820px only) ══ */}
        <div
          className="mobile-story-outer"
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
        >
          <div className="s-grid no-transition"/>

          {/* ── Ch0: Hero ── */}
          <div className={`mob-ch${mobileCh===0?' active':mobileCh>0?' before':' after'}`}>
            <div style={{display:'inline-flex',alignItems:'center',gap:7,padding:'5px 13px 5px 9px',borderRadius:30,background:'rgba(247,155,61,0.12)',border:'1px solid rgba(247,155,61,0.25)',fontSize:11,fontWeight:600,color:'rgba(255,200,120,0.9)',letterSpacing:'0.02em',marginBottom:22}}>
              <span className="no-transition" style={{width:7,height:7,borderRadius:'50%',background:'#F79B3D',animation:'pulse 2s infinite',flexShrink:0}}/> AR + AI Revenue Platform
            </div>
            <h1 style={{fontFamily:'Poppins,sans-serif',fontWeight:900,fontSize:'clamp(36px,11vw,54px)',lineHeight:1.0,letterSpacing:'-0.03em',color:'#FFF5E8',marginBottom:20,textAlign:'center'}}>
              The AR Menu<br/>
              <span style={{background:'linear-gradient(90deg,#F79B3D,#E05A3A)',WebkitBackgroundClip:'text',WebkitTextFillColor:'transparent'}}>That Sells</span><br/>
              More Food.
            </h1>
            <p style={{fontSize:14,color:'rgba(255,245,220,0.48)',lineHeight:1.8,textAlign:'center',maxWidth:320,marginBottom:28}}>
              Customers scan your QR, see dishes in 3D AR on their table, get AI suggestions — and order more.
            </p>
            <div style={{display:'flex',gap:10,flexWrap:'wrap',justifyContent:'center',marginBottom:20}}>
              <Link href="/signup?plan=growth"><button className="btn-amber" style={{fontSize:14,padding:'12px 24px'}}>Start free trial</button></Link>
            </div>
            <div style={{display:'flex',gap:16,justifyContent:'center',flexWrap:'wrap'}}>
              {[['↑ 28%','Avg order increase'],['500+','Restaurants']].map(([num,lbl])=>(
                <div key={lbl} style={{background:'rgba(255,255,255,0.05)',border:'1px solid rgba(255,245,220,0.1)',borderRadius:12,padding:'10px 18px',textAlign:'center'}}>
                  <div style={{fontFamily:'Poppins,sans-serif',fontWeight:800,fontSize:18,color:'#F79B3D',letterSpacing:'-0.02em'}}>{num}</div>
                  <div style={{fontSize:10,color:'rgba(255,245,220,0.4)',marginTop:2}}>{lbl}</div>
                </div>
              ))}
            </div>
          </div>

          {/* ── Ch1: Problem ── */}
          <div className={`mob-ch${mobileCh===1?' active':mobileCh>1?' before':' after'}`}>
            <div className="s-eye">The Problem</div>
            <h2 className="s-h" style={{textAlign:'center',marginBottom:0}}>Your menu<em>is a PDF.</em></h2>
            <div className="s-vis">
              <div className="menu-card no-transition">
                <div className="menu-card-head"><span className="menu-card-title">MENU</span><span className="menu-card-badge">PDF</span></div>
                <div className="menu-card-body">
                  {[['Chicken Biryani','₹280'],['Paneer Tikka','₹240'],['Dal Makhani','₹180'],['Gulab Jamun','₹80']].map(([n,p])=>(
                    <div key={n} className="menu-row"><span className="menu-row-name">{n}</span><span className="menu-row-price">{p}</span></div>
                  ))}
                </div>
                <div className="menu-card-foot"><div className="menu-foot-dot no-transition"/><span className="menu-foot-text">No photos · No 3D · No engagement</span></div>
              </div>
            </div>
            <p className="s-sub">Plain text. No visuals. Customers have no idea what they're ordering.</p>
          </div>

          {/* ── Ch2: Trigger ── */}
          <div className={`mob-ch${mobileCh===2?' active':mobileCh>2?' before':' after'}`}>
            <div className="s-eye">The Trigger</div>
            <h2 className="s-h" style={{textAlign:'center',marginBottom:0}}>One scan.<em>No app needed.</em></h2>
            <div className="s-vis">
              <div className="qr-wrap no-transition" style={{margin:'0 auto'}}>
                <div className="qr-c tl"/><div className="qr-c tr"/>
                <div className="qr-c bl"/><div className="qr-c br"/>
                <div className="qr-inner">
                  <svg width="138" height="138" viewBox="0 0 147 147" style={{display:'block',position:'relative',zIndex:1}}>
                    <rect x="0" y="0" width="49" height="49" rx="4" fill="#1A1208"/>
                    <rect x="7" y="7" width="35" height="35" rx="2" fill="#FFF8EE"/>
                    <rect x="14" y="14" width="21" height="21" rx="1" fill="#1A1208"/>
                    <rect x="98" y="0" width="49" height="49" rx="4" fill="#1A1208"/>
                    <rect x="105" y="7" width="35" height="35" rx="2" fill="#FFF8EE"/>
                    <rect x="112" y="14" width="21" height="21" rx="1" fill="#1A1208"/>
                    <rect x="0" y="98" width="49" height="49" rx="4" fill="#1A1208"/>
                    <rect x="7" y="105" width="35" height="35" rx="2" fill="#FFF8EE"/>
                    <rect x="14" y="112" width="21" height="21" rx="1" fill="#1A1208"/>
                    {[8,10,12].map(col=><rect key={`th${col}`} x={col*7} y={42} width="6" height="6" fill="#1A1208"/>)}
                    {[8,10,12].map(r=><rect key={`tv${r}`} x={42} y={r*7} width="6" height="6" fill="#1A1208"/>)}
                    {(()=>{const M=7,mods=[];for(let r=0;r<21;r++)for(let col=0;col<21;col++){if(r<=7&&col<=7)continue;if(r<=7&&col>=13)continue;if(r>=13&&col<=7)continue;if(r===6&&col>=8&&col<=12)continue;if(col===6&&r>=8&&r<=12)continue;if((col*7+r*13+col*r*3)%10<5)mods.push(<rect key={`${r}-${col}`} x={col*M} y={r*M} width={M-1} height={M-1} rx="0.5" fill="#1A1208" opacity="0.8"/>);}return mods;})()}
                  </svg>
                  <div className="qr-scan no-transition"/>
                </div>
                <div className="qr-label">Point any camera to scan</div>
              </div>
            </div>
            <p className="s-sub">Open your phone camera, point at the table. No downloads, no accounts.</p>
          </div>

          {/* ── Ch3: Experience ── */}
          <div className={`mob-ch${mobileCh===3?' active':mobileCh>3?' before':' after'}`}>
            <div className="s-eye">The Experience</div>
            <h2 className="s-h" style={{textAlign:'center',marginBottom:0}}>Food appears<em>in 3D.</em></h2>
            <div className="s-vis">
              <div className="ar-img-wrap no-transition">
                <div className="ar-img-c tl"/><div className="ar-img-c tr"/>
                <div className="ar-img-c bl"/><div className="ar-img-c br"/>
                <div className="ar-img-badge no-transition"><div className="ar-img-badge-dot no-transition"/>AR LIVE</div>
                <img src="/ar-experience.png" alt="AR food visualization" className="ar-img no-transition"/>
                <div className="ar-img-glow no-transition"/>
              </div>
            </div>
            <p className="s-sub">Photorealistic 3D models appear life-size on the customer's table.</p>
          </div>

          {/* ── Ch4: Intelligence ── */}
          <div className={`mob-ch${mobileCh===4?' active':mobileCh>4?' before':' after'}`}>
            <div className="s-eye">The Intelligence</div>
            <h2 className="s-h" style={{textAlign:'center',marginBottom:0}}>AI suggests<em>what&apos;s next.</em></h2>
            <div className="s-vis">
              <div style={{display:'flex',flexDirection:'column',gap:0}}>
                <div className="ai-badge no-transition"><div className="ai-badge-dot no-transition"/>Claude AI &nbsp;&middot;&nbsp; Personalised upsells</div>
                <div className="ai-stack no-transition">
                  {[{e:'🥤',n:'Mango Lassi',h:'Pairs perfectly with biryani · ₹120'},{e:'🫓',n:'Garlic Naan',h:'Most popular add-on · ₹60'},{e:'🍮',n:'Gulab Jamun',h:'Completes the meal · ₹80'}].map((item,i)=>(
                    <div key={i} className="ai-card">
                      <span className="ai-card-icon">{item.e}</span>
                      <div className="ai-card-info"><div className="ai-card-name">{item.n}</div><div className="ai-card-hint">{item.h}</div></div>
                      <div className="ai-add">+</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <p className="s-sub">Smart upsells shown at the right moment. No staff training required.</p>
          </div>

          {/* ── Ch5: Result ── */}
          <div className={`mob-ch${mobileCh===5?' active':mobileCh>5?' before':' after'}`}>
            <div className="s-eye">The Result</div>
            <h2 className="s-h" style={{textAlign:'center',marginBottom:0}}>Orders<em>up 28%.</em></h2>
            <div className="s-vis">
              <div className="stat-card no-transition">
                <div className="stat-big">+{mobileCount}%</div>
                <div className="stat-desc">Average order value increase</div>
                <div className="stat-chart">{[14,20,17,28,22,35,27,44,34,56,42,68].map((h,i)=>(<div key={i} className="stat-bar" style={{height:`${h}px`,background:i>=8?'linear-gradient(0deg,#F79B3D,#E05A3A)':'rgba(247,155,61,0.2)'}}/>))}</div>
                <div className="stat-two">
                  <div className="stat-pill"><span className="stat-pill-num">500+</span><span className="stat-pill-lbl">Restaurants</span></div>
                  <div style={{width:1,background:'rgba(255,245,220,0.08)'}}/>
                  <div className="stat-pill"><span className="stat-pill-num">90 days</span><span className="stat-pill-lbl">Avg. to see results</span></div>
                </div>
              </div>
            </div>
            <div style={{display:'flex',gap:10,flexWrap:'wrap',justifyContent:'center',marginTop:4}}>
              <Link href="/signup?plan=growth"><button className="btn-amber" style={{fontSize:14,padding:'12px 22px'}}>Start free trial →</button></Link>
            </div>
          </div>

          {/* Progress dots */}
          <div className="s-dots">
            {[0,1,2,3,4,5].map(i=>(<div key={i} className={`s-dot${mobileCh===i?' on':''}`}/>))}
          </div>

          {/* Tap nav */}
          {mobileCh > 0 && (
            <div className="mob-tap-prev" onClick={()=>setMobileCh(p=>Math.max(0,p-1))}>
              <div className="mob-tap-btn">‹</div>
            </div>
          )}
          {mobileCh < 5 && (
            <div className="mob-tap-next" onClick={()=>{ const n=mobileCh+1; if(n===5&&!mobileDoneRef.current){mobileDoneRef.current=true;animateMobileCount();} setMobileCh(n); }}>
              <div className="mob-tap-btn">›</div>
            </div>
          )}
          {mobileCh === 0 && <div className="mob-swipe-hint">Swipe or tap › to explore</div>}
        </div>
        {/* ══ END MOBILE STORY ══ */}


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
        <div className="stats-band-outer" style={{background:'var(--stats-bg)', borderTop:'1px solid var(--stats-bd)', borderBottom:'1px solid var(--stats-bd)', padding:'64px 56px'}}>
          <div ref={countersRef} className="stats-inner-grid" style={{maxWidth:1400, margin:'0 auto', display:'grid', gridTemplateColumns:'repeat(4,1fr)'}}>
            {[
              {to:28,  suffix:'%',    label:'Increase in avg order value', pre:'↑ '},
              {to:500, suffix:'+',    label:'Restaurants on the platform',  pre:''},
              {to:5,   suffix:' min', label:'Average setup time',           pre:''},
              {to:4.8, suffix:'★',   label:'Average customer rating',      pre:''},
            ].map((s,i)=>(
              <div key={i} className="ar-reveal" ref={addReveal} style={{padding:'0 40px', position:'relative', transitionDelay:`${i*0.08}s`}}>
                {i>0 && <div className="stat-divider" style={{position:'absolute', left:0, top:'10%', height:'80%', width:1, background:'var(--stats-div)'}}/>}
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

              <div ref={addReveal} className="ar-reveal d2 how-dash-col" style={{display:'flex', justifyContent:'center'}}>
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
                <Link href="/signup?plan=growth" style={{flexShrink:0, padding:'12px 26px', borderRadius:12, border:'1px solid rgba(247,155,61,0.35)', background:'rgba(247,155,61,0.08)', color:'#F79B3D', fontFamily:'Poppins,sans-serif', fontWeight:700, fontSize:14, textDecoration:'none', whiteSpace:'nowrap'}}>
                  Get your QR →
                </Link>
              </div>
            </div>
          </div>
        </section>

        {/* ══ DEMO STRIP ══ */}
        <div className="demo-strip" style={{background:'var(--demo-bg)', padding:'28px 56px', borderTop:'1px solid var(--demo-bd)'}}>
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
                    <Link href={`/signup?plan=${p.name.toLowerCase()}`}>
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
        <section className="cta-section" style={{background:'#0C0A08', padding:'96px 56px', position:'relative', overflow:'hidden', borderTop:'1px solid rgba(255,245,220,0.06)'}}>
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
                <Link href="/signup?plan=growth"><button className="btn-amber" style={{fontSize:16, padding:'16px 36px'}}>Start free trial →</button></Link>
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