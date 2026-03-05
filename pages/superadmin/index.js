import Head from 'next/head';
import { useEffect, useState } from 'react';
import SuperAdminLayout from '../../components/layout/SuperAdminLayout';
import { getAllRestaurants, getAllPendingRequests } from '../../lib/db';
import Link from 'next/link';

export default function SuperAdminDashboard() {
  const [restaurants, setRestaurants] = useState([]);
  const [pending, setPending] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([getAllRestaurants(), getAllPendingRequests()]).then(([r, p]) => {
      setRestaurants(r); setPending(p); setLoading(false);
    });
  }, []);

  const active = restaurants.filter(r => r.isActive).length;
  const totalItems = restaurants.reduce((s, r) => s + (r.itemsUsed || 0), 0);

  const stats = [
    { label:'Total Restaurants', value:restaurants.length, icon:'🏪', grad:'linear-gradient(135deg,rgba(255,107,53,0.2),rgba(255,179,71,0.1))' },
    { label:'Active',            value:active,             icon:'✅', grad:'linear-gradient(135deg,rgba(34,197,94,0.15),rgba(16,185,129,0.08))' },
    { label:'Pending Requests',  value:pending.length,     icon:'📋', grad:'linear-gradient(135deg,rgba(245,158,11,0.2),rgba(251,191,36,0.1))' },
    { label:'Total AR Items',    value:totalItems,         icon:'🥗', grad:'linear-gradient(135deg,rgba(147,100,255,0.2),rgba(168,85,247,0.1))' },
  ];

  return (
    <SuperAdminLayout>
      <Head><title>Super Admin — Advert Radical</title></Head>
      <div style={{padding:'32px',maxWidth:960,margin:'0 auto'}}>
        <style>{`
          @keyframes spin{to{transform:rotate(360deg)}}
          @keyframes pulse{0%,100%{opacity:1}50%{opacity:0.3}}
          .rr{display:flex;align-items:center;gap:12px;padding:12px 0;border-bottom:1px solid rgba(255,255,255,0.06);}
          .rr:last-child{border-bottom:none;}
          .resto-row{display:flex;align-items:center;gap:12px;padding:12px 0;border-bottom:1px solid rgba(255,255,255,0.06);}
          .resto-row:last-child{border-bottom:none;}
        `}</style>

        <div style={{marginBottom:28}}>
          <h1 style={{fontFamily:'Poppins,sans-serif',fontWeight:800,fontSize:24,color:'#F0EEF8',margin:0}}>Platform Overview</h1>
          <p style={{fontSize:13,color:'rgba(255,255,255,0.35)',marginTop:5}}>Advert Radical — Super Admin Dashboard</p>
        </div>

        {/* Stats */}
        <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(180px,1fr))',gap:12,marginBottom:20}}>
          {stats.map(s => (
            <div key={s.label} style={{background:s.grad,backdropFilter:'blur(12px)',WebkitBackdropFilter:'blur(12px)',borderRadius:20,padding:22,border:'1px solid rgba(255,255,255,0.1)'}}>
              <div style={{fontSize:24,marginBottom:10}}>{s.icon}</div>
              <div style={{fontFamily:'Poppins,sans-serif',fontWeight:800,fontSize:28,color:'#F0EEF8'}}>{s.value}</div>
              <div style={{fontSize:12,color:'rgba(255,255,255,0.45)',marginTop:3}}>{s.label}</div>
            </div>
          ))}
        </div>

        {/* Pending requests */}
        {pending.length > 0 && (
          <div style={{background:'rgba(245,158,11,0.08)',backdropFilter:'blur(12px)',WebkitBackdropFilter:'blur(12px)',borderRadius:20,padding:24,border:'1px solid rgba(245,158,11,0.2)',marginBottom:16}}>
            <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:16}}>
              <h2 style={{fontFamily:'Poppins,sans-serif',fontWeight:700,fontSize:16,color:'rgba(255,255,255,0.9)',margin:0,display:'flex',alignItems:'center',gap:8}}>
                <span style={{width:8,height:8,borderRadius:'50%',background:'#FCD34D',display:'inline-block',animation:'pulse 2s infinite'}}/>
                Pending Requests ({pending.length})
              </h2>
              <Link href="/superadmin/requests" style={{fontSize:12,color:'#FF8C5A',textDecoration:'none',fontWeight:600}}>View all →</Link>
            </div>
            {pending.slice(0, 5).map(req => (
              <div key={req.id} className="rr">
                <div style={{width:36,height:36,borderRadius:10,overflow:'hidden',background:'rgba(255,255,255,0.08)',flexShrink:0}}>
                  {req.imageURL ? <img src={req.imageURL} alt={req.name} style={{width:'100%',height:'100%',objectFit:'cover'}}/> : <div style={{width:'100%',height:'100%',display:'flex',alignItems:'center',justifyContent:'center'}}>🍽️</div>}
                </div>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontSize:13,fontWeight:600,color:'rgba(255,255,255,0.85)',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{req.name}</div>
                  <div style={{fontSize:11,color:'rgba(255,255,255,0.3)'}}>{req.restaurantName}</div>
                </div>
                <Link href="/superadmin/requests" style={{fontSize:12,color:'#FF8C5A',textDecoration:'none',fontWeight:600,flexShrink:0}}>Review →</Link>
              </div>
            ))}
          </div>
        )}

        {/* Restaurants list */}
        <div style={{background:'rgba(255,255,255,0.04)',backdropFilter:'blur(12px)',WebkitBackdropFilter:'blur(12px)',borderRadius:20,padding:24,border:'1px solid rgba(255,255,255,0.08)'}}>
          <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:16}}>
            <h2 style={{fontFamily:'Poppins,sans-serif',fontWeight:700,fontSize:16,color:'rgba(255,255,255,0.9)',margin:0}}>Recent Restaurants</h2>
            <Link href="/superadmin/restaurants" style={{fontSize:12,color:'#FF8C5A',textDecoration:'none',fontWeight:600}}>View all →</Link>
          </div>
          {loading ? (
            <div style={{display:'flex',flexDirection:'column',gap:8}}>
              {[1,2,3].map(i=><div key={i} style={{height:42,borderRadius:10,background:'rgba(255,255,255,0.05)',animation:'shimmer 1.4s infinite'}}/>)}
            </div>
          ) : (
            restaurants.slice(0, 7).map(r => (
              <div key={r.id} className="resto-row">
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontSize:13,fontWeight:600,color:'rgba(255,255,255,0.85)',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{r.name}</div>
                  <div style={{fontSize:11,color:'rgba(255,255,255,0.3)'}}>{r.subdomain}.advertradical.com</div>
                </div>
                <span style={{fontSize:11,color:'rgba(255,255,255,0.3)',textTransform:'capitalize',marginRight:10}}>{r.plan}</span>
                <span style={{padding:'3px 10px',borderRadius:20,fontSize:11,fontWeight:600,background:r.isActive?'rgba(34,197,94,0.12)':'rgba(255,255,255,0.05)',color:r.isActive?'#4ade80':'rgba(255,255,255,0.3)',border:`1px solid ${r.isActive?'rgba(34,197,94,0.25)':'rgba(255,255,255,0.08)'}`}}>
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
