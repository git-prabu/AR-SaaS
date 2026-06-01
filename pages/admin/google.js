// pages/admin/google.js
//
// Phase 9 (Google integration) — "Connect to Google" hub. Owner-only
// (rendered inside AdminLayout, like Settings). It does NOT change any data
// except by linking out to Settings for the Place ID; it just surfaces the
// three public links an owner pastes into their Google Business Profile:
//   1. Menu        → /menu/{subdomain}   (static, crawlable menu page)
//   2. Reservations→ /book/{subdomain}   (public "Book a table" form)
//   3. Reviews     → search.google.com/local/writereview?placeid=…  (needs
//      the Google Place ID set in Settings → Restaurant Profile)
//
// "Quick path" reservation per the owner's choice: a one-tap link-out to the
// booking form, NOT the full Reserve-with-Google partner program.
import Head from 'next/head';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useAuth } from '../../hooks/useAuth';
import AdminLayout from '../../components/layout/AdminLayout';
import { getRestaurantById } from '../../lib/db';
import toast from 'react-hot-toast';

const INTER = "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
const A = {
  font: INTER,
  cream: '#EDEDED', ink: '#1A1A1A', shell: '#FFFFFF',
  warning: '#C4A86D', warningDim: '#A08656',
  forest: '#1A1A1A', forestDarker: '#2A2A2A',
  success: '#3F9E5A',
  google: '#4285F4',
  mutedText: 'rgba(0,0,0,0.55)', faintText: 'rgba(0,0,0,0.38)',
  border: '1px solid rgba(0,0,0,0.06)',
  cardShadow: '0 1px 2px rgba(0,0,0,0.04), 0 4px 12px rgba(0,0,0,0.04)',
};

const labelStyle = {
  display: 'block', fontSize: 11, fontWeight: 700,
  color: 'rgba(0,0,0,0.55)', letterSpacing: '0.05em',
  textTransform: 'uppercase', marginBottom: 6,
};

// A read-only link box + Copy + Open. `mono` keeps long URLs legible.
function LinkRow({ url, onCopy }) {
  const copy = () => {
    if (!url) return;
    try { navigator.clipboard.writeText(url); toast.success('Link copied!'); onCopy && onCopy(); }
    catch { toast.error('Could not copy — long-press to copy manually.'); }
  };
  return (
    <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
      <div style={{
        flex: '1 1 240px', minWidth: 0, padding: '10px 13px',
        background: 'rgba(0,0,0,0.03)', border: '1px dashed rgba(0,0,0,0.12)',
        borderRadius: 9, fontSize: 12.5, fontFamily: "'JetBrains Mono', monospace",
        color: A.mutedText, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
      }}>
        {url || '—'}
      </div>
      <button onClick={copy} disabled={!url} style={{
        padding: '0 16px', height: 38, borderRadius: 9, border: 'none',
        background: A.ink, color: A.cream, fontSize: 12, fontWeight: 700,
        cursor: url ? 'pointer' : 'not-allowed', opacity: url ? 1 : 0.4, fontFamily: A.font,
      }}>Copy</button>
      <a href={url || '#'} target="_blank" rel="noopener noreferrer" style={{
        padding: '0 16px', height: 38, display: 'inline-flex', alignItems: 'center',
        borderRadius: 9, border: A.border, background: A.shell, color: A.ink,
        fontSize: 12, fontWeight: 700, textDecoration: 'none', fontFamily: A.font,
        pointerEvents: url ? 'auto' : 'none', opacity: url ? 1 : 0.4,
      }}>Open</a>
    </div>
  );
}

