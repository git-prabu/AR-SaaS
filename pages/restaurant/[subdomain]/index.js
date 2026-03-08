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

function getRating(item) {
  if (!item) return 4.2;
  let seed = 0;
  for (let i = 0; i < (item.id||'').length; i++) seed = (seed * 31 + item.id.charCodeAt(i)) >>> 0;
  const base = 3.8 + (seed % 12) * 0.1;
  if (item.isPopular) return Math.min(5.0, parseFloat((base + 0.4).toFixed(1)));
  if (item.isFeatured) return Math.min(5.0, parseFloat((base + 0.2).toFixed(1)));
  return parseFloat(base.toFixed(1));
}

function StarRating({ value }) {
  const full = Math.floor(value);
  const hasHalf = value - full >= 0.5;
  return (
    <span style={{display:'inline-flex',alignItems:'center',gap:2}}>
      {[1,2,3,4,5].map(i => {
        const filled = i <= full;
        const half = !filled && i === full + 1 && hasHalf;
        return (
          <svg key={i} width="11" height="11" viewBox="0 0 24 24"
            fill={filled ? '#F4A836' : 'none'}
            stroke={filled || half ? '#F4A836' : '#4A4030'}
            strokeWidth="2">
            {half && (
              <defs>
                <linearGradient id={`hg${i}`} x1="0" x2="1" y1="0" y2="0">
                  <stop offset="50%" stopColor="#F4A836"/>
                  <stop offset="50%" stopColor="transparent"/>
                </linearGradient>
              </defs>
            )}
            <polygon
              fill={half ? `url(#hg${i})` : (filled ? '#F4A836' : 'none')}
              points="12,2 15.09,8.26 22,9.27 17,14.14 18.18,21.02 12,17.77 5.82,21.02 7,14.14 2,9.27 8.91,8.26"/>
          </svg>
        );
      })}
      <span style={{fontSize:11,fontWeight:700,color:'#F4A836',marginLeft:3}}>{value}</span>
    </span>
  );
}

const SPICE_MAP = {
  Mild:        { label:'Mild',      color:'#D4820A', bg:'rgba(212,130,10,0.15)', dot:'🟡' },
  Medium:      { label:'Medium',    color:'#E07020', bg:'rgba(224,112,32,0.15)', dot:'🟠' },
  Spicy:       { label:'Spicy',     color:'#E04040', bg:'rgba(224,64,64,0.15)',  dot:'🔴' },
  'Very Spicy':{ label:'Very Spicy',color:'#C02020', bg:'rgba(192,32,32,0.15)', dot:'🔴' },
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
  const big = typeof groupSize === 'number' ? groupSize >= 4 : true;
  if (ans.diet==='veg'   && item.isVeg===false) return -999;
  if (ans.diet==='veg'   && item.isVeg===true)  s+=20;
  if (ans.diet==='mixed') { if (item.isVeg===true) s+=8; }
  if (ans.diet==='nonveg'&& item.isVeg===true)  s-=10;
  if (ans.spice==='mild'   && ['Spicy','Very Spicy'].includes(sp)) return -999;
  if (ans.spice==='mild'   && ['None','Mild'].includes(sp)) s+=15;
  if (ans.spice==='medium' && sp==='Medium') s+=20;
  if (ans.spice==='spicy'  && ['Spicy','Very Spicy'].includes(sp)) s+=25;
  if (pr !== null) {
    if (ans.budget==='budget'  && pr<200)           s+=20; else if (ans.budget==='budget')  s-=15;
    if (ans.budget==='mid'     && pr>=200&&pr<=500) s+=20; else if (ans.budget==='mid')     s-=8;
    if (ans.budget==='premium' && pr>500)           s+=20; else if (ans.budget==='premium'&&pr<200) s-=10;
  }
  if (ans.size==='light') { if (LIGHT_CATS.some(l=>cat.includes(l))) s+=18; if (HEAVY_CATS.some(h=>cat.includes(h))) s-=15; }
  if (ans.size==='heavy') { if (HEAVY_CATS.some(h=>cat.includes(h))) s+=18; }
  if (ans.style==='sharing' && isShareable(item)) s+=25;
  if (ans.style==='sharing' && HEAVY_CATS.some(h=>cat.includes(h))) s+=10;
  if (big && isShareable(item)) s+=15;
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

function AnimCard({ children, delay = 0 }) {
  const ref = useRef(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    if (!ref.current) return;
    const obs = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) { setVisible(true); obs.disconnect(); }
    }, { threshold: 0.06 });
    obs.observe(ref.current);
    return () => obs.disconnect();
  }, []);
  return (
    <div ref={ref} style={{
      opacity: visible ? 1 : 0,
      transform: visible ? 'translateY(0)' : 'translateY(22px)',
      transition: `opacity 0.42s ease ${delay}s, transform 0.42s ease ${delay}s`,
    }}>
      {children}
    </div>
  );
}

