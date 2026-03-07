import Head from 'next/head';
import { useEffect, useState } from 'react';
import { useAuth } from '../../hooks/useAuth';
import AdminLayout from '../../components/layout/AdminLayout';
import { getRequests, submitRequest } from '../../lib/db';
import { uploadFile, buildImagePath, fileSizeMB } from '../../lib/storage';
import toast from 'react-hot-toast';

const BLANK = { name:'', description:'', category:'', ingredients:'', calories:'', protein:'', carbs:'', fats:'', prepTime:'' };
const G = { card:'rgba(255,255,255,0.03)', border:'rgba(255,255,255,0.07)', gold:'#B8962E', text:'rgba(255,255,255,0.82)', textDim:'rgba(255,255,255,0.32)' };
const inp = { width:'100%', padding:'11px 14px', background:'rgba(255,255,255,0.04)', border:'1px solid rgba(255,255,255,0.09)', borderRadius:8, fontSize:14, color:'rgba(255,255,255,0.82)', outline:'none', boxSizing:'border-box', fontFamily:'inherit' };
const lbl = { display:'block', fontSize:11, fontWeight:600, color:'rgba(255,255,255,0.32)', letterSpacing:'0.08em', textTransform:'uppercase', marginBottom:6, fontFamily:`'DM Mono',monospace` };

