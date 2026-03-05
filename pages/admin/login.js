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
  const { signIn, signOut }     = useAuth();
  const router                  = useRouter();

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!email || !password) return;
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
      <Head><title>Restaurant Login — Advert Radical</title></Head>
      <div style={{minHeight:'100vh',background:'#F5F4F0',fontFamily:'Inter,sans-serif',display:'flex',alignItems:'center',justifyContent:'center',padding:'20px'}}>
        <style>{`
          .inp{width:100%;padding:12px 16px;background:#fff;border:1.5px solid #E2DED8;border-radius:12px;font-size:14px;color:#1C1917;outline:none;transition:border-color 0.15s;font-family:Inter,sans-serif;}
          .inp:focus{border-color:#FF6B35;box-shadow:0 0 0 3px rgba(255,107,53,0.1);}
          .inp::placeholder{color:#A09890;}
          .lbl{display:block;font-size:12px;font-weight:600;color:#6B6460;margin-bottom:6px;letter-spacing:0.02em;}
        `}</style>

        {/* Background decoration */}
        <div style={{position:'fixed',top:'-20%',right:'-10%',width:500,height:500,borderRadius:'50%',background:'radial-gradient(circle,rgba(255,107,53,0.08),transparent 70%)',pointerEvents:'none'}} />
        <div style={{position:'fixed',bottom:'-10%',left:'-5%',width:400,height:400,borderRadius:'50%',background:'radial-gradient(circle,rgba(255,179,71,0.06),transparent 70%)',pointerEvents:'none'}} />

        <div style={{width:'100%',maxWidth:380,position:'relative'}}>
          {/* Logo */}
          <div style={{textAlign:'center',marginBottom:32}}>
            <Link href="/" style={{textDecoration:'none'}}>
              <div style={{fontFamily:'"Plus Jakarta Sans",sans-serif',fontWeight:800,fontSize:26,color:'#1C1917',display:'inline-block'}}>
                Advert <span style={{background:'linear-gradient(135deg,#FF6B35,#FFB347)',WebkitBackgroundClip:'text',WebkitTextFillColor:'transparent'}}>Radical</span>
              </div>
            </Link>
            <div style={{fontSize:13,color:'#A09890',marginTop:6}}>Restaurant Admin Portal</div>
          </div>

          {/* Card */}
          <div style={{background:'#fff',borderRadius:20,padding:32,boxShadow:'0 4px 24px rgba(0,0,0,0.07)',border:'1px solid #E2DED8'}}>
            <h1 style={{fontFamily:'"Plus Jakarta Sans",sans-serif',fontWeight:700,fontSize:22,color:'#1C1917',marginBottom:24}}>Sign in</h1>

            <form onSubmit={handleSubmit}>
              <div style={{marginBottom:16}}>
                <label className="lbl">Email address</label>
                <input className="inp" type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="your@restaurant.com" required />
              </div>
              <div style={{marginBottom:24}}>
                <label className="lbl">Password</label>
                <input className="inp" type="password" value={password} onChange={e=>setPassword(e.target.value)} placeholder="••••••••" required />
              </div>
              <button type="submit" disabled={loading} style={{width:'100%',padding:'13px',borderRadius:12,border:'none',background:loading?'#E2DED8':'linear-gradient(135deg,#FF6B35,#FFB347)',color:loading?'#A09890':'#fff',fontFamily:'"Plus Jakarta Sans",sans-serif',fontWeight:700,fontSize:15,cursor:loading?'not-allowed':'pointer',boxShadow:loading?'none':'0 4px 16px rgba(255,107,53,0.3)',transition:'all 0.2s'}}>
                {loading ? 'Signing in…' : 'Sign in →'}
              </button>
            </form>
          </div>

          <p style={{textAlign:'center',fontSize:13,color:'#A09890',marginTop:20}}>
            Not a restaurant yet?{' '}
            <Link href="/#plans" style={{color:'#FF6B35',textDecoration:'none',fontWeight:600}}>Get started</Link>
          </p>
        </div>
      </div>
    </>
  );
}
