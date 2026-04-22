import Head from 'next/head';
import { useEffect, useState, useMemo } from 'react';
import { useAuth } from '../../hooks/useAuth';
import AdminLayout from '../../components/layout/AdminLayout';
import { getRestaurantById } from '../../lib/db';
import { PLANS, normalizePlanId, BILLING_PERIOD_DAYS } from '../../lib/plans';
import toast from 'react-hot-toast';

// ═══ Aspire palette — same tokens as the rest of the admin chrome ═══
const INTER = "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
const A = {
  font: INTER,
  cream: '#EDEDED',
  ink: '#1A1A1A',
  shell: '#FFFFFF',
  shellDarker: '#F8F8F8',
  warning: '#C4A86D',
  warningDim: '#A08656',
  forest: '#1A1A1A',
  forestDarker: '#2A2A2A',
  forestText: '#EAE7E3',
  forestTextMuted: 'rgba(234,231,227,0.55)',
  forestTextFaint: 'rgba(234,231,227,0.35)',
  forestSubtleBg: 'rgba(255,255,255,0.04)',
  forestBorder: '1px solid rgba(255,255,255,0.06)',
  success: '#3F9E5A',
  successDim: '#2E7E45',
  danger: '#D9534F',
  dangerDim: '#A03A37',
  mutedText: 'rgba(0,0,0,0.55)',
  faintText: 'rgba(0,0,0,0.38)',
  subtleBg: 'rgba(0,0,0,0.04)',
  border: '1px solid rgba(0,0,0,0.06)',
  cardShadow: '0 1px 2px rgba(0,0,0,0.04), 0 4px 12px rgba(0,0,0,0.04)',
};

// Plan catalog comes from lib/plans.js (single source of truth). Edit prices
// and limits there, not here.

