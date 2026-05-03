import Head from 'next/head';
import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/router';
import { getRestaurantBySubdomainAny, getMenuItems, getActiveOffers, getCombos, getAllRestaurants, trackVisit, incrementItemView, incrementARView, rateMenuItem, createWaiterCall, createOrder, updatePaymentStatus, cancelOrder, getTableSession, isSessionValid, isSessionValidWithSid, incrementCouponUse, submitFeedback, sortMenuItems, todayKey, getOrCreateOpenTableBill, getTableBill } from '../../../lib/db';
import { db } from '../../../lib/firebase';
import toast from 'react-hot-toast';
import { doc, collection, query, where, orderBy, onSnapshot } from 'firebase/firestore';
const ARViewerEmbed = dynamic(() => import('../../../components/ARViewer').then(m => m.ARViewerEmbed), { ssr: false });
import ConfirmModal from '../../../components/ConfirmModal';

function getSessionId() {
  if (typeof window === 'undefined') return 'ssr';
  let sid = localStorage.getItem('ar_sid');
  if (!sid) { sid = Math.random().toString(36).substr(2, 16); localStorage.setItem('ar_sid', sid); }
  return sid;
}

// Returning-customer recognition. Sets a per-restaurant localStorage flag on
// first visit; returns true on subsequent visits. No phone number required —
// just uses the browser's device identity. Safe on SSR (no window → false).
function isReturningVisitor(restaurantId) {
  if (typeof window === 'undefined' || !restaurantId) return false;
  const key = `ar_visited_${restaurantId}`;
  const was = !!localStorage.getItem(key);
  if (!was) {
    try { localStorage.setItem(key, Date.now().toString()); } catch {}
  }
  return was;
}

function getSavedPhone() {
  if (typeof window === 'undefined') return '';
  return localStorage.getItem('ar_phone') || '';
}

