import Head from 'next/head';
import { useEffect, useState } from 'react';
import { useAuth } from '../../hooks/useAuth';
import AdminLayout from '../../components/layout/AdminLayout';
import { getAllOffers, createOffer, deleteOffer } from '../../lib/db';
import toast from 'react-hot-toast';

const G = { card:'rgba(255,255,255,0.03)', border:'rgba(255,255,255,0.07)', gold:'#B8962E', text:'rgba(255,255,255,0.82)', textDim:'rgba(255,255,255,0.32)' };
const inp = { width:'100%', padding:'11px 14px', background:'rgba(255,255,255,0.04)', border:'1px solid rgba(255,255,255,0.09)', borderRadius:8, fontSize:14, color:'rgba(255,255,255,0.82)', outline:'none', boxSizing:'border-box', fontFamily:'inherit', colorScheme:'dark' };
const lbl = { display:'block', fontSize:11, fontWeight:600, color:'rgba(255,255,255,0.32)', letterSpacing:'0.08em', textTransform:'uppercase', marginBottom:6, fontFamily:`'DM Mono',monospace` };

export default function AdminOffers() {
  const { userData } = useAuth();
  const [offers, setOffers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ title:'', description:'', startDate:'', endDate:'' });
  const [saving, setSaving] = useState(false);
  const rid = userData?.restaurantId;
  const today = new Date().toISOString().split('T')[0];

  useEffect(() => { if (!rid) return; getAllOffers(rid).then(o=>{setOffers(o);setLoading(false);}); }, [rid]);

  const handleSubmit = async (e) => {
    e.preventDefault?.();
    if (!rid || !form.title || !form.endDate) return;
    setSaving(true);
    try {
      await createOffer(rid, form);
      toast.success('Offer created!');
      setForm({ title:'', description:'', startDate:'', endDate:'' });
      setShowForm(false);
      setOffers(await getAllOffers(rid));
    } catch { toast.error('Failed to create offer'); }
    finally { setSaving(false); }
  };

  const handleDelete = async (id) => {
    if (!confirm('Delete this offer?')) return;
    await deleteOffer(rid, id);
    setOffers(o=>o.filter(x=>x.id!==id));
    toast.success('Offer deleted');
  };

  return (
    <AdminLayout>
      <Head><title>Offers — Advert Radical</title></Head>
      <div style={{minHeight:'100vh',padding:'32px 36px',fontFamily:`'Bricolage Grotesque',Inter,sans-serif`}}>
        <div style={{maxWidth:860,margin:'0 auto'}}>
          <style>{`@keyframes spin{to{transform:rotate(360deg)}} *{box-sizing:border-box} .oinp:focus{border-color:rgba(184,150,46,0.5)!important;outline:none} .oinp::placeholder{color:rgba(255,255,255,0.18)}`}</style>

          <div style={{display:'flex',alignItems:'flex-start',justifyContent:'space-between',marginBottom:28,flexWrap:'wrap',gap:12}}>
            <div>
              <h1 style={{fontWeight:800,fontSize:22,color:'rgba(255,255,255,0.88)',margin:0,letterSpacing:'-0.02em'}}>Offers & Promotions</h1>
              <p style={{fontSize:13,color:G.textDim,marginTop:4}}>Active offers display as banners on your live menu page.</p>
            </div>
            <button onClick={()=>setShowForm(!showForm)} style={{padding:'9px 20px',borderRadius:8,border:`1px solid ${showForm?'rgba(255,255,255,0.1)':'rgba(184,150,46,0.3)'}`,background:showForm?'rgba(255,255,255,0.04)':'rgba(184,150,46,0.1)',color:showForm?G.textDim:G.gold,fontSize:13,fontWeight:600,cursor:'pointer',fontFamily:'inherit',transition:'all 0.2s'}}>
              {showForm ? '✕ Cancel' : '+ New Offer'}
            </button>
          </div>

          {showForm && (
            <div style={{background:G.card,border:`1px solid ${G.border}`,borderRadius:12,padding:28,marginBottom:16}}>
              <h2 style={{fontWeight:700,fontSize:16,color:'rgba(255,255,255,0.82)',marginBottom:22,margin:'0 0 22px'}}>Create Offer</h2>
              {form.title && (
                <div style={{background:'rgba(184,150,46,0.12)',border:'1px solid rgba(184,150,46,0.25)',borderRadius:10,padding:'12px 18px',marginBottom:20,display:'flex',alignItems:'center',gap:10}}>
                  <div>
                    <div style={{fontWeight:700,fontSize:14,color:G.gold}}>{form.title}</div>
                    {form.description && <div style={{fontSize:12,color:'rgba(255,255,255,0.5)',marginTop:2}}>{form.description}</div>}
                  </div>
                  <span style={{marginLeft:'auto',fontSize:11,color:G.textDim}}>Preview</span>
                </div>
              )}
              <div style={{marginBottom:14}}>
                <label style={lbl}>Title *</label>
                <input className="oinp" style={inp} value={form.title} onChange={e=>setForm(f=>({...f,title:e.target.value}))} placeholder="Weekend Special — 20% Off"/>
              </div>
              <div style={{marginBottom:14}}>
                <label style={lbl}>Description</label>
                <input className="oinp" style={inp} value={form.description} onChange={e=>setForm(f=>({...f,description:e.target.value}))} placeholder="Show this banner to avail the offer"/>
              </div>
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:14,marginBottom:22}}>
                <div>
                  <label style={lbl}>Start Date</label>
                  <input className="oinp" style={inp} type="date" value={form.startDate} min={today} onChange={e=>setForm(f=>({...f,startDate:e.target.value}))}/>
                </div>
                <div>
                  <label style={lbl}>End Date *</label>
                  <input className="oinp" style={inp} type="date" value={form.endDate} min={form.startDate||today} onChange={e=>setForm(f=>({...f,endDate:e.target.value}))}/>
                </div>
              </div>
              <button onClick={handleSubmit} disabled={saving} style={{padding:'11px 24px',borderRadius:8,border:`1px solid rgba(184,150,46,${saving?'0.15':'0.35'})`,background:saving?'transparent':'rgba(184,150,46,0.1)',color:saving?G.textDim:G.gold,fontSize:14,fontWeight:700,cursor:saving?'not-allowed':'pointer',fontFamily:'inherit',transition:'all 0.2s'}}>
                {saving ? 'Saving…' : 'Create Offer'}
              </button>
            </div>
          )}

          {loading ? (
            <div style={{display:'flex',justifyContent:'center',paddingTop:60}}>
              <div style={{width:32,height:32,border:`2px solid ${G.gold}`,borderTopColor:'transparent',borderRadius:'50%',animation:'spin 0.8s linear infinite'}}/>
            </div>
          ) : offers.length === 0 ? (
            <div style={{textAlign:'center',padding:'60px 0',color:G.textDim}}>
              <div style={{fontSize:36,marginBottom:12,opacity:0.4}}>◇</div>
              <p style={{fontSize:14}}>No offers yet. Create one to display as a banner on your menu.</p>
            </div>
          ) : (
            <div style={{display:'flex',flexDirection:'column',gap:8}}>
              {offers.map(offer => {
                const isActive = offer.endDate >= today && (!offer.startDate || offer.startDate <= today);
                return (
                  <div key={offer.id} style={{background:G.card,border:`1px solid ${G.border}`,borderRadius:12,padding:20,display:'flex',alignItems:'center',gap:16}}>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{fontWeight:600,fontSize:14,color:'rgba(255,255,255,0.82)'}}>{offer.title}</div>
                      {offer.description && <div style={{fontSize:12,color:G.textDim,marginTop:3}}>{offer.description}</div>}
                      <div style={{fontSize:11,color:G.textDim,marginTop:6,fontFamily:`'DM Mono',monospace`}}>
                        {offer.startDate?`${offer.startDate} → ${offer.endDate}`:`Ends ${offer.endDate}`}
                      </div>
                    </div>
                    <div style={{display:'flex',alignItems:'center',gap:10,flexShrink:0}}>
                      <span style={{padding:'4px 12px',borderRadius:20,fontSize:11,fontWeight:600,background:isActive?'rgba(60,160,80,0.1)':'rgba(255,255,255,0.04)',color:isActive?'#5DC87A':G.textDim,border:`1px solid ${isActive?'rgba(60,160,80,0.25)':'rgba(255,255,255,0.08)'}`,fontFamily:`'DM Mono',monospace`}}>
                        {isActive?'Active':'Expired'}
                      </span>
                      <button onClick={()=>handleDelete(offer.id)} style={{width:30,height:30,borderRadius:8,border:'1px solid rgba(255,255,255,0.07)',background:'transparent',color:G.textDim,cursor:'pointer',fontSize:14,display:'flex',alignItems:'center',justifyContent:'center',transition:'all 0.15s'}}
                        onMouseOver={e=>{e.currentTarget.style.borderColor='rgba(220,60,60,0.3)';e.currentTarget.style.color='#E05555'}}
                        onMouseOut={e=>{e.currentTarget.style.borderColor='rgba(255,255,255,0.07)';e.currentTarget.style.color=G.textDim}}>✕</button>
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
