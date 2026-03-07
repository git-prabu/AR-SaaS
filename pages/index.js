import Head from 'next/head';
import Link from 'next/link';
import { useState, useEffect, useRef } from 'react';

function useCountUp(ref, target, duration=1000, start=false) {
  useEffect(()=>{
    if(!start||!ref.current) return;
    const el=ref.current;
    const to=Number(String(target).replace(/[^0-9]/g,''));
    const suffix=String(target).replace(/[0-9]/g,'');
    if(isNaN(to)){el.textContent=target;return;}
    const t0=Date.now();
    let raf;
    const tick=()=>{
      const p=Math.min((Date.now()-t0)/duration,1);
      const ease=1-Math.pow(1-p,3);
      el.textContent=Math.round(to*ease)+suffix;
      if(p<1) raf=requestAnimationFrame(tick);
    };
    raf=requestAnimationFrame(tick);
    return()=>cancelAnimationFrame(raf);
  },[start,target,duration]);
}

function StatCount({value,label}){
  const ref=useRef(null);
  const [on,setOn]=useState(false);
  useEffect(()=>{
    const obs=new IntersectionObserver(([e])=>{if(e.isIntersecting){setOn(true);obs.disconnect();}},{threshold:0.5});
    if(ref.current) obs.observe(ref.current);
    return()=>obs.disconnect();
  },[]);
  useCountUp(ref,value,900,on);
  return(
    <div style={{textAlign:'center'}}>
      <div ref={ref} style={{fontFamily:`'DM Mono',monospace`,fontSize:36,fontWeight:500,color:'rgba(255,255,255,0.9)',letterSpacing:'-0.03em',lineHeight:1}}>{value}</div>
      <div style={{fontSize:11,color:'rgba(255,255,255,0.28)',marginTop:6,letterSpacing:'0.1em',textTransform:'uppercase',fontFamily:`'DM Mono',monospace`}}>{label}</div>
    </div>
  );
}

