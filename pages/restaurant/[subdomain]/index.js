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
  'https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?w=600&q=80',
  'https://images.unsplash.com/photo-1504674900247-0877df9cc836?w=600&q=80',
  'https://images.unsplash.com/photo-1540189549336-e6e99c3679fe?w=600&q=80',
  'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=600&q=80',
  'https://images.unsplash.com/photo-1567620905732-2d1ec7ab7445?w=600&q=80',
  'https://images.unsplash.com/photo-1565958011703-44f9829ba187?w=600&q=80',
  'https://images.unsplash.com/photo-1512621776951-a57141f2eefd?w=600&q=80',
  'https://images.unsplash.com/photo-1482049016688-2d3e1b311543?w=600&q=80',
];
function getPlaceholder(id) {
  let h = 0;
  for (let i = 0; i < (id||'').length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return FOOD_PLACEHOLDERS[h % FOOD_PLACEHOLDERS.length];
}


/* ── Animated price counter ── */
function PriceCounter({ price, className, style }) {
  const [display, setDisplay] = useState(0);
  const rafRef = useRef(null);
  const target = Number(price) || 0;

  useEffect(() => {
    if (!target) return;
    const duration = 900;
    const startTime = performance.now();
    const tick = (now) => {
      const p = Math.min((now - startTime) / duration, 1);
      const eased = 1 - Math.pow(1 - p, 4); // ease-out quart
      setDisplay(Math.round(eased * target));
      if (p < 1) rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [target]);

  return <span className={className} style={style}>₹{display}</span>;
}

const SPICE_MAP = {
  Mild:      { label:'Mild',      color:'#D4820A', bg:'#FFF8EC', dot:'🟡' },
  Medium:    { label:'Medium',    color:'#C45A18', bg:'#FFF2EB', dot:'🟠' },
  Spicy:     { label:'Spicy',     color:'#B52020', bg:'#FFEAEA', dot:'🔴' },
  'Very Spicy':{ label:'Very Spicy', color:'#8B0000', bg:'#FFE0E0', dot:'🔴' },
};

function catIcon(name) {
  const n = (name||'').toLowerCase();
  if (n==='all')              return '◈';
  if (n.includes('starter') || n.includes('appetizer')) return '🥗';
  if (n.includes('main'))    return '🍛';
  if (n.includes('burger'))  return '🍔';
  if (n.includes('pizza'))   return '🍕';
  if (n.includes('pasta') || n.includes('noodle'))    return '🍝';
  if (n.includes('dessert') || n.includes('sweet'))   return '🍰';
  if (n.includes('drink') || n.includes('beverage') || n.includes('juice')) return '🥤';
  if (n.includes('coffee') || n.includes('tea'))      return '☕';
  if (n.includes('breakfast')) return '🥞';
  if (n.includes('seafood') || n.includes('fish'))    return '🐟';
  if (n.includes('chicken')) return '🍗';
  if (n.includes('rice') || n.includes('biryani'))    return '🍚';
  if (n.includes('salad'))   return '🥙';
  if (n.includes('soup'))    return '🍲';
  if (n.includes('snack'))   return '🍿';
  if (n.includes('special') || n.includes('chef'))    return '⭐';
  return '🍽️';
}

// ── Smart Menu Assistant ─────────────────────────────────────────

// SOLO questions
const SOLO_QUESTIONS = [
  { id:'diet',   emoji:'🌿', q:'Any dietary preference?',    sub:'We\'ll only show dishes that match',
    opts:[{l:'Vegetarian',v:'veg',e:'🌿'},{l:'Non-Vegetarian',v:'nonveg',e:'🍗'},{l:'No Preference',v:'any',e:'✌️'}] },
  { id:'mood',   emoji:'✨', q:'What\'s your mood today?',    sub:'Pick what sounds good right now',
    opts:[{l:'Comfort Food',v:'comfort',e:'🍲'},{l:'Something Healthy',v:'healthy',e:'🥦'},{l:'Most Popular',v:'popular',e:'🔥'},{l:'Try Something New',v:'new',e:'🌟'}] },
  { id:'spice',  emoji:'🌶️', q:'How spicy do you like it?',  sub:'We\'ll match your spice tolerance',
    opts:[{l:'Mild / No Spice',v:'mild',e:'😌'},{l:'Medium',v:'medium',e:'😄'},{l:'Spicy',v:'spicy',e:'🥵'},{l:'Any Level',v:'any',e:'🤷'}] },
  { id:'size',   emoji:'🍽️', q:'How hungry are you?',        sub:'Choose your meal size',
    opts:[{l:'Light Bite',v:'light',e:'🥗'},{l:'Regular Meal',v:'regular',e:'🍛'},{l:'Feast Mode',v:'heavy',e:'🤤'},{l:'Anything',v:'any',e:'👌'}] },
  { id:'budget', emoji:'💰', q:'Budget per dish?',            sub:'Pick a price range',
    opts:[{l:'Under ₹200',v:'budget',e:'💵'},{l:'₹200–₹500',v:'mid',e:'💳'},{l:'₹500+',v:'premium',e:'💎'},{l:'No Limit',v:'any',e:'🤑'}] },
];

// GROUP questions — reframed for the whole table
const GROUP_QUESTIONS = [
  { id:'diet',   emoji:'🌿', q:'Anyone at the table vegetarian?', sub:'We\'ll make sure no one is left out',
    opts:[{l:'Yes — keep it veg friendly',v:'veg',e:'🌿'},{l:'No, we eat everything',v:'any',e:'🍗'},{l:'Mix — include both options',v:'mixed',e:'✌️'}] },
  { id:'spice',  emoji:'🌶️', q:'What\'s the group\'s spice limit?', sub:'Pick the lowest tolerance in the group',
    opts:[{l:'Keep it mild for everyone',v:'mild',e:'😌'},{l:'Medium is fine',v:'medium',e:'😄'},{l:'We all love it spicy',v:'spicy',e:'🥵'},{l:'No limit',v:'any',e:'🤷'}] },
  { id:'style',  emoji:'🤝', q:'How is the group ordering?',       sub:'Helps us suggest the right portions',
    opts:[{l:'Everyone orders their own',v:'individual',e:'🍽️'},{l:'Sharing dishes together',v:'sharing',e:'🤲'},{l:'Mix of both',v:'mix',e:'🔄'}] },
  { id:'mood',   emoji:'✨', q:'What\'s the vibe today?',          sub:'Pick the general mood of the group',
    opts:[{l:'Comfort & classics',v:'comfort',e:'🍲'},{l:'Light & healthy',v:'healthy',e:'🥦'},{l:'Go with what\'s popular',v:'popular',e:'🔥'},{l:'Explore something new',v:'new',e:'🌟'}] },
  { id:'budget', emoji:'💰', q:'Budget per person?',               sub:'Per head, not total',
    opts:[{l:'Under ₹200 per head',v:'budget',e:'💵'},{l:'₹200–₹500 per head',v:'mid',e:'💳'},{l:'₹500+ per head',v:'premium',e:'💎'},{l:'No limit',v:'any',e:'🤑'}] },
];

const GROUP_SIZES = [
  {n:2,e:'👫'},{n:3,e:'👨‍👩‍👦'},{n:4,e:'👨‍👩‍👧‍👦'},{n:5,e:'🧑‍🤝‍🧑'},{n:'6+',e:'🎉'},
];

const LIGHT_CATS  = ['starter','salad','soup','snack','drink','beverage','dessert'];
const HEAVY_CATS  = ['main','burger','pasta','pizza','biryani','thali','grill','rice'];
const SHARING_KW  = ['platter','sharing','family','large','combo','bucket','plate','thali','spread','feast'];
const HEALTHY_KW  = ['salad','grilled','steamed','healthy','light','vegan','fresh','oat','quinoa','fruit'];
const COMFORT_KW  = ['butter','cheese','cream','fried','crispy','masala','curry','rich','loaded','classic','special'];

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
  const big = typeof groupSize === 'number' ? groupSize >= 4 : true; // 6+ counts as big

  // ── diet ──
  if (ans.diet==='veg'   && item.isVeg===false) return -999;
  if (ans.diet==='veg'   && item.isVeg===true)  s+=20;
  if (ans.diet==='mixed') { /* allow both, slight boost to veg items for inclusivity */ if (item.isVeg===true) s+=8; }
  if (ans.diet==='nonveg'&& item.isVeg===true)  s-=10;

  // ── spice ──
  if (ans.spice==='mild'   && ['Spicy','Very Spicy'].includes(sp)) return -999;
  if (ans.spice==='mild'   && ['None','Mild'].includes(sp)) s+=15;
  if (ans.spice==='medium' && sp==='Medium') s+=20;
  if (ans.spice==='spicy'  && ['Spicy','Very Spicy'].includes(sp)) s+=25;

  // ── budget ──
  if (pr !== null) {
    if (ans.budget==='budget'  && pr<200)           s+=20; else if (ans.budget==='budget')  s-=15;
    if (ans.budget==='mid'     && pr>=200&&pr<=500) s+=20; else if (ans.budget==='mid')     s-=8;
    if (ans.budget==='premium' && pr>500)           s+=20; else if (ans.budget==='premium'&&pr<200) s-=10;
  }

  // ── size / style ──
  if (ans.size==='light') { if (LIGHT_CATS.some(l=>cat.includes(l))) s+=18; if (HEAVY_CATS.some(h=>cat.includes(h))) s-=15; }
  if (ans.size==='heavy') { if (HEAVY_CATS.some(h=>cat.includes(h))) s+=18; }

  // Group style: sharing dishes get a boost for groups that want to share or for large groups
  if (ans.style==='sharing' && isShareable(item)) s+=25;
  if (ans.style==='sharing' && HEAVY_CATS.some(h=>cat.includes(h))) s+=10;
  if (big && isShareable(item)) s+=15; // large groups always benefit from shareable dishes

  // ── mood ──
  if (ans.mood==='popular') { if (item.isPopular||item.isFeatured) s+=30; }
  if (ans.mood==='healthy') { if (HEALTHY_KW.some(k=>txt.includes(k))) s+=20; if (item.calories&&item.calories<400) s+=10; }
  if (ans.mood==='comfort') { if (COMFORT_KW.some(k=>txt.includes(k))) s+=20; }
  if (ans.mood==='new')     { if (item.isFeatured) s+=25; s+=Math.floor(Math.random()*12); }

  s += Math.min((item.views||0)+(item.arViews||0)*2, 20)*0.3;
  return s;
}

function filterItems(items, ans, groupSize=1) {
  return items
    .map(i => ({ item:i, score:scoreItem(i, ans, groupSize) }))
    .filter(({score}) => score > -999)
    .sort((a,b) => b.score - a.score);
}

export default function RestaurantMenu({ restaurant, menuItems, offers, error }) {
  const [activeCat,    setActiveCat]    = useState('All');
  const [selectedItem, setSelectedItem] = useState(null);
  const [showAR,       setShowAR]       = useState(false);
  const [imgErr,       setImgErr]       = useState({});
  const [smaOpen,      setSmaOpen]      = useState(false);
  const [smaMode,      setSmaMode]      = useState(null);    // null | 'solo' | 'group'
  const [groupSize,    setGroupSize]    = useState(null);    // 2|3|4|5|'6+'
  const [smaStep,      setSmaStep]      = useState(0);
  const [smaAnswers,   setSmaAnswers]   = useState({});
  const [smaResults,   setSmaResults]   = useState([]);
  const [darkMode, setDarkMode] = useState(() => {
    if (typeof window === 'undefined') return false;
    return localStorage.getItem('ar_theme') === 'dark';
  });

  useEffect(() => {
    if (restaurant?.id) trackVisit(restaurant.id, getSessionId()).catch(()=>{});
  }, [restaurant?.id]);

  useEffect(() => {
    document.body.style.overflow = (selectedItem||smaOpen) ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [selectedItem, smaOpen]);

  const cats     = ['All', ...new Set((menuItems||[]).map(i=>i.category).filter(Boolean))];
  const filtered = activeCat==='All' ? (menuItems||[]) : (menuItems||[]).filter(i=>i.category===activeCat);
  const arCount  = (menuItems||[]).filter(i=>i.modelURL).length;

  const openItem = useCallback(async (item) => {
    setSelectedItem(item); setShowAR(false);
    if (restaurant?.id) incrementItemView(restaurant.id, item.id).catch(()=>{});
  }, [restaurant?.id]);
  const closeItem     = useCallback(() => { setSelectedItem(null); setShowAR(false); }, []);
  const handleARLaunch = useCallback(async () => {
    if (restaurant?.id && selectedItem?.id) incrementARView(restaurant.id, selectedItem.id).catch(()=>{});
  }, [restaurant?.id, selectedItem?.id]);
  const imgSrc = (item) => (!imgErr[item.id] && item.imageURL) ? item.imageURL : getPlaceholder(item.id);

  const openSMA    = () => { setSmaOpen(true); setSmaMode(null); setGroupSize(null); setSmaStep(0); setSmaAnswers({}); setSmaResults([]); };
  const closeSMA   = () => setSmaOpen(false);
  const restartSMA = () => { setSmaMode(null); setGroupSize(null); setSmaStep(0); setSmaAnswers({}); setSmaResults([]); };
  const activeQs   = smaMode === 'group' ? GROUP_QUESTIONS : SOLO_QUESTIONS;
  const pickAnswer = (qId, val) => {
    const ans = { ...smaAnswers, [qId]: val };
    setSmaAnswers(ans);
    if (smaStep < activeQs.length - 1) setSmaStep(smaStep + 1);
    else { setSmaResults(filterItems(menuItems||[], ans, groupSize)); setSmaStep(activeQs.length); }
  };

  if (error || !restaurant) return (
    <div style={{minHeight:'100vh',background:'#FAF7F2',display:'flex',alignItems:'center',justifyContent:'center',fontFamily:'-apple-system,BlinkMacSystemFont,"SF Pro Display",sans-serif'}}>
      <div style={{textAlign:'center'}}><div style={{fontSize:52,marginBottom:12}}>🍽️</div>
        <h1 style={{fontSize:20,fontWeight:700,color:'#1E1B18'}}>Restaurant not found</h1>
        <p style={{color:'#9A9A9A',marginTop:6,fontSize:14}}>This page doesn't exist or is inactive.</p>
      </div>
    </div>
  );

  return (
    <>
      <Head>
        <title>{restaurant.name} — Menu</title>
        <meta name="description" content={`Explore ${restaurant.name}'s menu`} />
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:ital,opsz,wght@0,14..32,300;0,14..32,400;0,14..32,500;0,14..32,600;0,14..32,700;0,14..32,800;0,14..32,900&display=swap" rel="stylesheet" />
      </Head>

      <div className={darkMode ? 'dm' : ''} id="app-root">
      <style>{`
        html, body { margin:0; padding:0; }
        #app-root { transition: background 0.35s ease; }
        .card, .sheet, .sma-sheet, .hdr { transition: background 0.3s ease, box-shadow 0.3s ease, border-color 0.3s ease !important; }
        *, *::before, *::after { box-sizing:border-box; -webkit-tap-highlight-color:transparent; }

        body {
          background: #FAF7F2 !important;
          min-height: 100vh;
          overflow-x: hidden;
          font-family: 'Inter', -apple-system, BlinkMacSystemFont, "SF Pro Display", sans-serif;
          -webkit-font-smoothing: antialiased;
          -moz-osx-font-smoothing: grayscale;
        }

        @keyframes fadeIn  { from{opacity:0} to{opacity:1} }
        @keyframes fadeUp  { from{opacity:0;transform:translateY(14px)} to{opacity:1;transform:translateY(0)} }
        @keyframes slideUp { from{transform:translateY(100%)} to{transform:translateY(0)} }
        @keyframes blink   { 0%,100%{opacity:1} 50%{opacity:0.15} }

        /* ─────────── HEADER ─────────── */
        .hdr {
          position: sticky; top: 0; z-index: 40;
          background: rgba(255,255,255,0.95);
          backdrop-filter: saturate(180%) blur(20px);
          -webkit-backdrop-filter: saturate(180%) blur(20px);
          border-bottom: 0.5px solid rgba(0,0,0,0.1);
        }
        .hdr-inner { max-width: 1080px; margin: 0 auto; padding: 0 18px; }

        .hdr-top {
          display: flex; align-items: center; gap: 13px;
          padding: 15px 0 13px;
        }
        .r-logo {
          width: 44px; height: 44px; border-radius: 12px; flex-shrink: 0;
          background: linear-gradient(145deg,#F79B3D,#F4C06A);
          display: flex; align-items: center; justify-content: center;
          font-size: 20px;
          box-shadow: 0 3px 12px rgba(247,155,61,0.35);
        }
        .r-name { font-size: 17px; font-weight: 700; color: #1E1B18; letter-spacing: -0.3px; line-height: 1.2; }
        .r-sub  { font-size: 12px; color: #9A9A9A; margin-top: 2px; letter-spacing: -0.1px; }

        .ar-badge {
          margin-left: auto; flex-shrink: 0;
          display: flex; align-items: center; gap: 5px;
          padding: 6px 13px; border-radius: 20px;
          background: rgba(247,155,61,0.1);
          border: 1px solid rgba(247,155,61,0.25);
          font-size: 11px; font-weight: 600; color: #E07020;
          letter-spacing: 0.01em;
        }
        .ar-dot { width: 6px; height: 6px; border-radius: 50%; background: #F79B3D; animation: blink 1.8s infinite; }

        /* ─── CATEGORY TABS — bleeding pill design ─── */
        .cats-outer {
          padding: 4px 0 0;
        }
        .cats-scroll {
          display: flex; gap: 6px;
          overflow-x: scroll; scrollbar-width: none;
          padding: 6px 0 16px;
          -webkit-overflow-scrolling: touch;
          flex-wrap: nowrap;
        }
        .cats-scroll::-webkit-scrollbar { display: none; }

        .cat-pill {
          flex-shrink: 0;
          display: flex; align-items: center; gap: 6px;
          padding: 9px 18px; border-radius: 30px;
          font-size: 13px; font-weight: 500;
          font-family: 'Inter', sans-serif;
          cursor: pointer; white-space: nowrap;
          border: 1.5px solid transparent;
          background: rgba(247,155,61,0.07);
          color: #2B2B2B;
          transition: all 0.2s ease;
          letter-spacing: -0.1px;
          position: relative;
          min-height: 38px;
        }
        .cat-pill:hover:not(.on) {
          background: rgba(247,155,61,0.12);
          color: #1E1B18;
        }
        /* ── Active pill — Tastywala amber ── */
        .cat-pill.on {
          background: #F79B3D;
          color: #FFFFFF;
          font-weight: 700;
          border-color: transparent;
          box-shadow: 0 4px 16px rgba(247,155,61,0.38), 0 1px 4px rgba(247,155,61,0.2);
          letter-spacing: -0.15px;
        }
        .cat-emoji { font-size: 13px; width: 16px; text-align: center; display: inline-block; line-height:1; }

        /* ─────────── MAIN ─────────── */
        .main {
          max-width: 1080px; margin: 0 auto;
          padding: 20px 18px 110px;
          background: #FAF7F2;
        }

        /* AR strip */
        .ar-strip {
          display: flex; align-items: center; gap: 14px;
          padding: 14px 18px; margin-bottom: 20px;
          background: #ffffff;
          border: 1px solid rgba(247,155,61,0.18);
          border-radius: 16px;
          box-shadow: 0 1px 6px rgba(0,0,0,0.06);
          animation: fadeUp 0.4s ease both;
        }
        .ar-strip-icon { font-size: 22px; flex-shrink: 0; }
        .ar-strip-text { font-size: 13px; font-weight: 600; color: #1E1B18; letter-spacing: -0.1px; }
        .ar-strip-sub  { font-size: 11px; color: #9A9A9A; margin-top: 2px; }
        .ar-strip-chip {
          margin-left: auto; flex-shrink: 0;
          padding: 5px 12px; border-radius: 20px;
          background: #F79B3D; color: #fff;
          font-size: 10px; font-weight: 800; letter-spacing: 0.04em;
        }

        /* Offer */
        .offer-bar {
          display: flex; align-items: center; gap: 12px;
          padding: 14px 18px; margin-bottom: 16px;
          background: #fff; border: 1px solid #F0D890;
          border-radius: 16px; box-shadow: 0 1px 6px rgba(0,0,0,0.04);
          animation: fadeUp 0.4s ease both;
        }
        .offer-bar-title { font-size: 13px; font-weight: 600; color: #8B6010; }
        .offer-bar-desc  { font-size: 11px; color: #B09040; margin-top: 1px; }

        /* ─────────── GRID ─────────── */
        .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
        @media (min-width: 600px) and (max-width: 899px) {
          .grid { grid-template-columns: repeat(3, 1fr); }
        }
        @media (min-width: 900px) {
          .grid { grid-template-columns: repeat(4, 1fr); gap: 16px; }
        }

        /* ─────────── CARD — Apple App Store level ─────────── */
        .card {
          background: #FFFFFF;
          border-radius: 20px; overflow: hidden;
          cursor: pointer; position: relative; text-align: left;
          transition: transform 0.2s ease, box-shadow 0.2s ease;
          animation: fadeUp 0.4s ease both;
          box-shadow:
            0 1px 3px rgba(0,0,0,0.06),
            0 4px 16px rgba(0,0,0,0.07);
          border: 1px solid #F0E8DE;
        }
        .card:hover  { transform: translateY(-6px); box-shadow: 0 12px 36px rgba(0,0,0,0.12); }
        .card:active { transform: scale(0.98); }

        /* Card image */
        .c-img { position: relative; overflow: hidden; width: 100%; height: 185px; }
        .c-img img { width:100%; height:100%; object-fit:cover; display:block; transition: transform 0.3s ease; }
        .card:hover .c-img img { transform: scale(1.04); }
        .c-img-ph {
          width:100%; height:100%;
          display:flex; align-items:center; justify-content:center; font-size:48px;
          background: #F5EDE0; border-radius:0;
        }

        /* AR badge — top right, minimal */
        .c-ar-pill {
          position: absolute; top: 10px; right: 10px;
          display: flex; align-items: center; gap: 4px;
          background: rgba(30,27,24,0.78);
          backdrop-filter: blur(8px);
          color: #fff; font-size: 10px; font-weight: 700;
          padding: 4px 9px; border-radius: 8px;
          letter-spacing: 0.03em;
        }

        /* Veg indicator */
        .veg-ind {
          position: absolute; top: 10px; left: 10px;
          width: 20px; height: 20px; border-radius: 4px; border: 2px solid;
          background: rgba(255,255,255,0.92); display: flex; align-items: center; justify-content: center;
        }
        .veg-ind.v  { border-color: #2A8048; }
        .veg-ind.nv { border-color: #C03020; }
        .veg-ind.v::after  { content:''; width:8px; height:8px; border-radius:50%; background:#2A8048; }
        .veg-ind.nv::after { content:''; width:8px; height:8px; border-radius:50%; background:#C03020; }

        /* Offer ribbon */
        .c-ribbon {
          position: absolute; bottom: 0; left: 0; right: 0;
          padding: 5px 12px; font-size: 10px; font-weight: 800; color: #fff;
          text-align: center; letter-spacing: 0.03em;
        }

        /* Card body */
        .c-body { padding: 13px 14px 14px; }

        /* Badges */
        .c-badges { display:flex; gap:5px; flex-wrap:wrap; margin-bottom:6px; }
        .c-badge  { font-size: 10px; font-weight: 600; padding: 3px 9px; border-radius: 6px; }
        .c-badge-pop  { background: #FFF0EB; color: #E07020; }
        .c-badge-feat { background: #F0EBF8; color: #6030A0; }

        .c-name {
          font-size: 15px; font-weight: 700; color: #1E1B18;
          line-height: 1.3; margin-bottom: 8px;
          letter-spacing: -0.2px;
        }

        .c-price-row { display: flex; align-items: center; gap: 8px; margin-bottom: 6px; }
        .c-price { font-size: 16px; font-weight: 800; color: #F79B3D; letter-spacing: -0.3px; }
        .c-cal   { font-size: 11px; color: #7A7A7A; font-weight: 500; }

        .c-meta { display: flex; align-items: center; gap: 7px; flex-wrap: wrap; }
        .c-spice-chip {
          display: inline-flex; align-items: center; gap: 4px;
          font-size: 11px; font-weight: 600;
          padding: 3px 8px; border-radius: 6px;
        }
        .c-prep { font-size: 11px; color: #7A7A7A; }

        /* AR CTA at card bottom */
        .c-ar-cta {
          margin-top: 10px;
          display: flex; align-items: center; justify-content: center; gap: 7px;
          padding: 9px; border-radius: 10px;
          background: #F5F0EA;
          font-size: 11px; font-weight: 700; color: #2B2B2B;
          letter-spacing: 0.04em; text-transform: uppercase;
        }

        /* empty */
        .empty { text-align:center; padding:72px 20px; color:#9A9A9A; }

        /* ─────────── MODAL ─────────── */
        .overlay {
          position: fixed; inset: 0; z-index: 50;
          display: flex; align-items: flex-end; justify-content: center;
          background: rgba(0,0,0,0.5);
          backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px);
          animation: fadeIn 0.18s ease;
        }
        .sheet {
          position: relative; width: 100%; max-width: 540px;
          background: #FFFDF9;
          border-radius: 26px 26px 0 0;
          max-height: 93vh; overflow-y: auto;
          animation: slideUp 0.32s cubic-bezier(0.32,0.72,0,1);
          box-shadow: 0 -8px 40px rgba(0,0,0,0.14);
        }
        .handle-row { display:flex; justify-content:center; padding:12px 0 0; }
        .handle     { width:36px; height:4px; border-radius:2px; background:rgba(0,0,0,0.12); }
        .close-btn {
          position: absolute; top: 14px; right: 16px;
          width: 34px; height: 34px; border-radius: 50%;
          background: rgba(30,27,24,0.72);
          backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px);
          border: 1px solid rgba(255,255,255,0.15);
          color: #FFFFFF; cursor: pointer; font-size: 12px; font-weight: 700;
          display: flex; align-items: center; justify-content: center;
          transition: all 0.18s ease; z-index: 10;
          box-shadow: 0 2px 8px rgba(0,0,0,0.25);
        }
        .close-btn:hover { background: rgba(30,27,24,0.92); transform: scale(1.08); }

        .m-hero { margin: 10px 14px 0; border-radius: 16px; overflow: hidden; aspect-ratio: 16/9; position: relative; }
        .m-hero img { width:100%; height:100%; object-fit:cover; display:block; }
        .m-hero-ph  { width:100%; height:100%; display:flex; align-items:center; justify-content:center; font-size:64px; background:#F5EDE0; }

        .sbody { padding: 20px 20px 36px; }
        .m-title { font-size: 24px; font-weight: 800; color: #1E1B18; text-align: center; margin-bottom: 12px; line-height: 1.2; letter-spacing: -0.4px; }

        .m-tags  { display:flex; justify-content:center; gap:7px; flex-wrap:wrap; margin-bottom:12px; }
        .tag { padding:5px 13px; border-radius:8px; font-size:12px; font-weight:600; }
        .tag-cat { background:#F5F0EA; color:#2B2B2B; }
        .tag-veg { background:#E8F5EE; color:#1A6A38; }
        .tag-nv  { background:#FDECEA; color:#8B2010; }
        .tag-pop { background:#FFF0EB; color:#E07020; }

        .m-pills { display:flex; justify-content:center; gap:7px; flex-wrap:wrap; margin-bottom:14px; }
        .m-pill  { display:flex; align-items:center; gap:5px; padding:6px 14px; border-radius:8px; font-size:12px; font-weight:600; background:#F5F0EA; color:#2B2B2B; }

        .m-price     { text-align:center; font-size:34px; font-weight:800; color:#F79B3D; letter-spacing:-0.6px; }
        .m-price-sub { text-align:center; font-size:11px; color:#7A7A7A; margin-top:2px; margin-bottom:14px; }
        .m-desc      { font-size:14px; color:#5A5A5A; line-height:1.7; text-align:center; margin-bottom:20px; letter-spacing:-0.1px; }

        .divider { height:0.5px; background:rgba(0,0,0,0.1); margin:16px 0; }
        .sec-lbl { font-size:11px; font-weight:700; color:#7A7A7A; letter-spacing:0.08em; text-transform:uppercase; margin-bottom:12px; }

        .nutr { display:grid; grid-template-columns:repeat(4,1fr); gap:8px; margin-bottom:20px; }
        .nc   { background:#FAF7F2; border:0.5px solid rgba(0,0,0,0.07); border-radius:12px; padding:13px 8px; text-align:center; }
        .nc-v { font-size:20px; font-weight:800; color:#F79B3D; letter-spacing:-0.3px; }
        .nc-u { font-size:10px; color:#7A7A7A; margin-top:1px; }
        .nc-l { font-size:10px; color:#5A5A5A; margin-top:3px; font-weight:600; }

        .ings { display:flex; flex-wrap:wrap; gap:6px; margin-bottom:22px; }
        .ing  { padding:6px 13px; border-radius:8px; font-size:12px; color:#2B2B2B; background:#F5F0EA; font-weight:500; }

        /* AR Button */
        .ar-btn {
          width:100%; padding:17px; border-radius:50px; border:none;
          background: #F79B3D; color: #FFFFFF;
          font-family: 'Inter', sans-serif; font-weight: 700; font-size: 15px;
          cursor:pointer; display:flex; align-items:center; justify-content:center; gap:11px;
          box-shadow: 0 6px 20px rgba(247,155,61,0.38);
          transition: transform 0.15s, box-shadow 0.15s;
          letter-spacing: -0.1px;
        }
        .ar-btn:hover  { transform:translateY(-2px); box-shadow:0 10px 28px rgba(247,155,61,0.48); }
        .ar-btn:active { transform:scale(0.98); }
        .ar-btn-sub { color:rgba(255,255,255,0.75); font-weight:800; }
        .ar-hint { text-align:center; font-size:11px; color:#7A7A7A; margin-top:9px; letter-spacing:-0.1px; }

        /* ─────────── FAB — properly centered ─────────── */
        .fab-wrap {
          position: fixed;
          bottom: 28px; left: 0; right: 0;
          display: flex; justify-content: center;
          z-index: 45;
          pointer-events: none;
        }
        .sma-fab {
          pointer-events: all;
          display: flex; align-items: center; gap: 8px;
          padding: 14px 28px; border-radius: 50px; border: none;
          background: #F79B3D; color: #FFFFFF;
          font-family: 'Inter', sans-serif; font-weight: 700; font-size: 15px;
          cursor: pointer; white-space: nowrap; letter-spacing: -0.1px;
          box-shadow: 0 6px 24px rgba(247,155,61,0.45), 0 2px 8px rgba(247,155,61,0.25);
          transition: transform 0.2s ease, box-shadow 0.2s ease;
          animation: fadeUp 0.5s 0.3s ease both;
        }
        .sma-fab:hover  { transform: translateY(-3px); box-shadow: 0 12px 32px rgba(247,155,61,0.55); }
        .sma-fab:active { transform: scale(0.97); }
        .sma-fab-icon   { font-size: 17px; }

        /* ─────────── SMART MENU ASSISTANT ─────────── */
        .sma-overlay {
          position:fixed; inset:0; z-index:55;
          display:flex; align-items:flex-end; justify-content:center;
          background:rgba(0,0,0,0.5);
          backdrop-filter:blur(8px); -webkit-backdrop-filter:blur(8px);
          animation:fadeIn 0.18s ease;
        }
        .sma-sheet {
          position:relative; width:100%; max-width:540px;
          background:#FFFDF9;
          border-radius:26px 26px 0 0;
          max-height:90vh; overflow-y:auto;
          animation:slideUp 0.32s cubic-bezier(0.32,0.72,0,1);
          box-shadow:0 -8px 40px rgba(0,0,0,0.15);
          font-family:'Inter',sans-serif;
        }
        .sma-prog-wrap { padding:18px 22px 0; }
        .sma-prog-row  { display:flex; align-items:center; justify-content:space-between; margin-bottom:8px; }
        .sma-prog-txt  { font-size:12px; font-weight:600; color:#7A7A7A; letter-spacing:0.01em; }
        .sma-back      { font-size:12px; font-weight:600; color:#7A7A7A; background:none; border:none; cursor:pointer; font-family:'Inter',sans-serif; padding:0; transition:color 0.15s; }
        .sma-back:hover { color:#F79B3D; }
        .sma-prog-bar  { height:3px; background:#F5F0EA; border-radius:99px; overflow:hidden; }
        .sma-prog-fill { height:100%; background:#F79B3D; border-radius:99px; transition:width 0.3s ease; }

        .sma-q-wrap  { padding:26px 22px 34px; }
        .sma-q-emoji { font-size:40px; text-align:center; margin-bottom:12px; }
        .sma-q-text  { font-size:22px; font-weight:800; color:#1E1B18; text-align:center; margin-bottom:5px; line-height:1.25; letter-spacing:-0.4px; }
        .sma-q-sub   { font-size:13px; color:#7A7A7A; text-align:center; margin-bottom:22px; font-weight:500; }
        .sma-opts    { display:flex; flex-direction:column; gap:9px; }
        .sma-opt {
          display:flex; align-items:center; gap:13px;
          padding:14px 18px; border-radius:14px;
          border:1px solid rgba(0,0,0,0.09);
          background:#FDFAF6; cursor:pointer;
          transition:all 0.16s ease; text-align:left; width:100%;
          font-family:'Inter',sans-serif;
        }
        .sma-opt:hover  { background:#FFFAF4; border-color:#F79B3D; transform:translateX(3px); }
        .sma-opt:active { transform:scale(0.98); }
        .sma-opt-emoji  { font-size:24px; flex-shrink:0; }
        .sma-opt-label  { font-size:14px; font-weight:600; color:#1E1B18; letter-spacing:-0.1px; }
        .sma-dismiss    { display:block; text-align:center; margin:18px auto 0; font-size:12px; color:#7A7A7A; background:none; border:none; cursor:pointer; font-family:'Inter',sans-serif; }
        .sma-dismiss:hover { color:#F79B3D; }

        .sma-res-wrap   { padding:20px 20px 40px; }
        .sma-res-hdr    { text-align:center; margin-bottom:22px; }
        .sma-res-emoji  { font-size:38px; margin-bottom:8px; }
        .sma-res-title  { font-size:22px; font-weight:800; color:#1E1B18; margin-bottom:4px; letter-spacing:-0.4px; }
        .sma-res-sub    { font-size:13px; color:#7A7A7A; }
        .sma-cat-lbl    { font-size:11px; font-weight:700; color:#7A7A7A; letter-spacing:0.08em; text-transform:uppercase; margin:18px 0 9px 2px; }
        .sma-item {
          display:flex; align-items:center; gap:12px;
          padding:12px 14px; border-radius:14px; margin-bottom:7px;
          background:#FDFAF6; border:1px solid rgba(0,0,0,0.07);
          cursor:pointer; transition:all 0.15s ease;
          text-align:left; width:100%; font-family:'Inter',sans-serif;
        }
        .sma-item:hover { background:#FFFAF4; border-color:#F79B3D; transform:translateX(3px); }
        .sma-item-img   { width:50px; height:50px; border-radius:12px; object-fit:cover; flex-shrink:0; background:#F5F0EA; }
        .sma-item-name  { font-size:14px; font-weight:700; color:#1E1B18; margin-bottom:4px; letter-spacing:-0.1px; }
        .sma-item-meta  { display:flex; align-items:center; gap:6px; flex-wrap:wrap; }
        .sma-item-price { font-size:14px; font-weight:800; color:#F79B3D; }
        .sma-item-chip  { font-size:10px; font-weight:700; padding:2px 8px; border-radius:6px; }
        .sma-chip-pop   { background:#FFF0EB; color:#E07020; }
        .sma-chip-ar    { background:#E8F5EE; color:#1A6A38; }
        .sma-actions { display:flex; gap:9px; margin-top:22px; }
        .sma-btn-dark  { flex:1; padding:14px; border-radius:50px; border:none; background:#F79B3D; color:#fff; font-family:'Inter',sans-serif; font-weight:700; font-size:14px; cursor:pointer; letter-spacing:-0.1px; box-shadow:0 4px 14px rgba(247,155,61,0.35); }
        .sma-btn-light { flex:1; padding:14px; border-radius:12px; border:1px solid rgba(0,0,0,0.12); background:transparent; color:#2B2B2B; font-family:'Inter',sans-serif; font-weight:600; font-size:14px; cursor:pointer; }
        .sma-btn-light:hover { background:#F5F0EA; }
        .sma-no-match { text-align:center; padding:36px 20px; color:#7A7A7A; font-size:14px; }

        /* ── Mode picker (Solo / Group) ── */
        .sma-mode-wrap { padding:28px 22px 36px; }
        .sma-mode-title { font-size:22px; font-weight:800; color:#1E1B18; text-align:center; margin-bottom:6px; letter-spacing:-0.4px; }
        .sma-mode-sub   { font-size:13px; color:#7A7A7A; text-align:center; margin-bottom:28px; }
        .sma-mode-cards { display:grid; grid-template-columns:1fr 1fr; gap:12px; margin-bottom:18px; }
        .sma-mode-card {
          padding:22px 16px; border-radius:18px;
          border:1.5px solid rgba(0,0,0,0.08); background:#FDFAF6;
          cursor:pointer; text-align:center; transition:all 0.18s ease;
          font-family:'Inter',sans-serif;
        }
        .sma-mode-card:hover { background:#FFFAF4; border-color:#F79B3D; transform:translateY(-2px); box-shadow:0 6px 20px rgba(247,155,61,0.18); }
        .sma-mode-card-emoji { font-size:36px; margin-bottom:10px; }
        .sma-mode-card-name  { font-size:15px; font-weight:800; color:#1E1B18; margin-bottom:4px; letter-spacing:-0.2px; }
        .sma-mode-card-desc  { font-size:11px; color:#7A7A7A; line-height:1.5; }

        /* ── Group size picker ── */
        .sma-size-wrap  { padding:26px 22px 36px; }
        .sma-size-title { font-size:22px; font-weight:800; color:#1E1B18; text-align:center; margin-bottom:6px; letter-spacing:-0.4px; }
        .sma-size-sub   { font-size:13px; color:#7A7A7A; text-align:center; margin-bottom:26px; }
        .sma-size-grid  { display:grid; grid-template-columns:repeat(5,1fr); gap:9px; }
        .sma-size-btn {
          padding:14px 6px; border-radius:14px;
          border:1.5px solid rgba(0,0,0,0.08); background:#FDFAF6;
          cursor:pointer; text-align:center; transition:all 0.18s ease;
          font-family:'Inter',sans-serif;
        }
        .sma-size-btn:hover { background:#FFFAF4; border-color:#F79B3D; transform:translateY(-2px); }
        .sma-size-btn-emoji { font-size:22px; display:block; margin-bottom:6px; }
        .sma-size-btn-num   { font-size:15px; font-weight:800; color:#1E1B18; }
        .sma-size-btn-lbl   { font-size:10px; color:#7A7A7A; margin-top:2px; }

        /* ── Group mode banner in results ── */
        .sma-group-banner {
          display:flex; align-items:center; gap:10px;
          padding:12px 16px; border-radius:12px; margin-bottom:18px;
          background:#F0F7F2; border:1px solid #C8E8D4;
        }
        .sma-group-banner-text { font-size:12px; font-weight:600; color:#1A6A38; }
        .sma-group-banner-sub  { font-size:11px; color:#5A9A6A; margin-top:1px; }

        /* ── Shareable tag on result items ── */
        .sma-chip-share { background:#EEF4FF; color:#3060B0; }

        /* ══════════════════════════════════════════════════════
           DISTRICT-GRADE DARK MODE
           Spec: #0F0F0F base · #1F1F1F cards · amber accent
           Inspired by Zomato District — cinematic, immersive
           ══════════════════════════════════════════════════════ */

        /* ── CSS tokens for dark mode ── */
        .dm {
          color-scheme: dark;
          --bg-base:    #0F0F0F;
          --bg-surface: #181818;
          --bg-card:    #1F1F1F;
          --bg-elevated:#252525;
          --divider:    #2A2A2A;
          --accent:     #F79B3D;
          --accent-glow:rgba(247,155,61,0.22);
          --text-1:     #FFFFFF;
          --text-2:     #B3B3B3;
          --text-muted: #7A7A7A;
          --shadow-card:0 4px 24px rgba(0,0,0,0.5);
          --shadow-hover:0 16px 48px rgba(0,0,0,0.7);
        }

        /* ── Page shell ── */
        #app-root.dm               { background: var(--bg-base); }
        .dm .main                  { background: var(--bg-base) !important; }

        /* ── Sticky header ── */
        .dm .hdr {
          background: rgba(15,15,15,0.94) !important;
          backdrop-filter: saturate(180%) blur(20px) !important;
          -webkit-backdrop-filter: saturate(180%) blur(20px) !important;
          border-bottom: 0.5px solid var(--divider) !important;
        }
        .dm .r-name  { color: var(--text-1) !important; }
        .dm .r-sub   { color: var(--text-muted) !important; }
        .dm .r-logo  {
          background: linear-gradient(145deg,#F79B3D,#C07020) !important;
          box-shadow: 0 3px 12px rgba(247,155,61,0.35) !important;
        }

        /* ── AR Live badge ── */
        .dm .ar-badge {
          background: rgba(247,155,61,0.12) !important;
          border-color: rgba(247,155,61,0.3) !important;
          color: #F79B3D !important;
        }

        /* ── Category pills ── */
        .dm .cat-pill {
          background: var(--bg-elevated) !important;
          color: var(--text-2) !important;
          border-color: transparent !important;
        }
        .dm .cat-pill:hover:not(.on) {
          background: #2E2E2E !important;
          color: var(--text-1) !important;
        }
        .dm .cat-pill.on {
          background: var(--accent) !important;
          color: #fff !important;
          box-shadow: 0 4px 16px rgba(247,155,61,0.45) !important;
        }

        /* ── AR strip & offer bar ── */
        .dm .ar-strip {
          background: var(--bg-card) !important;
          border-color: rgba(247,155,61,0.18) !important;
          box-shadow: 0 2px 16px rgba(0,0,0,0.4) !important;
        }
        .dm .ar-strip-text { color: var(--text-1) !important; }
        .dm .ar-strip-sub  { color: var(--text-muted) !important; }

        .dm .offer-bar {
          background: var(--bg-card) !important;
          border-color: rgba(212,160,30,0.2) !important;
          box-shadow: 0 2px 16px rgba(0,0,0,0.4) !important;
        }
        .dm .offer-bar-title { color: #D4A020 !important; }
        .dm .offer-bar-desc  { color: var(--text-muted) !important; }

        /* ── CARDS — cinematic District treatment ── */
        .dm .card {
          background: var(--bg-card) !important;
          border-color: rgba(255,255,255,0.05) !important;
          box-shadow: var(--shadow-card) !important;
        }
        .dm .card:hover {
          box-shadow: var(--shadow-hover) !important;
          border-color: rgba(247,155,61,0.15) !important;
        }

        /* Cinematic bottom-gradient on card images in dark mode */
        .dm .c-img::before {
          content: '';
          position: absolute;
          bottom: 0; left: 0; right: 0;
          height: 55%;
          background: linear-gradient(
            to top,
            rgba(15,15,15,0.72) 0%,
            rgba(15,15,15,0.3) 50%,
            transparent 100%
          );
          pointer-events: none;
          z-index: 1;
        }
        /* Ensure AR pill sits above gradient */
        .dm .c-ar-pill { z-index: 2 !important; }
        .dm .veg-ind   { z-index: 2 !important; }

        .dm .c-img-ph  { background: #282828 !important; }

        /* Card body text */
        .dm .c-name    { color: var(--text-1) !important; }
        .dm .c-price   { color: var(--accent) !important; }
        .dm .c-cal     { color: var(--text-muted) !important; }
        .dm .c-prep    { color: var(--text-muted) !important; }

        /* AR CTA inside card */
        .dm .c-ar-cta  {
          background: rgba(247,155,61,0.1) !important;
          color: var(--accent) !important;
          border-top: 1px solid rgba(247,155,61,0.12) !important;
        }

        /* Badges */
        .dm .c-badge-pop  { background: rgba(247,155,61,0.16) !important; color: var(--accent) !important; }
        .dm .c-badge-feat { background: rgba(120,80,200,0.18) !important; color: #C0A0F0 !important; }

        /* AR pill on card */
        .dm .c-ar-pill { background: rgba(247,155,61,0.85) !important; }

        /* ── MODAL SHEET — layered dark surfaces ── */
        .dm .overlay {
          background: rgba(0,0,0,0.82) !important;
        }
        .dm .sheet {
          background: var(--bg-surface) !important;
          box-shadow: 0 -12px 60px rgba(0,0,0,0.8) !important;
        }
        .dm .handle { background: rgba(255,255,255,0.12) !important; }

        /* Close button — frosted dark glass */
        .dm .close-btn {
          background: rgba(255,255,255,0.1) !important;
          backdrop-filter: blur(12px) !important;
          -webkit-backdrop-filter: blur(12px) !important;
          border-color: rgba(255,255,255,0.12) !important;
          color: var(--text-1) !important;
        }
        .dm .close-btn:hover {
          background: rgba(255,255,255,0.18) !important;
          transform: scale(1.08) !important;
        }

        /* Modal image — dark gradient overlay */
        .dm .m-hero::after {
          content: '';
          position: absolute;
          bottom: 0; left: 0; right: 0; height: 40%;
          background: linear-gradient(to top, rgba(24,24,24,0.7), transparent);
          border-radius: 0 0 16px 16px;
          pointer-events: none;
        }

        /* Modal body */
        .dm .sbody         { background: var(--bg-surface) !important; }
        .dm .m-title       { color: var(--text-1) !important; }
        .dm .m-desc        { color: var(--text-2) !important; }
        .dm .m-price       { color: var(--accent) !important; }
        .dm .m-price-sub   { color: var(--text-muted) !important; }

        /* Modal tags */
        .dm .tag-cat  { background: var(--bg-elevated) !important; color: var(--text-2) !important; border: 1px solid var(--divider) !important; }
        .dm .tag-veg  { background: rgba(30,100,60,0.22) !important; color: #5EC47A !important; }
        .dm .tag-nv   { background: rgba(140,30,30,0.22) !important; color: #E07060 !important; }
        .dm .tag-pop  { background: rgba(247,155,61,0.14) !important; color: var(--accent) !important; }
        .dm .m-pill   { background: var(--bg-elevated) !important; color: var(--text-2) !important; }

        /* Nutrition cards */
        .dm .divider { background: var(--divider) !important; }
        .dm .sec-lbl { color: var(--text-muted) !important; letter-spacing: 0.1em; }
        .dm .nc {
          background: var(--bg-elevated) !important;
          border-color: var(--divider) !important;
          box-shadow: 0 2px 8px rgba(0,0,0,0.3) !important;
        }
        .dm .nc-v  { color: var(--accent) !important; }
        .dm .nc-u  { color: var(--text-muted) !important; }
        .dm .nc-l  { color: var(--text-2) !important; }

        /* Ingredients */
        .dm .ing {
          background: var(--bg-elevated) !important;
          color: var(--text-2) !important;
          border: 1px solid var(--divider) !important;
        }

        /* AR button in modal */
        .dm .ar-btn {
          background: var(--accent) !important;
          box-shadow: 0 6px 24px rgba(247,155,61,0.4) !important;
        }
        .dm .ar-btn:hover { box-shadow: 0 10px 32px rgba(247,155,61,0.55) !important; }
        .dm .ar-hint { color: var(--text-muted) !important; }

        /* ── SMART MENU ASSISTANT ── */
        .dm .sma-overlay { background: rgba(0,0,0,0.85) !important; }

        .dm .sma-sheet {
          background: var(--bg-surface) !important;
          box-shadow: 0 -12px 60px rgba(0,0,0,0.8) !important;
        }

        /* Progress */
        .dm .sma-prog-bar  { background: var(--bg-elevated) !important; }
        .dm .sma-prog-fill { background: var(--accent) !important; }
        .dm .sma-prog-txt  { color: var(--text-muted) !important; }
        .dm .sma-back      { color: var(--text-muted) !important; }
        .dm .sma-back:hover { color: var(--accent) !important; }

        /* Questions */
        .dm .sma-q-text  { color: var(--text-1) !important; }
        .dm .sma-q-sub   { color: var(--text-muted) !important; }

        /* Option rows */
        .dm .sma-opt {
          background: var(--bg-card) !important;
          border-color: var(--divider) !important;
        }
        .dm .sma-opt:hover {
          background: var(--bg-elevated) !important;
          border-color: var(--accent) !important;
          box-shadow: 0 0 0 1px rgba(247,155,61,0.25) !important;
        }
        .dm .sma-opt-label { color: var(--text-1) !important; }
        .dm .sma-dismiss   { color: var(--text-muted) !important; }
        .dm .sma-dismiss:hover { color: var(--accent) !important; }

        /* Result items */
        .dm .sma-res-title  { color: var(--text-1) !important; }
        .dm .sma-res-sub    { color: var(--text-muted) !important; }
        .dm .sma-cat-lbl    { color: var(--text-muted) !important; }
        .dm .sma-item {
          background: var(--bg-card) !important;
          border-color: var(--divider) !important;
        }
        .dm .sma-item:hover {
          background: var(--bg-elevated) !important;
          border-color: var(--accent) !important;
        }
        .dm .sma-item-name  { color: var(--text-1) !important; }
        .dm .sma-item-price { color: var(--accent) !important; }

        /* Badges inside SMA */
        .dm .sma-chip-pop   { background: rgba(247,155,61,0.14) !important; color: var(--accent) !important; }
        .dm .sma-chip-ar    { background: rgba(40,100,70,0.2) !important; color: #5EC47A !important; }
        .dm .sma-chip-share { background: rgba(40,80,180,0.2) !important; color: #80A8F0 !important; }

        /* Mode picker */
        .dm .sma-mode-title { color: var(--text-1) !important; }
        .dm .sma-mode-sub   { color: var(--text-muted) !important; }
        .dm .sma-mode-card {
          background: var(--bg-card) !important;
          border-color: var(--divider) !important;
        }
        .dm .sma-mode-card:hover {
          background: var(--bg-elevated) !important;
          border-color: var(--accent) !important;
          box-shadow: 0 0 0 1px rgba(247,155,61,0.2), 0 8px 24px rgba(0,0,0,0.4) !important;
        }
        .dm .sma-mode-card-name { color: var(--text-1) !important; }
        .dm .sma-mode-card-desc { color: var(--text-muted) !important; }

        /* Size picker */
        .dm .sma-size-title { color: var(--text-1) !important; }
        .dm .sma-size-sub   { color: var(--text-muted) !important; }
        .dm .sma-size-btn {
          background: var(--bg-card) !important;
          border-color: var(--divider) !important;
        }
        .dm .sma-size-btn:hover {
          background: var(--bg-elevated) !important;
          border-color: var(--accent) !important;
        }
        .dm .sma-size-btn-num { color: var(--text-1) !important; }
        .dm .sma-size-btn-lbl { color: var(--text-muted) !important; }

        /* Group banner */
        .dm .sma-group-banner {
          background: rgba(20,70,40,0.25) !important;
          border-color: rgba(50,120,70,0.3) !important;
        }
        .dm .sma-group-banner-text { color: #5EC47A !important; }
        .dm .sma-group-banner-sub  { color: #3E9A5A !important; }

        /* Action buttons */
        .dm .sma-btn-dark {
          background: var(--accent) !important;
          box-shadow: 0 4px 16px rgba(247,155,61,0.35) !important;
        }
        .dm .sma-btn-light {
          background: transparent !important;
          border-color: var(--divider) !important;
          color: var(--text-2) !important;
        }
        .dm .sma-btn-light:hover {
          background: var(--bg-elevated) !important;
          border-color: rgba(255,255,255,0.15) !important;
        }
        .dm .sma-no-match { color: var(--text-muted) !important; }

        /* FAB in dark mode */
        .dm .sma-fab {
          background: var(--accent) !important;
          box-shadow: 0 6px 28px rgba(247,155,61,0.5), 0 2px 8px rgba(0,0,0,0.5) !important;
        }
        .dm .sma-fab:hover {
          box-shadow: 0 12px 40px rgba(247,155,61,0.65), 0 4px 12px rgba(0,0,0,0.5) !important;
        }

        /* ── Empty state ── */
        .dm .empty p { color: var(--text-muted) !important; }

        /* ── Spice chips ── */
        .dm .c-spice-chip {
          filter: brightness(0.85) saturate(1.2) !important;
        }

        /* ── Dark scrollbar ── */
        .dm ::-webkit-scrollbar-track { background: var(--bg-surface) !important; }
        .dm ::-webkit-scrollbar-thumb { background: var(--bg-elevated) !important; }
        .dm ::-webkit-scrollbar-thumb:hover { background: var(--accent) !important; }

        /* ─────────────────────────────────────
           THEME TOGGLE BUTTON
           ───────────────────────────────────── */
        .theme-toggle {
          margin-left: 10px; flex-shrink: 0;
          width: 36px; height: 36px; border-radius: 50%; border: none;
          display: flex; align-items: center; justify-content: center;
          cursor: pointer; font-size: 16px;
          background: rgba(247,155,61,0.1);
          transition: all 0.22s cubic-bezier(0.34,1.56,0.64,1);
        }
        .theme-toggle:hover {
          background: rgba(247,155,61,0.18);
          transform: rotate(20deg) scale(1.1);
        }
        .dm .theme-toggle  { background: rgba(255,255,255,0.07); }
        .dm .theme-toggle:hover { background: rgba(255,255,255,0.12); transform: rotate(20deg) scale(1.1); }



        /* ══════════════════════════════
           FIX: IMAGE FULL COVER
           ══════════════════════════════ */
        /* Changed from aspect-ratio to fixed height so ALL cards have identical image area */

        /* ══════════════════════════════
           EXTRA ANIMATIONS
           ══════════════════════════════ */
        @keyframes cardPop {
          0%   { opacity:0; transform:translateY(20px) scale(0.95); }
          60%  { opacity:1; transform:translateY(-3px) scale(1.01); }
          100% { opacity:1; transform:translateY(0) scale(1); }
        }
        @keyframes chipSlide {
          from { opacity:0; transform:translateX(-8px); }
          to   { opacity:1; transform:translateX(0); }
        }
        @keyframes stripBounce {
          0%  { opacity:0; transform:translateY(-8px); }
          70% { transform:translateY(2px); }
          100%{ opacity:1; transform:translateY(0); }
        }
        @keyframes pricePop {
          0%   { transform:scale(0.8); opacity:0; }
          70%  { transform:scale(1.08); }
          100% { transform:scale(1); opacity:1; }
        }
        @keyframes shimmerSlide {
          from { transform:translateX(-100%); }
          to   { transform:translateX(200%); }
        }
        @keyframes modalIn {
          from { opacity:0; transform:translateY(60px); }
          to   { opacity:1; transform:translateY(0); }
        }
        @keyframes badgePop {
          0%  { transform:scale(0); opacity:0; }
          70% { transform:scale(1.15); }
          100%{ transform:scale(1); opacity:1; }
        }
        @keyframes headerDrop {
          from { opacity:0; transform:translateY(-12px); }
          to   { opacity:1; transform:translateY(0); }
        }

        /* Apply card pop animation */
        .card { animation: cardPop 0.45s cubic-bezier(0.34,1.56,0.64,1) both !important; }
        /* Chip animations */
        .c-badge { animation: badgePop 0.3s 0.15s cubic-bezier(0.34,1.56,0.64,1) both; }
        /* AR strip animation */
        .ar-strip  { animation: stripBounce 0.5s ease both !important; }
        .offer-bar { animation: stripBounce 0.5s 0.1s ease both !important; }
        /* Pill slide */
        .cat-pill  { animation: chipSlide 0.3s ease both; }
        /* Header */
        .hdr-top   { animation: headerDrop 0.4s ease both; }

        /* Shimmer on card image hover */
        .c-img::after {
          content:''; position:absolute; inset:0;
          background:linear-gradient(105deg,transparent 40%,rgba(255,255,255,0.18) 50%,transparent 60%);
          transform:translateX(-100%); pointer-events:none; border-radius:inherit;
          transition:none;
        }
        .card:hover .c-img::after {
          animation: shimmerSlide 0.6s ease forwards;
        }

        /* Price pop on modal open */
        .m-price { animation: pricePop 0.5s 0.2s cubic-bezier(0.34,1.56,0.64,1) both; }

        /* Sheet uses modalIn (already has slideUp, keep as is) */

      `}</style>

      {/* ─── HEADER ─── */}
      <header className="hdr">
        <div className="hdr-inner">
          <div className="hdr-top">
            <div className="r-logo">🍽️</div>
            <div>
              <div className="r-name">{restaurant.name}</div>
              <div className="r-sub">Tap any dish · See it in AR on your table</div>
            </div>
            <button className="theme-toggle" onClick={()=>setDarkMode(d=>{ const next=!d; if(typeof window!=="undefined") localStorage.setItem("ar_theme",next?"dark":"light"); return next; })} title={darkMode?"Switch to Light":"Switch to Dark"}>
              {darkMode ? "☀️" : "🌙"}
            </button>
            {arCount > 0 && (
              <div className="ar-badge"><span className="ar-dot"/>AR Live</div>
            )}
          </div>
          {/* Category tabs */}
          <div className="cats-outer">
            <div className="cats-scroll">
              {cats.map(c => (
                <button key={c} className={`cat-pill${activeCat===c?' on':''}`} style={{animationDelay:`${cats.indexOf(c)*0.04}s`}} onClick={()=>setActiveCat(c)}>
                  <span className="cat-emoji">{catIcon(c)}</span>
                  {c}
                </button>
              ))}
            </div>
          </div>
        </div>
      </header>

      <main className="main">

        {/* Offer */}
        {offers?.[0] && (
          <div className="offer-bar">
            <span style={{fontSize:20}}>🎉</span>
            <div>
              <div className="offer-bar-title">{offers[0].title}</div>
              {offers[0].description && <div className="offer-bar-desc">{offers[0].description}</div>}
            </div>
          </div>
        )}

        {/* AR strip */}
        {arCount > 0 && (
          <div className="ar-strip">
            <span className="ar-strip-icon">🥽</span>
            <div>
              <div className="ar-strip-text">{arCount} dish{arCount!==1?'es':''} available in AR</div>
              <div className="ar-strip-sub">No app needed · Tap a card, then View in AR</div>
            </div>
            <div className="ar-strip-chip">TRY IT</div>
          </div>
        )}

        {/* Grid */}
        {filtered.length === 0 ? (
          <div className="empty">
            <div style={{fontSize:44,marginBottom:10}}>🥢</div>
            <p style={{fontWeight:600,fontSize:14,color:'#9A9A9A'}}>No items in this category</p>
          </div>
        ) : (
          <div className="grid">
            {filtered.map((item, idx) => (
              <button key={item.id} className="card" style={{animationDelay:`${idx*0.05}s`}} onClick={()=>openItem(item)}>
                <div className="c-img">
                  <img src={imgSrc(item)} alt={item.name} loading="lazy"
                    onError={()=>setImgErr(e=>({...e,[item.id]:true}))}/>
                  {item.modelURL && (
                    <span className="c-ar-pill">
                      <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/>
                      </svg>
                      AR
                    </span>
                  )}
                  {typeof item.isVeg === 'boolean' && <span className={`veg-ind ${item.isVeg?'v':'nv'}`}/>}
                  {item.offerBadge && item.offerLabel && (
                    <div className="c-ribbon" style={{background:item.offerColor||'#F79B3D'}}>🏷 {item.offerLabel}</div>
                  )}
                </div>
                <div className="c-body">
                  {(item.isPopular||item.isFeatured) && (
                    <div className="c-badges">
                      {item.isFeatured && <span className="c-badge c-badge-feat">⭐ Featured</span>}
                      {item.isPopular  && <span className="c-badge c-badge-pop">✦ Popular</span>}
                    </div>
                  )}
                  <div className="c-name">{item.name}</div>
                  <div className="c-price-row">
                    {item.price    && <PriceCounter price={item.price} className="c-price"/>}
                    {item.calories && <span className="c-cal">{item.calories} kcal</span>}
                  </div>
                  {(item.spiceLevel && item.spiceLevel!=='None' || item.prepTime) && (
                    <div className="c-meta">
                      {item.spiceLevel && item.spiceLevel!=='None' && SPICE_MAP[item.spiceLevel] && (
                        <span className="c-spice-chip" style={{background:SPICE_MAP[item.spiceLevel].bg,color:SPICE_MAP[item.spiceLevel].color}}>
                          {SPICE_MAP[item.spiceLevel].dot} {SPICE_MAP[item.spiceLevel].label}
                        </span>
                      )}
                      {item.prepTime && <span className="c-prep">⏱ {item.prepTime}</span>}
                    </div>
                  )}
                  {item.modelURL && (
                    <div className="c-ar-cta">
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/>
                      </svg>
                      View in AR
                    </div>
                  )}
                </div>
              </button>
            ))}
          </div>
        )}
      </main>

      {/* ─── FAB — properly centered with wrapper ─── */}
      {!selectedItem && !smaOpen && (
        <div className="fab-wrap">
          <button className="sma-fab" onClick={openSMA}>
            <span className="sma-fab-icon">✨</span>
            Help Me Choose
          </button>
        </div>
      )}

      {/* ─── ITEM MODAL ─── */}
      {selectedItem && (
        <div className="overlay" onClick={e=>{if(e.target===e.currentTarget)closeItem();}}>
          <div className="sheet">
            <div className="handle-row"><div className="handle"/></div>
            <button className="close-btn" onClick={closeItem}>✕</button>
            {!showAR && (
              <div className="m-hero">
                <img src={imgSrc(selectedItem)} alt={selectedItem.name}
                  onError={()=>setImgErr(e=>({...e,[selectedItem.id]:true}))}/>
                {selectedItem.offerBadge && selectedItem.offerLabel && (
                  <div style={{position:'absolute',bottom:0,left:0,right:0,padding:'7px 14px',background:selectedItem.offerColor||'#F79B3D',color:'#fff',fontSize:12,fontWeight:700,textAlign:'center'}}>
                    🏷 {selectedItem.offerLabel}
                  </div>
                )}
              </div>
            )}
            <div className="sbody">
              <h2 className="m-title">{selectedItem.name}</h2>
              <div className="m-tags">
                {selectedItem.category && <span className="tag tag-cat">{selectedItem.category}</span>}
                {typeof selectedItem.isVeg==='boolean' && <span className={selectedItem.isVeg?'tag tag-veg':'tag tag-nv'}>{selectedItem.isVeg?'● Veg':'● Non-Veg'}</span>}
                {selectedItem.isPopular && <span className="tag tag-pop">✦ Popular</span>}
              </div>
              {(selectedItem.prepTime || (selectedItem.spiceLevel&&selectedItem.spiceLevel!=='None')) && (
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
                <div className="divider"/>
                <div className="sec-lbl">Nutrition</div>
                <div className="nutr">
                  {[{l:'Calories',v:selectedItem.calories,u:'kcal'},{l:'Protein',v:selectedItem.protein,u:'g'},{l:'Carbs',v:selectedItem.carbs,u:'g'},{l:'Fats',v:selectedItem.fats,u:'g'}]
                    .filter(n=>n.v).map(n=>(<div key={n.l} className="nc"><div className="nc-v">{n.v}</div><div className="nc-u">{n.u}</div><div className="nc-l">{n.l}</div></div>))}
                </div>
              </>)}
              {selectedItem.ingredients?.length>0 && (<>
                <div className="sec-lbl">Ingredients</div>
                <div className="ings">{selectedItem.ingredients.map(ing=><span key={ing} className="ing">{ing}</span>)}</div>
              </>)}
              {!showAR && selectedItem.modelURL && (<>
                <div className="divider"/>
                <button className="ar-btn" onClick={()=>{setShowAR(true);handleARLaunch();}}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg>
                  View in AR — <span className="ar-btn-sub">Point at Your Table</span>
                </button>
                <div className="ar-hint">No app needed · Works on Android Chrome &amp; iOS Safari</div>
              </>)}
              {showAR && <ARViewerEmbed modelURL={selectedItem.modelURL} itemName={selectedItem.name} onARLaunch={handleARLaunch}/>}
            </div>
          </div>
        </div>
      )}

      {/* ─── SMART MENU ASSISTANT ─── */}
      {smaOpen && (
        <div className="sma-overlay" onClick={e=>{if(e.target===e.currentTarget)closeSMA();}}>
          <div className="sma-sheet">
            <div className="handle-row"><div className="handle"/></div>

            {/* ── SCREEN 1: Solo vs Group picker ── */}
            {!smaMode && (
              <div className="sma-mode-wrap">
                <div style={{fontSize:40,textAlign:'center',marginBottom:12}}>✨</div>
                <div className="sma-mode-title">Help Me Choose</div>
                <div className="sma-mode-sub">Are you ordering just for yourself or for a group?</div>
                <div className="sma-mode-cards">
                  <button className="sma-mode-card" onClick={()=>{ setSmaMode('solo'); setSmaStep(0); }}>
                    <div className="sma-mode-card-emoji">🙋</div>
                    <div className="sma-mode-card-name">Just Me</div>
                    <div className="sma-mode-card-desc">Personalised picks for your taste</div>
                  </button>
                  <button className="sma-mode-card" onClick={()=>setSmaMode('group')}>
                    <div className="sma-mode-card-emoji">👥</div>
                    <div className="sma-mode-card-name">Group</div>
                    <div className="sma-mode-card-desc">Dishes that work for everyone at the table</div>
                  </button>
                </div>
                <button className="sma-dismiss" onClick={closeSMA}>Dismiss</button>
              </div>
            )}

            {/* ── SCREEN 2 (Group only): How many people? ── */}
            {smaMode === 'group' && !groupSize && (
              <div className="sma-size-wrap">
                <div style={{fontSize:36,textAlign:'center',marginBottom:12}}>👥</div>
                <div className="sma-size-title">How many people?</div>
                <div className="sma-size-sub">We'll suggest the right portions and shareable dishes</div>
                <div className="sma-size-grid">
                  {GROUP_SIZES.map(({n,e})=>(
                    <button key={n} className="sma-size-btn" onClick={()=>{ setGroupSize(n); setSmaStep(0); }}>
                      <span className="sma-size-btn-emoji">{e}</span>
                      <div className="sma-size-btn-num">{n}</div>
                      <div className="sma-size-btn-lbl">{n==='6+' ? 'people' : n===1 ? 'person' : 'people'}</div>
                    </button>
                  ))}
                </div>
                <button className="sma-dismiss" style={{marginTop:22}} onClick={()=>setSmaMode(null)}>← Back</button>
              </div>
            )}

            {/* ── SCREENS 3–7: Questions ── */}
            {smaMode && (smaMode==='solo' || groupSize) && smaStep < activeQs.length && (<>
              <div className="sma-prog-wrap">
                <div className="sma-prog-row">
                  <span className="sma-prog-txt">
                    {smaMode==='group' && <span style={{marginRight:8,fontSize:11,background:'#F0F7F2',color:'#1A6A38',padding:'2px 8px',borderRadius:6,fontWeight:700}}>👥 Group of {groupSize}</span>}
                    {smaStep+1} / {activeQs.length}
                  </span>
                  <button className="sma-back" onClick={()=>{
                    if (smaStep > 0) setSmaStep(s=>s-1);
                    else if (smaMode==='group') setGroupSize(null);
                    else setSmaMode(null);
                  }}>← Back</button>
                </div>
                <div className="sma-prog-bar">
                  <div className="sma-prog-fill" style={{width:`${((smaStep+1)/activeQs.length)*100}%`}}/>
                </div>
              </div>
              <div className="sma-q-wrap">
                <div className="sma-q-emoji">{activeQs[smaStep].emoji}</div>
                <div className="sma-q-text">{activeQs[smaStep].q}</div>
                <div className="sma-q-sub">{activeQs[smaStep].sub}</div>
                <div className="sma-opts">
                  {activeQs[smaStep].opts.map(o=>(
                    <button key={o.v} className="sma-opt" onClick={()=>pickAnswer(activeQs[smaStep].id, o.v)}>
                      <span className="sma-opt-emoji">{o.e}</span>
                      <span className="sma-opt-label">{o.l}</span>
                    </button>
                  ))}
                </div>
                <button className="sma-dismiss" onClick={closeSMA}>Dismiss</button>
              </div>
            </>)}

            {/* ── RESULTS ── */}
            {smaMode && (smaMode==='solo' || groupSize) && smaStep === activeQs.length && (()=>{
              const top = smaResults.slice(0, 12);
              const cats = {};
              top.forEach(({item})=>{ const c=item.category||'Other'; if(!cats[c]) cats[c]=[]; cats[c].push(item); });
              const isGroup = smaMode === 'group';
              const bigGroup = groupSize === '6+' || (typeof groupSize === 'number' && groupSize >= 4);
              return (
                <div className="sma-res-wrap">
                  <div className="sma-res-hdr">
                    <div className="sma-res-emoji">{isGroup ? '🎯' : '🎯'}</div>
                    <div className="sma-res-title">
                      {top.length > 0
                        ? isGroup ? `${top.length} dishes for the table` : `${top.length} dishes for you`
                        : 'No matches'}
                    </div>
                    <div className="sma-res-sub">
                      {top.length > 0
                        ? isGroup ? 'Works for everyone — tap any dish to see details' : 'Based on your preferences — tap to see details'
                        : 'Try again with different preferences'}
                    </div>
                  </div>

                  {/* Group context banner */}
                  {isGroup && top.length > 0 && (
                    <div className="sma-group-banner">
                      <span style={{fontSize:20}}>👥</span>
                      <div>
                        <div className="sma-group-banner-text">Group of {groupSize} · {bigGroup ? 'Shareable dishes highlighted' : 'Individual portions'}</div>
                        <div className="sma-group-banner-sub">
                          {bigGroup ? 'Look for 🤲 tags — great for the whole table to share' : 'Each person can order their own'}
                        </div>
                      </div>
                    </div>
                  )}

                  {top.length === 0 ? (
                    <div className="sma-no-match">
                      <p>No dishes matched your filters.<br/>Try relaxing some preferences.</p>
                      <button className="sma-btn-dark" style={{marginTop:14,width:'100%'}} onClick={restartSMA}>Try Again</button>
                    </div>
                  ) : (<>
                    {Object.entries(cats).map(([cat, items])=>(
                      <div key={cat}>
                        <div className="sma-cat-lbl">{cat}</div>
                        {items.map(item=>{
                          const shareable = isGroup && isShareable(item);
                          return (
                            <button key={item.id} className="sma-item" onClick={()=>{closeSMA();openItem(item);}}>
                              <img className="sma-item-img" src={imgSrc(item)} alt={item.name}
                                onError={()=>setImgErr(e=>({...e,[item.id]:true}))}/>
                              <div style={{flex:1,minWidth:0}}>
                                <div className="sma-item-name">{item.name}</div>
                                <div className="sma-item-meta">
                                  {item.price    && <span className="sma-item-price">₹{item.price}</span>}
                                  {shareable     && <span className="sma-item-chip sma-chip-share">🤲 Shareable</span>}
                                  {item.isPopular&& <span className="sma-item-chip sma-chip-pop">✦ Popular</span>}
                                  {item.modelURL && <span className="sma-item-chip sma-chip-ar">🥽 AR</span>}
                                  {item.prepTime && <span style={{fontSize:11,color:'#7A7A7A'}}>⏱ {item.prepTime}</span>}
                                </div>
                              </div>
                              <span style={{fontSize:16,color:'#D1D1D6',flexShrink:0}}>›</span>
                            </button>
                          );
                        })}
                      </div>
                    ))}
                    <div className="sma-actions">
                      <button className="sma-btn-light" onClick={restartSMA}>↺ Start Over</button>
                      <button className="sma-btn-dark"  onClick={closeSMA}>Browse Menu →</button>
                    </div>
                  </>)}
                </div>
              );
            })()}
          </div>
        </div>
      )}
    </div>
    </>
  );
}

export async function getServerSideProps({ params }) {
  try {
    const restaurant = await getRestaurantBySubdomain(params.subdomain);
    if (!restaurant) return { props:{restaurant:null,menuItems:[],offers:[],error:'Not found'} };
    const [menuItems, offers] = await Promise.all([getMenuItems(restaurant.id), getActiveOffers(restaurant.id)]);
    return {
      props: {
        restaurant: JSON.parse(JSON.stringify(restaurant)),
        menuItems:  JSON.parse(JSON.stringify(menuItems)),
        offers:     JSON.parse(JSON.stringify(offers)),
        error: null,
      }
    };
  } catch (err) {
    return { props:{restaurant:null,menuItems:[],offers:[],error:err.message} };
  }
}