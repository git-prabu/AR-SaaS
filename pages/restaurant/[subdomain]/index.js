import Head from 'next/head';
import { useState, useEffect, useCallback, useRef } from 'react';
import { getRestaurantBySubdomain, getMenuItems, getActiveOffers, trackVisit, incrementItemView, incrementARView } from '../../../lib/db';
import { ARViewerEmbed } from '../../../components/ARViewer';

function getSessionId() {
  if (typeof window === 'undefined') return 'ssr';
  let sid = sessionStorage.getItem('ar_sid');
  if (!sid) { sid = Math.random().toString(36).substr(2, 16); sessionStorage.setItem('ar_sid', sid); }
  return sid;
}

const FOOD_PLACEHOLDERS = [
  'https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?w=800&q=85',
  'https://images.unsplash.com/photo-1504674900247-0877df9cc836?w=800&q=85',
  'https://images.unsplash.com/photo-1540189549336-e6e99c3679fe?w=800&q=85',
  'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=800&q=85',
  'https://images.unsplash.com/photo-1567620905732-2d1ec7ab7445?w=800&q=85',
  'https://images.unsplash.com/photo-1565958011703-44f9829ba187?w=800&q=85',
  'https://images.unsplash.com/photo-1512621776951-a57141f2eefd?w=800&q=85',
  'https://images.unsplash.com/photo-1482049016688-2d3e1b311543?w=800&q=85',
];
const HERO_FALLBACK = 'https://images.unsplash.com/photo-1414235077428-338989a2e8c0?w=1400&q=90';

function getPlaceholder(id) {
  let h = 0;
  for (let i = 0; i < (id||'').length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return FOOD_PLACEHOLDERS[h % FOOD_PLACEHOLDERS.length];
}

const SPICE_MAP = {
  Mild:        { label:'Mild',       color:'#D4920A', bg:'rgba(212,146,10,0.15)',  dot:'🟡' },
  Medium:      { label:'Medium',     color:'#E07820', bg:'rgba(224,120,32,0.15)',  dot:'🟠' },
  Spicy:       { label:'Spicy',      color:'#E04030', bg:'rgba(224,64,48,0.15)',   dot:'🔴' },
  'Very Spicy':{ label:'Very Spicy', color:'#C02020', bg:'rgba(192,32,32,0.15)',   dot:'🔴' },
};

function catIcon(name) {
  const n = (name||'').toLowerCase();
  if (n==='all') return '◈';
  if (n.includes('starter')||n.includes('appetizer')) return '🥗';
  if (n.includes('main'))    return '🍛';
  if (n.includes('burger'))  return '🍔';
  if (n.includes('pizza'))   return '🍕';
  if (n.includes('pasta')||n.includes('noodle')) return '🍝';
  if (n.includes('dessert')||n.includes('sweet')) return '🍰';
  if (n.includes('drink')||n.includes('beverage')||n.includes('juice')) return '🥤';
  if (n.includes('coffee')||n.includes('tea')) return '☕';
  if (n.includes('breakfast')) return '🥞';
  if (n.includes('seafood')||n.includes('fish')) return '🐟';
  if (n.includes('chicken')) return '🍗';
  if (n.includes('rice')||n.includes('biryani')) return '🍚';
  if (n.includes('salad'))   return '🥙';
  if (n.includes('soup'))    return '🍲';
  if (n.includes('snack'))   return '🍿';
  if (n.includes('special')||n.includes('chef')) return '⭐';
  return '🍽️';
}

// ── Smart Menu Assistant ──────────────────────────────────────────
const SOLO_QUESTIONS = [
  { id:'diet',   emoji:'🌿', q:"Any dietary preference?",   sub:"We'll only show dishes that match",
    opts:[{l:'Vegetarian',v:'veg',e:'🌿'},{l:'Non-Vegetarian',v:'nonveg',e:'🍗'},{l:'No Preference',v:'any',e:'✌️'}] },
  { id:'mood',   emoji:'✨', q:"What's your mood today?",   sub:"Pick what sounds good right now",
    opts:[{l:'Comfort Food',v:'comfort',e:'🍲'},{l:'Something Healthy',v:'healthy',e:'🥦'},{l:'Most Popular',v:'popular',e:'🔥'},{l:'Try Something New',v:'new',e:'🌟'}] },
  { id:'spice',  emoji:'🌶️', q:"How spicy do you like it?", sub:"We'll match your spice tolerance",
    opts:[{l:'Mild / No Spice',v:'mild',e:'😌'},{l:'Medium',v:'medium',e:'😄'},{l:'Spicy',v:'spicy',e:'🥵'},{l:'Any Level',v:'any',e:'🤷'}] },
  { id:'size',   emoji:'🍽️', q:"How hungry are you?",       sub:"Choose your meal size",
    opts:[{l:'Light Bite',v:'light',e:'🥗'},{l:'Regular Meal',v:'regular',e:'🍛'},{l:'Feast Mode',v:'heavy',e:'🤤'},{l:'Anything',v:'any',e:'👌'}] },
  { id:'budget', emoji:'💰', q:"Budget per dish?",           sub:"Pick a price range",
    opts:[{l:'Under ₹200',v:'budget',e:'💵'},{l:'₹200–₹500',v:'mid',e:'💳'},{l:'₹500+',v:'premium',e:'💎'},{l:'No Limit',v:'any',e:'🤑'}] },
];
const GROUP_QUESTIONS = [
  { id:'diet',   emoji:'🌿', q:"Anyone vegetarian at the table?", sub:"We'll make sure no one is left out",
    opts:[{l:'Yes — keep it veg friendly',v:'veg',e:'🌿'},{l:'No, we eat everything',v:'any',e:'🍗'},{l:'Mix — include both',v:'mixed',e:'✌️'}] },
  { id:'spice',  emoji:'🌶️', q:"Group's spice limit?",           sub:"Pick the lowest tolerance in the group",
    opts:[{l:'Keep it mild for everyone',v:'mild',e:'😌'},{l:'Medium is fine',v:'medium',e:'😄'},{l:'We all love it spicy',v:'spicy',e:'🥵'},{l:'No limit',v:'any',e:'🤷'}] },
  { id:'style',  emoji:'🤝', q:"How is the group ordering?",     sub:"Helps us suggest the right portions",
    opts:[{l:'Everyone orders their own',v:'individual',e:'🍽️'},{l:'Sharing dishes together',v:'sharing',e:'🤲'},{l:'Mix of both',v:'mix',e:'🔄'}] },
  { id:'mood',   emoji:'✨', q:"What's the vibe today?",         sub:"Pick the general mood of the group",
    opts:[{l:'Comfort & classics',v:'comfort',e:'🍲'},{l:'Light & healthy',v:'healthy',e:'🥦'},{l:'Go with what is popular',v:'popular',e:'🔥'},{l:'Explore something new',v:'new',e:'🌟'}] },
  { id:'budget', emoji:'💰', q:"Budget per person?",             sub:"Per head, not total",
    opts:[{l:'Under ₹200 per head',v:'budget',e:'💵'},{l:'₹200–₹500 per head',v:'mid',e:'💳'},{l:'₹500+ per head',v:'premium',e:'💎'},{l:'No limit',v:'any',e:'🤑'}] },
];
const GROUP_SIZES = [{n:2,e:'👫'},{n:3,e:'👨‍👩‍👦'},{n:4,e:'👨‍👩‍👧‍👦'},{n:5,e:'🧑‍🤝‍🧑'},{n:'6+',e:'🎉'}];

const LIGHT_CATS = ['starter','salad','soup','snack','drink','beverage','dessert'];
const HEAVY_CATS = ['main','burger','pasta','pizza','biryani','thali','grill','rice'];
const SHARING_KW = ['platter','sharing','family','large','combo','bucket','plate','thali','spread','feast'];
const HEALTHY_KW = ['salad','grilled','steamed','healthy','light','vegan','fresh','oat','quinoa','fruit'];
const COMFORT_KW = ['butter','cheese','cream','fried','crispy','masala','curry','rich','loaded','classic','special'];

function isShareable(item) {
  const txt = `${item.name||''} ${item.description||''} ${item.category||''}`.toLowerCase();
  return SHARING_KW.some(k => txt.includes(k));
}
function scoreItem(item, ans, groupSize=1) {
  let s = 0;
  const txt = `${item.name||''} ${item.description||''} ${item.category||''}`.toLowerCase();
  const cat = (item.category||'').toLowerCase();
  const sp  = item.spiceLevel || 'None';
  const pr  = item.price ? Number(item.price) : null;
  const big = typeof groupSize === 'number' ? groupSize >= 4 : true;
  if (ans.diet==='veg'    && item.isVeg===false) return -999;
  if (ans.diet==='veg'    && item.isVeg===true)  s+=20;
  if (ans.diet==='mixed'  && item.isVeg===true)  s+=8;
  if (ans.diet==='nonveg' && item.isVeg===true)  s-=10;
  if (ans.spice==='mild'   && ['Spicy','Very Spicy'].includes(sp)) return -999;
  if (ans.spice==='mild'   && ['None','Mild'].includes(sp)) s+=15;
  if (ans.spice==='medium' && sp==='Medium')  s+=20;
  if (ans.spice==='spicy'  && ['Spicy','Very Spicy'].includes(sp)) s+=25;
  if (pr!==null) {
    if (ans.budget==='budget'  && pr<200)           s+=20; else if (ans.budget==='budget')  s-=15;
    if (ans.budget==='mid'     && pr>=200&&pr<=500) s+=20; else if (ans.budget==='mid')     s-=8;
    if (ans.budget==='premium' && pr>500)           s+=20; else if (ans.budget==='premium'&&pr<200) s-=10;
  }
  if (ans.size==='light') { if (LIGHT_CATS.some(l=>cat.includes(l))) s+=18; if (HEAVY_CATS.some(h=>cat.includes(h))) s-=15; }
  if (ans.size==='heavy') { if (HEAVY_CATS.some(h=>cat.includes(h))) s+=18; }
  if (ans.style==='sharing' && isShareable(item)) s+=25;
  if (big && isShareable(item)) s+=15;
  if (ans.mood==='popular') { if (item.isPopular||item.isFeatured) s+=30; }
  if (ans.mood==='healthy') { if (HEALTHY_KW.some(k=>txt.includes(k))) s+=20; if (item.calories&&item.calories<400) s+=10; }
  if (ans.mood==='comfort') { if (COMFORT_KW.some(k=>txt.includes(k))) s+=20; }
  if (ans.mood==='new')     { if (item.isFeatured) s+=25; s+=Math.floor(Math.random()*12); }
  s += Math.min((item.views||0)+(item.arViews||0)*2, 20)*0.3;
  return s;
}
function filterItems(items, ans, groupSize=1) {
  return items.map(i=>({item:i,score:scoreItem(i,ans,groupSize)})).filter(({score})=>score>-999).sort((a,b)=>b.score-a.score);
}

// ── Scroll reveal hook ───────────────────────────────────────────
function useScrollReveal(ref) {
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) { el.classList.add('revealed'); obs.disconnect(); } },
      { threshold: 0.06 }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [ref]);
}

