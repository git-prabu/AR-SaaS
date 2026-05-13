import Head from 'next/head';
import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/router';
import { getRestaurantBySubdomainAny, getMenuItems, getActiveOffers, getCombos, getAllRestaurants, trackVisit, incrementItemView, incrementARView, rateMenuItem, createWaiterCall, createOrder, updatePaymentStatus, updatePaymentStatusBatch, cancelOrder, getTableSession, isSessionValid, isSessionValidWithSid, incrementCouponUse, submitFeedback, sortMenuItems, todayKey, getOrCreateOpenTableBill, getTableBill } from '../../../lib/db';
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

// Defensive guard against the "20 mmiinnss" doubled-character bug —
// usually caused by an i18n bundle interpolating the localized "mins"
// string twice (once per character).
//
// Strategy: try collapsing every doubled letter (aa→a, bb→b…). If the
// ORIGINAL doesn't match a strict prep-time pattern but the COLLAPSED
// one does, the original was doubled — return the fix. Otherwise leave
// it alone. The regex is anchored so it doesn't accidentally match the
// substring "hr" inside "hhrr".
//
// Applied at the render call sites for `prepTime` only — never mutates
// the underlying data.
function safePrepTime(prep) {
  if (!prep || typeof prep !== 'string') return prep;
  const isClean = /^\s*\d+(?:[\s.,\-–]+\d+)*\s*(min|mins|hr|hrs|hour|hours|minute|minutes|sec|secs|second|seconds)\s*$/i;
  if (isClean.test(prep)) return prep;
  const collapsed = prep.replace(/([A-Za-z])\1/g, '$1');
  if (collapsed !== prep && isClean.test(collapsed)) return collapsed;
  return prep;
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
  // 'pending' = touch started but we haven't decided yet whether the
  // gesture is a sheet-drag or a content scroll.
  // 'dragging' = committed; we own the gesture, content scroll is blocked.
  // 'scrolling' = native scroll; we don't touch the gesture.
  const gestureState = useRef('idle');
  const startTime = useRef(0);
  const scrollAncestorRef = useRef(null);
  const [dragY, setDragY] = useState(0);

  const DISMISS_THRESHOLD = 120;
  const VELOCITY_THRESHOLD = 0.45;
  const COMMIT_THRESHOLD = 8;  // px of downward movement before we commit to drag

  // Walk up from the touch target inside the sheet to find the first
  // scrollable ancestor (overflow:auto/scroll with content taller than
  // its viewport). Returns null if there's no scroll inside the sheet,
  // in which case any pull-down is a sheet drag.
  const findScrollAncestor = (target) => {
    let el = target;
    while (el && el !== sheetRef.current && el !== document.body) {
      if (el.scrollHeight > el.clientHeight) {
        const overflowY = window.getComputedStyle(el).overflowY;
        if (overflowY === 'auto' || overflowY === 'scroll') return el;
      }
      el = el.parentElement;
    }
    return null;
  };

  const onTouchStart = (e) => {
    const sheet = sheetRef.current;
    if (!sheet) return;
    const touch = e.touches[0];
    // Don't gate on the 60px handle zone any more — start the gesture
    // anywhere; touchmove decides whether it's a sheet-drag or a
    // content scroll based on direction + scrollTop.
    gestureState.current = 'pending';
    startYRef.current = touch.clientY;
    startTime.current = Date.now();
    currentYRef.current = 0;
    scrollAncestorRef.current = findScrollAncestor(e.target);
  };

  const onTouchEnd = () => {
    const wasDragging = gestureState.current === 'dragging';
    gestureState.current = 'idle';
    if (!wasDragging) return;
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
      if (gestureState.current === 'idle' || gestureState.current === 'scrolling') return;
      const delta = e.touches[0].clientY - startYRef.current;
      // Decide whether to commit to a sheet drag (Swiggy-style):
      // commit only if pulling DOWN past the threshold AND the inner
      // scroll ancestor is at the top (or there's no scroll ancestor).
      if (gestureState.current === 'pending') {
        if (delta < -2) {
          // Pulling up — this is a content scroll (or a no-op).
          gestureState.current = 'scrolling';
          return;
        }
        if (delta < COMMIT_THRESHOLD) return;
        const scroller = scrollAncestorRef.current;
        const scrollTop = scroller ? scroller.scrollTop : 0;
        if (scrollTop > 0) {
          // Inner content can scroll up — let it.
          gestureState.current = 'scrolling';
          return;
        }
        gestureState.current = 'dragging';
      }
      if (gestureState.current !== 'dragging') return;
      e.preventDefault();
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
        style={{ width: '100%', transform: `translateY(${dragY}px)`, transition: gestureState.current === 'dragging' ? 'none' : 'transform 0.32s cubic-bezier(0.32,0.72,0,1)', willChange: 'transform', display: 'flex', justifyContent: 'center' }}
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
  // 'idle' | 'pending' | 'dragging' | 'scrolling' — same Swiggy-style
  // gesture machine as SheetOverlay: any pull-down anywhere can close
  // the sheet, but we only commit if the inner scrollable content is
  // already at the top, otherwise we let native scrolling handle it.
  const gestureState = useRef('idle');
  const startTime = useRef(0);
  const scrollAncestorRef = useRef(null);
  const [dragY, setDragY] = useState(0);

  const DISMISS_THRESHOLD = 120; // px down to dismiss
  const VELOCITY_THRESHOLD = 0.45; // px/ms fast flick
  const COMMIT_THRESHOLD = 8;

  const findScrollAncestor = (target) => {
    let el = target;
    while (el && el !== sheetRef.current && el !== document.body) {
      if (el.scrollHeight > el.clientHeight) {
        const overflowY = window.getComputedStyle(el).overflowY;
        if (overflowY === 'auto' || overflowY === 'scroll') return el;
      }
      el = el.parentElement;
    }
    return null;
  };

  const onTouchStart = (e) => {
    const sheet = sheetRef.current;
    if (!sheet) return;
    const touch = e.touches[0];
    gestureState.current = 'pending';
    startYRef.current = touch.clientY;
    startTime.current = Date.now();
    currentYRef.current = 0;
    scrollAncestorRef.current = findScrollAncestor(e.target);
  };

  const onTouchEnd = () => {
    const wasDragging = gestureState.current === 'dragging';
    gestureState.current = 'idle';
    if (!wasDragging) return;
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
      if (gestureState.current === 'idle' || gestureState.current === 'scrolling') return;
      const delta = e.touches[0].clientY - startYRef.current;
      if (gestureState.current === 'pending') {
        if (delta < -2) { gestureState.current = 'scrolling'; return; }
        if (delta < COMMIT_THRESHOLD) return;
        const scroller = scrollAncestorRef.current;
        const scrollTop = scroller ? scroller.scrollTop : 0;
        if (scrollTop > 0) { gestureState.current = 'scrolling'; return; }
        gestureState.current = 'dragging';
      }
      if (gestureState.current !== 'dragging') return;
      e.preventDefault();
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
          transition: gestureState.current === 'dragging' ? 'none' : 'transform 0.32s cubic-bezier(0.32,0.72,0,1)',
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

// ── May 3 — Coach-mark tour overlay ──────────────────────────────────────
// Visual onboarding: full-screen dark backdrop with an SVG-mask cutout
// that "spotlights" a real DOM element (queried by CSS selector), plus
// a tooltip card explaining the step. Tour advances Next → Next → Got
// it. Skip dismisses immediately.
//
// Step shape: { selector: '.cart-fab' | null, title: string, body: string }
//   - selector === null → centered tooltip, no spotlight (intro / outro)
//   - selector matches → spotlight on first match, tooltip positioned
//                        next to it (above or below depending on space)
//   - selector set but doesn't match the page (e.g. a step targeting
//     a feature the restaurant has disabled) → falls back to centered
//
// Resize handling: re-measures on window resize/scroll so the spotlight
// stays glued to its target if the page reflows. Body scroll is locked
// by the parent (welcomeOpen flag adds to the lock effect).
function CoachMarkTour({ steps, onDone, darkMode }) {
  const [stepIdx, setStepIdx] = useState(0);
  const [target, setTarget] = useState(null);
  const tooltipRef = useRef(null);
  const [tooltipH, setTooltipH] = useState(220);  // measured after first render
  // Per-step placement decision ('above' | 'below'). Locked at step
  // change so the tooltip never flips mid-scroll. Decided based on
  // whether the target lives inside a position:fixed ancestor (FABs)
  // — fixed targets always sit at the bottom of the viewport and the
  // tooltip needs to go above them; everything else is scrolled to
  // TOP_OFFSET=88 so the tooltip goes below.
  const [placement, setPlacement] = useState('below');
  const step = steps[stepIdx];
  const isLast = stepIdx >= steps.length - 1;

  // Measure the target element. Re-runs on step change + on resize/
  // scroll so the spotlight tracks the element through reflows.
  useEffect(() => {
    if (!step?.selector) {
      setTarget(null);
      return;
    }
    let raf = 0;
    const measure = () => {
      const el = document.querySelector(step.selector);
      if (!el) {
        setTarget(null);
        return;
      }
      const r = el.getBoundingClientRect();
      // Off-screen / collapsed → treat as "no target", show centered.
      if (r.width < 4 || r.height < 4) {
        setTarget(null);
        return;
      }
      setTarget({ x: r.left, y: r.top, w: r.width, h: r.height });
    };
    // Measure IMMEDIATELY on step change so the spotlight is at the
    // right element before the scroll begins.
    //
    // Placement + scroll behaviour depends on whether the target
    // lives inside a position:fixed ancestor:
    //
    //   FIXED TARGET (FABs at bottom — Cart, Bill, Order Status,
    //                Help Me Choose, Waiter):
    //     Don't scroll the page (the FAB is already on screen and
    //     scrolling can't move it anyway). Place tooltip ABOVE.
    //
    //   SCROLLABLE TARGET (menu cards, headers, etc.):
    //     Scroll the target to ~88px below the top of the viewport
    //     so there's plenty of room below for the tooltip. Place
    //     tooltip BELOW.
    //
    // The decision is locked for the duration of the step (held in
    // the `placement` state) so it doesn't flip mid-scroll.
    const isInFixedAncestor = (el) => {
      let cur = el;
      while (cur && cur !== document.body) {
        if (window.getComputedStyle(cur).position === 'fixed') return true;
        cur = cur.parentElement;
      }
      return false;
    };
    const el = document.querySelector(step.selector);
    if (el) {
      const fixedTarget = isInFixedAncestor(el);
      setPlacement(fixedTarget ? 'above' : 'below');
      if (!fixedTarget && typeof window !== 'undefined') {
        try {
          const rect = el.getBoundingClientRect();
          const TOP_OFFSET = 88;
          const targetY = window.scrollY + rect.top - TOP_OFFSET;
          window.scrollTo({ top: Math.max(0, targetY), behavior: 'smooth' });
        } catch {}
      }
    }
    measure();
    // rAF-throttle scroll-driven re-measurements so the spotlight
    // tracks the page scroll frame-perfect (without piling up React
    // re-renders during a fast scroll).
    const onChange = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        measure();
      });
    };
    window.addEventListener('resize', onChange);
    window.addEventListener('scroll', onChange, true);
    return () => {
      if (raf) cancelAnimationFrame(raf);
      window.removeEventListener('resize', onChange);
      window.removeEventListener('scroll', onChange, true);
    };
  }, [stepIdx, step?.selector]);

  // Measure the tooltip's actual height so the placement math accounts
  // for variable copy length (some steps are short, some long).
  useEffect(() => {
    if (!tooltipRef.current) return;
    const h = tooltipRef.current.getBoundingClientRect().height;
    if (h > 0 && Math.abs(h - tooltipH) > 4) setTooltipH(h);
  }, [stepIdx, target, tooltipH]);

  const handleNext = () => { if (isLast) onDone(); else setStepIdx(s => s + 1); };
  const handlePrev = () => { if (stepIdx > 0) setStepIdx(s => s - 1); };

  // ── Spotlight rect: capped target so the tooltip always fits ─────
  // Menu item cards can be 500-600px tall (image + name + description
  // + price + tags). When the customer's viewport centers a card that
  // tall, neither space-above nor space-below has room for the tooltip,
  // and we'd fall back to centered placement WHICH OVERLAPS the card —
  // the user reported "menu item content is getting hidden" because of
  // this. Fix: cap the spotlight rect to ~220px (or 35% of viewport,
  // whichever's smaller), so the tooltip below it always fits. The
  // cutout shows the top portion of the target (image + name) — the
  // most visually meaningful slice — and the rest of the card stays
  // dark with the customer understanding the dotted area is "this
  // entire card". Also clip if target overflows viewport vertically.
  const vh = (typeof window !== 'undefined' && window.innerHeight) || 800;
  const vw = (typeof window !== 'undefined' && window.innerWidth) || 360;
  const spotRect = (() => {
    if (!target) return null;
    const SAFE_TOP_CLIP = 8;
    const SAFE_BOTTOM_CLIP = 8;
    // Clip vertically into viewport bounds so we never spotlight
    // off-screen pixels (a target whose top is above the viewport
    // would otherwise have a negative `y` and a phantom rect above the
    // visible area).
    const clipTop = Math.max(target.y, SAFE_TOP_CLIP);
    const clipBottom = Math.min(target.y + target.h, vh - SAFE_BOTTOM_CLIP);
    const clipH = Math.max(40, clipBottom - clipTop);
    const MAX_SPOT_H = Math.min(220, Math.max(140, vh * 0.35));
    return {
      x: target.x,
      y: clipTop,
      w: target.w,
      h: Math.min(clipH, MAX_SPOT_H),
    };
  })();

  // ── Tooltip placement ─────────────────────────────────────────────
  // Target near top (startScroll places it at TOP_OFFSET=88) →
  // always tooltip BELOW the spotlight, with a 12px gap.
  //
  // Earlier versions tried "above OR below depending on space" with
  // a centered fallback. That logic was unstable: the page is
  // smooth-scrolling, the target's clientRect changes every frame,
  // and "above vs below" could flip mid-scroll, causing visible
  // tooltip jumps. Pinning the rule to "always below" (with the
  // scroll positioning the target near the top) is consistent,
  // matches what the user explicitly asked for ("move the card
  // below the image"), and stays stable through any scroll event.
  //
  // No-target steps (intro / outro) still center as before.
  const tooltipStyle = (() => {
    const SAFE_TOP = 16;
    const MARGIN = 12;
    // Tooltip width: tighter on phones so the card doesn't dominate
    // the screen. Was min(360, vw-32); now min(340, vw-40) so the
    // tooltip + spotlight together hide less of the page.
    const tooltipW = Math.min(340, Math.max(280, vw - 40));
    const base = {
      position: 'absolute',
      width: tooltipW,
      maxWidth: 'none',
      background: darkMode ? '#221C16' : '#FFFFFF',
      borderRadius: 16,
      padding: '14px 18px 12px',
      boxSizing: 'border-box',
      boxShadow: '0 16px 50px rgba(0,0,0,0.45), 0 4px 14px rgba(0,0,0,0.20)',
      border: `1px solid ${darkMode ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)'}`,
      transformOrigin: 'center center',
      // No top/left transition. The tooltip's position is computed
      // off the spotRect (which tracks the page scroll via rAF
      // measurements). Adding a 320ms transition on top here made
      // the tooltip lag the spotlight by ~320ms during scroll,
      // which read as "stuck then snap". Now they move together.
      animation: 'cmFade 0.18s ease-out both',
      zIndex: 1001,
    };
    if (!spotRect) {
      // Centered: vertical centering via top:50%/translate handles
      // any height, but clamp the top so it's never above SAFE_TOP.
      return {
        ...base,
        top: Math.max(SAFE_TOP, (vh - tooltipH) / 2),
        left: Math.max(16, (vw - tooltipW) / 2),
      };
    }
    // Honour the placement decision locked in at step change.
    // 'below'  → tooltip below the spotlight (scrollable targets,
    //            scrolled to TOP_OFFSET=88).
    // 'above'  → tooltip above the spotlight (fixed-ancestor targets
    //            like the bottom FAB stack).
    const spotBottom = spotRect.y + spotRect.h;
    let top;
    if (placement === 'above') {
      top = spotRect.y - tooltipH - MARGIN;
      // If above doesn't fit (target too close to top), clamp into
      // the safe area — accept slight overlap rather than disappear.
      if (top < SAFE_TOP) top = SAFE_TOP;
    } else {
      top = spotBottom + MARGIN;
      const maxTop = vh - tooltipH - 12;
      if (top > maxTop) top = Math.max(SAFE_TOP, maxTop);
    }
    // Horizontal: center over target on wider screens; clamp into
    // viewport on narrow ones so the tooltip never overflows.
    const idealLeft = spotRect.x + spotRect.w / 2 - tooltipW / 2;
    const left = Math.min(Math.max(16, idealLeft), vw - tooltipW - 16);
    return { ...base, top, left };
  })();

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 1000, fontFamily: 'Inter,sans-serif' }}>
      <style>{`
        /* Tour entrance/transition keyframes (May 8 v2):
             cmFade   — tooltip mount animation. Pure opacity, no
                        scale (scale on a positioned element fights
                        the top/left transition that handles step
                        changes). 0.18s is fast enough to feel
                        responsive without flashing.
             cmFadeT  — backdrop fade-in.
             cmRingPulse — gentle pulse around the spotlight ring
                           (slowed to 2s and reduced amplitude so it
                           doesn't fight the smooth step-to-step
                           geometry transition). */
        @keyframes cmFade { from { opacity: 0; } to { opacity: 1; } }
        @keyframes cmFadeT { from { opacity: 0; } to { opacity: 1; } }
        @keyframes cmRingPulse { 0%, 100% { box-shadow: 0 0 0 4px rgba(184,71,45,0.28); } 50% { box-shadow: 0 0 0 8px rgba(184,71,45,0.10); } }
      `}</style>

      {/* Dark backdrop with cutout (or solid backdrop when no target).
          The cutout uses spotRect (capped target) — see spotRect calc
          above — so a tall menu card gets only its top portion
          spotlighted and the tooltip below has room to render. */}
      <svg
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', display: 'block', animation: 'cmFadeT 0.18s ease' }}
        onClick={onDone}
        aria-hidden="true"
      >
        <defs>
          <mask id="cm-tour-mask">
            <rect width="100%" height="100%" fill="white" />
            {/* Always-rendered rect so the cutout transitions x/y/w/h
                between steps instead of remounting. When there's no
                target we collapse it to size 0 (still rendered). SVG2
                supports CSS transitions on x/y/width/height in modern
                Chrome/Safari/Firefox — gives a buttery glide between
                step targets. */}
            <rect
              x={(spotRect ? spotRect.x : -50) - 6}
              y={(spotRect ? spotRect.y : -50) - 6}
              width={spotRect ? spotRect.w + 12 : 0}
              height={spotRect ? spotRect.h + 12 : 0}
              rx={14} ry={14}
              fill="black"
              /* No CSS transition — the spotlight tracks the smooth-
                 scroll frame-by-frame via the rAF-throttled measure
                 listener. A ~320ms transition was lagging behind the
                 scroll, which read as "stuck then snap". Setting the
                 attributes directly on every scroll frame produces
                 continuous motion at the page-scroll's cadence. */
            />
          </mask>
        </defs>
        <rect width="100%" height="100%" fill="rgba(0,0,0,0.74)" mask="url(#cm-tour-mask)" />
      </svg>

      {/* Spotlight ring — same logic as the cutout above. Tracks the
          target via rAF-throttled measurements, no CSS transition,
          continuous motion follows the page scroll. */}
      {spotRect && (
        <div style={{
          position: 'absolute',
          top: spotRect.y - 6, left: spotRect.x - 6,
          width: spotRect.w + 12, height: spotRect.h + 12,
          borderRadius: 14,
          border: '2px solid #B8472D',
          boxShadow: '0 0 0 4px rgba(184,71,45,0.30)',
          pointerEvents: 'none',
          animation: 'cmRingPulse 2.4s ease-in-out infinite',
        }} />
      )}

      {/* Tooltip card */}
      <div ref={tooltipRef} style={tooltipStyle} onClick={e => e.stopPropagation()}>
        <div style={{
          fontSize: 10.5, fontWeight: 700, letterSpacing: '0.08em',
          color: '#B8472D', textTransform: 'uppercase',
          marginBottom: 6,
        }}>
          Step {stepIdx + 1} of {steps.length}
        </div>
        <div style={{
          fontFamily: 'Poppins,sans-serif',
          fontSize: 16.5, fontWeight: 800,
          color: darkMode ? '#FFF5E8' : '#1E1B18',
          letterSpacing: '-0.3px',
          marginBottom: 6,
          lineHeight: 1.25,
        }}>
          {step.title}
        </div>
        <div style={{
          fontSize: 13,
          color: darkMode ? 'rgba(255,245,232,0.62)' : 'rgba(42,31,16,0.62)',
          lineHeight: 1.5,
          marginBottom: 12,
        }}>
          {step.body}
        </div>

        {/* Progress dots */}
        <div style={{
          display: 'flex', justifyContent: 'center', gap: 6,
          marginBottom: 12,
        }}>
          {steps.map((_, i) => (
            <div key={i} style={{
              width: i === stepIdx ? 22 : 6, height: 6, borderRadius: 3,
              background: i === stepIdx
                ? '#B8472D'
                : (darkMode ? 'rgba(255,245,232,0.18)' : 'rgba(42,31,16,0.16)'),
              transition: 'all 0.22s',
            }} />
          ))}
        </div>

        {/* Buttons */}
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button
            onClick={onDone}
            style={{
              padding: '10px 14px', background: 'transparent',
              border: 'none', cursor: 'pointer',
              color: darkMode ? 'rgba(255,245,232,0.45)' : 'rgba(42,31,16,0.45)',
              fontSize: 12.5, fontWeight: 600,
              fontFamily: 'inherit',
            }}>
            {isLast ? '' : 'Skip tour'}
          </button>
          <div style={{ flex: 1 }} />
          {stepIdx > 0 && (
            <button
              onClick={handlePrev}
              style={{
                padding: '10px 14px', background: 'transparent',
                border: `1.5px solid ${darkMode ? 'rgba(255,245,232,0.18)' : 'rgba(42,31,16,0.14)'}`,
                borderRadius: 10, cursor: 'pointer',
                color: darkMode ? '#FFF5E8' : '#1E1B18',
                fontSize: 13, fontWeight: 600,
                fontFamily: 'inherit',
              }}>
              ← Back
            </button>
          )}
          <button
            onClick={handleNext}
            style={{
              padding: '10px 22px', borderRadius: 10, border: 'none',
              background: 'linear-gradient(135deg,#B8472D,#A33B19)',
              color: '#FFFFFF',
              fontSize: 13, fontWeight: 700,
              fontFamily: 'inherit',
              cursor: 'pointer',
              boxShadow: '0 4px 16px rgba(184,71,45,0.40)',
              letterSpacing: '0.01em',
            }}>
            {isLast ? 'Got it — let’s order' : 'Next →'}
          </button>
        </div>
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
  // Customer-side menu search (May 8). Replaces the category strip /
  // sections / AR banner / combo deals with a flat result list while
  // active. Scoped to name + description match for now; can grow to
  // include category, ingredient, or dietary tags later.
  const [menuSearch, setMenuSearch] = useState('');
  // Shared helper for single-line text inputs across the customer
  // page. iOS Safari leaves the keyboard open after the user taps
  // Done/Search/Go because nothing tells the input to lose focus.
  // Blurring on Enter dismisses the keyboard. Skip on textareas —
  // those need newline support.
  const dismissKeyboardOnEnter = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      e.currentTarget.blur();
    }
  };
  // Search expansion: tap the header icon → expand the input row.
  // Stays open while there's a typed query; closes when the user
  // clears + dismisses. Keeps the header compact when not searching.
  const [searchOpen, setSearchOpen] = useState(false);
  const menuSearchInputRef = useRef(null);
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
  // May 3 — Optional customer email. Saved if filled (used by future
  // Phase M email triggers — payment confirmation receipt, "order ready"
  // email). Empty is fine: the bill auto-opens in a new tab as the
  // primary keep-a-copy mechanism, email is just bonus for those who
  // want it. Persisted to localStorage like phone so a returning
  // customer doesn't have to retype.
  const [customerEmail, setCustomerEmail] = useState(() => {
    if (typeof window === 'undefined') return '';
    try { return localStorage.getItem('ar_customer_email') || ''; } catch { return ''; }
  });
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

  // May 1 — pastOrders keeps EARLIER orders visible across the session.
  // Without this, when a customer placed Order #9 (paid + in kitchen)
  // and then placed Order #10, the local placedOrder got overwritten
  // and #9 disappeared from the customer's view even though it was
  // still being prepared. Now: when a new order is placed and the
  // current placedOrder is past awaiting_payment (i.e., has been paid
  // and the kitchen has it), we ARCHIVE the current order into
  // pastOrders before overwriting placedOrder. Each past order keeps
  // its own Firestore listener so its kitchen status updates live.
  // Cancelled orders are pruned out so they don't clutter the UI.
  // pastOrders TTL — prune entries older than 24h on init. Without this,
  // a customer who keeps the PWA tab open across days accumulates dead
  // orderIds in sessionStorage AND attaches a Firestore listener to each
  // (see the per-order listener effect below). 24h covers a normal day's
  // visit + any reasonable revisit pattern (lunch + dinner same day);
  // anything older is genuinely stale.
  const PAST_ORDERS_TTL_MS = 24 * 60 * 60 * 1000;
  const [pastOrders, setPastOrders] = useState(() => {
    if (typeof window === 'undefined') return [];
    try {
      const raw = JSON.parse(sessionStorage.getItem('ar_past_orders') || '[]');
      const cutoff = Date.now() - PAST_ORDERS_TTL_MS;
      const fresh = raw.filter(o => {
        const t = Number(o?.createdAtMs) || 0;
        // Keep only orders with a known createdAt within the TTL.
        // Entries missing createdAtMs are pre-TTL legacy data — drop
        // them too rather than letting them linger forever.
        return t > cutoff;
      });
      // Persist the pruned list back so we don't pay the filter cost
      // on every reload + the orphaned listeners stay torn down.
      if (fresh.length !== raw.length) {
        try { sessionStorage.setItem('ar_past_orders', JSON.stringify(fresh)); } catch {}
      }
      return fresh;
    } catch { return []; }
  });
  const [paymentDone, setPaymentDone] = useState(() => {
    if (typeof window === 'undefined') return false;
    try { return !!sessionStorage.getItem('ar_payment_done'); } catch { return false; }
  });
  const [paymentMethod, setPaymentMethod] = useState(() => {
    if (typeof window === 'undefined') return null;
    try { const s = sessionStorage.getItem('ar_payment_done'); return s ? JSON.parse(s).method : null; } catch { return null; }
  });
  // Which UPI app the customer picked from the Swiggy-style picker.
  // One of: 'gpay' | 'phonepe' | 'paytm' | 'other' | 'gateway'.
  // 'gateway' is used when the restaurant has a payment gateway active —
  // the gateway picks the actual app, so we just show one row.
  // Combined with paymentMethod==='upi' to drive the deep-link scheme +
  // the "Pay ₹X via {appName}" CTA copy.
  const [upiApp, setUpiApp] = useState(null);
  const [billOpen, setBillOpen] = useState(false);
  const [upiOpened, setUpiOpened] = useState(false);
  // May 1 — multi-order bill view. When the customer has placed several
  // takeaway orders this session, the bill modal renders ONE of them at
  // a time and a tab strip switches between them. Defaults to the most
  // recent (current placedOrder) when the modal opens; sticks to the
  // user's last choice while the modal stays open. Reset on close.
  const [selectedBillOrderId, setSelectedBillOrderId] = useState(null);
  // May 3 — same idea, for the success-view kitchen timeline. Lets the
  // customer flip between "where is order #9 in the kitchen?" and "where
  // is order #10?". Without this the success-view's 4-step timeline
  // (Order Placed → Preparing → Ready → Served) only ever showed the
  // most recent order, so the customer had no way to confirm an earlier
  // order had reached "Ready" without opening the bill.
  const [selectedSuccessOrderId, setSelectedSuccessOrderId] = useState(null);
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
  // Customer feedback (Phase N) — May 3.
  // We prompt for a star rating + comment after an order transitions to
  // 'served' (which means "picked up" for takeaway, "served" for
  // dine-in). The prompt is per-order: a customer who places 3 orders
  // gets up to 3 prompts (one per served order). Skipping a prompt
  // counts the same as submitting — we record the orderId so we don't
  // bug them again on reload. Persisted to sessionStorage so a tab
  // reload mid-session doesn't re-prompt for an order they already
  // rated or skipped.
  const [feedbackForOrderId, setFeedbackForOrderId] = useState(null);
  const [feedbackRating, setFeedbackRating] = useState(0);
  const [feedbackComment, setFeedbackComment] = useState('');
  const [feedbackSending, setFeedbackSending] = useState(false);
  const [ratedOrderIds, setRatedOrderIds] = useState(() => {
    if (typeof window === 'undefined') return [];
    try { return JSON.parse(sessionStorage.getItem('ar_rated_orders') || '[]'); } catch { return []; }
  });
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

  // ── May 3 — First-visit welcome sheet ────────────────────────────────
  // Slide-up onboarding for new customers explaining the order flow:
  // browse → add → place → pay → track. Per-device localStorage flag so
  // a returning customer never sees it again. Two flavours of copy
  // depending on how they arrived:
  //   - QR scan with ?table= → dine-in tips (waiter brings food, pay
  //     anytime, etc.)
  //   - No table param → takeaway tips (pay-first, pickup at counter)
  // The state opens lazily once the restaurant data has loaded, so the
  // welcome doesn't flash over a loading skeleton on slow networks.
  const [welcomeOpen, setWelcomeOpen] = useState(false);

  // Order-more upsell card shown ONLY on dine-in, AFTER the rating is
  // submitted or closed. From there the customer either:
  //   - taps "Order more" → card closes, customer is on the menu and
  //     can place another order normally; or
  //   - dismisses the card (X / backdrop) → we treat that as "no, get
  //     the bill" and open the bill modal with payment method picker.
  // Declared here (near the other modal-overlay flags) so the body-
  // scroll-lock useEffect's deps array can reference it without a
  // temporal-dead-zone error at render. Suppressed for takeaway since
  // they walk away after pickup.
  const [showOrderMoreCard, setShowOrderMoreCard] = useState(false);

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

  // ── May 3 — First-visit welcome trigger ──────────────────────────────
  // Show the onboarding sheet once per device per restaurant. Keyed by
  // restaurant.id so a customer who orders at multiple Advert-Radical
  // restaurants gets a fresh welcome at each (different layouts /
  // available items / takeaway-vs-dine-in are restaurant-specific).
  // Skipped when the customer reaches the page through a session-blocked
  // state (we'd be welcoming them onto a screen they can't use).
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!restaurant?.id) return;
    if (sessionBlocked || restaurantGone) return;
    let seen = false;
    try {
      seen = localStorage.getItem(`ar_welcome_seen_${restaurant.id}`) === '1';
    } catch { /* localStorage might be disabled — fall through and show */ }
    if (seen) return;
    // Small delay so the page renders before the sheet animates in —
    // less jarring than slamming over an empty / loading screen.
    const t = setTimeout(() => setWelcomeOpen(true), 700);
    return () => clearTimeout(t);
  }, [restaurant?.id, sessionBlocked, restaurantGone]);

  const dismissWelcome = useCallback(() => {
    setWelcomeOpen(false);
    if (!restaurant?.id) return;
    try { localStorage.setItem(`ar_welcome_seen_${restaurant.id}`, '1'); } catch {}
  }, [restaurant?.id]);

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

  // Theme — light by default for first-time visitors. Returning
  // visitors who explicitly switched to dark still see dark
  // (localStorage 'ar_theme' === 'dark'). The day/night toggle in
  // the header lets either mode flip back at any time.
  const [darkMode, setDarkMode] = useState(() => {
    if (typeof window === 'undefined') return false;
    const stored = localStorage.getItem('ar_theme');
    return stored === 'dark';
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
    const isOpen = !!(selectedItem || smaOpen || selectedCombo || cartOpen || billOpen || waiterModal || feedbackForOrderId || welcomeOpen || showOrderMoreCard);
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
  }, [selectedItem, smaOpen, selectedCombo, cartOpen, billOpen, waiterModal, feedbackForOrderId, welcomeOpen, showOrderMoreCard]);


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

  // ── Categorised menu structure (May 8 redesign) ─────────────────────
  // Customer menu is rendered as horizontal-scroll sections grouped by
  // item.category. Inside each section, isFeatured items appear first
  // (Layer 3 of the original 3-layer featured strategy — kept). The
  // separate top-of-menu Featured row + Featured tile (Layer 1 + 2)
  // were dropped per the user's revised spec: featured items now only
  // get prominence WITHIN their own category, not as a global section.
  // Admin can still create a manual category named "Featured" if they
  // want a literal Featured menu group.
  //
  //   categorySections — [{ name, image, items[] }, ...] grouped from
  //                      enrichedItems with featured-first sort inside
  //                      each section.
  //   categoryStrip   — [{ name, image }] for the top image-tile nav,
  //                     one tile per category, in the same order as
  //                     categorySections.
  const categorySections = useMemo(() => {
    // Build category → items map, preserving insertion order.
    const byCat = new Map();
    for (const item of enrichedItems) {
      const c = (item.category || '').trim() || 'Other';
      if (!byCat.has(c)) byCat.set(c, []);
      byCat.get(c).push(item);
    }
    // Honour restaurant.categoryOrder when present (admin-set drag
    // order from /admin/items). Categories not in the saved order
    // (e.g. a brand-new one the admin just typed into an item) are
    // appended at the end — matches the user's "(a) append" rule.
    const savedOrder = Array.isArray(restaurant?.categoryOrder)
      ? restaurant.categoryOrder
      : [];
    const orderIndex = (name) => {
      const i = savedOrder.indexOf(name);
      return i === -1 ? Number.MAX_SAFE_INTEGER : i;
    };
    const sortedNames = [...byCat.keys()].sort((a, b) => {
      const ai = orderIndex(a);
      const bi = orderIndex(b);
      if (ai !== bi) return ai - bi;
      // Both absent from savedOrder → stable insertion order.
      return 0;
    });
    // Within each category: featured first, then everything else
    // preserving the admin-set sort order (already applied upstream).
    const sections = [];
    for (const name of sortedNames) {
      const items = byCat.get(name) || [];
      const featuredFirst = [
        ...items.filter(i => i.isFeatured),
        ...items.filter(i => !i.isFeatured),
      ];
      // Use admin-uploaded category image first (commit C), then fall
      // back to the first item's photo, then to '' so the tile
      // renderer can substitute an emoji.
      const adminImage = restaurant?.categoryImages?.[name] || '';
      const heroItem = featuredFirst[0] || null;
      sections.push({
        name,
        image: adminImage || heroItem?.imageURL || '',
        items: featuredFirst,
      });
    }
    return sections;
  }, [enrichedItems, restaurant?.categoryOrder, restaurant?.categoryImages]);

  const categoryStrip = useMemo(() => {
    return categorySections.map((section) => ({
      key: section.name,
      name: section.name,
      image: section.image,
    }));
  }, [categorySections]);




  // Smart header: smooth hide on scroll down, show on scroll up
  const hdrRef = useRef(null);
  const lastScrollY = useRef(0);
  const scrollTicking = useRef(false);





  // Smart header — Medium-style per-frame finger-track + snap on
  // idle. v3 (binary state + CSS transition) felt jumpy to the user;
  // the original per-pixel scroll tracking is smoother in practice
  // because each scroll frame produces a continuous translation.
  //
  // hdrHeight is tracked (via ResizeObserver) so the category-tile
  // click handler can offset its smooth-scroll target by the full
  // header height — fixes the bug where scrolling UP to a category
  // section above leaves the header covering the title. (hdrRef,
  // lastScrollY, scrollTicking are declared above with the other
  // header refs.)
  const [hdrHeight, setHdrHeight] = useState(0);

  useEffect(() => {
    if (!hdrRef.current) return;
    setHdrHeight(hdrRef.current.getBoundingClientRect().height);
    const ro = typeof ResizeObserver !== 'undefined'
      ? new ResizeObserver(() => {
          if (hdrRef.current) setHdrHeight(hdrRef.current.getBoundingClientRect().height);
        })
      : null;
    if (ro) ro.observe(hdrRef.current);
    return () => { if (ro) ro.disconnect(); };
  }, []);

  useEffect(() => {
    let prevY = window.scrollY;
    let translationY = 0;
    let snapTimer = null;

    const snapComplete = (hdr, height) => {
      // Snap to the nearest boundary on idle so the header never
      // rests half-hidden.
      const target = translationY < -height / 2 ? -height : 0;
      if (translationY !== target) {
        hdr.style.transition = 'transform 0.3s cubic-bezier(0.4,0,0.2,1)';
        hdr.style.transform = `translateY(${target}px)`;
        translationY = target;
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
  // Past-orders listener — keeps each archived order's kitchen status
  // live so the "Your earlier orders" UI can show "Preparing → Ready →
  // Served" transitions without a refresh. Cancelled orders are pruned
  // so they don't sit in the list forever after admin cancels.
  useEffect(() => {
    if (!restaurant?.id || pastOrders.length === 0) return;
    const unsubs = pastOrders.map((o) =>
      onSnapshot(doc(db, 'restaurants', restaurant.id, 'orders', o.orderId), snap => {
        if (!snap.exists()) return;
        const data = snap.data();
        setPastOrders(prev => {
          // Prune cancelled orders from the visible list.
          if (data.status === 'cancelled') {
            const filtered = prev.filter(po => po.orderId !== o.orderId);
            try { sessionStorage.setItem('ar_past_orders', JSON.stringify(filtered)); } catch {}
            return filtered;
          }
          const updated = prev.map(po =>
            po.orderId === o.orderId
              ? {
                  ...po,
                  status: data.status || po.status,
                  paymentStatus: data.paymentStatus || po.paymentStatus,
                  total: data.total ?? po.total,
                  items: data.items || po.items,
                  orderNumber: typeof data.orderNumber === 'number' ? data.orderNumber : po.orderNumber,
                }
              : po
          );
          try { sessionStorage.setItem('ar_past_orders', JSON.stringify(updated)); } catch {}
          return updated;
        });
      }, () => { /* listener errors are non-fatal — keep cached values */ })
    );
    return () => unsubs.forEach(u => u());
  // We rebuild listeners only when the SET of order IDs changes, not on
  // every internal status update — that would tear down + reattach
  // listeners on every snapshot. The id-list join is stable when the
  // underlying ids are.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restaurant?.id, pastOrders.map(o => o.orderId).join(',')]);

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

  // May 1 — viewingOrder + billTabs power the multi-order bill view.
  // viewingOrder is the order whose bill is currently displayed in the
  // bill modal — defaults to placedOrder, switchable to a past order
  // via the tab strip. For dine-in running bill (currentBillId set),
  // there's nothing to switch between — the bill aggregates billOrders
  // by billId and viewingOrder is unused.
  const viewingBillOrder = useMemo(() => {
    if (currentBillId && billOrders.length > 0) return null;  // aggregate mode
    if (selectedBillOrderId) {
      if (placedOrder?.orderId === selectedBillOrderId) return placedOrder;
      const past = pastOrders.find(po => po.orderId === selectedBillOrderId);
      if (past) return past;
    }
    return placedOrder;
  }, [selectedBillOrderId, placedOrder, pastOrders, currentBillId, billOrders.length]);

  // Tabs source: every order the customer can switch between.
  // Past orders first (oldest), current placedOrder last (newest).
  // Empty array → no tab strip rendered (single-bill view).
  const billTabs = useMemo(() => {
    if (currentBillId && billOrders.length > 0) return [];  // dine-in aggregate, no tabs
    const tabs = [];
    for (const po of pastOrders) {
      if (po && po.orderId) tabs.push({
        orderId: po.orderId,
        orderNumber: po.orderNumber,
        total: po.total,
        status: po.status,
        paymentStatus: po.paymentStatus,
      });
    }
    if (placedOrder?.orderId) {
      tabs.push({
        orderId: placedOrder.orderId,
        orderNumber: placedOrder.orderNumber,
        total: placedOrder.total,
        status: liveOrderStatus,
        paymentStatus: placedOrder.paymentStatus,
      });
    }
    return tabs;
  }, [pastOrders, placedOrder, liveOrderStatus, currentBillId, billOrders.length]);

  // Default selection when bill opens — newest order (current placedOrder).
  // We do this in an effect so it only fires when billOpen flips true,
  // not on every re-render.
  useEffect(() => {
    if (!billOpen) {
      // Reset on close so next open picks up the latest order automatically.
      setSelectedBillOrderId(null);
      return;
    }
    if (placedOrder?.orderId) {
      setSelectedBillOrderId(prev => prev || placedOrder.orderId);
    }
  }, [billOpen, placedOrder?.orderId]);

  const billPaymentState = useMemo(() => {
    // Dine-in: aggregate across billOrders. Otherwise: just the viewing order.
    const sourceOrders = (currentBillId && billOrders.length > 0)
      ? billOrders
      : (viewingBillOrder ? [viewingBillOrder] : []);
    if (sourceOrders.length === 0) return 'unpaid';

    const allPaid = sourceOrders.every(o => PAID_STATUSES.has(o.paymentStatus));
    if (allPaid) return 'paid';

    const anyRequested = sourceOrders.some(o => REQUESTED_STATUSES.has(o.paymentStatus));
    if (anyRequested || paymentDone) return 'requested';

    return 'unpaid';
  }, [currentBillId, billOrders, viewingBillOrder, paymentDone, PAID_STATUSES, REQUESTED_STATUSES]);

  // Derive method from the most-progressed paymentStatus across orders.
  // Falls back to the local paymentMethod state for the brief window
  // between "Confirm Cash" tap and listener catch-up.
  const billPaymentMethod = useMemo(() => {
    const sourceOrders = (currentBillId && billOrders.length > 0)
      ? billOrders
      : (viewingBillOrder ? [viewingBillOrder] : []);
    for (const o of sourceOrders) {
      const ps = o.paymentStatus;
      if (ps === 'paid_cash' || ps === 'cash_requested') return 'cash';
      if (ps === 'paid_card' || ps === 'card_requested') return 'card';
      if (ps === 'paid_online' || ps === 'online_requested') return 'upi';
      if (ps === 'paid') return 'cash'; // legacy bucket
    }
    return paymentMethod;
  }, [currentBillId, billOrders, viewingBillOrder, paymentMethod]);

  // Live kitchen status for the order currently being viewed in the bill
  // modal. For the most recent (placedOrder) we trust the dedicated
  // liveOrderStatus subscription; for past orders we trust the per-order
  // listener installed by the pastOrders effect — both are kept fresh.
  // null when in dine-in aggregate mode (status doesn't apply across
  // multiple kitchen orders on a single bill).
  const viewingBillOrderStatus = useMemo(() => {
    if (currentBillId && billOrders.length > 0) return null;
    if (!viewingBillOrder) return null;
    if (placedOrder && viewingBillOrder.orderId === placedOrder.orderId) {
      return liveOrderStatus || viewingBillOrder.status || null;
    }
    return viewingBillOrder.status || null;
  }, [currentBillId, billOrders.length, viewingBillOrder, placedOrder, liveOrderStatus]);

  // ── May 3 — Session-wide order list + aggregate FAB status ───────────
  // Used by both:
  //   - The order-status FAB (so the FAB surfaces the most actionable
  //     state across ALL session orders, not just the latest. Without
  //     this, an earlier order going Ready would be hidden behind a
  //     newer order's "Preparing…" — the customer would walk past their
  //     ready food.)
  //   - The success-view tab strip (one tab per session order, each
  //     showing its own kitchen timeline).
  // Each entry carries a `liveStatus` field that's the freshest status
  // we have — liveOrderStatus for the current placedOrder, the listener-
  // updated po.status for past orders.
  const sessionOrders = useMemo(() => {
    const all = [];
    for (const po of pastOrders) {
      if (!po || !po.orderId) continue;
      all.push({
        orderId: po.orderId,
        orderNumber: po.orderNumber,
        total: po.total,
        liveStatus: po.status,
        paymentStatus: po.paymentStatus,
        orderType: po.orderType,
        items: po.items,
        isCurrent: false,
      });
    }
    if (placedOrder?.orderId) {
      all.push({
        orderId: placedOrder.orderId,
        orderNumber: placedOrder.orderNumber,
        total: placedOrder.total,
        liveStatus: liveOrderStatus,
        paymentStatus: placedOrder.paymentStatus,
        orderType: placedOrder.orderType,
        items: placedOrder.items,
        isCurrent: true,
      });
    }
    return all;
  }, [pastOrders, placedOrder, liveOrderStatus]);

  // Highest-priority status across non-finished orders. Drives FAB label.
  // Order: ready (action needed) > preparing > pending > awaiting_payment.
  // Returns null if every order is served / cancelled / has no live state.
  const fabAggregateStatus = useMemo(() => {
    const live = sessionOrders.filter(o =>
      o.liveStatus && o.liveStatus !== 'served' && o.liveStatus !== 'cancelled'
    );
    if (live.length === 0) return null;
    const priority = ['ready', 'preparing', 'pending', 'awaiting_payment'];
    for (const s of priority) {
      if (live.some(o => o.liveStatus === s)) return s;
    }
    return live[0].liveStatus;
  }, [sessionOrders]);

  // Count of orders the customer is actively tracking (not served, not
  // cancelled). Used by the FAB to show a "+1" badge when there's more
  // than one in flight, hinting that the success-view tabs exist.
  const fabActiveOrderCount = useMemo(() =>
    sessionOrders.filter(o =>
      o.liveStatus && o.liveStatus !== 'served' && o.liveStatus !== 'cancelled'
    ).length,
  [sessionOrders]);

  // Order whose timeline is currently being shown in the success view.
  // Defaults to the latest placedOrder; switchable via tabs.
  const viewingSuccessOrder = useMemo(() => {
    if (selectedSuccessOrderId) {
      const found = sessionOrders.find(o => o.orderId === selectedSuccessOrderId);
      if (found) return found;
    }
    if (placedOrder?.orderId) {
      return sessionOrders.find(o => o.orderId === placedOrder.orderId) || null;
    }
    return null;
  }, [selectedSuccessOrderId, placedOrder, sessionOrders]);

  const viewingSuccessOrderStatus = viewingSuccessOrder?.liveStatus || null;

  // Default the success-view tab to the latest order each time the
  // success view opens, mirroring the bill-modal pattern. Reset on close
  // so the next open re-defaults instead of remembering a tab from a
  // session ago.
  useEffect(() => {
    if (orderStep !== 'success' || !cartOpen) {
      setSelectedSuccessOrderId(null);
      return;
    }
    if (placedOrder?.orderId) {
      setSelectedSuccessOrderId(prev => prev || placedOrder.orderId);
    }
  }, [orderStep, cartOpen, placedOrder?.orderId]);

  // ── Phase N — Feedback prompt trigger ────────────────────────────────
  // When ANY session order transitions to 'served' (= picked up for
  // takeaway, cleared for dine-in) and we haven't yet asked the customer
  // about it, open the rating prompt for that order. We pick the first
  // such unrated order so multi-order sessions get rated in chronological
  // order — the customer rates #9 first, #10 second.
  // Skipping counts the same as submitting (the orderId goes into
  // ratedOrderIds either way) so we never bug the customer twice for
  // the same order.
  useEffect(() => {
    if (feedbackForOrderId) return;  // already prompting for one
    const candidate = sessionOrders.find(so =>
      so.liveStatus === 'served' && !ratedOrderIds.includes(so.orderId)
    );
    if (candidate) {
      setFeedbackForOrderId(candidate.orderId);
      setFeedbackRating(0);
      setFeedbackComment('');
    }
  }, [sessionOrders, ratedOrderIds, feedbackForOrderId]);

  // (showOrderMoreCard state declared earlier, near the other modal-
  // overlay flags, so the body-scroll-lock useEffect's deps array can
  // reference it without a TDZ error during component render.)

  // Mark an order as "we've asked about this" — used on both submit
  // and skip paths, plus persisted to sessionStorage so reload doesn't
  // re-prompt for an already-rated/skipped order.
  const dismissFeedbackPrompt = useCallback((orderId) => {
    // Detect dine-in BEFORE clearing feedbackForOrderId so we can
    // queue the order-more card. Look up the rated order across
    // sessionOrders + placedOrder + pastOrders.
    const rated = sessionOrders.find(o => o.orderId === orderId);
    const fromCurrent = placedOrder?.orderId === orderId ? placedOrder : null;
    const fromPast = pastOrders.find(po => po.orderId === orderId);
    const orderType = rated?.orderType || fromCurrent?.orderType || fromPast?.orderType;
    const isDineIn = orderType === 'dinein' || (!orderType && !!placedOrder?.tableNumber);

    setFeedbackForOrderId(null);
    setFeedbackRating(0);
    setFeedbackComment('');
    setRatedOrderIds(prev => {
      if (prev.includes(orderId)) return prev;
      const next = [...prev, orderId];
      try { sessionStorage.setItem('ar_rated_orders', JSON.stringify(next)); } catch {}
      return next;
    });
    if (isDineIn) {
      // Defer one tick so the rating sheet fully closes before the card
      // pops in — feels less jarring on slow phones.
      setTimeout(() => setShowOrderMoreCard(true), 200);
    }
  }, [sessionOrders, placedOrder, pastOrders]);

  const handleFeedbackSubmit = useCallback(async () => {
    if (!feedbackForOrderId || !restaurant?.id) return;
    if (!feedbackRating) {
      toast.error('Tap a star to rate first.');
      return;
    }
    if (feedbackSending) return;
    setFeedbackSending(true);
    try {
      // Find the order being rated. Could be the current placedOrder or
      // a past order — pull metadata from whichever source has it so
      // the admin/feedback page sees full context (items, total, table).
      const fromCurrent = placedOrder?.orderId === feedbackForOrderId ? placedOrder : null;
      const fromPast = pastOrders.find(po => po.orderId === feedbackForOrderId);
      const orderInfo = fromCurrent || fromPast || {};
      const orderItems = (orderInfo.items || []).map(it => ({
        id: it.id || null,
        name: String(it.name || ''),
        qty: Number(it.qty) || 1,
      }));
      await submitFeedback(restaurant.id, {
        rating: Number(feedbackRating),
        comment: String(feedbackComment || '').slice(0, 500),
        orderItems,
        tableNumber: orderInfo.tableNumber || placedOrder?.tableNumber || null,
        orderId: feedbackForOrderId,
        orderTotal: Number(orderInfo.total) || 0,
        isRead: false,
      });
      toast.success('Thanks for your feedback!');
      dismissFeedbackPrompt(feedbackForOrderId);
    } catch (e) {
      toast.error('Could not submit feedback. Please try again.');
    } finally {
      setFeedbackSending(false);
    }
  }, [feedbackForOrderId, restaurant?.id, feedbackRating, feedbackComment, feedbackSending, placedOrder, pastOrders, dismissFeedbackPrompt]);

  // ── Phase A — Aggregated bill view model ─────────────────────────────
  // Unified shape compatible with both:
  //   - the running-bill case (multiple orders attached to one bill →
  //     items + totals are summed across them)
  //   - the single-order case (takeaway / pre-Phase-A orders without a
  //     billId → fall back to the placedOrder shape)
  // The bill modal renders from this so the same JSX handles both cases.
  const bill = useMemo(() => {
    const useBill = currentBillId && billOrders.length > 0;
    // Single-order view: use the order the customer has tabbed to
    // (viewingBillOrder), not always the latest placedOrder. Falls back
    // to placedOrder when no tab is selected (initial open / no past
    // orders), so behaviour is unchanged for single-order sessions.
    const singleOrder = viewingBillOrder || placedOrder;
    const orders = useBill
      ? billOrders
      : (singleOrder ? [{ id: singleOrder.orderId, ...singleOrder }] : []);
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
  }, [currentBillId, billOrders, placedOrder, viewingBillOrder]);

  // ── May 3 — Reusable thermal-receipt HTML builder ────────────────────
  // Single source of truth for the printable bill: previously this was
  // inline inside the Print Bill onClick, which meant the auto-open
  // flow couldn't reuse it. Pulled out here so both:
  //   - the Print Bill button (existing iframe-print flow)
  //   - the post-payment auto-open-in-new-tab flow (Phase M-lite)
  // generate identical HTML. Takes an explicit billArg so the
  // post-payment flow can pass a fresh bill object even if the bill
  // memo hasn't yet caught up to the listener-driven update that
  // payment confirmation triggers.
  const buildBillHtml = useCallback((billArg, paymentMethodArg) => {
    const b = billArg || bill;
    if (!b) return null;
    const rName = restaurant?.name || 'Restaurant';
    const rAddress = restaurant?.address || '';
    const rPhone = restaurant?.phone || '';
    const rGstin = restaurant?.gstNumber || '';
    const rFssai = restaurant?.fssaiNo || '';
    const rHsn = restaurant?.hsnCode || '';
    const rFooter = (restaurant?.billFooter && restaurant.billFooter.trim()) || 'Thank you! Visit again';
    const tbl = b.tableNumber && b.tableNumber !== 'Not specified' ? b.tableNumber : '';
    const stampDate = b.paidAtMs ? new Date(b.paidAtMs) : new Date();
    const dateStr = stampDate.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
    const timeStr = stampDate.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
    const itemsHtml = (b.items || []).map(it =>
      `<tr><td style="text-align:left">${it.name} x${it.qty}</td><td style="text-align:right">Rs.${(it.price * it.qty).toFixed(0)}</td></tr>`
    ).join('');
    const sub = b.subtotal || b.total;
    const gstPct = b.gstPercent;
    const scPct = b.serviceChargePercent;
    const sc = b.serviceCharge;
    const cgst = b.cgst;
    const sgst = b.sgst;
    const disc = b.discount;
    const ro = b.roundOff;
    const grand = b.total;
    const scRow = sc > 0 ? `<tr><td>Service Charge (${scPct}%)</td><td style="text-align:right">Rs.${sc.toFixed(2)}</td></tr>` : '';
    const cgstRow = cgst > 0 ? `<tr><td>C.G.S.T ${(gstPct/2).toFixed(1)}%</td><td style="text-align:right">Rs.${cgst.toFixed(2)}</td></tr>` : '';
    const sgstRow = sgst > 0 ? `<tr><td>S.G.S.T ${(gstPct/2).toFixed(1)}%</td><td style="text-align:right">Rs.${sgst.toFixed(2)}</td></tr>` : '';
    const discRow = disc > 0 ? `<tr><td>Discount${b.couponCode ? ' ('+b.couponCode+')' : ''}</td><td style="text-align:right">-Rs.${disc.toFixed(0)}</td></tr>` : '';
    const roRow = ro !== 0 ? `<tr><td>Round off</td><td style="text-align:right">${ro > 0 ? '+' : ''}Rs.${ro.toFixed(2)}</td></tr>` : '';
    const pmLabel = paymentMethodArg === 'cash' ? 'Cash'
                  : paymentMethodArg === 'card' ? 'Card'
                  : paymentMethodArg === 'upi' ? 'UPI' : '';
    const orderRefHtml = (() => {
      if (b.isBill && currentBillId) {
        return `<div class="center" style="font-size:10px;margin-top:2px">Bill #${currentBillId.slice(-6).toUpperCase()} · ${b.orderCount} order${b.orderCount === 1 ? '' : 's'}</div>`;
      }
      if (typeof placedOrder?.orderNumber === 'number' && placedOrder.orderNumber > 0) {
        return `<div class="center" style="font-size:10px;margin-top:2px">Order #${placedOrder.orderNumber}</div>`;
      }
      if (placedOrder?.orderId) {
        return `<div class="center" style="font-size:10px;margin-top:2px">Order #${placedOrder.orderId.slice(-6).toUpperCase()}</div>`;
      }
      return '';
    })();
    return `<!DOCTYPE html><html><head><title>Bill — ${rName}</title><meta name="viewport" content="width=device-width, initial-scale=1"><style>
      @page{size:80mm auto;margin:4mm}
      *{margin:0;padding:0;box-sizing:border-box}
      body{font-family:'Courier New',monospace;font-size:12px;width:72mm;margin:0 auto;padding:8px 0}
      @media (min-width:600px) { body { width: 320px; padding: 16px 0; } }
      .center{text-align:center}
      .bold{font-weight:bold}
      .line{border-top:1px dashed #000;margin:6px 0}
      table{width:100%;border-collapse:collapse}
      td{padding:2px 0;vertical-align:top}
      .total td{font-weight:bold;font-size:14px;padding-top:6px}
      .actions{margin:14px auto 0;text-align:center}
      .actions button{padding:8px 16px;border-radius:6px;border:1px solid #000;background:#fff;font-family:inherit;cursor:pointer;font-size:11px;margin:0 4px}
      @media print { .actions { display: none; } }
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
      <div class="actions">
        <button onclick="window.print()">Print</button>
        <button onclick="window.close()">Close</button>
      </div>
    </body></html>`;
  }, [bill, restaurant, currentBillId, placedOrder]);

  // ── May 3 — Bill delivery helper (popup OR download) ──────────────────
  // Tries window.open() first — best UX, opens the receipt as a live
  // page. If the browser blocks the popup (mobile Safari / strict
  // desktop blockers), silently falls back to a Blob-URL download:
  // anchor with download="..." attribute, programmatic click. Downloads
  // are NEVER blocked the way popups are, so the customer ALWAYS ends
  // up with a copy of their bill — no error toasts, no "please allow
  // popups" friction.
  //
  // CRITICAL — must be called synchronously inside a user-gesture
  // handler (onClick). Browsers gate window.open + download anchor
  // clicks on user activation; calling this from inside an `await`
  // chain after the gesture has expired will fail. Pre-open the
  // popup BEFORE any awaits, then write the HTML when the async
  // work resolves. (The buildBillHtml output is generated from
  // current state synchronously, so we don't need to wait.)
  //
  // Returns:
  //   { popup: Window | null, downloaded: boolean }
  // - popup: the new-tab handle if window.open succeeded; null if
  //   blocked (caller should treat the bill as already-delivered via
  //   download in that case)
  // - downloaded: true when we fell back to download
  const deliverBill = useCallback((html, filename) => {
    if (!html) return { popup: null, downloaded: false };
    // Try the popup path first — synchronous, must run in gesture.
    let popup = null;
    try {
      popup = window.open('about:blank', '_blank');
    } catch { popup = null; }
    if (popup) {
      try {
        popup.document.open();
        popup.document.write(html);
        popup.document.close();
        return { popup, downloaded: false };
      } catch {
        // document.write threw (cross-origin sandbox or similar) —
        // close the popup and fall through to download.
        try { popup.close(); } catch {}
        popup = null;
      }
    }
    // Popup blocked or write failed — fall back to download. Always
    // works because anchor downloads aren't gated on user activation
    // the way popups are.
    try {
      const safeName = (filename || 'bill').replace(/[^a-z0-9_\-]/gi, '_').slice(0, 64);
      const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${safeName}.html`;
      a.style.display = 'none';
      document.body.appendChild(a);
      a.click();
      // Defer cleanup — some browsers process the download asynchronously
      // and revoking too early cancels it.
      setTimeout(() => {
        try { a.remove(); URL.revokeObjectURL(url); } catch {}
      }, 1500);
      toast('Bill saved to your downloads', { icon: '📥', duration: 3500 });
      return { popup: null, downloaded: true };
    } catch (err) {
      console.warn('[deliverBill] download fallback failed:', err);
      return { popup: null, downloaded: false };
    }
  }, []);

  // ── May 3 — Auto-deliver bill ONLY after payment is confirmed ────────
  // Previously deliverBill ran on the "Confirm Cash/Card/UPI" tap, which
  // gave the customer a receipt before money had actually changed hands.
  // Customer-reported issue: "shouldn't appear until payment is
  // confirmed." Now we watch billPaymentState — flips to 'paid' only
  // when admin marks paid (cash/card) OR the gateway webhook fires
  // (UPI). At that moment we generate the receipt HTML and call
  // deliverBill (popup-or-download fallback).
  //
  // Caveat: the listener fires WITHOUT a fresh user gesture, so
  // window.open will likely be blocked by the browser; deliverBill's
  // download path takes over. Customer either gets a new tab (if
  // browser allows) or an HTML download. The "Open or Save Bill" CTA
  // inside the Payment Confirmed card stays as a manual fallback for
  // the rare case both auto-paths fail.
  //
  // Dedup: we track delivered keys in a ref so a noisy listener
  // (Firestore can double-fire) doesn't double-deliver. Key is
  // currentBillId for dine-in running tabs, orderId for single-order
  // takeaway. A new order in the same session uses a different key,
  // so the next paid transition delivers fresh.
  //
  // Placement: this MUST live AFTER bill, buildBillHtml and deliverBill
  // are all declared — JS Temporal Dead Zone otherwise. The build
  // failed once with "Cannot access 'dg' before initialization" when
  // this lived above bill's useMemo.
  const billDeliveredRef = useRef(new Set());
  useEffect(() => {
    if (billPaymentState !== 'paid') return;
    const key = (currentBillId && billOrders.length > 0)
      ? currentBillId
      : viewingBillOrder?.orderId;
    if (!key) return;
    if (billDeliveredRef.current.has(key)) return;
    billDeliveredRef.current.add(key);
    const html = buildBillHtml(bill, billPaymentMethod);
    if (!html) {
      // Bill object hasn't caught up yet — release the dedup so the
      // next render attempt can retry once data is ready.
      billDeliveredRef.current.delete(key);
      return;
    }
    const safeKey = String(key).slice(-6);
    deliverBill(html, `bill-${restaurant?.subdomain || 'order'}-${safeKey}`);
  }, [billPaymentState, currentBillId, billOrders.length, viewingBillOrder?.orderId, bill, billPaymentMethod, restaurant?.subdomain, deliverBill, buildBillHtml]);

  // Phase B (Petpooja hybrid) — push TAKEAWAY orders to Petpooja
  // POS only AFTER payment confirms. The save_order API takes
  // payment_type at order-create time and has no update-payment
  // endpoint, so for the pay-first takeaway flow we wait until we
  // know the customer actually paid (CASH/CARD/ONLINE), then push.
  //
  // Dine-in pushes happen in placeOrder() right after createOrder
  // succeeds (see that function for the matching call).
  //
  // Dedup'd via the same billDeliveredRef set as auto-deliver above
  // — we use a different prefix in the key so the two paths don't
  // collide.
  //
  // ZERO impact on standalone / non-Pro restaurants — exits early
  // when posMode !== 'petpooja_hybrid'.
  const petpoojaPushedRef = useRef(new Set());
  useEffect(() => {
    if (restaurant?.posMode !== 'petpooja_hybrid') return;
    if (billPaymentState !== 'paid') return;
    if (!placedOrder?.orderId) return;
    if (placedOrder.orderType !== 'takeaway') return;
    if (placedOrder.petpoojaPushedAt) return;
    const key = placedOrder.orderId;
    if (petpoojaPushedRef.current.has(key)) return;
    petpoojaPushedRef.current.add(key);
    fetch('/api/petpooja/order-push', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ restaurantId: restaurant.id, orderId: key }),
    }).catch(err => console.warn('[petpooja] order-push (takeaway-paid) fire failed:', err?.message));
  }, [billPaymentState, restaurant?.posMode, restaurant?.id, placedOrder?.orderId, placedOrder?.orderType, placedOrder?.petpoojaPushedAt]);

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

  // May 1 — add items to an existing awaiting-payment order. Used when
  // the customer was on the payment screen, tapped "Add more items",
  // added stuff to the (now-empty) cart, then confirmed. Without this
  // branch placeOrder would have CREATED a new order and the original
  // would have been orphaned in Firestore (the user-reported "old order
  // gets replaced" bug).
  //
  // Server-side endpoint validates prices + recalculates totals so a
  // tampered cart can't undercharge. Resets paymentStatus to 'unpaid'
  // if it was *_requested — customer needs to re-confirm the new
  // total before the cashier collects.
  const addItemsToOrder = async () => {
    if (!restaurant?.id || !placedOrder?.orderId || cart.length === 0) return;
    if (placeOrderInFlightRef.current) return;
    placeOrderInFlightRef.current = true;
    setIsSubmitting(true);
    try {
      // Re-validate prices from live menu (same logic as placeOrder).
      const freshCart = cart.map(c => {
        const live = enrichedItems.find(i => i.id === c.id);
        if (!live) return c;
        const basePriceLive = live.offerPrice ?? live.price ?? 0;
        const deltaSum = (c.variant?.priceDelta || 0)
          + (c.addOns || []).reduce((s, a) => s + (a.priceDelta || 0), 0);
        return { ...c, price: basePriceLive + deltaSum };
      });
      const r = await fetch('/api/orders/add-items', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          restaurantId: restaurant.id,
          orderId: placedOrder.orderId,
          newItems: freshCart.map(c => ({
            id: c.id,
            name: c.name,
            price: c.price,
            qty: c.qty,
            note: c.note || '',
            modNote: c.modNote || '',
            modDelta: (c.variant?.priceDelta || 0)
              + (c.addOns || []).reduce((s, a) => s + (a.priceDelta || 0), 0),
            variant: c.variant || null,
            addOns: c.addOns || [],
          })),
        }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) {
        // Loud + structured logging so future failures have a paper
        // trail in the console — previously the catch block ate the
        // server response and the customer saw a generic "Try again".
        console.error('[add-items] server returned non-OK', {
          status: r.status,
          orderId: placedOrder.orderId,
          error: j.error,
          message: j.message,
          itemCount: freshCart.length,
          fullResponse: j,
        });
        if (j.error === 'ORDER_NOT_EDITABLE') {
          // The order is past awaiting_payment (most common: customer's
          // FIRST order was already paid + sent to the kitchen). Don't
          // wipe placedOrder — the user may want to keep tracking the
          // old order's kitchen status. Just dump back to the cart so
          // tapping Place Order creates a fresh, separate order. The
          // multi-order tracking added in this commit means both orders
          // remain visible to the customer.
          toast("This order is already in the kitchen. Placing a new order for these items.", { icon: 'ℹ️', duration: 4000 });
          setOrderStep('cart');
          return;
        }
        if (j.error === 'No valid items to add') {
          toast.error('None of those items could be added — they may have been removed from the menu. Refresh and try again.');
          return;
        }
        throw new Error(j.message || j.error || `Add-items failed (HTTP ${r.status})`);
      }
      // Update the local placedOrder with the merged items + new total
      // so the payment screen reflects the change immediately. The
      // listener on the order doc will also pick up the changes within
      // a beat — this is just to avoid a flicker.
      const updated = {
        ...placedOrder,
        items: j.items,
        subtotal: j.subtotal,
        cgst: j.cgst, sgst: j.sgst, serviceCharge: j.serviceCharge,
        discount: j.discount, roundOff: j.roundOff, total: j.total,
        // If the server reset paymentStatus, mirror that locally too
        // so the payment-step "isWaiting" check evaluates correctly.
        paymentStatus: j.paymentStatusReset ? 'unpaid' : placedOrder.paymentStatus,
      };
      setPlacedOrder(updated);
      try { sessionStorage.setItem('ar_placed_order', JSON.stringify(updated)); } catch {}
      clearCart();
      setOrderStep('payment');
      setCartOpen(true);
      const addedQty = freshCart.reduce((s, c) => s + (Number(c.qty) || 1), 0);
      toast.success(`Added ${addedQty} item${addedQty === 1 ? '' : 's'} · New total ₹${j.total}`);
    } catch (e) {
      console.error('[add-items] threw', { message: e?.message, code: e?.code, stack: e?.stack });
      // Surface the actual error message instead of a generic toast —
      // the customer can read it (network down, item missing, etc.)
      // and decide whether to retry or change something.
      const msg = e?.message && e.message !== 'add-items failed'
        ? `Couldn't add: ${e.message}`
        : 'Could not add items. Check your connection and try again.';
      toast.error(msg);
    } finally {
      placeOrderInFlightRef.current = false;
      setIsSubmitting(false);
    }
  };

  const placeOrder = async () => {
    if (!restaurant?.id || cart.length === 0) return;
    // Idempotency guard — see placeOrderInFlightRef declaration above.
    if (placeOrderInFlightRef.current) return;

    // May 1 — Branch: if the customer already has an awaiting-payment
    // order, this Place-Order tap is actually "add these items to the
    // existing order". Route through the dedicated server-side merger
    // instead of creating a new order doc. Skips the form/phone
    // validation because the customer already filled those when they
    // placed the original order.
    const isAddingToExisting = placedOrder?.orderId
      && liveOrderStatus === 'awaiting_payment'
      && placedOrder.orderType === 'takeaway';
    if (isAddingToExisting) {
      return addItemsToOrder();
    }

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

      // Persist optional email if filled — used by future Phase M
      // email triggers (payment-confirmation + order-ready receipts).
      // Validated lightly (must contain @) so we don't store obvious
      // typos; full RFC validation happens server-side at send time.
      const emailRaw = (customerEmail || '').trim();
      const emailValid = emailRaw && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailRaw);
      const finalEmail = emailValid ? emailRaw : null;

      const orderId = await createOrder(restaurant.id, {
        tableNumber: finalTable,
        orderType: finalOrderType,
        billId: billIdForOrder, // null for takeaway / non-QR — preserves single-order behaviour
        customerName: finalOrderType === 'takeaway' ? (customerName.trim() || '') : '',
        customerPhone: phone || null,
        customerEmail: finalEmail,
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
        customerEmail: finalEmail,
        createdAtMs: Date.now(),
      };
      // May 1 — archive the previous placedOrder before overwriting.
      // Only archive if it was past awaiting_payment (i.e., the customer
      // had paid + the kitchen had it / was past kitchen). Awaiting +
      // unpaid orders are abandoned-cart scenarios; archiving those
      // would leave dead entries the customer never wanted to track.
      // Cancelled orders are filtered out of the archive too.
      if (placedOrder?.orderId && placedOrder.orderId !== orderId) {
        const carryStatuses = ['pending', 'preparing', 'ready', 'served'];
        if (carryStatuses.includes(liveOrderStatus)) {
          setPastOrders(prev => {
            const already = prev.some(p => p.orderId === placedOrder.orderId);
            if (already) return prev;
            const next = [...prev, { ...placedOrder, status: liveOrderStatus }];
            try { sessionStorage.setItem('ar_past_orders', JSON.stringify(next)); } catch {}
            return next;
          });
        }
      }
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

      // Phase B (Petpooja hybrid) — push DINE-IN orders to Petpooja
      // POS immediately. Takeaway orders are pushed AFTER payment
      // confirms (see the billPaymentState='paid' useEffect) because
      // Petpooja's API takes payment_type at order-create time and
      // there's no after-the-fact way to update it. Dine-in pushes
      // with payment_type=COD; cashier reconciles later in Petpooja's
      // own UI when the customer pays.
      //
      // ZERO impact on standalone / non-Pro restaurants — this whole
      // branch is no-op when posMode !== 'petpooja_hybrid'.
      if (
        !isTakeaway
        && restaurant?.posMode === 'petpooja_hybrid'
      ) {
        // Fire-and-forget; never blocks the customer's UX.
        fetch('/api/petpooja/order-push', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ restaurantId: restaurant.id, orderId }),
        }).catch(err => console.warn('[petpooja] order-push fire failed:', err?.message));
      }
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

  // May 1 — Reusable past-orders JSX. Built once per render, dropped
  // into both the success view and the payment view so the customer
  // can see all session orders from either screen.
  const pastOrdersBlock = pastOrders.length === 0 ? null : (() => {
    const STATUS_LABEL = {
      awaiting_payment: 'Awaiting payment',
      pending: 'Order placed',
      preparing: 'Preparing',
      ready: 'Ready for pickup',
      served: 'Picked up',
      cancelled: 'Cancelled',
    };
    const STATUS_COLOR = {
      awaiting_payment: '#D9534F',
      pending: '#B8472D',
      preparing: '#B8472D',
      ready: '#2D8B4E',
      served: '#7AA88E',
      cancelled: 'rgba(0,0,0,0.4)',
    };
    return (
      <div style={{ width: '100%', maxWidth: 380, marginTop: 8 }}>
        <div style={{
          fontSize: 11, fontWeight: 700, letterSpacing: '0.06em',
          textTransform: 'uppercase',
          color: darkMode ? 'rgba(255,245,232,0.5)' : 'rgba(42,31,16,0.5)',
          marginBottom: 8, textAlign: 'left', paddingLeft: 4,
        }}>
          Your earlier orders this visit
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {pastOrders.map(po => {
            const label = STATUS_LABEL[po.status] || po.status;
            const color = STATUS_COLOR[po.status] || '#B8472D';
            const ref = po.orderNumber
              ? `#${po.orderNumber}`
              : `#${(po.orderId || '').slice(-6).toUpperCase()}`;
            const itemCount = (po.items || []).reduce((s, it) => s + (Number(it.qty) || 1), 0);
            return (
              <div key={po.orderId} style={{
                padding: '10px 14px', borderRadius: 12,
                background: darkMode ? 'rgba(255,255,255,0.04)' : 'rgba(42,31,16,0.04)',
                border: `1px solid ${darkMode ? 'rgba(255,245,232,0.07)' : 'rgba(42,31,16,0.07)'}`,
                display: 'grid', gridTemplateColumns: '1fr auto', gap: 10, alignItems: 'center',
                textAlign: 'left',
              }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{
                    fontSize: 13, fontWeight: 700,
                    color: darkMode ? '#FFF5E8' : '#1E1B18',
                  }}>
                    Order {ref} · ₹{Math.round(Number(po.total) || 0).toLocaleString('en-IN')}
                  </div>
                  <div style={{
                    fontSize: 11,
                    color: darkMode ? 'rgba(255,245,232,0.45)' : 'rgba(42,31,16,0.45)',
                    marginTop: 2,
                  }}>
                    {itemCount} item{itemCount === 1 ? '' : 's'}
                  </div>
                </div>
                <span style={{
                  fontSize: 10, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase',
                  padding: '4px 10px', borderRadius: 999,
                  background: `${color}1A`, color,
                  whiteSpace: 'nowrap',
                }}>
                  {label}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    );
  })();

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
      <div style={{ width: 32, height: 32, border: '3px solid #B8472D', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
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
          /* No transform transition — JS sets transition:none and
             updates transform per-frame (Medium-style finger-track).
             Only the snap animation toggles a brief 0.3s transition
             via inline style. */
          transition: background 0.4s ease, border-color 0.4s ease;
          will-change: transform;
        }
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
          background: linear-gradient(145deg,#B8472D,#F4C06A);
          display: flex; align-items: center; justify-content: center;
          font-size: 20px;
          box-shadow: 0 3px 12px rgba(184,71,45,0.35);
        }
        .r-name { font-size: 17px; font-weight: 700; color: #1E1B18; letter-spacing: -0.3px; line-height: 1.2; }
        .r-sub  { font-size: 12px; color: #9A9A9A; margin-top: 2px; letter-spacing: -0.1px; }

        .ar-badge {
          flex-shrink: 0;
          display: flex; align-items: center; gap: 5px;
          padding: 5px 12px; border-radius: 20px;
          background: rgba(184,71,45,0.1);
          border: 1px solid rgba(184,71,45,0.25);
          font-size: 11px; font-weight: 600; color: #E07020;
          letter-spacing: 0.01em;
        }
        .ar-dot { width: 6px; height: 6px; border-radius: 50%; background: #B8472D; animation: blink 1.8s infinite; }

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
          background: rgba(184,71,45,0.07);
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
          background: rgba(184,71,45,0.14);
          color: #1E1B18;
        }
        .cat-pill:active { opacity: 0.85; }
        /* ── Active pill — amber fill, same physical size ── */
        .cat-pill.on {
          background: #B8472D;
          color: #FFFFFF;
          font-weight: 600;
          border-color: transparent;
          box-shadow: 0 4px 16px rgba(184,71,45,0.38), 0 1px 4px rgba(184,71,45,0.2);
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

        /* iOS auto-zoom guard: any input/textarea/select with a
           font-size below 16px causes Mobile Safari to zoom in when
           focused. Force a minimum of 16px on every text input across
           the customer page. !important is needed because several
           inputs (coupon code, table number, customer name, email,
           phone, special instructions) carry inline fontSize styles
           that would otherwise win on cascade. */
        input[type="text"], input[type="search"], input[type="number"],
        input[type="email"], input[type="tel"], input[type="password"],
        input:not([type]), textarea {
          font-size: 16px !important;
        }

        /* ─────────── MENU SEARCH BAR (May 8) ───────────
           Search lives in the header now — a small icon next to the
           language picker. Tap → expands an inline pill input that
           pushes the AR / language widgets out of view; clearing or
           dismissing collapses back to just the icon. */
        /* Search icon button in the header — same hit area as the
           language picker, lives next to the AR Live badge. */
        .hdr-search-btn {
          width: 34px; height: 34px;
          border-radius: 50%;
          background: rgba(184,71,45,0.10);
          border: 1px solid rgba(184,71,45,0.22);
          color: #9A371F;
          display: inline-flex; align-items: center; justify-content: center;
          cursor: pointer; padding: 0;
          flex-shrink: 0;
          transition: background 0.15s ease, transform 0.15s ease;
        }
        .hdr-search-btn:hover { background: rgba(184,71,45,0.18); }
        .hdr-search-btn:active { transform: scale(0.95); }
        .hdr-search-btn.on {
          background: #B8472D; color: #FFFFFF;
          border-color: rgba(184,71,45,0.55);
          box-shadow: 0 4px 10px rgba(184,71,45,0.30);
        }
        .dm .hdr-search-btn { background: rgba(184,71,45,0.18); border-color: rgba(184,71,45,0.30); color: #E89E7C; }

        /* When expanded the search input occupies the full second
           row of the header — same width as the cat-tile-strip — so
           the typed query is comfortable to read and clear. */
        .menu-search {
          display: flex; align-items: center; gap: 8px;
          padding: 8px 14px;
          margin: 8px 4px;
          background: #FFFFFF;
          border: 1px solid rgba(184,71,45,0.30);
          border-radius: 999px;
          box-shadow: 0 1px 3px rgba(0,0,0,0.04);
          transition: border-color 0.15s ease, box-shadow 0.15s ease;
          animation: menuSearchSlide 0.22s ease both;
        }
        @keyframes menuSearchSlide {
          from { opacity: 0; transform: translateY(-4px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .menu-search:focus-within {
          border-color: rgba(184,71,45,0.55);
          box-shadow: 0 2px 12px rgba(184,71,45,0.18);
        }
        .menu-search svg { flex-shrink: 0; color: rgba(42,31,16,0.4); }
        .menu-search input {
          flex: 1; min-width: 0;
          border: none; background: transparent; outline: none;
          font-family: 'Inter', sans-serif;
          /* 16px stays — global rule above already protects against iOS
             zoom but spelled here too so the styling is self-evident. */
          font-size: 16px; color: #1E1B18;
          padding: 4px 0;
        }
        .menu-search input::placeholder { color: rgba(42,31,16,0.42); }
        .menu-search-clear {
          flex-shrink: 0;
          width: 22px; height: 22px;
          border-radius: 50%; border: none;
          background: rgba(42,31,16,0.07);
          color: rgba(42,31,16,0.6);
          font-size: 14px; line-height: 1; padding: 0;
          cursor: pointer;
          display: inline-flex; align-items: center; justify-content: center;
        }
        .menu-search-clear:hover { background: rgba(42,31,16,0.12); }
        .dm .menu-search { background: rgba(255,255,255,0.06); border-color: rgba(255,245,232,0.12); }
        .dm .menu-search input { color: #FFF5E8; }
        .dm .menu-search input::placeholder { color: rgba(255,245,232,0.42); }
        .dm .menu-search-clear { background: rgba(255,255,255,0.10); color: rgba(255,245,232,0.7); }

        .search-empty {
          padding: 36px 16px 20px;
          text-align: center;
          color: rgba(42,31,16,0.55);
        }
        .search-empty .se-icon { font-size: 36px; margin-bottom: 10px; }
        .search-empty .se-title { font-weight: 700; color: #1E1B18; font-size: 15px; margin-bottom: 4px; }
        .search-empty .se-sub { font-size: 12px; }
        .dm .search-empty .se-title { color: #FFF5E8; }

        /* ─────────── CATEGORY IMAGE-TILE STRIP (May 8) ───────────
           Replaces the small text pills with bigger, image-led tiles
           inspired by food-delivery app top-nav patterns. Each tile
           is a circular dish photo with the category label below.
           Tapping a tile smooth-scrolls the page to that category's
           section in the menu list (no filtering — see step 2). The
           "Featured" tile (when present) is gold-accented to stand
           apart from regular categories. */
        .cat-tile-strip {
          display: flex;
          gap: 14px;
          overflow-x: auto;
          overflow-y: visible;
          padding: 6px 4px 8px;
          scrollbar-width: none;
          -webkit-overflow-scrolling: touch;
        }
        .cat-tile-strip::-webkit-scrollbar { display: none; }

        .cat-tile {
          flex: 0 0 auto;
          display: flex; flex-direction: column; align-items: center;
          gap: 6px; padding: 0; border: none;
          background: transparent; cursor: pointer;
          width: 76px;
          font-family: 'Inter', sans-serif;
          -webkit-tap-highlight-color: transparent;
        }
        .cat-tile-img {
          width: 64px; height: 64px;
          border-radius: 50%;
          /* Transparent fallback so the emoji/icon "floats" without a
             tinted circle behind it. When an image (admin-uploaded or
             first-item fallback) is set, background-image fills the
             circle as before. */
          background-color: transparent;
          background-size: cover; background-position: center;
          display: flex; align-items: center; justify-content: center;
          font-size: 36px; line-height: 1;
          border: 2px solid transparent;
          transition: transform 0.18s ease, border-color 0.18s ease, box-shadow 0.18s ease;
          flex-shrink: 0;
        }
        .cat-tile:hover .cat-tile-img,
        .cat-tile:focus-visible .cat-tile-img {
          transform: translateY(-2px);
          box-shadow: 0 6px 18px rgba(184,71,45,0.25);
          border-color: rgba(184,71,45,0.45);
        }
        .cat-tile:active .cat-tile-img { transform: translateY(0); }
        .cat-tile-label {
          font-size: 12px; font-weight: 600;
          color: #2B2B2B;
          letter-spacing: -0.1px;
          text-align: center;
          white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
          width: 76px; line-height: 1.2;
        }
        .dm .cat-tile-label { color: #FFF5E8; }
        /* Featured tile — gold accent ring + warmer label */
        .cat-tile.featured .cat-tile-img {
          background: linear-gradient(135deg, #D7644A, #B8472D);
          color: #1E1B18;
          border-color: rgba(184,71,45,0.55);
          box-shadow: 0 4px 14px rgba(184,71,45,0.35);
        }
        .cat-tile.featured .cat-tile-label {
          color: #9A371F;
          font-weight: 700;
        }
        .dm .cat-tile.featured .cat-tile-label { color: #D7644A; }

        /* ─────────── MAIN ─────────── */
        .main {
          max-width: 1080px; margin: 0 auto;
          padding: 20px 18px 110px;
          background: #FAF7F2;
          position: relative; z-index: 1;
        }

        /* AR strip — May 8 redesign with explanatory SVG. The previous
           banner just had an emoji + "10 dishes available in AR" copy
           which didn't clearly communicate WHAT AR does. The animation
           now physically demonstrates: a dish rises up out of the
           phone's screen and lands on a table beside it — same idea
           the customer will see when they tap "View in AR". */
        .ar-strip {
          /* v4 (May 8): theme-matched palette + prominent phone.
             User feedback on v3:
               - Too cartoonish (overly playful proportions, sparkles)
               - Phone wasn't prominent enough (110×72 with phone
                 occupying ~25% of the SVG)
               - Colours didn't match the rest of the page (cream
                 gradient + cold gray screen vs the warm orange theme)
             v4 makes the phone the focal element, drops cartoony
             sparkles, and uses the existing brand orange palette
             (#B8472D / #9A371F / cream) throughout. */
          display: flex; flex-direction: row;
          align-items: stretch; gap: 18px;
          padding: 14px 20px 14px 18px; margin-bottom: 18px;
          background: linear-gradient(135deg, #FFFFFF 0%, #F5EDE0 100%);
          border: 1px solid rgba(184,71,45,0.28);
          border-radius: 18px;
          box-shadow: 0 6px 20px rgba(184,71,45,0.10), 0 1px 3px rgba(0,0,0,0.04);
          animation: fadeUp 0.4s ease both;
          overflow: hidden;
          position: relative;
        }
        /* Vertical theme stripe on the right edge of the SVG slot —
           grounds the visual and adds a piece of brand colour
           anchoring the image area without resorting to sparkles. */
        .ar-strip-svg {
          width: 130px; height: 100px;
          flex-shrink: 0;
          z-index: 1;
        }
        .ar-strip-copy {
          display: flex; flex-direction: column; gap: 4px; min-width: 0;
          justify-content: center; z-index: 1; flex: 1;
        }
        .ar-strip-text {
          font-size: 15.5px; font-weight: 700; color: #1E1B18;
          letter-spacing: -0.3px; line-height: 1.2;
        }
        .ar-strip-sub  { font-size: 11.5px; color: rgba(42,31,16,0.62); line-height: 1.45; }
        .ar-strip-pill {
          display: inline-flex; align-items: center; gap: 4px;
          padding: 2px 9px;
          margin-top: 6px;
          align-self: flex-start;
          font-size: 10px; font-weight: 700;
          letter-spacing: 0.05em; text-transform: uppercase;
          color: #9A371F;
          background: rgba(184,71,45,0.16);
          border-radius: 999px;
        }
        .dm .ar-strip-pill { color: #E89E7C; background: rgba(184,71,45,0.24); }

        /* SVG animation v4 — phone is the dominant element on the
           left half of the viewBox; the dish rises out of its screen,
           moves to the right, and lands on a small table on the right.
           Sparkles dropped — too cartoonish per the user's feedback.
           Replaced with a single shimmer ring on the table that pulses
           when the dish lands, anchoring brand orange to the action. */
        .ar-strip-svg .ar-dish {
          transform-box: view-box;
          transform-origin: 0 0;
          animation: ar-dish-fly 5s cubic-bezier(0.42, 0, 0.18, 1) infinite;
        }
        @keyframes ar-dish-fly {
          0%   { transform: translate(60px, 76px) scale(0.18); opacity: 0; }
          10%  { transform: translate(60px, 74px) scale(0.42); opacity: 1; }
          40%  { transform: translate(60px, 48px) scale(0.85); opacity: 1; }
          60%  { transform: translate(160px, 90px) scale(1.05); opacity: 1; }
          68%  { transform: translate(160px, 94px) scale(1); opacity: 1; }
          90%  { transform: translate(160px, 94px) scale(1); opacity: 1; }
          100% { transform: translate(160px, 94px) scale(0.95); opacity: 0; }
        }
        .ar-strip-svg .ar-shimmer {
          transform-box: view-box;
          transform-origin: 160px 97px;
          animation: ar-shimmer 5s ease-in-out infinite;
          opacity: 0;
        }
        @keyframes ar-shimmer {
          0%, 56%, 92%, 100% { opacity: 0; transform: scale(0.55); }
          63%, 80%           { opacity: 0.85; transform: scale(1.05); }
        }
        /* Phone screen ambient glow — slow gentle pulse so the phone
           feels "lit" / active rather than a flat icon. */
        .ar-strip-svg .phone-glow {
          animation: phone-glow 5s ease-in-out infinite;
        }
        @keyframes phone-glow {
          0%, 35%, 100% { opacity: 0.8; }
          50%, 65%      { opacity: 1; }
        }
        .dm .ar-strip { background: linear-gradient(135deg, rgba(255,245,232,0.04), rgba(184,71,45,0.07)); border-color: rgba(184,71,45,0.30); }
        .dm .ar-strip-text { color: #FFF5E8; }
        .dm .ar-strip-sub  { color: rgba(255,245,232,0.55); }

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

        /* ─────────── QUICK-ADD (May 8) ───────────
           Floating + button in the bottom-right of every card image.
           Tap → adds 1 to cart without opening the detail modal.
           Once in cart, morphs into a − N + stepper for further qty
           changes. Items with variants (Half/Full etc.) open the
           detail modal instead so the customer picks a variant —
           we surface that intent with the same + button but route
           the click to openItem(). */
        .quick-add {
          position: absolute;
          right: 8px; bottom: 8px;
          z-index: 3;
          display: inline-flex; align-items: center; justify-content: center;
          min-width: 36px; height: 36px;
          padding: 0 4px;
          border-radius: 999px;
          background: #FFFFFF;
          /* Literal ink colour, NOT the --ink token. The token flips to cream
             in dark mode which makes the + invisible against the white circle.
             The white circle stays white in both modes by design, so the +
             must always be dark. */
          color: #1E1B18;
          font-family: 'Inter', sans-serif;
          font-size: 22px; font-weight: 800; line-height: 1;
          box-shadow: 0 4px 14px rgba(0,0,0,0.22);
          cursor: pointer;
          user-select: none;
          -webkit-tap-highlight-color: transparent;
          transition: transform 0.18s ease, box-shadow 0.18s ease, background 0.18s ease;
        }
        .quick-add:hover { transform: translateY(-1px); box-shadow: 0 6px 18px rgba(0,0,0,0.28); }
        .quick-add:active { transform: translateY(0); }
        .quick-add.in-cart {
          min-width: 84px;
          background: linear-gradient(135deg, #B8472D, #D7644A);
          color: #FFF5E8;
          gap: 4px;
          padding: 4px;
          box-shadow: 0 4px 14px rgba(184,71,45,0.45);
          font-size: 14px;
        }
        .quick-add .qa-step {
          display: inline-flex; align-items: center; justify-content: center;
          width: 24px; height: 24px;
          border-radius: 50%;
          background: rgba(255,255,255,0.22);
          font-size: 16px; font-weight: 800; line-height: 1;
          color: #FFF5E8;
          transition: background 0.15s ease;
        }
        .quick-add .qa-step:hover { background: rgba(255,255,255,0.36); }
        .quick-add .qa-qty {
          min-width: 18px; text-align: center;
          font-size: 14px; font-weight: 800;
          color: #FFF5E8;
          letter-spacing: 0.02em;
        }
        .quick-add.disabled { opacity: 0.45; cursor: not-allowed; }
        /* Dark mode: idle circle stays white (still readable, + always dark).
           In-cart pill uses the lighter terracotta gradient so it pops on the
           chocolate surface. */
        .dm .quick-add { background: #FFFFFF; color: #1E1B18; }
        .dm .quick-add.in-cart { background: linear-gradient(135deg, #D7644A, #BD4F33); color: #FFF5E8; }

        /* ─────────── CATEGORY SECTIONS (May 8 menu redesign) ───────────
           Each category is a horizontal-scroll row of full-info cards.
           Mobile: ~85% width per card so the next card peeks (signals
           horizontal scroll affordance). Larger viewports: fixed 280px
           cards so a few fit at once. CSS scroll-snap aligns each
           swipe to a card edge for clean pagination. */
        .cat-section { margin-bottom: 24px; }
        .cat-section-head {
          display: flex; align-items: baseline; gap: 10px;
          padding: 0 4px; margin: 0 0 10px;
        }
        .cat-section-title {
          font-family: 'Poppins', sans-serif;
          font-weight: 700; font-size: 18px;
          letter-spacing: -0.3px;
          margin: 0;
        }
        .dm .cat-section-title { color: #FFF5E8; }
        .cat-section-count {
          font-size: 11px; font-weight: 600;
          color: rgba(42,31,16,0.40);
          padding: 2px 8px; border-radius: 999px;
          background: rgba(42,31,16,0.05);
        }
        .dm .cat-section-count {
          color: rgba(255,245,232,0.45);
          background: rgba(255,255,255,0.06);
        }
        .cat-section.featured .cat-section-title { color: #9A371F; }
        .dm .cat-section.featured .cat-section-title { color: #D7644A; }

        .cat-row {
          display: flex; gap: 12px;
          overflow-x: auto; overflow-y: visible;
          scroll-snap-type: x mandatory;
          -webkit-overflow-scrolling: touch;
          padding: 0 4px 8px;
          scrollbar-width: none;
          /* Add a touch of right padding so the last card has breathing
             room and doesn't bump the viewport edge. */
          padding-right: 16px;
        }
        .cat-row::-webkit-scrollbar { display: none; }
        .cat-row .card {
          flex: 0 0 auto;
          width: 85%;
          max-width: 340px;
          scroll-snap-align: start;
        }
        @media (min-width: 600px) {
          .cat-row .card { width: 280px; max-width: 280px; }
        }

        /* ─────────── CARD — Apple App Store level ─────────── */
        .card {
          background: #FEFCF8;
          border-radius: 20px; overflow: hidden;
          cursor: pointer; position: relative; text-align: left;
          display: flex; flex-direction: column;
          will-change: transform;
          transition: transform 0.28s cubic-bezier(0.34,1.2,0.64,1), box-shadow 0.28s ease, border-color 0.28s ease;
          box-shadow:
            0 1px 3px rgba(0,0,0,0.06),
            0 4px 16px rgba(0,0,0,0.07);
          border: 1px solid rgba(42,31,16,0.10);
        }
        .card.chef-special {
          border: 1.5px solid rgba(184,71,45,0.35);
          box-shadow:
            0 1px 3px rgba(184,71,45,0.10),
            0 4px 16px rgba(184,71,45,0.12);
        }
        .card:hover  { transform: translateY(-6px); box-shadow: 0 16px 44px rgba(0,0,0,0.16); border-color: rgba(184,71,45,0.2); }
        .card.chef-special:hover { box-shadow: 0 16px 44px rgba(184,71,45,0.22); }
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
          position: absolute; top: 8px; right: 8px;
          display: flex; align-items: center; gap: 4px;
          background: rgba(26,22,18,0.86);
          backdrop-filter: blur(8px);
          color: #D7644A; font-size: 10px; font-weight: 700;
          padding: 4px 9px; border-radius: 8px;
          letter-spacing: 0.03em;
          z-index: 3;
        }

        /* Veg indicator — square w/ inner dot */
        .veg-ind {
          position: absolute; top: 8px; left: 8px;
          width: 16px; height: 16px; border-radius: 3px; border: 1.5px solid;
          background: #FFFFFF; display: flex; align-items: center; justify-content: center;
          z-index: 3;
        }
        .veg-ind.v  { border-color: #2A8048; }
        .veg-ind.nv { border-color: #C03020; }
        .veg-ind.v::after  { content:''; width:7px; height:7px; border-radius:50%; background:#2A8048; }
        .veg-ind.nv::after { content:''; width:7px; height:7px; border-radius:50%; background:#C03020; }

        /* Offer ribbon */
        .c-ribbon {
          position: absolute; bottom: 0; left: 0; right: 0;
          padding: 5px 12px; font-size: 10px; font-weight: 800; color: #fff;
          text-align: center; letter-spacing: 0.03em;
        }

        /* Card body */
        .c-body { padding: 14px 16px 16px; flex: 1; display: flex; flex-direction: column; }

        /* Badges (May 8 hierarchy: Chef's Special > Featured > Popular >
           offer label). Max 2 shown per card to avoid badge soup —
           buildCardBadges() in the component does the priority sort. */
        .c-badges { display:flex; gap:5px; flex-wrap:wrap; margin-bottom:6px; }
        .c-badge  {
          font-size: 10px; font-weight: 700;
          padding: 3px 9px; border-radius: 6px;
          letter-spacing: 0.02em;
          display: inline-flex; align-items: center; gap: 4px;
          white-space: nowrap;
        }
        .c-badge-chef { background: linear-gradient(135deg, #FFE0A8, #E89E7C); color: #7A4A0A; box-shadow: 0 1px 4px rgba(196,140,40,0.25); }
        .c-badge-feat { background: #F2D5C9; color: #B85A0A; }
        .c-badge-pop  { background: #FFE0DD; color: #C9341A; }
        .c-badge-offer { background: #EFEBE3; color: #6A5530; }

        .c-name {
          font-size: 14px; font-weight: 700; color: #1E1B18;
          line-height: 1.3; margin-bottom: 8px;
          letter-spacing: -0.15px;
          flex: 1;
          display: -webkit-box;
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;
          overflow: hidden;
        }

        .c-price-row { display: flex; align-items: center; gap: 8px; margin-bottom: 6px; min-height: 24px; }
        .c-price { font-family: 'JetBrains Mono', monospace; font-size: 16px; font-weight: 800; color: #B8472D; letter-spacing: -0.3px; }
        .c-cal   { font-size: 11px; color: #7A7A7A; font-weight: 500; }

        .c-meta { display: flex; align-items: center; gap: 7px; flex-wrap: wrap; }
        .c-spice-chip {
          display: inline-flex; align-items: center; gap: 4px;
          font-size: 11px; font-weight: 600;
          padding: 3px 8px; border-radius: 6px;
        }
        .c-prep { font-size: 11px; color: #7A7A7A; }

        /* Sold-out pill (replaces quick-add in sold-out state) */
        .c-sold-pill {
          position: absolute; right: 8px; bottom: 8px;
          z-index: 3;
          display: inline-flex; align-items: center; justify-content: center;
          padding: 5px 11px;
          background: rgba(26,22,18,0.78);
          color: #FFF5E8; font-size: 11px; font-weight: 800;
          letter-spacing: 0.06em; text-transform: uppercase;
          border-radius: 20px;
          backdrop-filter: blur(6px);
        }

        /* empty */
        .empty { text-align:center; padding:72px 20px; color:#9A9A9A; }

        /* ─────────── PAYMENT MODAL — Swiggy-style UPI picker (Problem 5) ───────────
           Headline section labels, UPI-app list rows, Cash/Card grid,
           and the terracotta-gradient primary CTA. The selected state
           uses a 2px terracotta border with 11px padding so the border
           doesn't shift the content (vs 12px default + 1px border). */
        .pay-section-label {
          font-size: 11px; font-weight: 700;
          letter-spacing: 0.10em; text-transform: uppercase;
          color: rgba(30,27,24,0.55);
          margin: 14px 0 10px;
        }
        .dm .pay-section-label { color: rgba(255,245,232,0.55); }

        .pay-app-row {
          display: flex; align-items: center; gap: 12px;
          width: 100%;
          padding: 12px;
          border: 1px solid rgba(30,27,24,0.10);
          border-radius: 14px;
          background: transparent;
          cursor: pointer;
          margin-bottom: 8px;
          font-family: 'Inter', sans-serif;
          transition: border-color 0.15s ease, background 0.15s ease;
        }
        .pay-app-row:hover { background: rgba(30,27,24,0.03); }
        .pay-app-row.selected {
          padding: 11px;
          border: 2px solid #B8472D;
          background: rgba(184,71,45,0.04);
        }
        .dm .pay-app-row { border-color: rgba(255,245,232,0.10); }
        .dm .pay-app-row:hover { background: rgba(255,245,232,0.04); }
        .dm .pay-app-row.selected {
          border-color: #D7644A;
          background: rgba(184,71,45,0.10);
        }

        .pay-app-icon {
          width: 38px; height: 38px; flex-shrink: 0;
          border-radius: 9px;
          display: flex; align-items: center; justify-content: center;
          font-size: 14px; font-weight: 800; letter-spacing: -0.02em;
          color: #FFFFFF;
        }
        .pay-app-icon.gpay   { background: #FFFFFF; color: #4285F4; border: 1px solid rgba(30,27,24,0.10); font-size: 18px; }
        .pay-app-icon.phonepe{ background: #5F259F; }
        .pay-app-icon.paytm  { background: #00BAF2; font-size: 12px; }
        .pay-app-icon.other  { background: rgba(30,27,24,0.08); color: rgba(30,27,24,0.65); }
        .pay-app-icon.cash   { background: rgba(45,139,78,0.12); color: #2D8B4E; font-size: 18px; }
        .pay-app-icon.card   { background: rgba(74,128,192,0.12); color: #4A80C0; font-size: 18px; }
        .pay-app-icon.gateway{ background: #5F259F; color: #FFF5E8; font-size: 18px; }
        .dm .pay-app-icon.other { background: rgba(255,245,232,0.08); color: rgba(255,245,232,0.65); }
        .dm .pay-app-icon.gpay  { background: #FFFFFF; }

        .pay-app-name {
          flex: 1;
          font-size: 15px; font-weight: 700;
          color: #1E1B18; text-align: left;
        }
        .dm .pay-app-name { color: #FFF5E8; }

        .pay-radio {
          width: 22px; height: 22px; flex-shrink: 0;
          border-radius: 50%;
          border: 2px solid rgba(30,27,24,0.18);
          display: flex; align-items: center; justify-content: center;
          transition: border-color 0.15s ease;
        }
        .pay-app-row.selected .pay-radio {
          border-color: #B8472D;
        }
        .pay-app-row.selected .pay-radio::after {
          content: '';
          width: 12px; height: 12px;
          border-radius: 50%;
          background: #B8472D;
        }
        .dm .pay-radio { border-color: rgba(255,245,232,0.18); }
        .dm .pay-app-row.selected .pay-radio { border-color: #D7644A; }
        .dm .pay-app-row.selected .pay-radio::after { background: #D7644A; }

        /* Chevron for the "Other UPI app" row */
        .pay-app-chevron {
          flex-shrink: 0;
          font-size: 18px; line-height: 1;
          color: rgba(30,27,24,0.35);
        }
        .dm .pay-app-chevron { color: rgba(255,245,232,0.35); }

        /* Cash + Card grid — 2-col tiles below the "OR PAY AT TABLE"
           label. Smaller icons (32px) than the UPI app rows. */
        .pay-table-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 8px;
        }
        .pay-table-tile {
          display: flex; align-items: center; gap: 10px;
          padding: 12px;
          border: 1px solid rgba(30,27,24,0.10);
          border-radius: 14px;
          background: transparent;
          cursor: pointer;
          font-family: 'Inter', sans-serif;
          font-size: 14px; font-weight: 700;
          color: #1E1B18;
          transition: border-color 0.15s ease, background 0.15s ease;
        }
        .pay-table-tile:hover { background: rgba(30,27,24,0.03); }
        .pay-table-tile.selected {
          padding: 11px;
          border: 2px solid #B8472D;
          background: rgba(184,71,45,0.04);
        }
        .pay-table-tile .pay-app-icon { width: 32px; height: 32px; }
        .dm .pay-table-tile { border-color: rgba(255,245,232,0.10); color: #FFF5E8; }
        .dm .pay-table-tile:hover { background: rgba(255,245,232,0.04); }
        .dm .pay-table-tile.selected {
          border-color: #D7644A;
          background: rgba(184,71,45,0.10);
        }

        /* Primary terracotta CTA. Disabled state when no method picked. */
        .pay-cta {
          width: 100%;
          padding: 16px;
          border: none; border-radius: 14px;
          background: linear-gradient(135deg, #C2502E, #B8472D);
          color: #FFF5E8;
          font-family: 'Inter', sans-serif;
          font-size: 15px; font-weight: 800;
          letter-spacing: -0.1px;
          cursor: pointer;
          box-shadow: 0 4px 14px rgba(184,71,45,0.32);
          transition: background 0.15s ease, box-shadow 0.15s ease;
          margin-top: 12px;
          min-height: 52px;
        }
        .pay-cta:hover:not(:disabled) {
          background: linear-gradient(135deg, #B8472D, #A33B19);
          box-shadow: 0 6px 18px rgba(184,71,45,0.42);
        }
        .pay-cta:disabled {
          background: rgba(30,27,24,0.10);
          color: rgba(30,27,24,0.30);
          box-shadow: none;
          cursor: not-allowed;
        }
        .dm .pay-cta { background: linear-gradient(135deg, #D7644A, #BD4F33); }
        .dm .pay-cta:hover:not(:disabled) { background: linear-gradient(135deg, #BD4F33, #A33B19); }
        .dm .pay-cta:disabled {
          background: rgba(255,245,232,0.08);
          color: rgba(255,245,232,0.30);
        }

        .pay-cta-helper {
          text-align: center;
          font-size: 11px;
          color: rgba(30,27,24,0.45);
          margin-top: 8px;
        }
        .dm .pay-cta-helper { color: rgba(255,245,232,0.45); }

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

        .m-price     { display:block; width:100%; text-align:center; font-size:34px; font-weight:800; color:#B8472D; letter-spacing:-0.6px; }
        .m-price-sub { display:block; width:100%; text-align:center; font-size:11px; color:#7A7A7A; margin-top:2px; margin-bottom:14px; }
        .m-desc      { font-size:14px; color:#5A5A5A; line-height:1.7; text-align:center; margin-bottom:20px; letter-spacing:-0.1px; }

        .divider { height:0.5px; background:rgba(0,0,0,0.1); margin:16px 0; }
        .sec-lbl { font-size:11px; font-weight:700; color:#7A7A7A; letter-spacing:0.08em; text-transform:uppercase; margin-bottom:12px; }

        .nutr { display:grid; grid-template-columns:repeat(4,1fr); gap:8px; margin-bottom:20px; }
        .nc   { background:#FAF7F2; border:0.5px solid rgba(0,0,0,0.07); border-radius:12px; padding:13px 8px; text-align:center; }
        .nc-v { font-size:20px; font-weight:800; color:#B8472D; letter-spacing:-0.3px; }
        .nc-u { font-size:10px; color:#7A7A7A; margin-top:1px; }
        .nc-l { font-size:10px; color:#5A5A5A; margin-top:3px; font-weight:600; }

        .ings { display:flex; flex-wrap:wrap; gap:6px; margin-bottom:22px; }
        .ing  { padding:6px 13px; border-radius:8px; font-size:12px; color:#2B2B2B; background:#F5F0EA; font-weight:500; transition: all 0.15s ease; cursor:default; }
        .ing:hover { background:#F0E8D8; transform: scale(1.04); }

        /* AR Button */
        .ar-btn {
          width:100%; padding:17px; border-radius:50px; border:none;
          background: #B8472D; color: #FFFFFF;
          font-family: 'Inter', sans-serif; font-weight: 700; font-size: 15px;
          cursor:pointer; display:flex; align-items:center; justify-content:center; gap:11px;
          box-shadow: 0 6px 20px rgba(184,71,45,0.38);
          transition: transform 0.15s, box-shadow 0.15s;
          letter-spacing: -0.1px;
        }
        .ar-btn:hover  { transform:translateY(-2px); box-shadow:0 10px 28px rgba(184,71,45,0.48); filter: brightness(1.05); }
        .ar-btn:active { transform:scale(0.98); }
        .ar-btn-sub { color:rgba(255,255,255,0.75); font-weight:800; }
        .ar-hint { text-align:center; font-size:11px; color:#7A7A7A; margin-top:9px; letter-spacing:-0.1px; }

        /* ─────────── BOTTOM DOCK — adaptive 2-column chip grid (Problem 3) ───────────
           One container, one CSS Grid. Chips render conditionally per order state.
           Primary chip (terracotta or success-green gradient) spans full row via
           .dock-chip-primary { grid-column: 1 / -1 }. A lone secondary chip in
           the same dock also spans full row via .dock-chip-full so it doesn't
           float alone in a single grid cell (this was the alignment bug Prabu
           flagged for the Browsing + Takeaway-payment-pending states).
           Existing classnames .cart-fab, .bill-fab, .bill-fab.status-fab,
           .waiter-fab are preserved because the welcome-tour selectors depend
           on them. */
        .fab-wrap {
          position: fixed;
          /* Tighter offset so the dock hugs the bottom and frees up
             vertical space for menu cards. Was 16px. */
          bottom: max(10px, env(safe-area-inset-bottom, 10px));
          left: 12px; right: 12px;
          max-width: 540px; margin: 0 auto;
          display: grid;
          grid-template-columns: 1fr 1fr;
          /* Half the previous gap + padding — dock is now ~40% shorter. */
          gap: 5px;
          padding: 5px;
          background: rgba(255,245,232,0.92);
          backdrop-filter: blur(20px); -webkit-backdrop-filter: blur(20px);
          border: 1px solid rgba(42,31,16,0.10);
          border-radius: 16px;
          box-shadow: 0 4px 24px rgba(0,0,0,0.10);
          z-index: 50;
        }
        .dm .fab-wrap {
          background: rgba(26,22,18,0.92);
          border-color: rgba(255,245,232,0.08);
          box-shadow: 0 4px 24px rgba(0,0,0,0.45);
        }
        /* The two existing .fab-row wrappers used to be flex containers; under
           the new grid they pass through transparently so all chips inside
           them line up as direct grid children of .fab-wrap. */
        .fab-row { display: contents; }

        /* Span helpers.
           Primary chip uses order:-1 so the grid visually places it at
           the TOP regardless of DOM order — DOM order is fixed by the
           render sequence (payment → status → bill → cart → waiter → sma)
           so that the tour selectors keep working. */
        .dock-chip-primary { grid-column: 1 / -1; order: -1; }
        .dock-chip-full    { grid-column: 1 / -1; }

        /* Install banner — sibling of .fab-wrap, sits just above it
           so it never collides with the dock (z-index 49 vs dock 50).
           The 76px offset matches the now-shorter dock (≈10px bottom +
           ≈54px dock height + ≈12px gap). */
        .install-banner {
          position: fixed;
          bottom: 76px;
          left: 12px; right: 12px;
          max-width: 540px; margin: 0 auto;
          z-index: 49;
          padding: 10px 12px;
          background: #FEFCF8;
          border: 1.5px solid rgba(42,31,16,0.10);
          border-radius: 14px;
          box-shadow: 0 4px 16px rgba(0,0,0,0.08);
          display: flex; align-items: center; gap: 10px;
          font-family: 'Inter', sans-serif;
        }
        .dm .install-banner {
          background: rgba(255,255,255,0.05);
          border-color: rgba(255,255,255,0.10);
          box-shadow: 0 4px 16px rgba(0,0,0,0.3);
        }

        /* Pulse dot inside a chip — draws attention (Bill ready, Payment pending). */
        @keyframes dockPulseDot {
          0%, 100% { transform: scale(1); opacity: 1; }
          50%      { transform: scale(1.35); opacity: 0.55; }
        }
        .dock-pulse-dot {
          display: inline-block;
          width: 7px; height: 7px; border-radius: 50%;
          background: #B8472D;
          animation: dockPulseDot 1.6s ease-in-out infinite;
          flex-shrink: 0;
        }
        .dock-pulse-dot.on-primary { background: rgba(26,22,18,0.55); }
        .dock-pulse-dot.on-success { background: rgba(255,255,255,0.85); }

        /* Shared chip rules. Every dock button gets these regardless of
           which classname (cart-fab / bill-fab / waiter-fab / sma-fab) it
           uses — the classname is only kept so the welcome-tour selectors
           still work. The primary vs secondary look is driven by an
           additional class (.dock-chip-primary / .dock-chip-success). */
        .fab-wrap .waiter-fab,
        .fab-wrap .cart-fab,
        .fab-wrap .bill-fab,
        .fab-wrap .sma-fab {
          pointer-events: all;
          display: flex; align-items: center; justify-content: center; gap: 4px;
          /* Compact chips — thumb-friendly minimum 34px still works on
             phones (Apple HIG recommends 44pt = ~33px CSS). Halves the
             vertical footprint vs the 48px chips. */
          min-height: 34px;
          padding: 4px 10px; border-radius: 10px; border: none;
          font-family: 'Inter', sans-serif; font-weight: 700; font-size: 12px;
          cursor: pointer;
          /* Long Tamil/Hindi labels need to wrap inside the chip rather than
             overflow the grid cell. min-width:0 lets the grid item shrink,
             white-space:normal + text-align:center lets the label flow to a
             second line if needed without breaking the pill shape. The 48px
             min-height grows naturally to fit. */
          min-width: 0;
          white-space: normal;
          text-align: center;
          line-height: 1.2;
          letter-spacing: -0.1px;
          transition: transform 0.15s ease, box-shadow 0.15s ease, background 0.15s ease;
          animation: fadeUp 0.4s ease both;
          position: relative;
          background: rgba(0,0,0,0.04);
          color: #1E1B18;
          box-shadow: none;
        }
        .fab-wrap .waiter-fab:hover,
        .fab-wrap .cart-fab:hover,
        .fab-wrap .bill-fab:hover,
        .fab-wrap .sma-fab:hover { background: rgba(0,0,0,0.08); }
        .fab-wrap .waiter-fab:active,
        .fab-wrap .cart-fab:active,
        .fab-wrap .bill-fab:active,
        .fab-wrap .sma-fab:active { transform: scale(0.97); }

        .dm .fab-wrap .waiter-fab,
        .dm .fab-wrap .cart-fab,
        .dm .fab-wrap .bill-fab,
        .dm .fab-wrap .sma-fab {
          background: rgba(255,245,232,0.06);
          color: #FFF5E8;
        }
        .dm .fab-wrap .waiter-fab:hover,
        .dm .fab-wrap .cart-fab:hover,
        .dm .fab-wrap .bill-fab:hover,
        .dm .fab-wrap .sma-fab:hover { background: rgba(255,245,232,0.10); }

        /* Primary chip — terracotta gradient. Always overrides the
           secondary defaults above when applied. Slightly bigger
           than secondaries so it still anchors the eye. */
        .fab-wrap .dock-chip-primary {
          background: linear-gradient(135deg, #C2502E, #B8472D);
          color: #FFF5E8;
          box-shadow: 0 4px 14px rgba(184,71,45,0.32);
          font-weight: 800; font-size: 13px;
          min-height: 38px;
        }
        .fab-wrap .dock-chip-primary:hover {
          background: linear-gradient(135deg, #B8472D, #A33B19);
          box-shadow: 0 6px 18px rgba(184,71,45,0.40);
        }
        .dm .fab-wrap .dock-chip-primary {
          background: linear-gradient(135deg, #D7644A, #BD4F33);
          box-shadow: 0 4px 14px rgba(184,71,45,0.45);
        }
        .dm .fab-wrap .dock-chip-primary:hover {
          background: linear-gradient(135deg, #BD4F33, #A33B19);
        }

        /* Success variant — for "Order ready!" primary chip. Same in both
           modes per spec (green pops on both cream and chocolate). */
        .fab-wrap .dock-chip-success {
          background: linear-gradient(135deg, #4FB36C, #2D8B4E);
          color: #FFFFFF;
          box-shadow: 0 4px 14px rgba(45,139,78,0.32);
        }
        .fab-wrap .dock-chip-success:hover {
          background: linear-gradient(135deg, #2D8B4E, #1F6B38);
          box-shadow: 0 6px 18px rgba(45,139,78,0.42);
        }

        @keyframes cartPop { 0%,100%{transform:scale(1)} 50%{transform:scale(1.06)} }
        .cart-fab-pop { animation: cartPop 0.35s cubic-bezier(0.34,1.56,0.64,1) both; }

        /* Count badge inside the primary cart chip. Cream pill with
           terracotta number — flips background in dark mode so the
           number stays terracotta against a dark surface. */
        .cart-badge {
          display: inline-flex; align-items: center; justify-content: center;
          min-width: 22px; height: 22px; padding: 0 6px;
          border-radius: 11px;
          background: #FFF5E8; color: #B8472D;
          font-size: 12px; font-weight: 800;
          box-shadow: 0 1px 4px rgba(0,0,0,0.15);
          margin-left: 4px;
        }
        .dm .cart-badge { background: #221C16; color: #D7644A; }

        .bill-price, .cart-price {
          font-size: 12px; font-weight: 700; opacity: 0.85;
          background: rgba(255,255,255,0.18); border-radius: 8px;
          padding: 2px 8px;
        }
        .cart-item-row {
          display: flex; align-items: center; gap: 12px;
          padding: 12px 0; border-bottom: 1px solid var(--divider, rgba(42,31,16,0.07));
        }
        .cart-item-row:last-child { border-bottom: none; }

        /* Cart qty stepper — single pill with -/qty/+ grouped (Problem 7).
           Light terracotta tint background; buttons are borderless circles
           inside it. The qty value uses JetBrains Mono so it lines up with
           the rest of the price-display typography. */
        .cart-qty-pill {
          display: inline-flex; align-items: center; gap: 2px;
          padding: 3px 4px;
          border-radius: 99px;
          background: rgba(184,71,45,0.10);
        }
        .dm .cart-qty-pill { background: rgba(215,100,74,0.16); }
        .qty-btn {
          width: 26px; height: 26px;
          border: none; border-radius: 50%;
          background: transparent;
          color: #B8472D;
          font-size: 16px; font-weight: 800; line-height: 1;
          cursor: pointer;
          display: flex; align-items: center; justify-content: center;
          transition: background 0.15s;
          flex-shrink: 0;
        }
        .qty-btn:hover { background: rgba(184,71,45,0.18); }
        .dm .qty-btn { color: #D7644A; }
        .dm .qty-btn:hover { background: rgba(215,100,74,0.22); }
        .qty-display {
          min-width: 22px;
          text-align: center;
          font-family: 'JetBrains Mono', monospace;
          font-size: 14px; font-weight: 800;
          color: #1E1B18;
        }
        .dm .qty-display { color: #FFF5E8; }

        /* .sma-fab base appearance is inherited from the shared
           .fab-wrap .sma-fab rule above. The .dock-chip-primary class
           is added in JSX when "Help me choose" is the primary action
           (i.e. browsing with no order and no cart). */
        .sma-fab-icon   { font-size: 15px; }

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
        .sma-back:hover { color:#B8472D; }
        .sma-prog-bar  { height:3px; background:#F5F0EA; border-radius:99px; overflow:hidden; }
        .sma-prog-fill { height:100%; background:#B8472D; border-radius:99px; transition:width 0.3s ease; }

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
        .sma-opt:hover  { background:#FFFAF4; border-color:#B8472D; transform:translateX(3px); filter: brightness(1.01); }
        .sma-opt:active { transform: scale(0.985); filter: brightness(0.97); }
        .sma-opt:active { transform:scale(0.98); }
        .sma-opt-emoji  { font-size:24px; flex-shrink:0; }
        .sma-opt-label  { font-size:14px; font-weight:600; color:#1E1B18; letter-spacing:-0.1px; }
        .sma-dismiss    { display:block; text-align:center; margin:18px auto 0; font-size:12px; color:#7A7A7A; background:none; border:none; cursor:pointer; font-family:'Inter',sans-serif; }
        .sma-dismiss:hover { color:#B8472D; }

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
        .sma-item:hover { background:#FFFAF4; border-color:#B8472D; transform:translateX(3px); filter: brightness(1.01); }
        .sma-item-img   { width:50px; height:50px; border-radius:12px; object-fit:cover; flex-shrink:0; background:#F5F0EA; }
        .sma-item-name  { font-size:14px; font-weight:700; color:#1E1B18; margin-bottom:4px; letter-spacing:-0.1px; }
        .sma-item-meta  { display:flex; align-items:center; gap:6px; flex-wrap:wrap; }
        .sma-item-price { font-size:14px; font-weight:800; color:#B8472D; }
        .sma-item-chip  { font-size:10px; font-weight:700; padding:2px 8px; border-radius:6px; }
        .sma-chip-pop   { background:#FFF0EB; color:#E07020; }
        .sma-chip-ar    { background:#E8F5EE; color:#1A6A38; }
        .sma-actions { display:flex; gap:9px; margin-top:22px; }
        .sma-btn-dark  { flex:1; padding:14px; border-radius:50px; border:none; background:#B8472D; color:#fff; font-family:'Inter',sans-serif; font-weight:700; font-size:14px; cursor:pointer; letter-spacing:-0.1px; box-shadow:0 4px 14px rgba(184,71,45,0.35); }
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
        .sma-mode-card:hover { background:#FFFAF4; border-color:#B8472D; transform:translateY(-2px); box-shadow:0 6px 20px rgba(184,71,45,0.18); }
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
        .sma-size-btn:hover { background:#FFFAF4; border-color:#B8472D; transform:translateY(-2px); }
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
          --accent:     #B8472D;
          --accent-glow:rgba(184,71,45,0.22);
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
          background: linear-gradient(145deg,#B8472D,#C07020) !important;
          box-shadow: 0 3px 12px rgba(184,71,45,0.35) !important;
        }

        /* ── AR Live badge ── */
        .dm .ar-badge {
          background: rgba(184,71,45,0.12) !important;
          border-color: rgba(184,71,45,0.3) !important;
          color: #B8472D !important;
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
          box-shadow: 0 4px 16px rgba(184,71,45,0.45) !important;
        }

        /* ── AR strip & offer bar ── */
        .dm .ar-strip {
          backdrop-filter: blur(12px);
          background: var(--bg-card) !important;
          border-color: rgba(184,71,45,0.18) !important;
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
          border-color: rgba(184,71,45,0.15) !important;
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

        /* Badges */
        .dm .c-badge-pop  { background: rgba(184,71,45,0.16) !important; color: var(--accent) !important; }
        .dm .c-badge-feat { background: rgba(120,80,200,0.18) !important; color: #C0A0F0 !important; }

        /* AR pill on card — same dark-glass background in both modes per spec,
           only the terracotta text changes brightness to suit the new bg. */
        .dm .c-ar-pill { background: rgba(26,22,18,0.86) !important; color: #D7644A !important; }

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
            inset 0 0 40px 0px rgba(184,71,45,0.04) !important;
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
        .dm .tag-pop  { background: rgba(184,71,45,0.14) !important; color: var(--accent) !important; }
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
          box-shadow: 0 6px 24px rgba(184,71,45,0.4) !important;
        }
        .dm .ar-btn:hover { box-shadow: 0 10px 32px rgba(184,71,45,0.55) !important; }
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
          box-shadow: 0 0 0 1px rgba(184,71,45,0.25) !important;
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
        .dm .sma-chip-pop   { background: rgba(184,71,45,0.14) !important; color: var(--accent) !important; }
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
          box-shadow: 0 0 0 1px rgba(184,71,45,0.2), 0 8px 24px rgba(0,0,0,0.4) !important;
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
          box-shadow: 0 4px 16px rgba(184,71,45,0.35) !important;
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
          box-shadow: 0 6px 28px rgba(184,71,45,0.5), 0 2px 8px rgba(0,0,0,0.5) !important;
        }
        .dm .sma-fab:hover {
          box-shadow: 0 12px 40px rgba(184,71,45,0.65), 0 4px 12px rgba(0,0,0,0.5) !important;
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
          background: #B8472D !important;
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
          background: radial-gradient(circle, #B8472D 0%, #E05A3A 50%, transparent 75%);
          animation: plasma1 18s ease-in-out infinite;
        }
        .pb2 {
          width: 55vw; height: 55vw; top: 30%; right: -10%;
          background: radial-gradient(circle, #FF6B35 0%, #C8370A 50%, transparent 75%);
          animation: plasma2 14s ease-in-out infinite;
        }
        .pb3 {
          width: 60vw; height: 60vw; bottom: -20%; left: 20%;
          background: radial-gradient(circle, #D7644A 0%, #B8472D 45%, transparent 75%);
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
            #B8472D 50deg,
            #FFD056 110deg,
            #E05A3A 170deg,
            transparent 230deg,
            transparent 290deg,
            #B8472D 340deg,
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
                          color: darkMode ? 'rgba(184,71,45,0.7)' : 'rgba(184,71,45,0.85)',
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
              {/* ── Right group: search + AR badge + language picker — pushed to end via margin-left:auto ── */}
              <div className="hdr-right">
                {/* Search icon (May 8 redesign) — tap to expand the
                    full-width search row in cats-outer below.
                    Highlighted when active or when there's typed text. */}
                <button
                  type="button"
                  className={`hdr-search-btn${searchOpen || menuSearch ? ' on' : ''}`}
                  onClick={() => {
                    setSearchOpen((prev) => {
                      const next = !prev;
                      if (next) {
                        // Defer focus to after the row mounts.
                        setTimeout(() => menuSearchInputRef.current?.focus(), 30);
                      } else {
                        setMenuSearch('');
                      }
                      return next;
                    });
                  }}
                  aria-label={searchOpen ? 'Close search' : 'Search dishes'}
                  title={searchOpen ? 'Close search' : 'Search dishes'}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="11" cy="11" r="7" />
                    <line x1="21" y1="21" x2="16.65" y2="16.65" />
                  </svg>
                </button>
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
            {/* Menu search bar (May 8). Toggled by the header search
                icon. Has its own onSubmit so pressing Enter / Search /
                Go on a mobile keyboard blurs the input → keyboard
                dismisses (was hanging open before). */}
            <div className="cats-outer">
              {(searchOpen || menuSearch) && (
                <form
                  className="menu-search" role="search"
                  onSubmit={(e) => {
                    e.preventDefault();
                    // Blur the input to dismiss the on-screen keyboard.
                    menuSearchInputRef.current?.blur();
                  }}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <circle cx="11" cy="11" r="7" />
                    <line x1="21" y1="21" x2="16.65" y2="16.65" />
                  </svg>
                  <input
                    ref={menuSearchInputRef}
                    type="search"
                    inputMode="search"
                    enterKeyHint="search"
                    autoComplete="off"
                    placeholder={t.searchPlaceholder || 'Search dishes…'}
                    value={menuSearch}
                    onChange={(e) => setMenuSearch(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        e.currentTarget.blur();
                      } else if (e.key === 'Escape') {
                        setMenuSearch('');
                        setSearchOpen(false);
                        e.currentTarget.blur();
                      }
                    }}
                    aria-label="Search dishes"
                  />
                  {menuSearch ? (
                    <button
                      type="button"
                      className="menu-search-clear"
                      onClick={() => setMenuSearch('')}
                      aria-label="Clear search"
                    >×</button>
                  ) : (
                    <button
                      type="button"
                      className="menu-search-clear"
                      onClick={() => { setSearchOpen(false); }}
                      aria-label="Close search"
                    >×</button>
                  )}
                </form>
              )}
            {/* Category image-tile strip (May 8 redesign).
                Replaces the old text pills. Tapping a tile scrolls
                the page to the matching section id rendered by the
                menu (step 2). No filtering — every section stays
                visible, the tile is a navigation shortcut. Hidden
                when a search is active so the search results take
                centre stage. */}
            {!menuSearch && (
              <div className="cat-tile-strip">
                {categoryStrip.map((tile) => {
                  const targetId = 'cat-section-' + tile.name.replace(/\s+/g, '-').toLowerCase();
                  const handleClick = () => {
                    const el = typeof document !== 'undefined' ? document.getElementById(targetId) : null;
                    if (el) {
                      // Offset by the actual header height plus a 16px
                      // breathing gap so the section title is visible
                      // below the header — even if the user is
                      // scrolling UP and the smart-header logic is about
                      // to re-show the bar. Falls back to 120 if the
                      // ResizeObserver hasn't measured yet.
                      const offset = (hdrHeight || 120) + 16;
                      const top = el.getBoundingClientRect().top + window.scrollY - offset;
                      window.scrollTo({ top, behavior: 'smooth' });
                    }
                    // We still update activeCat so any downstream
                    // logic that reads it (FAB tour, analytics) keeps
                    // working — but no longer filters the menu.
                    if (typeof setActiveCat === 'function') setActiveCat(tile.name);
                  };
                  return (
                    <button
                      key={tile.key}
                      type="button"
                      className="cat-tile"
                      onClick={handleClick}
                      aria-label={`Jump to ${tile.name}`}
                    >
                      <span
                        className="cat-tile-img"
                        style={tile.image ? { backgroundImage: `url(${tile.image})` } : undefined}
                      >
                        {!tile.image && catIcon(tile.name)}
                      </span>
                      <span className="cat-tile-label">{tile.name}</span>
                    </button>
                  );
                })}
              </div>
            )}
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
                <span style={{ fontFamily: 'Poppins,sans-serif', fontWeight: 700, fontSize: 12, color: darkMode ? '#D7644A' : '#6E2B17', letterSpacing: '0.04em', textTransform: 'uppercase' }}>Today&apos;s Offers</span>
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
                        border: `1.5px solid ${darkMode ? 'rgba(184,71,45,0.25)' : 'rgba(184,71,45,0.4)'}`,
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
                            <div style={{ fontSize: 11, fontWeight: 700, color: '#fff', background: 'linear-gradient(135deg,#B8472D,#E05A3A)', padding: '5px 10px', borderRadius: 10, whiteSpace: 'nowrap', boxShadow: '0 2px 8px rgba(224,90,58,0.35)' }}>View →</div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* AR strip — May 8 redesign.
              Replaces the goggles emoji + abstract copy with a small
              animated SVG that physically demonstrates the AR action:
              a dish rises out of the phone's screen and lands on a
              table next to it. Same idea the customer experiences
              when they tap "View in AR" — the SVG is essentially a
              preview of the gesture, no words needed.
              Headline tightened to "See it on your table" so the
              value is visible at a glance. */}
          {arCount > 0 && !menuSearch && (
            <div className="ar-strip">
              {/* AR demo SVG v4 (May 8). Phone is now the focal element
                  occupying ~45% of the SVG width; table shrunk to a
                  small slab on the right. Palette pulled directly from
                  the brand tokens used elsewhere on the page —
                  #B8472D / #9A371F / #F2D5C9 / cream — so the banner
                  reads as part of the same surface, not a separate
                  illustration. Sparkle decorations dropped per user
                  feedback ("too cartoonish"). */}
              <svg className="ar-strip-svg" viewBox="0 0 220 120" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                <defs>
                  <linearGradient id="ar4-screen" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0" stopColor="#E89E7C" />
                    <stop offset="0.55" stopColor="#B8472D" />
                    <stop offset="1" stopColor="#9A371F" />
                  </linearGradient>
                  <linearGradient id="ar4-screen-glow" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0" stopColor="#FFFFFF" stopOpacity="0.55" />
                    <stop offset="0.4" stopColor="#FFFFFF" stopOpacity="0.05" />
                    <stop offset="1" stopColor="#FFFFFF" stopOpacity="0" />
                  </linearGradient>
                  <linearGradient id="ar4-table" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0" stopColor="#E5C290" />
                    <stop offset="1" stopColor="#B98750" />
                  </linearGradient>
                  <radialGradient id="ar4-shimmer" cx="0.5" cy="0.5" r="0.5">
                    <stop offset="0" stopColor="#B8472D" stopOpacity="0.6" />
                    <stop offset="1" stopColor="#B8472D" stopOpacity="0" />
                  </radialGradient>
                </defs>

                {/* Table — small slab on the right so the phone has
                    visual priority. Warm cream wood matches header. */}
                <g>
                  <rect x="130" y="98" width="76" height="6" rx="1.5" fill="url(#ar4-table)" />
                  <line x1="130" y1="98" x2="206" y2="98" stroke="#F2D5C9" strokeWidth="0.6" opacity="0.7" />
                  <rect x="138" y="104" width="5" height="14" rx="1" fill="#A06438" />
                  <rect x="193" y="104" width="5" height="14" rx="1" fill="#A06438" />
                </g>

                {/* Shimmer ring on the table where the plate lands */}
                <ellipse className="ar-shimmer" cx="160" cy="101" rx="20" ry="4" fill="url(#ar4-shimmer)" />

                {/* Phone — bigger, more iPhone-realistic
                       - Smartphone proportions (rounded body, notch,
                         visible bezel)
                       - Solid orange screen so it reads as "this is
                         where the dish lives" rather than a generic
                         icon
                       - Ambient glow ring around the screen pulses
                         subtly to sell that the phone is "alive". */}
                <g>
                  {/* Soft floor shadow under the phone */}
                  <ellipse cx="68" cy="106" rx="22" ry="3" fill="rgba(0,0,0,0.10)" />
                  {/* Outer phone body — dark, rounded */}
                  <rect x="42" y="14" width="52" height="92" rx="9"
                        fill="#1B1A18" stroke="rgba(184,71,45,0.45)" strokeWidth="1.2" />
                  {/* Screen — orange brand gradient */}
                  <rect className="phone-glow" x="46" y="20" width="44" height="78" rx="6" fill="url(#ar4-screen)" />
                  {/* Screen highlight (top-left) for depth */}
                  <rect x="46" y="20" width="44" height="36" rx="6" fill="url(#ar4-screen-glow)" />
                  {/* Notch */}
                  <rect x="60" y="17" width="16" height="3" rx="1.5" fill="#0A0A0A" />
                  <circle cx="78" cy="18.5" r="1" fill="#1A2A38" />
                  {/* Home indicator */}
                  <rect x="60" y="102" width="16" height="1.6" rx="0.8" fill="#3A3A3A" opacity="0.85" />
                  {/* Side button hint (silent switch) */}
                  <rect x="40.5" y="32" width="1.5" height="6" rx="0.5" fill="#0F0E0C" />
                  <rect x="40.5" y="48" width="1.5" height="9" rx="0.5" fill="#0F0E0C" />
                  {/* Side button hint (power) on the right */}
                  <rect x="94" y="38" width="1.5" height="12" rx="0.5" fill="#0F0E0C" />
                </g>

                {/* Dish — animates from phone screen to table */}
                <g className="ar-dish">
                  <ellipse cx="0" cy="3" rx="14" ry="3.6" fill="rgba(0,0,0,0.20)" />
                  <ellipse cx="0" cy="0" rx="14" ry="3.8" fill="#FFFFFF" stroke="#E2D6BF" strokeWidth="0.6" />
                  <ellipse cx="0" cy="-0.7" rx="10.5" ry="2.7" fill="#FFF8E8" />
                  <ellipse cx="0" cy="-2.4" rx="7.2" ry="2.2" fill="#B8472D" />
                  <ellipse cx="-0.5" cy="-3.2" rx="4" ry="1.3" fill="#E89E7C" />
                  <circle cx="-2.5" cy="-3.6" r="0.9" fill="#5DA068" />
                </g>
              </svg>
              <div className="ar-strip-copy">
                <div className="ar-strip-text">See it on your table</div>
                <div className="ar-strip-sub">Tap any card with the <strong>AR</strong> pill, then “View in AR” to preview the dish in front of you.</div>
                <span className="ar-strip-pill">★ {arCount} {arCount === 1 ? 'dish' : 'dishes'} ready</span>
              </div>
            </div>
          )}

          {/* ── Combos Section ─────────────────────────────────────
              No longer gated on activeCat === 'All' — that gate dated
              from when activeCat was a filter, and post-redesign
              activeCat is just a scroll-target hint. With the gate in
              place, tapping any category tile would silently hide the
              combo deals; a page refresh brought them back. Hidden
              while a search is active so the result list is the only
              thing on screen. */}
          {(combos || []).filter(c => c.isActive !== false).length > 0 && !menuSearch && (
            <div className="combos-section-wrap" style={{ marginBottom: 28 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
                <span style={{ fontSize: 18 }}>🍱</span>
                <span style={{ fontFamily: 'Poppins,sans-serif', fontWeight: 700, fontSize: 16, color: darkMode ? '#D7644A' : '#6E2B17' }}><span className="shiny-txt">Combo Deals</span></span>
                <span style={{ padding: '3px 10px', borderRadius: 20, background: darkMode ? 'rgba(184,71,45,0.2)' : 'rgba(184,71,45,0.15)', color: darkMode ? '#E89E7C' : '#6E2B17', fontSize: 11, fontWeight: 700, border: '1px solid rgba(184,71,45,0.3)' }}>Special Offers</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12, filter: 'url(#card-turb)' }}>
                {(combos || []).filter(c => c.isActive !== false).map(combo => {
                  const comboItems = (combo.itemIds || []).map(id => (menuItems || []).find(i => i.id === id)).filter(Boolean);
                  return (
                    <div key={combo.id} onClick={() => setSelectedCombo({ ...combo, resolvedItems: comboItems })}
                      style={{ borderRadius: 18, border: '1.5px solid rgba(184,71,45,0.35)', background: darkMode ? 'linear-gradient(135deg,rgba(18,14,10,0.80),rgba(28,20,10,0.80))' : 'linear-gradient(135deg,rgba(255,252,248,0.98),rgba(250,245,235,0.98))', backdropFilter: darkMode ? 'blur(12px)' : 'none', WebkitBackdropFilter: darkMode ? 'blur(12px)' : 'none', padding: '18px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 14, flexWrap: 'wrap', cursor: 'pointer', transition: 'transform 0.18s, box-shadow 0.18s' }}
                      onMouseOver={e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 8px 24px rgba(184,71,45,0.2)'; }}
                      onMouseOut={e => { e.currentTarget.style.transform = ''; e.currentTarget.style.boxShadow = ''; }}>
                      <div style={{ flex: 1, minWidth: 200 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5, flexWrap: 'wrap' }}>
                          <span style={{ fontFamily: 'Poppins,sans-serif', fontWeight: 700, fontSize: 15, color: darkMode ? 'var(--text-1)' : '#1E1B18' }}>{combo.name}</span>
                          {combo.tag && <span style={{ padding: '2px 9px', borderRadius: 20, background: 'rgba(184,71,45,0.25)', color: darkMode ? '#E89E7C' : '#6E2B17', fontSize: 11, fontWeight: 700 }}>{combo.tag}</span>}
                        </div>
                        {combo.description && <div style={{ fontSize: 12, color: darkMode ? 'rgba(255,245,232,0.55)' : 'rgba(42,31,16,0.55)', marginBottom: 8 }}>{combo.description}</div>}
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                          {comboItems.map(item => (
                            <span key={item.id} style={{ padding: '3px 9px', borderRadius: 20, background: darkMode ? 'rgba(255,245,232,0.1)' : 'rgba(42,31,16,0.06)', fontSize: 12, color: darkMode ? 'rgba(255,245,232,0.7)' : 'rgba(42,31,16,0.65)', fontWeight: 500 }}>{item.name}</span>
                          ))}
                        </div>
                        <div style={{ fontSize: 11, color: darkMode ? 'rgba(184,71,45,0.7)' : '#6E2B17', marginTop: 8, fontWeight: 600 }}>Tap to view & add →</div>
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

          {/* Categorised menu (May 8 redesign).
              IIFE wrapper holds the renderItemCard helper so we don't
              duplicate the 80-line card JSX across sections. Render
              order:
                1. Featured section (if any) — Layer 1 of the 3-layer
                   featured strategy.
                2. Per-category sections — items inside each are
                   featured-first (Layer 3).
              The top image-tile strip (Layer 2, step 3) will scroll
              the page to these sections via element ids. */}
          {(() => {
            // slug helper for the section id (must match what the
            // category strip uses to scroll into view).
            const sectionId = (name) => 'cat-section-' + String(name).replace(/\s+/g, '-').toLowerCase();
            const renderItemCard = (item, idx) => {
              // Chef's Special gets the bordered card variant per spec. Detected
              // the same way the badge code below detects it.
              const isChef = item.offerLabel && item.offerLabel.toLowerCase().includes('chef');
              // Mode-aware dim for sold-out / OOS — slightly darker dim in
              // dark mode so the card sinks visually against chocolate bg.
              const dimOpacity = (item.soldOut || item.isOutOfStock) ? (darkMode ? 0.55 : 0.65) : 1;
              return (
                <button key={item.id} className={`card${isChef ? ' chef-special' : ''}`} style={{ animationDelay: `${idx * 0.05}s`, opacity: dimOpacity, cursor: (item.soldOut || item.isOutOfStock) ? 'not-allowed' : 'pointer' }} onClick={() => { if (!item.soldOut && !item.isOutOfStock) openItem(item); }}>
                  <div className="c-img" style={{ position: 'relative' }}>
                    <div className={`img-skeleton${imgLoaded[item.id] ? ' loaded' : ''}`} />
                    <img src={imgSrc(item)} alt={item.name} loading="lazy" decoding="async"
                      className={imgLoaded[item.id] ? 'img-visible' : ''}
                      style={{ filter: item.soldOut ? 'grayscale(100%)' : 'none' }}
                      onLoad={() => setImgLoaded(s => ({ ...s, [item.id]: true }))}
                      onError={() => { setImgErr(e => ({ ...e, [item.id]: true })); setImgLoaded(s => ({ ...s, [item.id]: true })); }} />
                    {item.soldOut && (
                      <span className="c-sold-pill">{t.soldOut || 'Sold out'}</span>
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
                    {/* offerLabel ribbon removed (May 8). The same label
                        now renders as a badge in c-badges with the
                        proper hierarchy (Chef's Special > Featured >
                        Popular > offer label) — duplicating it as a
                        ribbon here would clutter the image. */}
                    {/* Quick-add (May 8). Lives inside c-img so it sits
                        over the dish photo bottom-right. Items with
                        variants route the tap to openItem() so the
                        customer can pick (Half/Full etc.); plain items
                        do an instant base-price quick-add. The card's
                        own button gets stopPropagation so tapping +
                        doesn't also open the modal. role="button" +
                        tabIndex keep it accessible without nesting a
                        real <button> inside the card's <button>. */}
                    {!item.soldOut && !item.isOutOfStock && (() => {
                      const hasVariants = Array.isArray(item.variants) && item.variants.length > 0;
                      const baseEntry = cart.find(c => (c.cartKey || c.id) === item.id);
                      const baseQty = baseEntry?.qty || 0;
                      const handle = (e, action) => {
                        e.stopPropagation();
                        e.preventDefault();
                        if (hasVariants && action === 'add') { openItem(item); return; }
                        if (action === 'add') addToCart(item);
                        else if (action === 'remove') removeFromCart(item.id);
                      };
                      const onKey = (e, action) => {
                        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handle(e, action); }
                      };
                      if (baseQty === 0) {
                        return (
                          <span
                            className="quick-add"
                            role="button"
                            tabIndex={0}
                            aria-label={hasVariants ? `Open ${item.name} to choose options` : `Add ${item.name} to cart`}
                            onClick={(e) => handle(e, 'add')}
                            onKeyDown={(e) => onKey(e, 'add')}
                          >
                            +
                          </span>
                        );
                      }
                      return (
                        <span
                          className="quick-add in-cart"
                          aria-label={`${item.name} in cart`}
                          onClick={(e) => e.stopPropagation()}
                        >
                          <span
                            className="qa-step"
                            role="button"
                            tabIndex={0}
                            aria-label={`Remove one ${item.name}`}
                            onClick={(e) => handle(e, 'remove')}
                            onKeyDown={(e) => onKey(e, 'remove')}
                          >−</span>
                          <span className="qa-qty">{baseQty}</span>
                          <span
                            className="qa-step"
                            role="button"
                            tabIndex={0}
                            aria-label={`Add another ${item.name}`}
                            onClick={(e) => handle(e, 'add')}
                            onKeyDown={(e) => onKey(e, 'add')}
                          >+</span>
                        </span>
                      );
                    })()}
                  </div>
                  <div className="c-body">
                    {/* Badge hierarchy (May 8): Chef's Special > Featured >
                        Popular > other offer labels. Cap at 2 visible so
                        the card doesn't drown in chips. The chef-special
                        check looks at offerLabel since that's where the
                        admin form stores it (one of OFFER_BADGES). */}
                    {(() => {
                      const isChef = item.offerLabel && item.offerLabel.toLowerCase().includes("chef");
                      const otherOffer = item.offerLabel && !isChef ? item.offerLabel : null;
                      const badges = [];
                      if (isChef) badges.push({ kind: 'chef', label: item.offerLabel });
                      if (item.isFeatured) badges.push({ kind: 'feat', label: t.featured });
                      if (item.isPopular) badges.push({ kind: 'pop', label: t.popular });
                      if (otherOffer) badges.push({ kind: 'offer', label: otherOffer });
                      const visible = badges.slice(0, 2);
                      if (visible.length === 0) return null;
                      return (
                        <div className="c-badges">
                          {visible.map((b, i) => (
                            <span key={i} className={`c-badge c-badge-${b.kind}`}>
                              {b.kind === 'chef' ? '★ ' : ''}{b.label}
                            </span>
                          ))}
                        </div>
                      );
                    })()}
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
                          <span style={{ fontSize: 11, color: '#B8472D', fontWeight: 700, marginLeft: 'auto', whiteSpace: 'nowrap' }}>
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
                        {item.prepTime && <span className="c-prep">⏱ {safePrepTime(item.prepTime)}</span>}
                      </div>
                    )}
                    {/* Duplicate "View in AR" CTA at the card bottom removed
                        per design spec — the .c-ar-pill on the photo is
                        enough signal that the dish has an AR model. */}
                  </div>
                </button>
              );
            };

            // Search mode — flat result list across all items.
            // Match against name + description (case-insensitive).
            const q = menuSearch.trim().toLowerCase();
            if (q) {
              const matches = enrichedItems.filter((it) => {
                const name = (it.name || '').toLowerCase();
                const desc = (it.description || '').toLowerCase();
                const cat  = (it.category || '').toLowerCase();
                return name.includes(q) || desc.includes(q) || cat.includes(q);
              });
              if (matches.length === 0) {
                return (
                  <div className="search-empty">
                    <div className="se-icon">🔍</div>
                    <div className="se-title">No matches for “{menuSearch}”</div>
                    <div className="se-sub">Try a different keyword, or clear the search to browse the full menu.</div>
                  </div>
                );
              }
              return (
                <section className="cat-section">
                  <div className="cat-section-head">
                    <h3 className="cat-section-title">Results</h3>
                    <span className="cat-section-count">{matches.length}</span>
                  </div>
                  <div className="cat-row">
                    {matches.map((item, idx) => renderItemCard(item, idx))}
                  </div>
                </section>
              );
            }

            if (categorySections.length === 0) {
              return (
                <div className="empty">
                  <div style={{ fontSize: 44, marginBottom: 10 }}>🥢</div>
                  <p style={{ fontWeight: 600, fontSize: 14, color: '#9A9A9A' }}>No items on the menu yet</p>
                </div>
              );
            }
            return (
              <>
                {categorySections.map((section) => (
                  <section key={section.name} className="cat-section" id={sectionId(section.name)}>
                    <div className="cat-section-head">
                      <h3 className="cat-section-title">{section.name}</h3>
                      <span className="cat-section-count">{section.items.length}</span>
                    </div>
                    <div className="cat-row">
                      {section.items.map((item, idx) => renderItemCard(item, idx))}
                    </div>
                  </section>
                ))}
              </>
            );
          })()}
        </main>

        {/* ─── BOTTOM DOCK (Problem 3 redesign) ───
            Single 2-column grid that adapts to order state. One chip
            gets promoted to PRIMARY (full row, terracotta or success-
            green gradient); the rest land below as secondaries. When
            a secondary chip would land alone on its row (odd secondary
            count), dock-chip-full spans it full-width — fixes the
            alignment bug for the Browsing + Takeaway-payment-pending
            states.

            DOM order intentionally stays: payment → status → bill →
            cart → waiter → sma. The tour selectors (.cart-fab,
            .bill-fab, .bill-fab.status-fab, .waiter-fab) keep working
            because the classnames are preserved. Visual top-row
            placement is handled by `order: -1` on .dock-chip-primary. */}
        {!selectedItem && !smaOpen && (() => {
          // ── State detection ─────────────────────────────────────
          const isAwaitingPayTakeaway = !!placedOrder && !cartOpen
            && liveOrderStatus === 'awaiting_payment'
            && placedOrder.orderType === 'takeaway';
          const isOrderReady = !!placedOrder && !cartOpen
            && fabAggregateStatus === 'ready';
          const cartHasItems = cartTotal > 0;
          const noOrder = !placedOrder;

          // Decide which chip is primary in this state.
          //   payment   → takeaway awaiting payment (urgent, pulse)
          //   orderReady→ kitchen says ready (success green)
          //   cart      → cart has items, no in-flight order
          //   help      → browsing default (nothing else going on)
          //   null      → in-progress order (no chip dominates)
          let primaryKey = null;
          if (isAwaitingPayTakeaway) primaryKey = 'payment';
          else if (isOrderReady) primaryKey = 'orderReady';
          else if (cartHasItems) primaryKey = 'cart';
          else if (noOrder) primaryKey = 'help';

          // ── Chip visibility (mirrors the conditions used inline) ─
          const showStatusReal = !!placedOrder && !cartOpen && fabAggregateStatus && fabAggregateStatus !== 'awaiting_payment';
          const showStatusDemo = welcomeOpen && !placedOrder;
          const showBillReal = !!placedOrder && !cartOpen && sessionOrders.some(o =>
            o.liveStatus && o.liveStatus !== 'awaiting_payment' && o.liveStatus !== 'cancelled');
          const showBillDemo = welcomeOpen && !placedOrder;
          const showCartReal = cartHasItems;
          const showCartDemo = welcomeOpen && cartTotal === 0;
          const showWaiter   = waiterCallsEnabled;

          // ── Compute the last-secondary-needs-full-row flag ──────
          // Build a list of visible chip keys in DOM order. The primary
          // chip is in there too — we drop it when counting secondaries.
          const visibleKeys = [];
          if (isAwaitingPayTakeaway)               visibleKeys.push('payment');
          if (showStatusReal)                      visibleKeys.push('status');
          if (showStatusDemo)                      visibleKeys.push('status');
          if (showBillReal)                        visibleKeys.push('bill');
          if (showBillDemo)                        visibleKeys.push('bill');
          if (showCartReal)                        visibleKeys.push('cart');
          if (showCartDemo)                        visibleKeys.push('cart');
          if (showWaiter)                          visibleKeys.push('waiter');
          /* help (sma) is always rendered */      visibleKeys.push('help');

          const secondaryKeys = visibleKeys.filter(k => k !== primaryKey);
          const oddSecondaries = secondaryKeys.length % 2 === 1;
          // Mark the last DOM-rendered non-primary chip so it spans full row
          // when the secondary count is odd. We rely on stable render order.
          const lastSoloKey = oddSecondaries ? secondaryKeys[secondaryKeys.length - 1] : null;

          const primaryCls = (key) => {
            const cls = [];
            if (key === primaryKey) {
              cls.push('dock-chip-primary');
              if (key === 'orderReady') cls.push('dock-chip-success');
            } else if (key === lastSoloKey) {
              cls.push('dock-chip-full');
            }
            return cls.length ? ' ' + cls.join(' ') : '';
          };

          // Status chip — handles both real and demo, both ready and preparing
          const renderStatusChip = (isDemo) => {
            if (isDemo) {
              return (
                <button
                  key="status-demo"
                  className={`bill-fab status-fab${primaryCls('status')}`}
                  onClick={(e) => e.preventDefault()}
                  aria-hidden="true">
                  <span className="dock-pulse-dot" />
                  <span style={{ fontSize: 14 }}>🍳</span>
                  <span>Order Status</span>
                </button>
              );
            }
            const s = fabAggregateStatus;
            const extra = Math.max(0, fabActiveOrderCount - 1);
            const isReady = s === 'ready';
            return (
              <button
                key="status-real"
                className={`bill-fab status-fab${isReady ? ' status-fab-ready' : ''}${primaryCls(isReady ? 'orderReady' : 'status')}`}
                onClick={() => { setCartOpen(true); setOrderStep('success'); }}>
                <span className={`dock-pulse-dot${isReady ? ' on-success' : ''}`} />
                <span style={{ fontSize: 14 }}>
                  {isReady ? '🎉' : s === 'preparing' ? '🍳' : '⏳'}
                </span>
                <span>
                  {isReady
                    ? (extra > 0 ? `Order Ready! +${extra}` : 'Order Ready!')
                    : s === 'preparing'
                      ? (extra > 0 ? `Preparing… +${extra}` : 'Preparing…')
                      : (extra > 0 ? `Order Status (${fabActiveOrderCount})` : 'Order Status')}
                </span>
              </button>
            );
          };

          return (
            <>
              {/* PWA install prompt — sits 116px above the dock so it
                  never collides (dock z-index 50, banner 49). Same copy
                  + dismiss behaviour as before; just relocated. */}
              {installDeferred && !installDismissed && (
                <div className="install-banner">
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
                      background: '#B8472D', color: '#FFF5E8',
                      border: 'none', cursor: 'pointer',
                      fontFamily: 'Inter, sans-serif',
                      fontSize: 12, fontWeight: 700, letterSpacing: '0.01em',
                    }}>
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
                    }}>×</button>
                </div>
              )}

              <div className="fab-wrap">
                {/* Payment chip — takeaway, awaiting payment. */}
                {isAwaitingPayTakeaway && (
                  <button
                    className={`bill-fab status-fab${primaryCls('payment')}`}
                    onClick={() => { setCartOpen(true); setOrderStep('payment'); }}>
                    <span className="dock-pulse-dot on-primary" />
                    <span style={{ fontSize: 14 }}>💳</span>
                    <span>Payment pending</span>
                  </button>
                )}

                {/* Order Status chip — real (preparing/ready) or demo. */}
                {showStatusReal && renderStatusChip(false)}
                {showStatusDemo && renderStatusChip(true)}

                {/* Bill chip — real or demo. */}
                {showBillReal && (
                  <button
                    className={`bill-fab${primaryCls('bill')}`}
                    onClick={() => setBillOpen(true)}>
                    <span style={{ fontSize: 14 }}>🧾</span>
                    <span>My Bill</span>
                  </button>
                )}
                {showBillDemo && (
                  <button
                    className={`bill-fab${primaryCls('bill')}`}
                    onClick={(e) => e.preventDefault()}
                    aria-hidden="true">
                    <span style={{ fontSize: 14 }}>🧾</span>
                    <span>My Bill</span>
                  </button>
                )}

                {/* Cart chip — real or demo. */}
                {showCartReal && (
                  <button
                    className={`cart-fab${primaryCls('cart')}`}
                    onClick={() => setCartOpen(true)}>
                    <span style={{ fontSize: 14 }}>🛒</span>
                    <span>View Order · {cartTotal} item{cartTotal !== 1 ? 's' : ''}</span>
                    <span className="cart-badge">{cartTotal}</span>
                  </button>
                )}
                {showCartDemo && (
                  <button
                    className={`cart-fab${primaryCls('cart')}`}
                    onClick={(e) => e.preventDefault()}
                    aria-hidden="true">
                    <span style={{ fontSize: 14 }}>🛒</span>
                    <span>View Order · 2 items</span>
                    <span className="cart-badge">2</span>
                  </button>
                )}

                {/* Waiter chip — almost always secondary. Becomes
                    dock-chip-full when it'd otherwise land alone. */}
                {showWaiter && (
                  <button
                    className={`waiter-fab${primaryCls('waiter')}`}
                    onClick={() => setWaiterModal(true)}>
                    <span style={{ fontSize: 14 }}>🔔</span>
                    <span>{t.needHelp}</span>
                  </button>
                )}

                {/* Help Me Choose — always rendered. Primary chip in
                    pure-browsing state, secondary otherwise. */}
                <button
                  className={`sma-fab${primaryCls('help')}`}
                  onClick={openSMA}>
                  <span className="sma-fab-icon">✨</span>
                  <span>{t.helpChoose}</span>
                </button>
              </div>
            </>
          );
        })()}

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
                    <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, padding: '7px 14px', background: selectedItem.offerColor || '#B8472D', color: '#fff', fontSize: 12, fontWeight: 700, textAlign: 'center' }}>
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
                    {selectedItem.prepTime && <span className="m-pill">⏱ {safePrepTime(selectedItem.prepTime)}</span>}
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
                        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: darkMode ? 'rgba(184,71,45,0.85)' : '#A05000', marginBottom: 8 }}>
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
                                  border: selected ? '2px solid #B8472D' : `1.5px solid ${darkMode ? 'rgba(255,245,232,0.15)' : 'rgba(42,31,16,0.15)'}`,
                                  background: selected ? 'rgba(184,71,45,0.12)' : 'transparent',
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
                        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: darkMode ? 'rgba(184,71,45,0.85)' : '#A05000', marginBottom: 8 }}>
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
                            background: darkMode ? '#D7644A' : '#1E1B18',
                            color: darkMode ? '#ffffff' : '#FFF5E8',
                            fontSize: 14, fontWeight: 700, fontFamily: 'Inter,sans-serif',
                            cursor: canAdd ? 'pointer' : 'not-allowed',
                            opacity: canAdd ? 1 : 0.5,
                            boxShadow: darkMode ? '0 4px 16px rgba(184,71,45,0.35)' : '0 4px 16px rgba(0,0,0,0.25)',
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
                            <span key={s} style={{ fontSize: 22, color: s <= userRatings[selectedItem.id] ? '#B8472D' : darkMode ? 'rgba(255,255,255,0.12)' : 'rgba(42,31,16,0.15)' }}>★</span>
                          ))}
                        </div>
                        <span style={{ fontSize: 12, color: darkMode ? 'rgba(255,245,232,0.45)' : 'rgba(42,31,16,0.45)', fontWeight: 500 }}>Thanks for rating!</span>
                      </div>
                    ) : (
                      <div>
                        <div style={{ display: 'flex', gap: 4, marginBottom: 8 }}>
                          {[1, 2, 3, 4, 5].map(s => (
                            <button key={s} onClick={() => handleRate(selectedItem, s)} disabled={!!ratingPending} style={{ fontSize: 33, background: 'none', border: 'none', cursor: 'pointer', color: darkMode ? 'rgba(255,255,255,0.18)' : 'rgba(42,31,16,0.15)', padding: '2px 3px 2px 0px', transition: 'color 0.1s, transform 0.1s', lineHeight: 1 }}
                              onMouseOver={e => { const empty = darkMode ? 'rgba(255,255,255,0.18)' : 'rgba(42,31,16,0.15)'; for (let i = 0; i < 5; i++) { const btn = e.currentTarget.parentNode.children[i]; btn.style.color = i < s ? '#B8472D' : empty; } }}
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
                          <button key={u.id} onClick={() => openItem(u)} style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', background: darkMode ? 'rgba(184,71,45,0.12)' : 'rgba(184,71,45,0.07)', border: '1.5px solid rgba(184,71,45,0.25)', borderRadius: 14, cursor: 'pointer', transition: 'all 0.15s', textAlign: 'left' }}
                            onMouseOver={e => { e.currentTarget.style.background = 'rgba(184,71,45,0.22)'; e.currentTarget.style.borderColor = 'rgba(184,71,45,0.55)'; }}
                            onMouseOut={e => { e.currentTarget.style.background = darkMode ? 'rgba(184,71,45,0.12)' : 'rgba(184,71,45,0.07)'; e.currentTarget.style.borderColor = 'rgba(184,71,45,0.25)'; }}>
                            {u.imageURL && (
                              <div style={{ width: 36, height: 36, borderRadius: 9, overflow: 'hidden', flexShrink: 0 }}>
                                <img src={u.imageURL} alt={u.name} loading="lazy" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                              </div>
                            )}
                            <div>
                              <div className="m-title" style={{ fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap' }}>{u.name}</div>
                              {u.price && <div style={{ fontSize: 11, color: '#B8472D', fontWeight: 700 }}>₹{u.price}</div>}
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
                {(() => {
                  // May 1 — when there's an existing awaiting-payment
                  // takeaway order, the cart isn't a fresh order — it's
                  // additions to the existing one. Show a banner so the
                  // customer knows what tapping "Place Order" / "Add to
                  // order" will do.
                  const isAddMode = placedOrder?.orderId
                    && liveOrderStatus === 'awaiting_payment'
                    && placedOrder.orderType === 'takeaway';
                  if (!isAddMode) return null;
                  const orderRef = placedOrder.orderNumber
                    ? `#${placedOrder.orderNumber}`
                    : `#${(placedOrder.orderId || '').slice(-6).toUpperCase()}`;
                  return (
                    <div style={{
                      padding: '10px 12px', borderRadius: 12, marginBottom: 12,
                      background: darkMode ? 'rgba(184,71,45,0.12)' : 'rgba(184,71,45,0.08)',
                      border: '1.5px solid rgba(184,71,45,0.30)',
                      display: 'flex', alignItems: 'center', gap: 10,
                    }}>
                      <span style={{ fontSize: 18, lineHeight: 1 }}>📦</span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 12, fontWeight: 700, color: darkMode ? '#D7644A' : '#9A371F' }}>
                          Adding to order {orderRef}
                        </div>
                        <div style={{ fontSize: 11, color: darkMode ? 'rgba(255,245,232,0.55)' : 'rgba(42,31,16,0.55)', marginTop: 1, lineHeight: 1.35 }}>
                          These items will be added to your existing order. The new total will need a fresh payment confirmation.
                        </div>
                      </div>
                    </div>
                  );
                })()}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                  <div>
                    <div style={{ fontFamily: 'Inter,sans-serif', fontWeight: 800, fontSize: 18, color: darkMode ? '#FFF5E8' : '#1E1B18', letterSpacing: '-0.3px' }}>🛒 {t.yourOrder}</div>
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
                          <div style={{ fontSize: 11, color: darkMode ? 'rgba(184,71,45,0.85)' : '#A05000', marginTop: 2, fontWeight: 500 }}>
                            {c.modNote}
                          </div>
                        )}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
                          <div style={{ fontSize: 12, color: darkMode ? 'rgba(255,245,232,0.45)' : 'rgba(42,31,16,0.45)' }}>Qty: {c.qty}</div>
                          <button onClick={() => setNoteOpen(n => ({ ...n, [key]: !n[key] }))}
                            style={{ fontSize: 11, color: '#B8472D', background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontWeight: 600 }}>
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
                      <div className="cart-qty-pill" style={{ flexShrink: 0 }}>
                        <button className="qty-btn" onClick={() => removeFromCart(key)}>−</button>
                        <span className="qty-display">{c.qty}</span>
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
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              e.currentTarget.blur();
                              if (couponCode.trim() && !couponLoading) applyCoupon();
                            }
                          }}
                          enterKeyHint="done"
                          placeholder="Coupon code"
                          style={{ flex: 1, padding: '10px 13px', borderRadius: 10, border: `1.5px solid ${darkMode ? 'rgba(255,245,232,0.12)' : 'rgba(42,31,16,0.12)'}`, background: darkMode ? 'rgba(255,255,255,0.05)' : '#fff', color: darkMode ? '#FFF5E8' : '#1E1B18', fontSize: 13, fontFamily: 'monospace', letterSpacing: '0.06em', outline: 'none', textTransform: 'uppercase' }} />
                        <button onClick={applyCoupon} disabled={!couponCode.trim() || couponLoading}
                          style={{ padding: '10px 16px', borderRadius: 10, border: 'none', background: '#B8472D', color: '#fff', fontWeight: 700, fontSize: 13, cursor: 'pointer', opacity: !couponCode.trim() ? 0.5 : 1 }}>
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
                  {(() => {
                    // May 1 — In add-mode (existing awaiting_payment
                    // takeaway), skip the form step (customer already
                    // filled name/phone) and call placeOrder directly,
                    // which will branch to addItemsToOrder. Button label
                    // changes to make the action clear.
                    const isAddMode = placedOrder?.orderId
                      && liveOrderStatus === 'awaiting_payment'
                      && placedOrder.orderType === 'takeaway';
                    return (
                      <button
                        onClick={isAddMode ? placeOrder : () => setOrderStep('form')}
                        disabled={isSubmitting}
                        style={{
                          flex: 2, padding: '12px', borderRadius: 12, border: 'none',
                          background: isSubmitting
                            ? 'rgba(42,31,16,0.3)'
                            : darkMode ? '#D7644A' : '#1E1B18',
                          color: darkMode && !isSubmitting ? '#1E1B18' : '#FFF5E8',
                          fontSize: 14, fontWeight: 700, fontFamily: 'Inter,sans-serif',
                          cursor: isSubmitting ? 'not-allowed' : 'pointer',
                        }}
                      >
                        {isSubmitting ? '…' : isAddMode ? '＋ Add to order' : t.placeOrder}
                      </button>
                    );
                  })()}
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
                              border: selected ? '2px solid #B8472D' : `1.5px solid ${darkMode ? 'rgba(255,245,232,0.12)' : 'rgba(42,31,16,0.12)'}`,
                              background: selected ? 'rgba(184,71,45,0.10)' : darkMode ? 'rgba(255,255,255,0.03)' : '#fff',
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
                      onKeyDown={dismissKeyboardOnEnter}
                      enterKeyHint="done"
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
                      onKeyDown={dismissKeyboardOnEnter}
                      enterKeyHint="next"
                      autoComplete="given-name"
                      style={{ width: '100%', padding: '12px 14px', borderRadius: 12, border: `1.5px solid ${customerName ? 'rgba(90,154,120,0.4)' : darkMode ? 'rgba(255,245,232,0.12)' : 'rgba(42,31,16,0.12)'}`, background: customerName ? (darkMode ? 'rgba(90,154,120,0.1)' : 'rgba(90,154,120,0.07)') : darkMode ? 'rgba(255,255,255,0.05)' : '#fff', color: darkMode ? '#FFF5E8' : '#1E1B18', fontSize: 15, fontFamily: 'Inter,sans-serif', outline: 'none', marginBottom: 10, boxSizing: 'border-box' }}
                    />
                  </>
                )}
                {/* Phone number */}
                <label style={{ fontSize: 12, fontWeight: 700, color: darkMode ? 'rgba(255,245,232,0.5)' : 'rgba(42,31,16,0.5)', letterSpacing: '0.06em', textTransform: 'uppercase', display: 'block', marginBottom: 6 }}>MOBILE NUMBER <span style={{ color: '#E05A3A', fontWeight: 800 }}>*</span></label>
                <input
                  type="tel" inputMode="tel" placeholder="e.g. 9876543210"
                  value={orderPhone} onChange={e => setOrderPhone(e.target.value.replace(/[^0-9+\- ]/g, '').slice(0, 15))}
                  onKeyDown={dismissKeyboardOnEnter}
                  enterKeyHint="done"
                  autoComplete="tel"
                  style={{ width: '100%', padding: '12px 14px', borderRadius: 12, border: `1.5px solid ${orderPhone ? 'rgba(90,154,120,0.4)' : darkMode ? 'rgba(255,245,232,0.12)' : 'rgba(42,31,16,0.12)'}`, background: orderPhone ? (darkMode ? 'rgba(90,154,120,0.1)' : 'rgba(90,154,120,0.07)') : darkMode ? 'rgba(255,255,255,0.05)' : '#fff', color: darkMode ? '#FFF5E8' : '#1E1B18', fontSize: 15, fontFamily: 'Inter,sans-serif', outline: 'none', marginBottom: 6, boxSizing: 'border-box' }}
                />
                {orderPhone && <div style={{ fontSize: 11, color: '#5A9A78', fontWeight: 600, marginBottom: 10 }}>✓ Saved for faster ordering next time</div>}
                {/* Email — optional. May 3.
                    Customers who provide their email will receive a
                    payment-confirmation + "order ready for pickup" mail
                    once Phase M email triggers go live. Customers who
                    skip still get their bill auto-opened in a new tab
                    after payment, so we never gate the order on email. */}
                <label style={{ fontSize: 12, fontWeight: 700, color: darkMode ? 'rgba(255,245,232,0.5)' : 'rgba(42,31,16,0.5)', letterSpacing: '0.06em', textTransform: 'uppercase', display: 'block', marginBottom: 6 }}>EMAIL <span style={{ fontWeight: 400, textTransform: 'none' }}>(optional — for receipt)</span></label>
                <input
                  type="email" inputMode="email" placeholder="you@example.com"
                  value={customerEmail}
                  onChange={e => setCustomerEmail(e.target.value.slice(0, 80))}
                  onKeyDown={dismissKeyboardOnEnter}
                  enterKeyHint="done"
                  autoComplete="email"
                  onBlur={() => {
                    const v = customerEmail.trim();
                    if (!v) { try { localStorage.removeItem('ar_customer_email'); } catch {} return; }
                    if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) {
                      try { localStorage.setItem('ar_customer_email', v); } catch {}
                    }
                  }}
                  style={{ width: '100%', padding: '12px 14px', borderRadius: 12, border: `1.5px solid ${customerEmail ? 'rgba(90,154,120,0.4)' : darkMode ? 'rgba(255,245,232,0.12)' : 'rgba(42,31,16,0.12)'}`, background: customerEmail ? (darkMode ? 'rgba(90,154,120,0.1)' : 'rgba(90,154,120,0.07)') : darkMode ? 'rgba(255,255,255,0.05)' : '#fff', color: darkMode ? '#FFF5E8' : '#1E1B18', fontSize: 15, fontFamily: 'Inter,sans-serif', outline: 'none', marginBottom: 6, boxSizing: 'border-box' }}
                />
                <div style={{ fontSize: 11, color: darkMode ? 'rgba(255,245,232,0.45)' : 'rgba(42,31,16,0.5)', marginBottom: 10, lineHeight: 1.4 }}>
                  Skip this if you'd rather not — your bill will still open in a new tab once payment is confirmed.
                </div>
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
                  style={{ width: '100%', padding: '14px', borderRadius: 12, border: 'none', background: isSubmitting ? 'rgba(42,31,16,0.3)' : darkMode ? '#D7644A' : '#1E1B18', color: darkMode && !isSubmitting ? '#1E1B18' : '#FFF5E8', fontSize: 15, fontWeight: 700, fontFamily: 'Inter,sans-serif', cursor: isSubmitting ? 'not-allowed' : 'pointer', flexShrink: 0 }}>
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
                      background: darkMode ? 'rgba(184,71,45,0.10)' : 'rgba(184,71,45,0.06)',
                      border: '1.5px solid rgba(184,71,45,0.30)',
                      fontSize: 13, color: darkMode ? '#D7644A' : '#9A371F', fontWeight: 600,
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
                                  color: '#B8472D', minWidth: 24,
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
                            border: `1.5px solid ${darkMode ? 'rgba(184,71,45,0.40)' : 'rgba(184,71,45,0.40)'}`,
                            color: '#B8472D',
                            fontSize: 13, fontWeight: 700, fontFamily: 'Inter,sans-serif',
                            cursor: 'pointer', marginBottom: 10,
                          }}>
                          ↺ Change payment method
                        </button>
                      </>
                    )}

                    {/* Add more items — sends the customer back to the menu
                        so they can build a new cart that gets MERGED into
                        this order via /api/orders/add-items. The drawer
                        closes; the Payment FAB at the bottom-right is how
                        they'll get back to the payment screen afterwards. */}
                    <button
                      onClick={() => { setCartOpen(false); setOrderStep('cart'); }}
                      style={{
                        width: '100%', padding: '12px 14px', borderRadius: 12,
                        background: 'transparent',
                        border: `1.5px solid ${darkMode ? 'rgba(255,245,232,0.18)' : 'rgba(42,31,16,0.16)'}`,
                        color: darkMode ? '#FFF5E8' : '#1E1B18',
                        fontSize: 13, fontWeight: 600, fontFamily: 'Inter,sans-serif',
                        cursor: 'pointer', marginBottom: 10,
                      }}>
                      ＋ Add more items
                    </button>

                    {/* Past orders, also visible from the payment screen
                        so the customer knows their earlier orders are
                        still in the kitchen even while paying for a
                        new one. */}
                    {pastOrdersBlock}

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
                // May 3 — When the customer has placed >1 order this
                // session, switch the headline copy. "Order placed!" is
                // misleading when they're flipping through earlier orders
                // — they're tracking, not just-placed.
                const hasMultiOrders = sessionOrders.length > 1;
                const headlineText = hasMultiOrders
                  ? `${sessionOrders.length} orders placed`
                  : t.orderPlaced;
                const subMsg = hasMultiOrders
                  ? 'Tap an order below to see its status'
                  : successMsg;
                return (
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', padding: '12px 0', gap: 12, overflowY: 'auto', overscrollBehavior: 'contain', WebkitOverflowScrolling: 'touch' }}>
                  {/* 40px emoji per spec — used to be 56px which crowded the
                      drag handle above. The smaller size leaves a clean
                      visual rhythm: handle → emoji → headline → status. */}
                  <div style={{ fontSize: 40, lineHeight: 1 }}>🎉</div>
                  <div style={{ fontFamily: 'Inter,sans-serif', fontWeight: 800, fontSize: 22, letterSpacing: '-0.4px', color: darkMode ? '#FFF5E8' : '#1E1B18' }}>{headlineText}</div>
                  <div style={{ fontSize: 13, color: darkMode ? 'rgba(255,245,232,0.55)' : 'rgba(42,31,16,0.55)', lineHeight: 1.55, maxWidth: 280 }}>{subMsg}</div>

                  {/* May 3 — Multi-order tab strip.
                      One tab per session order with a live status dot.
                      Tap to switch which order's kitchen timeline shows
                      below. Hidden when there's only one order — no need
                      to "switch" between a single timeline. */}
                  {hasMultiOrders && (() => {
                    const TAB_STATUS_LABEL = {
                      awaiting_payment: 'Awaiting payment',
                      pending: 'Order placed',
                      preparing: 'Preparing',
                      ready: 'Ready',
                      served: 'Picked up',
                      cancelled: 'Cancelled',
                    };
                    const TAB_STATUS_COLOR = {
                      awaiting_payment: '#D9534F',
                      pending: '#B8472D',
                      preparing: '#B8472D',
                      ready: '#2D8B4E',
                      served: '#7AA88E',
                      cancelled: 'rgba(0,0,0,0.4)',
                    };
                    return (
                      <div style={{ width: '100%', maxWidth: 420 }}>
                        {/* Spec mock 4 — text-only tab strip with a 2px
                            terracotta underline on the active tab. The
                            status colour-dot from before is gone (the
                            timeline below already shows status), keeping
                            this strip clean. Horizontal scroll on small
                            screens; centred when 3 or fewer tabs. */}
                        <div style={{
                          display: 'flex', gap: 4, overflowX: 'auto',
                          WebkitOverflowScrolling: 'touch',
                          scrollbarWidth: 'none',
                          msOverflowStyle: 'none',
                          justifyContent: sessionOrders.length <= 3 ? 'center' : 'flex-start',
                          borderBottom: `1px solid ${darkMode ? 'rgba(255,245,232,0.08)' : 'rgba(42,31,16,0.08)'}`,
                        }}>
                          {sessionOrders.map((so, idx) => {
                            const isSel = so.orderId === selectedSuccessOrderId;
                            const status = so.liveStatus || 'pending';
                            const dotColor = TAB_STATUS_COLOR[status] || '#B8472D';
                            const ref = so.orderNumber
                              ? `Order #${so.orderNumber}${idx > 0 && sessionOrders.some((t, i) => i < idx && t.orderNumber === so.orderNumber) ? `[${idx + 1}]` : ''}`
                              : `Order #${(so.orderId || '').slice(-4).toUpperCase()}`;
                            const isFinished = status === 'served' || status === 'cancelled';
                            return (
                              <button
                                key={so.orderId}
                                onClick={() => setSelectedSuccessOrderId(so.orderId)}
                                style={{
                                  flexShrink: 0,
                                  padding: '10px 14px',
                                  border: 'none',
                                  borderBottom: `2px solid ${isSel ? '#B8472D' : 'transparent'}`,
                                  background: 'transparent',
                                  cursor: 'pointer',
                                  display: 'inline-flex', alignItems: 'center', gap: 6,
                                  fontFamily: 'Inter,sans-serif',
                                  fontSize: 13, fontWeight: 700,
                                  letterSpacing: '-0.1px',
                                  marginBottom: -1,
                                  color: isSel
                                    ? (darkMode ? '#FFF5E8' : '#1E1B18')
                                    : (darkMode ? 'rgba(255,245,232,0.55)' : 'rgba(42,31,16,0.55)'),
                                  whiteSpace: 'nowrap',
                                  transition: 'color 0.15s, border-color 0.15s',
                                  opacity: isFinished && !isSel ? 0.65 : 1,
                                }}>
                                {/* Small pulse dot only for active states to
                                    catch the eye on the inactive tabs */}
                                {(status === 'preparing' || status === 'pending' || status === 'ready')
                                  && !isSel && (
                                  <span style={{
                                    width: 6, height: 6, borderRadius: '50%',
                                    background: dotColor, flexShrink: 0,
                                  }} />
                                )}
                                {ref}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })()}

                  {/* Live order status tracker — drives off the order
                      currently selected in the tab strip (or placedOrder
                      if no tabs / single order). When the selected order
                      is awaiting_payment we hide the kitchen timeline —
                      it's misleading because the kitchen hasn't started
                      yet — and show a payment-pending callout instead. */}
                  {viewingSuccessOrder && (() => {
                    const status = viewingSuccessOrderStatus || 'pending';
                    if (status === 'cancelled') {
                      return (
                        <div style={{ width: '100%', padding: '14px 18px', borderRadius: 16, background: darkMode ? 'rgba(217,83,79,0.12)' : 'rgba(217,83,79,0.08)', border: '1.5px solid rgba(217,83,79,0.3)', fontSize: 13, color: '#D9534F', fontWeight: 600, textAlign: 'center' }}>
                          ✖️ This order was cancelled.
                        </div>
                      );
                    }
                    if (status === 'awaiting_payment') {
                      return (
                        <div style={{ width: '100%', padding: '14px 18px', borderRadius: 16, background: darkMode ? 'rgba(217,83,79,0.10)' : 'rgba(217,83,79,0.06)', border: '1.5px solid rgba(217,83,79,0.25)', fontSize: 13, color: darkMode ? '#FF9B8E' : '#A93D38', fontWeight: 600, textAlign: 'center' }}>
                          💳 Payment pending — kitchen hasn't started yet.
                        </div>
                      );
                    }
                    const STATUS_STEPS = [
                      { key: 'pending',   label: 'Order Placed',   icon: '✓', color: '#B8472D' },
                      { key: 'preparing', label: 'Preparing',      icon: '🍳', color: '#B8472D' },
                      { key: 'ready',     label: 'Ready!',         icon: '🎉', color: '#2D8B4E' },
                      { key: 'served',    label: 'Served',         icon: '✅', color: '#2D8B4E' },
                    ];
                    const curIdx = STATUS_STEPS.findIndex(s => s.key === status);
                    const headerLabel = hasMultiOrders
                      ? `Order ${viewingSuccessOrder.orderNumber ? `#${viewingSuccessOrder.orderNumber}` : ''} status`.trim()
                      : 'Order Status';
                    return (
                      <div style={{ width: '100%', padding: '16px 18px', borderRadius: 16, background: darkMode ? 'rgba(255,255,255,0.05)' : 'rgba(42,31,16,0.03)', border: `1px solid ${darkMode ? 'rgba(255,255,255,0.08)' : 'rgba(42,31,16,0.08)'}` }}>
                        <div style={{ fontSize: 11, fontWeight: 700, color: darkMode ? 'rgba(255,245,232,0.4)' : 'rgba(42,31,16,0.4)', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 12 }}>{headerLabel}</div>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'relative' }}>
                          {/* Progress line */}
                          <div style={{ position: 'absolute', top: 14, left: '10%', right: '10%', height: 3, background: darkMode ? 'rgba(255,255,255,0.1)' : 'rgba(42,31,16,0.1)', borderRadius: 99, zIndex: 0 }}>
                            <div style={{ height: '100%', borderRadius: 99, background: '#B8472D', width: `${Math.min(100, (curIdx / (STATUS_STEPS.length - 1)) * 100)}%`, transition: 'width 0.5s' }} />
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
                  {/* Spec-aligned: bill-ready notice now uses the
                      terracotta tint family (was success-green which
                      misread as "payment complete"). The pairing chip
                      "tap View bill below" still points at the primary
                      action just beneath. */}
                  <div style={{ marginTop: 4, padding: '12px 18px', borderRadius: 14, background: darkMode ? 'rgba(184,71,45,0.12)' : 'rgba(184,71,45,0.08)', border: '1.5px solid rgba(184,71,45,0.28)', fontSize: 13, color: darkMode ? '#E89E7C' : '#9A371F', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 16 }}>🧾</span>
                    Your bill is ready — tap "View bill" below
                  </div>

                  {/* Past-orders block kept ONLY for the single-order
                      case as a no-op (it renders null when pastOrders is
                      empty). When tabs are visible they fully replace it. */}
                  {!hasMultiOrders && pastOrdersBlock}
                  {/* Spec: View Bill is now PRIMARY (terracotta gradient,
                      first/left), Add more is SECONDARY (outlined, right).
                      Used to be reversed. */}
                  <div style={{ display: 'flex', gap: 10, width: '100%', maxWidth: 380, marginTop: 6 }}>
                    <button
                      onClick={() => { setBillOpen(true); setCartOpen(false); setOrderStep('cart'); }}
                      style={{
                        flex: 1, padding: '14px 16px', borderRadius: 12, border: 'none',
                        background: 'linear-gradient(135deg,#C2502E,#B8472D)', color: '#FFF5E8',
                        fontSize: 14, fontWeight: 800, fontFamily: 'Inter,sans-serif',
                        letterSpacing: '-0.1px',
                        cursor: 'pointer',
                        boxShadow: '0 4px 16px rgba(184,71,45,0.32)',
                        display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                      }}>
                      <span style={{ fontSize: 16 }}>🧾</span> View bill
                    </button>
                    <button
                      onClick={() => { setCartOpen(false); setOrderStep('cart'); if (!tableNumber) setOrderTableInput(''); setSpecialNote(''); }}
                      style={{
                        flex: 1, padding: '14px 16px', borderRadius: 12,
                        border: `1.5px solid ${darkMode ? 'rgba(255,245,232,0.18)' : 'rgba(42,31,16,0.16)'}`,
                        background: 'transparent',
                        color: darkMode ? '#FFF5E8' : '#1E1B18',
                        fontSize: 14, fontWeight: 700, fontFamily: 'Inter,sans-serif',
                        cursor: 'pointer',
                        display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                      }}>
                      <span style={{ fontSize: 16 }}>＋</span> Add more
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
            <div style={{ width: '100%', maxWidth: 540, background: darkMode ? '#221C16' : '#FEFCF8', borderRadius: '24px 24px 0 0', padding: '0 0 32px', maxHeight: '85vh', overflowY: 'auto', overscrollBehavior: 'contain', WebkitOverflowScrolling: 'touch', animation: 'slideUp 0.3s cubic-bezier(0.32,0.72,0,1)' }}>
              {/* Handle */}
              <div style={{ display: 'flex', justifyContent: 'center', padding: '14px 0 10px' }}>
                <div style={{ width: 40, height: 4, borderRadius: 2, background: darkMode ? 'rgba(255,255,255,0.15)' : 'rgba(42,31,16,0.15)' }} />
              </div>
              <div style={{ padding: '0 22px' }}>
                {/* Header */}
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 16 }}>
                  <div>
                    <div style={{ fontFamily: 'Poppins,sans-serif', fontWeight: 800, fontSize: 20, color: darkMode ? '#FFF5E8' : '#1E1B18', marginBottom: 4 }}>{selectedCombo.name}</div>
                    {selectedCombo.tag && <span style={{ padding: '3px 10px', borderRadius: 20, background: 'rgba(184,71,45,0.25)', color: darkMode ? '#E89E7C' : '#6E2B17', fontSize: 12, fontWeight: 700 }}>{selectedCombo.tag}</span>}
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
                        <div style={{ fontSize: 11, fontWeight: 700, color: darkMode ? 'rgba(184,71,45,0.8)' : '#6E2B17' }}>View →</div>
                      </div>
                    </div>
                  ))}
                </div>
                {/* Price + CTA */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 18px', borderRadius: 16, background: darkMode ? 'rgba(184,71,45,0.1)' : 'rgba(184,71,45,0.08)', border: '1.5px solid rgba(184,71,45,0.3)', marginBottom: 16 }}>
                  <div>
                    <div style={{ fontFamily: 'Poppins,sans-serif', fontWeight: 900, fontSize: 26, color: '#E05A3A' }}>₹{selectedCombo.comboPrice}</div>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 2 }}>
                      {selectedCombo.originalPrice > selectedCombo.comboPrice && <div style={{ fontSize: 13, color: darkMode ? 'rgba(255,245,232,0.35)' : 'rgba(42,31,16,0.35)', textDecoration: 'line-through' }}>₹{selectedCombo.originalPrice}</div>}
                      {selectedCombo.savings > 0 && <div style={{ fontSize: 13, fontWeight: 700, color: '#2D8B4E' }}>Save ₹{selectedCombo.savings}</div>}
                    </div>
                  </div>
                  <button
                    onClick={() => { addComboToCart(selectedCombo); setSelectedCombo(null); }}
                    style={{ padding: '12px 22px', borderRadius: 14, border: 'none', background: 'linear-gradient(135deg,#B8472D,#E05A3A)', color: '#fff', fontFamily: 'Inter,sans-serif', fontWeight: 800, fontSize: 15, cursor: 'pointer', boxShadow: '0 4px 16px rgba(224,90,58,0.45)' }}>
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
                        style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 18px', borderRadius: 14, border: `2px solid ${waiterReason === opt.id ? '#B8472D' : darkMode ? 'rgba(255,255,255,0.1)' : 'rgba(42,31,16,0.1)'}`, background: waiterReason === opt.id ? 'rgba(184,71,45,0.1)' : 'transparent', cursor: 'pointer', transition: 'all 0.15s', textAlign: 'left', width: '100%' }}>
                        <span style={{ fontSize: 22 }}>{opt.emoji}</span>
                        <span style={{ fontSize: 14, fontWeight: 600, color: darkMode ? '#FFF5E8' : '#1E1B18' }}>{opt.label}</span>
                        {waiterReason === opt.id && <span style={{ marginLeft: 'auto', color: '#B8472D', fontSize: 18 }}>✓</span>}
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
                    style={{ width: '100%', padding: '14px', borderRadius: 14, border: 'none', background: waiterReason ? 'linear-gradient(135deg,#B8472D,#A33B19)' : 'rgba(92, 92, 92, 0.5)', color: waiterReason ? '#fff' : 'rgba(255, 255, 255, 0.57)', fontSize: 15, fontWeight: 700, fontFamily: 'Poppins,sans-serif', cursor: waiterReason ? 'pointer' : 'not-allowed', transition: 'all 0.2s', boxShadow: waiterReason ? '0 4px 16px rgba(184,71,45,0.35)' : 'none' }}>
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
            <div onClick={e => e.stopPropagation()} style={{ width: '100%', maxWidth: 540, margin: '0 auto', background: darkMode ? '#221C16' : '#FEFCF8', borderRadius: '24px 24px 0 0', maxHeight: '85vh', overflow: 'hidden', display: 'flex', flexDirection: 'column', animation: 'slideUp 0.3s cubic-bezier(0.32,0.72,0,1)', transform: 'translateZ(0)', WebkitTransform: 'translateZ(0)' }}>
              {/* Handle */}
              <div style={{ display: 'flex', justifyContent: 'center', padding: '14px 0 10px', flexShrink: 0, background: darkMode ? '#221C16' : '#FEFCF8', borderRadius: '24px 24px 0 0' }}>
                <div style={{ width: 40, height: 4, borderRadius: 2, background: darkMode ? 'rgba(255,255,255,0.15)' : 'rgba(42,31,16,0.15)' }} />
              </div>

              {/* Multi-order tab strip — May 1.
                  Customer placed >1 order this session; let them switch
                  between bills without losing visibility on prior orders.
                  Sticky above the scrollable body so it stays reachable
                  while the customer scrolls a long itemised bill.
                  Only shown for non-aggregate bills (takeaway / no
                  running-bill grouping) and only when there are 2+
                  orders to switch between. */}
              {billTabs.length > 1 && (() => {
                const TAB_STATUS_LABEL = {
                  awaiting_payment: 'Awaiting payment',
                  pending: 'Order placed',
                  preparing: 'Preparing',
                  ready: 'Ready',
                  served: 'Picked up',
                  cancelled: 'Cancelled',
                };
                const TAB_STATUS_COLOR = {
                  awaiting_payment: '#D9534F',
                  pending: '#B8472D',
                  preparing: '#B8472D',
                  ready: '#2D8B4E',
                  served: '#7AA88E',
                  cancelled: 'rgba(0,0,0,0.4)',
                };
                return (
                  <div style={{
                    flexShrink: 0,
                    padding: '0 16px 12px',
                    background: darkMode ? '#221C16' : '#FEFCF8',
                    borderBottom: `1px solid ${darkMode ? 'rgba(255,255,255,0.06)' : 'rgba(42,31,16,0.06)'}`,
                  }}>
                    <div style={{
                      display: 'flex', gap: 8, overflowX: 'auto',
                      WebkitOverflowScrolling: 'touch',
                      paddingBottom: 4,
                      scrollbarWidth: 'none',
                      msOverflowStyle: 'none',
                    }}>
                      {billTabs.map((tab, idx) => {
                        const isSel = tab.orderId === selectedBillOrderId;
                        const isCurrent = placedOrder?.orderId === tab.orderId;
                        // Use liveOrderStatus for the current order so the
                        // tab badge keeps up with admin transitions
                        // (preparing → ready → served) without remount.
                        const liveStatus = isCurrent ? liveOrderStatus : tab.status;
                        const dotColor = TAB_STATUS_COLOR[liveStatus] || '#B8472D';
                        const ref = tab.orderNumber
                          ? `#${tab.orderNumber}${idx > 0 && billTabs.some((t, i) => i < idx && t.orderNumber === tab.orderNumber) ? `[${idx + 1}]` : ''}`
                          : `#${(tab.orderId || '').slice(-4).toUpperCase()}`;
                        return (
                          <button
                            key={tab.orderId}
                            onClick={() => setSelectedBillOrderId(tab.orderId)}
                            style={{
                              flexShrink: 0,
                              padding: '8px 14px',
                              borderRadius: 999,
                              border: `1.5px solid ${isSel ? '#B8472D' : darkMode ? 'rgba(255,255,255,0.1)' : 'rgba(42,31,16,0.1)'}`,
                              background: isSel
                                ? (darkMode ? 'rgba(184,71,45,0.14)' : 'rgba(184,71,45,0.08)')
                                : 'transparent',
                              cursor: 'pointer',
                              display: 'flex', alignItems: 'center', gap: 8,
                              fontFamily: 'Inter,sans-serif',
                              transition: 'all 0.15s',
                            }}>
                            <span style={{
                              width: 8, height: 8, borderRadius: '50%',
                              background: dotColor, flexShrink: 0,
                              boxShadow: liveStatus === 'preparing' || liveStatus === 'pending'
                                ? `0 0 0 2px ${dotColor}30` : 'none',
                            }} />
                            <span style={{
                              fontSize: 13, fontWeight: 700,
                              color: isSel
                                ? (darkMode ? '#FFF5E8' : '#1E1B18')
                                : (darkMode ? 'rgba(255,245,232,0.7)' : 'rgba(42,31,16,0.65)'),
                              whiteSpace: 'nowrap',
                            }}>
                              {ref}
                            </span>
                            <span style={{
                              fontSize: 11, fontWeight: 600,
                              color: darkMode ? 'rgba(255,245,232,0.5)' : 'rgba(42,31,16,0.5)',
                              whiteSpace: 'nowrap',
                            }}>
                              ₹{Math.round(Number(tab.total) || 0).toLocaleString('en-IN')}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                    {viewingBillOrderStatus && (
                      <div style={{
                        marginTop: 8,
                        fontSize: 11, fontWeight: 600,
                        color: TAB_STATUS_COLOR[viewingBillOrderStatus] || (darkMode ? 'rgba(255,245,232,0.55)' : 'rgba(42,31,16,0.55)'),
                        letterSpacing: '0.04em',
                        textTransform: 'uppercase',
                        paddingLeft: 4,
                      }}>
                        Status: {TAB_STATUS_LABEL[viewingBillOrderStatus] || viewingBillOrderStatus}
                      </div>
                    )}
                  </div>
                );
              })()}

              <div style={{ padding: '0 22px calc(env(safe-area-inset-bottom, 20px) + 24px)', overflowY: 'auto', WebkitOverflowScrolling: 'touch', overscrollBehavior: 'contain', flex: 1 }}>
                {/* Header */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, paddingTop: billTabs.length > 1 ? 14 : 0 }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                      <div style={{ fontFamily: 'Poppins,sans-serif', fontWeight: 800, fontSize: 20, color: darkMode ? '#FFF5E8' : '#1E1B18' }}>Your Bill</div>
                      {/* Single-order status pill in the header.
                          Only shown when there's no tab strip (single-order
                          session) — the tab strip surfaces this info
                          itself, so showing it twice would be noisy. */}
                      {billTabs.length <= 1 && viewingBillOrderStatus && (() => {
                        const HDR_LABEL = {
                          awaiting_payment: 'Awaiting payment',
                          pending: 'Order placed',
                          preparing: 'Preparing',
                          ready: 'Ready',
                          served: 'Picked up',
                          cancelled: 'Cancelled',
                        };
                        const HDR_COLOR = {
                          awaiting_payment: '#D9534F',
                          pending: '#B8472D',
                          preparing: '#B8472D',
                          ready: '#2D8B4E',
                          served: '#7AA88E',
                          cancelled: 'rgba(0,0,0,0.4)',
                        };
                        const c = HDR_COLOR[viewingBillOrderStatus] || '#B8472D';
                        return (
                          <span style={{
                            fontSize: 10, fontWeight: 700, letterSpacing: '0.05em',
                            textTransform: 'uppercase', padding: '4px 10px',
                            borderRadius: 999,
                            background: `${c}1A`, color: c,
                            whiteSpace: 'nowrap',
                          }}>
                            {HDR_LABEL[viewingBillOrderStatus] || viewingBillOrderStatus}
                          </span>
                        );
                      })()}
                    </div>
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
                    <div style={{ fontSize: 14, color: darkMode ? 'rgba(255,245,232,0.65)' : 'rgba(42,31,16,0.6)', lineHeight: 1.6, marginBottom: 14 }}>
                      {billPaymentMethod === 'cash'
                        ? `Cash payment of ₹${bill.total} received. Thank you!`
                        : billPaymentMethod === 'card'
                        ? `Card payment of ₹${bill.total} received. Thank you!`
                        : billPaymentMethod === 'upi'
                        ? `UPI payment of ₹${bill.total} received. Thank you!`
                        : `Payment of ₹${bill.total} received. Thank you!`}
                    </div>
                    {/* May 3 — Open Bill CTA inside the Payment Confirmed
                        state. Catches the gateway-UPI flow where there's
                        no user gesture available at the moment payment
                        confirms (the webhook flips paymentStatus
                        server-side, the customer is on the gateway
                        return page or watching the listener update). One
                        tap here is the equivalent of the auto-open we do
                        for cash/card/manual UPI. Also acts as a fallback
                        for those flows when the popup was blocked. */}
                    <button
                      onClick={() => {
                        const html = buildBillHtml(bill, billPaymentMethod);
                        if (!html) {
                          toast.error('Bill not ready yet. Try again in a moment.');
                          return;
                        }
                        // deliverBill handles popup-or-download
                        // transparently — no "Popup blocked" toast.
                        deliverBill(html, `bill-${restaurant?.subdomain || 'order'}-${Date.now()}`);
                      }}
                      style={{
                        width: '100%', padding: '12px 16px', borderRadius: 12, border: 'none',
                        background: '#2D8B4E', color: '#fff',
                        fontSize: 14, fontWeight: 700, fontFamily: 'Inter,sans-serif',
                        cursor: 'pointer',
                        display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                        boxShadow: '0 4px 14px rgba(45,139,78,0.3)',
                      }}>
                      <span style={{ fontSize: 16 }}>🧾</span>
                      Open or Save Bill
                    </button>
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
                ) : (() => {
                  // ── Swiggy-style payment picker (Problem 5 redesign) ──
                  // Shows the UPI apps first (GPay, PhonePe, Paytm, Other)
                  // OR a single "UPI Gateway" row if the restaurant has a
                  // payment gateway active. Cash/Card sit below in a 2-col
                  // grid under the "Or pay at table" label. The single
                  // terracotta CTA at the bottom reads "Pay ₹X via {appName}"
                  // — never generic.
                  const gatewayActive = !!(liveRestaurant?.gatewayActive
                    && liveRestaurant?.gatewayProvider
                    && liveRestaurant?.gatewayProvider !== 'none');
                  const upiAvailable = !!(restaurant?.upiId || gatewayActive);

                  // Deep-link scheme per UPI app. Most Indian UPI apps
                  // register an intent on these schemes; if the app isn't
                  // installed Android falls through to a picker (or our
                  // upi:// universal scheme).
                  const UPI_SCHEME = {
                    gpay:    'tez://upi/pay',
                    phonepe: 'phonepe://pay',
                    paytm:   'paytmmp://pay',
                    other:   'upi://pay',
                  };
                  const APP_NAME = {
                    gpay:    'Google Pay',
                    phonepe: 'PhonePe',
                    paytm:   'Paytm',
                    other:   'UPI',
                    gateway: 'UPI',
                  };

                  // Reference shown in the UPI app's transaction note —
                  // either the bill ID (multi-order tab) or the latest
                  // order ID. Lets the customer / cashier reconcile later.
                  const tnRef = bill.isBill && currentBillId
                    ? 'Bill ' + currentBillId.slice(-6).toUpperCase()
                    : 'Order ' + (placedOrder?.orderId?.slice(-6).toUpperCase() || '');
                  const buildUpiUrl = (scheme) =>
                    restaurant?.upiId
                      ? `${scheme}?pa=${encodeURIComponent(restaurant.upiId)}&pn=${encodeURIComponent(restaurant.name || 'Restaurant')}&am=${bill.total}&cu=INR&tn=${encodeURIComponent(tnRef)}`
                      : null;

                  // CTA copy — Pay ₹X via {appName} when a method is picked.
                  const ctaLabel = (() => {
                    if (!paymentMethod) return 'Select a payment method';
                    if (paymentMethod === 'cash')   return `Pay ₹${bill.total} in Cash`;
                    if (paymentMethod === 'card')   return `Pay ₹${bill.total} by Card`;
                    return `Pay ₹${bill.total} via ${APP_NAME[upiApp] || 'UPI'}`;
                  })();

                  // Pick handlers — set both paymentMethod and upiApp.
                  // Tapping any row also resets the upiOpened flag so the
                  // "I've paid" sub-step starts fresh.
                  const pickUpi = (app) => { setPaymentMethod('upi'); setUpiApp(app); setUpiOpened(false); };
                  const pickTable = (m)   => { setPaymentMethod(m); setUpiApp(null); setUpiOpened(false); };

                  // Single Pay CTA handler — dispatches based on the
                  // selected method. Cash/Card mark their respective
                  // _requested status; gateway opens the gateway URL;
                  // specific UPI apps open their deep link and advance
                  // to the "I've paid" confirmation sub-step.
                  const handlePay = async () => {
                    if (!paymentMethod || !restaurant?.id || !bill?.orderIds?.length) return;

                    if (paymentMethod === 'cash' || paymentMethod === 'card') {
                      try {
                        const newStatus = paymentMethod === 'cash' ? 'cash_requested' : 'card_requested';
                        // Atomic batch — every order on the bill flips
                        // in one commit, or none of them do. Previously
                        // this was Promise.all(updateOne…) which could
                        // leave the bill in a mixed state (one order
                        // flipped, the other still untouched) — exactly
                        // the bug Prabu hit on the admin side.
                        await updatePaymentStatusBatch(restaurant.id, bill.orderIds, newStatus);
                        setPaymentDone(true);
                        try { sessionStorage.setItem('ar_payment_done', JSON.stringify({ method: paymentMethod, orderIds: bill.orderIds })); } catch {}
                      } catch (e) {
                        console.error('[handlePay] batch payment update failed:', e);
                        toast.error('Could not confirm payment. Try again.');
                      }
                      return;
                    }

                    // UPI gateway flow — Razorpay / Paytm Business. Gateway
                    // picks the app and webhook auto-confirms server-side.
                    if (paymentMethod === 'upi' && upiApp === 'gateway') {
                      try {
                        const r = await fetch('/api/payment/intent', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ restaurantId: restaurant.id, orderIds: bill.orderIds }),
                        });
                        const j = await r.json();
                        if (!r.ok || !j.paymentUrl) {
                          toast.error('Could not start UPI payment. Please try Cash / Card or another option.');
                          return;
                        }
                        window.open(j.paymentUrl, '_blank', 'noopener,noreferrer');
                      } catch (e) {
                        console.error('UPI intent failed:', e);
                        toast.error('Could not start UPI payment. Try again.');
                      }
                      return;
                    }

                    // Manual UPI — open the chosen app via deep link, then
                    // show the "I've paid" sub-step on return.
                    if (paymentMethod === 'upi' && restaurant?.upiId) {
                      const scheme = UPI_SCHEME[upiApp] || UPI_SCHEME.other;
                      const upiUrl = buildUpiUrl(scheme);
                      if (!upiUrl) { toast.error('No UPI ID configured on this restaurant.'); return; }
                      setUpiOpened(true);
                      window.open(upiUrl, '_self');
                    }
                  };

                  // ── Manual-UPI sub-step ("I've paid" confirmation) ──
                  // Only renders AFTER the customer tapped Pay for a non-
                  // gateway UPI app. The UI is similar to the previous
                  // step-2 view; the "Reopen UPI App" button uses the
                  // same deep link as the initial tap.
                  if (paymentMethod === 'upi' && upiOpened && !gatewayActive && restaurant?.upiId) {
                    const scheme = UPI_SCHEME[upiApp] || UPI_SCHEME.other;
                    const upiUrl = buildUpiUrl(scheme);
                    return (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                        <div style={{ textAlign: 'center', padding: '14px 16px', borderRadius: 14, background: darkMode ? 'rgba(184,71,45,0.10)' : 'rgba(184,71,45,0.06)', border: '1.5px solid rgba(184,71,45,0.25)' }}>
                          <div style={{ fontSize: 13, color: darkMode ? 'rgba(255,245,232,0.5)' : 'rgba(42,31,16,0.5)', marginBottom: 4 }}>Pay to UPI ID</div>
                          <div style={{ fontSize: 15, fontWeight: 700, fontFamily: "'JetBrains Mono', monospace", color: darkMode ? '#FFF5E8' : '#1E1B18', letterSpacing: '0.03em' }}>{restaurant.upiId}</div>
                          <div style={{ fontSize: 12, color: darkMode ? 'rgba(255,245,232,0.35)' : 'rgba(42,31,16,0.35)', marginTop: 6 }}>
                            Amount: ₹{bill.total} · via {APP_NAME[upiApp] || 'UPI'}
                          </div>
                        </div>
                        <button
                          className="pay-cta"
                          onClick={async () => {
                            if (!restaurant?.id || !bill?.orderIds?.length) return;
                            try {
                              // Same atomic-batch reasoning as the Cash/Card
                              // confirmation path — settle every order on
                              // the bill or none of them.
                              await updatePaymentStatusBatch(restaurant.id, bill.orderIds, 'online_requested');
                              setPaymentDone(true);
                              setUpiOpened(false);
                              try { sessionStorage.setItem('ar_payment_done', JSON.stringify({ method: 'upi', orderIds: bill.orderIds })); } catch {}
                            } catch (e) {
                              console.error('[upi-confirm] batch payment update failed:', e);
                              toast.error('Could not confirm payment. Try again.');
                            }
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
                          Reopen {APP_NAME[upiApp] || 'UPI App'}
                        </button>
                        <button
                          onClick={() => { setUpiOpened(false); }}
                          style={{
                            width: '100%', padding: '8px',
                            border: 'none', background: 'transparent',
                            color: darkMode ? 'rgba(255,245,232,0.45)' : 'rgba(42,31,16,0.45)',
                            fontSize: 12, fontWeight: 600, fontFamily: 'Inter,sans-serif', cursor: 'pointer',
                          }}>
                          ← Back to payment options
                        </button>
                      </div>
                    );
                  }

                  return (
                    <>
                      {/* UPI section — 4 app rows, or 1 gateway row */}
                      {upiAvailable && (
                        <>
                          <div className="pay-section-label">Pay with UPI</div>
                          {gatewayActive ? (
                            <button
                              className={`pay-app-row${paymentMethod === 'upi' && upiApp === 'gateway' ? ' selected' : ''}`}
                              onClick={() => pickUpi('gateway')}>
                              <span className="pay-app-icon gateway">📱</span>
                              <span className="pay-app-name">UPI Gateway · GPay, PhonePe, Paytm</span>
                              <span className="pay-radio" />
                            </button>
                          ) : (
                            <>
                              <button
                                className={`pay-app-row${paymentMethod === 'upi' && upiApp === 'gpay' ? ' selected' : ''}`}
                                onClick={() => pickUpi('gpay')}>
                                <span className="pay-app-icon gpay">G</span>
                                <span className="pay-app-name">Google Pay</span>
                                <span className="pay-radio" />
                              </button>
                              <button
                                className={`pay-app-row${paymentMethod === 'upi' && upiApp === 'phonepe' ? ' selected' : ''}`}
                                onClick={() => pickUpi('phonepe')}>
                                <span className="pay-app-icon phonepe">PP</span>
                                <span className="pay-app-name">PhonePe</span>
                                <span className="pay-radio" />
                              </button>
                              <button
                                className={`pay-app-row${paymentMethod === 'upi' && upiApp === 'paytm' ? ' selected' : ''}`}
                                onClick={() => pickUpi('paytm')}>
                                <span className="pay-app-icon paytm">Pay</span>
                                <span className="pay-app-name">Paytm UPI</span>
                                <span className="pay-radio" />
                              </button>
                              <button
                                className={`pay-app-row${paymentMethod === 'upi' && upiApp === 'other' ? ' selected' : ''}`}
                                onClick={() => pickUpi('other')}>
                                <span className="pay-app-icon other">↗</span>
                                <span className="pay-app-name">Other UPI app</span>
                                <span className="pay-app-chevron">›</span>
                              </button>
                            </>
                          )}
                        </>
                      )}

                      {/* Cash + Card section — 2-col grid */}
                      <div className="pay-section-label">{upiAvailable ? 'Or pay at table' : 'Pay at table'}</div>
                      <div className="pay-table-grid">
                        <button
                          className={`pay-table-tile${paymentMethod === 'cash' ? ' selected' : ''}`}
                          onClick={() => pickTable('cash')}>
                          <span className="pay-app-icon cash">💵</span>
                          <span>Cash</span>
                        </button>
                        <button
                          className={`pay-table-tile${paymentMethod === 'card' ? ' selected' : ''}`}
                          onClick={() => pickTable('card')}>
                          <span className="pay-app-icon card">💳</span>
                          <span>Card</span>
                        </button>
                      </div>

                      {/* Single terracotta CTA — never generic */}
                      <button
                        className="pay-cta"
                        disabled={!paymentMethod}
                        onClick={handlePay}>
                        {ctaLabel}
                      </button>
                      {paymentMethod === 'upi' && upiApp === 'gateway' && (
                        <div className="pay-cta-helper">Auto-confirms once your bank releases the payment</div>
                      )}
                    </>
                  );
                })()}

                {/* Print Bill — May 3.
                    Gated on billPaymentState === 'paid' so it only
                    appears after admin marks the order paid (or the
                    gateway webhook fires for UPI). Customer-reported
                    issue: previously the button was always visible
                    (including on the payment-method picker BEFORE the
                    customer had even chosen a method, and on the
                    "Cash Payment Requested" state where money hadn't
                    actually changed hands), which let them print a
                    "receipt" for an unpaid order. Same bar as the
                    auto-deliver flow. */}
                {billPaymentState === 'paid' && (
                <button
                  onClick={() => {
                    // May 3 — bill HTML now comes from buildBillHtml so
                    // both this print flow and the post-payment auto-open
                    // flow generate identical receipts. paymentMethod
                    // here is whichever the customer last chose; for the
                    // Print path we prefer the derived billPaymentMethod
                    // since by the time this button is visible the
                    // payment is confirmed and that's the source of truth.
                    const printHtml = buildBillHtml(bill, billPaymentMethod);
                    if (!printHtml) {
                      toast.error('Bill not ready yet — try again in a moment.');
                      return;
                    }

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
                )}
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
                                    {item.prepTime && <span style={{ fontSize: 11, color: '#7A7A7A' }}>⏱ {safePrepTime(item.prepTime)}</span>}
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

        {/* ─── May 3 — FIRST-VISIT COACH-MARK TOUR ───
            Visual onboarding overlay: dark backdrop with a "spotlight"
            cutout around real DOM elements (item card, waiter button,
            etc.) and a tooltip card explaining each step. Two tour
            tracks — dine-in (QR scan with table param) vs takeaway —
            with steps filtered down to elements actually visible on
            this customer's page (e.g. waiter step is dropped when
            waiterCallsEnabled is false). Per-device per-restaurant
            via localStorage flag (ar_welcome_seen_{rid}).
            Replaces the previous text-only welcome sheet — the user
            asked for "actual application images" guidance, and this
            spotlights the real UI rather than describing it. */}
        {welcomeOpen && (() => {
          const isDinein = !!tableNumber;  // QR scan with ?table= param
          const tourCommonHead = [
            {
              selector: null,
              title: `Welcome to ${restaurant?.name || 'our menu'}!`,
              body: isDinein && tableNumber
                ? `You're at Table ${tableNumber}. Quick tour to get you ordering in seconds.`
                : isDinein
                  ? "Quick tour to get you ordering in seconds."
                  : "Order ahead and pick up at the counter. Quick tour:",
            },
            {
              // Spotlight just the dish photo (.c-img inside the card)
              // instead of the full .card — menu cards are 500-600px
              // tall on mobile (image + name + ingredients + price +
              // tags + AR pill), and even with our 220px spot cap the
              // tooltip below ended up sitting on top of the rest of
              // the card. The image alone is ~185px and reads
              // unambiguously as "this is one menu item".
              selector: '.card .c-img',
              title: 'Tap any dish for details',
              body: 'See photos, ingredients, and try the AR view if available — works right in your browser, no app needed.',
            },
            {
              // Help Me Choose — the smart-menu-assistant FAB. Always
              // visible (not gated on order state) so the selector
              // works even outside tour mode. Sits in the bottom row
              // alongside the Waiter button.
              selector: '.sma-fab',
              title: "Can't decide? Let us pick",
              body: "Tap Help Me Choose to answer a couple of quick questions about your mood, group size, and what you feel like — we'll recommend dishes that match.",
            },
            {
              selector: '.cart-fab',  // demo View Order button (rendered during tour)
              title: "Add items, then tap 'View Order'",
              body: "Once you've added a dish, this button appears here. Tap it to checkout — review your items, enter your details, and choose how to pay.",
            },
            {
              selector: '.bill-fab.status-fab',  // demo Order Status button
              title: 'Track your order live',
              body: isDinein
                ? "After you order, this button shows live progress: Preparing → Ready → Served. Tap any time."
                : "After you pay, this shows: Preparing → Ready → Picked up. So you know exactly when to come collect.",
            },
            {
              selector: '.bill-fab:not(.status-fab)',  // demo My Bill button
              title: 'See your bill anytime',
              body: isDinein
                ? "Tap My Bill to view your running tab + pay when you're ready. Cash, Card, or UPI."
                : "Tap My Bill to view your itemised receipt anytime after payment.",
            },
          ];
          const allSteps = isDinein
            ? [
                ...tourCommonHead,
                // Waiter step is dropped if the restaurant has waiter calls disabled.
                waiterCallsEnabled ? {
                  selector: '.waiter-fab',
                  title: 'Need help? Call your waiter',
                  body: "For water, the bill, or anything else — we'll come right over.",
                } : null,
                {
                  selector: null,
                  title: "You're all set",
                  body: "Add items, place your order, eat — pay any time. Tap 'Got it' to start exploring.",
                },
              ]
            : [
                ...tourCommonHead,
                {
                  selector: null,
                  title: 'Pay first, then we cook',
                  body: "The kitchen starts only AFTER payment confirms — so no surprises with timing.",
                },
              ];
          // Drop nulls so disabled features don't leave gaps in the tour.
          const steps = allSteps.filter(Boolean);
          return (
            <CoachMarkTour
              steps={steps}
              onDone={dismissWelcome}
              darkMode={darkMode}
            />
          );
        })()}

        {/* ─── Phase N — FEEDBACK PROMPT SHEET ───
            Triggered after an order goes 'served' (picked up for
            takeaway, served for dine-in). Stars + optional comment +
            Submit / Maybe later. Both the submit and dismiss paths mark
            the orderId in ratedOrderIds so we don't bug the customer
            twice. Shown as a slide-up sheet for consistency with the
            cart/bill sheets — same SheetOverlay component. */}
        {feedbackForOrderId && (() => {
          const ratingOrder = sessionOrders.find(o => o.orderId === feedbackForOrderId);
          const ref = ratingOrder?.orderNumber
            ? `#${ratingOrder.orderNumber}`
            : `#${(feedbackForOrderId || '').slice(-4).toUpperCase()}`;
          return (
            <SheetOverlay onClose={() => dismissFeedbackPrompt(feedbackForOrderId)} darkMode={darkMode}>
              <div onClick={e => e.stopPropagation()} style={{
                width: '100%', maxWidth: 540, margin: '0 auto',
                background: darkMode ? '#221C16' : '#FEFCF8',
                borderRadius: '24px 24px 0 0',
                padding: '0 0 calc(env(safe-area-inset-bottom, 20px) + 28px)',
                animation: 'slideUp 0.3s cubic-bezier(0.32,0.72,0,1)',
              }}>
                {/* Handle */}
                <div style={{ display: 'flex', justifyContent: 'center', padding: '14px 0 10px' }}>
                  <div style={{ width: 40, height: 4, borderRadius: 2, background: darkMode ? 'rgba(255,255,255,0.15)' : 'rgba(42,31,16,0.15)' }} />
                </div>
                <div style={{ padding: '0 22px' }}>
                  <div style={{ textAlign: 'center', marginBottom: 18 }}>
                    <div style={{ fontSize: 44, marginBottom: 8 }}>🍽️</div>
                    <div style={{ fontFamily: 'Poppins,sans-serif', fontWeight: 800, fontSize: 20, color: darkMode ? '#FFF5E8' : '#1E1B18', marginBottom: 4 }}>
                      How was your experience?
                    </div>
                    <div style={{ fontSize: 13, color: darkMode ? 'rgba(255,245,232,0.5)' : 'rgba(42,31,16,0.5)' }}>
                      Order {ref} · Tap a star to rate
                    </div>
                  </div>

                  {/* Stars */}
                  <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginBottom: 20 }}>
                    {[1, 2, 3, 4, 5].map(n => {
                      const filled = n <= feedbackRating;
                      return (
                        <button
                          key={n}
                          onClick={() => setFeedbackRating(n)}
                          aria-label={`Rate ${n} star${n === 1 ? '' : 's'}`}
                          style={{
                            background: 'transparent', border: 'none',
                            cursor: 'pointer', padding: 4,
                            fontSize: 38, lineHeight: 1,
                            color: filled ? '#B8472D' : (darkMode ? 'rgba(255,245,232,0.2)' : 'rgba(42,31,16,0.18)'),
                            transition: 'transform 0.15s, color 0.15s',
                            transform: filled ? 'scale(1.05)' : 'scale(1)',
                          }}>
                          {filled ? '★' : '☆'}
                        </button>
                      );
                    })}
                  </div>

                  {/* Optional comment */}
                  <textarea
                    placeholder="Tell us what you liked, or how we could improve… (optional)"
                    value={feedbackComment}
                    onChange={e => setFeedbackComment(e.target.value.slice(0, 500))}
                    rows={3}
                    style={{
                      width: '100%', boxSizing: 'border-box',
                      padding: '12px 14px',
                      borderRadius: 14,
                      border: `1.5px solid ${darkMode ? 'rgba(255,245,232,0.12)' : 'rgba(42,31,16,0.12)'}`,
                      background: darkMode ? 'rgba(255,255,255,0.04)' : 'rgba(42,31,16,0.02)',
                      color: darkMode ? '#FFF5E8' : '#1E1B18',
                      fontSize: 14, fontFamily: 'Inter,sans-serif',
                      resize: 'none',
                      outline: 'none',
                      marginBottom: 14,
                    }}
                  />

                  {/* Action buttons */}
                  <div style={{ display: 'flex', gap: 10 }}>
                    <button
                      onClick={() => dismissFeedbackPrompt(feedbackForOrderId)}
                      disabled={feedbackSending}
                      style={{
                        flex: 1, padding: '13px 16px', borderRadius: 12,
                        border: `1.5px solid ${darkMode ? 'rgba(255,245,232,0.18)' : 'rgba(42,31,16,0.16)'}`,
                        background: 'transparent',
                        color: darkMode ? '#FFF5E8' : '#1E1B18',
                        fontSize: 14, fontWeight: 600, fontFamily: 'Inter,sans-serif',
                        cursor: feedbackSending ? 'not-allowed' : 'pointer',
                        opacity: feedbackSending ? 0.5 : 1,
                      }}>
                      Maybe later
                    </button>
                    <button
                      onClick={handleFeedbackSubmit}
                      disabled={feedbackSending || !feedbackRating}
                      style={{
                        flex: 1, padding: '13px 16px', borderRadius: 12, border: 'none',
                        background: feedbackRating
                          ? 'linear-gradient(135deg,#B8472D,#A33B19)'
                          : (darkMode ? 'rgba(255,255,255,0.1)' : 'rgba(42,31,16,0.1)'),
                        color: feedbackRating ? '#fff' : (darkMode ? 'rgba(255,245,232,0.4)' : 'rgba(42,31,16,0.4)'),
                        fontSize: 14, fontWeight: 700, fontFamily: 'Inter,sans-serif',
                        cursor: feedbackRating && !feedbackSending ? 'pointer' : 'not-allowed',
                        boxShadow: feedbackRating ? '0 4px 16px rgba(184,71,45,0.30)' : 'none',
                      }}>
                      {feedbackSending ? 'Sending…' : 'Submit'}
                    </button>
                  </div>
                </div>
              </div>
            </SheetOverlay>
          );
        })()}

        {/* ─── Order-more card (DINE-IN, post-rating) ───
            User flow (per the May 8 spec): order served → rating
            sheet (existing) → on rating submit OR close, this card
            appears. "Yes, order more" closes the card and the
            customer is back on the menu. Closing via the X (or
            backdrop) routes them to the bill modal with the payment
            method picker — saves them from hunting for the bill
            button after deciding they're done. Only fires on dine-in
            (takeaway customers walk away after pickup). */}
        {showOrderMoreCard && (
          <SheetOverlay
            onClose={() => {
              setShowOrderMoreCard(false);
              // Closing without saying "order more" → they want the bill.
              setBillOpen(true);
            }}
            darkMode={darkMode}
          >
            <div onClick={e => e.stopPropagation()} style={{
              width: '100%', maxWidth: 460, margin: '0 auto',
              background: darkMode ? '#221C16' : '#FEFCF8',
              borderRadius: '24px 24px 0 0',
              padding: '0 0 calc(env(safe-area-inset-bottom, 20px) + 24px)',
              animation: 'slideUp 0.3s cubic-bezier(0.32,0.72,0,1)',
            }}>
              {/* Handle */}
              <div style={{ display: 'flex', justifyContent: 'center', padding: '14px 0 10px' }}>
                <div style={{ width: 40, height: 4, borderRadius: 2, background: darkMode ? 'rgba(255,255,255,0.15)' : 'rgba(42,31,16,0.15)' }} />
              </div>
              <div style={{ padding: '4px 22px 0' }}>
                <div style={{ textAlign: 'center', marginBottom: 22 }}>
                  <div style={{ fontSize: 44, marginBottom: 8 }}>🍴</div>
                  <div style={{ fontFamily: 'Poppins,sans-serif', fontWeight: 800, fontSize: 22, color: darkMode ? '#FFF5E8' : '#1E1B18', marginBottom: 6 }}>
                    Order more?
                  </div>
                  <div style={{ fontSize: 13, color: darkMode ? 'rgba(255,245,232,0.55)' : 'rgba(42,31,16,0.55)', lineHeight: 1.5 }}>
                    Want to add more dishes to your table?
                  </div>
                </div>
                <button
                  onClick={() => setShowOrderMoreCard(false)}
                  style={{
                    width: '100%', padding: '14px 16px', borderRadius: 14, border: 'none',
                    background: 'linear-gradient(135deg, #B8472D, #D7644A)',
                    color: '#1E1B18',
                    fontSize: 15, fontWeight: 800, fontFamily: 'Inter,sans-serif',
                    letterSpacing: '0.02em', cursor: 'pointer',
                    boxShadow: '0 6px 18px rgba(184,71,45,0.35)',
                  }}
                >
                  Yes, order more
                </button>
                <div style={{
                  textAlign: 'center', marginTop: 14,
                  fontSize: 12, color: darkMode ? 'rgba(255,245,232,0.4)' : 'rgba(42,31,16,0.4)',
                }}>
                  Close to view your bill
                </div>
              </div>
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