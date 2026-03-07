import Head from 'next/head';
import Link from 'next/link';
import { useState } from 'react';
import { useRouter } from 'next/router';
import { useAuth } from '../../hooks/useAuth';
import { getUserData } from '../../lib/db';
import toast from 'react-hot-toast';

const G = { bg:'#08090C', card:'#0D0E12', border:'rgba(255,255,255,0.07)', gold:'#B8962E', text:'rgba(255,255,255,0.82)', textDim:'rgba(255,255,255,0.32)' };

export default function AdminLogin() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const { signIn, signOut } = useAuth();
  const router = useRouter();

  const handleSubmit = async (e) => {
    e.preventDefault?.();
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
      <Head><title>Restaurant Login — Advert Radical</title></Head>
      <div style={{minHeight:'100vh',background:G.bg,fontFamily:`'Bricolage Grotesque',Inter,sans-serif`,display:'flex',alignItems:'center',justifyContent:'center',padding:20,position:'relative',overflow:'hidden'}}>
        <style>{`
          @import url('https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..60,400;12..60,500;12..60,600;12..60,700;12..60,800&family=DM+Mono:wght@400;500&display=swap');
          @keyframes spin{to{transform:rotate(360deg)}}
          *{box-sizing:border-box}
          .lci{width:100%;padding:12px 16px;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.09);border-radius:8px;font-size:14px;color:rgba(255,255,255,0.82);outline:none;transition:all 0.2s;font-family:inherit;}
          .lci:focus{border-color:rgba(184,150,46,0.5);background:rgba(255,255,255,0.06);box-shadow:0 0 0 3px rgba(184,150,46,0.08);}
          .lci::placeholder{color:rgba(255,255,255,0.2);}
        `}</style>

        {/* Ambient glow */}
        <div style={{position:'fixed',top:'30%',left:'50%',transform:'translateX(-50%)',width:500,height:500,borderRadius:'50%',background:'radial-gradient(circle,rgba(184,150,46,0.05) 0%,transparent 70%)',pointerEvents:'none'}}/>

        <div style={{width:'100%',maxWidth:380,position:'relative',zIndex:1}}>
          <div style={{textAlign:'center',marginBottom:36}}>
            <Link href="/" style={{textDecoration:'none'}}>
              <div style={{fontWeight:800,fontSize:22,color:'rgba(255,255,255,0.88)',letterSpacing:'-0.02em'}}>
                Advert <span style={{color:G.gold}}>Radical</span>
              </div>
            </Link>
            <div style={{fontSize:12,color:G.textDim,marginTop:8,letterSpacing:'0.06em',textTransform:'uppercase',fontFamily:`'DM Mono',monospace`}}>Restaurant Portal</div>
          </div>

          <div style={{background:G.card,border:`1px solid ${G.border}`,borderRadius:16,padding:32,boxShadow:'0 32px 64px rgba(0,0,0,0.5)'}}>
            <div style={{height:1,background:`linear-gradient(90deg,transparent,${G.gold}44,transparent)`,marginBottom:28}}/>
            <h1 style={{fontWeight:700,fontSize:22,color:'rgba(255,255,255,0.88)',margin:'0 0 24px',letterSpacing:'-0.02em'}}>Sign in</h1>

            <div style={{marginBottom:16}}>
              <label style={{display:'block',fontSize:11,fontWeight:600,color:G.textDim,marginBottom:7,letterSpacing:'0.08em',textTransform:'uppercase',fontFamily:`'DM Mono',monospace`}}>Email</label>
              <input className="lci" type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="your@restaurant.com"/>
            </div>
            <div style={{marginBottom:28}}>
              <label style={{display:'block',fontSize:11,fontWeight:600,color:G.textDim,marginBottom:7,letterSpacing:'0.08em',textTransform:'uppercase',fontFamily:`'DM Mono',monospace`}}>Password</label>
              <input className="lci" type="password" value={password} onChange={e=>setPassword(e.target.value)} placeholder="••••••••"/>
            </div>
            <button onClick={handleSubmit} disabled={loading} style={{width:'100%',padding:'13px',borderRadius:8,border:`1px solid rgba(184,150,46,${loading?'0.15':'0.35'})`,background:loading?'transparent':'rgba(184,150,46,0.1)',color:loading?G.textDim:G.gold,fontFamily:'inherit',fontWeight:700,fontSize:14,cursor:loading?'not-allowed':'pointer',transition:'all 0.2s',letterSpacing:'0.02em'}}>
              {loading ? 'Signing in…' : 'Sign in →'}
            </button>
          </div>

          <p style={{textAlign:'center',fontSize:13,color:G.textDim,marginTop:20}}>
            Not a restaurant yet?{' '}
            <Link href="/#plans" style={{color:G.gold,textDecoration:'none',fontWeight:600}}>Get started</Link>
          </p>
        </div>
      </div>
    </>
  );
}
