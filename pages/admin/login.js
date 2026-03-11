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
      <Head><title>Restaurant Login — Advert Radical</title></Head>
      <div style={{minHeight:'100vh',background:'linear-gradient(145deg,#1A1210 0%,#2A1A0E 45%,#1E1428 100%)',fontFamily:'Inter,sans-serif',display:'flex',alignItems:'center',justifyContent:'center',padding:20,position:'relative',overflow:'hidden'}}>
        <style>{`
          @keyframes float{0%,100%{transform:translateY(0)}50%{transform:translateY(-12px)}}
          @keyframes pillarMove {
            0%   { opacity:0; transform:translateY(-100%) scaleX(1); }
            15%  { opacity:0.6; }
            85%  { opacity:0.4; }
            100% { opacity:0; transform:translateY(120%) scaleX(1); }
          }
          @keyframes pillarPulse {
            0%,100% { opacity:0.2; }
            50%     { opacity:0.7; }
          }
          @keyframes ambientGlow {
            0%,100% { opacity:0.3; transform:scale(1); }
            50%     { opacity:0.6; transform:scale(1.15); }
          }
          .ci{width:100%;padding:13px 16px;background:rgba(255,255,255,0.07);border:1.5px solid rgba(255,200,150,0.2);border-radius:14px;font-size:14px;color:#FFF5E8;outline:none;transition:all 0.2s;font-family:Inter,sans-serif;}
          .ci:focus{border-color:rgba(247,155,61,0.6);background:rgba(255,255,255,0.1);box-shadow:0 0 0 4px rgba(247,155,61,0.12);}
          .ci::placeholder{color:rgba(255,240,210,0.3);}
          label { color: rgba(255,220,170,0.65) !important; }
        `}</style>

        {/* ── LIGHT PILLARS ── */}
        {/* Pillar 1 — left-center */}
        <div style={{position:'fixed',left:'18%',top:0,width:3,height:'100vh',background:'linear-gradient(to bottom,transparent,rgba(247,155,61,0.8),rgba(247,155,61,0.5),transparent)',borderRadius:99,filter:'blur(4px)',animation:'pillarMove 5s ease-in-out infinite',pointerEvents:'none',zIndex:0}}/>
        <div style={{position:'fixed',left:'18%',top:0,width:12,height:'100vh',background:'linear-gradient(to bottom,transparent,rgba(247,155,61,0.15),transparent)',borderRadius:99,filter:'blur(8px)',animation:'pillarMove 5s ease-in-out infinite',pointerEvents:'none',zIndex:0}}/>

        {/* Pillar 2 — right-center */}
        <div style={{position:'fixed',right:'22%',top:0,width:3,height:'100vh',background:'linear-gradient(to bottom,transparent,rgba(200,160,255,0.7),rgba(200,160,255,0.4),transparent)',borderRadius:99,filter:'blur(4px)',animation:'pillarMove 7s ease-in-out 2s infinite',pointerEvents:'none',zIndex:0}}/>
        <div style={{position:'fixed',right:'22%',top:0,width:14,height:'100vh',background:'linear-gradient(to bottom,transparent,rgba(200,160,255,0.12),transparent)',borderRadius:99,filter:'blur(10px)',animation:'pillarMove 7s ease-in-out 2s infinite',pointerEvents:'none',zIndex:0}}/>

        {/* Pillar 3 — far right, slower */}
        <div style={{position:'fixed',right:'8%',top:0,width:2,height:'100vh',background:'linear-gradient(to bottom,transparent,rgba(224,90,58,0.6),transparent)',borderRadius:99,filter:'blur(3px)',animation:'pillarMove 9s ease-in-out 4s infinite',pointerEvents:'none',zIndex:0}}/>

        {/* Pillar 4 — far left, slow pulse */}
        <div style={{position:'fixed',left:'5%',top:'10%',width:2,height:'80vh',background:'linear-gradient(to bottom,transparent,rgba(143,196,168,0.5),transparent)',borderRadius:99,filter:'blur(4px)',animation:'pillarPulse 4s ease-in-out 1s infinite',pointerEvents:'none',zIndex:0}}/>

        {/* Ambient glow pools on floor */}
        <div style={{position:'fixed',bottom:'-10%',left:'15%',width:300,height:200,borderRadius:'50%',background:'radial-gradient(ellipse,rgba(247,155,61,0.18),transparent 70%)',filter:'blur(30px)',animation:'ambientGlow 6s ease-in-out infinite',pointerEvents:'none',zIndex:0}}/>
        <div style={{position:'fixed',bottom:'-10%',right:'15%',width:250,height:180,borderRadius:'50%',background:'radial-gradient(ellipse,rgba(200,160,255,0.14),transparent 70%)',filter:'blur(30px)',animation:'ambientGlow 8s ease-in-out 2s infinite',pointerEvents:'none',zIndex:0}}/>

        {/* Floating clay orbs — dark theme versions */}
        <div style={{position:'fixed',top:'8%',right:'8%',width:90,height:90,borderRadius:'50%',background:'rgba(247,155,61,0.12)',boxShadow:'0 0 30px rgba(247,155,61,0.2)',animation:'float 5s ease-in-out infinite',pointerEvents:'none',zIndex:1}}/>
        <div style={{position:'fixed',top:'8%',right:'14%',width:55,height:55,borderRadius:'50%',background:'rgba(200,160,255,0.1)',animation:'float 7s ease-in-out 0.5s infinite',pointerEvents:'none',zIndex:1}}/>
        <div style={{position:'fixed',bottom:'12%',left:'6%',width:70,height:70,borderRadius:'50%',background:'rgba(143,196,168,0.1)',animation:'float 6s ease-in-out 1s infinite',pointerEvents:'none',zIndex:1}}/>
        <div style={{position:'fixed',top:'35%',left:'5%',width:50,height:50,borderRadius:16,background:'rgba(247,155,61,0.08)',animation:'float 8s ease-in-out 0.3s infinite',pointerEvents:'none',zIndex:1}}/>

        <div style={{width:'100%',maxWidth:400,position:'relative',zIndex:2}}>
          <div style={{textAlign:'center',marginBottom:32}}>
            <Link href="/" style={{textDecoration:'none'}}>
              <div style={{fontFamily:'Poppins,sans-serif',fontWeight:800,fontSize:28,color:'#FFF5E8',display:'inline-block'}}>
                Advert <span style={{background:'linear-gradient(135deg,#F79B3D,#F4C86A)',WebkitBackgroundClip:'text',WebkitTextFillColor:'transparent'}}>Radical</span>
              </div>
            </Link>
            <div style={{fontSize:13,color:'rgba(255,240,210,0.4)',marginTop:8}}>Restaurant Admin Portal</div>
          </div>

          {/* Glassmorphism dark card */}
          <div style={{background:'rgba(255,255,255,0.05)',backdropFilter:'blur(24px)',WebkitBackdropFilter:'blur(24px)',border:'1.5px solid rgba(255,200,150,0.15)',borderRadius:28,padding:36,boxShadow:'0 20px 60px rgba(0,0,0,0.5),inset 0 1px 0 rgba(255,255,255,0.08)'}}>
            <h1 style={{fontFamily:'Poppins,sans-serif',fontWeight:800,fontSize:24,color:'#FFF5E8',marginBottom:28}}>Sign in</h1>
            <div onSubmit={handleSubmit}>
              <div style={{marginBottom:16}}>
                <label style={{display:'block',fontSize:11,fontWeight:700,color:'rgba(255,220,170,0.55)',marginBottom:7,letterSpacing:'0.05em',textTransform:'uppercase'}}>Email</label>
                <input className="ci" type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="your@restaurant.com" required/>
              </div>
              <div style={{marginBottom:28}}>
                <label style={{display:'block',fontSize:11,fontWeight:700,color:'rgba(255,220,170,0.55)',marginBottom:7,letterSpacing:'0.05em',textTransform:'uppercase'}}>Password</label>
                <input className="ci" type="password" value={password} onChange={e=>setPassword(e.target.value)} placeholder="••••••••" required/>
              </div>
              <button onClick={handleSubmit} disabled={loading} style={{width:'100%',padding:'14px',borderRadius:50,border:'none',background:loading?'rgba(247,155,61,0.2)':'linear-gradient(135deg,#F79B3D,#E05A3A)',color:loading?'rgba(255,240,210,0.4)':'#fff',fontFamily:'Poppins,sans-serif',fontWeight:700,fontSize:15,cursor:loading?'not-allowed':'pointer',boxShadow:loading?'none':'0 8px 28px rgba(247,155,61,0.4),0 0 20px rgba(247,155,61,0.2)',transition:'all 0.2s'}}>
                {loading ? 'Signing in…' : 'Sign in →'}
              </button>
            </div>
          </div>
          <p style={{textAlign:'center',fontSize:13,color:'rgba(255,240,210,0.35)',marginTop:20}}>
            Not a restaurant yet?{' '}
            <Link href="/#plans" style={{color:'#F79B3D',textDecoration:'none',fontWeight:700}}>Get started</Link>
          </p>
        </div>
      </div>
    </>
  );
}
