import Head from 'next/head';
import { useState, useEffect, useRef, useCallback } from 'react';

const PASS = 'RADICAL25';

/* ── Slide data ─────────────────────────────── */
const FEATURES = [
  { icon:'🥽', title:'AR Visualization',   body:'Dishes appear life-size in 3D on the customer\'s table. Zero app download.' },
  { icon:'🤖', title:'AI Upselling',        body:'Claude AI suggests the perfect add-ons at the right moment, automatically.' },
  { icon:'📱', title:'Instant QR Menus',    body:'Per-table QR codes. Your menu loads in under 2 seconds on any phone.' },
  { icon:'📊', title:'Live Analytics',      body:'See which dishes get viewed, which trigger AR, and what drives orders.' },
  { icon:'🔔', title:'Waiter Call System',  body:'Customers request service from the table. Staff notified instantly.' },
  { icon:'⚡', title:'5-Minute Setup',       body:'Upload your menu, print QR codes, go live. No technical skills needed.' },
];

const ROADMAP = [
  { icon:'🛒', title:'Cart & Ordering',      tag:'Q2 2025', body:'Full in-app ordering flow — customers order directly from the AR menu.' },
  { icon:'💳', title:'Razorpay Payments',    tag:'Q2 2025', body:'UPI, cards, netbanking — complete digital payment at the table.' },
  { icon:'🌐', title:'Multi-language',       tag:'Q3 2025', body:'Tamil, Hindi, and more — one menu that speaks every customer\'s language.' },
  { icon:'🏷️', title:'Allergen & Diet Tags', tag:'Q3 2025', body:'Veg, non-veg, Jain, gluten-free — built-in tags for every dietary need.' },
  { icon:'🎁', title:'Loyalty & Coupons',    tag:'Q4 2025', body:'Digital loyalty points, offers, and coupons — all inside the menu.' },
  { icon:'📦', title:'CSV Bulk Import',      tag:'Live Now', body:'Upload hundreds of menu items in one go via spreadsheet.' },
];

const PLANS = [
  { name:'Starter', price:'₹999', per:'/mo', color:'rgba(42,31,16,0.06)', border:'rgba(42,31,16,0.1)', tx:'#1E1B18', accent:'#1E1B18',
    features:['20 menu items','1 GB storage','QR code menu','AI Menu Assistant','Basic analytics'] },
  { name:'Growth',  price:'₹2,499', per:'/mo', color:'#1E1B18', border:'#1E1B18', tx:'#FFF5E8', accent:'#F79B3D', tag:'Most Popular',
    features:['60 menu items','3 GB storage','AR food visualization','AI upselling','Dish ratings','Waiter call system'] },
  { name:'Pro',     price:'₹4,999', per:'/mo', color:'rgba(247,155,61,0.07)', border:'rgba(247,155,61,0.3)', tx:'#1E1B18', accent:'#E05A3A',
    features:['150 menu items','10 GB storage','CSV menu import','Advanced analytics','Priority support','Custom branding'] },
];

