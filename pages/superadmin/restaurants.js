import Head from 'next/head';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import SuperAdminLayout from '../../components/layout/SuperAdminLayout';
import { getAllRestaurants, createRestaurant, updateRestaurant } from '../../lib/db';
import { createUserWithEmailAndPassword } from 'firebase/auth';
import { auth } from '../../lib/firebase';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import toast from 'react-hot-toast';

const BLANK = { name:'', subdomain:'', email:'', password:'' };
const PLANS = { basic:{ label:'Basic', items:10, storage:500 }, pro:{ label:'Pro', items:40, storage:2048 }, premium:{ label:'Premium', items:100, storage:5120 } };

const S = {
  card:  { background:'#FFFFFF', border:'1px solid rgba(42,31,16,0.07)', borderRadius:20, boxShadow:'0 2px 14px rgba(42,31,16,0.06)' },
  h1:    { fontFamily:'Poppins,sans-serif', fontWeight:800, fontSize:22, color:'#1E1B18', margin:0 },
  sub:   { fontSize:13, color:'rgba(42,31,16,0.45)', marginTop:4 },
  label: { display:'block', fontSize:11, fontWeight:600, color:'rgba(42,31,16,0.5)', letterSpacing:'0.05em', textTransform:'uppercase', marginBottom:6 },
  input: { width:'100%', padding:'11px 14px', background:'#F7F5F2', border:'1.5px solid rgba(42,31,16,0.09)', borderRadius:12, fontSize:14, color:'#1E1B18', fontFamily:'Inter,sans-serif', outline:'none', boxSizing:'border-box' },
  btn:   { padding:'11px 22px', borderRadius:12, fontSize:14, fontWeight:600, fontFamily:'Poppins,sans-serif', border:'none', cursor:'pointer', transition:'all 0.18s' },
};

