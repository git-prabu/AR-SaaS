// pages/admin/help.js
// In-app FAQ / help centre for restaurant admins. Aims to answer the
// "how do I..." questions that would otherwise become support emails.
//
// Each FAQ section is collapsible — accordion pattern keeps the page
// scannable when there are 20+ entries. State is local-only (no DB).
//
// Content drafted from the actual codebase + the most common questions
// new restaurants ask in any restaurant-SaaS onboarding flow.

import Head from 'next/head';
import Link from 'next/link';
import { useState } from 'react';
import AdminLayout from '../../components/layout/AdminLayout';

const A = {
  font:       "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
  cream:      '#EDEDED',
  ink:        '#1A1A1A',
  shell:      '#FFFFFF',
  shellDarker:'#F8F8F8',
  warning:    '#C4A86D',
  warningDim: '#A08656',
  mutedText:  'rgba(0,0,0,0.55)',
  faintText:  'rgba(0,0,0,0.38)',
  subtleBg:   'rgba(0,0,0,0.04)',
  border:     '1px solid rgba(0,0,0,0.06)',
  shadowCard: '0 1px 2px rgba(0,0,0,0.04), 0 4px 12px rgba(0,0,0,0.04)',
};

// Inline style helpers used inside FAQ_GROUPS JSX. Must be declared
// BEFORE FAQ_GROUPS — JavaScript TDZ means a `const` referenced
// before its declaration line throws "Cannot access X before
// initialization" at module-load time when the JSX evaluates.
const lnk = { color: A.warningDim, textDecoration: 'underline', textDecorationThickness: 1, fontWeight: 500 };
const kbd = {
  background: A.subtleBg,
  padding: '1px 6px',
  borderRadius: 4,
  fontFamily: "'JetBrains Mono', monospace",
  fontSize: 13,
};

