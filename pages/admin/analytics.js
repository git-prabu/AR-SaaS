import Head from 'next/head';
import { useEffect, useState } from 'react';
import { useAuth } from '../../hooks/useAuth';
import AdminLayout from '../../components/layout/AdminLayout';
import { getAnalytics, getAllMenuItems } from '../../lib/db';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar } from 'recharts';

const G = { bg:'#08090C', card:'rgba(255,255,255,0.03)', border:'rgba(255,255,255,0.07)', gold:'#B8962E', text:'rgba(255,255,255,0.82)', textDim:'rgba(255,255,255,0.32)' };
const cardStyle = { background:G.card, border:`1px solid ${G.border}`, borderRadius:12 };

export default function AdminAnalytics() {
  const { userData } = useAuth();
  const [analytics, setAnalytics] = useState([]);
  const [menuItems, setMenuItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [range, setRange] = useState(30);
  const rid = userData?.restaurantId;

  useEffect(() => {
    if (!rid) return;
    Promise.all([getAnalytics(rid, range), getAllMenuItems(rid)]).then(([anal, items]) => {
      setAnalytics(anal); setMenuItems(items); setLoading(false);
    });
  }, [rid, range]);

  const totalVisits  = analytics.reduce((s,d)=>s+(d.totalVisits||0),0);
  const uniqueVisits = analytics.reduce((s,d)=>s+(d.uniqueVisitors||0),0);
  const repeatVisits = analytics.reduce((s,d)=>s+(d.repeatVisitors||0),0);
  const chartData    = analytics.map(d=>({ date:d.date?.slice(5)||'', visits:d.totalVisits||0, unique:d.uniqueVisitors||0 }));
  const topItems     = [...menuItems].sort((a,b)=>(b.views||0)-(a.views||0)).slice(0,8);
  const itemChart    = topItems.map(i=>({ name:i.name.length>12?i.name.slice(0,12)+'…':i.name, views:i.views||0, arViews:i.arViews||0 }));

  const tip = { backgroundColor:'#0D0E12', border:'1px solid rgba(255,255,255,0.1)', borderRadius:8, color:'rgba(255,255,255,0.82)', fontSize:12 };
  const stats = [
    { label:'Total Visits',    value:totalVisits  },
    { label:'Unique Visitors', value:uniqueVisits },
    { label:'Repeat Visitors', value:repeatVisits },
  ];

  return (
    <AdminLayout>
      <Head><title>Analytics — Advert Radical</title></Head>
      <div style={{minHeight:'100vh',padding:'32px 36px'}}>
        <div style={{maxWidth:920,margin:'0 auto',fontFamily:`'Bricolage Grotesque',Inter,sans-serif`}}>
          <style>{`@keyframes spin{to{transform:rotate(360deg)}} *{box-sizing:border-box}`}</style>

          <div style={{display:'flex',alignItems:'flex-start',justifyContent:'space-between',marginBottom:28,flexWrap:'wrap',gap:12}}>
            <div>
              <h1 style={{fontWeight:800,fontSize:22,color:'rgba(255,255,255,0.88)',margin:0,letterSpacing:'-0.02em'}}>Analytics</h1>
              <p style={{fontSize:13,color:G.textDim,marginTop:4}}>Customer engagement and menu performance</p>
            </div>
            <div style={{display:'flex',gap:6}}>
              {[7,30,90].map(d=>(
                <button key={d} onClick={()=>setRange(d)} style={{padding:'7px 16px',borderRadius:8,border:`1px solid ${range===d?'rgba(184,150,46,0.3)':G.border}`,fontSize:12,fontWeight:600,cursor:'pointer',fontFamily:'inherit',background:range===d?'rgba(184,150,46,0.1)':G.card,color:range===d?G.gold:G.textDim,transition:'all 0.15s'}}>
                  {d}d
                </button>
              ))}
            </div>
          </div>

          {loading ? (
            <div style={{display:'flex',alignItems:'center',justifyContent:'center',height:200}}>
              <div style={{width:32,height:32,border:`2px solid ${G.gold}`,borderTopColor:'transparent',borderRadius:'50%',animation:'spin 0.8s linear infinite'}}/>
            </div>
          ) : (<>
            <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:10,marginBottom:12}}>
              {stats.map(s=>(
                <div key={s.label} style={{...cardStyle,padding:24}}>
                  <div style={{fontWeight:800,fontSize:30,color:'rgba(255,255,255,0.88)',marginBottom:4,fontFamily:`'DM Mono',monospace`,letterSpacing:'-0.02em'}}>{s.value.toLocaleString()}</div>
                  <div style={{fontSize:12,color:G.textDim,fontWeight:500}}>{s.label}</div>
                </div>
              ))}
            </div>

            <div style={{...cardStyle,padding:28,marginBottom:12}}>
              <div style={{fontWeight:700,fontSize:15,color:'rgba(255,255,255,0.75)',marginBottom:22}}>Visits Over Time</div>
              <ResponsiveContainer width="100%" height={200}>
                <AreaChart data={chartData}>
                  <defs>
                    <linearGradient id="ag1" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%"  stopColor={G.gold} stopOpacity={0.2}/>
                      <stop offset="95%" stopColor={G.gold} stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)"/>
                  <XAxis dataKey="date" tick={{fill:G.textDim,fontSize:11}} axisLine={false} tickLine={false}/>
                  <YAxis tick={{fill:G.textDim,fontSize:11}} axisLine={false} tickLine={false}/>
                  <Tooltip contentStyle={tip}/>
                  <Area type="monotone" dataKey="visits" stroke={G.gold} strokeWidth={2} fill="url(#ag1)" name="Total Visits"/>
                  <Area type="monotone" dataKey="unique" stroke="rgba(255,255,255,0.3)" strokeWidth={1.5} fill="transparent" name="Unique" strokeDasharray="5 3"/>
                </AreaChart>
              </ResponsiveContainer>
            </div>

            {itemChart.length > 0 && (
              <div style={{...cardStyle,padding:28}}>
                <div style={{fontWeight:700,fontSize:15,color:'rgba(255,255,255,0.75)',marginBottom:22}}>Top Menu Items</div>
                <ResponsiveContainer width="100%" height={180}>
                  <BarChart data={itemChart} barGap={4}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)"/>
                    <XAxis dataKey="name" tick={{fill:G.textDim,fontSize:10}} axisLine={false} tickLine={false}/>
                    <YAxis tick={{fill:G.textDim,fontSize:11}} axisLine={false} tickLine={false}/>
                    <Tooltip contentStyle={tip}/>
                    <Bar dataKey="views"   name="Views"    fill={G.gold} radius={[4,4,0,0]}/>
                    <Bar dataKey="arViews" name="AR Views" fill="rgba(255,255,255,0.2)" radius={[4,4,0,0]}/>
                  </BarChart>
                </ResponsiveContainer>
                <div style={{marginTop:20}}>
                  {topItems.map((item,i)=>(
                    <div key={item.id} style={{display:'flex',alignItems:'center',gap:12,padding:'10px 0',borderBottom:'1px solid rgba(255,255,255,0.05)'}}>
                      <span style={{fontSize:11,color:G.textDim,width:20,textAlign:'right',flexShrink:0,fontFamily:`'DM Mono',monospace`}}>#{i+1}</span>
                      <div style={{width:32,height:32,borderRadius:8,overflow:'hidden',background:'rgba(255,255,255,0.05)',flexShrink:0}}>
                        {item.imageURL?<img src={item.imageURL} alt={item.name} style={{width:'100%',height:'100%',objectFit:'cover'}}/>:<div style={{width:'100%',height:'100%',display:'flex',alignItems:'center',justifyContent:'center',fontSize:14,color:G.textDim}}>⊞</div>}
                      </div>
                      <div style={{flex:1,fontSize:13,fontWeight:500,color:G.text,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{item.name}</div>
                      <span style={{fontSize:12,color:G.textDim,fontFamily:`'DM Mono',monospace`}}>{item.views||0} views</span>
                      <span style={{fontSize:12,color:G.gold,fontWeight:600,fontFamily:`'DM Mono',monospace`}}>{item.arViews||0} AR</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>)}
        </div>
      </div>
    </AdminLayout>
  );
}
AdminAnalytics.getLayout = (page) => page;
