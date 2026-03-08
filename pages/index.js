import Head from 'next/head';
import Link from 'next/link';
import { useState, useEffect, useRef } from 'react';

const plans = [
  { name:'Basic',   price:'₹999',   per:'/6 months', items:10,  storage:'500MB', tag:null },
  { name:'Pro',     price:'₹2,499', per:'/6 months', items:40,  storage:'2GB',   tag:'Popular' },
  { name:'Premium', price:'₹4,999', per:'/6 months', items:100, storage:'5GB',   tag:'Best Value' },
];

const features = [
  { icon:'🥽', title:'WebAR — No App Needed', desc:'Customers point their phone camera and see your dishes floating in 3D on their table. Works on every smartphone, right in the browser.' },
  { icon:'📱', title:'QR Code on Every Table', desc:'One scan launches the AR menu instantly. No downloads, no friction. Just point and see the food come to life.' },
  { icon:'📊', title:'Real-Time Analytics', desc:'Track which dishes customers view, which items get the most AR interactions, and how often your menu is scanned.' },
  { icon:'✨', title:'Smart Menu Assistant', desc:'AI-powered recommendations guide customers to their perfect dish based on diet, spice preference, mood, and budget.' },
  { icon:'🎨', title:'Your Brand, Your Menu', desc:'Upload your logo, set your colours, organise items by category. The menu looks like it was built just for your restaurant.' },
  { icon:'⚡', title:'Ready in Minutes', desc:'Sign up, upload your first dish with a 3D model, share the QR code. Your AR menu is live before your customers sit down.' },
];

function AnimSection({ children, className = '', style = {} }) {
  const ref = useRef(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    if (!ref.current) return;
    const obs = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) { setVisible(true); obs.disconnect(); }
    }, { threshold: 0.08 });
    obs.observe(ref.current);
    return () => obs.disconnect();
  }, []);
  return (
    <div ref={ref} className={className} style={{
      ...style,
      opacity: visible ? 1 : 0,
      transform: visible ? 'translateY(0)' : 'translateY(28px)',
      transition: 'opacity 0.55s ease, transform 0.55s ease',
    }}>
      {children}
    </div>
  );
}

