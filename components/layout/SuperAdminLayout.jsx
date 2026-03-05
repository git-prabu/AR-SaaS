import Link from 'next/link';
import { useRouter } from 'next/router';
import { useAuth } from '../../hooks/useAuth';
import { useEffect } from 'react';

const navItems = [
  { href: '/superadmin',             label: 'Overview',    icon: '▦' },
  { href: '/superadmin/restaurants', label: 'Restaurants', icon: '⬡' },
  { href: '/superadmin/requests',    label: 'Requests',    icon: '◈' },
];

export default function SuperAdminLayout({ children }) {
  const { user, userData, loading, signOut } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading) {
      if (!user) { router.push('/superadmin/login'); return; }
      if (userData && userData.role !== 'superadmin') router.push('/admin');
    }
  }, [user, userData, loading, router]);

  if (loading || !user) return (
    <div style={{minHeight:'100vh',background:'linear-gradient(135deg,#1a0f2e,#0f1a2e)',display:'flex',alignItems:'center',justifyContent:'center'}}>
      <div style={{width:36,height:36,border:'2.5px solid #FF6B35',borderTopColor:'transparent',borderRadius:'50%',animation:'spin 0.8s linear infinite'}}/>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );

  const isActive = (href) => href === '/superadmin' ? router.pathname === '/superadmin' : router.pathname.startsWith(href);

  return (
    <div style={{minHeight:'100vh',background:'linear-gradient(135deg,#1a0f2e 0%,#0d1a30 50%,#1a0820 100%)',fontFamily:'Inter,sans-serif',color:'#F0EEF8',display:'flex',position:'relative'}}>
      <div style={{position:'fixed',top:'-10%',left:'15%',width:350,height:350,borderRadius:'50%',background:'radial-gradient(circle,rgba(255,107,53,0.1),transparent 70%)',pointerEvents:'none',zIndex:0}}/>
      <div style={{position:'fixed',bottom:'5%',right:'5%',width:280,height:280,borderRadius:'50%',background:'radial-gradient(circle,rgba(147,100,255,0.1),transparent 70%)',pointerEvents:'none',zIndex:0}}/>

      <style>{`
        .snav{display:flex;align-items:center;gap:10px;padding:10px 14px;border-radius:14px;font-size:13.5px;font-weight:500;text-decoration:none;color:rgba(255,255,255,0.5);transition:all 0.2s;margin-bottom:3px;}
        .snav:hover{background:rgba(255,255,255,0.07);color:rgba(255,255,255,0.9);}
        .snav.on{background:linear-gradient(135deg,rgba(255,107,53,0.25),rgba(255,179,71,0.15));color:#FF8C5A;font-weight:600;border:1px solid rgba(255,107,53,0.25);}
        @keyframes spin{to{transform:rotate(360deg)}}
      `}</style>

      <aside style={{width:224,flexShrink:0,background:'rgba(255,255,255,0.04)',backdropFilter:'blur(20px)',WebkitBackdropFilter:'blur(20px)',borderRight:'1px solid rgba(255,255,255,0.08)',display:'flex',flexDirection:'column',position:'fixed',inset:'0 auto 0 0',zIndex:20}}>
        <div style={{padding:'24px 18px 18px',borderBottom:'1px solid rgba(255,255,255,0.08)'}}>
          <Link href="/" style={{textDecoration:'none'}}>
            <div style={{fontFamily:'Poppins,sans-serif',fontWeight:800,fontSize:17,color:'#F0EEF8'}}>
              Advert <span style={{background:'linear-gradient(135deg,#FF6B35,#FFB347)',WebkitBackgroundClip:'text',WebkitTextFillColor:'transparent'}}>Radical</span>
            </div>
          </Link>
          <div style={{fontSize:11,color:'#FF8C5A',marginTop:3,fontWeight:600,letterSpacing:'0.06em',textTransform:'uppercase'}}>Super Admin</div>
        </div>
        <nav style={{flex:1,padding:'14px 10px',overflowY:'auto'}}>
          {navItems.map(item => (
            <Link key={item.href} href={item.href} className={`snav${isActive(item.href)?' on':''}`}>
              <span style={{fontSize:14,width:20,textAlign:'center'}}>{item.icon}</span>
              {item.label}
            </Link>
          ))}
        </nav>
        <div style={{padding:'12px 10px',borderTop:'1px solid rgba(255,255,255,0.08)'}}>
          <div style={{padding:'10px 14px',marginBottom:6,background:'rgba(255,255,255,0.05)',borderRadius:12}}>
            <div style={{fontSize:12,fontWeight:600,color:'rgba(255,255,255,0.85)',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{user.email}</div>
            <div style={{fontSize:11,color:'#FF8C5A',marginTop:2,fontWeight:600}}>Super Admin</div>
          </div>
          <button onClick={signOut} style={{width:'100%',padding:'9px 14px',borderRadius:12,border:'none',background:'transparent',fontSize:13,color:'rgba(255,255,255,0.35)',cursor:'pointer',textAlign:'left'}}
            onMouseOver={e=>{e.currentTarget.style.background='rgba(255,107,53,0.12)';e.currentTarget.style.color='#FF8C5A'}}
            onMouseOut={e=>{e.currentTarget.style.background='transparent';e.currentTarget.style.color='rgba(255,255,255,0.35)'}}>
            Sign out →
          </button>
        </div>
      </aside>
      <main style={{flex:1,marginLeft:224,minHeight:'100vh',overflowY:'auto',position:'relative',zIndex:1}}>
        {children}
      </main>
    </div>
  );
}
