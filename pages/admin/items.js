// pages/admin/items.js
import Head from 'next/head';
import { useEffect, useState, useRef } from 'react';
import { useAuth } from '../../hooks/useAuth';
import AdminLayout from '../../components/layout/AdminLayout';
import { getAllMenuItems, updateMenuItem, deleteMenuItem } from '../../lib/db';
import { uploadFile, buildImagePath, fileSizeMB } from '../../lib/storage';
import { T, ADMIN_STYLES } from '../../lib/utils';
import toast from 'react-hot-toast';

const SPICE_LEVELS = ['None', 'Mild', 'Medium', 'Spicy', 'Very Spicy'];
const SPICE_COLORS = { None: '#8FC4A8', Mild: '#F4D070', Medium: '#F4A060', Spicy: '#8A4A42', 'Very Spicy': '#B02020' };
const OFFER_BADGES = [
  { label: 'Chef\'s Special', color: '#8A70B0' },
  { label: 'Best Seller', color: '#8A4A42' },
  { label: 'Must Try', color: '#4A7A5E' },
  { label: 'New', color: '#5A7A9A' },
  { label: 'Limited', color: '#8A4A42' },
  { label: 'Custom…', color: '#263431' },
];

const S = {
  card: { ...ADMIN_STYLES.card },
  h1: { ...ADMIN_STYLES.h1 },
  sub: { ...ADMIN_STYLES.sub },
  label: { display: 'block', fontSize: 11, fontWeight: 600, color: T.stone, letterSpacing: '0.05em', textTransform: 'uppercase', marginBottom: 6, fontFamily: T.font },
  input: { width: '100%', padding: '10px 13px', background: '#F0EFED', border: `1.5px solid ${T.sand}`, borderRadius: T.radiusBtn, fontSize: 13, color: T.ink, fontFamily: T.font, outline: 'none', boxSizing: 'border-box', transition: 'border-color 0.15s' },
};

async function autoTranslate(text, targetLang) {
  if (!text?.trim()) return '';
  try {
    const res = await fetch(`https://api.mymemory.translated.net/get?q=${encodeURIComponent(text.trim())}&langpair=en|${targetLang}`);
    const data = await res.json();
    if (data?.responseStatus === 200 && data?.responseData?.translatedText) {
      const result = data.responseData.translatedText;
      if (result === text.trim().toUpperCase()) return '';
      return result;
    }
    return '';
  } catch { return ''; }
}

