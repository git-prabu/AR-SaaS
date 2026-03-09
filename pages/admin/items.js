// pages/admin/items.js
import Head from 'next/head';
import { useEffect, useState, useRef } from 'react';
import { useAuth } from '../../hooks/useAuth';
import AdminLayout from '../../components/layout/AdminLayout';
import { getAllMenuItems, updateMenuItem, deleteMenuItem } from '../../lib/db';
import { uploadFile, buildImagePath, fileSizeMB } from '../../lib/storage';
import toast from 'react-hot-toast';
import {
  DndContext, closestCenter, PointerSensor, TouchSensor, KeyboardSensor,
  useSensor, useSensors, DragOverlay,
} from '@dnd-kit/core';
import {
  SortableContext, useSortable,
  horizontalListSortingStrategy, verticalListSortingStrategy,
  arrayMove, sortableKeyboardCoordinates,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

const SPICE_LEVELS = ['None', 'Mild', 'Medium', 'Spicy', 'Very Spicy'];
const SPICE_COLORS = { None:'#8FC4A8', Mild:'#F4D070', Medium:'#F4A060', Spicy:'#E05A3A', 'Very Spicy':'#B02020' };
const OFFER_BADGES = [
  { label:"Chef's Special", color:'#8A70B0' },
  { label:'Best Seller',    color:'#E05A3A' },
  { label:'Must Try',       color:'#5A9A78' },
  { label:'New',            color:'#4A80C0' },
  { label:'Limited',        color:'#C04A28' },
  { label:'Custom\u2026',    color:'#1E1B18' },
];

const S = {
  card:  { background:'#FFFFFF', border:'1px solid rgba(42,31,16,0.07)', borderRadius:20, boxShadow:'0 2px 14px rgba(42,31,16,0.06)' },
  h1:    { fontFamily:'Poppins,sans-serif', fontWeight:800, fontSize:22, color:'#1E1B18', margin:0 },
  sub:   { fontSize:13, color:'rgba(42,31,16,0.45)', marginTop:4 },
  label: { display:'block', fontSize:11, fontWeight:600, color:'rgba(42,31,16,0.5)', letterSpacing:'0.05em', textTransform:'uppercase', marginBottom:6 },
  input: { width:'100%', padding:'10px 13px', background:'#F7F5F2', border:'1.5px solid rgba(42,31,16,0.09)', borderRadius:11, fontSize:13, color:'#1E1B18', fontFamily:'Inter,sans-serif', outline:'none', boxSizing:'border-box', transition:'border-color 0.15s' },
};

// Sortable category pill
function SortableCatPill({ id, label, isActive, totalCount, onClick }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  return (
    <div ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.45 : 1 }}>
      <button
        onClick={onClick}
        {...attributes} {...listeners}
        style={{
          padding:'9px 16px', borderRadius:30, border:'none',
          fontSize:12, fontWeight:600, cursor: isDragging ? 'grabbing' : 'grab',
          fontFamily:'Inter,sans-serif', textTransform:'capitalize',
          background: isActive ? '#1E1B18' : '#fff',
          color: isActive ? '#FFF5E8' : 'rgba(42,31,16,0.55)',
          boxShadow: isActive ? '0 2px 8px rgba(30,27,24,0.18)' : '0 1px 4px rgba(42,31,16,0.06)',
          transition:'background 0.15s, color 0.15s',
          whiteSpace:'nowrap', userSelect:'none', touchAction:'none',
        }}
      >
        {label === 'all' ? `All (${totalCount})` : label}
      </button>
    </div>
  );
}

// Sortable item row
function SortableItemRow({ id, children }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  return (
    <div ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition, zIndex: isDragging ? 20 : 'auto', position:'relative' }}>
      {children({ dragHandleProps: { ...attributes, ...listeners }, isDragging })}
    </div>
  );
}

