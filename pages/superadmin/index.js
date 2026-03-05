import Head from 'next/head';
import { useEffect, useState } from 'react';
import SuperAdminLayout from '../../components/layout/SuperAdminLayout';
import { getAllRestaurants, getAllPendingRequests } from '../../lib/db';
import Link from 'next/link';

export default function SuperAdminDashboard() {
  const [restaurants, setRestaurants] = useState([]);
  const [pending,     setPending]     = useState([]);
  const [loading,     setLoading]     = useState(true);

  useEffect(() => {
    Promise.all([getAllRestaurants(), getAllPendingRequests()]).then(([r, p]) => {
      setRestaurants(r); setPending(p); setLoading(false);
    });
  }, []);

  const active   = restaurants.filter(r => r.isActive).length;
  const totalItems = restaurants.reduce((s, r) => s + (r.itemsUsed || 0), 0);

  const stats = [
    { label:'Total Restaurants', value: restaurants.length, color:'#FF6B35', icon:'🏪' },
    { label:'Active',            value: active,             color:'#22C55E', icon:'✅' },
    { label:'Pending Requests',  value: pending.length,     color:'#F59E0B', icon:'📋' },
    { label:'Total AR Items',    value: totalItems,          color:'#8B5CF6', icon:'🥗' },
  ];

  return (
    <SuperAdminLayout>
      <Head><title>Super Admin — Advert Radical</title></Head>
      <div style={{padding:'32px',maxWidth:960,margin:'0 auto'}}>
        <style>{`
          .stat{background:#fff;border-radius:16px;padding:20px;border:1px solid #E2DED8;box-shadow:0 2px 8px rgba(0,0,0,0.04);}
          .row{display:flex;align-items:center;gap:12px;padding:12px 0;border-bottom:1px solid #F0EDE8;}
          .row:last-child{border-bottom:none;}
        `}</style>

        <div style={{marginBottom:28}}>
          <h1 style={{fontFamily:'"Plus Jakarta Sans",sans-serif',fontWeight:800,fontSize:24,color:'#1C1917',margin:0}}>Platform Overview</h1>
          <p style={{fontSize:13,color:'#A09890',marginTop:4}}>Advert Radical Admin Dashboard</p>
        </div>

        <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(180px,1fr))',gap:12,marginBottom:24}}>
          {stats.map(s => (
            <div key={s.label} className="stat">
              <div style={{fontSize:22,marginBottom:8}}>{s.icon}</div>
              <div style={{fontFamily:'"Plus Jakarta Sans",sans-serif',fontWeight:800,fontSize:28,color:s.color}}>{s.value}</div>
              <div style={{fontSize:12,color:'#A09890',marginTop:2}}>{s.label}</div>
            </div>
          ))}
        </div>

        {/* Pending requests */}
        {pending.length > 0 && (
          <div style={{background:'#fff',borderRadius:16,padding:24,border:'1px solid #FDE68A',boxShadow:'0 2px 8px rgba(245,158,11,0.08)',marginBottom:16}}>
            <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:16}}>
              <h2 style={{fontFamily:'"Plus Jakarta Sans",sans-serif',fontWeight:700,fontSize:16,color:'#1C1917',margin:0,display:'flex',alignItems:'center',gap:8}}>
                <span style={{width:8,height:8,borderRadius:'50%',background:'#F59E0B',display:'inline-block',animation:'pulse 2s infinite'}} />
                Pending Requests ({pending.length})
              </h2>
              <Link href="/superadmin/requests" style={{fontSize:12,color:'#FF6B35',textDecoration:'none',fontWeight:600}}>View all →</Link>
            </div>
            <style>{`@keyframes pulse{0%,100%{opacity:1}50%{opacity:0.4}}`}</style>
            {pending.slice(0, 5).map(req => (
              <div key={req.id} className="row">
                <div style={{width:36,height:36,borderRadius:10,overflow:'hidden',background:'#F0EDE8',flexShrink:0}}>
                  {req.imageURL ? <img src={req.imageURL} alt={req.name} style={{width:'100%',height:'100%',objectFit:'cover'}} /> : <div style={{width:'100%',height:'100%',display:'flex',alignItems:'center',justifyContent:'center'}}>🍽️</div>}
                </div>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontSize:13,fontWeight:600,color:'#1C1917',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{req.name}</div>
                  <div style={{fontSize:11,color:'#A09890'}}>{req.restaurantName}</div>
                </div>
                <Link href="/superadmin/requests" style={{fontSize:12,color:'#FF6B35',textDecoration:'none',fontWeight:600,flexShrink:0}}>Review →</Link>
              </div>
            ))}
          </div>
        )}

        {/* Restaurants */}
        <div style={{background:'#fff',borderRadius:16,padding:24,border:'1px solid #E2DED8',boxShadow:'0 2px 8px rgba(0,0,0,0.04)'}}>
          <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:16}}>
            <h2 style={{fontFamily:'"Plus Jakarta Sans",sans-serif',fontWeight:700,fontSize:16,color:'#1C1917',margin:0}}>Recent Restaurants</h2>
            <Link href="/superadmin/restaurants" style={{fontSize:12,color:'#FF6B35',textDecoration:'none',fontWeight:600}}>View all →</Link>
          </div>
          {loading ? (
            <div style={{display:'flex',flexDirection:'column',gap:8}}>{[1,2,3].map(i=><div key={i} style={{height:40,borderRadius:8,background:'#F0EDE8',animation:'shimmer 1.4s infinite'}}/>)}</div>
          ) : (
            restaurants.slice(0, 7).map(r => (
              <div key={r.id} className="row">
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontSize:13,fontWeight:600,color:'#1C1917',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{r.name}</div>
                  <div style={{fontSize:11,color:'#A09890'}}>{r.subdomain}.advertradical.com</div>
                </div>
                <span style={{fontSize:11,color:'#A09890',textTransform:'capitalize',marginRight:8}}>{r.plan}</span>
                <span style={{padding:'3px 10px',borderRadius:20,fontSize:11,fontWeight:600,background:r.isActive?'#DCFCE7':'#F0EDE8',color:r.isActive?'#166534':'#A09890',border:`1px solid ${r.isActive?'#BBF7D0':'#E2DED8'}`}}>
                  {r.isActive ? 'Active' : 'Inactive'}
                </span>
              </div>
            ))
          )}
        </div>
      </div>
    </SuperAdminLayout>
  );
}

SuperAdminDashboard.getLayout = (page) => page;
