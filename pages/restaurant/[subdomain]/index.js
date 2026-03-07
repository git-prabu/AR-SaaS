import Head from 'next/head';
import { useState, useEffect, useCallback, useRef } from 'react';
import { getRestaurantBySubdomain, getMenuItems, getActiveOffers, trackVisit, incrementItemView, incrementARView } from '../../../lib/db';
import { ARViewerEmbed } from '../../../components/ARViewer';

function getSessionId() {
  if (typeof window === 'undefined') return 'ssr';
  let sid = sessionStorage.getItem('ar_sid');
  if (!sid) { sid = Math.random().toString(36).substr(2,16); sessionStorage.setItem('ar_sid',sid); }
  return sid;
}

const FOOD_PLACEHOLDERS = [
  'https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?w=800&q=80',
  'https://images.unsplash.com/photo-1504674900247-0877df9cc836?w=800&q=80',
  'https://images.unsplash.com/photo-1540189549336-e6e99c3679fe?w=800&q=80',
  'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=800&q=80',
  'https://images.unsplash.com/photo-1567620905732-2d1ec7ab7445?w=800&q=80',
  'https://images.unsplash.com/photo-1565958011703-44f9829ba187?w=800&q=80',
  'https://images.unsplash.com/photo-1512621776951-a57141f2eefd?w=800&q=80',
  'https://images.unsplash.com/photo-1482049016688-2d3e1b311543?w=800&q=80',
];
function getPlaceholder(id) {
  let h=0; for(let i=0;i<(id||'').length;i++) h=(h*31+id.charCodeAt(i))>>>0;
  return FOOD_PLACEHOLDERS[h%FOOD_PLACEHOLDERS.length];
}

const SPICE_MAP = {
  Mild:        {label:'Mild',       color:'#B8962E', dot:'○'},
  Medium:      {label:'Medium',     color:'#C4612A', dot:'◎'},
  Spicy:       {label:'Spicy',      color:'#B83030', dot:'●'},
  'Very Spicy':{label:'Very Spicy', color:'#8B1A1A', dot:'●'},
};
function catIcon(n=''){
  n=n.toLowerCase();
  if(n==='all')return'◈';if(n.includes('starter')||n.includes('appetizer'))return'○';
  if(n.includes('main'))return'◉';if(n.includes('burger'))return'◈';
  if(n.includes('pizza'))return'◎';if(n.includes('pasta')||n.includes('noodle'))return'○';
  if(n.includes('dessert')||n.includes('sweet'))return'◇';
  if(n.includes('drink')||n.includes('beverage')||n.includes('juice'))return'◦';
  if(n.includes('coffee')||n.includes('tea'))return'◦';
  if(n.includes('breakfast'))return'○';if(n.includes('seafood')||n.includes('fish'))return'◈';
  if(n.includes('chicken'))return'◉';if(n.includes('rice')||n.includes('biryani'))return'◎';
  if(n.includes('salad'))return'○';if(n.includes('soup'))return'◦';
  if(n.includes('snack'))return'◇';if(n.includes('special')||n.includes('chef'))return'✦';
  return'◦';
}

// ── SMA DATA ─────────────────────────────────────────────────────
const SOLO_QS=[
  {id:'diet',  q:'Dietary preference?',  opts:[{l:'Vegetarian',v:'veg'},{l:'Non-Veg',v:'nonveg'},{l:'No preference',v:'any'}]},
  {id:'mood',  q:"What's your mood?",    opts:[{l:'Comfort food',v:'comfort'},{l:'Healthy',v:'healthy'},{l:'Most popular',v:'popular'},{l:'Surprise me',v:'new'}]},
  {id:'spice', q:'Spice tolerance?',     opts:[{l:'Mild only',v:'mild'},{l:'Medium',v:'medium'},{l:'Spicy',v:'spicy'},{l:'Anything',v:'any'}]},
  {id:'size',  q:'How hungry?',          opts:[{l:'Light bite',v:'light'},{l:'Regular meal',v:'regular'},{l:'Full feast',v:'heavy'},{l:'Anything',v:'any'}]},
  {id:'budget',q:'Budget per dish?',     opts:[{l:'Under ₹200',v:'budget'},{l:'₹200–500',v:'mid'},{l:'₹500+',v:'premium'},{l:'No limit',v:'any'}]},
];
const GROUP_QS=[
  {id:'diet',  q:'Anyone vegetarian?',      opts:[{l:'Keep it veg',v:'veg'},{l:'We eat everything',v:'any'},{l:'Mix — both',v:'mixed'}]},
  {id:'spice', q:"Group's spice limit?",    opts:[{l:'Mild for all',v:'mild'},{l:'Medium',v:'medium'},{l:'We love it spicy',v:'spicy'},{l:'No limit',v:'any'}]},
  {id:'style', q:'How are you ordering?',   opts:[{l:'Individual dishes',v:'individual'},{l:'Sharing together',v:'sharing'},{l:'Mix of both',v:'mix'}]},
  {id:'mood',  q:"Group's vibe?",           opts:[{l:'Comfort classics',v:'comfort'},{l:'Light & healthy',v:'healthy'},{l:'What\'s popular',v:'popular'},{l:'Explore new',v:'new'}]},
  {id:'budget',q:'Budget per person?',      opts:[{l:'Under ₹200',v:'budget'},{l:'₹200–500',v:'mid'},{l:'₹500+',v:'premium'},{l:'No limit',v:'any'}]},
];
const GROUP_SIZES=[{n:2},{n:3},{n:4},{n:5},{n:'6+'}];
const LIGHT_CATS=['starter','salad','soup','snack','drink','beverage','dessert'];
const HEAVY_CATS=['main','burger','pasta','pizza','biryani','thali','grill','rice'];
const SHARING_KW=['platter','sharing','family','large','combo','bucket','plate','thali','spread','feast'];
const HEALTHY_KW=['salad','grilled','steamed','healthy','light','vegan','fresh','oat','quinoa','fruit'];
const COMFORT_KW=['butter','cheese','cream','fried','crispy','masala','curry','rich','loaded','classic'];
function isShareable(item){const t=`${item.name||''} ${item.description||''} ${item.category||''}`.toLowerCase();return SHARING_KW.some(k=>t.includes(k));}
function scoreItem(item,ans,gs=1){
  let s=0;const t=`${item.name||''} ${item.description||''} ${item.category||''}`.toLowerCase();
  const cat=(item.category||'').toLowerCase(),sp=item.spiceLevel||'None',pr=item.price?Number(item.price):null,big=typeof gs==='number'?gs>=4:true;
  if(ans.diet==='veg'&&item.isVeg===false)return -999;
  if(ans.diet==='veg'&&item.isVeg===true)s+=20;
  if(ans.diet==='mixed'&&item.isVeg===true)s+=8;
  if(ans.spice==='mild'&&['Spicy','Very Spicy'].includes(sp))return -999;
  if(ans.spice==='mild'&&['None','Mild'].includes(sp))s+=15;
  if(ans.spice==='medium'&&sp==='Medium')s+=20;
  if(ans.spice==='spicy'&&['Spicy','Very Spicy'].includes(sp))s+=25;
  if(pr!==null){
    if(ans.budget==='budget'&&pr<200)s+=20;else if(ans.budget==='budget')s-=15;
    if(ans.budget==='mid'&&pr>=200&&pr<=500)s+=20;else if(ans.budget==='mid')s-=8;
    if(ans.budget==='premium'&&pr>500)s+=20;else if(ans.budget==='premium'&&pr<200)s-=10;
  }
  if(ans.size==='light'){if(LIGHT_CATS.some(l=>cat.includes(l)))s+=18;if(HEAVY_CATS.some(h=>cat.includes(h)))s-=15;}
  if(ans.size==='heavy')if(HEAVY_CATS.some(h=>cat.includes(h)))s+=18;
  if(ans.style==='sharing'&&isShareable(item))s+=25;
  if(big&&isShareable(item))s+=15;
  if(ans.mood==='popular'&&(item.isPopular||item.isFeatured))s+=30;
  if(ans.mood==='healthy'){if(HEALTHY_KW.some(k=>t.includes(k)))s+=20;if(item.calories&&item.calories<400)s+=10;}
  if(ans.mood==='comfort')if(COMFORT_KW.some(k=>t.includes(k)))s+=20;
  if(ans.mood==='new'){if(item.isFeatured)s+=25;s+=Math.floor(Math.random()*12);}
  s+=Math.min((item.views||0)+(item.arViews||0)*2,20)*0.3;
  return s;
}
function filterItems(items,ans,gs=1){return items.map(i=>({item:i,score:scoreItem(i,ans,gs)})).filter(({score})=>score>-999).sort((a,b)=>b.score-a.score);}

