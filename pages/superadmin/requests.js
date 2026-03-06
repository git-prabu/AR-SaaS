import Head from 'next/head';
import { useEffect, useState } from 'react';
import SuperAdminLayout from '../../components/layout/SuperAdminLayout';
import { getAllPendingRequests, getAllRestaurants, getRequests, updateRequestStatus, updateRestaurant } from '../../lib/db';
import { uploadFile, buildModelPath, fileSizeMB } from '../../lib/storage';
import { db } from '../../lib/firebase';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import toast from 'react-hot-toast';

const S = {
  card:  { background:'#FFFFFF', border:'1px solid rgba(42,31,16,0.07)', borderRadius:20, boxShadow:'0 2px 14px rgba(42,31,16,0.06)' },
  h1:    { fontFamily:'Poppins,sans-serif', fontWeight:800, fontSize:22, color:'#1E1B18', margin:0 },
  sub:   { fontSize:13, color:'rgba(42,31,16,0.45)', marginTop:4 },
};

export default function SuperAdminRequests() {
  const [requests,   setRequests]   = useState([]);
  const [restaurants,setRestaurants]= useState([]);
  const [loading,    setLoading]    = useState(true);
  const [filter,     setFilter]     = useState('pending');
  const [expanded,   setExpanded]   = useState(null);
  const [modelFiles, setModelFiles] = useState({});
  const [uploading,  setUploading]  = useState(null);
  const [progress,   setProgress]   = useState(0);

  const load = async () => {
    setLoading(true);
    const [rests, reqs] = await Promise.all([getAllRestaurants(), getAllPendingRequests()]);
    let allReqs = [...reqs];
    if (filter !== 'pending') {
      const extras = await Promise.all(rests.map(r => getRequests(r.id, filter).then(rs => rs.map(q => ({ ...q, restaurantId:r.id, restaurantName:r.name })))));
      allReqs = extras.flat().sort((a,b) => (b.createdAt?.seconds||0)-(a.createdAt?.seconds||0));
    }
    setRestaurants(rests);
    setRequests(filter==='pending' ? reqs : allReqs);
    setLoading(false);
  };

  useEffect(() => { load(); }, [filter]);

  const handleApprove = async (req) => {
    const modelFile = modelFiles[req.id];
    if (!modelFile) { toast.error('Please attach a .glb 3D model first'); return; }
    if (!req.restaurantId) { toast.error('Restaurant ID missing'); return; }
    const rid = req.restaurantId;
    const restaurant = restaurants.find(r => r.id === rid);
    if (!restaurant) { toast.error('Restaurant not found'); return; }
    if ((restaurant.itemsUsed||0) >= (restaurant.maxItems||10)) { toast.error(`Restaurant has reached max items limit (${restaurant.maxItems})`); return; }
    const sizeMB = fileSizeMB(modelFile);
    if ((restaurant.storageUsedMB||0) + sizeMB > (restaurant.maxStorageMB||500)) { toast.error('Restaurant storage limit exceeded'); return; }
    setUploading(req.id); setProgress(0);
    try {
      const modelURL = await uploadFile(modelFile, buildModelPath(rid, modelFile.name), setProgress);
      await setDoc(doc(db,'restaurants',rid,'menuItems',req.id), {
        name:req.name, description:req.description||'', category:req.category||'',
        imageURL:req.imageURL||null, modelURL,
        ingredients:req.ingredients||[], calories:req.nutritionalData?.calories||null,
        protein:req.nutritionalData?.protein||null, carbs:req.nutritionalData?.carbs||null,
        fats:req.nutritionalData?.fats||null, prepTime:req.prepTime||null,
        views:0, arViews:0, isActive:true, createdAt:serverTimestamp(),
      });
      await updateRequestStatus(rid, req.id, 'approved', modelURL);
      await updateRestaurant(rid, { itemsUsed:(restaurant.itemsUsed||0)+1, storageUsedMB:(restaurant.storageUsedMB||0)+sizeMB });
      toast.success(`"${req.name}" approved and published!`);
      setModelFiles(f => { const n={...f}; delete n[req.id]; return n; });
      load();
    } catch (err) { toast.error('Approval failed: '+err.message); }
    finally { setUploading(null); setProgress(0); }
  };

  const handleReject = async (req) => {
    if (!confirm(`Reject "${req.name}"?`)) return;
    await updateRequestStatus(req.restaurantId, req.id, 'rejected');
    toast.success('Request rejected'); load();
  };

  const filterColors = { pending:['#F4D070','#8B6020'], approved:['#8FC4A8','#1A5A38'], rejected:['#F4A0B0','#8B1A2A'] };

  return (
    <SuperAdminLayout>
      <Head><title>Requests — Super Admin</title></Head>
      <div style={{ background:'#F2F0EC', minHeight:'100vh', padding:32, fontFamily:'Inter,sans-serif' }}>
        <div style={{ maxWidth:960, margin:'0 auto' }}>
          <style>{`@keyframes spin{to{transform:rotate(360deg)}} .upload-zone:hover{border-color:rgba(224,90,58,0.4)!important;background:#FFF8F5!important}`}</style>

          <div style={{ marginBottom:28 }}>
            <h1 style={S.h1}>Menu Requests</h1>
            <p style={S.sub}>Review, upload 3D model, and approve items for AR listing.</p>
          </div>

          {/* Filter tabs */}
          <div style={{ display:'flex', gap:6, marginBottom:22 }}>
            {['pending','approved','rejected'].map(s => {
              const [bg, color] = filterColors[s];
              return (
                <button key={s} onClick={()=>{setFilter(s);setLoading(true);}} style={{ padding:'8px 18px', borderRadius:30, border:'none', fontSize:12, fontWeight:600, cursor:'pointer', fontFamily:'Inter,sans-serif', textTransform:'capitalize', background:filter===s?'#1E1B18':'#fff', color:filter===s?'#FFF5E8':'rgba(42,31,16,0.55)', boxShadow:filter===s?'0 2px 8px rgba(30,27,24,0.18)':'0 1px 4px rgba(42,31,16,0.06)', transition:'all 0.15s' }}>
                  {s} {filter===s?`(${requests.length})`:''}
                </button>
              );
            })}
          </div>

          {loading ? (
            <div style={{ display:'flex', justifyContent:'center', paddingTop:60 }}>
              <div style={{ width:32, height:32, border:'3px solid #E05A3A', borderTopColor:'transparent', borderRadius:'50%', animation:'spin 0.8s linear infinite' }} />
            </div>
          ) : requests.length === 0 ? (
            <div style={{ textAlign:'center', padding:'60px 0', color:'rgba(42,31,16,0.4)' }}>
              <div style={{ fontSize:40, marginBottom:12 }}>📭</div>
              <p style={{ fontSize:14 }}>No {filter} requests.</p>
            </div>
          ) : (
            <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
              {requests.map(req => {
                const isExpand = expanded === req.id;
                const [badgeBg, badgeColor] = filterColors[req.status] || filterColors.pending;
                return (
                  <div key={req.id} style={{ ...S.card, overflow:'hidden', border: req.status==='pending'?'1px solid rgba(244,208,112,0.4)':'1px solid rgba(42,31,16,0.07)' }}>
                    {/* Header row */}
                    <div onClick={()=>setExpanded(isExpand?null:req.id)} style={{ display:'flex', alignItems:'center', gap:14, padding:'16px 20px', cursor:'pointer' }}>
                      <div style={{ width:48, height:48, borderRadius:14, overflow:'hidden', background:'#F2F0EC', flexShrink:0 }}>
                        {req.imageURL ? <img src={req.imageURL} alt={req.name} style={{ width:'100%', height:'100%', objectFit:'cover' }}/> : <div style={{ width:'100%', height:'100%', display:'flex', alignItems:'center', justifyContent:'center', fontSize:20 }}>🍽️</div>}
                      </div>
                      <div style={{ flex:1, minWidth:0 }}>
                        <div style={{ fontWeight:600, fontSize:14, color:'#1E1B18' }}>{req.name}</div>
                        <div style={{ fontSize:12, color:'rgba(42,31,16,0.45)', marginTop:2 }}>{req.restaurantName}</div>
                      </div>
                      <span style={{ padding:'4px 12px', borderRadius:30, fontSize:11, fontWeight:700, background:badgeBg+'33', color:badgeColor, border:`1px solid ${badgeBg}66`, textTransform:'capitalize', flexShrink:0 }}>{req.status}</span>
                      <span style={{ color:'rgba(42,31,16,0.4)', fontSize:12, marginLeft:4 }}>{isExpand?'▲':'▼'}</span>
                    </div>

                    {/* Expanded */}
                    {isExpand && (
                      <div style={{ borderTop:'1px solid rgba(42,31,16,0.06)', padding:'20px 20px 24px', background:'#FAFAF8' }}>
                        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:20 }}>
                          {/* Item info */}
                          <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
                            {[['Description',req.description],['Category',req.category],['Prep Time',req.prepTime],['Ingredients',req.ingredients?.join(', ')]].filter(([,v])=>v).map(([k,v])=>(
                              <div key={k}>
                                <div style={{ fontSize:11, color:'rgba(42,31,16,0.4)', fontWeight:600, textTransform:'uppercase', letterSpacing:'0.05em', marginBottom:4 }}>{k}</div>
                                <div style={{ fontSize:13, color:'rgba(42,31,16,0.7)', lineHeight:1.5 }}>{v}</div>
                              </div>
                            ))}
                            {req.nutritionalData && (
                              <div>
                                <div style={{ fontSize:11, color:'rgba(42,31,16,0.4)', fontWeight:600, textTransform:'uppercase', letterSpacing:'0.05em', marginBottom:8 }}>Nutrition</div>
                                <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:8 }}>
                                  {Object.entries(req.nutritionalData).map(([k,v]) => v!=null && (
                                    <div key={k} style={{ background:'#fff', borderRadius:10, padding:'8px', textAlign:'center', border:'1px solid rgba(42,31,16,0.06)' }}>
                                      <div style={{ fontFamily:'Poppins,sans-serif', fontWeight:700, fontSize:14, color:'#E05A3A' }}>{v}</div>
                                      <div style={{ fontSize:10, color:'rgba(42,31,16,0.4)', textTransform:'capitalize', marginTop:2 }}>{k}</div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>

                          {/* 3D model upload (pending only) */}
                          {req.status === 'pending' && (
                            <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
                              <div style={{ fontSize:11, color:'rgba(42,31,16,0.4)', fontWeight:600, textTransform:'uppercase', letterSpacing:'0.05em' }}>Attach 3D Model (.glb)</div>
                              <div className="upload-zone" onClick={()=>document.getElementById(`model-${req.id}`).click()} style={{ border:'2px dashed rgba(42,31,16,0.15)', borderRadius:14, padding:20, textAlign:'center', cursor:'pointer', background:'#F7F5F2', transition:'all 0.15s' }}>
                                {modelFiles[req.id] ? (
                                  <div>
                                    <div style={{ fontSize:24, marginBottom:6 }}>✅</div>
                                    <div style={{ fontSize:12, fontWeight:600, color:'#1A5A38' }}>{modelFiles[req.id].name}</div>
                                    <div style={{ fontSize:11, color:'rgba(42,31,16,0.4)', marginTop:2 }}>{fileSizeMB(modelFiles[req.id]).toFixed(1)} MB</div>
                                  </div>
                                ) : (
                                  <div>
                                    <div style={{ fontSize:28, marginBottom:6 }}>📦</div>
                                    <div style={{ fontSize:12, color:'rgba(42,31,16,0.5)' }}>Click to upload .glb model</div>
                                    <div style={{ fontSize:11, color:'rgba(42,31,16,0.35)', marginTop:2 }}>Max 10MB</div>
                                  </div>
                                )}
                                <input id={`model-${req.id}`} type="file" accept=".glb,.gltf" style={{ display:'none' }} onChange={e=>{const f=e.target.files[0];if(!f)return;if(fileSizeMB(f)>10){toast.error('Model must be under 10MB');return;}setModelFiles(p=>({...p,[req.id]:f}));}}/>
                              </div>
                              {uploading===req.id && progress>0 && (
                                <div style={{ height:4, background:'rgba(42,31,16,0.08)', borderRadius:99, overflow:'hidden' }}>
                                  <div style={{ height:'100%', borderRadius:99, background:'linear-gradient(90deg,#E05A3A,#F07050)', width:`${progress}%`, transition:'width 0.3s' }} />
                                </div>
                              )}
                              <div style={{ display:'flex', gap:10 }}>
                                <button onClick={()=>handleApprove(req)} disabled={!modelFiles[req.id]||uploading===req.id} style={{ flex:1, padding:'11px', borderRadius:12, border:'none', background:'linear-gradient(135deg,#4ABA70,#2A9A50)', color:'#fff', fontSize:13, fontWeight:700, fontFamily:'Poppins,sans-serif', cursor:'pointer', opacity:(!modelFiles[req.id]||uploading===req.id)?0.45:1 }}>
                                  {uploading===req.id?'Publishing…':'✓ Approve & Publish'}
                                </button>
                                <button onClick={()=>handleReject(req)} disabled={!!uploading} style={{ padding:'11px 16px', borderRadius:12, border:'1.5px solid rgba(244,160,176,0.5)', background:'rgba(244,160,176,0.1)', color:'#8B1A2A', fontSize:13, fontWeight:700, fontFamily:'Poppins,sans-serif', cursor:'pointer' }}>
                                  Reject
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
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
SuperAdminRequests.getLayout = (page) => page;