// Numbered "how to add this to Google" steps.
function Steps({ items }) {
  return (
    <ol style={{ margin: '14px 0 0', padding: '0 0 0 2px', listStyle: 'none', counterReset: 'step' }}>
      {items.map((t, i) => (
        <li key={i} style={{ display: 'flex', gap: 10, marginBottom: 9, alignItems: 'flex-start' }}>
          <span style={{
            flexShrink: 0, width: 20, height: 20, borderRadius: '50%',
            background: 'rgba(196,168,109,0.15)', color: A.warningDim,
            fontSize: 11, fontWeight: 800, display: 'inline-flex',
            alignItems: 'center', justifyContent: 'center', marginTop: 1,
          }}>{i + 1}</span>
          <span style={{ fontSize: 12.5, color: A.mutedText, lineHeight: 1.5 }}>{t}</span>
        </li>
      ))}
    </ol>
  );
}

function Card({ emoji, title, desc, badge, children }) {
  return (
    <div style={{ background: A.shell, borderRadius: 14, border: A.border, padding: '20px 22px', boxShadow: A.cardShadow }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
        <div style={{ fontSize: 26, lineHeight: 1, flexShrink: 0 }}>{emoji}</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 16, fontWeight: 800, color: A.ink, letterSpacing: '-0.2px' }}>{title}</span>
            {badge}
          </div>
          <div style={{ fontSize: 12.5, color: A.mutedText, marginTop: 4, lineHeight: 1.5 }}>{desc}</div>
        </div>
      </div>
      {children}
    </div>
  );
}