// ── count-up hook ──────────────────────────────────────────────
function useCountUp(ref, target, duration=900) {
  useEffect(()=>{
    const el=ref.current; if(!el||!target) return;
    const obs=new IntersectionObserver(([e])=>{
      if(!e.isIntersecting) return;
      obs.disconnect();
      const start=Date.now(), from=0, to=Number(target);
      if(isNaN(to)){el.textContent=target;return;}
      const tick=()=>{
        const p=Math.min((Date.now()-start)/duration,1);
        const ease=1-Math.pow(1-p,4);
        el.textContent=Math.round(from+(to-from)*ease);
        if(p<1) requestAnimationFrame(tick); else el.textContent=to;
      };
      requestAnimationFrame(tick);
    },{threshold:0.3});
    obs.observe(el);
    return()=>obs.disconnect();
  },[target,duration]);
}

// ── scroll reveal ──────────────────────────────────────────────
function useReveal(ref,delay=0){
  useEffect(()=>{
    const el=ref.current; if(!el) return;
    el.style.transitionDelay=`${delay}ms`;
    const obs=new IntersectionObserver(([e])=>{
      if(e.isIntersecting){el.classList.add('vis');obs.disconnect();}
    },{threshold:0.05});
    obs.observe(el);
    return()=>obs.disconnect();
  },[delay]);
}

// ── Menu Card ─────────────────────────────────────────────────
function MenuCard({item,idx,imgErr,setImgErr,onOpen}){
  const ref=useRef(null);
  const priceRef=useRef(null);
  useReveal(ref,(idx%4)*80);
  useCountUp(priceRef,item.price,800);
  const sp=SPICE_MAP[item.spiceLevel];
  const src=!imgErr[item.id]&&item.imageURL?item.imageURL:getPlaceholder(item.id);
  return(
    <button ref={ref} className="card reveal" onClick={()=>onOpen(item)}>
      <div className="card-img">
        <img src={src} alt={item.name} loading="lazy" onError={()=>setImgErr(e=>({...e,[item.id]:true}))}/>
        <div className="card-img-scrim"/>
        {item.modelURL&&<div className="card-ar-tag">AR</div>}
        {typeof item.isVeg==='boolean'&&<div className={`vdot ${item.isVeg?'g':'r'}`}/>}
        {item.offerBadge&&item.offerLabel&&<div className="card-ribbon" style={{background:item.offerColor||'#C4612A'}}>{item.offerLabel}</div>}
      </div>
      <div className="card-body">
        {(item.isFeatured||item.isPopular)&&(
          <div className="card-flags">
            {item.isFeatured&&<span className="flag-feat">Featured</span>}
            {item.isPopular&&<span className="flag-pop">Popular</span>}
          </div>
        )}
        <div className="card-name">{item.name}</div>
        <div className="card-bottom">
          <div className="card-price-wrap">
            {item.price&&<><span className="card-curr">₹</span><span className="card-price" ref={priceRef}>{item.price}</span></>}
          </div>
          <div className="card-meta-right">
            {sp&&<span className="card-spice" style={{color:sp.color}}>{sp.dot} {sp.label}</span>}
            {item.modelURL&&<span className="card-ar-cta">View AR →</span>}
          </div>
        </div>
      </div>
    </button>
  );
}

