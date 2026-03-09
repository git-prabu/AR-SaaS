import Head from 'next/head';
import { useEffect, useState } from 'react';
import { useAuth } from '../../hooks/useAuth';
import AdminLayout from '../../components/layout/AdminLayout';
import { getAllMenuItems, addItemDirectly, deleteMenuItem } from '../../lib/db';
import { uploadFile, buildImagePath, fileSizeMB } from '../../lib/storage';
import toast from 'react-hot-toast';

const BLANK = {
  name:'', description:'', category:'', price:'', ingredients:'',
  calories:'', protein:'', carbs:'', fats:'', prepTime:'',
  spiceLevel:'None', isVeg:'',
};

const SPICE_LEVELS = ['None','Mild','Medium','Hot','Extra Hot'];

const S = {
  page:  { padding:32, maxWidth:960, margin:'0 auto', fontFamily:'Inter,sans-serif' },
  card:  { background:'#FFFFFF', border:'1px solid rgba(42,31,16,0.07)', borderRadius:20, boxShadow:'0 2px 14px rgba(42,31,16,0.06)' },
  h1:    { fontFamily:'Poppins,sans-serif', fontWeight:800, fontSize:22, color:'#1E1B18', margin:0 },
  sub:   { fontSize:13, color:'rgba(42,31,16,0.45)', marginTop:4 },
  label: { display:'block', fontSize:11, fontWeight:600, color:'rgba(42,31,16,0.5)', letterSpacing:'0.05em', textTransform:'uppercase', marginBottom:6 },
  input: { width:'100%', padding:'11px 14px', background:'#F7F5F2', border:'1.5px solid rgba(42,31,16,0.09)', borderRadius:12, fontSize:14, color:'#1E1B18', fontFamily:'Inter,sans-serif', outline:'none', boxSizing:'border-box', transition:'border-color 0.15s' },
};

