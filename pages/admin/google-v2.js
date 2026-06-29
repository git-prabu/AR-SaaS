// pages/admin/google-v2.js
//
// ★ REDESIGN EXEMPLAR ★ — duplicate of /admin/google on the dark "ok-root"
// theme (via <OkShell>). Owner-only. Logic copied verbatim from google.js —
// only the render is new. Original untouched.
import Head from 'next/head';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useAuth } from '../../hooks/useAuth';
import OkShell from '../../components/admin/OkShell';
import { getRestaurantById } from '../../lib/db';
import toast from 'react-hot-toast';

const GOOGLE = '#6E8EAF';

function LinkRow({ url, onCopy }) {
  const copy = () => {
    if (!url) return;
    try { navigator.clipboard.writeText(url); toast.success('Link copied!'); onCopy && onCopy(); }
    catch { toast.error('Could not copy — long-press to copy manually.'); }
  };
  return (
    <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
      <div style={{ flex: '1 1 240px', minWidth: 0, padding: '10px 13px', background: 'var(--card-2)', border: '1px dashed var(--line)', borderRadius: 10, fontFamily: 'var(--font-mono)', fontSize: 12.5, color: 'var(--tx-2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{url || '—'}</div>
      <button onClick={copy} disabled={!url} style={{ padding: '0 16px', height: 38, borderRadius: 10, border: 'none', background: 'var(--accent)', color: 'var(--accent-ink)', fontFamily: 'var(--font-display)', fontSize: 12, fontWeight: 700, cursor: url ? 'pointer' : 'not-allowed', opacity: url ? 1 : 0.4 }}>Copy</button>
      <a href={url || '#'} target="_blank" rel="noopener noreferrer" style={{ padding: '0 16px', height: 38, display: 'inline-flex', alignItems: 'center', borderRadius: 10, border: '1px solid var(--line)', background: 'var(--card)', color: 'var(--tx)', fontFamily: 'var(--font-display)', fontSize: 12, fontWeight: 700, textDecoration: 'none', pointerEvents: url ? 'auto' : 'none', opacity: url ? 1 : 0.4 }}>Open</a>
    </div>
  );
}

function Steps({ items }) {
  return (
    <ol style={{ margin: '14px 0 0', padding: '0 0 0 2px', listStyle: 'none' }}>
      {items.map((t, i) => (
        <li key={i} style={{ display: 'flex', gap: 10, marginBottom: 9, alignItems: 'flex-start' }}>
          <span style={{ flexShrink: 0, width: 20, height: 20, borderRadius: '50%', background: 'rgba(196,168,109,0.15)', color: 'var(--gold)', fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 800, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginTop: 1 }}>{i + 1}</span>
          <span style={{ fontFamily: 'var(--font-body)', fontSize: 12.5, color: 'var(--tx-3)', lineHeight: 1.5 }}>{t}</span>
        </li>
      ))}
    </ol>
  );
}

function Card({ emoji, title, desc, badge, children }) {
  return (
    <div style={{ background: 'var(--card)', borderRadius: 16, border: '1px solid var(--line)', padding: '20px 22px' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
        <div style={{ fontSize: 26, lineHeight: 1, flexShrink: 0 }}>{emoji}</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ fontFamily: 'var(--font-display)', fontSize: 16, fontWeight: 700, color: 'var(--tx)' }}>{title}</span>
            {badge}
          </div>
          <div style={{ fontFamily: 'var(--font-body)', fontSize: 12.5, color: 'var(--tx-3)', marginTop: 4, lineHeight: 1.5 }}>{desc}</div>
        </div>
      </div>
      {children}
    </div>
  );
}

export default function ConnectGoogleV2() {
  const { userData } = useAuth();
  const rid = userData?.restaurantId;
  const restaurantName = userData?.restaurantName || 'Your Restaurant';

  const [loading, setLoading] = useState(true);
  const [restaurant, setRestaurant] = useState(null);

  useEffect(() => {
    if (!rid) return;
    getRestaurantById(rid).then(r => { setRestaurant(r || null); setLoading(false); }).catch(() => setLoading(false));
  }, [rid]);

  const base = (process.env.NEXT_PUBLIC_SITE_URL || 'https://halohelm.com').replace(/\/+$/, '');
  const subdomain = restaurant?.subdomain || '';
  const placeId = (restaurant?.googlePlaceId || '').trim();
  const name = restaurant?.name || userData?.restaurantName || 'your restaurant';

  const menuUrl = subdomain ? `${base}/menu/${subdomain}` : '';
  const bookUrl = subdomain ? `${base}/book/${subdomain}` : '';
  const reviewUrl = placeId ? `https://search.google.com/local/writereview?placeid=${encodeURIComponent(placeId)}` : '';

  const pill = (text, ok) => (
    <span style={{ padding: '2px 9px', borderRadius: 999, fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 700, letterSpacing: '.03em', textTransform: 'uppercase', background: ok ? 'rgba(63,170,99,0.12)' : 'var(--card-3)', color: ok ? 'var(--success)' : 'var(--tx-3)', border: `1px solid ${ok ? 'rgba(63,170,99,0.30)' : 'var(--line)'}` }}>{text}</span>
  );

  return (
    <>
      <Head><title>Connect to Google — HaloHelm</title></Head>
      <OkShell active={null} eyebrow="Setup · Google Business Profile" title="Connect to Google" brand={restaurantName}>
        <p style={{ fontFamily: 'var(--font-body)', fontSize: 13, color: 'var(--tx-2)', margin: '0 0 20px', maxWidth: 620, lineHeight: 1.5 }}>
          Put your menu, table booking, and reviews on your Google Business Profile so diners find everything straight from Google Search and Maps.
        </p>

        {loading ? (
          <div style={{ background: 'var(--card)', borderRadius: 16, border: '1px solid var(--line)', padding: 48, textAlign: 'center' }}>
            <div style={{ width: 30, height: 30, border: '3px solid var(--gold)', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto 12px' }} />
            <div style={{ fontFamily: 'var(--font-body)', fontSize: 13, color: 'var(--tx-3)' }}>Loading…</div>
            <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
          </div>
        ) : !subdomain ? (
          <div style={{ background: 'var(--card)', borderRadius: 16, border: '1px solid var(--line)', padding: 36, textAlign: 'center', fontFamily: 'var(--font-body)', fontSize: 13, color: 'var(--tx-3)' }}>
            We couldn’t load your restaurant link yet. Please refresh, or set it up in <Link href="/admin/business-info" style={{ color: 'var(--gold)', fontWeight: 700 }}>Business Info</Link>.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14, maxWidth: 720 }}>
            <Card emoji="🍽️" title="Menu on Google" desc="A clean, photo-rich menu Google can read — your dishes with AR previews, and no ordering or call-waiter buttons. Perfect for the “Menu” link on your listing.">
              <LinkRow url={menuUrl} />
              <Steps items={['Search your restaurant on Google, then tap “Edit profile”.', 'Open the “Menu” field (sometimes under “Food & drink”).', 'Paste this link and save.']} />
            </Card>

            <Card emoji="📅" title="Reservations on Google" desc="A one-tap “Book a table” form diners can reach from your Google listing. Bookings land in your Reservations page.">
              <LinkRow url={bookUrl} />
              <Steps items={['In your Google Business Profile, open “Bookings” (or add it as your reservations link).', 'Paste this link and save.', 'A built-in “Reserve a table” button inside Google needs a Google-approved booking partner — this link gives diners a direct path to your form today.']} />
            </Card>

            <Card emoji="⭐" title="Google Reviews" badge={pill(placeId ? 'Connected' : 'Not set up', !!placeId)}
              desc={placeId ? `Diners who finish the in-app rating now see a “Leave a Google review” button that opens this link for ${name}.` : 'Add your Google Place ID to switch on the “Leave a Google review” button that appears after a diner rates their visit.'}>
              {placeId ? (
                <>
                  <LinkRow url={reviewUrl} />
                  <Steps items={['This is already live on your customer feedback prompt — happy diners can post a Google review in one tap.', 'Share the same link in receipts, WhatsApp, or a table card to collect even more reviews.']} />
                </>
              ) : (
                <div style={{ marginTop: 14 }}>
                  <Link href="/admin/business-info" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '10px 16px', borderRadius: 10, background: GOOGLE, color: '#fff', fontFamily: 'var(--font-display)', fontSize: 13, fontWeight: 700, textDecoration: 'none' }}>Add Google Place ID in Business Info →</Link>
                  <div style={{ fontFamily: 'var(--font-body)', fontSize: 11.5, color: 'var(--tx-3)', marginTop: 10, lineHeight: 1.5 }}>
                    Find yours with Google’s free <strong style={{ color: 'var(--tx-2)' }}>Place ID Finder</strong> (search “Google Place ID Finder”), then paste it into <strong style={{ color: 'var(--tx-2)' }}>Business Info → Restaurant Profile</strong>.
                  </div>
                </div>
              )}
            </Card>

            <div style={{ fontFamily: 'var(--font-body)', fontSize: 11.5, color: 'var(--tx-3)', textAlign: 'center', marginTop: 4, lineHeight: 1.5 }}>
              These are public, read-only links — safe to share anywhere. They always reflect your latest menu and details.
            </div>
          </div>
        )}
      </OkShell>
    </>
  );
}

ConnectGoogleV2.getLayout = (page) => page;