// ════════════════════════════════════════════════════════════════
export default function RestaurantMenu({restaurant,menuItems,offers,error}){
  const [activeCat,setActiveCat]=useState('All');
  const [selectedItem,setSelectedItem]=useState(null);
  const [showAR,setShowAR]=useState(false);
  const [imgErr,setImgErr]=useState({});
  const [smaOpen,setSmaOpen]=useState(false);
  const [smaMode,setSmaMode]=useState(null);
  const [groupSize,setGroupSize]=useState(null);
  const [smaStep,setSmaStep]=useState(0);
  const [smaAnswers,setSmaAnswers]=useState({});
  const [smaResults,setSmaResults]=useState([]);
  const heroNameRef=useRef(null);

  useEffect(()=>{if(restaurant?.id)trackVisit(restaurant.id,getSessionId()).catch(()=>{});},[restaurant?.id]);
  useEffect(()=>{document.body.style.overflow=(selectedItem||smaOpen)?'hidden':'';return()=>{document.body.style.overflow='';};},[selectedItem,smaOpen]);

  // Hero name letter animation
  useEffect(()=>{
    const el=heroNameRef.current; if(!el) return;
    const text=el.textContent;
    el.innerHTML=text.split('').map((ch,i)=>
      ch===' '?'<span style="display:inline-block;width:0.3em"> </span>'
      :`<span class="hero-letter" style="animation-delay:${i*35}ms">${ch}</span>`
    ).join('');
  },[restaurant?.name]);

  const cats=['All',...new Set((menuItems||[]).map(i=>i.category).filter(Boolean))];
  const filtered=activeCat==='All'?(menuItems||[]):(menuItems||[]).filter(i=>i.category===activeCat);
  const arCount=(menuItems||[]).filter(i=>i.modelURL).length;

  const openItem=useCallback(async(item)=>{setSelectedItem(item);setShowAR(false);if(restaurant?.id)incrementItemView(restaurant.id,item.id).catch(()=>{});},[restaurant?.id]);
  const closeItem=useCallback(()=>{setSelectedItem(null);setShowAR(false);},[]);
  const handleARLaunch=useCallback(async()=>{if(restaurant?.id&&selectedItem?.id)incrementARView(restaurant.id,selectedItem.id).catch(()=>{});},[restaurant?.id,selectedItem?.id]);
  const imgSrc=(item)=>(!imgErr[item.id]&&item.imageURL)?item.imageURL:getPlaceholder(item.id);

  const openSMA=()=>{setSmaOpen(true);setSmaMode(null);setGroupSize(null);setSmaStep(0);setSmaAnswers({});setSmaResults([]);};
  const closeSMA=()=>setSmaOpen(false);
  const restartSMA=()=>{setSmaMode(null);setGroupSize(null);setSmaStep(0);setSmaAnswers({});setSmaResults([]);};
  const activeQs=smaMode==='group'?GROUP_QS:SOLO_QS;
  const pickAnswer=(qId,val)=>{
    const ans={...smaAnswers,[qId]:val};setSmaAnswers(ans);
    if(smaStep<activeQs.length-1)setSmaStep(smaStep+1);
    else{setSmaResults(filterItems(menuItems||[],ans,groupSize));setSmaStep(activeQs.length);}
  };

  if(error||!restaurant) return(
    <div style={{minHeight:'100vh',background:'#08090C',display:'flex',alignItems:'center',justifyContent:'center',fontFamily:'sans-serif'}}>
      <div style={{textAlign:'center'}}>
        <div style={{fontSize:48,marginBottom:16,opacity:0.3}}>◎</div>
        <p style={{color:'rgba(255,255,255,0.3)',fontSize:14,letterSpacing:'0.1em',textTransform:'uppercase'}}>Restaurant not found</p>
      </div>
    </div>
  );

  return(<>
    <Head>
      <title>{restaurant.name}</title>
      <meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1"/>
      <link href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,300;12..96,400;12..96,500;12..96,600;12..96,700;12..96,800&family=DM+Mono:ital,wght@0,300;0,400;0,500&display=swap" rel="stylesheet"/>
    </Head>

    <style>{`
      /* ── RESET ── */
      *,*::before,*::after{box-sizing:border-box;-webkit-tap-highlight-color:transparent;margin:0;padding:0;}
      html{scroll-behavior:smooth;}

      /* ── GRAIN TEXTURE via SVG filter ── */
      body{
        background:#08090C;
        min-height:100vh;overflow-x:hidden;
        font-family:'Bricolage Grotesque',-apple-system,sans-serif;
        -webkit-font-smoothing:antialiased;
        color:rgba(255,255,255,0.85);
      }
      body::before{
        content:'';position:fixed;inset:0;z-index:0;pointer-events:none;
        background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='300' height='300'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.75' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='300' height='300' filter='url(%23n)' opacity='0.04'/%3E%3C/svg%3E");
        background-repeat:repeat;opacity:1;
      }

      /* ── KEYFRAMES ── */
      @keyframes letter-in{from{opacity:0;transform:translateY(60%) skewY(4deg)}to{opacity:1;transform:translateY(0) skewY(0deg)}}
      @keyframes fade-up{from{opacity:0;transform:translateY(20px)}to{opacity:1;transform:translateY(0)}}
      @keyframes slide-up{from{transform:translateY(100%)}to{transform:translateY(0)}}
      @keyframes fade-in{from{opacity:0}to{opacity:1}}
      @keyframes blink{0%,100%{opacity:1}50%{opacity:0.2}}
      @keyframes marquee{from{transform:translateX(0)}to{transform:translateX(-50%)}}

      /* ── SCROLL REVEAL ── */
      .reveal{opacity:0;transform:translateY(32px);transition:opacity 0.7s cubic-bezier(0.16,1,0.3,1),transform 0.7s cubic-bezier(0.16,1,0.3,1);}
      .reveal.vis{opacity:1;transform:translateY(0);}

      /* ═══════════════════════════════
         HERO
      ═══════════════════════════════ */
      .hero{
        position:relative;min-height:100svh;
        display:flex;flex-direction:column;
        justify-content:flex-end;
        padding:0 28px 56px;
        overflow:hidden;
      }
      /* Subtle radial glow at top — warm earth tone */
      .hero::after{
        content:'';position:absolute;
        top:-20%;left:50%;transform:translateX(-50%);
        width:80vw;height:60vw;
        background:radial-gradient(ellipse at center,rgba(180,130,60,0.07) 0%,transparent 70%);
        pointer-events:none;z-index:0;
      }
      /* Subtle horizontal rule that divides hero from content */
      .hero-rule{
        position:absolute;bottom:0;left:0;right:0;
        height:1px;background:rgba(255,255,255,0.07);
      }

      /* Big stat chips that float in the hero — Genesis style */
      .hero-chips{
        display:flex;flex-wrap:wrap;gap:8px;
        margin-bottom:32px;position:relative;z-index:1;
        animation:fade-up 0.8s 0.6s cubic-bezier(0.16,1,0.3,1) both;
      }
      .hero-chip{
        display:inline-flex;align-items:center;gap:7px;
        padding:7px 14px;border-radius:6px;
        background:rgba(255,255,255,0.05);
        border:1px solid rgba(255,255,255,0.09);
        font-family:'DM Mono',monospace;font-size:11px;
        color:rgba(255,255,255,0.5);letter-spacing:0.06em;
        backdrop-filter:blur(12px);
      }
      .hero-chip-dot{width:5px;height:5px;border-radius:50%;background:#B8962E;animation:blink 2s infinite;}
      .hero-chip strong{color:rgba(255,255,255,0.75);font-weight:500;}

      /* MASSIVE restaurant name */
      .hero-name{
        position:relative;z-index:1;
        font-family:'Bricolage Grotesque',sans-serif;
        font-size:clamp(48px,10vw,120px);
        font-weight:800;
        line-height:0.92;
        letter-spacing:-0.04em;
        color:#F5F0E6;
        margin-bottom:20px;
        overflow:hidden;
      }
      .hero-letter{
        display:inline-block;
        animation:letter-in 0.6s cubic-bezier(0.16,1,0.3,1) both;
        transform-origin:bottom center;
      }
      .hero-tagline{
        position:relative;z-index:1;
        font-size:13px;color:rgba(255,255,255,0.3);
        letter-spacing:0.12em;text-transform:uppercase;
        font-weight:400;
        animation:fade-up 0.8s 0.5s cubic-bezier(0.16,1,0.3,1) both;
      }

      /* ═══════════════════════════════
         NAV / CATEGORY BAR
      ═══════════════════════════════ */
      .nav{
        position:sticky;top:0;z-index:40;
        background:rgba(8,9,12,0.88);
        backdrop-filter:blur(20px) saturate(140%);
        -webkit-backdrop-filter:blur(20px) saturate(140%);
        border-bottom:1px solid rgba(255,255,255,0.05);
      }
      .nav-inner{
        max-width:1140px;margin:0 auto;
        padding:0 28px;
        display:flex;align-items:center;gap:0;
        overflow-x:auto;scrollbar-width:none;
        -webkit-overflow-scrolling:touch;
      }
      .nav-inner::-webkit-scrollbar{display:none;}
      .cat-tab{
        flex-shrink:0;
        padding:16px 20px;
        font-family:'Bricolage Grotesque',sans-serif;
        font-size:13px;font-weight:500;
        color:rgba(255,255,255,0.35);
        letter-spacing:0.02em;
        cursor:pointer;white-space:nowrap;
        position:relative;
        transition:color 0.2s ease;
        background:none;border:none;
      }
      .cat-tab::after{
        content:'';position:absolute;bottom:0;left:20px;right:20px;
        height:1.5px;background:#B8962E;
        transform:scaleX(0);transform-origin:left;
        transition:transform 0.3s cubic-bezier(0.16,1,0.3,1);
      }
      .cat-tab:hover{color:rgba(255,255,255,0.65);}
      .cat-tab.on{color:rgba(255,255,255,0.92);font-weight:600;}
      .cat-tab.on::after{transform:scaleX(1);}

      /* ═══════════════════════════════
         MAIN CONTENT
      ═══════════════════════════════ */
      .main{max-width:1140px;margin:0 auto;padding:48px 28px 160px;position:relative;z-index:1;}

      /* Section label — Genesis-style uppercase micro-label */
      .section-label{
        font-family:'DM Mono',monospace;
        font-size:10px;font-weight:400;
        color:rgba(255,255,255,0.2);
        letter-spacing:0.18em;text-transform:uppercase;
        margin-bottom:28px;
        display:flex;align-items:center;gap:12px;
      }
      .section-label::after{content:'';flex:1;height:1px;background:rgba(255,255,255,0.06);}

      /* Offer banner */
      .offer-bar{
        display:flex;align-items:center;gap:16px;
        padding:16px 20px;margin-bottom:32px;
        border:1px solid rgba(184,150,46,0.2);
        border-radius:8px;
        background:rgba(184,150,46,0.04);
      }
      .offer-bar-icon{font-size:18px;opacity:0.7;}
      .offer-bar-title{font-size:13px;font-weight:600;color:rgba(184,150,46,0.8);letter-spacing:0.02em;}
      .offer-bar-desc{font-size:11px;color:rgba(184,150,46,0.4);margin-top:2px;}

      /* AR info bar */
      .ar-bar{
        display:flex;align-items:center;justify-content:space-between;
        padding:14px 20px;margin-bottom:40px;
        border:1px solid rgba(255,255,255,0.06);
        border-radius:8px;background:rgba(255,255,255,0.02);
      }
      .ar-bar-left{display:flex;align-items:center;gap:12px;}
      .ar-bar-num{font-family:'DM Mono',monospace;font-size:28px;font-weight:300;color:rgba(255,255,255,0.6);line-height:1;}
      .ar-bar-label{font-size:11px;color:rgba(255,255,255,0.25);letter-spacing:0.08em;text-transform:uppercase;margin-top:2px;}
      .ar-bar-cta{
        font-family:'DM Mono',monospace;font-size:10px;
        letter-spacing:0.1em;text-transform:uppercase;
        color:rgba(255,255,255,0.3);
        padding:8px 16px;border:1px solid rgba(255,255,255,0.1);border-radius:4px;
        transition:all 0.2s;
      }
      .ar-bar-cta:hover{color:rgba(255,255,255,0.6);border-color:rgba(255,255,255,0.2);}

      /* ═══════════════════════════════
         GRID
      ═══════════════════════════════ */
      .grid{display:grid;grid-template-columns:repeat(2,1fr);gap:1px;background:rgba(255,255,255,0.04);}
      @media(min-width:600px){.grid{grid-template-columns:repeat(3,1fr);}}
      @media(min-width:900px){.grid{grid-template-columns:repeat(4,1fr);}}
      @media(max-width:380px){.grid{grid-template-columns:1fr;}}

      /* ═══════════════════════════════
         CARD — glass data panel
      ═══════════════════════════════ */
      .card{
        background:#0D0E12;
        cursor:pointer;text-align:left;
        transition:background 0.25s ease;
        position:relative;overflow:hidden;
      }
      .card:hover{background:#111318;}
      /* Subtle top accent line that appears on hover */
      .card::before{
        content:'';position:absolute;top:0;left:0;right:0;
        height:1px;background:#B8962E;
        transform:scaleX(0);transform-origin:left;
        transition:transform 0.4s cubic-bezier(0.16,1,0.3,1);z-index:2;
      }
      .card:hover::before{transform:scaleX(1);}

      .card-img{position:relative;width:100%;aspect-ratio:4/3;overflow:hidden;background:#0A0B0F;}
      .card-img img{
        width:100%;height:100%;object-fit:cover;display:block;
        filter:brightness(0.88) saturate(0.9);
        transition:transform 0.6s cubic-bezier(0.16,1,0.3,1),filter 0.4s ease;
      }
      .card:hover .card-img img{transform:scale(1.05);filter:brightness(0.95) saturate(1.0);}
      .card-img-scrim{position:absolute;inset:0;background:linear-gradient(to bottom,transparent 40%,rgba(8,9,12,0.7) 100%);pointer-events:none;}

      /* AR tag — monospace minimal */
      .card-ar-tag{
        position:absolute;top:10px;right:10px;
        font-family:'DM Mono',monospace;
        font-size:9px;letter-spacing:0.12em;font-weight:500;
        color:rgba(255,255,255,0.5);
        padding:3px 8px;border:1px solid rgba(255,255,255,0.15);
        border-radius:3px;background:rgba(8,9,12,0.7);backdrop-filter:blur(8px);
      }

      /* Veg dot */
      .vdot{position:absolute;top:10px;left:10px;width:16px;height:16px;border-radius:3px;
        background:rgba(8,9,12,0.7);backdrop-filter:blur(8px);
        display:flex;align-items:center;justify-content:center;border:1px solid;}
      .vdot::after{content:'';width:6px;height:6px;border-radius:50%;}
      .vdot.g{border-color:rgba(80,160,100,0.5);}.vdot.g::after{background:#50A064;}
      .vdot.r{border-color:rgba(180,60,60,0.5);}.vdot.r::after{background:#B43C3C;}

      /* Offer ribbon */
      .card-ribbon{position:absolute;bottom:0;left:0;right:0;padding:5px 10px;font-size:9px;font-weight:600;
        color:rgba(255,255,255,0.9);letter-spacing:0.06em;text-transform:uppercase;text-align:center;}

      /* Card body */
      .card-body{padding:14px 16px 16px;}
      .card-flags{display:flex;gap:6px;margin-bottom:8px;}
      .flag-feat,.flag-pop{font-family:'DM Mono',monospace;font-size:8px;font-weight:400;
        letter-spacing:0.1em;text-transform:uppercase;padding:3px 7px;border-radius:3px;}
      .flag-feat{color:rgba(184,150,46,0.7);border:1px solid rgba(184,150,46,0.2);}
      .flag-pop{color:rgba(196,97,42,0.7);border:1px solid rgba(196,97,42,0.2);}

      .card-name{
        font-size:14px;font-weight:600;color:rgba(255,255,255,0.82);
        line-height:1.3;margin-bottom:12px;letter-spacing:-0.01em;
      }
      .card-bottom{display:flex;align-items:flex-end;justify-content:space-between;gap:8px;}
      .card-price-wrap{display:flex;align-items:baseline;gap:1px;}
      .card-curr{font-family:'DM Mono',monospace;font-size:11px;color:rgba(255,255,255,0.3);margin-right:2px;}
      .card-price{font-family:'DM Mono',monospace;font-size:20px;font-weight:500;color:rgba(255,255,255,0.75);letter-spacing:-0.03em;}
      .card-meta-right{display:flex;flex-direction:column;align-items:flex-end;gap:4px;}
      .card-spice{font-family:'DM Mono',monospace;font-size:9px;font-weight:400;letter-spacing:0.04em;}
      .card-ar-cta{font-family:'DM Mono',monospace;font-size:9px;color:rgba(184,150,46,0.5);letter-spacing:0.08em;text-transform:uppercase;
        transition:color 0.2s;}
      .card:hover .card-ar-cta{color:rgba(184,150,46,0.85);}

      /* empty state */
      .empty{padding:80px 28px;text-align:center;}
      .empty-sym{font-size:40px;opacity:0.1;margin-bottom:16px;font-family:'DM Mono',monospace;}
      .empty-txt{font-size:12px;color:rgba(255,255,255,0.2);letter-spacing:0.12em;text-transform:uppercase;}

      /* ═══════════════════════════════
         ITEM MODAL
      ═══════════════════════════════ */
      .overlay{
        position:fixed;inset:0;z-index:50;
        display:flex;align-items:flex-end;justify-content:center;
        background:rgba(0,0,0,0.82);
        backdrop-filter:blur(16px);-webkit-backdrop-filter:blur(16px);
        animation:fade-in 0.18s ease;
      }
      .sheet{
        position:relative;width:100%;max-width:540px;
        background:#0D0E12;
        border-radius:16px 16px 0 0;
        max-height:93vh;overflow-y:auto;
        animation:slide-up 0.35s cubic-bezier(0.16,1,0.3,1);
        border-top:1px solid rgba(255,255,255,0.07);
        border-left:1px solid rgba(255,255,255,0.04);
        border-right:1px solid rgba(255,255,255,0.04);
      }
      .sheet-handle{display:flex;justify-content:center;padding:14px 0 0;}
      .sheet-handle-bar{width:32px;height:3px;border-radius:2px;background:rgba(255,255,255,0.1);}
      .sheet-close{
        position:absolute;top:14px;right:16px;
        width:30px;height:30px;border-radius:50%;
        background:rgba(255,255,255,0.06);border:none;
        color:rgba(255,255,255,0.4);font-size:12px;cursor:pointer;
        display:flex;align-items:center;justify-content:center;
        transition:background 0.15s;font-family:sans-serif;
      }
      .sheet-close:hover{background:rgba(255,255,255,0.1);}

      .m-img{margin:12px 14px 0;border-radius:10px;overflow:hidden;aspect-ratio:16/9;position:relative;background:#0A0B0F;}
      .m-img img{width:100%;height:100%;object-fit:cover;display:block;filter:brightness(0.9) saturate(0.9);}

      .m-body{padding:24px 24px 40px;}
      .m-name{font-size:28px;font-weight:800;color:rgba(255,255,255,0.88);text-align:center;margin-bottom:16px;line-height:1.1;letter-spacing:-0.04em;}

      .m-tags{display:flex;justify-content:center;flex-wrap:wrap;gap:6px;margin-bottom:20px;}
      .m-tag{font-family:'DM Mono',monospace;font-size:10px;letter-spacing:0.08em;text-transform:uppercase;
        padding:5px 12px;border-radius:4px;border:1px solid;}
      .mt-cat{color:rgba(255,255,255,0.35);border-color:rgba(255,255,255,0.1);}
      .mt-veg{color:rgba(80,160,100,0.7);border-color:rgba(80,160,100,0.2);}
      .mt-nv{color:rgba(180,60,60,0.7);border-color:rgba(180,60,60,0.2);}
      .mt-pop{color:rgba(196,97,42,0.7);border-color:rgba(196,97,42,0.2);}

      .m-price-block{text-align:center;margin-bottom:20px;}
      .m-price-num{font-family:'DM Mono',monospace;font-size:48px;font-weight:300;color:rgba(255,255,255,0.75);letter-spacing:-0.04em;line-height:1;}
      .m-price-label{font-family:'DM Mono',monospace;font-size:10px;color:rgba(255,255,255,0.2);letter-spacing:0.1em;text-transform:uppercase;margin-top:4px;}
      .m-desc{font-size:13px;color:rgba(255,255,255,0.35);line-height:1.8;text-align:center;margin-bottom:24px;}

      .m-divider{height:1px;background:rgba(255,255,255,0.05);margin:20px 0;}
      .m-section-label{font-family:'DM Mono',monospace;font-size:10px;letter-spacing:0.12em;text-transform:uppercase;color:rgba(255,255,255,0.2);margin-bottom:12px;}

      .nutr{display:grid;grid-template-columns:repeat(4,1fr);gap:1px;background:rgba(255,255,255,0.04);margin-bottom:24px;border-radius:8px;overflow:hidden;}
      .nc{padding:14px 8px;text-align:center;background:#0D0E12;}
      .nc-v{font-family:'DM Mono',monospace;font-size:20px;font-weight:400;color:rgba(255,255,255,0.65);}
      .nc-u{font-family:'DM Mono',monospace;font-size:9px;color:rgba(255,255,255,0.2);margin-top:1px;letter-spacing:0.06em;}
      .nc-l{font-size:10px;color:rgba(255,255,255,0.25);margin-top:4px;text-transform:uppercase;letter-spacing:0.06em;}

      .ings{display:flex;flex-wrap:wrap;gap:5px;margin-bottom:24px;}
      .ing{font-family:'DM Mono',monospace;font-size:10px;letter-spacing:0.04em;
        color:rgba(255,255,255,0.3);padding:5px 11px;border:1px solid rgba(255,255,255,0.07);border-radius:4px;}

      /* AR button — Genesis minimal pill */
      .ar-btn{
        width:100%;padding:16px;border-radius:8px;border:1px solid rgba(255,255,255,0.12);
        background:rgba(255,255,255,0.04);
        color:rgba(255,255,255,0.75);
        font-family:'Bricolage Grotesque',sans-serif;font-weight:600;font-size:14px;
        cursor:pointer;display:flex;align-items:center;justify-content:center;gap:10px;
        letter-spacing:-0.01em;
        transition:background 0.2s,border-color 0.2s;
      }
      .ar-btn:hover{background:rgba(255,255,255,0.08);border-color:rgba(255,255,255,0.22);}
      .ar-hint{text-align:center;font-family:'DM Mono',monospace;font-size:10px;color:rgba(255,255,255,0.18);margin-top:8px;letter-spacing:0.06em;}

      /* ═══════════════════════════════
         FAB — Genesis style pill
      ═══════════════════════════════ */
      .fab-wrap{position:fixed;bottom:32px;left:0;right:0;display:flex;justify-content:center;z-index:45;pointer-events:none;}
      .sma-fab{
        pointer-events:all;
        display:flex;align-items:center;gap:10px;
        padding:14px 28px;border-radius:50px;
        border:1px solid rgba(255,255,255,0.12);
        background:rgba(13,14,18,0.9);
        backdrop-filter:blur(16px);
        color:rgba(255,255,255,0.75);
        font-family:'Bricolage Grotesque',sans-serif;
        font-weight:600;font-size:14px;
        cursor:pointer;letter-spacing:-0.01em;
        box-shadow:0 8px 32px rgba(0,0,0,0.6),0 0 0 1px rgba(255,255,255,0.04);
        transition:all 0.25s cubic-bezier(0.16,1,0.3,1);
        animation:fade-up 0.8s 0.8s cubic-bezier(0.16,1,0.3,1) both;
      }
      .sma-fab:hover{
        background:rgba(18,20,26,0.95);
        border-color:rgba(255,255,255,0.2);
        box-shadow:0 12px 40px rgba(0,0,0,0.7),0 0 0 1px rgba(255,255,255,0.08);
        transform:translateY(-2px);
        color:rgba(255,255,255,0.95);
      }
      .sma-fab:active{transform:scale(0.98);}
      .fab-dot{width:6px;height:6px;border-radius:50%;background:#B8962E;animation:blink 2s infinite;}

      /* ═══════════════════════════════
         SMART MENU ASSISTANT
      ═══════════════════════════════ */
      .sma-overlay{
        position:fixed;inset:0;z-index:55;
        display:flex;align-items:flex-end;justify-content:center;
        background:rgba(0,0,0,0.82);
        backdrop-filter:blur(16px);-webkit-backdrop-filter:blur(16px);
        animation:fade-in 0.18s ease;
      }
      .sma-sheet{
        position:relative;width:100%;max-width:540px;
        background:#0D0E12;
        border-radius:16px 16px 0 0;
        max-height:90vh;overflow-y:auto;
        animation:slide-up 0.35s cubic-bezier(0.16,1,0.3,1);
        border-top:1px solid rgba(255,255,255,0.07);
        font-family:'Bricolage Grotesque',sans-serif;
      }

      /* Progress */
      .sma-prog{padding:20px 24px 0;}
      .sma-prog-row{display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;}
      .sma-prog-num{font-family:'DM Mono',monospace;font-size:11px;color:rgba(255,255,255,0.25);letter-spacing:0.06em;}
      .sma-back{font-family:'DM Mono',monospace;font-size:11px;color:rgba(255,255,255,0.25);background:none;border:none;cursor:pointer;letter-spacing:0.04em;transition:color 0.15s;}
      .sma-back:hover{color:rgba(255,255,255,0.6);}
      .sma-bar{height:1px;background:rgba(255,255,255,0.07);}
      .sma-bar-fill{height:100%;background:#B8962E;transition:width 0.4s cubic-bezier(0.16,1,0.3,1);}

      /* Questions */
      .sma-qbody{padding:32px 24px 40px;}
      .sma-q{font-size:26px;font-weight:700;color:rgba(255,255,255,0.85);margin-bottom:32px;line-height:1.2;letter-spacing:-0.04em;}
      .sma-opts{display:flex;flex-direction:column;gap:8px;}
      .sma-opt{
        display:flex;align-items:center;justify-content:space-between;
        padding:15px 18px;border-radius:8px;
        border:1px solid rgba(255,255,255,0.07);
        background:rgba(255,255,255,0.02);
        cursor:pointer;transition:all 0.18s ease;
        text-align:left;width:100%;
        font-family:'Bricolage Grotesque',sans-serif;
      }
      .sma-opt:hover{background:rgba(255,255,255,0.05);border-color:rgba(255,255,255,0.14);transform:translateX(3px);}
      .sma-opt:active{transform:scale(0.99);}
      .sma-opt-label{font-size:15px;font-weight:500;color:rgba(255,255,255,0.75);letter-spacing:-0.02em;}
      .sma-opt-arrow{font-family:'DM Mono',monospace;font-size:12px;color:rgba(255,255,255,0.2);}
      .sma-dismiss{display:block;text-align:center;margin:20px auto 0;font-family:'DM Mono',monospace;font-size:10px;letter-spacing:0.1em;text-transform:uppercase;color:rgba(255,255,255,0.2);background:none;border:none;cursor:pointer;transition:color 0.15s;}
      .sma-dismiss:hover{color:rgba(255,255,255,0.5);}

      /* Mode picker */
      .sma-mode-body{padding:40px 24px 48px;}
      .sma-mode-title{font-size:30px;font-weight:800;color:rgba(255,255,255,0.85);margin-bottom:8px;letter-spacing:-0.04em;}
      .sma-mode-sub{font-size:13px;color:rgba(255,255,255,0.3);margin-bottom:32px;}
      .sma-mode-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:20px;}
      .sma-mode-card{
        padding:24px 18px;border-radius:10px;
        border:1px solid rgba(255,255,255,0.07);
        background:rgba(255,255,255,0.02);
        cursor:pointer;text-align:left;
        transition:all 0.2s ease;
        font-family:'Bricolage Grotesque',sans-serif;
      }
      .sma-mode-card:hover{background:rgba(255,255,255,0.05);border-color:rgba(255,255,255,0.14);transform:translateY(-3px);}
      .sma-mode-sym{font-family:'DM Mono',monospace;font-size:28px;color:rgba(255,255,255,0.3);margin-bottom:14px;}
      .sma-mode-name{font-size:17px;font-weight:700;color:rgba(255,255,255,0.8);margin-bottom:4px;letter-spacing:-0.03em;}
      .sma-mode-desc{font-size:11px;color:rgba(255,255,255,0.25);line-height:1.6;}

      /* Group size */
      .sma-sz-body{padding:40px 24px 48px;}
      .sma-sz-title{font-size:30px;font-weight:800;color:rgba(255,255,255,0.85);margin-bottom:8px;letter-spacing:-0.04em;}
      .sma-sz-sub{font-size:13px;color:rgba(255,255,255,0.3);margin-bottom:32px;}
      .sma-sz-grid{display:flex;gap:8px;flex-wrap:wrap;}
      .sma-sz-btn{
        flex:1;min-width:56px;padding:16px 10px;border-radius:8px;
        border:1px solid rgba(255,255,255,0.07);
        background:rgba(255,255,255,0.02);
        cursor:pointer;text-align:center;
        transition:all 0.18s ease;
        font-family:'Bricolage Grotesque',sans-serif;
      }
      .sma-sz-btn:hover{background:rgba(255,255,255,0.06);border-color:rgba(255,255,255,0.16);transform:translateY(-2px);}
      .sma-sz-num{font-family:'DM Mono',monospace;font-size:22px;font-weight:400;color:rgba(255,255,255,0.7);}
      .sma-sz-lbl{font-size:9px;color:rgba(255,255,255,0.2);letter-spacing:0.06em;text-transform:uppercase;margin-top:3px;}

      /* Results */
      .sma-res-body{padding:32px 24px 48px;}
      .sma-res-meta{font-family:'DM Mono',monospace;font-size:10px;color:rgba(255,255,255,0.2);letter-spacing:0.12em;text-transform:uppercase;margin-bottom:6px;}
      .sma-res-title{font-size:28px;font-weight:800;color:rgba(255,255,255,0.85);margin-bottom:24px;letter-spacing:-0.04em;}
      .sma-cat-label{font-family:'DM Mono',monospace;font-size:10px;letter-spacing:0.12em;text-transform:uppercase;color:rgba(255,255,255,0.2);margin:20px 0 8px;}
      .sma-item{
        display:flex;align-items:center;gap:12px;
        padding:12px 14px;border-radius:8px;margin-bottom:6px;
        border:1px solid rgba(255,255,255,0.06);
        background:rgba(255,255,255,0.02);
        cursor:pointer;transition:all 0.18s ease;
        text-align:left;width:100%;
        font-family:'Bricolage Grotesque',sans-serif;
      }
      .sma-item:hover{background:rgba(255,255,255,0.05);border-color:rgba(255,255,255,0.12);transform:translateX(3px);}
      .sma-item-img{width:46px;height:46px;border-radius:6px;object-fit:cover;flex-shrink:0;background:#0A0B0F;filter:brightness(0.85);}
      .sma-item-name{font-size:14px;font-weight:600;color:rgba(255,255,255,0.75);margin-bottom:4px;letter-spacing:-0.01em;}
      .sma-item-meta{display:flex;align-items:center;gap:8px;flex-wrap:wrap;}
      .sma-item-price{font-family:'DM Mono',monospace;font-size:13px;color:rgba(255,255,255,0.45);}
      .sma-chip{font-family:'DM Mono',monospace;font-size:8px;letter-spacing:0.08em;text-transform:uppercase;
        padding:2px 7px;border-radius:3px;border:1px solid;}
      .chip-pop{color:rgba(196,97,42,0.6);border-color:rgba(196,97,42,0.2);}
      .chip-ar{color:rgba(80,160,100,0.6);border-color:rgba(80,160,100,0.2);}
      .chip-sh{color:rgba(100,140,220,0.6);border-color:rgba(100,140,220,0.2);}
      .sma-arrow{font-family:'DM Mono',monospace;font-size:12px;color:rgba(255,255,255,0.15);flex-shrink:0;}
      .sma-no-match{padding:40px 20px;text-align:center;font-size:13px;color:rgba(255,255,255,0.25);}
      .sma-group-bar{
        display:flex;align-items:center;gap:10px;
        padding:12px 16px;border-radius:6px;margin-bottom:20px;
        border:1px solid rgba(80,160,100,0.15);
        background:rgba(80,160,100,0.04);
      }
      .sma-group-bar-txt{font-family:'DM Mono',monospace;font-size:10px;color:rgba(80,160,100,0.6);letter-spacing:0.06em;text-transform:uppercase;}

      /* Action buttons */
      .sma-actions{display:flex;gap:8px;margin-top:28px;}
      .btn-outline{flex:1;padding:13px;border-radius:7px;border:1px solid rgba(255,255,255,0.1);
        background:transparent;color:rgba(255,255,255,0.4);
        font-family:'Bricolage Grotesque',sans-serif;font-weight:600;font-size:13px;cursor:pointer;
        transition:all 0.15s;letter-spacing:-0.01em;}
      .btn-outline:hover{background:rgba(255,255,255,0.04);border-color:rgba(255,255,255,0.18);}
      .btn-fill{flex:1;padding:13px;border-radius:7px;border:1px solid rgba(255,255,255,0.14);
        background:rgba(255,255,255,0.07);color:rgba(255,255,255,0.8);
        font-family:'Bricolage Grotesque',sans-serif;font-weight:600;font-size:13px;cursor:pointer;
        transition:all 0.15s;letter-spacing:-0.01em;}
      .btn-fill:hover{background:rgba(255,255,255,0.11);}
    `}</style>

    {/* ═══════════════════════════════
        HERO
    ═══════════════════════════════ */}
    <section className="hero">
      <div className="hero-chips">
        {arCount>0&&(
          <div className="hero-chip">
            <span className="hero-chip-dot"/>
            <strong>{arCount}</strong> dishes in AR
          </div>
        )}
        <div className="hero-chip">
          <strong>{(menuItems||[]).length}</strong> items on menu
        </div>
        {offers?.[0]&&(
          <div className="hero-chip">
            <strong>{offers[0].title}</strong>
          </div>
        )}
      </div>
      <h1 className="hero-name" ref={heroNameRef}>{restaurant.name}</h1>
      <p className="hero-tagline">Tap any dish to explore · AR available on mobile</p>
      <div className="hero-rule"/>
    </section>

    {/* ═══════════════════════════════
        STICKY CATEGORY NAV
    ═══════════════════════════════ */}
    <nav className="nav">
      <div className="nav-inner">
        {cats.map(c=>(
          <button key={c} className={`cat-tab${activeCat===c?' on':''}`} onClick={()=>setActiveCat(c)}>
            {c}
          </button>
        ))}
      </div>
    </nav>

    {/* ═══════════════════════════════
        MAIN
    ═══════════════════════════════ */}
    <main className="main">

      {/* AR info bar */}
      {arCount>0&&(
        <div className="ar-bar">
          <div className="ar-bar-left">
            <div>
              <div className="ar-bar-num">{arCount}</div>
              <div className="ar-bar-label">Dishes in AR</div>
            </div>
          </div>
          <div className="ar-bar-cta">Point & View on Table</div>
        </div>
      )}

      {/* Section label */}
      <div className="section-label">
        {activeCat==='All'?'Full menu':activeCat} · {filtered.length} items
      </div>

      {/* Grid */}
      {filtered.length===0?(
        <div className="empty">
          <div className="empty-sym">◎</div>
          <div className="empty-txt">No items in this category</div>
        </div>
      ):(
        <div className="grid">
          {filtered.map((item,idx)=>(
            <MenuCard key={item.id} item={item} idx={idx} imgErr={imgErr} setImgErr={setImgErr} onOpen={openItem}/>
          ))}
        </div>
      )}
    </main>

    {/* FAB */}
    {!selectedItem&&!smaOpen&&(
      <div className="fab-wrap">
        <button className="sma-fab" onClick={openSMA}>
          <span className="fab-dot"/>
          Help me choose
        </button>
      </div>
    )}

    {/* ═══════════════════════════════
        ITEM MODAL
    ═══════════════════════════════ */}
    {selectedItem&&(
      <div className="overlay" onClick={e=>{if(e.target===e.currentTarget)closeItem();}}>
        <div className="sheet">
          <div className="sheet-handle"><div className="sheet-handle-bar"/></div>
          <button className="sheet-close" onClick={closeItem}>✕</button>
          {!showAR&&(
            <div className="m-img">
              <img src={imgSrc(selectedItem)} alt={selectedItem.name} onError={()=>setImgErr(e=>({...e,[selectedItem.id]:true}))}/>
              {selectedItem.offerBadge&&selectedItem.offerLabel&&(
                <div style={{position:'absolute',bottom:0,left:0,right:0,padding:'6px 12px',background:selectedItem.offerColor||'#C4612A',color:'rgba(255,255,255,0.9)',fontSize:10,fontWeight:600,textAlign:'center',letterSpacing:'0.06em',textTransform:'uppercase'}}>
                  {selectedItem.offerLabel}
                </div>
              )}
            </div>
          )}
          <div className="m-body">
            <h2 className="m-name">{selectedItem.name}</h2>
            <div className="m-tags">
              {selectedItem.category&&<span className="m-tag mt-cat">{selectedItem.category}</span>}
              {typeof selectedItem.isVeg==='boolean'&&<span className={selectedItem.isVeg?'m-tag mt-veg':'m-tag mt-nv'}>{selectedItem.isVeg?'Vegetarian':'Non-Veg'}</span>}
              {selectedItem.isPopular&&<span className="m-tag mt-pop">Popular</span>}
              {selectedItem.spiceLevel&&selectedItem.spiceLevel!=='None'&&<span className="m-tag" style={{color:SPICE_MAP[selectedItem.spiceLevel]?.color,borderColor:'currentColor',opacity:0.7}}>{selectedItem.spiceLevel}</span>}
            </div>
            {selectedItem.price&&(
              <div className="m-price-block">
                <div className="m-price-num">₹{selectedItem.price}</div>
                {selectedItem.prepTime&&<div className="m-price-label">{selectedItem.prepTime}</div>}
              </div>
            )}
            {selectedItem.description&&<p className="m-desc">{selectedItem.description}</p>}
            {(selectedItem.calories||selectedItem.protein||selectedItem.carbs||selectedItem.fats)&&(<>
              <div className="m-divider"/>
              <div className="m-section-label">Nutrition</div>
              <div className="nutr">
                {[{l:'Cal',v:selectedItem.calories,u:'kcal'},{l:'Protein',v:selectedItem.protein,u:'g'},{l:'Carbs',v:selectedItem.carbs,u:'g'},{l:'Fats',v:selectedItem.fats,u:'g'}].filter(n=>n.v).map(n=>(
                  <div key={n.l} className="nc"><div className="nc-v">{n.v}</div><div className="nc-u">{n.u}</div><div className="nc-l">{n.l}</div></div>
                ))}
              </div>
            </>)}
            {selectedItem.ingredients?.length>0&&(<>
              <div className="m-section-label">Ingredients</div>
              <div className="ings">{selectedItem.ingredients.map(i=><span key={i} className="ing">{i}</span>)}</div>
            </>)}
            {!showAR&&selectedItem.modelURL&&(<>
              <div className="m-divider"/>
              <button className="ar-btn" onClick={()=>{setShowAR(true);handleARLaunch();}}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg>
                View in Augmented Reality
              </button>
              <div className="ar-hint">No app · Works on Chrome &amp; Safari</div>
            </>)}
            {showAR&&<ARViewerEmbed modelURL={selectedItem.modelURL} itemName={selectedItem.name} onARLaunch={handleARLaunch}/>}
          </div>
        </div>
      </div>
    )}

    {/* ═══════════════════════════════
        SMART MENU ASSISTANT
    ═══════════════════════════════ */}
    {smaOpen&&(
      <div className="sma-overlay" onClick={e=>{if(e.target===e.currentTarget)closeSMA();}}>
        <div className="sma-sheet">
          <div className="sheet-handle"><div className="sheet-handle-bar"/></div>

          {/* Mode picker */}
          {!smaMode&&(
            <div className="sma-mode-body">
              <div className="sma-mode-title">Find your dish</div>
              <div className="sma-mode-sub">Answer a few questions — we'll match you perfectly</div>
              <div className="sma-mode-grid">
                <button className="sma-mode-card" onClick={()=>{setSmaMode('solo');setSmaStep(0);}}>
                  <div className="sma-mode-sym">◉</div>
                  <div className="sma-mode-name">Just me</div>
                  <div className="sma-mode-desc">Personalised picks for your taste</div>
                </button>
                <button className="sma-mode-card" onClick={()=>setSmaMode('group')}>
                  <div className="sma-mode-sym">◎◎</div>
                  <div className="sma-mode-name">Group</div>
                  <div className="sma-mode-desc">Dishes that work for everyone at the table</div>
                </button>
              </div>
              <button className="sma-dismiss" onClick={closeSMA}>Dismiss</button>
            </div>
          )}

          {/* Group size */}
          {smaMode==='group'&&!groupSize&&(
            <div className="sma-sz-body">
              <div className="sma-sz-title">How many people?</div>
              <div className="sma-sz-sub">We'll suggest the right portions and shareable dishes</div>
              <div className="sma-sz-grid">
                {GROUP_SIZES.map(({n})=>(
                  <button key={n} className="sma-sz-btn" onClick={()=>{setGroupSize(n);setSmaStep(0);}}>
                    <div className="sma-sz-num">{n}</div>
                    <div className="sma-sz-lbl">people</div>
                  </button>
                ))}
              </div>
              <button className="sma-dismiss" style={{marginTop:24}} onClick={()=>setSmaMode(null)}>← Back</button>
            </div>
          )}

          {/* Questions */}
          {smaMode&&(smaMode==='solo'||groupSize)&&smaStep<activeQs.length&&(<>
            <div className="sma-prog">
              <div className="sma-prog-row">
                <span className="sma-prog-num">
                  {smaMode==='group'&&<span style={{marginRight:10,color:'rgba(80,160,100,0.5)'}}>×{groupSize}</span>}
                  {String(smaStep+1).padStart(2,'0')} / {String(activeQs.length).padStart(2,'0')}
                </span>
                <button className="sma-back" onClick={()=>{
                  if(smaStep>0)setSmaStep(s=>s-1);
                  else if(smaMode==='group')setGroupSize(null);
                  else setSmaMode(null);
                }}>← back</button>
              </div>
              <div className="sma-bar"><div className="sma-bar-fill" style={{width:`${((smaStep+1)/activeQs.length)*100}%`}}/></div>
            </div>
            <div className="sma-qbody">
              <div className="sma-q">{activeQs[smaStep].q}</div>
              <div className="sma-opts">
                {activeQs[smaStep].opts.map(o=>(
                  <button key={o.v} className="sma-opt" onClick={()=>pickAnswer(activeQs[smaStep].id,o.v)}>
                    <span className="sma-opt-label">{o.l}</span>
                    <span className="sma-opt-arrow">→</span>
                  </button>
                ))}
              </div>
              <button className="sma-dismiss" onClick={closeSMA}>Dismiss</button>
            </div>
          </>)}

          {/* Results */}
          {smaMode&&(smaMode==='solo'||groupSize)&&smaStep===activeQs.length&&(()=>{
            const top=smaResults.slice(0,12);
            const cats={};
            top.forEach(({item})=>{const c=item.category||'Other';if(!cats[c])cats[c]=[];cats[c].push(item);});
            const isGroup=smaMode==='group';
            const bigGroup=groupSize==='6+'||(typeof groupSize==='number'&&groupSize>=4);
            return(
              <div className="sma-res-body">
                <div className="sma-res-meta">Results · {top.length} dishes matched</div>
                <div className="sma-res-title">{isGroup?`For your table of ${groupSize}`:'For you'}</div>
                {isGroup&&top.length>0&&(
                  <div className="sma-group-bar">
                    <span style={{fontFamily:'DM Mono',fontSize:12,color:'rgba(80,160,100,0.4)'}}>◎◎</span>
                    <div className="sma-group-bar-txt">{bigGroup?'Shareable dishes highlighted':'Individual portions suggested'}</div>
                  </div>
                )}
                {top.length===0?(
                  <div className="sma-no-match">
                    <p>No dishes matched these filters.</p>
                    <button className="btn-fill" style={{marginTop:16,width:'100%'}} onClick={restartSMA}>Try again</button>
                  </div>
                ):(<>
                  {Object.entries(cats).map(([cat,items])=>(
                    <div key={cat}>
                      <div className="sma-cat-label">{cat}</div>
                      {items.map(item=>{
                        const shareable=isGroup&&isShareable(item);
                        return(
                          <button key={item.id} className="sma-item" onClick={()=>{closeSMA();openItem(item);}}>
                            <img className="sma-item-img" src={imgSrc(item)} alt={item.name} onError={()=>setImgErr(e=>({...e,[item.id]:true}))}/>
                            <div style={{flex:1,minWidth:0}}>
                              <div className="sma-item-name">{item.name}</div>
                              <div className="sma-item-meta">
                                {item.price&&<span className="sma-item-price">₹{item.price}</span>}
                                {shareable&&<span className="sma-chip chip-sh">Shareable</span>}
                                {item.isPopular&&<span className="sma-chip chip-pop">Popular</span>}
                                {item.modelURL&&<span className="sma-chip chip-ar">AR</span>}
                              </div>
                            </div>
                            <span className="sma-arrow">→</span>
                          </button>
                        );
                      })}
                    </div>
                  ))}
                  <div className="sma-actions">
                    <button className="btn-outline" onClick={restartSMA}>Start over</button>
                    <button className="btn-fill" onClick={closeSMA}>Browse menu →</button>
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

export async function getServerSideProps({params}){
  try{
    const restaurant=await getRestaurantBySubdomain(params.subdomain);
    if(!restaurant)return{props:{restaurant:null,menuItems:[],offers:[],error:'Not found'}};
    const [menuItems,offers]=await Promise.all([getMenuItems(restaurant.id),getActiveOffers(restaurant.id)]);
    return{props:{restaurant:JSON.parse(JSON.stringify(restaurant)),menuItems:JSON.parse(JSON.stringify(menuItems)),offers:JSON.parse(JSON.stringify(offers)),error:null}};
  }catch(err){return{props:{restaurant:null,menuItems:[],offers:[],error:err.message}};}
}
