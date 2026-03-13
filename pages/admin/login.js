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
        await signOut(); toast.error('Access denied. Restaurant accounts only.'); setLoading(false); return;
      }
      toast.success('Welcome back!'); router.push('/admin');
    } catch (err) {
      toast.error(err.code === 'auth/invalid-credential' ? 'Invalid email or password.' : 'Login failed.'); setLoading(false);
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
          @keyframes float  { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-14px)} }
          @keyframes floatB { 0%,100%{transform:translateY(0) rotate(-2deg)} 50%{transform:translateY(-10px) rotate(2deg)} }
          @keyframes floatC { 0%,100%{transform:translateY(0) rotate(1deg)} 50%{transform:translateY(-18px) rotate(-1deg)} }
          @keyframes fadeUp { from{opacity:0;transform:translateY(24px)} to{opacity:1;transform:none} }
          @keyframes blink  { 0%,100%{opacity:1} 50%{opacity:0.2} }
          @keyframes pulse  { 0%,100%{box-shadow:0 0 0 0 rgba(247,155,61,0.4)} 50%{box-shadow:0 0 0 10px rgba(247,155,61,0)} }

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

          .al-form-wrap { animation:fadeUp 0.65s cubic-bezier(0.16,1,0.3,1) both; }

          /* Split: left 60%, right 40% */
          .al-left  { flex:0 0 60%; min-height:100vh; position:relative; border-right:1px solid rgba(255,245,220,0.06); overflow:hidden; }
          .al-right { flex:0 0 40%; min-height:100vh; display:flex; align-items:center; justify-content:center; padding:48px 52px; position:relative; z-index:1; }

          @media(max-width:900px) {
            .al-left  { display:none !important; }
            .al-right { flex:1; }
          }
          @media(min-width:901px) { .al-mobile-logo{ display:none !important; } }
        `}</style>

        {/* Global BG glow */}
        <div style={{position:'fixed', top:'-10%', left:'30%', width:900, height:800, borderRadius:'50%', background:'radial-gradient(ellipse, rgba(247,155,61,0.08) 0%, transparent 60%)', pointerEvents:'none', filter:'blur(70px)'}}/>
        <div style={{position:'fixed', bottom:'-20%', right:'0', width:600, height:600, borderRadius:'50%', background:'radial-gradient(ellipse, rgba(224,90,58,0.06) 0%, transparent 65%)', pointerEvents:'none', filter:'blur(60px)'}}/>
        <div style={{position:'fixed', inset:0, backgroundImage:'linear-gradient(rgba(255,245,220,0.018) 1px, transparent 1px), linear-gradient(90deg, rgba(255,245,220,0.018) 1px, transparent 1px)', backgroundSize:'64px 64px', pointerEvents:'none'}}/>

        {/* ══════════════════════════════════════
            LEFT PANEL
        ══════════════════════════════════════ */}
        <div className="al-left">
          {/* Inner padding container — full height flex column */}
          <div style={{height:'100%', minHeight:'100vh', display:'flex', flexDirection:'column', justifyContent:'space-between', padding:'48px 60px 48px 60px', position:'relative', zIndex:1}}>

            {/* ── TOP: Logo ── */}
            <Link href="/" style={{textDecoration:'none', display:'inline-block'}}>
              <span style={{fontFamily:'Poppins,sans-serif', fontWeight:800, fontSize:18, color:'#FFF5E8'}}>
                Advert <span style={{background:'linear-gradient(135deg,#E05A3A,#F79B3D)', WebkitBackgroundClip:'text', WebkitTextFillColor:'transparent'}}>Radical</span>
              </span>
            </Link>

            {/* ── MIDDLE: Headline + Dashboard ── */}
            <div style={{flex:1, display:'flex', flexDirection:'column', justifyContent:'center', paddingTop:40, paddingBottom:40}}>
              <div style={{fontSize:11, fontWeight:700, color:'rgba(247,155,61,0.55)', letterSpacing:'0.12em', textTransform:'uppercase', marginBottom:14}}>Restaurant Admin Portal</div>
              <h2 style={{fontFamily:'Poppins,sans-serif', fontWeight:900, fontSize:'clamp(30px,3vw,48px)', color:'#FFF5E8', lineHeight:1.08, letterSpacing:'-0.025em', marginBottom:14}}>
                Manage your<br/>
                <span style={{background:'linear-gradient(90deg,#F79B3D,#E05A3A)', WebkitBackgroundClip:'text', WebkitTextFillColor:'transparent'}}>AR menu</span><br/>
                from anywhere.
              </h2>
              <p style={{fontSize:14, color:'rgba(255,245,220,0.38)', lineHeight:1.85, maxWidth:420, marginBottom:32}}>
                Update dishes, track analytics, manage waiter calls, and grow your revenue — all from one dashboard.
              </p>

              {/* ── Dashboard Preview — fills available width ── */}
              <div style={{background:'rgba(255,255,255,0.04)', border:'1px solid rgba(255,245,220,0.07)', borderRadius:22, padding:24, backdropFilter:'blur(16px)', maxWidth:580}}>

                {/* Widget header */}
                <div style={{display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:18}}>
                  <div style={{display:'flex', alignItems:'center', gap:8}}>
                    <div style={{width:8, height:8, borderRadius:'50%', background:'#F79B3D', animation:'blink 2s infinite', animation:'pulse 2s infinite'}}/>
                    <span style={{fontSize:10.5, fontWeight:700, color:'rgba(255,245,220,0.38)', letterSpacing:'0.09em', textTransform:'uppercase'}}>Live Overview</span>
                  </div>
                  <span style={{fontSize:11, color:'rgba(255,245,220,0.2)', fontWeight:500}}>Today · The Spot Restaurant</span>
                </div>

                {/* 3 stat tiles — full width */}
                <div style={{display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:10, marginBottom:16}}>
                  {[
                    {label:'AR Views',  value:'1,240', badge:'+18%', bg:'rgba(247,155,61,0.13)',   bc:'#F79B3D'},
                    {label:'QR Scans',  value:'382',   badge:'+9%',  bg:'rgba(100,185,145,0.1)',   bc:'#6AB090'},
                    {label:'Avg Rating',value:'4.8 ★', badge:'Top',  bg:'rgba(224,90,58,0.1)',     bc:'#E05A3A'},
                  ].map(s => (
                    <div key={s.label} style={{background:s.bg, borderRadius:14, padding:'14px 14px'}}>
                      <div style={{fontSize:9.5, color:'rgba(255,245,220,0.3)', fontWeight:600, marginBottom:5, letterSpacing:'0.04em'}}>{s.label}</div>
                      <div style={{fontSize:20, fontWeight:900, color:'#FFF5E8', fontFamily:'Poppins,sans-serif', letterSpacing:'-0.02em', marginBottom:4}}>{s.value}</div>
                      <div style={{fontSize:10, fontWeight:700, color:s.bc}}>{s.badge}</div>
                    </div>
                  ))}
                </div>

                {/* Bar chart — full width */}
                <div style={{background:'rgba(0,0,0,0.3)', borderRadius:14, padding:'14px 16px', marginBottom:14}}>
                  <div style={{fontSize:9.5, fontWeight:700, color:'rgba(255,245,220,0.22)', letterSpacing:'0.08em', marginBottom:10}}>WEEKLY AR VIEWS</div>
                  <div style={{display:'flex', alignItems:'flex-end', gap:5, height:56}}>
                    {[32, 55, 40, 70, 62, 95, 74].map((h, i) => (
                      <div key={i} style={{
                        flex:1, borderRadius:6, height:`${h}%`,
                        background: i === 5
                          ? 'linear-gradient(0deg,#E05A3A,#F79B3D)'
                          : 'rgba(255,255,255,0.08)',
                        transition:'opacity 0.2s',
                      }}/>
                    ))}
                  </div>
                  <div style={{display:'flex', gap:5, marginTop:7}}>
                    {['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].map((d, i) => (
                      <div key={i} style={{flex:1, textAlign:'center', fontSize:8, color: i===5 ? 'rgba(247,155,61,0.6)' : 'rgba(255,245,220,0.2)', fontWeight:600}}>{d}</div>
                    ))}
                  </div>
                </div>

                {/* Recent activity feed */}
                <div style={{display:'flex', flexDirection:'column', gap:7}}>
                  <div style={{fontSize:9.5, fontWeight:700, color:'rgba(255,245,220,0.22)', letterSpacing:'0.08em', marginBottom:2}}>RECENT ACTIVITY</div>
                  {[
                    {icon:'🔔', text:'Table 4 requested the bill',    time:'2m ago',  dot:'rgba(247,155,61,0.7)'},
                    {icon:'⭐', text:'Chicken Biryani rated 5★',       time:'8m ago',  dot:'rgba(255,210,60,0.7)'},
                    {icon:'🥽', text:'23 AR views on Paneer Tikka',    time:'12m ago', dot:'rgba(100,210,255,0.6)'},
                    {icon:'📊', text:'Daily revenue up ₹2,400 vs avg', time:'1h ago',  dot:'rgba(100,185,145,0.7)'},
                  ].map((a, i) => (
                    <div key={i} style={{display:'flex', alignItems:'center', gap:10, padding:'8px 12px', borderRadius:11, background:'rgba(255,255,255,0.03)', border:'1px solid rgba(255,245,220,0.04)'}}>
                      <span style={{fontSize:14, flexShrink:0}}>{a.icon}</span>
                      <span style={{fontSize:12, color:'rgba(255,245,220,0.45)', flex:1}}>{a.text}</span>
                      <span style={{fontSize:10, color:'rgba(255,245,220,0.18)', flexShrink:0, whiteSpace:'nowrap'}}>{a.time}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* ── BOTTOM: Stats row ── */}
            <div style={{display:'flex', gap:40, paddingTop:24, borderTop:'1px solid rgba(255,245,220,0.06)'}}>
              {[
                {num:'500+',   label:'Restaurants'},
                {num:'↑ 28%', label:'Avg order value'},
                {num:'5 min', label:'Setup time'},
              ].map(s => (
                <div key={s.label}>
                  <div style={{fontFamily:'Poppins,sans-serif', fontWeight:900, fontSize:21, color:'#FFF5E8', letterSpacing:'-0.02em'}}>{s.num}</div>
                  <div style={{fontSize:11, color:'rgba(255,245,220,0.28)', marginTop:3}}>{s.label}</div>
                </div>
              ))}
            </div>
          </div>

          {/* ── Floating food emojis (absolute, inside left panel) ── */}
          <div style={{position:'absolute', top:'22%', right:'5%',  fontSize:58, animation:'float 5.5s ease-in-out infinite',        filter:'drop-shadow(0 10px 28px rgba(0,0,0,0.55))', pointerEvents:'none', zIndex:2}}>🍛</div>
          <div style={{position:'absolute', top:'10%', right:'18%', fontSize:38, animation:'floatB 7s ease-in-out 1.2s infinite',     filter:'drop-shadow(0 6px 18px rgba(0,0,0,0.45))', opacity:0.75, pointerEvents:'none', zIndex:2}}>🍕</div>
          <div style={{position:'absolute', top:'52%', right:'3%',  fontSize:44, animation:'floatC 6.5s ease-in-out 0.5s infinite',   filter:'drop-shadow(0 8px 22px rgba(0,0,0,0.45))', opacity:0.6,  pointerEvents:'none', zIndex:2}}>🍢</div>
          <div style={{position:'absolute', top:'68%', right:'20%', fontSize:34, animation:'float 8s ease-in-out 2.5s infinite',      filter:'drop-shadow(0 6px 16px rgba(0,0,0,0.4))',  opacity:0.45, pointerEvents:'none', zIndex:2}}>🥘</div>
        </div>

        {/* ══════════════════════════════════════
            RIGHT PANEL — Form
        ══════════════════════════════════════ */}
        <div className="al-right">
          <div className="al-form-wrap" style={{width:'100%', maxWidth:380}}>

            {/* Mobile-only logo */}
            <div className="al-mobile-logo" style={{marginBottom:32}}>
              <Link href="/" style={{textDecoration:'none'}}>
                <span style={{fontFamily:'Poppins,sans-serif', fontWeight:800, fontSize:18, color:'#FFF5E8'}}>
                  Advert <span style={{background:'linear-gradient(135deg,#E05A3A,#F79B3D)', WebkitBackgroundClip:'text', WebkitTextFillColor:'transparent'}}>Radical</span>
                </span>
              </Link>
            </div>

            <div style={{marginBottom:36}}>
              <h1 style={{fontFamily:'Poppins,sans-serif', fontWeight:800, fontSize:28, color:'#FFF5E8', letterSpacing:'-0.02em', marginBottom:8}}>Welcome back</h1>
              <p style={{fontSize:14, color:'rgba(255,245,220,0.4)', lineHeight:1.65}}>Sign in to your restaurant admin account.</p>
            </div>

            <form onSubmit={handleSubmit}>
              <div style={{marginBottom:16}}>
                <label style={{display:'block', fontSize:11, fontWeight:700, color:'rgba(255,245,220,0.36)', marginBottom:8, letterSpacing:'0.08em', textTransform:'uppercase'}}>Email address</label>
                <input className="al-input" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="your@restaurant.com" required/>
              </div>
              <div style={{marginBottom:32}}>
                <label style={{display:'block', fontSize:11, fontWeight:700, color:'rgba(255,245,220,0.36)', marginBottom:8, letterSpacing:'0.08em', textTransform:'uppercase'}}>Password</label>
                <input className="al-input" type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••" required/>
              </div>
              <button className="al-btn" type="submit" disabled={loading}>
                {loading ? 'Signing in…' : 'Sign in →'}
              </button>
            </form>

            <div style={{marginTop:28, paddingTop:24, borderTop:'1px solid rgba(255,245,220,0.07)', textAlign:'center'}}>
              <span style={{fontSize:13, color:'rgba(255,245,220,0.3)'}}>Not a restaurant yet? </span>
              <Link href="/#plans" style={{fontSize:13, color:'#F79B3D', fontWeight:600, textDecoration:'none'}}>Get started free</Link>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}