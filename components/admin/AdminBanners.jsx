// components/admin/AdminBanners.jsx
//
// The top-of-page reminder strips (subscription grace + verify-email) that the
// old AdminLayout renders. The redesigned "-v2" pages use OkShell instead of
// AdminLayout, so this self-contained component brings the same two banners to
// them. It fetches its own data (restaurant doc for the subscription window;
// EmailVerifyBanner reads the auth user itself), so pages just drop it in.
import { useEffect, useState, useMemo } from 'react';
import Link from 'next/link';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { useAuth } from '../../hooks/useAuth';
import { getSubscriptionStatus } from '../../lib/subscription';
import EmailVerifyBanner from '../EmailVerifyBanner';

function SubscriptionGraceBanner() {
  const { userData } = useAuth();
  const rid = userData?.restaurantId;
  const [restaurantDoc, setRestaurantDoc] = useState(null);

  useEffect(() => {
    if (!rid) { setRestaurantDoc(null); return; }
    const unsub = onSnapshot(
      doc(db, 'restaurants', rid),
      (snap) => { if (snap.exists()) setRestaurantDoc(snap.data()); },
      () => { /* ignore — banner just stays hidden */ },
    );
    return unsub;
  }, [rid]);

  const status = useMemo(() => getSubscriptionStatus(restaurantDoc), [restaurantDoc]);
  if (!status || status.state !== 'grace') return null;

  return (
    <div className="no-print" style={{
      width: '100%',
      background: 'linear-gradient(135deg, #C4A86D 0%, #A08656 100%)',
      color: '#FFFFFF', padding: '11px 28px',
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      gap: 14, flexWrap: 'wrap',
      fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    }}>
      <div style={{ fontSize: 13, fontWeight: 600, lineHeight: 1.45 }}>
        ⚠ Subscription expired. You’re in a {status.daysLeft}-day grace period — renew now to avoid losing access.
      </div>
      <Link href="/admin/subscription-v2" style={{
        padding: '7px 16px', borderRadius: 8, background: '#FFFFFF', color: '#1A1A1A',
        fontWeight: 700, fontSize: 12, textDecoration: 'none', whiteSpace: 'nowrap',
      }}>Renew now →</Link>
    </div>
  );
}

export default function AdminBanners() {
  return (
    <div style={{ flexShrink: 0 }}>
      <SubscriptionGraceBanner />
      <EmailVerifyBanner />
    </div>
  );
}
