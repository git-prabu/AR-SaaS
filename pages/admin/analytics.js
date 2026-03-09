import Head from 'next/head';
import { useEffect, useState } from 'react';
import { useAuth } from '../../hooks/useAuth';
import AdminLayout from '../../components/layout/AdminLayout';
import { getAnalytics, getAllMenuItems } from '../../lib/db';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, BarChart, Bar, Cell, PieChart, Pie, Legend,
} from 'recharts';

const S = {
  card: { background:'#FFFFFF', border:'1px solid rgba(42,31,16,0.07)', borderRadius:20, boxShadow:'0 2px 14px rgba(42,31,16,0.06)' },
  h1:   { fontFamily:'Poppins,sans-serif', fontWeight:800, fontSize:22, color:'#1E1B18', margin:0 },
  sub:  { fontSize:13, color:'rgba(42,31,16,0.45)', marginTop:4 },
};

const tip = { backgroundColor:'#1E1B18', border:'none', borderRadius:10, color:'#FFF5E8', fontSize:12, fontFamily:'Inter,sans-serif' };
const tipLabel = { color:'#FFF5E8', fontWeight:600 };
const tipItem  = { color:'#FFF5E8' };

// Custom tooltip for PieChart (Recharts PieChart ignores contentStyle color for text)
const PieTooltip = ({ active, payload }) => {
  if (!active || !payload?.length) return null;
  const { name, value } = payload[0];
  return (
    <div style={{ background:'#1E1B18', border:'none', borderRadius:10, padding:'8px 14px', fontFamily:'Inter,sans-serif' }}>
      <div style={{ color:'#FFF5E8', fontWeight:700, fontSize:13 }}>{name}</div>
      <div style={{ color:'rgba(255,245,232,0.7)', fontSize:12, marginTop:2 }}>{value} views</div>
    </div>
  );
};

// Colour palette for categories
const CAT_COLORS = ['#E05A3A','#F79B3D','#8A70B0','#5A9A78','#4A80C0','#C04A28','#8FC4A8','#F4D070','#C8A050'];

