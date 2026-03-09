import Head from 'next/head';
import { useEffect, useState } from 'react';
import SuperAdminLayout from '../../components/layout/SuperAdminLayout';
import { getAllItemsWithoutAR, attachARModel, getAllRestaurants } from '../../lib/db';
import { uploadFile, buildModelPath, fileSizeMB } from '../../lib/storage';
import toast from 'react-hot-toast';

const S = {
  card:  { background:'#FFFFFF', border:'1px solid rgba(42,31,16,0.07)', borderRadius:20, boxShadow:'0 2px 14px rgba(42,31,16,0.06)' },
  h1:    { fontFamily:'Poppins,sans-serif', fontWeight:800, fontSize:22, color:'#1E1B18', margin:0 },
  sub:   { fontSize:13, color:'rgba(42,31,16,0.45)', marginTop:4 },
  label: { display:'block', fontSize:11, fontWeight:600, color:'rgba(42,31,16,0.5)', letterSpacing:'0.05em', textTransform:'uppercase', marginBottom:6 },
};

export default function SuperAdminARManager() {
  const [items,      setItems]      = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [modelFiles, setModelFiles] = useState({});
  const [uploading,  setUploading]  = useState(null);
  const [progress,   setProgress]   = useState(0);
  const [genStatus,  setGenStatus]  = useState({});
  const [generating, setGenerating] = useState(null);
  const [filter,     setFilter]     = useState('all');

  const load = async () => {
    setLoading(true);
    try {
      const pending = await getAllItemsWithoutAR();
      setItems(pending);
    } catch (e) { toast.error('Load failed: ' + e.message); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  // Group by restaurant for the "by restaurant" view
  const byRestaurant = items.reduce((acc, item) => {
    const key = item.restaurantId;
    if (!acc[key]) acc[key] = { name: item.restaurantName, sub: item.restaurantSub, items: [] };
    acc[key].items.push(item);
    return acc;
  }, {});

  const handleUploadAR = async (item) => {
    const modelFile = modelFiles[item.id];
    if (!modelFile) { toast.error('Please attach a .glb file first'); return; }
    setUploading(item.id); setProgress(0);
    try {
      const sizeMB = parseFloat(fileSizeMB(modelFile).toFixed(2));
      const modelURL = await uploadFile(
        modelFile,
        buildModelPath(item.restaurantId, modelFile.name),
        setProgress
      );
      await attachARModel(item.restaurantId, item.id, modelURL, sizeMB);
      toast.success(`AR model attached to "${item.name}" — now live!`);
      setModelFiles(f => { const n={...f}; delete n[item.id]; return n; });
      await load();
    } catch (err) { toast.error('Upload failed: ' + err.message); }
    finally { setUploading(null); setProgress(0); }
  };

  const handleGenerateAR = async (item) => {
    if (!item.imageURL) { toast.error('No dish photo on this item — restaurant must upload one first'); return; }
    setGenerating(item.id);
    setGenStatus(s => ({ ...s, [item.id]: 'generating' }));
    const toastId = toast.loading(`Generating AR model for "${item.name}"…`);
    try {
      const res = await fetch('/api/generate-model', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ imageUrl: item.imageURL, itemName: item.name }),
      });
      const data = await res.json();
      if (!res.ok) {
        const msg = data.code === 'NO_API_KEY'
          ? 'MESHY_API_KEY not configured — add it to Vercel env variables'
          : (data.error || 'Generation failed');
        toast.error(msg, { id: toastId, duration: 6000 });
        setGenStatus(s => ({ ...s, [item.id]: 'error' }));
        return;
      }
      // Fetch generated .glb and set as model file
      const glbRes  = await fetch(data.modelUrl);
      const blob    = await glbRes.blob();
      const file    = new File([blob], `${item.name.replace(/\s+/g,'_')}_ar.glb`, { type:'model/gltf-binary' });
      setModelFiles(f => ({ ...f, [item.id]: file }));
      setGenStatus(s => ({ ...s, [item.id]: 'done' }));
      toast.success('3D model generated! Click "Attach AR Model" to publish.', { id: toastId, duration: 5000 });
    } catch (err) {
      toast.error('Generation error: ' + err.message, { id: toastId });
      setGenStatus(s => ({ ...s, [item.id]: 'error' }));
    } finally { setGenerating(null); }
  };

  const filtered = filter === 'all' ? items
    : filter === 'with-photo' ? items.filter(i => i.imageURL)
    : items.filter(i => !i.imageURL);

  return (
    <SuperAdminLayout>
      <Head><title>AR Model Manager — Advert Radical</title></Head>
      <div style={{ padding:32, maxWidth:1000, margin:'0 auto' }}>
        <style>{`@keyframes spin{to{transform:rotate(360deg)}} .upload-zone:hover{border-color:rgba(224,90,58,0.4)!important;background:#FFF8F5!important}`}</style>

        {/* Header */}
        <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', marginBottom:28, flexWrap:'wrap', gap:12 }}>
          <div>
            <h1 style={S.h1}>🤖 AR Model Manager</h1>
            <p style={S.sub}>All items added by restaurants — upload or generate 3D models to activate AR for each dish</p>
          </div>
          <button onClick={load} style={{ padding:'10px 18px', borderRadius:50, border:'1.5px solid rgba(42,31,16,0.12)', background:'#fff', fontSize:13, fontWeight:600, cursor:'pointer', fontFamily:'Poppins,sans-serif' }}>
            ↻ Refresh
          </button>
        </div>

        {/* Summary cards */}
        <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:14, marginBottom:28 }}>
          {[
            { label:'Awaiting AR',     value:items.length,                         icon:'⏳', color:'#B06010', bg:'rgba(247,155,61,0.1)'  },
            { label:'Have Photo',      value:items.filter(i=>i.imageURL).length,   icon:'📷', color:'#1A6B3A', bg:'rgba(45,139,78,0.08)'  },
            { label:'Restaurants',     value:Object.keys(byRestaurant).length,     icon:'🏪', color:'#5A8AC4', bg:'rgba(90,138,196,0.1)'  },
          ].map(s => (
            <div key={s.label} style={{ ...S.card, padding:'18px 20px', background:s.bg, border:`1px solid ${s.color}22` }}>
              <div style={{ fontSize:24, marginBottom:6 }}>{s.icon}</div>
              <div style={{ fontFamily:'Poppins,sans-serif', fontWeight:800, fontSize:28, color:s.color }}>{s.value}</div>
              <div style={{ fontSize:12, color:'rgba(42,31,16,0.5)', marginTop:2 }}>{s.label}</div>
            </div>
          ))}
        </div>

        {/* Filter tabs */}
        <div style={{ display:'flex', gap:6, marginBottom:20 }}>
          {[['all','All Items'],['with-photo','📷 Has Photo'],['no-photo','No Photo']].map(([key,label]) => (
            <button key={key} onClick={()=>setFilter(key)}
              style={{ padding:'7px 16px', borderRadius:30, border:'none', fontSize:12, fontWeight:600, cursor:'pointer', fontFamily:'Inter,sans-serif', background:filter===key?'#1E1B18':'#fff', color:filter===key?'#FFF5E8':'rgba(42,31,16,0.55)', boxShadow:filter===key?'0 2px 8px rgba(30,27,24,0.18)':'0 1px 4px rgba(42,31,16,0.06)', transition:'all 0.15s' }}>
              {label}
            </button>
          ))}
        </div>

        {/* Items */}
        {loading ? (
          <div style={{ display:'flex', justifyContent:'center', paddingTop:80 }}>
            <div style={{ width:36, height:36, border:'3px solid #F79B3D', borderTopColor:'transparent', borderRadius:'50%', animation:'spin 0.8s linear infinite' }} />
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ textAlign:'center', padding:'80px 0' }}>
            <div style={{ fontSize:48, marginBottom:14 }}>🎉</div>
            <div style={{ fontFamily:'Poppins,sans-serif', fontWeight:700, fontSize:17, color:'#1E1B18', marginBottom:8 }}>All items have AR models!</div>
            <div style={{ fontSize:13, color:'rgba(42,31,16,0.5)' }}>No pending items right now. Check back when restaurants add new dishes.</div>
          </div>
        ) : (
          <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
            {filtered.map(item => (
              <div key={item.id} style={{ ...S.card, padding:22 }}>
                <div style={{ display:'flex', alignItems:'flex-start', gap:16 }}>

                  {/* Thumbnail */}
                  <div style={{ width:72, height:72, borderRadius:14, overflow:'hidden', background:'#F7F5F2', flexShrink:0 }}>
                    {item.imageURL
                      ? <img src={item.imageURL} alt={item.name} style={{ width:'100%', height:'100%', objectFit:'cover' }} />
                      : <div style={{ width:'100%', height:'100%', display:'flex', alignItems:'center', justifyContent:'center', fontSize:28 }}>🍽️</div>
                    }
                  </div>

                  {/* Item info */}
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ display:'flex', alignItems:'center', gap:8, flexWrap:'wrap', marginBottom:4 }}>
                      <span style={{ fontFamily:'Poppins,sans-serif', fontWeight:700, fontSize:15, color:'#1E1B18' }}>{item.name}</span>
                      {item.price && <span style={{ fontSize:12, fontWeight:600, color:'#E05A3A' }}>₹{item.price}</span>}
                      {item.isVeg === true  && <span style={{ fontSize:11, color:'#2D8B4E', fontWeight:700 }}>🟢 Veg</span>}
                      {item.isVeg === false && <span style={{ fontSize:11, color:'#C0392B', fontWeight:700 }}>🔴 Non-Veg</span>}
                    </div>
                    <div style={{ fontSize:12, color:'rgba(42,31,16,0.5)', marginBottom:4 }}>
                      <span style={{ fontWeight:600, color:'#5A8AC4' }}>🏪 {item.restaurantName}</span>
                      {' · '}{item.category || 'No category'}
                      {item.spiceLevel && item.spiceLevel !== 'None' && ` · ${item.spiceLevel}`}
                    </div>
                    <div style={{ fontSize:11, color:'rgba(42,31,16,0.4)' }}>
                      Added {item.addedAt?.seconds ? new Date(item.addedAt.seconds*1000).toLocaleString('en-IN',{day:'numeric',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'}) : 'recently'}
                      {!item.imageURL && <span style={{ marginLeft:10, color:'#C04A28', fontWeight:600 }}>⚠ No photo yet</span>}
                    </div>
                    {item.description && (
                      <div style={{ fontSize:12, color:'rgba(42,31,16,0.45)', marginTop:6, lineHeight:1.5 }}>{item.description}</div>
                    )}
                  </div>
                </div>

                {/* AR upload section */}
                <div style={{ marginTop:18, paddingTop:18, borderTop:'1px solid rgba(42,31,16,0.07)' }}>
                  <div style={{ fontSize:11, color:'rgba(42,31,16,0.4)', fontWeight:600, textTransform:'uppercase', letterSpacing:'0.05em', marginBottom:12 }}>Attach 3D Model (.glb)</div>

                  <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
                    {/* Manual upload */}
                    <div>
                      <div
                        className="upload-zone"
                        onClick={()=>document.getElementById(`model-${item.id}`).click()}
                        style={{ border:'2px dashed rgba(42,31,16,0.15)', borderRadius:14, padding:16, textAlign:'center', cursor:'pointer', background:'#F7F5F2', transition:'all 0.15s', minHeight:80, display:'flex', alignItems:'center', justifyContent:'center' }}>
                        {modelFiles[item.id] ? (
                          <div>
                            <div style={{ fontSize:20, marginBottom:4 }}>✅</div>
                            <div style={{ fontSize:12, fontWeight:600, color:'#1A5A38' }}>{modelFiles[item.id].name}</div>
                            <div style={{ fontSize:11, color:'rgba(42,31,16,0.4)', marginTop:2 }}>{fileSizeMB(modelFiles[item.id]).toFixed(1)} MB</div>
                          </div>
                        ) : (
                          <div>
                            <div style={{ fontSize:22, marginBottom:4 }}>📦</div>
                            <div style={{ fontSize:12, color:'rgba(42,31,16,0.5)' }}>Upload .glb manually</div>
                            <div style={{ fontSize:11, color:'rgba(42,31,16,0.35)', marginTop:2 }}>Max 10MB</div>
                          </div>
                        )}
                        <input id={`model-${item.id}`} type="file" accept=".glb,.gltf" style={{ display:'none' }}
                          onChange={e => {
                            const f = e.target.files[0];
                            if (!f) return;
                            if (fileSizeMB(f) > 10) { toast.error('Model must be under 10MB'); return; }
                            setModelFiles(p => ({ ...p, [item.id]: f }));
                          }}
                        />
                      </div>
                    </div>

                    {/* AI generate */}
                    <div>
                      <button
                        onClick={() => handleGenerateAR(item)}
                        disabled={!!generating || !!uploading}
                        style={{
                          width:'100%', height:'100%', minHeight:80, borderRadius:14,
                          border:`1.5px solid ${genStatus[item.id]==='done'?'rgba(45,139,78,0.4)':genStatus[item.id]==='error'?'rgba(200,30,30,0.3)':'rgba(247,155,61,0.4)'}`,
                          background: genStatus[item.id]==='done'?'rgba(45,139,78,0.06)':genStatus[item.id]==='error'?'rgba(200,30,30,0.04)':'rgba(247,155,61,0.06)',
                          cursor: (!!generating||!!uploading)?'not-allowed':'pointer',
                          opacity: (!!generating||!!uploading)?0.65:1,
                          display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:6,
                          transition:'all 0.2s'
                        }}>
                        <span style={{ fontSize:22 }}>
                          {generating===item.id?'⏳':genStatus[item.id]==='done'?'✅':genStatus[item.id]==='error'?'❌':'🤖'}
                        </span>
                        <div style={{ fontSize:12, fontWeight:700, fontFamily:'Poppins,sans-serif', color: genStatus[item.id]==='done'?'#1A6B3A':genStatus[item.id]==='error'?'#8B1A1A':'#A06010' }}>
                          {generating===item.id?'Generating…':genStatus[item.id]==='done'?'Model Ready':genStatus[item.id]==='error'?'Try Again':'Generate with AI'}
                        </div>
                        <div style={{ fontSize:11, color:'rgba(42,31,16,0.4)', textAlign:'center', lineHeight:1.3, paddingInline:8 }}>
                          {item.imageURL?'Uses dish photo (~2 min)':'No photo — cannot generate'}
                        </div>
                      </button>
                    </div>
                  </div>

                  {/* Progress bar */}
                  {uploading === item.id && progress > 0 && (
                    <div style={{ height:4, background:'rgba(42,31,16,0.08)', borderRadius:99, overflow:'hidden', marginTop:12 }}>
                      <div style={{ height:'100%', borderRadius:99, background:'linear-gradient(90deg,#E05A3A,#F07050)', width:`${progress}%`, transition:'width 0.3s' }} />
                    </div>
                  )}

                  {/* Attach button */}
                  <button
                    onClick={() => handleUploadAR(item)}
                    disabled={!modelFiles[item.id] || uploading === item.id}
                    style={{ marginTop:12, width:'100%', padding:'11px', borderRadius:12, border:'none', background:'linear-gradient(135deg,#4ABA70,#2A9A50)', color:'#fff', fontSize:13, fontWeight:700, fontFamily:'Poppins,sans-serif', cursor:'pointer', opacity:(!modelFiles[item.id]||uploading===item.id)?0.4:1, transition:'opacity 0.15s' }}>
                    {uploading===item.id ? `Uploading ${Math.round(progress)}%…` : '✓ Attach AR Model'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </SuperAdminLayout>
  );
}
