import Link from 'next/link';
import { useRouter } from 'next/router';
import { useAuth } from '../../hooks/useAuth';
import { useEffect, useRef, useState, useCallback } from 'react';
import { db } from '../../lib/firebase';
import { collection, onSnapshot, query, orderBy } from 'firebase/firestore';
import { AdminDataProvider } from '../../contexts/AdminDataContext';
import { playOrderSound, playCallSound, playPaymentSound } from '../../lib/sounds';

const navSections = [
  {
    label: 'OVERVIEW', items: [
      { href: '/admin/analytics',     label: 'Analytics', icon: 'chart' },
      { href: '/admin/reports',       label: 'Reports',   icon: 'dollar' },
      { href: '/admin/day-close',     label: 'Day Close', icon: 'crown' },
      { href: '/admin/notifications', label: 'Activity',  icon: 'bell-ring' },
    ]
  },
  {
    label: 'OPERATIONS', items: [
      { href: '/admin/new-order', label: 'New Order', icon: 'plus' },
      { href: '/admin/orders',    label: 'Orders',    icon: 'clipboard' },
      { href: '/admin/kitchen',   label: 'Kitchen',   icon: 'chef' },
      { href: '/admin/waiter',    label: 'Waiter',    icon: 'bell' },
      { href: '/admin/payments',  label: 'Payments',  icon: 'card' },
    ]
  },
  {
    label: 'CATALOG', items: [
      { href: '/admin/items',      label: 'Menu Items',  icon: 'utensils' },
      { href: '/admin/requests',   label: 'Add Items',   icon: 'plus' },
      // Single Promotions entry replaces the old Combos / Offers / Coupons
      // trio. The /admin/promotions page hosts all 3 with inline drawers;
      // /admin/{combos,offers,coupons} redirect there for backwards compat.
      { href: '/admin/promotions', label: 'Promotions',  icon: 'tag' },
    ]
  },
  {
    label: 'PEOPLE', items: [
      { href: '/admin/staff',    label: 'Staff',    icon: 'users' },
      { href: '/admin/feedback', label: 'Feedback', icon: 'star' },
    ]
  },
  {
    label: 'SETUP', items: [
      { href: '/admin/qrcode',       label: 'QR & Tables',  icon: 'qr' },
      { href: '/admin/gateway',      label: 'Payment Gateway', icon: 'card' },
      { href: '/admin/settings',     label: 'Settings',     icon: 'gear' },
      { href: '/admin/subscription', label: 'Subscription', icon: 'crown' },
    ]
  },
];

