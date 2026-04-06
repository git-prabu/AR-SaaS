import Head from 'next/head';
import { useEffect, useState } from 'react';
import { useAuth } from '../../hooks/useAuth';
import AdminLayout from '../../components/layout/AdminLayout';
import { getRestaurantById } from '../../lib/db';
import toast from 'react-hot-toast';
import { T, ADMIN_STYLES } from '../../lib/utils';

const PLANS = [
  { id:'basic',   name:'Basic',   price:999,  items:10,  storage:500,  period:'6 months' },
  { id:'pro',     name:'Pro',     price:2499, items:40,  storage:2048, period:'6 months', popular:true },
  { id:'premium', name:'Premium', price:4999, items:100, storage:5120, period:'6 months' },
];

export default function AdminSubscription() {
  const { userData } = useAuth();
  const [restaurant, setRestaurant] = useState(null);
  const [loading, setLoading] = useState(true);
  const [paying, setPaying] = useState(null);
  const rid = userData?.restaurantId;

  useEffect(() => {
    if (!rid) return;
    getRestaurantById(rid).then(r => { setRestaurant(r); setLoading(false); });
  }, [rid]);

  const handleUpgrade = async (plan) => {
    if (!window.Razorpay) { toast.error('Payment system not loaded. Please refresh.'); return; }
    setPaying(plan.id);
    try {
      const res  = await fetch('/api/payments/create-order', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ planId:plan.id, restaurantId:rid }) });
      const data = await res.json();
      if (!data.orderId) throw new Error('Could not create order');
      const options = {
        key: process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID,
        amount: plan.price * 100,
        currency: 'INR',
        name: 'Advert Radical',
        description: `${plan.name} Plan — 6 months`,
        order_id: data.orderId,
        handler: async (response) => {
          await fetch('/api/payments/verify', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ ...response, planId:plan.id, restaurantId:rid }) });
          toast.success(`Successfully upgraded to ${plan.name} plan!`);
          setRestaurant(await getRestaurantById(rid));
        },
        prefill:  { email: userData?.email || '' },
        theme:    { color: T.danger },
      };
      new window.Razorpay(options).open();
    } catch { toast.error('Payment failed. Try again.'); }
    finally { setPaying(null); }
  };

  const currentPlan = PLANS.find(p => p.id === restaurant?.plan) || PLANS[0];
  const subEnd      = restaurant?.subscriptionEnd;
  const subStart    = restaurant?.subscriptionStart;
  const isExpired   = subEnd && new Date(subEnd) < new Date();
  const isActive    = restaurant?.paymentStatus === 'active';

  // Days remaining calculation
  const daysRemaining = subEnd ? Math.max(0, Math.ceil((new Date(subEnd) - new Date()) / (1000*60*60*24))) : null;
  const totalDays = (subStart && subEnd) ? Math.ceil((new Date(subEnd) - new Date(subStart)) / (1000*60*60*24)) : 180;
  const usedDays  = totalDays - (daysRemaining || 0);
  const timePct   = Math.min(100, Math.round((usedDays / totalDays) * 100));
  const timeColor = daysRemaining === null ? T.success : daysRemaining <= 14 ? T.danger : daysRemaining <= 30 ? T.warning : T.success;

  return (
    <AdminLayout>
      <Head>
        <title>Subscription — Advert Radical</title>
        <script src="https://checkout.razorpay.com/v1/checkout.js" />
      </Head>
      <div style={{ background:T.cream, minHeight:'100vh', padding:32, fontFamily:T.font }}>
        <div style={{ maxWidth:880, margin:'0 auto' }}>
          <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
          <div style={{ marginBottom:28 }}>
            <h1 style={ADMIN_STYLES.h1}>Subscription</h1>
            <p style={ADMIN_STYLES.sub}>Manage your plan and billing</p>
          </div>

          {loading ? (
            <div style={{ display:'flex', justifyContent:'center', paddingTop:60 }}>
              <div style={{ width:32, height:32, border:`3px solid ${T.danger}`, borderTopColor:'transparent', borderRadius:'50%', animation:'spin 0.8s linear infinite' }} />
            </div>
          ) : (<>
            {/* Current plan */}
            <div style={{ ...ADMIN_STYLES.card, padding:28, marginBottom:28, borderLeft:`4px solid ${isExpired?'#F4A0B0':timeColor}` }}>
              <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', marginBottom:20 }}>
                <div>
                  <div style={{ fontSize:11, fontWeight:600, color:`rgba(38,52,49,0.4)`, letterSpacing:'0.07em', textTransform:'uppercase', marginBottom:6 }}>Current Plan</div>
                  <div style={{ fontFamily:T.fontDisplay, fontWeight:700, fontSize:28, color:T.ink }}>{currentPlan.name}</div>
                  {subEnd && (
                    <div style={{ fontSize:13, marginTop:4, color: isExpired?T.danger:`rgba(38,52,49,0.5)` }}>
                      {isExpired ? '⚠️ Expired on ' : 'Renews on '}{subEnd}
                    </div>
                  )}
                </div>
                <div style={{ display:'flex', flexDirection:'column', alignItems:'flex-end', gap:8 }}>
                  <span style={{ padding:'6px 16px', borderRadius:T.radiusPill, fontSize:12, fontWeight:700, background:isActive?`rgba(143,196,168,0.2)`:`rgba(244,160,176,0.2)`, color:isActive?'#1A5A38':'#8B1A2A', border:`1px solid ${isActive?'rgba(143,196,168,0.4)':'rgba(244,160,176,0.4)'}` }}>
                    {isActive ? '● Active' : '● Inactive'}
                  </span>
                  {daysRemaining !== null && !isExpired && (
                    <div style={{ textAlign:'right' }}>
                      <span style={{ fontFamily:T.font, fontWeight:700, fontSize:24, color:timeColor }}>{daysRemaining}</span>
                      <span style={{ fontSize:11, color:`rgba(38,52,49,0.4)`, marginLeft:4 }}>days left</span>
                    </div>
                  )}
                  {isExpired && (
                    <div style={{ padding:'6px 14px', borderRadius:T.radiusBtn, background:`rgba(138,74,66,0.1)`, border:`1px solid rgba(138,74,66,0.3)`, fontSize:12, fontWeight:700, color:T.danger }}>
                      ⚠️ Plan Expired
                    </div>
                  )}
                </div>
              </div>

              {/* Time remaining bar */}
              {subEnd && (
                <div style={{ marginBottom:20 }}>
                  <div style={{ display:'flex', justifyContent:'space-between', marginBottom:6 }}>
                    <span style={{ fontSize:12, color:`rgba(38,52,49,0.5)`, fontWeight:500 }}>Plan Duration</span>
                    <span style={{ fontSize:12, color:`rgba(38,52,49,0.4)` }}>
                      {isExpired ? 'Expired' : `${daysRemaining} of ${totalDays} days remaining`}
                    </span>
                  </div>
                  <div style={{ height:8, background:`rgba(38,52,49,0.07)`, borderRadius:99, overflow:'hidden' }}>
                    <div style={{ height:'100%', borderRadius:99, background:isExpired?'#F4A0B0':timeColor, width:`${timePct}%`, transition:'width 0.4s' }} />
                  </div>
                  {!isExpired && daysRemaining <= 30 && (
                    <div style={{ marginTop:8, padding:'8px 14px', borderRadius:T.radiusBtn, background: daysRemaining<=14?`rgba(138,74,66,0.08)`:`rgba(244,208,112,0.15)`, border:`1px solid ${daysRemaining<=14?'rgba(138,74,66,0.25)':'rgba(244,208,112,0.4)'}`, fontSize:12, color: daysRemaining<=14?T.danger:'#8B6020', fontWeight:600 }}>
                      {daysRemaining <= 14 ? '⚠️ Renew soon — your plan expires in ' : '📅 Your plan expires in '}
                      <strong>{daysRemaining} days</strong>. Upgrade below to continue uninterrupted access.
                    </div>
                  )}
                </div>
              )}

              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16 }}>
                <UsageBar label="AR Items"  used={restaurant?.itemsUsed||0}      max={restaurant?.maxItems||currentPlan.items} />
                <UsageBar label="Storage"   used={restaurant?.storageUsedMB||0}  max={restaurant?.maxStorageMB||currentPlan.storage} unit="MB" />
              </div>
            </div>

            {/* Plan cards */}
            <div style={{ fontFamily:T.fontDisplay, fontWeight:700, fontSize:20, color:T.ink, marginBottom:16, letterSpacing:'-0.3px' }}>Upgrade Plan</div>
            <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:16 }}>
              {PLANS.map(plan => {
                const isCurrent = plan.id === restaurant?.plan;
                return (
                  <div key={plan.id} style={{ ...ADMIN_STYLES.card, padding:26, position:'relative', border: plan.popular ? `2px solid rgba(196,168,109,0.45)` : `1px solid ${T.sand}`, background: isCurrent ? T.accentSubtle : T.white }}>
                    {plan.popular && (
                      <div style={{ position:'absolute', top:-14, left:'50%', transform:'translateX(-50%)', padding:'5px 16px', background:`linear-gradient(135deg,${T.warning},#D4B87D)`, color:T.white, fontSize:11, fontWeight:700, borderRadius:T.radiusPill, whiteSpace:'nowrap', boxShadow:`0 4px 12px rgba(196,168,109,0.4)`, letterSpacing:'0.03em' }}>✦ Popular</div>
                    )}
                    {isCurrent && (
                      <div style={{ position:'absolute', top:14, right:14, padding:'3px 10px', background:`rgba(143,196,168,0.2)`, color:'#1A5A38', fontSize:10, fontWeight:700, borderRadius:20, border:`1px solid rgba(143,196,168,0.4)` }}>Current</div>
                    )}
                    <div style={{ fontFamily:T.fontDisplay, fontWeight:700, fontSize:18, color:T.ink, marginBottom:8 }}>{plan.name}</div>
                    <div style={{ display:'flex', alignItems:'baseline', gap:4, marginBottom:20 }}>
                      <span style={{ fontFamily:T.font, fontWeight:700, fontSize:32, color:T.ink, letterSpacing:'-0.5px' }}>₹{plan.price.toLocaleString()}</span>
                      <span style={{ fontSize:12, color:`rgba(38,52,49,0.4)`, fontFamily:T.font }}>/ {plan.period}</span>
                    </div>
                    <div style={{ display:'flex', flexDirection:'column', gap:9, marginBottom:24 }}>
                      {[`${plan.items} AR items`, `${plan.storage>=1024?plan.storage/1024+'GB':plan.storage+'MB'} storage`, 'Analytics', 'QR code & subdomain'].map(f=>(
                        <div key={f} style={{ display:'flex', alignItems:'center', gap:8, fontSize:13, color:`rgba(38,52,49,0.65)`, fontFamily:T.font }}>
                          <span style={{ width:16, height:16, borderRadius:5, background:`rgba(74,122,94,0.12)`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:8, color:T.success, fontWeight:700, flexShrink:0 }}>✓</span>
                          {f}
                        </div>
                      ))}
                    </div>
                    <button
                      onClick={()=>!isCurrent&&handleUpgrade(plan)}
                      disabled={isCurrent||paying===plan.id}
                      style={{ width:'100%', padding:'13px', borderRadius:12, fontSize:14, fontFamily:T.font, fontWeight:600, border:'none', cursor:isCurrent?'default':'pointer', transition:'all 0.2s', letterSpacing:'0.02em', background: isCurrent?`rgba(38,52,49,0.06)`:plan.popular?`linear-gradient(135deg,${T.warning},#D4B87D)`:T.accent, color: isCurrent?`rgba(38,52,49,0.4)`:T.white, opacity:paying===plan.id?0.7:1, boxShadow: isCurrent?'none':plan.popular?`0 4px 16px rgba(196,168,109,0.35)`:T.shadowBtn }}
                    >
                      {isCurrent ? 'Current Plan' : paying===plan.id ? 'Opening…' : 'Upgrade'}
                    </button>
                  </div>
                );
              })}
            </div>
          </>)}
        </div>
      </div>
    </AdminLayout>
  );
}
AdminSubscription.getLayout = (page) => page;

function UsageBar({ label, used, max, unit='' }) {
  const pct = Math.min(100, Math.round((used/max)*100));
  const color = pct > 80 ? T.danger : pct > 60 ? T.warning : T.success;
  return (
    <div>
      <div style={{ display:'flex', justifyContent:'space-between', marginBottom:8 }}>
        <span style={{ fontSize:12, color:`rgba(38,52,49,0.5)`, fontWeight:500 }}>{label}</span>
        <span style={{ fontSize:12, color:`rgba(38,52,49,0.4)` }}>{used}{unit} / {max}{unit}</span>
      </div>
      <div style={{ height:6, background:`rgba(38,52,49,0.07)`, borderRadius:99, overflow:'hidden' }}>
        <div style={{ height:'100%', borderRadius:99, background:color, width:`${pct}%`, transition:'width 0.4s' }} />
      </div>
    </div>
  );
}
