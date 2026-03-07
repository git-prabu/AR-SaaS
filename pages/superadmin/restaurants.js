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
const G = { card:'rgba(255,255,255,0.03)', border:'rgba(255,255,255,0.07)', gold:'#B8962E', text:'rgba(255,255,255,0.82)', textDim:'rgba(255,255,255,0.32)' };
const inp = { width:'100%', padding:'10px 14px', background:'rgba(255,255,255,0.04)', border:'1px solid rgba(255,255,255,0.09)', borderRadius:8, fontSize:14, color:'rgba(255,255,255,0.82)', outline:'none', boxSizing:'border-box', fontFamily:'inherit', colorScheme:'dark' };
const lbl = { display:'block', fontSize:11, fontWeight:600, color:'rgba(255,255,255,0.32)', letterSpacing:'0.08em', textTransform:'uppercase', marginBottom:6, fontFamily:`'DM Mono',monospace` };

export default function SuperAdminRestaurants() {
  const [restaurants, setRestaurants] = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form,     setForm]     = useState(BLANK);
  const [saving,   setSaving]   = useState(false);
  const [search,   setSearch]   = useState('');
  const [editId,   setEditId]   = useState(null);
  const [editData, setEditData] = useState({});

  const load = () => { getAllRestaurants().then(r=>{setRestaurants(r);setLoading(false);}); };
  useEffect(() => { load(); }, []);

  const handleCreate = async (e) => {
    e.preventDefault?.();
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

  return (
    <SuperAdminLayout>
      <Head><title>Restaurants — Super Admin</title></Head>
      <div style={{minHeight:'100vh',padding:'32px 36px',fontFamily:`'Bricolage Grotesque',Inter,sans-serif`}}>
        <div style={{maxWidth:1000,margin:'0 auto'}}>
          <style>{`@keyframes spin{to{transform:rotate(360deg)}} *{box-sizing:border-box} .sinp:focus{border-color:rgba(184,150,46,0.5)!important;outline:none} .sinp::placeholder{color:rgba(255,255,255,0.18)} .rrestrow:hover{background:rgba(255,255,255,0.02)!important}`}</style>

          <div style={{display:'flex',alignItems:'flex-start',justifyContent:'space-between',marginBottom:28,flexWrap:'wrap',gap:12}}>
            <div>
              <h1 style={{fontWeight:800,fontSize:22,color:'rgba(255,255,255,0.88)',margin:0,letterSpacing:'-0.02em'}}>Restaurants</h1>
              <p style={{fontSize:13,color:G.textDim,marginTop:4}}>{restaurants.length} restaurants on the platform</p>
            </div>
            <button onClick={()=>setShowForm(!showForm)} style={{padding:'9px 20px',borderRadius:8,border:`1px solid ${showForm?'rgba(255,255,255,0.1)':'rgba(184,150,46,0.3)'}`,background:showForm?'rgba(255,255,255,0.04)':'rgba(184,150,46,0.1)',color:showForm?G.textDim:G.gold,fontSize:13,fontWeight:600,cursor:'pointer',fontFamily:'inherit',transition:'all 0.2s'}}>
              {showForm?'✕ Cancel':'+ Add Restaurant'}
            </button>
          </div>

          {showForm && (
            <div style={{background:G.card,border:`1px solid ${G.border}`,borderRadius:12,padding:28,marginBottom:16}}>
              <h2 style={{fontWeight:700,fontSize:16,color:'rgba(255,255,255,0.82)',margin:'0 0 22px'}}>New Restaurant</h2>
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:14,marginBottom:14}}>
                <div><label style={lbl}>Restaurant Name *</label><input className="sinp" style={inp} value={form.name} onChange={e=>setForm(f=>({...f,name:e.target.value}))} placeholder="Spot Restaurant"/></div>
                <div>
                  <label style={lbl}>Subdomain *</label>
                  <div style={{position:'relative'}}>
                    <input className="sinp" style={{...inp,paddingRight:140}} value={form.subdomain} onChange={e=>setForm(f=>({...f,subdomain:e.target.value.toLowerCase()}))} placeholder="spot"/>
                    <span style={{position:'absolute',right:12,top:'50%',transform:'translateY(-50%)',fontSize:11,color:G.textDim,pointerEvents:'none',fontFamily:`'DM Mono',monospace`}}>.advertradical.com</span>
                  </div>
                </div>
                <div><label style={lbl}>Admin Email *</label><input className="sinp" style={inp} type="email" value={form.email} onChange={e=>setForm(f=>({...f,email:e.target.value}))} placeholder="admin@spot.com"/></div>
                <div><label style={lbl}>Password *</label><input className="sinp" style={inp} type="password" value={form.password} onChange={e=>setForm(f=>({...f,password:e.target.value}))} placeholder="Min 6 characters"/></div>
              </div>
              <button onClick={handleCreate} disabled={saving} style={{padding:'11px 24px',borderRadius:8,border:`1px solid rgba(184,150,46,${saving?'0.15':'0.35'})`,background:saving?'transparent':'rgba(184,150,46,0.1)',color:saving?G.textDim:G.gold,fontSize:14,fontWeight:700,cursor:saving?'not-allowed':'pointer',fontFamily:'inherit',transition:'all 0.2s'}}>
                {saving?'Creating…':'Create Restaurant'}
              </button>
            </div>
          )}

          <div style={{position:'relative',marginBottom:16}}>
            <input className="sinp" style={{...inp,paddingLeft:36}} value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search restaurants…"/>
            <span style={{position:'absolute',left:12,top:'50%',transform:'translateY(-50%)',color:G.textDim,fontSize:14,pointerEvents:'none'}}>⌕</span>
          </div>

          {loading ? (
            <div style={{display:'flex',justifyContent:'center',paddingTop:60}}>
              <div style={{width:32,height:32,border:`2px solid ${G.gold}`,borderTopColor:'transparent',borderRadius:'50%',animation:'spin 0.8s linear infinite'}}/>
            </div>
          ) : filtered.length === 0 ? (
            <div style={{textAlign:'center',padding:'60px 0',color:G.textDim}}>
              <div style={{fontSize:32,marginBottom:12,opacity:0.3}}>⬡</div>
              <p style={{fontSize:14}}>No restaurants found.</p>
            </div>
          ) : (
            <div style={{background:G.card,border:`1px solid ${G.border}`,borderRadius:12,overflow:'hidden'}}>
              <div style={{display:'grid',gridTemplateColumns:'2fr 1.5fr 1fr 1fr 1fr 130px',gap:0,padding:'10px 20px',borderBottom:`1px solid ${G.border}`,background:'rgba(255,255,255,0.02)'}}>
                {['Restaurant','Subdomain','Plan','Items','Status','Actions'].map(h=>(
                  <div key={h} style={{fontSize:10,fontWeight:600,color:G.textDim,letterSpacing:'0.08em',textTransform:'uppercase',fontFamily:`'DM Mono',monospace`}}>{h}</div>
                ))}
              </div>
              {filtered.map((r,i) => {
                const plan = r.plan||'basic';
                const isEdit = editId === r.id;
                return (
                  <div key={r.id} className="rrestrow" style={{borderBottom:i<filtered.length-1?`1px solid ${G.border}`:'none',transition:'background 0.12s',background:'transparent'}}>
                    <div style={{display:'grid',gridTemplateColumns:'2fr 1.5fr 1fr 1fr 1fr 130px',gap:0,padding:'13px 20px',alignItems:'center'}}>
                      <div>
                        <Link href={`/superadmin/restaurant/${r.id}`} style={{fontWeight:600,fontSize:13,color:G.text,textDecoration:'none'}} onMouseOver={e=>e.currentTarget.style.color=G.gold} onMouseOut={e=>e.currentTarget.style.color=G.text}>{r.name}</Link>
                        <div style={{fontSize:10,color:G.textDim,marginTop:2,fontFamily:`'DM Mono',monospace`}}>ID: {r.id?.slice(0,8)}…</div>
                      </div>
                      <div style={{fontSize:12,color:G.textDim,fontFamily:`'DM Mono',monospace`}}>{r.subdomain}</div>
                      <div><span style={{padding:'3px 10px',borderRadius:20,fontSize:11,fontWeight:600,background:'rgba(184,150,46,0.1)',color:G.gold,border:'1px solid rgba(184,150,46,0.2)',textTransform:'capitalize',fontFamily:`'DM Mono',monospace`}}>{plan}</span></div>
                      <div style={{fontSize:12,color:G.textDim,fontFamily:`'DM Mono',monospace`}}>{r.itemsUsed||0}/{r.maxItems||10}</div>
                      <div><span style={{padding:'3px 10px',borderRadius:20,fontSize:11,fontWeight:600,background:r.isActive?'rgba(60,160,80,0.1)':'rgba(255,255,255,0.04)',color:r.isActive?'#5DC87A':G.textDim,border:`1px solid ${r.isActive?'rgba(60,160,80,0.25)':'rgba(255,255,255,0.08)'}`,fontFamily:`'DM Mono',monospace`}}>{r.isActive?'Active':'Inactive'}</span></div>
                      <div style={{display:'flex',gap:6}}>
                        <Link href={`/superadmin/restaurant/${r.id}`} style={{padding:'5px 10px',borderRadius:6,border:`1px solid rgba(184,150,46,0.25)`,background:'rgba(184,150,46,0.07)',fontSize:11,fontWeight:600,color:G.gold,cursor:'pointer',textDecoration:'none',whiteSpace:'nowrap'}}>View →</Link>
                        <button onClick={()=>{setEditId(isEdit?null:r.id);setEditData({plan:r.plan||'basic',isActive:r.isActive!==false,maxItems:r.maxItems||10});}} style={{padding:'5px 10px',borderRadius:6,border:`1px solid ${G.border}`,background:'transparent',fontSize:11,fontWeight:600,color:G.textDim,cursor:'pointer'}}>{isEdit?'Cancel':'Edit'}</button>
                      </div>
                    </div>
                    {isEdit && (
                      <div style={{padding:'16px 20px 20px',background:'rgba(255,255,255,0.02)',borderTop:`1px solid ${G.border}`,display:'flex',gap:14,alignItems:'flex-end',flexWrap:'wrap'}}>
                        <div>
                          <label style={lbl}>Plan</label>
                          <select style={{...inp,width:140,colorScheme:'dark'}} value={editData.plan} onChange={e=>setEditData(d=>({...d,plan:e.target.value}))}>
                            <option value="basic">Basic</option>
                            <option value="pro">Pro</option>
                            <option value="premium">Premium</option>
                          </select>
                        </div>
                        <div>
                          <label style={lbl}>Max Items</label>
                          <input type="number" style={{...inp,width:110}} value={editData.maxItems} onChange={e=>setEditData(d=>({...d,maxItems:Number(e.target.value)}))} min="1"/>
                        </div>
                        <div style={{display:'flex',alignItems:'center',gap:10,paddingBottom:2}}>
                          <label style={{...lbl,marginBottom:0}}>Active</label>
                          <div onClick={()=>setEditData(d=>({...d,isActive:!d.isActive}))} style={{width:40,height:22,borderRadius:99,background:editData.isActive?'rgba(60,160,80,0.6)':'rgba(255,255,255,0.1)',cursor:'pointer',position:'relative',transition:'background 0.2s'}}>
                            <div style={{width:16,height:16,borderRadius:'50%',background:'#fff',position:'absolute',top:3,left:editData.isActive?21:3,transition:'left 0.2s'}}/>
                          </div>
                        </div>
                        <button onClick={()=>saveEdit(r.id)} style={{padding:'10px 20px',borderRadius:8,border:`1px solid rgba(184,150,46,0.35)`,background:'rgba(184,150,46,0.1)',color:G.gold,fontSize:13,fontWeight:700,cursor:'pointer',fontFamily:'inherit'}}>Save</button>
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
