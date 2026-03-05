import Head from 'next/head';
import { useEffect, useState } from 'react';
import { useAuth } from '../../hooks/useAuth';
import AdminLayout from '../../components/layout/AdminLayout';
import { getRestaurantById, getMenuItems, getRequests, getAnalytics } from '../../lib/db';
import Link from 'next/link';

export default function AdminDashboard() {
  const { userData } = useAuth();
  const [restaurant, setRestaurant] = useState(null);
  const [menuItems, setMenuItems] = useState([]);
  const [requests, setRequests] = useState([]);
  const [analytics, setAnalytics] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userData?.restaurantId) return;
    const rid = userData.restaurantId;
    Promise.all([getRestaurantById(rid), getMenuItems(rid), getRequests(rid), getAnalytics(rid, 7)])
      .then(([r, items, reqs, anal]) => { setRestaurant(r); setMenuItems(items); setRequests(reqs); setAnalytics(anal); setLoading(false); });
  }, [userData]);

  if (loading) return (
    <AdminLayout>
      <div style={{display:'flex',alignItems:'center',justifyContent:'center',height:300}}>
        <div style={{width:36,height:36,border:'2.5px solid #FF6B35',borderTopColor:'transparent',borderRadius:'50%',animation:'spin 0.8s linear infinite'}}/>
        <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      </div>
    </AdminLayout>
  );

  const totalVisits = analytics.reduce((s, d) => s + (d.totalVisits||0), 0);
  const pendingCount = requests.filter(r => r.status === 'pending').length;
  const storageUsedPct = restaurant ? Math.round(((restaurant.storageUsedMB||0)/(restaurant.maxStorageMB||500))*100) : 0;
  const itemsPct = restaurant ? Math.round(((restaurant.itemsUsed||0)/(restaurant.maxItems||10))*100) : 0;
  const planColors = { basic:'rgba(255,255,255,0.5)', pro:'#FF8C5A', premium:'#FFB347' };
  const planColor = planColors[restaurant?.plan] || 'rgba(255,255,255,0.5)';

  const stats = [
    { label:'Visits (7 days)', value:totalVisits, icon:'👁', grad:'linear-gradient(135deg,rgba(255,107,53,0.2),rgba(255,179,71,0.1))' },
    { label:'Menu Items', value:restaurant?.itemsUsed||menuItems.length, icon:'🍽️', grad:'linear-gradient(135deg,rgba(34,197,94,0.15),rgba(16,185,129,0.08))' },
    { label:'Pending Requests', value:pendingCount, icon:'📋', grad:'linear-gradient(135deg,rgba(245,158,11,0.2),rgba(251,191,36,0.1))' },
    { label:'Plan', value:(restaurant?.plan||'basic').toUpperCase(), icon:'💳', grad:'linear-gradient(135deg,rgba(147,100,255,0.2),rgba(168,85,247,0.1))' },
  ];

  const actions = [
    { href:'/admin/requests',  icon:'➕', label:'Add Menu Item', sub:'Submit a new item request', c:'rgba(255,107,53,0.15)' },
    { href:'/admin/analytics', icon:'📈', label:'Analytics', sub:'Visits & AR interactions', c:'rgba(34,197,94,0.1)' },
    { href:'/admin/qrcode',    icon:'⬡',  label:'QR Code', sub:'Print for tables & menus', c:'rgba(147,100,255,0.15)' },
    { href:'/admin/offers',    icon:'🎁', label:'Create Offer', sub:'Add a promo banner', c:'rgba(255,179,71,0.12)' },
  ];

  return (
    <AdminLayout>
      <Head><title>Dashboard — Advert Radical</title></Head>
      <div style={{padding:'32px',maxWidth:960,margin:'0 auto'}}>
        <style>{`
          .sc{border-radius:20px;padding:22px;border:1px solid rgba(255,255,255,0.1);backdropFilter:'blur(12px)';}
          .ac{border-radius:20px;padding:20px;border:1px solid rgba(255,255,255,0.08);text-decoration:none;color:#F0EEF8;display:block;transition:all 0.22s;backdrop-filter:blur(12px);}
          .ac:hover{border-color:rgba(255,107,53,0.3);transform:translateY(-3px);box-shadow:0 16px 40px rgba(0,0,0,0.3);}
          .rr{display:flex;align-items:center;gap:12px;padding:12px 0;border-bottom:1px solid rgba(255,255,255,0.06);}
          .rr:last-child{border-bottom:none;}
          .prog{height:6px;border-radius:3px;overflow:hidden;background:rgba(255,255,255,0.08);}
          .prog-fill{height:100%;border-radius:3px;}
        `}</style>

        {/* Header */}
        <div style={{display:'flex',alignItems:'flex-start',justifyContent:'space-between',marginBottom:28,flexWrap:'wrap',gap:12}}>
          <div>
            <h1 style={{fontFamily:'Poppins,sans-serif',fontWeight:800,fontSize:24,color:'#F0EEF8',margin:0}}>
              {restaurant?.name || 'Your Restaurant'}
            </h1>
            <p style={{fontSize:13,color:'rgba(255,255,255,0.35)',marginTop:5}}>{restaurant?.subdomain}.advertradical.com</p>
          </div>
          <div style={{display:'flex',gap:8}}>
            <span style={{padding:'6px 14px',borderRadius:20,fontSize:12,fontWeight:600,textTransform:'capitalize',background:`${planColor}20`,color:planColor,border:`1px solid ${planColor}35`}}>
              {restaurant?.plan||'basic'} plan
            </span>
            <span style={{padding:'6px 14px',borderRadius:20,fontSize:12,fontWeight:600,background:restaurant?.isActive?'rgba(34,197,94,0.12)':'rgba(255,255,255,0.06)',color:restaurant?.isActive?'#4ade80':'rgba(255,255,255,0.35)',border:`1px solid ${restaurant?.isActive?'rgba(34,197,94,0.25)':'rgba(255,255,255,0.08)'}`}}>
              {restaurant?.isActive ? '● Active' : '○ Inactive'}
            </span>
          </div>
        </div>

        {/* Stats */}
        <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(180px,1fr))',gap:12,marginBottom:20}}>
          {stats.map(s => (
            <div key={s.label} className="sc" style={{background:s.grad,backdropFilter:'blur(12px)',WebkitBackdropFilter:'blur(12px)'}}>
              <div style={{fontSize:24,marginBottom:10}}>{s.icon}</div>
              <div style={{fontFamily:'Poppins,sans-serif',fontWeight:800,fontSize:28,color:'#F0EEF8'}}>{s.value}</div>
              <div style={{fontSize:12,color:'rgba(255,255,255,0.45)',marginTop:3}}>{s.label}</div>
            </div>
          ))}
        </div>

        {/* Usage */}
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12,marginBottom:20}}>
          {[
            {label:'Storage Used',used:restaurant?.storageUsedMB||0,max:restaurant?.maxStorageMB||500,unit:'MB',pct:storageUsedPct},
            {label:'AR Items Used',used:restaurant?.itemsUsed||0,max:restaurant?.maxItems||10,unit:'items',pct:itemsPct},
          ].map(u => (
            <div key={u.label} style={{background:'rgba(255,255,255,0.05)',backdropFilter:'blur(12px)',WebkitBackdropFilter:'blur(12px)',borderRadius:20,padding:22,border:'1px solid rgba(255,255,255,0.08)'}}>
              <div style={{display:'flex',justifyContent:'space-between',fontSize:13,marginBottom:12}}>
                <span style={{fontWeight:600,color:'rgba(255,255,255,0.8)'}}>{u.label}</span>
                <span style={{color:'rgba(255,255,255,0.35)'}}>{u.used} / {u.max} {u.unit}</span>
              </div>
              <div className="prog">
                <div className="prog-fill" style={{width:`${u.pct}%`,background:u.pct>80?'#EF4444':'linear-gradient(90deg,#FF6B35,#FFB347)',boxShadow:u.pct>80?'none':'0 0 8px rgba(255,107,53,0.4)'}}/>
              </div>
              <div style={{fontSize:11,color:'rgba(255,255,255,0.25)',marginTop:7}}>{u.pct}% used</div>
            </div>
          ))}
        </div>

        {/* Actions */}
        <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(180px,1fr))',gap:12,marginBottom:20}}>
          {actions.map(a => (
            <Link key={a.href} href={a.href} className="ac" style={{background:a.c,backdropFilter:'blur(12px)',WebkitBackdropFilter:'blur(12px)'}}>
              <div style={{fontSize:24,marginBottom:10}}>{a.icon}</div>
              <div style={{fontWeight:600,fontSize:14,color:'rgba(255,255,255,0.9)',marginBottom:4}}>{a.label}</div>
              <div style={{fontSize:12,color:'rgba(255,255,255,0.4)'}}>{a.sub}</div>
            </Link>
          ))}
        </div>

        {/* Recent requests */}
        {requests.length > 0 && (
          <div style={{background:'rgba(255,255,255,0.04)',backdropFilter:'blur(12px)',WebkitBackdropFilter:'blur(12px)',borderRadius:20,padding:24,border:'1px solid rgba(255,255,255,0.08)'}}>
            <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:16}}>
              <h2 style={{fontFamily:'Poppins,sans-serif',fontWeight:700,fontSize:16,color:'rgba(255,255,255,0.9)',margin:0}}>Recent Requests</h2>
              <Link href="/admin/requests" style={{fontSize:12,color:'#FF8C5A',textDecoration:'none',fontWeight:600}}>View all →</Link>
            </div>
            {requests.slice(0,5).map(req => (
              <div key={req.id} className="rr">
                <div style={{width:36,height:36,borderRadius:10,overflow:'hidden',background:'rgba(255,255,255,0.08)',flexShrink:0}}>
                  {req.imageURL ? <img src={req.imageURL} alt={req.name} style={{width:'100%',height:'100%',objectFit:'cover'}}/> : <div style={{width:'100%',height:'100%',display:'flex',alignItems:'center',justifyContent:'center',fontSize:16}}>🍽️</div>}
                </div>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontSize:13,fontWeight:600,color:'rgba(255,255,255,0.85)',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{req.name}</div>
                  <div style={{fontSize:11,color:'rgba(255,255,255,0.3)'}}>{req.createdAt?.seconds ? new Date(req.createdAt.seconds*1000).toLocaleDateString() : 'Just now'}</div>
                </div>
                <StatusBadge status={req.status}/>
              </div>
            ))}
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
AdminDashboard.getLayout = (page) => page;

function StatusBadge({ status }) {
  const s = {
    pending: {bg:'rgba(245,158,11,0.15)',color:'#FCD34D',border:'rgba(245,158,11,0.3)'},
    approved:{bg:'rgba(34,197,94,0.12)',color:'#4ade80',border:'rgba(34,197,94,0.25)'},
    rejected:{bg:'rgba(239,68,68,0.12)',color:'#f87171',border:'rgba(239,68,68,0.25)'},
  };
  const c = s[status]||s.pending;
  return <span style={{padding:'3px 10px',borderRadius:20,fontSize:11,fontWeight:600,background:c.bg,color:c.color,border:`1px solid ${c.border}`,textTransform:'capitalize'}}>{status}</span>;
}
