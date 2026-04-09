import Head from 'next/head';
import { useEffect, useState } from 'react';
import { useAuth } from '../../hooks/useAuth';
import AdminLayout from '../../components/layout/AdminLayout';
import { getCombos, createCombo, updateCombo, deleteCombo, getMenuItems } from '../../lib/db';
import toast from 'react-hot-toast';

const S = {
  card:  { background:'#FFFFFF', border:'1px solid rgba(38,52,49,0.07)', borderRadius:20, boxShadow:'0 2px 14px rgba(38,52,49,0.06)', padding:24 },
  h1:    { fontFamily:"'Playfair Display', Georgia, serif", fontWeight:800, fontSize:24, color:'#263431', margin:0, letterSpacing:'-0.3px' },
  sub:   { fontSize:13, color:'rgba(38,52,49,0.45)', marginTop:4 },
  label: { display:'block', fontSize:11, fontWeight:600, color:'rgba(38,52,49,0.5)', letterSpacing:'0.05em', textTransform:'uppercase', marginBottom:6 },
  input: { width:'100%', padding:'11px 14px', background:'#F7F5F2', border:'1.5px solid rgba(38,52,49,0.09)', borderRadius:12, fontSize:14, color:'#263431', fontFamily:'Inter,sans-serif', outline:'none', boxSizing:'border-box' },
};

const EMPTY = { name:'', description:'', comboPrice:'', itemIds:[], tag:'', isActive:true };

