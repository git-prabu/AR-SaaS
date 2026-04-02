import Head from 'next/head';
import { useEffect, useState } from 'react';
import SuperAdminLayout from '../../components/layout/SuperAdminLayout';
import { getAllRestaurants, getAllPendingRequests } from '../../lib/saDb';
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
  const totalItems = restaurants.reduce((s, r) => s + (r.itemsUsed||0), 0);

  const stats = [
    { label:'Restaurants', value:restaurants.length, icon:'🏪', bg:'rgba(255,255,255,0.65)',      accent:'#E05A3A' },
    { label:'Active',      value:active,             icon:'✅', bg:'rgba(143,196,168,0.3)',       accent:'#3A6A48' },
    { label:'Pending',     value:pending.length,     icon:'📋', bg:'rgba(244,200,100,0.3)',       accent:'#8B6010' },
    { label:'AR Items',    value:totalItems,          icon:'🥗', bg:'rgba(196,181,212,0.35)',      accent:'#6A4A8A' },
  ];

  return (
    <SuperAdminLayout>
      <Head><title>Super Admin — Advert Radical</title></Head>
      <div style={{padding:32,maxWidth:960,margin:'0 auto'}}>
        <style>{`
          @keyframes pulse{0%,100%{opacity:1}50%{opacity:0.35}}
          .sc{border-radius:20px;padding:20px;border:1.5px solid rgba(255,220,170,0.5);box-shadow:0 6px 24px rgba(120,70,30,0.1),inset 0 1px 0 rgba(255,255,255,0.6);backdropFilter:blur(8px);}
          .rr{display:flex;align-items:center;gap:12px;padding:12px 0;border-bottom:1px solid rgba(200,140,80,0.12);}
          .rr:last-child{border-bottom:none;}
        `}</style>

        <div style={{marginBottom:28}}>
          <h1 style={{fontFamily:'Poppins,sans-serif',fontWeight:800,fontSize:24,color:'#2A1F10',margin:0}}>Platform Overview</h1>
          <p style={{fontSize:13,color:'rgba(42,31,16,0.45)',marginTop:5}}>Advert Radical — Super Admin</p>
        </div>

        <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(175px,1fr))',gap:12,marginBottom:20}}>
          {stats.map(s=>(
            <div key={s.label} className="sc" style={{background:s.bg,backdropFilter:'blur(8px)',WebkitBackdropFilter:'blur(8px)'}}>
              <div style={{fontSize:26,marginBottom:10}}>{s.icon}</div>
              <div style={{fontFamily:'Poppins,sans-serif',fontWeight:800,fontSize:28,color:s.accent}}>{s.value}</div>
              <div style={{fontSize:12,color:'rgba(42,31,16,0.5)',marginTop:3}}>{s.label}</div>
            </div>
          ))}
        </div>

        {pending.length > 0 && (
          <div className="sc" style={{background:'rgba(244,200,100,0.2)',backdropFilter:'blur(8px)',WebkitBackdropFilter:'blur(8px)',border:'1.5px solid rgba(220,160,30,0.3)',padding:24,marginBottom:16}}>
            <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:16}}>
              <h2 style={{fontFamily:'Poppins,sans-serif',fontWeight:800,fontSize:16,color:'#2A1F10',margin:0,display:'flex',alignItems:'center',gap:8}}>
                <span style={{width:8,height:8,borderRadius:'50%',background:'#D09010',display:'inline-block',animation:'pulse 2s infinite'}}/>
                Pending Requests ({pending.length})
              </h2>
              <Link href="/superadmin/requests" style={{fontSize:12,color:'#E05A3A',textDecoration:'none',fontWeight:700}}>View all →</Link>
            </div>
            {pending.slice(0,5).map(req=>(
              <div key={req.id} className="rr">
                <div style={{width:36,height:36,borderRadius:12,overflow:'hidden',background:'rgba(200,140,80,0.2)',flexShrink:0}}>
                  {req.imageURL?<img src={req.imageURL} alt={req.name} style={{width:'100%',height:'100%',objectFit:'cover'}}/>:<div style={{width:'100%',height:'100%',display:'flex',alignItems:'center',justifyContent:'center'}}>🍽️</div>}
                </div>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontSize:13,fontWeight:600,color:'#2A1F10',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{req.name}</div>
                  <div style={{fontSize:11,color:'rgba(42,31,16,0.45)'}}>{req.restaurantName}</div>
                </div>
                <Link href="/superadmin/requests" style={{fontSize:12,color:'#E05A3A',textDecoration:'none',fontWeight:700,flexShrink:0}}>Review →</Link>
              </div>
            ))}
          </div>
        )}

        <div className="sc" style={{background:'rgba(255,245,220,0.7)',backdropFilter:'blur(8px)',WebkitBackdropFilter:'blur(8px)',padding:24}}>
          <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:16}}>
            <h2 style={{fontFamily:'Poppins,sans-serif',fontWeight:800,fontSize:16,color:'#2A1F10',margin:0}}>Recent Restaurants</h2>
            <Link href="/superadmin/restaurants" style={{fontSize:12,color:'#E05A3A',textDecoration:'none',fontWeight:700}}>View all →</Link>
          </div>
          {loading ? [1,2,3].map(i=><div key={i} style={{height:42,borderRadius:10,background:'rgba(200,140,80,0.15)',marginBottom:8,animation:'shimmer 1.4s infinite'}}/>)
            : restaurants.slice(0,7).map(r=>(
              <div key={r.id} className="rr">
                <div style={{flex:1,minWidth:0}}>
                  <Link href={`/superadmin/restaurant/${r.id}`} style={{fontSize:13,fontWeight:600,color:'#2A1F10',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',display:'block',textDecoration:'none'}} onMouseOver={e=>e.currentTarget.style.color='#E05A3A'} onMouseOut={e=>e.currentTarget.style.color='#2A1F10'}>{r.name}</Link>
                  <div style={{fontSize:11,color:'rgba(42,31,16,0.4)'}}>{r.subdomain}.advertradical.com</div>
                </div>
                <span style={{fontSize:11,color:'rgba(42,31,16,0.4)',textTransform:'capitalize',marginRight:8}}>{r.plan}</span>
                <span style={{padding:'3px 10px',borderRadius:20,fontSize:11,fontWeight:700,background:r.isActive?'rgba(60,106,72,0.12)':'rgba(160,120,80,0.1)',color:r.isActive?'#2A5A38':'rgba(100,60,30,0.45)',border:`1.5px solid ${r.isActive?'rgba(60,106,72,0.25)':'rgba(160,120,80,0.2)'}`}}>
                  {r.isActive?'Active':'Inactive'}
                </span>
              </div>
            ))}
        </div>
      </div>
    </SuperAdminLayout>
  );
}
SuperAdminDashboard.getLayout = (page) => page;
