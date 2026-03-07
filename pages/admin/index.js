import Head from 'next/head';
import { useEffect, useState } from 'react';
import { useAuth } from '../../hooks/useAuth';
import AdminLayout from '../../components/layout/AdminLayout';
import { getRestaurantById, getMenuItems, getRequests, getAnalytics } from '../../lib/db';
import Link from 'next/link';

const G = { bg:'var(--ar-bg,#08090C)', card:'var(--ar-card,rgba(255,255,255,0.03))', border:'var(--ar-border,rgba(255,255,255,0.07))', gold:'#B8962E', text:'var(--ar-text,rgba(255,255,255,0.82))', textDim:'var(--ar-text-dim,rgba(255,255,255,0.32))' };

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
        <div style={{width:32,height:32,border:`2px solid ${G.gold}`,borderTopColor:'transparent',borderRadius:'50%',animation:'spin 0.8s linear infinite'}}/>
        <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      </div>
    </AdminLayout>
  );

  const totalVisits = analytics.reduce((s, d) => s + (d.totalVisits||0), 0);
  const pendingCount = requests.filter(r => r.status === 'pending').length;
  const storageUsedPct = restaurant ? Math.round(((restaurant.storageUsedMB||0)/(restaurant.maxStorageMB||500))*100) : 0;
  const itemsPct = restaurant ? Math.round(((restaurant.itemsUsed||0)/(restaurant.maxItems||10))*100) : 0;

  const stats = [
    { label:'Visits (7d)', value:totalVisits, mono:true },
    { label:'Menu Items',  value:restaurant?.itemsUsed||menuItems.length, mono:true },
    { label:'Pending',     value:pendingCount, mono:true },
    { label:'Plan',        value:(restaurant?.plan||'basic').toUpperCase(), mono:false },
  ];

  const actions = [
    { href:'/admin/requests',  label:'Requests',      sub:'Add or manage menu items' },
    { href:'/admin/analytics', label:'Analytics',     sub:'Visits & AR interactions' },
    { href:'/admin/qrcode',    label:'QR Code',       sub:'Print for tables & menus' },
    { href:'/admin/offers',    label:'Offers',        sub:'Add a promo banner' },
  ];

  return (
    <AdminLayout>
      <Head><title>Dashboard — Advert Radical</title></Head>
      <div style={{padding:'32px 36px',maxWidth:960,margin:'0 auto'}}>
        <style>{`
          @keyframes spin{to{transform:rotate(360deg)}}
          *{box-sizing:border-box}
          .gcard{background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.07);border-radius:12px;padding:20px;transition:border-color 0.2s;}
          .gcard:hover{border-color:rgba(255,255,255,0.12);}
          .gacard{background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.07);border-radius:12px;padding:20px;text-decoration:none;color:rgba(255,255,255,0.82);display:block;transition:all 0.2s;}
          .gacard:hover{background:rgba(184,150,46,0.06);border-color:rgba(184,150,46,0.2);transform:translateY(-2px);}
          .prog{height:4px;border-radius:2px;overflow:hidden;background:rgba(255,255,255,0.06);}
          .pfill{height:100%;border-radius:2px;transition:width 0.5s;}
          .rrow{display:flex;align-items:center;gap:12px;padding:11px 0;border-bottom:1px solid rgba(255,255,255,0.05);}
          .rrow:last-child{border-bottom:none;}
        `}</style>

        {/* Header */}
        <div style={{display:'flex',alignItems:'flex-start',justifyContent:'space-between',marginBottom:32,flexWrap:'wrap',gap:12}}>
          <div>
            <h1 style={{fontWeight:800,fontSize:22,color:'var(--ar-text)',margin:0,letterSpacing:'-0.02em'}}>
              {restaurant?.name || 'Your Restaurant'}
            </h1>
            <p style={{fontSize:13,color:G.textDim,marginTop:5,fontFamily:`'DM Mono',monospace`}}>{restaurant?.subdomain}.advertradical.com</p>
          </div>
          <div style={{display:'flex',gap:8}}>
            <span style={{padding:'5px 14px',borderRadius:20,fontSize:11,fontWeight:700,textTransform:'uppercase',background:'rgba(184,150,46,0.1)',color:G.gold,border:'1px solid rgba(184,150,46,0.2)',fontFamily:`'DM Mono',monospace`,letterSpacing:'0.06em'}}>
              {restaurant?.plan||'basic'}
            </span>
            <span style={{padding:'5px 14px',borderRadius:20,fontSize:11,fontWeight:600,background:restaurant?.isActive?'rgba(60,160,80,0.1)':'rgba(255,255,255,0.04)',color:restaurant?.isActive?'#5DC87A':'rgba(255,255,255,0.3)',border:`1px solid ${restaurant?.isActive?'rgba(60,160,80,0.25)':'rgba(255,255,255,0.08)'}`,fontFamily:`'DM Mono',monospace`}}>
              {restaurant?.isActive?'● Active':'○ Inactive'}
            </span>
          </div>
        </div>

        {/* Stats */}
        <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(160px,1fr))',gap:10,marginBottom:12}}>
          {stats.map(s=>(
            <div key={s.label} className="gcard">
              <div style={{fontSize:28,fontWeight:800,color:'var(--ar-text)',fontFamily:s.mono?`'DM Mono',monospace`:'inherit',letterSpacing:s.mono?'-0.02em':'normal'}}>{s.value}</div>
              <div style={{fontSize:12,color:G.textDim,marginTop:5}}>{s.label}</div>
            </div>
          ))}
        </div>

        {/* Usage bars */}
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10,marginBottom:12}}>
          {[
            {label:'Storage Used',used:restaurant?.storageUsedMB||0,max:restaurant?.maxStorageMB||500,unit:'MB',pct:storageUsedPct},
            {label:'AR Items Used',used:restaurant?.itemsUsed||0,max:restaurant?.maxItems||10,unit:'items',pct:itemsPct},
          ].map(u=>(
            <div key={u.label} className="gcard">
              <div style={{display:'flex',justifyContent:'space-between',fontSize:13,marginBottom:12}}>
                <span style={{fontWeight:600,color:'var(--ar-text-mid)'}}>{u.label}</span>
                <span style={{color:G.textDim,fontFamily:`'DM Mono',monospace`,fontSize:12}}>{typeof u.used==='number'?u.used.toFixed(2):u.used}/{u.max} {u.unit}</span>
              </div>
              <div className="prog">
                <div className="pfill" style={{width:`${u.pct}%`,background:u.pct>80?'#DC4040':`linear-gradient(90deg,${G.gold},#D4B048)`}}/>
              </div>
              <div style={{fontSize:11,color:G.textDim,marginTop:7,fontFamily:`'DM Mono',monospace`}}>{u.pct}% used</div>
            </div>
          ))}
        </div>

        {/* Quick actions */}
        <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(160px,1fr))',gap:10,marginBottom:24}}>
          {actions.map(a=>(
            <Link key={a.href} href={a.href} className="gacard">
              <div style={{fontWeight:700,fontSize:14,color:'rgba(255,255,255,0.82)',marginBottom:5}}>{a.label}</div>
              <div style={{fontSize:12,color:G.textDim}}>{a.sub}</div>
            </Link>
          ))}
        </div>

        {/* Recent requests */}
        {requests.length > 0 && (
          <div className="gcard" style={{padding:24}}>
            <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:16}}>
              <h2 style={{fontWeight:700,fontSize:15,color:'var(--ar-text)',margin:0}}>Recent Requests</h2>
              <Link href="/admin/requests" style={{fontSize:12,color:G.gold,textDecoration:'none',fontWeight:600}}>View all →</Link>
            </div>
            {requests.slice(0,5).map(req=>(
              <div key={req.id} className="rrow">
                <div style={{width:34,height:34,borderRadius:8,overflow:'hidden',background:'rgba(255,255,255,0.05)',flexShrink:0}}>
                  {req.imageURL?<img src={req.imageURL} alt={req.name} style={{width:'100%',height:'100%',objectFit:'cover'}}/>:<div style={{width:'100%',height:'100%',display:'flex',alignItems:'center',justifyContent:'center',fontSize:14,color:G.textDim}}>⊞</div>}
                </div>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontSize:13,fontWeight:600,color:'var(--ar-text)',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{req.name}</div>
                  <div style={{fontSize:11,color:G.textDim,fontFamily:`'DM Mono',monospace`}}>{req.createdAt?.seconds?new Date(req.createdAt.seconds*1000).toLocaleDateString():'Just now'}</div>
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
    pending: {bg:'rgba(220,180,40,0.1)',color:'#C8A030',border:'rgba(220,180,40,0.2)'},
    approved:{bg:'rgba(60,160,80,0.1)', color:'#5DC87A',border:'rgba(60,160,80,0.2)'},
    rejected:{bg:'rgba(220,60,60,0.1)', color:'#E05555',border:'rgba(220,60,60,0.2)'},
  };
  const c=s[status]||s.pending;
  return <span style={{padding:'4px 12px',borderRadius:20,fontSize:11,fontWeight:600,background:c.bg,color:c.color,border:`1px solid ${c.border}`,textTransform:'capitalize',fontFamily:`'DM Mono',monospace`,whiteSpace:'nowrap'}}>{status}</span>;
}
