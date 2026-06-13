// pages/admin/staff-activity/[staffId].js
//
// Per-staff ACTIVITY DASHBOARD — full-page route (deep-link / bookmark).
// The actual view lives in <StaffActivityPanel> so the SAME content
// renders here AND in the click-a-card overlay on /admin/staff
// (13 Jun 2026). This page is just the chrome: FeatureShell + a back
// link + the panel.
//
// Access: owner + staff managers (useFeatureAccess('staff') — same
// trust tier as the roster + the trail's read rule).

import Head from 'next/head';
import { useRouter } from 'next/router';
import FeatureShell from '../../../components/layout/FeatureShell';
import { useFeatureAccess } from '../../../hooks/useFeatureAccess';
import StaffActivityPanel from '../../../components/StaffActivityPanel';

const A = {
  font: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
  cream: '#EDEDED', mutedText: 'rgba(0,0,0,0.55)', warningDim: '#A08656',
};

export default function StaffActivityDashboard() {
  const router = useRouter();
  const staffId = typeof router.query.staffId === 'string' ? router.query.staffId : null;
  const { ready, isAdmin, rid, scopedDb } = useFeatureAccess('staff');

  return (
    <FeatureShell ready={ready} isAdmin={isAdmin} active="/admin/staff" permKey="staff" planAllowsFeature={true}>
      <Head><title>Staff Activity — HaloHelm</title></Head>
      <div style={{ background: A.cream, minHeight: '100vh', fontFamily: A.font, padding: '24px 28px' }}>
        <div style={{ maxWidth: 1060, margin: '0 auto' }}>
          <button onClick={() => router.push('/admin/staff')} style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            background: 'none', border: 'none', cursor: 'pointer', padding: 0,
            fontSize: 12.5, fontWeight: 600, color: A.mutedText, fontFamily: A.font, marginBottom: 14,
          }}>← Staff</button>
          {ready && rid && staffId && (
            <StaffActivityPanel rid={rid} scopedDb={scopedDb} staffId={staffId} />
          )}
        </div>
      </div>
    </FeatureShell>
  );
}

StaffActivityDashboard.getLayout = (page) => page;
