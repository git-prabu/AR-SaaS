import Head from 'next/head';
import { useEffect, useState } from 'react';
import SuperAdminLayout from '../../components/layout/SuperAdminLayout';
import { getAllRestaurants, getAllPendingRequests } from '../../lib/db';
import Link from 'next/link';

const G = { card:'rgba(255,255,255,0.03)', border:'rgba(255,255,255,0.07)', gold:'#B8962E', text:'rgba(255,255,255,0.82)', textDim:'rgba(255,255,255,0.32)' };

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
    { label:'Restaurants', value:restaurants.length },
    { label:'Active',      value:active },
    { label:'Pending',     value:pending.length },
    { label:'AR Items',    value:totalItems },
  ];

  return (
    <SuperAdminLayout>
      <Head><title>Super Admin — Advert Radical</title></Head>
      <div style={{padding:'32px 36px',maxWidth:960,margin:'0 auto',fontFamily:`'Bricolage Grotesque',Inter,sans-serif`}}>
        <style>{`@keyframes spin{to{transform:rotate(360deg)}} @keyframes pulse{0%,100%{opacity:1}50%{opacity:0.35}} *{box-sizing:border-box} .rrow2{display:flex;align-items:center;gap:12px;padding:11px 0;border-bottom:1px solid rgba(255,255,255,0.05);} .rrow2:last-child{border-bottom:none;}`}</style>

        <div style={{marginBottom:28}}>
          <h1 style={{fontWeight:800,fontSize:22,color:'rgba(255,255,255,0.88)',margin:0,letterSpacing:'-0.02em'}}>Platform Overview</h1>
          <p style={{fontSize:13,color:G.textDim,marginTop:4,fontFamily:`'DM Mono',monospace`}}>Advert Radical — Super Admin</p>
        </div>

        <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(160px,1fr))',gap:10,marginBottom:16}}>
          {stats.map(s=>(
            <div key={s.label} style={{background:G.card,border:`1px solid ${G.border}`,borderRadius:12,padding:20}}>
              <div style={{fontWeight:800,fontSize:28,color:'rgba(255,255,255,0.88)',fontFamily:`'DM Mono',monospace`,letterSpacing:'-0.02em'}}>{s.value}</div>
              <div style={{fontSize:12,color:G.textDim,marginTop:5}}>{s.label}</div>
            </div>
          ))}
        </div>

        {pending.length > 0 && (
          <div style={{background:'rgba(200,160,48,0.06)',border:'1px solid rgba(200,160,48,0.2)',borderRadius:12,padding:24,marginBottom:12}}>
            <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:16}}>
              <h2 style={{fontWeight:700,fontSize:15,color:'rgba(255,255,255,0.82)',margin:0,display:'flex',alignItems:'center',gap:8}}>
                <span style={{width:7,height:7,borderRadius:'50%',background:'#C8A030',display:'inline-block',animation:'pulse 2s infinite'}}/>
                Pending Requests ({pending.length})
              </h2>
              <Link href="/superadmin/requests" style={{fontSize:12,color:G.gold,textDecoration:'none',fontWeight:600}}>View all →</Link>
            </div>
            {pending.slice(0,5).map(req=>(
              <div key={req.id} className="rrow2">
                <div style={{width:34,height:34,borderRadius:8,overflow:'hidden',background:'rgba(255,255,255,0.05)',flexShrink:0}}>
                  {req.imageURL?<img src={req.imageURL} alt={req.name} style={{width:'100%',height:'100%',objectFit:'cover'}}/>:<div style={{width:'100%',height:'100%',display:'flex',alignItems:'center',justifyContent:'center',color:G.textDim,fontSize:14}}>⊞</div>}
                </div>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontSize:13,fontWeight:600,color:G.text,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{req.name}</div>
                  <div style={{fontSize:11,color:G.textDim}}>{req.restaurantName}</div>
                </div>
                <Link href="/superadmin/requests" style={{fontSize:12,color:G.gold,textDecoration:'none',fontWeight:600,flexShrink:0}}>Review →</Link>
              </div>
            ))}
          </div>
        )}

        <div style={{background:G.card,border:`1px solid ${G.border}`,borderRadius:12,padding:24}}>
          <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:16}}>
            <h2 style={{fontWeight:700,fontSize:15,color:'rgba(255,255,255,0.82)',margin:0}}>Recent Restaurants</h2>
            <Link href="/superadmin/restaurants" style={{fontSize:12,color:G.gold,textDecoration:'none',fontWeight:600}}>View all →</Link>
          </div>
          {loading ? [1,2,3].map(i=>(
            <div key={i} style={{height:42,borderRadius:8,background:'rgba(255,255,255,0.04)',marginBottom:8}}/>
          )) : restaurants.slice(0,7).map(r=>(
            <div key={r.id} className="rrow2">
              <div style={{flex:1,minWidth:0}}>
                <Link href={`/superadmin/restaurant/${r.id}`} style={{fontSize:13,fontWeight:600,color:G.text,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',display:'block',textDecoration:'none'}} onMouseOver={e=>e.currentTarget.style.color=G.gold} onMouseOut={e=>e.currentTarget.style.color=G.text}>{r.name}</Link>
                <div style={{fontSize:11,color:G.textDim,fontFamily:`'DM Mono',monospace`}}>{r.subdomain}.advertradical.com</div>
              </div>
              <span style={{fontSize:11,color:G.textDim,textTransform:'capitalize',marginRight:8,fontFamily:`'DM Mono',monospace`}}>{r.plan}</span>
              <span style={{padding:'3px 10px',borderRadius:20,fontSize:11,fontWeight:600,background:r.isActive?'rgba(60,160,80,0.1)':'rgba(255,255,255,0.04)',color:r.isActive?'#5DC87A':G.textDim,border:`1px solid ${r.isActive?'rgba(60,160,80,0.25)':'rgba(255,255,255,0.08)'}`,fontFamily:`'DM Mono',monospace`}}>
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
