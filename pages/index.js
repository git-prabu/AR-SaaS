import Head from 'next/head';
import Link from 'next/link';
import { useEffect, useRef } from 'react';

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
  '🍛 Biryani House', '🌶️ Spice Garden', '🍢 The Curry Co.',
  '🍲 Masala Junction', '👑 Royal Kitchen', '🚌 Dhaba Express',
  '🌿 Green Leaf Bistro', '🔥 Tandoor Palace', '⭐ Star Dining',
  '🍱 Thali World', '🥘 Curry Republic', '🫕 Pot & Pan',
];

export default function HomePage() {
  const heroRef     = useRef(null);
  const revealRefs  = useRef([]);
  const countersRef = useRef(null);
  const countsDone  = useRef(false);

  // Scroll reveal
  useEffect(() => {
    const els = revealRefs.current.filter(Boolean);
    const io = new IntersectionObserver(
      entries => entries.forEach(e => { if (e.isIntersecting) { e.target.classList.add('ar-revealed'); io.unobserve(e.target); } }),
      { threshold: 0.12 }
    );
    els.forEach(el => io.observe(el));
    return () => io.disconnect();
  }, []);

  // Animated counters
  useEffect(() => {
    const el = countersRef.current;
    if (!el) return;
    const io = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting && !countsDone.current) {
        countsDone.current = true;
        el.querySelectorAll('[data-to]').forEach(node => {
          const to = +node.dataset.to, suffix = node.dataset.suffix || '';
          let start; const dur = 1400;
          const tick = (ts) => {
            if (!start) start = ts;
            const p = Math.min((ts - start) / dur, 1);
            const eased = 1 - Math.pow(1 - p, 4);
            node.textContent = Math.round(to * eased) + suffix;
            if (p < 1) requestAnimationFrame(tick);
          };
          requestAnimationFrame(tick);
        });
      }
    }, { threshold: 0.5 });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const addReveal = (el) => { if (el && !revealRefs.current.includes(el)) revealRefs.current.push(el); };

  return (
    <>
      <Head>
        <title>Advert Radical — AR Menus for Restaurants</title>
        <meta name="description" content="Give your restaurant an AR-powered menu. Customers scan, see food in 3D, and order more."/>
        <link href="https://fonts.googleapis.com/css2?family=Poppins:wght@300;400;500;600;700;800;900&family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet"/>
      </Head>

      <div style={{ background:'#FAF7F2', fontFamily:'Inter,sans-serif', color:'#1A1208', overflowX:'hidden', minHeight:'100vh' }}>
        <style>{`
          :root {
            --dark:   #0C0A08;
            --dark2:  #141008;
            --cream:  #FAF7F2;
            --amber:  #F79B3D;
            --coral:  #E05A3A;
            --border-dark: rgba(255,245,220,0.1);
            --border-light: rgba(26,18,8,0.08);
            --text-dark-muted: rgba(255,245,220,0.5);
          }
          *{box-sizing:border-box;margin:0;padding:0} a{text-decoration:none; color:inherit;}

          /* ── Reveal ── */
          .ar-reveal { opacity:0; transform:translateY(30px); transition:opacity 0.7s cubic-bezier(0.16,1,0.3,1), transform 0.7s cubic-bezier(0.16,1,0.3,1); }
          .ar-reveal.ar-revealed { opacity:1; transform:none; }
          .ar-reveal.d1 { transition-delay:0.1s; }
          .ar-reveal.d2 { transition-delay:0.2s; }
          .ar-reveal.d3 { transition-delay:0.3s; }
          .ar-reveal.d4 { transition-delay:0.4s; }
          .ar-reveal.d5 { transition-delay:0.5s; }

          /* ── Keyframes ── */
          @keyframes fadeUp { from{opacity:0;transform:translateY(32px)} to{opacity:1;transform:none} }
          @keyframes blink  { 0%,100%{opacity:1} 50%{opacity:0.2} }
          @keyframes float  { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-14px)} }
          @keyframes floatB { 0%,100%{transform:translateY(0) rotate(-1deg)} 50%{transform:translateY(-9px) rotate(1deg)} }
          @keyframes shimmerBtn { 0%{background-position:200% center} 100%{background-position:-200% center} }
          @keyframes marquee { 0%{transform:translateX(0)} 100%{transform:translateX(-50%)} }
          @keyframes pulse  { 0%,100%{box-shadow:0 0 0 0 rgba(247,155,61,0.4)} 50%{box-shadow:0 0 0 8px rgba(247,155,61,0)} }
          @keyframes glow   { 0%,100%{opacity:0.6} 50%{opacity:1} }
          @keyframes heroFade { from{opacity:0;transform:translateY(40px)} to{opacity:1;transform:none} }

          /* ── Nav ── */
          .nav {
            position:fixed; top:0; left:0; right:0; z-index:100;
            padding:0 40px; height:68px;
            display:flex; align-items:center; justify-content:space-between;
            background:rgba(12,10,8,0.85); backdrop-filter:blur(24px); -webkit-backdrop-filter:blur(24px);
            border-bottom:1px solid rgba(255,245,220,0.07);
          }
          .nav-logo { font-family:Poppins,sans-serif; font-weight:800; font-size:17px; color:#FFF5E8; letter-spacing:-0.01em; }
          .nav-links { display:flex; align-items:center; gap:2px; }
          .nav-link { font-size:14px; color:rgba(255,245,220,0.55); font-weight:500; padding:7px 16px; border-radius:8px; transition:all 0.15s; }
          .nav-link:hover { color:#FFF5E8; background:rgba(255,255,255,0.06); }
          .nav-cta {
            padding:9px 22px; background:var(--amber); color:#1A1208;
            border-radius:10px; font-size:13px; font-weight:700; font-family:Poppins,sans-serif;
            box-shadow:0 4px 16px rgba(247,155,61,0.35); transition:all 0.2s;
          }
          .nav-cta:hover { background:#F4A730; transform:translateY(-1px); box-shadow:0 8px 24px rgba(247,155,61,0.45); }

          /* ── Hero ── */
          .hero-section {
            background:var(--dark2);
            padding:160px 56px 100px;
            position:relative; overflow:hidden; min-height:100vh;
            display:flex; align-items:center;
          }
          .hero-content { max-width:1400px; margin:0 auto; width:100%; display:grid; grid-template-columns:1fr 1fr; gap:56px; align-items:center; }
          .hero-badge {
            display:inline-flex; align-items:center; gap:8px;
            padding:6px 14px 6px 10px; border-radius:30px;
            background:rgba(247,155,61,0.12); border:1px solid rgba(247,155,61,0.25);
            font-size:12px; font-weight:600; color:rgba(255,200,120,0.9);
            letter-spacing:0.02em; margin-bottom:28px;
            animation:heroFade 0.6s ease both;
          }
          .hero-h1 {
            font-family:Poppins,sans-serif; font-weight:900;
            font-size:clamp(40px,4.8vw,68px);
            line-height:1.0; letter-spacing:-0.03em;
            color:#FFF5E8; margin-bottom:24px;
            animation:heroFade 0.7s ease 0.1s both;
          }
          .hero-sub {
            font-size:17px; color:rgba(255,245,220,0.52); line-height:1.85;
            max-width:440px; margin-bottom:40px;
            animation:heroFade 0.7s ease 0.2s both;
          }
          .hero-actions { display:flex; gap:12px; align-items:center; flex-wrap:wrap; animation:heroFade 0.7s ease 0.3s both; }

          /* ── Buttons ── */
          .btn-amber {
            display:inline-flex; align-items:center; gap:8px;
            padding:14px 28px; border-radius:12px; border:none;
            background:linear-gradient(90deg,#E05A3A,#F79B3D,#E05A3A);
            background-size:200% auto;
            color:#fff; font-family:Poppins,sans-serif; font-weight:700; font-size:15px;
            cursor:pointer; animation:shimmerBtn 2.5s linear infinite;
            box-shadow:0 8px 24px rgba(224,90,58,0.4);
            transition:transform 0.2s, box-shadow 0.2s;
          }
          .btn-amber:hover { transform:translateY(-2px); box-shadow:0 14px 36px rgba(224,90,58,0.52); }
          .btn-ghost {
            display:inline-flex; align-items:center; gap:8px;
            padding:14px 24px; border-radius:12px;
            background:rgba(255,245,220,0.07); border:1px solid rgba(255,245,220,0.15);
            color:rgba(255,245,220,0.8); font-family:Poppins,sans-serif; font-weight:600; font-size:15px;
            cursor:pointer; transition:all 0.2s;
          }
          .btn-ghost:hover { background:rgba(255,245,220,0.12); border-color:rgba(255,245,220,0.25); color:#FFF5E8; }
          .btn-outline-light {
            display:inline-flex; align-items:center; gap:8px;
            padding:13px 26px; border-radius:12px;
            background:#fff; border:1.5px solid rgba(26,18,8,0.14);
            color:#1A1208; font-family:Poppins,sans-serif; font-weight:600; font-size:15px;
            cursor:pointer; transition:all 0.2s;
          }
          .btn-outline-light:hover { border-color:rgba(26,18,8,0.28); background:#F7F4EF; }

          /* ── Marquee ── */
          .marquee-wrap { overflow:hidden; position:relative; }
          .marquee-track { display:flex; width:max-content; animation:marquee 30s linear infinite; }
          .marquee-track:hover { animation-play-state:paused; }
          .marquee-item {
            display:inline-flex; align-items:center; gap:8px;
            padding:8px 18px; margin:0 6px;
            background:rgba(255,255,255,0.6); border:1px solid rgba(26,18,8,0.07);
            border-radius:30px; font-size:13px; font-weight:600; color:rgba(26,18,8,0.55);
            white-space:nowrap; backdrop-filter:blur(8px);
          }

          /* ── Stats band ── */
          .stats-band {
            background:var(--dark); padding:64px 56px;
            border-top:1px solid rgba(255,245,220,0.06);
            border-bottom:1px solid rgba(255,245,220,0.06);
          }
          .stats-grid { max-width:1400px; margin:0 auto; display:grid; grid-template-columns:repeat(4,1fr); gap:0; }
          .stat-item { padding:0 40px; position:relative; }
          .stat-item + .stat-item::before { content:''; position:absolute; left:0; top:10%; height:80%; width:1px; background:rgba(255,245,220,0.1); }
          .stat-num { font-family:Poppins,sans-serif; font-weight:900; font-size:clamp(36px,3.5vw,52px); color:#FFF5E8; letter-spacing:-0.03em; line-height:1; margin-bottom:10px; }
          .stat-label { font-size:14px; color:rgba(255,245,220,0.45); font-weight:500; line-height:1.5; }

          /* ── Section utils ── */
          .section-inner { max-width:1400px; margin:0 auto; padding:0 56px; }
          .section-tag {
            display:inline-block; font-size:11px; font-weight:700; letter-spacing:0.1em;
            text-transform:uppercase; color:var(--coral); margin-bottom:14px;
          }
          .section-h2 { font-family:Poppins,sans-serif; font-weight:800; font-size:clamp(28px,3.2vw,44px); color:#1A1208; line-height:1.1; letter-spacing:-0.02em; }
          .section-h2-dark { font-family:Poppins,sans-serif; font-weight:800; font-size:clamp(28px,3.2vw,44px); color:#FFF5E8; line-height:1.1; letter-spacing:-0.02em; }

          /* ── Bento ── */
          .bento { display:grid; grid-template-columns:1.55fr 1fr 1fr; grid-template-rows:auto auto; gap:14px; }
          .bento-tall { grid-row:span 2; }
          .bento-card {
            background:#fff; border:1.5px solid rgba(26,18,8,0.07); border-radius:22px;
            padding:30px; overflow:hidden; position:relative;
            transition:all 0.28s cubic-bezier(0.34,1.56,0.64,1);
            box-shadow:0 1px 12px rgba(26,18,8,0.05);
          }
          .bento-card:hover { transform:translateY(-5px); box-shadow:0 18px 44px rgba(26,18,8,0.12); border-color:rgba(247,155,61,0.28); }
          .bento-card.dark { background:var(--dark); border-color:rgba(255,245,220,0.08); }
          .bento-card.dark:hover { border-color:rgba(247,155,61,0.3); box-shadow:0 20px 48px rgba(0,0,0,0.4); }
          .bento-icon { width:50px; height:50px; border-radius:14px; display:flex; align-items:center; justify-content:center; font-size:22px; margin-bottom:20px; }

          /* ── How it works ── */
          .how-grid { display:grid; grid-template-columns:1fr 1fr; gap:80px; align-items:center; }
          .step-line { position:relative; }
          .step-line::after { content:''; position:absolute; left:23px; top:52px; bottom:8px; width:2px; background:linear-gradient(180deg,rgba(224,90,58,0.4),transparent); }
          .step-row { display:flex; gap:20px; align-items:flex-start; }
          .step-num-box {
            width:46px; height:46px; border-radius:14px; flex-shrink:0;
            background:linear-gradient(135deg,var(--coral),var(--amber));
            display:flex; align-items:center; justify-content:center;
            font-family:Poppins,sans-serif; font-weight:800; font-size:13px; color:#fff;
            box-shadow:0 6px 18px rgba(224,90,58,0.35); position:relative; z-index:1;
          }

          /* ── Pricing ── */
          .plan-grid { display:grid; grid-template-columns:repeat(3,1fr); gap:20px; max-width:1060px; margin:0 auto; }
          .plan-card { border-radius:24px; padding:36px 32px; position:relative; overflow:visible; transition:all 0.25s; }
          .plan-card.light { background:#fff; border:1.5px solid rgba(26,18,8,0.08); box-shadow:0 2px 16px rgba(26,18,8,0.06); }
          .plan-card.light:hover { transform:translateY(-4px); box-shadow:0 16px 40px rgba(26,18,8,0.1); }
          .plan-card.dark-card { background:var(--dark); border:1.5px solid rgba(247,155,61,0.3); box-shadow:0 8px 40px rgba(0,0,0,0.35), 0 0 0 1px rgba(247,155,61,0.1); }
          .plan-card.dark-card:hover { transform:translateY(-6px); box-shadow:0 20px 56px rgba(0,0,0,0.45), 0 0 0 1px rgba(247,155,61,0.2); }
          .check-light { width:20px; height:20px; border-radius:6px; background:rgba(26,18,8,0.07); display:flex; align-items:center; justify-content:center; font-size:10px; color:rgba(26,18,8,0.5); font-weight:800; flex-shrink:0; }
          .check-dark  { width:20px; height:20px; border-radius:6px; background:rgba(247,155,61,0.18); display:flex; align-items:center; justify-content:center; font-size:10px; color:#F79B3D; font-weight:800; flex-shrink:0; }

          /* ── Layouts ── */
          @media(max-width:1100px) {
            .bento { grid-template-columns:1fr 1fr; }
            .bento-tall { grid-row:span 1; }
            .plan-grid { grid-template-columns:1fr; max-width:420px; }
            .stats-grid { grid-template-columns:1fr 1fr; gap:32px; }
            .stat-item + .stat-item::before { display:none; }
            .stat-item { padding:0 24px; }
          }
          @media(max-width:820px) {
            .hero-content { grid-template-columns:1fr!important; }
            .hero-section  { padding:120px 24px 80px; }
            .how-grid { grid-template-columns:1fr!important; gap:40px; }
            .nav { padding:0 20px; }
            .nav-links .nav-link { display:none; }
            .section-inner { padding:0 24px; }
            .stats-band { padding:48px 24px; }
            .bento { grid-template-columns:1fr; }
          }
        `}</style>

        {/* ── NAV ── */}
        <nav className="nav">
          <span className="nav-logo">
            Advert <span style={{background:'linear-gradient(135deg,#E05A3A,#F79B3D)', WebkitBackgroundClip:'text', WebkitTextFillColor:'transparent'}}>Radical</span>
          </span>
          <div className="nav-links">
            <a href="#how"      className="nav-link">How it works</a>
            <a href="#features" className="nav-link">Features</a>
            <a href="#plans"    className="nav-link">Pricing</a>
            <Link href="/admin/login" className="nav-link">Sign in</Link>
          </div>
          <Link href="/admin/login" className="nav-cta">Get started →</Link>
        </nav>

        {/* ══ HERO ══ */}
        <section className="hero-section">
          {/* Background radial glows */}
          <div style={{position:'absolute', top:'-10%', right:'-5%', width:700, height:700, borderRadius:'50%', background:'radial-gradient(circle, rgba(247,155,61,0.12) 0%, transparent 65%)', pointerEvents:'none'}}/>
          <div style={{position:'absolute', bottom:'-15%', left:'-8%', width:600, height:600, borderRadius:'50%', background:'radial-gradient(circle, rgba(224,90,58,0.1) 0%, transparent 65%)', pointerEvents:'none'}}/>
          {/* Subtle grid */}
          <div style={{position:'absolute', inset:0, backgroundImage:'linear-gradient(rgba(255,245,220,0.025) 1px, transparent 1px), linear-gradient(90deg, rgba(255,245,220,0.025) 1px, transparent 1px)', backgroundSize:'64px 64px', pointerEvents:'none'}}/>

          <div style={{maxWidth:1400, margin:'0 auto', width:'100%', position:'relative', zIndex:1}}>
            <div className="hero-content">

              {/* LEFT */}
              <div>
                <div className="hero-badge">
                  <span style={{width:8, height:8, borderRadius:'50%', background:'#F79B3D', animation:'pulse 2s infinite', flexShrink:0}}/>
                  AR + AI Revenue Platform
                </div>

                <h1 className="hero-h1">
                  The AR Menu<br/>
                  <span style={{background:'linear-gradient(90deg,#F79B3D,#E05A3A)', WebkitBackgroundClip:'text', WebkitTextFillColor:'transparent'}}>
                    That Sells
                  </span><br/>
                  More Food.
                </h1>

                <p className="hero-sub">
                  Customers scan your QR, watch dishes appear life-size in 3D on their table, get AI-powered suggestions — and order more. No app. No friction.
                </p>

                <div className="hero-actions">
                  <Link href="/admin/login">
                    <button className="btn-amber">Start free trial</button>
                  </Link>
                  <a href="https://ar-saa-s-kbzn.vercel.app/restaurant/spot" target="_blank" rel="noreferrer">
                    <button className="btn-ghost">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polygon points="5 3 19 12 5 21 5 3"/></svg>
                      See live demo
                    </button>
                  </a>
                </div>

                {/* Social proof avatars */}
                <div style={{display:'flex', alignItems:'center', gap:14, marginTop:36, paddingTop:28, borderTop:'1px solid rgba(255,245,220,0.08)'}}>
                  <div style={{display:'flex'}}>
                    {['🧑‍🍳','👨‍🍳','👩‍🍳','🧑‍🍳'].map((e,i) => (
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
              </div>

              {/* RIGHT — Phone Mockup */}
              <div style={{display:'flex', justifyContent:'center', alignItems:'center', position:'relative'}}>
                {/* Ambient glow behind phone */}
                <div style={{position:'absolute', inset:0, background:'radial-gradient(ellipse at 50% 50%, rgba(247,155,61,0.18) 0%, transparent 65%)', filter:'blur(20px)', borderRadius:'50%', pointerEvents:'none'}}/>

                <div className="float" style={{position:'relative', zIndex:2}}>
                  {/* Phone shell */}
                  <div style={{width:260, height:520, borderRadius:44, background:'#0C0A08', boxShadow:'0 40px 100px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.07), inset 0 0 0 2px rgba(255,255,255,0.04)', position:'relative', overflow:'hidden'}}>
                    {/* Dynamic Island */}
                    <div style={{position:'absolute', top:12, left:'50%', transform:'translateX(-50%)', width:96, height:28, background:'#0C0A08', borderRadius:14, zIndex:20, boxShadow:'0 0 0 1px rgba(255,255,255,0.08)'}}/>
                    {/* Screen */}
                    <div style={{position:'absolute', top:0, left:0, right:0, bottom:0, background:'linear-gradient(180deg,#0E1828,#0A1220)', borderRadius:44, overflow:'hidden'}}>
                      <div style={{padding:'52px 16px 20px', height:'100%', display:'flex', flexDirection:'column'}}>

                        {/* Header */}
                        <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16}}>
                          <div>
                            <div style={{fontSize:9, fontWeight:700, color:'rgba(255,245,220,0.35)', letterSpacing:'0.08em', marginBottom:3}}>THE SPOT RESTAURANT</div>
                            <div style={{fontSize:17, fontWeight:800, color:'#FFF5E8', fontFamily:'Poppins,sans-serif', letterSpacing:'-0.02em'}}>AR Menu</div>
                          </div>
                          <div style={{width:34, height:34, borderRadius:12, background:'rgba(247,155,61,0.15)', border:'1px solid rgba(247,155,61,0.3)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:16}}>🥽</div>
                        </div>

                        {/* Category pills */}
                        <div style={{display:'flex', gap:6, marginBottom:14}}>
                          {['All','Biryani','Starters','Desserts'].map((c,i) => (
                            <div key={c} style={{padding:'5px 11px', borderRadius:20, background:i===0?'#F79B3D':'rgba(255,255,255,0.07)', fontSize:9, fontWeight:700, color:i===0?'#1A1208':'rgba(255,245,220,0.45)', letterSpacing:'0.02em', whiteSpace:'nowrap', flexShrink:0}}>
                              {c}
                            </div>
                          ))}
                        </div>

                        {/* Dish cards */}
                        <div style={{display:'flex', flexDirection:'column', gap:8, flex:1}}>
                          {[
                            {n:'Chicken Biryani', p:'₹320', e:'🍛', r:'4.9', tag:'AR', bg:'rgba(247,155,61,0.08)', glow:'rgba(247,155,61,0.2)'},
                            {n:'Paneer Tikka',    p:'₹240', e:'🍢', r:'4.7', tag:'Popular', bg:'rgba(224,90,58,0.08)', glow:'rgba(224,90,58,0.15)'},
                            {n:'Dal Makhani',     p:'₹180', e:'🍲', r:'4.8', tag:'AR', bg:'rgba(100,180,120,0.08)', glow:'rgba(100,180,120,0.12)'},
                          ].map(d => (
                            <div key={d.n} style={{display:'flex', alignItems:'center', gap:10, padding:'10px 12px', borderRadius:16, background:d.bg, border:`1px solid ${d.glow}`, boxShadow:`0 4px 16px ${d.glow}`}}>
                              <div style={{width:42, height:42, borderRadius:12, background:'rgba(255,255,255,0.07)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:20, flexShrink:0}}>{d.e}</div>
                              <div style={{flex:1, minWidth:0}}>
                                <div style={{fontSize:10, fontWeight:700, color:'rgba(255,245,232,0.9)', marginBottom:3, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis'}}>{d.n}</div>
                                <div style={{display:'flex', alignItems:'center', gap:6}}>
                                  <span style={{fontSize:8, fontWeight:700, padding:'2px 6px', borderRadius:6, background:'rgba(247,155,61,0.2)', color:'#F79B3D'}}>{d.tag}</span>
                                  <span style={{fontSize:8, color:'rgba(255,245,220,0.4)'}}>⭐ {d.r}</span>
                                </div>
                              </div>
                              <div style={{fontSize:11, fontWeight:800, color:'#F79B3D', fontFamily:'Poppins,sans-serif', flexShrink:0}}>{d.p}</div>
                            </div>
                          ))}
                        </div>

                        {/* AR bar */}
                        <div style={{marginTop:12, padding:'8px 12px', borderRadius:12, background:'rgba(100,210,255,0.06)', border:'1px solid rgba(100,210,255,0.14)', display:'flex', alignItems:'center', gap:7}}>
                          <div style={{width:7, height:7, borderRadius:'50%', background:'#64D2FF', animation:'blink 1.5s infinite', flexShrink:0}}/>
                          <span style={{fontSize:8.5, fontWeight:700, color:'rgba(100,210,255,0.85)', letterSpacing:'0.04em'}}>AR LIVE — TAP ANY DISH TO VIEW IN 3D</span>
                        </div>
                      </div>
                    </div>
                    {/* Home bar */}
                    <div style={{position:'absolute', bottom:10, left:'50%', transform:'translateX(-50%)', width:80, height:3, background:'rgba(255,255,255,0.18)', borderRadius:2}}/>
                  </div>

                  {/* Floating cards */}
                  <div className="floatB" style={{position:'absolute', top:'6%', right:'-22%', background:'rgba(255,255,255,0.95)', borderRadius:18, padding:'12px 16px', boxShadow:'0 12px 36px rgba(26,18,8,0.16)', border:'1px solid rgba(26,18,8,0.06)', backdropFilter:'blur(12px)', minWidth:148, zIndex:5}}>
                    <div style={{display:'flex', alignItems:'center', gap:10}}>
                      <div style={{width:36, height:36, borderRadius:10, background:'rgba(100,210,120,0.12)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:16}}>📈</div>
                      <div>
                        <div style={{fontSize:9.5, fontWeight:600, color:'rgba(26,18,8,0.42)', marginBottom:2}}>Avg order value</div>
                        <div style={{fontSize:18, fontWeight:900, color:'#1A1208', fontFamily:'Poppins,sans-serif', letterSpacing:'-0.02em'}}>↑ 28%</div>
                      </div>
                    </div>
                  </div>

                  <div style={{position:'absolute', bottom:'12%', left:'-20%', background:'rgba(255,255,255,0.95)', borderRadius:18, padding:'12px 16px', boxShadow:'0 12px 36px rgba(26,18,8,0.16)', border:'1px solid rgba(26,18,8,0.06)', backdropFilter:'blur(12px)', minWidth:156, zIndex:5, animation:'floatB 7s ease-in-out 1.2s infinite'}}>
                    <div style={{display:'flex', alignItems:'center', gap:10}}>
                      <div style={{width:36, height:36, borderRadius:10, background:'rgba(247,155,61,0.1)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:16}}>👁️</div>
                      <div>
                        <div style={{fontSize:9.5, fontWeight:600, color:'rgba(26,18,8,0.42)', marginBottom:2}}>AR views today</div>
                        <div style={{fontSize:18, fontWeight:900, color:'#1A1208', fontFamily:'Poppins,sans-serif', letterSpacing:'-0.02em'}}>2,841</div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ══ MARQUEE ══ */}
        <div style={{background:'rgba(255,255,255,0.5)', borderTop:'1px solid rgba(26,18,8,0.06)', borderBottom:'1px solid rgba(26,18,8,0.06)', padding:'14px 0', backdropFilter:'blur(12px)'}}>
          <div className="marquee-wrap">
            <div className="marquee-track">
              {[...MARQUEE_ITEMS, ...MARQUEE_ITEMS].map((item, i) => (
                <span key={i} className="marquee-item">{item}</span>
              ))}
            </div>
          </div>
        </div>

        {/* ══ STATS BAND ══ */}
        <div className="stats-band">
          <div ref={countersRef} className="stats-grid">
            {[
              { num:28,   suffix:'%',  label:'Increase in avg order value',   pre:'↑' },
              { num:500,  suffix:'+',  label:'Restaurants on the platform',   pre:'' },
              { num:5,    suffix:' min', label:'Average setup time',           pre:'' },
              { num:4.8,  suffix:'★',  label:'Average customer rating',       pre:'' },
            ].map((s, i) => (
              <div key={i} className="stat-item ar-reveal" ref={addReveal} style={{transitionDelay:`${i*0.08}s`}}>
                <div className="stat-num">
                  {s.pre}<span data-to={s.num} data-suffix={s.suffix}>{s.num}{s.suffix}</span>
                </div>
                <div className="stat-label">{s.label}</div>
              </div>
            ))}
          </div>
        </div>

        {/* ══ HOW IT WORKS ══ */}
        <section id="how" style={{padding:'96px 0', background:' #FAF7F2', position:'relative', zIndex:1}}>
          <div className="section-inner">
            <div className="how-grid">
              <div ref={addReveal} className="ar-reveal">
                <span className="section-tag">How it works</span>
                <h2 className="section-h2" style={{marginBottom:16}}>
                  From QR scan to<br/>3D AR in seconds
                </h2>
                <p style={{fontSize:16, color:'rgba(26,18,8,0.52)', lineHeight:1.85, marginBottom:48, maxWidth:380}}>
                  No app downloads. No tech setup. Your customers simply scan and watch their food come to life on the table.
                </p>

                <div style={{display:'flex', flexDirection:'column', gap:0}}>
                  {[
                    {n:'01', title:'Upload your menu', desc:'Add dish photos, 3D models, prices, and descriptions through your admin dashboard in minutes.'},
                    {n:'02', title:'Get your QR code',  desc:'A branded QR code and custom subdomain are generated instantly — ready to place on every table.'},
                    {n:'03', title:'Customers scan & order', desc:'They point their phone, food appears life-size in 3D right on their table, AI suggests pairings, orders go up.'},
                  ].map((s, i) => (
                    <div key={s.n} className={`step-line`} style={{paddingBottom: i < 2 ? 32 : 0}}>
                      {i < 2 && <div style={{position:'absolute', left:22, top:48, height:32, width:2, background:'linear-gradient(180deg,rgba(224,90,58,0.35),transparent)'}}/>}
                      <div className="step-row">
                        <div className="step-num-box">{s.n}</div>
                        <div style={{paddingTop:4}}>
                          <div style={{fontFamily:'Poppins,sans-serif', fontWeight:700, fontSize:16, color:'#1A1208', marginBottom:6}}>{s.title}</div>
                          <div style={{fontSize:14, color:'rgba(26,18,8,0.5)', lineHeight:1.75}}>{s.desc}</div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Dashboard mockup */}
              <div ref={addReveal} className="ar-reveal d2" style={{display:'flex', justifyContent:'center'}}>
                <div style={{width:'100%', maxWidth:460, borderRadius:24, background:'#fff', boxShadow:'0 28px 72px rgba(26,18,8,0.15)', border:'1px solid rgba(26,18,8,0.06)', overflow:'hidden'}}>
                  {/* Titlebar */}
                  <div style={{background:'#1A1208', padding:'14px 20px', display:'flex', alignItems:'center', gap:8}}>
                    {['#FF5F57','#FEBC2E','#28C840'].map(c=><div key={c} style={{width:11,height:11,borderRadius:'50%',background:c}}/>)}
                    <div style={{flex:1}}/>
                    <div style={{fontSize:10, fontWeight:600, color:'rgba(255,245,220,0.35)', letterSpacing:'0.04em'}}>Advert Radical Dashboard</div>
                  </div>
                  <div style={{padding:22}}>
                    {/* Top metrics */}
                    <div style={{display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:10, marginBottom:18}}>
                      {[
                        {l:'AR Views', v:'12,450', c:'↑ 24%', bg:'rgba(224,90,58,0.08)', ac:'#C04A28'},
                        {l:'Scans',    v:'3,291',  c:'↑ 12%', bg:'rgba(143,196,168,0.12)', ac:'#1A5A38'},
                        {l:'Rating',   v:'4.8★',   c:'Top 3%', bg:'rgba(244,208,112,0.15)', ac:'#7A5A10'},
                      ].map(m=>(
                        <div key={m.l} style={{background:m.bg, borderRadius:12, padding:'12px 14px'}}>
                          <div style={{fontSize:10, color:'rgba(26,18,8,0.45)', marginBottom:4, fontWeight:600}}>{m.l}</div>
                          <div style={{fontSize:16, fontWeight:900, color:'#1A1208', fontFamily:'Poppins,sans-serif', letterSpacing:'-0.01em', marginBottom:2}}>{m.v}</div>
                          <div style={{fontSize:10, fontWeight:700, color:m.ac}}>{m.c}</div>
                        </div>
                      ))}
                    </div>
                    {/* Chart */}
                    <div style={{background:'#1A1208', borderRadius:16, padding:18}}>
                      <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:14}}>
                        <div style={{fontSize:11, fontWeight:700, color:'rgba(255,245,220,0.5)', letterSpacing:'0.05em'}}>WEEKLY AR VIEWS</div>
                        <div style={{fontSize:10, color:'rgba(247,155,61,0.7)', fontWeight:600}}>↑ 18% vs last week</div>
                      </div>
                      <div style={{display:'flex', alignItems:'flex-end', gap:7, height:80}}>
                        {[42,68,54,82,75,100,91].map((h,i)=>(
                          <div key={i} style={{flex:1, borderRadius:7, background:i===5?'linear-gradient(0deg,#F79B3D,#E05A3A)':'rgba(255,255,255,0.1)', height:`${h}%`, transition:'height 0.3s'}}/>
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
        <section id="features" style={{padding:'96px 0', background:'#F5E6D3', borderTop:'1px solid rgba(26,18,8,0.06)', borderBottom:'1px solid rgba(26,18,8,0.06)', position:'relative', zIndex:1}}>
          <div className="section-inner">
            <div ref={addReveal} className="ar-reveal" style={{marginBottom:52}}>
              <span className="section-tag">Platform features</span>
              <div style={{display:'flex', alignItems:'flex-end', justifyContent:'space-between', flexWrap:'wrap', gap:16, marginTop:0}}>
                <h2 className="section-h2">Every tool to grow revenue</h2>
                <p style={{fontSize:15, color:'rgba(26,18,8,0.5)', maxWidth:320, lineHeight:1.75, paddingBottom:4}}>
                  One platform built specifically for Indian restaurants — AR menus, AI upselling, analytics, and more.
                </p>
              </div>
            </div>

            <div ref={addReveal} className="bento ar-reveal">
              {/* Large card — AR */}
              <div className="bento-card bento-tall dark" style={{display:'flex', flexDirection:'column', justifyContent:'space-between', minHeight:320}}>
                <div>
                  <div className="bento-icon" style={{background:'rgba(247,155,61,0.15)', border:'1px solid rgba(247,155,61,0.3)'}}>🥽</div>
                  <h3 style={{fontFamily:'Poppins,sans-serif', fontWeight:800, fontSize:20, color:'#FFF5E8', marginBottom:10, letterSpacing:'-0.01em'}}>AR Visualization</h3>
                  <p style={{fontSize:14, color:'rgba(255,245,220,0.5)', lineHeight:1.8, maxWidth:320}}>
                    Dishes appear life-size in 3D right on your customers' table. Works on Android Chrome and iOS Safari — zero app download required.
                  </p>
                </div>
                {/* Decorative food emojis */}
                <div style={{marginTop:32, position:'relative', height:100}}>
                  <div style={{position:'absolute', left:'5%',  top:0,    fontSize:48, filter:'drop-shadow(0 8px 20px rgba(0,0,0,0.5))', animation:'float 5s ease-in-out infinite'}}>🍛</div>
                  <div style={{position:'absolute', left:'38%', top:'20%', fontSize:40, filter:'drop-shadow(0 6px 16px rgba(0,0,0,0.4))', animation:'float 6.5s ease-in-out 1.2s infinite'}}>🍢</div>
                  <div style={{position:'absolute', right:'8%', top:0,    fontSize:44, filter:'drop-shadow(0 8px 20px rgba(0,0,0,0.5))', animation:'float 5.8s ease-in-out 0.6s infinite'}}>🍕</div>
                  <div style={{position:'absolute', left:'22%', bottom:0,  fontSize:36, opacity:0.5, animation:'float 7s ease-in-out 2s infinite'}}>🍲</div>
                </div>
              </div>

              {/* AI Upselling */}
              <div className="bento-card" style={{background:'linear-gradient(135deg,#FFF5E8,#FEF0DC)'}}>
                <div className="bento-icon" style={{background:'rgba(224,90,58,0.1)', border:'1px solid rgba(224,90,58,0.2)'}}>🤖</div>
                <h3 style={{fontFamily:'Poppins,sans-serif', fontWeight:700, fontSize:16, color:'#1A1208', marginBottom:8}}>AI Upselling</h3>
                <p style={{fontSize:13.5, color:'rgba(26,18,8,0.54)', lineHeight:1.72}}>Claude AI suggests complementary dishes when a customer opens any item — proven to increase average order value.</p>
              </div>

              {/* Dish Ratings */}
              <div className="bento-card">
                <div className="bento-icon" style={{background:'rgba(244,208,112,0.2)', border:'1px solid rgba(244,208,112,0.4)'}}>⭐</div>
                <h3 style={{fontFamily:'Poppins,sans-serif', fontWeight:700, fontSize:16, color:'#1A1208', marginBottom:8}}>Dish Ratings</h3>
                <p style={{fontSize:13.5, color:'rgba(26,18,8,0.54)', lineHeight:1.72}}>Customers rate dishes 1–5 stars inline. Real-time feedback helps you spotlight your best performers.</p>
              </div>

              {/* Waiter Calls */}
              <div className="bento-card" style={{background:'linear-gradient(135deg,#FFF5E8,#FEF0DC)'}}>
                <div className="bento-icon" style={{background:'rgba(247,155,61,0.12)', border:'1px solid rgba(247,155,61,0.28)'}}>🔔</div>
                <h3 style={{fontFamily:'Poppins,sans-serif', fontWeight:700, fontSize:16, color:'#1A1208', marginBottom:8}}>Waiter Call System</h3>
                <p style={{fontSize:13.5, color:'rgba(26,18,8,0.54)', lineHeight:1.72}}>Customers tap to request water, bill, or help. Live push notification reaches your admin instantly.</p>
              </div>

              {/* Analytics */}
              <div className="bento-card dark">
                <div className="bento-icon" style={{background:'rgba(143,196,168,0.15)', border:'1px solid rgba(143,196,168,0.3)'}}>📊</div>
                <h3 style={{fontFamily:'Poppins,sans-serif', fontWeight:700, fontSize:16, color:'#FFF5E8', marginBottom:8}}>Menu Analytics</h3>
                <p style={{fontSize:13.5, color:'rgba(255,245,220,0.5)', lineHeight:1.72}}>See which dishes get the most views, AR launches, and ratings — know exactly what to promote and what to change.</p>
              </div>

              {/* QR + Subdomain — full width bottom row */}
              <div className="bento-card" style={{background:'#1A1208', gridColumn:'1 / -1', display:'flex', alignItems:'center', gap:36, flexWrap:'wrap'}}>
                <div className="bento-icon" style={{background:'rgba(247,155,61,0.12)', border:'1px solid rgba(247,155,61,0.28)', flexShrink:0}}>⚡</div>
                <div style={{flex:1, minWidth:220}}>
                  <h3 style={{fontFamily:'Poppins,sans-serif', fontWeight:700, fontSize:16, color:'#FFF5E8', marginBottom:8}}>Instant QR & Subdomain</h3>
                  <p style={{fontSize:13.5, color:'rgba(255,245,220,0.46)', lineHeight:1.72, maxWidth:520}}>Your branded menu URL and QR code ready in under 5 minutes. Stick QRs on every table and your AR menu is live — no technical setup needed.</p>
                </div>
                <a href="/admin/login" style={{flexShrink:0, padding:'12px 26px', borderRadius:12, border:'1px solid rgba(247,155,61,0.35)', background:'rgba(247,155,61,0.08)', color:'#F79B3D', fontFamily:'Poppins,sans-serif', fontWeight:700, fontSize:14, textDecoration:'none', whiteSpace:'nowrap', transition:'all 0.2s'}}>
                  Get your QR →
                </a>
              </div>
            </div>
          </div>
        </section>

        {/* ══ LIVE DEMO STRIP ══ */}
        <div style={{background:'#0C0A08', padding:'28px 56px', borderTop:'1px solid rgba(255,245,220,0.06)'}}>
          <div style={{maxWidth:1400, margin:'0 auto', display:'flex', alignItems:'center', justifyContent:'space-between', flexWrap:'wrap', gap:20}}>
            <div>
              <div style={{display:'flex', alignItems:'center', gap:8, marginBottom:6}}>
                <div style={{width:8, height:8, borderRadius:'50%', background:'#F79B3D', animation:'pulse 2s infinite'}}/>
                <span style={{fontSize:11, fontWeight:700, color:'rgba(247,155,61,0.65)', letterSpacing:'0.08em', textTransform:'uppercase'}}>Live demo</span>
              </div>
              <div style={{fontFamily:'Poppins,sans-serif', fontWeight:700, fontSize:18, color:'#FFF5E8'}}>See a real AR menu in action — open on your phone</div>
            </div>
            <a href="https://ar-saa-s-kbzn.vercel.app/restaurant/spot" target="_blank" rel="noreferrer">
              <button style={{padding:'13px 26px', borderRadius:12, border:'1px solid rgba(247,155,61,0.4)', background:'rgba(247,155,61,0.08)', color:'#F79B3D', fontSize:14, fontWeight:700, fontFamily:'Poppins,sans-serif', cursor:'pointer', transition:'all 0.2s', whiteSpace:'nowrap'}}
                onMouseOver={e=>{e.currentTarget.style.background='rgba(247,155,61,0.18)'; e.currentTarget.style.borderColor='rgba(247,155,61,0.6)'}}
                onMouseOut={e=>{e.currentTarget.style.background='rgba(247,155,61,0.08)'; e.currentTarget.style.borderColor='rgba(247,155,61,0.4)'}}>
                Open Live Demo →
              </button>
            </a>
          </div>
        </div>

        {/* ══ PRICING ══ */}
        <section id="plans" style={{padding:'96px 0', background:'#FAF7F2', position:'relative', zIndex:1}}>
          <div className="section-inner">
            <div style={{textAlign:'center', marginBottom:56}}>
              <div ref={addReveal} className="ar-reveal">
                <span className="section-tag">Pricing</span>
                <h2 className="section-h2" style={{marginBottom:12}}>Simple, transparent pricing</h2>
                <p style={{fontSize:15, color:'rgba(26,18,8,0.5)', lineHeight:1.75}}>Monthly plans. No hidden fees. Cancel anytime.</p>
              </div>
            </div>

            <div ref={addReveal} className="plan-grid ar-reveal">
              {plans.map((p, i) => {
                const isFeatured = !!p.tag;
                return (
                  <div key={p.name} className={`plan-card ${isFeatured ? 'dark-card' : 'light'}`} style={{display:'flex', flexDirection:'column'}}>
                    {p.tag && (
                      <div style={{position:'absolute', top:-14, left:'50%', transform:'translateX(-50%)', padding:'5px 18px', background:'linear-gradient(135deg,#E05A3A,#F79B3D)', color:'#fff', fontSize:11, fontWeight:700, borderRadius:30, whiteSpace:'nowrap', boxShadow:'0 4px 14px rgba(224,90,58,0.4)'}}>
                        ✦ {p.tag}
                      </div>
                    )}

                    {/* Accent line */}
                    <div style={{width:36, height:4, borderRadius:2, background: isFeatured ? 'linear-gradient(90deg,#F79B3D,#E05A3A)' : 'rgba(26,18,8,0.15)', marginBottom:22, boxShadow: isFeatured ? '0 2px 10px rgba(247,155,61,0.4)' : 'none'}}/>

                    <div style={{fontFamily:'Poppins,sans-serif', fontWeight:700, fontSize:17, color: isFeatured ? '#FFF5E8' : '#1A1208', marginBottom:6}}>{p.name}</div>
                    <p style={{fontSize:13, color: isFeatured ? 'rgba(255,245,220,0.45)' : 'rgba(26,18,8,0.45)', lineHeight:1.65, marginBottom:20}}>{p.desc}</p>

                    <div style={{display:'flex', alignItems:'baseline', gap:4, marginBottom:24, paddingBottom:20, borderBottom:`1px solid ${isFeatured ? 'rgba(255,245,220,0.1)' : 'rgba(26,18,8,0.07)'}`}}>
                      <span style={{fontFamily:'Poppins,sans-serif', fontWeight:900, fontSize:38, color: isFeatured ? '#FFF5E8' : '#1A1208', letterSpacing:'-0.03em', lineHeight:1}}>{p.price}</span>
                      <span style={{fontSize:13, color: isFeatured ? 'rgba(255,245,220,0.4)' : 'rgba(26,18,8,0.38)', fontWeight:500}}>/month</span>
                    </div>

                    <div style={{display:'flex', flexDirection:'column', gap:10, marginBottom:28, flex:1}}>
                      {p.features.map(f => (
                        <div key={f} style={{display:'flex', alignItems:'center', gap:10, fontSize:13, color: isFeatured ? 'rgba(255,245,220,0.7)' : 'rgba(26,18,8,0.65)'}}>
                          <div className={isFeatured ? 'check-dark' : 'check-light'}>✓</div>
                          {f}
                        </div>
                      ))}
                    </div>

                    <Link href="/admin/login">
                      <button style={{width:'100%', padding:'14px', borderRadius:12, border: isFeatured ? 'none' : '1.5px solid rgba(26,18,8,0.15)', background: isFeatured ? 'linear-gradient(135deg,#E05A3A,#F79B3D)' : '#fff', color: isFeatured ? '#fff' : '#1A1208', fontSize:14, fontWeight:700, fontFamily:'Poppins,sans-serif', cursor:'pointer', boxShadow: isFeatured ? '0 8px 24px rgba(224,90,58,0.4)' : 'none', transition:'all 0.2s'}}>
                        {p.cta}
                      </button>
                    </Link>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {/* ══ CTA ══ */}
        <section style={{background:' #0C0A08', padding:'96px 56px', position:'relative', overflow:'hidden', borderTop:'1px solid rgba(255,245,220,0.06)'}}>
          {/* Glow */}
          <div style={{position:'absolute', top:'-30%', left:'50%', transform:'translateX(-50%)', width:800, height:600, borderRadius:'50%', background:'radial-gradient(ellipse, rgba(247,155,61,0.1) 0%, transparent 60%)', pointerEvents:'none', filter:'blur(40px)'}}/>
          <div style={{maxWidth:800, margin:'0 auto', textAlign:'center', position:'relative', zIndex:1}}>
            <div ref={addReveal} className="ar-reveal">
              <div style={{display:'inline-flex', alignItems:'center', gap:7, padding:'5px 14px', borderRadius:30, background:'rgba(247,155,61,0.1)', border:'1px solid rgba(247,155,61,0.2)', fontSize:11, fontWeight:700, color:'rgba(247,155,61,0.75)', letterSpacing:'0.08em', textTransform:'uppercase', marginBottom:28}}>
                ✦ Join 500+ restaurants
              </div>
              <h2 className="section-h2-dark" style={{fontSize:'clamp(32px,4.5vw,60px)', letterSpacing:'-0.03em', marginBottom:20}}>
                Ready to bring your<br/>
                <span style={{background:'linear-gradient(90deg,#F79B3D,#E05A3A)', WebkitBackgroundClip:'text', WebkitTextFillColor:'transparent'}}>menu to life?</span>
              </h2>
              <p style={{fontSize:17, color:'rgba(255,245,220,0.48)', lineHeight:1.85, maxWidth:480, margin:'0 auto 40px', fontWeight:400}}>
                Start your free trial today. No credit card required. Your AR menu will be live in under 5 minutes.
              </p>
              <div style={{display:'flex', justifyContent:'center', gap:12, flexWrap:'wrap', marginBottom:48}}>
                <Link href="/admin/login">
                  <button className="btn-amber" style={{fontSize:16, padding:'16px 36px'}}>Start free trial →</button>
                </Link>
                <a href="mailto:hello@advertradical.com">
                  <button className="btn-ghost" style={{fontSize:16, padding:'16px 28px'}}>Talk to us</button>
                </a>
              </div>
              {/* Contact */}
              <div style={{display:'flex', justifyContent:'center', gap:32, flexWrap:'wrap'}}>
                {[
                  {icon:'✉️', label:'hello@advertradical.com', href:'mailto:hello@advertradical.com'},
                  {icon:'📞', label:'+91 98765 43210',          href:'tel:+919876543210'},
                ].map(c=>(
                  <a key={c.href} href={c.href} style={{display:'flex', alignItems:'center', gap:8, fontSize:14, color:'rgba(255,245,220,0.45)', transition:'color 0.15s', fontWeight:500}}
                    onMouseOver={e=>e.currentTarget.style.color='rgba(255,245,220,0.8)'}
                    onMouseOut={e=>e.currentTarget.style.color='rgba(255,245,220,0.45)'}>
                    <span style={{fontSize:16}}>{c.icon}</span> {c.label}
                  </a>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* ══ FOOTER ══ */}
        <footer style={{background:'#0C0A08', borderTop:'1px solid rgba(255,245,220,0.07)', padding:'24px 56px'}}>
          <div style={{maxWidth:1400, margin:'0 auto', display:'flex', alignItems:'center', justifyContent:'space-between', flexWrap:'wrap', gap:16}}>
            <span style={{fontFamily:'Poppins,sans-serif', fontWeight:800, fontSize:15, color:'#FFF5E8'}}>
              Advert <span style={{background:'linear-gradient(135deg,#E05A3A,#F79B3D)', WebkitBackgroundClip:'text', WebkitTextFillColor:'transparent'}}>Radical</span>
            </span>
            <span style={{fontSize:13, color:'rgba(255,245,220,0.25)'}}>© {new Date().getFullYear()} Advert Radical. All rights reserved.</span>
            <div style={{display:'flex', gap:24, alignItems:'center'}}>
              {['Privacy','Terms'].map(l=>(
                <a key={l} href="#" style={{fontSize:13, color:'rgba(255,245,220,0.3)', transition:'color 0.15s'}}
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