// ── MenuCard with scroll reveal ──────────────────────────────────
function MenuCard({ item, idx, imgSrc, imgErr, setImgErr, onOpen }) {
  const ref = useRef(null);
  useScrollReveal(ref);
  const sp = SPICE_MAP[item.spiceLevel];
  return (
    <button ref={ref} className="card scroll-item" style={{transitionDelay:`${(idx%4)*0.07}s`}} onClick={()=>onOpen(item)}>
      <div className="c-img">
        <img src={!imgErr[item.id]&&item.imageURL ? item.imageURL : getPlaceholder(item.id)}
          alt={item.name} loading="lazy"
          onError={()=>setImgErr(e=>({...e,[item.id]:true}))}/>
        <div className="c-img-grd"/>
        {item.modelURL && <span className="c-ar-tag">🥽 AR</span>}
        {typeof item.isVeg==='boolean' && <span className={`vdot ${item.isVeg?'v':'nv'}`}/>}
        {item.offerBadge&&item.offerLabel && (
          <div className="c-ribbon" style={{background:item.offerColor||'#E8642A'}}>🏷 {item.offerLabel}</div>
        )}
      </div>
      <div className="c-body">
        {(item.isPopular||item.isFeatured) && (
          <div className="c-badges">
            {item.isFeatured && <span className="badge feat">⭐ Featured</span>}
            {item.isPopular  && <span className="badge pop">🔥 Popular</span>}
          </div>
        )}
        <div className="c-name">{item.name}</div>
        <div className="c-pr-row">
          {item.price    && <span className="c-price">₹{item.price}</span>}
          {item.calories && <span className="c-kcal">{item.calories} kcal</span>}
        </div>
        {(sp||item.prepTime) && (
          <div className="c-meta">
            {sp && <span className="c-spice" style={{color:sp.color,background:sp.bg}}>{sp.dot} {sp.label}</span>}
            {item.prepTime && <span className="c-prep">⏱ {item.prepTime}</span>}
          </div>
        )}
        {item.modelURL && <div className="c-arcta">View in AR →</div>}
      </div>
    </button>
  );
}

