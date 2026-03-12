import Head from 'next/head';
import Link from 'next/link';
import { useState } from 'react';
import { useRouter } from 'next/router';
import { useAuth } from '../../hooks/useAuth';
import { getUserData } from '../../lib/db';
import toast from 'react-hot-toast';

export default function AdminLogin() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
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
          @keyframes float { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-12px)} }
          @keyframes pulse { 0%,100%{box-shadow:0 0 0 0 rgba(247,155,61,0.3)} 50%{box-shadow:0 0 0 10px rgba(247,155,61,0)} }
          @keyframes fadeUp { from{opacity:0;transform:translateY(20px)} to{opacity:1;transform:none} }

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
            width:100%; padding:15px;
            border-radius:12px; border:none;
            background:linear-gradient(135deg,#E05A3A,#F79B3D);
            color:#fff; font-family:Poppins,sans-serif;
            font-weight:700; font-size:15px; cursor:pointer;
            box-shadow:0 8px 24px rgba(224,90,58,0.4);
            transition:all 0.2s; letter-spacing:0.01em;
          }
          .al-btn:hover:not(:disabled) { transform:translateY(-2px); box-shadow:0 14px 32px rgba(224,90,58,0.5); }
          .al-btn:disabled { opacity:0.45; cursor:not-allowed; transform:none; box-shadow:none; }

          .al-card { animation:fadeUp 0.6s cubic-bezier(0.16,1,0.3,1) both; }
        `}</style>

        {/* Background glow */}
        <div style={{position:'fixed', top:'-20%', left:'50%', transform:'translateX(-50%)', width:700, height:600, borderRadius:'50%', background:'radial-gradient(ellipse, rgba(247,155,61,0.08) 0%, transparent 65%)', pointerEvents:'none', filter:'blur(40px)'}}/>
        <div style={{position:'fixed', bottom:'-15%', right:'-10%', width:500, height:500, borderRadius:'50%', background:'radial-gradient(ellipse, rgba(224,90,58,0.06) 0%, transparent 65%)', pointerEvents:'none', filter:'blur(60px)'}}/>

        {/* Subtle grid */}
        <div style={{position:'fixed', inset:0, backgroundImage:'linear-gradient(rgba(255,245,220,0.02) 1px, transparent 1px), linear-gradient(90deg, rgba(255,245,220,0.02) 1px, transparent 1px)', backgroundSize:'64px 64px', pointerEvents:'none'}}/>

        {/* Left panel — decorative */}
        <div style={{flex:1, display:'flex', flexDirection:'column', justifyContent:'space-between', padding:'48px 56px', borderRight:'1px solid rgba(255,245,220,0.06)', position:'relative', overflow:'hidden', minWidth:0}}>
          {/* Left panel is hidden on small screens — handled via CSS below */}
          <style>{`@media(max-width:820px){.al-left{display:none!important}}`}</style>
          <div className="al-left" style={{display:'flex', flexDirection:'column', justifyContent:'space-between', height:'100%', position:'relative', zIndex:1}}>
            {/* Logo */}
            <Link href="/" style={{textDecoration:'none'}}>
              <span style={{fontFamily:'Poppins,sans-serif', fontWeight:800, fontSize:18, color:'#FFF5E8'}}>
                Advert <span style={{background:'linear-gradient(135deg,#E05A3A,#F79B3D)', WebkitBackgroundClip:'text', WebkitTextFillColor:'transparent'}}>Radical</span>
              </span>
            </Link>

            {/* Center content */}
            <div>
              <div style={{fontSize:11, fontWeight:700, color:'rgba(247,155,61,0.6)', letterSpacing:'0.1em', textTransform:'uppercase', marginBottom:20}}>Restaurant Admin Portal</div>
              <h2 style={{fontFamily:'Poppins,sans-serif', fontWeight:900, fontSize:'clamp(32px,3vw,48px)', color:'#FFF5E8', lineHeight:1.1, letterSpacing:'-0.025em', marginBottom:20}}>
                Manage your<br/>
                <span style={{background:'linear-gradient(90deg,#F79B3D,#E05A3A)', WebkitBackgroundClip:'text', WebkitTextFillColor:'transparent'}}>AR menu</span><br/>
                from anywhere.
              </h2>
              <p style={{fontSize:15, color:'rgba(255,245,220,0.42)', lineHeight:1.8, maxWidth:340}}>
                Access your dashboard to update dishes, view analytics, manage waiter calls, and more.
              </p>
            </div>

            {/* Bottom stats */}
            <div style={{display:'flex', gap:40}}>
              {[
                {num:'500+', label:'Restaurants'},
                {num:'↑ 28%', label:'Avg order value'},
                {num:'5 min', label:'Setup time'},
              ].map(s => (
                <div key={s.label}>
                  <div style={{fontFamily:'Poppins,sans-serif', fontWeight:900, fontSize:22, color:'#FFF5E8', letterSpacing:'-0.02em'}}>{s.num}</div>
                  <div style={{fontSize:12, color:'rgba(255,245,220,0.35)', marginTop:3}}>{s.label}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Floating food emojis */}
          <div style={{position:'absolute', bottom:'20%', right:'15%', fontSize:52, animation:'float 5s ease-in-out infinite', filter:'drop-shadow(0 8px 24px rgba(0,0,0,0.5))'}}>🍛</div>
          <div style={{position:'absolute', top:'30%', right:'8%', fontSize:40, animation:'float 7s ease-in-out 1s infinite', filter:'drop-shadow(0 6px 18px rgba(0,0,0,0.4))'}}>🍕</div>
          <div style={{position:'absolute', bottom:'42%', left:'8%', fontSize:36, animation:'float 6s ease-in-out 2s infinite', opacity:0.4}}>🍢</div>
        </div>

        {/* Right panel — form */}
        <div style={{width:'100%', maxWidth:520, display:'flex', flexDirection:'column', justifyContent:'center', padding:'48px 56px', position:'relative', zIndex:1}}>
          <div className="al-card">
            {/* Mobile logo only */}
            <style>{`@media(min-width:821px){.al-mobile-logo{display:none!important}}`}</style>
            <div className="al-mobile-logo" style={{marginBottom:32}}>
              <Link href="/" style={{textDecoration:'none'}}>
                <span style={{fontFamily:'Poppins,sans-serif', fontWeight:800, fontSize:18, color:'#FFF5E8'}}>
                  Advert <span style={{background:'linear-gradient(135deg,#E05A3A,#F79B3D)', WebkitBackgroundClip:'text', WebkitTextFillColor:'transparent'}}>Radical</span>
                </span>
              </Link>
            </div>

            <div style={{marginBottom:36}}>
              <h1 style={{fontFamily:'Poppins,sans-serif', fontWeight:800, fontSize:28, color:'#FFF5E8', letterSpacing:'-0.02em', marginBottom:8}}>Welcome back</h1>
              <p style={{fontSize:14, color:'rgba(255,245,220,0.42)', lineHeight:1.6}}>Sign in to your restaurant admin account.</p>
            </div>

            <div onSubmit={handleSubmit}>
              <div style={{marginBottom:16}}>
                <label style={{display:'block', fontSize:11, fontWeight:700, color:'rgba(255,245,220,0.4)', marginBottom:8, letterSpacing:'0.07em', textTransform:'uppercase'}}>Email address</label>
                <input
                  className="al-input" type="email"
                  value={email} onChange={e => setEmail(e.target.value)}
                  placeholder="your@restaurant.com" required
                />
              </div>

              <div style={{marginBottom:32}}>
                <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:8}}>
                  <label style={{fontSize:11, fontWeight:700, color:'rgba(255,245,220,0.4)', letterSpacing:'0.07em', textTransform:'uppercase'}}>Password</label>
                </div>
                <input
                  className="al-input" type="password"
                  value={password} onChange={e => setPassword(e.target.value)}
                  placeholder="••••••••" required
                />
              </div>

              <button className="al-btn" onClick={handleSubmit} disabled={loading}>
                {loading ? 'Signing in…' : 'Sign in →'}
              </button>
            </div>

            <div style={{marginTop:28, paddingTop:24, borderTop:'1px solid rgba(255,245,220,0.07)', textAlign:'center'}}>
              <span style={{fontSize:13, color:'rgba(255,245,220,0.35)'}}>Not a restaurant yet?{' '}</span>
              <Link href="/#plans" style={{fontSize:13, color:'#F79B3D', fontWeight:600, textDecoration:'none'}}>Get started free</Link>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}