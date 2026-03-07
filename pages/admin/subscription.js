import Head from 'next/head';
import { useEffect, useState } from 'react';
import { useAuth } from '../../hooks/useAuth';
import AdminLayout from '../../components/layout/AdminLayout';
import { getRestaurantById } from '../../lib/db';
import toast from 'react-hot-toast';

const PLANS = [
  { id:'basic',   name:'Basic',   price:999,  items:10,  storage:500,  period:'6 months' },
  { id:'pro',     name:'Pro',     price:2499, items:40,  storage:2048, period:'6 months', popular:true },
  { id:'premium', name:'Premium', price:4999, items:100, storage:5120, period:'6 months' },
];

const G = { card:'rgba(255,255,255,0.03)', border:'rgba(255,255,255,0.07)', gold:'#B8962E', text:'rgba(255,255,255,0.82)', textDim:'rgba(255,255,255,0.32)' };

export default function AdminSubscription() {
  const { userData } = useAuth();
  const [restaurant, setRestaurant] = useState(null);
  const [loading, setLoading] = useState(true);
  const [paying, setPaying] = useState(null);
  const rid = userData?.restaurantId;

  useEffect(() => { if (!rid) return; getRestaurantById(rid).then(r=>{setRestaurant(r);setLoading(false);}); }, [rid]);

  const handleUpgrade = async (plan) => {
    if (!window.Razorpay) { toast.error('Payment system not loaded. Please refresh.'); return; }
    setPaying(plan.id);
    try {
      const res  = await fetch('/api/payments/create-order', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({planId:plan.id,restaurantId:rid})});
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
          await fetch('/api/payments/verify',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...response,planId:plan.id,restaurantId:rid})});
          toast.success(`Upgraded to ${plan.name} plan!`);
          setRestaurant(await getRestaurantById(rid));
        },
        prefill:  { email: userData?.email || '' },
        theme:    { color: '#B8962E' },
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
  const daysRemaining = subEnd ? Math.max(0, Math.ceil((new Date(subEnd) - new Date()) / (1000*60*60*24))) : null;
  const totalDays = (subStart && subEnd) ? Math.ceil((new Date(subEnd) - new Date(subStart)) / (1000*60*60*24)) : 180;
  const usedDays  = totalDays - (daysRemaining || 0);
  const timePct   = Math.min(100, Math.round((usedDays / totalDays) * 100));
  const timeColor = daysRemaining === null ? G.gold : daysRemaining <= 14 ? '#E05555' : daysRemaining <= 30 ? '#C8A030' : G.gold;

  return (
    <AdminLayout>
      <Head>
        <title>Subscription — Advert Radical</title>
        <script src="https://checkout.razorpay.com/v1/checkout.js"/>
      </Head>
      <div style={{minHeight:'100vh',padding:'32px 36px',fontFamily:`'Bricolage Grotesque',Inter,sans-serif`}}>
        <div style={{maxWidth:880,margin:'0 auto'}}>
          <style>{`@keyframes spin{to{transform:rotate(360deg)}} *{box-sizing:border-box}`}</style>
          <div style={{marginBottom:28}}>
            <h1 style={{fontWeight:800,fontSize:22,color:'rgba(255,255,255,0.88)',margin:0,letterSpacing:'-0.02em'}}>Subscription</h1>
            <p style={{fontSize:13,color:G.textDim,marginTop:4}}>Manage your plan and billing</p>
          </div>

          {loading ? (
            <div style={{display:'flex',justifyContent:'center',paddingTop:60}}>
              <div style={{width:32,height:32,border:`2px solid ${G.gold}`,borderTopColor:'transparent',borderRadius:'50%',animation:'spin 0.8s linear infinite'}}/>
            </div>
          ) : (<>
            {/* Current plan */}
            <div style={{background:G.card,border:`1px solid ${G.border}`,borderLeft:`3px solid ${isExpired?'#E05555':timeColor}`,borderRadius:12,padding:28,marginBottom:24}}>
              <div style={{display:'flex',alignItems:'flex-start',justifyContent:'space-between',marginBottom:20}}>
                <div>
                  <div style={{fontSize:11,fontWeight:600,color:G.textDim,letterSpacing:'0.08em',textTransform:'uppercase',marginBottom:6,fontFamily:`'DM Mono',monospace`}}>Current Plan</div>
                  <div style={{fontWeight:800,fontSize:26,color:'rgba(255,255,255,0.88)',letterSpacing:'-0.02em'}}>{currentPlan.name}</div>
                  {subEnd && <div style={{fontSize:13,marginTop:4,color:isExpired?'#E05555':G.textDim,fontFamily:`'DM Mono',monospace`}}>{isExpired?'Expired on ':'Renews on '}{subEnd}</div>}
                </div>
                <div style={{display:'flex',flexDirection:'column',alignItems:'flex-end',gap:8}}>
                  <span style={{padding:'5px 14px',borderRadius:20,fontSize:11,fontWeight:600,background:isActive?'rgba(60,160,80,0.1)':'rgba(220,60,60,0.1)',color:isActive?'#5DC87A':'#E05555',border:`1px solid ${isActive?'rgba(60,160,80,0.25)':'rgba(220,60,60,0.25)'}`,fontFamily:`'DM Mono',monospace`}}>
                    {isActive?'● Active':'● Inactive'}
                  </span>
                  {daysRemaining !== null && !isExpired && (
                    <div style={{textAlign:'right'}}>
                      <span style={{fontWeight:800,fontSize:22,color:timeColor,fontFamily:`'DM Mono',monospace`}}>{daysRemaining}</span>
                      <span style={{fontSize:11,color:G.textDim,marginLeft:4}}>days left</span>
                    </div>
                  )}
                </div>
              </div>

              {subEnd && (
                <div style={{marginBottom:20}}>
                  <div style={{display:'flex',justifyContent:'space-between',marginBottom:6}}>
                    <span style={{fontSize:12,color:G.textDim}}>Plan Duration</span>
                    <span style={{fontSize:12,color:G.textDim,fontFamily:`'DM Mono',monospace`}}>{isExpired?'Expired':`${daysRemaining} of ${totalDays} days remaining`}</span>
                  </div>
                  <div style={{height:4,background:'rgba(255,255,255,0.06)',borderRadius:2,overflow:'hidden'}}>
                    <div style={{height:'100%',borderRadius:2,background:isExpired?'#E05555':timeColor,width:`${timePct}%`,transition:'width 0.4s'}}/>
                  </div>
                  {!isExpired && daysRemaining <= 30 && (
                    <div style={{marginTop:10,padding:'9px 14px',borderRadius:8,background:daysRemaining<=14?'rgba(220,60,60,0.08)':'rgba(200,160,48,0.08)',border:`1px solid ${daysRemaining<=14?'rgba(220,60,60,0.2)':'rgba(200,160,48,0.2)'}`,fontSize:12,color:daysRemaining<=14?'#E05555':'#C8A030',fontWeight:600}}>
                      {daysRemaining<=14?'⚠ Renew soon — expires in ':'Plan expires in '}
                      <strong>{daysRemaining} days</strong>. Upgrade below to continue.
                    </div>
                  )}
                </div>
              )}

              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:16}}>
                <UsageBar label="AR Items" used={restaurant?.itemsUsed||0}     max={restaurant?.maxItems||currentPlan.items}/>
                <UsageBar label="Storage"  used={restaurant?.storageUsedMB||0} max={restaurant?.maxStorageMB||currentPlan.storage} unit="MB"/>
              </div>
            </div>

            {/* Plan cards */}
            <div style={{fontWeight:700,fontSize:14,color:G.textDim,marginBottom:14,letterSpacing:'0.06em',textTransform:'uppercase',fontFamily:`'DM Mono',monospace`}}>Upgrade Plan</div>
            <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:12}}>
              {PLANS.map(plan => {
                const isCurrent = plan.id === restaurant?.plan;
                return (
                  <div key={plan.id} style={{background:G.card,border:`1px solid ${plan.popular?'rgba(184,150,46,0.3)':G.border}`,borderRadius:12,padding:26,position:'relative',transition:'border-color 0.2s'}}>
                    {plan.popular && (
                      <div style={{position:'absolute',top:-12,left:'50%',transform:'translateX(-50%)',padding:'4px 14px',background:'rgba(184,150,46,0.15)',border:'1px solid rgba(184,150,46,0.3)',color:G.gold,fontSize:10,fontWeight:700,borderRadius:20,whiteSpace:'nowrap',fontFamily:`'DM Mono',monospace`,letterSpacing:'0.06em'}}>POPULAR</div>
                    )}
                    {isCurrent && (
                      <div style={{position:'absolute',top:14,right:14,padding:'3px 10px',background:'rgba(60,160,80,0.1)',color:'#5DC87A',fontSize:10,fontWeight:600,borderRadius:20,border:'1px solid rgba(60,160,80,0.25)',fontFamily:`'DM Mono',monospace`}}>Current</div>
                    )}
                    <div style={{fontWeight:700,fontSize:16,color:'rgba(255,255,255,0.82)',marginBottom:8}}>{plan.name}</div>
                    <div style={{display:'flex',alignItems:'baseline',gap:4,marginBottom:20}}>
                      <span style={{fontWeight:800,fontSize:26,color:'rgba(255,255,255,0.88)',fontFamily:`'DM Mono',monospace`}}>₹{plan.price.toLocaleString()}</span>
                      <span style={{fontSize:12,color:G.textDim}}>/ {plan.period}</span>
                    </div>
                    <div style={{display:'flex',flexDirection:'column',gap:8,marginBottom:24}}>
                      {[`${plan.items} AR items`,`${plan.storage>=1024?plan.storage/1024+'GB':plan.storage+'MB'} storage`,'Analytics','QR code & subdomain'].map(f=>(
                        <div key={f} style={{display:'flex',alignItems:'center',gap:8,fontSize:13,color:G.textDim}}>
                          <span style={{color:G.gold,fontSize:10,fontWeight:700}}>✓</span>{f}
                        </div>
                      ))}
                    </div>
                    <button onClick={()=>!isCurrent&&handleUpgrade(plan)} disabled={isCurrent||paying===plan.id} style={{width:'100%',padding:'11px',borderRadius:8,fontSize:13,fontFamily:'inherit',fontWeight:700,border:`1px solid ${isCurrent?'rgba(255,255,255,0.07)':plan.popular?'rgba(184,150,46,0.35)':'rgba(255,255,255,0.12)'}`,cursor:isCurrent?'default':'pointer',transition:'all 0.2s',background:isCurrent?'transparent':plan.popular?'rgba(184,150,46,0.1)':'rgba(255,255,255,0.04)',color:isCurrent?G.textDim:plan.popular?G.gold:'rgba(255,255,255,0.7)',opacity:paying===plan.id?0.6:1}}>
                      {isCurrent?'Current Plan':paying===plan.id?'Opening…':'Upgrade →'}
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
  const color = pct > 80 ? '#E05555' : pct > 60 ? '#C8A030' : '#B8962E';
  return (
    <div>
      <div style={{display:'flex',justifyContent:'space-between',marginBottom:7}}>
        <span style={{fontSize:12,color:'rgba(255,255,255,0.5)',fontWeight:500}}>{label}</span>
        <span style={{fontSize:12,color:'rgba(255,255,255,0.32)',fontFamily:`'DM Mono',monospace`}}>{used}{unit} / {max}{unit}</span>
      </div>
      <div style={{height:4,background:'rgba(255,255,255,0.06)',borderRadius:2,overflow:'hidden'}}>
        <div style={{height:'100%',borderRadius:2,background:color,width:`${pct}%`,transition:'width 0.4s'}}/>
      </div>
    </div>
  );
}
