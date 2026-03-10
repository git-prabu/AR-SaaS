// pages/superadmin/restaurant/[id].js
import Head from 'next/head';
import { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import SuperAdminLayout from '../../../components/layout/SuperAdminLayout';
import {
  getRestaurantById, updateRestaurant,
  getAllMenuItems, updateMenuItem, deleteMenuItem,
  getRequests, updateRequestStatus,
  getAnalytics,
} from '../../../lib/db';
import { uploadFile, buildImagePath, buildModelPath, fileSizeMB, deleteFile } from '../../../lib/storage';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import toast from 'react-hot-toast';

// ── Temp URL until domain is purchased & DNS configured ──────────
// When you buy advertradical.com, change this to: 'https://{subdomain}.advertradical.com'
const getMenuURL = (subdomain) =>
  `${process.env.NEXT_PUBLIC_VERCEL_URL
    ? `https://${process.env.NEXT_PUBLIC_VERCEL_URL}`
    : 'https://ar-saa-s-kbzn.vercel.app'}/restaurant/${subdomain}`;

const PLANS = [
  { id:'basic',   label:'Basic',   maxItems:10,  maxStorageMB:500  },
  { id:'pro',     label:'Pro',     maxItems:40,  maxStorageMB:2048 },
  { id:'premium', label:'Premium', maxItems:100, maxStorageMB:5120 },
];
const SPICE_LEVELS = ['None','Mild','Medium','Spicy','Very Spicy'];
const OFFER_BADGES = ['Chef\'s Special','Best Seller','Must Try','New','Limited'];

const S = {
  card:  { background:'#FFFFFF', border:'1px solid rgba(42,31,16,0.07)', borderRadius:20, boxShadow:'0 2px 14px rgba(42,31,16,0.06)' },
  label: { display:'block', fontSize:11, fontWeight:600, color:'rgba(42,31,16,0.5)', letterSpacing:'0.05em', textTransform:'uppercase', marginBottom:6 },
  input: { width:'100%', padding:'10px 13px', background:'#F7F5F2', border:'1.5px solid rgba(42,31,16,0.09)', borderRadius:11, fontSize:13, color:'#1E1B18', fontFamily:'Inter,sans-serif', outline:'none', boxSizing:'border-box', transition:'border-color 0.15s' },
  tip:   { backgroundColor:'#1E1B18', border:'none', borderRadius:10, color:'#FFF5E8', fontSize:12, fontFamily:'Inter,sans-serif' },
};

export default function RestaurantDetail() {
  const router = useRouter();
  const { id } = router.query;

  const [restaurant, setRestaurant] = useState(null);
  const [loading,    setLoading]    = useState(true);
  const [tab,        setTab]        = useState('overview');

  // Overview edit state
  const [editing,    setEditing]    = useState(false);
  const [editData,   setEditData]   = useState({});
  const [saving,     setSaving]     = useState(false);

  // Menu items state
  const [items,      setItems]      = useState([]);
  const [itemsLoaded,setItemsLoaded]= useState(false);
  const [itemEdit,   setItemEdit]   = useState(null);
  const [itemData,   setItemData]   = useState({});
  const [itemSaving, setItemSaving] = useState(false);
  const [imgUpload,  setImgUpload]  = useState({}); // { [itemId]: { progress, uploading } }
  const [arUpload,   setArUpload]   = useState({}); // { [itemId]: { progress, uploading } }
  const imgInputRef = useRef({});
  const arInputRef  = useRef({});

  // Analytics state
  const [analytics,  setAnalytics]  = useState([]);
  const [analLoaded, setAnalLoaded] = useState(false);

  // Requests state
  const [requests,   setRequests]   = useState([]);
  const [reqFilter,  setReqFilter]  = useState('all');
  const [reqLoaded,  setReqLoaded]  = useState(false);

  // Load restaurant
  useEffect(() => {
    if (!id) return;
    getRestaurantById(id).then(r => { setRestaurant(r); setLoading(false); });
  }, [id]);

  // Load tab data on demand
  useEffect(() => {
    if (!id || !restaurant) return;
    if (tab === 'menu' && !itemsLoaded) {
      getAllMenuItems(id).then(data => {
        setItems(data.sort((a,b) => {
          if (a.isFeatured && !b.isFeatured) return -1;
          if (!a.isFeatured && b.isFeatured) return 1;
          const ao = a.sortOrder ?? 9999, bo = b.sortOrder ?? 9999;
          return ao !== bo ? ao - bo : (a.createdAt?.seconds||0) - (b.createdAt?.seconds||0);
        }));
        setItemsLoaded(true);
      });
    }
    if (tab === 'analytics' && !analLoaded) {
      getAnalytics(id, 30).then(data => { setAnalytics(data); setAnalLoaded(true); });
    }
    if (tab === 'requests' && !reqLoaded) {
      getRequests(id, reqFilter === 'all' ? null : reqFilter).then(data => { setRequests(data); setReqLoaded(true); });
    }
  }, [tab, id, restaurant]);

  useEffect(() => {
    if (tab === 'requests' && id) {
      setReqLoaded(false);
      getRequests(id, reqFilter === 'all' ? null : reqFilter).then(data => { setRequests(data); setReqLoaded(true); });
    }
  }, [reqFilter]);

  const startEdit = () => {
    setEditData({
      name:              restaurant.name || '',
      subdomain:         restaurant.subdomain || '',
      plan:              restaurant.plan || 'basic',
      maxItems:          restaurant.maxItems || 10,
      maxStorageMB:      restaurant.maxStorageMB || 500,
      itemsUsed:         restaurant.itemsUsed || 0,
      storageUsedMB:     restaurant.storageUsedMB || 0,
      isActive:          restaurant.isActive !== false,
      paymentStatus:     restaurant.paymentStatus || 'inactive',
      subscriptionStart: restaurant.subscriptionStart || '',
      subscriptionEnd:   restaurant.subscriptionEnd || '',
    });
    setEditing(true);
  };

  const saveEdit = async () => {
    setSaving(true);
    try {
      await updateRestaurant(id, {
        name:              editData.name,
        subdomain:         editData.subdomain.toLowerCase(),
        plan:              editData.plan,
        maxItems:          Number(editData.maxItems),
        maxStorageMB:      Number(editData.maxStorageMB),
        itemsUsed:         Number(editData.itemsUsed),
        storageUsedMB:     Number(editData.storageUsedMB),
        isActive:          editData.isActive,
        paymentStatus:     editData.paymentStatus,
        subscriptionStart: editData.subscriptionStart,
        subscriptionEnd:   editData.subscriptionEnd,
      });
      const updated = await getRestaurantById(id);
      setRestaurant(updated);
      setEditing(false);
      toast.success('Restaurant updated!');
    } catch (e) { toast.error('Save failed: ' + e.message); }
    finally { setSaving(false); }
  };

  const handlePlanChange = (planId) => {
    const plan = PLANS.find(p => p.id === planId);
    setEditData(d => ({ ...d, plan: planId, maxItems: plan.maxItems, maxStorageMB: plan.maxStorageMB }));
  };

  const saveItemEdit = async () => {
    setItemSaving(true);
    try {
      const saveData = {
        ...itemData,
        price:      itemData.price !== '' ? Number(itemData.price) : null,
        ingredients: itemData.ingredients ? itemData.ingredients.split(',').map(s=>s.trim()).filter(Boolean) : [],
        nutritionalData: {
          calories: Number(itemData.calories)||null,
          protein:  Number(itemData.protein)||null,
          carbs:    Number(itemData.carbs)||null,
          fats:     Number(itemData.fats)||null,
        },
        pairsWith: itemData.pairsWith||[],
        isVeg:     itemData.isVeg,
      };
      await updateMenuItem(id, itemEdit.id, saveData);
      toast.success('Item updated!');
      setItemEdit(null);
      const data = await getAllMenuItems(id);
      setItems(data);
    } catch (e) { toast.error('Failed: ' + e.message); }
    finally { setItemSaving(false); }
  };

  const handleImageUpload = async (item, file) => {
    if (!file) return;
    if (fileSizeMB(file) > 5) { toast.error('Image must be under 5MB'); return; }
    setImgUpload(u => ({ ...u, [item.id]: { uploading:true, progress:0 } }));
    try {
      const path = buildImagePath(id, file.name);
      const url  = await uploadFile(file, path, (pct) =>
        setImgUpload(u => ({ ...u, [item.id]: { uploading:true, progress:pct } }))
      );
      await updateMenuItem(id, item.id, { imageURL: url });
      setItems(prev => prev.map(i => i.id === item.id ? { ...i, imageURL: url } : i));
      if (itemEdit?.id === item.id) setItemData(d => ({ ...d, imageURL: url }));
      toast.success('Cover image updated!');
    } catch (e) { toast.error('Upload failed: ' + e.message); }
    finally { setImgUpload(u => ({ ...u, [item.id]: { uploading:false, progress:0 } })); }
  };

  const handleARUpload = async (item, file) => {
    if (!file) return;
    if (!file.name.match(/\.(glb|gltf)$/i)) { toast.error('Only .glb or .gltf files'); return; }
    if (fileSizeMB(file) > 20) { toast.error('AR model must be under 20MB'); return; }
    setArUpload(u => ({ ...u, [item.id]: { uploading:true, progress:0 } }));
    try {
      const path = buildModelPath(id, file.name);
      const url  = await uploadFile(file, path, (pct) =>
        setArUpload(u => ({ ...u, [item.id]: { uploading:true, progress:pct } }))
      );
      await updateMenuItem(id, item.id, { modelURL: url });
      setItems(prev => prev.map(i => i.id === item.id ? { ...i, modelURL: url } : i));
      toast.success('AR model updated!');
    } catch (e) { toast.error('Upload failed: ' + e.message); }
    finally { setArUpload(u => ({ ...u, [item.id]: { uploading:false, progress:0 } })); }
  };

  const handleARDelete = async (item) => {
    if (!confirm('Remove AR model from this item?')) return;
    await updateMenuItem(id, item.id, { modelURL: null });
    setItems(prev => prev.map(i => i.id === item.id ? { ...i, modelURL: null } : i));
    toast.success('AR model removed');
  };

  const deleteItem = async (item) => {
    if (!confirm(`Delete "${item.name}"?`)) return;
    await deleteMenuItem(id, item.id);
    toast.success('Deleted');
    setItems(prev => prev.filter(i => i.id !== item.id));
  };

  const toggleItemActive = async (item) => {
    await updateMenuItem(id, item.id, { isActive: !item.isActive });
    setItems(prev => prev.map(i => i.id === item.id ? { ...i, isActive: !i.isActive } : i));
  };

  // Chart data
  const chartData    = analytics.map(d => ({ date: d.date?.slice(5)||'', visits: d.totalVisits||0, unique: d.uniqueVisitors||0 }));
  const totalVisits  = analytics.reduce((s,d) => s+(d.totalVisits||0), 0);
  const uniqueVisits = analytics.reduce((s,d) => s+(d.uniqueVisitors||0), 0);
  const topItems     = [...items].sort((a,b) => ((b.views||0)+(b.arViews||0)*2) - ((a.views||0)+(a.arViews||0)*2)).slice(0,5);

  // Plan & expiry
  const subEnd       = restaurant?.subscriptionEnd;
  const daysLeft     = subEnd ? Math.max(0, Math.ceil((new Date(subEnd) - new Date()) / 86400000)) : null;
  const isExpired    = subEnd && new Date(subEnd) < new Date();
  const planInfo     = PLANS.find(p => p.id === restaurant?.plan) || PLANS[0];

  const TABS = [
    { id:'overview',  label:'Overview',   icon:'▦' },
    { id:'menu',      label:'Menu Items', icon:'🍽' },
    { id:'analytics', label:'Analytics',  icon:'◎' },
    { id:'requests',  label:'Requests',   icon:'◈' },
  ];

  if (loading) return (
    <SuperAdminLayout>
      <div style={{ display:'flex', justifyContent:'center', paddingTop:100 }}>
        <div style={{ width:36, height:36, border:'3px solid #E05A3A', borderTopColor:'transparent', borderRadius:'50%', animation:'spin 0.8s linear infinite' }} />
        <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      </div>
    </SuperAdminLayout>
  );

  if (!restaurant) return (
    <SuperAdminLayout>
      <div style={{ textAlign:'center', padding:'80px 32px', color:'rgba(42,31,16,0.5)' }}>
        <div style={{ fontSize:40, marginBottom:12 }}>🏪</div>
        <p>Restaurant not found.</p>
        <Link href="/superadmin/restaurants" style={{ color:'#E05A3A', fontWeight:600, textDecoration:'none' }}>← Back to restaurants</Link>
      </div>
    </SuperAdminLayout>
  );

  return (
    <SuperAdminLayout>
      <Head><title>{restaurant.name} — Super Admin</title></Head>
      <div style={{ background:'#F2F0EC', minHeight:'100vh', fontFamily:'Inter,sans-serif' }}>
        <style>{`
          @keyframes spin{to{transform:rotate(360deg)}}
          .inp:focus{border-color:rgba(224,90,58,0.5)!important}
          .inp::placeholder{color:rgba(42,31,16,0.3)}
          .tab-btn{padding:10px 20px;border:none;background:transparent;cursor:pointer;font-size:13px;font-weight:600;font-family:Inter,sans-serif;color:rgba(42,31,16,0.5);border-bottom:2.5px solid transparent;transition:all 0.15s;display:flex;align-items:center;gap:6px;white-space:nowrap;}
          .tab-btn.on{color:#E05A3A;border-bottom-color:#E05A3A;}
          .tab-btn:hover{color:#1E1B18;}
          .row:hover{background:#F7F5F2!important}
        `}</style>

        {/* ── Page header ── */}
        <div style={{ background:'#fff', borderBottom:'1px solid rgba(42,31,16,0.07)', padding:'20px 32px' }}>
          <div style={{ maxWidth:1060, margin:'0 auto' }}>
            <Link href="/superadmin/restaurants" style={{ fontSize:12, color:'rgba(42,31,16,0.4)', textDecoration:'none', fontWeight:600, display:'inline-flex', alignItems:'center', gap:4, marginBottom:12 }}>
              ← Restaurants
            </Link>
            <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', flexWrap:'wrap', gap:12 }}>
              <div style={{ display:'flex', alignItems:'center', gap:16 }}>
                <div style={{ width:52, height:52, borderRadius:16, background:'linear-gradient(135deg,#E05A3A,#F07050)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:22, boxShadow:'0 6px 20px rgba(224,90,58,0.3)', flexShrink:0 }}>🏪</div>
                <div>
                  <h1 style={{ fontFamily:'Poppins,sans-serif', fontWeight:800, fontSize:22, color:'#1E1B18', margin:0 }}>{restaurant.name}</h1>
                  <div style={{ display:'flex', alignItems:'center', gap:10, marginTop:4, flexWrap:'wrap' }}>
                    <span style={{ fontSize:12, color:'rgba(42,31,16,0.45)', fontFamily:'monospace' }}>{restaurant.subdomain}.advertradical.com</span>
                    <span style={{ padding:'3px 10px', borderRadius:20, fontSize:11, fontWeight:700, background: restaurant.isActive?'rgba(143,196,168,0.2)':'rgba(244,160,176,0.2)', color: restaurant.isActive?'#1A5A38':'#8B1A2A', border:`1px solid ${restaurant.isActive?'rgba(143,196,168,0.4)':'rgba(244,160,176,0.4)'}` }}>
                      {restaurant.isActive ? '● Active' : '● Inactive'}
                    </span>
                    <span style={{ padding:'3px 10px', borderRadius:20, fontSize:11, fontWeight:700, background:'rgba(42,31,16,0.06)', color:'rgba(42,31,16,0.5)', textTransform:'capitalize' }}>
                      {restaurant.plan || 'basic'} plan
                    </span>
                    {daysLeft !== null && (
                      <span style={{ padding:'3px 10px', borderRadius:20, fontSize:11, fontWeight:700, background: isExpired?'rgba(244,160,176,0.2)':daysLeft<=14?'rgba(224,90,58,0.1)':'rgba(143,196,168,0.15)', color: isExpired?'#8B1A2A':daysLeft<=14?'#C04A28':'#1A5A38' }}>
                        {isExpired ? '⚠️ Expired' : `${daysLeft}d left`}
                      </span>
                    )}
                  </div>
                </div>
              </div>
              <div style={{ display:'flex', gap:10 }}>
                <a href={getMenuURL(restaurant.subdomain)} target="_blank" rel="noreferrer" style={{ padding:'9px 18px', borderRadius:12, border:'1.5px solid rgba(42,31,16,0.12)', background:'transparent', fontSize:13, fontWeight:600, color:'rgba(42,31,16,0.6)', textDecoration:'none', display:'flex', alignItems:'center', gap:6 }}>
                  View Menu ↗
                </a>
                {!editing && (
                  <button onClick={startEdit} style={{ padding:'9px 18px', borderRadius:12, border:'none', background:'#1E1B18', color:'#FFF5E8', fontSize:13, fontWeight:700, fontFamily:'Poppins,sans-serif', cursor:'pointer' }}>
                    Edit Restaurant
                  </button>
                )}
              </div>
            </div>

            {/* Tabs */}
            <div style={{ display:'flex', gap:0, marginTop:20, borderBottom:'1px solid rgba(42,31,16,0.08)', overflowX:'auto' }}>
              {TABS.map(t => (
                <button key={t.id} className={`tab-btn${tab===t.id?' on':''}`} onClick={()=>{ setTab(t.id); setEditing(false); }}>
                  <span>{t.icon}</span>{t.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div style={{ maxWidth:1060, margin:'0 auto', padding:'28px 32px' }}>

          {/* ═══════════════ OVERVIEW TAB ═══════════════ */}
          {tab === 'overview' && (<>
            {/* Quick stats row */}
            <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:14, marginBottom:24 }}>
              {[
                { label:'AR Items Used', value:`${restaurant.itemsUsed||0} / ${restaurant.maxItems||planInfo.maxItems}`, color:'#E05A3A', bg:'rgba(224,90,58,0.07)' },
                { label:'Storage Used',  value:`${parseFloat(restaurant.storageUsedMB||0).toFixed(2)} / ${restaurant.maxStorageMB||planInfo.maxStorageMB} MB`, color:'#5A9A78', bg:'rgba(143,196,168,0.12)' },
                { label:'Payment',       value: restaurant.paymentStatus||'inactive', color: restaurant.paymentStatus==='active'?'#1A5A38':'#8B1A2A', bg: restaurant.paymentStatus==='active'?'rgba(143,196,168,0.12)':'rgba(244,160,176,0.12)', cap:true },
                { label:'Expires',       value: subEnd ? (isExpired ? 'Expired' : subEnd) : 'No subscription', color: isExpired?'#8B1A2A':'rgba(42,31,16,0.7)', bg:'rgba(42,31,16,0.04)' },
              ].map(s => (
                <div key={s.label} style={{ ...S.card, padding:20, background:s.bg }}>
                  <div style={{ fontSize:11, color:'rgba(42,31,16,0.45)', fontWeight:600, textTransform:'uppercase', letterSpacing:'0.05em', marginBottom:8 }}>{s.label}</div>
                  <div style={{ fontFamily:'Poppins,sans-serif', fontWeight:800, fontSize:16, color:s.color, textTransform: s.cap?'capitalize':'none' }}>{s.value}</div>
                </div>
              ))}
            </div>

            {editing ? (
              /* ── Edit form ── */
              <div style={{ ...S.card, padding:28 }}>
                <div style={{ fontFamily:'Poppins,sans-serif', fontWeight:700, fontSize:15, color:'#1E1B18', marginBottom:22 }}>Edit Restaurant Details</div>

                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16, marginBottom:16 }}>
                  <div>
                    <label style={S.label}>Restaurant Name</label>
                    <input className="inp" style={S.input} value={editData.name} onChange={e=>setEditData(d=>({...d,name:e.target.value}))} />
                  </div>
                  <div>
                    <label style={S.label}>Subdomain</label>
                    <div style={{ position:'relative' }}>
                      <input className="inp" style={{ ...S.input, paddingRight:140 }} value={editData.subdomain} onChange={e=>setEditData(d=>({...d,subdomain:e.target.value.toLowerCase()}))} />
                      <span style={{ position:'absolute', right:12, top:'50%', transform:'translateY(-50%)', fontSize:11, color:'rgba(42,31,16,0.4)', pointerEvents:'none' }}>.advertradical.com</span>
                    </div>
                  </div>
                </div>

                {/* Plan picker */}
                <div style={{ marginBottom:16 }}>
                  <label style={S.label}>Plan</label>
                  <div style={{ display:'flex', gap:10 }}>
                    {PLANS.map(p => (
                      <div key={p.id} onClick={()=>handlePlanChange(p.id)} style={{ flex:1, padding:'14px', borderRadius:14, border:`2px solid ${editData.plan===p.id?'rgba(224,90,58,0.5)':'rgba(42,31,16,0.09)'}`, background: editData.plan===p.id?'rgba(224,90,58,0.05)':'#F7F5F2', cursor:'pointer', textAlign:'center', transition:'all 0.15s' }}>
                        <div style={{ fontFamily:'Poppins,sans-serif', fontWeight:700, fontSize:14, color: editData.plan===p.id?'#E05A3A':'#1E1B18', marginBottom:4 }}>{p.label}</div>
                        <div style={{ fontSize:11, color:'rgba(42,31,16,0.45)' }}>{p.maxItems} items · {p.maxStorageMB>=1024?p.maxStorageMB/1024+'GB':p.maxStorageMB+'MB'}</div>
                      </div>
                    ))}
                  </div>
                </div>

                <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:14, marginBottom:16 }}>
                  <div>
                    <label style={S.label}>Max Items (override)</label>
                    <input className="inp" style={S.input} type="number" min="0" value={editData.maxItems} onChange={e=>setEditData(d=>({...d,maxItems:e.target.value}))} />
                  </div>
                  <div>
                    <label style={S.label}>Max Storage MB</label>
                    <input className="inp" style={S.input} type="number" min="0" value={editData.maxStorageMB} onChange={e=>setEditData(d=>({...d,maxStorageMB:e.target.value}))} />
                  </div>
                  <div>
                    <label style={S.label}>Items Used</label>
                    <input className="inp" style={S.input} type="number" min="0" value={editData.itemsUsed} onChange={e=>setEditData(d=>({...d,itemsUsed:e.target.value}))} />
                  </div>
                  <div>
                    <label style={S.label}>Storage Used MB</label>
                    <input className="inp" style={S.input} type="number" min="0" value={editData.storageUsedMB} onChange={e=>setEditData(d=>({...d,storageUsedMB:e.target.value}))} />
                  </div>
                </div>

                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16, marginBottom:16 }}>
                  <div>
                    <label style={S.label}>Subscription Start</label>
                    <input className="inp" style={S.input} type="date" value={editData.subscriptionStart} onChange={e=>setEditData(d=>({...d,subscriptionStart:e.target.value}))} />
                  </div>
                  <div>
                    <label style={S.label}>Subscription End</label>
                    <input className="inp" style={S.input} type="date" value={editData.subscriptionEnd} onChange={e=>setEditData(d=>({...d,subscriptionEnd:e.target.value}))} />
                  </div>
                </div>

                {/* Toggles */}
                <div style={{ display:'flex', gap:14, marginBottom:22, flexWrap:'wrap' }}>
                  {[
                    ['isActive','Active', 'Restaurant visible to customers'],
                    ['paymentStatus','Payment Active', 'Set payment status to active'],
                  ].map(([key, title, desc]) => {
                    const isOn = key === 'paymentStatus' ? editData.paymentStatus === 'active' : editData[key];
                    const toggle = () => setEditData(d => ({ ...d, [key]: key === 'paymentStatus' ? (d.paymentStatus === 'active' ? 'inactive' : 'active') : !d[key] }));
                    return (
                      <div key={key} onClick={toggle} style={{ display:'flex', alignItems:'center', gap:10, padding:'12px 16px', borderRadius:12, border:`1.5px solid ${isOn?'rgba(143,196,168,0.5)':'rgba(42,31,16,0.09)'}`, background: isOn?'rgba(143,196,168,0.08)':'#F7F5F2', cursor:'pointer', transition:'all 0.15s' }}>
                        <div style={{ width:36, height:20, borderRadius:99, background:isOn?'#8FC4A8':'rgba(42,31,16,0.15)', position:'relative', transition:'background 0.2s', flexShrink:0 }}>
                          <div style={{ width:14, height:14, borderRadius:'50%', background:'#fff', position:'absolute', top:3, left:isOn?19:3, transition:'left 0.2s', boxShadow:'0 1px 3px rgba(0,0,0,0.2)' }} />
                        </div>
                        <div>
                          <div style={{ fontSize:13, fontWeight:700, color:'#1E1B18' }}>{title}</div>
                          <div style={{ fontSize:11, color:'rgba(42,31,16,0.4)' }}>{desc}</div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div style={{ display:'flex', gap:10 }}>
                  <button onClick={saveEdit} disabled={saving} style={{ padding:'12px 28px', borderRadius:12, border:'none', background:'#1E1B18', color:'#FFF5E8', fontSize:14, fontWeight:700, fontFamily:'Poppins,sans-serif', cursor:'pointer', opacity:saving?0.6:1 }}>
                    {saving ? 'Saving…' : 'Save Changes'}
                  </button>
                  <button onClick={()=>setEditing(false)} style={{ padding:'12px 20px', borderRadius:12, border:'1.5px solid rgba(42,31,16,0.12)', background:'transparent', fontSize:13, fontWeight:600, color:'rgba(42,31,16,0.55)', cursor:'pointer' }}>
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              /* ── Info cards ── */
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16 }}>
                <div style={{ ...S.card, padding:24 }}>
                  <div style={{ fontFamily:'Poppins,sans-serif', fontWeight:700, fontSize:14, color:'#1E1B18', marginBottom:16 }}>Restaurant Info</div>
                  {[
                    ['Name',      restaurant.name],
                    ['Subdomain', restaurant.subdomain + '.advertradical.com'],
                    ['Plan',      restaurant.plan || 'basic'],
                    ['Status',    restaurant.isActive ? 'Active' : 'Inactive'],
                    ['Payment',   restaurant.paymentStatus || 'inactive'],
                  ].map(([k,v]) => (
                    <div key={k} style={{ display:'flex', justifyContent:'space-between', padding:'8px 0', borderBottom:'1px solid rgba(42,31,16,0.05)' }}>
                      <span style={{ fontSize:12, color:'rgba(42,31,16,0.5)' }}>{k}</span>
                      <span style={{ fontSize:12, fontWeight:600, color:'#1E1B18', textTransform:'capitalize' }}>{v}</span>
                    </div>
                  ))}
                </div>
                <div style={{ ...S.card, padding:24 }}>
                  <div style={{ fontFamily:'Poppins,sans-serif', fontWeight:700, fontSize:14, color:'#1E1B18', marginBottom:16 }}>Usage & Subscription</div>
                  {[
                    ['Items Used',    `${restaurant.itemsUsed||0} / ${restaurant.maxItems||planInfo.maxItems}`],
                    ['Storage',       `${parseFloat(restaurant.storageUsedMB||0).toFixed(2)} / ${restaurant.maxStorageMB||planInfo.maxStorageMB} MB`],
                    ['Sub Start',     restaurant.subscriptionStart || '—'],
                    ['Sub End',       restaurant.subscriptionEnd || '—'],
                    ['Days Left',     daysLeft !== null ? (isExpired ? 'Expired' : `${daysLeft} days`) : '—'],
                  ].map(([k,v]) => (
                    <div key={k} style={{ display:'flex', justifyContent:'space-between', padding:'8px 0', borderBottom:'1px solid rgba(42,31,16,0.05)' }}>
                      <span style={{ fontSize:12, color:'rgba(42,31,16,0.5)' }}>{k}</span>
                      <span style={{ fontSize:12, fontWeight:600, color: k==='Days Left'&&isExpired?'#C04A28':'#1E1B18' }}>{v}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>)}

          {/* ═══════════════ MENU ITEMS TAB ═══════════════ */}
          {tab === 'menu' && (<>
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:20 }}>
              <div>
                <div style={{ fontFamily:'Poppins,sans-serif', fontWeight:700, fontSize:16, color:'#1E1B18' }}>Menu Items</div>
                <div style={{ fontSize:13, color:'rgba(42,31,16,0.45)', marginTop:3 }}>{items.filter(i=>i.isActive).length} active · {items.length} total</div>
              </div>
            </div>

            {!itemsLoaded ? (
              <div style={{ display:'flex', justifyContent:'center', paddingTop:40 }}>
                <div style={{ width:32, height:32, border:'3px solid #E05A3A', borderTopColor:'transparent', borderRadius:'50%', animation:'spin 0.8s linear infinite' }} />
              </div>
            ) : items.length === 0 ? (
              <div style={{ textAlign:'center', padding:'60px 0', color:'rgba(42,31,16,0.4)' }}>
                <div style={{ fontSize:40, marginBottom:12 }}>🍽️</div>
                <p>No menu items for this restaurant yet.</p>
              </div>
            ) : (
              <div style={{ ...S.card, overflow:'hidden' }}>
                {/* Header */}
                <div style={{ display:'grid', gridTemplateColumns:'56px 1fr 100px 80px 100px 80px 120px', padding:'10px 18px', borderBottom:'1px solid rgba(42,31,16,0.06)', background:'#FAFAF8' }}>
                  {['','Item','Category','Prep','Spice','Status','Actions'].map(h => (
                    <div key={h} style={{ fontSize:10, fontWeight:700, color:'rgba(42,31,16,0.4)', letterSpacing:'0.06em', textTransform:'uppercase' }}>{h}</div>
                  ))}
                </div>

                {items.map(item => {
                  const isItemEdit = itemEdit?.id === item.id;
                  return (
                    <div key={item.id}>
                      <div className="row" style={{ display:'grid', gridTemplateColumns:'56px 1fr 100px 80px 100px 80px 120px', padding:'12px 18px', borderBottom:'1px solid rgba(42,31,16,0.05)', alignItems:'center', background:'#fff', opacity:item.isActive?1:0.5, transition:'background 0.12s' }}>
                        <div style={{ width:44, height:44, borderRadius:12, overflow:'hidden', background:'#F2F0EC' }}>
                          {item.imageURL ? <img src={item.imageURL} alt={item.name} style={{ width:'100%', height:'100%', objectFit:'cover' }}/> : <div style={{ width:'100%', height:'100%', display:'flex', alignItems:'center', justifyContent:'center', fontSize:18 }}>🍽️</div>}
                        </div>
                        <div style={{ minWidth:0, paddingRight:8 }}>
                          <div style={{ display:'flex', alignItems:'center', gap:6, flexWrap:'wrap' }}>
                            <span style={{ fontWeight:600, fontSize:13, color:'#1E1B18' }}>{item.name}</span>
                            {item.isPopular && <span style={{ fontSize:9, fontWeight:800, color:'#E05A3A', background:'rgba(224,90,58,0.1)', borderRadius:20, padding:'2px 6px' }}>✦ Popular</span>}
                            {item.isFeatured && <span style={{ fontSize:9, fontWeight:800, color:'#8A70B0', background:'rgba(138,112,176,0.1)', borderRadius:20, padding:'2px 6px' }}>⭐ Featured</span>}
                            {item.offerBadge && item.offerLabel && <span style={{ fontSize:9, fontWeight:800, color:'#fff', background:item.offerColor||'#E05A3A', borderRadius:20, padding:'2px 6px' }}>🏷 {item.offerLabel}</span>}
                          </div>
                          {item.price && <div style={{ fontSize:11, color:'#C04A28', fontWeight:700, marginTop:2 }}>₹{item.price}</div>}
                          <div style={{ fontSize:11, color:'rgba(42,31,16,0.35)', marginTop:2 }}>👁 {(item.views||0)+(item.arViews||0)} · AR {item.arViews||0}</div>
                        </div>
                        <div style={{ fontSize:12, color:'rgba(42,31,16,0.55)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{item.category||'—'}</div>
                        <div style={{ fontSize:11, color:'rgba(42,31,16,0.5)' }}>{item.prepTime||'—'}</div>
                        <div style={{ fontSize:11, color:'rgba(42,31,16,0.5)' }}>{item.spiceLevel && item.spiceLevel!=='None' ? item.spiceLevel : '—'}</div>
                        {/* Active toggle */}
                        <div style={{ display:'flex', alignItems:'center', gap:5 }}>
                          <div onClick={()=>toggleItemActive(item)} style={{ width:32, height:18, borderRadius:99, background:item.isActive?'#8FC4A8':'rgba(42,31,16,0.15)', cursor:'pointer', position:'relative', transition:'background 0.2s' }}>
                            <div style={{ width:12, height:12, borderRadius:'50%', background:'#fff', position:'absolute', top:3, left:item.isActive?17:3, transition:'left 0.2s', boxShadow:'0 1px 3px rgba(0,0,0,0.2)' }} />
                          </div>
                        </div>
                        {/* Actions */}
                        <div style={{ display:'flex', gap:5 }}>
                          <button onClick={()=>{ if(isItemEdit){setItemEdit(null)}else{setItemEdit(item);setItemData({ name:item.name, description:item.description||'', category:item.category||'', price:item.price||'', prepTime:item.prepTime||'', spiceLevel:item.spiceLevel||'None', offerBadge:item.offerBadge||false, offerLabel:item.offerLabel||'', offerColor:item.offerColor||'#E05A3A', isPopular:item.isPopular||false, isFeatured:item.isFeatured||false, isActive:item.isActive!==false, isVeg:item.isVeg!==undefined?item.isVeg:'', ingredients:(item.ingredients||[]).join(', '), calories:item.nutritionalData?.calories||'', protein:item.nutritionalData?.protein||'', carbs:item.nutritionalData?.carbs||'', fats:item.nutritionalData?.fats||'', pairsWith:item.pairsWith||[] })} }} style={{ padding:'6px 10px', borderRadius:8, border:'1.5px solid rgba(42,31,16,0.12)', background: isItemEdit?'rgba(224,90,58,0.08)':'transparent', color: isItemEdit?'#C04A28':'rgba(42,31,16,0.55)', fontSize:11, fontWeight:600, cursor:'pointer' }}>
                            {isItemEdit ? 'Cancel' : 'Edit'}
                          </button>
                          <button onClick={()=>deleteItem(item)} style={{ padding:'6px 8px', borderRadius:8, border:'1.5px solid rgba(244,160,176,0.4)', background:'rgba(244,160,176,0.08)', color:'#8B1A2A', fontSize:11, fontWeight:600, cursor:'pointer' }}>✕</button>
                        </div>
                      </div>

                      {/* Inline edit panel */}
                      {isItemEdit && (
                        <div style={{ background:'#F7F5F2', borderBottom:'1px solid rgba(42,31,16,0.06)', padding:'18px 18px 22px' }}>
                          
                          {/* Image + AR media row */}
                          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14, marginBottom:18 }}>
                            
                            {/* Cover Image */}
                            <div style={{ background:'#fff', borderRadius:14, padding:16, border:'1px solid rgba(42,31,16,0.07)' }}>
                              <label style={{ ...S.label, marginBottom:10 }}>📸 Cover Image</label>
                              <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:12 }}>
                                <div style={{ width:60, height:60, borderRadius:12, overflow:'hidden', background:'#F2F0EC', flexShrink:0 }}>
                                  {item.imageURL
                                    ? <img src={item.imageURL} alt={item.name} style={{ width:'100%', height:'100%', objectFit:'cover' }}/>
                                    : <div style={{ width:'100%', height:'100%', display:'flex', alignItems:'center', justifyContent:'center', fontSize:24 }}>🍽️</div>}
                                </div>
                                <div style={{ flex:1 }}>
                                  <div style={{ fontSize:11, color:'rgba(42,31,16,0.45)', marginBottom:6 }}>JPG, PNG · Max 5MB</div>
                                  <input
                                    type="file" accept="image/*" style={{ display:'none' }}
                                    ref={el => { if(el) imgInputRef.current[item.id]=el; }}
                                    onChange={e => handleImageUpload(item, e.target.files[0])}
                                  />
                                  <button
                                    onClick={() => imgInputRef.current[item.id]?.click()}
                                    disabled={imgUpload[item.id]?.uploading}
                                    style={{ padding:'8px 14px', borderRadius:10, border:'1.5px solid rgba(42,31,16,0.12)', background:'transparent', fontSize:12, fontWeight:600, color:'rgba(42,31,16,0.6)', cursor:'pointer', opacity: imgUpload[item.id]?.uploading?0.6:1 }}>
                                    {imgUpload[item.id]?.uploading ? `Uploading ${imgUpload[item.id].progress}%…` : '↑ Upload New Image'}
                                  </button>
                                </div>
                              </div>
                              {imgUpload[item.id]?.uploading && (
                                <div style={{ height:4, background:'rgba(42,31,16,0.07)', borderRadius:99, overflow:'hidden' }}>
                                  <div style={{ height:'100%', background:'#E05A3A', borderRadius:99, width:`${imgUpload[item.id].progress}%`, transition:'width 0.2s' }}/>
                                </div>
                              )}
                            </div>

                            {/* AR Model */}
                            <div style={{ background:'#fff', borderRadius:14, padding:16, border:'1px solid rgba(42,31,16,0.07)' }}>
                              <label style={{ ...S.label, marginBottom:10 }}>🥽 AR Model (.glb / .gltf)</label>
                              <div style={{ marginBottom:10 }}>
                                {item.modelURL ? (
                                  <div style={{ display:'flex', alignItems:'center', gap:8, padding:'8px 12px', borderRadius:10, background:'rgba(143,196,168,0.12)', border:'1px solid rgba(143,196,168,0.3)', marginBottom:10 }}>
                                    <span style={{ fontSize:18 }}>✅</span>
                                    <span style={{ fontSize:12, fontWeight:600, color:'#1A5A38', flex:1 }}>AR model active</span>
                                    <button onClick={() => handleARDelete(item)} style={{ padding:'3px 10px', borderRadius:8, border:'1px solid rgba(192,48,32,0.3)', background:'rgba(244,160,176,0.1)', color:'#8B1A2A', fontSize:11, fontWeight:600, cursor:'pointer' }}>Remove</button>
                                  </div>
                                ) : (
                                  <div style={{ padding:'8px 12px', borderRadius:10, background:'rgba(244,208,112,0.15)', border:'1px solid rgba(244,208,112,0.4)', fontSize:12, color:'#8B6020', marginBottom:10 }}>
                                    ⚠️ No AR model — item shows without AR
                                  </div>
                                )}
                                <div style={{ fontSize:11, color:'rgba(42,31,16,0.45)', marginBottom:8 }}>.glb or .gltf · Max 20MB</div>
                                <input
                                  type="file" accept=".glb,.gltf" style={{ display:'none' }}
                                  ref={el => { if(el) arInputRef.current[item.id]=el; }}
                                  onChange={e => handleARUpload(item, e.target.files[0])}
                                />
                                <button
                                  onClick={() => arInputRef.current[item.id]?.click()}
                                  disabled={arUpload[item.id]?.uploading}
                                  style={{ padding:'8px 14px', borderRadius:10, border:'1.5px solid rgba(42,31,16,0.12)', background:'transparent', fontSize:12, fontWeight:600, color:'rgba(42,31,16,0.6)', cursor:'pointer', opacity:arUpload[item.id]?.uploading?0.6:1 }}>
                                  {arUpload[item.id]?.uploading ? `Uploading ${arUpload[item.id].progress}%…` : item.modelURL ? '↑ Replace AR Model' : '↑ Upload AR Model'}
                                </button>
                              </div>
                              {arUpload[item.id]?.uploading && (
                                <div style={{ height:4, background:'rgba(42,31,16,0.07)', borderRadius:99, overflow:'hidden' }}>
                                  <div style={{ height:'100%', background:'#8FC4A8', borderRadius:99, width:`${arUpload[item.id].progress}%`, transition:'width 0.2s' }}/>
                                </div>
                              )}
                            </div>
                          </div>

                          {/* Fields grid */}
                          <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:12, marginBottom:12 }}>
                            {[['name','Name'],['category','Category'],['price','Price (₹)'],['prepTime','Prep Time'],['spiceLevel','Spice Level','select']].map(([k,lbl,type])=>(
                              <div key={k}>
                                <label style={S.label}>{lbl}</label>
                                {type === 'select' ? (
                                  <select className="inp" style={S.input} value={itemData[k]} onChange={e=>setItemData(d=>({...d,[k]:e.target.value}))}>
                                    {SPICE_LEVELS.map(s=><option key={s} value={s}>{s}</option>)}
                                  </select>
                                ) : (
                                  <input className="inp" style={S.input} value={itemData[k]} onChange={e=>setItemData(d=>({...d,[k]:e.target.value}))} placeholder={lbl} />
                                )}
                              </div>
                            ))}
                          </div>
                          <div style={{ marginBottom:14 }}>
                            <label style={S.label}>Description</label>
                            <textarea className="inp" style={{ ...S.input, resize:'none' }} rows={2} value={itemData.description} onChange={e=>setItemData(d=>({...d,description:e.target.value}))} />
                          </div>

                          {/* Veg / Non-Veg */}
                          <div style={{ marginBottom:14 }}>
                            <label style={S.label}>Veg / Non-Veg</label>
                            <div style={{ display:'flex', gap:8 }}>
                              {[{val:true,label:'🟢 Veg',bg:'#2D8B4E'},{val:false,label:'🔴 Non-Veg',bg:'#C0392B'}].map(({val,label,bg})=>(
                                <button key={String(val)} onClick={()=>setItemData(d=>({...d,isVeg:val}))}
                                  style={{ flex:1, padding:'8px', borderRadius:10, border:`2px solid ${itemData.isVeg===val?bg:'rgba(42,31,16,0.12)'}`, background:itemData.isVeg===val?bg+'18':'#fff', fontSize:12, fontWeight:700, color:itemData.isVeg===val?bg:'rgba(42,31,16,0.45)', cursor:'pointer', transition:'all 0.15s' }}>
                                  {label}
                                </button>
                              ))}
                            </div>
                          </div>

                          {/* Ingredients */}
                          <div style={{ marginBottom:14 }}>
                            <label style={S.label}>Ingredients (comma-separated)</label>
                            <input className="inp" style={S.input} value={itemData.ingredients} onChange={e=>setItemData(d=>({...d,ingredients:e.target.value}))} placeholder="Chicken, Butter, Cream…" />
                          </div>

                          {/* Nutrition */}
                          <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:10, marginBottom:14 }}>
                            {[['calories','Calories'],['protein','Protein (g)'],['carbs','Carbs (g)'],['fats','Fats (g)']].map(([k,lbl])=>(
                              <div key={k}>
                                <label style={S.label}>{lbl}</label>
                                <input className="inp" style={S.input} type="number" min="0" value={itemData[k]} onChange={e=>setItemData(d=>({...d,[k]:e.target.value}))} placeholder="0" />
                              </div>
                            ))}
                          </div>

                          {/* Pairs Well With */}
                          <div style={{ marginBottom:14, padding:'12px', background:'rgba(247,155,61,0.05)', borderRadius:12, border:'1px solid rgba(247,155,61,0.2)' }}>
                            <label style={{ ...S.label, marginBottom:8 }}>✨ Pairs Well With (up to 3)</label>
                            <div style={{ display:'flex', flexWrap:'wrap', gap:6 }}>
                              {items.filter(i => i.id !== itemEdit?.id).slice(0,30).map(i => {
                                const sel = (itemData.pairsWith||[]).includes(i.id);
                                const maxed = (itemData.pairsWith||[]).length >= 3 && !sel;
                                return (
                                  <button key={i.id}
                                    onClick={()=>{
                                      if (maxed) return;
                                      setItemData(d=>({ ...d, pairsWith: sel ? (d.pairsWith||[]).filter(x=>x!==i.id) : [...(d.pairsWith||[]),i.id] }));
                                    }}
                                    style={{ padding:'4px 10px', borderRadius:20, fontSize:11, fontWeight:600, cursor:maxed?'not-allowed':'pointer', border:`1.5px solid ${sel?'rgba(247,155,61,0.6)':'rgba(42,31,16,0.1)'}`, background:sel?'rgba(247,155,61,0.1)':'#F7F5F2', color:sel?'#A06010':'rgba(42,31,16,0.5)', opacity:maxed?0.4:1, transition:'all 0.15s' }}>
                                    {sel?'✓ ':''}{i.name}
                                  </button>
                                );
                              })}
                            </div>
                          </div>

                          {/* Flags */}
                          <div style={{ display:'flex', gap:10, marginBottom:14, flexWrap:'wrap' }}>
                            {[['isPopular','✦ Popular'],['isFeatured','⭐ Featured'],['isActive','👁 Visible']].map(([k,lbl])=>(
                              <div key={k} onClick={()=>setItemData(d=>({...d,[k]:!d[k]}))} style={{ display:'flex', alignItems:'center', gap:8, padding:'8px 14px', borderRadius:10, border:`1.5px solid ${itemData[k]?'rgba(224,90,58,0.3)':'rgba(42,31,16,0.09)'}`, background:itemData[k]?'rgba(224,90,58,0.05)':'#fff', cursor:'pointer', fontSize:12, fontWeight:600, color:itemData[k]?'#E05A3A':'rgba(42,31,16,0.55)', transition:'all 0.15s' }}>
                                <div style={{ width:28,height:16,borderRadius:99,background:itemData[k]?'#E05A3A':'rgba(42,31,16,0.15)',position:'relative',transition:'background 0.2s' }}>
                                  <div style={{ width:10,height:10,borderRadius:'50%',background:'#fff',position:'absolute',top:3,left:itemData[k]?15:3,transition:'left 0.2s',boxShadow:'0 1px 3px rgba(0,0,0,0.2)' }}/>
                                </div>
                                {lbl}
                              </div>
                            ))}
                          </div>
                          <div style={{ display:'flex', gap:10 }}>
                            <button onClick={saveItemEdit} disabled={itemSaving} style={{ padding:'10px 22px', borderRadius:11, border:'none', background:'#1E1B18', color:'#FFF5E8', fontSize:13, fontWeight:700, fontFamily:'Poppins,sans-serif', cursor:'pointer', opacity:itemSaving?0.6:1 }}>
                              {itemSaving?'Saving…':'Save'}
                            </button>
                            <button onClick={()=>setItemEdit(null)} style={{ padding:'10px 16px', borderRadius:11, border:'1.5px solid rgba(42,31,16,0.12)', background:'transparent', fontSize:12, fontWeight:600, color:'rgba(42,31,16,0.5)', cursor:'pointer' }}>Cancel</button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </>)}

          {/* ═══════════════ ANALYTICS TAB ═══════════════ */}
          {tab === 'analytics' && (<>
            {!analLoaded ? (
              <div style={{ display:'flex', justifyContent:'center', paddingTop:40 }}>
                <div style={{ width:32, height:32, border:'3px solid #E05A3A', borderTopColor:'transparent', borderRadius:'50%', animation:'spin 0.8s linear infinite' }} />
              </div>
            ) : (<>
              <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:14, marginBottom:20 }}>
                {[
                  { label:'Total Visits (30d)',   value:totalVisits,  color:'#E05A3A', bg:'rgba(224,90,58,0.07)'  },
                  { label:'Unique Visitors (30d)', value:uniqueVisits, color:'#5A9A78', bg:'rgba(143,196,168,0.12)' },
                  { label:'AR Items',              value:items.filter(i=>i.modelURL).length, color:'#8A70B0', bg:'rgba(196,181,212,0.15)' },
                ].map(s => (
                  <div key={s.label} style={{ ...S.card, padding:22, background:s.bg }}>
                    <div style={{ fontFamily:'Poppins,sans-serif', fontWeight:800, fontSize:28, color:s.color, marginBottom:4 }}>{s.value.toLocaleString()}</div>
                    <div style={{ fontSize:12, color:'rgba(42,31,16,0.5)' }}>{s.label}</div>
                  </div>
                ))}
              </div>

              {chartData.length > 0 ? (
                <div style={{ ...S.card, padding:28, marginBottom:20 }}>
                  <div style={{ fontFamily:'Poppins,sans-serif', fontWeight:700, fontSize:14, color:'#1E1B18', marginBottom:20 }}>Visits Over Time (Last 30 Days)</div>
                  <ResponsiveContainer width="100%" height={200}>
                    <AreaChart data={chartData}>
                      <defs>
                        <linearGradient id="ag" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%"  stopColor="#E05A3A" stopOpacity={0.15}/>
                          <stop offset="95%" stopColor="#E05A3A" stopOpacity={0}/>
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(42,31,16,0.05)"/>
                      <XAxis dataKey="date" tick={{ fill:'rgba(42,31,16,0.35)', fontSize:11 }} axisLine={false} tickLine={false}/>
                      <YAxis tick={{ fill:'rgba(42,31,16,0.35)', fontSize:11 }} axisLine={false} tickLine={false}/>
                      <Tooltip contentStyle={S.tip}/>
                      <Area type="monotone" dataKey="visits" stroke="#E05A3A" strokeWidth={2.5} fill="url(#ag)" name="Total Visits"/>
                      <Area type="monotone" dataKey="unique" stroke="#8FC4A8" strokeWidth={2} fill="transparent" name="Unique" strokeDasharray="5 3"/>
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <div style={{ ...S.card, padding:40, textAlign:'center', color:'rgba(42,31,16,0.4)', marginBottom:20 }}>
                  <div style={{ fontSize:36, marginBottom:10 }}>📊</div>
                  <p>No analytics data yet for this restaurant.</p>
                </div>
              )}

              {topItems.length > 0 && (
                <div style={{ ...S.card, padding:24 }}>
                  <div style={{ fontFamily:'Poppins,sans-serif', fontWeight:700, fontSize:14, color:'#1E1B18', marginBottom:16 }}>Top Items by Views</div>
                  {topItems.map((item,i) => {
                    const score = (item.views||0)+(item.arViews||0)*2;
                    const maxScore = Math.max(...topItems.map(x=>(x.views||0)+(x.arViews||0)*2), 1);
                    const pct = Math.max(8, Math.round((score/maxScore)*100));
                    return (
                      <div key={item.id} style={{ display:'flex', alignItems:'center', gap:12, marginBottom:10 }}>
                        <span style={{ fontSize:11, color:'rgba(42,31,16,0.3)', width:16, textAlign:'right', flexShrink:0 }}>#{i+1}</span>
                        <div style={{ width:30, height:30, borderRadius:10, overflow:'hidden', background:'#F2F0EC', flexShrink:0 }}>
                          {item.imageURL?<img src={item.imageURL} alt={item.name} style={{ width:'100%', height:'100%', objectFit:'cover' }}/>:<span style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'100%', fontSize:14 }}>🍽️</span>}
                        </div>
                        <div style={{ flex:1 }}>
                          <div style={{ display:'flex', justifyContent:'space-between', marginBottom:4 }}>
                            <span style={{ fontSize:13, fontWeight:500, color:'#1E1B18' }}>{item.name}</span>
                            <span style={{ fontSize:11, color:'rgba(42,31,16,0.4)' }}>{item.views||0} views · {item.arViews||0} AR</span>
                          </div>
                          <div style={{ height:5, background:'rgba(42,31,16,0.07)', borderRadius:99, overflow:'hidden' }}>
                            <div style={{ height:'100%', borderRadius:99, background:i===0?'#E05A3A':i===1?'#F4A060':'#8FC4A8', width:`${pct}%` }}/>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </>)}
          </>)}

          {/* ═══════════════ REQUESTS TAB ═══════════════ */}
          {tab === 'requests' && (<>
            <div style={{ display:'flex', gap:6, marginBottom:20 }}>
              {['all','pending','approved','rejected'].map(s => (
                <button key={s} onClick={()=>setReqFilter(s)} style={{ padding:'8px 16px', borderRadius:30, border:'none', fontSize:12, fontWeight:600, cursor:'pointer', fontFamily:'Inter,sans-serif', textTransform:'capitalize', background:reqFilter===s?'#1E1B18':'#fff', color:reqFilter===s?'#FFF5E8':'rgba(42,31,16,0.55)', boxShadow:reqFilter===s?'0 2px 8px rgba(30,27,24,0.18)':'0 1px 4px rgba(42,31,16,0.06)', transition:'all 0.15s' }}>
                  {s}
                </button>
              ))}
            </div>

            {!reqLoaded ? (
              <div style={{ display:'flex', justifyContent:'center', paddingTop:40 }}>
                <div style={{ width:32, height:32, border:'3px solid #E05A3A', borderTopColor:'transparent', borderRadius:'50%', animation:'spin 0.8s linear infinite' }} />
              </div>
            ) : requests.length === 0 ? (
              <div style={{ textAlign:'center', padding:'60px 0', color:'rgba(42,31,16,0.4)' }}>
                <div style={{ fontSize:36, marginBottom:10 }}>📭</div>
                <p>No {reqFilter === 'all' ? '' : reqFilter} requests.</p>
              </div>
            ) : (
              <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
                {requests.map(req => {
                  const badgeMap = { pending:['#F4D070','#8B6020'], approved:['#8FC4A8','#1A5A38'], rejected:['#F4A0B0','#8B1A2A'] };
                  const [bg, color] = badgeMap[req.status] || badgeMap.pending;
                  return (
                    <div key={req.id} style={{ ...S.card, padding:18, display:'flex', alignItems:'flex-start', gap:14 }}>
                      <div style={{ width:48, height:48, borderRadius:14, overflow:'hidden', background:'#F2F0EC', flexShrink:0 }}>
                        {req.imageURL?<img src={req.imageURL} alt={req.name} style={{ width:'100%', height:'100%', objectFit:'cover' }}/>:<div style={{ width:'100%', height:'100%', display:'flex', alignItems:'center', justifyContent:'center', fontSize:20 }}>🍽️</div>}
                      </div>
                      <div style={{ flex:1, minWidth:0 }}>
                        <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:4 }}>
                          <span style={{ fontWeight:600, fontSize:14, color:'#1E1B18' }}>{req.name}</span>
                          <span style={{ padding:'3px 10px', borderRadius:20, fontSize:11, fontWeight:700, background:bg+'33', color, border:`1px solid ${bg}66`, textTransform:'capitalize', flexShrink:0 }}>{req.status}</span>
                        </div>
                        {req.category && <div style={{ fontSize:12, color:'rgba(42,31,16,0.45)' }}>{req.category}</div>}
                        {req.description && <div style={{ fontSize:12, color:'rgba(42,31,16,0.5)', marginTop:4, lineHeight:1.5 }}>{req.description}</div>}
                        {req.prepTime && <div style={{ fontSize:11, color:'rgba(42,31,16,0.4)', marginTop:4 }}>⏱ {req.prepTime}</div>}
                        <div style={{ fontSize:11, color:'rgba(42,31,16,0.35)', marginTop:6 }}>
                          Submitted {req.createdAt?.seconds ? new Date(req.createdAt.seconds*1000).toLocaleDateString() : 'recently'}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </>)}

        </div>
      </div>
    </SuperAdminLayout>
  );
}

RestaurantDetail.getLayout = (page) => page;