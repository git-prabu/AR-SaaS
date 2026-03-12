import Head from 'next/head';
import { useEffect, useState } from 'react';
import { useAuth } from '../../hooks/useAuth';
import AdminLayout from '../../components/layout/AdminLayout';
import { getRequests, submitRequest, getAllMenuItems, deleteRequest } from '../../lib/db';
import { uploadFile, buildImagePath, fileSizeMB } from '../../lib/storage';
import toast from 'react-hot-toast';
import * as XLSX from 'xlsx';

const USDA_KEY = 'fea6TbAGJ03EOEWPtWzEQ31VclGeRYsNqVhrWQ2A';

const BLANK = { name:'', description:'', category:'', ingredients:'', calories:'', protein:'', carbs:'', fats:'', prepTime:'' };

const S = {
  page:  { padding:32, maxWidth:960, margin:'0 auto', fontFamily:'Inter,sans-serif' },
  card:  { background:'#FFFFFF', border:'1px solid rgba(42,31,16,0.07)', borderRadius:20, boxShadow:'0 2px 14px rgba(42,31,16,0.06)' },
  h1:    { fontFamily:'Poppins,sans-serif', fontWeight:800, fontSize:22, color:'#1E1B18', margin:0 },
  sub:   { fontSize:13, color:'rgba(42,31,16,0.45)', marginTop:4 },
  label: { display:'block', fontSize:11, fontWeight:600, color:'rgba(42,31,16,0.5)', letterSpacing:'0.05em', textTransform:'uppercase', marginBottom:6 },
  input: { width:'100%', padding:'11px 14px', background:'#F7F5F2', border:'1.5px solid rgba(42,31,16,0.09)', borderRadius:12, fontSize:14, color:'#1E1B18', fontFamily:'Inter,sans-serif', outline:'none', boxSizing:'border-box', transition:'border-color 0.15s' },
  btn:   { padding:'11px 22px', borderRadius:12, fontSize:14, fontWeight:600, fontFamily:'Poppins,sans-serif', border:'none', cursor:'pointer', transition:'all 0.18s' },
};

// Parse ingredient string — extract name and optional grams
// Supports: "Flour 150g", "150g Flour", "Flour" (fallback to smart default)
function parseIngredient(raw) {
  const gramsMatch = raw.match(/(\d+(?:\.\d+)?)\s*g/i);
  const grams = gramsMatch ? parseFloat(gramsMatch[1]) : null;
  const name = raw.replace(/\d+(?:\.\d+)?\s*g/i, '').replace(/\s+/g, ' ').trim();
  return { name, grams };
}

// Smart default weight per ingredient type when no grams given (in grams)
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
  return 60; // generic fallback
}

// Fetch nutrition for a single ingredient from USDA FoodData Central
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

    // USDA values are per 100g — scale to actual portion
    const scale = portionGrams / 100;
    const nutrients = { calories: 0, protein: 0, carbs: 0, fats: 0 };

    (food.foodNutrients || []).forEach(n => {
      const name  = (n.nutrientName || '').toLowerCase();
      const unit  = (n.unitName    || '').toLowerCase();
      const val   = n.value || 0;
      // Energy: nutrientName = "Energy", unitName = "KCAL" (not in the name itself)
      if (name === 'energy' && unit === 'kcal')          nutrients.calories = val;
      // Some entries use "Energy (Atwater General Factors)" etc
      if (name.startsWith('energy') && unit === 'kcal' && nutrients.calories === 0) nutrients.calories = val;
      if (name === 'protein')                             nutrients.protein  = val;
      if (name.includes('carbohydrate, by difference'))   nutrients.carbs    = val;
      if (name === 'total lipid (fat)')                   nutrients.fats     = val;
    });

    return {
      calories: nutrients.calories * scale,
      protein:  nutrients.protein  * scale,
      carbs:    nutrients.carbs    * scale,
      fats:     nutrients.fats     * scale,
      portionGrams,
    };
  } catch {
    return null;
  }
}

