// pages/terms.js
//
// HaloHelm — Terms of Service. Public, statically-rendered page (no auth, no
// Firestore reads). Styled to match privacy.js with the Aspire palette.
//
// IMPORTANT — this is a STARTER DRAFT informed by Indian SaaS practice + the
// Indian Contract Act, 1872 + the Consumer Protection Act, 2019. It is NOT
// legal advice. Have a qualified Indian lawyer (preferably one familiar with
// SaaS) review before charging real money or onboarding paid restaurants.
//
// To update: change LAST_UPDATED_ISO + LAST_UPDATED_HUMAN, edit sections,
// redeploy. The "Last updated" date is at the top so readers can tell at a
// glance whether they're looking at a stale version.

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
  ['acceptance',          '1. Acceptance of These Terms'],
  ['definitions',         '2. Definitions'],
  ['who-can-use',         '3. Who Can Use HaloHelm'],
  ['account',             '4. Your HaloHelm Account'],
  ['trial-and-plans',     '5. Free Trial and Subscription Plans'],
  ['payment',             '6. Payment, Renewal, and Cancellation'],
  ['refunds',             '7. Refunds'],
  ['restaurant-content',  '8. Restaurant Content and Responsibilities'],
  ['diner-interactions',  '9. Diner Interactions and Payments'],
  ['halohelm-role',       '10. HaloHelm’s Role: We Are Software, Not the Restaurant'],
  ['acceptable-use',      '11. Acceptable Use'],
  ['ip',                  '12. Intellectual Property'],
  ['third-parties',       '13. Third-Party Services'],
  ['warranties',          '14. Service Availability and Disclaimers'],
  ['liability',           '15. Limitation of Liability'],
  ['indemnity',           '16. Indemnification'],
  ['termination',         '17. Suspension and Termination'],
  ['changes',             '18. Changes to These Terms'],
  ['governing-law',       '19. Governing Law and Jurisdiction'],
  ['disputes',            '20. Dispute Resolution'],
  ['miscellaneous',       '21. Miscellaneous'],
  ['contact',             '22. Contact Us'],
];

