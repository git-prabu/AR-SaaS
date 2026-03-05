import Head from 'next/head';
import Link from 'next/link';
import { useState } from 'react';
import { useRouter } from 'next/router';
import { useAuth } from '../../hooks/useAuth';
import { getUserData } from '../../lib/db';
import toast from 'react-hot-toast';

export default function SuperAdminLogin() {
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading]   = useState(false);
  const { signIn, signOut }     = useAuth();
  const router                  = useRouter();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const cred = await signIn(email, password);
      const userData = await getUserData(cred.user.uid);
      if (!userData || userData.role !== 'superadmin') {
        await signOut();
        toast.error('Access denied. Super Admins only.');
        setLoading(false);
        return;
      }
      toast.success('Welcome, Admin!');
      router.push('/superadmin');
    } catch (err) {
      toast.error(err.code === 'auth/invalid-credential' ? 'Invalid email or password.' : 'Login failed.');
      setLoading(false);
    }
  };

  return (
    <>
      <Head><title>Super Admin Login — Advert Radical</title></Head>
      <div style={{minHeight:'100vh',background:'#1C1917',fontFamily:'Inter,sans-serif',display:'flex',alignItems:'center',justifyContent:'center',padding:'20px',position:'relative',overflow:'hidden'}}>
        <style>{`
          .inp-dark{width:100%;padding:12px 16px;background:rgba(255,255,255,0.07);border:1.5px solid rgba(255,255,255,0.12);border-radius:12px;font-size:14px;color:#F5F4F0;outline:none;transition:border-color 0.15s;font-family:Inter,sans-serif;}
          .inp-dark:focus{border-color:#FF6B35;box-shadow:0 0 0 3px rgba(255,107,53,0.15);}
          .inp-dark::placeholder{color:rgba(255,255,255,0.25);}
        `}</style>
        <div style={{position:'absolute',top:'-15%',right:'-10%',width:500,height:500,borderRadius:'50%',background:'radial-gradient(circle,rgba(255,107,53,0.15),transparent 65%)',pointerEvents:'none'}} />
        <div style={{position:'absolute',bottom:'-15%',left:'-10%',width:400,height:400,borderRadius:'50%',background:'radial-gradient(circle,rgba(255,179,71,0.08),transparent 65%)',pointerEvents:'none'}} />

        <div style={{width:'100%',maxWidth:380,position:'relative'}}>
          <div style={{textAlign:'center',marginBottom:32}}>
            <Link href="/" style={{textDecoration:'none'}}>
              <div style={{fontFamily:'"Plus Jakarta Sans",sans-serif',fontWeight:800,fontSize:26,color:'#F5F4F0',display:'inline-block'}}>
                Advert <span style={{background:'linear-gradient(135deg,#FF6B35,#FFB347)',WebkitBackgroundClip:'text',WebkitTextFillColor:'transparent'}}>Radical</span>
              </div>
            </Link>
            <div style={{fontSize:11,color:'#FF6B35',marginTop:6,fontWeight:700,letterSpacing:'0.1em',textTransform:'uppercase'}}>Super Admin Portal</div>
          </div>

          <div style={{background:'rgba(255,255,255,0.05)',borderRadius:20,padding:32,border:'1px solid rgba(255,255,255,0.1)',backdropFilter:'blur(20px)'}}>
            <h1 style={{fontFamily:'"Plus Jakarta Sans",sans-serif',fontWeight:700,fontSize:22,color:'#F5F4F0',marginBottom:24}}>Admin Sign In</h1>
            <form onSubmit={handleSubmit}>
              <div style={{marginBottom:16}}>
                <label style={{display:'block',fontSize:12,fontWeight:600,color:'rgba(255,255,255,0.5)',marginBottom:6,letterSpacing:'0.02em'}}>Email</label>
                <input className="inp-dark" type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="admin@advertradical.com" required />
              </div>
              <div style={{marginBottom:24}}>
                <label style={{display:'block',fontSize:12,fontWeight:600,color:'rgba(255,255,255,0.5)',marginBottom:6,letterSpacing:'0.02em'}}>Password</label>
                <input className="inp-dark" type="password" value={password} onChange={e=>setPassword(e.target.value)} placeholder="••••••••" required />
              </div>
              <button type="submit" disabled={loading} style={{width:'100%',padding:'13px',borderRadius:12,border:'none',background:loading?'rgba(255,255,255,0.1)':'linear-gradient(135deg,#FF6B35,#FFB347)',color:loading?'rgba(255,255,255,0.3)':'#fff',fontFamily:'"Plus Jakarta Sans",sans-serif',fontWeight:700,fontSize:15,cursor:loading?'not-allowed':'pointer',boxShadow:loading?'none':'0 4px 16px rgba(255,107,53,0.35)',transition:'all 0.2s'}}>
                {loading ? 'Signing in…' : 'Sign in →'}
              </button>
            </form>
          </div>
        </div>
      </div>
    </>
  );
}
