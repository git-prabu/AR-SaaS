// components/order-kitchen/Icons.js
//
// Direct port of the Claude Design prototype's icons.jsx, converted
// from window.I = {...} globals to proper React component exports.
// Every SVG path / strokeWidth / viewBox copied byte-for-byte.

import React from 'react';

export const I = {
  back:    (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>),
  close:   (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18M6 6l12 12"/></svg>),
  plus:    (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M5 12h14"/></svg>),
  minus:   (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14"/></svg>),
  chevR:   (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6"/></svg>),
  arrowR:  (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 5l7 7-7 7"/></svg>),
  user:    (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></svg>),
  grid:    (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></svg>),
  chef:    (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M6 13.87A4 4 0 0 1 7.41 6a5.11 5.11 0 0 1 1.05-1.54 5 5 0 0 1 7.08 0A5.11 5.11 0 0 1 16.59 6 4 4 0 0 1 18 13.87V21H6Z"/><path d="M6 17h12"/></svg>),
  receipt: (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M4 2v20l2-1.5L8 22l2-1.5L12 22l2-1.5L16 22l2-1.5L20 22V2l-2 1.5L16 2l-2 1.5L12 2l-2 1.5L8 2 6 3.5Z"/><path d="M8 7h8M8 11h8M8 15h5"/></svg>),
  bell:    (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/></svg>),
  edit:    (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>),
  trash:   (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/></svg>),
  check:   (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5"/></svg>),
  flame:   (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5Z"/></svg>),
  send:    (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round"><path d="M22 2 11 13M22 2l-7 20-4-9-9-4Z"/></svg>),
  copy:    (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>),
  clock:   (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>),
  search:  (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></svg>),
};

export function VegMark({ veg }) {
  return <span className={'vegmark' + (veg ? '' : ' nonveg')} title={veg ? 'Veg' : 'Non-veg'} />;
}

const SPICE_LABELS_TITLE = ['No spice', 'Mild', 'Medium', 'Spicy', 'Very spicy'];
export function SpicePips({ level }) {
  if (!level) return null;
  return (
    <span className="spice" title={SPICE_LABELS_TITLE[level]}>
      {[1, 2, 3, 4].map(n => <i key={n} className={n <= level ? 'on' : ''} />)}
    </span>
  );
}

// Warm photo-placeholder tile seeded from the dish tint + emoji.
// Identical to the prototype's Thumb. If the item has a real
// imageURL we render the photo instead and skip the placeholder.
function shade(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  let r = (n >> 16) + amt;
  let g = ((n >> 8) & 255) + amt;
  let b = (n & 255) + amt;
  r = Math.max(0, Math.min(255, r));
  g = Math.max(0, Math.min(255, g));
  b = Math.max(0, Math.min(255, b));
  return '#' + ((r << 16) | (g << 8) | b).toString(16).padStart(6, '0');
}
// Phase D revisited (2026-06-03) — owner reported "item images
// are not there only emoji." Root cause was that the previous
// Thumb only honored `item.imageURL` and went straight to the
// emoji fallback when that field was empty. But on the customer
// menu (pages/restaurant/[subdomain]/index.js) the SAME data
// situation gets a curated Unsplash food placeholder instead of
// a void — so a restaurant that hasn't uploaded photos still
// shows the diner real dish-looking images.
//
// Mirroring that behavior here means the waiter sees realistic
// food in the menu screen whether the owner has uploaded photos
// or not. Real uploads still take priority (item.imageURL when
// present); the placeholder pool is the SECOND-tier fallback;
// the gradient + emoji is the FINAL fallback (kicks in only if
// even the placeholder URL fails to load, e.g. on a tablet with
// images.unsplash.com blocked).
//
// Pool + hash function are copied verbatim from the customer
// menu page so a given item id picks the SAME image on both
// pages — consistent visual language for the same dish.

import { useState } from 'react';

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
function placeholderFor(id) {
  let h = 0;
  for (let i = 0; i < (id || '').length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return FOOD_PLACEHOLDERS[h % FOOD_PLACEHOLDERS.length];
}

export function Thumb({ item, className }) {
  // failed: the IMAGE we tried to render (real upload OR placeholder)
  // 404'd / was blocked. Drops us to the emoji + gradient fallback.
  const [failed, setFailed] = useState(false);
  const realUpload = item?.imageURL;
  const candidate = !failed
    ? (realUpload || placeholderFor(item?.id || item?.name))
    : null;

  if (candidate) {
    return (
      <div className={'thumb ' + (className || '')} style={{ background: 'var(--surface)' }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={candidate}
          alt={item?.name || ''}
          loading="lazy"
          decoding="async"
          onError={() => setFailed(true)}
          style={{ position: 'relative', zIndex: 2 }}
        />
      </div>
    );
  }

  const bg = `linear-gradient(150deg, ${item.tint}, ${shade(item.tint, -28)})`;
  return (
    <div className={'thumb ' + (className || '')} style={{ background: bg }}>
      <span style={{ position: 'relative', zIndex: 2, filter: 'drop-shadow(0 3px 6px rgba(0,0,0,.35))' }}>
        {item.emoji}
      </span>
      <span className="ph-tag">photo</span>
    </div>
  );
}

export const rupee = (n) => '₹' + Number(n).toLocaleString('en-IN');