// ─── FAQ content ────────────────────────────────────────────────────
// Grouped by category. Each entry: { q: question, a: JSX answer }.
// Keep answers brief — link out to the relevant page for the full flow.
const FAQ_GROUPS = [
  {
    title: 'Getting Started',
    items: [
      {
        q: 'How do I add my first menu item?',
        a: <>Go to <Link href="/admin/items" style={lnk}>Menu Items</Link> → click <strong>+ Add Item</strong> → fill in name, price, photo, category → Save. Items appear on your customer menu within a few seconds (PWA cache may need a refresh on the customer side).</>,
      },
      {
        q: 'How do I set up my tables and QR codes?',
        a: <>Go to <Link href="/admin/qrcode" style={lnk}>QR & Tables</Link> → set the number of tables → click <strong>Generate All</strong> → download/print the QR sheet. Stick one QR on each table. Customers scan and land on your menu with the table pre-selected.</>,
      },
      {
        q: 'How do I add staff (waiters, kitchen)?',
        a: <>Go to <Link href="/admin/staff" style={lnk}>Staff</Link> → <strong>+ Add Staff</strong> → choose role (waiter / kitchen / captain), set username and PIN → Save. Share the staff sign-in URL with them — they sign in with the username + PIN you set (no email needed).</>,
      },
      {
        q: 'How do I update my restaurant info (name, GSTIN, FSSAI)?',
        a: <>Go to <Link href="/admin/settings" style={lnk}>Settings</Link> → update the fields → Save. Changes apply immediately to bills, receipts, and the customer menu.</>,
      },
    ],
  },
  {
    title: 'Orders & Kitchen',
    items: [
      {
        q: 'How do customers place orders?',
        a: <>Customers scan the QR on their table → see your menu → tap items into their cart → tap Place Order. The order appears live on <Link href="/admin/kitchen" style={lnk}>Kitchen</Link> and <Link href="/admin/orders" style={lnk}>Orders</Link>. No app install needed — works in any phone browser.</>,
      },
      {
        q: 'How does the kitchen know when a new order arrives?',
        a: <>The Kitchen page plays a chime sound when a new order lands (the speaker icon on top-right toggles sound on/off). On a tablet mounted in the kitchen, leave the page open — orders push in real-time via Firebase. No refresh needed.</>,
      },
      {
        q: 'How do I take an order in person (e.g., phone-in or counter)?',
        a: <>Go to <Link href="/admin/new-order" style={lnk}>New Order</Link> → tap items → set table or takeaway → Place. The order behaves identically to a customer-placed one.</>,
      },
      {
        q: 'What if a customer wants to cancel?',
        a: <>On the <Link href="/admin/orders" style={lnk}>Orders</Link> page, find the order → click the more menu → Cancel. Cancellation is permanent — items are removed from the kitchen queue and the bill is marked cancelled.</>,
      },
    ],
  },
  {
    title: 'Payments',
    items: [
      {
        q: 'How do customers pay?',
        a: <>Three options the customer chooses from on the bill modal: <strong>UPI</strong> (Google Pay / PhonePe / Paytm deep link OR scan QR), <strong>Cash</strong>, or <strong>Card</strong>. UPI is preferred — staff sees the payment request and confirms it (or it auto-confirms if Auto-Confirm UPI is enabled).</>,
      },
      {
        q: 'How do I set up Auto-Confirm UPI?',
        a: <>Go to <Link href="/admin/gateway" style={lnk}>Payment Gateway</Link> → <strong>Auto-Confirm UPI</strong> tab → pick provider (Razorpay / Paytm / PhonePe) → paste your merchant credentials → toggle ON → Save. After that, every UPI payment to your account auto-confirms the matching order — no staff confirmation needed.</>,
      },
      {
        q: "What's the difference between Auto-Confirm UPI and Full Gateway?",
        a: <>Auto-Confirm UPI uses your existing merchant account (the one your soundbox is connected to) to <em>listen</em> for payments — money flows directly customer → you, no MDR. Full Gateway routes money through a gateway like Razorpay (2% fee, T+1 settlement, but supports cards/netbanking too). Most restaurants only need Auto-Confirm UPI.</>,
      },
      {
        q: 'How do I refund a customer?',
        a: <>Go to <Link href="/admin/payments" style={lnk}>Payments</Link> → find the order → click the more menu → Refund. We mark it refunded in your records but the actual money move happens through your payment provider's dashboard (Razorpay / Paytm). Cash refunds are handled by you at the table.</>,
      },
    ],
  },
  {
    title: 'Subscription & Billing',
    items: [
      {
        q: 'How long is the free trial?',
        a: <><strong>14 days</strong> from signup, with access to features up to the Growth plan. No credit card required to start. After 14 days you choose a plan (Starter / Growth / Pro) or your account is downgraded to a limited free tier.</>,
      },
      {
        q: 'What does each plan cost?',
        a: <>Starter <strong>₹999/month</strong>, Growth <strong>₹2,499/month</strong>, Pro <strong>₹4,999/month</strong>. All prices exclude GST. Full feature breakdown on <Link href="/admin/subscription" style={lnk}>Subscription</Link>.</>,
      },
      {
        q: 'How do I cancel my subscription?',
        a: <>Go to <Link href="/admin/subscription" style={lnk}>Subscription</Link> → Cancel Subscription. Cancellation takes effect at the end of your current billing cycle — you keep access until then. No partial-month refunds.</>,
      },
      {
        q: 'Will I get an invoice for tax purposes?',
        a: <>Yes — a GST-compliant invoice is emailed to you after every successful subscription payment. You can also download past invoices from the <Link href="/admin/subscription" style={lnk}>Subscription</Link> page.</>,
      },
    ],
  },
  {
    title: 'Customer Menu Page',
    items: [
      {
        q: 'How do I share my customer menu URL?',
        a: <>Your public menu URL is <code style={kbd}>halohelm.com/restaurant/&lt;your-subdomain&gt;</code>. Use the "Copy menu URL" button on <Link href="/admin/settings" style={lnk}>Settings</Link>. Share via WhatsApp, social media, or print on receipts.</>,
      },
      {
        q: "Customers say the menu didn't update after I changed it",
        a: <>The customer page caches for ~60 seconds (for speed). Ask the customer to refresh after a minute. If they have HaloHelm as a PWA installed, they may need to close and reopen the tab.</>,
      },
      {
        q: 'Can customers leave feedback?',
        a: <>Yes — after their order is served, they see a star-rating prompt. Feedback lands on the <Link href="/admin/feedback" style={lnk}>Feedback</Link> page. You can reply to comments and mark them resolved.</>,
      },
    ],
  },
  {
    title: 'Account & Security',
    items: [
      {
        q: 'How do I change my password?',
        a: <>Go to <Link href="/admin/settings/security" style={lnk}>Settings → Security</Link> → enter your current password and the new one → Update. If you forgot your current password, sign out and use the "Forgot password?" link on the sign-in page.</>,
      },
      {
        q: 'How do I change my email address?',
        a: <>Go to <Link href="/admin/settings/security" style={lnk}>Settings → Security</Link> → Change Email. We send a verification link to the new email — your old email keeps working until you click the link, so there's no risk of typo lock-out.</>,
      },
      {
        q: 'I signed up with Google — can I add a password too?',
        a: <>Not directly through HaloHelm. Manage your Google account password from your Google account security settings (linked from <Link href="/admin/settings/security" style={lnk}>Settings → Security</Link>).</>,
      },
    ],
  },
  {
    title: 'Still stuck?',
    items: [
      {
        q: 'How do I get human help?',
        a: <>Email <a href="mailto:hello@halohelm.com" style={lnk}>hello@halohelm.com</a> with a description of what you were doing + a screenshot if possible. We aim to respond within 24 hours on business days.</>,
      },
    ],
  },
];

