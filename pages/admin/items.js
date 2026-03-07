// pages/admin/items.js — Genesis Dark Theme v41
import Head from 'next/head';
import { useEffect, useState, useRef } from 'react';
import { useAuth } from '../../hooks/useAuth';
import AdminLayout from '../../components/layout/AdminLayout';
import { getAllMenuItems, updateMenuItem, deleteMenuItem } from '../../lib/db';
import { uploadFile, buildImagePath, fileSizeMB } from '../../lib/storage';
import toast from 'react-hot-toast';

const SPICE_LEVELS = ['None', 'Mild', 'Medium', 'Spicy', 'Very Spicy'];
const SPICE_COLORS = { None:'rgba(255,255,255,0.3)', Mild:'#C8C040', Medium:'#D08030', Spicy:'#E05555', 'Very Spicy':'#B02020' };
const OFFER_BADGES = [
  { label:"Chef's Special", color:'#9A78C8' },
  { label:'Best Seller',    color:'#B8962E' },
  { label:'Must Try',       color:'#5A9A78' },
  { label:'New',            color:'#4A80C0' },
  { label:'Limited',        color:'#C04A28' },
  { label:'Custom…',        color:'#555' },
];

const G = { card:'rgba(255,255,255,0.03)', border:'rgba(255,255,255,0.07)', gold:'#B8962E', text:'rgba(255,255,255,0.82)', textDim:'rgba(255,255,255,0.32)' };
const inp = { width:'100%', padding:'9px 12px', background:'rgba(255,255,255,0.04)', border:'1px solid rgba(255,255,255,0.09)', borderRadius:8, fontSize:13, color:'rgba(255,255,255,0.82)', outline:'none', boxSizing:'border-box', fontFamily:'inherit', colorScheme:'dark' };
const lbl = { display:'block', fontSize:10, fontWeight:600, color:'rgba(255,255,255,0.32)', letterSpacing:'0.08em', textTransform:'uppercase', marginBottom:5, fontFamily:`'DM Mono',monospace` };