function savePhone(phone) {
  if (typeof window !== 'undefined' && phone) localStorage.setItem('ar_phone', phone);
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
  for (let i = 0; i < (id || '').length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return FOOD_PLACEHOLDERS[h % FOOD_PLACEHOLDERS.length];
}


/* ── Animated price counter (modal only) ── */
/* ── Animated price counter ── */
function PriceCounter({ price, className, style, animate = false }) {
  const [display, setDisplay] = useState(animate ? 0 : (Number(price) || 0));
  const rafRef = useRef(null);
  const target = Number(price) || 0;

  useEffect(() => {
    if (!animate) { setDisplay(target); return; }
    setDisplay(0);
    const duration = 700;
    const startTime = performance.now();
    const tick = (now) => {
      const p = Math.min((now - startTime) / duration, 1);
      const eased = 1 - Math.pow(1 - p, 4);
      setDisplay(Math.round(eased * target));
      if (p < 1) rafRef.current = requestAnimationFrame(tick);
    };
    cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [target, animate]);

  return <span className={className} style={style}>₹{display}</span>;
}

/* ── Card price: animates once when card enters viewport ── */
function CardPrice({ price, className }) {
  const [animate, setAnimate] = useState(false);
  const spanRef = useRef(null);

  useEffect(() => {
    const el = spanRef.current;
    if (!el || typeof IntersectionObserver === 'undefined') {
      // Fallback: just show price statically
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          setAnimate(true);
          observer.disconnect(); // fire ONCE only
        }
      },
      { threshold: 0.4 } // card must be 40% visible before counting
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <span ref={spanRef}>
      <PriceCounter price={price} className={className} animate={animate} />
    </span>
  );
}

/* ── Multi-language strings ── */
const TRANSLATIONS = {
  en: {
    sub: 'Tap any dish · See it in AR on your table',
    all: 'All',
    featured: '⭐ Featured',
    popular: '✦ Popular',
    soldOut: '🔴 Sold Out Today',
    viewAR: 'View in AR',
    viewARSub: 'Point at Your Table',
    arHint: 'No app needed · Works on Android Chrome & iOS Safari',
    perServing: 'per serving',
    nutrition: 'Nutrition',
    ingredients: 'Ingredients',
    needHelp: 'Call Waiter',
    helpChoose: 'Help Me Choose',
    arLive: 'AR Live',
    addToOrder: 'Add to Order',
    yourOrder: 'Your Order',
    placeOrder: 'Place Order →',
    confirmOrder: '✓ Confirm & Place Order',
    tableNumber: 'Table Number',
    tablePlaceholder: 'e.g. 4 or A2',
    specialInst: 'Special Instructions',
    specialPlaceholder: 'e.g. No onions, extra spicy...',
    orderPlaced: 'Order Placed!',
    orderSentMsg: "Your order has been sent to the kitchen. We'll bring it to your table shortly.",
    clear: 'Clear',
    confirmSummary: 'Order Summary',
    save: 'Save',
  },
  ta: {
    sub: 'எந்த உணவையும் தட்டவும் · AR-இல் உங்கள் மேஜையில் பாருங்கள்',
    all: 'அனைத்தும்',
    featured: '⭐ சிறப்பு',
    popular: '✦ பிரபலம்',
    soldOut: '🔴 இன்று தீர்ந்தது',
    viewAR: 'AR-இல் பார்க்கவும்',
    viewARSub: 'உங்கள் மேஜையை நோக்கி பிடிக்கவும்',
    arHint: 'ஆப் தேவையில்லை · Android Chrome & iOS Safari-இல் செயல்படும்',
    perServing: 'ஒரு பரிமாறலுக்கு',
    nutrition: 'ஊட்டச்சத்து',
    ingredients: 'பொருட்கள்',
    needHelp: 'வெயிட்டரை அழைக்கவும்',
    helpChoose: 'தேர்வு செய்ய உதவுங்கள்',
    arLive: 'AR நேரலை',
    addToOrder: 'ஆர்டரில் சேர்',
    yourOrder: 'உங்கள் ஆர்டர்',
    placeOrder: 'ஆர்டர் செய்யுங்கள் →',
    confirmOrder: '✓ ஆர்டரை உறுதிப்படுத்துங்கள்',
    tableNumber: 'மேஜை எண்',
    tablePlaceholder: 'எ.கா. 4 அல்லது A2',
    specialInst: 'சிறப்பு வழிமுறைகள்',
    specialPlaceholder: 'எ.கா. வெங்காயம் வேண்டாம், மிகவும் காரமாக...',
    orderPlaced: 'ஆர்டர் பெறப்பட்டது!',
    orderSentMsg: 'உங்கள் ஆர்டர் சமையலறைக்கு அனுப்பப்பட்டது. விரைவில் உங்கள் மேஜைக்கு கொண்டு வருவோம்.',
    clear: 'அழி',
    confirmSummary: 'ஆர்டர் சுருக்கம்',
    save: 'சேமி',
  },
  hi: {
    sub: 'कोई भी डिश टैप करें · AR में अपनी मेज पर देखें',
    all: 'सभी',
    featured: '⭐ विशेष',
    popular: '✦ लोकप्रिय',
    soldOut: '🔴 आज उपलब्ध नहीं',
    viewAR: 'AR में देखें',
    viewARSub: 'अपनी मेज की ओर इशारा करें',
    arHint: 'कोई ऐप नहीं · Android Chrome & iOS Safari पर काम करता है',
    perServing: 'प्रति सर्विंग',
    nutrition: 'पोषण',
    ingredients: 'सामग्री',
    needHelp: 'वेटर बुलाएं',
    helpChoose: 'चुनने में मदद करें',
    arLive: 'AR लाइव',
    addToOrder: 'ऑर्डर में जोड़ें',
    yourOrder: 'आपका ऑर्डर',
    placeOrder: 'ऑर्डर करें →',
    confirmOrder: '✓ ऑर्डर की पुष्टि करें',
    tableNumber: 'टेबल नंबर',
    tablePlaceholder: 'जैसे 4 या A2',
    specialInst: 'विशेष निर्देश',
    specialPlaceholder: 'जैसे प्याज नहीं, ज्यादा मसाला...',
    orderPlaced: 'ऑर्डर हो गया!',
    orderSentMsg: 'आपका ऑर्डर किचन को भेज दिया गया है। हम जल्द ही आपकी मेज पर लाएंगे।',
    clear: 'साफ करें',
    confirmSummary: 'ऑर्डर सारांश',
    save: 'सहेजें',
  },
};

const SPICE_MAP = {
  Mild: { label: 'Mild', color: '#D4820A', bg: '#FFF8EC', dot: '🟡' },
  Medium: { label: 'Medium', color: '#C45A18', bg: '#FFF2EB', dot: '🟠' },
  Spicy: { label: 'Spicy', color: '#B52020', bg: '#FFEAEA', dot: '🔴' },
  'Very Spicy': { label: 'Very Spicy', color: '#8B0000', bg: '#FFE0E0', dot: '🔴' },
};

function catIcon(name) {
  const n = (name || '').toLowerCase();
  if (n === 'all') return '◈';
  if (n.includes('starter') || n.includes('appetizer')) return '🥗';
  if (n.includes('main')) return '🍛';
  if (n.includes('burger')) return '🍔';
  if (n.includes('pizza')) return '🍕';
  if (n.includes('pasta') || n.includes('noodle')) return '🍝';
  if (n.includes('dessert') || n.includes('sweet')) return '🍰';
  if (n.includes('drink') || n.includes('beverage') || n.includes('juice')) return '🥤';
  if (n.includes('coffee') || n.includes('tea')) return '☕';
  if (n.includes('breakfast')) return '🥞';
  if (n.includes('seafood') || n.includes('fish')) return '🐟';
  if (n.includes('chicken')) return '🍗';
  if (n.includes('rice') || n.includes('biryani')) return '🍚';
  if (n.includes('salad')) return '🥙';
  if (n.includes('soup')) return '🍲';
  if (n.includes('snack')) return '🍿';
  if (n.includes('special') || n.includes('chef')) return '⭐';
  return '🍽️';
}

// ── Smart Menu Assistant ─────────────────────────────────────────

// SOLO questions
const SOLO_QUESTIONS = [
  {
    id: 'diet', emoji: '🌿', q: 'Any dietary preference?', sub: 'We\'ll only show dishes that match',
    opts: [{ l: 'Vegetarian', v: 'veg', e: '🌿' }, { l: 'Non-Vegetarian', v: 'nonveg', e: '🍗' }, { l: 'No Preference', v: 'any', e: '✌️' }]
  },
  {
    id: 'mood', emoji: '✨', q: 'What\'s your mood today?', sub: 'Pick what sounds good right now',
    opts: [{ l: 'Comfort Food', v: 'comfort', e: '🍲' }, { l: 'Something Healthy', v: 'healthy', e: '🥦' }, { l: 'Most Popular', v: 'popular', e: '🔥' }, { l: 'Try Something New', v: 'new', e: '🌟' }]
  },
  {
    id: 'spice', emoji: '🌶️', q: 'How spicy do you like it?', sub: 'We\'ll match your spice tolerance',
    opts: [{ l: 'Mild / No Spice', v: 'mild', e: '😌' }, { l: 'Medium', v: 'medium', e: '😄' }, { l: 'Spicy', v: 'spicy', e: '🥵' }, { l: 'Any Level', v: 'any', e: '🤷' }]
  },
  {
    id: 'size', emoji: '🍽️', q: 'How hungry are you?', sub: 'Choose your meal size',
    opts: [{ l: 'Light Bite', v: 'light', e: '🥗' }, { l: 'Regular Meal', v: 'regular', e: '🍛' }, { l: 'Feast Mode', v: 'heavy', e: '🤤' }, { l: 'Anything', v: 'any', e: '👌' }]
  },
  {
    id: 'budget', emoji: '💰', q: 'Budget per dish?', sub: 'Pick a price range',
    opts: [{ l: 'Under ₹200', v: 'budget', e: '💵' }, { l: '₹200–₹500', v: 'mid', e: '💳' }, { l: '₹500+', v: 'premium', e: '💎' }, { l: 'No Limit', v: 'any', e: '🤑' }]
  },
];

// GROUP questions — reframed for the whole table
const GROUP_QUESTIONS = [
  {
    id: 'diet', emoji: '🌿', q: 'Anyone at the table vegetarian?', sub: 'We\'ll make sure no one is left out',
    opts: [{ l: 'Yes — keep it veg friendly', v: 'veg', e: '🌿' }, { l: 'No, we eat everything', v: 'any', e: '🍗' }, { l: 'Mix — include both options', v: 'mixed', e: '✌️' }]
  },
  {
    id: 'spice', emoji: '🌶️', q: 'What\'s the group\'s spice limit?', sub: 'Pick the lowest tolerance in the group',
    opts: [{ l: 'Keep it mild for everyone', v: 'mild', e: '😌' }, { l: 'Medium is fine', v: 'medium', e: '😄' }, { l: 'We all love it spicy', v: 'spicy', e: '🥵' }, { l: 'No limit', v: 'any', e: '🤷' }]
  },
  {
    id: 'style', emoji: '🤝', q: 'How is the group ordering?', sub: 'Helps us suggest the right portions',
    opts: [{ l: 'Everyone orders their own', v: 'individual', e: '🍽️' }, { l: 'Sharing dishes together', v: 'sharing', e: '🤲' }, { l: 'Mix of both', v: 'mix', e: '🔄' }]
  },
  {
    id: 'mood', emoji: '✨', q: 'What\'s the vibe today?', sub: 'Pick the general mood of the group',
    opts: [{ l: 'Comfort & classics', v: 'comfort', e: '🍲' }, { l: 'Light & healthy', v: 'healthy', e: '🥦' }, { l: 'Go with what\'s popular', v: 'popular', e: '🔥' }, { l: 'Explore something new', v: 'new', e: '🌟' }]
  },
  {
    id: 'budget', emoji: '💰', q: 'Budget per person?', sub: 'Per head, not total',
    opts: [{ l: 'Under ₹200 per head', v: 'budget', e: '💵' }, { l: '₹200–₹500 per head', v: 'mid', e: '💳' }, { l: '₹500+ per head', v: 'premium', e: '💎' }, { l: 'No limit', v: 'any', e: '🤑' }]
  },
];

const GROUP_SIZES = [
  { n: 2, e: '👫' }, { n: 3, e: '👨‍👩‍👦' }, { n: 4, e: '👨‍👩‍👧‍👦' }, { n: 5, e: '🧑‍🤝‍🧑' }, { n: '6+', e: '🎉' },
];

const LIGHT_CATS = ['starter', 'salad', 'soup', 'snack', 'drink', 'beverage', 'dessert'];
const HEAVY_CATS = ['main', 'burger', 'pasta', 'pizza', 'biryani', 'thali', 'grill', 'rice'];
const SHARING_KW = ['platter', 'sharing', 'family', 'large', 'combo', 'bucket', 'plate', 'thali', 'spread', 'feast'];
const HEALTHY_KW = ['salad', 'grilled', 'steamed', 'healthy', 'light', 'vegan', 'fresh', 'oat', 'quinoa', 'fruit'];
const COMFORT_KW = ['butter', 'cheese', 'cream', 'fried', 'crispy', 'masala', 'curry', 'rich', 'loaded', 'classic', 'special'];

function isShareable(item) {
  const txt = `${item.name || ''} ${item.description || ''} ${item.category || ''}`.toLowerCase();
  return SHARING_KW.some(k => txt.includes(k));
}

function scoreItem(item, ans, groupSize = 1) {
  let s = 0;
  const txt = `${item.name || ''} ${item.description || ''} ${item.category || ''}`.toLowerCase();
  const cat = (item.category || '').toLowerCase();
  const sp = item.spiceLevel || 'None';
  const pr = item.price ? Number(item.price) : null;
  const big = typeof groupSize === 'number' ? groupSize >= 4 : true; // 6+ counts as big

  // ── diet ──
  if (ans.diet === 'veg' && item.isVeg === false) return -999;
  if (ans.diet === 'veg' && item.isVeg === true) s += 20;
  if (ans.diet === 'mixed') { /* allow both, slight boost to veg items for inclusivity */ if (item.isVeg === true) s += 8; }
  if (ans.diet === 'nonveg' && item.isVeg === true) s -= 10;

  // ── spice ──
  if (ans.spice === 'mild' && ['Spicy', 'Very Spicy'].includes(sp)) return -999;
  if (ans.spice === 'mild' && ['None', 'Mild'].includes(sp)) s += 15;
  if (ans.spice === 'medium' && sp === 'Medium') s += 20;
  if (ans.spice === 'spicy' && ['Spicy', 'Very Spicy'].includes(sp)) s += 25;

  // ── budget ──
  if (pr !== null) {
    if (ans.budget === 'budget' && pr < 200) s += 20; else if (ans.budget === 'budget') s -= 15;
    if (ans.budget === 'mid' && pr >= 200 && pr <= 500) s += 20; else if (ans.budget === 'mid') s -= 8;
    if (ans.budget === 'premium' && pr > 500) s += 20; else if (ans.budget === 'premium' && pr < 200) s -= 10;
  }

  // ── size / style ──
  if (ans.size === 'light') { if (LIGHT_CATS.some(l => cat.includes(l))) s += 18; if (HEAVY_CATS.some(h => cat.includes(h))) s -= 15; }
  if (ans.size === 'heavy') { if (HEAVY_CATS.some(h => cat.includes(h))) s += 18; }

  // Group style: sharing dishes get a boost for groups that want to share or for large groups
  if (ans.style === 'sharing' && isShareable(item)) s += 25;
  if (ans.style === 'sharing' && HEAVY_CATS.some(h => cat.includes(h))) s += 10;
  if (big && isShareable(item)) s += 15; // large groups always benefit from shareable dishes

  // ── mood ──
  if (ans.mood === 'popular') { if (item.isPopular || item.isFeatured) s += 30; }
  if (ans.mood === 'healthy') { if (HEALTHY_KW.some(k => txt.includes(k))) s += 20; if (item.calories && item.calories < 400) s += 10; }
  if (ans.mood === 'comfort') { if (COMFORT_KW.some(k => txt.includes(k))) s += 20; }
  if (ans.mood === 'new') { if (item.isFeatured) s += 25; s += Math.floor(Math.random() * 12); }

  s += Math.min((item.views || 0) + (item.arViews || 0) * 2, 20) * 0.3;
  return s;
}

function filterItems(items, ans, groupSize = 1) {
  return items
    .map(i => ({ item: i, score: scoreItem(i, ans, groupSize) }))
    .filter(({ score }) => score > -999)
    .sort((a, b) => b.score - a.score);
}


/* ─── SheetOverlay — swipe-to-dismiss bottom sheet wrapper (like SwipeableSheet) ─── */
function SheetOverlay({ onClose, children, zIndex = 60, darkMode }) {
  const overlayRef = useRef(null);
  const sheetRef = useRef(null);
  const startYRef = useRef(0);
  const currentYRef = useRef(0);
  const isDragging = useRef(false);
  const startTime = useRef(0);
  const [dragY, setDragY] = useState(0);

  const DISMISS_THRESHOLD = 120;
  const VELOCITY_THRESHOLD = 0.45;

  const onTouchStart = (e) => {
    const sheet = sheetRef.current;
    if (!sheet) return;
    const touch = e.touches[0];
    const rect = sheet.getBoundingClientRect();
    // Only start drag if touch is within top 60px (handle zone)
    if (touch.clientY - rect.top > 60) return;
    isDragging.current = true;
    startYRef.current = touch.clientY;
    startTime.current = Date.now();
    currentYRef.current = 0;
  };

  const onTouchEnd = () => {
    if (!isDragging.current) return;
    isDragging.current = false;
    const delta = currentYRef.current;
    const elapsed = Math.max(1, Date.now() - startTime.current);
    const velocity = delta / elapsed;
    if (delta > DISMISS_THRESHOLD || velocity > VELOCITY_THRESHOLD) {
      onClose();
    } else {
      setDragY(0);
    }
    currentYRef.current = 0;
  };

  // Non-passive touchmove to enable preventDefault during drag
  useEffect(() => {
    const sheet = sheetRef.current;
    if (!sheet) return;
    const handleTouchMove = (e) => {
      if (!isDragging.current) return;
      e.preventDefault();
      const delta = e.touches[0].clientY - startYRef.current;
      if (delta <= 0) { setDragY(0); return; }
      currentYRef.current = delta;
      setDragY(delta);
    };
    sheet.addEventListener('touchmove', handleTouchMove, { passive: false });
    return () => sheet.removeEventListener('touchmove', handleTouchMove);
  }, []);

  // Block touchmove on the overlay backdrop itself
  useEffect(() => {
    const el = overlayRef.current;
    if (!el) return;
    const handler = (e) => { if (e.target === el) e.preventDefault(); };
    el.addEventListener('touchmove', handler, { passive: false });
    return () => el.removeEventListener('touchmove', handler);
  }, []);

  const progress = Math.min(dragY / 300, 1);
  const bgAlpha = 0.45 * (1 - progress);

  return (
    <div ref={overlayRef}
      style={{ position: 'fixed', inset: 0, zIndex, display: 'flex', alignItems: 'flex-end', justifyContent: 'center', background: `rgba(0,0,0,${bgAlpha.toFixed(2)})`, backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)', animation: 'fadeIn 0.18s ease' }}
      onClick={e => { if (e.target === e.currentTarget && onClose) onClose(); }}>
      <div ref={sheetRef}
        style={{ width: '100%', transform: `translateY(${dragY}px)`, transition: isDragging.current ? 'none' : 'transform 0.32s cubic-bezier(0.32,0.72,0,1)', willChange: 'transform', display: 'flex', justifyContent: 'center' }}
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
        onTouchCancel={onTouchEnd}>
        {children}
      </div>
    </div>
  );
}

/* ─── SwipeableSheet — iOS-style drag-to-dismiss bottom sheet ─── */
function SwipeableSheet({ onClose, children, darkMode }) {
  const sheetRef = useRef(null);
  const startYRef = useRef(0);
  const currentYRef = useRef(0);
  const isDragging = useRef(false);
  const startTime = useRef(0);
  const [dragY, setDragY] = useState(0);

  const DISMISS_THRESHOLD = 120; // px down to dismiss
  const VELOCITY_THRESHOLD = 0.45; // px/ms fast flick

  const onTouchStart = (e) => {
    const sheet = sheetRef.current;
    if (!sheet) return;
    const touch = e.touches[0];
    const rect = sheet.getBoundingClientRect();
    // Only start drag if touch is within top 60px (handle zone)
    if (touch.clientY - rect.top > 60) return;
    isDragging.current = true;
    startYRef.current = touch.clientY;
    startTime.current = Date.now();
    currentYRef.current = 0;
  };

  const onTouchEnd = () => {
    if (!isDragging.current) return;
    isDragging.current = false;
    const delta = currentYRef.current;
    const elapsed = Math.max(1, Date.now() - startTime.current);
    const velocity = delta / elapsed;
    if (delta > DISMISS_THRESHOLD || velocity > VELOCITY_THRESHOLD) {
      onClose();
    } else {
      setDragY(0); // snap back to position
    }
    currentYRef.current = 0;
  };

  // Use a non-passive native listener so we can call preventDefault()
  // This prevents the background page from scrolling while dragging to dismiss
  useEffect(() => {
    const sheet = sheetRef.current;
    if (!sheet) return;
    const handleTouchMove = (e) => {
      if (!isDragging.current) return;
      e.preventDefault(); // block background scroll during drag
      const delta = e.touches[0].clientY - startYRef.current;
      if (delta <= 0) { setDragY(0); return; }
      currentYRef.current = delta;
      setDragY(delta);
    };
    sheet.addEventListener('touchmove', handleTouchMove, { passive: false });
    return () => sheet.removeEventListener('touchmove', handleTouchMove);
  }, []);

  const progress = Math.min(dragY / 300, 1);
  const bgAlpha = darkMode ? 0.85 * (1 - progress) : 0.5 * (1 - progress);

  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex', alignItems: 'flex-end', justifyContent: 'center', background: `rgba(0,0,0,${bgAlpha.toFixed(2)})`, backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)', animation: 'fadeIn 0.18s ease' }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        ref={sheetRef}
        style={{
          width: '100%', maxWidth: 540,
          transform: `translateY(${dragY}px)`,
          transition: isDragging.current ? 'none' : 'transform 0.32s cubic-bezier(0.32,0.72,0,1)',
          willChange: 'transform',
        }}
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
        onTouchCancel={onTouchEnd}
      >
        {children}
      </div>
    </div>
  );
}

export default function RestaurantMenu({ restaurant: initialRestaurant, menuItems: initialItems, offers: initialOffers, combos: initialCombos, error }) {
  // ── Live data state — seeded from ISR cache, updated in real-time via onSnapshot ──
  const [liveRestaurant, setLiveRestaurant] = useState(initialRestaurant);
  const restaurant = liveRestaurant || initialRestaurant;
  const [menuItems, setMenuItems] = useState(initialItems || []);
  const [offers, setOffers] = useState(initialOffers || []);
  const [combos, setCombos] = useState(initialCombos || []);
  const [restaurantGone, setRestaurantGone] = useState(initialRestaurant?.isActive === false);
  const [activeCat, setActiveCat] = useState('All');
  const [selectedItem, setSelectedItem] = useState(null);
  // Modifier selection for the currently-open item modal. Resets whenever
  // selectedItem changes. { variant: {name, priceDelta} | null, addOns: [...] }
  const [modifierChoice, setModifierChoice] = useState({ variant: null, addOns: [] });
  const [selectedCombo, setSelectedCombo] = useState(null);
  const [showAR, setShowAR] = useState(false);
  const [imgErr, setImgErr] = useState({});
  const [imgLoaded, setImgLoaded] = useState({});
  const [smaOpen, setSmaOpen] = useState(false);
  const [smaMode, setSmaMode] = useState(null);    // null | 'solo' | 'group'
  const [groupSize, setGroupSize] = useState(null);    // 2|3|4|5|'6+'
  const [smaStep, setSmaStep] = useState(0);
  const [smaAnswers, setSmaAnswers] = useState({});
  const [smaResults, setSmaResults] = useState([]);
  // Ratings
  const [userRatings, setUserRatings] = useState({});  // { itemId: 1-5 }
  const [ratingPending, setRatingPending] = useState(null);
  // Waiter call
  const [waiterModal, setWaiterModal] = useState(false);
  const [waiterReason, setWaiterReason] = useState(null);
  const [waiterTable, setWaiterTable] = useState('');
  const [waiterSent, setWaiterSent] = useState(false);
  const [waiterSending, setWaiterSending] = useState(false);
  // Derived from Firestore via restaurant prop — admin can toggle in Notifications page
  const waiterCallsEnabled = restaurant?.waiterCallsEnabled !== false;
  // Pairs Well With (manual, set by admin per item)
  // Cart (order tracker)
  const [cart, setCart] = useState(() => {
    if (typeof window === 'undefined') return [];
    try { const s = sessionStorage.getItem('ar_cart'); return s ? JSON.parse(s) : []; } catch { return []; }
  });
  const [cartOpen, setCartOpen] = useState(false);
  // Order flow
  // 'cart' → 'form' → place order → either 'success' (dine-in: order
  // is in the kitchen immediately, customer pays after eating) OR
  // 'payment' (takeaway, Phase F redesign: customer pays at this step,
  // kitchen only sees the order once the payment clears, then we
  // auto-advance to 'success').
  const [orderStep, setOrderStep] = useState('cart'); // 'cart' | 'form' | 'payment' | 'success'
  const [orderTableInput, setOrderTableInput] = useState(''); // what customer types in the form
  const [orderPhone, setOrderPhone] = useState(() => getSavedPhone());
  const [specialNote, setSpecialNote] = useState('');
  // Order type — dine-in (at a table) or takeaway (pickup). Default dine-in
  // because most customers here scan a QR at a table. If they reach the
  // menu without a QR they can toggle to takeaway and skip the table field.
  const [customerOrderType, setCustomerOrderType] = useState('dinein');
  const [customerName, setCustomerName] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [placedOrder, setPlacedOrder] = useState(() => {
    if (typeof window === 'undefined') return null;
    try { const s = sessionStorage.getItem('ar_placed_order'); return s ? JSON.parse(s) : null; } catch { return null; }
  });
  const [paymentDone, setPaymentDone] = useState(() => {
    if (typeof window === 'undefined') return false;
    try { return !!sessionStorage.getItem('ar_payment_done'); } catch { return false; }
  });
  const [paymentMethod, setPaymentMethod] = useState(() => {
    if (typeof window === 'undefined') return null;
    try { const s = sessionStorage.getItem('ar_payment_done'); return s ? JSON.parse(s).method : null; } catch { return null; }
  });
  const [billOpen, setBillOpen] = useState(false);
  const [upiOpened, setUpiOpened] = useState(false);
  // ── Phase A — Running bill (dine-in tab) ─────────────────────────────
  // currentBillId points at the active tab for this table. Set when an
  // order is placed at a table; restored from sessionStorage on reload
  // and from `tableSessions/{n}.currentBillId` after a fresh QR scan.
  // billOrders holds every order attached to that bill — bill modal
  // renders the aggregate (items + totals) across them.
  const [currentBillId, setCurrentBillId] = useState(() => {
    if (typeof window === 'undefined') return null;
    try { return sessionStorage.getItem('ar_bill_id') || null; } catch { return null; }
  });
  const [billOrders, setBillOrders] = useState([]);
  // Place-order idempotency guard. setIsSubmitting + the button's disabled
  // attribute has a small race window where a fast double-tap can squeeze
  // both onClick fires through before React re-renders. A render-error
  // mid-placeOrder also leaves isSubmitting stuck and the cart can re-fire
  // on retry. This ref blocks at the JS engine level — second call to
  // placeOrder while one is in flight returns immediately. Cleared in the
  // finally block so retry-after-error still works.
  const placeOrderInFlightRef = useRef(false);
  // Cart item notes
  const [noteOpen, setNoteOpen] = useState({});
  // Coupon
  const [couponCode, setCouponCode] = useState('');
  const [appliedCoupon, setAppliedCoupon] = useState(null);
  const [couponDiscount, setCouponDiscount] = useState(0);
  const [couponError, setCouponError] = useState('');
  const [couponLoading, setCouponLoading] = useState(false);
  // Live order status
  const [liveOrderStatus, setLiveOrderStatus] = useState(null);
  // Customer feedback
  const [feedbackRating, setFeedbackRating] = useState(0);
  const [feedbackComment, setFeedbackComment] = useState('');
  const [feedbackSent, setFeedbackSent] = useState(false);
  const [feedbackSending, setFeedbackSending] = useState(false);
  // Table session validation
  const router = useRouter();
  const [sessionChecked, setSessionChecked] = useState(false);
  const [sessionBlocked, setSessionBlocked] = useState(false);
  const tableNumber = router.query?.table || null; // from QR URL param e.g. ?table=4
  const urlSid      = router.query?.sid   || null;  // unguessable session ID in QR URL

  // Confirmation modal state — replaces the browser's native confirm()
  // dialogs (cancel order, etc.) with a styled card. Pass the entire
  // config object as state so a single modal definition serves every
  // confirm point on the page.
  const [confirmDialog, setConfirmDialog] = useState(null);

  // Phase L — PWA install prompt state.
  // Browser fires `beforeinstallprompt` only after its own engagement
  // heuristics decide the page is install-worthy (visited multiple
  // times / used some interactive elements). We capture the event,
  // surface a small "Save to home screen" banner, and call .prompt()
  // when the customer taps it. `installDeferred` holds the captured
  // event because the prompt() call must happen inside a user gesture
  // — we can't fire it from the listener itself. `installPrompted`
  // hides the banner once the diner has either accepted, dismissed,
  // or explicitly closed it for this session.
  const [installDeferred, setInstallDeferred] = useState(null);
  const [installDismissed, setInstallDismissed] = useState(false);

  // ── Table-session enforcement ─────────────────────────────────────────
  // The customer's QR URL has the form `?table=N&sid=...`. We must reject:
  //   1. A guessed table number (no sid)               → no urlSid
  //   2. A stale sid (admin rotated it)                → snapshot doesn't match
  //   3. A session that's been deactivated by admin    → isActive=false
  //   4. A session whose expiresAt clock has passed    → wall-clock expiry
  //
  // Bug fix (2026-04-30): the previous implementation did a single
  // `getDoc` once on mount. Once the user passed validation, the page
  // kept working forever — even after the admin rotated the sid or the
  // expiresAt timestamp passed. The customer could keep ordering past
  // expiry just by leaving the tab open.
  //
  // The fix has three pieces:
  //   a) `onSnapshot` listener on the tableSession doc — any admin
  //      action (rotate sid / deactivate / advance expiresAt) instantly
  //      flips us to blocked.
  //   b) 30-second interval re-validates against current Date — handles
  //      the passive expiry case where Firestore won't fire a snapshot
  //      because nothing on the doc actually changed, only the wall
  //      clock.
  //   c) Window 'focus' + 'visibilitychange' re-validate immediately
  //      when a backgrounded tab comes back — covers the case where
  //      both the listener and the interval haven't fired yet because
  //      the tab was suspended.
  //
  // Default-deny on error: if Firestore is unreachable AND there's a
  // tableNumber+sid in the URL, we now BLOCK (the previous code allowed
  // access "gracefully", which let attackers bypass with a forced
  // network error). For the no-table marketing URL we still allow
  // through so the restaurant's public menu page works offline.
  useEffect(() => {
    if (!restaurant?.id) return;
    if (!tableNumber) { setSessionChecked(true); return; } // no table param = public menu

    setOrderTableInput(tableNumber);
    setWaiterTable(tableNumber);

    let latestSession = null;

    const validateNow = () => {
      const valid = urlSid ? isSessionValidWithSid(latestSession, urlSid) : false;
      setSessionBlocked(!valid);
      setSessionChecked(true);
    };

    const sessionRef = doc(db, 'restaurants', restaurant.id, 'tableSessions', String(tableNumber));
    const unsub = onSnapshot(
      sessionRef,
      (snap) => {
        latestSession = snap.exists() ? snap.data() : null;
        validateNow();
      },
      // On listener error (rules block, network gone) treat as blocked —
      // safer than letting a malformed token through. Public menu (no
      // table) returned earlier so this only blocks QR-scoped pages.
      () => { latestSession = null; validateNow(); }
    );

    // Tick every 30s so passive clock-based expiry boots the customer.
    const interval = setInterval(validateNow, 30_000);
    const onFocusOrVisible = () => { if (!document.hidden) validateNow(); };
    document.addEventListener('visibilitychange', onFocusOrVisible);
    window.addEventListener('focus', onFocusOrVisible);

    return () => {
      unsub();
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onFocusOrVisible);
      window.removeEventListener('focus', onFocusOrVisible);
    };
  }, [restaurant?.id, tableNumber, urlSid]);

  // Phase L — listen for the browser's beforeinstallprompt + appinstalled.
  // Both events are no-ops when the page isn't installable (HTTP, missing
  // manifest, no SW) so this useEffect is safe on every render path.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    // Skip the banner forever if the diner already dismissed it OR the
    // PWA is already installed (running in standalone display mode).
    try {
      if (localStorage.getItem('ar_install_dismissed') === '1') {
        setInstallDismissed(true);
      }
    } catch {}
    if (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) {
      setInstallDismissed(true);  // already installed; don't re-prompt
    }
    const onBeforeInstall = (e) => {
      e.preventDefault();           // suppress the default mini-infobar
      setInstallDeferred(e);
    };
    const onInstalled = () => {
      setInstallDeferred(null);
      try { localStorage.setItem('ar_install_dismissed', '1'); } catch {}
    };
    window.addEventListener('beforeinstallprompt', onBeforeInstall);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstall);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  const triggerInstall = useCallback(async () => {
    if (!installDeferred) return;
    try {
      await installDeferred.prompt();
      // Whatever the diner picks (accept / dismiss), we don't re-prompt
      // this session. The browser also won't refire beforeinstallprompt
      // unless they completely uninstall + revisit later.
      setInstallDeferred(null);
      setInstallDismissed(true);
      try { localStorage.setItem('ar_install_dismissed', '1'); } catch {}
    } catch (err) {
      console.error('install prompt failed:', err);
    }
  }, [installDeferred]);

  const dismissInstall = useCallback(() => {
    setInstallDismissed(true);
    setInstallDeferred(null);
    try { localStorage.setItem('ar_install_dismissed', '1'); } catch {}
  }, []);

  // Dark mode
  const [darkMode, setDarkMode] = useState(() => {
    if (typeof window === 'undefined') return true;
    const stored = localStorage.getItem('ar_theme');
    return stored !== 'light'; // dark by default
  });

  // ── Language ──────────────────────────────────────────────────────────────
  const [lang, setLang] = useState(() => {
    if (typeof window === 'undefined') return 'en';
    return localStorage.getItem('ar_lang') || 'en';
  });
  const setLanguage = (l) => { setLang(l); if (typeof window !== 'undefined') localStorage.setItem('ar_lang', l); };
  const t = TRANSLATIONS[lang] || TRANSLATIONS.en;
  // Item name/description helpers — fall back to English if translation missing
  const iN = (item) => (lang === 'ta' && item?.nameTA) || (lang === 'hi' && item?.nameHI) || item?.name || '';
  const iD = (item) => (lang === 'ta' && item?.descriptionTA) || (lang === 'hi' && item?.descriptionHI) || item?.description || '';

  useEffect(() => {
    if (!restaurant?.id) return;
    trackVisit(restaurant.id, getSessionId()).catch(() => { });
    // Set returning flag ON MOUNT (don't re-run on restaurant state updates
    // — the localStorage write happens once per device per restaurant).
    const returning = isReturningVisitor(restaurant.id);
    if (returning) {
      try { sessionStorage.setItem('ar_was_returning', '1'); } catch {}
    }
  }, [restaurant?.id]);

  // Reset modifier selection whenever a new item modal opens. Prevents the
  // previous item's variant/addOns from leaking into the next picker.
  useEffect(() => {
    setModifierChoice({ variant: null, addOns: [] });
  }, [selectedItem?.id]);

  // ── Real-time Firestore listeners — INSTANT updates from admin ──
  useEffect(() => {
    if (!restaurant?.id) return;
    const unsubs = [];

    // 1) Restaurant doc — detect isActive toggle, name/settings changes
    const restRef = doc(db, 'restaurants', restaurant.id);
    unsubs.push(onSnapshot(restRef, (snap) => {
      if (!snap.exists()) { setRestaurantGone(true); return; }
      const data = { id: snap.id, ...snap.data() };
      setLiveRestaurant(data);
      if (data.isActive === false) setRestaurantGone(true);
      else setRestaurantGone(false);
    }, () => { /* ignore errors, keep ISR data */ }));

    // 2) Menu items — real-time subcollection listener
    const itemsQ = query(
      collection(db, 'restaurants', restaurant.id, 'menuItems'),
      where('isActive', '==', true)
    );
    unsubs.push(onSnapshot(itemsQ, (snap) => {
      const items = sortMenuItems(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      setMenuItems(items);
    }, () => { /* ignore errors */ }));

    // 3) Offers — real-time. Subscribes to ALL offers; the active/expired
    // filter happens client-side via the activeOffers useMemo below using
    // startDate / endDate. Earlier this query had a `where('isActive','==',true)`
    // filter, but offer docs don't carry an isActive field (status is
    // computed from dates — see /admin/promotions offerStatus()), so the
    // filter silently returned zero rows and offers never reached the menu.
    const offersRef = collection(db, 'restaurants', restaurant.id, 'offers');
    unsubs.push(onSnapshot(offersRef, (snap) => {
      setOffers(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    }, () => {}));

    // 4) Combos — real-time
    const combosRef = collection(db, 'restaurants', restaurant.id, 'combos');
    unsubs.push(onSnapshot(combosRef, (snap) => {
      setCombos(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    }, () => {}));

    return () => unsubs.forEach(u => u());
  }, [restaurant?.id]);

  // Lock body scroll when any sheet/modal is open
  useEffect(() => {
    const isOpen = !!(selectedItem || smaOpen || selectedCombo || cartOpen || billOpen || waiterModal);
    if (isOpen) {
      document.documentElement.style.overflow = 'hidden';
      document.body.style.overflow = 'hidden';
    } else {
      document.documentElement.style.overflow = '';
      document.body.style.overflow = '';
    }
    return () => {
      document.documentElement.style.overflow = '';
      document.body.style.overflow = '';
    };
  }, [selectedItem, smaOpen, selectedCombo, cartOpen, billOpen, waiterModal]);


  // ── Enrich menu items with active offer data (memoized) ──────────────────
  const [todayStr, setTodayStr] = useState(() => todayKey());
  useEffect(() => {
    const iv = setInterval(() => {
      const now = todayKey();
      if (now !== todayStr) setTodayStr(now);
    }, 60000);
    return () => clearInterval(iv);
  }, [todayStr]);

  // Filter offers to ones that are LIVE today: started already (or no
  // start date) AND not yet expired. Mirrors the offerStatus() logic on
  // /admin/promotions so the customer sees exactly what the admin
  // dashboard considers "Active". Computed once per render and reused for
  // both per-item enrichment AND the offers strip near the bottom of the
  // page — keeps the two views in sync.
  const activeOffers = useMemo(() => (offers || []).filter(o => {
    if (o.endDate && o.endDate < todayStr) return false;        // expired
    if (o.startDate && o.startDate > todayStr) return false;    // scheduled (not yet)
    return true;
  }), [offers, todayStr]);

  const enrichedItems = useMemo(() => (menuItems || []).map(item => {
    const soldOut = item.availableUntil === todayStr;
    const isOutOfStock = item.isOutOfStock || false;
    const activeOffer = !soldOut && !isOutOfStock && activeOffers.find(o => o.linkedItemId === item.id);
    if (!activeOffer) return { ...item, soldOut, isOutOfStock };
    const savePct = activeOffer.discountedPrice && item.price
      ? Math.round(((item.price - activeOffer.discountedPrice) / item.price) * 100)
      : null;
    return {
      ...item,
      soldOut,
      isOutOfStock,
      offerBadge: true,
      offerLabel: savePct ? `${savePct}% OFF` : activeOffer.title,
      offerColor: '#E05A3A',
      offerTitle: activeOffer.title,
      offerDescription: activeOffer.description,
      offerPrice: activeOffer.discountedPrice ?? null,
    };
  }), [menuItems, activeOffers, todayStr]);

  const cats = useMemo(() => ['All', ...new Set(enrichedItems.map(i => i.category).filter(Boolean))], [enrichedItems]);
  const filtered = useMemo(() => activeCat === 'All' ? enrichedItems : enrichedItems.filter(i => i.category === activeCat), [enrichedItems, activeCat]);




  // Smart header: smooth hide on scroll down, show on scroll up
  const hdrRef = useRef(null);
  const lastScrollY = useRef(0);
  const scrollTicking = useRef(false);





  useEffect(() => {
    // Medium-style: pixel-by-pixel tracking + snap-to-complete on scroll end
    let prevY = window.scrollY;
    let translationY = 0;
    let snapTimer = null;

    const snapComplete = (hdr, height) => {
      // Snap to nearest boundary — never leave half-hidden
      const target = translationY < -height / 2 ? -height : 0;
      if (translationY !== target) {
        hdr.style.transition = 'transform 0.3s cubic-bezier(0.4,0,0.2,1)';
        hdr.style.transform = `translateY(${target}px)`;
        translationY = target;
        // Clear transition after animation so finger-tracking resumes cleanly
        setTimeout(() => { if (hdrRef.current) hdrRef.current.style.transition = 'none'; }, 320);
      }
    };

    const onScroll = () => {
      if (scrollTicking.current) return;
      scrollTicking.current = true;
      requestAnimationFrame(() => {
        const currentY = window.scrollY;
        const hdr = hdrRef.current;
        if (hdr) {
          const height = hdr.getBoundingClientRect().height;
          const diff = currentY - prevY;

          // At very top: always fully visible
          if (currentY <= 0) {
            translationY = 0;
            hdr.style.transition = 'none';
            hdr.style.transform = 'translateY(0)';
          } else {
            hdr.style.transition = 'none';
            translationY = Math.min(Math.max(translationY - diff, -height), 0);
            hdr.style.transform = `translateY(${translationY}px)`;
          }

          prevY = currentY;
          lastScrollY.current = currentY;

          // Snap to complete after 180ms of no scrolling
          clearTimeout(snapTimer);
          snapTimer = setTimeout(() => snapComplete(hdr, height), 180);
        }
        scrollTicking.current = false;
      });
    };

    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      clearTimeout(snapTimer);
    };
  }, []);

  // IntersectionObserver: activate shine border only on visible cards
  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') return;
    let obs;
    const raf = requestAnimationFrame(() => {
      const cards = document.querySelectorAll('.card');
      if (!cards.length) return;
      obs = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            entry.target.classList.add('shine-on');
          } else {
            entry.target.classList.remove('shine-on');
          }
        });
      }, { threshold: 0.15 });
      cards.forEach(c => obs.observe(c));
    });
    return () => { cancelAnimationFrame(raf); if (obs) obs.disconnect(); };
  }, [filtered]);
  const arCount = useMemo(() => (menuItems || []).filter(i => i.modelURL).length, [menuItems]);


  /* ─── Rating handler ─── */
  const handleRate = useCallback(async (item, stars) => {
    if (userRatings[item.id]) return; // already rated this session
    setRatingPending(item.id);
    try {
      await rateMenuItem(restaurant.id, item.id, stars);
      setUserRatings(r => ({ ...r, [item.id]: stars }));
      // Update local item ratingAvg optimistically
    } catch (e) { console.error(e); }
    finally { setRatingPending(null); }
  }, [restaurant?.id, userRatings]);

  /* ─── Waiter call handler ─── */
  const handleWaiterCall = useCallback(async () => {
    if (!waiterReason) return;
    setWaiterSending(true);
    try {
      await createWaiterCall(restaurant.id, {
        reason: waiterReason,
        tableNumber: waiterTable || 'Not specified',
        restaurantName: restaurant.name,
      });
      setWaiterSent(true);
      setTimeout(() => {
        setWaiterModal(false);
        setWaiterSent(false);
        setWaiterReason(null);
        if (!tableNumber) setWaiterTable(''); // don't clear if auto-filled from QR
      }, 2500);
    } catch (e) { console.error(e); }
    finally { setWaiterSending(false); }
  }, [restaurant?.id, restaurant?.name, waiterReason, waiterTable]);

  /* ─── Smart Rule-Based Upsell ─── */
  // ── Cart helpers ─────────────────────────────────────────
  // Cart entries carry a `cartKey`:
  //   - items without modifiers: cartKey === id (matches legacy behavior)
  //   - items with modifiers: cartKey = id::variant-name::addon-names-sorted
  //     so two lines of the same dish with different toppings stay separate.
  // Each entry also stores `price` (final unit price with deltas folded in),
  // `basePrice`, `variant`, `addOns`, `modNote` for display.
  const addToCart = useCallback((item, modifiers = null) => {
    if (item.soldOut || item.isOutOfStock) return;
    const variant = modifiers?.variant || null;
    const addOns  = modifiers?.addOns || [];
    const deltaSum = (variant?.priceDelta || 0) + addOns.reduce((s, a) => s + (a.priceDelta || 0), 0);
    const modNote = [variant?.name, ...addOns.map(a => a.name)].filter(Boolean).join(' • ');
    const cartKey = modNote ? `${item.id}::${modNote}` : item.id;
    const unitPrice = (item.price || 0) + deltaSum;
    setCart(prev => {
      const existing = prev.find(c => (c.cartKey || c.id) === cartKey);
      if (existing) return prev.map(c => (c.cartKey || c.id) === cartKey ? { ...c, qty: c.qty + 1 } : c);
      return [...prev, {
        cartKey, id: item.id, name: item.name,
        price: unitPrice, basePrice: item.price || 0,
        variant, addOns, modNote,
        qty: 1, imageURL: item.imageURL || null, note: '',
      }];
    });
  }, []);

  const updateCartNote = useCallback((key, note) => {
    setCart(prev => prev.map(c => (c.cartKey || c.id) === key ? { ...c, note } : c));
  }, []);
  const removeFromCart = useCallback((key) => {
    setCart(prev => {
      const existing = prev.find(c => (c.cartKey || c.id) === key);
      if (existing?.qty > 1) return prev.map(c => (c.cartKey || c.id) === key ? { ...c, qty: c.qty - 1 } : c);
      return prev.filter(c => (c.cartKey || c.id) !== key);
    });
  }, []);
  const clearCart = useCallback(() => {
    setCart([]);
    setAppliedCoupon(null);
    setCouponDiscount(0);
    setCouponCode('');
    setCouponError('');
  }, []);

  const applyCoupon = async () => {
    if (!couponCode.trim() || !restaurant?.id) return;
    setCouponLoading(true);
    setCouponError('');
    try {
      // Server-side validation — customers don't have read access to the
      // coupons collection anymore (see firestore.rules).
      const res = await fetch('/api/coupons/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          restaurantId: restaurant.id,
          code: couponCode,
          subtotal: cartPrice,
        }),
      });
      const result = await res.json();
      if (result.valid) {
        setAppliedCoupon(result.coupon);
        setCouponDiscount(result.discount);
      } else {
        setCouponError(result.error || 'Invalid coupon');
        setAppliedCoupon(null);
        setCouponDiscount(0);
      }
    } catch { setCouponError('Failed to validate coupon'); }
    setCouponLoading(false);
  };

  const removeCoupon = () => {
    setAppliedCoupon(null);
    setCouponDiscount(0);
    setCouponCode('');
    setCouponError('');
  };

  // Persist cart to sessionStorage
  useEffect(() => {
    try { sessionStorage.setItem('ar_cart', JSON.stringify(cart)); } catch {}
  }, [cart]);

  const cartTotal = cart.reduce((s, c) => s + c.qty, 0);
  const cartPrice = cart.reduce((s, c) => s + c.qty * (c.price || 0), 0);

  // Recalculate coupon discount when cart changes
  useEffect(() => {
    if (!appliedCoupon) return;
    const newDiscount = appliedCoupon.type === 'percent'
      ? Math.floor(cartPrice * appliedCoupon.value / 100)
      : Math.min(appliedCoupon.value, cartPrice);
    setCouponDiscount(newDiscount);
  }, [cartPrice, appliedCoupon]);

  // Live order subscription — picks up server-assigned orderNumber AND
  // live paymentStatus. The paymentStatus sync (Phase B) is what makes
  // the bill modal flip from "Cash Payment Requested" to "✅ Payment
  // Confirmed!" the moment the admin marks the order paid in
  // /admin/payments. Without this the customer would just stay on the
  // requested screen forever.
  useEffect(() => {
    if (!placedOrder?.orderId || !restaurant?.id) return;
    const unsub = onSnapshot(doc(db, 'restaurants', restaurant.id, 'orders', placedOrder.orderId), snap => {
      if (!snap.exists()) return;
      const data = snap.data();
      setLiveOrderStatus(data.status);

      // If admin cancelled the order, clear the customer-side placedOrder
      // so the cancelled state doesn't haunt their FABs / bill / status
      // forever. Toast the cancellation so the customer knows what
      // happened. We deliberately only fire this when the listener sees
      // a NEW cancellation — comparing snap.data().status to the local
      // placedOrder snapshot so we don't toast on every snap.
      if (data.status === 'cancelled' && placedOrder.orderType === 'takeaway') {
        toast('Order was cancelled', { icon: '✖️' });
        setPlacedOrder(null);
        try { sessionStorage.removeItem('ar_placed_order'); } catch {}
        if (cartOpen) {
          setCartOpen(false);
          setOrderStep('cart');
        }
        return;
      }

      // Sync the live order fields into placedOrder so the bill modal
      // and any status-aware UI react to admin actions immediately.
      // Only writes the fields that actually changed — avoids needless
      // re-renders when the snapshot fires for other reasons.
      setPlacedOrder(prev => {
        if (!prev) return prev;
        const updates = {};
        if (typeof data.orderNumber === 'number' && prev.orderNumber !== data.orderNumber) {
          updates.orderNumber = data.orderNumber;
        }
        if (data.paymentStatus && prev.paymentStatus !== data.paymentStatus) {
          updates.paymentStatus = data.paymentStatus;
        }
        if (Object.keys(updates).length === 0) return prev;
        return { ...prev, ...updates };
      });
    });
    return unsub;
  }, [placedOrder?.orderId, restaurant?.id, placedOrder?.orderType, cartOpen]);

  // ── Phase B.2 — Auto-close success step ──────────────────────────────
  // After an order is placed and the cart drawer is showing the success
  // step, close it automatically after a few seconds so the customer
  // returns to the menu naturally. They can re-open it anytime via the
  // Order Status FAB at the bottom right (which sets orderStep back to
  // 'success'). Reset orderStep to 'cart' on a small delay so the drawer
  // fade-out doesn't flash through the cart step.
  useEffect(() => {
    if (orderStep !== 'success' || !cartOpen) return;
    const closeTimer = setTimeout(() => {
      setCartOpen(false);
      setTimeout(() => setOrderStep('cart'), 320);
    }, 8000);
    return () => clearTimeout(closeTimer);
  }, [orderStep, cartOpen]);

  // ── Phase F redesign — auto-advance from payment step to success
  //    when the order's paymentStatus becomes paid_*.
  // The pay-first takeaway flow parks the order in awaiting_payment
  // and shows the customer a payment screen. Once the gateway webhook
  // (or an admin marking it paid) flips paymentStatus to paid_*, the
  // listener above (line ~1138) writes that into placedOrder. This
  // effect picks that up and transitions the step to 'success' so
  // the customer sees the kitchen progress bar without having to
  // refresh.
  const PAID_STATUSES_CLIENT = useMemo(() => new Set(['paid_cash', 'paid_card', 'paid_online', 'paid']), []);
  useEffect(() => {
    if (orderStep !== 'payment') return;
    if (!placedOrder?.paymentStatus) return;
    if (PAID_STATUSES_CLIENT.has(placedOrder.paymentStatus)) {
      setOrderStep('success');
    }
  }, [orderStep, placedOrder?.paymentStatus, PAID_STATUSES_CLIENT]);

  // ── Phase A — Running bill effects ───────────────────────────────────
  // Persist currentBillId across reloads. sessionStorage clears on tab
  // close — that's fine, the next QR scan re-discovers the bill via the
  // tableSessions pointer (effect below).
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      if (currentBillId) sessionStorage.setItem('ar_bill_id', currentBillId);
      else sessionStorage.removeItem('ar_bill_id');
    } catch {}
  }, [currentBillId]);

  // Subscribe to every order in the current bill — this is what powers the
  // running-total bill modal. New orders placed at the same table get
  // appended in real-time.
  useEffect(() => {
    if (!currentBillId || !restaurant?.id) return;
    const q = query(
      collection(db, 'restaurants', restaurant.id, 'orders'),
      where('billId', '==', currentBillId),
      orderBy('createdAt', 'asc')
    );
    return onSnapshot(
      q,
      snap => setBillOrders(snap.docs.map(d => ({ id: d.id, ...d.data() }))),
      err => console.warn('[billOrders] listener error:', err.message)
    );
  }, [currentBillId, restaurant?.id]);

  // After a valid table-QR scan, see if a bill is already open at this
  // table (e.g. customer reloaded the page or scanned from a second
  // device). If yes, adopt it so the bill modal shows the running total
  // already accumulated. Bails out silently on any error so a Firestore
  // hiccup never breaks the page.
  useEffect(() => {
    if (currentBillId) return;
    if (!sessionChecked || sessionBlocked) return;
    if (!restaurant?.id || !tableNumber) return;
    let cancelled = false;
    (async () => {
      try {
        const session = await getTableSession(restaurant.id, tableNumber);
        if (cancelled || !session?.currentBillId) return;
        const billDoc = await getTableBill(restaurant.id, session.currentBillId);
        if (cancelled) return;
        if (billDoc?.status === 'open') setCurrentBillId(session.currentBillId);
      } catch {}
    })();
    return () => { cancelled = true; };
  }, [sessionChecked, sessionBlocked, restaurant?.id, tableNumber, currentBillId]);

  // Pre-fetch the running bill the moment the customer adds their first
  // item to cart. By the time they hit "Place Order", billId is already
  // cached locally and we skip the network round-trip there — ~500-800ms
  // saved on the order-placement tap. Falling back to fetch-on-place-order
  // (in placeOrder() below) covers the case where this pre-fetch is still
  // in flight or failed.
  useEffect(() => {
    if (currentBillId) return;                              // already have one
    if (cart.length === 0) return;                          // wait until customer commits
    if (!restaurant?.id || !tableNumber || !urlSid) return; // not a dine-in QR scan
    let cancelled = false;
    getOrCreateOpenTableBill(restaurant.id, tableNumber, urlSid)
      .then(bid => { if (!cancelled && bid) setCurrentBillId(bid); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [cart.length, currentBillId, restaurant?.id, tableNumber, urlSid]);

  // ── Phase B — Bill payment state ─────────────────────────────────────
  // Drives the bill modal's UI swap: payment-method picker (unpaid) →
  // "Cash Payment Requested" (requested) → "Payment Confirmed!" (paid).
  // Computed from the LIVE paymentStatus on the orders, so when admin
  // marks an order paid in /admin/payments, this flips automatically and
  // the customer's bill modal reflects it without a refresh.
  //
  // For multi-order bills, "paid" requires ALL orders paid; any order
  // still in `*_requested` keeps the bill in `requested`. This matches
  // the customer mental model: "the bill" pays as one unit.
  //
  // The local `paymentDone` flag still feeds in for instant feedback
  // between "Confirm Cash" tap and the Firestore round-trip — once the
  // listener catches up with `cash_requested`, the derived state holds
  // the same value, so there's no flicker.
  const PAID_STATUSES = useMemo(() => new Set(['paid_cash', 'paid_card', 'paid_online', 'paid']), []);
  const REQUESTED_STATUSES = useMemo(() => new Set(['cash_requested', 'card_requested', 'online_requested']), []);

  const billPaymentState = useMemo(() => {
    const sourceOrders = (currentBillId && billOrders.length > 0)
      ? billOrders
      : (placedOrder ? [placedOrder] : []);
    if (sourceOrders.length === 0) return 'unpaid';

    const allPaid = sourceOrders.every(o => PAID_STATUSES.has(o.paymentStatus));
    if (allPaid) return 'paid';

    const anyRequested = sourceOrders.some(o => REQUESTED_STATUSES.has(o.paymentStatus));
    if (anyRequested || paymentDone) return 'requested';

    return 'unpaid';
  }, [currentBillId, billOrders, placedOrder, paymentDone, PAID_STATUSES, REQUESTED_STATUSES]);

  // Derive method from the most-progressed paymentStatus across orders.
  // Falls back to the local paymentMethod state for the brief window
  // between "Confirm Cash" tap and listener catch-up.
  const billPaymentMethod = useMemo(() => {
    const sourceOrders = (currentBillId && billOrders.length > 0)
      ? billOrders
      : (placedOrder ? [placedOrder] : []);
    for (const o of sourceOrders) {
      const ps = o.paymentStatus;
      if (ps === 'paid_cash' || ps === 'cash_requested') return 'cash';
      if (ps === 'paid_card' || ps === 'card_requested') return 'card';
      if (ps === 'paid_online' || ps === 'online_requested') return 'upi';
      if (ps === 'paid') return 'cash'; // legacy bucket
    }
    return paymentMethod;
  }, [currentBillId, billOrders, placedOrder, paymentMethod]);

  // ── Phase A — Aggregated bill view model ─────────────────────────────
  // Unified shape compatible with both:
  //   - the running-bill case (multiple orders attached to one bill →
  //     items + totals are summed across them)
  //   - the single-order case (takeaway / pre-Phase-A orders without a
  //     billId → fall back to the placedOrder shape)
  // The bill modal renders from this so the same JSX handles both cases.
  const bill = useMemo(() => {
    const useBill = currentBillId && billOrders.length > 0;
    const orders = useBill
      ? billOrders
      : (placedOrder ? [{ id: placedOrder.orderId, ...placedOrder }] : []);
    if (orders.length === 0) return null;

    const items = orders.flatMap(o => o.items || []);
    const sum = (key) => orders.reduce((s, o) => s + (Number(o[key]) || 0), 0);
    const first = orders[0];

    // paidAt: the latest paymentUpdatedAt across orders that are in a
    // paid_* state. Used by the printed bill to stamp the moment payment
    // was actually confirmed (not the moment Print Bill was clicked, which
    // is what we used to do — the user reported the time on the receipt
    // was the click time, which doesn't match what cash registers do).
    // null when no order on the bill is paid yet.
    const PAID = ['paid_cash', 'paid_card', 'paid_online', 'paid'];
    let paidAtMs = 0;
    for (const o of orders) {
      if (!PAID.includes(o.paymentStatus)) continue;
      // paymentUpdatedAt is a Firestore Timestamp { seconds, nanoseconds }
      // when read live; can also be a plain number/string after JSON
      // serialisation in edge cases. Handle both shapes.
      const t = o.paymentUpdatedAt;
      let ms = 0;
      if (t && typeof t.seconds === 'number') ms = t.seconds * 1000;
      else if (t && typeof t.toMillis === 'function') ms = t.toMillis();
      else if (t) ms = new Date(t).getTime() || 0;
      if (ms > paidAtMs) paidAtMs = ms;
    }

    return {
      isBill:               useBill,
      orderIds:             orders.map(o => o.id || o.orderId).filter(Boolean),
      items,
      subtotal:             sum('subtotal'),
      serviceCharge:        sum('serviceCharge'),
      cgst:                 sum('cgst'),
      sgst:                 sum('sgst'),
      discount:             sum('discount'),
      roundOff:             sum('roundOff'),
      total:                sum('total'),
      tableNumber:          first.tableNumber || placedOrder?.tableNumber || '',
      gstPercent:           first.gstPercent || 0,
      serviceChargePercent: first.serviceChargePercent || 0,
      couponCode:           orders.find(o => o.couponCode)?.couponCode || null,
      orderCount:           orders.length,
      multipleOrders:       orders.length > 1,
      paidAtMs:             paidAtMs || null,
    };
  }, [currentBillId, billOrders, placedOrder]);

  // Add entire combo as a single cart entry at combo price
  const addComboToCart = useCallback((combo) => {
    const comboItems = (combo.itemIds || []).map(id => (menuItems || []).find(i => i.id === id)).filter(Boolean);
    const name = combo.name + (comboItems.length ? ` (${comboItems.map(i => i.name).join(', ')})` : '');
    setCart(prev => {
      const existing = prev.find(c => c.id === `combo_${combo.id}`);
      if (existing) return prev.map(c => c.id === `combo_${combo.id}` ? { ...c, qty: c.qty + 1 } : c);
      return [...prev, { id: `combo_${combo.id}`, name, price: combo.comboPrice || 0, qty: 1, imageURL: comboItems[0]?.imageURL || null, isCombo: true }];
    });
  }, [menuItems]);

  const placeOrder = async () => {
    if (!restaurant?.id || cart.length === 0) return;
    // Idempotency guard — see placeOrderInFlightRef declaration above.
    if (placeOrderInFlightRef.current) return;
    // Phone is required (Phase B). Validate BEFORE we touch any in-flight
    // state — a failed validation isn't a "failed attempt", it just bounces
    // the customer back to the form.
    const phoneRaw = (orderPhone || '').replace(/[^0-9+]/g, '');
    if (!phoneRaw || phoneRaw.replace(/\D/g, '').length < 10) {
      toast.error('Please enter your phone number to place the order.');
      return;
    }
    // Re-validate session before accepting order
    if (tableNumber) {
      const session = await getTableSession(restaurant.id, tableNumber);
      const valid = urlSid
        ? isSessionValidWithSid(session, urlSid)
        : isSessionValid(session);
      if (!valid) { setSessionBlocked(true); return; }
    }
    placeOrderInFlightRef.current = true;
    setIsSubmitting(true);
    try {
      // Re-validate prices from live menu data. Modifier deltas stack on
      // whatever the live base price is (so offer prices apply, but the
      // "+₹50 for Full size" still adds on top).
      const freshCart = cart.map(c => {
        const live = enrichedItems.find(i => i.id === c.id);
        if (!live) return c;
        const basePriceLive = live.offerPrice ?? live.price ?? 0;
        const deltaSum = (c.variant?.priceDelta || 0)
          + (c.addOns || []).reduce((s, a) => s + (a.priceDelta || 0), 0);
        return { ...c, price: basePriceLive + deltaSum, basePrice: basePriceLive };
      });
      const gstPct = restaurant?.gstPercent || 0;
      const scPct = restaurant?.serviceChargePercent || 0;
      const subtotal = freshCart.reduce((s, c) => s + c.qty * (c.price || 0), 0);
      const serviceCharge = parseFloat((subtotal * scPct / 100).toFixed(2));
      const cgst = parseFloat((subtotal * (gstPct / 2) / 100).toFixed(2));
      const sgst = parseFloat((subtotal * (gstPct / 2) / 100).toFixed(2));
      const discount = couponDiscount || 0;
      const preRound = subtotal + serviceCharge + cgst + sgst - discount;
      const roundOff = parseFloat((Math.round(preRound) - preRound).toFixed(2));
      const grandTotal = Math.round(preRound);

      // Save phone to localStorage for auto-fill on next visit
      const phone = orderPhone.replace(/[^0-9+]/g, '');
      if (phone) savePhone(phone);

      // Resolve order type. A QR scan (tableNumber from URL) always means
      // dine-in regardless of the toggle. Otherwise we honour the customer's
      // pick. Takeaway orders don't send a table number.
      const finalOrderType = tableNumber ? 'dinein' : customerOrderType;
      const finalTable = finalOrderType === 'takeaway'
        ? ''
        : (orderTableInput.trim() || tableNumber || 'Not specified');

      // ── Phase A — Attach order to a running bill (dine-in via QR only) ──
      // For dine-in orders that arrived via a real table QR (tableNumber +
      // urlSid present), fetch or create the running bill so multiple
      // orders at the same table aggregate into one customer-visible bill.
      // Bill creation is server-side (validates the QR sid). Failing soft:
      // if the bill can't be created we proceed without billId — order is
      // a standalone single-order bill, same as pre-Phase-A behaviour.
      //
      // Speed: prefer the cached `currentBillId` (set by the pre-fetch
      // effect when cart goes non-empty, or by the previous order). Only
      // hit the API here if no bill is cached yet — that path is the
      // fallback when the pre-fetch didn't finish in time.
      let billIdForOrder = (finalOrderType === 'dinein' && tableNumber && urlSid)
        ? currentBillId
        : null;
      if (!billIdForOrder && finalOrderType === 'dinein' && tableNumber && urlSid) {
        billIdForOrder = await getOrCreateOpenTableBill(restaurant.id, tableNumber, urlSid);
        if (billIdForOrder && billIdForOrder !== currentBillId) {
          setCurrentBillId(billIdForOrder);
        }
      }

      const orderId = await createOrder(restaurant.id, {
        tableNumber: finalTable,
        orderType: finalOrderType,
        billId: billIdForOrder, // null for takeaway / non-QR — preserves single-order behaviour
        customerName: finalOrderType === 'takeaway' ? (customerName.trim() || '') : '',
        customerPhone: phone || null,
        items: freshCart.map(c => ({
          id: c.id, name: c.name || '',
          price: c.price ?? 0, qty: c.qty || 1, note: c.note || '',
          // Modifier info — kitchen/waiter/orders can render these if they
          // choose to; passing them through preserves the option.
          variant: c.variant || null,
          addOns: c.addOns || [],
          modNote: c.modNote || '',
        })),
        subtotal,
        gstPercent: gstPct,
        serviceChargePercent: scPct,
        cgst,
        sgst,
        serviceCharge,
        discount,
        couponCode: appliedCoupon?.code || null,
        roundOff,
        total: grandTotal,
        specialInstructions: specialNote.trim() || null,
        sessionId: getSessionId(),
        restaurantName: restaurant.name,
        paymentStatus: 'unpaid',
      });

      // Increment coupon usage
      if (appliedCoupon?.id) {
        incrementCouponUse(restaurant.id, appliedCoupon.id).catch(() => {});
      }

      // Save snapshot for the bill view + downstream state machine.
      // CRITICAL fields (Phase F): orderType — drives the Payment FAB
      // visibility + the success-screen copy. Without it `placedOrder.
      // orderType === 'takeaway'` was always false and the Payment FAB
      // never rendered. paymentStatus is also stamped 'unpaid' so the
      // payment step's "isWaiting" check evaluates correctly before the
      // listener fires its first snapshot.
      const isTakeaway = finalOrderType === 'takeaway';
      const orderSnapshot = {
        items: freshCart.map(c => ({ ...c })),
        subtotal, gstPercent: gstPct, serviceChargePercent: scPct,
        cgst, sgst, serviceCharge, discount,
        couponCode: appliedCoupon?.code || null,
        roundOff, total: grandTotal,
        orderId,
        orderType: finalOrderType,
        paymentStatus: 'unpaid',
        tableNumber: orderTableInput.trim() || tableNumber || 'Not specified',
        customerName: isTakeaway ? (customerName.trim() || '') : '',
      };
      setPlacedOrder(orderSnapshot);
      setPaymentDone(false);
      setPaymentMethod(null);
      // Initial liveOrderStatus must match what createOrder wrote to
      // Firestore — takeaway+unpaid is awaiting_payment, everything else
      // is pending. Without this, the customer-side FAB flickered to
      // "Order Status" for ~1s before the listener corrected it.
      setLiveOrderStatus(isTakeaway ? 'awaiting_payment' : 'pending');
      try { sessionStorage.setItem('ar_placed_order', JSON.stringify(orderSnapshot)); sessionStorage.removeItem('ar_payment_done'); } catch {}
      // Phase F redesign — takeaway is pay-FIRST: the order is parked
      // in awaiting_payment server-side and the kitchen doesn't see it
      // until payment clears. Show the payment step instead of success.
      // Dine-in stays on the existing flow — customer eats first, pays
      // last, so blocking the kitchen on payment would defeat the
      // whole experience.
      setOrderStep(isTakeaway ? 'payment' : 'success');
      clearCart();
    } catch (err) {
      console.error('Order failed:', err);
      toast.error(`Order failed: ${err?.code || err?.message || 'Unknown error'}`);
    } finally {
      placeOrderInFlightRef.current = false;
      setIsSubmitting(false);
    }
  };
  // ─────────────────────────────────────────────────────────


  const openItem = useCallback(async (item) => {
    setSelectedItem(item); setShowAR(false);
    if (restaurant?.id) incrementItemView(restaurant.id, item.id).catch(() => { });
  }, [restaurant?.id]);
  const closeItem = useCallback(() => { setSelectedItem(null); setShowAR(false); }, []);
  const handleARLaunch = useCallback(async () => {
    if (restaurant?.id && selectedItem?.id) incrementARView(restaurant.id, selectedItem.id).catch(() => { });
  }, [restaurant?.id, selectedItem?.id]);
  const imgSrc = (item) => (!imgErr[item.id] && item.imageURL) ? item.imageURL : getPlaceholder(item.id);

  const openSMA = () => { setSmaOpen(true); setSmaMode(null); setGroupSize(null); setSmaStep(0); setSmaAnswers({}); setSmaResults([]); };
  const closeSMA = () => setSmaOpen(false);
  const restartSMA = () => { setSmaMode(null); setGroupSize(null); setSmaStep(0); setSmaAnswers({}); setSmaResults([]); };
  const activeQs = smaMode === 'group' ? GROUP_QUESTIONS : SOLO_QUESTIONS;
  const pickAnswer = (qId, val) => {
    const ans = { ...smaAnswers, [qId]: val };
    setSmaAnswers(ans);
    if (smaStep < activeQs.length - 1) setSmaStep(smaStep + 1);
    else { setSmaResults(filterItems(menuItems || [], ans, groupSize)); setSmaStep(activeQs.length); }
  };

  // ── Real-time: restaurant toggled off by admin → instant block ──
  if (restaurantGone) return (
    <div style={{ minHeight: '100vh', background: '#FAF7F2', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Inter,sans-serif', padding: 24 }}>
      <div style={{ textAlign: 'center', maxWidth: 420 }}>
        <div style={{ fontSize: 56, marginBottom: 20 }}>🍽️</div>
        <h1 style={{ fontFamily: 'Poppins,sans-serif', fontWeight: 700, fontSize: 22, color: '#1E1B18', marginBottom: 10 }}>
          {restaurant?.name || 'Restaurant'}
        </h1>
        <div style={{ padding: '20px 28px', background: '#fff', borderRadius: 20, boxShadow: '0 4px 24px rgba(0,0,0,0.07)', border: '1px solid rgba(42,31,16,0.08)' }}>
          <div style={{ fontSize: 36, marginBottom: 12 }}>⏸️</div>
          <div style={{ fontWeight: 700, fontSize: 17, color: '#1E1B18', marginBottom: 8 }}>Currently Unavailable</div>
          <div style={{ color: 'rgba(42,31,16,0.55)', fontSize: 14, lineHeight: 1.6 }}>
            This restaurant's digital menu is currently not available. Please check back later or ask a staff member for assistance.
          </div>
        </div>
        <div style={{ marginTop: 16, fontSize: 12, color: 'rgba(42,31,16,0.35)' }}>Powered by Advert Radical</div>
      </div>
    </div>
  );

  if (error || !restaurant) return (
    <div style={{ minHeight: '100vh', background: '#FAF7F2', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: '-apple-system,BlinkMacSystemFont,"SF Pro Display",sans-serif' }}>
      <div style={{ textAlign: 'center' }}><div style={{ fontSize: 52, marginBottom: 12 }}>🍽️</div>
        <h1 style={{ fontSize: 20, fontWeight: 700, color: '#1E1B18' }}>Restaurant not found</h1>
        <p style={{ color: '#9A9A9A', marginTop: 6, fontSize: 14 }}>This page doesn't exist or is inactive.</p>
      </div>
    </div>
  );
  // ── Subscription enforcement ──────────────────────────────────────────
  // Accept both 'active' (paid) and 'trial' as valid statuses — trial
  // restaurants need a working customer page during their 14-day window,
  // otherwise they can't actually use the product to evaluate it. Block
  // only on explicit 'expired' / 'inactive' / 'cancelled' style statuses.
  const subEnd = restaurant?.subscriptionEnd;
  const payStatus = restaurant?.paymentStatus;
  const isExpired = subEnd && new Date(subEnd) < new Date();
  const VALID_PAY_STATUSES = new Set(['active', 'trial']);
  const isInactive = payStatus && !VALID_PAY_STATUSES.has(payStatus);
  const menuBlocked = isExpired || isInactive;

  if (menuBlocked) return (
    <div style={{ minHeight: '100vh', background: '#FAF7F2', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Inter,sans-serif', padding: 24 }}>
      <div style={{ textAlign: 'center', maxWidth: 420 }}>
        <div style={{ fontSize: 56, marginBottom: 20 }}>🍽️</div>
        <h1 style={{ fontFamily: 'Poppins,sans-serif', fontWeight: 700, fontSize: 22, color: '#1E1B18', marginBottom: 10 }}>
          {restaurant.name}
        </h1>
        <div style={{ padding: '20px 28px', background: '#fff', borderRadius: 20, boxShadow: '0 4px 24px rgba(0,0,0,0.07)', border: '1px solid rgba(42,31,16,0.08)' }}>
          <div style={{ fontSize: 36, marginBottom: 12 }}>⚠️</div>
          <div style={{ fontWeight: 700, fontSize: 17, color: '#1E1B18', marginBottom: 8 }}>Menu Temporarily Unavailable</div>
          <div style={{ color: 'rgba(42,31,16,0.55)', fontSize: 14, lineHeight: 1.6 }}>
            This restaurant's digital menu is currently unavailable. Please ask a staff member for the physical menu or contact the restaurant directly.
          </div>
        </div>
        <div style={{ marginTop: 16, fontSize: 12, color: 'rgba(42,31,16,0.35)' }}>Powered by Advert Radical</div>
      </div>
    </div>
  );
  // ─────────────────────────────────────────────────────────────────────

  // ── Session validation screens ────────────────────────────────────────
  if (tableNumber && !sessionChecked) return (
    <div style={{ minHeight: '100vh', background: '#0D0B08', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ width: 32, height: 32, border: '3px solid #F79B3D', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );

  if (sessionBlocked) return (
    <div style={{ minHeight: '100vh', background: '#0D0B08', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Inter,sans-serif', padding: 24 }}>
      <div style={{ textAlign: 'center', maxWidth: 380 }}>
        <div style={{ fontSize: 56, marginBottom: 20 }}>🔒</div>
        <h1 style={{ fontFamily: 'Poppins,sans-serif', fontWeight: 700, fontSize: 22, color: '#FFF5E8', marginBottom: 10 }}>
          {restaurant.name}
        </h1>
        <div style={{ padding: '24px 28px', background: 'rgba(255,255,255,0.05)', borderRadius: 20, border: '1px solid rgba(255,245,220,0.1)' }}>
          <div style={{ fontWeight: 700, fontSize: 17, color: '#FFF5E8', marginBottom: 10 }}>
            Table {tableNumber} is not active
          </div>
          <div style={{ color: 'rgba(255,245,220,0.55)', fontSize: 14, lineHeight: 1.7 }}>
            Please ask your waiter to activate this table so you can view the menu and place orders.
          </div>
        </div>
        <div style={{ marginTop: 16, fontSize: 12, color: 'rgba(255,245,220,0.25)' }}>Powered by Advert Radical</div>
      </div>
    </div>
  );

  return (
    <>
      <Head>
        <title>{restaurant.name} — Menu</title>
        <meta name="description" content={`Explore ${restaurant.name}'s menu with AR previews. Order directly from your table.`} />
        <meta name="viewport" content="width=device-width, initial-scale=1" />

        {/* Phase L — per-restaurant PWA manifest. Overrides the global
            /manifest.json (which is admin-focused, start_url /admin).
            When a diner taps "Add to Home Screen" from the menu page,
            installing the PWA picks up THIS manifest — branded with
            the restaurant's name + theme color, start_url pointing to
            their table's QR redirect so re-launching always lands on
            the latest sid. */}
        <link
          rel="manifest"
          href={`/api/manifest?subdomain=${encodeURIComponent(restaurant.subdomain || '')}${tableNumber ? `&table=${encodeURIComponent(tableNumber)}` : ''}`}
        />
        <meta name="apple-mobile-web-app-title" content={restaurant.name} />
        <meta name="theme-color" content="#1A1A1A" />

        {/* Open Graph */}
        <meta property="og:title" content={`${restaurant.name} — Menu`} />
        <meta property="og:description" content={`Explore ${restaurant.name}'s menu with AR previews. Order directly from your table.`} />
        <meta property="og:type" content="restaurant" />
        <meta property="og:url" content={`https://advertradical.com/restaurant/${restaurant.subdomain || ''}`} />
        <meta property="og:image" content="https://advertradical.com/og-default.png" />

        {/* Canonical URL */}
        <link rel="canonical" href={`https://advertradical.com/restaurant/${restaurant.subdomain || ''}`} />

        {/* JSON-LD structured data */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify({
            '@context': 'https://schema.org',
            '@type': 'Restaurant',
            name: restaurant.name,
            url: `https://advertradical.com/restaurant/${restaurant.subdomain || ''}`,
            servesCuisine: restaurant.cuisine || undefined,
            address: restaurant.city ? { '@type': 'PostalAddress', addressLocality: restaurant.city } : undefined,
            hasMenu: {
              '@type': 'Menu',
              url: `https://advertradical.com/restaurant/${restaurant.subdomain || ''}`,
            },
          }) }}
        />
      </Head>

      <div className={darkMode ? 'dm' : ''} id="app-root" style={{ position: 'relative' }}>
        {/* Plasma background — shows only in dark mode via CSS */}
        <div className="plasma-bg" aria-hidden="true">
          <div className="plasma-blob pb1" />
          <div className="plasma-blob pb2" />
          <div className="plasma-blob pb3" />
          <div className="plasma-blob pb4" />
          <div className="plasma-overlay" />
        </div>
        {/* SVG turbulence filter for electric card borders */}
        <svg className="card-turb-svg" xmlns="http://www.w3.org/2000/svg" style={{ position: "absolute", width: 0, height: 0, overflow: "hidden", pointerEvents: "none" }}>
          <defs>
            <filter id="card-turb" colorInterpolationFilters="sRGB" x="-5%" y="-5%" width="110%" height="110%">
              <feTurbulence type="turbulence" baseFrequency="0.02" numOctaves="4" result="noise1" seed="1">
                <animate attributeName="baseFrequency" values="0.02;0.025;0.02" dur="6s" repeatCount="indefinite" />
              </feTurbulence>
              <feDisplacementMap in="SourceGraphic" in2="noise1" scale="2" xChannelSelector="R" yChannelSelector="B" />
            </filter>
          </defs>
        </svg>
        <style>{`
        html, body { margin:0; padding:0; }
        #app-root { transition: background 0.4s ease, color 0.4s ease; }
        #app-root *, #app-root *::before, #app-root *::after {
          transition:
            background-color 0.4s ease,
            background 0.4s ease,
            color 0.4s ease,
            border-color 0.4s ease,
            box-shadow 0.4s ease !important;
        }
        /* Keep transform/movement transitions unaffected by the above */
        #app-root .card { transition: transform 0.28s cubic-bezier(0.34,1.2,0.64,1), box-shadow 0.28s ease, background-color 0.4s ease, border-color 0.4s ease !important; }
        .sheet, .sma-sheet { transition: background 0.4s ease, border-color 0.4s ease; }
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
        @keyframes slideUp { 
          from { transform: translateY(50px) scale(0.95); opacity: 0; }
          to   { transform: translateY(0) scale(1);   opacity: 1; }
        }
        @keyframes blink   { 0%,100%{opacity:1} 50%{opacity:0.15} }

        /* Phase B.3 — live status FAB indicators. The dot pulses gently
           to signal "we're tracking your order live"; the whole FAB gets
           a stronger pulsing ring when status flips to 'ready' so the
           customer can't miss it from across the table. */
        @keyframes fab-pulse-dot {
          0%, 100% { transform: scale(1);   opacity: 1; }
          50%      { transform: scale(1.5); opacity: 0.55; }
        }
        @keyframes fab-ready-glow {
          0%, 100% { box-shadow: 0 6px 22px rgba(45,139,78,0.35); }
          50%      { box-shadow: 0 6px 30px rgba(45,139,78,0.75), 0 0 0 4px rgba(45,139,78,0.18); }
        }
        .status-fab-ready { animation: fab-ready-glow 1.5s ease-in-out infinite; }

        /* ─────────── HEADER ─────────── */
        .hdr {
          position: sticky; top: 0; z-index: 40;
          background: rgba(255,255,255,0.55);
          backdrop-filter: saturate(200%) blur(28px) brightness(1.04);
          -webkit-backdrop-filter: saturate(200%) blur(28px) brightness(1.04);
          border-bottom: 1px solid rgba(255,255,255,0.35);
          box-shadow: 0 2px 24px rgba(0,0,0,0.06), 0 1px 0 rgba(255,255,255,0.6) inset;
          transform: translateY(0);
          transition: background 0.4s ease, border-color 0.4s ease;
          will-change: transform;
        }
        /* hdr-hidden removed — handled via inline style for smooth transition */
        .hdr-inner { max-width: 1080px; margin: 0 auto; padding: 0 18px; }

        .hdr-top {
          display: flex; align-items: center; gap: 13px;
          padding: 15px 0 13px;
        }
        /* Logo wrapper — sized via CSS so mobile can override without !important inline fight */
        .circ-wrap { width: 80px; height: 80px; }
        /* Name + subtitle block — grows to fill available space */
        .r-name-wrap { flex: 1; min-width: 0; }
        /* Right group: AR badge + lang picker — pushed to far right */
        .hdr-right {
          display: flex; align-items: center; gap: 6px;
          margin-left: auto; flex-shrink: 0;
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
          flex-shrink: 0;
          display: flex; align-items: center; gap: 5px;
          padding: 5px 12px; border-radius: 20px;
          background: rgba(247,155,61,0.1);
          border: 1px solid rgba(247,155,61,0.25);
          font-size: 11px; font-weight: 600; color: #E07020;
          letter-spacing: 0.01em;
        }
        .ar-dot { width: 6px; height: 6px; border-radius: 50%; background: #F79B3D; animation: blink 1.8s infinite; }

        /* ── Mobile header — fits everything neatly on ≤480px screens ── */
        @media (max-width: 480px) {
          .hdr-top { gap: 8px; padding: 10px 0 10px; }
          /* Shrink the circular logo ring from 80px to 48px */
          .circ-wrap { width: 48px; height: 48px; }
          /* Hide the spinning "• AR MENU • EXPLORE •" ring — characters are
             positioned at radius=36px from center, so on a 48px wrapper the
             text overflows 12px on each side and gets clipped. Hiding is
             cleaner than trying to reposition all ~22 letter spans in CSS. */
          .circ-ring { display: none; }
          /* Scale down the inner logo disc */
          .circ-wrap .r-logo { width: 32px !important; height: 32px !important; font-size: 15px !important; }
          /* Reduce restaurant name — still readable, doesn't overflow */
          .r-name { font-size: 14px; }
          /* Hide the subtitle line — saves ~16px of height and avoids wrap */
          .r-sub { display: none; }
          /* Shrink theme toggle so it doesn't eat too much horizontal space */
          .theme-toggle { font-size: 11px; margin-left: 0; }
          /* Hide AR Live badge on mobile — icon + text too wide on small screens */
          .ar-badge { display: none !important; }
          /* Compact language pills */
          .lang-btn { padding: 3px 7px; font-size: 11px; }
        }

        /* ─── CATEGORY TABS — bleeding pill design ─── */
        .cats-outer {
          padding: 4px 0 0;
          /* Ensure outer never clips or wraps */
          min-width: 0;
        }
        .cats-scroll {
          display: flex;
          flex-direction: row;
          flex-wrap: nowrap;
          align-items: center;
          gap: 6px;
          overflow-x: auto;
          overflow-y: visible;
          scrollbar-width: none;
          -ms-overflow-style: none;
          padding: 6px 0 14px;
          -webkit-overflow-scrolling: touch;
          /* Prevent the row from ever collapsing into two lines */
          width: 100%;
          min-width: 0;
        }
        .cats-scroll::-webkit-scrollbar { display: none; }

        .cat-pill {
          /* Never shrink or wrap — each pill is a fixed-size atom */
          flex: 0 0 auto;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 5px;
          /* Fixed height + padding — identical for ALL states */
          height: 38px;
          padding: 0 16px;
          border-radius: 30px;
          /* Typography — same weight in both states to prevent width shift */
          font-size: 13px;
          font-weight: 600;
          font-family: 'Inter', sans-serif;
          white-space: nowrap;
          letter-spacing: -0.1px;
          /* Appearance */
          border: 1.5px solid transparent;
          background: rgba(247,155,61,0.07);
          color: #2B2B2B;
          cursor: pointer;
          position: relative;
          /* Only animate visual properties — NEVER layout properties */
          transition: background 0.2s ease, color 0.2s ease,
                      box-shadow 0.2s ease, border-color 0.2s ease;
          box-sizing: border-box;
          line-height: 1;
          /* GPU compositing for smooth scroll */
          -webkit-tap-highlight-color: transparent;
        }
        .cat-pill:hover:not(.on) {
          background: rgba(247,155,61,0.14);
          color: #1E1B18;
        }
        .cat-pill:active { opacity: 0.85; }
        /* ── Active pill — amber fill, same physical size ── */
        .cat-pill.on {
          background: #F79B3D;
          color: #FFFFFF;
          font-weight: 600;
          border-color: transparent;
          box-shadow: 0 4px 16px rgba(247,155,61,0.38), 0 1px 4px rgba(247,155,61,0.2);
          /* No letter-spacing change — prevents neighbour pills from shifting */
        }
        .cat-emoji {
          font-size: 13px;
          display: inline-block;
          line-height: 1;
          /* Fixed width so different emoji widths don't expand/shrink pills */
          width: 15px;
          text-align: center;
          flex-shrink: 0;
        }

        /* ─────────── MAIN ─────────── */
        .main {
          max-width: 1080px; margin: 0 auto;
          padding: 20px 18px 110px;
          background: #FAF7F2;
          position: relative; z-index: 1;
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
          cursor: pointer; transition: all 0.2s ease;
        }
        .ar-strip-chip:hover { background: #F48A1E; transform: scale(1.05); }

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
        .grid { display: grid; grid-template-columns: 1fr; gap: 12px; }
        @media (min-width: 600px) and (max-width: 899px) {
          .grid { grid-template-columns: repeat(3, 1fr); gap: 14px; }
        }
        @media (min-width: 900px) {
          .grid { grid-template-columns: repeat(4, 1fr); gap: 16px; }
        }

        /* ─────────── CARD — Apple App Store level ─────────── */
        .card {
          background: #FFFFFF;
          border-radius: 20px; overflow: hidden;
          cursor: pointer; position: relative; text-align: left;
          display: flex; flex-direction: column;
          will-change: transform;
          transition: transform 0.28s cubic-bezier(0.34,1.2,0.64,1), box-shadow 0.28s ease, border-color 0.28s ease;
          box-shadow:
            0 1px 3px rgba(0,0,0,0.06),
            0 4px 16px rgba(0,0,0,0.07);
          border: 1px solid #F0E8DE;
        }
        .card:hover  { transform: translateY(-6px); box-shadow: 0 16px 44px rgba(0,0,0,0.16); border-color: rgba(247,155,61,0.2); }
        .card:hover .c-img img { transform: scale(1.06); }
        .card:active { transform: scale(0.98); }

        /* Card image */
        .c-img { position: relative; overflow: hidden; width: 100%; height: 185px; display: block; border-radius: 20px 20px 0 0; background: #F5EDE0; }
        .c-img img { width:100%; height:100%; object-fit:cover; display:block; vertical-align:bottom; transition: transform 0.4s cubic-bezier(0.4,0,0.2,1); }
        .c-img-ph {
          width:100%; height:100%;
          display:flex; align-items:center; justify-content:center; font-size:48px;
          background: #F5EDE0;
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
          z-index: 3;
        }

        /* Veg indicator */
        .veg-ind {
          position: absolute; top: 10px; left: 10px;
          width: 20px; height: 20px; border-radius: 4px; border: 2px solid;
          background: rgba(255,255,255,0.92); display: flex; align-items: center; justify-content: center;
          z-index: 3;
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
        .c-body { padding: 14px 16px 16px; flex: 1; display: flex; flex-direction: column; }

        /* Badges */
        .c-badges { display:flex; gap:5px; flex-wrap:wrap; margin-bottom:6px; }
        .c-badge  { font-size: 10px; font-weight: 600; padding: 3px 9px; border-radius: 6px; }
        .c-badge-pop  { background: #FFF0EB; color: #E07020; }
        .c-badge-feat { background: #F0EBF8; color: #6030A0; }

        .c-name {
          font-size: 15px; font-weight: 700; color: #1E1B18;
          line-height: 1.3; margin-bottom: 8px;
          letter-spacing: -0.2px;
          flex: 1;
        }

        .c-price-row { display: flex; align-items: center; gap: 8px; margin-bottom: 6px; min-height: 24px; }
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
          transition: all 0.2s ease;
        }
        .c-ar-cta:hover { background: rgba(247,155,61,0.12); color: #F79B3D; }

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
          animation: slideUp 0.25s cubic-bezier(0.32,0.72,0,1);
          box-shadow: 0 -8px 40px rgba(0,0,0,0.12);
        }
        .sheet::before { content: none; }
        .sheet::after  { content: none; }
        .handle-row { display:flex; justify-content:center; padding:12px 0 0; }
        .handle     { width:44px; height:5px; border-radius:3px; background:rgba(0,0,0,0.18); transition:width 0.2s, background 0.2s; }
        .close-btn {
          position: absolute; top: 14px; right: 16px;
          width: 34px; height: 34px; border-radius: 50%;
          background: rgba(30,27,24,0.72);
          backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px);
          border: 1px solid rgba(255,255,255,0.15);
          color: #FFFFFF; cursor: pointer; font-size: 12px; font-weight: 700;
          display: flex; align-items: center; justify-content: center;
          transition: all 0.18s ease; z-index: 100;
          box-shadow: 0 2px 12px rgba(0,0,0,0.35);
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

        .m-price     { display:block; width:100%; text-align:center; font-size:34px; font-weight:800; color:#F79B3D; letter-spacing:-0.6px; }
        .m-price-sub { display:block; width:100%; text-align:center; font-size:11px; color:#7A7A7A; margin-top:2px; margin-bottom:14px; }
        .m-desc      { font-size:14px; color:#5A5A5A; line-height:1.7; text-align:center; margin-bottom:20px; letter-spacing:-0.1px; }

        .divider { height:0.5px; background:rgba(0,0,0,0.1); margin:16px 0; }
        .sec-lbl { font-size:11px; font-weight:700; color:#7A7A7A; letter-spacing:0.08em; text-transform:uppercase; margin-bottom:12px; }

        .nutr { display:grid; grid-template-columns:repeat(4,1fr); gap:8px; margin-bottom:20px; }
        .nc   { background:#FAF7F2; border:0.5px solid rgba(0,0,0,0.07); border-radius:12px; padding:13px 8px; text-align:center; }
        .nc-v { font-size:20px; font-weight:800; color:#F79B3D; letter-spacing:-0.3px; }
        .nc-u { font-size:10px; color:#7A7A7A; margin-top:1px; }
        .nc-l { font-size:10px; color:#5A5A5A; margin-top:3px; font-weight:600; }

        .ings { display:flex; flex-wrap:wrap; gap:6px; margin-bottom:22px; }
        .ing  { padding:6px 13px; border-radius:8px; font-size:12px; color:#2B2B2B; background:#F5F0EA; font-weight:500; transition: all 0.15s ease; cursor:default; }
        .ing:hover { background:#F0E8D8; transform: scale(1.04); }

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
        .ar-btn:hover  { transform:translateY(-2px); box-shadow:0 10px 28px rgba(247,155,61,0.48); filter: brightness(1.05); }
        .ar-btn:active { transform:scale(0.98); }
        .ar-btn-sub { color:rgba(255,255,255,0.75); font-weight:800; }
        .ar-hint { text-align:center; font-size:11px; color:#7A7A7A; margin-top:9px; letter-spacing:-0.1px; }

        /* ─────────── FAB — stacked layout ─────────── */
        .fab-wrap {
          position: fixed;
          bottom: 20px; left: 0; right: 0;
          display: flex; flex-direction: column; align-items: center;
          gap: 10px; padding: 0 12px;
          z-index: 45;
          pointer-events: none;
        }
        .fab-row {
          display: flex; flex-direction: row; justify-content: center; align-items: center;
          gap: 8px; flex-wrap: nowrap;
        }
        @media (max-width: 480px) {
          .fab-wrap { gap: 8px; bottom: 16px; }
          .fab-row { gap: 6px; }
          .waiter-fab { padding: 9px 13px !important; font-size: 12px !important; }
          .cart-fab { padding: 10px 14px !important; font-size: 13px !important; }
          .sma-fab { padding: 10px 16px !important; font-size: 13px !important; }
        }

        .waiter-fab {
          pointer-events: all;
          display: flex; align-items: center; gap: 8px;
          padding: 14px 22px; border-radius: 50px; border: none;
          font-family: 'Inter', sans-serif; font-weight: 700; font-size: 14px;
          cursor: pointer; white-space: nowrap; flex-shrink: 0;
          transition: transform 0.2s, box-shadow 0.2s;
          animation: fadeUp 0.4s ease both;
        }
        .waiter-fab:hover  { transform: translateY(-2px); box-shadow: 0 8px 24px rgba(0,0,0,0.22); }
        .waiter-fab:active { transform: scale(0.96); }
        /* ─────────── CART ─────────── */
        .cart-fab {
          pointer-events: all;
          display: flex; align-items: center; gap: 10px;
          padding: 14px 24px; border-radius: 50px; border: none;
          background: linear-gradient(135deg, #F79B3D, #E05A3A);
          color: #fff;
          font-family: 'Inter', sans-serif; font-weight: 800; font-size: 15px;
          cursor: pointer; white-space: nowrap;
          box-shadow: 0 6px 28px rgba(224,90,58,0.55);
          transition: transform 0.2s, box-shadow 0.2s;
          animation: fadeUp 0.4s ease both;
          position: relative;
          letter-spacing: -0.2px;
        }
        .cart-fab:hover  { transform: translateY(-3px); box-shadow: 0 12px 36px rgba(224,90,58,0.65); }
        .cart-fab:active { transform: scale(0.96); }
        @keyframes cartPop { 0%,100%{transform:scale(1)} 50%{transform:scale(1.06)} }
        .cart-fab-pop { animation: cartPop 0.35s cubic-bezier(0.34,1.56,0.64,1) both; }
        .bill-fab {
          pointer-events: all;
          display: flex; align-items: center; gap: 10px;
          padding: 14px 22px; border-radius: 50px; border: none;
          background: linear-gradient(135deg,#2D8B4E,#1A6B38);
          color: #fff; font-family: 'Inter',sans-serif; font-weight: 700; font-size: 14px;
          cursor: pointer; white-space: nowrap; flex-shrink: 0;
          box-shadow: 0 6px 28px rgba(45,139,78,0.45), 0 2px 8px rgba(0,0,0,0.2);
          transition: transform 0.2s, box-shadow 0.2s;
          animation: fadeUp 0.4s ease both;
          letter-spacing: -0.2px;
          position: relative;
        }
        .bill-fab:hover  { transform: translateY(-3px); box-shadow: 0 12px 36px rgba(45,139,78,0.55); }
        .bill-fab:active { transform: scale(0.96); }
        .bill-price {
          font-size: 13px; font-weight: 700; opacity: 0.85;
          background: rgba(0,0,0,0.18); border-radius: 20px;
          padding: 3px 10px;
        }
        @media (max-width: 480px) {
          .bill-fab { padding: 10px 14px !important; font-size: 13px !important; }
        }
        .cart-price {
          font-size: 13px; font-weight: 700; opacity: 0.85;
          background: rgba(0,0,0,0.18); border-radius: 20px;
          padding: 2px 8px;
        }
        .cart-badge {
          position: absolute; top: -7px; right: -7px;
          width: 22px; height: 22px; border-radius: 50%;
          background: #fff; color: #E05A3A;
          font-size: 12px; font-weight: 900;
          display: flex; align-items: center; justify-content: center;
          border: 2px solid #E05A3A;
          box-shadow: 0 2px 8px rgba(0,0,0,0.2);
        }
        .cart-item-row {
          display: flex; align-items: center; gap: 12px;
          padding: 12px 0; border-bottom: 1px solid var(--divider, rgba(42,31,16,0.07));
        }
        .cart-item-row:last-child { border-bottom: none; }
        .qty-btn {
          width: 28px; height: 28px; border-radius: 50%; border: 1.5px solid var(--divider, rgba(42,31,16,0.15));
          background: var(--bg-elevated, #F7F5F2); color: var(--text-1, #1E1B18);
          font-size: 15px; font-weight: 700; cursor: pointer;
          display: flex; align-items: center; justify-content: center;
          transition: all 0.15s; flex-shrink: 0;
        }
        .qty-btn:hover { border-color: #E05A3A; color: #E05A3A; }

        .sma-fab {
          pointer-events: all;
          display: flex; align-items: center; gap: 8px;
          padding: 14px 28px; border-radius: 50px; border: none;
          background: #F79B3D; color: #FFFFFF;
          font-family: 'Inter', sans-serif; font-weight: 700; font-size: 15px;
          cursor: pointer; white-space: nowrap; letter-spacing: -0.1px;
          box-shadow: 0 6px 24px rgba(247,155,61,0.45), 0 2px 8px rgba(247,155,61,0.25);
          transition: transform 0.28s cubic-bezier(0.34,1.2,0.64,1), box-shadow 0.28s ease, border-color 0.28s ease;
          animation: fadeUp 0.5s 0.3s ease both;
        }
        .sma-fab:hover  { transform: translateY(-3px) scale(1.02); box-shadow: 0 12px 32px rgba(247,155,61,0.55); filter: brightness(1.05); }
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
          animation:slideUp 0.25s cubic-bezier(0.32,0.72,0,1);
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
        .sma-opt:hover  { background:#FFFAF4; border-color:#F79B3D; transform:translateX(3px); filter: brightness(1.01); }
        .sma-opt:active { transform: scale(0.985); filter: brightness(0.97); }
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
        .sma-item:hover { background:#FFFAF4; border-color:#F79B3D; transform:translateX(3px); filter: brightness(1.01); }
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
        #app-root.dm               { background: transparent; }
        .dm .main                  { background: transparent !important; }

        /* ── Sticky header ── */
        .dm .hdr {
          background: rgba(10,8,5,0.55) !important;
          backdrop-filter: saturate(180%) blur(28px) brightness(0.9) !important;
          -webkit-backdrop-filter: saturate(180%) blur(28px) brightness(0.9) !important;
          border-bottom: 1px solid rgba(255,255,255,0.07) !important;
          box-shadow: 0 2px 24px rgba(0,0,0,0.35), 0 1px 0 rgba(255,255,255,0.04) inset !important;
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
          backdrop-filter: blur(12px);
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
          background: rgba(18,14,10,0.82) !important;
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
        .dm .img-skeleton { background: linear-gradient(90deg,#282828 25%,#333 50%,#282828 75%) !important; background-size: 200% 100% !important; }

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
          /* Glassmorphism — transparent dark base so blurred bg shows through */
          background: rgba(20, 15, 10, 0.65) !important;
          backdrop-filter: blur(20px) saturate(180%) !important;
          -webkit-backdrop-filter: blur(20px) saturate(180%) !important;
          border: 2px solid rgba(255, 255, 255, 0.18) !important;
          border-bottom: none !important;
          box-shadow:
            0 -12px 60px rgba(0,0,0,0.6),
            inset 0 1px 0 rgba(255,255,255,0.12),
            inset 0 0 40px 0px rgba(247,155,61,0.04) !important;
          overflow-y: auto !important;
        }
        .dm .sheet::before {
          content: '' !important;
          position: absolute !important; top: 0 !important; left: 8% !important; right: 8% !important; height: 1px !important; z-index: 2 !important;
          background: linear-gradient(90deg, transparent, rgba(255,255,255,0.25), transparent) !important;
          pointer-events: none !important;
        }
        .dm .sheet::after {
          content: '' !important;
          position: absolute !important; top: 26px !important; left: 0 !important; width: 1px !important; height: calc(100% - 26px) !important; z-index: 2 !important;
          background: linear-gradient(180deg, rgba(255,255,255,0.18), transparent) !important;
          pointer-events: none !important;
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
        .dm .sbody         { background:  !important; }
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


        /* Rating section dark mode */
        .dm .rate-section { border-top-color: var(--divider) !important; }
        .dm .rate-label   { color: var(--text-muted) !important; }
        .dm .rate-thanks  { color: var(--text-muted) !important; }
        .dm .rate-count   { color: var(--text-muted) !important; }
        .dm .rate-star-empty { color: rgba(255,255,255,0.2) !important; }

        /* Add to order qty row */
        .dm .qty-row { background: rgba(255,255,255,0.07) !important; }
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


        /* ── Image skeleton loader (Issue 9) ── */
        @keyframes skeletonPulse {
          0%, 100% { opacity: 1; }
          50%       { opacity: 0.45; }
        }
        .img-skeleton {
          position: absolute; inset: 0;
          background: linear-gradient(90deg, #F0E8DE 25%, #F8F2EA 50%, #F0E8DE 75%);
          background-size: 200% 100%;
          animation: skeletonPulse 1.4s ease-in-out infinite;
          transition: opacity 0.3s ease;
          z-index: 0;
        }
        .dm .img-skeleton {
          background: linear-gradient(90deg, #252525 25%, #303030 50%, #252525 75%) !important;
        }
        .img-skeleton.loaded { opacity: 0; pointer-events: none; }
        .c-img img { opacity: 0; transition: opacity 0.35s ease, transform 0.4s cubic-bezier(0.4,0,0.2,1); z-index: 1; position: relative; }
        .c-img img.img-visible { opacity: 1; }

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
           THEME TOGGLE — sky/night style (ref images)
           ───────────────────────────────────── */
        /* ── THEME TOGGLE — exact uiverse.io JustCode14 port ── */
        /* ── Language picker ── */
        .lang-pick {
          display: flex; align-items: center; gap: 3px;
          background: rgba(42,31,16,0.06); border-radius: 20px;
          padding: 3px;
          border: 1px solid rgba(42,31,16,0.08);
          flex-shrink: 0;
        }
        .lang-btn {
          padding: 4px 9px; border-radius: 16px; border: none;
          font-size: 12px; font-weight: 700; cursor: pointer;
          background: transparent; color: rgba(42,31,16,0.45);
          font-family: 'Inter', sans-serif; letter-spacing: 0.02em;
          transition: all 0.18s; line-height: 1.4;
        }
        .lang-btn:hover:not(.on) { color: rgba(42,31,16,0.7); }
        .lang-btn.on {
          background: #1E1B18; color: #FFF5E8;
          box-shadow: 0 1px 6px rgba(30,27,24,0.2);
        }
        .dm .lang-pick {
          background: rgba(255,255,255,0.07) !important;
          border-color: rgba(255,255,255,0.1) !important;
        }
        .dm .lang-btn { color: rgba(255,255,255,0.35) !important; }
        .dm .lang-btn:hover:not(.on) { color: rgba(255,255,255,0.65) !important; }
        .dm .lang-btn.on {
          background: #F79B3D !important;
          color: #1E1B18 !important;
        }

        .theme-toggle {
          font-size: 14px;
          margin-left: 6px; flex-shrink: 0;
          position: relative; display: inline-block;
          width: 4em; height: 2.2em;
          border-radius: 30px;
          box-shadow: 0 0 10px rgba(0,0,0,0.15);
          border: none; padding: 0; cursor: pointer;
          background: none; outline: none;
          vertical-align: middle;
        }
        /* The slider track */
        .tgl-slider {
          position: absolute; cursor: pointer;
          top: 0; left: 0; right: 0; bottom: 0;
          background-color: #00a6ff;
          transition: 0.4s;
          border-radius: 30px;
          overflow: hidden;
        }
        /* Dark mode: charcoal track */
        .dm .tgl-slider { background-color: #2a2a2a; }
        /* The ball — sun in light, moon in dark */
        .tgl-slider:before {
          position: absolute; content: "";
          height: 1.2em; width: 1.2em;
          border-radius: 20px;
          left: 0.5em; bottom: 0.5em;
          transition: 0.4s;
          transition-timing-function: cubic-bezier(0.81, -0.04, 0.38, 1.5);
          /* Light mode: sun — yellow filled circle */
          box-shadow: inset 15px -4px 0px 15px #ffcf48;
          transform: translateX(1.8em);
        }
        /* Dark mode: moon — white inset shadow crescent */
        .dm .tgl-slider:before {
          transform: translateX(0);
          box-shadow: inset 8px -4px 0px 0px #fff;
        }
        /* Stars — hidden in light, visible in dark */
        .tgl-star {
          background-color: #fff;
          border-radius: 50%;
          position: absolute;
          width: 5px; height: 5px;
          transition: all 0.4s;
          opacity: 0;
        }
        .dm .tgl-star { opacity: 1; }
        .tgl-star-1 { left: 2.5em; top: 0.5em; }
        .tgl-star-2 { left: 2.2em; top: 1.2em; }
        .tgl-star-3 { left: 3em;   top: 0.9em; }
        /* Cloud — visible in light, hidden in dark */
        .tgl-cloud {
          width: 3.5em; position: absolute;
          bottom: -1.4em; left: -1.1em;
          opacity: 1; transition: all 0.4s;
        }
        .dm .tgl-cloud { opacity: 0; }



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

        /* Apply card pop animation — no !important so transition still works */
        .card { animation: cardPop 0.45s cubic-bezier(0.34,1.56,0.64,1) both; }
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


        /* ── CircularText ─────────────────────── */
        @keyframes circTextSpin { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }
        .circ-ring {
          position:absolute; inset:0; pointer-events:none;
          animation: circTextSpin 18s linear infinite;
        }

        /* ── ShinyText ────────────────────────── */
        @keyframes shineMove {
          0%   { background-position: -200% center; }
          100% { background-position:  200% center; }
        }
        .shiny-txt {
          background: linear-gradient(90deg, currentColor 30%, rgba(255,255,255,0.92) 50%, currentColor 70%);
          background-size: 200% auto;
          -webkit-background-clip: text;
          background-clip: text;
          -webkit-text-fill-color: transparent;
          animation: shineMove 7s linear infinite;
          display: inline-block;
        }


        /* ── Plasma Background (dark mode only) ─────────────── */
        @keyframes plasma1 {
          0%   { transform: translate(0%,   0%)   scale(1);    }
          33%  { transform: translate(8%,  -12%)  scale(1.15); }
          66%  { transform: translate(-6%,  10%)  scale(0.92); }
          100% { transform: translate(0%,   0%)   scale(1);    }
        }
        @keyframes plasma2 {
          0%   { transform: translate(0%,   0%)   scale(1);    }
          40%  { transform: translate(-10%, 8%)   scale(1.2);  }
          80%  { transform: translate(6%,  -6%)   scale(0.88); }
          100% { transform: translate(0%,   0%)   scale(1);    }
        }
        @keyframes plasma3 {
          0%   { transform: translate(0%,   0%)   scale(1);    }
          50%  { transform: translate(12%, 14%)   scale(1.1);  }
          100% { transform: translate(0%,   0%)   scale(1);    }
        }
        @keyframes plasma4 {
          0%   { transform: translate(0%,   0%)   scale(1);    }
          60%  { transform: translate(-8%, -10%)  scale(1.18); }
          100% { transform: translate(0%,   0%)   scale(1);    }
        }
        .plasma-bg {
          display: none;
          position: fixed; inset: 0; z-index: 0; will-change: transform;
          overflow: hidden; pointer-events: none;
          background: #0D0B08;
        }
        .dm .plasma-bg { display: block; }
        .plasma-blob {
          position: absolute; border-radius: 50%;
          filter: blur(80px); opacity: 0.45; mix-blend-mode: screen;
        }
        .pb1 {
          width: 70vw; height: 70vw; top: -20%; left: -15%;
          background: radial-gradient(circle, #F79B3D 0%, #E05A3A 50%, transparent 75%);
          animation: plasma1 18s ease-in-out infinite;
        }
        .pb2 {
          width: 55vw; height: 55vw; top: 30%; right: -10%;
          background: radial-gradient(circle, #FF6B35 0%, #C8370A 50%, transparent 75%);
          animation: plasma2 14s ease-in-out infinite;
        }
        .pb3 {
          width: 60vw; height: 60vw; bottom: -20%; left: 20%;
          background: radial-gradient(circle, #FFB347 0%, #F79B3D 45%, transparent 75%);
          animation: plasma3 16s ease-in-out infinite;
        }
        .pb4 {
          width: 40vw; height: 40vw; top: 10%; right: 25%;
          background: radial-gradient(circle, #FF8C42 0%, #D4500A 55%, transparent 75%);
          animation: plasma4 20s ease-in-out infinite;
        }
        .plasma-overlay {
          position: absolute; inset: 0;
          background: rgba(8,6,4,0.62);
        }

        /* ── Clean Glow Border on visible cards ── */
        .card.shine-on {
          animation: cardPop 0.45s cubic-bezier(0.34,1.56,0.64,1) both !important;
          border: 1.5px solid rgba(221,132,72,0.7) !important;
          box-shadow:
            0 1px 3px rgba(0,0,0,0.06),
            0 4px 16px rgba(0,0,0,0.07),
            0 0 14px rgba(221,132,72,0.25),
            0 0 4px rgba(221,132,72,0.15) !important;
        }

        /* ── ElectricBorder ───────────────────── */
        @keyframes electricSpin { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }
        .elec-wrap { position:relative; }
        .elec-ring {
          position:absolute; inset:-2px; border-radius:inherit;
          background: conic-gradient(
            from 0deg,
            transparent 0deg,
            #F79B3D 50deg,
            #FFD056 110deg,
            #E05A3A 170deg,
            transparent 230deg,
            transparent 290deg,
            #F79B3D 340deg,
            transparent 360deg
          );
          animation: electricSpin 3.2s linear infinite;
          z-index: 0;
        }
        .elec-inner {
          position:relative; z-index:1;
        }

        /* ── GradualBlur on category scroll ───── */
        .cats-outer {
          -webkit-mask-image: linear-gradient(to right, transparent 0px, black 32px, black calc(100% - 32px), transparent 100%);
          mask-image: linear-gradient(to right, transparent 0px, black 32px, black calc(100% - 32px), transparent 100%);
        }

      `}</style>

        {/* ─── HEADER ─── */}
        <header className="hdr" ref={hdrRef}>
          <div className="hdr-inner">
            <div className="hdr-top">
              {/* CircularText around restaurant logo */}
              <div className="circ-wrap" style={{ position: 'relative', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {/* Spinning ring of text */}
                <div className="circ-ring">
                  {(() => {
                    const txt = '• AR MENU • EXPLORE • ';
                    const chars = txt.split('');
                    const radius = 36;
                    return chars.map((ch, i) => {
                      const angle = (i * 360) / chars.length;
                      const rad = (angle * Math.PI) / 180;
                      const x = Math.sin(rad) * radius;
                      const y = -Math.cos(rad) * radius;
                      return (
                        <span key={i} style={{
                          position: 'absolute', left: `calc(50% + ${x}px)`, top: `calc(50% + ${y}px)`,
                          transform: `translate(-50%,-50%) rotate(${angle}deg)`,
                          fontSize: 8, fontWeight: 800, letterSpacing: 0.5, userSelect: 'none',
                          color: darkMode ? 'rgba(247,155,61,0.7)' : 'rgba(247,155,61,0.85)',
                          lineHeight: 1,
                        }}>{ch}</span>
                      );
                    });
                  })()}
                </div>
                {/* Logo sits in center */}
                <div className="r-logo" style={{ position: 'relative', zIndex: 1, width: 44, height: 44 }}>🍽️</div>
              </div>
              {/* Name + subtitle — flex:1 so it takes all available space */}
              <div className="r-name-wrap">
                <div className="r-name">{restaurant.name}</div>
                <div className="r-sub">{t.sub}</div>
              </div>
              {/* Theme toggle */}
              <button className="theme-toggle" onClick={() => setDarkMode(d => { const next = !d; if (typeof window !== "undefined") localStorage.setItem("ar_theme", next ? "dark" : "light"); return next; })} title={darkMode ? "Switch to Light" : "Switch to Dark"} aria-label="Toggle theme">
                <span className="tgl-slider">
                  <span className="tgl-star tgl-star-1" />
                  <span className="tgl-star tgl-star-2" />
                  <span className="tgl-star tgl-star-3" />
                  <svg viewBox="0 0 16 16" className="tgl-cloud">
                    <path transform="matrix(.77976 0 0 .78395-299.99-418.63)" fill="#fff" d="m391.84 540.91c-.421-.329-.949-.524-1.523-.524-1.351 0-2.451 1.084-2.485 2.435-1.395.526-2.388 1.88-2.388 3.466 0 1.874 1.385 3.423 3.182 3.667v.034h12.73v-.006c1.775-.104 3.182-1.584 3.182-3.395 0-1.747-1.309-3.186-2.994-3.379.007-.106.011-.214.011-.322 0-2.707-2.271-4.901-5.072-4.901-2.073 0-3.856 1.202-4.643 2.925" />
                  </svg>
                </span>
              </button>
              {/* ── Right group: AR badge + language picker — pushed to end via margin-left:auto ── */}
              <div className="hdr-right">
                {arCount > 0 && (
                  <div className="ar-badge"><span className="ar-dot" /><span className="shiny-txt">{t.arLive}</span></div>
                )}
                {/* Language picker */}
                <div className="lang-pick">
                  {[['en', 'EN'], ['ta', 'த'], ['hi', 'ह']].map(([code, label]) => (
                    <button key={code} className={`lang-btn${lang === code ? ' on' : ''}`} onClick={() => setLanguage(code)}>
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            {/* Category tabs */}
            <div className="cats-outer">
              <div className="cats-scroll">
                {cats.map(cat => (
                  <button key={cat} className={`cat-pill${activeCat === cat ? ' on' : ''}`} data-label={cat} style={{ animationDelay: `${cats.indexOf(cat) * 0.04}s` }} onClick={() => setActiveCat(cat)}>
                    <span className="cat-emoji">{catIcon(cat)}</span>
                    {cat === 'All' ? t.all : cat}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </header>

        <main className="main">

          {/* ── Offers Strip ── */}
          {/* Uses activeOffers (date-filtered) so the strip only shows offers
              that are live today. Counts + iteration stay in sync with the
              per-item offer badges that sit on dish cards. */}
          {activeOffers.length > 0 && (
            <div style={{ marginBottom: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 10, paddingInline: 2 }}>
                <span style={{ fontSize: 13 }}>🏷️</span>
                <span style={{ fontFamily: 'Poppins,sans-serif', fontWeight: 700, fontSize: 12, color: darkMode ? '#F79B3D' : '#A06010', letterSpacing: '0.04em', textTransform: 'uppercase' }}>Today&apos;s Offers</span>
                <span style={{ fontSize: 11, color: darkMode ? 'rgba(255,245,232,0.3)' : 'rgba(42,31,16,0.3)', fontWeight: 500 }}>{activeOffers.length} active</span>
              </div>
              <div style={{ display: 'flex', gap: 12, overflowX: 'auto', overflowY: 'hidden', paddingBottom: 8, paddingTop: 2, WebkitOverflowScrolling: 'touch', scrollbarWidth: 'none' }}>
                {activeOffers.map((offer, i) => {
                  const linked = offer.linkedItemId ? enrichedItems.find(m => m.id === offer.linkedItemId) : null;
                  const isClickable = !!linked;
                  const savePct = offer.discountedPrice && linked?.price
                    ? Math.round(((linked.price - offer.discountedPrice) / linked.price) * 100) : null;
                  return (
                    <div key={offer.id || i}
                      onClick={() => { if (linked) openItem(linked); }}
                      style={{
                        flexShrink: 0, width: 220, borderRadius: 20, overflow: 'hidden', cursor: isClickable ? 'pointer' : 'default',
                        background: darkMode ? '#1A1410' : '#FFFFFF',
                        border: `1.5px solid ${darkMode ? 'rgba(247,155,61,0.25)' : 'rgba(247,155,61,0.4)'}`,
                        boxShadow: darkMode ? '0 4px 24px rgba(0,0,0,0.4)' : '0 4px 20px rgba(42,31,16,0.1)',
                        transition: 'transform 0.18s, box-shadow 0.18s',
                      }}
                      onMouseOver={e => { e.currentTarget.style.transform = 'translateY(-3px)'; e.currentTarget.style.boxShadow = darkMode ? '0 10px 32px rgba(0,0,0,0.5)' : '0 10px 30px rgba(42,31,16,0.16)'; }}
                      onMouseOut={e => { e.currentTarget.style.transform = ''; e.currentTarget.style.boxShadow = darkMode ? '0 4px 24px rgba(0,0,0,0.4)' : '0 4px 20px rgba(42,31,16,0.1)'; }}>
                      {/* Image area */}
                      <div style={{ height: 120, overflow: 'hidden', position: 'relative', background: darkMode ? '#2A2018' : '#F5EDE0' }}>
                        {linked?.imageURL ? (
                          <img src={linked.imageURL} alt={linked.name} loading="lazy" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        ) : (
                          <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 40 }}>🏷️</div>
                        )}
                        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to bottom, rgba(0,0,0,0.08) 0%, rgba(0,0,0,0.55) 100%)' }} />
                        {savePct && (
                          <div style={{ position: 'absolute', top: 10, left: 10, background: 'linear-gradient(135deg,#E05A3A,#C0381A)', color: '#fff', fontSize: 11, fontWeight: 900, padding: '4px 10px', borderRadius: 20, letterSpacing: '0.02em', boxShadow: '0 2px 8px rgba(224,90,58,0.5)' }}>
                            {savePct}% OFF
                          </div>
                        )}
                        {/* Item name overlay */}
                        {linked && (
                          <div style={{ position: 'absolute', bottom: 8, left: 10, right: 10, fontSize: 12, fontWeight: 700, color: '#fff', textShadow: '0 1px 4px rgba(0,0,0,0.6)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{linked.name}</div>
                        )}
                      </div>
                      {/* Content */}
                      <div style={{ padding: '12px 14px 14px' }}>
                        <div style={{ fontFamily: 'Poppins,sans-serif', fontWeight: 800, fontSize: 14, color: darkMode ? '#FFF5E8' : '#1E1B18', marginBottom: 4, lineHeight: 1.3 }}>
                          {offer.title}
                        </div>
                        {offer.description && (
                          <div style={{ fontSize: 12, color: darkMode ? 'rgba(255,245,232,0.5)' : 'rgba(42,31,16,0.55)', marginBottom: 10, lineHeight: 1.4 }}>
                            {offer.description}
                          </div>
                        )}
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
                          <div style={{ display: 'flex', alignItems: 'baseline', gap: 5 }}>
                            {offer.discountedPrice && (
                              <span style={{ fontFamily: 'Poppins,sans-serif', fontWeight: 900, fontSize: 18, color: '#2D8B4E' }}>₹{offer.discountedPrice}</span>
                            )}
                            {offer.discountedPrice && linked?.price && (
                              <span style={{ fontSize: 12, color: darkMode ? 'rgba(255,245,232,0.3)' : 'rgba(42,31,16,0.35)', textDecoration: 'line-through' }}>₹{linked.price}</span>
                            )}
                          </div>
                          {isClickable && (
                            <div style={{ fontSize: 11, fontWeight: 700, color: '#fff', background: 'linear-gradient(135deg,#F79B3D,#E05A3A)', padding: '5px 10px', borderRadius: 10, whiteSpace: 'nowrap', boxShadow: '0 2px 8px rgba(224,90,58,0.35)' }}>View →</div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* AR strip */}
          {arCount > 0 && (
            <div className="ar-strip">
              <span className="ar-strip-icon">🥽</span>
              <div>
                <div className="ar-strip-text">{arCount} dish{arCount !== 1 ? 'es' : ''} available in AR</div>
                <div className="ar-strip-sub">No app needed · Tap a card, then View in AR</div>
              </div>
              <div className="ar-strip-chip">TRY IT</div>
            </div>
          )}

          {/* ── Combos Section ───────────────────────────────────── */}
          {(combos || []).filter(c => c.isActive !== false).length > 0 && activeCat === 'All' && (
            <div className="combos-section-wrap" style={{ marginBottom: 28 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
                <span style={{ fontSize: 18 }}>🍱</span>
                <span style={{ fontFamily: 'Poppins,sans-serif', fontWeight: 700, fontSize: 16, color: darkMode ? '#F79B3D' : '#A06010' }}><span className="shiny-txt">Combo Deals</span></span>
                <span style={{ padding: '3px 10px', borderRadius: 20, background: darkMode ? 'rgba(247,155,61,0.2)' : 'rgba(247,155,61,0.15)', color: darkMode ? '#F4C050' : '#A06010', fontSize: 11, fontWeight: 700, border: '1px solid rgba(247,155,61,0.3)' }}>Special Offers</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12, filter: 'url(#card-turb)' }}>
                {(combos || []).filter(c => c.isActive !== false).map(combo => {
                  const comboItems = (combo.itemIds || []).map(id => (menuItems || []).find(i => i.id === id)).filter(Boolean);
                  return (
                    <div key={combo.id} onClick={() => setSelectedCombo({ ...combo, resolvedItems: comboItems })}
                      style={{ borderRadius: 18, border: '1.5px solid rgba(247,155,61,0.35)', background: darkMode ? 'linear-gradient(135deg,rgba(18,14,10,0.80),rgba(28,20,10,0.80))' : 'linear-gradient(135deg,rgba(255,252,248,0.98),rgba(250,245,235,0.98))', backdropFilter: darkMode ? 'blur(12px)' : 'none', WebkitBackdropFilter: darkMode ? 'blur(12px)' : 'none', padding: '18px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 14, flexWrap: 'wrap', cursor: 'pointer', transition: 'transform 0.18s, box-shadow 0.18s' }}
                      onMouseOver={e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 8px 24px rgba(247,155,61,0.2)'; }}
                      onMouseOut={e => { e.currentTarget.style.transform = ''; e.currentTarget.style.boxShadow = ''; }}>
                      <div style={{ flex: 1, minWidth: 200 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5, flexWrap: 'wrap' }}>
                          <span style={{ fontFamily: 'Poppins,sans-serif', fontWeight: 700, fontSize: 15, color: darkMode ? 'var(--text-1)' : '#1E1B18' }}>{combo.name}</span>
                          {combo.tag && <span style={{ padding: '2px 9px', borderRadius: 20, background: 'rgba(247,155,61,0.25)', color: darkMode ? '#F4C050' : '#A06010', fontSize: 11, fontWeight: 700 }}>{combo.tag}</span>}
                        </div>
                        {combo.description && <div style={{ fontSize: 12, color: darkMode ? 'rgba(255,245,232,0.55)' : 'rgba(42,31,16,0.55)', marginBottom: 8 }}>{combo.description}</div>}
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                          {comboItems.map(item => (
                            <span key={item.id} style={{ padding: '3px 9px', borderRadius: 20, background: darkMode ? 'rgba(255,245,232,0.1)' : 'rgba(42,31,16,0.06)', fontSize: 12, color: darkMode ? 'rgba(255,245,232,0.7)' : 'rgba(42,31,16,0.65)', fontWeight: 500 }}>{item.name}</span>
                          ))}
                        </div>
                        <div style={{ fontSize: 11, color: darkMode ? 'rgba(247,155,61,0.7)' : '#A06010', marginTop: 8, fontWeight: 600 }}>Tap to view & add →</div>
                      </div>
                      <div style={{ textAlign: 'right', flexShrink: 0 }}>
                        <div style={{ fontFamily: 'Poppins,sans-serif', fontWeight: 800, fontSize: 22, color: '#E05A3A' }}>₹{combo.comboPrice}</div>
                        {combo.originalPrice > combo.comboPrice && (
                          <div style={{ fontSize: 12, color: darkMode ? 'rgba(255,245,232,0.35)' : 'rgba(42,31,16,0.35)', textDecoration: 'line-through' }}>₹{combo.originalPrice}</div>
                        )}
                        {combo.savings > 0 && (
                          <div style={{ fontSize: 12, fontWeight: 700, color: '#2D8B4E', marginTop: 2 }}>Save ₹{combo.savings}</div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Grid */}
          {filtered.length === 0 ? (
            <div className="empty">
              <div style={{ fontSize: 44, marginBottom: 10 }}>🥢</div>
              <p style={{ fontWeight: 600, fontSize: 14, color: '#9A9A9A' }}>No items in this category</p>
            </div>
          ) : (
            <div className="grid">
              {filtered.map((item, idx) => (
                <button key={item.id} className="card" style={{ animationDelay: `${idx * 0.05}s`, opacity: (item.soldOut || item.isOutOfStock) ? 0.65 : 1, cursor: (item.soldOut || item.isOutOfStock) ? 'not-allowed' : 'pointer' }} onClick={() => { if (!item.soldOut && !item.isOutOfStock) openItem(item); }}>
                  <div className="c-img" style={{ position: 'relative' }}>
                    <div className={`img-skeleton${imgLoaded[item.id] ? ' loaded' : ''}`} />
                    <img src={imgSrc(item)} alt={item.name} loading="lazy" decoding="async"
                      className={imgLoaded[item.id] ? 'img-visible' : ''}
                      style={{ filter: item.soldOut ? 'grayscale(60%)' : 'none' }}
                      onLoad={() => setImgLoaded(s => ({ ...s, [item.id]: true }))}
                      onError={() => { setImgErr(e => ({ ...e, [item.id]: true })); setImgLoaded(s => ({ ...s, [item.id]: true })); }} />
                    {item.soldOut && (
                      <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.45)', borderRadius: 'inherit' }}>
                        <span style={{ background: '#C04A28', color: '#fff', fontSize: 11, fontWeight: 800, padding: '4px 10px', borderRadius: 20, letterSpacing: '0.06em' }}>SOLD OUT</span>
                      </div>
                    )}
                    {item.isOutOfStock && (
                      <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.55)', borderRadius: 'inherit' }}>
                        <div style={{ width: 82, height: 82, borderRadius: '50%', border: '3px solid #FF5A3A', display: 'flex', alignItems: 'center', justifyContent: 'center', transform: 'rotate(-18deg)', background: 'rgba(107,32,32,0.25)', flexDirection: 'column', gap: 1 }}>
                          <span style={{ color: '#FF5A3A', fontSize: 8, fontWeight: 900, letterSpacing: '0.12em', lineHeight: 1.2, textAlign: 'center' }}>OUT OF</span>
                          <span style={{ color: '#FF5A3A', fontSize: 8, fontWeight: 900, letterSpacing: '0.12em', lineHeight: 1.2 }}>STOCK</span>
                        </div>
                      </div>
                    )}
                    {!item.soldOut && item.modelURL && (
                      <span className="c-ar-pill">
                        <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                          <path d="M12 2L2 7l10 5 10-5-10-5z" /><path d="M2 17l10 5 10-5" /><path d="M2 12l10 5 10-5" />
                        </svg>
                        AR
                      </span>
                    )}
                    {typeof item.isVeg === 'boolean' && <span className={`veg-ind ${item.isVeg ? 'v' : 'nv'}`} />}
                    {!item.soldOut && item.offerBadge && item.offerLabel && (
                      <div className="c-ribbon" style={{ background: item.offerColor || '#F79B3D' }}>🏷 {item.offerLabel}</div>
                    )}
                  </div>
                  <div className="c-body">
                    {(item.isPopular || item.isFeatured) && (
                      <div className="c-badges">
                        {item.isFeatured && <span className="c-badge c-badge-feat">{t.featured}</span>}
                        {item.isPopular && <span className="c-badge c-badge-pop">{t.popular}</span>}
                      </div>
                    )}
                    <div className="c-name">{iN(item)}</div>

                    {item.soldOut ? (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, margin: '6px 0' }}>
                        <span style={{ fontSize: 11, fontWeight: 800, color: '#C04A28', background: 'rgba(192,74,40,0.1)', border: '1px solid rgba(192,74,40,0.25)', borderRadius: 20, padding: '3px 10px', letterSpacing: '0.04em' }}>
                          {t.soldOut}
                        </span>
                      </div>
                    ) : (
                      <div className="c-price-row">
                        {item.offerPrice != null ? (
                          <>
                            <span className="c-price" style={{ color: '#E05A3A', fontWeight: 800 }}>₹{item.offerPrice}</span>
                            <span style={{ fontSize: 11, color: darkMode ? 'rgba(255,245,232,0.35)' : 'rgba(42,31,16,0.35)', textDecoration: 'line-through', marginLeft: 4 }}>₹{item.price}</span>
                          </>
                        ) : (
                          item.price && <CardPrice price={item.price} className="c-price" />
                        )}
                        {item.calories && <span className="c-cal">{item.calories} kcal</span>}
                        {item.ratingCount > 0 && (
                          <span style={{ fontSize: 11, color: '#F79B3D', fontWeight: 700, marginLeft: 'auto', whiteSpace: 'nowrap' }}>
                            ★ {item.ratingAvg?.toFixed(1)}
                            <span style={{ color: 'rgba(42,31,16,0.35)', fontWeight: 400 }}> ({item.ratingCount})</span>
                          </span>
                        )}
                      </div>
                    )}

                    {!item.soldOut && (item.spiceLevel && item.spiceLevel !== 'None' || item.prepTime) && (
                      <div className="c-meta">
                        {item.spiceLevel && item.spiceLevel !== 'None' && SPICE_MAP[item.spiceLevel] && (
                          <span className="c-spice-chip" style={{ background: SPICE_MAP[item.spiceLevel].bg, color: SPICE_MAP[item.spiceLevel].color }}>
                            {SPICE_MAP[item.spiceLevel].dot} {SPICE_MAP[item.spiceLevel].label}
                          </span>
                        )}
                        {item.prepTime && <span className="c-prep">⏱ {item.prepTime}</span>}
                      </div>
                    )}
                    {!item.soldOut && item.modelURL && (
                      <div className="c-ar-cta">
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                          <path d="M12 2L2 7l10 5 10-5-10-5z" /><path d="M2 17l10 5 10-5" /><path d="M2 12l10 5 10-5" />
                        </svg>
                        {t.viewAR}
                      </div>
                    )}
                  </div>
                </button>
              ))}
            </div>
          )}
        </main>

        {/* ─── FABs: stacked layout ─── */}
        {!selectedItem && !smaOpen && (
          <div className="fab-wrap">
            {/* Top row: My Bill (only after order placed) + Cart */}
            {(placedOrder || cartTotal > 0) && (
              <div className="fab-row">
                {/* Phase F redesign — when a takeaway order is still in
                    awaiting_payment, the FAB swaps from "Order Status"
                    (which would show a kitchen progress bar that's
                    misleading because the kitchen hasn't started yet)
                    to a "Payment" CTA that reopens the payment step.
                    Without this the customer had no way back to the
                    payment screen after closing it. */}
                {placedOrder && !cartOpen && liveOrderStatus === 'awaiting_payment' && placedOrder.orderType === 'takeaway' && (
                  <button
                    className="bill-fab status-fab"
                    onClick={() => { setCartOpen(true); setOrderStep('payment'); }}
                    style={{ background: '#F79B3D', borderColor: '#F79B3D', color: '#1E1B18' }}>
                    <span style={{
                      width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
                      background: '#1E1B18',
                      animation: 'fab-pulse-dot 1.4s ease-in-out infinite',
                    }} />
                    <span style={{ fontSize: 16 }}>💳</span>
                    <span>Payment</span>
                  </button>
                )}

                {placedOrder && !cartOpen && liveOrderStatus !== 'awaiting_payment' && liveOrderStatus !== 'cancelled' && (
                  <button
                    className={`bill-fab status-fab${liveOrderStatus === 'ready' ? ' status-fab-ready' : ''}`}
                    onClick={() => { setCartOpen(true); setOrderStep('success'); }}
                    style={{ background: liveOrderStatus === 'ready' ? '#2D8B4E' : undefined, borderColor: liveOrderStatus === 'ready' ? '#2D8B4E' : undefined }}>
                    {/* Phase B.3 — live status dot. Color matches the current
                        kitchen state so the customer can glance and know.
                        Hidden once the order is served (no live state to track). */}
                    {liveOrderStatus && liveOrderStatus !== 'served' && (
                      <span style={{
                        width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
                        background: liveOrderStatus === 'ready'     ? '#FFFFFF'
                                   : liveOrderStatus === 'preparing' ? '#4A80C0'
                                   :                                   '#F79B3D',
                        animation: 'fab-pulse-dot 1.4s ease-in-out infinite',
                        boxShadow: liveOrderStatus === 'ready'
                          ? '0 0 0 0 rgba(255,255,255,0.5)'
                          : '0 0 0 0 rgba(247,155,61,0.5)',
                      }} />
                    )}
                    <span style={{ fontSize: 16 }}>
                      {liveOrderStatus === 'ready' ? '🎉' : liveOrderStatus === 'preparing' ? '🍳' : liveOrderStatus === 'served' ? '✅' : '⏳'}
                    </span>
                    <span>{liveOrderStatus === 'ready' ? 'Order Ready!' : liveOrderStatus === 'preparing' ? 'Preparing…' : liveOrderStatus === 'served' ? 'Served!' : 'Order Status'}</span>
                  </button>
                )}

                {/* My Bill: only useful for dine-in (running tab) and
                    once payment is confirmed. Hide for takeaway-
                    awaiting-payment because there's nothing to bill yet
                    — payment IS the bill. */}
                {placedOrder && !cartOpen && liveOrderStatus !== 'awaiting_payment' && liveOrderStatus !== 'cancelled' && (
                  <button className="bill-fab" onClick={() => setBillOpen(true)}>
                    <span style={{ fontSize: 16 }}>🧾</span>
                    <span>My Bill</span>
                  </button>
                )}
                {cartTotal > 0 && (
                  <button className="cart-fab" onClick={() => setCartOpen(true)}>
                    <span style={{ fontSize: 16 }}>🛒</span>
                    <span>View Order · {cartTotal} item{cartTotal !== 1 ? 's' : ''}</span>
                    <div className="cart-badge">{cartTotal}</div>
                  </button>
                )}
              </div>
            )}
            {/* Phase L — PWA install prompt banner.
                Appears ABOVE the FAB row when the browser has decided
                the page is install-worthy AND the diner hasn't dismissed
                it. One tap on "Save" fires the native install dialog;
                "Not now" hides the banner for the rest of the device's
                lifetime (localStorage flag).
                We deliberately keep it small + dismissible — for a
                customer who's eating, an aggressive prompt is friction. */}
            {installDeferred && !installDismissed && (
              <div style={{
                position: 'relative',
                marginBottom: 10,
                padding: '12px 14px',
                background: darkMode ? 'rgba(255,255,255,0.05)' : '#fff',
                border: `1.5px solid ${darkMode ? 'rgba(255,255,255,0.10)' : 'rgba(42,31,16,0.10)'}`,
                borderRadius: 14,
                boxShadow: darkMode ? '0 4px 16px rgba(0,0,0,0.3)' : '0 4px 16px rgba(0,0,0,0.08)',
                display: 'flex', alignItems: 'center', gap: 10,
                fontFamily: 'Inter, sans-serif',
              }}>
                <div style={{ fontSize: 22, lineHeight: 1, flexShrink: 0 }}>📱</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{
                    fontSize: 13, fontWeight: 700,
                    color: darkMode ? '#FFF5E8' : '#1E1B18',
                    marginBottom: 1, letterSpacing: '-0.1px',
                  }}>
                    Save menu to home screen
                  </div>
                  <div style={{
                    fontSize: 11,
                    color: darkMode ? 'rgba(255,245,232,0.55)' : 'rgba(42,31,16,0.55)',
                    lineHeight: 1.35,
                  }}>
                    Open it next visit with one tap, no QR scan needed.
                  </div>
                </div>
                <button
                  onClick={triggerInstall}
                  style={{
                    flexShrink: 0,
                    padding: '8px 14px', borderRadius: 9,
                    background: '#F79B3D', color: '#1E1B18',
                    border: 'none', cursor: 'pointer',
                    fontFamily: 'Inter, sans-serif',
                    fontSize: 12, fontWeight: 700, letterSpacing: '0.01em',
                  }}
                >
                  Save
                </button>
                <button
                  onClick={dismissInstall}
                  aria-label="Dismiss"
                  style={{
                    flexShrink: 0,
                    width: 24, height: 24, padding: 0,
                    background: 'transparent', border: 'none', cursor: 'pointer',
                    color: darkMode ? 'rgba(255,245,232,0.45)' : 'rgba(42,31,16,0.4)',
                    fontSize: 18, lineHeight: 1,
                  }}
                >
                  ×
                </button>
              </div>
            )}

            {/* Bottom row: Call Waiter + Help Me Choose */}
            <div className="fab-row">
              {waiterCallsEnabled && (
                <button className="waiter-fab" onClick={() => setWaiterModal(true)}
                  style={{ background: darkMode ? '#2A2520' : '#fff', border: `1.5px solid ${darkMode ? 'rgba(255,255,255,0.1)' : 'rgba(42,31,16,0.12)'}`, boxShadow: darkMode ? '0 4px 20px rgba(0,0,0,0.4)' : '0 4px 20px rgba(0,0,0,0.14)', color: darkMode ? '#FFF5E8' : '#1E1B18' }}>
                  <span style={{ fontSize: 16 }}>🔔</span>
                  <span>{t.needHelp}</span>
                </button>
              )}
              <button className="sma-fab" onClick={openSMA}>
                <span className="sma-fab-icon">✨</span>
                {t.helpChoose}
              </button>
            </div>
          </div>
        )}

        {/* ─── ITEM MODAL ─── */}
        {selectedItem && (
          <SwipeableSheet onClose={closeItem} darkMode={darkMode}>
            <div className="sheet">
              <div className="handle-row"><div className="handle" /></div>
              <button className="close-btn" onClick={closeItem}>✕</button>
              {!showAR && (
                <div className="m-hero">
                  <img src={imgSrc(selectedItem)} alt={selectedItem.name} loading="lazy" decoding="async"
                    onError={() => setImgErr(e => ({ ...e, [selectedItem.id]: true }))} />
                  {selectedItem.offerBadge && selectedItem.offerLabel && (
                    <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, padding: '7px 14px', background: selectedItem.offerColor || '#F79B3D', color: '#fff', fontSize: 12, fontWeight: 700, textAlign: 'center' }}>
                      🏷 {selectedItem.offerLabel}
                    </div>
                  )}
                </div>
              )}
              <div className="sbody">
                <h2 className="m-title">{iN(selectedItem)}</h2>
                <div className="m-tags">
                  {selectedItem.category && <span className="tag tag-cat">{selectedItem.category}</span>}
                  {typeof selectedItem.isVeg === 'boolean' && <span className={selectedItem.isVeg ? 'tag tag-veg' : 'tag tag-nv'}>{selectedItem.isVeg ? '● Veg' : '● Non-Veg'}</span>}
                  {selectedItem.isPopular && <span className="tag tag-pop">{t.popular}</span>}
                </div>
                {(selectedItem.prepTime || (selectedItem.spiceLevel && selectedItem.spiceLevel !== 'None')) && (
                  <div className="m-pills">
                    {selectedItem.prepTime && <span className="m-pill">⏱ {selectedItem.prepTime}</span>}
                    {selectedItem.spiceLevel && selectedItem.spiceLevel !== 'None' && SPICE_MAP[selectedItem.spiceLevel] && (
                      <span className="m-pill" style={{ background: SPICE_MAP[selectedItem.spiceLevel].bg, color: SPICE_MAP[selectedItem.spiceLevel].color }}>
                        {SPICE_MAP[selectedItem.spiceLevel].dot} {selectedItem.spiceLevel}
                      </span>
                    )}
                  </div>
                )}
                {selectedItem.offerPrice != null ? (
                  <div style={{ marginBottom: 4 }}>
                    <span style={{ fontFamily: 'Poppins,sans-serif', fontWeight: 800, fontSize: 26, color: '#E05A3A' }}>₹{selectedItem.offerPrice}</span>
                    <span style={{ fontSize: 14, color: darkMode ? 'rgba(255,245,232,0.4)' : 'rgba(42,31,16,0.4)', textDecoration: 'line-through', marginLeft: 8 }}>₹{selectedItem.price}</span>
                    <span style={{ fontSize: 12, fontWeight: 700, color: '#2D8B4E', marginLeft: 8 }}>Save ₹{selectedItem.price - selectedItem.offerPrice}</span>
                    <div className="m-price-sub">{t.perServing}</div>
                  </div>
                ) : selectedItem.price && (
                  <><PriceCounter key={selectedItem.id} price={selectedItem.price} className="m-price" animate={true} /><div className="m-price-sub">{t.perServing}</div></>
                )}
                {iD(selectedItem) && <p className="m-desc">{iD(selectedItem)}</p>}
                {(selectedItem.calories || selectedItem.protein || selectedItem.carbs || selectedItem.fats) && (<>
                  <div className="divider" />
                  <div className="sec-lbl">{t.nutrition}</div>
                  <div className="nutr">
                    {[{ l: 'Calories', v: selectedItem.calories, u: 'kcal' }, { l: 'Protein', v: selectedItem.protein, u: 'g' }, { l: 'Carbs', v: selectedItem.carbs, u: 'g' }, { l: 'Fats', v: selectedItem.fats, u: 'g' }]
                      .filter(n => n.v).map(n => (<div key={n.l} className="nc"><div className="nc-v">{n.v}</div><div className="nc-u">{n.u}</div><div className="nc-l">{n.l}</div></div>))}
                  </div>
                </>)}
                {selectedItem.ingredients?.length > 0 && (<>
                  <div className="sec-lbl">{t.ingredients}</div>
                  <div className="ings">{selectedItem.ingredients.map(ing => <span key={ing} className="ing">{ing}</span>)}</div>
                </>)}
                {!showAR && selectedItem.modelURL && (<>
                  <div className="divider" />
                  <button className="ar-btn" onClick={() => { setShowAR(true); handleARLaunch(); }}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 2L2 7l10 5 10-5-10-5z" /><path d="M2 17l10 5 10-5" /><path d="M2 12l10 5 10-5" /></svg>
                    {t.viewAR} — <span className="ar-btn-sub">{t.viewARSub}</span>
                  </button>
                  <div className="ar-hint">{t.arHint}</div>
                </>)}
                {showAR && <ARViewerEmbed modelURL={selectedItem.modelURL} itemName={selectedItem.name} onARLaunch={handleARLaunch} />}

                {/* ── Modifiers: variants (required pick-one) + addOns (optional multi) ──
                    Shown only if the item defines them. Each click computes an
                    effective price; Add-to-cart creates a distinct line per combo. */}
                {((selectedItem.variants?.length || 0) > 0 || (selectedItem.addOns?.length || 0) > 0) && (
                  <div style={{ margin: '14px 0 4px', padding: '14px 16px', borderRadius: 14, background: darkMode ? 'rgba(255,255,255,0.04)' : 'rgba(42,31,16,0.04)', border: `1px solid ${darkMode ? 'rgba(255,245,232,0.08)' : 'rgba(42,31,16,0.08)'}` }}>
                    {(selectedItem.variants?.length || 0) > 0 && (
                      <div style={{ marginBottom: (selectedItem.addOns?.length || 0) > 0 ? 12 : 0 }}>
                        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: darkMode ? 'rgba(247,155,61,0.85)' : '#A05000', marginBottom: 8 }}>
                          Choose size · required
                        </div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                          {selectedItem.variants.map(v => {
                            const selected = modifierChoice.variant?.name === v.name;
                            return (
                              <button key={v.name}
                                onClick={() => setModifierChoice(m => ({ ...m, variant: selected ? null : v }))}
                                style={{
                                  padding: '8px 14px', borderRadius: 20,
                                  border: selected ? '2px solid #F79B3D' : `1.5px solid ${darkMode ? 'rgba(255,245,232,0.15)' : 'rgba(42,31,16,0.15)'}`,
                                  background: selected ? 'rgba(247,155,61,0.12)' : 'transparent',
                                  color: darkMode ? '#FFF5E8' : '#1E1B18',
                                  fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'Inter,sans-serif',
                                }}>
                                {v.name}{v.priceDelta ? ` (${v.priceDelta > 0 ? '+' : ''}₹${v.priceDelta})` : ''}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}
                    {(selectedItem.addOns?.length || 0) > 0 && (
                      <div>
                        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: darkMode ? 'rgba(247,155,61,0.85)' : '#A05000', marginBottom: 8 }}>
                          Add-ons · optional
                        </div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                          {selectedItem.addOns.map(a => {
                            const selected = !!modifierChoice.addOns.find(x => x.name === a.name);
                            return (
                              <button key={a.name}
                                onClick={() => setModifierChoice(m => ({
                                  ...m,
                                  addOns: selected
                                    ? m.addOns.filter(x => x.name !== a.name)
                                    : [...m.addOns, a],
                                }))}
                                style={{
                                  padding: '8px 14px', borderRadius: 20,
                                  border: selected ? '2px solid #5A9A78' : `1.5px solid ${darkMode ? 'rgba(255,245,232,0.15)' : 'rgba(42,31,16,0.15)'}`,
                                  background: selected ? 'rgba(90,154,120,0.12)' : 'transparent',
                                  color: darkMode ? '#FFF5E8' : '#1E1B18',
                                  fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'Inter,sans-serif',
                                }}>
                                {selected ? '✓ ' : '+ '}{a.name}{a.priceDelta ? ` (+₹${a.priceDelta})` : ''}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* ── Add to Order List ──
                    When the item has variants, variant is required. Effective
                    price updates live as the user picks modifiers. Add-to-cart
                    resets the modifier state so the next open starts clean. */}
                {(() => {
                  const hasMods = (selectedItem.variants?.length || 0) > 0 || (selectedItem.addOns?.length || 0) > 0;
                  const variantRequired = (selectedItem.variants?.length || 0) > 0;
                  const effectivePrice = (selectedItem.price || 0)
                    + (modifierChoice.variant?.priceDelta || 0)
                    + modifierChoice.addOns.reduce((s, a) => s + (a.priceDelta || 0), 0);
                  const canAdd = !variantRequired || !!modifierChoice.variant;
                  const inCart = !hasMods ? cart.find(c => c.id === selectedItem.id) : null;
                  const handleAdd = () => {
                    if (hasMods) {
                      if (!canAdd) return;
                      addToCart(selectedItem, { variant: modifierChoice.variant, addOns: modifierChoice.addOns });
                      setModifierChoice({ variant: null, addOns: [] });
                    } else {
                      addToCart(selectedItem);
                    }
                  };
                  return (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '16px 0 8px', flexWrap: 'wrap' }}>
                      {!hasMods && inCart ? (
                        <>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 14px', background: darkMode ? 'rgba(255,255,255,0.07)' : 'rgba(42,31,16,0.05)', borderRadius: 50 }}>
                            <button className="qty-btn" onClick={() => removeFromCart(selectedItem.id)}>−</button>
                            <span style={{ fontWeight: 800, fontSize: 16, color: 'var(--text-1,#1E1B18)', minWidth: 20, textAlign: 'center' }}>{inCart.qty}</span>
                            <button className="qty-btn" onClick={() => addToCart(selectedItem)}>+</button>
                          </div>
                          <span style={{ fontSize: 13, color: 'var(--text-muted,rgba(42,31,16,0.5))', fontWeight: 600 }}>in your order list</span>
                        </>
                      ) : (
                        <button onClick={handleAdd}
                          disabled={!canAdd}
                          style={{
                            display: 'flex', alignItems: 'center', gap: 8, padding: '11px 24px', borderRadius: 50, border: 'none',
                            background: darkMode ? '#F79B3D' : '#1E1B18',
                            color: darkMode ? '#ffffff' : '#FFF5E8',
                            fontSize: 14, fontWeight: 700, fontFamily: 'Inter,sans-serif',
                            cursor: canAdd ? 'pointer' : 'not-allowed',
                            opacity: canAdd ? 1 : 0.5,
                            boxShadow: darkMode ? '0 4px 16px rgba(247,155,61,0.35)' : '0 4px 16px rgba(0,0,0,0.25)',
                          }}>
                          🛒 {hasMods ? (variantRequired && !modifierChoice.variant ? 'Pick a size' : `Add to Order · ₹${effectivePrice}`) : 'Add to Order List'}
                        </button>
                      )}
                      {(effectivePrice > 0 && !hasMods) && (
                        <span style={{ fontSize: 18, fontWeight: 800, color: '#E05A3A', fontFamily: 'Poppins,sans-serif', marginLeft: 'auto' }}>₹{effectivePrice}</span>
                      )}
                    </div>
                  );
                })()}

                {/* ─── Star Rating ─── */}
                {!showAR && (
                  <div style={{ margin: '20px 0 8px', padding: '16px 0', borderTop: darkMode ? '1px solid rgba(255,255,255,0.08)' : '1px solid rgba(42,31,16,0.08)' }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: darkMode ? 'rgba(255,255,255,0.45)' : 'rgba(42,31,16,0.4)', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 10 }}>Rate This Dish</div>
                    {userRatings[selectedItem.id] ? (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div style={{ display: 'flex', gap: 3 }}>
                          {[1, 2, 3, 4, 5].map(s => (
                            <span key={s} style={{ fontSize: 22, color: s <= userRatings[selectedItem.id] ? '#F79B3D' : darkMode ? 'rgba(255,255,255,0.12)' : 'rgba(42,31,16,0.15)' }}>★</span>
                          ))}
                        </div>
                        <span style={{ fontSize: 12, color: darkMode ? 'rgba(255,245,232,0.45)' : 'rgba(42,31,16,0.45)', fontWeight: 500 }}>Thanks for rating!</span>
                      </div>
                    ) : (
                      <div>
                        <div style={{ display: 'flex', gap: 4, marginBottom: 8 }}>
                          {[1, 2, 3, 4, 5].map(s => (
                            <button key={s} onClick={() => handleRate(selectedItem, s)} disabled={!!ratingPending} style={{ fontSize: 33, background: 'none', border: 'none', cursor: 'pointer', color: darkMode ? 'rgba(255,255,255,0.18)' : 'rgba(42,31,16,0.15)', padding: '2px 3px 2px 0px', transition: 'color 0.1s, transform 0.1s', lineHeight: 1 }}
                              onMouseOver={e => { const empty = darkMode ? 'rgba(255,255,255,0.18)' : 'rgba(42,31,16,0.15)'; for (let i = 0; i < 5; i++) { const btn = e.currentTarget.parentNode.children[i]; btn.style.color = i < s ? '#F79B3D' : empty; } }}
                              onMouseOut={e => { const empty = darkMode ? 'rgba(255,255,255,0.18)' : 'rgba(42,31,16,0.15)'; for (let i = 0; i < 5; i++) { e.currentTarget.parentNode.children[i].style.color = empty; } }}>
                              ★
                            </button>
                          ))}
                        </div>
                        {selectedItem.ratingCount > 0 && (
                          <div style={{ fontSize: 11, color: darkMode ? 'rgba(255,245,232,0.4)' : 'rgba(42,31,16,0.4)' }}>
                            {selectedItem.ratingAvg?.toFixed(1)} ★ · {selectedItem.ratingCount} {selectedItem.ratingCount === 1 ? 'rating' : 'ratings'}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* ─── Pairs Well With (manual) ─── */}
                {!showAR && (selectedItem.pairsWith || []).length > 0 && (() => {
                  const paired = (selectedItem.pairsWith || [])
                    .map(id => (menuItems || []).find(i => i.id === id))
                    .filter(Boolean);
                  if (!paired.length) return null;
                  return (
                    <div style={{ margin: '8px 0 4px', padding: '16px 0', borderTop: '1px solid var(--divider,rgba(42,31,16,0.08))' }}>
                      <div className="sec-lbl" style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 12 }}>
                        ✨ Pairs Well With
                      </div>
                      <div style={{ display: 'flex', gap: 10, overflowX: 'auto', paddingBottom: 4 }}>
                        {paired.map(u => (
                          <button key={u.id} onClick={() => openItem(u)} style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', background: darkMode ? 'rgba(247,155,61,0.12)' : 'rgba(247,155,61,0.07)', border: '1.5px solid rgba(247,155,61,0.25)', borderRadius: 14, cursor: 'pointer', transition: 'all 0.15s', textAlign: 'left' }}
                            onMouseOver={e => { e.currentTarget.style.background = 'rgba(247,155,61,0.22)'; e.currentTarget.style.borderColor = 'rgba(247,155,61,0.55)'; }}
                            onMouseOut={e => { e.currentTarget.style.background = darkMode ? 'rgba(247,155,61,0.12)' : 'rgba(247,155,61,0.07)'; e.currentTarget.style.borderColor = 'rgba(247,155,61,0.25)'; }}>
                            {u.imageURL && (
                              <div style={{ width: 36, height: 36, borderRadius: 9, overflow: 'hidden', flexShrink: 0 }}>
                                <img src={u.imageURL} alt={u.name} loading="lazy" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                              </div>
                            )}
                            <div>
                              <div className="m-title" style={{ fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap' }}>{u.name}</div>
                              {u.price && <div style={{ fontSize: 11, color: '#F79B3D', fontWeight: 700 }}>₹{u.price}</div>}
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>
                  );
                })()}
              </div>
            </div>
          </SwipeableSheet>
        )}


        {/* ─── CART DRAWER ─── */}
        {cartOpen && (
          <SheetOverlay onClose={() => { setCartOpen(false); setOrderStep('cart'); }} darkMode={darkMode}>
            <div style={{ width: '100%', maxWidth: 440, background: darkMode ? '#1E1B18' : '#FFFDF9', borderRadius: '24px 24px 0 0', padding: '24px 24px 40px', boxShadow: '0 -8px 40px rgba(0,0,0,0.18)', animation: 'slideUp 0.25s cubic-bezier(0.32,0.72,0,1)', maxHeight: '80vh', display: 'flex', flexDirection: 'column', overscrollBehavior: 'contain' }}>

              {/* Handle */}
              <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 16 }}>
                <div style={{ width: 40, height: 5, borderRadius: 3, background: darkMode ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.15)' }} />
              </div>

              {/* ── STEP: cart ── */}
              {orderStep === 'cart' && (<>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                  <div>
                    <div style={{ fontFamily: 'Poppins,sans-serif', fontWeight: 700, fontSize: 17, color: darkMode ? '#FFF5E8' : '#1E1B18' }}>🛒 {t.yourOrder}</div>
                    <div style={{ fontSize: 12, color: darkMode ? 'rgba(255,245,232,0.45)' : 'rgba(42,31,16,0.45)', marginTop: 2 }}>{cartTotal} item{cartTotal !== 1 ? 's' : ''}</div>
                  </div>
                  <button onClick={() => { setCartOpen(false); setOrderStep('cart'); }} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: darkMode ? 'rgba(255,245,232,0.4)' : 'rgba(42,31,16,0.4)', lineHeight: 1 }}>✕</button>
                </div>
                <div style={{ flex: 1, overflowY: 'auto', overscrollBehavior: 'contain', WebkitOverflowScrolling: 'touch', marginBottom: 16 }}>
                  {cart.map(c => {
                    const key = c.cartKey || c.id;
                    return (
                    <div key={key} className="cart-item-row">
                      {c.imageURL && (
                        <div style={{ width: 44, height: 44, borderRadius: 10, overflow: 'hidden', flexShrink: 0 }}>
                          <img src={c.imageURL} alt={c.name} loading="lazy" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        </div>
                      )}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 14, fontWeight: 600, color: darkMode ? '#FFF5E8' : '#1E1B18', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.name}</div>
                        {c.modNote && (
                          <div style={{ fontSize: 11, color: darkMode ? 'rgba(247,155,61,0.85)' : '#A05000', marginTop: 2, fontWeight: 500 }}>
                            {c.modNote}
                          </div>
                        )}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
                          <div style={{ fontSize: 12, color: darkMode ? 'rgba(255,245,232,0.45)' : 'rgba(42,31,16,0.45)' }}>Qty: {c.qty}</div>
                          <button onClick={() => setNoteOpen(n => ({ ...n, [key]: !n[key] }))}
                            style={{ fontSize: 11, color: '#F79B3D', background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontWeight: 600 }}>
                            {c.note ? '✏ Edit note' : '+ Note'}
                          </button>
                        </div>
                        {c.note && !noteOpen[key] && <div style={{ fontSize: 11, color: darkMode ? 'rgba(255,245,232,0.4)' : 'rgba(42,31,16,0.4)', marginTop: 2, fontStyle: 'italic' }}>"{c.note}"</div>}
                        {noteOpen[key] && (
                          <input autoFocus value={c.note || ''} onChange={e => updateCartNote(key, e.target.value)}
                            onBlur={() => setNoteOpen(n => ({ ...n, [key]: false }))}
                            placeholder="e.g. No onion, extra spicy…"
                            style={{ width: '100%', marginTop: 4, padding: '5px 9px', borderRadius: 8, border: `1px solid ${darkMode ? 'rgba(255,245,232,0.15)' : 'rgba(42,31,16,0.15)'}`, background: darkMode ? 'rgba(255,255,255,0.07)' : '#fff', color: darkMode ? '#FFF5E8' : '#1E1B18', fontSize: 12, fontFamily: 'Inter,sans-serif', outline: 'none', boxSizing: 'border-box' }} />
                        )}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                        <button className="qty-btn" onClick={() => removeFromCart(key)}>−</button>
                        <span style={{ fontWeight: 800, fontSize: 15, color: darkMode ? '#FFF5E8' : '#1E1B18', minWidth: 18, textAlign: 'center' }}>{c.qty}</span>
                        <button className="qty-btn" onClick={() => addToCart({ id: c.id, name: c.name, price: c.basePrice ?? c.price, imageURL: c.imageURL }, (c.variant || c.addOns?.length) ? { variant: c.variant, addOns: c.addOns || [] } : null)}>+</button>
                      </div>
                    </div>
                    );
                  })}
                </div>

                {/* Coupon code */}
                <div style={{ marginBottom: 12 }}>
                  {appliedCoupon ? (
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', borderRadius: 12, background: darkMode ? 'rgba(45,139,78,0.12)' : 'rgba(45,139,78,0.08)', border: '1.5px solid rgba(45,139,78,0.3)' }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: '#2D8B4E' }}>✓ {appliedCoupon.code} — Save ₹{couponDiscount}</div>
                      <button onClick={removeCoupon} style={{ background: 'none', border: 'none', fontSize: 16, cursor: 'pointer', color: '#2D8B4E', padding: 0, lineHeight: 1 }}>✕</button>
                    </div>
                  ) : (
                    <div>
                      <div style={{ display: 'flex', gap: 8 }}>
                        <input value={couponCode} onChange={e => { setCouponCode(e.target.value.toUpperCase()); setCouponError(''); }}
                          placeholder="Coupon code"
                          style={{ flex: 1, padding: '10px 13px', borderRadius: 10, border: `1.5px solid ${darkMode ? 'rgba(255,245,232,0.12)' : 'rgba(42,31,16,0.12)'}`, background: darkMode ? 'rgba(255,255,255,0.05)' : '#fff', color: darkMode ? '#FFF5E8' : '#1E1B18', fontSize: 13, fontFamily: 'monospace', letterSpacing: '0.06em', outline: 'none', textTransform: 'uppercase' }} />
                        <button onClick={applyCoupon} disabled={!couponCode.trim() || couponLoading}
                          style={{ padding: '10px 16px', borderRadius: 10, border: 'none', background: '#F79B3D', color: '#fff', fontWeight: 700, fontSize: 13, cursor: 'pointer', opacity: !couponCode.trim() ? 0.5 : 1 }}>
                          {couponLoading ? '…' : 'Apply'}
                        </button>
                      </div>
                      {couponError && <div style={{ fontSize: 12, color: '#E05A3A', marginTop: 5, fontWeight: 600 }}>{couponError}</div>}
                    </div>
                  )}
                </div>

                <div style={{ display: 'flex', gap: 10 }}>
                  <button onClick={clearCart} style={{ flex: 1, padding: '12px', borderRadius: 12, border: `1.5px solid ${darkMode ? 'rgba(255,245,232,0.12)' : 'rgba(42,31,16,0.12)'}`, background: 'transparent', fontSize: 14, fontWeight: 600, fontFamily: 'Inter,sans-serif', cursor: 'pointer', color: darkMode ? 'rgba(255,245,232,0.55)' : 'rgba(42,31,16,0.5)' }}>
                    {t.clear}
                  </button>
                  <button onClick={() => setOrderStep('form')} style={{ flex: 2, padding: '12px', borderRadius: 12, border: 'none', background: darkMode ? '#F79B3D' : '#1E1B18', color: darkMode ? '#1E1B18' : '#FFF5E8', fontSize: 14, fontWeight: 700, fontFamily: 'Inter,sans-serif', cursor: 'pointer' }}>
                    {t.placeOrder}
                  </button>
                </div>
              </>)}

              {/* ── STEP: form ── */}
              {orderStep === 'form' && (<>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20, flexShrink: 0 }}>
                  <button onClick={() => setOrderStep('cart')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: darkMode ? 'rgba(255,245,232,0.5)' : 'rgba(42,31,16,0.45)', fontSize: 18, lineHeight: 1, padding: 0 }}>←</button>
                  <div style={{ fontFamily: 'Poppins,sans-serif', fontWeight: 700, fontSize: 17, color: darkMode ? '#FFF5E8' : '#1E1B18' }}>{t.confirmSummary}</div>
                </div>
                {/* Scrollable form body — keeps the header pinned at the top and
                    the Confirm button pinned at the bottom while the inputs in
                    the middle scroll on mobile. Without this wrapper, on phones
                    the form taller than 80vh leaves the Confirm button below
                    the visible area with nothing to scroll. */}
                <div style={{ flex: 1, overflowY: 'auto', overscrollBehavior: 'contain', WebkitOverflowScrolling: 'touch', minHeight: 0, marginBottom: 16 }}>
                {/* Order summary */}
                <div style={{ padding: '12px 14px', borderRadius: 14, background: darkMode ? 'rgba(255,255,255,0.04)' : 'rgba(42,31,16,0.04)', border: `1px solid ${darkMode ? 'rgba(255,245,232,0.07)' : 'rgba(42,31,16,0.07)'}`, marginBottom: 16 }}>
                  {cart.map(c => (
                    <div key={c.cartKey || c.id} style={{ fontSize: 13, color: darkMode ? 'rgba(255,245,232,0.65)' : 'rgba(42,31,16,0.65)', marginBottom: 4 }}>
                      {c.name}{c.modNote ? ` — ${c.modNote}` : ''} × {c.qty}
                    </div>
                  ))}

                </div>
                {/* Order type — only shown when the customer didn't arrive via
                    a table QR (if tableNumber is set from URL, they're dine-in
                    by definition and we skip the toggle to keep UX tight). */}
                {!tableNumber && (
                  <>
                    <label style={{ fontSize: 12, fontWeight: 700, color: darkMode ? 'rgba(255,245,232,0.5)' : 'rgba(42,31,16,0.5)', letterSpacing: '0.06em', textTransform: 'uppercase', display: 'block', marginBottom: 6 }}>How are you ordering?</label>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 12 }}>
                      {[
                        { k: 'dinein',   label: '🍽️ Dine-in' },
                        { k: 'takeaway', label: '🥡 Takeaway' },
                      ].map(opt => {
                        const selected = customerOrderType === opt.k;
                        return (
                          <button key={opt.k} type="button"
                            onClick={() => setCustomerOrderType(opt.k)}
                            style={{
                              padding: '12px 14px', borderRadius: 12,
                              border: selected ? '2px solid #F79B3D' : `1.5px solid ${darkMode ? 'rgba(255,245,232,0.12)' : 'rgba(42,31,16,0.12)'}`,
                              background: selected ? 'rgba(247,155,61,0.10)' : darkMode ? 'rgba(255,255,255,0.03)' : '#fff',
                              color: darkMode ? '#FFF5E8' : '#1E1B18',
                              fontSize: 14, fontWeight: 700, fontFamily: 'Inter,sans-serif',
                              cursor: 'pointer',
                            }}>
                            {opt.label}
                          </button>
                        );
                      })}
                    </div>
                  </>
                )}

                {/* Table number — shown for dine-in (including QR scans). Hidden for takeaway. */}
                {(tableNumber || customerOrderType === 'dinein') && (
                  <>
                    <label style={{ fontSize: 12, fontWeight: 700, color: darkMode ? 'rgba(255,245,232,0.5)' : 'rgba(42,31,16,0.5)', letterSpacing: '0.06em', textTransform: 'uppercase', display: 'block', marginBottom: 6 }}>{t.tableNumber}</label>
                    <input
                      type="text" inputMode="numeric" placeholder={t.tablePlaceholder}
                      value={orderTableInput} onChange={e => !tableNumber && setOrderTableInput(e.target.value)}
                      readOnly={!!tableNumber}
                      style={{ width: '100%', padding: '12px 14px', borderRadius: 12, border: `1.5px solid ${tableNumber ? 'rgba(90,154,120,0.4)' : darkMode ? 'rgba(255,245,232,0.12)' : 'rgba(42,31,16,0.12)'}`, background: tableNumber ? (darkMode ? 'rgba(90,154,120,0.1)' : 'rgba(90,154,120,0.07)') : darkMode ? 'rgba(255,255,255,0.05)' : '#fff', color: darkMode ? '#FFF5E8' : '#1E1B18', fontSize: 15, fontFamily: 'Inter,sans-serif', outline: 'none', marginBottom: 6, boxSizing: 'border-box', cursor: tableNumber ? 'default' : 'text' }}
                    />
                    {tableNumber && <div style={{ fontSize: 11, color: '#5A9A78', fontWeight: 600, marginBottom: 10 }}>✓ Auto-filled from your table QR</div>}
                  </>
                )}

                {/* Customer name — takeaway only */}
                {!tableNumber && customerOrderType === 'takeaway' && (
                  <>
                    <label style={{ fontSize: 12, fontWeight: 700, color: darkMode ? 'rgba(255,245,232,0.5)' : 'rgba(42,31,16,0.5)', letterSpacing: '0.06em', textTransform: 'uppercase', display: 'block', marginBottom: 6 }}>Your name <span style={{ fontWeight: 400, textTransform: 'none' }}>(for pickup)</span></label>
                    <input
                      type="text" placeholder="e.g. Priya"
                      value={customerName} onChange={e => setCustomerName(e.target.value)}
                      style={{ width: '100%', padding: '12px 14px', borderRadius: 12, border: `1.5px solid ${customerName ? 'rgba(90,154,120,0.4)' : darkMode ? 'rgba(255,245,232,0.12)' : 'rgba(42,31,16,0.12)'}`, background: customerName ? (darkMode ? 'rgba(90,154,120,0.1)' : 'rgba(90,154,120,0.07)') : darkMode ? 'rgba(255,255,255,0.05)' : '#fff', color: darkMode ? '#FFF5E8' : '#1E1B18', fontSize: 15, fontFamily: 'Inter,sans-serif', outline: 'none', marginBottom: 10, boxSizing: 'border-box' }}
                    />
                  </>
                )}
                {/* Phone number */}
                <label style={{ fontSize: 12, fontWeight: 700, color: darkMode ? 'rgba(255,245,232,0.5)' : 'rgba(42,31,16,0.5)', letterSpacing: '0.06em', textTransform: 'uppercase', display: 'block', marginBottom: 6 }}>MOBILE NUMBER <span style={{ color: '#E05A3A', fontWeight: 800 }}>*</span></label>
                <input
                  type="tel" inputMode="tel" placeholder="e.g. 9876543210"
                  value={orderPhone} onChange={e => setOrderPhone(e.target.value.replace(/[^0-9+\- ]/g, '').slice(0, 15))}
                  style={{ width: '100%', padding: '12px 14px', borderRadius: 12, border: `1.5px solid ${orderPhone ? 'rgba(90,154,120,0.4)' : darkMode ? 'rgba(255,245,232,0.12)' : 'rgba(42,31,16,0.12)'}`, background: orderPhone ? (darkMode ? 'rgba(90,154,120,0.1)' : 'rgba(90,154,120,0.07)') : darkMode ? 'rgba(255,255,255,0.05)' : '#fff', color: darkMode ? '#FFF5E8' : '#1E1B18', fontSize: 15, fontFamily: 'Inter,sans-serif', outline: 'none', marginBottom: 6, boxSizing: 'border-box' }}
                />
                {orderPhone && <div style={{ fontSize: 11, color: '#5A9A78', fontWeight: 600, marginBottom: 10 }}>✓ Saved for faster ordering next time</div>}
                {/* Special instructions */}
                <label style={{ fontSize: 12, fontWeight: 700, color: darkMode ? 'rgba(255,245,232,0.5)' : 'rgba(42,31,16,0.5)', letterSpacing: '0.06em', textTransform: 'uppercase', display: 'block', marginBottom: 6 }}>{t.specialInst} <span style={{ fontWeight: 400, textTransform: 'none' }}>(optional)</span></label>
                <textarea
                  placeholder={t.specialPlaceholder}
                  value={specialNote} onChange={e => setSpecialNote(e.target.value)} rows={2}
                  style={{ width: '100%', padding: '12px 14px', borderRadius: 12, border: `1.5px solid ${darkMode ? 'rgba(255,245,232,0.12)' : 'rgba(42,31,16,0.12)'}`, background: darkMode ? 'rgba(255,255,255,0.05)' : '#fff', color: darkMode ? '#FFF5E8' : '#1E1B18', fontSize: 14, fontFamily: 'Inter,sans-serif', outline: 'none', marginBottom: 20, resize: 'none', boxSizing: 'border-box' }}
                />
                </div>
                {/* Confirm button — outside the scroll wrapper so it stays
                    visible at the bottom even when the form is mid-scroll. */}
                <button onClick={placeOrder} disabled={isSubmitting}
                  style={{ width: '100%', padding: '14px', borderRadius: 12, border: 'none', background: isSubmitting ? 'rgba(42,31,16,0.3)' : darkMode ? '#F79B3D' : '#1E1B18', color: darkMode && !isSubmitting ? '#1E1B18' : '#FFF5E8', fontSize: 15, fontWeight: 700, fontFamily: 'Inter,sans-serif', cursor: isSubmitting ? 'not-allowed' : 'pointer', flexShrink: 0 }}>
                  {isSubmitting ? '...' : t.confirmOrder}
                </button>
              </>)}

              {/* ── STEP: payment (Phase F redesign — takeaway pay-first) ──
                   Order has been saved server-side in `awaiting_payment`,
                   the kitchen does NOT see it yet. Customer picks payment
                   method here. Once the order's paymentStatus flips to
                   paid_* (via gateway webhook OR admin manually marking
                   it paid), the auto-advance effect promotes the step to
                   'success' and the kitchen-progress UI takes over.

                   We never claim "Order Placed!" on this step — only on
                   'success', which fires AFTER the kitchen actually has
                   the ticket. */}
              {orderStep === 'payment' && (() => {
                const total = Math.round(Number(placedOrder?.total) || 0);
                const reqStatus = placedOrder?.paymentStatus;
                const isWaiting = reqStatus && /_requested$/.test(reqStatus);
                const gatewayActive = !!(liveRestaurant?.gatewayActive
                  && liveRestaurant?.gatewayProvider
                  && liveRestaurant?.gatewayProvider !== 'none');
                const onPickCash = async () => {
                  if (!restaurant?.id || !placedOrder?.orderId) return;
                  try {
                    await updatePaymentStatus(restaurant.id, placedOrder.orderId, 'cash_requested');
                  } catch (e) { console.error(e); toast.error('Could not mark cash. Try again.'); }
                };
                const onPickCard = async () => {
                  if (!restaurant?.id || !placedOrder?.orderId) return;
                  try {
                    await updatePaymentStatus(restaurant.id, placedOrder.orderId, 'card_requested');
                  } catch (e) { console.error(e); toast.error('Could not mark card. Try again.'); }
                };
                const onPickUpiManual = async () => {
                  if (!restaurant?.id || !placedOrder?.orderId) return;
                  try {
                    await updatePaymentStatus(restaurant.id, placedOrder.orderId, 'online_requested');
                  } catch (e) { console.error(e); toast.error('Could not mark UPI. Try again.'); }
                };
                const onPickUpiGateway = async () => {
                  if (!restaurant?.id || !placedOrder?.orderId) return;
                  try {
                    const r = await fetch('/api/payment/intent', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ restaurantId: restaurant.id, orderIds: [placedOrder.orderId] }),
                    });
                    const j = await r.json();
                    if (!r.ok || !j.paymentUrl) {
                      toast.error('Could not start UPI payment. Try cash/card at counter or the manual UPI option below.');
                      return;
                    }
                    window.open(j.paymentUrl, '_blank', 'noopener,noreferrer');
                  } catch (e) { console.error(e); toast.error('Could not start UPI payment. Try again.'); }
                };
                const onChangeMethod = async () => {
                  if (!restaurant?.id || !placedOrder?.orderId) return;
                  try {
                    // Reset paymentStatus back to 'unpaid' so the picker
                    // re-renders. The order stays in awaiting_payment so
                    // the kitchen still doesn't see it. Customer can now
                    // pick a different method.
                    await updatePaymentStatus(restaurant.id, placedOrder.orderId, 'unpaid');
                  } catch (e) {
                    console.error('change-method failed:', e);
                    toast.error('Could not switch method. Try again.');
                  }
                };
                const onCancelOrder = () => {
                  // Open the styled confirm card (replaces browser confirm()).
                  // The actual write happens in the modal's onConfirm callback.
                  setConfirmDialog({
                    title: 'Cancel this order?',
                    body: "We'll release your saved order. The kitchen hasn't started anything yet, so there's no charge — but the order will be removed.",
                    confirmLabel: 'Yes, cancel order',
                    cancelLabel: 'Keep order',
                    destructive: true,
                    onConfirm: async () => {
                      if (!restaurant?.id || !placedOrder?.orderId) return;
                      try {
                        // Firestore rule restricts customer cancellation to
                        // status==='awaiting_payment'. Once payment has cleared
                        // server-side (status flips to pending), the rule rejects.
                        await cancelOrder(restaurant.id, placedOrder.orderId, 'cancelled-by-customer');
                        setPlacedOrder(null);
                        setOrderStep('cart');
                        setCartOpen(false);
                        try { sessionStorage.removeItem('ar_placed_order'); } catch {}
                        toast.success('Order cancelled');
                      } catch (e) {
                        console.error('[cancel] customer cancel failed:', e);
                        toast.error('Could not cancel — payment may have already been confirmed. Please ask the counter staff.');
                      }
                    },
                  });
                };

                return (
                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflowY: 'auto', overscrollBehavior: 'contain', WebkitOverflowScrolling: 'touch' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16, flexShrink: 0 }}>
                      <div style={{ fontFamily: 'Poppins,sans-serif', fontWeight: 700, fontSize: 17, color: darkMode ? '#FFF5E8' : '#1E1B18' }}>
                        Pay to confirm order
                      </div>
                    </div>

                    {/* Saved-but-not-sent notice — sets the right expectation
                        before the customer walks away thinking the order is in
                        the kitchen. */}
                    <div style={{
                      padding: '12px 14px', borderRadius: 12, marginBottom: 14,
                      background: darkMode ? 'rgba(247,155,61,0.10)' : 'rgba(247,155,61,0.06)',
                      border: '1.5px solid rgba(247,155,61,0.30)',
                      fontSize: 13, color: darkMode ? '#F7A85A' : '#A06318', fontWeight: 600,
                      lineHeight: 1.45,
                    }}>
                      📦 Your order is saved but <u>not yet sent to the kitchen</u>. We'll start preparing once your payment is confirmed.
                    </div>

                    {/* Order summary — shows the items the customer is paying
                        for, so they can verify their order on the payment
                        screen without going back. Items pulled from
                        placedOrder.items (snapshot taken at the moment the
                        order was placed, doesn't drift if the cart is
                        modified afterwards). May 1 — added in response to
                        user feedback that the payment screen had no way to
                        see what was being paid for. */}
                    {(placedOrder?.items?.length || 0) > 0 && (
                      <div style={{
                        padding: '14px 16px 12px', borderRadius: 14, marginBottom: 10,
                        background: darkMode ? 'rgba(255,255,255,0.04)' : 'rgba(42,31,16,0.04)',
                        border: `1px solid ${darkMode ? 'rgba(255,245,232,0.07)' : 'rgba(42,31,16,0.07)'}`,
                      }}>
                        <div style={{
                          fontSize: 11, fontWeight: 700, letterSpacing: '0.06em',
                          textTransform: 'uppercase',
                          color: darkMode ? 'rgba(255,245,232,0.5)' : 'rgba(42,31,16,0.5)',
                          marginBottom: 8,
                        }}>
                          Your order ({placedOrder.items.reduce((s, it) => s + (Number(it.qty) || 1), 0)} item{placedOrder.items.reduce((s, it) => s + (Number(it.qty) || 1), 0) === 1 ? '' : 's'})
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                          {placedOrder.items.map((it, i) => {
                            const lineTotal = Math.round((Number(it.price) || 0) * (Number(it.qty) || 1));
                            return (
                              <div key={i} style={{
                                display: 'grid', gridTemplateColumns: 'auto 1fr auto',
                                gap: 10, alignItems: 'baseline',
                              }}>
                                <span style={{
                                  fontFamily: "'JetBrains Mono', monospace",
                                  fontWeight: 700, fontSize: 12,
                                  color: '#F79B3D', minWidth: 24,
                                }}>
                                  {it.qty || 1}×
                                </span>
                                <span style={{
                                  fontSize: 13, fontWeight: 500,
                                  color: darkMode ? '#FFF5E8' : '#1E1B18',
                                  overflow: 'hidden', textOverflow: 'ellipsis',
                                }}>
                                  {it.name}{it.modNote ? ` — ${it.modNote}` : ''}
                                </span>
                                <span style={{
                                  fontSize: 12, fontWeight: 600,
                                  color: darkMode ? 'rgba(255,245,232,0.65)' : 'rgba(42,31,16,0.65)',
                                  fontVariantNumeric: 'tabular-nums',
                                }}>
                                  ₹{lineTotal.toLocaleString('en-IN')}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* Order total */}
                    <div style={{
                      padding: '14px 16px', borderRadius: 14, marginBottom: 14,
                      background: darkMode ? 'rgba(255,255,255,0.04)' : 'rgba(42,31,16,0.04)',
                      border: `1px solid ${darkMode ? 'rgba(255,245,232,0.07)' : 'rgba(42,31,16,0.07)'}`,
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    }}>
                      <span style={{ fontSize: 13, color: darkMode ? 'rgba(255,245,232,0.55)' : 'rgba(42,31,16,0.55)' }}>Amount to pay</span>
                      <span style={{ fontFamily: 'Inter,monospace', fontSize: 22, fontWeight: 700, color: darkMode ? '#FFF5E8' : '#1E1B18' }}>
                        ₹{total.toLocaleString('en-IN')}
                      </span>
                    </div>

                    {/* Payment options. Each one is a single-tap action — the
                        customer doesn't have to pick a method first then "confirm",
                        because takeaway has fewer methods than dine-in and a
                        single-tap flow halves the time to checkout. */}
                    {!isWaiting && (
                      <>
                        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: darkMode ? 'rgba(255,245,232,0.5)' : 'rgba(42,31,16,0.5)', marginBottom: 8 }}>
                          Choose payment method
                        </div>

                        {gatewayActive && (
                          <button onClick={onPickUpiGateway}
                            style={{
                              width: '100%', padding: '14px 16px', borderRadius: 14, border: 'none',
                              background: 'linear-gradient(135deg,#8A70B0,#6B4F91)', color: '#fff',
                              fontFamily: 'Inter,sans-serif', fontSize: 15, fontWeight: 700,
                              cursor: 'pointer', marginBottom: 10,
                              boxShadow: '0 4px 18px rgba(138,112,176,0.4)',
                              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                            }}>
                            <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                              <span style={{ fontSize: 22 }}>📱</span>
                              <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
                                <span>Pay ₹{total} via UPI</span>
                                <span style={{ fontSize: 11, fontWeight: 500, opacity: 0.85 }}>Auto-confirms · GPay, PhonePe, Paytm</span>
                              </span>
                            </span>
                            <span style={{ fontSize: 18 }}>→</span>
                          </button>
                        )}

                        {!gatewayActive && restaurant?.upiId && (
                          <button onClick={onPickUpiManual}
                            style={{
                              width: '100%', padding: '14px 16px', borderRadius: 14, border: 'none',
                              background: 'linear-gradient(135deg,#8A70B0,#6B4F91)', color: '#fff',
                              fontFamily: 'Inter,sans-serif', fontSize: 15, fontWeight: 700,
                              cursor: 'pointer', marginBottom: 10,
                              boxShadow: '0 4px 18px rgba(138,112,176,0.4)',
                              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                            }}>
                            <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                              <span style={{ fontSize: 22 }}>📱</span>
                              <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
                                <span>Pay ₹{total} via UPI</span>
                                <span style={{ fontSize: 11, fontWeight: 500, opacity: 0.85 }}>Show UPI ID — confirm after paying</span>
                              </span>
                            </span>
                            <span style={{ fontSize: 18 }}>→</span>
                          </button>
                        )}

                        <button onClick={onPickCash}
                          style={{
                            width: '100%', padding: '14px 16px', borderRadius: 14, border: 'none',
                            background: 'linear-gradient(135deg,#2D8B4E,#1A6B38)', color: '#fff',
                            fontFamily: 'Inter,sans-serif', fontSize: 15, fontWeight: 700,
                            cursor: 'pointer', marginBottom: 10,
                            boxShadow: '0 4px 18px rgba(45,139,78,0.35)',
                            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                          }}>
                          <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <span style={{ fontSize: 22 }}>💵</span>
                            <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
                              <span>Pay ₹{total} cash at counter</span>
                              <span style={{ fontSize: 11, fontWeight: 500, opacity: 0.85 }}>Confirms when cashier collects</span>
                            </span>
                          </span>
                          <span style={{ fontSize: 18 }}>→</span>
                        </button>

                        <button onClick={onPickCard}
                          style={{
                            width: '100%', padding: '14px 16px', borderRadius: 14, border: 'none',
                            background: darkMode ? 'rgba(74,128,192,0.20)' : 'rgba(74,128,192,0.10)',
                            border: `1.5px solid ${darkMode ? 'rgba(74,128,192,0.35)' : 'rgba(74,128,192,0.30)'}`,
                            color: darkMode ? '#FFF5E8' : '#1E1B18',
                            fontFamily: 'Inter,sans-serif', fontSize: 15, fontWeight: 700,
                            cursor: 'pointer', marginBottom: 10,
                            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                          }}>
                          <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <span style={{ fontSize: 22 }}>💳</span>
                            <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
                              <span>Pay ₹{total} by card at counter</span>
                              <span style={{ fontSize: 11, fontWeight: 500, opacity: 0.7 }}>Confirms when card is swiped</span>
                            </span>
                          </span>
                          <span style={{ fontSize: 18 }}>→</span>
                        </button>
                      </>
                    )}

                    {/* Manual UPI step — shows the UPI ID + tap-to-open-UPI-app
                        flow ONLY after the customer picked manual UPI. We
                        only get here when gateway is OFF. */}
                    {isWaiting && reqStatus === 'online_requested' && !gatewayActive && restaurant?.upiId && (() => {
                      const tnRef = 'Order ' + (placedOrder?.orderId?.slice(-6).toUpperCase() || '');
                      const upiUrl = `upi://pay?pa=${encodeURIComponent(restaurant.upiId)}&pn=${encodeURIComponent(restaurant.name || 'Restaurant')}&am=${total}&cu=INR&tn=${encodeURIComponent(tnRef)}`;
                      return (
                        <div style={{ marginBottom: 12 }}>
                          <div style={{ textAlign: 'center', padding: '14px 16px', borderRadius: 14, background: darkMode ? 'rgba(138,112,176,0.12)' : 'rgba(138,112,176,0.06)', border: '1.5px solid rgba(138,112,176,0.2)', marginBottom: 10 }}>
                            <div style={{ fontSize: 12, color: darkMode ? 'rgba(255,245,232,0.5)' : 'rgba(42,31,16,0.5)', marginBottom: 4 }}>Pay to UPI ID</div>
                            <div style={{ fontSize: 15, fontWeight: 700, fontFamily: 'monospace', color: darkMode ? '#FFF5E8' : '#1E1B18' }}>{restaurant.upiId}</div>
                            <div style={{ fontSize: 12, color: darkMode ? 'rgba(255,245,232,0.35)' : 'rgba(42,31,16,0.35)', marginTop: 6 }}>Amount: ₹{total}</div>
                          </div>
                          <button onClick={() => window.open(upiUrl, '_self')}
                            style={{ width: '100%', padding: '14px', borderRadius: 14, border: 'none', cursor: 'pointer', background: 'linear-gradient(135deg,#8A70B0,#6B4F91)', color: '#fff', fontSize: 15, fontWeight: 700, fontFamily: 'Inter,sans-serif', boxShadow: '0 4px 18px rgba(138,112,176,0.4)' }}>
                            Open UPI App — Pay ₹{total}
                          </button>
                        </div>
                      );
                    })()}

                    {/* Waiting-for-confirmation banner. Shows after the
                        customer has chosen a method but the order's
                        paymentStatus is still in *_requested (i.e., the
                        cashier or gateway hasn't confirmed yet). The
                        listener on placedOrder will flip to paid_* and the
                        auto-advance effect promotes us to 'success'. */}
                    {isWaiting && (
                      <>
                        <div style={{
                          padding: '14px 16px', borderRadius: 14,
                          background: darkMode ? 'rgba(45,139,78,0.10)' : 'rgba(45,139,78,0.06)',
                          border: '1.5px solid rgba(45,139,78,0.25)',
                          textAlign: 'center', marginBottom: 12,
                        }}>
                          <div style={{ fontSize: 22, marginBottom: 6 }}>⏳</div>
                          <div style={{ fontSize: 14, fontWeight: 700, color: darkMode ? '#6EC98A' : '#1A6B38', marginBottom: 4 }}>
                            Waiting for payment confirmation
                          </div>
                          <div style={{ fontSize: 12, color: darkMode ? 'rgba(255,245,232,0.55)' : 'rgba(42,31,16,0.55)', lineHeight: 1.4 }}>
                            {reqStatus === 'cash_requested'   ? 'Pay cash to the cashier — your order goes to the kitchen the moment they confirm.'
                            : reqStatus === 'card_requested'  ? 'Tap your card at the counter — your order goes to the kitchen once it clears.'
                            : reqStatus === 'online_requested' ? "Once your bank releases the payment, we'll auto-confirm and start preparing."
                            : 'Your order goes to the kitchen the moment payment confirms.'}
                          </div>
                        </div>

                        {/* Change Method — resets paymentStatus to 'unpaid' so
                            the customer can pick a different method without
                            cancelling + re-creating the order. Common case:
                            "I picked cash but I'd rather pay UPI now". */}
                        <button onClick={onChangeMethod}
                          style={{
                            width: '100%', padding: '12px 14px', borderRadius: 12,
                            background: 'transparent',
                            border: `1.5px solid ${darkMode ? 'rgba(247,155,61,0.40)' : 'rgba(247,155,61,0.40)'}`,
                            color: '#F79B3D',
                            fontSize: 13, fontWeight: 700, fontFamily: 'Inter,sans-serif',
                            cursor: 'pointer', marginBottom: 10,
                          }}>
                          ↺ Change payment method
                        </button>
                      </>
                    )}

                    {/* Cancel order — bottom-aligned outline button so it
                        doesn't compete with the payment CTAs but is
                        clearly reachable. Used to be a tiny underlined
                        link which was too easy to miss. */}
                    <div style={{ marginTop: 'auto', paddingTop: 8 }}>
                      <button onClick={onCancelOrder}
                        style={{
                          width: '100%', padding: '11px 14px', borderRadius: 12,
                          background: 'transparent',
                          border: `1.5px solid ${darkMode ? 'rgba(217,83,79,0.35)' : 'rgba(217,83,79,0.30)'}`,
                          color: '#D9534F',
                          fontSize: 12, fontWeight: 600, fontFamily: 'Inter,sans-serif',
                          cursor: 'pointer',
                        }}>
                        Cancel order
                      </button>
                    </div>
                  </div>
                );
              })()}

              {/* ── STEP: success ── */}
              {orderStep === 'success' && (() => {
                // Phase F redesign — copy differs for takeaway. The
                // generic dine-in line ("we'll bring it to your table")
                // doesn't apply when the customer is picking up at the
                // counter, and reading "we'll bring it to your table"
                // on a takeaway success screen sets the wrong expectation.
                const isTakeawaySuccess = placedOrder?.orderType === 'takeaway';
                const successMsg = isTakeawaySuccess
                  ? "Payment confirmed and your order is in the kitchen. We'll have it ready for pickup soon."
                  : t.orderSentMsg;
                return (
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', padding: '20px 0', gap: 16, overflowY: 'auto', overscrollBehavior: 'contain', WebkitOverflowScrolling: 'touch' }}>
                  <div style={{ fontSize: 56 }}>🎉</div>
                  <div style={{ fontFamily: 'Poppins,sans-serif', fontWeight: 700, fontSize: 20, color: darkMode ? '#FFF5E8' : '#1E1B18' }}>{t.orderPlaced}</div>
                  <div style={{ fontSize: 14, color: darkMode ? 'rgba(255,245,232,0.55)' : 'rgba(42,31,16,0.55)', lineHeight: 1.6, maxWidth: 260 }}>{successMsg}</div>
                  {/* Prompt to open bill tab */}
                  {/* Live order status tracker */}
                  {placedOrder && (() => {
                    const STATUS_STEPS = [
                      { key: 'pending',   label: 'Order Placed',   icon: '✓', color: '#F79B3D' },
                      { key: 'preparing', label: 'Preparing',      icon: '🍳', color: '#F79B3D' },
                      { key: 'ready',     label: 'Ready!',         icon: '🎉', color: '#2D8B4E' },
                      { key: 'served',    label: 'Served',         icon: '✅', color: '#2D8B4E' },
                    ];
                    const curIdx = STATUS_STEPS.findIndex(s => s.key === (liveOrderStatus || 'pending'));
                    return (
                      <div style={{ width: '100%', padding: '16px 18px', borderRadius: 16, background: darkMode ? 'rgba(255,255,255,0.05)' : 'rgba(42,31,16,0.03)', border: `1px solid ${darkMode ? 'rgba(255,255,255,0.08)' : 'rgba(42,31,16,0.08)'}` }}>
                        <div style={{ fontSize: 11, fontWeight: 700, color: darkMode ? 'rgba(255,245,232,0.4)' : 'rgba(42,31,16,0.4)', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 12 }}>Order Status</div>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'relative' }}>
                          {/* Progress line */}
                          <div style={{ position: 'absolute', top: 14, left: '10%', right: '10%', height: 3, background: darkMode ? 'rgba(255,255,255,0.1)' : 'rgba(42,31,16,0.1)', borderRadius: 99, zIndex: 0 }}>
                            <div style={{ height: '100%', borderRadius: 99, background: '#F79B3D', width: `${Math.min(100, (curIdx / (STATUS_STEPS.length - 1)) * 100)}%`, transition: 'width 0.5s' }} />
                          </div>
                          {STATUS_STEPS.map((s, i) => {
                            const done = i <= curIdx;
                            const active = i === curIdx;
                            return (
                              <div key={s.key} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, position: 'relative', zIndex: 1 }}>
                                <div style={{ width: 28, height: 28, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: done ? s.color : darkMode ? 'rgba(255,255,255,0.1)' : 'rgba(42,31,16,0.1)', fontSize: 13, transition: 'background 0.3s', boxShadow: active ? `0 0 0 3px ${s.color}40` : 'none' }}>
                                  {done ? <span style={{ fontSize: 12 }}>{s.icon}</span> : <span style={{ width: 8, height: 8, borderRadius: '50%', background: darkMode ? 'rgba(255,255,255,0.25)' : 'rgba(42,31,16,0.25)' }} />}
                                </div>
                                <span style={{ fontSize: 10, fontWeight: active ? 700 : 500, color: done ? (darkMode ? '#FFF5E8' : '#1E1B18') : 'rgba(42,31,16,0.35)', whiteSpace: 'nowrap' }}>{s.label}</span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })()}
                  <div style={{ marginTop: 4, padding: '12px 18px', borderRadius: 14, background: darkMode ? 'rgba(45,139,78,0.12)' : 'rgba(45,139,78,0.08)', border: '1.5px solid rgba(45,139,78,0.3)', fontSize: 13, color: darkMode ? '#6EC98A' : '#1A6B38', fontWeight: 600 }}>
                    🧾 Your bill is ready — tap the green "My Bill" button below
                  </div>
                  {/* Phase B.2 — Add more items / View Bill CTAs.
                      Replaces the in-flow rating block (rating happens AFTER
                      the meal in a later phase, not when the order is just
                      placed). The drawer also auto-closes after 8s — see
                      the timer useEffect — so this row is the natural exit. */}
                  <div style={{ display: 'flex', gap: 10, width: '100%', maxWidth: 380, marginTop: 6 }}>
                    <button
                      onClick={() => { setCartOpen(false); setOrderStep('cart'); if (!tableNumber) setOrderTableInput(''); setSpecialNote(''); }}
                      style={{
                        flex: 1, padding: '13px 16px', borderRadius: 12, border: 'none',
                        background: 'linear-gradient(135deg,#F79B3D,#F48A1E)', color: '#fff',
                        fontSize: 14, fontWeight: 700, fontFamily: 'Inter,sans-serif',
                        cursor: 'pointer',
                        boxShadow: '0 4px 16px rgba(247,155,61,0.30)',
                        display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                      }}>
                      <span style={{ fontSize: 16 }}>＋</span> Add more items
                    </button>
                    <button
                      onClick={() => { setBillOpen(true); setCartOpen(false); setOrderStep('cart'); }}
                      style={{
                        flex: 1, padding: '13px 16px', borderRadius: 12,
                        border: `1.5px solid ${darkMode ? 'rgba(255,245,232,0.18)' : 'rgba(42,31,16,0.16)'}`,
                        background: 'transparent',
                        color: darkMode ? '#FFF5E8' : '#1E1B18',
                        fontSize: 14, fontWeight: 600, fontFamily: 'Inter,sans-serif',
                        cursor: 'pointer',
                        display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                      }}>
                      <span style={{ fontSize: 14 }}>🧾</span> View Bill
                    </button>
                  </div>
                </div>
                );
              })()}
            </div>
          </SheetOverlay>
        )}

        {/* ─── COMBO DETAIL MODAL ─── */}
        {selectedCombo && (
          <SheetOverlay onClose={() => setSelectedCombo(null)} darkMode={darkMode}>
            <div style={{ width: '100%', maxWidth: 540, background: darkMode ? '#1A1612' : '#FEFCF8', borderRadius: '24px 24px 0 0', padding: '0 0 32px', maxHeight: '85vh', overflowY: 'auto', overscrollBehavior: 'contain', WebkitOverflowScrolling: 'touch', animation: 'slideUp 0.3s cubic-bezier(0.32,0.72,0,1)' }}>
              {/* Handle */}
              <div style={{ display: 'flex', justifyContent: 'center', padding: '14px 0 10px' }}>
                <div style={{ width: 40, height: 4, borderRadius: 2, background: darkMode ? 'rgba(255,255,255,0.15)' : 'rgba(42,31,16,0.15)' }} />
              </div>
              <div style={{ padding: '0 22px' }}>
                {/* Header */}
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 16 }}>
                  <div>
                    <div style={{ fontFamily: 'Poppins,sans-serif', fontWeight: 800, fontSize: 20, color: darkMode ? '#FFF5E8' : '#1E1B18', marginBottom: 4 }}>{selectedCombo.name}</div>
                    {selectedCombo.tag && <span style={{ padding: '3px 10px', borderRadius: 20, background: 'rgba(247,155,61,0.25)', color: darkMode ? '#F4C050' : '#A06010', fontSize: 12, fontWeight: 700 }}>{selectedCombo.tag}</span>}
                  </div>
                  <button onClick={() => setSelectedCombo(null)} style={{ background: darkMode ? 'rgba(255,255,255,0.08)' : 'rgba(42,31,16,0.07)', border: 'none', borderRadius: '50%', width: 36, height: 36, fontSize: 18, cursor: 'pointer', color: darkMode ? '#FFF5E8' : '#1E1B18', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>✕</button>
                </div>
                {selectedCombo.description && (
                  <div style={{ fontSize: 14, color: darkMode ? 'rgba(255,245,232,0.6)' : 'rgba(42,31,16,0.6)', marginBottom: 20, lineHeight: 1.6 }}>{selectedCombo.description}</div>
                )}
                {/* Items included */}
                <div style={{ fontFamily: 'Poppins,sans-serif', fontWeight: 700, fontSize: 13, color: darkMode ? 'rgba(255,245,232,0.5)' : 'rgba(42,31,16,0.45)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 12 }}>Included in this combo</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 22 }}>
                  {(selectedCombo.resolvedItems || []).map(item => (
                    <div key={item.id}
                      onClick={() => { setSelectedCombo(null); openItem(item); }}
                      style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', borderRadius: 14, background: darkMode ? 'rgba(255,255,255,0.05)' : 'rgba(42,31,16,0.04)', border: `1px solid ${darkMode ? 'rgba(255,255,255,0.07)' : 'rgba(42,31,16,0.08)'}`, cursor: 'pointer', transition: 'background 0.15s' }}
                      onMouseOver={e => { e.currentTarget.style.background = darkMode ? 'rgba(255,255,255,0.09)' : 'rgba(42,31,16,0.08)'; }}
                      onMouseOut={e => { e.currentTarget.style.background = darkMode ? 'rgba(255,255,255,0.05)' : 'rgba(42,31,16,0.04)'; }}>
                      {item.imageURL ? (
                        <img src={item.imageURL} alt={item.name} loading="lazy" decoding="async" style={{ width: 52, height: 52, borderRadius: 10, objectFit: 'cover', flexShrink: 0 }} />
                      ) : (
                        <div style={{ width: 52, height: 52, borderRadius: 10, background: darkMode ? 'rgba(255,255,255,0.08)' : '#F0E8DE', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22 }}>🍽</div>
                      )}
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 700, fontSize: 14, color: darkMode ? '#FFF5E8' : '#1E1B18', marginBottom: 2 }}>{item.name}</div>
                        {item.description && <div style={{ fontSize: 12, color: darkMode ? 'rgba(255,245,232,0.5)' : 'rgba(42,31,16,0.5)', lineHeight: 1.4 }}>{item.description.slice(0, 60)}{item.description.length > 60 ? '…' : ''}</div>}
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4, flexShrink: 0 }}>
                        {item.price > 0 && <div style={{ fontSize: 13, color: darkMode ? 'rgba(255,245,232,0.4)' : 'rgba(42,31,16,0.4)', textDecoration: 'line-through' }}>₹{item.price}</div>}
                        <div style={{ fontSize: 11, fontWeight: 700, color: darkMode ? 'rgba(247,155,61,0.8)' : '#A06010' }}>View →</div>
                      </div>
                    </div>
                  ))}
                </div>
                {/* Price + CTA */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 18px', borderRadius: 16, background: darkMode ? 'rgba(247,155,61,0.1)' : 'rgba(247,155,61,0.08)', border: '1.5px solid rgba(247,155,61,0.3)', marginBottom: 16 }}>
                  <div>
                    <div style={{ fontFamily: 'Poppins,sans-serif', fontWeight: 900, fontSize: 26, color: '#E05A3A' }}>₹{selectedCombo.comboPrice}</div>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 2 }}>
                      {selectedCombo.originalPrice > selectedCombo.comboPrice && <div style={{ fontSize: 13, color: darkMode ? 'rgba(255,245,232,0.35)' : 'rgba(42,31,16,0.35)', textDecoration: 'line-through' }}>₹{selectedCombo.originalPrice}</div>}
                      {selectedCombo.savings > 0 && <div style={{ fontSize: 13, fontWeight: 700, color: '#2D8B4E' }}>Save ₹{selectedCombo.savings}</div>}
                    </div>
                  </div>
                  <button
                    onClick={() => { addComboToCart(selectedCombo); setSelectedCombo(null); }}
                    style={{ padding: '12px 22px', borderRadius: 14, border: 'none', background: 'linear-gradient(135deg,#F79B3D,#E05A3A)', color: '#fff', fontFamily: 'Inter,sans-serif', fontWeight: 800, fontSize: 15, cursor: 'pointer', boxShadow: '0 4px 16px rgba(224,90,58,0.45)' }}>
                    + Add to Order
                  </button>
                </div>
              </div>
            </div>
          </SheetOverlay>
        )}

        {/* ─── WAITER CALL MODAL ─── */}
        {waiterCallsEnabled && waiterModal && (
          <SheetOverlay onClose={() => { setWaiterModal(false); setWaiterReason(null); setWaiterSent(false); }} darkMode={darkMode}>
            <div style={{ width: '100%', maxWidth: 440, background: darkMode ? '#1E1B18' : '#FFFDF9', borderRadius: '24px 24px 0 0', padding: '28px 24px 40px', boxShadow: '0 -8px 40px rgba(0,0,0,0.18)', animation: 'slideUp 0.25s cubic-bezier(0.32,0.72,0,1)', maxHeight: '85vh', overflowY: 'auto', overscrollBehavior: 'contain', WebkitOverflowScrolling: 'touch' }}>
              {/* Handle */}
              <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 20 }}>
                <div style={{ width: 40, height: 5, borderRadius: 3, background: darkMode ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.15)' }} />
              </div>

              {waiterSent ? (
                <div style={{ textAlign: 'center', padding: '20px 0' }}>
                  <div style={{ fontSize: 48, marginBottom: 12 }}>✅</div>
                  <div style={{ fontFamily: 'Poppins,sans-serif', fontWeight: 700, fontSize: 18, color: darkMode ? '#FFF5E8' : '#1E1B18', marginBottom: 8 }}>
                    Waiter notified!
                  </div>
                  <div style={{ fontSize: 14, color: 'rgba(42,31,16,0.5)' }}>
                    Someone will be with you shortly.
                  </div>
                </div>
              ) : (
                <>
                  <div style={{ fontFamily: 'Poppins,sans-serif', fontWeight: 800, fontSize: 20, color: darkMode ? '#FFF5E8' : '#4e4740', marginBottom: 6 }}>
                    🔔 Call Waiter
                  </div>
                  <div style={{ fontSize: 13, color: 'rgba(42,31,16,0.45)', marginBottom: 22 }}>
                    What do you need? We'll notify your waiter.
                  </div>

                  {/* Reason options */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 22 }}>
                    {[
                      { id: 'water', emoji: '💧', label: 'Need Water' },
                      { id: 'bill', emoji: '🧾', label: 'Need Bill' },
                      { id: 'assistance', emoji: '🙋', label: 'Need Assistance' },
                      { id: 'order', emoji: '📋', label: 'Ready to Order' },
                    ].map(opt => (
                      <button key={opt.id} onClick={() => setWaiterReason(opt.id)}
                        style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 18px', borderRadius: 14, border: `2px solid ${waiterReason === opt.id ? '#F79B3D' : darkMode ? 'rgba(255,255,255,0.1)' : 'rgba(42,31,16,0.1)'}`, background: waiterReason === opt.id ? 'rgba(247,155,61,0.1)' : 'transparent', cursor: 'pointer', transition: 'all 0.15s', textAlign: 'left', width: '100%' }}>
                        <span style={{ fontSize: 22 }}>{opt.emoji}</span>
                        <span style={{ fontSize: 14, fontWeight: 600, color: darkMode ? '#FFF5E8' : '#1E1B18' }}>{opt.label}</span>
                        {waiterReason === opt.id && <span style={{ marginLeft: 'auto', color: '#F79B3D', fontSize: 18 }}>✓</span>}
                      </button>
                    ))}
                  </div>

                  {/* Optional table number */}
                  <div style={{ marginBottom: 20 }}>
                    <input
                      value={waiterTable}
                      onChange={e => !tableNumber && setWaiterTable(e.target.value)}
                      readOnly={!!tableNumber}
                      placeholder="Table number (optional)"
                      style={{ width: '100%', padding: '12px 16px', borderRadius: 12, border: `1.5px solid ${tableNumber ? 'rgba(90,154,120,0.4)' : darkMode ? 'rgba(255,255,255,0.12)' : 'rgba(42,31,16,0.1)'}`, background: tableNumber ? (darkMode ? 'rgba(90,154,120,0.1)' : 'rgba(90,154,120,0.07)') : darkMode ? 'rgba(255,255,255,0.06)' : '#F7F5F2', fontSize: 14, color: darkMode ? '#FFF5E8' : '#1E1B18', outline: 'none', boxSizing: 'border-box', fontFamily: 'Inter,sans-serif', cursor: tableNumber ? 'default' : 'text' }}
                    />
                    {tableNumber && <div style={{ fontSize: 11, color: '#5A9A78', fontWeight: 600, marginTop: 4 }}>✓ Auto-filled from your table QR</div>}
                  </div>

                  <button
                    onClick={handleWaiterCall}
                    disabled={!waiterReason || waiterSending}
                    style={{ width: '100%', padding: '14px', borderRadius: 14, border: 'none', background: waiterReason ? 'linear-gradient(135deg,#F79B3D,#F48A1E)' : 'rgba(92, 92, 92, 0.5)', color: waiterReason ? '#fff' : 'rgba(255, 255, 255, 0.57)', fontSize: 15, fontWeight: 700, fontFamily: 'Poppins,sans-serif', cursor: waiterReason ? 'pointer' : 'not-allowed', transition: 'all 0.2s', boxShadow: waiterReason ? '0 4px 16px rgba(247,155,61,0.35)' : 'none' }}>
                    {waiterSending ? 'Sending…' : '🔔 Call Waiter'}
                  </button>
                </>
              )}
            </div>
          </SheetOverlay>
        )}

        {/* ─── MY BILL SHEET ─── */}
        {billOpen && bill && (
          <SheetOverlay onClose={() => setBillOpen(false)} darkMode={darkMode}>
            <div onClick={e => e.stopPropagation()} style={{ width: '100%', maxWidth: 540, margin: '0 auto', background: darkMode ? '#1A1612' : '#FEFCF8', borderRadius: '24px 24px 0 0', maxHeight: '85vh', overflow: 'hidden', display: 'flex', flexDirection: 'column', animation: 'slideUp 0.3s cubic-bezier(0.32,0.72,0,1)', transform: 'translateZ(0)', WebkitTransform: 'translateZ(0)' }}>
              {/* Handle */}
              <div style={{ display: 'flex', justifyContent: 'center', padding: '14px 0 10px', flexShrink: 0, background: darkMode ? '#1A1612' : '#FEFCF8', borderRadius: '24px 24px 0 0' }}>
                <div style={{ width: 40, height: 4, borderRadius: 2, background: darkMode ? 'rgba(255,255,255,0.15)' : 'rgba(42,31,16,0.15)' }} />
              </div>
              <div style={{ padding: '0 22px calc(env(safe-area-inset-bottom, 20px) + 24px)', overflowY: 'auto', WebkitOverflowScrolling: 'touch', overscrollBehavior: 'contain', flex: 1 }}>
                {/* Header */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                  <div>
                    <div style={{ fontFamily: 'Poppins,sans-serif', fontWeight: 800, fontSize: 20, color: darkMode ? '#FFF5E8' : '#1E1B18' }}>Your Bill</div>
                    {bill.tableNumber && bill.tableNumber !== 'Not specified' && (
                      <div style={{ fontSize: 12, color: 'rgba(45,139,78,0.8)', fontWeight: 600, marginTop: 3 }}>
                        Table {bill.tableNumber}
                        {bill.multipleOrders && (
                          <span style={{ marginLeft: 8, color: darkMode ? 'rgba(255,245,232,0.45)' : 'rgba(42,31,16,0.45)', fontWeight: 500 }}>
                            · {bill.orderCount} orders
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                  <button onClick={() => setBillOpen(false)} style={{ background: darkMode ? 'rgba(255,255,255,0.08)' : 'rgba(42,31,16,0.07)', border: 'none', borderRadius: '50%', width: 36, height: 36, fontSize: 18, cursor: 'pointer', color: darkMode ? '#FFF5E8' : '#1E1B18', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✕</button>
                </div>

                {/* Items */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 14 }}>
                  {bill.items.map((item, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', borderRadius: 12, background: darkMode ? 'rgba(255,255,255,0.05)' : 'rgba(42,31,16,0.03)', border: `1px solid ${darkMode ? 'rgba(255,255,255,0.07)' : 'rgba(42,31,16,0.07)'}` }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 14, fontWeight: 600, color: darkMode ? '#FFF5E8' : '#1E1B18' }}>{item.name}</div>
                        <div style={{ fontSize: 12, color: darkMode ? 'rgba(255,245,232,0.45)' : 'rgba(42,31,16,0.45)', marginTop: 2 }}>₹{item.price} × {item.qty}</div>
                      </div>
                      <div style={{ fontSize: 15, fontWeight: 700, color: darkMode ? '#FFF5E8' : '#1E1B18', flexShrink: 0 }}>₹{(item.price * item.qty).toFixed(0)}</div>
                    </div>
                  ))}
                </div>

                {/* Bill breakdown */}
                {(() => {
                  const sub = bill.subtotal || bill.total;
                  const gstPct = bill.gstPercent;
                  const scPct = bill.serviceChargePercent;
                  const cgst = bill.cgst;
                  const sgst = bill.sgst;
                  const sc = bill.serviceCharge;
                  const disc = bill.discount;
                  const ro = bill.roundOff;
                  const grand = bill.total;
                  const lineStyle = { display: 'flex', justifyContent: 'space-between', fontSize: 13, color: darkMode ? 'rgba(255,245,232,0.6)' : 'rgba(42,31,16,0.6)', marginBottom: 6 };
                  return (
                    <div style={{ padding: '14px 16px', borderRadius: 14, background: darkMode ? 'rgba(255,255,255,0.03)' : 'rgba(42,31,16,0.02)', border: `1px solid ${darkMode ? 'rgba(255,255,255,0.07)' : 'rgba(42,31,16,0.07)'}`, marginBottom: 18 }}>
                      <div style={lineStyle}><span>Subtotal</span><span>₹{sub.toFixed(2)}</span></div>
                      {sc > 0 && <div style={lineStyle}><span>Service Charge ({scPct}%)</span><span>₹{sc.toFixed(2)}</span></div>}
                      {cgst > 0 && <div style={lineStyle}><span>C.G.S.T {(gstPct / 2).toFixed(1)}%</span><span>₹{cgst.toFixed(2)}</span></div>}
                      {sgst > 0 && <div style={lineStyle}><span>S.G.S.T {(gstPct / 2).toFixed(1)}%</span><span>₹{sgst.toFixed(2)}</span></div>}
                      {disc > 0 && <div style={{ ...lineStyle, color: '#2D8B4E', fontWeight: 600 }}><span>Discount{bill.couponCode ? ` (${bill.couponCode})` : ''}</span><span>−₹{disc.toFixed(0)}</span></div>}
                      {ro !== 0 && <div style={lineStyle}><span>Round off</span><span>{ro > 0 ? '+' : ''}₹{ro.toFixed(2)}</span></div>}
                      <div style={{ height: 1, background: darkMode ? 'rgba(255,255,255,0.07)' : 'rgba(42,31,16,0.08)', margin: '10px 0' }} />
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div style={{ fontFamily: 'Poppins,sans-serif', fontWeight: 700, fontSize: 15, color: darkMode ? 'rgba(255,245,232,0.65)' : 'rgba(42,31,16,0.55)' }}>Grand Total</div>
                        <div style={{ fontFamily: 'Poppins,sans-serif', fontWeight: 900, fontSize: 24, color: '#E05A3A' }}>₹{grand}</div>
                      </div>
                    </div>
                  );
                })()}

                {/* Payment section — three states (Phase B):
                    - paid:      admin has confirmed payment (or webhook fired in a later phase)
                    - requested: customer chose method, waiting on staff to collect
                    - unpaid:    no method chosen yet, show the picker */}
                {billPaymentState === 'paid' ? (
                  <div style={{ textAlign: 'center', padding: '24px 18px', borderRadius: 16, background: darkMode ? 'rgba(45,139,78,0.16)' : 'rgba(45,139,78,0.08)', border: '1.5px solid rgba(45,139,78,0.32)' }}>
                    <div style={{ fontSize: 56, marginBottom: 12 }}>🎉</div>
                    <div style={{ fontFamily: 'Poppins,sans-serif', fontWeight: 700, fontSize: 19, color: '#2D8B4E', marginBottom: 8, letterSpacing: '-0.2px' }}>
                      Payment Confirmed!
                    </div>
                    <div style={{ fontSize: 14, color: darkMode ? 'rgba(255,245,232,0.65)' : 'rgba(42,31,16,0.6)', lineHeight: 1.6 }}>
                      {billPaymentMethod === 'cash'
                        ? `Cash payment of ₹${bill.total} received. Thank you!`
                        : billPaymentMethod === 'card'
                        ? `Card payment of ₹${bill.total} received. Thank you!`
                        : billPaymentMethod === 'upi'
                        ? `UPI payment of ₹${bill.total} received. Thank you!`
                        : `Payment of ₹${bill.total} received. Thank you!`}
                    </div>
                  </div>
                ) : billPaymentState === 'requested' ? (
                  <div style={{ textAlign: 'center', padding: '22px 16px', borderRadius: 16, background: darkMode ? 'rgba(45,139,78,0.12)' : 'rgba(45,139,78,0.06)', border: '1.5px solid rgba(45,139,78,0.25)' }}>
                    <div style={{ fontSize: 40, marginBottom: 10 }}>✅</div>
                    <div style={{ fontFamily: 'Poppins,sans-serif', fontWeight: 700, fontSize: 17, color: '#2D8B4E', marginBottom: 6 }}>
                      {billPaymentMethod === 'cash' ? 'Cash Payment Requested' : billPaymentMethod === 'card' ? 'Card Payment Requested' : billPaymentMethod === 'upi' ? 'UPI Payment Done' : 'Payment Requested'}
                    </div>
                    <div style={{ fontSize: 13, color: darkMode ? 'rgba(255,245,232,0.5)' : 'rgba(42,31,16,0.5)', lineHeight: 1.6 }}>
                      {billPaymentMethod === 'cash'
                        ? 'Your waiter will come to collect the payment at your table.'
                        : billPaymentMethod === 'card'
                        ? 'Your waiter will bring the card machine to your table.'
                        : billPaymentMethod === 'upi'
                        ? 'Please show the payment confirmation to your waiter.'
                        : 'Your waiter has been notified.'}
                    </div>
                  </div>
                ) : (
                  <>
                    <div style={{ fontFamily: 'Poppins,sans-serif', fontWeight: 700, fontSize: 13, color: darkMode ? 'rgba(255,245,232,0.45)' : 'rgba(42,31,16,0.4)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 12 }}>How would you like to pay?</div>

                    {/* Payment methods — professional vertical list.
                        Phase H — UPI is shown if EITHER the restaurant has a
                        manual UPI ID set OR they've configured a payment
                        gateway (Paytm Business). Gateway-routed UPI auto-
                        confirms via webhook; manual UPI still requires the
                        "I've paid" tap. */}
                    {(() => { /* gatewayActive flag, scoped to this block */ return null; })()}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
                      {[
                        { id: 'cash', icon: '💵', label: 'Cash', sub: 'Waiter will collect at your table', bg: darkMode ? 'rgba(45,139,78,0.15)' : 'rgba(45,139,78,0.08)' },
                        { id: 'card', icon: '💳', label: 'Card', sub: 'Waiter will bring the card machine', bg: darkMode ? 'rgba(74,128,192,0.15)' : 'rgba(74,128,192,0.08)' },
                        ...((restaurant?.upiId || (liveRestaurant?.gatewayActive && liveRestaurant?.gatewayProvider && liveRestaurant?.gatewayProvider !== 'none'))
                          ? [{
                              id: 'upi',
                              icon: '📱',
                              label: 'UPI',
                              sub: (liveRestaurant?.gatewayActive
                                ? 'Pay via secure gateway, auto-confirms'
                                : 'GPay, PhonePe, Paytm & more'),
                              bg: darkMode ? 'rgba(138,112,176,0.15)' : 'rgba(138,112,176,0.08)',
                            }]
                          : []),
                      ].map(m => {
                        const sel = paymentMethod === m.id;
                        return (
                          <button key={m.id} onClick={() => { setPaymentMethod(m.id); setUpiOpened(false); }}
                            style={{
                              display: 'flex', alignItems: 'center', gap: 14,
                              padding: '14px 16px', borderRadius: 14, cursor: 'pointer',
                              border: `2px solid ${sel ? '#F79B3D' : darkMode ? 'rgba(255,255,255,0.08)' : 'rgba(42,31,16,0.08)'}`,
                              background: sel ? (darkMode ? 'rgba(247,155,61,0.1)' : 'rgba(247,155,61,0.06)') : 'transparent',
                              transition: 'all 0.15s', textAlign: 'left',
                            }}>
                            <div style={{ width: 46, height: 46, borderRadius: 13, background: m.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, flexShrink: 0 }}>{m.icon}</div>
                            <div style={{ flex: 1 }}>
                              <div style={{ fontSize: 15, fontWeight: 700, color: darkMode ? '#FFF5E8' : '#1E1B18', marginBottom: 2 }}>{m.label}</div>
                              <div style={{ fontSize: 12, color: darkMode ? 'rgba(255,245,232,0.4)' : 'rgba(42,31,16,0.45)' }}>{m.sub}</div>
                            </div>
                            <div style={{ width: 22, height: 22, borderRadius: '50%', border: `2px solid ${sel ? '#F79B3D' : darkMode ? 'rgba(255,255,255,0.15)' : 'rgba(42,31,16,0.15)'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, transition: 'all 0.15s' }}>
                              {sel && <div style={{ width: 12, height: 12, borderRadius: '50%', background: '#F79B3D' }} />}
                            </div>
                          </button>
                        );
                      })}
                    </div>

                    {/* Phase H/I/J — UPI via configured gateway (Paytm).
                        Replaces the manual upi:// flow entirely when the
                        restaurant has gatewayConfig.isActive=true. Customer
                        opens the gateway URL in a new window/tab; gateway
                        sends a webhook to /api/payment/webhook which marks
                        all orders on the bill paid_online. The Firestore
                        listener then flips the modal to "Payment Confirmed"
                        — no "I've paid" tap needed. */}
                    {paymentMethod === 'upi'
                      && liveRestaurant?.gatewayActive
                      && liveRestaurant?.gatewayProvider
                      && liveRestaurant?.gatewayProvider !== 'none'
                      && (() => {
                        const onTapPay = async () => {
                          if (!restaurant?.id || !bill?.orderIds?.length) return;
                          try {
                            const r = await fetch('/api/payment/intent', {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({ restaurantId: restaurant.id, orderIds: bill.orderIds }),
                            });
                            const j = await r.json();
                            if (!r.ok || !j.paymentUrl) {
                              toast.error('Could not start UPI payment. Please try the manual UPI flow or pay at counter.');
                              return;
                            }
                            // Open the gateway page. New tab so the customer
                            // can come back to the bill modal afterwards.
                            window.open(j.paymentUrl, '_blank', 'noopener,noreferrer');
                          } catch (e) {
                            console.error('UPI intent failed:', e);
                            toast.error('Could not start UPI payment. Try again.');
                          }
                        };
                        return (
                          <div style={{ marginBottom: 14 }}>
                            <button onClick={onTapPay}
                              style={{
                                width: '100%', padding: '16px', borderRadius: 14, border: 'none', cursor: 'pointer',
                                background: 'linear-gradient(135deg,#8A70B0,#6B4F91)', color: '#fff',
                                fontSize: 16, fontWeight: 700, fontFamily: 'Inter,sans-serif',
                                boxShadow: '0 4px 18px rgba(138,112,176,0.4)',
                              }}>
                              Pay ₹{bill.total} via UPI
                            </button>
                            <div style={{ marginTop: 10, fontSize: 12, color: darkMode ? 'rgba(255,245,232,0.5)' : 'rgba(42,31,16,0.5)', textAlign: 'center' }}>
                              We'll auto-confirm once your bank releases the payment — no extra tap needed.
                            </div>
                          </div>
                        );
                      })()}

                    {/* UPI: Step-by-step flow (manual — no gateway configured) */}
                    {paymentMethod === 'upi'
                      && !(liveRestaurant?.gatewayActive && liveRestaurant?.gatewayProvider && liveRestaurant?.gatewayProvider !== 'none')
                      && restaurant?.upiId && (() => {
                      // Phase A — UPI URL uses the BILL total (sum of all orders
                      // in the running tab), not the latest order's total. The
                      // tn= reference shows the bill / order id so the receipt
                      // is traceable.
                      const tnRef = bill.isBill && currentBillId
                        ? 'Bill ' + currentBillId.slice(-6).toUpperCase()
                        : 'Order ' + (placedOrder?.orderId?.slice(-6).toUpperCase() || '');
                      const upiUrl = `upi://pay?pa=${encodeURIComponent(restaurant.upiId)}&pn=${encodeURIComponent(restaurant.name || 'Restaurant')}&am=${bill.total}&cu=INR&tn=${encodeURIComponent(tnRef)}`;
                      return (
                        <div style={{ marginBottom: 14 }}>
                          {!upiOpened ? (
                            /* Step 1: Open UPI App */
                            <button
                              onClick={() => { setUpiOpened(true); window.open(upiUrl, '_self'); }}
                              style={{
                                width: '100%', padding: '16px', borderRadius: 14, border: 'none', cursor: 'pointer',
                                background: 'linear-gradient(135deg,#8A70B0,#6B4F91)', color: '#fff',
                                fontSize: 16, fontWeight: 700, fontFamily: 'Inter,sans-serif',
                                boxShadow: '0 4px 18px rgba(138,112,176,0.4)',
                              }}>
                              Open UPI App — Pay ₹{bill.total}
                            </button>
                          ) : (
                            /* Step 2: After UPI app was opened */
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                              <div style={{ textAlign: 'center', padding: '14px 16px', borderRadius: 14, background: darkMode ? 'rgba(138,112,176,0.12)' : 'rgba(138,112,176,0.06)', border: '1.5px solid rgba(138,112,176,0.2)' }}>
                                <div style={{ fontSize: 13, color: darkMode ? 'rgba(255,245,232,0.5)' : 'rgba(42,31,16,0.5)', marginBottom: 4 }}>Pay to UPI ID</div>
                                <div style={{ fontSize: 15, fontWeight: 700, fontFamily: 'monospace', color: darkMode ? '#FFF5E8' : '#1E1B18', letterSpacing: '0.03em' }}>{restaurant.upiId}</div>
                                <div style={{ fontSize: 12, color: darkMode ? 'rgba(255,245,232,0.35)' : 'rgba(42,31,16,0.35)', marginTop: 6 }}>Amount: ₹{bill.total}</div>
                              </div>
                              <button
                                onClick={async () => {
                                  if (!restaurant?.id || !bill?.orderIds?.length) return;
                                  try {
                                    // Phase A — mark every order in the running
                                    // bill as awaiting UPI confirmation (not just
                                    // the latest one). Otherwise a multi-order tab
                                    // would have only the most recent order
                                    // showing as paid even though the customer
                                    // paid the FULL bill total in one UPI tap.
                                    await Promise.all(
                                      bill.orderIds.map(oid => updatePaymentStatus(restaurant.id, oid, 'online_requested'))
                                    );
                                    setPaymentDone(true);
                                    setUpiOpened(false);
                                    try { sessionStorage.setItem('ar_payment_done', JSON.stringify({ method: 'upi', orderIds: bill.orderIds })); } catch {}
                                  } catch (e) { console.error(e); }
                                }}
                                style={{
                                  width: '100%', padding: '16px', borderRadius: 14, border: 'none', cursor: 'pointer',
                                  background: 'linear-gradient(135deg,#2D8B4E,#1A6B38)', color: '#fff',
                                  fontSize: 16, fontWeight: 700, fontFamily: 'Inter,sans-serif',
                                  boxShadow: '0 4px 20px rgba(45,139,78,0.4)',
                                }}>
                                I've paid — Confirm Payment
                              </button>
                              <button
                                onClick={() => window.open(upiUrl, '_self')}
                                style={{
                                  width: '100%', padding: '12px', borderRadius: 14,
                                  border: `1.5px solid ${darkMode ? 'rgba(255,255,255,0.12)' : 'rgba(42,31,16,0.12)'}`,
                                  background: 'transparent', color: darkMode ? 'rgba(255,245,232,0.5)' : 'rgba(42,31,16,0.45)',
                                  fontSize: 13, fontWeight: 600, fontFamily: 'Inter,sans-serif', cursor: 'pointer',
                                }}>
                                Reopen UPI App
                              </button>
                            </div>
                          )}
                        </div>
                      );
                    })()}

                    {/* Cash / Card: Confirm button */}
                    {paymentMethod !== 'upi' && (
                      <button
                        onClick={async () => {
                          if (!paymentMethod || !restaurant?.id || !bill?.orderIds?.length) return;
                          try {
                            // Phase A — mark every order in the running bill
                            // (not just the latest) as awaiting cash/card
                            // collection. Customer is paying the FULL bill
                            // total in one go, so all linked orders flip in
                            // sync.
                            const statusMap = { cash: 'cash_requested', card: 'card_requested' };
                            const newStatus = statusMap[paymentMethod] || 'cash_requested';
                            await Promise.all(
                              bill.orderIds.map(oid => updatePaymentStatus(restaurant.id, oid, newStatus))
                            );
                            setPaymentDone(true);
                            try { sessionStorage.setItem('ar_payment_done', JSON.stringify({ method: paymentMethod, orderIds: bill.orderIds })); } catch {}
                          } catch (e) { console.error(e); }
                        }}
                        disabled={!paymentMethod}
                        style={{
                          width: '100%', padding: '16px', borderRadius: 14, border: 'none',
                          background: paymentMethod ? 'linear-gradient(135deg,#2D8B4E,#1A6B38)' : (darkMode ? 'rgba(255,255,255,0.08)' : 'rgba(42,31,16,0.1)'),
                          color: paymentMethod ? '#fff' : (darkMode ? 'rgba(255,255,255,0.3)' : 'rgba(42,31,16,0.3)'),
                          fontSize: 16, fontWeight: 700, fontFamily: 'Inter,sans-serif',
                          cursor: paymentMethod ? 'pointer' : 'not-allowed',
                          boxShadow: paymentMethod ? '0 4px 20px rgba(45,139,78,0.4)' : 'none',
                          transition: 'all 0.2s', minHeight: 52,
                          position: 'relative', zIndex: 5,
                        }}>
                        {paymentMethod ? `Confirm ${paymentMethod === 'cash' ? 'Cash' : 'Card'} Payment` : 'Select a payment method'}
                      </button>
                    )}
                  </>
                )}

                {/* Print Bill */}
                <button
                  onClick={() => {
                    // Build the printable HTML (thermal-printer 80mm receipt).
                    // Phase A — Print uses the aggregated bill (sum across all
                    // orders in the running tab) so multi-order tabs print one
                    // combined receipt instead of just the latest.
                    const rName = restaurant?.name || 'Restaurant';
                    const rAddress = restaurant?.address || '';
                    const rPhone = restaurant?.phone || '';
                    const rGstin = restaurant?.gstNumber || '';
                    const rFssai = restaurant?.fssaiNo || '';
                    const rHsn = restaurant?.hsnCode || '';
                    const rFooter = (restaurant?.billFooter && restaurant.billFooter.trim()) || 'Thank you! Visit again';
                    const tbl = bill.tableNumber && bill.tableNumber !== 'Not specified' ? bill.tableNumber : '';
                    // Bill timestamp = moment payment was confirmed (paidAtMs from
                    // the bill memo, derived from the latest paymentUpdatedAt across
                    // all paid orders on the bill). Falls back to "now" only when
                    // no order on the bill is paid yet — printing an unpaid bill is
                    // unusual but possible (customer wants a copy before paying).
                    const stampDate = bill.paidAtMs ? new Date(bill.paidAtMs) : new Date();
                    const dateStr = stampDate.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
                    const timeStr = stampDate.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
                    const itemsHtml = bill.items.map(it =>
                      `<tr><td style="text-align:left">${it.name} x${it.qty}</td><td style="text-align:right">Rs.${(it.price * it.qty).toFixed(0)}</td></tr>`
                    ).join('');
                    // Bill breakdown
                    const sub = bill.subtotal || bill.total;
                    const gstPct = bill.gstPercent;
                    const scPct = bill.serviceChargePercent;
                    const sc = bill.serviceCharge;
                    const cgst = bill.cgst;
                    const sgst = bill.sgst;
                    const disc = bill.discount;
                    const ro = bill.roundOff;
                    const grand = bill.total;
                    const scRow = sc > 0 ? `<tr><td>Service Charge (${scPct}%)</td><td style="text-align:right">Rs.${sc.toFixed(2)}</td></tr>` : '';
                    const cgstRow = cgst > 0 ? `<tr><td>C.G.S.T ${(gstPct/2).toFixed(1)}%</td><td style="text-align:right">Rs.${cgst.toFixed(2)}</td></tr>` : '';
                    const sgstRow = sgst > 0 ? `<tr><td>S.G.S.T ${(gstPct/2).toFixed(1)}%</td><td style="text-align:right">Rs.${sgst.toFixed(2)}</td></tr>` : '';
                    const discRow = disc > 0 ? `<tr><td>Discount${bill.couponCode ? ' ('+bill.couponCode+')' : ''}</td><td style="text-align:right">-Rs.${disc.toFixed(0)}</td></tr>` : '';
                    const roRow = ro !== 0 ? `<tr><td>Round off</td><td style="text-align:right">${ro > 0 ? '+' : ''}Rs.${ro.toFixed(2)}</td></tr>` : '';
                    const pmLabel = paymentMethod === 'cash' ? 'Cash' : paymentMethod === 'card' ? 'Card' : paymentMethod === 'upi' ? 'UPI' : '';
                    const orderRefHtml = (() => {
                      if (bill.isBill && currentBillId) {
                        return `<div class="center" style="font-size:10px;margin-top:2px">Bill #${currentBillId.slice(-6).toUpperCase()} · ${bill.orderCount} order${bill.orderCount === 1 ? '' : 's'}</div>`;
                      }
                      if (typeof placedOrder?.orderNumber === 'number' && placedOrder.orderNumber > 0) {
                        return `<div class="center" style="font-size:10px;margin-top:2px">Order #${placedOrder.orderNumber}</div>`;
                      }
                      if (placedOrder?.orderId) {
                        return `<div class="center" style="font-size:10px;margin-top:2px">Order #${placedOrder.orderId.slice(-6).toUpperCase()}</div>`;
                      }
                      return '';
                    })();
                    const printHtml = `<!DOCTYPE html><html><head><title>Bill</title><style>
                      @page{size:80mm auto;margin:4mm}
                      *{margin:0;padding:0;box-sizing:border-box}
                      body{font-family:'Courier New',monospace;font-size:12px;width:72mm;margin:0 auto;padding:8px 0}
                      .center{text-align:center}
                      .bold{font-weight:bold}
                      .line{border-top:1px dashed #000;margin:6px 0}
                      table{width:100%;border-collapse:collapse}
                      td{padding:2px 0;vertical-align:top}
                      .total td{font-weight:bold;font-size:14px;padding-top:6px}
                    </style></head><body>
                      <div class="center bold" style="font-size:15px;margin-bottom:2px">${rName}</div>
                      ${rAddress ? `<div class="center" style="font-size:10px;margin-bottom:2px">${rAddress}</div>` : ''}
                      ${rPhone ? `<div class="center" style="font-size:10px">Phone: ${rPhone}</div>` : ''}
                      ${rGstin ? `<div class="center" style="font-size:10px">GSTIN: ${rGstin}</div>` : ''}
                      <div class="line"></div>
                      ${tbl ? `<div class="center" style="font-size:11px;margin-bottom:2px">Table: ${tbl}</div>` : ''}
                      <div class="center" style="font-size:10px">${dateStr} ${timeStr}</div>
                      ${orderRefHtml}
                      <div class="line"></div>
                      <table>${itemsHtml}</table>
                      <div class="line"></div>
                      ${rHsn ? `<div class="center" style="font-size:9px;color:#555;margin-bottom:4px">HSN/SAC: ${rHsn}</div>` : ''}
                      <table>
                        <tr><td>Subtotal</td><td style="text-align:right">Rs.${sub.toFixed(2)}</td></tr>
                        ${scRow}${cgstRow}${sgstRow}${discRow}${roRow}
                      </table>
                      <div class="line"></div>
                      <table><tr class="total"><td>GRAND TOTAL</td><td style="text-align:right">Rs.${grand}</td></tr></table>
                      <div class="line"></div>
                      ${pmLabel ? `<div class="center" style="margin-top:4px;font-size:11px">Payment: ${pmLabel}</div>` : ''}
                      ${rFssai ? `<div class="center" style="margin-top:6px;font-size:10px">FSSAI Lic. No. ${rFssai}</div>` : ''}
                      <div class="center" style="margin-top:8px;font-size:10px">${rFooter}</div>
                      <div class="center" style="margin-top:4px;font-size:9px">Powered by Advert Radical</div>
                    </body></html>`;

                    // ── Print via hidden iframe — no popup, no blocker friction ──
                    // Previously we used `window.open('', '_blank', 'width=...')`
                    // which mobile browsers and strict desktop blockers refuse
                    // to open. The blocked-popup toast was making the button
                    // feel broken even though popups were the right idea
                    // semantically.
                    //
                    // The iframe approach: append a hidden iframe to the page,
                    // write the bill HTML into it, fire its print(), then clean
                    // up. No external window means no popup blocker. Works
                    // identically on Chrome desktop, Safari iOS, Chrome Android.
                    try {
                      const iframe = document.createElement('iframe');
                      iframe.setAttribute('aria-hidden', 'true');
                      // 0×0 visually + offscreen so it never affects layout.
                      iframe.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden';
                      document.body.appendChild(iframe);

                      let cleaned = false;
                      const cleanup = () => {
                        if (cleaned) return;
                        cleaned = true;
                        try { iframe.contentWindow?.removeEventListener('afterprint', cleanup); } catch {}
                        // Slight delay so the print dialog doesn't tear out from
                        // under the iframe before the browser's actually done.
                        setTimeout(() => { try { iframe.remove(); } catch {} }, 100);
                      };

                      const triggerPrint = () => {
                        try {
                          const w = iframe.contentWindow;
                          if (!w) { cleanup(); return; }
                          // afterprint fires once the dialog closes (Cancel or
                          // Print). Safety timeout if it never fires (some
                          // mobile browsers don't emit afterprint reliably).
                          w.addEventListener('afterprint', cleanup);
                          setTimeout(cleanup, 60_000);
                          w.focus();
                          w.print();
                        } catch (err) {
                          console.error('print failed:', err);
                          cleanup();
                          toast.error('Could not open print dialog. Please try again.');
                        }
                      };

                      // Write the HTML and trigger print on load. Some browsers
                      // need both the load event + a tiny tick to settle the
                      // page before print() opens the dialog.
                      const idoc = iframe.contentDocument || iframe.contentWindow?.document;
                      if (!idoc) {
                        cleanup();
                        toast.error('Could not open print dialog. Please try again.');
                        return;
                      }
                      idoc.open();
                      idoc.write(printHtml);
                      idoc.close();
                      // Most browsers fire load synchronously after close()
                      // for an in-document write, but a microtask deferral is
                      // safer for Firefox / Safari edge cases.
                      iframe.addEventListener('load', () => setTimeout(triggerPrint, 50), { once: true });
                      // Fallback in case load already fired before listener attached.
                      setTimeout(() => { if (!cleaned) triggerPrint(); }, 250);
                    } catch (err) {
                      console.error('print failed:', err);
                      toast.error('Could not open print dialog. Please try again.');
                    }
                  }}
                  style={{
                    width: '100%', padding: '14px', borderRadius: 14, border: `1.5px solid ${darkMode ? 'rgba(255,255,255,0.12)' : 'rgba(42,31,16,0.12)'}`,
                    background: 'transparent', color: darkMode ? 'rgba(255,245,232,0.7)' : 'rgba(42,31,16,0.6)',
                    fontSize: 14, fontWeight: 600, fontFamily: 'Inter,sans-serif',
                    cursor: 'pointer', textAlign: 'center', marginTop: 14,
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                    position: 'relative', zIndex: 5,
                  }}>
                  <span style={{ fontSize: 18 }}>🖨</span> Print Bill
                </button>
              </div>
            </div>
          </SheetOverlay>
        )}

        {/* ─── SMART MENU ASSISTANT ─── */}
        {smaOpen && (
          <SheetOverlay onClose={closeSMA} zIndex={55} darkMode={darkMode}>
            <div className="sma-sheet" style={{ overscrollBehavior: 'contain' }}>
              <div className="handle-row"><div className="handle" /></div>

              {/* ── SCREEN 1: Solo vs Group picker ── */}
              {!smaMode && (
                <div className="sma-mode-wrap">
                  <div style={{ fontSize: 40, textAlign: 'center', marginBottom: 12 }}>✨</div>
                  <div className="sma-mode-title">{t.helpChoose}</div>
                  <div className="sma-mode-sub">Are you ordering just for yourself or for a group?</div>
                  <div className="sma-mode-cards">
                    <button className="sma-mode-card" onClick={() => { setSmaMode('solo'); setSmaStep(0); }}>
                      <div className="sma-mode-card-emoji">🙋</div>
                      <div className="sma-mode-card-name">Just Me</div>
                      <div className="sma-mode-card-desc">Personalised picks for your taste</div>
                    </button>
                    <button className="sma-mode-card" onClick={() => setSmaMode('group')}>
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
                  <div style={{ fontSize: 36, textAlign: 'center', marginBottom: 12 }}>👥</div>
                  <div className="sma-size-title">How many people?</div>
                  <div className="sma-size-sub">We'll suggest the right portions and shareable dishes</div>
                  <div className="sma-size-grid">
                    {GROUP_SIZES.map(({ n, e }) => (
                      <button key={n} className="sma-size-btn" onClick={() => { setGroupSize(n); setSmaStep(0); }}>
                        <span className="sma-size-btn-emoji">{e}</span>
                        <div className="sma-size-btn-num">{n}</div>
                        <div className="sma-size-btn-lbl">{n === '6+' ? 'people' : n === 1 ? 'person' : 'people'}</div>
                      </button>
                    ))}
                  </div>
                  <button className="sma-dismiss" style={{ marginTop: 22 }} onClick={() => setSmaMode(null)}>← Back</button>
                </div>
              )}

              {/* ── SCREENS 3–7: Questions ── */}
              {smaMode && (smaMode === 'solo' || groupSize) && smaStep < activeQs.length && (<>
                <div className="sma-prog-wrap">
                  <div className="sma-prog-row">
                    <span className="sma-prog-txt">
                      {smaMode === 'group' && <span style={{ marginRight: 8, fontSize: 11, background: '#F0F7F2', color: '#1A6A38', padding: '2px 8px', borderRadius: 6, fontWeight: 700 }}>👥 Group of {groupSize}</span>}
                      {smaStep + 1} / {activeQs.length}
                    </span>
                    <button className="sma-back" onClick={() => {
                      if (smaStep > 0) setSmaStep(s => s - 1);
                      else if (smaMode === 'group') setGroupSize(null);
                      else setSmaMode(null);
                    }}>← Back</button>
                  </div>
                  <div className="sma-prog-bar">
                    <div className="sma-prog-fill" style={{ width: `${((smaStep + 1) / activeQs.length) * 100}%` }} />
                  </div>
                </div>
                <div className="sma-q-wrap">
                  <div className="sma-q-emoji">{activeQs[smaStep].emoji}</div>
                  <div className="sma-q-text">{activeQs[smaStep].q}</div>
                  <div className="sma-q-sub">{activeQs[smaStep].sub}</div>
                  <div className="sma-opts">
                    {activeQs[smaStep].opts.map(o => (
                      <button key={o.v} className="sma-opt" onClick={() => pickAnswer(activeQs[smaStep].id, o.v)}>
                        <span className="sma-opt-emoji">{o.e}</span>
                        <span className="sma-opt-label">{o.l}</span>
                      </button>
                    ))}
                  </div>
                  <button className="sma-dismiss" onClick={closeSMA}>Dismiss</button>
                </div>
              </>)}

              {/* ── RESULTS ── */}
              {smaMode && (smaMode === 'solo' || groupSize) && smaStep === activeQs.length && (() => {
                const top = smaResults.slice(0, 12);
                const cats = {};
                top.forEach(({ item }) => { const c = item.category || 'Other'; if (!cats[c]) cats[c] = []; cats[c].push(item); });
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
                        <span style={{ fontSize: 20 }}>👥</span>
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
                        <p>No dishes matched your filters.<br />Try relaxing some preferences.</p>
                        <button className="sma-btn-dark" style={{ marginTop: 14, width: '100%' }} onClick={restartSMA}>Try Again</button>
                      </div>
                    ) : (<>
                      {Object.entries(cats).map(([cat, items]) => (
                        <div key={cat}>
                          <div className="sma-cat-lbl">{cat}</div>
                          {items.map(item => {
                            const shareable = isGroup && isShareable(item);
                            return (
                              <button key={item.id} className="sma-item" onClick={() => { closeSMA(); openItem(item); }}>
                                <img className="sma-item-img" src={imgSrc(item)} alt={item.name} loading="lazy"
                                  onError={() => setImgErr(e => ({ ...e, [item.id]: true }))} />
                                <div style={{ flex: 1, minWidth: 0 }}>
                                  <div className="sma-item-name">{item.name}</div>
                                  <div className="sma-item-meta">
                                    {item.price && <span className="sma-item-price">₹{item.price}</span>}
                                    {shareable && <span className="sma-item-chip sma-chip-share">🤲 Shareable</span>}
                                    {item.isPopular && <span className="sma-item-chip sma-chip-pop">✦ Popular</span>}
                                    {item.modelURL && <span className="sma-item-chip sma-chip-ar">🥽 AR</span>}
                                    {item.prepTime && <span style={{ fontSize: 11, color: '#7A7A7A' }}>⏱ {item.prepTime}</span>}
                                  </div>
                                </div>
                                <span style={{ fontSize: 16, color: '#D1D1D6', flexShrink: 0 }}>›</span>
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
          </SheetOverlay>
        )}

        {/* Card-style confirmation dialog. Replaces native confirm()
            calls (cancel order, etc.) so the prompt matches the rest
            of the app's visual language. */}
        <ConfirmModal
          open={!!confirmDialog}
          {...(confirmDialog || {})}
          darkMode={darkMode}
          onCancel={() => setConfirmDialog(null)}
        />
      </div>
    </>
  );
}

export async function getStaticPaths() {
  // Pre-build a static page for every active restaurant at deploy time so the
  // first customer never pays the ~6-second cold-cache wait. The previous
  // implementation returned `paths: []` and relied entirely on
  // `fallback: 'blocking'` — which meant every brand-new visit had to wait
  // for getStaticProps' four Firestore round-trips before any HTML came back.
  // For low-traffic restaurants the cache went cold between visits, so
  // basically every new customer hit that 6-second wait.
  //
  // Now: every active restaurant ships with its HTML already cached on the
  // Vercel edge — first visit is ~200ms. Restaurants signed up AFTER deploy
  // still hit the fallback path once, then get cached for everyone else.
  try {
    const restaurants = await getAllRestaurants();
    return {
      paths: restaurants
        .filter(r => r.isActive && r.subdomain)
        .map(r => ({ params: { subdomain: r.subdomain } })),
      fallback: 'blocking',
    };
  } catch (err) {
    // Don't kill the deploy if Firestore is flaky during build — fall back to
    // pure on-demand (original behaviour). Slow for first visits, but the
    // page still works.
    console.error('[getStaticPaths] failed to list restaurants:', err.message);
    return { paths: [], fallback: 'blocking' };
  }
}

export async function getStaticProps({ params }) {
  try {
    const restaurant = await getRestaurantBySubdomainAny(params.subdomain);
    if (!restaurant) return { notFound: true };
    // Fetch menu data even for inactive restaurants — real-time listener will block display
    const [menuItems, offers, combos] = await Promise.all([
      getMenuItems(restaurant.id),
      getActiveOffers(restaurant.id),
      getCombos(restaurant.id),
    ]);
    return {
      props: {
        restaurant: JSON.parse(JSON.stringify(restaurant)),
        menuItems: JSON.parse(JSON.stringify(menuItems)),
        offers: JSON.parse(JSON.stringify(offers)),
        combos: JSON.parse(JSON.stringify(combos || [])),
        error: null,
      },
      revalidate: 60, // regenerate in background every 60s — menu stays fresh
    };
  } catch (err) {
    return {
      props: { restaurant: null, menuItems: [], offers: [], combos: [], error: err.message },
      revalidate: 10,
    };
  }
}