export default function AdminItems() {
  const { userData }                  = useAuth();
  const [items,       setItems]       = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [search,      setSearch]      = useState('');
  const [catFilter,   setCatFilter]   = useState('all');
  const [catOrder,    setCatOrder]    = useState([]);
  const [editId,      setEditId]      = useState(null);
  const [editData,    setEditData]    = useState({});
  const [saving,      setSaving]      = useState(false);
  const [deleting,    setDeleting]    = useState(null);
  const [customBadge, setCustomBadge] = useState('');
  const [imgUpload,   setImgUpload]   = useState({});
  const [activeItemId, setActiveItemId] = useState(null);
  const imgInputRef = useRef({});
  const rid = userData?.restaurantId;

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor,   { activationConstraint: { delay: 180, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const load = async () => {
    if (!rid) return;
    const data = await getAllMenuItems(rid);
    const sorted = data.sort((a, b) => {
      const ao = a.sortOrder ?? 9999, bo = b.sortOrder ?? 9999;
      if (ao !== bo) return ao - bo;
      return (a.createdAt?.seconds || 0) - (b.createdAt?.seconds || 0);
    });
    setItems(sorted);
    const cats = Array.from(new Set(sorted.map(i => i.category).filter(Boolean)));
    setCatOrder(prev => {
      const kept  = prev.filter(c => cats.includes(c));
      const fresh = cats.filter(c => !prev.includes(c));
      return [...kept, ...fresh];
    });
    setLoading(false);
  };

  useEffect(() => { load(); }, [rid]);

  const filtered = items.filter(item => {
    const matchCat    = catFilter === 'all' || item.category === catFilter;
    const matchSearch = !search || item.name?.toLowerCase().includes(search.toLowerCase());
    return matchCat && matchSearch;
  });

  // Category drag end — reorder in UI only (no DB write needed for category order)
  const handleCatDragEnd = ({ active, over }) => {
    if (!over || active.id === over.id) return;
    setCatOrder(prev => arrayMove(prev, prev.indexOf(active.id), prev.indexOf(over.id)));
    toast.success('Category order updated');
  };

  // Item drag — save new sortOrder to Firebase
  const handleItemDragEnd = async ({ active, over }) => {
    setActiveItemId(null);
    if (!over || active.id === over.id) return;
    const oIdx = filtered.findIndex(i => i.id === active.id);
    const nIdx = filtered.findIndex(i => i.id === over.id);
    if (oIdx < 0 || nIdx < 0) return;
    const reordered = arrayMove(filtered, oIdx, nIdx);
    const updates   = reordered.map((item, i) => ({ id: item.id, sortOrder: i + 1 }));
    // Optimistic update
    setItems(prev => {
      const map = Object.fromEntries(updates.map(u => [u.id, u.sortOrder]));
      return prev.map(i => map[i.id] !== undefined ? { ...i, sortOrder: map[i.id] } : i)
                 .sort((a,b) => (a.sortOrder??9999) - (b.sortOrder??9999));
    });
    try {
      await Promise.all(updates.map(u => updateMenuItem(rid, u.id, { sortOrder: u.sortOrder })));
      toast.success('Order saved');
    } catch {
      toast.error('Failed to save order');
      load();
    }
  };

  const moveItem = async (item, direction) => {
    const idx = filtered.findIndex(i => i.id === item.id);
    const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= filtered.length) return;
    const swapItem = filtered[swapIdx];
    const aOrder = item.sortOrder ?? idx;
    const bOrder = swapItem.sortOrder ?? swapIdx;
    await Promise.all([
      updateMenuItem(rid, item.id,     { sortOrder: bOrder }),
      updateMenuItem(rid, swapItem.id, { sortOrder: aOrder }),
    ]);
    await load();
  };

  const startEdit = (item) => {
    setEditId(item.id);
    setEditData({
      name:        item.name        || '',
      description: item.description || '',
      category:    item.category    || '',
      price:       item.price       || '',
      prepTime:    item.prepTime    || '',
      spiceLevel:  item.spiceLevel  || 'None',
      offerBadge:  item.offerBadge  || '',
      offerLabel:  item.offerLabel  || '',
      offerColor:  item.offerColor  || '#E05A3A',
      isPopular:   item.isPopular   || false,
      isFeatured:  item.isFeatured  || false,
      isActive:    item.isActive    !== false,
      sortOrder:   item.sortOrder   ?? '',
    });
    setCustomBadge('');
  };
  const cancelEdit = () => { setEditId(null); setEditData({}); };

  const handleImageUpload = async (item, file) => {
    if (!file) return;
    if (fileSizeMB(file) > 5) { toast.error('Image must be under 5MB'); return; }
    setImgUpload(u => ({ ...u, [item.id]: { uploading:true, progress:0 } }));
    try {
      const path = buildImagePath(rid, file.name);
      const url  = await uploadFile(file, path, pct => setImgUpload(u => ({ ...u, [item.id]: { uploading:true, progress:pct } })));
      await updateMenuItem(rid, item.id, { imageURL: url });
      setItems(prev => prev.map(i => i.id === item.id ? { ...i, imageURL: url } : i));
      toast.success('Cover image updated!');
    } catch (e) { toast.error('Upload failed: ' + e.message); }
    finally { setImgUpload(u => ({ ...u, [item.id]: { uploading:false, progress:0 } })); }
  };

  const saveEdit = async () => {
    if (!editData.name?.trim()) { toast.error('Item name required'); return; }
    setSaving(true);
    try {
      const finalLabel = editData.offerBadge === 'Custom\u2026' ? customBadge : editData.offerBadge;
      await updateMenuItem(rid, editId, {
        ...editData,
        offerLabel: finalLabel || '',
        offerBadge: !!finalLabel,
        sortOrder:  editData.sortOrder !== '' ? Number(editData.sortOrder) : null,
        price:      editData.price     !== '' ? Number(editData.price)     : null,
      });
      toast.success('Item updated!');
      setEditId(null);
      await load();
    } catch (e) { toast.error('Failed to save: ' + e.message); }
    finally { setSaving(false); }
  };

  const handleDelete = async (item) => {
    if (!confirm(`Delete "${item.name}"? This cannot be undone.`)) return;
    setDeleting(item.id);
    try {
      await deleteMenuItem(rid, item.id);
      toast.success(`"${item.name}" deleted`);
      await load();
    } catch { toast.error('Delete failed'); }
    finally { setDeleting(null); }
  };

  const toggleActive = async (item) => {
    await updateMenuItem(rid, item.id, { isActive: !item.isActive });
    await load();
  };

  const draggingItem = activeItemId ? filtered.find(i => i.id === activeItemId) : null;

  return (
    <AdminLayout>
      <Head><title>Menu Items — Advert Radical</title></Head>
      <div style={{ background:'#F2F0EC', minHeight:'100vh', padding:32, fontFamily:'Inter,sans-serif' }}>
        <div style={{ maxWidth:1000, margin:'0 auto' }}>
          <style>{`
            @keyframes spin{to{transform:rotate(360deg)}}
            .inp:focus{border-color:rgba(224,90,58,0.5)!important}
            .inp::placeholder{color:rgba(42,31,16,0.3)}
            .item-row:hover{background:#FAFAF8!important}
            .act-btn:hover{opacity:1!important}
          `}</style>

          {/* Header */}
          <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', marginBottom:28, flexWrap:'wrap', gap:12 }}>
            <div>
              <h1 style={S.h1}>Menu Items</h1>
              <p style={S.sub}>Manage, edit, reorder and add offers to your approved AR menu items.</p>
            </div>
            <div style={{ padding:'10px 18px', borderRadius:12, background:'rgba(143,196,168,0.15)', border:'1px solid rgba(143,196,168,0.35)', fontSize:13, fontWeight:600, color:'#1A5A38' }}>
              {items.filter(i=>i.isActive).length} active \u00b7 {items.length} total
            </div>
          </div>

          {/* Search */}
          <div style={{ marginBottom:14 }}>
            <div style={{ position:'relative' }}>
              <span style={{ position:'absolute', left:13, top:'50%', transform:'translateY(-50%)', color:'rgba(42,31,16,0.35)', fontSize:15 }}>&#128269;</span>
              <input className="inp" style={{ ...S.input, paddingLeft:38, borderRadius:30 }} value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search items\u2026" />
            </div>
          </div>

          {/* Drag-sortable category pills */}
          <div style={{ marginBottom:20 }}>
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleCatDragEnd}>
              <SortableContext items={catOrder} strategy={horizontalListSortingStrategy}>
                <div style={{ display:'flex', gap:6, flexWrap:'wrap', alignItems:'center' }}>
                  <button
                    onClick={() => setCatFilter('all')}
                    style={{ padding:'9px 16px', borderRadius:30, border:'none', fontSize:12, fontWeight:600, cursor:'pointer', fontFamily:'Inter,sans-serif', background:catFilter==='all'?'#1E1B18':'#fff', color:catFilter==='all'?'#FFF5E8':'rgba(42,31,16,0.55)', boxShadow:catFilter==='all'?'0 2px 8px rgba(30,27,24,0.18)':'0 1px 4px rgba(42,31,16,0.06)', transition:'all 0.15s', whiteSpace:'nowrap' }}>
                    All ({items.length})
                  </button>
                  {catOrder.map(c => (
                    <SortableCatPill key={c} id={c} label={c} isActive={catFilter === c} totalCount={items.length} onClick={() => setCatFilter(c)} />
                  ))}
                </div>
              </SortableContext>
            </DndContext>
            <p style={{ fontSize:11, color:'rgba(42,31,16,0.35)', marginTop:8, marginBottom:0 }}>
              \ud83d\udca1 Drag category pills to reorder them
            </p>
          </div>

          {/* Legend */}
          <div style={{ display:'flex', gap:16, marginBottom:16, flexWrap:'wrap' }}>
            {[['\u2807 drag','Reorder items'],['\u2b06\u2b07 arrows','Quick reorder'],['\u2746','Popular badge'],['\ud83c\udff7','Offer / badge'],['\u25d0','Active toggle']].map(([icon,label])=>(
              <div key={label} style={{ display:'flex', alignItems:'center', gap:5, fontSize:11, color:'rgba(42,31,16,0.4)' }}>
                <span style={{ fontSize:12 }}>{icon}</span>{label}
              </div>
            ))}
          </div>

          {loading ? (
            <div style={{ display:'flex', justifyContent:'center', paddingTop:60 }}>
              <div style={{ width:32, height:32, border:'3px solid #E05A3A', borderTopColor:'transparent', borderRadius:'50%', animation:'spin 0.8s linear infinite' }} />
            </div>
          ) : filtered.length === 0 ? (
            <div style={{ textAlign:'center', padding:'60px 0', color:'rgba(42,31,16,0.4)' }}>
              <div style={{ fontSize:40, marginBottom:12 }}>\ud83c\udf7d\ufe0f</div>
              <p style={{ fontSize:14 }}>No items yet. Submit a request to get AR items approved.</p>
            </div>
          ) : (
            <div style={{ ...S.card, overflow:'hidden' }}>
              {/* Table header */}
              <div style={{ display:'grid', gridTemplateColumns:'36px 40px 56px 1fr 90px 90px 80px 100px 130px', gap:0, padding:'11px 18px', borderBottom:'1px solid rgba(42,31,16,0.06)', background:'#FAFAF8' }}>
                {['\u2807','\u21d5','','Item','Category','Prep','Spice','Status','Actions'].map(h=>(
                  <div key={h} style={{ fontSize:10, fontWeight:700, color:'rgba(42,31,16,0.4)', letterSpacing:'0.06em', textTransform:'uppercase' }}>{h}</div>
                ))}
              </div>

              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragStart={({ active }) => setActiveItemId(active.id)}
                onDragEnd={handleItemDragEnd}
                onDragCancel={() => setActiveItemId(null)}
              >
                <SortableContext items={filtered.map(i => i.id)} strategy={verticalListSortingStrategy}>
                  {filtered.map((item, idx) => {
                    const isEdit = editId === item.id;
                    return (
                      <SortableItemRow key={item.id} id={item.id}>
                        {({ dragHandleProps, isDragging }) => (
                          <div style={{ opacity: isDragging ? 0.4 : item.isActive ? 1 : 0.5 }}>

                            <div className="item-row" style={{ display:'grid', gridTemplateColumns:'36px 40px 56px 1fr 90px 90px 80px 100px 130px', gap:0, padding:'13px 18px', borderBottom: isEdit ? 'none' : '1px solid rgba(42,31,16,0.05)', alignItems:'center', background: isDragging ? '#FFF8F0' : '#fff', transition:'background 0.12s' }}>

                              {/* Drag handle */}
                              <div
                                {...dragHandleProps}
                                title="Drag to reorder"
                                style={{ display:'flex', alignItems:'center', justifyContent:'center', cursor: isDragging ? 'grabbing' : 'grab', touchAction:'none', color:'rgba(42,31,16,0.3)', fontSize:16, userSelect:'none' }}
                              >
                                \u2807
                              </div>

                              {/* Arrow buttons */}
                              <div style={{ display:'flex', flexDirection:'column', gap:2 }}>
                                <button className="act-btn" onClick={()=>moveItem(item,'up')} disabled={idx===0} style={{ width:22, height:22, borderRadius:6, border:'1px solid rgba(42,31,16,0.1)', background:'transparent', cursor:'pointer', fontSize:10, color:'rgba(42,31,16,0.45)', opacity:idx===0?0.25:0.7, display:'flex', alignItems:'center', justifyContent:'center' }}>\u25b2</button>
                                <button className="act-btn" onClick={()=>moveItem(item,'down')} disabled={idx===filtered.length-1} style={{ width:22, height:22, borderRadius:6, border:'1px solid rgba(42,31,16,0.1)', background:'transparent', cursor:'pointer', fontSize:10, color:'rgba(42,31,16,0.45)', opacity:idx===filtered.length-1?0.25:0.7, display:'flex', alignItems:'center', justifyContent:'center' }}>\u25bc</button>
                              </div>

                              {/* Image */}
                              <div style={{ width:44, height:44, borderRadius:12, overflow:'hidden', background:'#F2F0EC', flexShrink:0 }}>
                                {item.imageURL ? <img src={item.imageURL} alt={item.name} style={{ width:'100%', height:'100%', objectFit:'cover' }}/> : <div style={{ width:'100%', height:'100%', display:'flex', alignItems:'center', justifyContent:'center', fontSize:20 }}>\ud83c\udf7d\ufe0f</div>}
                              </div>

                              {/* Name + badges */}
                              <div style={{ minWidth:0, paddingRight:8 }}>
                                <div style={{ display:'flex', alignItems:'center', gap:6, flexWrap:'wrap' }}>
                                  <span style={{ fontWeight:600, fontSize:13, color:'#1E1B18', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{item.name}</span>
                                  {item.isPopular && <span style={{ fontSize:10, fontWeight:700, color:'#E05A3A', background:'rgba(224,90,58,0.1)', borderRadius:20, padding:'2px 7px', flexShrink:0 }}>\u2746 Popular</span>}
                                  {item.offerBadge && item.offerLabel && <span style={{ fontSize:10, fontWeight:700, color:'#fff', background: item.offerColor||'#E05A3A', borderRadius:20, padding:'2px 8px', flexShrink:0 }}>\ud83c\udff7 {item.offerLabel}</span>}
                                </div>
                                {item.description && <div style={{ fontSize:11, color:'rgba(42,31,16,0.45)', marginTop:2, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{item.description}</div>}
                                <div style={{ display:'flex', gap:8, marginTop:3 }}>
                                  {item.price && <span style={{ fontSize:11, fontWeight:600, color:'#1E1B18' }}>\u20b9{item.price}</span>}
                                  <span style={{ fontSize:11, color:'rgba(42,31,16,0.35)' }}>\ud83d\udc41 {(item.views||0)+(item.arViews||0)} views</span>
                                </div>
                              </div>

                              <div style={{ fontSize:12, color:'rgba(42,31,16,0.55)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{item.category || '\u2014'}</div>
                              <div style={{ fontSize:11, color:'rgba(42,31,16,0.5)' }}>{item.prepTime ? `\u23f1 ${item.prepTime}` : '\u2014'}</div>
                              <div>
                                {item.spiceLevel && item.spiceLevel !== 'None'
                                  ? <span style={{ fontSize:10, fontWeight:700, padding:'3px 8px', borderRadius:20, background:(SPICE_COLORS[item.spiceLevel]||'#ccc')+'22', color:SPICE_COLORS[item.spiceLevel]||'#999', border:`1px solid ${(SPICE_COLORS[item.spiceLevel]||'#ccc')}44` }}>{item.spiceLevel}</span>
                                  : <span style={{ fontSize:11, color:'rgba(42,31,16,0.3)' }}>\u2014</span>}
                              </div>

                              {/* Active toggle */}
                              <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                                <div onClick={()=>toggleActive(item)} style={{ width:36, height:20, borderRadius:99, background:item.isActive?'#8FC4A8':'rgba(42,31,16,0.15)', cursor:'pointer', position:'relative', transition:'background 0.2s', flexShrink:0 }}>
                                  <div style={{ width:14, height:14, borderRadius:'50%', background:'#fff', position:'absolute', top:3, left:item.isActive?19:3, transition:'left 0.2s', boxShadow:'0 1px 4px rgba(0,0,0,0.2)' }} />
                                </div>
                                <span style={{ fontSize:11, color:'rgba(42,31,16,0.4)' }}>{item.isActive?'On':'Off'}</span>
                              </div>

                              {/* Actions */}
                              <div style={{ display:'flex', gap:6 }}>
                                <button onClick={()=>isEdit?cancelEdit():startEdit(item)} style={{ padding:'6px 12px', borderRadius:9, border:'1.5px solid rgba(42,31,16,0.12)', background:isEdit?'rgba(224,90,58,0.08)':'transparent', color:isEdit?'#C04A28':'rgba(42,31,16,0.6)', fontSize:12, fontWeight:600, cursor:'pointer', transition:'all 0.12s' }}>
                                  {isEdit ? 'Cancel' : 'Edit'}
                                </button>
                                <button onClick={()=>handleDelete(item)} disabled={deleting===item.id} style={{ padding:'6px 10px', borderRadius:9, border:'1.5px solid rgba(244,160,176,0.4)', background:'rgba(244,160,176,0.08)', color:'#8B1A2A', fontSize:12, fontWeight:600, cursor:'pointer', opacity:deleting===item.id?0.5:1 }}>
                                  {deleting===item.id?'\u2026':'\u00d7'}
                                </button>
                              </div>
                            </div>

                            {/* Edit panel */}
                            {isEdit && (
                              <div style={{ background:'#F7F5F2', borderBottom:'1px solid rgba(42,31,16,0.06)', padding:'20px 18px 24px' }}>
                                <div style={{ fontFamily:'Poppins,sans-serif', fontWeight:700, fontSize:13, color:'#1E1B18', marginBottom:18 }}>\u270f\ufe0f Editing: {item.name}</div>
                                <div style={{ background:'#fff', borderRadius:14, padding:16, marginBottom:16, border:'1px solid rgba(42,31,16,0.07)' }}>
                                  <label style={{ ...S.label, marginBottom:10 }}>\ud83d\udcf8 Cover Image</label>
                                  <div style={{ display:'flex', alignItems:'center', gap:14 }}>
                                    <div style={{ width:64, height:64, borderRadius:14, overflow:'hidden', background:'#F2F0EC', flexShrink:0 }}>
                                      {item.imageURL ? <img src={item.imageURL} alt={item.name} style={{ width:'100%', height:'100%', objectFit:'cover' }}/> : <div style={{ width:'100%', height:'100%', display:'flex', alignItems:'center', justifyContent:'center', fontSize:28 }}>\ud83c\udf7d\ufe0f</div>}
                                    </div>
                                    <div>
                                      <div style={{ fontSize:11, color:'rgba(42,31,16,0.45)', marginBottom:8 }}>JPG, PNG \u00b7 Max 5MB \u00b7 Shown on menu card</div>
                                      <input type="file" accept="image/*" style={{ display:'none' }} ref={el => { if(el) imgInputRef.current[item.id]=el; }} onChange={e => handleImageUpload(item, e.target.files[0])} />
                                      <button onClick={() => imgInputRef.current[item.id]?.click()} disabled={imgUpload[item.id]?.uploading} style={{ padding:'8px 16px', borderRadius:10, border:'1.5px solid rgba(42,31,16,0.12)', background:'transparent', fontSize:12, fontWeight:600, color:'rgba(42,31,16,0.6)', cursor:'pointer', opacity:imgUpload[item.id]?.uploading?0.6:1 }}>
                                        {imgUpload[item.id]?.uploading ? `Uploading ${imgUpload[item.id].progress}%\u2026` : item.imageURL ? '\u2191 Replace Image' : '\u2191 Upload Image'}
                                      </button>
                                    </div>
                                  </div>
                                  {imgUpload[item.id]?.uploading && (
                                    <div style={{ height:4, background:'rgba(42,31,16,0.07)', borderRadius:99, overflow:'hidden', marginTop:10 }}>
                                      <div style={{ height:'100%', background:'#E05A3A', borderRadius:99, width:`${imgUpload[item.id].progress}%`, transition:'width 0.2s' }}/>
                                    </div>
                                  )}
                                </div>
                                <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:14, marginBottom:14 }}>
                                  <div><label style={S.label}>Item Name *</label><input className="inp" style={S.input} value={editData.name} onChange={e=>setEditData(d=>({...d,name:e.target.value}))} /></div>
                                  <div><label style={S.label}>Category</label><input className="inp" style={S.input} value={editData.category} onChange={e=>setEditData(d=>({...d,category:e.target.value}))} placeholder="e.g. Main Course" /></div>
                                  <div><label style={S.label}>Price (\u20b9)</label><input className="inp" style={S.input} type="number" min="0" value={editData.price} onChange={e=>setEditData(d=>({...d,price:e.target.value}))} placeholder="e.g. 299" /></div>
                                </div>
                                <div style={{ marginBottom:14 }}>
                                  <label style={S.label}>Description</label>
                                  <textarea className="inp" style={{ ...S.input, resize:'none' }} rows={2} value={editData.description} onChange={e=>setEditData(d=>({...d,description:e.target.value}))} placeholder="Short description\u2026" />
                                </div>
                                <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:14, marginBottom:14 }}>
                                  <div><label style={S.label}>\u23f1 Prep Time</label><input className="inp" style={S.input} value={editData.prepTime} onChange={e=>setEditData(d=>({...d,prepTime:e.target.value}))} placeholder="10\u201315 minutes" /></div>
                                  <div>
                                    <label style={S.label}>\ud83c\udf36 Spice Level</label>
                                    <select className="inp" style={S.input} value={editData.spiceLevel} onChange={e=>setEditData(d=>({...d,spiceLevel:e.target.value}))}>
                                      {SPICE_LEVELS.map(s=><option key={s} value={s}>{s}</option>)}
                                    </select>
                                  </div>
                                  <div><label style={S.label}>Priority Order</label><input className="inp" style={S.input} type="number" min="1" value={editData.sortOrder} onChange={e=>setEditData(d=>({...d,sortOrder:e.target.value}))} placeholder="1 = first" /></div>
                                </div>
                                <div style={{ background:'#fff', borderRadius:14, padding:'16px', marginBottom:14, border:'1px solid rgba(42,31,16,0.07)' }}>
                                  <label style={{ ...S.label, marginBottom:10 }}>\ud83c\udff7 Offer / Badge</label>
                                  <div style={{ display:'flex', gap:8, flexWrap:'wrap', marginBottom:editData.offerBadge==='Custom\u2026'?12:0 }}>
                                    <button onClick={()=>setEditData(d=>({...d,offerBadge:'',offerLabel:''}))} style={{ padding:'6px 14px', borderRadius:20, border:`1.5px solid ${!editData.offerBadge?'rgba(42,31,16,0.4)':'rgba(42,31,16,0.1)'}`, background:!editData.offerBadge?'rgba(42,31,16,0.07)':'transparent', fontSize:12, fontWeight:600, color:'rgba(42,31,16,0.6)', cursor:'pointer' }}>None</button>
                                    {OFFER_BADGES.map(b=>(
                                      <button key={b.label} onClick={()=>setEditData(d=>({...d,offerBadge:b.label,offerLabel:b.label==='Custom\u2026'?d.offerLabel:b.label,offerColor:b.color}))} style={{ padding:'6px 14px', borderRadius:20, border:`1.5px solid ${editData.offerBadge===b.label?b.color:'rgba(42,31,16,0.1)'}`, background:editData.offerBadge===b.label?b.color+'22':'transparent', fontSize:12, fontWeight:700, color:editData.offerBadge===b.label?b.color:'rgba(42,31,16,0.5)', cursor:'pointer' }}>
                                        {b.label}
                                      </button>
                                    ))}
                                  </div>
                                  {editData.offerBadge === 'Custom\u2026' && (
                                    <input className="inp" style={{ ...S.input, marginTop:8 }} value={customBadge} onChange={e=>setCustomBadge(e.target.value)} placeholder="Enter custom badge text e.g. '30% Off Tonight'" />
                                  )}
                                </div>
                                <div style={{ display:'flex', gap:16, marginBottom:18, flexWrap:'wrap' }}>
                                  {[['isPopular','\u2746 Mark as Popular','Show popular badge on menu'],['isFeatured','\u2b50 Feature this item','Appear at top of category'],['isActive','\ud83d\udc41 Visible on menu','Customers can see this item']].map(([key,title,desc])=>(
                                    <div key={key} onClick={()=>setEditData(d=>({...d,[key]:!d[key]}))} style={{ display:'flex', alignItems:'center', gap:10, padding:'10px 16px', borderRadius:12, border:`1.5px solid ${editData[key]?'rgba(224,90,58,0.35)':'rgba(42,31,16,0.09)'}`, background:editData[key]?'rgba(224,90,58,0.05)':'#fff', cursor:'pointer', transition:'all 0.15s' }}>
                                      <div style={{ width:32, height:18, borderRadius:99, background:editData[key]?'#E05A3A':'rgba(42,31,16,0.15)', position:'relative', transition:'background 0.2s', flexShrink:0 }}>
                                        <div style={{ width:12, height:12, borderRadius:'50%', background:'#fff', position:'absolute', top:3, left:editData[key]?17:3, transition:'left 0.2s', boxShadow:'0 1px 3px rgba(0,0,0,0.2)' }} />
                                      </div>
                                      <div>
                                        <div style={{ fontSize:12, fontWeight:700, color:'#1E1B18' }}>{title}</div>
                                        <div style={{ fontSize:10, color:'rgba(42,31,16,0.4)' }}>{desc}</div>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                                <div style={{ display:'flex', gap:10 }}>
                                  <button onClick={saveEdit} disabled={saving} style={{ padding:'11px 28px', borderRadius:12, border:'none', background:'#1E1B18', color:'#FFF5E8', fontSize:14, fontWeight:700, fontFamily:'Poppins,sans-serif', cursor:'pointer', opacity:saving?0.6:1 }}>
                                    {saving ? 'Saving\u2026' : 'Save Changes'}
                                  </button>
                                  <button onClick={cancelEdit} style={{ padding:'11px 20px', borderRadius:12, border:'1.5px solid rgba(42,31,16,0.12)', background:'transparent', fontSize:13, fontWeight:600, color:'rgba(42,31,16,0.55)', cursor:'pointer' }}>
                                    Cancel
                                  </button>
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                      </SortableItemRow>
                    );
                  })}
                </SortableContext>

                <DragOverlay adjustScale={false}>
                  {draggingItem ? (
                    <div style={{ display:'grid', gridTemplateColumns:'36px 40px 56px 1fr', gap:0, padding:'13px 18px', alignItems:'center', background:'#fff', borderRadius:14, boxShadow:'0 16px 48px rgba(42,31,16,0.22)', border:'1.5px solid rgba(247,155,61,0.3)', opacity:0.97 }}>
                      <div style={{ color:'rgba(42,31,16,0.4)', fontSize:16, textAlign:'center' }}>\u2807</div>
                      <div />
                      <div style={{ width:44, height:44, borderRadius:12, overflow:'hidden', background:'#F2F0EC' }}>
                        {draggingItem.imageURL ? <img src={draggingItem.imageURL} alt="" style={{ width:'100%', height:'100%', objectFit:'cover' }}/> : <div style={{ width:'100%', height:'100%', display:'flex', alignItems:'center', justifyContent:'center', fontSize:20 }}>\ud83c\udf7d\ufe0f</div>}
                      </div>
                      <div style={{ fontWeight:600, fontSize:13, color:'#1E1B18', paddingLeft:8, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{draggingItem.name}</div>
                    </div>
                  ) : null}
                </DragOverlay>
              </DndContext>
            </div>
          )}

          {/* Popularity insight */}
          {!loading && items.length > 0 && (
            <div style={{ ...S.card, padding:24, marginTop:20 }}>
              <div style={{ fontFamily:'Poppins,sans-serif', fontWeight:700, fontSize:14, color:'#1E1B18', marginBottom:16 }}>\ud83d\udcca Most Popular Items</div>
              <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
                {[...items]
                  .sort((a,b) => ((b.views||0)+(b.arViews||0)*2) - ((a.views||0)+(a.arViews||0)*2))
                  .slice(0,5)
                  .map((item, i) => {
                    const score = (item.views||0) + (item.arViews||0)*2;
                    const pct   = Math.max(8, Math.round((score / Math.max(...items.map(x=>(x.views||0)+(x.arViews||0)*2),1)) * 100));
                    return (
                      <div key={item.id} style={{ display:'flex', alignItems:'center', gap:12 }}>
                        <span style={{ fontSize:11, color:'rgba(42,31,16,0.35)', width:16, textAlign:'right', flexShrink:0 }}>#{i+1}</span>
                        <div style={{ width:32, height:32, borderRadius:10, overflow:'hidden', background:'#F2F0EC', flexShrink:0 }}>
                          {item.imageURL ? <img src={item.imageURL} alt={item.name} style={{ width:'100%', height:'100%', objectFit:'cover' }}/> : <span style={{ fontSize:16, lineHeight:'32px', display:'block', textAlign:'center' }}>\ud83c\udf7d\ufe0f</span>}
                        </div>
                        <div style={{ flex:1, minWidth:0 }}>
                          <div style={{ display:'flex', justifyContent:'space-between', marginBottom:4 }}>
                            <span style={{ fontSize:13, fontWeight:500, color:'#1E1B18', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{item.name}</span>
                            <span style={{ fontSize:11, color:'rgba(42,31,16,0.4)', flexShrink:0, marginLeft:8 }}>{item.views||0} views \u00b7 {item.arViews||0} AR</span>
                          </div>
                          <div style={{ height:5, background:'rgba(42,31,16,0.07)', borderRadius:99, overflow:'hidden' }}>
                            <div style={{ height:'100%', borderRadius:99, background: i===0?'#E05A3A':i===1?'#F4A060':'#8FC4A8', width:`${pct}%` }} />
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
