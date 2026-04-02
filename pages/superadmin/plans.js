import Head from 'next/head';
import { useEffect, useState } from 'react';
import SuperAdminLayout from '../../components/layout/SuperAdminLayout';
import { getAllRestaurants, updateRestaurant } from '../../lib/saDb';
import toast from 'react-hot-toast';

const PLANS = [
  {
    id: 'starter', label: 'Starter', price: 999,
    maxItems: 20, maxStorageMB: 1024,
    color: '#5A8AC4', bg: 'rgba(90,138,196,0.1)',
    features: ['Up to 20 menu items', '1 GB storage', 'QR code menu', 'Smart Menu Assistant', 'Basic analytics'],
  },
  {
    id: 'growth', label: 'Growth', price: 2499,
    maxItems: 60, maxStorageMB: 3072,
    color: '#E05A3A', bg: 'rgba(224,90,58,0.1)',
    features: ['Up to 60 menu items', '3 GB storage', 'Everything in Starter', 'AR food visualization', 'AI upselling', 'Dish ratings', 'Waiter call system'],
  },
  {
    id: 'pro', label: 'Pro', price: 4999,
    maxItems: 150, maxStorageMB: 10240,
    color: '#8A5AC4', bg: 'rgba(138,90,196,0.1)',
    features: ['Up to 150 menu items', '10 GB storage', 'Everything in Growth', 'Priority support', 'CSV menu import', 'Advanced analytics', 'Custom branding'],
  },
];

const S = {
  card:  { background:'#FFFFFF', border:'1px solid rgba(42,31,16,0.07)', borderRadius:20, boxShadow:'0 2px 14px rgba(42,31,16,0.06)' },
  label: { display:'block', fontSize:11, fontWeight:600, color:'rgba(42,31,16,0.5)', letterSpacing:'0.05em', textTransform:'uppercase', marginBottom:5 },
  input: { width:'100%', padding:'9px 12px', background:'#F7F5F2', border:'1.5px solid rgba(42,31,16,0.09)', borderRadius:10, fontSize:13, color:'#1E1B18', fontFamily:'Inter,sans-serif', outline:'none', boxSizing:'border-box' },
};

function addMonths(dateStr, n) {
  const d = dateStr ? new Date(dateStr) : new Date();
  d.setMonth(d.getMonth() + n);
  return d.toISOString().slice(0, 10);
}

