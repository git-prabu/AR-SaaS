import Head from 'next/head';
import { useEffect, useState, useMemo } from 'react';
import { useAuth } from '../../hooks/useAuth';
import AdminLayout from '../../components/layout/AdminLayout';
import EmptyState from '../../components/EmptyState';
import { getRequests, submitRequestAndPublish, getAllMenuItems, deleteRequest, getRestaurantById } from '../../lib/db';
import { uploadFile, buildImagePath, fileSizeMB } from '../../lib/storage';
import toast from 'react-hot-toast';
import * as XLSX from 'xlsx';

// ═══ Aspire palette — same tokens as analytics/staff/notifications/feedback ═══
const INTER = "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
const A = {
  font: INTER,
  cream: '#EDEDED',
  ink: '#1A1A1A',
  shell: '#FFFFFF',
  shellDarker: '#F8F8F8',
  warning: '#C4A86D',         // gold
  warningDim: '#A08656',
  forest: '#1A1A1A',
  forestDarker: '#2A2A2A',
  forestText: '#EAE7E3',
  forestTextMuted: 'rgba(234,231,227,0.55)',
  forestTextFaint: 'rgba(234,231,227,0.35)',
  forestSubtleBg: 'rgba(255,255,255,0.04)',
  forestBorder: '1px solid rgba(255,255,255,0.06)',
  success: '#3F9E5A',
  successDim: '#2E7E45',
  danger: '#D9534F',
  dangerDim: '#A03A37',
  mutedText: 'rgba(0,0,0,0.55)',
  faintText: 'rgba(0,0,0,0.38)',
  subtleBg: 'rgba(0,0,0,0.04)',
  border: '1px solid rgba(0,0,0,0.06)',
  cardShadow: '0 1px 2px rgba(0,0,0,0.04), 0 4px 12px rgba(0,0,0,0.04)',
};

// ═══ USDA + nutrition helpers (untouched logic from b6fa233) ═══
const USDA_KEY = 'fea6TbAGJ03EOEWPtWzEQ31VclGeRYsNqVhrWQ2A';

const BLANK = {
  name:'', nameTA:'', nameHI:'',
  description:'', descriptionTA:'', descriptionHI:'',
  category:'', price:'',
  ingredients:'',
  calories:'', protein:'', carbs:'', fats:'',
  prepTime:'',
};

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

async function fetchIngredientNutrition(ingredientRaw) {
  const { name, grams: specifiedGrams } = parseIngredient(ingredientRaw);
  const portionGrams = specifiedGrams ?? smartDefault(name);
  try {
    const searchRes = await fetch(
      `https://api.nal.usda.gov/fdc/v1/foods/search?query=${encodeURIComponent(name)}&pageSize=1&api_key=${USDA_KEY}`
    );
    const searchData = await searchRes.json();
    const food = searchData.foods?.[0];
    if (!food) return null;
    const scale = portionGrams / 100;
    const nutrients = { calories: 0, protein: 0, carbs: 0, fats: 0 };
    (food.foodNutrients || []).forEach(n => {
      const name = (n.nutrientName || '').toLowerCase();
      const unit = (n.unitName || '').toLowerCase();
      const val = n.value || 0;
      if (name === 'energy' && unit === 'kcal') nutrients.calories = val;
      if (name.startsWith('energy') && unit === 'kcal' && nutrients.calories === 0) nutrients.calories = val;
      if (name === 'protein') nutrients.protein = val;
      if (name.includes('carbohydrate, by difference')) nutrients.carbs = val;
      if (name === 'total lipid (fat)') nutrients.fats = val;
    });
    return {
      calories: nutrients.calories * scale,
      protein:  nutrients.protein  * scale,
      carbs:    nutrients.carbs    * scale,
      fats:     nutrients.fats     * scale,
      portionGrams,
    };
  } catch { return null; }
}

async function autoTranslate(text, targetLang) {
  if (!text?.trim()) return '';
  try {
    const res = await fetch(`https://api.mymemory.translated.net/get?q=${encodeURIComponent(text.trim())}&langpair=en|${targetLang}`);
    const data = await res.json();
    if (data?.responseStatus === 200 && data?.responseData?.translatedText) {
      const result = data.responseData.translatedText;
      // MyMemory returns UNTRANSLATED text in CAPS when it can't find a translation
      if (result === text.trim().toUpperCase()) return '';
      return result;
    }
    return '';
  } catch { return ''; }
}

// ═══ Status badge for the request list ═══
function StatusBadge({ status }) {
  const map = {
    pending:  { color: A.warning,    bg: 'rgba(196,168,109,0.10)', border: 'rgba(196,168,109,0.30)', label: 'Live · Awaiting AR' },
    approved: { color: A.success,    bg: 'rgba(63,158,90,0.10)',   border: 'rgba(63,158,90,0.30)',   label: 'AR Active' },
    rejected: { color: A.danger,     bg: 'rgba(217,83,79,0.10)',   border: 'rgba(217,83,79,0.30)',   label: 'Rejected' },
  };
  const c = map[status] || map.pending;
  return (
    <span style={{
      padding: '3px 10px', borderRadius: 6,
      background: c.bg, color: c.color,
      border: `1px solid ${c.border}`,
      fontSize: 10, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase',
      whiteSpace: 'nowrap',
    }}>{c.label}</span>
  );
}

