import Head from 'next/head';
import { useEffect, useState } from 'react';
import { useAuth } from '../../hooks/useAuth';
import AdminLayout from '../../components/layout/AdminLayout';
import { getRequests, submitRequest } from '../../lib/db';
import { uploadFile, buildImagePath, fileSizeMB } from '../../lib/storage';
import toast from 'react-hot-toast';

const BLANK = { name:'', description:'', category:'', ingredients:'', calories:'', protein:'', carbs:'', fats:'', prepTime:'', isVeg:'', spiceLevel:'' };

const S = {
  page:  { padding:32, maxWidth:960, margin:'0 auto', fontFamily:'Inter,sans-serif' },
  card:  { background:'#FFFFFF', border:'1px solid rgba(42,31,16,0.07)', borderRadius:20, boxShadow:'0 2px 14px rgba(42,31,16,0.06)' },
  h1:    { fontFamily:'Poppins,sans-serif', fontWeight:800, fontSize:22, color:'#1E1B18', margin:0 },
  sub:   { fontSize:13, color:'rgba(42,31,16,0.45)', marginTop:4 },
  label: { display:'block', fontSize:11, fontWeight:600, color:'rgba(42,31,16,0.5)', letterSpacing:'0.05em', textTransform:'uppercase', marginBottom:6 },
  input: { width:'100%', padding:'11px 14px', background:'#F7F5F2', border:'1.5px solid rgba(42,31,16,0.09)', borderRadius:12, fontSize:14, color:'#1E1B18', fontFamily:'Inter,sans-serif', outline:'none', boxSizing:'border-box', transition:'border-color 0.15s' },
  btn:   { padding:'11px 22px', borderRadius:12, fontSize:14, fontWeight:600, fontFamily:'Poppins,sans-serif', border:'none', cursor:'pointer', transition:'all 0.18s' },
};

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

  useEffect(() => {
    if (!rid) return;
    getRequests(rid).then(r => { setRequests(r); setLoading(false); });
  }, [rid]);

  const handleImageChange = (e) => {
    const f = e.target.files[0];
    if (!f) return;
    if (fileSizeMB(f) > 5) { toast.error('Image must be under 5MB'); return; }
    setImageFile(f);
    setImagePreview(URL.createObjectURL(f));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!rid || !form.name.trim()) { toast.error('Item name is required'); return; }
    if (!form.category.trim()) { toast.error('Category is required'); return; }
    if (form.isVeg === '') { toast.error('Please select Veg or Non-Veg'); return; }
    if (!form.spiceLevel) { toast.error('Spice level is required'); return; }
    setSubmitting(true);
    try {
      let imageURL = null;
      if (imageFile) {
        const path = buildImagePath(rid, imageFile.name);
        imageURL = await uploadFile(imageFile, path, setUploadProgress);
      }
      const ingredients = form.ingredients ? form.ingredients.split(',').map(s => s.trim()).filter(Boolean) : [];
      await submitRequest(rid, {
        name: form.name.trim(), description: form.description.trim(), category: form.category.trim(), ingredients,
        prepTime: form.prepTime.trim() || null,
        isVeg: form.isVeg === 'true',
        spiceLevel: form.spiceLevel,
        nutritionalData: { calories: Number(form.calories)||null, protein: Number(form.protein)||null, carbs: Number(form.carbs)||null, fats: Number(form.fats)||null },
        imageURL,
      });
      toast.success("Request submitted! We'll review it shortly.");
      setForm(BLANK); setImageFile(null); setImagePreview(null); setShowForm(false);
      const updated = await getRequests(rid);
      setRequests(updated);
    } catch { toast.error('Failed to submit request. Try again.'); }
    finally { setSubmitting(false); setUploadProgress(0); }
  };

  const filtered = filter === 'all' ? requests : requests.filter(r => r.status === filter);

  return (
    <AdminLayout>
      <Head><title>Menu Requests — Advert Radical</title></Head>
      <div style={{ background:'#F2F0EC', minHeight:'100vh' }}>
        <div style={S.page}>
          <style>{`
            @keyframes spin{to{transform:rotate(360deg)}}
            .inp:focus{border-color:rgba(224,90,58,0.5)!important;box-shadow:0 0 0 3px rgba(224,90,58,0.08)}
            .inp::placeholder{color:rgba(42,31,16,0.3)}
            .upload-zone:hover{border-color:rgba(224,90,58,0.4)!important;background:#FFF8F5!important}
          `}</style>

          {/* Header */}
          <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', marginBottom:28, flexWrap:'wrap', gap:12 }}>
            <div>
              <h1 style={S.h1}>Menu Requests</h1>
              <p style={S.sub}>Submit dishes for AR listing. Our team 3D-scans and publishes them.</p>
            </div>
            <button onClick={() => setShowForm(!showForm)} style={{ ...S.btn, background: showForm ? '#F2F0EC' : '#1E1B18', color: showForm ? '#1E1B18' : '#FFF5E8', border: showForm ? '1.5px solid rgba(42,31,16,0.12)' : 'none' }}>
              {showForm ? '✕ Cancel' : '+ New Request'}
            </button>
          </div>

          {/* Form */}
          {showForm && (
            <div style={{ ...S.card, padding:28, marginBottom:24 }}>
              <h2 style={{ fontFamily:'Poppins,sans-serif', fontWeight:700, fontSize:16, color:'#1E1B18', marginBottom:22 }}>New Item Request</h2>
              <form onSubmit={handleSubmit}>
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16, marginBottom:16 }}>
                  <div>
                    <label style={S.label}>Item Name *</label>
                    <input className="inp" style={S.input} value={form.name} onChange={e=>setForm(f=>({...f,name:e.target.value}))} placeholder="e.g. Butter Chicken" required />
                  </div>
                  <div>
                    <label style={S.label}>Category *</label>
                    <input className="inp" style={S.input} value={form.category} onChange={e=>setForm(f=>({...f,category:e.target.value}))} placeholder="e.g. Main Course" />
                  </div>
                </div>
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16, marginBottom:16 }}>
                  <div>
                    <label style={S.label}>Veg / Non-Veg *</label>
                    <select className="inp" style={S.input} value={form.isVeg} onChange={e=>setForm(f=>({...f,isVeg:e.target.value}))}>
                      <option value="">Select…</option>
                      <option value="true">🟢 Vegetarian</option>
                      <option value="false">🔴 Non-Vegetarian</option>
                    </select>
                  </div>
                  <div>
                    <label style={S.label}>Spice Level *</label>
                    <select className="inp" style={S.input} value={form.spiceLevel} onChange={e=>setForm(f=>({...f,spiceLevel:e.target.value}))}>
                      <option value="">Select…</option>
                      {['None','Mild','Medium','Spicy','Very Spicy'].map(s=><option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>
                </div>
                <div style={{ marginBottom:16 }}>
                  <label style={S.label}>Description</label>
                  <textarea className="inp" style={{ ...S.input, resize:'none' }} rows={2} value={form.description} onChange={e=>setForm(f=>({...f,description:e.target.value}))} placeholder="Brief description of the dish…" />
                </div>
                <div style={{ marginBottom:16 }}>
                  <label style={S.label}>Ingredients (comma-separated)</label>
                  <input className="inp" style={S.input} value={form.ingredients} onChange={e=>setForm(f=>({...f,ingredients:e.target.value}))} placeholder="Chicken, Butter, Cream, Tomato, Spices" />
                </div>
                <div style={{ marginBottom:16 }}>
                  <label style={S.label}>Preparation Time</label>
                  <div style={{ position:'relative' }}>
                    <span style={{ position:'absolute', left:14, top:'50%', transform:'translateY(-50%)', fontSize:16 }}>⏱</span>
                    <input className="inp" style={{ ...S.input, paddingLeft:40 }} value={form.prepTime} onChange={e=>setForm(f=>({...f,prepTime:e.target.value}))} placeholder="e.g. 10–15 minutes" />
                  </div>
                  <div style={{ fontSize:11, color:'rgba(42,31,16,0.4)', marginTop:4 }}>Shown on menu card so customers know how long to wait</div>
                </div>
                <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:12, marginBottom:16 }}>
                  {['calories','protein','carbs','fats'].map(n=>(
                    <div key={n}>
                      <label style={S.label}>{n.charAt(0).toUpperCase()+n.slice(1)}</label>
                      <input className="inp" style={S.input} type="number" min="0" value={form[n]} onChange={e=>setForm(f=>({...f,[n]:e.target.value}))} placeholder="0" />
                    </div>
                  ))}
                </div>
                <div style={{ marginBottom:20 }}>
                  <label style={S.label}>Food Photo</label>
                  <div className="upload-zone" onClick={()=>document.getElementById('img-upload').click()} style={{ border:'2px dashed rgba(42,31,16,0.15)', borderRadius:14, padding:24, textAlign:'center', cursor:'pointer', background:'#F7F5F2', transition:'all 0.15s' }}>
                    {imagePreview
                      ? <img src={imagePreview} alt="Preview" style={{ maxHeight:120, margin:'0 auto', borderRadius:10, objectFit:'cover', display:'block' }} />
                      : <div><div style={{ fontSize:28, marginBottom:8 }}>📷</div><div style={{ fontSize:13, color:'rgba(42,31,16,0.4)' }}>Click to upload image (max 5MB)</div></div>
                    }
                    <input id="img-upload" type="file" accept="image/*" onChange={handleImageChange} style={{ display:'none' }} />
                  </div>
                </div>
                {uploadProgress > 0 && uploadProgress < 100 && (
                  <div style={{ height:4, background:'rgba(42,31,16,0.08)', borderRadius:99, overflow:'hidden', marginBottom:16 }}>
                    <div style={{ height:'100%', borderRadius:99, background:'linear-gradient(90deg,#E05A3A,#F07050)', width:`${uploadProgress}%`, transition:'width 0.3s' }} />
                  </div>
                )}
                <button type="submit" disabled={submitting} style={{ ...S.btn, background:'#1E1B18', color:'#FFF5E8', width:'100%', padding:'13px', opacity:submitting?0.6:1 }}>
                  {submitting ? 'Submitting…' : 'Submit Request'}
                </button>
              </form>
            </div>
          )}

          {/* Filter tabs */}
          <div style={{ display:'flex', gap:6, marginBottom:20 }}>
            {['all','pending','approved','rejected'].map(s => (
              <button key={s} onClick={()=>setFilter(s)} style={{ padding:'7px 16px', borderRadius:30, border:'none', fontSize:12, fontWeight:600, cursor:'pointer', fontFamily:'Inter,sans-serif', textTransform:'capitalize', background: filter===s?'#1E1B18':'#fff', color: filter===s?'#FFF5E8':'rgba(42,31,16,0.55)', boxShadow: filter===s?'0 2px 8px rgba(30,27,24,0.18)':'0 1px 4px rgba(42,31,16,0.06)', transition:'all 0.15s' }}>
                {s} ({s==='all'?requests.length:requests.filter(r=>r.status===s).length})
              </button>
            ))}
          </div>

          {/* List */}
          {loading ? (
            <div style={{ display:'flex', justifyContent:'center', paddingTop:60 }}>
              <div style={{ width:32, height:32, border:'3px solid #E05A3A', borderTopColor:'transparent', borderRadius:'50%', animation:'spin 0.8s linear infinite' }} />
            </div>
          ) : filtered.length === 0 ? (
            <div style={{ textAlign:'center', padding:'60px 0', color:'rgba(42,31,16,0.4)' }}>
              <div style={{ fontSize:40, marginBottom:12 }}>📭</div>
              <p style={{ fontSize:14 }}>No requests yet. Add your first menu item above!</p>
            </div>
          ) : (
            <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
              {filtered.map(req => (
                <div key={req.id} style={{ ...S.card, padding:18, display:'flex', alignItems:'flex-start', gap:16 }}>
                  <div style={{ width:56, height:56, borderRadius:14, overflow:'hidden', background:'#F7F5F2', flexShrink:0 }}>
                    {req.imageURL ? <img src={req.imageURL} alt={req.name} style={{ width:'100%', height:'100%', objectFit:'cover' }} /> : <div style={{ width:'100%', height:'100%', display:'flex', alignItems:'center', justifyContent:'center', fontSize:22 }}>🍽️</div>}
                  </div>
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', gap:8 }}>
                      <div>
                        <div style={{ fontWeight:600, fontSize:14, color:'#1E1B18' }}>{req.name}</div>
                        {req.category && <div style={{ fontSize:12, color:'rgba(42,31,16,0.45)', marginTop:2 }}>{req.category}</div>}
                      </div>
                      <StatusBadge status={req.status} />
                    </div>
                    {req.description && <p style={{ fontSize:12, color:'rgba(42,31,16,0.5)', marginTop:6, lineHeight:1.5 }}>{req.description}</p>}
                    <div style={{ fontSize:11, color:'rgba(42,31,16,0.35)', marginTop:8 }}>
                      Submitted {req.createdAt?.seconds ? new Date(req.createdAt.seconds*1000).toLocaleDateString() : 'recently'}
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
  const map = { pending:['#F4D070','#8B6020'], approved:['#8FC4A8','#1A5A38'], rejected:['#F4A0B0','#8B1A2A'] };
  const [bg, color] = map[status] || map.pending;
  return <span style={{ padding:'4px 12px', borderRadius:30, fontSize:11, fontWeight:700, background:bg+'33', color, border:`1px solid ${bg}66`, textTransform:'capitalize', flexShrink:0 }}>{status}</span>;
}
