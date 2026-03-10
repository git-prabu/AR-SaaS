import Head from 'next/head';
import { useEffect, useState } from 'react';
import { useAuth } from '../../hooks/useAuth';
import AdminLayout from '../../components/layout/AdminLayout';
import { getAllOffers, createOffer, deleteOffer, getAllMenuItems } from '../../lib/db';
import toast from 'react-hot-toast';

const S = {
  card:  { background:'#FFFFFF', border:'1px solid rgba(42,31,16,0.07)', borderRadius:20, boxShadow:'0 2px 14px rgba(42,31,16,0.06)' },
  h1:    { fontFamily:'Poppins,sans-serif', fontWeight:800, fontSize:22, color:'#1E1B18', margin:0 },
  sub:   { fontSize:13, color:'rgba(42,31,16,0.45)', marginTop:4 },
  label: { display:'block', fontSize:11, fontWeight:600, color:'rgba(42,31,16,0.5)', letterSpacing:'0.05em', textTransform:'uppercase', marginBottom:6 },
  input: { width:'100%', padding:'11px 14px', background:'#F7F5F2', border:'1.5px solid rgba(42,31,16,0.09)', borderRadius:12, fontSize:14, color:'#1E1B18', fontFamily:'Inter,sans-serif', outline:'none', boxSizing:'border-box' },
  btn:   { padding:'11px 22px', borderRadius:12, fontSize:14, fontWeight:600, fontFamily:'Poppins,sans-serif', border:'none', cursor:'pointer', transition:'all 0.18s' },
};

const BLANK = { title:'', description:'', startDate:'', endDate:'', linkedItemId:'', discountedPrice:'' };