// ═══ Date formatter — accepts ISO string, Firestore timestamp, or Date ═══
function formatDate(input) {
  if (!input) return '';
  let d;
  if (typeof input === 'string') d = new Date(input);
  else if (input.seconds) d = new Date(input.seconds * 1000);
  else if (input.toDate) d = input.toDate();
  else d = new Date(input);
  if (isNaN(d)) return '';
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

// ═══ Inline usage bar component ═══
function UsageBar({ label, used, max, unit = '' }) {
  const pct = max > 0 ? Math.min(100, Math.round((used / max) * 100)) : 0;
  const color = pct > 80 ? A.danger : pct > 60 ? A.warning : A.success;
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
        <span style={{ fontSize: 12, color: A.mutedText, fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase' }}>{label}</span>
        <span style={{ fontSize: 12, color: A.faintText, fontFamily: "'JetBrains Mono', monospace", fontWeight: 700 }}>
          {used}{unit} / {max}{unit}
        </span>
      </div>
      <div style={{ height: 6, background: A.subtleBg, borderRadius: 3, overflow: 'hidden' }}>
        <div style={{ height: '100%', borderRadius: 3, background: color, width: `${pct}%`, transition: 'width 0.4s' }} />
      </div>
      <div style={{ fontSize: 10, color: A.faintText, marginTop: 4, fontWeight: 500 }}>
        {pct}% used
      </div>
    </div>
  );
}

export default function AdminSubscription() {
  const { userData } = useAuth();
  const rid = userData?.restaurantId;
  const restaurantName = userData?.restaurantName || 'Your Restaurant';

  const [restaurant, setRestaurant] = useState(null);
  const [loading, setLoading] = useState(true);
  const [paying, setPaying] = useState(null);

  useEffect(() => {
    if (!rid) return;
    getRestaurantById(rid)
      .then(r => { setRestaurant(r); setLoading(false); })
      .catch(err => { console.error('subscription load error:', err); setLoading(false); });
  }, [rid]);

  // ─── Razorpay upgrade flow — UNTOUCHED logic from b6fa233 ───────────
  const handleUpgrade = async (plan) => {
    if (!window.Razorpay) { toast.error('Payment system not loaded. Please refresh.'); return; }
    setPaying(plan.id);
    try {
      const res = await fetch('/api/payments/create-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ planId: plan.id, restaurantId: rid }),
      });
      const data = await res.json();
      if (!data.orderId) throw new Error('Could not create order');
      const options = {
        key: process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID,
        amount: plan.priceInPaise,
        currency: 'INR',
        name: 'Advert Radical',
        description: `${plan.name} Plan — monthly`,
        order_id: data.orderId,
        handler: async (response) => {
          await fetch('/api/payments/verify', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ...response, planId: plan.id, restaurantId: rid }),
          });
          toast.success(`Successfully upgraded to ${plan.name} plan!`);
          setRestaurant(await getRestaurantById(rid));
        },
        prefill: { email: userData?.email || '' },
        theme: { color: '#1A1A1A' },  // matches Aspire ink color
      };
      new window.Razorpay(options).open();
    } catch { toast.error('Payment failed. Try again.'); }
    finally { setPaying(null); }
  };

  // ─── Plan + status derivations ─────────────────────────────────────
  const computed = useMemo(() => {
    if (!restaurant) return null;

    // Trial detection — new signups have paymentStatus: 'trial' and trialEndsAt
    const isTrial = restaurant.paymentStatus === 'trial';
    const trialEnd = restaurant.trialEndsAt ? new Date(restaurant.trialEndsAt) : null;
    const trialDaysLeft = trialEnd ? Math.max(0, Math.ceil((trialEnd - Date.now()) / (1000 * 60 * 60 * 24))) : 0;
    const trialExpired = trialEnd ? trialEnd < new Date() : false;

    // Paid subscription state
    const subEnd = restaurant.subscriptionEnd ? new Date(restaurant.subscriptionEnd) : null;
    const subStart = restaurant.subscriptionStart ? new Date(restaurant.subscriptionStart) : null;
    const isExpired = subEnd && subEnd < new Date();
    const isActive = restaurant.paymentStatus === 'active';
    const daysRemaining = subEnd ? Math.max(0, Math.ceil((subEnd - Date.now()) / (1000 * 60 * 60 * 24))) : null;

    // Total subscription length (from start→end, defaults to BILLING_PERIOD_DAYS if no start)
    const totalDays = (subStart && subEnd)
      ? Math.max(1, Math.ceil((subEnd - subStart) / (1000 * 60 * 60 * 24)))
      : BILLING_PERIOD_DAYS;
    const usedDays = totalDays - (daysRemaining || 0);
    const timePct = Math.min(100, Math.max(0, Math.round((usedDays / totalDays) * 100)));

    // Current plan record — normalize legacy ids (basic/premium → starter/pro),
    // fall back to the first plan if unknown.
    const currentPlan = PLANS.find(p => p.id === normalizePlanId(restaurant.plan)) || PLANS[0];

    // Status pill: Trial > Active > Expired > Inactive
    let statusLabel, statusColor, statusBg, statusBorder;
    if (isTrial && !trialExpired) {
      statusLabel = 'Trial';
      statusColor = A.warning;
      statusBg = 'rgba(196,168,109,0.10)';
      statusBorder = 'rgba(196,168,109,0.30)';
    } else if (isActive && !isExpired) {
      statusLabel = 'Active';
      statusColor = A.success;
      statusBg = 'rgba(63,158,90,0.10)';
      statusBorder = 'rgba(63,158,90,0.30)';
    } else if (isExpired || trialExpired) {
      statusLabel = 'Expired';
      statusColor = A.danger;
      statusBg = 'rgba(217,83,79,0.10)';
      statusBorder = 'rgba(217,83,79,0.30)';
    } else {
      statusLabel = 'Inactive';
      statusColor = A.mutedText;
      statusBg = A.subtleBg;
      statusBorder = 'rgba(0,0,0,0.10)';
    }

    // Time-bar color uses the same severity scale: 14d urgent, 30d warn, else healthy
    const effectiveDaysLeft = isTrial ? trialDaysLeft : daysRemaining;
    const timeColor = effectiveDaysLeft === null ? A.success
      : effectiveDaysLeft <= 14 ? A.danger
      : effectiveDaysLeft <= 30 ? A.warning
      : A.success;

    return {
      currentPlan, isTrial, trialEnd, trialDaysLeft, trialExpired,
      subEnd, subStart, isExpired, isActive, daysRemaining,
      totalDays, usedDays, timePct, timeColor,
      statusLabel, statusColor, statusBg, statusBorder, effectiveDaysLeft,
    };
  }, [restaurant]);

  // ═════════════════════════════════════════════════════════════════════
  // RENDER
  // ═════════════════════════════════════════════════════════════════════
  return (
    <AdminLayout>
      <Head>
        <title>Subscription — Advert Radical</title>
        <script src="https://checkout.razorpay.com/v1/checkout.js" />
      </Head>
      <div style={{ background: A.cream, minHeight: '100vh', fontFamily: A.font }}>
        <style>{`
          @keyframes spin { to { transform: rotate(360deg); } }
          @keyframes pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.3; } }
          .ar-plan-card { transition: box-shadow 0.15s ease, transform 0.15s ease; }
          .ar-plan-card:hover { box-shadow: 0 4px 18px rgba(38,52,49,0.08); transform: translateY(-2px); }
          .ar-upgrade-btn:hover:not(:disabled) { transform: translateY(-1px); }
        `}</style>

        {/* ═══ HEADER ═══ */}
        <div style={{ padding: '24px 28px 0' }}>
          <div style={{ marginBottom: 18 }}>
            <div style={{ fontSize: 11, fontWeight: 500, color: A.faintText, marginBottom: 6, letterSpacing: '0.05em', display: 'flex', alignItems: 'center', gap: 6 }}>
              <span>Setup</span>
              <span style={{ opacity: 0.5 }}>›</span>
              <span style={{ color: A.mutedText }}>Subscription</span>
            </div>
            <div style={{ fontWeight: 600, fontSize: 28, color: A.ink, letterSpacing: '-0.5px', lineHeight: 1.1 }}>
              {restaurantName} <span style={{ color: A.mutedText, fontWeight: 500 }}>Subscription</span>
            </div>
            <div style={{ fontSize: 12, color: A.mutedText, marginTop: 4 }}>
              Manage your plan, view usage, and upgrade for more capacity.
            </div>
          </div>

          {/* ═══ SUBSCRIPTION — matte-black signature stat card ═══ */}
          {computed && (
            <div style={{
              background: `linear-gradient(135deg, ${A.forest} 0%, ${A.forestDarker} 100%)`,
              borderRadius: 14, padding: '20px 24px', marginBottom: 14,
              border: A.forestBorder,
              boxShadow: '0 4px 16px rgba(38,52,49,0.15)',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
                <div style={{
                  width: 7, height: 7, borderRadius: '50%',
                  background: computed.statusLabel === 'Active' || computed.statusLabel === 'Trial' ? A.warning : A.danger,
                  animation: 'pulse 2s ease infinite',
                  boxShadow: `0 0 8px ${computed.statusLabel === 'Active' || computed.statusLabel === 'Trial' ? 'rgba(196,168,109,0.6)' : 'rgba(217,83,79,0.6)'}`,
                }} />
                <span style={{ fontSize: 12, fontWeight: 600, letterSpacing: '0.10em', textTransform: 'uppercase', color: A.warning }}>SUBSCRIPTION</span>
                <div style={{ flex: 1, height: 1, background: 'rgba(234,231,227,0.08)' }} />
                <span style={{ fontSize: 11, color: A.forestTextMuted, fontWeight: 500 }}>
                  {computed.isTrial ? 'Free trial' : computed.isActive ? 'Live · billed monthly' : 'Inactive'}
                </span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
                {[
                  { label: 'CURRENT PLAN', value: computed.currentPlan.name, color: A.forestText },
                  { label: 'STATUS',       value: computed.statusLabel,       color: computed.statusColor === A.mutedText ? A.forestTextFaint : computed.statusColor },
                  {
                    label: computed.isTrial ? 'TRIAL ENDS IN' : 'DAYS LEFT',
                    value: computed.effectiveDaysLeft !== null ? computed.effectiveDaysLeft : '—',
                    color: computed.effectiveDaysLeft === null ? A.forestTextFaint
                      : computed.effectiveDaysLeft <= 14 ? A.danger
                      : computed.effectiveDaysLeft <= 30 ? A.warning
                      : A.success,
                    suffix: computed.effectiveDaysLeft !== null ? 'd' : '',
                  },
                  { label: 'AR ITEMS', value: `${restaurant?.itemsUsed || 0}/${restaurant?.maxItems || computed.currentPlan.maxItems}`, color: A.forestText },
                ].map(s => (
                  <div key={s.label} style={{
                    padding: '16px 18px', borderRadius: 10,
                    background: A.forestSubtleBg,
                    border: A.forestBorder,
                  }}>
                    <div style={{ fontSize: 11, fontWeight: 500, letterSpacing: '0.06em', textTransform: 'uppercase', color: A.forestTextFaint, marginBottom: 8 }}>
                      {s.label}
                    </div>
                    <div style={{ fontWeight: 700, fontSize: 28, lineHeight: 1, letterSpacing: '-0.5px', color: s.color, display: 'flex', alignItems: 'baseline', gap: 4 }}>
                      <span>{s.value}</span>
                      {s.suffix && <span style={{ fontSize: 14, color: A.forestTextMuted, fontWeight: 600 }}>{s.suffix}</span>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* ═══ MAIN CONTENT ═══ */}
        <div style={{ padding: '0 28px 60px' }}>
          {loading ? (
            <div style={{
              background: A.shell, borderRadius: 14, border: A.border, padding: '48px',
              textAlign: 'center', boxShadow: A.cardShadow,
            }}>
              <div style={{ width: 30, height: 30, border: `3px solid ${A.warning}`, borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto 12px' }} />
              <div style={{ fontSize: 13, color: A.mutedText, fontWeight: 600 }}>Loading subscription…</div>
            </div>
          ) : !restaurant ? (
            <div style={{
              background: A.shell, borderRadius: 14, border: A.border, padding: '48px',
              textAlign: 'center', boxShadow: A.cardShadow,
            }}>
              <div style={{ fontSize: 14, color: A.mutedText, fontWeight: 600 }}>Could not load restaurant data.</div>
            </div>
          ) : (
            <>
              {/* ═══ CURRENT PLAN DETAIL CARD ═══ */}
              <div style={{
                background: A.shell, borderRadius: 14,
                border: A.border, padding: '22px 26px',
                boxShadow: A.cardShadow,
                marginBottom: 14,
                borderLeft: `3px solid ${computed.timeColor}`,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
                  <div style={{ width: 7, height: 7, borderRadius: '50%', background: A.warning, boxShadow: '0 0 6px rgba(196,168,109,0.35)' }} />
                  <span style={{ fontSize: 12, fontWeight: 600, letterSpacing: '0.10em', textTransform: 'uppercase', color: A.warning }}>CURRENT PLAN</span>
                  <div style={{ flex: 1, height: 1, background: 'rgba(196,168,109,0.20)' }} />
                  <span style={{
                    padding: '2px 10px', borderRadius: 5,
                    background: computed.statusBg, color: computed.statusColor,
                    border: `1px solid ${computed.statusBorder}`,
                    fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase',
                    display: 'inline-flex', alignItems: 'center', gap: 5,
                  }}>
                    <span style={{
                      width: 6, height: 6, borderRadius: '50%',
                      background: computed.statusColor,
                    }} />
                    {computed.statusLabel}
                  </span>
                </div>

                {/* Plan name + price + dates */}
                <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 14, marginBottom: 18, flexWrap: 'wrap' }}>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 26, color: A.ink, letterSpacing: '-0.5px', lineHeight: 1.1 }}>
                      {computed.currentPlan.name}
                      {computed.isTrial && (
                        <span style={{ marginLeft: 10, fontSize: 12, fontWeight: 700, color: A.warningDim, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                          · Free Trial
                        </span>
                      )}
                    </div>
                    {/* Renews / Expired / Trial-ends date */}
                    {computed.isTrial && computed.trialEnd && (
                      <div style={{ fontSize: 12, marginTop: 4, color: computed.trialExpired ? A.dangerDim : A.mutedText, fontWeight: 500 }}>
                        {computed.trialExpired ? 'Trial expired on ' : 'Trial ends on '}
                        <strong style={{ color: A.ink }}>{formatDate(computed.trialEnd)}</strong>
                      </div>
                    )}
                    {!computed.isTrial && computed.subEnd && (
                      <div style={{ fontSize: 12, marginTop: 4, color: computed.isExpired ? A.dangerDim : A.mutedText, fontWeight: 500 }}>
                        {computed.isExpired ? 'Expired on ' : 'Renews on '}
                        <strong style={{ color: A.ink }}>{formatDate(computed.subEnd)}</strong>
                      </div>
                    )}
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
                    {computed.effectiveDaysLeft !== null && (
                      <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
                        <span style={{ fontWeight: 700, fontSize: 32, color: computed.timeColor, letterSpacing: '-0.5px', lineHeight: 1 }}>
                          {computed.effectiveDaysLeft}
                        </span>
                        <span style={{ fontSize: 12, color: A.mutedText, fontWeight: 600 }}>days left</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Time progress bar (only for paid plans, not trials) */}
                {!computed.isTrial && computed.subEnd && (
                  <div style={{ marginBottom: 18 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                      <span style={{ fontSize: 11, color: A.mutedText, fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase' }}>Plan duration</span>
                      <span style={{ fontSize: 11, color: A.faintText, fontFamily: "'JetBrains Mono', monospace", fontWeight: 700 }}>
                        {computed.isExpired ? 'Expired' : `${computed.daysRemaining} of ${computed.totalDays} days remaining`}
                      </span>
                    </div>
                    <div style={{ height: 6, background: A.subtleBg, borderRadius: 3, overflow: 'hidden' }}>
                      <div style={{
                        height: '100%', borderRadius: 3,
                        background: computed.isExpired ? A.danger : computed.timeColor,
                        width: `${computed.timePct}%`, transition: 'width 0.4s',
                      }} />
                    </div>
                  </div>
                )}

                {/* Renew warning banner — when 30 days or less remain */}
                {!computed.isTrial && !computed.isExpired && computed.daysRemaining !== null && computed.daysRemaining <= 30 && (
                  <div style={{
                    padding: '10px 14px', borderRadius: 10, marginBottom: 18,
                    background: computed.daysRemaining <= 14 ? 'rgba(217,83,79,0.06)' : 'rgba(196,168,109,0.08)',
                    border: `1px solid ${computed.daysRemaining <= 14 ? 'rgba(217,83,79,0.30)' : 'rgba(196,168,109,0.30)'}`,
                    fontSize: 12, color: computed.daysRemaining <= 14 ? A.dangerDim : A.warningDim,
                    fontWeight: 600,
                    display: 'flex', alignItems: 'center', gap: 8,
                  }}>
                    <span>{computed.daysRemaining <= 14 ? '⚠' : 'ℹ'}</span>
                    <span>
                      Your plan expires in <strong>{computed.daysRemaining} days</strong>. Upgrade below to continue uninterrupted access.
                    </span>
                  </div>
                )}

                {/* Trial-expiring warning — separate to differentiate from paid expiry */}
                {computed.isTrial && !computed.trialExpired && computed.trialDaysLeft <= 7 && (
                  <div style={{
                    padding: '10px 14px', borderRadius: 10, marginBottom: 18,
                    background: 'rgba(196,168,109,0.08)',
                    border: '1px solid rgba(196,168,109,0.30)',
                    fontSize: 12, color: A.warningDim, fontWeight: 600,
                    display: 'flex', alignItems: 'center', gap: 8,
                  }}>
                    <span>ℹ</span>
                    <span>
                      Your free trial ends in <strong>{computed.trialDaysLeft} day{computed.trialDaysLeft === 1 ? '' : 's'}</strong>. Pick a plan below to keep your menu live.
                    </span>
                  </div>
                )}

                {/* Trial-expired error banner */}
                {computed.isTrial && computed.trialExpired && (
                  <div style={{
                    padding: '10px 14px', borderRadius: 10, marginBottom: 18,
                    background: 'rgba(217,83,79,0.06)',
                    border: '1px solid rgba(217,83,79,0.30)',
                    fontSize: 12, color: A.dangerDim, fontWeight: 600,
                    display: 'flex', alignItems: 'center', gap: 8,
                  }}>
                    <span>⚠</span>
                    <span>
                      Your free trial has expired. Pick a plan to reactivate your menu.
                    </span>
                  </div>
                )}

                {/* Usage bars */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18 }}>
                  <UsageBar
                    label="AR Items"
                    used={restaurant.itemsUsed || 0}
                    max={restaurant.maxItems || computed.currentPlan.maxItems}
                  />
                  <UsageBar
                    label="Storage"
                    used={restaurant.storageUsedMB || 0}
                    max={restaurant.maxStorageMB || computed.currentPlan.maxStorageMB}
                    unit="MB"
                  />
                </div>
              </div>

              {/* ═══ UPGRADE PLANS ═══ */}
              <div style={{
                background: A.shell, borderRadius: 14,
                border: A.border, padding: '22px 26px',
                boxShadow: A.cardShadow,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                  <div style={{ width: 7, height: 7, borderRadius: '50%', background: A.warning, boxShadow: '0 0 6px rgba(196,168,109,0.35)' }} />
                  <span style={{ fontSize: 12, fontWeight: 600, letterSpacing: '0.10em', textTransform: 'uppercase', color: A.warning }}>
                    {computed.isTrial ? 'CHOOSE A PLAN' : 'AVAILABLE PLANS'}
                  </span>
                  <div style={{ flex: 1, height: 1, background: 'rgba(196,168,109,0.20)' }} />
                </div>
                <div style={{ fontSize: 12, color: A.mutedText, marginBottom: 18, lineHeight: 1.5 }}>
                  All plans are billed monthly. Pay securely via Razorpay (UPI, cards, netbanking). Your menu stays live the whole time.
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14 }}>
                  {PLANS.map(plan => {
                    const isCurrent = !computed.isTrial && plan.id === restaurant.plan;
                    const isPopular = !!plan.popular;
                    return (
                      <div key={plan.id} className="ar-plan-card" style={{
                        position: 'relative',
                        background: isCurrent ? 'rgba(63,158,90,0.04)' : A.shell,
                        borderRadius: 12,
                        border: isPopular
                          ? `2px solid ${A.warning}`
                          : isCurrent
                            ? `1px solid rgba(63,158,90,0.30)`
                            : A.border,
                        padding: '24px 22px 22px',
                        boxShadow: A.cardShadow,
                      }}>
                        {/* Popular badge */}
                        {isPopular && (
                          <div style={{
                            position: 'absolute', top: -11, left: '50%', transform: 'translateX(-50%)',
                            padding: '3px 14px',
                            background: `linear-gradient(135deg, ${A.warning}, ${A.warningDim})`,
                            color: A.shell,
                            fontSize: 10, fontWeight: 700,
                            borderRadius: 5,
                            letterSpacing: '0.08em', textTransform: 'uppercase',
                            boxShadow: '0 4px 12px rgba(196,168,109,0.35)',
                            whiteSpace: 'nowrap',
                          }}>
                            ★ Most Popular
                          </div>
                        )}

                        {/* Current badge */}
                        {isCurrent && (
                          <div style={{
                            position: 'absolute', top: 12, right: 12,
                            padding: '2px 8px', borderRadius: 4,
                            background: 'rgba(63,158,90,0.12)', color: A.success,
                            border: '1px solid rgba(63,158,90,0.30)',
                            fontSize: 9, fontWeight: 700,
                            letterSpacing: '0.06em', textTransform: 'uppercase',
                          }}>
                            Current
                          </div>
                        )}

                        {/* Plan name */}
                        <div style={{ fontWeight: 700, fontSize: 17, color: A.ink, marginBottom: 8, letterSpacing: '-0.3px' }}>
                          {plan.name}
                        </div>

                        {/* Price */}
                        <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, marginBottom: 18 }}>
                          <span style={{ fontWeight: 700, fontSize: 30, color: A.ink, letterSpacing: '-0.5px' }}>
                            ₹{plan.price.toLocaleString('en-IN')}
                          </span>
                          <span style={{ fontSize: 12, color: A.mutedText, fontWeight: 500 }}>
                            / {plan.period}
                          </span>
                        </div>

                        {/* Features */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 22 }}>
                          {[
                            `${plan.maxItems} AR menu items`,
                            `${plan.maxStorageMB >= 1024 ? (plan.maxStorageMB / 1024) + ' GB' : plan.maxStorageMB + ' MB'} storage for 3D models`,
                            'Real-time analytics',
                            'QR code generator + custom subdomain',
                            'Kitchen display + waiter calls',
                            'Customer feedback dashboard',
                          ].map(f => (
                            <div key={f} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 12, color: A.mutedText, lineHeight: 1.5 }}>
                              <span style={{
                                width: 14, height: 14, flexShrink: 0,
                                borderRadius: 4,
                                background: 'rgba(63,158,90,0.12)',
                                color: A.success,
                                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                                fontSize: 9, fontWeight: 800,
                                marginTop: 1,
                              }}>✓</span>
                              <span>{f}</span>
                            </div>
                          ))}
                        </div>

                        {/* Upgrade button */}
                        <button
                          onClick={() => !isCurrent && handleUpgrade(plan)}
                          disabled={isCurrent || paying === plan.id}
                          className="ar-upgrade-btn"
                          style={{
                            width: '100%', padding: '11px',
                            borderRadius: 9,
                            border: 'none',
                            background: isCurrent
                              ? A.subtleBg
                              : isPopular
                                ? `linear-gradient(135deg, ${A.warning}, ${A.warningDim})`
                                : A.ink,
                            color: isCurrent ? A.faintText : A.cream,
                            fontSize: 13, fontWeight: 700,
                            fontFamily: A.font,
                            cursor: isCurrent ? 'default' : (paying === plan.id ? 'not-allowed' : 'pointer'),
                            opacity: paying === plan.id ? 0.7 : 1,
                            boxShadow: isCurrent ? 'none' : isPopular
                              ? '0 4px 12px rgba(196,168,109,0.30)'
                              : '0 2px 6px rgba(0,0,0,0.10)',
                            transition: 'all 0.15s',
                            display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                          }}
                        >
                          {isCurrent ? 'Current Plan' : paying === plan.id ? (
                            <>
                              <span style={{ width: 11, height: 11, border: `2px solid ${A.cream}`, borderTopColor: 'transparent', borderRadius: '50%', display: 'inline-block', animation: 'spin 0.7s linear infinite' }} />
                              Opening…
                            </>
                          ) : (computed.isTrial ? 'Choose this plan' : 'Upgrade to ' + plan.name)}
                        </button>
                      </div>
                    );
                  })}
                </div>

                {/* Plan comparison footer */}
                <div style={{
                  marginTop: 16, padding: '12px 16px',
                  background: A.shellDarker, borderRadius: 10, border: A.border,
                  fontSize: 11, color: A.mutedText, lineHeight: 1.6,
                  display: 'flex', alignItems: 'flex-start', gap: 10,
                }}>
                  <span style={{ fontSize: 14, lineHeight: 1 }}>ℹ</span>
                  <span>
                    Need a custom plan or annual billing? Email <strong style={{ color: A.ink }}>support@advertradical.com</strong>. Plans renew automatically; you can change anytime.
                  </span>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </AdminLayout>
  );
}

AdminSubscription.getLayout = (page) => page;