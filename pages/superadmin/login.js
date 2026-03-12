import Head from 'next/head';
import Link from 'next/link';
import { useState } from 'react';
import { useRouter } from 'next/router';
import { useAuth } from '../../hooks/useAuth';
import { getUserData } from '../../lib/db';
import toast from 'react-hot-toast';

export default function SuperAdminLogin() {
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
      if (!userData || userData.role !== 'superadmin') {
        await signOut(); toast.error('Access denied.'); setLoading(false); return;
      }
      toast.success('Welcome, Admin!'); router.push('/superadmin');
    } catch (err) {
      toast.error(err.code === 'auth/invalid-credential' ? 'Invalid email or password.' : 'Login failed.'); setLoading(false);
    }
  };

  return (
    <>
      <Head><title>Super Admin — Advert Radical</title></Head>
      <div style={{minHeight:'100vh', background:'#080608', fontFamily:'Inter,sans-serif', display:'flex', alignItems:'center', justifyContent:'center', padding:24, position:'relative', overflow:'hidden'}}>
        <style>{`
          @keyframes fadeUp { from{opacity:0;transform:translateY(20px)} to{opacity:1;transform:none} }
          @keyframes spin   { to{transform:rotate(360deg)} }

          .sa-input {
            width:100%; padding:14px 16px;
            background:rgba(255,50,50,0.04);
            border:1.5px solid rgba(255,100,100,0.12);
            border-radius:12px; font-size:14px;
            color:#FFF5E8; outline:none;
            transition:all 0.2s; font-family:Inter,sans-serif;
          }
          .sa-input:focus {
            border-color:rgba(220,50,50,0.45);
            background:rgba(255,50,50,0.07);
            box-shadow:0 0 0 4px rgba(220,50,50,0.1);
          }
          .sa-input::placeholder { color:rgba(255,245,220,0.18); }

          .sa-btn {
            width:100%; padding:15px;
            border-radius:12px; border:none;
            background:linear-gradient(135deg,#C02020,#E03030);
            color:#fff; font-family:Poppins,sans-serif;
            font-weight:700; font-size:15px; cursor:pointer;
            box-shadow:0 8px 24px rgba(200,30,30,0.4);
            transition:all 0.2s; letter-spacing:0.01em;
          }
          .sa-btn:hover:not(:disabled) { transform:translateY(-2px); box-shadow:0 14px 32px rgba(200,30,30,0.5); }
          .sa-btn:disabled { opacity:0.4; cursor:not-allowed; transform:none; box-shadow:none; }

          .sa-card { animation:fadeUp 0.6s cubic-bezier(0.16,1,0.3,1) both; }
        `}</style>

        {/* Background glows */}
        <div style={{position:'fixed', top:'-20%', left:'50%', transform:'translateX(-50%)', width:600, height:600, borderRadius:'50%', background:'radial-gradient(ellipse, rgba(180,20,20,0.1) 0%, transparent 65%)', pointerEvents:'none', filter:'blur(50px)'}}/>
        <div style={{position:'fixed', bottom:'-20%', right:'-10%', width:500, height:500, borderRadius:'50%', background:'radial-gradient(ellipse, rgba(100,10,10,0.08) 0%, transparent 65%)', pointerEvents:'none', filter:'blur(60px)'}}/>

        {/* Grid texture */}
        <div style={{position:'fixed', inset:0, backgroundImage:'linear-gradient(rgba(255,50,50,0.02) 1px, transparent 1px), linear-gradient(90deg, rgba(255,50,50,0.02) 1px, transparent 1px)', backgroundSize:'64px 64px', pointerEvents:'none'}}/>

        <div className="sa-card" style={{width:'100%', maxWidth:420, position:'relative', zIndex:1}}>

          {/* Logo */}
          <div style={{textAlign:'center', marginBottom:40}}>
            <Link href="/" style={{textDecoration:'none', display:'inline-block', marginBottom:16}}>
              <span style={{fontFamily:'Poppins,sans-serif', fontWeight:800, fontSize:18, color:'#FFF5E8'}}>
                Advert <span style={{background:'linear-gradient(135deg,#E05A3A,#F79B3D)', WebkitBackgroundClip:'text', WebkitTextFillColor:'transparent'}}>Radical</span>
              </span>
            </Link>
            {/* Access badge */}
            <div style={{display:'inline-flex', alignItems:'center', gap:7, padding:'5px 14px', borderRadius:30, background:'rgba(200,30,30,0.12)', border:'1px solid rgba(200,30,30,0.25)', fontSize:11, fontWeight:700, color:'rgba(255,100,100,0.8)', letterSpacing:'0.08em', textTransform:'uppercase'}}>
              <span style={{width:6, height:6, borderRadius:'50%', background:'#E03030', display:'inline-block'}}/>
              Restricted Access
            </div>
          </div>

          {/* Card */}
          <div style={{background:'rgba(255,255,255,0.03)', border:'1.5px solid rgba(255,100,100,0.1)', borderRadius:24, padding:40, backdropFilter:'blur(20px)', boxShadow:'0 32px 80px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.04)'}}>
            <div style={{marginBottom:32}}>
              <h1 style={{fontFamily:'Poppins,sans-serif', fontWeight:800, fontSize:26, color:'#FFF5E8', letterSpacing:'-0.02em', marginBottom:8}}>Super Admin</h1>
              <p style={{fontSize:13.5, color:'rgba(255,245,220,0.35)', lineHeight:1.65}}>Internal access only. Unauthorized login attempts are logged.</p>
            </div>

            <div onSubmit={handleSubmit}>
              <div style={{marginBottom:14}}>
                <label style={{display:'block', fontSize:10.5, fontWeight:700, color:'rgba(255,245,220,0.35)', marginBottom:7, letterSpacing:'0.07em', textTransform:'uppercase'}}>Email</label>
                <input
                  className="sa-input" type="email"
                  value={email} onChange={e => setEmail(e.target.value)}
                  placeholder="admin@advertradical.com" required
                />
              </div>

              <div style={{marginBottom:32}}>
                <label style={{display:'block', fontSize:10.5, fontWeight:700, color:'rgba(255,245,220,0.35)', marginBottom:7, letterSpacing:'0.07em', textTransform:'uppercase'}}>Password</label>
                <input
                  className="sa-input" type="password"
                  value={password} onChange={e => setPassword(e.target.value)}
                  placeholder="••••••••" required
                />
              </div>

              <button className="sa-btn" onClick={handleSubmit} disabled={loading}>
                {loading ? 'Verifying…' : 'Access Dashboard →'}
              </button>
            </div>
          </div>

          <div style={{textAlign:'center', marginTop:20}}>
            <Link href="/" style={{fontSize:12, color:'rgba(255,245,220,0.2)', textDecoration:'none', transition:'color 0.15s'}}
              onMouseOver={e=>e.currentTarget.style.color='rgba(255,245,220,0.45)'}
              onMouseOut={e=>e.currentTarget.style.color='rgba(255,245,220,0.2)'}>
              ← Back to homepage
            </Link>
          </div>
        </div>
      </div>
    </>
  );
}