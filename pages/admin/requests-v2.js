// pages/admin/requests-v2.js
//
// ★ REDESIGN EXEMPLAR ★ — duplicate of /admin/requests on the dark "ok-root"
// theme (via <OkShell>). ALL logic (USDA nutrition auto-calc, MyMemory
// translation, bulk .xlsx upload + publish, single-item form with draft
// persistence, plan-limit gating, cancel) copied verbatim — only the render
// is new. Original /admin/requests untouched.
import Head from 'next/head';
import { useEffect, useState, useMemo } from 'react';
import { useFeatureAccess } from '../../hooks/useFeatureAccess';
import OkShell from '../../components/admin/OkShell';
import { getRequests, submitRequestAndPublish, getAllMenuItems, deleteRequest, getRestaurantById } from '../../lib/db';
import { planCap, formatCap } from '../../lib/plans';
import { uploadFile, buildImagePath, fileSizeMB } from '../../lib/storage';
import toast from 'react-hot-toast';
import * as XLSX from 'xlsx';

const USDA_KEY = 'fea6TbAGJ03EOEWPtWzEQ31VclGeRYsNqVhrWQ2A';
const BLANK = { name: '', nameTA: '', nameHI: '', description: '', descriptionTA: '', descriptionHI: '', category: '', price: '', ingredients: '', calories: '', protein: '', carbs: '', fats: '', prepTime: '' };

function parseIngredient(raw) {
  const gramsMatch = raw.match(/(\d+(?:\.\d+)?)\s*g\b/i);
  const grams = gramsMatch ? parseFloat(gramsMatch[1]) : null;
  const name = raw.replace(/\d+(?:\.\d+)?\s*g\b/i, '').replace(/\s+/g, ' ').trim();
  return { name, grams };
}
function smartDefault(name) {
  const n = name.toLowerCase();
  if (n.match(/butter|oil|ghee|cream|sauce|paste|syrup/)) return 20;
  if (n.match(/salt|pepper|spice|powder|cumin|turmeric|masala|seed/)) return 5;
  if (n.match(/garlic|ginger|chilli|chili|herb|leaf|leaves/)) return 10;
  if (n.match(/egg/)) return 55;
  if (n.match(/milk|water|stock|broth/)) return 60;
  if (n.match(/cheese/)) return 30;
  if (n.match(/flour|rice|pasta|noodle|grain|lentil|dal|bread/)) return 80;
  if (n.match(/chicken|meat|fish|prawn|beef|lamb|pork|paneer|tofu/)) return 120;
  if (n.match(/onion|tomato|potato|carrot|vegetable|veggie|capsicum|spinach/)) return 80;
  return 60;
}
function fetchWithTimeout(url, ms = 8000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  return fetch(url, { signal: ctrl.signal }).finally(() => clearTimeout(t));
}
async function fetchIngredientNutrition(ingredientRaw) {
  const { name: ingredientName, grams: specifiedGrams } = parseIngredient(ingredientRaw);
  const portionGrams = specifiedGrams ?? smartDefault(ingredientName);
  try {
    const url = 'https://api.nal.usda.gov/fdc/v1/foods/search' + `?query=${encodeURIComponent(ingredientName)}` + '&dataType=Foundation,SR%20Legacy' + '&pageSize=5' + `&api_key=${USDA_KEY}`;
    const searchRes = await fetchWithTimeout(url);
    const searchData = await searchRes.json();
    const candidates = searchData.foods || [];
    if (candidates.length === 0) return null;
    const lowerIng = ingredientName.toLowerCase();
    const food = candidates.find(c => (c.description || '').toLowerCase().split(',')[0].trim() === lowerIng) || candidates.find(c => (c.description || '').toLowerCase().includes(lowerIng)) || candidates[0];
    const scale = portionGrams / 100;
    const nutrients = { calories: 0, protein: 0, carbs: 0, fats: 0 };
    (food.foodNutrients || []).forEach(n => {
      const nName = (n.nutrientName || '').toLowerCase();
      const unit = (n.unitName || '').toLowerCase();
      const val = Number(n.value) || 0;
      if ((nName === 'energy' || nName.startsWith('energy')) && unit === 'kcal' && nutrients.calories === 0) nutrients.calories = val;
      if (unit !== 'g') return;
      if (nName === 'protein') nutrients.protein = val;
      else if (nName.includes('carbohydrate, by difference')) nutrients.carbs = val;
      else if (nName === 'total lipid (fat)') nutrients.fats = val;
    });
    if (!nutrients.calories && !nutrients.protein && !nutrients.carbs && !nutrients.fats) return null;
    return { calories: nutrients.calories * scale, protein: nutrients.protein * scale, carbs: nutrients.carbs * scale, fats: nutrients.fats * scale, portionGrams };
  } catch { return null; }
}
async function autoTranslate(text, targetLang) {
  if (!text?.trim()) return '';
  try {
    const res = await fetchWithTimeout(`https://api.mymemory.translated.net/get?q=${encodeURIComponent(text.trim())}&langpair=en|${targetLang}`, 5000);
    const data = await res.json();
    if (data?.responseStatus === 200 && data?.responseData?.translatedText) {
      const result = data.responseData.translatedText;
      if (result === text.trim().toUpperCase()) return '';
      return result;
    }
    return '';
  } catch { return ''; }
}

