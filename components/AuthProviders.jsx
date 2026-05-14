// components/AuthProviders.jsx
//
// Bundles the three Firebase auth context providers into one component so
// _app.js can pull them in via `next/dynamic` ONLY for the pages that
// actually need a signed-in user (admin / staff / superadmin).
//
// Why this exists (May 14 perf work): _app.js wraps every page. If it
// imported these providers statically, the firebase/auth SDK (~120-150KB)
// would land in the shared chunk that EVERY page loads — including the
// customer menu page, which is fully anonymous and never reads an auth
// context. Splitting them into a dynamically-imported component means the
// auth bundle becomes its own chunk, fetched only on non-customer routes.
//
// hooks/useAuth.js + hooks/useStaffAuth.js import from lib/firebaseAuth.js,
// so importing this file is what pulls firebase/auth into the graph.
import { AdminAuthProvider, SuperAdminAuthProvider } from '../hooks/useAuth';
import { StaffAuthProvider } from '../hooks/useStaffAuth';

export default function AuthProviders({ children }) {
  return (
    <AdminAuthProvider>
      <SuperAdminAuthProvider>
        <StaffAuthProvider>
          {children}
        </StaffAuthProvider>
      </SuperAdminAuthProvider>
    </AdminAuthProvider>
  );
}
