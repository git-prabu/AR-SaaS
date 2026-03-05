import Link from 'next/link';
import { useRouter } from 'next/router';
import { useAuth } from '../../hooks/useAuth';
import { useEffect } from 'react';

const navItems = [
  { href: '/admin',              label: 'Overview',     icon: '▦' },
  { href: '/admin/requests',     label: 'Requests',     icon: '◈' },
  { href: '/admin/analytics',    label: 'Analytics',    icon: '◎' },
  { href: '/admin/qrcode',       label: 'QR Code',      icon: '⬡' },
  { href: '/admin/offers',       label: 'Offers',       icon: '◇' },
  { href: '/admin/subscription', label: 'Subscription', icon: '◉' },
];

export default function AdminLayout({ children }) {
  const { user, userData, loading, signOut } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) router.push('/admin/login');
  }, [user, loading, router]);

  if (loading || !user) return (
    <div style={{minHeight:'100vh',background:'linear-gradient(145deg,#F5A876,#F0906A,#C8A8D8)',display:'flex',alignItems:'center',justifyContent:'center'}}>
      <div style={{width:36,height:36,border:'3px solid #E05A3A',borderTopColor:'transparent',borderRadius:'50%',animation:'spin 0.8s linear infinite'}}/>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );

  const isActive = (href) => href === '/admin' ? router.pathname === '/admin' : router.pathname.startsWith(href);

  return (
    <div style={{minHeight:'100vh',background:'linear-gradient(145deg,#F5A876 0%,#F0906A 40%,#C8A8D8 100%)',fontFamily:'Inter,sans-serif',color:'#2A1F10',display:'flex',position:'relative'}}>
      <style>{`
        @keyframes spin{to{transform:rotate(360deg)}}
        .nlnk{display:flex;align-items:center;gap:10px;padding:10px 14px;border-radius:14px;font-size:13.5px;font-weight:500;text-decoration:none;color:rgba(255,220,180,0.65);transition:all 0.18s;margin-bottom:3px;}
        .nlnk:hover{background:rgba(255,255,255,0.08);color:rgba(255,240,220,0.95);}
        .nlnk.on{background:linear-gradient(135deg,#E05A3A,#F07050);color:#fff;font-weight:700;box-shadow:0 4px 16px rgba(224,90,58,0.4);}
      `}</style>

      {/* Dark warm sidebar — like Skate Girl reference */}
      <aside style={{width:220,flexShrink:0,background:'#1E1B18',display:'flex',flexDirection:'column',position:'fixed',inset:'0 auto 0 0',zIndex:20,boxShadow:'4px 0 24px rgba(0,0,0,0.25)'}}>
        {/* Top decoration */}
        <div style={{height:4,background:'linear-gradient(90deg,#E05A3A,#F4A86A,#C4B5D4)'}}/>

        <div style={{padding:'22px 18px 16px',borderBottom:'1px solid rgba(255,255,255,0.06)'}}>
          <Link href="/" style={{textDecoration:'none'}}>
            <div style={{fontFamily:'Poppins,sans-serif',fontWeight:800,fontSize:17,color:'#FFF5E8'}}>
              Advert <span style={{background:'linear-gradient(135deg,#E05A3A,#F4A86A)',WebkitBackgroundClip:'text',WebkitTextFillColor:'transparent'}}>Radical</span>
            </div>
          </Link>
          <div style={{fontSize:11,color:'rgba(255,200,150,0.45)',marginTop:3,fontWeight:500,letterSpacing:'0.06em',textTransform:'uppercase'}}>Restaurant Portal</div>
        </div>

        <nav style={{flex:1,padding:'14px 10px',overflowY:'auto'}}>
          {navItems.map(item => (
            <Link key={item.href} href={item.href} className={`nlnk${isActive(item.href)?' on':''}`}>
              <span style={{fontSize:14,width:20,textAlign:'center'}}>{item.icon}</span>
              {item.label}
            </Link>
          ))}
        </nav>

        {/* User card */}
        <div style={{padding:'12px 10px',borderTop:'1px solid rgba(255,255,255,0.06)'}}>
          <div style={{padding:'10px 14px',marginBottom:6,background:'rgba(255,255,255,0.05)',borderRadius:14,border:'1px solid rgba(255,255,255,0.06)'}}>
            <div style={{fontSize:12,fontWeight:600,color:'rgba(255,240,220,0.85)',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>
              {userData?.restaurantName || userData?.email || user.email}
            </div>
            <div style={{fontSize:11,color:'rgba(255,180,120,0.5)',marginTop:2}}>Restaurant Admin</div>
          </div>
          <button onClick={signOut} style={{width:'100%',padding:'9px 14px',borderRadius:12,border:'none',background:'transparent',fontSize:13,color:'rgba(255,180,120,0.4)',cursor:'pointer',textAlign:'left',transition:'all 0.15s'}}
            onMouseOver={e=>{e.currentTarget.style.background='rgba(224,90,58,0.15)';e.currentTarget.style.color='#F07050'}}
            onMouseOut={e=>{e.currentTarget.style.background='transparent';e.currentTarget.style.color='rgba(255,180,120,0.4)'}}>
            Sign out →
          </button>
        </div>
      </aside>

      <main style={{flex:1,marginLeft:220,minHeight:'100vh',overflowY:'auto'}}>
        {children}
      </main>
    </div>
  );
}