export default function AdminCombos() {
  const { userData } = useAuth();
  const [combos,   setCombos]   = useState([]);
  const [items,    setItems]    = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editId,   setEditId]   = useState(null);
  const [form,     setForm]     = useState(EMPTY);
  const [saving,   setSaving]   = useState(false);
  const [deleting, setDeleting] = useState(null);
  const rid = userData?.restaurantId;

  const load = async () => {
    if (!rid) return;
    const [c, m] = await Promise.all([getCombos(rid), getMenuItems(rid)]);
    setCombos(c);
    setItems(m.filter(i => i.isActive !== false));
    setLoading(false);
  };

  useEffect(() => { load(); }, [rid]);

  const openNew  = () => { setForm(EMPTY); setEditId(null); setShowForm(true); };
  const openEdit = (c) => {
    setForm({ name:c.name||'', description:c.description||'', comboPrice:c.comboPrice||'', itemIds:c.itemIds||[], tag:c.tag||'', isActive:c.isActive!==false });
    setEditId(c.id); setShowForm(true);
  };

  const toggleItem = (id) =>
    setForm(f => ({ ...f, itemIds: f.itemIds.includes(id) ? f.itemIds.filter(x=>x!==id) : [...f.itemIds, id] }));

  const originalTotal = form.itemIds.reduce((sum, id) => {
    const item = items.find(i => i.id === id);
    return sum + (item?.price || 0);
  }, 0);
  const savings = originalTotal - (Number(form.comboPrice) || 0);

  const handleSave = async () => {
    if (!form.name.trim())       { toast.error('Combo name is required'); return; }
    if (form.itemIds.length < 2) { toast.error('Select at least 2 items for the combo'); return; }
    if (!form.comboPrice || isNaN(form.comboPrice) || Number(form.comboPrice) <= 0) {
      toast.error('Enter a valid combo price'); return;
    }
    setSaving(true);
    try {
      const payload = {
        name:          form.name.trim(),
        description:   form.description.trim(),
        comboPrice:    Number(form.comboPrice),
        itemIds:       form.itemIds,
        tag:           form.tag.trim(),
        isActive:      form.isActive,
        originalPrice: originalTotal,
        savings:       Math.max(0, savings),
      };
      if (editId) { await updateCombo(rid, editId, payload); toast.success('Combo updated!'); }
      else        { await createCombo(rid, payload);          toast.success('Combo created!'); }
      setShowForm(false); setEditId(null); await load();
    } catch (e) { toast.error('Failed to save: ' + e.message); }
    finally { setSaving(false); }
  };

  const handleDelete = async (c) => {
    if (!confirm(`Delete combo "${c.name}"?`)) return;
    setDeleting(c.id);
    try { await deleteCombo(rid, c.id); toast.success('Combo deleted'); await load(); }
    catch { toast.error('Delete failed'); }
    finally { setDeleting(null); }
  };

  const toggleActive = async (c) => {
    try { await updateCombo(rid, c.id, { isActive: !c.isActive }); toast.success(c.isActive ? 'Combo hidden' : 'Combo visible'); await load(); }
    catch { toast.error('Update failed'); }
  };

  if (loading) return (
    <AdminLayout>
      <div style={{display:'flex',alignItems:'center',justifyContent:'center',height:300}}>
        <div style={{width:36,height:36,border:'3px solid #C4A86D',borderTopColor:'transparent',borderRadius:'50%',animation:'spin 0.8s linear infinite'}}/>
        <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      </div>
    </AdminLayout>
  );

  return (
    <AdminLayout>
      <Head><title>Combo Builder — Advert Radical</title></Head>
      <div style={{padding:32,maxWidth:960,margin:'0 auto'}}>

        {/* Header */}
        <div style={{display:'flex',alignItems:'flex-start',justifyContent:'space-between',marginBottom:28,gap:12,flexWrap:'wrap'}}>
          <div>
            <h1 style={S.h1}>🍱 Smart Combo Builder</h1>
            <p style={S.sub}>Bundle dishes at a special price — shown as a highlighted section at the top of your menu</p>
          </div>
          <button onClick={openNew} style={{padding:'11px 22px',borderRadius:10,border:'none',background:'#263431',color:'#EAE7E3',fontSize:14,fontWeight:700,fontFamily:'Outfit, sans-serif',cursor:'pointer',transition:'all 0.15s'}}>
            ＋ New Combo
          </button>
        </div>

        {/* Empty state */}
        {combos.length === 0 && !showForm && (
          <div style={{...S.card,background:'rgba(196,168,109,0.04)',border:'1.5px solid rgba(196,168,109,0.2)',textAlign:'center',padding:48}}>
            <div style={{fontSize:48,marginBottom:12}}>🍱</div>
            <div style={{fontFamily:"'Playfair Display', Georgia, serif",fontWeight:700,fontSize:17,color:'#263431',marginBottom:8}}>No combos yet</div>
            <div style={{fontSize:13,color:'rgba(38,52,49,0.5)',maxWidth:380,margin:'0 auto 20px'}}>
              Create your first combo — e.g. "Lunch Deal: Biryani + Raita + Mocktail for ₹599". It appears as a special card at the top of your menu, increasing average order value.
            </div>
            <button onClick={openNew} style={{padding:'11px 24px',borderRadius:10,border:'none',background:'#C4A86D',color:'#fff',fontSize:14,fontWeight:700,fontFamily:'Outfit, sans-serif',cursor:'pointer',transition:'all 0.15s'}}>
              Create First Combo
            </button>
          </div>
        )}

        {/* Form */}
        {showForm && (
          <div style={{...S.card,marginBottom:24,border:'1.5px solid rgba(196,168,109,0.3)'}}>
            <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:20}}>
              <h2 style={{fontFamily:"'Playfair Display', Georgia, serif",fontWeight:700,fontSize:18,color:'#263431',margin:0}}>
                {editId ? 'Edit Combo' : 'New Combo'}
              </h2>
              <button onClick={()=>{setShowForm(false);setEditId(null);}} style={{background:'none',border:'none',fontSize:20,cursor:'pointer',color:'rgba(38,52,49,0.4)'}}>✕</button>
            </div>

            <div style={{display:'grid',gridTemplateColumns:'2fr 1fr',gap:14,marginBottom:16}}>
              <div>
                <label style={S.label}>Combo Name <span style={{color:'#8A4A42'}}>*</span></label>
                <input style={S.input} value={form.name} onChange={e=>setForm(f=>({...f,name:e.target.value}))} placeholder="e.g. Lunch Deal, Family Pack" />
              </div>
              <div>
                <label style={S.label}>Badge Tag</label>
                <input style={S.input} value={form.tag} onChange={e=>setForm(f=>({...f,tag:e.target.value}))} placeholder="e.g. Best Value" />
              </div>
            </div>

            <div style={{marginBottom:16}}>
              <label style={S.label}>Short Description</label>
              <input style={S.input} value={form.description} onChange={e=>setForm(f=>({...f,description:e.target.value}))} placeholder="e.g. Perfect for 2 — starter, main, and dessert." />
            </div>

            <div style={{marginBottom:16}}>
              <label style={S.label}>Select Items <span style={{color:'#8A4A42'}}>*</span> <span style={{fontWeight:400,textTransform:'none',letterSpacing:0,fontSize:11}}>— pick at least 2</span></label>
              <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(190px,1fr))',gap:8,maxHeight:240,overflowY:'auto',padding:4}}>
                {items.map(item => {
                  const sel = form.itemIds.includes(item.id);
                  return (
                    <div key={item.id} onClick={()=>toggleItem(item.id)} style={{
                      padding:'10px 12px',borderRadius:12,cursor:'pointer',transition:'all 0.15s',
                      border:`1.5px solid ${sel?'rgba(196,168,109,0.6)':'rgba(38,52,49,0.1)'}`,
                      background:sel?'rgba(196,168,109,0.07)':'#F7F5F2',
                      display:'flex',alignItems:'center',gap:8
                    }}>
                      <div style={{width:18,height:18,borderRadius:5,border:`2px solid ${sel?'#C4A86D':'rgba(38,52,49,0.2)'}`,background:sel?'#C4A86D':'transparent',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0,transition:'all 0.15s'}}>
                        {sel && <span style={{color:'#fff',fontSize:11,fontWeight:900,lineHeight:1}}>✓</span>}
                      </div>
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{fontSize:13,fontWeight:600,color:'#263431',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{item.name}</div>
                        <div style={{fontSize:11,color:'rgba(38,52,49,0.45)'}}>{item.category||'—'} · ₹{item.price||'—'}</div>
                      </div>
                    </div>
                  );
                })}
                {items.length === 0 && <div style={{padding:20,color:'rgba(38,52,49,0.4)',fontSize:13,gridColumn:'1/-1'}}>No active items found.</div>}
              </div>
            </div>

            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:14,marginBottom:16,alignItems:'start'}}>
              <div>
                <label style={S.label}>Combo Price (₹) <span style={{color:'#8A4A42'}}>*</span></label>
                <input style={S.input} type="number" min="0" value={form.comboPrice} onChange={e=>setForm(f=>({...f,comboPrice:e.target.value}))} placeholder="e.g. 599" />
              </div>
              <div style={{padding:'22px 0 0'}}>
                <div style={{fontSize:12,color:'rgba(38,52,49,0.45)',marginBottom:2}}>Original total</div>
                <div style={{fontSize:18,fontWeight:700,color:'#263431',fontFamily:'Outfit, sans-serif'}}>₹{originalTotal}</div>
              </div>
              <div style={{padding:'22px 0 0'}}>
                <div style={{fontSize:12,color:'rgba(38,52,49,0.45)',marginBottom:2}}>Customer saves</div>
                <div style={{fontSize:18,fontWeight:700,color:savings>0?'#4A7A5E':'rgba(38,52,49,0.3)',fontFamily:'Outfit, sans-serif'}}>{savings>0?`₹${savings}`:'—'}</div>
              </div>
            </div>

            <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:20}}>
              <div onClick={()=>setForm(f=>({...f,isActive:!f.isActive}))} style={{width:38,height:20,borderRadius:99,background:form.isActive?'#4A7A5E':'rgba(38,52,49,0.15)',position:'relative',cursor:'pointer',transition:'background 0.2s',flexShrink:0}}>
                <div style={{width:14,height:14,borderRadius:'50%',background:'#fff',position:'absolute',top:3,left:form.isActive?21:3,transition:'left 0.2s',boxShadow:'0 1px 3px rgba(0,0,0,0.2)'}}/>
              </div>
              <span style={{fontSize:13,fontWeight:600,color:'#263431'}}>Visible on menu</span>
            </div>

            <div style={{display:'flex',gap:10}}>
              <button onClick={handleSave} disabled={saving} style={{padding:'11px 28px',borderRadius:10,border:'none',background:'#263431',color:'#EAE7E3',fontSize:14,fontWeight:700,fontFamily:'Outfit, sans-serif',cursor:'pointer',opacity:saving?0.6:1,transition:'all 0.15s'}}>
                {saving?'Saving…':editId?'Update Combo':'Create Combo'}
              </button>
              <button onClick={()=>{setShowForm(false);setEditId(null);}} style={{padding:'11px 20px',borderRadius:10,border:'1.5px solid rgba(38,52,49,0.12)',background:'transparent',fontSize:14,fontWeight:600,fontFamily:'Outfit, sans-serif',cursor:'pointer',color:'rgba(38,52,49,0.6)',transition:'all 0.15s'}}>
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Combo list */}
        {combos.length > 0 && (
          <div style={{display:'flex',flexDirection:'column',gap:14}}>
            {combos.map(c => {
              const comboItems = (c.itemIds||[]).map(id=>items.find(i=>i.id===id)).filter(Boolean);
              return (
                <div key={c.id} style={{...S.card,opacity:c.isActive?1:0.65,transition:'opacity 0.2s'}}>
                  <div style={{display:'flex',alignItems:'flex-start',justifyContent:'space-between',gap:12,flexWrap:'wrap'}}>
                    <div style={{flex:1,minWidth:200}}>
                      <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:6,flexWrap:'wrap'}}>
                        <span style={{fontFamily:"'Playfair Display', Georgia, serif",fontWeight:700,fontSize:16,color:'#263431'}}>{c.name}</span>
                        {c.tag && <span style={{padding:'3px 10px',borderRadius:20,background:'rgba(196,168,109,0.12)',color:'#A06010',fontSize:11,fontWeight:700,border:'1px solid rgba(196,168,109,0.25)'}}>{c.tag}</span>}
                        {!c.isActive && <span style={{padding:'3px 10px',borderRadius:20,background:'rgba(38,52,49,0.06)',color:'rgba(38,52,49,0.4)',fontSize:11,fontWeight:700}}>Hidden</span>}
                      </div>
                      {c.description && <div style={{fontSize:13,color:'rgba(38,52,49,0.55)',marginBottom:10}}>{c.description}</div>}
                      <div style={{display:'flex',flexWrap:'wrap',gap:6,marginBottom:10}}>
                        {comboItems.map(item=>(
                          <span key={item.id} style={{padding:'4px 10px',borderRadius:20,background:'#F5E6D3',fontSize:12,fontWeight:500,color:'#4A3020'}}>{item.name}</span>
                        ))}
                      </div>
                      <div style={{display:'flex',alignItems:'center',gap:14,flexWrap:'wrap'}}>
                        <span style={{fontFamily:'Outfit, sans-serif',fontWeight:800,fontSize:20,color:'#8A4A42'}}>₹{c.comboPrice}</span>
                        {c.originalPrice > c.comboPrice && (
                          <span style={{fontSize:12,color:'rgba(38,52,49,0.30)',textDecoration:'line-through',fontFamily:'Outfit, sans-serif'}}>₹{c.originalPrice}</span>
                        )}
                        {c.savings > 0 && (
                          <span style={{padding:'4px 12px',borderRadius:20,background:'rgba(74,122,94,0.1)',color:'#1A6B3A',fontSize:11,fontWeight:700,border:'1px solid rgba(74,122,94,0.2)',fontFamily:'Outfit, sans-serif',letterSpacing:'0.02em'}}>Save ₹{c.savings}</span>
                        )}
                      </div>
                    </div>
                    <div style={{display:'flex',gap:8,flexShrink:0}}>
                      <button onClick={()=>toggleActive(c)} style={{padding:'8px 12px',borderRadius:10,border:`1.5px solid ${c.isActive?'rgba(74,122,94,0.3)':'rgba(38,52,49,0.15)'}`,background:c.isActive?'rgba(74,122,94,0.07)':'transparent',fontSize:12,fontWeight:600,cursor:'pointer',color:c.isActive?'#1A6B3A':'rgba(38,52,49,0.5)'}}>
                        {c.isActive?'👁 Visible':'🙈 Hidden'}
                      </button>
                      <button onClick={()=>openEdit(c)} style={{padding:'8px 12px',borderRadius:10,border:'1.5px solid rgba(38,52,49,0.12)',background:'transparent',fontSize:12,fontWeight:600,cursor:'pointer',color:'rgba(38,52,49,0.6)'}}>
                        ✎ Edit
                      </button>
                      <button onClick={()=>handleDelete(c)} disabled={deleting===c.id} style={{padding:'8px 12px',borderRadius:10,border:'1.5px solid rgba(138,74,66,0.3)',background:'rgba(138,74,66,0.06)',fontSize:12,fontWeight:600,cursor:'pointer',color:'#8A4A42',opacity:deleting===c.id?0.5:1,transition:'all 0.15s'}}>
                        {deleting===c.id?'…':'✕'}
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

      </div>
    </AdminLayout>
  );
}
