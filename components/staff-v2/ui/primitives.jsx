// components/staff-v2/ui/primitives.jsx
//
// Tiny presentational primitives matching the prototype 1:1.
// Used everywhere across the staff-v2 surface.

export const rupee = (n) => '₹' + Math.round(Number(n) || 0).toLocaleString('en-IN');

// 13px square with circle/triangle inner marker. Veg = green, Non-veg = red.
export function VegMark({ veg, title }) {
  return <span className={'vegmark' + (veg ? '' : ' nonveg')} title={title || (veg ? 'Veg' : 'Non-veg')} />;
}

// 4 dots in saffron, lit by spice level (1..4). Returns null for 0.
export function SpicePips({ level }) {
  const n = Number(level) || 0;
  if (n <= 0) return null;
  return (
    <span className="spice" title={SPICE_LABELS[n]}>
      {[1, 2, 3, 4].map(i => <i key={i} className={i <= n ? 'on' : ''} />)}
    </span>
  );
}

// Food thumbnail — real photo via item.imageURL, OR a warm tinted
// gradient with the dish emoji + "photo" placeholder tag.
export function Thumb({ item, className }) {
  if (item?.imageURL) {
    return (
      <div className={'thumb ' + (className || '')} style={{ background: '#1A1815' }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={item.imageURL} alt="" loading="lazy" />
      </div>
    );
  }
  const tint = item?.tint || tintFromName(item?.name);
  const bg = `linear-gradient(150deg, ${tint}, ${shade(tint, -28)})`;
  return (
    <div className={'thumb ' + (className || '')} style={{ background: bg }}>
      <span style={{ position: 'relative', zIndex: 2, filter: 'drop-shadow(0 3px 6px rgba(0,0,0,.35))' }}>
        {item?.emoji || emojiFromCategory(item?.category) || '🍽'}
      </span>
      <span className="ph-tag">photo</span>
    </div>
  );
}

// Deterministic warm tint from the item name (so the same dish always
// renders with the same colour, but different dishes vary).
const TINTS = ['#C2562B', '#9A3F1C', '#C4A86D', '#A88247', '#4A7A5A', '#E8C89A', '#B52020', '#5A2310', '#8FC4A8', '#F4A0B0'];
function tintFromName(s) {
  if (!s) return '#C4A86D';
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return TINTS[Math.abs(h) % TINTS.length];
}

function shade(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  let r = (n >> 16) + amt, g = ((n >> 8) & 255) + amt, b = (n & 255) + amt;
  r = Math.max(0, Math.min(255, r));
  g = Math.max(0, Math.min(255, g));
  b = Math.max(0, Math.min(255, b));
  return '#' + ((r << 16) | (g << 8) | b).toString(16).padStart(6, '0');
}

// Map a category string to a sensible emoji. Falls back to 🍽 for
// unknown. Used in category tabs and thumb fallback.
const CAT_EMOJI = [
  { rx: /(starter|appetiz|snack)/i, e: '🥗' },
  { rx: /(main|curry)/i, e: '🍛' },
  { rx: /(bread|naan|roti|paratha|kulcha)/i, e: '🫓' },
  { rx: /(biryani|rice|pulao)/i, e: '🍚' },
  { rx: /(dessert|sweet|ice cream|kulfi)/i, e: '🍰' },
  { rx: /(drink|beverag|lassi|chai|coffee|tea|soda|juice|mocktail|cocktail)/i, e: '🥤' },
  { rx: /(pizza)/i, e: '🍕' },
  { rx: /(burger)/i, e: '🍔' },
  { rx: /(pasta|noodle)/i, e: '🍝' },
  { rx: /(soup|broth)/i, e: '🍲' },
  { rx: /(salad)/i, e: '🥗' },
  { rx: /(seafood|fish|prawn)/i, e: '🐟' },
  { rx: /(chicken|meat|lamb|mutton|beef|kebab)/i, e: '🍗' },
  { rx: /(breakfast|eggs?)/i, e: '🍳' },
];
export function emojiFromCategory(cat) {
  if (!cat) return null;
  for (const { rx, e } of CAT_EMOJI) if (rx.test(cat)) return e;
  return null;
}

// Stepper used in item rows and review lines.
export function Stepper({ qty, onInc, onDec }) {
  return (
    <div className="stepper">
      <button onClick={(e) => { e.stopPropagation(); onDec?.(); }} aria-label="Decrease"><Minus /></button>
      <span className="qty">{qty}</span>
      <button onClick={(e) => { e.stopPropagation(); onInc?.(); }} aria-label="Increase"><Plus /></button>
    </div>
  );
}

// Big stepper for the item-detail sheet (38px hit areas).
export function QtyBig({ qty, onInc, onDec }) {
  return (
    <div className="qty-big">
      <button onClick={onDec} aria-label="Decrease"><Minus /></button>
      <span className="qty">{qty}</span>
      <button onClick={onInc} aria-label="Increase"><Plus /></button>
    </div>
  );
}

// Inline icon components (used by Stepper, etc.) — keep file self-contained.
function Plus()  { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M5 12h14"/></svg>; }
function Minus() { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14"/></svg>; }

// Spice level labels — 0..4. Exported for the detail sheet.
export const SPICE_LABELS = ['No spice', 'Mild', 'Medium', 'Spicy', 'Very spicy'];

// Convert HaloHelm's string-form spiceLevel into the 0..4 integer the
// design uses. Unknown / undefined → 0. Tolerant of casing/spaces.
export function spiceToInt(v) {
  if (typeof v === 'number') return Math.max(0, Math.min(4, Math.round(v)));
  const s = String(v || '').toLowerCase().replace(/\s/g, '');
  if (s.startsWith('veryspicy')) return 4;
  if (s.startsWith('spicy')) return 3;
  if (s.startsWith('medium')) return 2;
  if (s.startsWith('mild')) return 1;
  return 0;
}

// Default modifier list (shown when an item has no per-item override).
// Phase F (future) will let owners customize this per dish.
export const DEFAULT_MODIFIERS = ['Extra spicy', 'No onion', 'No garlic', 'Less oil', 'Extra gravy', 'Jain'];
