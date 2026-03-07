import Link from 'next/link';
import { useRouter } from 'next/router';
import { useAuth } from '../../hooks/useAuth';
import { useEffect, useState, createContext, useContext } from 'react';

export const ThemeContext = createContext({ theme:'dark', toggle:()=>{} });
export const useTheme = () => useContext(ThemeContext);

const FONTS = `@import url('https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..60,400;12..60,500;12..60,600;12..60,700;12..60,800&family=DM+Mono:wght@400;500&display=swap');`;

const navItems = [
  { href:'/admin',              label:'Overview',     icon:'▦' },
  { href:'/admin/requests',     label:'Requests',     icon:'◈' },
  { href:'/admin/items',        label:'Menu Items',   icon:'⊞' },
  { href:'/admin/analytics',    label:'Analytics',    icon:'◎' },
  { href:'/admin/qrcode',       label:'QR Code',      icon:'⬡' },
  { href:'/admin/offers',       label:'Offers',       icon:'◇' },
  { href:'/admin/subscription', label:'Subscription', icon:'◉' },
];

export default function AdminLayout({ children }) {
  const { user, userData, loading, signOut } = useAuth();
  const router = useRouter();
  const [theme, setTheme] = useState('dark');

  useEffect(() => {
    const saved = typeof window !== 'undefined' ? localStorage.getItem('ar_admin_theme') : null;
    if (saved === 'light' || saved === 'dark') setTheme(saved);
  }, []);

  const toggle = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    if (typeof window !== 'undefined') localStorage.setItem('ar_admin_theme', next);
  };

  useEffect(() => { if (!loading && !user) router.push('/admin/login'); }, [user, loading, router]);

  const gold = '#B8962E';

  if (loading || !user) return (
    <div style={{minHeight:'100vh',background:'var(--ar-bg,#08090C)',display:'flex',alignItems:'center',justifyContent:'center'}}>
      <div style={{width:32,height:32,border:`2px solid ${gold}`,borderTopColor:'transparent',borderRadius:'50%',animation:'spin 0.8s linear infinite'}}/>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );

  const isActive = (h) => h === '/admin' ? router.pathname === '/admin' : router.pathname.startsWith(h);

  return (
    <ThemeContext.Provider value={{ theme, toggle }}>
      <div data-ar-theme={theme} style={{minHeight:'100vh',background:'var(--ar-bg)',fontFamily:`'Bricolage Grotesque',Inter,sans-serif`,color:'var(--ar-text)',display:'flex'}}>
        <style>{`
          ${FONTS}
          @keyframes spin{to{transform:rotate(360deg)}}
          *{box-sizing:border-box}

          [data-ar-theme="dark"]{
            --ar-bg:#08090C;--ar-sidebar:#07080B;--ar-card:rgba(255,255,255,0.03);
            --ar-card-solid:#0D0E12;--ar-border:rgba(255,255,255,0.07);
            --ar-text:rgba(255,255,255,0.82);--ar-text-dim:rgba(255,255,255,0.32);
            --ar-text-mid:rgba(255,255,255,0.55);--ar-hover:rgba(255,255,255,0.05);
            --ar-hover2:rgba(255,255,255,0.08);--ar-scrollthumb:rgba(255,255,255,0.08);
          }
          [data-ar-theme="light"]{
            --ar-bg:#F4F3EF;--ar-sidebar:#FAFAF8;--ar-card:rgba(0,0,0,0.03);
            --ar-card-solid:#FFFFFF;--ar-border:rgba(0,0,0,0.08);
            --ar-text:rgba(0,0,0,0.82);--ar-text-dim:rgba(0,0,0,0.4);
            --ar-text-mid:rgba(0,0,0,0.6);--ar-hover:rgba(0,0,0,0.04);
            --ar-hover2:rgba(0,0,0,0.07);--ar-scrollthumb:rgba(0,0,0,0.12);
          }

          .anlnk{display:flex;align-items:center;gap:10px;padding:9px 12px;border-radius:8px;font-size:13px;font-weight:500;text-decoration:none;color:var(--ar-text-dim);transition:all 0.15s;margin-bottom:2px;}
          .anlnk:hover{background:var(--ar-hover);color:var(--ar-text-mid);}
          .anlnk.on{background:rgba(184,150,46,0.1);color:#C4A840;border:1px solid rgba(184,150,46,0.18);}

          .gcard{background:var(--ar-card)!important;border:1px solid var(--ar-border)!important;border-radius:12px;padding:20px;transition:border-color 0.2s;}
          .gcard:hover{border-color:var(--ar-hover2)!important;}
          .gacard{background:var(--ar-card)!important;border:1px solid var(--ar-border)!important;border-radius:12px;padding:20px;text-decoration:none;color:var(--ar-text)!important;display:block;transition:all 0.2s;}
          .gacard:hover{background:rgba(184,150,46,0.06)!important;border-color:rgba(184,150,46,0.2)!important;transform:translateY(-2px);}
          .rrow{display:flex;align-items:center;gap:12px;padding:11px 0;border-bottom:1px solid var(--ar-border);}
          .rrow:last-child{border-bottom:none;}
          .prog{height:4px;border-radius:2px;overflow:hidden;background:var(--ar-border);}
          .pfill{height:100%;border-radius:2px;transition:width 0.5s;}

          [data-ar-theme="light"] h1,[data-ar-theme="light"] h2{color:rgba(0,0,0,0.88)!important;}
          [data-ar-theme="light"] p,[data-ar-theme="light"] span,[data-ar-theme="light"] div{color:inherit;}

          .theme-toggle-btn{
            display:flex;align-items:center;gap:8px;padding:7px 12px;border-radius:8px;
            cursor:pointer;border:1px solid var(--ar-border);background:var(--ar-card);
            color:var(--ar-text-dim);font-size:11px;font-weight:600;transition:all 0.15s;
            font-family:'DM Mono',monospace;letter-spacing:0.05em;width:100%;margin-bottom:6px;
          }
          .theme-toggle-btn:hover{border-color:rgba(184,150,46,0.3);color:#B8962E;}
          .theme-track{width:28px;height:16px;border-radius:8px;position:relative;transition:background 0.3s;flex-shrink:0;margin-left:auto;}
          [data-ar-theme="dark"] .theme-track{background:rgba(255,255,255,0.15);}
          [data-ar-theme="light"] .theme-track{background:rgba(184,150,46,0.35);}
          .theme-knob{position:absolute;top:3px;width:10px;height:10px;border-radius:50%;background:#B8962E;transition:left 0.3s;}
          [data-ar-theme="dark"] .theme-knob{left:3px;}
          [data-ar-theme="light"] .theme-knob{left:15px;}

          ::-webkit-scrollbar{width:4px}::-webkit-scrollbar-thumb{background:var(--ar-scrollthumb);border-radius:2px}
        `}</style>

        <aside style={{width:214,flexShrink:0,background:'var(--ar-sidebar)',borderRight:'1px solid var(--ar-border)',display:'flex',flexDirection:'column',position:'fixed',inset:'0 auto 0 0',zIndex:20}}>
          <div style={{height:1,background:`linear-gradient(90deg,transparent,${gold}55,transparent)`}}/>
          <div style={{padding:'20px 16px 14px',borderBottom:'1px solid var(--ar-border)'}}>
            <Link href="/" style={{textDecoration:'none'}}>
              <div style={{fontWeight:800,fontSize:16,color:'var(--ar-text)',letterSpacing:'-0.01em'}}>
                Advert <span style={{color:gold}}>Radical</span>
              </div>
            </Link>
            <div style={{fontSize:10,color:'var(--ar-text-dim)',marginTop:4,fontWeight:500,letterSpacing:'0.1em',textTransform:'uppercase',fontFamily:`'DM Mono',monospace`}}>Restaurant Portal</div>
          </div>
          <nav style={{flex:1,padding:'12px 8px',overflowY:'auto'}}>
            {navItems.map(item => (
              <Link key={item.href} href={item.href} className={`anlnk${isActive(item.href)?' on':''}`}>
                <span style={{fontSize:12,width:18,textAlign:'center',opacity:0.6}}>{item.icon}</span>
                {item.label}
              </Link>
            ))}
          </nav>
          <div style={{padding:'10px 8px',borderTop:'1px solid var(--ar-border)'}}>
            <button className="theme-toggle-btn" onClick={toggle}>
              <span>{theme==='dark' ? '◑' : '◐'}</span>
              <span>{theme==='dark' ? 'Dark mode' : 'Light mode'}</span>
              <div className="theme-track"><div className="theme-knob"/></div>
            </button>
            <div style={{padding:'10px 12px',marginBottom:6,background:'var(--ar-card)',borderRadius:8,border:'1px solid var(--ar-border)'}}>
              <div style={{fontSize:12,fontWeight:600,color:'var(--ar-text-mid)',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>
                {userData?.restaurantName || userData?.email || user.email}
              </div>
              <div style={{fontSize:10,color:'var(--ar-text-dim)',marginTop:2,fontFamily:`'DM Mono',monospace`}}>Admin</div>
            </div>
            <button onClick={signOut}
              style={{width:'100%',padding:'8px 12px',borderRadius:8,border:'none',background:'transparent',fontSize:12,color:'var(--ar-text-dim)',cursor:'pointer',textAlign:'left',transition:'all 0.15s',fontFamily:'inherit'}}
              onMouseOver={e=>{e.currentTarget.style.background='rgba(184,150,46,0.07)';e.currentTarget.style.color=gold}}
              onMouseOut={e=>{e.currentTarget.style.background='transparent';e.currentTarget.style.color=''}}>
              Sign out →
            </button>
          </div>
        </aside>

        <main style={{flex:1,marginLeft:214,minHeight:'100vh',overflowY:'auto'}}>{children}</main>
      </div>
    </ThemeContext.Provider>
  );
}
