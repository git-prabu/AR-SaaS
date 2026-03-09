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
        <div style={{width:36,height:36,border:'3px solid #E05A3A',borderTopColor:'transparent',borderRadius:'50%',animation:'spin 0.8s linear infinite'}}/>
        <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      </div>
    </AdminLayout>
  );

  const totalVisits = analytics.reduce((s, d) => s + (d.totalVisits||0), 0);
  const pendingCount = requests.filter(r => r.status === 'pending').length;
  const storageUsedPct = restaurant ? Math.round(((restaurant.storageUsedMB||0)/(restaurant.maxStorageMB||500))*100) : 0;
  const itemsPct = restaurant ? Math.round(((restaurant.itemsUsed||0)/(restaurant.maxItems||10))*100) : 0;
  const PLAN_MAP = {
    starter: { label:'Starter', color:'#5A8AC4', bg:'rgba(90,138,196,0.12)' },
    growth:  { label:'Growth',  color:'#E05A3A', bg:'rgba(224,90,58,0.12)'  },
    pro:     { label:'Pro',     color:'#8A5AC4', bg:'rgba(138,90,196,0.12)' },
  };
  const planInfo  = PLAN_MAP[restaurant?.plan] || PLAN_MAP['starter'];
  const planColor = planInfo.color;

  // Subscription expiry
  const subEnd    = restaurant?.subscriptionEnd;
  const daysLeft  = subEnd ? Math.max(0, Math.ceil((new Date(subEnd) - new Date()) / 86400000)) : null;
  const isExpired = subEnd && new Date(subEnd) < new Date();
  const isInactive = restaurant?.paymentStatus && restaurant.paymentStatus !== 'active';
  const showExpiredBanner = isExpired || isInactive;
  const showWarnBanner = !showExpiredBanner && daysLeft !== null && daysLeft <= 7;

  const stats = [
    { label:'Visits (7d)', value:totalVisits, icon:'👁', bg:'rgba(255,255,255,0.65)', accent:'#E05A3A' },
    { label:'Menu Items',  value:restaurant?.itemsUsed||menuItems.length, icon:'🍽️', bg:'rgba(143,196,168,0.3)', accent:'#4A7A5A' },
    { label:'Pending',     value:pendingCount, icon:'📋', bg:'rgba(244,200,100,0.3)', accent:'#B07820' },
    { label:'Plan', value:planInfo.label, icon:'💳', bg:planInfo.bg, accent:planInfo.color },
  ];

  const actions = [
    { href:'/admin/requests',  icon:'➕', label:'Add Menu Item',  sub:'Submit a new item request', bg:'rgba(224,90,58,0.12)' },
    { href:'/admin/analytics', icon:'📈', label:'Analytics',      sub:'Visits & AR interactions',  bg:'rgba(143,196,168,0.2)' },
    { href:'/admin/qrcode',    icon:'⬡',  label:'QR Code',       sub:'Print for tables & menus',  bg:'rgba(196,181,212,0.25)' },
    { href:'/admin/offers',    icon:'🎁', label:'Create Offer',   sub:'Add a promo banner',        bg:'rgba(244,160,100,0.2)' },
  ];

  return (
    <AdminLayout>
      <Head><title>Dashboard — Advert Radical</title></Head>
      <div style={{padding:32,maxWidth:960,margin:'0 auto'}}>
        <style>{`
          .cc{border-radius:20px;padding:20px;border:1.5px solid rgba(255,220,170,0.5);box-shadow:0 6px 24px rgba(120,70,30,0.1),inset 0 1px 0 rgba(255,255,255,0.6);}
          .ac{border-radius:20px;padding:20px;border:1.5px solid rgba(255,220,170,0.4);text-decoration:none;color:#2A1F10;display:block;transition:all 0.22s;box-shadow:0 4px 16px rgba(120,70,30,0.08),inset 0 1px 0 rgba(255,255,255,0.5);}
          .ac:hover{transform:translateY(-4px) scale(1.02);box-shadow:0 12px 32px rgba(120,70,30,0.16);}
          .rr{display:flex;align-items:center;gap:12px;padding:12px 0;border-bottom:1px solid rgba(200,140,80,0.15);}
          .rr:last-child{border-bottom:none;}
          .prog{height:8px;border-radius:4px;overflow:hidden;background:rgba(200,140,80,0.15);}
          .pfill{height:100%;border-radius:4px;transition:width 0.5s;}
        `}</style>

        {/* Page header */}
        <div style={{display:'flex',alignItems:'flex-start',justifyContent:'space-between',marginBottom:28,flexWrap:'wrap',gap:12}}>
          <div>
            <h1 style={{fontFamily:'Poppins,sans-serif',fontWeight:800,fontSize:24,color:'#2A1F10',margin:0}}>
              {restaurant?.name || 'Your Restaurant'}
            </h1>
            <p style={{fontSize:13,color:'rgba(42,31,16,0.45)',marginTop:5}}>{restaurant?.subdomain}.advertradical.com</p>
          </div>
          <div style={{display:'flex',gap:8}}>
            <span style={{padding:'6px 14px',borderRadius:20,fontSize:12,fontWeight:700,textTransform:'capitalize',background:`${planColor}18`,color:planColor,border:`1.5px solid ${planColor}30`}}>
              {planInfo.label} Plan
            </span>
            <span style={{padding:'6px 14px',borderRadius:20,fontSize:12,fontWeight:700,background:restaurant?.isActive?'rgba(74,122,90,0.12)':'rgba(160,120,80,0.1)',color:restaurant?.isActive?'#3A6A48':'rgba(100,60,30,0.5)',border:`1.5px solid ${restaurant?.isActive?'rgba(74,122,90,0.3)':'rgba(160,120,80,0.2)'}`}}>
              {restaurant?.isActive?'● Active':'○ Inactive'}
            </span>
          </div>
        </div>


        {/* Subscription banners */}
        {showExpiredBanner && (
          <div style={{background:'rgba(200,30,30,0.07)',border:'1.5px solid rgba(200,30,30,0.25)',borderRadius:16,padding:'16px 20px',marginBottom:20,display:'flex',alignItems:'center',gap:14}}>
            <div style={{fontSize:28,flexShrink:0}}>🚫</div>
            <div style={{flex:1}}>
              <div style={{fontWeight:800,fontSize:15,color:'#8B1A1A',marginBottom:3}}>Your subscription has expired</div>
              <div style={{fontSize:13,color:'rgba(100,30,30,0.7)'}}>Your public menu is currently hidden from customers. Contact <strong>support@advertradical.com</strong> to renew your plan and reactivate your menu.</div>
            </div>
          </div>
        )}
        {showWarnBanner && (
          <div style={{background:'rgba(224,90,58,0.06)',border:'1.5px solid rgba(224,90,58,0.3)',borderRadius:16,padding:'16px 20px',marginBottom:20,display:'flex',alignItems:'center',gap:14}}>
            <div style={{fontSize:28,flexShrink:0}}>⚠️</div>
            <div style={{flex:1}}>
              <div style={{fontWeight:800,fontSize:15,color:'#B03010',marginBottom:3}}>Subscription expiring in {daysLeft} day{daysLeft===1?'':'s'}</div>
              <div style={{fontSize:13,color:'rgba(100,40,20,0.65)'}}>Your menu will become unavailable on <strong>{subEnd}</strong>. Contact us at <strong>support@advertradical.com</strong> to renew.</div>
            </div>
          </div>
        )}

        {/* Stats */}
        <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(175px,1fr))',gap:12,marginBottom:20}}>
          {stats.map(s=>(
            <div key={s.label} className="cc" style={{background:s.bg,backdropFilter:'blur(8px)',WebkitBackdropFilter:'blur(8px)'}}>
              <div style={{fontSize:26,marginBottom:10}}>{s.icon}</div>
              <div style={{fontFamily:'Poppins,sans-serif',fontWeight:800,fontSize:28,color:s.accent}}>{s.value}</div>
              <div style={{fontSize:12,color:'rgba(42,31,16,0.5)',marginTop:3}}>{s.label}</div>
            </div>
          ))}
        </div>

        {/* Usage bars */}
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12,marginBottom:20}}>
          {[
            {label:'Storage Used',used:restaurant?.storageUsedMB||0,max:restaurant?.maxStorageMB||500,unit:'MB',pct:storageUsedPct},
            {label:'AR Items Used',used:restaurant?.itemsUsed||0,max:restaurant?.maxItems||10,unit:'items',pct:itemsPct},
          ].map(u=>(
            <div key={u.label} className="cc" style={{background:'rgba(255,245,220,0.7)',backdropFilter:'blur(8px)',WebkitBackdropFilter:'blur(8px)'}}>
              <div style={{display:'flex',justifyContent:'space-between',fontSize:13,marginBottom:12}}>
                <span style={{fontWeight:700,color:'#2A1F10'}}>{u.label}</span>
                <span style={{color:'rgba(100,60,30,0.5)'}}>{u.used}/{u.max} {u.unit}</span>
              </div>
              <div className="prog">
                <div className="pfill" style={{width:`${u.pct}%`,background:u.pct>80?'#DC3030':'linear-gradient(90deg,#E05A3A,#F4A86A)',boxShadow:u.pct>80?'none':'0 0 8px rgba(224,90,58,0.4)'}}/>
              </div>
              <div style={{fontSize:11,color:'rgba(100,60,30,0.4)',marginTop:6}}>{u.pct}% used</div>
            </div>
          ))}
        </div>

        {/* Quick actions */}
        <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(175px,1fr))',gap:12,marginBottom:20}}>
          {actions.map(a=>(
            <Link key={a.href} href={a.href} className="ac" style={{background:a.bg,backdropFilter:'blur(8px)',WebkitBackdropFilter:'blur(8px)'}}>
              <div style={{fontSize:26,marginBottom:10}}>{a.icon}</div>
              <div style={{fontWeight:700,fontSize:14,color:'#2A1F10',marginBottom:4}}>{a.label}</div>
              <div style={{fontSize:12,color:'rgba(42,31,16,0.45)'}}>{a.sub}</div>
            </Link>
          ))}
        </div>

        {/* Recent requests */}
        {requests.length > 0 && (
          <div className="cc" style={{background:'rgba(255,245,220,0.7)',backdropFilter:'blur(8px)',WebkitBackdropFilter:'blur(8px)',padding:24}}>
            <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:16}}>
              <h2 style={{fontFamily:'Poppins,sans-serif',fontWeight:800,fontSize:16,color:'#2A1F10',margin:0}}>Recent Requests</h2>
              <Link href="/admin/requests" style={{fontSize:12,color:'#E05A3A',textDecoration:'none',fontWeight:700}}>View all →</Link>
            </div>
            {requests.slice(0,5).map(req=>(
              <div key={req.id} className="rr">
                <div style={{width:36,height:36,borderRadius:12,overflow:'hidden',background:'rgba(200,140,80,0.15)',flexShrink:0}}>
                  {req.imageURL?<img src={req.imageURL} alt={req.name} style={{width:'100%',height:'100%',objectFit:'cover'}}/>:<div style={{width:'100%',height:'100%',display:'flex',alignItems:'center',justifyContent:'center',fontSize:16}}>🍽️</div>}
                </div>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontSize:13,fontWeight:600,color:'#2A1F10',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{req.name}</div>
                  <div style={{fontSize:11,color:'rgba(100,60,30,0.45)'}}>{req.createdAt?.seconds?new Date(req.createdAt.seconds*1000).toLocaleDateString():'Just now'}</div>
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
    pending: {bg:'rgba(220,160,30,0.15)',color:'#8B6010',border:'rgba(220,160,30,0.3)'},
    approved:{bg:'rgba(60,106,72,0.12)', color:'#2A5A38',border:'rgba(60,106,72,0.25)'},
    rejected:{bg:'rgba(200,50,50,0.1)',  color:'#8B2020',border:'rgba(200,50,50,0.2)'},
  };
  const c=s[status]||s.pending;
  return <span style={{padding:'4px 12px',borderRadius:20,fontSize:11,fontWeight:700,background:c.bg,color:c.color,border:`1.5px solid ${c.border}`,textTransform:'capitalize'}}>{status}</span>;
}