export default function AdminAddItem() {
  const { userData } = useAuth();
  const [items,          setItems]          = useState([]);
  const [loading,        setLoading]        = useState(true);
  const [showForm,       setShowForm]       = useState(false);
  const [form,           setForm]           = useState(BLANK);
  const [imageFile,      setImageFile]      = useState(null);
  const [imagePreview,   setImagePreview]   = useState(null);
  const [submitting,     setSubmitting]     = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [deleting,       setDeleting]       = useState(null);
  const [filter,         setFilter]         = useState('all');
  const rid = userData?.restaurantId;

  const load = async () => {
    if (!rid) return;
    const all = await getAllMenuItems(rid);
    setItems(all.sort((a,b) => (b.addedAt?.seconds||b.createdAt?.seconds||0) - (a.addedAt?.seconds||a.createdAt?.seconds||0)));
    setLoading(false);
  };

  useEffect(() => { load(); }, [rid]);

  const handleImageChange = (e) => {
    const f = e.target.files[0];
    if (!f) return;
    if (fileSizeMB(f) > 5) { toast.error('Image must be under 5MB'); return; }
    setImageFile(f);
    setImagePreview(URL.createObjectURL(f));
  };

  const handleSubmit = async () => {
    if (!rid || !form.name.trim())        { toast.error('Item name is required'); return; }
    if (!form.category.trim())            { toast.error('Category is required'); return; }
    if (form.isVeg === '' || form.isVeg === undefined) { toast.error('Please mark item as Veg or Non-Veg'); return; }
    if (!form.spiceLevel)                 { toast.error('Spice level is required'); return; }
    setSubmitting(true);
    try {
      let imageURL = null;
      if (imageFile) {
        imageURL = await uploadFile(imageFile, buildImagePath(rid, imageFile.name), setUploadProgress);
      }
      const ingredients = form.ingredients
        ? form.ingredients.split(',').map(s => s.trim()).filter(Boolean)
        : [];
      await addItemDirectly(rid, {
        name:        form.name.trim(),
        description: form.description.trim(),
        category:    form.category.trim(),
        price:       form.price !== '' ? Number(form.price) : null,
        ingredients,
        prepTime:    form.prepTime.trim() || null,
        spiceLevel:  form.spiceLevel,
        isVeg:       form.isVeg,
        nutritionalData: {
          calories: Number(form.calories)||null,
          protein:  Number(form.protein)||null,
          carbs:    Number(form.carbs)||null,
          fats:     Number(form.fats)||null,
        },
        imageURL,
      });
      toast.success(`"${form.name}" is now live on your menu! AR will be added by our team.`);
      setForm(BLANK); setImageFile(null); setImagePreview(null);
      setShowForm(false); setUploadProgress(0);
      await load();
    } catch (e) { toast.error('Failed to add item: ' + e.message); }
    finally { setSubmitting(false); setUploadProgress(0); }
  };

  const handleDelete = async (item) => {
    if (!confirm(`Delete "${item.name}"? This cannot be undone.`)) return;
    setDeleting(item.id);
    try { await deleteMenuItem(rid, item.id); toast.success(`"${item.name}" deleted`); await load(); }
    catch { toast.error('Delete failed'); }
    finally { setDeleting(null); }
  };

  const filtered = filter === 'all' ? items
    : filter === 'ar-ready'  ? items.filter(i => i.modelURL)
    : filter === 'ar-pending' ? items.filter(i => !i.modelURL)
    : items;

  const counts = {
    all: items.length,
    'ar-ready':  items.filter(i => i.modelURL).length,
    'ar-pending': items.filter(i => !i.modelURL).length,
  };

  return (
    <AdminLayout>
      <Head><title>Add Menu Item — Advert Radical</title></Head>
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
              <h1 style={S.h1}>Add Menu Item</h1>
              <p style={S.sub}>Items go live on your menu instantly. AR model will be added by the Advert Radical team.</p>
            </div>
            <button
              onClick={() => setShowForm(!showForm)}
              style={{ padding:'11px 22px', borderRadius:50, fontSize:14, fontWeight:700, fontFamily:'Poppins,sans-serif', border: showForm ? '1.5px solid rgba(42,31,16,0.12)' : 'none', background: showForm ? '#F2F0EC' : '#1E1B18', color: showForm ? '#1E1B18' : '#FFF5E8', cursor:'pointer' }}>
              {showForm ? '✕ Cancel' : '＋ Add Item'}
            </button>
          </div>

          {/* Add form */}
          {showForm && (
            <div style={{ ...S.card, padding:28, marginBottom:24, border:'1.5px solid rgba(247,155,61,0.3)' }}>
              <h2 style={{ fontFamily:'Poppins,sans-serif', fontWeight:700, fontSize:16, color:'#1E1B18', marginBottom:22 }}>New Menu Item</h2>

              {/* Name + Category + Price */}
              <div style={{ display:'grid', gridTemplateColumns:'2fr 2fr 1fr', gap:14, marginBottom:16 }}>
                <div>
                  <label style={S.label}>Item Name <span style={{color:'#E05A3A'}}>*</span></label>
                  <input className="inp" style={S.input} value={form.name} onChange={e=>setForm(f=>({...f,name:e.target.value}))} placeholder="e.g. Butter Chicken" />
                </div>
                <div>
                  <label style={S.label}>Category <span style={{color:'#E05A3A'}}>*</span></label>
                  <input className="inp" style={S.input} value={form.category} onChange={e=>setForm(f=>({...f,category:e.target.value}))} placeholder="e.g. Main Course" />
                </div>
                <div>
                  <label style={S.label}>Price (₹)</label>
                  <input className="inp" style={S.input} type="number" min="0" value={form.price} onChange={e=>setForm(f=>({...f,price:e.target.value}))} placeholder="299" />
                </div>
              </div>

              {/* Description */}
              <div style={{ marginBottom:16 }}>
                <label style={S.label}>Description</label>
                <textarea className="inp" style={{ ...S.input, resize:'none' }} rows={2} value={form.description} onChange={e=>setForm(f=>({...f,description:e.target.value}))} placeholder="Brief description of the dish…" />
              </div>

              {/* Veg / Non-veg + Spice + Prep time */}
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:14, marginBottom:16 }}>
                <div>
                  <label style={S.label}>Veg / Non-Veg <span style={{color:'#E05A3A'}}>*</span></label>
                  <div style={{ display:'flex', gap:8, marginTop:2 }}>
                    {[{val:true,label:'🟢 Veg',bg:'#2D8B4E'},{val:false,label:'🔴 Non-Veg',bg:'#C0392B'}].map(({val,label,bg})=>(
                      <button key={String(val)} onClick={()=>setForm(f=>({...f,isVeg:val}))}
                        style={{ flex:1, padding:'9px 6px', borderRadius:50, border:`2px solid ${form.isVeg===val?bg:'rgba(42,31,16,0.12)'}`, background:form.isVeg===val?bg+'18':'#fff', fontSize:12, fontWeight:700, color:form.isVeg===val?bg:'rgba(42,31,16,0.45)', cursor:'pointer', transition:'all 0.15s' }}>
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label style={S.label}>🌶 Spice Level <span style={{color:'#E05A3A'}}>*</span></label>
                  <select className="inp" style={S.input} value={form.spiceLevel} onChange={e=>setForm(f=>({...f,spiceLevel:e.target.value}))}>
                    {SPICE_LEVELS.map(s=><option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
                <div>
                  <label style={S.label}>⏱ Prep Time</label>
                  <input className="inp" style={S.input} value={form.prepTime} onChange={e=>setForm(f=>({...f,prepTime:e.target.value}))} placeholder="10–15 minutes" />
                </div>
              </div>

              {/* Ingredients */}
              <div style={{ marginBottom:16 }}>
                <label style={S.label}>Ingredients (comma-separated)</label>
                <input className="inp" style={S.input} value={form.ingredients} onChange={e=>setForm(f=>({...f,ingredients:e.target.value}))} placeholder="Chicken, Butter, Cream, Tomato, Spices" />
              </div>

              {/* Nutrition */}
              <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:12, marginBottom:16 }}>
                {['calories','protein','carbs','fats'].map(n=>(
                  <div key={n}>
                    <label style={S.label}>{n.charAt(0).toUpperCase()+n.slice(1)}</label>
                    <input className="inp" style={S.input} type="number" min="0" value={form[n]} onChange={e=>setForm(f=>({...f,[n]:e.target.value}))} placeholder="0" />
                  </div>
                ))}
              </div>

              {/* Photo upload */}
              <div style={{ marginBottom:20 }}>
                <label style={S.label}>Food Photo</label>
                <div className="upload-zone" onClick={()=>document.getElementById('img-upload').click()}
                  style={{ border:'2px dashed rgba(42,31,16,0.15)', borderRadius:14, padding:24, textAlign:'center', cursor:'pointer', background:'#F7F5F2', transition:'all 0.15s' }}>
                  {imagePreview
                    ? <img src={imagePreview} alt="Preview" style={{ maxHeight:120, margin:'0 auto', borderRadius:10, objectFit:'cover', display:'block' }} />
                    : <div><div style={{ fontSize:28, marginBottom:8 }}>📷</div><div style={{ fontSize:13, color:'rgba(42,31,16,0.4)' }}>Click to upload photo (max 5MB)</div></div>
                  }
                  <input id="img-upload" type="file" accept="image/*" onChange={handleImageChange} style={{ display:'none' }} />
                </div>
              </div>

              {/* Upload progress */}
              {uploadProgress > 0 && uploadProgress < 100 && (
                <div style={{ height:4, background:'rgba(42,31,16,0.08)', borderRadius:99, overflow:'hidden', marginBottom:16 }}>
                  <div style={{ height:'100%', borderRadius:99, background:'linear-gradient(90deg,#E05A3A,#F07050)', width:`${uploadProgress}%`, transition:'width 0.3s' }} />
                </div>
              )}

              {/* AR notice */}
              <div style={{ display:'flex', alignItems:'center', gap:10, padding:'12px 16px', background:'rgba(247,155,61,0.07)', borderRadius:12, border:'1px solid rgba(247,155,61,0.25)', marginBottom:16 }}>
                <span style={{ fontSize:18 }}>🤖</span>
                <span style={{ fontSize:13, color:'rgba(42,31,16,0.65)' }}>
                  Your item will go live immediately. The Advert Radical team will add the 3D AR model — you'll see an AR badge on the item once it's ready.
                </span>
              </div>

              <button onClick={handleSubmit} disabled={submitting}
                style={{ padding:'13px 28px', borderRadius:12, border:'none', background:'#1E1B18', color:'#FFF5E8', fontSize:14, fontWeight:700, fontFamily:'Poppins,sans-serif', cursor:'pointer', opacity:submitting?0.6:1, width:'100%' }}>
                {submitting ? 'Publishing…' : '✓ Publish to Menu'}
              </button>
            </div>
          )}

          {/* Filter tabs */}
          <div style={{ display:'flex', gap:6, marginBottom:20 }}>
            {[['all','All Items'],['ar-ready','✦ AR Ready'],['ar-pending','⏳ Awaiting AR']].map(([key,label]) => (
              <button key={key} onClick={()=>setFilter(key)}
                style={{ padding:'7px 16px', borderRadius:30, border:'none', fontSize:12, fontWeight:600, cursor:'pointer', fontFamily:'Inter,sans-serif', background: filter===key?'#1E1B18':'#fff', color: filter===key?'#FFF5E8':'rgba(42,31,16,0.55)', boxShadow: filter===key?'0 2px 8px rgba(30,27,24,0.18)':'0 1px 4px rgba(42,31,16,0.06)', transition:'all 0.15s' }}>
                {label} ({counts[key]||0})
              </button>
            ))}
          </div>

          {/* Items list */}
          {loading ? (
            <div style={{ display:'flex', justifyContent:'center', paddingTop:60 }}>
              <div style={{ width:32, height:32, border:'3px solid #E05A3A', borderTopColor:'transparent', borderRadius:'50%', animation:'spin 0.8s linear infinite' }} />
            </div>
          ) : filtered.length === 0 ? (
            <div style={{ textAlign:'center', padding:'60px 0', color:'rgba(42,31,16,0.4)' }}>
              <div style={{ fontSize:40, marginBottom:12 }}>🍽️</div>
              <p style={{ fontSize:14 }}>No items yet. Add your first menu item above!</p>
            </div>
          ) : (
            <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
              {filtered.map(item => (
                <div key={item.id} style={{ ...S.card, padding:18, display:'flex', alignItems:'center', gap:16 }}>
                  {/* Thumbnail */}
                  <div style={{ width:58, height:58, borderRadius:14, overflow:'hidden', background:'#F7F5F2', flexShrink:0 }}>
                    {item.imageURL
                      ? <img src={item.imageURL} alt={item.name} style={{ width:'100%', height:'100%', objectFit:'cover' }} />
                      : <div style={{ width:'100%', height:'100%', display:'flex', alignItems:'center', justifyContent:'center', fontSize:22 }}>🍽️</div>
                    }
                  </div>

                  {/* Info */}
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ display:'flex', alignItems:'center', gap:8, flexWrap:'wrap', marginBottom:3 }}>
                      <span style={{ fontWeight:700, fontSize:14, color:'#1E1B18' }}>{item.name}</span>
                      {item.price && <span style={{ fontSize:12, fontWeight:600, color:'#E05A3A' }}>₹{item.price}</span>}
                      {/* AR status badge */}
                      {item.modelURL
                        ? <span style={{ padding:'2px 9px', borderRadius:20, background:'rgba(45,139,78,0.1)', color:'#1A6B3A', fontSize:11, fontWeight:700, border:'1px solid rgba(45,139,78,0.25)' }}>✦ AR Ready</span>
                        : <span style={{ padding:'2px 9px', borderRadius:20, background:'rgba(247,155,61,0.1)', color:'#A06010', fontSize:11, fontWeight:700, border:'1px solid rgba(247,155,61,0.25)' }}>⏳ AR Pending</span>
                      }
                      {/* Veg indicator */}
                      {item.isVeg === true  && <span style={{ fontSize:10, fontWeight:700, color:'#2D8B4E' }}>🟢 Veg</span>}
                      {item.isVeg === false && <span style={{ fontSize:10, fontWeight:700, color:'#C0392B' }}>🔴 Non-Veg</span>}
                      {!item.isActive && <span style={{ padding:'2px 9px', borderRadius:20, background:'rgba(42,31,16,0.06)', color:'rgba(42,31,16,0.4)', fontSize:11, fontWeight:700 }}>Hidden</span>}
                    </div>
                    <div style={{ fontSize:12, color:'rgba(42,31,16,0.45)' }}>
                      {item.category || '—'}
                      {item.spiceLevel && item.spiceLevel !== 'None' && ` · ${item.spiceLevel}`}
                      {' · Added '}{item.addedAt?.seconds ? new Date(item.addedAt.seconds*1000).toLocaleDateString('en-IN',{day:'numeric',month:'short',year:'numeric'}) : item.createdAt?.seconds ? new Date(item.createdAt.seconds*1000).toLocaleDateString('en-IN',{day:'numeric',month:'short',year:'numeric'}) : 'recently'}
                    </div>
                  </div>

                  {/* Delete button */}
                  <button onClick={() => handleDelete(item)} disabled={deleting===item.id}
                    style={{ padding:'8px 14px', borderRadius:10, border:'1.5px solid rgba(200,30,30,0.2)', background:'transparent', fontSize:12, fontWeight:600, cursor:'pointer', color:'#C01010', flexShrink:0, opacity:deleting===item.id?0.5:1 }}>
                    {deleting===item.id ? '…' : '✕ Delete'}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </AdminLayout>
  );
}