export default function ConnectGoogle() {
  const { userData } = useAuth();
  const rid = userData?.restaurantId;

  const [loading, setLoading] = useState(true);
  const [restaurant, setRestaurant] = useState(null);

  useEffect(() => {
    if (!rid) return;
    getRestaurantById(rid)
      .then(r => { setRestaurant(r || null); setLoading(false); })
      .catch(() => setLoading(false));
  }, [rid]);

  const base = (process.env.NEXT_PUBLIC_SITE_URL || 'https://halohelm.com').replace(/\/+$/, '');
  const subdomain = restaurant?.subdomain || '';
  const placeId = (restaurant?.googlePlaceId || '').trim();
  const name = restaurant?.name || userData?.restaurantName || 'your restaurant';

  const menuUrl = subdomain ? `${base}/menu/${subdomain}` : '';
  const bookUrl = subdomain ? `${base}/book/${subdomain}` : '';
  const reviewUrl = placeId ? `https://search.google.com/local/writereview?placeid=${encodeURIComponent(placeId)}` : '';

  const pill = (text, ok) => (
    <span style={{
      padding: '2px 9px', borderRadius: 999, fontSize: 10.5, fontWeight: 800,
      letterSpacing: '0.03em', textTransform: 'uppercase',
      background: ok ? 'rgba(63,158,90,0.10)' : 'rgba(0,0,0,0.05)',
      color: ok ? A.success : A.faintText,
      border: `1px solid ${ok ? 'rgba(63,158,90,0.30)' : 'rgba(0,0,0,0.10)'}`,
    }}>{text}</span>
  );

  return (
    <AdminLayout>
      <Head><title>Connect to Google — HaloHelm</title></Head>
      <div style={{ background: A.cream, minHeight: '100vh', fontFamily: A.font, color: A.ink }}>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>

        {/* HEADER */}
        <div style={{ padding: '24px 28px 0' }}>
          <div style={{ fontSize: 11, fontWeight: 500, color: A.faintText, marginBottom: 6, letterSpacing: '0.05em', display: 'flex', alignItems: 'center', gap: 6 }}>
            <span>Setup</span><span style={{ opacity: 0.5 }}>›</span><span style={{ color: A.mutedText }}>Connect to Google</span>
          </div>
          <div style={{ fontWeight: 600, fontSize: 28, letterSpacing: '-0.5px', lineHeight: 1.1 }}>
            Connect to <span style={{ color: A.google }}>Google</span>
          </div>
          <div style={{ fontSize: 12.5, color: A.mutedText, marginTop: 4, maxWidth: 620, lineHeight: 1.5 }}>
            Put your menu, table booking, and reviews on your Google Business Profile so diners
            find everything straight from Google Search and Maps.
          </div>
        </div>

        {/* BODY */}
        <div style={{ padding: '20px 28px 60px' }}>
          {loading ? (
            <div style={{ background: A.shell, borderRadius: 14, border: A.border, padding: 48, textAlign: 'center', boxShadow: A.cardShadow }}>
              <div style={{ width: 30, height: 30, border: `3px solid ${A.warning}`, borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto 12px' }} />
              <div style={{ fontSize: 13, color: A.mutedText, fontWeight: 600 }}>Loading…</div>
            </div>
          ) : !subdomain ? (
            <div style={{ background: A.shell, borderRadius: 14, border: A.border, padding: 36, textAlign: 'center', boxShadow: A.cardShadow, fontSize: 13, color: A.mutedText }}>
              We couldn’t load your restaurant link yet. Please refresh, or set it up in{' '}
              <Link href="/admin/business-info" style={{ color: A.warningDim, fontWeight: 700 }}>Business Info</Link>.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14, maxWidth: 720 }}>

              {/* 1 — MENU */}
              <Card
                emoji="🍽️"
                title="Menu on Google"
                desc="A clean, photo-rich menu Google can read — your dishes with AR previews, and no ordering or call-waiter buttons. Perfect for the “Menu” link on your listing."
              >
                <LinkRow url={menuUrl} />
                <Steps items={[
                  'Search your restaurant on Google, then tap “Edit profile”.',
                  'Open the “Menu” field (sometimes under “Food & drink”).',
                  'Paste this link and save.',
                ]} />
              </Card>

              {/* 2 — RESERVATIONS */}
              <Card
                emoji="📅"
                title="Reservations on Google"
                desc="A one-tap “Book a table” form diners can reach from your Google listing. Bookings land in your Reservations page."
              >
                <LinkRow url={bookUrl} />
                <Steps items={[
                  'In your Google Business Profile, open “Bookings” (or add it as your reservations link).',
                  'Paste this link and save.',
                  'A built-in “Reserve a table” button inside Google needs a Google-approved booking partner — this link gives diners a direct path to your form today.',
                ]} />
              </Card>

              {/* 3 — REVIEWS */}
              <Card
                emoji="⭐"
                title="Google Reviews"
                badge={pill(placeId ? 'Connected' : 'Not set up', !!placeId)}
                desc={placeId
                  ? `Diners who finish the in-app rating now see a “Leave a Google review” button that opens this link for ${name}.`
                  : 'Add your Google Place ID to switch on the “Leave a Google review” button that appears after a diner rates their visit.'}
              >
                {placeId ? (
                  <>
                    <LinkRow url={reviewUrl} />
                    <Steps items={[
                      'This is already live on your customer feedback prompt — happy diners can post a Google review in one tap.',
                      'Share the same link in receipts, WhatsApp, or a table card to collect even more reviews.',
                    ]} />
                  </>
                ) : (
                  <div style={{ marginTop: 14 }}>
                    <Link href="/admin/business-info" style={{
                      display: 'inline-flex', alignItems: 'center', gap: 8,
                      padding: '10px 16px', borderRadius: 9, background: A.google, color: '#fff',
                      fontSize: 13, fontWeight: 700, textDecoration: 'none',
                    }}>
                      Add Google Place ID in Business Info →
                    </Link>
                    <div style={{ fontSize: 11.5, color: A.faintText, marginTop: 10, lineHeight: 1.5 }}>
                      Find yours with Google’s free <strong style={{ color: A.mutedText }}>Place ID Finder</strong>{' '}
                      (search “Google Place ID Finder”), then paste it into{' '}
                      <strong style={{ color: A.mutedText }}>Settings → Restaurant Profile</strong>.
                    </div>
                  </div>
                )}
              </Card>

              <div style={{ fontSize: 11.5, color: A.faintText, textAlign: 'center', marginTop: 4, lineHeight: 1.5 }}>
                These are public, read-only links — safe to share anywhere. They always reflect your latest menu and details.
              </div>
            </div>
          )}
        </div>
      </div>
    </AdminLayout>
  );
}

ConnectGoogle.getLayout = (page) => page;
