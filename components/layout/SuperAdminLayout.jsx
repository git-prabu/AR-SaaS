import Link from 'next/link';
import { useRouter } from 'next/router';
import { useSuperAdminAuth } from "../../hooks/useAuth"
import { useEffect } from 'react';

const navItems = [
  { href: '/superadmin',             label: 'Overview',     icon: '▦' },
  { href: '/superadmin/restaurants', label: 'Restaurants',  icon: '⬡' },
  { href: '/superadmin/requests',    label: 'Requests',     icon: '◈' },
  { href: '/superadmin/plans',       label: 'Plan Manager', icon: '💳' },
];

export default function SuperAdminLayout({ children }) {
  const { user, userData, loading, signOut } = useSuperAdminAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading) {
      if (!user) { router.push('/superadmin/login'); return; }
      if (userData && userData.role !== 'superadmin') router.push('/admin');
    }
  }, [user, userData, loading, router]);

  if (loading || !user) return (
    <div style={{minHeight:'100vh',background:'#FAF7F2',display:'flex',alignItems:'center',justifyContent:'center'}}>
      <div style={{width:36,height:36,border:'3px solid #F79B3D',borderTopColor:'transparent',borderRadius:'50%',animation:'spin 0.8s linear infinite'}}/>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );

  const isActive = (href) => href === '/superadmin' ? router.pathname === '/superadmin' : router.pathname.startsWith(href);

  return (
    <div style={{minHeight:'100vh',background:'#FAF7F2',fontFamily:'Inter,sans-serif',color:'#2B2B2B',display:'flex'}}>
      <style>{`
        @keyframes spin{to{transform:rotate(360deg)}}
        .snlnk{
          display:flex;align-items:center;gap:10px;padding:10px 14px;border-radius:14px;
          font-size:13.5px;font-weight:500;text-decoration:none;
          color:rgba(255,225,185,0.6);transition:all 0.18s;margin-bottom:3px;
        }
        .snlnk:hover{background:rgba(255,255,255,0.07);color:rgba(255,240,220,0.9);}
        .snlnk.on{
          background:linear-gradient(135deg,#F79B3D,#F48A1E);
          color:#fff;font-weight:700;
          box-shadow:0 4px 16px rgba(247,155,61,0.38);
        }
      `}</style>

      {/* ── Dark sidebar ── */}
      <aside style={{
        width:220,flexShrink:0,background:'#1E1B18',
        display:'flex',flexDirection:'column',
        position:'fixed',inset:'0 auto 0 0',zIndex:20,
        boxShadow:'4px 0 24px rgba(0,0,0,0.18)'
      }}>
        {/* Amber accent strip */}
        <div style={{height:4,background:'linear-gradient(90deg,#F79B3D,#F4C06A,#C4B5D4)'}}/>

        {/* Brand */}
        <div style={{padding:'22px 18px 16px',borderBottom:'1px solid rgba(255,255,255,0.06)'}}>
          <Link href="/" style={{textDecoration:'none'}}>
            <div style={{fontFamily:'Poppins,sans-serif',fontWeight:800,fontSize:17,color:'#FFF5E8'}}>
              Advert <span style={{background:'linear-gradient(135deg,#F79B3D,#F4C06A)',WebkitBackgroundClip:'text',WebkitTextFillColor:'transparent'}}>Radical</span>
            </div>
          </Link>
          <div style={{fontSize:11,color:'rgba(247,155,61,0.5)',marginTop:3,fontWeight:700,letterSpacing:'0.06em',textTransform:'uppercase'}}>Super Admin</div>
        </div>

        {/* Nav */}
        <nav style={{flex:1,padding:'14px 10px',overflowY:'auto'}}>
          {navItems.map(item => (
            <Link key={item.href} href={item.href} className={`snlnk${isActive(item.href)?' on':''}`}>
              <span style={{fontSize:14,width:20,textAlign:'center'}}>{item.icon}</span>
              {item.label}
            </Link>
          ))}
        </nav>

        {/* User card */}
        <div style={{padding:'12px 10px',borderTop:'1px solid rgba(255,255,255,0.06)'}}>
          <div style={{padding:'10px 14px',marginBottom:6,background:'rgba(255,255,255,0.05)',borderRadius:14}}>
            <div style={{fontSize:12,fontWeight:600,color:'rgba(255,240,220,0.85)',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{user.email}</div>
            <div style={{fontSize:11,color:'rgba(247,155,61,0.5)',marginTop:2,fontWeight:600}}>Super Admin</div>
          </div>
          <button onClick={signOut}
            style={{width:'100%',padding:'9px 14px',borderRadius:12,border:'none',background:'transparent',fontSize:13,color:'rgba(255,180,120,0.4)',cursor:'pointer',textAlign:'left'}}
            onMouseOver={e=>{e.currentTarget.style.background='rgba(247,155,61,0.12)';e.currentTarget.style.color='#F79B3D'}}
            onMouseOut={e=>{e.currentTarget.style.background='transparent';e.currentTarget.style.color='rgba(255,180,120,0.4)'}}>
            Sign out →
          </button>
        </div>
      </aside>

      <main style={{flex:1,marginLeft:220,minHeight:'100vh',overflowY:'auto'}}>{children}</main>
    </div>
  );
}
