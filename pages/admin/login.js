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
        await signOut();
        toast.error('Access denied. Restaurant accounts only.');
        setLoading(false); return;
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
      <div style={{minHeight:'100vh',background:'linear-gradient(135deg,#1a0f2e 0%,#0f1a2e 50%,#1a0820 100%)',fontFamily:'Inter,sans-serif',display:'flex',alignItems:'center',justifyContent:'center',padding:20,position:'relative',overflow:'hidden'}}>
        <style>{`
          .gi{width:100%;padding:13px 16px;background:rgba(255,255,255,0.07);border:1.5px solid rgba(255,255,255,0.12);border-radius:14px;font-size:14px;color:#F0EEF8;outline:none;transition:all 0.2s;font-family:Inter,sans-serif;}
          .gi:focus{border-color:rgba(255,107,53,0.5);background:rgba(255,255,255,0.1);box-shadow:0 0 0 4px rgba(255,107,53,0.1);}
          .gi::placeholder{color:rgba(255,255,255,0.2);}
        `}</style>

        {/* Background orbs */}
        <div style={{position:'fixed',top:'5%',right:'10%',width:350,height:350,borderRadius:'50%',background:'radial-gradient(circle,rgba(147,100,255,0.15),transparent 65%)',pointerEvents:'none'}}/>
        <div style={{position:'fixed',bottom:'5%',left:'5%',width:300,height:300,borderRadius:'50%',background:'radial-gradient(circle,rgba(255,107,53,0.1),transparent 65%)',pointerEvents:'none'}}/>
        <div style={{position:'fixed',top:'40%',left:'20%',width:200,height:200,borderRadius:'50%',background:'radial-gradient(circle,rgba(255,143,177,0.08),transparent 65%)',pointerEvents:'none'}}/>

        {/* Floating decorative shapes */}
        <div style={{position:'fixed',top:'15%',left:'8%',width:60,height:60,borderRadius:'50%',background:'linear-gradient(135deg,rgba(255,107,53,0.3),rgba(255,179,71,0.2))',animation:'float 5s ease-in-out infinite',pointerEvents:'none'}}/>
        <div style={{position:'fixed',bottom:'20%',right:'12%',width:40,height:40,borderRadius:12,background:'linear-gradient(135deg,rgba(147,100,255,0.3),rgba(255,143,177,0.2))',animation:'float 7s ease-in-out 1s infinite',pointerEvents:'none'}}/>
        <style>{`@keyframes float{0%,100%{transform:translateY(0)}50%{transform:translateY(-12px)}}`}</style>

        <div style={{width:'100%',maxWidth:400,position:'relative',zIndex:1}}>
          <div style={{textAlign:'center',marginBottom:32}}>
            <Link href="/" style={{textDecoration:'none'}}>
              <div style={{fontFamily:'Poppins,sans-serif',fontWeight:800,fontSize:28,color:'#F0EEF8',display:'inline-block'}}>
                Advert <span style={{background:'linear-gradient(135deg,#FF6B35,#FFB347,#FF8FB1)',WebkitBackgroundClip:'text',WebkitTextFillColor:'transparent'}}>Radical</span>
              </div>
            </Link>
            <div style={{fontSize:13,color:'rgba(255,255,255,0.4)',marginTop:8}}>Restaurant Admin Portal</div>
          </div>

          <div style={{background:'rgba(255,255,255,0.07)',backdropFilter:'blur(24px)',WebkitBackdropFilter:'blur(24px)',border:'1px solid rgba(255,255,255,0.13)',borderRadius:28,padding:36,boxShadow:'0 24px 64px rgba(0,0,0,0.4)'}}>
            <h1 style={{fontFamily:'Poppins,sans-serif',fontWeight:700,fontSize:24,color:'#F0EEF8',marginBottom:28}}>Sign in</h1>
            <form onSubmit={handleSubmit}>
              <div style={{marginBottom:16}}>
                <label style={{display:'block',fontSize:12,fontWeight:600,color:'rgba(255,255,255,0.45)',marginBottom:7,letterSpacing:'0.04em',textTransform:'uppercase'}}>Email</label>
                <input className="gi" type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="your@restaurant.com" required />
              </div>
              <div style={{marginBottom:28}}>
                <label style={{display:'block',fontSize:12,fontWeight:600,color:'rgba(255,255,255,0.45)',marginBottom:7,letterSpacing:'0.04em',textTransform:'uppercase'}}>Password</label>
                <input className="gi" type="password" value={password} onChange={e=>setPassword(e.target.value)} placeholder="••••••••" required />
              </div>
              <button type="submit" disabled={loading} style={{width:'100%',padding:'14px',borderRadius:16,border:'none',background:loading?'rgba(255,255,255,0.1)':'linear-gradient(135deg,#FF6B35,#FFB347)',color:loading?'rgba(255,255,255,0.3)':'#fff',fontFamily:'Poppins,sans-serif',fontWeight:700,fontSize:15,cursor:loading?'not-allowed':'pointer',boxShadow:loading?'none':'0 8px 24px rgba(255,107,53,0.4)',transition:'all 0.2s'}}>
                {loading ? 'Signing in…' : 'Sign in →'}
              </button>
            </form>
          </div>
          <p style={{textAlign:'center',fontSize:13,color:'rgba(255,255,255,0.3)',marginTop:20}}>
            Not a restaurant yet?{' '}
            <Link href="/#plans" style={{color:'#FF8C5A',textDecoration:'none',fontWeight:600}}>Get started</Link>
          </p>
        </div>
      </div>
    </>
  );
}