export default function AdminRequests() {
  const { userData } = useAuth();
  const rid = userData?.restaurantId;
  const restaurantName = userData?.restaurantName || 'Your Restaurant';

  // ─── Data + load state ─────────────────────────────────────────────
  const [requests, setRequests] = useState([]);
  const [restaurant, setRestaurant] = useState(null);
  const [loading, setLoading] = useState(true);
  const [categories, setCategories] = useState([]);

  // ─── Form state (with sessionStorage draft persistence) ─────────────
  const [showForm, setShowForm] = useState(() => {
    if (typeof window === 'undefined') return false;
    try { return sessionStorage.getItem('ar_req_showForm') === 'true'; } catch { return false; }
  });
  const [form, setForm] = useState(() => {
    if (typeof window === 'undefined') return BLANK;
    try { const s = sessionStorage.getItem('ar_req_form'); return s ? JSON.parse(s) : BLANK; } catch { return BLANK; }
  });
  const [imageFile, setImageFile] = useState(null);
  const [imagePreview, setImagePreview] = useState(() => {
    if (typeof window === 'undefined') return null;
    try { return sessionStorage.getItem('ar_req_imgPreview') || null; } catch { return null; }
  });

  // ─── Action loading flags ──────────────────────────────────────────
  const [submitting, setSubmitting] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [calcLoading, setCalcLoading] = useState(false);
  const [calcDetail, setCalcDetail] = useState('');
  const [translating, setTranslating] = useState(false);
  const [bulkUploading, setBulkUploading] = useState(false);
  const [bulkProgress, setBulkProgress] = useState({ done: 0, total: 0, current: '' });

  // ─── UI state ──────────────────────────────────────────────────────
  const [filter, setFilter] = useState('all');
  const [confirmCancel, setConfirmCancel] = useState(null);
  const [showCatDrop, setShowCatDrop] = useState(false);
  const [newCatInput, setNewCatInput] = useState('');
  const [showTranslations, setShowTranslations] = useState(false);  // collapsible

  // ─── Auto-save form draft to sessionStorage ────────────────────────
  useEffect(() => {
    try { sessionStorage.setItem('ar_req_form', JSON.stringify(form)); } catch {}
  }, [form]);
  useEffect(() => {
    try { sessionStorage.setItem('ar_req_showForm', showForm ? 'true' : 'false'); } catch {}
  }, [showForm]);
  useEffect(() => {
    try {
      if (imagePreview) sessionStorage.setItem('ar_req_imgPreview', imagePreview);
      else sessionStorage.removeItem('ar_req_imgPreview');
    } catch {}
  }, [imagePreview]);

  // ─── Initial load ──────────────────────────────────────────────────
  useEffect(() => {
    if (!rid) return;
    Promise.all([
      getRequests(rid),
      getRestaurantById(rid),
      getAllMenuItems(rid),
    ]).then(([reqs, rest, items]) => {
      setRequests(reqs);
      setRestaurant(rest);
      const cats = [...new Set(items.map(i => i.category).filter(Boolean))].sort();
      setCategories(cats);
      setLoading(false);
    }).catch(err => {
      console.error('requests page load error:', err);
      setLoading(false);
    });
  }, [rid]);

  // ─── Plan-limit derived values ─────────────────────────────────────
  const itemsUsed = restaurant?.itemsUsed || 0;
  const maxItems  = restaurant?.maxItems  || 10;
  const remaining = Math.max(0, maxItems - itemsUsed);
  const atLimit   = itemsUsed >= maxItems;
  const planPct   = maxItems ? Math.min(100, (itemsUsed / maxItems) * 100) : 0;

  // ─── Stats for the header card ─────────────────────────────────────
  const stats = useMemo(() => ({
    pending:  requests.filter(r => r.status === 'pending').length,
    approved: requests.filter(r => r.status === 'approved').length,
    rejected: requests.filter(r => r.status === 'rejected').length,
    total:    requests.length,
  }), [requests]);

  // ─── Handlers ──────────────────────────────────────────────────────
  const handleImageChange = (e) => {
    const f = e.target.files[0];
    if (!f) return;
    if (fileSizeMB(f) > 5) { toast.error('Image must be under 5MB'); return; }
    setImageFile(f);
    setImagePreview(URL.createObjectURL(f));
  };

  const handleAutoCalc = async () => {
    const rawIngredients = form.ingredients.trim();
    if (!rawIngredients) { toast.error('Add ingredients first (comma-separated)'); return; }
    const list = rawIngredients.split(',').map(s => s.trim()).filter(Boolean);
    if (list.length === 0) { toast.error('No valid ingredients found'); return; }
    setCalcLoading(true); setCalcDetail('Starting…');
    let totals = { calories: 0, protein: 0, carbs: 0, fats: 0 };
    let found = 0;
    const missed = [];
    for (const ingredient of list) {
      const { name: ingName } = parseIngredient(ingredient);
      setCalcDetail(`Looking up: ${ingName}`);
      const data = await fetchIngredientNutrition(ingredient);
      if (data && (data.calories || data.protein || data.carbs || data.fats)) {
        totals.calories += data.calories || 0;
        totals.protein  += data.protein  || 0;
        totals.carbs    += data.carbs    || 0;
        totals.fats     += data.fats     || 0;
        found++;
      } else { missed.push(ingName); }
    }
    setCalcLoading(false); setCalcDetail('');
    if (found === 0) { toast.error('Could not find any ingredients. Try simpler names (e.g. "chicken" not "grilled chicken breast")'); return; }
    setForm(f => ({
      ...f,
      calories: Math.round(totals.calories).toString(),
      protein:  Math.round(totals.protein).toString(),
      carbs:    Math.round(totals.carbs).toString(),
      fats:     Math.round(totals.fats).toString(),
    }));
    if (missed.length > 0) {
      toast.success(`Calculated! ${missed.length} ingredient${missed.length > 1 ? 's' : ''} not found: ${missed.join(', ')} — adjust manually`);
    } else {
      toast.success(`Nutrition calculated from ${found} ingredient${found > 1 ? 's' : ''}! Adjust if needed.`);
    }
  };

  const handleAutoTranslate = async () => {
    if (!form.name.trim()) { toast.error('Enter item name first'); return; }
    setTranslating(true);
    try {
      const [nameTA, nameHI, descTA, descHI] = await Promise.all([
        autoTranslate(form.name, 'ta'),
        autoTranslate(form.name, 'hi'),
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
      toast.success('Translations filled! Review and edit if needed.');
    } catch { toast.error('Translation failed — try again'); }
    finally { setTranslating(false); }
  };

  const handleBulkUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    e.target.value = '';

    if (atLimit) {
      toast.error(`Item limit reached (${itemsUsed}/${maxItems}). Upgrade your plan to add more items.`);
      return;
    }

    const reader = new FileReader();
    reader.onload = async (ev) => {
      try {
        const wb = XLSX.read(ev.target.result, { type: 'array' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(ws, { defval: '' });
        if (!rows.length) { toast.error('No data found in the sheet'); return; }
        const sample = rows[0];
        if (!('name' in sample) || !('category' in sample) || !('price' in sample)) {
          toast.error('Sheet must have columns: name, category, price — check the template');
          return;
        }
        const SPICE  = ['None', 'Mild', 'Medium', 'Spicy', 'Very Spicy'];
        const BADGES = ['Best Seller', "Chef's Special", 'Must Try', 'New', 'Limited'];
        const valid  = rows.filter(r => String(r.name || '').trim() && String(r.category || '').trim() && r.price);
        if (!valid.length) { toast.error('No valid rows found — name, category and price are required'); return; }

        if (valid.length > remaining) {
          toast.error(`You can only add ${remaining} more item${remaining !== 1 ? 's' : ''} (${itemsUsed}/${maxItems} used). Remove ${valid.length - remaining} row${valid.length - remaining !== 1 ? 's' : ''} or upgrade your plan.`);
          return;
        }

        setBulkUploading(true);
        setBulkProgress({ done: 0, total: valid.length, current: '' });
        let success = 0, failed = 0;

        for (const row of valid) {
          const name = String(row.name || '').trim();
          setBulkProgress(p => ({ ...p, current: name }));
          try {
            const ingredients = String(row.ingredients || '').split(',').map(s => s.trim()).filter(Boolean);
            const spice = SPICE.includes(String(row.spiceLevel || '').trim()) ? String(row.spiceLevel).trim() : null;
            const badge = BADGES.includes(String(row.badge || '').trim())     ? String(row.badge).trim()      : null;
            const isVeg = String(row.isVeg || '').trim().toLowerCase() === 'yes';

            let cal  = Number(row.calories) || null;
            let prot = Number(row.protein)  || null;
            let carb = Number(row.carbs)    || null;
            let fat  = Number(row.fats)     || null;

            const needsCalc = (!cal || !prot || !carb || !fat) && ingredients.length > 0;
            if (needsCalc) {
              setBulkProgress(p => ({ ...p, current: `${name} — calculating nutrition…` }));
              let totals = { calories: 0, protein: 0, carbs: 0, fats: 0 };
              let found = 0;
              for (const ing of ingredients) {
                const data = await fetchIngredientNutrition(ing);
                if (data && (data.calories || data.protein || data.carbs || data.fats)) {
                  totals.calories += data.calories || 0;
                  totals.protein  += data.protein  || 0;
                  totals.carbs    += data.carbs    || 0;
                  totals.fats     += data.fats     || 0;
                  found++;
                }
              }
              if (found > 0) {
                if (!cal)  cal  = Math.round(totals.calories);
                if (!prot) prot = Math.round(totals.protein);
                if (!carb) carb = Math.round(totals.carbs);
                if (!fat)  fat  = Math.round(totals.fats);
              }
            }

            const imageURL = String(row.imageUrl || row.imageURL || row.image_url || row.Image || '').trim() || null;
            const localRestaurant = { ...restaurant, itemsUsed: (restaurant?.itemsUsed || 0) + success };
            await submitRequestAndPublish(rid, {
              name,
              category:    String(row.category || '').trim(),
              description: String(row.description || '').trim(),
              price:       Number(row.price) || 0,
              ingredients,
              prepTime:    String(row.prepTime || '').trim() || null,
              spiceLevel:  spice,
              isVeg,
              badge,
              imageURL,
              nutritionalData: { calories: cal, protein: prot, carbs: carb, fats: fat },
            }, localRestaurant);
            success++;
          } catch { failed++; }
          setBulkProgress(p => ({ ...p, done: p.done + 1 }));
        }

        setBulkUploading(false);
        setBulkProgress({ done: 0, total: 0, current: '' });
        const [updated, updatedRest] = await Promise.all([getRequests(rid), getRestaurantById(rid)]);
        setRequests(updated);
        setRestaurant(updatedRest);
        if (failed === 0) toast.success(`${success} item${success > 1 ? 's' : ''} submitted and published!`);
        else toast.success(`${success} published, ${failed} failed — check those rows`);
      } catch {
        setBulkUploading(false);
        toast.error('Could not read file — make sure it is a valid .xlsx file');
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const handleCancelRequest = async (reqId) => {
    try {
      await deleteRequest(rid, reqId);
      setRequests(r => r.filter(x => x.id !== reqId));
      toast.success('Request cancelled');
    } catch { toast.error('Failed to cancel request'); }
    setConfirmCancel(null);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!rid || !form.name.trim()) { toast.error('Item name is required'); return; }
    if (!form.category.trim()) { toast.error('Category is required'); return; }
    if (!form.price || Number(form.price) <= 0) { toast.error('Price is required'); return; }
    if (atLimit) {
      toast.error(`Item limit reached (${itemsUsed}/${maxItems}). Upgrade your plan to add more items.`);
      return;
    }
    setSubmitting(true);
    try {
      let imageURL = null;
      if (imageFile) {
        const path = buildImagePath(rid, imageFile.name);
        imageURL = await uploadFile(imageFile, path, setUploadProgress);
      }
      const ingredients = form.ingredients ? form.ingredients.split(',').map(s => s.trim()).filter(Boolean) : [];
      await submitRequestAndPublish(rid, {
        name:        form.name.trim(),
        nameTA:      form.nameTA?.trim() || null,
        nameHI:      form.nameHI?.trim() || null,
        description: form.description.trim(),
        descriptionTA: form.descriptionTA?.trim() || null,
        descriptionHI: form.descriptionHI?.trim() || null,
        category:    form.category.trim(),
        price:       Number(form.price) || 0,
        ingredients,
        prepTime:    form.prepTime.trim() || null,
        nutritionalData: {
          calories: Number(form.calories) || null,
          protein:  Number(form.protein)  || null,
          carbs:    Number(form.carbs)    || null,
          fats:     Number(form.fats)     || null,
        },
        imageURL,
      }, restaurant);
      toast.success('Item published to menu! AR will be added once our team uploads the 3D model.');
      setForm(BLANK); setImageFile(null); setImagePreview(null); setShowForm(false); setShowTranslations(false);
      try {
        sessionStorage.removeItem('ar_req_form');
        sessionStorage.removeItem('ar_req_showForm');
        sessionStorage.removeItem('ar_req_imgPreview');
      } catch {}
      const [updated, updatedRest] = await Promise.all([getRequests(rid), getRestaurantById(rid)]);
      setRequests(updated);
      setRestaurant(updatedRest);
    } catch (err) {
      console.error('Submit error:', err);
      toast.error(err?.code === 'permission-denied' ? 'Permission denied — check Firestore rules' : (err?.message || 'Failed to submit. Try again.'));
    } finally {
      setSubmitting(false);
      setUploadProgress(0);
    }
  };

  // ─── Filtered list for the bottom section ──────────────────────────
  const filtered = filter === 'all' ? requests : requests.filter(r => r.status === filter);

  // ═════════════════════════════════════════════════════════════════════
  // RENDER
  // ═════════════════════════════════════════════════════════════════════
  return (
    <AdminLayout>
      <Head><title>Add Items — Advert Radical</title></Head>
      <div style={{ background: A.cream, minHeight: '100vh', fontFamily: A.font }}>
        <style>{`
          @keyframes spin { to { transform: rotate(360deg); } }
          @keyframes pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.3; } }
          @keyframes fadeUp { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }
          .ar-input { transition: border-color 0.15s, background 0.15s; }
          .ar-input:focus { outline: none; border-color: ${A.warning} !important; background: ${A.shell} !important; box-shadow: 0 0 0 3px rgba(196,168,109,0.10); }
          .ar-input::placeholder { color: ${A.faintText}; }
          .ar-card { transition: box-shadow 0.12s ease; }
          .ar-card:hover { box-shadow: 0 4px 18px rgba(38,52,49,0.06); }
          .ar-filter-pill:hover:not(.active) { background: ${A.subtleBg}; color: ${A.ink}; }
          .ar-action-btn:hover:not(:disabled) { transform: translateY(-1px); }
          .ar-upload-zone:hover { border-color: ${A.warning} !important; background: ${A.shell} !important; }
          .ar-cat-row:hover { background: ${A.shellDarker}; }
        `}</style>

        {/* ═══ HEADER ═══ */}
        <div style={{ padding: '24px 28px 0' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 14, flexWrap: 'wrap', marginBottom: 18 }}>
            <div>
              <div style={{ fontSize: 11, fontWeight: 500, color: A.faintText, marginBottom: 6, letterSpacing: '0.05em', display: 'flex', alignItems: 'center', gap: 6 }}>
                <span>Setup</span>
                <span style={{ opacity: 0.5 }}>›</span>
                <span style={{ color: A.mutedText }}>Add Items</span>
              </div>
              <div style={{ fontWeight: 600, fontSize: 28, color: A.ink, letterSpacing: '-0.5px', lineHeight: 1.1 }}>
                {restaurantName} <span style={{ color: A.mutedText, fontWeight: 500 }}>Menu</span>
              </div>
              <div style={{ fontSize: 12, color: A.mutedText, marginTop: 4 }}>
                Add menu items. They go live immediately. AR unlocks once our team uploads the 3D model.
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {/* Bulk upload */}
              <label className="ar-action-btn" style={{
                padding: '9px 16px', borderRadius: 10,
                background: A.shell, border: A.border, color: A.ink,
                fontSize: 13, fontWeight: 600,
                cursor: bulkUploading || atLimit ? 'not-allowed' : 'pointer',
                opacity: atLimit ? 0.5 : 1,
                display: 'inline-flex', alignItems: 'center', gap: 7,
                fontFamily: A.font, transition: 'all 0.15s',
              }}>
                {bulkUploading ? (
                  <>
                    <span style={{ width: 12, height: 12, border: `2px solid ${A.ink}`, borderTopColor: 'transparent', borderRadius: '50%', display: 'inline-block', animation: 'spin 0.7s linear infinite' }} />
                    Uploading {bulkProgress.done}/{bulkProgress.total}…
                  </>
                ) : (
                  <>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                    Bulk Upload (.xlsx)
                  </>
                )}
                <input type="file" accept=".xlsx,.xls" onChange={handleBulkUpload} style={{ display: 'none' }} disabled={bulkUploading || atLimit} />
              </label>
              {/* Add new toggle */}
              <button onClick={() => {
                if (atLimit) { toast.error(`Item limit reached (${itemsUsed}/${maxItems}). Upgrade your plan.`); return; }
                setShowForm(s => !s);
              }} className="ar-action-btn" style={{
                padding: '9px 18px', borderRadius: 10,
                background: showForm ? A.shell : A.ink,
                color: showForm ? A.ink : A.cream,
                border: showForm ? A.border : 'none',
                fontSize: 13, fontWeight: 700,
                cursor: 'pointer',
                display: 'inline-flex', alignItems: 'center', gap: 6,
                fontFamily: A.font, transition: 'all 0.15s',
              }}>
                {showForm ? '✕  Cancel' : '+  New Item'}
              </button>
            </div>
          </div>

          {/* ═══ MENU ITEMS — matte-black signature stat card ═══ */}
          <div style={{
            background: `linear-gradient(135deg, ${A.forest} 0%, ${A.forestDarker} 100%)`,
            borderRadius: 14, padding: '20px 24px', marginBottom: 14,
            border: A.forestBorder,
            boxShadow: '0 4px 16px rgba(38,52,49,0.15)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
              <div style={{ width: 7, height: 7, borderRadius: '50%', background: A.warning, animation: 'pulse 2s ease infinite', boxShadow: '0 0 8px rgba(196,168,109,0.6)' }} />
              <span style={{ fontSize: 12, fontWeight: 600, letterSpacing: '0.10em', textTransform: 'uppercase', color: A.warning }}>MENU ITEMS</span>
              <div style={{ flex: 1, height: 1, background: 'rgba(234,231,227,0.08)' }} />
              <span style={{ fontSize: 11, color: A.forestTextMuted, fontWeight: 500 }}>
                {itemsUsed} of {maxItems} used
              </span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
              {[
                { label: 'TOTAL',         value: stats.total,    color: A.forestText },
                { label: 'AWAITING AR',   value: stats.pending,  color: stats.pending  > 0 ? A.warning : A.forestText },
                { label: 'AR ACTIVE',     value: stats.approved, color: stats.approved > 0 ? A.success : A.forestText },
                { label: 'PLAN USAGE',    value: `${Math.round(planPct)}%`, color: atLimit ? A.danger : A.forestText, isPlan: true },
              ].map(s => (
                <div key={s.label} style={{
                  padding: '16px 18px', borderRadius: 10,
                  background: A.forestSubtleBg,
                  border: A.forestBorder,
                }}>
                  <div style={{ fontSize: 11, fontWeight: 500, letterSpacing: '0.06em', textTransform: 'uppercase', color: A.forestTextFaint, marginBottom: 8 }}>
                    {s.label}
                  </div>
                  <div style={{ fontWeight: 700, fontSize: 28, lineHeight: 1, letterSpacing: '-0.5px', color: s.color }}>
                    {s.value}
                  </div>
                  {s.isPlan && (
                    <div style={{ marginTop: 8, height: 4, background: 'rgba(234,231,227,0.08)', borderRadius: 2, overflow: 'hidden' }}>
                      <div style={{
                        width: `${planPct}%`, height: '100%',
                        background: atLimit ? A.danger : A.warning,
                        transition: 'width 0.3s',
                      }} />
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* ═══ Plan limit warning pill (only when at limit) ═══ */}
          {atLimit && (
            <div style={{
              background: 'rgba(217,83,79,0.06)', border: '1px solid rgba(217,83,79,0.30)',
              borderRadius: 12, padding: '12px 16px', marginBottom: 14,
              display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
            }}>
              <span style={{ fontSize: 16 }}>⚠</span>
              <span style={{ fontSize: 13, fontWeight: 600, color: A.dangerDim, flex: 1 }}>
                You've reached your plan's item limit ({itemsUsed}/{maxItems}). Upgrade to add more items.
              </span>
            </div>
          )}

          {/* ═══ Bulk upload progress (only while uploading) ═══ */}
          {bulkUploading && (
            <div style={{
              background: A.shell, borderRadius: 12, border: A.border,
              padding: '14px 18px', marginBottom: 14,
              boxShadow: A.cardShadow,
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: A.ink, letterSpacing: '0.04em', textTransform: 'uppercase' }}>
                  Publishing items
                </span>
                <span style={{ fontSize: 11, color: A.mutedText, fontFamily: "'JetBrains Mono', monospace", fontWeight: 700 }}>
                  {bulkProgress.done} / {bulkProgress.total}
                </span>
              </div>
              <div style={{ height: 6, background: A.subtleBg, borderRadius: 3, overflow: 'hidden' }}>
                <div style={{
                  height: '100%', borderRadius: 3,
                  background: `linear-gradient(90deg, ${A.warning}, ${A.warningDim})`,
                  width: `${bulkProgress.total ? (bulkProgress.done / bulkProgress.total) * 100 : 0}%`,
                  transition: 'width 0.25s',
                }} />
              </div>
              {bulkProgress.current && (
                <div style={{ fontSize: 11, color: A.faintText, marginTop: 6, fontStyle: 'italic' }}>
                  Processing: {bulkProgress.current}
                </div>
              )}
            </div>
          )}
        </div>

        {/* ═══ NEW ITEM FORM (collapsible) ═══ */}
        {showForm && (
          <div style={{ padding: '0 28px', marginBottom: 16, animation: 'fadeUp 0.2s ease both' }}>
            <div style={{
              background: A.shell, borderRadius: 14,
              border: A.border, boxShadow: A.cardShadow,
              padding: '22px 26px',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 18 }}>
                <div style={{ width: 7, height: 7, borderRadius: '50%', background: A.warning, boxShadow: '0 0 6px rgba(196,168,109,0.35)' }} />
                <span style={{ fontSize: 12, fontWeight: 600, letterSpacing: '0.10em', textTransform: 'uppercase', color: A.warning }}>NEW MENU ITEM</span>
                <div style={{ flex: 1, height: 1, background: 'rgba(196,168,109,0.20)' }} />
              </div>

              <form onSubmit={handleSubmit}>
                {/* ─── Row 1: Name + Category ─── */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
                  <div>
                    <label style={labelStyle}>Item Name *</label>
                    <input
                      className="ar-input"
                      style={inputStyle}
                      value={form.name}
                      onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                      placeholder="e.g. Butter Chicken"
                      required
                    />
                  </div>
                  <div style={{ position: 'relative' }}>
                    <label style={labelStyle}>Category *</label>
                    <div onClick={() => setShowCatDrop(d => !d)} style={{
                      ...inputStyle, cursor: 'pointer',
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      userSelect: 'none',
                    }}>
                      <span style={{ color: form.category ? A.ink : A.faintText }}>
                        {form.category || 'Select or type new…'}
                      </span>
                      <span style={{ fontSize: 9, color: A.faintText, marginLeft: 8 }}>{showCatDrop ? '▲' : '▼'}</span>
                    </div>
                    {showCatDrop && (
                      <div style={{
                        position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 20,
                        background: A.shell,
                        border: A.border, borderRadius: 10,
                        boxShadow: '0 8px 24px rgba(0,0,0,0.10)',
                        marginTop: 4, overflow: 'hidden',
                      }}>
                        <div style={{ padding: '10px 12px', borderBottom: A.border, display: 'flex', gap: 8 }}>
                          <input
                            autoFocus
                            style={{
                              flex: 1, padding: '7px 10px', fontSize: 13,
                              border: A.border, borderRadius: 7, outline: 'none',
                              fontFamily: A.font, color: A.ink, background: A.shellDarker,
                            }}
                            placeholder="Type new category…"
                            value={newCatInput}
                            onChange={e => setNewCatInput(e.target.value)}
                            onKeyDown={e => {
                              if (e.key === 'Enter' && newCatInput.trim()) {
                                const cat = newCatInput.trim();
                                setForm(f => ({ ...f, category: cat }));
                                if (!categories.includes(cat)) setCategories(c => [...c, cat].sort());
                                setNewCatInput(''); setShowCatDrop(false);
                              }
                            }}
                          />
                          <button type="button" onClick={() => {
                            if (!newCatInput.trim()) return;
                            const cat = newCatInput.trim();
                            setForm(f => ({ ...f, category: cat }));
                            if (!categories.includes(cat)) setCategories(c => [...c, cat].sort());
                            setNewCatInput(''); setShowCatDrop(false);
                          }} style={{
                            padding: '7px 14px', borderRadius: 7,
                            border: 'none', background: A.ink, color: A.cream,
                            fontSize: 12, fontWeight: 700, cursor: 'pointer',
                            fontFamily: A.font, flexShrink: 0,
                          }}>Add</button>
                        </div>
                        <div style={{ maxHeight: 180, overflowY: 'auto' }}>
                          {categories.length === 0 ? (
                            <div style={{ padding: '12px 14px', fontSize: 12, color: A.faintText }}>
                              No categories yet — type above to add one
                            </div>
                          ) : categories.map(cat => (
                            <div key={cat} className="ar-cat-row" onClick={() => {
                              setForm(f => ({ ...f, category: cat }));
                              setShowCatDrop(false); setNewCatInput('');
                            }} style={{
                              padding: '9px 14px', fontSize: 13,
                              color: A.ink, cursor: 'pointer',
                              background: form.category === cat ? 'rgba(196,168,109,0.10)' : 'transparent',
                              fontWeight: form.category === cat ? 700 : 500,
                            }}>
                              {cat} {form.category === cat && <span style={{ color: A.warningDim, marginLeft: 4 }}>✓</span>}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* ─── Row 2: Price + Prep Time ─── */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
                  <div>
                    <label style={labelStyle}>Price (₹) *</label>
                    <div style={{ position: 'relative' }}>
                      <span style={{
                        position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)',
                        fontSize: 14, fontWeight: 700, color: A.mutedText,
                      }}>₹</span>
                      <input
                        className="ar-input"
                        style={{ ...inputStyle, paddingLeft: 30 }}
                        type="number" min="0" step="0.01"
                        value={form.price}
                        onChange={e => setForm(f => ({ ...f, price: e.target.value }))}
                        placeholder="e.g. 280"
                        required
                      />
                    </div>
                  </div>
                  <div>
                    <label style={labelStyle}>Preparation Time</label>
                    <input
                      className="ar-input"
                      style={inputStyle}
                      value={form.prepTime}
                      onChange={e => setForm(f => ({ ...f, prepTime: e.target.value }))}
                      placeholder="e.g. 10–15 minutes"
                    />
                  </div>
                </div>

                {/* ─── Description ─── */}
                <div style={{ marginBottom: 14 }}>
                  <label style={labelStyle}>Description</label>
                  <textarea
                    className="ar-input"
                    style={{ ...inputStyle, resize: 'none', minHeight: 64, paddingTop: 10 }}
                    rows={2}
                    value={form.description}
                    onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                    placeholder="Brief description of the dish…"
                  />
                </div>

                {/* ─── Translations (collapsible) ─── */}
                <div style={{
                  marginBottom: 14, borderRadius: 12,
                  background: A.shellDarker,
                  border: A.border,
                  overflow: 'hidden',
                }}>
                  <div onClick={() => setShowTranslations(s => !s)} style={{
                    padding: '12px 16px',
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    cursor: 'pointer', userSelect: 'none',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 14 }}>🌐</span>
                      <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.10em', textTransform: 'uppercase', color: A.mutedText }}>
                        Translations
                      </span>
                      <span style={{ fontSize: 10, color: A.faintText, fontWeight: 500 }}>(optional · Tamil + Hindi)</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      {showTranslations && (
                        <button type="button" onClick={(e) => { e.stopPropagation(); handleAutoTranslate(); }} disabled={translating} style={{
                          padding: '5px 12px', borderRadius: 7,
                          fontSize: 11, fontWeight: 700, fontFamily: A.font,
                          border: `1px solid ${A.warning}`,
                          background: 'rgba(196,168,109,0.08)', color: A.warningDim,
                          cursor: translating ? 'not-allowed' : 'pointer',
                          opacity: translating ? 0.6 : 1,
                          display: 'inline-flex', alignItems: 'center', gap: 6,
                        }}>
                          {translating ? (
                            <>
                              <span style={{ width: 10, height: 10, border: `2px solid ${A.warningDim}`, borderTopColor: 'transparent', borderRadius: '50%', display: 'inline-block', animation: 'spin 0.7s linear infinite' }} />
                              Translating…
                            </>
                          ) : '✦ Auto Translate'}
                        </button>
                      )}
                      <span style={{ fontSize: 10, color: A.faintText }}>{showTranslations ? '▲' : '▼'}</span>
                    </div>
                  </div>
                  {showTranslations && (
                    <div style={{ padding: '0 16px 16px' }}>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
                        <div>
                          <label style={labelStyle}>Tamil Name (தமிழ்)</label>
                          <input className="ar-input" style={inputStyle} value={form.nameTA} onChange={e => setForm(f => ({ ...f, nameTA: e.target.value }))} placeholder="e.g. பட்டர் சிக்கன்" />
                        </div>
                        <div>
                          <label style={labelStyle}>Hindi Name (हिंदी)</label>
                          <input className="ar-input" style={inputStyle} value={form.nameHI} onChange={e => setForm(f => ({ ...f, nameHI: e.target.value }))} placeholder="e.g. बटर चिकन" />
                        </div>
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                        <div>
                          <label style={labelStyle}>Tamil Description</label>
                          <input className="ar-input" style={inputStyle} value={form.descriptionTA} onChange={e => setForm(f => ({ ...f, descriptionTA: e.target.value }))} placeholder="தமிழ் விளக்கம்…" />
                        </div>
                        <div>
                          <label style={labelStyle}>Hindi Description</label>
                          <input className="ar-input" style={inputStyle} value={form.descriptionHI} onChange={e => setForm(f => ({ ...f, descriptionHI: e.target.value }))} placeholder="हिंदी विवरण…" />
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* ─── Ingredients + Auto Calc ─── */}
                <div style={{ marginBottom: 14 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                    <label style={{ ...labelStyle, marginBottom: 0 }}>Ingredients (comma-separated)</label>
                    <button type="button" onClick={handleAutoCalc} disabled={calcLoading} style={{
                      padding: '5px 12px', borderRadius: 7,
                      fontSize: 11, fontWeight: 700, fontFamily: A.font,
                      border: `1px solid ${A.warning}`,
                      background: 'rgba(196,168,109,0.08)', color: A.warningDim,
                      cursor: calcLoading ? 'not-allowed' : 'pointer',
                      opacity: calcLoading ? 0.6 : 1,
                      display: 'inline-flex', alignItems: 'center', gap: 6,
                    }}>
                      {calcLoading ? (
                        <>
                          <span style={{ width: 10, height: 10, border: `2px solid ${A.warningDim}`, borderTopColor: 'transparent', borderRadius: '50%', display: 'inline-block', animation: 'spin 0.7s linear infinite' }} />
                          Calculating…
                        </>
                      ) : '✦ Auto Calculate'}
                    </button>
                  </div>
                  <input
                    className="ar-input"
                    style={inputStyle}
                    value={form.ingredients}
                    onChange={e => setForm(f => ({ ...f, ingredients: e.target.value }))}
                    placeholder="Chicken, Butter, Cream, Tomato, Spices"
                  />
                  {calcLoading && calcDetail && (
                    <div style={{ fontSize: 11, color: A.warningDim, marginTop: 5, fontStyle: 'italic' }}>{calcDetail}</div>
                  )}
                  <div style={{ fontSize: 11, color: A.faintText, marginTop: 4 }}>
                    For accurate nutrition add weight: <strong>Flour 150g, Garlic 10g, Butter 20g</strong> — or just names for estimates
                  </div>
                </div>

                {/* ─── Nutrition (4-up) ─── */}
                <div style={{ marginBottom: 14 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                    <label style={{ ...labelStyle, marginBottom: 0 }}>Nutrition (per serving)</label>
                    {(form.calories || form.protein || form.carbs || form.fats) && (
                      <span style={{ fontSize: 11, color: A.success, fontWeight: 700 }}>✓ Values filled — edit if needed</span>
                    )}
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
                    {['calories', 'protein', 'carbs', 'fats'].map(n => (
                      <div key={n}>
                        <label style={{ ...labelStyle, fontSize: 10 }}>
                          {n.charAt(0).toUpperCase() + n.slice(1)} {n === 'calories' ? '(kcal)' : '(g)'}
                        </label>
                        <input
                          className="ar-input"
                          style={{
                            ...inputStyle,
                            background: form[n] ? 'rgba(63,158,90,0.06)' : A.shellDarker,
                            borderColor: form[n] ? 'rgba(63,158,90,0.30)' : 'rgba(0,0,0,0.06)',
                          }}
                          type="number" min="0"
                          value={form[n]}
                          onChange={e => setForm(f => ({ ...f, [n]: e.target.value }))}
                          placeholder="0"
                        />
                      </div>
                    ))}
                  </div>
                </div>

                {/* ─── Photo upload ─── */}
                <div style={{ marginBottom: 16 }}>
                  <label style={labelStyle}>Food Photo</label>
                  <div className="ar-upload-zone" onClick={() => document.getElementById('img-upload').click()} style={{
                    border: `2px dashed rgba(0,0,0,0.12)`, borderRadius: 12,
                    padding: 22, textAlign: 'center', cursor: 'pointer',
                    background: A.shellDarker, transition: 'all 0.15s',
                  }}>
                    {imagePreview ? (
                      <img src={imagePreview} alt="Preview" style={{ maxHeight: 120, margin: '0 auto', borderRadius: 8, objectFit: 'cover', display: 'block' }} />
                    ) : (
                      <div>
                        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke={A.faintText} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" style={{ display: 'block', margin: '0 auto 6px' }}>
                          <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
                          <circle cx="8.5" cy="8.5" r="1.5"/>
                          <polyline points="21 15 16 10 5 21"/>
                        </svg>
                        <div style={{ fontSize: 13, color: A.mutedText, fontWeight: 500 }}>Click to upload image</div>
                        <div style={{ fontSize: 11, color: A.faintText, marginTop: 2 }}>JPG, PNG · max 5MB</div>
                      </div>
                    )}
                    <input id="img-upload" type="file" accept="image/*" onChange={handleImageChange} style={{ display: 'none' }} />
                  </div>
                </div>

                {/* ─── Upload progress bar ─── */}
                {uploadProgress > 0 && uploadProgress < 100 && (
                  <div style={{ height: 4, background: A.subtleBg, borderRadius: 2, overflow: 'hidden', marginBottom: 14 }}>
                    <div style={{
                      height: '100%', borderRadius: 2,
                      background: `linear-gradient(90deg, ${A.warning}, ${A.warningDim})`,
                      width: `${uploadProgress}%`, transition: 'width 0.3s',
                    }} />
                  </div>
                )}

                {/* ─── Submit ─── */}
                <button type="submit" disabled={submitting} style={{
                  width: '100%', padding: '13px',
                  borderRadius: 10, border: 'none',
                  background: submitting ? A.mutedText : A.ink,
                  color: A.cream,
                  fontSize: 14, fontWeight: 700,
                  cursor: submitting ? 'not-allowed' : 'pointer',
                  fontFamily: A.font,
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                  transition: 'all 0.15s',
                }}>
                  {submitting ? (
                    <>
                      <span style={{ width: 13, height: 13, border: `2.5px solid ${A.cream}`, borderTopColor: 'transparent', borderRadius: '50%', display: 'inline-block', animation: 'spin 0.7s linear infinite' }} />
                      Publishing…
                    </>
                  ) : 'Publish to Menu'}
                </button>
                <div style={{ textAlign: 'center', fontSize: 11, color: A.faintText, marginTop: 10 }}>
                  Item goes live immediately · AR unlocks after our team adds the 3D model
                </div>
              </form>
            </div>
          </div>
        )}

        {/* ═══ FILTER BAR ═══ */}
        <div style={{ padding: '0 28px', marginBottom: 12 }}>
          <div style={{
            background: A.shell, border: A.border, borderRadius: 12,
            padding: '10px 14px',
            display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap',
            boxShadow: A.cardShadow,
          }}>
            {[
              { key: 'all',      label: 'All',          count: stats.total },
              { key: 'pending',  label: 'Awaiting AR',  count: stats.pending },
              { key: 'approved', label: 'AR Active',    count: stats.approved },
              { key: 'rejected', label: 'Rejected',     count: stats.rejected },
            ].map(f => {
              const active = filter === f.key;
              return (
                <button key={f.key} className={`ar-filter-pill ${active ? 'active' : ''}`}
                  onClick={() => setFilter(f.key)}
                  style={{
                    padding: '6px 12px', fontSize: 12, fontWeight: active ? 700 : 500,
                    background: active ? A.ink : 'transparent',
                    color: active ? A.cream : A.mutedText,
                    border: 'none', borderRadius: 7,
                    cursor: 'pointer', transition: 'all 0.15s',
                    fontFamily: A.font, display: 'inline-flex', alignItems: 'center', gap: 6,
                  }}>
                  {f.label}
                  <span style={{
                    padding: '1px 6px', borderRadius: 10,
                    background: active ? 'rgba(237,237,237,0.18)' : A.subtleBg,
                    color: active ? A.cream : A.faintText,
                    fontSize: 10, fontWeight: 700, fontFamily: "'JetBrains Mono', monospace",
                  }}>{f.count}</span>
                </button>
              );
            })}
            <span style={{ flex: 1 }} />
            <span style={{ fontSize: 11, color: A.faintText, fontWeight: 500 }}>
              {filtered.length} shown
            </span>
          </div>
        </div>

        {/* ═══ REQUEST LIST ═══ */}
        <div style={{ padding: '0 28px 60px' }}>
          {loading ? (
            <div style={{
              background: A.shell, borderRadius: 14, border: A.border, padding: '48px',
              textAlign: 'center', boxShadow: A.cardShadow,
            }}>
              <div style={{ width: 30, height: 30, border: `3px solid ${A.warning}`, borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto 12px' }} />
              <div style={{ fontSize: 13, color: A.mutedText, fontWeight: 600 }}>Loading items…</div>
            </div>
          ) : filtered.length === 0 ? (
            <EmptyState
              title={stats.total === 0 ? 'No items yet' : 'No items match this filter'}
              subtitle={stats.total === 0
                ? 'Add your first menu item — name, photo, price. AR models can be added later from the customer side.'
                : 'Try a different filter, or add a new item.'}
              ctaLabel={stats.total === 0 ? '+ Add your first item' : null}
              onCta={stats.total === 0 ? () => setShowForm(true) : null}
            />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {filtered.map(req => {
                // Left-edge accent — gold for AR Active, warningDim for pending, danger for rejected
                const accent = req.status === 'approved' ? A.success
                  : req.status === 'rejected' ? A.danger
                  : A.warning;
                return (
                  <div key={req.id} className="ar-card" style={{
                    background: A.shell, borderRadius: 12,
                    border: A.border,
                    borderLeft: `3px solid ${accent}`,
                    padding: '14px 18px',
                    boxShadow: A.cardShadow,
                    display: 'flex', alignItems: 'flex-start', gap: 14,
                    animation: 'fadeUp 0.2s ease both',
                  }}>
                    {/* Image / placeholder */}
                    <div style={{
                      width: 56, height: 56, borderRadius: 10,
                      overflow: 'hidden', background: A.shellDarker, flexShrink: 0,
                      border: A.border,
                    }}>
                      {req.imageURL ? (
                        <img src={req.imageURL} alt={req.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      ) : (
                        <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={A.faintText} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M3 11h18M5 11v8a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-8M7 11V7a5 5 0 0 1 10 0v4" />
                          </svg>
                        </div>
                      )}
                    </div>
                    {/* Content */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontWeight: 700, fontSize: 14, color: A.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {req.name}
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4, flexWrap: 'wrap' }}>
                            {req.category && (
                              <span style={{
                                padding: '2px 8px', borderRadius: 4,
                                background: A.subtleBg, color: A.mutedText,
                                fontSize: 10, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase',
                              }}>{req.category}</span>
                            )}
                            {req.price && (
                              <span style={{ fontSize: 13, fontWeight: 700, color: A.warningDim, fontFamily: "'JetBrains Mono', monospace" }}>
                                ₹{req.price}
                              </span>
                            )}
                          </div>
                        </div>
                        <StatusBadge status={req.status} />
                      </div>
                      {req.description && (
                        <p style={{ fontSize: 12, color: A.mutedText, marginTop: 8, marginBottom: 0, lineHeight: 1.5 }}>
                          {req.description}
                        </p>
                      )}
                      {req.nutritionalData && Object.values(req.nutritionalData).some(v => v != null) && (
                        <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
                          {Object.entries(req.nutritionalData).map(([k, v]) => v != null && (
                            <span key={k} style={{
                              fontSize: 10, color: A.mutedText,
                              background: A.shellDarker, borderRadius: 5, padding: '2px 7px',
                              fontWeight: 500,
                            }}>
                              {k.charAt(0).toUpperCase() + k.slice(1)}: <strong style={{ color: A.ink }}>{v}</strong>{k === 'calories' ? 'kcal' : 'g'}
                            </span>
                          ))}
                        </div>
                      )}
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 10, flexWrap: 'wrap', gap: 8 }}>
                        <div style={{ fontSize: 11, color: A.faintText, fontFamily: "'JetBrains Mono', monospace" }}>
                          Submitted {req.createdAt?.seconds ? new Date(req.createdAt.seconds * 1000).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : 'recently'}
                        </div>
                        {req.status === 'pending' && (
                          confirmCancel === req.id ? (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                              <span style={{ fontSize: 11, color: A.mutedText }}>Cancel AR request? Item stays on menu.</span>
                              <button onClick={() => handleCancelRequest(req.id)} style={{
                                padding: '4px 10px', borderRadius: 6, border: 'none',
                                background: A.danger, color: A.shell,
                                fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: A.font,
                              }}>Yes, cancel</button>
                              <button onClick={() => setConfirmCancel(null)} style={{
                                padding: '4px 10px', borderRadius: 6,
                                border: A.border, background: A.shell, color: A.mutedText,
                                fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: A.font,
                              }}>Keep</button>
                            </div>
                          ) : (
                            <button onClick={() => setConfirmCancel(req.id)} style={{
                              padding: '4px 12px', borderRadius: 6,
                              border: `1px solid rgba(217,83,79,0.30)`,
                              background: 'rgba(217,83,79,0.06)', color: A.dangerDim,
                              fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: A.font,
                            }}>
                              Cancel AR Request
                            </button>
                          )
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </AdminLayout>
  );
}

// ═══ Reusable styles for inputs/labels (same look as the rest of the form) ═══
const labelStyle = {
  display: 'block',
  fontSize: 11, fontWeight: 700,
  color: 'rgba(0,0,0,0.55)',
  letterSpacing: '0.05em', textTransform: 'uppercase',
  marginBottom: 6,
};

const inputStyle = {
  width: '100%',
  padding: '10px 13px',
  background: '#F8F8F8',
  border: '1px solid rgba(0,0,0,0.06)',
  borderRadius: 9,
  fontSize: 13,
  color: '#1A1A1A',
  fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
  outline: 'none',
  boxSizing: 'border-box',
};

AdminRequests.getLayout = (page) => page;