function daysLeft(endStr) {
  if (!endStr) return null;
  const diff = new Date(endStr) - new Date();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

function StatusBadge({ restaurant }) {
  const days = daysLeft(restaurant.subscriptionEnd);
  const active = restaurant.paymentStatus === 'active';
  const isActive = restaurant.isActive;

  if (!isActive)  return <span style={{ padding:'3px 10px', borderRadius:20, fontSize:11, fontWeight:700, background:'rgba(42,31,16,0.08)', color:'rgba(42,31,16,0.4)' }}>Inactive</span>;
  if (!active)    return <span style={{ padding:'3px 10px', borderRadius:20, fontSize:11, fontWeight:700, background:'rgba(139,26,42,0.1)', color:'#8B1A2A' }}>No Subscription</span>;
  if (days === null) return <span style={{ padding:'3px 10px', borderRadius:20, fontSize:11, fontWeight:700, background:'rgba(224,90,58,0.1)', color:'#C04A28' }}>No Expiry Set</span>;
  if (days < 0)   return <span style={{ padding:'3px 10px', borderRadius:20, fontSize:11, fontWeight:700, background:'rgba(139,26,42,0.1)', color:'#8B1A2A' }}>⚠ Expired</span>;
  if (days <= 14) return <span style={{ padding:'3px 10px', borderRadius:20, fontSize:11, fontWeight:700, background:'rgba(240,160,40,0.12)', color:'#8B6010' }}>⏳ {days}d left</span>;
  return <span style={{ padding:'3px 10px', borderRadius:20, fontSize:11, fontWeight:700, background:'rgba(90,154,120,0.12)', color:'#1A5A38' }}>✓ Active · {days}d left</span>;
}

export default function SuperAdminPlans() {
  const [restaurants, setRestaurants] = useState([]);
  const [loading, setLoading]         = useState(true);
  const [saving, setSaving]           = useState(null); // restaurantId being saved
  const [expanded, setExpanded]       = useState(null); // expanded restaurantId
  const [edits, setEdits]             = useState({});   // { [id]: editData }
  const [search, setSearch]           = useState('');
  const [filterStatus, setFilterStatus] = useState('all'); // all | active | expired | inactive

  const load = async () => {
    const r = await getAllRestaurants();
    setRestaurants(r);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const getEdit = (r) => edits[r.id] || {
    plan:              r.plan              || 'basic',
    maxItems:          r.maxItems          ?? 10,
    maxStorageMB:      r.maxStorageMB      ?? 500,
    subscriptionStart: r.subscriptionStart || '',
    subscriptionEnd:   r.subscriptionEnd   || '',
    paymentStatus:     r.paymentStatus     || 'inactive',
    isActive:          r.isActive          !== false,
  };

  const setEdit = (id, patch) =>
    setEdits(prev => ({ ...prev, [id]: { ...getEdit({ id, ...restaurants.find(r=>r.id===id) }), ...patch } }));

  const handlePlanClick = (id, planId) => {
    const plan = PLANS.find(p => p.id === planId);
    setEdit(id, { plan: planId, maxItems: plan.maxItems, maxStorageMB: plan.maxStorageMB });
  };

  const handleQuickExpiry = (id, months) => {
    const edit = getEdit(restaurants.find(r => r.id === id));
    const start = edit.subscriptionStart || new Date().toISOString().slice(0,10);
    setEdit(id, {
      subscriptionStart: start,
      subscriptionEnd:   addMonths(start, months),
      paymentStatus:     'active',
    });
  };

  const handleSave = async (r) => {
    const edit = getEdit(r);
    setSaving(r.id);
    try {
      await updateRestaurant(r.id, {
        plan:              edit.plan,
        maxItems:          Number(edit.maxItems),
        maxStorageMB:      Number(edit.maxStorageMB),
        subscriptionStart: edit.subscriptionStart || null,
        subscriptionEnd:   edit.subscriptionEnd   || null,
        paymentStatus:     edit.paymentStatus,
        isActive:          edit.isActive,
      });
      toast.success(`${r.name} updated`);
      // clear local edit, reload
      setEdits(prev => { const n={...prev}; delete n[r.id]; return n; });
      await load();
    } catch (e) { toast.error('Save failed: ' + e.message); }
    finally { setSaving(null); }
  };

  const quickToggleActive = async (r) => {
    setSaving(r.id);
    try {
      await updateRestaurant(r.id, { isActive: !r.isActive });
      toast.success(r.isActive ? `${r.name} deactivated` : `${r.name} activated`);
      await load();
    } catch { toast.error('Failed'); }
    finally { setSaving(null); }
  };

  // Filter
  const filtered = restaurants.filter(r => {
    const matchSearch = r.name?.toLowerCase().includes(search.toLowerCase()) ||
                        r.subdomain?.toLowerCase().includes(search.toLowerCase());
    if (!matchSearch) return false;
    if (filterStatus === 'active')   return r.isActive && r.paymentStatus === 'active' && daysLeft(r.subscriptionEnd) > 0;
    if (filterStatus === 'expired')  return r.paymentStatus === 'active' && daysLeft(r.subscriptionEnd) <= 0;
    if (filterStatus === 'inactive') return !r.isActive || r.paymentStatus !== 'active';
    return true;
  });

  const counts = {
    active:   restaurants.filter(r => r.isActive && r.paymentStatus==='active' && daysLeft(r.subscriptionEnd) > 0).length,
    expired:  restaurants.filter(r => r.paymentStatus==='active' && daysLeft(r.subscriptionEnd) <= 0).length,
    inactive: restaurants.filter(r => !r.isActive || r.paymentStatus!=='active').length,
  };

  return (
    <SuperAdminLayout>
      <Head><title>Plan Manager — Advert Radical</title></Head>
      <div style={{ background:'#F2F0EC', minHeight:'100vh', padding:32, fontFamily:'Inter,sans-serif' }}>
        <div style={{ maxWidth:1000, margin:'0 auto' }}>
          <style>{`
            @keyframes spin { to { transform:rotate(360deg) } }
            @keyframes fadeUp { from{opacity:0;transform:translateY(10px)} to{opacity:1;transform:translateY(0)} }
            .inp:focus { border-color:#E05A3A !important; box-shadow:0 0 0 3px rgba(224,90,58,0.1); }
            .plan-card { cursor:pointer; border-radius:12px; padding:10px 14px; border:2px solid transparent; transition:all 0.15s; text-align:center; }
            .plan-card:hover { transform:translateY(-1px); }
            .r-row { border-radius:16px; overflow:hidden; margin-bottom:10px; box-shadow:0 2px 10px rgba(42,31,16,0.05); animation:fadeUp 0.3s ease both; }
            .quick-btn { padding:5px 11px; border-radius:8px; border:1.5px solid rgba(42,31,16,0.1); background:#F7F5F2; font-size:11px; font-weight:700; color:rgba(42,31,16,0.6); cursor:pointer; font-family:Inter,sans-serif; transition:all 0.15s; white-space:nowrap; }
            .quick-btn:hover { border-color:#E05A3A; color:#E05A3A; background:rgba(224,90,58,0.06); }
            .quick-btn.active-btn { background:#E05A3A; color:#fff; border-color:#E05A3A; }
          `}</style>

          {/* Header */}
          <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', marginBottom:28 }}>
            <div>
              <h1 style={{ fontFamily:'Poppins,sans-serif', fontWeight:800, fontSize:24, color:'#1E1B18', margin:0 }}>Plan Manager</h1>
              <p style={{ fontSize:13, color:'rgba(42,31,16,0.45)', marginTop:4 }}>Manually control plans, expiry and access for all restaurants</p>
            </div>
            <div style={{ display:'flex', gap:8 }}>
              {[
                { key:'all',      label:`All (${restaurants.length})`,     color:'#1E1B18' },
                { key:'active',   label:`Active (${counts.active})`,        color:'#1A5A38' },
                { key:'expired',  label:`Expired (${counts.expired})`,      color:'#8B1A2A' },
                { key:'inactive', label:`Inactive (${counts.inactive})`,    color:'rgba(42,31,16,0.45)' },
              ].map(f => (
                <button key={f.key} onClick={()=>setFilterStatus(f.key)}
                  style={{ padding:'7px 14px', borderRadius:20, border:'none', fontSize:12, fontWeight:600, cursor:'pointer', fontFamily:'Inter,sans-serif',
                    background: filterStatus===f.key ? '#1E1B18' : '#fff',
                    color: filterStatus===f.key ? '#FFF5E8' : f.color,
                    boxShadow: filterStatus===f.key ? '0 2px 8px rgba(30,27,24,0.18)' : '0 1px 4px rgba(42,31,16,0.06)',
                    transition:'all 0.15s' }}>
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          {/* Summary cards */}
          <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:14, marginBottom:24 }}>
            {[
              { label:'Active Subscriptions', value:counts.active,   color:'#1A5A38', bg:'rgba(90,154,120,0.1)',  icon:'✓' },
              { label:'Expiring in 14 days',  value:restaurants.filter(r=>{ const d=daysLeft(r.subscriptionEnd); return d!==null&&d>=0&&d<=14; }).length, color:'#8B6010', bg:'rgba(240,160,40,0.1)', icon:'⏳' },
              { label:'Expired / No Sub',     value:counts.expired + counts.inactive, color:'#8B1A2A', bg:'rgba(139,26,42,0.08)', icon:'⚠' },
            ].map(c => (
              <div key={c.label} style={{ ...S.card, padding:'18px 22px', display:'flex', alignItems:'center', gap:16 }}>
                <div style={{ width:42, height:42, borderRadius:12, background:c.bg, display:'flex', alignItems:'center', justifyContent:'center', fontSize:18, flexShrink:0 }}>{c.icon}</div>
                <div>
                  <div style={{ fontSize:26, fontWeight:800, color:c.color, fontFamily:'Poppins,sans-serif', lineHeight:1 }}>{c.value}</div>
                  <div style={{ fontSize:11, color:'rgba(42,31,16,0.45)', marginTop:3 }}>{c.label}</div>
                </div>
              </div>
            ))}
          </div>

          {/* Search */}
          <div style={{ position:'relative', marginBottom:18 }}>
            <span style={{ position:'absolute', left:14, top:'50%', transform:'translateY(-50%)', fontSize:14, color:'rgba(42,31,16,0.3)', pointerEvents:'none' }}>🔍</span>
            <input style={{ ...S.input, paddingLeft:40, borderRadius:14, fontSize:14, background:'#fff', padding:'11px 14px 11px 40px' }}
              placeholder="Search restaurant name or subdomain…"
              value={search} onChange={e=>setSearch(e.target.value)} />
          </div>

          {/* Restaurant rows */}
          {loading ? (
            <div style={{ display:'flex', justifyContent:'center', padding:60 }}>
              <div style={{ width:32, height:32, border:'3px solid #E05A3A', borderTopColor:'transparent', borderRadius:'50%', animation:'spin 0.8s linear infinite' }}/>
            </div>
          ) : filtered.length === 0 ? (
            <div style={{ textAlign:'center', padding:'60px 20px', color:'rgba(42,31,16,0.35)' }}>
              <div style={{ fontSize:40, marginBottom:12 }}>🏪</div>
              <div style={{ fontWeight:600 }}>No restaurants found</div>
            </div>
          ) : filtered.map((r, idx) => {
            const edit    = getEdit(r);
            const isOpen  = expanded === r.id;
            const isDirty = JSON.stringify(edit) !== JSON.stringify(getEdit({ id:r.id }));
            const days    = daysLeft(edit.subscriptionEnd);
            const planInfo = PLANS.find(p => p.id === edit.plan) || PLANS[0];

            return (
              <div key={r.id} className="r-row" style={{ animationDelay:`${idx*0.04}s` }}>

                {/* Collapsed row */}
                <div onClick={()=>setExpanded(isOpen ? null : r.id)}
                  style={{ display:'grid', gridTemplateColumns:'1fr auto auto auto auto', gap:16, alignItems:'center',
                    padding:'16px 20px', background:'#fff', cursor:'pointer',
                    borderBottom: isOpen ? '1px solid rgba(42,31,16,0.07)' : 'none', transition:'background 0.12s' }}
                  onMouseEnter={e=>e.currentTarget.style.background='rgba(224,90,58,0.03)'}
                  onMouseLeave={e=>e.currentTarget.style.background='#fff'}>

                  <div style={{ display:'flex', alignItems:'center', gap:12 }}>
                    <div style={{ width:36, height:36, borderRadius:10, background: planInfo.bg, display:'flex', alignItems:'center', justifyContent:'center', fontSize:15, flexShrink:0, border:`1.5px solid ${planInfo.color}33` }}>
                      🏪
                    </div>
                    <div>
                      <div style={{ fontWeight:700, fontSize:14, color:'#1E1B18' }}>{r.name}</div>
                      <div style={{ fontSize:11, color:'rgba(42,31,16,0.4)', marginTop:1 }}>{r.subdomain}.advertradical.com</div>
                    </div>
                  </div>

                  {/* Plan badge */}
                  <span style={{ padding:'4px 12px', borderRadius:20, fontSize:11, fontWeight:700, background:planInfo.bg, color:planInfo.color, border:`1px solid ${planInfo.color}33` }}>
                    {planInfo.label}
                  </span>

                  {/* Status */}
                  <StatusBadge restaurant={r} />

                  {/* Quick toggle active */}
                  <div onClick={e=>{e.stopPropagation(); quickToggleActive(r);}}
                    style={{ width:34, height:20, borderRadius:99, background:r.isActive?'#8FC4A8':'rgba(42,31,16,0.15)', position:'relative', cursor:'pointer', transition:'background 0.2s', flexShrink:0, opacity:saving===r.id?0.5:1 }}>
                    <div style={{ width:14, height:14, borderRadius:'50%', background:'#fff', position:'absolute', top:3, left:r.isActive?17:3, transition:'left 0.2s', boxShadow:'0 1px 3px rgba(0,0,0,0.2)' }}/>
                  </div>

                  <span style={{ fontSize:13, color:'rgba(42,31,16,0.3)', transition:'transform 0.2s', display:'inline-block', transform:isOpen?'rotate(90deg)':'rotate(0deg)' }}>›</span>
                </div>

                {/* Expanded editor */}
                {isOpen && (
                  <div style={{ padding:'22px 24px 24px', background:'#FAFAF8' }}>

                    {/* Plan selector */}
                    <div style={{ marginBottom:20 }}>
                      <label style={S.label}>Plan</label>
                      <div style={{ display:'flex', gap:10 }}>
                        {PLANS.map(p => (
                          <div key={p.id} className="plan-card"
                            onClick={()=>handlePlanClick(r.id, p.id)}
                            style={{ flex:1, background:edit.plan===p.id?p.bg:'#F7F5F2', borderColor:edit.plan===p.id?p.color:'transparent', boxShadow:edit.plan===p.id?`0 3px 12px ${p.color}33`:'' }}>
                            <div style={{ fontFamily:'Poppins,sans-serif', fontWeight:700, fontSize:13, color:edit.plan===p.id?p.color:'#1E1B18' }}>{p.label}</div>
                            <div style={{ fontSize:12, fontWeight:700, color:edit.plan===p.id?p.color:'rgba(42,31,16,0.6)', marginTop:2 }}>₹{p.price?.toLocaleString('en-IN')}/mo</div>
                            <div style={{ fontSize:11, color:'rgba(42,31,16,0.45)', marginTop:3 }}>{p.maxItems} items · {p.maxStorageMB>=1024?p.maxStorageMB/1024+'GB':p.maxStorageMB+'MB'}</div>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Override limits */}
                    <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14, marginBottom:20 }}>
                      <div>
                        <label style={S.label}>Max AR Items (override)</label>
                        <input style={S.input} type="number" min="0" value={edit.maxItems}
                          onChange={e=>setEdit(r.id, {maxItems:e.target.value})} />
                      </div>
                      <div>
                        <label style={S.label}>Max Storage MB (override)</label>
                        <input style={S.input} type="number" min="0" value={edit.maxStorageMB}
                          onChange={e=>setEdit(r.id, {maxStorageMB:e.target.value})} />
                      </div>
                    </div>

                    {/* Subscription dates */}
                    <div style={{ marginBottom:12 }}>
                      <label style={S.label}>Subscription Period</label>
                      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14, marginBottom:10 }}>
                        <div>
                          <div style={{ fontSize:11, color:'rgba(42,31,16,0.4)', marginBottom:5 }}>Start Date</div>
                          <input style={S.input} type="date" value={edit.subscriptionStart}
                            onChange={e=>setEdit(r.id, {subscriptionStart:e.target.value})} />
                        </div>
                        <div>
                          <div style={{ fontSize:11, color:'rgba(42,31,16,0.4)', marginBottom:5 }}>
                            End Date
                            {days !== null && (
                              <span style={{ marginLeft:8, fontWeight:700, color:days<0?'#8B1A2A':days<=14?'#8B6010':'#1A5A38' }}>
                                ({days < 0 ? `Expired ${Math.abs(days)}d ago` : `${days}d remaining`})
                              </span>
                            )}
                          </div>
                          <input style={S.input} type="date" value={edit.subscriptionEnd}
                            onChange={e=>setEdit(r.id, {subscriptionEnd:e.target.value})} />
                        </div>
                      </div>

                      {/* Quick expiry shortcuts */}
                      <div style={{ display:'flex', alignItems:'center', gap:8, flexWrap:'wrap' }}>
                        <span style={{ fontSize:11, color:'rgba(42,31,16,0.4)', fontWeight:600 }}>Quick set expiry:</span>
                        {[
                          { label:'+1 Month',  months:1  },
                          { label:'+3 Months', months:3  },
                          { label:'+6 Months', months:6  },
                          { label:'+1 Year',   months:12 },
                        ].map(q => (
                          <button key={q.label} className="quick-btn" onClick={()=>handleQuickExpiry(r.id, q.months)}>
                            {q.label}
                          </button>
                        ))}
                        <button className="quick-btn" style={{ color:'#8B1A2A', borderColor:'rgba(139,26,42,0.2)' }}
                          onClick={()=>setEdit(r.id, { subscriptionEnd: new Date().toISOString().slice(0,10), paymentStatus:'inactive' })}>
                          Expire Now
                        </button>
                      </div>
                    </div>

                    {/* Status toggles */}
                    <div style={{ display:'flex', gap:12, marginBottom:22, paddingTop:16, borderTop:'1px solid rgba(42,31,16,0.07)', flexWrap:'wrap' }}>
                      {[
                        { key:'isActive',      label:'Restaurant Active',   desc:'Visible to customers',        isOn: edit.isActive,                    toggle:()=>setEdit(r.id,{isActive:!edit.isActive}) },
                        { key:'paymentStatus', label:'Payment Active',      desc:'Subscription marked as paid',  isOn: edit.paymentStatus==='active',    toggle:()=>setEdit(r.id,{paymentStatus:edit.paymentStatus==='active'?'inactive':'active'}) },
                      ].map(t => (
                        <div key={t.key} onClick={t.toggle}
                          style={{ display:'flex', alignItems:'center', gap:10, padding:'10px 16px', borderRadius:12,
                            border:`1.5px solid ${t.isOn?'rgba(143,196,168,0.5)':'rgba(42,31,16,0.09)'}`,
                            background:t.isOn?'rgba(143,196,168,0.08)':'#F7F5F2', cursor:'pointer', transition:'all 0.15s' }}>
                          <div style={{ width:34, height:20, borderRadius:99, background:t.isOn?'#8FC4A8':'rgba(42,31,16,0.15)', position:'relative', transition:'background 0.2s', flexShrink:0 }}>
                            <div style={{ width:14, height:14, borderRadius:'50%', background:'#fff', position:'absolute', top:3, left:t.isOn?17:3, transition:'left 0.2s', boxShadow:'0 1px 3px rgba(0,0,0,0.2)' }}/>
                          </div>
                          <div>
                            <div style={{ fontSize:13, fontWeight:700, color:'#1E1B18' }}>{t.label}</div>
                            <div style={{ fontSize:11, color:'rgba(42,31,16,0.4)' }}>{t.desc}</div>
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Save / cancel */}
                    <div style={{ display:'flex', gap:10 }}>
                      <button onClick={()=>handleSave(r)} disabled={saving===r.id}
                        style={{ padding:'11px 28px', borderRadius:12, border:'none', background:'#1E1B18', color:'#FFF5E8', fontSize:14, fontWeight:700, fontFamily:'Poppins,sans-serif', cursor:'pointer', opacity:saving===r.id?0.6:1, display:'flex', alignItems:'center', gap:8 }}>
                        {saving===r.id
                          ? <><span style={{ width:14, height:14, border:'2px solid #FFF5E8', borderTopColor:'transparent', borderRadius:'50%', animation:'spin 0.7s linear infinite', display:'inline-block' }}/> Saving…</>
                          : '💾 Save Changes'}
                      </button>
                      <button onClick={()=>{ setEdits(prev=>{const n={...prev};delete n[r.id];return n;}); setExpanded(null); }}
                        style={{ padding:'11px 20px', borderRadius:12, border:'1.5px solid rgba(42,31,16,0.12)', background:'transparent', fontSize:13, fontWeight:600, color:'rgba(42,31,16,0.55)', cursor:'pointer' }}>
                        Cancel
                      </button>
                      {isDirty && <span style={{ alignSelf:'center', fontSize:11, color:'#C04A28', fontWeight:600 }}>● Unsaved changes</span>}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </SuperAdminLayout>
  );
}
