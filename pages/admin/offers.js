import Head from 'next/head';
import { useEffect, useState } from 'react';
import { useAuth } from '../../hooks/useAuth';
import AdminLayout from '../../components/layout/AdminLayout';
import { getAllOffers, createOffer, updateOffer, deleteOffer, getAllMenuItems } from '../../lib/db';
import { T, ADMIN_STYLES } from '../../lib/utils';
import toast from 'react-hot-toast';

const S = {
  card:  { background:'#FFFFFF', border:'1px solid rgba(38,52,49,0.07)', borderRadius:20, boxShadow:'0 2px 14px rgba(38,52,49,0.06)' },
  h1:    { fontFamily:"'Playfair Display', Georgia, serif", fontWeight:800, fontSize:24, color:'#263431', margin:0, letterSpacing:'-0.3px' },
  sub:   { fontSize:13, color:'rgba(38,52,49,0.45)', marginTop:4 },
  label: { display:'block', fontSize:11, fontWeight:600, color:'rgba(38,52,49,0.5)', letterSpacing:'0.05em', textTransform:'uppercase', marginBottom:6 },
  input: { width:'100%', padding:'11px 14px', background:'#F7F5F2', border:'1.5px solid rgba(38,52,49,0.09)', borderRadius:12, fontSize:14, color:'#263431', fontFamily:'Inter,sans-serif', outline:'none', boxSizing:'border-box' },
  btn:   { padding:'11px 22px', borderRadius:10, fontSize:14, fontWeight:600, fontFamily:'Outfit, sans-serif', border:'none', cursor:'pointer', transition:'all 0.18s' },
};

const BLANK = { title:'', description:'', startDate:'', endDate:'', linkedItemId:'', discountedPrice:'' };

