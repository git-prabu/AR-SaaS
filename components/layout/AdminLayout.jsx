import Link from 'next/link';
import { useRouter } from 'next/router';
import { useAuth } from '../../hooks/useAuth';
import { useEffect, useRef, useState, useCallback } from 'react';
import { db } from '../../lib/firebase';
import { collection, onSnapshot, query, orderBy } from 'firebase/firestore';
import { AdminDataProvider } from '../../contexts/AdminDataContext';
import { T } from '../../lib/utils';

const navSections = [
  { label: 'OVERVIEW', items: [
    { href: '/admin/analytics', label: 'Analytics', icon: '📊' },
    { href: '/admin/reports', label: 'Revenue Reports', icon: '💰' },
  ]},
  { label: 'OPERATIONS', items: [
    { href: '/admin/orders', label: 'Orders', icon: '📋' },
    { href: '/admin/kitchen', label: 'Kitchen (KDS)', icon: '👨‍🍳' },
    { href: '/admin/waiter', label: 'Waiter', icon: '🛎️' },
    { href: '/admin/payments', label: 'Payments', icon: '💳' },
  ]},
  { label: 'MENU', items: [
    { href: '/admin/items', label: 'Menu Items', icon: '🍽️' },
    { href: '/admin/combos', label: 'Combo Builder', icon: '🧩' },
    { href: '/admin/offers', label: 'Offers', icon: '🏷️' },
    { href: '/admin/coupons', label: 'Coupons', icon: '🎟️' },
  ]},
  { label: 'PEOPLE', items: [
    { href: '/admin/staff', label: 'Staff Logins', icon: '👥' },
    { href: '/admin/feedback', label: 'Customer Feedback', icon: '⭐' },
    { href: '/admin/notifications', label: 'Notification', icon: '🔔' },
  ]},
  { label: 'SETUP', items: [
    { href: '/admin/requests', label: 'Add Items/Requests', icon: '➕' },
    { href: '/admin/qrcode', label: 'QR Code', icon: '📱' },
    { href: '/admin/settings', label: 'Settings', icon: '⚙️' },
    { href: '/admin/subscription', label: 'Subscription', icon: '👑' },
  ]},
];

