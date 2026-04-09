import Head from 'next/head';
import { useEffect, useState } from 'react';
import { useAuth } from '../../hooks/useAuth';
import AdminLayout from '../../components/layout/AdminLayout';
import { getRequests, submitRequestAndPublish, getAllMenuItems, deleteRequest, getRestaurantById } from '../../lib/db';
import { uploadFile, buildImagePath, fileSizeMB } from '../../lib/storage';
import { T, ADMIN_STYLES } from '../../lib/utils';
import toast from 'react-hot-toast';
import * as XLSX from 'xlsx';

const USDA_KEY = 'fea6TbAGJ03EOEWPtWzEQ31VclGeRYsNqVhrWQ2A';

const BLANK = { name:'', nameTA:'', nameHI:'', description:'', descriptionTA:'', descriptionHI:'', category:'', price:'', ingredients:'', calories:'', protein:'', carbs:'', fats:'', prepTime:'' };

const S = {
  page:  { padding:32, maxWidth:960, margin:'0 auto', fontFamily:'Inter,sans-serif' },
  card:  { background:'#FFFFFF', border:'1px solid rgba(38,52,49,0.07)', borderRadius:20, boxShadow:'0 2px 14px rgba(38,52,49,0.06)' },
  h1:    { fontFamily:"'Playfair Display', Georgia, serif", fontWeight:800, fontSize:24, color:'#263431', margin:0, letterSpacing:'-0.3px' },
  sub:   { fontSize:13, color:'rgba(38,52,49,0.45)', marginTop:4 },
  label: { display:'block', fontSize:11, fontWeight:600, color:'rgba(38,52,49,0.5)', letterSpacing:'0.05em', textTransform:'uppercase', marginBottom:6 },
  input: { width:'100%', padding:'11px 14px', background:'#F7F5F2', border:'1.5px solid rgba(38,52,49,0.09)', borderRadius:12, fontSize:14, color:'#263431', fontFamily:'Inter,sans-serif', outline:'none', boxSizing:'border-box', transition:'border-color 0.15s' },
  btn:   { padding:'11px 22px', borderRadius:10, fontSize:14, fontWeight:600, fontFamily:'Outfit, sans-serif', border:'none', cursor:'pointer', transition:'all 0.18s' },
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
      const name  = (n.nutrientName || '').toLowerCase();
      const unit  = (n.unitName    || '').toLowerCase();
      const val   = n.value || 0;
      if (name === 'energy' && unit === 'kcal')                                   nutrients.calories = val;
      if (name.startsWith('energy') && unit === 'kcal' && nutrients.calories===0) nutrients.calories = val;
      if (name === 'protein')                                                      nutrients.protein  = val;
      if (name.includes('carbohydrate, by difference'))                            nutrients.carbs    = val;
      if (name === 'total lipid (fat)')                                            nutrients.fats     = val;
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
      // MyMemory returns UNTRANSLATED TEXT IN CAPS if it fails — detect and skip
      if (result === text.trim().toUpperCase()) return '';
      return result;
    }
    return '';
  } catch { return ''; }
}