export default function AdminOffers() {
  const { userData } = useAuth();
  const [offers,    setOffers]    = useState([]);
  const [menuItems, setMenuItems] = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [showForm,  setShowForm]  = useState(false);
  const [editingId, setEditingId] = useState(null); // null = create mode, string = edit mode
  const [form,      setForm]      = useState(BLANK);
  const [saving,    setSaving]    = useState(false);
  const rid   = userData?.restaurantId;
  const today = new Date().toISOString().split('T')[0];

  useEffect(() => {
    if (!rid) return;
    Promise.all([getAllOffers(rid), getAllMenuItems(rid)]).then(([o, m]) => {
      setOffers(o);
      setMenuItems(m.filter(i => i.isActive !== false).sort((a,b) => (a.name||'').localeCompare(b.name||'')));
      setLoading(false);
    });
  }, [rid]);

  const linkedItem = menuItems.find(i => i.id === form.linkedItemId);

  const openCreate = () => {
    setEditingId(null);
    setForm(BLANK);
    setShowForm(true);
  };

  const openEdit = (offer) => {
    setEditingId(offer.id);
    setForm({
      title:           offer.title           || '',
      description:     offer.description     || '',
      startDate:       offer.startDate       || '',
      endDate:         offer.endDate         || '',
      linkedItemId:    offer.linkedItemId    || '',
      discountedPrice: offer.discountedPrice != null ? String(offer.discountedPrice) : '',
    });
    setShowForm(true);
    setTimeout(() => window.scrollTo({ top: 0, behavior: 'smooth' }), 50);
  };

  const closeForm = () => {
    setShowForm(false);
    setEditingId(null);
    setForm(BLANK);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!rid || !form.title || !form.endDate) return;
    if (form.discountedPrice !== '' && Number(form.discountedPrice) <= 0) {
      toast.error('Discounted price must be greater than 0');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        ...form,
        discountedPrice: form.discountedPrice !== '' ? Number(form.discountedPrice) : null,
        linkedItemId:    form.linkedItemId    || null,
        linkedItemName:  linkedItem?.name     || null,
        linkedItemImage: linkedItem?.imageURL || null,
        linkedItemPrice: linkedItem?.price    || null,
      };
      if (editingId) {
        await updateOffer(rid, editingId, payload);
        toast.success('Offer updated!');
      } else {
        await createOffer(rid, payload);
        toast.success('Offer created!');
      }
      closeForm();
      setOffers(await getAllOffers(rid));
    } catch { toast.error(editingId ? 'Failed to update offer' : 'Failed to create offer'); }
    finally { setSaving(false); }
  };

  const handleDelete = async (id) => {
    if (!confirm('Delete this offer?')) return;
    await deleteOffer(rid, id);
    setOffers(o => o.filter(x => x.id !== id));
    if (editingId === id) closeForm();
    toast.success('Offer deleted');
  };

  const isEditing = !!editingId;

  return (
    <AdminLayout>
      <Head><title>Offers — Advert Radical</title></Head>
      <div style={{ background:'#EAE7E3', minHeight:'100vh', padding:32, fontFamily:'Inter,sans-serif' }}>
        <div style={{ maxWidth:860, margin:'0 auto' }}>
          <style>{`@keyframes spin{to{transform:rotate(360deg)}} .inp:focus{border-color:rgba(138,74,66,0.5)!important} .inp::placeholder{color:rgba(38,52,49,0.3)}`}</style>

          {/* Header */}
          <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', marginBottom:28, flexWrap:'wrap', gap:12 }}>
            <div>
              <h1 style={ADMIN_STYLES.h1}>Offers & Promotions</h1>
              <p style={ADMIN_STYLES.sub}>Active offers display as a horizontal strip on your live menu. Link a dish to make it clickable.</p>
            </div>
            <button onClick={showForm ? closeForm : openCreate}
              style={{ ...S.btn, background:showForm?'#EAE7E3':'#263431', color:showForm?'#263431':'#EAE7E3', border:showForm?'1.5px solid rgba(38,52,49,0.12)':'none' }}>
              {showForm ? '✕ Cancel' : '+ New Offer'}
            </button>
          </div>

          {/* Form — create or edit */}
          {showForm && (
            <div style={{ ...S.card, padding:28, marginBottom:24, border:`1.5px solid ${isEditing ? 'rgba(74,128,192,0.35)' : 'rgba(196,168,109,0.3)'}` }}>
              <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:22 }}>
                <h2 style={{ fontFamily:"'Playfair Display', Georgia, serif", fontWeight:700, fontSize:17, color:'#263431', margin:0 }}>
                  {isEditing ? '✏️ Edit Offer' : 'Create Offer'}
                </h2>
                {isEditing && (
                  <span style={{ fontSize:11, fontWeight:600, padding:'3px 10px', borderRadius:20, background:'rgba(74,128,192,0.1)', color:'#5A7A9A' }}>
                    Editing existing offer
                  </span>
                )}
              </div>

              {/* Live preview */}
              {form.title && (
                <div style={{ background:'linear-gradient(135deg,#8A4A42,#F07050)', borderRadius:12, padding:'12px 18px', marginBottom:20, display:'flex', alignItems:'center', gap:12 }}>
                  {linkedItem?.imageURL && (
                    <img src={linkedItem.imageURL} alt={linkedItem.name} style={{ width:44, height:44, borderRadius:T.radiusBtn, objectFit:'cover', flexShrink:0, border:`2px solid rgba(255,255,255,0.3)` }} />
                  )}
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ fontWeight:700, fontSize:14, color:T.white }}>{form.title}</div>
                    {form.description && <div style={{ fontSize:12, color:'rgba(255,255,255,0.8)', marginTop:2 }}>{form.description}</div>}
                    {linkedItem && (
                      <div style={{ fontSize:11, color:'rgba(255,255,255,0.75)', marginTop:3 }}>
                        {linkedItem.name}
                        {linkedItem.price && <span style={{ textDecoration:'line-through', marginLeft:6 }}>₹{linkedItem.price}</span>}
                        {form.discountedPrice && <span style={{ fontWeight:800, marginLeft:6 }}>→ ₹{form.discountedPrice}</span>}
                      </div>
                    )}
                  </div>
                  <span style={{ fontSize:11, color:'rgba(255,255,255,0.6)', flexShrink:0 }}>Preview</span>
                </div>
              )}

              <form onSubmit={handleSubmit}>
                <div style={{ marginBottom:14 }}>
                  <label style={S.label}>Title *</label>
                  <input className="inp" style={S.input} value={form.title} onChange={e=>setForm(f=>({...f,title:e.target.value}))} placeholder="Weekend Special — 20% Off" required />
                </div>
                <div style={{ marginBottom:14 }}>
                  <label style={S.label}>Description</label>
                  <input className="inp" style={S.input} value={form.description} onChange={e=>setForm(f=>({...f,description:e.target.value}))} placeholder="Tap to see the dish and add to your order list" />
                </div>

                {/* Link to a dish */}
                <div style={{ marginBottom:14, padding:'16px', background:'rgba(196,168,109,0.05)', borderRadius:14, border:'1px solid rgba(196,168,109,0.2)' }}>
                  <label style={S.label}>🔗 Link to a Dish <span style={{ fontWeight:400, textTransform:'none', letterSpacing:0, fontSize:11 }}>(optional — makes card clickable, shows dish modal)</span></label>
                  <select className="inp" style={S.input} value={form.linkedItemId} onChange={e=>setForm(f=>({...f,linkedItemId:e.target.value,discountedPrice:''}))}>
                    <option value="">— No linked dish —</option>
                    {menuItems.map(i => (
                      <option key={i.id} value={i.id}>{i.name}{i.price ? ` (₹${i.price})` : ''}</option>
                    ))}
                  </select>
                  {form.linkedItemId && (
                    <div style={{ marginTop:10 }}>
                      <label style={S.label}>Offer Price ₹ <span style={{ fontWeight:400, textTransform:'none', letterSpacing:0, fontSize:11 }}>(shown as discounted price on the card)</span></label>
                      <input className="inp" style={S.input} type="number" min="0" value={form.discountedPrice} onChange={e=>setForm(f=>({...f,discountedPrice:e.target.value}))} placeholder={linkedItem?.price ? `Original ₹${linkedItem.price} — enter discounted price` : 'Enter offer price'} />
                    </div>
                  )}
                </div>

                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14, marginBottom:20 }}>
                  <div>
                    <label style={S.label}>Start Date</label>
                    <input className="inp" style={S.input} type="date" value={form.startDate} onChange={e=>setForm(f=>({...f,startDate:e.target.value}))} />
                  </div>
                  <div>
                    <label style={S.label}>End Date *</label>
                    <input className="inp" style={S.input} type="date" value={form.endDate} min={form.startDate||today} onChange={e=>setForm(f=>({...f,endDate:e.target.value}))} required />
                  </div>
                </div>

                <div style={{ display:'flex', gap:10 }}>
                  <button type="submit" disabled={saving}
                    style={{ ...S.btn, background: isEditing ? '#4A80C0' : '#263431', color:'#EAE7E3', padding:'13px 28px', borderRadius:10, opacity:saving?0.6:1 }}>
                    {saving ? 'Saving…' : isEditing ? '✓ Save Changes' : 'Create Offer'}
                  </button>
                  <button type="button" onClick={closeForm}
                    style={{ ...S.btn, background:'transparent', color:'rgba(38,52,49,0.5)', border:'1.5px solid rgba(38,52,49,0.12)', padding:'13px 20px', borderRadius:10 }}>
                    Cancel
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* List */}
          {loading ? (
            <div style={{ display:'flex', justifyContent:'center', paddingTop:60 }}>
              <div style={{ width:32, height:32, border:'3px solid #8A4A42', borderTopColor:'transparent', borderRadius:'50%', animation:'spin 0.8s linear infinite' }} />
            </div>
          ) : offers.length === 0 ? (
            <div style={{ textAlign:'center', padding:'60px 0', color:'rgba(38,52,49,0.4)' }}>
              <div style={{ fontSize:40, marginBottom:12 }}>🎁</div>
              <p style={{ fontSize:14 }}>No offers yet. Create one to display on your menu.</p>
            </div>
          ) : (
            <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
              {offers.map(offer => {
                const isActive      = offer.endDate >= today && (!offer.startDate || offer.startDate <= today);
                const isBeingEdited = editingId === offer.id;
                return (
                  <div key={offer.id} style={{ ...ADMIN_STYLES.card, padding:20, display:'flex', alignItems:'center', gap:16, outline: isBeingEdited ? '2px solid #5A7A9A' : 'none', outlineOffset:2 }}>
                    {offer.linkedItemImage
                      ? <img src={offer.linkedItemImage} alt={offer.linkedItemName} style={{ width:52, height:52, borderRadius:14, objectFit:'cover', flexShrink:0 }} />
                      : <div style={{ width:52, height:52, borderRadius:14, background:'rgba(138,74,66,0.1)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:22, flexShrink:0 }}>🎉</div>
                    }
                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ fontWeight:700, fontSize:14, color:'#263431' }}>{offer.title}</div>
                      {offer.description && <div style={{ fontSize:12, color:'rgba(38,52,49,0.5)', marginTop:2 }}>{offer.description}</div>}
                      {offer.linkedItemName && (
                        <div style={{ fontSize:11, color:'#8A4A42', fontWeight:600, marginTop:3 }}>
                          🔗 {offer.linkedItemName}
                          {offer.linkedItemPrice && <span style={{ color:'rgba(38,52,49,0.4)', textDecoration:'line-through', marginLeft:6 }}>₹{offer.linkedItemPrice}</span>}
                          {offer.discountedPrice && <span style={{ color:'#4A7A5E', fontWeight:800, marginLeft:6 }}>→ ₹{offer.discountedPrice}</span>}
                        </div>
                      )}
                      <div style={{ fontSize:11, color:'rgba(38,52,49,0.35)', marginTop:4 }}>
                        {offer.startDate ? `${offer.startDate} → ${offer.endDate}` : `Ends ${offer.endDate}`}
                      </div>
                    </div>
                    <div style={{ display:'flex', alignItems:'center', gap:8, flexShrink:0 }}>
                      <span style={{ padding:'4px 14px', borderRadius:20, fontSize:11, fontWeight:700, background:isActive?'rgba(122,170,142,0.15)':'rgba(38,52,49,0.06)', color:isActive?'#1A5A38':'rgba(38,52,49,0.4)', border:`1px solid ${isActive?'rgba(122,170,142,0.35)':'rgba(38,52,49,0.1)'}`, letterSpacing:'0.02em' }}>
                        {isActive ? 'Active' : 'Expired'}
                      </span>
                      <button onClick={() => isBeingEdited ? closeForm() : openEdit(offer)}
                        style={{ height:30, padding:'0 12px', borderRadius:10, border:`1.5px solid ${isBeingEdited ? 'rgba(74,128,192,0.5)' : 'rgba(74,128,192,0.3)'}`, background: isBeingEdited ? 'rgba(74,128,192,0.12)' : 'rgba(74,128,192,0.06)', color:'#4A80C0', cursor:'pointer', fontSize:12, fontWeight:600, transition:'all 0.15s' }}>
                        {isBeingEdited ? '✕ Cancel' : '✏️ Edit'}
                      </button>
                      <button onClick={() => handleDelete(offer.id)}
                        style={{ width:30, height:30, borderRadius:10, border:'1.5px solid rgba(138,74,66,0.25)', background:'rgba(138,74,66,0.06)', color:'#8A4A42', cursor:'pointer', fontSize:14, display:'flex', alignItems:'center', justifyContent:'center', transition:'all 0.15s' }}>✕</button>
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
AdminOffers.getLayout = (page) => page;
