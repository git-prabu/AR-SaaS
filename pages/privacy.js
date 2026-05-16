// pages/privacy.js
//
// HaloHelm — Privacy Policy. Public, statically-rendered page (no auth, no
// Firestore reads). Styled with the Aspire palette to match the rest of the
// admin chrome.
//
// IMPORTANT — this is a STARTER DRAFT written by an engineer (Claude),
// informed by India's DPDP Act 2023 + IT Rules 2021 + common SaaS patterns.
// It is NOT a substitute for review by a qualified Indian lawyer. Before
// onboarding paid restaurants, have a lawyer in Puducherry / Chennai review
// and customise. ~₹3,000-5,000 for a 1-hr review is standard.
//
// To update: change LAST_UPDATED_ISO + LAST_UPDATED_HUMAN below, edit the
// sections, redeploy. The "Last updated" date is intentionally at the top so
// readers can tell if they're looking at a stale version.

import Head from 'next/head';
import Link from 'next/link';

const LAST_UPDATED_ISO   = '2026-05-16';
const LAST_UPDATED_HUMAN = '16 May 2026';

const A = {
  font:       "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
  cream:      '#EDEDED',
  ink:        '#1A1A1A',
  shell:      '#FFFFFF',
  shellDarker:'#F8F8F8',
  warning:    '#C4A86D',
  warningDim: '#A08656',
  mutedText:  'rgba(0,0,0,0.65)',
  faintText:  'rgba(0,0,0,0.42)',
  subtleBg:   'rgba(0,0,0,0.04)',
  border:     '1px solid rgba(0,0,0,0.08)',
};

const SECTIONS = [
  ['who-we-are',          '1. Who We Are'],
  ['what-we-collect',     '2. Information We Collect'],
  ['how-we-use',          '3. How We Use Your Information'],
  ['who-we-share-with',   '4. Who We Share Your Information With'],
  ['data-storage',        '5. Where Your Data Is Stored'],
  ['data-retention',      '6. How Long We Keep Your Data'],
  ['your-rights',         '7. Your Rights Under the DPDP Act, 2023'],
  ['cookies',             '8. Cookies and Local Storage'],
  ['security',            '9. How We Protect Your Data'],
  ['children',            '10. Children’s Privacy'],
  ['international',       '11. International Users'],
  ['changes',             '12. Changes to This Policy'],
  ['contact',             '13. Contact Us'],
];