export default function RestaurantMenu({ restaurant, menuItems, offers, error }) {
  const [activeCat,    setActiveCat]    = useState('All');
  const [selectedItem, setSelectedItem] = useState(null);
  const [showAR,       setShowAR]       = useState(false);
  const [imgErr,       setImgErr]       = useState({});
  const [searchQuery,  setSearchQuery]  = useState('');
  const [vegFilter,    setVegFilter]    = useState('all');
  const [smaOpen,      setSmaOpen]      = useState(false);
  const [smaMode,      setSmaMode]      = useState(null);
  const [groupSize,    setGroupSize]    = useState(null);
  const [smaStep,      setSmaStep]      = useState(0);
  const [smaAnswers,   setSmaAnswers]   = useState({});
  const [smaResults,   setSmaResults]   = useState([]);

  useEffect(() => {
    if (restaurant?.id) trackVisit(restaurant.id, getSessionId()).catch(()=>{});
  }, [restaurant?.id]);

  useEffect(() => {
    document.body.style.overflow = (selectedItem||smaOpen) ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [selectedItem, smaOpen]);

  const cats = ['All', ...new Set((menuItems||[]).map(i=>i.category).filter(Boolean))];

  const filtered = (menuItems||[]).filter(item => {
    if (activeCat !== 'All' && item.category !== activeCat) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const hit = (item.name||'').toLowerCase().includes(q)
        || (item.description||'').toLowerCase().includes(q)
        || (item.category||'').toLowerCase().includes(q);
      if (!hit) return false;
    }
    if (vegFilter === 'veg' && item.isVeg !== true) return false;
    if (vegFilter === 'nonveg' && item.isVeg !== false) return false;
    return true;
  });

  const arCount = (menuItems||[]).filter(i=>i.modelURL).length;

  const openItem = useCallback(async (item) => {
    setSelectedItem(item); setShowAR(false);
    if (restaurant?.id) incrementItemView(restaurant.id, item.id).catch(()=>{});
  }, [restaurant?.id]);
  const closeItem      = useCallback(() => { setSelectedItem(null); setShowAR(false); }, []);
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
    <div style={{minHeight:'100vh',background:'#111009',display:'flex',alignItems:'center',justifyContent:'center',fontFamily:'sans-serif'}}>
      <div style={{textAlign:'center'}}>
        <div style={{fontSize:52,marginBottom:12}}>🍽️</div>
        <h1 style={{fontSize:20,fontWeight:700,color:'#F0EAE0'}}>Restaurant not found</h1>
        <p style={{color:'#6A6058',marginTop:6,fontSize:14}}>This page does not exist or is inactive.</p>
      </div>
    </div>
  );

  return (
    <>
      <Head>
        <title>{restaurant.name} — Menu</title>
        <meta name="description" content={`Explore ${restaurant.name}'s menu with AR`} />
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />
        <link href="https://fonts.googleapis.com/css2?family=Syne:wght@400;600;700;800&family=DM+Sans:opsz,wght@9..40,300;9..40,400;9..40,500;9..40,600;9..40,700&display=swap" rel="stylesheet" />
      </Head>

      <style>{`
        html,body{margin:0;padding:0;}
        *,*::before,*::after{box-sizing:border-box;-webkit-tap-highlight-color:transparent;}
        :root{
          --bg:#111009;--bg2:#181610;--bg3:#222018;--card:#1D1B14;--card-hov:#272520;
          --border:rgba(255,255,255,0.07);--border2:rgba(255,255,255,0.13);
          --orange:#E05A3A;--orange2:#F4784A;--gold:#F4A836;
          --text:#F0EAE0;--text2:#9A9080;--text3:#5A5248;
          --green:#48A878;--red:#D04040;--r:18px;
        }
        body{background:var(--bg)!important;min-height:100vh;overflow-x:hidden;
          font-family:'DM Sans',-apple-system,BlinkMacSystemFont,sans-serif;
          -webkit-font-smoothing:antialiased;color:var(--text);}

        @keyframes fadeIn{from{opacity:0}to{opacity:1}}
        @keyframes fadeUp{from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:translateY(0)}}
        @keyframes slideUp{from{transform:translateY(100%)}to{transform:translateY(0)}}
        @keyframes blink{0%,100%{opacity:1}50%{opacity:0.15}}
        @keyframes pulse{0%,100%{transform:scale(1)}50%{transform:scale(1.1)}}
        @keyframes glow{0%,100%{box-shadow:0 0 14px rgba(224,90,58,0.25)}50%{box-shadow:0 0 28px rgba(224,90,58,0.5)}}

        /* HEADER */
        .hdr{position:sticky;top:0;z-index:40;
          background:rgba(17,16,9,0.9);
          backdrop-filter:saturate(160%) blur(24px);-webkit-backdrop-filter:saturate(160%) blur(24px);
          border-bottom:1px solid var(--border);}
        .hdr-inner{max-width:1100px;margin:0 auto;padding:0 18px;}
        .hdr-top{display:flex;align-items:center;gap:13px;padding:13px 0 11px;}
        .r-logo{width:44px;height:44px;border-radius:13px;flex-shrink:0;
          background:linear-gradient(145deg,#B83820,#E86848);
          display:flex;align-items:center;justify-content:center;font-size:20px;
          box-shadow:0 4px 16px rgba(184,56,32,0.45);}
        .r-name{font-family:'Syne',sans-serif;font-size:17px;font-weight:800;color:var(--text);letter-spacing:-0.2px;line-height:1.2;}
        .r-sub{font-size:12px;color:var(--text3);margin-top:2px;}
        .ar-live-badge{margin-left:auto;flex-shrink:0;
          display:flex;align-items:center;gap:6px;padding:7px 13px;border-radius:22px;
          background:rgba(224,90,58,0.1);border:1px solid rgba(224,90,58,0.28);
          font-size:11px;font-weight:700;color:var(--orange2);letter-spacing:0.04em;text-transform:uppercase;
          animation:glow 2.8s ease infinite;}
        .ar-dot{width:7px;height:7px;border-radius:50%;background:var(--orange);animation:blink 1.6s infinite;}

        /* SEARCH */
        .search-wrap{display:flex;gap:8px;align-items:center;padding:2px 0 8px;}
        .search-box{flex:1;display:flex;align-items:center;gap:10px;
          background:var(--bg3);border:1px solid var(--border);border-radius:13px;padding:10px 14px;
          transition:border-color 0.18s;}
        .search-box:focus-within{border-color:rgba(224,90,58,0.45);}
        .search-box input{flex:1;background:none;border:none;outline:none;
          font-family:'DM Sans',sans-serif;font-size:14px;color:var(--text);caret-color:var(--orange);}
        .search-box input::placeholder{color:var(--text3);}
        .s-icon{color:var(--text3);flex-shrink:0;}
        .filter-btns{display:flex;gap:6px;flex-shrink:0;}
        .filter-btn{padding:9px 13px;border-radius:11px;
          border:1px solid var(--border);background:var(--bg3);
          font-family:'DM Sans',sans-serif;font-size:12px;font-weight:600;
          color:var(--text2);cursor:pointer;white-space:nowrap;transition:all 0.17s ease;}
        .filter-btn:hover{border-color:var(--border2);color:var(--text);}
        .filter-btn.on-veg{background:rgba(72,168,120,0.13);border-color:rgba(72,168,120,0.38);color:var(--green);}
        .filter-btn.on-nonveg{background:rgba(208,64,64,0.1);border-color:rgba(208,64,64,0.32);color:var(--red);}
        @media(max-width:440px){.filter-btns{display:none;}}

        /* CATEGORIES */
        .cats-outer{padding:2px 0 0;}
        .cats-scroll{display:flex;gap:7px;overflow-x:scroll;scrollbar-width:none;
          padding:6px 0 14px;-webkit-overflow-scrolling:touch;flex-wrap:nowrap;}
        .cats-scroll::-webkit-scrollbar{display:none;}
        .cat-pill{flex-shrink:0;display:flex;align-items:center;gap:6px;
          padding:8px 15px;border-radius:30px;
          font-family:'DM Sans',sans-serif;font-size:13px;font-weight:500;
          cursor:pointer;white-space:nowrap;border:1px solid var(--border);
          background:var(--bg3);color:var(--text2);transition:all 0.17s ease;}
        .cat-pill:hover:not(.on){border-color:var(--border2);color:var(--text);background:var(--card);}
        .cat-pill.on{background:var(--orange);color:#fff;font-weight:700;
          border-color:transparent;box-shadow:0 4px 18px rgba(224,90,58,0.38);transform:translateY(-1px);}
        .cat-emoji{font-size:14px;}

        /* MAIN */
        .main{max-width:1100px;margin:0 auto;padding:20px 18px 120px;}

        /* AR STRIP */
        .ar-strip{display:flex;align-items:center;gap:14px;
          padding:14px 18px;margin-bottom:20px;
          background:linear-gradient(135deg,rgba(224,90,58,0.08),rgba(244,120,74,0.04));
          border:1px solid rgba(224,90,58,0.22);border-radius:var(--r);
          animation:fadeUp 0.4s ease both;}
        .ar-strip-icon{font-size:24px;flex-shrink:0;animation:pulse 3.5s ease infinite;}
        .ar-strip-text{font-family:'Syne',sans-serif;font-size:14px;font-weight:700;color:var(--text);letter-spacing:-0.1px;}
        .ar-strip-sub{font-size:11px;color:var(--text3);margin-top:2px;}
        .ar-strip-cta{margin-left:auto;flex-shrink:0;
          padding:8px 16px;border-radius:22px;
          background:var(--orange);color:#fff;
          font-size:11px;font-weight:800;letter-spacing:0.05em;text-transform:uppercase;
          box-shadow:0 4px 14px rgba(224,90,58,0.38);}

        /* OFFER */
        .offer-bar{display:flex;align-items:center;gap:12px;
          padding:14px 18px;margin-bottom:16px;
          background:rgba(244,168,54,0.07);border:1px solid rgba(244,168,54,0.22);
          border-radius:var(--r);animation:fadeUp 0.4s ease both;}
        .offer-bar-title{font-size:13px;font-weight:600;color:#D4900A;}
        .offer-bar-desc{font-size:11px;color:#7A6020;margin-top:1px;}

        /* SECTION HEADER */
        .sec-hdr{display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;}
        .sec-title{font-family:'Syne',sans-serif;font-size:13px;font-weight:700;
          color:var(--text3);letter-spacing:0.08em;text-transform:uppercase;}
        .sec-count{font-size:12px;color:var(--text3);}

        /* GRID */
        .grid{display:grid;grid-template-columns:1fr;gap:14px;}
        @media(min-width:460px){.grid{grid-template-columns:1fr 1fr;}}
        @media(min-width:700px){.grid{grid-template-columns:repeat(3,1fr);gap:16px;}}
        @media(min-width:980px){.grid{grid-template-columns:repeat(4,1fr);}}

        /* CARD */
        .card{background:var(--card);border-radius:var(--r);overflow:hidden;
          cursor:pointer;position:relative;text-align:left;width:100%;
          border:1px solid var(--border);padding:0;
          transition:transform 0.22s ease,box-shadow 0.22s ease,border-color 0.22s ease,background 0.22s ease;}
        .card:hover{transform:translateY(-7px);
          box-shadow:0 18px 44px rgba(0,0,0,0.55),0 4px 12px rgba(224,90,58,0.12);
          border-color:rgba(224,90,58,0.22);background:var(--card-hov);}
        .card:active{transform:scale(0.98) translateY(-2px);}

        .c-img{position:relative;overflow:hidden;width:100%;aspect-ratio:4/3;}
        .c-img img{width:100%;height:100%;object-fit:cover;display:block;transition:transform 0.36s ease;}
        .card:hover .c-img img{transform:scale(1.08);}
        .c-img-ph{width:100%;height:100%;display:flex;align-items:center;justify-content:center;font-size:52px;background:var(--bg3);}
        .c-img-overlay{position:absolute;bottom:0;left:0;right:0;height:55%;
          background:linear-gradient(to top,rgba(17,16,9,0.85),transparent);pointer-events:none;}

        .c-ar-pill{position:absolute;top:10px;right:10px;
          display:flex;align-items:center;gap:4px;
          background:var(--orange);color:#fff;font-size:9px;font-weight:800;
          padding:4px 9px;border-radius:7px;letter-spacing:0.05em;text-transform:uppercase;
          box-shadow:0 3px 10px rgba(224,90,58,0.5);transition:transform 0.18s;}
        .card:hover .c-ar-pill{transform:scale(1.07);}

        .veg-ind{position:absolute;top:10px;left:10px;
          width:20px;height:20px;border-radius:4px;border:2px solid;
          background:rgba(17,16,9,0.8);backdrop-filter:blur(4px);
          display:flex;align-items:center;justify-content:center;}
        .veg-ind.v{border-color:#48A878;}
        .veg-ind.nv{border-color:#D04040;}
        .veg-ind.v::after{content:'';width:8px;height:8px;border-radius:50%;background:#48A878;}
        .veg-ind.nv::after{content:'';width:8px;height:8px;border-radius:50%;background:#D04040;}

        .c-pop-badge{position:absolute;bottom:10px;left:10px;
          padding:3px 10px;border-radius:6px;
          background:var(--gold);color:#1A1200;
          font-size:10px;font-weight:800;letter-spacing:0.03em;}

        .c-ribbon{position:absolute;bottom:0;left:0;right:0;
          padding:5px 12px;font-size:10px;font-weight:800;color:#fff;
          text-align:center;letter-spacing:0.03em;}

        .c-body{padding:12px 13px 13px;}
        .c-name{font-family:'Syne',sans-serif;font-size:14px;font-weight:800;color:var(--text);
          line-height:1.3;margin-bottom:6px;letter-spacing:-0.1px;
          white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
        .c-rating-row{display:flex;align-items:center;gap:8px;margin-bottom:7px;}
        .c-price-row{display:flex;align-items:center;gap:8px;margin-bottom:7px;}
        .c-price{font-family:'Syne',sans-serif;font-size:17px;font-weight:800;color:var(--orange2);letter-spacing:-0.2px;}
        .c-cal{font-size:11px;color:var(--text3);}
        .c-meta{display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-bottom:10px;}
        .c-spice{display:inline-flex;align-items:center;gap:3px;font-size:10px;font-weight:600;padding:3px 8px;border-radius:6px;}
        .c-prep{display:inline-flex;align-items:center;gap:3px;
          font-size:10px;color:var(--text3);background:var(--bg3);padding:3px 8px;border-radius:6px;}
        .c-ar-cta{display:flex;align-items:center;justify-content:center;gap:7px;
          padding:10px;border-radius:11px;
          background:linear-gradient(135deg,var(--orange),var(--orange2));
          font-size:11px;font-weight:800;color:#fff;
          letter-spacing:0.04em;text-transform:uppercase;
          box-shadow:0 4px 14px rgba(224,90,58,0.3);
          transition:box-shadow 0.2s;}
        .card:hover .c-ar-cta{box-shadow:0 6px 20px rgba(224,90,58,0.5);}

        .empty{text-align:center;padding:80px 20px;color:var(--text3);}

        /* MODAL */
        .overlay{position:fixed;inset:0;z-index:50;
          display:flex;align-items:flex-end;justify-content:center;
          background:rgba(0,0,0,0.72);
          backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);
          animation:fadeIn 0.18s ease;}
        .sheet{position:relative;width:100%;max-width:560px;
          background:var(--bg2);border-radius:28px 28px 0 0;
          max-height:93vh;overflow-y:auto;
          animation:slideUp 0.32s cubic-bezier(0.32,0.72,0,1);
          box-shadow:0 -14px 60px rgba(0,0,0,0.55);
          border-top:1px solid var(--border);}
        .sheet-topbar{position:sticky;top:0;z-index:5;
          display:flex;align-items:center;justify-content:space-between;
          padding:13px 16px 10px;background:var(--bg2);border-bottom:1px solid var(--border);}
        .handle{width:36px;height:4px;border-radius:2px;background:rgba(255,255,255,0.12);}
        .close-btn{width:32px;height:32px;border-radius:50%;
          background:var(--bg3);border:1px solid var(--border);
          color:var(--text2);cursor:pointer;font-size:13px;
          display:flex;align-items:center;justify-content:center;transition:all 0.15s;}
        .close-btn:hover{background:var(--orange);color:#fff;border-color:transparent;}
        .m-hero{margin:0 14px 0;border-radius:16px;overflow:hidden;aspect-ratio:16/9;position:relative;}
        .m-hero img{width:100%;height:100%;object-fit:cover;display:block;}
        .m-hero-ph{width:100%;height:100%;display:flex;align-items:center;justify-content:center;font-size:72px;background:var(--bg3);}
        .sbody{padding:20px 20px 40px;}
        .m-title{font-family:'Syne',sans-serif;font-size:24px;font-weight:800;color:var(--text);
          text-align:center;margin-bottom:8px;line-height:1.2;letter-spacing:-0.3px;}
        .m-rating-row{display:flex;justify-content:center;align-items:center;gap:8px;margin-bottom:12px;}
        .m-tags{display:flex;justify-content:center;gap:7px;flex-wrap:wrap;margin-bottom:12px;}
        .tag{padding:5px 13px;border-radius:8px;font-size:12px;font-weight:600;}
        .tag-cat{background:var(--bg3);color:var(--text2);border:1px solid var(--border);}
        .tag-veg{background:rgba(72,168,120,0.13);color:var(--green);border:1px solid rgba(72,168,120,0.28);}
        .tag-nv{background:rgba(208,64,64,0.1);color:var(--red);border:1px solid rgba(208,64,64,0.22);}
        .tag-pop{background:rgba(244,168,54,0.13);color:var(--gold);border:1px solid rgba(244,168,54,0.28);}
        .m-pills{display:flex;justify-content:center;gap:7px;flex-wrap:wrap;margin-bottom:14px;}
        .m-pill{display:flex;align-items:center;gap:5px;padding:6px 14px;border-radius:8px;font-size:12px;font-weight:600;background:var(--bg3);color:var(--text2);border:1px solid var(--border);}
        .m-price{text-align:center;font-family:'Syne',sans-serif;font-size:36px;font-weight:800;color:var(--orange2);letter-spacing:-0.5px;}
        .m-price-sub{text-align:center;font-size:11px;color:var(--text3);margin-top:2px;margin-bottom:16px;}
        .m-desc{font-size:14px;color:var(--text2);line-height:1.75;text-align:center;margin-bottom:20px;}
        .divider{height:1px;background:var(--border);margin:18px 0;}
        .sec-lbl{font-family:'Syne',sans-serif;font-size:10px;font-weight:700;color:var(--text3);letter-spacing:0.1em;text-transform:uppercase;margin-bottom:12px;}
        .nutr{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:20px;}
        .nc{background:var(--bg3);border:1px solid var(--border);border-radius:12px;padding:14px 8px;text-align:center;}
        .nc-v{font-family:'Syne',sans-serif;font-size:20px;font-weight:800;color:var(--orange2);}
        .nc-u{font-size:10px;color:var(--text3);margin-top:1px;}
        .nc-l{font-size:10px;color:var(--text2);margin-top:3px;font-weight:600;}
        .ings{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:22px;}
        .ing{padding:6px 13px;border-radius:8px;font-size:12px;color:var(--text2);background:var(--bg3);border:1px solid var(--border);font-weight:500;}

        /* AR BUTTON */
        .ar-btn{width:100%;padding:18px;border-radius:16px;border:none;
          background:linear-gradient(135deg,#B83820,var(--orange),var(--orange2));
          color:#fff;font-family:'Syne',sans-serif;font-weight:800;font-size:15px;
          cursor:pointer;display:flex;align-items:center;justify-content:center;gap:12px;
          box-shadow:0 6px 28px rgba(224,90,58,0.48),0 2px 8px rgba(224,90,58,0.28);
          transition:transform 0.18s,box-shadow 0.18s;letter-spacing:0.02em;}
        .ar-btn:hover{transform:translateY(-3px);box-shadow:0 12px 38px rgba(224,90,58,0.65);}
        .ar-btn:active{transform:scale(0.98);}
        .ar-hint{text-align:center;font-size:11px;color:var(--text3);margin-top:10px;}

        /* FAB */
        .fab-wrap{position:fixed;bottom:28px;left:0;right:0;
          display:flex;justify-content:center;z-index:45;pointer-events:none;}
        .sma-fab{pointer-events:all;
          display:flex;align-items:center;gap:9px;
          padding:15px 30px;border-radius:50px;border:none;
          background:linear-gradient(135deg,#B83820,var(--orange));color:#fff;
          font-family:'Syne',sans-serif;font-weight:800;font-size:15px;
          cursor:pointer;white-space:nowrap;letter-spacing:0.01em;
          box-shadow:0 8px 30px rgba(224,90,58,0.55),0 3px 10px rgba(224,90,58,0.28);
          transition:transform 0.2s ease,box-shadow 0.2s ease;
          animation:fadeUp 0.5s 0.3s ease both;}
        .sma-fab:hover{transform:translateY(-4px);box-shadow:0 14px 38px rgba(224,90,58,0.7);}
        .sma-fab:active{transform:scale(0.97);}

        /* SMA SHEET */
        .sma-overlay{position:fixed;inset:0;z-index:55;
          display:flex;align-items:flex-end;justify-content:center;
          background:rgba(0,0,0,0.72);
          backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);
          animation:fadeIn 0.18s ease;}
        .sma-sheet{position:relative;width:100%;max-width:560px;
          background:var(--bg2);border-radius:28px 28px 0 0;max-height:90vh;overflow-y:auto;
          animation:slideUp 0.32s cubic-bezier(0.32,0.72,0,1);
          box-shadow:0 -14px 60px rgba(0,0,0,0.55);border-top:1px solid var(--border);
          font-family:'DM Sans',sans-serif;}
        .sma-handle-row{display:flex;justify-content:center;padding:14px 0 0;}
        .sma-handle{width:36px;height:4px;border-radius:2px;background:rgba(255,255,255,0.12);}
        .sma-prog-wrap{padding:18px 22px 0;}
        .sma-prog-row{display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;}
        .sma-prog-txt{font-size:12px;font-weight:600;color:var(--text3);}
        .sma-back{font-size:12px;font-weight:600;color:var(--text3);background:none;border:none;cursor:pointer;
          font-family:'DM Sans',sans-serif;padding:0;transition:color 0.15s;}
        .sma-back:hover{color:var(--orange);}
        .sma-prog-bar{height:3px;background:var(--bg3);border-radius:99px;overflow:hidden;}
        .sma-prog-fill{height:100%;background:var(--orange);border-radius:99px;transition:width 0.3s ease;}
        .sma-q-wrap{padding:26px 22px 34px;}
        .sma-q-emoji{font-size:44px;text-align:center;margin-bottom:14px;}
        .sma-q-text{font-family:'Syne',sans-serif;font-size:22px;font-weight:800;color:var(--text);text-align:center;margin-bottom:5px;line-height:1.25;letter-spacing:-0.3px;}
        .sma-q-sub{font-size:13px;color:var(--text3);text-align:center;margin-bottom:24px;}
        .sma-opts{display:flex;flex-direction:column;gap:9px;}
        .sma-opt{display:flex;align-items:center;gap:14px;
          padding:14px 18px;border-radius:14px;
          border:1px solid var(--border);background:var(--bg3);
          cursor:pointer;transition:all 0.16s ease;text-align:left;width:100%;
          font-family:'DM Sans',sans-serif;}
        .sma-opt:hover{background:var(--card);border-color:var(--orange);transform:translateX(4px);}
        .sma-opt:active{transform:scale(0.98);}
        .sma-opt-emoji{font-size:24px;flex-shrink:0;}
        .sma-opt-label{font-size:14px;font-weight:600;color:var(--text);}
        .sma-dismiss{display:block;text-align:center;margin:18px auto 0;font-size:12px;color:var(--text3);
          background:none;border:none;cursor:pointer;font-family:'DM Sans',sans-serif;transition:color 0.15s;}
        .sma-dismiss:hover{color:var(--orange);}
        .sma-res-wrap{padding:22px 20px 44px;}
        .sma-res-hdr{text-align:center;margin-bottom:24px;}
        .sma-res-emoji{font-size:40px;margin-bottom:10px;}
        .sma-res-title{font-family:'Syne',sans-serif;font-size:22px;font-weight:800;color:var(--text);margin-bottom:4px;letter-spacing:-0.3px;}
        .sma-res-sub{font-size:13px;color:var(--text3);}
        .sma-cat-lbl{font-family:'Syne',sans-serif;font-size:10px;font-weight:700;color:var(--text3);letter-spacing:0.1em;text-transform:uppercase;margin:18px 0 10px 2px;}
        .sma-item{display:flex;align-items:center;gap:12px;
          padding:12px 14px;border-radius:14px;margin-bottom:8px;
          background:var(--bg3);border:1px solid var(--border);
          cursor:pointer;transition:all 0.15s ease;text-align:left;width:100%;font-family:'DM Sans',sans-serif;}
        .sma-item:hover{background:var(--card);border-color:var(--orange);transform:translateX(4px);}
        .sma-item-img{width:52px;height:52px;border-radius:12px;object-fit:cover;flex-shrink:0;background:var(--bg3);}
        .sma-item-name{font-size:14px;font-weight:700;color:var(--text);margin-bottom:4px;}
        .sma-item-meta{display:flex;align-items:center;gap:6px;flex-wrap:wrap;}
        .sma-item-price{font-family:'Syne',sans-serif;font-size:14px;font-weight:800;color:var(--orange2);}
        .sma-item-chip{font-size:10px;font-weight:700;padding:2px 8px;border-radius:6px;}
        .sma-chip-pop{background:rgba(244,168,54,0.13);color:var(--gold);}
        .sma-chip-ar{background:rgba(224,90,58,0.13);color:var(--orange2);}
        .sma-chip-share{background:rgba(96,144,224,0.13);color:#6090E0;}
        .sma-actions{display:flex;gap:9px;margin-top:24px;}
        .sma-btn-dark{flex:1;padding:15px;border-radius:13px;border:none;
          background:var(--orange);color:#fff;font-family:'Syne',sans-serif;font-weight:800;font-size:14px;
          cursor:pointer;box-shadow:0 4px 18px rgba(224,90,58,0.38);transition:all 0.18s;}
        .sma-btn-dark:hover{transform:translateY(-2px);box-shadow:0 8px 24px rgba(224,90,58,0.52);}
        .sma-btn-light{flex:1;padding:15px;border-radius:13px;border:1px solid var(--border);
          background:var(--bg3);color:var(--text2);font-family:'DM Sans',sans-serif;font-weight:600;font-size:14px;
          cursor:pointer;transition:all 0.18s;}
        .sma-btn-light:hover{background:var(--card);border-color:var(--border2);}
        .sma-no-match{text-align:center;padding:36px 20px;color:var(--text3);font-size:14px;}
        .sma-mode-wrap{padding:28px 22px 36px;}
        .sma-mode-title{font-family:'Syne',sans-serif;font-size:22px;font-weight:800;color:var(--text);text-align:center;margin-bottom:6px;letter-spacing:-0.3px;}
        .sma-mode-sub{font-size:13px;color:var(--text3);text-align:center;margin-bottom:28px;}
        .sma-mode-cards{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:18px;}
        .sma-mode-card{padding:22px 16px;border-radius:18px;
          border:1px solid var(--border);background:var(--bg3);
          cursor:pointer;text-align:center;transition:all 0.18s ease;font-family:'DM Sans',sans-serif;}
        .sma-mode-card:hover{background:var(--card);border-color:var(--orange);transform:translateY(-3px);box-shadow:0 8px 28px rgba(0,0,0,0.35);}
        .sma-mode-card-emoji{font-size:38px;margin-bottom:10px;}
        .sma-mode-card-name{font-family:'Syne',sans-serif;font-size:15px;font-weight:800;color:var(--text);margin-bottom:4px;}
        .sma-mode-card-desc{font-size:11px;color:var(--text3);line-height:1.5;}
        .sma-size-wrap{padding:26px 22px 36px;}
        .sma-size-title{font-family:'Syne',sans-serif;font-size:22px;font-weight:800;color:var(--text);text-align:center;margin-bottom:6px;}
        .sma-size-sub{font-size:13px;color:var(--text3);text-align:center;margin-bottom:26px;}
        .sma-size-grid{display:grid;grid-template-columns:repeat(5,1fr);gap:9px;}
        .sma-size-btn{padding:14px 6px;border-radius:14px;
          border:1px solid var(--border);background:var(--bg3);
          cursor:pointer;text-align:center;transition:all 0.18s ease;font-family:'DM Sans',sans-serif;}
        .sma-size-btn:hover{background:var(--card);border-color:var(--orange);transform:translateY(-2px);}
        .sma-size-btn-emoji{font-size:22px;display:block;margin-bottom:6px;}
        .sma-size-btn-num{font-family:'Syne',sans-serif;font-size:15px;font-weight:800;color:var(--text);}
        .sma-size-btn-lbl{font-size:10px;color:var(--text3);margin-top:2px;}
        .sma-group-banner{display:flex;align-items:center;gap:10px;
          padding:12px 16px;border-radius:12px;margin-bottom:18px;
          background:rgba(72,168,120,0.08);border:1px solid rgba(72,168,120,0.22);}
        .sma-group-banner-text{font-size:12px;font-weight:600;color:var(--green);}
        .sma-group-banner-sub{font-size:11px;color:#3A8A60;margin-top:1px;}
      `}</style>

      {/* HEADER */}
      <header className="hdr">
        <div className="hdr-inner">
          <div className="hdr-top">
            <div className="r-logo">🍽️</div>
            <div>
              <div className="r-name">{restaurant.name}</div>
              <div className="r-sub">Tap any dish · See it in AR on your table</div>
            </div>
            {arCount > 0 && (
              <div className="ar-live-badge">
                <span className="ar-dot"/>
                {arCount} AR
              </div>
            )}
          </div>

          <div className="search-wrap">
            <div className="search-box">
              <svg className="s-icon" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/>
              </svg>
              <input
                type="text" placeholder="Search dishes…"
                value={searchQuery}
                onChange={e=>setSearchQuery(e.target.value)}
              />
              {searchQuery && (
                <button onClick={()=>setSearchQuery('')}
                  style={{background:'none',border:'none',cursor:'pointer',color:'var(--text3)',fontSize:13,padding:0,lineHeight:1}}>
                  ✕
                </button>
              )}
            </div>
            <div className="filter-btns">
              <button className={`filter-btn${vegFilter==='veg'?' on-veg':''}`}
                onClick={()=>setVegFilter(v=>v==='veg'?'all':'veg')}>
                🌿 Veg
              </button>
              <button className={`filter-btn${vegFilter==='nonveg'?' on-nonveg':''}`}
                onClick={()=>setVegFilter(v=>v==='nonveg'?'all':'nonveg')}>
                🍗 Non-Veg
              </button>
            </div>
          </div>

          <div className="cats-outer">
            <div className="cats-scroll">
              {cats.map(c => (
                <button key={c} className={`cat-pill${activeCat===c?' on':''}`} onClick={()=>setActiveCat(c)}>
                  <span className="cat-emoji">{catIcon(c)}</span>{c}
                </button>
              ))}
            </div>
          </div>
        </div>
      </header>

      <main className="main">
        {offers?.[0] && (
          <div className="offer-bar">
            <span style={{fontSize:22}}>🎉</span>
            <div>
              <div className="offer-bar-title">{offers[0].title}</div>
              {offers[0].description && <div className="offer-bar-desc">{offers[0].description}</div>}
            </div>
          </div>
        )}

        {arCount > 0 && (
          <div className="ar-strip">
            <span className="ar-strip-icon">🥽</span>
            <div>
              <div className="ar-strip-text">{arCount} dish{arCount!==1?'es':''} available in Augmented Reality</div>
              <div className="ar-strip-sub">No app needed · Works on Android Chrome &amp; iOS Safari</div>
            </div>
            <div className="ar-strip-cta">Try AR</div>
          </div>
        )}

        {filtered.length > 0 && (
          <div className="sec-hdr">
            <span className="sec-title">{activeCat==='All'?'All Dishes':activeCat}</span>
            <span className="sec-count">{filtered.length} item{filtered.length!==1?'s':''}</span>
          </div>
        )}

        {filtered.length === 0 ? (
          <div className="empty">
            <div style={{fontSize:52,marginBottom:12}}>🥢</div>
            <p style={{fontWeight:600,fontSize:14}}>
              {searchQuery ? `No results for "${searchQuery}"` : 'No items in this category'}
            </p>
            {(searchQuery||vegFilter!=='all') && (
              <button onClick={()=>{setSearchQuery('');setVegFilter('all');}}
                style={{marginTop:14,padding:'9px 20px',borderRadius:10,
                  background:'var(--bg3)',border:'1px solid var(--border)',
                  color:'var(--text2)',cursor:'pointer',fontSize:13,fontWeight:600,fontFamily:'DM Sans,sans-serif'}}>
                Clear filters
              </button>
            )}
          </div>
        ) : (
          <div className="grid">
            {filtered.map((item, idx) => {
              const rating = getRating(item);
              return (
                <AnimCard key={item.id} delay={Math.min(idx * 0.045, 0.35)}>
                  <button className="card" onClick={()=>openItem(item)}>
                    <div className="c-img">
                      <img src={imgSrc(item)} alt={item.name} loading="lazy"
                        onError={()=>setImgErr(e=>({...e,[item.id]:true}))}/>
                      <div className="c-img-overlay"/>
                      {item.modelURL && (
                        <span className="c-ar-pill">
                          <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                            <path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/>
                          </svg>
                          AR
                        </span>
                      )}
                      {typeof item.isVeg === 'boolean' && <span className={`veg-ind ${item.isVeg?'v':'nv'}`}/>}
                      {item.isPopular && <span className="c-pop-badge">⭐ Popular</span>}
                      {item.offerBadge && item.offerLabel && (
                        <div className="c-ribbon" style={{background:item.offerColor||'var(--orange)'}}>🏷 {item.offerLabel}</div>
                      )}
                    </div>
                    <div className="c-body">
                      <div className="c-name">{item.name}</div>
                      <div className="c-rating-row"><StarRating value={rating}/></div>
                      <div className="c-price-row">
                        {item.price && <span className="c-price">₹{item.price}</span>}
                        {item.calories && <span className="c-cal">{item.calories} kcal</span>}
                      </div>
                      <div className="c-meta">
                        {item.spiceLevel && item.spiceLevel!=='None' && SPICE_MAP[item.spiceLevel] && (
                          <span className="c-spice" style={{background:SPICE_MAP[item.spiceLevel].bg,color:SPICE_MAP[item.spiceLevel].color}}>
                            {SPICE_MAP[item.spiceLevel].dot} {SPICE_MAP[item.spiceLevel].label}
                          </span>
                        )}
                        {item.prepTime && (
                          <span className="c-prep">
                            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>
                            </svg>
                            {item.prepTime}
                          </span>
                        )}
                      </div>
                      {item.modelURL && (
                        <div className="c-ar-cta">
                          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                            <path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/>
                          </svg>
                          View in AR
                        </div>
                      )}
                    </div>
                  </button>
                </AnimCard>
              );
            })}
          </div>
        )}
      </main>

      {/* FAB */}
      {!selectedItem && !smaOpen && (
        <div className="fab-wrap">
          <button className="sma-fab" onClick={openSMA}>
            <span style={{fontSize:18}}>✨</span>
            Help Me Choose
          </button>
        </div>
      )}

      {/* ITEM MODAL */}
      {selectedItem && (
        <div className="overlay" onClick={e=>{if(e.target===e.currentTarget)closeItem();}}>
          <div className="sheet">
            <div className="sheet-topbar">
              <div className="handle"/>
              <button className="close-btn" onClick={closeItem}>✕</button>
            </div>
            {!showAR && (
              <div className="m-hero">
                {(!imgErr[selectedItem.id] && selectedItem.imageURL)
                  ? <img src={selectedItem.imageURL} alt={selectedItem.name}
                      onError={()=>setImgErr(e=>({...e,[selectedItem.id]:true}))}/>
                  : <div className="m-hero-ph">🍽️</div>
                }
                {selectedItem.offerBadge && selectedItem.offerLabel && (
                  <div style={{position:'absolute',bottom:0,left:0,right:0,padding:'8px 14px',
                    background:selectedItem.offerColor||'var(--orange)',color:'#fff',fontSize:12,fontWeight:700,textAlign:'center'}}>
                    🏷 {selectedItem.offerLabel}
                  </div>
                )}
              </div>
            )}
            <div className="sbody">
              <h2 className="m-title">{selectedItem.name}</h2>
              <div className="m-rating-row">
                <StarRating value={getRating(selectedItem)}/>
                {selectedItem.isPopular && (
                  <span style={{fontSize:11,color:'var(--gold)',fontWeight:700,
                    background:'rgba(244,168,54,0.1)',padding:'2px 8px',borderRadius:6}}>⭐ Popular</span>
                )}
              </div>
              <div className="m-tags">
                {selectedItem.category && <span className="tag tag-cat">{selectedItem.category}</span>}
                {typeof selectedItem.isVeg==='boolean' && (
                  <span className={selectedItem.isVeg?'tag tag-veg':'tag tag-nv'}>
                    {selectedItem.isVeg?'● Veg':'● Non-Veg'}
                  </span>
                )}
              </div>
              {(selectedItem.prepTime || (selectedItem.spiceLevel&&selectedItem.spiceLevel!=='None')) && (
                <div className="m-pills">
                  {selectedItem.prepTime && <span className="m-pill">⏱ {selectedItem.prepTime}</span>}
                  {selectedItem.spiceLevel&&selectedItem.spiceLevel!=='None'&&SPICE_MAP[selectedItem.spiceLevel] && (
                    <span className="m-pill"
                      style={{background:SPICE_MAP[selectedItem.spiceLevel].bg,
                        color:SPICE_MAP[selectedItem.spiceLevel].color,borderColor:SPICE_MAP[selectedItem.spiceLevel].bg}}>
                      {SPICE_MAP[selectedItem.spiceLevel].dot} {selectedItem.spiceLevel}
                    </span>
                  )}
                </div>
              )}
              {selectedItem.price && (
                <><div className="m-price">₹{selectedItem.price}</div><div className="m-price-sub">per serving</div></>
              )}
              {selectedItem.description && <p className="m-desc">{selectedItem.description}</p>}
              {(selectedItem.calories||selectedItem.protein||selectedItem.carbs||selectedItem.fats) && (<>
                <div className="divider"/>
                <div className="sec-lbl">Nutrition</div>
                <div className="nutr">
                  {[{l:'Calories',v:selectedItem.calories,u:'kcal'},{l:'Protein',v:selectedItem.protein,u:'g'},{l:'Carbs',v:selectedItem.carbs,u:'g'},{l:'Fats',v:selectedItem.fats,u:'g'}]
                    .filter(n=>n.v).map(n=>(
                      <div key={n.l} className="nc">
                        <div className="nc-v">{n.v}</div>
                        <div className="nc-u">{n.u}</div>
                        <div className="nc-l">{n.l}</div>
                      </div>
                    ))}
                </div>
              </>)}
              {selectedItem.ingredients?.length>0 && (<>
                <div className="sec-lbl">Ingredients</div>
                <div className="ings">
                  {selectedItem.ingredients.map(ing=><span key={ing} className="ing">{ing}</span>)}
                </div>
              </>)}
              {!showAR && selectedItem.modelURL && (<>
                <div className="divider"/>
                <button className="ar-btn" onClick={()=>{setShowAR(true);handleARLaunch();}}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/>
                  </svg>
                  View in Augmented Reality
                </button>
                <div className="ar-hint">🥽 Point at a flat surface — works on Android &amp; iOS, no app needed</div>
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
            <div className="sma-handle-row"><div className="sma-handle"/></div>

            {!smaMode && (
              <div className="sma-mode-wrap">
                <div style={{fontSize:44,textAlign:'center',marginBottom:12}}>✨</div>
                <div className="sma-mode-title">Help Me Choose</div>
                <div className="sma-mode-sub">Ordering for yourself or for a group?</div>
                <div className="sma-mode-cards">
                  <button className="sma-mode-card" onClick={()=>{setSmaMode('solo');setSmaStep(0);}}>
                    <div className="sma-mode-card-emoji">🙋</div>
                    <div className="sma-mode-card-name">Just Me</div>
                    <div className="sma-mode-card-desc">Personalised picks for your taste</div>
                  </button>
                  <button className="sma-mode-card" onClick={()=>setSmaMode('group')}>
                    <div className="sma-mode-card-emoji">👥</div>
                    <div className="sma-mode-card-name">Group</div>
                    <div className="sma-mode-card-desc">Dishes that work for everyone</div>
                  </button>
                </div>
                <button className="sma-dismiss" onClick={closeSMA}>Dismiss</button>
              </div>
            )}

            {smaMode==='group' && !groupSize && (
              <div className="sma-size-wrap">
                <div style={{fontSize:44,textAlign:'center',marginBottom:12}}>👥</div>
                <div className="sma-size-title">How many people?</div>
                <div className="sma-size-sub">We'll tune portions and shareable dish suggestions</div>
                <div className="sma-size-grid">
                  {GROUP_SIZES.map(({n,e})=>(
                    <button key={n} className="sma-size-btn" onClick={()=>{setGroupSize(n);setSmaStep(0);}}>
                      <span className="sma-size-btn-emoji">{e}</span>
                      <div className="sma-size-btn-num">{n}</div>
                      <div className="sma-size-btn-lbl">{n==='6+'?'people':n===1?'person':'people'}</div>
                    </button>
                  ))}
                </div>
                <button className="sma-dismiss" style={{marginTop:22}} onClick={()=>setSmaMode(null)}>← Back</button>
              </div>
            )}

            {smaMode && (smaMode==='solo'||groupSize) && smaStep < activeQs.length && (<>
              <div className="sma-prog-wrap">
                <div className="sma-prog-row">
                  <span className="sma-prog-txt">
                    {smaMode==='group' && (
                      <span style={{marginRight:8,fontSize:11,background:'rgba(72,168,120,0.1)',
                        color:'var(--green)',padding:'2px 8px',borderRadius:6,fontWeight:700}}>
                        👥 Group of {groupSize}
                      </span>
                    )}
                    {smaStep+1} / {activeQs.length}
                  </span>
                  <button className="sma-back" onClick={()=>{
                    if (smaStep>0) setSmaStep(s=>s-1);
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
                    <button key={o.v} className="sma-opt" onClick={()=>pickAnswer(activeQs[smaStep].id,o.v)}>
                      <span className="sma-opt-emoji">{o.e}</span>
                      <span className="sma-opt-label">{o.l}</span>
                    </button>
                  ))}
                </div>
                <button className="sma-dismiss" onClick={closeSMA}>Dismiss</button>
              </div>
            </>)}

            {smaMode && (smaMode==='solo'||groupSize) && smaStep===activeQs.length && (()=>{
              const top = smaResults.slice(0,12);
              const catMap = {};
              top.forEach(({item})=>{const c=item.category||'Other';if(!catMap[c])catMap[c]=[];catMap[c].push(item);});
              const isGroup = smaMode==='group';
              const bigGroup = groupSize==='6+'||(typeof groupSize==='number'&&groupSize>=4);
              return (
                <div className="sma-res-wrap">
                  <div className="sma-res-hdr">
                    <div className="sma-res-emoji">🎯</div>
                    <div className="sma-res-title">
                      {top.length>0?(isGroup?`${top.length} dishes for the table`:`${top.length} dishes for you`):'No matches found'}
                    </div>
                    <div className="sma-res-sub">
                      {top.length>0?(isGroup?'Works for everyone — tap any dish for details':'Based on your preferences'):'Try again with different preferences'}
                    </div>
                  </div>
                  {isGroup&&top.length>0&&(
                    <div className="sma-group-banner">
                      <span style={{fontSize:20}}>👥</span>
                      <div>
                        <div className="sma-group-banner-text">Group of {groupSize} · {bigGroup?'Shareable dishes highlighted':'Individual portions'}</div>
                        <div className="sma-group-banner-sub">{bigGroup?'Look for 🤲 tags — great for the whole table':'Each person can order individually'}</div>
                      </div>
                    </div>
                  )}
                  {top.length===0?(
                    <div className="sma-no-match">
                      <p>No dishes matched your filters.<br/>Try relaxing some preferences.</p>
                      <button className="sma-btn-dark" style={{marginTop:14,width:'100%'}} onClick={restartSMA}>Try Again</button>
                    </div>
                  ):(<>
                    {Object.entries(catMap).map(([cat,items])=>(
                      <div key={cat}>
                        <div className="sma-cat-lbl">{cat}</div>
                        {items.map(item=>{
                          const shareable=isGroup&&isShareable(item);
                          return (
                            <button key={item.id} className="sma-item" onClick={()=>{closeSMA();openItem(item);}}>
                              <img className="sma-item-img" src={imgSrc(item)} alt={item.name}
                                onError={()=>setImgErr(e=>({...e,[item.id]:true}))}/>
                              <div style={{flex:1,minWidth:0}}>
                                <div className="sma-item-name">{item.name}</div>
                                <div className="sma-item-meta">
                                  {item.price&&<span className="sma-item-price">₹{item.price}</span>}
                                  {shareable&&<span className="sma-item-chip sma-chip-share">🤲 Shareable</span>}
                                  {item.isPopular&&<span className="sma-item-chip sma-chip-pop">⭐ Popular</span>}
                                  {item.modelURL&&<span className="sma-item-chip sma-chip-ar">🥽 AR</span>}
                                  {item.prepTime&&<span style={{fontSize:11,color:'var(--text3)'}}>⏱ {item.prepTime}</span>}
                                </div>
                              </div>
                              <span style={{fontSize:18,color:'var(--text3)',flexShrink:0}}>›</span>
                            </button>
                          );
                        })}
                      </div>
                    ))}
                    <div className="sma-actions">
                      <button className="sma-btn-light" onClick={restartSMA}>↺ Start Over</button>
                      <button className="sma-btn-dark" onClick={closeSMA}>Browse Menu →</button>
                    </div>
                  </>)}
                </div>
              );
            })()}
          </div>
        </div>
      )}
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
