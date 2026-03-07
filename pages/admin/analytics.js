import Head from 'next/head';
import { useEffect, useState } from 'react';
import { useAuth } from '../../hooks/useAuth';
import AdminLayout from '../../components/layout/AdminLayout';
import { getAnalytics, getAllMenuItems } from '../../lib/db';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar } from 'recharts';

const S = {
  card: { background:'#FFFFFF', border:'1px solid rgba(42,31,16,0.07)', borderRadius:20, boxShadow:'0 2px 14px rgba(42,31,16,0.06)' },
  h1:   { fontFamily:'Poppins,sans-serif', fontWeight:800, fontSize:22, color:'#1E1B18', margin:0 },
  sub:  { fontSize:13, color:'rgba(42,31,16,0.45)', marginTop:4 },
};

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

  const tip = { backgroundColor:'#1E1B18', border:'none', borderRadius:10, color:'#FFF5E8', fontSize:12, fontFamily:'Inter,sans-serif' };
  const stats = [
    { label:'Total Visits',    value:totalVisits,  accent:'#E05A3A', bg:'rgba(224,90,58,0.07)',    icon:'👁' },
    { label:'Unique Visitors', value:uniqueVisits, accent:'#5A9A78', bg:'rgba(143,196,168,0.12)',  icon:'👤' },
    { label:'Repeat Visitors', value:repeatVisits, accent:'#8A70B0', bg:'rgba(196,181,212,0.15)', icon:'🔄' },
  ];

  return (
    <AdminLayout>
      <Head><title>Analytics — Advert Radical</title></Head>
      <div style={{ background:'#F2F0EC', minHeight:'100vh', padding:32 }}>
        <div style={{ maxWidth:920, margin:'0 auto', fontFamily:'Inter,sans-serif' }}>
          <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>

          <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', marginBottom:28, flexWrap:'wrap', gap:12 }}>
            <div>
              <h1 style={S.h1}>Analytics</h1>
              <p style={S.sub}>Customer engagement and menu performance</p>
            </div>
            <div style={{ display:'flex', gap:6 }}>
              {[7,30,90].map(d=>(
                <button key={d} onClick={()=>setRange(d)} style={{ padding:'8px 18px', borderRadius:30, border:'none', fontSize:12, fontWeight:600, cursor:'pointer', fontFamily:'Inter,sans-serif', background:range===d?'#1E1B18':'#fff', color:range===d?'#FFF5E8':'rgba(42,31,16,0.55)', boxShadow:range===d?'0 2px 8px rgba(30,27,24,0.2)':'0 1px 4px rgba(42,31,16,0.06)', transition:'all 0.15s' }}>
                  {d}d
                </button>
              ))}
            </div>
          </div>

          {loading ? (
            <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:200 }}>
              <div style={{ width:32, height:32, border:'3px solid #E05A3A', borderTopColor:'transparent', borderRadius:'50%', animation:'spin 0.8s linear infinite' }} />
            </div>
          ) : (<>
            {/* Stats */}
            <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:14, marginBottom:20 }}>
              {stats.map(s=>(
                <div key={s.label} style={{ ...S.card, padding:24, background:s.bg }}>
                  <div style={{ fontSize:22, marginBottom:8 }}>{s.icon}</div>
                  <div style={{ fontFamily:'Poppins,sans-serif', fontWeight:800, fontSize:30, color:s.accent, marginBottom:4 }}>{s.value.toLocaleString()}</div>
                  <div style={{ fontSize:12, color:'rgba(42,31,16,0.5)', fontWeight:500 }}>{s.label}</div>
                </div>
              ))}
            </div>

            {/* Visits chart */}
            <div style={{ ...S.card, padding:28, marginBottom:16 }}>
              <div style={{ fontFamily:'Poppins,sans-serif', fontWeight:700, fontSize:15, color:'#1E1B18', marginBottom:22 }}>Visits Over Time</div>
              <ResponsiveContainer width="100%" height={200}>
                <AreaChart data={chartData}>
                  <defs>
                    <linearGradient id="ag1" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%"  stopColor="#E05A3A" stopOpacity={0.15}/>
                      <stop offset="95%" stopColor="#E05A3A" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(42,31,16,0.05)"/>
                  <XAxis dataKey="date" tick={{ fill:'rgba(42,31,16,0.35)', fontSize:11 }} axisLine={false} tickLine={false}/>
                  <YAxis tick={{ fill:'rgba(42,31,16,0.35)', fontSize:11 }} axisLine={false} tickLine={false}/>
                  <Tooltip contentStyle={tip}/>
                  <Area type="monotone" dataKey="visits" stroke="#E05A3A" strokeWidth={2.5} fill="url(#ag1)" name="Total Visits"/>
                  <Area type="monotone" dataKey="unique" stroke="#8FC4A8" strokeWidth={2} fill="transparent" name="Unique" strokeDasharray="5 3"/>
                </AreaChart>
              </ResponsiveContainer>
            </div>

            {/* Items chart */}
            {itemChart.length > 0 && (
              <div style={{ ...S.card, padding:28 }}>
                <div style={{ fontFamily:'Poppins,sans-serif', fontWeight:700, fontSize:15, color:'#1E1B18', marginBottom:22 }}>Top Menu Items</div>
                <ResponsiveContainer width="100%" height={180}>
                  <BarChart data={itemChart} barGap={4}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(42,31,16,0.05)"/>
                    <XAxis dataKey="name" tick={{ fill:'rgba(42,31,16,0.35)', fontSize:10 }} axisLine={false} tickLine={false}/>
                    <YAxis tick={{ fill:'rgba(42,31,16,0.35)', fontSize:11 }} axisLine={false} tickLine={false}/>
                    <Tooltip contentStyle={tip}/>
                    <Bar dataKey="views"   name="Views"    fill="#E05A3A" radius={[6,6,0,0]}/>
                    <Bar dataKey="arViews" name="AR Views" fill="#8FC4A8" radius={[6,6,0,0]}/>
                  </BarChart>
                </ResponsiveContainer>
                <div style={{ marginTop:20 }}>
                  {topItems.map((item,i)=>(
                    <div key={item.id} style={{ display:'flex', alignItems:'center', gap:12, padding:'10px 0', borderBottom:'1px solid rgba(42,31,16,0.05)' }}>
                      <span style={{ fontSize:11, color:'rgba(42,31,16,0.3)', width:20, textAlign:'right', flexShrink:0 }}>#{i+1}</span>
                      <div style={{ width:32, height:32, borderRadius:10, overflow:'hidden', background:'#F2F0EC', flexShrink:0 }}>
                        {item.imageURL ? <img src={item.imageURL} alt={item.name} style={{ width:'100%', height:'100%', objectFit:'cover' }}/> : <div style={{ width:'100%', height:'100%', display:'flex', alignItems:'center', justifyContent:'center', fontSize:16 }}>🍽️</div>}
                      </div>
                      <div style={{ flex:1, fontSize:13, fontWeight:500, color:'#1E1B18', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{item.name}</div>
                      <span style={{ fontSize:12, color:'rgba(42,31,16,0.4)' }}>{item.views||0} views</span>
                      <span style={{ fontSize:12, color:'#E05A3A', fontWeight:700 }}>{item.arViews||0} AR</span>
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
