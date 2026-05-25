// components/layout/FeatureShell.jsx
//
// Phase 8 (RBAC) Stage B — the layout switch every converted feature page
// uses: the owner gets the full AdminLayout (unchanged); a permission-scoped
// staff member gets StaffShell (sidebar filtered to what their role grants).
// Module-scope so the page content doesn't remount on re-render.
import AdminLayout from './AdminLayout';
import StaffShell from './StaffShell';

export default function FeatureShell({ isAdmin, active, children }) {
  return isAdmin
    ? <AdminLayout>{children}</AdminLayout>
    : <StaffShell active={active}>{children}</StaffShell>;
}