export default function AdminRequests() {
  const { userData } = useAuth();
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(BLANK);
  const [imageFile, setImageFile] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [filter, setFilter] = useState('all');
  const rid = userData?.restaurantId;

  useEffect(() => { if (!rid) return; getRequests(rid).then(r=>{setRequests(r);setLoading(false);}); }, [rid]);

  const handleImageChange = (e) => {
    const f = e.target.files[0]; if (!f) return;
    if (fileSizeMB(f) > 5) { toast.error('Image must be under 5MB'); return; }
    setImageFile(f); setImagePreview(URL.createObjectURL(f));
  };

  const handleSubmit = async (e) => {
    e.preventDefault?.();
    if (!rid || !form.name.trim()) { toast.error('Item name is required'); return; }
    setSubmitting(true);
    try {
      let imageURL = null;
      if (imageFile) { const path = buildImagePath(rid, imageFile.name); imageURL = await uploadFile(imageFile, path, setUploadProgress); }
      const ingredients = form.ingredients ? form.ingredients.split(',').map(s=>s.trim()).filter(Boolean) : [];
      await submitRequest(rid, { name:form.name.trim(), description:form.description.trim(), category:form.category.trim(), ingredients, prepTime:form.prepTime.trim()||null, nutritionalData:{ calories:Number(form.calories)||null, protein:Number(form.protein)||null, carbs:Number(form.carbs)||null, fats:Number(form.fats)||null }, imageURL });
      toast.success("Request submitted! We'll review it shortly.");
      setForm(BLANK); setImageFile(null); setImagePreview(null); setShowForm(false);
      setRequests(await getRequests(rid));
    } catch { toast.error('Failed to submit request.'); }
    finally { setSubmitting(false); setUploadProgress(0); }
  };

  const filtered = filter === 'all' ? requests : requests.filter(r => r.status === filter);

  return (
    <AdminLayout>
      <Head><title>Menu Requests — Advert Radical</title></Head>
      <div style={{minHeight:'100vh',padding:'32px 36px',fontFamily:`'Bricolage Grotesque',Inter,sans-serif`}}>
        <div style={{maxWidth:960,margin:'0 auto'}}>
          <style>{`@keyframes spin{to{transform:rotate(360deg)}} *{box-sizing:border-box} .rinp:focus{border-color:rgba(184,150,46,0.5)!important;outline:none} .rinp::placeholder{color:rgba(255,255,255,0.18)} .upload-zone:hover{border-color:rgba(184,150,46,0.4)!important;background:rgba(184,150,46,0.03)!important}`}</style>

          <div style={{display:'flex',alignItems:'flex-start',justifyContent:'space-between',marginBottom:28,flexWrap:'wrap',gap:12}}>
            <div>
              <h1 style={{fontWeight:800,fontSize:22,color:'rgba(255,255,255,0.88)',margin:0,letterSpacing:'-0.02em'}}>Menu Requests</h1>
              <p style={{fontSize:13,color:G.textDim,marginTop:4}}>Submit dishes for AR listing. Our team 3D-scans and publishes them.</p>
            </div>
            <button onClick={()=>setShowForm(!showForm)} style={{padding:'9px 20px',borderRadius:8,border:`1px solid ${showForm?'rgba(255,255,255,0.1)':'rgba(184,150,46,0.3)'}`,background:showForm?'rgba(255,255,255,0.04)':'rgba(184,150,46,0.1)',color:showForm?G.textDim:G.gold,fontSize:13,fontWeight:600,cursor:'pointer',fontFamily:'inherit',transition:'all 0.2s'}}>
              {showForm?'✕ Cancel':'+ New Request'}
            </button>
          </div>

          {showForm && (
            <div style={{background:G.card,border:`1px solid ${G.border}`,borderRadius:12,padding:28,marginBottom:16}}>
              <h2 style={{fontWeight:700,fontSize:16,color:'rgba(255,255,255,0.82)',margin:'0 0 22px'}}>New Item Request</h2>
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:16,marginBottom:16}}>
                <div><label style={lbl}>Item Name *</label><input className="rinp" style={inp} value={form.name} onChange={e=>setForm(f=>({...f,name:e.target.value}))} placeholder="e.g. Butter Chicken"/></div>
                <div><label style={lbl}>Category</label><input className="rinp" style={inp} value={form.category} onChange={e=>setForm(f=>({...f,category:e.target.value}))} placeholder="e.g. Main Course"/></div>
              </div>
              <div style={{marginBottom:16}}>
                <label style={lbl}>Description</label>
                <textarea className="rinp" style={{...inp,resize:'none'}} rows={2} value={form.description} onChange={e=>setForm(f=>({...f,description:e.target.value}))} placeholder="Brief description of the dish…"/>
              </div>
              <div style={{marginBottom:16}}>
                <label style={lbl}>Ingredients (comma-separated)</label>
                <input className="rinp" style={inp} value={form.ingredients} onChange={e=>setForm(f=>({...f,ingredients:e.target.value}))} placeholder="Chicken, Butter, Cream, Tomato, Spices"/>
              </div>
              <div style={{marginBottom:16}}>
                <label style={lbl}>Preparation Time</label>
                <input className="rinp" style={inp} value={form.prepTime} onChange={e=>setForm(f=>({...f,prepTime:e.target.value}))} placeholder="e.g. 10–15 minutes"/>
              </div>
              <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:12,marginBottom:16}}>
                {['calories','protein','carbs','fats'].map(n=>(
                  <div key={n}><label style={lbl}>{n.charAt(0).toUpperCase()+n.slice(1)}</label><input className="rinp" style={inp} type="number" min="0" value={form[n]} onChange={e=>setForm(f=>({...f,[n]:e.target.value}))} placeholder="0"/></div>
                ))}
              </div>
              <div style={{marginBottom:20}}>
                <label style={lbl}>Food Photo</label>
                <div className="upload-zone" onClick={()=>document.getElementById('img-upload').click()} style={{border:'1.5px dashed rgba(255,255,255,0.1)',borderRadius:10,padding:24,textAlign:'center',cursor:'pointer',background:'rgba(255,255,255,0.02)',transition:'all 0.15s'}}>
                  {imagePreview ? <img src={imagePreview} alt="Preview" style={{maxHeight:120,margin:'0 auto',borderRadius:8,objectFit:'cover',display:'block'}}/> : <div><div style={{fontSize:24,marginBottom:8,opacity:0.3}}>📷</div><div style={{fontSize:13,color:G.textDim}}>Click to upload image (max 5MB)</div></div>}
                  <input id="img-upload" type="file" accept="image/*" onChange={handleImageChange} style={{display:'none'}}/>
                </div>
              </div>
              {uploadProgress > 0 && uploadProgress < 100 && (
                <div style={{height:3,background:'rgba(255,255,255,0.06)',borderRadius:2,overflow:'hidden',marginBottom:16}}>
                  <div style={{height:'100%',borderRadius:2,background:G.gold,width:`${uploadProgress}%`,transition:'width 0.3s'}}/>
                </div>
              )}
              <button onClick={handleSubmit} disabled={submitting} style={{padding:'12px 24px',borderRadius:8,border:`1px solid rgba(184,150,46,${submitting?'0.15':'0.35'})`,background:submitting?'transparent':'rgba(184,150,46,0.1)',color:submitting?G.textDim:G.gold,fontSize:14,fontWeight:700,cursor:submitting?'not-allowed':'pointer',fontFamily:'inherit',transition:'all 0.2s',width:'100%'}}>
                {submitting?'Submitting…':'Submit Request'}
              </button>
            </div>
          )}

          <div style={{display:'flex',gap:6,marginBottom:20}}>
            {['all','pending','approved','rejected'].map(s=>(
              <button key={s} onClick={()=>setFilter(s)} style={{padding:'7px 16px',borderRadius:8,border:`1px solid ${filter===s?'rgba(184,150,46,0.3)':G.border}`,fontSize:12,fontWeight:600,cursor:'pointer',fontFamily:'inherit',textTransform:'capitalize',background:filter===s?'rgba(184,150,46,0.1)':G.card,color:filter===s?G.gold:G.textDim,transition:'all 0.15s'}}>
                {s} ({s==='all'?requests.length:requests.filter(r=>r.status===s).length})
              </button>
            ))}
          </div>

          {loading ? (
            <div style={{display:'flex',justifyContent:'center',paddingTop:60}}>
              <div style={{width:32,height:32,border:`2px solid ${G.gold}`,borderTopColor:'transparent',borderRadius:'50%',animation:'spin 0.8s linear infinite'}}/>
            </div>
          ) : filtered.length === 0 ? (
            <div style={{textAlign:'center',padding:'60px 0',color:G.textDim}}>
              <div style={{fontSize:32,marginBottom:12,opacity:0.3}}>◈</div>
              <p style={{fontSize:14}}>No requests yet. Add your first menu item above!</p>
            </div>
          ) : (
            <div style={{display:'flex',flexDirection:'column',gap:8}}>
              {filtered.map(req=>(
                <div key={req.id} style={{background:G.card,border:`1px solid ${G.border}`,borderRadius:12,padding:18,display:'flex',alignItems:'flex-start',gap:16}}>
                  <div style={{width:52,height:52,borderRadius:10,overflow:'hidden',background:'rgba(255,255,255,0.05)',flexShrink:0}}>
                    {req.imageURL?<img src={req.imageURL} alt={req.name} style={{width:'100%',height:'100%',objectFit:'cover'}}/>:<div style={{width:'100%',height:'100%',display:'flex',alignItems:'center',justifyContent:'center',fontSize:18,color:G.textDim}}>⊞</div>}
                  </div>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{display:'flex',alignItems:'flex-start',justifyContent:'space-between',gap:8}}>
                      <div>
                        <div style={{fontWeight:600,fontSize:14,color:G.text}}>{req.name}</div>
                        {req.category&&<div style={{fontSize:12,color:G.textDim,marginTop:2}}>{req.category}</div>}
                      </div>
                      <StatusBadge status={req.status}/>
                    </div>
                    {req.description&&<p style={{fontSize:12,color:G.textDim,marginTop:6,lineHeight:1.5}}>{req.description}</p>}
                    <div style={{fontSize:11,color:G.textDim,marginTop:8,fontFamily:`'DM Mono',monospace`}}>
                      Submitted {req.createdAt?.seconds?new Date(req.createdAt.seconds*1000).toLocaleDateString():'recently'}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </AdminLayout>
  );
}
AdminRequests.getLayout = (page) => page;

function StatusBadge({ status }) {
  const map = { pending:{bg:'rgba(200,160,48,0.12)',color:'#C8A030',border:'rgba(200,160,48,0.25)'}, approved:{bg:'rgba(60,160,80,0.1)',color:'#5DC87A',border:'rgba(60,160,80,0.25)'}, rejected:{bg:'rgba(220,60,60,0.1)',color:'#E05555',border:'rgba(220,60,60,0.25)'} };
  const c=map[status]||map.pending;
  return <span style={{padding:'4px 12px',borderRadius:20,fontSize:11,fontWeight:600,background:c.bg,color:c.color,border:`1px solid ${c.border}`,textTransform:'capitalize',flexShrink:0,fontFamily:`'DM Mono',monospace`,whiteSpace:'nowrap'}}>{status}</span>;
}
