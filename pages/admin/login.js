import Head from 'next/head';
import Link from 'next/link';
import { useState } from 'react';
import { useRouter } from 'next/router';
import { useAuth } from '../../hooks/useAuth';
import { getUserData } from '../../lib/db';
import toast from 'react-hot-toast';

export default function AdminLogin() {
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading]   = useState(false);
  const { signIn, signOut } = useAuth();
  const router = useRouter();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const cred = await signIn(email, password);
      const userData = await getUserData(cred.user.uid);
      if (!userData || userData.role !== 'restaurant') {
        await signOut();
        toast.error('Access denied. Restaurant accounts only.');
        setLoading(false);
        return;
      }
      toast.success('Welcome back!');
      router.push('/admin');
    } catch (err) {
      toast.error(err.code === 'auth/invalid-credential' ? 'Invalid email or password.' : 'Login failed.');
      setLoading(false);
    }
  };

  return (
    <>
      <Head>
        <title>Sign In — Advert Radical</title>
        <link href="https://fonts.googleapis.com/css2?family=Poppins:wght@700;800;900&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet"/>
      </Head>

      <div style={{minHeight:'100vh', background:'#0C0A08', fontFamily:'Inter,sans-serif', display:'flex', position:'relative', overflow:'hidden'}}>
        <style>{`
          * { box-sizing:border-box; margin:0; padding:0; }

          @keyframes floatA { 0%,100%{transform:translateY(0) rotate(0deg)}   50%{transform:translateY(-16px) rotate(3deg)} }
          @keyframes floatB { 0%,100%{transform:translateY(0) rotate(0deg)}   50%{transform:translateY(-12px) rotate(-2deg)} }
          @keyframes floatC { 0%,100%{transform:translateY(0) rotate(-2deg)}  50%{transform:translateY(-20px) rotate(2deg)} }
          @keyframes floatD { 0%,100%{transform:translateY(0) rotate(2deg)}   50%{transform:translateY(-10px) rotate(-3deg)} }
          @keyframes fadeUp { from{opacity:0;transform:translateY(24px)} to{opacity:1;transform:none} }
          @keyframes blink  { 0%,100%{opacity:1} 50%{opacity:0.15} }
          @keyframes pulse  { 0%,100%{box-shadow:0 0 0 0 rgba(247,155,61,0.45)} 50%{box-shadow:0 0 0 10px rgba(247,155,61,0)} }

          /* ── Inputs ── */
          .al-input {
            width:100%; padding:14px 16px;
            background:rgba(255,245,220,0.05);
            border:1.5px solid rgba(255,245,220,0.1);
            border-radius:12px; font-size:14px;
            color:#FFF5E8; outline:none;
            transition:all 0.2s; font-family:Inter,sans-serif;
          }
          .al-input:focus {
            border-color:rgba(247,155,61,0.5);
            background:rgba(255,245,220,0.08);
            box-shadow:0 0 0 4px rgba(247,155,61,0.1);
          }
          .al-input::placeholder { color:rgba(255,245,220,0.2); }

          /* ── Submit button ── */
          .al-btn {
            width:100%; padding:15px; border-radius:12px; border:none;
            background:linear-gradient(135deg,#E05A3A,#F79B3D);
            color:#fff; font-family:Poppins,sans-serif;
            font-weight:700; font-size:15px; cursor:pointer;
            box-shadow:0 8px 28px rgba(224,90,58,0.45);
            transition:all 0.2s;
          }
          .al-btn:hover:not(:disabled) { transform:translateY(-2px); box-shadow:0 14px 36px rgba(224,90,58,0.55); }
          .al-btn:disabled { opacity:0.45; cursor:not-allowed; transform:none; box-shadow:none; }

          /* ── Layout panels ── */
          /*
           * KEY FIX: left panel uses align-items:center so ALL content
           * is centered in its column — no left-hugging dead zones.
           * Right panel gets a barely-there tint for visual separation.
           */
          .al-left {
            flex: 0 0 58%;
            min-height: 100vh;
            display: flex;
            flex-direction: column;
            align-items: center;        /* ← centers content horizontally */
            justify-content: space-between;
            padding: 44px 56px;
            border-right: 1px solid rgba(255,245,220,0.06);
            position: relative;
            overflow: hidden;
            z-index: 1;
          }

          .al-right {
            flex: 0 0 42%;
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 48px 56px;
            background: rgba(255,255,255,0.018); /* subtle right-panel tint */
            position: relative;
            z-index: 1;
          }

          .al-form-wrap { animation: fadeUp 0.65s cubic-bezier(0.16,1,0.3,1) both; }

          /* ── Content block — centered, max-width caps it cleanly ── */
          .al-content-block {
            width: 100%;
            max-width: 540px;
            display: flex;
            flex-direction: column;
            align-items: center;   /* center text + widget */
            text-align: center;
          }

          /* ── Activity row ── */
          .al-activity-row {
            display:flex; align-items:center; gap:10px;
            padding:9px 13px; border-radius:11px;
            background:rgba(255,255,255,0.035);
            border:1px solid rgba(255,245,220,0.05);
          }

          @media(max-width:900px) {
            .al-left          { display:none !important; }
            .al-right         { flex:1; background:transparent; }
          }
          @media(min-width:901px) { .al-mobile-logo { display:none !important; } }
        `}</style>

        {/* ── BG ambient glows ── */}
        <div style={{position:'fixed', top:'-15%', left:'15%', width:800, height:800, borderRadius:'50%', background:'radial-gradient(ellipse, rgba(247,155,61,0.09) 0%, transparent 60%)', pointerEvents:'none', filter:'blur(80px)'}}/>
        <div style={{position:'fixed', bottom:'-20%', right:'5%', width:600, height:600, borderRadius:'50%', background:'radial-gradient(ellipse, rgba(224,90,58,0.07) 0%, transparent 65%)', pointerEvents:'none', filter:'blur(60px)'}}/>
        {/* Subtle grid */}
        <div style={{position:'fixed', inset:0, backgroundImage:'linear-gradient(rgba(255,245,220,0.016) 1px, transparent 1px), linear-gradient(90deg, rgba(255,245,220,0.016) 1px, transparent 1px)', backgroundSize:'64px 64px', pointerEvents:'none'}}/>


        {/* ════════════════════════════════════
            LEFT PANEL
            Content is centered in the column.
            Emojis fill all 4 corners for depth.
        ════════════════════════════════════ */}
        <div className="al-left">

          {/* TOP — Logo pinned left of centered block */}
          <div style={{width:'100%', maxWidth:540}}>
            <Link href="/" style={{textDecoration:'none'}}>
              <span style={{fontFamily:'Poppins,sans-serif', fontWeight:800, fontSize:18, color:'#FFF5E8'}}>
                Advert <span style={{background:'linear-gradient(135deg,#E05A3A,#F79B3D)', WebkitBackgroundClip:'text', WebkitTextFillColor:'transparent'}}>Radical</span>
              </span>
            </Link>
          </div>

          {/* MIDDLE — centered content block */}
          <div className="al-content-block">

            {/* Label */}
            <div style={{fontSize:11, fontWeight:700, color:'rgba(247,155,61,0.55)', letterSpacing:'0.12em', textTransform:'uppercase', marginBottom:12}}>
              Restaurant Admin Portal
            </div>

            {/* Headline */}
            <h2 style={{fontFamily:'Poppins,sans-serif', fontWeight:900, fontSize:'clamp(28px,2.8vw,44px)', color:'#FFF5E8', lineHeight:1.1, letterSpacing:'-0.025em', marginBottom:12}}>
              Manage your{' '}
              <span style={{background:'linear-gradient(90deg,#F79B3D,#E05A3A)', WebkitBackgroundClip:'text', WebkitTextFillColor:'transparent'}}>AR menu</span>
              {' '}from anywhere.
            </h2>

            {/* Subtitle */}
            <p style={{fontSize:14, color:'rgba(255,245,220,0.38)', lineHeight:1.85, maxWidth:400, marginBottom:28}}>
              Update dishes, track analytics, manage waiter calls, and grow your revenue — all in one dashboard.
            </p>

            {/* ── Dashboard preview card — fills the max-width ── */}
            <div style={{width:'100%', background:'rgba(255,255,255,0.04)', border:'1px solid rgba(255,245,220,0.08)', borderRadius:20, padding:22, backdropFilter:'blur(20px)', boxShadow:'0 24px 64px rgba(0,0,0,0.35)'}}>

              {/* Card header */}
              <div style={{display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:16}}>
                <div style={{display:'flex', alignItems:'center', gap:7}}>
                  <div style={{width:8, height:8, borderRadius:'50%', background:'#F79B3D', animation:'pulse 2s infinite'}}/>
                  <span style={{fontSize:10.5, fontWeight:700, color:'rgba(255,245,220,0.35)', letterSpacing:'0.09em', textTransform:'uppercase'}}>Live Overview</span>
                </div>
                <span style={{fontSize:10, color:'rgba(255,245,220,0.18)', fontWeight:500}}>Today</span>
              </div>

              {/* 3 stat tiles */}
              <div style={{display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:9, marginBottom:14}}>
                {[
                  {label:'AR Views',   value:'1,240', badge:'+18%', bg:'rgba(247,155,61,0.13)', bc:'#F79B3D'},
                  {label:'QR Scans',   value:'382',   badge:'+9%',  bg:'rgba(100,185,145,0.1)', bc:'#6AB090'},
                  {label:'Avg Rating', value:'4.8★',  badge:'Top',  bg:'rgba(224,90,58,0.1)',   bc:'#E05A3A'},
                ].map(s => (
                  <div key={s.label} style={{background:s.bg, borderRadius:13, padding:'12px 13px', textAlign:'left'}}>
                    <div style={{fontSize:9.5, color:'rgba(255,245,220,0.3)', fontWeight:600, marginBottom:5, letterSpacing:'0.04em'}}>{s.label}</div>
                    <div style={{fontSize:18, fontWeight:900, color:'#FFF5E8', fontFamily:'Poppins,sans-serif', letterSpacing:'-0.02em', marginBottom:3}}>{s.value}</div>
                    <div style={{fontSize:10, fontWeight:700, color:s.bc}}>{s.badge}</div>
                  </div>
                ))}
              </div>

              {/* Bar chart */}
              <div style={{background:'rgba(0,0,0,0.28)', borderRadius:13, padding:'12px 14px', marginBottom:12}}>
                <div style={{fontSize:9.5, fontWeight:700, color:'rgba(255,245,220,0.2)', letterSpacing:'0.08em', marginBottom:9}}>WEEKLY AR VIEWS</div>
                <div style={{display:'flex', alignItems:'flex-end', gap:5, height:52}}>
                  {[32,52,38,68,60,94,72].map((h, i) => (
                    <div key={i} style={{flex:1, borderRadius:5, height:`${h}%`, background: i===5 ? 'linear-gradient(0deg,#E05A3A,#F79B3D)' : 'rgba(255,255,255,0.09)'}}/>
                  ))}
                </div>
                <div style={{display:'flex', gap:5, marginTop:6}}>
                  {['M','T','W','T','F','S','S'].map((d,i) => (
                    <div key={i} style={{flex:1, textAlign:'center', fontSize:8, fontWeight:600, color: i===5 ? 'rgba(247,155,61,0.55)' : 'rgba(255,245,220,0.2)'}}>{d}</div>
                  ))}
                </div>
              </div>

              {/* Activity feed */}
              <div style={{display:'flex', flexDirection:'column', gap:6}}>
                {[
                  {icon:'🔔', text:'Table 4 requested the bill',     time:'2m ago'},
                  {icon:'⭐', text:'Chicken Biryani rated 5★',        time:'8m ago'},
                  {icon:'🥽', text:'23 AR views on Paneer Tikka',     time:'14m ago'},
                ].map((a,i) => (
                  <div key={i} className="al-activity-row">
                    <span style={{fontSize:14, flexShrink:0}}>{a.icon}</span>
                    <span style={{fontSize:12, color:'rgba(255,245,220,0.42)', flex:1, textAlign:'left'}}>{a.text}</span>
                    <span style={{fontSize:10, color:'rgba(255,245,220,0.18)', flexShrink:0}}>{a.time}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* BOTTOM — Stats row, pinned to max-width block */}
          <div style={{width:'100%', maxWidth:540, display:'flex', gap:36, paddingTop:20, borderTop:'1px solid rgba(255,245,220,0.06)'}}>
            {[
              {num:'500+',   label:'Restaurants'},
              {num:'↑ 28%', label:'Avg order value'},
              {num:'5 min', label:'Setup time'},
            ].map(s => (
              <div key={s.label}>
                <div style={{fontFamily:'Poppins,sans-serif', fontWeight:900, fontSize:20, color:'#FFF5E8', letterSpacing:'-0.02em'}}>{s.num}</div>
                <div style={{fontSize:11, color:'rgba(255,245,220,0.28)', marginTop:3}}>{s.label}</div>
              </div>
            ))}
          </div>

          {/* ── Floating emojis — one in each corner quadrant to fill depth ── */}
          {/* Top-left */}
          <div style={{position:'absolute', top:'8%',  left:'4%',  fontSize:48, animation:'floatA 6s ease-in-out infinite',      opacity:0.35, filter:'drop-shadow(0 8px 20px rgba(0,0,0,0.5))', pointerEvents:'none', zIndex:0}}>🍛</div>
          {/* Top-right */}
          <div style={{position:'absolute', top:'6%',  right:'4%', fontSize:40, animation:'floatB 7.5s ease-in-out 1s infinite',  opacity:0.28, filter:'drop-shadow(0 6px 18px rgba(0,0,0,0.45))', pointerEvents:'none', zIndex:0}}>🍕</div>
          {/* Mid-right (fills the right side of the panel beside the centered widget) */}
          <div style={{position:'absolute', top:'42%', right:'3%', fontSize:52, animation:'floatC 5.5s ease-in-out 0.4s infinite', opacity:0.22, filter:'drop-shadow(0 10px 24px rgba(0,0,0,0.5))', pointerEvents:'none', zIndex:0}}>🍲</div>
          {/* Mid-left */}
          <div style={{position:'absolute', top:'46%', left:'3%',  fontSize:36, animation:'floatD 8s ease-in-out 2s infinite',     opacity:0.2,  filter:'drop-shadow(0 6px 16px rgba(0,0,0,0.4))', pointerEvents:'none', zIndex:0}}>🫕</div>
          {/* Bottom-right */}
          <div style={{position:'absolute', bottom:'12%', right:'5%', fontSize:44, animation:'floatA 7s ease-in-out 1.8s infinite', opacity:0.25, filter:'drop-shadow(0 8px 22px rgba(0,0,0,0.45))', pointerEvents:'none', zIndex:0}}>🍢</div>
          {/* Bottom-left */}
          <div style={{position:'absolute', bottom:'14%', left:'5%', fontSize:32, animation:'floatB 9s ease-in-out 3s infinite',    opacity:0.18, filter:'drop-shadow(0 5px 14px rgba(0,0,0,0.4))', pointerEvents:'none', zIndex:0}}>🥘</div>
        </div>


        {/* ════════════════════════════════════
            RIGHT PANEL — Form
        ════════════════════════════════════ */}
        <div className="al-right">
          <div className="al-form-wrap" style={{width:'100%', maxWidth:390}}>

            {/* Mobile-only logo */}
            <div className="al-mobile-logo" style={{marginBottom:32}}>
              <Link href="/" style={{textDecoration:'none'}}>
                <span style={{fontFamily:'Poppins,sans-serif', fontWeight:800, fontSize:18, color:'#FFF5E8'}}>
                  Advert <span style={{background:'linear-gradient(135deg,#E05A3A,#F79B3D)', WebkitBackgroundClip:'text', WebkitTextFillColor:'transparent'}}>Radical</span>
                </span>
              </Link>
            </div>

            {/* Heading */}
            <div style={{marginBottom:36}}>
              <h1 style={{fontFamily:'Poppins,sans-serif', fontWeight:800, fontSize:28, color:'#FFF5E8', letterSpacing:'-0.02em', marginBottom:8}}>
                Welcome back
              </h1>
              <p style={{fontSize:14, color:'rgba(255,245,220,0.4)', lineHeight:1.65}}>
                Sign in to your restaurant admin account.
              </p>
            </div>

            {/* Form */}
            <form onSubmit={handleSubmit}>
              <div style={{marginBottom:16}}>
                <label style={{display:'block', fontSize:11, fontWeight:700, color:'rgba(255,245,220,0.36)', marginBottom:8, letterSpacing:'0.08em', textTransform:'uppercase'}}>
                  Email address
                </label>
                <input
                  className="al-input" type="email"
                  value={email} onChange={e => setEmail(e.target.value)}
                  placeholder="your@restaurant.com" required
                />
              </div>
              <div style={{marginBottom:32}}>
                <label style={{display:'block', fontSize:11, fontWeight:700, color:'rgba(255,245,220,0.36)', marginBottom:8, letterSpacing:'0.08em', textTransform:'uppercase'}}>
                  Password
                </label>
                <input
                  className="al-input" type="password"
                  value={password} onChange={e => setPassword(e.target.value)}
                  placeholder="••••••••" required
                />
              </div>
              <button className="al-btn" type="submit" disabled={loading}>
                {loading ? 'Signing in…' : 'Sign in →'}
              </button>
            </form>

            <div style={{marginTop:28, paddingTop:24, borderTop:'1px solid rgba(255,245,220,0.07)', textAlign:'center'}}>
              <span style={{fontSize:13, color:'rgba(255,245,220,0.3)'}}>Not a restaurant yet? </span>
              <Link href="/#plans" style={{fontSize:13, color:'#F79B3D', fontWeight:600, textDecoration:'none'}}>
                Get started free
              </Link>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}