export default function AdminItems() {
  const { userData } = useAuth();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [catFilter, setCatFilter] = useState('all');
  const [editId, setEditId] = useState(null);
  const [editData, setEditData] = useState({});
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(null);
  const [customBadge, setCustomBadge] = useState('');
  const [translatingEdit, setTranslatingEdit] = useState(false);
  const [imgUpload, setImgUpload] = useState({}); // { [itemId]: { progress, uploading } }
  const imgInputRef = useRef({});
  const dragItem = useRef(null);
  const dragOverItem = useRef(null);
  const [dragging, setDragging] = useState(null);
  const rid = userData?.restaurantId;

  const load = async () => {
    if (!rid) return;
    const data = await getAllMenuItems(rid);
    // Sort by sortOrder first, then createdAt
    const sorted = data.sort((a, b) => {
      const ao = a.sortOrder ?? 9999, bo = b.sortOrder ?? 9999;
      if (ao !== bo) return ao - bo;
      return (a.createdAt?.seconds || 0) - (b.createdAt?.seconds || 0);
    });
    setItems(sorted);
    setLoading(false);
  };

  useEffect(() => { load(); }, [rid]);

  const today = new Date().toISOString().split('T')[0];
  const isSoldOutToday = (item) => item.availableUntil === today;

  const categories = ['all', ...Array.from(new Set(items.map(i => i.category).filter(Boolean)))];

  const filtered = items
    .filter(item => {
      const matchCat = catFilter === 'all' || item.category === catFilter;
      const matchSearch = !search || item.name?.toLowerCase().includes(search.toLowerCase());
      return matchCat && matchSearch;
    })
    .sort((a, b) => {
      // Sold-out items always sink to the bottom; within each group keep original sortOrder
      const aSold = isSoldOutToday(a) ? 1 : 0;
      const bSold = isSoldOutToday(b) ? 1 : 0;
      return aSold - bSold;
    });

  const startEdit = (item) => {
    setEditId(item.id);
    setEditData({
      name: item.name || '',
      nameTA: item.nameTA || '',
      nameHI: item.nameHI || '',
      description: item.description || '',
      descriptionTA: item.descriptionTA || '',
      descriptionHI: item.descriptionHI || '',
      category: item.category || '',
      price: item.price || '',
      prepTime: item.prepTime || '',
      spiceLevel: item.spiceLevel || 'None',
      isVeg: item.isVeg !== undefined ? item.isVeg : '',
      pairsWith: item.pairsWith || [],
      offerBadge: item.offerBadge || '',
      offerLabel: item.offerLabel || '',
      offerColor: item.offerColor || '#8A4A42',
      isPopular: item.isPopular || false,
      isFeatured: item.isFeatured || false,
      isActive: item.isActive !== false,
      isOutOfStock: item.isOutOfStock || false,
      sortOrder: item.sortOrder ?? '',
    });
    setCustomBadge('');
  };

  const cancelEdit = () => { setEditId(null); setEditData({}); };

  const handleImageUpload = async (item, file) => {
    if (!file) return;
    if (fileSizeMB(file) > 5) { toast.error('Image must be under 5MB'); return; }
    setImgUpload(u => ({ ...u, [item.id]: { uploading: true, progress: 0 } }));
    try {
      const path = buildImagePath(rid, file.name);
      const url = await uploadFile(file, path, (pct) =>
        setImgUpload(u => ({ ...u, [item.id]: { uploading: true, progress: pct } }))
      );
      await updateMenuItem(rid, item.id, { imageURL: url });
      setItems(prev => prev.map(i => i.id === item.id ? { ...i, imageURL: url } : i));
      toast.success('Cover image updated!');
    } catch (e) { toast.error('Upload failed: ' + e.message); }
    finally { setImgUpload(u => ({ ...u, [item.id]: { uploading: false, progress: 0 } })); }
  };

  const saveEdit = async () => {
    if (!editData.name?.trim()) { toast.error('Item name is required'); return; }
    if (!editData.category?.trim()) { toast.error('Category is required — please select or type a category'); return; }
    if (editData.isVeg === undefined || editData.isVeg === null || editData.isVeg === '') {
      toast.error('Please mark item as Veg or Non-Veg'); return;
    }
    if (!editData.spiceLevel || editData.spiceLevel === '') { toast.error('Spice level is required'); return; }
    setSaving(true);
    try {
      const finalLabel = editData.offerBadge === 'Custom…' ? customBadge : editData.offerBadge;
      await updateMenuItem(rid, editId, {
        ...editData,
        offerLabel: finalLabel || '',
        offerBadge: !!finalLabel,
        sortOrder: editData.sortOrder !== '' ? Number(editData.sortOrder) : null,
        price: editData.price !== '' ? Number(editData.price) : null,
        pairsWith: editData.pairsWith || [],
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

  const moveItem = async (item, direction) => {
    // Find adjacent item in filtered list and swap sort orders
    const idx = filtered.findIndex(i => i.id === item.id);
    const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= filtered.length) return;
    const swapItem = filtered[swapIdx];
    const aOrder = item.sortOrder ?? idx;
    const bOrder = swapItem.sortOrder ?? swapIdx;
    await Promise.all([
      updateMenuItem(rid, item.id, { sortOrder: bOrder }),
      updateMenuItem(rid, swapItem.id, { sortOrder: aOrder }),
    ]);
    await load();
  };

  const handleDragEnd = async () => {
    const fromId = dragItem.current;
    const toId = dragOverItem.current;
    setDragging(null);
    if (!fromId || !toId || fromId === toId) { dragItem.current = null; dragOverItem.current = null; return; }

    const fromIdx = filtered.findIndex(i => i.id === fromId);
    const toIdx = filtered.findIndex(i => i.id === toId);
    if (fromIdx === -1 || toIdx === -1) return;

    const reordered = [...filtered];
    const [moved] = reordered.splice(fromIdx, 1);
    reordered.splice(toIdx, 0, moved);

    // Optimistic UI update
    const updatedIds = reordered.map(i => i.id);
    setItems(prev => {
      const rest = prev.filter(i => !updatedIds.includes(i.id));
      return [...reordered, ...rest];
    });

    // Persist sortOrder
    await Promise.all(
      reordered.map((item, idx) => updateMenuItem(rid, item.id, { sortOrder: idx + 1 }))
    );

    dragItem.current = null;
    dragOverItem.current = null;
  };

  const toggleActive = async (item) => {
    try {
      await updateMenuItem(rid, item.id, { isActive: !item.isActive });
      await load();
    } catch {
      toast.error('Failed to update item');
    }
  };

  const toggleSoldOut = async (item) => {
    try {
      const newVal = isSoldOutToday(item) ? null : today;
      await updateMenuItem(rid, item.id, { availableUntil: newVal });
      await load();
    } catch {
      toast.error('Failed to update sold out status');
    }
  };

  const toggleOutOfStock = async (item) => {
    try {
      await updateMenuItem(rid, item.id, { isOutOfStock: !item.isOutOfStock });
      await load();
    } catch {
      toast.error('Failed to update out of stock status');
    }
  };

  return (
    <AdminLayout>
      <Head><title>Menu Items — Advert Radical</title></Head>
      <div style={{ background: T.cream, minHeight: '100vh', padding: 32, fontFamily: T.font }}>
        <div style={{ maxWidth: 1000, margin: '0 auto' }}>
          <style>{`
            @keyframes spin{to{transform:rotate(360deg)}}
            .inp:focus{border-color:${T.accent}!important;box-shadow:0 0 0 3px ${T.accentSubtle}!important}
            .inp::placeholder{color:${T.stone}}
            .item-row:hover{background:${T.accentLight}!important}
            .act-btn:hover{opacity:1!important}
            [draggable]{user-select:none}
          `}</style>

          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 28, flexWrap: 'wrap', gap: 12 }}>
            <div>
              <h1 style={S.h1}>Menu Items</h1>
              <p style={S.sub}>Manage, edit, reorder and add offers to your approved AR menu items.</p>
            </div>
            <div style={{ padding: '10px 18px', borderRadius: T.radiusPill, background: T.accentLight, border: `1px solid ${T.sand}`, fontSize: 13, fontWeight: 600, color: T.success, fontFamily: T.font, letterSpacing: '-0.1px' }}>
              {items.filter(i => i.isActive).length} active · {items.length} total
            </div>
          </div>

          {/* Search + filter bar */}
          <div style={{ display: 'flex', gap: 10, marginBottom: 20, flexWrap: 'wrap' }}>
            <div style={{ position: 'relative', flex: 1, minWidth: 200 }}>
              <span style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: T.stone, fontSize: 14, opacity: 0.6 }}>🔍</span>
              <input className="inp" style={{ ...S.input, paddingLeft: 38, borderRadius: T.radiusPill, border: `1.5px solid ${T.sand}`, background: T.white, boxShadow: '0 1px 3px rgba(38,52,49,0.04)' }} value={search} onChange={e => setSearch(e.target.value)} placeholder="Search items…" />
            </div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {categories.map(c => (
                <button key={c} onClick={() => setCatFilter(c)} style={{ padding: '8px 18px', borderRadius: T.radiusPill, border: catFilter === c ? `1.5px solid ${T.accent}` : `1.5px solid ${T.sand}`, fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: T.font, textTransform: 'capitalize', background: catFilter === c ? T.accent : T.white, color: catFilter === c ? T.cream : T.stone, boxShadow: catFilter === c ? T.shadowBtn : 'none', transition: 'all 0.18s ease', letterSpacing: '-0.1px' }}>
                  {c === 'all' ? `All (${items.length})` : c}
                </button>
              ))}
            </div>
          </div>

          {/* Legend */}
          <div style={{ display: 'flex', gap: 16, marginBottom: 16, flexWrap: 'wrap' }}>
            {[['⠿ drag', 'Reorder priority'], ['✦', 'Popular badge'], ['🏷', 'Offer / badge'], ['◐', 'Active toggle']].map(([icon, label]) => (
              <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: T.stone, fontFamily: T.font }}>
                <span style={{ fontSize: 12 }}>{icon}</span>{label}
              </div>
            ))}
          </div>

          {loading ? (
            <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 60 }}>
              <div style={{ width: 32, height: 32, border: `3px solid ${T.accent}`, borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
            </div>
          ) : filtered.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '60px 0', color: 'rgba(38,52,49,0.4)' }}>
              <div style={{ fontSize: 40, marginBottom: 12 }}>🍽️</div>
              <p style={{ fontSize: 14 }}>No items yet. Submit a request to get AR items approved.</p>
            </div>
          ) : (
            <div style={{ ...S.card, overflow: 'hidden' }}>
              {/* Table header */}
              <div style={{ display: 'grid', gridTemplateColumns: '40px 56px 1fr 90px 90px 80px 100px 110px auto', gap: 0, padding: '12px 18px', borderBottom: `1px solid ${T.sand}`, background: T.accentLight }}>
                {['', '', 'Item', 'Category', 'Prep', 'Spice', 'Status', 'Stock', 'Actions'].map(h => (
                  <div key={h} style={{ fontSize: 10, fontWeight: 700, color: T.stone, letterSpacing: '0.08em', textTransform: 'uppercase', fontFamily: T.font }}>{h}</div>
                ))}
              </div>

              {filtered.map((item, idx) => {
                const isEdit = editId === item.id;
                const popularity = (item.views || 0) + (item.arViews || 0) * 2;
                return (
                  <div key={item.id}>
                    {/* Main row */}
                    <div
                      className="item-row"
                      draggable
                      onDragStart={() => { dragItem.current = item.id; setDragging(item.id); }}
                      onDragEnter={() => { dragOverItem.current = item.id; }}
                      onDragEnd={handleDragEnd}
                      onDragOver={e => e.preventDefault()}
                      style={{ display: 'grid', gridTemplateColumns: '40px 56px 1fr 90px 90px 80px 100px 110px auto', gap: 0, padding: '13px 18px', borderBottom: isEdit ? 'none' : `1px solid ${T.cream}`, alignItems: 'center', background: dragging === item.id ? T.warningLight : dragOverItem.current === item.id && dragging && dragging !== item.id ? T.successLight : T.white, transition: 'background 0.12s', opacity: !item.isActive ? 0.4 : isSoldOutToday(item) ? 0.65 : 1, cursor: dragging ? 'grabbing' : 'default', outline: dragOverItem.current === item.id && dragging && dragging !== item.id ? `2px dashed ${T.success}` : 'none' }}>

                      {/* Drag handle */}
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'grab', color: T.sand, fontSize: 16, userSelect: 'none' }} title="Drag to reorder">⠿</div>

                      {/* Image */}
                      <div style={{ width: 44, height: 44, borderRadius: 12, overflow: 'hidden', background: T.cream, flexShrink: 0 }}>
                        {item.imageURL ? <img src={item.imageURL} alt={item.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20 }}>🍽️</div>}
                      </div>

                      {/* Name + badges */}
                      <div style={{ minWidth: 0, paddingRight: 8 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                          <span style={{ fontWeight: 600, fontSize: 13, color: T.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontFamily: T.font }}>{item.name}</span>
                          {item.isPopular && <span style={{ fontSize: 9, fontWeight: 700, color: '#C4A86D', background: 'rgba(196,168,109,0.12)', border: '1px solid rgba(196,168,109,0.25)', borderRadius: T.radiusPill, padding: '2px 9px', flexShrink: 0, letterSpacing: '0.03em', textTransform: 'uppercase' }}>Popular</span>}
                          {item.offerBadge && item.offerLabel && <span style={{ fontSize: 9, fontWeight: 700, color: T.white, background: `linear-gradient(135deg, ${item.offerColor || T.accent}, ${item.offerColor || T.accent}dd)`, borderRadius: T.radiusPill, padding: '3px 10px', flexShrink: 0, letterSpacing: '0.03em', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>{item.offerLabel}</span>}
                          {isSoldOutToday(item) && <span style={{ fontSize: 9, fontWeight: 700, color: T.white, background: T.danger, borderRadius: T.radiusPill, padding: '3px 10px', flexShrink: 0, letterSpacing: '0.04em' }}>SOLD OUT</span>}
                          {item.isOutOfStock && <span style={{ fontSize: 9, fontWeight: 700, color: T.white, background: '#6B2020', borderRadius: T.radiusPill, padding: '3px 10px', flexShrink: 0, letterSpacing: '0.04em' }}>OUT OF STOCK</span>}
                        </div>
                        {item.description && <div style={{ fontSize: 11, color: T.stone, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', opacity: 0.7 }}>{item.description}</div>}
                        <div style={{ display: 'flex', gap: 8, marginTop: 3, alignItems: 'center' }}>
                          {item.price && <span style={{ fontSize: 12, fontWeight: 700, color: T.ink, fontFamily: T.font }}>₹{item.price}</span>}
                          <span style={{ fontSize: 10, color: T.stone, opacity: 0.6 }}>{(item.views || 0) + (item.arViews || 0)} views</span>
                        </div>
                      </div>

                      {/* Category */}
                      <div style={{ fontSize: 12, color: T.stone, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontFamily: T.font }}>{item.category || '—'}</div>

                      {/* Prep time */}
                      <div style={{ fontSize: 11, color: T.stone, fontFamily: T.font, opacity: 0.7 }}>{item.prepTime ? `${item.prepTime}` : '—'}</div>

                      {/* Spice */}
                      <div>
                        {item.spiceLevel && item.spiceLevel !== 'None' ? (
                          <span style={{ fontSize: 10, fontWeight: 600, padding: '3px 10px', borderRadius: T.radiusPill, background: (SPICE_COLORS[item.spiceLevel] || '#ccc') + '15', color: SPICE_COLORS[item.spiceLevel] || '#999', border: `1px solid ${(SPICE_COLORS[item.spiceLevel] || '#ccc')}30`, fontFamily: T.font }}>{item.spiceLevel}</span>
                        ) : <span style={{ fontSize: 11, color: T.sand }}>—</span>}
                      </div>

                      {/* Active toggle */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <div onClick={() => toggleActive(item)} style={{ width: 36, height: 20, borderRadius: 99, background: item.isActive ? T.success : T.sand, cursor: 'pointer', position: 'relative', transition: 'background 0.2s', flexShrink: 0 }}>
                          <div style={{ width: 14, height: 14, borderRadius: '50%', background: T.white, position: 'absolute', top: 3, left: item.isActive ? 19 : 3, transition: 'left 0.2s', boxShadow: '0 1px 4px rgba(0,0,0,0.15)' }} />
                        </div>
                        <span style={{ fontSize: 11, color: item.isActive ? T.success : T.stone, fontWeight: item.isActive ? 600 : 400, fontFamily: T.font }}>{item.isActive ? 'On' : 'Off'}</span>
                      </div>

                      {/* Stock availability — dedicated column */}
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        <button onClick={() => toggleSoldOut(item)}
                          title={isSoldOutToday(item) ? 'Mark as available today' : 'Mark sold out today'}
                          style={{ padding: '4px 12px', borderRadius: T.radiusPill, border: isSoldOutToday(item) ? `1px solid ${T.success}` : `1px solid ${T.sand}`, background: isSoldOutToday(item) ? T.successLight : T.white, color: isSoldOutToday(item) ? T.success : T.stone, fontSize: 10, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap', fontFamily: T.font, transition: 'all 0.15s' }}>
                          {isSoldOutToday(item) ? 'Today ✓' : 'Today'}
                        </button>
                        <button onClick={() => toggleOutOfStock(item)}
                          title={item.isOutOfStock ? 'Mark as in stock' : 'Mark permanently out of stock'}
                          style={{ padding: '4px 12px', borderRadius: T.radiusPill, border: item.isOutOfStock ? `1px solid ${T.danger}` : `1px solid ${T.sand}`, background: item.isOutOfStock ? T.dangerLight : T.white, color: item.isOutOfStock ? T.danger : T.stone, fontSize: 10, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap', fontFamily: T.font, transition: 'all 0.15s' }}>
                          {item.isOutOfStock ? 'Perm ✕' : 'Perm'}
                        </button>
                      </div>

                      {/* Actions — Edit + Delete only */}
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button onClick={() => isEdit ? cancelEdit() : startEdit(item)} style={{ padding: '5px 14px', borderRadius: T.radiusBtn, border: `1.5px solid ${isEdit ? T.danger : T.sand}`, background: isEdit ? T.dangerLight : 'transparent', color: isEdit ? T.danger : T.stone, fontSize: 12, fontWeight: 600, cursor: 'pointer', transition: 'all 0.15s', fontFamily: T.font }}>
                          {isEdit ? 'Cancel' : 'Edit'}
                        </button>
                        <button onClick={() => handleDelete(item)} disabled={deleting === item.id} style={{ width: 30, height: 30, borderRadius: 8, border: `1px solid ${T.sand}`, background: 'transparent', color: T.danger, fontSize: 13, fontWeight: 500, cursor: 'pointer', opacity: deleting === item.id ? 0.4 : 0.6, display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.15s', padding: 0 }}>
                          {deleting === item.id ? '…' : '✕'}
                        </button>
                      </div>
                    </div>

                    {/* Edit panel */}
                    {isEdit && (
                      <div style={{ background: T.accentLight, borderBottom: `1px solid ${T.sand}`, padding: '20px 18px 24px' }}>
                        <div style={{ fontFamily: T.font, fontWeight: 700, fontSize: 13, color: T.ink, marginBottom: 18 }}>Editing: {item.name}</div>

                        {/* Cover image upload */}
                        <div style={{ background: '#fff', borderRadius: 14, padding: 16, marginBottom: 16, border: '1px solid rgba(38,52,49,0.07)' }}>
                          <label style={{ ...S.label, marginBottom: 10 }}>📸 Cover Image</label>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                            <div style={{ width: 64, height: 64, borderRadius: 14, overflow: 'hidden', background: '#EAE7E3', flexShrink: 0 }}>
                              {item.imageURL
                                ? <img src={item.imageURL} alt={item.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                : <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 28 }}>🍽️</div>}
                            </div>
                            <div>
                              <div style={{ fontSize: 11, color: 'rgba(38,52,49,0.45)', marginBottom: 8 }}>JPG, PNG · Max 5MB · Shown on menu card</div>
                              <input
                                type="file" accept="image/*" style={{ display: 'none' }}
                                ref={el => { if (el) imgInputRef.current[item.id] = el; }}
                                onChange={e => handleImageUpload(item, e.target.files[0])}
                              />
                              <button
                                onClick={() => imgInputRef.current[item.id]?.click()}
                                disabled={imgUpload[item.id]?.uploading}
                                style={{ padding: '8px 16px', borderRadius: 10, border: '1.5px solid rgba(38,52,49,0.12)', background: 'transparent', fontSize: 12, fontWeight: 600, color: 'rgba(38,52,49,0.6)', cursor: 'pointer', opacity: imgUpload[item.id]?.uploading ? 0.6 : 1 }}>
                                {imgUpload[item.id]?.uploading ? `Uploading ${imgUpload[item.id].progress}%…` : item.imageURL ? '↑ Replace Image' : '↑ Upload Image'}
                              </button>
                            </div>
                          </div>
                          {imgUpload[item.id]?.uploading && (
                            <div style={{ height: 4, background: T.cream, borderRadius: 99, overflow: 'hidden', marginTop: 10 }}>
                              <div style={{ height: '100%', background: T.success, borderRadius: 99, width: `${imgUpload[item.id].progress}%`, transition: 'width 0.2s' }} />
                            </div>
                          )}
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 14, marginBottom: 14 }}>
                          <div>
                            <label style={S.label}>Item Name *</label>
                            <input className="inp" style={S.input} value={editData.name} onChange={e => setEditData(d => ({ ...d, name: e.target.value }))} />
                          </div>
                          <div>
                            <label style={S.label}>Category <span style={{ color: '#8A4A42' }}>*</span></label>
                            <input className="inp" style={{ ...S.input, borderColor: !editData.category?.trim() ? 'rgba(138,74,66,0.4)' : undefined }} value={editData.category} onChange={e => setEditData(d => ({ ...d, category: e.target.value }))} placeholder="e.g. Main Course" />
                          </div>
                          <div>
                            <label style={S.label}>Price (₹)</label>
                            <input className="inp" style={S.input} type="number" min="0" value={editData.price} onChange={e => setEditData(d => ({ ...d, price: e.target.value }))} placeholder="e.g. 299" />
                          </div>
                        </div>
                        <div style={{ marginBottom: 14 }}>
                          <label style={S.label}>Description</label>
                          <textarea className="inp" style={{ ...S.input, resize: 'none' }} rows={2} value={editData.description} onChange={e => setEditData(d => ({ ...d, description: e.target.value }))} placeholder="Short description…" />
                        </div>
                    {/* Translations */}
                    <div style={{ gridColumn: '1/-1', padding: '14px 16px', borderRadius: 12, background: 'rgba(74,128,192,0.04)', border: '1px solid rgba(74,128,192,0.12)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                        <div style={{ fontSize: 11, fontWeight: 700, color: 'rgba(38,52,49,0.45)', letterSpacing: '0.04em' }}>🌐 TRANSLATIONS (Optional)</div>
                        <button type="button" onClick={async () => {
                          if (!editData.name?.trim()) { toast.error('Item name is empty'); return; }
                          setTranslatingEdit(true);
                          try {
                            const [nTA, nHI, dTA, dHI] = await Promise.all([
                              autoTranslate(editData.name, 'ta'),
                              autoTranslate(editData.name, 'hi'),
                              editData.description ? autoTranslate(editData.description, 'ta') : Promise.resolve(''),
                              editData.description ? autoTranslate(editData.description, 'hi') : Promise.resolve(''),
                            ]);
                            setEditData(d => ({ ...d, nameTA: nTA || d.nameTA, nameHI: nHI || d.nameHI, descriptionTA: dTA || d.descriptionTA, descriptionHI: dHI || d.descriptionHI }));
                            toast.success('Translations filled! Review and edit if needed.');
                          } catch { toast.error('Translation failed'); }
                          finally { setTranslatingEdit(false); }
                        }} disabled={translatingEdit} style={{ padding: '4px 12px', borderRadius: 7, fontSize: 11, fontWeight: 600, border: '1.5px solid rgba(74,128,192,0.4)', background: 'rgba(74,128,192,0.06)', color: '#5A7A9A', cursor: translatingEdit ? 'not-allowed' : 'pointer', opacity: translatingEdit ? 0.7 : 1, display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0 }}>
                          {translatingEdit ? '⏳ Translating…' : '✦ Auto Translate'}
                        </button>
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
                        <div>
                          <label style={S.label}>Tamil Name</label>
                          <input style={S.input} value={editData.nameTA || ''} onChange={e => setEditData(d => ({ ...d, nameTA: e.target.value }))} placeholder="தமிழ் பெயர்" />
                        </div>
                        <div>
                          <label style={S.label}>Hindi Name</label>
                          <input style={S.input} value={editData.nameHI || ''} onChange={e => setEditData(d => ({ ...d, nameHI: e.target.value }))} placeholder="हिंदी नाम" />
                        </div>
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                        <div>
                          <label style={S.label}>Tamil Description</label>
                          <input style={S.input} value={editData.descriptionTA || ''} onChange={e => setEditData(d => ({ ...d, descriptionTA: e.target.value }))} placeholder="தமிழ் விளக்கம்" />
                        </div>
                        <div>
                          <label style={S.label}>Hindi Description</label>
                          <input style={S.input} value={editData.descriptionHI || ''} onChange={e => setEditData(d => ({ ...d, descriptionHI: e.target.value }))} placeholder="हिंदी विवरण" />
                        </div>
                      </div>
                    </div>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 14, marginBottom: 14 }}>
                          <div>
                            <label style={S.label}>⏱ Prep Time</label>
                            <input className="inp" style={S.input} value={editData.prepTime} onChange={e => setEditData(d => ({ ...d, prepTime: e.target.value }))} placeholder="10–15 minutes" />
                          </div>
                          <div>
                            <label style={S.label}>🌶 Spice Level <span style={{ color: '#8A4A42' }}>*</span></label>
                            <select className="inp" style={S.input} value={editData.spiceLevel} onChange={e => setEditData(d => ({ ...d, spiceLevel: e.target.value }))}>
                              {SPICE_LEVELS.map(s => <option key={s} value={s}>{s}</option>)}
                            </select>
                          </div>
                          <div>
                            <label style={S.label}>Priority Order</label>
                            <input className="inp" style={S.input} type="number" min="1" value={editData.sortOrder} onChange={e => setEditData(d => ({ ...d, sortOrder: e.target.value }))} placeholder="1 = first" />
                          </div>
                        </div>

                        {/* Veg / Non-Veg required field */}
                        <div style={{ marginBottom: 14 }}>
                          <label style={{ ...S.label, marginBottom: 8 }}>Veg / Non-Veg <span style={{ color: '#8A4A42' }}>*</span></label>
                          <div style={{ display: 'flex', gap: 10 }}>
                            {[{ val: true, label: '🟢 Veg', bg: '#4A7A5E' }, { val: false, label: '🔴 Non-Veg', bg: '#C0392B' }].map(({ val, label, bg }) => (
                              <button key={String(val)}
                                onClick={() => setEditData(d => ({ ...d, isVeg: val }))}
                                style={{
                                  padding: '9px 22px', borderRadius: 50, border: `2px solid ${editData.isVeg === val ? bg : 'rgba(38,52,49,0.12)'}`,
                                  background: editData.isVeg === val ? bg + '18' : '#fff',
                                  fontSize: 13, fontWeight: 700, color: editData.isVeg === val ? bg : 'rgba(38,52,49,0.45)',
                                  cursor: 'pointer', transition: 'all 0.15s'
                                }}>
                                {label}
                              </button>
                            ))}
                            {(editData.isVeg === undefined || editData.isVeg === null || editData.isVeg === '') && (
                              <span style={{ fontSize: 11, color: '#8A4A42', alignSelf: 'center', marginLeft: 4 }}>Required</span>
                            )}
                          </div>
                        </div>

                        {/* Offer badge section */}
                        <div style={{ background: '#fff', borderRadius: 14, padding: '16px', marginBottom: 14, border: '1px solid rgba(38,52,49,0.07)' }}>
                          <label style={{ ...S.label, marginBottom: 10 }}>🏷 Offer / Badge</label>
                          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: editData.offerBadge === 'Custom…' ? 12 : 0 }}>
                            <button onClick={() => setEditData(d => ({ ...d, offerBadge: '', offerLabel: '' }))} style={{ padding: '6px 14px', borderRadius: 20, border: `1.5px solid ${!editData.offerBadge ? 'rgba(38,52,49,0.4)' : 'rgba(38,52,49,0.1)'}`, background: !editData.offerBadge ? 'rgba(38,52,49,0.07)' : 'transparent', fontSize: 12, fontWeight: 600, color: 'rgba(38,52,49,0.6)', cursor: 'pointer' }}>None</button>
                            {OFFER_BADGES.map(b => (
                              <button key={b.label} onClick={() => setEditData(d => ({ ...d, offerBadge: b.label, offerLabel: b.label === 'Custom…' ? d.offerLabel : b.label, offerColor: b.color }))} style={{ padding: '6px 14px', borderRadius: 20, border: `1.5px solid ${editData.offerBadge === b.label ? b.color : 'rgba(38,52,49,0.1)'}`, background: editData.offerBadge === b.label ? b.color + '22' : 'transparent', fontSize: 12, fontWeight: 700, color: editData.offerBadge === b.label ? b.color : 'rgba(38,52,49,0.5)', cursor: 'pointer' }}>
                                {b.label}
                              </button>
                            ))}
                          </div>
                          {editData.offerBadge === 'Custom…' && (
                            <input className="inp" style={{ ...S.input, marginTop: 8 }} value={customBadge} onChange={e => setCustomBadge(e.target.value)} placeholder="Enter custom badge text e.g. '30% Off Tonight'" />
                          )}
                        </div>

                        {/* Flags row */}
                        <div style={{ display: 'flex', gap: 16, marginBottom: 18, flexWrap: 'wrap' }}>
                          {[['isPopular', '✦ Mark as Popular', 'Show popular badge on menu'], ['isFeatured', '⭐ Feature this item', 'Appear at top of category'], ['isActive', '👁 Visible on menu', 'Customers can see this item']].map(([key, title, desc]) => (
                            <div key={key} onClick={() => setEditData(d => ({ ...d, [key]: !d[key] }))} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 16px', borderRadius: 12, border: `1.5px solid ${editData[key] ? T.success + '55' : T.sand}`, background: editData[key] ? T.successLight : T.white, cursor: 'pointer', transition: 'all 0.15s' }}>
                              <div style={{ width: 32, height: 18, borderRadius: 99, background: editData[key] ? T.success : T.sand, position: 'relative', transition: 'background 0.2s', flexShrink: 0 }}>
                                <div style={{ width: 12, height: 12, borderRadius: '50%', background: T.white, position: 'absolute', top: 3, left: editData[key] ? 17 : 3, transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.15)' }} />
                              </div>
                              <div>
                                <div style={{ fontSize: 12, fontWeight: 700, color: T.ink, fontFamily: T.font }}>{title}</div>
                                <div style={{ fontSize: 10, color: T.stone }}>{desc}</div>
                              </div>
                            </div>
                          ))}
                        </div>

                        {/* ── Pairs Well With ── */}
                        <div style={{ background: '#fff', borderRadius: 14, padding: '16px', marginBottom: 14, border: '1px solid rgba(38,52,49,0.07)' }}>
                          <label style={{ ...S.label, marginBottom: 10 }}>✨ Pairs Well With <span style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0, fontSize: 11 }}>— pick up to 3 items shown in modal</span></label>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
                            {items.filter(i => i.id !== editId).map(i => {
                              const sel = (editData.pairsWith || []).includes(i.id);
                              const maxed = (editData.pairsWith || []).length >= 3 && !sel;
                              return (
                                <button key={i.id}
                                  onClick={() => {
                                    if (maxed) return;
                                    setEditData(d => ({
                                      ...d,
                                      pairsWith: sel
                                        ? (d.pairsWith || []).filter(x => x !== i.id)
                                        : [...(d.pairsWith || []), i.id]
                                    }));
                                  }}
                                  style={{ padding: '5px 12px', borderRadius: 20, fontSize: 12, fontWeight: 600, cursor: maxed ? 'not-allowed' : 'pointer', border: `1.5px solid ${sel ? 'rgba(196,168,109,0.6)' : 'rgba(38,52,49,0.1)'}`, background: sel ? 'rgba(196,168,109,0.1)' : '#F0EFED', color: sel ? '#A06010' : 'rgba(38,52,49,0.5)', opacity: maxed ? 0.4 : 1, transition: 'all 0.15s' }}>
                                  {sel ? '✓ ' : ''}{i.name}
                                </button>
                              );
                            })}
                          </div>
                          {(editData.pairsWith || []).length > 0 && (
                            <div style={{ marginTop: 8, fontSize: 11, color: 'rgba(38,52,49,0.4)' }}>
                              Selected: {(editData.pairsWith || []).map(id => items.find(i => i.id === id)?.name).filter(Boolean).join(', ')}
                            </div>
                          )}
                        </div>

                        <div style={{ display: 'flex', gap: 10 }}>
                          <button onClick={saveEdit} disabled={saving} style={{ padding: '11px 28px', borderRadius: T.radiusBtn, border: 'none', background: T.accent, color: T.cream, fontSize: 14, fontWeight: 700, fontFamily: T.font, cursor: 'pointer', opacity: saving ? 0.6 : 1, boxShadow: T.shadowBtn, transition: 'all 0.15s' }}>
                            {saving ? 'Saving…' : 'Save Changes'}
                          </button>
                          <button onClick={cancelEdit} style={{ padding: '11px 20px', borderRadius: T.radiusBtn, border: `1.5px solid ${T.sand}`, background: 'transparent', fontSize: 13, fontWeight: 600, color: T.stone, cursor: 'pointer', fontFamily: T.font }}>
                            Cancel
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* Popularity insight card */}
          {!loading && items.length > 0 && (
            <div style={{ ...S.card, padding: 24, marginTop: 20 }}>
              <div style={{ fontFamily: T.fontDisplay, fontWeight: 700, fontSize: 16, color: T.ink, marginBottom: 16 }}>Most Popular Items</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {[...items]
                  .sort((a, b) => ((b.views || 0) + (b.arViews || 0) * 2) - ((a.views || 0) + (a.arViews || 0) * 2))
                  .slice(0, 5)
                  .map((item, i) => {
                    const score = (item.views || 0) + (item.arViews || 0) * 2;
                    const maxScore = (items[0]?.views || 0) + (items[0]?.arViews || 0) * 2 || 1;
                    const pct = Math.max(8, Math.round((score / Math.max(...items.map(x => (x.views || 0) + (x.arViews || 0) * 2), 1)) * 100));
                    return (
                      <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <span style={{ fontSize: 11, color: T.stone, width: 16, textAlign: 'right', flexShrink: 0, fontFamily: T.font, fontWeight: 600 }}>#{i + 1}</span>
                        <div style={{ width: 32, height: 32, borderRadius: 10, overflow: 'hidden', background: T.cream, flexShrink: 0 }}>
                          {item.imageURL ? <img src={item.imageURL} alt={item.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <span style={{ fontSize: 16, lineHeight: '32px', display: 'block', textAlign: 'center' }}>🍽️</span>}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                            <span style={{ fontSize: 13, fontWeight: 600, color: T.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontFamily: T.font }}>{item.name}</span>
                            <span style={{ fontSize: 11, color: T.stone, flexShrink: 0, marginLeft: 8, opacity: 0.6 }}>{item.views || 0} views · {item.arViews || 0} AR</span>
                          </div>
                          <div style={{ height: 5, background: T.cream, borderRadius: 99, overflow: 'hidden' }}>
                            <div style={{ height: '100%', borderRadius: 99, background: i === 0 ? '#C4A86D' : i === 1 ? T.success : T.sand, width: `${pct}%` }} />
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