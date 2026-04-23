// pages/admin/items.js
import Head from 'next/head';
import { useEffect, useState, useRef, useMemo } from 'react';
import { useAuth } from '../../hooks/useAuth';
import AdminLayout from '../../components/layout/AdminLayout';
import { getAllMenuItems, updateMenuItem, deleteMenuItem, getCombos, getAllOffers, todayKey } from '../../lib/db';
import { uploadFile, buildImagePath, fileSizeMB } from '../../lib/storage';
import toast from 'react-hot-toast';

// ═══ Aspire palette ═══
const INTER = "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
const A = {
  font: INTER, mono: "'JetBrains Mono', monospace",
  cream: '#EDEDED', ink: '#1A1A1A',
  shell: '#FFFFFF', shellDarker: '#FAFAF8',
  warning: '#C4A86D', warningDim: '#A08656',
  success: '#3F9E5A', danger: '#D9534F',
  mutedText: 'rgba(0,0,0,0.55)', faintText: 'rgba(0,0,0,0.38)',
  subtleBg: 'rgba(0,0,0,0.04)',
  border: '1px solid rgba(0,0,0,0.06)',
  borderStrong: '1px solid rgba(0,0,0,0.10)',
  shadowCard: '0 2px 10px rgba(38,52,49,0.03)',
  forest: '#1A1A1A', forestDarker: '#2A2A2A',
  forestText: '#EAE7E3', forestTextMuted: 'rgba(234,231,227,0.55)', forestTextFaint: 'rgba(234,231,227,0.35)',
  forestBorder: '1px solid rgba(255,255,255,0.06)',
};

// ═══ Constants — preserved from original ═══
const SPICE_LEVELS = ['None', 'Mild', 'Medium', 'Spicy', 'Very Spicy'];
const SPICE_COLORS = {
  None: '#8FC4A8',
  Mild: '#D4B878',
  Medium: '#C4A86D',
  Spicy: '#C07050',
  'Very Spicy': '#B04040',
};
const OFFER_BADGES = [
  { label: "Chef's Special",  color: '#7A5EA0' },
  { label: 'Best Seller',     color: '#C4A86D' },
  { label: 'Must Try',        color: '#3F9E5A' },
  { label: 'New',             color: '#5E8AC0' },
  { label: 'Limited',         color: '#C07050' },
  { label: 'Custom…',         color: '#1A1A1A' },
];

// ═══ Auto-translation via MyMemory ═══
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

// ═══ Drag handle icon (replaces ⠿) ═══
const DragHandleIcon = ({ color = 'rgba(0,0,0,0.35)' }) => (
  <svg width="12" height="16" viewBox="0 0 12 16" fill="none" xmlns="http://www.w3.org/2000/svg">
    <circle cx="3" cy="3" r="1.2" fill={color} />
    <circle cx="9" cy="3" r="1.2" fill={color} />
    <circle cx="3" cy="8" r="1.2" fill={color} />
    <circle cx="9" cy="8" r="1.2" fill={color} />
    <circle cx="3" cy="13" r="1.2" fill={color} />
    <circle cx="9" cy="13" r="1.2" fill={color} />
  </svg>
);

