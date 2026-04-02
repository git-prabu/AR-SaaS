import Link from 'next/link';
import { useRouter } from 'next/router';
import { useAuth } from '../../hooks/useAuth';
import { useEffect, useRef } from 'react';
import { db } from '../../lib/firebase';
import { collection, onSnapshot, query, orderBy } from 'firebase/firestore';

const navItems = [
  { href: '/admin', label: 'Overview', icon: '▦' },
  { href: '/admin/orders', label: 'Orders', icon: '🛒' },
  { href: '/admin/requests', label: 'Requests', icon: '◈' },
  { href: '/admin/items', label: 'Menu Items', icon: '🍽' },
  { href: '/admin/combos', label: 'Combo Builder', icon: '🍱' },
  { href: '/admin/analytics', label: 'Analytics', icon: '◎' },
  { href: '/admin/notifications', label: 'Notifications', icon: '🔔' },
  { href: '/admin/qrcode', label: 'QR Code', icon: '⬡' },
  { href: '/admin/offers', label: 'Offers', icon: '◇' },
  { href: '/admin/subscription', label: 'Subscription', icon: '◉' },
];

export default function AdminLayout({ children }) {
  const { user, userData, loading, signOut } = useAuth();
  const router = useRouter();
  const rid = userData?.restaurantId;

  // ─── GLOBAL SOUND + NOTIFICATION SYSTEM ──────────────────────────────────
  // Lives in AdminLayout so it runs on EVERY admin page, not just the page
  // the admin happens to be looking at. Individual pages no longer play sounds.
  const prevCallRef   = useRef(0);
  const prevOrderRef  = useRef(0);
  const notifGranted  = useRef(false);

  // Request OS notification permission once (needed for background-tab alerts)
  useEffect(() => {
    if (typeof window === 'undefined' || !('Notification' in window)) return;
    if (Notification.permission === 'granted') {
      notifGranted.current = true;
    } else if (Notification.permission !== 'denied') {
      Notification.requestPermission().then(p => { notifGranted.current = p === 'granted'; });
    }
  }, []);

  // Check if sound is enabled (respects the toggle on the Notifications settings page)
  const soundAllowed = () => localStorage.getItem('ar_sound_enabled') !== 'false';

  // Bell chime — used for waiter calls (ding-ding tone via Web Audio API)
  const playBell = async () => {
    if (!soundAllowed()) return;
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      if (ctx.state === 'suspended') await ctx.resume();
      const tone = (freq, start, dur, peak) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain); gain.connect(ctx.destination);
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, start);
        gain.gain.setValueAtTime(0, start);
        gain.gain.linearRampToValueAtTime(peak, start + 0.01);
        gain.gain.exponentialRampToValueAtTime(0.001, start + dur);
        osc.start(start); osc.stop(start + dur);
      };
      tone(880,  ctx.currentTime,        1.4, 0.55);
      tone(1760, ctx.currentTime,        0.7, 0.25);
      tone(880,  ctx.currentTime + 0.55, 1.2, 0.45);
      tone(1760, ctx.currentTime + 0.55, 0.6, 0.2);
    } catch {}
  };

  // MP3 alert — used for new orders
  const playAlert = () => {
    if (!soundAllowed()) return;
    try { new Audio('/notification.mp3').play().catch(() => {}); } catch {}
  };

  // Show an OS notification popup — fires even when this tab is in the background
  const showOsNotif = (title, body) => {
    if (!notifGranted.current) return;
    try {
      const n = new Notification(title, { body, icon: '/favicon.ico', tag: 'ar-alert' });
      setTimeout(() => n.close(), 8000);
      n.onclick = () => { window.focus(); n.close(); };
    } catch {}
  };

  // Waiter-calls listener — always active on every admin page
  useEffect(() => {
    if (!rid) return;
    const q = query(collection(db, 'restaurants', rid, 'waiterCalls'), orderBy('createdAt', 'desc'));
    return onSnapshot(q, snap => {
      const pending = snap.docs.filter(d => d.data().status === 'pending').length;
      if (prevCallRef.current > 0 && pending > prevCallRef.current) {
        playBell();   // distinct bell chime for waiter calls
        if (document.hidden) showOsNotif('🔔 New Waiter Call', 'A customer needs help — tap to view');
      }
      prevCallRef.current = pending;
    });
  }, [rid]);

  // Orders listener — always active on every admin page
  useEffect(() => {
    if (!rid) return;
    const q = query(collection(db, 'restaurants', rid, 'orders'), orderBy('createdAt', 'desc'));
    return onSnapshot(q, snap => {
      const pending = snap.docs.filter(d => d.data().status === 'pending').length;
      if (prevOrderRef.current > 0 && pending > prevOrderRef.current) {
        playAlert();
        if (document.hidden) showOsNotif('🛒 New Order', 'A new order has arrived — tap to view');
      }
      prevOrderRef.current = pending;
    });
  }, [rid]);
  // ─────────────────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!loading && !user) router.push('/admin/login');
  }, [user, loading, router]);

  if (loading || !user) return (
    <div style={{ minHeight: '100vh', background: '#FAF7F2', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ width: 36, height: 36, border: '3px solid #F79B3D', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );

  const isActive = (href) => href === '/admin' ? router.pathname === '/admin' : router.pathname.startsWith(href);

  return (
    <div style={{ minHeight: '100vh', background: '#FAF7F2', fontFamily: 'Inter,sans-serif', color: '#2B2B2B', display: 'flex', position: 'relative' }}>
      <style>{`
        @keyframes spin{to{transform:rotate(360deg)}}
        .nlnk{
          display:flex;align-items:center;gap:10px;padding:10px 14px;border-radius:14px;
          font-size:13.5px;font-weight:500;text-decoration:none;
          color:rgba(255,225,185,0.6);transition:all 0.18s;margin-bottom:3px;
        }
        .nlnk:hover{background:rgba(255,255,255,0.07);color:rgba(255,240,220,0.9);}
        .nlnk.on{
          background:linear-gradient(135deg,#F79B3D,#F48A1E);
          color:#fff;font-weight:700;
          box-shadow:0 4px 16px rgba(247,155,61,0.38);
        }
      `}</style>

      {/* ── Dark warm sidebar ── */}
      <aside style={{
        width: 220, flexShrink: 0, background: '#1E1B18',
        display: 'flex', flexDirection: 'column',
        position: 'fixed', inset: '0 auto 0 0', zIndex: 20,
        boxShadow: '4px 0 24px rgba(0,0,0,0.18)'
      }}>
        {/* Amber accent strip */}
        <div style={{ height: 4, background: 'linear-gradient(90deg,#F79B3D,#F4C06A,#C4B5D4)' }} />

        {/* Brand */}
        <div style={{ padding: '22px 18px 16px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
          <Link href="/" style={{ textDecoration: 'none' }}>
            <div style={{ fontFamily: 'Poppins,sans-serif', fontWeight: 800, fontSize: 17, color: '#FFF5E8' }}>
              Advert <span style={{ background: 'linear-gradient(135deg,#F79B3D,#F4C06A)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>Radical</span>
            </div>
          </Link>
          <div style={{ fontSize: 11, color: 'rgba(247,155,61,0.5)', marginTop: 3, fontWeight: 500, letterSpacing: '0.06em', textTransform: 'uppercase' }}>Restaurant Portal</div>
        </div>

        {/* Nav */}
        <nav style={{ flex: 1, padding: '14px 10px', overflowY: 'auto' }}>
          {navItems.map(item => (
            <Link key={item.href} href={item.href} className={`nlnk${isActive(item.href) ? ' on' : ''}`}>
              <span style={{ fontSize: 14, width: 20, textAlign: 'center' }}>{item.icon}</span>
              {item.label}
            </Link>
          ))}
        </nav>

        {/* User card */}
        <div style={{ padding: '12px 10px', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
          <div style={{ padding: '10px 14px', marginBottom: 6, background: 'rgba(255,255,255,0.05)', borderRadius: 14, border: '1px solid rgba(255,255,255,0.06)' }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'rgba(255,240,220,0.85)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {userData?.restaurantName || userData?.email || user.email}
            </div>
            <div style={{ fontSize: 11, color: 'rgba(247,155,61,0.5)', marginTop: 2 }}>Restaurant Admin</div>
          </div>
          <button onClick={signOut}
            style={{ width: '100%', padding: '9px 14px', borderRadius: 12, border: 'none', background: 'transparent', fontSize: 13, color: 'rgba(255,180,120,0.4)', cursor: 'pointer', textAlign: 'left', transition: 'all 0.15s' }}
            onMouseOver={e => { e.currentTarget.style.background = 'rgba(247,155,61,0.12)'; e.currentTarget.style.color = '#F79B3D' }}
            onMouseOut={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'rgba(255,180,120,0.4)' }}>
            Sign out →
          </button>
        </div>
      </aside>

      <main style={{ flex: 1, marginLeft: 220, minHeight: '100vh', overflowY: 'auto' }}>
        {children}
      </main>
    </div>
  );
}
