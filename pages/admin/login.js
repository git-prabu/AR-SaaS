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
      <Head><title>Sign In — Advert Radical</title></Head>
      <div style={{minHeight:'100vh', background:'#0C0A08', fontFamily:'Inter,sans-serif', display:'flex', position:'relative', overflow:'hidden'}}>
        <style>{`
          @keyframes fadeUp { from{opacity:0;transform:translateY(20px)} to{opacity:1;transform:none} }
          @keyframes blink  { 0%,100%{opacity:1} 50%{opacity:0.25} }

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
          .al-input::placeholder { color:rgba(255,245,220,0.22); }

          .al-btn {
            width:100%; padding:15px; border-radius:12px; border:none;
            background:linear-gradient(135deg,#E05A3A,#F79B3D);
            color:#fff; font-family:Poppins,sans-serif;
            font-weight:700; font-size:15px; cursor:pointer;
            box-shadow:0 8px 24px rgba(224,90,58,0.4);
            transition:all 0.2s;
          }
          .al-btn:hover:not(:disabled) { transform:translateY(-2px); box-shadow:0 14px 32px rgba(224,90,58,0.5); }
          .al-btn:disabled { opacity:0.45; cursor:not-allowed; transform:none; box-shadow:none; }

          .al-card { animation:fadeUp 0.6s cubic-bezier(0.16,1,0.3,1) both; }
          @media(max-width:860px){ .al-left{ display:none !important; } }
          @media(min-width:861px){ .al-mobile-logo{ display:none !important; } }
        `}</style>

        {/* BG glows */}
        <div style={{position:'fixed', top:'-15%', left:'25%', width:800, height:700, borderRadius:'50%', background:'radial-gradient(ellipse, rgba(247,155,61,0.07) 0%, transparent 65%)', pointerEvents:'none', filter:'blur(60px)'}}/>
        <div style={{position:'fixed', bottom:'-20%', right:'-5%', width:500, height:500, borderRadius:'50%', background:'radial-gradient(ellipse, rgba(224,90,58,0.05) 0%, transparent 65%)', pointerEvents:'none', filter:'blur(60px)'}}/>
        <div style={{position:'fixed', inset:0, backgroundImage:'linear-gradient(rgba(255,245,220,0.018) 1px, transparent 1px), linear-gradient(90deg, rgba(255,245,220,0.018) 1px, transparent 1px)', backgroundSize:'64px 64px', pointerEvents:'none'}}/>

        {/* ── LEFT PANEL ── */}
        <div className="al-left" style={{flex:1, display:'flex', flexDirection:'column', justifyContent:'space-between', padding:'52px 56px', borderRight:'1px solid rgba(255,245,220,0.06)', position:'relative', overflow:'hidden', minWidth:0, zIndex:1}}>

          {/* Top — Logo */}
          <Link href="/" style={{textDecoration:'none', display:'inline-block'}}>
            <span style={{fontFamily:'Poppins,sans-serif', fontWeight:800, fontSize:18, color:'#FFF5E8'}}>
              Advert <span style={{background:'linear-gradient(135deg,#E05A3A,#F79B3D)', WebkitBackgroundClip:'text', WebkitTextFillColor:'transparent'}}>Radical</span>
            </span>
          </Link>

          {/* Middle — Headline + Dashboard widget */}
          <div>
            <div style={{fontSize:11, fontWeight:700, color:'rgba(247,155,61,0.55)', letterSpacing:'0.1em', textTransform:'uppercase', marginBottom:14}}>Restaurant Admin Portal</div>
            <h2 style={{fontFamily:'Poppins,sans-serif', fontWeight:900, fontSize:'clamp(26px,2.6vw,42px)', color:'#FFF5E8', lineHeight:1.1, letterSpacing:'-0.025em', marginBottom:14}}>
              Manage your<br/>
              <span style={{background:'linear-gradient(90deg,#F79B3D,#E05A3A)', WebkitBackgroundClip:'text', WebkitTextFillColor:'transparent'}}>AR menu</span><br/>
              from anywhere.
            </h2>
            <p style={{fontSize:14, color:'rgba(255,245,220,0.38)', lineHeight:1.8, maxWidth:360, marginBottom:28}}>
              Update dishes, track analytics, manage waiter calls, and grow your revenue — all from one place.
            </p>

            {/* Dashboard Preview Card */}
            <div style={{background:'rgba(255,255,255,0.035)', border:'1px solid rgba(255,245,220,0.08)', borderRadius:20, padding:20, maxWidth:420, backdropFilter:'blur(16px)'}}>

              {/* Header row */}
              <div style={{display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:14}}>
                <div style={{display:'flex', alignItems:'center', gap:7}}>
                  <div style={{width:7, height:7, borderRadius:'50%', background:'#F79B3D', animation:'blink 2s infinite'}}/>
                  <span style={{fontSize:10, fontWeight:700, color:'rgba(255,245,220,0.4)', letterSpacing:'0.08em', textTransform:'uppercase'}}>Live Overview</span>
                </div>
                <span style={{fontSize:10, color:'rgba(255,245,220,0.22)'}}>Today</span>
              </div>

              {/* 3 stat tiles */}
              <div style={{display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:8, marginBottom:14}}>
                {[
                  {label:'AR Views', value:'1,240', badge:'+18%', bg:'rgba(247,155,61,0.12)', bc:'#F79B3D'},
                  {label:'Scans',    value:'382',   badge:'+9%',  bg:'rgba(100,180,140,0.1)', bc:'#6AB090'},
                  {label:'Rating',   value:'4.8★',  badge:'Top', bg:'rgba(224,90,58,0.1)',   bc:'#E05A3A'},
                ].map(s => (
                  <div key={s.label} style={{background:s.bg, borderRadius:12, padding:'10px 11px'}}>
                    <div style={{fontSize:9, color:'rgba(255,245,220,0.32)', fontWeight:600, marginBottom:4, letterSpacing:'0.04em'}}>{s.label}</div>
                    <div style={{fontSize:14, fontWeight:900, color:'#FFF5E8', fontFamily:'Poppins,sans-serif', marginBottom:3}}>{s.value}</div>
                    <div style={{fontSize:9, fontWeight:700, color:s.bc}}>{s.badge}</div>
                  </div>
                ))}
              </div>

              {/* Mini bar chart */}
              <div style={{background:'rgba(0,0,0,0.28)', borderRadius:12, padding:'12px 14px', marginBottom:12}}>
                <div style={{fontSize:9, fontWeight:700, color:'rgba(255,245,220,0.25)', letterSpacing:'0.06em', marginBottom:8}}>WEEKLY AR VIEWS</div>
                <div style={{display:'flex', alignItems:'flex-end', gap:4, height:44}}>
                  {[32, 55, 40, 70, 62, 88, 74].map((h, i) => (
                    <div key={i} style={{flex:1, borderRadius:4, height:`${h}%`, background: i===5 ? 'linear-gradient(0deg,#F79B3D,#E05A3A)' : 'rgba(255,255,255,0.09)'}}/>
                  ))}
                </div>
                <div style={{display:'flex', gap:4, marginTop:5}}>
                  {['M','T','W','T','F','S','S'].map((d,i) => (
                    <div key={i} style={{flex:1, textAlign:'center', fontSize:8, color:'rgba(255,245,220,0.22)', fontWeight:600}}>{d}</div>
                  ))}
                </div>
              </div>

              {/* Recent activity */}
              <div style={{display:'flex', flexDirection:'column', gap:6}}>
                {[
                  {icon:'🔔', text:'Table 4 requested the bill', time:'2m ago'},
                  {icon:'⭐', text:'Chicken Biryani rated 5★',   time:'8m ago'},
                  {icon:'🥽', text:'23 AR views on Paneer Tikka', time:'12m ago'},
                ].map((a,i) => (
                  <div key={i} style={{display:'flex', alignItems:'center', gap:9, padding:'7px 10px', borderRadius:10, background:'rgba(255,255,255,0.025)'}}>
                    <span style={{fontSize:13, flexShrink:0}}>{a.icon}</span>
                    <span style={{fontSize:11, color:'rgba(255,245,220,0.42)', flex:1, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap'}}>{a.text}</span>
                    <span style={{fontSize:10, color:'rgba(255,245,220,0.18)', flexShrink:0}}>{a.time}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Bottom — Stats */}
          <div style={{display:'flex', gap:36, paddingTop:24, borderTop:'1px solid rgba(255,245,220,0.06)'}}>
            {[
              {num:'500+', label:'Restaurants'},
              {num:'↑ 28%', label:'Avg order value'},
              {num:'5 min', label:'Setup time'},
            ].map(s => (
              <div key={s.label}>
                <div style={{fontFamily:'Poppins,sans-serif', fontWeight:900, fontSize:20, color:'#FFF5E8', letterSpacing:'-0.02em'}}>{s.num}</div>
                <div style={{fontSize:11, color:'rgba(255,245,220,0.3)', marginTop:3}}>{s.label}</div>
              </div>
            ))}
          </div>
        </div>

        {/* ── RIGHT PANEL — form ── */}
        <div style={{width:'100%', maxWidth:500, display:'flex', flexDirection:'column', justifyContent:'center', padding:'48px 52px', position:'relative', zIndex:1}}>
          <div className="al-card">

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
              <p style={{fontSize:14, color:'rgba(255,245,220,0.42)', lineHeight:1.65}}>Sign in to your restaurant admin account.</p>
            </div>

            <div onSubmit={handleSubmit}>
              <div style={{marginBottom:16}}>
                <label style={{display:'block', fontSize:11, fontWeight:700, color:'rgba(255,245,220,0.38)', marginBottom:8, letterSpacing:'0.07em', textTransform:'uppercase'}}>Email address</label>
                <input className="al-input" type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="your@restaurant.com" required/>
              </div>
              <div style={{marginBottom:32}}>
                <label style={{display:'block', fontSize:11, fontWeight:700, color:'rgba(255,245,220,0.38)', marginBottom:8, letterSpacing:'0.07em', textTransform:'uppercase'}}>Password</label>
                <input className="al-input" type="password" value={password} onChange={e=>setPassword(e.target.value)} placeholder="••••••••" required/>
              </div>
              <button className="al-btn" onClick={handleSubmit} disabled={loading}>
                {loading ? 'Signing in…' : 'Sign in →'}
              </button>
            </div>

            <div style={{marginTop:28, paddingTop:24, borderTop:'1px solid rgba(255,245,220,0.07)', textAlign:'center'}}>
              <span style={{fontSize:13, color:'rgba(255,245,220,0.32)'}}>Not a restaurant yet? </span>
              <Link href="/#plans" style={{fontSize:13, color:'#F79B3D', fontWeight:600, textDecoration:'none'}}>Get started free</Link>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}