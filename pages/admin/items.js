// pages/admin/items.js
import Head from 'next/head';
import Link from 'next/link';
import { useEffect, useState, useRef, useMemo, Fragment } from 'react';
import { useFeatureAccess } from '../../hooks/useFeatureAccess';
import FeatureShell from '../../components/layout/FeatureShell';
import EmptyState from '../../components/EmptyState';
import { useRouter } from 'next/router';
import { getAllMenuItems, updateMenuItem, deleteMenuItem, getCombos, getAllOffers, createMenuItem, todayKey, updateRestaurant, bumpStorageUsed } from '../../lib/db';
import { exportRowsCsv } from '../../lib/csv';
import { uploadFile, uploadImage, buildImagePath, fileSizeMB, optimizeOneImage, deleteFile } from '../../lib/storage';
import { doc, onSnapshot } from 'firebase/firestore';
import toast from 'react-hot-toast';
import useBulkSelection from '../../hooks/useBulkSelection';
import BulkActionBar from '../../components/admin/BulkActionBar';
import ConfirmModal from '../../components/ConfirmModal';

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

// ═══ CSV parser — Petpooja-compatible import ═══
// Tiny inline parser (comma-separated, quote-aware). Handles \r\n on
// Windows-saved files and strips a leading BOM (see below). Export goes
// through the shared lib/csv.js, which adds a UTF-8 BOM so regional item
// names (Tamil/Hindi) survive a round-trip through Excel.
function parseCSV(text) {
  // Returns rows[][] = array of fields per row. Strips a UTF-8 BOM that
  // Excel adds to "Save as CSV UTF-8" files (otherwise the first column
  // header reads "﻿name" and matching breaks).
  const src = text.replace(/^﻿/, '');
  const rows = [];
  let row = [], field = '', inQuotes = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') { field += '"'; i++; }
        else { inQuotes = false; }
      } else { field += ch; }
    } else {
      if (ch === '"') inQuotes = true;
      else if (ch === ',') { row.push(field); field = ''; }
      else if (ch === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
      else if (ch === '\r') { /* ignore — handled by \n branch */ }
      else { field += ch; }
    }
  }
  if (field !== '' || row.length > 0) { row.push(field); rows.push(row); }
  return rows;
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
  const router = useRouter();
  // RBAC: owner OR a staff member whose role grants 'menuItems'. All menu
  // reads/writes route through scopedDb; image uploads through scopedStorage.
  const { ready, isAdmin, rid, scopedDb, scopedStorage, canView } = useFeatureAccess('menuItems');
  const dbOpt = { db: scopedDb };

  const [items, setItems] = useState([]);
  const [combos, setCombos] = useState([]);
  const [offers, setOffers] = useState([]);
  const [loaded, setLoaded] = useState(false);

  // Phase B (Petpooja hybrid) — when the restaurant is in
  // petpooja_hybrid mode the menu is owned by Petpooja. We render a
  // banner + disable item create/edit/delete actions to prevent the
  // two systems from drifting. AR upload + Help-Me-Choose tags + image
  // upload are still allowed per the user's product spec (those live
  // on the overlay fields, not on Petpooja's side).
  // ZERO impact on standalone restaurants — isHybrid stays false.
  const [isHybrid, setIsHybrid] = useState(false);
  // Admin-controlled category order + per-category images (May 8).
  // Both live on the restaurant doc so changes show up on the
  // customer menu in real time without an items collection rewrite.
  const [savedCategoryOrder, setSavedCategoryOrder] = useState([]);
  const [savedCategoryImages, setSavedCategoryImages] = useState({});
  useEffect(() => {
    if (!rid || !canView) return;
    const unsub = onSnapshot(doc(scopedDb, 'restaurants', rid), (snap) => {
      if (!snap.exists()) return;
      const data = snap.data();
      setIsHybrid(data.posMode === 'petpooja_hybrid');
      setSavedCategoryOrder(Array.isArray(data.categoryOrder) ? data.categoryOrder : []);
      setSavedCategoryImages(data.categoryImages && typeof data.categoryImages === 'object' ? data.categoryImages : {});
    }, () => { /* listener errors are non-fatal — keep last known state */ });
    return unsub;
  }, [rid, canView, scopedDb]);

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
  // ConfirmModal state — replaces the native browser confirm() for
  // delete prompts. Shape: { title, body, confirmLabel, destructive,
  // onConfirm } | null (closed).
  const [confirmDialog, setConfirmDialog] = useState(null);

  // Drag and drop
  const dragItem = useRef(null);
  const dragOverItem = useRef(null);
  const [dragging, setDragging] = useState(null);

  const today = todayKey();
  const isSoldOutToday = (item) => item.availableUntil === today;

  const load = async () => {
    if (!rid || !canView) return;
    try {
      const [m, c, o] = await Promise.all([
        getAllMenuItems(rid, dbOpt),
        getCombos(rid, dbOpt).catch(() => []),
        getAllOffers(rid, dbOpt).catch(() => []),
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

  // Effective category order shown in the customer menu = saved order
  // first, with any newly-introduced categories appended at the end
  // (per the user's "(a)" rule). Used to drive the drag-reorder strip
  // below + the grouped admin-side rendering in Commit D.
  const effectiveCategoryOrder = useMemo(() => {
    const usedSet = new Set(items.map(i => (i.category || '').trim()).filter(Boolean));
    const result = [];
    for (const name of savedCategoryOrder) {
      if (usedSet.has(name)) {
        result.push(name);
        usedSet.delete(name);
      }
    }
    // Newcomers — preserve insertion order (the order they first
    // appear among items rather than alphabetical), so a brand-new
    // category lands predictably at the end.
    for (const item of items) {
      const name = (item.category || '').trim();
      if (name && usedSet.has(name)) {
        result.push(name);
        usedSet.delete(name);
      }
    }
    return result;
  }, [items, savedCategoryOrder]);

  // Persist the new order. Optimistic — local state updates first so
  // the drag preview feels instant; the Firestore write follows. On
  // failure we'd want a toast (TODO if reports come in), but the
  // listener will re-sync on the next snapshot anyway.
  const saveCategoryOrder = async (newOrder) => {
    setSavedCategoryOrder(newOrder);
    if (!rid) return;
    try {
      await updateRestaurant(rid, { categoryOrder: newOrder }, dbOpt);
    } catch (e) {
      console.error('saveCategoryOrder failed', e);
      toast.error('Could not save category order. Refresh and retry.');
    }
  };

  // Drag-reorder for the category strip — separate refs from the
  // existing item drag so they don't interfere.
  const catDragFrom = useRef(null);
  const catDragOver = useRef(null);
  const [catDragging, setCatDragging] = useState(null);

  // Inline rename state for category chips. When set, the chip with
  // that name swaps to a text input. Saving validates: non-empty,
  // not equal to an existing category (other than itself), batch-
  // updates every menu item with the old category, and updates
  // categoryOrder + categoryImages on the restaurant doc.
  const [renamingCat, setRenamingCat] = useState(null);   // old name | null
  const [renameInput, setRenameInput] = useState('');
  const [renameBusy, setRenameBusy] = useState(false);
  const startRename = (oldName) => {
    setRenamingCat(oldName);
    setRenameInput(oldName);
  };
  const cancelRename = () => {
    setRenamingCat(null);
    setRenameInput('');
  };
  const commitRename = async () => {
    const oldName = renamingCat;
    const newName = renameInput.trim();
    if (!oldName || !newName || newName === oldName) {
      cancelRename();
      return;
    }
    // Block collision with another existing category (case-insensitive).
    const lowered = newName.toLowerCase();
    const collision = effectiveCategoryOrder
      .some((c) => c !== oldName && c.toLowerCase() === lowered);
    if (collision) {
      toast.error(`A category called "${newName}" already exists. Pick a different name.`);
      return;
    }
    // Don't let admins rename a Petpooja-mirrored category — the name
    // is owned by Petpooja and renaming here would only desync.
    const itemsInCat = items.filter(i => (i.category || '').trim() === oldName);
    const hybridLocked = isHybrid && itemsInCat.some(i => !!i.petpoojaItemId);
    if (hybridLocked) {
      toast.error('This category contains Petpooja-mirrored items. Rename it in your Petpooja dashboard first, then sync.');
      cancelRename();
      return;
    }
    setRenameBusy(true);
    try {
      // Batch-update every menu item with the old category. updateMenuItem
      // already passes through withActor() for the audit fields.
      await Promise.all(itemsInCat.map(it => updateMenuItem(rid, it.id, { category: newName }, dbOpt)));
      // Re-key categoryOrder + categoryImages so the customer-side
      // saved state moves with the rename.
      const nextOrder = savedCategoryOrder.map(c => c === oldName ? newName : c);
      const nextImages = { ...savedCategoryImages };
      if (oldName in nextImages) {
        nextImages[newName] = nextImages[oldName];
        delete nextImages[oldName];
      }
      await updateRestaurant(rid, {
        categoryOrder: nextOrder,
        categoryImages: nextImages,
      }, dbOpt);
      // Optimistic local sync so the strip + table re-render before
      // the listener fires.
      setSavedCategoryOrder(nextOrder);
      setSavedCategoryImages(nextImages);
      setItems(prev => prev.map(it => (
        (it.category || '').trim() === oldName ? { ...it, category: newName } : it
      )));
      toast.success(`Renamed to "${newName}"`);
      cancelRename();
    } catch (e) {
      console.error('Category rename failed:', e);
      toast.error('Rename failed. Try again.');
    } finally {
      setRenameBusy(false);
    }
  };
  const handleCatDragEnd = async () => {
    const from = catDragFrom.current;
    const to = catDragOver.current;
    setCatDragging(null);
    catDragFrom.current = null;
    catDragOver.current = null;
    if (!from || !to || from === to) return;
    const order = [...effectiveCategoryOrder];
    const fromIdx = order.indexOf(from);
    const toIdx = order.indexOf(to);
    if (fromIdx === -1 || toIdx === -1) return;
    const [moved] = order.splice(fromIdx, 1);
    order.splice(toIdx, 0, moved);
    await saveCategoryOrder(order);
  };

  // ═══ Stats for dark strip ═══
  const stats = useMemo(() => {
    const active = items.filter(i => i.isActive !== false).length;
    const hidden = items.filter(i => i.isActive === false).length;
    const oos = items.filter(i => i.isOutOfStock).length;
    const soldOut = items.filter(i => isSoldOutToday(i)).length;
    return { total: items.length, active, hidden, oos, soldOut };
  }, [items]);

  // ═══ Filtered display ═══
  // Items are now sorted into category groups (in customer-menu
  // order from effectiveCategoryOrder), with featured-first inside
  // each group and sold-out-today items sinking to the bottom of
  // their own group. The flat output keeps the existing drag /
  // bulk-select pipeline working unchanged — render-time logic
  // (below) injects a category-heading row between consecutive
  // items whose category differs.
  const displayed = useMemo(() => {
    const q = search.trim().toLowerCase();
    const filtered = items.filter(item => {
      if (catFilter !== 'all' && item.category !== catFilter) return false;
      if (statusFilter === 'active' && item.isActive === false) return false;
      if (statusFilter === 'hidden' && item.isActive !== false) return false;
      if (statusFilter === 'oos' && !item.isOutOfStock) return false;
      if (statusFilter === 'sold-out-today' && !isSoldOutToday(item)) return false;
      if (q && !(item.name || '').toLowerCase().includes(q) && !(item.description || '').toLowerCase().includes(q)) return false;
      return true;
    });
    // Group by category preserving stable order.
    const byCat = new Map();
    for (const item of filtered) {
      const c = (item.category || '').trim() || 'Other';
      if (!byCat.has(c)) byCat.set(c, []);
      byCat.get(c).push(item);
    }
    const orderIdx = (name) => {
      const i = effectiveCategoryOrder.indexOf(name);
      return i === -1 ? Number.MAX_SAFE_INTEGER : i;
    };
    const orderedNames = [...byCat.keys()].sort((a, b) => orderIdx(a) - orderIdx(b));
    const flat = [];
    for (const name of orderedNames) {
      const inCat = byCat.get(name);
      flat.push(
        ...inCat.filter(i => i.isFeatured && !isSoldOutToday(i)),
        ...inCat.filter(i => !i.isFeatured && !isSoldOutToday(i)),
        ...inCat.filter(i => isSoldOutToday(i)),
      );
    }
    return flat;
  }, [items, search, catFilter, statusFilter, today, effectiveCategoryOrder]);

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

  // ═══ Category image upload (May 8) ═══
  // Per-category hero image admins can upload to override the
  // auto-derived "first item's image" used by the customer menu's
  // top tile strip. Stored as a flat map on the restaurant doc:
  //   restaurants/{rid}.categoryImages = { 'Pizza': '<url>', ... }
  // Cleared by passing file=null (handled in the chip's "Remove"
  // action). Upload is hidden behind a per-category file input ref
  // so each chip has its own picker.
  const [catImgUploading, setCatImgUploading] = useState({});  // { [catName]: progressPct }
  const catImgInputRef = useRef({});
  const handleCategoryImageUpload = async (categoryName, file) => {
    if (!file) return;
    if (fileSizeMB(file) > 5) { toast.error('Image must be under 5MB'); return; }
    setCatImgUploading(s => ({ ...s, [categoryName]: 0 }));
    try {
      // Reuse the same image bucket layout as menu-item images for
      // simplicity. The path encodes the category name so re-uploads
      // for the same category are easy to find later.
      const safeName = categoryName.replace(/[^a-zA-Z0-9]/g, '_').slice(0, 40);
      const path = buildImagePath(rid, `category_${safeName}_${file.name}`);
      // Category nav tiles render at 64×64 CSS pixels (=128×128 on
      // retina). Default uploadImage cap is 1200×1200 — appropriate
      // for menu-item hero photos, way overkill for tiny circular
      // tile thumbnails. Pass tighter caps so a 4 MB phone photo
      // becomes ~30 KB instead of ~150 KB.
      const url = await uploadImage(file, path, (pct) =>
        setCatImgUploading(s => ({ ...s, [categoryName]: pct })),
        { maxWidth: 320, maxHeight: 320, quality: 0.82 },
        scopedStorage,
      );
      const nextImages = { ...savedCategoryImages, [categoryName]: url };
      setSavedCategoryImages(nextImages);
      await updateRestaurant(rid, { categoryImages: nextImages }, dbOpt);
      toast.success(`Updated image for ${categoryName}`);
    } catch (e) {
      console.error('category image upload failed:', e);
      toast.error('Upload failed: ' + (e?.message || 'unknown'));
    } finally {
      setCatImgUploading(s => { const next = { ...s }; delete next[categoryName]; return next; });
    }
  };
  const handleCategoryImageClear = async (categoryName) => {
    const nextImages = { ...savedCategoryImages };
    delete nextImages[categoryName];
    setSavedCategoryImages(nextImages);
    try {
      await updateRestaurant(rid, { categoryImages: nextImages }, dbOpt);
    } catch (e) {
      console.error('category image clear failed:', e);
      toast.error('Could not clear. Refresh and retry.');
    }
  };

  // ═══ Image upload (row-level) ═══
  const handleImageUpload = async (item, file) => {
    if (!file) return;
    if (fileSizeMB(file) > 5) { toast.error('Image must be under 5MB'); return; }
    setImgUpload(u => ({ ...u, [item.id]: { uploading: true, progress: 0 } }));
    try {
      const path = buildImagePath(rid, file.name);
      // uploadImage auto-resizes large photos in the browser before sending —
      // big screenshots (1+ MB) become ~150 KB, which dramatically improves
      // customer menu load time on slow networks. Falls back to uploadFile
      // behaviour for already-small or non-image files.
      const url = await uploadImage(file, path, (pct) =>
        setImgUpload(u => ({ ...u, [item.id]: { uploading: true, progress: pct } })),
        undefined, scopedStorage
      );
      // Track storage: replace the previously-tracked size with the new file's
      // size. uploadImage may have resized the image, but we conservatively
      // bill the source size — accurate enough for plan caps and consistent
      // with the 5 MB upload limit shown above.
      const newImageSizeMB = fileSizeMB(file);
      const oldImageSizeMB = Number(item.imageSize) || 0;
      await updateMenuItem(rid, item.id, { imageURL: url, imageSize: newImageSizeMB }, dbOpt);
      setItems(prev => prev.map(i => i.id === item.id ? { ...i, imageURL: url, imageSize: newImageSizeMB } : i));
      try { await bumpStorageUsed(rid, newImageSizeMB - oldImageSizeMB, dbOpt); } catch { /* best-effort */ }
      toast.success('Image updated');
    } catch (e) { toast.error('Upload failed: ' + e.message); }
    finally { setImgUpload(u => ({ ...u, [item.id]: { uploading: false, progress: 0 } })); }
  };

  // ═══ Save drawer form ═══
  const handleSave = async () => {
    // Phase B (refined May 5+8) — gate edits based on item provenance.
    //   - Item from Petpooja + currently hybrid → edit in Petpooja, sync.
    //   - Item from Petpooja + downgraded off Pro → frozen. Admin can
    //     re-upgrade + reconnect to manage these. Without this gate, a
    //     downgraded restaurant could edit a synced item and re-enable
    //     it on the menu, bypassing the Pro plan paywall.
    //   - Local item (no petpoojaItemId) → always editable.
    // Image / AR / discovery tags use separate inline flows and stay
    // available regardless.
    const editingItem = items.find(i => i.id === editingId);
    if (editingItem?.petpoojaItemId) {
      if (isHybrid) {
        toast.error('This item is managed in Petpooja. Edit name/price/category there, then sync from /admin/petpooja-connect.');
      } else {
        toast.error('This item came from Petpooja. Re-upgrade to Pro and reconnect Petpooja to manage it.');
      }
      return;
    }
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
      }, dbOpt);
      toast.success('Item updated');
      closeDrawer();
      await load();
    } catch (e) { toast.error('Save failed: ' + e.message); }
    finally { setSaving(false); }
  };

  // ═══ Delete with cross-ref warning ═══
  // Uses ConfirmModal (the styled card dialog) instead of the native
  // browser confirm() popup so the prompt feels in-app.
  const handleDelete = (item) => {
    // Phase B (refined May 5) — only block delete on items that came
    // from Petpooja. Local items stay deletable so admins can clean up
    // pre-connect rows that don't have a petpoojaItemId.
    if (isHybrid && item.petpoojaItemId) {
      toast.error('This item is managed in Petpooja. Delete it in your Petpooja dashboard, then sync.');
      return;
    }
    const refs = itemRefs[item.id];
    let body = 'This cannot be undone.';
    if (refs) {
      const parts = [];
      if (refs.combos.length) parts.push(`${refs.combos.length} combo${refs.combos.length === 1 ? '' : 's'} (${refs.combos.slice(0, 3).join(', ')}${refs.combos.length > 3 ? '…' : ''})`);
      if (refs.offers.length) parts.push(`${refs.offers.length} offer${refs.offers.length === 1 ? '' : 's'} (${refs.offers.slice(0, 3).join(', ')}${refs.offers.length > 3 ? '…' : ''})`);
      if (parts.length) {
        body = `"${item.name}" is linked in ${parts.join(' and ')}. Deleting will break those references. Continue?`;
      }
    }
    setConfirmDialog({
      title: `Delete "${item.name}"?`,
      body,
      confirmLabel: 'Yes, delete',
      cancelLabel: 'Keep item',
      destructive: true,
      onConfirm: async () => {
        setDeleting(item.id);
        try {
          await deleteMenuItem(rid, item.id, dbOpt);
          toast.success(`"${item.name}" deleted`);
          await load();
        } catch { toast.error('Delete failed'); }
        finally { setDeleting(null); }
      },
    });
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

    await Promise.all(reordered.map((item, idx) => updateMenuItem(rid, item.id, { sortOrder: idx + 1 }, dbOpt)));

    dragItem.current = null;
    dragOverItem.current = null;
  };

  // ═══ Row-level toggles ═══
  // Plan enforcement (May 8): Petpooja-mirrored items can only be
  // re-activated when the restaurant is currently on a Pro plan AND
  // connected to Petpooja (isHybrid). Otherwise a downgraded restaurant
  // could re-show items they imported while on Pro — defeating the
  // value of the Pro tier. Hiding them is always allowed (no harm in
  // letting admins clean up their own menu).
  const toggleActive = async (item) => {
    const wantToShow = item.isActive === false;  // currently hidden, click = show
    if (wantToShow && item.petpoojaItemId && !isHybrid) {
      toast.error('This item came from Petpooja. Re-upgrade to Pro and reconnect Petpooja to show it on your menu.');
      return;
    }
    try { await updateMenuItem(rid, item.id, { isActive: !item.isActive }, dbOpt); await load(); }
    catch { toast.error('Update failed'); }
  };
  const toggleSoldOut = async (item) => {
    try { await updateMenuItem(rid, item.id, { availableUntil: isSoldOutToday(item) ? null : today }, dbOpt); await load(); }
    catch { toast.error('Update failed'); }
  };
  const toggleOutOfStock = async (item) => {
    try { await updateMenuItem(rid, item.id, { isOutOfStock: !item.isOutOfStock }, dbOpt); await load(); }
    catch { toast.error('Update failed'); }
  };

  // ═══ Bulk selection + actions ═══
  // Hook is fed the currently-VISIBLE items so "select all" toggles only
  // what's on screen; selections stick across filter changes until cleared.
  const sel = useBulkSelection(displayed, item => item.id);
  const [bulkBusy, setBulkBusy] = useState(null); // 'sold-out' | 'available' | 'category' | 'delete' | null

  // Selected items — looked up against the full items list (not displayed)
  // so a selection from one filter can be acted on after a filter change.
  const selectedItems = useMemo(
    () => items.filter(i => sel.isSelected(i.id)),
    [items, sel]
  );

  const bulkSetSoldOut = async () => {
    if (selectedItems.length === 0) return;
    setBulkBusy('sold-out');
    try {
      await Promise.all(selectedItems.map(i =>
        updateMenuItem(rid, i.id, { availableUntil: today }, dbOpt)
      ));
      toast.success(`${selectedItems.length} marked sold-out for today.`);
      sel.clear();
      await load();
    } catch (e) {
      console.error(e); toast.error('Bulk update failed.');
    } finally { setBulkBusy(null); }
  };

  const bulkSetAvailable = async () => {
    if (selectedItems.length === 0) return;
    setBulkBusy('available');
    try {
      await Promise.all(selectedItems.map(i =>
        updateMenuItem(rid, i.id, { availableUntil: null, isOutOfStock: false, isActive: true }, dbOpt)
      ));
      toast.success(`${selectedItems.length} restored to available.`);
      sel.clear();
      await load();
    } catch (e) {
      console.error(e); toast.error('Bulk update failed.');
    } finally { setBulkBusy(null); }
  };

  const bulkChangeCategory = async () => {
    if (selectedItems.length === 0) return;
    const newCat = window.prompt('Move selected items to which category? (existing or new name)');
    if (newCat === null) return; // cancelled
    const trimmed = newCat.trim();
    if (!trimmed) { toast.error('Category name required'); return; }
    setBulkBusy('category');
    try {
      await Promise.all(selectedItems.map(i =>
        updateMenuItem(rid, i.id, { category: trimmed }, dbOpt)
      ));
      toast.success(`${selectedItems.length} moved to "${trimmed}".`);
      sel.clear();
      await load();
    } catch (e) {
      console.error(e); toast.error('Bulk update failed.');
    } finally { setBulkBusy(null); }
  };

  const bulkDelete = () => {
    if (selectedItems.length === 0) return;
    setConfirmDialog({
      title: `Delete ${selectedItems.length} item${selectedItems.length === 1 ? '' : 's'}?`,
      body: 'This cannot be undone.',
      confirmLabel: 'Yes, delete all',
      cancelLabel: 'Keep items',
      destructive: true,
      onConfirm: async () => {
        setBulkBusy('delete');
        try {
          await Promise.all(selectedItems.map(i => deleteMenuItem(rid, i.id, dbOpt)));
          toast.success(`${selectedItems.length} deleted.`);
          sel.clear();
          await load();
        } catch (e) {
          console.error(e); toast.error('Bulk delete failed.');
        } finally { setBulkBusy(null); }
      },
    });
  };

  // ═══ Bulk image optimization ═══
  // Retroactively shrinks existing oversized menu photos through the same
  // resizeImage() pipeline that handles new uploads. Items already under
  // 200 KB are skipped inside resizeImage(), so this is safe to run any
  // number of times — repeated runs after the first do nothing.
  // Quality preservation: PNGs stay PNG (lossless), JPEGs are re-encoded
  // at 0.85 (industry standard "visually identical" level).
  const [optimizing, setOptimizing] = useState(null); // null | { index, total, name }

  // Bulk optimize covers BOTH menu items AND admin-uploaded category
  // images now. Category images go through the same optimizeOneImage
  // pipeline but with a tighter 320×320 cap (they only render at
  // 64×64 in the customer menu's category strip) and write back to
  // restaurant.categoryImages instead of the menu-item doc.
  const runBulkOptimize = () => {
    const itemTargets = items.filter(i => i.imageURL);
    const catTargets = Object.entries(savedCategoryImages || {})
      .filter(([, url]) => !!url)
      .map(([name, url]) => ({ name, url }));
    const total = itemTargets.length + catTargets.length;
    if (total === 0) {
      toast.error('No images to optimize.');
      return;
    }

    const summary = catTargets.length === 0
      ? `${itemTargets.length} menu image${itemTargets.length === 1 ? '' : 's'}`
      : itemTargets.length === 0
        ? `${catTargets.length} category image${catTargets.length === 1 ? '' : 's'}`
        : `${itemTargets.length} menu + ${catTargets.length} category image${total === 1 ? '' : 's'}`;
    setConfirmDialog({
      title: `Optimize ${summary}?`,
      body: `Each photo is re-encoded into a smaller version. Quality is preserved (PNGs stay PNG, JPEGs stay JPEG at standard quality). Images already small enough are skipped automatically.`,
      confirmLabel: 'Yes, optimize',
      cancelLabel: 'Cancel',
      destructive: false,
      onConfirm: async () => {
        setOptimizing({ index: 0, total, name: '' });
        let processed = 0, skipped = 0, failed = 0, savedBytes = 0;
        let i = 0;

        for (const it of itemTargets) {
          i += 1;
          setOptimizing({ index: i, total, name: it.name || '' });
          try {
            const result = await optimizeOneImage(rid, it, undefined, scopedStorage);
            if (!result) { skipped += 1; }
            else {
              // Storage: replace the previously-tracked size (or 0 for
              // legacy items) with the actual post-optimize size, and
              // adjust the restaurant's storageUsedMB by the delta.
              const newSizeMB = result.sizeAfter / (1024 * 1024);
              const oldSizeMB = Number(it.imageSize) || 0;
              await updateMenuItem(rid, it.id, { imageURL: result.newURL, imageSize: newSizeMB }, dbOpt);
              setItems(prev => prev.map(x => x.id === it.id ? { ...x, imageURL: result.newURL, imageSize: newSizeMB } : x));
              if (result.oldPath) deleteFile(result.oldPath, scopedStorage).catch(() => {});
              try { await bumpStorageUsed(rid, newSizeMB - oldSizeMB, dbOpt); } catch { /* best-effort */ }
              processed += 1;
              savedBytes += (result.sizeBefore - result.sizeAfter);
            }
          } catch (e) { failed += 1; console.error('[optimize/item]', it.name, e); }
        }

        // Category images — use the same optimizeOneImage but mark
        // them with a synthetic shape that the helper accepts
        // (imageURL + a tighter resize cap). Category nav tiles
        // render at 64×64 so 320×320 is more than enough.
        for (const cat of catTargets) {
          i += 1;
          setOptimizing({ index: i, total, name: cat.name });
          try {
            const synthetic = { id: `cat:${cat.name}`, name: cat.name, imageURL: cat.url };
            const result = await optimizeOneImage(rid, synthetic, { maxWidth: 320, maxHeight: 320, quality: 0.82 }, scopedStorage);
            if (!result) { skipped += 1; }
            else {
              const nextImages = { ...savedCategoryImages, [cat.name]: result.newURL };
              setSavedCategoryImages(nextImages);
              await updateRestaurant(rid, { categoryImages: nextImages }, dbOpt);
              if (result.oldPath) deleteFile(result.oldPath, scopedStorage).catch(() => {});
              processed += 1;
              savedBytes += (result.sizeBefore - result.sizeAfter);
            }
          } catch (e) { failed += 1; console.error('[optimize/cat]', cat.name, e); }
        }

        setOptimizing(null);

        const savedStr = savedBytes > 1024 * 1024
          ? `${(savedBytes / 1024 / 1024).toFixed(1)} MB`
          : `${Math.round(savedBytes / 1024)} KB`;
        if (processed > 0) {
          toast.success(
            `Optimized ${processed} image${processed === 1 ? '' : 's'} · saved ${savedStr}` +
            (skipped ? ` · ${skipped} already small` : '') +
            (failed  ? ` · ${failed} failed`        : '')
          );
        } else if (failed === 0) {
          toast.success(`All ${skipped} image${skipped === 1 ? '' : 's'} already optimized — no changes needed.`);
        } else {
          toast.error(`Couldn't optimize any images — ${failed} failed (see browser console).`);
        }
      },
    });
  };

  // ═══ CSV import / export — Petpooja-compatible columns ═══
  // Schema: name, category, price, veg, description, prep_time_min, image_url
  // - veg = "Yes" / "No" (Petpooja convention)
  // - prep_time_min is optional; blank = unspecified
  // - image_url is optional; if blank on import, item is created without an image
  const exportCSV = () => {
    if (items.length === 0) { toast.error('No items to export.'); return; }
    const rows = [
      ['name', 'category', 'price', 'veg', 'description', 'prep_time_min', 'image_url'],
      ...items.map(i => [
        i.name || '',
        i.category || '',
        i.price ?? '',
        i.isVeg ? 'Yes' : 'No',
        i.description || '',
        i.prepTime ?? '',
        i.imageURL || '',
      ]),
    ];
    exportRowsCsv(rows, `menu-items-${todayKey()}.csv`);
    toast.success(`Exported ${items.length} items.`);
  };

  const csvFileInputRef = useRef(null);
  const [importing, setImporting] = useState(false);

  const handleImportFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // reset so selecting the same file twice still fires onChange
    if (!file) return;
    setImporting(true);
    try {
      const text = await file.text();
      const parsed = parseCSV(text);
      if (parsed.length < 2) { toast.error('CSV is empty or has no rows.'); return; }
      const [header, ...rows] = parsed;
      const idx = (col) => header.findIndex(h => h.trim().toLowerCase() === col);
      const colName  = idx('name');
      const colCat   = idx('category');
      const colPrice = idx('price');
      const colVeg   = idx('veg');
      const colDesc  = idx('description');
      const colPrep  = idx('prep_time_min');
      const colImg   = idx('image_url');
      if (colName === -1 || colPrice === -1) {
        toast.error('CSV missing required columns: name, price');
        return;
      }
      if (!confirm(`Import ${rows.length} row${rows.length === 1 ? '' : 's'}? Existing items will NOT be overwritten — these are added as new items.`)) {
        return;
      }
      let ok = 0, skipped = 0;
      for (const row of rows) {
        const name = (row[colName] || '').trim();
        const priceRaw = (row[colPrice] || '').trim();
        const price = parseFloat(priceRaw);
        if (!name || isNaN(price) || price < 0) { skipped += 1; continue; }
        const data = {
          name,
          category: colCat   !== -1 ? (row[colCat]  || '').trim() : '',
          price,
          isVeg:    colVeg   !== -1 ? /^(yes|y|true|1|veg)$/i.test((row[colVeg] || '').trim()) : false,
          description: colDesc !== -1 ? (row[colDesc] || '').trim() : '',
          prepTime: colPrep  !== -1 && row[colPrep] ? parseInt(row[colPrep], 10) || null : null,
          imageURL: colImg   !== -1 ? (row[colImg]  || '').trim() || null : null,
          modelURL: null, arReady: false,
          sortOrder: 9999, isFeatured: false,
        };
        try { await createMenuItem(rid, data, dbOpt); ok += 1; }
        catch (err) { console.error('Import row failed for', name, err); skipped += 1; }
      }
      if (ok > 0) toast.success(`Imported ${ok} item${ok === 1 ? '' : 's'}${skipped ? ` · ${skipped} skipped` : ''}.`);
      else toast.error(`No rows imported (${skipped} skipped). Check column headers + price values.`);
      await load();
    } catch (err) {
      console.error('CSV import failed:', err);
      toast.error('Could not parse CSV — check the file format.');
    } finally { setImporting(false); }
  };

  const canDrag = statusFilter === 'all' && catFilter === 'all' && !search.trim() && sel.count === 0;

  return (
    <FeatureShell ready={ready} isAdmin={isAdmin} active="/admin/items">
      <Head><title>Menu Items | HaloHelm</title></Head>
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

        {/* Hidden file input — triggered by the Import CSV button. Lives at
            the top of the JSX so its ref is mounted before any handler runs. */}
        <input
          ref={csvFileInputRef}
          type="file"
          accept=".csv,text/csv"
          onChange={handleImportFile}
          style={{ display: 'none' }}
        />

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
              {/* Phase B — hybrid-mode banner. Inline so it's
                  visually attached to the page header rather than
                  floating. Only renders when restaurant is in
                  petpooja_hybrid mode. */}
              {isHybrid && (
                <div style={{
                  marginTop: 14, padding: '12px 14px',
                  background: 'rgba(196,168,109,0.10)',
                  border: '1px solid rgba(196,168,109,0.30)',
                  borderRadius: 9,
                  fontSize: 12.5, color: A.ink,
                  display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
                }}>
                  <span style={{ fontSize: 16 }}>🔌</span>
                  <span><strong>Menu is managed in Petpooja.</strong> Item names, prices, categories, and stock are read-only here — edit them in your Petpooja dashboard, then sync. You can still upload images, AR models, and discovery tags from this page.</span>
                  <Link href="/admin/petpooja-connect" style={{ marginLeft: 'auto', fontSize: 12, color: A.warningDim, fontWeight: 600, textDecoration: 'none' }}>
                    Manage integration →
                  </Link>
                </div>
              )}
            </div>

            {/* Export / Import CSV — Petpooja-compatible columns. Import
                creates new docs (does NOT update existing items) so a
                misclick can't overwrite a curated menu. */}
            <div style={{ display: 'flex', gap: 8, flexShrink: 0, flexWrap: 'wrap', alignSelf: 'flex-start' }}>
              <button onClick={exportCSV} disabled={items.length === 0 || importing}
                style={{
                  padding: '9px 16px', borderRadius: 9, border: A.borderStrong,
                  background: A.shell, color: A.ink,
                  fontSize: 12, fontWeight: 600, fontFamily: A.font,
                  cursor: (items.length === 0 || importing) ? 'not-allowed' : 'pointer',
                  opacity: (items.length === 0 || importing) ? 0.5 : 1,
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                }}>
                ↓ Export CSV
              </button>
              <button onClick={() => csvFileInputRef.current?.click()} disabled={importing}
                style={{
                  padding: '9px 16px', borderRadius: 9, border: A.borderStrong,
                  background: A.shell, color: A.ink,
                  fontSize: 12, fontWeight: 600, fontFamily: A.font,
                  cursor: importing ? 'not-allowed' : 'pointer',
                  opacity: importing ? 0.5 : 1,
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                }}>
                {importing
                  ? <><span style={{ width: 11, height: 11, border: `2px solid ${A.ink}`, borderTopColor: 'transparent', borderRadius: '50%', display: 'inline-block', animation: 'spin 0.7s linear infinite' }} /> Importing…</>
                  : '↑ Import CSV'}
              </button>
              {/* Optimize images — retroactively shrinks oversized menu
                  photos so existing items benefit from the same resize
                  pipeline as new uploads. Disabled when no images exist
                  or when an optimize pass is already running. */}
              <button onClick={runBulkOptimize}
                disabled={!!optimizing || items.filter(i => i.imageURL).length === 0}
                title={optimizing
                  ? `Optimizing ${optimizing.name || ''}…`
                  : 'Re-encode oversized menu photos for faster loading'}
                style={{
                  padding: '9px 16px', borderRadius: 9, border: A.borderStrong,
                  background: A.shell, color: A.ink,
                  fontSize: 12, fontWeight: 600, fontFamily: A.font,
                  cursor:  (!!optimizing || items.filter(i => i.imageURL).length === 0) ? 'not-allowed' : 'pointer',
                  opacity: (!!optimizing || items.filter(i => i.imageURL).length === 0) ? 0.5 : 1,
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                }}>
                {optimizing
                  ? <><span style={{ width: 11, height: 11, border: `2px solid ${A.ink}`, borderTopColor: 'transparent', borderRadius: '50%', display: 'inline-block', animation: 'spin 0.7s linear infinite' }} /> Optimizing {optimizing.index}/{optimizing.total}</>
                  : '✨ Optimize images'}
              </button>
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

          {/* ═══ Customer-facing category order (May 8) ═══
              Drag-reorder strip mirroring what diners see at the top
              of the menu page. Saves to restaurants/{rid}.categoryOrder
              optimistically; the customer page reads that field to
              order its category sections. New categories (typed for
              the first time on a new item) auto-append at the end —
              admin can drag them into position later. */}
          {effectiveCategoryOrder.length > 1 && (
            <div style={{ marginTop: 16 }}>
              <div style={{
                display: 'flex', alignItems: 'center', gap: 8,
                fontSize: 11, fontWeight: 600, color: A.faintText,
                letterSpacing: '0.06em', textTransform: 'uppercase',
                marginBottom: 8,
              }}>
                <span>Customer menu order</span>
                <span style={{ color: A.mutedText, textTransform: 'none', letterSpacing: 0, fontWeight: 500 }}>
                  · drag to reorder how categories appear on the menu
                </span>
              </div>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                {effectiveCategoryOrder.map((name) => {
                  const isDragging = catDragging === name;
                  const isOver = catDragOver.current === name;
                  const count = items.filter(i => (i.category || '').trim() === name).length;
                  const adminImage = savedCategoryImages[name] || '';
                  const fallbackImage = items.find(i => (i.category || '').trim() === name && i.imageURL)?.imageURL || '';
                  const previewImage = adminImage || fallbackImage;
                  const uploadingPct = catImgUploading[name];
                  return (
                    <div
                      key={name}
                      draggable={renamingCat !== name}
                      onDragStart={() => { catDragFrom.current = name; setCatDragging(name); }}
                      onDragEnter={() => { catDragOver.current = name; }}
                      onDragOver={(e) => e.preventDefault()}
                      onDragEnd={handleCatDragEnd}
                      title={renamingCat === name ? 'Editing…' : `Drag to reorder ${name}`}
                      style={{
                        padding: '8px 12px 8px 8px', borderRadius: 10,
                        background: A.shell, border: A.border,
                        boxShadow: isDragging ? '0 4px 14px rgba(0,0,0,0.10)' : A.shadowCard,
                        opacity: isDragging ? 0.55 : 1,
                        outline: isOver && !isDragging ? `2px solid ${A.warning}` : 'none',
                        outlineOffset: 2,
                        cursor: 'grab',
                        display: 'inline-flex', alignItems: 'center', gap: 8,
                        fontSize: 13, fontWeight: 600, color: A.ink,
                        fontFamily: A.font,
                        userSelect: 'none',
                        transition: 'opacity 0.15s ease, box-shadow 0.15s ease, outline-color 0.15s ease',
                      }}
                    >
                      <span style={{ color: A.faintText, fontSize: 11 }}>⋮⋮</span>
                      {/* Hidden file input — clicked via the image button below.
                          Each category gets its own ref so multiple chips don't
                          share a single picker state. */}
                      <input
                        ref={(el) => { catImgInputRef.current[name] = el; }}
                        type="file" accept="image/*" style={{ display: 'none' }}
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) handleCategoryImageUpload(name, file);
                          // Reset so picking the same file again still fires.
                          e.target.value = '';
                        }}
                      />
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); catImgInputRef.current[name]?.click(); }}
                        title={previewImage ? 'Click to change category image' : 'Click to upload category image'}
                        style={{
                          width: 32, height: 32, borderRadius: '50%',
                          border: previewImage ? `1.5px solid ${A.border}` : `1.5px dashed ${A.faintText}`,
                          background: previewImage
                            ? `center/cover no-repeat url(${previewImage})`
                            : A.subtleBg,
                          color: A.faintText, fontSize: 11,
                          cursor: 'pointer', flexShrink: 0,
                          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                          padding: 0, position: 'relative', overflow: 'hidden',
                        }}
                      >
                        {!previewImage && '＋'}
                        {typeof uploadingPct === 'number' && (
                          <span style={{
                            position: 'absolute', inset: 0,
                            background: 'rgba(0,0,0,0.55)', color: '#fff',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontSize: 9, fontWeight: 700,
                          }}>{uploadingPct}%</span>
                        )}
                      </button>
                      {renamingCat === name ? (
                        <input
                          autoFocus
                          value={renameInput}
                          onChange={(e) => setRenameInput(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') { e.preventDefault(); commitRename(); }
                            else if (e.key === 'Escape') { e.preventDefault(); cancelRename(); }
                          }}
                          onBlur={commitRename}
                          onClick={(e) => e.stopPropagation()}
                          disabled={renameBusy}
                          style={{
                            border: `1.5px solid ${A.warning}`,
                            borderRadius: 6,
                            padding: '3px 8px',
                            fontSize: 13, fontWeight: 600, color: A.ink,
                            fontFamily: A.font,
                            outline: 'none',
                            background: A.shell,
                            minWidth: 80, maxWidth: 140,
                          }}
                        />
                      ) : (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                          {name}
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); startRename(name); }}
                            title="Rename category"
                            style={{
                              width: 18, height: 18, borderRadius: '50%',
                              border: 'none', background: 'transparent',
                              color: A.faintText, cursor: 'pointer',
                              fontSize: 11, lineHeight: 1, padding: 0,
                            }}
                          >✎</button>
                        </span>
                      )}
                      <span style={{
                        padding: '1px 7px', borderRadius: 6,
                        background: A.subtleBg, color: A.faintText,
                        fontSize: 10, fontWeight: 700, fontFamily: A.mono,
                      }}>{count}</span>
                      {adminImage && (
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); handleCategoryImageClear(name); }}
                          title="Clear admin-set image (revert to first item's photo)"
                          style={{
                            width: 18, height: 18, borderRadius: '50%',
                            border: 'none', background: 'transparent',
                            color: A.faintText, cursor: 'pointer',
                            fontSize: 14, lineHeight: 1, padding: 0,
                            marginLeft: -2,
                          }}
                        >×</button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* ═══ Table ═══ */}
        <div style={{ padding: '0 28px 80px' }}>
          {!loaded ? (
            <LoadingCard />
          ) : displayed.length === 0 ? (
            <EmptyState
              title={items.length === 0 ? 'No menu items yet' : 'No items match your filter'}
              subtitle={items.length === 0
                ? 'Add your dishes via the Add Items page — that\'s where you upload the photo, name, price, and AR model. Once added, they\'ll appear here.'
                : 'Try clearing filters or search terms.'}
              ctaLabel={items.length === 0 ? 'Go to Add Items →' : null}
              onCta={items.length === 0 ? () => router.push('/admin/requests') : null}
            />
          ) : (
            <div style={{
              background: A.shell, borderRadius: 14, border: A.border,
              boxShadow: A.shadowCard, overflow: 'hidden',
            }}>
              {/* Table header — leading 28px column for the bulk-select checkbox */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: '28px 36px 56px 1fr 110px 90px 90px 110px 100px',
                gap: 10, alignItems: 'center',
                padding: '10px 18px',
                borderBottom: A.border,
                background: A.shellDarker,
                fontSize: 10, fontWeight: 700, color: A.faintText,
                letterSpacing: '0.08em', textTransform: 'uppercase',
              }}>
                <SelectAllCheckbox
                  allSelected={sel.allSelected}
                  someSelected={sel.someSelected}
                  onToggle={sel.toggleAll}
                />
                <div></div>
                <div></div>
                <div>Dish</div>
                <div>Category</div>
                <div>Price</div>
                <div>Prep</div>
                <div>Status</div>
                <div style={{ textAlign: 'right' }}>Actions</div>
              </div>

              {/* Rows — flat map over `displayed`, with a category
                  heading row injected each time the category changes.
                  Keeps the existing 100-line row JSX intact; the only
                  change is the React.Fragment wrapper that gets a
                  heading prepended on the first item of each group. */}
              {displayed.map((item, idx) => {
                const soldOut = isSoldOutToday(item);
                const oos = item.isOutOfStock;
                const visible = item.isActive !== false;
                const refs = itemRefs[item.id];
                const refCount = (refs?.combos.length || 0) + (refs?.offers.length || 0);
                const upload = imgUpload[item.id];

                const checked = sel.isSelected(item.id);
                const myCat = (item.category || '').trim() || 'Other';
                const prevCat = idx > 0 ? ((displayed[idx - 1].category || '').trim() || 'Other') : null;
                const isCategoryStart = myCat !== prevCat;
                const groupSize = displayed.filter(i => ((i.category || '').trim() || 'Other') === myCat).length;
                const heading = isCategoryStart ? (
                  <div key={`cat_head_${myCat}`} style={{
                    display: 'flex', alignItems: 'baseline', gap: 10,
                    padding: '12px 18px',
                    background: 'rgba(196,168,109,0.06)',
                    borderBottom: A.border,
                    borderTop: idx > 0 ? A.border : 'none',
                  }}>
                    <span style={{
                      fontSize: 12, fontWeight: 700, color: A.warningDim,
                      letterSpacing: '0.06em', textTransform: 'uppercase',
                    }}>{myCat}</span>
                    <span style={{
                      fontSize: 11, fontWeight: 600, color: A.faintText,
                      fontFamily: A.mono,
                    }}>{groupSize}</span>
                    <span style={{
                      marginLeft: 'auto', fontSize: 10, color: A.faintText,
                      fontWeight: 500, letterSpacing: '0.04em',
                    }}>Featured first · drag to reorder within</span>
                  </div>
                ) : null;
                return (
                  <Fragment key={item.id}>
                    {heading}
                  <div className={`it-row ${dragging === item.id ? 'dragging' : ''} ${dragOverItem.current === item.id ? 'over' : ''}`}
                    draggable={canDrag}
                    onDragStart={() => { dragItem.current = item.id; setDragging(item.id); }}
                    onDragEnter={() => { dragOverItem.current = item.id; }}
                    onDragOver={e => e.preventDefault()}
                    onDragEnd={handleDragEnd}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '28px 36px 56px 1fr 110px 90px 90px 110px 100px',
                      gap: 10, alignItems: 'center',
                      padding: '12px 18px',
                      borderBottom: idx === displayed.length - 1 ? 'none' : A.border,
                      opacity: visible ? 1 : 0.55,
                      animation: 'fadeUp 0.22s ease both',
                      animationDelay: `${Math.min(idx * 0.02, 0.2)}s`,
                      background: checked ? 'rgba(196,168,109,0.06)' : undefined,
                    }}>

                    {/* Bulk-select checkbox — clicking the row outside it
                        does NOT toggle (avoids accidental selection while
                        the user is interacting with the row). */}
                    <RowCheckbox checked={checked} onChange={() => sel.toggle(item.id)} />

                    {/* Drag handle */}
                    <div className={canDrag ? 'it-drag' : ''}
                      style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        opacity: canDrag ? 1 : 0.2,
                      }}
                      title={canDrag ? 'Drag to reorder' : (sel.count > 0 ? 'Clear selection to reorder' : 'Clear filters to reorder')}>
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
                        {item.petpoojaItemId && (
                          <span style={{
                            display: 'inline-flex', alignItems: 'center',
                            padding: '1px 7px', borderRadius: 4,
                            background: 'rgba(255,140,66,0.10)',
                            color: '#C26A2D', fontSize: 10, fontWeight: 700,
                            letterSpacing: '0.04em',
                          }} title="Mirrored from Petpooja — name, price, category are managed there.">
                            Petpooja
                          </span>
                        )}
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
                  </Fragment>
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

        {/* Floating bulk-action bar — appears when 1+ rows selected */}
        <BulkActionBar
          count={sel.count}
          itemLabel="item"
          onClear={sel.clear}
          actions={[
            { label: 'Mark sold-out today', onClick: bulkSetSoldOut,    busy: bulkBusy === 'sold-out' },
            { label: 'Mark available',      onClick: bulkSetAvailable,  busy: bulkBusy === 'available' },
            { label: 'Change category',     onClick: bulkChangeCategory, busy: bulkBusy === 'category' },
            { label: 'Delete',              onClick: bulkDelete, danger: true, busy: bulkBusy === 'delete' },
          ]}
        />
      </div>

      {/* Card-style confirmation dialog (replaces native confirm()
          for delete prompts). */}
      <ConfirmModal
        open={!!confirmDialog}
        {...(confirmDialog || {})}
        onCancel={() => setConfirmDialog(null)}
      />
    </FeatureShell>
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

// Select-all checkbox in the table header. Tri-state: empty / checked /
// indeterminate (some-but-not-all of visible items selected).
function SelectAllCheckbox({ allSelected, someSelected, onToggle }) {
  return (
    <label
      onClick={(e) => e.stopPropagation()}
      style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        width: 20, height: 20, cursor: 'pointer',
      }}
      title={allSelected ? 'Deselect all visible' : 'Select all visible'}
    >
      <input
        type="checkbox"
        checked={allSelected}
        ref={(el) => { if (el) el.indeterminate = !allSelected && someSelected; }}
        onChange={onToggle}
        style={{
          width: 16, height: 16, margin: 0, cursor: 'pointer',
          accentColor: '#C4A86D',
        }}
      />
    </label>
  );
}

// Per-row checkbox. stopPropagation so clicking it doesn't kick off a
// row-level action like drag.
function RowCheckbox({ checked, onChange }) {
  return (
    <label
      onClick={(e) => e.stopPropagation()}
      style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        width: 20, height: 20, cursor: 'pointer',
      }}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={onChange}
        style={{
          width: 16, height: 16, margin: 0, cursor: 'pointer',
          accentColor: '#C4A86D',
        }}
      />
    </label>
  );
}

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