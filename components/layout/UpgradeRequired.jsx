// components/layout/UpgradeRequired.jsx
//
// Phase D — shown by FeatureShell when a viewer (owner or staff) opens a
// page their restaurant's plan doesn't include. The sidebar already
// hides / locks these items, but a direct URL or back-button could land
// someone here, so the page itself needs its own gate.
//
// Owner sees a "View plans" CTA that goes to /admin/subscription.
// Staff sees the same screen but with a "ask your owner" hint (staff
// can't pay).
import Link from 'next/link';
import { PLANS, canUseFeature } from '../../lib/plans';
import { PERMISSION_GROUPS } from '../../lib/permissions';

// Find the cheapest plan that includes this permKey — drives the
// "Upgrade to Growth" / "Upgrade to Pro" wording on the CTA.
function minPlanFor(permKey) {
  for (const p of PLANS) {
    if (Array.isArray(p.includedPerms) && p.includedPerms.includes(permKey)) return p;
  }
  return null;
}

// Pull the user-facing label for a permission key (e.g. 'promotions' →
// 'Promotions'). Falls back to the key itself if the permission isn't
// in PERMISSION_GROUPS (kitchen / waiter / analyticsAdvanced).
function labelFor(permKey) {
  for (const group of PERMISSION_GROUPS) {
    for (const p of group.perms) if (p.key === permKey) return p.label;
  }
  // Friendly fallbacks for perms not in PERMISSION_GROUPS.
  if (permKey === 'analyticsAdvanced') return 'Advanced analytics';
  return permKey;
}

export default function UpgradeRequired({ permKey, isAdmin = true }) {
  const required = minPlanFor(permKey);
  const featureLabel = labelFor(permKey);
  return (
    <div style={{
      minHeight: 'calc(100vh - 40px)', display: 'flex',
      alignItems: 'center', justifyContent: 'center',
      padding: '40px 24px', background: '#EDEDED',
      fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    }}>
      <div style={{
        maxWidth: 460, background: '#FFFFFF', borderRadius: 16, padding: '40px 36px',
        boxShadow: '0 4px 30px rgba(0,0,0,0.06)', textAlign: 'center',
      }}>
        <div style={{ fontSize: 50, lineHeight: 1, marginBottom: 18 }}>✨</div>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: '#1A1A1A', marginBottom: 10, letterSpacing: '-0.4px' }}>
          {featureLabel} is a {required ? required.name : 'higher-plan'} feature
        </h1>
        <p style={{ fontSize: 14, color: 'rgba(0,0,0,0.55)', lineHeight: 1.55, marginBottom: 26 }}>
          {isAdmin
            ? `Upgrade your plan to unlock ${featureLabel}${required ? ` and everything else on ${required.name}` : ''}. Your data and existing setup stay intact — the feature just turns on the moment payment goes through.`
            : `${featureLabel} is available on the ${required ? required.name : 'higher'} plan. Ask your owner / manager to upgrade.`}
        </p>
        {isAdmin && (
          <Link href="/admin/subscription" style={{
            display: 'inline-block', padding: '12px 22px', borderRadius: 10,
            background: '#1A1A1A', color: '#FFFFFF',
            fontWeight: 700, fontSize: 14, textDecoration: 'none',
          }}>View plans →</Link>
        )}
      </div>
    </div>
  );
}

// Convenience re-export — pages don't need this directly, but tests / future
// helpers might want to query the same logic without rendering.
export { minPlanFor, canUseFeature };