export default function AdminOffers() {
  const { userData } = useAuth();
  const [offers,    setOffers]    = useState([]);
  const [menuItems, setMenuItems] = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [showForm,  setShowForm]  = useState(false);
  const [form,      setForm]      = useState(BLANK);
  const [saving,    setSaving]    = useState(false);
  const rid = userData?.restaurantId;
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

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!rid || !form.title || !form.endDate) return;
    setSaving(true);
    try {
      await createOffer(rid, {
        ...form,
        discountedPrice: form.discountedPrice !== '' ? Number(form.discountedPrice) : null,
        linkedItemId:    form.linkedItemId || null,
        linkedItemName:  linkedItem?.name || null,
        linkedItemImage: linkedItem?.imageURL || null,
        linkedItemPrice: linkedItem?.price || null,
      });
      toast.success('Offer created!');
      setForm(BLANK);
      setShowForm(false);
      setOffers(await getAllOffers(rid));
    } catch { toast.error('Failed to create offer'); }
    finally { setSaving(false); }
  };

  const handleDelete = async (id) => {
    if (!confirm('Delete this offer?')) return;
    await deleteOffer(rid, id);
    setOffers(o => o.filter(x => x.id !== id));
    toast.success('Offer deleted');
  };

  return (
    <AdminLayout>
      <Head><title>Offers — Advert Radical</title></Head>
      <div style={{ background:'#F2F0EC', minHeight:'100vh', padding:32, fontFamily:'Inter,sans-serif' }}>
        <div style={{ maxWidth:860, margin:'0 auto' }}>
          <style>{`@keyframes spin{to{transform:rotate(360deg)}} .inp:focus{border-color:rgba(224,90,58,0.5)!important} .inp::placeholder{color:rgba(42,31,16,0.3)}`}</style>

          {/* Header */}
          <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', marginBottom:28, flexWrap:'wrap', gap:12 }}>
            <div>
              <h1 style={S.h1}>Offers & Promotions</h1>
              <p style={S.sub}>Active offers display as a horizontal strip on your live menu. Link a dish to make it clickable.</p>
            </div>
            <button onClick={()=>setShowForm(!showForm)} style={{ ...S.btn, background:showForm?'#F2F0EC':'#1E1B18', color:showForm?'#1E1B18':'#FFF5E8', border:showForm?'1.5px solid rgba(42,31,16,0.12)':'none' }}>
              {showForm ? '✕ Cancel' : '+ New Offer'}
            </button>
          </div>

          {/* Form */}
          {showForm && (
            <div style={{ ...S.card, padding:28, marginBottom:24, border:'1.5px solid rgba(247,155,61,0.3)' }}>
              <h2 style={{ fontFamily:'Poppins,sans-serif', fontWeight:700, fontSize:16, color:'#1E1B18', marginBottom:22 }}>Create Offer</h2>

              {/* Preview */}
              {form.title && (
                <div style={{ background:'linear-gradient(135deg,#E05A3A,#F07050)', borderRadius:12, padding:'12px 18px', marginBottom:20, display:'flex', alignItems:'center', gap:12 }}>
                  {linkedItem?.imageURL && (
                    <img src={linkedItem.imageURL} alt={linkedItem.name} style={{ width:44, height:44, borderRadius:10, objectFit:'cover', flexShrink:0, border:'2px solid rgba(255,255,255,0.3)' }} />
                  )}
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ fontWeight:700, fontSize:14, color:'#fff' }}>{form.title}</div>
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
                <div style={{ marginBottom:14, padding:'16px', background:'rgba(247,155,61,0.05)', borderRadius:14, border:'1px solid rgba(247,155,61,0.2)' }}>
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
                    <input className="inp" style={S.input} type="date" value={form.startDate} min={today} onChange={e=>setForm(f=>({...f,startDate:e.target.value}))} />
                  </div>
                  <div>
                    <label style={S.label}>End Date *</label>
                    <input className="inp" style={S.input} type="date" value={form.endDate} min={form.startDate||today} onChange={e=>setForm(f=>({...f,endDate:e.target.value}))} required />
                  </div>
                </div>
                <button type="submit" disabled={saving} style={{ ...S.btn, background:'#1E1B18', color:'#FFF5E8', padding:'13px 28px', opacity:saving?0.6:1 }}>
                  {saving ? 'Saving…' : 'Create Offer'}
                </button>
              </form>
            </div>
          )}

          {/* List */}
          {loading ? (
            <div style={{ display:'flex', justifyContent:'center', paddingTop:60 }}>
              <div style={{ width:32, height:32, border:'3px solid #E05A3A', borderTopColor:'transparent', borderRadius:'50%', animation:'spin 0.8s linear infinite' }} />
            </div>
          ) : offers.length === 0 ? (
            <div style={{ textAlign:'center', padding:'60px 0', color:'rgba(42,31,16,0.4)' }}>
              <div style={{ fontSize:40, marginBottom:12 }}>🎁</div>
              <p style={{ fontSize:14 }}>No offers yet. Create one to display on your menu.</p>
            </div>
          ) : (
            <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
              {offers.map(offer => {
                const isActive = offer.endDate >= today && (!offer.startDate || offer.startDate <= today);
                return (
                  <div key={offer.id} style={{ ...S.card, padding:20, display:'flex', alignItems:'center', gap:16 }}>
                    {offer.linkedItemImage
                      ? <img src={offer.linkedItemImage} alt={offer.linkedItemName} style={{ width:52, height:52, borderRadius:14, objectFit:'cover', flexShrink:0 }} />
                      : <div style={{ width:52, height:52, borderRadius:14, background:'rgba(224,90,58,0.1)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:22, flexShrink:0 }}>🎉</div>
                    }
                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ fontWeight:700, fontSize:14, color:'#1E1B18' }}>{offer.title}</div>
                      {offer.description && <div style={{ fontSize:12, color:'rgba(42,31,16,0.5)', marginTop:2 }}>{offer.description}</div>}
                      {offer.linkedItemName && (
                        <div style={{ fontSize:11, color:'#E05A3A', fontWeight:600, marginTop:3 }}>
                          🔗 {offer.linkedItemName}
                          {offer.linkedItemPrice && <span style={{ color:'rgba(42,31,16,0.4)', textDecoration:'line-through', marginLeft:6 }}>₹{offer.linkedItemPrice}</span>}
                          {offer.discountedPrice && <span style={{ color:'#2D8B4E', fontWeight:800, marginLeft:6 }}>→ ₹{offer.discountedPrice}</span>}
                        </div>
                      )}
                      <div style={{ fontSize:11, color:'rgba(42,31,16,0.35)', marginTop:4 }}>
                        {offer.startDate ? `${offer.startDate} → ${offer.endDate}` : `Ends ${offer.endDate}`}
                      </div>
                    </div>
                    <div style={{ display:'flex', alignItems:'center', gap:10, flexShrink:0 }}>
                      <span style={{ padding:'4px 12px', borderRadius:30, fontSize:11, fontWeight:700, background:isActive?'rgba(143,196,168,0.2)':'rgba(42,31,16,0.06)', color:isActive?'#1A5A38':'rgba(42,31,16,0.4)', border:`1px solid ${isActive?'rgba(143,196,168,0.4)':'rgba(42,31,16,0.1)'}` }}>
                        {isActive ? 'Active' : 'Expired'}
                      </span>
                      <button onClick={()=>handleDelete(offer.id)} style={{ width:30, height:30, borderRadius:8, border:'none', background:'rgba(224,90,58,0.08)', color:'#E05A3A', cursor:'pointer', fontSize:14, display:'flex', alignItems:'center', justifyContent:'center' }}>✕</button>
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
