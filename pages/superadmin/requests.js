import Head from 'next/head';
import { useEffect, useState } from 'react';
import SuperAdminLayout from '../../components/layout/SuperAdminLayout';
import { getAllPendingRequests, getAllRestaurants, getRequests, updateRequestStatus, updateRestaurant } from '../../lib/db';
import { uploadFile, buildModelPath, fileSizeMB } from '../../lib/storage';
import { db } from '../../lib/firebase';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import toast from 'react-hot-toast';

const G = { card:'rgba(255,255,255,0.03)', border:'rgba(255,255,255,0.07)', gold:'#B8962E', text:'rgba(255,255,255,0.82)', textDim:'rgba(255,255,255,0.32)' };
const lbl = { fontSize:11,fontWeight:600,color:'rgba(255,255,255,0.32)',letterSpacing:'0.08em',textTransform:'uppercase',marginBottom:4,fontFamily:`'DM Mono',monospace` };

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
    if ((restaurant.itemsUsed||0) >= (restaurant.maxItems||10)) { toast.error(`Restaurant has reached max items limit`); return; }
    const sizeMB = fileSizeMB(modelFile);
    if ((restaurant.storageUsedMB||0) + sizeMB > (restaurant.maxStorageMB||500)) { toast.error('Restaurant storage limit exceeded'); return; }
    setUploading(req.id); setProgress(0);
    try {
      const modelURL = await uploadFile(modelFile, buildModelPath(rid, modelFile.name), setProgress);
      await setDoc(doc(db,'restaurants',rid,'menuItems',req.id), {
        name:req.name, description:req.description||'', category:req.category||'',
        imageURL:req.imageURL||null, modelURL, ingredients:req.ingredients||[],
        calories:req.nutritionalData?.calories||null, protein:req.nutritionalData?.protein||null,
        carbs:req.nutritionalData?.carbs||null, fats:req.nutritionalData?.fats||null,
        prepTime:req.prepTime||null, views:0, arViews:0, isActive:true, createdAt:serverTimestamp(),
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

  const statusStyle = {
    pending:  { bg:'rgba(200,160,48,0.1)',  color:'#C8A030', border:'rgba(200,160,48,0.25)' },
    approved: { bg:'rgba(60,160,80,0.1)',   color:'#5DC87A', border:'rgba(60,160,80,0.25)' },
    rejected: { bg:'rgba(220,60,60,0.1)',   color:'#E05555', border:'rgba(220,60,60,0.25)' },
  };

  return (
    <SuperAdminLayout>
      <Head><title>Requests — Super Admin</title></Head>
      <div style={{minHeight:'100vh',padding:'32px 36px',fontFamily:`'Bricolage Grotesque',Inter,sans-serif`}}>
        <div style={{maxWidth:960,margin:'0 auto'}}>
          <style>{`@keyframes spin{to{transform:rotate(360deg)}} *{box-sizing:border-box} .mzone:hover{border-color:rgba(184,150,46,0.4)!important;background:rgba(184,150,46,0.03)!important}`}</style>

          <div style={{marginBottom:28}}>
            <h1 style={{fontWeight:800,fontSize:22,color:'rgba(255,255,255,0.88)',margin:0,letterSpacing:'-0.02em'}}>Menu Requests</h1>
            <p style={{fontSize:13,color:G.textDim,marginTop:4}}>Review, upload 3D model, and approve items for AR listing.</p>
          </div>

          <div style={{display:'flex',gap:6,marginBottom:22}}>
            {['pending','approved','rejected'].map(s => {
              const ss = statusStyle[s];
              return (
                <button key={s} onClick={()=>{setFilter(s);setLoading(true);}} style={{padding:'7px 16px',borderRadius:8,border:`1px solid ${filter===s?ss.border:G.border}`,fontSize:12,fontWeight:600,cursor:'pointer',fontFamily:'inherit',textTransform:'capitalize',background:filter===s?ss.bg:G.card,color:filter===s?ss.color:G.textDim,transition:'all 0.15s'}}>
                  {s} {filter===s?`(${requests.length})`:''}
                </button>
              );
            })}
          </div>

          {loading ? (
            <div style={{display:'flex',justifyContent:'center',paddingTop:60}}>
              <div style={{width:32,height:32,border:`2px solid ${G.gold}`,borderTopColor:'transparent',borderRadius:'50%',animation:'spin 0.8s linear infinite'}}/>
            </div>
          ) : requests.length === 0 ? (
            <div style={{textAlign:'center',padding:'60px 0',color:G.textDim}}>
              <div style={{fontSize:32,marginBottom:12,opacity:0.3}}>◈</div>
              <p style={{fontSize:14}}>No {filter} requests.</p>
            </div>
          ) : (
            <div style={{display:'flex',flexDirection:'column',gap:8}}>
              {requests.map(req => {
                const isExpand = expanded === req.id;
                const ss = statusStyle[req.status] || statusStyle.pending;
                return (
                  <div key={req.id} style={{background:G.card,border:`1px solid ${req.status==='pending'?'rgba(200,160,48,0.2)':G.border}`,borderRadius:12,overflow:'hidden'}}>
                    <div onClick={()=>setExpanded(isExpand?null:req.id)} style={{display:'flex',alignItems:'center',gap:14,padding:'15px 18px',cursor:'pointer'}}>
                      <div style={{width:44,height:44,borderRadius:10,overflow:'hidden',background:'rgba(255,255,255,0.05)',flexShrink:0}}>
                        {req.imageURL?<img src={req.imageURL} alt={req.name} style={{width:'100%',height:'100%',objectFit:'cover'}}/>:<div style={{width:'100%',height:'100%',display:'flex',alignItems:'center',justifyContent:'center',fontSize:18,color:G.textDim}}>⊞</div>}
                      </div>
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{fontWeight:600,fontSize:14,color:G.text}}>{req.name}</div>
                        <div style={{fontSize:12,color:G.textDim,marginTop:2}}>{req.restaurantName}</div>
                      </div>
                      <span style={{padding:'4px 12px',borderRadius:20,fontSize:11,fontWeight:600,background:ss.bg,color:ss.color,border:`1px solid ${ss.border}`,textTransform:'capitalize',flexShrink:0,fontFamily:`'DM Mono',monospace`}}>{req.status}</span>
                      <span style={{color:G.textDim,fontSize:11,marginLeft:4}}>{isExpand?'▲':'▼'}</span>
                    </div>

                    {isExpand && (
                      <div style={{borderTop:`1px solid ${G.border}`,padding:'20px 18px 22px',background:'rgba(255,255,255,0.01)'}}>
                        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:20}}>
                          <div style={{display:'flex',flexDirection:'column',gap:12}}>
                            {[['Description',req.description],['Category',req.category],['Prep Time',req.prepTime],['Ingredients',req.ingredients?.join(', ')]].filter(([,v])=>v).map(([k,v])=>(
                              <div key={k}>
                                <div style={lbl}>{k}</div>
                                <div style={{fontSize:13,color:'rgba(255,255,255,0.62)',lineHeight:1.5}}>{v}</div>
                              </div>
                            ))}
                            {req.nutritionalData && (
                              <div>
                                <div style={lbl}>Nutrition</div>
                                <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:6}}>
                                  {Object.entries(req.nutritionalData).map(([k,v]) => v!=null && (
                                    <div key={k} style={{background:'rgba(255,255,255,0.04)',borderRadius:8,padding:'8px',textAlign:'center',border:`1px solid ${G.border}`}}>
                                      <div style={{fontWeight:700,fontSize:13,color:G.gold,fontFamily:`'DM Mono',monospace`}}>{v}</div>
                                      <div style={{fontSize:10,color:G.textDim,textTransform:'capitalize',marginTop:2}}>{k}</div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>

                          {req.status === 'pending' && (
                            <div style={{display:'flex',flexDirection:'column',gap:10}}>
                              <div style={lbl}>Attach 3D Model (.glb)</div>
                              <div className="mzone" onClick={()=>document.getElementById(`model-${req.id}`).click()} style={{border:'1.5px dashed rgba(255,255,255,0.1)',borderRadius:10,padding:20,textAlign:'center',cursor:'pointer',background:'rgba(255,255,255,0.02)',transition:'all 0.15s'}}>
                                {modelFiles[req.id] ? (
                                  <div>
                                    <div style={{fontSize:20,marginBottom:6}}>✓</div>
                                    <div style={{fontSize:12,fontWeight:600,color:'#5DC87A'}}>{modelFiles[req.id].name}</div>
                                    <div style={{fontSize:11,color:G.textDim,marginTop:2,fontFamily:`'DM Mono',monospace`}}>{fileSizeMB(modelFiles[req.id]).toFixed(1)} MB</div>
                                  </div>
                                ) : (
                                  <div>
                                    <div style={{fontSize:24,marginBottom:6,opacity:0.3}}>📦</div>
                                    <div style={{fontSize:12,color:G.textDim}}>Click to upload .glb model</div>
                                    <div style={{fontSize:11,color:G.textDim,opacity:0.6,marginTop:2}}>Max 10MB</div>
                                  </div>
                                )}
                                <input id={`model-${req.id}`} type="file" accept=".glb,.gltf" style={{display:'none'}} onChange={e=>{const f=e.target.files[0];if(!f)return;if(fileSizeMB(f)>10){toast.error('Model must be under 10MB');return;}setModelFiles(p=>({...p,[req.id]:f}));}}/>
                              </div>
                              {uploading===req.id && progress>0 && (
                                <div style={{height:3,background:'rgba(255,255,255,0.06)',borderRadius:2,overflow:'hidden'}}>
                                  <div style={{height:'100%',borderRadius:2,background:G.gold,width:`${progress}%`,transition:'width 0.3s'}}/>
                                </div>
                              )}
                              <div style={{display:'flex',gap:8}}>
                                <button onClick={()=>handleApprove(req)} disabled={!modelFiles[req.id]||uploading===req.id} style={{flex:1,padding:'11px',borderRadius:8,border:'1px solid rgba(60,160,80,0.35)',background:'rgba(60,160,80,0.1)',color:'#5DC87A',fontSize:13,fontWeight:700,fontFamily:'inherit',cursor:'pointer',opacity:(!modelFiles[req.id]||uploading===req.id)?0.4:1,transition:'all 0.2s'}}>
                                  {uploading===req.id?'Publishing…':'✓ Approve & Publish'}
                                </button>
                                <button onClick={()=>handleReject(req)} disabled={!!uploading} style={{padding:'11px 16px',borderRadius:8,border:'1px solid rgba(220,60,60,0.3)',background:'rgba(220,60,60,0.07)',color:'#E05555',fontSize:13,fontWeight:700,fontFamily:'inherit',cursor:'pointer'}}>
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
