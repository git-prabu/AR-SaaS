// pages/staff/home.js
//
// Phase 8 (RBAC) — the landing hub for a staff member with a custom access
// role. ALWAYS renders the StaffShell (never the bare kitchen station), and
// plainly shows what their role grants: features available now (clickable),
// features granted but not yet rolled out, and a clear message if their role
// has nothing. This both gives Managers a real home and makes permission
// problems visible instead of silently bouncing to kitchen / the login page.
import Head from 'next/head';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import StaffShell from '../../components/layout/StaffShell';
import { readStaffSession } from '../../lib/staffSession';
import { PERMISSION_GROUPS, PERMISSION_ROUTES, STAFF_ENABLED } from '../../lib/permissions';

const INTER = "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
const LABELS = Object.fromEntries(PERMISSION_GROUPS.flatMap(g => g.perms.map(p => [p.key, p.label])));
const ENABLED = new Set(STAFF_ENABLED);

export default function StaffHome() {
  const router = useRouter();
  const [session, setSession] = useState(null);
  const [checked, setChecked] = useState(false);

  useEffect(() => { setSession(readStaffSession()); setChecked(true); }, []);
  useEffect(() => { if (checked && !session) router.replace('/staff/login'); }, [checked, session, router]);

  const perms = Array.isArray(session?.perms) ? session.perms : [];
  const featurePerms = perms.filter(k => k !== 'kitchen' && k !== 'waiter');
  const liveNow = featurePerms.filter(k => ENABLED.has(k));
  const comingSoon = featurePerms.filter(k => !ENABLED.has(k));

  const card = { background: '#fff', border: '1px solid rgba(0,0,0,0.06)', borderRadius: 12, padding: '16px 18px', boxShadow: '0 1px 2px rgba(0,0,0,0.04), 0 4px 12px rgba(0,0,0,0.04)' };

  return (
    <>
      <Head><title>Home — HaloHelm Staff</title></Head>
      <StaffShell active="/staff/home">
        <div style={{ padding: '32px 28px', maxWidth: 760, fontFamily: INTER, color: '#1A1A1A' }}>
          <h1 style={{ fontSize: 26, fontWeight: 800, letterSpacing: '-0.5px', margin: '0 0 6px' }}>
            Welcome{session?.name ? `, ${session.name}` : ''}
          </h1>
          <p style={{ fontSize: 13.5, color: 'rgba(0,0,0,0.55)', margin: '0 0 22px' }}>
            {session?.restaurantName ? `${session.restaurantName} · ` : ''}Here's what your role gives you access to.
          </p>

          {liveNow.length > 0 && (
            <div style={{ marginBottom: 18 }}>
              <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#A08656', marginBottom: 10 }}>Available now</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 10 }}>
                {liveNow.map(k => (
                  <Link key={k} href={(PERMISSION_ROUTES[k] || '').replace('/admin/', '/staff/')} style={{ ...card, textDecoration: 'none', color: '#1A1A1A', fontWeight: 700, fontSize: 14.5, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                    {LABELS[k] || k} <span style={{ color: '#C4A86D' }}>→</span>
                  </Link>
                ))}
              </div>
            </div>
          )}

          {comingSoon.length > 0 && (
            <div style={{ ...card, marginBottom: 18 }}>
              <div style={{ fontSize: 13, fontWeight: 800, marginBottom: 6 }}>Coming soon</div>
              <div style={{ fontSize: 13, color: 'rgba(0,0,0,0.55)', lineHeight: 1.5 }}>
                Your role grants these, and they'll appear here as they're switched on: <b>{comingSoon.map(k => LABELS[k] || k).join(', ')}</b>.
              </div>
            </div>
          )}

          {featurePerms.length === 0 && (
            <div style={{ ...card, borderLeft: '4px solid #C4A86D' }}>
              <div style={{ fontSize: 14, fontWeight: 800, marginBottom: 6 }}>No features assigned yet</div>
              <div style={{ fontSize: 13, color: 'rgba(0,0,0,0.6)', lineHeight: 1.6 }}>
                Your access role doesn't grant any features yet. Ask your manager to tick what you should see on the
                <b> Roles &amp; Permissions</b> page, assign that role to you on the <b>Staff</b> page, then
                <b> sign out and sign back in</b> so the change takes effect.
              </div>
            </div>
          )}
        </div>
      </StaffShell>
    </>
  );
}

StaffHome.getLayout = (page) => page;