export default function PrivacyPolicy() {
  return (
    <>
      <Head>
        <title>Privacy Policy — HaloHelm</title>
        <meta name="description" content="HaloHelm's Privacy Policy — what data we collect, how we use it, and your rights under India's DPDP Act 2023." />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet" />
      </Head>

      <div style={{ minHeight: '100vh', background: A.cream, fontFamily: A.font, color: A.ink }}>
        {/* ── Header ── */}
        <header style={{ background: A.shell, borderBottom: A.border, padding: '20px 24px' }}>
          <div style={{ maxWidth: 880, margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <Link href="/" style={{ textDecoration: 'none' }}>
              <div style={{ fontFamily: A.font, fontWeight: 700, fontSize: 20, color: A.ink, letterSpacing: '-0.4px' }}>
                Halo<span style={{ color: A.warning, fontStyle: 'italic', fontWeight: 500 }}>Helm</span>
              </div>
            </Link>
            <nav style={{ display: 'flex', gap: 22, fontSize: 13 }}>
              <Link href="/" style={{ color: A.mutedText, textDecoration: 'none', fontWeight: 500 }}>Home</Link>
              <Link href="/terms" style={{ color: A.mutedText, textDecoration: 'none', fontWeight: 500 }}>Terms</Link>
              <Link href="/admin/login" style={{ color: A.ink, textDecoration: 'none', fontWeight: 600 }}>Sign in</Link>
            </nav>
          </div>
        </header>

        {/* ── Body ── */}
        <main style={{ maxWidth: 760, margin: '0 auto', padding: '40px 24px 80px' }}>

          <div style={{ fontSize: 12, fontWeight: 600, color: A.faintText, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 10 }}>
            Legal
          </div>
          <h1 style={{ fontSize: 36, fontWeight: 700, color: A.ink, letterSpacing: '-0.6px', margin: '0 0 12px', lineHeight: 1.15 }}>
            Privacy Policy
          </h1>
          <p style={{ fontSize: 14, color: A.mutedText, margin: '0 0 8px' }}>
            <strong>Effective date:</strong> {LAST_UPDATED_HUMAN}
          </p>
          <p style={{ fontSize: 14, color: A.mutedText, margin: '0 0 32px' }}>
            <strong>Last updated:</strong> <time dateTime={LAST_UPDATED_ISO}>{LAST_UPDATED_HUMAN}</time>
          </p>

          {/* Table of Contents */}
          <nav style={{ background: A.shell, border: A.border, borderRadius: 12, padding: '20px 24px', marginBottom: 36 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: A.faintText, letterSpacing: '0.10em', textTransform: 'uppercase', marginBottom: 12 }}>
              Contents
            </div>
            <ol style={{ margin: 0, padding: '0 0 0 18px', lineHeight: 1.85 }}>
              {SECTIONS.map(([id, label]) => (
                <li key={id} style={{ fontSize: 14 }}>
                  <a href={`#${id}`} style={{ color: A.warningDim, textDecoration: 'none', fontWeight: 500 }}>
                    {label.replace(/^\d+\.\s*/, '')}
                  </a>
                </li>
              ))}
            </ol>
          </nav>

          <Lede>
            This Privacy Policy explains how HaloHelm (&ldquo;<strong>we</strong>&rdquo;, &ldquo;<strong>us</strong>&rdquo;,
            &ldquo;<strong>our</strong>&rdquo;) collects, uses, stores, and protects information when you use our
            restaurant management software platform, including our website at <strong>halohelm.com</strong>, our admin
            dashboard, and the customer-facing menu pages we host for restaurants.
          </Lede>

          <Lede>
            We take your privacy seriously and comply with the <strong>Digital Personal Data Protection Act, 2023</strong>{' '}
            (&ldquo;<strong>DPDP Act</strong>&rdquo;) of India and the Information Technology (Reasonable Security
            Practices and Procedures and Sensitive Personal Data or Information) Rules, 2011.
          </Lede>

          {/* ─────────────────────────── */}
          <Section id="who-we-are" title="1. Who We Are">
            <p>
              HaloHelm is a software-as-a-service (SaaS) product operated by <strong>Prabu Sekar</strong>, a sole
              proprietorship registered as a Micro Enterprise under India&rsquo;s Ministry of Micro, Small and Medium
              Enterprises:
            </p>
            <DetailBlock>
              <strong>Trade name:</strong> HaloHelm<br />
              <strong>Owner:</strong> Prabu Sekar (Sole Proprietor)<br />
              <strong>UDYAM Registration:</strong> UDYAM-PY-03-0055722<br />
              <strong>Registered office:</strong> No. 17, Shanthi House, S.M.V. Puram East, Villianur, Puducherry &mdash; 605110, India<br />
              <strong>Contact email:</strong> <a href="mailto:hello@halohelm.com" style={linkStyle}>hello@halohelm.com</a><br />
              <strong>Date of commencement:</strong> 01 January 2026
            </DetailBlock>
            <p>
              For the purposes of the DPDP Act, HaloHelm acts as the <strong>Data Fiduciary</strong> for personal data
              of restaurant owners and staff who hold accounts on our platform, and as a{' '}
              <strong>Data Processor</strong> for personal data of restaurant customers (diners) which we process on
              behalf of those restaurants.
            </p>
          </Section>

          <Section id="what-we-collect" title="2. Information We Collect">
            <p>The information we collect depends on how you interact with HaloHelm.</p>

            <H3>2.1 From Restaurant Owners and Staff (Account Holders)</H3>
            <p>When you sign up for HaloHelm or use the admin dashboard, we collect:</p>
            <ul style={ulStyle}>
              <li><strong>Account details:</strong> name, email address, password (stored hashed by Firebase Authentication; we never see it in plain text), phone number (optional).</li>
              <li><strong>Restaurant details:</strong> restaurant name, subdomain, address, city, GSTIN, FSSAI number, UPI ID, business logo, opening hours.</li>
              <li><strong>Menu and operational data:</strong> menu items, prices, descriptions, photos, categories, combos, offers, coupons, staff roster, table layout.</li>
              <li><strong>Order and bill data:</strong> incoming orders, payment status, customer-provided notes, totals, refunds.</li>
              <li><strong>Payment-gateway configuration:</strong> if you connect a payment gateway (Razorpay / Paytm / PhonePe), we store the merchant credentials you paste, in a private Firestore collection restricted to your account only. We never store credit-card or bank-account numbers.</li>
              <li><strong>Login activity:</strong> sign-in timestamps, IP address, device/browser type. Used for fraud prevention and account security.</li>
              <li><strong>Communications:</strong> emails you send to <a href="mailto:hello@halohelm.com" style={linkStyle}>hello@halohelm.com</a>, support requests, feedback.</li>
            </ul>

            <H3>2.2 From Restaurant Customers (Diners)</H3>
            <p>
              When a diner scans your restaurant&rsquo;s QR code and uses the customer-facing menu, we process the
              following on your behalf:
            </p>
            <ul style={ulStyle}>
              <li><strong>Anonymous session data:</strong> table number scanned, cart contents, language preference, dark/light mode preference. Stored in the browser&rsquo;s <code style={codeStyle}>sessionStorage</code> and <code style={codeStyle}>localStorage</code> &mdash; not on our servers.</li>
              <li><strong>Order data:</strong> items ordered, special instructions, total amount, payment method selected, payment status.</li>
              <li><strong>Optional contact information:</strong> name and phone number, only if the diner enters them for takeaway orders or payment confirmation. Diners can choose not to provide these.</li>
              <li><strong>Optional feedback:</strong> star rating and comments after an order, if the diner chooses to leave them.</li>
              <li><strong>Technical data:</strong> approximate location (city only, derived from IP address), device type, browser, time of visit &mdash; used for performance monitoring and analytics.</li>
            </ul>
            <p>
              <strong>We do not collect</strong> diners&rsquo; bank-account, debit-card, or credit-card numbers. All
              payment processing is handled directly by the payment gateway (Razorpay / Paytm / PhonePe / direct UPI
              app) chosen by the restaurant or the diner. HaloHelm never sees or stores payment instrument data.
            </p>
          </Section>

          <Section id="how-we-use" title="3. How We Use Your Information">
            <p>We use the information we collect for the following purposes:</p>
            <ul style={ulStyle}>
              <li><strong>To provide the HaloHelm service</strong> &mdash; authenticate your sign-in, display your menu to your diners, accept and route their orders, generate bills, send daily summary emails.</li>
              <li><strong>To process payments</strong> &mdash; when a diner pays online, we pass the necessary data (amount, order reference) to your chosen payment gateway. We confirm successful payments via the gateway&rsquo;s webhook and mark the order as paid.</li>
              <li><strong>To improve and maintain the platform</strong> &mdash; debug errors, monitor performance, plan new features based on aggregate usage patterns.</li>
              <li><strong>To communicate with you</strong> &mdash; send transactional emails (sign-up confirmation, password reset, payment receipts, daily summaries), respond to support requests, notify you about important changes to the service.</li>
              <li><strong>To protect against fraud and abuse</strong> &mdash; detect suspicious sign-in patterns, prevent unauthorised access, enforce our Terms of Service.</li>
              <li><strong>To comply with the law</strong> &mdash; respond to lawful requests from Indian government authorities, retain financial records as required under the Income Tax Act, GST law, and other applicable regulations.</li>
            </ul>
            <p>
              We do <strong>not</strong> sell your personal data to advertisers or use it for marketing unrelated to the
              HaloHelm service.
            </p>
          </Section>

          <Section id="who-we-share-with" title="4. Who We Share Your Information With">
            <p>
              HaloHelm is built on top of trusted third-party services. We share the minimum data necessary for these
              services to function:
            </p>
            <DetailBlock>
              <strong>Google Firebase</strong> (operated by Google LLC) &mdash; authentication, database (Firestore), file storage, hosting infrastructure. Stores all account data, menu data, and order data. Located in Firebase&rsquo;s asia-south1 (Mumbai) region.<br /><br />
              <strong>Vercel Inc.</strong> &mdash; web hosting, edge network, build pipeline. Receives anonymised request logs.<br /><br />
              <strong>Razorpay Software Pvt Ltd</strong>, <strong>Paytm Payments Bank Ltd / One97 Communications Ltd</strong>, <strong>PhonePe Pvt Ltd</strong> &mdash; payment processing, when a restaurant connects one of these gateways. The restaurant&rsquo;s diners interact directly with these providers for the payment step.<br /><br />
              <strong>Petpooja (Wow Labz Technologies Pvt Ltd)</strong> &mdash; POS integration, when a restaurant chooses to connect Petpooja. Order data is pushed to their system on the restaurant&rsquo;s instruction.<br /><br />
              <strong>Google LLC (Gmail SMTP)</strong> &mdash; delivers our transactional and daily-summary emails. Email addresses + email contents pass through Google&rsquo;s mail servers.
            </DetailBlock>

            <p>We may also disclose your information:</p>
            <ul style={ulStyle}>
              <li><strong>To comply with a legal obligation</strong> &mdash; court order, valid government request under the IT Act, GST/Income-Tax demand, or a directive issued under the DPDP Act.</li>
              <li><strong>To protect our rights or property</strong> &mdash; if we reasonably believe disclosure is necessary to prevent fraud, abuse, or harm to HaloHelm, our users, or the public.</li>
              <li><strong>In the event of a business transfer</strong> &mdash; if HaloHelm is sold, merged, or acquired, your information may be transferred to the successor entity. We will notify you in advance and you will retain the rights described in Section 7.</li>
            </ul>
            <p>
              We do <strong>not</strong> share your personal data with advertisers, data brokers, or any third party for
              marketing purposes.
            </p>
          </Section>

          <Section id="data-storage" title="5. Where Your Data Is Stored">
            <p>
              Your data is stored in <strong>Google Firebase Firestore</strong> in the <strong>asia-south1
              (Mumbai)</strong> region. This means your data physically resides in India and is subject to Indian
              data-protection laws. We rely on Google&rsquo;s industry-standard security practices, including
              encryption at rest and encryption in transit (TLS 1.2 or higher).
            </p>
            <p>
              Backups, request logs, and operational telemetry may be processed by Google Firebase and Vercel in other
              regions (such as the United States or European Union) as part of their respective global service
              infrastructure. By using HaloHelm you consent to this limited cross-border processing.
            </p>
          </Section>

          <Section id="data-retention" title="6. How Long We Keep Your Data">
            <ul style={ulStyle}>
              <li><strong>Restaurant accounts:</strong> for as long as your account is active, plus up to 90 days after deletion for backup recovery and dispute resolution.</li>
              <li><strong>Order and bill records:</strong> for a minimum of <strong>8 years</strong> from the date of the transaction, to comply with the Income Tax Act, 1961 (Rule 6F) and the GST Act, 2017.</li>
              <li><strong>Diner contact information:</strong> retained for 90 days after the order is paid and closed, then anonymised. Order data itself remains in the restaurant&rsquo;s account for the retention period above.</li>
              <li><strong>Sign-in logs:</strong> 12 months, then deleted.</li>
              <li><strong>Support emails:</strong> 24 months from the last reply.</li>
            </ul>
            <p>
              You may request deletion of your data earlier than these periods (see Section 7) &mdash; we will comply
              except where retention is required by law.
            </p>
          </Section>

          <Section id="your-rights" title="7. Your Rights Under the DPDP Act, 2023">
            <p>
              India&rsquo;s Digital Personal Data Protection Act, 2023 gives you the following rights over your
              personal data held by HaloHelm:
            </p>
            <ul style={ulStyle}>
              <li><strong>Right to access</strong> &mdash; request a summary of personal data we hold about you.</li>
              <li><strong>Right to correction</strong> &mdash; ask us to correct inaccurate or incomplete data.</li>
              <li><strong>Right to erasure</strong> &mdash; ask us to delete personal data we no longer need (subject to legal retention requirements above).</li>
              <li><strong>Right to grievance redressal</strong> &mdash; raise a complaint about how we handle your data.</li>
              <li><strong>Right to nominate</strong> &mdash; nominate another person to exercise these rights on your behalf in the event of your death or incapacity.</li>
              <li><strong>Right to withdraw consent</strong> &mdash; withdraw consent for any processing based on consent at any time. Withdrawal does not affect the lawfulness of past processing.</li>
            </ul>
            <p>
              To exercise any of these rights, email <a href="mailto:hello@halohelm.com" style={linkStyle}>hello@halohelm.com</a>{' '}
              with the subject line &ldquo;DPDP Request&rdquo; and include enough information for us to verify your
              identity. We aim to respond within <strong>30 days</strong>.
            </p>
            <p>
              If you are not satisfied with our response, you may file a complaint with the{' '}
              <strong>Data Protection Board of India</strong>.
            </p>
          </Section>

          <Section id="cookies" title="8. Cookies and Local Storage">
            <p>HaloHelm uses minimal client-side storage:</p>
            <ul style={ulStyle}>
              <li><code style={codeStyle}>sessionStorage</code> &mdash; remembers your cart, the table you scanned, and the current bill while your browser tab is open. Cleared when you close the tab.</li>
              <li><code style={codeStyle}>localStorage</code> &mdash; remembers your dark/light mode preference, your last-used UPI app (for the customer payment picker), and similar UI settings. Persists across visits.</li>
              <li><strong>Firebase Authentication cookies</strong> &mdash; keeps you signed in to the admin dashboard. Cleared when you sign out.</li>
            </ul>
            <p>
              We <strong>do not use</strong> third-party tracking cookies, advertising pixels, or cross-site analytics
              tools like Google Analytics or Facebook Pixel. We do not build profiles of you for advertising purposes.
            </p>
            <p>
              You can clear all HaloHelm-related cookies and storage from your browser settings at any time. Doing so
              will sign you out and reset your preferences.
            </p>
          </Section>

          <Section id="security" title="9. How We Protect Your Data">
            <ul style={ulStyle}>
              <li><strong>Encryption in transit:</strong> all traffic to halohelm.com is served over HTTPS (TLS 1.2 or higher).</li>
              <li><strong>Encryption at rest:</strong> Firestore encrypts all stored data using AES-256 by default.</li>
              <li><strong>Access control:</strong> Firestore security rules restrict access so that one restaurant&rsquo;s data cannot be read or modified by another restaurant&rsquo;s account.</li>
              <li><strong>Password security:</strong> passwords are hashed by Firebase Authentication using scrypt. We never see or store plain-text passwords.</li>
              <li><strong>Payment-gateway credentials:</strong> stored in a private Firestore subcollection only accessible by the restaurant&rsquo;s admin account.</li>
              <li><strong>Webhook verification:</strong> payment-gateway webhooks are cryptographically verified (HMAC-SHA256 or provider-specific checksums) before being acted on, preventing forged &ldquo;paid&rdquo; notifications.</li>
            </ul>
            <p>
              <strong>No system is perfectly secure.</strong> While we apply industry-standard practices, we cannot
              guarantee absolute security. If we become aware of a personal-data breach that is likely to result in
              significant harm to you, we will notify you and the Data Protection Board of India as required by the
              DPDP Act.
            </p>
          </Section>

          <Section id="children" title="10. Children’s Privacy">
            <p>
              HaloHelm is intended for use by businesses and adult diners. We do not knowingly collect personal data
              from children under <strong>18 years of age</strong>. If you are under 18, do not create an account or
              submit your personal information through HaloHelm. If we learn that we have collected personal data from
              a child under 18 without parental consent, we will delete it promptly.
            </p>
          </Section>

          <Section id="international" title="11. International Users">
            <p>
              HaloHelm is designed for restaurants operating in India and their diners. If you access HaloHelm from
              outside India, please be aware that your data will be transferred to and stored in India, which may have
              data-protection laws different from those of your country.
            </p>
            <p>
              If you are an EU/UK resident accessing a HaloHelm-hosted menu page as a diner, the order data you submit
              is processed by HaloHelm on behalf of the restaurant. The restaurant is the data controller for that
              data; HaloHelm acts as the data processor. You may exercise your GDPR / UK GDPR rights by contacting the
              restaurant directly or by writing to us at <a href="mailto:hello@halohelm.com" style={linkStyle}>hello@halohelm.com</a>.
            </p>
          </Section>

          <Section id="changes" title="12. Changes to This Policy">
            <p>
              We may update this Privacy Policy from time to time to reflect changes in our service, applicable law, or
              data-handling practices. When we make a material change, we will:
            </p>
            <ul style={ulStyle}>
              <li>Update the <strong>&ldquo;Last updated&rdquo;</strong> date at the top of this page.</li>
              <li>Email registered restaurant accounts at least <strong>14 days before the change takes effect</strong>.</li>
              <li>Post a banner on the admin dashboard so account holders see the notice on their next sign-in.</li>
            </ul>
            <p>Your continued use of HaloHelm after the change date constitutes acceptance of the updated policy.</p>
          </Section>

          <Section id="contact" title="13. Contact Us">
            <p>For any privacy-related question, request, or complaint, please contact our grievance officer:</p>
            <DetailBlock>
              <strong>Grievance Officer:</strong> Prabu Sekar<br />
              <strong>Email:</strong> <a href="mailto:hello@halohelm.com" style={linkStyle}>hello@halohelm.com</a><br />
              <strong>Postal address:</strong> Prabu Sekar (HaloHelm), No. 17, Shanthi House, S.M.V. Puram East, Villianur, Puducherry &mdash; 605110, India<br /><br />
              We will acknowledge receipt within <strong>3 working days</strong> and respond substantively within{' '}
              <strong>30 days</strong>.
            </DetailBlock>
            <p style={{ fontSize: 12, color: A.faintText, fontStyle: 'italic', marginTop: 28 }}>
              Last updated: <time dateTime={LAST_UPDATED_ISO}>{LAST_UPDATED_HUMAN}</time>
            </p>
          </Section>
        </main>

        {/* ── Footer ── */}
        <footer style={{ background: A.shell, borderTop: A.border, padding: '24px', marginTop: 40 }}>
          <div style={{ maxWidth: 760, margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 14 }}>
            <span style={{ fontSize: 12, color: A.faintText }}>
              &copy; {new Date().getFullYear()} HaloHelm. All rights reserved.
            </span>
            <div style={{ display: 'flex', gap: 18, fontSize: 12 }}>
              <Link href="/" style={{ color: A.mutedText, textDecoration: 'none' }}>Home</Link>
              <Link href="/privacy" style={{ color: A.mutedText, textDecoration: 'none' }}>Privacy</Link>
              <Link href="/terms" style={{ color: A.mutedText, textDecoration: 'none' }}>Terms</Link>
            </div>
          </div>
        </footer>
      </div>
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Small presentational helpers — keep styles in one place + the page
// readable. They render plain HTML so the page is fully indexable + works
// without JavaScript (good for SEO + accessibility).
// ─────────────────────────────────────────────────────────────────────────

function Section({ id, title, children }) {
  return (
    <section id={id} style={{ marginBottom: 36, scrollMarginTop: 80 }}>
      <h2 style={{ fontSize: 22, fontWeight: 700, color: A.ink, letterSpacing: '-0.3px', margin: '0 0 14px', lineHeight: 1.25 }}>
        {title}
      </h2>
      <div style={{ fontSize: 15, color: A.mutedText, lineHeight: 1.75 }}>
        {children}
      </div>
    </section>
  );
}

function H3({ children }) {
  return (
    <h3 style={{ fontSize: 16, fontWeight: 700, color: A.ink, margin: '20px 0 8px', letterSpacing: '-0.1px' }}>
      {children}
    </h3>
  );
}

function Lede({ children }) {
  return (
    <p style={{ fontSize: 16, color: A.ink, lineHeight: 1.7, margin: '0 0 18px' }}>
      {children}
    </p>
  );
}

function DetailBlock({ children }) {
  return (
    <div style={{
      background: A.shellDarker,
      border: A.border,
      borderRadius: 10,
      padding: '16px 18px',
      margin: '14px 0',
      fontSize: 14,
      color: A.ink,
      lineHeight: 1.85,
    }}>
      {children}
    </div>
  );
}

const ulStyle  = { margin: '8px 0 14px', padding: '0 0 0 22px', lineHeight: 1.85 };
const linkStyle = { color: A.warningDim, textDecoration: 'underline', textDecorationThickness: 1 };
const codeStyle = {
  background: A.subtleBg,
  padding: '1px 6px',
  borderRadius: 4,
  fontFamily: "'JetBrains Mono', monospace",
  fontSize: 13,
  color: A.ink,
};

// Bypass any default page layout (this is a standalone marketing/legal page).
PrivacyPolicy.getLayout = (page) => page;
