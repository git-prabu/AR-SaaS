import Head from 'next/head';
import { useEffect, useState, useRef } from 'react';
import { useAuth } from '../../hooks/useAuth';
import AdminLayout from '../../components/layout/AdminLayout';
import { getRestaurantById } from '../../lib/db';
import toast from 'react-hot-toast';

const PLANS = [
  { id:'basic',   name:'Basic',   price:999,  items:10,  storage:500,  period:'6 months' },
  { id:'pro',     name:'Pro',     price:2499, items:40,  storage:2048, period:'6 months', popular:true },
  { id:'premium', name:'Premium', price:4999, items:100, storage:5120, period:'6 months' },
];

// Metallic tier definitions
const METALS = {
  basic:   {
    name:'Silver',
    bg:'linear-gradient(135deg,#8E9EAB 0%,#C8D6DF 35%,#FFFFFF 50%,#C0CFD8 65%,#8E9EAB 100%)',
    sheenColor:'rgba(255,255,255,0.55)',
    glow:'rgba(180,200,215,0.5)',
    label:'rgba(60,80,90,0.8)',
    accent:'#5A7A8A',
    badge:'#B0C4CE',
    badgeText:'#2A4050',
    border:'rgba(180,200,215,0.6)',
    icon:'🥈',
  },
  pro:     {
    name:'Gold',
    bg:'linear-gradient(135deg,#B8860B 0%,#DAA520 25%,#FFD700 45%,#FFFACD 50%,#FFD700 55%,#DAA520 75%,#B8860B 100%)',
    sheenColor:'rgba(255,255,200,0.6)',
    glow:'rgba(218,165,32,0.6)',
    label:'rgba(100,70,0,0.85)',
    accent:'#8B6914',
    badge:'#DAA520',
    badgeText:'#3A2800',
    border:'rgba(218,165,32,0.7)',
    icon:'🥇',
  },
  premium: {
    name:'Platinum',
    bg:'linear-gradient(135deg,#9E9E9E 0%,#CFCFCF 25%,#F8F8FF 45%,#FFFFFF 50%,#F0F0FF 55%,#CFCFCF 75%,#9E9E9E 100%)',
    sheenColor:'rgba(230,230,255,0.65)',
    glow:'rgba(180,180,220,0.55)',
    label:'rgba(50,50,70,0.85)',
    accent:'#6060A0',
    badge:'#B0B0D0',
    badgeText:'#1A1A3A',
    border:'rgba(180,180,220,0.65)',
    icon:'💎',
  },
};

