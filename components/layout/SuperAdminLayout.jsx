import Link from 'next/link';
import { useRouter } from 'next/router';
import { useAuth } from '../../hooks/useAuth';
import { useEffect } from 'react';

const G = { bg:'#08090C', sidebar:'#07080B', border:'rgba(255,255,255,0.07)', gold:'#B8962E', text:'rgba(255,255,255,0.82)', textDim:'rgba(255,255,255,0.32)' };
const FONTS = `@import url('https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..60,400;12..60,500;12..60,600;12..60,700;12..60,800&family=DM+Mono:wght@400;500&display=swap');`;

const navItems = [
  { href:'/superadmin',             label:'Overview',    icon:'▦' },
  { href:'/superadmin/restaurants', label:'Restaurants', icon:'⬡' },
  { href:'/superadmin/requests',    label:'Requests',    icon:'◈' },
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
    <div style={{minHeight:'100vh',background:G.bg,display:'flex',alignItems:'center',justifyContent:'center'}}>
      <div style={{width:32,height:32,border:`2px solid ${G.gold}`,borderTopColor:'transparent',borderRadius:'50%',animation:'spin 0.8s linear infinite'}}/>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );

  const isActive = (h) => h === '/superadmin' ? router.pathname === '/superadmin' : router.pathname.startsWith(h);

  return (
    <div style={{minHeight:'100vh',background:G.bg,fontFamily:`'Bricolage Grotesque',Inter,sans-serif`,color:G.text,display:'flex'}}>
      <style>{`
        ${FONTS}
        @keyframes spin{to{transform:rotate(360deg)}}
        *{box-sizing:border-box}
        .snlnk{display:flex;align-items:center;gap:10px;padding:9px 12px;border-radius:8px;font-size:13px;font-weight:500;text-decoration:none;color:rgba(255,255,255,0.35);transition:all 0.15s;margin-bottom:2px;}
        .snlnk:hover{background:rgba(255,255,255,0.05);color:rgba(255,255,255,0.72);}
        .snlnk.on{background:rgba(184,150,46,0.1);color:#C4A840;border:1px solid rgba(184,150,46,0.18);}
        ::-webkit-scrollbar{width:4px}::-webkit-scrollbar-thumb{background:rgba(255,255,255,0.08);border-radius:2px}
      `}</style>

      <aside style={{width:214,flexShrink:0,background:G.sidebar,borderRight:`1px solid ${G.border}`,display:'flex',flexDirection:'column',position:'fixed',inset:'0 auto 0 0',zIndex:20}}>
        <div style={{height:1,background:`linear-gradient(90deg,transparent,${G.gold}55,transparent)`}}/>
        <div style={{padding:'20px 16px 14px',borderBottom:`1px solid ${G.border}`}}>
          <Link href="/" style={{textDecoration:'none'}}>
            <div style={{fontWeight:800,fontSize:16,color:'rgba(255,255,255,0.88)',letterSpacing:'-0.01em'}}>
              Advert <span style={{color:G.gold}}>Radical</span>
            </div>
          </Link>
          <div style={{fontSize:10,color:G.gold,marginTop:4,fontWeight:600,letterSpacing:'0.1em',textTransform:'uppercase',fontFamily:`'DM Mono',monospace`}}>Super Admin</div>
        </div>
        <nav style={{flex:1,padding:'12px 8px',overflowY:'auto'}}>
          {navItems.map(item => (
            <Link key={item.href} href={item.href} className={`snlnk${isActive(item.href)?' on':''}`}>
              <span style={{fontSize:12,width:18,textAlign:'center',opacity:0.6}}>{item.icon}</span>
              {item.label}
            </Link>
          ))}
        </nav>
        <div style={{padding:'10px 8px',borderTop:`1px solid ${G.border}`}}>
          <div style={{padding:'10px 12px',marginBottom:6,background:'rgba(255,255,255,0.03)',borderRadius:8,border:`1px solid ${G.border}`}}>
            <div style={{fontSize:12,fontWeight:600,color:'rgba(255,255,255,0.65)',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{user.email}</div>
            <div style={{fontSize:10,color:G.gold,marginTop:2,fontWeight:600,fontFamily:`'DM Mono',monospace`}}>Super Admin</div>
          </div>
          <button onClick={signOut} style={{width:'100%',padding:'8px 12px',borderRadius:8,border:'none',background:'transparent',fontSize:12,color:G.textDim,cursor:'pointer',textAlign:'left',transition:'all 0.15s',fontFamily:'inherit'}}
            onMouseOver={e=>{e.currentTarget.style.background='rgba(184,150,46,0.07)';e.currentTarget.style.color=G.gold}}
            onMouseOut={e=>{e.currentTarget.style.background='transparent';e.currentTarget.style.color=G.textDim}}>
            Sign out →
          </button>
        </div>
      </aside>

      <main style={{flex:1,marginLeft:214,minHeight:'100vh',overflowY:'auto'}}>{children}</main>
    </div>
  );
}