export default function AdminRequests() {
  const { userData } = useAuth();
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(BLANK);
  const [imageFile, setImageFile] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [filter, setFilter] = useState('all');
  const [calcLoading, setCalcLoading] = useState(false);
  const [bulkUploading, setBulkUploading] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(null); // request id to cancel
  const [bulkProgress, setBulkProgress] = useState({ done:0, total:0, current:'' });
  const [calcDetail, setCalcDetail] = useState('');
  const [categories, setCategories] = useState([]);
  const [showCatDrop, setShowCatDrop] = useState(false);
  const [newCatInput, setNewCatInput] = useState('');
  const rid = userData?.restaurantId;

  useEffect(() => {
    if (!rid) return;
    getRequests(rid).then(r => { setRequests(r); setLoading(false); });
    // Load existing categories from approved menu items
    getAllMenuItems(rid).then(items => {
      const cats = [...new Set(items.map(i => i.category).filter(Boolean))].sort();
      setCategories(cats);
    });
  }, [rid]);

  const handleImageChange = (e) => {
    const f = e.target.files[0];
    if (!f) return;
    if (fileSizeMB(f) > 5) { toast.error('Image must be under 5MB'); return; }
    setImageFile(f);
    setImagePreview(URL.createObjectURL(f));
  };

  // Auto-calculate nutrition from USDA FoodData Central
  const handleAutoCalc = async () => {
    const rawIngredients = form.ingredients.trim();
    if (!rawIngredients) {
      toast.error('Add ingredients first (comma-separated)');
      return;
    }
    const list = rawIngredients.split(',').map(s => s.trim()).filter(Boolean);
    if (list.length === 0) {
      toast.error('No valid ingredients found');
      return;
    }

    setCalcLoading(true);
    setCalcDetail('Starting…');

    let totals = { calories: 0, protein: 0, carbs: 0, fats: 0 };
    let found = 0;
    const missed = [];

    for (const ingredient of list) {
      const { name: ingName } = parseIngredient(ingredient);
      setCalcDetail(`Looking up: ${ingName}`);
      const data = await fetchIngredientNutrition(ingredient);
      if (data && (data.calories || data.protein || data.carbs || data.fats)) {
        // Scaling is already handled inside fetchIngredientNutrition based on grams
        totals.calories += data.calories || 0;
        totals.protein  += data.protein  || 0;
        totals.carbs    += data.carbs    || 0;
        totals.fats     += data.fats     || 0;
        found++;
      } else {
        missed.push(ingName);
      }
    }

    setCalcLoading(false);
    setCalcDetail('');

    if (found === 0) {
      toast.error('Could not find any ingredients. Try simpler names (e.g. "chicken" not "grilled chicken breast")');
      return;
    }

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


  // ── Bulk upload from Excel ──
  const handleBulkUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    e.target.value = '';

    const reader = new FileReader();
    reader.onload = async (ev) => {
      try {
        const wb   = XLSX.read(ev.target.result, { type: 'array' });
        const ws   = wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(ws, { defval: '' });

        if (!rows.length) { toast.error('No data found in the sheet'); return; }

        // Validate required columns
        const sample = rows[0];
        if (!('name' in sample) || !('category' in sample) || !('price' in sample)) {
          toast.error('Sheet must have columns: name, category, price — check the template');
          return;
        }

        const SPICE = ['None','Mild','Medium','Spicy','Very Spicy'];
        const BADGES = ['Best Seller',"Chef's Special",'Must Try','New','Limited'];

        // Filter valid rows
        const valid = rows.filter(r => String(r.name||'').trim() && String(r.category||'').trim() && r.price);
        if (!valid.length) { toast.error('No valid rows found — name, category and price are required'); return; }

        setBulkUploading(true);
        setBulkProgress({ done:0, total:valid.length, current:'' });

        let success = 0, failed = 0;
        for (const row of valid) {
          const name = String(row.name||'').trim();
          setBulkProgress(p => ({ ...p, current: name }));
          try {
            const ingredients = String(row.ingredients||'').split(',').map(s=>s.trim()).filter(Boolean);
            const spice = SPICE.includes(String(row.spiceLevel||'').trim()) ? String(row.spiceLevel).trim() : null;
            const badge = BADGES.includes(String(row.badge||'').trim()) ? String(row.badge).trim() : null;
            const isVeg = String(row.isVeg||'').trim().toLowerCase() === 'yes';

            // Auto-calculate missing nutrition from ingredients
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
            await submitRequest(rid, {
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
            });
            success++;
          } catch { failed++; }
          setBulkProgress(p => ({ ...p, done: p.done + 1 }));
        }

        setBulkUploading(false);
        setBulkProgress({ done:0, total:0, current:'' });
        const updated = await getRequests(rid);
        setRequests(updated);
        if (failed === 0) toast.success(`${success} item${success>1?'s':''} submitted successfully!`);
        else toast.success(`${success} submitted, ${failed} failed — check those rows`);
      } catch (err) {
        setBulkUploading(false);
        toast.error('Could not read file — make sure it is a valid .xlsx file');
      }
    };
    reader.readAsArrayBuffer(file);
  };

  // Cancel (delete) a pending request
  const handleCancelRequest = async (reqId) => {
    try {
      await deleteRequest(rid, reqId);
      setRequests(r => r.filter(x => x.id !== reqId));
      toast.success('Request cancelled');
    } catch {
      toast.error('Failed to cancel request');
    }
    setConfirmCancel(null);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!rid || !form.name.trim()) { toast.error('Item name is required'); return; }
    setSubmitting(true);
    try {
      let imageURL = null;
      if (imageFile) {
        const path = buildImagePath(rid, imageFile.name);
        imageURL = await uploadFile(imageFile, path, setUploadProgress);
      }
      const ingredients = form.ingredients ? form.ingredients.split(',').map(s => s.trim()).filter(Boolean) : [];
      await submitRequest(rid, {
        name: form.name.trim(), description: form.description.trim(), category: form.category.trim(), ingredients,
        prepTime: form.prepTime.trim() || null,
        nutritionalData: { calories: Number(form.calories)||null, protein: Number(form.protein)||null, carbs: Number(form.carbs)||null, fats: Number(form.fats)||null },
        imageURL,
      });
      toast.success("Request submitted! We'll review it shortly.");
      setForm(BLANK); setImageFile(null); setImagePreview(null); setShowForm(false);
      const updated = await getRequests(rid);
      setRequests(updated);
    } catch { toast.error('Failed to submit request. Try again.'); }
    finally { setSubmitting(false); setUploadProgress(0); }
  };

  const filtered = filter === 'all' ? requests : requests.filter(r => r.status === filter);

  return (
    <AdminLayout>
      <Head><title>Menu Requests — Advert Radical</title></Head>
      <div style={{ background:'#F2F0EC', minHeight:'100vh' }}>
        <div style={S.page}>
          <style>{`
            @keyframes spin{to{transform:rotate(360deg)}}
            .inp:focus{border-color:rgba(224,90,58,0.5)!important;box-shadow:0 0 0 3px rgba(224,90,58,0.08)}
            .inp::placeholder{color:rgba(42,31,16,0.3)}
            .upload-zone:hover{border-color:rgba(224,90,58,0.4)!important;background:#FFF8F5!important}
            .calc-btn:hover:not(:disabled){background:#E05A3A!important;color:#fff!important;border-color:#E05A3A!important}
          `}</style>

          {/* Header */}
          <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', marginBottom:28, flexWrap:'wrap', gap:12 }}>
            <div>
              <h1 style={S.h1}>Menu Requests</h1>
              <p style={S.sub}>Submit dishes for AR listing. Our team 3D-scans and publishes them.</p>
            </div>
            <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
              {/* Bulk Upload */}
              <label style={{ ...S.btn, background:'#5A8A6A', color:'#fff', cursor:'pointer', display:'flex', alignItems:'center', gap:7, padding:'11px 18px' }}>
                {bulkUploading
                  ? <><span style={{ width:13, height:13, border:'2px solid #fff', borderTopColor:'transparent', borderRadius:'50%', display:'inline-block', animation:'spin 0.7s linear infinite' }}/> Uploading {bulkProgress.done}/{bulkProgress.total}…</>
                  : <><span style={{ fontSize:16 }}>📥</span> Bulk Upload</>
                }
                <input type="file" accept=".xlsx,.xls" onChange={handleBulkUpload} style={{ display:'none' }} disabled={bulkUploading} />
              </label>
              <button onClick={() => setShowForm(!showForm)} style={{ ...S.btn, background: showForm ? '#F2F0EC' : '#1E1B18', color: showForm ? '#1E1B18' : '#FFF5E8', border: showForm ? '1.5px solid rgba(42,31,16,0.12)' : 'none' }}>
                {showForm ? '✕ Cancel' : '+ New Request'}
              </button>
            </div>
          </div>

          {/* Bulk upload progress */}
          {bulkUploading && (
            <div style={{ background:'#fff', borderRadius:14, padding:'16px 20px', marginBottom:16, border:'1px solid rgba(90,138,106,0.2)' }}>
              <div style={{ display:'flex', justifyContent:'space-between', marginBottom:8 }}>
                <span style={{ fontSize:13, fontWeight:600, color:'#1E1B18' }}>Uploading items…</span>
                <span style={{ fontSize:12, color:'rgba(42,31,16,0.5)' }}>{bulkProgress.done} / {bulkProgress.total}</span>
              </div>
              <div style={{ height:5, background:'rgba(42,31,16,0.08)', borderRadius:99, overflow:'hidden' }}>
                <div style={{ height:'100%', borderRadius:99, background:'linear-gradient(90deg,#5A8A6A,#7ABB8A)', width:`${bulkProgress.total ? (bulkProgress.done/bulkProgress.total)*100 : 0}%`, transition:'width 0.25s' }} />
              </div>
              {bulkProgress.current && <div style={{ fontSize:11, color:'rgba(42,31,16,0.45)', marginTop:6 }}>Adding: {bulkProgress.current}</div>}
            </div>
          )}

          {/* Form */}
          {showForm && (
            <div style={{ ...S.card, padding:28, marginBottom:24 }}>
              <h2 style={{ fontFamily:'Poppins,sans-serif', fontWeight:700, fontSize:16, color:'#1E1B18', marginBottom:22 }}>New Item Request</h2>
              <form onSubmit={handleSubmit}>
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16, marginBottom:16 }}>
                  <div>
                    <label style={S.label}>Item Name *</label>
                    <input className="inp" style={S.input} value={form.name} onChange={e=>setForm(f=>({...f,name:e.target.value}))} placeholder="e.g. Butter Chicken" required />
                  </div>
                  <div style={{ position:'relative' }}>
                    <label style={S.label}>Category</label>
                    <div
                      onClick={() => setShowCatDrop(d => !d)}
                      style={{ ...S.input, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'space-between', userSelect:'none', background: form.category ? '#F7F5F2' : '#F7F5F2' }}
                    >
                      <span style={{ color: form.category ? '#1E1B18' : 'rgba(42,31,16,0.3)' }}>
                        {form.category || 'Select or type new…'}
                      </span>
                      <span style={{ fontSize:10, color:'rgba(42,31,16,0.4)', marginLeft:8 }}>{showCatDrop ? '▲' : '▼'}</span>
                    </div>
                    {showCatDrop && (
                      <div style={{ position:'absolute', top:'100%', left:0, right:0, zIndex:20, background:'#fff', border:'1.5px solid rgba(42,31,16,0.1)', borderRadius:12, boxShadow:'0 8px 24px rgba(42,31,16,0.12)', marginTop:4, overflow:'hidden' }}>
                        {/* Type new category */}
                        <div style={{ padding:'10px 12px', borderBottom:'1px solid rgba(42,31,16,0.07)', display:'flex', gap:8 }}>
                          <input
                            autoFocus
                            style={{ flex:1, padding:'7px 10px', fontSize:13, border:'1.5px solid rgba(42,31,16,0.12)', borderRadius:8, outline:'none', fontFamily:'Inter,sans-serif', color:'#1E1B18' }}
                            placeholder="Type new category…"
                            value={newCatInput}
                            onChange={e => setNewCatInput(e.target.value)}
                            onKeyDown={e => {
                              if (e.key === 'Enter' && newCatInput.trim()) {
                                const cat = newCatInput.trim();
                                setForm(f => ({...f, category: cat}));
                                if (!categories.includes(cat)) setCategories(c => [...c, cat].sort());
                                setNewCatInput(''); setShowCatDrop(false);
                              }
                            }}
                          />
                          <button
                            type="button"
                            onClick={() => {
                              if (!newCatInput.trim()) return;
                              const cat = newCatInput.trim();
                              setForm(f => ({...f, category: cat}));
                              if (!categories.includes(cat)) setCategories(c => [...c, cat].sort());
                              setNewCatInput(''); setShowCatDrop(false);
                            }}
                            style={{ padding:'7px 14px', borderRadius:8, border:'none', background:'#1E1B18', color:'#fff', fontSize:12, fontWeight:600, cursor:'pointer', fontFamily:'Inter,sans-serif', flexShrink:0 }}
                          >Add</button>
                        </div>
                        {/* Existing categories */}
                        <div style={{ maxHeight:180, overflowY:'auto' }}>
                          {categories.length === 0 && (
                            <div style={{ padding:'12px 14px', fontSize:12, color:'rgba(42,31,16,0.4)' }}>No categories yet — type above to add one</div>
                          )}
                          {categories.map(cat => (
                            <div
                              key={cat}
                              onClick={() => { setForm(f => ({...f, category: cat})); setShowCatDrop(false); setNewCatInput(''); }}
                              style={{ padding:'10px 14px', fontSize:13, color:'#1E1B18', cursor:'pointer', background: form.category === cat ? '#FFF5F0' : 'transparent', fontWeight: form.category === cat ? 600 : 400 }}
                              onMouseEnter={e => e.currentTarget.style.background='#F7F5F2'}
                              onMouseLeave={e => e.currentTarget.style.background = form.category === cat ? '#FFF5F0' : 'transparent'}
                            >
                              {cat} {form.category === cat && <span style={{ color:'#E05A3A' }}>✓</span>}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                <div style={{ marginBottom:16 }}>
                  <label style={S.label}>Description</label>
                  <textarea className="inp" style={{ ...S.input, resize:'none' }} rows={2} value={form.description} onChange={e=>setForm(f=>({...f,description:e.target.value}))} placeholder="Brief description of the dish…" />
                </div>

                {/* Ingredients + Auto Calc button */}
                <div style={{ marginBottom:16 }}>
                  <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:6 }}>
                    <label style={{ ...S.label, marginBottom:0 }}>Ingredients (comma-separated)</label>
                    <button
                      type="button"
                      className="calc-btn"
                      onClick={handleAutoCalc}
                      disabled={calcLoading}
                      style={{
                        padding:'5px 14px', borderRadius:8, fontSize:12, fontWeight:600,
                        fontFamily:'Inter,sans-serif', border:'1.5px solid rgba(224,90,58,0.4)',
                        background:'#FFF5F2', color:'#E05A3A', cursor: calcLoading ? 'not-allowed' : 'pointer',
                        opacity: calcLoading ? 0.7 : 1, transition:'all 0.15s',
                        display:'flex', alignItems:'center', gap:6, flexShrink:0,
                      }}
                    >
                      {calcLoading
                        ? <><span style={{ width:11, height:11, border:'2px solid #E05A3A', borderTopColor:'transparent', borderRadius:'50%', display:'inline-block', animation:'spin 0.7s linear infinite' }}/> Calculating…</>
                        : '✦ Auto Calculate'
                      }
                    </button>
                  </div>
                  <input className="inp" style={S.input} value={form.ingredients} onChange={e=>setForm(f=>({...f,ingredients:e.target.value}))} placeholder="Chicken, Butter, Cream, Tomato, Spices" />
                  {calcLoading && calcDetail && (
                    <div style={{ fontSize:11, color:'rgba(224,90,58,0.7)', marginTop:5, fontStyle:'italic' }}>
                      {calcDetail}
                    </div>
                  )}
                  <div style={{ fontSize:11, color:'rgba(42,31,16,0.4)', marginTop:4 }}>
                    For accurate nutrition add weight: <strong>Flour 150g, Garlic 10g, Butter 20g</strong> — or just names for estimates
                  </div>
                </div>

                <div style={{ marginBottom:16 }}>
                  <label style={S.label}>Preparation Time</label>
                  <div style={{ position:'relative' }}>
                    <span style={{ position:'absolute', left:14, top:'50%', transform:'translateY(-50%)', fontSize:16 }}>⏱</span>
                    <input className="inp" style={{ ...S.input, paddingLeft:40 }} value={form.prepTime} onChange={e=>setForm(f=>({...f,prepTime:e.target.value}))} placeholder="e.g. 10–15 minutes" />
                  </div>
                  <div style={{ fontSize:11, color:'rgba(42,31,16,0.4)', marginTop:4 }}>Shown on menu card so customers know how long to wait</div>
                </div>

                {/* Nutrition fields — green tint when auto-filled */}
                <div style={{ marginBottom:16 }}>
                  <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:10 }}>
                    <label style={{ ...S.label, marginBottom:0 }}>Nutrition (per serving)</label>
                    {(form.calories || form.protein || form.carbs || form.fats) && (
                      <span style={{ fontSize:11, color:'#5A9A78', fontWeight:600 }}>✓ Values filled — edit if needed</span>
                    )}
                  </div>
                  <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:12 }}>
                    {['calories','protein','carbs','fats'].map(n => (
                      <div key={n}>
                        <label style={S.label}>{n.charAt(0).toUpperCase()+n.slice(1)}</label>
                        <input
                          className="inp"
                          style={{
                            ...S.input,
                            background: form[n] ? '#F0FBF5' : '#F7F5F2',
                            borderColor: form[n] ? 'rgba(90,154,120,0.4)' : undefined,
                          }}
                          type="number" min="0"
                          value={form[n]}
                          onChange={e=>setForm(f=>({...f,[n]:e.target.value}))}
                          placeholder="0"
                        />
                      </div>
                    ))}
                  </div>
                </div>

                <div style={{ marginBottom:20 }}>
                  <label style={S.label}>Food Photo</label>
                  <div className="upload-zone" onClick={()=>document.getElementById('img-upload').click()} style={{ border:'2px dashed rgba(42,31,16,0.15)', borderRadius:14, padding:24, textAlign:'center', cursor:'pointer', background:'#F7F5F2', transition:'all 0.15s' }}>
                    {imagePreview
                      ? <img src={imagePreview} alt="Preview" style={{ maxHeight:120, margin:'0 auto', borderRadius:10, objectFit:'cover', display:'block' }} />
                      : <div><div style={{ fontSize:28, marginBottom:8 }}>📷</div><div style={{ fontSize:13, color:'rgba(42,31,16,0.4)' }}>Click to upload image (max 5MB)</div></div>
                    }
                    <input id="img-upload" type="file" accept="image/*" onChange={handleImageChange} style={{ display:'none' }} />
                  </div>
                </div>
                {uploadProgress > 0 && uploadProgress < 100 && (
                  <div style={{ height:4, background:'rgba(42,31,16,0.08)', borderRadius:99, overflow:'hidden', marginBottom:16 }}>
                    <div style={{ height:'100%', borderRadius:99, background:'linear-gradient(90deg,#E05A3A,#F07050)', width:`${uploadProgress}%`, transition:'width 0.3s' }} />
                  </div>
                )}
                <button type="submit" disabled={submitting} style={{ ...S.btn, background:'#1E1B18', color:'#FFF5E8', width:'100%', padding:'13px', opacity:submitting?0.6:1 }}>
                  {submitting ? 'Submitting…' : 'Submit Request'}
                </button>
              </form>
            </div>
          )}

          {/* Filter tabs */}
          <div style={{ display:'flex', gap:6, marginBottom:20 }}>
            {['all','pending','approved','rejected'].map(s => (
              <button key={s} onClick={()=>setFilter(s)} style={{ padding:'7px 16px', borderRadius:30, border:'none', fontSize:12, fontWeight:600, cursor:'pointer', fontFamily:'Inter,sans-serif', textTransform:'capitalize', background: filter===s?'#1E1B18':'#fff', color: filter===s?'#FFF5E8':'rgba(42,31,16,0.55)', boxShadow: filter===s?'0 2px 8px rgba(30,27,24,0.18)':'0 1px 4px rgba(42,31,16,0.06)', transition:'all 0.15s' }}>
                {s} ({s==='all'?requests.length:requests.filter(r=>r.status===s).length})
              </button>
            ))}
          </div>

          {/* Request list */}
          {loading ? (
            <div style={{ display:'flex', justifyContent:'center', paddingTop:60 }}>
              <div style={{ width:32, height:32, border:'3px solid #E05A3A', borderTopColor:'transparent', borderRadius:'50%', animation:'spin 0.8s linear infinite' }} />
            </div>
          ) : filtered.length === 0 ? (
            <div style={{ textAlign:'center', padding:'60px 0', color:'rgba(42,31,16,0.4)' }}>
              <div style={{ fontSize:40, marginBottom:12 }}>📭</div>
              <p style={{ fontSize:14 }}>No requests yet. Add your first menu item above!</p>
            </div>
          ) : (
            <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
              {filtered.map(req => (
                <div key={req.id} style={{ ...S.card, padding:18, display:'flex', alignItems:'flex-start', gap:16 }}>
                  <div style={{ width:56, height:56, borderRadius:14, overflow:'hidden', background:'#F7F5F2', flexShrink:0 }}>
                    {req.imageURL ? <img src={req.imageURL} alt={req.name} style={{ width:'100%', height:'100%', objectFit:'cover' }} /> : <div style={{ width:'100%', height:'100%', display:'flex', alignItems:'center', justifyContent:'center', fontSize:22 }}>🍽️</div>}
                  </div>
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', gap:8 }}>
                      <div>
                        <div style={{ fontWeight:600, fontSize:14, color:'#1E1B18' }}>{req.name}</div>
                        {req.category && <div style={{ fontSize:12, color:'rgba(42,31,16,0.45)', marginTop:2 }}>{req.category}</div>}
                      </div>
                      <StatusBadge status={req.status} />
                    </div>
                    {req.description && <p style={{ fontSize:12, color:'rgba(42,31,16,0.5)', marginTop:6, lineHeight:1.5 }}>{req.description}</p>}
                    {req.nutritionalData && Object.values(req.nutritionalData).some(v => v != null) && (
                      <div style={{ display:'flex', gap:10, marginTop:8, flexWrap:'wrap' }}>
                        {Object.entries(req.nutritionalData).map(([k,v]) => v != null && (
                          <span key={k} style={{ fontSize:11, color:'rgba(42,31,16,0.5)', background:'#F7F5F2', borderRadius:6, padding:'2px 8px' }}>
                            {k.charAt(0).toUpperCase()+k.slice(1)}: <strong>{v}</strong>{k==='calories'?'kcal':'g'}
                          </span>
                        ))}
                      </div>
                    )}
                    <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginTop:8, flexWrap:'wrap', gap:8 }}>
                      <div style={{ fontSize:11, color:'rgba(42,31,16,0.35)' }}>
                        Submitted {req.createdAt?.seconds ? new Date(req.createdAt.seconds*1000).toLocaleDateString() : 'recently'}
                      </div>
                      {req.status === 'pending' && (
                        confirmCancel === req.id ? (
                          <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                            <span style={{ fontSize:12, color:'rgba(42,31,16,0.6)' }}>Cancel this request?</span>
                            <button onClick={() => handleCancelRequest(req.id)} style={{ padding:'4px 12px', borderRadius:8, border:'none', background:'#E05A3A', color:'#fff', fontSize:12, fontWeight:600, cursor:'pointer' }}>Yes, cancel</button>
                            <button onClick={() => setConfirmCancel(null)} style={{ padding:'4px 12px', borderRadius:8, border:'1.5px solid rgba(42,31,16,0.15)', background:'transparent', color:'rgba(42,31,16,0.6)', fontSize:12, fontWeight:600, cursor:'pointer' }}>Keep</button>
                          </div>
                        ) : (
                          <button onClick={() => setConfirmCancel(req.id)} style={{ padding:'4px 14px', borderRadius:8, border:'1.5px solid rgba(224,90,58,0.3)', background:'transparent', color:'#E05A3A', fontSize:12, fontWeight:600, cursor:'pointer', transition:'all 0.15s' }}>
                            Cancel Request
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
  const map = { pending:['#F4D070','#8B6020'], approved:['#8FC4A8','#1A5A38'], rejected:['#F4A0B0','#8B1A2A'] };
  const [bg, color] = map[status] || map.pending;
  return <span style={{ padding:'4px 12px', borderRadius:30, fontSize:11, fontWeight:700, background:bg+'33', color, border:`1px solid ${bg}66`, textTransform:'capitalize', flexShrink:0 }}>{status}</span>;
}