export default function LandingPage() {
  const [menuOpen,setMenuOpen]=useState(false);
  const [scrolled,setScrolled]=useState(false);

  useEffect(()=>{
    const onScroll=()=>setScrolled(window.scrollY>30);
    window.addEventListener('scroll',onScroll,{passive:true});
    return()=>window.removeEventListener('scroll',onScroll);
  },[]);

  const features=[
    {icon:'◈',title:'AR on any device',desc:'No app required. Customers point their phone at the table and food materialises in real space — powered by WebAR via Chrome & Safari.'},
    {icon:'⊞',title:'Instant menu builder',desc:'Upload photos, add 3D models, set prices and descriptions. Your digital menu is live in minutes, not days.'},
    {icon:'◉',title:'Smart assistant',desc:'AI-powered menu guide helps customers find the perfect dish based on mood, diet, spice tolerance and budget.'},
    {icon:'◎',title:'Live analytics',desc:'Track visits, AR view counts, most popular items, and peak hours — all in a clean real-time dashboard.'},
    {icon:'⬡',title:'QR code generator',desc:'Print-ready QR codes for every table. Customers scan once and your entire AR menu opens instantly.'},
    {icon:'◇',title:'Promo banners',desc:'Create offer badges and seasonal highlights that appear directly on menu cards — zero design skills needed.'},
  ];

  const steps=[
    {n:'01',title:'Upload your menu',desc:'Add your dishes with photos, prices, and optional 3D models. Set dietary flags, spice levels, and categories.'},
    {n:'02',title:'Customise & publish',desc:'Brand your menu page, create offer banners, and get your unique subdomain live instantly.'},
    {n:'03',title:'Print the QR code',desc:'Generate a table-ready QR code. Customers scan it, your menu loads — no app, no friction.'},
    {n:'04',title:'Watch them explore',desc:'Diners point their phones at the table. Dishes appear in 3D augmented reality, right on the table surface.'},
  ];

  return(<>
    <Head>
      <title>Advert Radical — AR Restaurant Menus</title>
      <meta name="description" content="Put your menu in augmented reality. No app required. Customers scan a QR code and watch food appear on the table in 3D."/>
      <meta name="viewport" content="width=device-width,initial-scale=1"/>
      <link href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,300;12..96,400;12..96,600;12..96,700;12..96,800&family=DM+Mono:ital,wght@0,300;0,400;0,500&display=swap" rel="stylesheet"/>
    </Head>

    <style>{`
      *,*::before,*::after{box-sizing:border-box;margin:0;padding:0;}
      html{scroll-behavior:smooth;}
      body{
        background:#09090E;
        font-family:'Bricolage Grotesque',-apple-system,sans-serif;
        color:rgba(255,255,255,0.82);
        -webkit-font-smoothing:antialiased;
        overflow-x:hidden;
      }
      /* Grain + ambient glow */
      body::before{
        content:'';position:fixed;inset:0;z-index:0;pointer-events:none;
        background:
          radial-gradient(ellipse 70% 50% at 50% 0%, rgba(184,150,46,0.07) 0%, transparent 65%),
          radial-gradient(ellipse 50% 40% at 85% 60%, rgba(196,80,40,0.04) 0%, transparent 60%),
          url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='300' height='300'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.75' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='300' height='300' filter='url(%23n)' opacity='0.035'/%3E%3C/svg%3E");
      }
      a{text-decoration:none;color:inherit;}

      /* ── NAV ── */
      .nav{
        position:fixed;top:0;left:0;right:0;z-index:100;
        display:flex;align-items:center;justify-content:space-between;
        padding:0 36px;height:64px;
        transition:background 0.25s,border-color 0.25s,backdrop-filter 0.25s;
      }
      .nav.scrolled{
        background:rgba(9,9,14,0.85);
        border-bottom:1px solid rgba(255,255,255,0.06);
        backdrop-filter:blur(20px);-webkit-backdrop-filter:blur(20px);
      }
      .nav-logo{font-weight:800;font-size:17px;color:rgba(255,255,255,0.9);letter-spacing:'-0.01em';}
      .nav-logo span{color:#B8962E;}
      .nav-links{display:flex;align-items:center;gap:28px;}
      .nav-link{font-size:13px;font-weight:500;color:rgba(255,255,255,0.42);transition:color 0.15s;}
      .nav-link:hover{color:rgba(255,255,255,0.82);}
      .nav-cta{
        padding:9px 22px;border-radius:50px;
        background:linear-gradient(135deg,#C4A030,#B8962E,#9E7D22);
        color:#0A0800;font-weight:800;font-size:13px;
        box-shadow:0 4px 16px rgba(184,150,46,0.3);
        transition:all 0.2s;letter-spacing:-0.01em;
      }
      .nav-cta:hover{transform:translateY(-1px);box-shadow:0 6px 22px rgba(184,150,46,0.45);}
      @media(max-width:680px){.nav-links{display:none;}}

      /* ── HERO ── */
      .hero{
        position:relative;min-height:100vh;
        display:flex;flex-direction:column;align-items:center;justify-content:center;
        text-align:center;padding:120px 24px 80px;overflow:hidden;
      }
      .hero-eyebrow{
        display:inline-flex;align-items:center;gap:7px;
        padding:6px 14px;border-radius:40px;
        border:1px solid rgba(184,150,46,0.25);
        background:rgba(184,150,46,0.06);
        font-family:'DM Mono',monospace;font-size:11px;
        color:rgba(184,150,46,0.85);letter-spacing:0.08em;text-transform:uppercase;
        margin-bottom:36px;
        animation:fade-up 0.8s 0.1s cubic-bezier(0.16,1,0.3,1) both;
      }
      .hero-dot{width:6px;height:6px;border-radius:50%;background:#B8962E;animation:blink 2s infinite;}
      .hero-h1{
        font-size:clamp(48px,8vw,88px);font-weight:800;line-height:1.0;
        letter-spacing:-0.04em;color:rgba(255,255,255,0.92);
        margin-bottom:28px;max-width:780px;
        animation:fade-up 0.8s 0.2s cubic-bezier(0.16,1,0.3,1) both;
      }
      .hero-h1 em{font-style:normal;color:#B8962E;}
      .hero-sub{
        font-size:18px;color:rgba(255,255,255,0.42);line-height:1.6;
        max-width:480px;margin:0 auto 48px;font-weight:400;
        animation:fade-up 0.8s 0.3s cubic-bezier(0.16,1,0.3,1) both;
      }
      .hero-btns{
        display:flex;gap:14px;flex-wrap:wrap;justify-content:center;
        animation:fade-up 0.8s 0.4s cubic-bezier(0.16,1,0.3,1) both;
        margin-bottom:72px;
      }
      .btn-primary{
        padding:15px 32px;border-radius:50px;
        background:linear-gradient(135deg,#C4A030,#B8962E,#9E7D22);
        color:#0A0800;font-weight:800;font-size:15px;
        box-shadow:0 6px 24px rgba(184,150,46,0.4);
        transition:all 0.2s cubic-bezier(0.16,1,0.3,1);letter-spacing:-0.01em;
      }
      .btn-primary:hover{transform:translateY(-2px);box-shadow:0 10px 32px rgba(184,150,46,0.55);}
      .btn-ghost{
        padding:15px 32px;border-radius:50px;
        border:1px solid rgba(255,255,255,0.14);
        background:rgba(255,255,255,0.04);
        color:rgba(255,255,255,0.7);font-weight:600;font-size:15px;
        transition:all 0.2s;letter-spacing:-0.01em;
      }
      .btn-ghost:hover{background:rgba(255,255,255,0.08);border-color:rgba(255,255,255,0.22);color:rgba(255,255,255,0.9);}

      /* Hero visual — AR demo mock */
      .hero-demo{
        position:relative;width:min(380px,90vw);height:min(220px,55vw);
        margin-bottom:80px;
        animation:fade-up 0.9s 0.5s cubic-bezier(0.16,1,0.3,1) both;
      }
      .demo-phone{
        width:110px;height:200px;border-radius:22px;
        background:linear-gradient(145deg,#14151A,#1C1D24);
        border:2px solid rgba(255,255,255,0.1);
        position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);
        box-shadow:0 20px 60px rgba(0,0,0,0.6),0 0 0 1px rgba(255,255,255,0.05);
        overflow:hidden;display:flex;align-items:center;justify-content:center;
      }
      .demo-screen{
        width:100%;height:100%;
        background:linear-gradient(160deg,rgba(30,60,80,0.8),rgba(10,20,30,0.9));
        display:flex;align-items:center;justify-content:center;flex-direction:column;gap:6px;
        font-family:'DM Mono',monospace;font-size:9px;color:rgba(255,255,255,0.5);text-align:center;
      }
      .demo-dish{font-size:36px;line-height:1;}
      .demo-label{color:#B8962E;font-size:7px;letter-spacing:0.1em;}
      .demo-badge{
        position:absolute;top:10px;right:-8px;
        background:linear-gradient(135deg,#C4A030,#B8962E);
        color:#0A0800;font-family:'DM Mono',monospace;font-size:8px;font-weight:700;
        padding:5px 10px;border-radius:12px;
        box-shadow:0 4px 12px rgba(184,150,46,0.4);
        animation:float 3s ease-in-out infinite;
        white-space:nowrap;
      }
      .demo-table{
        position:absolute;bottom:10px;left:-60px;
        width:90px;height:50px;
        background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.07);
        border-radius:10px;display:flex;align-items:center;justify-content:center;
        font-size:24px;box-shadow:0 8px 24px rgba(0,0,0,0.4);
        animation:float 3.5s 0.5s ease-in-out infinite;
      }

      /* ── STATS ── */
      .stats{
        position:relative;z-index:1;
        display:flex;justify-content:center;gap:clamp(32px,6vw,80px);
        flex-wrap:wrap;padding:0 24px 100px;
        animation:fade-up 0.8s 0.6s cubic-bezier(0.16,1,0.3,1) both;
      }

      /* ── SECTION COMMON ── */
      .section{position:relative;z-index:1;padding:100px 24px;max-width:1060px;margin:0 auto;}
      .sec-eyebrow{font-family:'DM Mono',monospace;font-size:11px;color:rgba(184,150,46,0.7);letter-spacing:0.12em;text-transform:uppercase;margin-bottom:16px;}
      .sec-h2{font-size:clamp(32px,5vw,52px);font-weight:800;letter-spacing:-0.03em;color:rgba(255,255,255,0.88);margin-bottom:16px;line-height:1.1;}
      .sec-sub{font-size:16px;color:rgba(255,255,255,0.38);max-width:420px;line-height:1.65;margin-bottom:64px;}

      /* ── HOW IT WORKS ── */
      .steps{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:20px;}
      .step{
        background:rgba(255,255,255,0.025);border:1px solid rgba(255,255,255,0.06);border-radius:14px;
        padding:28px 24px;position:relative;overflow:hidden;transition:border-color 0.2s;
      }
      .step:hover{border-color:rgba(184,150,46,0.18);}
      .step::before{
        content:'';position:absolute;top:0;left:0;right:0;height:1px;
        background:linear-gradient(90deg,transparent,rgba(184,150,46,0.4),transparent);
        transform:scaleX(0);transition:transform 0.35s;transform-origin:left;
      }
      .step:hover::before{transform:scaleX(1);}
      .step-num{font-family:'DM Mono',monospace;font-size:11px;color:rgba(184,150,46,0.5);letter-spacing:0.1em;margin-bottom:14px;}
      .step-title{font-size:17px;font-weight:700;color:rgba(255,255,255,0.85);margin-bottom:10px;letter-spacing:-0.02em;}
      .step-desc{font-size:13px;color:rgba(255,255,255,0.35);line-height:1.65;}

      /* ── FEATURES ── */
      .features{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:16px;}
      .feat{
        background:rgba(255,255,255,0.025);border:1px solid rgba(255,255,255,0.06);border-radius:14px;
        padding:24px;transition:all 0.2s;
      }
      .feat:hover{background:rgba(184,150,46,0.04);border-color:rgba(184,150,46,0.15);transform:translateY(-2px);}
      .feat-icon{font-size:20px;margin-bottom:12px;color:#B8962E;opacity:0.7;}
      .feat-title{font-size:15px;font-weight:700;color:rgba(255,255,255,0.82);margin-bottom:8px;letter-spacing:-0.02em;}
      .feat-desc{font-size:13px;color:rgba(255,255,255,0.35);line-height:1.6;}

      /* ── CTA BAND ── */
      .cta-band{
        position:relative;z-index:1;margin:0 24px 100px;
        background:rgba(255,255,255,0.025);border:1px solid rgba(255,255,255,0.07);
        border-radius:20px;padding:72px 48px;text-align:center;overflow:hidden;
      }
      .cta-band::before{
        content:'';position:absolute;inset:0;
        background:radial-gradient(ellipse 60% 60% at 50% 50%,rgba(184,150,46,0.08),transparent);
      }
      .cta-h2{font-size:clamp(28px,4vw,44px);font-weight:800;color:rgba(255,255,255,0.9);letter-spacing:-0.03em;margin-bottom:16px;}
      .cta-sub{font-size:16px;color:rgba(255,255,255,0.38);margin-bottom:40px;}

      /* ── FOOTER ── */
      .footer{
        position:relative;z-index:1;
        border-top:1px solid rgba(255,255,255,0.06);
        padding:40px 36px;
        display:flex;align-items:center;justify-content:space-between;
        flex-wrap:wrap;gap:16px;
      }
      .footer-logo{font-weight:800;font-size:15px;color:rgba(255,255,255,0.55);}
      .footer-logo span{color:#B8962E;}
      .footer-copy{font-family:'DM Mono',monospace;font-size:11px;color:rgba(255,255,255,0.2);}

      /* ── DIVIDER ── */
      .divider{height:1px;background:linear-gradient(90deg,transparent,rgba(255,255,255,0.07),transparent);margin:0 24px;}

      /* ── KEYFRAMES ── */
      @keyframes fade-up{from{opacity:0;transform:translateY(24px)}to{opacity:1;transform:translateY(0)}}
      @keyframes blink{0%,100%{opacity:1}50%{opacity:0.2}}
      @keyframes float{0%,100%{transform:translateY(0)}50%{transform:translateY(-6px)}}
    `}</style>

    {/* ── NAV ── */}
    <nav className={`nav${scrolled?' scrolled':''}`}>
      <div className="nav-logo">Advert <span>Radical</span></div>
      <div className="nav-links">
        <a href="#features" className="nav-link">Features</a>
        <a href="#how-it-works" className="nav-link">How it works</a>
        <a href="#pricing" className="nav-link">Pricing</a>
        <Link href="/admin/login" className="nav-link">Sign in</Link>
        <Link href="/admin/login" className="nav-cta">Get Started</Link>
      </div>
    </nav>

    {/* ── HERO ── */}
    <section className="hero">
      <div className="hero-eyebrow">
        <span className="hero-dot"/>
        AR-Powered Restaurant Menus
      </div>
      <h1 className="hero-h1">
        Your menu,<br/><em>alive in 3D</em>
      </h1>
      <p className="hero-sub">
        Customers scan your QR code, point at the table, and watch food appear in augmented reality. No app needed.
      </p>
      <div className="hero-btns">
        <Link href="/admin/login" className="btn-primary">Get Started Free</Link>
        <a href="#how-it-works" className="btn-ghost">See how it works</a>
      </div>

      {/* AR demo mock */}
      <div className="hero-demo">
        <div style={{position:'absolute',left:'50%',top:'50%',width:220,height:140,transform:'translate(-60%,-50%)',background:'rgba(255,255,255,0.02)',border:'1px solid rgba(255,255,255,0.06)',borderRadius:16,display:'flex',alignItems:'center',justifyContent:'center',gap:12,padding:'0 20px',boxShadow:'0 20px 60px rgba(0,0,0,0.5)'}}>
          <span style={{fontSize:40}}>🍜</span>
          <div>
            <div style={{fontFamily:`'DM Mono',monospace`,fontSize:10,color:'rgba(255,255,255,0.25)',marginBottom:4}}>AR VIEW</div>
            <div style={{fontFamily:`'DM Mono',monospace`,fontSize:13,fontWeight:500,color:'rgba(255,255,255,0.7)'}}>Pasta Arrabiata</div>
            <div style={{fontFamily:`'DM Mono',monospace`,fontSize:11,color:'#B8962E',marginTop:2}}>₹470</div>
          </div>
        </div>
        <div className="demo-badge">⬡ AR Ready</div>
        <div className="demo-table">📱</div>
      </div>
    </section>

    {/* ── STATS ── */}
    <div className="stats">
      <StatCount value="500+" label="Restaurants"/>
      <StatCount value="50k+" label="AR Views / month"/>
      <StatCount value="4.9★" label="Avg rating"/>
    </div>

    <div className="divider"/>

    {/* ── HOW IT WORKS ── */}
    <section id="how-it-works" className="section">
      <div className="sec-eyebrow">How it works</div>
      <h2 className="sec-h2">From QR scan<br/>to AR in seconds</h2>
      <p className="sec-sub">No technical knowledge needed. Your restaurant goes AR in four steps.</p>
      <div className="steps">
        {steps.map(s=>(
          <div key={s.n} className="step">
            <div className="step-num">{s.n}</div>
            <div className="step-title">{s.title}</div>
            <div className="step-desc">{s.desc}</div>
          </div>
        ))}
      </div>
    </section>

    <div className="divider"/>

    {/* ── FEATURES ── */}
    <section id="features" className="section">
      <div className="sec-eyebrow">Everything included</div>
      <h2 className="sec-h2">Built for restaurants.<br/>Loved by diners.</h2>
      <p className="sec-sub">Every feature you need to turn a boring menu into an immersive dining experience.</p>
      <div className="features">
        {features.map(f=>(
          <div key={f.icon} className="feat">
            <div className="feat-icon">{f.icon}</div>
            <div className="feat-title">{f.title}</div>
            <div className="feat-desc">{f.desc}</div>
          </div>
        ))}
      </div>
    </section>

    <div className="divider"/>

    {/* ── CTA BAND ── */}
    <div id="pricing" className="cta-band">
      <h2 className="cta-h2">Ready to go AR?</h2>
      <p className="cta-sub">Join 500+ restaurants already using Advert Radical to wow their diners.</p>
      <div style={{display:'flex',gap:14,justifyContent:'center',flexWrap:'wrap',position:'relative',zIndex:1}}>
        <Link href="/admin/login" className="btn-primary">Start for free</Link>
        <a href="#how-it-works" className="btn-ghost">See a demo</a>
      </div>
    </div>

    {/* ── FOOTER ── */}
    <footer className="footer">
      <div className="footer-logo">Advert <span>Radical</span></div>
      <div className="footer-copy">© {new Date().getFullYear()} Advert Radical. All rights reserved.</div>
    </footer>
  </>);
}