export default function SuperAdminRestaurants() {
  const [restaurants, setRestaurants] = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form,     setForm]     = useState(BLANK);
  const [saving,   setSaving]   = useState(false);
  const [search,   setSearch]   = useState('');
  const [editId,   setEditId]   = useState(null);
  const [editData, setEditData] = useState({});

  const load = () => { getAllRestaurants().then(r => { setRestaurants(r); setLoading(false); }); };
  useEffect(() => { load(); }, []);

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!form.name||!form.subdomain||!form.email||!form.password) { toast.error('All fields required'); return; }
    if (!/^[a-z0-9-]+$/.test(form.subdomain)) { toast.error('Subdomain: lowercase letters, numbers, hyphens only'); return; }
    setSaving(true);
    try {
      const cred = await createUserWithEmailAndPassword(auth, form.email, form.password);
      const restaurantRef = await createRestaurant({ name:form.name, subdomain:form.subdomain.toLowerCase(), isActive:true });
      await setDoc(doc(db,'users',cred.user.uid), { email:form.email, role:'restaurant', restaurantId:restaurantRef.id, restaurantName:form.name, createdAt:serverTimestamp() });
      toast.success(`Restaurant "${form.name}" created!`);
      setForm(BLANK); setShowForm(false); load();
    } catch (err) { toast.error(err.message||'Failed to create restaurant'); }
    finally { setSaving(false); }
  };

  const saveEdit = async (id) => {
    await updateRestaurant(id, editData);
    toast.success('Updated!'); setEditId(null); load();
  };

  const filtered = restaurants.filter(r =>
    r.name?.toLowerCase().includes(search.toLowerCase()) ||
    r.subdomain?.toLowerCase().includes(search.toLowerCase())
  );

  const planColors = { basic:['#F4D070','#8B6020'], pro:['#8FC4A8','#1A5A38'], premium:['#C4B5D4','#4A3A6A'] };

  return (
    <SuperAdminLayout>
      <Head><title>Restaurants — Super Admin</title></Head>
      <div style={{ background:'#F2F0EC', minHeight:'100vh', padding:32, fontFamily:'Inter,sans-serif' }}>
        <div style={{ maxWidth:1000, margin:'0 auto' }}>
          <style>{`@keyframes spin{to{transform:rotate(360deg)}} .inp:focus{border-color:rgba(224,90,58,0.5)!important} .inp::placeholder{color:rgba(42,31,16,0.3)} .row:hover{background:#F7F5F2!important}`}</style>

          {/* Header */}
          <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', marginBottom:28, flexWrap:'wrap', gap:12 }}>
            <div>
              <h1 style={S.h1}>Restaurants</h1>
              <p style={S.sub}>{restaurants.length} restaurants on the platform</p>
            </div>
            <button onClick={()=>setShowForm(!showForm)} style={{ ...S.btn, background:showForm?'#F2F0EC':'#1E1B18', color:showForm?'#1E1B18':'#FFF5E8', border:showForm?'1.5px solid rgba(42,31,16,0.12)':'none' }}>
              {showForm ? '✕ Cancel' : '+ Add Restaurant'}
            </button>
          </div>

          {/* Create form */}
          {showForm && (
            <div style={{ ...S.card, padding:28, marginBottom:24 }}>
              <h2 style={{ fontFamily:'Poppins,sans-serif', fontWeight:700, fontSize:16, color:'#1E1B18', marginBottom:22 }}>New Restaurant</h2>
              <form onSubmit={handleCreate}>
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14, marginBottom:14 }}>
                  <div><label style={S.label}>Restaurant Name *</label><input className="inp" style={S.input} value={form.name} onChange={e=>setForm(f=>({...f,name:e.target.value}))} placeholder="Spot Restaurant" required /></div>
                  <div>
                    <label style={S.label}>Subdomain *</label>
                    <div style={{ position:'relative' }}>
                      <input className="inp" style={{ ...S.input, paddingRight:140 }} value={form.subdomain} onChange={e=>setForm(f=>({...f,subdomain:e.target.value.toLowerCase()}))} placeholder="spot" required />
                      <span style={{ position:'absolute', right:14, top:'50%', transform:'translateY(-50%)', fontSize:12, color:'rgba(42,31,16,0.4)', pointerEvents:'none' }}>.advertradical.com</span>
                    </div>
                  </div>
                  <div><label style={S.label}>Admin Email *</label><input className="inp" style={S.input} type="email" value={form.email} onChange={e=>setForm(f=>({...f,email:e.target.value}))} placeholder="admin@spot.com" required /></div>
                  <div><label style={S.label}>Password *</label><input className="inp" style={S.input} type="password" value={form.password} onChange={e=>setForm(f=>({...f,password:e.target.value}))} placeholder="Min 6 characters" required /></div>
                </div>
                <button type="submit" disabled={saving} style={{ ...S.btn, background:'#1E1B18', color:'#FFF5E8', padding:'13px 28px', opacity:saving?0.6:1 }}>
                  {saving ? 'Creating…' : 'Create Restaurant'}
                </button>
              </form>
            </div>
          )}

          {/* Search */}
          <div style={{ position:'relative', marginBottom:18 }}>
            <span style={{ position:'absolute', left:16, top:'50%', transform:'translateY(-50%)', color:'rgba(42,31,16,0.35)', fontSize:16 }}>🔍</span>
            <input className="inp" style={{ ...S.input, paddingLeft:42, borderRadius:30 }} value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search restaurants…" />
          </div>

          {/* Table */}
          {loading ? (
            <div style={{ display:'flex', justifyContent:'center', paddingTop:60 }}>
              <div style={{ width:32, height:32, border:'3px solid #E05A3A', borderTopColor:'transparent', borderRadius:'50%', animation:'spin 0.8s linear infinite' }} />
            </div>
          ) : filtered.length === 0 ? (
            <div style={{ textAlign:'center', padding:'60px 0', color:'rgba(42,31,16,0.4)' }}>
              <div style={{ fontSize:40, marginBottom:12 }}>🏪</div>
              <p style={{ fontSize:14 }}>No restaurants found.</p>
            </div>
          ) : (
            <div style={{ ...S.card, overflow:'hidden' }}>
              {/* Table header */}
              <div style={{ display:'grid', gridTemplateColumns:'2fr 1.5fr 1fr 1fr 1fr 130px', gap:0, padding:'12px 20px', borderBottom:'1px solid rgba(42,31,16,0.06)', background:'#FAFAF8' }}>
                {['Restaurant','Subdomain','Plan','Items','Status','Actions'].map(h=>(
                  <div key={h} style={{ fontSize:11, fontWeight:600, color:'rgba(42,31,16,0.4)', letterSpacing:'0.05em', textTransform:'uppercase' }}>{h}</div>
                ))}
              </div>
              {filtered.map((r,i) => {
                const plan = r.plan || 'basic';
                const [planBg, planColor] = planColors[plan] || planColors.basic;
                const isEdit = editId === r.id;
                return (
                  <div key={r.id} className="row" style={{ borderBottom: i<filtered.length-1?'1px solid rgba(42,31,16,0.05)':'none', transition:'background 0.12s', background:'#fff' }}>
                    <div style={{ display:'grid', gridTemplateColumns:'2fr 1.5fr 1fr 1fr 1fr 130px', gap:0, padding:'14px 20px', alignItems:'center' }}>
                      <div>
                        <Link href={`/superadmin/restaurant/${r.id}`} style={{ fontWeight:600, fontSize:13, color:'#1E1B18', textDecoration:'none' }}
                          onMouseOver={e=>e.currentTarget.style.color='#E05A3A'}
                          onMouseOut={e=>e.currentTarget.style.color='#1E1B18'}>
                          {r.name}
                        </Link>
                        <div style={{ fontSize:11, color:'rgba(42,31,16,0.4)', marginTop:2 }}>ID: {r.id?.slice(0,8)}…</div>
                      </div>
                      <div style={{ fontSize:12, color:'rgba(42,31,16,0.55)', fontFamily:'monospace' }}>{r.subdomain}</div>
                      <div><span style={{ padding:'3px 10px', borderRadius:20, fontSize:11, fontWeight:700, background:planBg+'33', color:planColor, border:`1px solid ${planBg}66`, textTransform:'capitalize' }}>{plan}</span></div>
                      <div style={{ fontSize:12, color:'rgba(42,31,16,0.55)' }}>{r.itemsUsed||0}/{r.maxItems||10}</div>
                      <div><span style={{ padding:'3px 10px', borderRadius:20, fontSize:11, fontWeight:700, background:r.isActive?'rgba(143,196,168,0.2)':'rgba(42,31,16,0.06)', color:r.isActive?'#1A5A38':'rgba(42,31,16,0.4)', border:`1px solid ${r.isActive?'rgba(143,196,168,0.35)':'rgba(42,31,16,0.1)'}` }}>{r.isActive?'Active':'Inactive'}</span></div>
                      <div style={{ display:'flex', gap:6 }}>
                        <Link href={`/superadmin/restaurant/${r.id}`} style={{ padding:'5px 12px', borderRadius:8, border:'1.5px solid rgba(224,90,58,0.25)', background:'rgba(224,90,58,0.06)', fontSize:12, fontWeight:700, color:'#C04A28', cursor:'pointer', textDecoration:'none', whiteSpace:'nowrap' }}>
                          View →
                        </Link>
                        <button onClick={()=>{ setEditId(isEdit?null:r.id); setEditData({ plan:r.plan||'basic', isActive:r.isActive!==false, maxItems:r.maxItems||10 }); }} style={{ padding:'5px 12px', borderRadius:8, border:'1.5px solid rgba(42,31,16,0.1)', background:'transparent', fontSize:12, fontWeight:600, color:'rgba(42,31,16,0.55)', cursor:'pointer' }}>
                          {isEdit ? 'Cancel' : 'Edit'}
                        </button>
                      </div>
                    </div>
                    {isEdit && (
                      <div style={{ padding:'16px 20px 20px', background:'#FAFAF8', borderTop:'1px solid rgba(42,31,16,0.05)', display:'flex', gap:14, alignItems:'flex-end', flexWrap:'wrap' }}>
                        <div>
                          <label style={S.label}>Plan</label>
                          <select style={{ ...S.input, width:140 }} value={editData.plan} onChange={e=>setEditData(d=>({...d,plan:e.target.value}))}>
                            <option value="basic">Basic</option>
                            <option value="pro">Pro</option>
                            <option value="premium">Premium</option>
                          </select>
                        </div>
                        <div>
                          <label style={S.label}>Max Items</label>
                          <input type="number" style={{ ...S.input, width:110 }} value={editData.maxItems} onChange={e=>setEditData(d=>({...d,maxItems:Number(e.target.value)}))} min="1" />
                        </div>
                        <div style={{ display:'flex', alignItems:'center', gap:10, paddingBottom:2 }}>
                          <label style={{ ...S.label, marginBottom:0 }}>Active</label>
                          <div onClick={()=>setEditData(d=>({...d,isActive:!d.isActive}))} style={{ width:44, height:24, borderRadius:99, background:editData.isActive?'#8FC4A8':'rgba(42,31,16,0.15)', cursor:'pointer', position:'relative', transition:'background 0.2s' }}>
                            <div style={{ width:18, height:18, borderRadius:'50%', background:'#fff', position:'absolute', top:3, left:editData.isActive?23:3, transition:'left 0.2s', boxShadow:'0 1px 4px rgba(0,0,0,0.2)' }} />
                          </div>
                        </div>
                        <button onClick={()=>saveEdit(r.id)} style={{ ...S.btn, background:'#1E1B18', color:'#FFF5E8', padding:'10px 20px' }}>Save</button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </SuperAdminLayout>
  );
}
SuperAdminRestaurants.getLayout = (page) => page;
