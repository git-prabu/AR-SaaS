import Link from 'next/link';
import { useRouter } from 'next/router';
import { useAuth } from '../../hooks/useAuth';
import { useEffect } from 'react';

const navItems = [
  { href: '/admin',              label: 'Overview',     emoji: '▦' },
  { href: '/admin/requests',     label: 'Requests',     emoji: '◈' },
  { href: '/admin/analytics',    label: 'Analytics',    emoji: '◎' },
  { href: '/admin/qrcode',       label: 'QR Code',      emoji: '⬡' },
  { href: '/admin/offers',       label: 'Offers',       emoji: '◇' },
  { href: '/admin/subscription', label: 'Subscription', emoji: '◉' },
];

export default function AdminLayout({ children }) {
  const { user, userData, loading, signOut } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) router.push('/admin/login');
  }, [user, loading, router]);

  if (loading || !user) return (
    <div style={{minHeight:'100vh',background:'#F5F4F0',display:'flex',alignItems:'center',justifyContent:'center'}}>
      <div style={{width:32,height:32,border:'2.5px solid #FF6B35',borderTopColor:'transparent',borderRadius:'50%',animation:'spin 0.8s linear infinite'}} />
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );

  const isActive = (href) => href === '/admin' ? router.pathname === '/admin' : router.pathname.startsWith(href);

  return (
    <div style={{minHeight:'100vh',background:'#F5F4F0',fontFamily:'Inter,sans-serif',color:'#1C1917',display:'flex'}}>
      <style>{`
        .nav-link{display:flex;align-items:center;gap:10px;padding:10px 12px;border-radius:10px;font-size:13.5px;font-weight:500;text-decoration:none;color:#6B6460;transition:all 0.15s;margin-bottom:2px;}
        .nav-link:hover{background:#F0EDE8;color:#1C1917;}
        .nav-link.active{background:#FF6B35;color:#fff;font-weight:600;box-shadow:0 4px 12px rgba(255,107,53,0.25);}
        .nav-emoji{font-size:15px;width:20px;text-align:center;}
        @keyframes spin{to{transform:rotate(360deg)}}
      `}</style>

      {/* Sidebar */}
      <aside style={{width:220,flexShrink:0,background:'#fff',borderRight:'1px solid #E2DED8',display:'flex',flexDirection:'column',position:'fixed',inset:'0 auto 0 0',zIndex:20,boxShadow:'2px 0 12px rgba(0,0,0,0.04)'}}>
        <div style={{padding:'22px 20px 18px',borderBottom:'1px solid #E2DED8'}}>
          <Link href="/" style={{textDecoration:'none'}}>
            <div style={{fontFamily:'"Plus Jakarta Sans",sans-serif',fontWeight:800,fontSize:17,color:'#1C1917'}}>
              Advert <span style={{background:'linear-gradient(135deg,#FF6B35,#FFB347)',WebkitBackgroundClip:'text',WebkitTextFillColor:'transparent'}}>Radical</span>
            </div>
          </Link>
          <div style={{fontSize:11,color:'#A09890',marginTop:3,fontWeight:500,letterSpacing:'0.04em',textTransform:'uppercase'}}>Restaurant Portal</div>
        </div>

        <nav style={{flex:1,padding:'12px 10px',overflowY:'auto'}}>
          {navItems.map(item => (
            <Link key={item.href} href={item.href} className={`nav-link${isActive(item.href)?' active':''}`}>
              <span className="nav-emoji">{item.emoji}</span>
              {item.label}
            </Link>
          ))}
        </nav>

        <div style={{padding:'12px 10px',borderTop:'1px solid #E2DED8'}}>
          <div style={{padding:'10px 12px',marginBottom:4,background:'#F5F4F0',borderRadius:10}}>
            <div style={{fontSize:12,fontWeight:600,color:'#1C1917',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>
              {userData?.restaurantName || userData?.email || user.email}
            </div>
            <div style={{fontSize:11,color:'#A09890',marginTop:1}}>Restaurant Admin</div>
          </div>
          <button onClick={signOut} style={{width:'100%',padding:'9px 12px',borderRadius:10,border:'none',background:'transparent',fontSize:13,color:'#A09890',cursor:'pointer',textAlign:'left',transition:'all 0.15s'}}
            onMouseOver={e=>{e.currentTarget.style.background='#FEE9E2';e.currentTarget.style.color='#FF6B35'}}
            onMouseOut={e=>{e.currentTarget.style.background='transparent';e.currentTarget.style.color='#A09890'}}>
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
