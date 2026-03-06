import Head from 'next/head';
import { useState, useEffect, useCallback } from 'react';
import { getRestaurantBySubdomain, getMenuItems, getActiveOffers, trackVisit, incrementItemView, incrementARView } from '../../../lib/db';
import { ARViewerEmbed } from '../../../components/ARViewer';

function getSessionId() {
  if (typeof window === 'undefined') return 'ssr';
  let sid = sessionStorage.getItem('ar_sid');
  if (!sid) { sid = Math.random().toString(36).substr(2, 16); sessionStorage.setItem('ar_sid', sid); }
  return sid;
}

const FOOD_PLACEHOLDERS = [
  'https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?w=600&q=75',
  'https://images.unsplash.com/photo-1504674900247-0877df9cc836?w=600&q=75',
  'https://images.unsplash.com/photo-1540189549336-e6e99c3679fe?w=600&q=75',
  'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=600&q=75',
  'https://images.unsplash.com/photo-1567620905732-2d1ec7ab7445?w=600&q=75',
  'https://images.unsplash.com/photo-1565958011703-44f9829ba187?w=600&q=75',
  'https://images.unsplash.com/photo-1512621776951-a57141f2eefd?w=600&q=75',
  'https://images.unsplash.com/photo-1482049016688-2d3e1b311543?w=600&q=75',
];
function getPlaceholder(id) {
  let h = 0;
  for (let i = 0; i < (id||'').length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return FOOD_PLACEHOLDERS[h % FOOD_PLACEHOLDERS.length];
}

const SPICE_LABEL = { Mild:'Mild', Medium:'Medium', Spicy:'Spicy', 'Very Spicy':'Very Spicy' };
const SPICE_DOT   = { Mild:'🟡', Medium:'🟠', Spicy:'🔴', 'Very Spicy':'🔴' };

// Category icon hints — matches common category names to an emoji
function catIcon(name) {
  const n = (name||'').toLowerCase();
  if (n.includes('all'))        return '🍽️';
  if (n.includes('starter') || n.includes('appetizer')) return '🥗';
  if (n.includes('main'))       return '🍛';
  if (n.includes('burger'))     return '🍔';
  if (n.includes('pizza'))      return '🍕';
  if (n.includes('pasta') || n.includes('noodle')) return '🍝';
  if (n.includes('dessert') || n.includes('sweet')) return '🍰';
  if (n.includes('drink') || n.includes('beverage') || n.includes('juice')) return '🥤';
  if (n.includes('coffee') || n.includes('tea'))    return '☕';
  if (n.includes('breakfast'))  return '🥞';
  if (n.includes('seafood') || n.includes('fish'))  return '🐟';
  if (n.includes('chicken'))    return '🍗';
  if (n.includes('rice') || n.includes('biryani'))  return '🍚';
  if (n.includes('salad'))      return '🥙';
  if (n.includes('soup'))       return '🍲';
  if (n.includes('veg'))        return '🥦';
  if (n.includes('snack'))      return '🍿';
  if (n.includes('special') || n.includes('chef'))  return '⭐';
  if (n.includes('cocktail') || n.includes('mocktail')) return '🍹';
  return '🍽️';
}

// ── Smart Menu Assistant ─────────────────────────────────────────
const QUESTIONS = [
  { id:'diet',   emoji:'🌿', q:'Any dietary preference?',      sub:'We\'ll only show dishes that match',
    opts:[{label:'Vegetarian',value:'veg',emoji:'🌿'},{label:'Non-Vegetarian',value:'nonveg',emoji:'🍗'},{label:'No Preference',value:'any',emoji:'✌️'}] },
  { id:'mood',   emoji:'✨', q:'What\'s your mood today?',      sub:'Pick what sounds good right now',
    opts:[{label:'Comfort Food',value:'comfort',emoji:'🍲'},{label:'Healthy',value:'healthy',emoji:'🥦'},{label:'Popular Dishes',value:'popular',emoji:'🔥'},{label:'Try Something New',value:'new',emoji:'🌟'}] },
  { id:'spice',  emoji:'🌶️', q:'How do you like your heat?',    sub:'We\'ll match your spice tolerance',
    opts:[{label:'Mild / No Spice',value:'mild',emoji:'😌'},{label:'Medium',value:'medium',emoji:'😄'},{label:'Spicy',value:'spicy',emoji:'🥵'},{label:'Any Level',value:'any',emoji:'🤷'}] },
  { id:'size',   emoji:'🍽️', q:'How hungry are you?',           sub:'Choose your meal size',
    opts:[{label:'Light Bite',value:'light',emoji:'🥗'},{label:'Regular Meal',value:'regular',emoji:'🍛'},{label:'Feast Mode',value:'heavy',emoji:'🤤'},{label:'Anything',value:'any',emoji:'👌'}] },
  { id:'budget', emoji:'💰', q:'Budget per dish?',              sub:'Pick a price range',
    opts:[{label:'Under ₹200',value:'budget',emoji:'💵'},{label:'₹200–₹500',value:'mid',emoji:'💳'},{label:'₹500+',value:'premium',emoji:'💎'},{label:'No Limit',value:'any',emoji:'🤑'}] },
];
const LIGHT_CATS = ['starter','salad','soup','snack','drink','beverage','dessert'];
const HEAVY_CATS = ['main','burger','pasta','pizza','biryani','thali','grill','rice'];
const HEALTHY_KW = ['salad','grilled','steamed','healthy','light','vegan','fresh','oat','quinoa','fruit'];
const COMFORT_KW = ['butter','cheese','cream','fried','crispy','masala','curry','rich','loaded','classic','special'];
function scoreItem(item, ans) {
  let s = 0;
  const txt = `${item.name||''} ${item.description||''} ${item.category||''} ${(item.ingredients||[]).join(' ')}`.toLowerCase();
  const cat = (item.category||'').toLowerCase();
  const spice = item.spiceLevel || 'None';
  const price = item.price ? Number(item.price) : null;
  if (ans.diet==='veg')    { if (item.isVeg===false) return -999; if (item.isVeg===true) s+=20; }
  if (ans.diet==='nonveg') { if (item.isVeg===true)  s-=10;       if (item.isVeg===false) s+=15; }
  if (ans.spice==='mild')   { if (['Spicy','Very Spicy'].includes(spice)) return -999; if (['None','Mild'].includes(spice)) s+=15; }
  if (ans.spice==='medium') { if (spice==='Medium') s+=20; }
  if (ans.spice==='spicy')  { if (['Spicy','Very Spicy'].includes(spice)) s+=25; }
  if (price!==null) {
    if (ans.budget==='budget')  { if (price>=200) s-=15; else s+=20; }
    if (ans.budget==='mid')     { if (price>=200&&price<=500) s+=20; else s-=8; }
    if (ans.budget==='premium') { if (price>500) s+=20; else if (price<200) s-=10; }
  }
  if (ans.size==='light') { if (LIGHT_CATS.some(l=>cat.includes(l))) s+=18; if (HEAVY_CATS.some(h=>cat.includes(h))) s-=15; }
  if (ans.size==='heavy') { if (HEAVY_CATS.some(h=>cat.includes(h))) s+=18; if (LIGHT_CATS.some(l=>cat.includes(l))) s-=8; }
  if (ans.mood==='popular') { if (item.isPopular||item.isFeatured) s+=30; s+=Math.min((item.views||0)/5,15); }
  if (ans.mood==='healthy') { if (HEALTHY_KW.some(k=>txt.includes(k))) s+=20; if (item.calories&&item.calories<400) s+=15; }
  if (ans.mood==='comfort') { if (COMFORT_KW.some(k=>txt.includes(k))) s+=20; if (HEAVY_CATS.some(h=>cat.includes(h))) s+=10; }
  if (ans.mood==='new')     { if (item.isFeatured) s+=25; if (item.offerBadge) s+=15; s+=Math.floor(Math.random()*10); }
  s += Math.min((item.views||0)+(item.arViews||0)*2,20)*0.3;
  return s;
}
function filterItems(items, ans) {
  return items.map(i=>({item:i,score:scoreItem(i,ans)})).filter(({score})=>score>-999).sort((a,b)=>b.score-a.score);
}

export default function RestaurantMenu({ restaurant, menuItems, offers, error }) {
  const [activeCat,    setActiveCat]    = useState('All');
  const [selectedItem, setSelectedItem] = useState(null);
  const [showAR,       setShowAR]       = useState(false);
  const [imgErr,       setImgErr]       = useState({});
  const [smaOpen,      setSmaOpen]      = useState(false);
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

  const cats     = ['All', ...new Set((menuItems||[]).map(i=>i.category).filter(Boolean))];
  const filtered = activeCat==='All' ? (menuItems||[]) : (menuItems||[]).filter(i=>i.category===activeCat);
  const arCount  = (menuItems||[]).filter(i=>i.modelURL).length;

  const openItem = useCallback(async (item) => {
    setSelectedItem(item); setShowAR(false);
    if (restaurant?.id) await incrementItemView(restaurant.id, item.id).catch(()=>{});
  }, [restaurant?.id]);
  const closeItem = useCallback(() => { setSelectedItem(null); setShowAR(false); }, []);
  const handleARLaunch = useCallback(async () => {
    if (restaurant?.id && selectedItem?.id)
      await incrementARView(restaurant.id, selectedItem.id).catch(()=>{});
  }, [restaurant?.id, selectedItem?.id]);
  const imgSrc = (item) => (!imgErr[item.id] && item.imageURL) ? item.imageURL : getPlaceholder(item.id);

  const openSMA  = () => { setSmaOpen(true); setSmaStep(0); setSmaAnswers({}); setSmaResults([]); };
  const closeSMA = () => setSmaOpen(false);
  const restartSMA = () => { setSmaStep(0); setSmaAnswers({}); setSmaResults([]); };
  const pickAnswer = (qId, val) => {
    const ans = { ...smaAnswers, [qId]: val };
    setSmaAnswers(ans);
    if (smaStep < QUESTIONS.length-1) { setSmaStep(smaStep+1); }
    else { setSmaResults(filterItems(menuItems||[], ans)); setSmaStep(QUESTIONS.length); }
  };

  if (error || !restaurant) return (
    <div style={{minHeight:'100vh',background:'#F5F0EB',display:'flex',alignItems:'center',justifyContent:'center',fontFamily:'sans-serif'}}>
      <div style={{textAlign:'center'}}><div style={{fontSize:52,marginBottom:12}}>🍽️</div>
        <h1 style={{fontSize:20,fontWeight:700,color:'#1A1008'}}>Restaurant not found</h1>
        <p style={{color:'#888',marginTop:6}}>This page doesn't exist or is inactive.</p></div>
    </div>
  );

  return (
    <>
      <Head>
        <title>{restaurant.name} — Menu</title>
        <meta name="description" content={`Explore ${restaurant.name}'s menu`} />
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />
        <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=Playfair+Display:wght@700;800&display=swap" rel="stylesheet" />
      </Head>

      <style>{`
        *, *::before, *::after { box-sizing:border-box; margin:0; padding:0; -webkit-tap-highlight-color:transparent; }
        html { scroll-behavior:smooth; }

        /* ── CLEAN WARM BACKGROUND ── */
        body {
          background: #F2EDE6;
          min-height: 100vh;
          overflow-x: hidden;
          font-family: 'Plus Jakarta Sans', sans-serif;
        }

        @keyframes fadeIn  { from{opacity:0} to{opacity:1} }
        @keyframes fadeUp  { from{opacity:0;transform:translateY(16px)} to{opacity:1;transform:translateY(0)} }
        @keyframes slideUp { from{transform:translateY(100%)} to{transform:translateY(0)} }
        @keyframes blink   { 0%,100%{opacity:1} 50%{opacity:0.2} }
        @keyframes spin    { to{transform:rotate(360deg)} }

        /* ── HEADER ── */
        .hdr {
          position: sticky; top: 0; z-index: 40;
          background: rgba(255,253,248,0.96);
          backdrop-filter: blur(20px); -webkit-backdrop-filter: blur(20px);
          border-bottom: 1px solid rgba(0,0,0,0.07);
          box-shadow: 0 1px 12px rgba(0,0,0,0.06);
        }
        .hdr-inner { max-width: 680px; margin: 0 auto; padding: 0 18px; }

        .hdr-top {
          display: flex; align-items: center; gap: 13px;
          padding: 14px 0 13px;
        }
        .logo {
          width: 46px; height: 46px; border-radius: 14px; flex-shrink: 0;
          background: linear-gradient(135deg,#C84B2A,#E06848);
          display: flex; align-items: center; justify-content: center; font-size: 21px;
          box-shadow: 0 4px 14px rgba(200,75,42,0.32);
        }
        .rname { font-family:'Playfair Display',serif; font-weight:800; font-size:18px; color:#1A1008; line-height:1.15; }
        .rsub  { font-size:11px; color:#999; margin-top:2px; letter-spacing:0.01em; }

        .ar-live-badge {
          margin-left: auto; flex-shrink: 0;
          display: flex; align-items: center; gap: 6px;
          padding: 7px 14px; border-radius: 20px;
          background: #FFF0EB; border: 1.5px solid #FFCFBE;
          font-size: 11px; font-weight: 700; color: #C04A28;
        }
        .ar-dot { width: 6px; height: 6px; border-radius: 50%; background: #E05A3A; animation: blink 1.6s infinite; }

        /* ── CATEGORY TABS ── */
        .cats-wrap {
          padding: 2px 0 14px;
          overflow-x: auto; scrollbar-width: none;
          display: flex; gap: 8px;
        }
        .cats-wrap::-webkit-scrollbar { display: none; }

        .cat-pill {
          flex-shrink: 0;
          display: flex; align-items: center; gap: 6px;
          padding: 9px 18px; border-radius: 30px;
          font-size: 13px; font-weight: 600;
          font-family: 'Plus Jakarta Sans', sans-serif;
          cursor: pointer; white-space: nowrap; border: none;
          background: #EDEBE6;
          color: #5A5040;
          transition: all 0.18s ease;
        }
        .cat-pill:hover:not(.on) { background: #E4E1DB; color: #2A2018; }
        .cat-pill.on {
          background: #2A2018;
          color: #FFF5E8;
          box-shadow: 0 4px 16px rgba(42,32,24,0.28);
        }
        .cat-icon { font-size: 15px; line-height: 1; }

        /* ── MAIN ── */
        .main { max-width: 680px; margin: 0 auto; padding: 18px 18px 100px; }

        /* AR Strip — now a proper visible card */
        .ar-strip {
          display: flex; align-items: center; gap: 14px;
          padding: 14px 18px; margin-bottom: 20px;
          background: #FFF5F2;
          border: 1.5px solid #FFCFBE;
          border-radius: 16px;
          animation: fadeUp 0.4s ease both;
        }
        .ar-strip-icon { font-size: 26px; flex-shrink: 0; }
        .ar-strip-main { font-size: 13px; font-weight: 700; color: #C84B2A; }
        .ar-strip-sub  { font-size: 11px; color: #B08070; margin-top: 2px; }
        .ar-strip-badge {
          margin-left: auto; flex-shrink: 0;
          padding: 5px 12px; border-radius: 20px;
          background: #C84B2A; color: #fff;
          font-size: 11px; font-weight: 800;
        }

        /* Offer banner */
        .offer-bar {
          display: flex; align-items: center; gap: 12px;
          padding: 13px 18px; margin-bottom: 16px;
          background: #FFFBF0; border: 1.5px solid #F0D890;
          border-radius: 14px;
          animation: fadeUp 0.4s ease both;
        }
        .offer-bar-icon { font-size: 22px; flex-shrink: 0; }
        .offer-bar-title { font-size: 13px; font-weight: 700; color: #8B6A10; }
        .offer-bar-desc  { font-size: 11px; color: #B08840; margin-top: 1px; }

        /* ── GRID — 2 col desktop, 1 col mobile ── */
        .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
        @media (max-width: 500px) {
          .grid { grid-template-columns: 1fr; gap: 12px; }
        }

        /* ── CARD ── */
        .card {
          background: #FFFFFF;
          border: 1px solid rgba(0,0,0,0.06);
          border-radius: 20px; overflow: hidden;
          cursor: pointer; position: relative; text-align: left;
          transition: transform 0.22s ease, box-shadow 0.22s ease;
          animation: fadeUp 0.4s ease both;
          box-shadow: 0 2px 12px rgba(0,0,0,0.06);
        }
        .card:hover  { transform: translateY(-5px); box-shadow: 0 12px 32px rgba(0,0,0,0.12); }
        .card:active { transform: scale(0.98); box-shadow: 0 2px 8px rgba(0,0,0,0.08); }

        /* Card image */
        .c-img { position: relative; overflow: hidden; width: 100%; aspect-ratio: 4/3; }
        .c-img img { width:100%; height:100%; object-fit:cover; display:block; transition: transform 0.3s ease; }
        .card:hover .c-img img { transform: scale(1.04); }
        .c-img-ph {
          width:100%; height:100%;
          display:flex; align-items:center; justify-content:center; font-size:48px;
          background: linear-gradient(160deg,#FFF0E0,#FADDBD);
        }

        /* AR badge */
        .c-ar-badge {
          position: absolute; top: 10px; right: 10px;
          display: flex; align-items: center; gap: 4px;
          background: #2A2018; color: #FFF5E8;
          font-size: 10px; font-weight: 800;
          padding: 4px 10px; border-radius: 8px;
          letter-spacing: 0.04em;
          box-shadow: 0 2px 8px rgba(0,0,0,0.25);
        }

        /* Veg indicator */
        .veg-ind {
          position: absolute; top: 10px; left: 10px;
          width: 20px; height: 20px; border-radius: 4px; border: 2px solid;
          background: #fff; display: flex; align-items: center; justify-content: center;
        }
        .veg-ind.v  { border-color: #2A7A48; }
        .veg-ind.nv { border-color: #C03020; }
        .veg-ind.v::after  { content:''; width:9px; height:9px; border-radius:50%; background:#2A7A48; }
        .veg-ind.nv::after { content:''; width:9px; height:9px; border-radius:50%; background:#C03020; }

        /* Offer ribbon */
        .c-ribbon {
          position: absolute; bottom: 0; left: 0; right: 0;
          padding: 5px 12px;
          font-size: 10px; font-weight: 800; color: #fff; text-align: center;
          letter-spacing: 0.03em;
        }

        /* Card body */
        .c-body { padding: 14px 15px 15px; }

        /* Badges row */
        .c-badges { display: flex; gap: 5px; flex-wrap: wrap; margin-bottom: 7px; }
        .c-badge { font-size: 9px; font-weight: 800; padding: 3px 9px; border-radius: 6px; letter-spacing: 0.03em; }
        .c-badge-pop  { background: #FFF0EB; color: #C84B2A; }
        .c-badge-feat { background: #F0EBF8; color: #7040A8; }

        /* Card name */
        .c-name {
          font-family: 'Plus Jakarta Sans', sans-serif;
          font-weight: 800; font-size: 15px;
          color: #1A1008; line-height: 1.3;
          margin-bottom: 8px;
        }

        /* Price row */
        .c-price-row { display: flex; align-items: baseline; gap: 8px; margin-bottom: 5px; }
        .c-price { font-family: 'Plus Jakarta Sans', sans-serif; font-size: 17px; font-weight: 800; color: #C84B2A; }
        .c-cal   { font-size: 11px; color: #AAA; font-weight: 500; }

        /* Meta row */
        .c-meta { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin-bottom: 4px; }
        .c-spice { display: flex; align-items: center; gap: 4px; font-size: 11px; color: #888; font-weight: 500; }
        .c-prep  { font-size: 11px; color: #AAA; font-weight: 500; }

        /* AR CTA strip in card */
        .c-ar-cta {
          margin-top: 10px;
          display: flex; align-items: center; justify-content: center; gap: 7px;
          padding: 9px 12px; border-radius: 10px;
          background: #F8F4F0; border: 1.5px solid #E8E0D8;
          font-size: 11px; font-weight: 800; color: #5A5040;
          letter-spacing: 0.06em; text-transform: uppercase;
        }

        /* Empty */
        .empty { text-align:center; padding:70px 20px; color:#AAA; }

        /* ── MODAL ── */
        .overlay {
          position: fixed; inset: 0; z-index: 50;
          display: flex; align-items: flex-end; justify-content: center;
          background: rgba(0,0,0,0.55);
          backdrop-filter: blur(10px); -webkit-backdrop-filter: blur(10px);
          animation: fadeIn 0.2s ease;
        }
        .sheet {
          position: relative; width: 100%; max-width: 540px;
          background: #FFFDF9;
          border: 1px solid rgba(0,0,0,0.06);
          border-radius: 28px 28px 0 0;
          max-height: 93vh; overflow-y: auto;
          animation: slideUp 0.34s cubic-bezier(0.32,0.72,0,1);
          box-shadow: 0 -12px 48px rgba(0,0,0,0.18);
        }
        .handle-row { display:flex; justify-content:center; padding:14px 0 0; }
        .handle     { width:40px; height:4px; border-radius:2px; background:rgba(0,0,0,0.12); }
        .close-btn {
          position: absolute; top: 14px; right: 16px;
          width: 34px; height: 34px; border-radius: 50%;
          background: #F2EDE6; border: 1px solid rgba(0,0,0,0.08);
          color: #888; cursor: pointer; font-size: 14px;
          display: flex; align-items: center; justify-content: center;
          transition: all 0.15s;
        }
        .close-btn:hover { background: #FFE8E0; color: #C84B2A; }

        /* Modal hero */
        .m-hero { margin: 10px 16px 0; border-radius: 18px; overflow: hidden; aspect-ratio: 16/9; position: relative; }
        .m-hero img { width:100%; height:100%; object-fit:cover; display:block; }
        .m-hero-ph  { width:100%; height:100%; display:flex; align-items:center; justify-content:center; font-size:68px; background:linear-gradient(160deg,#FFF0E0,#FADDBD); }

        .sbody { padding: 20px 22px 38px; }
        .m-title { font-family:'Playfair Display',serif; font-weight:800; font-size:26px; color:#1A1008; text-align:center; margin-bottom:12px; line-height:1.2; }

        .m-tags  { display:flex; justify-content:center; gap:7px; flex-wrap:wrap; margin-bottom:14px; }
        .tag { padding:5px 14px; border-radius:8px; font-size:12px; font-weight:600; }
        .tag-cat { background:#F2EDE6; color:#5A5040; }
        .tag-veg { background:#EBF7EF; color:#1A6A38; }
        .tag-nv  { background:#FDECEA; color:#8B2010; }
        .tag-pop { background:#FFF0EB; color:#C84B2A; }

        .m-pills { display:flex; justify-content:center; gap:8px; flex-wrap:wrap; margin-bottom:16px; }
        .m-pill  { display:flex; align-items:center; gap:5px; padding:6px 14px; border-radius:8px; font-size:12px; font-weight:600; background:#F2EDE6; color:#5A5040; }

        .m-price     { text-align:center; font-family:'Playfair Display',serif; font-size:36px; font-weight:800; color:#C84B2A; }
        .m-price-sub { text-align:center; font-size:11px; color:#AAA; margin-top:2px; margin-bottom:16px; }
        .m-desc      { font-size:14px; color:#6A6050; line-height:1.75; text-align:center; margin-bottom:20px; }

        .divider { height:1px; background:rgba(0,0,0,0.07); margin:18px 0; }
        .sec-lbl { font-size:10px; font-weight:800; color:#AAA; letter-spacing:0.12em; text-transform:uppercase; margin-bottom:12px; }

        .nutr { display:grid; grid-template-columns:repeat(4,1fr); gap:8px; margin-bottom:20px; }
        .nc   { background:#F8F5F0; border:1px solid #EAE5DE; border-radius:12px; padding:13px 8px; text-align:center; }
        .nc-v { font-family:'Playfair Display',serif; font-size:20px; font-weight:700; color:#C84B2A; }
        .nc-u { font-size:10px; color:#AAA; margin-top:1px; }
        .nc-l { font-size:10px; color:#888; margin-top:3px; font-weight:600; }

        .ings { display:flex; flex-wrap:wrap; gap:6px; margin-bottom:22px; }
        .ing  { padding:6px 14px; border-radius:8px; font-size:12px; color:#5A5040; background:#F2EDE6; border:1px solid #E2DDD6; font-weight:500; }

        /* AR Button */
        .ar-btn {
          width:100%; padding:18px; border-radius:16px; border:none;
          background: #2A2018; color: #FFF5E8;
          font-family:'Plus Jakarta Sans',sans-serif; font-weight:800; font-size:16px;
          cursor:pointer; display:flex; align-items:center; justify-content:center; gap:12px;
          box-shadow: 0 8px 24px rgba(42,32,24,0.3);
          transition: transform 0.15s, box-shadow 0.15s;
          letter-spacing: 0.01em;
        }
        .ar-btn:hover  { transform:translateY(-2px); box-shadow:0 14px 32px rgba(42,32,24,0.4); }
        .ar-btn:active { transform:scale(0.98); }
        .ar-btn-accent { color: #F4A070; }
        .ar-hint { text-align:center; font-size:11px; color:#AAA; margin-top:9px; }

        /* ── SMART MENU ASSISTANT FAB ── */
        .sma-fab {
          position: fixed; bottom: 26px; left: 50%; transform: translateX(-50%);
          z-index: 45;
          display: flex; align-items: center; gap: 9px;
          padding: 14px 28px; border-radius: 50px; border: none;
          background: #2A2018;
          color: #FFF5E8;
          font-family: 'Plus Jakarta Sans', sans-serif; font-weight: 800; font-size: 15px;
          cursor: pointer; white-space: nowrap;
          box-shadow: 0 6px 28px rgba(42,32,24,0.4);
          transition: transform 0.2s ease, box-shadow 0.2s ease;
          animation: fadeUp 0.5s 0.3s ease both;
        }
        .sma-fab:hover  { transform: translateX(-50%) translateY(-3px); box-shadow: 0 12px 36px rgba(42,32,24,0.5); }
        .sma-fab:active { transform: translateX(-50%) scale(0.97); }
        .sma-fab-icon { font-size: 18px; }

        /* SMA overlay */
        .sma-overlay {
          position:fixed; inset:0; z-index:55;
          display:flex; align-items:flex-end; justify-content:center;
          background:rgba(0,0,0,0.55);
          backdrop-filter:blur(10px); -webkit-backdrop-filter:blur(10px);
          animation:fadeIn 0.2s ease;
        }
        .sma-sheet {
          position:relative; width:100%; max-width:540px;
          background:#FFFDF9;
          border:1px solid rgba(0,0,0,0.06);
          border-radius:28px 28px 0 0;
          max-height:90vh; overflow-y:auto;
          animation:slideUp 0.32s cubic-bezier(0.32,0.72,0,1);
          box-shadow:0 -12px 48px rgba(0,0,0,0.18);
          font-family:'Plus Jakarta Sans',sans-serif;
        }
        .sma-prog-wrap { padding:20px 24px 0; }
        .sma-prog-row  { display:flex; align-items:center; justify-content:space-between; margin-bottom:10px; }
        .sma-prog-txt  { font-size:12px; font-weight:600; color:#AAA; }
        .sma-back      { font-size:12px; font-weight:700; color:#AAA; background:none; border:none; cursor:pointer; font-family:'Plus Jakarta Sans',sans-serif; padding:0; }
        .sma-back:hover { color:#C84B2A; }
        .sma-prog-bar  { height:3px; background:#EAE5DE; border-radius:99px; overflow:hidden; }
        .sma-prog-fill { height:100%; background:#2A2018; border-radius:99px; transition:width 0.35s ease; }

        .sma-q-wrap  { padding:28px 24px 36px; }
        .sma-q-emoji { font-size:44px; text-align:center; margin-bottom:14px; }
        .sma-q-text  { font-family:'Playfair Display',serif; font-weight:800; font-size:22px; color:#1A1008; text-align:center; margin-bottom:6px; line-height:1.3; }
        .sma-q-sub   { font-size:13px; color:#AAA; text-align:center; margin-bottom:24px; font-weight:500; }
        .sma-opts    { display:flex; flex-direction:column; gap:9px; }
        .sma-opt {
          display:flex; align-items:center; gap:14px;
          padding:15px 18px; border-radius:14px; border:1.5px solid #EAE5DE;
          background:#FAFAF8; cursor:pointer;
          transition:all 0.18s ease;
          text-align:left; width:100%; font-family:'Plus Jakarta Sans',sans-serif;
        }
        .sma-opt:hover  { background:#fff; border-color:#C84B2A; transform:translateX(3px); }
        .sma-opt:active { transform:scale(0.98); }
        .sma-opt-emoji  { font-size:26px; flex-shrink:0; }
        .sma-opt-label  { font-size:14px; font-weight:700; color:#1A1008; }
        .sma-close-txt  { text-align:center; margin-top:18px; }
        .sma-dismiss    { font-size:12px; color:#CCC; background:none; border:none; cursor:pointer; font-family:'Plus Jakarta Sans',sans-serif; }
        .sma-dismiss:hover { color:#C84B2A; }

        .sma-res-wrap   { padding:20px 20px 40px; }
        .sma-res-hdr    { text-align:center; margin-bottom:22px; }
        .sma-res-emoji  { font-size:40px; margin-bottom:8px; }
        .sma-res-title  { font-family:'Playfair Display',serif; font-weight:800; font-size:22px; color:#1A1008; margin-bottom:5px; }
        .sma-res-sub    { font-size:13px; color:#AAA; font-weight:500; }
        .sma-cat-lbl    { font-size:10px; font-weight:800; color:#AAA; letter-spacing:0.12em; text-transform:uppercase; margin:18px 0 9px 2px; }
        .sma-item {
          display:flex; align-items:center; gap:13px;
          padding:12px 14px; border-radius:14px; margin-bottom:7px;
          background:#FAFAF8; border:1.5px solid #EAE5DE;
          cursor:pointer; transition:all 0.16s ease;
          text-align:left; width:100%; font-family:'Plus Jakarta Sans',sans-serif;
        }
        .sma-item:hover { background:#fff; border-color:#C84B2A; transform:translateX(3px); }
        .sma-item-img   { width:52px; height:52px; border-radius:12px; object-fit:cover; flex-shrink:0; background:#F2EDE6; }
        .sma-item-name  { font-family:'Playfair Display',serif; font-size:14px; font-weight:700; color:#1A1008; margin-bottom:4px; }
        .sma-item-meta  { display:flex; align-items:center; gap:7px; flex-wrap:wrap; }
        .sma-item-price { font-size:14px; font-weight:800; color:#C84B2A; }
        .sma-item-tag   { font-size:10px; font-weight:700; padding:2px 8px; border-radius:6px; }
        .sma-item-tag-pop { background:#FFF0EB; color:#C84B2A; }
        .sma-item-tag-ar  { background:#EBF7EF; color:#1A6A38; }
        .sma-actions { display:flex; gap:10px; margin-top:22px; }
        .sma-btn-dark { flex:1; padding:14px; border-radius:12px; border:none; background:#2A2018; color:#FFF5E8; font-family:'Plus Jakarta Sans',sans-serif; font-weight:800; font-size:14px; cursor:pointer; }
        .sma-btn-light { flex:1; padding:14px; border-radius:12px; border:1.5px solid #EAE5DE; background:transparent; color:#5A5040; font-family:'Plus Jakarta Sans',sans-serif; font-weight:600; font-size:14px; cursor:pointer; }
        .sma-btn-light:hover { background:#F2EDE6; }
        .sma-no-match { text-align:center; padding:36px 20px; color:#AAA; }
      `}</style>

      {/* ── HEADER ── */}
      <header className="hdr">
        <div className="hdr-inner">
          <div className="hdr-top">
            <div className="logo">🍽️</div>
            <div>
              <div className="rname">{restaurant.name}</div>
              <div className="rsub">Tap a dish · View in AR on your table</div>
            </div>
            {arCount > 0 && (
              <div className="ar-live-badge"><span className="ar-dot"/>AR Live</div>
            )}
          </div>
          <div className="cats-wrap">
            {cats.map(c => (
              <button key={c} className={`cat-pill${activeCat===c?' on':''}`} onClick={()=>setActiveCat(c)}>
                <span className="cat-icon">{catIcon(c)}</span>
                {c}
              </button>
            ))}
          </div>
        </div>
      </header>

      <main className="main">

        {/* Offer banner */}
        {offers?.[0] && (
          <div className="offer-bar">
            <span className="offer-bar-icon">🎉</span>
            <div>
              <div className="offer-bar-title">{offers[0].title}</div>
              {offers[0].description && <div className="offer-bar-desc">{offers[0].description}</div>}
            </div>
          </div>
        )}

        {/* AR strip — properly visible now */}
        {arCount > 0 && (
          <div className="ar-strip">
            <span className="ar-strip-icon">🥽</span>
            <div>
              <div className="ar-strip-main">{arCount} dish{arCount!==1?'es':''} available in AR</div>
              <div className="ar-strip-sub">No app needed · Tap a card, then "View in AR"</div>
            </div>
            <div className="ar-strip-badge">NEW</div>
          </div>
        )}

        {/* Grid */}
        {filtered.length === 0 ? (
          <div className="empty">
            <div style={{fontSize:44,marginBottom:10}}>🥢</div>
            <p style={{fontWeight:600,fontSize:14}}>No items in this category</p>
          </div>
        ) : (
          <div className="grid">
            {filtered.map((item, idx) => (
              <button key={item.id} className="card" style={{animationDelay:`${idx*0.05}s`}} onClick={()=>openItem(item)}>
                <div className="c-img">
                  <img src={imgSrc(item)} alt={item.name} loading="lazy" onError={()=>setImgErr(e=>({...e,[item.id]:true}))}/>
                  {item.modelURL && (
                    <span className="c-ar-badge">
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg>
                      AR
                    </span>
                  )}
                  {typeof item.isVeg === 'boolean' && <span className={`veg-ind ${item.isVeg?'v':'nv'}`}/>}
                  {item.offerBadge && item.offerLabel && (
                    <div className="c-ribbon" style={{background:item.offerColor||'#C84B2A'}}>🏷 {item.offerLabel}</div>
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
                    {item.price && <span className="c-price">₹{item.price}</span>}
                    {item.calories && <span className="c-cal">{item.calories} kcal</span>}
                  </div>
                  {(item.spiceLevel && item.spiceLevel!=='None' || item.prepTime) && (
                    <div className="c-meta">
                      {item.spiceLevel && item.spiceLevel!=='None' && (
                        <span className="c-spice">{SPICE_DOT[item.spiceLevel]} {SPICE_LABEL[item.spiceLevel]}</span>
                      )}
                      {item.prepTime && <span className="c-prep">⏱ {item.prepTime}</span>}
                    </div>
                  )}
                  {item.modelURL && (
                    <div className="c-ar-cta">
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg>
                      View in AR
                    </div>
                  )}
                </div>
              </button>
            ))}
          </div>
        )}
      </main>

      {/* ── FAB ── */}
      {!selectedItem && !smaOpen && (
        <button className="sma-fab" onClick={openSMA}>
          <span className="sma-fab-icon">✨</span>
          Help Me Choose
        </button>
      )}

      {/* ── ITEM MODAL ── */}
      {selectedItem && (
        <div className="overlay" onClick={e=>{if(e.target===e.currentTarget)closeItem();}}>
          <div className="sheet">
            <div className="handle-row"><div className="handle"/></div>
            <button className="close-btn" onClick={closeItem}>✕</button>
            {!showAR && (
              <div className="m-hero">
                {imgSrc(selectedItem) ? (
                  <img src={imgSrc(selectedItem)} alt={selectedItem.name} onError={()=>setImgErr(e=>({...e,[selectedItem.id]:true}))}/>
                ) : <div className="m-hero-ph">🍽️</div>}
                {selectedItem.offerBadge && selectedItem.offerLabel && (
                  <div style={{position:'absolute',bottom:0,left:0,right:0,padding:'8px 16px',background:selectedItem.offerColor||'#C84B2A',color:'#fff',fontSize:12,fontWeight:800,textAlign:'center',letterSpacing:'0.03em'}}>🏷 {selectedItem.offerLabel}</div>
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
                  {selectedItem.prepTime && <span className="m-pill">⏱ Ready in {selectedItem.prepTime}</span>}
                  {selectedItem.spiceLevel&&selectedItem.spiceLevel!=='None' && <span className="m-pill">{SPICE_DOT[selectedItem.spiceLevel]} {selectedItem.spiceLevel}</span>}
                </div>
              )}
              {selectedItem.price && <><div className="m-price">₹{selectedItem.price}</div><div className="m-price-sub">per serving</div></>}
              {selectedItem.description && <p className="m-desc">{selectedItem.description}</p>}
              {(selectedItem.calories||selectedItem.protein||selectedItem.carbs||selectedItem.fats) && (<>
                <div className="divider"/>
                <div className="sec-lbl">Nutrition per serving</div>
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
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg>
                  <span>View in AR —<span className="ar-btn-accent"> Point at Your Table</span></span>
                </button>
                <div className="ar-hint">No app needed · Android Chrome &amp; iOS Safari</div>
              </>)}
              {showAR && <ARViewerEmbed modelURL={selectedItem.modelURL} itemName={selectedItem.name} onARLaunch={handleARLaunch}/>}
            </div>
          </div>
        </div>
      )}

      {/* ── SMART MENU ASSISTANT ── */}
      {smaOpen && (
        <div className="sma-overlay" onClick={e=>{if(e.target===e.currentTarget)closeSMA();}}>
          <div className="sma-sheet">
            <div className="handle-row"><div className="handle"/></div>

            {smaStep < QUESTIONS.length && (<>
              <div className="sma-prog-wrap">
                <div className="sma-prog-row">
                  <span className="sma-prog-txt">Question {smaStep+1} of {QUESTIONS.length}</span>
                  {smaStep>0 && <button className="sma-back" onClick={()=>setSmaStep(s=>s-1)}>← Back</button>}
                </div>
                <div className="sma-prog-bar">
                  <div className="sma-prog-fill" style={{width:`${((smaStep+1)/QUESTIONS.length)*100}%`}}/>
                </div>
              </div>
              <div className="sma-q-wrap">
                <div className="sma-q-emoji">{QUESTIONS[smaStep].emoji}</div>
                <div className="sma-q-text">{QUESTIONS[smaStep].q}</div>
                <div className="sma-q-sub">{QUESTIONS[smaStep].sub}</div>
                <div className="sma-opts">
                  {QUESTIONS[smaStep].opts.map(o=>(
                    <button key={o.value} className="sma-opt" onClick={()=>pickAnswer(QUESTIONS[smaStep].id, o.value)}>
                      <span className="sma-opt-emoji">{o.emoji}</span>
                      <span className="sma-opt-label">{o.label}</span>
                    </button>
                  ))}
                </div>
                <div className="sma-close-txt"><button className="sma-dismiss" onClick={closeSMA}>Dismiss</button></div>
              </div>
            </>)}

            {smaStep === QUESTIONS.length && (()=>{
              const top = smaResults.slice(0,12);
              const groups = {};
              top.forEach(({item})=>{ const c=item.category||'Other'; if(!groups[c]) groups[c]=[]; groups[c].push(item); });
              return (
                <div className="sma-res-wrap">
                  <div className="sma-res-hdr">
                    <div className="sma-res-emoji">🎯</div>
                    <div className="sma-res-title">{top.length>0?`${top.length} dishes for you`:'No matches'}</div>
                    <div className="sma-res-sub">{top.length>0?'Based on your preferences — tap any dish':'Try again with different preferences'}</div>
                  </div>
                  {top.length===0 ? (
                    <div className="sma-no-match">
                      <p>No dishes matched all your filters.</p>
                      <button className="sma-btn-dark" style={{marginTop:16,width:'100%'}} onClick={restartSMA}>Try Again</button>
                    </div>
                  ) : (<>
                    {Object.entries(groups).map(([cat,items])=>(
                      <div key={cat}>
                        <div className="sma-cat-lbl">{cat}</div>
                        {items.map(item=>(
                          <button key={item.id} className="sma-item" onClick={()=>{closeSMA();openItem(item);}}>
                            <img className="sma-item-img" src={imgSrc(item)} alt={item.name} onError={()=>setImgErr(e=>({...e,[item.id]:true}))}/>
                            <div style={{flex:1,minWidth:0}}>
                              <div className="sma-item-name">{item.name}</div>
                              <div className="sma-item-meta">
                                {item.price && <span className="sma-item-price">₹{item.price}</span>}
                                {item.isPopular && <span className="sma-item-tag sma-item-tag-pop">✦ Popular</span>}
                                {item.modelURL  && <span className="sma-item-tag sma-item-tag-ar">🥽 AR</span>}
                                {item.prepTime  && <span style={{fontSize:11,color:'#AAA'}}>⏱ {item.prepTime}</span>}
                              </div>
                            </div>
                            <span style={{fontSize:16,color:'#CCC',flexShrink:0}}>›</span>
                          </button>
                        ))}
                      </div>
                    ))}
                    <div className="sma-actions">
                      <button className="sma-btn-light" onClick={restartSMA}>↺ Redo</button>
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