export default function AdminAnalytics() {
  const { userData }                = useAuth();
  const [analytics,  setAnalytics]  = useState([]);
  const [menuItems,  setMenuItems]  = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [range,      setRange]      = useState(30);
  const [tab,        setTab]        = useState('overview'); // 'overview' | 'menu'
  const rid = userData?.restaurantId;

  useEffect(() => {
    if (!rid) return;
    Promise.all([getAnalytics(rid, range), getAllMenuItems(rid)]).then(([anal, items]) => {
      setAnalytics(anal);
      setMenuItems(items);
      setLoading(false);
    });
  }, [rid, range]);

  // ── Overview calculations ──
  const totalVisits  = analytics.reduce((s,d)=>s+(d.totalVisits||0),0);
  const uniqueVisits = analytics.reduce((s,d)=>s+(d.uniqueVisitors||0),0);
  const repeatVisits = analytics.reduce((s,d)=>s+(d.repeatVisitors||0),0);
  const chartData    = analytics.map(d=>({ date:d.date?.slice(5)||'', visits:d.totalVisits||0, unique:d.uniqueVisitors||0 }));
  const topItems     = [...menuItems].sort((a,b)=>(b.views||0)-(a.views||0)).slice(0,8);
  const itemChart    = topItems.map(i=>({ name:i.name.length>12?i.name.slice(0,12)+'…':i.name, views:i.views||0, arViews:i.arViews||0 }));

  // ── Menu Performance calculations ──
  const activeItems = menuItems.filter(i => i.isActive !== false);

  // Heatmap score = views + arViews*2 + ratingAvg*10
  const heatmapData = [...activeItems]
    .map(i => ({
      ...i,
      score: (i.views||0) + (i.arViews||0)*2 + (i.ratingAvg||0)*10,
      arRate: i.views > 0 ? Math.round(((i.arViews||0) / i.views) * 100) : 0,
    }))
    .sort((a,b) => b.score - a.score);

  const maxScore   = heatmapData[0]?.score || 1;
  const ignoredItems = heatmapData.filter(i => (i.views||0) === 0);

  // Category breakdown
  const catMap = {};
  activeItems.forEach(i => {
    // Normalise to Title Case to prevent "pasta" and "Pasta" being separate
    const raw = i.category || 'Uncategorised';
    const cat = raw.charAt(0).toUpperCase() + raw.slice(1);
    if (!catMap[cat]) catMap[cat] = { name:cat, views:0, items:0 };
    catMap[cat].views += (i.views||0) + (i.arViews||0);
    catMap[cat].items += 1;
  });
  const catData = Object.values(catMap).sort((a,b) => b.views - a.views);

  // Ratings leaderboard
  const ratedItems = [...activeItems].filter(i => (i.ratingCount||0) > 0);
  const topRated   = [...ratedItems].sort((a,b) => (b.ratingAvg||0) - (a.ratingAvg||0)).slice(0,5);
  const lowRated   = [...ratedItems].filter(i => (i.ratingAvg||0) < 3.5).sort((a,b) => (a.ratingAvg||0) - (b.ratingAvg||0)).slice(0,3);

  // Overall AR engagement
  const totalViews   = activeItems.reduce((s,i)=>s+(i.views||0),0);
  const totalARViews = activeItems.reduce((s,i)=>s+(i.arViews||0),0);
  const arEngagement = totalViews > 0 ? ((totalARViews/totalViews)*100).toFixed(1) : 0;

  const overviewStats = [
    { label:'Total Visits',    value:totalVisits,  accent:'#E05A3A', bg:'rgba(224,90,58,0.07)',    icon:'👁' },
    { label:'Unique Visitors', value:uniqueVisits, accent:'#5A9A78', bg:'rgba(143,196,168,0.12)',  icon:'👤' },
    { label:'Repeat Visitors', value:repeatVisits, accent:'#8A70B0', bg:'rgba(196,181,212,0.15)', icon:'🔄' },
  ];

  // Heatmap colour: top 20% = amber, middle = neutral, bottom 20% = muted red
  const heatColor = (score) => {
    const pct = score / maxScore;
    if (pct >= 0.7) return { bar:'#F79B3D', bg:'rgba(247,155,61,0.12)', text:'#C05A00' };
    if (pct >= 0.3) return { bar:'#5A9A78', bg:'rgba(90,154,120,0.1)',  text:'#1A5A38' };
    return              { bar:'rgba(42,31,16,0.2)', bg:'rgba(42,31,16,0.04)', text:'rgba(42,31,16,0.45)' };
  };

  return (
    <AdminLayout>
      <Head><title>Analytics — Advert Radical</title></Head>
      <div style={{ background:'#F2F0EC', minHeight:'100vh', padding:32 }}>
        <div style={{ maxWidth:960, margin:'0 auto', fontFamily:'Inter,sans-serif' }}>
          <style>{`
            @keyframes spin{to{transform:rotate(360deg)}}
            @keyframes fadeIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}
            .bar-row:hover { background: rgba(247,155,61,0.06) !important; }
          `}</style>

          {/* Header */}
          <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', marginBottom:24, flexWrap:'wrap', gap:12 }}>
            <div>
              <h1 style={S.h1}>Analytics</h1>
              <p style={S.sub}>Customer engagement and menu performance insights</p>
            </div>
            <div style={{ display:'flex', gap:6 }}>
              {[7,30,90].map(d=>(
                <button key={d} onClick={()=>setRange(d)} style={{ padding:'8px 18px', borderRadius:30, border:'none', fontSize:12, fontWeight:600, cursor:'pointer', fontFamily:'Inter,sans-serif', background:range===d?'#1E1B18':'#fff', color:range===d?'#FFF5E8':'rgba(42,31,16,0.55)', boxShadow:range===d?'0 2px 8px rgba(30,27,24,0.2)':'0 1px 4px rgba(42,31,16,0.06)', transition:'all 0.15s' }}>
                  {d}d
                </button>
              ))}
            </div>
          </div>

          {/* Tabs */}
          <div style={{ display:'flex', gap:8, marginBottom:24 }}>
            {[['overview','📊 Overview'],['menu','🔥 Menu Performance']].map(([id,label])=>(
              <button key={id} onClick={()=>setTab(id)}
                style={{ padding:'10px 22px', borderRadius:30, border:'none', fontSize:13, fontWeight:600, cursor:'pointer', fontFamily:'Inter,sans-serif', background:tab===id?'#1E1B18':'#fff', color:tab===id?'#FFF5E8':'rgba(42,31,16,0.55)', boxShadow:tab===id?'0 2px 8px rgba(30,27,24,0.18)':'0 1px 4px rgba(42,31,16,0.06)', transition:'all 0.15s' }}>
                {label}
              </button>
            ))}
          </div>

          {loading ? (
            <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:200 }}>
              <div style={{ width:32, height:32, border:'3px solid #E05A3A', borderTopColor:'transparent', borderRadius:'50%', animation:'spin 0.8s linear infinite' }} />
            </div>

          ) : tab === 'overview' ? (
            <div style={{ animation:'fadeIn 0.25s ease' }}>
              {/* Stats */}
              <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:14, marginBottom:20 }}>
                {overviewStats.map(s=>(
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
                    <Tooltip contentStyle={tip} labelStyle={tipLabel} itemStyle={tipItem}/>
                    <Area type="monotone" dataKey="visits" stroke="#E05A3A" strokeWidth={2.5} fill="url(#ag1)" name="Total Visits"/>
                    <Area type="monotone" dataKey="unique" stroke="#8FC4A8" strokeWidth={2} fill="transparent" name="Unique" strokeDasharray="5 3"/>
                  </AreaChart>
                </ResponsiveContainer>
              </div>

              {/* Items bar chart */}
              {itemChart.length > 0 && (
                <div style={{ ...S.card, padding:28 }}>
                  <div style={{ fontFamily:'Poppins,sans-serif', fontWeight:700, fontSize:15, color:'#1E1B18', marginBottom:22 }}>Top Menu Items</div>
                  <ResponsiveContainer width="100%" height={180}>
                    <BarChart data={itemChart} barGap={4}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(42,31,16,0.05)"/>
                      <XAxis dataKey="name" tick={{ fill:'rgba(42,31,16,0.35)', fontSize:10 }} axisLine={false} tickLine={false}/>
                      <YAxis tick={{ fill:'rgba(42,31,16,0.35)', fontSize:11 }} axisLine={false} tickLine={false}/>
                      <Tooltip contentStyle={tip} labelStyle={tipLabel} itemStyle={tipItem}/>
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
            </div>

          ) : (
            /* ════ MENU PERFORMANCE TAB ════ */
            <div style={{ animation:'fadeIn 0.25s ease' }}>

              {/* Top KPI row */}
              <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:14, marginBottom:20 }}>
                {[
                  { label:'Active Items',      value: activeItems.length,              accent:'#1E1B18', bg:'#fff',                          icon:'🍽️' },
                  { label:'Total Item Views',   value: totalViews.toLocaleString(),     accent:'#E05A3A', bg:'rgba(224,90,58,0.07)',           icon:'👁' },
                  { label:'AR Launches',        value: totalARViews.toLocaleString(),   accent:'#F79B3D', bg:'rgba(247,155,61,0.1)',           icon:'🥽' },
                  { label:'AR Engagement Rate', value: arEngagement + '%',              accent:'#5A9A78', bg:'rgba(90,154,120,0.1)',           icon:'📈' },
                ].map(s=>(
                  <div key={s.label} style={{ ...S.card, padding:20, background:s.bg }}>
                    <div style={{ fontSize:20, marginBottom:8 }}>{s.icon}</div>
                    <div style={{ fontFamily:'Poppins,sans-serif', fontWeight:800, fontSize:24, color:s.accent, marginBottom:4 }}>{s.value}</div>
                    <div style={{ fontSize:11, color:'rgba(42,31,16,0.5)', fontWeight:500 }}>{s.label}</div>
                  </div>
                ))}
              </div>

              {/* Heatmap — full item list with engagement bars */}
              <div style={{ ...S.card, padding:28, marginBottom:16 }}>
                <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:20 }}>
                  <div>
                    <div style={{ fontFamily:'Poppins,sans-serif', fontWeight:700, fontSize:15, color:'#1E1B18' }}>🔥 Dish Engagement Heatmap</div>
                    <div style={{ fontSize:12, color:'rgba(42,31,16,0.4)', marginTop:3 }}>Score = views + AR views × 2 + rating × 10</div>
                  </div>
                  <div style={{ display:'flex', gap:12, fontSize:11, color:'rgba(42,31,16,0.45)', alignItems:'center' }}>
                    <span style={{ display:'flex', alignItems:'center', gap:5 }}><span style={{ width:10, height:10, borderRadius:2, background:'#F79B3D', display:'inline-block' }}/>Hot</span>
                    <span style={{ display:'flex', alignItems:'center', gap:5 }}><span style={{ width:10, height:10, borderRadius:2, background:'#5A9A78', display:'inline-block' }}/>Active</span>
                    <span style={{ display:'flex', alignItems:'center', gap:5 }}><span style={{ width:10, height:10, borderRadius:2, background:'rgba(42,31,16,0.2)', display:'inline-block' }}/>Cold</span>
                  </div>
                </div>

                {heatmapData.length === 0 ? (
                  <div style={{ textAlign:'center', padding:'32px 0', color:'rgba(42,31,16,0.35)', fontSize:13 }}>No data yet — views will appear as customers browse your menu.</div>
                ) : (
                  <div style={{ display:'flex', flexDirection:'column', gap:4 }}>
                    {heatmapData.map((item, i) => {
                      const c   = heatColor(item.score);
                      const pct = Math.max(2, Math.round((item.score / maxScore) * 100));
                      return (
                        <div key={item.id} className="bar-row" style={{ display:'grid', gridTemplateColumns:'28px 36px 1fr 60px 60px 60px 60px', gap:8, alignItems:'center', padding:'8px 10px', borderRadius:10, background:'transparent', transition:'background 0.12s' }}>
                          <span style={{ fontSize:11, color:'rgba(42,31,16,0.3)', textAlign:'right' }}>#{i+1}</span>
                          <div style={{ width:36, height:36, borderRadius:10, overflow:'hidden', background:'#F2F0EC', flexShrink:0 }}>
                            {item.imageURL ? <img src={item.imageURL} alt={item.name} style={{ width:'100%', height:'100%', objectFit:'cover' }}/> : <div style={{ width:'100%', height:'100%', display:'flex', alignItems:'center', justifyContent:'center', fontSize:16 }}>🍽️</div>}
                          </div>
                          {/* Name + bar */}
                          <div>
                            <div style={{ fontSize:12, fontWeight:600, color:'#1E1B18', marginBottom:4, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{item.name}</div>
                            <div style={{ height:5, background:'rgba(42,31,16,0.07)', borderRadius:99, overflow:'hidden' }}>
                              <div style={{ height:'100%', width:`${pct}%`, background:c.bar, borderRadius:99, transition:'width 0.4s ease' }}/>
                            </div>
                          </div>
                          <div style={{ textAlign:'center' }}>
                            <div style={{ fontSize:13, fontWeight:700, color:'rgba(42,31,16,0.7)' }}>{item.views||0}</div>
                            <div style={{ fontSize:10, color:'rgba(42,31,16,0.35)' }}>views</div>
                          </div>
                          <div style={{ textAlign:'center' }}>
                            <div style={{ fontSize:13, fontWeight:700, color:'#F79B3D' }}>{item.arViews||0}</div>
                            <div style={{ fontSize:10, color:'rgba(42,31,16,0.35)' }}>AR</div>
                          </div>
                          <div style={{ textAlign:'center' }}>
                            <div style={{ fontSize:13, fontWeight:700, color:'#E05A3A' }}>{item.arRate}%</div>
                            <div style={{ fontSize:10, color:'rgba(42,31,16,0.35)' }}>AR rate</div>
                          </div>
                          <div style={{ textAlign:'center' }}>
                            {item.ratingCount > 0 ? (
                              <>
                                <div style={{ fontSize:13, fontWeight:700, color:'#F79B3D' }}>★ {item.ratingAvg?.toFixed(1)}</div>
                                <div style={{ fontSize:10, color:'rgba(42,31,16,0.35)' }}>{item.ratingCount} votes</div>
                              </>
                            ) : (
                              <div style={{ fontSize:11, color:'rgba(42,31,16,0.25)' }}>—</div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Category breakdown + Ratings side by side */}
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16, marginBottom:16 }}>

                {/* Category pie */}
                <div style={{ ...S.card, padding:24 }}>
                  <div style={{ fontFamily:'Poppins,sans-serif', fontWeight:700, fontSize:14, color:'#1E1B18', marginBottom:16 }}>📂 Category Breakdown</div>
                  {catData.length > 0 ? (
                    <>
                      <ResponsiveContainer width="100%" height={180}>
                        <PieChart>
                          <Pie data={catData} dataKey="views" nameKey="name" cx="50%" cy="50%" outerRadius={72} paddingAngle={3}>
                            {catData.map((_, i) => <Cell key={i} fill={CAT_COLORS[i % CAT_COLORS.length]}/>)}
                          </Pie>
                          <Tooltip content={<PieTooltip />}/>
                        </PieChart>
                      </ResponsiveContainer>
                      <div style={{ display:'flex', flexDirection:'column', gap:7, marginTop:8 }}>
                        {catData.slice(0,6).map((c,i) => (
                          <div key={c.name} style={{ display:'flex', alignItems:'center', gap:8, fontSize:13 }}>
                            <div style={{ width:11, height:11, borderRadius:3, background:CAT_COLORS[i % CAT_COLORS.length], flexShrink:0 }}/>
                            <span style={{ flex:1, color:'#1E1B18', fontWeight:600, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{c.name}</span>
                            <span style={{ color:'#1E1B18', fontWeight:700 }}>{c.views}</span>
                            <span style={{ color:'rgba(42,31,16,0.45)', fontSize:11 }}>views</span>
                          </div>
                        ))}
                      </div>
                    </>
                  ) : (
                    <div style={{ textAlign:'center', padding:'32px 0', color:'rgba(42,31,16,0.35)', fontSize:13 }}>No category data yet</div>
                  )}
                </div>

                {/* Ratings leaderboard */}
                <div style={{ ...S.card, padding:24 }}>
                  <div style={{ fontFamily:'Poppins,sans-serif', fontWeight:700, fontSize:14, color:'#1E1B18', marginBottom:16 }}>⭐ Ratings Leaderboard</div>
                  {topRated.length === 0 ? (
                    <div style={{ textAlign:'center', padding:'32px 0', color:'rgba(42,31,16,0.35)', fontSize:13 }}>No ratings yet — customers can rate dishes from the menu.</div>
                  ) : (
                    <>
                      <div style={{ fontSize:11, fontWeight:700, color:'rgba(42,31,16,0.4)', letterSpacing:'0.05em', textTransform:'uppercase', marginBottom:10 }}>Top Rated</div>
                      {topRated.map((item, i) => (
                        <div key={item.id} style={{ display:'flex', alignItems:'center', gap:10, padding:'8px 0', borderBottom:'1px solid rgba(42,31,16,0.05)' }}>
                          <span style={{ fontSize:11, color:'rgba(42,31,16,0.3)', width:16, textAlign:'right', flexShrink:0 }}>#{i+1}</span>
                          <div style={{ flex:1, fontSize:12, fontWeight:500, color:'#1E1B18', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{item.name}</div>
                          <div style={{ display:'flex', gap:1 }}>
                            {[1,2,3,4,5].map(s => <span key={s} style={{ fontSize:12, color: s <= Math.round(item.ratingAvg||0) ? '#F79B3D' : 'rgba(42,31,16,0.15)' }}>★</span>)}
                          </div>
                          <span style={{ fontSize:12, fontWeight:700, color:'#F79B3D' }}>{item.ratingAvg?.toFixed(1)}</span>
                          <span style={{ fontSize:11, color:'rgba(42,31,16,0.35)' }}>({item.ratingCount})</span>
                        </div>
                      ))}
                      {lowRated.length > 0 && (
                        <>
                          <div style={{ fontSize:11, fontWeight:700, color:'rgba(42,31,16,0.4)', letterSpacing:'0.05em', textTransform:'uppercase', margin:'16px 0 10px' }}>Needs Attention</div>
                          {lowRated.map(item => (
                            <div key={item.id} style={{ display:'flex', alignItems:'center', gap:10, padding:'8px 0', borderBottom:'1px solid rgba(42,31,16,0.05)' }}>
                              <div style={{ flex:1, fontSize:12, fontWeight:500, color:'rgba(42,31,16,0.6)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{item.name}</div>
                              <div style={{ display:'flex', gap:1 }}>
                                {[1,2,3,4,5].map(s => <span key={s} style={{ fontSize:12, color: s <= Math.round(item.ratingAvg||0) ? '#E05A3A' : 'rgba(42,31,16,0.15)' }}>★</span>)}
                              </div>
                              <span style={{ fontSize:12, fontWeight:700, color:'#E05A3A' }}>{item.ratingAvg?.toFixed(1)}</span>
                            </div>
                          ))}
                        </>
                      )}
                    </>
                  )}
                </div>
              </div>

              {/* Ignored items alert */}
              {ignoredItems.length > 0 && (
                <div style={{ ...S.card, padding:24, border:'1.5px solid rgba(224,90,58,0.2)', background:'rgba(224,90,58,0.04)' }}>
                  <div style={{ fontFamily:'Poppins,sans-serif', fontWeight:700, fontSize:14, color:'#C04A28', marginBottom:4 }}>
                    ⚠️ {ignoredItems.length} item{ignoredItems.length > 1 ? 's' : ''} with zero views
                  </div>
                  <div style={{ fontSize:12, color:'rgba(42,31,16,0.5)', marginBottom:14 }}>
                    These dishes have never been viewed. Consider reordering, updating their photo, or deactivating them.
                  </div>
                  <div style={{ display:'flex', flexWrap:'wrap', gap:8 }}>
                    {ignoredItems.map(item => (
                      <div key={item.id} style={{ display:'flex', alignItems:'center', gap:8, padding:'6px 12px', borderRadius:10, background:'rgba(224,90,58,0.08)', border:'1px solid rgba(224,90,58,0.18)' }}>
                        <div style={{ width:24, height:24, borderRadius:6, overflow:'hidden', background:'#F2F0EC', flexShrink:0 }}>
                          {item.imageURL ? <img src={item.imageURL} alt="" style={{ width:'100%', height:'100%', objectFit:'cover' }}/> : <span style={{ fontSize:12, lineHeight:'24px', display:'block', textAlign:'center' }}>🍽️</span>}
                        </div>
                        <span style={{ fontSize:12, fontWeight:600, color:'#C04A28' }}>{item.name}</span>
                        <span style={{ fontSize:11, color:'rgba(42,31,16,0.4)' }}>{item.category || 'no category'}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </AdminLayout>
  );
}

AdminAnalytics.getLayout = (page) => page;