export default function AdminLayout({ children }) {
  const { user, userData, loading, signOut } = useAuth();
  const router = useRouter();
  const rid = userData?.restaurantId;

  // ─── RESPONSIVE SIDEBAR STATE ────────────────────────────────────────────
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  useEffect(() => {
    if (isMobile) setSidebarOpen(false);
  }, [router.pathname, isMobile]);

  const closeSidebar = useCallback(() => setSidebarOpen(false), []);

  // ─── SHARED REAL-TIME DATA ────────────────────────────────────────────────
  const [allOrders, setAllOrders] = useState([]);
  const [allWaiterCalls, setAllWaiterCalls] = useState([]);
  const [ordersLoaded, setOrdersLoaded] = useState(false);
  const [callsLoaded, setCallsLoaded] = useState(false);

  // ─── GLOBAL SOUND + NOTIFICATION SYSTEM ──────────────────────────────────
  const prevCallRef   = useRef(0);
  const prevOrderRef  = useRef(0);
  const notifGranted  = useRef(false);
  const seenPaymentRequests = useRef(new Set());
  const audioCtxRef   = useRef(null);

  useEffect(() => {
    if (typeof window === 'undefined' || !('Notification' in window)) return;
    if (Notification.permission === 'granted') {
      notifGranted.current = true;
    } else if (Notification.permission !== 'denied') {
      Notification.requestPermission().then(p => { notifGranted.current = p === 'granted'; });
    }
  }, []);

  const soundAllowed = () => localStorage.getItem('ar_sound_enabled') !== 'false';

  const playBell = async () => {
    if (!soundAllowed()) return;
    try {
      if (!audioCtxRef.current) audioCtxRef.current = new (window.AudioContext || window.webkitAudioContext)();
      const ctx = audioCtxRef.current;
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

  const playAlert = () => {
    if (!soundAllowed()) return;
    try { new Audio('/notification.mp3').play().catch(() => {}); } catch {}
  };

  const showOsNotif = (title, body) => {
    if (!notifGranted.current) return;
    try {
      const n = new Notification(title, { body, icon: '/favicon.ico', tag: 'ar-alert' });
      setTimeout(() => n.close(), 8000);
      n.onclick = () => { window.focus(); n.close(); };
    } catch {}
  };

  useEffect(() => {
    if (!rid) { setCallsLoaded(true); return; }
    const q = query(collection(db, 'restaurants', rid, 'waiterCalls'), orderBy('createdAt', 'desc'));
    return onSnapshot(q, snap => {
      const docs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      const pending = docs.filter(d => d.status === 'pending').length;
      if (prevCallRef.current > 0 && pending > prevCallRef.current) {
        playBell();
        showOsNotif('New Waiter Call', 'A customer needs help');
      }
      prevCallRef.current = pending;
      setAllWaiterCalls(docs);
      setCallsLoaded(true);
    }, err => {
      console.error('waiterCalls listener error:', err);
      setCallsLoaded(true);
    });
  }, [rid]);

  useEffect(() => {
    if (!rid) { setOrdersLoaded(true); return; }
    const q = query(collection(db, 'restaurants', rid, 'orders'), orderBy('createdAt', 'desc'));
    return onSnapshot(q, snap => {
      const docs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      const pending = docs.filter(d => d.status === 'pending').length;
      if (prevOrderRef.current > 0 && pending > prevOrderRef.current) {
        playAlert();
        showOsNotif('New Order', 'A new order has arrived');
      }
      prevOrderRef.current = pending;
      setAllOrders(docs);
      setOrdersLoaded(true);

      snap.docChanges().forEach(change => {
        if (change.type !== 'modified') return;
        const data = change.doc.data();
        const id = change.doc.id;
        const isPaymentRequest = ['cash_requested', 'card_requested', 'online_requested'].includes(data.paymentStatus);
        if (isPaymentRequest && !seenPaymentRequests.current.has(id)) {
          seenPaymentRequests.current.add(id);
          const methodLabel = data.paymentStatus === 'card_requested' ? 'card' : data.paymentStatus === 'online_requested' ? 'online' : 'cash';
          playBell();
          showOsNotif('Payment Requested', `Table ${data.tableNumber || '?'} wants to pay by ${methodLabel}`);
        }
      });
    }, err => {
      console.error('orders listener error:', err);
      setOrdersLoaded(true);
    });
  }, [rid]);

  useEffect(() => {
    if (!loading && !user) router.push('/admin/login');
  }, [user, loading, router]);

  if (loading || !user) return (
    <div style={{ minHeight: '100vh', background: T.cream, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ width: 36, height: 36, border: `3px solid ${T.accent}`, borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );

  const isActive = (href) => href === '/admin' ? router.pathname === '/admin' : router.pathname.startsWith(href);

  return (
    <div style={{ minHeight: '100vh', background: T.cream, fontFamily: T.font, color: T.ink, display: 'flex', position: 'relative' }}>
      <style>{`
        @keyframes spin{to{transform:rotate(360deg)}}
        .nlnk{
          display:flex;align-items:center;gap:10px;padding:10px 18px;border-radius:10px;
          font-size:13.5px;font-weight:500;text-decoration:none;
          color:${T.shellMuted};transition:all 0.18s;margin-bottom:1px;
          letter-spacing:-0.15px;
        }
        .nlnk:hover{background:rgba(234,231,227,0.08);color:${T.shellText};}
        .nlnk .nav-icon{
          font-size:14px;flex-shrink:0;opacity:0.5;transition:all 0.2s;
          width:20px;text-align:center;
          filter:grayscale(1) brightness(1.8);
        }
        .nlnk:hover .nav-icon{opacity:0.8;}
        .nlnk.on{
          background:rgba(196,168,109,0.18);
          color:#C4A86D;font-weight:600;
        }
        .nlnk.on .nav-icon{
          opacity:1;filter:grayscale(1) brightness(2.2);
        }
        .admin-sidebar{
          transition:transform 0.25s cubic-bezier(.4,0,.2,1);
        }
        .admin-sidebar nav::-webkit-scrollbar{width:3px;}
        .admin-sidebar nav::-webkit-scrollbar-track{background:transparent;}
        .admin-sidebar nav::-webkit-scrollbar-thumb{background:rgba(234,231,227,0.1);border-radius:3px;}
        .admin-mobile-topbar{display:none;}
        .admin-backdrop{display:none;}
        @media(max-width:767px){
          .admin-sidebar{transform:translateX(-100%);}
          .admin-sidebar.open{transform:translateX(0);}
          .admin-main{margin-left:0 !important;}
          .admin-mobile-topbar{
            display:flex;align-items:center;gap:12px;
            position:fixed;top:0;left:0;right:0;z-index:18;
            height:56px;padding:0 16px;
            background:${T.shell};
            box-shadow:0 2px 16px rgba(38,52,49,0.2);
          }
          .admin-backdrop{
            display:block;position:fixed;inset:0;z-index:19;
            background:rgba(38,52,49,0.35);
            backdrop-filter:blur(4px);
            -webkit-tap-highlight-color:transparent;
          }
          .admin-main{padding-top:56px !important;}
        }
      `}</style>

      {/* Mobile top bar */}
      <div className="admin-mobile-topbar">
        <button onClick={() => setSidebarOpen(o => !o)}
          style={{ background: 'none', border: 'none', color: T.shellText, fontSize: 20, cursor: 'pointer', padding: '4px 6px', lineHeight: 1 }}
          aria-label="Toggle menu">
          ☰
        </button>
        <div style={{ fontFamily: T.fontDisplay, fontWeight: 700, fontSize: 18, color: T.shellText, letterSpacing: '-0.2px' }}>
          Advert <span style={{ color: '#C4A86D', fontStyle: 'italic' }}>Radical</span>
        </div>
      </div>

      {/* Backdrop */}
      {isMobile && sidebarOpen && (
        <div className="admin-backdrop" onClick={closeSidebar} />
      )}

      {/* Sidebar — dark navy */}
      <aside className={`admin-sidebar${sidebarOpen ? ' open' : ''}`} style={{
        width: 250, flexShrink: 0,
        background: `linear-gradient(180deg, ${T.shell} 0%, ${T.shellDarker} 100%)`,
        display: 'flex', flexDirection: 'column',
        position: 'fixed', inset: '0 auto 0 0', zIndex: 20,
        boxShadow: '3px 0 24px rgba(38,52,49,0.15)',
      }}>
        {/* Top accent — frost red to fade */}
        <div style={{ height: 3, background: `linear-gradient(90deg, ${T.accent}, ${T.sand}, transparent)` }} />

        {/* Brand */}
        <div style={{ padding: '28px 22px 24px', borderBottom: '1px solid rgba(234,231,227,0.1)' }}>
          <Link href="/" style={{ textDecoration: 'none' }}>
            <div style={{ fontFamily: T.fontDisplay, fontWeight: 700, fontSize: 22, color: T.shellText, letterSpacing: '-0.3px' }}>
              Advert <span style={{ color: '#C4A86D', fontStyle: 'italic' }}>Radical</span>
            </div>
          </Link>
          <div style={{ fontSize: 9, color: 'rgba(196,168,109,0.6)', marginTop: 6, fontWeight: 600, letterSpacing: '3px', textTransform: 'uppercase' }}>
            Restaurant Portal
          </div>
        </div>

        {/* Nav */}
        <nav style={{ flex: 1, padding: '10px 12px', overflowY: 'auto' }}>
          {navSections.map((section, si) => (
            <div key={section.label} style={{ marginBottom: 4 }}>
              {si > 0 && <div style={{ height: 1, background: 'rgba(234,231,227,0.08)', margin: '6px 18px 8px' }} />}
              <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.15em', color: 'rgba(234,231,227,0.25)', padding: '6px 18px 4px', textTransform: 'uppercase' }}>
                {section.label}
              </div>
              {section.items.map(item => (
                <Link key={item.href} href={item.href}
                  className={`nlnk${isActive(item.href) ? ' on' : ''}`}
                  onClick={isMobile ? closeSidebar : undefined}>
                  <span className="nav-icon">{item.icon}</span>
                  {item.label}
                </Link>
              ))}
            </div>
          ))}
        </nav>

        {/* User card */}
        <div style={{ padding: '12px 12px 18px', borderTop: '1px solid rgba(234,231,227,0.1)' }}>
          <div style={{
            padding: '14px 16px', marginBottom: 8,
            background: 'rgba(234,231,227,0.08)',
            borderRadius: 12,
            border: '1px solid rgba(234,231,227,0.06)',
          }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: T.shellText, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {userData?.restaurantName || userData?.email || user.email}
            </div>
            <div style={{ fontSize: 10, color: T.stone, marginTop: 4, fontWeight: 500 }}>Restaurant Admin</div>
          </div>
          <button onClick={signOut}
            style={{ width: '100%', padding: '10px 16px', borderRadius: T.radiusBtn, border: 'none', background: 'transparent', fontSize: 12, fontFamily: T.font, color: T.shellMuted, cursor: 'pointer', textAlign: 'left', transition: 'all 0.2s', fontWeight: 500 }}
            onMouseOver={e => { e.currentTarget.style.background = 'rgba(234,231,227,0.06)'; e.currentTarget.style.color = T.shellText; }}
            onMouseOut={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = T.shellMuted; }}>
            Sign out →
          </button>
        </div>
      </aside>

      <AdminDataProvider value={{ orders: allOrders, waiterCalls: allWaiterCalls, ordersLoaded, callsLoaded }}>
        <main className="admin-main" style={{ flex: 1, marginLeft: 250, minHeight: '100vh', overflowY: 'auto' }}>
          {children}
        </main>
      </AdminDataProvider>
    </div>
  );
}