export default function HomePage() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <>
      <Head>
        <title>Advert Radical — AR Menus for Restaurants</title>
        <meta name="description" content="Give your restaurant an AR-powered menu. Customers scan, see food in 3D on their table. No app needed."/>
        <meta name="viewport" content="width=device-width, initial-scale=1"/>
        <link href="https://fonts.googleapis.com/css2?family=Syne:wght@400;600;700;800&family=DM+Sans:opsz,wght@9..40,300;9..40,400;9..40,500;9..40,600;9..40,700&display=swap" rel="stylesheet"/>
      </Head>

      <div style={{minHeight:'100vh',background:'#0E0D09',fontFamily:"'DM Sans',sans-serif",color:'#F0EAE0',overflowX:'hidden'}}>
        <style>{`
          *{box-sizing:border-box;margin:0;padding:0;}
          a{text-decoration:none;}
          :root{
            --bg:#0E0D09;--bg2:#141209;--bg3:#1C1A12;
            --orange:#E05A3A;--orange2:#F4784A;--gold:#F4A836;
            --text:#F0EAE0;--text2:#9A9080;--text3:#5A5248;
            --border:rgba(255,255,255,0.07);--border2:rgba(255,255,255,0.13);
          }
          @keyframes fadeUp{from{opacity:0;transform:translateY(22px)}to{opacity:1;transform:translateY(0)}}
          @keyframes float{0%,100%{transform:translateY(0px) rotate(0deg)}50%{transform:translateY(-14px) rotate(2deg)}}
          @keyframes float2{0%,100%{transform:translateY(0px)}50%{transform:translateY(-10px)}}
          @keyframes blink{0%,100%{opacity:1}50%{opacity:0.2}}
          @keyframes glow{0%,100%{box-shadow:0 0 20px rgba(224,90,58,0.3)}50%{box-shadow:0 0 40px rgba(224,90,58,0.6)}}
          @keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}
          @keyframes shimmer{0%{background-position:200% center}100%{background-position:-200% center}}

          /* NAV */
          .nav{position:fixed;top:0;left:0;right:0;z-index:50;
            transition:background 0.3s,border-color 0.3s,backdrop-filter 0.3s;
            border-bottom:1px solid transparent;}
          .nav.scrolled{background:rgba(14,13,9,0.92);backdrop-filter:blur(24px);-webkit-backdrop-filter:blur(24px);
            border-bottom-color:var(--border);}
          .nav-inner{max-width:1160px;margin:0 auto;padding:0 24px;
            display:flex;align-items:center;height:68px;gap:32px;}
          .nav-logo{font-family:'Syne',sans-serif;font-weight:800;font-size:18px;color:var(--text);flex-shrink:0;
            display:flex;align-items:center;gap:10px;}
          .nav-logo-dot{width:8px;height:8px;border-radius:50%;background:var(--orange);animation:blink 1.8s infinite;}
          .nav-links{display:flex;align-items:center;gap:4px;margin-left:auto;}
          .nlnk{font-size:14px;color:var(--text2);font-weight:500;padding:8px 16px;border-radius:8px;
            transition:color 0.15s,background 0.15s;}
          .nlnk:hover{color:var(--text);background:rgba(255,255,255,0.05);}
          .nav-cta{padding:10px 22px;border-radius:10px;
            background:var(--orange);color:#fff;
            font-family:'Syne',sans-serif;font-weight:700;font-size:14px;
            border:none;cursor:pointer;margin-left:8px;
            box-shadow:0 4px 16px rgba(224,90,58,0.38);
            transition:transform 0.18s,box-shadow 0.18s;}
          .nav-cta:hover{transform:translateY(-2px);box-shadow:0 8px 24px rgba(224,90,58,0.52);}
          @media(max-width:700px){.nav-links{display:none;}}

          /* HERO */
          .hero{position:relative;min-height:100vh;display:flex;align-items:center;justify-content:center;
            overflow:hidden;padding:120px 24px 80px;}
          .hero-bg{position:absolute;inset:0;
            background:
              radial-gradient(ellipse 80% 60% at 50% 100%, rgba(224,90,58,0.12) 0%, transparent 70%),
              radial-gradient(ellipse 40% 40% at 80% 20%, rgba(244,168,54,0.06) 0%, transparent 60%),
              #0E0D09;
          }
          /* Decorative food emojis floating */
          .hero-float{position:absolute;font-size:52px;opacity:0.07;pointer-events:none;user-select:none;}

          .hero-content{position:relative;z-index:2;text-align:center;max-width:820px;}
          .hero-badge{display:inline-flex;align-items:center;gap:8px;
            padding:8px 18px;border-radius:22px;
            background:rgba(224,90,58,0.1);border:1px solid rgba(224,90,58,0.25);
            font-size:13px;font-weight:600;color:var(--orange2);
            margin-bottom:28px;animation:fadeUp 0.5s 0.1s ease both;}
          .hero-badge-dot{width:6px;height:6px;border-radius:50%;background:var(--orange);animation:blink 1.6s infinite;}
          .hero-title{font-family:'Syne',sans-serif;font-size:clamp(38px,6.5vw,76px);
            font-weight:800;color:var(--text);line-height:1.1;letter-spacing:-0.03em;
            margin-bottom:24px;animation:fadeUp 0.55s 0.2s ease both;}
          .hero-title-accent{
            background:linear-gradient(135deg,var(--orange),var(--gold),var(--orange2));
            background-size:200% 200%;
            -webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;
            animation:shimmer 4s linear infinite;}
          .hero-sub{font-size:clamp(16px,2vw,20px);color:var(--text2);line-height:1.7;
            max-width:560px;margin:0 auto 36px;animation:fadeUp 0.55s 0.3s ease both;}
          .hero-btns{display:flex;gap:14px;justify-content:center;flex-wrap:wrap;
            animation:fadeUp 0.55s 0.4s ease both;}
          .btn-primary{display:inline-flex;align-items:center;gap:9px;
            padding:15px 30px;border-radius:13px;
            background:linear-gradient(135deg,#C03820,var(--orange));
            color:#fff;font-family:'Syne',sans-serif;font-weight:800;font-size:15px;
            border:none;cursor:pointer;
            box-shadow:0 6px 24px rgba(224,90,58,0.45);
            transition:transform 0.18s,box-shadow 0.18s;animation:glow 3s ease infinite;}
          .btn-primary:hover{transform:translateY(-3px);box-shadow:0 12px 36px rgba(224,90,58,0.6);}
          .btn-secondary{display:inline-flex;align-items:center;gap:9px;
            padding:15px 30px;border-radius:13px;
            background:rgba(255,255,255,0.05);
            color:var(--text);font-family:'Syne',sans-serif;font-weight:700;font-size:15px;
            border:1px solid var(--border2);cursor:pointer;
            transition:all 0.18s;}
          .btn-secondary:hover{background:rgba(255,255,255,0.09);border-color:rgba(255,255,255,0.2);transform:translateY(-2px);}

          /* Hero visual — AR preview card */
          .hero-visual{position:relative;z-index:2;margin-top:72px;max-width:720px;margin-left:auto;margin-right:auto;
            animation:fadeUp 0.65s 0.5s ease both;}
          .hero-phone-wrap{display:flex;justify-content:center;gap:20px;align-items:flex-end;}
          .ar-preview-card{background:var(--bg3);border:1px solid var(--border2);
            border-radius:22px;overflow:hidden;box-shadow:0 24px 64px rgba(0,0,0,0.6);
            width:200px;flex-shrink:0;animation:float 6s ease-in-out infinite;}
          .ar-preview-card-2{animation-delay:1.2s;animation:float2 5s ease-in-out 1.2s infinite;}
          .ar-preview-img{width:100%;height:140px;object-fit:cover;background:var(--bg2);}
          .ar-preview-body{padding:12px 14px 14px;}
          .ar-preview-name{font-family:'Syne',sans-serif;font-size:13px;font-weight:800;color:var(--text);margin-bottom:6px;}
          .ar-preview-row{display:flex;align-items:center;justify-content:space-between;gap:8px;}
          .ar-preview-price{font-family:'Syne',sans-serif;font-size:15px;font-weight:800;color:var(--orange2);}
          .ar-preview-btn{padding:6px 12px;border-radius:8px;
            background:var(--orange);color:#fff;font-size:10px;font-weight:800;
            border:none;cursor:default;box-shadow:0 3px 10px rgba(224,90,58,0.4);}
          .ar-badge-float{position:absolute;top:-14px;right:-14px;
            padding:7px 14px;border-radius:10px;
            background:var(--orange);color:#fff;font-size:11px;font-weight:800;
            box-shadow:0 6px 20px rgba(224,90,58,0.55);letter-spacing:0.03em;}

          /* STATS BAR */
          .stats-bar{background:var(--bg2);border-top:1px solid var(--border);border-bottom:1px solid var(--border);}
          .stats-inner{max-width:1160px;margin:0 auto;padding:28px 24px;
            display:grid;grid-template-columns:repeat(3,1fr);gap:0;}
          .stat-item{text-align:center;padding:0 20px;}
          .stat-item+.stat-item{border-left:1px solid var(--border);}
          .stat-num{font-family:'Syne',sans-serif;font-size:32px;font-weight:800;
            background:linear-gradient(135deg,var(--orange),var(--gold));
            -webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;}
          .stat-lbl{font-size:13px;color:var(--text3);margin-top:4px;}

          /* SECTION */
          .section{max-width:1160px;margin:0 auto;padding:100px 24px;}
          .section-badge{display:inline-flex;align-items:center;gap:7px;
            padding:6px 16px;border-radius:20px;
            background:rgba(224,90,58,0.08);border:1px solid rgba(224,90,58,0.18);
            font-size:12px;font-weight:700;color:var(--orange2);
            letter-spacing:0.04em;text-transform:uppercase;margin-bottom:18px;}
          .section-title{font-family:'Syne',sans-serif;font-size:clamp(28px,4vw,44px);font-weight:800;
            color:var(--text);line-height:1.15;letter-spacing:-0.02em;margin-bottom:14px;}
          .section-sub{font-size:17px;color:var(--text2);line-height:1.7;max-width:500px;margin-bottom:48px;}

          /* HOW IT WORKS */
          .steps{display:grid;grid-template-columns:repeat(3,1fr);gap:32px;}
          @media(max-width:700px){.steps{grid-template-columns:1fr;gap:20px;}}
          .step{background:var(--bg2);border:1px solid var(--border);border-radius:22px;padding:28px 24px;
            position:relative;overflow:hidden;transition:border-color 0.2s,transform 0.2s;}
          .step:hover{border-color:rgba(224,90,58,0.3);transform:translateY(-4px);}
          .step-num{font-family:'Syne',sans-serif;font-size:56px;font-weight:800;
            position:absolute;top:16px;right:20px;opacity:0.06;color:var(--orange);line-height:1;}
          .step-icon{font-size:36px;margin-bottom:16px;}
          .step-title{font-family:'Syne',sans-serif;font-size:18px;font-weight:800;color:var(--text);margin-bottom:8px;}
          .step-desc{font-size:14px;color:var(--text2);line-height:1.65;}

          /* FEATURES */
          .feat-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:20px;}
          @media(max-width:900px){.feat-grid{grid-template-columns:1fr 1fr;}}
          @media(max-width:560px){.feat-grid{grid-template-columns:1fr;}}
          .feat-card{background:var(--bg2);border:1px solid var(--border);border-radius:20px;padding:24px;
            transition:border-color 0.2s,transform 0.2s,background 0.2s;}
          .feat-card:hover{border-color:rgba(224,90,58,0.25);transform:translateY(-4px);background:var(--bg3);}
          .feat-icon{font-size:32px;margin-bottom:14px;}
          .feat-title{font-family:'Syne',sans-serif;font-size:16px;font-weight:800;color:var(--text);margin-bottom:8px;}
          .feat-desc{font-size:13px;color:var(--text2);line-height:1.65;}

          /* AR SHOWCASE */
          .ar-showcase{background:var(--bg2);border-top:1px solid var(--border);border-bottom:1px solid var(--border);}
          .ar-showcase-inner{max-width:1160px;margin:0 auto;padding:80px 24px;
            display:grid;grid-template-columns:1fr 1fr;gap:64px;align-items:center;}
          @media(max-width:800px){.ar-showcase-inner{grid-template-columns:1fr;gap:40px;}}
          .ar-showcase-visual{position:relative;}
          .ar-phone{width:100%;max-width:320px;margin:0 auto;display:block;
            background:var(--bg3);border:1px solid var(--border2);border-radius:28px;
            overflow:hidden;box-shadow:0 32px 80px rgba(0,0,0,0.6);}
          .ar-phone-screen{aspect-ratio:9/16;background:linear-gradient(160deg,#0A0908,#1A1510);
            display:flex;flex-direction:column;align-items:center;justify-content:center;
            position:relative;overflow:hidden;}
          .ar-phone-grid{position:absolute;inset:0;
            background-image:linear-gradient(rgba(224,90,58,0.06) 1px,transparent 1px),
              linear-gradient(90deg,rgba(224,90,58,0.06) 1px,transparent 1px);
            background-size:30px 30px;}
          .ar-dish-float{font-size:88px;animation:float 4s ease-in-out infinite;position:relative;z-index:2;}
          .ar-scan-ring{position:absolute;width:200px;height:200px;border-radius:50%;
            border:2px solid rgba(224,90,58,0.3);animation:spin 6s linear infinite;}
          .ar-scan-ring-2{width:140px;height:140px;animation-duration:4s;animation-direction:reverse;}
          .ar-phone-bar{background:rgba(17,16,9,0.9);padding:14px 18px;
            display:flex;align-items:center;justify-content:space-between;border-top:1px solid var(--border);}
          .ar-phone-item-name{font-family:'Syne',sans-serif;font-size:13px;font-weight:800;color:var(--text);}
          .ar-phone-price{font-family:'Syne',sans-serif;font-size:14px;font-weight:800;color:var(--orange2);}
          .ar-launch-btn{padding:8px 16px;border-radius:9px;
            background:var(--orange);color:#fff;font-size:11px;font-weight:800;
            border:none;cursor:default;box-shadow:0 4px 14px rgba(224,90,58,0.4);}
          .ar-floating-badge{position:absolute;top:30px;right:-20px;
            background:var(--bg3);border:1px solid rgba(224,90,58,0.3);border-radius:14px;
            padding:10px 16px;box-shadow:0 8px 24px rgba(0,0,0,0.4);}
          .ar-floating-badge-text{font-family:'Syne',sans-serif;font-size:13px;font-weight:800;color:var(--text);}
          .ar-floating-badge-sub{font-size:11px;color:var(--text3);margin-top:2px;}

          /* PRICING */
          .pricing-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:20px;}
          @media(max-width:700px){.pricing-grid{grid-template-columns:1fr;}}
          .plan{background:var(--bg2);border:1px solid var(--border);border-radius:22px;padding:28px 24px;
            position:relative;transition:transform 0.2s,border-color 0.2s;}
          .plan:hover{transform:translateY(-4px);}
          .plan.pop{border-color:rgba(224,90,58,0.35);background:linear-gradient(160deg,var(--bg2),rgba(224,90,58,0.04));}
          .plan-tag{position:absolute;top:-12px;left:50%;transform:translateX(-50%);
            padding:4px 16px;border-radius:20px;
            background:var(--orange);color:#fff;font-size:11px;font-weight:800;letter-spacing:0.03em;
            box-shadow:0 4px 14px rgba(224,90,58,0.4);white-space:nowrap;}
          .plan-name{font-family:'Syne',sans-serif;font-size:15px;font-weight:700;color:var(--text2);
            text-transform:uppercase;letter-spacing:0.06em;margin-bottom:12px;}
          .plan-price{font-family:'Syne',sans-serif;font-size:36px;font-weight:800;color:var(--text);letter-spacing:-0.03em;line-height:1;}
          .plan-per{font-size:13px;color:var(--text3);margin-bottom:22px;}
          .plan-feat{font-size:13px;color:var(--text2);margin-bottom:10px;display:flex;align-items:center;gap:8px;}
          .plan-feat::before{content:'✓';color:var(--green);font-weight:700;flex-shrink:0;}
          .plan-btn{width:100%;padding:14px;border-radius:13px;margin-top:22px;
            font-family:'Syne',sans-serif;font-weight:800;font-size:14px;cursor:pointer;border:none;
            transition:all 0.18s;}
          .plan-btn-dark{background:var(--orange);color:#fff;box-shadow:0 4px 18px rgba(224,90,58,0.38);}
          .plan-btn-dark:hover{transform:translateY(-2px);box-shadow:0 8px 24px rgba(224,90,58,0.52);}
          .plan-btn-ghost{background:var(--bg3);color:var(--text2);border:1px solid var(--border);}
          .plan-btn-ghost:hover{background:var(--bg3);border-color:var(--border2);color:var(--text);}

          /* CTA */
          .cta-section{text-align:center;padding:100px 24px;}
          .cta-inner{max-width:700px;margin:0 auto;}
          .cta-title{font-family:'Syne',sans-serif;font-size:clamp(28px,4vw,48px);font-weight:800;
            color:var(--text);line-height:1.15;letter-spacing:-0.025em;margin-bottom:16px;}
          .cta-sub{font-size:17px;color:var(--text2);margin-bottom:36px;line-height:1.65;}

          /* FOOTER */
          .footer{background:var(--bg2);border-top:1px solid var(--border);padding:40px 24px;}
          .footer-inner{max-width:1160px;margin:0 auto;
            display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:16px;}
          .footer-logo{font-family:'Syne',sans-serif;font-weight:800;font-size:16px;color:var(--text);}
          .footer-copy{font-size:13px;color:var(--text3);}
          .footer-links{display:flex;gap:20px;}
          .footer-link{font-size:13px;color:var(--text3);transition:color 0.15s;}
          .footer-link:hover{color:var(--orange2);}
        `}</style>

        {/* NAV */}
        <nav className={`nav${scrolled?' scrolled':''}`}>
          <div className="nav-inner">
            <div className="nav-logo">
              <span className="nav-logo-dot"/>
              Advert Radical
            </div>
            <div className="nav-links">
              <a href="#" className="nlnk">Home</a>
              <a href="/restaurant/spot" className="nlnk">Menu Demo</a>
              <a href="#features" className="nlnk">Features</a>
              <a href="#pricing" className="nlnk">Pricing</a>
            </div>
            <Link href="/admin/login">
              <button className="nav-cta">Get Started →</button>
            </Link>
          </div>
        </nav>

        {/* HERO */}
        <section className="hero">
          <div className="hero-bg"/>
          {/* Floating food decorations */}
          <div className="hero-float" style={{top:'18%',left:'6%',animation:'float 7s ease-in-out infinite'}}>🍕</div>
          <div className="hero-float" style={{top:'25%',right:'8%',animation:'float 5.5s ease-in-out 0.8s infinite'}}>🍔</div>
          <div className="hero-float" style={{bottom:'28%',left:'4%',animation:'float 6s ease-in-out 1.5s infinite'}}>🍜</div>
          <div className="hero-float" style={{bottom:'22%',right:'6%',animation:'float2 7s ease-in-out 0.4s infinite'}}>🍰</div>
          <div className="hero-float" style={{top:'60%',left:'14%',fontSize:'32px',animation:'float 8s ease-in-out 2s infinite'}}>🥗</div>

          <div style={{position:'relative',zIndex:2,width:'100%',maxWidth:1160,margin:'0 auto'}}>
            <div className="hero-content">
              <div className="hero-badge">
                <span className="hero-badge-dot"/>
                Now with Augmented Reality
              </div>
              <h1 className="hero-title">
                Experience Your Food in{' '}
                <span className="hero-title-accent">Augmented Reality</span>
              </h1>
              <p className="hero-sub">
                Let your customers see every dish in 3D — floating on their table, before they order. No app required. Just scan, point, and experience.
              </p>
              <div className="hero-btns">
                <Link href="/restaurant/spot">
                  <button className="btn-primary">
                    <span>🍽️</span> Explore Menu Demo
                  </button>
                </Link>
                <Link href="/admin/login">
                  <button className="btn-secondary">
                    <span>🥽</span> Try AR Menu
                  </button>
                </Link>
              </div>
            </div>

            {/* AR Preview Cards */}
            <div className="hero-visual">
              <div className="hero-phone-wrap">
                <div style={{position:'relative'}}>
                  <div className="ar-preview-card" style={{animation:'float 6s ease-in-out infinite'}}>
                    <img className="ar-preview-img"
                      src="https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?w=400&q=80"
                      alt="Dish" onError={e=>{e.target.style.background='#1C1A12';}}/>
                    <div className="ar-preview-body">
                      <div className="ar-preview-name">Margherita Pizza</div>
                      <div className="ar-preview-row">
                        <span className="ar-preview-price">₹349</span>
                        <span className="ar-preview-btn">View in AR</span>
                      </div>
                    </div>
                  </div>
                  <div className="ar-badge-float">🥽 AR Live</div>
                </div>

                <div className="ar-preview-card ar-preview-card-2" style={{animation:'float2 5s ease-in-out 1.2s infinite',marginBottom:24}}>
                  <img className="ar-preview-img"
                    src="https://images.unsplash.com/photo-1504674900247-0877df9cc836?w=400&q=80"
                    alt="Dish" onError={e=>{e.target.style.background='#1C1A12';}}/>
                  <div className="ar-preview-body">
                    <div className="ar-preview-name">Butter Chicken</div>
                    <div className="ar-preview-row">
                      <span className="ar-preview-price">₹289</span>
                      <span className="ar-preview-btn">View in AR</span>
                    </div>
                  </div>
                </div>

                <div className="ar-preview-card" style={{animation:'float 7s ease-in-out 0.6s infinite',marginBottom:12}}>
                  <img className="ar-preview-img"
                    src="https://images.unsplash.com/photo-1540189549336-e6e99c3679fe?w=400&q=80"
                    alt="Dish" onError={e=>{e.target.style.background='#1C1A12';}}/>
                  <div className="ar-preview-body">
                    <div className="ar-preview-name">Grilled Salmon</div>
                    <div className="ar-preview-row">
                      <span className="ar-preview-price">₹499</span>
                      <span className="ar-preview-btn">View in AR</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* STATS */}
        <div className="stats-bar">
          <div className="stats-inner">
            <AnimSection className="stat-item">
              <div className="stat-num">3D</div>
              <div className="stat-lbl">True Augmented Reality · No app needed</div>
            </AnimSection>
            <AnimSection className="stat-item">
              <div className="stat-num">2 min</div>
              <div className="stat-lbl">Average setup time per dish</div>
            </AnimSection>
            <AnimSection className="stat-item">
              <div className="stat-num">↑ 40%</div>
              <div className="stat-lbl">Average order value increase</div>
            </AnimSection>
          </div>
        </div>

        {/* HOW IT WORKS */}
        <section className="section" id="how">
          <AnimSection>
            <div className="section-badge">How It Works</div>
            <h2 className="section-title">AR on the table<br/>in three steps</h2>
            <p className="section-sub">No technical knowledge required. If you can upload a photo, you can launch an AR menu.</p>
          </AnimSection>
          <div className="steps">
            {[
              { icon:'📸', num:'01', title:'Upload Your Dishes', desc:'Add menu items with photos and 3D model files. Our system handles the rest — hosting, loading, AR tracking.' },
              { icon:'🔳', num:'02', title:'Place QR on Tables', desc:'Print your unique QR code and put it on every table. One code, one scan, full AR menu.' },
              { icon:'🥽', num:'03', title:'Customers See It in 3D', desc:'Customers scan, point at the table, and watch your food appear in real-world scale through their phone camera.' },
            ].map((s,i)=>(
              <AnimSection key={i} className="step" style={{transitionDelay:`${i*0.12}s`}}>
                <div className="step-num">{s.num}</div>
                <div className="step-icon">{s.icon}</div>
                <div className="step-title">{s.title}</div>
                <div className="step-desc">{s.desc}</div>
              </AnimSection>
            ))}
          </div>
        </section>

        {/* AR SHOWCASE */}
        <div className="ar-showcase">
          <div className="ar-showcase-inner">
            <AnimSection>
              <div className="section-badge">🥽 AR Technology</div>
              <h2 className="section-title">See it. Before you order it.</h2>
              <p style={{fontSize:16,color:'var(--text2)',lineHeight:1.75,marginBottom:28}}>
                Customers point their phone at the table and your dish appears in front of them at real scale — no app, no glasses, no friction. Pure WebAR via their browser.
              </p>
              <div style={{display:'flex',flexDirection:'column',gap:14}}>
                {[
                  'Works on Android Chrome and iOS Safari',
                  'Dishes scale to real-world size on the table',
                  'Rotate, zoom, inspect from every angle',
                  'Launch directly from the menu card',
                ].map((t,i)=>(
                  <div key={i} style={{display:'flex',alignItems:'center',gap:12,fontSize:14,color:'var(--text2)'}}>
                    <span style={{width:22,height:22,borderRadius:'50%',background:'rgba(224,90,58,0.15)',
                      border:'1px solid rgba(224,90,58,0.3)',display:'flex',alignItems:'center',justifyContent:'center',
                      fontSize:11,color:'var(--orange)',fontWeight:800,flexShrink:0}}>✓</span>
                    {t}
                  </div>
                ))}
              </div>
              <div style={{marginTop:32,display:'flex',gap:12,flexWrap:'wrap'}}>
                <Link href="/restaurant/spot">
                  <button className="btn-primary" style={{fontSize:14,padding:'13px 26px'}}>
                    View Live Demo →
                  </button>
                </Link>
              </div>
            </AnimSection>

            <AnimSection className="ar-showcase-visual">
              <div className="ar-phone">
                <div className="ar-phone-screen">
                  <div className="ar-phone-grid"/>
                  <div className="ar-scan-ring"/>
                  <div className="ar-scan-ring ar-scan-ring-2"/>
                  <div className="ar-dish-float">🍛</div>
                  <div style={{position:'relative',zIndex:2,marginTop:16,
                    background:'rgba(224,90,58,0.15)',border:'1px solid rgba(224,90,58,0.3)',
                    borderRadius:8,padding:'5px 14px',fontSize:11,color:'var(--orange2)',fontWeight:700}}>
                    AR Active · Point at table
                  </div>
                </div>
                <div className="ar-phone-bar">
                  <div>
                    <div className="ar-phone-item-name">Butter Chicken</div>
                    <div className="ar-phone-price">₹289</div>
                  </div>
                  <div className="ar-launch-btn">🥽 View in AR</div>
                </div>
              </div>
              <div className="ar-floating-badge">
                <div className="ar-floating-badge-text">🥽 No App Needed</div>
                <div className="ar-floating-badge-sub">Works in browser · Android &amp; iOS</div>
              </div>
            </AnimSection>
          </div>
        </div>

        {/* FEATURES */}
        <section className="section" id="features">
          <AnimSection>
            <div className="section-badge">Features</div>
            <h2 className="section-title">Everything your restaurant needs</h2>
            <p className="section-sub">Built for restaurant owners, not developers. Everything works out of the box.</p>
          </AnimSection>
          <div className="feat-grid">
            {features.map((f,i)=>(
              <AnimSection key={i} className="feat-card" style={{transitionDelay:`${(i%3)*0.1}s`}}>
                <div className="feat-icon">{f.icon}</div>
                <div className="feat-title">{f.title}</div>
                <div className="feat-desc">{f.desc}</div>
              </AnimSection>
            ))}
          </div>
        </section>

        {/* PRICING */}
        <section className="section" id="pricing">
          <AnimSection>
            <div className="section-badge">Pricing</div>
            <h2 className="section-title">Simple, honest pricing</h2>
            <p className="section-sub">No hidden fees, no per-scan charges. Pay once every 6 months and run as many AR menus as your plan allows.</p>
          </AnimSection>
          <div className="pricing-grid">
            {plans.map((p,i)=>(
              <AnimSection key={i} className={`plan${p.tag==='Popular'?' pop':''}`}
                style={{transitionDelay:`${i*0.12}s`}}>
                {p.tag && <div className="plan-tag">{p.tag}</div>}
                <div className="plan-name">{p.name}</div>
                <div className="plan-price">{p.price}</div>
                <div className="plan-per">{p.per}</div>
                <div className="plan-feat">Up to {p.items} AR menu items</div>
                <div className="plan-feat">{p.storage} media storage</div>
                <div className="plan-feat">Unlimited QR scans</div>
                <div className="plan-feat">Analytics dashboard</div>
                <div className="plan-feat">Smart Menu Assistant</div>
                <Link href="/admin/login">
                  <button className={`plan-btn ${p.tag==='Popular'?'plan-btn-dark':'plan-btn-ghost'}`}>
                    Get Started
                  </button>
                </Link>
              </AnimSection>
            ))}
          </div>
        </section>

        {/* CTA */}
        <div style={{background:'var(--bg2)',borderTop:'1px solid var(--border)'}}>
          <AnimSection className="cta-section">
            <div className="cta-inner">
              <div style={{fontSize:52,marginBottom:18}}>🥽</div>
              <h2 className="cta-title">Your AR menu is 10 minutes away</h2>
              <p className="cta-sub">Sign up, upload one dish with a 3D model, and share the QR code with your first table. That's it.</p>
              <div style={{display:'flex',gap:14,justifyContent:'center',flexWrap:'wrap'}}>
                <Link href="/admin/login">
                  <button className="btn-primary" style={{fontSize:15,padding:'15px 32px'}}>
                    Start Free Trial →
                  </button>
                </Link>
                <Link href="/restaurant/spot">
                  <button className="btn-secondary" style={{fontSize:15,padding:'15px 32px'}}>
                    See Live Demo
                  </button>
                </Link>
              </div>
            </div>
          </AnimSection>
        </div>

        {/* FOOTER */}
        <footer className="footer">
          <div className="footer-inner">
            <div className="footer-logo">Advert Radical</div>
            <div className="footer-copy">© 2026 Advert Radical. AR menus for restaurants.</div>
            <div className="footer-links">
              <Link href="/admin/login" className="footer-link">Admin Login</Link>
              <Link href="/superadmin/login" className="footer-link">Superadmin</Link>
            </div>
          </div>
        </footer>
      </div>
    </>
  );
}