const labelStyle = { display: 'block', fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 700, color: 'var(--tx-3)', letterSpacing: '.05em', textTransform: 'uppercase', marginBottom: 6 };
const inputStyle = { width: '100%', padding: '10px 13px', background: 'var(--card-2)', border: '1px solid var(--line)', borderRadius: 9, fontSize: 13, color: 'var(--tx)', fontFamily: 'var(--font-body)', outline: 'none', boxSizing: 'border-box' };

function StatusBadge({ status }) {
  const map = {
    pending: { color: 'var(--gold)', bg: 'rgba(196,168,109,0.12)', border: 'rgba(196,168,109,0.30)', label: 'Live · Awaiting AR' },
    approved: { color: 'var(--success)', bg: 'rgba(63,170,99,0.12)', border: 'rgba(63,170,99,0.30)', label: 'AR Active' },
    rejected: { color: 'var(--danger)', bg: 'rgba(217,83,79,0.12)', border: 'rgba(217,83,79,0.30)', label: 'Rejected' },
  };
  const c = map[status] || map.pending;
  return <span style={{ padding: '3px 10px', borderRadius: 6, background: c.bg, color: c.color, border: `1px solid ${c.border}`, fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 700, letterSpacing: '.04em', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>{c.label}</span>;
}

export default function RequestsV2() {
  const { ready, isAdmin, rid, scopedDb, scopedStorage, canView, userData, staffSession } = useFeatureAccess('addItems');
  const restaurantName = userData?.restaurantName || staffSession?.restaurantName || 'Your Restaurant';

  const [requests, setRequests] = useState([]);
  const [restaurant, setRestaurant] = useState(null);
  const [loading, setLoading] = useState(true);
  const [categories, setCategories] = useState([]);

  const [showForm, setShowForm] = useState(() => { if (typeof window === 'undefined') return false; try { return sessionStorage.getItem('ar_req_showForm') === 'true'; } catch { return false; } });
  const [form, setForm] = useState(() => { if (typeof window === 'undefined') return BLANK; try { const s = sessionStorage.getItem('ar_req_form'); return s ? JSON.parse(s) : BLANK; } catch { return BLANK; } });
  const [imageFile, setImageFile] = useState(null);
  const [imagePreview, setImagePreview] = useState(() => { if (typeof window === 'undefined') return null; try { return sessionStorage.getItem('ar_req_imgPreview') || null; } catch { return null; } });

  const [submitting, setSubmitting] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [calcLoading, setCalcLoading] = useState(false);
  const [calcDetail, setCalcDetail] = useState('');
  const [translating, setTranslating] = useState(false);
  const [bulkUploading, setBulkUploading] = useState(false);
  const [bulkProgress, setBulkProgress] = useState({ done: 0, total: 0, current: '' });

  const [filter, setFilter] = useState('all');
  const [confirmCancel, setConfirmCancel] = useState(null);
  const [showCatDrop, setShowCatDrop] = useState(false);
  const [newCatInput, setNewCatInput] = useState('');
  const [showTranslations, setShowTranslations] = useState(false);

  useEffect(() => { try { sessionStorage.setItem('ar_req_form', JSON.stringify(form)); } catch {} }, [form]);
  useEffect(() => { try { sessionStorage.setItem('ar_req_showForm', showForm ? 'true' : 'false'); } catch {} }, [showForm]);
  useEffect(() => { try { if (imagePreview) sessionStorage.setItem('ar_req_imgPreview', imagePreview); else sessionStorage.removeItem('ar_req_imgPreview'); } catch {} }, [imagePreview]);

  useEffect(() => {
    if (!rid || !canView) return;
    const dbOpt = { db: scopedDb };
    Promise.all([getRequests(rid, null, dbOpt), getRestaurantById(rid, dbOpt), getAllMenuItems(rid, dbOpt)]).then(([reqs, rest, items]) => {
      setRequests(reqs); setRestaurant(rest);
      setCategories([...new Set(items.map(i => i.category).filter(Boolean))].sort());
      setLoading(false);
    }).catch(err => { console.error('requests page load error:', err); setLoading(false); });
  }, [rid, canView, scopedDb]); // eslint-disable-line react-hooks/exhaustive-deps

  const itemsUsed = restaurant?.itemsUsed || 0;
  const maxItems = planCap(restaurant, 'maxItems');
  const remaining = Math.max(0, maxItems - itemsUsed);
  const atLimit = itemsUsed >= maxItems;
  const planPct = maxItems ? Math.min(100, (itemsUsed / maxItems) * 100) : 0;

  const stats = useMemo(() => ({ pending: requests.filter(r => r.status === 'pending').length, approved: requests.filter(r => r.status === 'approved').length, rejected: requests.filter(r => r.status === 'rejected').length, total: requests.length }), [requests]);

  const handleImageChange = (e) => { const f = e.target.files[0]; if (!f) return; if (fileSizeMB(f) > 5) { toast.error('Image must be under 5MB'); return; } setImageFile(f); setImagePreview(URL.createObjectURL(f)); };

  const handleAutoCalc = async () => {
    const rawIngredients = form.ingredients.trim();
    if (!rawIngredients) { toast.error('Add ingredients first (comma-separated)'); return; }
    const list = rawIngredients.split(',').map(s => s.trim()).filter(Boolean);
    if (list.length === 0) { toast.error('No valid ingredients found'); return; }
    setCalcLoading(true); setCalcDetail('Starting…');
    let totals = { calories: 0, protein: 0, carbs: 0, fats: 0 };
    let found = 0; const missed = [];
    for (const ingredient of list) {
      const { name: ingName } = parseIngredient(ingredient);
      setCalcDetail(`Looking up: ${ingName}`);
      const data = await fetchIngredientNutrition(ingredient);
      if (data && (data.calories || data.protein || data.carbs || data.fats)) { totals.calories += data.calories || 0; totals.protein += data.protein || 0; totals.carbs += data.carbs || 0; totals.fats += data.fats || 0; found++; } else missed.push(ingName);
    }
    setCalcLoading(false); setCalcDetail('');
    if (found === 0) { toast.error('Could not find any ingredients. Try simpler names (e.g. "chicken")'); return; }
    setForm(f => ({ ...f, calories: Math.round(totals.calories).toString(), protein: Math.round(totals.protein).toString(), carbs: Math.round(totals.carbs).toString(), fats: Math.round(totals.fats).toString() }));
    if (missed.length > 0) toast.success(`Calculated! ${missed.length} not found: ${missed.join(', ')} — adjust manually`);
    else toast.success(`Nutrition calculated from ${found} ingredient${found > 1 ? 's' : ''}! Adjust if needed.`);
  };

  const handleAutoTranslate = async () => {
    if (!form.name.trim()) { toast.error('Enter item name first'); return; }
    setTranslating(true);
    try {
      const [nameTA, nameHI, descTA, descHI] = await Promise.all([autoTranslate(form.name, 'ta'), autoTranslate(form.name, 'hi'), form.description ? autoTranslate(form.description, 'ta') : Promise.resolve(''), form.description ? autoTranslate(form.description, 'hi') : Promise.resolve('')]);
      setForm(f => ({ ...f, nameTA: nameTA || f.nameTA, nameHI: nameHI || f.nameHI, descriptionTA: descTA || f.descriptionTA, descriptionHI: descHI || f.descriptionHI }));
      toast.success('Translations filled! Review and edit if needed.');
    } catch { toast.error('Translation failed — try again'); }
    finally { setTranslating(false); }
  };

  const handleBulkUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    e.target.value = '';
    if (atLimit) { toast.error(`Item limit reached (${itemsUsed}/${maxItems}). Upgrade your plan to add more items.`); return; }
    const reader = new FileReader();
    reader.onload = async (ev) => {
      try {
        const wb = XLSX.read(ev.target.result, { type: 'array' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(ws, { defval: '' });
        if (!rows.length) { toast.error('No data found in the sheet'); return; }
        const sample = rows[0];
        if (!('name' in sample) || !('category' in sample) || !('price' in sample)) { toast.error('Sheet must have columns: name, category, price'); return; }
        const SPICE = ['None', 'Mild', 'Medium', 'Spicy', 'Very Spicy'];
        const BADGES = ['Best Seller', "Chef's Special", 'Must Try', 'New', 'Limited'];
        const valid = rows.filter(r => String(r.name || '').trim() && String(r.category || '').trim() && r.price);
        if (!valid.length) { toast.error('No valid rows found — name, category and price are required'); return; }
        if (valid.length > remaining) { toast.error(`You can only add ${remaining} more item${remaining !== 1 ? 's' : ''} (${itemsUsed}/${maxItems} used).`); return; }
        setBulkUploading(true); setBulkProgress({ done: 0, total: valid.length, current: '' });
        let success = 0, failed = 0;
        for (const row of valid) {
          const name = String(row.name || '').trim();
          setBulkProgress(p => ({ ...p, current: name }));
          try {
            const ingredients = String(row.ingredients || '').split(',').map(s => s.trim()).filter(Boolean);
            const spice = SPICE.includes(String(row.spiceLevel || '').trim()) ? String(row.spiceLevel).trim() : null;
            const badge = BADGES.includes(String(row.badge || '').trim()) ? String(row.badge).trim() : null;
            const isVeg = String(row.isVeg || '').trim().toLowerCase() === 'yes';
            let cal = Number(row.calories) || null, prot = Number(row.protein) || null, carb = Number(row.carbs) || null, fat = Number(row.fats) || null;
            const needsCalc = (!cal || !prot || !carb || !fat) && ingredients.length > 0;
            if (needsCalc) {
              setBulkProgress(p => ({ ...p, current: `${name} — calculating nutrition…` }));
              let totals = { calories: 0, protein: 0, carbs: 0, fats: 0 }; let found = 0;
              for (const ing of ingredients) { const data = await fetchIngredientNutrition(ing); if (data && (data.calories || data.protein || data.carbs || data.fats)) { totals.calories += data.calories || 0; totals.protein += data.protein || 0; totals.carbs += data.carbs || 0; totals.fats += data.fats || 0; found++; } }
              if (found > 0) { if (!cal) cal = Math.round(totals.calories); if (!prot) prot = Math.round(totals.protein); if (!carb) carb = Math.round(totals.carbs); if (!fat) fat = Math.round(totals.fats); }
            }
            const imageURL = String(row.imageUrl || row.imageURL || row.image_url || row.Image || '').trim() || null;
            const localRestaurant = { ...restaurant, itemsUsed: (restaurant?.itemsUsed || 0) + success };
            await submitRequestAndPublish(rid, { name, category: String(row.category || '').trim(), description: String(row.description || '').trim(), price: Number(row.price) || 0, ingredients, prepTime: String(row.prepTime || '').trim() || null, spiceLevel: spice, isVeg, badge, imageURL, nutritionalData: { calories: cal, protein: prot, carbs: carb, fats: fat } }, localRestaurant, { db: scopedDb });
            success++;
          } catch { failed++; }
          setBulkProgress(p => ({ ...p, done: p.done + 1 }));
        }
        setBulkUploading(false); setBulkProgress({ done: 0, total: 0, current: '' });
        const [updated, updatedRest] = await Promise.all([getRequests(rid, null, { db: scopedDb }), getRestaurantById(rid, { db: scopedDb })]);
        setRequests(updated); setRestaurant(updatedRest);
        if (failed === 0) toast.success(`${success} item${success > 1 ? 's' : ''} submitted and published!`);
        else toast.success(`${success} published, ${failed} failed — check those rows`);
      } catch { setBulkUploading(false); toast.error('Could not read file — make sure it is a valid .xlsx file'); }
    };
    reader.readAsArrayBuffer(file);
  };

  const handleCancelRequest = async (reqId) => {
    try { await deleteRequest(rid, reqId, { db: scopedDb }); setRequests(r => r.filter(x => x.id !== reqId)); toast.success('Request cancelled'); }
    catch { toast.error('Failed to cancel request'); }
    setConfirmCancel(null);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!rid || !form.name.trim()) { toast.error('Item name is required'); return; }
    if (!form.category.trim()) { toast.error('Category is required'); return; }
    if (!form.price || Number(form.price) <= 0) { toast.error('Price is required'); return; }
    if (atLimit) { toast.error(`Item limit reached (${itemsUsed}/${maxItems}). Upgrade your plan to add more items.`); return; }
    setSubmitting(true);
    try {
      let imageURL = null;
      if (imageFile) { const path = buildImagePath(rid, imageFile.name); imageURL = await uploadFile(imageFile, path, setUploadProgress, scopedStorage); }
      const ingredients = form.ingredients ? form.ingredients.split(',').map(s => s.trim()).filter(Boolean) : [];
      await submitRequestAndPublish(rid, { name: form.name.trim(), nameTA: form.nameTA?.trim() || null, nameHI: form.nameHI?.trim() || null, description: form.description.trim(), descriptionTA: form.descriptionTA?.trim() || null, descriptionHI: form.descriptionHI?.trim() || null, category: form.category.trim(), price: Number(form.price) || 0, ingredients, prepTime: form.prepTime.trim() || null, nutritionalData: { calories: Number(form.calories) || null, protein: Number(form.protein) || null, carbs: Number(form.carbs) || null, fats: Number(form.fats) || null }, imageURL, imageSize: imageFile ? fileSizeMB(imageFile) : 0 }, restaurant, { db: scopedDb });
      toast.success('Item published to menu! AR will be added once our team uploads the 3D model.');
      setForm(BLANK); setImageFile(null); setImagePreview(null); setShowForm(false); setShowTranslations(false);
      try { sessionStorage.removeItem('ar_req_form'); sessionStorage.removeItem('ar_req_showForm'); sessionStorage.removeItem('ar_req_imgPreview'); } catch {}
      const [updated, updatedRest] = await Promise.all([getRequests(rid, null, { db: scopedDb }), getRestaurantById(rid, { db: scopedDb })]);
      setRequests(updated); setRestaurant(updatedRest);
    } catch (err) { console.error('Submit error:', err); toast.error(err?.code === 'permission-denied' ? 'Permission denied — check Firestore rules' : (err?.message || 'Failed to submit. Try again.')); }
    finally { setSubmitting(false); setUploadProgress(0); }
  };

  const filtered = filter === 'all' ? requests : requests.filter(r => r.status === filter);

  if (!ready) {
    return (<div className="ok-root" style={{ minHeight: '100vh', display: 'grid', placeItems: 'center' }}><Head><title>Add Items — HaloHelm</title></Head><div style={{ color: 'var(--tx-3)', fontFamily: 'var(--font-body)', fontSize: 14 }}>Loading…</div></div>);
  }
  if (!canView) {
    return (<div className="ok-root" style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 24 }}><Head><title>Add Items — HaloHelm</title></Head><div style={{ textAlign: 'center', maxWidth: 360 }}><div style={{ fontSize: 44, marginBottom: 12 }}>🔒</div><div style={{ color: 'var(--tx)', fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 18, marginBottom: 6 }}>No access</div><div style={{ color: 'var(--tx-3)', fontFamily: 'var(--font-body)', fontSize: 13.5, lineHeight: 1.6 }}>Your role doesn’t include Add Items. Ask the owner to grant it.</div></div></div>);
  }

  const ghostBtn = { padding: '9px 16px', borderRadius: 10, background: 'var(--card)', border: '1px solid var(--line)', color: 'var(--tx)', fontFamily: 'var(--font-display)', fontSize: 13, fontWeight: 600, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 7 };
  const accentBtn = { padding: '9px 18px', borderRadius: 10, background: 'var(--accent)', color: 'var(--accent-ink)', border: 'none', fontFamily: 'var(--font-display)', fontSize: 13, fontWeight: 700, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6 };
  const headRight = (
    <>
      <label style={{ ...ghostBtn, cursor: bulkUploading || atLimit ? 'not-allowed' : 'pointer', opacity: atLimit ? 0.5 : 1 }}>
        {bulkUploading ? `Uploading ${bulkProgress.done}/${bulkProgress.total}…` : '↑ Bulk Upload (.xlsx)'}
        <input type="file" accept=".xlsx,.xls" onChange={handleBulkUpload} style={{ display: 'none' }} disabled={bulkUploading || atLimit} />
      </label>
      <button onClick={() => { if (atLimit) { toast.error(`Item limit reached (${itemsUsed}/${maxItems}).`); return; } setShowForm(s => !s); }} style={showForm ? ghostBtn : accentBtn}>{showForm ? '✕  Cancel' : '+  New Item'}</button>
    </>
  );

  return (
    <>
      <Head><title>Add Items — HaloHelm</title></Head>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}@keyframes ok-pulse{0%,100%{opacity:1}50%{opacity:.35}} .req-input:focus{outline:none;border-color:var(--gold)!important;background:var(--card)!important}`}</style>
      <OkShell active="menu" eyebrow="Menu · add items" title="Add Items" brand={restaurantName} headRight={headRight}>
        {/* Stat card */}
        <div style={{ background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 16, padding: '20px 24px', marginBottom: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 700, letterSpacing: '.10em', textTransform: 'uppercase', color: 'var(--gold)' }}>Menu items</span>
            <div style={{ flex: 1, height: 1, background: 'var(--line-soft)' }} />
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--tx-3)' }}>{itemsUsed} of {formatCap(maxItems)} used</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12 }}>
            {[{ label: 'Total', value: stats.total, color: 'var(--tx)' }, { label: 'Awaiting AR', value: stats.pending, color: stats.pending > 0 ? 'var(--gold)' : 'var(--tx)' }, { label: 'AR Active', value: stats.approved, color: stats.approved > 0 ? 'var(--success)' : 'var(--tx)' }, { label: 'Plan usage', value: `${Math.round(planPct)}%`, color: atLimit ? 'var(--danger)' : 'var(--tx)', isPlan: true }].map(s => (
              <div key={s.label} style={{ padding: '16px 18px', borderRadius: 12, background: 'var(--card-2)', border: '1px solid var(--line)' }}>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 600, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--tx-3)', marginBottom: 8 }}>{s.label}</div>
                <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 28, lineHeight: 1, color: s.color }}>{s.value}</div>
                {s.isPlan && <div style={{ marginTop: 8, height: 4, background: 'var(--card-3)', borderRadius: 2, overflow: 'hidden' }}><div style={{ width: `${planPct}%`, height: '100%', background: atLimit ? 'var(--danger)' : 'var(--gold)', transition: 'width 0.3s' }} /></div>}
              </div>
            ))}
          </div>
        </div>

        {atLimit && (
          <div style={{ background: 'rgba(217,83,79,0.08)', border: '1px solid rgba(217,83,79,0.30)', borderRadius: 12, padding: '12px 16px', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 16 }}>⚠</span>
            <span style={{ fontFamily: 'var(--font-body)', fontSize: 13, fontWeight: 600, color: 'var(--danger)', flex: 1 }}>You've reached your plan's item limit ({itemsUsed}/{formatCap(maxItems)}). Upgrade to add more items.</span>
          </div>
        )}
        {bulkUploading && (
          <div style={{ background: 'var(--card)', borderRadius: 12, border: '1px solid var(--line)', padding: '14px 18px', marginBottom: 14 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 700, color: 'var(--tx-2)', letterSpacing: '.04em', textTransform: 'uppercase' }}>Publishing items</span>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--tx-3)', fontWeight: 700 }}>{bulkProgress.done} / {bulkProgress.total}</span>
            </div>
            <div style={{ height: 6, background: 'var(--card-3)', borderRadius: 3, overflow: 'hidden' }}><div style={{ height: '100%', borderRadius: 3, background: 'var(--gold)', width: `${bulkProgress.total ? (bulkProgress.done / bulkProgress.total) * 100 : 0}%`, transition: 'width 0.25s' }} /></div>
            {bulkProgress.current && <div style={{ fontFamily: 'var(--font-body)', fontSize: 11, color: 'var(--tx-3)', marginTop: 6, fontStyle: 'italic' }}>Processing: {bulkProgress.current}</div>}
          </div>
        )}

        {/* New item form */}
        {showForm && (
          <div style={{ background: 'var(--card)', borderRadius: 16, border: '1px solid var(--line)', padding: '22px 26px', marginBottom: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 18 }}>
              <div style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--gold)' }} />
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 700, letterSpacing: '.10em', textTransform: 'uppercase', color: 'var(--gold)' }}>New menu item</span>
              <div style={{ flex: 1, height: 1, background: 'var(--line-soft)' }} />
            </div>
            <form onSubmit={handleSubmit}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
                <div><label style={labelStyle}>Item Name *</label><input className="req-input" style={inputStyle} value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Butter Chicken" required /></div>
                <div style={{ position: 'relative' }}>
                  <label style={labelStyle}>Category *</label>
                  <div onClick={() => setShowCatDrop(d => !d)} style={{ ...inputStyle, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between', userSelect: 'none' }}>
                    <span style={{ color: form.category ? 'var(--tx)' : 'var(--tx-3)' }}>{form.category || 'Select or type new…'}</span>
                    <span style={{ fontSize: 9, color: 'var(--tx-3)', marginLeft: 8 }}>{showCatDrop ? '▲' : '▼'}</span>
                  </div>
                  {showCatDrop && (
                    <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 20, background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 10, boxShadow: '0 16px 40px rgba(0,0,0,0.5)', marginTop: 4, overflow: 'hidden' }}>
                      <div style={{ padding: '10px 12px', borderBottom: '1px solid var(--line)', display: 'flex', gap: 8 }}>
                        <input autoFocus style={{ flex: 1, padding: '7px 10px', fontSize: 13, border: '1px solid var(--line)', borderRadius: 7, outline: 'none', fontFamily: 'var(--font-body)', color: 'var(--tx)', background: 'var(--card-2)' }} placeholder="Type new category…" value={newCatInput} onChange={e => setNewCatInput(e.target.value)}
                          onKeyDown={e => { if (e.key === 'Enter' && newCatInput.trim()) { const cat = newCatInput.trim(); setForm(f => ({ ...f, category: cat })); if (!categories.includes(cat)) setCategories(c => [...c, cat].sort()); setNewCatInput(''); setShowCatDrop(false); } }} />
                        <button type="button" onClick={() => { if (!newCatInput.trim()) return; const cat = newCatInput.trim(); setForm(f => ({ ...f, category: cat })); if (!categories.includes(cat)) setCategories(c => [...c, cat].sort()); setNewCatInput(''); setShowCatDrop(false); }} style={{ padding: '7px 14px', borderRadius: 7, border: 'none', background: 'var(--accent)', color: 'var(--accent-ink)', fontFamily: 'var(--font-display)', fontSize: 12, fontWeight: 700, cursor: 'pointer', flexShrink: 0 }}>Add</button>
                      </div>
                      <div style={{ maxHeight: 180, overflowY: 'auto' }}>
                        {categories.length === 0 ? <div style={{ padding: '12px 14px', fontFamily: 'var(--font-body)', fontSize: 12, color: 'var(--tx-3)' }}>No categories yet — type above to add one</div> : categories.map(cat => (
                          <div key={cat} onClick={() => { setForm(f => ({ ...f, category: cat })); setShowCatDrop(false); setNewCatInput(''); }} style={{ padding: '9px 14px', fontFamily: 'var(--font-body)', fontSize: 13, color: 'var(--tx)', cursor: 'pointer', background: form.category === cat ? 'rgba(196,168,109,0.10)' : 'transparent', fontWeight: form.category === cat ? 700 : 500 }}>{cat} {form.category === cat && <span style={{ color: 'var(--gold)', marginLeft: 4 }}>✓</span>}</div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
                <div><label style={labelStyle}>Price (₹) *</label><div style={{ position: 'relative' }}><span style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', fontSize: 14, fontWeight: 700, color: 'var(--tx-3)' }}>₹</span><input className="req-input" style={{ ...inputStyle, paddingLeft: 30 }} type="number" min="0" step="0.01" value={form.price} onChange={e => setForm(f => ({ ...f, price: e.target.value }))} placeholder="e.g. 280" required /></div></div>
                <div><label style={labelStyle}>Preparation Time</label><input className="req-input" style={inputStyle} value={form.prepTime} onChange={e => setForm(f => ({ ...f, prepTime: e.target.value }))} placeholder="e.g. 10–15 minutes" /></div>
              </div>
              <div style={{ marginBottom: 14 }}><label style={labelStyle}>Description</label><textarea className="req-input" style={{ ...inputStyle, resize: 'none', minHeight: 64, paddingTop: 10 }} rows={2} value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Brief description of the dish…" /></div>

              <div style={{ marginBottom: 14, borderRadius: 12, background: 'var(--card-2)', border: '1px solid var(--line)', overflow: 'hidden' }}>
                <div onClick={() => setShowTranslations(s => !s)} style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer', userSelect: 'none' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><span style={{ fontSize: 14 }}>🌐</span><span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 700, letterSpacing: '.10em', textTransform: 'uppercase', color: 'var(--tx-2)' }}>Translations</span><span style={{ fontFamily: 'var(--font-body)', fontSize: 10, color: 'var(--tx-3)' }}>(optional · Tamil + Hindi)</span></div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    {showTranslations && <button type="button" onClick={(e) => { e.stopPropagation(); handleAutoTranslate(); }} disabled={translating} style={{ padding: '5px 12px', borderRadius: 7, fontFamily: 'var(--font-display)', fontSize: 11, fontWeight: 700, border: '1px solid var(--gold)', background: 'rgba(196,168,109,0.10)', color: 'var(--gold)', cursor: translating ? 'not-allowed' : 'pointer', opacity: translating ? 0.6 : 1 }}>{translating ? 'Translating…' : '✦ Auto Translate'}</button>}
                    <span style={{ fontSize: 10, color: 'var(--tx-3)' }}>{showTranslations ? '▲' : '▼'}</span>
                  </div>
                </div>
                {showTranslations && (
                  <div style={{ padding: '0 16px 16px' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
                      <div><label style={labelStyle}>Tamil Name (தமிழ்)</label><input className="req-input" style={inputStyle} value={form.nameTA} onChange={e => setForm(f => ({ ...f, nameTA: e.target.value }))} placeholder="e.g. பட்டர் சிக்கன்" /></div>
                      <div><label style={labelStyle}>Hindi Name (हिंदी)</label><input className="req-input" style={inputStyle} value={form.nameHI} onChange={e => setForm(f => ({ ...f, nameHI: e.target.value }))} placeholder="e.g. बटर चिकन" /></div>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                      <div><label style={labelStyle}>Tamil Description</label><input className="req-input" style={inputStyle} value={form.descriptionTA} onChange={e => setForm(f => ({ ...f, descriptionTA: e.target.value }))} placeholder="தமிழ் விளக்கம்…" /></div>
                      <div><label style={labelStyle}>Hindi Description</label><input className="req-input" style={inputStyle} value={form.descriptionHI} onChange={e => setForm(f => ({ ...f, descriptionHI: e.target.value }))} placeholder="हिंदी विवरण…" /></div>
                    </div>
                  </div>
                )}
              </div>

              <div style={{ marginBottom: 14 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                  <label style={{ ...labelStyle, marginBottom: 0 }}>Ingredients (comma-separated)</label>
                  <button type="button" onClick={handleAutoCalc} disabled={calcLoading} style={{ padding: '5px 12px', borderRadius: 7, fontFamily: 'var(--font-display)', fontSize: 11, fontWeight: 700, border: '1px solid var(--gold)', background: 'rgba(196,168,109,0.10)', color: 'var(--gold)', cursor: calcLoading ? 'not-allowed' : 'pointer', opacity: calcLoading ? 0.6 : 1 }}>{calcLoading ? 'Calculating…' : '✦ Auto Calculate'}</button>
                </div>
                <input className="req-input" style={inputStyle} value={form.ingredients} onChange={e => setForm(f => ({ ...f, ingredients: e.target.value }))} placeholder="Chicken, Butter, Cream, Tomato, Spices" />
                {calcLoading && calcDetail && <div style={{ fontFamily: 'var(--font-body)', fontSize: 11, color: 'var(--gold)', marginTop: 5, fontStyle: 'italic' }}>{calcDetail}</div>}
                <div style={{ fontFamily: 'var(--font-body)', fontSize: 11, color: 'var(--tx-3)', marginTop: 4 }}>For accurate nutrition add weight: <strong>Flour 150g, Garlic 10g</strong> — or just names for estimates</div>
              </div>

              <div style={{ marginBottom: 14 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                  <label style={{ ...labelStyle, marginBottom: 0 }}>Nutrition (per serving)</label>
                  {(form.calories || form.protein || form.carbs || form.fats) && <span style={{ fontFamily: 'var(--font-body)', fontSize: 11, color: 'var(--success)', fontWeight: 700 }}>✓ Values filled — edit if needed</span>}
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 10 }}>
                  {['calories', 'protein', 'carbs', 'fats'].map(n => (
                    <div key={n}>
                      <label style={{ ...labelStyle, fontSize: 10 }}>{n.charAt(0).toUpperCase() + n.slice(1)} {n === 'calories' ? '(kcal)' : '(g)'}</label>
                      <input className="req-input" style={{ ...inputStyle, background: form[n] ? 'rgba(63,170,99,0.08)' : 'var(--card-2)', borderColor: form[n] ? 'rgba(63,170,99,0.30)' : 'var(--line)' }} type="number" min="0" value={form[n]} onChange={e => setForm(f => ({ ...f, [n]: e.target.value }))} placeholder="0" />
                    </div>
                  ))}
                </div>
              </div>

              <div style={{ marginBottom: 16 }}>
                <label style={labelStyle}>Food Photo</label>
                <div onClick={() => document.getElementById('img-upload-v2').click()} style={{ border: '2px dashed var(--line)', borderRadius: 12, padding: 22, textAlign: 'center', cursor: 'pointer', background: 'var(--card-2)' }}>
                  {imagePreview ? <img src={imagePreview} alt="Preview" style={{ maxHeight: 120, margin: '0 auto', borderRadius: 8, objectFit: 'cover', display: 'block' }} /> : (
                    <div><div style={{ fontSize: 26, marginBottom: 6 }}>🖼️</div><div style={{ fontFamily: 'var(--font-body)', fontSize: 13, color: 'var(--tx-2)', fontWeight: 500 }}>Click to upload image</div><div style={{ fontFamily: 'var(--font-body)', fontSize: 11, color: 'var(--tx-3)', marginTop: 2 }}>JPG, PNG · max 5MB</div></div>
                  )}
                  <input id="img-upload-v2" type="file" accept="image/*" onChange={handleImageChange} style={{ display: 'none' }} />
                </div>
              </div>
              {uploadProgress > 0 && uploadProgress < 100 && <div style={{ height: 4, background: 'var(--card-3)', borderRadius: 2, overflow: 'hidden', marginBottom: 14 }}><div style={{ height: '100%', borderRadius: 2, background: 'var(--gold)', width: `${uploadProgress}%`, transition: 'width 0.3s' }} /></div>}

              <button type="submit" disabled={submitting} style={{ width: '100%', padding: 13, borderRadius: 10, border: 'none', background: 'var(--accent)', color: 'var(--accent-ink)', fontFamily: 'var(--font-display)', fontSize: 14, fontWeight: 700, cursor: submitting ? 'not-allowed' : 'pointer', opacity: submitting ? 0.6 : 1, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>{submitting ? 'Publishing…' : 'Publish to Menu'}</button>
              <div style={{ textAlign: 'center', fontFamily: 'var(--font-body)', fontSize: 11, color: 'var(--tx-3)', marginTop: 10 }}>Item goes live immediately · AR unlocks after our team adds the 3D model</div>
            </form>
          </div>
        )}

        {/* Filter bar */}
        <div style={{ background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 12, padding: '10px 14px', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          {[{ key: 'all', label: 'All', count: stats.total }, { key: 'pending', label: 'Awaiting AR', count: stats.pending }, { key: 'approved', label: 'AR Active', count: stats.approved }, { key: 'rejected', label: 'Rejected', count: stats.rejected }].map(f => {
            const active = filter === f.key;
            return (
              <button key={f.key} onClick={() => setFilter(f.key)} style={{ padding: '6px 12px', fontFamily: 'var(--font-display)', fontSize: 12, fontWeight: active ? 700 : 600, background: active ? 'var(--accent)' : 'transparent', color: active ? 'var(--accent-ink)' : 'var(--tx-2)', border: 'none', borderRadius: 8, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                {f.label}<span style={{ padding: '1px 6px', borderRadius: 10, background: active ? 'rgba(26,24,21,0.18)' : 'var(--card-3)', color: active ? 'var(--accent-ink)' : 'var(--tx-3)', fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 700 }}>{f.count}</span>
              </button>
            );
          })}
          <span style={{ flex: 1 }} />
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--tx-3)' }}>{filtered.length} shown</span>
        </div>

        {/* List */}
        {loading ? (
          <div style={{ background: 'var(--card)', borderRadius: 16, border: '1px solid var(--line)', padding: 48, textAlign: 'center' }}>
            <div style={{ width: 30, height: 30, border: '3px solid var(--gold)', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto 12px' }} />
            <div style={{ fontFamily: 'var(--font-body)', fontSize: 13, color: 'var(--tx-3)' }}>Loading items…</div>
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '56px 20px', background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 16 }}>
            <div style={{ fontSize: 34, marginBottom: 12 }}>🍽️</div>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 16, fontWeight: 700, color: 'var(--tx)', marginBottom: 6 }}>{stats.total === 0 ? 'No items yet' : 'No items match this filter'}</div>
            <div style={{ fontFamily: 'var(--font-body)', fontSize: 13, color: 'var(--tx-3)', maxWidth: 400, margin: '0 auto 16px', lineHeight: 1.6 }}>{stats.total === 0 ? 'Add your first menu item — name, photo, price. AR models can be added later.' : 'Try a different filter, or add a new item.'}</div>
            {stats.total === 0 && <button onClick={() => setShowForm(true)} style={accentBtn}>+ Add your first item</button>}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {filtered.map(req => {
              const accent = req.status === 'approved' ? 'var(--success)' : req.status === 'rejected' ? 'var(--danger)' : 'var(--gold)';
              return (
                <div key={req.id} style={{ background: 'var(--card)', borderRadius: 14, border: '1px solid var(--line)', borderLeft: `3px solid ${accent}`, padding: '14px 18px', display: 'flex', alignItems: 'flex-start', gap: 14 }}>
                  <div style={{ width: 56, height: 56, borderRadius: 10, overflow: 'hidden', background: 'var(--card-2)', flexShrink: 0, border: '1px solid var(--line)' }}>
                    {req.imageURL ? <img src={req.imageURL} alt={req.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, color: 'var(--tx-3)' }}>🍽️</div>}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 14, color: 'var(--tx)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{req.name}</div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4, flexWrap: 'wrap' }}>
                          {req.category && <span style={{ padding: '2px 8px', borderRadius: 4, background: 'var(--card-3)', color: 'var(--tx-2)', fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 700, letterSpacing: '.04em', textTransform: 'uppercase' }}>{req.category}</span>}
                          {req.price && <span style={{ fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 700, color: 'var(--gold)' }}>₹{req.price}</span>}
                        </div>
                      </div>
                      <StatusBadge status={req.status} />
                    </div>
                    {req.description && <p style={{ fontFamily: 'var(--font-body)', fontSize: 12, color: 'var(--tx-3)', marginTop: 8, marginBottom: 0, lineHeight: 1.5 }}>{req.description}</p>}
                    {req.nutritionalData && Object.values(req.nutritionalData).some(v => v != null) && (
                      <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
                        {Object.entries(req.nutritionalData).map(([k, v]) => v != null && <span key={k} style={{ fontFamily: 'var(--font-body)', fontSize: 10, color: 'var(--tx-3)', background: 'var(--card-3)', borderRadius: 5, padding: '2px 7px', fontWeight: 500 }}>{k.charAt(0).toUpperCase() + k.slice(1)}: <strong style={{ color: 'var(--tx)' }}>{v}</strong>{k === 'calories' ? 'kcal' : 'g'}</span>)}
                      </div>
                    )}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 10, flexWrap: 'wrap', gap: 8 }}>
                      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--tx-3)' }}>Submitted {req.createdAt?.seconds ? new Date(req.createdAt.seconds * 1000).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : 'recently'}</div>
                      {req.status === 'pending' && (confirmCancel === req.id ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span style={{ fontFamily: 'var(--font-body)', fontSize: 11, color: 'var(--tx-3)' }}>Cancel AR request? Item stays on menu.</span>
                          <button onClick={() => handleCancelRequest(req.id)} style={{ padding: '4px 10px', borderRadius: 6, border: 'none', background: 'var(--danger)', color: '#fff', fontFamily: 'var(--font-display)', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>Yes, cancel</button>
                          <button onClick={() => setConfirmCancel(null)} style={{ padding: '4px 10px', borderRadius: 6, border: '1px solid var(--line)', background: 'var(--card)', color: 'var(--tx-2)', fontFamily: 'var(--font-display)', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>Keep</button>
                        </div>
                      ) : (
                        <button onClick={() => setConfirmCancel(req.id)} style={{ padding: '4px 12px', borderRadius: 6, border: '1px solid rgba(217,83,79,0.30)', background: 'rgba(217,83,79,0.08)', color: 'var(--danger)', fontFamily: 'var(--font-display)', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>Cancel AR Request</button>
                      ))}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </OkShell>
    </>
  );
}

RequestsV2.getLayout = (page) => page;