// ── Inline Lucide-style SVG icon set. stroke uses currentColor so icons inherit text color. ──
const NavIcon = ({ name }) => {
  const props = { width: 18, height: 18, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.75, strokeLinecap: 'round', strokeLinejoin: 'round' };
  switch (name) {
    case 'chart':     return <svg {...props}><path d="M3 3v18h18" /><rect x="7" y="12" width="3" height="6" /><rect x="12" y="8" width="3" height="10" /><rect x="17" y="5" width="3" height="13" /></svg>;
    case 'dollar':    return <svg {...props}><circle cx="12" cy="12" r="10" /><path d="M12 6v12M15 9.5c0-1.38-1.34-2.5-3-2.5s-3 1.12-3 2.5 1.34 2.5 3 2.5 3 1.12 3 2.5-1.34 2.5-3 2.5-3-1.12-3-2.5" /></svg>;
    case 'clipboard': return <svg {...props}><rect x="8" y="2" width="8" height="4" rx="1" /><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" /><path d="M9 12h6M9 16h6" /></svg>;
    case 'chef':      return <svg {...props}><rect x="2" y="3" width="20" height="14" rx="2" /><path d="M8 21h8M12 17v4" /></svg>;
    case 'bell':      return <svg {...props}><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" /><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" /></svg>;
    case 'card':      return <svg {...props}><rect x="2" y="5" width="20" height="14" rx="2" /><path d="M2 10h20M6 15h2M11 15h2" /></svg>;
    case 'utensils':  return <svg {...props}><path d="M3 2v7a3 3 0 0 0 3 3h0a3 3 0 0 0 3-3V2M6 2v20M16 2v20M16 14c0-3 2-6 5-6v-4c-3 0-5 3-5 7" /></svg>;
    case 'puzzle':    return <svg {...props}><path d="M19.4 11.3a2 2 0 0 1 0-2.6 2 2 0 0 0-2.8-2.8 2 2 0 0 1-2.6 0 2 2 0 0 0-2.8 2.8 2 2 0 0 1 0 2.6v0a2 2 0 0 1-2.6 0 2 2 0 0 0-2.8 2.8 2 2 0 0 1 0 2.6 2 2 0 0 0 2.8 2.8 2 2 0 0 1 2.6 0 2 2 0 0 0 2.8-2.8 2 2 0 0 1 0-2.6 2 2 0 0 1 2.6 0 2 2 0 0 0 2.8-2.8Z" /></svg>;
    case 'tag':       return <svg {...props}><path d="M20.59 13.41 13.42 20.58a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82Z" /><circle cx="7" cy="7" r="1.5" fill="currentColor" stroke="none" /></svg>;
    case 'ticket':    return <svg {...props}><path d="M2 9a3 3 0 0 1 0 6v2a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-2a3 3 0 0 1 0-6V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2Z" /><path d="M13 5v2M13 17v2M13 11v2" /></svg>;
    case 'users':     return <svg {...props}><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" /></svg>;
    case 'star':      return <svg {...props}><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" /></svg>;
    case 'bell-ring': return <svg {...props}><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" /><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0M4 2C2.8 3.7 2 5.7 2 8M22 8c0-2.3-.8-4.3-2-6" /></svg>;
    case 'plus':      return <svg {...props}><circle cx="12" cy="12" r="10" /><path d="M12 8v8M8 12h8" /></svg>;
    case 'qr':        return <svg {...props}><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><path d="M14 14h3v3h-3zM20 14v3M14 20h3v1M21 20v1" /></svg>;
    case 'gear':      return <svg {...props}><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z" /></svg>;
    case 'crown':     return <svg {...props}><path d="M2 4l3 12h14l3-12-6 7-4-7-4 7-6-7z" /><path d="M5 20h14" /></svg>;
    default:          return <svg {...props}><circle cx="12" cy="12" r="3" /></svg>;
  }
};

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

  // ─── NAV SCROLL POSITION PRESERVATION ────────────────────────────────────
  // Each admin page wraps itself with <AdminLayout>, so the entire layout
  // (including this <nav>) unmounts and remounts on every route change.
  // That means the nav's internal scrollTop is reset to 0 each time the
  // user clicks a link. To preserve the user's scroll position across
  // navigations, we save it to sessionStorage on every scroll, and restore
  // it via a ref callback when the new <nav> element mounts.
  // sessionStorage is used (instead of a useRef/useState) precisely because
  // it survives the unmount/remount cycle that destroys all React state.
  const NAV_SCROLL_KEY = 'ar_admin_nav_scroll';
  const navRef = useCallback((el) => {
    if (!el) return;
    // Restore scroll position synchronously the moment the element mounts.
    // Using direct .scrollTop= (not scrollTo with smooth) so it snaps
    // instantly with no visible animation.
    try {
      const saved = sessionStorage.getItem(NAV_SCROLL_KEY);
      if (saved !== null) el.scrollTop = parseInt(saved, 10) || 0;
    } catch {}
    // Track future scrolls and persist them to sessionStorage.
    el.addEventListener('scroll', () => {
      try { sessionStorage.setItem(NAV_SCROLL_KEY, String(el.scrollTop)); } catch {}
    }, { passive: true });
  }, []);

  // ─── SHARED REAL-TIME DATA ────────────────────────────────────────────────
  const [allOrders, setAllOrders] = useState([]);
  const [allWaiterCalls, setAllWaiterCalls] = useState([]);
  const [ordersLoaded, setOrdersLoaded] = useState(false);
  const [callsLoaded, setCallsLoaded] = useState(false);

  // ─── GLOBAL SOUND + NOTIFICATION SYSTEM ──────────────────────────────────
  // This layout wraps every admin page, so its sound + browser-notification
  // listeners act as a CROSS-PAGE catchall: admin can be on /admin/menu-items
  // and still get a chime + OS notification when an order arrives.
  //
  // The page-specific listeners (kitchen.js / waiter.js / payments.js)
  // play THE SAME synthesized chime via lib/sounds, with a 250ms debounce
  // in lib/sounds itself so the cross-page + page-specific listeners
  // firing in the same tick collapse to a single sound.
  const prevCallRef = useRef(0);
  const prevOrderRef = useRef(0);
  const notifGranted = useRef(false);
  const seenPaymentRequests = useRef(new Set());

  useEffect(() => {
    if (typeof window === 'undefined' || !('Notification' in window)) return;
    if (Notification.permission === 'granted') {
      notifGranted.current = true;
    } else if (Notification.permission !== 'denied') {
      Notification.requestPermission().then(p => { notifGranted.current = p === 'granted'; });
    }
  }, []);

  const soundAllowed = () => localStorage.getItem('ar_sound_enabled') !== 'false';

  // Wraps lib/sounds calls behind the global mute toggle. The lib's
  // own debounce handles cross-page double-fires.
  const playForCall    = () => { if (soundAllowed()) playCallSound(); };
  const playForOrder   = () => { if (soundAllowed()) playOrderSound(); };
  const playForPayment = () => { if (soundAllowed()) playPaymentSound(); };

  const showOsNotif = (title, body) => {
    if (!notifGranted.current) return;
    try {
      const n = new Notification(title, { body, icon: '/favicon.ico', tag: 'ar-alert' });
      setTimeout(() => n.close(), 8000);
      n.onclick = () => { window.focus(); n.close(); };
    } catch { }
  };

  useEffect(() => {
    if (!rid) { setCallsLoaded(true); return; }
    const q = query(collection(db, 'restaurants', rid, 'waiterCalls'), orderBy('createdAt', 'desc'));
    return onSnapshot(q, snap => {
      const docs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      const pending = docs.filter(d => d.status === 'pending').length;
      if (prevCallRef.current > 0 && pending > prevCallRef.current) {
        playForCall();
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
        playForOrder();
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
          playForPayment();
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
    // Bootstrap loading state — colors inlined to match Aspire palette, so the
    // spinner doesn't flash in the old Forest colors before the page renders.
    // (T.cream/T.accent from lib/utils were the old Cinematic Forest tokens.)
    <div style={{ minHeight: '100vh', background: '#EDEDED', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ width: 36, height: 36, border: `3px solid #C4A86D`, borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );

  const isActive = (href) => href === '/admin' ? router.pathname === '/admin' : router.pathname.startsWith(href);

  // ── Aspire palette (scoped to the admin chrome only — doesn't affect T) ──
  const INTER = "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
  const A_BG = '#FFFFFF';               // sidebar bg
  const A_PAGE = '#EDEDED';             // page bg behind cards
  const A_INK = '#1A1A1A';              // primary text
  const A_MUTED = 'rgba(0,0,0,0.55)';   // nav default text
  const A_FAINT = 'rgba(0,0,0,0.38)';   // section labels
  const A_HOVER = 'rgba(0,0,0,0.04)';   // nav hover bg
  const A_BORDER = 'rgba(0,0,0,0.06)';  // subtle separators
  const A_GOLD = '#C4A86D';             // active pill + brand italic
  const A_GOLD_DARK = '#A08656';        // darker gold for on-pill icon if needed

  return (
    <div style={{ minHeight: '100vh', background: A_PAGE, fontFamily: INTER, color: A_INK, display: 'flex', position: 'relative' }}>
      <style>{`
        @keyframes spin{to{transform:rotate(360deg)}}
        .nlnk{
          display:flex;align-items:center;gap:12px;padding:10px 14px;border-radius:8px;
          font-family:${INTER};
          font-size:13.5px;font-weight:500;text-decoration:none;
          color:${A_MUTED};transition:background 0.15s, color 0.15s;margin-bottom:2px;
          letter-spacing:-0.1px;
        }
        .nlnk:hover{background:${A_HOVER};color:${A_INK};}
        .nlnk .nav-icon{
          flex-shrink:0;opacity:0.75;transition:opacity 0.15s;
          display:inline-flex;align-items:center;justify-content:center;
        }
        .nlnk:hover .nav-icon{opacity:1;}
        .nlnk.on{
          background:${A_GOLD};
          color:#FFFFFF;font-weight:600;
        }
        .nlnk.on .nav-icon{opacity:1;}
        .admin-sidebar{
          transition:transform 0.25s cubic-bezier(.4,0,.2,1);
        }
        .admin-sidebar nav::-webkit-scrollbar{width:3px;}
        .admin-sidebar nav::-webkit-scrollbar-track{background:transparent;}
        .admin-sidebar nav::-webkit-scrollbar-thumb{background:rgba(0,0,0,0.08);border-radius:3px;}
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
            background:${A_BG};
            border-bottom:1px solid ${A_BORDER};
          }
          .admin-backdrop{
            display:block;position:fixed;inset:0;z-index:19;
            background:rgba(0,0,0,0.35);
            backdrop-filter:blur(4px);
            -webkit-tap-highlight-color:transparent;
          }
          .admin-main{padding-top:56px !important;}
        }
      `}</style>

      {/* Mobile top bar */}
      <div className="admin-mobile-topbar">
        <button onClick={() => setSidebarOpen(o => !o)}
          style={{ background: 'none', border: 'none', color: A_INK, fontSize: 20, cursor: 'pointer', padding: '4px 6px', lineHeight: 1 }}
          aria-label="Toggle menu">
          ☰
        </button>
        <div style={{ fontFamily: INTER, fontWeight: 600, fontSize: 17, color: A_INK, letterSpacing: '-0.3px' }}>
          Advert <span style={{ color: A_GOLD, fontStyle: 'italic', fontWeight: 500 }}>Radical</span>
        </div>
      </div>

      {/* Backdrop */}
      {isMobile && sidebarOpen && (
        <div className="admin-backdrop" onClick={closeSidebar} />
      )}

      {/* Sidebar — Aspire white */}
      <aside className={`admin-sidebar${sidebarOpen ? ' open' : ''}`} style={{
        width: 240, flexShrink: 0,
        background: A_BG,
        display: 'flex', flexDirection: 'column',
        position: 'fixed', inset: '0 auto 0 0', zIndex: 20,
        borderRight: `1px solid ${A_BORDER}`,
      }}>
        {/* Brand */}
        <div style={{ padding: '24px 22px 20px' }}>
          <Link href="/" style={{ textDecoration: 'none' }}>
            <div style={{ fontFamily: INTER, fontWeight: 600, fontSize: 20, color: A_INK, letterSpacing: '-0.4px', lineHeight: 1.1 }}>
              Advert <span style={{ color: A_GOLD, fontStyle: 'italic', fontWeight: 500 }}>Radical</span>
            </div>
          </Link>
          <div style={{ fontFamily: INTER, fontSize: 9, color: A_FAINT, marginTop: 6, fontWeight: 600, letterSpacing: '2.5px', textTransform: 'uppercase' }}>
            Restaurant Portal
          </div>
        </div>

        {/* Nav */}
        <nav ref={navRef} style={{ flex: 1, padding: '4px 12px 12px', overflowY: 'auto' }}>
          {navSections.map((section) => (
            <div key={section.label} style={{ marginBottom: 14 }}>
              <div style={{ fontFamily: INTER, fontSize: 10, fontWeight: 600, letterSpacing: '0.12em', color: A_FAINT, padding: '6px 14px 8px', textTransform: 'uppercase' }}>
                {section.label}
              </div>
              {section.items.map(item => (
                <Link key={item.href} href={item.href}
                  className={`nlnk${isActive(item.href) ? ' on' : ''}`}
                  onClick={isMobile ? closeSidebar : undefined}>
                  <span className="nav-icon"><NavIcon name={item.icon} /></span>
                  {item.label}
                </Link>
              ))}
            </div>
          ))}
        </nav>

        {/* User card */}
        <div style={{ padding: '12px 12px 18px', borderTop: `1px solid ${A_BORDER}` }}>
          <div style={{
            padding: '12px 14px', marginBottom: 6,
            background: A_HOVER,
            borderRadius: 10,
          }}>
            <div style={{ fontFamily: INTER, fontSize: 13, fontWeight: 600, color: A_INK, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', letterSpacing: '-0.1px' }}>
              {userData?.restaurantName || userData?.email || user.email}
            </div>
            <div style={{ fontFamily: INTER, fontSize: 11, color: A_MUTED, marginTop: 3, fontWeight: 500 }}>Restaurant Admin</div>
          </div>
          <button onClick={signOut}
            style={{ width: '100%', padding: '9px 14px', borderRadius: 8, border: 'none', background: 'transparent', fontSize: 12, fontFamily: INTER, color: A_MUTED, cursor: 'pointer', textAlign: 'left', transition: 'all 0.15s', fontWeight: 500 }}
            onMouseOver={e => { e.currentTarget.style.background = A_HOVER; e.currentTarget.style.color = A_INK; }}
            onMouseOut={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = A_MUTED; }}>
            Sign out →
          </button>
        </div>
      </aside>

      <AdminDataProvider value={{ orders: allOrders, waiterCalls: allWaiterCalls, ordersLoaded, callsLoaded }}>
        <main className="admin-main" style={{ flex: 1, marginLeft: 240, minHeight: '100vh', overflowY: 'auto' }}>
          {children}
        </main>
      </AdminDataProvider>
    </div>
  );
}
