import Head from 'next/head';
import { useEffect, useState } from 'react';
import { useAuth } from '../../hooks/useAuth';
import AdminLayout from '../../components/layout/AdminLayout';
import { getRestaurantById, getMenuItems, getRequests, getAnalytics } from '../../lib/db';
import Link from 'next/link';

export default function AdminDashboard() {
  const { userData } = useAuth();
  const [restaurant, setRestaurant] = useState(null);
  const [menuItems,  setMenuItems]  = useState([]);
  const [requests,   setRequests]   = useState([]);
  const [analytics,  setAnalytics]  = useState([]);
  const [loading,    setLoading]    = useState(true);

  useEffect(() => {
    if (!userData?.restaurantId) return;
    const rid = userData.restaurantId;
    Promise.all([getRestaurantById(rid), getMenuItems(rid), getRequests(rid), getAnalytics(rid, 7)])
      .then(([r, items, reqs, anal]) => { setRestaurant(r); setMenuItems(items); setRequests(reqs); setAnalytics(anal); setLoading(false); });
  }, [userData]);

  if (loading) return (
    <AdminLayout>
      <div style={{display:'flex',alignItems:'center',justifyContent:'center',height:300}}>
        <div style={{width:32,height:32,border:'2.5px solid #FF6B35',borderTopColor:'transparent',borderRadius:'50%',animation:'spin 0.8s linear infinite'}} />
        <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      </div>
    </AdminLayout>
  );

  const totalVisits    = analytics.reduce((s, d) => s + (d.totalVisits || 0), 0);
  const pendingCount   = requests.filter(r => r.status === 'pending').length;
  const storageUsedPct = restaurant ? Math.round(((restaurant.storageUsedMB||0)/(restaurant.maxStorageMB||500))*100) : 0;
  const itemsPct       = restaurant ? Math.round(((restaurant.itemsUsed||0)/(restaurant.maxItems||10))*100) : 0;
  const planColors     = { basic:'#6B6460', pro:'#FF6B35', premium:'#FFB347' };
  const planColor      = planColors[restaurant?.plan] || '#6B6460';

  const stats = [
    { label:'Visits (7 days)',    value: totalVisits,                            icon:'👁', color:'#FF6B35' },
    { label:'Menu Items',         value: restaurant?.itemsUsed || menuItems.length, icon:'🍽️', color:'#22C55E' },
    { label:'Pending Requests',   value: pendingCount,                           icon:'📋', color:'#F59E0B' },
    { label:'Plan',               value: (restaurant?.plan||'basic').toUpperCase(), icon:'💳', color: planColor },
  ];

  const actions = [
    { href:'/admin/requests',  icon:'➕', label:'Add Menu Item',    sub:'Submit a new item request' },
    { href:'/admin/analytics', icon:'📈', label:'View Analytics',   sub:'Visits & AR interactions' },
    { href:'/admin/qrcode',    icon:'⬡',  label:'Download QR Code', sub:'Print for tables & menus' },
    { href:'/admin/offers',    icon:'🎁', label:'Create Offer',     sub:'Add a promo banner' },
  ];

  return (
    <AdminLayout>
      <Head><title>Dashboard — Advert Radical</title></Head>
      <div style={{padding:'32px',maxWidth:960,margin:'0 auto'}}>
        <style>{`
          .stat-card{background:#fff;border-radius:16px;padding:20px;border:1px solid #E2DED8;box-shadow:0 2px 8px rgba(0,0,0,0.04);}
          .action-card{background:#fff;border-radius:16px;padding:20px;border:1px solid #E2DED8;text-decoration:none;color:#1C1917;display:block;transition:all 0.2s;}
          .action-card:hover{border-color:#FF6B35;box-shadow:0 4px 16px rgba(255,107,53,0.12);transform:translateY(-1px);}
          .progress-bar{height:6px;border-radius:3px;overflow:hidden;background:#F0EDE8;}
          .progress-fill{height:100%;border-radius:3px;transition:width 0.5s;}
          .req-row{display:flex;align-items:center;gap:12px;padding:12px 0;border-bottom:1px solid #F0EDE8;}
          .req-row:last-child{border-bottom:none;}
        `}</style>

        {/* Header */}
        <div style={{display:'flex',alignItems:'flex-start',justifyContent:'space-between',marginBottom:28,flexWrap:'wrap',gap:12}}>
          <div>
            <h1 style={{fontFamily:'"Plus Jakarta Sans",sans-serif',fontWeight:800,fontSize:24,color:'#1C1917',margin:0}}>
              {restaurant?.name || 'Your Restaurant'}
            </h1>
            <p style={{fontSize:13,color:'#A09890',marginTop:4}}>{restaurant?.subdomain}.advertradical.com</p>
          </div>
          <div style={{display:'flex',gap:8,alignItems:'center'}}>
            <span style={{padding:'5px 12px',borderRadius:20,fontSize:12,fontWeight:600,textTransform:'capitalize',background:`${planColor}18`,color:planColor,border:`1px solid ${planColor}30`}}>
              {restaurant?.plan||'basic'} plan
            </span>
            <span style={{padding:'5px 12px',borderRadius:20,fontSize:12,fontWeight:600,background:restaurant?.isActive?'#DCFCE7':'#F0EDE8',color:restaurant?.isActive?'#16A34A':'#A09890',border:`1px solid ${restaurant?.isActive?'#BBF7D0':'#E2DED8'}`}}>
              {restaurant?.isActive ? '● Active' : '○ Inactive'}
            </span>
          </div>
        </div>

        {/* Stats */}
        <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(180px,1fr))',gap:12,marginBottom:24}}>
          {stats.map(s => (
            <div key={s.label} className="stat-card">
              <div style={{fontSize:22,marginBottom:8}}>{s.icon}</div>
              <div style={{fontFamily:'"Plus Jakarta Sans",sans-serif',fontWeight:800,fontSize:28,color:s.color}}>{s.value}</div>
              <div style={{fontSize:12,color:'#A09890',marginTop:2}}>{s.label}</div>
            </div>
          ))}
        </div>

        {/* Usage */}
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12,marginBottom:24}}>
          {[
            { label:'Storage Used', used:restaurant?.storageUsedMB||0, max:restaurant?.maxStorageMB||500, unit:'MB', pct:storageUsedPct },
            { label:'AR Items Used', used:restaurant?.itemsUsed||0, max:restaurant?.maxItems||10, unit:'items', pct:itemsPct },
          ].map(u => (
            <div key={u.label} style={{background:'#fff',borderRadius:16,padding:20,border:'1px solid #E2DED8',boxShadow:'0 2px 8px rgba(0,0,0,0.04)'}}>
              <div style={{display:'flex',justifyContent:'space-between',fontSize:13,marginBottom:12}}>
                <span style={{fontWeight:600,color:'#1C1917'}}>{u.label}</span>
                <span style={{color:'#A09890'}}>{u.used} / {u.max} {u.unit}</span>
              </div>
              <div className="progress-bar">
                <div className="progress-fill" style={{width:`${u.pct}%`,background:u.pct>80?'#EF4444':'linear-gradient(90deg,#FF6B35,#FFB347)'}} />
              </div>
              <div style={{fontSize:11,color:'#A09890',marginTop:6}}>{u.pct}% used</div>
            </div>
          ))}
        </div>

        {/* Quick actions */}
        <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(180px,1fr))',gap:12,marginBottom:24}}>
          {actions.map(a => (
            <Link key={a.href} href={a.href} className="action-card">
              <div style={{fontSize:22,marginBottom:10}}>{a.icon}</div>
              <div style={{fontWeight:600,fontSize:14,color:'#1C1917',marginBottom:3}}>{a.label}</div>
              <div style={{fontSize:12,color:'#A09890'}}>{a.sub}</div>
            </Link>
          ))}
        </div>

        {/* Recent requests */}
        {requests.length > 0 && (
          <div style={{background:'#fff',borderRadius:16,padding:24,border:'1px solid #E2DED8',boxShadow:'0 2px 8px rgba(0,0,0,0.04)'}}>
            <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:16}}>
              <h2 style={{fontFamily:'"Plus Jakarta Sans",sans-serif',fontWeight:700,fontSize:16,color:'#1C1917',margin:0}}>Recent Requests</h2>
              <Link href="/admin/requests" style={{fontSize:12,color:'#FF6B35',textDecoration:'none',fontWeight:600}}>View all →</Link>
            </div>
            {requests.slice(0, 5).map(req => (
              <div key={req.id} className="req-row">
                <div style={{width:36,height:36,borderRadius:10,overflow:'hidden',background:'#F0EDE8',flexShrink:0}}>
                  {req.imageURL ? <img src={req.imageURL} alt={req.name} style={{width:'100%',height:'100%',objectFit:'cover'}} /> : <div style={{width:'100%',height:'100%',display:'flex',alignItems:'center',justifyContent:'center',fontSize:16}}>🍽️</div>}
                </div>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontSize:13,fontWeight:600,color:'#1C1917',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{req.name}</div>
                  <div style={{fontSize:11,color:'#A09890'}}>{req.createdAt?.seconds ? new Date(req.createdAt.seconds*1000).toLocaleDateString() : 'Just now'}</div>
                </div>
                <StatusBadge status={req.status} />
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
  const s = { pending:{bg:'#FEF9C3',color:'#854D0E',border:'#FDE68A'}, approved:{bg:'#DCFCE7',color:'#166534',border:'#BBF7D0'}, rejected:{bg:'#FEE2E2',color:'#991B1B',border:'#FECACA'} };
  const c = s[status] || s.pending;
  return <span style={{padding:'3px 10px',borderRadius:20,fontSize:11,fontWeight:600,background:c.bg,color:c.color,border:`1px solid ${c.border}`,textTransform:'capitalize'}}>{status}</span>;
}