export default function AdminItems() {
  const { userData } = useAuth();
  const [items,     setItems]     = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [search,    setSearch]    = useState('');
  const [catFilter, setCatFilter] = useState('all');
  const [editId,    setEditId]    = useState(null);
  const [editData,  setEditData]  = useState({});
  const [saving,    setSaving]    = useState(false);
  const [deleting,  setDeleting]  = useState(null);
  const [customBadge, setCustomBadge] = useState('');
  const [imgUpload, setImgUpload] = useState({});
  const imgInputRef = useRef({});
  const rid = userData?.restaurantId;

  const load = async () => {
    if (!rid) return;
    const data = await getAllMenuItems(rid);
    const sorted = data.sort((a,b) => { const ao=a.sortOrder??9999,bo=b.sortOrder??9999; if(ao!==bo)return ao-bo; return (a.createdAt?.seconds||0)-(b.createdAt?.seconds||0); });
    setItems(sorted); setLoading(false);
  };
  useEffect(() => { load(); }, [rid]);

  const categories = ['all', ...Array.from(new Set(items.map(i=>i.category).filter(Boolean)))];
  const filtered = items.filter(item => {
    const matchCat = catFilter==='all' || item.category===catFilter;
    const matchSearch = !search || item.name?.toLowerCase().includes(search.toLowerCase());
    return matchCat && matchSearch;
  });

  const startEdit = (item) => {
    setEditId(item.id);
    setEditData({ name:item.name||'', description:item.description||'', category:item.category||'', price:item.price||'', prepTime:item.prepTime||'', spiceLevel:item.spiceLevel||'None', offerBadge:item.offerBadge?item.offerLabel||'':'', offerLabel:item.offerLabel||'', offerColor:item.offerColor||'#B8962E', isPopular:item.isPopular||false, isFeatured:item.isFeatured||false, isActive:item.isActive!==false, sortOrder:item.sortOrder??'' });
    setCustomBadge('');
  };
  const cancelEdit = () => { setEditId(null); setEditData({}); };

  const handleImageUpload = async (item, file) => {
    if (!file) return;
    if (fileSizeMB(file) > 5) { toast.error('Image must be under 5MB'); return; }
    setImgUpload(u=>({...u,[item.id]:{uploading:true,progress:0}}));
    try {
      const path = buildImagePath(rid, file.name);
      const url  = await uploadFile(file, path, (pct)=>setImgUpload(u=>({...u,[item.id]:{uploading:true,progress:pct}})));
      await updateMenuItem(rid, item.id, { imageURL:url });
      setItems(prev=>prev.map(i=>i.id===item.id?{...i,imageURL:url}:i));
      toast.success('Cover image updated!');
    } catch (e) { toast.error('Upload failed: '+e.message); }
    finally { setImgUpload(u=>({...u,[item.id]:{uploading:false,progress:0}})); }
  };

  const saveEdit = async () => {
    if (!editData.name?.trim()) { toast.error('Item name required'); return; }
    setSaving(true);
    try {
      const finalLabel = editData.offerBadge === 'Custom…' ? customBadge : editData.offerBadge;
      await updateMenuItem(rid, editId, { ...editData, offerLabel:finalLabel||'', offerBadge:!!finalLabel, sortOrder:editData.sortOrder!==''?Number(editData.sortOrder):null, price:editData.price!==''?Number(editData.price):null });
      toast.success('Item updated!'); setEditId(null); await load();
    } catch (e) { toast.error('Failed to save: '+e.message); }
    finally { setSaving(false); }
  };

  const handleDelete = async (item) => {
    if (!confirm(`Delete "${item.name}"? This cannot be undone.`)) return;
    setDeleting(item.id);
    try { await deleteMenuItem(rid, item.id); toast.success(`"${item.name}" deleted`); await load(); }
    catch { toast.error('Delete failed'); }
    finally { setDeleting(null); }
  };

  const moveItem = async (item, direction) => {
    const idx = filtered.findIndex(i=>i.id===item.id);
    const swapIdx = direction==='up'?idx-1:idx+1;
    if (swapIdx<0||swapIdx>=filtered.length) return;
    const swapItem = filtered[swapIdx];
    await Promise.all([updateMenuItem(rid,item.id,{sortOrder:swapItem.sortOrder??swapIdx}),updateMenuItem(rid,swapItem.id,{sortOrder:item.sortOrder??idx})]);
    await load();
  };

  const toggleActive = async (item) => { await updateMenuItem(rid,item.id,{isActive:!item.isActive}); await load(); };

  return (
    <AdminLayout>
      <Head><title>Menu Items — Advert Radical</title></Head>
      <div style={{minHeight:'100vh',padding:'32px 36px',fontFamily:`'Bricolage Grotesque',Inter,sans-serif`}}>
        <div style={{maxWidth:1000,margin:'0 auto'}}>
          <style>{`@keyframes spin{to{transform:rotate(360deg)}} *{box-sizing:border-box} .iinp:focus{border-color:rgba(184,150,46,0.5)!important;outline:none} .iinp::placeholder{color:rgba(255,255,255,0.18)} .item-row:hover{background:rgba(255,255,255,0.02)!important}`}</style>

          <div style={{display:'flex',alignItems:'flex-start',justifyContent:'space-between',marginBottom:24,flexWrap:'wrap',gap:12}}>
            <div>
              <h1 style={{fontWeight:800,fontSize:22,color:'rgba(255,255,255,0.88)',margin:0,letterSpacing:'-0.02em'}}>Menu Items</h1>
              <p style={{fontSize:13,color:G.textDim,marginTop:4}}>Manage, edit, reorder and add offers to your approved AR menu items.</p>
            </div>
            <div style={{padding:'8px 16px',borderRadius:8,background:'rgba(60,160,80,0.08)',border:'1px solid rgba(60,160,80,0.2)',fontSize:12,fontWeight:600,color:'#5DC87A',fontFamily:`'DM Mono',monospace`}}>
              {items.filter(i=>i.isActive).length} active · {items.length} total
            </div>
          </div>

          <div style={{display:'flex',gap:10,marginBottom:16,flexWrap:'wrap'}}>
            <div style={{position:'relative',flex:1,minWidth:200}}>
              <input className="iinp" style={{...inp,paddingLeft:32}} value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search items…"/>
              <span style={{position:'absolute',left:10,top:'50%',transform:'translateY(-50%)',color:G.textDim,fontSize:13,pointerEvents:'none'}}>⌕</span>
            </div>
            <div style={{display:'flex',gap:5,flexWrap:'wrap'}}>
              {categories.map(c=>(
                <button key={c} onClick={()=>setCatFilter(c)} style={{padding:'8px 14px',borderRadius:8,border:`1px solid ${catFilter===c?'rgba(184,150,46,0.3)':G.border}`,fontSize:12,fontWeight:600,cursor:'pointer',fontFamily:'inherit',textTransform:'capitalize',background:catFilter===c?'rgba(184,150,46,0.1)':G.card,color:catFilter===c?G.gold:G.textDim,transition:'all 0.15s'}}>
                  {c==='all'?`All (${items.length})`:c}
                </button>
              ))}
            </div>
          </div>

          {loading ? (
            <div style={{display:'flex',justifyContent:'center',paddingTop:60}}>
              <div style={{width:32,height:32,border:`2px solid ${G.gold}`,borderTopColor:'transparent',borderRadius:'50%',animation:'spin 0.8s linear infinite'}}/>
            </div>
          ) : filtered.length === 0 ? (
            <div style={{textAlign:'center',padding:'60px 0',color:G.textDim}}>
              <div style={{fontSize:32,marginBottom:12,opacity:0.3}}>⊞</div>
              <p style={{fontSize:14}}>No items yet. Submit a request to get AR items approved.</p>
            </div>
          ) : (
            <div style={{background:G.card,border:`1px solid ${G.border}`,borderRadius:12,overflow:'hidden'}}>
              <div style={{display:'grid',gridTemplateColumns:'36px 48px 1fr 90px 90px 80px 90px 120px',gap:0,padding:'10px 16px',borderBottom:`1px solid ${G.border}`,background:'rgba(255,255,255,0.02)'}}>
                {['↕','','Item','Category','Prep','Spice','Status','Actions'].map(h=>(
                  <div key={h} style={{fontSize:10,fontWeight:600,color:G.textDim,letterSpacing:'0.08em',textTransform:'uppercase',fontFamily:`'DM Mono',monospace`}}>{h}</div>
                ))}
              </div>

              {filtered.map((item,idx) => {
                const isEdit = editId === item.id;
                return (
                  <div key={item.id}>
                    <div className="item-row" style={{display:'grid',gridTemplateColumns:'36px 48px 1fr 90px 90px 80px 90px 120px',gap:0,padding:'12px 16px',borderBottom:isEdit?'none':`1px solid ${G.border}`,alignItems:'center',background:'transparent',transition:'background 0.12s',opacity:item.isActive?1:0.45}}>

                      <div style={{display:'flex',flexDirection:'column',gap:2}}>
                        <button onClick={()=>moveItem(item,'up')} disabled={idx===0} style={{width:20,height:20,borderRadius:5,border:`1px solid ${G.border}`,background:'transparent',cursor:'pointer',fontSize:9,color:G.textDim,opacity:idx===0?0.2:0.7,display:'flex',alignItems:'center',justifyContent:'center'}}>▲</button>
                        <button onClick={()=>moveItem(item,'down')} disabled={idx===filtered.length-1} style={{width:20,height:20,borderRadius:5,border:`1px solid ${G.border}`,background:'transparent',cursor:'pointer',fontSize:9,color:G.textDim,opacity:idx===filtered.length-1?0.2:0.7,display:'flex',alignItems:'center',justifyContent:'center'}}>▼</button>
                      </div>

                      <div style={{width:40,height:40,borderRadius:8,overflow:'hidden',background:'rgba(255,255,255,0.05)',flexShrink:0}}>
                        {item.imageURL?<img src={item.imageURL} alt={item.name} style={{width:'100%',height:'100%',objectFit:'cover'}}/>:<div style={{width:'100%',height:'100%',display:'flex',alignItems:'center',justifyContent:'center',fontSize:16,color:G.textDim}}>⊞</div>}
                      </div>

                      <div style={{minWidth:0,paddingRight:8}}>
                        <div style={{display:'flex',alignItems:'center',gap:5,flexWrap:'wrap'}}>
                          <span style={{fontWeight:600,fontSize:13,color:G.text,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{item.name}</span>
                          {item.isPopular && <span style={{fontSize:9,fontWeight:700,color:G.gold,background:'rgba(184,150,46,0.12)',borderRadius:20,padding:'2px 7px',flexShrink:0,fontFamily:`'DM Mono',monospace`}}>✦ Popular</span>}
                          {item.offerBadge && item.offerLabel && <span style={{fontSize:9,fontWeight:700,color:'#fff',background:item.offerColor||G.gold,borderRadius:20,padding:'2px 7px',flexShrink:0}}>🏷 {item.offerLabel}</span>}
                        </div>
                        {item.description && <div style={{fontSize:11,color:G.textDim,marginTop:2,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{item.description}</div>}
                        <div style={{display:'flex',gap:8,marginTop:2}}>
                          {item.price && <span style={{fontSize:11,fontWeight:600,color:G.gold,fontFamily:`'DM Mono',monospace`}}>₹{item.price}</span>}
                          <span style={{fontSize:10,color:G.textDim,fontFamily:`'DM Mono',monospace`}}>{(item.views||0)+(item.arViews||0)} views</span>
                        </div>
                      </div>

                      <div style={{fontSize:11,color:G.textDim,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{item.category||'—'}</div>
                      <div style={{fontSize:11,color:G.textDim}}>{item.prepTime?item.prepTime:'—'}</div>

                      <div>
                        {item.spiceLevel && item.spiceLevel!=='None'
                          ? <span style={{fontSize:9,fontWeight:700,padding:'2px 7px',borderRadius:20,background:(SPICE_COLORS[item.spiceLevel]||'#ccc')+'22',color:SPICE_COLORS[item.spiceLevel]||'#999',border:`1px solid ${(SPICE_COLORS[item.spiceLevel]||'#ccc')}44`,fontFamily:`'DM Mono',monospace`}}>{item.spiceLevel}</span>
                          : <span style={{fontSize:10,color:G.textDim}}>—</span>}
                      </div>

                      <div style={{display:'flex',alignItems:'center',gap:6}}>
                        <div onClick={()=>toggleActive(item)} style={{width:32,height:18,borderRadius:99,background:item.isActive?'rgba(60,160,80,0.5)':'rgba(255,255,255,0.1)',cursor:'pointer',position:'relative',transition:'background 0.2s',flexShrink:0}}>
                          <div style={{width:12,height:12,borderRadius:'50%',background:'#fff',position:'absolute',top:3,left:item.isActive?17:3,transition:'left 0.2s'}}/>
                        </div>
                        <span style={{fontSize:10,color:G.textDim}}>{item.isActive?'On':'Off'}</span>
                      </div>

                      <div style={{display:'flex',gap:5}}>
                        <button onClick={()=>isEdit?cancelEdit():startEdit(item)} style={{padding:'5px 10px',borderRadius:6,border:`1px solid ${isEdit?'rgba(220,60,60,0.3)':G.border}`,background:isEdit?'rgba(220,60,60,0.07)':'transparent',color:isEdit?'#E05555':G.textDim,fontSize:11,fontWeight:600,cursor:'pointer',transition:'all 0.12s'}}>{isEdit?'Cancel':'Edit'}</button>
                        <button onClick={()=>handleDelete(item)} disabled={deleting===item.id} style={{padding:'5px 8px',borderRadius:6,border:'1px solid rgba(220,60,60,0.2)',background:'transparent',color:'rgba(220,80,80,0.6)',fontSize:11,fontWeight:600,cursor:'pointer',opacity:deleting===item.id?0.4:1}}>{deleting===item.id?'…':'✕'}</button>
                      </div>
                    </div>

                    {isEdit && (
                      <div style={{background:'rgba(255,255,255,0.01)',borderBottom:`1px solid ${G.border}`,padding:'18px 16px 22px'}}>
                        <div style={{fontWeight:700,fontSize:13,color:'rgba(255,255,255,0.6)',marginBottom:16}}>Editing: {item.name}</div>

                        <div style={{background:'rgba(255,255,255,0.03)',border:`1px solid ${G.border}`,borderRadius:10,padding:16,marginBottom:14}}>
                          <label style={{...lbl,marginBottom:10}}>Cover Image</label>
                          <div style={{display:'flex',alignItems:'center',gap:12}}>
                            <div style={{width:60,height:60,borderRadius:10,overflow:'hidden',background:'rgba(255,255,255,0.05)',flexShrink:0}}>
                              {item.imageURL?<img src={item.imageURL} alt={item.name} style={{width:'100%',height:'100%',objectFit:'cover'}}/>:<div style={{width:'100%',height:'100%',display:'flex',alignItems:'center',justifyContent:'center',fontSize:24,color:G.textDim}}>⊞</div>}
                            </div>
                            <div>
                              <div style={{fontSize:11,color:G.textDim,marginBottom:8}}>JPG, PNG · Max 5MB</div>
                              <input type="file" accept="image/*" style={{display:'none'}} ref={el=>{if(el)imgInputRef.current[item.id]=el;}} onChange={e=>handleImageUpload(item,e.target.files[0])}/>
                              <button onClick={()=>imgInputRef.current[item.id]?.click()} disabled={imgUpload[item.id]?.uploading} style={{padding:'7px 14px',borderRadius:7,border:`1px solid ${G.border}`,background:'transparent',fontSize:11,fontWeight:600,color:G.textDim,cursor:'pointer',opacity:imgUpload[item.id]?.uploading?0.6:1}}>
                                {imgUpload[item.id]?.uploading?`Uploading ${imgUpload[item.id].progress}%…`:item.imageURL?'↑ Replace':'↑ Upload'}
                              </button>
                            </div>
                          </div>
                          {imgUpload[item.id]?.uploading && <div style={{height:3,background:'rgba(255,255,255,0.06)',borderRadius:2,overflow:'hidden',marginTop:10}}><div style={{height:'100%',background:G.gold,borderRadius:2,width:`${imgUpload[item.id].progress}%`,transition:'width 0.2s'}}/></div>}
                        </div>

                        <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:12,marginBottom:12}}>
                          <div><label style={lbl}>Item Name *</label><input className="iinp" style={inp} value={editData.name} onChange={e=>setEditData(d=>({...d,name:e.target.value}))}/></div>
                          <div><label style={lbl}>Category</label><input className="iinp" style={inp} value={editData.category} onChange={e=>setEditData(d=>({...d,category:e.target.value}))} placeholder="e.g. Main Course"/></div>
                          <div><label style={lbl}>Price (₹)</label><input className="iinp" style={inp} type="number" min="0" value={editData.price} onChange={e=>setEditData(d=>({...d,price:e.target.value}))} placeholder="299"/></div>
                        </div>
                        <div style={{marginBottom:12}}>
                          <label style={lbl}>Description</label>
                          <textarea className="iinp" style={{...inp,resize:'none'}} rows={2} value={editData.description} onChange={e=>setEditData(d=>({...d,description:e.target.value}))} placeholder="Short description…"/>
                        </div>
                        <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:12,marginBottom:12}}>
                          <div><label style={lbl}>Prep Time</label><input className="iinp" style={inp} value={editData.prepTime} onChange={e=>setEditData(d=>({...d,prepTime:e.target.value}))} placeholder="10–15 minutes"/></div>
                          <div><label style={lbl}>Spice Level</label><select className="iinp" style={inp} value={editData.spiceLevel} onChange={e=>setEditData(d=>({...d,spiceLevel:e.target.value}))}>{SPICE_LEVELS.map(s=><option key={s} value={s}>{s}</option>)}</select></div>
                          <div><label style={lbl}>Priority Order</label><input className="iinp" style={inp} type="number" min="1" value={editData.sortOrder} onChange={e=>setEditData(d=>({...d,sortOrder:e.target.value}))} placeholder="1 = first"/></div>
                        </div>

                        <div style={{background:'rgba(255,255,255,0.03)',border:`1px solid ${G.border}`,borderRadius:10,padding:14,marginBottom:14}}>
                          <label style={{...lbl,marginBottom:10}}>Offer / Badge</label>
                          <div style={{display:'flex',gap:6,flexWrap:'wrap',marginBottom:editData.offerBadge==='Custom…'?10:0}}>
                            <button onClick={()=>setEditData(d=>({...d,offerBadge:'',offerLabel:''}))} style={{padding:'5px 12px',borderRadius:20,border:`1px solid ${!editData.offerBadge?'rgba(255,255,255,0.25)':G.border}`,background:!editData.offerBadge?'rgba(255,255,255,0.08)':'transparent',fontSize:11,fontWeight:600,color:!editData.offerBadge?G.text:G.textDim,cursor:'pointer'}}>None</button>
                            {OFFER_BADGES.map(b=>(
                              <button key={b.label} onClick={()=>setEditData(d=>({...d,offerBadge:b.label,offerLabel:b.label==='Custom…'?d.offerLabel:b.label,offerColor:b.color}))} style={{padding:'5px 12px',borderRadius:20,border:`1px solid ${editData.offerBadge===b.label?b.color+'88':G.border}`,background:editData.offerBadge===b.label?b.color+'22':'transparent',fontSize:11,fontWeight:700,color:editData.offerBadge===b.label?b.color:G.textDim,cursor:'pointer'}}>
                                {b.label}
                              </button>
                            ))}
                          </div>
                          {editData.offerBadge==='Custom…' && <input className="iinp" style={{...inp,marginTop:8}} value={customBadge} onChange={e=>setCustomBadge(e.target.value)} placeholder="e.g. '30% Off Tonight'"/>}
                        </div>

                        <div style={{display:'flex',gap:10,marginBottom:18,flexWrap:'wrap'}}>
                          {[['isPopular','✦ Popular','Show popular badge'],['isFeatured','⭐ Featured','Top of category'],['isActive','◐ Visible','Visible on menu']].map(([key,title,desc])=>(
                            <div key={key} onClick={()=>setEditData(d=>({...d,[key]:!d[key]}))} style={{display:'flex',alignItems:'center',gap:8,padding:'8px 14px',borderRadius:8,border:`1px solid ${editData[key]?'rgba(184,150,46,0.3)':G.border}`,background:editData[key]?'rgba(184,150,46,0.07)':'transparent',cursor:'pointer',transition:'all 0.15s'}}>
                              <div style={{width:28,height:16,borderRadius:99,background:editData[key]?'rgba(60,160,80,0.5)':'rgba(255,255,255,0.1)',position:'relative',transition:'background 0.2s',flexShrink:0}}>
                                <div style={{width:10,height:10,borderRadius:'50%',background:'#fff',position:'absolute',top:3,left:editData[key]?15:3,transition:'left 0.2s'}}/>
                              </div>
                              <div>
                                <div style={{fontSize:11,fontWeight:700,color:editData[key]?G.gold:G.text}}>{title}</div>
                                <div style={{fontSize:10,color:G.textDim}}>{desc}</div>
                              </div>
                            </div>
                          ))}
                        </div>

                        <div style={{display:'flex',gap:8}}>
                          <button onClick={saveEdit} disabled={saving} style={{padding:'10px 22px',borderRadius:8,border:`1px solid rgba(184,150,46,${saving?'0.15':'0.35'})`,background:saving?'transparent':'rgba(184,150,46,0.1)',color:saving?G.textDim:G.gold,fontSize:13,fontWeight:700,cursor:saving?'not-allowed':'pointer',fontFamily:'inherit',transition:'all 0.2s'}}>
                            {saving?'Saving…':'Save Changes'}
                          </button>
                          <button onClick={cancelEdit} style={{padding:'10px 18px',borderRadius:8,border:`1px solid ${G.border}`,background:'transparent',fontSize:12,fontWeight:600,color:G.textDim,cursor:'pointer',fontFamily:'inherit'}}>Cancel</button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {!loading && items.length > 0 && (
            <div style={{background:G.card,border:`1px solid ${G.border}`,borderRadius:12,padding:24,marginTop:16}}>
              <div style={{fontWeight:700,fontSize:14,color:'rgba(255,255,255,0.6)',marginBottom:16}}>Most Popular Items</div>
              <div style={{display:'flex',flexDirection:'column',gap:10}}>
                {[...items].sort((a,b)=>((b.views||0)+(b.arViews||0)*2)-((a.views||0)+(a.arViews||0)*2)).slice(0,5).map((item,i)=>{
                  const score=(item.views||0)+(item.arViews||0)*2;
                  const maxScore=Math.max(...items.map(x=>(x.views||0)+(x.arViews||0)*2),1);
                  const pct=Math.max(8,Math.round((score/maxScore)*100));
                  return (
                    <div key={item.id} style={{display:'flex',alignItems:'center',gap:10}}>
                      <span style={{fontSize:10,color:G.textDim,width:16,textAlign:'right',flexShrink:0,fontFamily:`'DM Mono',monospace`}}>#{i+1}</span>
                      <div style={{width:30,height:30,borderRadius:7,overflow:'hidden',background:'rgba(255,255,255,0.05)',flexShrink:0}}>
                        {item.imageURL?<img src={item.imageURL} alt={item.name} style={{width:'100%',height:'100%',objectFit:'cover'}}/>:<span style={{fontSize:14,lineHeight:'30px',display:'block',textAlign:'center',color:G.textDim}}>⊞</span>}
                      </div>
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{display:'flex',justifyContent:'space-between',marginBottom:4}}>
                          <span style={{fontSize:12,fontWeight:500,color:G.text,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{item.name}</span>
                          <span style={{fontSize:10,color:G.textDim,flexShrink:0,marginLeft:8,fontFamily:`'DM Mono',monospace`}}>{item.views||0} · {item.arViews||0} AR</span>
                        </div>
                        <div style={{height:3,background:'rgba(255,255,255,0.06)',borderRadius:2,overflow:'hidden'}}>
                          <div style={{height:'100%',borderRadius:2,background:i===0?G.gold:i===1?'rgba(184,150,46,0.5)':'rgba(255,255,255,0.15)',width:`${pct}%`}}/>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </AdminLayout>
  );
}
AdminItems.getLayout = (page) => page;