const S = {
  h1:   { fontFamily:'Poppins,sans-serif', fontWeight:800, fontSize:22, color:'#1E1B18', margin:0 },
  sub:  { fontSize:13, color:'rgba(42,31,16,0.45)', marginTop:4 },
};

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
        theme:    { color: '#E05A3A' },
      };
      new window.Razorpay(options).open();
    } catch { toast.error('Payment failed. Try again.'); }
    finally { setPaying(null); }
  };

  // Reflective card handlers
  const handleCardMove = (e) => {
    const card = e.currentTarget;
    const rect = card.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const cx = rect.width / 2;
    const cy = rect.height / 2;
    const rotX = ((y - cy) / cy) * -10;
    const rotY = ((x - cx) / cx) * 10;
    card.style.transform = `perspective(900px) rotateX(${rotX}deg) rotateY(${rotY}deg) scale(1.03)`;
    card.style.transition = 'transform 0.05s ease';
    const sheen = card.querySelector('.card-sheen');
    if (sheen) {
      const px = (x / rect.width) * 100;
      const py = (y / rect.height) * 100;
      sheen.style.background = `radial-gradient(circle at ${px}% ${py}%, ${card.dataset.sheen} 0%, transparent 65%)`;
      sheen.style.opacity = '1';
    }
  };
  const handleCardLeave = (e) => {
    const card = e.currentTarget;
    card.style.transform = '';
    card.style.transition = 'transform 0.4s cubic-bezier(0.34,1.56,0.64,1)';
    const sheen = card.querySelector('.card-sheen');
    if (sheen) sheen.style.opacity = '0';
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
  const timeColor = daysRemaining === null ? '#8FC4A8' : daysRemaining <= 14 ? '#E05A3A' : daysRemaining <= 30 ? '#F4D070' : '#8FC4A8';

  return (
    <AdminLayout>
      <Head>
        <title>Subscription — Advert Radical</title>
        <script src="https://checkout.razorpay.com/v1/checkout.js" />
      </Head>
      <div style={{ background:'#F2F0EC', minHeight:'100vh', padding:32, fontFamily:'Inter,sans-serif' }}>
        <div style={{ maxWidth:880, margin:'0 auto' }}>
          <style>{`
            @keyframes spin{to{transform:rotate(360deg)}}
            @keyframes metalShimmer {
              0%   { background-position: -300% center; }
              100% { background-position: 300% center; }
            }
            @keyframes cardFloat {
              0%,100% { transform: translateY(0px); }
              50%     { transform: translateY(-4px); }
            }
            .reflect-card {
              position: relative;
              border-radius: 24px;
              padding: 28px;
              cursor: default;
              transition: transform 0.4s cubic-bezier(0.34,1.56,0.64,1), box-shadow 0.3s ease;
              overflow: hidden;
              will-change: transform;
            }
            .reflect-card:hover {
              box-shadow: 0 24px 60px rgba(0,0,0,0.25) !important;
            }
            .card-sheen {
              position: absolute;
              inset: 0;
              border-radius: 24px;
              opacity: 0;
              transition: opacity 0.15s ease;
              pointer-events: none;
              z-index: 1;
            }
            .card-content {
              position: relative;
              z-index: 2;
            }
            .metal-label {
              font-size: 10px;
              font-weight: 800;
              letter-spacing: 0.12em;
              text-transform: uppercase;
              margin-bottom: 6px;
            }
            .plan-btn {
              width: 100%;
              padding: 12px;
              border-radius: 12px;
              font-size: 14px;
              font-family: Poppins, sans-serif;
              font-weight: 700;
              border: none;
              cursor: pointer;
              transition: all 0.18s;
            }
          `}</style>
          <div style={{ marginBottom:28 }}>
            <h1 style={S.h1}>Subscription</h1>
            <p style={S.sub}>Manage your plan and billing</p>
          </div>

          {loading ? (
            <div style={{ display:'flex', justifyContent:'center', paddingTop:60 }}>
              <div style={{ width:32, height:32, border:'3px solid #E05A3A', borderTopColor:'transparent', borderRadius:'50%', animation:'spin 0.8s linear infinite' }} />
            </div>
          ) : (<>
            {/* Current plan */}
            <div style={{ background:'#FFFFFF', border:'1px solid rgba(42,31,16,0.07)', borderRadius:20, boxShadow:'0 2px 14px rgba(42,31,16,0.06)', padding:28, marginBottom:28, borderLeft:`4px solid ${isExpired?'#F4A0B0':timeColor}` }}>
              <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', marginBottom:20 }}>
                <div>
                  <div style={{ fontSize:11, fontWeight:600, color:'rgba(42,31,16,0.4)', letterSpacing:'0.07em', textTransform:'uppercase', marginBottom:6 }}>Current Plan</div>
                  <div style={{ fontFamily:'Poppins,sans-serif', fontWeight:800, fontSize:26, color:'#1E1B18' }}>{currentPlan.name}</div>
                  {subEnd && (
                    <div style={{ fontSize:13, marginTop:4, color: isExpired?'#C04A28':'rgba(42,31,16,0.5)' }}>
                      {isExpired ? '⚠️ Expired on ' : 'Renews on '}{subEnd}
                    </div>
                  )}
                </div>
                <div style={{ display:'flex', flexDirection:'column', alignItems:'flex-end', gap:8 }}>
                  <span style={{ padding:'6px 16px', borderRadius:30, fontSize:12, fontWeight:700, background:isActive?'rgba(143,196,168,0.2)':'rgba(244,160,176,0.2)', color:isActive?'#1A5A38':'#8B1A2A', border:`1px solid ${isActive?'rgba(143,196,168,0.4)':'rgba(244,160,176,0.4)'}` }}>
                    {isActive ? '● Active' : '● Inactive'}
                  </span>
                  {daysRemaining !== null && !isExpired && (
                    <div style={{ textAlign:'right' }}>
                      <span style={{ fontFamily:'Poppins,sans-serif', fontWeight:800, fontSize:22, color:timeColor }}>{daysRemaining}</span>
                      <span style={{ fontSize:11, color:'rgba(42,31,16,0.4)', marginLeft:4 }}>days left</span>
                    </div>
                  )}
                  {isExpired && (
                    <div style={{ padding:'6px 14px', borderRadius:10, background:'rgba(224,90,58,0.1)', border:'1px solid rgba(224,90,58,0.3)', fontSize:12, fontWeight:700, color:'#C04A28' }}>
                      ⚠️ Plan Expired
                    </div>
                  )}
                </div>
              </div>

              {subEnd && (
                <div style={{ marginBottom:20 }}>
                  <div style={{ display:'flex', justifyContent:'space-between', marginBottom:6 }}>
                    <span style={{ fontSize:12, color:'rgba(42,31,16,0.5)', fontWeight:500 }}>Plan Duration</span>
                    <span style={{ fontSize:12, color:'rgba(42,31,16,0.4)' }}>
                      {isExpired ? 'Expired' : `${daysRemaining} of ${totalDays} days remaining`}
                    </span>
                  </div>
                  <div style={{ height:8, background:'rgba(42,31,16,0.07)', borderRadius:99, overflow:'hidden' }}>
                    <div style={{ height:'100%', borderRadius:99, background:isExpired?'#F4A0B0':timeColor, width:`${timePct}%`, transition:'width 0.4s' }} />
                  </div>
                  {!isExpired && daysRemaining <= 30 && (
                    <div style={{ marginTop:8, padding:'8px 14px', borderRadius:10, background: daysRemaining<=14?'rgba(224,90,58,0.08)':'rgba(244,208,112,0.15)', border:`1px solid ${daysRemaining<=14?'rgba(224,90,58,0.25)':'rgba(244,208,112,0.4)'}`, fontSize:12, color: daysRemaining<=14?'#C04A28':'#8B6020', fontWeight:600 }}>
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

            {/* ── REFLECTIVE PLAN CARDS ── */}
            <div style={{ fontFamily:'Poppins,sans-serif', fontWeight:700, fontSize:16, color:'#1E1B18', marginBottom:16 }}>Upgrade Plan</div>
            <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:20 }}>
              {PLANS.map(plan => {
                const isCurrent = plan.id === restaurant?.plan;
                const metal = METALS[plan.id];
                return (
                  <div
                    key={plan.id}
                    className="reflect-card"
                    data-sheen={metal.sheenColor}
                    onMouseMove={handleCardMove}
                    onMouseLeave={handleCardLeave}
                    style={{
                      background: metal.bg,
                      border: `1.5px solid ${metal.border}`,
                      boxShadow: `0 8px 32px ${metal.glow}, 0 2px 8px rgba(0,0,0,0.12)`,
                    }}
                  >
                    {/* Moving sheen overlay */}
                    <div className="card-sheen" />

                    <div className="card-content">
                      {/* Metal tier badge */}
                      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:16 }}>
                        <div style={{ display:'flex', alignItems:'center', gap:7 }}>
                          <span style={{ fontSize:20 }}>{metal.icon}</span>
                          <div>
                            <div className="metal-label" style={{ color:metal.label }}>{metal.name}</div>
                            <div style={{ fontFamily:'Poppins,sans-serif', fontWeight:800, fontSize:17, color:metal.label }}>{plan.name}</div>
                          </div>
                        </div>
                        {isCurrent && (
                          <span style={{ padding:'3px 10px', background:metal.badge, color:metal.badgeText, fontSize:10, fontWeight:700, borderRadius:20 }}>Current</span>
                        )}
                        {plan.popular && !isCurrent && (
                          <span style={{ padding:'3px 10px', background:metal.badge, color:metal.badgeText, fontSize:10, fontWeight:700, borderRadius:20 }}>✦ Popular</span>
                        )}
                      </div>

                      {/* Price */}
                      <div style={{ display:'flex', alignItems:'baseline', gap:4, marginBottom:20 }}>
                        <span style={{ fontFamily:'Poppins,sans-serif', fontWeight:900, fontSize:30, color:metal.label }}>₹{plan.price.toLocaleString()}</span>
                        <span style={{ fontSize:12, color:metal.accent }}>/ {plan.period}</span>
                      </div>

                      {/* Features */}
                      <div style={{ display:'flex', flexDirection:'column', gap:9, marginBottom:24 }}>
                        {[`${plan.items} AR items`, `${plan.storage>=1024?plan.storage/1024+'GB':plan.storage+'MB'} storage`, 'Analytics', 'QR code & subdomain'].map(f => (
                          <div key={f} style={{ display:'flex', alignItems:'center', gap:8, fontSize:13, color:metal.label }}>
                            <span style={{ width:16, height:16, borderRadius:5, background:'rgba(0,0,0,0.1)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:8, color:metal.accent, fontWeight:700, flexShrink:0 }}>✓</span>
                            {f}
                          </div>
                        ))}
                      </div>

                      {/* CTA Button */}
                      <button
                        className="plan-btn"
                        onClick={() => !isCurrent && handleUpgrade(plan)}
                        disabled={isCurrent || paying === plan.id}
                        style={{
                          background: isCurrent ? 'rgba(0,0,0,0.08)' : `rgba(0,0,0,0.15)`,
                          color: isCurrent ? metal.accent : metal.label,
                          border: `1.5px solid ${metal.border}`,
                          backdropFilter: 'blur(4px)',
                          cursor: isCurrent ? 'default' : 'pointer',
                          opacity: paying === plan.id ? 0.7 : 1,
                          fontWeight: 700,
                        }}
                      >
                        {isCurrent ? 'Current Plan' : paying === plan.id ? 'Opening…' : `Upgrade to ${metal.name}`}
                      </button>
                    </div>
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
  const color = pct > 80 ? '#E05A3A' : pct > 60 ? '#F4D070' : '#8FC4A8';
  return (
    <div>
      <div style={{ display:'flex', justifyContent:'space-between', marginBottom:8 }}>
        <span style={{ fontSize:12, color:'rgba(42,31,16,0.5)', fontWeight:500 }}>{label}</span>
        <span style={{ fontSize:12, color:'rgba(42,31,16,0.4)' }}>{used}{unit} / {max}{unit}</span>
      </div>
      <div style={{ height:6, background:'rgba(42,31,16,0.07)', borderRadius:99, overflow:'hidden' }}>
        <div style={{ height:'100%', borderRadius:99, background:color, width:`${pct}%`, transition:'width 0.4s' }} />
      </div>
    </div>
  );
}