export default function TermsOfService() {
  return (
    <>
      <Head>
        <title>Terms of Service — HaloHelm</title>
        <meta name="description" content="HaloHelm's Terms of Service — your agreement with us when you use our restaurant management software." />
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
              <Link href="/privacy" style={{ color: A.mutedText, textDecoration: 'none', fontWeight: 500 }}>Privacy</Link>
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
            Terms of Service
          </h1>
          <p style={{ fontSize: 14, color: A.mutedText, margin: '0 0 8px' }}>
            <strong>Effective date:</strong> {LAST_UPDATED_HUMAN}
          </p>
          <p style={{ fontSize: 14, color: A.mutedText, margin: '0 0 32px' }}>
            <strong>Last updated:</strong> <time dateTime={LAST_UPDATED_ISO}>{LAST_UPDATED_HUMAN}</time>
          </p>

          {/* TOC */}
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
            These Terms of Service (&ldquo;<strong>Terms</strong>&rdquo;) form a legally binding agreement between you
            and <strong>Prabu Sekar</strong>, the sole proprietor operating HaloHelm
            (&ldquo;<strong>HaloHelm</strong>&rdquo;, &ldquo;<strong>we</strong>&rdquo;, &ldquo;<strong>us</strong>&rdquo;,
            &ldquo;<strong>our</strong>&rdquo;). They govern your use of the HaloHelm website at{' '}
            <strong>halohelm.com</strong>, our admin dashboard, our customer-facing menu pages, and all related
            services (collectively, the &ldquo;<strong>Service</strong>&rdquo;).
          </Lede>

          <Lede>
            <strong>Please read these Terms carefully before using the Service.</strong> If you do not agree, do not
            create an account, sign in, or use the Service in any way.
          </Lede>

          <Section id="acceptance" title="1. Acceptance of These Terms">
            <p>You accept these Terms by any of the following actions:</p>
            <ul style={ulStyle}>
              <li>Creating an account on HaloHelm.</li>
              <li>Signing in to the admin dashboard.</li>
              <li>Using any feature of the Service, including the customer-facing menu pages we host for restaurants.</li>
            </ul>
            <p>
              You may also be required to agree to additional terms specific to certain features (for example, payment
              gateway integration terms). Those additional terms are incorporated into this agreement by reference.
            </p>
          </Section>

          <Section id="definitions" title="2. Definitions">
            <DetailBlock>
              <strong>Restaurant / You / Your</strong> &mdash; the business entity or individual that signs up for and
              uses HaloHelm to manage their restaurant.<br /><br />
              <strong>Diner</strong> &mdash; an end customer of a Restaurant who uses the HaloHelm-hosted menu page to
              view the menu, place an order, or make a payment.<br /><br />
              <strong>Account</strong> &mdash; the account you create on HaloHelm to access the admin dashboard and
              manage your Restaurant&rsquo;s presence on the Service.<br /><br />
              <strong>Content</strong> &mdash; any text, images, menu data, prices, descriptions, restaurant
              information, or other material that you upload, post, or otherwise make available through the Service.
              <br /><br />
              <strong>Subscription Plan</strong> &mdash; the paid plan (Starter, Growth, or Pro &mdash; or any future
              plan we offer) you select after your free trial ends.
            </DetailBlock>
          </Section>

          <Section id="who-can-use" title="3. Who Can Use HaloHelm">
            <p>You may use HaloHelm only if all of the following are true:</p>
            <ul style={ulStyle}>
              <li>You are at least <strong>18 years of age</strong>.</li>
              <li>You are legally capable of entering into a binding contract under the Indian Contract Act, 1872.</li>
              <li>You are authorised to act on behalf of the restaurant business you sign up under.</li>
              <li>Your use of the Service complies with all applicable laws in your jurisdiction, including but not limited to the FSSAI Act, 2006; the GST Act, 2017; the Income Tax Act, 1961; and consumer-protection laws.</li>
              <li>You are not located in a jurisdiction subject to Indian government sanctions or restrictions.</li>
            </ul>
          </Section>

          <Section id="account" title="4. Your HaloHelm Account">
            <ul style={ulStyle}>
              <li><strong>Accuracy:</strong> you agree to provide accurate, current, and complete information when creating your Account, and to keep it updated.</li>
              <li><strong>Security:</strong> you are responsible for maintaining the confidentiality of your Account credentials, including your password. Any activity carried out through your Account is presumed to be authorised by you.</li>
              <li><strong>One business, one Account:</strong> each Restaurant should maintain a single Account. You may not create multiple Accounts to circumvent feature limits, plan pricing, or trial periods.</li>
              <li><strong>Staff sub-accounts:</strong> you may create staff sub-accounts (waiters, kitchen, captains) using the in-built staff management feature. You remain responsible for all actions performed by your staff sub-accounts.</li>
              <li><strong>Notification of unauthorised use:</strong> notify us immediately at <a href="mailto:hello@halohelm.com" style={linkStyle}>hello@halohelm.com</a> if you suspect any unauthorised access to your Account.</li>
            </ul>
          </Section>

          <Section id="trial-and-plans" title="5. Free Trial and Subscription Plans">
            <H3>5.1 Free Trial</H3>
            <p>
              New Restaurants are offered a <strong>14-day free trial</strong> of HaloHelm with access to features
              up to the limits of the Growth Plan. No payment is required to start the trial. We do not collect credit
              card details upfront.
            </p>

            <H3>5.2 Subscription Plans</H3>
            <p>
              At the end of the trial, you must choose a Subscription Plan to continue using paid features. Current
              plans (subject to change, see Section 18):
            </p>
            <DetailBlock>
              <strong>Starter</strong> &mdash; ₹999/month<br />
              <strong>Growth</strong> &mdash; ₹2,499/month<br />
              <strong>Pro</strong> &mdash; ₹4,999/month<br /><br />
              All prices are in Indian Rupees (INR), exclusive of GST. Feature limits and inclusions for each Plan are
              published on our pricing page at <a href="https://halohelm.com" style={linkStyle}>halohelm.com</a> and
              may be updated from time to time.
            </DetailBlock>

            <H3>5.3 After the Trial</H3>
            <p>
              If you do not select a paid Subscription Plan at the end of the trial, your Account will be downgraded
              to a limited free tier or suspended. Your Restaurant data will be preserved for at least <strong>90
              days</strong> after suspension, after which it may be deleted unless you reactivate.
            </p>
          </Section>

          <Section id="payment" title="6. Payment, Renewal, and Cancellation">
            <ul style={ulStyle}>
              <li><strong>Billing cycle:</strong> Subscriptions are billed monthly in advance. The billing date is the date you first subscribed.</li>
              <li><strong>Payment method:</strong> Subscription payments are processed through our payment gateway (currently Razorpay) using credit card, debit card, UPI, or net banking.</li>
              <li><strong>Auto-renewal:</strong> Subscriptions auto-renew at the end of each billing cycle until you cancel.</li>
              <li><strong>Failed payment:</strong> If a renewal payment fails, we will retry up to 3 times over 7 days. If all retries fail, your Account is suspended; your data is retained per Section 5.3.</li>
              <li><strong>Cancellation:</strong> You may cancel your Subscription anytime from the admin dashboard. Cancellation takes effect at the end of the current billing cycle &mdash; you retain access until then. No partial-month refunds.</li>
              <li><strong>Price changes:</strong> We may change Subscription prices. You will receive at least <strong>30 days&rsquo; notice</strong> by email before any price change takes effect for your Account.</li>
              <li><strong>Taxes:</strong> All prices exclude applicable taxes (GST). We will issue a GST-compliant invoice for each billing cycle.</li>
            </ul>
          </Section>

          <Section id="refunds" title="7. Refunds">
            <p>
              Subscription fees are <strong>non-refundable</strong> except in the following cases:
            </p>
            <ul style={ulStyle}>
              <li><strong>Service unavailability:</strong> if HaloHelm is unavailable for more than 48 continuous hours due to issues solely on our end, you may request a pro-rated refund for the affected period.</li>
              <li><strong>Material breach by us:</strong> if we materially breach these Terms and fail to cure the breach within 30 days of written notice from you, you may cancel and receive a refund for the unused portion of the current billing cycle.</li>
              <li><strong>Where required by applicable law:</strong> any refund right that cannot be waived under Indian consumer-protection law.</li>
            </ul>
            <p>
              Refund requests must be made within <strong>30 days</strong> of the event at{' '}
              <a href="mailto:hello@halohelm.com" style={linkStyle}>hello@halohelm.com</a>. Approved refunds are
              processed within 7-14 business days to the original payment method.
            </p>
          </Section>

          <Section id="restaurant-content" title="8. Restaurant Content and Responsibilities">
            <p>
              You retain ownership of all Content you upload to HaloHelm (menu items, descriptions, images, prices, restaurant
              information). By uploading Content, you grant HaloHelm a <strong>non-exclusive, royalty-free, worldwide
              licence</strong> to host, display, process, and transmit your Content solely for the purpose of operating
              the Service for you.
            </p>
            <p>You are solely responsible for ensuring that:</p>
            <ul style={ulStyle}>
              <li>Your Content is accurate, including item prices, descriptions, photos, and allergen information.</li>
              <li>Your menu complies with <strong>FSSAI labelling rules</strong>, including correct vegetarian/non-vegetarian marking, allergen disclosure where applicable, and any nutritional or hygiene disclosures required by law.</li>
              <li>Your Content does not infringe any third-party intellectual property rights, trademarks, or copyrights.</li>
              <li>Your Content is not defamatory, obscene, fraudulent, or otherwise unlawful.</li>
              <li>The food and services you provide to Diners comply with all applicable food safety, hygiene, GST, and consumer-protection laws.</li>
              <li>You charge the correct GST on items as required by law and remit the same to the Government.</li>
            </ul>
            <p>
              <strong>You are solely responsible for your relationship with your Diners</strong>, including order
              fulfilment, food quality, allergen handling, customer complaints, refunds (other than the HaloHelm
              subscription refund covered in Section 7), and any disputes arising therefrom.
            </p>
          </Section>

          <Section id="diner-interactions" title="9. Diner Interactions and Payments">
            <ul style={ulStyle}>
              <li>HaloHelm provides software that lets Diners place orders with your Restaurant. <strong>HaloHelm is not a party to the order</strong>; the order is a contract between you (the Restaurant) and the Diner.</li>
              <li>Payment for orders is handled either by your connected payment gateway (Razorpay / Paytm / PhonePe) or by direct UPI to your VPA or by cash/card at your table. <strong>HaloHelm does not hold, route, or take a cut from order payments.</strong></li>
              <li>The diner-facing menu page may display a small &ldquo;Powered by HaloHelm&rdquo; mark; you may remove this on higher-tier plans where permitted.</li>
              <li>You will handle all Diner complaints, refunds for order-level issues, and queries about food. We may, at our sole discretion, assist with technical issues (e.g., a failed online payment).</li>
            </ul>
          </Section>

          <Section id="halohelm-role" title="10. HaloHelm’s Role: We Are Software, Not the Restaurant">
            <p>
              HaloHelm is a software platform. We are not a food-delivery aggregator, a restaurant, a food-services
              provider, or a payment-processing institution. We do not:
            </p>
            <ul style={ulStyle}>
              <li>Prepare, sell, or deliver food.</li>
              <li>Take orders on behalf of restaurants.</li>
              <li>Hold customer funds in escrow.</li>
              <li>Process or settle payments (payments go directly from the diner to the restaurant via the payment gateway or UPI provider chosen by the restaurant).</li>
              <li>Issue invoices or receipts on behalf of restaurants (we provide the software to generate them; the restaurant is the legal issuer).</li>
            </ul>
            <p>
              <strong>Any claim, complaint, or dispute arising from food, service, hygiene, or order fulfilment must be
              raised directly with the Restaurant.</strong> HaloHelm has no liability for such matters.
            </p>
          </Section>

          <Section id="acceptable-use" title="11. Acceptable Use">
            <p>You agree not to use HaloHelm to:</p>
            <ul style={ulStyle}>
              <li>List items that are illegal to sell under Indian law (e.g., prohibited substances).</li>
              <li>Spam, harass, or defraud Diners or other users.</li>
              <li>Reverse engineer, decompile, or attempt to extract the source code of the Service.</li>
              <li>Bypass rate limits, security measures, or Subscription Plan feature limits.</li>
              <li>Use automated scripts (bots, scrapers, crawlers) to access the Service without our prior written permission.</li>
              <li>Resell, sublicense, or white-label the Service without a separate agreement with us.</li>
              <li>Upload or transmit viruses, malware, or any malicious code.</li>
              <li>Interfere with or disrupt the integrity or performance of the Service.</li>
              <li>Impersonate any person or entity, or misrepresent your affiliation with a person or entity.</li>
            </ul>
            <p>Violation may result in immediate suspension or termination of your Account without refund.</p>
          </Section>

          <Section id="ip" title="12. Intellectual Property">
            <H3>12.1 Our Intellectual Property</H3>
            <p>
              HaloHelm, the HaloHelm name and logo, the &ldquo;Halo<em>Helm</em>&rdquo; wordmark, the underlying
              software, the design of the admin dashboard, the customer-facing menu page templates, and all related
              graphics, copy, and documentation are owned by Prabu Sekar (HaloHelm) and protected by Indian and
              international intellectual property laws.
            </p>
            <p>
              We grant you a limited, non-exclusive, non-transferable, revocable licence to use the Service in
              accordance with these Terms during your active Subscription. Nothing in these Terms transfers ownership
              of our intellectual property to you.
            </p>

            <H3>12.2 Your Content</H3>
            <p>
              Your Content remains yours. The licence you grant us (Section 8) is solely for the purpose of operating
              the Service for you. We do not claim ownership of your menu, photos, prices, or restaurant data.
            </p>

            <H3>12.3 Feedback</H3>
            <p>
              If you send us feedback, ideas, or suggestions about improving HaloHelm, you grant us a perpetual,
              royalty-free, worldwide licence to use that feedback to improve the Service without any obligation to
              compensate you.
            </p>
          </Section>

          <Section id="third-parties" title="13. Third-Party Services">
            <p>
              HaloHelm integrates with third-party services (Google Firebase, Razorpay, Paytm, PhonePe, Petpooja,
              Gmail SMTP, Vercel hosting) that have their own terms of service and privacy policies. Your use of those
              services through HaloHelm is also governed by their terms.
            </p>
            <p>
              We are not responsible for the actions, errors, downtime, data handling, or fees of any third-party
              service. If a third-party service ceases to be available, we will make a reasonable effort to find an
              alternative but make no guarantee that any specific third-party integration will remain available
              indefinitely.
            </p>
          </Section>

          <Section id="warranties" title="14. Service Availability and Disclaimers">
            <H3>14.1 No Uptime Guarantee</H3>
            <p>
              We strive to keep HaloHelm available 24/7 but do not guarantee uninterrupted, error-free, or fault-free
              operation. The Service may be temporarily unavailable for maintenance, upgrades, or due to causes beyond
              our reasonable control (e.g., outages at Firebase / Vercel, ISP failures, force majeure).
            </p>

            <H3>14.2 &ldquo;As Is&rdquo; Basis</H3>
            <p>
              TO THE FULLEST EXTENT PERMITTED BY APPLICABLE LAW, THE SERVICE IS PROVIDED ON AN
              &ldquo;<strong>AS IS</strong>&rdquo; AND &ldquo;<strong>AS AVAILABLE</strong>&rdquo; BASIS, WITHOUT
              WARRANTIES OF ANY KIND, EITHER EXPRESS OR IMPLIED, INCLUDING WITHOUT LIMITATION IMPLIED WARRANTIES OF
              MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, OR NON-INFRINGEMENT.
            </p>
            <p>
              We do not warrant that the Service will meet your specific business requirements, that defects will be
              corrected, that the Service or the server that makes it available will be free of viruses or other
              harmful components, or that the Service will produce specific business outcomes (e.g., increased revenue,
              more orders).
            </p>
          </Section>

          <Section id="liability" title="15. Limitation of Liability">
            <p>
              TO THE FULLEST EXTENT PERMITTED BY APPLICABLE LAW, IN NO EVENT WILL HALOHELM (PRABU SEKAR), OR ANY OF
              OUR AFFILIATES, EMPLOYEES, AGENTS, OR CONTRACTORS BE LIABLE FOR:
            </p>
            <ul style={ulStyle}>
              <li>Any indirect, incidental, consequential, special, or punitive damages.</li>
              <li>Loss of profits, revenue, goodwill, data, or business opportunities.</li>
              <li>Failure or delay in payment processing by a third-party payment gateway.</li>
              <li>Loss or corruption of data caused by a third-party service or by your own actions (e.g., accidentally deleting menu items).</li>
              <li>Any food-safety, hygiene, or order-quality issue arising from a Restaurant&rsquo;s operations.</li>
              <li>Any claim by a Diner against the Restaurant.</li>
            </ul>
            <p>
              <strong>Aggregate cap.</strong> Our total cumulative liability to you under or in connection with these
              Terms and the Service, regardless of the cause of action, will not exceed the <strong>greater of (a)
              the total Subscription fees you have paid us in the 12 months immediately preceding the event giving
              rise to the claim, or (b) ₹10,000 (Indian Rupees Ten Thousand)</strong>.
            </p>
            <p style={{ fontSize: 13, color: A.faintText, fontStyle: 'italic' }}>
              The limitations above apply even if HaloHelm has been advised of the possibility of such damages.
              Some jurisdictions do not allow the exclusion or limitation of certain damages; in such jurisdictions,
              our liability is limited to the maximum extent permitted by law.
            </p>
          </Section>

          <Section id="indemnity" title="16. Indemnification">
            <p>
              You agree to indemnify, defend, and hold harmless Prabu Sekar (HaloHelm), our affiliates, and our
              representatives from any claims, damages, losses, liabilities, costs, and expenses (including reasonable
              legal fees) arising out of or related to:
            </p>
            <ul style={ulStyle}>
              <li>Your use of the Service in violation of these Terms or applicable law.</li>
              <li>Your Content (e.g., infringement of third-party IP, false claims, FSSAI non-compliance).</li>
              <li>Any dispute between you and your Diners.</li>
              <li>Any claim regarding the food you serve or the orders you fulfil.</li>
              <li>Your tax obligations (GST, income tax) on the revenue you earn through HaloHelm.</li>
              <li>Your failure to obtain required licences or permits (FSSAI, GST, trade licence, etc.).</li>
            </ul>
          </Section>

          <Section id="termination" title="17. Suspension and Termination">
            <H3>17.1 By You</H3>
            <p>
              You may cancel your Subscription anytime via the admin dashboard. Cancellation takes effect at the end of
              the current billing cycle.
            </p>

            <H3>17.2 By Us</H3>
            <p>We may suspend or terminate your Account, with or without prior notice, if:</p>
            <ul style={ulStyle}>
              <li>You violate these Terms.</li>
              <li>You fail to pay any due Subscription fees.</li>
              <li>We are required to do so by law or by an order of a court or competent authority.</li>
              <li>Your use of the Service poses a security or legal risk to HaloHelm or other users.</li>
              <li>We decide to discontinue the Service entirely (in which case we will provide at least 60 days&rsquo; notice and pro-rate refund any prepaid unused Subscription).</li>
            </ul>

            <H3>17.3 Effect of Termination</H3>
            <p>
              Upon termination, your right to access the Service ceases immediately. Your Restaurant data will be
              preserved for <strong>at least 90 days</strong> to allow you to reactivate or export it, after which it
              may be permanently deleted. Sections 8 (Content licence for past-served orders), 12 (IP), 14
              (Disclaimers), 15 (Liability), 16 (Indemnity), 19 (Governing Law), and 20 (Dispute Resolution) survive
              termination.
            </p>
          </Section>

          <Section id="changes" title="18. Changes to These Terms">
            <p>
              We may revise these Terms from time to time. When we make a material change, we will:
            </p>
            <ul style={ulStyle}>
              <li>Update the &ldquo;Last updated&rdquo; date at the top of this page.</li>
              <li>Email registered Account holders at least <strong>14 days before the change takes effect</strong>.</li>
              <li>Display a banner in the admin dashboard alerting you on next sign-in.</li>
            </ul>
            <p>
              If you continue to use the Service after the change date, you accept the revised Terms. If you do not
              accept the revised Terms, your sole remedy is to cancel your Subscription before the effective date.
            </p>
            <p>
              <strong>Note about subscription prices:</strong> any price change requires at least 30 days&rsquo;
              notice (see Section 6) regardless of the 14-day rule above.
            </p>
          </Section>

          <Section id="governing-law" title="19. Governing Law and Jurisdiction">
            <p>
              These Terms are governed by and construed in accordance with the <strong>laws of India</strong>, without
              regard to its conflict-of-law principles.
            </p>
            <p>
              Subject to Section 20 (Dispute Resolution), the courts of <strong>Puducherry, India</strong> shall have
              exclusive jurisdiction over any dispute arising out of or in connection with these Terms or the Service.
            </p>
          </Section>

          <Section id="disputes" title="20. Dispute Resolution">
            <p>
              We hope to resolve any concern amicably. Before filing a lawsuit, both parties agree to attempt
              resolution in the following order:
            </p>
            <ol style={{ ...ulStyle, listStyle: 'decimal' }}>
              <li><strong>Direct discussion.</strong> Email your concern to <a href="mailto:hello@halohelm.com" style={linkStyle}>hello@halohelm.com</a>. We will respond within 7 business days and attempt a good-faith resolution within 30 days.</li>
              <li><strong>Mediation.</strong> If direct discussion fails, the parties agree to attempt mediation through a mediator mutually agreed upon, in Puducherry, India.</li>
              <li><strong>Litigation.</strong> Only if mediation fails or is refused by either party, the dispute may be brought before the courts of Puducherry.</li>
            </ol>
            <p>
              Nothing in this Section limits your right to file a consumer-protection complaint under the Consumer
              Protection Act, 2019 with the appropriate consumer commission, or to seek interim relief from any court
              of competent jurisdiction.
            </p>
          </Section>

          <Section id="miscellaneous" title="21. Miscellaneous">
            <ul style={ulStyle}>
              <li><strong>Entire agreement:</strong> these Terms (together with the Privacy Policy and any additional terms incorporated by reference) constitute the entire agreement between you and HaloHelm regarding the Service.</li>
              <li><strong>Severability:</strong> if any provision of these Terms is held unenforceable, the remaining provisions remain in full force.</li>
              <li><strong>No waiver:</strong> our failure to enforce any right or provision is not a waiver of that right.</li>
              <li><strong>Assignment:</strong> you may not assign your rights or obligations under these Terms without our written consent. We may assign our rights and obligations in the event of a merger, acquisition, or sale of the business.</li>
              <li><strong>Force majeure:</strong> neither party is liable for delays or failures caused by events beyond reasonable control (acts of God, war, terrorism, pandemics, government action, internet or power outages).</li>
              <li><strong>Notices:</strong> we may send notices to the email address registered on your Account. You should send formal notices to us by email at <a href="mailto:hello@halohelm.com" style={linkStyle}>hello@halohelm.com</a> and by post to the address in Section 22.</li>
              <li><strong>Independent contractor:</strong> nothing in these Terms creates a partnership, employment, franchise, or agency relationship between you and HaloHelm.</li>
              <li><strong>Language:</strong> these Terms are written in English. Any translation is provided for convenience only; the English version controls in case of any conflict.</li>
            </ul>
          </Section>

          <Section id="contact" title="22. Contact Us">
            <p>For any question about these Terms, please reach out:</p>
            <DetailBlock>
              <strong>HaloHelm</strong> (Prabu Sekar, Sole Proprietor)<br />
              UDYAM Registration: UDYAM-PY-03-0055722<br />
              No. 17, Shanthi House, S.M.V. Puram East, Villianur, Puducherry &mdash; 605110, India<br /><br />
              <strong>Email:</strong> <a href="mailto:hello@halohelm.com" style={linkStyle}>hello@halohelm.com</a><br />
              <strong>Website:</strong> <a href="https://halohelm.com" style={linkStyle}>halohelm.com</a>
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
// Shared presentational helpers (mirror those in privacy.js).
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

TermsOfService.getLayout = (page) => page;