export default function AdminItems() {
  const { userData } = useAuth();
  const rid = userData?.restaurantId;

  const [items, setItems] = useState([]);
  const [combos, setCombos] = useState([]);
  const [offers, setOffers] = useState([]);
  const [loaded, setLoaded] = useState(false);

  // Filter UI
  const [search, setSearch] = useState('');
  const [catFilter, setCatFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all'); // 'all' | 'active' | 'hidden' | 'oos' | 'sold-out-today'

  // Drawer form state
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState({});
  const [saving, setSaving] = useState(false);
  const [customBadge, setCustomBadge] = useState('');
  const [translatingEdit, setTranslatingEdit] = useState(false);

  const [deleting, setDeleting] = useState(null);
  const [imgUpload, setImgUpload] = useState({}); // { [itemId]: { uploading, progress } }
  const imgInputRef = useRef({});

  // Drag and drop
  const dragItem = useRef(null);
  const dragOverItem = useRef(null);
  const [dragging, setDragging] = useState(null);

  const today = todayKey();
  const isSoldOutToday = (item) => item.availableUntil === today;

  const load = async () => {
    if (!rid) return;
    try {
      const [m, c, o] = await Promise.all([
        getAllMenuItems(rid),
        getCombos(rid).catch(() => []),
        getAllOffers(rid).catch(() => []),
      ]);
      const sorted = m.sort((a, b) => {
        const ao = a.sortOrder ?? 9999, bo = b.sortOrder ?? 9999;
        if (ao !== bo) return ao - bo;
        return (a.createdAt?.seconds || 0) - (b.createdAt?.seconds || 0);
      });
      setItems(sorted);
      setCombos(c);
      setOffers(o);
    } catch (e) { console.error('Items load failed:', e); }
    finally { setLoaded(true); }
  };
  useEffect(() => { load(); }, [rid]);

  // ═══ Cross-reference map: itemId → { combos: [name], offers: [title] } ═══
  const itemRefs = useMemo(() => {
    const refs = {};
    combos.forEach(c => {
      (c.itemIds || []).forEach(id => {
        if (!refs[id]) refs[id] = { combos: [], offers: [] };
        refs[id].combos.push(c.name);
      });
    });
    offers.forEach(o => {
      if (o.linkedItemId) {
        if (!refs[o.linkedItemId]) refs[o.linkedItemId] = { combos: [], offers: [] };
        refs[o.linkedItemId].offers.push(o.title);
      }
    });
    return refs;
  }, [combos, offers]);

  // ═══ Categories ═══
  const categories = useMemo(() => {
    const cats = Array.from(new Set(items.map(i => i.category).filter(Boolean))).sort();
    return ['all', ...cats];
  }, [items]);

  // ═══ Stats for dark strip ═══
  const stats = useMemo(() => {
    const active = items.filter(i => i.isActive !== false).length;
    const hidden = items.filter(i => i.isActive === false).length;
    const oos = items.filter(i => i.isOutOfStock).length;
    const soldOut = items.filter(i => isSoldOutToday(i)).length;
    return { total: items.length, active, hidden, oos, soldOut };
  }, [items]);

  // ═══ Filtered display ═══
  const displayed = useMemo(() => {
    const q = search.trim().toLowerCase();
    let list = items.filter(item => {
      if (catFilter !== 'all' && item.category !== catFilter) return false;
      if (statusFilter === 'active' && item.isActive === false) return false;
      if (statusFilter === 'hidden' && item.isActive !== false) return false;
      if (statusFilter === 'oos' && !item.isOutOfStock) return false;
      if (statusFilter === 'sold-out-today' && !isSoldOutToday(item)) return false;
      if (q && !(item.name || '').toLowerCase().includes(q) && !(item.description || '').toLowerCase().includes(q)) return false;
      return true;
    });
    // Sold-out-today items sink to the bottom
    return list.sort((a, b) => (isSoldOutToday(a) ? 1 : 0) - (isSoldOutToday(b) ? 1 : 0));
  }, [items, search, catFilter, statusFilter, today]);

  // ═══ Drawer open/close ═══
  const openEdit = (item) => {
    setEditingId(item.id);
    setForm({
      name: item.name || '',
      nameTA: item.nameTA || '',
      nameHI: item.nameHI || '',
      description: item.description || '',
      descriptionTA: item.descriptionTA || '',
      descriptionHI: item.descriptionHI || '',
      category: item.category || '',
      price: item.price != null ? String(item.price) : '',
      prepTime: item.prepTime != null ? String(item.prepTime) : '',
      spiceLevel: item.spiceLevel || 'None',
      isVeg: item.isVeg,
      offerBadge: item.offerBadge ? (item.offerLabel || '') : '',
      offerLabel: item.offerLabel || '',
      offerColor: item.offerColor || '#C07050',
      isPopular: !!item.isPopular,
      isFeatured: !!item.isFeatured,
      isActive: item.isActive !== false,
      isOutOfStock: !!item.isOutOfStock,
      sortOrder: item.sortOrder != null ? String(item.sortOrder) : '',
      // Modifiers — variants (required pick-one, e.g. Half/Full) + addOns
      // (optional multi-select, e.g. Extra cheese). Stored as {name, priceDelta}.
      variants: (item.variants || []).map(v => ({ name: v.name || '', priceDelta: v.priceDelta != null ? String(v.priceDelta) : '' })),
      addOns:   (item.addOns   || []).map(a => ({ name: a.name || '', priceDelta: a.priceDelta != null ? String(a.priceDelta) : '' })),
    });
    setCustomBadge(item.offerBadge && !OFFER_BADGES.find(b => b.label === item.offerLabel) ? (item.offerLabel || '') : '');
    setDrawerOpen(true);
  };
  const closeDrawer = () => { setDrawerOpen(false); setEditingId(null); setForm({}); setCustomBadge(''); };

  useEffect(() => {
    if (!drawerOpen) return;
    const onKey = (e) => { if (e.key === 'Escape') closeDrawer(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [drawerOpen]);

  // ═══ Translate name/description helpers for form ═══
  const handleTranslate = async () => {
    if (!form.name?.trim() && !form.description?.trim()) {
      toast.error('Add name or description first');
      return;
    }
    setTranslatingEdit(true);
    try {
      const [nameTA, nameHI, descTA, descHI] = await Promise.all([
        form.name ? autoTranslate(form.name, 'ta') : Promise.resolve(''),
        form.name ? autoTranslate(form.name, 'hi') : Promise.resolve(''),
        form.description ? autoTranslate(form.description, 'ta') : Promise.resolve(''),
        form.description ? autoTranslate(form.description, 'hi') : Promise.resolve(''),
      ]);
      setForm(f => ({
        ...f,
        nameTA: nameTA || f.nameTA,
        nameHI: nameHI || f.nameHI,
        descriptionTA: descTA || f.descriptionTA,
        descriptionHI: descHI || f.descriptionHI,
      }));
      toast.success('Translated!');
    } catch { toast.error('Translation failed'); }
    finally { setTranslatingEdit(false); }
  };

  // ═══ Image upload (row-level) ═══
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
      toast.success('Image updated');
    } catch (e) { toast.error('Upload failed: ' + e.message); }
    finally { setImgUpload(u => ({ ...u, [item.id]: { uploading: false, progress: 0 } })); }
  };

  // ═══ Save drawer form ═══
  const handleSave = async () => {
    if (!form.name?.trim()) return toast.error('Item name is required');
    if (!form.category?.trim()) return toast.error('Category is required');
    if (form.isVeg === undefined || form.isVeg === null || form.isVeg === '') return toast.error('Please mark item as Veg or Non-Veg');
    if (!form.spiceLevel) return toast.error('Spice level is required');

    setSaving(true);
    try {
      const finalLabel = form.offerBadge === 'Custom…' ? customBadge : form.offerBadge;
      // Sanitize modifier arrays — drop blank names, coerce priceDelta → number.
      const cleanVariants = (form.variants || [])
        .filter(v => v.name && v.name.trim())
        .map(v => ({ name: v.name.trim(), priceDelta: Number(v.priceDelta) || 0 }));
      const cleanAddOns = (form.addOns || [])
        .filter(a => a.name && a.name.trim())
        .map(a => ({ name: a.name.trim(), priceDelta: Number(a.priceDelta) || 0 }));

      await updateMenuItem(rid, editingId, {
        name: form.name.trim(),
        nameTA: form.nameTA || '',
        nameHI: form.nameHI || '',
        description: form.description || '',
        descriptionTA: form.descriptionTA || '',
        descriptionHI: form.descriptionHI || '',
        category: form.category.trim(),
        price: form.price !== '' ? Number(form.price) : null,
        prepTime: form.prepTime !== '' ? Number(form.prepTime) : null,
        spiceLevel: form.spiceLevel,
        isVeg: form.isVeg,
        offerLabel: finalLabel || '',
        offerBadge: !!finalLabel,
        offerColor: form.offerColor || '#C07050',
        isPopular: !!form.isPopular,
        isFeatured: !!form.isFeatured,
        isActive: form.isActive !== false,
        isOutOfStock: !!form.isOutOfStock,
        sortOrder: form.sortOrder !== '' ? Number(form.sortOrder) : null,
        variants: cleanVariants,
        addOns:   cleanAddOns,
      });
      toast.success('Item updated');
      closeDrawer();
      await load();
    } catch (e) { toast.error('Save failed: ' + e.message); }
    finally { setSaving(false); }
  };

  // ═══ Delete with cross-ref warning ═══
  const handleDelete = async (item) => {
    const refs = itemRefs[item.id];
    let confirmMsg = `Delete "${item.name}"? This cannot be undone.`;
    if (refs) {
      const parts = [];
      if (refs.combos.length) parts.push(`${refs.combos.length} combo${refs.combos.length === 1 ? '' : 's'} (${refs.combos.slice(0, 3).join(', ')}${refs.combos.length > 3 ? '…' : ''})`);
      if (refs.offers.length) parts.push(`${refs.offers.length} offer${refs.offers.length === 1 ? '' : 's'} (${refs.offers.slice(0, 3).join(', ')}${refs.offers.length > 3 ? '…' : ''})`);
      if (parts.length) {
        confirmMsg = `"${item.name}" is linked in ${parts.join(' and ')}.\n\nDeleting will break those references. Continue?`;
      }
    }
    if (!confirm(confirmMsg)) return;
    setDeleting(item.id);
    try {
      await deleteMenuItem(rid, item.id);
      toast.success(`"${item.name}" deleted`);
      await load();
    } catch { toast.error('Delete failed'); }
    finally { setDeleting(null); }
  };

  // ═══ Drag reorder ═══
  const handleDragEnd = async () => {
    const fromId = dragItem.current;
    const toId = dragOverItem.current;
    setDragging(null);
    if (!fromId || !toId || fromId === toId) { dragItem.current = null; dragOverItem.current = null; return; }

    const fromIdx = displayed.findIndex(i => i.id === fromId);
    const toIdx = displayed.findIndex(i => i.id === toId);
    if (fromIdx === -1 || toIdx === -1) return;

    const reordered = [...displayed];
    const [moved] = reordered.splice(fromIdx, 1);
    reordered.splice(toIdx, 0, moved);

    // Optimistic update
    const updatedIds = reordered.map(i => i.id);
    setItems(prev => {
      const rest = prev.filter(i => !updatedIds.includes(i.id));
      return [...reordered, ...rest];
    });

    await Promise.all(reordered.map((item, idx) => updateMenuItem(rid, item.id, { sortOrder: idx + 1 })));

    dragItem.current = null;
    dragOverItem.current = null;
  };

  // ═══ Row-level toggles ═══
  const toggleActive = async (item) => {
    try { await updateMenuItem(rid, item.id, { isActive: !item.isActive }); await load(); }
    catch { toast.error('Update failed'); }
  };
  const toggleSoldOut = async (item) => {
    try { await updateMenuItem(rid, item.id, { availableUntil: isSoldOutToday(item) ? null : today }); await load(); }
    catch { toast.error('Update failed'); }
  };
  const toggleOutOfStock = async (item) => {
    try { await updateMenuItem(rid, item.id, { isOutOfStock: !item.isOutOfStock }); await load(); }
    catch { toast.error('Update failed'); }
  };

  const canDrag = statusFilter === 'all' && catFilter === 'all' && !search.trim();

  return (
    <AdminLayout>
      <Head><title>Menu Items | Advert Radical</title></Head>
      <div style={{ background: A.cream, minHeight: '100vh', fontFamily: A.font }}>
        <style>{`
          @keyframes pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.4; } }
          @keyframes fadeUp { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }
          @keyframes spin { to { transform: rotate(360deg); } }
          @keyframes slideInRight { from { transform: translateX(100%); } to { transform: none; } }
          @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
          .it-row { transition: all 0.15s; }
          .it-row:hover { background: ${A.shellDarker}; }
          .it-row.dragging { opacity: 0.4; }
          .it-row.over { background: rgba(196,168,109,0.08); }
          .it-tab-pill:hover:not(.active) { background: ${A.subtleBg}; color: ${A.ink}; }
          .it-btn:hover:not(:disabled) { filter: brightness(1.08); }
          .it-ghost:hover { background: ${A.subtleBg}; }
          .it-input:focus { border-color: ${A.warning} !important; background: ${A.shell} !important; }
          .it-drag { cursor: grab; user-select: none; }
          .it-drag:active { cursor: grabbing; }
          .it-badge-tile:hover { border-color: rgba(196,168,109,0.45) !important; }
        `}</style>

        {/* ═══ Header ═══ */}
        <div style={{ padding: '24px 28px 0' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 12, gap: 14, flexWrap: 'wrap' }}>
            <div>
              <div style={{ fontSize: 11, fontWeight: 500, color: A.faintText, marginBottom: 6, letterSpacing: '0.05em', display: 'flex', alignItems: 'center', gap: 6 }}>
                <span>Menu</span>
                <span style={{ opacity: 0.5 }}>›</span>
                <span style={{ color: A.mutedText }}>Items</span>
              </div>
              <div style={{ fontWeight: 600, fontSize: 28, color: A.ink, letterSpacing: '-0.5px', lineHeight: 1.1 }}>
                Menu Items
              </div>
              <div style={{ fontSize: 13, color: A.mutedText, marginTop: 4 }}>
                Edit, translate, and order every dish shown on your live menu
              </div>
            </div>
          </div>

          {/* Stats strip */}
          <div style={{
            background: `linear-gradient(135deg, ${A.forest} 0%, ${A.forestDarker} 100%)`,
            borderRadius: 12, padding: '12px 18px', marginTop: 12, marginBottom: 14,
            border: A.forestBorder, boxShadow: '0 4px 16px rgba(38,52,49,0.12)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 20, flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                <div style={{ width: 6, height: 6, borderRadius: '50%', background: A.warning, animation: 'pulse 2s ease infinite', boxShadow: '0 0 6px rgba(196,168,109,0.6)' }} />
                <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: A.warning }}>DISHES</span>
              </div>
              <div style={{ width: 1, height: 28, background: 'rgba(234,231,227,0.10)', flexShrink: 0 }} />
              <div style={{ display: 'flex', alignItems: 'center', gap: 20, flex: 1, flexWrap: 'wrap' }}>
                <StatTile label="Total" value={stats.total} big color={A.forestText} />
                <Divider />
                <StatTile label="Active" value={stats.active} color={stats.active > 0 ? A.success : A.forestText} />
                <Divider />
                <StatTile label="Hidden" value={stats.hidden} />
                <Divider />
                <StatTile label="Sold out today" value={stats.soldOut} color={stats.soldOut > 0 ? A.warning : A.forestText} />
                <Divider />
                <StatTile label="Out of stock" value={stats.oos} color={stats.oos > 0 ? A.danger : A.forestText} />
              </div>
            </div>
          </div>
        </div>

        {/* ═══ Filter bar ═══ */}
        <div style={{ padding: '0 28px', marginBottom: 14 }}>
          <div style={{
            background: A.shell, border: A.border, borderRadius: 14,
            boxShadow: A.shadowCard, padding: '12px 18px',
            display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap',
          }}>
            {/* Status tabs */}
            <div style={{ display: 'inline-flex', background: A.subtleBg, borderRadius: 10, padding: 3 }}>
              {[
                ['all', 'All', items.length],
                ['active', 'Active', stats.active],
                ['hidden', 'Hidden', stats.hidden],
                ['oos', 'Out of stock', stats.oos],
                ['sold-out-today', 'Sold today', stats.soldOut],
              ].map(([val, label, count]) => {
                const active = statusFilter === val;
                return (
                  <button key={val} className={`it-tab-pill ${active ? 'active' : ''}`}
                    onClick={() => setStatusFilter(val)}
                    style={{
                      padding: '7px 12px', borderRadius: 7, border: 'none', cursor: 'pointer',
                      fontFamily: A.font, fontSize: 12, fontWeight: active ? 700 : 600,
                      background: active ? A.ink : 'transparent',
                      color: active ? A.cream : A.mutedText,
                      display: 'inline-flex', alignItems: 'center', gap: 6, transition: 'all 0.15s',
                      whiteSpace: 'nowrap',
                    }}>
                    {label}
                    {count > 0 && (
                      <span style={{
                        padding: '1px 6px', borderRadius: 8,
                        background: active ? 'rgba(237,237,237,0.18)' : 'rgba(196,168,109,0.20)',
                        color: active ? A.cream : A.warningDim,
                        fontSize: 10, fontWeight: 700, fontFamily: A.mono,
                      }}>{count}</span>
                    )}
                  </button>
                );
              })}
            </div>
            <span style={{ width: 1, height: 22, background: 'rgba(0,0,0,0.10)' }} />
            <input className="it-input"
              value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search dishes…"
              style={{
                flex: 1, minWidth: 200, padding: '8px 12px', borderRadius: 8,
                border: A.border, background: A.shellDarker,
                fontSize: 13, fontFamily: A.font, color: A.ink,
                outline: 'none', transition: 'all 0.15s',
              }} />
            <span style={{ fontSize: 12, color: A.faintText, fontWeight: 500 }}>
              {displayed.length} of {items.length}
            </span>
          </div>

          {/* Category pills */}
          {categories.length > 2 && (
            <div style={{ display: 'flex', gap: 6, marginTop: 10, flexWrap: 'wrap' }}>
              {categories.map(cat => {
                const active = catFilter === cat;
                const count = cat === 'all' ? items.length : items.filter(i => i.category === cat).length;
                return (
                  <button key={cat} onClick={() => setCatFilter(cat)}
                    style={{
                      padding: '6px 12px', borderRadius: 7, border: A.border,
                      background: active ? A.ink : A.shell,
                      color: active ? A.cream : A.mutedText,
                      fontSize: 12, fontWeight: active ? 700 : 500, cursor: 'pointer',
                      fontFamily: A.font, transition: 'all 0.15s',
                      display: 'inline-flex', alignItems: 'center', gap: 6,
                    }}>
                    {cat === 'all' ? 'All categories' : cat}
                    <span style={{
                      padding: '1px 5px', borderRadius: 6,
                      background: active ? 'rgba(237,237,237,0.18)' : A.subtleBg,
                      color: active ? A.cream : A.faintText,
                      fontSize: 10, fontWeight: 700, fontFamily: A.mono,
                    }}>{count}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* ═══ Table ═══ */}
        <div style={{ padding: '0 28px 80px' }}>
          {!loaded ? (
            <LoadingCard />
          ) : displayed.length === 0 ? (
            <EmptyCard
              titleText={items.length === 0 ? 'No menu items yet' : 'No items match your filter'}
              subtitleText={items.length === 0
                ? 'Menu items appear here once customers request AR models for your dishes. Meanwhile, you can create placeholders via Firestore or upload directly.'
                : 'Try clearing filters or search terms.'}
            />
          ) : (
            <div style={{
              background: A.shell, borderRadius: 14, border: A.border,
              boxShadow: A.shadowCard, overflow: 'hidden',
            }}>
              {/* Table header */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: '36px 56px 1fr 110px 90px 90px 110px 100px',
                gap: 10, alignItems: 'center',
                padding: '10px 18px',
                borderBottom: A.border,
                background: A.shellDarker,
                fontSize: 10, fontWeight: 700, color: A.faintText,
                letterSpacing: '0.08em', textTransform: 'uppercase',
              }}>
                <div></div>
                <div></div>
                <div>Dish</div>
                <div>Category</div>
                <div>Price</div>
                <div>Prep</div>
                <div>Status</div>
                <div style={{ textAlign: 'right' }}>Actions</div>
              </div>

              {/* Rows */}
              {displayed.map((item, idx) => {
                const soldOut = isSoldOutToday(item);
                const oos = item.isOutOfStock;
                const visible = item.isActive !== false;
                const refs = itemRefs[item.id];
                const refCount = (refs?.combos.length || 0) + (refs?.offers.length || 0);
                const upload = imgUpload[item.id];

                return (
                  <div key={item.id} className={`it-row ${dragging === item.id ? 'dragging' : ''} ${dragOverItem.current === item.id ? 'over' : ''}`}
                    draggable={canDrag}
                    onDragStart={() => { dragItem.current = item.id; setDragging(item.id); }}
                    onDragEnter={() => { dragOverItem.current = item.id; }}
                    onDragOver={e => e.preventDefault()}
                    onDragEnd={handleDragEnd}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '36px 56px 1fr 110px 90px 90px 110px 100px',
                      gap: 10, alignItems: 'center',
                      padding: '12px 18px',
                      borderBottom: idx === displayed.length - 1 ? 'none' : A.border,
                      opacity: visible ? 1 : 0.55,
                      animation: 'fadeUp 0.22s ease both',
                      animationDelay: `${Math.min(idx * 0.02, 0.2)}s`,
                    }}>

                    {/* Drag handle */}
                    <div className={canDrag ? 'it-drag' : ''}
                      style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        opacity: canDrag ? 1 : 0.2,
                      }}
                      title={canDrag ? 'Drag to reorder' : 'Clear filters to reorder'}>
                      <DragHandleIcon color={canDrag ? 'rgba(0,0,0,0.3)' : 'rgba(0,0,0,0.15)'} />
                    </div>

                    {/* Image */}
                    <div style={{ position: 'relative', width: 44, height: 44 }}>
                      {item.imageURL ? (
                        <img src={item.imageURL} alt={item.name}
                          style={{
                            width: 44, height: 44, objectFit: 'cover',
                            borderRadius: 8, border: A.borderStrong,
                            filter: soldOut || oos ? 'grayscale(60%)' : 'none',
                          }} />
                      ) : (
                        <div style={{
                          width: 44, height: 44, borderRadius: 8,
                          background: A.subtleBg, border: A.borderStrong,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontFamily: A.mono, fontSize: 15, fontWeight: 700, color: A.warningDim,
                        }}>{(item.name || '?').charAt(0).toUpperCase()}</div>
                      )}

                      {/* Upload overlay */}
                      {upload?.uploading && (
                        <div style={{
                          position: 'absolute', inset: 0, borderRadius: 8,
                          background: 'rgba(26,26,26,0.75)',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          color: A.cream, fontSize: 10, fontWeight: 700, fontFamily: A.mono,
                        }}>{Math.round(upload.progress)}%</div>
                      )}

                      {/* Veg/NonVeg dot */}
                      {item.isVeg !== undefined && item.isVeg !== null && (
                        <span style={{
                          position: 'absolute', top: -3, left: -3, width: 12, height: 12, borderRadius: 2,
                          border: `1.5px solid ${item.isVeg ? A.success : A.danger}`,
                          background: A.shell,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}>
                          <span style={{
                            width: 5, height: 5, borderRadius: item.isVeg ? 0 : '50%',
                            background: item.isVeg ? A.success : A.danger,
                          }} />
                        </span>
                      )}

                      {/* Invisible file input */}
                      <input type="file" accept="image/*"
                        ref={el => { imgInputRef.current[item.id] = el; }}
                        onChange={e => handleImageUpload(item, e.target.files[0])}
                        style={{ display: 'none' }} />
                    </div>

                    {/* Name + badges */}
                    <div style={{ minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 3 }}>
                        <span style={{
                          fontWeight: 600, fontSize: 14, color: A.ink,
                          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                          textDecoration: soldOut ? 'line-through' : 'none',
                        }}>{item.name}</span>
                        {item.offerBadge && item.offerLabel && (
                          <span style={{
                            padding: '2px 7px', borderRadius: 3,
                            background: (item.offerColor || '#C07050') + '18',
                            color: item.offerColor || '#C07050',
                            fontSize: 9, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase',
                          }}>{item.offerLabel}</span>
                        )}
                        {item.isPopular && <Pill color={A.warning}>Popular</Pill>}
                        {item.isFeatured && <Pill color={A.success}>Featured</Pill>}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, color: A.faintText }}>
                        {item.spiceLevel && item.spiceLevel !== 'None' && (
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                            <span style={{ width: 6, height: 6, borderRadius: '50%', background: SPICE_COLORS[item.spiceLevel] || A.faintText }} />
                            {item.spiceLevel}
                          </span>
                        )}
                        {refCount > 0 && (
                          <span style={{
                            display: 'inline-flex', alignItems: 'center', gap: 4,
                            padding: '1px 7px', borderRadius: 4,
                            background: 'rgba(196,168,109,0.10)',
                            color: A.warningDim, fontSize: 10, fontWeight: 700,
                            letterSpacing: '0.04em',
                          }} title={[
                            refs?.combos.length ? `In combos: ${refs.combos.join(', ')}` : '',
                            refs?.offers.length ? `In offers: ${refs.offers.join(', ')}` : '',
                          ].filter(Boolean).join(' · ')}>
                            Linked · {refCount}
                          </span>
                        )}
                        {item.nameTA && <span style={{ fontFamily: A.mono, opacity: 0.6 }}>TA</span>}
                        {item.nameHI && <span style={{ fontFamily: A.mono, opacity: 0.6 }}>HI</span>}
                      </div>
                    </div>

                    {/* Category */}
                    <div style={{ fontSize: 12, color: A.mutedText, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {item.category || <span style={{ color: A.faintText }}>—</span>}
                    </div>

                    {/* Price */}
                    <div style={{ fontFamily: A.mono, fontWeight: 600, fontSize: 13, color: A.ink }}>
                      {item.price != null ? `₹${item.price}` : <span style={{ color: A.faintText }}>—</span>}
                    </div>

                    {/* Prep */}
                    <div style={{ fontFamily: A.mono, fontSize: 12, color: A.mutedText }}>
                      {item.prepTime != null ? `${item.prepTime}m` : <span style={{ color: A.faintText }}>—</span>}
                    </div>

                    {/* Status */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                      {!visible && <StatusChip color={A.faintText} bg={A.subtleBg}>Hidden</StatusChip>}
                      {oos && <StatusChip color={A.danger} bg="rgba(217,83,79,0.08)">No stock</StatusChip>}
                      {soldOut && <StatusChip color={A.warningDim} bg="rgba(196,168,109,0.10)">Sold out</StatusChip>}
                      {visible && !oos && !soldOut && <StatusChip color={A.success} bg="rgba(63,158,90,0.10)">Active</StatusChip>}
                    </div>

                    {/* Actions */}
                    <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end', alignItems: 'center' }}>
                      <IconBtn title="Upload image" onClick={() => imgInputRef.current[item.id]?.click()}>
                        <svg width="13" height="13" viewBox="0 0 16 16" fill="none"><path d="M2 11L2 13C2 13.5523 2.44772 14 3 14L13 14C13.5523 14 14 13.5523 14 13L14 11M5 6L8 3M8 3L11 6M8 3L8 11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                      </IconBtn>
                      <IconBtn title={item.isActive === false ? 'Show on menu' : 'Hide from menu'} onClick={() => toggleActive(item)}
                        color={item.isActive === false ? A.faintText : A.success}>
                        <svg width="13" height="13" viewBox="0 0 16 16" fill="none"><path d={item.isActive === false
                          ? "M2 8L4 10L6 12C6 12 7.5 13 8 13C10 13 11.5 12 13 10L14 8L13 6L12 5M4 4L10 10M6 6C6 6 7 5 8 5C9 5 10 6 10 6"
                          : "M2 8C2 8 4 3 8 3C12 3 14 8 14 8C14 8 12 13 8 13C4 13 2 8 2 8Z"}
                          stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                          {item.isActive !== false && <circle cx="8" cy="8" r="2" stroke="currentColor" strokeWidth="1.5"/>}</svg>
                      </IconBtn>
                      <IconBtn title="Edit" onClick={() => openEdit(item)}>
                        <svg width="13" height="13" viewBox="0 0 16 16" fill="none"><path d="M11 2L14 5L5 14L2 14L2 11L11 2Z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                      </IconBtn>
                      <IconBtn title="Delete" onClick={() => handleDelete(item)} color={A.danger} disabled={deleting === item.id}>
                        {deleting === item.id ? (
                          <span style={{ width: 12, height: 12, border: '1.5px solid rgba(217,83,79,0.2)', borderTopColor: A.danger, borderRadius: '50%', display: 'inline-block', animation: 'spin 0.7s linear infinite' }} />
                        ) : (
                          <svg width="13" height="13" viewBox="0 0 16 16" fill="none"><path d="M3 4L13 4M5.5 4L5.5 2C5.5 1.5 6 1 6.5 1L9.5 1C10 1 10.5 1.5 10.5 2L10.5 4M4 4L4.5 13.5C4.5 14 5 14.5 5.5 14.5L10.5 14.5C11 14.5 11.5 14 11.5 13.5L12 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                        )}
                      </IconBtn>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Quick-action legend */}
          {displayed.length > 0 && (
            <div style={{
              marginTop: 14, padding: '10px 18px',
              background: A.shell, borderRadius: 10, border: A.border,
              display: 'flex', flexWrap: 'wrap', gap: 14,
              fontSize: 11, color: A.faintText,
            }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <DragHandleIcon color={A.faintText} /> Drag to reorder
              </span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <span style={{ width: 10, height: 10, border: `1.5px solid ${A.success}`, display: 'inline-block' }} /> Veg
              </span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <span style={{ width: 10, height: 10, border: `1.5px solid ${A.danger}`, borderRadius: '50%', display: 'inline-block' }} /> Non-Veg
              </span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <span style={{ padding: '1px 6px', borderRadius: 4, background: 'rgba(196,168,109,0.10)', color: A.warningDim, fontWeight: 700 }}>Linked · N</span> Used in a combo or offer
              </span>
            </div>
          )}
        </div>

        {/* ═══ Drawer form ═══ */}
        {drawerOpen && (
          <>
            <div onClick={closeDrawer} style={{
              position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)',
              zIndex: 90, animation: 'fadeIn 0.2s ease both',
            }} />
            <div style={{
              position: 'fixed', top: 0, right: 0, bottom: 0, width: '100%', maxWidth: 560,
              background: A.shell, zIndex: 91,
              display: 'flex', flexDirection: 'column',
              boxShadow: '-8px 0 32px rgba(0,0,0,0.12)',
              animation: 'slideInRight 0.28s ease both',
            }}>
              {/* Header */}
              <div style={{
                padding: '18px 22px', borderBottom: A.border,
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              }}>
                <div>
                  <div style={{ fontSize: 11, fontWeight: 600, color: A.faintText, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 2 }}>
                    Edit item
                  </div>
                  <div style={{ fontWeight: 700, fontSize: 18, color: A.ink, letterSpacing: '-0.2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 380 }}>
                    {form.name || 'Untitled'}
                  </div>
                </div>
                <button onClick={closeDrawer}
                  style={{
                    width: 34, height: 34, borderRadius: 8, border: 'none',
                    background: A.subtleBg, color: A.ink,
                    fontSize: 18, cursor: 'pointer', lineHeight: 1,
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  }}>×</button>
              </div>

              {/* Body */}
              <div style={{ flex: 1, overflowY: 'auto', padding: '22px' }}>

                {/* Name + translations */}
                <div style={{ marginBottom: 18 }}>
                  <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 6, gap: 10 }}>
                    <Label>Name <Required /></Label>
                    <button onClick={handleTranslate} disabled={translatingEdit}
                      style={{
                        padding: '5px 10px', borderRadius: 6, border: 'none',
                        background: A.ink, color: A.cream,
                        fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: A.font,
                        display: 'inline-flex', alignItems: 'center', gap: 6,
                        opacity: translatingEdit ? 0.5 : 1,
                      }}>
                      {translatingEdit ? (
                        <><span style={{ width: 10, height: 10, border: '1.5px solid rgba(237,237,237,0.3)', borderTopColor: A.cream, borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} /> Translating…</>
                      ) : 'Auto-translate TA + HI'}
                    </button>
                  </div>
                  <input className="it-input"
                    value={form.name || ''}
                    onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                    placeholder="Chicken Biryani"
                    style={inputStyle} />
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 6 }}>
                    <input className="it-input"
                      value={form.nameTA || ''}
                      onChange={e => setForm(f => ({ ...f, nameTA: e.target.value }))}
                      placeholder="Tamil translation"
                      style={{ ...inputStyle, fontSize: 12 }} />
                    <input className="it-input"
                      value={form.nameHI || ''}
                      onChange={e => setForm(f => ({ ...f, nameHI: e.target.value }))}
                      placeholder="Hindi translation"
                      style={{ ...inputStyle, fontSize: 12 }} />
                  </div>
                </div>

                {/* Description */}
                <div style={{ marginBottom: 18 }}>
                  <Label>Description</Label>
                  <textarea className="it-input"
                    value={form.description || ''}
                    onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                    placeholder="Short, appealing description of the dish"
                    rows={2}
                    style={{ ...inputStyle, resize: 'vertical', minHeight: 56 }} />
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 6 }}>
                    <textarea className="it-input"
                      value={form.descriptionTA || ''}
                      onChange={e => setForm(f => ({ ...f, descriptionTA: e.target.value }))}
                      placeholder="Tamil description"
                      rows={2}
                      style={{ ...inputStyle, fontSize: 12, resize: 'vertical', minHeight: 48 }} />
                    <textarea className="it-input"
                      value={form.descriptionHI || ''}
                      onChange={e => setForm(f => ({ ...f, descriptionHI: e.target.value }))}
                      placeholder="Hindi description"
                      rows={2}
                      style={{ ...inputStyle, fontSize: 12, resize: 'vertical', minHeight: 48 }} />
                  </div>
                </div>

                {/* Category + Price + Prep */}
                <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: 12, marginBottom: 18 }}>
                  <div>
                    <Label>Category <Required /></Label>
                    <input className="it-input"
                      value={form.category || ''}
                      onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
                      placeholder="Biryani"
                      list="cat-list"
                      style={inputStyle} />
                    <datalist id="cat-list">
                      {categories.filter(c => c !== 'all').map(c => <option key={c} value={c} />)}
                    </datalist>
                  </div>
                  <div>
                    <Label>Price (₹)</Label>
                    <input className="it-input" type="number" min="0"
                      value={form.price || ''}
                      onChange={e => setForm(f => ({ ...f, price: e.target.value }))}
                      placeholder="299"
                      style={inputStyle} />
                  </div>
                  <div>
                    <Label>Prep (min)</Label>
                    <input className="it-input" type="number" min="0"
                      value={form.prepTime || ''}
                      onChange={e => setForm(f => ({ ...f, prepTime: e.target.value }))}
                      placeholder="20"
                      style={inputStyle} />
                  </div>
                </div>

                {/* Veg / Non-veg */}
                <div style={{ marginBottom: 18 }}>
                  <Label>Diet <Required /></Label>
                  <div style={{ display: 'flex', gap: 8 }}>
                    {[[true, 'Veg', A.success], [false, 'Non-Veg', A.danger]].map(([val, lab, col]) => (
                      <button key={lab} onClick={() => setForm(f => ({ ...f, isVeg: val }))}
                        style={{
                          flex: 1, padding: '10px 12px', borderRadius: 10,
                          border: `1.5px solid ${form.isVeg === val ? col : 'rgba(0,0,0,0.10)'}`,
                          background: form.isVeg === val ? col + '12' : A.shell,
                          color: form.isVeg === val ? col : A.mutedText,
                          fontWeight: 600, fontSize: 13, cursor: 'pointer', fontFamily: A.font,
                          display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                          transition: 'all 0.15s',
                        }}>
                        <span style={{
                          width: 12, height: 12,
                          border: `1.5px solid ${col}`,
                          borderRadius: val ? 0 : '50%',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}>
                          <span style={{
                            width: 5, height: 5,
                            background: col,
                            borderRadius: val ? 0 : '50%',
                          }} />
                        </span>
                        {lab}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Spice */}
                <div style={{ marginBottom: 18 }}>
                  <Label>Spice level <Required /></Label>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {SPICE_LEVELS.map(lv => (
                      <button key={lv} onClick={() => setForm(f => ({ ...f, spiceLevel: lv }))}
                        style={{
                          padding: '7px 14px', borderRadius: 8,
                          border: `1.5px solid ${form.spiceLevel === lv ? SPICE_COLORS[lv] : 'rgba(0,0,0,0.08)'}`,
                          background: form.spiceLevel === lv ? SPICE_COLORS[lv] + '15' : A.shell,
                          color: form.spiceLevel === lv ? SPICE_COLORS[lv] : A.mutedText,
                          fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: A.font,
                          display: 'inline-flex', alignItems: 'center', gap: 6,
                        }}>
                        <span style={{ width: 8, height: 8, borderRadius: '50%', background: SPICE_COLORS[lv] }} />
                        {lv}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Offer badge */}
                <div style={{ marginBottom: 18 }}>
                  <Label>Badge (optional)</Label>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
                    <button onClick={() => setForm(f => ({ ...f, offerBadge: '', offerColor: '#C07050' }))}
                      className="it-badge-tile"
                      style={{
                        padding: '8px 10px', borderRadius: 8,
                        border: `1.5px solid ${!form.offerBadge ? A.ink : 'rgba(0,0,0,0.08)'}`,
                        background: !form.offerBadge ? A.subtleBg : A.shell,
                        color: !form.offerBadge ? A.ink : A.mutedText,
                        fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: A.font,
                      }}>None</button>
                    {OFFER_BADGES.map(b => (
                      <button key={b.label}
                        onClick={() => setForm(f => ({ ...f, offerBadge: b.label, offerColor: b.color }))}
                        className="it-badge-tile"
                        style={{
                          padding: '8px 10px', borderRadius: 8,
                          border: `1.5px solid ${form.offerBadge === b.label ? b.color : 'rgba(0,0,0,0.08)'}`,
                          background: form.offerBadge === b.label ? b.color + '15' : A.shell,
                          color: form.offerBadge === b.label ? b.color : A.mutedText,
                          fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: A.font,
                        }}>{b.label}</button>
                    ))}
                  </div>
                  {form.offerBadge === 'Custom…' && (
                    <input className="it-input"
                      value={customBadge}
                      onChange={e => setCustomBadge(e.target.value)}
                      placeholder="Custom badge text"
                      maxLength={20}
                      style={{ ...inputStyle, marginTop: 8 }} />
                  )}
                </div>

                {/* Flags */}
                <div style={{ marginBottom: 18 }}>
                  <Label>Flags</Label>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <FlagRow label="Visible on menu" hint="Customers can see and order this dish" on={form.isActive !== false} onClick={() => setForm(f => ({ ...f, isActive: !f.isActive }))} color={A.success} />
                    <FlagRow label="Popular" hint="Adds a 'Popular' pill on the menu" on={!!form.isPopular} onClick={() => setForm(f => ({ ...f, isPopular: !f.isPopular }))} color={A.warning} />
                    <FlagRow label="Featured" hint="Highlighted at the top of its category" on={!!form.isFeatured} onClick={() => setForm(f => ({ ...f, isFeatured: !f.isFeatured }))} color={A.success} />
                    <FlagRow label="Out of stock" hint="Greys out on menu until you toggle off" on={!!form.isOutOfStock} onClick={() => setForm(f => ({ ...f, isOutOfStock: !f.isOutOfStock }))} color={A.danger} />
                  </div>
                </div>

                {/* ═══ Modifiers ═══
                    Variants = required pick-one (Half/Full, Small/Medium/Large).
                    Add-ons  = optional multi-select (Extra cheese, No onion).
                    Price delta stacks on base price at order time. */}
                <div style={{ marginBottom: 16, padding: '14px 16px', borderRadius: 12, background: A.shellDarker, border: A.border }}>
                  <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.10em', textTransform: 'uppercase', color: A.warningDim, marginBottom: 10 }}>Variants &amp; Add-ons</div>

                  {/* Variants */}
                  <div style={{ marginBottom: 14 }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                      <Label>Variants <span style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0, color: A.faintText }}>(customer picks one · e.g. Half / Full)</span></Label>
                      <button type="button"
                        onClick={() => setForm(f => ({ ...f, variants: [...(f.variants || []), { name: '', priceDelta: '' }] }))}
                        style={{ padding: '4px 10px', borderRadius: 6, border: A.border, background: A.shell, color: A.mutedText, fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: A.font }}>
                        + Add variant
                      </button>
                    </div>
                    {(form.variants || []).length === 0 && (
                      <div style={{ fontSize: 12, color: A.faintText, fontStyle: 'italic' }}>No variants — customers order the item as-is.</div>
                    )}
                    {(form.variants || []).map((v, i) => (
                      <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 140px 36px', gap: 8, marginBottom: 6 }}>
                        <input className="it-input" value={v.name}
                          onChange={e => setForm(f => {
                            const list = [...(f.variants || [])]; list[i] = { ...list[i], name: e.target.value };
                            return { ...f, variants: list };
                          })}
                          placeholder="Variant name (e.g. Full)" style={inputStyle} />
                        <input className="it-input" type="number" value={v.priceDelta}
                          onChange={e => setForm(f => {
                            const list = [...(f.variants || [])]; list[i] = { ...list[i], priceDelta: e.target.value };
                            return { ...f, variants: list };
                          })}
                          placeholder="₹ delta (0, +50)" style={inputStyle} />
                        <button type="button"
                          onClick={() => setForm(f => ({ ...f, variants: (f.variants || []).filter((_, j) => j !== i) }))}
                          style={{ padding: 0, width: 36, height: 36, borderRadius: 6, border: A.border, background: A.shell, color: A.danger, fontSize: 16, cursor: 'pointer', fontFamily: A.font }}
                          title="Remove variant">✕</button>
                      </div>
                    ))}
                  </div>

                  {/* Add-ons */}
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                      <Label>Add-ons <span style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0, color: A.faintText }}>(optional, multi-select · e.g. Extra cheese)</span></Label>
                      <button type="button"
                        onClick={() => setForm(f => ({ ...f, addOns: [...(f.addOns || []), { name: '', priceDelta: '' }] }))}
                        style={{ padding: '4px 10px', borderRadius: 6, border: A.border, background: A.shell, color: A.mutedText, fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: A.font }}>
                        + Add-on
                      </button>
                    </div>
                    {(form.addOns || []).length === 0 && (
                      <div style={{ fontSize: 12, color: A.faintText, fontStyle: 'italic' }}>No add-ons configured.</div>
                    )}
                    {(form.addOns || []).map((a, i) => (
                      <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 140px 36px', gap: 8, marginBottom: 6 }}>
                        <input className="it-input" value={a.name}
                          onChange={e => setForm(f => {
                            const list = [...(f.addOns || [])]; list[i] = { ...list[i], name: e.target.value };
                            return { ...f, addOns: list };
                          })}
                          placeholder="Add-on name (e.g. Extra cheese)" style={inputStyle} />
                        <input className="it-input" type="number" value={a.priceDelta}
                          onChange={e => setForm(f => {
                            const list = [...(f.addOns || [])]; list[i] = { ...list[i], priceDelta: e.target.value };
                            return { ...f, addOns: list };
                          })}
                          placeholder="₹ delta" style={inputStyle} />
                        <button type="button"
                          onClick={() => setForm(f => ({ ...f, addOns: (f.addOns || []).filter((_, j) => j !== i) }))}
                          style={{ padding: 0, width: 36, height: 36, borderRadius: 6, border: A.border, background: A.shell, color: A.danger, fontSize: 16, cursor: 'pointer', fontFamily: A.font }}
                          title="Remove add-on">✕</button>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Sort order (advanced) */}
                <div style={{ marginBottom: 12 }}>
                  <Label>Sort order <span style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0, color: A.faintText }}>(lower = shown first, usually managed by drag)</span></Label>
                  <input className="it-input" type="number"
                    value={form.sortOrder || ''}
                    onChange={e => setForm(f => ({ ...f, sortOrder: e.target.value }))}
                    placeholder="Auto"
                    style={{ ...inputStyle, maxWidth: 140 }} />
                </div>
              </div>

              {/* Footer */}
              <div style={{
                padding: '14px 22px', borderTop: A.border,
                display: 'flex', gap: 10, justifyContent: 'flex-end',
              }}>
                <button onClick={closeDrawer}
                  style={{
                    padding: '10px 18px', borderRadius: 10, border: A.border,
                    background: A.shell, color: A.mutedText,
                    fontWeight: 600, fontSize: 13, cursor: 'pointer', fontFamily: A.font,
                  }}>Cancel</button>
                <button className="it-btn" onClick={handleSave} disabled={saving}
                  style={{
                    padding: '10px 22px', borderRadius: 10, border: 'none',
                    background: A.ink, color: A.cream,
                    fontWeight: 700, fontSize: 13, cursor: 'pointer', fontFamily: A.font,
                    opacity: saving ? 0.6 : 1,
                    display: 'inline-flex', alignItems: 'center', gap: 8,
                  }}>
                  {saving && <span style={{ width: 12, height: 12, border: '2px solid rgba(255,255,255,0.3)', borderTopColor: A.cream, borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />}
                  {saving ? 'Saving…' : 'Save changes'}
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </AdminLayout>
  );
}

// ═══ Helpers ═══
const inputStyle = {
  width: '100%', padding: '10px 12px', borderRadius: 10,
  border: '1px solid rgba(0,0,0,0.10)', background: '#FAFAF8',
  fontSize: 13, color: '#1A1A1A', fontFamily: INTER,
  outline: 'none', boxSizing: 'border-box', transition: 'all 0.15s',
};
function Label({ children }) { return <label style={{ display: 'block', fontSize: 10, fontWeight: 700, color: 'rgba(0,0,0,0.55)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 6, fontFamily: INTER }}>{children}</label>; }
function Required() { return <span style={{ color: '#D9534F', fontWeight: 700 }}>*</span>; }
function Divider() { return <div style={{ width: 1, height: 24, background: 'rgba(234,231,227,0.06)', flexShrink: 0 }} />; }
function StatTile({ label, value, color = '#EAE7E3', big = false }) {
  return (
    <div style={{ minWidth: 74 }}>
      <div style={{ fontSize: 9, fontWeight: 600, letterSpacing: '0.10em', textTransform: 'uppercase', color: 'rgba(234,231,227,0.35)', marginBottom: 2 }}>{label}</div>
      <div style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 700, fontSize: big ? 22 : 18, color, lineHeight: 1, letterSpacing: big ? '-0.5px' : '-0.3px' }}>{value}</div>
    </div>
  );
}
function Pill({ children, color }) {
  return <span style={{
    padding: '2px 7px', borderRadius: 3,
    background: color + '18', color,
    fontSize: 9, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase',
  }}>{children}</span>;
}
function StatusChip({ children, color, bg }) {
  return <span style={{
    fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase',
    padding: '2px 8px', borderRadius: 4, background: bg, color,
    display: 'inline-block', width: 'fit-content',
  }}>{children}</span>;
}
function IconBtn({ children, title, onClick, color = 'rgba(0,0,0,0.55)', disabled = false }) {
  return (
    <button onClick={onClick} title={title} disabled={disabled}
      style={{
        width: 28, height: 28, borderRadius: 7, border: 'none',
        background: 'transparent', color, cursor: disabled ? 'default' : 'pointer',
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        transition: 'all 0.12s', opacity: disabled ? 0.6 : 1,
      }}
      onMouseEnter={e => { if (!disabled) e.currentTarget.style.background = 'rgba(0,0,0,0.04)'; }}
      onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}>
      {children}
    </button>
  );
}
function FlagRow({ label, hint, on, onClick, color }) {
  return (
    <div onClick={onClick} style={{
      padding: '10px 14px', borderRadius: 10, background: '#FAFAF8',
      border: `1px solid ${on ? color + '40' : 'rgba(0,0,0,0.06)'}`,
      display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
      cursor: 'pointer', transition: 'all 0.15s',
    }}>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: '#1A1A1A', marginBottom: 1 }}>{label}</div>
        <div style={{ fontSize: 11, color: 'rgba(0,0,0,0.55)' }}>{hint}</div>
      </div>
      <div style={{
        width: 36, height: 20, borderRadius: 99,
        background: on ? color : 'rgba(0,0,0,0.15)',
        position: 'relative', transition: 'background 0.2s', flexShrink: 0,
      }}>
        <div style={{
          width: 14, height: 14, borderRadius: '50%', background: '#FFFFFF',
          position: 'absolute', top: 3, left: on ? 19 : 3,
          transition: 'left 0.2s', boxShadow: '0 1px 4px rgba(0,0,0,0.2)',
        }} />
      </div>
    </div>
  );
}
function LoadingCard() {
  return (
    <div style={{ background: '#FFFFFF', borderRadius: 14, border: '1px solid rgba(0,0,0,0.06)', padding: '64px 32px', textAlign: 'center', boxShadow: '0 2px 10px rgba(38,52,49,0.03)' }}>
      <div style={{ display: 'inline-block', width: 24, height: 24, border: '2px solid rgba(0,0,0,0.04)', borderTopColor: '#C4A86D', borderRadius: '50%', animation: 'spin 0.8s linear infinite', marginBottom: 16 }} />
      <div style={{ fontSize: 13, color: 'rgba(0,0,0,0.55)' }}>Loading items…</div>
    </div>
  );
}
function EmptyCard({ titleText, subtitleText }) {
  return (
    <div style={{ background: '#FFFFFF', borderRadius: 14, border: '1px solid rgba(0,0,0,0.06)', padding: '64px 32px', textAlign: 'center', boxShadow: '0 2px 10px rgba(38,52,49,0.03)' }}>
      <div style={{ display: 'inline-flex', gap: 10, marginBottom: 20, alignItems: 'center' }}>
        <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#C4A86D', opacity: 0.8, animation: 'pulse 1.8s infinite' }} />
        <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'rgba(0,0,0,0.10)' }} />
        <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'rgba(0,0,0,0.06)' }} />
      </div>
      <div style={{ fontWeight: 600, fontSize: 16, color: '#1A1A1A', marginBottom: 8, letterSpacing: '-0.2px' }}>{titleText}</div>
      <div style={{ fontSize: 13, color: 'rgba(0,0,0,0.55)', lineHeight: 1.6, maxWidth: 440, margin: '0 auto' }}>{subtitleText}</div>
    </div>
  );
}

AdminItems.getLayout = (page) => page;