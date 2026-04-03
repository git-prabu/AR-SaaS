import Link from 'next/link';
import { useRouter } from 'next/router';
import { useAuth } from '../../hooks/useAuth';
import { useEffect, useRef } from 'react';
import { db } from '../../lib/firebase';
import { collection, onSnapshot, query, orderBy } from 'firebase/firestore';

const navItems = [
  { href: '/admin/analytics', label: 'Analytics', icon: '◎' },
  { href: '/admin/items', label: 'Menu Items', icon: '🍽' },
  { href: '/admin/orders', label: 'Orders', icon: '🛒' },
  { href: '/admin/payments', label: 'Payments', icon: '💰' },
  { href: '/admin/notifications', label: 'Notification', icon: '🔔' },
  { href: '/admin/requests', label: 'Add Items/Requests', icon: '◈' },
  { href: '/admin/combos', label: 'Combo Builder', icon: '🍱' },
  { href: '/admin/offers', label: 'Offers', icon: '◇' },
  { href: '/admin/qrcode', label: 'QR Code', icon: '⬡' },
  { href: '/admin/subscription', label: 'Subscription', icon: '◉' },
];

function playPaymentBell() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    // Two-tone ascending chime for payment
    [[523, 0], [659, 0.15], [784, 0.3]].forEach(([freq, delay]) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain); gain.connect(ctx.destination);
      osc.type = 'sine'; osc.frequency.value = freq;
      const t = ctx.currentTime + delay;
      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(0.4, t + 0.05);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.6);
      osc.start(t); osc.stop(t + 0.6);
    });
  } catch (e) { /* audio blocked */ }
}

export default function AdminLayout({ children }) {
  const { user, userData, loading, signOut } = useAuth();
  const router = useRouter();
  const seenPaymentRequests = useRef(new Set());

  useEffect(() => {
    if (!loading && !user) router.push('/admin/login');
  }, [user, loading, router]);

  // Listen for cash_requested orders and play sound
  useEffect(() => {
    if (!user || !userData?.restaurantId) return;
    const rid = userData.restaurantId;
    const q = query(collection(db, 'restaurants', rid, 'orders'), orderBy('createdAt', 'desc'));
    const unsub = onSnapshot(q, (snap) => {
      snap.docChanges().forEach(change => {
        const data = change.doc.data();
        const id = change.doc.id;
        const isPaymentRequest = ['cash_requested', 'card_requested', 'online_requested'].includes(data.paymentStatus);
        if (isPaymentRequest && !seenPaymentRequests.current.has(id)) {
          seenPaymentRequests.current.add(id);
          // Don't fire on initial load — only on new changes
          if (change.type === 'modified') {
            playPaymentBell();
            const methodLabel = data.paymentStatus === 'card_requested' ? 'card' : data.paymentStatus === 'online_requested' ? 'online' : 'cash';
            if ('Notification' in window && Notification.permission === 'granted') {
              new Notification('💰 Payment Requested', {
                body: `Table ${data.tableNumber || '?'} wants to pay by ${methodLabel}`,
                icon: '/favicon.ico',
              });
            }
          }
        }
      });
    }, () => { /* ignore errors */ });
    return () => unsub();
  }, [user, userData?.restaurantId]);

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
