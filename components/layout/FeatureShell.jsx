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

export default function FeatureShell({ ready = true, isAdmin, active, children }) {
  if (!ready) return <AuthLoading />;
  return isAdmin
    ? <AdminLayout>{children}</AdminLayout>
    : <StaffShell active={active}>{children}</StaffShell>;
}
