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
import FeatureShell from '../../components/layout/FeatureShell';
import { useFeatureAccess } from '../../hooks/useFeatureAccess';

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
        a: <>Go to <Link href="/admin/business-info" style={lnk}>Business Info</Link> → update the fields → Save. Changes apply immediately to bills, receipts, and the customer menu.</>,
      },
      {
        q: 'How do I set my restaurant logo?',
        a: <>Go to <Link href="/admin/business-info" style={lnk}>Business Info</Link> → scroll to <strong>Restaurant Profile</strong> → click <strong>Upload logo</strong>. Square images work best (PNG, JPG, or WebP) up to 2&nbsp;MB. The logo shows on your customer menu header right next to your restaurant name. Replace or remove anytime.</>,
      },
      {
        q: 'How do I share my customer menu URL?',
        a: <>Your public menu URL is <code style={kbd}>halohelm.com/restaurant/&lt;your-subdomain&gt;</code>. Find it on <Link href="/admin/business-info" style={lnk}>Business Info</Link> → click <strong>Copy URL</strong>. Share via WhatsApp, social media, or print on receipts.</>,
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
        q: 'How do notifications work? (sounds, voice, lock-screen alerts)',
        a: <>
          There are <b>three separate alert channels</b>, each with its own toggle in the top-right of the Kitchen Station / Orders pages:
          <br /><br />
          <b>🔊 In-app chime</b> — beeps when something new arrives. Only works while the page is <i>open on screen</i>. First tap anywhere on the page activates audio (browsers require one touch before they allow sound).
          <br /><br />
          <b>🎙️ Voice readout</b> — speaks the event aloud ("New order, table 5, 3 items"). Also only while the page is open and in the foreground. On iPhone, the side <b>Silent switch must be OFF</b> or the phone stays mute.
          <br /><br />
          <b>📲 Lock-screen push</b> — the important one: rings <i>even when the phone is locked or the app is closed</i>. Tap the 📵 icon once on each device and Allow notifications. <b>iPhone extra step:</b> push only works if the app was installed via Safari → Share → <b>Add to Home Screen</b>, and opened from that home-screen icon. Android phones and computers work directly in Chrome.
          <br /><br />
          Staff with Kitchen access get new-order alerts; staff with Orders access get ready/call/payment alerts; the owner gets everything.
        </>,
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
        q: 'Where do I set my UPI ID?',
        a: <>Go to <Link href="/admin/gateway" style={lnk}>Payment Gateway</Link> → the UPI ID card at the top → paste your UPI ID (e.g. <code style={kbd}>yourrestaurant@ybl</code>) → Save. Customers see this as a Pay-by-UPI option on the bill — money lands directly in your account, no fee. (Until June 2026 this lived on Business Info; it moved to Payment Gateway so all payment config is in one place.)</>,
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
        a: <>Starter <strong>₹999/month</strong>, Growth <strong>₹2,499/month</strong>, Pro <strong>₹3,499/month</strong>. All prices exclude GST. Annual plans get 2 months free. Full feature breakdown on <Link href="/admin/subscription" style={lnk}>Subscription</Link>.</>,
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
    title: 'Customers & Marketing',
    items: [
      {
        q: 'Where do I see who my regular customers are?',
        a: <>Go to <Link href="/admin/customers" style={lnk}>Customers</Link>. The list is auto-sorted by most recent visit. Each row shows total visits, total spent, last seen, and the date they first ordered with you ("Customer since…").</>,
      },
      {
        q: 'How do I find customers who came in this week / month?',
        a: <>On the <Link href="/admin/customers" style={lnk}>Customers</Link> page, use the date chips above the search bar — <strong>Last 7 days · Last 30 days · Last 90 days</strong>. Combine with the text search to find someone specific within that window.</>,
      },
      {
        q: 'Why do some customers show "Customer since —"?',
        a: <>That customer was created before we started tracking first-visit dates, OR they were imported without an order history. Use <strong>Sync from orders</strong> at the top of the <Link href="/admin/customers" style={lnk}>Customers</Link> page — it rebuilds visit dates from existing orders.</>,
      },
      {
        q: 'How do I send a WhatsApp / email blast to my customers?',
        a: <>Go to <Link href="/admin/campaigns" style={lnk}>Marketing</Link> → pick the audience (everyone, by tag, or lapsed) → write your message → send. WhatsApp opens click-to-chat for each recipient (free, unlimited). Email blasts are capped at 40 recipients per send and 5 sends per day per restaurant — for bigger lists use WhatsApp.</>,
      },
    ],
  },
  {
    title: 'Menu & Promotions',
    items: [
      {
        q: 'How do I create a discount coupon (e.g. SAVE20)?',
        a: <>Go to <Link href="/admin/promotions" style={lnk}>Promotions</Link> → Coupons tab → <strong>+ New Coupon</strong> → set code (SAVE20), discount type (% or flat ₹), minimum order, and expiry date → Save. Customers enter the code on the bill modal to apply it.</>,
      },
      {
        q: 'How do I bundle items into a combo (e.g. burger + fries + drink)?',
        a: <>Go to <Link href="/admin/promotions" style={lnk}>Promotions</Link> → Combos tab → <strong>+ New Combo</strong> → name it, pick the items + quantities, set the combo price → Save. Combos appear at the top of the customer menu and on every item card as upsells.</>,
      },
      {
        q: 'How do I run a happy-hour offer (e.g. 20% off 4-6 PM)?',
        a: <>Go to <Link href="/admin/promotions" style={lnk}>Promotions</Link> → Offers tab → <strong>+ New Offer</strong> → set the discount, the day/hour window, and an optional minimum bill → Save. The discount auto-applies on the customer bill during the active window.</>,
      },
      {
        q: 'How many menu items can I have?',
        a: <>Starter: <strong>50 items</strong>, Growth: <strong>100 items</strong>, Pro: <strong>unlimited</strong>. Your current usage is shown on <Link href="/admin/subscription" style={lnk}>Subscription</Link>. To raise the cap, upgrade your plan.</>,
      },
    ],
  },
  {
    title: 'Reports & Analytics',
    items: [
      {
        q: "What's the difference between Analytics and Reports?",
        a: <><Link href="/admin/analytics" style={lnk}>Analytics</Link> is for trends — revenue over time, top dishes, peak hours, customer return rate. <Link href="/admin/reports" style={lnk}>Reports</Link> is for accounting — daily totals, payment-method breakdown, GST summary, exportable CSVs for your accountant.</>,
      },
      {
        q: 'How do I see my GST collected for the month?',
        a: <>Go to <Link href="/admin/reports" style={lnk}>Reports</Link> → pick a date range → the GST summary breaks down CGST + SGST + total tax collected per bill. Export to CSV for your accountant.</>,
      },
      {
        q: 'Where do I close the day / generate a Z-report?',
        a: <>Go to <Link href="/admin/day-close" style={lnk}>Day Close</Link> → review the day's orders + cash drawer → click <strong>Close Day</strong>. The Z-report is generated automatically and saved — you can re-print or export anytime from the same page.</>,
      },
    ],
  },
  {
    title: 'Account & Security',
    items: [
      {
        q: 'How do I change my password?',
        a: <>Go to <Link href="/admin/security" style={lnk}>Security</Link> → enter your current password and the new one → Update. If you forgot your current password, sign out and use the "Forgot password?" link on the sign-in page.</>,
      },
      {
        q: 'How do I change my email address?',
        a: <>Go to <Link href="/admin/security" style={lnk}>Security</Link> → Change Email. We send a verification link to the new email — your old email keeps working until you click the link, so there's no risk of typo lock-out.</>,
      },
      {
        q: 'I signed up with Google — can I add a password too?',
        a: <>Not directly through HaloHelm. Manage your Google account password from your Google account security settings (linked from <Link href="/admin/security" style={lnk}>Security</Link>).</>,
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

  // 'help' is a UNIVERSAL_STAFF_PERM (audit #16) — every signed-in
  // staff member can read this page in their StaffShell; the owner
  // renders inside AdminLayout exactly as before.
  const { ready, isAdmin } = useFeatureAccess('help');

  return (
    <FeatureShell ready={ready} isAdmin={isAdmin} active="/admin/help" permKey="help" planAllowsFeature={true}>
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

          {/* ─── First-30-minutes quick-start ─── */}
          {/* Sits above the searchable FAQ. New owners see this first
              and have a clear ordered path through the 3 setup steps
              that mirror the welcome email. Returning owners scroll
              past it to the FAQ. */}
          <div style={{
            marginBottom: 28, padding: '22px 24px',
            background: 'linear-gradient(135deg, rgba(196,168,109,0.10), rgba(196,168,109,0.04))',
            border: '1px solid rgba(196,168,109,0.25)',
            borderRadius: 14,
          }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: A.warningDim, letterSpacing: '0.10em', textTransform: 'uppercase', marginBottom: 8 }}>
              First 30 minutes
            </div>
            <div style={{ fontSize: 18, fontWeight: 700, color: A.ink, marginBottom: 14, letterSpacing: '-0.3px' }}>
              Get your restaurant live in 3 steps
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {[
                {
                  step: '1',
                  title: 'Add your menu items',
                  body: <>Open <Link href="/admin/items" style={lnk}>Menu Items</Link> → <strong>+ Add Item</strong>. Name, price, photo, category. Customers see new items within seconds of saving.</>,
                },
                {
                  step: '2',
                  title: 'Set up payments + UPI',
                  body: <>Go to <Link href="/admin/gateway" style={lnk}>Payment Gateway</Link> → paste your UPI ID at the top → Save. That's enough to start taking payments. Auto-Confirm and Razorpay can come later.</>,
                },
                {
                  step: '3',
                  title: 'Generate & print your table QR codes',
                  body: <>Open <Link href="/admin/qrcode" style={lnk}>QR &amp; Tables</Link> → set table count → <strong>Generate</strong> → download/print. Stick one QR on each table. Print once — they keep working forever, even when you rotate the security token.</>,
                },
              ].map(s => (
                <div key={s.step} style={{
                  display: 'flex', gap: 14, alignItems: 'flex-start',
                  padding: '12px 14px', background: A.shell,
                  border: A.border, borderRadius: 10,
                }}>
                  <div style={{
                    flexShrink: 0, width: 28, height: 28, borderRadius: '50%',
                    background: A.ink, color: A.cream,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 13, fontWeight: 800,
                  }}>{s.step}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: A.ink, marginBottom: 2 }}>{s.title}</div>
                    <div style={{ fontSize: 13, color: A.mutedText, lineHeight: 1.55 }}>{s.body}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

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
    </FeatureShell>
  );
}

// Skip the default per-page layout — FeatureShell is used explicitly above.
AdminHelp.getLayout = (page) => page;
