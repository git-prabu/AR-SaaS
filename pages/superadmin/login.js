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
      <Head><title>Super Admin Login — Advert Radical</title></Head>
      <div style={{minHeight:'100vh',background:'linear-gradient(145deg,#F5A876 0%,#F0906A 45%,#C8A8D8 100%)',fontFamily:'Inter,sans-serif',display:'flex',alignItems:'center',justifyContent:'center',padding:20,position:'relative',overflow:'hidden'}}>
        <style>{`
          @keyframes float{0%,100%{transform:translateY(0)}50%{transform:translateY(-12px)}}
          .si{width:100%;padding:13px 16px;background:rgba(255,255,255,0.65);border:2px solid rgba(255,200,150,0.5);border-radius:14px;font-size:14px;color:#2A1F10;outline:none;transition:all 0.2s;font-family:Inter,sans-serif;}
          .si:focus{border-color:#E05A3A;background:rgba(255,255,255,0.85);box-shadow:0 0 0 4px rgba(224,90,58,0.12);}
          .si::placeholder{color:rgba(100,60,30,0.4);}
        `}</style>
        {/* Floating shapes */}
        <div style={{position:'fixed',top:'10%',right:'10%',width:80,height:80,borderRadius:'50%',background:'rgba(255,255,255,0.35)',animation:'float 5s ease-in-out infinite',pointerEvents:'none'}}/>
        <div style={{position:'fixed',bottom:'15%',left:'8%',width:60,height:60,borderRadius:'50%',background:'rgba(196,181,212,0.5)',animation:'float 7s ease-in-out 1s infinite',pointerEvents:'none'}}/>
        <div style={{position:'fixed',top:'40%',right:'5%',width:45,height:45,borderRadius:14,background:'rgba(143,196,168,0.5)',animation:'float 6s ease-in-out 0.5s infinite',pointerEvents:'none'}}/>
        <div style={{position:'fixed',bottom:'-15%',left:'-8%',width:400,height:400,borderRadius:'50%',background:'rgba(255,255,255,0.1)',pointerEvents:'none'}}/>

        <div style={{width:'100%',maxWidth:400,position:'relative',zIndex:1}}>
          <div style={{textAlign:'center',marginBottom:32}}>
            <Link href="/" style={{textDecoration:'none'}}>
              <div style={{fontFamily:'Poppins,sans-serif',fontWeight:800,fontSize:28,color:'#1E1B18',display:'inline-block'}}>
                Advert <span style={{background:'linear-gradient(135deg,#E05A3A,#F4A86A)',WebkitBackgroundClip:'text',WebkitTextFillColor:'transparent'}}>Radical</span>
              </div>
            </Link>
            <div style={{fontSize:11,color:'#E05A3A',marginTop:8,fontWeight:700,letterSpacing:'0.1em',textTransform:'uppercase'}}>⚡ Super Admin</div>
          </div>
          <div style={{background:'rgba(255,245,230,0.8)',backdropFilter:'blur(16px)',WebkitBackdropFilter:'blur(16px)',border:'1.5px solid rgba(255,220,170,0.7)',borderRadius:28,padding:36,boxShadow:'0 20px 60px rgba(120,70,30,0.2),inset 0 1px 0 rgba(255,255,255,0.7)'}}>
            <h1 style={{fontFamily:'Poppins,sans-serif',fontWeight:800,fontSize:24,color:'#2A1F10',marginBottom:28}}>Admin Sign In</h1>
            <div>
              <div style={{marginBottom:16}}>
                <label style={{display:'block',fontSize:11,fontWeight:700,color:'rgba(100,60,30,0.6)',marginBottom:7,letterSpacing:'0.05em',textTransform:'uppercase'}}>Email</label>
                <input className="si" type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="admin@advertradical.com" required/>
              </div>
              <div style={{marginBottom:28}}>
                <label style={{display:'block',fontSize:11,fontWeight:700,color:'rgba(100,60,30,0.6)',marginBottom:7,letterSpacing:'0.05em',textTransform:'uppercase'}}>Password</label>
                <input className="si" type="password" value={password} onChange={e=>setPassword(e.target.value)} placeholder="••••••••" required/>
              </div>
              <button onClick={handleSubmit} disabled={loading} style={{width:'100%',padding:'14px',borderRadius:50,border:'none',background:loading?'rgba(200,150,100,0.3)':'linear-gradient(135deg,#E05A3A,#F07050)',color:loading?'rgba(100,60,30,0.4)':'#fff',fontFamily:'Poppins,sans-serif',fontWeight:700,fontSize:15,cursor:loading?'not-allowed':'pointer',boxShadow:loading?'none':'0 8px 24px rgba(224,90,58,0.35)',transition:'all 0.2s'}}>
                {loading ? 'Signing in…' : 'Sign in →'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
