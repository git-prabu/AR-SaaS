// components/layout/FeatureShell.jsx
//
// Phase 8 (RBAC) Stage B — the layout switch every converted feature page
// uses. While auth is still resolving (`ready` false) it renders a NEUTRAL
// loading screen — never AdminLayout or StaffShell — so the owner never
// flashes the staff portal (and charts/listeners don't mount into a shell
// that's about to be swapped). Once resolved, the owner gets AdminLayout;
// a permission-scoped staff member gets StaffShell.
import AdminLayout from './AdminLayout';
import StaffShell from './StaffShell';
import AuthLoading from './AuthLoading';
import UpgradeRequired from './UpgradeRequired';

// Phase D — plan-gating extension. When the page passes a `permKey` AND
// the hook's `planAllowsFeature` came back false (meaning the restaurant's
// current plan doesn't include this feature), we render the
// UpgradeRequired screen INSIDE the appropriate shell — sidebar / nav
// context is preserved, but the page itself is replaced with the upgrade
// CTA. `null` (still loading) and `true` (allowed) both render normally.
export default function FeatureShell({ ready = true, isAdmin, active, children, permKey, planAllowsFeature }) {
  if (!ready) return <AuthLoading />;
  const content = (planAllowsFeature === false && permKey)
    ? <UpgradeRequired permKey={permKey} isAdmin={isAdmin} />
    : children;
  return isAdmin
    ? <AdminLayout>{content}</AdminLayout>
    : <StaffShell active={active}>{content}</StaffShell>;
}