export default function AdminRequests() {
  const { userData } = useAuth();
  const [requests, setRequests]           = useState([]);
  const [restaurant, setRestaurant]       = useState(null);
  const [loading, setLoading]             = useState(true);
  const [showForm, setShowForm]           = useState(() => {
    if (typeof window === 'undefined') return false;
    try { return sessionStorage.getItem('ar_req_showForm') === 'true'; } catch { return false; }
  });
  const [form, setForm]                   = useState(() => {
    if (typeof window === 'undefined') return BLANK;
    try { const s = sessionStorage.getItem('ar_req_form'); return s ? JSON.parse(s) : BLANK; } catch { return BLANK; }
  });
  const [imageFile, setImageFile]         = useState(null);
  const [imagePreview, setImagePreview]   = useState(() => {
    if (typeof window === 'undefined') return null;
    try { return sessionStorage.getItem('ar_req_imgPreview') || null; } catch { return null; }
  });
  const [submitting, setSubmitting]       = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [filter, setFilter]               = useState('all');
  const [calcLoading, setCalcLoading]     = useState(false);
  const [translating, setTranslating]     = useState(false);
  const [bulkUploading, setBulkUploading] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(null);
  const [bulkProgress, setBulkProgress]   = useState({ done:0, total:0, current:'' });
  const [calcDetail, setCalcDetail]       = useState('');
  const [categories, setCategories]       = useState([]);
  const [showCatDrop, setShowCatDrop]     = useState(false);
  const [newCatInput, setNewCatInput]     = useState('');
  const rid = userData?.restaurantId;

  // Auto-save form to sessionStorage so data survives navigation / reload
  useEffect(() => {
    try { sessionStorage.setItem('ar_req_form', JSON.stringify(form)); } catch {}
  }, [form]);
  useEffect(() => {
    try { sessionStorage.setItem('ar_req_showForm', showForm ? 'true' : 'false'); } catch {}
  }, [showForm]);
  useEffect(() => {
    try { if (imagePreview) sessionStorage.setItem('ar_req_imgPreview', imagePreview); else sessionStorage.removeItem('ar_req_imgPreview'); } catch {}
  }, [imagePreview]);

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
    });
  }, [rid]);

  // Plan limit helpers
  const itemsUsed = restaurant?.itemsUsed || 0;
  const maxItems  = restaurant?.maxItems  || 10;
  const remaining = Math.max(0, maxItems - itemsUsed);
  const atLimit   = itemsUsed >= maxItems;

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
        const wb   = XLSX.read(ev.target.result, { type: 'array' });
        const ws   = wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(ws, { defval: '' });
        if (!rows.length) { toast.error('No data found in the sheet'); return; }
        const sample = rows[0];
        if (!('name' in sample) || !('category' in sample) || !('price' in sample)) {
          toast.error('Sheet must have columns: name, category, price — check the template');
          return;
        }
        const SPICE  = ['None','Mild','Medium','Spicy','Very Spicy'];
        const BADGES = ['Best Seller',"Chef's Special",'Must Try','New','Limited'];
        const valid  = rows.filter(r => String(r.name||'').trim() && String(r.category||'').trim() && r.price);
        if (!valid.length) { toast.error('No valid rows found — name, category and price are required'); return; }

        // Check how many slots are left
        if (valid.length > remaining) {
          toast.error(`You can only add ${remaining} more item${remaining!==1?'s':''} (${itemsUsed}/${maxItems} used). Remove ${valid.length - remaining} row${valid.length - remaining!==1?'s':''} or upgrade your plan.`);
          return;
        }

        setBulkUploading(true);
        setBulkProgress({ done:0, total:valid.length, current:'' });
        let success = 0, failed = 0;

        for (const row of valid) {
          const name = String(row.name||'').trim();
          setBulkProgress(p => ({ ...p, current: name }));
          try {
            const ingredients = String(row.ingredients||'').split(',').map(s=>s.trim()).filter(Boolean);
            const spice = SPICE.includes(String(row.spiceLevel||'').trim())  ? String(row.spiceLevel).trim()  : null;
            const badge = BADGES.includes(String(row.badge||'').trim())      ? String(row.badge).trim()       : null;
            const isVeg = String(row.isVeg||'').trim().toLowerCase() === 'yes';

            let cal  = Number(row.calories) || null;
            let prot = Number(row.protein)  || null;
            let carb = Number(row.carbs)    || null;
            let fat  = Number(row.fats)     || null;

            const needsCalc = (!cal || !prot || !carb || !fat) && ingredients.length > 0;
            if (needsCalc) {
              setBulkProgress(p => ({ ...p, current: `${name} — calculating nutrition…` }));
              let totals = { calories:0, protein:0, carbs:0, fats:0 };
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
            // Use the current local restaurant snapshot — refetch after bulk done
            const localRestaurant = { ...restaurant, itemsUsed: (restaurant?.itemsUsed || 0) + success };
            await submitRequestAndPublish(rid, {
              name,
              category:    String(row.category||'').trim(),
              description: String(row.description||'').trim(),
              price:       Number(row.price) || 0,
              ingredients,
              prepTime:    String(row.prepTime||'').trim() || null,
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
        setBulkProgress({ done:0, total:0, current:'' });
        // Refresh everything
        const [updated, updatedRest] = await Promise.all([getRequests(rid), getRestaurantById(rid)]);
        setRequests(updated);
        setRestaurant(updatedRest);
        if (failed === 0) toast.success(`${success} item${success>1?'s':''} submitted and published!`);
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
          calories: Number(form.calories)||null,
          protein:  Number(form.protein) ||null,
          carbs:    Number(form.carbs)   ||null,
          fats:     Number(form.fats)    ||null,
        },
        imageURL,
      }, restaurant);
      toast.success('Item published to menu! AR will be added once our team uploads the 3D model.');
      setForm(BLANK); setImageFile(null); setImagePreview(null); setShowForm(false);
      try { sessionStorage.removeItem('ar_req_form'); sessionStorage.removeItem('ar_req_showForm'); sessionStorage.removeItem('ar_req_imgPreview'); } catch {}
      const [updated, updatedRest] = await Promise.all([getRequests(rid), getRestaurantById(rid)]);
      setRequests(updated);
      setRestaurant(updatedRest);
    } catch (err) { console.error('Submit error:', err); toast.error(err?.code === 'permission-denied' ? 'Permission denied — check Firestore rules' : (err?.message || 'Failed to submit. Try again.')); }
    finally { setSubmitting(false); setUploadProgress(0); }
  };

  const filtered = filter === 'all' ? requests : requests.filter(r => r.status === filter);

  return (
    <AdminLayout>
      <Head><title>Menu Items — Advert Radical</title></Head>
      <div style={{ background:'#EAE7E3', minHeight:'100vh' }}>
        <div style={S.page}>
          <style>{`
            @keyframes spin{to{transform:rotate(360deg)}}
            .inp:focus{border-color:rgba(138,74,66,0.5)!important;box-shadow:0 0 0 3px rgba(138,74,66,0.08)}
            .inp::placeholder{color:rgba(38,52,49,0.3)}
            .upload-zone:hover{border-color:rgba(138,74,66,0.4)!important;background:#FFF8F5!important}
            .calc-btn:hover:not(:disabled){background:#8A4A42!important;color:#fff!important;border-color:#8A4A42!important}
          `}</style>

          {/* Header */}
          <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', marginBottom:20, flexWrap:'wrap', gap:12 }}>
            <div>
              <h1 style={S.h1}>Menu Items</h1>
              <p style={S.sub}>Items go live immediately. AR feature unlocks after our team uploads the 3D model.</p>
            </div>
            <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
              <label style={{ ...S.btn, background:T.success, color:T.white, cursor: bulkUploading||atLimit ? 'not-allowed' : 'pointer', display:'flex', alignItems:'center', gap:7, padding:'11px 18px', opacity: atLimit ? 0.5 : 1 }}>
                {bulkUploading
                  ? <><span style={{ width:13, height:13, border:`2px solid ${T.white}`, borderTopColor:'transparent', borderRadius:'50%', display:'inline-block', animation:'spin 0.7s linear infinite' }}/> Uploading {bulkProgress.done}/{bulkProgress.total}…</>
                  : <><span style={{ fontSize:16 }}>📥</span> Bulk Upload</>
                }
                <input type="file" accept=".xlsx,.xls" onChange={handleBulkUpload} style={{ display:'none' }} disabled={bulkUploading || atLimit} />
              </label>
              <button onClick={() => { if (atLimit) { toast.error(`Item limit reached (${itemsUsed}/${maxItems}). Upgrade your plan.`); return; } setShowForm(!showForm); }} style={{ ...S.btn, background: showForm ? '#EAE7E3' : '#263431', color: showForm ? '#263431' : '#EAE7E3', border: showForm ? '1.5px solid rgba(38,52,49,0.12)' : 'none' }}>
                {showForm ? '✕ Cancel' : '+ New Item'}
              </button>
            </div>
          </div>

          {/* Plan usage pill */}
          {restaurant && (
            <div style={{ display:'inline-flex', alignItems:'center', gap:8, background: atLimit ? 'rgba(138,74,66,0.08)' : 'rgba(90,138,106,0.08)', border: `1px solid ${atLimit ? 'rgba(138,74,66,0.25)' : 'rgba(90,138,106,0.25)'}`, borderRadius:30, padding:'6px 14px', marginBottom:20 }}>
              <span style={{ fontSize:12, fontWeight:600, color: atLimit ? '#C04020' : '#3A7A50' }}>
                {atLimit ? '⚠️' : '✓'} {itemsUsed} / {maxItems} items used
              </span>
              {!atLimit && <span style={{ fontSize:11, color:'rgba(38,52,49,0.4)' }}>· {remaining} slot{remaining!==1?'s':''} remaining</span>}
              {atLimit && <span style={{ fontSize:11, color:'#C04020' }}>· Upgrade plan to add more</span>}
            </div>
          )}

          {/* Bulk upload progress */}
          {bulkUploading && (
            <div style={{ background:T.white, borderRadius:T.radiusCard, padding:'16px 20px', marginBottom:16, border:`1px solid ${T.success}33` }}>
              <div style={{ display:'flex', justifyContent:'space-between', marginBottom:8 }}>
                <span style={{ fontSize:13, fontWeight:600, color:'#263431' }}>Publishing items…</span>
                <span style={{ fontSize:12, color:'rgba(38,52,49,0.5)' }}>{bulkProgress.done} / {bulkProgress.total}</span>
              </div>
              <div style={{ height:5, background:'rgba(38,52,49,0.08)', borderRadius:99, overflow:'hidden' }}>
                <div style={{ height:'100%', borderRadius:99, background:'linear-gradient(90deg,#5A8A6A,#7ABB8A)', width:`${bulkProgress.total ? (bulkProgress.done/bulkProgress.total)*100 : 0}%`, transition:'width 0.25s' }} />
              </div>
              {bulkProgress.current && <div style={{ fontSize:11, color:'rgba(38,52,49,0.45)', marginTop:6 }}>Processing: {bulkProgress.current}</div>}
            </div>
          )}

          {/* Form */}
          {showForm && (
            <div style={{ ...S.card, padding:28, marginBottom:24 }}>
              <h2 style={{ fontFamily:"'Playfair Display', Georgia, serif", fontWeight:700, fontSize:17, color:'#263431', marginBottom:22 }}>New Menu Item</h2>
              <form onSubmit={handleSubmit}>
                {/* Row 1: Name + Category */}
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16, marginBottom:16 }}>
                  <div>
                    <label style={S.label}>Item Name *</label>
                    <input className="inp" style={S.input} value={form.name} onChange={e=>setForm(f=>({...f,name:e.target.value}))} placeholder="e.g. Butter Chicken" required />
                  </div>
                  <div style={{ position:'relative' }}>
                    <label style={S.label}>Category</label>
                    <div onClick={() => setShowCatDrop(d => !d)} style={{ ...S.input, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'space-between', userSelect:'none' }}>
                      <span style={{ color: form.category ? '#263431' : 'rgba(38,52,49,0.3)' }}>{form.category || 'Select or type new…'}</span>
                      <span style={{ fontSize:10, color:'rgba(38,52,49,0.4)', marginLeft:8 }}>{showCatDrop ? '▲' : '▼'}</span>
                    </div>
                    {showCatDrop && (
                      <div style={{ position:'absolute', top:'100%', left:0, right:0, zIndex:20, background:'#fff', border:'1.5px solid rgba(38,52,49,0.1)', borderRadius:12, boxShadow:'0 8px 24px rgba(38,52,49,0.12)', marginTop:4, overflow:'hidden' }}>
                        <div style={{ padding:'10px 12px', borderBottom:'1px solid rgba(38,52,49,0.07)', display:'flex', gap:8 }}>
                          <input autoFocus style={{ flex:1, padding:'7px 10px', fontSize:13, border:'1.5px solid rgba(38,52,49,0.12)', borderRadius:8, outline:'none', fontFamily:'Inter,sans-serif', color:'#263431' }} placeholder="Type new category…" value={newCatInput} onChange={e => setNewCatInput(e.target.value)}
                            onKeyDown={e => { if (e.key === 'Enter' && newCatInput.trim()) { const cat = newCatInput.trim(); setForm(f => ({...f, category: cat})); if (!categories.includes(cat)) setCategories(c => [...c, cat].sort()); setNewCatInput(''); setShowCatDrop(false); } }}
                          />
                          <button type="button" onClick={() => { if (!newCatInput.trim()) return; const cat = newCatInput.trim(); setForm(f => ({...f, category: cat})); if (!categories.includes(cat)) setCategories(c => [...c, cat].sort()); setNewCatInput(''); setShowCatDrop(false); }} style={{ padding:'7px 14px', borderRadius:8, border:'none', background:'#263431', color:'#fff', fontSize:12, fontWeight:600, cursor:'pointer', fontFamily:'Inter,sans-serif', flexShrink:0 }}>Add</button>
                        </div>
                        <div style={{ maxHeight:180, overflowY:'auto' }}>
                          {categories.length === 0 && <div style={{ padding:'12px 14px', fontSize:12, color:'rgba(38,52,49,0.4)' }}>No categories yet — type above to add one</div>}
                          {categories.map(cat => (
                            <div key={cat} onClick={() => { setForm(f => ({...f, category: cat})); setShowCatDrop(false); setNewCatInput(''); }} style={{ padding:'10px 14px', fontSize:13, color:'#263431', cursor:'pointer', background: form.category === cat ? '#FFF5F0' : 'transparent', fontWeight: form.category === cat ? 600 : 400 }}
                              onMouseEnter={e => e.currentTarget.style.background='#F7F5F2'}
                              onMouseLeave={e => e.currentTarget.style.background = form.category === cat ? '#FFF5F0' : 'transparent'}
                            >
                              {cat} {form.category === cat && <span style={{ color:'#8A4A42' }}>✓</span>}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Row 2: Price + Prep Time */}
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16, marginBottom:16 }}>
                  <div>
                    <label style={S.label}>Price (₹) *</label>
                    <div style={{ position:'relative' }}>
                      <span style={{ position:'absolute', left:14, top:'50%', transform:'translateY(-50%)', fontSize:14, fontWeight:700, color:'rgba(38,52,49,0.5)' }}>₹</span>
                      <input className="inp" style={{ ...S.input, paddingLeft:30 }} type="number" min="0" step="0.01" value={form.price} onChange={e=>setForm(f=>({...f,price:e.target.value}))} placeholder="e.g. 280" required />
                    </div>
                  </div>
                  <div>
                    <label style={S.label}>Preparation Time</label>
                    <div style={{ position:'relative' }}>
                      <span style={{ position:'absolute', left:14, top:'50%', transform:'translateY(-50%)', fontSize:16 }}>⏱</span>
                      <input className="inp" style={{ ...S.input, paddingLeft:40 }} value={form.prepTime} onChange={e=>setForm(f=>({...f,prepTime:e.target.value}))} placeholder="e.g. 10–15 minutes" />
                    </div>
                  </div>
                </div>

                {/* Description */}
                <div style={{ marginBottom:16 }}>
                  <label style={S.label}>Description</label>
                  <textarea className="inp" style={{ ...S.input, resize:'none' }} rows={2} value={form.description} onChange={e=>setForm(f=>({...f,description:e.target.value}))} placeholder="Brief description of the dish…" />
                </div>

                {/* Multi-language translations (optional) */}
                <div style={{ marginBottom:16, padding:'16px 18px', borderRadius:14, background:'rgba(74,128,192,0.04)', border:'1px solid rgba(74,128,192,0.12)' }}>
                  <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:14 }}>
                    <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                      <span style={{ fontSize:15 }}>🌐</span>
                      <span style={{ fontSize:12, fontWeight:700, color:'rgba(38,52,49,0.55)', letterSpacing:'0.04em' }}>TRANSLATIONS (Optional)</span>
                    </div>
                    <button type="button" onClick={async () => {
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
                    }} disabled={translating} style={{ padding:'5px 14px', borderRadius:8, fontSize:12, fontWeight:600, fontFamily:'Inter,sans-serif', border:'1.5px solid rgba(74,128,192,0.4)', background:'rgba(74,128,192,0.06)', color:'#4A80C0', cursor: translating ? 'not-allowed' : 'pointer', opacity: translating ? 0.7 : 1, transition:'all 0.15s', display:'flex', alignItems:'center', gap:6, flexShrink:0 }}>
                      {translating ? <><span style={{ width:11, height:11, border:'2px solid #4A80C0', borderTopColor:'transparent', borderRadius:'50%', display:'inline-block', animation:'spin 0.7s linear infinite' }}/> Translating…</> : '✦ Auto Translate'}
                    </button>
                  </div>
                  <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginBottom:12 }}>
                    <div>
                      <label style={S.label}>Tamil Name (தமிழ்)</label>
                      <input className="inp" style={S.input} value={form.nameTA} onChange={e=>setForm(f=>({...f,nameTA:e.target.value}))} placeholder="e.g. பட்டர் சிக்கன்" />
                    </div>
                    <div>
                      <label style={S.label}>Hindi Name (हिंदी)</label>
                      <input className="inp" style={S.input} value={form.nameHI} onChange={e=>setForm(f=>({...f,nameHI:e.target.value}))} placeholder="e.g. बटर चिकन" />
                    </div>
                  </div>
                  <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
                    <div>
                      <label style={S.label}>Tamil Description</label>
                      <input className="inp" style={S.input} value={form.descriptionTA} onChange={e=>setForm(f=>({...f,descriptionTA:e.target.value}))} placeholder="தமிழ் விளக்கம்…" />
                    </div>
                    <div>
                      <label style={S.label}>Hindi Description</label>
                      <input className="inp" style={S.input} value={form.descriptionHI} onChange={e=>setForm(f=>({...f,descriptionHI:e.target.value}))} placeholder="हिंदी विवरण…" />
                    </div>
                  </div>
                </div>

                {/* Ingredients + Auto Calc */}
                <div style={{ marginBottom:16 }}>
                  <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:6 }}>
                    <label style={{ ...S.label, marginBottom:0 }}>Ingredients (comma-separated)</label>
                    <button type="button" className="calc-btn" onClick={handleAutoCalc} disabled={calcLoading} style={{ padding:'5px 14px', borderRadius:8, fontSize:12, fontWeight:600, fontFamily:'Inter,sans-serif', border:'1.5px solid rgba(138,74,66,0.4)', background:'#FFF5F2', color:'#8A4A42', cursor: calcLoading ? 'not-allowed' : 'pointer', opacity: calcLoading ? 0.7 : 1, transition:'all 0.15s', display:'flex', alignItems:'center', gap:6, flexShrink:0 }}>
                      {calcLoading ? <><span style={{ width:11, height:11, border:'2px solid #8A4A42', borderTopColor:'transparent', borderRadius:'50%', display:'inline-block', animation:'spin 0.7s linear infinite' }}/> Calculating…</> : '✦ Auto Calculate'}
                    </button>
                  </div>
                  <input className="inp" style={S.input} value={form.ingredients} onChange={e=>setForm(f=>({...f,ingredients:e.target.value}))} placeholder="Chicken, Butter, Cream, Tomato, Spices" />
                  {calcLoading && calcDetail && <div style={{ fontSize:11, color:'rgba(138,74,66,0.7)', marginTop:5, fontStyle:'italic' }}>{calcDetail}</div>}
                  <div style={{ fontSize:11, color:'rgba(38,52,49,0.4)', marginTop:4 }}>
                    For accurate nutrition add weight: <strong>Flour 150g, Garlic 10g, Butter 20g</strong> — or just names for estimates
                  </div>
                </div>

                {/* Nutrition */}
                <div style={{ marginBottom:16 }}>
                  <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:10 }}>
                    <label style={{ ...S.label, marginBottom:0 }}>Nutrition (per serving)</label>
                    {(form.calories || form.protein || form.carbs || form.fats) && (
                      <span style={{ fontSize:11, color:'#4A7A5E', fontWeight:600 }}>✓ Values filled — edit if needed</span>
                    )}
                  </div>
                  <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:12 }}>
                    {['calories','protein','carbs','fats'].map(n => (
                      <div key={n}>
                        <label style={S.label}>{n.charAt(0).toUpperCase()+n.slice(1)}</label>
                        <input className="inp" style={{ ...S.input, background: form[n] ? '#F0FBF5' : '#F7F5F2', borderColor: form[n] ? 'rgba(74,122,94,0.4)' : undefined }} type="number" min="0" value={form[n]} onChange={e=>setForm(f=>({...f,[n]:e.target.value}))} placeholder="0" />
                      </div>
                    ))}
                  </div>
                </div>

                {/* Photo */}
                <div style={{ marginBottom:20 }}>
                  <label style={S.label}>Food Photo</label>
                  <div className="upload-zone" onClick={()=>document.getElementById('img-upload').click()} style={{ border:'2px dashed rgba(38,52,49,0.15)', borderRadius:14, padding:24, textAlign:'center', cursor:'pointer', background:'#F7F5F2', transition:'all 0.15s' }}>
                    {imagePreview
                      ? <img src={imagePreview} alt="Preview" style={{ maxHeight:120, margin:'0 auto', borderRadius:10, objectFit:'cover', display:'block' }} />
                      : <div><div style={{ fontSize:28, marginBottom:8 }}>📷</div><div style={{ fontSize:13, color:'rgba(38,52,49,0.4)' }}>Click to upload image (max 5MB)</div></div>
                    }
                    <input id="img-upload" type="file" accept="image/*" onChange={handleImageChange} style={{ display:'none' }} />
                  </div>
                </div>
                {uploadProgress > 0 && uploadProgress < 100 && (
                  <div style={{ height:4, background:'rgba(38,52,49,0.08)', borderRadius:99, overflow:'hidden', marginBottom:16 }}>
                    <div style={{ height:'100%', borderRadius:99, background:'linear-gradient(90deg,#8A4A42,#F07050)', width:`${uploadProgress}%`, transition:'width 0.3s' }} />
                  </div>
                )}
                <button type="submit" disabled={submitting} style={{ ...S.btn, background:'#263431', color:'#EAE7E3', width:'100%', padding:'13px', borderRadius:10, opacity:submitting?0.6:1 }}>
                  {submitting ? 'Publishing…' : '🚀 Publish to Menu'}
                </button>
                <p style={{ textAlign:'center', fontSize:11, color:'rgba(38,52,49,0.4)', marginTop:10 }}>Item goes live immediately · AR unlocks after our team adds the 3D model</p>
              </form>
            </div>
          )}

          {/* Filter tabs */}
          <div style={{ display:'flex', gap:6, marginBottom:20 }}>
            {['all','pending','approved','rejected'].map(s => (
              <button key={s} onClick={()=>setFilter(s)} style={{ padding:'7px 16px', borderRadius:30, border:'none', fontSize:12, fontWeight:600, cursor:'pointer', fontFamily:'Inter,sans-serif', textTransform:'capitalize', background: filter===s?'#263431':'#fff', color: filter===s?'#EAE7E3':'rgba(38,52,49,0.55)', boxShadow: filter===s?'0 2px 8px rgba(28,40,37,0.18)':'0 1px 4px rgba(38,52,49,0.06)', transition:'all 0.15s' }}>
                {s==='pending' ? 'Awaiting AR' : s==='approved' ? 'AR Active' : s.charAt(0).toUpperCase()+s.slice(1)} ({s==='all'?requests.length:requests.filter(r=>r.status===s).length})
              </button>
            ))}
          </div>

          {/* Request list */}
          {loading ? (
            <div style={{ display:'flex', justifyContent:'center', paddingTop:60 }}>
              <div style={{ width:32, height:32, border:'3px solid #8A4A42', borderTopColor:'transparent', borderRadius:'50%', animation:'spin 0.8s linear infinite' }} />
            </div>
          ) : filtered.length === 0 ? (
            <div style={{ textAlign:'center', padding:'60px 0', color:'rgba(38,52,49,0.4)' }}>
              <div style={{ fontSize:40, marginBottom:12 }}>📭</div>
              <p style={{ fontSize:14 }}>No items yet. Add your first menu item above!</p>
            </div>
          ) : (
            <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
              {filtered.map(req => (
                <div key={req.id} style={{ ...S.card, padding:18, display:'flex', alignItems:'flex-start', gap:16 }}>
                  <div style={{ width:56, height:56, borderRadius:T.radiusCard, overflow:'hidden', background:T.cream, flexShrink:0 }}>
                    {req.imageURL ? <img src={req.imageURL} alt={req.name} style={{ width:'100%', height:'100%', objectFit:'cover' }} /> : <div style={{ width:'100%', height:'100%', display:'flex', alignItems:'center', justifyContent:'center', fontSize:22 }}>🍽️</div>}
                  </div>
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', gap:8 }}>
                      <div>
                        <div style={{ fontWeight:600, fontSize:14, color:'#263431' }}>{req.name}</div>
                        <div style={{ fontSize:12, color:'rgba(38,52,49,0.45)', marginTop:2 }}>
                          {req.category && <span>{req.category}</span>}
                          {req.price  && <span style={{ marginLeft:8, fontWeight:600, color:'#8A4A42' }}>₹{req.price}</span>}
                        </div>
                      </div>
                      <StatusBadge status={req.status} />
                    </div>
                    {req.description && <p style={{ fontSize:12, color:'rgba(38,52,49,0.5)', marginTop:6, lineHeight:1.5 }}>{req.description}</p>}
                    {req.nutritionalData && Object.values(req.nutritionalData).some(v => v != null) && (
                      <div style={{ display:'flex', gap:10, marginTop:8, flexWrap:'wrap' }}>
                        {Object.entries(req.nutritionalData).map(([k,v]) => v != null && (
                          <span key={k} style={{ fontSize:11, color:'rgba(38,52,49,0.5)', background:'#F7F5F2', borderRadius:6, padding:'2px 8px' }}>
                            {k.charAt(0).toUpperCase()+k.slice(1)}: <strong>{v}</strong>{k==='calories'?'kcal':'g'}
                          </span>
                        ))}
                      </div>
                    )}
                    <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginTop:8, flexWrap:'wrap', gap:8 }}>
                      <div style={{ fontSize:11, color:'rgba(38,52,49,0.35)' }}>
                        Submitted {req.createdAt?.seconds ? new Date(req.createdAt.seconds*1000).toLocaleDateString() : 'recently'}
                      </div>
                      {req.status === 'pending' && (
                        confirmCancel === req.id ? (
                          <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                            <span style={{ fontSize:12, color:'rgba(38,52,49,0.6)' }}>Cancel AR request? Item stays on menu.</span>
                            <button onClick={() => handleCancelRequest(req.id)} style={{ padding:'5px 14px', borderRadius:10, border:'none', background:'#8A4A42', color:'#EAE7E3', fontSize:12, fontWeight:600, cursor:'pointer', transition:'all 0.15s' }}>Yes, cancel</button>
                            <button onClick={() => setConfirmCancel(null)} style={{ padding:'5px 14px', borderRadius:10, border:'1.5px solid rgba(38,52,49,0.15)', background:'transparent', color:'rgba(38,52,49,0.6)', fontSize:12, fontWeight:600, cursor:'pointer', transition:'all 0.15s' }}>Keep</button>
                          </div>
                        ) : (
                          <button onClick={() => setConfirmCancel(req.id)} style={{ padding:'5px 14px', borderRadius:10, border:'1.5px solid rgba(138,74,66,0.3)', background:'rgba(138,74,66,0.06)', color:'#8A4A42', fontSize:12, fontWeight:600, cursor:'pointer', transition:'all 0.15s' }}>
                            Cancel AR Request
                          </button>
                        )
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </AdminLayout>
  );
}
AdminRequests.getLayout = (page) => page;

function StatusBadge({ status }) {
  const map = {
    pending:  { bg:'#F4D070', color:'#8B6020', label:'Live · Awaiting AR' },
    approved: { bg:'#7AAA8E', color:'#1A5A38', label:'AR Active' },
    rejected: { bg:'#F4A0B0', color:'#8B1A2A', label:'Rejected' },
  };
  const { bg, color, label } = map[status] || map.pending;
  return (
    <span style={{ padding:'4px 14px', borderRadius:20, fontSize:11, fontWeight:700, background:bg+'22', color, border:`1px solid ${bg}44`, flexShrink:0, whiteSpace:'nowrap', letterSpacing:'0.02em' }}>
      {label}
    </span>
  );
}