/* ══════════════════════════════════════════════════════════════════ */
export default function Pitch() {
  const [authed,   setAuthed]   = useState(false);
  const [passVal,  setPassVal]  = useState('');
  const [passErr,  setPassErr]  = useState(false);
  const [slide,    setSlide]    = useState(0);
  const [animDir,  setAnimDir]  = useState(1);   // 1=down, -1=up
  const [visible,  setVisible]  = useState(true);
  const TOTAL = 10;
  const transitioning = useRef(false);
  const containerRef = useRef(null);

  /* ── Password ── */
  const tryPass = () => {
    if (passVal.trim().toUpperCase() === PASS) { setAuthed(true); }
    else { setPassErr(true); setTimeout(() => setPassErr(false), 600); }
  };

  /* ── Navigation ── */
  const goTo = useCallback((next) => {
    if (transitioning.current) return;
    if (next < 0 || next >= TOTAL) return;
    transitioning.current = true;
    setAnimDir(next > slide ? 1 : -1);
    setVisible(false);
    setTimeout(() => {
      setSlide(next);
      setVisible(true);
      setTimeout(() => { transitioning.current = false; }, 500);
    }, 300);
  }, [slide]);

  const next = useCallback(() => goTo(slide + 1), [goTo, slide]);
  const prev = useCallback(() => goTo(slide - 1), [goTo, slide]);

  useEffect(() => {
    const onKey = (e) => {
      if (!authed) return;
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown' || e.key === ' ') { e.preventDefault(); next(); }
      if (e.key === 'ArrowLeft'  || e.key === 'ArrowUp')  { e.preventDefault(); prev(); }
      if (e.key >= '1' && e.key <= '9') goTo(parseInt(e.key) - 1);
      if (e.key === '0') goTo(9);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [authed, next, prev, goTo]);

  /* ── Wheel / touch ── */
  useEffect(() => {
    if (!authed) return;
    let lastWheel = 0;
    const onWheel = (e) => {
      e.preventDefault();
      const now = Date.now();
      if (now - lastWheel < 700) return;
      lastWheel = now;
      if (e.deltaY > 0) next(); else prev();
    };
    let tStart = 0;
    const onTStart = (e) => { tStart = e.touches[0].clientY; };
    const onTEnd   = (e) => {
      const dy = tStart - e.changedTouches[0].clientY;
      if (Math.abs(dy) < 50) return;
      if (dy > 0) next(); else prev();
    };
    const el = containerRef.current;
    el?.addEventListener('wheel', onWheel, { passive: false });
    el?.addEventListener('touchstart', onTStart, { passive: true });
    el?.addEventListener('touchend',   onTEnd,   { passive: true });
    return () => {
      el?.removeEventListener('wheel', onWheel);
      el?.removeEventListener('touchstart', onTStart);
      el?.removeEventListener('touchend',   onTEnd);
    };
  }, [authed, next, prev]);

  const slideStyle = {
    position: 'absolute', inset: 0,
    opacity:    visible ? 1 : 0,
    transform:  visible ? 'translateY(0)' : `translateY(${animDir * 32}px)`,
    transition: 'opacity 0.32s cubic-bezier(0.16,1,0.3,1), transform 0.36s cubic-bezier(0.16,1,0.3,1)',
  };

  /* ── Password screen ── */
  if (!authed) return (
    <>
      <Head>
        <title>Advert Radical — Presentation</title>
        <link href="https://fonts.googleapis.com/css2?family=Syne:wght@700;800&family=DM+Sans:wght@400;500;700&display=swap" rel="stylesheet"/>
      </Head>
      <div style={{ minHeight:'100vh', background:'#0C0A08', display:'flex', alignItems:'center', justifyContent:'center', fontFamily:'DM Sans,sans-serif' }}>
        <style>{`
          @keyframes shake { 0%,100%{transform:translateX(0)} 20%,60%{transform:translateX(-8px)} 40%,80%{transform:translateX(8px)} }
          .pi { width:100%; padding:14px 20px; background:rgba(255,245,220,0.05); border:1.5px solid rgba(255,245,220,0.12); border-radius:14px; font-size:16px; color:#FFF5E8; font-family:'DM Sans',sans-serif; letter-spacing:0.12em; text-align:center; outline:none; }
          .pi:focus { border-color:rgba(247,155,61,0.5); }
          .pi.err { animation:shake 0.4s ease; border-color:#E05A3A; }
          .pb { width:100%; padding:14px; border-radius:14px; border:none; background:linear-gradient(135deg,#E05A3A,#F79B3D); color:#fff; font-size:15px; font-weight:700; cursor:pointer; font-family:'DM Sans',sans-serif; margin-top:12px; }
        `}</style>
        <div style={{ width:360, textAlign:'center' }}>
          <div style={{ fontFamily:'Syne,sans-serif', fontWeight:800, fontSize:28, color:'#FFF5E8', marginBottom:6 }}>
            Advert <span style={{ background:'linear-gradient(135deg,#E05A3A,#F79B3D)', WebkitBackgroundClip:'text', WebkitTextFillColor:'transparent' }}>Radical</span>
          </div>
          <div style={{ fontSize:13, color:'rgba(255,245,220,0.35)', marginBottom:36, letterSpacing:'0.08em' }}>PRESENTATION · CONFIDENTIAL</div>
          <input
            className={`pi${passErr?' err':''}`}
            type="password" placeholder="Enter access code"
            value={passVal} onChange={e => setPassVal(e.target.value)}
            onKeyDown={e => e.key==='Enter' && tryPass()}
          />
          <button className="pb" onClick={tryPass}>Enter →</button>
          {passErr && <div style={{ color:'#E05A3A', fontSize:12, marginTop:10 }}>Incorrect access code</div>}
        </div>
      </div>
    </>
  );

  /* ════════════════════════════════════════════════════════════════
     SLIDES
  ════════════════════════════════════════════════════════════════ */
  const slides = [

    /* ── 00 OPENING ── */
    <div key="s0" style={{ ...slideStyle, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', textAlign:'center', padding:'0 60px', background:'#0C0A08', position:'relative', overflow:'hidden' }}>
      <div style={{ position:'absolute', inset:0, background:`url('/ar-experience.png') center/cover no-repeat`, opacity:0.18, filter:'blur(2px)' }}/>
      <div style={{ position:'absolute', inset:0, background:'radial-gradient(ellipse at 60% 40%, rgba(247,155,61,0.12) 0%, transparent 55%)' }}/>
      <div style={{ position:'relative', zIndex:1, maxWidth:900 }}>
        <div style={{ display:'inline-flex', alignItems:'center', gap:8, padding:'6px 16px', borderRadius:30, background:'rgba(247,155,61,0.12)', border:'1px solid rgba(247,155,61,0.25)', fontSize:12, fontWeight:700, color:'rgba(247,155,61,0.9)', letterSpacing:'0.12em', textTransform:'uppercase', marginBottom:32 }}>
          AR + AI Revenue Platform
        </div>
        <h1 style={{ fontFamily:'Syne,sans-serif', fontWeight:800, fontSize:'clamp(52px,8vw,100px)', lineHeight:0.92, letterSpacing:'-0.03em', color:'#FFF5E8', margin:'0 0 28px' }}>
          Your menu<br/>
          <span style={{ background:'linear-gradient(90deg,#F79B3D,#E05A3A)', WebkitBackgroundClip:'text', WebkitTextFillColor:'transparent' }}>is leaving money</span><br/>
          on the table.
        </h1>
        <p style={{ fontSize:'clamp(16px,2vw,22px)', color:'rgba(255,245,220,0.52)', lineHeight:1.7, maxWidth:600, margin:'0 auto 48px' }}>
          Advert Radical turns your restaurant menu into an AR-powered revenue machine — no app, no friction, no technical setup.
        </p>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:8, color:'rgba(255,245,220,0.3)', fontSize:13 }}>
          <span>Press</span>
          <kbd style={{ padding:'4px 10px', borderRadius:8, border:'1px solid rgba(255,245,220,0.2)', fontSize:12, color:'rgba(255,245,220,0.5)' }}>→</kbd>
          <span>to continue</span>
        </div>
      </div>
    </div>,

    /* ── 01 THE PROBLEM ── */
    <div key="s1" style={{ ...slideStyle, display:'grid', gridTemplateColumns:'1fr 1fr', background:'#0C0A08', overflow:'hidden' }}>
      {/* Left — old world */}
      <div style={{ display:'flex', flexDirection:'column', justifyContent:'center', padding:'80px 60px 80px 80px', borderRight:'1px solid rgba(255,245,220,0.06)' }}>
        <div style={{ fontSize:11, fontWeight:700, letterSpacing:'0.2em', textTransform:'uppercase', color:'rgba(224,90,58,0.7)', marginBottom:20 }}>The Problem</div>
        <h2 style={{ fontFamily:'Syne,sans-serif', fontWeight:800, fontSize:'clamp(36px,4.5vw,58px)', lineHeight:0.96, letterSpacing:'-0.03em', color:'#FFF5E8', margin:'0 0 28px' }}>
          Customers are<br/>
          <span style={{ WebkitTextStroke:'2px rgba(255,245,220,0.4)', WebkitTextFillColor:'transparent' }}>ordering blind.</span>
        </h2>
        <p style={{ fontSize:16, color:'rgba(255,245,220,0.45)', lineHeight:1.8, maxWidth:380, marginBottom:36 }}>
          A PDF with dish names and prices tells a customer nothing. No photos. No portion size. No idea what it actually looks like. So they play it safe — and order less.
        </p>
        {[
          ['68%', 'of diners are more likely to order a dish they can see'],
          ['3×',  'more add-ons ordered when food is visualised'],
          ['41%', 'of first-time customers leave without ordering extras'],
        ].map(([num, txt]) => (
          <div key={num} style={{ display:'flex', alignItems:'flex-start', gap:16, marginBottom:16 }}>
            <span style={{ fontFamily:'Syne,sans-serif', fontWeight:800, fontSize:28, color:'#E05A3A', lineHeight:1, flexShrink:0 }}>{num}</span>
            <span style={{ fontSize:13, color:'rgba(255,245,220,0.4)', lineHeight:1.6, paddingTop:4 }}>{txt}</span>
          </div>
        ))}
        <div style={{ fontSize:11, color:'rgba(255,245,220,0.2)', marginTop:8 }}>Industry research · National Restaurant Association</div>
      </div>
      {/* Right — visual */}
      <div style={{ display:'flex', flexDirection:'column', justifyContent:'center', alignItems:'center', padding:60, background:'rgba(255,245,220,0.02)' }}>
        <div style={{ width:'100%', maxWidth:360, background:'rgba(255,253,248,0.04)', border:'1px solid rgba(255,245,220,0.08)', borderRadius:20, overflow:'hidden' }}>
          <div style={{ background:'rgba(255,245,220,0.06)', padding:'14px 20px', borderBottom:'1px solid rgba(255,245,220,0.06)', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
            <span style={{ fontFamily:'Syne,sans-serif', fontWeight:800, fontSize:13, color:'rgba(255,245,220,0.5)', letterSpacing:'0.06em' }}>MENU.PDF</span>
            <span style={{ fontSize:10, fontWeight:700, padding:'3px 8px', borderRadius:5, background:'rgba(224,90,58,0.15)', color:'rgba(224,90,58,0.8)', letterSpacing:'0.08em' }}>STATIC</span>
          </div>
          <div style={{ padding:'12px 0' }}>
            {[['Chicken Biryani','₹280'],['Paneer Tikka','₹240'],['Dal Makhani','₹180'],['Gulab Jamun','₹80'],['Garlic Naan','₹60'],['Mango Lassi','₹120']].map(([n,p]) => (
              <div key={n} style={{ display:'flex', justifyContent:'space-between', padding:'10px 20px', borderBottom:'1px solid rgba(255,245,220,0.04)' }}>
                <span style={{ fontSize:13, color:'rgba(255,245,220,0.45)' }}>{n}</span>
                <span style={{ fontSize:13, color:'rgba(255,245,220,0.3)', fontWeight:700 }}>{p}</span>
              </div>
            ))}
          </div>
          <div style={{ padding:'12px 20px', background:'rgba(224,90,58,0.07)', borderTop:'1px solid rgba(224,90,58,0.15)', display:'flex', alignItems:'center', gap:8 }}>
            <span style={{ width:6, height:6, borderRadius:'50%', background:'#E05A3A', flexShrink:0 }}/>
            <span style={{ fontSize:10, fontWeight:700, letterSpacing:'0.08em', color:'rgba(224,90,58,0.7)', textTransform:'uppercase' }}>No photos · No 3D · No story</span>
          </div>
        </div>
      </div>
    </div>,

    /* ── 02 THE SOLUTION ── */
    <div key="s2" style={{ ...slideStyle, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', textAlign:'center', padding:'0 60px', background:'#0C0A08', overflow:'hidden' }}>
      <div style={{ position:'absolute', inset:0, background:'radial-gradient(ellipse at 50% 50%, rgba(247,155,61,0.1) 0%, transparent 60%)' }}/>
      <div style={{ position:'relative', zIndex:1, maxWidth:860 }}>
        <div style={{ fontSize:11, fontWeight:700, letterSpacing:'0.2em', textTransform:'uppercase', color:'rgba(247,155,61,0.7)', marginBottom:24 }}>The Solution</div>
        <h2 style={{ fontFamily:'Syne,sans-serif', fontWeight:800, fontSize:'clamp(52px,8vw,96px)', lineHeight:0.92, letterSpacing:'-0.035em', color:'#FFF5E8', margin:'0 0 32px' }}>
          SCAN.<br/>
          <span style={{ background:'linear-gradient(90deg,#F79B3D,#E05A3A)', WebkitBackgroundClip:'text', WebkitTextFillColor:'transparent' }}>SEE.</span><br/>
          ORDER MORE.
        </h2>
        <p style={{ fontSize:'clamp(16px,1.8vw,20px)', color:'rgba(255,245,220,0.48)', lineHeight:1.75, maxWidth:580, margin:'0 auto 52px' }}>
          Advert Radical gives every restaurant an AR-powered menu. Customers point their phone at the table. Food appears in 3D. AI suggests add-ons. Orders go up.
        </p>
        <div style={{ display:'flex', justifyContent:'center', gap:40, flexWrap:'wrap' }}>
          {[['🥽','WebAR'],['📱','No App'],['🤖','AI-Powered'],['⚡','5 Min Setup']].map(([e,l]) => (
            <div key={l} style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:10 }}>
              <div style={{ width:56, height:56, borderRadius:16, background:'rgba(247,155,61,0.1)', border:'1px solid rgba(247,155,61,0.2)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:24 }}>{e}</div>
              <span style={{ fontSize:12, fontWeight:700, color:'rgba(255,245,220,0.6)', letterSpacing:'0.06em' }}>{l}</span>
            </div>
          ))}
        </div>
      </div>
    </div>,

    /* ── 03 HOW IT WORKS ── */
    <div key="s3" style={{ ...slideStyle, display:'flex', flexDirection:'column', justifyContent:'center', padding:'60px 80px', background:'#0C0A08' }}>
      <div style={{ fontSize:11, fontWeight:700, letterSpacing:'0.2em', textTransform:'uppercase', color:'rgba(247,155,61,0.7)', marginBottom:16, textAlign:'center' }}>How It Works</div>
      <h2 style={{ fontFamily:'Syne,sans-serif', fontWeight:800, fontSize:'clamp(36px,4vw,52px)', letterSpacing:'-0.03em', color:'#FFF5E8', textAlign:'center', margin:'0 0 56px' }}>
        Live in 3 steps. No IT team needed.
      </h2>
      <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:24, maxWidth:1100, margin:'0 auto', width:'100%' }}>
        {[
          { n:'01', title:'Set Up Your Menu', body:'Add your dishes, photos, and prices to your Advert Radical dashboard. Takes under 5 minutes.', icon:'📋' },
          { n:'02', title:'Print & Place QRs', body:'Download your branded QR codes — one per table. Stick them on. Your AR menu is live instantly.', icon:'🖨️' },
          { n:'03', title:'Watch Orders Rise', body:'Customers scan, browse in 3D, get AI suggestions — and order more. You track everything in real time.', icon:'📈' },
        ].map(s => (
          <div key={s.n} style={{ background:'rgba(255,255,255,0.03)', border:'1px solid rgba(255,245,220,0.08)', borderRadius:24, padding:36, position:'relative', overflow:'hidden' }}>
            <div style={{ position:'absolute', top:24, right:24, fontFamily:'Syne,sans-serif', fontWeight:800, fontSize:64, color:'rgba(255,245,220,0.04)', lineHeight:1 }}>{s.n}</div>
            <div style={{ width:52, height:52, borderRadius:16, background:'linear-gradient(135deg,rgba(224,90,58,0.15),rgba(247,155,61,0.15))', border:'1px solid rgba(247,155,61,0.2)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:22, marginBottom:20 }}>{s.icon}</div>
            <div style={{ fontFamily:'Syne,sans-serif', fontWeight:800, fontSize:20, color:'#FFF5E8', marginBottom:12, letterSpacing:'-0.01em' }}>{s.title}</div>
            <p style={{ fontSize:14, color:'rgba(255,245,220,0.45)', lineHeight:1.75, margin:0 }}>{s.body}</p>
          </div>
        ))}
      </div>
    </div>,

    /* ── 04 THE EXPERIENCE (AR Image) ── */
    <div key="s4" style={{ ...slideStyle, display:'grid', gridTemplateColumns:'1fr 1fr', background:'#0C0A08', overflow:'hidden' }}>
      <div style={{ display:'flex', flexDirection:'column', justifyContent:'center', padding:'80px 60px 80px 80px' }}>
        <div style={{ fontSize:11, fontWeight:700, letterSpacing:'0.2em', textTransform:'uppercase', color:'rgba(247,155,61,0.7)', marginBottom:20 }}>The Experience</div>
        <h2 style={{ fontFamily:'Syne,sans-serif', fontWeight:800, fontSize:'clamp(36px,4.5vw,58px)', lineHeight:0.96, letterSpacing:'-0.03em', color:'#FFF5E8', margin:'0 0 28px' }}>
          Food appears<br/>
          <span style={{ background:'linear-gradient(90deg,#F79B3D,#E05A3A)', WebkitBackgroundClip:'text', WebkitTextFillColor:'transparent' }}>in 3D.</span><br/>
          Before they order.
        </h2>
        <p style={{ fontSize:16, color:'rgba(255,245,220,0.45)', lineHeight:1.8, maxWidth:380, marginBottom:36 }}>
          Customers see exact portion sizes, colours and presentation — right on their table. No guesswork. No disappointment. Just confident orders.
        </p>
        {[['Photorealistic 3D models','Built specifically for your dishes'],['Works on any smartphone','Android Chrome, iOS Safari — zero app'],['Instant AR detection','Table surface detected in &lt;2 seconds']].map(([t,b]) => (
          <div key={t} style={{ display:'flex', gap:14, marginBottom:16, alignItems:'flex-start' }}>
            <div style={{ width:20, height:20, borderRadius:6, background:'rgba(247,155,61,0.15)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:10, color:'#F79B3D', fontWeight:800, flexShrink:0, marginTop:2 }}>✓</div>
            <div>
              <div style={{ fontSize:14, fontWeight:700, color:'#FFF5E8', marginBottom:2 }} dangerouslySetInnerHTML={{ __html:t }}/>
              <div style={{ fontSize:12, color:'rgba(255,245,220,0.38)' }} dangerouslySetInnerHTML={{ __html:b }}/>
            </div>
          </div>
        ))}
      </div>
      <div style={{ position:'relative', overflow:'hidden' }}>
        <img src="/ar-experience.png" alt="AR food visualization" style={{ width:'100%', height:'100%', objectFit:'cover' }}/>
        <div style={{ position:'absolute', inset:0, background:'linear-gradient(to right, #0C0A08 0%, transparent 30%)' }}/>
        <div style={{ position:'absolute', top:28, left:28, background:'rgba(0,0,0,0.65)', border:'1px solid rgba(247,155,61,0.35)', borderRadius:8, padding:'5px 10px', display:'flex', alignItems:'center', gap:6 }}>
          <span style={{ width:6, height:6, borderRadius:'50%', background:'#F79B3D', display:'inline-block' }}/>
          <span style={{ fontSize:9, fontWeight:700, letterSpacing:'0.14em', color:'rgba(247,155,61,0.9)', textTransform:'uppercase' }}>AR Live</span>
        </div>
      </div>
    </div>,

    /* ── 05 FEATURES ── */
    <div key="s5" style={{ ...slideStyle, display:'flex', flexDirection:'column', justifyContent:'center', padding:'60px 80px', background:'#FAF7F2', overflow:'hidden' }}>
      <div style={{ fontSize:11, fontWeight:700, letterSpacing:'0.2em', textTransform:'uppercase', color:'#E05A3A', marginBottom:12, textAlign:'center' }}>Platform Features</div>
      <h2 style={{ fontFamily:'Syne,sans-serif', fontWeight:800, fontSize:'clamp(32px,3.5vw,48px)', letterSpacing:'-0.03em', color:'#1E1B18', textAlign:'center', margin:'0 0 40px' }}>
        Everything your restaurant needs. Nothing it doesn&apos;t.
      </h2>
      <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:16, maxWidth:1060, margin:'0 auto', width:'100%' }}>
        {FEATURES.map(f => (
          <div key={f.title} style={{ background:'#fff', border:'1px solid rgba(42,31,16,0.07)', borderRadius:20, padding:28, boxShadow:'0 2px 12px rgba(42,31,16,0.05)' }}>
            <div style={{ width:48, height:48, borderRadius:14, background:'rgba(247,155,61,0.1)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:22, marginBottom:16 }}>{f.icon}</div>
            <div style={{ fontFamily:'Syne,sans-serif', fontWeight:800, fontSize:16, color:'#1E1B18', marginBottom:8 }}>{f.title}</div>
            <p style={{ fontSize:13, color:'rgba(42,31,16,0.5)', lineHeight:1.7, margin:0 }}>{f.body}</p>
          </div>
        ))}
      </div>
    </div>,

    /* ── 06 MARKET OPPORTUNITY ── */
    <div key="s6" style={{ ...slideStyle, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', textAlign:'center', padding:'0 80px', background:'#0C0A08', overflow:'hidden' }}>
      <div style={{ position:'absolute', inset:0, background:'radial-gradient(ellipse at 30% 60%, rgba(224,90,58,0.08) 0%, transparent 55%)' }}/>
      <div style={{ position:'absolute', inset:0, background:'radial-gradient(ellipse at 70% 30%, rgba(247,155,61,0.07) 0%, transparent 55%)' }}/>
      <div style={{ position:'relative', zIndex:1, width:'100%', maxWidth:1060 }}>
        <div style={{ fontSize:11, fontWeight:700, letterSpacing:'0.2em', textTransform:'uppercase', color:'rgba(247,155,61,0.7)', marginBottom:20 }}>The Opportunity</div>
        <h2 style={{ fontFamily:'Syne,sans-serif', fontWeight:800, fontSize:'clamp(36px,4vw,52px)', letterSpacing:'-0.03em', color:'#FFF5E8', margin:'0 0 52px' }}>
          India&apos;s restaurant industry is massive.<br/>
          <span style={{ color:'rgba(255,245,220,0.4)' }}>And almost none of it uses AR.</span>
        </h2>
        <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:20 }}>
          {[
            { stat:'₹5.5L Cr', label:'India restaurant industry size', sub:'Growing at 9% annually · NRAI 2024' },
            { stat:'7.5M+',    label:'Restaurants across India',        sub:'Less than 0.1% use AR technology today' },
            { stat:'26%',      label:'Avg order value increase with AR', sub:'Visual menus drive confident, larger orders' },
          ].map(s => (
            <div key={s.stat} style={{ background:'rgba(255,255,255,0.03)', border:'1px solid rgba(255,245,220,0.08)', borderRadius:24, padding:'36px 28px' }}>
              <div style={{ fontFamily:'Syne,sans-serif', fontWeight:800, fontSize:'clamp(36px,4vw,52px)', letterSpacing:'-0.04em', background:'linear-gradient(135deg,#F79B3D,#E05A3A)', WebkitBackgroundClip:'text', WebkitTextFillColor:'transparent', lineHeight:1, marginBottom:14 }}>{s.stat}</div>
              <div style={{ fontSize:14, fontWeight:700, color:'#FFF5E8', marginBottom:8 }}>{s.label}</div>
              <div style={{ fontSize:12, color:'rgba(255,245,220,0.35)' }}>{s.sub}</div>
            </div>
          ))}
        </div>
      </div>
    </div>,

    /* ── 07 ROADMAP ── */
    <div key="s7" style={{ ...slideStyle, display:'flex', flexDirection:'column', justifyContent:'center', padding:'60px 80px', background:'#FAF7F2', overflow:'hidden' }}>
      <div style={{ fontSize:11, fontWeight:700, letterSpacing:'0.2em', textTransform:'uppercase', color:'#E05A3A', marginBottom:12, textAlign:'center' }}>Platform Roadmap</div>
      <h2 style={{ fontFamily:'Syne,sans-serif', fontWeight:800, fontSize:'clamp(32px,3.5vw,46px)', letterSpacing:'-0.03em', color:'#1E1B18', textAlign:'center', margin:'0 0 40px' }}>
        This is just the beginning.
      </h2>
      <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:14, maxWidth:1060, margin:'0 auto', width:'100%' }}>
        {ROADMAP.map(r => (
          <div key={r.title} style={{ background:'#fff', border:'1px solid rgba(42,31,16,0.07)', borderRadius:18, padding:24, boxShadow:'0 2px 10px rgba(42,31,16,0.04)' }}>
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:14 }}>
              <span style={{ fontSize:22 }}>{r.icon}</span>
              <span style={{ fontSize:10, fontWeight:700, padding:'3px 10px', borderRadius:20, background: r.tag==='Live Now' ? 'rgba(90,154,120,0.12)' : 'rgba(247,155,61,0.1)', color: r.tag==='Live Now' ? '#1A6040' : '#C05A00', letterSpacing:'0.05em' }}>{r.tag}</span>
            </div>
            <div style={{ fontFamily:'Syne,sans-serif', fontWeight:800, fontSize:15, color:'#1E1B18', marginBottom:8 }}>{r.title}</div>
            <p style={{ fontSize:12, color:'rgba(42,31,16,0.5)', lineHeight:1.7, margin:0 }}>{r.body}</p>
          </div>
        ))}
      </div>
    </div>,

    /* ── 08 PRICING ── */
    <div key="s8" style={{ ...slideStyle, display:'flex', flexDirection:'column', justifyContent:'center', padding:'60px 80px', background:'#0C0A08', overflow:'hidden' }}>
      <div style={{ position:'absolute', inset:0, background:'radial-gradient(ellipse at 50% 60%, rgba(247,155,61,0.07) 0%, transparent 55%)' }}/>
      <div style={{ position:'relative', zIndex:1 }}>
        <div style={{ fontSize:11, fontWeight:700, letterSpacing:'0.2em', textTransform:'uppercase', color:'rgba(247,155,61,0.7)', marginBottom:12, textAlign:'center' }}>Simple Pricing</div>
        <h2 style={{ fontFamily:'Syne,sans-serif', fontWeight:800, fontSize:'clamp(32px,3.5vw,46px)', letterSpacing:'-0.03em', color:'#FFF5E8', textAlign:'center', margin:'0 0 40px' }}>
          Start free. Scale as you grow.
        </h2>
        <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:20, maxWidth:980, margin:'0 auto', width:'100%' }}>
          {PLANS.map(p => (
            <div key={p.name} style={{ background:p.color, border:`1.5px solid ${p.border}`, borderRadius:24, padding:'32px 28px', position:'relative' }}>
              {p.tag && (
                <div style={{ position:'absolute', top:-14, left:'50%', transform:'translateX(-50%)', padding:'5px 18px', background:'linear-gradient(135deg,#E05A3A,#F79B3D)', color:'#fff', fontSize:11, fontWeight:700, borderRadius:30, whiteSpace:'nowrap' }}>
                  ✦ {p.tag}
                </div>
              )}
              <div style={{ fontFamily:'Syne,sans-serif', fontWeight:800, fontSize:18, color:p.tx, marginBottom:4 }}>{p.name}</div>
              <div style={{ display:'flex', alignItems:'baseline', gap:4, marginBottom:20, paddingBottom:16, borderBottom:`1px solid ${p.name==='Growth'?'rgba(255,245,220,0.1)':'rgba(42,31,16,0.08)'}` }}>
                <span style={{ fontFamily:'Syne,sans-serif', fontWeight:800, fontSize:36, color:p.tx, letterSpacing:'-0.03em', lineHeight:1 }}>{p.price}</span>
                <span style={{ fontSize:13, color:p.name==='Growth'?'rgba(255,245,220,0.4)':'rgba(42,31,16,0.4)', fontWeight:500 }}>{p.per}</span>
              </div>
              <div style={{ display:'flex', flexDirection:'column', gap:9 }}>
                {p.features.map(f => (
                  <div key={f} style={{ display:'flex', alignItems:'center', gap:10, fontSize:13, color:p.name==='Growth'?'rgba(255,245,220,0.7)':p.tx }}>
                    <div style={{ width:18, height:18, borderRadius:5, background:p.name==='Growth'?'rgba(247,155,61,0.18)':'rgba(42,31,16,0.07)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:9, color:p.accent, fontWeight:800, flexShrink:0 }}>✓</div>
                    {f}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
        <p style={{ textAlign:'center', fontSize:13, color:'rgba(255,245,220,0.3)', marginTop:24 }}>14-day free trial · No credit card required · Cancel anytime</p>
      </div>
    </div>,

    /* ── 09 FOUNDING PARTNER / THE ASK ── */
    <div key="s9" style={{ ...slideStyle, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', textAlign:'center', padding:'0 80px', background:'#0C0A08', overflow:'hidden' }}>
      <div style={{ position:'absolute', inset:0, background:'radial-gradient(ellipse at 50% 40%, rgba(247,155,61,0.12) 0%, transparent 55%)' }}/>
      <div style={{ position:'relative', zIndex:1, maxWidth:800 }}>
        <div style={{ display:'inline-flex', alignItems:'center', gap:8, padding:'7px 18px', borderRadius:30, background:'rgba(247,155,61,0.12)', border:'1px solid rgba(247,155,61,0.28)', fontSize:12, fontWeight:700, color:'rgba(247,155,61,0.9)', letterSpacing:'0.12em', textTransform:'uppercase', marginBottom:32 }}>
          ✦ Founding Partner Programme
        </div>
        <h2 style={{ fontFamily:'Syne,sans-serif', fontWeight:800, fontSize:'clamp(44px,6vw,80px)', lineHeight:0.94, letterSpacing:'-0.035em', color:'#FFF5E8', margin:'0 0 28px' }}>
          Be the first.<br/>
          <span style={{ background:'linear-gradient(90deg,#F79B3D,#E05A3A)', WebkitBackgroundClip:'text', WebkitTextFillColor:'transparent' }}>Own the edge.</span>
        </h2>
        <p style={{ fontSize:'clamp(15px,1.6vw,19px)', color:'rgba(255,245,220,0.48)', lineHeight:1.75, maxWidth:560, margin:'0 auto 40px' }}>
          We&apos;re onboarding our first 50 founding partner restaurants in Chennai. Founding partners get locked-in pricing, priority AR model creation, and direct access to the founding team.
        </p>
        <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:16, marginBottom:44, maxWidth:680, margin:'0 auto 44px' }}>
          {[
            { icon:'🔒', title:'Locked-in pricing', body:'Your rate never increases as we grow.' },
            { icon:'🥽', title:'Priority AR setup', body:'Your dishes in 3D within 48 hours.' },
            { icon:'📞', title:'Founder access',    body:'Direct line to Prabu for feedback and support.' },
          ].map(b => (
            <div key={b.title} style={{ background:'rgba(255,255,255,0.04)', border:'1px solid rgba(255,245,220,0.08)', borderRadius:18, padding:'22px 18px' }}>
              <div style={{ fontSize:24, marginBottom:10 }}>{b.icon}</div>
              <div style={{ fontFamily:'Syne,sans-serif', fontWeight:800, fontSize:14, color:'#FFF5E8', marginBottom:6 }}>{b.title}</div>
              <div style={{ fontSize:12, color:'rgba(255,245,220,0.4)' }}>{b.body}</div>
            </div>
          ))}
        </div>
        <div style={{ display:'flex', gap:12, justifyContent:'center', flexWrap:'wrap' }}>
          <a href="mailto:prabu@advertradical.com" style={{ padding:'15px 36px', borderRadius:14, background:'linear-gradient(135deg,#E05A3A,#F79B3D)', color:'#fff', fontFamily:'Syne,sans-serif', fontWeight:800, fontSize:15, textDecoration:'none', display:'inline-block' }}>
            Get Started →
          </a>
          <a href="https://ar-saa-s-kbzn.vercel.app/restaurant/spot" target="_blank" rel="noreferrer" style={{ padding:'15px 28px', borderRadius:14, background:'rgba(255,245,220,0.06)', border:'1px solid rgba(255,245,220,0.15)', color:'rgba(255,245,220,0.8)', fontFamily:'Syne,sans-serif', fontWeight:700, fontSize:15, textDecoration:'none', display:'inline-block' }}>
            See Live Demo
          </a>
        </div>
      </div>
    </div>,
  ];

  /* ══ SHELL ══ */
  return (
    <>
      <Head>
        <title>Advert Radical — Pitch</title>
        <link href="https://fonts.googleapis.com/css2?family=Syne:wght@700;800&family=DM+Sans:ital,wght@0,400;0,500;0,700;1,400&display=swap" rel="stylesheet"/>
        <meta name="robots" content="noindex,nofollow"/>
      </Head>
      <div ref={containerRef} style={{ width:'100vw', height:'100vh', overflow:'hidden', position:'relative', userSelect:'none', fontFamily:'DM Sans,sans-serif', cursor:'default' }}>
        <style>{`
          * { box-sizing:border-box; margin:0; padding:0; }
          a { text-decoration:none; color:inherit; }
          ::-webkit-scrollbar { display:none; }
        `}</style>

        {/* Slides */}
        <div style={{ position:'relative', width:'100%', height:'100%' }}>
          {slides[slide]}
        </div>

        {/* Progress dots — right side */}
        <div style={{ position:'fixed', right:28, top:'50%', transform:'translateY(-50%)', display:'flex', flexDirection:'column', gap:8, zIndex:100 }}>
          {slides.map((_, i) => (
            <button key={i} onClick={() => goTo(i)} style={{ width: i===slide ? 6 : 5, height: i===slide ? 24 : 6, borderRadius:99, border:'none', cursor:'pointer', padding:0, transition:'all 0.3s cubic-bezier(0.34,1.56,0.64,1)', background: i===slide ? '#F79B3D' : 'rgba(255,245,220,0.22)' }}/>
          ))}
        </div>

        {/* Slide counter */}
        <div style={{ position:'fixed', bottom:28, right:28, fontSize:11, fontWeight:700, letterSpacing:'0.1em', color:'rgba(255,245,220,0.25)', zIndex:100, fontFamily:'DM Sans,sans-serif' }}>
          {String(slide+1).padStart(2,'0')} / {String(TOTAL).padStart(2,'0')}
        </div>

        {/* Logo watermark */}
        <div style={{ position:'fixed', bottom:28, left:28, fontFamily:'Syne,sans-serif', fontWeight:800, fontSize:13, color:'rgba(255,245,220,0.2)', zIndex:100, letterSpacing:'-0.01em' }}>
          Advert <span style={{ background:'linear-gradient(135deg,#E05A3A,#F79B3D)', WebkitBackgroundClip:'text', WebkitTextFillColor:'transparent' }}>Radical</span>
        </div>

        {/* Prev / Next arrows */}
        {slide > 0 && (
          <button onClick={prev} style={{ position:'fixed', left:'50%', top:28, transform:'translateX(-50%)', width:36, height:36, borderRadius:'50%', border:'1px solid rgba(255,245,220,0.15)', background:'rgba(255,255,255,0.05)', color:'rgba(255,245,220,0.5)', fontSize:16, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', zIndex:100, backdropFilter:'blur(8px)' }}>↑</button>
        )}
        {slide < TOTAL-1 && (
          <button onClick={next} style={{ position:'fixed', left:'50%', bottom:28, transform:'translateX(-50%)', width:36, height:36, borderRadius:'50%', border:'1px solid rgba(255,245,220,0.15)', background:'rgba(255,255,255,0.05)', color:'rgba(255,245,220,0.5)', fontSize:16, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', zIndex:100, backdropFilter:'blur(8px)' }}>↓</button>
        )}
      </div>
    </>
  );
}