// ════════════════════════════════════════════════
export default function RestaurantMenu({ restaurant, menuItems, offers, error }) {
  const [activeCat,   setActiveCat]   = useState('All');
  const [selectedItem,setSelectedItem]= useState(null);
  const [showAR,      setShowAR]      = useState(false);
  const [imgErr,      setImgErr]      = useState({});
  const [heroLoaded,  setHeroLoaded]  = useState(false);
  const [smaOpen,     setSmaOpen]     = useState(false);
  const [smaMode,     setSmaMode]     = useState(null);
  const [groupSize,   setGroupSize]   = useState(null);
  const [smaStep,     setSmaStep]     = useState(0);
  const [smaAnswers,  setSmaAnswers]  = useState({});
  const [smaResults,  setSmaResults]  = useState([]);

  useEffect(()=>{ if(restaurant?.id) trackVisit(restaurant.id, getSessionId()).catch(()=>{}); },[restaurant?.id]);
  useEffect(()=>{ document.body.style.overflow=(selectedItem||smaOpen)?'hidden':''; return()=>{ document.body.style.overflow=''; }; },[selectedItem,smaOpen]);

  const cats    = ['All',...new Set((menuItems||[]).map(i=>i.category).filter(Boolean))];
  const filtered= activeCat==='All'?(menuItems||[]):(menuItems||[]).filter(i=>i.category===activeCat);
  const arCount = (menuItems||[]).filter(i=>i.modelURL).length;
  const heroImg = restaurant?.coverImageURL || HERO_FALLBACK;

  const openItem = useCallback(async(item)=>{ setSelectedItem(item); setShowAR(false); if(restaurant?.id) incrementItemView(restaurant.id,item.id).catch(()=>{}); },[restaurant?.id]);
  const closeItem= useCallback(()=>{ setSelectedItem(null); setShowAR(false); },[]);
  const handleARLaunch=useCallback(async()=>{ if(restaurant?.id&&selectedItem?.id) incrementARView(restaurant.id,selectedItem.id).catch(()=>{}); },[restaurant?.id,selectedItem?.id]);
  const imgSrc=(item)=>(!imgErr[item.id]&&item.imageURL)?item.imageURL:getPlaceholder(item.id);

  const openSMA=()=>{ setSmaOpen(true);setSmaMode(null);setGroupSize(null);setSmaStep(0);setSmaAnswers({});setSmaResults([]); };
  const closeSMA=()=>setSmaOpen(false);
  const restartSMA=()=>{ setSmaMode(null);setGroupSize(null);setSmaStep(0);setSmaAnswers({});setSmaResults([]); };
  const activeQs=smaMode==='group'?GROUP_QUESTIONS:SOLO_QUESTIONS;
  const pickAnswer=(qId,val)=>{ const ans={...smaAnswers,[qId]:val}; setSmaAnswers(ans); if(smaStep<activeQs.length-1) setSmaStep(smaStep+1); else { setSmaResults(filterItems(menuItems||[],ans,groupSize)); setSmaStep(activeQs.length); } };

  if(error||!restaurant) return (
    <div style={{minHeight:'100vh',background:'#0D0C0A',display:'flex',alignItems:'center',justifyContent:'center',fontFamily:'Inter,sans-serif'}}>
      <div style={{textAlign:'center'}}><div style={{fontSize:52,marginBottom:12}}>🍽️</div>
        <h1 style={{fontSize:20,fontWeight:700,color:'#F0EBE0'}}>Restaurant not found</h1>
        <p style={{color:'#706860',marginTop:6,fontSize:14}}>This page does not exist or is inactive.</p>
      </div>
    </div>
  );

  return (<>
    <Head>
      <title>{restaurant.name} — Menu</title>
      <meta name="description" content={`Explore ${restaurant.name}'s menu`}/>
      <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1"/>
      <link href="https://fonts.googleapis.com/css2?family=Inter:ital,opsz,wght@0,14..32,300;0,14..32,400;0,14..32,500;0,14..32,600;0,14..32,700;0,14..32,800;0,14..32,900&display=swap" rel="stylesheet"/>
    </Head>

    <style>{`
      *,*::before,*::after{box-sizing:border-box;-webkit-tap-highlight-color:transparent;margin:0;padding:0;}
      html{scroll-behavior:smooth;}
      body{background:#0D0C0A !important;min-height:100vh;overflow-x:hidden;font-family:'Inter',-apple-system,BlinkMacSystemFont,sans-serif;-webkit-font-smoothing:antialiased;color:#F0EBE0;}

      @keyframes blink    {0%,100%{opacity:1}50%{opacity:0.2}}
      @keyframes fadeIn   {from{opacity:0}to{opacity:1}}
      @keyframes slideUp  {from{transform:translateY(100%)}to{transform:translateY(0)}}
      @keyframes heroIn   {from{opacity:0;transform:translateY(22px)}to{opacity:1;transform:translateY(0)}}
      @keyframes badgeIn  {from{opacity:0;transform:translateY(10px) scale(0.95)}to{opacity:1;transform:translateY(0) scale(1)}}

      /* scroll reveal */
      .scroll-item{opacity:0;transform:translateY(30px);transition:opacity 0.55s cubic-bezier(0.22,1,0.36,1),transform 0.55s cubic-bezier(0.22,1,0.36,1);}
      .scroll-item.revealed{opacity:1;transform:translateY(0);}

      /* HERO */
      .hero{position:relative;width:100%;height:52vh;min-height:280px;max-height:480px;overflow:hidden;display:flex;flex-direction:column;justify-content:flex-end;}
      .hero-bg{position:absolute;inset:0;background-size:cover;background-position:center;background-image:url('${heroImg}');filter:brightness(0.35) saturate(1.2);transform:scale(1.06);transition:transform 9s ease;}
      .hero-bg.pan{transform:scale(1.0);}
      .hero-grd{position:absolute;inset:0;background:linear-gradient(to bottom,rgba(13,12,10,0.05) 0%,rgba(13,12,10,0.3) 40%,rgba(13,12,10,0.9) 80%,rgba(13,12,10,1) 100%);}
      .hero-content{position:relative;z-index:2;padding:0 22px 28px;max-width:1080px;margin:0 auto;width:100%;}
      .hero-ar{display:inline-flex;align-items:center;gap:6px;padding:5px 13px;border-radius:20px;margin-bottom:14px;background:rgba(232,100,42,0.16);border:1px solid rgba(232,100,42,0.35);font-size:11px;font-weight:700;color:#E8A070;letter-spacing:0.05em;animation:badgeIn 0.7s 0.2s ease both;}
      .hero-dot{width:6px;height:6px;border-radius:50%;background:#E8642A;animation:blink 1.8s infinite;}
      .hero-name{font-size:clamp(28px,5vw,50px);font-weight:800;color:#F5F0E8;letter-spacing:-0.04em;line-height:1.1;animation:heroIn 0.8s 0.1s cubic-bezier(0.22,1,0.36,1) both;margin-bottom:8px;}
      .hero-sub{font-size:13px;color:rgba(240,235,224,0.5);animation:heroIn 0.8s 0.22s cubic-bezier(0.22,1,0.36,1) both;}

      /* HEADER */
      .hdr{position:sticky;top:0;z-index:40;background:rgba(13,12,10,0.9);backdrop-filter:saturate(150%) blur(20px);-webkit-backdrop-filter:saturate(150%) blur(20px);border-bottom:1px solid rgba(255,255,255,0.05);}
      .hdr-inner{max-width:1080px;margin:0 auto;padding:0 18px;}
      .cats-outer{overflow:hidden;}
      .cats-scroll{display:flex;gap:7px;overflow-x:auto;scrollbar-width:none;padding:12px 0 13px;flex-wrap:nowrap;-webkit-overflow-scrolling:touch;cursor:grab;}
      .cats-scroll::-webkit-scrollbar{display:none;}
      .cats-scroll:active{cursor:grabbing;}
      .cat-pill{flex-shrink:0;display:flex;align-items:center;gap:6px;padding:8px 16px;border-radius:30px;font-size:13px;font-weight:500;font-family:'Inter',sans-serif;cursor:pointer;white-space:nowrap;border:1px solid rgba(255,255,255,0.08);background:rgba(255,255,255,0.05);color:rgba(240,235,224,0.55);transition:all 0.2s ease;}
      .cat-pill:hover:not(.on){background:rgba(255,255,255,0.09);color:rgba(240,235,224,0.9);border-color:rgba(255,255,255,0.14);}
      .cat-pill.on{background:#E8642A;color:#fff;font-weight:700;border-color:transparent;box-shadow:0 4px 18px rgba(232,100,42,0.45);transform:translateY(-1px);}
      .cat-emoji{font-size:14px;line-height:1;}

      /* MAIN */
      .main{max-width:1080px;margin:0 auto;padding:22px 18px 130px;}

      /* AR strip */
      .ar-strip{display:flex;align-items:center;gap:14px;padding:14px 18px;margin-bottom:22px;background:rgba(232,100,42,0.07);border:1px solid rgba(232,100,42,0.2);border-radius:16px;animation:fadeIn 0.5s ease both;}
      .ar-strip-text{font-size:13px;font-weight:600;color:#F0EBE0;}
      .ar-strip-sub{font-size:11px;color:#504840;margin-top:2px;}
      .ar-chip{margin-left:auto;flex-shrink:0;padding:5px 12px;border-radius:20px;background:#E8642A;color:#fff;font-size:10px;font-weight:800;letter-spacing:0.05em;}

      /* offer */
      .offer-bar{display:flex;align-items:center;gap:12px;padding:14px 18px;margin-bottom:18px;background:rgba(200,150,26,0.07);border:1px solid rgba(200,150,26,0.22);border-radius:16px;animation:fadeIn 0.5s ease both;}
      .offer-title{font-size:13px;font-weight:600;color:#D4A050;}
      .offer-desc {font-size:11px;color:#806030;margin-top:2px;}

      /* GRID */
      .grid{display:grid;grid-template-columns:1fr 1fr;gap:14px;}
      @media(min-width:600px) and (max-width:899px){.grid{grid-template-columns:repeat(3,1fr);}}
      @media(min-width:900px){.grid{grid-template-columns:repeat(4,1fr);gap:16px;}}
      @media(max-width:380px){.grid{grid-template-columns:1fr;}}

      /* CARD */
      .card{background:#1A1814;border:1px solid rgba(255,255,255,0.06);border-radius:18px;overflow:hidden;cursor:pointer;text-align:left;transition:transform 0.28s cubic-bezier(0.22,1,0.36,1),box-shadow 0.28s ease,border-color 0.28s ease;position:relative;will-change:transform;}
      .card:hover{transform:translateY(-7px) scale(1.01);box-shadow:0 16px 44px rgba(0,0,0,0.55),0 0 0 1px rgba(232,100,42,0.22);border-color:rgba(232,100,42,0.18);}
      .card:active{transform:translateY(-2px) scale(0.99);}

      .c-img{position:relative;width:100%;aspect-ratio:3/2;overflow:hidden;background:#252018;}
      .c-img img{width:100%;height:100%;object-fit:cover;display:block;transition:transform 0.5s cubic-bezier(0.22,1,0.36,1);}
      .card:hover .c-img img{transform:scale(1.08);}
      .c-img-grd{position:absolute;inset:0;background:linear-gradient(to bottom,transparent 50%,rgba(13,12,10,0.65) 100%);pointer-events:none;}

      .c-ar-tag{position:absolute;top:10px;right:10px;background:rgba(13,12,10,0.82);backdrop-filter:blur(8px);color:#F0EBE0;font-size:10px;font-weight:700;padding:4px 9px;border-radius:8px;letter-spacing:0.04em;border:1px solid rgba(232,100,42,0.28);}

      .vdot{position:absolute;top:10px;left:10px;width:18px;height:18px;border-radius:4px;background:rgba(13,12,10,0.82);backdrop-filter:blur(8px);display:flex;align-items:center;justify-content:center;border:1.5px solid;}
      .vdot::after{content:'';width:7px;height:7px;border-radius:50%;}
      .vdot.v{border-color:#3AAA60;}.vdot.v::after{background:#3AAA60;}
      .vdot.nv{border-color:#E04030;}.vdot.nv::after{background:#E04030;}

      .c-ribbon{position:absolute;bottom:0;left:0;right:0;padding:5px 10px;font-size:10px;font-weight:800;color:#fff;text-align:center;}

      .c-body{padding:13px 14px 14px;}
      .c-badges{display:flex;gap:5px;flex-wrap:wrap;margin-bottom:7px;}
      .badge{font-size:10px;font-weight:700;padding:3px 9px;border-radius:6px;}
      .badge.pop{background:rgba(232,100,42,0.18);color:#E8A070;}
      .badge.feat{background:rgba(200,150,26,0.18);color:#C8A040;}

      .c-name{font-size:14px;font-weight:700;color:#F0EBE0;line-height:1.3;margin-bottom:8px;letter-spacing:-0.2px;}
      .c-pr-row{display:flex;align-items:center;gap:8px;margin-bottom:7px;}
      .c-price{font-size:16px;font-weight:800;color:#E8642A;letter-spacing:-0.3px;}
      .c-kcal{font-size:11px;color:#443830;}

      .c-meta{display:flex;align-items:center;gap:7px;flex-wrap:wrap;}
      .c-spice{font-size:11px;font-weight:600;padding:3px 8px;border-radius:6px;}
      .c-prep{font-size:11px;color:#443830;}

      .c-arcta{margin-top:10px;display:flex;align-items:center;justify-content:center;gap:6px;padding:9px;border-radius:10px;background:rgba(232,100,42,0.08);border:1px solid rgba(232,100,42,0.18);font-size:11px;font-weight:700;color:#E8A070;letter-spacing:0.04em;text-transform:uppercase;transition:background 0.18s,border-color 0.18s;}
      .card:hover .c-arcta{background:rgba(232,100,42,0.16);border-color:rgba(232,100,42,0.36);}

      /* empty */
      .empty{text-align:center;padding:72px 20px;}
      .empty-icon{font-size:44px;margin-bottom:12px;}
      .empty-txt{font-size:14px;font-weight:600;color:#443830;}

      /* MODAL */
      .overlay{position:fixed;inset:0;z-index:50;display:flex;align-items:flex-end;justify-content:center;background:rgba(0,0,0,0.78);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);animation:fadeIn 0.18s ease;}
      .sheet{position:relative;width:100%;max-width:540px;background:#141210;border-radius:24px 24px 0 0;max-height:93vh;overflow-y:auto;animation:slideUp 0.32s cubic-bezier(0.32,0.72,0,1);box-shadow:0 -12px 60px rgba(0,0,0,0.6);border-top:1px solid rgba(255,255,255,0.07);}
      .handle-row{display:flex;justify-content:center;padding:12px 0 0;}
      .handle{width:36px;height:4px;border-radius:2px;background:rgba(255,255,255,0.12);}
      .close-btn{position:absolute;top:12px;right:16px;width:32px;height:32px;border-radius:50%;background:rgba(255,255,255,0.08);border:none;color:rgba(240,235,224,0.7);cursor:pointer;font-size:13px;display:flex;align-items:center;justify-content:center;transition:background 0.15s;}
      .close-btn:hover{background:rgba(255,255,255,0.14);}

      .m-hero{margin:10px 14px 0;border-radius:16px;overflow:hidden;aspect-ratio:16/9;position:relative;}
      .m-hero img{width:100%;height:100%;object-fit:cover;display:block;}

      .sbody{padding:20px 20px 36px;}
      .m-title{font-size:24px;font-weight:800;color:#F5F0E8;text-align:center;margin-bottom:12px;line-height:1.2;letter-spacing:-0.4px;}
      .m-tags{display:flex;justify-content:center;gap:7px;flex-wrap:wrap;margin-bottom:12px;}
      .m-tag{padding:5px 13px;border-radius:8px;font-size:12px;font-weight:600;}
      .tcat{background:rgba(255,255,255,0.07);color:rgba(240,235,224,0.65);}
      .tveg{background:rgba(58,170,96,0.14);color:#3AAA60;}
      .tnv{background:rgba(224,64,48,0.14);color:#E06050;}
      .tpop{background:rgba(232,100,42,0.14);color:#E8A070;}

      .m-pills{display:flex;justify-content:center;gap:7px;flex-wrap:wrap;margin-bottom:14px;}
      .m-pill{display:flex;align-items:center;gap:5px;padding:6px 14px;border-radius:8px;font-size:12px;font-weight:600;background:rgba(255,255,255,0.06);color:rgba(240,235,224,0.65);}

      .m-price{text-align:center;font-size:36px;font-weight:800;color:#E8642A;letter-spacing:-0.6px;}
      .m-price-sub{text-align:center;font-size:11px;color:#504840;margin-top:2px;margin-bottom:16px;}
      .m-desc{font-size:14px;color:#706860;line-height:1.7;text-align:center;margin-bottom:20px;}
      .m-div{height:1px;background:rgba(255,255,255,0.06);margin:16px 0;}
      .m-lbl{font-size:11px;font-weight:700;color:#504840;letter-spacing:0.08em;text-transform:uppercase;margin-bottom:12px;}

      .nutr{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:20px;}
      .nc{background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.06);border-radius:12px;padding:13px 8px;text-align:center;}
      .nc-v{font-size:20px;font-weight:800;color:#E8642A;letter-spacing:-0.3px;}
      .nc-u{font-size:10px;color:#504840;margin-top:1px;}
      .nc-l{font-size:10px;color:#706860;margin-top:3px;font-weight:600;}

      .ings{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:22px;}
      .ing{padding:6px 13px;border-radius:8px;font-size:12px;color:rgba(240,235,224,0.55);background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.06);}

      .ar-btn{width:100%;padding:17px;border-radius:14px;border:none;background:linear-gradient(135deg,#E8642A,#C84820);color:#fff;font-family:'Inter',sans-serif;font-weight:800;font-size:15px;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:11px;box-shadow:0 6px 24px rgba(232,100,42,0.4);transition:transform 0.15s,box-shadow 0.15s;letter-spacing:-0.1px;}
      .ar-btn:hover{transform:translateY(-2px);box-shadow:0 10px 32px rgba(232,100,42,0.55);}
      .ar-btn:active{transform:scale(0.98);}
      .ar-hint{text-align:center;font-size:11px;color:#504840;margin-top:9px;}

      /* FAB */
      .fab-wrap{position:fixed;bottom:28px;left:0;right:0;display:flex;justify-content:center;z-index:45;pointer-events:none;}
      .sma-fab{pointer-events:all;display:flex;align-items:center;gap:9px;padding:15px 30px;border-radius:50px;border:none;background:linear-gradient(135deg,#E8642A,#C84820);color:#fff;font-family:'Inter',sans-serif;font-weight:700;font-size:15px;cursor:pointer;white-space:nowrap;box-shadow:0 8px 28px rgba(232,100,42,0.55),0 2px 8px rgba(232,100,42,0.3);transition:transform 0.22s ease,box-shadow 0.22s ease;animation:badgeIn 0.7s 0.4s ease both;}
      .sma-fab:hover{transform:translateY(-3px);box-shadow:0 14px 36px rgba(232,100,42,0.65);}
      .sma-fab:active{transform:scale(0.97);}

      /* SMA */
      .sma-overlay{position:fixed;inset:0;z-index:55;display:flex;align-items:flex-end;justify-content:center;background:rgba(0,0,0,0.78);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);animation:fadeIn 0.18s ease;}
      .sma-sheet{position:relative;width:100%;max-width:540px;background:#141210;border-radius:24px 24px 0 0;max-height:90vh;overflow-y:auto;animation:slideUp 0.32s cubic-bezier(0.32,0.72,0,1);box-shadow:0 -12px 60px rgba(0,0,0,0.6);border-top:1px solid rgba(255,255,255,0.07);font-family:'Inter',sans-serif;}
      .sma-pw{padding:18px 22px 0;}
      .sma-pr{display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;}
      .sma-ptxt{font-size:12px;font-weight:600;color:#504840;}
      .sma-back{font-size:12px;font-weight:600;color:#504840;background:none;border:none;cursor:pointer;font-family:'Inter',sans-serif;padding:0;transition:color 0.15s;}
      .sma-back:hover{color:#E8642A;}
      .sma-pbar{height:2px;background:rgba(255,255,255,0.08);border-radius:99px;overflow:hidden;}
      .sma-pfill{height:100%;background:linear-gradient(90deg,#E8642A,#C84820);border-radius:99px;transition:width 0.35s ease;}
      .sma-qw{padding:26px 22px 34px;}
      .sma-qe{font-size:40px;text-align:center;margin-bottom:12px;}
      .sma-qt{font-size:22px;font-weight:800;color:#F0EBE0;text-align:center;margin-bottom:5px;line-height:1.25;letter-spacing:-0.4px;}
      .sma-qs{font-size:13px;color:#504840;text-align:center;margin-bottom:22px;}
      .sma-opts{display:flex;flex-direction:column;gap:9px;}
      .sma-opt{display:flex;align-items:center;gap:13px;padding:14px 18px;border-radius:14px;border:1px solid rgba(255,255,255,0.08);background:rgba(255,255,255,0.04);cursor:pointer;transition:all 0.18s ease;text-align:left;width:100%;font-family:'Inter',sans-serif;}
      .sma-opt:hover{background:rgba(232,100,42,0.1);border-color:rgba(232,100,42,0.3);transform:translateX(4px);}
      .sma-opt:active{transform:scale(0.98);}
      .sma-oe{font-size:24px;flex-shrink:0;}
      .sma-ol{font-size:14px;font-weight:600;color:#F0EBE0;letter-spacing:-0.1px;}
      .sma-dis{display:block;text-align:center;margin:18px auto 0;font-size:12px;color:#504840;background:none;border:none;cursor:pointer;font-family:'Inter',sans-serif;transition:color 0.15s;}
      .sma-dis:hover{color:#E8642A;}

      .sma-mw{padding:28px 22px 36px;}
      .sma-mt{font-size:22px;font-weight:800;color:#F0EBE0;text-align:center;margin-bottom:6px;letter-spacing:-0.4px;}
      .sma-ms{font-size:13px;color:#504840;text-align:center;margin-bottom:28px;}
      .sma-mc{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:18px;}
      .sma-mcard{padding:22px 16px;border-radius:18px;border:1px solid rgba(255,255,255,0.08);background:rgba(255,255,255,0.04);cursor:pointer;text-align:center;transition:all 0.2s ease;font-family:'Inter',sans-serif;}
      .sma-mcard:hover{background:rgba(232,100,42,0.1);border-color:rgba(232,100,42,0.3);transform:translateY(-3px);box-shadow:0 8px 24px rgba(0,0,0,0.3);}
      .sma-me{font-size:36px;margin-bottom:10px;}
      .sma-mn{font-size:15px;font-weight:800;color:#F0EBE0;margin-bottom:4px;letter-spacing:-0.2px;}
      .sma-md{font-size:11px;color:#504840;line-height:1.5;}

      .sma-szw{padding:26px 22px 36px;}
      .sma-szt{font-size:22px;font-weight:800;color:#F0EBE0;text-align:center;margin-bottom:6px;letter-spacing:-0.4px;}
      .sma-szs{font-size:13px;color:#504840;text-align:center;margin-bottom:26px;}
      .sma-szg{display:grid;grid-template-columns:repeat(5,1fr);gap:9px;}
      .sma-szb{padding:14px 6px;border-radius:14px;border:1px solid rgba(255,255,255,0.08);background:rgba(255,255,255,0.04);cursor:pointer;text-align:center;transition:all 0.18s ease;font-family:'Inter',sans-serif;}
      .sma-szb:hover{background:rgba(232,100,42,0.12);border-color:rgba(232,100,42,0.3);transform:translateY(-2px);}
      .sma-sze{font-size:22px;display:block;margin-bottom:6px;}
      .sma-szn{font-size:15px;font-weight:800;color:#F0EBE0;}
      .sma-szl{font-size:10px;color:#504840;margin-top:2px;}

      .sma-rw{padding:20px 20px 40px;}
      .sma-rh{text-align:center;margin-bottom:22px;}
      .sma-re{font-size:38px;margin-bottom:8px;}
      .sma-rt{font-size:22px;font-weight:800;color:#F0EBE0;margin-bottom:4px;letter-spacing:-0.4px;}
      .sma-rsub{font-size:13px;color:#504840;}
      .sma-gb{display:flex;align-items:center;gap:10px;padding:12px 16px;border-radius:12px;margin-bottom:18px;background:rgba(58,170,96,0.08);border:1px solid rgba(58,170,96,0.2);}
      .sma-gbt{font-size:12px;font-weight:600;color:#3AAA60;}
      .sma-gbs{font-size:11px;color:#2A7A48;margin-top:1px;}
      .sma-cl{font-size:11px;font-weight:700;color:#504840;letter-spacing:0.08em;text-transform:uppercase;margin:18px 0 9px 2px;}
      .sma-item{display:flex;align-items:center;gap:12px;padding:12px 14px;border-radius:14px;margin-bottom:7px;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.07);cursor:pointer;transition:all 0.18s ease;text-align:left;width:100%;font-family:'Inter',sans-serif;}
      .sma-item:hover{background:rgba(232,100,42,0.08);border-color:rgba(232,100,42,0.22);transform:translateX(3px);}
      .sma-img{width:50px;height:50px;border-radius:12px;object-fit:cover;flex-shrink:0;background:#252018;}
      .sma-in{font-size:14px;font-weight:700;color:#F0EBE0;margin-bottom:4px;letter-spacing:-0.1px;}
      .sma-im{display:flex;align-items:center;gap:6px;flex-wrap:wrap;}
      .sma-ip{font-size:14px;font-weight:800;color:#E8642A;}
      .sma-chip{font-size:10px;font-weight:700;padding:2px 8px;border-radius:6px;}
      .chip-pop{background:rgba(232,100,42,0.18);color:#E8A070;}
      .chip-ar{background:rgba(58,170,96,0.15);color:#3AAA60;}
      .chip-sh{background:rgba(64,120,220,0.15);color:#6090E0;}
      .sma-nm{text-align:center;padding:36px 20px;color:#504840;font-size:14px;}
      .sma-acts{display:flex;gap:9px;margin-top:22px;}
      .btn-dark{flex:1;padding:14px;border-radius:12px;border:none;background:linear-gradient(135deg,#E8642A,#C84820);color:#fff;font-family:'Inter',sans-serif;font-weight:700;font-size:14px;cursor:pointer;}
      .btn-light{flex:1;padding:14px;border-radius:12px;border:1px solid rgba(255,255,255,0.1);background:transparent;color:rgba(240,235,224,0.55);font-family:'Inter',sans-serif;font-weight:600;font-size:14px;cursor:pointer;transition:background 0.15s;}
      .btn-light:hover{background:rgba(255,255,255,0.06);}
    `}</style>

    {/* HERO */}
    <div className="hero">
      <div className={`hero-bg${heroLoaded?' pan':''}`}/>
      <img src={heroImg} style={{display:'none'}} onLoad={()=>setHeroLoaded(true)} alt=""/>
      <div className="hero-grd"/>
      <div className="hero-content">
        {arCount>0 && (
          <div className="hero-ar">
            <span className="hero-dot"/> AR Live · {arCount} dish{arCount!==1?'es':''} in 3D
          </div>
        )}
        <div className="hero-name">{restaurant.name}</div>
        <div className="hero-sub">Tap any dish · View it in AR on your table</div>
      </div>
    </div>

    {/* STICKY CATEGORY HEADER */}
    <header className="hdr">
      <div className="hdr-inner">
        <div className="cats-outer">
          <div className="cats-scroll">
            {cats.map(c=>(
              <button key={c} className={`cat-pill${activeCat===c?' on':''}`} onClick={()=>setActiveCat(c)}>
                <span className="cat-emoji">{catIcon(c)}</span>{c}
              </button>
            ))}
          </div>
        </div>
      </div>
    </header>

    {/* MAIN */}
    <main className="main">
      {offers?.[0] && (
        <div className="offer-bar">
          <span style={{fontSize:20}}>🎉</span>
          <div>
            <div className="offer-title">{offers[0].title}</div>
            {offers[0].description && <div className="offer-desc">{offers[0].description}</div>}
          </div>
        </div>
      )}
      {arCount>0 && (
        <div className="ar-strip">
          <span style={{fontSize:22,flexShrink:0}}>🥽</span>
          <div>
            <div className="ar-strip-text">{arCount} dish{arCount!==1?'es':''} available in AR</div>
            <div className="ar-strip-sub">No app needed · Tap a card, then "View in AR"</div>
          </div>
          <div className="ar-chip">TRY IT</div>
        </div>
      )}
      {filtered.length===0 ? (
        <div className="empty">
          <div className="empty-icon">🥢</div>
          <div className="empty-txt">No items in this category</div>
        </div>
      ) : (
        <div className="grid">
          {filtered.map((item,idx)=>(
            <MenuCard key={item.id} item={item} idx={idx} imgSrc={imgSrc} imgErr={imgErr} setImgErr={setImgErr} onOpen={openItem}/>
          ))}
        </div>
      )}
    </main>

    {/* FAB */}
    {!selectedItem&&!smaOpen && (
      <div className="fab-wrap">
        <button className="sma-fab" onClick={openSMA}>
          <span style={{fontSize:17}}>✨</span>Help Me Choose
        </button>
      </div>
    )}

    {/* ITEM MODAL */}
    {selectedItem && (
      <div className="overlay" onClick={e=>{if(e.target===e.currentTarget)closeItem();}}>
        <div className="sheet">
          <div className="handle-row"><div className="handle"/></div>
          <button className="close-btn" onClick={closeItem}>✕</button>
          {!showAR && (
            <div className="m-hero">
              <img src={imgSrc(selectedItem)} alt={selectedItem.name} onError={()=>setImgErr(e=>({...e,[selectedItem.id]:true}))}/>
              {selectedItem.offerBadge&&selectedItem.offerLabel && (
                <div style={{position:'absolute',bottom:0,left:0,right:0,padding:'7px 14px',background:selectedItem.offerColor||'#E8642A',color:'#fff',fontSize:12,fontWeight:700,textAlign:'center'}}>
                  🏷 {selectedItem.offerLabel}
                </div>
              )}
            </div>
          )}
          <div className="sbody">
            <h2 className="m-title">{selectedItem.name}</h2>
            <div className="m-tags">
              {selectedItem.category && <span className="m-tag tcat">{selectedItem.category}</span>}
              {typeof selectedItem.isVeg==='boolean' && <span className={selectedItem.isVeg?'m-tag tveg':'m-tag tnv'}>{selectedItem.isVeg?'● Veg':'● Non-Veg'}</span>}
              {selectedItem.isPopular && <span className="m-tag tpop">🔥 Popular</span>}
            </div>
            {(selectedItem.prepTime||(selectedItem.spiceLevel&&selectedItem.spiceLevel!=='None')) && (
              <div className="m-pills">
                {selectedItem.prepTime && <span className="m-pill">⏱ {selectedItem.prepTime}</span>}
                {selectedItem.spiceLevel&&selectedItem.spiceLevel!=='None'&&SPICE_MAP[selectedItem.spiceLevel] && (
                  <span className="m-pill" style={{background:SPICE_MAP[selectedItem.spiceLevel].bg,color:SPICE_MAP[selectedItem.spiceLevel].color}}>
                    {SPICE_MAP[selectedItem.spiceLevel].dot} {selectedItem.spiceLevel}
                  </span>
                )}
              </div>
            )}
            {selectedItem.price && <><div className="m-price">₹{selectedItem.price}</div><div className="m-price-sub">per serving</div></>}
            {selectedItem.description && <p className="m-desc">{selectedItem.description}</p>}
            {(selectedItem.calories||selectedItem.protein||selectedItem.carbs||selectedItem.fats) && (<>
              <div className="m-div"/>
              <div className="m-lbl">Nutrition</div>
              <div className="nutr">
                {[{l:'Calories',v:selectedItem.calories,u:'kcal'},{l:'Protein',v:selectedItem.protein,u:'g'},{l:'Carbs',v:selectedItem.carbs,u:'g'},{l:'Fats',v:selectedItem.fats,u:'g'}].filter(n=>n.v).map(n=>(
                  <div key={n.l} className="nc"><div className="nc-v">{n.v}</div><div className="nc-u">{n.u}</div><div className="nc-l">{n.l}</div></div>
                ))}
              </div>
            </>)}
            {selectedItem.ingredients?.length>0 && (<>
              <div className="m-lbl">Ingredients</div>
              <div className="ings">{selectedItem.ingredients.map(ing=><span key={ing} className="ing">{ing}</span>)}</div>
            </>)}
            {!showAR&&selectedItem.modelURL && (<>
              <div className="m-div"/>
              <button className="ar-btn" onClick={()=>{setShowAR(true);handleARLaunch();}}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg>
                View in AR — Point at Your Table
              </button>
              <div className="ar-hint">No app needed · Android Chrome &amp; iOS Safari</div>
            </>)}
            {showAR && <ARViewerEmbed modelURL={selectedItem.modelURL} itemName={selectedItem.name} onARLaunch={handleARLaunch}/>}
          </div>
        </div>
      </div>
    )}

    {/* SMART MENU ASSISTANT */}
    {smaOpen && (
      <div className="sma-overlay" onClick={e=>{if(e.target===e.currentTarget)closeSMA();}}>
        <div className="sma-sheet">
          <div className="handle-row"><div className="handle"/></div>

          {!smaMode && (
            <div className="sma-mw">
              <div style={{fontSize:40,textAlign:'center',marginBottom:12}}>✨</div>
              <div className="sma-mt">Help Me Choose</div>
              <div className="sma-ms">Ordering for yourself or a group?</div>
              <div className="sma-mc">
                <button className="sma-mcard" onClick={()=>{setSmaMode('solo');setSmaStep(0);}}>
                  <div className="sma-me">🙋</div>
                  <div className="sma-mn">Just Me</div>
                  <div className="sma-md">Personalised picks for your taste</div>
                </button>
                <button className="sma-mcard" onClick={()=>setSmaMode('group')}>
                  <div className="sma-me">👥</div>
                  <div className="sma-mn">Group</div>
                  <div className="sma-md">Dishes that work for everyone</div>
                </button>
              </div>
              <button className="sma-dis" onClick={closeSMA}>Dismiss</button>
            </div>
          )}

          {smaMode==='group'&&!groupSize && (
            <div className="sma-szw">
              <div style={{fontSize:36,textAlign:'center',marginBottom:12}}>👥</div>
              <div className="sma-szt">How many people?</div>
              <div className="sma-szs">We will suggest the right portions and shareable dishes</div>
              <div className="sma-szg">
                {GROUP_SIZES.map(({n,e})=>(
                  <button key={n} className="sma-szb" onClick={()=>{setGroupSize(n);setSmaStep(0);}}>
                    <span className="sma-sze">{e}</span>
                    <div className="sma-szn">{n}</div>
                    <div className="sma-szl">people</div>
                  </button>
                ))}
              </div>
              <button className="sma-dis" style={{marginTop:22}} onClick={()=>setSmaMode(null)}>← Back</button>
            </div>
          )}

          {smaMode&&(smaMode==='solo'||groupSize)&&smaStep<activeQs.length && (<>
            <div className="sma-pw">
              <div className="sma-pr">
                <span className="sma-ptxt">
                  {smaMode==='group' && <span style={{marginRight:8,fontSize:11,background:'rgba(58,170,96,0.15)',color:'#3AAA60',padding:'2px 8px',borderRadius:6,fontWeight:700}}>👥 {groupSize}</span>}
                  {smaStep+1} / {activeQs.length}
                </span>
                <button className="sma-back" onClick={()=>{ if(smaStep>0) setSmaStep(s=>s-1); else if(smaMode==='group') setGroupSize(null); else setSmaMode(null); }}>← Back</button>
              </div>
              <div className="sma-pbar"><div className="sma-pfill" style={{width:`${((smaStep+1)/activeQs.length)*100}%`}}/></div>
            </div>
            <div className="sma-qw">
              <div className="sma-qe">{activeQs[smaStep].emoji}</div>
              <div className="sma-qt">{activeQs[smaStep].q}</div>
              <div className="sma-qs">{activeQs[smaStep].sub}</div>
              <div className="sma-opts">
                {activeQs[smaStep].opts.map(o=>(
                  <button key={o.v} className="sma-opt" onClick={()=>pickAnswer(activeQs[smaStep].id,o.v)}>
                    <span className="sma-oe">{o.e}</span><span className="sma-ol">{o.l}</span>
                  </button>
                ))}
              </div>
              <button className="sma-dis" onClick={closeSMA}>Dismiss</button>
            </div>
          </>)}

          {smaMode&&(smaMode==='solo'||groupSize)&&smaStep===activeQs.length && (()=>{
            const top=smaResults.slice(0,12);
            const cats={};
            top.forEach(({item})=>{ const c=item.category||'Other'; if(!cats[c]) cats[c]=[]; cats[c].push(item); });
            const isGroup=smaMode==='group';
            const bigGroup=groupSize==='6+'||(typeof groupSize==='number'&&groupSize>=4);
            return (
              <div className="sma-rw">
                <div className="sma-rh">
                  <div className="sma-re">🎯</div>
                  <div className="sma-rt">{top.length>0?(isGroup?`${top.length} dishes for the table`:`${top.length} dishes for you`):'No matches'}</div>
                  <div className="sma-rsub">{top.length>0?(isGroup?'Works for everyone — tap to see details':'Based on your preferences'):'Try again with different preferences'}</div>
                </div>
                {isGroup&&top.length>0 && (
                  <div className="sma-gb">
                    <span style={{fontSize:20}}>👥</span>
                    <div>
                      <div className="sma-gbt">Group of {groupSize} · {bigGroup?'Shareable dishes highlighted':'Individual portions'}</div>
                      <div className="sma-gbs">{bigGroup?'Look for 🤲 — great for sharing':'Each person can order their own'}</div>
                    </div>
                  </div>
                )}
                {top.length===0 ? (
                  <div className="sma-nm">
                    <p>No dishes matched your filters.</p>
                    <button className="btn-dark" style={{marginTop:14,width:'100%'}} onClick={restartSMA}>Try Again</button>
                  </div>
                ) : (<>
                  {Object.entries(cats).map(([cat,items])=>(
                    <div key={cat}>
                      <div className="sma-cl">{cat}</div>
                      {items.map(item=>{
                        const shareable=isGroup&&isShareable(item);
                        return (
                          <button key={item.id} className="sma-item" onClick={()=>{closeSMA();openItem(item);}}>
                            <img className="sma-img" src={imgSrc(item)} alt={item.name} onError={()=>setImgErr(e=>({...e,[item.id]:true}))}/>
                            <div style={{flex:1,minWidth:0}}>
                              <div className="sma-in">{item.name}</div>
                              <div className="sma-im">
                                {item.price    && <span className="sma-ip">₹{item.price}</span>}
                                {shareable     && <span className="sma-chip chip-sh">🤲 Shareable</span>}
                                {item.isPopular&& <span className="sma-chip chip-pop">🔥 Popular</span>}
                                {item.modelURL && <span className="sma-chip chip-ar">🥽 AR</span>}
                                {item.prepTime && <span style={{fontSize:11,color:'#504840'}}>⏱ {item.prepTime}</span>}
                              </div>
                            </div>
                            <span style={{fontSize:16,color:'#302820',flexShrink:0}}>›</span>
                          </button>
                        );
                      })}
                    </div>
                  ))}
                  <div className="sma-acts">
                    <button className="btn-light" onClick={restartSMA}>↺ Start Over</button>
                    <button className="btn-dark"  onClick={closeSMA}>Browse Menu →</button>
                  </div>
                </>)}
              </div>
            );
          })()}
        </div>
      </div>
    )}
  </>);
}

export async function getServerSideProps({ params }) {
  try {
    const restaurant = await getRestaurantBySubdomain(params.subdomain);
    if (!restaurant) return { props:{restaurant:null,menuItems:[],offers:[],error:'Not found'} };
    const [menuItems,offers] = await Promise.all([getMenuItems(restaurant.id), getActiveOffers(restaurant.id)]);
    return { props:{ restaurant:JSON.parse(JSON.stringify(restaurant)), menuItems:JSON.parse(JSON.stringify(menuItems)), offers:JSON.parse(JSON.stringify(offers)), error:null } };
  } catch(err) {
    return { props:{restaurant:null,menuItems:[],offers:[],error:err.message} };
  }
}