export default function AdminHelp() {
  // Track which item is "open" — by string key "groupIndex.itemIndex".
  // Only one item open at a time (accordion). null = all collapsed.
  const [openKey, setOpenKey] = useState(null);

  return (
    <AdminLayout>
      <Head><title>Help & FAQ — HaloHelm</title></Head>
      <div style={{ background: A.cream, minHeight: '100vh', fontFamily: A.font, padding: '24px 28px' }}>
        <div style={{ maxWidth: 800 }}>

          {/* Breadcrumb */}
          <div style={{ fontSize: 11, fontWeight: 500, color: A.faintText, marginBottom: 6, letterSpacing: '0.05em' }}>
            Help &nbsp;›&nbsp; <span style={{ color: A.mutedText }}>FAQ</span>
          </div>

          {/* Header */}
          <h1 style={{ fontWeight: 600, fontSize: 28, color: A.ink, letterSpacing: '-0.5px', marginBottom: 6 }}>
            Help & FAQ
          </h1>
          <p style={{ color: A.mutedText, fontSize: 14, lineHeight: 1.6, marginBottom: 24, maxWidth: 600 }}>
            Quick answers to the most common questions. Can&apos;t find what you&apos;re looking for?{' '}
            <a href="mailto:hello@halohelm.com" style={lnk}>Email us</a>{' '}
            and we&apos;ll get back within a day.
          </p>

          {/* FAQ groups */}
          {FAQ_GROUPS.map((group, gi) => (
            <div key={group.title} style={{ marginBottom: 22 }}>
              <div style={{
                fontSize: 12, fontWeight: 700, color: A.warningDim,
                letterSpacing: '0.10em', textTransform: 'uppercase',
                marginBottom: 10, paddingLeft: 4,
              }}>
                {group.title}
              </div>

              <div style={{
                background: A.shell, border: A.border, borderRadius: 14,
                boxShadow: A.shadowCard, overflow: 'hidden',
              }}>
                {group.items.map((item, ii) => {
                  const key = `${gi}.${ii}`;
                  const open = openKey === key;
                  const isLast = ii === group.items.length - 1;
                  return (
                    <div key={ii} style={{ borderBottom: isLast ? 'none' : A.border }}>
                      <button
                        type="button"
                        onClick={() => setOpenKey(open ? null : key)}
                        style={{
                          width: '100%', padding: '14px 18px',
                          background: 'transparent', border: 'none',
                          fontFamily: A.font, fontSize: 14, fontWeight: 600,
                          color: A.ink, textAlign: 'left', cursor: 'pointer',
                          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
                        }}>
                        <span style={{ flex: 1 }}>{item.q}</span>
                        <span style={{
                          flexShrink: 0, fontSize: 18, color: A.faintText,
                          transform: open ? 'rotate(180deg)' : 'rotate(0deg)',
                          transition: 'transform 0.2s ease',
                        }}>⌄</span>
                      </button>
                      {open && (
                        <div style={{
                          padding: '0 18px 16px',
                          fontSize: 14, color: A.mutedText, lineHeight: 1.7,
                        }}>
                          {item.a}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}

          {/* Sign-off footer card */}
          <div style={{
            marginTop: 30, padding: '22px 24px',
            background: A.shell, border: A.border, borderRadius: 14,
            boxShadow: A.shadowCard,
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            gap: 16, flexWrap: 'wrap',
          }}>
            <div>
              <div style={{ fontWeight: 700, fontSize: 14, color: A.ink, marginBottom: 4 }}>
                Couldn&apos;t find your answer?
              </div>
              <div style={{ fontSize: 13, color: A.mutedText, lineHeight: 1.5 }}>
                Email us with a screenshot — we&apos;ll respond within 24 hours.
              </div>
            </div>
            <a
              href="mailto:hello@halohelm.com?subject=HaloHelm%20Help"
              style={{
                padding: '10px 18px', borderRadius: 9,
                background: A.ink, color: A.cream,
                fontSize: 13, fontWeight: 600, fontFamily: A.font,
                textDecoration: 'none',
              }}>
              Email Support
            </a>
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}

// Skip the default per-page layout — AdminLayout is used explicitly above.
AdminHelp.getLayout = (page) => page;
