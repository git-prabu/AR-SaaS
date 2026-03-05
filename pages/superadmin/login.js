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
        await signOut();
        toast.error('Access denied.');
        setLoading(false); return;
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
      <div style={{minHeight:'100vh',background:'linear-gradient(135deg,#0d0a1f 0%,#0a1020 50%,#1a0510 100%)',fontFamily:'Inter,sans-serif',display:'flex',alignItems:'center',justifyContent:'center',padding:20,position:'relative',overflow:'hidden'}}>
        <style>{`
          .sgi{width:100%;padding:13px 16px;background:rgba(255,255,255,0.06);border:1.5px solid rgba(255,255,255,0.1);border-radius:14px;font-size:14px;color:#F0EEF8;outline:none;transition:all 0.2s;font-family:Inter,sans-serif;}
          .sgi:focus{border-color:rgba(255,107,53,0.5);box-shadow:0 0 0 4px rgba(255,107,53,0.08);}
          .sgi::placeholder{color:rgba(255,255,255,0.18);}
          @keyframes float{0%,100%{transform:translateY(0)}50%{transform:translateY(-14px)}}
        `}</style>
        <div style={{position:'fixed',top:0,left:0,right:0,bottom:0,background:'radial-gradient(ellipse at 70% 20%,rgba(255,107,53,0.12),transparent 60%),radial-gradient(ellipse at 20% 80%,rgba(147,100,255,0.1),transparent 60%)',pointerEvents:'none'}}/>
        <div style={{position:'fixed',top:'12%',right:'8%',width:80,height:80,borderRadius:'50%',background:'linear-gradient(135deg,rgba(255,107,53,0.4),rgba(255,179,71,0.3))',animation:'float 4s ease-in-out infinite',pointerEvents:'none',boxShadow:'0 0 30px rgba(255,107,53,0.2)'}}/>
        <div style={{position:'fixed',bottom:'15%',left:'6%',width:55,height:55,borderRadius:16,background:'linear-gradient(135deg,rgba(147,100,255,0.4),rgba(255,143,177,0.3))',animation:'float 6s ease-in-out 2s infinite',pointerEvents:'none'}}/>

        <div style={{width:'100%',maxWidth:400,position:'relative',zIndex:1}}>
          <div style={{textAlign:'center',marginBottom:32}}>
            <Link href="/" style={{textDecoration:'none'}}>
              <div style={{fontFamily:'Poppins,sans-serif',fontWeight:800,fontSize:28,color:'#F0EEF8',display:'inline-block'}}>
                Advert <span style={{background:'linear-gradient(135deg,#FF6B35,#FFB347)',WebkitBackgroundClip:'text',WebkitTextFillColor:'transparent'}}>Radical</span>
              </div>
            </Link>
            <div style={{fontSize:11,color:'#FF8C5A',marginTop:8,fontWeight:700,letterSpacing:'0.1em',textTransform:'uppercase'}}>⚡ Super Admin Portal</div>
          </div>
          <div style={{background:'rgba(255,255,255,0.06)',backdropFilter:'blur(24px)',WebkitBackdropFilter:'blur(24px)',border:'1px solid rgba(255,255,255,0.1)',borderRadius:28,padding:36,boxShadow:'0 24px 64px rgba(0,0,0,0.5)'}}>
            <h1 style={{fontFamily:'Poppins,sans-serif',fontWeight:700,fontSize:24,color:'#F0EEF8',marginBottom:28}}>Admin Sign In</h1>
            <form onSubmit={handleSubmit}>
              <div style={{marginBottom:16}}>
                <label style={{display:'block',fontSize:12,fontWeight:600,color:'rgba(255,255,255,0.4)',marginBottom:7,letterSpacing:'0.04em',textTransform:'uppercase'}}>Email</label>
                <input className="sgi" type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="admin@advertradical.com" required />
              </div>
              <div style={{marginBottom:28}}>
                <label style={{display:'block',fontSize:12,fontWeight:600,color:'rgba(255,255,255,0.4)',marginBottom:7,letterSpacing:'0.04em',textTransform:'uppercase'}}>Password</label>
                <input className="sgi" type="password" value={password} onChange={e=>setPassword(e.target.value)} placeholder="••••••••" required />
              </div>
              <button type="submit" disabled={loading} style={{width:'100%',padding:'14px',borderRadius:16,border:'none',background:loading?'rgba(255,255,255,0.08)':'linear-gradient(135deg,#FF6B35,#FFB347)',color:loading?'rgba(255,255,255,0.3)':'#fff',fontFamily:'Poppins,sans-serif',fontWeight:700,fontSize:15,cursor:loading?'not-allowed':'pointer',boxShadow:loading?'none':'0 8px 24px rgba(255,107,53,0.4)',transition:'all 0.2s'}}>
                {loading ? 'Signing in…' : 'Sign in →'}
              </button>
            </form>
          </div>
        </div>
      </div>
    </>
  );
}
